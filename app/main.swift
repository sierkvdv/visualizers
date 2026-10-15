import Cocoa
import WebKit
import ScreenCaptureKit
import Accelerate

// Vangt systeemaudio via ScreenCaptureKit en levert drie bandniveaus (bas, mid, hoog) in 0...1.
final class AudioTap: NSObject, SCStreamOutput, SCStreamDelegate {
    private let n = 2048
    private let log2n: vDSP_Length = 11
    private let queue = DispatchQueue(label: "fractal.audio")
    private let fft: FFTSetup
    private var window: [Float]
    private var ring: [Float]
    private var pos = 0
    private var sampleRate = 48000.0
    private var stream: SCStream?

    var onBands: ((Float, Float, Float) -> Void)?
    var onStatus: ((String) -> Void)?

    override init() {
        fft = vDSP_create_fftsetup(11, FFTRadix(FFT_RADIX2))!
        window = [Float](repeating: 0, count: 2048)
        ring = [Float](repeating: 0, count: 2048)
        vDSP_hann_window(&window, 2048, Int32(vDSP_HANN_NORM))
        super.init()
    }

    func start() async {
        do {
            let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
            guard let display = content.displays.first else {
                onStatus?("geen beeldscherm gevonden")
                return
            }
            let cfg = SCStreamConfiguration()
            cfg.capturesAudio = true
            cfg.excludesCurrentProcessAudio = true
            cfg.sampleRate = 48000
            cfg.channelCount = 2
            // video is verplicht maar ongebruikt: zo klein en traag mogelijk
            cfg.width = 2
            cfg.height = 2
            cfg.minimumFrameInterval = CMTime(value: 1, timescale: 1)

            let s = SCStream(filter: SCContentFilter(display: display, excludingWindows: []), configuration: cfg, delegate: self)
            try s.addStreamOutput(self, type: .audio, sampleHandlerQueue: queue)
            try s.addStreamOutput(self, type: .screen, sampleHandlerQueue: queue)
            try await s.startCapture()
            stream = s
            onStatus?("systeemaudio")
        } catch {
            let e = error as NSError
            NSLog("audio start mislukt: %@", e)
            let detail = "\(e.domain) \(e.code): \(e.localizedDescription)".filter { $0 != "\"" && $0 != "\\" && $0 != "\n" }
            onStatus?("NOACCESS " + detail)
        }
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        onStatus?("audio gestopt: \(error.localizedDescription)")
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sb: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .audio, sb.isValid else { return }
        var step = 1
        if let asbd = sb.formatDescription?.audioStreamBasicDescription {
            sampleRate = asbd.mSampleRate
            if asbd.mFormatFlags & kAudioFormatFlagIsNonInterleaved == 0 { step = Int(asbd.mChannelsPerFrame) }
        }
        try? sb.withAudioBufferList { abl, _ in
            guard let buf = abl.first, let data = buf.mData else { return }
            let count = Int(buf.mDataByteSize) / MemoryLayout<Float>.size
            let p = data.assumingMemoryBound(to: Float.self)
            var i = 0
            while i < count {
                ring[pos] = p[i]
                pos = (pos + 1) % n
                i += step
            }
        }
        analyse()
    }

    private func analyse() {
        var x = [Float](repeating: 0, count: n)
        for i in 0..<n { x[i] = ring[(pos + i) % n] * window[i] }
        var re = [Float](repeating: 0, count: n / 2)
        var im = [Float](repeating: 0, count: n / 2)
        var mags = [Float](repeating: 0, count: n / 2)
        re.withUnsafeMutableBufferPointer { rp in
            im.withUnsafeMutableBufferPointer { ip in
                var split = DSPSplitComplex(realp: rp.baseAddress!, imagp: ip.baseAddress!)
                x.withUnsafeBufferPointer { xp in
                    xp.baseAddress!.withMemoryRebound(to: DSPComplex.self, capacity: n / 2) {
                        vDSP_ctoz($0, 2, &split, 1, vDSP_Length(n / 2))
                    }
                }
                vDSP_fft_zrip(fft, &split, 1, log2n, FFTDirection(FFT_FORWARD))
                vDSP_zvmags(&split, 1, &mags, 1, vDSP_Length(n / 2))
            }
        }
        let hzPerBin = sampleRate / Double(n)
        // zelfde dB-schaal als de AnalyserNode in de browser (-100...-30 dB → 0...1)
        func band(_ lo: Double, _ hi: Double) -> Float {
            let i0 = max(1, Int(lo / hzPerBin)), i1 = min(n / 2 - 1, Int((hi / hzPerBin).rounded(.up)))
            var sum: Float = 0
            for i in i0...i1 {
                let db = 20 * log10(mags[i].squareRoot() / Float(n) + 1e-9)
                sum += min(1, max(0, (db + 100) / 70))
            }
            return sum / Float(i1 - i0 + 1)
        }
        onBands?(band(30, 150), band(150, 2000), band(2000, 9000))
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandler {
    var window: NSWindow!
    var webView: WKWebView!
    let tap = AudioTap()
    // Dezelfde schil dient voor meerdere visualizers: naam en ontwikkelmap komen uit Info.plist
    let appName = Bundle.main.object(forInfoDictionaryKey: "CFBundleName") as? String ?? "SamSo-Fractualizer"
    let devFolder = Bundle.main.object(forInfoDictionaryKey: "SamSoDevFolder") as? String ?? "fractal-visualizer"

    func applicationDidFinishLaunching(_ note: Notification) {
        let cfg = WKWebViewConfiguration()
        cfg.userContentController.add(self, name: "app")
        // 3D-figuren en texturen worden via XHR vanaf file:// geladen; zonder deze vlag blokkeert WebKit dat
        cfg.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
        webView = WKWebView(frame: .zero, configuration: cfg)

        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1280, height: 800),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable],
                          backing: .buffered, defer: false)
        window.title = appName
        window.backgroundColor = .black
        window.collectionBehavior = [.fullScreenPrimary]
        window.contentView = webView
        window.center()
        window.makeKeyAndOrderFront(nil)
        window.makeFirstResponder(webView)
        NSApp.activate(ignoringOtherApps: true)

        let menu = NSMenu()
        let appItem = NSMenuItem()
        appItem.submenu = NSMenu()
        appItem.submenu!.addItem(withTitle: "Stop \(appName)", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        menu.addItem(appItem)
        let viewItem = NSMenuItem()
        viewItem.submenu = NSMenu(title: "Weergave")
        let fs = viewItem.submenu!.addItem(withTitle: "Volledig scherm", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        fs.keyEquivalentModifierMask = [.control, .command]
        menu.addItem(viewItem)
        NSApp.mainMenu = menu

        // index.html naast de .app heeft voorrang: zo zijn visuals aan te passen zonder herbouw
        // (alleen in de ontwikkelmap, zodat een gedeelde app nooit een vreemde index.html laadt)
        let parent = Bundle.main.bundleURL.deletingLastPathComponent()
        let sibling = parent.appendingPathComponent("index.html")
        let useSibling = parent.lastPathComponent == devFolder && FileManager.default.fileExists(atPath: sibling.path)
        let html = useSibling ? sibling : Bundle.main.url(forResource: "index", withExtension: "html")!
        webView.loadFileURL(html, allowingReadAccessTo: html.deletingLastPathComponent())

        tap.onBands = { [weak self] b, m, t in
            DispatchQueue.main.async {
                self?.webView.evaluateJavaScript("window.nativeBands&&nativeBands(\(b),\(m),\(t))", completionHandler: nil)
            }
        }
        tap.onStatus = { [weak self] msg in
            DispatchQueue.main.async {
                // kort wachten zodat de pagina geladen is
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                    self?.webView.evaluateJavaScript("window.nativeStatus&&nativeStatus(\"\(msg)\")", completionHandler: nil)
                }
            }
        }
        // zonder toestemming: laat macOS de vraag tonen en de app in de privacy-lijst zetten
        if !CGPreflightScreenCaptureAccess() { CGRequestScreenCaptureAccess() }
        Task { await tap.start() }
    }

    func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) {
        switch message.body as? String {
        case "fullscreen": window.toggleFullScreen(nil)
        case "settings":
            NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")!)
        default: break
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()

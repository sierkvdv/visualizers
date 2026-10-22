# Analyseert rechtstreeks de VPS-radio voor het clubbeeld, zonder audio af te spelen.
# Onafhankelijk van OBS-monitoring, lokale speakers en HDMI-geluid.
import sys, time, json, urllib.request
sys.path.insert(0, r'C:\Users\Herstel\.clubcast-py')  # pakketten buiten AppData (de Claude-app is een MSIX)
import numpy as np

SR, N = 48000, 1024
BANDS = [(30, 150), (150, 2000), (2000, 12000)]  # zelfde indeling als de club
freqs = np.fft.rfftfreq(2 * N, 1 / SR)
idx = [np.where((freqs >= lo) & (freqs < hi))[0] for lo, hi in BANDS]
venster = np.hanning(2 * N)
# 12 log-banden 30 Hz-12 kHz (factor ~1,65 per band); een band zonder eigen bin krijgt de dichtstbijzijnde
RAND = 30 * 400 ** (np.arange(13) / 12)
IDX12 = []
for lo, hi in zip(RAND[:-1], RAND[1:]):
    i = np.where((freqs >= lo) & (freqs < hi))[0]
    IDX12.append(i if len(i) else np.array([int(np.argmin(np.abs(freqs - np.sqrt(lo * hi))))]))
VLAK = np.where((freqs >= 300) & (freqs < 3000))[0]  # spectrale vlakheid in het midden (vervormde gitaren = vlak)

def banden(buf):  # één blok: (bas, midden, hoog) voor nativeBands + 12 banden in dB + vlakheid 0..1 voor nativeSpectrum
    spec = np.abs(np.fft.rfft(buf * venster)) / N
    b, m, t = (float(np.sqrt(np.mean(spec[i] ** 2)) * k) for i, k in zip(idx, (40, 120, 240)))  # midden/hoog zijn zachter
    p = spec ** 2
    db = [round(float(10 * np.log10(np.sum(p[i]) + 1e-14)), 1) for i in IDX12]  # energie per band (som)
    pv = p[VLAK] + 1e-14
    vlak = round(float(np.exp(np.mean(np.log(pv))) / np.mean(pv)), 3)
    return b, m, t, db, vlak

def club():  # websocket naar het club-tabblad (opnieuw zoeken als het tabblad herlaadt)
    import websocket
    while True:
        try:
            tabs = json.load(urllib.request.urlopen('http://127.0.0.1:9333/json', timeout=3))
            t = next(t for t in tabs if t.get('type') == 'page' and 'club.sierk.dev' in t.get('url', ''))
            ws = websocket.create_connection(t['webSocketDebuggerUrl'], timeout=3, suppress_origin=True)  # Chrome weigert een Origin-kop
            ws.send(json.dumps({'id': 1, 'method': 'Runtime.evaluate', 'params': {'expression': "document.getElementById('status').textContent = 'radio-analyse'"}}))
            return ws
        except Exception:
            time.sleep(2)

class RadioRecorder:
    # Decode the same VPS radio as OBS, without opening any sound output device.
    # This remains available when local monitoring, speakers or HDMI audio stop.
    def __enter__(self):
        import subprocess, shutil
        executable=shutil.which('ffmpeg')
        if not executable:
            raise RuntimeError('ffmpeg missing for radio analysis')
        self.proc=subprocess.Popen([executable, '-hide_banner', '-loglevel', 'error',
            '-rw_timeout', '15000000', '-reconnect', '1', '-reconnect_streamed', '1',
            '-reconnect_delay_max', '5', '-probesize', '8192', '-analyzeduration', '500000',
            '-i', 'https://club.sierk.dev/live/stream', '-vn', '-f', 's16le',
            '-ar', str(SR), '-ac', '2', 'pipe:1'], stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL, creationflags=0x08000000)
        return self
    def record(self,numframes):
        data=self.proc.stdout.read(numframes*4)
        if len(data)!=numframes*4:
            raise RuntimeError('Radio analysis disconnected; reconnecting')
        return np.frombuffer(data,dtype='<i2').reshape(-1,2).astype(np.float32)/32768
    def __exit__(self,*args):
        self.proc.terminate()
        try:self.proc.wait(timeout=5)
        except Exception:self.proc.kill();self.proc.wait(timeout=5)



def main():
    ws, n, buf = club(), 2, np.zeros(2 * N)
    with RadioRecorder() as rec:
        while True:
            data = rec.record(numframes=N)
            mono = data.mean(axis=1) if data.ndim > 1 else data
            buf = np.concatenate([buf[N:], mono[-N:]]) if len(mono) >= N else buf
            b, m, t, db, vlak = banden(buf)
            rms_db = round(float(20 * np.log10(np.sqrt(np.mean(mono ** 2)) + 1e-10)), 1)
            n += 1
            try:
                if n % 240 == 0:
                    ws.send(json.dumps({'id': 9000001, 'method': 'Runtime.evaluate', 'params': {'expression': "JSON.stringify(window.clubVisualNext ? clubVisualNext.info() : {waiting:true})", 'returnByValue': True}}))
                ws.send(json.dumps({'id': n, 'method': 'Runtime.evaluate', 'params': {'expression':
                    f'window.clubAudioLevelDb={{db:{rms_db},time:Date.now(),source:"radio-direct"}};window.nativeBands&&nativeBands({b:.4f},{m:.4f},{t:.4f});window.nativeSpectrum&&nativeSpectrum({json.dumps(db)},{vlak})'}}))
                if n % 50 == 0:  # antwoorden weggooien zodat de buffer niet volloopt
                    ws.settimeout(0.001)
                    try:
                        while True:
                            response = json.loads(ws.recv())
                            if response.get('id') == 9000001:
                                value = response.get('result', {}).get('result', {}).get('value')
                                if value:
                                    from pathlib import Path
                                    Path(r'C:\Users\Herstel\.clubcast\vj-live-status.json').write_text(value, encoding='utf-8')
                    except Exception: pass
                    ws.settimeout(3)
            except Exception:
                ws = club()

if __name__ == '__main__':
    # scherm en pc wakker houden zolang dit draait: een screensaver of slapend scherm breekt het casten naar de tv af
    import ctypes
    ctypes.windll.kernel32.SetThreadExecutionState(0x80000000 | 0x00000002 | 0x00000001)  # ES_CONTINUOUS | ES_DISPLAY_REQUIRED | ES_SYSTEM_REQUIRED

    while True:  # bij een fout (ander geluidsapparaat, Chrome dicht) gewoon opnieuw
        try: main()
        except Exception as e:
            print('opnieuw:', e, flush=True); time.sleep(3)

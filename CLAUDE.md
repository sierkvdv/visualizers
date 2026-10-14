# visualizers (fork van SamSonight-Lab/visualizers)

- Twee audio-visualizers van SamSo: Fractualizer (`index.html`, root) en DiscoClub (`disco-club/index.html`, three.js r128 in `disco-club/lib`).
- Remotes: `origin` = sierkvdv/visualizers (fork, hier pushen), `upstream` = SamSonight-Lab (bijwerken: `git pull upstream main`).
- Mac-app: Swift-schil `app/main.swift` (WKWebView + systeemgeluid via `nativeBands`), bouwen met `sh app/build.sh` / `sh disco-club/app/build.sh`. Alleen op macOS 13+.
- Op Windows: gewoon de html in de browser via een lokale server (`python -m http.server 8090` in deze map, of launch.json "visualizers"). Geluid komt dan via getUserMedia: kies "Stereomix" of een loopback-apparaat voor het systeemgeluid, anders de microfoon.

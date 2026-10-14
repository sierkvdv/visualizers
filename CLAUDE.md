# visualizers (fork van SamSonight-Lab/visualizers)

- Twee audio-visualizers van SamSo: Fractualizer (`index.html`, root) en DiscoClub (`disco-club/index.html`, three.js r128 in `disco-club/lib`).
- Remotes: `origin` = sierkvdv/visualizers (fork, hier pushen), `upstream` = SamSonight-Lab (bijwerken: `git pull upstream main`).
- Mac-app: Swift-schil `app/main.swift` (WKWebView + systeemgeluid via `nativeBands`), bouwen met `sh app/build.sh` / `sh disco-club/app/build.sh`. Alleen op macOS 13+.
- Op Windows: gewoon de html in de browser via een lokale server (`python -m http.server 8090` in deze map, of launch.json "visualizers"). Geluid komt dan via getUserMedia: kies "Stereomix" of een loopback-apparaat voor het systeemgeluid, anders de microfoon.
- DiscoClub 3D-figuren: `disco-club/models/<pop|wizard|alien>-N.glb` + toevoegen aan `MODEL_FILES` (per soort) in index.html; mensen en tovenaars altijd 3D, aliens half 3D/half gebouwd. Blijvende server: poort 8091 (buiten de app gestart). Maken: plaatje via Runway (A-pose, heel figuur, grijze achtergrond; bron in `models/bron/`), dan Higgsfield `image_to_3d` met textuur+PBR+rigging+animatie (591 Hip_Hop_Dance), 20k polys = 38 credits, ~10 min. Clip loopt op de beat (aanname 120 bpm-clip).
- Extra dansjes: Higgsfield `3d_rigging` op de pop-1-GLB-url met `animation_action_id` = 8 credits; `python models/anim_only.py in.glb disco-club/models/dans-<id>.glb` haalt alleen de clip eruit (~200 KB) en zet hem in `DANCE_FILES`. Alle Meshy-rigs delen botnamen: elke clip past op elk figuur. Dansers wisselen elke 8/16 tellen van clip.
- Kleurvariatie zonder generatie: `recolorMat` deelt textuurpixels in (top/jas+schoenen/broek/haar/huid) en kleurt per figuur anders.

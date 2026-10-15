// --- Gang naar zaal 2: blacklight-tunnel met looplicht op de beat, lichtringen, neon-graffiti, kabels, vloerpijlen, een paarse poort en twee rokers ---
// Alles staat in `scene` (de gang is door de deur ook vanuit de zaal te zien), behalve de lamp (zone2); bewegen doet het elke frame via clubHooks.
(() => {
  const X0 = 7.8, X1 = 10.2, Z0 = DOOR2.z, Z1 = TUN_END, H = 3, GX = DOOR2.x, LEN = Z1 - Z0, ZC = (Z0 + Z1) / 2;  // gang: x 7.8..10.2, y 0..3, z 14..24
  const ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy());  // wanden zie je schuin: scherp houden
  const mtx = new THREE.Matrix4(), quat = new THREE.Quaternion(), eul = new THREE.Euler(), vP = new THREE.Vector3(), vS = new THREE.Vector3();
  const cA = new THREE.Color(), cB = new THREE.Color();
  const UVH = [0.8, 0.9, 0.52];  // tinten van het looplicht: violet, magenta, cyaan
  const BASE = new THREE.Color(0.09, 0.015, 0.26);  // blacklight-basis die altijd zacht brandt
  const hueOf = k => UVH[((k % 3) + 3) % 3];
  const frac = v => v - Math.floor(v);
  const SIGN_Z = 21.3, SIGN_Y = 2.7;  // onderkant 2.51 m: ook een lange alien loopt eronderdoor

  // de gang-doos had dichte koppen: bij zaal 2 liepen loper en camera door een muur. Alleen de vier zijden tekenen (index 0..23 = ±x, ±y).
  const tun = scene.children.find(o => o.isMesh && o.geometry && o.geometry.type === 'BoxGeometry' && o.geometry.parameters.width === 2.4 && o.geometry.parameters.depth === LEN && Math.abs(o.position.z - ZC) < 0.01);
  if (tun && tun.geometry.index && tun.geometry.index.count === 36) {
    tun.geometry.setDrawRange(0, 24);
    // zonder de kop bij de deur zag je vanuit de gang de hele zaal om het kozijn heen: de voorwand van achteren (zelfde beton, gat = de deur)
    const back = new THREE.MeshBasicMaterial({ map: tun.material.map, color: tun.material.color });
    for (const [x0, x1, y0, y1] of [[X0, 8.15, 0, H], [9.85, X1, 0, H], [8.15, 9.85, 2.5, H]]) {
      const g = new THREE.PlaneGeometry(x1 - x0, y1 - y0), p = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < p.count; i++) uv.setXY(i, ((x0 + x1) / 2 + p.getX(i) - X0) * 0.1, ((y0 + y1) / 2 + p.getY(i)) / H);  // zelfde maat als de gangwanden
      add(scene, g, back, [(x0 + x1) / 2, (y0 + y1) / 2, Z0 + 0.02]);  // kijkt naar +z, de gang in
    }
  }

  // --- neon-graffiti: blacklight-verf op beide wanden (canvas in centimeters: 970 x 290, zwart = doorzichtig want additief) ---
  const VW = 970, VH = 290;
  const PINK = '#ff2bd6', GREEN = '#39ff14', YEL = '#fff01f', CYAN = '#00f0ff', ORA = '#ff7a00', VIO = '#b04dff', RED = '#ff2050', COLS = [PINK, GREEN, YEL, CYAN, ORA, VIO];
  const FONT = '"Arial Black", Impact, sans-serif';
  function glow(g, col, lw, blur) {  // neonstreep: gekleurde gloed met een hete witte kern
    g.shadowColor = col; g.shadowBlur = blur; g.strokeStyle = col; g.lineWidth = lw; g.stroke();
    g.shadowBlur = blur * 0.3; g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = lw * 0.35; g.stroke();
  }
  function tag(g, txt, x, y, size, col, edge, rot, maxW) {  // dikke tag: gloeiende verf, gekleurde rand, witte kern; geeft de breedte terug
    g.save(); g.translate(x, y); g.rotate(rot || 0);
    g.font = `900 ${size}px ${FONT}`;
    const w0 = g.measureText(txt).width;
    if (maxW && w0 > maxW) { size *= maxW / w0; g.font = `900 ${size}px ${FONT}`; }
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.globalAlpha = 0.5; g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 28; g.fillText(txt, 0, 0);
    g.globalAlpha = 1; g.strokeStyle = edge; g.lineWidth = Math.max(1.2, size * 0.07); g.shadowColor = edge; g.shadowBlur = 16; g.strokeText(txt, 0, 0);
    g.shadowBlur = 4; g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = Math.max(0.6, size * 0.022); g.strokeText(txt, 0, 0);
    const w = g.measureText(txt).width;
    g.restore();
    return w;
  }
  function drips(g, x, y, w, col, n) {  // verfdruppels onder een tag
    g.save(); g.fillStyle = g.strokeStyle = col; g.shadowColor = col; g.shadowBlur = 8; g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const dx = x + rnd(-0.45, 0.45) * w, l = rnd(6, 34), lw = rnd(1.2, 2.8);
      g.globalAlpha = rnd(0.5, 0.95); g.lineWidth = lw;
      g.beginPath(); g.moveTo(dx, y); g.lineTo(dx, y + l); g.stroke();
      g.beginPath(); g.arc(dx, y + l, lw * 0.9, 0, TAU); g.fill();
    }
    g.restore();
  }
  function smiley(g, x, y, r, col) {  // acid-smiley: gloeiend gezicht, zwarte kruisjesogen en grijns (zwart = donkere wand)
    g.save(); g.translate(x, y); g.lineCap = g.lineJoin = 'round';
    g.beginPath(); g.arc(0, 0, r, 0, TAU);
    g.globalAlpha = 0.6; g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 30; g.fill(); g.globalAlpha = 1;
    glow(g, col, r * 0.08, 18);
    g.shadowBlur = 0; g.strokeStyle = '#000'; g.lineWidth = r * 0.1;
    g.beginPath();
    for (const ex of [-0.36, 0.36]) { g.moveTo(r * (ex - 0.13), -r * 0.42); g.lineTo(r * (ex + 0.13), -r * 0.16); g.moveTo(r * (ex + 0.13), -r * 0.42); g.lineTo(r * (ex - 0.13), -r * 0.16); }
    g.moveTo(r * 0.58 * Math.cos(0.15 * Math.PI), r * 0.05 + r * 0.58 * Math.sin(0.15 * Math.PI));
    g.arc(0, r * 0.05, r * 0.58, 0.15 * Math.PI, 0.85 * Math.PI);
    g.stroke();
    g.restore();
  }
  function spiral(g, x, y, r, c1, c2) {  // hypnose-spiraal in twee kleuren
    g.save(); g.translate(x, y); g.lineCap = 'round';
    for (const [col, off] of [[c1, 0], [c2, Math.PI]]) {
      g.beginPath();
      for (let a = 0; a <= 3.5 * TAU; a += 0.08) { const rr = r * a / (3.5 * TAU); g.lineTo(Math.cos(a + off) * rr, Math.sin(a + off) * rr); }
      glow(g, col, 3.2, 14);
    }
    g.restore();
  }
  function eye(g, x, y, s, col) {  // alziend oog in een driehoek met stralen
    g.save(); g.translate(x, y); g.lineJoin = g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, -s); g.lineTo(s * 0.95, s * 0.62); g.lineTo(-s * 0.95, s * 0.62); g.closePath(); glow(g, col, 3, 16);
    g.beginPath(); g.moveTo(-s * 0.48, s * 0.12); g.quadraticCurveTo(0, -s * 0.3, s * 0.48, s * 0.12); g.quadraticCurveTo(0, s * 0.52, -s * 0.48, s * 0.12); glow(g, col, 2.4, 12);
    g.beginPath(); g.arc(0, s * 0.12, s * 0.13, 0, TAU); g.fillStyle = '#ffffff'; g.shadowColor = col; g.shadowBlur = 22; g.fill();
    g.beginPath();
    for (let i = -4; i <= 4; i++) { const a = -Math.PI / 2 + i * 0.3; g.moveTo(Math.cos(a) * s * 1.2, Math.sin(a) * s * 1.2); g.lineTo(Math.cos(a) * s * 1.5, Math.sin(a) * s * 1.5); }
    glow(g, col, 2, 10);
    g.restore();
  }
  function shroom(g, x, y, s, cap, dots) {  // paddenstoel met stippen (onderkant op y)
    g.save(); g.translate(x, y); g.scale(s, s); g.lineJoin = 'round';
    g.beginPath(); g.moveTo(-9, 0); g.quadraticCurveTo(-13, -26, -7, -40); g.lineTo(7, -40); g.quadraticCurveTo(13, -26, 9, 0); g.closePath();
    g.globalAlpha = 0.35; g.fillStyle = '#e6d6ff'; g.fill(); g.globalAlpha = 1; glow(g, '#e6d6ff', 2, 10);
    g.beginPath(); g.moveTo(-38, -36); g.quadraticCurveTo(-38, -84, 0, -86); g.quadraticCurveTo(38, -84, 38, -36); g.quadraticCurveTo(0, -46, -38, -36);
    g.globalAlpha = 0.5; g.fillStyle = cap; g.shadowColor = cap; g.shadowBlur = 24; g.fill(); g.globalAlpha = 1; glow(g, cap, 3, 14);
    g.fillStyle = dots; g.shadowColor = dots; g.shadowBlur = 10;
    for (const [dx, dy, r] of [[-20, -60, 6], [4, -72, 7], [22, -56, 5], [-4, -50, 4], [-28, -46, 3], [26, -42, 3]]) { g.beginPath(); g.arc(dx, dy, r, 0, TAU); g.fill(); }
    g.restore();
  }
  function alienHead(g, x, y, s, col) {  // aliënhoofd met grote schuine zwarte ogen
    g.save(); g.translate(x, y); g.scale(s, s); g.lineJoin = 'round';
    g.beginPath(); g.moveTo(0, 48); g.bezierCurveTo(-30, 32, -46, -8, -40, -32); g.bezierCurveTo(-32, -60, 32, -60, 40, -32); g.bezierCurveTo(46, -8, 30, 32, 0, 48);
    g.globalAlpha = 0.45; g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 26; g.fill(); g.globalAlpha = 1; glow(g, col, 3, 14);
    g.shadowBlur = 0; g.fillStyle = '#000';
    for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(sx * 17, 0, 14, 7.5, -sx * 0.5, 0, TAU); g.fill(); }
    g.restore();
  }
  function arrowPaint(g, x0, x1, y, col) {  // gespoten pijl van x0 naar x1
    const d = Math.sign(x1 - x0);
    g.save(); g.lineCap = g.lineJoin = 'round';
    g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.moveTo(x1 - d * 20, y - 14); g.lineTo(x1, y); g.lineTo(x1 - d * 20, y + 14);
    glow(g, col, 5, 18);
    g.restore();
  }
  function sparkle(g, x, y, r, col) {  // sterretje
    g.save(); g.lineCap = 'round';
    g.beginPath(); g.moveTo(x - r, y); g.lineTo(x + r, y); g.moveTo(x, y - r); g.lineTo(x, y + r); glow(g, col, 1.4, 10);
    g.restore();
  }
  function splat(g, x, y, r, col) {  // verfspat
    g.save(); g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 14; g.globalAlpha = 0.6;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    for (let i = 0; i < 9; i++) { const a = rnd(0, TAU), d = r * rnd(1.4, 2.6); g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * rnd(0.12, 0.35), 0, TAU); g.fill(); }
    g.restore();
  }
  function noPhones(g, x, y) {  // stencil: geen telefoons op de vloer
    tag(g, 'NO PHONES', x, y, 24, YEL, YEL, 0, 150);
    tag(g, 'ON THE FLOOR', x, y + 26, 15, YEL, YEL, 0, 150);
    g.save(); g.translate(x, y + 90); g.lineCap = g.lineJoin = 'round';
    g.beginPath(); g.rect(-13, -24, 26, 48); g.moveTo(-5, -17); g.lineTo(5, -17); glow(g, CYAN, 3, 12);
    g.beginPath(); g.arc(0, 0, 36, 0, TAU); g.moveTo(-25, -25); g.lineTo(25, 25); glow(g, RED, 5, 18);
    g.restore();
  }
  function wallArt(side) {
    const tex = canvasTexture(2048, 512, (g, w, h) => {
      g.setTransform(w / VW, 0, 0, h / VH, 0, 0);  // tekenen in centimeters
      const wash = g.createLinearGradient(0, 0, 0, VH);  // violette blacklight-gloed langs plafond en vloer
      wash.addColorStop(0, 'rgba(130,50,255,0.32)'); wash.addColorStop(0.4, 'rgba(70,20,190,0.05)'); wash.addColorStop(0.75, 'rgba(70,20,190,0.05)'); wash.addColorStop(1, 'rgba(150,40,255,0.26)');
      g.fillStyle = wash; g.fillRect(0, 0, VW, VH);
      for (let i = 0; i < 6; i++) splat(g, rnd(30, VW - 30), rnd(30, 250), rnd(3, 7), pick(COLS));
      if (side === 0) {  // wand x=7.8: links = einde bij zaal 2 (z 23.85), rechts = de deur (z 14.15)
        eye(g, 65, 105, 45, CYAN);
        const w1 = tag(g, 'DEEPER', 245, 100, 52, GREEN, PINK, -0.07, 220); drips(g, 245, 118, w1, GREEN, 9);
        arrowPaint(g, 335, 165, 168, PINK);
        spiral(g, 440, 108, 52, PINK, CYAN);
        smiley(g, 610, 96, 44, YEL); drips(g, 610, 140, 60, YEL, 5);
        tag(g, 'ACID', 715, 165, 38, PINK, YEL, 0.12, 110);
        noPhones(g, 880, 78);
        tag(g, 'BLOODLINE PROJECT', 300, 250, 15, RED, RED, 0);
        tag(g, 'SAMSO WAS HERE', 760, 255, 13, CYAN, CYAN, -0.05);
      } else {  // wand x=10.2: links = de deur (z 14.15), rechts = einde bij zaal 2 (z 23.85)
        let w1 = tag(g, 'SAMSO', 120, 100, 54, CYAN, PINK, -0.06, 200); drips(g, 120, 118, w1, CYAN, 8);
        shroom(g, 240, 262, 0.9, ORA, YEL); shroom(g, 292, 266, 0.6, PINK, CYAN);
        w1 = tag(g, '303', 500, 98, 80, GREEN, YEL, 0.04, 190); drips(g, 500, 124, w1, GREEN, 7);
        tag(g, 'ACID HOUSE', 500, 160, 20, YEL, YEL, 0.04);
        alienHead(g, 680, 108, 1.05, GREEN);
        tag(g, 'DEEPER', 870, 92, 40, VIO, PINK, -0.05, 170);
        arrowPaint(g, 790, 950, 138, YEL);
        tag(g, 'P.L.U.R.', 585, 240, 16, PINK, PINK, 0);
      }
      for (let i = 0; i < 36; i++) sparkle(g, rnd(10, VW - 10), rnd(15, 240), rnd(2, 6), pick(COLS));
    });
    tex.anisotropy = ANISO;
    return tex;
  }
  // vlakken net binnen de wanden, naar binnen gericht (y 0.05..2.95, z 14.15..23.85); pijlen wijzen op beide wanden naar zaal 2
  const artMats = [0, 1].map(s => new THREE.MeshBasicMaterial({ map: wallArt(s), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  const artGeo = new THREE.PlaneGeometry(LEN - 0.3, H - 0.1);
  add(scene, artGeo, artMats[0], [X0 + 0.02, H / 2, ZC]).rotation.y = Math.PI / 2;
  add(scene, artGeo, artMats[1], [X1 - 0.02, H / 2, ZC]).rotation.y = -Math.PI / 2;

  // --- blacklight-ledstrips langs beide vloerranden: looplicht dat op elke tel naar zaal 2 rent ---
  const LED_N = 38;
  const leds = new THREE.InstancedMesh(BOX, additive(0xffffff), LED_N * 2);
  leds.frustumCulled = false;  // de bol van de basisgeometrie ligt op de oorsprong, niet in de gang
  for (let s = 0; s < 2; s++) for (let i = 0; i < LED_N; i++) {
    mtx.compose(vP.set(s ? X1 - 0.07 : X0 + 0.07, 0.02, Z0 + 0.25 + i * (LEN - 0.5) / (LED_N - 1)), quat.identity(), vS.set(0.05, 0.025, 0.17));
    leds.setMatrixAt(s * LED_N + i, mtx); leds.setColorAt(s * LED_N + i, cA.setRGB(0, 0, 0));
  }
  scene.add(leds);

  // --- lichtringen: dunne neonbuizen rond de doorsnede die na elkaar oplichten; de laatste is de poort naar zaal 2 ---
  const RING_Z = [15.2, 17.4, 19.6, 21.8, Z1 - 0.15], NR = RING_Z.length;
  const haloTex = canvasTexture(64, 4, (g, w, h) => {  // zachte gloed: helder in het midden, uitlopend naar de randen
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.22)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(0.65, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const rings = new THREE.InstancedMesh(BOX, additive(0xffffff), NR * 3);
  const halos = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), (NR - 1) * 3);
  rings.frustumCulled = halos.frustumCulled = false;
  RING_Z.forEach((z, r) => {
    // buis: twee staanders tegen de wanden en een ligger onder het plafond
    [[X0 + 0.04, H / 2, 0.035, H - 0.08], [X1 - 0.04, H / 2, 0.035, H - 0.08], [GX, H - 0.04, X1 - X0 - 0.08, 0.035]].forEach(([x, y, sx, sy], p) => {
      mtx.compose(vP.set(x, y, z), quat.identity(), vS.set(sx, sy, 0.05));
      rings.setMatrixAt(r * 3 + p, mtx); rings.setColorAt(r * 3 + p, cA.setRGB(0, 0, 0));
    });
    if (r === NR - 1) return;  // de poortring krijgt de poortgloed, geen halo (die zou zaal 2 in steken)
    // gloed op de wanden (naar binnen) en het plafond (naar beneden), 1.1 m breed langs z
    [[X0 + 0.03, H / 2, 0, Math.PI / 2, 0, H - 0.06], [X1 - 0.03, H / 2, 0, -Math.PI / 2, 0, H - 0.06], [GX, H - 0.03, Math.PI / 2, 0, Math.PI / 2, X1 - X0 - 0.06]].forEach(([x, y, rx, ry, rz, sh], p) => {
      mtx.compose(vP.set(x, y, z), quat.setFromEuler(eul.set(rx, ry, rz)), vS.set(1.1, sh, 1));
      halos.setMatrixAt(r * 3 + p, mtx); halos.setColorAt(r * 3 + p, cA.setRGB(0, 0, 0));
    });
  });
  scene.add(rings, halos);

  // --- gloeiende pijlen op de vloer (strook op de looplijn): drie chevrons per tegel, punt naar zaal 2 ---
  const arrowTex = canvasTexture(128, 512, (g, w) => {  // punt naar beneden in het canvas = naar +z in de gang
    g.lineCap = g.lineJoin = 'round'; g.lineWidth = 11; g.strokeStyle = '#ffffff'; g.shadowColor = '#ffffff'; g.shadowBlur = 14;
    for (let i = 0; i < 3; i++) {
      const y = 150 + i * 72;
      g.globalAlpha = 0.35 + i * 0.3;  // de voorste het felst
      g.beginPath(); g.moveTo(w * 0.16, y); g.lineTo(w * 0.5, y + 44); g.lineTo(w * 0.84, y); g.stroke();
    }
  });
  arrowTex.wrapS = arrowTex.wrapT = THREE.RepeatWrapping; arrowTex.repeat.set(1, 4); arrowTex.anisotropy = ANISO;
  const arrowMat = new THREE.MeshBasicMaterial({ map: arrowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  add(scene, new THREE.PlaneGeometry(0.7, LEN - 0.6), arrowMat, [GX, 0.012, ZC]).rotation.x = -Math.PI / 2;

  // --- de poort: paarse randgloed en een draaiende spiraal over de opening naar zaal 2 (additief: je kijkt er doorheen) ---
  const portalMat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, amp: { value: 0.5 }, col: { value: new THREE.Color(0x9a30ff) } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float time, amp; uniform vec3 col; varying vec2 vUv;
      void main() {
        vec2 m = vec2(2.4, 3.0);
        vec2 p = (vUv - 0.5) * m;
        vec2 e = min(vUv, 1.0 - vUv) * m;  // afstand tot de rand in meters
        float d = min(e.x, e.y);
        float rim = exp(-d * 4.0) + 0.5 * exp(-d * 14.0);
        float r = length(p), a = atan(p.y, p.x);
        float arms = smoothstep(0.4, 1.0, sin(a * 3.0 + r * 6.0 - time * 2.2));  // drie draaiende spiraalarmen
        float swirl = arms * smoothstep(0.25, 1.6, r) * 0.55;  // midden blijft doorzichtig
        vec3 c = col * rim * 1.4 + mix(col, vec3(0.15, 0.85, 1.0), 0.5 + 0.5 * sin(r * 3.0 - time * 1.3)) * swirl;
        gl_FragColor = vec4(c * amp, 1.0);
      }`
  });
  add(scene, new THREE.PlaneGeometry(X1 - X0, H), portalMat, [GX, H / 2, Z1 - 0.06]).rotation.y = Math.PI;  // kijkt naar de gang (-z)

  // --- neonbord aan twee kettinkjes boven de looplijn (onderkant 2.51 m) ---
  const sign = neonSign('GO DEEPER', PINK, 1.5, 0.375);
  sign.position.set(GX, SIGN_Y, SIGN_Z); sign.rotation.y = Math.PI; scene.add(sign);

  // --- kabels: goot met een bundel langs de wand x=7.8, losse doorhangende kabels langs x=10.2, haakjes en kettinkjes; één geometrie ---
  function merge(geos) {  // losse stukken samen in één geometrie (één draw call)
    let nv = 0, ni = 0;
    for (const g of geos) { nv += g.attributes.position.count; ni += g.index.count; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), idx = new Uint32Array(ni);
    let ov = 0, oi = 0;
    for (const g of geos) {
      pos.set(g.attributes.position.array, ov * 3); nor.set(g.attributes.normal.array, ov * 3);
      const ix = g.index.array;
      for (let i = 0; i < ix.length; i++) idx[oi + i] = ix[i] + ov;
      ov += g.attributes.position.count; oi += ix.length; g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setIndex(new THREE.BufferAttribute(idx, 1));
    return out;
  }
  const GAP = 2.5;  // haken om de 2,5 m
  const sag = (x, y, s, ph) => {  // kabel langs de hele gang die tussen de haken doorhangt (elke overspanning iets anders)
    const pts = [];
    for (let i = 0; i <= 48; i++) {
      const z = Z0 + 0.04 + i * (LEN - 0.08) / 48, t = frac((z - Z0) / GAP), span = Math.floor((z - Z0) / GAP);
      pts.push(new THREE.Vector3(x + 0.025 * Math.sin(z * 1.9 + ph), y - s * 4 * t * (1 - t) * (0.8 + 0.4 * Math.sin(span * 2.1 + ph)), z));
    }
    return pts;
  };
  const darkParts = [], elParts = [];
  const tube = (list, pts, r) => list.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 96, r, 5, false));
  const box = (w, h, d, x, y, z) => darkParts.push(new THREE.BoxGeometry(w, h, d).translate(x, y, z));
  box(0.28, 0.02, LEN - 0.1, 8.01, 2.85, ZC);  // kabelgoot (x 7.87..8.15)
  box(0.01, 0.06, LEN - 0.1, 7.875, 2.87, ZC); box(0.01, 0.06, LEN - 0.1, 8.145, 2.87, ZC);  // opstaande randjes
  for (let k = 0; k <= 4; k++) box(0.34, 0.035, 0.03, 7.98, 2.825, Math.min(Z1 - 0.1, Math.max(Z0 + 0.1, Z0 + k * GAP)));  // beugels uit de wand, op de ophangpunten van de bundel
  for (let k = 1; k < 4; k++) box(0.03, 0.06, 0.03, 10.06, 2.95, Z0 + k * GAP);  // plafondhaken
  for (const [x, s, r, ph] of [[7.93, 0.08, 0.016, 0.3], [8.0, 0.13, 0.02, 1.9], [8.08, 0.06, 0.012, 3.1]]) tube(darkParts, sag(x, 2.83, s, ph), r);  // bundel onder de goot
  for (const [x, s, r, ph] of [[10.0, 0.2, 0.012, 0.7], [10.05, 0.3, 0.017, 2.4], [9.97, 0.15, 0.01, 4.2]]) tube(darkParts, sag(x, 2.94, s, ph), r);  // losse kabels, laagste punt ~2.58 m
  const chain = H - (SIGN_Y + 0.1875);  // van de bovenkant van het bord tot het plafond
  for (const dx of [-0.55, 0.55]) darkParts.push(new THREE.CylinderGeometry(0.006, 0.006, chain, 5).translate(GX + dx, H - chain / 2, SIGN_Z));  // kettinkjes van het bord
  tube(elParts, sag(10.03, 2.935, 0.25, 5.3), 0.007);  // el-draad tussen de losse kabels
  tube(elParts, sag(8.04, 2.83, 0.1, 0.9), 0.006);  // en een in de bundel
  add(scene, merge(darkParts), std(0x0e0d12, 0.5, 0.4));
  const elMat = additive(0x39ff14);
  add(scene, merge(elParts), elMat);

  // --- blacklight-nevel: een paar trage rookwolken die naar zaal 2 drijven ---
  const haze = [];
  for (let i = 0; i < 7; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex[i % 3], color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    const s = rnd(1.5, 2.1); sp.scale.set(s, s * 0.7, 1);
    sp.position.set(rnd(8.5, 9.5), rnd(1.8, 2.5), Z0 + 0.8 + i * (LEN - 1.6) / 6);
    sp.material.rotation = rnd(0, TAU);
    scene.add(sp); haze.push({ sp, v: rnd(0.08, 0.16), spin: rnd(-0.08, 0.08) });
  }

  // één violette lamp voor de rokers en kabels; in zone2, dus alleen aan (en alleen kosten) als de camera bij de deur of verder is
  const uvLamp = new THREE.PointLight(0x9a40ff, 1, 7, 1.5); uvLamp.position.set(GX, 2.5, 18.4); zone2.add(uvLamp);

  // --- twee rokers tegen de wanden, schuin naar elkaar: kletsen en af en toe een trekje (looplijn x=9 blijft vrij) ---
  const SPOTS = [
    { x: X0 + 0.37, z: 18.7, face: 2.0, acts: ['Stand_and_Chat', 'Stand_and_Drink'] },  // wand x=7.8, kijkt naar de ander en een beetje naar de deur
    { x: X1 - 0.37, z: 17.6, face: -1.2, acts: ['Stand_and_Chat', 'Stand_and_Chat', 'Stand_and_Drink'] },  // wand x=10.2 (niet bellen: index.html geeft bellers ook nooit iets in de hand)
  ];
  const rokers = [];
  let rokersMade = false;
  // alleen gewone mensen: aliens zijn te breed voor de gang en de hoedrand van tovenaar/heks steekt door de muur (geen terugval naar andere figuren)
  const plain = () => allModels().filter(M => !M.keep && /pop-1|man-1/.test(M.file));
  function makeRokers() {  // één keer, zodra de figuren en handelingen geladen zijn
    rokersMade = true;
    let ms = plain();
    ms = ms.slice().sort(() => Math.random() - 0.5);
    SPOTS.forEach((s, i) => {
      const d = makeModelDancer(ms[i % ms.length], true);
      d.root.traverse(o => { o.castShadow = false; });
      d.home.set(s.x, 0, s.z); d.face = s.face; d.acts = s.acts;
      setClip(d, ACTS.Stand_and_Chat, 0.1); d.actT = rnd(5, 10);  // eerst kletsen (die clip is zeker geladen), anders soms seconden in A-pose
      pose(d, beatPos, energy, 0);  // meteen in houding
      giveDrink(d, 'sigaret');  // linkerhand: bij Stand_and_Drink gaat die naar de mond = trekje
      rokers.push(d);
    });
  }

  // niet in de muur: na de houding de botten meten en de roker zo nodig van de wand af schuiven (alleen weg van de muur,
  // nooit terug, dus na een paar tellen staat hij stil op een plek waar ook zijn verste beweging vrij blijft)
  // straal van het vlees rond elk bot (m, bij 1,75 m lengte): de romp is breder dan een hand
  const BOTTEN = { Hips: 0.2, Spine02: 0.2, Head: 0.14, LeftShoulder: 0.12, RightShoulder: 0.12, LeftForeArm: 0.07, RightForeArm: 0.07,
                   LeftHand: 0.06, RightHand: 0.06, LeftLeg: 0.08, RightLeg: 0.08, LeftFoot: 0.08, RightFoot: 0.08 };
  const wv = new THREE.Vector3();
  function wandvrij(d) {
    if (!d.wb) { d.wb = []; d.body.traverse(o => { if (BOTTEN[o.name]) d.wb.push(o); }); }
    if (!d.wb.length) return;
    d.root.updateMatrixWorld(true);
    const k = Math.abs(d.body.scale.y) * (d.M ? d.M.h : 1.75) / 1.75;
    let lo = Infinity, hi = -Infinity;
    for (const b of d.wb) { b.getWorldPosition(wv); const r = BOTTEN[b.name] * k + 0.03; lo = Math.min(lo, wv.x - r); hi = Math.max(hi, wv.x + r); }
    const dx = Math.max(0, X0 - lo) - Math.max(0, hi - X1);
    if (Math.abs(dx) > 0.002) { d.px = (d.px || 0) + dx; d.root.position.x += dx; }
  }

  // --- per frame: alles op de muziek ---
  let flickEnd = 0;
  function animate(dt, now) {
    const kick = pulse, en = 0.35 + 0.65 * energy, lo = bands[0].v, mid = bands[1].v, hi = bands[2].v, base = 0.7 + 0.6 * lo;
    // looplicht: elke tel vertrekt bij de deur een lichtpakket dat in twee tellen naar zaal 2 rent (kleur wisselt per pakket)
    for (let i = 0; i < LED_N; i++) {
      const x = beatPos - 2 * i / (LED_N - 1), k = Math.floor(x), h = Math.exp(-(x - k) * 6) * en * (0.7 + 0.6 * kick), hot = h * h * 0.4;
      cA.setHSL(hueOf(k), 1, 0.55).multiplyScalar(h);
      cA.r += BASE.r * base + hot; cA.g += BASE.g * base + hot; cA.b += BASE.b * base + hot;
      leds.setColorAt(i, cA); leds.setColorAt(LED_N + i, cA);
    }
    leds.instanceColor.needsUpdate = true;
    // ringen lichten op als het pakket erlangs komt; de poortring gloeit paars op de kick
    for (let r = 0; r < NR; r++) {
      if (r === NR - 1) cA.setHSL(0.78, 1, 0.55).multiplyScalar(0.6 + 0.9 * kick);
      else {
        const x = beatPos - 2 * (RING_Z[r] - Z0) / LEN, k = Math.floor(x), h = Math.exp(-(x - k) * 4) * en;
        cA.setHSL(hueOf(k), 1, 0.55).multiplyScalar(h * 1.4);
        cA.r += BASE.r * base * 0.6; cA.g += BASE.g * base * 0.6; cA.b += BASE.b * base * 0.6;
        cB.copy(cA).multiplyScalar(0.5);
        for (let p = 0; p < 3; p++) halos.setColorAt(r * 3 + p, cB);
      }
      for (let p = 0; p < 3; p++) rings.setColorAt(r * 3 + p, cA);
    }
    rings.instanceColor.needsUpdate = halos.instanceColor.needsUpdate = true;
    // graffiti: blacklight-verf die op de mids ademt en op de kick oplicht
    const paint = 0.5 + 0.35 * mid + 0.4 * kick;
    artMats[0].color.setScalar(paint * (0.95 + 0.08 * Math.sin(now * 0.9)));
    artMats[1].color.setScalar(paint * (0.95 + 0.08 * Math.sin(now * 0.9 + 2)));
    // vloerpijlen springen op elke tel een chevron verder naar zaal 2; kleur wisselt om de 8 tellen
    const bi = Math.floor(beatPos), hop = 1 - Math.pow(1 - Math.min(1, (beatPos - bi) / 0.35), 3);
    arrowTex.offset.y = ((((bi % 8) + 8) % 8) + hop) * 0.125;
    arrowMat.color.setHSL(hueOf(Math.floor(bi / 8)), 1, 0.55).multiplyScalar(0.45 + 0.8 * kick);
    // poort: pulseert op de kick en wordt feller naarmate de camera door de gang nadert
    const cz = camera.position.z, inGang = Math.abs(camera.position.x - GX) < 1.8 && cz < Z1;
    const near = inGang ? THREE.MathUtils.smoothstep(cz, Z0 + 2, Z1 - 0.4) : 0;
    portalMat.uniforms.time.value = now;
    portalMat.uniforms.amp.value = (0.45 + 0.7 * kick + 0.3 * energy) * (1 + 1.2 * near);
    // el-draad: langzaam door de kleuren, flikkert op de hi-hats
    elMat.color.setHSL(frac(now * 0.07), 1, 0.5).multiplyScalar(0.25 + 1.4 * hi);
    // nevel drijft naar zaal 2 (onzichtbaar aan de uiteinden, dus het terugzetten zie je niet) en zwelt op de bas
    for (const s of haze) {
      const p = s.sp.position;
      p.z += s.v * dt; if (p.z > Z1 - 0.8) p.z = Z0 + 0.8;
      const fade = Math.max(0, Math.min(1, (p.z - Z0 - 0.8) / 1.5, (Z1 - 0.8 - p.z) / 1.5));
      s.sp.material.rotation += dt * s.spin;
      s.sp.material.color.setRGB(0.55, 0.2, 1).multiplyScalar((0.08 + 0.2 * lo + 0.1 * kick) * fade);
    }
    uvLamp.intensity = 0.7 + 1.6 * kick + 0.5 * energy;
    // neonbord: af en toe een haperende buis
    if (now > flickEnd + 2 && Math.random() < dt * 0.12) flickEnd = now + rnd(0.15, 0.5);
    sign.material.color.setScalar((0.7 + 0.5 * kick) * (now < flickEnd && Math.random() < 0.5 ? 0.12 : 1));
  }

  // de gang is door de deur ook vanuit de zaal te zien: elke frame bijwerken (clubHooks), niet alleen als zone2 aan staat
  // rokers wachten tot er twee gewone figuren zijn (of 20 s), anders zou het eerst geladen figuur (soms Rick) het worden
  (typeof clubHooks !== 'undefined' ? clubHooks : z2Hooks).push((dt, now) => {
    if (!rokersMade && ACTS.Stand_and_Chat && plain().length && (plain().length >= 2 || now > 30)) makeRokers();  // één soort mens mag ook: herkleurd zijn het twee anderen
    const near = camera.position.z > 0;  // achter in de zaal zie je de gang niet: rokers niet tekenen en niet animeren
    for (const d of rokers) { d.root.visible = near; if (near) { pose(d, beatPos, energy, dt); wandvrij(d); } }
    animate(dt, now);
  });
  animate(0, 0);  // beginstand vóór de eerste frame
})();

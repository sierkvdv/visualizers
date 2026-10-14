// --- Zaal 2: dj-hoek tegen de verre wand (z 40), naar de zaal gericht ---
// Podium met jagende leds, dj-tafel (draaitafels, mixer, derde-oog-paneel, vu-kolommen), ledwand met eigen shader,
// BLOODLINE PROJECT-neon, draaiende halo's, vier booth-spots, twee speakerstacks die pompen, vonkfonteinen op de drops en een alien-dj.
(() => {
  const CX = Z2.x, ZB = Z2.z + Z2.d / 2;    // midden (x 9) en verre wand (z 40)
  const PH = 0.22, TOP = 1.21, TZ = 38.54;  // podiumhoogte, bovenkant tafelblad, midden van de tafel
  const corner = new THREE.Group(); zone2.add(corner);
  const C = new THREE.Color(), WHITE = new THREE.Color(1, 1, 1), M4 = new THREE.Matrix4();
  const hsl = (c, h, s, l) => c.setHSL(((h % 1) + 1) % 1, s, l);
  const dark = std(0x111115, 0.55, 0.35), metal = std(0x2a2a30, 0.4, 0.8), chrome = std(0x9a9aa4, 0.25, 0.9);

  // podium tot aan de wand; de voorkant (z 38.25) ligt net buiten de dansvloer (straal 6.2)
  add(corner, BOX, dark, [CX, PH / 2, (38.25 + ZB - 0.02) / 2], [7.6, PH, ZB - 0.02 - 38.25]);
  // ledstrip in de voorkant van het podium: een golf die op de tel rondjaagt
  const STRIP = 32, strip = new THREE.InstancedMesh(BOX, new THREE.MeshBasicMaterial(), STRIP);
  for (let i = 0; i < STRIP; i++) {
    strip.setMatrixAt(i, M4.makeScale(0.19, 0.05, 0.02).setPosition(CX - 3.68 + i * 7.36 / (STRIP - 1), PH / 2, 38.24));
    strip.setColorAt(i, C.setRGB(0, 0, 0));
  }
  strip.frustumCulled = false; corner.add(strip);

  // dj-tafel: zwarte kast met een metalen blad
  add(corner, BOX, dark, [CX, (PH + TOP - 0.05) / 2, TZ], [2.7, TOP - 0.05 - PH, 0.48]);
  add(corner, BOX, metal, [CX, TOP - 0.025, TZ], [2.8, 0.05, 0.56]);
  // voorkant: derde oog tussen twee mandala's in blacklight-verf, licht op de tel op
  const eyeTex = canvasTexture(512, 216, (g, w, h) => {
    const cx = w / 2, cy = h / 2, line = (col, lw, blur) => { g.strokeStyle = g.fillStyle = g.shadowColor = col; g.lineWidth = lw; g.shadowBlur = blur; };
    for (const [mx, col] of [[cx - 160, '#00f0ff'], [cx + 160, '#ff2bd6']]) {
      line(col, 3, 10);
      for (const r of [22, 44, 66, 88]) { g.beginPath(); g.arc(mx, cy, r, 0, TAU); g.stroke(); }
      line(col, 2, 6);
      for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; g.beginPath(); g.moveTo(mx + Math.cos(a) * 22, cy + Math.sin(a) * 22); g.lineTo(mx + Math.cos(a) * 88, cy + Math.sin(a) * 88); g.stroke(); }
    }
    line('#9dff00', 4, 14);
    g.beginPath(); g.moveTo(cx, cy - 80); g.lineTo(cx + 92, cy + 76); g.lineTo(cx - 92, cy + 76); g.closePath(); g.stroke();
    g.beginPath(); g.moveTo(cx - 46, cy + 22); g.quadraticCurveTo(cx, cy - 18, cx + 46, cy + 22); g.quadraticCurveTo(cx, cy + 62, cx - 46, cy + 22); g.stroke();
    line('#ffffff', 2, 18); g.beginPath(); g.arc(cx, cy + 22, 12, 0, TAU); g.fill();
  });
  const eyeMat = new THREE.MeshBasicMaterial({ map: eyeTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  add(corner, new THREE.PlaneGeometry(1.9, 0.8), eyeMat, [CX, (PH + TOP - 0.05) / 2, 38.293]).rotation.y = Math.PI;
  // vu-kolommen links (bas) en rechts (mid/hoog) in de voorkant: cyaan onderin, rood bovenin
  const vu = [], vuLvl = [0, 0];
  for (const side of [-1, 1]) for (let i = 0; i < 10; i++) {
    const m = new THREE.MeshBasicMaterial({ color: 0x000000 });
    add(corner, BOX, m, [CX + side * 1.17, 0.31 + i * 0.085, 38.293], [0.2, 0.06, 0.01]);
    vu.push({ m, s: side < 0 ? 0 : 1, i, base: new THREE.Color().setHSL(0.5 - i * 0.055, 1, 0.55) });
  }

  // twee draaitafels: plateau, plaat met gloeiend label en een streepje (zo zie je hem draaien), stroboscoopring, toonarm
  const decks = [];
  for (const dx of [-0.67, 0.67]) {
    const x = CX + dx;
    add(corner, BOX, std(0x1c1c22, 0.35, 0.7), [x, TOP + 0.025, TZ], [0.46, 0.05, 0.36]);
    const pl = new THREE.Group(); pl.position.set(x - 0.03, TOP + 0.05, TZ); corner.add(pl);
    add(pl, CYL, chrome, [0, 0.006, 0], [0.155, 0.012, 0.155]);
    add(pl, CYL, std(0x050507, 0.25, 0.2), [0, 0.0145, 0], [0.15, 0.005, 0.15]);
    add(pl, CYL, glowMat(dx < 0 ? 0xff2bd6 : 0x22f0ff), [0, 0.0175, 0], [0.05, 0.004, 0.05]);
    add(pl, BOX, additive(0xffffff, 0.9), [0, 0.0175, 0.1], [0.012, 0.002, 0.045]);
    add(pl, new THREE.TorusGeometry(0.157, 0.004, 4, 48), additive(0xff5020, 0.9), [0, 0.006, 0]).rotation.x = Math.PI / 2;
    // toonarm van de voet (achter-rechts, gezien vanaf de dj) naar de plaat
    add(corner, CYL, metal, [x + 0.18, TOP + 0.065, TZ - 0.12], [0.02, 0.03, 0.02]);
    add(corner, BOX, chrome, [x + 0.125, TOP + 0.08, TZ - 0.03], [0.008, 0.008, 0.211]).rotation.y = Math.atan2(-0.11, 0.18);
    add(corner, SPH, glowMat(0xff3010), [x - 0.2, TOP + 0.055, TZ - 0.15], [0.008, 0.008, 0.008]);
    decks.push(pl);
  }
  // mixer: vier kanalen met gloeiende knopjes (kleur per kanaal), faders, een crossfader die op de tel schuift en een tel-lampje
  add(corner, BOX, std(0x1a1a20, 0.4, 0.6), [CX, TOP + 0.04, TZ], [0.32, 0.08, 0.38]);
  const knobMats = [0, 1, 2, 3].map(() => new THREE.MeshBasicMaterial({ color: 0xffffff }));
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 3; r++) add(corner, CYL, knobMats[c], [CX - 0.105 + c * 0.07, TOP + 0.09, TZ - 0.14 + r * 0.065], [0.013, 0.02, 0.013]);
    add(corner, BOX, glowMat(0xdddddd), [CX - 0.105 + c * 0.07, TOP + 0.087, TZ + 0.08], [0.02, 0.014, 0.028]);
  }
  const xfader = add(corner, BOX, glowMat(0xffe600), [CX, TOP + 0.087, TZ + 0.155], [0.03, 0.014, 0.02]);
  const beatLed = new THREE.MeshBasicMaterial({ color: 0x000000 });
  add(corner, SPH, beatLed, [CX + 0.13, TOP + 0.085, TZ - 0.165], [0.012, 0.012, 0.012]);

  // ledwand 7.2 x 2.7 m net voor de wand: spiraaltunnel en vloeibare kleuren die elke 16 tellen in elkaar overvloeien, pompt op de bas
  const ledMat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, beat: { value: 0 }, bass: { value: 0 }, mid: { value: 0 }, high: { value: 0 }, hue: { value: 0 }, prog: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float time, beat, bass, mid, high, hue, prog; varying vec2 vUv;
      vec3 pal(float t) { return 0.5 + 0.5 * cos(6.2831 * (vec3(1.0, 1.0, 0.5) * t + vec3(0.8, 0.9, 0.3))); }
      float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
      void main() {
        vec2 cell = vec2(144.0, 54.0), id = floor(vUv * cell);
        vec2 p = ((id + 0.5) / cell - 0.5) * vec2(5.333, 2.0);  // midden van de ledpixel, in wandverhouding
        p *= 1.0 - 0.2 * bass;  // pomp op de bas
        float ph = fract(beat);
        // A: spiraaltunnel die op elke tel een stuk naar binnen schiet
        float r = length(p) + 0.001, a = atan(p.y, p.x);
        float d = 0.8 / r + time * 0.35 + floor(beat) * 0.3 + 0.3 * smoothstep(0.0, 0.35, ph);
        float spi = smoothstep(0.25, 0.85, 0.5 + 0.5 * sin(5.0 * a + d * 5.0));
        float rings = pow(max(0.0, 0.5 + 0.5 * sin(d * 8.0)), 10.0);
        vec3 colA = pal(d * 0.09 + hue + 0.1 * sin(2.0 * a)) * (spi * 0.75 + rings * (0.5 + 1.3 * bass));
        colA *= smoothstep(0.05, 0.35, r);
        // B: vloeibare kleuren die door elkaar stromen
        vec2 w = p * 0.8;
        for (int i = 0; i < 4; i++) {
          float fi = float(i);
          w += (0.32 + 0.25 * mid) * vec2(sin(w.y * 1.7 + time * 0.5 + fi * 1.9), cos(w.x * 1.5 - time * 0.42 + fi * 2.7));
        }
        float liq = 0.5 + 0.5 * sin(w.x * 1.4 + w.y * 1.2 + time * 0.6);
        vec3 colB = pal(liq * 0.55 + hue + 0.35 + length(w) * 0.04) * (0.25 + 0.85 * smoothstep(0.25, 0.95, liq));
        vec3 col = mix(colA, colB, prog);
        // schokgolf: elke tel een ring van het midden naar buiten
        float sh = r - ph * 3.2;
        col += pal(hue + 0.5) * exp(-sh * sh * 40.0) * (1.0 - ph) * (0.25 + 1.1 * bass);
        // hete kern achter het hoofd van de dj
        col += vec3(1.0, 0.75, 1.0) * exp(-r * r * 9.0) * (0.25 + 1.2 * bass);
        // twinkelende ledjes op de hoge tonen
        col += vec3(step(0.986, hash(id + floor(mod(time * 15.0, 997.0)))) * high);
        // ledraster: ronde pixels met zwarte naden
        vec2 f = fract(vUv * cell) - 0.5;
        col *= 1.0 - 0.6 * smoothstep(0.22, 0.5, length(f));
        col *= 0.8 + 0.6 * bass;
        gl_FragColor = vec4(col, 1.0);
      }`
  });
  const LED_Y = 2.25;
  add(corner, new THREE.PlaneGeometry(7.2, 2.7), ledMat, [CX, LED_Y, ZB - 0.1]).rotation.y = Math.PI;
  // truss-frame om de ledwand
  for (const [x, y, sx, sy] of [[CX, 3.66, 7.44, 0.12], [CX, 0.84, 7.44, 0.12], [CX - 3.66, 1.97, 0.12, 3.5], [CX + 3.66, 1.97, 0.12, 3.5]]) add(corner, BOX, metal, [x, y, ZB - 0.08], [sx, sy, 0.12]);
  // neon boven de ledwand (onder de laser die in het midden tegen de wand hangt), met ophangkabels
  const sign = neonSign('BLOODLINE PROJECT', '#ff1f3d', 4.4, 0.85);
  sign.position.set(CX, 4.1, ZB - 0.15); sign.rotation.y = Math.PI; corner.add(sign);
  for (const sx of [-1.9, 1.9]) add(corner, CYL, metal, [CX + sx, 4.76, ZB - 0.15], [0.008, 0.475, 0.008]);

  // halo's achter het hoofd van de dj: een hele ring en twee gebroken bogen die tegen elkaar in draaien
  const halos = [[0.9, 0.035, 1, 0.15], [1.1, 0.018, 0.72, -0.5], [1.3, 0.012, 0.42, 0.8]].map(([R, t, arc, spin]) => {
    const m = add(corner, new THREE.TorusGeometry(R, t, 6, 96, TAU * arc), additive(0xffffff, 0.9), [CX, LED_Y, ZB - 0.3]);
    m.userData.spin = spin; return m;
  });

  // vier booth-spots onder de truss: lichtbundels die heen en weer over de dj en de tafel vegen
  const beamTex = canvasTexture(4, 128, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#000000'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  const beamGeo = new THREE.ConeGeometry(0.42, 1, 18, 1, true).translate(0, -0.5, 0).rotateX(-Math.PI / 2);  // punt in de oorsprong, kegel langs +z
  const spots = [-2.9, -1.45, 1.45, 2.9].map((dx, i) => {
    const p = new THREE.Vector3(CX + dx, 3.42, ZB - 0.22);
    add(corner, BOX, dark, [p.x, p.y + 0.06, p.z], [0.2, 0.14, 0.2]);
    add(corner, BOX, metal, [p.x, 3.58, p.z], [0.03, 0.08, 0.03]);
    add(corner, BOX, metal, [p.x, 3.63, p.z + 0.05], [0.03, 0.03, 0.1]);
    const lens = new THREE.MeshBasicMaterial({ color: 0xffffff });
    add(corner, SPH, lens, [p.x, p.y, p.z], [0.05, 0.05, 0.05]);
    const mat = new THREE.MeshBasicMaterial({ map: beamTex, color: 0xffffff, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beam = add(corner, beamGeo, mat, [p.x, p.y, p.z]);
    return { p, i, dx, beam, mat, lens, tgt: new THREE.Vector3() };
  });

  // waas achter de dj, gekleurd door de ledwand
  const haze = [0, 1, 2].map(i => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex[i], color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, rotation: i * 2.1 }));
    s.position.set(CX - 2.2 + i * 2.2, 1.5 + (i % 2) * 0.4, ZB - 0.75); s.scale.setScalar(2.4); corner.add(s);
    return s;
  });

  // twee speakerstacks (sub + top), iets naar het midden gedraaid; conussen pompen op de bas, ringen en stofkappen gloeien
  const coneGeo = new THREE.CylinderGeometry(1, 0.4, 0.3, 24, 1, true), ringGeo = new THREE.TorusGeometry(1, 0.05, 8, 40);
  const coneMat2 = new THREE.MeshStandardMaterial({ color: 0x1a1a1f, roughness: 0.55, metalness: 0.25, side: THREE.DoubleSide });
  const ringMat = additive(0xffffff, 1), capMat = new THREE.MeshBasicMaterial({ color: 0xffffff }), edgeMat = additive(0xffffff, 0.9);
  const cones = [];
  for (const sx of [-1, 1]) {
    const g = new THREE.Group(); g.position.set(CX + sx * 4.5, 0, ZB - 0.75); g.rotation.y = sx * 0.33; corner.add(g);  // voorkant (-z) draait naar het midden
    add(g, BOX, dark, [0, 0.475, 0], [1.1, 0.95, 0.8]);
    add(g, BOX, dark, [0, 1.3, 0.05], [0.9, 0.7, 0.7]);
    for (const [y, r, zf] of [[0.475, 0.36, -0.4], [1.24, 0.2, -0.3]]) {
      const c = add(g, coneGeo, coneMat2, [0, y, zf - 0.15 * r], [r, r, r]); c.rotation.x = -Math.PI / 2;  // wijde kant naar voren
      add(c, SPH, capMat, [0, -0.05, 0], [0.3, 0.12, 0.3]);
      add(g, ringGeo, ringMat, [0, y, zf - 0.012], [r * 1.06, r * 1.06, r * 1.06]);
      cones.push({ c, r, zf });
    }
    add(g, BOX, edgeMat, [0, 1.53, -0.31], [0.4, 0.05, 0.01]);  // hoog-spleet
    for (const ex of [-0.55, 0.55]) add(g, BOX, edgeMat, [ex, 0.475, -0.4], [0.025, 0.95, 0.025]);  // neonranden
    for (const ex of [-0.45, 0.45]) add(g, BOX, edgeMat, [ex, 1.3, -0.3], [0.025, 0.7, 0.025]);
  }

  // vonkfonteinen op de voorhoeken van het podium: elke 32 tellen en bij een drop
  const NOZ = [new THREE.Vector3(CX - 3.45, PH + 0.15, 38.55), new THREE.Vector3(CX + 3.45, PH + 0.15, 38.55)];
  const nozMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  for (const n of NOZ) { add(corner, CYL, metal, [n.x, PH + 0.07, n.z], [0.07, 0.14, 0.07]); add(corner, CYL, nozMat, [n.x, PH + 0.145, n.z], [0.05, 0.01, 0.05]); }
  const SP = 160, NS = SP * NOZ.length;
  const sPos = new Float32Array(NS * 3).fill(-50), sCol = new Float32Array(NS * 3), sVel = new Float32Array(NS * 3), sLife = new Float32Array(NS), sMax = new Float32Array(NS).fill(1);
  const sparkTex = canvasTexture(32, 32, (g) => {
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,220,150,0.6)'); gr.addColorStop(1, 'rgba(255,160,60,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  });
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  sparkGeo.setAttribute('color', new THREE.BufferAttribute(sCol, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ size: 0.07, map: sparkTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  sparks.frustumCulled = false; corner.add(sparks);
  const sIdx = [0, 0];
  let sAcc = 0;
  function updateSparks(dt, firing) {
    if (firing) sAcc += dt * 160;
    while (sAcc >= 1) {  // per fontein een nieuwe vonk (ringbuffer: de oudste wordt hergebruikt)
      sAcc -= 1;
      NOZ.forEach((N, n) => {
        const i = n * SP + sIdx[n], o = i * 3; sIdx[n] = (sIdx[n] + 1) % SP;
        sPos[o] = N.x; sPos[o + 1] = N.y; sPos[o + 2] = N.z;
        sVel[o] = rnd(-0.45, 0.45); sVel[o + 1] = rnd(4.6, 6.4); sVel[o + 2] = rnd(-0.45, 0.45);
        sLife[i] = sMax[i] = rnd(0.5, 0.9);
      });
    }
    for (let i = 0; i < NS; i++) {
      const o = i * 3;
      if (sLife[i] <= 0) { sCol[o] = sCol[o + 1] = sCol[o + 2] = 0; continue; }
      sLife[i] -= dt; sVel[o + 1] -= 9.8 * dt;
      sPos[o] += sVel[o] * dt; sPos[o + 1] += sVel[o + 1] * dt; sPos[o + 2] += sVel[o + 2] * dt;
      const k = Math.max(0, sLife[i] / sMax[i]) * (0.6 + 0.4 * Math.random());
      sCol[o] = k; sCol[o + 1] = k * 0.78; sCol[o + 2] = k * 0.4;
    }
    sparkGeo.attributes.position.needsUpdate = true; sparkGeo.attributes.color.needsUpdate = true;
  }

  // één lamp: van voren op de dj en de tafel, kleur draait mee, flitst op de tel
  const djLight = new THREE.PointLight(0xff40ff, 1.2, 6.5, 1.4);
  djLight.position.set(CX, 2.9, 37.35); corner.add(djLight);

  // de dj: een alien achter de tafel (wacht even op de aliens, anders een ander figuur), danst op het podium
  let djFig = null, waitT = 0;
  function spawnDJ(dt) {
    waitT += dt;
    const aliens = (MODELS.alien || []).filter(M => !M.keep), others = allModels().filter(M => !M.keep);
    const M = aliens.length ? pick(aliens) : waitT > 12 ? pick(others.length ? others : allModels()) : null;
    if (!M) return;
    djFig = makeModelDancer(M, false);
    djFig.root.traverse(o => { o.castShadow = false; });  // geen schaduw (frustumCulled staat uit: anders in elke schaduwpass)
    zone2.attach(djFig.root);
    djFig.home.set(CX, 0, 39.0); djFig.face = Math.PI; djFig.yOff = PH;  // 18 cm achter het tafelblad, anders steekt hij er bij het dansen doorheen
  }

  // per frame: kleuren, ledwand, speakers, spots, vonken en de dj op de muziek
  let hue = 0.75, hueJump = 0, prog = 0, eSlow = 0, lastPhrase = null, fireUntil = -1, lastNow = -1;
  const lv = [0, 0, 0, 0];
  z2Hooks.push((dt, now) => {
    dt = Math.min(dt, 0.05);
    const b0 = Math.min(1, bands[0].v), b1 = Math.min(1, bands[1].v), b2 = Math.min(1, bands[2].v);
    const bass = Math.min(1, b0 * 0.65 + pulse * 0.45), beatHit = pulse * (0.35 + 0.65 * energy);
    // kleurfase: draait langzaam en springt elke 32 tellen een stuk door (zacht overvloeiend)
    const jump = Math.floor(beatPos / 32) * 0.31;
    // eerste beeld of terug in de zaal na een tijd weg: alles op de huidige stand, geen valse drop of vonken bij binnenkomst
    if (now - lastNow > 0.5) { hueJump = jump; prog = Math.floor(beatPos / 16) % 2; eSlow = energy; lastPhrase = Math.floor(beatPos / 32); }
    lastNow = now;
    hueJump += (jump - hueJump) * Math.min(1, dt * 0.7);
    hue = now * 0.012 + hueJump;

    // ledwand
    prog += ((Math.floor(beatPos / 16) % 2) - prog) * Math.min(1, dt * 0.8);
    const u = ledMat.uniforms;
    u.time.value = now; u.beat.value = beatPos; u.bass.value = bass; u.mid.value = b1; u.high.value = b2; u.hue.value = hue % 1; u.prog.value = prog;

    // podiumstrip: golf die op de tel rondjaagt
    for (let i = 0; i < STRIP; i++) {
      const wave = Math.pow(0.5 + 0.5 * Math.cos(TAU * (i / STRIP * 3 - beatPos * 0.5)), 3);
      strip.setColorAt(i, hsl(C, hue + i / STRIP * 0.5, 1, 0.5).multiplyScalar(0.12 + 0.9 * wave * (0.4 + 0.6 * energy)));
    }
    strip.instanceColor.needsUpdate = true;

    // tafel: derde oog, vu-kolommen, knopjes, crossfader, tel-lampje, draaiende platen
    eyeMat.color.setScalar(0.35 + 0.9 * beatHit);
    vuLvl[0] = Math.max(b0, vuLvl[0] - dt * 1.8); vuLvl[1] = Math.max(Math.max(b1, b2), vuLvl[1] - dt * 1.8);
    for (const v of vu) v.m.color.copy(v.base).multiplyScalar(v.i < vuLvl[v.s] * 10 ? 1 : 0.06);
    lv[0] = b0; lv[1] = b1; lv[2] = b2; lv[3] = pulse;
    knobMats.forEach((m, c) => hsl(m.color, hue + c * 0.25, 1, 0.55).multiplyScalar(0.35 + 0.9 * lv[c]));
    xfader.position.x = CX + 0.06 * Math.sin(beatPos * Math.PI / 4);
    beatLed.color.setRGB(pulse, 0.1 * pulse, 0.3 * pulse);
    for (const pl of decks) pl.rotation.y -= dt * 3.49;  // 33 toeren, met de klok mee

    // neon: brandt op de tel iets feller en hapert heel soms
    sign.material.color.setScalar(Math.random() < 0.006 ? 0.15 : 0.85 + 0.35 * pulse);
    // halo's: draaien, zwellen op de bas
    halos.forEach((m, i) => {
      m.rotation.z += dt * m.userData.spin * (0.5 + energy);
      m.scale.setScalar(1 + 0.12 * bass);
      hsl(m.material.color, hue + i * 0.33, 1, 0.55).multiplyScalar(0.4 + 0.9 * bass);
    });
    // spots: vegen over de dj en de tafel, bundel feller op de tel
    for (const s of spots) {
      s.tgt.set(s.p.x - s.dx * 0.45 + 0.9 * Math.sin(beatPos * Math.PI / 8 + s.i * 1.3), PH + 0.1, 38.85 + 0.3 * Math.sin(beatPos * Math.PI / 4 + s.i));
      s.beam.scale.set(1, 1, s.p.distanceTo(s.tgt));
      s.beam.lookAt(s.tgt);
      hsl(s.mat.color, hue + (s.i & 1 ? 0.5 : 0), 1, 0.6);
      s.mat.opacity = 0.06 + 0.22 * beatHit;
      s.lens.color.copy(s.mat.color).lerp(WHITE, 0.5);
    }
    haze.forEach((s, i) => { hsl(s.material.color, hue + i * 0.2, 1, 0.5).multiplyScalar(0.06 + 0.1 * bass); s.material.rotation += dt * 0.05 * (i % 2 ? 1 : -1); });

    // speakers: conussen pompen naar voren op de bas, ringen en kappen gloeien mee
    for (const k of cones) {
      const sy = 1 + 0.7 * b0;
      k.c.scale.set(k.r * (1 + 0.04 * b0), k.r * sy, k.r * (1 + 0.04 * b0));
      k.c.position.z = k.zf - 0.15 * k.r * sy;
    }
    hsl(ringMat.color, hue + 0.5, 1, 0.5).multiplyScalar(0.25 + 1.1 * b0);
    hsl(capMat.color, hue + 0.5, 1, 0.6).multiplyScalar(0.3 + 0.9 * b0);
    hsl(edgeMat.color, hue + 0.25, 1, 0.5).multiplyScalar(0.3 + 0.7 * b2);

    // vonken: elke 32 tellen (bij genoeg energie) en bij een drop (energie schiet omhoog)
    const phrase = Math.floor(beatPos / 32);
    if (lastPhrase !== null && phrase !== lastPhrase && energy > 0.45) fireUntil = beatPos + 4;
    lastPhrase = phrase;
    eSlow += (energy - eSlow) * Math.min(1, dt * 0.3);
    if (energy - eSlow > 0.2 && energy > 0.6 && beatPos > fireUntil + 8) fireUntil = beatPos + 6;
    const firing = beatPos < fireUntil;
    nozMat.color.setRGB(firing ? 1 : 0.15, firing ? 0.6 : 0.05, firing ? 0.2 : 0.02);
    updateSparks(dt, firing);

    // lamp op de dj
    hsl(djLight.color, hue + 0.15, 1, 0.6);
    djLight.intensity = 0.8 + 2.4 * beatHit + (firing ? 1 : 0);

    // dj
    if (!djFig) spawnDJ(dt);
    if (djFig) pose(djFig, beatPos, energy * 0.8, dt);
  });
})();

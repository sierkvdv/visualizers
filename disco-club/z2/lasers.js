// --- Zaal 2: lasershow (vier bronnen, patroon springt om de 8 tellen), blacklight-flits bij een energiesprong en een draaiend projectorpatroon op het plafond ---
(() => {
  const X0 = Z2.x - Z2.w / 2, X1 = Z2.x + Z2.w / 2, Z0 = Z2.z - Z2.d / 2, Z1 = Z2.z + Z2.d / 2, H = Z2.h;  // zaal 2: x 1..17, z 24..40, y 0..5
  const LOW = 2.75;  // stralen blijven boven deze hoogte: de camera komt tot 2.5 en de dansers blijven vrij
  const WHITE = new THREE.Color(1, 1, 1), UV = new THREE.Color(0x7a2cff);
  const ZAX = new THREE.Vector3(0, 0, 1), tgt = new THREE.Vector3(), dir = new THREE.Vector3();
  const clamp01 = v => Math.min(1, Math.max(0, v));

  // laserkleuren: elk patroon een eigen paar; volgorde van de patronen (0 waaier, 1 kruis, 2 tunnel, 3 scannen)
  const LPAL = [[0x22ff55, 0xff1840], [0x00e5ff, 0xff2d95], [0xb04dff, 0x7cff00], [0x2a5cff, 0xffd400], [0xff2d95, 0x00ffb0]].map(p => p.map(c => new THREE.Color(c)));
  const ORDER = [0, 2, 1, 3, 2, 0, 3, 1];

  // bronnen: twee hoeken achterin, boven de DJ, boven de ingang (dir -1 = schiet naar de ingang, +1 = naar achter; side = links/midden/rechts)
  const SRC = [
    { p: new THREE.Vector3(X0 + 0.4, 4.8, Z1 - 0.4), n: 3, dir: -1, side: -1 },
    { p: new THREE.Vector3(X1 - 0.4, 4.8, Z1 - 0.4), n: 3, dir: -1, side: 1 },
    { p: new THREE.Vector3(Z2.x, 4.6, Z1 - 0.5), n: 5, dir: -1, side: 0 },
    { p: new THREE.Vector3(Z2.x, 4.6, Z0 + 0.35), n: 3, dir: 1, side: 0 },
  ];
  // straal: open cilinder langs +z van 0 tot 1, per frame geschaald tot precies de wand
  const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true); beamGeo.rotateX(Math.PI / 2); beamGeo.translate(0, 0, 0.5);
  const housingMat = std(0x121216, 0.35, 0.8), beams = [];
  SRC.forEach((s, si) => {
    add(zone2, BOX, housingMat, [s.p.x, s.p.y, s.p.z - s.dir * 0.16], [0.36, 0.18, 0.3]);  // kastje tegen de wand
    s.lens = add(zone2, SPH, additive(0xffffff, 0.8), [s.p.x, s.p.y, s.p.z], [0.055, 0.055, 0.055]);  // gloeiende lens
    s.col = LPAL[0][0];
    for (let k = 0; k < s.n; k++) {  // per straal een felle kern en een zachte gloed eromheen
      const core = add(zone2, beamGeo, additive(0xffffff, 0), [s.p.x, s.p.y, s.p.z]);
      const glow = add(zone2, beamGeo, additive(0xffffff, 0), [s.p.x, s.p.y, s.p.z]);
      core.visible = glow.visible = false;
      beams.push({ s, si, k, core, glow });
    }
  });

  // doelpunt per straal op de overkant: u = links/rechts (-1..1 = wand tot wand), v = hoogte (0 = LOW, 1 = net boven het plafond)
  function aim(pat, b, t) {
    const { s, si, k } = b, n = s.n, f = n > 1 ? k / (n - 1) - 0.5 : 0;
    let u, v;
    if (pat === 0) {  // waaier: gaat open en dicht en veegt heen en weer op de tel
      const spread = 0.5 + 0.4 * Math.sin(t * Math.PI / 4);
      u = 0.45 * Math.sin(t * Math.PI / 2 + si * 1.3) + f * spread * 2;
      v = 0.08 + 0.12 * (0.5 + 0.5 * Math.sin(t * Math.PI + si));
    } else if (pat === 1) {  // kruis: hoeken schieten naar de andere kant, het midden knipt als een schaar
      if (s.side) { u = -s.side * (0.15 + 0.55 * (0.5 + 0.5 * Math.sin(t * Math.PI / 2 + f * 2))); v = 0.08 + (f + 0.5) * 0.55; }
      else { u = (k % 2 ? 1 : -1) * 0.75 * Math.sin(t * Math.PI / 2) + f * 0.2; v = 0.15 + 0.4 * (0.5 + 0.5 * Math.sin(t * Math.PI / 4 + k)); }
    } else if (pat === 2) {  // tunnel: stralen op een draaiende kegel die meeademt op de kick
      const a = (k / n) * TAU + t * Math.PI / 4 * (si % 2 ? -1 : 1), R = 0.3 + 0.12 * pulse;
      u = R * Math.cos(a) - s.side * 0.15; v = 0.48 + 1.3 * R * Math.sin(a);
    } else {  // scannen: verticale lichtgordijnen die heen en weer schuiven
      const tri = Math.abs((((t / 2 + si * 0.25) % 2) + 2) % 2 - 1);
      u = (tri * 2 - 1) * 0.85 * (si % 2 ? -1 : 1) + f * 0.06; v = 0.04 + (f + 0.5) * 0.8;
    }
    tgt.set(Z2.x + u * (Z2.w / 2 + 0.6), LOW + Math.max(0, v) * (H + 0.6 - LOW), s.dir < 0 ? Z0 : Z1);
    if (s.dir < 0 && Math.abs(tgt.x - DOOR2.x) < 1.5) tgt.y = Math.max(tgt.y, 3.2);  // niet de gangopening in (x 7.8..10.2, tot 3 m hoog)
  }
  // afstand van o langs d tot de binnenkant van de zaal, zodat geen straal door een muur steekt
  function exitDist(o, d) {
    const e = 0.03; let t = 40;
    if (d.x > 1e-5) t = Math.min(t, (X1 - e - o.x) / d.x); else if (d.x < -1e-5) t = Math.min(t, (X0 + e - o.x) / d.x);
    if (d.y > 1e-5) t = Math.min(t, (H - e - o.y) / d.y); else if (d.y < -1e-5) t = Math.min(t, (e - o.y) / d.y);
    if (d.z > 1e-5) t = Math.min(t, (Z1 - e - o.z) / d.z); else if (d.z < -1e-5) t = Math.min(t, (Z0 + e - o.z) / d.z);
    return Math.max(0.05, t);
  }

  // projector op het plafond: een stippen-gobo en een lijnen-gobo die tegen elkaar in draaien
  const fadeEdge = (g, w) => {  // zachte rand zodat de schijf nergens hard ophoudt
    const c = w / 2, fade = g.createRadialGradient(c, c, 0, c, c, c);
    fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(0.72, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
    g.shadowBlur = 0; g.fillStyle = fade; g.fillRect(0, 0, w, w);
  };
  const dotsTex = canvasTexture(512, 512, (g, w) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, w);
    const c = w / 2; g.fillStyle = '#fff'; g.shadowColor = '#fff'; g.shadowBlur = 8;
    for (let ring = 1; ring <= 9; ring++) {
      const r = ring * 26, n = ring * 7;
      for (let i = 0; i < n; i++) { const a = i / n * TAU + ring * 0.3; g.beginPath(); g.arc(c + Math.cos(a) * r, c + Math.sin(a) * r, 2.5 + ring * 0.45, 0, TAU); g.fill(); }
    }
    fadeEdge(g, w);
  });
  const linesTex = canvasTexture(512, 512, (g, w) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, w);
    const c = w / 2; g.strokeStyle = '#fff'; g.lineWidth = 3; g.shadowColor = '#fff'; g.shadowBlur = 10;
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; g.beginPath(); g.moveTo(c + Math.cos(a) * 30, c + Math.sin(a) * 30); g.lineTo(c + Math.cos(a) * 245, c + Math.sin(a) * 245); g.stroke(); }
    for (const arm of [0, Math.PI]) { g.beginPath(); for (let r = 10; r < 245; r += 2) { const a = arm + r * 0.03; g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r); } g.stroke(); }
    for (let r = 70; r < 245; r += 58) { g.beginPath(); g.arc(c, c, r, 0, TAU); g.stroke(); }
    fadeEdge(g, w);
  });
  const goboMat = map => new THREE.MeshBasicMaterial({ map, color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const discGeo = new THREE.CircleGeometry(6.4, 64), dotsMat = goboMat(dotsTex), linesMat = goboMat(linesTex);
  const dots = add(zone2, discGeo, dotsMat, [Z2.x, H - 0.02, Z2.z]), lines = add(zone2, discGeo, linesMat, [Z2.x, H - 0.035, Z2.z]);
  dots.rotation.x = lines.rotation.x = Math.PI / 2;  // plat onder het plafond, kijkt naar beneden; rotation.z draait in het vlak

  // blacklight: violette binnendoos over wanden, vloer en plafond (niet de ingangswand) plus één eigen lamp voor de dansers
  const uvMat = additive(0x000000, 1), noFace = new THREE.MeshBasicMaterial({ visible: false });
  uvMat.side = THREE.BackSide;
  const uvBox = add(zone2, BOX, [uvMat, uvMat, uvMat, uvMat, uvMat, noFace], [Z2.x, H / 2, Z2.z], [Z2.w - 0.06, H - 0.04, Z2.d - 0.06]);
  uvBox.visible = false;
  const uvLight = new THREE.PointLight(0x7a2cff, 0, 18, 1.2); uvLight.position.set(Z2.x, 4.2, Z2.z); zone2.add(uvLight);

  let slowE = 0, lastRun = -9, flash = 0, flashCool = 0, lastPhrase = 0, lastPat = -1, spinDir = 1;
  z2Hooks.push((dt, now) => {
    // flits als de energie ineens hard stijgt (drop na een break), zachter aan het begin van elke frase van 32 tellen
    const phrase = Math.floor(beatPos / 32);
    if (now - lastRun > 0.5) { slowE = energy; lastPhrase = phrase; }  // net de zaal in: niet meteen flitsen
    lastRun = now;
    slowE += (energy - slowE) * Math.min(1, dt * 0.6);
    if (energy - slowE > 0.15 && now > flashCool) { flash = 1; flashCool = now + 2.5; }
    if (phrase !== lastPhrase) { lastPhrase = phrase; if (energy > 0.5 && now > flashCool) { flash = Math.max(flash, 0.7); flashCool = now + 2.5; } }
    flash *= Math.exp(-dt * 3.2);
    uvBox.visible = flash > 0.01;
    uvMat.color.copy(UV).lerp(WHITE, flash * flash * 0.35).multiplyScalar(flash * 0.6);
    uvLight.intensity = flash * 6;

    // lasers: patroon en kleurpaar springen om de 8 tellen, helderheid op pulse en energy
    const patIdx = Math.floor(beatPos / 8), pat = ORDER[patIdx % ORDER.length], lp = LPAL[patIdx % LPAL.length];
    if (patIdx !== lastPat) { lastPat = patIdx; spinDir = -spinDir; }  // projector draait om bij elke wissel
    const master = clamp01((energy - 0.12) / 0.45), chop = bands[2].v > 0.7 && energy > 0.6;  // felle hihats: stralen hakken in zestienden
    const sixteenth = Math.floor(beatPos * 4);
    for (const b of beams) {
      const { s, si, k, core, glow } = b;
      aim(pat, b, beatPos);
      dir.subVectors(tgt, s.p).normalize();
      const len = exitDist(s.p, dir), gw = 0.05 + 0.03 * pulse;
      core.quaternion.setFromUnitVectors(ZAX, dir); glow.quaternion.copy(core.quaternion);
      core.scale.set(0.011, 0.011, len); glow.scale.set(gw, gw, len);
      const col = lp[pat === 0 ? (s.side ? 0 : 1) : pat === 1 ? k % 2 : pat === 2 ? si % 2 : (si === 3 ? 1 : 0)];
      s.col = col;
      const a = Math.min(1, master * (0.35 + 0.65 * pulse) * (chop && (sixteenth + si + k) % 2 ? 0.3 : 1) * (1 + flash));
      core.material.color.copy(col).lerp(WHITE, 0.3 + 0.4 * flash); core.material.opacity = a;
      glow.material.color.copy(col); glow.material.opacity = a * 0.16;
      core.visible = glow.visible = a > 0.01;
    }
    for (const s of SRC) { s.lens.material.color.copy(s.col).lerp(WHITE, 0.5); s.lens.material.opacity = 0.3 + 0.7 * master * (0.4 + 0.6 * pulse); }

    // plafondprojector: draait sneller met de energie, kleur loopt mee met de tellen, flitst mee met hihats en kick
    const hue = (beatPos / 64) % 1, hi = bands[2].v;
    dots.rotation.z += dt * spinDir * (0.15 + 0.5 * energy);
    lines.rotation.z -= dt * spinDir * (0.1 + 0.3 * energy);
    lines.scale.setScalar(1 + 0.07 * pulse);
    dotsMat.color.setHSL(hue, 1, 0.5).multiplyScalar(0.25 + 0.55 * hi + 0.3 * pulse + 0.6 * flash);
    linesMat.color.setHSL((hue + 0.5) % 1, 1, 0.5).multiplyScalar(0.12 + 0.35 * pulse + 0.2 * energy + 0.5 * flash);
  });
})();

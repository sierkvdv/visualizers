// --- Dagobling: rijke rap-eend bij de paaldanseres van podium 1 (voorhoek rechts) ---
// Gebouwd uit vormen (geen generatie): hoge hoed met gouden band, rode jas, zonnebril, bakkebaarden, twee gouden kettingen met een
// $-penning, een joint in de snavelhoek. Linkerhand houdt een stapel flappen, de rechter flickt biljetten naar de danseres.
// Groove: knikt op de tel, rapt mee (ondersnavel), elke tel 1-2 biljetten. Opbouw: zwaait de stapel hoog in de lucht.
// Drop (clubRegie.dropBeat): 32 tellen 'make it rain' (elke halve tel 2-3 biljetten, om de 4 tellen een handvol met links).
// Break: chillen, trekje van de joint (gloed + rookwolk), niets gooien.
// Biljetten: één InstancedMesh, vliegen in een boog naar de danseres, dwarrelen neer en blijven even op podium of vloer liggen.
// Camera: SHOTS.eend (schouder / boog / laag), vaker vlak na een drop. Test: clubEend.regen(), clubEend.info(), S.cam = 'eend'.
(() => {
  'use strict';
  if (window.clubEend || typeof scene === 'undefined' || typeof clubHooks === 'undefined' || typeof POLES === 'undefined') return;
  const V3 = THREE.Vector3, YAX = new V3(0, 1, 0);
  const P = POLES[0];
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const sm = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  const mix = (a, b, k) => a + (b - a) * k;

  // plek: tussen het podium en het zaalmidden, kijkt naar de paal
  const toC = new V3(-P.x, 0, -P.z).normalize();
  const HOME = new V3(P.x + toC.x * (P.r + 0.62), 0, P.z + toC.z * (P.r + 0.62));
  const FACE = Math.atan2(P.x - HOME.x, P.z - HOME.z);
  const FWD = new V3(Math.sin(FACE), 0, Math.cos(FACE)), RIGHT = new V3(-Math.cos(FACE), 0, Math.sin(FACE));  // RIGHT = zijn rechterkant

  // --- materialen en texturen ---
  const phong = (color, o) => new THREE.MeshPhongMaterial(Object.assign({ color, shininess: 30 }, o || {}));
  const M = {
    wit: phong(0xf4f1ea, { emissive: 0x302d2a }),        // licht eigen schijnsel: blijft zichtbaar in de donkere zaal
    oranje: phong(0xffa21f, { emissive: 0x3a1c00 }),
    rood: phong(0xc8102e, { emissive: 0x2c0309, shininess: 50 }),
    zwart: phong(0x101014, { shininess: 90, specular: 0x555566 }),
    glas: phong(0x040406, { shininess: 200, specular: 0xffffff }),
    goud: phong(0xffc531, { emissive: 0x553800, shininess: 140, specular: 0xfff1a8 }),
    papier: phong(0xe8e0cc, { emissive: 0x2a2620 }),
    gloed: new THREE.MeshBasicMaterial({ color: 0xff5a1a }),
  };
  const doek = (w, h, teken) => { const c = document.createElement('canvas'); c.width = w; c.height = h; teken(c.getContext('2d')); const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t; };
  const biljetTex = doek(128, 56, g => {
    const gr = g.createLinearGradient(0, 0, 128, 56); gr.addColorStop(0, '#a8dca0'); gr.addColorStop(1, '#5c9c58');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 56);
    g.strokeStyle = '#2c5a29'; g.lineWidth = 4; g.strokeRect(3, 3, 122, 50);
    g.fillStyle = '#dff2d8'; g.beginPath(); g.ellipse(64, 28, 17, 19, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#21451f'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 30px Arial'; g.fillText('$', 64, 30);
    g.font = 'bold 13px Arial'; g.fillText('100', 20, 15); g.fillText('100', 108, 42);
  });
  const penningTex = doek(64, 64, g => {
    const gr = g.createRadialGradient(26, 24, 4, 32, 32, 32); gr.addColorStop(0, '#fff3b0'); gr.addColorStop(0.6, '#ffc531'); gr.addColorStop(1, '#a8740a');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#7a5200'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 46px Arial'; g.fillText('$', 32, 35);
  });
  const stapelMat = [phong(0x6fae6a, { emissive: 0x16361a }), new THREE.MeshPhongMaterial({ map: biljetTex, emissive: 0x16361a })];

  // --- de eend (lokaal: voeten op y 0, kijkt naar +z) ---
  const root = new THREE.Group();
  root.position.copy(HOME); root.rotation.y = FACE; root.scale.setScalar(1.12);
  root.name = 'dagobling';
  scene.add(root);
  for (const s of [-1, 1]) {  // pootjes, slobkousen en zwemvoeten staan stil
    add(root, CYL, M.oranje, [s * 0.1, 0.13, 0], [0.034, 0.26, 0.034]);
    add(root, CYL, M.wit, [s * 0.1, 0.075, 0.005], [0.052, 0.07, 0.052]);
    const v = add(root, SPH, M.oranje, [s * 0.115, 0.025, 0.08], [0.085, 0.026, 0.16]); v.rotation.y = s * 0.28;
  }
  const lijf = new THREE.Group(); root.add(lijf);  // alles boven de pootjes: veert op de tel
  add(lijf, SPH, M.wit, [0, 0.55, 0.04], [0.29, 0.36, 0.27]);         // buik
  add(lijf, SPH, M.rood, [0, 0.58, -0.035], [0.315, 0.34, 0.28]);    // jas, van voren open
  for (const s of [-1, 1]) { const p = add(lijf, BOX, M.rood, [s * 0.1, 0.32, -0.21], [0.16, 0.26, 0.035]); p.rotation.set(0.28, 0, s * 0.12); }  // jaspanden
  for (const [y, z] of [[0.66, 0.178], [0.54, 0.185]]) for (const s of [-1, 1]) add(lijf, SPH, M.goud, [s * 0.2, y, z], [0.02, 0.02, 0.012]);  // knopen
  add(lijf, CYL, M.wit, [0, 0.93, 0], [0.155, 0.2, 0.155]);           // nek
  // kettingen: dik met penning, dunner eronder
  for (const [r, buis, kantel, y] of [[0.2, 0.018, 0.6, 0.95], [0.225, 0.01, 0.8, 0.93]]) {
    const g = new THREE.Group(); g.position.set(0, y, 0.03); g.rotation.x = kantel; lijf.add(g);
    const t = new THREE.Mesh(new THREE.TorusGeometry(r, buis, 6, 44), M.goud); t.rotation.x = Math.PI / 2; t.scale.set(1, 1.25, 1); g.add(t);
  }
  const penning = new THREE.Mesh(CYL, [M.goud, new THREE.MeshPhongMaterial({ map: penningTex, emissive: 0x3a2600, shininess: 140, specular: 0xfff1a8 }), M.goud]);
  penning.position.set(0, 0.735, 0.285); penning.rotation.x = Math.PI / 2 - 0.4; penning.scale.set(0.075, 0.016, 0.075); lijf.add(penning);

  const kop = new THREE.Group(); kop.position.set(0, 1.0, 0); lijf.add(kop);  // draaipunt in de nek: knikken
  add(kop, SPH, M.wit, [0, 0.08, 0], [0.2, 0.2, 0.2]);
  for (const s of [-1, 1]) { const b = add(kop, SPH, M.wit, [s * 0.175, 0.0, 0.05], [0.07, 0.1, 0.06]); b.rotation.z = s * 0.35; }  // bakkebaarden
  add(kop, SPH, M.oranje, [0, 0.04, 0.2], [0.105, 0.04, 0.15]);       // bovensnavel
  const onder = new THREE.Group(); onder.position.set(0, 0.025, 0.12); kop.add(onder);
  add(onder, SPH, M.oranje, [0, -0.012, 0.075], [0.088, 0.027, 0.115]);
  for (const s of [-1, 1]) { const l = add(kop, BOX, M.glas, [s * 0.075, 0.13, 0.178], [0.1, 0.062, 0.016]); l.rotation.y = s * 0.3; }  // zonnebril
  add(kop, BOX, M.zwart, [0, 0.148, 0.2], [0.05, 0.012, 0.01]);
  for (const s of [-1, 1]) add(kop, BOX, M.zwart, [s * 0.18, 0.14, 0.085], [0.008, 0.012, 0.17]);
  const hoed = new THREE.Group(); hoed.position.set(0, 0.255, -0.01); hoed.rotation.set(-0.08, 0, -0.14); kop.add(hoed);
  add(hoed, CYL, M.zwart, [0, 0, 0], [0.2, 0.014, 0.2]);
  add(hoed, CYL, M.zwart, [0, 0.125, 0], [0.125, 0.24, 0.125]);
  add(hoed, CYL, M.goud, [0, 0.03, 0], [0.128, 0.034, 0.128]);
  // joint in de linker snavelhoek, schuin naar buiten en iets omlaag
  const jDir = new V3(0.55, -0.22, 0.8).normalize(), jHoek = new V3(0.085, 0.025, 0.16);
  const joint = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.009, 0.14, 6), M.papier);  // flink formaat: anders zie je hem niet
  joint.quaternion.setFromUnitVectors(YAX, jDir); joint.position.copy(jHoek).addScaledVector(jDir, 0.07); kop.add(joint);
  const tip = add(kop, SPH, M.gloed, null, [0.017, 0.017, 0.017]); tip.position.copy(jHoek).addScaledVector(jDir, 0.14);

  function arm(s) {  // s = 1 links (+x), -1 rechts
    const sh = new THREE.Group(); sh.position.set(s * 0.27, 0.8, -0.01); lijf.add(sh);
    add(sh, SPH, M.rood, [0, 0, 0], [0.075, 0.075, 0.075]);
    add(sh, CYL, M.rood, [0, -0.11, 0], [0.056, 0.22, 0.056]);
    const el = new THREE.Group(); el.position.set(0, -0.22, 0); sh.add(el);
    add(el, SPH, M.rood, [0, 0, 0], [0.055, 0.055, 0.055]);
    add(el, CYL, M.rood, [0, -0.09, 0], [0.05, 0.18, 0.05]);
    add(el, CYL, M.wit, [0, -0.18, 0], [0.058, 0.032, 0.058]);
    const hand = new THREE.Group(); hand.position.set(0, -0.23, 0); el.add(hand);
    add(hand, SPH, M.wit, [0, 0, 0], [0.058, 0.064, 0.048]);
    add(hand, SPH, M.wit, [-s * 0.045, 0.012, 0.028], [0.021, 0.034, 0.021]);  // duim
    return { sh, el, hand, s };
  }
  const L = arm(1), R = arm(-1);
  const stapel = new THREE.Mesh(BOX, [stapelMat[0], stapelMat[0], stapelMat[1], stapelMat[0], stapelMat[0], stapelMat[0]]);
  stapel.position.set(0, -0.045, 0.02); stapel.scale.set(0.11, 0.055, 0.2); stapel.rotation.x = 0.15; L.hand.add(stapel);
  const flap = add(R.hand, BOX, stapelMat[1], [0, -0.05, 0.04], [0.1, 0.004, 0.2]);  // het biljet dat hij gaat flicken

  // armstanden [schouder x, schouder y, schouder z (naar buiten), elleboog x]; rechts gespiegeld via s
  const POSE = {
    klaar: [-0.75, 0.15, 0.18, -1.2],
    pak: [-1.0, 0.45, -0.5, -1.6],
    gooi: [-2.1, -0.15, 0.55, -0.15],
    stapel: [-0.85, 0.35, -0.3, -1.35],
    handvol: [-2.6, -0.1, 0.25, -0.2],
    hoog: [-2.85, 0, 0.3, -0.35],
    hang: [-0.12, 0, 0.12, -0.3],
  };
  const tmpPose = [0, 0, 0, 0];
  function blend(a, b, k) { for (let i = 0; i < 4; i++) tmpPose[i] = mix(a[i], b[i], k); return tmpPose; }
  function zet(A, p, k) {  // zacht naar de stand toe (geen sprongen bij een standwissel)
    const s = A.s;
    A.sh.rotation.x = mix(A.sh.rotation.x, p[0], k); A.sh.rotation.y = mix(A.sh.rotation.y, s * p[1], k);
    A.sh.rotation.z = mix(A.sh.rotation.z, s * p[2], k); A.el.rotation.x = mix(A.el.rotation.x, p[3], k);
  }
  function flick(p) {  // 0..1: naar de stapel, uithalen, loslaten op 0,5, terug
    if (p < 0.3) return blend(POSE.klaar, POSE.pak, sm(p / 0.3));
    if (p < 0.5) return blend(POSE.pak, POSE.gooi, sm((p - 0.3) / 0.2));
    return blend(POSE.gooi, POSE.klaar, sm((p - 0.5) / 0.5));
  }

  // --- biljetten ---
  const MOB = typeof MOBIEL !== 'undefined' && MOBIEL;
  const N = MOB ? 120 : 240;
  const bGeo = new THREE.PlaneGeometry(0.24, 0.105);
  bGeo.boundingSphere = new THREE.Sphere(new V3(P.x, 2, P.z), 5.5);  // frustum-culling van de hele hoek (de biljetten zelf bewegen)
  const bMat = new THREE.MeshLambertMaterial({ map: biljetTex, side: THREE.DoubleSide, emissive: 0x16361a });
  const biljetten = new THREE.InstancedMesh(bGeo, bMat, N);
  biljetten.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  biljetten.raycast = () => {};  // geen obstakel voor stralen (moshpit, camera)
  biljetten.name = 'dagobling-flappen';
  scene.add(biljetten);
  const pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), rot = new Float32Array(N * 3), spin = new Float32Array(N * 3);
  const age = new Float32Array(N), fase = new Float32Array(N), rust = new Float32Array(N), grond = new Float32Array(N), sc = new Float32Array(N);
  const mode = new Uint8Array(N);  // 0 vrij, 1 vliegt, 2 dwarrelt, 3 ligt, 4 verdwijnt
  const o3 = new THREE.Object3D(), NUL = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < N; i++) biljetten.setMatrixAt(i, NUL);
  let cursor = 0, actief = 0, gegooid = 0;
  function vrije() {
    for (let k = 0; k < N; k++) { const i = (cursor + k) % N; if (mode[i] === 0) { cursor = (i + 1) % N; return i; } }
    let oud = -1, oa = -1;  // vol: het langst liggende biljet
    for (let i = 0; i < N; i++) if (mode[i] >= 3 && age[i] > oa) { oa = age[i]; oud = i; }
    return oud;
  }
  const hp = new V3(), tg = new V3(), tmp = new V3();
  function doel(out) {  // de danseres (heupen) of anders de paal
    const d = typeof poleDancers !== 'undefined' && poleDancers[0];
    const h = d && d.root && d.root.parent && typeof hipsOf === 'function' ? hipsOf(d) : null;
    if (h) { h.getWorldPosition(out); out.y += 0.25; } else out.set(P.x, P.h + 1.3, P.z);
    return out;
  }
  function gooi(hand, n, kracht) {
    hand.getWorldPosition(hp); doel(tg);
    for (let k = 0; k < n; k++) {
      const i = vrije(); if (i < 0) return;
      const T = 0.45 + Math.random() * 0.3, a = (Math.random() - 0.5) * 0.7 * kracht;
      const dx = tg.x - hp.x, dz = tg.z - hp.z, ca = Math.cos(a), sa = Math.sin(a);
      const ex = (dx * ca - dz * sa) * (0.75 + Math.random() * 0.5), ez = (dx * sa + dz * ca) * (0.75 + Math.random() * 0.5);
      pos[i * 3] = hp.x + (Math.random() - 0.5) * 0.05; pos[i * 3 + 1] = hp.y; pos[i * 3 + 2] = hp.z + (Math.random() - 0.5) * 0.05;
      vel[i * 3] = ex / T * 1.25; vel[i * 3 + 2] = ez / T * 1.25;
      vel[i * 3 + 1] = ((tg.y - hp.y) + 4.9 * T * T) / T * (0.85 + Math.random() * 0.35 * kracht);
      for (let j = 0; j < 3; j++) { rot[i * 3 + j] = Math.random() * 6.3; spin[i * 3 + j] = (Math.random() - 0.5) * 22; }
      age[i] = 0; fase[i] = Math.random() * 6.3; mode[i] = 1; sc[i] = 1; rust[i] = 7 + Math.random() * 6;
      gegooid++;
    }
  }
  function updateBiljetten(dt) {
    actief = 0;
    for (let i = 0; i < N; i++) {
      const m = mode[i];
      if (m === 0) continue;
      actief++;
      age[i] += dt;
      const j = i * 3;
      if (m === 1 || m === 2) {
        if (m === 1) {  // gegooid: zwaartekracht, weinig luchtweerstand, tollen
          vel[j + 1] -= 9.8 * dt;
          const k = Math.exp(-1.1 * dt); vel[j] *= k; vel[j + 2] *= k;
          for (let q = 0; q < 3; q++) rot[j + q] += spin[j + q] * dt;
          if (age[i] > 0.4 && vel[j + 1] < 0) mode[i] = 2;
        } else {  // dwarrelen: zakt langzaam, schommelt en zweeft zijwaarts
          const k = 1 - Math.exp(-5 * dt), t = age[i] * 3.2 + fase[i];
          vel[j] += (Math.cos(t) * 0.55 - vel[j]) * k; vel[j + 2] += (Math.sin(t * 0.8) * 0.55 - vel[j + 2]) * k;
          vel[j + 1] += (-0.6 - vel[j + 1]) * k;
          rot[j] = -Math.PI / 2 + Math.sin(t * 1.4) * 0.75; rot[j + 2] += spin[j + 2] * 0.15 * dt; rot[j + 1] = Math.sin(t) * 0.45;
        }
        pos[j] += vel[j] * dt; pos[j + 1] += vel[j + 1] * dt; pos[j + 2] += vel[j + 2] * dt;
        const op = Math.hypot(pos[j] - P.x, pos[j + 2] - P.z) < P.r - 0.03;
        const gy = (op ? P.h : 0) + 0.004 + (i % 13) * 0.0006;  // iets verschil: liggende biljetten flikkeren niet door elkaar
        if (pos[j + 1] <= gy && (m === 2 || vel[j + 1] < 0)) {
          pos[j + 1] = gy; mode[i] = 3; age[i] = 0; grond[i] = gy;
          rot[j] = -Math.PI / 2; rot[j + 1] = 0; rot[j + 2] = Math.random() * 6.3;
        }
      } else if (m === 3) { if (age[i] > rust[i]) { mode[i] = 4; age[i] = 0; } }
      else if (m === 4) { sc[i] = 1 - age[i] / 0.6; if (sc[i] <= 0) { mode[i] = 0; biljetten.setMatrixAt(i, NUL); continue; } }
      o3.position.set(pos[j], pos[j + 1], pos[j + 2]); o3.rotation.set(rot[j], rot[j + 1], rot[j + 2]); o3.scale.setScalar(sc[i]);
      o3.updateMatrix(); biljetten.setMatrixAt(i, o3.matrix);
    }
    biljetten.instanceMatrix.needsUpdate = true;
  }

  // --- rook van de joint ---
  const rook = [];
  for (let i = 0; i < 12; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex[i % 3], color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.visible = false; scene.add(sp); rook.push({ sp, age: 9, life: 1, v: new V3(), s0: 0.06, s1: 0.4, b: 0.3 });
  }
  let rookN = 0;
  function puf(p, v, life, s0, s1, b) {
    const r = rook[rookN++ % rook.length];
    r.sp.position.copy(p); r.v.copy(v); r.age = 0; r.life = life; r.s0 = s0; r.s1 = s1; r.b = b; r.sp.visible = true;
  }
  function updateRook(dt) {
    for (const r of rook) {
      if (!r.sp.visible) continue;
      r.age += dt;
      const t = r.age / r.life;
      if (t >= 1) { r.sp.visible = false; continue; }
      r.v.y += 0.15 * dt; r.v.multiplyScalar(Math.exp(-0.8 * dt));
      r.sp.position.addScaledVector(r.v, dt);
      r.sp.scale.setScalar(mix(r.s0, r.s1, Math.sqrt(t)));
      const b = r.b * Math.sin(Math.PI * Math.min(1, t * 1.6 + 0.1)) * (1 - t);
      r.sp.material.color.setRGB(b, b, b * 1.05);
    }
  }

  // --- toestand en animatie ---
  let regenTot = -1, lastDrop = -1, prevFlick = 0, prevBeat = -1, trekT = -9, volgendeTrek = 4, volgendePluim = 0, toss = -1;
  const REG = () => window.clubRegie || {};
  const stand = () => {
    if (beatPos < regenTot) return 'regen';
    const s = REG().stand;
    return s === 'break' ? 'break' : s === 'opbouw' ? 'opbouw' : 'groove';
  };
  const tipW = new V3(), snavelW = new V3();
  clubHooks.push((dt, now) => {
    if (!(dt >= 0)) return;
    const R0 = REG();
    if (R0.dropBeat >= 0 && R0.dropBeat !== lastDrop) { lastDrop = R0.dropBeat; regenTot = R0.dropBeat + 32; }
    const st = stand(), b = beatPos, f = b - Math.floor(b), beat = Math.floor(b);
    const k = 1 - Math.exp(-dt * 14);
    const zicht = Math.abs(camera.position.x) < 40 && Math.abs(camera.position.z) < 40;  // in het doolhof: alleen de biljetten afmaken

    // lijf: veren op de tel, swagger heen en weer, kop knikt (in de break de helft)
    const amp = st === 'regen' ? 1.5 : st === 'break' ? 0.45 : 1;
    const veer = Math.exp(-7 * f);
    lijf.position.y = -0.035 * amp * veer + (st === 'regen' ? 0.05 * Math.max(0, Math.sin(b * Math.PI)) : 0);
    lijf.rotation.z = 0.07 * amp * Math.sin(b * Math.PI);
    lijf.rotation.y = 0.14 * Math.sin(b * Math.PI / 4);
    lijf.rotation.x = -0.05;
    kop.rotation.x = 0.28 * amp * veer - 0.08;
    kop.rotation.z = -0.06 * Math.sin(b * Math.PI);
    hoed.position.y = 0.255 + 0.025 * amp * Math.max(0, Math.sin((f - 0.12) * Math.PI)) * (st === 'regen' ? 1 : 0.3);
    // rappen: ondersnavel op de achtsten, patroon per tel
    const lettergreep = Math.max(0, Math.sin((b * 2 % 1) * Math.PI));
    const rapt = st === 'break' ? 0 : ((beat * 7 + Math.floor(b * 2)) % 5 !== 0 ? 1 : 0);
    onder.rotation.x = mix(onder.rotation.x, 0.42 * lettergreep * rapt, k);

    // armen
    if (st === 'regen') {
      const p = (b * 2 + 0.5) % 1;
      zet(R, flick(p), 0.6);
      if (prevFlick < 0.5 && p >= 0.5) gooi(R.hand, 2 + (Math.random() < 0.5 ? 1 : 0), 1.3);
      prevFlick = p;
      const q = (b + 2) % 4;  // om de 4 tellen een handvol met links (loslaten op tel 2 van de 4)
      const e = q < 1.6 ? sm(q / 1.6) : q < 2 ? 1 : q < 2.8 ? 1 - sm((q - 2) / 0.8) : 0;
      zet(L, q < 2 ? blend(POSE.stapel, POSE.handvol, e) : blend(POSE.stapel, POSE.handvol, e), 0.5);
      if (beat !== toss && beat % 4 === 0) { toss = beat; gooi(L.hand, MOB ? 4 : 7, 1.8); }
    } else if (st === 'groove') {
      const p = (b + 0.5) % 1;
      zet(R, flick(p), 0.5);
      if (prevFlick < 0.5 && p >= 0.5) gooi(R.hand, Math.random() < 0.35 ? 2 : 1, 1);
      prevFlick = p;
      zet(L, POSE.stapel, k);
    } else if (st === 'opbouw') {  // stapel hoog in de lucht, zwaaien op de tel; rechts wijst naar de danseres
      zet(L, blend(POSE.hoog, POSE.handvol, 0.5 + 0.5 * Math.sin(b * Math.PI)), k);
      zet(R, POSE.klaar, k);
      prevFlick = 0;
    } else {  // break: chillen
      zet(L, blend(POSE.stapel, POSE.hang, 0.5), k * 0.5);
      zet(R, POSE.hang, k * 0.5);
      prevFlick = 0;
    }
    flap.visible = st === 'regen' || st === 'groove' ? ((st === 'regen' ? (b * 2 + 0.5) % 1 : (b + 0.5) % 1) < 0.5) : false;

    // joint: gloeit, af en toe een trekje (vaker in de break), dan een rookwolk uit de snavel
    if (now > volgendeTrek) { trekT = now; volgendeTrek = now + (st === 'break' ? 5 + Math.random() * 3 : 10 + Math.random() * 8); }
    const tr = now - trekT, trek = tr < 1.2 ? Math.sin(tr / 1.2 * Math.PI) : 0;
    tip.scale.setScalar(0.017 * (1 + 0.9 * trek + 0.15 * Math.sin(now * 9)));
    M.gloed.color.setRGB(1, 0.33 + 0.35 * trek, 0.08 + 0.15 * trek);
    if (zicht) {
      tip.getWorldPosition(tipW);
      if (now > volgendePluim) { volgendePluim = now + 0.45 + Math.random() * 0.4; puf(tipW, tmp.set((Math.random() - 0.5) * 0.06, 0.18, (Math.random() - 0.5) * 0.06), 2.2, 0.03, 0.22, 0.16); }
      if (tr > 1.5 && tr < 1.5 + dt * 1.01) {  // uitblazen: een wolk vooruit en omhoog
        onder.getWorldPosition(snavelW);
        for (let i = 0; i < 4; i++) puf(snavelW, tmp.copy(FWD).multiplyScalar(0.35 + i * 0.12).add(new V3((Math.random() - 0.5) * 0.15, 0.12 + Math.random() * 0.1, (Math.random() - 0.5) * 0.15)), 2.6 + i * 0.3, 0.08, 0.6 + i * 0.1, 0.32);
      }
    }
    updateBiljetten(Math.min(dt, 0.05));
    updateRook(dt);
    prevBeat = beat;
  });

  // --- camera ---
  const camV = new V3(), camL = new V3(), hoofd = new V3();
  function wegVanMensen(p) {  // niet in een hoofd van een voorbijganger
    for (const lijst of [walkers, crowd, dancers]) for (const d of lijst) {
      if (!d.root || !d.root.parent || !d.root.visible) continue;
      const dx = p.x - d.root.position.x, dz = p.z - d.root.position.z, a = Math.hypot(dx, dz);
      if (a < 0.5 && a > 1e-3) { p.x += dx / a * (0.5 - a); p.z += dz / a * (0.5 - a); }
    }
    return p;
  }
  SHOTS.eend = {
    get w() { return beatPos < regenTot ? 6 : 1.4; },
    beats: 16,
    make() { return { v: Math.floor(Math.random() * 3), k: Math.random() < 0.5 ? 1 : -1, cp: new V3(), init: false, lt: 0 }; },
    at(s, u, t) {
      const dt = Math.max(0, t - s.lt); s.lt = t;
      kop.getWorldPosition(hoofd); hoofd.y += 0.1;
      doel(tg);
      if (s.v === 0) {  // over zijn schouder naar de danseres, langzaam dichterbij
        const a = mix(2.0, 1.55, sm(u));
        camV.copy(HOME).addScaledVector(FWD, -a).addScaledVector(RIGHT, 0.6 * s.k); camV.y = mix(1.45, 1.35, u);
        camL.copy(tg).lerp(hoofd, 0.2); camFov = 50;
      } else if (s.v === 1) {  // van opzij: eend links/rechts, danseres aan de andere kant, de regen ertussen; langzaam dichterbij
        camL.copy(HOME).lerp(tg, 0.5); camL.y = 1.2;
        camV.copy(camL).addScaledVector(RIGHT, s.k * mix(3.3, 2.7, sm(u))).addScaledVector(FWD, -0.4); camV.y = 1.3;
        camFov = 50;
      } else {  // laag van schuin voor: held met de regen boven zich, de danseres erachter
        camV.copy(HOME).addScaledVector(FWD, 0.5).addScaledVector(RIGHT, s.k * mix(2.2, 1.9, u)); camV.y = mix(0.35, 0.45, u);
        camL.copy(hoofd).lerp(tg, 0.4); camFov = 54;
      }
      wegVanMensen(camV);
      if (!s.init) { s.cp.copy(camV); s.init = true; } else s.cp.lerp(camV, 1 - Math.exp(-dt * 5));
      camPos.copy(s.cp); camLook.copy(camL);
    },
  };
  const sel = document.getElementById('cam');
  if (sel && ![...sel.options].some(o => o.value === 'eend')) sel.add(new Option('Camera: Dagobling (eend)', 'eend'));

  window.clubEend = {
    root, biljetten,
    regen: (tellen = 32) => { regenTot = beatPos + tellen; },
    info: () => ({ stand: stand(), actief, gegooid, regenNog: Math.max(0, Math.round(regenTot - beatPos)), plek: [+HOME.x.toFixed(2), +HOME.z.toFixed(2)] }),
  };
})();

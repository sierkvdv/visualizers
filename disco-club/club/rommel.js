// --- Vloerrommel: bekers, blikjes, peuken en glowsticks die op de bas rammelen en weggeschopt worden, plus kabels met gaffatape ---
(() => {
  const YAX = new THREE.Vector3(0, 1, 0), XAX = new THREE.Vector3(1, 0, 0);
  const qA = new THREE.Quaternion(), qB = new THREE.Quaternion(), qC = new THREE.Quaternion(), qT = new THREE.Quaternion();
  const vP = new THREE.Vector3(), vS = new THREE.Vector3(), mT = new THREE.Matrix4(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const cT = new THREE.Color();

  // --- obstakels en ondergronden: rechthoek (k0), cilinder (k1), gedraaide stack (k2); top = hoogte ---
  const SH = [];
  const box = (x0, x1, z0, z1, top) => { const s = { k: 0, x0, x1, z0, z1, top }; SH.push(s); return s; };
  const cyl = (x, z, r, top) => { const s = { k: 1, x, z, r, top }; SH.push(s); return s; };
  box(-4.5, 4.5, -10.7, -6.5, 0.24);                                    // podium
  const SUB_L = box(-1.9, -0.3, -7.05, -6.35, 1.0), SUB_R = box(0.3, 1.9, -7.05, -6.35, 1.0);  // dj-subs
  const TABLE = box(-2, 2, -8.2, -7.0, 1.1);                            // dj-tafel
  for (const x of [-0.9, 0.9]) cyl(x, -7.6, 0.44, 1.25);               // draaitafels (vrij laten)
  for (const z of [-5.5, 0, 5.5]) { box(-14, -12.55, z - 1.7, z + 1.7, 0.6); cyl(-11.9, z, 0.47, 0.635); }  // lounge
  for (const [x, z] of [[10.6, 5], [10.6, -5], [-10.6, 5], [-10.6, -5], [5, 10.6], [-5, 10.6]]) box(x - 0.36, x + 0.36, z - 0.36, z + 0.36, 9);  // pilaren
  for (const f of FOGGERS) box(f.x - 0.24, f.x + 0.24, f.z - 0.31, f.z + 0.31, 0.36);  // rookmachines
  for (const P of POLES) cyl(P.x, P.z, P.r + 0.02, P.h);               // paalpodia
  box(11.6, 14, -4.7, 4.7, 9);                                         // bar: niet de bar in
  box(-7.8, 7.8, -14, -10.9, 9);                                       // ledwand
  const STACKS = [-1, 1].map(sx => {
    const ry = -sx * 0.45, s = { k: 2, x: sx * 8.4, z: -7.7, ax: Math.cos(ry), az: -Math.sin(ry), bx: Math.sin(ry), bz: Math.cos(ry), hx: 1.3, hz: 0.9, top: 9, ry };
    s.fx = s.x + s.bx * 0.95; s.fz = s.z + s.bz * 0.95;  // midden van het front
    SH.push(s); return s;
  });
  function inside(s, x, z, pad) {
    if (s.k === 0) return x > s.x0 - pad && x < s.x1 + pad && z > s.z0 - pad && z < s.z1 + pad;
    const dx = x - s.x, dz = z - s.z;
    if (s.k === 1) return dx * dx + dz * dz < (s.r + pad) * (s.r + pad);
    return Math.abs(dx * s.ax + dz * s.az) < s.hx + pad && Math.abs(dx * s.bx + dz * s.bz) < s.hz + pad;
  }
  // dansvloer: tegels tot 0,03 hoog, ledstrip (6,1..6,2) tot 0,07
  const floorY = (x, z) => { const m = Math.max(Math.abs(x), Math.abs(z)); return m < 6.1 ? 0.03 : m < 6.2 ? 0.07 : 0; };
  // groundAt/blocked lopen elk beeld voor elk trillend of rollend ding over alle vormen: de vormen daarvoor als getallen op een rij
  // (drie soorten objecten door elkaar lezen maakte bij elke kommagetal-lezing een nieuw getal-object = afval per beeld). Zelfde som als inside().
  let SHN = 0, SHF = null;
  function vormenPak() {  // per vorm 10 getallen: soort, top, dan de maten van die soort
    SHN = SH.length; SHF = new Float64Array(SHN * 10);
    for (let i = 0; i < SHN; i++) {
      const s = SH[i], o = i * 10;
      SHF[o] = s.k; SHF[o + 1] = s.top;
      if (s.k === 0) { SHF[o + 2] = s.x0; SHF[o + 3] = s.x1; SHF[o + 4] = s.z0; SHF[o + 5] = s.z1; }
      else if (s.k === 1) { SHF[o + 2] = s.x; SHF[o + 3] = s.z; SHF[o + 4] = s.r; }
      else { SHF[o + 2] = s.x; SHF[o + 3] = s.z; SHF[o + 4] = s.ax; SHF[o + 5] = s.az; SHF[o + 6] = s.bx; SHF[o + 7] = s.bz; SHF[o + 8] = s.hx; SHF[o + 9] = s.hz; }
    }
  }
  function binnenF(F, o, x, z, pad) {  // = inside(SH[o / 10], x, z, pad)
    const k = F[o];
    if (k === 0) return x > F[o + 2] - pad && x < F[o + 3] + pad && z > F[o + 4] - pad && z < F[o + 5] + pad;
    const dx = x - F[o + 2], dz = z - F[o + 3];
    if (k === 1) { const r = F[o + 4] + pad; return dx * dx + dz * dz < r * r; }
    return Math.abs(dx * F[o + 4] + dz * F[o + 5]) < F[o + 8] + pad && Math.abs(dx * F[o + 6] + dz * F[o + 7]) < F[o + 9] + pad;
  }
  function groundAt(x, z, y) {
    let g = floorY(x, z);
    if (SHN !== SH.length) vormenPak();
    const F = SHF, yt = y + 0.04;
    for (let o = 0, e = SHN * 10; o < e; o += 10) { const top = F[o + 1]; if (top <= yt && top > g && binnenF(F, o, x, z, 0)) g = top; }
    return g;
  }
  function blocked(x, z, y, pad = 0) {
    if (Math.abs(x) > 13.8 - pad || Math.abs(z) > 13.8 - pad) return true;
    if (y < 0.03 && Math.abs(x) < 6.2 + pad && Math.abs(z) < 6.2 + pad) return true;  // ledstrip = stoeprand: vloerrommel schuift de dansvloer niet op
    if (SHN !== SH.length) vormenPak();
    const F = SHF, yt = y + 0.04;
    for (let o = 0, e = SHN * 10; o < e; o += 10) if (F[o + 1] > yt && binnenF(F, o, x, z, pad)) return true;
    return false;
  }
  const stackDist = (x, z) => { let d = 1e9; for (const s of STACKS) d = Math.min(d, Math.hypot(x - s.fx, z - s.fz)); return d; };
  function ringDist(x, z) {  // afstand tot de looproute
    let d = 1e9;
    for (let i = 0; i < RING.length - 1; i++) {
      const [ax, az] = RING[i], [bx, bz] = RING[i + 1], ex = bx - ax, ez = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez)));
      d = Math.min(d, Math.hypot(x - ax - ex * t, z - az - ez * t));
    }
    return d;
  }
  // stekkerdozen voor de stacks (ook plek die vrij moet blijven)
  const DOOS = [-1, 1].map(sx => ({ sx, x: sx * 6.95, z: -7.05, ry: -sx * 0.45 }));
  for (const d of DOOS) SH.push({ k: 2, x: d.x, z: d.z, ax: Math.cos(d.ry), az: -Math.sin(d.ry), bx: Math.sin(d.ry), bz: Math.cos(d.ry), hx: 0.2, hz: 0.045, top: 0.05 });
  function freeSpot(x, z, pad) {
    if (Math.abs(x) < 6.28 && Math.abs(z) < 6.28) return false;  // niet op de dansvloer of de ledstrips
    for (const dx of [0, -9, 9]) if (z > 12.4 && Math.abs(x - dx) < 1.2) return false;  // ingang, wc-deur en DEEPER vrijhouden
    if (blocked(x, z, 0, pad) || ringDist(x, z) < 0.42) return false;
    for (const c of CROWD_SPOTS) if (Math.hypot(x - c[0], z - c[1]) < 0.32) return false;
    for (const d of DOOS) if (Math.hypot(x - d.x, z - d.z) < 0.32) return false;
    return true;
  }
  const ZONES = {
    bar: () => [rnd(10.3, 11.5), rnd(-4.5, 4.5)],
    lounge: () => [rnd(-12.4, -11.3), pick([-5.5, 0, 5.5]) + rnd(-1.6, 1.6)],
    wc: () => [rnd(-7.5, -6), rnd(12.5, 13.6)],
    ingang: () => [rnd(-2.5, 2.5), rnd(12.2, 13.6)],
    stack: () => [pick([-1, 1]) * rnd(7, 10), rnd(-9, -6.5)],
    voor: () => [rnd(-3.6, 3.6), rnd(6.35, 6.95)],                    // voorrand: voorgrond van het shot 'voeten'
    zij: () => [pick([-1, 1]) * rnd(6.35, 7.0), rnd(-5.8, 6.2)],
    hoek: () => [pick([-1, 1]) * rnd(4.4, 6.0), rnd(6.35, 7.0)],      // naast de voorste rookmachines: voorgrond voor de buitenbanen van 'voeten'
    paal: () => { const P = pick(POLES), a = rnd(0, TAU), d = P.r + rnd(0.08, 0.45); return [P.x + Math.cos(a) * d, P.z + Math.sin(a) * d]; },
  };
  function place(zone, pad) {
    for (let k = 0; k < 40; k++) { const [x, z] = ZONES[zone](); if (freeSpot(x, z, pad)) return [x, z]; }
    return null;
  }
  //            zone      bekers blikjes peuken glow
  const PLAN = [['bar', 18, 7, 25, 3], ['lounge', 8, 4, 50, 1], ['wc', 6, 3, 18, 1], ['ingang', 6, 2, 20, 2],
                ['stack', 14, 5, 12, 4], ['voor', 9, 2, 5, 3], ['zij', 7, 1, 5, 2], ['paal', 6, 1, 5, 2], ['hoek', 3, 1, 4, 1]];
  const sum = k => PLAN.reduce((a, p) => a + p[k], 0);

  // --- soorten: maten, liggende kanteling (bekers zijn taps), wrijving ---
  const KIND = {
    cup: { rT: 0.045, rB: 0.032, hh: 0.06, rr: 0.0385, lie: Math.PI / 2 - Math.atan(0.013 / 0.12), fr: 3, hop: true },
    can: { rT: 0.033, rB: 0.033, hh: 0.061, rr: 0.033, lie: Math.PI / 2, fr: 2.6, hop: true },
    glow: { rT: 0.0065, rB: 0.0065, hh: 0.0815, rr: 0.0065, lie: Math.PI / 2, fr: 3.4, hop: false },
  };

  // bekers: hard doorschijnend plastic, open bovenkant
  const SURF_CUPS = [[SUB_L, -1.55, -6.62], [SUB_L, -0.68, -6.74], [SUB_R, 0.72, -6.6], [SUB_R, 1.58, -6.76],
                     [TABLE, -1.52, -7.42], [TABLE, -1.8, -7.8], [TABLE, 1.55, -7.5], [TABLE, 1.84, -7.84]];
  const SURF_CANS = [[SUB_L, -1.12, -6.52], [SUB_R, 1.2, -6.5]];
  const LOUNGE_CUPS = 4, SPARE_CUP = 8, SPARE_CAN = 2;
  const N_CUP = sum(1) + SURF_CUPS.length + LOUNGE_CUPS + SPARE_CUP, N_CAN = sum(2) + SURF_CANS.length + SPARE_CAN, N_BUTT = sum(3), N_GLOW = sum(4);
  const cupMat = new THREE.MeshPhongMaterial({ color: 0xffffff, specular: 0xffffff, shininess: 140, envMap: envRT.texture, combine: THREE.MixOperation, reflectivity: 0.22,
    emissive: 0x0e1014, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
  const cups = new THREE.InstancedMesh(new THREE.CylinderGeometry(KIND.cup.rT, KIND.cup.rB, KIND.cup.hh * 2, 16, 1, true), cupMat, N_CUP);
  // blikjes: etiket met twee ronde logo's (zodat je ze ziet rollen), metalen deksel
  const canTex = canvasTexture(256, 128, (g, w, h) => {
    g.fillStyle = '#f0f0f0'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c3c7cd'; g.fillRect(0, 0, w, h * 0.09); g.fillRect(0, h * 0.91, w, h * 0.09);
    g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(0, h * 0.09, w, 2); g.fillRect(0, h * 0.91 - 2, w, 2);
    g.fillStyle = 'rgba(15,15,20,0.6)'; g.beginPath(); g.moveTo(0, h * 0.66); g.lineTo(w, h * 0.36); g.lineTo(w, h * 0.5); g.lineTo(0, h * 0.8); g.fill();
    for (const cx of [w * 0.25, w * 0.75]) {
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(cx, h * 0.5, h * 0.21, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.65)'; g.lineWidth = 5; g.stroke();
      g.fillStyle = 'rgba(0,0,0,0.75)'; g.beginPath();
      for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, r = i % 2 ? h * 0.06 : h * 0.14; g.lineTo(cx + Math.cos(a) * r, h * 0.5 + Math.sin(a) * r); }
      g.fill();
    }
  });
  const canMat = new THREE.MeshPhongMaterial({ map: canTex, specular: 0xcccccc, shininess: 90, envMap: envRT.texture, combine: THREE.MixOperation, reflectivity: 0.3 });
  const lidMat = new THREE.MeshPhongMaterial({ color: 0xb8bcc4, specular: 0xffffff, shininess: 110, envMap: envRT.texture, combine: THREE.MixOperation, reflectivity: 0.45 });
  const cans = new THREE.InstancedMesh(new THREE.CylinderGeometry(KIND.can.rT, KIND.can.rB, KIND.can.hh * 2, 16), [canMat, lidMat, lidMat], N_CAN);
  // peuken: één staafje met kleuren per hoekpunt (oranje filter, wit papier, askop)
  const buttGeo = new THREE.CylinderGeometry(0.0042, 0.0042, 0.032, 6, 6);
  {
    const p = buttGeo.attributes.position, col = new Float32Array(p.count * 3), F = new THREE.Color(0xc9803a), Pp = new THREE.Color(0xe9e4da), A = new THREE.Color(0x3a3632);
    for (let i = 0; i < p.count; i++) { const y = p.getY(i), c = y < -0.004 ? F : y > 0.013 ? A : Pp; col.set([c.r, c.g, c.b], i * 3); }
    buttGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const butts = new THREE.InstancedMesh(buttGeo, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x0b0b0b }), N_BUTT);
  // glowsticks: dunne capsules, additief, met een gloedvlek eronder op de vloer
  const glowGeo = capsule(0.0065, 0.0065, 0.15).clone(); glowGeo.translate(0, 0.075, 0);
  const glowM = additive(0xffffff, 1);
  const glows = new THREE.InstancedMesh(glowGeo, glowM, N_GLOW);
  const discTex = canvasTexture(64, 64, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  const discGeo = new THREE.PlaneGeometry(1, 1); discGeo.rotateX(-Math.PI / 2);
  const discM = new THREE.MeshBasicMaterial({ map: discTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const discs = new THREE.InstancedMesh(discGeo, discM, N_GLOW);
  const MESHES = [cups, cans, butts, glows, discs];
  for (const m of MESHES) { m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.userData.d = false; scene.add(m); }

  // --- items: eigen staat per stuk (positie = laagste punt, snelheid, draai, kanteling, rol, 'beweegt') ---
  const items = [], SPOTS = [];
  const ni = { cup: 0, can: 0, glow: 0 };
  const MESH = { cup: cups, can: cans, glow: glows };
  function mk(kind, x, z, y, o = {}) {
    const K = KIND[kind], i = ni[kind]++;
    const it = { K, kind, mesh: MESH[kind], i, on: !!o.on, x, y, z, g: y, vx: 0, vy: 0, vz: 0, yaw: rnd(0, TAU), tilt: 0, tt: 0, roll: rnd(0, TAU), spin: 0, tr: 0,
                 tumb: false, mv: false, zone: 0, ca: 0, cb: 0, ph: rnd(0, 100), sx: 1, sy: 1, sz: 1, flat: false, lv: 0, fell: 0, kt: 0 };
    if (o.lying) { it.tilt = it.tt = (Math.random() < 0.5 ? 1 : -1) * K.lie; }
    if (o.home) { it.hx = x; it.hz = z; }  // eigen plek: daar gaat het (buiten beeld) terug als het ver weg is geschopt
    items.push(it);
    return it;
  }
  const CUP_COL = [0xe6eef4, 0xe6eef4, 0xdfe8ee, 0xf2dca0, 0xeed49a, 0xd8e4f0, 0xcfe0d8];
  const CAN_COL = [0xc8102e, 0x1d9a3c, 0x1e50c8, 0xd9a521, 0xd0d4da, 0x2c2c32, 0xe85d10, 0x7a1fa8];
  const GLOW_COL = [0x39ff14, 0xff2bd6, 0xfff01f].map(c => new THREE.Color(c));
  const color = (it, c) => it.mesh.setColorAt(it.i, cT.set(c));

  for (const [zone, nCup, nCan, , nGlow] of PLAN) {
    for (let k = 0; k < nCup; k++) {
      const p = place(zone, 0.08), it = mk('cup', p ? p[0] : 0, p ? p[1] : 0, 0, { on: !!p, home: !!p, lying: Math.random() < 0.6 });
      color(it, pick(CUP_COL));
      if (p && Math.random() < 0.09) { it.flat = true; it.tilt = it.tt = Math.PI / 2; it.roll = 0; it.sx = rnd(1.25, 1.45); it.sz = rnd(0.2, 0.32); it.sy = rnd(0.85, 1); }  // platgetrapt (roll 0: de platte kant blijft onder)
    }
    for (let k = 0; k < nCan; k++) {
      const p = place(zone, 0.08), it = mk('can', p ? p[0] : 0, p ? p[1] : 0, 0, { on: !!p, home: !!p, lying: true });
      color(it, pick(CAN_COL));
      it.sx = rnd(0.84, 1); it.sy = rnd(0.9, 1);  // iets gedeukt
    }
    for (let k = 0; k < nGlow; k++) {
      const p = place(zone, 0.1), it = mk('glow', p ? p[0] : 0, p ? p[1] : 0, 0, { on: !!p, home: !!p, lying: true });
      it.col = GLOW_COL[(it.i + k) % 3];
      glows.setColorAt(it.i, it.col); discs.setColorAt(it.i, it.col);
    }
  }
  // op de subs en de dj-tafel: rechtop, en elk plekje onthoudt zijn beker (voor het stille bijzetten)
  for (const [s, x, z] of SURF_CUPS) { const it = mk('cup', x, z, s.top, { on: true }); color(it, pick(CUP_COL)); SPOTS.push({ s, x, z, kind: 'cup', it, lost: false, at: 0 }); }
  for (const [s, x, z] of SURF_CANS) { const it = mk('can', x, z, s.top, { on: true }); color(it, pick(CAN_COL)); SPOTS.push({ s, x, z, kind: 'can', it, lost: false, at: 0 }); }
  // een paar bekers op de loungetafels (blijven staan)
  for (let k = 0; k < LOUNGE_CUPS; k++) { const z0 = [-5.5, 0, 5.5, 0][k]; const it = mk('cup', -11.9 + rnd(-0.22, 0.22), z0 + rnd(-0.22, 0.22), 0.635, { on: true }); color(it, pick(CUP_COL)); }
  // reserve voor het bijzetten
  for (let k = 0; k < SPARE_CUP; k++) color(mk('cup', 0, 0, 0), pick(CUP_COL));
  for (let k = 0; k < SPARE_CAN; k++) color(mk('can', 0, 0, 0), pick(CAN_COL));

  // peuken: liggen plat en blijven liggen
  {
    let i = 0;
    for (const [zone, , , nButt] of PLAN) for (let k = 0; k < nButt; k++) {
      const p = place(zone, 0.03);
      if (!p) { butts.setMatrixAt(i, ZERO); butts.setColorAt(i++, white); continue; }
      const len = rnd(0.55, 1);  // opgerookt tot het filter
      qA.setFromAxisAngle(YAX, rnd(0, TAU)); qB.setFromAxisAngle(XAX, Math.PI / 2 + rnd(-0.06, 0.06)); qT.copy(qA).multiply(qB);
      vP.set(p[0], 0.0045, p[1]); vS.set(1, len, rnd(0.75, 1));
      butts.setMatrixAt(i, mT.compose(vP, qT, vS));
      butts.setColorAt(i++, cT.setScalar(rnd(0.55, 1)));
    }
  }

  // --- matrix van één item (met rammel-offsets als het op de bas trilt) ---
  function rest(it, t) {  // hoogte van het midden boven het laagste punt
    const K = it.K, c = Math.cos(t), s = Math.abs(Math.sin(t));
    return Math.max(K.hh * it.sy * c + K.rB * it.sz * s, -K.hh * it.sy * c + K.rT * it.sz * s);
  }
  function write(it, vib, now) {
    if (!it.on) { it.mesh.setMatrixAt(it.i, ZERO); it.mesh.userData.d = true; if (it.kind === 'glow') { discs.setMatrixAt(it.i, ZERO); discs.userData.d = true; } return; }
    let hop = 0, wt = 0, wy = 0;
    if (vib > 0.01) {
      const a = it.zone === 2 ? 1 : 0.45;
      hop = a * 0.03 * vib * (0.55 + 0.45 * Math.sin(now * 47 + it.ph));
      wt = a * 0.18 * vib * Math.sin(now * 33 + it.ph * 3);
      wy = a * 0.08 * vib * Math.sin(now * 21 + it.ph * 2);
    }
    const t = it.tilt + wt;
    qA.setFromAxisAngle(YAX, it.yaw + wy); qB.setFromAxisAngle(XAX, t); qC.setFromAxisAngle(YAX, it.roll);
    qT.copy(qA).multiply(qB).multiply(qC);
    vP.set(it.x, it.y + rest(it, t) + hop, it.z); vS.set(it.sx, it.sy, it.sz);
    it.mesh.setMatrixAt(it.i, mT.compose(vP, qT, vS)); it.mesh.userData.d = true;
    if (it.kind === 'glow') {  // gloedvlek plat op de grond, langs de staaf
      qA.setFromAxisAngle(YAX, it.yaw); vP.set(it.x, it.g + 0.008, it.z); vS.set(0.22, 1, 0.42);
      discs.setMatrixAt(it.i, mT.compose(vP, qA, vS)); discs.userData.d = true;
    }
  }
  // trilzone: 2 = op een sub of de dj-tafel, 1 = op de vloer binnen 3 m van een stackfront
  function setZone(it) {
    it.zone = 0;
    if (it.kind === 'glow' || !it.on) return;
    if (it.y > 0.9) { it.zone = 2; it.cb = rnd(-0.35, 0.35); }  // kruipt naar de voorrand
    else if (it.y < 0.35 && stackDist(it.x, it.z) < 3) {
      const s = it.x < 0 ? STACKS[0] : STACKS[1];
      it.zone = 1; it.cb = Math.atan2(it.x - s.x, it.z - s.z);  // weg van de stack
    }
    it.ca = it.cb + rnd(-0.6, 0.6);
  }
  for (const it of items) { setZone(it); write(it, 0, 0); }

  // --- natuurkunde voor wat beweegt: glijden/rollen met wrijving, vallen, tuimelen, kantelen ---
  function step(it, dt, now) {
    let nx = it.x + it.vx * dt;
    if (blocked(nx, it.z, it.y)) { it.vx *= -0.35; nx = it.x; }
    it.x = nx;
    let nz = it.z + it.vz * dt;
    if (blocked(it.x, nz, it.y)) { it.vz *= -0.35; nz = it.z; }
    it.z = nz;
    const g = groundAt(it.x, it.z, it.y);
    it.g = g;
    if (it.y > g + 0.001 || it.vy > 0) {  // in de lucht
      it.vy -= 9.8 * dt; it.y += it.vy * dt;
      if (it.tumb) it.tilt += it.tr * dt;
    }
    if (it.y <= g + 0.001 && it.vy <= 0) {  // op de grond, ook na een hupje van minder dan 1 mm (anders bleef vy hangen: nooit wrijving, nooit stil)
      it.y = g;
      if (it.vy < -0.9) { it.vy *= -0.28; it.vx *= 0.7; it.vz *= 0.7; } else it.vy = 0;
      if (it.tumb) {  // neergekomen: op zijn kant
        it.tumb = false; it.fell = now;
        const t = Math.atan2(Math.sin(it.tilt), Math.cos(it.tilt));
        it.tilt = t; it.tt = (t >= 0 ? 1 : -1) * it.K.lie; it.spin += rnd(-4, 4);
      }
    }
    const onG = it.y <= g + 0.001 && it.vy === 0;
    if (onG) { const f = Math.exp(-(it.flat ? 6 : it.K.fr) * dt); it.vx *= f; it.vz *= f; }
    it.yaw += it.spin * dt; it.spin *= Math.exp(-(onG ? 5 : 0.5) * dt);
    if (!it.flat && Math.abs(Math.sin(it.tilt)) > 0.7) {  // rollen om de eigen as
      const vp = it.vx * Math.cos(it.yaw) - it.vz * Math.sin(it.yaw);
      it.roll -= Math.sign(Math.sin(it.tilt)) * vp / it.K.rr * dt;
    }
    if (!it.tumb && it.tilt !== it.tt) { const d = it.tt - it.tilt, st = 9 * dt; it.tilt = Math.abs(d) < st ? it.tt : it.tilt + Math.sign(d) * st; }
    if (onG && !it.tumb && it.tilt === it.tt && it.vx * it.vx + it.vz * it.vz < 0.0009 && Math.abs(it.spin) < 0.1) {
      it.mv = false; it.vx = it.vz = it.vy = 0; it.spin = 0; setZone(it);
    }
  }
  // langzaam kruipen op de trillingen; over de rand van een sub of tafel = vallen
  function creep(it, dt, vib, now) {
    if (vib < 0.02) return;
    it.ca += (Math.random() - 0.5) * dt * 5 + (it.cb - it.ca) * dt * 0.4;
    const sp = (it.zone === 2 ? 0.07 : 0.012) * vib * dt, sx = Math.sin(it.ca), sz = Math.cos(it.ca);
    const nx = it.x + sx * sp, nz = it.z + sz * sp;
    if (blocked(nx, nz, it.y)) return;
    it.x = nx; it.z = nz;
    if (groundAt(nx, nz, it.y) < it.y - 0.005) {
      it.mv = true; it.zone = 0; it.fell = now;
      it.vx = sx * 0.15; it.vz = sz * 0.15; it.vy = 0.1;  // zacht over de rand: landt in de kier vóór de sub, niet op de ledstrip
      if (Math.abs(Math.sin(it.tilt)) < 0.5) { it.tumb = true; it.yaw = it.ca; it.tr = rnd(7, 11); }
    } else if (it.zone === 1 && stackDist(nx, nz) > 3) it.zone = 0;
  }

  // --- wegschoppen: lopers en wormen (0,3 m) geven één schop per keer, de slak (rand van zijn voet) schuift opzij; cap = max. schopsnelheid ---
  const prev = new Map();
  function kicker(o, R, plow, dt, active, cap, now) {
    const p = o.position;
    let q = prev.get(o);
    if (!q) { prev.set(o, p.clone()); return; }
    const dx = p.x - q.x, dz = p.z - q.z;
    q.copy(p);
    const d2 = dx * dx + dz * dz;
    if (!active || d2 > 1 || d2 < 1e-8) return;  // stilstaand of verspringend: niets
    const sp = Math.sqrt(d2) / dt, mx = dx / Math.sqrt(d2), mz = dz / Math.sqrt(d2);  // snelheid en looprichting
    if (sp < 0.05) return;
    for (let i = 0; i < items.length; i++) {  // indexlus: geen iterator per aanroep
      const it = items[i];
      if (!it.on || it.y > 0.35) continue;
      const ex = it.x - p.x, ez = it.z - p.z, e2 = ex * ex + ez * ez;
      if (e2 > R * R) continue;
      const e = Math.sqrt(e2) || 0.001, ux = ex / e, uz = ez / e;
      if (plow) {  // sneeuwschuiver: alleen wat vóór hem ligt, schuin opzij; kan het niet opzij, dan glijdt hij eroverheen
        if (ux * mx + uz * mz < 0.2) continue;
        const sg = uz * mx - ux * mz >= 0 ? 1 : -1;
        let wx = ux - mz * sg * 0.45, wz = uz + mx * sg * 0.45;
        const wl = Math.hypot(wx, wz); wx /= wl; wz /= wl;
        const nx = p.x + wx * R * 1.02, nz = p.z + wz * R * 1.02;
        if (blocked(nx, nz, it.y)) continue;
        it.x = nx; it.z = nz;
        it.vx = dx / dt + wx * 0.25; it.vz = dz / dt + wz * 0.25;
        it.spin += rnd(-1, 1);
      } else {
        if (it.kt > now || sp < 0.5) continue;  // net geschopt (niet elke frame opnieuw: dan zweeft of dribbelt het mee), of schuifelend: geen schop
        it.kt = now + 1.2;
        const nx = it.x + dx, nz = it.z + dz;
        if (!blocked(nx, nz, it.y)) { it.x = nx; it.z = nz; }
        // in de looprichting, schuin weg naar de kant waar het lag
        const al = ex * mx + ez * mz;
        let px = ex - mx * al, pz = ez - mz * al, pl = Math.hypot(px, pz);
        if (pl < 1e-3) { const sg = Math.random() < 0.5 ? -1 : 1; px = -mz * sg; pz = mx * sg; pl = 1; }
        const a = rnd(0.35, 1.1), ca = Math.cos(a), sa = Math.sin(a), v = Math.min(cap, sp * rnd(1.1, 1.7));
        it.vx = (mx * ca + px / pl * sa) * v; it.vz = (mz * ca + pz / pl * sa) * v;
        it.spin = rnd(-12, 12);
        if (it.K.hop) it.vy = Math.max(it.vy, Math.min(0.55, rnd(0.3, 0.9) * v * 0.5));  // hupje, nooit over de ledstrip
      }
      if (!it.flat && Math.abs(Math.sin(it.tt)) < 0.5) { it.yaw = Math.atan2(it.vx, it.vz); it.tt = it.K.lie; }  // rechtop: omver
      it.mv = true; it.zone = 0;
    }
  }

  // --- plakkerige plassen bij bar en speakers: donker en glanzend, vangen de kleuren van de lichtshow ---
  function merge(geos) {
    let nv = 0, nIdx = 0;
    for (const g of geos) { nv += g.attributes.position.count; nIdx += g.index ? g.index.count : g.attributes.position.count; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), idx = new Uint32Array(nIdx);
    let ov = 0, oi = 0;
    for (const g of geos) {
      const c = g.attributes.position.count;
      pos.set(g.attributes.position.array, ov * 3); nor.set(g.attributes.normal.array, ov * 3);
      if (g.index) for (let i = 0; i < g.index.count; i++) idx[oi++] = g.index.array[i] + ov; else for (let i = 0; i < c; i++) idx[oi++] = i + ov;
      ov += c; g.dispose();
    }
    const m = new THREE.BufferGeometry();
    m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); m.setIndex(new THREE.BufferAttribute(idx, 1));
    return m;
  }
  const pudMats = [0, 1].map(() => new THREE.MeshPhongMaterial({ color: 0x0b0806, specular: 0xffffff, shininess: 180, envMap: envRT.texture, combine: THREE.MixOperation, reflectivity: 0.32,
    emissive: 0x000000, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  {
    const PUD = [[10.75, -2.1, 0.55, 0.34, 0.3], [10.95, 1.15, 0.42, 0.66, -0.2], [10.6, 3.65, 0.38, 0.28, 0.8],
                 [7.6, -6.3, 0.62, 0.36, -0.4], [-8.3, -6.0, 0.7, 0.4, 0.45], [-9.75, -6.6, 0.4, 0.3, 0.1]];
    const parts = [[], []];
    PUD.forEach(([x, z, rx, rz, rot], n) => {
      const sh = new THREE.Shape(), a1 = rnd(0, TAU), a2 = rnd(0, TAU);
      for (let i = 0; i < 32; i++) {
        const a = i / 32 * TAU, r = 1 + 0.16 * Math.sin(3 * a + a1) + 0.09 * Math.sin(5 * a + a2) + 0.05 * Math.sin(9 * a);
        i ? sh.lineTo(Math.cos(a) * r * rx, Math.sin(a) * r * rz) : sh.moveTo(Math.cos(a) * r * rx, Math.sin(a) * r * rz);
      }
      const g = new THREE.ShapeGeometry(sh); g.rotateX(-Math.PI / 2); g.rotateY(rot); g.translate(x, 0.005, z);
      parts[n & 1].push(g);
    });
    parts.forEach((p, k) => scene.add(new THREE.Mesh(merge(p), pudMats[k])));
  }

  // --- kabels: zwart rubber, plat op de vloer en licht slingerend, met om de 0,7 m een strook grijze gaffatape ---
  const RC = 0.011, UP = 0.24 + RC;
  const ROUTES = [];
  for (const sx of [-1, 1]) {
    const m = pts => pts.map(([x, y, z]) => new THREE.Vector3(sx * x, y, z));
    // podium (vanuit de dj-tafel) over de rand naar de stekkerdoos, en van de doos de stack in
    ROUTES.push(m([[1.94, UP, -8.0], [2.6, UP, -8.35], [3.4, UP, -8.15], [4.05, UP, -8.3], [4.42, UP, -8.24], [4.57, 0.15, -8.2], [4.74, RC, -8.15],
                   [5.3, RC, -7.92], [5.85, RC, -8.05], [6.35, RC, -7.62], [6.86, 0.02, -7.09]]));
    ROUTES.push(m([[7.08, 0.02, -6.99], [7.3, RC, -7.12], [7.45, RC, -7.35], [7.55, RC, -7.6]]));
    // achterste rookmachine langs de podiumrand, omhoog het podium op, naar de dj-tafel
    ROUTES.push(m([[2.7, 0.05, -6.3], [2.95, RC, -6.33], [3.35, RC, -6.36], [3.62, RC, -6.4], [3.71, 0.13, -6.465], [3.75, UP, -6.6],
                   [3.6, UP, -6.95], [3.0, UP, -7.25], [2.35, UP, -7.4], [1.94, UP, -7.42]]));
    // voorste rookmachine naar de pilaarvoet
    ROUTES.push(m([[4.0, 0.05, 6.95], [4.08, RC, 7.2], [4.25, RC, 7.75], [4.12, RC, 8.4], [4.45, RC, 9.1], [4.62, RC, 9.7], [4.85, RC, 10.1], [5.0, RC, 10.42]]));
  }
  {
    const tubes = [], tp = [], ti = [];
    const W = [-0.075, -0.05, -0.03, -0.019, -0.012, -0.006, 0, 0.006, 0.012, 0.019, 0.03, 0.05, 0.075], R2 = RC + 0.0015;
    const t3 = new THREE.Vector3(), p3 = new THREE.Vector3();
    for (const pts of ROUTES) {
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal'), L = curve.getLength();
      tubes.push(new THREE.TubeGeometry(curve, Math.max(8, Math.ceil(L * 14)), RC, 6, false));
      for (let s = 0.35; s < L - 0.25; s += 0.7) {  // tape dwars over de kabel, als een tentje
        curve.getPointAt(s / L, p3); curve.getTangentAt(s / L, t3);
        if (Math.abs(t3.y) > 0.2) continue;
        t3.y = 0; t3.normalize();
        const ax = t3.z, az = -t3.x, base = p3.y - RC, o = tp.length / 3;
        for (const along of [-0.025, 0.025]) for (const w of W) {
          const h = Math.abs(w) < R2 ? RC + Math.sqrt(R2 * R2 - w * w) : 0.0015;
          tp.push(p3.x + ax * w + t3.x * along, base + h, p3.z + az * w + t3.z * along);
        }
        for (let i = 0; i < W.length - 1; i++) { const a = o + i, b = a + 1, c = a + W.length, d = c + 1; ti.push(a, c, b, b, c, d); }
      }
    }
    add(scene, merge(tubes), std(0x0c0c0e, 0.45, 0.1));
    const tape = new THREE.BufferGeometry();
    tape.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3)); tape.setIndex(ti); tape.computeVertexNormals();
    const tapeMat = std(0x8e8e92, 0.85); tapeMat.side = THREE.DoubleSide; tapeMat.polygonOffset = true; tapeMat.polygonOffsetFactor = -1; tapeMat.polygonOffsetUnits = -1;
    add(scene, tape, tapeMat);
  }
  // stekkerdoos bij elke stack, met een rood gloeiend schakelaartje
  const switchMat = glowMat(0xff2020);
  {
    const body = std(0x1a1a1f, 0.55, 0.2), hole = std(0x050506, 0.9), plug = std(0x101013, 0.5);
    for (const d of DOOS) {
      const g = new THREE.Group(); g.position.set(d.x, 0, d.z); g.rotation.y = d.ry; scene.add(g);
      add(g, BOX, body, [0, 0.0225, 0], [0.38, 0.045, 0.075]);
      for (const x of [-0.06, 0.04, 0.14]) add(g, BOX, hole, [x, 0.046, 0], [0.045, 0.003, 0.045]);
      add(g, BOX, plug, [0.14 * d.sx, 0.064, 0], [0.042, 0.036, 0.042]);
      add(g, BOX, switchMat, [-0.15 * d.sx, 0.052, 0], [0.03, 0.016, 0.04]);
    }
  }

  // --- camerashot: op 25 cm hoogte langs de voorrand, rommel in de voorgrond en dansende benen erachter ---
  // De slak (voet ~1,6 m) en zijn wormenkring (r 2,5..3,1) glijden over de looproute vlak achter de camera:
  // voorspel hun middelpunt over het shot en houd de camera minstens 3,6 m weg (anders zit hij in de slak of een worm).
  const DANGER = [];
  function dangerTrack(T) {
    DANGER.length = 0;
    if (!slug) { if (worms.length) DANGER.push(0, 8); return; }  // zonder slak rennen de wormen rond (0, 8)
    let x = slug.root.position.x, z = slug.root.position.z, idx = slugIdx, dir = slugDir;
    DANGER.push(x, z);
    for (let k = 0; k < 6; k++) {  // zelfde heen-en-weer over RING als updateSlug, 0,32 m/s
      let left = 0.32 * T / 6;
      for (let g = 0; g < 4 && left > 1e-4; g++) {
        const q = RING[idx], dx = q[0] - x, dz = q[1] - z, d = Math.hypot(dx, dz);
        if (d <= left) { x = q[0]; z = q[1]; left -= d; if (idx + dir < 0 || idx + dir >= RING.length) dir = -dir; idx += dir; }
        else { x += dx / d * left; z += dz / d * left; left = 0; }
      }
      DANGER.push(x, z);
    }
  }
  // banen op z 7,25: tussen de voorste rookmachines door (|x| <= 3,3) of erbuiten (4,9..6,2, naar binnen rijdend)
  function plan(safeOnly) {
    dangerTrack(8 * Math.max(0.3, Math.min(1, period)));
    const need = worms.length ? 3.6 : 2.4;
    let best = null, bs = -1e9;
    for (let k = 0; k < 18; k++) {
      let dir, x0, x1;
      if (k % 3 === 0) { dir = pick([-1, 1]); x0 = dir * rnd(-3.3, -0.8); x1 = Math.max(-3.3, Math.min(3.3, x0 + dir * rnd(2.4, 3.2))); }
      else { const sd = k % 3 === 1 ? 1 : -1; dir = -sd; x0 = sd * 6.2; x1 = x0 + dir * rnd(1.0, 1.3); }
      let clr = 99;
      for (let i = 0; i <= 6; i++) { const cx = x0 + (x1 - x0) * i / 6; for (let j = 0; j < DANGER.length; j += 2) clr = Math.min(clr, Math.hypot(cx - DANGER[j], 7.25 - DANGER[j + 1])); }
      if (safeOnly && clr < need) continue;
      const lo = Math.min(x0, x1) + dir * 0.6 - 0.4, hi = Math.max(x0, x1) + dir * 0.6 + 0.4;
      let sc = clr >= need ? 1000 + rnd(0, 0.5) : clr;  // veilig eerst, dan de meeste rommel in beeld (er wordt geschopt)
      if (clr >= need) for (const it of items) if (it.on && it.y < 0.35 && it.z > 4.9 && it.z < 7.05 && it.x > lo && it.x < hi) sc += it.kind === 'glow' ? 2 : 1;
      if (safeOnly && sc < 1002) continue;  // automatisch alleen met minstens 2 stuks rommel in de voorgrond
      if (sc > bs) { bs = sc; best = { dir, x0, x1, lead: rnd(1.2, 2.2), z: 7.25 }; }
    }
    return best;
  }
  let planAt = -1e9, planC = null;  // per halve tel één plan (w en make in dezelfde startShot zien hetzelfde)
  const safePlan = () => { if (Math.abs(beatPos - planAt) > 0.5) { planAt = beatPos; planC = plan(true); } return planC; };
  SHOTS.voeten = { get w() { return safePlan() ? 1 : 0; }, beats: 8,  // automatisch alleen als er een veilige baan is
    make() { return safePlan() || plan(false); },
    at(s, u, t) {
      const x = s.x0 + (s.x1 - s.x0) * (0.25 * ease(u) + 0.75 * u);
      camPos.set(x, 0.25 + 0.006 * Math.sin(t * 6.5), s.z);
      camLook.set(x + s.dir * s.lead, 0.2, s.z - 3.4); camFov = 50;
    } };
  {
    const sel = document.getElementById('cam');
    if (sel && !sel.querySelector('option[value="voeten"]')) {
      const o = document.createElement('option'); o.value = 'voeten'; o.textContent = 'Camera: voeten en rommel op de vloer'; sel.appendChild(o);
      if (sel.value !== S.cam) sel.value = S.cam;  // keuze uit de vorige sessie (of 'auto' als de eerste frame hem al terugzette)
    }
  }

  // --- stil terugleggen: wat ver van zijn plek is geschopt of geschoven, gaat terug als beide plekken buiten beeld zijn ---
  // (zo blijft de zaal de hele nacht aangekleed in plaats van dat alles langzaam naar de hoeken drijft)
  const frus = new THREE.Frustum(), mF = new THREE.Matrix4(), sph = new THREE.Sphere(new THREE.Vector3(), 0.8);
  const inView = (x, y, z) => { sph.center.set(x, y, z); return frus.intersectsSphere(sph); };
  const seen = (x, y, z) => { const d = camera.position.distanceTo(vP.set(x, y, z)); return d < 6 || (d < 14 && inView(x, y, z)); };  // frustum: per frame bijgewerkt
  let tidyAt = 0;
  function tidy(now) {
    if (now < tidyAt) return;
    tidyAt = now + 2;
    const it = items[Math.floor(Math.random() * items.length)];
    if (!it.on || it.hx === undefined || it.mv || Math.hypot(it.x - it.hx, it.z - it.hz) < 1.5) return;
    const x = it.hx + rnd(-0.15, 0.15), z = it.hz + rnd(-0.15, 0.15);
    if (!freeSpot(x, z, 0.03)) return;
    if (inView(it.x, 0.1, it.z) || inView(x, 0.1, z)) return;
    it.x = x; it.z = z; it.y = it.g = 0; it.vx = it.vy = it.vz = it.spin = 0; it.yaw = rnd(0, TAU); it.tumb = false; it.lv = 0;
    if (!it.flat) it.tilt = it.tt = (Math.random() < 0.5 ? 1 : -1) * it.K.lie;
    setZone(it); write(it, 0, now);
  }

  // --- elke frame ---
  clubHooks.push((dt, now) => {
    if (!(dt > 0)) return;
    mF.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frus.setFromProjectionMatrix(mF);  // beeld van de vorige frame
    const vib = Math.min(1, bands[0].v * pulse);
    const glowK = 0.35 + 0.65 * pulse;
    glowM.color.setScalar(glowK); discM.color.setScalar(glowK * 0.55);
    switchMat.color.setRGB(1, 0.08, 0.05).multiplyScalar(0.7 + 0.3 * pulse);
    for (let k = 0; k < 2; k++) pudMats[k].emissive.copy(pal[k]).multiplyScalar(0.035 + 0.08 * pulse);
    // schoppers
    if (prev.size > 64) prev.clear();
    for (const w of walkers) kicker(w.root, 0.3, false, dt, w.root.visible && w.state !== 'gone', 2.2, now);
    for (const w of worms) kicker(w.root, 0.3, false, dt, w.root.visible, 1.2, now);  // klein: tikt het weg
    if (slug) kicker(slug.root, 1.55, true, dt, slug.root.visible, 1, now);  // 1,55 m = rand van zijn voet (gemeten in slak-1.glb)
    // alleen bijwerken wat beweegt of trilt
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.on) continue;
      if (it.mv) { step(it, dt, now); write(it, 0, now); it.lv = 0; continue; }
      if (!it.zone) continue;
      creep(it, dt, vib, now);
      const v = it.mv ? 0 : vib;
      if (v > 0.01 || it.lv > 0.01 || it.mv) { write(it, v, now); it.lv = v; }
    }
    // gevallen van een sub of de tafel: na ~60 s staat er ongemerkt een nieuwe (alleen als de camera ver weg is)
    for (const sp of SPOTS) {
      const it = sp.it;
      if (!sp.lost) {
        if (!it.on || it.y < sp.s.top - 0.05 || !inside(sp.s, it.x, it.z, 0)) { sp.lost = true; sp.at = now + rnd(55, 70); it.fell = it.fell || now; }
        continue;
      }
      if (now < sp.at || seen(sp.x, sp.s.top, sp.z)) continue;  // ongezien bijzetten
      let n = items.find(o => o.kind === sp.kind && !o.on);
      if (!n) {  // geen reserve: de oudste gevallen beker van de vloer halen (ook die moet ongezien zijn)
        let best = null;
        for (const o of items) if (o.kind === sp.kind && o.on && o.fell && !o.mv && (!best || o.fell < best.fell) && !SPOTS.some(q => q.it === o && !q.lost) && !seen(o.x, o.y, o.z)) best = o;
        n = best;
      }
      if (!n) { sp.at = now + 10; continue; }
      Object.assign(n, { on: true, x: sp.x + rnd(-0.03, 0.03), z: sp.z + rnd(-0.03, 0.03), y: sp.s.top, g: sp.s.top, vx: 0, vy: 0, vz: 0, spin: 0, tilt: 0, tt: 0, roll: 0,
                         yaw: rnd(0, TAU), tumb: false, mv: false, fell: 0, flat: false, sx: 1, sy: 1, sz: 1, lv: 0 });
      if (n.kind === 'can') n.sx = rnd(0.9, 1);
      setZone(n); write(n, 0, now);
      sp.it = n; sp.lost = false;
    }
    tidy(now);
    for (const m of MESHES) if (m.userData.d) { m.instanceMatrix.needsUpdate = true; m.userData.d = false; }
  });
})();

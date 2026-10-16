// --- Doolhof-kamer 'boiler': Boiler Room-kelder met een neonpiramide in het midden ---
// Rauwe bakstenen kelder met kale buizen en kabels; in het midden een glazen piramide met gloeiende randen en scanringen,
// daarin de dj op een verhoging achter twee draaitafels en een mixer, één kale hete lamp boven zijn hoofd.
// Publiek in een kring van 360 graden: 3D-figuren vooraan, silhouetten erachter (handen omhoog bij hoge energie),
// telefoons die oplichten en flitsen. Camera: laag over de schouder van de dj de kring in, af en toe een totaal van boven.
// Licht: één lamp boven de dj (+ in hoog een gekleurd tegenlicht); al het andere is onverlicht (basic/additief).
(() => {
  if (!window.doolhof) { console.warn('boiler: window.doolhof ontbreekt'); return; }
  const RONDE = Math.PI * 2;
  const W = 14, D = 14, H = 4.5;                 // kamer: vloer x/z -7..7, plafond 4,5
  const B = 2.6, PH = 4.0;                       // piramide: halve basis (5,2 m breed), hoogte
  const DAIS = 0.3, DJZ = 0.15, TZ = -0.45;      // verhoging, plek van de dj (kijkt naar -z), midden van de tafel
  const LAMP_Y = 3.1;                            // kale lamp boven de dj, hangt aan de top
  const BLIJF = 20, T_IN = 2.8, CYCLUS = 11.5, SCHOUDER = 8;  // camera: binnenkomst, dan steeds 8 s schouder + 3,5 s totaal
  // looppad: ingang -> links om de piramide door het publiek -> uitgang; het middelste punt is de wachtplek
  const ROUTE = [[0, -7], [0, -6.2], [-2, -5.4], [-4.4, -3.3], [-4.7, 0], [-4.4, 3.3], [-2, 5.4], [0, 6.2], [0, 7]].map(([x, z]) => ({ x, z }));
  const WACHT = ROUTE[4];
  const Z1 = new THREE.Vector3(0, 0, 1);
  // silhouet: 256 px hoog, persoon van kruin (29) tot voeten (256) = 1,75 m
  const SIL_H = 256 / 227 * 1.75, TEL_X = 22 / 128, TEL_Y = 1 - 14 / 256;  // plek van de telefoonhand in pose 3

  // --- gedeelde doeken: één keer tekenen, per kamer een eigen texture (die mag de kern opruimen) ---
  const doeken = {};
  function tex(naam, w, h, teken, rx, ry) {
    if (!doeken[naam]) { const c = document.createElement('canvas'); c.width = w; c.height = h; teken(c.getContext('2d'), w, h); doeken[naam] = c; }
    const t = new THREE.CanvasTexture(doeken[naam]);
    if (rx) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); }
    return t;
  }
  const kans = (a, b) => a + Math.random() * (b - a);
  function korrel(g, w, h, n) {
    const img = g.getImageData(0, 0, w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const k = (Math.random() - 0.5) * n; d[i] += k; d[i + 1] += k; d[i + 2] += k; }
    g.putImageData(img, 0, 0);
  }
  function vlekken(g, w, h, n, kleuren) {
    for (let i = 0; i < n; i++) {
      const x = kans(0, w), y = kans(0, h), r = kans(20, 110), gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, kleuren[Math.floor(Math.random() * kleuren.length)]); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  // bakstenen muur: donkere stenen in halfsteens verband, roet en salpeter
  const tekenSteen = (g, w, h) => {
    g.fillStyle = '#1a1614'; g.fillRect(0, 0, w, h);
    const rij = 32, br = 64;
    for (let r = 0; r < h / rij; r++) for (let k = 0; k < w / br; k++) {
      const x = k * br + (r % 2) * br / 2, y = r * rij;
      g.fillStyle = `hsl(${kans(6, 24)},${kans(16, 38)}%,${kans(15, 27)}%)`;
      for (const dx of [0, -w]) g.fillRect(x + dx + 2, y + 2, br - 4, rij - 4);  // steen die over de rand loopt komt links terug
    }
    vlekken(g, w, h, 34, ['rgba(0,0,0,0.45)', 'rgba(0,0,0,0.3)', 'rgba(220,210,190,0.09)']);
    korrel(g, w, h, 30);
  };
  // beton: vlekken, naden en scheuren
  const tekenBeton = (g, w, h) => {
    g.fillStyle = '#2e2b29'; g.fillRect(0, 0, w, h);
    vlekken(g, w, h, 40, ['rgba(0,0,0,0.35)', 'rgba(60,40,25,0.25)', 'rgba(255,255,255,0.05)']);
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 2;
    for (let x = 0; x <= w; x += 256) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); g.beginPath(); g.moveTo(0, x); g.lineTo(w, x); g.stroke(); }
    g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
      let x = kans(0, w), y = kans(0, h); g.beginPath(); g.moveTo(x, y);
      for (let j = 0; j < 12; j++) { x += kans(-14, 14); y += kans(4, 16); g.lineTo(x, y); }
      g.stroke();
    }
    korrel(g, w, h, 28);
  };
  // silhouetten van het publiek: 4 poses naast elkaar (armen neer, beide omhoog, één omhoog, telefoon omhoog)
  // eerst een lichte rand (tegenlicht), dan de donkere vulling eroverheen
  const tekenSilhouet = (g) => {
    g.clearRect(0, 0, 512, 256);
    const neer = s => [s * 26, 76, s * 34, 115, s * 36, 150];
    const op = s => [s * 26, 76, s * 40, 42, s * 32, 10];
    const armen = [[neer(-1), neer(1)], [op(-1), op(1)], [op(-1), neer(1)], [neer(-1), [26, 76, 42, 48, 22, 14]]];
    for (let c = 0; c < 4; c++) {
      const cx = c * 128 + 64;
      for (const rand of [5, 0]) {
        const gr = g.createLinearGradient(0, 29, 0, 256);
        if (rand) { gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.55, '#8a8a8a'); gr.addColorStop(1, '#1c1c1c'); }
        else { gr.addColorStop(0, '#2a2224'); gr.addColorStop(1, '#060506'); }
        g.fillStyle = g.strokeStyle = gr; g.lineCap = g.lineJoin = 'round';
        const lijn = (p, lw) => { g.lineWidth = lw + rand; g.beginPath(); g.moveTo(cx + p[0], p[1]); for (let i = 2; i < p.length; i += 2) g.lineTo(cx + p[i], p[i + 1]); g.stroke(); };
        lijn([-9, 150, -12, 200, -14, 247], 17); lijn([9, 150, 12, 200, 14, 247], 17);  // benen
        g.lineWidth = rand || 1; g.beginPath(); g.moveTo(cx - 29, 72); g.lineTo(cx + 29, 72); g.lineTo(cx + 23, 155); g.lineTo(cx - 23, 155); g.closePath(); g.fill(); if (rand) g.stroke();
        lijn([0, 50, 0, 72], 12);  // nek
        g.beginPath(); g.arc(cx, 44, 15 + rand / 2, 0, RONDE); g.fill();
        lijn(armen[c][0], 13); lijn(armen[c][1], 13);
      }
    }
  };
  // telefoonscherm met een zachte gloed eromheen
  const tekenTelefoon = (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, 44);
    gr.addColorStop(0, 'rgba(200,220,255,0.6)'); gr.addColorStop(1, 'rgba(200,220,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff'; g.fillRect(22, 28, 20, 40);
  };
  const tekenGloed = (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  };
  const tekenBundel = (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  };
  // glas: onderin iets voller, met scanlijnen
  const tekenGlas = (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0.06)'); gr.addColorStop(1, 'rgba(255,255,255,0.3)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    for (let y = 0; y < h; y += 16) g.fillRect(0, y, w, 2);
  };
  // plaat: groeven, wit label (krijgt de kleur van het materiaal) en een streepje zodat je hem ziet draaien
  const tekenPlaat = (g, w, h) => {
    const c = w / 2;
    g.fillStyle = '#060607'; g.beginPath(); g.arc(c, c, c, 0, RONDE); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 1;
    for (let r = 44; r < c - 2; r += 3) { g.beginPath(); g.arc(c, c, r, 0, RONDE); g.stroke(); }
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(c, c, 40, 0, RONDE); g.fill();
    g.fillRect(c + 44, c - 2, c - 50, 4);
    g.fillStyle = '#000000'; g.beginPath(); g.arc(c, c, 3, 0, RONDE); g.fill();
  };

  // --- geometrie samenvoegen: veel statische stukjes in één draw call ---
  const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
  const mat4 = (x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
  // balk van a naar b (eenheidsdoos langs z uitgerekt)
  function staaf(a, b, dik) {
    const v = _p.subVectors(b, a), len = v.length();
    _q.setFromUnitVectors(Z1, v.divideScalar(len));
    return new THREE.Matrix4().compose(_s.addVectors(a, b).multiplyScalar(0.5), _q, new THREE.Vector3(dik, dik, len));
  }
  function samen(delen, metKleur) {  // delen: [[geometrie, Matrix4, kleur?], ...]
    const pos = [], nor = [], uv = [], kl = [];
    const nm = new THREE.Matrix3(), v = new THREE.Vector3(), c = new THREE.Color();
    for (const [geo, m, kleur] of delen) {
      const g = geo.index ? geo.toNonIndexed() : geo;
      const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
      nm.getNormalMatrix(m);
      if (metKleur) c.set(kleur === undefined ? 0xffffff : kleur);
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(m); pos.push(v.x, v.y, v.z);
        if (n) v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); else v.set(0, 1, 0);
        nor.push(v.x, v.y, v.z);
        uv.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0);
        if (metKleur) kl.push(c.r, c.g, c.b);
      }
      if (g !== geo) g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    if (metKleur) out.setAttribute('color', new THREE.Float32BufferAttribute(kl, 3));
    return out;
  }
  const additief = (kleur, extra) => new THREE.MeshBasicMaterial(Object.assign({ color: kleur, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }, extra || {}));

  // afstand van een punt tot het looppad
  function routeAfstand(p) {
    let best = 1e9;
    for (let i = 0; i < ROUTE.length - 1; i++) {
      const a = ROUTE[i], b = ROUTE[i + 1], dx = b.x - a.x, dz = b.z - a.z;
      const u = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
      best = Math.min(best, Math.hypot(a.x + dx * u - p.x, a.z + dz * u - p.z));
    }
    return best;
  }
  const afst = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  // punt op 'off' meter buiten de vierkante voet van de piramide, in richting a
  function ringPunt(a, off) {
    const c = Math.cos(a), s = Math.sin(a), r = B / Math.max(Math.abs(c), Math.abs(s)) + off;
    return { x: c * r, z: s * r };
  }

  function maak(ctx) {
    const G = ctx.groep, Z = Math.max(0, Math.min(2, ctx.zwaar | 0)), R = ctx.rnd;
    const rr = (a, b) => a + R() * (b - a);
    // kleur van deze kelder: meestal oranje, soms rood, roze of (zelden) cyaan
    const hr = R(), HUE = hr < 0.5 ? 0.065 : hr < 0.75 ? 0.0 : hr < 0.9 ? 0.93 : 0.53;
    const NEON = new THREE.Color().setHSL(HUE, 1, 0.55), neonCss = '#' + NEON.getHexString();
    const C = new THREE.Color();
    const bronnen = [];  // losse bron-geometrieën: na het samenvoegen weggooien
    const bron = g => (bronnen.push(g), g);
    const bx = bron(new THREE.BoxGeometry(1, 1, 1)), cy = bron(new THREE.CylinderGeometry(1, 1, 1, 12));

    // --- kelder: bakstenen muren, betonvloer, laag betonplafond ---
    const muur = new THREE.MeshBasicMaterial({ map: tex('steen', 512, 512, tekenSteen, W / 2.4, H / 2.4), color: 0x8f807a });
    const vloer = new THREE.MeshBasicMaterial({ map: tex('beton', 512, 512, tekenBeton, W / 4, D / 4), color: 0x77706a });
    const plafond = new THREE.MeshBasicMaterial({ map: tex('beton', 512, 512, tekenBeton, W / 4, D / 4), color: 0x3a3634 });
    ctx.doos({ w: W, d: D, h: H, vloer, muur, plafond });

    // --- de dj eerst: zijn lengte bepaalt de tafelhoogte en de camerahoogte ---
    const podium = new THREE.Group(); podium.position.y = DAIS; G.add(podium);  // dj staat op de verhoging
    const dj = ctx.figuur({ x: 0, z: DJZ, face: Math.PI, rol: 'dj', filter: /alien|wizard/ }) || ctx.figuur({ x: 0, z: DJZ, face: Math.PI, rol: 'dj' });
    let djH = 1.75;
    if (dj) {
      podium.add(dj.root);  // haalt hem uit ctx.groep en zet hem 0,3 m hoger; lokale plek blijft (0, 0, DJZ)
      if (dj.M && dj.body) djH = Math.abs(dj.body.scale.y) * (dj.M.h || 1);
      if (!(djH > 1 && djH < 3)) djH = 1.75;
    }
    const TOP = DAIS + Math.max(0.95, Math.min(1.25, 0.56 * djH));  // tafelblad op heuphoogte
    const CAMY = Math.min(DAIS + 0.93 * djH, 2.15);                  // schoudercamera; hoger past niet in de piramide

    // --- statisch spul in één belicht mesh (lambert, kleur per hoekpunt) ---
    const vast = [];
    vast.push([bx, mat4(0, DAIS / 2, 0, 2.7, DAIS, 2.7), 0x17151a]);                                   // verhoging
    vast.push([bx, mat4(0, (DAIS + TOP - 0.04) / 2, TZ, 1.7, TOP - 0.04 - DAIS, 0.55), 0x0e0e12]);     // tafelkast
    vast.push([bx, mat4(0, TOP - 0.02, TZ, 1.82, 0.04, 0.62), 0x1c1c22]);                              // tafelblad
    for (const dx of [-0.5, 0.5]) {                                                                     // draaitafels
      vast.push([bx, mat4(dx, TOP + 0.025, TZ, 0.46, 0.05, 0.36), 0x26262c]);
      vast.push([cy, mat4(dx - 0.03, TOP + 0.056, TZ, 0.155, 0.012, 0.155), 0x8a8a94]);
      vast.push([cy, mat4(dx + 0.18, TOP + 0.065, TZ - 0.12, 0.02, 0.03, 0.02), 0x55555c]);
      vast.push([bx, mat4(dx + 0.125, TOP + 0.08, TZ - 0.03, 0.008, 0.008, 0.211, 0, Math.atan2(-0.11, 0.18), 0), 0xb0b0b8]);
    }
    vast.push([bx, mat4(0, TOP + 0.035, TZ, 0.3, 0.07, 0.36), 0x1e1e24]);                              // mixer
    for (const sx of [-1, 1]) {                                                                          // monitorboxen op een paal, naar de dj
      vast.push([cy, mat4(sx * 1.12, DAIS + 0.4, TZ + 0.05, 0.025, 0.8, 0.025), 0x333338]);
      vast.push([bx, mat4(sx * 1.12, DAIS + 1.0, TZ + 0.05, 0.3, 0.42, 0.3), 0x111113]);
    }
    vast.push([cy, mat4(0, (PH + LAMP_Y) / 2, 0, 0.008, PH - LAMP_Y - 0.04, 0.008), 0x050505]);        // lampsnoer
    // kale buizen, een ventilatiekoker en twee buizen in de hoeken
    for (const [as, x, y, z, r, k] of [['x', 0, H - 0.16, 6.55, 0.08, 0x3a3a3e], ['x', 0, H - 0.12, 6.28, 0.05, 0x5a3422], ['x', 0, H - 0.18, -6.5, 0.1, 0x444448],
      ['z', 6.6, H - 0.14, 0, 0.07, 0x3a3a3e], ['z', -6.62, H - 0.6, 0, 0.045, 0x5a3422], ['y', -6.75, H / 2, 6.75, 0.07, 0x3a3a3e], ['y', 6.75, H / 2, -6.75, 0.05, 0x5a3422]]) {
      const len = as === 'x' ? W : as === 'z' ? D : H;
      vast.push([cy, mat4(x, y, z, r, len, r, as === 'z' ? Math.PI / 2 : 0, 0, as === 'x' ? Math.PI / 2 : 0), k]);
    }
    vast.push([bx, mat4(-6.0, H - 0.26, 0, 0.8, 0.45, D - 0.2), 0x55555a]);
    if (Z < 2) for (const [z0, zm, z1, zak] of [[-3.2, -3.0, -3.4, 0.7], [3.4, 3.1, 2.9, 0.55]]) {      // doorhangende kabels
      const kromme = new THREE.CatmullRomCurve3([new THREE.Vector3(-W / 2 + 0.1, H - 0.1, z0), new THREE.Vector3(-0.5, H - zak, zm), new THREE.Vector3(W / 2 - 0.1, H - 0.1, z1)]);
      vast.push([bron(new THREE.TubeGeometry(kromme, 24, 0.012, 4)), new THREE.Matrix4(), 0x050505]);
    }
    G.add(new THREE.Mesh(samen(vast, true), new THREE.MeshLambertMaterial({ vertexColors: true })));

    // --- de piramide: gloeiende randen, glas, scanringen en een draaiende top ---
    const hoek = [[-B, -B], [B, -B], [B, B], [-B, B]].map(([x, z]) => new THREE.Vector3(x, 0, z)), apex = new THREE.Vector3(0, PH, 0);
    const randen = (dik, y0) => {
      const l = [];
      for (let i = 0; i < 4; i++) {
        const a = hoek[i].clone().setY(y0), b = hoek[(i + 1) % 4].clone().setY(y0);
        l.push([bx, staaf(a, b, dik)], [bx, staaf(hoek[i], apex, dik)]);
      }
      return samen(l);
    };
    const kernMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    G.add(new THREE.Mesh(randen(Z < 2 ? 0.035 : 0.05, 0.02), kernMat));
    const gloedMat = Z < 2 ? additief(0xffffff) : null;
    if (gloedMat) G.add(new THREE.Mesh(randen(0.13, 0.065), gloedMat));
    let glasMat = null;
    if (Z < 2) {
      const pos = [], uv = [];
      for (let i = 0; i < 4; i++) { const a = hoek[i], b = hoek[(i + 1) % 4]; pos.push(a.x, 0, a.z, b.x, 0, b.z, 0, PH, 0); uv.push(0, 0, 1, 0, 0.5, 1); }
      const glas = new THREE.BufferGeometry();
      glas.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      glas.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      glasMat = additief(0xffffff, { map: tex('glas', 64, 256, tekenGlas), side: THREE.DoubleSide });
      G.add(new THREE.Mesh(glas, glasMat));
    }
    // scanringen: vierkante lijsten die elke 8 tellen van de voet naar de top klimmen
    const ringGeo = samen([[bx, mat4(1, 0, 0, 0.02, 0.025, 2.02)], [bx, mat4(-1, 0, 0, 0.02, 0.025, 2.02)], [bx, mat4(0, 0, 1, 2.02, 0.025, 0.02)], [bx, mat4(0, 0, -1, 2.02, 0.025, 0.02)]]);
    const ringen = [];
    for (let i = 0; i < [3, 2, 1][Z]; i++) { const r = new THREE.Mesh(ringGeo, additief(0x000000)); G.add(r); ringen.push(r); }
    const topMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const top = new THREE.Mesh(new THREE.OctahedronGeometry(0.18), topMat); top.position.copy(apex); G.add(top);

    // --- lamp: kale peer met gloed en (niet op minimaal) een lichtkegel over de dj ---
    const peer = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff2dd })); peer.position.set(0, LAMP_Y, 0); G.add(peer);
    const peerGloed = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex('gloed', 64, 64, tekenGloed), color: 0xffc890, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    peerGloed.position.copy(peer.position); peerGloed.scale.setScalar(0.9); G.add(peerGloed);
    let bundelMat = null;
    if (Z < 2) {
      bundelMat = additief(0xffd6a0, { map: tex('bundel', 4, 128, tekenBundel), opacity: 0.12, side: THREE.DoubleSide });
      const kegel = new THREE.Mesh(new THREE.ConeGeometry(0.95, LAMP_Y - DAIS, 20, 1, true), bundelMat);
      kegel.position.set(0, (LAMP_Y + DAIS) / 2, 0); G.add(kegel);
    }
    const lamp = ctx.licht(0xffb070, 2.4, 11, 0, LAMP_Y - 0.08, 0);
    const tegen = Z === 0 ? ctx.licht(NEON.getHex(), 1.3, 10, W / 2 - 1.2, 2.8, 0) : null;  // gekleurd tegenlicht op de ruggen

    // --- draaiende platen, mixerknopjes, crossfader, monitorringen ---
    const plaatTex = tex('plaat', 256, 256, tekenPlaat), platen = [];
    for (const [dx, kleur] of [[-0.5, NEON.getHex()], [0.5, 0x22e0ff]]) {
      const p = new THREE.Mesh(new THREE.CircleGeometry(0.15, 32), new THREE.MeshBasicMaterial({ map: plaatTex, color: kleur }));
      p.position.set(dx - 0.03, TOP + 0.064, TZ); p.rotation.x = -Math.PI / 2; p.rotation.z = R() * RONDE;
      G.add(p); platen.push(p);
    }
    const knop = [];
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 3; r++) knop.push([cy, mat4(-0.105 + c * 0.07, TOP + 0.08, TZ - 0.14 + r * 0.065, 0.012, 0.02, 0.012)]);
      knop.push([bx, mat4(-0.105 + c * 0.07, TOP + 0.077, TZ + 0.08, 0.02, 0.014, 0.028)]);
    }
    const knopMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    G.add(new THREE.Mesh(samen(knop), knopMat));
    const xfader = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.014, 0.02), new THREE.MeshBasicMaterial({ color: 0xffe600 }));
    xfader.position.set(0, TOP + 0.077, TZ + 0.15); G.add(xfader);
    const torus = bron(new THREE.TorusGeometry(0.1, 0.012, 6, 28));
    const monMat = additief(0xffffff);
    G.add(new THREE.Mesh(samen([[torus, mat4(-1.12, DAIS + 1.0, TZ + 0.201, 1, 1, 1)], [torus, mat4(1.12, DAIS + 1.0, TZ + 0.201, 1, 1, 1)]]), monMat));
    // ledlijst om de verhoging en onder het tafelblad
    const led = [[bron(new THREE.RingGeometry(1.29 * Math.SQRT2, 1.35 * Math.SQRT2, 4, 1)), mat4(0, DAIS + 0.004, 0, 1, 1, 1, -Math.PI / 2, 0, Math.PI / 4)],
      [bx, mat4(0, TOP - 0.06, TZ - 0.281, 1.75, 0.018, 0.01)]];
    const ledMat = additief(0xffffff, { side: THREE.DoubleSide });
    G.add(new THREE.Mesh(samen(led), ledMat));
    // neonlijst om beide deuropeningen (2 x 2,6 m)
    const deur = [];
    for (const s of [-1, 1]) {
      const z0 = s * (D / 2 - 0.03);
      deur.push([bx, mat4(-1.05, 1.325, z0, 0.05, 2.65, 0.05)], [bx, mat4(1.05, 1.325, z0, 0.05, 2.65, 0.05)], [bx, mat4(0, 2.65, z0, 2.15, 0.05, 0.05)]);
    }
    const deurMat = additief(0xffffff);
    G.add(new THREE.Mesh(samen(deur), deurMat));

    // --- neon: kelder-naam op de linkerwand, knipperend LIVE rechts, BLOODLINE op de tafel ---
    const bord = ctx.neon('DEEP BOILER', neonCss, 4.6, 1.15);
    if (bord) { bord.position.set(-W / 2 + 0.06, 3.25, 0); bord.rotation.y = Math.PI / 2; }
    const live = ctx.neon('● LIVE', '#ff2030', 1.5, 0.42);
    if (live) { live.position.set(W / 2 - 0.06, 3.45, 2.6); live.rotation.y = -Math.PI / 2; }
    const naam = ctx.neon('BLOODLINE', '#ff1f3d', 1.2, 0.3);
    if (naam) { naam.position.set(0, DAIS + 0.5, TZ - 0.29); naam.rotation.y = Math.PI; }

    // --- nep-licht: gloed op de vloer rond de piramide en vegen op de muren (geen echte lampen) ---
    const gloedTex = tex('gloed', 64, 64, tekenGloed);
    const poelMat = additief(0x000000, { map: gloedTex });
    const poel = new THREE.Mesh(new THREE.PlaneGeometry(11, 11), poelMat); poel.rotation.x = -Math.PI / 2; poel.position.y = 0.012; G.add(poel);
    let wasMat = null;
    const nWas = [8, 4, 0][Z];
    if (nWas) {
      const vlak = bron(new THREE.PlaneGeometry(1, 1)), was = [];
      const plekken = [[-W / 2 + 0.04, -3.6, Math.PI / 2], [W / 2 - 0.04, 3.6, -Math.PI / 2], [4.2, -D / 2 + 0.04, 0], [-4.2, D / 2 - 0.04, Math.PI],
        [-W / 2 + 0.04, 3.6, Math.PI / 2], [W / 2 - 0.04, -3.6, -Math.PI / 2], [-4.2, -D / 2 + 0.04, 0], [4.2, D / 2 - 0.04, Math.PI]];
      for (let i = 0; i < nWas; i++) { const [x, z, ry] = plekken[i]; was.push([vlak, mat4(x, 1.5, z, 4.6, 3.0, 1, 0, ry, 0)]); }
      wasMat = additief(0x000000, { map: gloedTex });
      G.add(new THREE.Mesh(samen(was), wasMat));
    }
    // waas onder het plafond, gekleurd door de piramide
    const waas = [];
    for (let i = 0; i < [6, 3, 0][Z]; i++) {
      const bronTex = typeof smokeTex !== 'undefined' && smokeTex[i % 3] && smokeTex[i % 3].image ? new THREE.CanvasTexture(smokeTex[i % 3].image) : tex('gloed', 64, 64, tekenGloed);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: bronTex, color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, rotation: rr(0, RONDE) }));
      sp.scale.setScalar(rr(3, 4.2)); G.add(sp);
      waas.push({ sp, a: rr(0, RONDE), r: rr(2.2, 4.2), y: rr(2.7, 3.9), v: rr(0.03, 0.07) * (R() < 0.5 ? -1 : 1) });
    }

    // --- publiek: 3D-figuren in de binnenste kring (vrij van het looppad en de wachtplek) ---
    const kand = [], a0 = R() * RONDE, NK = 18;
    for (let i = 0; i < NK; i++) {
      const p = ringPunt(a0 + i / NK * RONDE + rr(-0.08, 0.08), rr(0.85, 1.3));
      if (routeAfstand(p) < 1.0 || afst(p, WACHT) < 1.3) continue;
      kand.push(p);
    }
    const N = Math.min([9, 5, 4][Z], kand.length), stap = kand.length / Math.max(1, N), gekozen = [];
    for (let i = 0; i < N; i++) gekozen.push(kand[Math.floor(i * stap)]);
    const ROLLEN = ['dans', 'juich', 'dans', 'staan', 'dans', 'juich', 'dans', 'staan', 'juich'];
    const figuren = [];
    for (let i = 0; i < gekozen.length; i++) {
      const p = gekozen[i], rol = ROLLEN[i % ROLLEN.length];
      const d = ctx.figuur({ x: p.x, z: p.z, face: Math.atan2(-p.x, DJZ - p.z) + rr(-0.35, 0.35), rol });
      if (!d) break;  // maximum van deze stand bereikt
      figuren.push({ d, rol });
    }
    // telefoons omhoog bij een paar juichers: gloeiend schermpje in de rechterhand (anders los boven het hoofd)
    const telTex = tex('telefoon', 64, 96, tekenTelefoon), telefoons = [];
    let nTel = [3, 2, 1][Z];
    for (const f of figuren) {
      if (!nTel || f.rol !== 'juich' || !f.d.root) continue;
      nTel--;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: telTex, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      let hand = null;
      if (f.d.body) f.d.body.traverse(o => { if (!hand && o.isBone && o.name === 'RightHand') hand = o; });
      const ws = new THREE.Vector3();
      if (hand) {
        f.d.root.updateWorldMatrix(true, true); hand.getWorldScale(ws);
        const k = Math.abs(ws.x) || 1;
        sp.position.set(0, 0.12 / k, 0); sp.scale.set(0.16 / k, 0.24 / k, 1); hand.add(sp);
      } else {
        f.d.root.updateWorldMatrix(true, false); f.d.root.getWorldScale(ws);
        const k = Math.abs(ws.y) || 1;
        sp.position.set(0.18 / k, 1.95 / k, 0.1 / k); sp.scale.set(0.16 / k, 0.24 / k, 1); f.d.root.add(sp);
      }
      telefoons.push({ sp, mat: sp.material, sx: sp.scale.x, sy: sp.scale.y, basis: rr(0.7, 1), flits: 0 });
    }

    // --- silhouetten in de buitenste kringen: goedkoop, 4 instanced meshes (één per pose) ---
    // soort: [rustpose, pose bij hoge energie]; pose 3 = telefoon omhoog (blijft omhoog)
    const SOORTEN = [[0, 1], [0, 1], [0, 2], [2, 1], [3, 3]];
    const sil = [], NS = [36, 22, 12][Z];
    for (let poging = 0; sil.length < NS && poging < 700; poging++) {
      const off = rr(1.55, 3.6), p = ringPunt(R() * RONDE, off);
      if (Math.abs(p.x) > W / 2 - 0.45 || Math.abs(p.z) > D / 2 - 0.45) continue;
      if (Math.abs(p.x) < 1.7 && Math.abs(p.z) > D / 2 - 1.8) continue;  // deuren vrij
      if (routeAfstand(p) < 0.75 || afst(p, WACHT) < 1.1) continue;
      if (sil.some(s => afst(s, p) < 0.52) || gekozen.some(f => afst(f, p) < 0.75)) continue;
      const [p0, p1] = SOORTEN[Math.floor(R() * SOORTEN.length)], sh = SIL_H * rr(0.9, 1.08), licht = 1 - (off - 1.55) / 2.05 * 0.5;
      sil.push({ x: p.x, z: p.z, face: Math.atan2(-p.x, -p.z) + rr(-0.3, 0.3), sh, sw: sh / 2, p0, p1, ph: R(), drempel: rr(0.5, 0.95), op: false,
        kleur: new THREE.Color().setHSL((HUE + rr(-0.03, 0.03) + 1) % 1, 0.85, 0.42 * licht), slot: [-1, -1, -1, -1], tel: -1 });
    }
    const silMat = new THREE.MeshBasicMaterial({ map: tex('silhouet', 512, 256, tekenSilhouet), alphaTest: 0.5, side: THREE.DoubleSide });
    const aantal = [0, 0, 0, 0];
    let nTelSil = 0;
    for (const s of sil) { for (const p of new Set([s.p0, s.p1])) s.slot[p] = aantal[p]++; if (s.p0 === 3) s.tel = nTelSil++; }
    const NUL = new THREE.Matrix4().makeScale(0, 0, 0);
    const silMesh = [0, 1, 2, 3].map(c => {
      if (!aantal[c]) return null;
      const geo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, (c + uv.getX(i)) / 4);
      const m = new THREE.InstancedMesh(geo, silMat, aantal[c]);
      m.frustumCulled = false;
      for (let i = 0; i < aantal[c]; i++) m.setMatrixAt(i, NUL);
      G.add(m); return m;
    });
    for (const s of sil) for (let c = 0; c < 4; c++) if (s.slot[c] >= 0) silMesh[c].setColorAt(s.slot[c], s.kleur);
    let telSil = null;
    if (nTelSil) {
      telSil = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.2, 0.3), additief(0xffffff, { map: telTex, side: THREE.DoubleSide }), nTelSil);
      telSil.frustumCulled = false;
      for (let i = 0; i < nTelSil; i++) { telSil.setMatrixAt(i, NUL); telSil.setColorAt(i, C.setRGB(0.8, 0.85, 1)); }
      G.add(telSil);
    }
    const telFlits = new Float32Array(nTelSil), telBasis = Float32Array.from({ length: nTelSil }, () => rr(0.6, 1));

    for (const g of bronnen) g.dispose();

    // --- elk beeld ---
    const M4 = new THREE.Matrix4(), P = new THREE.Vector3(), P2 = new THREE.Vector3(), S = new THREE.Vector3(), EEN = new THREE.Vector3(1, 1, 1), Q = new THREE.Quaternion(), E = new THREE.Euler();
    let vorigeTel = -1;
    // silhouetten: dichtbij een kartonnen bord, steil van boven (totaal) een plat vlak: dan zijn ze weg (met speling tegen knipperen).
    // Gerekend op de camera van het vorige beeld én het doel van cam() (bij een knip anders één beeld een reuzenbord)
    const camNu = new THREE.Vector3(), camDoel = new THREE.Vector3();
    let doelGeldig = false, silPos = 0, silEn = 0;
    const teDicht = (s, c, m) => {  // ook: van opzij gezien (ze kijken naar de piramide) is een silhouet een dun streepje
      const dx = c.x - s.x, dz = c.z - s.z, dh = Math.hypot(dx, dz), hoog = c.y - 1.0;
      return dh < 3.8 + m || hoog / Math.max(dh, 0.1) > 0.55 - m * 0.25 || Math.abs(dx * Math.sin(s.face) + dz * Math.cos(s.face)) < (0.5 + m * 0.3) * dh;
    };
    function zetSil() {
      for (const s of sil) {
        const act = s.op ? s.p1 : s.p0, rust = s.op ? s.p0 : s.p1;
        if (rust !== act) silMesh[rust].setMatrixAt(s.slot[rust], NUL);
        const m = s.weg ? 0.35 : 0;
        s.weg = teDicht(s, camNu, m) || (doelGeldig && teDicht(s, camDoel, m));
        if (s.weg) { silMesh[act].setMatrixAt(s.slot[act], NUL); if (s.tel >= 0) telSil.setMatrixAt(s.tel, NUL); continue; }
        const bob = 0.05 * Math.pow(Math.abs(Math.sin(Math.PI * (silPos + s.ph))), 2) * (0.6 + silEn);
        Q.setFromEuler(E.set(0, s.face, 0.05 * Math.sin(Math.PI * (silPos * 0.5 + s.ph))));
        P.set(s.x, bob, s.z);
        silMesh[act].setMatrixAt(s.slot[act], M4.compose(P, Q, S.set(s.sw, s.sh, 1)));
        if (s.tel >= 0) {
          P2.set(TEL_X * s.sw, TEL_Y * s.sh, 0.04).applyQuaternion(Q).add(P);
          telSil.setMatrixAt(s.tel, M4.compose(P2, Q, EEN));
        }
      }
      for (const m of silMesh) if (m) m.instanceMatrix.needsUpdate = true;
      if (telSil) telSil.instanceMatrix.needsUpdate = true;
    }
    function update(dt, now) {
      const b = ctx.beat() || {}, pu = b.pulse || 0, bas = b.bas || 0, en = b.energy || 0, pos = b.pos || 0;
      dt = Math.min(dt || 0, 0.1);
      // piramide: randen kloppen op de tel; elke 8e maat even de complementaire kleur
      const hk = (Math.floor(pos / 4) % 8 === 7 ? HUE + 0.5 : HUE) % 1;
      kernMat.color.setHSL(hk, 0.7, 0.72).multiplyScalar(0.55 + 0.75 * pu + 0.25 * en);
      if (gloedMat) gloedMat.color.setHSL(hk, 1, 0.5).multiplyScalar(0.18 + 0.5 * pu);
      if (glasMat) glasMat.color.setHSL(HUE, 1, 0.5).multiplyScalar(0.1 + 0.14 * pu);
      ringen.forEach((r, i) => {
        const u = ((pos / 8 + i / ringen.length) % 1 + 1) % 1, y = u * PH * 0.97, s = B * (1 - y / PH) + 0.02;
        r.position.y = y; r.scale.set(s, 1, s);
        r.material.color.setHSL(HUE, 1, 0.6).multiplyScalar(Math.sin(Math.PI * u) * (0.45 + 0.9 * pu));
      });
      top.rotation.y += dt * 0.9; top.scale.setScalar(1 + 0.25 * pu);
      topMat.color.setHSL(HUE, 0.6, 0.75).multiplyScalar(0.7 + 0.8 * pu);
      // lamp en nep-licht
      if (lamp) lamp.intensity = 2.4 * (0.8 + 0.35 * pu);
      if (tegen) tegen.intensity = 1.3 * (0.5 + 0.9 * bas);
      peerGloed.scale.setScalar(0.9 * (1 + 0.35 * pu));
      if (bundelMat) bundelMat.opacity = 0.09 + 0.08 * pu;
      poelMat.color.setRGB(1, 0.62, 0.32).multiplyScalar(0.22 + 0.25 * pu);
      if (wasMat) wasMat.color.setHSL(HUE, 0.9, 0.5).multiplyScalar(0.16 + 0.28 * pu + 0.12 * bas);
      ledMat.color.setHSL(HUE, 1, 0.55).multiplyScalar(0.6 + 0.8 * pu);
      deurMat.color.setHSL(HUE, 1, 0.5).multiplyScalar(0.5 + 0.3 * pu);
      monMat.color.setHSL(HUE, 1, 0.6).multiplyScalar(0.4 + bas);
      knopMat.color.setHSL((HUE + 0.5) % 1, 0.7, 0.45 + 0.25 * pu);
      if (live) live.visible = (now % 1.5) < 1.05;
      // draaitafels: 33 toeren, crossfader schuift op de tel
      for (const p of platen) p.rotation.z -= dt * 3.49;
      xfader.position.x = 0.07 * Math.sin(pos * Math.PI * 0.5);
      // waas drijft langzaam rond
      for (const w of waas) {
        w.a += dt * w.v;
        w.sp.position.set(Math.cos(w.a) * w.r, w.y + 0.12 * Math.sin(now * 0.3 + w.r), Math.sin(w.a) * w.r);
        w.sp.material.color.setHSL(HUE, 0.9, 0.5).multiplyScalar(0.09 + 0.1 * pu);
        w.sp.material.rotation += dt * 0.02;
      }
      // silhouetten: deinen op de tel; bij hoge energie gaan de handen omhoog (alleen op een nieuwe tel wisselen)
      const tel = Math.floor(pos);
      if (tel !== vorigeTel) { vorigeTel = tel; for (const s of sil) s.op = en > s.drempel; }
      silMat.color.setScalar(0.75 + 0.5 * pu);
      camNu.copy(camera.position); G.worldToLocal(camNu); doelGeldig = false; silPos = pos; silEn = en;
      zetSil();
      // telefoons: zacht flakkerend scherm, af en toe een flits
      if (telSil) {
        for (let i = 0; i < nTelSil; i++) {
          if (telFlits[i] > 0) telFlits[i] -= dt; else if (Math.random() < dt * 0.12) telFlits[i] = 0.08;
          const k = telFlits[i] > 0 ? 3.2 : telBasis[i] * (0.85 + 0.15 * Math.sin(now * 3 + i));
          telSil.setColorAt(i, C.setRGB(0.8 * k, 0.86 * k, k));
        }
        telSil.instanceMatrix.needsUpdate = true;
        telSil.instanceColor.needsUpdate = true;
      }
      for (const t of telefoons) {
        if (t.flits > 0) t.flits -= dt; else if (Math.random() < dt * 0.1) t.flits = 0.08;
        const k = t.flits > 0 ? 3 : t.basis * (0.85 + 0.15 * Math.sin(now * 2.5 + t.basis * 9));
        t.mat.color.setRGB(0.8 * k, 0.86 * k, k);
        const z = t.flits > 0 ? 1.6 : 1; t.sp.scale.set(t.sx * z, t.sy * z, 1);
      }
    }

    // --- camera ---
    // in: achter de loper aan naar binnen; schouder: laag over de schouder van de dj de kring in, langzaam zwaaiend;
    // totaal: hoog uit een hoek op de piramide; uit (na BLIJF): achter de loper aan naar de uitgang
    const camP = new THREE.Vector3(), camL = new THREE.Vector3(), lp = new THREE.Vector3(), vA = new THREE.Vector3(), vB = new THREE.Vector3(), richting = new THREE.Vector3(0, 0, 1);
    const uit = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 62 };
    const zwaaiFase = rr(0, RONDE);
    let vorigeFase = '', vorigeK = -1, vorigeT = 0;
    function loperLokaal(loper, out) {
      if (!loper) return null;
      const o = loper.root || loper;
      if (o.isVector3) out.copy(o);
      else if (o.getWorldPosition) o.getWorldPosition(out);
      else if (o.position) out.copy(o.position);
      else return null;
      return G.worldToLocal(out);
    }
    // richting langs de route: naar het routepunt na het dichtstbijzijnde stuk
    function vooruit(p, out) {
      let best = 1e9, j = 0;
      for (let i = 0; i < ROUTE.length - 1; i++) {
        const a = ROUTE[i], b = ROUTE[i + 1], dx = b.x - a.x, dz = b.z - a.z;
        const u = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
        const e = Math.hypot(a.x + dx * u - p.x, a.z + dz * u - p.z);
        if (e < best) { best = e; j = i; }
      }
      let t = ROUTE[j + 1];
      if (Math.hypot(t.x - p.x, t.z - p.z) < 0.8 && j + 2 < ROUTE.length) t = ROUTE[j + 2];
      out.set(t.x - p.x, 0, t.z - p.z);
      return out.lengthSq() < 1e-4 ? out.set(0, 0, 1) : out.normalize();
    }
    function binnen(v) {  // camera in de kelder houden (in de deuropening mag hij er even buiten)
      const deurlijn = Math.abs(v.x) < 0.9;
      v.x = Math.max(-W / 2 + 0.35, Math.min(W / 2 - 0.35, v.x));
      v.z = deurlijn ? Math.max(-D / 2 - 1, Math.min(D / 2 + 1, v.z)) : Math.max(-D / 2 + 0.35, Math.min(D / 2 - 0.35, v.z));
      v.y = Math.max(0.5, Math.min(H - 0.3, v.y));
      return v;
    }
    function cam(t, loper) {
      G.updateWorldMatrix(true, false);
      const dt = Math.max(0, Math.min(0.1, t - vorigeT)); vorigeT = t;
      let fase, k = 0, ts = 0;
      if (t < T_IN) fase = 'in';
      else if (t >= BLIJF) fase = 'uit';
      else { k = Math.floor((t - T_IN) / CYCLUS); ts = t - T_IN - k * CYCLUS; fase = ts < SCHOUDER ? 'schouder' : 'totaal'; }
      const nieuw = fase !== vorigeFase || k !== vorigeK; vorigeFase = fase; vorigeK = k;
      if (fase === 'in' || fase === 'uit') {
        if (loperLokaal(loper, lp)) {
          vooruit(lp, vA);
          if (nieuw || richting.lengthSq() < 0.01) richting.copy(vA); else richting.lerp(vA, 1 - Math.exp(-3 * dt)).normalize();
          vB.copy(lp).addScaledVector(richting, -2.5); vB.y = 1.8;
          vA.copy(lp).addScaledVector(richting, 2.2); vA.y = 1.15;
        } else if (fase === 'in') { vB.set(0, 1.8, -D / 2 + 0.8); vA.set(0, 1.3, 0); }  // geen loper: vanuit de ingang de kelder in
        else { vB.set(0, 1.8, D / 2 - 3.2); vA.set(0, 1.3, D / 2 + 2); }
        binnen(vB);
        if (nieuw) { camP.copy(vB); camL.copy(vA); }
        else { const f = 1 - Math.exp(-4 * dt); camP.lerp(vB, f); camL.lerp(vA, f); }
        uit.fov = 62;
      } else if (fase === 'schouder') {
        // hoek 0 = achter de dj (hij kijkt naar -z); de camera zwaait van links via achter naar rechts, iets over zijn rechterschouder
        // R0/zij: 0,85 m achter en 0,58 m naast hem (verder kan niet: glas van de piramide), dj aan de rand van het beeld i.p.v. zijn rug ervoor
        const th = 1.55 * Math.sin(ts * 0.19 + k * 2.4 + zwaaiFase), s = Math.sin(th), c = Math.cos(th), R0 = 0.85, zij = 0.58;
        camP.set(s * R0 + c * zij, CAMY + 0.04 * Math.sin(t * 0.8), DJZ + c * R0 - s * zij);
        camL.set(-s * 6 - c * zij * 0.8 + 0.03 * Math.sin(t * 1.7), 1.1 + 0.02 * Math.sin(t * 2.3), DJZ - c * 6 + s * zij * 0.8);  // beetje handheld
        uit.fov = 64;
      } else {
        const kant = k % 2 ? -1 : 1, a = kant * Math.PI / 4 - kant * (ts - SCHOUDER) * 0.05;
        camP.set(Math.cos(a) * 7.3, H - 0.42, Math.sin(a) * 7.3);
        camL.set(0, 0.7, 0);
        uit.fov = 70;
      }
      uit.pos.copy(camP); G.localToWorld(uit.pos);
      uit.look.copy(camL); G.localToWorld(uit.look);
      camDoel.copy(camP); doelGeldig = true; zetSil();
      return uit;
    }

    function opruimen() {
      for (const t of telefoons) { if (t.sp.parent) t.sp.parent.remove(t.sp); t.mat.dispose(); }
      telefoons.length = 0;
      telTex.dispose();
    }

    return { maat: { w: W, d: D, h: H }, route: ROUTE.map(p => ({ x: p.x, z: p.z })), blijf: BLIJF, cam, update, opruimen };
  }

  doolhof.registreer('boiler', { gewicht: 1.5, maak });
})();

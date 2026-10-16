// --- Doolhof: het stijlsysteem. Een grammatica die uit een handvol bouwstenen eindeloos veel verschillende kamers maakt ---
// kamer = architectuur (hal, arena, galerij, tempel, loods, pit, grot, gewelf) x sfeer (rauw, trippy, luxe, futuristisch,
// organisch) x palet x muurschildering x onderdelen (doolhof/onderdelen.js) x publieksopstelling x cameraregie.
// De sfeer bepaalt wat samengaat: schilderingen, structuur, vloer, paletregels, lichtpatronen, woorden, dj-plek, montagetempo.
// Het palet volgt de tinten van de schildering (a, b, c op een donkere basis); een geheugen houdt sfeer, schildering en
// onderdelen uit elkaars buurt. Per kamer één dj-plek en hooguit drie andere onderdelen: altijd één verhaal, nooit rommel.
// Onderdelen: een middenstuk (met eigen dj) alleen waar de dj midden in de kamer staat (arena, hal-eiland, tempel), muurwerk
// alleen bij vrije rechte wanden (tempel, pit), een rig alleen onder een vlak plafond (hal, galerij, pit). Via de bus van de
// kamer (groep.userData.dhBus) richten rigs en shows op onze dj, en volgen onze lagen hun blackout en stroboscoop.
// Alles leeft op de muziek: beat, pulse, energy, banden en clubRegie.stand (break dimt en ademt, opbouw versnelt tot
// stroboscoop, drop flitst, bundels slaan open en iedereen juicht). De camera knipt op de maat en op de drop.
// Prestatie: wanden/vloer onverlicht, statisch spul samengevoegd (Lambert, kleur per hoekpunt), ledlijnen, bundels en
// paddenstoelen elk één InstancedMesh, het achtergrondpubliek één draw call (club/publiek.js: 3D-menigte die zelf op de
// muziek beweegt), hooguit 2 lamp-handvatten; ctx.zwaar schaalt alles wat telt.
(() => {
  'use strict';
  const DH = window.doolhof;
  if (!DH || typeof DH.registreer !== 'function' || typeof THREE === 'undefined') return;

  // gedeelde lader voor de muurschilderingen (eerste bestand wint). Let op: een Texture heeft in three r128 geen userData,
  // daarom maakt deze versie hem eerst aan (anders gooit de regel een TypeError en laadt er niets).
  window.doolhof.tex = window.doolhof.tex || (() => { const c = {}; return (naam, herhaal) => { const k = naam + (herhaal ? '*' : ''); if (!c[k]) { const t = new THREE.TextureLoader().load('tex/doolhof/' + naam + '.jpg'); if (renderer.outputEncoding === THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding; if (herhaal) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.userData = t.userData || {}; t.userData.doolhofHouden = true; c[k] = t; } return c[k]; }; })();
  // vangnet: faalt de gedeelde lader (de versie zonder userData), dan laden we zelf en markeren we als houden
  const eigenTex = (() => { const c = {}; return (naam, herhaal) => { const k = naam + (herhaal ? '*' : ''); if (!c[k]) { const t = new THREE.TextureLoader().load('tex/doolhof/' + naam + '.jpg'); if (renderer.outputEncoding === THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding; if (herhaal) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.userData = { doolhofHouden: true }; c[k] = t; } return c[k]; }; })();
  let texKapot = false;
  function tex(naam, herhaal) {
    if (!texKapot) {
      try { const t = DH.tex(naam, herhaal); if (t) { if (!t.userData) t.userData = {}; t.userData.doolhofHouden = true; return t; } }
      catch (e) { texKapot = true; console.warn('doolhof stijl: gedeelde tex-lader faalt, eigen lader', e); }
    }
    return eigenTex(naam, herhaal);
  }

  // --- kleine hulpjes ---
  const RONDE = Math.PI * 2;
  const klem = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const glad = x => { x = klem(x); return x * x * (3 - 2 * x); };
  const frac = v => v - Math.floor(v);
  const hash = (i, j) => frac(Math.sin(i * 127.1 + j * 311.7) * 43758.5453);
  const kies = (r, a) => a[Math.min(a.length - 1, Math.floor(r() * a.length))];
  const tussen = (r, a, b) => a + r() * (b - a);
  const rond = (v, s) => Math.round(v / s) * s;
  const afst = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
  const tintAfstand = (a, b) => { const d = Math.abs(frac(a) - frac(b)); return Math.min(d, 1 - d); };
  const css = c => '#' + c.getHexString();
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const GEEN_REGIE = { stand: 'groove', sinds: 0, opbouwTel: 0, dropBeat: -1 };
  const strobeUit = () => typeof S !== 'undefined' && S && S.strobe === 'uit';  // keuze 'Stroboscoop: uit' in de balk: niet knipperen
  const regie = () => window.clubRegie || GEEN_REGIE;
  const onthoud = (lijst, x, n) => { lijst.unshift(x); if (lijst.length > n) lijst.length = n; };
  function kiesGewogen(r, lijst, gw) {
    let som = 0; const g = lijst.map(x => { const v = Math.max(0, +gw(x) || 0); som += v; return v; });
    if (som <= 0) return kies(r, lijst);
    let t = r() * som;
    for (let i = 0; i < lijst.length; i++) { t -= g[i]; if (t < 0) return lijst[i]; }
    return lijst[lijst.length - 1];
  }
  const kiesUit = (r, tabel, extra) => kiesGewogen(r, Object.keys(tabel), k => tabel[k] * (extra ? extra(k) : 1));
  function schud(r, a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4(), _c = new THREE.Color();
  const ZAS = new THREE.Vector3(0, 0, 1), NEER = new THREE.Vector3(0, -1, 0), WIT = new THREE.Color(1, 1, 1), HSL = {};
  const mat4 = (x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
  function staafM(a, b, dik, dik2) {  // eenheidsdoos van a naar b
    const v = _w.subVectors(b, a), len = v.length() || 1e-3;
    _q.setFromUnitVectors(ZAS, v.divideScalar(len));
    return new THREE.Matrix4().compose(_p.addVectors(a, b).multiplyScalar(0.5), _q, _s.set(dik, dik2 || dik, len));
  }

  // --- gedeelde vormen en doeken (blijven bestaan: de kern gooit ze niet weg) ---
  const houd = x => { x.userData = x.userData || {}; x.userData.doolhofHouden = true; return x; };
  const VORM = {
    doos: houd(new THREE.BoxGeometry(1, 1, 1)),
    cil: houd(new THREE.CylinderGeometry(1, 1, 1, 14)),
    cil6: houd(new THREE.CylinderGeometry(1, 1, 1, 6)),
    ring: houd(new THREE.CylinderGeometry(1, 1, 1, 24, 1, true)),
    bundel: houd(new THREE.ConeGeometry(1, 1, 18, 1, true).translate(0, -0.5, 0)),  // top in de oorsprong, opening naar -y
    hoed: houd(new THREE.SphereGeometry(1, 12, 6, 0, RONDE, 0, Math.PI / 2)),       // paddenstoelhoed
    vlak: houd(new THREE.PlaneGeometry(1, 1)),
    schijf: houd(new THREE.CircleGeometry(1, 32)),
    oct: houd(new THREE.OctahedronGeometry(1, 0)),
    ico: houd(new THREE.IcosahedronGeometry(1, 0)),
    kegel: houd(new THREE.ConeGeometry(1, 1, 7)),
  };
  const DOEK = {};
  const DOEKMAAT = { beton: [512, 512, 1], marmer: [512, 512, 1], raster: [512, 512, 1], golven: [512, 512, 1], mos: [512, 512, 1], glans: [512, 512, 1], rots: [512, 512, 1],
    paneel: [512, 512, 1], fluweel: [512, 512, 1], golfplaat: [256, 256, 1], speaker: [256, 256, 0], plaat: [256, 256, 0], gloed: [64, 64, 0], bundel: [16, 128, 0] };
  function doek(naam) {
    if (!DOEK[naam]) {
      const [w, h, herhaal] = DOEKMAAT[naam], t = canvasTexture(w, h, TEKEN[naam]);
      if (herhaal) t.wrapS = t.wrapT = THREE.RepeatWrapping;
      DOEK[naam] = houd(t);
    }
    return DOEK[naam];
  }
  // schilders: grijs/wit op zwart, de kamer kleurt ze met de materiaalkleur (één doek voor elk palet)
  const R = Math.random;
  function vlek(g, w, h, x, y, r, kleur) {  // zachte vlek, ook over de rand heen (naadloos herhaalbaar)
    for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
      const cx = x + ox, cy = y + oy;
      if (cx + r < 0 || cx - r > w || cy + r < 0 || cy - r > h) continue;
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      gr.addColorStop(0, kleur); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    }
  }
  function korrel(g, w, h, n) {
    const img = g.getImageData(0, 0, w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const k = (R() - 0.5) * n; d[i] += k; d[i + 1] += k; d[i + 2] += k; }
    g.putImageData(img, 0, 0);
  }
  function scheur(g, w, h, n, kleur) {
    g.strokeStyle = kleur; g.lineWidth = 1;
    for (let i = 0; i < n; i++) {
      let x = R() * w, y = R() * h; g.beginPath(); g.moveTo(x, y);
      for (let j = 0; j < 10; j++) { x += (R() - 0.5) * 26; y += 4 + R() * 14; g.lineTo(x, y); }
      g.stroke();
    }
  }
  const TEKEN = {
    beton(g, w, h) {
      g.fillStyle = '#767676'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 48; i++) vlek(g, w, h, R() * w, R() * h, 20 + R() * 110, R() < 0.62 ? 'rgba(0,0,0,0.26)' : 'rgba(255,255,255,0.07)');
      g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 2;
      for (const x of [1, w / 2]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); g.beginPath(); g.moveTo(0, x); g.lineTo(w, x); g.stroke(); }
      scheur(g, w, h, 6, 'rgba(0,0,0,0.5)');
      korrel(g, w, h, 26);
    },
    marmer(g, w, h) {  // zwart marmer met witte aders (de kamer kleurt de aders goud, wit of in de sfeerkleur)
      g.fillStyle = '#0c0c0e'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 18; i++) vlek(g, w, h, R() * w, R() * h, 60 + R() * 140, 'rgba(255,255,255,0.045)');
      g.lineCap = 'round';
      for (let a = 0; a < 9; a++) {
        let x = R() * w, y = R() * h, hoek = R() * RONDE;
        const pts = [[x, y]];
        for (let j = 0; j < 40; j++) { hoek += (R() - 0.5) * 0.7; x += Math.cos(hoek) * 14; y += Math.sin(hoek) * 14; pts.push([x, y]); }
        for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
          g.save(); g.translate(ox, oy);
          g.strokeStyle = `rgba(255,255,255,${0.25 + R() * 0.45})`; g.lineWidth = 0.6 + R() * 2.2; g.shadowColor = '#fff'; g.shadowBlur = 5;
          g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.stroke(); g.restore();
        }
      }
    },
    raster(g, w, h) {  // zwarte vloer met een lichtgevend raster (futuristisch): 4 vakken per doek
      g.fillStyle = '#050506'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1;
      for (let i = 0; i <= 16; i++) { const v = i * w / 16; g.beginPath(); g.moveTo(v, 0); g.lineTo(v, h); g.stroke(); g.beginPath(); g.moveTo(0, v); g.lineTo(w, v); g.stroke(); }
      g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.shadowColor = '#ffffff'; g.shadowBlur = 8;
      for (let i = 0; i <= 4; i++) { const v = i * w / 4; g.beginPath(); g.moveTo(v, 0); g.lineTo(v, h); g.stroke(); g.beginPath(); g.moveTo(0, v); g.lineTo(w, v); g.stroke(); }
      g.fillStyle = '#ffffff';
      for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) g.fillRect(i * w / 4 - 5, j * h / 4 - 5, 10, 10);
    },
    golven(g, w, h) {  // psychedelische golfbanden (naadloos: hele perioden)
      g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
      g.lineCap = 'round';
      for (let k = 0; k < 10; k++) {
        const y0 = (k + 0.5) * h / 10, A = 10 + R() * 18, n = 1 + Math.floor(R() * 3), f = R() * RONDE;
        g.strokeStyle = `rgba(255,255,255,${0.25 + R() * 0.45})`; g.lineWidth = 4 + R() * 12; g.shadowColor = '#fff'; g.shadowBlur = 10;
        g.beginPath();
        for (let x = 0; x <= w; x += 8) { const y = y0 + A * Math.sin(RONDE * n * x / w + f); x ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.stroke();
      }
    },
    mos(g, w, h) {  // donkere aarde met lichtgevende sporen
      g.fillStyle = '#161616'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 60; i++) vlek(g, w, h, R() * w, R() * h, 15 + R() * 70, R() < 0.5 ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.06)');
      for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(255,255,255,${0.15 + R() * 0.8})`; g.beginPath(); g.arc(R() * w, R() * h, 0.5 + R() * 1.8, 0, RONDE); g.fill(); }
    },
    glans(g, w, h) {  // zwarte glimmende vloer met zachte weerschijn
      g.fillStyle = '#0a0a0c'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 9; i++) vlek(g, w, h, R() * w, R() * h, 60 + R() * 160, 'rgba(255,255,255,0.08)');
      g.strokeStyle = 'rgba(255,255,255,0.06)'; g.lineWidth = 2;
      for (let i = 0; i <= 4; i++) { const v = i * w / 4; g.beginPath(); g.moveTo(v, 0); g.lineTo(v, h); g.stroke(); g.beginPath(); g.moveTo(0, v); g.lineTo(w, v); g.stroke(); }
    },
    rots(g, w, h) {
      g.fillStyle = '#5c5c5c'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 110; i++) vlek(g, w, h, R() * w, R() * h, 8 + R() * 80, R() < 0.6 ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.08)');
      scheur(g, w, h, 14, 'rgba(0,0,0,0.55)');
      korrel(g, w, h, 30);
    },
    paneel(g, w, h) {  // sci-fi panelen met naden, klinknagels en roosters
      g.fillStyle = '#2c2d31'; g.fillRect(0, 0, w, h);
      const nx = 4, ny = 2, pw = w / nx, ph = h / ny;
      for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
        const x0 = x * pw, y0 = y * ph;
        g.fillStyle = `rgb(${44 + R() * 18 | 0},${45 + R() * 18 | 0},${50 + R() * 18 | 0})`; g.fillRect(x0 + 4, y0 + 4, pw - 8, ph - 8);
        g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x0 + 4, y0 + 4, pw - 8, 2); g.fillRect(x0 + 4, y0 + 4, 2, ph - 8);
        g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x0 + 4, y0 + ph - 6, pw - 8, 2); g.fillRect(x0 + pw - 6, y0 + 4, 2, ph - 8);
        g.fillStyle = 'rgba(0,0,0,0.6)';
        for (const [cx, cy] of [[10, 10], [pw - 10, 10], [10, ph - 10], [pw - 10, ph - 10]]) { g.beginPath(); g.arc(x0 + cx, y0 + cy, 3, 0, RONDE); g.fill(); }
        if (R() < 0.4) for (let k = 0; k < 6; k++) g.fillRect(x0 + pw * 0.3, y0 + ph * 0.35 + k * 9, pw * 0.4, 4);
      }
      korrel(g, w, h, 14);
    },
    fluweel(g, w, h) {  // plooien (verticaal, naadloos)
      const gr = g.createLinearGradient(0, 0, w, 0), n = 12;
      for (let i = 0; i <= n * 2; i++) gr.addColorStop(i / (n * 2), i % 2 ? '#2a2a2a' : '#bcbcbc');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 20; i++) vlek(g, w, h, R() * w, R() * h, 40 + R() * 90, 'rgba(0,0,0,0.18)');
    },
    golfplaat(g, w, h) {  // containerwand: ribbels met roest
      for (let x = 0; x < w; x += 16) { const gr = g.createLinearGradient(x, 0, x + 16, 0); gr.addColorStop(0, '#9a9a9a'); gr.addColorStop(0.5, '#e0e0e0'); gr.addColorStop(1, '#6a6a6a'); g.fillStyle = gr; g.fillRect(x, 0, 16, h); }
      for (let i = 0; i < 26; i++) vlek(g, w, h, R() * w, R() * h, 10 + R() * 50, 'rgba(60,30,10,0.35)');
      korrel(g, w, h, 20);
    },
    speaker(g, w, h) {  // speakerfront: één grote woofer en een tweeter (de kamer kleurt het randje mee op de bas)
      g.fillStyle = '#0d0d0f'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#3a3a3e'; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
      const cx = w / 2, cy = h * 0.56, r = w * 0.36;
      g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, r + 6, 0, RONDE); g.stroke();
      const gr = g.createRadialGradient(cx, cy, 4, cx, cy, r); gr.addColorStop(0, '#3a3a3e'); gr.addColorStop(0.3, '#141416'); gr.addColorStop(0.85, '#232326'); gr.addColorStop(1, '#0a0a0b');
      g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, r, 0, RONDE); g.fill();
      g.fillStyle = '#2c2c30'; g.beginPath(); g.arc(cx, cy, r * 0.28, 0, RONDE); g.fill();
      g.fillStyle = '#1c1c20'; g.beginPath(); g.arc(cx, h * 0.14, w * 0.07, 0, RONDE); g.fill();
      g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.beginPath(); g.arc(cx, h * 0.14, w * 0.07 + 3, 0, RONDE); g.stroke();
    },
    plaat(g, w) {  // draaiende plaat: groeven, wit label (krijgt de kleur van het materiaal), streepje
      const c = w / 2;
      g.fillStyle = '#060607'; g.beginPath(); g.arc(c, c, c, 0, RONDE); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 1;
      for (let r = 44; r < c - 2; r += 3) { g.beginPath(); g.arc(c, c, r, 0, RONDE); g.stroke(); }
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(c, c, 40, 0, RONDE); g.fill();
      g.fillRect(c + 44, c - 2, c - 50, 4);
    },
    gloed(g, w, h) {
      const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    },
    bundel(g, w, h) {  // fel bij de lamp (boven), uitdovend naar de vloer
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    },
  };
  {  // doeken in rustige tijd na het laden tekenen, één per keer (anders hapert de bouw van de eerste kamers)
    const mis = new Set();
    const stap = wacht => {
      const n = Object.keys(DOEKMAAT).find(k => !DOEK[k] && !mis.has(k));
      if (n) setTimeout(() => { try { doek(n); } catch (e) { mis.add(n); console.error('doolhof stijl: doek ' + n, e); } stap(350); }, wacht);
    };
    stap(9000);
  }

  // --- muurschilderingen: tinten (voor het palet), drukte (druk = gedimd en geen extra muurwerk), spiegelen bij herhalen ---
  const SCHILD = {
    'uv-jungle': { tint: [0.33, 0.86, 0.6], drukte: 0.9, spiegel: true },
    'bass-tempel': { tint: [0.12, 0.5], drukte: 0.6, spiegel: true },
    paddenstoelen: { tint: [0.05, 0.93, 0.3], drukte: 1, spiegel: true },
    'rave-flyers': { tint: [0.16, 0.9, 0.0], drukte: 1, spiegel: false },  // tekst: niet spiegelen
    'beton-bunker': { tint: [0.0, 0.6], drukte: 0.3, spiegel: true },
    kosmos: { tint: [0.86, 0.55, 0.7], drukte: 0.5, spiegel: true },
    neonsteeg: { tint: [0.95, 0.52], drukte: 0.8, spiegel: false },
    slijmhol: { tint: [0.3, 0.1], drukte: 0.7, spiegel: true },
    chroom: { tint: [0.75, 0.5, 0.12], drukte: 0.6, spiegel: true },
    arcade: { tint: [0.88, 0.52, 0.75], drukte: 0.9, spiegel: true },
    baksteen: { tint: [0.03, 0.55], drukte: 0.2, tegel: 2.4 },  // herhaalbaar (1:1)
    staal: { tint: [0.08, 0.58], drukte: 0.3, tegel: 2.6 },
  };
  const ASPECT = 2048 / 869;

  // --- sferen: wat samengaat. tinten = paletschema's [tintbereik a, b] (b mag 'wit', 'compl', 'triade' zijn), c volgt de sfeer ---
  const SFEER = {
    rauw: {
      schild: { 'beton-bunker': 3, 'rave-flyers': 2.5, neonsteeg: 1.5, baksteen: 1.6, staal: 1 },
      basis: { baksteen: 2, staal: 1.2, beton: 2 }, vloer: { beton: 3, staal: 1, glans: 0.7 },
      tinten: [[[0.98, 1.02], 'wit'], [[0.05, 0.09], [0.5, 0.56]], [[0.99, 1.02], [0.58, 0.64]], [[0.07, 0.1], [0.97, 1.0]], [[0.58, 0.64], 'wit'], [[0.15, 0.17], 'wit']],
      c: 'wit', struct: [0x5a5a62, 0x9a9aa4], patronen: ['trein', 'puls', 'wissel', 'flits'], dropPatroon: 'flits',
      woorden: ['RAW', 'NO PHONES', 'WAREHOUSE', 'BASEMENT', 'TECHNO', 'AFTER HOURS', 'LOUD', 'UNDERGROUND', 'DEEPER'],
      booth: 'kist', schok: 1, maten: 8, minShot: 3.6, energie: 0.8, blijf: 14,
      opstelling: { rijen: 3, verspreid: 2, kring: 1, lounge: 0.3 }, rollen: { dans: 6, juich: 2.5, staan: 1.6 },
      bouw: { hal: 2, arena: 0.8, galerij: 1.5, tempel: 0.4, loods: 3, pit: 2, grot: 0.5, gewelf: 3 },
    },
    trippy: {
      schild: { 'uv-jungle': 3, paddenstoelen: 3, kosmos: 2.5, chroom: 1.4, arcade: 1, slijmhol: 0.6 },
      basis: { rots: 1.2, beton: 0.6, paneel: 0.5 }, vloer: { golven: 2.5, glans: 1.5, mos: 0.8 },
      tinten: [[[0, 1], 'triade'], [[0, 1], 'compl'], [[0.8, 0.9], [0.28, 0.36]], [[0.12, 0.16], [0.76, 0.84]], [[0.5, 0.55], [0.9, 0.96]]],
      c: 'derde', struct: [0x4a3a5e, 0x7a5a9a], patronen: ['regenboog', 'radiaal', 'adem', 'trein'], dropPatroon: 'regenboog',
      woorden: ['TRIP', 'ACID', 'EXPAND', 'MELT', 'COSMIC', 'FREQUENCY', 'OM', 'WONDERLAND', 'DOSE'],
      booth: 'rond', schok: 0.35, maten: 16, minShot: 5, energie: 0.65, blijf: 18,
      opstelling: { kring: 3, verspreid: 2, rijen: 1 }, rollen: { dans: 7, juich: 2, staan: 1 },
      bouw: { hal: 1.2, arena: 3, galerij: 0.8, tempel: 2.5, loods: 1, pit: 2.2, grot: 2.5, gewelf: 1.2 },
    },
    luxe: {
      schild: { 'bass-tempel': 3, chroom: 2.5, kosmos: 0.8, arcade: 0.3 },
      basis: { marmer: 2.5, fluweel: 2 }, vloer: { marmer: 3, glans: 2 },
      tinten: [[[0.11, 0.125], [0.76, 0.82]], [[0.11, 0.125], [0.42, 0.47]], [[0.11, 0.125], [0.96, 0.99]], [[0.11, 0.125], [0.48, 0.52]], [[0.93, 0.97], 'wit']],
      c: 'warmwit', struct: [0x2a2030, 0xc89a3a], patronen: ['vonk', 'adem', 'trein', 'puls'], dropPatroon: 'vonk',
      woorden: ['VIP', 'GOLDEN HOUR', 'SAMSO', 'MAISON', 'DELUXE', 'NOIR', 'ROYALE', 'VELVET'],
      booth: 'plint', schok: 0.3, maten: 16, minShot: 5.2, energie: 0.55, blijf: 18,
      opstelling: { lounge: 3, rijen: 2, kring: 1.5, verspreid: 1 }, rollen: { dans: 5, juich: 1.2, staan: 3 },
      bouw: { hal: 1.5, arena: 2, galerij: 3, tempel: 3, loods: 0.4, pit: 1, grot: 0.3, gewelf: 1.5 },
    },
    futuristisch: {
      schild: { arcade: 2.5, chroom: 2, kosmos: 1.8, neonsteeg: 1.6, staal: 0.8 },
      basis: { paneel: 3, staal: 0.8 }, vloer: { raster: 3, glans: 1.5 },
      tinten: [[[0.5, 0.55], [0.83, 0.9]], [[0.58, 0.64], 'wit'], [[0.5, 0.53], [0.22, 0.27]], [[0.75, 0.8], [0.48, 0.52]], [[0.86, 0.9], [0.55, 0.6]]],
      c: 'ijs', struct: [0x6a7080, 0xc0c8d8], patronen: ['scan', 'wissel', 'trein', 'radiaal'], dropPatroon: 'scan',
      woorden: ['SYNTH', '2099', 'SYSTEM', 'CYBER', 'GRID', 'HYPER', 'ONLINE', 'NEON GENESIS', 'UPLOAD'],
      booth: 'zeshoek', schok: 0.5, maten: 8, minShot: 4, energie: 0.75, blijf: 15,
      opstelling: { rijen: 2.5, kring: 2.5, verspreid: 1 }, rollen: { dans: 6, juich: 2.5, staan: 1.2 },
      bouw: { hal: 2, arena: 3, galerij: 1.2, tempel: 0.8, loods: 2.2, pit: 2, grot: 0.4, gewelf: 2.2 },
    },
    organisch: {
      schild: { slijmhol: 3, paddenstoelen: 2.2, 'uv-jungle': 2.2, 'bass-tempel': 0.6 },
      basis: { rots: 3, mos: 1 }, vloer: { mos: 3, beton: 0.5 },
      tinten: [[[0.28, 0.36], [0.78, 0.86]], [[0.42, 0.48], [0.08, 0.12]], [[0.22, 0.27], [0.92, 0.97]], [[0.1, 0.13], [0.33, 0.4]]],
      c: 'licht', struct: [0x5a4632, 0x7a6a48], patronen: ['adem', 'radiaal', 'trein', 'vonk'], dropPatroon: 'radiaal',
      woorden: ['ROOTS', 'SPORE', 'GROW', 'WILD', 'MYCELIUM', 'BLOOM', 'SWAMP', 'HIVE'],
      booth: 'rots', schok: 0.4, maten: 16, minShot: 5, energie: 0.6, blijf: 18,
      opstelling: { kring: 2.5, verspreid: 2.5, rijen: 1 }, rollen: { dans: 6, juich: 1.6, staan: 2 },
      bouw: { hal: 0.7, arena: 1, galerij: 0.6, tempel: 2.5, loods: 0.5, pit: 1, grot: 3, gewelf: 0.8 },
    },
  };

  // --- geheugen tussen kamers: niet twee keer achter elkaar hetzelfde ---
  const GEHEUGEN = { sfeer: [], schild: [], tint: [], woord: [], onderdeel: {} };
  const geladen = new Set();  // welke schilderingen al op de gpu staan (op de tv niet allemaal tegelijk)

  function kiesSfeer(r, arch, stand) {
    return kiesUit(r, { rauw: 1, trippy: 1, luxe: 1, futuristisch: 1, organisch: 1 }, sf => {
      let g = SFEER[sf].bouw[arch] || 0.5;
      const i = GEHEUGEN.sfeer.indexOf(sf);
      if (i === 0) g *= 0.12; else if (i === 1) g *= 0.5;
      if ((stand === 'drop' || stand === 'opbouw') && (sf === 'rauw' || sf === 'futuristisch')) g *= 1.4;
      if (stand === 'break' && (sf === 'organisch' || sf === 'luxe' || sf === 'trippy')) g *= 1.3;
      return g;
    });
  }
  function kiesSchild(r, sf, Z) {
    const tabel = SFEER[sf].schild;
    const opTv = Z === 2 && geladen.size >= 6 && Object.keys(tabel).some(n => geladen.has(n));
    const naam = kiesUit(r, tabel, n => (opTv && !geladen.has(n) ? 0 : 1) * (GEHEUGEN.schild[0] === n ? 0.08 : GEHEUGEN.schild[1] === n ? 0.4 : 1));
    geladen.add(naam);
    return naam;
  }
  // palet: schema dat het best bij de schildering past; regels: a en b verschillen genoeg, donker = bijna zwart in de tint van a
  function maakPalet(r, sf, schild) {
    const S = SFEER[sf], tinten = SCHILD[schild].tint;
    const sch = kiesGewogen(r, S.tinten, s => {
      if (s[0][1] - s[0][0] >= 0.99) return 1;  // vrije tint: past altijd
      const h = (s[0][0] + s[0][1]) / 2;
      let best = 0.5; for (const t of tinten) best = Math.min(best, tintAfstand(h, t));
      return (0.35 + 2.2 * Math.max(0, 0.22 - best) / 0.22) * (GEHEUGEN.tint.some(t => tintAfstand(t, h) < 0.04) ? 0.4 : 1);
    });
    let ha = frac(tussen(r, sch[0][0], sch[0][1]));
    if (sch[0][1] - sch[0][0] >= 0.99) ha = frac(kies(r, tinten) + tussen(r, -0.05, 0.05));  // vrije tint: neem die van de schildering
    const a = new THREE.Color().setHSL(ha, 1, ha > 0.1 && ha < 0.14 ? 0.5 : 0.53);
    let b, hb;
    const sb = sch[1];
    if (sb === 'wit') { hb = ha; b = new THREE.Color().setHSL(ha, 0.18, 0.86); }
    else if (sb === 'compl') { hb = frac(ha + 0.5); b = new THREE.Color().setHSL(hb, 1, 0.53); }
    else if (sb === 'triade') { hb = frac(ha + 1 / 3); b = new THREE.Color().setHSL(hb, 1, 0.53); }
    else {
      hb = frac(tussen(r, sb[0], sb[1]));
      if (tintAfstand(ha, hb) < 0.1) hb = frac(hb + 0.12);  // te dicht bij a: wegduwen
      b = new THREE.Color().setHSL(hb, 1, 0.53);
    }
    let c;
    switch (S.c) {
      case 'derde': c = new THREE.Color().setHSL(frac(sb === 'triade' ? ha + 2 / 3 : (ha + hb) / 2 + (tintAfstand(ha, hb) > 0.3 ? 0.5 : 0)), 1, 0.6); break;
      case 'warmwit': c = new THREE.Color().setHSL(0.1, 0.55, 0.86); break;
      case 'ijs': c = new THREE.Color().setHSL(0.55, 0.45, 0.88); break;
      case 'licht': c = new THREE.Color().setHSL(frac(ha + 0.04), 0.8, 0.76); break;
      default: c = new THREE.Color().setHSL(ha, 0.12, 0.9);
    }
    const donker = new THREE.Color().setHSL(r() < 0.7 ? ha : hb, 0.5, tussen(r, 0.035, 0.06));
    onthoud(GEHEUGEN.tint, ha, 3);
    return { a, b, c, donker, ha, hb };
  }

  // --- geometrie ---
  // statisch spul samenvoegen: delen [[geometrie, Matrix4, kleur]] -> één geometrie met kleur per hoekpunt
  function samen(delen) {
    let n = 0;
    for (const [geo] of delen) n += geo.index ? geo.index.count : geo.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), kl = new Float32Array(n * 3);
    const nm = new THREE.Matrix3(), v = new THREE.Vector3(), c = new THREE.Color();
    let o = 0;
    for (const [geo, m, kleur] of delen) {
      const p = geo.attributes.position, nn = geo.attributes.normal, idx = geo.index;
      nm.getNormalMatrix(m); c.set(kleur == null ? 0xffffff : kleur);
      const cnt = idx ? idx.count : p.count;
      for (let k = 0; k < cnt; k++, o++) {
        const i = idx ? idx.getX(k) : k;
        v.fromBufferAttribute(p, i).applyMatrix4(m); pos[o * 3] = v.x; pos[o * 3 + 1] = v.y; pos[o * 3 + 2] = v.z;
        if (nn) v.fromBufferAttribute(nn, i).applyMatrix3(nm).normalize(); else v.set(0, 1, 0);
        nor[o * 3] = v.x; nor[o * 3 + 1] = v.y; nor[o * 3 + 2] = v.z;
        kl[o * 3] = c.r; kl[o * 3 + 1] = c.g; kl[o * 3 + 2] = c.b;
      }
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.BufferAttribute(kl, 3));
    return out;
  }
  const rechthoek = (w, d) => [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
  const veelhoek = (n, rad, draai) => Array.from({ length: n }, (_, i) => { const a = (i + 0.5) * RONDE / n + (draai || 0); return [Math.cos(a) * rad, Math.sin(a) * rad]; });
  function omtrekLengte(o) { let s = 0; for (let i = 0; i < o.length; i++) { const a = o[i], b = o[(i + 1) % o.length]; s += Math.hypot(b[0] - a[0], b[1] - a[1]); } return s; }
  // wanden langs een gesloten omtrek van y0 tot y1, naar binnen (DoubleSide). opt.uv(s, y, tegelnr) -> [u, v]; opt.tegel = breedte
  // waarop geknipt wordt (elke tegel eigen 0..1). Deuren 2 x 2,6 m midden in de vlakken op z = ±d/2, zoals ctx.doos.
  // opt.vervorm(p, s, y) mag punten verplaatsen (grot); opt.stapS/stapY verdelen de vlakken daarvoor.
  function wandGeo(omtrek, d, y0, y1, opt) {
    const pos = [], uv = [], tw = opt.tegel || 0, n = omtrek.length;
    let s = 0;
    for (let i = 0; i < n; i++) {
      const [ax, az] = omtrek[i], [bx, bz] = omtrek[(i + 1) % n], len = Math.hypot(bx - ax, bz - az);
      if (len < 1e-4) continue;
      const s0 = s; s += len;
      const knip = [s0, s];
      if (tw > 0) for (let k = Math.ceil(s0 / tw + 1e-6); k * tw < s - 1e-6; k++) knip.push(k * tw);
      let deur = null;
      if (Math.abs(az - bz) < 1e-3 && Math.abs(Math.abs(az) - d / 2) < 1e-3 && Math.min(ax, bx) <= -1 && Math.max(ax, bx) >= 1) {
        const sd = s0 + Math.abs(ax); deur = [sd - 1, sd + 1]; knip.push(deur[0], deur[1]);
      }
      knip.sort((p, q) => p - q);
      const punt = (ss, yy) => { const f = (ss - s0) / len, p = [ax + (bx - ax) * f, yy, az + (bz - az) * f]; return opt.vervorm ? opt.vervorm(p, ss, yy) : p; };
      for (let j = 0; j < knip.length - 1; j++) {
        const sa = knip[j], sb = knip[j + 1]; if (sb - sa < 1e-4) continue;
        const mid = (sa + sb) / 2, inDeur = deur && mid > deur[0] && mid < deur[1], ya = inDeur ? Math.max(y0, 2.6) : y0;
        if (y1 - ya < 1e-4) continue;
        const kt = tw > 0 ? Math.floor(mid / tw) : 0;
        const nx = opt.stapS ? Math.max(1, Math.ceil((sb - sa) / opt.stapS)) : 1, ny = opt.stapY ? Math.max(1, Math.ceil((y1 - ya) / opt.stapY)) : 1;
        for (let ix = 0; ix < nx; ix++) for (let iy = 0; iy < ny; iy++) {
          const sA = sa + (sb - sa) * ix / nx, sB = sa + (sb - sa) * (ix + 1) / nx, yA = ya + (y1 - ya) * iy / ny, yB = ya + (y1 - ya) * (iy + 1) / ny;
          const P = [punt(sA, yA), punt(sB, yA), punt(sB, yB), punt(sA, yB)], U = [opt.uv(sA, yA, kt), opt.uv(sB, yA, kt), opt.uv(sB, yB, kt), opt.uv(sA, yB, kt)];
          for (const k of [0, 1, 2, 0, 2, 3]) { pos.push(P[k][0], P[k][1], P[k][2]); uv.push(U[k][0], U[k][1]); }
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  }
  // vloer of plafond: vlak binnen de omtrek (met gaten), uv in tegels
  function vlakGeo(omtrek, y, tegel, gaten) {
    const vorm = new THREE.Shape(omtrek.map(([x, z]) => new THREE.Vector2(x, -z)));
    for (const g of gaten || []) vorm.holes.push(new THREE.Path(g.map(([x, z]) => new THREE.Vector2(x, -z))));
    const geo = new THREE.ShapeGeometry(vorm);
    geo.rotateX(-Math.PI / 2); geo.translate(0, y, 0);  // (x, -z) in het xy-vlak -> (x, y, z)
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / tegel, uv.getY(i) / tegel);
    return geo;
  }
  // koepel: ringen van de omtrek (op yRand) naar het midden (yTop)
  function koepelGeo(omtrek, yRand, yTop, K, tegel, vervorm) {
    const n = omtrek.length, pos = [], uv = [];
    const punt = (i, k) => {
      const f = 1 - k / K, [x, z] = omtrek[i % n];
      const p = [x * f, yRand + (yTop - yRand) * (1 - f * f), z * f];
      return vervorm && k > 0 && k < K ? vervorm(p, i % n, k) : p;
    };
    for (let k = 0; k < K; k++) for (let i = 0; i < n; i++) {
      const A = punt(i, k), B = punt(i + 1, k), C = punt(i + 1, k + 1), D = punt(i, k + 1);
      for (const P of [A, B, C, A, C, D]) { pos.push(P[0], P[1], P[2]); uv.push(P[0] / tegel, P[2] / tegel); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  }
  const koepelY = (f, yRand, yTop) => yRand + (yTop - yRand) * (1 - Math.min(1, f) * Math.min(1, f));
  // afstand van het midden tot de omtrek in richting a (stervormige omtrek)
  function straal(omtrek, a) {
    const dx = Math.cos(a), dz = Math.sin(a); let best = 1e9;
    for (let i = 0; i < omtrek.length; i++) {
      const [ax, az] = omtrek[i], [bx, bz] = omtrek[(i + 1) % omtrek.length], ex = bx - ax, ez = bz - az, den = dx * ez - dz * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = (ax * ez - az * ex) / den, u = (ax * dz - az * dx) / den;
      if (t > 0 && u >= -1e-6 && u <= 1 + 1e-6) best = Math.min(best, t);
    }
    return best;
  }

  // --- bouwcontext per kamer ---
  function materialen(B) {
    const { P, S, r } = B, info = SCHILD[B.schild];
    const helder = info.drukte > 0.75 ? 0.6 : info.drukte > 0.5 ? 0.72 : 0.85;
    const muurKleur = WIT.clone().lerp(P.a, 0.2).multiplyScalar(helder);
    const muur = new THREE.MeshBasicMaterial({ map: tex(B.schild, !!info.tegel), color: muurKleur.clone(), side: THREE.DoubleSide });
    const basisNaam = kiesUit(r, S.basis);
    const foto = basisNaam === 'baksteen' || basisNaam === 'staal';
    const basisKleur = foto ? new THREE.Color(0.36, 0.34, 0.34).lerp(P.donker, 0.3) : P.donker.clone().multiplyScalar(5.5).lerp(new THREE.Color(0.2, 0.2, 0.2), 0.3);
    const basis = new THREE.MeshBasicMaterial({ map: foto ? tex(basisNaam, true) : doek(basisNaam), color: basisKleur, side: THREE.DoubleSide });
    const vNaam = kiesUit(r, S.vloer);
    const vTegel = { beton: 4, staal: 2.6, glans: 4, marmer: 3.2, raster: 2, golven: 5, mos: 3 }[vNaam] || 4;
    const vKleur = {
      beton: new THREE.Color(0.42, 0.41, 0.41).lerp(P.donker, 0.4), staal: new THREE.Color(0.5, 0.48, 0.47), glans: P.a.clone().lerp(WIT, 0.3).multiplyScalar(0.55),
      marmer: P.c.clone().multiplyScalar(0.85), raster: P.a.clone().multiplyScalar(0.6), golven: P.b.clone().multiplyScalar(0.4), mos: P.a.clone().multiplyScalar(0.7),
    }[vNaam];
    const vLum = vKleur.r * 0.3 + vKleur.g * 0.59 + vKleur.b * 0.11;
    if (vLum > 0.22) vKleur.multiplyScalar(0.22 / vLum);  // clubvloer blijft donker (een lichte paletkleur gaf een vale grijze vloer die het licht wegdrukt)
    const vloer = new THREE.MeshBasicMaterial({ map: vNaam === 'staal' ? tex('staal', true) : doek(vNaam), color: vKleur.clone(), side: THREE.DoubleSide });
    const plafond = new THREE.MeshBasicMaterial({ map: basis.map, color: basisKleur.clone().multiplyScalar(0.5), side: THREE.DoubleSide });
    return { muur, muurKleur, basis, basisTegel: foto ? (basisNaam === 'staal' ? 2.6 : 2.4) : 4, vloer, vloerKleur: vKleur, vloerTegel: vTegel, vloerNaam: vNaam, plafond };
  }

  // ledlijnen: één InstancedMesh met staven (en één met ringen); per stuk fase (0 ingang .. 1 uitgang), ring (afstand tot het
  // middelpunt, 0..1), groep en kleur (0 = a, 1 = b, 2 = c). Het patroon kiest de lichtregie per tel.
  function maakNet(B) {
    const staven = [], ringen = [];
    const info = (o, mid) => Object.assign({ kl: 0, groep: 0, fase: klem((mid.z + B.d2) / (2 * B.d2)), ring: -1, mid: mid.clone() }, o || {});
    const net = {
      staaf(a, b, dik, o) { if (a.distanceTo(b) > 1e-3) staven.push(Object.assign(info(o, _w.addVectors(a, b).multiplyScalar(0.5)), { a: a.clone(), b: b.clone(), dik })); },
      ring(c, rad, hoog, o) { ringen.push(Object.assign(info(o, c), { c: c.clone(), rad, hoog })); },
      // polylijn in stukken van hooguit stap meter
      lijn(punten, dik, o, gesloten, stap = 1.6) {
        const n = punten.length, m = gesloten ? n : n - 1;
        for (let i = 0; i < m; i++) {
          const a = punten[i], b = punten[(i + 1) % n], k = Math.max(1, Math.ceil(a.distanceTo(b) / stap));
          for (let j = 0; j < k; j++) net.staaf(_p.lerpVectors(a, b, j / k).clone(), _s.lerpVectors(a, b, (j + 1) / k).clone(), dik, Object.assign({ groep: i + j }, o));
        }
      },
      aantal: () => staven.length + ringen.length,
      klaar() {
        const F = B.focus, md = Math.max(1, ...staven.map(s => afst(s.mid, F)), ...ringen.map(s => afst(s.mid, F)));
        for (const it of staven.concat(ringen)) if (it.ring < 0) it.ring = afst(it.mid, F) / md;
        net.delen = [];
        for (const [lijst, geo] of [[staven, VORM.doos], [ringen, VORM.ring]]) {
          if (!lijst.length) continue;
          const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), lijst.length);
          mesh.frustumCulled = false;
          lijst.forEach((it, i) => {
            mesh.setMatrixAt(i, it.a ? staafM(it.a, it.b, it.dik) : mat4(it.c.x, it.c.y, it.c.z, it.rad, it.hoog, it.rad));
            mesh.setColorAt(i, _c.setRGB(0, 0, 0));
          });
          B.G.add(mesh); net.delen.push({ mesh, lijst });
        }
      },
      update(L, b) {
        if (!net.delen) return;
        const P = B.P, pat = PATROON[L.patroon] || PATROON.puls;
        let n = 0;
        for (const { mesh, lijst } of net.delen) {
          for (let i = 0; i < lijst.length; i++, n++) {
            const it = lijst[i];
            let v = pat(it, n, b, L);
            if (L.strobo >= 0) v = L.strobo ? 1.1 : 0.04;  // laatste tellen van de opbouw
            let k = it.kl === 2 ? P.c : (it.kl === 1) !== L.wissel ? P.b : P.a;
            if (L.patroon === 'regenboog') k = _c.setHSL(frac(P.ha + it.fase * 0.6 + it.ring * 0.3 + b.pos / 32), 1, 0.55);
            else if (L.dropKleur && Math.floor(b.pos) % 2) k = P.c;
            _c.copy(k).multiplyScalar(v * L.k);
            if (L.flits > 0) _c.lerp(WIT, L.flits * 0.7);
            mesh.setColorAt(i, _c);
          }
          mesh.instanceColor.needsUpdate = true;
        }
      },
    };
    return net;
  }
  // lichtpatronen (0..1+): fase = langs de looprichting, ring = vanaf het middelpunt
  const PATROON = {
    puls: (it, i, b) => 0.18 + 0.82 * b.pulse,
    trein: (it, i, b, L) => 0.06 + 0.95 * Math.pow(1 - frac(L.loop / 4 - it.fase), 5),
    radiaal: (it, i, b, L) => 0.06 + Math.exp(-Math.pow((frac(L.loop / 2) - it.ring) * 5, 2)),
    wissel: (it, i, b) => ((it.groep + Math.floor(b.pos)) % 2 ? 1 : 0.1) * (0.55 + 0.45 * b.pulse),
    flits: (it, i, b) => (hash(i, Math.floor(b.pos * 2)) > 0.7 ? 1.1 : 0.05),
    adem: (it, i, b) => 0.28 + 0.72 * (0.5 + 0.5 * Math.sin(b.pos * Math.PI / 4 + it.fase * RONDE)),
    scan: (it, i, b, L) => 0.05 + Math.exp(-Math.pow((frac(L.loop / 8) - it.fase) * 12, 2)),
    regenboog: (it, i, b) => 0.4 + 0.6 * b.pulse,
    vonk: (it, i, b) => (hash(i, Math.floor(b.pos * 4)) > 0.86 ? 1.2 : 0.12 + 0.22 * b.pulse),
  };

  // lichtregie van de kamer: niveau, patroon en flitsen uit clubRegie.stand en de muziek
  function maakLicht(B) {
    const S = B.S, L = { k: 0.75, kBasis: 0.75, flits: 0, opb: 0, snel: 1, loop: 0, vorigePos: null, stand: null, patroon: S.patronen[0], wissel: false, strobo: -1, dropKleur: false, dropStart: false };
    L.stap = (dt, b) => {
      const reg = regie(), st = reg.stand || 'groove';
      L.dropStart = false;
      if (st !== L.stand) { if (st === 'drop' && L.stand !== null) { L.flits = 1; L.dropStart = true; } L.stand = st; }
      L.opb = st === 'opbouw' ? klem((reg.opbouwTel || 0) / 16) : 0;
      const doel = st === 'break' ? 0.36 : st === 'opbouw' ? 0.42 + 0.5 * L.opb : st === 'drop' ? 1.05 : 0.68 + 0.32 * (b.energy || 0);
      L.kBasis += (doel - L.kBasis) * Math.min(1, dt * (st === 'drop' ? 7 : 1.4));
      let dim = 0, fl = 0;  // shows van onderdelen.js zetten dim (blackout) en flits (stroboscoop) op de bus
      const bus = B.G.userData.dhBus;
      if (bus && bus.shows) for (const sh of bus.shows) { if (sh.dim > dim) dim = sh.dim; if (sh.flits > fl) fl = sh.flits; }
      L.k = L.kBasis * (1 - 0.85 * klem(dim));
      L.flits = Math.max(L.flits - dt * 2.2, klem(fl), 0);
      L.snel = st === 'opbouw' ? 1 + 3 * L.opb : st === 'drop' ? 2 : 1;
      L.loop += klem(L.vorigePos == null ? 0 : b.pos - L.vorigePos, 0, 2) * L.snel; L.vorigePos = b.pos;  // looplicht-fase: versnelt zonder te springen
      L.strobo = st === 'opbouw' && L.opb > 0.75 && !strobeUit() ? (Math.floor(b.pos * 4) % 2 ? 1 : 0) : -1;
      const sindsDrop = b.pos - (reg.dropBeat >= 0 ? reg.dropBeat : -99);
      L.dropKleur = st === 'drop' && sindsDrop < 8;
      if (st === 'break') L.patroon = 'adem';
      else if (st === 'opbouw') L.patroon = 'trein';
      else if (st === 'drop') L.patroon = sindsDrop < 8 ? 'puls' : S.dropPatroon;
      else {  // groove: elke 16 tellen een ander patroon, om de twee frasen wisselen a en b van rol
        const fr = Math.floor(b.pos / 16), n = S.patronen.length;
        L.patroon = S.patronen[((fr % n) + n) % n]; L.wissel = ((fr % 4) + 4) % 4 >= 2;
      }
    };
    return L;
  }

  // --- route en vrije ruimte ---
  const routeAfstand = pts => (x, z) => {
    let best = 1e9;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], dx = bx - ax, dz = bz - az;
      const u = klem(((x - ax) * dx + (z - az) * dz) / Math.max(1e-9, dx * dx + dz * dz));
      best = Math.min(best, Math.hypot(ax + dx * u - x, az + dz * u - z));
    }
    return best;
  };
  function zetRoute(B, A) {
    const pts = A.route.map(p => [p.x, p.z]), cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const len = cum[cum.length - 1];
    B.routeLen = len;
    B.opRoute = s => {
      s = klem(s, 0, len);
      let i = 1; while (i < cum.length - 1 && cum[i] < s) i++;
      const f = (s - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
      return { x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, z: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f };
    };
    B.routeAfst = routeAfstand(pts);
    B.routeS = (x, z) => {  // booglengte van het routepunt het dichtst bij (x, z)
      let best = 1e9, bs = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1], dx = bx - ax, dz = bz - az, ll = Math.max(1e-9, dx * dx + dz * dz);
        const u = klem(((x - ax) * dx + (z - az) * dz) / ll), e = Math.hypot(ax + dx * u - x, az + dz * u - z);
        if (e < best) { best = e; bs = cum[i] + u * Math.sqrt(ll); }
      }
      return bs;
    };
    let best = 1e9;  // wachtplek zoals de kern hem kiest: het routepunt het dichtst bij het midden
    for (let s = 1.4; s <= len - 1.4; s += 0.2) { const p = B.opRoute(s), d = Math.hypot(p.x, p.z); if (d < best) { best = d; B.wacht = p; B.wachtS = s; } }
    if (!B.wacht) { B.wacht = B.opRoute(len / 2); B.wachtS = len / 2; }
    B.vrij = (x, z, m = 0) => B.routeAfst(x, z) >= 0.95 + m && Math.hypot(x - B.wacht.x, z - B.wacht.z) >= 1.5 + m &&
      B.obst.every(o => Math.hypot(x - o.x, z - o.z) >= o.r + 0.4 + m) && A.binnenVoet(x, z, 0.45 + (B.wandMarge || 0) + m) && !(Math.abs(x) < 1.7 && Math.abs(z) > A.d / 2 - 2.2);
  }

  // --- publiek: kandidaat-plekken per zone ---
  function kandidaten(r, z, stap) {
    const uit = [], y = z.y || 0, jit = () => (r() - 0.5) * stap * 0.35;
    const kijk = (x, zz, k) => Math.atan2(k.x - x, k.z - zz) + (r() - 0.5) * 0.5;
    if (z.soort === 'ring') {
      const a0 = z.a0 || 0, a1 = z.a1 == null ? RONDE : z.a1, vrijRond = z.a1 == null;
      for (let rr = z.r0; rr <= z.r1 + 1e-3; rr += stap) {
        const n = Math.max(1, Math.floor((a1 - a0) * rr / stap)), off = vrijRond ? r() * RONDE : 0;
        for (let i = 0; i < n; i++) {
          const a = a0 + (a1 - a0) * (i + 0.5) / n + off + (r() - 0.5) * 0.12, x = z.c.x + Math.cos(a) * rr + jit(), zz = z.c.z + Math.sin(a) * rr + jit();
          uit.push({ x, z: zz, y, face: kijk(x, zz, z.kijk || z.c), rij: Math.round((rr - z.r0) / stap) });
        }
      }
    } else if (z.soort === 'rijen') {
      const [ux, uz] = z.u, vx = -uz, vz = ux;
      for (let dd = z.d0, rij = 0; dd <= z.d1 + 1e-3; dd += stap * 1.08, rij++) {
        for (let l = -z.breed + (rij % 2) * stap / 2; l <= z.breed + 1e-3; l += stap) {
          const x = z.c.x + ux * dd + vx * l + jit(), zz = z.c.z + uz * dd + vz * l + jit();
          uit.push({ x, z: zz, y, face: kijk(x, zz, z.kijk || z.c), rij });
        }
      }
    } else if (z.soort === 'vlak') {
      for (let x = z.x0; x <= z.x1 + 1e-3; x += stap) for (let zz = z.z0; zz <= z.z1 + 1e-3; zz += stap) {
        const px = x + jit(), pz = zz + jit(); uit.push({ x: px, z: pz, y, face: kijk(px, pz, z.kijk), rij: 0 });
      }
    } else if (z.soort === 'strook') {
      const L = Math.hypot(z.b.x - z.a.x, z.b.z - z.a.z), n = Math.max(1, Math.floor(L / stap));
      for (let i = 0; i <= n; i++) { const f = i / n, x = z.a.x + (z.b.x - z.a.x) * f + jit() * 0.5, zz = z.a.z + (z.b.z - z.a.z) * f + jit() * 0.5; uit.push({ x, z: zz, y, face: kijk(x, zz, z.kijk), rij: 0 }); }
    }
    const k = z.klem;  // zone begrenzen (rmax = straal vanaf het midden, klem = rechthoek)
    return uit.filter(p => (!z.rmax || Math.hypot(p.x, p.z) <= z.rmax) && (!k || (p.x >= k.x0 && p.x <= k.x1 && p.z >= k.z0 && p.z <= k.z1)));
  }
  function kiesRol(B, p) {
    const S = B.S, ver = p.ver || 0;
    return kiesUit(B.r, S.rollen, rol => rol === 'juich' ? 0.4 + B.energie : rol === 'staan' ? (ver > 4.5 ? 1.6 : 0.7) : 1);
  }
  // bank zoals de lounge van de club (heupen op 0,69 m); geeft zitplekken terug
  function bank(B, x, z, face, len, n) {
    const kl = B.P.donker.clone().lerp(B.P.a, 0.25).getHex(), ry = face, c = Math.cos(ry), s = Math.sin(ry);
    const lok = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    for (const [lx, ly, lz, sx, sy, sz] of [[0, 0.525, -0.105, len, 0.15, 0.73], [0, 0.225, -0.205, len, 0.45, 0.53], [0, 0.85, -0.37, len, 1.1, 0.3]]) {
      const [px, pz] = lok(lx, lz); B.vast.push([VORM.doos, mat4(px, ly, pz, sx, sy, sz, 0, ry, 0), kl]);
    }
    const plekken = [];
    for (let i = 0; i < n; i++) { const [px, pz] = lok((i + 0.5) / n * len - len / 2, 0); plekken.push({ x: px, z: pz, face }); }
    B.obst.push({ x, z, r: len / 2, bank: true });
    return plekken;
  }
  function bevolk(B, A) {
    const { r, Z, ctx } = B;
    let budget = [9, 5, 4][Z];
    const opst = A.opstellingen ? kiesUit(r, A.opstellingen, o => (B.S.opstelling[o] || 0.5)) : 'rijen';
    B.opstelling = opst;
    const plaats = (p, rol) => {
      if (budget <= 0) return null;
      const d = ctx.figuur({ x: p.x, z: p.z, face: p.face, rol });
      if (!d) { budget = 0; return null; }
      if (p.y) { d.yOff = p.y; if (d.root) d.root.position.y = p.y; }
      budget--; B.figs.push({ d, rol, p });
      return d;
    };
    // extra figuren van de architectuur (balkon, podiumrand) eerst: die maken het beeld
    for (const e of (A.extra3d || []).slice(0, [3, 2, 1][Z])) plaats(e, e.rol || 'dans');
    // lounge-randen: banken met zittende figuren
    if (opst === 'lounge' && A.lounge && A.lounge.length) {
      const l = kies(r, A.lounge), len = Math.min(3.2, l.len || 3), zit = bank(B, l.x, l.z, l.face, len, 2);
      if (A.lounge.length > 1 && Z < 2) { const l2 = A.lounge.find(q => q !== l); if (l2) zit.push(...bank(B, l2.x, l2.z, l2.face, len, 2)); }
      for (const p of zit.slice(0, Z === 2 ? 1 : 3)) plaats(p, 'zit');
    }
    // vloer: kandidaten uit de zones, vrij van looppad, wachtplek en obstakels. De opstelling vormt ze om:
    // kring = rijen worden een hoefijzer om de dj; verspreid = groepjes van 2-3 die naar elkaar toe staan
    const F = B.dj || B.focus;
    const zones = A.zones3d.map(z => opst === 'kring' && z.soort === 'rijen'
      ? Object.assign({}, z, { soort: 'ring', r0: z.d0, r1: z.d1, a0: Math.atan2(z.u[1], z.u[0]) - 1.15, a1: Math.atan2(z.u[1], z.u[0]) + 1.15 }) : z);
    const kand = [].concat(...zones.map(z => kandidaten(r, z, 0.95))).filter(p => B.vrij(p.x, p.z));
    for (const p of kand) p.ver = afst(p, F);
    kand.sort((p, q) => p.ver - q.ver);
    const gekozen = [];
    if (opst === 'verspreid') {
      const kernen = [];
      for (const c of schud(r, kand.slice())) {
        if (gekozen.length >= budget) break;
        if (kernen.some(k => afst(c, k) < 2.6)) continue;
        kernen.push(c);
        const n = r() < 0.5 ? 2 : 3, a0 = r() * RONDE;
        for (let i = 0; i < n && gekozen.length < budget; i++) {
          const a = a0 + i / n * RONDE, p = { x: c.x + Math.cos(a) * 0.62, z: c.z + Math.sin(a) * 0.62, y: c.y };
          if (!B.vrij(p.x, p.z) || gekozen.some(q => afst(p, q) < 0.75)) continue;
          p.face = Math.atan2(c.x - p.x, c.z - p.z) + (r() - 0.5) * 0.6; p.ver = afst(p, F); p.groepje = true;
          gekozen.push(p);
        }
      }
    } else for (const p of kand) {  // vooraan eerst, gespreid
      if (gekozen.length >= budget) break;
      if (gekozen.some(q => afst(p, q) < 1.15) || r() < 0.22) continue;
      gekozen.push(p);
    }
    for (const p of gekozen) if (!plaats(p, p.groepje && r() < 0.45 ? 'staan' : kiesRol(B, p))) break;
    // achtergrondpubliek: de rest van de kandidaten en de massa-zones (3D-menigte, één draw call; aantal per kwaliteitsstand)
    const maxPub = window.clubPubliek && clubPubliek.maak ? clubPubliek.aantal(48) : 0, pub = [], bezet = B.figs.map(f => f.p);
    const pool = kand.filter(p => !gekozen.includes(p)).concat(...(A.massa || []).map(z => kandidaten(r, z, 0.78).filter(p => B.vrij(p.x, p.z, -0.25))));
    schud(r, pool);
    for (const p of pool) {
      if (pub.length >= maxPub) break;
      if (pub.some(q => afst(p, q) < 0.58) || bezet.some(q => q && afst(p, q) < 0.8)) continue;
      pub.push(p);
    }
    maakPubliek(B, pub);
  }
  // 3D-menigte (club/publiek.js): kijkt naar de dj, rand van tegenlicht in kleur a (vanaf de dj) en b (van achteren/boven);
  // deinen, knikken, handen omhoog en telefoons doet de shader zelf. Hier alleen het lichtniveau van de kamer (break dimt,
  // blackout van een show, stroboscoop/drop-flits) en in de eerste 8 tellen van de drop iedereen de handen omhoog.
  function maakPubliek(B, lijst) {
    if (!lijst.length || !window.clubPubliek || !clubPubliek.maak) return;
    const { r, P, G } = B, F = B.focus;
    const h = clubPubliek.maak(G, { plekken: lijst.map(p => ({ x: p.x, y: p.y || 0, z: p.z, face: p.face })), vast: true, rnd: r, dicht: 1.2,
      kleuren: { a: P.a, b: P.b, vul: P.donker }, licht: { x: F.x, y: F.y + 1.4, z: F.z } });
    if (!h) return;
    B.publiek = h;
    B.updates.push((dt, now, b, L) => { h.helder = 0.45 + 0.6 * L.k; h.flits = L.flits; h.armen = L.dropKleur ? 1 : 0; });
  }

  // --- licht- en showlagen ---
  // bundels (moving heads): één InstancedMesh met kegels; bronnen [{ p, doel, kl, zwaai }]
  function maakBundels(B, bronnen) {
    const n = Math.min(bronnen.length, [8, 4, 0][B.Z]);
    if (!n) return;
    const lijst = bronnen.slice(0, n).map((q, i) => Object.assign({ ph: B.r() * RONDE, zwaai: 1.6, kl: i % 2 }, q));
    const mesh = new THREE.InstancedMesh(VORM.bundel, new THREE.MeshBasicMaterial({ map: doek('bundel'), color: 0xffffff, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), n);
    mesh.frustumCulled = false; B.G.add(mesh);
    for (let i = 0; i < n; i++) mesh.setColorAt(i, _c.setRGB(0, 0, 0));  // three r128: kleuren vóór het eerste tekenen, anders compileert de shader zonder (alles wit)
    const D = new THREE.Vector3(), T = new THREE.Vector3(), M4 = new THREE.Matrix4(), SS = new THREE.Vector3(), Q = new THREE.Quaternion();
    let t = 0;
    B.updates.push((dt, now, b, L) => {
      const st = L.stand, snel = st === 'drop' ? 2.2 : st === 'opbouw' ? 1 + 2 * L.opb : st === 'break' ? 0.3 : 1;
      t += dt * snel;
      lijst.forEach((q, i) => {
        const amp = q.zwaai * (st === 'drop' ? 1.5 : st === 'break' ? 0.4 : 1);
        T.set(q.doel.x + amp * Math.sin(t * 0.9 + q.ph), q.doel.y || 0, q.doel.z + amp * Math.cos(t * 0.6 + q.ph * 1.7));
        D.subVectors(T, q.p); const len = D.length(); D.divideScalar(len);
        Q.setFromUnitVectors(NEER, D);
        const breed = len * 0.13;
        mesh.setMatrixAt(i, M4.compose(q.p, Q, SS.set(breed, len, breed)));
        let v = st === 'break' ? 0.18 : st === 'opbouw' ? 0.25 + 0.6 * L.opb : st === 'drop' ? 0.8 + 0.4 * b.pulse : 0.3 + 0.55 * b.pulse;
        if (L.strobo >= 0) v = L.strobo ? 1 : 0;
        if (st === 'drop' && L.dropKleur) v *= Math.floor(b.pos * 2) % 2 ? 1.2 : 0.3;
        _c.copy(q.kl === 2 ? B.P.c : (q.kl === 1) !== L.wissel ? B.P.b : B.P.a).multiplyScalar(v);
        mesh.setColorAt(i, _c);
      });
      mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
    });
  }
  // gloedplassen op de vloer (nep-licht): één InstancedMesh met platte gloedvlakken
  function maakPoelen(B, lijst) {
    if (!lijst.length) return;
    const mesh = new THREE.InstancedMesh(VORM.vlak, new THREE.MeshBasicMaterial({ map: doek('gloed'), color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), lijst.length);
    mesh.frustumCulled = false; B.G.add(mesh);
    lijst.forEach((q, i) => { mesh.setMatrixAt(i, mat4(q.x, (q.y || 0) + 0.015, q.z, q.r * 2, q.r * 2, 1, -Math.PI / 2, 0, 0)); mesh.setColorAt(i, _c.setRGB(0, 0, 0)); });  // kleur vóór het eerste tekenen (r128)
    B.updates.push((dt, now, b, L) => {
      lijst.forEach((q, i) => mesh.setColorAt(i, _c.copy(q.kl === 1 ? B.P.b : q.kl === 2 ? B.P.c : B.P.a).multiplyScalar((0.16 + 0.32 * (q.bas ? b.bas : b.pulse)) * L.k + L.flits * 0.3)));
      mesh.instanceColor.needsUpdate = true;
    });
  }
  // waas onder het plafond: rook-sprites die langzaam rond drijven
  function maakWaas(B, n, x0, x1, y0, y1, z0, z1) {
    n = Math.min(n, [6, 3, 0][B.Z]);
    const r = B.r, waas = [];
    for (let i = 0; i < n; i++) {
      const bron = typeof smokeTex !== 'undefined' && smokeTex[i % smokeTex.length] ? smokeTex[i % smokeTex.length] : doek('gloed');
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: bron, color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, rotation: r() * RONDE }));
      const s = tussen(r, 3.2, 5); sp.scale.set(s, s * 0.7, 1); sp.position.set(tussen(r, x0, x1), tussen(r, y0, y1), tussen(r, z0, z1)); B.G.add(sp);
      waas.push({ sp, vx: tussen(r, -0.12, 0.12), vz: tussen(r, -0.12, 0.12), kl: i % 2 });
    }
    if (n) B.updates.push((dt, now, b, L) => {
      for (const w of waas) {
        const p = w.sp.position; p.x += w.vx * dt; p.z += w.vz * dt;
        if ((p.x < x0 && w.vx < 0) || (p.x > x1 && w.vx > 0)) w.vx = -w.vx;
        if ((p.z < z0 && w.vz < 0) || (p.z > z1 && w.vz > 0)) w.vz = -w.vz;
        w.sp.material.rotation += dt * 0.02;
        w.sp.material.color.copy(w.kl ? B.P.b : B.P.a).multiplyScalar((0.07 + 0.09 * b.pulse) * L.k + L.flits * 0.15);
      }
    });
  }

  // --- de dj: verhoging in de stijl van de sfeer, tafel met draaitafels en mixer, naam in neon op de voorkant ---
  function bouwDj(B, A) {
    const j = A.dj, { ctx, r, S, P } = B, f = j.face, c = Math.cos(f), s = Math.sin(f);
    const y0 = j.y || 0, riserH = j.riser === false ? 0 : 0.3, yv = y0 + riserH;
    const lok = (lx, ly, lz) => V(j.x + lx * c + lz * s, ly, j.z - lx * s + lz * c);  // dj-ruimte (kijkt naar +z) -> kamer
    const d = ctx.figuur({ x: j.x, z: j.z, face: f, rol: 'dj', filter: S.booth === 'rots' || S.booth === 'rond' ? /alien|wizard/ : null }) || ctx.figuur({ x: j.x, z: j.z, face: f, rol: 'dj' });
    let djH = 1.75;
    if (d) {
      d.yOff = yv; if (d.root) d.root.position.y = yv;
      if (d.M && d.body) djH = Math.abs(d.body.scale.y) * (d.M.h || 1);
      if (!(djH > 1 && djH < 3)) djH = 1.75;
    }
    const TOP = yv + klem(0.56 * djH, 0.95, 1.25), kast = TOP - yv - 0.04;
    const [hoofd, rand] = S.struct, push = (geo, x, y, z, sx, sy, sz, kl, rx = 0, rz = 0) => { const p = lok(x, y, z); B.vast.push([geo, mat4(p.x, p.y, p.z, sx, sy, sz, rx, f, rz), kl]); };
    // verhoging
    if (riserH > 0) {
      const st = S.booth;
      if (st === 'kist') for (const [x, z] of [[-0.55, -0.35], [0.55, -0.35], [-0.55, 0.45], [0.55, 0.45]]) {  // flightcases met metalen randen
        push(VORM.doos, x, y0 + riserH / 2, z, 1.06, riserH, 0.76, 0x141416);
        push(VORM.doos, x, y0 + riserH - 0.02, z, 1.1, 0.04, 0.8, 0x6a6a70);
      } else if (st === 'zeshoek') push(VORM.cil6, 0, y0 + riserH / 2, 0.05, 1.35, riserH, 1.35, hoofd);
      else if (st === 'rond') push(VORM.cil, 0, y0 + riserH / 2, 0.05, 1.3, riserH, 1.3, hoofd);
      else if (st === 'rots') for (let i = 0; i < 4; i++) push(VORM.ico, (i % 2 - 0.5) * 0.9, y0 + riserH * 0.4, (i < 2 ? -0.3 : 0.45), 0.85, riserH * 1.1, 0.75, 0x2a241e, r(), r());
      else push(VORM.doos, 0, y0 + riserH / 2, 0.05, 2.3, riserH, 1.8, hoofd);
      if (st === 'zeshoek' || st === 'rond') B.net.ring(lok(0, y0 + riserH + 0.01, 0.05), 1.36, 0.035, { kl: 0, ring: 0 });
      else if (st !== 'rots') { const hw = st === 'kist' ? 1.15 : 1.17, hz = st === 'kist' ? 0.88 : 0.96;  // ledlijn langs de voorrand
        B.net.lijn([lok(-hw, y0 + riserH + 0.01, hz), lok(hw, y0 + riserH + 0.01, hz)], 0.04, { kl: 0, ring: 0 }, false, 0.6); }
    }
    // tafel
    push(VORM.doos, 0, yv + kast / 2, 0.5, 1.8, kast, 0.6, S.booth === 'plint' ? 0x0c0a0e : 0x101014);
    // tafelblad donker (het sleutellicht hangt er vlak boven: een lichte rand-kleur werd een witte plaat)
    push(VORM.doos, 0, TOP - 0.02, 0.5, 1.86, 0.04, 0.66, _c.set(rand).multiplyScalar(0.28).getHex());
    for (const dx of [-0.52, 0.52]) push(VORM.doos, dx, TOP + 0.025, 0.5, 0.46, 0.05, 0.36, 0x18181c);
    push(VORM.doos, 0, TOP + 0.035, 0.5, 0.3, 0.07, 0.36, 0x1e1e24);
    B.net.staaf(lok(-0.9, TOP - 0.05, 0.81), lok(0.9, TOP - 0.05, 0.81), 0.025, { kl: 1, ring: 0 });
    // platen: draaien op 33 toeren
    const plaatMat = new THREE.MeshBasicMaterial({ map: doek('plaat'), color: P.a.clone() }), platen = [];
    for (const dx of [-0.55, 0.49]) {
      const g = new THREE.Group(), p = lok(dx, TOP + 0.054, 0.5); g.position.copy(p); g.rotation.y = f; B.G.add(g);
      const m = new THREE.Mesh(VORM.schijf, plaatMat); m.scale.setScalar(0.15); m.rotation.x = -Math.PI / 2; g.add(m); platen.push(m);
    }
    // naam op de voorkant
    const bord = ctx.neon(B.naam, css(P.a), 1.6, 0.4);
    if (bord) { bord.position.copy(lok(0, yv + kast * 0.55, 0.815)); bord.rotation.y = f; }
    B.obst.push({ x: j.x, z: j.z, r: riserH > 0 ? 1.25 : 0.9 });
    B.dj = { x: j.x, z: j.z, y: yv, face: f, H: djH, TOP, fig: d, lok };
    B.updates.push((dt, now, b, L) => {
      for (const p of platen) p.rotation.z -= dt * 3.49;
      plaatMat.color.copy(P.a).multiplyScalar(0.6 + 0.6 * b.pulse);
      if (bord) bord.material.color.setScalar((0.55 + 0.6 * b.pulse) * Math.max(0.5, L.k) * (S === SFEER.rauw && hash(Math.floor(now * 9), 3) > 0.94 ? 0.2 : 1));
    });
  }
  function kiesWoord(B) {
    const lijst = B.S.woorden.filter(w => !GEHEUGEN.woord.includes(w));
    const w = kies(B.r, lijst.length ? lijst : B.S.woorden);
    onthoud(GEHEUGEN.woord, w, 6);
    return w;
  }

  // --- onderdelen uit doolhof/onderdelen.js (contract: onderdelen[soort][naam] = { gewicht, past?(stijl), maak(ctx, stijl, plek) }) ---
  function stijlVoor(B) {
    const P = B.P, A = B.A;
    return { palet: { a: P.a.clone(), b: P.b.clone(), c: P.c.clone(), donker: P.donker.clone() }, maat: { w: A.w, d: A.d, h: A.h }, muurTex: B.schild, sfeer: B.sf, energie: B.energie,
      vorm: A.vorm, focus: { x: B.focus.x, y: B.focus.y, z: B.focus.z }, deuren: [{ x: 0, z: -A.d / 2, b: 2, h: 2.6 }, { x: 0, z: A.d / 2, b: 2, h: 2.6 }] };
  }
  function heeftOnderdeel(B, soort) {  // vóór de architectuur: is er een onderdeel van deze soort dat bij de sfeer past?
    const bak = DH.onderdelen && DH.onderdelen[soort];
    if (!bak || typeof bak !== 'object') return false;
    const st = { palet: { a: B.P.a.clone(), b: B.P.b.clone(), c: B.P.c.clone(), donker: B.P.donker.clone() }, maat: { w: 12, d: 14, h: 5 }, muurTex: B.schild, sfeer: B.sf, energie: B.energie };
    return Object.keys(bak).some(n => { const o = bak[n]; if (!o || typeof o.maak !== 'function') return false; try { return typeof o.past !== 'function' || !!o.past(st); } catch (e) { return false; } });
  }
  function plaatsOnderdeel(B, soort, plek) {
    const bak = DH.onderdelen && DH.onderdelen[soort];
    if (!bak || typeof bak !== 'object') return false;
    const st = stijlVoor(B), kand = [];
    for (const naam of Object.keys(bak)) {
      const o = bak[naam]; if (!o || typeof o.maak !== 'function') continue;
      let ok = true; if (typeof o.past === 'function') { try { ok = !!o.past(st); } catch (e) { ok = false; } }
      if (ok) kand.push(naam);
    }
    if (!kand.length) return false;
    const recent = GEHEUGEN.onderdeel[soort] || (GEHEUGEN.onderdeel[soort] = []);
    const naam = kiesGewogen(B.r, kand, n => (bak[n].gewicht == null ? 1 : +bak[n].gewicht || 0) * (recent[0] === n ? 0.15 : recent.includes(n) ? 0.5 : 1));
    try {
      const inst = bak[naam].maak(B.ctx, stijlVoor(B), plek) || {};
      B.onderdelen.push({ soort, naam, inst });
      onthoud(recent, naam, 3);
      return true;
    } catch (e) { console.error('doolhof stijl: onderdeel ' + soort + '/' + naam, e); return false; }
  }
  // eigen middenstuk als onderdelen.js niets heeft: totem (rauw/futuristisch), kristallen (organisch/trippy), paalpodium (luxe)
  function eigenMidden(B, plek) {
    const { r, P, sf, Z } = B, x = plek.x, z = plek.z, plaf = B.A.plafondOp(x, z);
    if (sf === 'luxe') {  // paalpodium met danseres
      const hP = Math.min(plaf, 6);
      B.vast.push([VORM.cil, mat4(x, 0.07, z, 0.95, 0.14, 0.95), 0x0c0a0e], [VORM.cil, mat4(x, hP / 2, z, 0.028, hP, 0.028), 0xb8b8c0]);
      B.net.ring(V(x, 0.15, z), 0.96, 0.04, { kl: 2 });
      const d = B.ctx.figuur({ x, z, rol: 'paal' });
      if (d) { d.yOff = 0.14; if (d.root) d.root.position.y = 0.14; B.figs.push({ d, rol: 'paal', p: { x, z } }); }
      return;
    }
    if (sf === 'organisch' || sf === 'trippy') {  // kristallen: additieve punten met een gloeiende kern
      const delen = [], n = Z === 2 ? 4 : 7;
      for (let i = 0; i < n; i++) {
        const a = i / n * RONDE + r() * 0.4, rr = i ? tussen(r, 0.25, 0.6) : 0, hgt = i ? tussen(r, 0.9, 1.8) : tussen(r, 2.2, 2.8);
        delen.push([VORM.oct, new THREE.Matrix4().compose(_p.set(x + Math.cos(a) * rr, hgt * 0.45, z + Math.sin(a) * rr), _q.setFromEuler(_e.set((r() - 0.5) * 0.5, r() * 3, (r() - 0.5) * 0.5)), _s.set(0.22, hgt * 0.55, 0.22))]);
      }
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
      B.G.add(new THREE.Mesh(samen(delen), mat));
      B.updates.push((dt, now, b, L) => mat.color.copy(P.b).lerp(P.c, 0.3 * b.hoog).multiplyScalar((0.45 + 0.6 * b.pulse) * L.k + L.flits));
      return;
    }
    // totem: paal met ledringen die op de tel omhoog lopen en een draaiende top
    const hT = Math.min(plaf - 0.4, 3.6);
    B.vast.push([VORM.cil, mat4(x, hT / 2, z, 0.08, hT, 0.08), 0x2a2a30], [VORM.cil, mat4(x, 0.1, z, 0.6, 0.2, 0.6), 0x16161a]);
    for (let i = 0; i < 5; i++) B.net.ring(V(x, 0.6 + i * (hT - 1) / 4, z), 0.42 - i * 0.05, 0.05, { kl: i % 2, fase: i / 5, ring: i / 5 });
    const top = new THREE.Mesh(VORM.oct, new THREE.MeshBasicMaterial({ color: 0xffffff })); top.position.set(x, hT + 0.25, z); top.scale.setScalar(0.28); B.G.add(top);
    B.updates.push((dt, now, b, L) => { top.rotation.y += dt * 1.2; top.scale.setScalar(0.28 * (1 + 0.3 * b.pulse)); top.material.color.copy(P.c).multiplyScalar(0.6 + 0.7 * b.pulse * L.k); });
  }
  // eigen showlaag: stroboscopen hoog op de wanden (flitsen in de drop en aan het eind van de opbouw)
  function eigenShow(B) {
    const { A, P } = B, plekken = A.strobo || [];
    if (!plekken.length) return;
    const mesh = new THREE.InstancedMesh(VORM.vlak, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), plekken.length);
    mesh.frustumCulled = false; B.G.add(mesh);
    plekken.forEach((q, i) => { mesh.setMatrixAt(i, mat4(q.x, q.y, q.z, 0.7, 0.32, 1, 0, q.ry, 0)); mesh.setColorAt(i, _c.setRGB(0, 0, 0)); });
    B.updates.push((dt, now, b, L) => {
      plekken.forEach((q, i) => {
        let v = 0.04;
        if (L.strobo >= 0) v = L.strobo && (i % 2 === Math.floor(b.pos * 4) % 2) ? 2 : 0.02;
        else if (L.stand === 'drop' && L.dropKleur) v = hash(i, Math.floor(b.pos * 6)) > 0.6 ? 2 : 0.05;
        mesh.setColorAt(i, _c.copy(P.c).lerp(WIT, 0.6).multiplyScalar(v));
      });
      mesh.instanceColor.needsUpdate = true;
    });
  }

  // --- cameraregie: bewegingen in kamer-coördinaten; de regisseur knipt ze op de maat en op de drop ---
  const CAM = {
    // van de ingang de kamer in: laag achter de loper, dan omhoog en opzij, blik op het middelpunt
    intro: (B, A) => ({ naam: 'intro', min: 5, max: 9.5, maak: r => {
      const zij = r() < 0.5 ? -1 : 1, d2 = A.d / 2, kijk = B.focus.clone();
      const p0 = V(zij * 0.45, 1.85, -d2 + 0.55), p1 = V(zij * 1.5, Math.max(2.4, Math.min(A.plafondOp(zij * 1.5, -d2 + 3.4) - 0.7, 3.8)), -d2 + 3.4);
      return (u, o) => { const k = glad(u / 8.5); o.p.lerpVectors(p0, p1, k); o.l.copy(kijk); o.fov = 66 - 8 * k; };
    } }),
    // rondje om een punt (boven de hoofden), langzaam; boog = [a0, a1] voor een heen-en-weer stuk
    baan: (naam, c, rad, y, kijk, opt = {}) => ({ naam, rustig: true, maak: r => {
      const a0 = opt.boog ? opt.boog[0] : r() * RONDE, dir = r() < 0.5 ? -1 : 1, v = opt.v || 0.1, k = kijk || c;
      return (u, o) => {
        const a = opt.boog ? opt.boog[0] + (opt.boog[1] - opt.boog[0]) * (0.5 - 0.5 * Math.cos(u * v * 2 + (dir > 0 ? 0 : Math.PI))) : a0 + dir * v * u;
        o.p.set(c.x + Math.cos(a) * rad, y + 0.15 * Math.sin(u * 0.45), c.z + Math.sin(a) * rad); o.l.copy(k); o.fov = opt.fov || 60;
      };
    } }),
    // rechte rijder van a naar b (richting willekeurig), blik op een punt
    dolly: (naam, a, b, kijk, opt = {}) => ({ naam, rustig: !!opt.rustig, maak: r => {
      const omk = r() < 0.5, p0 = omk ? b : a, p1 = omk ? a : b, T = opt.T || 12;
      return (u, o) => { o.p.lerpVectors(p0, p1, glad(u / T)); o.l.copy(kijk); if (opt.kijkMee) o.l.add(_w.subVectors(o.p, p0).multiplyScalar(opt.kijkMee)); o.fov = opt.fov || 58; };
    } }),
    // kraan: van hoog naar laag of andersom
    kraan: (naam, p0, p1, kijk, opt = {}) => ({ naam, rustig: true, maak: r => {
      const omk = r() < 0.5, a = omk ? p1 : p0, b = omk ? p0 : p1, T = opt.T || 10;
      return (u, o) => { o.p.lerpVectors(a, b, glad(u / T)); o.l.copy(kijk); o.fov = opt.fov || 62; };
    } }),
    // laag en wijd vanaf een vrije plek, schuift langzaam naar het doel
    laag: (naam, p, kijk, opt = {}) => ({ naam, maak: () => {
      const dir = _w.subVectors(kijk, p).setY(0).normalize().clone();
      return (u, o) => { o.p.copy(p).addScaledVector(dir, 0.5 * glad(u / 9)); o.p.y = opt.y || 0.6; o.l.copy(kijk); o.fov = opt.fov || 72; };
    } }),
    // van boven: hoog boven het middelpunt, draait langzaam rond
    top: (naam, c, rad, y) => ({ naam, rustig: true, maak: r => {
      const a0 = r() * RONDE, dir = r() < 0.5 ? -1 : 1;
      return (u, o) => { const a = a0 + dir * 0.08 * u; o.p.set(c.x + Math.cos(a) * rad, y, c.z + Math.sin(a) * rad); o.l.set(c.x, (c.y || 0) + 0.3, c.z); o.fov = 64; };
    } }),
    // over de schouder van de dj het publiek in, zwaait langzaam
    // (1,3 m achter en 0,6 m naast hem, boven zijn hoofd: de dj staat in een derde van het beeld, niet zijn rug over het hele beeld)
    schouder: B => ({ naam: 'schouder', maak: r => {
      const j = B.dj, zij = r() < 0.5 ? -1 : 1, ph = r() * RONDE, laag = j.y > 1.5 ? 0.6 : 1.1, A = B.A;
      const plek = (th, R) => j.lok(Math.sin(th) * R + Math.cos(th) * zij * 0.6, 0, -Math.cos(th) * R + Math.sin(th) * zij * 0.6);
      const R = [1.3, 1.15, 1.0, 0.85].find(R => !A || !A.binnenVoet || [-0.45, 0, 0.45].every(th => { const p = plek(th, R); return A.binnenVoet(p.x, p.z, 0.4); })) || 0.85;  // dj tegen de wand: minder ver terug
      return (u, o) => {
        const th = 0.45 * Math.sin(u * 0.2 + ph), c = Math.cos(th), s = Math.sin(th);
        o.p.copy(j.lok(s * R + c * zij * 0.6, j.y + j.H + 0.35 + 0.05 * Math.sin(u * 0.8), -c * R + s * zij * 0.6));
        o.l.copy(j.lok(-s * 6 - zij * 0.5 + 0.03 * Math.sin(u * 1.7), laag + 0.02 * Math.sin(u * 2.3), 6)); o.fov = 62;
      };
    } }),
    // de loper die staat te dansen: van voren (langs zijn route verder), langzaam dichterbij
    loper: B => ({ naam: 'loper', maak: () => (u, o, info) => {
      const v = B.opRoute(B.wachtS + 2.9 - 0.7 * glad(u / 8)), lp = info.lp;
      o.p.set(v.x, 1.55, v.z); o.l.set(lp.x, 1.2, lp.z); o.fov = 52;
    } }),
  };
  function regisseur(B, A, lijst, held) {
    const { S, G, r } = B;
    const uit = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 60 };
    const o = { p: new THREE.Vector3(), l: new THREE.Vector3(), fov: 60 }, lp = new THREE.Vector3(), vlp = new THREE.Vector3(), info = { lp };
    const vp = new THREE.Vector3(), vl = new THREE.Vector3();
    const intro = CAM.intro(B, A), loperShot = CAM.loper(B);
    let fase = 'in', stil = 0, shot = null, vorigT = null, vorigeMaat = null, vorigeStand = null, vorigeTel = null, wegT = 0, wilKnip = false;
    let stapel = [], loperGehad = false, volgKlaar = false, heeftLoper = false;
    const kies = (t, def) => { shot = { def, f: def.maak(r), t0: t }; wilKnip = false; };
    function volgende(t, st) {
      if (fase === 'dans' && !loperGehad && heeftLoper) { loperGehad = true; return kies(t, loperShot); }
      if (!stapel.length) stapel = schud(r, lijst.slice());
      let i = stapel.findIndex(k => k !== shot.def && (st !== 'break' || k.rustig));
      if (i < 0) i = stapel.findIndex(k => k !== shot.def);
      kies(t, stapel.splice(Math.max(0, i), 1)[0]);
    }
    function binnen(v) {  // camera binnen de kamer houden
      for (let k = 0; k < 14 && !A.binnenVoet(v.x, v.z, 0.35); k++) { v.x *= 0.92; v.z *= 0.92; }
      v.y = klem(v.y, (A.vloerOp ? A.vloerOp(v.x, v.z) : 0) + 0.3, A.plafondOp(v.x, v.z) - 0.3);
      if (A.klem) A.klem(v);
    }
    return (t, loper) => {
      G.updateWorldMatrix(true, false);
      const dt = vorigT == null ? 0 : klem(t - vorigT, 0, 0.1); vorigT = t;
      // waar is de loper: stilstaan = dansen op de wachtplek, daarna weer lopen = op weg naar de uitgang
      const o3 = loper && (loper.root || loper);
      if (o3 && o3.getWorldPosition) { o3.getWorldPosition(lp); G.worldToLocal(lp); heeftLoper = true; }
      const v = dt > 0 ? lp.distanceTo(vlp) / dt : 1; vlp.copy(lp);
      if (fase === 'in') { stil = v < 0.25 ? stil + dt : 0; if (stil > 0.6 && heeftLoper) fase = 'dans'; }
      else if (fase === 'dans' && v > 0.5) { fase = 'weg'; wegT = t; }  // loopt weer: op de volgende tel naar de volgshot
      const b = B.ctx.beat(), st = regie().stand || 'groove', tel = Math.floor(b.pos), opTel = vorigeTel != null && tel !== vorigeTel;
      vorigeTel = tel;
      if (fase === 'weg' && (opTel || t - wegT > 0.8)) fase = 'uit';
      if (fase === 'uit') {  // achter de loper aan naar de uitgang (de kern neemt het 3 m voor de deur over)
        const sL = B.routeS(lp.x, lp.z), pa = B.opRoute(sL - 2.4), pv = B.opRoute(sL + 1.4);  // op zijn eigen pad, zoals de kern
        vp.set(pa.x, 1.75, pa.z); vl.set(pv.x, 1.3, pv.z); binnen(vp);
        if (!volgKlaar) { volgKlaar = true; o.p.copy(vp); o.l.copy(vl); }
        const k = 1 - Math.exp(-3.5 * dt); o.p.lerp(vp, k); o.l.lerp(vl, k); o.fov += (58 - o.fov) * k;
      } else {
        if (!shot) kies(t, intro);
        const leeftijd = t - shot.t0, maat = Math.floor(b.pos / S.maten), rust = st === 'break' ? 1.6 : 1;
        // knippen: op de eerste tel van een frase (8 of 16 tellen) na de minimale duur; moet het eerder (te lang, de loper
        // begint te dansen), dan op de eerstvolgende tel; de drop knipt meteen naar het heldenshot
        if (leeftijd > (shot.def.max || 13) * rust) wilKnip = true;
        if (fase === 'dans' && !loperGehad && heeftLoper && shot.def === intro && leeftijd > 2.5) wilKnip = true;
        const knip = (wilKnip && (opTel || leeftijd > 16)) || (vorigeMaat != null && maat !== vorigeMaat && leeftijd > (shot.def.min || S.minShot) * rust);
        if (st === 'drop' && vorigeStand && vorigeStand !== 'drop' && leeftijd > 0.8 && held) kies(t, held);
        else if (knip) volgende(t, st);
        vorigeMaat = maat; vorigeStand = st;
        info.b = b;
        shot.f(t - shot.t0, o, info);
        // handcamera en een zachte zoompomp op de kick (sterker in rauw)
        const sk = S.schok * 0.035;
        o.p.x += sk * (Math.sin(t * 1.3) + 0.5 * Math.sin(t * 3.1 + 1)); o.p.y += sk * Math.sin(t * 1.7 + 2) + (st === 'drop' ? S.schok * 0.025 * b.pulse : 0);
        o.fov -= 1.6 * S.schok * b.pulse;
        binnen(o.p);
      }
      uit.pos.copy(o.p); G.localToWorld(uit.pos);
      uit.look.copy(o.l); G.localToWorld(uit.look);
      uit.fov = o.fov;
      uit.shot = fase === 'uit' ? 'volg' : shot ? shot.def.naam : '-';  // voor de testronde
      return uit;
    };
  }

  // --- architecturen: elk sjabloon bouwt de ruimte en geeft de indeling terug ---
  // A = { vorm, w, d, h, route, dj, focus?, midden[], plafondH, muurH, vloerOK, zones3d, massa, lounge, extra3d, bundels, strobo, bord,
  //       binnenVoet(x,z,m), plafondOp(x,z), vloerOp?, klem?, cams(B) -> { lijst, held }, update? }
  const ARCH = {};
  // wanden met schildering (onder) en structuur (boven), vloer en vlak plafond
  function schil(B, omtrek, d, hWand, opt = {}) {
    const { M, G } = B, info = SCHILD[B.schild], hm = Math.min(hWand, opt.hm || 5.2), P = omtrekLengte(omtrek);
    let tw = 0, uvM;
    if (info.tegel) uvM = (s, y) => [s / info.tegel, y / info.tegel];
    else {
      let n = Math.max(1, Math.round(P / (hm * ASPECT)));
      if (info.spiegel && n % 2) n += 1;  // even aantal: de rij sluit naadloos rond
      tw = P / n;
      uvM = (s, y, kt) => { const f = (s - kt * tw) / tw; return [info.spiegel && kt % 2 ? 1 - f : f, y / hm]; };
    }
    const vv = { vervorm: opt.vervorm, stapS: opt.stapS, stapY: opt.stapY };
    G.add(new THREE.Mesh(wandGeo(omtrek, d, 0, hm, Object.assign({ tegel: tw, uv: uvM }, vv)), M.muur));
    if (hWand > hm + 0.01) G.add(new THREE.Mesh(wandGeo(omtrek, d, hm, hWand, Object.assign({ uv: (s, y) => [s / M.basisTegel, y / M.basisTegel] }, vv)), M.basis));
    if (!opt.geenVloer) G.add(new THREE.Mesh(vlakGeo(omtrek, 0, M.vloerTegel, opt.gaten), M.vloer));
    if (opt.plafond !== false) G.add(new THREE.Mesh(vlakGeo(omtrek, hWand, 4), M.plafond));
    // plint en (als de wand hoger is) een lichtlijn op de rand van de schildering; deuren blijven vrij
    const lijnLangs = (y, dik, o) => {
      for (let i = 0; i < omtrek.length; i++) {
        const [ax, az] = omtrek[i], [bx, bz] = omtrek[(i + 1) % omtrek.length], ins = 0.06;
        const a = V(ax, y, az), b = V(bx, y, bz), naar = V(-(ax + bx) / 2, 0, -(az + bz) / 2).normalize().multiplyScalar(ins);
        a.add(naar); b.add(naar);
        const deur = y < 2.65 && Math.abs(az - bz) < 1e-3 && Math.abs(Math.abs(az) - d / 2) < 1e-3 && Math.min(ax, bx) <= -1 && Math.max(ax, bx) >= 1;
        if (deur) { const s = ax < bx ? 1 : -1; B.net.lijn([a, V(-1.1 * s, y, a.z)], dik, o, false); B.net.lijn([V(1.1 * s, y, a.z), b], dik, o, false); }
        else B.net.lijn([a, b], dik, o, false);
      }
    };
    if (!opt.geenPlint) lijnLangs(0.05, 0.035, { kl: 0 });
    if (hWand > hm + 0.3) lijnLangs(hm, 0.04, { kl: 1 });
    return { hm, lijnLangs };
  }
  const rechtBinnen = (w, d) => (x, z, m) => Math.abs(x) <= w / 2 - m && Math.abs(z) <= d / 2 - m;
  const deurLijsten = (B, d) => { for (const s of [-1, 1]) { const z = s * (d / 2 - 0.035); B.net.lijn([V(-1.04, 0.02, z), V(-1.04, 2.64, z), V(1.04, 2.64, z), V(1.04, 0.02, z)], 0.045, { kl: 2, groep: 0 }, false, 0.9); } };
  const stroboHoeken = (w, d, y) => [[-w / 2 + 0.05, y, -d / 4, Math.PI / 2], [w / 2 - 0.05, y, d / 4, -Math.PI / 2], [-w / 2 + 0.05, y, d / 4, Math.PI / 2], [w / 2 - 0.05, y, -d / 4, -Math.PI / 2]].map(([x, yy, z, ry]) => ({ x, y: yy, z, ry }));
  const plafondBalken = (B, w, d, y) => { for (let z = -d / 2 + 2; z <= d / 2 - 1.9; z += 2.6) B.net.lijn([V(-w / 2 + 1.2, y, z), V(w / 2 - 1.2, y, z)], 0.07, { kl: Math.round(z) % 2 ? 1 : 0 }, false, 1.4); };

  // 1. Rechte hal: pilasters die de schildering in panelen delen, dj aan de zijwand (of op een eiland), publiek in rijen
  ARCH.hal = { gewicht: 4.5, middenKans: 0.3, maak(B) {
    const r = B.r, w = rond(tussen(r, 11, 14), 0.5), d = rond(tussen(r, 15, 20), 0.5), h = rond(tussen(r, 4.6, 5.8), 0.1);
    const s = r() < 0.5 ? -1 : 1, eiland = B.middenDj || r() < 0.2;  // eiland: de dj in het midden (eigen tafel of een middenstuk)
    B.d2 = d / 2;
    const { hm } = schil(B, rechthoek(w, d), d, h);
    const nP = Math.max(3, Math.round(d / 3.4)), stap = d / nP;
    for (const sx of [-1, 1]) for (let i = 1; i < nP; i++) {  // pilasters met een ledstrip
      const z = -d / 2 + i * stap;
      B.vast.push([VORM.doos, mat4(sx * (w / 2 - 0.17), h / 2, z, 0.34, h, 0.5), B.S.struct[0]]);
      B.net.staaf(V(sx * (w / 2 - 0.36), 0.4, z), V(sx * (w / 2 - 0.36), hm - 0.3, z), 0.05, { groep: i, kl: i % 2 });
      B.obst.push({ x: sx * (w / 2 - 0.17), z, r: 0.3 });
    }
    deurLijsten(B, d);
    const A = { vorm: 'recht', w, d, h, plafondH: h, muurH: null, vloerOK: true, binnenVoet: rechtBinnen(w, d), plafondOp: () => h, strobo: stroboHoeken(w, d, h - 0.5) };
    if (!eiland) {
      const djz = rond(tussen(r, -1.5, 1.5), 0.1), rx = -s * (w / 2 - 3.1);
      A.dj = { x: s * (w / 2 - 1.9), z: djz, face: -s * Math.PI / 2 };
      A.route = [[0, -d / 2], [rx * 0.5, -d / 2 + 2.6], [rx, -1.6], [rx, 1.6], [rx * 0.5, d / 2 - 2.6], [0, d / 2]];
      A.zones3d = [{ soort: 'rijen', c: A.dj, u: [-s, 0], d0: 2.1, d1: w - 5.4, breed: d / 2 - 2.8 }];
      A.massa = [{ soort: 'rijen', c: A.dj, u: [-s, 0], d0: 2.1, d1: w - 4.6, breed: d / 2 - 2.2 }, { soort: 'strook', a: { x: -s * (w / 2 - 0.9), z: -d / 2 + 2.6 }, b: { x: -s * (w / 2 - 0.9), z: d / 2 - 2.6 }, kijk: A.dj }];
      const msz = r() < 0.5 ? -1 : 1;
      A.midden = w >= 12.5 ? [{ x: -s * (w / 2 - 1.7), z: msz * (d / 2 - 3.8), r: 0.9 }] : [];
      A.lounge = [-1, 1].filter(sz => !A.midden.length || sz !== msz).map(sz => ({ x: -s * (w / 2 - 0.55), z: sz * d / 4, face: s * Math.PI / 2, len: 3 }));
      A.opstellingen = { rijen: 1, kring: 0.7, verspreid: 0.6, lounge: 0.7 };
      A.camPlek = { x: s * (w / 2 - 1.3), z: djz + (djz > 0 ? -1 : 1) * 3.4 };
      A.bord = { x: s * (w / 2 - 0.38), y: Math.min(h - 0.6, hm + 0.4), z: djz, ry: -s * Math.PI / 2, b: 3.6 };  // voor de pilasters langs
      A.bundels = [-1, 1].flatMap(sz => [0.15, 0.5].map(f => ({ p: V(s * (w / 2 - 1.5 - f * (w - 4)), h - 0.25, sz * d / 4), doel: V(s * (w / 2 - 3.5), 0, sz * 1.5), zwaai: 1.8 })));
      A.poelen = [{ x: A.dj.x - s * 1.4, z: djz, r: 2.4, kl: 0 }];
    } else {
      A.dj = { x: 0, z: 0, face: Math.PI }; A.djMidden = { x: 0, z: 0, r: 1.8 };
      A.route = [[0, -d / 2], [s * 2.4, -d / 2 + 3], [s * 3.6, -1.2], [s * 3.6, 1.2], [s * 2.4, d / 2 - 3], [0, d / 2]];
      A.zones3d = [{ soort: 'ring', c: A.dj, r0: 2.2, r1: 3.2 }];
      A.massa = [{ soort: 'ring', c: A.dj, r0: 3.3, r1: Math.min(w, d) / 2 - 0.8 }];
      A.opstellingen = { kring: 1, verspreid: 0.6 }; A.midden = [];
      A.camPlek = { x: -s * (w / 2 - 1.4), z: -d / 2 + 3.4 };
      A.bord = { x: -s * (w / 2 - 0.38), y: Math.min(h - 0.6, hm + 0.4), z: 0, ry: s * Math.PI / 2, b: 3.6 };
      A.bundels = [0, 1, 2, 3, 4, 5].map(i => { const a = i / 6 * RONDE; return { p: V(Math.cos(a) * 3.2, h - 0.25, Math.sin(a) * 3.2), doel: V(Math.cos(a) * 1.2, 0, Math.sin(a) * 1.2), zwaai: 1.2 }; });
      A.poelen = [{ x: 0, z: 0, r: 3, kl: 0 }];
    }
    A.route = A.route.map(([x, z]) => ({ x, z }));
    A.cams = B2 => {
      const dj = V(B2.dj.x, B2.dj.y + 1.2, B2.dj.z), lijst = [
        CAM.schouder(B2),
        CAM.dolly('zijkant', V(-s * (w / 2 - 0.6), 2.7, -d / 2 + 3), V(-s * (w / 2 - 0.6), 3.0, d / 2 - 3), dj, { kijkMee: 0.25 }),
        CAM.kraan('kraan', V(0, Math.min(h - 0.5, 4.4), -d / 2 + 2.6), V(-s * 1.2, 2.7, -1), dj),
        CAM.laag('laag', V(A.camPlek.x, 0.6, A.camPlek.z), dj),
        CAM.top('top', V(eiland ? 0 : s * 1.5, 0, 0), 2.6, h - 0.45),
      ];
      return { lijst, held: lijst[eiland ? 4 : 0] };
    };
    if (B.plafondEigen) plafondBalken(B, w, d, h - 0.35);
    return A;
  } };

  // 2. Ronde arena: twintighoek met koepel, dj in het midden onder een lichtring met bundels, publiek in kringen
  ARCH.arena = { gewicht: 4.5, middenKans: 0.6, maak(B) {
    const r = B.r, N = 20, R = rond(tussen(r, 7.5, 9), 0.5), Rv = R / Math.cos(Math.PI / N), hw = rond(tussen(r, 4.4, 5.4), 0.1), hTop = hw + tussen(r, 1.6, 3.0);
    const s = r() < 0.5 ? -1 : 1, d = 2 * R;
    B.d2 = R;
    const omtrek = veelhoek(N, Rv);  // vlakken midden op 0, 18, ... graden: de deurvlakken liggen op z = ±R
    const { hm } = schil(B, omtrek, d, hw, { plafond: false });
    // koepel (in trippy en op hoog: de kaleidoscoop), meridianen met ledlijnen naar de top
    const trip = B.sf === 'trippy' && B.Z === 0;
    let koepelMat = B.M.plafond;
    const kg = koepelGeo(omtrek, hw, hTop, 6, trip ? 2 * Rv : 4);
    if (trip) { koepelMat = B.ctx.trip(); koepelMat.side = THREE.DoubleSide; const uv = kg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + 0.5, uv.getY(i) + 0.5); }
    B.G.add(new THREE.Mesh(kg, koepelMat));
    for (let i = 0; i < N; i += 2) {
      const [x, z] = omtrek[i], pts = [];
      for (let k = 0; k <= 5; k++) { const f = 1 - k / 6 * 0.92; pts.push(V(x * f * 0.985, koepelY(f, hw, hTop) - 0.05, z * f * 0.985)); }
      B.net.lijn(pts, 0.05, { kl: (i / 2) % 2, groep: i / 2 }, false, 1.4);
    }
    for (let i = 0; i < N; i++) { const [x, z] = omtrek[i]; if (Math.abs(x) < 2 && Math.abs(z) > R - 1.5) continue; B.net.staaf(V(x * 0.985, 0.4, z * 0.985), V(x * 0.985, hm - 0.3, z * 0.985), 0.045, { kl: 1, groep: i }); }  // ribben, niet naast de deuren
    deurLijsten(B, d);
    // lichtring boven de dj en podium
    const yR = hw - 0.3, rR = 3.6;
    B.net.lijn(veelhoek(16, rR).map(([x, z]) => V(x, yR, z)), 0.09, { kl: 0 }, true, 2);
    if (!B.middenDj) B.vast.push([VORM.cil, mat4(0, 0.225, 0, 1.75, 0.45, 1.75), B.S.struct[0]]);
    const yD = koepelY(rR / Rv, hw, hTop);  // kabels van de ring naar de koepel
    for (let i = 0; i < 4; i++) { const a = i / 4 * RONDE + Math.PI / 4; B.vast.push([VORM.cil, mat4(Math.cos(a) * rR, (yR + yD) / 2, Math.sin(a) * rR, 0.015, yD - yR, 0.015), 0x111114]); }
    if (!B.middenDj) B.net.ring(V(0, 0.46, 0), 1.76, 0.04, { kl: 2, ring: 0 });
    const A = { vorm: 'rond', w: 2 * Rv, d, h: hTop, plafondH: null, muurH: null, vloerOK: false,
      binnenVoet: (x, z, m) => Math.hypot(x, z) <= R - m, plafondOp: (x, z) => koepelY(Math.hypot(x, z) / Rv, hw, hTop) };
    A.dj = B.middenDj ? { x: 0, z: 0, face: Math.PI } : { x: 0, z: 0, face: Math.PI, y: 0.45, riser: false };
    A.djMidden = { x: 0, z: 0, r: 2.0 };
    A.focus = V(0, 1.6, 0);
    A.route = [[0, -R], [s * 2.3, -R + 3.2], [s * 4.3, -1.5], [s * 4.3, 1.5], [s * 2.3, R - 3.2], [0, R]].map(([x, z]) => ({ x, z }));
    A.zones3d = [{ soort: 'ring', c: { x: 0, z: 0 }, r0: 2.4, r1: 3.4 }];
    A.massa = [{ soort: 'ring', c: { x: 0, z: 0 }, r0: 3.4, r1: R - 1.0 }];
    A.opstellingen = { kring: 1, verspreid: 0.5 }; A.midden = [];
    const lw = -s * (R - 1.4);
    A.camPlek = { x: lw * Math.cos(0.5), z: (R - 1.4) * Math.sin(0.5) };
    A.bord = null;
    A.bundels = [0, 1, 2, 3, 4, 5, 6, 7].map(i => { const a = i / 8 * RONDE; return { p: V(Math.cos(a) * rR, yR - 0.1, Math.sin(a) * rR), doel: V(Math.cos(a) * 5.4, 0, Math.sin(a) * 5.4), zwaai: 1.6, kl: i % 2 }; });
    A.poelen = [{ x: 0, z: 0, r: 3.2, kl: 0 }, { x: 0, z: 0, r: 6.5, kl: 1, bas: true }];
    A.strobo = [0.25, 0.75].flatMap(f => [-1, 1].map(sx => ({ x: sx * Math.cos(f) * (R - 0.08), y: hw - 0.6, z: Math.sin(f) * (R - 0.08), ry: -sx * Math.PI / 2 })));
    A.cams = B2 => {
      const dj = V(0, 1.7, 0), lijst = [
        CAM.baan('baan', { x: 0, z: 0 }, R - 1.1, 3.0, dj, { v: 0.09 }),
        CAM.top('top', V(0, 0.3, 0), 2.6, hTop - 0.8),
        CAM.schouder(B2),
        CAM.laag('laag', V(A.camPlek.x, 0.6, A.camPlek.z), V(0, 2.4, 0), { fov: 74 }),
        CAM.kraan('kraan', V(-s * 4.8, 4.2, 4.6), V(-s * 3.2, 2.7, 3.0), dj),
      ];
      return { lijst, held: lijst[3] };
    };
    A.update = (dt, now, b, L) => { if (trip) koepelMat.uniforms.bass.value = (b.pulse * 0.6 + b.energy * 0.3) * L.k; };
    return A;
  } };

  // 3. Lange hal met galerij: balkon langs één wand met een ledleuning; dj op het balkon (of op de vloer), lounge eronder
  ARCH.galerij = { gewicht: 4, maak(B) {
    const r = B.r, w = rond(tussen(r, 12.5, 15), 0.5), d = rond(tussen(r, 19, 24), 0.5), h = rond(tussen(r, 7, 8.4), 0.1), hb = rond(tussen(r, 3.0, 3.4), 0.1), bd = 2.4;
    const s = r() < 0.5 ? -1 : 1, opBalkon = r() < 0.6;
    B.d2 = d / 2;
    const { hm } = schil(B, rechthoek(w, d), d, h, { hm: 5 });
    const xr = s * (w / 2 - bd);  // rand van het balkon
    const st = B.S.struct;
    B.vast.push([VORM.doos, mat4(s * (w / 2 - bd / 2), hb - 0.15, 0, bd, 0.3, d - 0.02), st[0]]);
    const nK = Math.max(3, Math.round(d / 4.2));
    for (let i = 0; i <= nK; i++) {  // kolommen onder de rand en spijlen van de leuning
      const z = -d / 2 + 1.2 + i * (d - 2.4) / nK;
      B.vast.push([VORM.cil, mat4(xr + s * 0.25, (hb - 0.3) / 2, z, 0.16, hb - 0.3, 0.16), st[0]]);
      B.obst.push({ x: xr + s * 0.25, z, r: 0.2 });
    }
    for (let z = -d / 2 + 0.4; z <= d / 2 - 0.3; z += 0.9) B.vast.push([VORM.doos, mat4(xr + s * 0.05, hb + 0.52, z, 0.04, 1.04, 0.04), st[1]]);
    B.vast.push([VORM.doos, mat4(xr + s * 0.05, hb + 1.06, 0, 0.08, 0.06, d - 0.6), st[1]]);
    B.net.lijn([V(xr + s * 0.05, hb + 1.1, -d / 2 + 0.3), V(xr + s * 0.05, hb + 1.1, d / 2 - 0.3)], 0.05, { kl: 0 }, false, 1.3);      // ledleuning
    B.net.lijn([V(xr + s * 0.02, hb - 0.32, -d / 2 + 0.3), V(xr + s * 0.02, hb - 0.32, d / 2 - 0.3)], 0.04, { kl: 1 }, false, 1.3);    // onderrand
    deurLijsten(B, d);
    const A = { vorm: 'galerij', w, d, h, plafondH: h, muurH: null, vloerOK: true, binnenVoet: rechtBinnen(w, d), plafondOp: () => h,
      klem: v => { if (s * v.x > s * xr - 0.3 && v.y > hb - 0.6 && v.y < hb + 0.3) v.y = v.y < hb - 0.15 ? hb - 0.6 : hb + 0.3; },
      strobo: stroboHoeken(w, d, h - 0.6) };
    const rx = -s * (w / 2 - 3.0);
    A.route = [[0, -d / 2], [rx * 0.5, -d / 2 + 2.8], [rx, -1.8], [rx, 1.8], [rx * 0.5, d / 2 - 2.8], [0, d / 2]].map(([x, z]) => ({ x, z }));
    const nB = [3, 2, 1][B.Z];
    if (opBalkon) {
      A.dj = { x: s * (w / 2 - 1.25), z: 0, face: -s * Math.PI / 2, y: hb };
      A.zones3d = [{ soort: 'rijen', c: { x: xr, z: 0 }, u: [-s, 0], d0: 1.0, d1: w - bd - 4.6, breed: d / 2 - 3, kijk: { x: A.dj.x, z: 0 } }];
      A.extra3d = Array.from({ length: nB }, (_, i) => ({ x: s * (w / 2 - 1.0), z: (i % 2 ? 1 : -1) * (2.8 + Math.floor(i / 2) * 2.4), y: hb, face: -s * Math.PI / 2, rol: i % 2 ? 'juich' : 'dans' }));
    } else {
      A.dj = { x: -s * (w / 2 - 1.9), z: rond(tussen(r, -2, 2), 0.1), face: s * Math.PI / 2 };
      A.route = [[0, -d / 2], [s * 1.6, -d / 2 + 2.8], [s * (w / 2 - bd - 0.9), -1.8], [s * (w / 2 - bd - 0.9), 1.8], [s * 1.6, d / 2 - 2.8], [0, d / 2]].map(([x, z]) => ({ x, z }));
      A.zones3d = [{ soort: 'rijen', c: A.dj, u: [s, 0], d0: 2.1, d1: w - bd - 5.6, breed: d / 2 - 3 }];
      A.extra3d = Array.from({ length: nB }, (_, i) => ({ x: s * (w / 2 - 1.0), z: A.dj.z + (i % 2 ? 1 : -1) * (1.2 + Math.floor(i / 2) * 2.2), y: hb, face: -s * Math.PI / 2, rol: 'juich' }));
    }
    A.massa = [{ soort: 'strook', a: { x: s * (w / 2 - 0.9), z: -d / 2 + 1.5 }, b: { x: s * (w / 2 - 0.9), z: d / 2 - 1.5 }, kijk: { x: 0, z: 0 }, y: hb },
      { soort: 'vlak', x0: -w / 2 + 1, x1: w / 2 - bd - 0.6, z0: -d / 2 + 2.6, z1: d / 2 - 2.6, kijk: A.dj }];
    A.lounge = [-1, 1].map(sz => ({ x: s * (w / 2 - 0.5), z: sz * d / 4, face: -s * Math.PI / 2, len: 3 }));
    A.opstellingen = { rijen: 1, kring: 0.6, lounge: 1.2, verspreid: 0.5 };
    const msz = r() < 0.5 ? -1 : 1;  // middenstuk en lage camera aan verschillende kanten
    A.midden = opBalkon ? [{ x: -s * (w / 2 - 1.7), z: msz * (d / 2 - 4), r: 0.9 }] : [];
    A.camPlek = { x: -s * (w / 2 - 1.2), z: -msz * (d / 2 - 3.2) };
    A.bord = { x: -s * (w / 2 - 0.06), y: hm + 0.9, z: 0, ry: s * Math.PI / 2, b: 4.4 };
    A.bundels = [-0.3, 0, 0.3].flatMap(f => [{ p: V(-s * 1.0, h - 0.25, f * d), doel: V(xr - s * 2.5, 0, f * d * 0.6), zwaai: 1.6 }, { p: V(xr - s * 0.2, hb - 0.4, f * d + 1.5), doel: V(-s * 1.5, 0, f * d), zwaai: 1.2, kl: 1 }]);
    A.poelen = [{ x: (A.dj.x + xr) / 2 - s * 1.5, z: 0, r: 3.2, kl: 0 }];
    A.cams = B2 => {
      const dj = V(B2.dj.x, B2.dj.y + 1.2, B2.dj.z), vloer = V(xr - s * 3, 1.0, 0), lijst = [
        CAM.dolly('balkon', V(s * (w / 2 - 0.6), hb + 1.75, -d / 2 + 2), V(s * (w / 2 - 0.6), hb + 1.75, d / 2 - 2), opBalkon ? vloer : dj, { kijkMee: 0.3 }),
        CAM.dolly('onder', V(s * (w / 2 - 1.7), 1.45, -d / 2 + 2.5), V(s * (w / 2 - 1.7), 1.45, d / 2 - 2.5), opBalkon ? V(-s * 2, 1.4, 0) : dj, { kijkMee: 0.5 }),
        CAM.kraan('kraan', V(-s * 1.2, h - 0.8, -d / 4), V(-s * 0.6, 3.0, -1.5), dj),
        CAM.schouder(B2),
        CAM.laag('laag', V(A.camPlek.x, 0.6, A.camPlek.z), opBalkon ? V(xr, hb + 1.2, 0) : dj),
      ];
      return { lijst, held: lijst[3] };
    };
    if (B.plafondEigen) plafondBalken(B, w - bd * 2, d, h - 0.4);
    return A;
  } };

  // 4. Tempel: schip met twee zuilenrijen, trapaltaar met de dj, zonneschijf erachter en lichtschachten door het dak
  ARCH.tempel = { gewicht: 4, middenKans: 0.4, maak(B) {
    const r = B.r, w = rond(tussen(r, 13, 16), 0.5), d = rond(tussen(r, 19, 24), 0.5), h = rond(tussen(r, 7, 9), 0.1), cx = w / 2 - 2.4, za = rond(tussen(r, -0.5, 1.5), 0.1);
    const s = r() < 0.5 ? -1 : 1, rc = tussen(r, 0.36, 0.46), st = B.S.struct;
    B.d2 = d / 2;
    const { hm } = schil(B, rechthoek(w, d), d, h, { hm: 5.4 });
    const nZ = Math.max(3, Math.round((d - 6) / 3.6)), zs = [];
    for (let i = 0; i <= nZ; i++) zs.push(-d / 2 + 3 + i * (d - 6) / nZ);
    for (const sx of [-1, 1]) for (const z of zs) {  // zuilen: voet, schacht, kapiteel; ledbanden
      const x = sx * cx;
      B.vast.push([VORM.doos, mat4(x, 0.15, z, rc * 2.6, 0.3, rc * 2.6), st[0]], [VORM.cil, mat4(x, h / 2, z, rc, h, rc), st[0]], [VORM.doos, mat4(x, h - 0.5, z, rc * 2.8, 0.4, rc * 2.8), st[1]]);
      B.net.ring(V(x, 0.45, z), rc + 0.02, 0.06, { kl: 0 });
      B.net.ring(V(x, h - 0.85, z), rc + 0.02, 0.06, { kl: 1 });
      B.obst.push({ x, z, r: rc + 0.3 });
    }
    B.vast.push([VORM.doos, mat4(-cx, h - 0.15, 0, 0.9, 0.3, d), st[1]], [VORM.doos, mat4(cx, h - 0.15, 0, 0.9, 0.3, d), st[1]]);  // architraaf
    // trapaltaar (tenzij een middenstuk van onderdelen.js de plek van de dj krijgt)
    if (!B.middenDj) {
      for (const [hs, y] of [[2.1, 0.32], [1.6, 0.64], [1.1, 0.96]]) {
        B.vast.push([VORM.doos, mat4(0, y - 0.16, za, hs * 2, 0.32, hs * 2), st[0]]);
        B.net.lijn([V(-hs, y + 0.01, za - hs), V(hs, y + 0.01, za - hs), V(hs, y + 0.01, za + hs), V(-hs, y + 0.01, za + hs)], 0.035, { kl: 2, ring: 0 }, true, 1.2);
      }
      B.obst.push({ x: 0, z: za, r: 2.3 });
    }
    // zonneschijf achter de dj (in trippy op hoog: de kaleidoscoop erin)
    const zr = tussen(r, 1.8, 2.4), zy = 1.0 + zr + 0.9, zz = za + 2.6;
    const zon = new THREE.Mesh(new THREE.TorusGeometry(zr, 0.07, 6, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    zon.position.set(0, zy, zz); B.G.add(zon);
    let binnenMat;
    if (B.sf === 'trippy' && B.Z === 0) { binnenMat = B.ctx.trip(); binnenMat.side = THREE.DoubleSide; }
    else binnenMat = new THREE.MeshBasicMaterial({ map: doek('gloed'), color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const schijf = new THREE.Mesh(VORM.schijf, binnenMat); schijf.position.set(0, zy, zz + 0.02); schijf.scale.setScalar(zr * 0.96); schijf.rotation.y = Math.PI; B.G.add(schijf);
    B.vast.push([VORM.cil, mat4(0, (zy - zr) / 2, zz, 0.06, zy - zr, 0.06), st[1]]);
    // oculus boven het altaar
    const oc = new THREE.Mesh(VORM.schijf, new THREE.MeshBasicMaterial({ map: doek('gloed'), color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    oc.position.set(0, h - 0.02, za); oc.rotation.x = Math.PI / 2; oc.scale.setScalar(1.6); B.G.add(oc);
    deurLijsten(B, d);
    const A = { vorm: 'tempel', w, d, h, plafondH: null, muurH: h, vloerOK: true, binnenVoet: rechtBinnen(w, d), plafondOp: () => h, strobo: stroboHoeken(w, d, hm + 0.4) };
    A.dj = B.middenDj ? { x: 0, z: za, face: Math.PI } : { x: 0, z: za, face: Math.PI, y: 0.96, riser: false };
    A.djMidden = { x: 0, z: za, r: 2.1 };
    A.focus = V(0, 2.2, za);
    A.route = [[0, -d / 2], [s * 2.3, za - 3.4], [s * 2.95, za], [s * 2.3, za + 3.4], [0, d / 2]].map(([x, z]) => ({ x, z }));
    A.zones3d = [{ soort: 'rijen', c: { x: 0, z: za }, u: [0, -1], d0: 3.0, d1: za + d / 2 - 2.6, breed: cx - 0.9, klem: { x0: -cx + 0.7, x1: cx - 0.7, z0: -d / 2, z1: za - 2.2 } }];
    const laan = -s * (cx + 1.2);  // camerabaan achter de zuilen aan de kant van -s: daar geen publiek
    A.massa = [{ soort: 'vlak', x0: s > 0 ? cx + 0.7 : -w / 2 + 0.8, x1: s > 0 ? w / 2 - 0.8 : -cx - 0.7, z0: -d / 2 + 2.5, z1: d / 2 - 2.5, kijk: { x: 0, z: za } },
      { soort: 'rijen', c: { x: 0, z: za }, u: [0, -1], d0: 3.0, d1: za + d / 2 - 2.4, breed: cx - 0.6 }];
    A.opstellingen = { rijen: 1, kring: 0.7 };
    A.midden = [];
    A.camPlek = { x: -s * 1.7, z: za - 3.2 };
    A.bord = { x: 0, y: Math.min(h - 0.5, zy + zr + 0.8), z: d / 2 - 0.08, ry: Math.PI, b: 4 };
    A.bundels = [-1, 1].flatMap(sx => [-0.25, 0.1, 0.4].map(f => ({ p: V(sx * 1.8, h - 0.1, za + f * 4), doel: V(sx * 1.2 * f, 0, za - 2 - f * 3), zwaai: 0.5, kl: 2 })));
    A.poelen = [{ x: 0, z: za, r: 3.4, kl: 2 }, { x: 0, z: za - 5, r: 3, kl: 0, bas: true }];
    A.cams = B2 => {
      const dj = V(0, 2.1, za), lijst = [
        CAM.dolly('zuilen', V(laan, 1.7, -d / 2 + 2.2), V(laan, 1.9, za + 2), dj, { T: 14 }),
        CAM.kraan('schip', V(0, h - 1.0, -d / 2 + 2.4), V(0, 3.0, za - 5), dj),
        CAM.laag('laag', V(A.camPlek.x, 0.55, A.camPlek.z), V(0, zy, zz), { fov: 72 }),
        CAM.schouder(B2),
        CAM.top('top', V(0, 0.5, za - 3), 3.2, h - 0.8),
      ];
      return { lijst, held: lijst[2] };
    };
    A.update = (dt, now, b, L) => {
      zon.material.color.copy(B.P.c).lerp(B.P.a, 0.4).multiplyScalar((0.5 + 0.8 * b.pulse) * L.k + L.flits);
      zon.scale.setScalar(1 + 0.04 * b.bas);
      if (binnenMat.uniforms) binnenMat.uniforms.bass.value = (0.4 + 0.5 * b.pulse) * L.k; else binnenMat.color.copy(B.P.a).multiplyScalar((0.25 + 0.35 * b.bas) * L.k);
      oc.material.color.copy(B.P.c).multiplyScalar(0.35 + 0.25 * b.pulse);
    };
    return A;
  } };

  // 5. Loods: zadeldak met stalen spanten, lichtbalken eraan, soundsystem naast de dj, containers aan de overkant
  ARCH.loods = { gewicht: 4.5, maak(B) {
    const r = B.r, w = rond(tussen(r, 15, 19), 0.5), d = rond(tussen(r, 18, 24), 0.5), hw = rond(tussen(r, 5, 6), 0.1), hr = hw + tussen(r, 2.2, 3.4);
    const s = r() < 0.5 ? -1 : 1, st = B.S.struct, { M, G } = B;
    B.d2 = d / 2;
    const { hm } = schil(B, rechthoek(w, d), d, hw, { plafond: false, hm: 4.6 });
    // dak en gevels
    const dak = [], dakUv = [], L = Math.hypot(w / 2, hr - hw), T = M.basisTegel;
    for (const sx of [-1, 1]) {  // twee schuine vlakken van de wandkop naar de nok
      const P4 = [[sx * w / 2, hw, -d / 2], [0, hr, -d / 2], [0, hr, d / 2], [sx * w / 2, hw, d / 2]], U4 = [[0, -d / 2], [L, -d / 2], [L, d / 2], [0, d / 2]];
      for (const k of [0, 1, 2, 0, 2, 3]) { dak.push(...P4[k]); dakUv.push(U4[k][0] / T, U4[k][1] / T); }
    }
    for (const z of [-d / 2, d / 2]) { dak.push(-w / 2, hw, z, w / 2, hw, z, 0, hr, z); dakUv.push(-w / 2 / T, hw / T, w / 2 / T, hw / T, 0, hr / T); }  // gevels
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.Float32BufferAttribute(dak, 3)); dg.setAttribute('uv', new THREE.Float32BufferAttribute(dakUv, 2)); dg.computeVertexNormals();
    G.add(new THREE.Mesh(dg, M.plafond));
    // spanten (Warren) met lichtbalken
    const nS = Math.max(4, Math.round(d / tussen(r, 3.2, 4))), np = 8, topY = x => hw + (hr - hw) * (1 - Math.abs(x) / (w / 2)) - 0.2;
    for (let i = 0; i < nS; i++) {
      const z = -d / 2 + (i + 0.5) * d / nS, onder = [], boven = [];
      for (let k = 0; k <= np; k++) { const x = -w / 2 + k * w / np; onder.push(V(x, hw - 0.1, z)); boven.push(V(x, topY(x), z)); }
      for (let k = 0; k < np; k++) {
        B.vast.push([VORM.doos, staafM(onder[k], onder[k + 1], 0.08), st[1]], [VORM.doos, staafM(boven[k], boven[k + 1], 0.08), st[1]]);
        B.vast.push([VORM.doos, staafM(k % 2 ? onder[k] : boven[k], k % 2 ? boven[k + 1] : onder[k + 1], 0.05), st[1]]);
        if (k) B.vast.push([VORM.doos, staafM(onder[k], boven[k], 0.05), st[1]]);
      }
      B.net.lijn([V(-w / 2 + 1.4, hw - 0.5, z), V(w / 2 - 1.4, hw - 0.5, z)], 0.06, { kl: i % 2, groep: i }, false, (w - 2.8) / 4);
      for (const x of [-w / 2 + 1.4, w / 2 - 1.4]) B.vast.push([VORM.cil, mat4(x, hw - 0.3, z, 0.008, 0.4, 0.008), 0x0a0a0a]);
    }
    deurLijsten(B, d);
    const A = { vorm: 'loods', w, d, h: hr, plafondH: null, muurH: null, vloerOK: true, binnenVoet: rechtBinnen(w, d), plafondOp: () => hw - 0.55, strobo: stroboHoeken(w, d, hm - 0.3) };
    const djz = rond(tussen(r, -1.5, 1.5), 0.1), rx = -s * 2.6;
    A.dj = { x: s * (w / 2 - 2.0), z: djz, face: -s * Math.PI / 2 };
    // soundsystem: stapels kasten links en rechts van de dj, fronten kloppen op de bas
    const kast = [], X = s * (w / 2 - 0.45);
    for (const sz of [-1, 1]) for (let kol = 0; kol < 2; kol++) for (let laag = 0; laag < 3; laag++) {
      const z = djz + sz * (1.75 + kol * 0.95), y = 0.38 + laag * 0.76;
      B.vast.push([VORM.doos, mat4(X, y, z, 0.66, 0.74, 0.92), 0x0e0e10]);
      kast.push(mat4(X - s * 0.335, y, z, 0.92, 0.74, 1, 0, -s * Math.PI / 2, 0));
      if (laag === 0) B.obst.push({ x: X, z, r: 0.55 });
    }
    const spMat = new THREE.MeshBasicMaterial({ map: doek('speaker'), color: 0x888888 });
    const fronten = new THREE.InstancedMesh(VORM.vlak, spMat, kast.length); kast.forEach((m, i) => fronten.setMatrixAt(i, m)); fronten.frustumCulled = false; G.add(fronten);
    // container(s) aan de overkant
    const nC = w >= 16.5 ? 2 : 1, cz0 = (r() < 0.5 ? -1 : 1);
    const cMat = new THREE.MeshBasicMaterial({ map: doek('golfplaat'), color: new THREE.Color(kies(r, [0x8a3020, 0x2a5a8a, 0x3a6a3a, 0x7a6a3a])).multiplyScalar(0.55) });
    for (let i = 0; i < nC; i++) {
      const cx2 = -s * (w / 2 - 1.35), cz = cz0 * (d / 2 - 4.4), cy = 1.3 + i * 2.6;
      if (i === 1 && (hw < 5.6 || r() < 0.5)) break;
      const c = new THREE.Mesh(VORM.doos, cMat); c.position.set(cx2, cy, cz); c.scale.set(2.44, 2.6, 6.06); G.add(c);
      if (i === 0) for (const dz of [-2, 0, 2]) B.obst.push({ x: cx2, z: cz + dz, r: 1.4 });
    }
    A.route = [[0, -d / 2], [rx * 0.6, -d / 2 + 2.8], [rx, -1.6], [rx, 1.6], [rx * 0.6, d / 2 - 2.8], [0, d / 2]].map(([x, z]) => ({ x, z }));
    A.zones3d = [{ soort: 'rijen', c: A.dj, u: [-s, 0], d0: 2.2, d1: w / 2 - 0.6, breed: d / 2 - 3 }];
    A.massa = [{ soort: 'rijen', c: A.dj, u: [-s, 0], d0: 2.2, d1: w - 3.4, breed: d / 2 - 2.4 }];
    A.opstellingen = { rijen: 1, kring: 0.6, verspreid: 0.8 };
    A.midden = d >= 20 ? [{ x: s * 1.2, z: -cz0 * (d / 2 - 3.6), r: 1.0 }] : [];
    A.camPlek = { x: s * (w / 2 - 1.3), z: djz + (djz > 0 ? -1 : 1) * 4.2 };
    A.bord = { x: s * (w / 2 - 0.06), y: hm + 0.2, z: djz, ry: -s * Math.PI / 2, b: 3.4 };
    A.bundels = [];
    for (let i = 0; i < nS; i++) if (i % 2 === 0) A.bundels.push({ p: V(s * 2, hw - 0.4, -d / 2 + (i + 0.5) * d / nS), doel: V(s * (w / 2 - 4.5), 0, djz * 0.5), zwaai: 2, kl: (i / 2) % 2 });
    A.poelen = [{ x: A.dj.x - s * 1.6, z: djz, r: 2.6, kl: 0 }];
    A.cams = B2 => {
      const dj = V(B2.dj.x, B2.dj.y + 1.2, B2.dj.z), lijst = [
        CAM.dolly('spanten', V(-s * 0.5, hw - 1.0, -d / 2 + 2), V(s * 0.5, hw - 1.0, d / 2 - 2), dj, { kijkMee: 0.4, T: 14 }),
        CAM.schouder(B2),
        CAM.laag('laag', V(A.camPlek.x, 0.65, A.camPlek.z), dj, { fov: 70 }),
        CAM.dolly('zijkant', V(-s * (w / 2 - 3.2), 2.8, -d / 4), V(-s * (w / 2 - 3.2), 2.8, d / 4), dj, { kijkMee: 0.2 }),
        CAM.kraan('kraan', V(-s * 1, hw - 0.9, -d / 2 + 3), V(s * 1.5, 2.8, -2), dj),
      ];
      return { lijst, held: lijst[1] };
    };
    A.update = (dt, now, b, L) => spMat.color.setScalar(0.45 + 0.75 * b.bas * L.k + 0.3 * b.pulse);
    return A;
  } };

  // 6. Verzonken pit: drie treden omlaag, ledringen langs elke rand, dj op een eiland in de pit (of op de rand)
  ARCH.pit = { gewicht: 4, maak(B) {
    const r = B.r, w = rond(tussen(r, 14, 17), 0.5), d = rond(tussen(r, 15, 18), 0.5), h = rond(tussen(r, 5, 6.2), 0.1);
    const s = r() < 0.5 ? -1 : 1, rp = Math.min(w, d) / 2 - 2.6, N = 24, midden = r() < 0.6, { M, G } = B;
    B.d2 = d / 2;
    const rand = veelhoek(N, rp);
    const { hm } = schil(B, rechthoek(w, d), d, h, { gaten: [rand] });
    const ringen = [rp, rp - 0.7, rp - 1.4];
    for (let k = 0; k < 3; k++) {  // stootborden, treden, bodem
      const vh = veelhoek(N, ringen[k]), yT = -0.4 * k, yB = -0.4 * (k + 1);
      G.add(new THREE.Mesh(wandGeo(vh, 1e6, yB, yT, { uv: (s2, y) => [s2 / M.basisTegel, y / M.basisTegel] }), M.basis));
      if (k < 2) G.add(new THREE.Mesh(vlakGeo(vh, yB, M.vloerTegel, [veelhoek(N, ringen[k + 1])]), M.vloer));
      B.net.lijn(vh.map(([x, z]) => V(x * 0.995, yT + 0.03, z * 0.995)), 0.05, { kl: k % 2, ring: 1 - k * 0.3, groep: k }, true, 1.6);
    }
    const bodem = veelhoek(N, ringen[2]), trip = B.sf === 'trippy' && B.Z === 0;
    let bodemMat = M.vloer;
    if (trip) { bodemMat = B.ctx.trip(); bodemMat.side = THREE.DoubleSide; }
    G.add(new THREE.Mesh(vlakGeo(bodem, -1.2, trip ? ringen[2] * 2 : M.vloerTegel), bodemMat));
    if (trip) { const uv = G.children[G.children.length - 1].geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + 0.5, uv.getY(i) + 0.5); }
    deurLijsten(B, d);
    const A = { vorm: 'pit', w, d, h, plafondH: h, muurH: h, vloerOK: false, binnenVoet: rechtBinnen(w, d), plafondOp: () => h,
      vloerOp: (x, z) => { const q = Math.hypot(x, z); return q < rp ? (q < ringen[2] ? -1.2 : q < ringen[1] ? -0.8 : -0.4) : 0; }, strobo: stroboHoeken(w, d, h - 0.6) };
    const rr = rp + 1.1, sr = midden ? s : -s;
    A.route = [[0, -d / 2], ...[-1.05, -0.4, 0.4, 1.05].map(a => [sr * rr * Math.cos(a), rr * Math.sin(a)]), [0, d / 2]].map(([x, z]) => ({ x, z }));
    if (midden) {
      B.vast.push([VORM.cil, mat4(0, -0.98, 0, 1.25, 0.44, 1.25), B.S.struct[0]]);
      B.net.ring(V(0, -0.75, 0), 1.26, 0.04, { kl: 2, ring: 0 });
      A.dj = { x: 0, z: 0, face: Math.PI, y: -0.76, riser: false };
      A.focus = V(0, 0.6, 0);
      A.zones3d = [{ soort: 'ring', c: { x: 0, z: 0 }, r0: 1.95, r1: ringen[2] - 0.45, y: -1.2 }];
      A.massa = [{ soort: 'ring', c: { x: 0, z: 0 }, r0: ringen[1] - 0.35, r1: ringen[1] - 0.35, y: -0.8 }, { soort: 'ring', c: { x: 0, z: 0 }, r0: ringen[0] - 0.35, r1: ringen[0] - 0.35, y: -0.4 },
        { soort: 'ring', c: { x: 0, z: 0 }, r0: rp + 0.5, r1: Math.min(w, d) / 2 - 0.7 }];
      A.opstellingen = { kring: 1, verspreid: 0.4 };
    } else {
      A.dj = { x: s * (w / 2 - 1.5), z: 0, face: -s * Math.PI / 2 };
      A.focus = V(s * 1.5, 0.2, 0);
      A.zones3d = [{ soort: 'rijen', c: { x: s * ringen[2], z: 0 }, u: [-s, 0], d0: 0.6, d1: ringen[2] * 2 - 1.0, breed: ringen[2] - 0.6, y: -1.2, kijk: A.dj, rmax: ringen[2] - 0.4 }];
      A.massa = [{ soort: 'ring', c: { x: 0, z: 0 }, r0: ringen[1] - 0.35, r1: ringen[1] - 0.35, y: -0.8, kijk: A.dj }, { soort: 'ring', c: { x: 0, z: 0 }, r0: ringen[0] - 0.35, r1: ringen[0] - 0.35, y: -0.4, kijk: A.dj }];
      A.opstellingen = { rijen: 1, kring: 0.7 };
    }
    A.midden = [];
    A.camPlek = { x: -sr * (rp - 0.35) * Math.cos(0.7), z: -(rp - 0.35) * Math.sin(0.7), y: -0.4 + 0.6 };
    A.bord = { x: -sr * (w / 2 - 0.06), y: hm * 0.7 + 0.5, z: 0, ry: sr * Math.PI / 2, b: 3.6 };
    A.bundels = [0, 1, 2, 3, 4, 5, 6, 7].map(i => { const a = i / 8 * RONDE; return { p: V(Math.cos(a) * (rp + 0.8), h - 0.2, Math.sin(a) * (rp + 0.8)), doel: V(Math.cos(a) * 1.6, -1.2, Math.sin(a) * 1.6), zwaai: 1.2, kl: i % 2 }; });
    A.poelen = [{ x: 0, y: -1.2, z: 0, r: ringen[2], kl: 0 }];
    A.cams = B2 => {
      const dj = V(B2.dj.x, B2.dj.y + 1.2, B2.dj.z), put = V(0, -0.6, 0), lijst = [
        CAM.baan('rand', { x: 0, z: 0 }, rp + 0.55, 2.3, midden ? dj : put, { boog: sr > 0 ? [Math.PI * 0.6, Math.PI * 1.4] : [-Math.PI * 0.4, Math.PI * 0.4], v: 0.1 }),
        CAM.top('top', V(0, -1.2, 0), 2.2, h - 0.5),
        CAM.schouder(B2),
        CAM.laag('laag', V(A.camPlek.x, A.camPlek.y, A.camPlek.z), dj, { y: A.camPlek.y, fov: 72 }),
        CAM.kraan('kraan', V(-sr * (w / 2 - 1), h - 0.6, -d / 2 + 1.5), V(-sr * (rp + 0.3), 2.2, -2), dj),
      ];
      return { lijst, held: lijst[midden ? 1 : 2] };
    };
    A.update = (dt, now, b, L) => { if (trip) bodemMat.uniforms.bass.value = (0.35 + 0.5 * b.pulse) * L.k; };
    return A;
  } };

  // 7. Grot: grillige omtrek, uitstulpende wanden, koepel met druipstenen, lichtgevende paddenstoelen, sporen, dj in een nis
  ARCH.grot = { gewicht: 4, maak(B) {
    const r = B.r, D = rond(tussen(r, 7, 8.5), 0.5), Rx = rond(tussen(r, 6.6, 8), 0.1), hw = rond(tussen(r, 3.2, 4), 0.1), yTop = hw + tussen(r, 1.3, 2.3);
    const s = r() < 0.5 ? -1 : 1, d = 2 * D, a = 1.3, K = 10, f0 = 0.28, { M, G } = B;
    B.d2 = D;
    // omtrek: deurvlakken recht, de zijkanten grillig (ruis loopt naar nul bij de deuren)
    const omtrek = [[-a, -D], [a, -D]];
    for (const zij of [1, -1]) {
      const l = [];
      for (let k = 0; k <= K; k++) {
        const t = k / K, phi = -Math.PI / 2 + f0 + t * (Math.PI - 2 * f0), tp = Math.sin(Math.PI * t), n = 1 + 0.16 * tp * (2 * r() - 1) * (zij === s && Math.abs(t - 0.5) < 0.2 ? 0.2 : 1);
        l.push([zij * Rx * Math.cos(phi) * n, D * Math.sin(phi) * (1 + 0.03 * tp * (2 * r() - 1))]);
      }
      if (zij > 0) omtrek.push(...l, [a, D], [-a, D]); else omtrek.push(...l.reverse());
    }
    const ph = [r() * 9, r() * 9, r() * 9], bult = tussen(r, 0.45, 0.8);
    const ruis = (s2, y) => 0.5 + 0.25 * Math.sin(s2 * 1.3 + ph[0]) + 0.15 * Math.sin(s2 * 2.9 + y * 1.7 + ph[1]) + 0.1 * Math.sin(y * 3.1 + s2 * 0.7 + ph[2]);
    const vervorm = (p, s2, y) => {
      const q = Math.hypot(p[0], p[2]) || 1, dd = Math.min(Math.hypot(p[0], p[2] + D), Math.hypot(p[0], p[2] - D));
      const k = bult * Math.sin(Math.PI * klem(y / hw)) * glad((dd - 1.7) / 1.5) * ruis(s2, y);
      return [p[0] - p[0] / q * k, p[1], p[2] - p[2] / q * k];
    };
    schil(B, omtrek, d, hw, { vervorm, stapS: 0.9, stapY: hw / 4, plafond: false, geenPlint: true, hm: hw });
    const Rmax = Math.max(...omtrek.map(([x, z]) => Math.hypot(x, z)));
    G.add(new THREE.Mesh(koepelGeo(omtrek, hw, yTop, 5, M.basisTegel, (p, i, k) => [p[0], p[1] + 0.5 * Math.sin(i * 1.7 + k * 2.3 + ph[0]), p[2]]), M.basis));
    const plafond = (x, z) => koepelY(Math.hypot(x, z) / Math.max(1, straal(omtrek, Math.atan2(z, x))), hw, yTop);
    // druipstenen (samengevoegd) met gloeiende puntjes
    for (let i = 0; i < [16, 11, 7][B.Z]; i++) {
      const hoek = r() * RONDE, q = Math.sqrt(r()) * 0.7 * straal(omtrek, hoek), x = Math.cos(hoek) * q, z = Math.sin(hoek) * q, y = plafond(x, z), L = tussen(r, 0.5, 1.4);
      B.vast.push([VORM.kegel, mat4(x, y - L / 2 + 0.2, z, tussen(r, 0.12, 0.25), L, tussen(r, 0.12, 0.25), Math.PI, 0, 0), B.S.struct[0]]);
      if (i % 2 === 0) B.net.staaf(V(x, y - L + 0.15, z), V(x, y - L + 0.08, z), 0.05, { kl: 2 });
    }
    deurLijsten(B, d);
    const binnenVoet = (x, z, m) => Math.hypot(x, z) <= straal(omtrek, Math.atan2(z, x)) - bult - m;
    const A = { vorm: 'grot', w: 2 * Rmax, d, h: yTop, plafondH: null, muurH: null, vloerOK: false, binnenVoet, plafondOp: plafond };
    const rD = straal(omtrek, s > 0 ? 0 : Math.PI);
    A.dj = { x: s * (rD - bult - 1.6), z: rond(tussen(r, -0.8, 0.8), 0.1), face: -s * Math.PI / 2 };
    const rx = -s * 3.0;
    A.route = [[0, -D], [rx * 0.7, -D + 3], [rx, -0.6], [rx, 0.6], [rx * 0.7, D - 3], [0, D]].map(([x, z]) => ({ x, z }));
    const mc = { x: s * 0.6, z: (r() < 0.5 ? -1 : 1) * 2.2 };
    A.midden = [{ x: mc.x, z: mc.z, r: 1.0 }];
    A.zones3d = [{ soort: 'ring', c: mc, r0: 1.9, r1: 2.8, kijk: A.dj }, { soort: 'rijen', c: A.dj, u: [-s, 0], d0: 2.0, d1: 4.2, breed: 2.4 }];
    A.massa = [{ soort: 'vlak', x0: -Rx + 1, x1: Rx - 1, z0: -D + 2.4, z1: D - 2.4, kijk: A.dj }];
    A.opstellingen = { kring: 1, verspreid: 0.8 };
    A.camPlek = { x: s * 1.5, z: -Math.sign(mc.z) * 3.4 };
    A.bord = null;
    A.bundels = [0, 1, 2].map(i => { const x = (i - 1) * 2.5, z = (i % 2 ? 1 : -1) * 1.5; return { p: V(x, plafond(x, z) - 0.1, z), doel: V(x * 0.6, 0, z * 0.4), zwaai: 0.35, kl: 2 }; });
    A.poelen = [{ x: A.dj.x, z: A.dj.z, r: 2.2, kl: 0 }, { x: mc.x, z: mc.z, r: 2.6, kl: 1, bas: true }];
    // lichtgevende paddenstoelen langs de wanden (hoeden = één InstancedMesh die ademt op de muziek)
    const nP = [26, 16, 8][B.Z], hoeden = [], rAf = routeAfstand(A.route.map(p => [p.x, p.z]));
    for (let k = 0; k < nP * 6 && hoeden.length < nP; k++) {
      const hoek = r() * RONDE, q = straal(omtrek, hoek) - bult - tussen(r, 0.3, 1.4), x = Math.cos(hoek) * q, z = Math.sin(hoek) * q;
      if (rAf(x, z) < 0.9 || Math.abs(x - A.dj.x) + Math.abs(z - A.dj.z) < 2 || Math.hypot(x - A.camPlek.x, z - A.camPlek.z) < 0.9 || (Math.abs(x) < 1.8 && Math.abs(z) > D - 2.2)) continue;
      const hs = tussen(r, 0.25, 0.7), rc = hs * tussen(r, 0.5, 0.9);
      B.vast.push([VORM.cil, mat4(x, hs / 2, z, 0.05 + hs * 0.06, hs, 0.05 + hs * 0.06), 0x4a4438]);  // donkere steel: de hoed gloeit, niet het geheel
      hoeden.push({ x, y: hs, z, rc, kl: r() < 0.5 ? 0 : 1, f: r() });
    }
    let hoedMesh = null;
    if (hoeden.length) {
      hoedMesh = new THREE.InstancedMesh(VORM.hoed, new THREE.MeshBasicMaterial({ color: 0xffffff }), hoeden.length); hoedMesh.frustumCulled = false;
      hoeden.forEach((p, i) => { hoedMesh.setMatrixAt(i, mat4(p.x, p.y - 0.02, p.z, p.rc, p.rc * 0.6, p.rc)); hoedMesh.setColorAt(i, _c.setRGB(0, 0, 0)); });  // kleur vóór het eerste tekenen (r128: anders wit)
      G.add(hoedMesh);
    }
    // sporen: zweven langzaam omhoog
    const nS = [90, 50, 0][B.Z]; let sporen = null;
    if (nS) {
      const pos = new Float32Array(nS * 3);
      for (let i = 0; i < nS; i++) { const hoek = r() * RONDE, q = Math.sqrt(r()) * (Rx - 1.5); pos[i * 3] = Math.cos(hoek) * q; pos[i * 3 + 1] = r() * hw; pos[i * 3 + 2] = Math.sin(hoek) * q * D / Rx; }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      sporen = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.09, map: doek('gloed'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      sporen.frustumCulled = false; G.add(sporen);
    }
    A.cams = B2 => {
      const dj = V(B2.dj.x, B2.dj.y + 1.2, B2.dj.z), m = V(mc.x, 1.2, mc.z), lijst = [
        CAM.baan('baan', { x: 0, z: 0 }, 3.2, 2.4, m, { v: 0.11 }),
        CAM.schouder(B2),
        CAM.laag('laag', V(A.camPlek.x, 0.5, A.camPlek.z), dj, { fov: 74 }),
        CAM.kraan('kraan', V(-s * 1.5, yTop - 0.9, -D + 3), V(-s * 2.2, 2.0, -1.5), dj),
        CAM.dolly('nis', V(rx * 1.3, 1.4, -D + 3.4), V(rx * 1.3, 1.6, -2.4), m, { kijkMee: 0.3, rustig: true }),
      ];
      return { lijst, held: lijst[2] };
    };
    A.update = (dt, now, b, L) => {
      if (hoedMesh) {  // verzadigd en niet te fel (een bleke paletkleur + bloom werd een witte plastic bol)
        hoeden.forEach((p, i) => { _c.copy(p.kl ? B.P.b : B.P.a).getHSL(HSL); _c.setHSL(HSL.h, Math.max(0.75, HSL.s), Math.min(0.5, HSL.l));
          hoedMesh.setColorAt(i, _c.multiplyScalar((0.3 + 0.5 * (0.5 + 0.5 * Math.sin(b.pos * Math.PI / 4 + p.f * RONDE))) * (0.6 + 0.4 * b.pulse) * L.k + L.flits * 0.4)); });
        hoedMesh.instanceColor.needsUpdate = true;
      }
      if (sporen) {
        const p = sporen.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) { let y = p.getY(i) + dt * (0.08 + 0.2 * b.energy); if (y > hw + 0.5) y = 0.1; p.setY(i, y); }
        p.needsUpdate = true; sporen.material.color.copy(B.P.c).multiplyScalar(0.5 + 0.6 * b.hoog);
      }
    };
    return A;
  } };

  // 8. Gewelf: spoorboog-club, tongewelf met ledringen die als een lichttunnel van de ingang naar de uitgang lopen
  ARCH.gewelf = { gewicht: 4, maak(B) {
    const r = B.r, w = rond(tussen(r, 9.5, 12), 0.5), d = rond(tussen(r, 18, 26), 0.5), hw = rond(tussen(r, 2.9, 3.4), 0.1), rv = w / 2 * tussen(r, 0.75, 1.0);
    const s = r() < 0.5 ? -1 : 1, { M, G } = B, nA = 16;
    B.d2 = d / 2;
    const { hm } = schil(B, rechthoek(w, d), d, hw, { plafond: false, hm: hw });
    // tongewelf + lunetten aan de koppen
    const boog = []; for (let i = 0; i <= nA; i++) { const t = i / nA * Math.PI; boog.push([w / 2 * Math.cos(t), hw + rv * Math.sin(t)]); }
    const cum = [0]; for (let i = 1; i <= nA; i++) cum.push(cum[i - 1] + Math.hypot(boog[i][0] - boog[i - 1][0], boog[i][1] - boog[i - 1][1]));
    const pos = [], uv = [], T = M.basisTegel, nZ = Math.ceil(d / 3);
    for (let i = 0; i < nA; i++) for (let k = 0; k < nZ; k++) {
      const z0 = -d / 2 + k * d / nZ, z1 = -d / 2 + (k + 1) * d / nZ, a = boog[i], b = boog[i + 1];
      const P4 = [[a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1]], U4 = [[cum[i], z0], [cum[i + 1], z0], [cum[i + 1], z1], [cum[i], z1]];
      for (const q of [0, 1, 2, 0, 2, 3]) { pos.push(...P4[q]); uv.push(U4[q][0] / T, U4[q][1] / T); }
    }
    for (const z of [-d / 2, d / 2]) for (let i = 0; i < nA; i++) { pos.push(0, hw, z, boog[i][0], boog[i][1], z, boog[i + 1][0], boog[i + 1][1], z); uv.push(0, hw / T, boog[i][0] / T, boog[i][1] / T, boog[i + 1][0] / T, boog[i + 1][1] / T); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
    G.add(new THREE.Mesh(g, M.basis));
    // ledringen: boog + wandstukken, elke 2-2,8 m
    const rs = tussen(r, 2.0, 2.8), nR = Math.floor((d - 2) / rs);
    for (let i = 0; i <= nR; i++) {
      const z = -d / 2 + 1 + i * (d - 2) / nR, pts = boog.filter((_, j) => j % 2 === 0).map(([x, y]) => V(x * 0.985, hw + (y - hw) * 0.985, z));
      B.net.lijn(pts, 0.06, { kl: i % 2, groep: i }, false, 2);
      for (const sx of [-1, 1]) B.net.staaf(V(sx * (w / 2 - 0.05), 0.35, z), V(sx * (w / 2 - 0.05), hw - 0.05, z), 0.05, { kl: i % 2, groep: i });
    }
    deurLijsten(B, d);
    const plafondOp = x => hw + rv * Math.sqrt(Math.max(0, 1 - Math.pow(2 * x / w, 2)));
    const A = { vorm: 'gewelf', w, d, h: hw + rv, plafondH: null, muurH: null, vloerOK: true, binnenVoet: rechtBinnen(w, d), plafondOp };
    const djz = rond(tussen(r, -2, 2), 0.1), rx = -s * (w / 2 - 2.5);
    A.dj = { x: s * (w / 2 - 1.6), z: djz, face: -s * Math.PI / 2 };
    A.route = [[0, -d / 2], [rx * 0.6, -d / 2 + 2.8], [rx, -1.6], [rx, 1.6], [rx * 0.6, d / 2 - 2.8], [0, d / 2]].map(([x, z]) => ({ x, z }));
    A.zones3d = [{ soort: 'rijen', c: A.dj, u: [-s, 0], d0: 2.0, d1: w - 5.2, breed: d / 2 - 3.2 }];
    A.massa = [{ soort: 'rijen', c: A.dj, u: [-s, 0], d0: 2.0, d1: w - 4.4, breed: d / 2 - 2.6 }, { soort: 'strook', a: { x: -s * (w / 2 - 0.7), z: -d / 2 + 2.6 }, b: { x: -s * (w / 2 - 0.7), z: d / 2 - 2.6 }, kijk: A.dj }];
    A.opstellingen = { rijen: 1, kring: 0.5, verspreid: 0.5 };
    A.midden = d >= 22 ? [{ x: s * 1.5, z: (r() < 0.5 ? -1 : 1) * (d / 2 - 3.6), r: 0.9 }] : [];
    A.camPlek = { x: s * (w / 2 - 1.1), z: djz + (djz > 0 ? -1 : 1) * 3.2 };
    A.bord = { x: 0, y: hw + rv * 0.55, z: d / 2 - 0.08, ry: Math.PI, b: Math.min(4, w * 0.4) };
    A.bundels = [-0.35, -0.12, 0.12, 0.35].map((f, i) => ({ p: V(0, plafondOp(0) - 0.15, f * d), doel: V(s * 1.5, 0, f * d * 0.4 + djz), zwaai: 1.4, kl: i % 2 }));
    A.poelen = [{ x: A.dj.x - s * 1.5, z: djz, r: 2.4, kl: 0 }];
    A.strobo = [-1, 1].flatMap(sz => [-1, 1].map(sx => ({ x: sx * w * 0.3, y: plafondOp(sx * w * 0.3) - 0.1, z: sz * d / 4, ry: 0 })));
    A.cams = B2 => {
      const dj = V(B2.dj.x, B2.dj.y + 1.2, B2.dj.z), lijst = [
        CAM.dolly('tunnel', V(-s * 0.6, hw + rv * 0.45, -d / 2 + 1.5), V(-s * 0.3, hw + rv * 0.4, d / 2 - 2.5), V(s * 0.8, 1.2, d / 2), { T: 16, rustig: true }),
        CAM.schouder(B2),
        CAM.laag('laag', V(A.camPlek.x, 0.6, A.camPlek.z), dj),
        CAM.dolly('zijkant', V(-s * (w / 2 - 1.2), 2.5, -d / 4), V(-s * (w / 2 - 1.2), 2.6, d / 4), dj, { kijkMee: 0.25 }),
        CAM.kraan('kraan', V(0, plafondOp(0) - 0.6, -d / 2 + 3), V(-s * 1.0, 2.6, -1), dj),
      ];
      return { lijst, held: lijst[1] };
    };
    return A;
  } };

  // --- een kamer samenstellen ---
  function maakKamer(archNaam, ctx) {
    const r = ctx.rnd, Z = Math.max(0, Math.min(2, ctx.zwaar | 0)), G = ctx.groep, b0 = ctx.beat() || {}, reg = regie();
    const sf = kiesSfeer(r, archNaam, reg.stand), S = SFEER[sf], schild = kiesSchild(r, sf, Z), P = maakPalet(r, sf, schild);
    const B = { ctx, r, Z, G, sf, S, schild, P, energie: klem(S.energie * 0.55 + (b0.energy || 0) * 0.45 + (reg.stand === 'drop' ? 0.15 : 0)),
      vast: [], obst: [], figs: [], updates: [], onderdelen: [], d2: 8 };
    B.M = materialen(B);
    B.focus = V(0, 1.6, 0);
    B.net = maakNet(B);
    // plafond: een onderdeel of de eigen balken (beslist vóór de architectuur, want die tekent ze mee)
    const wilPlafond = r() < 0.65;
    B.plafondEigen = !wilPlafond;
    // middenstuk met dj (onderdelen.js) in plaats van de eigen dj-plek: alleen waar de dj midden in de kamer staat
    const bus = G.userData.dhBus || (G.userData.dhBus = { shows: [], focus: null, midden: null, dim: 0, flits: 0, helder: 1 });
    B.middenDj = !!(ARCH[archNaam].middenKans && heeftOnderdeel(B, 'midden') && r() < ARCH[archNaam].middenKans);
    const A = ARCH[archNaam].maak(B);
    B.A = A;
    if (A.focus) B.focus.copy(A.focus); else B.focus.set(A.dj.x, (A.dj.y || 0) + 1.6, A.dj.z);
    if (A.camPlek) B.obst.push({ x: A.camPlek.x, z: A.camPlek.z, r: 0.8, cam: true });  // vrije plek voor de lage camera
    B.naam = kiesWoord(B);  // naam van de kamer: op de dj-tafel en op het grote bord
    zetRoute(B, A);
    B.L = maakLicht(B);
    // lampen: sleutellicht boven het middelpunt (eerst: dat krijgen we altijd), accent na de onderdelen
    const kleurKey = P.a.clone().lerp(WIT, 0.35);
    const key = ctx.licht(kleurKey.getHex(), 1.8, Math.max(A.w, A.d) * 0.9, B.focus.x, Math.min(A.plafondOp(B.focus.x, B.focus.z) - 0.5, B.focus.y + 2.6), B.focus.z);
    // de dj: een middenstuk van onderdelen.js (dj erin, kijkt naar de ingang) of de eigen tafel op de plek van de architectuur
    if (B.middenDj && A.djMidden) {
      const m = A.djMidden;
      bus.focus = null;
      if (plaatsOnderdeel(B, 'midden', { x: m.x, z: m.z, r: m.r }) && bus.focus) {
        const f = bus.focus, y = Math.max(0, f.y - 1.55);
        B.dj = { x: f.x, z: f.z, y, face: Math.PI, H: 1.75, TOP: y + 1.05, fig: null, viaMidden: true, lok: (lx, ly, lz) => V(f.x - lx, ly, f.z - lz) };
        B.obst.push({ x: m.x, z: m.z, r: m.r });
      }
    }
    if (!B.dj) {
      bouwDj(B, A);
      bus.focus = { x: B.dj.x, y: B.dj.y + 1.55, z: B.dj.z };  // rigs en shows van onderdelen.js richten op onze dj
      bus.midden = { x: B.dj.x, z: B.dj.z, r: 1.3, top: B.dj.TOP + 1.9 };
    }
    // overige onderdelen: hooguit drie; drukke schildering = geen muurwerk en minder. Een tweede middenplek krijgt een eigen
    // stuk (totem, kristallen, paalpodium): de middenstukken van onderdelen.js hebben hun eigen dj.
    let ruimte = SCHILD[schild].drukte > 0.75 ? 2 : 3;
    if (A.midden && A.midden.length && r() < 0.65) {
      const plek = kies(r, A.midden);
      eigenMidden(B, plek);
      B.obst.push({ x: plek.x, z: plek.z, r: plek.r });
    }
    if (A.plafondH && wilPlafond && ruimte > 0) { if (plaatsOnderdeel(B, 'plafond', { h: A.plafondH })) ruimte--; else if (A.vorm === 'recht' || A.vorm === 'galerij') plafondBalken(B, A.w - 2, A.d, A.plafondH - 0.35); }
    if (A.muurH && SCHILD[schild].drukte < 0.75 && ruimte > 0 && r() < 0.5 && plaatsOnderdeel(B, 'muur', { w: A.w, d: A.d, h: A.muurH, deuren: [{ x: 0, z: -A.d / 2, b: 2, h: 2.6 }, { x: 0, z: A.d / 2, b: 2, h: 2.6 }] })) { ruimte--; B.wandMarge = 0.75; }
    if (A.vloerOK && ruimte > 0 && r() < 0.4 && plaatsOnderdeel(B, 'vloer', { w: A.w, d: A.d })) ruimte--;
    if (!(ruimte > 0 && r() < 0.85 && plaatsOnderdeel(B, 'show', { w: A.w, d: A.d, h: A.h }))) eigenShow(B);
    const accent = ctx.licht(P.b.getHex(), 1.2, 12, B.dj.x - Math.sin(B.dj.face) * 1.5, B.dj.y + 2.6, B.dj.z - Math.cos(B.dj.face) * 1.5);
    // publiek, licht en borden
    bevolk(B, A);
    maakBundels(B, A.bundels || []);
    maakPoelen(B, A.poelen || []);
    maakWaas(B, 6, -A.w / 2 + 2, A.w / 2 - 2, Math.min(A.h - 1.2, 3.4), Math.min(A.h - 0.6, 4.2), -A.d / 2 + 2.5, A.d / 2 - 2.5);
    // borden: de naam groot aan de wand, boven de uitgang een ander woord (tussen deur en plafond, anders niet)
    let bord = null, uitBord = null;
    if (A.bord) { bord = ctx.neon(B.naam, css(P.a), A.bord.b, A.bord.b / 4); if (bord) { bord.position.set(A.bord.x, A.bord.y, A.bord.z); bord.rotation.y = A.bord.ry; } }
    const uitTop = Math.min(A.plafondOp(0, A.d / 2 - 0.1) - 0.15, 3.75), uitH = Math.min(0.8, uitTop - 2.75);
    if (uitH >= 0.3 && !(A.bord && A.bord.z > A.d / 2 - 0.5)) {
      uitBord = ctx.neon(kiesWoord(B), css(P.b), Math.min(uitH * 4, A.w - 1), uitH);
      if (uitBord) { uitBord.position.set(0, uitTop - uitH / 2, A.d / 2 - 0.08); uitBord.rotation.y = Math.PI; }
    }
    // statisch spul samenvoegen, ledlijnen klaar
    if (B.vast.length) G.add(new THREE.Mesh(samen(B.vast), new THREE.MeshLambertMaterial({ vertexColors: true })));
    B.net.klaar();
    const camDefs = A.cams(B);
    if (B.dj.viaMidden) {
      camDefs.lijst = camDefs.lijst.filter(k => k.naam !== 'schouder');
      if (!camDefs.held || camDefs.held.naam === 'schouder') camDefs.held = camDefs.lijst.find(k => k.naam === 'laag') || camDefs.lijst[0];
    }
    const cam = regisseur(B, A, camDefs.lijst, camDefs.held);
    onthoud(GEHEUGEN.sfeer, sf, 3); onthoud(GEHEUGEN.schild, schild, 3);
    const stand = () => regie().stand || 'groove';
    let figKapot = false;
    function update(dt, now) {
      dt = Math.min(dt || 0, 0.1);
      const b = ctx.beat(), L = B.L;
      L.stap(dt, b);
      B.M.muur.color.copy(B.M.muurKleur).multiplyScalar(0.55 + 0.38 * L.k + 0.12 * b.pulse * L.k).lerp(WIT, L.flits * 0.3);
      if (B.M.vloerNaam === 'raster' || B.M.vloerNaam === 'golven' || B.M.vloerNaam === 'mos') B.M.vloer.color.copy(B.M.vloerKleur).multiplyScalar(0.5 + 0.5 * b.pulse * L.k + 0.3 * L.k);
      B.net.update(L, b);
      if (key) { key.intensity = (1.0 + 1.1 * b.pulse) * L.k + L.flits * 1.5; key.color.copy(kleurKey).lerp(WIT, L.flits); }
      if (accent) accent.intensity = (0.5 + 1.3 * b.bas) * L.k;
      for (const bb of [bord, uitBord]) if (bb) bb.material.color.setScalar((0.6 + 0.5 * b.pulse) * Math.max(0.55, L.k) * (sf === 'rauw' && hash(Math.floor(now * 8), bb === bord ? 1 : 2) > 0.95 ? 0.15 : 1));
      for (const f of B.updates) f(dt, now, b, L);
      if (A.update) A.update(dt, now, b, L);
      // drop: wie danst, juicht 8 tellen en springt er 8
      if (L.dropStart && !figKapot && typeof forceDance === 'function' && typeof ACTS !== 'undefined' && ACTS.Cheer_with_Both_Hands_Up) {
        try { for (const f of B.figs) if (f.rol === 'dans' && f.d && f.d.mixer && f.d.root && f.d.root.visible) { forceDance(f.d, ACTS.Cheer_with_Both_Hands_Up, b.pos, 8); if (ACTS.Happy_jump_f) f.d.queue = [[ACTS.Happy_jump_f, 8]]; } }
        catch (e) { figKapot = true; console.error('doolhof stijl: drop-moment', e); }
      }
      const st = stand();
      for (const o of B.onderdelen) {
        if (!o.inst.update || o.kapot) continue;
        try { o.inst.update(dt, now, b, st); } catch (e) { o.kapot = true; console.error('doolhof stijl: update ' + o.soort + '/' + o.naam, e); }
      }
    }
    function opruimen() {
      for (const o of B.onderdelen) if (o.inst.opruimen) try { o.inst.opruimen(); } catch (e) { console.error('doolhof stijl: opruimen ' + o.soort + '/' + o.naam, e); }
      B.onderdelen.length = 0;
      // InstancedMesh: de kern gooit geometrie en materiaal weg, de buffers van de instanties gaan pas weg met dispose()
      G.traverse(x => { if (x.isInstancedMesh && x.dispose) x.dispose(); else if (x.isPoints && x.geometry) x.geometry.dispose(); });
    }
    const kamer = { maat: { w: A.w, d: A.d, h: A.h }, route: A.route, blijf: S.blijf, cam, update, opruimen, publiek: B.publiek || null,
      stijl: { arch: archNaam, sfeer: sf, schild, palet: [css(P.a), css(P.b), css(P.c), css(P.donker)], opstelling: B.opstelling, onderdelen: B.onderdelen.map(o => o.soort + '/' + o.naam), figuren: B.figs.length + 1 } };
    DH.laatsteStijl = kamer.stijl;
    if (DH.stijl && DH.stijl.debug) DH.stijl.laatste = B;  // alleen voor de proef: de hele bouwcontext
    return kamer;
  }

  // --- registreren: één soort per architectuur (de kern kiest nooit twee keer dezelfde soort achter elkaar) ---
  for (const naam of Object.keys(ARCH)) {
    const soort = DH.kamers && DH.kamers[naam] ? 'stijl-' + naam : naam;
    DH.registreer(soort, { gewicht: ARCH[naam].gewicht, maak: ctx => maakKamer(naam, ctx) });
  }
  DH.stijl = { ARCH, SFEER, SCHILD, GEHEUGEN, maakKamer };  // voor de testronde
})();

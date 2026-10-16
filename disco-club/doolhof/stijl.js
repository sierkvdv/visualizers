// --- Doolhof: het stijlsysteem. Elke stijlkamer is een andere CLUB met een eigen look en lichttaal ---
// kamer = architectuur (hal, arena, galerij, tempel, loods, pit, grot, gewelf; kiest de kern) x club (bunker, ibiza, jungle, scifi,
// disco, onderwater, hel, arcade; zie CLUB) x palet van de club x muurschildering x onderdelen (doolhof/onderdelen.js) x publiek x camera.
// Rotatie: een geschud kaartspel van alle clubs (GEHEUGEN.clubDeck); per kamer de eerste kaart die bij de architectuur past, zo zie
// je kamer na kamer een andere club. De club kiest palet (vaste combinaties, ook wit: bunker rood/wit, Ibiza wit/goud), schilderingen,
// schermmodi, welke vlakken ledscherm zijn en welke donker blijven, ledvloer, onderdelen (gewichten), lichttaal (strobo, bundelbreedte
// en wit, lasers, waas, tempo) en camera (gewichten + heldenshot voor de drop). Test: doolhof.stijl.volgendeClub = 'disco'.
// GEEN STILSTAAND VLAK: muren, bovenwand, plafond/koepel/gewelf/dak, zuilen, containers, pit-randen zijn ledschermen
// (DH.ledHulp.scherm = doolhof/led.js, of de eigen versie in onderdelen.js zolang die er niet is): de muurschilderingen zijn beeld OP de
// schermen (bewegend, op de tel). Vloer, treden, podia en dj-verhogingen zijn samen één ledvloer (DH.ledHulp.vloer, elke vorm). Wat de
// club donker laat is showMat: zwart, licht alleen waar de show het raakt (lichtvlekken van de bundels, uplighters, stroboscoop).
// De ledschermen houden de clubkleuren (eigen showMix-uniform B.ledMix: break iets koeler, drop iets heter), de lichtregie (L.kl)
// gebruikt alleen het clubpalet; de show-bus van de kern (window.doolhof.show) levert stand, opbouw, drop, flits en blackout.
// Break = bijna donker, één spot op de dj; opbouw = sneller en feller, strobe-aanloop; drop = alles aan, salvo, lasers, kleurwissel op
// elke tel. Camera's kijken naar de schermen en het licht: schermwand, ledvloer (laag), ledplafond, van boven, tegen het licht in.
// Onderdelen: een middenstuk (met eigen dj) alleen waar de dj midden in de kamer staat (arena, hal-eiland, tempel), muurwerk alleen bij
// vrije rechte wanden, een rig alleen onder een vlak plafond (disco: de spiegelbol ook onder een koepel). Via de bus van de kamer
// (groep.userData.dhBus) richten rigs en shows op onze dj en volgen onze lagen hun blackout en stroboscoop.
// Prestatie: geen echte lampen erbij (2 handvatten), één gedeeld ledprogramma per soort, vlakken per soort één draw, statisch spul
// samengevoegd, ledlijnen/bundels/lenzen/lasers/stroboscopen elk één InstancedMesh, publiek één draw (club/publiek.js); ctx.zwaar schaalt.
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
  // kaleidoscoop (tripMat van de club): helderheid = 0,42 + 0,55 x bass; zo kan hij ook bijna zwart (break)
  const tripHelder = (m, f) => { if (m && m.uniforms && m.uniforms.bass) m.uniforms.bass.value = (Math.max(0.02, f) - 0.42) / 0.55; };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const GEEN_REGIE = { stand: 'groove', sinds: 0, opbouwTel: 0, dropBeat: -1 };
  const strobeUit = () => typeof S !== 'undefined' && S && S.strobe === 'uit';  // keuze 'Stroboscoop: uit' in de balk: niet knipperen
  const regie = () => window.clubRegie || GEEN_REGIE;
  // show-bus van de kern (doolhof/kern.js): alleen lezen; zonder bus rekenen we zelf terug uit clubRegie
  const showBus = () => { const s = DH.show; return s && typeof s === 'object' && typeof s.stand === 'string' && typeof s.kleur === 'function' ? s : null; };
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
    straal: houd(new THREE.CylinderGeometry(1, 1, 1, 5, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5)),   // laser: z 0..1
    straalG: houd(new THREE.CylinderGeometry(3.5, 3.5, 1, 6, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5)),  // gloed eromheen (zelfde matrices)
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

  // --- clubs: elke kamer is een andere club met een eigen, herkenbare look en lichttaal. Een club kiest palet, architectuur (bouw),
  // muurschilderingen (alleen nog als beeld OP de ledschermen), wat er van muren/bovenwand/plafond ledscherm is en wat donker blijft,
  // schermmodi, ledvloer, onderdelen, lichttaal (strobo, bundels, lasers, waas, tempo) en camera. fam = de oude sfeerfamilie (voor
  // onderdelen.js: past(), bouwkleur). Rotatie: een geschud kaartspel van alle clubs; de kern kiest de architectuur, wij de eerste club
  // uit het spel die daar goed in past (zo zie je kamer na kamer een andere club en komen ze allemaal langs).
  // muur/boven/plafond: { modi, helder, pitch? } = ledscherm; null = donker (showMat: zwart, licht alleen waar de show het raakt)
  const CLUB = {
    bunker: { titel: 'Berlijnse technobunker', fam: 'rauw',
      paletten: [[0xff1206, 0xfff1ea, 0xff4a10], [0xff0a28, 0xffffff, 0xc00010], [0xff2200, 0xeaf0ff, 0xff0050]],
      schild: { 'beton-bunker': 3, 'rave-flyers': 1.4, neonsteeg: 0.8 }, basis: 'beton',
      muur: { modi: ['beeld', 'patroon', 'tekst'], helder: 0.62, pitch: 0.06 }, boven: null, plafond: null,  // donker, maar de wanden moeten het beeld dragen (0,4 was in de tegenshots zwart)
      dj: ['patroon', 'tekst', 'beeld'], vloer: { tegel: 1.0, helder: 0.65 }, vloerKans: 0.15, zuil: { modi: ['patroon'], helder: 0.6 },
      strobo: 1.4, bundel: { breed: 0.55, wit: 0.45, n: 1.1 }, laser: 0.75, waas: 1.4, tempo: 1.15,
      onderdelen: { midden: { kooi: 3, ledtunnel: 1.5, kubus: 0.6 }, plafond: { truss: 2, scanners: 2, lasers: 1.6 }, muur: { speakers: 2.5, buizen: 2, neonwoorden: 1 },
        vloer: { ledtegels: 1 }, show: { stroboscoop: 3, blackout: 1.5, laserwaaiers: 1 } },
      cam: { tegen: 2, scherm: 1, vloer: 1, schouder: 1, kraan: 1, top: 0.5 }, held: ['tegen', 'vloer'],
      woorden: ['RAW', 'NO PHOTOS', 'BUNKER', 'TECHNO', 'AFTER HOURS', 'BLOODLINE', 'DEEPER', 'UNDERGROUND'],
      booth: 'kist', schok: 1, maten: 8, minShot: 3.4, energie: 0.85, blijf: 14, struct: [0x2a2a2e, 0x5a5a62],
      patronen: ['flits', 'wissel', 'trein', 'puls'], dropPatroon: 'flits',
      opstelling: { rijen: 3, verspreid: 2, kring: 0.6 }, rollen: { dans: 7, juich: 2, staan: 1.2 },
      bouw: { gewelf: 3, loods: 3, hal: 2, pit: 1.5, galerij: 1, grot: 0.3, tempel: 0.2, arena: 0.4 } },
    ibiza: { titel: 'witte Ibiza-club', fam: 'luxe',
      paletten: [[0xffa020, 0xff3a6a, 0x20d0ff], [0xffc030, 0xff5a10, 0x10b8ff], [0xff8a10, 0xffd040, 0xff2a8a]],  // zonsondergang: verzadigd (bleek goud/wit spoelde op de leds uit)
      schild: { chroom: 3, 'bass-tempel': 1.5 }, basis: 'marmer',
      muur: { modi: { beeld: 1.2, patroon: 1.4, golf: 0.3 }, helder: 0.6, pitch: 0.04 }, boven: { modi: ['patroon', 'golf'], helder: 0.45 }, plafond: { modi: { patroon: 1.5, beeld: 1, golf: 0.4 }, helder: 0.5 },
      dj: ['beeld', 'golf', 'tekst'], vloer: { tegel: 0.8, helder: 0.6 }, vloerKans: 0.25, zuil: { modi: ['patroon', 'beeld'], helder: 0.55 },
      strobo: 0.45, bundel: { breed: 1.8, wit: 0.25, n: 1 }, laser: 0.2, waas: 1.2, tempo: 0.75,
      onderdelen: { midden: { altaar: 2, ringen: 2, vinyl: 1 }, plafond: { peertjes: 2.5, spiegelbol: 1.5, truss: 0.6 }, muur: { schilderingen: 2, neonwoorden: 0.5 },
        vloer: { ledtegels: 2, golven: 1 }, show: { bundels: 2.5, looplicht: 1 } },
      cam: { plafond: 2, kraan: 2, baan: 1, scherm: 1.5, tegen: 1, top: 0.5 }, held: ['plafond', 'kraan', 'tegen'],
      woorden: ['IBIZA', 'SUNSET', 'BALEARIC', 'GOLDEN HOUR', 'SAMSONIGHT', 'PARADISE', 'ISLA BLANCA'],
      booth: 'plint', schok: 0.3, maten: 16, minShot: 5.2, energie: 0.6, blijf: 18, struct: [0x2a2420, 0xc8a050],
      patronen: ['adem', 'vonk', 'trein', 'radiaal'], dropPatroon: 'vonk',
      opstelling: { lounge: 2, rijen: 2, kring: 2, verspreid: 1 }, rollen: { dans: 6, juich: 2, staan: 2 },
      bouw: { tempel: 3, galerij: 3, arena: 2, hal: 2, pit: 1, gewelf: 1, loods: 0.3, grot: 0.2 } },
    jungle: { titel: 'junglerave', fam: 'organisch',
      paletten: [[0x7a1cff, 0x3dff4a, 0xc8ff1a], [0x5a10ff, 0x9dff1a, 0x00ffc0], [0xb020ff, 0x20ff70, 0x20d0ff]],
      schild: { 'uv-jungle': 3, paddenstoelen: 2.5, slijmhol: 1.2 }, basis: 'rots', trip: true,
      muur: { modi: ['beeld', 'golf'], helder: 0.85, pitch: 0.05 }, boven: null, plafond: null,
      dj: ['beeld', 'golf'], vloer: { tegel: 1.1, helder: 0.7 }, vloerKans: 0.35, zuil: { modi: ['beeld', 'golf'], helder: 0.75 },
      strobo: 0.8, bundel: { breed: 0.8, wit: 0, n: 1 }, laser: 0.85, waas: 1.6, tempo: 0.95,
      onderdelen: { midden: { altaar: 2, ringen: 1.2, kooi: 0.5 }, plafond: { lasers: 2, neonbuizen: 1.2, peertjes: 0.8 }, muur: { schilderingen: 2, pixelwand: 0.8 },
        vloer: { vloeibaar: 1.5, golven: 1 }, show: { laserwaaiers: 2, bundels: 1.5 } },
      cam: { scherm: 2, baan: 1.5, vloer: 1, kraan: 1, laag: 1 }, held: ['laag', 'tegen', 'baan'],
      woorden: ['JUNGLE', 'ROOTS', 'WILD', 'SPORE', 'BLOOM', 'MYCELIUM', 'GROW', 'JUNGLIST'],
      booth: 'rots', schok: 0.5, maten: 8, minShot: 4.4, energie: 0.75, blijf: 16, struct: [0x241c14, 0x4a3a28],
      patronen: ['radiaal', 'trein', 'adem', 'vonk'], dropPatroon: 'radiaal',
      opstelling: { kring: 2.5, verspreid: 2.5, rijen: 1 }, rollen: { dans: 7, juich: 2, staan: 1 },
      bouw: { grot: 3, tempel: 2.5, arena: 1.5, pit: 1, gewelf: 0.6, hal: 0.6, galerij: 0.5, loods: 0.4 } },
    scifi: { titel: 'sci-fi-club', fam: 'futuristisch',
      paletten: [[0x00e8ff, 0xd01aff, 0x2a40ff], [0x00ffd5, 0xa020ff, 0x00a0ff], [0x20c8ff, 0xe030ff, 0x7a30ff]],
      schild: { kosmos: 2.5, chroom: 2, neonsteeg: 1, arcade: 0.4 }, basis: 'paneel',
      muur: { modi: ['patroon', 'beeld', 'tekst'], helder: 0.7, pitch: 0.035 }, boven: { modi: ['patroon'], helder: 0.45 }, plafond: { modi: ['patroon', 'golf'], helder: 0.5 },
      dj: ['patroon', 'beeld', 'tekst', 'golf'], vloer: { tegel: 0.7, helder: 0.7 }, vloerKans: 0.45, zuil: { modi: ['patroon', 'tekst'], helder: 0.6 },
      strobo: 0.9, bundel: { breed: 0.5, wit: 0.15, n: 1.2 }, laser: 1, waas: 1.1, tempo: 1.05,
      onderdelen: { midden: { hologram: 3, kubus: 2, ledtunnel: 2 }, plafond: { scanners: 3, lasers: 1.5 }, muur: { pixelwand: 2.5, neonwoorden: 1 },
        vloer: { golven: 2, raster: 1, ledtegels: 0.6 }, show: { laserwaaiers: 2, looplicht: 2 } },
      cam: { scherm: 2, vloer: 1.5, baan: 1, top: 1, tegen: 1, kraan: 0.6 }, held: ['vloer', 'top', 'tegen'],
      woorden: ['SYSTEM ONLINE', '2099', 'HYPER', 'UPLOAD', 'GRID', 'CYBER', 'NEON GENESIS', 'SYNTH'],
      booth: 'zeshoek', schok: 0.5, maten: 8, minShot: 4, energie: 0.75, blijf: 15, struct: [0x2a3040, 0x8a96aa],
      patronen: ['scan', 'wissel', 'trein', 'radiaal'], dropPatroon: 'scan',
      opstelling: { rijen: 2.5, kring: 2.5, verspreid: 1 }, rollen: { dans: 6, juich: 2.5, staan: 1.2 },
      bouw: { arena: 3, hal: 2, gewelf: 2, pit: 2, loods: 1, galerij: 1, tempel: 0.5, grot: 0.3 } },
    disco: { titel: 'retrodisco', fam: 'luxe',
      paletten: [[0xff2e8a, 0xffb020, 0x2ec8ff], [0xff5020, 0xffe030, 0xc030ff], [0xff2050, 0x30ff90, 0xffa020]],
      schild: { chroom: 2, 'rave-flyers': 1.5, arcade: 1, kosmos: 0.8 }, basis: 'fluweel',
      muur: { modi: ['patroon', 'beeld'], helder: 0.6, pitch: 0.05 }, boven: null, plafond: null,
      dj: ['patroon', 'beeld', 'tekst'], vloer: { tegel: 0.9, helder: 0.75 }, vloerKans: 0.45, zuil: { modi: ['patroon'], helder: 0.6 },
      strobo: 0.6, bundel: { breed: 0.9, wit: 0.1, n: 1 }, laser: 0.35, waas: 1, tempo: 1,
      onderdelen: { midden: { vinyl: 3, ringen: 2, kubus: 0.5 }, plafond: { spiegelbol: 6, peertjes: 1 }, muur: { neonwoorden: 1.5, speakers: 1, schilderingen: 1 },
        vloer: { ledtegels: 3 }, show: { bundels: 2, looplicht: 2 } },
      cam: { top: 2, vloer: 2, baan: 1.5, scherm: 1, tegen: 1 }, held: ['top', 'vloer'],
      woorden: ['DISCO', 'STUDIO 54', 'BOOGIE', 'GROOVE', 'LOVE', 'FUNK', 'SATURDAY NIGHT'],
      booth: 'plint', schok: 0.35, maten: 8, minShot: 4.2, energie: 0.7, blijf: 16, struct: [0x241820, 0xc89a3a],
      patronen: ['regenboog', 'wissel', 'vonk', 'trein'], dropPatroon: 'regenboog',
      opstelling: { kring: 2, rijen: 2, verspreid: 1.5, lounge: 1 }, rollen: { dans: 8, juich: 2, staan: 1 },
      bouw: { arena: 3, pit: 3, hal: 2, galerij: 1.5, tempel: 0.6, gewelf: 0.6, loods: 0.5, grot: 0.2 } },
    onderwater: { titel: 'onderwaterclub', fam: 'trippy',
      paletten: [[0x00c8ff, 0x00ffb4, 0x2050ff], [0x00e0e0, 0x30a0ff, 0x60ffd0], [0x0090ff, 0x00ffd8, 0x8040ff]],
      schild: { kosmos: 2, slijmhol: 2, 'uv-jungle': 0.8, chroom: 0.8 }, basis: 'rots', trip: true,
      muur: { modi: ['golf', 'beeld'], helder: 0.8, pitch: 0.05 }, boven: { modi: ['golf'], helder: 0.55 }, plafond: { modi: ['golf', 'beeld'], helder: 0.6 },
      dj: ['golf', 'beeld'], vloer: { tegel: 1.2, helder: 0.6 }, vloerKans: 0.5, zuil: { modi: ['golf'], helder: 0.7 },
      strobo: 0.3, bundel: { breed: 1.4, wit: 0, n: 0.9 }, laser: 0.3, waas: 1.7, tempo: 0.55,
      onderdelen: { midden: { ringen: 2, hologram: 1, kubus: 1 }, plafond: { neonbuizen: 3, peertjes: 1 }, muur: { pixelwand: 1, schilderingen: 1.2 },
        vloer: { vloeibaar: 3, golven: 2 }, show: { bundels: 2.5 } },
      cam: { baan: 2, plafond: 2, scherm: 1.5, kraan: 1, vloer: 1 }, held: ['baan', 'plafond'],
      woorden: ['DEEP', 'ABYSS', 'DIVE', 'TIDE', 'BLUE', 'ATLANTIS', 'PRESSURE', 'DEEPER'],
      booth: 'rond', schok: 0.25, maten: 16, minShot: 5.4, energie: 0.55, blijf: 18, struct: [0x10202a, 0x2a6070],
      patronen: ['adem', 'radiaal', 'trein', 'adem'], dropPatroon: 'radiaal',
      opstelling: { kring: 2.5, verspreid: 2, rijen: 1 }, rollen: { dans: 6, juich: 1.5, staan: 2 },
      bouw: { grot: 2.5, arena: 2.5, gewelf: 2, pit: 1.5, tempel: 1, hal: 1, galerij: 0.6, loods: 0.3 } },
    hel: { titel: 'lavahel', fam: 'rauw',
      paletten: [[0xff2200, 0xff8c00, 0xffd000], [0xff0030, 0xff6a00, 0xff3000], [0xff3a00, 0xffb000, 0xb00010]],
      schild: { 'bass-tempel': 2, 'beton-bunker': 1.5, paddenstoelen: 1, slijmhol: 1 }, basis: 'rots',
      muur: { modi: ['patroon', 'golf', 'beeld'], helder: 0.7, pitch: 0.05 }, boven: null, plafond: null,
      dj: ['patroon', 'golf', 'tekst'], vloer: { tegel: 1.0, helder: 0.9 }, vloerKans: 0.75, zuil: { modi: ['golf', 'patroon'], helder: 0.7 },
      strobo: 1.1, bundel: { breed: 0.75, wit: 0.2, n: 1 }, laser: 0.6, waas: 1.5, tempo: 1,
      onderdelen: { midden: { altaar: 4, kooi: 2 }, plafond: { truss: 1, lasers: 1 }, muur: { buizen: 2, speakers: 1 },
        vloer: { vloeibaar: 5 }, show: { stroboscoop: 2, blackout: 1, bundels: 1 } },
      cam: { vloer: 2, tegen: 2, laag: 1, kraan: 1, scherm: 1 }, held: ['tegen', 'vloer'],
      woorden: ['INFERNO', 'HELL', '666', 'BURN', 'FIRE', 'HEAT', 'LAVA', 'DEVIL'],
      booth: 'kist', schok: 0.8, maten: 8, minShot: 3.8, energie: 0.85, blijf: 14, struct: [0x1a0c08, 0x4a2010],
      patronen: ['vonk', 'radiaal', 'flits', 'trein'], dropPatroon: 'flits',
      opstelling: { kring: 2, rijen: 2, verspreid: 1.5 }, rollen: { dans: 7, juich: 2.5, staan: 1 },
      bouw: { pit: 3, grot: 2.5, tempel: 2, loods: 1.5, gewelf: 1, hal: 1, arena: 0.6, galerij: 0.4 } },
    arcade: { titel: 'arcadehal', fam: 'futuristisch',
      paletten: [[0xff20d0, 0x20f0ff, 0xffe020], [0xff3080, 0x30ff60, 0x4060ff], [0xb030ff, 0xff8020, 0x20ffe0]],
      schild: { arcade: 3, neonsteeg: 2, 'rave-flyers': 1.5 }, basis: 'paneel',
      muur: { modi: ['beeld', 'tekst', 'patroon'], helder: 0.75, pitch: 0.1 }, boven: { modi: ['patroon', 'tekst'], helder: 0.5, pitch: 0.1 }, plafond: null,
      dj: ['beeld', 'tekst', 'patroon'], vloer: { tegel: 0.6, helder: 0.85 }, vloerKans: 0.6, zuil: { modi: ['patroon', 'tekst'], helder: 0.6, pitch: 0.1 },
      strobo: 0.8, bundel: { breed: 0.7, wit: 0.1, n: 1 }, laser: 0.7, waas: 0.8, tempo: 1.1,
      onderdelen: { midden: { kubus: 2, ledtunnel: 1.5, ringen: 1 }, plafond: { neonbuizen: 1.5, scanners: 1, lasers: 1 }, muur: { neonwoorden: 2, pixelwand: 2 },
        vloer: { raster: 3, ledtegels: 1.5 }, show: { looplicht: 2.5, laserwaaiers: 1 } },
      cam: { vloer: 2, scherm: 2, top: 1, schouder: 1, tegen: 1 }, held: ['vloer', 'scherm'],
      woorden: ['GAME OVER', 'PLAYER 1', 'INSERT COIN', 'HIGH SCORE', 'LEVEL UP', '1UP', 'PRESS START'],
      booth: 'zeshoek', schok: 0.6, maten: 8, minShot: 3.8, energie: 0.8, blijf: 15, struct: [0x1a1030, 0x6040a0],
      patronen: ['wissel', 'scan', 'trein', 'flits'], dropPatroon: 'wissel',
      opstelling: { rijen: 2.5, verspreid: 2, kring: 1 }, rollen: { dans: 6, juich: 3, staan: 1.5 },
      bouw: { hal: 3, loods: 2, pit: 2, galerij: 1.5, gewelf: 1.5, arena: 1, tempel: 0.4, grot: 0.2 } },
  };
  const SFEER = CLUB;  // oude naam (testronde)

  // --- geheugen tussen kamers: niet twee keer achter elkaar hetzelfde; clubDeck = het kaartspel van de rotatie ---
  const GEHEUGEN = { sfeer: [], club: [], clubDeck: [], schild: [], tint: [], woord: [], onderdeel: {} };
  const geladen = new Set();  // welke schilderingen al op de gpu staan (op de tv niet allemaal tegelijk)

  function kiesClub(r, arch) {
    const wens = DH.stijl && DH.stijl.volgendeClub;
    if (wens && CLUB[wens]) { DH.stijl.volgendeClub = null; onthoud(GEHEUGEN.club, wens, 3); return wens; }
    const D = GEHEUGEN.clubDeck;
    if (D.length < 2) { const nieuw = schud(r, Object.keys(CLUB).filter(c => !D.includes(c))); if (nieuw[0] === GEHEUGEN.club[0] && nieuw.length > 1) nieuw.push(nieuw.shift()); D.push(...nieuw); }
    // de eerste uit het spel, tenzij hij slecht bij de architectuur past: dan een van de volgende drie die beter past
    let best = 0, bg = -1;
    for (let i = 0; i < Math.min(4, D.length); i++) {
      const fit = CLUB[D[i]].bouw[arch] || 0.2, g = (fit >= 1 ? 2 + fit : fit) * (i === 0 ? 1.6 : 1) * (GEHEUGEN.club[0] === D[i] ? 0.01 : 1);
      if (g > bg) { bg = g; best = i; }
    }
    const c = D.splice(best, 1)[0];
    onthoud(GEHEUGEN.club, c, 3);
    return c;
  }
  function kiesSchild(r, club, Z) {
    const tabel = CLUB[club].schild;
    const opTv = Z === 2 && geladen.size >= 6 && Object.keys(tabel).some(n => geladen.has(n));
    const naam = kiesUit(r, tabel, n => (opTv && !geladen.has(n) ? 0 : 1) * (GEHEUGEN.schild[0] === n ? 0.08 : GEHEUGEN.schild[1] === n ? 0.4 : 1));
    geladen.add(naam);
    return naam;
  }
  // palet van de club: een van zijn vaste combinaties (niet dezelfde als de vorige keer), tint een fractie verschoven; donker = bijna
  // zwart in de tint van a. Wit mag hier (bunker rood/wit, Ibiza wit/goud): dat zijn de kleuren van die club.
  function maakPalet(r, club) {
    const C = CLUB[club], keus = C.paletten.map((p, i) => i).filter(i => GEHEUGEN.tint[0] !== club + i);
    const i = kies(r, keus.length ? keus : [0]), [ka, kb, kc] = C.paletten[i];
    const schuif = c => { const k = new THREE.Color(c); k.getHSL(HSL); if (HSL.s > 0.3) k.setHSL(frac(HSL.h + tussen(r, -0.012, 0.012)), HSL.s, HSL.l); return k; };
    const a = schuif(ka), b = schuif(kb), c = schuif(kc);
    a.getHSL(HSL); const ha = HSL.h; b.getHSL(HSL); const hb = HSL.h;
    const donker = new THREE.Color().setHSL(ha, 0.6, 0.035);
    onthoud(GEHEUGEN.tint, club + i, 3);
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
    const pos = [], uv = [], omS = [], tw = opt.tegel || 0, n = omtrek.length;  // omS = plek langs de omtrek (uplighters van showMat)
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
          for (const k of [0, 1, 2, 0, 2, 3]) { pos.push(P[k][0], P[k][1], P[k][2]); uv.push(U[k][0], U[k][1]); omS.push(k === 1 || k === 2 ? sB : sA); }
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('aS', new THREE.Float32BufferAttribute(omS, 1));
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

  // --- showMat: muren, vloer, plafond en het vaste spul zijn zwart en lichten alleen op waar de show ze raakt ---
  // licht = basis (bijna niets) + NL lichtvlekken (gauss rond een punt: bundel raakt hier, spill van het scherm, tegenlicht achter
  // de dj) + uplighters langs de wanden (WAND: elke uWasStap m een kegel van onderen, kleur a/b om en om, aan/wissel/looplicht)
  // + stroboscoopflits (wit). Kamer-coördinaten: de meshes hangen zonder transformatie in de kamergroep. Eén bron, defines per soort.
  const NL_Z = [8, 6, 4];
  const VS_SHOW = `varying vec2 vUv; varying vec3 vP; varying vec3 vN; varying vec3 vK;
#ifdef WAND
attribute float aS; varying float vS;
#endif
void main() {
  vUv = uv; vP = position; vN = normal; vK = vec3(1.0);
#ifdef WAND
  vS = aS;
#endif
#ifdef USE_COLOR
  vK = color;
#endif
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
  const FS_SHOW = `uniform sampler2D map; uniform vec3 uKleur; uniform float uBasis, uFlits, uEmis;
uniform vec4 uLp[NL]; uniform vec3 uLk[NL];
uniform vec3 uWasA, uWasB; uniform float uWasStap, uWasH, uWasAlle, uWasWis, uWasLoop, uWasFase, uWasN, uWasTel;
varying vec2 vUv; varying vec3 vP; varying vec3 vN; varying vec3 vK;
#ifdef WAND
varying float vS;
#endif
void main() {
#ifdef MAP
  vec3 t = texture2D(map, vUv).rgb;
#else
  vec3 t = vec3(1.0);
#endif
  t *= uKleur * vK;
  vec3 l = vec3(uBasis + uFlits);
  for (int i = 0; i < NL; i++) {
    vec3 d = vP - uLp[i].xyz;
    float g = exp(-dot(d, d) / (uLp[i].w * uLp[i].w));
#ifdef USE_COLOR
    g *= 0.35 + 0.65 * max(dot(normalize(vN), -d) / max(length(d), 0.001), 0.0);  // vast spul: de kant naar het licht toe
#endif
    l += uLk[i] * g;
  }
#ifdef WAND
  float si = floor(vS / uWasStap), dx = (fract(vS / uWasStap) - 0.5) * uWasStap, y = max(vP.y, 0.0), br = 0.2 + 0.36 * y;
  float kegel = exp(-dx * dx / (br * br)) * exp(-y / uWasH) * smoothstep(0.0, 0.25, y + 0.05);
  float wis = mod(si + uWasTel, 2.0) < 1.0 ? 1.0 : 0.1;
  float lp = exp(-mod(uWasFase - si, uWasN) * 0.9);
  l += (mod(si, 2.0) < 1.0 ? uWasA : uWasB) * kegel * (uWasAlle + uWasWis * wis + uWasLoop * lp);
#endif
  gl_FragColor = vec4(t * l + t * uEmis, 1.0);
}`;
  // gedeelde uniforms van één kamer (alle showMats verwijzen naar dezelfde objecten: één keer per beeld bijwerken)
  function maakShowU(B) {
    const n = NL_Z[B.Z], lp = [], lk = [];
    for (let i = 0; i < n; i++) { lp.push(new THREE.Vector4(0, -50, 0, 1)); lk.push(new THREE.Color(0, 0, 0)); }
    B.NL = n;
    return { uBasis: { value: 0.03 }, uFlits: { value: 0 }, uLp: { value: lp }, uLk: { value: lk },
      uWasA: { value: new THREE.Color() }, uWasB: { value: new THREE.Color() }, uWasStap: { value: 2.6 }, uWasH: { value: 2 }, uWasAlle: { value: 0 },
      uWasWis: { value: 0 }, uWasLoop: { value: 0 }, uWasFase: { value: 0 }, uWasN: { value: 6 }, uWasTel: { value: 0 } };
  }
  function showMat(B, o) {
    const u = Object.assign({}, B.U, { map: { value: o.map || null }, uKleur: { value: (o.kleur || WIT).clone() }, uEmis: { value: 0 } });
    const defines = { NL: B.NL };
    if (o.map) defines.MAP = 1;
    if (o.wand) defines.WAND = 1;
    const m = new THREE.ShaderMaterial({ uniforms: u, defines, vertexShader: VS_SHOW, fragmentShader: FS_SHOW, side: o.side == null ? THREE.DoubleSide : o.side, vertexColors: !!o.vkleur });
    m.kleur = u.uKleur.value; m.emis = u.uEmis;
    return m;
  }

  // --- bouwcontext per kamer: de oppervlakken. Geen stilstaand vlak meer: alles is een bewegend ledscherm (DH.ledHulp = doolhof/led.js,
  // of zolang die er niet is de eigen versie in onderdelen.js) of donker (showMat: zwart, licht alleen waar de show het raakt).
  // muur = schermpanelen met de muurschildering als beeld (één paneel per schilderingbreedte, om en om gespiegeld); boven = één band
  // rondom; plafond = één groot scherm over de omhullende rechthoek; rand/zuil/container = kleinere schermen. De vloer en alle
  // podiumvlakken komen samen in één ledvloer (B.vloerDelen, zie bouwVloer). Wat de club donker laat (boven/plafond null) blijft showMat.
  const metBeeld = modi => (Array.isArray(modi) ? modi.includes('beeld') : !!(modi && modi.beeld));  // modi = lijst of gewichten
  const zetDubbel = m => { if (m && m.side !== THREE.DoubleSide && !(m.userData && m.userData.doolhofHouden)) { m.side = THREE.DoubleSide; m.needsUpdate = true; } return m; };
  function materialen(B) {
    const { P, C, r, Z } = B, LH = DH.ledHulp, pal = { a: P.a, b: P.b, c: P.c, donker: P.donker };
    const zaad = B.zaad = Math.floor(r() * 100000), cache = {};
    const bMap = doek(C.basis || 'beton'), basisKleur = P.donker.clone().multiplyScalar(8).lerp(new THREE.Color(0.4, 0.4, 0.4), 0.4);
    const basis = showMat(B, { map: bMap, kleur: basisKleur }), basisWand = showMat(B, { map: bMap, kleur: basisKleur, wand: true });
    const led = (sleutel, o) => {
      if (cache[sleutel]) return cache[sleutel];
      let m = null;
      if (LH) try { m = zetDubbel(LH.scherm(Object.assign({ palet: pal, zaad, pitch: C.muur.pitch || 0.05, zijde: THREE.DoubleSide, mix: B.ledMix }, o), Z)); } catch (e) { console.error('doolhof stijl: ledscherm ' + sleutel, e); }
      return (cache[sleutel] = m || basis);
    };
    if (!LH) console.error('doolhof stijl: DH.ledHulp ontbreekt (onderdelen.js niet geladen): donkere vlakken');
    const drukte = SCHILD[B.schild] ? SCHILD[B.schild].drukte : 0.6;
    return {
      basis, basisWand, basisTegel: 4, vloerTegel: (C.vloer && C.vloer.tegel) || 0.9, vast: showMat(B, { vkleur: true }),
      muur: (tw, hm) => led('muur', { bron: B.schild, maat: { w: tw, h: hm }, modi: C.muur.modi, helder: C.muur.helder * (drukte > 0.8 ? 0.85 : 1) }),
      boven: (lengte, h) => (C.boven ? led('boven', { bron: null, maat: { w: lengte, h }, modi: C.boven.modi, helder: C.boven.helder, pitch: C.boven.pitch || C.muur.pitch, zaad: zaad + 11 }) : basisWand),
      plafond: (w, d) => (C.plafond ? led('plafond', { bron: metBeeld(C.plafond.modi) ? B.schild : null, maat: { w, h: d }, modi: C.plafond.modi, helder: C.plafond.helder,
        pitch: Math.max(0.05, C.muur.pitch || 0.05), zaad: zaad + 23 }) : basis),
      rand: (lengte, h) => led('rand', { bron: null, maat: { w: lengte, h }, modi: ['patroon', 'golf'], helder: 0.7, zaad: zaad + 37 }),
      zuil: (omtrek, h) => led('zuil', { bron: metBeeld(C.zuil.modi) ? B.schild : null, maat: { w: omtrek, h }, modi: C.zuil.modi, helder: C.zuil.helder, pitch: C.zuil.pitch || 0.05, zaad: zaad + 51 }),
      container: () => led('container', { bron: B.schild, maat: { w: 6, h: 2.6 }, modi: ['beeld', 'patroon', 'tekst'], helder: 0.65, pitch: 0.06, zaad: zaad + 67 }),
      ledPlafond: !!C.plafond, ledBoven: !!C.boven,
    };
  }
  const vlak = (m, naam) => { m.userData.vlak = naam; return m; };  // label voor de testronde (bewegingsmaat per vlak)
  // uv over de omhullende rechthoek in x/z (plafonds, koepels, daken: één groot scherm); u = 1 - x: van onderen gezien met de blik
  // naar de uitgang (+z) leesbaar
  function uvXZ(geo) {
    geo.computeBoundingBox();
    const bb = geo.boundingBox, w = Math.max(1e-3, bb.max.x - bb.min.x), d = Math.max(1e-3, bb.max.z - bb.min.z), p = geo.attributes.position, n = p.count, uv = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { uv[i * 2] = 1 - (p.getX(i) - bb.min.x) / w; uv[i * 2 + 1] = (p.getZ(i) - bb.min.z) / d; }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return { geo, w, d };
  }
  // vloerdelen (naar boven gericht, kamercoördinaten) samenvoegen tot één geometrie
  function voegSamen(delen) {
    let n = 0; const plat = delen.map(g => (g.index ? g.toNonIndexed() : g));
    for (const g of plat) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    let o = 0;
    for (let i = 0; i < n; i++) nor[i * 3 + 1] = 1;
    for (const g of plat) {
      const c = g.attributes.position.count;
      pos.set(g.attributes.position.array, o * 3);
      if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
      o += c;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return g;
  }
  // vlak stuk vloer (podium, trede, verhoging) op hoogte y: geo plat in xy (PlaneGeometry/CircleGeometry), midden (x, z), draai ry
  function vloerStuk(B, geo, x, y, z, ry) { B.vloerDelen.push(geo.applyMatrix4(new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(-Math.PI / 2, ry || 0, 0, 'YXZ')), _s.set(1, 1, 1)))); }
  function bouwVloer(B, A) {
    if (!B.vloerDelen.length) return null;
    const LH = DH.ledHulp, C = B.C, geo = voegSamen(B.vloerDelen), recht = B.vloerDelen.length === 1 && A.vorm !== 'rond' && A.vorm !== 'grot' && A.vorm !== 'pit';
    let m = null;
    if (LH) try { m = LH.vloer(geo, { palet: { a: B.P.a, b: B.P.b, c: B.P.c, donker: B.P.donker }, tegel: B.M.vloerTegel, zaad: B.zaad + 5, helder: C.vloer.helder, recht, mix: B.ledMix }, B.Z); } catch (e) { console.error('doolhof stijl: ledvloer', e); }
    if (!m) m = new THREE.Mesh(geo, B.M.basis);
    B.G.add(vlak(m, 'vloer'));
    return m;
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
            let k = it.kl === 2 ? L.kl[2] : it.kl === 1 ? L.kl[1] : L.kl[0];  // kleuren draaien per maat (L.kl)
            if (L.patroon === 'regenboog') k = _c.setHSL(frac(P.ha + it.fase * 0.6 + it.ring * 0.3 + b.pos / 32), 1, 0.5);
            _c.copy(k).multiplyScalar(v * L.k * 1.3);  // fel genoeg voor de bloom; in de break ademt het zacht
            if (L.flits > 0) _c.lerp(WIT, L.flits * 0.6);
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

  // lichtregie van de kamer: stand, niveau (k), gewichten per stand (w*), kleuren (kl[0..2]), stroboscoopflits en looplicht-fase.
  // Bron: de show-bus van de kern (zelfde dynamiek als de gangen); zonder bus rekenen we het zelf uit clubRegie.
  function maakLicht(B) {
    const S = B.S, P = B.P, C = B.C;
    const L = { k: 0.6, kBasis: 0.6, flits: 0, opb: 0, drp: 0, zwart: 0, wBrk: 0, wOpb: 0, wDrop: 0, wGroove: 1, snel: 1, loop: 0, vorigePos: null, stand: null,
      patroon: S.patronen[0], wissel: false, strobo: -1, dropKleur: false, dropStart: false, sindsDrop: 99, tel: 0, fr: 0, nieuweTel: false, rot: 0,
      kl: [P.a.clone(), P.b.clone(), P.c.clone()], dimF: 1 };
    const eigen = { dim: 0, flits: 0 }, bus = B.G.userData.dhBus;  // ons slot op de bus: de onderdelen dimmen en flitsen met ons mee
    if (bus && bus.shows) bus.shows.push(eigen);
    L.stap = (dt, b) => {
      const reg = regie(), sh = showBus(), st = (sh && sh.stand) || reg.stand || 'groove';
      L.dropStart = false;
      if (st !== L.stand) { if (st === 'drop' && L.stand !== null) L.dropStart = true; L.stand = st; }
      const tel = Math.floor(b.pos); L.nieuweTel = tel !== L.tel; L.tel = tel; L.fr = b.pos - tel;
      L.sindsDrop = b.pos - (reg.dropBeat >= 0 ? reg.dropBeat : -99);
      L.opb = sh ? sh.opbouw : st === 'opbouw' ? klem((reg.opbouwTel || 0) / 16) : 0;
      L.drp = sh ? sh.drop : st === 'drop' ? Math.pow(1 - klem(L.sindsDrop / 16), 2) : 0;
      L.zwart = sh ? sh.blackout : st === 'break' ? 0.8 : st === 'opbouw' ? 0.8 * (1 - L.opb) : 0;
      // zachte gewichten per stand (de drop komt hard binnen)
      const kz = Math.min(1, dt * 3);
      L.wBrk += ((st === 'break' ? 1 : 0) - L.wBrk) * kz; L.wOpb += ((st === 'opbouw' ? 1 : 0) - L.wOpb) * kz;
      L.wDrop += ((st === 'drop' ? 1 : 0) - L.wDrop) * (st === 'drop' ? Math.min(1, dt * 14) : kz);
      if (st === 'drop') { L.wBrk *= 1 - Math.min(1, dt * 14); L.wOpb *= 1 - Math.min(1, dt * 14); }
      L.wGroove = klem(1 - L.wBrk - L.wOpb - L.wDrop);
      const doel = st === 'break' ? 0.14 : st === 'opbouw' ? 0.4 + 0.6 * L.opb : st === 'drop' ? 1.0 + 0.25 * L.drp : 0.62 + 0.3 * (b.energy || 0);
      L.kBasis += (doel - L.kBasis) * Math.min(1, dt * (st === 'drop' ? 14 : 1.6));
      let dim = 0, fl = 0;  // shows van onderdelen.js zetten dim (blackout) en flits (stroboscoop) op de bus
      if (bus && bus.shows) for (const s of bus.shows) if (s !== eigen) { if (s.dim > dim) dim = s.dim; if (s.flits > fl) fl = s.flits; }
      L.dimF = 1 - 0.7 * klem(dim); L.k = L.kBasis * L.dimF;
      // stroboscoop: alleen op de tel (opbouw steeds sneller, salvo op de drop), nooit in de break, nooit met de strobe uit
      let f = 0;
      if (sh) f = sh.flits;
      else if (!strobeUit()) {
        if (st === 'opbouw' && L.opb > 0.5) { const n = L.opb < 0.75 ? 1 : L.opb < 0.9 ? 2 : 4; if ((b.pos * n) % 1 < 0.25) f = 0.3 + 0.7 * L.opb; }
        else if (st === 'drop' && L.sindsDrop >= 0) { if (L.sindsDrop < 1.5) f = (b.pos * 4) % 1 < 0.3 ? 1 : 0; else if (L.sindsDrop < 6 && L.fr < 0.15) f = 0.8; }
      }
      if (st === 'opbouw') f *= 0.3 + 0.7 * L.opb * L.opb;  // opbouw: de strobe-aanloop wordt pas aan het eind echt fel
      f = Math.min(1.25, f * (C.strobo == null ? 1 : C.strobo));  // bunker hard wit, onderwater nauwelijks
      L.flits = Math.max(f, klem(fl), 0);
      eigen.flits = f * 0.7; eigen.dim = 0.35 * L.wBrk;
      L.snel = (st === 'opbouw' ? 1 + 3 * L.opb : st === 'drop' ? 2 : st === 'break' ? 0.4 : 1) * (C.tempo || 1);
      L.loop += klem(L.vorigePos == null ? 0 : b.pos - L.vorigePos, 0, 2) * L.snel; L.vorigePos = b.pos;  // looplicht-fase: versnelt zonder te springen
      L.dropKleur = st === 'drop' && L.sindsDrop < 8;
      if (st === 'break') L.patroon = 'adem';
      else if (st === 'opbouw') L.patroon = 'trein';
      else if (st === 'drop') L.patroon = L.sindsDrop < 8 ? 'puls' : S.dropPatroon;
      else { const fr = Math.floor(b.pos / 16), n = S.patronen.length; L.patroon = S.patronen[((fr % n) + n) % n]; }  // groove: elke 16 tellen een ander patroon
      // kleuren: altijd die van de club (zijn identiteit), de rollen draaien: break per 2 maten, groove per maat, opbouw per maat >
      // 2 tellen > elke tel, drop elke tel (alle drie om de beurt)
      {
        const stap = st === 'opbouw' ? (L.opb < 0.5 ? 4 : L.opb < 0.75 ? 2 : 1) : st === 'drop' ? 1 : st === 'break' ? 8 : 4;
        L.rot = Math.floor(b.pos / stap);
        const pk = [P.a, P.b, P.c];
        if (st === 'groove' || st === 'break' || (st === 'opbouw' && L.opb < 0.5)) { const r0 = ((L.rot % 2) + 2) % 2; L.kl[0].copy(pk[r0]); L.kl[1].copy(pk[1 - r0]); L.kl[2].copy(pk[2]); }
        else { const q = ((L.rot % 3) + 3) % 3; L.kl[0].copy(pk[q]); L.kl[1].copy(pk[(q + 1) % 3]); L.kl[2].copy(pk[(q + 2) % 3]); }
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
    B.updates.push((dt, now, b, L) => {  // silhouet met een rand van tegenlicht in de kleuren van nu, vanaf de lamp achter de dj
      h.zet({ a: L.kl[0], b: L.kl[1], helder: 0.16 + 0.42 * Math.min(1, L.k), flits: L.flits * (L.stand === 'opbouw' ? 0.25 : 0.45), rand: 0.55 + 0.6 * Math.min(1, L.k), armen: L.dropKleur ? 1 : 0 });
      if (B.tegenLicht) h.licht.copy(B.tegenLicht);
    });
  }

  // --- licht- en showlagen ---
  // lichtvlekken: elke laag meldt per beeld waar zijn licht valt (bundel raakt de vloer of een wand, scherm-spill, tegenlicht);
  // de vaste en daarna de felste gaan naar showMat (uLp/uLk). Geen nieuwe objecten per beeld.
  function maakVlekken(B) {
    const U = B.U, lp = U.uLp.value, lk = U.uLk.value, NL = lp.length, pool = [];
    for (let i = 0; i < 48; i++) pool.push({ x: 0, y: 0, z: 0, r: 1, kl: new THREE.Color(), v: 0, vast: false, bij: false });
    let n = 0;
    const slot = (s, o) => { lp[s].set(o.x, o.y, o.z, o.r); lk[s].copy(o.kl).multiplyScalar(o.v); };
    return {
      begin() { n = 0; },
      zet(x, y, z, r, kl, v, vast) { if (n >= pool.length || !(v > 0.004)) return; const o = pool[n++]; o.x = x; o.y = y; o.z = z; o.r = Math.max(0.25, r); o.kl.copy(kl); o.v = v; o.vast = !!vast; },
      klaar() {
        let s = 0;
        for (let i = 0; i < n; i++) { const o = pool[i]; o.bij = false; if (o.vast && s < NL) { slot(s++, o); o.bij = true; } }
        while (s < NL) {
          let best = -1, bv = 0;
          for (let i = 0; i < n; i++) { const o = pool[i]; if (!o.bij && o.v > bv) { bv = o.v; best = i; } }
          if (best < 0) break;
          pool[best].bij = true; slot(s++, pool[best]);
        }
        for (; s < NL; s++) { lp[s].set(0, -50, 0, 1); lk[s].setRGB(0, 0, 0); }
      },
    };
  }
  // lengte van een straal vanuit p in richting d tot de binnenkant van de kamer (doos, plafond op het eindpunt, ronde/grillige omtrek)
  function raakLengte(A, p, d) {
    let t = 40;
    const hw = A.w / 2 - 0.05, hd = A.d / 2 - 0.05;
    if (d.x > 1e-4) t = Math.min(t, (hw - p.x) / d.x); else if (d.x < -1e-4) t = Math.min(t, (-hw - p.x) / d.x);
    if (d.z > 1e-4) t = Math.min(t, (hd - p.z) / d.z); else if (d.z < -1e-4) t = Math.min(t, (-hd - p.z) / d.z);
    if (d.y < -1e-4) for (let k = 0; k < 2; k++) { const y0 = A.vloerOp ? A.vloerOp(p.x + d.x * t, p.z + d.z * t) : 0; if (p.y + d.y * t < y0) t = (y0 - p.y) / d.y; else break; }
    if (d.y > 1e-4) for (let k = 0; k < 3; k++) { const H = A.plafondOp(p.x + d.x * t, p.z + d.z * t) - 0.05; if (p.y + d.y * t > H) t = Math.max(0.2, (H - p.y) / d.y); else break; }
    if (A.vorm === 'rond' || A.vorm === 'grot') for (let k = 0; k < 14 && t > 0.4 && !A.binnenVoet(p.x + d.x * t, p.z + d.z * t, -0.1); k++) t *= 0.9;
    return Math.max(0.2, t);
  }

  // de rig: bewegende koppen. 'tegen' = achter/bij de dj, naar het publiek en omhoog (tegenlicht: het publiek als silhouet ertegen);
  // 'plafond' = boven de vloer, naar beneden. Kegels met een zachte rand die van de lamp naar het eind uitdooft, door rookwaas
  // (ruis in de shader); lenzen als gloed die alleen recht in de bundel fel is. Eén InstancedMesh voor de bundels, één voor de lenzen.
  const VS_BUNDEL = `varying float vT; varying float vF; varying vec3 vC; varying vec3 vH;
void main() {
  vec4 lp = vec4(position, 1.0); vec3 n = normal; vC = vec3(1.0);
#ifdef USE_INSTANCING
  lp = instanceMatrix * lp;
  mat3 im = mat3(instanceMatrix);
  n = im * (n / vec3(dot(im[0], im[0]), dot(im[1], im[1]), dot(im[2], im[2])));
#endif
#ifdef USE_INSTANCING_COLOR
  vC = instanceColor;
#endif
  vH = lp.xyz; vT = uv.y;
  vec4 mv = modelViewMatrix * lp;
  vF = abs(dot(normalize(normalMatrix * n), normalize(-mv.xyz))) * smoothstep(0.5, 2.6, length(mv.xyz));  // vlak voor de lens: weg
  gl_Position = projectionMatrix * mv;
}`;
  const FS_BUNDEL = `uniform float uT, uOp; varying float vT; varying float vF; varying vec3 vC; varying vec3 vH;
void main() {
  float rand = pow(vF, 2.6);  // smalle felle kern, zachte rand
  float lang = 0.22 + 0.78 * pow(vT, 1.3);
  float waas = 0.6 + 0.26 * sin(vH.x * 0.9 + uT * 0.31) * sin(vH.y * 1.3 - uT * 0.23) + 0.14 * sin(vH.z * 2.1 + vH.x * 0.7 + uT * 0.5);
  gl_FragColor = vec4(vC * rand * lang * waas * uOp, 1.0);
}`;
  // laserlijnen: vaste kleur per exemplaar, vlak voor de camera weg (anders een witte balk over het beeld)
  const VS_LASER = `uniform vec2 uFade; varying vec3 vC; varying float vNabij;
void main() {
  vec4 lp = vec4(position, 1.0); vC = vec3(1.0);
#ifdef USE_INSTANCING
  lp = instanceMatrix * lp;
#endif
#ifdef USE_INSTANCING_COLOR
  vC = instanceColor;
#endif
  vec4 mv = modelViewMatrix * lp;
  vNabij = smoothstep(uFade.x, uFade.y, length(mv.xyz));
  gl_Position = projectionMatrix * mv;
}`;
  const FS_LASER = `uniform float uMul; varying vec3 vC; varying float vNabij; void main() { gl_FragColor = vec4(vC * vNabij * uMul, 1.0); }`;
  const laserMat = (mul, f0, f1) => new THREE.ShaderMaterial({ uniforms: { uMul: { value: mul }, uFade: { value: new THREE.Vector2(f0, f1) } }, vertexShader: VS_LASER, fragmentShader: FS_LASER, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  function maakRig(B, bronnen) {
    const Z = B.Z, A = B.A, r = B.r;
    const tegen = bronnen.filter(q => q.soort === 'tegen').slice(0, [8, 6, 3][Z]), plaf = bronnen.filter(q => q.soort !== 'tegen').slice(0, [8, 5, 3][Z]);
    const lijst = tegen.concat(plaf), n = lijst.length;
    if (!n) return;
    const bBreed = (B.C.bundel && B.C.bundel.breed) || 1, bWit = (B.C.bundel && B.C.bundel.wit) || 0;
    const dj = B.dj, djV = V(dj.x, (dj.y || 0), dj.z);
    let spot = -1, sd = 1e9;  // break: de plafondkop het dichtst bij de dj wordt de spot op de dj
    lijst.forEach((q, i) => {
      q.i = i; q.ph = r() * RONDE; q.zwaai = q.zwaai || 1.4; q.kl = q.kl == null ? i % 2 : q.kl;
      q.dir = q.soort === 'tegen' ? q.fw.clone().setY(0.5).normalize() : V(0, -1, 0);
      q.rt = q.fw ? V(q.fw.z, 0, -q.fw.x) : null;
      if (q.soort !== 'tegen') { const dd = Math.hypot(q.p.x - dj.x, q.p.z - dj.z); if (dd < sd) { sd = dd; spot = i; } }
      // behuizing (statisch, donker)
      B.vast.push([VORM.doos, mat4(q.p.x, q.p.y + (q.soort === 'tegen' ? -0.12 : 0.14), q.p.z, 0.26, 0.24, 0.26), 0x0c0c0e]);
    });
    // uOp: zonder bloom (tv) wat feller. (Hier stond fragmentShader per ongeluk achter het commentaar: three tekende de bundels
    // dan met zijn standaardshader, effen rood: de 'rode bundels' van de vorige ronde.)
    const bm = new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uOp: { value: 0.7 * [1, 1.1, 1.35][Z] } }, vertexShader: VS_BUNDEL, fragmentShader: FS_BUNDEL,
      side: THREE.DoubleSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.InstancedMesh(VORM.bundel, bm, n); mesh.frustumCulled = false; mesh.renderOrder = 2; B.G.add(mesh);
    const lens = new THREE.InstancedMesh(VORM.schijf, new THREE.MeshBasicMaterial({ map: doek('gloed'), color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), n);
    lens.frustumCulled = false; lens.renderOrder = 3; B.G.add(lens);
    for (let i = 0; i < n; i++) { mesh.setColorAt(i, _c.setRGB(0, 0, 0)); lens.setColorAt(i, _c); }  // three r128: kleuren vóór het eerste tekenen
    const M4 = new THREE.Matrix4(), SS = new THREE.Vector3(), Q = new THREE.Quaternion(), T = new THREE.Vector3(), W = new THREE.Vector3(), E = new THREE.Vector3(), kk = new THREE.Color();
    let t = 0;
    B.updates.push((dt, now, b, L) => {
      const st = L.stand;
      t += dt * L.snel; bm.uniforms.uT.value = now % 3600;
      for (const q of lijst) {
        let v = 0, breed = 0.07, kl = L.kl[q.kl % 2];
        if (q.soort === 'tegen') {
          let yaw, pit;
          if (st === 'break') { yaw = q.f * 0.3 + 0.25 * Math.sin(t * 0.25 + q.ph); pit = 0.75 + 0.35 * Math.sin(t * 0.2 + q.ph); v = q.i === 0 || q.i === tegen.length - 1 ? 0.3 : 0; }  // twee langzame bundels
          else if (st === 'opbouw') { yaw = (q.f * 0.6 + 0.3 * Math.sin(t * 1.4 + q.ph)) * (1 - L.opb); pit = 0.28 + 1.05 * L.opb; v = 0.3 + 0.8 * L.opb; }
          else if (st === 'drop') { const om = L.tel % 2 ? 1 : -1; yaw = om * q.f * 0.8 + 0.1 * Math.sin(t * 2.6 + q.ph); pit = L.fr < 0.5 ? 0.16 + 0.12 * (q.i % 3) : 0.75; v = 1.0 + 0.35 * b.pulse; kl = L.kl[q.i % 3 === 2 ? 1 : 0]; }
          else { yaw = q.f * (0.28 + 0.36 * (0.5 + 0.5 * Math.sin(b.pos * Math.PI / 8))) + 0.12 * Math.sin(t * 0.7 + q.ph); pit = 0.14 + 0.2 * Math.sin(b.pos * Math.PI / 4 + q.f * 1.5); v = (q.i + L.tel) % 2 ? 0.85 + 0.35 * b.pulse : 0.4; }
          const cp = Math.cos(pit);
          W.copy(q.fw).multiplyScalar(cp * Math.cos(yaw)).addScaledVector(q.rt, cp * Math.sin(yaw)); W.y = Math.sin(pit); W.normalize();
          breed = 0.022;
        } else {
          const amp = q.zwaai;
          if (st === 'break') {
            if (q.i === spot) { T.set(dj.x + 0.25 * Math.sin(t * 0.5), djV.y, dj.z + 0.25 * Math.cos(t * 0.4)); v = 0.8 + 0.12 * Math.sin(now * 0.9); kl = L.kl[0]; breed = 0.12; }
            else { T.copy(q.doel); v = 0; }
          } else if (st === 'opbouw') {
            const a = t * (1.2 + 2.5 * L.opb) + q.i * RONDE / n, rr = 2.4 * (1 - L.opb) + 0.35, o = klem(L.opb * 1.6);
            T.set(q.doel.x + amp * Math.sin(t * 0.9 + q.ph), q.doel.y || 0, q.doel.z + amp * Math.cos(t * 0.6 + q.ph * 1.7));
            T.lerp(E.set(dj.x + Math.cos(a) * rr, djV.y, dj.z + Math.sin(a) * rr), o);
            v = 0.3 + 0.8 * L.opb; breed = 0.07 - 0.03 * L.opb;
          } else if (st === 'drop') {
            T.set(q.doel.x + 1.9 * amp * Math.sin(t * 1.7 + q.ph), q.doel.y || 0, q.doel.z + 1.9 * amp * Math.cos(t * 1.3 + q.ph * 1.7));
            v = (L.sindsDrop < 8 || (q.i + L.tel) % 2 ? 1.0 : 0.3) * (0.85 + 0.4 * b.pulse); breed = 0.055; kl = L.kl[(q.i + 1) % 3];
          } else {
            T.set(q.doel.x + amp * Math.sin(t * 0.9 + q.ph), q.doel.y || 0, q.doel.z + amp * Math.cos(t * 0.6 + q.ph * 1.7));
            v = ((q.i + Math.floor(b.pos / 2)) % 2 ? 0.9 : 0.5) * (0.6 + 0.4 * b.pulse); kl = L.kl[1 + (q.i % 2)]; breed = 0.05;
          }
          W.subVectors(T, q.p).normalize();
        }
        q.dir.lerp(W, Math.min(1, dt * (st === 'drop' ? 10 : st === 'opbouw' ? 3 + 5 * L.opb : 2.2))).normalize();
        v *= L.dimF; breed *= bBreed;
        kk.copy(kl); if (bWit > 0 && q.i % 2) kk.lerp(WIT, bWit);  // club: bunker half witte bundels, Ibiza wijde gouden zonnestralen
        if (L.flits > 0.05 && st !== 'break') { kk.lerp(WIT, L.flits * 0.5); v = Math.max(v, 0.8 * L.flits); }
        const len = raakLengte(A, q.p, q.dir), rad = len * breed;
        Q.setFromUnitVectors(NEER, q.dir);
        mesh.setMatrixAt(q.i, M4.compose(q.p, Q, SS.set(rad, len, rad)));
        mesh.setColorAt(q.i, _c.copy(kk).multiplyScalar(v));
        Q.setFromUnitVectors(ZAS, q.dir); const ls = v > 0.01 ? 0.16 + 0.1 * Math.min(1.4, v) : 0;
        lens.setMatrixAt(q.i, M4.compose(E.copy(q.p).addScaledVector(q.dir, 0.05), Q, SS.set(ls, ls, ls)));
        lens.setColorAt(q.i, _c.copy(kk).lerp(WIT, 0.35).multiplyScalar(1.5 * v));
        // waar de bundel raakt: lichtvlek op vloer, wand of plafond (de muurschildering licht daar op)
        E.copy(q.p).addScaledVector(q.dir, len - 0.05);
        B.vlek.zet(E.x, E.y, E.z, rad * 1.7 + 0.3, kk, v * (q.soort === 'tegen' ? 0.6 : 0.95));
      }
      mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
      lens.instanceMatrix.needsUpdate = true; lens.instanceColor.needsUpdate = true;
    });
  }

  // ledscherm achter de dj: pixelraster met patronen per stand (groove: balken, chevrons, tunnelringen of de muurschildering als
  // content; opbouw: vullen + versnellende scanlijn; drop: dambord in de kleur van de tel + klapring; break: één ademende lijn).
  // soort 'vlak' (lijst eromheen), 'rond' (zonneschijf), 'ring' (rond de arena), 'projectie' (grot: geen pixels, additief op de wand).
  const VS_UV = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  const FS_SCHERM = `uniform sampler2D uMap; uniform vec2 uRaster; uniform vec3 uA, uB, uC;
uniform float uT, uPos, uPulse, uWg, uWo, uWd, uWb, uOpb, uDrp, uFlits, uModus, uLev, uRond, uPixel, uMapOk;
varying vec2 vUv;
float kw(float x) { return x * x; }
void main() {
  vec2 g = vUv * uRaster, cel = floor(g), f = fract(g) - 0.5, c = uPixel > 0.5 ? (cel + 0.5) / uRaster : vUv;
  vec2 q = (c - 0.5) * vec2(uRaster.x / uRaster.y, 1.0);
  float fr = fract(uPos), r = length(q);
  vec3 g1;
  if (uModus < 0.5) {
    float s = fract(c.y * 2.0 - uPos * 0.5);
    g1 = mix(uA, uB, step(0.5, fract(c.y - uPos * 0.25))) * step(s, 0.4) * (0.35 + 0.65 * uPulse);
  } else if (uModus < 1.5) {
    float s = fract(abs(q.x) * 0.9 - q.y * 0.9 + uPos * 0.5);
    g1 = uA * step(s, 0.3) * (0.4 + 0.6 * uPulse) + uB * (1.0 - smoothstep(0.0, 0.05, abs(s - 0.55)));
  } else if (uModus < 2.5) {
    float s = fract(r * 2.0 - uPos);
    g1 = mix(uB, uA, step(0.5, fract(r - uPos * 0.5))) * (1.0 - smoothstep(0.0, 0.45, s)) * (0.4 + 0.6 * uPulse);
  } else {
    vec3 t = texture2D(uMap, c).rgb;
    float band = exp(-kw((c.y - fract(uPos * 0.25)) * 5.0));
    g1 = t * mix(uA, vec3(1.0), 0.35) * (0.06 + 0.9 * band) * (0.6 + 0.4 * uPulse) * uMapOk;
  }
  vec3 o1 = mix(uB, uC, uOpb) * (step(c.y, uOpb) * 0.4 + exp(-kw((c.y - fract(uPos * (0.5 + 3.5 * uOpb))) * 18.0)) * 1.3);
  float dam = mod(floor(c.x * 6.0) + floor(c.y * 3.0) + floor(uPos * 2.0), 2.0);
  vec3 d1 = uA * (0.15 + 0.85 * dam) * (0.55 + 0.45 * uPulse) + uB * exp(-kw((r - fr * 1.4) * 6.0)) * 1.3 + uC * uDrp * 0.25;
  vec3 b1 = uA * exp(-kw((c.y - 0.5 - 0.25 * sin(uT * 0.21)) * 30.0)) * (0.35 + 0.12 * sin(uT * 0.8));
  vec3 k = (uWg * g1 + uWo * o1 + uWd * d1 + uWb * b1) * uLev + vec3(uFlits);
  float led = uPixel > 0.5 ? 1.0 - smoothstep(0.26, 0.5, length(f)) : smoothstep(0.0, 0.1, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
  if (uRond > 0.5 && length(vUv - 0.5) > 0.5) discard;
  gl_FragColor = vec4(k * led + 0.004, 1.0);
}`;
  function maakScherm(B, sc) {
    const Z = B.Z, ring = sc.soort === 'ring', proj = sc.soort === 'projectie', rond = sc.soort === 'rond';
    const px = Z === 2 ? 0.2 : 0.12, info = SCHILD[B.schild];
    const raster = ring ? [Z === 2 ? 96 : 160, Math.max(4, Math.round(sc.h / px))] : [Math.max(8, Math.round(sc.b / px)), Math.max(6, Math.round(sc.h / px))];
    const u = { uMap: { value: tex(B.schild, !!info.tegel) }, uMapOk: { value: info.tegel ? 0 : 1 }, uRaster: { value: new THREE.Vector2(raster[0], raster[1]) },
      uA: { value: new THREE.Color() }, uB: { value: new THREE.Color() }, uC: { value: new THREE.Color() }, uT: { value: 0 }, uPos: { value: 0 }, uPulse: { value: 0 },
      uWg: { value: 1 }, uWo: { value: 0 }, uWd: { value: 0 }, uWb: { value: 0 }, uOpb: { value: 0 }, uDrp: { value: 0 }, uFlits: { value: 0 }, uModus: { value: 0 },
      uLev: { value: 1 }, uRond: { value: rond ? 1 : 0 }, uPixel: { value: proj ? 0 : 1 } };
    const LH = DH.ledHulp, viaLed = !!(LH && LH.lib() && !ring && !proj);
    let m = null;
    if (viaLed) try { m = zetDubbel(LH.scherm({ bron: info.tegel ? null : B.schild, palet: { a: B.P.a, b: B.P.b, c: B.P.c, donker: B.P.donker }, maat: { w: sc.b, h: sc.h },
      zaad: B.zaad + 3, modi: B.C.dj, helder: 1, pitch: Z === 2 ? 0.1 : 0.04, zijde: THREE.DoubleSide, mix: B.ledMix }, Z)); } catch (e) { console.error('doolhof stijl: dj-scherm', e); }
    if (!m) m = new THREE.ShaderMaterial(Object.assign({ uniforms: u, vertexShader: VS_UV, fragmentShader: FS_SCHERM, side: ring ? THREE.BackSide : THREE.FrontSide },
      proj ? { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false } : {}));
    const eigen = !m.isMaterial || m.uniforms === u;
    const geo = ring ? new THREE.CylinderGeometry(sc.r, sc.r, sc.h, 64, 1, true) : viaLed && rond ? new THREE.CircleGeometry(sc.b / 2, 48) : new THREE.PlaneGeometry(sc.b, sc.h);
    const mesh = vlak(new THREE.Mesh(geo, m), 'scherm'), yc = sc.y0 + sc.h / 2;
    mesh.position.set(sc.x, yc, sc.z); if (!ring) mesh.rotation.y = sc.ry;
    B.G.add(mesh);
    const nrm = ring ? V(0, 0, 0) : V(Math.sin(sc.ry), 0, Math.cos(sc.ry)), mid = V(sc.x, yc, sc.z);
    if (!ring && !proj) {  // donkere lijst eromheen
      const ach = mid.clone().addScaledVector(nrm, -0.05), bw = rond ? sc.b * 1.04 : sc.b + 0.18, bh = rond ? sc.h * 1.04 : sc.h + 0.18;
      if (rond) B.vast.push([VORM.cil, new THREE.Matrix4().compose(ach, new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), sc.ry).multiply(_q.setFromAxisAngle(V(1, 0, 0), Math.PI / 2)), _s.set(bw / 2, 0.06, bh / 2)), 0x050506]);
      else B.vast.push([VORM.doos, mat4(ach.x, ach.y, ach.z, bw, bh, 0.06, 0, sc.ry, 0), 0x050506]);
    }
    const modi = info.tegel ? [0, 1, 2] : [0, 1, 2, 3, 3];
    let modus = 0, vorigeFr = null;
    const kk = new THREE.Color();
    B.scherm = { mid, nrm, sc };
    B.updates.push((dt, now, b, L) => {
      const fr = Math.floor(b.pos / 16);
      if (fr !== vorigeFr) { vorigeFr = fr; modus = kies(B.r, modi.filter(x => x !== modus)); }
      if (eigen) {
      u.uModus.value = modus; u.uT.value = now % 3600; u.uPos.value = ((b.pos % 256) + 256) % 256; u.uPulse.value = b.pulse;
      u.uWg.value = L.wGroove; u.uWo.value = L.wOpb; u.uWd.value = L.wDrop; u.uWb.value = L.wBrk; u.uOpb.value = L.opb; u.uDrp.value = L.drp;
      u.uA.value.copy(L.kl[0]); u.uB.value.copy(L.kl[1]); u.uC.value.copy(L.kl[2]);
      u.uLev.value = (proj ? 0.9 : 1.25) * [1, 1.1, 1.3][Z] * L.dimF; u.uFlits.value = L.flits * (proj ? 0.25 : 0.6);
      }
      // spill: het scherm licht de dj, de vloer ervoor en de wand eromheen aan
      const gem = L.wGroove * (0.18 + 0.2 * b.pulse) + L.wOpb * (0.12 + 0.5 * L.opb) + L.wDrop * (0.45 + 0.35 * b.pulse) + L.wBrk * 0.025;
      kk.copy(L.kl[0]).lerp(L.kl[1], 0.35).lerp(WIT, L.flits * 0.7);
      if (ring) B.vlek.zet(0, sc.y0 + sc.h, 0, sc.r * 0.55, kk, gem * 0.25 * L.dimF + L.flits * 0.15, true);
      else B.vlek.zet(mid.x + nrm.x * 1.3, Math.max(0.6, yc - sc.h * 0.25), mid.z + nrm.z * 1.3, Math.max(sc.b, sc.h) * 0.75, kk, (gem * L.dimF + L.flits * 0.3) * (proj ? 0.6 : 1), true);
    });
  }

  // laserwaaiers: bronnen boven het scherm (de middelste altijd, de hoeken in hoog); waaiers net over de hoofden, in de opbouw een
  // smalle scannende waaier, in de drop slaan ze neer en om de 8 tellen een draaiende kegel; in de groove om de frase; break uit
  function maakLasers(B, bronnen) {
    const Z = B.Z, ns = Math.min(bronnen.length, [3, 1, 1][Z]), K = [10, 8, 5][Z], n = ns * K, A = B.A;
    if (!n) return;
    const src = bronnen.slice(0, ns).map((q, i) => Object.assign({ i, rt: V(q.fw.z, 0, -q.fw.x) }, q));
    for (const q of src) B.vast.push([VORM.doos, mat4(q.p.x, q.p.y + 0.1, q.p.z, 0.34, 0.16, 0.34), 0x0c0c0e]);
    const dik = [0.009, 0.012, 0.018][Z];
    const kern = new THREE.InstancedMesh(VORM.straal, laserMat(1, 1.2, 4.5), n);
    kern.frustumCulled = false; kern.renderOrder = 3; B.G.add(kern);
    let gloed = null;
    if (Z === 0) {
      gloed = new THREE.InstancedMesh(VORM.straalG, laserMat(0.1, 3, 9), n);
      gloed.frustumCulled = false; gloed.renderOrder = 3; B.G.add(gloed);
    }
    const stip = Z < 2 ? new THREE.InstancedMesh(VORM.schijf, new THREE.MeshBasicMaterial({ map: doek('gloed'), color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), n) : null;
    if (stip) { stip.frustumCulled = false; stip.renderOrder = 3; B.G.add(stip); }
    for (let i = 0; i < n; i++) { kern.setColorAt(i, _c.setRGB(0, 0, 0)); if (gloed) gloed.setColorAt(i, _c); if (stip) stip.setColorAt(i, _c); }
    const M4 = new THREE.Matrix4(), SS = new THREE.Vector3(), Q = new THREE.Quaternion(), D = new THREE.Vector3(), E = new THREE.Vector3(), kk = new THREE.Color();
    let t = 0;
    B.updates.push((dt, now, b, L) => {
      const st = L.stand;
      t += dt * L.snel;
      const fraseAan = Math.floor(b.pos / 16) % 2 === 1;
      let aan = st === 'drop' ? 1 : st === 'opbouw' ? klem((L.opb - 0.35) * 2.5) : st === 'groove' && fraseAan ? 0.65 : 0;
      aan *= L.dimF;
      const tunnel = st === 'drop' && Math.floor(b.pos / 8) % 2 === 1;
      let idx = 0;
      for (const q of src) {
        for (let k = 0; k < K; k++, idx++) {
          if (aan < 0.01) { M4.makeScale(0, 0, 0); kern.setMatrixAt(idx, M4); if (stip) stip.setMatrixAt(idx, M4); continue; }
          const f = K > 1 ? k / (K - 1) - 0.5 : 0;
          let yaw, pit;
          if (tunnel) { const a = k / K * RONDE + t * 2.5; yaw = 0.24 * Math.cos(a); pit = 0.1 + 0.24 * Math.sin(a); }
          else if (st === 'drop') { yaw = f * 1.4 + 0.15 * Math.sin(t * 1.5 + q.i); pit = (L.fr < 0.5 ? -0.22 : 0.1) + 0.05 * Math.sin(f * 6 + t); }
          else if (st === 'opbouw') { yaw = f * (1.1 * (1 - L.opb) + 0.12) + 0.3 * Math.sin(t * 0.8 + q.i); pit = 0.02 + 0.2 * Math.sin(b.pos * Math.PI * (0.5 + 1.5 * L.opb)); }
          else { yaw = f * 1.15 + 0.25 * Math.sin(b.pos * Math.PI / 8 + q.i); pit = 0.08 + 0.05 * Math.sin(b.pos * Math.PI / 4); }
          const cp = Math.cos(pit);
          D.copy(q.fw).multiplyScalar(cp * Math.cos(yaw)).addScaledVector(q.rt, cp * Math.sin(yaw)); D.y = Math.sin(pit); D.normalize();
          const len = raakLengte(A, q.p, D);
          Q.setFromUnitVectors(ZAS, D);
          kern.setMatrixAt(idx, M4.compose(q.p, Q, SS.set(dik, dik, len)));
          let v = aan * (st === 'drop' ? ((k + L.tel) % 2 ? 1 : (L.fr < 0.5 ? 1 : 0.15)) * (0.7 + 0.25 * b.pulse) : 0.85 + 0.25 * b.pulse);
          kk.copy(L.kl[(q.i + (k % 2)) % 3]);
          kern.setColorAt(idx, _c.copy(kk).lerp(WIT, 0.2).multiplyScalar(1.05 * v));
          if (stip) { E.copy(q.p).addScaledVector(D, len - 0.04); Q.setFromUnitVectors(ZAS, D.negate()); stip.setMatrixAt(idx, M4.compose(E, Q, SS.set(0.13, 0.13, 0.13))); stip.setColorAt(idx, _c.copy(kk).multiplyScalar(1.4 * v)); }
        }
      }
      kern.instanceMatrix.needsUpdate = true; kern.instanceColor.needsUpdate = true;
      if (stip) { stip.instanceMatrix.needsUpdate = true; stip.instanceColor.needsUpdate = true; }
    });
    if (gloed) { gloed.instanceMatrix = kern.instanceMatrix; gloed.instanceColor = kern.instanceColor; }
  }

  // stroboscopen hoog aan de wanden: wit, alleen op de flitsen van de show (opbouw-aanloop, salvo op de drop)
  function maakStrobo(B) {
    const plekken = B.A.strobo || [];
    if (!plekken.length) return;
    const mesh = new THREE.InstancedMesh(VORM.vlak, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), plekken.length);
    mesh.frustumCulled = false; B.G.add(mesh);
    plekken.forEach((q, i) => {
      mesh.setMatrixAt(i, mat4(q.x, q.y, q.z, 0.7, 0.32, 1, 0, q.ry, 0)); mesh.setColorAt(i, _c.setRGB(0, 0, 0));
      B.vast.push([VORM.doos, mat4(q.x - Math.sin(q.ry) * 0.06, q.y, q.z - Math.cos(q.ry) * 0.06, 0.8, 0.42, 0.1, 0, q.ry, 0), 0x0c0c0e]);
    });
    B.updates.push((dt, now, b, L) => {
      plekken.forEach((q, i) => {
        const v = L.flits > 0.02 ? 2.2 * L.flits * (L.flits < 0.95 && (i + L.tel) % 2 ? 0.25 : 1) : 0.015;
        mesh.setColorAt(i, _c.setScalar(v));
        if (v > 0.3) B.vlek.zet(q.x + Math.sin(q.ry) * 1.2, q.y - 0.6, q.z + Math.cos(q.ry) * 1.2, 2.6, WIT, 0.22 * v);
      });
      mesh.instanceColor.needsUpdate = true;
    });
  }

  // waas onder het plafond: rook-sprites die langzaam rond drijven en de kleur van de bundels vangen
  function maakWaas(B, n, x0, x1, y0, y1, z0, z1) {
    n = Math.min(n, [6, 3, 0][B.Z]);
    const r = B.r, waas = [];
    for (let i = 0; i < n; i++) {
      const bron = typeof smokeTex !== 'undefined' && smokeTex[i % smokeTex.length] ? smokeTex[i % smokeTex.length] : doek('gloed');
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: bron, color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, rotation: r() * RONDE }));
      const s = tussen(r, 3.6, 5.5); sp.scale.set(s, s * 0.7, 1); sp.position.set(tussen(r, x0, x1), tussen(r, y0, y1), tussen(r, z0, z1)); B.G.add(sp);
      waas.push({ sp, vx: tussen(r, -0.12, 0.12), vz: tussen(r, -0.12, 0.12), kl: i % 2 });
    }
    if (n) B.updates.push((dt, now, b, L) => {
      for (const w of waas) {
        const p = w.sp.position; p.x += w.vx * dt; p.z += w.vz * dt;
        if ((p.x < x0 && w.vx < 0) || (p.x > x1 && w.vx > 0)) w.vx = -w.vx;
        if ((p.z < z0 && w.vz < 0) || (p.z > z1 && w.vz > 0)) w.vz = -w.vz;
        w.sp.material.rotation += dt * 0.02;
        w.sp.material.color.copy(L.kl[w.kl]).multiplyScalar((0.06 + 0.09 * b.pulse) * L.k + L.flits * 0.08);
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
      } else if (st === 'zeshoek') { push(VORM.cil6, 0, y0 + riserH / 2, 0.05, 1.35, riserH, 1.35, hoofd); const q = lok(0, yv + 0.003, 0.05); vloerStuk(B, new THREE.CircleGeometry(1.33, 6), q.x, q.y, q.z, f + Math.PI / 2); }
      else if (st === 'rond') { push(VORM.cil, 0, y0 + riserH / 2, 0.05, 1.3, riserH, 1.3, hoofd); const q = lok(0, yv + 0.003, 0.05); vloerStuk(B, new THREE.CircleGeometry(1.29, 32), q.x, q.y, q.z); }
      else if (st === 'rots') for (let i = 0; i < 4; i++) push(VORM.ico, (i % 2 - 0.5) * 0.9, y0 + riserH * 0.4, (i < 2 ? -0.3 : 0.45), 0.85, riserH * 1.1, 0.75, 0x2a241e, r(), r());
      else { push(VORM.doos, 0, y0 + riserH / 2, 0.05, 2.3, riserH, 1.8, hoofd); const q = lok(0, yv + 0.003, 0.05); vloerStuk(B, new THREE.PlaneGeometry(2.28, 1.78), q.x, q.y, q.z, f); }  // verhoging: ledvloer
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
      if (bord) bord.material.color.setScalar((0.55 + 0.6 * b.pulse) * Math.max(0.3, L.k) * (S.fam === 'rauw' && hash(Math.floor(now * 9), 3) > 0.94 ? 0.2 : 1));
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
    return { palet: { a: P.a.clone(), b: P.b.clone(), c: P.c.clone(), donker: P.donker.clone() }, maat: { w: A.w, d: A.d, h: A.h }, muurTex: B.schild, sfeer: B.sf, club: B.club, eigenKleur: true, energie: B.energie,
      vorm: A.vorm, focus: { x: B.focus.x, y: B.focus.y, z: B.focus.z }, deuren: [{ x: 0, z: -A.d / 2, b: 2, h: 2.6 }, { x: 0, z: A.d / 2, b: 2, h: 2.6 }] };
  }
  function heeftOnderdeel(B, soort) {  // vóór de architectuur: is er een onderdeel van deze soort dat bij de sfeer past?
    const bak = DH.onderdelen && DH.onderdelen[soort];
    if (!bak || typeof bak !== 'object') return false;
    const st = { palet: { a: B.P.a.clone(), b: B.P.b.clone(), c: B.P.c.clone(), donker: B.P.donker.clone() }, maat: { w: 12, d: 14, h: 5 }, muurTex: B.schild, sfeer: B.sf, club: B.club, eigenKleur: true, energie: B.energie };
    return Object.keys(bak).some(n => { const o = bak[n]; if (!o || typeof o.maak !== 'function') return false; try { return typeof o.past !== 'function' || !!o.past(st); } catch (e) { return false; } });
  }
  // club-weging: wat de club noemt telt zwaar, de rest licht (0,12); vloeren alleen die de club noemt (de ledvloer is er al, een
  // vloer-onderdeel moet iets toevoegen, nooit een stillere vloer: natglans niet meer); alleen = alleen dit onderdeel (disco: spiegelbol)
  const clubGewicht = (B, soort, naam) => { const t = B.C && B.C.onderdelen && B.C.onderdelen[soort]; return !t ? 1 : t[naam] == null ? (soort === 'vloer' ? 0 : 0.12) : t[naam]; };
  function plaatsOnderdeel(B, soort, plek, alleen) {
    const bak = DH.onderdelen && DH.onderdelen[soort];
    if (!bak || typeof bak !== 'object') return false;
    const st = stijlVoor(B), kand = [];
    for (const naam of Object.keys(bak)) {
      const o = bak[naam]; if (!o || typeof o.maak !== 'function' || (alleen && naam !== alleen)) continue;
      let ok = true; if (typeof o.past === 'function') { try { ok = !!o.past(st); } catch (e) { ok = false; } }
      if (ok) kand.push(naam);
    }
    if (!kand.length) return false;
    for (let i = kand.length - 1; i >= 0; i--) if (!(clubGewicht(B, soort, kand[i]) > 0)) kand.splice(i, 1);  // wat de club uitsluit
    if (!kand.length) return false;
    const recent = GEHEUGEN.onderdeel[soort] || (GEHEUGEN.onderdeel[soort] = []);
    const naam = kiesGewogen(B.r, kand, n => (bak[n].gewicht == null ? 1 : +bak[n].gewicht || 0) * clubGewicht(B, soort, n) * (recent[0] === n ? 0.15 : recent.includes(n) ? 0.5 : 1));
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
      B.updates.push((dt, now, b, L) => mat.color.copy(L.kl[1]).lerp(L.kl[2], 0.3 * b.hoog).multiplyScalar((0.45 + 0.6 * b.pulse) * L.k + L.flits));
      return;
    }
    // totem: paal met ledringen die op de tel omhoog lopen en een draaiende top
    const hT = Math.min(plaf - 0.4, 3.6);
    B.vast.push([VORM.cil, mat4(x, hT / 2, z, 0.08, hT, 0.08), 0x2a2a30], [VORM.cil, mat4(x, 0.1, z, 0.6, 0.2, 0.6), 0x16161a]);
    for (let i = 0; i < 5; i++) B.net.ring(V(x, 0.6 + i * (hT - 1) / 4, z), 0.42 - i * 0.05, 0.05, { kl: i % 2, fase: i / 5, ring: i / 5 });
    const top = new THREE.Mesh(VORM.oct, new THREE.MeshBasicMaterial({ color: 0xffffff })); top.position.set(x, hT + 0.25, z); top.scale.setScalar(0.28); B.G.add(top);
    B.updates.push((dt, now, b, L) => { top.rotation.y += dt * 1.2; top.scale.setScalar(0.28 * (1 + 0.3 * b.pulse)); top.material.color.copy(L.kl[2]).multiplyScalar((0.35 + 0.9 * b.pulse) * L.k + L.flits); });
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
      return (u, o) => { o.p.copy(p).addScaledVector(dir, 0.5 * glad(u / 9)); o.p.y = opt.y || 0.6; o.l.copy(kijk); o.l.y += opt.op == null ? 0.7 : opt.op; o.fov = opt.fov || 72; };
    } }),
    // tegenlicht: tussen het publiek (vrijgehouden plek), op of onder ooghoogte, naar de dj, het scherm en de bundels: het publiek als
    // silhouet tegen het licht. Schuift langzaam naar voren.
    tegen: B => ({ naam: 'tegen', rustig: true, min: 3.4, maak: r => {
      const tp = B.tegenPlek, j = B.dj, naar = V(j.x - tp.x, 0, j.z - tp.z), afst = naar.length() || 1; naar.divideScalar(afst);
      const zij = V(naar.z, 0, -naar.x), dz = (r() - 0.5) * 1.2, y = (tp.y || 0) + tussen(r, 1.1, 1.6), kijk = V(j.x, (j.y || 0) + tussen(r, 1.9, 2.7), j.z);
      const p0 = V(tp.x, y, tp.z).addScaledVector(zij, dz * 0.4), p1 = p0.clone().addScaledVector(naar, Math.min(1.1, afst * 0.18)).addScaledVector(zij, -dz * 0.3);
      return (u, o) => { const k = glad(u / 12); o.p.lerpVectors(p0, p1, k); o.l.copy(kijk); o.fov = 62 - 5 * k; };
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
    // schermwand: op 2+ m langs de wand tegenover de dj (rechte kamers) een langzame rit, de blik schuin over de schermen aan de
    // overkant (de ledwanden vullen het beeld); ronde kamers: vanuit het midden schuin naar de wand, draait langzaam rond
    scherm: (B, A) => ({ naam: 'scherm', rustig: true, min: 4, maak: r => {
      if (A.vorm === 'rond' || A.vorm === 'grot') {
        const a0 = r() * RONDE, dir = r() < 0.5 ? -1 : 1, R0 = Math.min(A.w, A.d) / 2;
        return (u, o) => { const a = a0 + dir * 0.05 * u, b2 = a + dir * 0.85; o.p.set(Math.cos(a) * R0 * 0.3, 2.0, Math.sin(a) * R0 * 0.3); o.l.set(Math.cos(b2) * R0, 2.1, Math.sin(b2) * R0); o.fov = 70; };
      }
      // zij = de wand waar we naar kijken (die van de dj); A.schermZij/schermX: architectuur met balkon, zuilen of containers
      const zij = A.schermZij || (Math.abs(B.dj.x) > 1 ? Math.sign(B.dj.x) : r() < 0.5 ? -1 : 1), x0 = A.schermX ? A.schermX(zij) : -zij * (A.w / 2 - 1.6), xw = zij * A.w / 2;
      const z0 = -A.d / 2 + 2.6, z1 = A.d / 2 - 2.6, omk = r() < 0.5, y = Math.min(2.4, A.plafondOp(x0, 0) - 0.6), ly = 1.9;
      return (u, o) => { const k = glad(u / 14), z = omk ? z1 + (z0 - z1) * k : z0 + (z1 - z0) * k; o.p.set(x0, y, z); o.l.set(xw, ly, z + (omk ? -1 : 1) * A.d * 0.2); o.fov = 66; };
    } }),
    // ledvloer: vlak boven de vloer tussen het publiek (vrijgehouden plek), wijd, naar de dj: de vloer vult de onderkant van het beeld
    vloer: (B, A) => ({ naam: 'vloer', maak: r => {
      const j = B.dj, tp = B.tegenPlek || A.camPlek || { x: 0, z: -A.d / 4 }, zij = (r() - 0.5) * 1.2;
      const naar = V(j.x - tp.x, 0, j.z - tp.z); if (naar.lengthSq() < 1e-4) naar.set(0, 0, 1); naar.normalize();
      const dwars = V(naar.z, 0, -naar.x), p0 = V(tp.x, (tp.y || (A.vloerOp ? A.vloerOp(tp.x, tp.z) : 0)) + 0.34, tp.z).addScaledVector(dwars, zij), kijk = V(j.x, (j.y || 0) + 0.8, j.z);
      return (u, o) => { const k = glad(u / 10); o.p.copy(p0).addScaledVector(naar, 0.9 * k); o.l.copy(kijk).addScaledVector(dwars, -zij * 0.3); o.fov = 80; };
    } }),
    // ledplafond: staand tussen het publiek, de blik omhoog langs het plafond, draait langzaam
    plafond: (B, A) => ({ naam: 'plafond', rustig: true, maak: r => {
      const c = B.tegenPlek || { x: 0, z: 0 }, a0 = r() * RONDE, dir = r() < 0.5 ? -1 : 1;
      return (u, o) => { const a = a0 + dir * 0.07 * u; o.p.set(c.x, (c.y || 0) + 1.6, c.z); o.l.set(c.x + Math.cos(a) * 3.2, Math.min(A.plafondOp(c.x, c.z), 9), c.z + Math.sin(a) * 3.2); o.fov = 76; };
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
        const leeftijd = t - shot.t0, maatL = st === 'drop' ? 4 : st === 'break' ? 16 : S.maten, maat = Math.floor(b.pos / maatL), rust = st === 'break' ? 1.6 : 1;
        // knippen: op de eerste tel van een frase (8 of 16 tellen) na de minimale duur; moet het eerder (te lang, de loper
        // begint te dansen), dan op de eerstvolgende tel; de drop knipt meteen naar het heldenshot
        if (leeftijd > (shot.def.max || 13) * rust) wilKnip = true;
        if (fase === 'dans' && !loperGehad && heeftLoper && shot.def === intro && leeftijd > 2.5) wilKnip = true;
        const minD = st === 'drop' ? 1.4 : (shot.def.min || S.minShot) * rust;  // drop: op elke maat een nieuw beeld
        const knip = (wilKnip && (opTel || leeftijd > 16)) || (vorigeMaat != null && maat !== vorigeMaat && st === vorigeStand && leeftijd > minD);
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
      uit.shot = B.shotNu = fase === 'uit' ? 'volg' : shot ? shot.def.naam : '-';  // voor de testronde
      return uit;
    };
  }

  // --- architecturen: elk sjabloon bouwt de ruimte en geeft de indeling terug ---
  // A = { vorm, w, d, h, route, dj, focus?, midden[], plafondH, muurH, vloerOK, zones3d, massa, lounge, extra3d, bundels, strobo, bord,
  //       binnenVoet(x,z,m), plafondOp(x,z), vloerOp?, klem?, cams(B) -> { lijst, held }, update? }
  const ARCH = {};
  // wanden: onder ledschermpanelen met de schildering als beeld (één paneel per schilderingbreedte, om en om gespiegeld), boven een
  // ledband rondom of donker; de vloer gaat naar de ledvloer (B.vloerDelen); vlak plafond = één groot ledscherm of donker
  function schil(B, omtrek, d, hWand, opt = {}) {
    const { M, G } = B, info = SCHILD[B.schild], hm = Math.min(hWand, opt.hm || 5.2), P = omtrekLengte(omtrek);
    // de omtrek loopt tegen de klok in: van binnen gezien loopt s van rechts naar links, dus u = 1 - f (tekst en beeld leesbaar;
    // niet meer om en om spiegelen: bewegende ledinhoud hoeft niet naadloos aan te sluiten, gespiegelde tekst wel fout)
    const n = Math.max(1, Math.round(P / (hm * ASPECT)));
    const tw = P / n, uvM = (s, y, kt) => [1 - (s - kt * tw) / tw, y / hm];
    const vv = { vervorm: opt.vervorm, stapS: opt.stapS, stapY: opt.stapY };
    G.add(vlak(new THREE.Mesh(wandGeo(omtrek, d, 0, hm, Object.assign({ tegel: tw, uv: uvM }, vv)), M.muur(tw, hm)), 'muur'));
    if (hWand > hm + 0.01) {
      const hb = hWand - hm, uvB = M.ledBoven ? (s, y) => [1 - s / P, (y - hm) / hb] : (s, y) => [s / M.basisTegel, y / M.basisTegel];
      G.add(vlak(new THREE.Mesh(wandGeo(omtrek, d, hm, hWand, Object.assign({ uv: uvB }, vv)), M.boven(P, hb)), 'boven'));
    }
    if (!opt.geenVloer) B.vloerDelen.push(vlakGeo(omtrek, 0, 1, opt.gaten));
    if (opt.plafond !== false) {
      const pg = vlakGeo(omtrek, hWand, 4);
      if (M.ledPlafond) { const q = uvXZ(pg); G.add(vlak(new THREE.Mesh(pg, M.plafond(q.w, q.d)), 'plafond')); } else G.add(vlak(new THREE.Mesh(pg, M.plafond()), 'plafond'));
    }
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
      A.scherm = { soort: 'vlak', x: s * (w / 2 - 0.45), z: djz, y0: 0.35, ry: -s * Math.PI / 2, b: Math.min(6.4, d * 0.42), h: Math.min(3.6, A.bord.y - 0.45 - 0.2 - 0.35) };  // voor de pilasters, onder het bord
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
      A.scherm = { soort: 'vlak', x: -s * (w / 2 - 0.45), z: 0, y0: 0.35, ry: s * Math.PI / 2, b: Math.min(6.4, d * 0.42), h: Math.min(3.6, A.bord.y - 0.45 - 0.2 - 0.35) };
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
    const trip = B.C.trip && B.Z === 0 && !B.M.ledPlafond;  // jungle/onderwater zonder ledplafond: de kaleidoscoop van zaal 2 als koepel
    let koepelMat;
    const kg = koepelGeo(omtrek, hw, hTop, 6, trip ? 2 * Rv : 4);
    if (trip) { koepelMat = B.ctx.trip(); koepelMat.side = THREE.DoubleSide; const uv = kg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + 0.5, uv.getY(i) + 0.5); }
    else if (B.M.ledPlafond) { const q = uvXZ(kg); koepelMat = B.M.plafond(q.w, q.d); }
    else koepelMat = B.M.plafond();
    B.G.add(vlak(new THREE.Mesh(kg, koepelMat), 'plafond'));
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
    if (!B.middenDj) { B.vast.push([VORM.cil, mat4(0, 0.225, 0, 1.75, 0.45, 1.75), B.S.struct[0]]); vloerStuk(B, new THREE.CircleGeometry(1.74, 40), 0, 0.453, 0); }  // podium: ledvloer
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
    // ledring rond de hele zaal boven de schildering; tegenlicht vanaf de rand van het podium (kroon van bundels die naar buiten en
    // omhoog waaieren); lasers vanuit de lichtring naar drie kanten
    { const y0 = Math.max(2.95, hw - 1.6); A.scherm = { soort: 'ring', x: 0, z: 0, r: R - 0.12, y0, h: Math.max(0.6, Math.min(1.3, hw - 0.3 - y0)) }; }
    A.tegen = Array.from({ length: 8 }, (_, i) => { const a = (i + 0.5) / 8 * RONDE, fw = V(Math.cos(a), 0, Math.sin(a)); return { soort: 'tegen', p: V(fw.x * 1.85, 0.5, fw.z * 1.85), fw, f: i % 2 ? 0.5 : -0.5, kl: i % 2 }; });
    A.laser = [0, 1, 2].map(i => { const a = i / 3 * RONDE + 0.5, fw = V(Math.cos(a), 0, Math.sin(a)); return { p: V(fw.x * 0.6, yR - 0.25, fw.z * 0.6), fw }; });
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
    A.update = (dt, now, b, L) => { if (trip) tripHelder(koepelMat, (0.05 + 0.45 * b.pulse) * L.k + 0.3 * L.flits); };
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
      strobo: stroboHoeken(w, d, h - 0.6), schermZij: s };  // schermshot: vanaf de open kant naar het balkon
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
    A.scherm = opBalkon ? { soort: 'vlak', x: s * (w / 2 - 0.08), z: 0, y0: hb + 0.2, ry: -s * Math.PI / 2, b: Math.min(8, d * 0.38), h: Math.min(3.4, h - hb - 1.4) }
      : { soort: 'vlak', x: -s * (w / 2 - 0.08), z: A.dj.z, y0: 0.35, ry: s * Math.PI / 2, b: Math.min(8, d * 0.38), h: Math.min(4.0, A.bord.y - 0.55 - 0.5 - 0.35) };
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
    const schachten = [];
    for (const sx of [-1, 1]) for (const z of zs) {  // zuilen: voet en kapiteel donker, de schacht een rond ledscherm; ledbanden
      const x = sx * cx;
      B.vast.push([VORM.doos, mat4(x, 0.15, z, rc * 2.6, 0.3, rc * 2.6), st[0]], [VORM.doos, mat4(x, h - 0.5, z, rc * 2.8, 0.4, rc * 2.8), st[1]]);
      schachten.push(new THREE.CylinderGeometry(rc, rc, h - 1.0, 20, 1, true).translate(x, 0.3 + (h - 1.0) / 2, z));
      B.net.ring(V(x, 0.45, z), rc + 0.02, 0.06, { kl: 0 });
      B.net.ring(V(x, h - 0.85, z), rc + 0.02, 0.06, { kl: 1 });
      B.obst.push({ x, z, r: rc + 0.3 });
    }
    B.G.add(vlak(new THREE.Mesh(voegSamen(schachten), B.M.zuil(RONDE * rc, h - 1.0)), 'zuil'));  // alle schachten één draw call
    B.vast.push([VORM.doos, mat4(-cx, h - 0.15, 0, 0.9, 0.3, d), st[1]], [VORM.doos, mat4(cx, h - 0.15, 0, 0.9, 0.3, d), st[1]]);  // architraaf
    // trapaltaar (tenzij een middenstuk van onderdelen.js de plek van de dj krijgt)
    if (!B.middenDj) {
      for (const [hs, y] of [[2.1, 0.32], [1.6, 0.64], [1.1, 0.96]]) {
        B.vast.push([VORM.doos, mat4(0, y - 0.16, za, hs * 2, 0.32, hs * 2), st[0]]);
        vloerStuk(B, new THREE.PlaneGeometry(hs * 2, hs * 2), 0, y + 0.003, za);  // treden: ledvloer
        B.net.lijn([V(-hs, y + 0.01, za - hs), V(hs, y + 0.01, za - hs), V(hs, y + 0.01, za + hs), V(-hs, y + 0.01, za + hs)], 0.035, { kl: 2, ring: 0 }, true, 1.2);
      }
      B.obst.push({ x: 0, z: za, r: 2.3 });
    }
    // zonneschijf achter de dj: een rond ledscherm (in trippy op hoog: de kaleidoscoop als content)
    const zr = tussen(r, 1.8, 2.4), zy = 1.0 + zr + 0.9, zz = za + 2.6;
    const zon = new THREE.Mesh(new THREE.TorusGeometry(zr, 0.07, 6, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    zon.position.set(0, zy, zz); B.G.add(zon);
    let binnenMat = null;
    if (B.C.trip && B.Z === 0 && !(DH.ledHulp && DH.ledHulp.lib())) {
      binnenMat = B.ctx.trip(); binnenMat.side = THREE.DoubleSide;
      const schijf = new THREE.Mesh(VORM.schijf, binnenMat); schijf.position.set(0, zy, zz + 0.02); schijf.scale.setScalar(zr * 0.96); schijf.rotation.y = Math.PI; B.G.add(schijf);
    }
    B.vast.push([VORM.cil, mat4(0, (zy - zr) / 2, zz, 0.06, zy - zr, 0.06), st[1]]);
    // oculus boven het altaar
    const oc = new THREE.Mesh(VORM.schijf, new THREE.MeshBasicMaterial({ map: doek('gloed'), color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    oc.position.set(0, h - 0.02, za); oc.rotation.x = Math.PI / 2; oc.scale.setScalar(1.6); B.G.add(oc);
    deurLijsten(B, d);
    const A = { vorm: 'tempel', w, d, h, plafondH: null, muurH: h, vloerOK: true, binnenVoet: rechtBinnen(w, d), plafondOp: () => h, strobo: stroboHoeken(w, d, hm + 0.4),
      schermX: zij => -zij * (cx - 1.3) };  // schermshot: in het schip, langs de zuilen naar de wand
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
    A.camPlek = { x: -s * 1.9, z: za - 6.2 };
    A.bord = { x: 0, y: Math.min(h - 0.5, zy + zr + 0.8), z: d / 2 - 0.08, ry: Math.PI, b: 4 };
    if (!binnenMat) A.scherm = { soort: 'rond', x: 0, z: zz + 0.03, y0: zy - zr * 0.96, ry: Math.PI, b: zr * 1.92, h: zr * 1.92 };
    // tegenlicht: koppen rond de zon die door de zuilengang naar het publiek waaieren; lasers vanaf de bovenkant van de zon
    A.tegen = Array.from({ length: 8 }, (_, i) => { const a = Math.PI * (0.1 + 0.8 * i / 7), x = Math.cos(a) * (zr + 0.3); return { soort: 'tegen', p: V(x, zy + Math.sin(a) * (zr + 0.3), zz - 0.15), fw: V(0, 0, -1), f: -x / (zr + 0.3), kl: i % 2 }; });
    A.laser = [{ p: V(0, zy + zr + 0.35, zz - 0.1), fw: V(0, 0, -1) }, { p: V(-zr - 0.6, zy, zz - 0.1), fw: V(0, 0, -1) }, { p: V(zr + 0.6, zy, zz - 0.1), fw: V(0, 0, -1) }];
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
      zon.material.color.copy(L.kl[2]).lerp(L.kl[0], 0.3).multiplyScalar((0.45 + 0.9 * b.pulse) * L.k + L.flits);
      zon.scale.setScalar(1 + 0.04 * b.bas);
      if (binnenMat) tripHelder(binnenMat, (0.06 + 0.5 * b.pulse) * L.k);
      oc.material.color.copy(L.kl[1]).multiplyScalar((0.12 + 0.25 * b.pulse) * L.k);
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
    if (M.ledPlafond) { const q = uvXZ(dg); G.add(vlak(new THREE.Mesh(dg, M.plafond(q.w, q.d)), 'plafond')); } else G.add(vlak(new THREE.Mesh(dg, M.plafond()), 'plafond'));
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
    const A = { vorm: 'loods', w, d, h: hr, plafondH: null, muurH: null, vloerOK: true, binnenVoet: rechtBinnen(w, d), plafondOp: () => hw - 0.55, strobo: stroboHoeken(w, d, hm - 0.3),
      schermX: zij => -zij * (A.w / 2 - (zij === s ? 3.4 : 1.6)) };  // schermshot: vóór de containers langs
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
    const cMat = M.container();  // containers met ledwanden
    for (let i = 0; i < nC; i++) {
      const cx2 = -s * (w / 2 - 1.35), cz = cz0 * (d / 2 - 4.4), cy = 1.3 + i * 2.6;
      if (i === 1 && (hw < 5.6 || r() < 0.5)) break;
      const c = vlak(new THREE.Mesh(VORM.doos, cMat), 'container'); c.position.set(cx2, cy, cz); c.scale.set(2.44, 2.6, 6.06); G.add(c);
      if (i === 0) for (const dz of [-2, 0, 2]) B.obst.push({ x: cx2, z: cz + dz, r: 1.4 });
    }
    A.route = [[0, -d / 2], [rx * 0.6, -d / 2 + 2.8], [rx, -1.6], [rx, 1.6], [rx * 0.6, d / 2 - 2.8], [0, d / 2]].map(([x, z]) => ({ x, z }));
    A.zones3d = [{ soort: 'rijen', c: A.dj, u: [-s, 0], d0: 2.2, d1: w / 2 - 0.6, breed: d / 2 - 3 }];
    A.massa = [{ soort: 'rijen', c: A.dj, u: [-s, 0], d0: 2.2, d1: w - 3.4, breed: d / 2 - 2.4 }];
    A.opstellingen = { rijen: 1, kring: 0.6, verspreid: 0.8 };
    A.midden = d >= 20 ? [{ x: s * 1.2, z: -cz0 * (d / 2 - 3.6), r: 1.0 }] : [];
    A.camPlek = { x: s * (w / 2 - 1.3), z: djz + (djz > 0 ? -1 : 1) * 4.2 };
    A.bord = { x: s * (w / 2 - 0.06), y: hm + 0.2, z: djz, ry: -s * Math.PI / 2, b: 3.4 };
    A.scherm = { soort: 'vlak', x: s * (w / 2 - 0.15), z: djz, y0: 0.3, ry: -s * Math.PI / 2, b: 2.3, h: Math.min(hw - 0.9, A.bord.y - 0.42 - 0.15) - 0.3 };  // tussen de speakers
    A.tegen = [];  // tegenlicht bovenop de speakerstapels en boven het scherm
    for (const sz of [-1, 1]) for (let kol = 0; kol < 2; kol++) A.tegen.push({ soort: 'tegen', p: V(X - s * 0.15, 2.42, djz + sz * (1.75 + kol * 0.95)), fw: V(-s, 0, 0), f: sz * (0.35 + 0.4 * kol) * s, kl: kol });
    for (const sz of [-1, 1]) A.tegen.push({ soort: 'tegen', p: V(X - s * 0.4, A.scherm.y0 + A.scherm.h + 0.2, djz + sz * 0.8), fw: V(-s, 0, 0), f: sz * 0.15 * s, kl: 0 });
    A.laser = [1, -1, 0].map(sz => ({ p: V(X - s * 0.3, sz ? 2.62 : A.scherm.y0 + A.scherm.h + 0.3, djz + sz * 2.2), fw: V(-s, 0, 0) }));  // op de speakers (niet door het bord)
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
    A.update = (dt, now, b, L) => spMat.color.setScalar((0.25 + 0.6 * b.bas) * Math.min(1, L.k) + 0.4 * L.flits);
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
      const Pk = omtrekLengte(vh);  // stootbord = ledband, trede = ledvloer
      G.add(vlak(new THREE.Mesh(wandGeo(vh, 1e6, yB, yT, { uv: (s2, y) => [1 - s2 / Pk, (y - yB) / 0.4] }), M.rand(Pk, 0.4)), 'rand'));
      if (k < 2) B.vloerDelen.push(vlakGeo(vh, yB, 1, [veelhoek(N, ringen[k + 1])]));
      B.net.lijn(vh.map(([x, z]) => V(x * 0.995, yT + 0.03, z * 0.995)), 0.05, { kl: k % 2, ring: 1 - k * 0.3, groep: k }, true, 1.6);
    }
    const bodem = veelhoek(N, ringen[2]), trip = B.C.trip && B.Z === 0 && B.r() < 0.5;  // jungle/onderwater: soms de kaleidoscoop als bodem
    let bodemMat = null;
    if (trip) {
      bodemMat = B.ctx.trip(); bodemMat.side = THREE.DoubleSide;
      G.add(new THREE.Mesh(vlakGeo(bodem, -1.2, ringen[2] * 2), bodemMat));
      const uv = G.children[G.children.length - 1].geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + 0.5, uv.getY(i) + 0.5);
    } else B.vloerDelen.push(vlakGeo(bodem, -1.2, 1));
    deurLijsten(B, d);
    const A = { vorm: 'pit', w, d, h, plafondH: h, muurH: h, vloerOK: false, binnenVoet: rechtBinnen(w, d), plafondOp: () => h,
      vloerOp: (x, z) => { const q = Math.hypot(x, z); return q < rp ? (q < ringen[2] ? -1.2 : q < ringen[1] ? -0.8 : -0.4) : 0; }, strobo: stroboHoeken(w, d, h - 0.6) };
    const rr = rp + 1.1, sr = midden ? s : -s;
    A.route = [[0, -d / 2], ...[-1.05, -0.4, 0.4, 1.05].map(a => [sr * rr * Math.cos(a), rr * Math.sin(a)]), [0, d / 2]].map(([x, z]) => ({ x, z }));
    if (midden) {
      B.vast.push([VORM.cil, mat4(0, -0.98, 0, 1.25, 0.44, 1.25), B.S.struct[0]]);
      vloerStuk(B, new THREE.CircleGeometry(1.24, 40), 0, -0.757, 0);  // eiland: ledvloer
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
    { const ss = midden ? sr : s, hMax = ss === -sr ? A.bord.y - 0.45 - 0.2 - 0.35 : h - 1.3;  // achter de dj; aan de kant van het bord eronder
      A.scherm = { soort: 'vlak', x: ss * (w / 2 - 0.08), z: 0, y0: 0.35, ry: -ss * Math.PI / 2, b: Math.min(6.4, d * 0.4), h: Math.min(3.6, hMax) }; }
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
    A.update = (dt, now, b, L) => { if (trip) tripHelder(bodemMat, (0.06 + 0.5 * b.pulse) * L.k + 0.3 * L.flits); };
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
    const kg = koepelGeo(omtrek, hw, yTop, 5, M.basisTegel, (p, i, k) => [p[0], p[1] + 0.5 * Math.sin(i * 1.7 + k * 2.3 + ph[0]), p[2]]);
    if (M.ledPlafond) { const q = uvXZ(kg); G.add(vlak(new THREE.Mesh(kg, M.plafond(q.w, q.d)), 'plafond')); } else G.add(vlak(new THREE.Mesh(kg, M.basis), 'plafond'));
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
    A.scherm = { soort: 'projectie', x: s * (rD - bult - 0.3), z: A.dj.z, y0: 0.45, ry: -s * Math.PI / 2, b: 3.4, h: Math.min(2.4, hw - 0.8) };  // projectie op de rotswand
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
        p.needsUpdate = true; sporen.material.color.copy(L.kl[2]).multiplyScalar((0.3 + 0.6 * b.hoog) * L.k);
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
    // ledgewelf: u langs de boog, v langs de lengte (één groot scherm over de hele tunnel); donker: tegels van het basisdoek
    const pos = [], uv = [], led = M.ledPlafond, T = M.basisTegel, nZ = Math.ceil(d / 3), Lb = cum[nA];
    const uvp = (sb, z) => (led ? [sb / Lb, (z + d / 2) / d] : [sb / T, z / T]);
    for (let i = 0; i < nA; i++) for (let k = 0; k < nZ; k++) {
      const z0 = -d / 2 + k * d / nZ, z1 = -d / 2 + (k + 1) * d / nZ, a = boog[i], b = boog[i + 1];
      const P4 = [[a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1]], U4 = [uvp(cum[i], z0), uvp(cum[i + 1], z0), uvp(cum[i + 1], z1), uvp(cum[i], z1)];
      for (const q of [0, 1, 2, 0, 2, 3]) { pos.push(...P4[q]); uv.push(U4[q][0], U4[q][1]); }
    }
    for (const z of [-d / 2, d / 2]) for (let i = 0; i < nA; i++) {
      pos.push(0, hw, z, boog[i][0], boog[i][1], z, boog[i + 1][0], boog[i + 1][1], z);
      if (led) uv.push(0.5, 0, boog[i][0] / w + 0.5, (boog[i][1] - hw) / rv, boog[i + 1][0] / w + 0.5, (boog[i + 1][1] - hw) / rv);
      else uv.push(0, hw / T, boog[i][0] / T, boog[i][1] / T, boog[i + 1][0] / T, boog[i + 1][1] / T);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
    G.add(vlak(new THREE.Mesh(g, led ? M.plafond(Lb, d) : M.basis), 'plafond'));
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
    A.scherm = { soort: 'vlak', x: s * (w / 2 - 0.08), z: djz, y0: 0.3, ry: -s * Math.PI / 2, b: Math.min(5.5, d * 0.26), h: hw - 0.45 };
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

  // plek voor de tegenlicht-camera: vóór de dj (3,6-6,8 m), liefst recht ervoor, vrij van looppad, wand en obstakels
  function zoekTegenPlek(B, A) {
    const j = B.dj; let best = null, bs = -1e9;
    for (const R of [6.8, 6, 5.2, 4.4, 3.6]) for (const l of [0, -0.9, 0.9, -1.8, 1.8]) {
      const p = j.lok(l, 0, R);
      if (!A.binnenVoet(p.x, p.z, 0.9)) continue;
      const ra = B.routeAfst(p.x, p.z);
      if (ra < 0.6 || B.obst.some(o => Math.hypot(p.x - o.x, p.z - o.z) < o.r + 0.5)) continue;
      const sc = R - Math.abs(l) * 0.8 + Math.min(ra, 2) * 0.3;
      if (sc > bs) { bs = sc; best = { x: p.x, z: p.z, y: A.vloerOp ? A.vloerOp(p.x, p.z) : 0 }; }
    }
    return best;
  }
  // tegenlicht-koppen: eigen lijst van de architectuur, anders een rij op de bovenrand van het scherm (en in hoog twee op de vloer)
  function tegenBronnen(B, A) {
    if (A.tegen) return A.tegen;
    const sc = A.scherm; if (!sc || sc.soort === 'ring') return [];
    const fw = V(Math.sin(sc.ry), 0, Math.cos(sc.ry)), rt = V(fw.z, 0, -fw.x), n = [6, 4, 3][B.Z], uit = [];
    for (let i = 0; i < n; i++) {
      const f = n > 1 ? i / (n - 1) * 2 - 1 : 0;
      uit.push({ soort: 'tegen', p: V(sc.x, sc.y0 + sc.h + 0.22, sc.z).addScaledVector(rt, f * sc.b * 0.47).addScaledVector(fw, 0.25), fw, f, kl: i % 2 });
    }
    if (B.Z === 0) for (const f of [-1, 1]) uit.push({ soort: 'tegen', p: V(sc.x, 0.22, sc.z).addScaledVector(rt, f * (sc.b * 0.5 + 0.35)).addScaledVector(fw, 0.35), fw, f: f * 0.7, kl: 1 });
    return uit;
  }
  // laserbronnen: eigen lijst, anders boven het midden van het scherm (en in hoog op de hoeken)
  function laserBronnen(B, A) {
    if (A.laser) return A.laser;
    const sc = A.scherm; if (!sc || sc.soort === 'ring') return [];
    const fw = V(Math.sin(sc.ry), 0, Math.cos(sc.ry)), rt = V(fw.z, 0, -fw.x), y = Math.min(sc.y0 + sc.h + 0.45, A.plafondOp(sc.x, sc.z) - 0.3);
    return [0, -1, 1].map(f => ({ p: V(sc.x, y, sc.z).addScaledVector(rt, f * sc.b * 0.42).addScaledVector(fw, 0.3), fw }));
  }

  // --- een kamer samenstellen ---
  // In stappen (generator): de kern bouwt op de achtergrond en pauzeert bij elke yield als het budget van het beeld op is (een hele kamer
  // in één keer kostte 3-12 ms). maakKamer = alles in één keer (testronde).
  function* maakKamerStappen(archNaam, ctx) {
    const r = ctx.rnd, Z = Math.max(0, Math.min(2, ctx.zwaar | 0)), G = ctx.groep, b0 = ctx.beat() || {}, reg = regie();
    const club = kiesClub(r, archNaam), C = CLUB[club], sf = C.fam, S = C, schild = kiesSchild(r, club, Z), P = maakPalet(r, club);
    const B = { ctx, r, Z, G, club, C, sf, S, schild, P, energie: klem(S.energie * 0.55 + (b0.energy || 0) * 0.45 + (reg.stand === 'drop' ? 0.15 : 0)),
      vast: [], obst: [], figs: [], updates: [], onderdelen: [], vloerDelen: [], d2: 8, ledMix: { value: 0.05 } };  // ledMix: eigen showMix (clubkleuren)
    B.U = maakShowU(B);
    B.vlek = maakVlekken(B);
    B.M = materialen(B);
    B.focus = V(0, 1.6, 0);
    B.net = maakNet(B);
    yield;
    // plafond: een onderdeel of de eigen balken (beslist vóór de architectuur, want die tekent ze mee)
    const spiegelClub = !!(C.onderdelen.plafond && C.onderdelen.plafond.spiegelbol >= 3);  // disco: altijd een spiegelbol
    const wilPlafond = spiegelClub || r() < 0.65;
    B.plafondEigen = !wilPlafond;
    // middenstuk met dj (onderdelen.js) in plaats van de eigen dj-plek: alleen waar de dj midden in de kamer staat
    const bus = G.userData.dhBus || (G.userData.dhBus = { shows: [], focus: null, midden: null, dim: 0, flits: 0, helder: 1 });
    bus.ledMix = B.ledMix;  // ledschermen van de onderdelen houden ook de clubkleuren
    B.middenDj = !!(ARCH[archNaam].middenKans && heeftOnderdeel(B, 'midden') && r() < ARCH[archNaam].middenKans);
    const A = ARCH[archNaam].maak(B);
    B.A = A;
    yield;
    if (A.focus) B.focus.copy(A.focus); else B.focus.set(A.dj.x, (A.dj.y || 0) + 1.6, A.dj.z);
    if (A.camPlek) B.obst.push({ x: A.camPlek.x, z: A.camPlek.z, r: 0.8, cam: true });  // vrije plek voor de lage camera
    B.naam = kiesWoord(B);  // naam van de kamer: op de dj-tafel en op het grote bord
    zetRoute(B, A);
    B.L = maakLicht(B);
    // de enige echte lampen (voor de figuren): tegenlicht achter de dj, in de break de spot op hem (eerst: dat krijgen we altijd),
    // en een accent boven het publiek (na de onderdelen)
    const key = ctx.licht(P.a.getHex(), 1.8, Math.max(A.w, A.d) * 0.9, B.focus.x, Math.min(A.plafondOp(B.focus.x, B.focus.z) - 0.5, B.focus.y + 2.6), B.focus.z);
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
    B.tegenPlek = zoekTegenPlek(B, A);  // camera tussen het publiek (tegenlicht): daar komt niemand te staan
    if (B.tegenPlek) B.obst.push({ x: B.tegenPlek.x, z: B.tegenPlek.z, r: 0.8, cam: true });
    yield;
    // overige onderdelen: hooguit drie; drukke schildering = geen muurwerk en minder. Een tweede middenplek krijgt een eigen
    // stuk (totem, kristallen, paalpodium): de middenstukken van onderdelen.js hebben hun eigen dj.
    let ruimte = SCHILD[schild].drukte > 0.75 ? 2 : 3;
    if (A.midden && A.midden.length && r() < 0.65) {
      const plek = kies(r, A.midden);
      eigenMidden(B, plek);
      B.obst.push({ x: plek.x, z: plek.z, r: plek.r });
      yield;
    }
    if (A.plafondH && wilPlafond && ruimte > 0) { if (plaatsOnderdeel(B, 'plafond', { h: A.plafondH })) ruimte--; else if (A.vorm === 'recht' || A.vorm === 'galerij') plafondBalken(B, A.w - 2, A.d, A.plafondH - 0.35); yield; }
    else if (!A.plafondH && spiegelClub && ruimte > 0) { if (plaatsOnderdeel(B, 'plafond', { h: Math.min(A.plafondOp(0, 0), 7) }, 'spiegelbol')) ruimte--; yield; }
    if (A.muurH && SCHILD[schild].drukte < 0.75 && ruimte > 0 && r() < 0.5 && plaatsOnderdeel(B, 'muur', { w: A.w, d: A.d, h: A.muurH, deuren: [{ x: 0, z: -A.d / 2, b: 2, h: 2.6 }, { x: 0, z: A.d / 2, b: 2, h: 2.6 }] })) { ruimte--; B.wandMarge = 0.75; yield; }
    if (A.vloerOK && ruimte > 0 && r() < (C.vloerKans == null ? 0.4 : C.vloerKans) && plaatsOnderdeel(B, 'vloer', { w: A.w, d: A.d })) { ruimte--; yield; }
    if (ruimte > 0 && r() < 0.6) plaatsOnderdeel(B, 'show', { w: A.w, d: A.d, h: A.h });
    const ap = B.tegenPlek || B.dj.lok(0, 0, 4);
    const accent = ctx.licht(P.b.getHex(), 0, 9, ap.x, Math.min(A.plafondOp(ap.x, ap.z) - 0.4, 3.6), ap.z);
    yield;
    // publiek, licht en borden
    bevolk(B, A);
    yield;
    // de show: ledscherm, rig (tegenlicht + plafond), lasers (tenzij een onderdeel al lasers heeft), stroboscopen, waas
    if (A.scherm) maakScherm(B, A.scherm);
    maakRig(B, tegenBronnen(B, A).concat((A.bundels || []).map(q => Object.assign({ soort: 'plafond' }, q))));
    if (!B.onderdelen.some(o => /laser/.test(o.naam)) && r() < C.laser) maakLasers(B, laserBronnen(B, A));
    if (!B.onderdelen.some(o => o.naam === 'stroboscoop') && C.strobo >= 0.6) maakStrobo(B);
    maakWaas(B, Math.round(4 * (C.waas || 1)), -A.w / 2 + 2, A.w / 2 - 2, Math.min(A.h - 1.2, 3.4), Math.min(A.h - 0.6, 4.2), -A.d / 2 + 2.5, A.d / 2 - 2.5);
    // borden: de naam groot aan de wand, boven de uitgang een ander woord (tussen deur en plafond, anders niet)
    let bord = null, uitBord = null;
    if (A.bord) { bord = ctx.neon(B.naam, css(P.a), A.bord.b, A.bord.b / 4); if (bord) { bord.position.set(A.bord.x, A.bord.y, A.bord.z); bord.rotation.y = A.bord.ry; } }
    const uitTop = Math.min(A.plafondOp(0, A.d / 2 - 0.1) - 0.15, 3.75), uitH = Math.min(0.8, uitTop - 2.75);
    if (uitH >= 0.3 && !(A.bord && A.bord.z > A.d / 2 - 0.5)) {
      uitBord = ctx.neon(kiesWoord(B), css(P.b), Math.min(uitH * 4, A.w - 1), uitH);
      if (uitBord) { uitBord.position.set(0, uitTop - uitH / 2, A.d / 2 - 0.08); uitBord.rotation.y = Math.PI; }
    }
    yield;
    // statisch spul samenvoegen, ledlijnen klaar
    if (B.vast.length) G.add(new THREE.Mesh(samen(B.vast), B.M.vast));  // onverlicht: licht alleen waar de show het raakt
    B.vloerMesh = bouwVloer(B, A);  // vloer + treden + podia + verhogingen: één ledvloer
    B.net.klaar();
    yield;
    // camera's kijken naar het licht: naast die van de architectuur (top mag nu overal: de vloer is een ledvloer) de schermwand, de
    // ledvloer, het ledplafond en tegen het licht in. De club weegt: een shot komt 0-3 keer in de stapel van de regisseur, het
    // heldenshot (de drop) is het eerste uit de held-lijst van de club dat er is.
    const camDefs = A.cams(B);
    if (B.tegenPlek) camDefs.lijst.push(CAM.tegen(B));
    camDefs.lijst.push(CAM.scherm(B, A), CAM.vloer(B, A));
    if (B.M.ledPlafond) camDefs.lijst.push(CAM.plafond(B, A));
    if (B.dj.viaMidden) camDefs.lijst = camDefs.lijst.filter(k => k.naam !== 'schouder');
    const gewogen = [];
    for (const k of camDefs.lijst) { const n = Math.round(C.cam[k.naam] == null ? 1 : C.cam[k.naam]); for (let i = 0; i < n; i++) gewogen.push(k); }
    let held = null;
    for (const n of C.held || []) { held = camDefs.lijst.find(k => k.naam === n); if (held) break; }
    if (!held) held = (camDefs.held && camDefs.lijst.includes(camDefs.held) && camDefs.held) || camDefs.lijst.find(k => k.naam === 'laag') || camDefs.lijst[0];
    const cam = regisseur(B, A, new Set(gewogen).size >= 3 ? gewogen : camDefs.lijst, held);
    onthoud(GEHEUGEN.sfeer, sf, 3); onthoud(GEHEUGEN.schild, schild, 3);
    const stand = () => regie().stand || 'groove';
    let figKapot = false;
    const U = B.U, dj = B.dj, achter = dj.lok(0, dj.y + 2.3, -1.0), boven = dj.lok(0, dj.y + 2.9, 0.9), keyP = achter.clone(), vlekP = V(0, 0, 0);
    B.tegenLicht = keyP;
    function update(dt, now) {
      dt = Math.min(dt || 0, 0.1);
      const b = ctx.beat(), L = B.L;
      if (DH.ledHulp) DH.ledHulp.tik(b);  // gedeelde uniforms van de eigen ledschermen (zonder led.js); led.js werkt zijn eigen bij
      // clubkleuren: de ledschermen schuiven maar een beetje naar de kleuren van de show (break wat koeler, drop wat heter)
      B.ledMix.value = 0.04 * L.wGroove + (0.08 + 0.15 * L.opb) * L.wOpb + 0.3 * L.wBrk + 0.18 * L.wDrop;
      B.vlek.begin();
      L.stap(dt, b);
      // tegenlicht achter de dj (in de break: spot van boven op hem); lamp voor de figuren + lichtvlek voor wand, scherm en vloer
      keyP.lerpVectors(achter, boven, L.wBrk);
      const kv = L.wBrk * 0.9 + L.wGroove * (0.7 + 1.2 * b.pulse) + L.wOpb * (0.5 + 1.4 * L.opb) + L.wDrop * (1.5 + 1.6 * b.pulse);
      if (key) { key.position.copy(keyP); key.intensity = kv * L.dimF + L.flits * 1.2; key.color.copy(L.kl[0]).lerp(WIT, 0.7 * L.flits); }
      if (accent) { accent.intensity = (L.wGroove * (0.15 + 0.5 * b.bas) + L.wOpb * (0.2 + 0.6 * L.opb) + L.wDrop * (0.9 + 0.8 * b.pulse)) * L.dimF + 0.4 * L.flits; accent.color.copy(L.kl[1]).lerp(WIT, 0.5 * L.flits); }
      vlekP.lerpVectors(dj.lok(0, dj.y + 1.5, -0.8), dj.lok(0, dj.y + 0.4, 0.3), L.wBrk);
      B.vlek.zet(vlekP.x, vlekP.y, vlekP.z, 2.2 + 0.4 * L.wBrk, L.kl[0], (0.18 + 0.32 * L.wBrk + 0.25 * b.pulse * (1 - L.wBrk) + 0.3 * L.wDrop) * L.dimF, true);
      B.net.update(L, b);
      for (const bb of [bord, uitBord]) if (bb) bb.material.color.setScalar((0.6 + 0.5 * b.pulse) * Math.max(0.3, L.k) * (sf === 'rauw' && hash(Math.floor(now * 8), bb === bord ? 1 : 2) > 0.95 ? 0.15 : 1));
      for (const f of B.updates) f(dt, now, b, L);
      if (A.update) A.update(dt, now, b, L);
      B.vlek.klaar();
      // showMat: basis (bijna niets), stroboscoop (wit), uplighters langs de wanden (break uit, groove om en om op de tel,
      // opbouw een versnellend looplicht, drop alles vol op de kick)
      U.uBasis.value = (L.wBrk * 0.012 + L.wGroove * 0.035 + L.wOpb * (0.022 + 0.03 * L.opb) + L.wDrop * (0.035 + 0.015 * b.pulse)) * L.dimF;
      U.uFlits.value = L.flits * 0.3;
      U.uWasA.value.copy(L.kl[0]); U.uWasB.value.copy(L.kl[1]);
      U.uWasAlle.value = (L.wBrk * 0.05 * (0.6 + 0.4 * Math.sin(b.pos * Math.PI / 8)) + L.wGroove * 0.08 + L.wOpb * (0.06 + 0.25 * L.opb) + L.wDrop * (0.16 + 0.3 * b.pulse)) * L.dimF;
      U.uWasWis.value = (L.wGroove * 0.7 * (0.6 + 0.4 * b.pulse) + L.wDrop * (0.3 + 0.25 * b.pulse)) * L.dimF;
      U.uWasLoop.value = L.wOpb * (0.35 + 1.0 * L.opb) * L.dimF;
      U.uWasFase.value = (L.loop * 2) % 1000; U.uWasTel.value = L.tel % 2; U.uWasH.value = 1.5 + 1.6 * (L.wOpb * L.opb + L.wDrop);
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
    const kamer = { maat: { w: A.w, d: A.d, h: A.h }, route: A.route, blijf: S.blijf, cam, update, opruimen, publiek: B.publiek || null, shot: () => B.shotNu,
      stijl: { arch: archNaam, club, titel: C.titel, sfeer: sf, schild, palet: [css(P.a), css(P.b), css(P.c), css(P.donker)], opstelling: B.opstelling, onderdelen: B.onderdelen.map(o => o.soort + '/' + o.naam), figuren: B.figs.length + 1 } };
    DH.laatsteStijl = kamer.stijl;
    if (DH.stijl && DH.stijl.debug) DH.stijl.laatste = B;  // alleen voor de proef: de hele bouwcontext
    return kamer;
  }

  function maakKamer(archNaam, ctx) { const it = maakKamerStappen(archNaam, ctx); for (;;) { const s = it.next(); if (s.done) return s.value; } }

  // --- registreren: één soort per architectuur (de kern kiest nooit twee keer dezelfde soort achter elkaar) ---
  // maak geeft de generator: de kern bouwt hem in stukjes (doolhof/kern.js, kamerStappen)
  for (const naam of Object.keys(ARCH)) {
    const soort = DH.kamers && DH.kamers[naam] ? 'stijl-' + naam : naam;
    DH.registreer(soort, { gewicht: ARCH[naam].gewicht, maak: ctx => maakKamerStappen(naam, ctx) });
  }
  // testronde: DH.stijl.volgendeClub = 'bunker' (geldt voor de eerstvolgende stijlkamer die gebouwd wordt)
  DH.stijl = { ARCH, CLUB, SFEER, SCHILD, GEHEUGEN, maakKamer, volgendeClub: null };
})();

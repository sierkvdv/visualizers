// --- Doolhof: bibliotheek van kamer-onderdelen; doolhof/stijl.js stelt er kamers mee samen ---
// doolhof.onderdeel(soort, naam, { gewicht, past?(stijl), maak(ctx, stijl, plek) => { update?(dt, now, b, stand), opruimen?() } })
//   midden  middenstuk met de dj op plek {x,z,r} (publiek staat buiten r); geeft ook focus {x,y,z} terug (hoofd van de dj)
//   plafond rig onder het plafond (plek {h}); muur = langs de wanden (plek {w,d,h,deuren}: deuren en looppad |x| < 1,3 vrij)
//   vloer   vloer van w x d (plek {w,d}); show = lichtshow over de hele kamer (plek {w,d,h})
// stijl = { palet {a,b,c,donker}, maat {w,d,h}, muurTex, sfeer, energie }; stand = clubRegie.stand (groove/break/opbouw/drop).
// Alles onverlicht (basic, additief, shader) en samengevoegd of geïnstanced: weinig draw calls. Lampen alleen via ctx.licht,
// figuren alleen via ctx.figuur. Gedeelde texturen en vormen hebben userData.doolhofHouden (de kern ruimt ze nooit op).
// De bus van de kamer (ctx.groep.userData.dhBus) verbindt de onderdelen: shows zetten dim (blackout) en flits (stroboscoop),
// middenstukken zetten focus (waar de dj staat) en midden (plek + hoogste punt), zodat rigs en shows daar rekening mee houden.
// Lichtshow: de show-bus van de kern (window.doolhof.show) stuurt mee: stand en opbouw-voortgang (volger), in drop en break de
// kleuren van de show (volger(P) zet het palet P elk beeld om), blackout en stroboscoop (busLicht). Constructie is een donker
// silhouet (vastMesh gedempt), schilderingen en vloeren zijn donker tot de show ze raakt; bundels vervagen vlak voor de camera.
(() => {
  'use strict';
  const DH = window.doolhof = window.doolhof || {};
  DH.onderdelen = DH.onderdelen || {};
  DH.onderdeel = DH.onderdeel || function (soort, naam, def) {
    if (!soort || !naam || !def || typeof def.maak !== 'function') { console.error('doolhof.onderdeel: soort, naam en { gewicht, maak(ctx, stijl, plek) } nodig', soort, naam); return; }
    (DH.onderdelen[soort] = DH.onderdelen[soort] || {})[naam] = def;
  };
  if (typeof THREE === 'undefined' || typeof canvasTexture === 'undefined' || typeof additive === 'undefined') { console.warn('onderdelen: club-globals ontbreken'); return; }

  // gedeelde lader, gelijk aan die in doolhof/gangen.js (laadt eerder en wint): een Texture heeft in three r128 geen userData
  window.doolhof.tex = window.doolhof.tex || (() => { const c = {}; return (naam, herhaal) => { const k = naam + (herhaal ? '*' : ''); if (!c[k]) { const t = new THREE.TextureLoader().load('tex/doolhof/' + naam + '.jpg'); if (renderer.outputEncoding === THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding; if (herhaal) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.userData = t.userData || {}; t.userData.doolhofHouden = true; c[k] = t; } return c[k]; }; })();

  // --- kleine hulpjes ---
  const RONDE = Math.PI * 2;
  const klem = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
  const naar = (a, b, k) => a + (b - a) * k;
  const kies = (r, a) => a[Math.min(a.length - 1, Math.floor(r() * a.length))];
  const hex = c => '#' + c.getHexString();
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const WIT = new THREE.Color(1, 1, 1), ZWART = new THREE.Color(0, 0, 0);
  const ZAS = V(0, 0, 1), YAS = V(0, 1, 0);
  const _p = V(0, 0, 0), _s = V(0, 0, 0), _v = V(0, 0, 0), _w = V(0, 0, 0), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4(), _c = new THREE.Color();
  const mat = (x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
  function staaf(a, b, dik, dikY) {  // eenheidsvorm (lengte langs z) van a naar b
    _v.subVectors(b, a); const len = _v.length() || 1e-4;
    _q.setFromUnitVectors(ZAS, _v.divideScalar(len));
    return new THREE.Matrix4().compose(_p.addVectors(a, b).multiplyScalar(0.5), _q, _s.set(dik, dikY || dik, len));
  }
  const houdG = g => { g.userData.doolhofHouden = true; return g; };

  // vormen: de bovenste alleen als bron voor samenvoegen, de onderste worden echt getekend en gedeeld (houden)
  const GEO = {
    doos: new THREE.BoxGeometry(1, 1, 1),
    cil: new THREE.CylinderGeometry(1, 1, 1, 12),
    rond: new THREE.CylinderGeometry(1, 1, 1, 32),
    cz: new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1, true).rotateX(Math.PI / 2),  // buis langs z, doorsnede 1
    czDicht: new THREE.CylinderGeometry(0.5, 0.5, 1, 10).rotateX(Math.PI / 2),
    blok: houdG(new THREE.BoxGeometry(1, 1, 1)),
    obelisk: new THREE.CylinderGeometry(0.495, 0.7071, 1, 4, 1).rotateY(Math.PI / 4),
    punt: new THREE.ConeGeometry(0.7071, 1, 4).rotateY(Math.PI / 4),
    schaal: new THREE.CylinderGeometry(0.26, 0.12, 0.2, 12),
    kegel: houdG(new THREE.ConeGeometry(1, 1, 18, 1, true).translate(0, -0.5, 0).rotateX(-Math.PI / 2)),  // punt in de oorsprong, voet op z = 1
    straal: houdG(new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5)),  // laser: z 0..1
    straalG: houdG(new THREE.CylinderGeometry(5, 5, 1, 6, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5)),  // gloed eromheen (zelfde matrices)
    schijf: houdG(new THREE.CircleGeometry(1, 20)),
    vlak: houdG(new THREE.PlaneGeometry(1, 1)),
    bol: houdG(new THREE.SphereGeometry(1, 10, 8)),
    buisX: houdG(new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1, true).rotateZ(Math.PI / 2)),
    buisXg: houdG(new THREE.CylinderGeometry(2.5, 2.5, 1, 8, 1, true).rotateZ(Math.PI / 2)),
  };

  // --- gedeelde doeken: één keer tekenen, nooit weggooien ---
  const doek = {};
  function vasteTex(naam, w, h, teken, herhaal) {
    if (!doek[naam]) { const t = canvasTexture(w, h, teken); if (herhaal) t.wrapS = t.wrapT = THREE.RepeatWrapping; (t.userData = t.userData || {}).doolhofHouden = true; doek[naam] = t; }
    return doek[naam];
  }
  const gloedTex = () => vasteTex('gloed', 128, 128, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const ringTex = () => vasteTex('ring', 128, 128, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.62, 'rgba(255,255,255,0)'); gr.addColorStop(0.8, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const wasTex = () => vasteTex('was', 16, 128, (g, w, h) => {  // strijklicht: fel onderaan, naar boven uitlopend
    const gr = g.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const pixels = (g, w, h, f) => { const img = g.createImageData(w, h), d = img.data; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4, c = f(x / w, y / h); d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = c[3] == null ? 255 : c[3]; } g.putImageData(img, 0, 0); };
  const speakerTex = () => vasteTex('speaker', 256, 256, (g, w, h) => {
    pixels(g, w, h, (u, v) => {
      const x = u * 2 - 1, y = v * 2 - 1, r = Math.hypot(x, y), a = Math.atan2(y, x);
      if (r > 0.98) return [14, 14, 16];
      if (r > 0.86) { const k = 40 + 50 * Math.sin((r - 0.86) / 0.12 * Math.PI) * (0.8 + 0.2 * Math.cos(a + 0.8)); return [k, k, k + 4]; }  // rolrand
      if (r < 0.24) { const k = 30 + 120 * Math.max(0, 1 - Math.hypot(x + 0.07, y + 0.08) / 0.17); return [k, k, k + 6]; }  // stofkap met glimlicht
      const k = 18 + 26 * (r - 0.24) + 10 * Math.sin(r * 60) * 0.3 + 14 * Math.max(0, Math.cos(a + 0.8)) * (1 - r);
      return [k, k, k + 3];
    });
  });
  const vinylTex = () => vasteTex('vinyl', 1024, 1024, (g, w, h) => {  // groeven als dunne boogjes (per pixel duurde ~0,3 s)
    const c = w / 2;
    g.fillStyle = '#0a0a0b'; g.beginPath(); g.arc(c, c, c, 0, RONDE); g.fill();
    g.lineWidth = 1.2;
    for (let r = c * 0.4; r < c * 0.97; r += 1.6) {
      const spoor = Math.floor((r / c - 0.4) * 9) % 2 === 0, k = (spoor ? 16 : 9) + Math.floor(Math.random() * (spoor ? 14 : 5));
      g.strokeStyle = `rgb(${k},${k},${k + 2})`; g.beginPath(); g.arc(c, c, r, 0, RONDE); g.stroke();
    }
    g.strokeStyle = '#2a2a2c'; g.lineWidth = 3; g.beginPath(); g.arc(c, c, c * 0.985, 0, RONDE); g.stroke();
    g.fillStyle = '#3c3c3c'; g.beginPath(); g.arc(c, c, c * 0.345, 0, RONDE); g.fill();
  });
  const labelTex = () => vasteTex('label', 256, 256, (g, w, h) => {
    const c = w / 2;
    g.fillStyle = '#e8e8e8'; g.beginPath(); g.arc(c, c, c, 0, RONDE); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 3; g.beginPath(); g.arc(c, c, c - 14, 0, RONDE); g.stroke();
    g.fillStyle = '#202020'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'italic 800 26px "Helvetica Neue", Arial, sans-serif'; g.fillText('DEEP SAMSO', c, c - 92);  // bij de rand: het midden zit onder de spil
    g.font = '700 16px "Helvetica Neue", Arial, sans-serif'; g.fillText('33 RPM  ·  SIDE A', c, c + 86);
    g.font = '600 13px "Helvetica Neue", Arial, sans-serif'; g.fillText('BLOODLINE PROJECT', c, c + 104);
    g.fillStyle = '#000'; g.beginPath(); g.arc(c, c, 7, 0, RONDE); g.fill();
  });
  const glansTex = () => vasteTex('glans', 256, 256, (g, w, h) => {  // twee tegenover elkaar liggende glanswiggen (blijven staan als de plaat draait)
    pixels(g, w, h, (u, v) => {
      const x = u * 2 - 1, y = v * 2 - 1, r = Math.hypot(x, y), a = Math.atan2(y, x);
      if (r > 0.98 || r < 0.36) return [0, 0, 0, 0];
      const wig = Math.exp(-Math.pow(Math.sin(a - 0.6) / 0.16, 2)), k = 255 * wig * (0.55 + 0.45 * Math.sin(r * 40)) * Math.min(1, (0.98 - r) * 12);
      return [k, k, k, 255];
    });
  });
  const matcapTex = () => vasteTex('matcap', 256, 256, (g, w, h) => {  // spiegelbol: grijze bol vol felle glimpjes
    const gr = g.createRadialGradient(w * 0.42, h * 0.38, 4, w / 2, h / 2, w / 2);
    gr.addColorStop(0, '#d8d8e0'); gr.addColorStop(0.5, '#5a5a66'); gr.addColorStop(1, '#141418');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) { const a = Math.random() * RONDE, r = Math.sqrt(Math.random()) * w * 0.48, s = 2 + Math.random() * 5; g.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.7})`; g.fillRect(w / 2 + Math.cos(a) * r - s / 2, h / 2 + Math.sin(a) * r - s / 2, s, s); }
  });

  // --- palet, maat en de stand van de muziek ---
  function palet(stijl) {
    const p = (stijl && stijl.palet) || {}, k = (x, d) => (x && x.isColor ? x.clone() : new THREE.Color(x != null ? x : d));
    return { a: k(p.a, 0xff2d95), b: k(p.b, 0x00e5ff), c: k(p.c, 0xffe600), donker: k(p.donker, 0x0b0812) };
  }
  const maatVan = (stijl, plek) => { const m = (stijl && stijl.maat) || {}, p = plek || {}; return { w: +p.w || +m.w || 12, d: +p.d || +m.d || 14, h: +p.h || +m.h || 4.5 }; };
  const sfeerVan = stijl => (stijl && stijl.sfeer) || 'rauw';
  const energieVan = stijl => klem(stijl && stijl.energie != null ? +stijl.energie : 0.6);
  function bouwKleur(sf, P) {  // kleur van de constructie per sfeer (onverlicht: de schaduw zit in de hoekpunten)
    switch (sf) {
      case 'luxe': return { romp: new THREE.Color(0x17120c), rand: new THREE.Color(0xc9a24a), metaal: new THREE.Color(0xb8923a) };
      case 'futuristisch': return { romp: new THREE.Color(0x2c3038), rand: new THREE.Color(0xc8d2e0), metaal: new THREE.Color(0x8c96a6) };
      case 'organisch': return { romp: new THREE.Color(0x1a2016), rand: new THREE.Color(0x5a4228), metaal: new THREE.Color(0x7a5434) };
      case 'trippy': return { romp: P.donker.clone().lerp(P.a, 0.16), rand: P.b.clone().multiplyScalar(0.45), metaal: new THREE.Color(0x5e5a6c) };
      default: return { romp: new THREE.Color(0x151517), rand: new THREE.Color(0x3c3c40), metaal: new THREE.Color(0x5a5a60) };  // rauw: zwart staal, beton
    }
  }
  // show-bus van de kern (doolhof/kern.js: stand, opbouw, drop, flits, kleur(i), blackout); alleen lezen
  const showNu = () => { const s = DH.show; return s && typeof s === 'object' && typeof s.stand === 'string' && typeof s.kleur === 'function' ? s : null; };
  // volger: zachte gewichten voor groove/opbouw/drop/break, opbouw-voortgang (0..1 over 16 tellen), klap van de drop, tellen.
  // Met een palet P: in de drop en de break krijgt P de kleuren van de show (die wisselen op de tel), anders die van de kamer.
  function volger(P) {
    const P0 = P ? { a: P.a.clone(), b: P.b.clone(), c: P.c.clone() } : null;
    const v = { st: 'groove', brk: 0, opb: 0, drp: 0, hit: 0, en: 0.5, groove: 1, tel: 0, nieuw: false, fr: 0, dp: 0, vorig: null, opbStart: 0, P };
    v.stap = (dt, b, stand) => {
      const R = window.clubRegie || {}, sh = showNu(), st = (sh && sh.stand) || stand || R.stand || 'groove', eerste = v.vorig == null;
      if (P) {
        if (sh && (st === 'drop' || st === 'break')) { sh.kleur(0, P.a); sh.kleur(1, P.b); sh.kleur(2, P.c); }
        else { P.a.copy(P0.a); P.b.copy(P0.b); P.c.copy(P0.c); }
      }
      if (st !== v.st || eerste) {
        // klap alleen bij een echte, verse drop (niet als de kamer midden in een drop begint)
        if (st === 'drop') v.hit = R.dropBeat != null && R.dropBeat >= 0 ? Math.exp(-Math.max(0, b.pos - R.dropBeat) * 0.5) : (eerste ? 0 : 1);
        if (st === 'opbouw') v.opbStart = R.sinds != null && R.sinds <= b.pos && b.pos - R.sinds < 64 ? R.sinds : b.pos;
        v.st = st;
      }
      const k = eerste ? 1 : Math.min(1, dt * 2.5);  // eerste beeld: meteen in de stand van nu
      v.brk = naar(v.brk, st === 'break' ? 1 : 0, k);
      v.drp = naar(v.drp, st === 'drop' ? 1 : 0, eerste ? 1 : Math.min(1, dt * 9));  // de drop komt hard binnen
      v.opb = st === 'opbouw' ? (sh ? sh.opbouw : klem((b.pos - v.opbStart) / 16)) : naar(v.opb, 0, eerste ? 1 : Math.min(1, dt * 6));
      v.hit *= Math.exp(-dt * 1.5);
      v.en = naar(v.en, klem(b.energy), Math.min(1, dt * 2));
      v.groove = klem(1 - v.brk - v.drp - v.opb);
      const tel = Math.floor(b.pos); v.nieuw = tel !== v.tel; v.tel = tel; v.fr = b.pos - tel;
      v.dp = v.vorig == null ? 0 : klem(b.pos - v.vorig, 0, 0.5); v.vorig = b.pos;  // tellen sinds vorig beeld (tempovast integreren)
      return v;
    };
    return v;
  }
  const meng = (v, g, o, d, k) => v.groove * g + v.opb * o + v.drp * d + v.brk * k;
  function mengKl(uit, v, g, o, d, k) {
    const s = (v.groove + v.opb + v.drp + v.brk) || 1, a = v.groove / s, b = v.opb / s, c = v.drp / s, e = v.brk / s;
    return uit.setRGB(g.r * a + o.r * b + d.r * c + k.r * e, g.g * a + o.g * b + d.g * c + k.g * e, g.b * a + o.b * b + d.b * c + k.b * e);
  }

  // --- bus van de kamer ---
  function bus(ctx) { const u = ctx.groep.userData; return u.dhBus || (u.dhBus = { shows: [], focus: null, midden: null, dim: 0, flits: 0, helder: 1 }); }
  function busLicht(ctx) {  // samengevat over alle shows van de kamer en de show-bus: dim, flits en helder (= 1 - 0,85 dim)
    const B = bus(ctx), sh = showNu(); let dim = sh ? 0.45 * sh.blackout : 0, flits = sh ? 0.6 * sh.flits * (sh.stand === 'opbouw' ? 0.3 + 0.7 * sh.opbouw * sh.opbouw : 1) : 0;
    for (const s of B.shows) { if (s.dim > dim) dim = s.dim; if (s.flits > flits) flits = s.flits; }
    B.dim = dim; B.flits = flits; B.helder = 1 - 0.85 * dim; return B;
  }
  const focusVan = ctx => bus(ctx).focus || { x: 0, y: 1.6, z: 0 };
  const camLokaal = (ctx, uit) => ctx.groep.worldToLocal(uit.copy(camera.position));

  // --- samenvoegen: veel statische stukjes in één geometrie (één draw call) ---
  // deel = [geometrie, Matrix4, x?] met x = { kl: kleur, vlak: geen schaduw, k: groep in de gloed-shader, w: gewicht, h: halo }
  const LICHT = V(-0.35, 0.85, -0.4).normalize();
  const schaduw = n => 0.36 + 0.64 * Math.max(0, n.dot(LICHT)) + 0.1 * Math.max(0, -n.z);
  const plat = new WeakMap();
  const nietGeindexeerd = g => { if (!g.index) return g; let p = plat.get(g); if (!p) { p = g.toNonIndexed(); plat.set(g, p); } return p; };
  function samen(delen, opt) {
    opt = opt || {};
    const pos = [], nor = [], uv = [], col = [], ak = [], ag = [], au = [];
    const nm = new THREE.Matrix3(), v = V(0, 0, 0), n = V(0, 0, 0);
    for (const [geo, m, x] of delen) {
      const g = nietGeindexeerd(geo), P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
      nm.getNormalMatrix(m);
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i).applyMatrix4(m); pos.push(v.x, v.y, v.z);
        if (N) n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); else n.set(0, 1, 0);
        nor.push(n.x, n.y, n.z);
        uv.push(U ? U.getX(i) : 0, U ? U.getY(i) : 0);
        if (opt.kleur) { const k = (x && x.kl) || opt.kleur, s = (x && x.vlak ? 1 : schaduw(n)) * (opt.dof || 1); col.push(k.r * s, k.g * s, k.b * s); }
        if (opt.gloed) { ak.push((x && x.k) || 0); ag.push(x && x.w != null ? x.w : 1, (x && x.h) || 0); }
        if (opt.u) au.push(opt.u(v, x));
      }
    }
    const out = new THREE.BufferGeometry(), F = (a, k) => new THREE.Float32BufferAttribute(a, k);
    out.setAttribute('position', F(pos, 3)); out.setAttribute('normal', F(nor, 3)); out.setAttribute('uv', F(uv, 2));
    if (opt.kleur) out.setAttribute('color', F(col, 3));
    if (opt.gloed) { out.setAttribute('aK', F(ak, 1)); out.setAttribute('aG', F(ag, 2)); }
    if (opt.u) out.setAttribute('aU', F(au, 1));
    return out;
  }
  // vaste delen: onverlicht met ingebakken schaduw, gedempt (lichtshow: constructie is een donker silhouet, het licht doet het werk);
  // materiaal.color dimt mee met de show
  function vastMesh(parent, delen, kleur) {
    if (!delen.length) return null;
    const m = new THREE.MeshBasicMaterial({ vertexColors: true });
    parent.add(new THREE.Mesh(samen(delen, { kleur: kleur || new THREE.Color(0x202024), dof: 0.45 }), m));
    return m;
  }

  // --- gloed-shader: neonbuizen, ledranden; per groep (aK) een eigen sterkte en kleur, alles in één draw call ---
  const GN = 32;
  const VS_GLOED = `attribute float aK; attribute vec2 aG; uniform float uLev[${GN}]; uniform vec3 uKl[${GN}];
varying vec3 vC; varying float vF;
void main() {
  int i = int(aK + 0.5); float l = uLev[i] * aG.x;
  vC = mix(uKl[i], vec3(1.0), 0.45 * (1.0 - aG.y) * clamp(l - 0.55, 0.0, 1.0)) * l;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float f = abs(dot(normalize(normalMatrix * normal), normalize(-mv.xyz)));
  vF = mix(1.0, f * f, aG.y);
  gl_Position = projectionMatrix * mv;
}`;
  const FS_GLOED = `uniform float uMaster; varying vec3 vC; varying float vF;
void main() { gl_FragColor = vec4(vC * vF * uMaster, 1.0); }`;
  function gloedMesh(parent, delen) {
    if (!delen.length) return null;
    const lev = new Float32Array(GN), kl = [];
    for (let i = 0; i < GN; i++) kl.push(new THREE.Color(1, 1, 1));
    const m = new THREE.ShaderMaterial({ uniforms: { uLev: { value: lev }, uKl: { value: kl }, uMaster: { value: 1 } }, vertexShader: VS_GLOED, fragmentShader: FS_GLOED,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.Mesh(samen(delen, { gloed: true }), m); mesh.renderOrder = 2; parent.add(mesh);
    m.lev = lev; m.kl = kl; m.mesh = mesh;
    return m;
  }
  // neonbuis van a naar b: kern + (in hoog) een zachte halo eromheen
  function neon(gl, a, b, dik, k, Z, w = 1) {
    gl.push([GEO.cz, staaf(a, b, dik), { k, w }]);
    if (Z === 0) gl.push([GEO.cz, staaf(a, b, dik * 4.5), { k, w: w * 0.5, h: 1 }]);
  }
  function neonRing(gl, x, y, z, R, dik, k, Z, rx = 0, ry = 0, seg = 56) {
    gl.push([new THREE.TorusGeometry(R, dik / 2, 6, seg), mat(x, y, z, 1, 1, 1, rx, ry), { k }]);
    if (Z === 0) gl.push([new THREE.TorusGeometry(R, dik * 2.2, 6, seg), mat(x, y, z, 1, 1, 1, rx, ry), { k, w: 0.5, h: 1 }]);
  }

  // --- muziek-uniforms voor de shaders ---
  function mu(P, extra) {
    return Object.assign({
      uT: { value: 0 }, uPos: { value: 0 }, uPulse: { value: 0 }, uBas: { value: 0 }, uMid: { value: 0 }, uHoog: { value: 0 }, uEn: { value: 0 },
      uBrk: { value: 0 }, uOpb: { value: 0 }, uDrp: { value: 0 }, uHit: { value: 0 }, uDim: { value: 0 }, uFlits: { value: 0 },
      uA: { value: P.a.clone() }, uB: { value: P.b.clone() }, uC: { value: P.c.clone() }, uD: { value: P.donker.clone() },
    }, extra || {});
  }
  function muZet(u, now, b, v, L) {
    if (v.P) { u.uA.value.copy(v.P.a); u.uB.value.copy(v.P.b); u.uC.value.copy(v.P.c); }  // kleuren van nu (zie volger)
    u.uT.value = now % 3600; u.uPos.value = ((b.pos % 64) + 64) % 64; u.uPulse.value = b.pulse; u.uBas.value = b.bas; u.uMid.value = b.mid; u.uHoog.value = b.hoog;
    u.uEn.value = v.en; u.uBrk.value = v.brk; u.uOpb.value = v.opb; u.uDrp.value = v.drp; u.uHit.value = v.hit; u.uDim.value = L.dim; u.uFlits.value = L.flits;
  }
  const GL_MU = `uniform float uT, uPos, uPulse, uBas, uMid, uHoog, uEn, uBrk, uOpb, uDrp, uHit, uDim, uFlits;
uniform vec3 uA, uB, uC, uD;
float hash1(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float ruis(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x), f.y); }
vec3 pal3(float t) { t = fract(t) * 3.0; vec3 c = mix(uA, uB, clamp(t, 0.0, 1.0)); c = mix(c, uC, clamp(t - 1.0, 0.0, 1.0)); return mix(c, uA, clamp(t - 2.0, 0.0, 1.0)); }
float wGroove() { return clamp(1.0 - uBrk - uDrp - uOpb, 0.0, 1.0); }
float kw(float x) { return x * x; }
`;
  const VS_UV = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  const VS_VLOER = `varying vec2 vUv; varying vec2 vP; void main() { vUv = uv; vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  const shader = (u, vs, fs, extra) => new THREE.ShaderMaterial(Object.assign({ uniforms: u, vertexShader: vs, fragmentShader: fs }, extra || {}));
  const plusOpties = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };

  // --- bundels en lasers: geïnstancede kegels/buizen met zachte randen; per exemplaar kleur x sterkte ---
  const VS_BUNDEL = `varying float vT; varying float vF; varying vec3 vC;
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
  vec4 mv = modelViewMatrix * lp;
  vF = abs(dot(normalize(normalMatrix * n), normalize(-mv.xyz))) * smoothstep(0.5, 2.6, length(mv.xyz));  // vlak voor de lens: weg
  vT = uv.y;
  gl_Position = projectionMatrix * mv;
}`;
  const FS_BUNDEL = `uniform float uOp, uScherp, uVerloop; uniform vec3 uKleur; varying float vT; varying float vF; varying vec3 vC;
void main() { float a = pow(vF, uScherp) * mix(1.0, 0.05 + 0.95 * vT * vT, uVerloop); gl_FragColor = vec4(vC * uKleur * a * uOp, 1.0); }`;
  const bundelMat = (op, scherp, verloop) => shader({ uOp: { value: op }, uScherp: { value: scherp }, uVerloop: { value: verloop }, uKleur: { value: new THREE.Color(1, 1, 1) } },
    VS_BUNDEL, FS_BUNDEL, Object.assign({ side: THREE.DoubleSide }, plusOpties));
  function inst(parent, geo, m, n, kleur) {
    const im = new THREE.InstancedMesh(geo, m, n); im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < n; i++) { im.setMatrixAt(i, _m); if (kleur !== false) im.setColorAt(i, kleur || WIT); }
    parent.add(im); return im;
  }
  const klaar = (...ms) => { for (const m of ms) if (m) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; } };
  const weg = (...ms) => { for (const m of ms) if (m && m.isInstancedMesh) m.dispose(); };
  // afstand van p langs (eenheids)richting d tot de binnenkant van de kamer; RAAK.vlak = welk vlak (0 -x, 1 +x, 2 vloer, 3 plafond, 4 -z, 5 +z)
  const RAAK = { vlak: 2 };
  const VLAK_N = [V(1, 0, 0), V(-1, 0, 0), V(0, 1, 0), V(0, -1, 0), V(0, 0, 1), V(0, 0, -1)].map(n => new THREE.Quaternion().setFromUnitVectors(ZAS, n));
  function uitDoos(p, d, M, marge = 0.03) {
    let t = 80, f = 2; const hw = M.w / 2 - marge, hd = M.d / 2 - marge;
    const zet = (u, k) => { if (u < t) { t = u; f = k; } };
    if (d.x > 1e-4) zet((hw - p.x) / d.x, 1); else if (d.x < -1e-4) zet((-hw - p.x) / d.x, 0);
    if (d.y > 1e-4) zet((M.h - marge - p.y) / d.y, 3); else if (d.y < -1e-4) zet((marge - p.y) / d.y, 2);
    if (d.z > 1e-4) zet((hd - p.z) / d.z, 5); else if (d.z < -1e-4) zet((-hd - p.z) / d.z, 4);
    RAAK.vlak = f; return Math.max(0.05, t);
  }
  // lichtvlek op een wand, vloer of plafond (vlak uit uitDoos)
  function vlekZet(im, i, p, vlak, s, kleur, sterkte) {
    _p.copy(p); const n = vlak; if (n === 2) _p.y += 0.02; else if (n === 3) _p.y -= 0.02; else if (n === 0) _p.x += 0.02; else if (n === 1) _p.x -= 0.02; else if (n === 4) _p.z += 0.02; else _p.z -= 0.02;
    _m.compose(_p, VLAK_N[n], _s.set(s, s, s)); im.setMatrixAt(i, _m); im.setColorAt(i, _c.copy(kleur).multiplyScalar(sterkte));
  }
  const vlekMat = () => { const m = additive(0xffffff, 1); m.map = gloedTex(); return m; };
  const verstop = (im, i) => { _m.makeScale(0, 0, 0); im.setMatrixAt(i, _m); };

  // --- registreren met vangnet: een fout in één onderdeel legt de kamer niet stil ---
  function reg(soort, naam, def) {
    const maak = def.maak;
    DH.onderdeel(soort, naam, Object.assign({}, def, {
      maak(ctx, stijl, plek) {
        let o;
        try { o = maak(ctx, stijl || {}, plek || {}) || {}; } catch (e) { console.error('doolhof-onderdeel ' + soort + '/' + naam + ' bouwen', e); return {}; }
        const upd = o.update, opr = o.opruimen; let kapot = false;
        if (upd) o.update = (dt, now, b, stand) => {
          if (kapot) return;
          try { upd(Math.max(0, Math.min(0.1, +dt || 0)), now != null ? now : performance.now() / 1000, b || ctx.beat(), stand || (window.clubRegie && window.clubRegie.stand) || 'groove'); }
          catch (e) { kapot = true; console.error('doolhof-onderdeel ' + soort + '/' + naam + ' update', e); }
        };
        if (opr) o.opruimen = () => { try { opr(); } catch (e) { console.error('doolhof-onderdeel ' + soort + '/' + naam + ' opruimen', e); } };
        return o;
      },
    }));
  }

  // ======================================================================================================================
  // MIDDENSTUKKEN: de dj (ctx.figuur rol 'dj', op een verhoging via yOff) kijkt naar de ingang (-z); alles binnen straal r
  // ======================================================================================================================
  function middenGroep(ctx, plek) {
    const px = +plek.x || 0, pz = +plek.z || 0, R = klem(+plek.r || 3, 1.5, 6);
    const g = new THREE.Group(); g.position.set(px, 0, pz); ctx.groep.add(g);
    return { g, px, pz, R };
  }
  function djZet(ctx, x, y, z, face) {  // pose zet de wortel elk beeld op home + yOff: zo staat de dj op zijn verhoging
    const d = ctx.figuur({ x, z, face: face == null ? Math.PI : face, rol: 'dj' });
    if (d) { d.yOff = y; d.root.position.y = y; }
    bus(ctx).focus = { x, y: y + 1.55, z };
    return d;
  }
  const middenMeld = (ctx, x, z, r, top) => { bus(ctx).midden = { x, z, r, top }; };
  // dj-meubel (in de ruimte van het middenstuk), de dj staat erachter op z + 0,55: tafel, twee draaitafels, mixer, ledstrips (gloed k)
  function djTafel(vast, gl, x, y, z, breed, kl, k) {
    const b = breed || 1.5, licht = kl.clone().multiplyScalar(1.8).addScalar(0.03), grijs = new THREE.Color(0x3a3a40), zw = new THREE.Color(0x070708);
    vast.push([GEO.doos, mat(x, y + 0.46, z, b, 0.92, 0.6), { kl }]);
    vast.push([GEO.doos, mat(x, y + 0.935, z, b + 0.06, 0.03, 0.66), { kl: licht }]);
    for (const s of [-1, 1]) {
      vast.push([GEO.doos, mat(x + s * b * 0.3, y + 0.97, z + 0.02, 0.44, 0.04, 0.36), { kl: grijs }]);
      vast.push([GEO.cil, mat(x + s * b * 0.3, y + 0.995, z + 0.02, 0.15, 0.012, 0.15), { kl: zw }]);
    }
    vast.push([GEO.doos, mat(x, y + 0.975, z + 0.02, 0.3, 0.05, 0.34), { kl: grijs }]);
    gl.push([GEO.doos, mat(x, y + 0.86, z - 0.305, b * 0.94, 0.03, 0.01), { k }]);
    gl.push([GEO.doos, mat(x, y + 0.05, z - 0.305, b * 0.94, 0.02, 0.01), { k }]);
  }
  // vlam op een schaal: twee gekruiste vlakken met een vuur-shader (pyro bij de drop: de mesh rekt omhoog)
  const FS_VLAM = `uniform float uT, uLev, uZaad; uniform vec3 uKl; varying vec2 vUv;
void main() {
  float y = vUv.y, x = (vUv.x - 0.5) * 2.0, t = uT + uZaad;
  float golf = sin(y * 7.0 - t * 9.0) * 0.16 + sin(y * 13.0 - t * 15.0 + 1.7) * 0.08;
  float d = abs(x + golf * y * 1.4) / ((1.0 - y) * 0.8 + 0.06);
  float tong = 1.0 - smoothstep(0.15, 1.0, d);
  float a = tong * (1.0 - smoothstep(0.3, 1.0, y)) * smoothstep(0.0, 0.05, y);
  vec3 c = mix(uKl, vec3(1.0, 0.92, 0.7), smoothstep(0.4, 1.0, tong) * (1.0 - y));
  gl_FragColor = vec4(c * a * uLev, 1.0);
}`;
  let vlamGeo = null;
  function vlam(parent, x, y, z, kleur, zaad) {
    if (!vlamGeo) { const p = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0); vlamGeo = houdG(samen([[p, new THREE.Matrix4()], [p, mat(0, 0, 0, 1, 1, 1, 0, Math.PI / 2)]])); }
    const m = shader({ uT: { value: 0 }, uLev: { value: 1 }, uZaad: { value: zaad * 10 }, uKl: { value: kleur.clone() } }, VS_UV, FS_VLAM, Object.assign({ side: THREE.DoubleSide }, plusOpties));
    const mesh = new THREE.Mesh(vlamGeo, m); mesh.position.set(x, y, z); mesh.renderOrder = 3; parent.add(mesh);
    return { mesh, m };
  }
  const vuurKleur = (sf, P) => (sf === 'trippy' || sf === 'futuristisch') ? P.a.clone() : new THREE.Color(0xff5a12);

  // ----- 1. Altaar: trap-piramide met gloeiende treden, obelisken, een halo achter de dj en vuurschalen (pyro in de drop) -----
  reg('midden', 'altaar', { gewicht: 1, past: s => s.sfeer !== 'futuristisch', maak(ctx, stijl, plek) {
    const r = ctx.rnd, Z = ctx.zwaar, P = palet(stijl), M = maatVan(stijl), sf = sfeerVan(stijl), BK = bouwKleur(sf, P);
    const { g, px, pz, R } = middenGroep(ctx, plek);
    const R0 = Math.max(1.45, R * 0.7), N = Math.max(2, Math.min(Z === 0 ? 4 : 3, Math.floor((R0 - 1.15) / 0.32) + 1)), SH = 0.27;
    const RT = klem(R0 * 0.42, 1.15, 1.6), top = N * SH, vast = [], gl = [];
    for (let i = 0; i < N; i++) {
      const s = N > 1 ? R0 - (R0 - RT) * i / (N - 1) : RT, y0 = i * SH, e = s + 0.012, y = y0 + SH + 0.012;
      vast.push([GEO.doos, mat(0, y0 + SH / 2, 0, s * 2, SH, s * 2), { kl: BK.romp }]);
      vast.push([GEO.doos, mat(0, y0 + SH - 0.02, 0, s * 2 + 0.03, 0.04, s * 2 + 0.03), { kl: BK.rand }]);
      for (const [a, b] of [[[-e, -e], [e, -e]], [[-e, -e], [-e, e]], [[e, -e], [e, e]], [[-e, e], [e, e]]]) neon(gl, V(a[0], y, a[1]), V(b[0], y, b[1]), 0.03, i, Z);
    }
    // obelisken achter op het plateau, met gloeiende ribben
    const HP = klem(M.h - top - 0.7, 1.2, 2.6), ob = RT - 0.28;
    for (const sx of [-1, 1]) {
      const x = sx * ob, z = ob;
      vast.push([GEO.obelisk, mat(x, top + HP / 2, z, 0.26, HP, 0.26), { kl: BK.romp }]);
      vast.push([GEO.punt, mat(x, top + HP + 0.11, z, 0.182, 0.22, 0.182), { kl: BK.rand }]);
      for (const [cx, cz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) neon(gl, V(x + cx * 0.13, top, z + cz * 0.13), V(x + cx * 0.091, top + HP, z + cz * 0.091), 0.02, N, Z);
    }
    // halo achter het hoofd van de dj
    const ringY = top + 1.6, ringR = klem(M.h - 0.25 - ringY, 0.6, 1.3);
    neonRing(gl, 0, ringY, RT - 0.12, ringR, 0.05, N + 1, Z);
    neonRing(gl, 0, ringY, RT - 0.1, ringR * 0.78, 0.022, N + 2, Z);
    // vuurschalen op de voorhoeken van het plateau
    const vk = vuurKleur(sf, P), vlammen = [], vlamMax = Math.max(0.8, M.h - 0.15 - (top + 0.74));
    for (const sx of [-1, 1]) {
      const x = sx * (RT - 0.26), z = -(RT - 0.26);
      vast.push([GEO.cil, mat(x, top + 0.28, z, 0.08, 0.56, 0.08), { kl: BK.romp }]);
      vast.push([GEO.schaal, mat(x, top + 0.65, z), { kl: BK.rand }]);
      gl.push([GEO.cil, mat(x, top + 0.75, z, 0.22, 0.02, 0.22), { k: N + 4 }]);
      if (Z < 2) vlammen.push(vlam(g, x, top + 0.74, z, vk, r()));
    }
    djTafel(vast, gl, 0, top, -0.25, 1.5, BK.romp, N + 3);
    const vm = vastMesh(g, vast), gm = gloedMesh(g, gl);
    const dj = djZet(ctx, px, top, pz + 0.3);
    let logo = null;
    if (Z < 2) { logo = ctx.neon(kies(r, ['DEEP SAMSO', 'BLOODLINE', 'SAMSO']), hex(P.c), 1.3, 0.325); logo.position.set(px, top + 0.46, pz - 0.25 - 0.32); logo.rotation.y = Math.PI; }
    const L1 = ctx.licht(P.a.clone().lerp(WIT, 0.55), 1.4, 9, px, top + 2.6, pz - 1.0);
    middenMeld(ctx, px, pz, R, top + HP + 0.3);
    const v = volger(P), kTrap = [], kWit = P.a.clone().lerp(WIT, 0.6);
    for (let i = 0; i < N; i++) kTrap.push(P.a.clone().lerp(P.b, N > 1 ? i / (N - 1) : 0));
    let ch = 0;
    return { focus: { x: px, y: top + 1.6, z: pz + 0.3 }, dj,
      update(dt, now, b, stand) {
        v.stap(dt, b, stand); const L = busLicht(ctx), H = L.helder, F = L.flits;
        ch += v.dp * (1 + 3 * v.opb * v.opb);  // looplicht de trap op, in de opbouw steeds sneller
        const c = ch % (N + 1), dropKl = v.tel % 2 ? P.c : P.a;
        for (let i = 0; i < N; i++) {
          const golf = Math.exp(-Math.pow(c - i, 2) * 2.5);
          gm.lev[i] = meng(v, 0.14 + 0.9 * golf + 0.2 * b.pulse, 0.2 + 0.5 * v.opb + 0.8 * golf, 0.65 + 0.35 * b.pulse + v.hit, i === N - 1 ? 0.12 + 0.1 * Math.sin(now * 1.6) : 0.025) * H + F;
          mengKl(gm.kl[i], v, kTrap[i], kWit, dropKl, P.b);
        }
        gm.lev[N] = meng(v, 0.3 + 0.7 * b.bas, 0.25 + 0.75 * v.opb + 0.3 * b.pulse, 0.8 + 0.2 * b.pulse + v.hit, 0.06) * H + F; gm.kl[N].copy(P.b);
        gm.lev[N + 1] = meng(v, 0.35 + 0.65 * b.pulse, 0.3 + 0.7 * v.opb, 0.7 + 0.3 * b.pulse + v.hit, 0.15 + 0.08 * Math.sin(now)) * H + F; gm.kl[N + 1].copy(P.c);
        gm.lev[N + 2] = meng(v, 0.2 + 0.8 * b.bas, 0.3 + 0.6 * v.opb, 0.9, 0.05) * H + F; gm.kl[N + 2].copy(P.a);
        gm.lev[N + 3] = (0.35 + 0.65 * b.pulse) * H + F; gm.kl[N + 3].copy(P.b);
        gm.lev[N + 4] = (0.55 + 0.25 * Math.sin(now * 11) * Math.sin(now * 7.3)) * (1 - 0.6 * v.brk); gm.kl[N + 4].copy(vk);
        // vuur: klein flakkeren, groeien in de opbouw, steekvlam op de drop en daarna elke 4 tellen
        const f4 = b.pos % 4, pyro = v.drp * (f4 < 0.8 ? 1 - f4 / 0.8 : 0), boost = Math.max(v.hit, pyro, 0.8 * v.opb * v.opb);
        for (const fl of vlammen) {
          const sy = naar(1.0, vlamMax, boost) * (1 - 0.55 * v.brk), sx = 0.62 + 0.4 * boost;
          fl.mesh.scale.set(sx, sy, sx);
          fl.m.uniforms.uT.value = now % 3600; fl.m.uniforms.uLev.value = (0.75 + 0.35 * boost + 0.1 * b.bas) * (1 - 0.5 * v.brk) * H + F;
          fl.m.uniforms.uKl.value.copy(vk).lerp(WIT, 0.3 * pyro);
        }
        if (vm) vm.color.setScalar(H + 0.5 * F);
        if (logo) logo.material.color.setScalar((0.55 + 0.45 * b.pulse) * H * (1 - 0.6 * v.brk) + F);
        if (L1) L1.intensity = meng(v, 1.0 + 0.6 * b.pulse, 0.8 + 0.8 * v.opb, 1.6 + 0.8 * b.pulse, 0.35) * H;
      } };
  } });

  // ----- 2. Kubus: de dj staat in een zwevende led-kubus (open voorkant), twee neonkaders draaien eromheen -----
  const FS_LED = GL_MU + `uniform vec2 uRaster; uniform float uZaad; varying vec2 vUv;
void main() {
  vec2 g = vUv * uRaster; vec2 cel = floor(g); vec2 f = fract(g) - 0.5; vec2 c = (cel + 0.5) / uRaster;
  float tel = floor(uPos);
  // groove: equalizer, links de bas en rechts het hoog
  float niveau = 0.12 + 0.75 * mix(uBas, uHoog, c.x) * (0.55 + 0.45 * sin(uT * 3.0 + cel.x * 1.7 + uZaad)) + 0.15 * uPulse;
  float g1 = step(c.y, niveau) * (0.4 + 0.6 * c.y / max(niveau, 0.1)) + step(abs(c.y - niveau - 0.06), 0.5 / uRaster.y) * 0.9;
  vec3 k1 = pal3(c.y * 0.6 + tel * 0.125);
  // opbouw: het vlak vult zich van onder, een witte scanlijn gaat steeds sneller
  float o1 = step(c.y, uOpb * 1.02) * 0.7 + step(abs(c.y - fract(uPos * (0.5 + 3.5 * uOpb))), 0.6 / uRaster.y) * 1.3;
  vec3 k2 = mix(uB, vec3(1.0), 0.3 + 0.5 * uOpb);
  // drop: ringen vanuit het midden op de tel
  float d1 = step(0.5, fract(length(c - 0.5) * 4.0 - uPos * 2.0)) * (0.45 + 0.55 * uPulse) + uHit;
  vec3 k3 = mod(tel, 2.0) < 1.0 ? uA : uC;
  // break: traag plasma, gedimd
  float p = sin(c.x * 6.0 + uT * 0.5) + sin(c.y * 5.0 - uT * 0.4) + sin((c.x + c.y) * 4.0 + uT * 0.3);
  float b1 = 0.2 * (0.5 + 0.5 * sin(p * 2.0));
  vec3 kleur = wGroove() * k1 * g1 + uOpb * k2 * o1 + uDrp * k3 * d1 + uBrk * uB * b1;
  float led = (1.0 - smoothstep(0.28, 0.5, length(f)));
  gl_FragColor = vec4(uD * 0.12 + (kleur * (1.0 - 0.85 * uDim) + uFlits * 0.5) * led, 1.0);
}`;
  function ledMat(P, raster, zaad, side) {
    const u = mu(P, { uRaster: { value: new THREE.Vector2(raster[0], raster[1]) }, uZaad: { value: zaad || 0 } });
    return shader(u, VS_UV, FS_LED, { side: side || THREE.FrontSide });
  }
  reg('midden', 'kubus', { gewicht: 1, past: s => s.sfeer !== 'organisch', maak(ctx, stijl, plek) {
    const r = ctx.rnd, Z = ctx.zwaar, P = palet(stijl), M = maatVan(stijl), BK = bouwKleur(sfeerVan(stijl), P);
    const { g, px, pz, R } = middenGroep(ctx, plek);
    const S = klem(Math.min(R * 0.9, M.h - 1.0), 2.1, 2.8), HV = 0.3, n = Z === 0 ? 22 : 16;
    const kub = new THREE.Group(); kub.position.y = HV; g.add(kub);
    const vlak = (bw, bh, x, y, z, rx, ry, v0, v1) => { const p = new THREE.PlaneGeometry(bw, bh), uv = p.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, v0 + uv.getY(i) * (v1 - v0)); return [p, mat(x, y, z, 1, 1, 1, rx, ry)]; };
    const lm = ledMat(P, [n, n], r() * 50, THREE.DoubleSide);
    kub.add(new THREE.Mesh(samen([vlak(S, S, 0, S / 2, S / 2, 0, Math.PI, 0, 1), vlak(S, S, -S / 2, S / 2, 0, 0, Math.PI / 2, 0, 1), vlak(S, S, S / 2, S / 2, 0, 0, -Math.PI / 2, 0, 1),
      vlak(S, S, 0, S, 0, Math.PI / 2, 0, 0, 1), vlak(S, 0.95, 0, 0.475, -S / 2, 0, Math.PI, 0, 0.95 / S), vlak(S, 0.3, 0, S - 0.15, -S / 2, 0, Math.PI, (S - 0.3) / S, 1)]), lm));
    const vast = [], gl = [], h = S / 2;
    vast.push([GEO.doos, mat(0, 0.05, 0, S, 0.1, S), { kl: BK.romp }]);
    for (const [a, b] of [[[-h, 0, -h], [h, 0, -h]], [[-h, 0, h], [h, 0, h]], [[-h, S, -h], [h, S, -h]], [[-h, S, h], [h, S, h]], [[-h, 0, -h], [-h, 0, h]], [[h, 0, -h], [h, 0, h]],
      [[-h, S, -h], [-h, S, h]], [[h, S, -h], [h, S, h]], [[-h, 0, -h], [-h, S, -h]], [[h, 0, -h], [h, S, -h]], [[-h, 0, h], [-h, S, h]], [[h, 0, h], [h, S, h]]]) neon(gl, V(...a), V(...b), 0.04, 0, Z);
    // tafel met draaitafels vlak achter de borstwering
    vast.push([GEO.doos, mat(0, 0.5, -h + 0.32, S * 0.7, 0.9, 0.42), { kl: BK.romp }]);
    for (const s of [-1, 1]) vast.push([GEO.cil, mat(s * S * 0.18, 0.97, -h + 0.32, 0.15, 0.02, 0.15), { kl: new THREE.Color(0x0a0a0c) }]);
    vast.push([GEO.doos, mat(0, 0.97, -h + 0.32, 0.28, 0.05, 0.3), { kl: new THREE.Color(0x3a3a40) }]);
    const vm = vastMesh(kub, vast), gm = gloedMesh(kub, gl);
    // twee neonkaders die om de kubus draaien
    const kader = new THREE.Group(); kader.position.y = HV + S / 2; g.add(kader);
    const F2 = Math.min(S * 1.5, R * 1.38) / 2, kl2 = [];
    for (const [k, y] of [[0, -S * 0.3], [1, S * 0.3]]) for (const [a, b] of [[[-F2, -F2], [F2, -F2]], [[F2, -F2], [F2, F2]], [[F2, F2], [-F2, F2]], [[-F2, F2], [-F2, -F2]]]) neon(kl2, V(a[0], y, a[1]), V(b[0], y, b[1]), 0.035, k, Z);
    const km = gloedMesh(kader, kl2);
    kader.rotation.y = r() * RONDE;
    // gloed eronder op de vloer
    const onder = new THREE.Mesh(GEO.schijf, plusMap(gloedTex())); onder.rotation.x = -Math.PI / 2; onder.position.y = 0.015; onder.scale.set(S * 1.05, S * 1.05, 1); g.add(onder);
    const zDJ = -h + 0.87, dj = djZet(ctx, px, HV + 0.1, pz + zDJ);  // vlak achter de tafel
    const L1 = ctx.licht(P.b.clone().lerp(WIT, 0.5), 1.2, 7, px, HV + S - 0.35, pz + zDJ - 0.4);
    middenMeld(ctx, px, pz, R, HV + S + 0.2);
    const v = volger(P); let bobB = 0;
    return { focus: { x: px, y: HV + 1.65, z: pz + zDJ }, dj,
      update(dt, now, b, stand) {
        v.stap(dt, b, stand); const L = busLicht(ctx), H = L.helder, F = L.flits;
        bobB = Math.max(bobB * Math.exp(-dt * 6), b.bas);
        const bob = 0.05 * Math.sin(now * 1.3) + 0.05 * bobB + 0.12 * v.hit;
        kub.position.y = HV + bob; if (dj) dj.yOff = HV + 0.1 + bob;
        kader.position.y = HV + S / 2 + bob * 0.5;
        kader.rotation.y += dt * (0.25 + 0.5 * v.en + 1.6 * v.opb + 2.2 * v.drp - 0.2 * v.brk);
        muZet(lm.uniforms, now, b, v, L);
        gm.lev[0] = meng(v, 0.45 + 0.55 * b.pulse, 0.4 + 0.6 * v.opb, 0.9 + v.hit, 0.12) * H + F; mengKl(gm.kl[0], v, P.a, WIT, v.tel % 2 ? P.c : P.a, P.b);
        const om = v.tel % 2;
        km.lev[0] = meng(v, 0.3 + 0.7 * b.pulse * (om ? 1 : 0.4), 0.3 + 0.7 * v.opb, om ? 1 + v.hit : 0.3, 0.06) * H + F;
        km.lev[1] = meng(v, 0.3 + 0.7 * b.pulse * (om ? 0.4 : 1), 0.3 + 0.7 * v.opb, om ? 0.3 : 1 + v.hit, 0.06) * H + F;
        mengKl(km.kl[0], v, P.b, P.b, P.a, P.b); mengKl(km.kl[1], v, P.c, P.c, P.b, P.b);
        if (vm) vm.color.setScalar(H + 0.5 * F);
        onder.material.color.copy(P.b).multiplyScalar(meng(v, 0.25 + 0.35 * b.bas, 0.25 + 0.4 * v.opb, 0.5 + 0.4 * b.pulse, 0.08) * H);
        if (L1) L1.intensity = meng(v, 0.9 + 0.5 * b.pulse, 0.7 + 0.9 * v.opb, 1.4 + 0.8 * b.pulse, 0.3) * H;
      } };
  } });
  function plusMap(map, kleur) { const m = additive(kleur == null ? 0xffffff : kleur, 1); m.map = map; return m; }

  // ----- 3. Ringen: rond podium, drie neonringen die als een gyroscoop om de dj kantelen en draaien -----
  const FS_STREEP = `uniform float uLev, uFase, uN, uBasis; uniform vec3 uKl; varying vec2 vUv;
void main() {
  float s = fract(vUv.x * uN - uFase);
  float streep = smoothstep(0.0, 0.08, s) * (1.0 - smoothstep(0.4, 0.55, s));
  float l = uLev * (uBasis + (1.0 - uBasis) * streep);
  gl_FragColor = vec4(mix(uKl, vec3(1.0), 0.35 * streep * clamp(uLev - 0.5, 0.0, 1.0)) * l, 1.0);
}`;
  reg('midden', 'ringen', { gewicht: 1, maak(ctx, stijl, plek) {
    const r = ctx.rnd, Z = ctx.zwaar, P = palet(stijl), M = maatVan(stijl), BK = bouwKleur(sfeerVan(stijl), P);
    const { g, px, pz, R } = middenGroep(ctx, plek);
    const RP = klem(R * 0.5, 1.25, 2.0), PH = 0.45, CY = Math.min(1.75, M.h / 2), n = Z === 2 ? 2 : 3, vast = [], gl = [];
    vast.push([GEO.rond, mat(0, PH / 2, 0, RP, PH, RP), { kl: BK.romp }]);
    vast.push([GEO.rond, mat(0, PH - 0.02, 0, RP + 0.03, 0.04, RP + 0.03), { kl: BK.rand }]);
    vast.push([GEO.rond, mat(0, 0.1, 0, RP + 0.35, 0.2, RP + 0.35), { kl: BK.romp.clone().multiplyScalar(0.8) }]);
    const NS = 24;  // ledrand in 24 stukjes: looplicht rond het podium
    for (let i = 0; i < NS; i++) { const a0 = i / NS * RONDE, a1 = (i + 0.85) / NS * RONDE, rr = RP + 0.035; neon(gl, V(Math.sin(a0) * rr, PH - 0.06, Math.cos(a0) * rr), V(Math.sin(a1) * rr, PH - 0.06, Math.cos(a1) * rr), 0.035, i, Z); }
    neonRing(gl, 0, 0.21, 0, RP + 0.36, 0.03, NS, Z, Math.PI / 2, 0, 64);
    djTafel(vast, gl, 0, PH, -0.3, 1.45, BK.romp, NS + 1);
    const vm = vastMesh(g, vast), gm = gloedMesh(g, gl);
    const ringen = [], kl = [P.a, P.b, P.c];
    for (let i = 0; i < n; i++) {
      const Ri = Math.max(RP + 0.35 + i * 0.3, Math.min(R - 0.12, RP + 0.55 + i * Math.max(0.3, (R - 0.12 - RP - 0.55) / Math.max(1, n - 1))));
      const m = shader({ uLev: { value: 1 }, uFase: { value: 0 }, uN: { value: 10 + i * 4 }, uBasis: { value: 0.3 }, uKl: { value: kl[i].clone() } }, VS_UV, FS_STREEP, plusOpties);
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(Ri, 0.045, 6, Z === 0 ? 120 : 72).rotateX(Math.PI / 2), m);
      mesh.position.y = CY; mesh.rotation.order = 'YXZ'; mesh.rotation.y = r() * RONDE; mesh.renderOrder = 2; g.add(mesh);
      ringen.push({ mesh, m, Ri, tmax: Math.min(0.9, Math.asin(klem((CY - 0.3) / Ri))), dir: i % 2 ? -1 : 1, kant: 0, fase: 0 });
    }
    const dj = djZet(ctx, px, PH, pz + 0.25);
    const L1 = ctx.licht(P.a.clone().lerp(WIT, 0.5), 1.3, 8, px, CY + 1.6, pz - 0.8);
    middenMeld(ctx, px, pz, R, CY + Math.max(...ringen.map(q => q.Ri * Math.sin(q.tmax))) + 0.2);
    const v = volger(P); let rond = 0;
    return { focus: { x: px, y: PH + 1.55, z: pz + 0.25 }, dj,
      update(dt, now, b, stand) {
        v.stap(dt, b, stand); const L = busLicht(ctx), H = L.helder, F = L.flits;
        ringen.forEach((q, i) => {
          const w = q.dir * (0.25 + 0.15 * i) * (0.6 + 0.6 * v.en) * (1 + 3 * v.opb) * (1 + 3 * v.drp) * (1 - 0.7 * v.brk);
          q.mesh.rotation.y += w * dt;
          const doel = meng(v, q.tmax * (0.35 + 0.25 * Math.sin(now * 0.3 + i * 2)), q.tmax * v.opb, q.tmax * (0.55 + 0.45 * Math.sin(b.pos * Math.PI / 2 + i * 1.05)), 0);
          q.kant += (doel - q.kant) * Math.min(1, dt * 2.5); q.mesh.rotation.x = q.kant;
          q.fase += dt * (1.5 + 3 * v.drp + 3 * v.opb) * q.dir;
          const u = q.m.uniforms; u.uFase.value = q.fase;
          u.uLev.value = meng(v, 0.4 + 0.6 * b.pulse, 0.3 + 0.7 * v.opb, 0.85 + 0.3 * b.pulse + v.hit, 0.12) * H + F;
          u.uBasis.value = meng(v, 0.25, 0.3 + 0.5 * v.opb, 0.6, 0.5);
          mengKl(u.uKl.value, v, kl[i], kl[i], kl[(i + v.tel) % 3], P.b);
        });
        rond += v.dp * (2 + 6 * v.opb + 4 * v.drp);  // stukjes per tel
        const kop = rond % NS;
        for (let i = 0; i < NS; i++) {
          const d = ((kop - i) % NS + NS) % NS, staart = Math.exp(-d * 0.35);
          gm.lev[i] = meng(v, 0.12 + 0.9 * staart, 0.15 + 0.4 * v.opb + 0.8 * staart, (i + v.tel) % 2 ? 0.25 : 1 + v.hit, 0.03) * H + F;
          mengKl(gm.kl[i], v, P.a, P.b, P.c, P.b);
        }
        gm.lev[NS] = meng(v, 0.3 + 0.5 * b.bas, 0.3 + 0.6 * v.opb, 0.9, 0.06) * H + F; gm.kl[NS].copy(P.b);
        gm.lev[NS + 1] = (0.35 + 0.65 * b.pulse) * H + F; gm.kl[NS + 1].copy(P.c);
        if (vm) vm.color.setScalar(H + 0.5 * F);
        if (L1) L1.intensity = meng(v, 0.9 + 0.6 * b.pulse, 0.8 + 0.8 * v.opb, 1.5 + 0.8 * b.pulse, 0.3) * H;
      } };
  } });

  // ----- 4. Vinyl: een reuzenplaat draait als dansvloer, de dj staat stil op de spil, een toonarm ligt in de groef -----
  reg('midden', 'vinyl', { gewicht: 1, maak(ctx, stijl, plek) {
    const r = ctx.rnd, Z = ctx.zwaar, P = palet(stijl), BK = bouwKleur(sfeerVan(stijl), P);
    const { g, px, pz, R } = middenGroep(ctx, plek);
    const RV = klem(R * 0.82, 1.8, 4.6), YP = 0.16, YR = YP + 0.02, RE = 0.8, RL = Math.max(RV * 0.42, RE + 0.45), YE = YR + 0.42;
    const vast = [], gl = [];
    vast.push([GEO.rond, mat(0, YP / 2, 0, RV + 0.08, YP, RV + 0.08), { kl: BK.romp }]);
    vast.push([GEO.rond, mat(0, (YR + YE) / 2, 0, RE, YE - YR, RE), { kl: BK.metaal }]);
    vast.push([GEO.rond, mat(0, YE - 0.01, 0, RE + 0.02, 0.03, RE + 0.02), { kl: BK.rand }]);
    djTafel(vast, gl, 0, YE, -0.25, 1.1, BK.romp, 25);
    // toonarm: voet buiten de plaat (rechtsachter), arm tot op de buitenste groef
    const aP = Math.PI * 0.25, pv = V(Math.sin(aP) * RV * 1.13, 0, Math.cos(aP) * RV * 1.13), aK = aP - 0.42, kop = V(Math.sin(aK) * RV * 0.9, YR + 0.1, Math.cos(aK) * RV * 0.9);
    vast.push([GEO.cil, mat(pv.x, 0.27, pv.z, 0.22, 0.54, 0.22), { kl: BK.romp }]);
    vast.push([GEO.cil, mat(pv.x, 0.58, pv.z, 0.09, 0.1, 0.09), { kl: BK.metaal }]);
    const armA = V(pv.x, 0.6, pv.z), achter = armA.clone().sub(kop).setY(0).normalize().multiplyScalar(0.32).add(armA);
    vast.push([GEO.cz, staaf(armA, kop.clone().setY(YR + 0.22), 0.06), { kl: BK.metaal }]);
    vast.push([GEO.cz, staaf(kop.clone().setY(YR + 0.22), kop, 0.05), { kl: BK.metaal }]);
    vast.push([GEO.cz, staaf(armA, achter, 0.16), { kl: BK.romp }]);  // contragewicht
    vast.push([GEO.doos, mat(kop.x, YR + 0.06, kop.z, 0.14, 0.05, 0.22, 0, aK), { kl: new THREE.Color(0x101012) }]);
    gl.push([GEO.doos, mat(kop.x, YR + 0.095, kop.z, 0.04, 0.02, 0.04), { k: 24 }]);
    const NS = 24;  // ledrand om de sokkel, loopt mee met de draairichting
    for (let i = 0; i < NS; i++) { const a0 = i / NS * RONDE, a1 = (i + 0.85) / NS * RONDE, rr = RV + 0.085; neon(gl, V(Math.sin(a0) * rr, YP * 0.55, Math.cos(a0) * rr), V(Math.sin(a1) * rr, YP * 0.55, Math.cos(a1) * rr), 0.04, i, Z); }
    const vm = vastMesh(g, vast), gm = gloedMesh(g, gl);
    // de plaat zelf (draait) met label
    const plaat = new THREE.Group(); plaat.position.y = YR; g.add(plaat);
    const schijf = new THREE.Mesh(new THREE.CircleGeometry(RV, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: vinylTex(), color: 0xe0e0e0 })); plaat.add(schijf);
    const lab = new THREE.Mesh(new THREE.CircleGeometry(RL, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: labelTex(), color: P.a.clone().lerp(WIT, 0.25) })); lab.position.y = 0.004; plaat.add(lab);
    let glans = null;
    if (Z < 2) { glans = new THREE.Mesh(new THREE.CircleGeometry(RV, 48).rotateX(-Math.PI / 2), plusMap(glansTex())); glans.position.y = YR + 0.008; g.add(glans); }
    // dansers op de plaat (alleen hoog/midden): ze draaien mee
    const dansers = [];
    if (Z === 0) {
      const RD = Math.min(RV - 0.55, (RE + RV) / 2 + 0.1), a0 = r() * RONDE;
      for (const k of [0, 1]) { const f = a0 + k * Math.PI, d = ctx.figuur({ x: px + Math.sin(f) * RD, z: pz + Math.cos(f) * RD, face: f + Math.PI / 2 * (r() < 0.5 ? 1 : -1), rol: 'dans' }); if (d) { d.yOff = YR; dansers.push({ d, f, face: d.face, RD }); } }
    }
    const dj = djZet(ctx, px, YE, pz + 0.3);
    const L1 = ctx.licht(P.a.clone().lerp(WIT, 0.5), 1.3, 8, px, YE + 2.4, pz - 1.0);
    middenMeld(ctx, px, pz, R, YE + 2.0);
    const v = volger(P); let hoek = 0, w = 0.15, rond = 0;
    return { focus: { x: px, y: YE + 1.55, z: pz + 0.3 }, dj,
      update(dt, now, b, stand) {
        v.stap(dt, b, stand); const L = busLicht(ctx), H = L.helder, F = L.flits;
        w += (meng(v, 0.16 * (0.7 + 0.6 * v.en), 0.16 * (1 + 2 * v.opb), 0.5, 0.07) - w) * Math.min(1, dt * 1.5);
        hoek += w * dt; plaat.rotation.y = -hoek;
        for (const q of dansers) { const f = q.f - hoek; q.d.home.set(px + Math.sin(f) * q.RD, 0, pz + Math.cos(f) * q.RD); q.d.face = q.face - hoek; }
        schijf.material.color.setScalar((0.85 + 0.15 * b.pulse) * H + 0.4 * F);
        lab.material.color.copy(P.a).lerp(WIT, 0.25).multiplyScalar((0.7 + 0.3 * b.pulse) * H + F);
        if (glans) glans.material.color.setScalar(meng(v, 0.18 + 0.3 * b.hoog, 0.2 + 0.3 * v.opb, 0.35 + 0.25 * b.pulse, 0.1) * H + 0.5 * F);
        rond += v.dp * (2 + 6 * v.opb + 4 * v.drp);
        const kop = rond % NS;
        for (let i = 0; i < NS; i++) {
          const d = ((i - kop) % NS + NS) % NS, staart = Math.exp(-d * 0.3);  // loopt tegen de klok in, zoals de plaat
          gm.lev[i] = meng(v, 0.1 + 0.9 * staart, 0.15 + 0.4 * v.opb + 0.8 * staart, (Math.floor(i / 3) + v.tel) % 2 ? 0.2 : 1 + v.hit, 0.04 + 0.04 * staart) * H + F;
          mengKl(gm.kl[i], v, P.b, P.a, i % 2 ? P.c : P.a, P.b);
        }
        gm.lev[24] = 0.8 + 0.2 * Math.sin(now * 3); gm.kl[24].setRGB(1, 0.1, 0.05);
        gm.lev[25] = (0.35 + 0.65 * b.pulse) * H + F; gm.kl[25].copy(P.c);
        if (vm) vm.color.setScalar(H + 0.5 * F);
        if (L1) L1.intensity = meng(v, 0.9 + 0.6 * b.pulse, 0.8 + 0.8 * v.opb, 1.5 + 0.8 * b.pulse, 0.3) * H;
      } };
  } });

  // ----- 5. Hologram: een reuzenhoofd van licht zweeft boven de dj en praat mee op de bas (kaak), scanlijnen, glitch in de drop -----
  const VS_HOLO = `uniform float uT, uGlitch; varying float vY; varying float vF;
void main() {
  vec3 p = position;
  float band = floor(p.y * 14.0 + floor(uT * 9.0) * 3.0);
  p.x += (fract(sin(band * 12.9898) * 43758.5453) - 0.5) * uGlitch * step(0.8, fract(sin(band * 78.233) * 1234.5));
  vec4 wp = modelMatrix * vec4(p, 1.0); vY = wp.y;
  vec4 mv = viewMatrix * wp;
  vF = abs(dot(normalize(normalMatrix * normal), normalize(-mv.xyz)));
  gl_Position = projectionMatrix * mv;
}`;
  const FS_HOLO = `uniform float uT, uLev; uniform vec3 uKl; varying float vY; varying float vF;
void main() {
  float rand = pow(1.0 - vF, 2.2);
  float scan = 0.6 + 0.4 * sin(vY * 70.0 - uT * 5.0);
  float golf = smoothstep(0.85, 1.0, fract(vY * 0.7 - uT * 0.45));
  float a = (0.1 + 0.95 * rand) * scan + golf * 0.35;
  gl_FragColor = vec4(mix(uKl, vec3(1.0), rand * 0.35) * a * uLev, 1.0);
}`;
  // profiel van een hoofd (straal, hoogte) in hoofd-eenheden: hals onderaan, kruin op 1
  const HOOFD = [[0.0, 0.0], [0.16, 0.0], [0.17, 0.1], [0.22, 0.16], [0.3, 0.24], [0.33, 0.32], [0.36, 0.45], [0.37, 0.55], [0.36, 0.68], [0.32, 0.8], [0.24, 0.9], [0.13, 0.97], [0.0, 1.0]];
  const KAAK = 0.32;
  const profiel = (van, tot) => HOOFD.filter(([, y]) => y >= van - 1e-6 && y <= tot + 1e-6).map(([x, y]) => new THREE.Vector2(Math.max(0.001, x), y));
  const straalOp = y => { for (let i = 1; i < HOOFD.length; i++) if (y <= HOOFD[i][1]) { const [x0, y0] = HOOFD[i - 1], [x1, y1] = HOOFD[i]; return x0 + (x1 - x0) * (y - y0) / Math.max(1e-4, y1 - y0); } return 0; };
  reg('midden', 'hologram', { gewicht: 1, past: s => s.sfeer !== 'organisch', maak(ctx, stijl, plek) {
    const Z = ctx.zwaar, P = palet(stijl), M = maatVan(stijl), BK = bouwKleur(sfeerVan(stijl), P);
    const { g, px, pz, R } = middenGroep(ctx, plek);
    const RR = klem(R * 0.6, 1.3, 1.9), YR = 0.25, ZK = 0.75, HH = klem(M.h - 2.7, 1.3, 2.4), YB = Math.max(2.15, M.h - 0.3 - HH);
    const vast = [], gl = [];
    vast.push([GEO.rond, mat(0, YR / 2, 0, RR, YR, RR), { kl: BK.romp }]);
    vast.push([GEO.rond, mat(0, YR + 0.16, ZK, 0.5, 0.32, 0.5), { kl: BK.metaal.clone().multiplyScalar(0.5) }]);
    neonRing(gl, 0, YR, 0, RR + 0.01, 0.035, 0, Z, Math.PI / 2, 0, 64);
    neonRing(gl, 0, YR + 0.33, ZK, 0.42, 0.04, 2, Z, Math.PI / 2, 0, 40);
    neonRing(gl, 0, YR + 0.335, ZK, 0.26, 0.03, 3, Z, Math.PI / 2, 0, 32);
    djTafel(vast, gl, 0, YR, -0.62, 1.4, BK.romp, 1);
    const vm = vastMesh(g, vast), gm = gloedMesh(g, gl);
    // het hoofd: schedel (incl. achterkant van de kaak, neus, wenkbrauwen) en een losse kaak aan een scharnier
    const hm = shader({ uT: { value: 0 }, uLev: { value: 1 }, uGlitch: { value: 0 }, uKl: { value: P.b.clone() } }, VS_HOLO, FS_HOLO, plusOpties);
    const hg = new THREE.Group(); hg.position.set(0, YB, ZK); hg.scale.set(HH * 0.86, HH, HH); g.add(hg);
    const schedel = samen([[new THREE.LatheGeometry(profiel(KAAK, 1), 28), new THREE.Matrix4()], [new THREE.LatheGeometry(profiel(0, KAAK), 14, -Math.PI / 2, Math.PI), new THREE.Matrix4()],
      [new THREE.ConeGeometry(0.06, 0.16, 8).rotateX(-Math.PI / 2), mat(0, 0.47, -0.37)], [GEO.doos, mat(0, 0.6, -0.33, 0.46, 0.04, 0.08)]]);
    hg.add(new THREE.Mesh(schedel, hm));
    const scharnier = new THREE.Group(); scharnier.position.set(0, KAAK, 0.06); hg.add(scharnier);
    const kaakGeo = new THREE.LatheGeometry(profiel(0, KAAK), 14, Math.PI / 2, Math.PI).translate(0, -KAAK, -0.06);
    scharnier.add(new THREE.Mesh(kaakGeo, hm));
    let dm = null;
    if (Z === 0) {  // draadmodel eroverheen (alleen hoog/midden)
      dm = additive(0xffffff, 0.22); dm.wireframe = true;
      hg.add(new THREE.Mesh(schedel, dm)); scharnier.add(new THREE.Mesh(kaakGeo, dm));
    }
    const ogen = new THREE.Mesh(samen([[GEO.bol, mat(-0.14, 0.55, -0.31, 0.045, 0.035, 0.03)], [GEO.bol, mat(0.14, 0.55, -0.31, 0.045, 0.035, 0.03)]]), additive(0xffffff, 1)); hg.add(ogen);
    const scanRing = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 4, 48).rotateX(Math.PI / 2), additive(0xffffff, 1)); scanRing.visible = Z < 2; hg.add(scanRing);
    // projectorbundel van de lens omhoog naar het hoofd
    const bm = bundelMat(0.35, 1.2, 1), bundel = new THREE.Mesh(GEO.kegel, bm), LB = YB - YR - 0.34 + HH * 0.25;
    bundel.position.set(0, YR + 0.34, ZK); bundel.quaternion.setFromUnitVectors(ZAS, YAS); bundel.scale.set(HH * 0.42, HH * 0.42, LB); bundel.renderOrder = 1; bundel.visible = Z < 2; g.add(bundel);
    const dj = djZet(ctx, px, YR, pz - 0.07);
    const L1 = ctx.licht(P.b.clone().lerp(WIT, 0.4), 1.2, 8, px, YB, pz + ZK - 0.6);
    middenMeld(ctx, px, pz, R, YB + HH + 0.1);
    const v = volger(P), kHelder = new THREE.Color(); let open = 0;
    return { focus: { x: px, y: YR + 1.55, z: pz - 0.07 }, dj,
      update(dt, now, b, stand) {
        v.stap(dt, b, stand); const L = busLicht(ctx), H = L.helder, F = L.flits;
        // kaak: snel open op de bas, iets trager dicht; in de break een zacht gemompel
        const doel = meng(v, klem(b.bas * 1.2 - 0.15) * 0.34, klem(b.bas * 1.2 - 0.1) * 0.3, klem(b.bas * 1.3 - 0.1) * 0.4, 0.04 + 0.04 * Math.abs(Math.sin(now * 7)) * b.hoog);
        open += (doel - open) * Math.min(1, dt * (doel > open ? 25 : 9)); scharnier.rotation.x = -open;
        hg.rotation.y = 0.22 * Math.sin(now * 0.23) * (1 - v.drp * 0.5); hg.rotation.x = -0.05 * b.pulse;
        const u = hm.uniforms, kl = v.tel % 2 ? P.a : P.b;
        u.uT.value = now % 3600; u.uLev.value = meng(v, 0.75 + 0.25 * b.pulse, 0.6 + 0.6 * v.opb, 1.0 + 0.3 * b.pulse + v.hit, 0.35) * H + F;
        u.uGlitch.value = 0.02 + v.drp * 0.18 * b.pulse + v.hit * 0.3 + v.opb * (v.fr > 0.85 ? 0.1 : 0);
        mengKl(u.uKl.value, v, P.b, kHelder.copy(P.b).lerp(WIT, 0.5 * v.opb), kl, P.b);
        if (dm) dm.color.copy(u.uKl.value).lerp(WIT, 0.5).multiplyScalar(u.uLev.value);
        ogen.material.color.copy(P.c).lerp(WIT, 0.4).multiplyScalar(meng(v, 0.4 + 0.8 * b.mid, 0.5 + 0.8 * v.opb, 0.6 + 0.8 * b.pulse, 0.25) * H + F);
        const sy = (b.pos / 2) % 1, sr = straalOp(sy) * 1.06 + 0.01;  // scanring loopt elke 2 tellen van hals naar kruin
        scanRing.position.y = sy; scanRing.scale.set(sr, 1, sr);
        scanRing.material.color.copy(u.uKl.value).multiplyScalar((0.6 + 0.4 * b.pulse) * (1 - 0.7 * v.brk) * H);
        bm.uniforms.uKleur.value.copy(u.uKl.value).multiplyScalar(meng(v, 0.6 + 0.3 * b.bas, 0.5 + 0.6 * v.opb, 0.9 + 0.4 * b.pulse, 0.35) * H);
        gm.lev[0] = meng(v, 0.3 + 0.5 * b.pulse, 0.3 + 0.6 * v.opb, 0.9 + v.hit, 0.08) * H + F; gm.kl[0].copy(P.b);
        gm.lev[1] = (0.35 + 0.65 * b.pulse) * H + F; gm.kl[1].copy(P.c);
        gm.lev[2] = (0.6 + 0.4 * b.bas) * H + F; gm.kl[2].copy(u.uKl.value);
        gm.lev[3] = (0.9 + 0.3 * b.pulse) * H + F; gm.kl[3].copy(WIT);
        if (vm) vm.color.setScalar(H + 0.5 * F);
        if (L1) L1.intensity = meng(v, 0.9 + 0.6 * b.bas, 0.8 + 0.8 * v.opb, 1.4 + 0.8 * b.pulse, 0.4) * H;
      } };
  } });

  // ----- 6. Led-tunnel: poorten van neon achter en rond de dj (perspectief), het licht stroomt naar het publiek -----
  reg('midden', 'ledtunnel', { gewicht: 1, past: s => s.sfeer !== 'organisch', maak(ctx, stijl, plek) {
    const r = ctx.rnd, Z = ctx.zwaar, P = palet(stijl), M = maatVan(stijl), BK = bouwKleur(sfeerVan(stijl), P);
    const { g, px, pz, R } = middenGroep(ctx, plek);
    const ZDJ = Math.min(R * 0.35, 1.2), YD = 0.4, N = [7, 5, 4][Z], zA = Math.min(ZDJ + 0.9, R * 0.72), zV = -R * 0.78;
    const past = z => Math.max(1.6, 2 * Math.sqrt(Math.max(0, R * R - z * z)) - 0.3);  // breedste poort op diepte z binnen de cirkel
    const vast = [], gl = [];
    vast.push([GEO.doos, mat(0, YD / 2, ZDJ, 2.6, YD, 2.0), { kl: BK.romp }]);
    vast.push([GEO.doos, mat(0, YD - 0.02, ZDJ, 2.64, 0.04, 2.04), { kl: BK.rand }]);
    for (let k = 0; k < N; k++) {  // k = 0 achter de dj (klein), k = N-1 vooraan (groot)
      const u = N > 1 ? k / (N - 1) : 0, z = naar(zA, zV, u), w = Math.min(naar(2.4, 4.6, u), past(z)), hh = naar(Math.min(2.8, M.h - 0.3), Math.min(M.h - 0.3, 3.8), u);
      const pts = [[-w / 2, 0], [-w / 2, hh * 0.72], [-w * 0.28, hh], [w * 0.28, hh], [w / 2, hh * 0.72], [w / 2, 0]];
      for (let i = 0; i < pts.length - 1; i++) neon(gl, V(pts[i][0], pts[i][1], z), V(pts[i + 1][0], pts[i + 1][1], z), 0.05, k, Z);
      vast.push([GEO.doos, mat(-w / 2, 0.05, z, 0.16, 0.1, 0.16), { kl: BK.romp }], [GEO.doos, mat(w / 2, 0.05, z, 0.16, 0.1, 0.16), { kl: BK.romp }]);
    }
    djTafel(vast, gl, 0, YD, ZDJ - 0.55, 1.5, BK.romp, N);
    const vm = vastMesh(g, vast), gm = gloedMesh(g, gl);
    // ledscherm achter de dj
    const lm = ledMat(P, Z === 0 ? [36, 30] : [24, 20], r() * 50), scherm = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(2.4, past(zA + 0.12)), Math.min(2.4, M.h - YD - 0.4)), lm);
    scherm.position.set(0, YD + Math.min(2.4, M.h - YD - 0.4) / 2 + 0.05, zA + 0.12); scherm.rotation.y = Math.PI; g.add(scherm);
    const dj = djZet(ctx, px, YD, pz + ZDJ);
    const L1 = ctx.licht(P.c.clone().lerp(WIT, 0.6), 1.2, 8, px, Math.min(3.0, M.h - 0.4), pz + ZDJ - 1.5);
    middenMeld(ctx, px, pz, R, Math.min(M.h - 0.3, 3.8) + 0.1);
    const v = volger(P), kOpb = new THREE.Color(), kGrad = []; let golf = 0;
    for (let k = 0; k < N; k++) kGrad.push(P.a.clone().lerp(P.b, N > 1 ? k / (N - 1) : 0));
    return { focus: { x: px, y: YD + 1.55, z: pz + ZDJ }, dj,
      update(dt, now, b, stand) {
        v.stap(dt, b, stand); const L = busLicht(ctx), H = L.helder, F = L.flits;
        kOpb.copy(P.b).lerp(WIT, v.opb);
        golf += v.dp * (1 + 3 * v.opb * v.opb);  // één golf per tel, in de opbouw tot vier
        const x = (golf % 1) * (N + 2) - 1, xb = (1 - ((b.pos / 4) % 1)) * (N + 2) - 1;  // break: langzaam terug, elke 4 tellen
        for (let k = 0; k < N; k++) {
          const s = Math.pow(Math.max(0, 1 - Math.abs(x - k) * 0.8), 2), sb = Math.pow(Math.max(0, 1 - Math.abs(xb - k) * 0.8), 2);
          const dr = ((k + v.tel) % 2 ? (v.fr > 0.5 ? 1 : 0.15) : (v.fr < 0.5 ? 1 : 0.15)) + v.hit;
          gm.lev[k] = meng(v, 0.12 + 0.95 * s, 0.15 + 0.45 * v.opb + 0.9 * s, dr, 0.03 + 0.3 * sb) * H + F;
          mengKl(gm.kl[k], v, kGrad[k], kOpb, (k + v.tel) % 2 ? P.c : P.a, P.b);
        }
        gm.lev[N] = (0.35 + 0.65 * b.pulse) * H + F; gm.kl[N].copy(P.c);
        muZet(lm.uniforms, now, b, v, L);
        if (vm) vm.color.setScalar(H + 0.5 * F);
        if (L1) L1.intensity = meng(v, 0.9 + 0.6 * b.pulse, 0.7 + 0.9 * v.opb, 1.4 + 0.8 * b.pulse, 0.3) * H;
      } };
  } });

  // ----- 7. Kooi: rond podium met tralies en een koepel; ledtralies draaien rond, blinders op de hits; in hoog een danseres erbij -----
  reg('midden', 'kooi', { gewicht: 1, past: s => s.sfeer !== 'luxe', maak(ctx, stijl, plek) {
    const r = ctx.rnd, Z = ctx.zwaar, P = palet(stijl), M = maatVan(stijl), BK = bouwKleur(sfeerVan(stijl), P);
    const { g, px, pz, R } = middenGroep(ctx, plek);
    const RK = klem(R * 0.6, 1.4, 2.1), PH = 0.6, HK = Math.min(M.h - 0.95, 3.4), KH = klem(M.h - 0.15 - HK, 0.25, 0.6), nB = [28, 20, 16][Z], RB = RK - 0.06;
    const vast = [], gl = [], staal = BK.metaal.clone().multiplyScalar(0.55);
    vast.push([GEO.rond, mat(0, PH / 2, 0, RK, PH, RK), { kl: BK.romp }]);
    vast.push([GEO.rond, mat(0, 0.12, 0, RK + 0.4, 0.24, RK + 0.4), { kl: BK.romp.clone().multiplyScalar(0.8) }]);
    for (let i = 0; i < nB; i++) {
      const a = i / nB * RONDE, x = Math.sin(a) * RB, z = Math.cos(a) * RB;
      vast.push([GEO.cil, mat(x, (PH + HK) / 2, z, 0.022, HK - PH, 0.022), { kl: staal }]);
      if (i % 4 === 0) neon(gl, V(x * 1.02, PH + 0.1, z * 1.02), V(x * 1.02, HK - 0.1, z * 1.02), 0.025, i / 4, Z);  // ledtralie
    }
    for (let i = 0; i < 4; i++) {  // koepel: vier bogen naar de top
      const a = i / 4 * RONDE + Math.PI / 4; let vp = null;
      for (let s = 0; s <= 6; s++) { const t = s / 6 * Math.PI / 2, p = V(Math.sin(a) * RB * Math.cos(t), HK + KH * Math.sin(t), Math.cos(a) * RB * Math.cos(t)); if (vp) vast.push([GEO.cz, staaf(vp, p, 0.05), { kl: staal }]); vp = p; }
    }
    const nL = Math.ceil(nB / 4);
    neonRing(gl, 0, HK, 0, RB, 0.05, nL, Z, Math.PI / 2, 0, 64);
    neonRing(gl, 0, PH + 0.02, 0, RB, 0.04, nL + 1, Z, Math.PI / 2, 0, 64);
    for (let i = 0; i < 4; i++) {  // blinders op de bovenring
      const a = i / 4 * RONDE + Math.PI / 4, x = Math.sin(a) * (RB + 0.12), z = Math.cos(a) * (RB + 0.12);
      vast.push([GEO.doos, mat(x, HK - 0.12, z, 0.34, 0.2, 0.12, 0, a), { kl: BK.romp }]);
      for (const s of [-1, 1]) gl.push([GEO.schijf, mat(x + Math.sin(a) * 0.065 + Math.cos(a) * s * 0.08, HK - 0.12, z + Math.cos(a) * 0.065 - Math.sin(a) * s * 0.08, 0.06, 0.06, 1, 0, a), { k: nL + 2 }]);
    }
    djTafel(vast, gl, 0, PH, -0.3, 1.3, BK.romp, nL + 3);
    const vm = vastMesh(g, vast), gm = gloedMesh(g, gl);
    let bord = null;
    if (Z < 2) { bord = ctx.neon(kies(r, ['THE CAGE', 'KOOI', 'LOCKED IN', 'NO EXIT']), hex(P.a), 1.5, 0.375); bord.position.set(px, HK - 0.45, pz - RB - 0.06); bord.rotation.y = Math.PI; }
    const dj = djZet(ctx, px, PH, pz + 0.25);
    if (Z === 0 && RK >= 1.7) { const s = r() < 0.5 ? -1 : 1, d = ctx.figuur({ x: px + s * 0.95, z: pz + 0.5, face: Math.PI + s * 0.5, rol: 'dans' }); if (d) d.yOff = PH; }
    const L1 = ctx.licht(P.a.clone().lerp(WIT, 0.5), 1.3, 7, px, HK - 0.3, pz - 0.4);
    middenMeld(ctx, px, pz, R, HK + KH + 0.1);
    const v = volger(P); let rond = 0;
    return { focus: { x: px, y: PH + 1.55, z: pz + 0.25 }, dj,
      update(dt, now, b, stand) {
        v.stap(dt, b, stand); const L = busLicht(ctx), H = L.helder, F = L.flits;
        rond += v.dp * (1 + 5 * v.opb * v.opb);
        const kop = rond % nL;
        for (let i = 0; i < nL; i++) {
          const d = ((kop - i) % nL + nL) % nL, s = Math.exp(-d * 0.9);
          gm.lev[i] = meng(v, 0.1 + 0.9 * s, 0.2 + 0.5 * v.opb + 0.6 * s, (i + v.tel) % 2 ? (v.fr < 0.25 ? 1.2 : 0.15) : (v.fr >= 0.5 && v.fr < 0.75 ? 1.2 : 0.15), 0) * H + F;
          mengKl(gm.kl[i], v, P.a, P.b, (i + v.tel) % 2 ? P.c : P.a, P.b);
        }
        gm.lev[nL] = meng(v, 0.45 + 0.55 * b.pulse, 0.4 + 0.6 * v.opb, 0.9 + v.hit, 0.1 + 0.08 * Math.sin(now * 1.4)) * H + F; mengKl(gm.kl[nL], v, P.b, P.b, P.a, P.b);
        gm.lev[nL + 1] = meng(v, 0.25 + 0.6 * b.bas, 0.3 + 0.5 * v.opb, 0.8, 0) * H + F; gm.kl[nL + 1].copy(P.c);
        gm.lev[nL + 2] = Math.max(1.4 * v.hit, v.drp * (b.pos % 4 < 0.25 ? 1.2 : 0), v.opb > 0.85 ? (v.fr < 0.15 ? 1 : 0) : 0) + F; gm.kl[nL + 2].setRGB(1, 0.92, 0.8);
        gm.lev[nL + 3] = (0.35 + 0.65 * b.pulse) * H + F; gm.kl[nL + 3].copy(P.c);
        if (vm) vm.color.setScalar(H + 0.5 * F);
        if (bord) bord.material.color.setScalar(meng(v, 0.7 + 0.3 * b.pulse, 0.6 + 0.4 * v.opb, (v.tel % 2 ? 1 : 0.3), 0.15) * H + F);
        if (L1) L1.intensity = meng(v, 0.9 + 0.6 * b.pulse, 0.8 + 0.8 * v.opb, 1.3 + 1.2 * b.pulse, 0.3) * H;
      } };
  } });

  // ======================================================================================================================
  // PLAFONDRIGS (plek {h}; breedte en diepte uit stijl.maat)
  // ======================================================================================================================
  const hash = a => { const s = Math.sin(a * 12.9898) * 43758.5453; return s - Math.floor(s); };
  // hoge middenstukken (hologram, tunnel, kubus) staan in de weg van laag hangend spul: dat blijft daar weg
  const inDeWeg = (ctx, x, z, y, marge = 0.4) => { const m = bus(ctx).midden; return !!m && m.top > y - 0.3 && Math.hypot(x - m.x, z - m.z) < m.r + marge; };

  // ----- 1. Truss met moving heads: vierkant truss onder het plafond, koppen eronder met bundels en vlekken op de vloer -----
  reg('plafond', 'truss', { gewicht: 1.2, maak(ctx, stijl, plek) {
    const Z = ctx.zwaar, P = palet(stijl), M = maatVan(stijl, plek), sf = sfeerVan(stijl), g = new THREE.Group(); ctx.groep.add(g);
    const YT = M.h - 0.45, AX = klem(M.w / 2 - 1.5, 1.5, 6), AZ = klem(M.d / 2 - 1.8, 1.5, 7.5), T = 0.29, vast = [];
    const hoek = [[-AX, -AZ], [AX, -AZ], [AX, AZ], [-AX, AZ]];
    for (let i = 0; i < 4; i++) {
      const [x0, z0] = hoek[i], [x1, z1] = hoek[(i + 1) % 4], len = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / len, uz = (z1 - z0) / len, nx = -uz, nz = ux;
      const Q = (s, a, b) => V(x0 + ux * s + nx * a * T / 2, YT + b * T / 2, z0 + uz * s + nz * a * T / 2);
      for (const [a, b] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) vast.push([GEO.cz, staaf(Q(-T / 2, a, b), Q(len + T / 2, a, b), 0.045)]);
      const nS = Math.max(1, Math.round(len / (Z === 2 ? 0.7 : 0.5))), st = len / nS;
      for (let k = 0; k < nS; k++) {
        const s0 = k * st, s1 = s0 + st, f = k % 2 ? 1 : -1;
        vast.push([GEO.cz, staaf(Q(s0, -1, -f), Q(s1, -1, f), 0.022)], [GEO.cz, staaf(Q(s0, 1, -f), Q(s1, 1, f), 0.022)]);
        if (Z < 2) vast.push([GEO.cz, staaf(Q(s0, -f, 1), Q(s1, f, 1), 0.022)], [GEO.cz, staaf(Q(s0, -f, -1), Q(s1, f, -1), 0.022)]);
      }
      vast.push([GEO.doos, mat(x0, YT, z0, T * 1.25, T * 1.25, T * 1.25)], [GEO.cz, staaf(V(x0, YT + T / 2, z0), V(x0, M.h, z0), 0.03)]);
    }
    const vm = vastMesh(g, vast, sf === 'futuristisch' || sf === 'luxe' ? new THREE.Color(0x8a9098) : new THREE.Color(0x2a2a2e));
    // koppen gelijk verdeeld over de rechthoek, hangend onder het truss
    const n = [12, 8, 6][Z], omtrek = 4 * (AX + AZ), koppen = [];
    for (let i = 0; i < n; i++) {
      let s = (i + 0.5) / n * omtrek, p;
      if (s < 2 * AX) p = V(-AX + s, 0, -AZ); else if ((s -= 2 * AX) < 2 * AZ) p = V(AX, 0, -AZ + s); else if ((s -= 2 * AZ) < 2 * AX) p = V(AX - s, 0, AZ); else p = V(-AX, 0, AZ - (s - 2 * AX));
      p.y = YT - T / 2 - 0.3;
      koppen.push({ p, dir: V(0, -1, 0), thuis: V(p.x * 0.45, 0, p.z * 0.45) });
    }
    const romp = inst(g, GEO.blok, new THREE.MeshBasicMaterial({ color: 0x141416 }), n, false), lens = inst(g, GEO.schijf, plusMap(gloedTex()), n);
    const bm = bundelMat([0.42, 0.36, 0.3][Z], 1.4, 1), bs = inst(g, GEO.kegel, bm, n), vlek = Z < 2 ? inst(g, GEO.schijf, vlekMat(), n) : null;
    const v = volger(P), kk = new THREE.Color(), kWit = P.b.clone().lerp(WIT, 0.6), KL = [P.a, P.b, P.c], bp = V(0, 0, 0), raak = V(0, 0, 0);
    return {
      update(dt, now, b, stand) {
        v.stap(dt, b, stand); const L = busLicht(ctx), H = L.helder, F = L.flits, f = focusVan(ctx), t2 = now * (1.6 + 0.8 * v.en);
        const spreid = meng(v, 0.085, 0.085 - 0.045 * v.opb, 0.045, 0.05);
        koppen.forEach((k, i) => {
          // doelen op de vloer per stand: cirkels, samentrekken naar de dj, ballyhoo, recht omlaag
          const a = b.pos * Math.PI / 4 + i * 0.9, ao = b.pos * Math.PI * (0.5 + 1.5 * v.opb) + i * RONDE / n, ro = 2.4 * (1 - v.opb) + 0.25;
          const tx = meng(v, k.thuis.x + Math.cos(a) * 1.6, f.x + Math.cos(ao) * ro, Math.sin(t2 + i * 1.7) * M.w * 0.38, k.p.x + Math.sin(now * 0.3 + i) * 0.4);
          const tz = meng(v, k.thuis.z + Math.sin(a) * 1.6, f.z + Math.sin(ao) * ro, Math.cos(t2 * 0.8 + i * 2.3) * M.d * 0.38, k.p.z + Math.cos(now * 0.27 + i) * 0.4);
          _w.set(tx - k.p.x, -k.p.y, tz - k.p.z).normalize();
          k.dir.lerp(_w, Math.min(1, dt * (3 + 6 * v.drp))).normalize();
          _q.setFromUnitVectors(ZAS, k.dir);
          _m.compose(k.p, _q, _s.set(0.26, 0.26, 0.36)); romp.setMatrixAt(i, _m);
          bp.copy(k.p).addScaledVector(k.dir, 0.19);
          const len = uitDoos(bp, k.dir, M), vlak = RAAK.vlak;
          mengKl(kk, v, i % 2 ? P.a : P.b, kWit, KL[(i + v.tel) % 3], P.b);
          const sterk = meng(v, (i + v.tel) % 2 ? 0.45 + 0.55 * b.pulse : 0.3, 0.25 + 0.75 * v.opb, 0.9 + 0.3 * b.pulse + v.hit, 0.18) * H + 0.5 * F;
          _m.compose(bp, _q, _s.set(0.1, 0.1, 0.1)); lens.setMatrixAt(i, _m); lens.setColorAt(i, _c.copy(kk).lerp(WIT, 0.4).multiplyScalar(1.5 * sterk));
          _m.compose(bp, _q, _s.set(len * spreid, len * spreid, len)); bs.setMatrixAt(i, _m); bs.setColorAt(i, _c.copy(kk).multiplyScalar(sterk));
          if (vlek) { if (vlak === 2) vlekZet(vlek, i, raak.copy(bp).addScaledVector(k.dir, len), 2, len * spreid * 1.4, kk, 0.6 * sterk); else verstop(vlek, i); }
        });
        klaar(romp, lens, bs, vlek);
        if (vm) vm.color.setScalar(H + 0.4 * F);
      },
      opruimen() { weg(romp, lens, bs, vlek); } };
  } });

  // ----- 1b. Scanners: een rij smalle, scherpe bundels aan een balk onder het plafond (lengteas van de kamer); golf in de groove,
  // samentrekken naar de dj en versnellen in de opbouw, kruisvuur op de tel in de drop, uit in de break -----
  reg('plafond', 'scanners', { gewicht: 1.2, maak(ctx, stijl, plek) {
    const Z = ctx.zwaar, P = palet(stijl), M = maatVan(stijl, plek), g = new THREE.Group(); ctx.groep.add(g);
    const n = [14, 10, 6][Z], lang = M.d >= M.w, Lb = Math.max(3, (lang ? M.d : M.w) - 3.4), Y = M.h - 0.32;
    const as = lang ? V(0, 0, 1) : V(1, 0, 0), zij = lang ? V(1, 0, 0) : V(0, 0, 1), koppen = [], vast = [];
    for (let i = 0; i < n; i++) { const f = n > 1 ? i / (n - 1) - 0.5 : 0; koppen.push({ p: as.clone().multiplyScalar(f * Lb).setY(Y - 0.16), f, i, dir: V(0, -1, 0) }); }
    vast.push([GEO.doos, mat(0, Y, 0, lang ? 0.22 : Lb + 0.5, 0.07, lang ? Lb + 0.5 : 0.22)]);
    for (const k of koppen) vast.push([GEO.doos, mat(k.p.x, Y - 0.06, k.p.z, 0.16, 0.12, 0.16)]);
    for (const e of [-0.5, 0.5]) { const q = as.clone().multiplyScalar(e * Lb); vast.push([GEO.cz, staaf(V(q.x, Y, q.z), V(q.x, M.h, q.z), 0.025)]); }
    vastMesh(g, vast, new THREE.Color(0x1c1c20));
    const bs = inst(g, GEO.kegel, bundelMat([0.55, 0.5, 0.42][Z], 2.2, 1), n), lens = inst(g, GEO.schijf, plusMap(gloedTex()), n), vlek = Z < 2 ? inst(g, GEO.schijf, vlekMat(), n) : null;
    const v = volger(P), kk = new THREE.Color(), doel = V(0, 0, 0), raak = V(0, 0, 0), KL = [P.a, P.b, P.c];
    let t = 0;
    return {
      update(dt, now, b, stand) {
        v.stap(dt, b, stand); const L = busLicht(ctx), H = L.helder, F = L.flits, f = focusVan(ctx);
        t += dt * (1 + 4 * v.opb + 1.5 * v.drp);
        for (const k of koppen) {
          // kanteling naar de zijkant (al) en langs de balk (be) per stand
          const om = v.tel % 2 ? 1 : -1, golf = Math.sin(b.pos * Math.PI / 4 + k.f * Math.PI * 2);
          const al = meng(v, 0.55 * golf, 0.7 * Math.sin(t * 1.3 + k.i * 0.5) * (1 - 0.6 * v.opb), (k.i % 2 ? 1 : -1) * om * 0.65, 0), be = meng(v, 0.22 * k.f, -0.6 * k.f * v.opb, 0.9 * k.f * (v.fr < 0.5 ? 1 : -0.4), 0);
          doel.set(0, -1, 0).addScaledVector(zij, Math.tan(al)).addScaledVector(as, Math.tan(be)).normalize();
          if (v.opb > 0.01) { _w.set(f.x - k.p.x, Math.max(0.2, f.y - 1.2) - k.p.y, f.z - k.p.z).normalize(); doel.lerp(_w, 0.5 * v.opb * (v.opb / Math.max(0.001, v.opb + v.groove + v.drp + v.brk))).normalize(); }
          k.dir.lerp(doel, Math.min(1, dt * (3 + 9 * v.drp + 4 * v.opb))).normalize();
          const len = uitDoos(k.p, k.dir, M), vl = RAAK.vlak;
          mengKl(kk, v, KL[k.i % 2], KL[(k.i % 2) + 1], KL[(k.i + v.tel) % 3], P.b);
          const sterk = meng(v, (k.i + v.tel) % 2 ? 0.8 + 0.3 * b.pulse : 0.3, 0.2 + 0.85 * v.opb, (0.95 + 0.35 * b.pulse) * (v.fr < 0.5 || k.i % 2 ? 1 : 0.25) + v.hit, 0) * H + 0.4 * F;
          _q.setFromUnitVectors(ZAS, k.dir);
          _m.compose(k.p, _q, _s.set(len * 0.022, len * 0.022, len)); bs.setMatrixAt(k.i, _m); bs.setColorAt(k.i, _c.copy(kk).multiplyScalar(sterk));
          const ls = sterk > 0.02 ? 0.14 : 0; _m.compose(k.p, _q, _s.set(ls, ls, ls)); lens.setMatrixAt(k.i, _m); lens.setColorAt(k.i, _c.copy(kk).lerp(WIT, 0.35).multiplyScalar(1.4 * sterk));
          if (vlek) vlekZet(vlek, k.i, raak.copy(k.p).addScaledVector(k.dir, len), vl, len * 0.03 + 0.1, kk, 0.6 * sterk);
        }
        klaar(bs, lens, vlek);
      },
      opruimen() { weg(bs, lens, vlek); } };
  } });

  // ----- 2. Neonbuizen: een veld hangende buizen dat als kinetisch kunstwerk op en neer golft en op de tel oplicht -----
  reg('plafond', 'neonbuizen', { gewicht: 1, maak(ctx, stijl, plek) {
    const r = ctx.rnd, Z = ctx.zwaar, P = palet(stijl), M = maatVan(stijl, plek), g = new THREE.Group(); ctx.groep.add(g);
    const W = Math.max(3, M.w - 2.4), D = Math.max(3, M.d - 3), n0 = [36, 24, 14][Z], kol = Math.max(2, Math.round(Math.sqrt(n0 * W / D))), rij = Math.max(2, Math.round(n0 / kol));
    const LB = Z === 0 ? 1.2 : 1.4, yHoog = M.h - 0.35, yLaag = Math.max(2.65, M.h - 1.9), KL = [P.a, P.b, P.c], buizen = [];
    for (let j = 0; j < rij; j++) for (let i = 0; i < kol; i++) buizen.push({ x: -W / 2 + (i + 0.5) * W / kol + (r() - 0.5) * 0.25, z: -D / 2 + (j + 0.5) * D / rij + (r() - 0.5) * 0.25,
      yaw: ((i + j) % 2 ? 0.28 : -0.28) + (r() - 0.5) * 0.1, i, j, s: 0.5, fase: i * 0.7 + j * 1.1, kl: KL[(i + j) % 3], uit: false });
    const n = buizen.length, kern = inst(g, GEO.buisX, additive(0xffffff, 1), n);
    let halo = null;
    if (Z < 2) { halo = new THREE.InstancedMesh(GEO.buisXg, bundelMat(0.32, 2.5, 0), n); halo.frustumCulled = false; halo.instanceMatrix = kern.instanceMatrix; halo.instanceColor = kern.instanceColor; g.add(halo); }
    let dPos = null, draad = null;
    if (Z < 2) {
      dPos = new Float32Array(n * 12); const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dPos, 3).setUsage(THREE.DynamicDrawUsage));
      draad = new THREE.LineSegments(dg, new THREE.LineBasicMaterial({ color: 0x1e1e22 })); draad.frustumCulled = false; g.add(draad);
    }
    const v = volger(P), kk = new THREE.Color(); let gecheckt = false;
    return {
      update(dt, now, b, stand) {
        v.stap(dt, b, stand); const L = busLicht(ctx), H = L.helder, F = L.flits;
        if (!gecheckt) { gecheckt = true; for (const q of buizen) q.uit = inDeWeg(ctx, q.x, q.z, yLaag, 0.9); }
        const x0 = -W / 2 - 1.5 + ((b.pos / 2) % 1) * (W + 3), flits = Math.floor(now * (4 + 12 * v.opb));
        buizen.forEach((q, k) => {
          if (q.uit) { verstop(kern, k); if (dPos) dPos.fill(0, k * 12, k * 12 + 12); return; }
          // hoogte: golf in groove, alles omhoog in de opbouw, alles omlaag in de drop, laag en stil in de break
          const golf = 0.5 + 0.45 * Math.sin(q.fase + now * 0.6);
          q.s += (meng(v, golf, golf * (1 - v.opb), 0.95 - 0.08 * v.fr, 0.75 + 0.05 * Math.sin(now * 0.4 + q.fase)) - q.s) * Math.min(1, dt * (1.5 + 6 * v.drp));
          const y = yHoog - (yHoog - yLaag) * q.s;
          const lev = meng(v, 0.15 + 0.85 * Math.exp(-Math.pow((q.x - x0) / 1.2, 2)) + 0.2 * b.pulse,
            0.2 + 0.5 * v.opb + (hash(k * 3.7 + flits) > 1 - 0.4 * v.opb ? 0.8 : 0),
            ((q.j + v.tel) % 2 ? 1 : 0.35) * (0.6 + 0.4 * b.pulse) + v.hit, k % 7 === 0 ? 0.14 + 0.1 * Math.sin(now * 1.2 + k) : 0.02) * H + F;
          mengKl(kk, v, q.kl, q.kl, (q.j + v.tel) % 2 ? P.a : P.c, P.b);
          kern.setColorAt(k, kk.lerp(WIT, 0.4 * klem(lev - 0.5)).multiplyScalar(lev));
          _q.setFromAxisAngle(YAS, q.yaw); _m.compose(_p.set(q.x, y, q.z), _q, _s.set(LB, 0.035, 0.035)); kern.setMatrixAt(k, _m);
          if (dPos) {
            const cx = Math.cos(q.yaw) * LB * 0.42, cz = -Math.sin(q.yaw) * LB * 0.42, o = k * 12;
            dPos.set([q.x - cx, y, q.z - cz, q.x - cx, M.h, q.z - cz, q.x + cx, y, q.z + cz, q.x + cx, M.h, q.z + cz], o);
          }
        });
        klaar(kern);
        if (draad) draad.geometry.attributes.position.needsUpdate = true;
      },
      opruimen() { weg(kern, halo); } };
  } });

  // ----- 3. Spiegelbol met pinspots: lichtvlekjes over wanden, vloer en plafond, stralen door de rook (hoog) -----
  reg('plafond', 'spiegelbol', { gewicht: 1, maak(ctx, stijl, plek) {
    const r = ctx.rnd, Z = ctx.zwaar, P = palet(stijl), M = maatVan(stijl, plek), g = new THREE.Group(); ctx.groep.add(g);
    const RB = klem(Math.min(M.w, M.d) * 0.05, 0.45, 0.75), bol = new THREE.Group(), pos = V(0, M.h - 0.55 - RB, 0); bol.position.copy(pos); g.add(bol);
    const geo = typeof mirrorBallGeometry === 'function' ? mirrorBallGeometry(RB, Z === 2 ? 14 : 22, 0.9) : new THREE.SphereGeometry(RB, 24, 16);
    bol.add(new THREE.Mesh(geo, new THREE.MeshMatcapMaterial({ matcap: matcapTex(), side: THREE.DoubleSide })));
    const binnen = new THREE.Mesh(GEO.bol, new THREE.MeshBasicMaterial({ color: 0x050508 })); binnen.scale.setScalar(RB * 0.985); bol.add(binnen);
    const kabel = new THREE.Mesh(GEO.blok, new THREE.MeshBasicMaterial({ color: 0x2a2a2e })); g.add(kabel);
    const glim = []; for (let i = 0; i < 70; i++) glim.push(...V(0, 0, 0).setFromSphericalCoords(RB * 1.01, Math.acos(r() * 2 - 1), r() * RONDE).toArray());
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(glim, 3));
    const glimMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.09, map: gloedTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }); if (Z < 2) bol.add(new THREE.Points(gg, glimMat));
    // vlekjes: vaste richtingen vanuit de bol, draaien mee
    const nF = [150, 90, 40][Z], vlek = inst(g, GEO.schijf, vlekMat(), nF), fDir = [];
    for (let i = 0; i < nF; i++) { fDir.push(V(0, 0, 0).setFromSphericalCoords(1, Math.acos(r() * 1.7 - 1), r() * RONDE)); vlek.setColorAt(i, _c.copy([P.a, P.b, P.c][i % 3]).lerp(WIT, 0.2)); }  // verzadigd, geen wit confetti
    const nS = Z === 0 ? 24 : 0, stralen = nS ? inst(g, GEO.straal, bundelMat(0.5, 0.8, 0), nS) : null;
    const pin = inst(g, GEO.kegel, bundelMat(0.5, 1.3, 1), 2), pinBron = [V(-(M.w / 2 - 0.6), M.h - 0.15, -(M.d / 2 - 0.8)), V(M.w / 2 - 0.6, M.h - 0.15, M.d / 2 - 0.8)];
    const v = volger(P), kk = new THREE.Color(), KL = [P.a, P.b, P.c], d = V(0, 0, 0), raak = V(0, 0, 0); let hoek = 0, geplaatst = false;
    const plaats = () => {  // een hoog middenstuk onder de bol: dan hangt hij ernaast
      const m = bus(ctx).midden;
      if (m && inDeWeg(ctx, 0, 0, pos.y - RB, RB + 0.3)) { const sx = m.x <= 0 ? 1 : -1; pos.set(klem(m.x + sx * (m.r + RB + 0.6), -(M.w / 2 - RB - 1), M.w / 2 - RB - 1), pos.y, klem(m.z - 1, -(M.d / 2 - 2), M.d / 2 - 2)); }
      bol.position.copy(pos); kabel.position.set(pos.x, (M.h + pos.y + RB) / 2, pos.z); kabel.scale.set(0.02, M.h - pos.y - RB, 0.02);
    };
    plaats();
    return {
      update(dt, now, b, stand) {
        v.stap(dt, b, stand); const L = busLicht(ctx), H = L.helder, F = L.flits;
        if (!geplaatst) { geplaatst = true; plaats(); }
        hoek += dt * meng(v, 0.25 + 0.3 * v.en, 0.25 + 1.2 * v.opb, 0.8, 0.12); bol.rotation.y = hoek;
        const ca = Math.cos(hoek), sa = Math.sin(hoek), sterk = meng(v, 0.35 + 0.45 * v.en + 0.3 * b.pulse, 0.3 + 0.6 * v.opb, 0.7 + 0.9 * b.pulse + v.hit, 0.45) * H + F;
        for (let i = 0; i < nF; i++) {
          const f = fDir[i]; d.set(f.x * ca + f.z * sa, f.y, -f.x * sa + f.z * ca);
          const t = uitDoos(pos, d, M); _m.compose(raak.copy(pos).addScaledVector(d, t), VLAK_N[RAAK.vlak], _s.setScalar(0.04 + t * 0.011)); vlek.setMatrixAt(i, _m);
          if (i < nS) { _q.setFromUnitVectors(ZAS, d); _m.compose(pos, _q, _s.set(0.006, 0.006, t)); stralen.setMatrixAt(i, _m); stralen.setColorAt(i, _c.copy(KL[i % 3]).lerp(WIT, 0.25).multiplyScalar(0.25 * sterk)); }
        }
        vlek.material.color.copy(WIT).lerp(KL[v.tel % 3], 0.6 * v.drp).multiplyScalar(sterk);
        for (let k = 0; k < 2; k++) {
          d.subVectors(pos, pinBron[k]); const len = d.length() - RB * 0.6; d.normalize(); _q.setFromUnitVectors(ZAS, d);
          _m.compose(pinBron[k], _q, _s.set(RB * 0.9, RB * 0.9, len)); pin.setMatrixAt(k, _m); pin.setColorAt(k, kk.setRGB(1, 0.95, 0.85).multiplyScalar((0.5 + 0.3 * b.pulse * (1 - v.brk)) * H + 0.3 * F));
        }
        glimMat.color.setScalar((0.4 + 0.6 * b.hoog) * sterk);
        klaar(vlek, pin, stralen);
      },
      opruimen() { weg(vlek, pin, stralen); } };
  } });

  // ----- 4. Laserplafond: bronnen langs de zijwanden; vlakke waaiers onder het plafond, in de drop regent het lasers naar beneden -----
  reg('plafond', 'lasers', { gewicht: 0.9, maak(ctx, stijl, plek) {
    const Z = ctx.zwaar, P = palet(stijl), M = maatVan(stijl, plek), g = new THREE.Group(); ctx.groep.add(g);
    const perKant = [3, 2, 2][Z], K = [6, 4, 3][Z], bronnen = [], vast = [];
    for (const sx of [-1, 1]) for (let i = 0; i < perKant; i++) {
      const z = -M.d / 2 + (i + 0.5) * M.d / perKant, p = V(sx * (M.w / 2 - 0.3), M.h - 0.28, z);
      vast.push([GEO.doos, mat(p.x + sx * 0.08, p.y + 0.06, z, 0.3, 0.16, 0.36)]);
      bronnen.push({ p, a0: Math.atan2(-sx, 0), sx, i, kl: sx < 0 ? P.a : P.b });
    }
    vastMesh(g, vast, new THREE.Color(0x1a1a1e));
    const n = bronnen.length * K, dik = [0.008, 0.01, 0.014][Z];
    const kern = inst(g, GEO.straal, bundelMat(1, 0.5, 0), n);
    let gloed = null;
    if (Z === 0) { gloed = new THREE.InstancedMesh(GEO.straalG, bundelMat(0.2, 2.5, 0), n); gloed.frustumCulled = false; gloed.instanceMatrix = kern.instanceMatrix; gloed.instanceColor = kern.instanceColor; g.add(gloed); }
    const stip = Z < 2 ? inst(g, GEO.schijf, vlekMat(), n) : null;
    const v = volger(P), kk = new THREE.Color(), d = V(0, 0, 0), raak = V(0, 0, 0);
    return {
      update(dt, now, b, stand) {
        v.stap(dt, b, stand); const L = busLicht(ctx), H = L.helder, F = L.flits;
        let idx = 0;
        for (const s of bronnen) {
          mengKl(kk, v, s.kl, P.c, (s.i + v.tel) % 2 ? P.a : P.b, P.b);
          const zw = Math.sin(b.pos * Math.PI / 8 * (1 + 7 * v.opb) + s.i * 1.3 + (s.sx > 0 ? Math.PI : 0)), ang = b.pos * Math.PI / 2 * s.sx + s.i;
          for (let k = 0; k < K; k++, idx++) {
            const f = K > 1 ? k / (K - 1) - 0.5 : 0;
            const yaw = meng(v, 0.4 * zw + f * 1.1, 0.6 * zw + f * 1.1 * (1 - 0.8 * v.opb), 0.5 * Math.sin(ang) + f * 0.25, 0.5 * Math.sin(now * 0.25 + s.i));
            const pit = meng(v, -0.12 - 0.08 * Math.sin(b.pos * Math.PI / 4 + s.i), -0.1 - 0.5 * v.opb, -0.75 - 0.35 * Math.sin(b.pos * Math.PI + f * 3), -0.05);
            d.set(Math.cos(pit) * Math.sin(s.a0 + yaw), Math.sin(pit), Math.cos(pit) * Math.cos(s.a0 + yaw));
            const aan = meng(v, 0.55 + 0.45 * b.pulse, 0.35 + 0.65 * v.opb, ((k + v.tel) % 2 ? (v.fr < 0.5 ? 1 : 0.1) : (v.fr >= 0.5 ? 1 : 0.1)) + v.hit, k === (K >> 1) ? 0.45 : 0) * H + 0.3 * F;
            const len = uitDoos(s.p, d, M);
            _q.setFromUnitVectors(ZAS, d); _m.compose(s.p, _q, _s.set(dik, dik, len)); kern.setMatrixAt(idx, _m); kern.setColorAt(idx, _c.copy(kk).lerp(WIT, 0.25).multiplyScalar(aan));
            if (stip) vlekZet(stip, idx, raak.copy(s.p).addScaledVector(d, len), RAAK.vlak, 0.07 + 0.05 * b.pulse, kk, aan);
          }
        }
        klaar(kern, stip);
      },
      opruimen() { weg(kern, gloed, stip); } };
  } });

  // ----- 5. Peertjesveld: kale gloeilampen op verschillende hoogtes; rimpels vanuit het midden, fonkelen, flitsen in de drop -----
  reg('plafond', 'peertjes', { gewicht: 1, past: s => s.sfeer !== 'futuristisch', maak(ctx, stijl, plek) {
    const r = ctx.rnd, Z = ctx.zwaar, P = palet(stijl), M = maatVan(stijl, plek), sf = sfeerVan(stijl), g = new THREE.Group(); ctx.groep.add(g);
    const W = Math.max(3, M.w - 1.6), D = Math.max(3, M.d - 2), n0 = [72, 48, 30][Z], kol = Math.max(3, Math.round(Math.sqrt(n0 * W / D))), rij = Math.max(3, Math.round(n0 / kol));
    const warm = new THREE.Color(1.0, 0.6, 0.26).lerp(sf === 'trippy' ? P.a : P.c, sf === 'trippy' ? 0.7 : 0.2), warmA = warm.clone().lerp(P.a, 0.6), peren = [];
    for (let j = 0; j < rij; j++) for (let i = 0; i < kol; i++) {
      const x = -W / 2 + (i + 0.5) * W / kol + (r() - 0.5) * 0.3, z = -D / 2 + (j + 0.5) * D / rij + (r() - 0.5) * 0.3, y = Math.max(2.6, M.h - 0.35 - r() * 1.25);
      peren.push({ p: V(x, y, z), rho: Math.hypot(x, z), uit: false });
    }
    const n = peren.length, lamp = inst(g, GEO.bol, new THREE.MeshBasicMaterial({ color: 0xffffff }), n), halo = inst(g, GEO.vlak, plusMap(gloedTex()), n);
    const kPos = new Float32Array(n * 6), kg = new THREE.BufferGeometry(); kg.setAttribute('position', new THREE.BufferAttribute(kPos, 3));
    const kabels = new THREE.LineSegments(kg, new THREE.LineBasicMaterial({ color: 0x141416 })); kabels.frustumCulled = false; g.add(kabels);
    const zetVast = () => {
      peren.forEach((q, i) => {
        if (q.uit) { verstop(lamp, i); kPos.fill(0, i * 6, i * 6 + 6); return; }
        _m.compose(q.p, _q.identity(), _s.set(0.05, 0.07, 0.05)); lamp.setMatrixAt(i, _m);
        kPos.set([q.p.x, q.p.y + 0.06, q.p.z, q.p.x, M.h, q.p.z], i * 6);
      });
      kg.attributes.position.needsUpdate = true; klaar(lamp);
    };
    zetVast();
    const v = volger(P), kk = new THREE.Color(), warmDim = warm.clone().multiplyScalar(0.8), rmax = Math.hypot(W / 2, D / 2); let gecheckt = false;
    return {
      update(dt, now, b, stand) {
        v.stap(dt, b, stand); const L = busLicht(ctx), H = L.helder, F = L.flits;
        if (!gecheckt) { gecheckt = true; for (const q of peren) q.uit = inDeWeg(ctx, q.p.x, q.p.z, q.p.y, 0.5); zetVast(); }
        const golf = (b.pos % 1) * rmax * 1.25, fl = Math.floor(now * (4 + 12 * v.opb)), achtst = Math.floor(b.pos * 4);
        mengKl(kk, v, warm, warm, v.tel % 2 ? warmA : warm, warmDim);
        _q.copy(camera.quaternion);  // halo's naar de camera (de kamergroep is niet gedraaid)
        peren.forEach((q, i) => {
          if (q.uit) { verstop(halo, i); return; }
          const lev = meng(v, 0.18 + 0.2 * b.pulse + 0.9 * Math.exp(-Math.pow(q.rho - golf, 2) * 1.5),
            0.15 + 0.5 * v.opb + (hash(i * 7.1 + fl) > 0.85 - 0.4 * v.opb ? 0.9 : 0),
            (v.fr < 0.18 ? 1.1 : 0.25 + (hash(i + achtst * 0.37) > 0.8 ? 0.8 : 0)) + v.hit,
            0.06 + 0.1 * (0.5 + 0.5 * Math.sin(now * 0.8 + q.rho * 0.9))) * H + F;
          lamp.setColorAt(i, _c.copy(kk).lerp(WIT, 0.3 * klem(lev - 0.8)).multiplyScalar(0.08 + 1.1 * lev));
          const s = 0.25 + 0.55 * Math.min(1.4, lev);
          _m.compose(q.p, _q, _s.set(s, s, s)); halo.setMatrixAt(i, _m); halo.setColorAt(i, _c.copy(kk).multiplyScalar(0.7 * lev));
        });
        klaar(lamp, halo);
      },
      opruimen() { weg(lamp, halo); } };
  } });

  // ======================================================================================================================
  // MUURDECOR (plek {w,d,h,deuren}): zijwanden over de hele lengte, kopwanden alleen naast de deur (|x| > 1,3)
  // ======================================================================================================================
  // wandstukken: a = begin, t = richting langs de wand, n = naar binnen, len; deurKant = plek (u) die het dichtst bij de deur ligt
  function wanden(M, marge) {
    const uit = [], m = marge == null ? 0.4 : marge;
    for (const s of [-1, 1]) uit.push({ zij: true, s, a: V(s * M.w / 2, 0, -M.d / 2 + m), t: V(0, 0, 1), n: V(-s, 0, 0), len: M.d - 2 * m });
    for (const s of [-1, 1]) for (const k of [-1, 1]) {
      const x0 = k * 1.3, x1 = k * (M.w / 2 - m), len = Math.abs(x1 - x0);
      if (len < 0.5) continue;
      uit.push({ zij: false, s, k, a: V(Math.min(x0, x1), 0, s * M.d / 2), t: V(1, 0, 0), n: V(0, 0, -s), len, deurKant: k < 0 ? len : 0 });
    }
    for (const w of uit) { w.ry = Math.atan2(w.n.x, w.n.z); w.as = V(Math.cos(w.ry), 0, -Math.sin(w.ry)); }  // as = lokale x van een vlak op deze wand
    return uit;
  }
  const opWand = (w, u, y, af) => V(w.a.x + w.t.x * u + w.n.x * af, y, w.a.z + w.t.z * u + w.n.z * af);
  const MUREN = { rauw: ['beton-bunker', 'rave-flyers', 'neonsteeg'], trippy: ['paddenstoelen', 'kosmos', 'uv-jungle', 'slijmhol'], luxe: ['bass-tempel', 'chroom', 'kosmos'],
    futuristisch: ['arcade', 'neonsteeg', 'chroom', 'kosmos'], organisch: ['uv-jungle', 'slijmhol', 'paddenstoelen', 'bass-tempel'] };

  // ----- 1. Muurschilderingen: lichtbakken met een stuk muurschildering, neonlijst die op de tel gloeit, strijklicht eronder -----
  reg('muur', 'schilderingen', { gewicht: 1.1, maak(ctx, stijl, plek) {
    const r = ctx.rnd, Z = ctx.zwaar, P = palet(stijl), M = maatVan(stijl, plek), sf = sfeerVan(stijl), g = new THREE.Group(); ctx.groep.add(g);
    const keus = (MUREN[sf] || MUREN.rauw).filter(n => n !== stijl.muurTex), A = 2048 / 878;
    const tex = DH.tex(keus.length ? kies(r, keus) : (stijl.muurTex || 'kosmos'));
    const panelen = [];
    for (const w of wanden(M, 0.5)) {
      if (w.zij) {
        const nP = Math.max(1, Math.floor(w.len / 5.4)), vak = w.len / nP;
        let pw = Math.min(4.6, vak - 0.9), ph = pw / A;
        if (ph > M.h - 1.4) { ph = M.h - 1.4; pw = ph * A; }
        for (let i = 0; i < nP; i++) panelen.push({ w, u: (i + 0.5) * vak, pw, ph, yc: klem(M.h * 0.5, ph / 2 + 1.0, M.h - ph / 2 - 0.35) });
      } else if (Z < 2 && w.len >= 1.7) {
        const pw = Math.min(w.len - 0.5, 1.5), ph = Math.min(2.1, M.h - 1.3);
        if (ph > 1) panelen.push({ w, u: w.len / 2, pw, ph, yc: 0.95 + ph / 2 });
      }
    }
    const vlakken = [], vast = [], gl = [], was = [], lijst = new THREE.Color(0x0c0c0e);
    panelen.forEach((q, k) => {
      const { w, pw, ph, yc } = q, c = opWand(w, q.u, yc, 0.05), ax = w.as;
      let ch = 1, cw = (pw / ph) / A; if (cw > 1) { ch = 1 / cw; cw = 1; }
      const zoom = 0.75 + r() * 0.25; cw *= zoom; ch *= zoom;
      const u0 = r() * (1 - cw), v0 = r() * (1 - ch), pg = new THREE.PlaneGeometry(pw, ph), uv = pg.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * cw, v0 + uv.getY(i) * ch);
      vlakken.push([pg, mat(c.x, c.y, c.z, 1, 1, 1, 0, w.ry)]);
      const b0 = opWand(w, q.u, yc, 0.025);
      vast.push([GEO.doos, mat(b0.x, b0.y, b0.z, pw + 0.24, ph + 0.24, 0.05, 0, w.ry), { kl: lijst }]);
      const hx = pw / 2 + 0.07, hy = ph / 2 + 0.07, hoek = (sx, sy) => V(c.x + ax.x * sx * hx + w.n.x * 0.03, yc + sy * hy, c.z + ax.z * sx * hx + w.n.z * 0.03);
      for (const [a, b] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]]) neon(gl, hoek(...a), hoek(...b), 0.035, k, Z);
      const wh = Math.max(0.6, yc - ph / 2 + 0.4), wc = opWand(w, q.u, wh / 2, 0.012);
      was.push([GEO.vlak, mat(wc.x, wc.y, wc.z, pw * 0.95, wh, 1, 0, w.ry)]);
    });
    const pm = new THREE.MeshBasicMaterial({ map: tex, color: 0xffffff });
    if (vlakken.length) g.add(new THREE.Mesh(samen(vlakken), pm));
    const vm = vastMesh(g, vast), gm = gloedMesh(g, gl);
    const wm = plusMap(wasTex()); if (was.length && Z < 2) g.add(new THREE.Mesh(samen(was), wm));
    const v = volger(P), nP = panelen.length, KL = [P.a, P.b, P.c]; let ch = 0;
    return {
      update(dt, now, b, stand) {
        v.stap(dt, b, stand); const L = busLicht(ctx), H = L.helder, F = L.flits;
        ch += v.dp * (1 + 3 * v.opb);
        const kop = Math.floor(ch) % Math.max(1, nP);
        for (let k = 0; k < nP; k++) {
          gm.lev[k] = meng(v, k === kop ? 0.6 + 0.6 * b.pulse : 0.25 + 0.1 * b.pulse, 0.25 + 0.6 * v.opb + (k === kop ? 0.6 : 0), 0.7 + 0.4 * b.pulse * ((k + v.tel) % 2 ? 1 : 0.3) + v.hit, 0.03 + 0.05 * Math.sin(now * 0.9 + k)) * H + F;
          mengKl(gm.kl[k], v, KL[k % 3], WIT, KL[(k + v.tel) % 3], P.b);
        }
        pm.color.setScalar(meng(v, 0.1 + 0.32 * b.pulse, 0.08 + 0.55 * v.opb, 0.28 + 0.5 * b.pulse, 0.03) * H + 0.45 * F);
        wm.color.copy(KL[v.tel % 3]).multiplyScalar(meng(v, 0.35 + 0.35 * b.bas, 0.3 + 0.5 * v.opb, 0.55 + 0.5 * b.pulse, 0.06) * H);
        if (vm) vm.color.setScalar(H + 0.5 * F);
      } };
  } });

  // ----- 2. Pixelwand: ledstrips om de 50 cm langs de wanden; vu-meters in de groove, vullen in de opbouw, om-en-om in de drop -----
  const VS_PIXEL = `attribute float aU; varying vec2 vUv; varying float vS; void main() { vUv = uv; vS = aU; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  const FS_PIXEL = GL_MU + `uniform float uRij, uH; varying vec2 vUv; varying float vS;
void main() {
  float s = vS, y = vUv.y, rijen = uH / uRij;
  float j = floor(y * rijen), yc = (j + 0.5) / rijen, hs = hash1(s * 1.37 + 0.5), tel = floor(uPos);
  float niveau = 0.1 + 0.8 * mix(uBas, uHoog, hs) * (0.6 + 0.4 * sin(uT * 2.3 + s * 0.9)) + 0.12 * uPulse;
  float g1 = step(yc, niveau) * (0.35 + 0.65 * yc / max(niveau, 0.05)) + step(abs(yc - niveau - 0.04), 1.0 / rijen) * 0.9;
  float o1 = step(yc, uOpb) * 0.6 + step(abs(yc - fract(uPos * (0.5 + 3.5 * uOpb) + hs * 0.2)), 1.2 / rijen) * 1.3;
  float d1 = (mod(s + tel, 2.0) < 1.0 ? 1.0 : 0.25) * (0.45 + 0.55 * uPulse) + uHit;
  float val = fract(-uT * (0.08 + 0.12 * hs) + hs * 7.0);
  float b1 = exp(-kw((yc - val) * 14.0)) * 0.6 * step(0.5, hash1(s + 3.0));
  vec3 kleur = wGroove() * pal3(yc * 0.66) * g1 + uOpb * mix(uB, vec3(1.0), 0.25 + 0.5 * uOpb) * o1 + uDrp * pal3(s * 0.05 + tel * 0.33) * d1 + uBrk * uB * b1;
  kleur = kleur * (1.0 - 0.85 * uDim) + uFlits * 0.4;
#ifdef HALO
  gl_FragColor = vec4(kleur * exp(-kw((vUv.x - 0.5) * 5.0)) * 0.28, 1.0);
#else
  float px = (1.0 - smoothstep(0.22, 0.5, abs(fract(y * rijen) - 0.5))) * (1.0 - smoothstep(0.15, 0.5, abs(vUv.x - 0.5)));
  gl_FragColor = vec4(uD * 0.06 + kleur * px, 1.0);
#endif
}`;
  reg('muur', 'pixelwand', { gewicht: 1, maak(ctx, stijl, plek) {
    const Z = ctx.zwaar, P = palet(stijl), M = maatVan(stijl, plek), g = new THREE.Group(); ctx.groep.add(g);
    const y0 = 0.45, y1 = Math.min(M.h - 0.35, 3.3), BH = y1 - y0, stroken = [], halos = [];
    let s = 0;
    for (const w of wanden(M, 0.3)) {
      const nS = Math.floor(w.len / 0.5);
      for (let i = 0; i < nS; i++, s++) {
        const c = opWand(w, (i + 0.5) * w.len / nS, (y0 + y1) / 2, 0.025), si = s;
        stroken.push([GEO.vlak, mat(c.x, c.y, c.z, 0.07, BH, 1, 0, w.ry), { s: si }]);
        if (Z === 0) { const h = opWand(w, (i + 0.5) * w.len / nS, (y0 + y1) / 2, 0.015); halos.push([GEO.vlak, mat(h.x, h.y, h.z, 0.42, BH, 1, 0, w.ry), { s: si }]); }
      }
    }
    const u = mu(P, { uRij: { value: Z === 2 ? 0.09 : 0.06 }, uH: { value: BH } });
    const sm = shader(u, VS_PIXEL, FS_PIXEL);
    g.add(new THREE.Mesh(samen(stroken, { u: (p, x) => x.s }), sm));
    let hm = null;
    if (halos.length) { hm = shader(u, VS_PIXEL, FS_PIXEL, Object.assign({ defines: { HALO: 1 } }, plusOpties)); g.add(new THREE.Mesh(samen(halos, { u: (p, x) => x.s }), hm)); }
    const v = volger(P);
    return {
      update(dt, now, b, stand) { v.stap(dt, b, stand); muZet(u, now, b, v, busLicht(ctx)); } };
  } });

  // ----- 3. Speakerwanden: stapels kasten langs de zijwanden en naast de deuren; conussen pompen op de bas, ringen gloeien op de tel -----
  reg('muur', 'speakers', { gewicht: 1, maak(ctx, stijl, plek) {
    const Z = ctx.zwaar, P = palet(stijl), M = maatVan(stijl, plek), sf = sfeerVan(stijl), g = new THREE.Group(); ctx.groep.add(g);
    const kast = sf === 'organisch' ? new THREE.Color(0x5a3e22) : sf === 'futuristisch' ? new THREE.Color(0x9aa0aa) : sf === 'trippy' ? P.a.clone().multiplyScalar(0.25) : new THREE.Color(0x121214);
    const rand = sf === 'luxe' ? new THREE.Color(0xc9a24a) : kast.clone().multiplyScalar(1.6).addScalar(0.02);
    const CW = 0.9, CH = 0.85, CD = 0.6, rijen = Math.max(1, Math.min([3, 3, 2][Z], Math.floor((M.h - 0.4) / CH))), vast = [], conussen = [];
    function stapel(w, u, kol, nr) {
      for (let c = 0; c < kol; c++) for (let j = 0; j < nr; j++) {
        const uc = u + (c - (kol - 1) / 2) * CW, y = CH / 2 + j * CH, m = opWand(w, uc, y, CD / 2);
        vast.push([GEO.doos, mat(m.x, m.y, m.z, CW - 0.02, CH - 0.02, CD, 0, w.ry), { kl: kast }]);
        const f = opWand(w, uc, y, CD + 0.004);
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) {  // metalen hoekjes
          const dx = sx * (CW / 2 - 0.04);
          vast.push([GEO.doos, mat(f.x + w.as.x * dx, y + sy * (CH / 2 - 0.04), f.z + w.as.z * dx, 0.07, 0.07, 0.02, 0, w.ry), { kl: rand }]);
        }
        if (j === nr - 1 && nr > 1) for (const dx of [-0.2, 0.2]) conussen.push({ p: V(f.x + w.as.x * dx, y, f.z + w.as.z * dx), w, r: 0.15 });  // bovenkast: twee kleintjes
        else conussen.push({ p: f, w, r: 0.36 });
      }
    }
    for (const w of wanden(M, 0.4)) {
      if (w.zij) { const nS = w.len >= 10 ? 2 : 1; for (let i = 0; i < nS; i++) stapel(w, w.len * (i + 0.5) / nS, 2, rijen); }
      else if (w.len >= 1.1) stapel(w, w.deurKant === 0 ? 0.55 : w.len - 0.55, 1, rijen);
    }
    const vm = vastMesh(g, vast), n = conussen.length;
    const con = inst(g, GEO.schijf, new THREE.MeshBasicMaterial({ map: speakerTex(), color: 0xffffff }), n, false), ring = inst(g, GEO.vlak, plusMap(ringTex()), n);
    const v = volger(P), kk = new THREE.Color(), KL = [P.a, P.b, P.c]; let pomp = 0, rond = 0;
    return {
      update(dt, now, b, stand) {
        v.stap(dt, b, stand); const L = busLicht(ctx), H = L.helder, F = L.flits;
        pomp = Math.max(pomp * Math.exp(-dt * 12), b.bas * (1 - 0.6 * v.brk));
        rond += v.dp * (1 + 3 * v.opb);
        conussen.forEach((q, i) => {
          const w = q.w, uit = q.r > 0.2 ? pomp * 0.035 : pomp * 0.01, s = q.r * (1 + 0.04 * pomp);
          _q.setFromAxisAngle(YAS, w.ry); _p.set(q.p.x + w.n.x * uit, q.p.y, q.p.z + w.n.z * uit);
          _m.compose(_p, _q, _s.set(s, s, 1)); con.setMatrixAt(i, _m);
          _p.set(q.p.x + w.n.x * 0.004, q.p.y, q.p.z + w.n.z * 0.004); _m.compose(_p, _q, _s.set(q.r * 2.5, q.r * 2.5, 1)); ring.setMatrixAt(i, _m);
          const lev = meng(v, (Math.floor(rond) % 4 === i % 4 ? 0.8 : 0.15) + 0.4 * pomp, 0.15 + 0.7 * v.opb, 0.5 + 0.7 * b.pulse + v.hit, 0) * H + F;
          ring.setColorAt(i, mengKl(kk, v, KL[i % 3], WIT, KL[(i + v.tel) % 3], P.b).multiplyScalar(lev));
        });
        con.material.color.setScalar(0.8 * H + 0.4 * F);
        klaar(con, ring);
        if (vm) vm.color.setScalar(H + 0.4 * F);
      },
      opruimen() { weg(con, ring); } };
  } });

  // ----- 4. Neonwoorden: woorden van de sfeer (en eentje boven de uitgang) op donkere platen; flakkeren, roepen om beurten, spellen in de opbouw -----
  const WOORDEN = { rauw: ['NO PHOTOS', 'RAW', 'UNDERGROUND', 'TECHNO', 'BASS', 'NO SLEEP'], trippy: ['TRIP', 'FREQUENCY', 'ZWEEF', 'COSMIC', 'MELT', 'WAKE UP'],
    luxe: ['VIP', 'GOLD', 'DELUXE', 'CHAMPAGNE', 'AFTER DARK'], futuristisch: ['2099', 'SYNTH', 'SYSTEM ONLINE', 'NEON', 'FUTURE'], organisch: ['GROW', 'ROOTS', 'BLOEI', 'JUNGLE', 'WILD'] };
  reg('muur', 'neonwoorden', { gewicht: 1, maak(ctx, stijl, plek) {
    const r = ctx.rnd, Z = ctx.zwaar, P = palet(stijl), M = maatVan(stijl, plek), g = new THREE.Group(); ctx.groep.add(g);
    const lijst = (WOORDEN[sfeerVan(stijl)] || WOORDEN.rauw).concat(['DEEP SAMSO', 'BLOODLINE', 'DANCE']), KL = [P.a, P.b, P.c], woorden = [], vast = [], gl = [], plaat = new THREE.Color(0x09090b);
    const zet = (tekst, c, ry, ww, kl) => {
      const m = ctx.neon(tekst, hex(kl), ww, ww / 4); m.position.copy(c); m.rotation.y = ry;
      const k = woorden.length; woorden.push({ m, k, uitTot: 0, volgende: 2 + r() * 6 });
      return k;
    };
    const naast = (w, u, y, ww, kl, tekst) => {
      const c = opWand(w, u, y, 0.05), b0 = opWand(w, u, y, 0.025), k = zet(tekst, c, w.ry, ww, kl);
      vast.push([GEO.doos, mat(b0.x, b0.y, b0.z, ww + 0.2, ww / 4 + 0.14, 0.04, 0, w.ry), { kl: plaat }]);
      if (Z < 2) { const a = opWand(w, u - ww * 0.42, y - ww / 8 - 0.05, 0.06), e = opWand(w, u + ww * 0.42, y - ww / 8 - 0.05, 0.06); neon(gl, a, e, 0.025, k, Z); }
    };
    const n = [5, 4, 3][Z], zij = wanden(M, 0.6).filter(w => w.zij), gebruikt = new Set();
    const nieuwWoord = () => { let t = kies(r, lijst); for (let i = 0; i < 6 && gebruikt.has(t); i++) t = kies(r, lijst); gebruikt.add(t); return t; };
    if (M.h >= 3.4) {  // boven de uitgang
      const ww = Math.min(2.0, (M.h - 2.75) * 4), c = V(0, 2.6 + (M.h - 2.6) / 2, M.d / 2 - 0.05);
      if (ww >= 0.9) { zet(kies(r, ['EXIT', 'NO EXIT', 'DEEPER', 'NOG DIEPER', '∞']), c, Math.PI, ww, P.c); vast.push([GEO.doos, mat(0, c.y, M.d / 2 - 0.025, ww + 0.2, ww / 4 + 0.14, 0.04), { kl: plaat }]); }
    }
    const per = Math.max(1, Math.ceil((n - woorden.length) / 2));
    for (let i = 0; woorden.length < n && i < 2 * per; i++) {
      const w = zij[i % 2], slot = Math.floor(i / 2), tekst = nieuwWoord();
      const ww = klem(0.42 * tekst.length, 1.3, Math.min(3.4, w.len / per - 0.6)), y = klem(2.1 + r() * 0.9, 1.6 + ww / 8, M.h - 0.35 - ww / 8);
      naast(w, (slot + 0.5) * w.len / per, y, ww, KL[i % 3], tekst);
    }
    const vm = vastMesh(g, vast), gm = gloedMesh(g, gl), v = volger(P);
    return {
      update(dt, now, b, stand) {
        v.stap(dt, b, stand); const L = busLicht(ctx), H = L.helder, F = L.flits, N = woorden.length;
        for (const q of woorden) {
          // kapotte neon: af en toe even uit (vaker in de opbouw)
          if (now > q.volgende) { q.uitTot = now + 0.05 + r() * 0.15; q.volgende = now + (2 + r() * 7) * (1 - 0.7 * v.opb); }
          const flak = now < q.uitTot ? 0.08 : 1, k = q.k;
          const lev = meng(v, (v.tel % N === k ? 1 : 0.65) + 0.25 * b.pulse, v.opb * N > k ? 0.7 + 0.3 * v.opb : 0.04, ((k + Math.floor(b.pos * 2)) % 2 ? 1.1 : 0.3) + v.hit, k === 0 ? 0.5 : 0.04);
          q.m.material.color.setScalar(lev * flak * H + F);
          if (gm) { gm.lev[k] = lev * flak * 0.8 * H + F; gm.kl[k].copy(KL[k % 3]); }
        }
        if (vm) vm.color.setScalar(H + 0.4 * F);
      } };
  } });

  // ----- 5. Buizen en kabels: industriële leidingen langs de wanden, een glazen plasmabuis waar op de tel energie doorheen stroomt -----
  const VS_PLASMA = `attribute float aU; varying float vU; varying float vF;
void main() { vU = aU; vec4 mv = modelViewMatrix * vec4(position, 1.0); vF = abs(dot(normalize(normalMatrix * normal), normalize(-mv.xyz))); gl_Position = projectionMatrix * mv; }`;
  const FS_PLASMA = `uniform float uFase, uDicht, uBasis, uLev; uniform vec3 uK1, uK2; varying float vU; varying float vF;
void main() {
  float puls = pow(0.5 + 0.5 * cos(6.2831 * (vU * uDicht - uFase)), 10.0);
  float kern = 0.3 + 0.7 * pow(vF, 1.5);
  gl_FragColor = vec4(mix(uK1, uK2, puls) * (uBasis + puls * 1.4) * kern * uLev, 1.0);
}`;
  reg('muur', 'buizen', { gewicht: 0.9, maak(ctx, stijl, plek) {
    const r = ctx.rnd, Z = ctx.zwaar, P = palet(stijl), M = maatVan(stijl, plek), sf = sfeerVan(stijl), g = new THREE.Group(); ctx.groep.add(g);
    const metaal = sf === 'luxe' ? new THREE.Color(0xa8823a) : sf === 'organisch' ? new THREE.Color(0x8a5232) : sf === 'trippy' ? P.a.clone().multiplyScalar(0.18) : new THREE.Color(0x56595f);
    const vast = [], glas = [], dz = M.d / 2 - 0.1, yTop = M.h - 0.35;
    const buis = (a, b, rr, kl) => vast.push([GEO.czDicht, staaf(a, b, rr * 2), { kl: kl || metaal }]);
    for (const s of [-1, 1]) {
      const X = off => s * (M.w / 2 - off);
      const lijnen = [[yTop, 0.11, 0.2], [M.h - 0.68, 0.07, 0.16], [0.3, 0.08, 0.15]];
      for (const [y, rr, off] of lijnen) {
        buis(V(X(off), y, -dz), V(X(off), y, dz), rr);
        for (let z = -dz + 1; z < dz; z += 2) {  // flenzen en beugels
          buis(V(X(off), y, z - 0.03), V(X(off), y, z + 0.03), rr * 1.35, metaal.clone().multiplyScalar(0.8));
          vast.push([GEO.doos, mat(X(off / 2), y, z, off, 0.04, 0.05)]);
        }
      }
      for (let z = -dz + 1.6; z < dz - 0.5; z += 3.2) {  // stijgbuizen met een afsluiter
        buis(V(X(0.1), 0.3, z), V(X(0.1), yTop, z), 0.05);
        vast.push([new THREE.TorusGeometry(0.12, 0.018, 5, 14), mat(X(0.16), 1.05, z, 1, 1, 1, 0, Math.PI / 2), { kl: sf === 'rauw' ? new THREE.Color(0x7a1a14) : metaal }]);
      }
      glas.push([GEO.czDicht, staaf(V(X(0.14), 1.35, -dz), V(X(0.14), 1.35, dz), 0.11)]);
      if (Z === 0) for (let c = 0; c < 3; c++) {  // kabels die tussen haken doorhangen
        const z0 = -dz + c * (2 * dz / 3), z1 = z0 + 2 * dz / 3, y = M.h - 0.18 - c * 0.06, zak = 0.25 + r() * 0.25, pts = [];
        for (let k = 0; k <= 8; k++) { const t = k / 8; pts.push(V(X(0.06 + c * 0.04), y - zak * 4 * t * (1 - t), z0 + (z1 - z0) * t)); }
        vast.push([new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.016, 5), new THREE.Matrix4(), { kl: new THREE.Color(0x0c0c0e) }]);
      }
    }
    if (yTop > 2.85) for (const s of [-1, 1]) buis(V(-M.w / 2 + 0.2, yTop, s * (M.d / 2 - 0.2)), V(M.w / 2 - 0.2, yTop, s * (M.d / 2 - 0.2)), 0.11);  // boven de deuren door
    const vm = vastMesh(g, vast, metaal);
    const pm = shader({ uFase: { value: 0 }, uDicht: { value: 0.5 }, uBasis: { value: 0.15 }, uLev: { value: 1 }, uK1: { value: P.b.clone() }, uK2: { value: P.a.clone() } }, VS_PLASMA, FS_PLASMA, plusOpties);
    g.add(new THREE.Mesh(samen(glas, { u: p => p.z }), pm));
    const v = volger(P); let fase = 0;
    return {
      update(dt, now, b, stand) {
        v.stap(dt, b, stand); const L = busLicht(ctx), H = L.helder, F = L.flits, u = pm.uniforms;
        fase += v.dp * meng(v, 0.5, 0.5 + 3.5 * v.opb, 2, 0.125);
        u.uFase.value = fase % 1000; u.uDicht.value = meng(v, 0.5, 0.5 + 1.5 * v.opb, 1, 0.25);
        u.uBasis.value = meng(v, 0.12, 0.12 + 0.3 * v.opb, 0.5 + 0.4 * b.pulse, 0.05); u.uLev.value = meng(v, 0.8 + 0.3 * b.pulse, 0.8 + 0.4 * v.opb, 1 + v.hit, 0.5) * H + F;
        mengKl(u.uK1.value, v, P.b, P.b, v.tel % 2 ? P.a : P.c, P.b); u.uK2.value.copy(P.a).lerp(WIT, 0.3);
        if (vm) vm.color.setScalar(H + 0.4 * F);
      } };
  } });

  // ======================================================================================================================
  // VLOEREN (plek {w,d}): één vlak met een shader, net boven de vloer van de doos; één draw call
  // ======================================================================================================================
  function vloerMesh(ctx, M, u, fs, defines) {
    const m = shader(u, VS_VLOER, fs, defines ? { defines } : null);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(M.w, M.d).rotateX(-Math.PI / 2), m); mesh.position.y = 0.012; ctx.groep.add(mesh);
    return m;
  }

  // ----- 1. Ledtegels: glazen tegels met patronen: schaakbord en ring (groove), vierkanten naar binnen (opbouw), kleurenregen (drop) -----
  const FS_TEGELS = GL_MU + `uniform float uTegel; varying vec2 vP;
void main() {
  vec2 q = vP / uTegel; vec2 cel = floor(q); vec2 f = fract(q) - 0.5;
  float h = hash2(cel + 7.13), tel = floor(uPos), fr = fract(uPos);
  vec2 mid = (cel + 0.5) * uTegel; float rho = length(mid), sq = max(abs(mid.x), abs(mid.y));
  float schaak = mod(cel.x + cel.y + tel, 2.0);
  float g1 = 0.02 + 0.22 * schaak * (0.15 + 0.85 * uPulse) + 0.45 * exp(-kw(rho - fr * 9.0) * 0.6);  // donkere tegels tussen de slagen (anders een fel 70s-schaakbord)
  float o1 = 0.12 + 0.4 * uOpb + 0.85 * exp(-kw(fract(-uPos * (0.5 + 1.5 * uOpb)) * 9.0 - sq) * 1.2) + step(1.0 - 0.3 * uOpb, hash2(cel + floor(uT * (4.0 + 12.0 * uOpb))));
  float d1 = (0.3 + 0.7 * uPulse) * (0.5 + 0.5 * step(0.5, hash2(cel + tel))) + uHit * 1.2;
  float b1 = 0.04 + 0.16 * (0.5 + 0.5 * sin(uT * 0.7 + h * 6.28)) * step(0.72, h);
  float lev = wGroove() * g1 + uOpb * o1 + uDrp * d1 + uBrk * b1;
  float som = max(0.001, wGroove() + uOpb + uDrp + uBrk);
  vec3 kol = (mix(uA, uB, schaak) * wGroove() + mix(uB, vec3(1.0), 0.6 * uOpb) * uOpb + pal3(h + tel * 0.25) * uDrp + uB * uBrk) / som;
  float m = max(abs(f.x), abs(f.y));
  float vlak = (1.0 - smoothstep(0.42, 0.5, m)), rand = smoothstep(0.4, 0.43, m) * (1.0 - smoothstep(0.45, 0.48, m));
  float binnen = 0.6 + 0.4 * (1.0 - smoothstep(0.0, 0.5, length(f)));
  vec3 c = uD * 0.2 + (kol * lev * 0.8 * vlak * binnen + rand * 0.04) * (1.0 - 0.85 * uDim) + uFlits * 0.25 * vlak;
  gl_FragColor = vec4(c, 1.0);
}`;
  reg('vloer', 'ledtegels', { gewicht: 1.1, maak(ctx, stijl, plek) {
    const P = palet(stijl), M = maatVan(stijl, plek), u = mu(P, { uTegel: { value: M.w / Math.max(4, Math.round(M.w / 0.9)) } });
    vloerMesh(ctx, M, u, FS_TEGELS);
    const v = volger(P);
    return { update(dt, now, b, stand) { v.stap(dt, b, stand); muZet(u, now, b, v, busLicht(ctx)); } };
  } });

  // ----- 2. Vloeibaar: olie/lava die stroomt, rimpels op de bas, glanslijnen; sneller en voller in opbouw en drop -----
  const FS_VLOEI = GL_MU + `uniform float uFase; varying vec2 vP;
void main() {
  vec2 p = vP * 0.22; float t = uFase;
  vec2 w = p + vec2(sin(p.y * 1.7 + t * 0.9), cos(p.x * 1.3 - t * 0.7)) * 0.8;
  w += vec2(sin(w.y * 2.3 - t * 1.1), cos(w.x * 2.1 + t * 0.8)) * 0.4 * (1.0 + uBas);
  float rho = length(vP);
  float v = 0.5 + 0.5 * sin(w.x * 2.0 + w.y * 1.6 + t) + uBas * 0.25 * sin(rho * 3.0 - uT * 6.0) * exp(-rho * 0.12);
  vec3 kol = mix(pal3(v * 0.9 + t * 0.05), uD * 2.0, 0.5 * uBrk);
  float lijn = smoothstep(0.9, 1.0, 1.0 - abs(fract(v * 4.0) - 0.5) * 2.0);
  float lev = (0.06 + 0.08 * uEn + 0.22 * uPulse * (1.0 - uBrk) + 0.22 * uDrp + 0.16 * uOpb + 0.3 * uHit) * (1.0 - 0.8 * uBrk);
  float ader = smoothstep(0.55, 1.0, v);  // alleen de toppen van de golven gloeien, de rest is diep donker
  vec3 c = kol * lev * (0.25 + 0.75 * ader) + lijn * kol * (0.12 + 0.35 * uHoog) * (1.0 - 0.7 * uBrk);
  gl_FragColor = vec4(c * (1.0 - 0.85 * uDim) + uFlits * 0.2 * ader, 1.0);
}`;
  reg('vloer', 'vloeibaar', { gewicht: 0.9, past: s => s.sfeer !== 'rauw', maak(ctx, stijl, plek) {
    const P = palet(stijl), M = maatVan(stijl, plek), u = mu(P, { uFase: { value: ctx.rnd() * 50 } });
    vloerMesh(ctx, M, u, FS_VLOEI);
    const v = volger(P); let fase = u.uFase.value;
    return { update(dt, now, b, stand) {
      v.stap(dt, b, stand); muZet(u, now, b, v, busLicht(ctx));
      fase += dt * meng(v, 0.35 + 0.3 * v.en, 0.4 + 1.4 * v.opb, 1.3, 0.12); u.uFase.value = fase % 5000;
    } };
  } });

  // ----- 3. Geluidsgolven: donkere vloer met een poolraster; ringen lopen vanaf de dj naar buiten op de tel (opbouw: steeds dichter) -----
  const FS_GOLF = GL_MU + `uniform float uRing[8], uRingK[8], uV; uniform vec2 uCentrum; varying vec2 vP;
void main() {
  vec2 q = vP - uCentrum; float rho = length(q), ang = atan(q.y, q.x);
  float cirkel = 1.0 - smoothstep(0.0, 0.03, abs(fract(rho + 0.5) - 0.5));
  float spaak = 1.0 - smoothstep(0.0, 0.025, rho * abs(fract(ang / 0.2618 + 0.5) - 0.5) * 0.2618);
  vec3 c = uD * 0.35 + uA * (cirkel + spaak) * 0.07 * (1.0 - 0.7 * uBrk);
  for (int i = 0; i < 8; i++) {
    float a = uRing[i];
    if (a >= 0.0) {
      float band = exp(-kw((rho - a * uV) / (0.2 + 0.12 * uDrp))) * exp(-a * 0.45);
      c += pal3(uRingK[i]) * band * (0.7 + 0.5 * uDrp) * (1.0 - 0.6 * uBrk);
    }
  }
  c += pal3(uPos / 16.0) * exp(-rho * rho * 0.5) * (0.15 + 0.6 * uBas) * (1.0 - 0.5 * uBrk);
  gl_FragColor = vec4(c * (1.0 - 0.85 * uDim) + uFlits * 0.2, 1.0);
}`;
  reg('vloer', 'golven', { gewicht: 1, maak(ctx, stijl, plek) {
    const P = palet(stijl), M = maatVan(stijl, plek), ringen = new Float32Array(8).fill(-1), kleur = new Float32Array(8);
    const u = mu(P, { uRing: { value: ringen }, uRingK: { value: kleur }, uV: { value: 4 }, uCentrum: { value: new THREE.Vector2() } });
    vloerMesh(ctx, M, u, FS_GOLF);
    const v = volger(P); let vorig = null, nr = 0;
    return { update(dt, now, b, stand) {
      v.stap(dt, b, stand); muZet(u, now, b, v, busLicht(ctx));
      const f = focusVan(ctx); u.uCentrum.value.set(f.x, f.z); u.uV.value = 3.5 + 2 * v.drp;
      for (let i = 0; i < 8; i++) if (ringen[i] >= 0) { ringen[i] += dt; if (ringen[i] > 9) ringen[i] = -1; }
      // nieuwe ring op de onderverdeling van de stand: break 4 tellen, groove 1, opbouw 1 > 1/2 > 1/4, drop 1/2
      const stap = v.st === 'break' ? 4 : v.st === 'drop' ? 0.5 : v.st === 'opbouw' ? (v.opb < 0.4 ? 1 : v.opb < 0.75 ? 0.5 : 0.25) : 1, k = Math.floor(b.pos / stap);
      if (vorig != null && k !== vorig) { let i = ringen.indexOf(-1); if (i < 0) { i = 0; for (let j = 1; j < 8; j++) if (ringen[j] > ringen[i]) i = j; } ringen[i] = 0; kleur[i] = (nr++ % 3) / 3; }
      vorig = k;
    } };
  } });

  // ----- 4. Synthwave-raster: gloeiende lijnen die in de maat naar de ingang schuiven, een scanlijn op de tel -----
  const FS_RASTER = GL_MU + `uniform float uScroll, uCel, uDiep; varying vec2 vP;
void main() {
  vec2 q = vP / uCel; q.y += uScroll;
  vec2 d = (0.5 - abs(fract(q) - 0.5)) * uCel;
  float lx = exp(-d.y / 0.03) + 0.3 * exp(-d.y / 0.22), lz = exp(-d.x / 0.03) + 0.3 * exp(-d.x / 0.22);
  float diep = clamp(vP.y / uDiep + 0.5, 0.0, 1.0);
  vec3 kx = mix(uA, uC, diep), kz = mix(uB, uA, diep);
  float scanZ = (fract(uPos / 4.0) - 0.5) * uDiep * (1.0 - uDrp) + (0.5 - fract(uPos)) * uDiep * uDrp;
  float scan = exp(-kw((vP.y - scanZ) / 0.35)) * (1.0 - uBrk);
  float lev = wGroove() * (0.55 + 0.45 * uPulse) + uOpb * (0.4 + 0.8 * uOpb) + uDrp * (1.0 + 0.4 * uPulse + uHit) + uBrk * 0.15;
  vec3 c = uD * 0.4 + (kx * lx + kz * lz) * lev + mix(uC, vec3(1.0), 0.4) * scan * 0.6;
  gl_FragColor = vec4(c * (1.0 - 0.85 * uDim) + uFlits * 0.15, 1.0);
}`;
  reg('vloer', 'raster', { gewicht: 0.9, past: s => s.sfeer !== 'organisch' && s.sfeer !== 'luxe', maak(ctx, stijl, plek) {
    const P = palet(stijl), M = maatVan(stijl, plek), u = mu(P, { uScroll: { value: 0 }, uCel: { value: 1.0 }, uDiep: { value: M.d } });
    vloerMesh(ctx, M, u, FS_RASTER);
    const v = volger(P); let scroll = 0;
    return { update(dt, now, b, stand) {
      v.stap(dt, b, stand); muZet(u, now, b, v, busLicht(ctx));
      scroll += v.dp * meng(v, 1, 1 + 3 * v.opb * v.opb, 2, 0.1); u.uScroll.value = scroll % 64;  // cellen per tel, naar de ingang toe
    } };
  } });

  // ----- 5. Natte glans: donker nat beton met plassen; gekleurde reflectiestrepen van de lampen rekken naar de kijker toe -----
  const FS_NAT = GL_MU + `#define NL ${'${NL}'}
uniform vec3 uL[NL]; uniform vec3 uLK[NL]; uniform vec3 uCam; varying vec2 vP;
void main() {
  float n = ruis(vP * 0.55) * 0.65 + ruis(vP * 1.9 + 3.1) * 0.35;
  float nat = smoothstep(0.42, 0.6, n);
  vec3 basis = uD * (0.4 + 0.3 * ruis(vP * 6.0)) * (1.0 - 0.45 * nat);
  vec3 refl = vec3(0.0);
  for (int i = 0; i < NL; i++) {
    vec3 L = uL[i];
    vec2 ax = uCam.xz - L.xz; float la = max(0.01, length(ax)); ax /= la;
    vec2 M = L.xz + ax * la * (L.y / (L.y + uCam.y));       // spiegelpunt tussen lamp en kijker
    vec2 dd = vP - M; float langs = dot(dd, ax), dwars = dot(dd, vec2(-ax.y, ax.x));
    float s = exp(-dwars * dwars / (0.03 + 0.015 * L.y)) * exp(-langs * langs / (0.5 + 0.6 * L.y));
    refl += uLK[i] * s;
  }
  vec3 c = basis + refl * mix(0.25, 1.0, nat) * (1.0 - 0.85 * uDim) + uA * 0.025 * nat;
  gl_FragColor = vec4(c + uFlits * 0.4 * nat, 1.0);
}`;
  reg('vloer', 'natglans', { gewicht: 1, past: s => s.sfeer !== 'trippy', maak(ctx, stijl, plek) {
    const Z = ctx.zwaar, P = palet(stijl), M = maatVan(stijl, plek), NL = Z === 2 ? 5 : 8;
    // lampen die weerspiegelen: neon op de zijwanden, naast de uitgang, het middenstuk en een spot aan het plafond
    const bron = [[-(M.w / 2 - 0.1), 2.4, -M.d / 4], [M.w / 2 - 0.1, 2.4, M.d / 4], [0, 2.0, 0], [-2.2, 2.6, M.d / 2 - 0.1], [2.2, 2.6, M.d / 2 - 0.1],
      [-(M.w / 2 - 0.1), 2.4, M.d / 4], [M.w / 2 - 0.1, 2.4, -M.d / 4], [0, M.h - 0.3, -M.d / 4]].slice(0, NL).map(p => V(...p));
    const kl = []; for (let i = 0; i < NL; i++) kl.push(new THREE.Color());
    const u = mu(P, { uL: { value: bron }, uLK: { value: kl }, uCam: { value: V(0, 1.7, -M.d / 2) } });
    vloerMesh(ctx, M, u, FS_NAT.replace('${NL}', NL));
    const v = volger(P), KL = [P.a, P.b, P.c, P.b, P.a, P.c, P.a, WIT];
    return { update(dt, now, b, stand) {
      v.stap(dt, b, stand); const L = busLicht(ctx); muZet(u, now, b, v, L);
      camLokaal(ctx, u.uCam.value); u.uCam.value.y = Math.max(0.4, u.uCam.value.y);
      const f = focusVan(ctx); bron[2].set(f.x, Math.max(1.2, f.y), f.z);
      for (let i = 0; i < NL; i++) {
        const lev = meng(v, (i + v.tel) % NL === 0 ? 1.1 : 0.45 + 0.25 * b.pulse, 0.3 + 0.8 * v.opb * (hash(i + Math.floor(now * 8)) > 0.5 ? 1 : 0.4), (i + v.tel) % 2 ? 1.1 + v.hit : 0.35, i === 2 ? 0.6 : i === 7 ? 0.25 : 0.02);
        mengKl(kl[i], v, KL[i], KL[i], KL[(i + v.tel) % 3], P.b).multiplyScalar(lev * 0.9);
      }
    } };
  } });

  // ======================================================================================================================
  // SHOWS (plek {w,d,h}): lichtregie over de hele kamer; dim en flits gaan via de bus ook naar de andere onderdelen
  // ======================================================================================================================
  function showSlot(ctx) { const s = { dim: 0, flits: 0 }; bus(ctx).shows.push(s); return s; }
  function showWeg(ctx, s) { const a = bus(ctx).shows, i = a.indexOf(s); if (i >= 0) a.splice(i, 1); }
  const camBinnen = (ctx, M, p) => { camLokaal(ctx, p); return Math.abs(p.x) < M.w / 2 && Math.abs(p.z) < M.d / 2 && p.y > 0 && p.y < M.h; };
  // schil net binnen de wanden (BackSide): verlicht (additief) of verduistert (zwart) vloer, wanden en plafond van de doos
  function schil(parent, M, m, volgorde) {
    m.side = THREE.BackSide; const s = new THREE.Mesh(GEO.blok, m);
    s.position.set(0, M.h / 2, 0); s.scale.set(M.w - 0.06, M.h - 0.02, M.d - 0.06); s.renderOrder = volgorde; parent.add(s); return s;
  }

  // ----- 1. Stroboscoop, alleen in de drop: kasten aan de wanden; de eerste twee tellen vol, daarna op de offbeat en elke vierde tel -----
  reg('show', 'stroboscoop', { gewicht: 1, maak(ctx, stijl, plek) {
    const Z = ctx.zwaar, M = maatVan(stijl, plek), g = new THREE.Group(); ctx.groep.add(g);
    const slot = showSlot(ctx), n = [6, 4, 3][Z], rij = Math.ceil(n / 2), units = [];
    for (let i = 0; i < n; i++) { const s = i % 2 ? 1 : -1; units.push({ p: V(s * (M.w / 2 - 0.1), M.h - 0.35, -M.d / 2 + (Math.floor(i / 2) + 0.5) * M.d / rij), ry: -s * Math.PI / 2, s }); }
    const kast = inst(g, GEO.blok, new THREE.MeshBasicMaterial({ color: 0x18181b }), n, false), raam = inst(g, GEO.vlak, additive(0xffffff, 1), n);
    units.forEach((q, i) => {
      _q.setFromAxisAngle(YAS, q.ry); _m.compose(q.p, _q, _s.set(0.5, 0.22, 0.14)); kast.setMatrixAt(i, _m);
      _m.compose(_p.set(q.p.x - q.s * 0.075, q.p.y, q.p.z), _q, _s.set(0.44, 0.15, 1)); raam.setMatrixAt(i, _m); raam.setColorAt(i, ZWART);
    });
    klaar(kast, raam);
    const wit = Z < 2 ? schil(g, M, additive(0x000000, 1), 4) : null;
    const quad = new THREE.Mesh(GEO.vlak, Object.assign(additive(0x000000, 1), { depthTest: false })); quad.renderOrder = 999; g.add(quad);
    const v = volger(), cp = V(0, 0, 0); let vorig = null, flitsT = -9, alle = true, welke = 0, dropB = 0, stVorig = null;
    return {
      update(dt, now, b, stand) {
        v.stap(dt, b, stand);
        const st = typeof S !== 'undefined' && S.strobe ? S.strobe : 'soms', div = st === 'vaak' ? 4 : 2, sub = Math.floor(b.pos * div), R = window.clubRegie;
        if (v.st === 'drop' && stVorig !== 'drop') dropB = R && R.dropBeat >= 0 && R.dropBeat <= b.pos ? R.dropBeat : b.pos;
        stVorig = v.st;
        if (vorig != null && sub !== vorig && v.st === 'drop' && st !== 'uit') {
          const sinds = b.pos - dropB, pos = sub % div;
          let fl = false;
          if (sinds < 2) { fl = true; alle = true; }                                                   // eerste twee tellen: vol
          else if (sinds < 12) { fl = pos === div >> 1 || (pos === 0 && Math.floor(b.pos) % 4 === 0); alle = pos === 0; welke = Math.floor(Math.random() * n); }  // offbeat + elke vierde tel
          else { fl = pos === 0 && Math.floor(b.pos) % 2 === 0; alle = true; }
          if (fl) flitsT = now;
        }
        vorig = sub;
        const f = st === 'uit' ? 0 : Math.exp(-(now - flitsT) * 28);
        for (let i = 0; i < n; i++) raam.setColorAt(i, _c.setScalar(st === 'uit' ? v.drp * 0.3 * b.pulse : (alle || i === welke ? f * 1.5 : 0.04 * v.drp)));
        klaar(raam);
        slot.flits = f * (st === 'vaak' ? 0.9 : 0.6) * (alle ? 1 : 0.4); slot.dim = 0;
        if (wit) { wit.material.color.setScalar(f * (st === 'vaak' ? 0.5 : 0.35) * (alle ? 1 : 0.4)); wit.visible = f > 0.01; }
        const q = st === 'vaak' && alle && f > 0.01 && camBinnen(ctx, M, cp);
        quad.visible = q;
        if (q) { camera.getWorldDirection(_w); quad.position.copy(cp).addScaledVector(_w, 0.5); quad.quaternion.copy(camera.quaternion); quad.scale.set(4, 4, 1); quad.material.color.setScalar(f * 0.22); }
      },
      opruimen() { showWeg(ctx, slot); weg(kast, raam); } };
  } });

  // ----- 2. Looplicht: strips langs vloer en plafond rondom; kometen die in de opbouw steeds sneller gaan, in de drop met z'n vieren -----
  const VS_LOOP = `attribute float aU; attribute vec2 aG; varying float vU; varying vec2 vUv; varying vec2 vG;
void main() { vU = aU; vUv = uv; vG = aG; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  const FS_LOOP = GL_MU + `uniform float uKop[4], uLevK[4], uStaart, uPer, uBasis, uKfase; varying float vU; varying vec2 vUv; varying vec2 vG;
void main() {
  vec3 c = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    float d = mod(uKop[i] - vU, uPer);
    float s = pow(1.0 - smoothstep(0.0, uStaart, d), 2.0) + smoothstep(uPer - 0.3, uPer, d);
    c += pal3(float(i) * 0.333 + uKfase) * s * uLevK[i];
  }
  c += pal3(vU / uPer + uKfase) * uBasis;
  float zacht = 1.0;
  if (vG.y > 0.5) { float y = vG.x > 0.5 ? vUv.y : 1.0 - vUv.y; zacht = 0.32 * y * y; }
  gl_FragColor = vec4((c * (1.0 - 0.85 * uDim) + uFlits * 0.3) * zacht, 1.0);
}`;
  reg('show', 'looplicht', { gewicht: 1, maak(ctx, stijl, plek) {
    const Z = ctx.zwaar, P = palet(stijl), M = maatVan(stijl, plek), g = new THREE.Group(); ctx.groep.add(g);
    const w = M.w, d = M.d, PER = 2 * (w + d), e = 0.03, yB = 0.06, yT = M.h - 0.07, boven = yT > 2.75, delen = [];
    // wanden in volgorde rond de kamer: voor (z = -d/2, x oplopend), rechts, achter (x aflopend), links
    const W4 = [{ a: V(-w / 2, 0, -d / 2 + e), t: V(1, 0, 0), u0: 0, len: w, deur: true }, { a: V(w / 2 - e, 0, -d / 2), t: V(0, 0, 1), u0: w, len: d },
      { a: V(w / 2, 0, d / 2 - e), t: V(-1, 0, 0), u0: w + d, len: w, deur: true }, { a: V(-w / 2 + e, 0, d / 2), t: V(0, 0, -1), u0: 2 * w + d, len: d }];
    const stuk = (W, s0, s1, y, rij) => {
      const A = W.a.clone().addScaledVector(W.t, s0).setY(y), B = W.a.clone().addScaledVector(W.t, s1).setY(y), info = { W, rij };
      delen.push([GEO.doos, staaf(A, B, 0.05, 0.03), Object.assign({ halo: 0 }, info)]);
      if (Z === 0) { const n = V(-W.t.z, 0, W.t.x), m = A.clone().add(B).multiplyScalar(0.5).addScaledVector(n, 0.005); m.y = rij ? y - 0.3 : y + 0.3;
        delen.push([GEO.vlak, mat(m.x, m.y, m.z, s1 - s0, 0.6, 1, 0, Math.atan2(n.x, n.z)), Object.assign({ halo: 1 }, info)]); }
    };
    for (const W of W4) {
      if (W.deur) { const mid = W.len / 2; stuk(W, 0, mid - 1.05, yB, 0); stuk(W, mid + 1.05, W.len, yB, 0); } else stuk(W, 0, W.len, yB, 0);
      if (boven) stuk(W, 0, W.len, yT, 1);
    }
    const geo = samen(delen, { u: (p, x) => x.W.u0 + (p.x - x.W.a.x) * x.W.t.x + (p.z - x.W.a.z) * x.W.t.z });
    const ag = new Float32Array(geo.attributes.position.count * 2); let o = 0;
    for (const [gg, , x] of delen) { const c = nietGeindexeerd(gg).attributes.position.count; for (let i = 0; i < c; i++, o++) { ag[o * 2] = x.rij; ag[o * 2 + 1] = x.halo; } }
    geo.setAttribute('aG', new THREE.Float32BufferAttribute(ag, 2));
    const kop = new Float32Array(4), levK = new Float32Array(4);
    const u = mu(P, { uKop: { value: kop }, uLevK: { value: levK }, uStaart: { value: 3 }, uPer: { value: PER }, uBasis: { value: 0 }, uKfase: { value: 0 } });
    const mesh = new THREE.Mesh(geo, shader(u, VS_LOOP, FS_LOOP, plusOpties)); mesh.renderOrder = 2; g.add(mesh);
    const v = volger(P); let pos = 0;
    return { update(dt, now, b, stand) {
      v.stap(dt, b, stand); muZet(u, now, b, v, busLicht(ctx));
      const ronde = meng(v, 8, 8 * Math.pow(16, -v.opb), 2, 24);  // tellen per rondje: in de opbouw van 8 naar een halve
      pos = (pos + v.dp * PER / ronde) % PER;
      for (let i = 0; i < 4; i++) kop[i] = pos + i * PER / 4;
      levK[0] = meng(v, 0.6 + 0.4 * b.pulse, 0.7 + 0.3 * v.opb, 1, 0.35); levK[2] = meng(v, 0.6 + 0.4 * b.pulse, 0.7 + 0.3 * v.opb, 1, 0);
      levK[1] = levK[3] = meng(v, 0, v.opb, 1, 0);
      u.uStaart.value = meng(v, 3, 3 + 6 * v.opb, 2, 6);
      u.uBasis.value = meng(v, 0.03, 0.05 + 0.2 * v.opb * v.opb, (0.25 + 0.6 * b.pulse) * (v.tel % 2 ? 1 : 0.5) + v.hit, 0);
      u.uKfase.value = (b.pos / 16) % 1;
    } };
  } });

  // ----- 3. Zwiepende bundels: vloerspots langs de achterwand en zijwanden; V-waaiers, samenkomen boven de dj, links-rechts op de tel -----
  reg('show', 'bundels', { gewicht: 1, maak(ctx, stijl, plek) {
    const Z = ctx.zwaar, P = palet(stijl), M = maatVan(stijl, plek), g = new THREE.Group(); ctx.groep.add(g);
    const kand = [[-1.8, M.d / 2 - 0.35, 0, -1], [1.8, M.d / 2 - 0.35, 0, -1], [-(M.w / 2 - 0.35), 0, 1, 0], [M.w / 2 - 0.35, 0, -1, 0], [-(M.w / 2 - 0.9), M.d / 2 - 0.35, 0, -1], [M.w / 2 - 0.9, M.d / 2 - 0.35, 0, -1],
      [-(M.w / 2 - 0.35), -M.d / 4, 1, 0], [M.w / 2 - 0.35, -M.d / 4, -1, 0]];
    const n = [8, 6, 4][Z], spots = kand.slice(0, n).map(([x, z, nx, nz], i) => ({ p: V(x, 0.3, z), binnen: V(nx, 0, nz), zij: V(-nz, 0, nx), dir: V(0, 1, 0), i }));
    const voet = inst(g, GEO.blok, new THREE.MeshBasicMaterial({ color: 0x121214 }), n, false), lens = inst(g, GEO.schijf, plusMap(gloedTex()), n);
    const bs = inst(g, GEO.kegel, bundelMat([0.4, 0.34, 0.28][Z], 1.4, 1), n), vlek = Z === 0 ? inst(g, GEO.schijf, vlekMat(), n) : null;
    spots.forEach((s, i) => { _m.compose(_p.set(s.p.x, 0.15, s.p.z), _q.identity(), _s.set(0.36, 0.3, 0.36)); voet.setMatrixAt(i, _m); });
    klaar(voet);
    const v = volger(P), kk = new THREE.Color(), kWit = P.c.clone().lerp(WIT, 0.5), KL = [P.a, P.b, P.c], doel = V(0, 0, 0), raak = V(0, 0, 0);
    return {
      update(dt, now, b, stand) {
        v.stap(dt, b, stand); const L = busLicht(ctx), H = L.helder, F = L.flits, f = focusVan(ctx);
        for (const s of spots) {
          const i = s.i, kant = i % 2 ? 1 : -1;
          // groove: V-waaiers die open en dicht gaan; drop: links-rechts op de tel; break: rechte zuilen; opbouw: samen boven de dj
          const th = meng(v, kant * (0.15 + 0.35 * (0.5 + 0.5 * Math.sin(b.pos * Math.PI / 4))), 0, (v.tel % 2 ? 0.55 : -0.55) * kant, 0);
          const tilt = meng(v, 0.2, 0, 0.15, 0.05);
          doel.copy(YAS).addScaledVector(s.zij, Math.tan(th)).addScaledVector(s.binnen, tilt).normalize();
          const ao = b.pos * Math.PI * (0.25 + v.opb) + i, rr = 1.5 * (1 - v.opb) + 0.2;
          _w.set(f.x + Math.cos(ao) * rr - s.p.x, M.h - 0.4 - s.p.y, f.z + Math.sin(ao) * rr - s.p.z).normalize();
          doel.lerp(_w, v.opb / Math.max(0.001, v.opb + v.groove + v.drp + v.brk)).normalize();
          s.dir.lerp(doel, Math.min(1, dt * (3 + 7 * v.drp))).normalize();
          const len = uitDoos(s.p, s.dir, M), vlak = RAAK.vlak;
          mengKl(kk, v, KL[i % 3], kWit, KL[(i + v.tel) % 3], P.b);
          const sterk = meng(v, 0.45 + 0.4 * b.pulse, 0.3 + 0.7 * v.opb, 0.85 + 0.35 * b.pulse + v.hit, 0.22) * H + 0.4 * F, rw = 0.06 + 0.05 * v.brk;
          _q.setFromUnitVectors(ZAS, s.dir);
          _m.compose(s.p, _q, _s.set(len * rw, len * rw, len)); bs.setMatrixAt(i, _m); bs.setColorAt(i, _c.copy(kk).multiplyScalar(sterk));
          _m.compose(s.p, _q, _s.set(0.12, 0.12, 0.12)); lens.setMatrixAt(i, _m); lens.setColorAt(i, _c.copy(kk).lerp(WIT, 0.4).multiplyScalar(1.4 * sterk));
          if (vlek) vlekZet(vlek, i, raak.copy(s.p).addScaledVector(s.dir, len), vlak, len * rw * 1.4, kk, 0.5 * sterk);
        }
        klaar(bs, lens, vlek);
      },
      opruimen() { weg(voet, lens, bs, vlek); } };
  } });

  // ----- 4. Laserwaaiers: bron boven de uitgang (en in hoog/laag ook in de voorhoeken); waaiers net boven de hoofden, in de drop slaan ze neer -----
  reg('show', 'laserwaaiers', { gewicht: 1, maak(ctx, stijl, plek) {
    const Z = ctx.zwaar, P = palet(stijl), M = maatVan(stijl, plek), g = new THREE.Group(); ctx.groep.add(g);
    const bronnen = [{ p: V(0, Math.min(M.h - 0.3, 3.1), M.d / 2 - 0.15), yaw: Math.PI, kl: P.a, i: 0 }];
    if (Z < 2) for (const s of [-1, 1]) bronnen.push({ p: V(s * (M.w / 2 - 0.3), M.h - 0.3, -M.d / 2 + 0.3), yaw: Math.atan2(-s * M.w * 0.4, M.d * 0.8), kl: s < 0 ? P.b : P.c, i: bronnen.length });
    const K = [14, 10, 6][Z], n = bronnen.length * K, dik = [0.008, 0.01, 0.014][Z];
    const vast = bronnen.map(s => [GEO.doos, mat(s.p.x, s.p.y + 0.08, s.p.z, 0.36, 0.18, 0.36)]); vastMesh(g, vast, new THREE.Color(0x18181b));
    const kern = inst(g, GEO.straal, bundelMat(1, 0.5, 0), n);
    let gloed = null;
    if (Z === 0) { gloed = new THREE.InstancedMesh(GEO.straalG, bundelMat(0.2, 2.5, 0), n); gloed.frustumCulled = false; gloed.instanceMatrix = kern.instanceMatrix; gloed.instanceColor = kern.instanceColor; g.add(gloed); }
    const stip = Z < 2 ? inst(g, GEO.schijf, vlekMat(), n) : null;
    const v = volger(P), kk = new THREE.Color(), d = V(0, 0, 0), raak = V(0, 0, 0);
    return {
      update(dt, now, b, stand) {
        v.stap(dt, b, stand); const L = busLicht(ctx), H = L.helder, F = L.flits;
        const tunnel = v.st === 'drop' && Math.floor(b.pos / 8) % 2 === 1;  // in de drop om de 8 tellen een draaiende kegel
        let idx = 0;
        for (const s of bronnen) {
          mengKl(kk, v, s.kl, P.c, (s.i + v.tel) % 2 ? P.a : P.b, P.a);
          const spreid = meng(v, 0.9, 0.9 - 0.65 * v.opb, 1.3, 0), sway = 0.15 * Math.sin(b.pos * Math.PI / 8 * (1 + 5 * v.opb) + s.i);
          const pit = meng(v, -0.08 + 0.05 * Math.sin(b.pos * Math.PI / 8), -0.08 + 0.25 * v.opb, v.fr < 0.5 ? -0.25 : 0.04, -0.02);
          const rol = meng(v, 0, 0, Math.floor(b.pos / 2) % 2 ? 0.6 * (s.i % 2 ? 1 : -1) : 0, 0) + v.brk * now * 0.4;
          for (let k = 0; k < K; k++, idx++) {
            const f = K > 1 ? k / (K - 1) - 0.5 : 0;
            let lx, ly, lz;
            if (tunnel) { const t = k / K * RONDE + now * 3, be = 0.22; lx = Math.sin(be) * Math.cos(t); ly = Math.sin(be) * Math.sin(t); lz = Math.cos(be); }
            else { const a = f * spreid + sway, x0 = Math.sin(a), z0 = Math.cos(a); lx = x0 * Math.cos(rol); ly = x0 * Math.sin(rol); lz = z0; }
            const y1 = ly * Math.cos(pit) + lz * Math.sin(pit), z1 = -ly * Math.sin(pit) + lz * Math.cos(pit);  // kantelen, dan draaien naar de bron
            d.set(lx * Math.cos(s.yaw) + z1 * Math.sin(s.yaw), y1, -lx * Math.sin(s.yaw) + z1 * Math.cos(s.yaw)).normalize();
            const aan = meng(v, (k + v.tel) % 3 ? 0.75 + 0.25 * b.pulse : 0.35, 0.3 + 0.7 * v.opb, 0.9 + 0.3 * b.pulse + v.hit, s.i === 0 && k === (K >> 1) ? 0.6 : 0) * H + 0.3 * F;
            const len = uitDoos(s.p, d, M);
            _q.setFromUnitVectors(ZAS, d); _m.compose(s.p, _q, _s.set(dik, dik, len)); kern.setMatrixAt(idx, _m); kern.setColorAt(idx, _c.copy(kk).lerp(WIT, 0.25).multiplyScalar(aan));
            if (stip) vlekZet(stip, idx, raak.copy(s.p).addScaledVector(d, len), RAAK.vlak, 0.06 + 0.04 * b.pulse, kk, aan);
          }
        }
        klaar(kern, stip);
      },
      opruimen() { weg(kern, gloed, stip); } };
  } });

  // ----- 5. Blackout: in de break gaat de kamer op zwart en blijft één spot op de dj; in de opbouw komt het licht terug, de drop flitst wit -----
  reg('show', 'blackout', { gewicht: 1, maak(ctx, stijl, plek) {
    const Z = ctx.zwaar, M = maatVan(stijl, plek), g = new THREE.Group(), slot = showSlot(ctx); ctx.groep.add(g);
    const zwart = schil(g, M, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false }), -5);
    const bm = bundelMat(0.5, 1.2, 1), spot = new THREE.Mesh(GEO.kegel, bm); spot.renderOrder = 1; g.add(spot);
    const poel = new THREE.Mesh(GEO.schijf, plusMap(gloedTex())); poel.rotation.x = -Math.PI / 2; poel.renderOrder = 1; g.add(poel);
    const L1 = Z === 0 ? ctx.licht(0xfff0e0, 0, 7, 0, M.h - 0.5, 0) : null;
    const v = volger(), warm = new THREE.Color(1, 0.94, 0.84), bron = V(0, 0, 0), doel = V(0, 0, 0); let eerste = true;
    return {
      update(dt, now, b, stand) {
        v.stap(dt, b, stand);
        // dim: diep in de break (niet zwart: de showregie gaat juist in de break het doolhof in), in de opbouw terug naar licht; spot in break en opbouw
        const dim = klem(Math.max(v.brk * 0.62, v.st === 'opbouw' ? 0.5 * (1 - v.opb) : 0));
        const sp = klem(v.brk + (v.st === 'opbouw' ? 1 - v.opb * 0.5 : 0) * (1 - v.drp)), puls = v.st === 'opbouw' ? 0.6 + 0.4 * Math.pow(1 - v.fr, 3 + 6 * v.opb) : 1;
        slot.dim = dim; slot.flits = v.hit > 0.3 ? v.hit * 0.9 : 0;
        zwart.material.opacity = dim * 0.85; zwart.visible = eerste || dim > 0.01; eerste = false;
        const f = focusVan(ctx), vloerY = Math.max(0, f.y - 1.55);
        bron.set(f.x, M.h - 0.12, f.z - 0.6); doel.set(f.x, vloerY, f.z); _w.subVectors(doel, bron); const len = _w.length(); _w.normalize();
        spot.position.copy(bron); spot.quaternion.setFromUnitVectors(ZAS, _w); spot.scale.set(len * 0.2, len * 0.2, len);
        bm.uniforms.uKleur.value.copy(warm).multiplyScalar(sp * puls * 0.9); spot.visible = sp > 0.01;
        poel.position.set(f.x, vloerY + 0.02, f.z); poel.scale.setScalar(1.3); poel.material.color.copy(warm).multiplyScalar(sp * puls * 0.6); poel.visible = sp > 0.01;
        if (L1) { L1.position.set(f.x, M.h - 0.5, f.z - 0.4); L1.intensity = 2.4 * sp * puls; }
      },
      opruimen() { showWeg(ctx, slot); } };
  } });
})();

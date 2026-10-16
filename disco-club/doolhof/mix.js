// --- Doolhof: de kamer-mixer. Husselt alles wat de club al heeft door elkaar tot steeds andere kamers:
// paalkamer, slakkenhol, spiegeldisco, kaleidoscoop, laserkooi, rokerslounge, graffitigang, bar en een omgekeerde kamer.
// Elke soort varieert per kamer via ctx.rnd() (kleuren, maten, mensen, rekwisieten).
// Elke kamer is een lichtshow (voor een ledscherm): vloer, muren en plafond zakken weg in het donker (showvlak uit
// doolhof.lichtshow, boiler.js) en worden alleen opgelicht waar een bundel raakt; licht is de hoofdrol (moving heads, pinspots,
// lasers, ledlijnen, strobe) in 2-3 verzadigde kleuren, op de tel en per sectie anders (break donker, opbouw sneller/feller,
// drop explosie). Geen extra lampen: hooguit de twee van ctx.licht (figuren); de rest is additief/shader/instanced. ---
(() => {
  const DH = window.doolhof;
  if (!DH) return;

  // --- kleine hulpjes ---
  const kies = (r, a) => a[Math.min(a.length - 1, Math.floor(r() * a.length))];
  const tussen = (r, a, b) => a + r() * (b - a);
  const klem = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const glad = x => x * x * (3 - 2 * x);
  const hex = c => '#' + new THREE.Color(c).getHexString();
  const rgba = (c, a) => { const k = new THREE.Color(c); return `rgba(${Math.round(k.r * 255)},${Math.round(k.g * 255)},${Math.round(k.b * 255)},${a})`; };
  const M4 = new THREE.Matrix4(), V3 = new THREE.Vector3(), Q = new THREE.Quaternion(), S3 = new THREE.Vector3(), C3 = new THREE.Color();
  const DIR = new THREE.Vector3(), ZAS = new THREE.Vector3(0, 0, 1), WIT = new THREE.Color(1, 1, 1);
  const PLAT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);  // cirkel plat op de vloer

  // materialen: eigen exemplaren per kamer (de kern ruimt ze met de kamer op)
  const basic = (color, extra) => new THREE.MeshBasicMaterial(Object.assign({ color }, extra || {}));
  const lam = (color, extra) => new THREE.MeshLambertMaterial(Object.assign({ color }, extra || {}));
  const gloei = (color, op = 1) => additive(color, op);
  const dubbel = m => { m.side = THREE.DoubleSide; return m; };  // werkt hoe de kern de wanden ook opbouwt
  const metMap = (m, map) => { m.map = map; return m; };

  // lichtshow-gereedschap uit boiler.js (doolhof.lichtshow): stand van de show, showvlakken, bundels, lijnen, punten, moving heads
  const LS = DH.lichtshow;
  if (!LS) { console.warn('mix: doolhof.lichtshow ontbreekt (boiler.js)'); return; }
  // vier showvlak-wanden (x-, x+, z-, z+) met één textuur, herhaald naar de lengte van de wand
  function wandShow(sp, tex, w, d, stuk, kleur) {
    const mat = n => { const t = tex.clone(); t.repeat.set(n, 1); t.needsUpdate = true; return sp.mat(t, kleur); };
    const a = mat(Math.max(1, Math.round(d / stuk))), b = mat(Math.max(1, Math.round(w / stuk)));
    return [a, a, b, b];
  }
  // veel gelijke vaste stukken in één draw call: lijst van [x, y, z, sx, sy, sz, rx?]
  const EUL = new THREE.Euler();
  function veel(parent, geo, mat, lijst) {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, lijst.length));
    lijst.forEach(([x, y, z, sx, sy, sz, rx], i) => { M4.compose(V3.set(x, y, z), Q.setFromEuler(EUL.set(rx || 0, 0, 0)), S3.set(sx, sy, sz)); m.setMatrixAt(i, M4); });
    m.frustumCulled = false; parent.add(m); return m;
  }
  // standaard lichtset van een kamer: lichtvlekken op de showvlakken, bundels (moving heads + eigen), lenzen.
  // Per beeld: const s = L.begin() -> eigen lichtvlekken/bundels (belangrijkste eerst: het aantal vlekken is beperkt) -> L.koppen(dt, now) -> L.eind(now, vulkleur)
  function lichtset(ctx, o) {
    const sp = LS.spots(ctx), nK = o.koppen ? o.koppen.length : 0, nB = nK + (o.extra || 0), nP = nB + (o.lenzen || 0);
    const bun = nB ? LS.bundels(ctx.groep, nB, o.sterk) : null, pun = nP ? LS.punten(ctx.groep, nP, o.lens || 0.7) : null;
    const rig = nK ? LS.koppen(ctx, Object.assign({ bundels: bun, spots: sp, punten: pun, plekken: o.koppen }, o.rig || {})) : null;
    const L = {
      sp, bun, pun, rig, nK, s: LS.stand(ctx.beat()),
      begin() { L.s = LS.stand(ctx.beat()); sp.begin(); return L.s; },
      koppen(dt, now) { if (rig) rig.update(L.s, dt, now); },
      eind(now, vul, vulK = 0.012, flitsKleur, flitsK) {
        if (bun) bun.klaar(now);
        if (pun) pun.klaar();
        sp.vul(vul || LS.wit, vulK * L.s.niv);
        sp.flits(flitsKleur || LS.wit, flitsK != null ? flitsK : L.s.flits * 0.22);  // de strobe licht de zaal maar deels op: het blijft een show
      },
    };
    return L;
  }
  // lamp van de kern (figuren): kleur van de tel, wit bij een flits
  function lampShow(l, kleur, k, s) {
    if (!l) return;
    if (s.flits > 0.5) { l.color.setRGB(1, 1, 1); l.intensity = 3.5 * s.flits; } else { l.color.copy(kleur); l.intensity = k; }
  }

  // eigen eenheidsvormen per kamer
  function kit() {
    const c = {};
    return {
      get box() { return c.box || (c.box = new THREE.BoxGeometry(1, 1, 1)); },
      get cyl() { return c.cyl || (c.cyl = new THREE.CylinderGeometry(1, 1, 1, 14)); },
      get sph() { return c.sph || (c.sph = new THREE.SphereGeometry(1, 16, 12)); },
      get plane() { return c.plane || (c.plane = new THREE.PlaneGeometry(1, 1)); },
      get disc() { return c.disc || (c.disc = new THREE.CircleGeometry(1, 24)); },
      get cone() { return c.cone || (c.cone = new THREE.ConeGeometry(1, 1, 12)); },
    };
  }

  // canvas-textuur in machten van twee (tv/webgl1), half zo groot in laag/minimaal; tekenen in de logische maat. rx 0 = niet herhalen
  function T(ctx, w, h, teken, rx = 1, ry = 1) {
    const k = ctx.zwaar ? 0.5 : 1;
    const t = canvasTexture(w * k, h * k, c => { c.scale(k, k); teken(c, w, h); });
    if (rx) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); }
    return t;
  }
  const gloedTex = ctx => T(ctx, 128, 128, (c, w, h) => {
    const gr = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
  }, 0);

  // --- schilders voor de texturen ---
  function plooien(c, w, h, r, kleur) {  // fluwelen gordijn: verticale plooien, donker naar plafond en vloer
    const k = new THREE.Color(kleur), st = f => `rgb(${Math.round(k.r * 255 * f)},${Math.round(k.g * 255 * f)},${Math.round(k.b * 255 * f)})`;
    const gr = c.createLinearGradient(0, 0, w, 0), n = 16;
    for (let i = 0; i <= n; i++) gr.addColorStop(i / n, st(i % 2 ? 0.22 + 0.12 * r() : 0.7 + 0.3 * r()));
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
    const v = c.createLinearGradient(0, 0, 0, h);
    v.addColorStop(0, 'rgba(0,0,0,0.8)'); v.addColorStop(0.3, 'rgba(0,0,0,0)'); v.addColorStop(0.85, 'rgba(0,0,0,0.15)'); v.addColorStop(1, 'rgba(0,0,0,0.75)');
    c.fillStyle = v; c.fillRect(0, 0, w, h);
  }
  function sterren(c, w, h, r, kleur, n) {  // donker plafond met lichtpuntjes
    c.fillStyle = '#050307'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < n; i++) { c.fillStyle = r() < 0.3 ? '#ffffff' : kleur; c.globalAlpha = 0.4 + r() * 0.6; c.beginPath(); c.arc(r() * w, r() * h, 0.8 + r() * 2.2, 0, TAU); c.fill(); }
    c.globalAlpha = 1;
  }
  function glansvloer(c, w, h, r, kleur) {  // glimmende vloer met zachte gekleurde weerschijn (showvlak: alleen te zien waar licht valt)
    c.fillStyle = '#2a2630'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 6; i++) {
      const x = r() * w, y = r() * h, rr = 60 + r() * 160, gr = c.createRadialGradient(x, y, 0, x, y, rr);
      gr.addColorStop(0, rgba(kleur, 0.16)); gr.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = gr; c.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
    c.strokeStyle = 'rgba(255,255,255,0.05)'; c.lineWidth = 2;
    for (let i = 0; i <= 8; i++) { c.beginPath(); c.moveTo(i * w / 8, 0); c.lineTo(i * w / 8, h); c.stroke(); c.beginPath(); c.moveTo(0, i * h / 8); c.lineTo(w, i * h / 8); c.stroke(); }
  }
  function rots(c, w, h, r, basis, slijm) {  // grotwand met vlekken en slijm dat van boven druipt
    c.fillStyle = basis; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      const x = r() * w, y = r() * h, rr = 10 + r() * 70, gr = c.createRadialGradient(x, y, 0, x, y, rr);
      gr.addColorStop(0, r() < 0.55 ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.07)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = gr; c.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
    for (let i = 0; i < 30; i++) {
      const x = r() * w, len = 40 + r() * h * 0.6, gr = c.createLinearGradient(0, 0, 0, len);
      gr.addColorStop(0, slijm); gr.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = gr; c.fillRect(x, 0, 3 + r() * 6, len);
    }
  }
  function plassen(c, w, h, r, kleur, n, achter) {  // plassen/vlekken op een achtergrond (zwart = voor een additieve laag)
    c.fillStyle = achter; c.fillRect(0, 0, w, h);
    for (let i = 0; i < n; i++) {
      const x0 = r() * w, y0 = r() * h, rx = 20 + r() * 90, sy = 0.4 + r() * 0.6;
      for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {  // ook over de rand heen tekenen: naadloos herhaalbaar (geen streep over de vloer)
        const x = x0 + ox, y = y0 + oy;
        if (x + rx < 0 || x - rx > w || y + rx < 0 || y - rx > h) continue;
        const gr = c.createRadialGradient(x, y, 0, x, y, rx);
        gr.addColorStop(0, kleur); gr.addColorStop(0.7, kleur.replace(/[\d.]+\)$/, '0.25)')); gr.addColorStop(1, 'rgba(0,0,0,0)');
        c.save(); c.translate(x, y); c.scale(1, sy); c.translate(-x, -y); c.fillStyle = gr; c.fillRect(x - rx, y - rx, rx * 2, rx * 2); c.restore();
      }
    }
  }
  function raster(c, w, h, n, lijn, achter) {
    c.fillStyle = achter; c.fillRect(0, 0, w, h); c.strokeStyle = lijn; c.lineWidth = 2;
    for (let i = 0; i <= n; i++) { const x = i * w / n, y = i * h / n; c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
  }
  function panelen(c, w, h, r, tint) {  // spiegelpanelen met een schuine glimstreep
    c.fillStyle = '#05060a'; c.fillRect(0, 0, w, h);
    const nx = 8, ny = 4, pw = w / nx, ph = h / ny;
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
      const gr = c.createLinearGradient(x * pw, y * ph, (x + 1) * pw, (y + 1) * ph), s = 0.42 + r() * 0.2;
      gr.addColorStop(0, `rgba(${tint},0.2)`); gr.addColorStop(s, `rgba(${tint},${0.05 + r() * 0.1})`);
      gr.addColorStop(s + 0.03, `rgba(255,255,255,${0.12 + r() * 0.18})`); gr.addColorStop(s + 0.07, `rgba(${tint},0.06)`); gr.addColorStop(1, `rgba(${tint},0.16)`);
      c.fillStyle = gr; c.fillRect(x * pw + 3, y * ph + 3, pw - 6, ph - 6);
    }
  }
  function matcap(c, w, h, r) {  // spiegelbol: grijze bol vol felle glimpjes
    c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
    const gr = c.createRadialGradient(w * 0.4, h * 0.38, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, '#d8dbe6'); gr.addColorStop(0.5, '#4a4e5c'); gr.addColorStop(1, '#0a0b10');
    c.fillStyle = gr; c.beginPath(); c.arc(w / 2, h / 2, w / 2, 0, TAU); c.fill();
    for (let i = 0; i < 40; i++) {
      const a = r() * TAU, rr = Math.sqrt(r()) * w * 0.47, x = w / 2 + Math.cos(a) * rr, y = h / 2 + Math.sin(a) * rr, s = 2 + r() * 6;
      const g2 = c.createRadialGradient(x, y, 0, x, y, s * 2); g2.addColorStop(0, 'rgba(255,255,255,1)'); g2.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g2; c.fillRect(x - s * 2, y - s * 2, s * 4, s * 4);
    }
  }
  function paddo(c, w, h, r, kleur) {  // paddenstoelhoed: kleur met witte stippen (boven = top van de hoed)
    c.fillStyle = kleur; c.fillRect(0, 0, w, h);
    const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0.5)');
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
    c.fillStyle = '#ffffff';
    for (let i = 0; i < 26; i++) { const s = 4 + r() * 10; c.beginPath(); c.ellipse(r() * w, 10 + r() * h * 0.8, s, s * 0.7, 0, 0, TAU); c.fill(); }
  }
  function ringen(c, w, h, kleuren) {  // tripvloer: neonringen en stralen vanuit het midden
    c.fillStyle = '#030208'; c.fillRect(0, 0, w, h); c.lineWidth = 3;
    for (let i = 1; i < 14; i++) { c.strokeStyle = kleuren[i % kleuren.length]; c.globalAlpha = 0.35; c.beginPath(); c.arc(w / 2, h / 2, i * w / 28, 0, TAU); c.stroke(); }
    for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; c.strokeStyle = kleuren[i % kleuren.length]; c.globalAlpha = 0.18; c.beginPath(); c.moveTo(w / 2, h / 2); c.lineTo(w / 2 + Math.cos(a) * w, h / 2 + Math.sin(a) * h); c.stroke(); }
    c.globalAlpha = 1;
  }
  function behang(c, w, h, r, a, b) {  // behang met ornamenten, houten lambrisering onder
    c.fillStyle = a; c.fillRect(0, 0, w, h);
    c.fillStyle = b; c.globalAlpha = 0.55;
    for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) {
      const cx = x * w / 4 + (y % 2) * w / 8 + w / 16, cy = y * h * 0.21 + h * 0.1;
      c.beginPath(); c.ellipse(cx, cy, w / 22, h / 12, 0, 0, TAU); c.fill();
      for (let k = 0; k < 4; k++) { const an = k * Math.PI / 2; c.beginPath(); c.ellipse(cx + Math.cos(an) * w / 14, cy + Math.sin(an) * h / 14, w / 40, h / 60, an, 0, TAU); c.fill(); }
    }
    c.globalAlpha = 1;
    const y0 = h * 0.66; c.fillStyle = '#2a170c'; c.fillRect(0, y0, w, h - y0);
    for (let x = 0; x < w; x += w / 8) { c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(x, y0, 3, h - y0); c.fillStyle = 'rgba(255,200,140,0.08)'; c.fillRect(x + 8, y0 + 12, w / 8 - 16, h - y0 - 24); }
    c.fillStyle = '#5a3a1a'; c.fillRect(0, y0 - 6, w, 10);
  }
  function planken(c, w, h, r) {  // houten vloerdelen met verspringende naden
    c.fillStyle = '#120a05'; c.fillRect(0, 0, w, h);
    const n = 8, ph = h / n;
    for (let y = 0; y < n; y++) {
      let x = -r() * 200;
      while (x < w) { const L = 120 + r() * 200; c.fillStyle = `rgb(${70 + r() * 30 | 0},${40 + r() * 18 | 0},${20 + r() * 10 | 0})`; c.fillRect(x, y * ph + 1, L - 2, ph - 2); x += L; }
    }
  }
  function tapijt(c, w, h, r, a, b, cc) {  // perzisch kleed: veld met ruitjes, brede rand met motiefjes, gekarteld medaillon, hoekstukken
    c.fillStyle = a; c.fillRect(0, 0, w, h);
    c.fillStyle = b; c.globalAlpha = 0.22;  // veld: fijne ruitjes
    for (let y = 44, j = 0; y < h - 40; y += 14, j++) for (let x = 44 + (j % 2) * 7; x < w - 40; x += 14) { c.beginPath(); c.moveTo(x, y - 3); c.lineTo(x + 3, y); c.lineTo(x, y + 3); c.lineTo(x - 3, y); c.fill(); }
    c.globalAlpha = 1;
    c.fillStyle = cc; c.fillRect(0, 0, w, 26); c.fillRect(0, h - 26, w, 26); c.fillRect(0, 0, 26, h); c.fillRect(w - 26, 0, 26, h);  // brede rand
    c.strokeStyle = b; c.lineWidth = 2; c.strokeRect(4, 4, w - 8, h - 8); c.strokeRect(26, 26, w - 52, h - 52); c.strokeRect(33, 33, w - 66, h - 66);
    c.fillStyle = b;
    for (let x = 15; x < w - 8; x += 18) for (const y of [13, h - 13]) { c.beginPath(); c.arc(x, y, 3, 0, TAU); c.fill(); }
    for (let y = 31; y < h - 26; y += 18) for (const x of [13, w - 13]) { c.beginPath(); c.arc(x, y, 3, 0, TAU); c.fill(); }
    for (const [x, y] of [[33, 33], [w - 33, 33], [33, h - 33], [w - 33, h - 33]]) { c.fillStyle = cc; c.beginPath(); c.ellipse(x, y, w * 0.07, h * 0.13, 0, 0, TAU); c.fill(); }  // hoekstukken
    const cx = w / 2, cy = h / 2;  // medaillon: gekartelde lagen om en om
    for (const [s, kl] of [[1, cc], [0.8, b], [0.66, a], [0.48, cc], [0.3, b], [0.14, a]]) {
      c.fillStyle = kl; c.beginPath();
      for (let i = 0; i <= 32; i++) { const an = i / 32 * TAU, rr = (i % 2 ? 0.84 : 1) * s; c.lineTo(cx + Math.cos(an) * w * 0.2 * rr, cy + Math.sin(an) * h * 0.34 * rr); }
      c.fill();
    }
    c.fillStyle = 'rgba(0,0,0,0.18)';  // slijtage
    for (let i = 0; i < 30; i++) c.fillRect(r() * w, r() * h, 2 + r() * 10, 1 + r() * 3);
  }
  function baksteen(c, w, h, r, kleur, voeg) {
    const k = new THREE.Color(kleur);
    c.fillStyle = voeg; c.fillRect(0, 0, w, h);
    const bw = w / 8, bh = h / 16;
    for (let y = 0; y < 16; y++) for (let x = -1; x < 8; x++) {
      const f = 0.6 + 0.5 * r(), ox = (y % 2) * bw / 2;
      c.fillStyle = `rgb(${Math.min(255, k.r * 255 * f) | 0},${Math.min(255, k.g * 255 * f) | 0},${Math.min(255, k.b * 255 * f) | 0})`;
      c.fillRect(x * bw + ox + 2, y * bh + 2, bw - 4, bh - 4);
    }
  }
  function asfalt(c, w, h, r) {  // nat asfalt met plassen en een gestreepte middellijn
    c.fillStyle = '#16161a'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 400; i++) { c.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.25)'; c.fillRect(r() * w, r() * h, 2 + r() * 4, 2 + r() * 4); }
    for (let i = 0; i < 6; i++) {
      const x = r() * w, y = r() * h, rr = 30 + r() * 60, gr = c.createRadialGradient(x, y, 0, x, y, rr);
      gr.addColorStop(0, 'rgba(70,80,110,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = gr; c.fillRect(x - rr, y - rr, 2 * rr, 2 * rr);
    }
    c.strokeStyle = 'rgba(230,200,40,0.35)'; c.lineWidth = 8; c.setLineDash([60, 40]);
    c.beginPath(); c.moveTo(w / 2, 0); c.lineTo(w / 2, h); c.stroke(); c.setLineDash([]);
  }
  function dambord(c, w, h, a, b, n) { for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { c.fillStyle = (x + y) % 2 ? a : b; c.fillRect(x * w / n, y * h / n, w / n, h / n); } }
  function vlam(c, w, h) {
    const gr = c.createRadialGradient(w / 2, h * 0.75, 2, w / 2, h * 0.6, h * 0.6);
    gr.addColorStop(0, 'rgba(255,240,180,1)'); gr.addColorStop(0.35, 'rgba(255,150,40,0.85)'); gr.addColorStop(1, 'rgba(255,40,0,0)');
    c.fillStyle = gr; c.beginPath(); c.moveTo(w / 2, 0); c.quadraticCurveTo(w * 0.98, h * 0.62, w / 2, h); c.quadraticCurveTo(w * 0.02, h * 0.62, w / 2, 0); c.fill();
  }

  // graffiti van de club (tex/graffiti-N.jpg): eigen textuur per kamer; in laag/minimaal een verkleinde kopie (1024 breed)
  const GRAF = ['tex/graffiti-1.jpg', 'tex/graffiti-2.jpg', 'tex/graffiti-3.jpg'].map(src => { const im = new Image(); im.src = src; return im; });
  const kleinGraf = [];
  function graffitiTex(i, rx, zwaar) {
    i %= GRAF.length;
    const im = GRAF[i], t = new THREE.Texture();
    t.wrapS = THREE.RepeatWrapping; t.repeat.set(rx, 1);
    const zet = () => {
      try {
        if (zwaar && !kleinGraf[i]) { const c = document.createElement('canvas'); c.width = 1024; c.height = 512; c.getContext('2d').drawImage(im, 0, 0, 1024, 512); kleinGraf[i] = c; }
        t.image = zwaar ? kleinGraf[i] : im; t.needsUpdate = true;
      } catch (e) { console.error('doolhof graffiti', e); }
    };
    if (im.complete && im.naturalWidth) zet(); else im.addEventListener('load', zet, { once: true });
    return t;
  }
  // dezelfde plaatjes hangen al als textuur op de clubmuren (repeat -2, 1; al op de gpu). Een eigen textuur per kamer betekende elke keer
  // twee uploads van 3168x1344 (~50 ms per stuk in één beeld) en ~22 MB per stuk. Die van de club dus gebruiken, de herhaling zit dan in de
  // uv's van een eigen vlak: zelfde beeld.
  function clubGraf(i) {
    const naam = 'graffiti-' + (i + 1) + '.jpg', kand = [];
    if (typeof room !== 'undefined' && room && Array.isArray(room.material)) kand.push(...room.material);
    if (typeof frontWall !== 'undefined' && Array.isArray(frontWall)) for (const w of frontWall) kand.push(w.material);
    for (const m of kand) {
      const t = m && m.map, src = t && t.image && typeof t.image.src === 'string' && t.image.src.split('?')[0];
      if (src && src.endsWith(naam) && t.offset.x === 0 && t.offset.y === 0 && t.repeat.y === 1 && t.repeat.x !== 0 && t.rotation === 0 && t.wrapS === THREE.RepeatWrapping) return t;
    }
    return null;
  }
  function graffitiVlak(i, rx, zwaar) {  // { geo, map }: geo null = het gewone vlak van de kamer
    const t = zwaar ? null : clubGraf(i % GRAF.length);
    if (!t) return { geo: null, map: graffitiTex(i, rx, zwaar) };
    const geo = new THREE.PlaneGeometry(1, 1), uv = geo.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setX(k, uv.getX(k) * rx / t.repeat.x);  // na de uv-transformatie van de textuur: u * rx
    return { geo, map: t };
  }

  // figuur via de kern; lukt het met filter niet, dan elk figuur
  const fig = (ctx, o) => ctx.figuur(o) || (o.filter ? ctx.figuur({ x: o.x, z: o.z, face: o.face, rol: o.rol }) : null);
  // n vrije plekken in [-xmax, xmax] x [-zmax, zmax], buiten het looppad (|x| < vrij) en niet te dicht op elkaar
  function plekken(r, n, xmax, zmax, vrij, afstand, ok) {
    const uit = [];
    for (let k = 0; k < n * 40 && uit.length < n; k++) {
      const x = tussen(r, -xmax, xmax), z = tussen(r, -zmax, zmax);
      if (Math.abs(x) < vrij || (ok && !ok(x, z)) || uit.some(p => Math.hypot(p[0] - x, p[1] - z) < afstand)) continue;
      uit.push([x, z]);
    }
    return uit;
  }
  // bank zoals de lounge van de club: heupen op (x, 0,69, z), rug naar achteren, gezicht naar `face`; geeft de zitplekken terug.
  // Met `lijst` komen de vijf blokken als matrices in die lijst (daarna veelM: alle banken in één draw call)
  const BANK_DELEN = len => [[0, 0.525, -0.105, len, 0.15, 0.73], [0, 0.225, -0.205, len, 0.45, 0.53], [0, 0.85, -0.37, len, 1.1, 0.3], [-(len / 2 + 0.1), 0.45, -0.15, 0.2, 0.6, 0.8], [len / 2 + 0.1, 0.45, -0.15, 0.2, 0.6, 0.8]];
  const BM = new THREE.Matrix4(), BD = new THREE.Matrix4();
  function bank(g, K, mat, x, z, face, len, plekN, lijst) {
    if (lijst) {
      BM.makeRotationY(face).setPosition(x, 0, z);
      for (const [px, py, pz, sx, sy, sz] of BANK_DELEN(len)) lijst.push(new THREE.Matrix4().multiplyMatrices(BM, BD.compose(V3.set(px, py, pz), Q.identity(), S3.set(sx, sy, sz))));
    } else {
      const b = new THREE.Group(); b.position.set(x, 0, z); b.rotation.y = face; g.add(b);
      for (const [px, py, pz, sx, sy, sz] of BANK_DELEN(len)) add(b, K.box, mat, [px, py, pz], [sx, sy, sz]);
    }
    const zit = [];
    for (let i = 0; i < plekN; i++) { const sx = (i + 0.5) / plekN * len - len / 2; zit.push([x + Math.cos(face) * sx, z - Math.sin(face) * sx, face]); }
    return zit;
  }
  function veelM(parent, geo, mat, matrices) {  // zoals veel, met kant-en-klare matrices
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, matrices.length));
    matrices.forEach((M, i) => m.setMatrixAt(i, M));
    m.frustumCulled = false; parent.add(m); return m;
  }
  // uitgang: gloeiend kozijn en de naam van de kamer erboven, zodat je ziet waar het doolhof verder gaat
  function uitgang(ctx, K, w, d, h, naam, kleur) {
    const z = d / 2 - 0.04, mat = gloei(kleur, 0.8);
    for (const x of [-1.04, 1.04]) add(ctx.groep, K.box, mat, [x, 1.3, z], [0.05, 2.6, 0.03]);
    add(ctx.groep, K.box, mat, [0, 2.63, z], [2.13, 0.05, 0.03]);
    const bw = Math.min(w - 1, 3.4), bord = ctx.neon(naam, hex(kleur), bw, bw / 4);
    bord.position.set(0, Math.min(h - bw / 8 - 0.15, 3.35), d / 2 - 0.08); bord.rotation.y = Math.PI;
    return { mat, bord, puls(b, s) { mat.opacity = (0.3 + 0.5 * b.pulse) * (s ? Math.max(0.35, Math.min(1, s.niv)) : 1); } };
  }
  // eigen camera: eerst vanaf de ingang de kamer in, daarna (in 3 s) naar het eigen pad; alles in lokale maten.
  // Startpunt schuin boven de ingang en elk pad buiten het looppad (|x| >= 1,5) of boven de hoofden: de loper loopt er niet door.
  function camHulp(ctx, d) {
    const pos = new THREE.Vector3(), look = new THREE.Vector3(), uit = { pos, look, fov: 55 };
    const p0 = new THREE.Vector3(0.9, 2.2, -d / 2 + 0.6), l0 = new THREE.Vector3(0, 1.4, 1);
    return (t, px, py, pz, lx, ly, lz, fov) => {
      const k = glad(klem(t / 3));
      pos.set(px, py, pz).lerp(p0, 1 - k); look.set(lx, ly, lz).lerp(l0, 1 - k);
      ctx.groep.updateWorldMatrix(true, false);
      ctx.groep.localToWorld(pos); ctx.groep.localToWorld(look);
      uit.fov = fov || 55;
      return uit;
    };
  }
  // rookwolken als sprites (eigen textuur van de club-rook), drijven langzaam binnen een vak
  function rook(ctx, g, n, x0, x1, y0, y1, z0, z1, s0, s1) {
    const r = () => ctx.rnd(), tex = new THREE.CanvasTexture(smokeTex[Math.floor(r() * smokeTex.length)].image), lijst = [];
    for (let i = 0; i < n; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, rotation: r() * TAU }));
      sp.position.set(tussen(r, x0, x1), tussen(r, y0, y1), tussen(r, z0, z1));
      const s = tussen(r, s0, s1); sp.scale.set(s, s * 0.7, 1);
      g.add(sp); lijst.push({ sp, vx: tussen(r, -0.15, 0.15), vz: tussen(r, -0.15, 0.15), spin: tussen(r, -0.05, 0.05), x0, x1, z0, z1 });
    }
    return lijst;
  }
  function rookDrijf(lijst, dt, kleur, k) {
    for (const p of lijst) {
      const s = p.sp;
      s.position.x += p.vx * dt; s.position.z += p.vz * dt; s.material.rotation += p.spin * dt;
      if ((s.position.x < p.x0 && p.vx < 0) || (s.position.x > p.x1 && p.vx > 0)) p.vx = -p.vx;
      if ((s.position.z < p.z0 && p.vz < 0) || (s.position.z > p.z1 && p.vz > 0)) p.vz = -p.vz;
      s.material.color.copy(kleur).multiplyScalar(k);
    }
  }
  // deeltjes (bellen, vuurvliegjes, omhoog vallende regen): één Points-object
  function deeltjes(g, n, kleur, size, map, plaats) {
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) plaats(pos, i);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const p = new THREE.Points(geo, new THREE.PointsMaterial({ color: kleur, size, map, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    p.frustumCulled = false; g.add(p);
    return p;
  }
  // tegelvloer (zoals de dansvloer van de club) met vier patronen die om de 8 tellen wisselen (drop: elke maat), als ledvloer in de show:
  // break = alleen een trage ring, opbouw = dambord steeds sneller, niveau volgt de stand
  function tegelvloer(parent, w, d, PAL) {
    const cols = Math.max(1, Math.floor(w)), rows = Math.max(1, Math.floor(d)), n = cols * rows;
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.94, 0.02, 0.94), basic(0xffffff), n);
    for (let i = 0; i < n; i++) { M4.makeTranslation(-cols / 2 + 0.5 + (i % cols), 0.012, -rows / 2 + 0.5 + Math.floor(i / cols)); mesh.setMatrixAt(i, M4); mesh.setColorAt(i, C3.setRGB(0, 0, 0)); }
    parent.add(mesh);
    return (b, s, f = 1) => {  // f: niveau van deze vloer (een ledplafond dat het hele beeld vult: lager)
      const st = s ? s.stand : 'groove', niv = (s ? s.niv : 1) * f;
      const mode = st === 'break' ? 1 : st === 'opbouw' ? 0 : Math.floor(b.pos / (st === 'drop' ? 4 : 8)) % 4;
      const bt = Math.floor(st === 'opbouw' ? b.pos * (s.opb < 0.5 ? 1 : 2) : st === 'break' ? b.pos / 4 : b.pos), fr = b.pos - Math.floor(b.pos);
      const licht = st === 'break' ? 0.22 * f : (0.25 + 0.5 * (1 - fr) * b.energy + 0.25 * b.pulse) * niv;
      for (let i = 0; i < n; i++) {
        const cx = i % cols, cz = (i / cols) | 0, x = cx - cols / 2 + 0.5, z = cz - rows / 2 + 0.5;
        let k, ci;
        if (mode === 0) { k = (cx + cz + bt) % 2 ? 1 : 0.06; ci = (cx + cz) % 3; }
        else if (mode === 1) { const dd = Math.hypot(x, z) - (b.pos % 4) * 2.5; k = 0.05 + Math.exp(-dd * dd * 0.6); ci = bt % 3; }  // ring vanuit het midden
        else if (mode === 2) { const hs = Math.sin(i * 12.9898 + bt * 78.233) * 43758.5453, f = hs - Math.floor(hs); k = f > 0.72 ? 1 : 0.05; ci = Math.floor(f * 30) % 3; }
        else { k = (cz + bt) % 4 === 0 ? 1 : 0.08; ci = cz % 3; }
        mesh.setColorAt(i, C3.copy(PAL[ci % PAL.length]).multiplyScalar(k * licht));
      }
      mesh.instanceColor.needsUpdate = true;
    };
  }
  // Points en Sprites zelf opruimen (de kern ruimt in elk geval de meshes op; dubbel opruimen kan geen kwaad)
  function ruimDeeltjes(g) {
    g.traverse(o => {
      if (!(o.isPoints || o.isSprite)) return;
      if (o.isPoints && o.geometry) o.geometry.dispose();
      if (o.material) { const t = o.material.map; if (t && !(t.userData && t.userData.doolhofHouden)) t.dispose(); o.material.dispose(); }  // gedeelde gloed van de lichtshow blijft
    });
  }

  // ============ 1. Paalkamer: donker fluweel, paaldanseressen in een pinspot, ledpalen, moving heads over het publiek op de banken ============
  DH.registreer('paalkamer', { gewicht: 1, maak(ctx) {
    const r = () => ctx.rnd(), Z = ctx.zwaar, g = ctx.groep, K = kit();
    const [A, B, C, BANK] = kies(r, [[0xff1f3d, 0xff5fa2, 0x7a2cff, 0x2a0610], [0xff2d95, 0xb36bff, 0x2a5cff, 0x220a2a], [0xff4a1c, 0xffb347, 0xff1f6a, 0x2a0e04], [0xb04dff, 0xff3fa4, 0x3d5afe, 0x160828]]);
    const PAL = [A, B, C].map(c => new THREE.Color(c));
    const w = Math.round(tussen(r, 13, 15)), d = Math.round(tussen(r, 13, 16)), h = +tussen(r, 4.4, 5.2).toFixed(2);
    const kcam = camHulp(ctx, d);
    // podia met een ledpaal, lichtrand en een pinspot van boven
    const nP = Z === 2 ? 2 : (r() < 0.5 ? 2 : 3), px = Math.min(3.6, w / 2 - 3.4);
    const palen = nP === 2 ? [[-px, -1.4], [px, 1.4]] : [[-px, -2.4], [px, 0], [-px, 2.4]];
    // moving heads op een truss boven het looppad (in beeld als de camera naar de palen kijkt) en twee op de zijwanden (minimaal: twee)
    const kopPlek = [[0, h - 0.3, -d / 2 + 2.5], [0, h - 0.3, d / 2 - 2.5], [0, h - 0.3, -d / 6], [0, h - 0.3, d / 6], [-(w / 2 - 0.5), h - 0.3, 0], [w / 2 - 0.5, h - 0.3, 0]].slice(0, [6, 4, 2][Z]);
    const midden = new THREE.Vector3(palen[nP - 1][0], 1.2, palen[nP - 1][1]);
    const L = lichtset(ctx, { koppen: kopPlek, extra: nP, rig: { maat: { w, d, h }, pal: PAL, focus: midden, spreid: 0.04, patronen: ['waaier', 'cirkel', 'kruis', 'zwaai', 'publiek'] } });
    const gordijn = T(ctx, 1024, 512, (c, cw, ch) => plooien(c, cw, ch, r, new THREE.Color(A).lerp(new THREE.Color(BANK), 0.35)));
    ctx.doos({ w, d, h,
      vloer: L.sp.mat(T(ctx, 512, 512, (c, cw, ch) => glansvloer(c, cw, ch, r, A), 2, 2), new THREE.Color(1.3, 1.3, 1.3)),
      muur: wandShow(L.sp, gordijn, w, d, 4, 0xd0d0d0),
      plafond: dubbel(basic(0x5a5a5a, { map: T(ctx, 512, 512, (c, cw, ch) => sterren(c, cw, ch, r, hex(B), 160), 2, 2) })) });
    const gloed = gloedTex(ctx);
    const NSEG = [16, 12, 8][Z], paalLed = LS.lijnen(g, nP * NSEG, Z < 2, 2.5, 0.05);
    const torus = new THREE.TorusGeometry(0.95, 0.03, 6, 40), ringMat = gloei(B, 0.9), podMat = basic(0x060507), paalMat = basic(0x0a0a0c);
    add(g, K.box, paalMat, [0, h - 0.18, 0], [0.12, 0.1, d - 4.4]);  // truss boven het looppad
    const OMHOOG = new THREE.Vector3(0, 1, 0), pinPlek = [], staal = [];  // staal: palen, ophangpunten, pinspots, snoeren (één draw)
    veel(g, K.cyl, podMat, palen.map(([x, z]) => [x, 0.03, z, 0.95, 0.06, 0.95]));
    veel(g, torus, ringMat, palen.map(([x, z]) => [x, 0.065, z, 1, 1, 1, Math.PI / 2]));
    for (const [x, z] of palen) {
      staal.push([x, h / 2, z, 0.022, h, 0.022], [x, h - 0.04, z, 0.12, 0.08, 0.12], [x, h - 0.12, z + 0.35, 0.1, 0.18, 0.1]);  // paal, ophangpunt, pinspot
      pinPlek.push(new THREE.Vector3(x, h - 0.22, z + 0.35));
      const pd = ctx.figuur({ x, z, face: r() * TAU, rol: 'paal' }) || fig(ctx, { x, z, face: r() * TAU, rol: 'dans', filter: /burlesque|showgirl/ });
      if (pd) { pd.root.position.y = 0.06; pd.yOff = 0.06; }
    }
    // banken langs de zijwanden, publiek kijkt naar de podia (donker fluweel: silhouetten)
    const fluweel = lam(BANK, { emissive: new THREE.Color(BANK).multiplyScalar(0.15) });
    let zit = [];
    const bankDelen = [];
    for (const s of [-1, 1]) for (const z of [-d / 4, d / 4]) zit = zit.concat(bank(g, K, fluweel, s * (w / 2 - 0.85), z, -s * Math.PI / 2, 2.4, 2, bankDelen));
    veelM(g, K.box, fluweel, bankDelen);
    zit.sort(() => r() - 0.5);
    for (const [x, z, f] of zit.slice(0, [4, 2, 2][Z])) fig(ctx, { x, z, face: f, rol: 'zit' });
    // twee staan bij de uitgang met een drankje en kijken mee
    if (Z < 2) for (const s of (Z ? [1] : [-1, 1])) {
      const x = s * (w / 2 - 1.8), z = d / 2 - 1.8, [tx, tz] = palen[palen.length - 1];
      fig(ctx, { x, z, face: Math.atan2(tx - x, tz - z), rol: 'staan' });
    }
    // lampionnen aan het plafond: kleine warme accenten (bollen en gloed elk in één draw)
    const nLant = [6, 4, 3][Z], lantBollen = [], lantGloed = LS.punten(g, nLant, 0.7, gloed);
    for (let i = 0; i < nLant; i++) {
      const x = tussen(r, -w / 2 + 1.5, w / 2 - 1.5), z = tussen(r, -d / 2 + 1.5, d / 2 - 1.5), y = h - tussen(r, 0.5, 0.9);
      staal.push([x, (h + y) / 2, z, 0.006, h - y, 0.006]);
      lantBollen.push([x, y, z, 0.08, 0.11, 0.08]);
      lantGloed.plek(i, x, y, z);
    }
    veel(g, K.sph, basic(new THREE.Color(A).multiplyScalar(0.18)), lantBollen);
    veel(g, K.cyl, paalMat, staal);
    const uit = uitgang(ctx, K, w, d, h, kies(r, ['VELVET', 'PEEP SHOW', 'RED ROOM', 'POLE POSITION', 'NAUGHTY', 'SIN CITY']), A);
    const L1 = ctx.licht(A, 1.8, 9, palen[0][0], 2.8, palen[0][1]), L2 = ctx.licht(B, 1.2, 12, 0, h - 0.6, 0);
    const kA = new THREE.Color(A), camKant = r() < 0.5 ? -1 : 1, E = new THREE.Vector3(), V = new THREE.Vector3();
    return {
      maat: { w, d, h },
      route: [{ x: 0, z: -d / 2 }, { x: 0.5, z: -d / 4 }, { x: 0, z: 0 }, { x: -0.5, z: d / 4 }, { x: 0, z: d / 2 }],
      blijf: 14,
      update(dt, now) {
        const b = ctx.beat(), s = L.begin(), st = s.stand, pu = s.kick;
        const kA0 = LS.kleur(PAL, 0), kB0 = LS.kleur(PAL, 1);
        // pinspots: groove = alle danseressen in hun licht; break = één; opbouw = looplicht van paal naar paal; drop = alles, kleur per tel
        const brk = Math.floor(s.pos / 16) % nP, loop = Math.floor(s.pos * (s.opb < 0.5 ? 1 : 2)) % nP;
        for (let i = 0; i < nP; i++) {
          let k = st === 'break' ? (i === brk ? 0.85 : 0) : st === 'opbouw' ? (s.opb < 0.75 ? (i === loop ? 1 : 0.12) : 1) * (0.5 + 0.7 * s.opb)
            : st === 'drop' ? 1.1 + 0.6 * s.knal : 0.75 + 0.35 * pu;
          let c = st === 'drop' ? LS.kleur(PAL, i + 1) : st === 'break' ? PAL[2] : kA0;
          if (s.flits > 0.5) { c = LS.wit; k = Math.max(k, 1.2 * s.flits); }
          const P = pinPlek[i], [x, z] = palen[i];
          V.set(x - P.x, 0.05 - P.y, z - P.z); const len = V.length(); V.divideScalar(len);
          L.bun.zet(L.nK + i, P, V, len, 0.85, c, k);
          L.pun.zet(L.nK + i, P.x, P.y, P.z, c, 0.4 + k);
          L.sp.zet(x, 0.05, z, 1.5, c, 1.1 * k);
          // tegenlicht op het gordijn achter de paal: om en om op de tel, in de drop elke tel een andere kleur
          const wk = st === 'break' ? (i === brk ? 0.2 : 0) : st === 'drop' ? 0.7 + 0.4 * pu : st === 'opbouw' ? (i === loop ? 0.6 : 0.1) * (0.5 + s.opb) : 0.4 + 0.45 * ((s.tel + i) % 2 ? pu : 0.4);
          L.sp.zet(Math.sign(x || 1) * (w / 2), 2.3, z, 2.8, st === 'drop' ? LS.kleur(PAL, i + 2) : kB0, wk);
          // ledpaal: groove = op elke tel loopt het licht omhoog; opbouw = sneller; drop = vol aan; break = alleen de paal in het licht, zacht
          const nRun = st === 'opbouw' ? (s.opb < 0.5 ? 1 : 2) : 1, run = ((s.pos * nRun) % 1) * 1.2 - 0.1;
          for (let j = 0; j < NSEG; j++) {
            const u = (j + 0.5) / NSEG, dd = u - run;
            let kl = st === 'break' ? (i === brk ? 0.25 : 0.03) : st === 'drop' ? 0.9 + 0.5 * pu : (0.05 + (st === 'opbouw' ? 0.3 * s.opb : 0.03)) + 1.3 * Math.exp(-dd * dd * 30);
            let cl = st === 'drop' ? LS.kleur(PAL, i + j % 2) : st === 'break' ? PAL[2] : kB0;
            if (s.flits > 0.5) { cl = LS.wit; kl = Math.max(kl, s.flits); }
            E.set(x, (j / NSEG) * h, z);
            paalLed.zet(i * NSEG + j, E, OMHOOG, h / NSEG - 0.025, cl, kl, 0.02);
          }
        }
        paalLed.klaar();
        L.koppen(dt, now);
        ringMat.color.copy(kB0); ringMat.opacity = (0.25 + 0.7 * pu) * Math.min(1, s.niv);
        for (let i = 0; i < nLant; i++) lantGloed.kleur(i, kA, (0.35 + 0.15 * Math.sin(now * 7.3 + i) * Math.sin(now * 3.1 + i * 2)) * Math.max(0.5, s.niv));  // flakkeren
        lantGloed.klaar();
        lampShow(L1, kA0, (0.8 + 1.4 * pu) * s.niv, s);
        if (L1) L1.position.set(palen[st === 'break' ? brk : loop][0], 2.8, palen[st === 'break' ? brk : loop][1]);
        lampShow(L2, kB0, (0.4 + 0.8 * s.mid) * s.niv, s);
        uit.puls(b, s);
        L.eind(now, kA0, 0.02);
      },
      cam(t) {  // laag bij de ingang, iets uit het midden, de zaal in: de rij koppen op de truss, de danseressen in hun pinspot, het gordijn
        const u = glad(klem(t / 22)), x = camKant * (1.8 + 0.5 * Math.sin(t * 0.15)), z = -d / 2 + 1.3 + 1.2 * u;
        const nP2 = palen.length, i = ((Math.floor(t / 5) % nP2) + nP2) % nP2, j = (i + 1) % nP2, k = glad(klem((((t % 5) + 5) % 5) - 3.8, 0, 1.2) / 1.2);
        const lx = palen[i][0] + (palen[j][0] - palen[i][0]) * k, lz = palen[i][1] + (palen[j][1] - palen[i][1]) * k;
        return kcam(t, x, 1.25 + 0.1 * Math.sin(t * 0.3), z, lx * 0.55, 2.0, lz + 1.5, 62);
      },
      opruimen() { ruimDeeltjes(g); },
    };
  } });

  // ============ 2. Slakkenhol: donkere grot met gloeiend slijm, een uitvergrote slak, lichtschachten uit het plafond, een groen laserplafond ============
  DH.registreer('slakkenhol', { gewicht: 0.8, maak(ctx) {
    const r = () => ctx.rnd(), Z = ctx.zwaar, g = ctx.groep, K = kit();
    const GROEN = kies(r, [0x7dff3c, 0x3cff9a, 0xb8ff2a]), gC = new THREE.Color(GROEN);
    const F = tussen(r, 1.25, 1.55), sH = 2.6 * F;  // de club-slak is 2,6 m hoog
    const w = Math.round(tussen(r, 13, 16)), d = Math.round(tussen(r, 14, 18)), h = +(sH + 1.7).toFixed(2);
    const kcam = camHulp(ctx, d);
    const kant = r() < 0.5 ? -1 : 1, sx = kant * (w / 4 + 0.4), z0 = -d / 4, z1 = d / 4;
    // palet: het groen van het slijm, uv-paars en ijsblauw; lichtschachten uit gaten in het plafond (moving heads op de slak)
    const PAL = [gC.clone(), new THREE.Color(kies(r, [0x8a2bff, 0xc02bff, 0x5a3cff])), new THREE.Color(kies(r, [0x00e5ff, 0x00ffc8]))];
    const focus = new THREE.Vector3(sx, 0, 0);
    const gaten = [[sx * 0.6, h - 0.05, -d / 4], [-sx * 0.5, h - 0.05, d / 5], [sx * 0.2, h - 0.05, d / 3], [-sx * 0.8, h - 0.05, -d / 3]].slice(0, [4, 3, 2][Z]);
    const L = lichtset(ctx, { koppen: gaten, rig: { maat: { w, d, h }, pal: PAL, focus, spreid: 0.11, vlek: 0.5, patronen: ['midden', 'zwaai', 'cirkel', 'kruis'] } });
    const rotsT = T(ctx, 1024, 512, (c, cw, ch) => rots(c, cw, ch, r, '#141a10', rgba(GROEN, 0.5)));
    ctx.doos({ w, d, h,
      vloer: L.sp.mat(T(ctx, 512, 512, (c, cw, ch) => plassen(c, cw, ch, r, rgba(GROEN, 0.35), 24, '#0c120a'), 2, 2), 0xffffff),
      muur: wandShow(L.sp, rotsT, w, d, 6, 0xb0c0a4),
      plafond: L.sp.mat(rotsT, 0x6a7a60) });
    const gloed = gloedTex(ctx);
    // gloeiende slijmlaag over de vloer (additief: zwart doet niets), deint op de bas
    const glimMat = metMap(gloei(GROEN, 0.5), T(ctx, 512, 512, (c, cw, ch) => plassen(c, cw, ch, r, 'rgba(255,255,255,0.9)', 14, '#000000'), 2, 2));
    add(g, K.plane, glimMat, [0, 0.015, 0], [w - 0.2, d - 0.2, 1]).rotation.x = -Math.PI / 2;
    // druipstenen met gloeiende druppelpuntjes
    const nS = [16, 10, 6][Z], kegel = new THREE.ConeGeometry(1, 1, 7); kegel.rotateX(Math.PI);
    const stal = new THREE.InstancedMesh(kegel, basic(0xffffff), nS), tips = new THREE.InstancedMesh(K.sph, gloei(0xffffff, 0.9), nS), tipPos = [];
    for (let i = 0; i < nS; i++) {
      const x = tussen(r, -w / 2 + 0.6, w / 2 - 0.6), z = tussen(r, -d / 2 + 0.6, d / 2 - 0.6), len = tussen(r, 0.6, Math.min(2, h - 3.2)), rad = len * tussen(r, 0.12, 0.2);
      M4.compose(V3.set(x, h - len / 2, z), Q.identity(), S3.set(rad, len, rad)); stal.setMatrixAt(i, M4);
      stal.setColorAt(i, C3.setRGB(0.1, 0.14, 0.08).multiplyScalar(0.8 + 0.6 * r()));
      M4.compose(V3.set(x, h - len - 0.03, z), Q, S3.setScalar(0.04 + rad * 0.15)); tips.setMatrixAt(i, M4);
      tips.setColorAt(i, C3.copy(gC).multiplyScalar(0.5 + 0.5 * r()));
      tipPos.push([x, h - len - 0.03, z]);
    }
    g.add(stal, tips);
    // laserplafond: een waaier laserlijnen net boven de hoofden, vanuit een hoek naar de andere kant van de grot
    const NL = [24, 16, 8][Z], laser = LS.lijnen(g, NL, Z < 2, 4), LBRON = new THREE.Vector3(-kant * (w / 2 - 0.25), 2.3, -d / 2 + 0.25);
    const lYaw = Math.atan2(kant * (w - 0.5), d - 0.5), LD = new THREE.Vector3();
    add(g, K.box, basic(0x111114), [LBRON.x, LBRON.y + 0.1, LBRON.z], [0.3, 0.16, 0.3]);
    const dripMat = gloei(GROEN, 0.9), druppels = [];
    for (let i = 0; i < [6, 4, 2][Z]; i++) { const m = add(g, K.sph, dripMat, [0, -1, 0], [0.03, 0.05, 0.03]); m.visible = false; druppels.push({ m, v: 0, wacht: r() * 3 }); }
    // bellen die uit het slijm opstijgen
    const nB = [40, 24, 12][Z];
    const bel = deeltjes(g, nB, GROEN, 0.14, gloed, (p, i) => { p[i * 3] = tussen(r, -w / 2 + 1, w / 2 - 1); p[i * 3 + 1] = r() * 2.5; p[i * 3 + 2] = tussen(r, -d / 2 + 1, d / 2 - 1); });
    const belV = Array.from({ length: nB }, () => 0.2 + r() * 0.5);
    // de slak: een kopie van de club-slak, uitvergroot; geen slak geladen: deinende slijmbulten
    let sl = null; const slMats = [], bulten = [];
    if (typeof slug !== 'undefined' && slug && slug.wob && slug.wob.children[0]) {
      const kopie = slug.wob.children[0].clone();
      kopie.traverse(o => {
        if (!o.isMesh || Array.isArray(o.material)) return;
        const m0 = o.material, m = new THREE.MeshLambertMaterial({ map: m0.map || null, color: m0.color ? m0.color.clone() : new THREE.Color(0xffffff), emissive: gC.clone().multiplyScalar(0.12) });
        o.material = m; slMats.push(m); o.castShadow = o.receiveShadow = false;
      });
      const root = new THREE.Group(), wob = new THREE.Group();
      wob.add(kopie); root.add(wob); root.scale.setScalar(F); root.position.set(sx, 0, z0); g.add(root);
      sl = { root, wob, kopie, dir: 1, t: 0, burp: 0, burpAt: tussen(r, 8, 16), pulse: 0 };
    } else {
      const bm = lam(0x2a5a18, { emissive: gC.clone().multiplyScalar(0.18) });
      for (let i = 0; i < 6; i++) {
        const m = add(g, K.sph, bm, [sx + tussen(r, -1.5, 1.5), 0, tussen(r, z0, z1)], [tussen(r, 1, 2), tussen(r, 0.8, 1.8), tussen(r, 1, 2)]);
        bulten.push({ m, s: m.scale.clone(), f: r() * TAU });
      }
    }
    const slakPos = () => sl ? sl.root.position : V3.set(sx, 0, (z0 + z1) / 2);
    // slijmspoor achter de slak
    const nT = [30, 20, 10][Z], spoor = new THREE.InstancedMesh(K.disc, gloei(0xffffff, 0.8), nT), sporen = [];
    for (let i = 0; i < nT; i++) { M4.makeScale(0, 0, 0); spoor.setMatrixAt(i, M4); spoor.setColorAt(i, C3.setRGB(0, 0, 0)); sporen.push({ age: 99, x: 0, z: 0, s: 1 }); }
    spoor.frustumCulled = false; g.add(spoor);
    let spoorNext = 0; const laatste = new THREE.Vector3(999, 0, 999);
    // boerwolk
    const wolkTex = new THREE.CanvasTexture(smokeTex[0].image), wolken = [];
    for (let i = 0; i < [8, 5, 3][Z]; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: wolkTex, color: GROEN, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      sp.visible = false; g.add(sp); wolken.push({ sp, v: new THREE.Vector3(), age: 0, life: 1 });
    }
    // wormpjes: de club-worm, zelf aangestuurd (rondjes om de slak, dan stilstaan en roken)
    const wormen = [], Rw = 2.2 + F * 0.5;
    if (typeof wormModel !== 'undefined' && wormModel) for (let i = 0, n = [3, 2, 1][Z]; i < n; i++) {
      const wm = makeModelDancer(wormModel, true), s = tussen(r, 0.62, 0.78) / wormModel.h;
      wm.body.scale.set(s * (wm.body.scale.x < 0 ? -1 : 1), s, s);
      g.add(wm.root);
      wm.angle = i * TAU / n; wm.state = 'run'; wm.until = tussen(r, 6, 12);
      const c = slakPos(); wm.root.position.set(c.x + Math.cos(wm.angle) * Rw, 0, c.z + Math.sin(wm.angle) * Rw);
      if (i % 2 === 0) giveDrink(wm, 'sigaret');
      wormen.push(wm);
    }
    // fans aan de overkant juichen naar de slak, wat rokers bij de ingang, een paar dansers
    for (const [x, z] of plekken(r, [3, 2, 2][Z], w / 2 - 1.5, d / 3, 1.4, 1.3, x => x * kant < 0)) fig(ctx, { x, z, face: Math.atan2(sx - x, -z), rol: 'juich' });
    const rx = -kant * (w / 2 - 1.6), rz = -d / 2 + 2;
    for (let i = 0; i < [2, 1, 1][Z]; i++) fig(ctx, { x: rx + i * kant * 0.8, z: rz + i * 0.3, face: i ? -kant * Math.PI / 2 : kant * Math.PI / 2, rol: 'staan' });
    for (const [x, z] of plekken(r, [2, 1, 0][Z], w / 2 - 1.5, d / 2 - 2.5, 1.5, 1.4, x => x * kant < 0)) fig(ctx, { x, z, face: r() * TAU, rol: 'dans' });
    const uit = uitgang(ctx, K, w, d, h, kies(r, ['SLIJM', 'SLAKKENHOL', 'SLUG LIFE', 'GOO ZONE', 'DE GROT']), GROEN);
    const L1 = ctx.licht(GROEN, 1.2, 12, sx, sH * 0.8, 0), L2 = ctx.licht(0x6a3cff, 0.7, 12, -sx, 3, 0);

    function slakDoet(dt, b) {
      if (!sl) { for (const q of bulten) { const k = 1 + 0.08 * Math.sin(performance.now() / 700 + q.f) + 0.1 * b.bas; q.m.scale.set(q.s.x * k, q.s.y * (2 - k), q.s.z * k); } return; }
      const p = sl.root.position, tz = sl.dir > 0 ? z1 : z0, dz = tz - p.z;
      const wil = sl.dir > 0 ? 0 : Math.PI; let dr = wil - sl.root.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      sl.root.rotation.y += dr * Math.min(1, dt * 0.7);
      if (sl.burp <= 0 && Math.abs(dr) < 0.3) { if (Math.abs(dz) < 0.2) sl.dir *= -1; else p.z += Math.sign(dz) * Math.min(Math.abs(dz), 0.3 * dt); }
      sl.t += dt; sl.burpAt -= dt;
      if (sl.burpAt <= 0) {  // boer: groene wolk uit de bek en een lichtflits
        sl.burp = 1; sl.burpAt = tussen(Math.random, 22, 38);
        const fx = Math.sin(sl.root.rotation.y), fz = Math.cos(sl.root.rotation.y);
        for (const wk of wolken) {
          wk.sp.visible = true; wk.age = 0; wk.life = 3 + Math.random() * 2.5;
          wk.sp.position.set(p.x + fx * 0.9 * F, 1.5 * F, p.z + fz * 0.9 * F);
          wk.v.set(fx * (1.5 + Math.random() * 2) + (Math.random() - 0.5), 0.2 + Math.random() * 0.6, fz * (1.5 + Math.random() * 2) + (Math.random() - 0.5));
        }
      }
      const bu = sl.burp > 0 ? Math.sin((1 - sl.burp) * Math.PI) : 0;
      sl.burp = Math.max(0, sl.burp - dt * 0.5);
      sl.pulse += (b.pulse - sl.pulse) * Math.min(1, dt * 4);  // afgevlakt: de kick zelf is een sprong
      const sq = 0.03 * Math.sin(sl.t * 2.4) + 0.035 * sl.pulse + 0.18 * bu;
      sl.wob.scale.set(1 + sq * 0.6, 1 + sq, 1 - sq * 0.3);
      focus.set(p.x, 0.3, p.z);
      if (L1) { L1.position.set(p.x, sH * 0.8, p.z); L1.intensity = (0.4 + 0.8 * b.bas) * L.s.niv + 3 * bu; }
      for (const wk of wolken) {
        if (!wk.sp.visible) continue;
        wk.age += dt;
        if (wk.age > wk.life) { wk.sp.visible = false; continue; }
        wk.v.multiplyScalar(Math.exp(-dt * 1.2)); wk.sp.position.addScaledVector(wk.v, dt);
        const s = 0.8 + wk.age * 1.4; wk.sp.scale.set(s * 1.3, s, 1);
        wk.sp.material.opacity = 0.55 * Math.min(1, wk.age * 4) * (1 - wk.age / wk.life);
      }
      // slijmspoor
      if (p.distanceTo(laatste) > 0.5) {
        laatste.copy(p);
        const s = sporen[spoorNext++ % nT]; s.age = 0; s.x = p.x + (Math.random() - 0.5) * 0.4; s.z = p.z + (Math.random() - 0.5) * 0.4; s.s = (0.6 + Math.random() * 0.4) * F;
      }
      sporen.forEach((s, i) => {
        if (s.age > 30) return;
        s.age += dt;
        const f = s.age > 30 ? 0 : (1 - s.age / 30);
        M4.compose(V3.set(s.x, 0.03, s.z), PLAT, S3.set(s.s * f + 0.001, s.s * f + 0.001, 1)); spoor.setMatrixAt(i, M4);
        spoor.setColorAt(i, C3.copy(gC).multiplyScalar(0.45 * f * (0.6 + 0.4 * b.pulse)));
      });
      spoor.instanceMatrix.needsUpdate = true; spoor.instanceColor.needsUpdate = true;
    }
    function wormenDoen(dt) {
      const c = slakPos(), vlucht = 1.6 * F;
      for (const wm of wormen) {
        wm.until -= dt;
        const p = wm.root.position;
        if (wm.state === 'run') {  // rondjes om de slak, als een bendetje
          wm.angle += dt * 1.1;
          const R = Rw + 0.3 * Math.sin(wm.angle * 2), tx = klem(c.x + Math.cos(wm.angle) * R, -w / 2 + 0.5, w / 2 - 0.5), tz = klem(c.z + Math.sin(wm.angle) * R, -d / 2 + 0.5, d / 2 - 0.5);
          const dx = tx - p.x, dz = tz - p.z, dist = Math.hypot(dx, dz);
          if (dist > 0.01) { const sp = Math.min(dist, 3.2 * dt); p.x += dx / dist * sp; p.z += dz / dist * sp; wm.root.rotation.y = Math.atan2(dx, dz); }
          if (ACTS.Run_02) setClip(wm, ACTS.Run_02, 0.3);
          blend(wm, dt);
          if (wm.until <= 0) { wm.state = 'chill'; wm.until = 10 + Math.random() * 6; wm.acts = ['Stand_and_Chat', 'Stand_and_Drink']; wm.actT = 0; }
        } else {  // stilstaan, naar de slak kijken, roken en kletsen; komt hij te dichtbij: weer rennen
          let dr = Math.atan2(c.x - p.x, c.z - p.z) - wm.root.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr));
          wm.root.rotation.y += dr * Math.min(1, dt * 3);
          act(wm, dt);
          if (wm.until <= 0 || Math.hypot(c.x - p.x, c.z - p.z) < vlucht) { wm.state = 'run'; wm.until = 10 + Math.random() * 8; wm.acts = null; }
        }
      }
    }
    return {
      maat: { w, d, h },
      route: [{ x: 0, z: -d / 2 }, { x: -kant * 1.2, z: -d / 4 }, { x: 0, z: 0 }, { x: -kant * 1.2, z: d / 4 }, { x: 0, z: d / 2 }],
      blijf: 15,
      update(dt, now) {
        const b = ctx.beat(), s = L.begin(), st = s.stand, pu = s.kick;
        glimMat.opacity = (0.05 + 0.22 * b.bas) * s.niv + (st === 'drop' ? 0.12 * pu : 0);
        slakDoet(dt, b);
        wormenDoen(dt);
        const bu = sl && sl.burp > 0 ? Math.sin((1 - sl.burp) * Math.PI) : 0;
        // lichtschachten (moving heads) en de lichtvlek op de slak
        L.sp.zet(focus.x, sH * 0.5, focus.z, 2.6 * F, LS.kleur(PAL, 0), (0.12 + 0.2 * pu) * s.niv + 0.8 * bu);
        L.koppen(dt, now);
        // laserplafond: groove = 8 tellen aan, 8 uit; opbouw = zacht aan en steeds feller (flikkert op het eind); drop = vol, kleur per tel; break = uit
        let lk = st === 'break' ? 0 : st === 'opbouw' ? (s.opb > 0.3 ? 0.25 + 0.75 * s.opb : 0) * (s.opb > 0.75 && (s.pos * 4) % 1 > 0.5 ? 0.2 : 1)
          : st === 'drop' ? 0.9 + 0.5 * pu : (Math.floor(s.pos / 8) % 2 ? 0 : 0.45 + 0.4 * pu);
        const lc = st === 'drop' ? LS.kleur(PAL, s.tel % 2 ? 0 : 2) : PAL[0], open = st === 'drop' ? 1.7 : 1.3 + 0.2 * Math.sin(s.pos * Math.PI / 8);
        const helling = -0.035 + (st === 'drop' ? 0.03 * Math.sin(s.pos * Math.PI) : 0.02 * Math.sin(now * 0.4));
        for (let i = 0; i < NL; i++) {
          const yaw = lYaw + (NL > 1 ? i / (NL - 1) - 0.5 : 0) * open;
          LD.set(Math.sin(yaw) * Math.cos(helling), Math.sin(helling), Math.cos(yaw) * Math.cos(helling));
          laser.zet(i, LBRON, LD, LS.raak(LBRON, LD, w, d, h), lc, lk * (0.8 + 0.2 * Math.sin(i * 1.7 + now * 9)), 0.008);
        }
        laser.klaar();
        bel.material.color.copy(gC).multiplyScalar(0.35 + 0.65 * s.niv);
        // druppels vallen van de druipstenen
        for (const q of druppels) {
          if (!q.m.visible) { if ((q.wacht -= dt) <= 0) { const [x, y, z] = tipPos[Math.floor(Math.random() * tipPos.length)]; q.m.position.set(x, y, z); q.v = 0; q.m.visible = true; } continue; }
          q.v += 9.8 * dt; q.m.position.y -= q.v * dt;
          if (q.m.position.y < 0.03) { q.m.visible = false; q.wacht = 0.5 + Math.random() * 2.5; }
        }
        const pa = bel.geometry.attributes.position, a = pa.array;
        for (let i = 0; i < nB; i++) {
          a[i * 3 + 1] += belV[i] * dt * (1 + b.bas);
          if (a[i * 3 + 1] > 2.8) { a[i * 3] = (Math.random() - 0.5) * (w - 2); a[i * 3 + 1] = 0.05; a[i * 3 + 2] = (Math.random() - 0.5) * (d - 2); }
        }
        pa.needsUpdate = true;
        lampShow(L2, PAL[1], (0.3 + 0.6 * b.mid) * s.niv, s);
        uit.puls(b, s);
        L.eind(now, gC, 0.012, bu > s.flits ? gC : LS.wit, Math.max(0.9 * bu, s.flits * 0.8));  // de boer van de slak: groene flits
      },
      cam(t) {  // laag aan de overkant, onder het laserplafond door omhoog naar de slak en de lichtschachten
        const u = glad(klem(t / 20)), cx = -kant * (w / 2 - 1.5), p = slakPos();
        return kcam(t, cx, 1.15 + u * 0.35, -d / 2 + 1.6 + u * (d - 4.5), p.x, sH * 0.62, p.z, 62);
      },
      opruimen() {
        for (const wm of wormen) {  // eigen klonen: skelet en materialen (herkleuring, sigaret) weg; geometrie en textuur zijn van het model
          dropDancer(wm);
          wm.mixer.stopAllAction(); wm.mixer.uncacheRoot(wm.body);
          wm.body.traverse(o => { if (o.isSkinnedMesh && o.skeleton) o.skeleton.dispose(); if (o.isMesh) for (const m of [].concat(o.material)) if (m) m.dispose(); });
        }
        wormen.length = 0;
        if (sl) { g.remove(sl.root); for (const m of slMats) m.dispose(); }  // geometrie en textuur zijn van de club-slak: niet weggooien
        ruimDeeltjes(g);
      },
    };
  } });

  // ============ 3. Spiegeldisco: donkere zaal, twee pinspots op de spiegelbol, lichtvlekjes over alle wanden, ledvloer, moving heads ============
  DH.registreer('spiegeldisco', { gewicht: 1, maak(ctx) {
    const r = () => ctx.rnd(), Z = ctx.zwaar, g = ctx.groep, K = kit();
    const PAL = kies(r, [[0xff2d95, 0x00e5ff, 0xffe600], [0xff6b00, 0xff1744, 0xffd400], [0x7cff00, 0xb967ff, 0x00e5ff], [0xff00e5, 0x304ffe, 0x00e5ff], [0xffab00, 0x00bfa5, 0xff3fa4]]).map(c => new THREE.Color(c));
    const w = Math.round(tussen(r, 12, 15)), d = Math.round(tussen(r, 12, 16)), h = +tussen(r, 5, 6).toFixed(2);
    const kcam = camHulp(ctx, d);
    // spiegelbol aan een kabel boven het midden
    const R = tussen(r, 0.7, 1.0), by = h - 1.2 - R * 0.4, BOL = new THREE.Vector3(0, by, 0);
    // moving heads in de vier hoeken van het plafond (minimaal: twee) + twee pinspots op de bol
    const kopPlek = [[-1, -1], [1, 1], [1, -1], [-1, 1]].slice(0, Z === 2 ? 2 : 4).map(([x, z]) => [x * (w / 2 - 0.6), h - 0.2, z * (d / 2 - 0.6)]);
    const L = lichtset(ctx, { koppen: kopPlek, extra: 2, rig: { maat: { w, d, h }, pal: PAL, focus: { x: 0, y: 0, z: 0 }, spreid: 0.045, patronen: ['waaier', 'kruis', 'cirkel', 'zwaai', 'publiek'] } });
    const panT = T(ctx, 1024, 512, (c, cw, ch) => panelen(c, cw, ch, r, kies(r, ['120,140,200', '200,120,180', '140,200,190'])));
    ctx.doos({ w, d, h, vloer: dubbel(basic(0x050507)), muur: wandShow(L.sp, panT, w, d, 7, new THREE.Color(1.6, 1.6, 1.6)), plafond: L.sp.mat(null, 0x15151c) });
    const tegels = tegelvloer(g, w, d, PAL);
    const bol = new THREE.Group(); bol.position.copy(BOL); g.add(bol);
    const bolMat = new THREE.MeshMatcapMaterial({ matcap: T(ctx, 256, 256, (c, cw, ch) => matcap(c, cw, ch, r), 0), side: THREE.DoubleSide });
    bol.add(new THREE.Mesh(mirrorBallGeometry(R, Z === 2 ? 16 : 22, 0.9), bolMat));
    add(bol, K.sph, basic(0x050508), null, [R * 0.985, R * 0.985, R * 0.985]);
    add(g, K.cyl, basic(0x1a1a1a), [0, (h + by + R) / 2, 0], [0.015, h - by - R, 0.015]);
    // de twee pinspots: van hoog uit twee hoeken op de bol
    const pin = [[-(w / 2 - 0.4), h - 0.3, -(d / 2 - 0.4)], [w / 2 - 0.4, h - 0.3, d / 2 - 0.4]].map(([x, y, z]) => {
      add(g, K.box, basic(0x0c0c10), [x, y + 0.08, z], [0.22, 0.18, 0.22]);
      const p = new THREE.Vector3(x, y, z), dir = new THREE.Vector3().subVectors(BOL, p), len = dir.length() - R * 0.6; dir.normalize();
      return { p, dir, len };
    });
    // lichtvlekjes: per vlekje een richting vanuit de bol tot op vloer, wand of plafond (draait mee met de bol)
    const nF = [140, 80, 40][Z], vlek = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 8), gloei(0xffffff, 0.9), nF), fDir = [];
    vlek.frustumCulled = false; vlek.renderOrder = 3;
    for (let i = 0; i < nF; i++) { fDir.push(new THREE.Vector3().setFromSphericalCoords(1, Math.acos(tussen(r, -1, 0.7)), r() * TAU)); vlek.setColorAt(i, C3.copy(PAL[i % 3]).lerp(WIT, 0.2)); }
    g.add(vlek);
    const NQ = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map(n => new THREE.Quaternion().setFromUnitVectors(ZAS, new THREE.Vector3(...n)));
    // dj-tafeltje bij de achterwand (naast de uitgang)
    const djx = (r() < 0.5 ? -1 : 1) * (w / 2 - 2.4), djz = d / 2 - 1.3;
    add(g, K.box, basic(0x0a0a0e), [djx, 0.5, djz - 0.6], [1.8, 1.0, 0.7]);
    const ledMat = gloei(PAL[1], 0.9);
    add(g, K.box, ledMat, [djx, 0.85, djz - 0.96], [1.7, 0.04, 0.02]);
    for (const s of [-0.45, 0.45]) add(g, K.cyl, basic(0x2a2a30), [djx + s, 1.02, djz - 0.6], [0.17, 0.03, 0.17]);
    fig(ctx, { x: djx, z: djz, face: Math.PI, rol: 'dj' });
    // dansers in een ring rond de bol (het midden blijft vrij voor de loper)
    for (const [x, z] of plekken(r, [7, 4, 3][Z], w / 2 - 1.5, d / 2 - 2.2, 1.3, 1.3, (x, z) => Math.hypot(x, z) > 2 && Math.hypot(x - djx, z - djz + 0.6) > 1.4)) fig(ctx, { x, z, face: Math.atan2(-x, -z) + tussen(r, -0.7, 0.7), rol: 'dans' });
    const uit = uitgang(ctx, K, w, d, h, kies(r, ['DISCO', 'MIRROR', 'BOOGIE', 'FUNKHOUSE', 'STAYIN ALIVE', 'GLITTER']), PAL[0]);
    const L1 = ctx.licht(PAL[0], 1.4, 14, 0, h - 1.6, 0), L2 = ctx.licht(PAL[1], 1.1, 12, 3, 2.5, 0);
    let hoek = 0;
    return {
      maat: { w, d, h },
      blijf: 14,
      update(dt, now) {
        const b = ctx.beat(), s = L.begin(), st = s.stand, pu = s.kick;
        tegels(b, s);
        // pinspots op de bol: altijd (de break is het moment van de bol), in de drop kleur op de tel
        const pk = st === 'break' ? 0.9 : st === 'drop' ? 1.1 + 0.5 * s.knal : 0.7 + 0.2 * pu;
        pin.forEach((q, i) => {
          const c = s.flits > 0.5 ? LS.wit : st === 'drop' ? LS.kleur(PAL, i) : st === 'break' ? WIT : PAL[i * 2 % 3];
          L.bun.zet(L.nK + i, q.p, q.dir, q.len, 0.22, c, pk * (st === 'break' ? 0.55 : 1));
          L.pun.zet(L.nK + i, q.p.x, q.p.y, q.p.z, c, 0.6 + pk);
        });
        bolMat.color.setScalar(0.25 + 0.6 * pk);
        // de bol draait; break traag en de vlekjes zijn het enige licht, opbouw steeds sneller, drop feller en op de tel
        hoek += dt * (st === 'break' ? 0.18 : st === 'opbouw' ? 0.25 + 0.8 * s.opb : st === 'drop' ? 0.55 : 0.25 + 0.2 * s.en); bol.rotation.y = hoek;
        const ca = Math.cos(hoek), sa = Math.sin(hoek), hw = w / 2 - 0.02, hd = d / 2 - 0.02;
        for (let i = 0; i < nF; i++) {
          const f = fDir[i], dx = f.x * ca + f.z * sa, dz = -f.x * sa + f.z * ca, dy = f.y;
          let t = 1e9, n = 0;
          if (dx > 1e-4) { t = hw / dx; n = 1; } else if (dx < -1e-4) { t = -hw / dx; n = 0; }
          const ty = dy > 1e-4 ? (h - 0.02 - by) / dy : dy < -1e-4 ? (0.035 - by) / dy : 1e9;
          if (ty < t) { t = ty; n = dy > 0 ? 3 : 2; }
          const tz = dz > 1e-4 ? hd / dz : dz < -1e-4 ? -hd / dz : 1e9;
          if (tz < t) { t = tz; n = dz > 0 ? 5 : 4; }
          M4.compose(V3.set(dx * t, by + dy * t, dz * t), NQ[n], S3.setScalar(0.04 + t * 0.011)); vlek.setMatrixAt(i, M4);
        }
        vlek.instanceMatrix.needsUpdate = true;
        vlek.material.color.setScalar(st === 'break' ? 0.75 : st === 'drop' ? 0.7 + 0.5 * pu : (0.45 + 0.35 * s.hoog + 0.3 * pu) * s.niv);
        L.sp.zet(0, by, 0, R * 2.2, WIT, 0.25 * pk);  // gloed rond de bol op de kabel en het plafond
        L.koppen(dt, now);
        ledMat.color.copy(LS.kleur(PAL, 1)); ledMat.opacity = (0.3 + 0.6 * pu) * Math.min(1, s.niv);
        lampShow(L1, LS.kleur(PAL, 0), (0.5 + 0.8 * pu) * s.niv, s);
        lampShow(L2, LS.kleur(PAL, 1), (0.4 + 0.6 * s.mid) * s.niv, s);
        if (L2) L2.position.set(Math.sin(now * 0.5) * 3.5, 2.5, Math.cos(now * 0.5) * 3.5);
        uit.puls(b, s);
        L.eind(now, LS.kleur(PAL, 0), 0.01);
      },
      cam(t) {  // laag rond de dansers, de blik omhoog naar de bol met de pinspots en de koppen erachter
        const R2 = Math.min(w, d) / 2 - 1.6, a = t * 0.16;
        return kcam(t, Math.sin(a) * R2, 1.35 + 0.2 * Math.sin(t * 0.23), -Math.cos(a) * R2, 0, by * (0.62 + 0.12 * Math.sin(t * 0.11)), 0, 64);
      },
    };
  } });

  // ============ 4. Kaleidoscoop: wanden en plafond als ledscherm met een kaleidoscoop, een bloem van bundels uit het plafond, reuzenpaddenstoelen ============
  // ledscherm: ronde leds met zwarte voegen, de kaleidoscoop (zoals zaal 2) in de kleuren van het palet, lage basis: alleen de structuur licht op
  const LED_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
  const LED_FS = `uniform float uTijd, uNiv, uBas, uRing, uRingK, uPan; uniform vec2 uRep; uniform vec3 uA, uB, uC; varying vec2 vUv;
    void main() {
      vec2 px = floor(vUv * uRep) + 0.5, f = fract(vUv * uRep) - 0.5;
      float led = smoothstep(0.5, 0.3, length(f));
      vec2 p = (px / uRep - 0.5) * vec2(uRep.x / uRep.y, 1.0) * 2.2;
      float a = atan(p.y, p.x) + uTijd * 0.08, r = length(p);
      a = mod(a, 1.0472); a = abs(a - 0.5236);
      vec2 q = r * vec2(cos(a), sin(a)) + 0.15 * vec2(sin(uTijd * 0.13), cos(uTijd * 0.11));
      float v = 0.0;
      for (int i = 0; i < 5; i++) { q = abs(q) / dot(q, q) - 0.82 - 0.08 * sin(uTijd * 0.21 + float(i)); v += exp(-length(q) * 1.6); }
      float t = fract(v * 0.3 + uTijd * 0.05 + r * 0.15) * 3.0;
      vec3 c = t < 1.0 ? mix(uA, uB, t) : t < 2.0 ? mix(uB, uC, t - 1.0) : mix(uC, uA, t - 2.0);
      float ring = exp(-pow((r - uRing) * 4.0, 2.0)) * uRingK;  // ring die op elke tel vanuit het midden van de wand uitdijt
      float pan = uPan > 0.0 ? step(0.25, fract(vUv.x * uPan)) : 1.0;  // losse ledpanelen met zwart ertussen
      gl_FragColor = vec4(c * ((smoothstep(1.1, 2.4, v) * (0.5 + 0.7 * uBas) + ring) * led * pan * uNiv), 1.0);
    }`;
  DH.registreer('kaleidoscoop', { gewicht: 1, maak(ctx) {
    const r = () => ctx.rnd(), Z = ctx.zwaar, g = ctx.groep, K = kit();
    const w = Math.round(tussen(r, 12, 16)), d = Math.round(tussen(r, 12, 16)), h = +tussen(r, 5, 6.2).toFixed(2);
    const kcam = camHulp(ctx, d);
    const hues = [r(), r(), r()], kleurS = hues.map(x => '#' + new THREE.Color().setHSL(x, 1, 0.6).getHexString());
    const h0 = r(), PAL = [h0, h0 + 0.33, h0 + 0.62].map(x => new THREE.Color().setHSL(x % 1, 1, 0.5));
    // bloem: één armatuur midden in het plafond met NB bundels die rondgaan
    const NB = [8, 6, 4][Z], BRON = new THREE.Vector3(0, h - 0.3, 0);
    const L = lichtset(ctx, { extra: NB, lenzen: 1 });
    // ledschermen: zijwanden, voor/achter en plafond (pitch ~12 cm), gedeelde uniforms
    const U = { uTijd: { value: 0 }, uNiv: { value: 0.5 }, uBas: { value: 0 }, uRing: { value: 0 }, uRingK: { value: 0 }, uA: { value: PAL[0].clone() }, uB: { value: PAL[1].clone() }, uC: { value: PAL[2].clone() } };
    const PITCH = Z === 2 ? 0.2 : 0.12;
    const led = (bw, bh, pan) => new THREE.ShaderMaterial({ uniforms: Object.assign({ uRep: { value: new THREE.Vector2(Math.round(bw / PITCH), Math.round(bh / PITCH)) }, uPan: { value: pan ? Math.max(3, Math.round(bw / 1.7)) : 0 } }, U), vertexShader: LED_VS, fragmentShader: LED_FS, side: THREE.DoubleSide });
    const zij = led(d, h, true), kop = led(w, h, true);
    ctx.doos({ w, d, h, vloer: L.sp.mat(T(ctx, 512, 512, (c, cw, ch) => ringen(c, cw, ch, kleurS), 0), 0x9a9a9a), muur: [zij, zij, kop, kop], plafond: led(w, d, false) });
    const gloed = gloedTex(ctx);
    add(g, K.cyl, basic(0x0c0c10), [0, h - 0.15, 0], [0.35, 0.3, 0.35]);  // de bloem-armatuur
    // reuzenpaddenstoelen in de hoeken: hoed met stippen, gloeiende lamellen, gloed op de vloer
    const hoedGeo = new THREE.SphereGeometry(1, 20, 10, 0, TAU, 0, Math.PI / 2), steelGeo = new THREE.CylinderGeometry(0.7, 1, 1, 12), paddos = [];
    const hoeken = [[-1, -1], [1, -1], [-1, 1], [1, 1]].sort(() => r() - 0.5).slice(0, [4, 3, 2][Z]);
    for (const [hx, hz] of hoeken) {
      const H = tussen(r, 1.6, 3.2), cr = H * tussen(r, 0.45, 0.6), sr = cr * 0.22, hue = r();
      const x = hx * (w / 2 - cr - 0.3), z = hz * (d / 2 - cr - 0.5);
      add(g, steelGeo, basic(new THREE.Color().setHSL(hue, 0.3, 0.12)), [x, H / 2, z], [sr, H, sr]);
      const hoedMat = basic(0xffffff, { map: T(ctx, 256, 128, (c, cw, ch) => paddo(c, cw, ch, r, '#' + new THREE.Color().setHSL(hue, 0.9, 0.5).getHexString())) });
      add(g, hoedGeo, hoedMat, [x, H, z], [cr, cr * 0.6, cr]);
      const lamMat = gloei(new THREE.Color().setHSL(hue + 0.1, 0.8, 0.5), 0.8);
      add(g, K.disc, lamMat, [x, H - 0.01, z], [cr * 0.95, cr * 0.95, 1]).rotation.x = Math.PI / 2;  // lamellen: kijkt naar beneden
      const vlMat = metMap(gloei(new THREE.Color().setHSL(hue, 1, 0.5), 0.4), gloed);
      add(g, K.disc, vlMat, [x, 0.02, z], [cr * 1.8, cr * 1.8, 1]).rotation.x = -Math.PI / 2;
      paddos.push({ hoedMat, lamMat, vlMat, f: r() * TAU, x, z, cr });
    }
    // zwevende neonvormen boven hoofdhoogte
    const vormGeo = [new THREE.IcosahedronGeometry(0.5, 0), Z ? new THREE.TorusKnotGeometry(0.35, 0.1, 40, 6) : new THREE.TorusKnotGeometry(0.35, 0.1, 64, 8), new THREE.OctahedronGeometry(0.5, 0)];
    const vormen = [];
    for (let i = 0; i < [14, 9, 5][Z]; i++) {
      const kleur = new THREE.Color().setHSL(r(), 1, 0.55);
      const m = add(g, kies(r, vormGeo), basic(kleur, { wireframe: r() < 0.6 }), [tussen(r, -w / 2 + 1.2, w / 2 - 1.2), tussen(r, 3.6, Math.max(3.7, h - 0.6)), tussen(r, -d / 2 + 1.2, d / 2 - 1.2)]);
      m.userData.spin = tussen(r, -1, 1); m.userData.s = tussen(r, 0.4, 0.9); m.userData.y = m.position.y; m.userData.f = r() * TAU; m.userData.kleur = kleur.clone();
      vormen.push(m);
    }
    // golfringen over de vloer op de tel
    const ringGeo = new THREE.RingGeometry(0.95, 1, 64), golven = [];
    for (let k = 0; k < 3; k++) { const m = add(g, ringGeo, gloei(PAL[k], 0.6), [0, 0.03, 0]); m.rotation.x = -Math.PI / 2; golven.push(m); }
    // vuurvliegjes
    const nV = [60, 36, 18][Z], vlieg = deeltjes(g, nV, 0xfff2a0, 0.1, gloed, (p, i) => { p[i * 3] = tussen(r, -w / 2 + 1, w / 2 - 1); p[i * 3 + 1] = tussen(r, 0.5, h - 0.5); p[i * 3 + 2] = tussen(r, -d / 2 + 1, d / 2 - 1); });
    const vBasis = Float32Array.from(vlieg.geometry.attributes.position.array), vFase = Array.from({ length: nV }, () => r() * TAU);
    // dansers, soms alleen de vreemde figuren (aliens, tovenaars)
    const filt = r() < 0.4 ? /alien|wizard|witch/ : undefined;
    for (const [x, z] of plekken(r, [6, 4, 3][Z], w / 2 - 2, d / 2 - 2, 1.3, 1.4, (x, z) => paddos.every(p => Math.hypot(x - p.x, z - p.z) > p.cr + 0.6))) fig(ctx, { x, z, face: r() * TAU, rol: 'dans', filter: filt });
    const uit = uitgang(ctx, K, w, d, h, kies(r, ['TRIP', 'KOSMOS', 'ZWEEF', 'PSYCHE', 'WONDERLAND', 'DIEPER']), PAL[0]);
    const L1 = ctx.licht(PAL[0], 1.8, 14, -2, 3.5, -1), L2 = ctx.licht(PAL[1], 1.3, 14, 2, 3.5, 2);
    const maxR = Math.min(w, d) / 2 - 0.3, DIR = new THREE.Vector3(), E = new THREE.Vector3();
    let ph = r() * TAU;
    return {
      maat: { w, d, h },
      blijf: 13,
      update(dt, now) {
        const b = ctx.beat(), s = L.begin(), st = s.stand, pu = s.kick;
        // ledschermen: break bijna uit, opbouw loopt op, drop fel en kleuren per tel
        U.uTijd.value = now * (st === 'drop' ? 1.6 : st === 'opbouw' ? 1 + s.opb : 1);
        U.uNiv.value = st === 'break' ? 0.18 : st === 'opbouw' ? 0.25 + 0.5 * s.opb : st === 'drop' ? 0.65 + 0.3 * pu : 0.4 + 0.2 * pu;
        U.uBas.value = s.bas; U.uRing.value = s.fase * 2.6; U.uRingK.value = st === 'break' ? 0 : st === 'drop' ? 0.7 : st === 'opbouw' ? 0.2 + 0.5 * s.opb : 0.3;
        U.uA.value.copy(LS.kleur(PAL, 0)); U.uB.value.copy(LS.kleur(PAL, 1)); U.uC.value.copy(LS.kleur(PAL, 2));
        // bloem van bundels: groove draait en ademt per maat; break één bundel recht omlaag; opbouw sneller en smaller, looplicht;
        // drop wijd over het publiek, kleur per tel
        ph += s.dPos * Math.PI / 6 * s.tempo;
        for (let i = 0; i < NB; i++) {
          const a = ph + i * TAU / NB;
          let tilt = st === 'break' ? 0.05 : st === 'opbouw' ? 0.55 - 0.4 * s.opb : st === 'drop' ? 0.85 + 0.12 * Math.sin(s.pos * Math.PI) : 0.45 + 0.2 * Math.sin(s.pos * Math.PI / 4);
          DIR.set(Math.sin(tilt) * Math.cos(a), -Math.cos(tilt), Math.sin(tilt) * Math.sin(a));
          let k = st === 'break' ? (i === 0 ? 0.55 : 0) : st === 'opbouw' ? (s.opb < 0.7 ? (i === Math.floor(s.pos * 2) % NB ? 1 : 0.15) : 1) * (0.4 + 0.8 * s.opb)
            : st === 'drop' ? 1.1 + 0.6 * s.knal : 0.55 + 0.4 * (i % 2 ? pu : 1 - s.fase);
          let c = st === 'break' ? PAL[2] : LS.kleur(PAL, i);
          if (s.flits > 0.5) { c = LS.wit; k = Math.max(k, 1.3 * s.flits); }
          const len = LS.raak(BRON, DIR, w, d, h), rad = 0.05 + len * 0.05;
          L.bun.zet(i, BRON, DIR, len, rad, c, k);
          if (k > 0.02) { E.copy(BRON).addScaledVector(DIR, len); L.sp.zet(E.x, E.y, E.z, rad * 1.6 + 0.4, c, 0.6 * Math.min(1.3, k)); }
        }
        L.pun.zet(NB, BRON.x, BRON.y - 0.1, BRON.z, s.flits > 0.5 ? LS.wit : LS.kleur(PAL, 0), 1.5 + pu);
        for (const p of paddos) {
          p.hoedMat.color.setScalar((0.18 + 0.3 * pu + 0.05 * Math.sin(now * 1.3 + p.f)) * Math.max(0.5, s.niv));
          p.lamMat.opacity = (0.25 + 0.5 * s.mid) * Math.max(0.6, s.niv); p.vlMat.opacity = (0.12 + 0.25 * s.bas) * s.niv;
        }
        for (const m of vormen) {
          const u = m.userData; m.rotation.x += dt * u.spin * s.tempo; m.rotation.y += dt * 0.6 * u.spin * s.tempo;
          m.scale.setScalar(u.s * (1 + 0.35 * pu)); m.position.y = u.y + 0.25 * Math.sin(now * 0.5 + u.f);
          m.material.color.copy(u.kleur).multiplyScalar((0.25 + 0.5 * s.niv) * (0.7 + 0.5 * pu));
        }
        golven.forEach((m, k) => {
          const f = ((b.pos / 2 + k / 3) % 1 + 1) % 1;
          m.scale.setScalar(0.3 + f * maxR); m.material.opacity = st === 'break' ? 0 : (1 - f) * (0.25 + 0.6 * b.energy) * Math.min(1, s.niv);
        });
        const a = vlieg.geometry.attributes.position.array;
        for (let i = 0; i < nV; i++) {
          const f = vFase[i];
          a[i * 3] = vBasis[i * 3] + 0.4 * Math.sin(now * 0.3 + f); a[i * 3 + 1] = vBasis[i * 3 + 1] + 0.3 * Math.sin(now * 0.45 + f * 2); a[i * 3 + 2] = vBasis[i * 3 + 2] + 0.4 * Math.cos(now * 0.27 + f);
        }
        vlieg.geometry.attributes.position.needsUpdate = true;
        vlieg.material.size = 0.08 + 0.06 * b.hoog;
        lampShow(L1, LS.kleur(PAL, 0), (0.5 + 0.9 * pu) * s.niv, s);
        lampShow(L2, LS.kleur(PAL, 1), (0.4 + 0.6 * s.mid) * s.niv, s);
        uit.puls(b, s);
        L.eind(now, LS.kleur(PAL, 2), 0.012);
      },
      cam(t) {  // langzame spiraal laag rond het midden, de blik omhoog naar de bloem en de ledschermen
        const R = Math.min(w, d) / 2 - 3, a = t * 0.2, u = glad(klem(t / 20));
        return kcam(t, Math.sin(a) * R, 1.3 + 0.15 * u, -Math.cos(a) * R, 0, 1.9 + 1.0 * u, 0, 68);
      },
      opruimen() { ruimDeeltjes(g); },
    };
  } });

  // ============ 5. Laserkooi: zwarte zaal met een kooi, laserwaaiers die op de tel zwiepen, een lasertunnel in de break, laaghangende rook ============
  DH.registreer('laserkooi', { gewicht: 1, maak(ctx) {
    const r = () => ctx.rnd(), Z = ctx.zwaar, g = ctx.groep, K = kit();
    const LP = kies(r, [[0x22ff55, 0xff1840, 0x2a5cff], [0x00e5ff, 0xff2d95, 0x7a2cff], [0xb04dff, 0x7cff00, 0x00e5ff], [0x2a5cff, 0xffd400, 0xff1840], [0xff2d95, 0x00ffb0, 0x7a2cff]]).map(c => new THREE.Color(c));
    const w = Math.round(tussen(r, 10, 13)), d = Math.round(tussen(r, 12, 16)), h = +tussen(r, 4.6, 5.6).toFixed(2);
    const kcam = camHulp(ctx, d);
    // laserbronnen hoog aan de wanden; per bron een waaier stralen. Bron 0 zit boven de uitgang (de tunnel in de break)
    const plekB = [[0, d / 2 - 0.25], [-w / 2 + 0.25, -d / 2 + 0.25], [w / 2 - 0.25, d / 2 - 0.25], [w / 2 - 0.25, -d / 2 + 0.25], [-w / 2 + 0.25, d / 2 - 0.25], [-w / 2 + 0.25, 0], [w / 2 - 0.25, 0]];
    const nBron = [6, 4, 3][Z], perBron = [6, 4, 3][Z], NT = [16, 12, 8][Z], NL = Math.max(nBron * perBron, NT);
    const L = lichtset(ctx, { lenzen: nBron });
    const wandT = T(ctx, 512, 512, (c, cw, ch) => raster(c, cw, ch, 8, 'rgba(255,255,255,0.08)', '#08080b'));
    ctx.doos({ w, d, h,
      vloer: L.sp.mat(T(ctx, 512, 512, (c, cw, ch) => raster(c, cw, ch, 8, rgba(LP[0], 0.5), '#020203'), Math.round(w / 4), Math.round(d / 4)), new THREE.Color(1.8, 1.8, 1.8)),
      muur: wandShow(L.sp, wandT, w, d, 4, new THREE.Color(1.5, 1.5, 1.5)), plafond: L.sp.mat(null, 0x0c0c10) });
    // de kooi: staven rondom (open in het looppad) en een neon bovenrand
    const cw = w - 3.5, cd = d - 4, kooiH = Math.min(h - 0.6, 3.6), staven = [];
    for (let x = -cw / 2; x <= cw / 2 + 1e-6; x += 0.55) for (const z of [-cd / 2, cd / 2]) if (Math.abs(x) > 1.3) staven.push([x, z]);
    for (let z = -cd / 2 + 0.55; z < cd / 2 - 1e-6; z += 0.55) for (const x of [-cw / 2, cw / 2]) staven.push([x, z]);
    const kooi = new THREE.InstancedMesh(K.cyl, basic(0x0b0b0e), staven.length);  // donker staal: silhouetten tegen de lasers
    staven.forEach(([x, z], i) => { M4.compose(V3.set(x, kooiH / 2, z), Q.identity(), S3.set(0.018, kooiH, 0.018)); kooi.setMatrixAt(i, M4); });
    g.add(kooi);
    const randMat = gloei(LP[0], 0.8);
    for (const [x, z, sx, sz] of [[0, -cd / 2, cw, 0.05], [0, cd / 2, cw, 0.05], [-cw / 2, 0, 0.05, cd], [cw / 2, 0, 0.05, cd]]) add(g, K.box, randMat, [x, kooiH, z], [sx, 0.05, sz]);
    const lasers = LS.lijnen(g, NL, Z < 2, 6), bronnen = [];
    for (let i = 0; i < nBron; i++) {
      const [x, z] = plekB[i], p = new THREE.Vector3(x, h - 0.35, z);
      add(g, K.box, basic(0x111114), [x, h - 0.22, z], [0.3, 0.16, 0.3]);
      const d0 = new THREE.Vector3(-x, 1.2 - p.y, -z).normalize();
      bronnen.push({ p, yaw0: Math.atan2(d0.x, d0.z), pit0: Math.asin(d0.y), i });
    }
    const TUN = new THREE.Vector3(0, 2.6, d / 2 - 0.3);  // tunnel: vanaf de uitgang naar de camera
    const wolken = rook(ctx, g, [10, 6, 3][Z], -w / 2 + 2, w / 2 - 2, 0.4, 1.6, -d / 2 + 2, d / 2 - 2, 2.5, 4.5);
    // dansers in de kooi
    const n = [7, 4, 3][Z];
    plekken(r, n, cw / 2 - 0.6, cd / 2 - 0.6, 1.3, 1.3).forEach(([x, z], i) => fig(ctx, { x, z, face: r() * TAU, rol: Z === 0 && i === n - 1 ? 'juich' : 'dans' }));
    const uit = uitgang(ctx, K, w, d, h, kies(r, ['LASER', 'DE KOOI', 'CAGE', 'TECHNO', 'BEAM ME UP']), LP[0]);
    const L1 = ctx.licht(LP[0], 1.2, 12, 0, h - 0.8, 0);
    const huidig = new THREE.Color(), camKant = r() < 0.5 ? -1 : 1, cam = new THREE.Vector3();
    let t = r() * 8, tunA = 0, camT = -1;
    return {
      maat: { w, d, h },
      blijf: 13,
      update(dt, now) {
        const b = ctx.beat(), s = L.begin(), st = s.stand, pu = s.kick;
        t += s.dPos * s.tempo;  // eigen tel: in de opbouw en de drop lopen de patronen sneller
        const pat = Math.floor(s.pos / (st === 'drop' ? 4 : 8)) % 4;
        const paar = st === 'drop' ? (s.tel % 2 ? [LP[1], LP[0]] : [LP[0], LP[2]]) : Math.floor(s.pos / 8) % 2 ? [LP[1], LP[0]] : [LP[0], LP[1]];
        let master = st === 'break' ? 0 : st === 'opbouw' ? (0.3 + 0.7 * s.opb) * (s.opb > 0.75 && (s.pos * 4) % 1 > 0.5 ? 0.15 : 1)
          : st === 'drop' ? 1.15 * (s.k < 4 ? 0.45 + 0.55 * Math.exp(-s.fase * 5) : 0.8 + 0.3 * pu) : klem((s.en - 0.08) / 0.45, 0.25, 1) * (0.4 + 0.6 * pu);
        if (s.flits > 0.5) master = Math.max(master, 1.2 * s.flits);
        if (st === 'drop' && s.k < 4 && now - camT > 0.25) { LS.camLokaal(ctx, cam); camT = now; }
        let li = 0;
        if (st === 'break') {
          // lasertunnel: een draaiende kegel van lijnen vanaf de uitgang naar de camera
          tunA += dt * 0.35;
          for (let k = 0; k < NT; k++) {
            const a = tunA + k * TAU / NT, op = 0.16 + 0.03 * Math.sin(now * 0.7);
            DIR.set(Math.sin(op) * Math.cos(a), Math.sin(op) * Math.sin(a) - 0.04, -Math.cos(op)).normalize();
            lasers.zet(li++, TUN, DIR, LS.raak(TUN, DIR, w, d, h), LP[2], 0.55 + 0.15 * Math.sin(now * 2 + k), 0.012);
          }
          L.pun.zet(0, TUN.x, TUN.y, TUN.z, LP[2], 1.2);
          for (let i = 1; i < nBron; i++) L.pun.zet(i, 0, 0, 0, LP[2], 0);
        } else {
          for (const q of bronnen) {
            for (let k = 0; k < perBron; k++) {
              const f = perBron > 1 ? k / (perBron - 1) - 0.5 : 0;
              let yaw = q.yaw0, pit = q.pit0;
              if (st === 'drop' && s.k < 4) {  // de klap: alle waaiers op het publiek (de camera)
                DIR.subVectors(cam, q.p).normalize(); yaw = Math.atan2(DIR.x, DIR.z) + f * 0.5; pit = Math.asin(klem(DIR.y, -1, 1)) + 0.08 * Math.sin(k * 2.1);
              } else if (pat === 0) { yaw += 0.45 * Math.sin(t * Math.PI / 2 + q.i * 1.3) + f * (0.5 + 0.4 * Math.sin(t * Math.PI / 4)) * 1.6; pit += 0.12 * Math.sin(t * Math.PI + q.i); }
              else if (pat === 1) { yaw += (k % 2 ? 1 : -1) * 0.7 * Math.sin(t * Math.PI / 2); pit += f * 0.7; }
              else if (pat === 2) { const a = k / perBron * TAU + t * Math.PI / 4 * (q.i % 2 ? -1 : 1), R = 0.25 + 0.1 * pu; yaw += R * Math.cos(a) * 1.4; pit += R * Math.sin(a); }
              else { const tri = Math.abs((((t / 2 + q.i * 0.25) % 2) + 2) % 2 - 1); yaw += (tri * 2 - 1) * 0.9 * (q.i % 2 ? -1 : 1); pit += f * 0.8; }
              pit = klem(pit, -1.45, 0.3);
              DIR.set(Math.cos(pit) * Math.sin(yaw), Math.sin(pit), Math.cos(pit) * Math.cos(yaw));
              const col = s.flits > 0.5 ? LS.wit : paar[(k + q.i) % 2];
              lasers.zet(li++, q.p, DIR, LS.raak(q.p, DIR, w, d, h), col, Math.min(1.6, master), 0.012);
            }
            const c = paar[q.i % 2];
            L.pun.zet(q.i, q.p.x, q.p.y, q.p.z, c, 0.4 + 1.2 * master);
            L.sp.zet(q.p.x, q.p.y, q.p.z, 1.1, c, 0.35 * master);
          }
        }
        for (; li < NL; li++) lasers.uit(li);
        lasers.klaar();
        huidig.copy(st === 'break' ? LP[2] : paar[0]);
        L.sp.zet(0, 0, 0, Math.max(cw, cd) * 0.55, huidig, (st === 'break' ? 0.03 : 0.06 + 0.1 * master * pu) * Math.min(1.2, s.niv));
        randMat.color.copy(huidig); randMat.opacity = (0.25 + 0.6 * pu) * Math.min(1, s.niv);
        rookDrijf(wolken, dt, huidig, (st === 'break' ? 0.08 : 0.1 + 0.2 * master * pu) + 0.3 * s.flits);
        lampShow(L1, huidig, 0.3 + 1.2 * master * pu, s);
        uit.puls(b, s);
        L.eind(now, huidig, 0.01);
      },
      cam(t) {  // voor de kooi, naast het looppad: door de staven naar de bronnen aan de overkant, de waaiers komen op je af
        const u = glad(klem(t / 18)), x = camKant * (1.9 + (w / 2 - 3) * (0.5 + 0.5 * Math.sin(t * 0.2)));
        return kcam(t, x, 1.2 + u * 0.5, -d / 2 + 0.7, -x * 0.3, 2.3, 2, 66);
      },
      opruimen() { ruimDeeltjes(g); },
    };
  } });

  // ============ 6. Rokerslounge: donker en warm; lichtkegels van hanglampjes door de rook, open haard, wandwassers en één trage bundel ============
  DH.registreer('rokerslounge', { gewicht: 0.9, maak(ctx) {
    const r = () => ctx.rnd(), Z = ctx.zwaar, g = ctx.groep, K = kit();
    const [WA, WB, LEER, WARM, ACC] = kies(r, [['#1d2a1c', '#3c5a34', 0x2a1408, 0xffa040, 0xff2a6a], ['#2a0f14', '#5a1e2a', 0x1a0c08, 0xff8a3c, 0x8a2cff], ['#101a2a', '#2a4060', 0x24140a, 0xffb060, 0x00c8ff], ['#20140a', '#4a3018', 0x301a0c, 0xff9a50, 0xff1f3d]]);
    const kW = new THREE.Color(WARM), kAcc = new THREE.Color(ACC), PAL = [kAcc, kW, new THREE.Color(ACC).lerp(new THREE.Color(0x3a00ff), 0.5)];
    const w = Math.round(tussen(r, 11, 14)), d = Math.round(tussen(r, 12, 15)), h = +tussen(r, 3.8, 4.4).toFixed(2);
    const kcam = camHulp(ctx, d);
    // tafels (met hanglamp) langs de zijwanden; één trage bundel uit een hoek door de rook
    const tafels = [];
    for (const s of [-1, 1]) for (const z of [-d / 4, d / 4]) tafels.push([s * (w / 2 - 2.05), z, s]);
    const kant = r() < 0.5 ? -1 : 1;  // kant van de open haard; de camera staat aan de overkant, de trage bundel ook (schijnt door het beeld)
    const L = lichtset(ctx, { koppen: [[-kant * (w / 2 - 0.5), h - 0.2, d / 2 - 0.6]], extra: tafels.length, lenzen: 0, sterk: 0.6,
      rig: { maat: { w, d, h }, pal: PAL, focus: { x: 0, y: 1, z: 0 }, spreid: 0.035, vlek: 0.5, sterk: 0.9, patronen: ['zwaai', 'midden', 'cirkel'] } });
    const behT = T(ctx, 512, 512, (c, cw, ch) => behang(c, cw, ch, r, WA, WB));
    ctx.doos({ w, d, h,
      vloer: L.sp.mat(T(ctx, 512, 512, (c, cw, ch) => planken(c, cw, ch, r), Math.round(w / 3), Math.round(d / 3)), new THREE.Color(1.6, 1.5, 1.4)),
      muur: wandShow(L.sp, behT, w, d, 2.6, new THREE.Color(1.5, 1.45, 1.35)), plafond: dubbel(basic(0x0a0705)) });
    const gloed = gloedTex(ctx), hout = basic(0x100a05);
    const balken = []; for (let z = -d / 2 + 1.5; z < d / 2 - 1; z += 2.2) balken.push([0, h - 0.12, z, w, 0.24, 0.3]);
    veel(g, K.box, hout, balken);  // balken
    // kleed in het midden (ook een showvlak: alleen zichtbaar waar licht valt)
    add(g, K.plane, L.sp.mat(T(ctx, 512, 256, (c, cw, ch) => tapijt(c, cw, ch, r, '#4a1410', '#9a7434', '#16203a'), 0), new THREE.Color(1.4, 1.4, 1.4)), [0, 0.008, 0], [d * 0.5, w * 0.4, 1]).rotation.set(-Math.PI / 2, 0, Math.PI / 2);
    // leren banken langs de zijwanden met een laag tafeltje ervoor (asbak, glazen)
    const leer = lam(LEER, { emissive: new THREE.Color(LEER).multiplyScalar(0.12) }), tafelMat = basic(0x120a06), asMat = gloei(0xff5a1a, 0.9);
    let zit = []; const bankDelen = [], tafelDelen = [], asDelen = [], gloedDelen = [], glazen = [];  // per soort één draw call
    for (const [tx, z, s] of tafels) {
      zit = zit.concat(bank(g, K, leer, s * (w / 2 - 0.85), z, -s * Math.PI / 2, 2.4, 2, bankDelen));
      tafelDelen.push([tx, 0.42, z, 0.45, 0.04, 0.45], [tx, 0.2, z, 0.06, 0.4, 0.06]);
      if (Z < 2) { asDelen.push([tx, 0.46, z + 0.15, 0.07, 0.03, 0.07]); gloedDelen.push([tx, 0.48, z + 0.15, 0.012, 0.012, 0.012]); }  // asbak
      if (Z < 2) for (const dz of [-0.15, 0.05]) glazen.push([tx + tussen(r, -0.2, 0.2), 0.5, z + dz, 0.03, 0.08, 0.03]);  // glazen
    }
    veelM(g, K.box, leer, bankDelen); veel(g, K.cyl, tafelMat, tafelDelen);
    if (asDelen.length) { veel(g, K.cyl, basic(0x111111), asDelen); veel(g, K.sph, asMat, gloedDelen); }
    if (glazen.length) { const gl = veel(g, K.cyl, basic(0xffffff), glazen); glazen.forEach((_, i) => gl.setColorAt(i, C3.setHSL(r(), 0.9, 0.4))); }
    zit.sort(() => r() - 0.5);
    for (const [x, z, f] of zit.slice(0, [5, 3, 2][Z])) fig(ctx, { x, z, face: f, rol: 'zit' });
    // groepjes staan te kletsen (en te roken) bij de uitgang
    for (const s of (Z ? [1] : [-1, 1])) {
      const gx = s * (w / 2 - 3.4), gz = d / 2 - 2.2;
      fig(ctx, { x: gx - 0.45, z: gz, face: Math.PI / 2, rol: 'staan' }); fig(ctx, { x: gx + 0.45, z: gz, face: -Math.PI / 2, rol: 'staan' });
    }
    // open haard aan één zijwand, tussen de banken
    const fx = kant * (w / 2 - 0.3), haard = basic(0x0c0a08);
    // open stookruimte: zwarte achterwand en vloer, wangen en een latei; de vlammen staan erin (een dichte doos verborg ze)
    add(g, K.box, basic(0x050403), [fx + kant * 0.2, 0.55, 0], [0.1, 1.1, 1.4]);
    add(g, K.box, basic(0x0a0806), [fx, 0.05, 0], [0.6, 0.1, 1.4]);
    add(g, K.box, haard, [fx, 1.1, 0], [0.6, 0.2, 1.4]);
    for (const dz of [-0.85, 0.85]) add(g, K.box, haard, [fx, 0.6, dz], [0.6, 1.2, 0.3]);
    add(g, K.box, haard, [fx - kant * 0.05, 1.27, 0], [0.75, 0.14, 2.1]);
    const vlamT = T(ctx, 128, 256, vlam, 0), vlammen = [];
    for (const dz of [-0.24, 0.24]) { const blok = add(g, K.cyl, basic(0x1e0f06), [fx - kant * 0.02, 0.17, dz * 0.4], [0.06, 1.0, 0.06]); blok.rotation.set(Math.PI / 2, dz * 0.6, 0); }  // houtblokken
    for (const [dz, bw, bh] of [[-0.38, 0.3, 0.45], [-0.18, 0.38, 0.7], [0, 0.42, 0.85], [0.2, 0.36, 0.65], [0.38, 0.28, 0.42]]) {  // vlammen die elkaar overlappen
      const m = add(g, K.plane, metMap(gloei(0xffffff, 0.9), vlamT), [fx - kant * 0.05, 0.15 + bh / 2, dz], [bw, bh, 1]);
      m.rotation.y = -kant * Math.PI / 2; vlammen.push({ m, f: r() * TAU, bw, bh });
    }
    // hanglampjes boven de tafels, elk met een lichtkegel door de rook
    const peer = basic(0xffd9a0), kap = basic(0x15100c, { side: THREE.DoubleSide });
    const kapGeo = new THREE.ConeGeometry(0.22, 0.2, 14, 1, true), lampY = h - 1.3, lampen = [];
    const snoer = [], kappen = [], peren = [];
    for (const [tx, tz] of tafels) {
      snoer.push([tx, (h + lampY) / 2, tz, 0.006, h - lampY, 0.006]); kappen.push([tx, lampY, tz, 1, 1, 1]); peren.push([tx, lampY - 0.08, tz, 0.05, 0.05, 0.05]);
      lampen.push(new THREE.Vector3(tx, lampY - 0.1, tz));
    }
    veel(g, K.cyl, basic(0x111111), snoer); veel(g, kapGeo, kap, kappen); veel(g, K.sph, peer, peren);
    const lampGloed = LS.punten(g, lampen.length, 0.7, gloed);
    lampen.forEach((p, i) => lampGloed.plek(i, p.x, p.y, p.z));
    // rooklaag op hoofdhoogte
    const wolken = rook(ctx, g, [14, 8, 4][Z], -w / 2 + 1.5, w / 2 - 1.5, 2.0, h - 0.6, -d / 2 + 1.5, d / 2 - 1.5, 3, 5);
    const rookKleur = new THREE.Color(0.9, 0.7, 0.5), NEER = new THREE.Vector3(0, -1, 0), C = new THREE.Color();
    const uit = uitgang(ctx, K, w, d, h, kies(r, ['SMOKING ROOM', 'LOUNGE', 'ROOKHOK', 'CIGAR CLUB', 'HAZE']), WARM);
    const L1 = ctx.licht(WARM, 1.4, 9, fx - kant * 1.0, 1.0, 0), L2 = ctx.licht(ACC, 0.8, 10, 0, h - 0.6, 0);
    const camKant = -kant;  // camera aan de overkant van de haard: de vlammen komen in beeld (stond hij aan dezelfde kant, dan keek hij er altijd van weg)
    return {
      maat: { w, d, h },
      blijf: 12,
      update(dt, now) {
        const b = ctx.beat(), s = L.begin(), st = s.stand, pu = s.kick;
        const flak = 0.85 + 0.15 * Math.sin(now * 8.1) * Math.sin(now * 3.7);
        // vuur: gloed op de vloer en de wand eromheen
        L.sp.zet(fx - kant * 0.9, 0, 0, 2.4, kW, 0.7 * flak);
        L.sp.zet(fx, 1.3, 0, 1.8, kW, 0.35 * flak);
        // hanglampen: kegels door de rook, poelen op de tafels; ademen zacht op de bas, in de drop op de tel
        const lk = st === 'break' ? 0.35 : st === 'drop' ? 0.65 + 0.35 * pu : 0.5 + 0.12 * s.bas + (st === 'opbouw' ? 0.2 * s.opb : 0);
        lampen.forEach((p, i) => {
          L.bun.zet(L.nK + i, p, NEER, p.y - 0.45, 0.75, kW, lk * 0.8);
          L.sp.zet(p.x, 0.45, p.z, 1.3, kW, lk);
        });
        // wandwassers achter de banken in de accentkleur: om de maat links/rechts, in de drop op de tel
        const kant2 = Math.floor(s.pos / (st === 'drop' ? 1 : 4)) % 2 ? 1 : -1;
        const wk = st === 'break' ? 0.15 : st === 'drop' ? 0.75 + 0.3 * pu : (0.45 + 0.25 * pu) * s.niv;
        C.copy(LS.kleur(PAL, 0));
        for (const z of [-d / 4, d / 4]) L.sp.zet(kant * (w / 2 - 0.05), 1.9, z, 2.3, C, st === 'drop' || (z > 0) === (kant2 > 0) ? wk : wk * 0.25);  // op de haardwand (in beeld), om de maat links/rechts
        L.koppen(dt, now);  // de trage bundel door de rook
        for (const v of vlammen) { const k = 0.85 + 0.15 * Math.sin(now * 9 + v.f) * Math.sin(now * 5.3 + v.f * 2), hh = v.bh * k + 0.06 * b.bas; v.m.scale.set(v.bw * (2 - k), hh, 1); v.m.position.y = 0.15 + hh / 2; v.m.material.opacity = 0.7 + 0.3 * k; }
        if (L1) L1.intensity = 1.1 * flak;
        for (let i = 0; i < lampen.length; i++) lampGloed.kleur(i, kW, 0.45 + 0.25 * lk);
        lampGloed.klaar();
        rookDrijf(wolken, dt, rookKleur, (0.055 + 0.03 * b.bas) * (0.6 + 0.4 * s.niv) + 0.12 * s.flits);
        lampShow(L2, C, (0.25 + 0.4 * pu) * s.niv, s);
        uit.puls(b, s);
        L.eind(now, kW, 0.008, kW, s.flits * 0.1);  // geen harde strobe in de lounge: een zachte warme flits
      },
      cam(t) {  // door de rook op ooghoogte, naast het looppad, met de blik op de haard en de lampkegels aan de overkant
        const u = glad(klem(t / 20)), x = camKant * (w / 2 - 3.3 + 0.3 * Math.sin(t * 0.3)), z = -d / 2 + 2 + u * (d / 2 - 0.5);
        return kcam(t, x, 1.3, z, -camKant * (w / 2 - 1), 1.35, z + 2.5, 58);
      },
      opruimen() { ruimDeeltjes(g); },
    };
  } });

  // ============ 7. Graffitigang: donkere steeg; scanners vegen over de graffiti (alleen te zien waar het licht valt), neon, strobe aan het eind ============
  DH.registreer('graffitigang', { gewicht: 1, maak(ctx) {
    const r = () => ctx.rnd(), Z = ctx.zwaar, g = ctx.groep, K = kit();
    const w = Math.round(tussen(r, 5, 7)), d = Math.round(tussen(r, 18, 24)), h = +tussen(r, 4, 4.8).toFixed(2);
    const NEO = kies(r, [[0xff2d95, 0x00e5ff], [0xffe600, 0xff3d00], [0x7cff00, 0xb967ff], [0x00ffb0, 0xff1744]]);
    const PAL = [NEO[0], NEO[1], kies(r, [0x7a2cff, 0x2a5cff, 0xff00aa])].map(c => new THREE.Color(c));
    const kcam = camHulp(ctx, d);
    // scanners onder het plafond, om en om links en rechts van het midden, verdeeld over de lengte
    const nS = [5, 4, 2][Z], kopPlek = [];
    for (let i = 0; i < nS; i++) kopPlek.push([(i % 2 ? 1 : -1) * 0.7, h - 0.2, -d / 2 + 2.5 + i * (d - 5) / Math.max(1, nS - 1)]);
    const L = lichtset(ctx, { koppen: kopPlek, rig: { maat: { w, d, h }, pal: PAL, focus: { x: 0, y: 1.5, z: d / 4 }, spreid: 0.09, vlek: 0.75, patronen: ['kruis', 'zwaai', 'waaier', 'publiek'] } });
    const steen = T(ctx, 512, 512, (c, cw, ch) => baksteen(c, cw, ch, r, 0x3a2a26, '#151212'));
    ctx.doos({ w, d, h,
      vloer: L.sp.mat(T(ctx, 512, 512, (c, cw, ch) => asfalt(c, cw, ch, r), 1, Math.max(1, Math.round(d / w))), new THREE.Color(1.6, 1.6, 1.6)),
      muur: wandShow(L.sp, steen, w, d, 3, new THREE.Color(1.4, 1.4, 1.4)), plafond: dubbel(basic(0x060608)) });
    const gloed = gloedTex(ctx);
    // graffiti op beide zijwanden (vlak tegen de muur, leesbaar van binnen); in het donker, alleen waar een scanner of neon valt
    const gi = Math.floor(r() * 3);
    for (const s of [-1, 1]) {
      const gv = graffitiVlak(gi + (s > 0 ? 1 : 0), Math.max(1, Math.round(d / (h * 2.2))), Z);
      const m = add(g, gv.geo || K.plane, L.sp.mat(gv.map, new THREE.Color(1.5, 1.45, 1.4)), [s * (w / 2 - 0.03), h / 2, 0], [d - 0.1, h - 0.05, 1]);
      m.rotation.y = -s * Math.PI / 2;
    }
    // tl-buizen aan het plafond, een paar zijn kapot en flikkeren (in de kleuren van de steeg)
    const buizen = [];
    for (let z = -d / 2 + 2; z < d / 2 - 1; z += 4) buizen.push({ m: add(g, K.box, basic(0xd8f0ff), [kies(r, [-1.2, 1.2]), h - 0.08, z], [0.06, 0.04, 1.5]), kapot: r() < 0.35, f: r() * 10, k: Math.floor(r() * 3) });
    // kleine neonbordjes op de muren
    const teksten = ['GO DEEPER', 'NO EXIT', 'THIS WAY', '24/7', 'RAVE', 'NIET ROKEN', 'BASS', 'LOST?'].sort(() => r() - 0.5);
    for (let i = 0; i < [3, 2, 1][Z]; i++) {
      const s = i % 2 ? 1 : -1, bord = ctx.neon(teksten[i], hex(NEO[i % 2]), 1.6, 0.4);
      bord.position.set(s * (w / 2 - 0.08), tussen(r, 2.7, Math.min(3.4, h - 0.5)), tussen(r, -d / 2 + 2, d / 2 - 2)); bord.rotation.y = -s * Math.PI / 2;
    }
    // mensen langs de muren, om en om links en rechts (eerst: de rommel zoekt daarna een vrij plekje)
    const bezet = [];  // [kant, z]
    for (let i = 0, z = -d / 2 + 2.5; z < d / 2 - 2 && i < [8, 5, 4][Z]; z += 2.4, i++) {
      const s = i % 2 ? 1 : -1, x = s * (w / 2 - 0.9), zz = z + tussen(r, -0.4, 0.4);
      fig(ctx, { x, z: zz, face: -s * Math.PI / 2 + tussen(r, -0.6, 0.6), rol: r() < 0.25 ? 'staan' : 'dans' });
      bezet.push([s, zz]);
    }
    const vrijeZ = s => { for (let k = 0; k < 30; k++) { const z = tussen(r, -d / 2 + 1.5, d / 2 - 1.5); if (bezet.every(([bs, bz]) => bs !== s || Math.abs(bz - z) > 0.9)) { bezet.push([s, z]); return z; } } return null; };
    // rommel langs de muren: vuilnisbakken, kratten, pionnen
    const bak = lam(0x1a241a, { emissive: 0x020402 }), krat = lam(0x3a2410, { emissive: 0x060302 }), pion = basic(0x6a2a06), streep = basic(0x555555);
    for (let i = 0; i < [6, 4, 3][Z]; i++) {
      const s = r() < 0.5 ? -1 : 1, x = s * (w / 2 - 0.4), z = vrijeZ(s), soort = Math.floor(r() * 3);
      if (z === null) continue;
      if (soort === 0) add(g, K.cyl, bak, [x, 0.45, z], [0.3, 0.9, 0.3]);
      else if (soort === 1) { add(g, K.box, krat, [x, 0.22, z], [0.5, 0.44, 0.5]); if (r() < 0.5) add(g, K.box, krat, [x, 0.66, z + 0.05], [0.5, 0.44, 0.5]).rotation.y = 0.3; }
      else { add(g, K.cone, pion, [x, 0.3, z], [0.16, 0.6, 0.16]); add(g, K.cyl, streep, [x, 0.33, z], [0.1, 0.08, 0.1]); }
    }
    // boombox op een krat, deint op de bas
    const bs = r() < 0.5 ? -1 : 1, bz0 = vrijeZ(bs), bz = bz0 === null ? 0 : bz0, box = new THREE.Group(); box.position.set(bs * (w / 2 - 0.45), 0.44, bz); box.rotation.y = -bs * Math.PI / 2; g.add(box);
    add(g, K.box, krat, [bs * (w / 2 - 0.45), 0.22, bz], [0.5, 0.44, 0.5]);
    add(box, K.box, basic(0x1a1a1e), [0, 0.15, 0], [0.62, 0.3, 0.18]);
    const speakerMat = gloei(NEO[0], 0.8);
    for (const sx of [-0.18, 0.18]) add(box, K.disc, speakerMat, [sx, 0.15, 0.095], [0.09, 0.09, 1]);
    // plassen die het neon weerkaatsen
    const plasMats = [];
    for (let i = 0; i < [5, 3, 2][Z]; i++) {
      const m = metMap(gloei(NEO[i % 2], 0.25), gloed); plasMats.push(m);
      add(g, K.disc, m, [tussen(r, -w / 2 + 1, w / 2 - 1), 0.012, tussen(r, -d / 2 + 1, d / 2 - 1)], [tussen(r, 0.6, 1.3), tussen(r, 0.4, 0.9), 1]).rotation.x = -Math.PI / 2;
    }
    // strobe-balk boven de uitgang aan het eind van de steeg
    const strobeMat = basic(0x000000);
    add(g, K.box, strobeMat, [0, Math.min(h - 0.25, 3.95), d / 2 - 0.1], [1.6, 0.14, 0.06]);
    const uit = uitgang(ctx, K, w, d, h, kies(r, ['ALLEY', 'DE STEEG', 'BACKSTREET', 'UNDERGROUND', 'DE GANG']), NEO[0]);
    const L1 = ctx.licht(NEO[0], 1.0, 10, 0, h - 0.4, -d / 4), L2 = ctx.licht(NEO[1], 1.2, 10, 0, 2.5, d / 4);
    const camKant = r() < 0.5 ? -1 : 1;
    return {
      maat: { w, d, h },
      blijf: 11,
      update(dt, now) {
        const b = ctx.beat(), s = L.begin(), st = s.stand, pu = s.kick;
        // neon langs de muren geeft een zachte gekleurde gloed op de graffiti eromheen
        L.sp.zet(-(w / 2), 3.0, -d / 4, 2.2, PAL[0], (0.12 + 0.1 * pu) * Math.max(0.5, s.niv));
        L.sp.zet(w / 2, 3.0, d / 5, 2.2, PAL[1], (0.12 + 0.1 * pu) * Math.max(0.5, s.niv));
        L.koppen(dt, now);
        for (const q of buizen) {
          const aan = q.kapot ? (Math.sin(now * 23 + q.f) > 0.3 || Math.random() < 0.08) : 1;
          const k = (st === 'break' ? 0.25 : 0.5 + 0.3 * (q.k === s.tel % 3 ? pu : 0)) * (aan ? 1 : 0.05);
          q.m.material.color.copy(q.kapot ? WIT : PAL[q.k]).multiplyScalar(k);
        }
        strobeMat.color.setScalar(Math.min(1, s.flits * 1.2 + (st === 'opbouw' ? 0.15 * s.opb * pu : 0)));
        box.scale.setScalar(1 + 0.08 * b.bas); speakerMat.opacity = (0.3 + 0.6 * pu) * Math.min(1, s.niv);
        for (const m of plasMats) m.opacity = (0.12 + 0.2 * pu) * Math.min(1, s.niv);
        lampShow(L1, LS.kleur(PAL, 0), (0.3 + 0.6 * pu) * s.niv, s);
        lampShow(L2, LS.kleur(PAL, 1), (0.4 + 0.8 * pu) * s.niv, s);
        uit.puls(b, s);
        L.eind(now, LS.kleur(PAL, 0), 0.01);
      },
      cam(t) {  // boven de hoofden, iets uit het midden, de steeg in naar de uitgang: de scanners vegen langs de muren
        const u = glad(klem(t / 16)), z = -d / 2 + 1.6 + u * d * 0.4;
        return kcam(t, camKant * Math.min(1.0, w / 2 - 1.6), 2.45 + 0.1 * Math.sin(t * 0.4), z, -camKant * 0.3, 1.7, z + 7, 64);
      },
      opruimen() { ruimDeeltjes(g); },
    };
  } });

  // ============ 8. Barkamer: donkere kroeg; een flessenwand van achteren verlicht met een looplicht op de tel, ledstrips, lampkegels op de toog ============
  DH.registreer('barkamer', { gewicht: 0.9, maak(ctx) {
    const r = () => ctx.rnd(), Z = ctx.zwaar, g = ctx.groep, K = kit();
    const [LED, WARM, DERDE] = kies(r, [[0xff2d95, 0xffa860, 0x7a2cff], [0x00e5ff, 0xffb347, 0x2a5cff], [0xb967ff, 0xff8a3c, 0xff2d95], [0x7cff00, 0xffc070, 0x00e5ff]]);
    const kLED = new THREE.Color(LED), kW = new THREE.Color(WARM), PAL = [kLED, new THREE.Color(DERDE), kW];
    const w = Math.round(tussen(r, 12, 15)), d = Math.round(tussen(r, 12, 15)), h = +tussen(r, 4.2, 5).toFixed(2);
    const kcam = camHulp(ctx, d);
    const s = r() < 0.5 ? -1 : 1;  // kant van de bar
    const Lb = Math.min(d - 4.5, 8.5), bx = s * (w / 2 - 1.6), lampZ = [-Lb / 3, 0, Lb / 3];
    // twee moving heads aan de overkant: trage accenten over de zaal (in de drop meer)
    const L = lichtset(ctx, { koppen: Z === 2 ? [] : [[-s * (w / 2 - 0.6), h - 0.2, -d / 2 + 0.8], [-s * (w / 2 - 0.6), h - 0.2, d / 2 - 0.8]], extra: lampZ.length,
      rig: { maat: { w, d, h }, pal: PAL, focus: { x: -s * (w / 2 - 2.4), y: 1, z: 0 }, spreid: 0.04, sterk: 0.7, patronen: ['zwaai', 'cirkel', 'kruis'] } });
    const steen = T(ctx, 512, 512, (c, cw, ch) => baksteen(c, cw, ch, r, 0x6a3020, '#1e1410'));
    ctx.doos({ w, d, h,
      vloer: L.sp.mat(T(ctx, 512, 512, (c, cw, ch) => dambord(c, cw, ch, '#141414', '#7a7670', 8), Math.round(w / 4), Math.round(d / 4)), 0xffffff),
      muur: wandShow(L.sp, steen, w, d, 3, new THREE.Color(1.3, 1.25, 1.2)), plafond: dubbel(basic(0x070605)) });
    const gloed = gloedTex(ctx);
    // toog (blad op 1,01 m zoals de bar van de club), ledstrips aan de voorkant (looplicht)
    add(g, K.box, lam(0x1a0e08, { emissive: 0x040201 }), [bx, 0.475, 0], [0.6, 0.95, Lb]);
    add(g, K.box, new THREE.MeshPhongMaterial({ color: 0x15100c, emissive: 0x020101, shininess: 120, specular: 0x777777 }), [bx, 0.98, 0], [0.78, 0.06, Lb + 0.1]);
    const NSTRIP = [16, 12, 8][Z], strip = LS.lijnen(g, NSTRIP * 2, Z < 2, 4, 0.05), ZAS2 = new THREE.Vector3(0, 0, 1), SP = new THREE.Vector3();
    // achterwand: donkere spiegel, drie planken met flessen die van achteren oplichten
    const ax = s * (w / 2 - 0.2);
    add(g, K.plane, basic(0x07080c), [s * (w / 2 - 0.04), 1.85, 0], [Lb * 0.95, 1.6, 1]).rotation.y = -s * Math.PI / 2;
    const plankMat = basic(0x140c06), plankLed = gloei(WARM, 0.8), nb = Math.floor(Lb * 0.9 / 0.18), plankY = [1.3, 1.75, 2.2];
    const flessen = new THREE.InstancedMesh(K.cyl, basic(0xffffff), nb * 3), FK = [0x3fbf38, 0xd08a2a, 0x3a7aff, 0xe8e8ff, 0xff3f6a, 0xffd23f], fles = [];
    plankY.forEach((y, j) => {
      add(g, K.box, plankMat, [ax, y, 0], [0.3, 0.03, Lb * 0.9]);
      add(g, K.box, plankLed, [ax - s * 0.14, y - 0.025, 0], [0.02, 0.015, Lb * 0.9]);
      for (let k = 0; k < nb; k++) {
        const fh = tussen(r, 0.24, 0.34), z = -Lb * 0.45 + 0.09 + k * 0.18;
        M4.compose(V3.set(ax + tussen(r, -0.05, 0.05), y + 0.015 + fh / 2, z), Q.identity(), S3.set(0.035, fh, 0.035));
        flessen.setMatrixAt(j * nb + k, M4); const c = new THREE.Color(kies(r, FK)); flessen.setColorAt(j * nb + k, C3.copy(c).multiplyScalar(0.3));
        fles.push({ c, z, j });
      }
    });
    g.add(flessen);
    // krukken voor de toog, gasten staan ertussen met het gezicht naar de bar
    const krukMat = lam(0x3a0e0e, { emissive: 0x060101 }), poot = basic(0x09090b), kruk = [];
    const zitten = [], poten = [];  // alle krukken in twee draw calls
    for (let z = -Lb / 2 + 0.6; z < Lb / 2 - 0.3; z += 1.3) {  // 1,3 m: een gast tussen twee krukken houdt zijn benen vrij (bij 1,0 m stonden brede figuren in een kruk)
      const kx = s * (w / 2 - 2.25);
      zitten.push([kx, 0.76, z, 0.2, 0.06, 0.2]); poten.push([kx, 0.37, z, 0.03, 0.74, 0.03], [kx, 0.02, z, 0.18, 0.03, 0.18]);
      kruk.push(z);
    }
    veel(g, K.cyl, krukMat, zitten); veel(g, K.cyl, poot, poten);
    kruk.sort(() => r() - 0.5);
    for (const z of kruk.filter(z => z + 0.65 < Lb / 2 - 0.2).slice(0, [3, 2, 1][Z])) fig(ctx, { x: s * (w / 2 - 2.35), z: z + 0.65, face: s * Math.PI / 2, rol: 'staan' });
    fig(ctx, { x: s * (w / 2 - 0.85), z: tussen(r, -Lb / 3, Lb / 3), face: -s * Math.PI / 2, rol: 'staan' });  // de barman
    // statafels aan de overkant met groepjes
    const tafelMat = basic(0x07070a), drankMat = gloei(LED, 0.9);
    const tafels = Z === 2 ? [[-s * (w / 2 - 2.4), -d / 5]] : [[-s * (w / 2 - 2.4), -d / 5], [-s * (w / 2 - 2.4), d / 5]];
    tafels.forEach(([tx, tz], j) => {
      add(g, K.cyl, tafelMat, [tx, 1.05, tz], [0.4, 0.04, 0.4]); add(g, K.cyl, tafelMat, [tx, 0.52, tz], [0.04, 1.04, 0.04]); add(g, K.cyl, tafelMat, [tx, 0.02, tz], [0.25, 0.03, 0.25]);
      for (const dz of [-0.1, 0.12]) add(g, K.cyl, drankMat, [tx + tussen(r, -0.15, 0.15), 1.12, tz + dz], [0.03, 0.09, 0.03]);
      const per = Z ? 1 : 2;
      for (let k = 0; k < per + (j === 0 && Z < 2 ? 1 : 0); k++) {
        const a = k / 3 * TAU + tussen(r, -0.3, 0.3), px = tx + Math.cos(a) * 0.65, pz = tz + Math.sin(a) * 0.65;
        if (Math.abs(px) < 1.3) continue;
        fig(ctx, { x: px, z: pz, face: Math.atan2(tx - px, tz - pz), rol: Z === 0 && j === 1 && k === 0 ? 'juich' : 'staan' });
      }
    });
    // hanglampen boven de toog met een lichtkegel op het blad
    const peer = basic(0xffe0b0);
    veel(g, K.cyl, basic(0x111111), lampZ.map(z => [bx, (h + 2.3) / 2, z, 0.006, h - 2.3, 0.006]));
    veel(g, K.sph, peer, lampZ.map(z => [bx, 2.25, z, 0.06, 0.07, 0.06]));
    const lampGloed = LS.punten(g, lampZ.length, 0.8, gloed);
    lampZ.forEach((z, i) => lampGloed.plek(i, bx, 2.25, z));
    const barBord = ctx.neon('BAR', hex(LED), 2.4, 0.6); barBord.position.set(s * (w / 2 - 0.08), Math.min(h - 0.5, 3.1), 0); barBord.rotation.y = -s * Math.PI / 2;
    const tweede = ctx.neon(kies(r, ['COCKTAILS', 'HAPPY HOUR', 'LAST CALL', 'PROOST', 'OPEN 24/7']), hex(WARM), 2.8, 0.7);
    tweede.position.set(-s * (w / 2 - 0.08), Math.min(h - 0.6, 3.0), 0); tweede.rotation.y = s * Math.PI / 2;
    const uit = uitgang(ctx, K, w, d, h, kies(r, ['THE BAR', 'CAFÉ DOOLHOF', 'KROEG', 'TAPHUIS', 'NIGHTCAP']), WARM);
    const L1 = ctx.licht(WARM, 1.6, 10, s * (w / 2 - 1.8), 2.8, 0), L2 = ctx.licht(LED, 1.0, 10, -s * (w / 2 - 2.4), 2.6, 0);
    const NEER = new THREE.Vector3(0, -1, 0), LP = new THREE.Vector3();
    return {
      maat: { w, d, h },
      blijf: 13,
      update(dt, now) {
        const b = ctx.beat(), sh = L.begin(), st = sh.stand, pu = sh.kick;
        // lampkegels op de toog (warm, rustig)
        const lk = st === 'break' ? 0.35 : 0.45 + 0.1 * sh.bas;
        lampZ.forEach((z, i) => { LP.set(bx, 2.2, z); L.bun.zet(L.nK + i, LP, NEER, 1.2, 0.55, kW, lk * 0.6); L.sp.zet(bx, 1.0, z, 1.0, kW, lk * 1.1); });
        // flessenwand: groove = een golf licht loopt per maat langs de flessen; opbouw sneller; drop = alles op de tel; break = zacht
        const golf = st === 'break' ? -99 : ((sh.pos / (st === 'opbouw' ? (sh.opb < 0.5 ? 2 : 1) : 4)) % 1) * Lb * 1.3 - Lb * 0.65;
        for (let i = 0; i < fles.length; i++) {
          const f = fles[i], dz = (f.z - golf) / 0.7;
          const k = st === 'break' ? 0.18 : st === 'drop' ? 0.5 + 0.9 * Math.exp(-sh.fase * 4) * ((f.j + sh.tel) % 3 === 0 ? 1 : 0.5) : 0.22 + 1.1 * Math.exp(-dz * dz);
          flessen.setColorAt(i, C3.copy(f.c).multiplyScalar(k * (sh.flits > 0.5 ? 1.6 : 1)));
        }
        flessen.instanceColor.needsUpdate = true;
        L.sp.zet(ax, 1.75, golf, 1.6, LS.kleur(PAL, 0), st === 'break' ? 0 : 0.35);  // de golf licht ook de muur achter de flessen op
        // ledstrips onder de toog: looplicht op de tel (heen en terug per maat), drop = knipperen op de tel
        for (let i = 0; i < NSTRIP; i++) {
          const u = (i + 0.5) / NSTRIP, run = (sh.pos % 2) / 2, dd = Math.min(Math.abs(u - run), Math.abs(1 - u - run));
          const k = st === 'break' ? 0.12 : st === 'drop' ? (0.6 + 0.8 * pu) : 0.15 + 1.0 * Math.exp(-dd * dd * 60) + (st === 'opbouw' ? 0.4 * sh.opb : 0);
          const c = sh.flits > 0.5 ? LS.wit : LS.kleur(PAL, st === 'drop' ? i % 2 : 0);
          for (const [j, y] of [[0, 0.88], [1, 0.07]]) { SP.set(bx - s * 0.31, y, -Lb / 2 + (i / NSTRIP) * Lb); strip.zet(j * NSTRIP + i, SP, ZAS2, Lb / NSTRIP - 0.03, c, k, 0.03); }
        }
        strip.klaar();
        L.koppen(dt, now);
        plankLed.opacity = (0.4 + 0.3 * sh.mid) * Math.max(0.5, sh.niv); drankMat.opacity = (0.4 + 0.5 * pu) * Math.min(1, sh.niv);
        for (let i = 0; i < lampZ.length; i++) lampGloed.kleur(i, kW, 0.55 + 0.2 * lk);
        lampGloed.klaar();
        if (L1) L1.intensity = 1.2 * (0.8 + 0.2 * sh.bas);
        lampShow(L2, LS.kleur(PAL, 0), (0.35 + 0.7 * pu) * sh.niv, sh);
        uit.puls(b, sh);
        L.eind(now, kW, 0.008, LS.wit, sh.flits * 0.35);
      },
      cam(t) {  // langs de toog, schuin op de flessenwand (tot vóór het eind van de toog: verder keek hij in een lege hoek)
        const u = glad(klem(t / 20)), z = -Lb / 2 - 0.5 + u * (Lb - 1.2);
        return kcam(t, s * (w / 2 - 4.2), 1.5, z - 1.5, s * (w / 2 - 1.2), 1.5, z + 1.2, 56);
      },
      opruimen() { ruimDeeltjes(g); },
    };
  } });

  // ============ 9. Omgekeerd: de ledvloer zit aan het plafond, de mensen dansen ondersteboven, uplights schijnen omhoog, de spiegelbol staat op de grond ============
  DH.registreer('omgekeerd', { gewicht: 0.7, maak(ctx) {
    const r = () => ctx.rnd(), Z = ctx.zwaar, g = ctx.groep, K = kit();
    const PAL = kies(r, [[0x00e5ff, 0xff2d95, 0xffe600], [0xffe600, 0x7a2cff, 0xff3d00], [0x7cff00, 0xff6b00, 0x00e5ff]]).map(c => new THREE.Color(c));
    const w = Math.round(tussen(r, 11, 13)), d = Math.round(tussen(r, 12, 14)), h = +tussen(r, 6, 6.6).toFixed(2);
    const kcam = camHulp(ctx, d);
    // staande lampen op de vloer = uplights (moving heads die omhoog schijnen, naar de dansers aan het plafond)
    const lampPlek = [[-(w / 2 - 2), -d / 4], [w / 2 - 2, d / 4], [-(w / 2 - 2), d / 3], [w / 2 - 2, -d / 3]].slice(0, [4, 3, 2][Z]);
    const L = lichtset(ctx, { koppen: lampPlek.map(([x, z]) => [x, 1.35, z]), extra: 1, rig: { maat: { w, d, h }, pal: PAL, focus: { x: 0, y: h, z: 0 }, spreid: 0.07, sterk: 1.3, omhoog: true, patronen: ['omhoog', 'waaier', 'kruis', 'zwaai'] } });
    // behang op z'n kop: de lambrisering zit boven
    const omgT = T(ctx, 512, 512, (c, cw, ch) => { c.translate(0, ch); c.scale(1, -1); behang(c, cw, ch, r, '#141024', '#3a2a6a'); });
    ctx.doos({ w, d, h, vloer: L.sp.mat(null, 0x121218), muur: wandShow(L.sp, omgT, w, d, 2.6, new THREE.Color(1.5, 1.5, 1.5)), plafond: dubbel(basic(0x050507)) });
    const gloed = gloedTex(ctx);
    // de omgekeerde wereld: een groep met de 'vloer' tegen het plafond (y = 0 lokaal = plafond, x gespiegeld)
    const omg = new THREE.Group(); omg.position.y = h; omg.rotation.z = Math.PI; g.add(omg);
    const tegels = tegelvloer(omg, w, d, PAL);
    const bankMat = lam(0x1a0a22, { emissive: 0x040206 });
    const bankDelen = [];
    bank(omg, K, bankMat, w / 2 - 0.85, -d / 4, -Math.PI / 2, 2.4, 0, bankDelen);
    bank(omg, K, bankMat, -(w / 2 - 0.85), d / 4, Math.PI / 2, 2.4, 0, bankDelen);
    veelM(omg, K.box, bankMat, bankDelen);
    const tafelMat = basic(0x101014), drankMat = gloei(PAL[1], 0.9);
    for (const [tx, tz] of [[w / 2 - 2.2, -d / 4], [-(w / 2 - 2.2), d / 4]]) {
      add(omg, K.cyl, tafelMat, [tx, 0.42, tz], [0.45, 0.04, 0.45]); add(omg, K.cyl, tafelMat, [tx, 0.2, tz], [0.05, 0.4, 0.05]);
      for (const dz of [-0.12, 0.1]) add(omg, K.cyl, drankMat, [tx + tussen(r, -0.2, 0.2), 0.5, tz + dz], [0.03, 0.09, 0.03]);
    }
    // spiegelbol 'hangt' aan een kabel vanaf de echte vloer omhoog, met een pinspot van een vloerlamp erop
    const R = tussen(r, 0.5, 0.7), bx = (r() < 0.5 ? -1 : 1) * 3.4, bz = tussen(r, -d / 5, d / 5), by = 1.6;
    const bol = new THREE.Group(); bol.position.set(bx, by, bz); g.add(bol);
    const bolMat = new THREE.MeshMatcapMaterial({ matcap: T(ctx, 256, 256, (c, cw, ch) => matcap(c, cw, ch, r), 0), side: THREE.DoubleSide });
    bol.add(new THREE.Mesh(mirrorBallGeometry(R, 16, 0.9), bolMat));
    add(bol, K.sph, basic(0x050508), null, [R * 0.985, R * 0.985, R * 0.985]);
    add(g, K.cyl, basic(0x1a1a1a), [bx, (by - R) / 2, bz], [0.015, by - R, 0.015]);
    const PIN = new THREE.Vector3(-bx * 0.2, 0.25, bz - 3), PIND = new THREE.Vector3(bx, by, bz).sub(PIN), PINL = PIND.length() - R * 0.7; PIND.normalize();
    add(g, K.box, basic(0x0c0c10), [PIN.x, 0.12, PIN.z], [0.25, 0.22, 0.25]);
    // lampkappen op de vloerlampen (de uplights zelf)
    const lampMat = new THREE.SpriteMaterial({ map: gloed, color: PAL[2], transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
    const kapGeo = new THREE.ConeGeometry(0.22, 0.2, 14, 1, true); kapGeo.rotateX(Math.PI);
    for (const [lx, lz] of lampPlek) {
      add(g, K.cyl, basic(0x111111), [lx, 0.6, lz], [0.006, 1.2, 0.006]);
      add(g, kapGeo, basic(0x15100c, { side: THREE.DoubleSide }), [lx, 1.2, lz]);
      const sp = new THREE.Sprite(lampMat); sp.position.set(lx, 1.32, lz); sp.scale.set(0.6, 0.6, 1); g.add(sp);
    }
    // regen die omhoog valt
    const nR = [50, 30, 15][Z], regen = deeltjes(g, nR, PAL[0], 0.09, gloed, (p, i) => { p[i * 3] = tussen(r, -w / 2 + 0.5, w / 2 - 0.5); p[i * 3 + 1] = r() * h; p[i * 3 + 2] = tussen(r, -d / 2 + 0.5, d / 2 - 0.5); });
    // dansers ondersteboven aan het plafond, een paar verbaasde gasten op de echte vloer
    const tafelVrij = (x, z) => Math.hypot(x - (w / 2 - 2.2), z + d / 4) > 1.1 && Math.hypot(x + (w / 2 - 2.2), z - d / 4) > 1.1;
    for (const [x, z] of plekken(r, [6, 4, 4][Z], w / 2 - 1.5, d / 2 - 1.5, 0, 1.4, tafelVrij)) {
      const dd = fig(ctx, { x, z, face: r() * TAU, rol: r() < 0.2 ? 'juich' : 'dans' });
      if (dd) omg.add(dd.root);
    }
    const vloerVrij = (x, z) => Math.hypot(x - bx, z - bz) > 1.6 && lampPlek.every(([lx, lz]) => Math.hypot(x - lx, z - lz) > 1);
    for (const [x, z] of plekken(r, [2, 1, 0][Z], w / 2 - 1.5, d / 2 - 2, 2.6, 2, vloerVrij)) fig(ctx, { x, z, face: r() * TAU, rol: 'staan' });  // verbaasde gasten op de echte vloer
    const naam = kies(r, ['OMGEKEERD', 'UPSIDE DOWN', 'ONDERSTEBOVEN', 'KOPJE ONDER']);
    const uit = uitgang(ctx, K, w, d, h, naam, PAL[0]);
    uit.bord.rotation.z = Math.PI;  // de naam staat ook op z'n kop
    const camKant = bx < 0 ? 1 : -1;  // camera aan de andere kant dan de spiegelbol
    const L1 = ctx.licht(PAL[0], 1.6, 12, 0, h - 1.5, 0), L2 = ctx.licht(PAL[1], 1.0, 12, 0, 1.5, d / 4);
    let hoek = 0;
    return {
      maat: { w, d, h },
      blijf: 13,
      update(dt, now) {
        const b = ctx.beat(), s = L.begin(), st = s.stand, pu = s.kick;
        tegels(b, s, 0.55);  // het ledplafond vult het halve beeld: lager niveau
        // pinspot op de bol (vanaf de vloer)
        const pk = st === 'break' ? 0.8 : st === 'drop' ? 1 + 0.4 * s.knal : 0.6 + 0.2 * pu, pc = s.flits > 0.5 ? LS.wit : st === 'break' ? WIT : LS.kleur(PAL, 2);
        L.bun.zet(L.nK, PIN, PIND, PINL, 0.2, pc, pk * 0.8);
        L.pun.zet(L.nK, PIN.x, PIN.y, PIN.z, pc, 0.5 + pk);
        bolMat.color.setScalar(0.25 + 0.6 * pk);
        L.sp.zet(bx, by, bz, R * 2.4, pc, 0.2 * pk);
        L.koppen(dt, now);
        hoek += dt * (st === 'break' ? 0.2 : 0.4 * s.tempo); bol.rotation.y = hoek;
        const a = regen.geometry.attributes.position.array;
        for (let i = 0; i < nR; i++) {
          a[i * 3 + 1] += dt * (2.5 + (i % 5) * 0.4) * (1 + b.bas) * (st === 'break' ? 0.4 : 1);
          if (a[i * 3 + 1] > h - 0.05) { a[i * 3] = (Math.random() - 0.5) * (w - 1); a[i * 3 + 1] = 0.05; a[i * 3 + 2] = (Math.random() - 0.5) * (d - 1); }
        }
        regen.geometry.attributes.position.needsUpdate = true;
        regen.material.color.copy(LS.kleur(PAL, 0)).multiplyScalar(0.4 + 0.6 * Math.min(1, s.niv));
        drankMat.opacity = (0.4 + 0.5 * pu) * Math.min(1, s.niv); lampMat.opacity = (0.4 + 0.4 * pu) * Math.min(1, s.niv);
        lampShow(L1, LS.kleur(PAL, 0), (0.5 + 0.8 * pu) * s.niv, s);
        lampShow(L2, LS.kleur(PAL, 1), (0.3 + 0.5 * s.mid) * s.niv, s);
        uit.puls(b, s);
        L.eind(now, LS.kleur(PAL, 0), 0.01);
      },
      cam(t) {  // laag, schuin omhoog kijkend naar de dansers en de ledvloer aan het plafond, de uplights erlangs
        const u = glad(klem(t / 18)), z = -d / 2 + 1.5 + u * (d / 2 - 1);
        return kcam(t, camKant * (1.7 + 0.3 * Math.sin(t * 0.2)), 1.2, z, Math.sin(t * 0.13) * 2, h - 1.2, z + 3.5, 72);
      },
      opruimen() { ruimDeeltjes(g); },
    };
  } });
})();

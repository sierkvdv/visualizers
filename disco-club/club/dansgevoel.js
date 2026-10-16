// Dansgevoel: de dansers voelen het tempo en de vorm van het nummer (groove, break, opbouw, drop).
//  - halve tel: boven ~125 BPM lopen de dansclips op het halve tempo, fase op de tel (140 dubstep = ~70 clip-tellen per minuut)
//  - temperament per danser (rustig..wild): hoeveel dans (niveau = de dans over een rustige sta-clip heen), welk tempo, welke clips
//  - secties uit window.clubRegie (lichtregie.js): break = de meesten wiegen of staan even, de wildsten dansen zacht door;
//    opbouw = gespreid weer opbouwen, eerst trager, tegen het eind handen omhoog (gebouwde dansers klappen);
//    drop = iedereen los (de wildsten op het hele tempo), daarna nog 32 tellen feller (nagloed)
//  - niets verspringt: een tempowissel mengt twee kloklijnen die elkaar halverwege raken, niveaus glijden, clips vloeien over
// Via wrappers om pose, nextDance, forceDance en updateWalkers (index.html blijft zoals hij is); paaldanseressen via timeScale;
// staand publiek deint licht mee vanaf de voeten (meeleven.js doet hoofd en romp).
// Test: clubDansgevoel.zet(false) = oud gedrag, clubDansgevoel.info() = stand per danser.
(() => {
  'use strict';
  if (window.clubDansgevoel || typeof pose !== 'function' || typeof nextDance !== 'function' || typeof forceDance !== 'function') return;
  const DG = window.clubDansgevoel = { aan: true, half: false, stand: 'groove' };
  const fr = x => x - Math.floor(x);
  const klem = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const glad = u => u * u * (3 - 2 * u);

  // --- klok: clip-tellen als functie van de tel ---
  // Een lijn r*tb + c. Bij een tempowissel mengen de oude en de nieuwe lijn over W tellen en raken ze elkaar halverwege:
  // geen sprong in de houding en geen schok in de snelheid. De nieuwe c is een veelvoud van r: elke clip-tel valt op een tel.
  const klok = () => ({ r0: 1, c0: 0, r1: 1, c1: 0, t0: -1e9, W: 1, vast: false });
  function kWaarde(k, tb) {
    const u = (tb - k.t0) / k.W;
    if (u >= 1) return k.r1 * tb + k.c1;
    if (u <= 0) return k.r0 * tb + k.c0;
    const s = glad(u);
    return (1 - s) * (k.r0 * tb + k.c0) + s * (k.r1 * tb + k.c1);
  }
  function kHelling(k, tb) {
    const u = (tb - k.t0) / k.W;
    if (u >= 1) return k.r1;
    if (u <= 0) return k.r0;
    const s = glad(u), ds = 6 * u * (1 - u) / k.W;
    return (1 - s) * k.r0 + s * k.r1 + ds * ((k.r1 - k.r0) * tb + k.c1 - k.c0);
  }
  function kNaar(k, r, tb, W) {  // vloeiend naar r clip-tellen per tel
    if (k.vast && k.r1 === r) return;
    const v = kWaarde(k, tb), h = kHelling(k, tb), m = tb + W / 2;
    k.r0 = h; k.c0 = v - h * tb;
    k.r1 = r; k.c1 = Math.round((v + h * W / 2 - r * m) / r) * r;
    k.t0 = tb; k.W = W; k.vast = true;
  }
  function kVrij(k, v, tb, r) { k.r0 = k.r1 = r; k.c0 = k.c1 = v - r * tb; k.t0 = -1e9; k.vast = false; }  // lijn door (tb, v), nog niet op de tel

  // --- sectie en tempo: één keer per beeld ---
  const G = { fn: -1, tc: 0, nu: 0, dtb: 0, half: false, B: 1, st: 'groove', tIn: 0, oTel: 0, gloed: 0, laag: false, sync: klok(), loop: klok() };
  function globaal() {
    if (G.fn === frameNo) return G;
    G.fn = frameNo;
    const tb = beatPos, nu = last / 1000, dt = klem(nu - (G.nu || nu), 0, 0.1);
    G.nu = nu;
    // tel zonder sprongen voor de klokken: de beat-volger trekt bij elke bas-aanslag de fase bij (tot 0,3 tel), hier glijdt dat in ~0,1 s
    const tc0 = G.tc;
    if (Math.abs(tb - G.tc) > 1.5) G.tc = tb;
    else { G.tc += dt / period; G.tc += (tb - G.tc) * (1 - Math.exp(-dt * 12)); }
    G.dtb = klem(G.tc - tc0, 0, 2);
    if (!G.half && period < 0.475) G.half = true;        // boven ~126 BPM voel je de helft
    else if (G.half && period > 0.485) G.half = false;   // onder ~124 BPM weer elke tel
    G.B = G.half ? 0.5 : 1;
    const R = window.clubRegie;
    G.st = live && R && R.stand ? R.stand : 'groove';
    G.tIn = R ? Math.max(0, tb - (R.sinds || 0)) : 0;
    G.oTel = G.st === 'opbouw' ? Math.max(G.tIn, R.opbouwTel || 0) : 0;
    G.gloed = G.st === 'drop' ? 1 : Math.max(0, G.gloed - G.dtb / 32);
    const K = window.clubKwaliteit;
    G.laag = !!K && (K.stand === 'laag' || K.stand === 'minimaal');
    kNaar(G.sync, G.B, G.tc, 4);  // gedeelde klok: YMCA en andere samen-momenten, deinen van het publiek
    kNaar(G.loop, G.st === 'break' || G.st === 'opbouw' ? Math.min(G.B, 0.5) : G.B, G.tc, 4);  // lopers die aan de rand meedansen
    DG.half = G.half; DG.stand = G.st;
    return G;
  }

  // --- per danser ---
  const STAAT = new WeakMap();
  function st(d) {
    let s = STAAT.get(d);
    if (!s) {
      s = { T: Math.random(), lag: Math.random(), ph: Math.random() * TAU, klok: null, L: 1, Lt: 1, rt: 1, kL: 0.45, sst: 'groove', fn: -1,
            moment: -1e9, sync: null, handen: false, rust: null, rustT: Math.random() * 5, ts0: 0, f: 1, tilt: 0 };
      STAAT.set(d, s);
    }
    return s;
  }
  // dj's (club, zaal 2, doolhof) draaien door; juichers in het doolhof juichen altijd vol
  const soortVan = d => d === dj || d.rol === 'dj' || (d.yOff !== undefined && !d.acts) ? 'dj' : d.rol === 'juich' ? 'juich' : '';
  // break: rustigsten staan even (sta-clip), de meesten wiegen op de halve tel, de wildsten dansen zacht door
  const breakNiveau = T => T < 0.3 ? 0.03 : T < 0.8 ? 0.12 + 0.3 * (T - 0.3) : 0.45 + 0.75 * (T - 0.8);
  function doel(d, s, g, soort, tb) {  // zet s.Lwil (gewenst niveau), s.Lt, s.rt (clip-tellen per tel), s.kL (glijsnelheid per tel)
    const T = s.T, B = g.B;
    s.fn = frameNo;
    // de sectie volgen, gespreid: drop en opbouw meteen (de opbouw spreidt zichzelf), break binnen 2 en groove binnen 3 tellen
    if (s.sst !== g.st && g.tIn >= (g.st === 'drop' || g.st === 'opbouw' ? 0 : s.lag * (g.st === 'break' ? 2 : 3))) { s.sst = g.st; s.handen = false; }
    let L = 1, r = B, k = 0.45;
    if (soort) L = 1;
    else if (tb < s.moment) { k = 3; if (g.st === 'drop' && g.half && T > 0.55) r = 1; }  // moment (drop, ymca, solo, paar): vol
    else if (s.sst === 'break') { L = breakNiveau(T); r = T < 0.8 ? 0.5 : B; k = 0.7; }
    else if (s.sst === 'opbouw') {
      const tO = g.oTel, p = glad(klem((tO - 1 - (1 - T) * 6 - s.lag * 2) / 8)), L0 = breakNiveau(T);
      L = L0 + (0.4 + 0.5 * T - L0) * p;     // wild bouwt eerder en hoger op dan rustig: ieder op een eigen niveau
      r = tO < 8 && T < 0.5 ? 0.5 * B : B;  // eerst trager
      if (!s.handen && tO >= 6 + (1 - T) * 8 + s.lag * 2) s.handen = true;
      if (s.handen) L = Math.max(L, 0.9);
      k = 0.35;
    } else if (s.sst === 'drop') { k = 3; if (g.half && T > 0.55) r = 1; }  // los; de wildere helft springt op het hele tempo
    else {  // groove: gemengd volgens temperament, na een drop een tijd voller (laag/minimaal: geen extra mengclip)
      L = g.laag ? 1 : Math.min(1, (T < 0.5 ? 0.62 + 0.76 * T : 1) + 0.6 * g.gloed);
      if (g.half && T > 0.75 && g.gloed > 0.5) r = 1;
    }
    s.Lwil = s.Lt = L; s.rt = r; s.kL = k;
  }
  const glij = (s, g) => { s.L += (s.Lt - s.L) * (1 - Math.exp(-g.dtb * s.kL)); };

  // --- heupen: draaiende clips (Magic Genie, OMG, You Groove draaien tot 3,1 rad) mogen niet omklappen bij het mengen ---
  // De mixer mengt kwaternionen langs de kortste weg: staan twee heupstanden bijna 180° uit elkaar, dan klapt het
  // resultaat in één beeld om. Daarom: een sta-clip alleen onder clips die er altijd ver genoeg van blijven, en bij een
  // danswissel een startpunt in de nieuwe clip zoeken waarbij de heupen tijdens het overvloeien dicht genoeg bij elkaar blijven.
  const HEUP = new WeakMap(), RV = new WeakMap(), qh1 = new THREE.Quaternion(), qh2 = new THREE.Quaternion();
  const hoek = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a.dot(b))));
  function heupen(c) {
    let h = HEUP.get(c);
    if (h === undefined) {
      const t = c.tracks.find(x => /(^|[.|/])Hips\.quaternion$/.test(x.name));
      h = t ? { t, ip: t.createInterpolant() } : null;
      HEUP.set(c, h);
    }
    return h;
  }
  function heupQ(c, tijdS, out) {
    const h = heupen(c);
    if (!h) return out.set(0, 0, 0, 1);
    const r = h.ip.evaluate(tijdS);
    return out.set(r[0], r[1], r[2], r[3]);
  }
  function rustVeilig(c) {  // heup van c blijft altijd < 2,4 rad van elke heupstand van de sta-clip
    const R = rustClip();
    if (!R || c === R) return true;
    let v = RV.get(c);
    if (v !== undefined) return v;
    const a = heupen(c), b = heupen(R);
    v = true;
    if (a && b) {
      const va = a.t.values, vb = b.t.values, na = va.length / 4, nb = vb.length / 4;
      for (let i = 0; i < na && v; i++) {
        qh1.fromArray(va, i * 4);
        for (let j = 0; j < nb; j += 3) if (hoek(qh1, qh2.fromArray(vb, j * 4)) > 2.4) { v = false; break; }
      }
    }
    RV.set(c, v);
    return v;
  }
  const veiligNu = (d, s) => (!d.cur || rustVeilig(d.cur.getClip())) && (d.fade >= 1 || ((!d.prev || rustVeilig(d.prev.getClip())) && (!s.oud || rustVeilig(s.oud.getClip()))));
  // startpunt (beatOff) in clip c waarbij de heupen tijdens het overvloeien (dK clip-tellen vanaf tq) < 2,4 rad van de lopende clip blijven;
  // dicht bemonsterd (elke ~0,03 s cliptijd): een draai gaat tot ~15 rad/s
  function startOk(a, c, b, tq, dK) {  // blijven de heupen van lopende actie a en clip c (start b) tijdens dK clip-tellen < 2,4 rad uit elkaar?
    const nb = c.beats, ac = a.getClip(), ab = ac.beats || Math.max(1, Math.round(ac.duration * 2));
    const n = Math.min(64, Math.max(6, Math.ceil(dK * Math.max(ac.duration / ab, c.duration / nb) / 0.03)));
    for (let k = 0; k <= n; k++) {
      const t = tq + dK * k / n;
      heupQ(ac, fr((t + a.beatOff) / ab) * ac.duration, qh1);
      heupQ(c, fr((t + b) / nb) * c.duration, qh2);
      if (hoek(qh1, qh2) > 2.4) return false;
    }
    return true;
  }
  function veiligeStart(d, c, tq, dK) {
    const nb = c.beats, a = d.cur;
    const b0 = Math.floor(Math.random() * nb);
    if (!a || a.beatOff === undefined || !heupen(c) || !heupen(a.getClip())) return b0;
    const stap = Math.max(1, Math.floor(nb / 8));  // hooguit ~8 startpunten proberen
    for (let i = 0; i < nb; i += stap) { const b = (b0 + i) % nb; if (startOk(a, c, b, tq, dK)) return b; }
    return -1;
  }
  // rustige sta-clip onder de dans (eigen kopie: geen botsing met de handelingen of de dj-basis van het doolhof)
  let RUST = null, JUICH = null;
  const rustClip = () => RUST || (ACTS.Stand_and_Chat ? (RUST = ACTS.Stand_and_Chat.clone()) : null);
  const juichClip = () => JUICH || (ACTS.Cheer_with_Both_Hands_Up ? (JUICH = ACTS.Cheer_with_Both_Hands_Up.clone()) : null);  // handen omhoog in de opbouw
  function rustlaag(d, s, dt) {  // gewicht (1-L)/L naast dans 1: de mixer middelt, dus L dans en 1-L rust
    const L = s.L, w = L > 0.985 ? 0 : (1 - L) / Math.max(L, 0.03);
    let a = s.rust;
    if (w <= 0) { if (a && a.isRunning()) a.stop(); return; }
    if (!a) { const c = rustClip(); if (!c) return; a = s.rust = d.mixer.clipAction(c); }
    if (!a.isRunning()) a.play();
    s.rustT += dt * 0.85;
    a.time = s.rustT % a.getClip().duration;
    a.setEffectiveWeight(w);
  }
  function tijd(a, w, tq, s, gs) {
    if (!a) return;
    const c = a.getClip();
    if (!c.beats) c.beats = Math.max(1, Math.round(c.duration * 2));
    const u = ((c === s.sync ? gs : tq) + (a.beatOff || 0)) / c.beats;
    a.time = fr(u) * c.duration;
    a.setEffectiveWeight(w);
  }
  // 3D-dansers: het model-deel van pose, met eigen klok, niveau en handen omhoog
  function poseModel(d, tb, A, dt, g) {
    const s = st(d), soort = soortVan(d);
    if (d.faceT !== undefined) { let dr = d.faceT - d.face; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); d.face += dr * Math.min(1, dt * 1.6); }
    d.root.position.set(d.home.x + (d.px || 0), d.yOff || 0, d.home.z + (d.pz || 0));
    d.root.rotation.set(0, d.face, 0);
    if (!CLIPS.length) return;
    doel(d, s, g, soort, tb);
    if (s.Lt < 0.985 && !veiligNu(d, s)) {  // draaiende clip: geen sta-clip eronder (klapt om); vol dansen en zo snel mogelijk wisselen
      s.Lt = 1; s.kL = Math.max(s.kL, 3);
      if (tb >= s.moment && d.cur && d.fade >= 1 && d.nextChange > tb + 1) { d.nextChange = Math.floor(tb) + 1; s.snel = true; }
    }
    glij(s, g);
    const cc = d.cur && d.cur.getClip(), op = s.handen && s.sst === 'opbouw';
    if (cc && cc === JUICH && !op && d.fade >= 1 && d.nextChange > tb + 1) d.nextChange = Math.floor(tb) + 1;  // opbouw voorbij: weer dansen
    else if (op && !soort && tb >= s.moment && cc !== JUICH && d.fade >= 1 && juichClip()) { oForce(d, JUICH, tb, 4); d.fadeK = 1.2; }
    if (!d.cur || (A >= 0.08 && tb >= d.nextChange)) nextDance(d, tb);
    const sp = d.calm ? 0.5 : 1, tc = g.tc;
    if (!s.klok) { s.klok = klok(); kVrij(s.klok, d.tq || 0, tc, s.rt * sp); }
    if (A < 0.08) { d.tq = (d.tq || 0) + dt * 0.3; kVrij(s.klok, d.tq, tc, 0.3 * period); }  // stilte: langzaam doorwiegen, zoals het origineel
    else { kNaar(s.klok, s.rt * sp, tc, s.kL >= 3 ? 2 : 4); d.tq = kWaarde(s.klok, tc); }
    d.fade = Math.min(1, d.fade + dt * (d.fadeK || 0.7));
    if (s.sync && (!d.cur || d.cur.getClip() !== s.sync) && (!d.prev || d.prev.getClip() !== s.sync)) s.sync = null;
    const gs = s.sync ? kWaarde(g.sync, tc) : 0;
    if (s.oud && (d.fade >= 1 || !s.oud.isRunning())) { s.oud.stop(); s.oud = null; }
    const pw = s.oud ? s.oudP : 1;  // na een moment midden in een overgang: de oude overgang vloeit als geheel uit
    tijd(d.cur, d.fade, d.tq, s, gs);
    tijd(d.prev, (1 - d.fade) * pw, d.tq, s, gs);
    if (s.oud) tijd(s.oud, (1 - d.fade) * (1 - pw), d.tq, s, gs);
    rustlaag(d, s, dt);
    d.mixer.update(0);
  }
  // gebouwde dansers: pose van index.html met een eigen klok (wisseltellen omgerekend) en een lagere uitbundigheid
  function poseBuilt(d, tb, A, dt, g) {
    const s = st(d), soort = soortVan(d);
    doel(d, s, g, soort, tb);
    glij(s, g);
    if (s.handen && s.sst === 'opbouw' && !soort && (d.move !== 9 || tb + d.off >= d.nextChange - 0.05)) builtMove(d, tb, 9, 8, null);  // klappen boven het hoofd
    if (!s.klok) { s.klok = klok(); kVrij(s.klok, g.tc, g.tc, s.rt); }
    kNaar(s.klok, s.rt, g.tc, s.kL >= 3 ? 2 : 4);
    const tk = kWaarde(s.klok, g.tc), r = Math.max(0.1, kHelling(s.klok, g.tc));
    const A2 = A < 0.08 ? A : s.L < 0.08 ? 0.05 : Math.max(0.1, A * Math.min(1, s.L * 1.15));  // staan = het rustige wiegen van het origineel
    const nc = d.nextChange, ncK = (nc - tb - d.off) * r + tk + d.off;
    d.nextChange = ncK;
    try { oPose(d, tk, A2, dt); }
    finally { d.nextChange = d.nextChange === ncK ? nc : (d.nextChange - tk - d.off) / r + tb + d.off; }
  }
  // staand publiek: hele figuur deint licht van links naar rechts op de halve tel (pose zet de draaiing elk beeld terug)
  function deinen(d, dt, g) {
    if (d.seat || d.yOff !== undefined || crowd.indexOf(d) < 0) return;
    const s = st(d), P = window.clubPubliek;
    const wil = P && P.golf ? 0 : g.st === 'break' ? 0.022 : g.st === 'opbouw' ? 0.022 + 0.02 * klem(g.oTel / 16) : g.st === 'drop' ? 0.01 : 0.006 + 0.01 * energy;
    s.tilt += (wil - s.tilt) * (1 - Math.exp(-dt * 1.5));
    if (s.tilt > 0.0005) d.root.rotation.z = s.tilt * Math.sin(Math.PI * kWaarde(g.sync, g.tc) + s.ph);
  }

  // clipkeuze: rustige clips voor rustige dansers en de break, wilde voor wilde dansers en de drop
  const INT = new WeakMap(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  function intens(c) {  // gemiddelde draaisnelheid van de botten (rad/s)
    let v = INT.get(c);
    if (v !== undefined) return v;
    let som = 0, n = 0;
    for (const t of c.tracks) {
      if (!/\.quaternion$/.test(t.name)) continue;
      const a = t.values, k = t.times.length;
      let s = 0;
      for (let i = 1; i < k; i++) { qa.fromArray(a, (i - 1) * 4); qb.fromArray(a, i * 4); s += 2 * Math.acos(Math.min(1, Math.abs(qa.dot(qb)))); }
      som += s / (c.duration || 1); n++;
    }
    v = n ? som / n : 1;
    INT.set(c, v);
    return v;
  }
  // kiest clip en startpunt; gewogen naar temperament en sectie, zonder omklappende heupen (zie hierboven)
  function kiesClip(d, s, stand, tq, dK) {
    const cur = d.cur && d.cur.getClip(), rust = (s.Lwil === undefined ? 1 : s.Lwil) < 0.985;
    let lo = Infinity, hi = -Infinity;
    for (const c of CLIPS) { const v = intens(c); lo = Math.min(lo, v); hi = Math.max(hi, v); }
    const wil = klem(0.1 + 0.8 * s.T + (stand === 'drop' ? 0.35 : stand === 'break' ? -0.3 : stand === 'opbouw' ? -0.15 : 0.25 * G.gloed));
    const w = CLIPS.map(c => c === cur && CLIPS.length > 1 || (rust && !rustVeilig(c)) ? 0 : Math.exp(-(((intens(c) - lo) / (hi - lo || 1) - wil) ** 2) / 0.08) + 1e-4);
    for (let poging = 0; poging < CLIPS.length; poging++) {
      let som = 0;
      for (const x of w) som += x;
      if (som <= 0) break;
      let r = Math.random() * som, i = 0;
      while (i < w.length - 1 && (r -= w[i]) > 0) i++;
      const b = veiligeStart(d, CLIPS[i], tq, dK);
      if (b >= 0) return { clip: CLIPS[i], b };
      w[i] = 0;  // geen veilig startpunt: een andere clip
    }
    const c = pick(CLIPS.length > 1 ? CLIPS.filter(x => x !== cur) : CLIPS);  // niets veilig: zoals het origineel
    return { clip: c, b: Math.floor(rnd(0, c.beats)) };
  }

  // --- wrappers ---
  const oPose = pose, oNext = nextDance, oForce = forceDance, oWalk = typeof updateWalkers === 'function' ? updateWalkers : null;
  pose = function (d, tb, A, dt) {
    if (!DG.aan || !d) return oPose.apply(this, arguments);
    const g = globaal();
    if (d.type !== 'model') return poseBuilt(d, tb, A, dt, g);
    if (!d.acts) return poseModel(d, tb, A, dt, g);
    const r = oPose.apply(this, arguments);
    deinen(d, dt, g);
    return r;
  };
  nextDance = function (d, t) {
    if (!DG.aan || !d || (d.queue && d.queue.length) || !CLIPS.length) return oNext.apply(this, arguments);
    const s = st(d), cc = d.cur && d.cur.getClip();
    if (cc && cc === JUICH && s.handen && s.sst === 'opbouw') { d.nextChange = Math.floor(t) + 4; return; }  // handen blijven omhoog
    if (d.cur && d.cur.beatOff !== undefined && d.fade < 0.98) { d.nextChange = Math.floor(t) + 1; return; }  // eerst de vorige overgang af (anders klapt prev weg)
    // zoals het origineel, alleen past de clip bij temperament en sectie, en het startpunt bij de lopende dans
    const g = globaal(), eigen = !!s.klok;  // eigen klok (pose); anders een loper op de lopersklok (t = die klok)
    const tq = eigen ? d.tq : t, rate = kHelling(eigen ? s.klok : g.loop, g.tc), fk = s.snel ? 1.2 : 0.7;  // weg uit een draaiclip: sneller
    s.snel = false;
    const k = kiesClip(d, s, s.fn === frameNo ? s.sst : g.st, tq, rate / fk / period);
    d.fadeK = fk;
    if (d.prev) d.prev.stop();
    d.prev = d.cur;
    d.cur = d.mixer.clipAction(k.clip);
    d.cur.play();
    d.fade = d.prev ? 0 : 1;
    d.cur.beatOff = k.b;
    d.nextChange = Math.floor(t) + pick([8, 16, 16]);
  };
  forceDance = function (d, clip, tb, beats, sync) {
    if (!DG.aan || !d || !clip || d.type !== 'model') return oForce.apply(this, arguments);
    const s = st(d), a = d.mixer.clipAction(clip), f0 = d.fade, bo = a.beatOff;
    const wasCur = a === d.cur, wasPrev = !!d.cur && a === d.prev && f0 < 1;
    // midden in een overgang: het origineel stopt prev hard (zichtbare schok); hier vloeit die oude overgang als geheel uit
    if (s.oud) { s.oud.stop(); s.oud = null; }
    if (!wasCur && !wasPrev && d.prev && d.cur && f0 < 1) { s.oud = d.prev; s.oudP = f0; d.prev = null; }
    // momenten (solo, paar, drop) starten de clip bij het begin; staan de heupen dan ~180° van de lopende dans, dan klapt de houding
    // tijdens het overvloeien om (gemeten: 2,9 rad in één beeld). Dan een ander startpunt (niet bij samen-momenten: die moeten gelijk)
    let veilig = -1;
    if (!sync && !wasCur && !wasPrev && d.cur && d.cur.beatOff !== undefined && heupen(clip) && heupen(d.cur.getClip())) {
      if (!clip.beats) clip.beats = Math.max(1, Math.round(clip.duration * 2));
      const g = globaal(), tq = d.tq || tb, dK = (s.klok ? kHelling(s.klok, g.tc) : 1) / 2.2 / period * 1.2;
      if (!startOk(d.cur, clip, clip.beats - (tq % clip.beats), tq, dK)) veilig = veiligeStart(d, clip, tq, dK);
    }
    const r = oForce.apply(this, arguments);
    if (veilig >= 0 && d.cur === a) a.beatOff = veilig;
    if (s.oud && !d.prev) { s.oud.stop(); s.oud = null; }  // geen overgang gestart: oud niet nodig
    if ((wasCur || wasPrev) && !sync && bo !== undefined) a.beatOff = bo;  // zichtbare clip loopt door in plaats van terug te springen
    if (wasPrev) d.fade = 1 - f0;  // de uitvloeiende clip komt terug vanaf zijn huidige gewicht
    s.moment = d.nextChange;  // tot deze tel vol meedoen
    if (sync && d.cur && d.cur.getClip() === clip) {  // samen (YMCA): iedereen op de gedeelde klok, dus echt gelijk
      s.sync = clip;
      d.cur.beatOff = clip.beats - fr(kWaarde(globaal().sync, G.tc) / clip.beats) * clip.beats;
    }
    return r;
  };
  if (oWalk) updateWalkers = function (dt, tb, A) {  // dansende lopers aan de rand: hun hele dansklok (ook de wisseltellen) op de lopersklok
    if (!DG.aan) return oWalk.apply(this, arguments);
    const g = globaal();
    return oWalk.call(this, dt, kWaarde(g.loop, g.tc), A);
  };

  // paaldanseressen: zelfde dans, tempo mee met de sectie (break trager, opbouw loopt op, drop sneller)
  DG.paalF = 1;  // tempofactor van de paaldans (ook gelezen door doolhof/kern.js voor de paaldanseressen in de kamers)
  clubHooks.push(dt => {
    const g = globaal();
    if (rustClip()) for (const c of CLIPS) if (!RV.has(c)) { intens(c); rustVeilig(c); break; }  // voorwerk: één clip per beeld, niet bij de eerste wissel
    const f = !DG.aan ? 1 : g.st === 'break' ? 0.72 : g.st === 'opbouw' ? 0.78 + 0.3 * klem(g.oTel / 16) : g.st === 'drop' ? 1.15 : 1 + 0.08 * g.gloed;
    DG.paalF += (f - DG.paalF) * (1 - Math.exp(-dt * 0.8));
    for (const d of poleDancers) {
      if (!d.cur) continue;
      const s = st(d);
      if (!s.ts0) s.ts0 = d.cur.timeScale || 1;
      s.f += (f - s.f) * (1 - Math.exp(-dt * 0.8));
      d.cur.timeScale = s.ts0 * s.f;
    }
  });

  DG.zet = aan => {  // aan/uit (testen); lopers rekenen hun wisseltel opnieuw, eigen mengclips stoppen
    DG.aan = !!aan;
    for (const w of walkers) w.nextChange = 0;
    if (!DG.aan) for (const d of [...dancers, ...zone2Dancers]) {
      const s = STAAT.get(d);
      if (s && s.oud) { s.oud.stop(); s.oud = null; }
      if (s && s.rust) s.rust.stop();
    }
  };
  DG.staat = d => STAAT.get(d);  // testen
  DG.info = () => [...dancers, ...zone2Dancers].filter(d => d.root.parent).map(d => {
    const s = STAAT.get(d) || {};
    return { fig: d.M ? d.M.file.replace(/^models\/|\.glb$/g, '') : d.type, T: +(s.T || 0).toFixed(2), sectie: s.sst, niveau: +(s.L || 0).toFixed(2),
             tempo: s.klok ? +kHelling(s.klok, G.tc).toFixed(2) : null, handen: !!s.handen,
             clip: d.cur ? (d.cur.getClip().name.split('|')[1] || d.cur.getClip().name) : d.type === 'model' ? null : 'move ' + d.move };
  });
})();

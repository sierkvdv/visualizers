// Dansgevoel: de dansers voelen het tempo en de vorm van het nummer (groove, break, opbouw, drop).
//  - halve tel: volgens clubStijl.preset.halveTel (dubstep/dnb ja, trance/house nee; leest de beatvolger al het halve tempo, dan niet);
//    zonder stijl of bij 'onbekend' boven ~125 BPM. Fase op de tel (140 dubstep = ~70 clip-tellen per minuut)
//  - temperament per danser (rustig..wild): hoeveel dans (niveau = de dans over een rustige sta-clip heen), welk tempo, welke clips
//  - secties uit window.clubRegie (lichtregie.js): break = de meesten wiegen of staan even, de wildsten dansen zacht door;
//    opbouw = gespreid weer opbouwen, eerst trager, tegen het eind handen omhoog (gebouwde dansers klappen);
//    drop = iedereen los (de wildsten op het hele tempo), daarna nog 32 tellen feller (nagloed)
//  - niets verspringt: een tempowissel mengt twee kloklijnen die elkaar halverwege raken, niveaus glijden, clips vloeien over
// Via wrappers om pose, nextDance, forceDance en updateWalkers (index.html blijft zoals hij is); paaldanseressen via timeScale;
// staand publiek deint licht mee vanaf de voeten (meeleven.js doet hoofd en romp).
// Muziekstijl (club/stijl.js: window.clubStijl.preset.dans + event 'clubstijl'): per stijl andere clips, niveau, tempo en een laag
// bovenop de clip (zie 'stijl-laag' onderaan); zonder clubStijl alles zoals hierboven.
// Test: clubDansgevoel.zet(false) = oud gedrag, clubDansgevoel.info() = stand per danser, clubDansgevoel.stijl() = stijl en laag.
(() => {
  'use strict';
  if (window.clubDansgevoel || typeof pose !== 'function' || typeof nextDance !== 'function' || typeof forceDance !== 'function') return;
  const DG = window.clubDansgevoel = { aan: true, half: false, stand: 'groove', dans: null, ikMis: 0 };
  const fr = x => x - Math.floor(x);
  const klem = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const glad = u => u * u * (3 - 2 * u);

  // --- muziekstijl: welke dans (preset.dans) en of de halve tel geldt (preset.halveTel; 'onbekend' = op BPM zoals vroeger) ---
  const DANSEN = ['groove', 'handen', 'halftime', 'skank', 'bounce', 'afro', 'lounge', 'headbang', 'pogo'];
  const SJ = { dans: null, half: null, naam: null, tel: 0, n: 0 };
  function leesStijl() {
    const cs = window.clubStijl, p = cs && cs.preset;
    const dans = p && DANSEN.indexOf(p.dans) >= 0 ? p.dans : null;
    const half = dans && typeof p.halveTel === 'boolean' && cs.naam !== 'onbekend' ? p.halveTel : null;
    if (dans === SJ.dans && half === SJ.half) return;
    SJ.dans = dans; SJ.half = half; SJ.naam = cs ? cs.naam : null; SJ.tel = typeof beatPos === 'number' ? beatPos : 0; SJ.n++;
    DG.dans = dans;
  }
  addEventListener('clubstijl', () => { try { leesStijl(); } catch (e) { console.error('dansgevoel', e); } });

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
  const G = { fn: -1, tc: 0, nu: 0, dtb: 0, half: false, B: 1, st: 'groove', tIn: 0, oTel: 0, gloed: 0, laag: false, sync: klok(), loop: klok(),
              bpm: 120, snel: false, slag: klok(), stap: klok(), moshN: 0 };
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
    leesStijl();  // ook zonder event (stijl.js kan de preset ter plekke aanpassen): een paar velden lezen
    const bpm = G.bpm = 60 / period;
    if (SJ.half !== null) {  // de stijl beslist; leest de beatvolger al het halve tempo (dnb als 87), dan niet nog eens halveren
      if (!SJ.half) G.half = false;
      else if (!G.half && bpm >= 112) G.half = true;
      else if (G.half && bpm < 106) G.half = false;
    } else if (!G.half && period < 0.475) G.half = true;   // zonder stijl: boven ~126 BPM voel je de helft
    else if (G.half && period > 0.485) G.half = false;     // onder ~124 BPM weer elke tel
    G.B = G.half ? 0.5 : 1;
    // ritme van de stijl-laag: headbangen en pogo op de tel (boven ~150 BPM om de tel), skank-stappen op het hele tempo
    if (!G.snel && bpm > 152) G.snel = true; else if (G.snel && bpm < 146) G.snel = false;
    kNaar(G.slag, G.snel ? 0.5 : 1, G.tc, 4);
    kNaar(G.stap, bpm < 110 ? 2 : 1, G.tc, 4);
    moshLijst(tb);
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
  // figuren die de moshpit (club/moshpit.js) nu bestuurt: daar komt de stijl-laag niet overheen
  const MOSH = new Set();
  function moshLijst(tb) {
    const MP = window.clubMoshpit, R = window.clubRegie;
    if (!MP || !MP.arena) return;
    const kijk = MOSH.size || (R && (R.stand === 'opbouw' || R.stand === 'drop')) || frameNo % 20 === 0;  // anders zelden kijken
    if (!kijk) return;
    MOSH.clear();
    const a = MP.arena();
    for (let i = 0; i < 2; i++) {
      const A = i ? a.kamer : a.zaal;
      if (A && A.deel) for (let j = 0; j < A.deel.length; j++) MOSH.add(A.deel[j].d);
    }
  }

  // --- per danser ---
  const STAAT = new WeakMap();
  function st(d) {
    let s = STAAT.get(d);
    if (!s) {
      s = { T: Math.random(), lag: Math.random(), ph: Math.random() * TAU, klok: null, L: 1, Lt: 1, rt: 1, kL: 0.45, sst: 'groove', fn: -1,
            moment: -1e9, sync: null, handen: false, rust: null, rustT: Math.random() * 5, ts0: 0, f: 1, tilt: 0,
            // stijl: toegepaste dans, wisseltel (gespreid), laag (nu en doel), drankje en blik (lounge), eigen kleine timing
            dans: null, wN: -1, wTel: 0, lay: null, layD: null, glas: null, kijk: null, faceVoor: null, drinkM: 0, drinkA: null,
            vuistJa: Math.random() < 0.45, tOff: (Math.random() - 0.5) * 0.06, sOff: Math.random() < 0.2 ? 0.5 : 0, bKnik: 0 };
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
    if (!soort) stijlWissel(d, s, tb);
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
    // stijl: hoeveel dans er over de sta-clip komt en hoe snel (de laag bovenop doet de rest)
    const dn = soort ? null : s.dans, mom = tb < s.moment;
    if (dn === 'lounge') {  // vooral staan, kletsen en drinken; op de drop hooguit wat meer; nooit handen omhoog of het hele tempo
      L = Math.min(L, mom ? 0.45 : s.sst === 'drop' ? 0.28 + 0.2 * T : s.sst === 'break' ? 0.03 : 0.07 + 0.12 * T);
      r = Math.min(r, B); s.handen = false; k = Math.min(k, 0.6);
    } else if (dn === 'headbang' || dn === 'pogo') {  // voeten blijven staan: de laag (headbangen, springen) is de dans
      if (!mom && !s.handen) L = Math.min(L, (s.sst === 'drop' ? 0.42 : 0.24) + 0.2 * T);
      r = Math.min(r, B);
    } else if (dn === 'halftime') r = Math.min(r, B);  // zwaar en traag: ook op de drop op de halve tel
    s.Lwil = s.Lt = L; s.rt = r; s.kL = k;
    if (!soort && d.type === 'model') laagDoel(d, s, g, tb, mom);
  }
  // de stijl overnemen, ieder op een eigen tel (0,5-6,5 tellen na de wissel): nieuwe clip, lounge-dingen aan of uit
  function stijlWissel(d, s, tb) {
    if (s.dans === SJ.dans) return;
    if (s.wN !== SJ.n) { s.wN = SJ.n; s.wTel = Math.max(SJ.tel, Math.min(tb, SJ.tel + 4)) + 0.5 + s.lag * 4 + Math.random() * 2; }
    if (tb < s.wTel) return;
    const oud = s.dans;
    s.dans = SJ.dans;
    if (!s.lay) { s.lay = Object.assign({}, LAAG0); s.layD = Object.assign({}, LAAG0); }
    if (d.type === 'model') {
      if (tb >= s.moment && d.cur && d.fade >= 1 && d.nextChange > tb + 1) d.nextChange = Math.floor(tb) + 1;  // clip die bij de stijl past
      if (s.dans === 'lounge') loungeIn(d, s); else if (oud === 'lounge') loungeUit(d, s);
    } else {
      const lijst = s.dans && BOUW[s.dans];
      if (lijst && d.pq == null && d.move !== 9 && lijst.indexOf(d.move) < 0) d.move = pick(lijst);
    }
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
  function rustVeilig(c) {  // heup van c blijft altijd < 2,4 rad van elke heupstand van de sta-clips (kletsen en, lounge, drinken)
    const R = rustClip();
    if (!R || c === R) return true;
    let v = RV.get(c);
    if (v !== undefined) return v;
    v = true;
    for (const S of [R, drinkClip()]) {
      const a = heupen(c), b = S && S !== c && heupen(S);
      if (!a || !b) continue;
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
  // armen (boven- en onderarm) net zo: staan die bijna 180° uit elkaar (juichen met de armen omhoog -> een dans met de armen omlaag),
  // dan klapt de hand halverwege het overvloeien om (gemeten: 30-60 cm in één beeld). Om het andere monster, grens 2,6 rad.
  const ARMEN = new WeakMap(), ARM_BOT = /(^|[.|/])(LeftArm|RightArm|LeftForeArm|RightForeArm)\.quaternion$/;
  function armen(c) {
    let h = ARMEN.get(c);
    if (h === undefined) { h = c.tracks.filter(x => ARM_BOT.test(x.name)).map(t => ({ naam: t.name.replace(/^.*[.|/](\w+)\.quaternion$/, '$1'), ip: t.createInterpolant() })); ARMEN.set(c, h); }
    return h;
  }
  function armOk(ac, ta, c, tc) {
    const A = armen(ac), C = armen(c);
    for (let i = 0; i < A.length; i++) for (let j = 0; j < C.length; j++) {
      if (A[i].naam !== C[j].naam) continue;
      const r1 = A[i].ip.evaluate(ta); qh1.set(r1[0], r1[1], r1[2], r1[3]);
      const r2 = C[j].ip.evaluate(tc); qh2.set(r2[0], r2[1], r2[2], r2[3]);
      if (hoek(qh1, qh2) > 2.6) return false;
    }
    return true;
  }
  function startOk(a, c, b, tq, dK) {  // blijven heupen en armen van lopende actie a en clip c (start b) tijdens dK clip-tellen ver genoeg van 180°?
    const nb = c.beats, ac = a.getClip(), ab = ac.beats || Math.max(1, Math.round(ac.duration * 2));
    const n = Math.min(64, Math.max(6, Math.ceil(dK * Math.max(ac.duration / ab, c.duration / nb) / 0.03)));
    for (let k = 0; k <= n; k++) {
      const t = tq + dK * k / n, ta = fr((t + a.beatOff) / ab) * ac.duration, tc = fr((t + b) / nb) * c.duration;
      heupQ(ac, ta, qh1);
      heupQ(c, tc, qh2);
      if (hoek(qh1, qh2) > 2.4) return false;
      if (!(k & 1) && !armOk(ac, ta, c, tc)) return false;
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
  let RUST = null, JUICH = null, DRINK = null;
  const rustClip = () => RUST || (ACTS.Stand_and_Chat ? (RUST = ACTS.Stand_and_Chat.clone()) : null);
  const drinkClip = () => DRINK || (ACTS.Stand_and_Drink ? (DRINK = ACTS.Stand_and_Drink.clone()) : null);  // lounge: glas in de hand
  const juichClip = () => JUICH || (ACTS.Cheer_with_Both_Hands_Up ? (JUICH = ACTS.Cheer_with_Both_Hands_Up.clone()) : null);  // handen omhoog in de opbouw
  function rustlaag(d, s, dt) {  // gewicht (1-L)/L naast dans 1: de mixer middelt, dus L dans en 1-L rust
    const L = s.L, w = L > 0.985 ? 0 : (1 - L) / Math.max(L, 0.03);
    // lounge met een glas: de sta-clip vloeit over naar drinken (m -> 1); daarbuiten terug naar kletsen, het glas gaat weg als de hand omlaag is
    const mWil = s.glas && s.dans === 'lounge' && drinkClip() ? 1 : 0;
    s.drinkM = (s.drinkM || 0) + (mWil - (s.drinkM || 0)) * (1 - Math.exp(-dt * 0.6));
    if (!mWil && s.drinkM < 0.02) s.drinkM = 0;
    if (s.glas && !mWil && s.drinkM < 0.15) glasWeg(s);
    let a = s.rust, b = s.drinkA;
    if (w <= 0) { if (a && a.isRunning()) a.stop(); if (b && b.isRunning()) b.stop(); return; }
    s.rustT += dt * 0.85;
    const m = s.drinkM;
    if (m < 1) {
      if (!a) { const c = rustClip(); if (c) a = s.rust = d.mixer.clipAction(c); }
      if (a) { if (!a.isRunning()) a.play(); a.time = s.rustT % a.getClip().duration; a.setEffectiveWeight(w * (1 - m)); }
    } else if (a && a.isRunning()) a.stop();
    if (m > 0) {
      if (!b) b = s.drinkA = d.mixer.clipAction(DRINK);
      if (!b.isRunning()) b.play();
      b.time = s.rustT % b.getClip().duration;
      b.setEffectiveWeight(w * m);
    } else if (b && b.isRunning()) b.stop();
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
    if (s.lay && !soort) stijlLaag(d, s, g, A, dt);
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
    const nc = d.nextChange, ncK = (nc - tb - d.off) * r + tk + d.off, pq0 = d.pq;
    d.nextChange = ncK;
    // eigen knik van het vorige beeld eraf (pose vloeit vanaf de eigen houding); niet als iemand anders (moshpit) hem tussendoor poseerde
    if (s.bKnik && d.head && s.bFn === frameNo - 1) d.head.rotation.x -= s.bKnik;
    s.bKnik = 0; s.bFn = frameNo;
    try { oPose(d, tk, A2, dt); }
    finally { d.nextChange = d.nextChange === ncK ? nc : (d.nextChange - tk - d.off) / r + tb + d.off; }
    // stijl: pose koos net zelf een nieuwe beweging (geen vervolg van een moment): een die bij de stijl past
    const lijst = s.dans && !soort && (s.sst === 'break' ? BOUW_BREAK : BOUW[s.dans]);
    if (lijst && d.nextChange !== nc && pq0 == null && d.move !== 9 && lijst.indexOf(d.move) < 0) d.move = pick(lijst);
    if (!soort && A >= 0.08 && d.head && (s.dans === 'headbang' || s.dans === 'halftime')) {  // headbangen bovenop de beweging
      const c = s.dans === 'headbang' ? kWaarde(g.slag, g.tc) : kWaarde(g.sync, g.tc);
      s.bKnik = (s.sst === 'break' ? 0.1 : 0.45) * slag(c + s.tOff, 0.16, 3.4);
      d.head.rotation.x += s.bKnik;
    }
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
    const dn = s.dans, VK = dn && VOORKEUR[dn];
    const wil = klem(0.1 + 0.8 * s.T + (stand === 'drop' ? 0.35 : stand === 'break' ? -0.3 : stand === 'opbouw' ? -0.15 : 0.25 * G.gloed) + (dn ? WIL[dn] || 0 : 0));
    const w = CLIPS.map(c => c === cur && CLIPS.length > 1 || (rust && !rustVeilig(c)) ? 0
      : (Math.exp(-(((intens(c) - lo) / (hi - lo || 1) - wil) ** 2) / 0.08) + 1e-4) * (VK ? VK[clipNaam(c)] || 0.4 : 1));
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
    // niets veilig: de lopende clip nog even houden (over twee tellen opnieuw proberen) i.p.v. een wissel waarbij de heupen omklappen
    if (cur && d.fade >= 1) return null;
    const c = pick(CLIPS.length > 1 ? CLIPS.filter(x => x !== cur) : CLIPS);  // nog geen clip: zoals het origineel
    return { clip: c, b: Math.floor(rnd(0, c.beats)) };
  }

  // ===== stijl-laag: per muziekstijl een eigen manier van dansen =====
  // Clipkeuze (voorkeur per stijl), niveau en tempo (zie doel) en een laag bovenop de clip, per danser op een eigen tel overgevloeid:
  //  groove (house/techno): veren door de knieën en knikken op elke tel; drop: handen omhoog (moment) en hupjes
  //  handen (trance): handen in de lucht (de helft in de groove, massaal op de drop), wiegend
  //  halftime (dubstep): zwaar door de knieën en hard knikken op de halve tel (snare harder), voorovergebogen
  //  skank (dnb): knieën om en om omhoog op het hele tempo, armen als bij rennen
  //  bounce (hiphop): diep veren op de tel, armen pompen mee
  //  afro: heupen op een tresillo (3-3-2 over twee tellen) met voetwerk, het bovenlijf blijft rustig
  //  lounge: staan, kletsen in groepjes, glas in de hand, rustig deinen en kleine stapjes; niemand springt
  //  headbang (rock/metal): headbangen op de tel (boven ~150 BPM om de tel), vuist in de lucht
  //  pogo (punk): recht omhoog springen op de tel (hoogte uit de luchttijd), landen door de knieën
  // Alles in wereldrichtingen van de figuur (zij/voor/omhoog) om het scharnier van elk bot; de voeten blijven staan (knieën buigen en de
  // figuur zakt even veel), niemand schuift over de vloer. Botten die de mixer niet opnieuw schreef eerst terug (zoals meeleven.js).
  const VOORKEUR = {
    groove: { You_Groove: 1.6, OMG_Groove: 1.4, Arm_Circle_Shuffle: 1.6, Bass_Beats: 1, Boom_Dance: 1, Magic_Genie: 0.7, Hip_Hop_Dance_1: 0.35, Hip_Hop_Dance_3: 0.35 },
    handen: { Arm_Circle_Shuffle: 1.5, You_Groove: 1.5, Magic_Genie: 1.2, OMG_Groove: 1, Bass_Beats: 0.6, Boom_Dance: 0.6 },
    halftime: { Bass_Beats: 2, Boom_Dance: 2, Hip_Hop_Dance_3: 0.9, Hip_Hop_Dance_1: 0.7 },
    skank: { Arm_Circle_Shuffle: 2, Hip_Hop_Dance_1: 1.3, Hip_Hop_Dance_3: 1, Boom_Dance: 0.8 },
    bounce: { Hip_Hop_Dance_1: 2, Hip_Hop_Dance_3: 2, Boom_Dance: 1.5, Bass_Beats: 1.2 },
    afro: { You_Groove: 2, OMG_Groove: 2, Magic_Genie: 1.5, Arm_Circle_Shuffle: 0.6 },
    lounge: { You_Groove: 2, OMG_Groove: 1, Bass_Beats: 0.8, Boom_Dance: 0.8 },
    headbang: { Bass_Beats: 2, Boom_Dance: 2, Hip_Hop_Dance_3: 0.5 },
    pogo: { Boom_Dance: 1.5, Bass_Beats: 1.5, Hip_Hop_Dance_1: 1 },
  };
  const WIL = { lounge: -0.35, halftime: -0.1, afro: -0.05, skank: 0.15, bounce: 0.1, headbang: -0.15, pogo: 0.05 };  // rustiger of wilder clips
  const NAAM = new WeakMap();
  const clipNaam = c => { let n = NAAM.get(c); if (n === undefined) { n = c.name.split('|')[1] || c.name; NAAM.set(c, n); } return n; };
  // gebouwde figuren (MOVES in index.html): 0 pompen, 1 zijstap, 4 springen, 5 twist, 7 golf, 8 schouders, 9 klappen
  const BOUW = { lounge: [8, 1], handen: [9, 7], halftime: [0, 8], skank: [1, 0], bounce: [0, 8, 5], afro: [8, 5, 7], headbang: [0, 8], pogo: [4] };
  const BOUW_BREAK = [8, 1, 7];  // break: rustig (schouders, zijstap, golf), ook bij pogo en skank

  const LAAG0 = { dip: 0, dipH: 0, knik: 0, knikH: 0, bang: 0, voor: 0, sprong: 0, skank: 0, zwaai: 0, pomp: 0, heup: 0, wieg: 0, handen: 0, vuist: 0 };
  const LK = Object.keys(LAAG0);
  // doelsterkte van elk onderdeel (0..~1): stijl x sectie x temperament
  function laagDoel(d, s, g, tb, mom) {
    const D = s.layD;
    if (!D) return;
    for (let i = 0; i < LK.length; i++) D[LK[i]] = 0;
    const dn = s.dans, T = s.T, sec = s.sst, p = klem(g.oTel / 16), dr = sec === 'drop', br = sec === 'break', ob = sec === 'opbouw';
    if (!dn) return;
    if (energy < 0.08) { if (dn === 'lounge') D.wieg = 0.5; return; }  // stilte: alleen de lounge deint nog
    const I = (br ? 0.22 : ob ? 0.35 + 0.5 * p : dr ? 1 : 0.62 + 0.3 * g.gloed) * (0.6 + 0.4 * T);
    switch (dn) {
      case 'groove': D.dip = 0.8 * I; D.knik = 0.8 * I; if (dr && T > 0.45) D.sprong = 0.5; break;
      case 'handen':
        D.dip = 0.45 * I; D.knik = 0.5 * I;
        D.handen = dr ? 1 : ob ? (p > 0.9 - 0.7 * T ? 1 : 0) : br ? (T > 0.85 ? 0.6 : 0) : (T > 0.5 ? 0.85 : 0);
        if (dr && T > 0.6) D.sprong = 0.4;
        break;
      case 'halftime': D.dipH = 0.9 * I; D.knikH = (dr ? 1.15 : 0.85) * I; D.voor = 0.05 + 0.12 * I; D.knik = 0.12 * I; break;
      case 'skank':
        D.skank = (dr ? 1 : ob ? 0.25 + 0.6 * p : br ? 0.08 : 0.9) * (0.6 + 0.4 * T);
        D.zwaai = 0.85 * D.skank; D.knik = 0.5 * I; D.dip = 0.15 * I;
        break;
      case 'bounce': D.dip = 1.25 * I; D.knik = 0.9 * I; D.pomp = 0.75 * I; D.voor = 0.06 * I; break;
      case 'afro': D.heup = (0.55 + 0.45 * T) * (br ? 0.35 : ob ? 0.5 + 0.4 * p : dr ? 1 : 0.85); D.dip = 0.25 * I; D.knik = 0.3 * I; break;
      case 'lounge': D.wieg = dr ? 1 : 0.7; D.knik = dr ? 0.35 : 0.15; D.dip = dr ? 0.2 : 0; break;
      case 'headbang':
        D.bang = br ? 0.12 * T : (0.55 + 0.45 * T) * (ob ? 0.45 + 0.55 * p : 1) * (dr ? 1.1 : 0.85);
        D.vuist = dr ? (T > 0.25 ? 1 : 0) : ob ? (p > 1 - 0.8 * T ? 1 : 0) : br ? 0 : (s.vuistJa ? 0.9 : 0);
        D.voor = 0.1 * D.bang; D.dip = 0.25 * I;
        break;
      case 'pogo':
        D.sprong = br ? 0 : dr ? 1 : ob ? (T > 0.35 ? 0.25 + 0.6 * p : 0) : (T > 0.3 ? 0.55 + 0.45 * T : 0.2);
        D.knik = 0.4 * I; D.vuist = dr ? (s.vuistJa ? 1 : 0) : br ? 0 : (T > 0.8 ? 0.7 : 0);
        break;
    }
    if (mom) {  // moment (juichen, springen, YMCA, solo): de clip voert, de laag houdt zich in
      D.sprong = 0; D.skank = 0; D.zwaai = 0; D.vuist = 0; D.dip *= 0.4; D.dipH *= 0.4; D.heup *= 0.4; D.pomp *= 0.4; D.bang *= 0.5;
      if (s.sync) D.handen = 0;  // samen-moment (YMCA): de letters met de armen
    }
    if (s.handen && ob && dn !== 'handen') D.vuist = 0;  // handen-omhoog-clip aan het eind van de opbouw
  }

  // botten per figuur, met de schone stand (van de mixer) en wat de laag ervan maakte
  const BOT = ['Hips', 'Spine02', 'Spine', 'neck', 'Head', 'LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'];
  const RIG = new WeakMap();
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), vA = new THREE.Vector3(), vZ = new THREE.Vector3(), vV = new THREE.Vector3();
  const mP = new THREE.Matrix4(), mI = new THREE.Matrix4(), mR = new THREE.Matrix4();
  const qW = new THREE.Quaternion(), qD = new THREE.Quaternion();
  function rig(d) {
    let r = RIG.get(d);
    if (r !== undefined) return r;
    const b = {};
    if (d.body) d.body.traverse(o => { if (o.isBone && !b[o.name]) b[o.name] = o; });
    r = BOT.every(n => b[n] && b[n].parent) && b.LeftHand && b.RightHand
      ? { b, keep: BOT.map(n => ({ bone: b[n], base: b[n].quaternion.clone(), mine: b[n].quaternion.clone() })), dij: 0.33, scheen: 0.39, hw: 0.09, sp: 1, maatFn: -1e9, vuil: false }
      : null;
    RIG.set(d, r);
    return r;
  }
  // de mixer schrijft een bot alleen als zijn waarde veranderde: staat er nog precies onze stand, dan eerst de schone terug
  function schoon(r) {
    const K = r.keep;
    for (let i = 0; i < K.length; i++) {
      const k = K[i];
      if (k.bone.quaternion.equals(k.mine)) k.bone.quaternion.copy(k.base);
      k.base.copy(k.bone.quaternion);
    }
  }
  function onthoud(r) { const K = r.keep; for (let i = 0; i < K.length; i++) K[i].mine.copy(K[i].bone.quaternion); }
  // draaiing q in wereldruimte om het eigen scharnier van het bot (via de volle oudermatrix: ook gespiegelde figuren)
  function draaiQ(bone, q) {
    mP.copy(bone.parent.matrixWorld).setPosition(0, 0, 0);
    mI.copy(mP).invert();
    mR.makeRotationFromQuaternion(q);
    mI.multiply(mR).multiply(mP);
    qD.setFromRotationMatrix(mI);
    bone.quaternion.premultiply(qD);
  }
  function draai(bone, as, hoek) { if (hoek > 1e-4 || hoek < -1e-4) draaiQ(bone, qW.setFromAxisAngle(as, hoek)); }
  // bovenarm (of onderarm) zo draaien dat hij naar (omhoog u, voor f, buiten o) wijst, met gewicht w. Tussenstanden niet via een halve
  // draaiing (bij een hangende arm en een doel boven het hoofd kiest die steeds een andere weg: de arm schiet heen en weer) maar via een
  // richting die altijd langs voren/buiten loopt; de arm wijst dan precies die kant op en beweegt vloeiend mee.
  const vG = new THREE.Vector3(), qD2 = new THREE.Quaternion();
  function richt(bone, kind, u, f, o, w, kant) {  // kant: +1 = de arm aan de +zij-kant van de borst, -1 = de andere
    if (w < 0.01) return;
    v1.setFromMatrixPosition(bone.matrixWorld);
    v2.setFromMatrixPosition(kind.matrixWorld).sub(v1);
    if (v2.lengthSq() < 1e-12) return;
    v2.normalize();
    vV.set(vZ.x * f + vA.x * o * kant, u, vZ.z * f + vA.z * o * kant).normalize();
    const k = Math.min(1, w), bol = 0.8 * Math.sin(Math.PI * k);
    vG.set(vZ.x * 0.5 + vA.x * 0.85 * kant, 0, vZ.z * 0.5 + vA.z * 0.85 * kant);  // voor en buiten
    const gx = vG.x, gz = vG.z;
    vG.multiplyScalar(bol).addScaledVector(v2, 1 - k).addScaledVector(vV, k).normalize();  // richting voor dit gewicht
    // in twee stappen via een tussenrichting (elk < ~100°): de draaiing om de arm zelf springt dan niet als de arm bijna recht
    // tegen het doel in hangt (één minimale draaiing kiest daar steeds een andere as)
    vV.set(v2.x + vG.x + 0.6 * gx, v2.y + vG.y, v2.z + vG.z + 0.6 * gz).normalize();
    qW.setFromUnitVectors(v2, vV);
    qD2.setFromUnitVectors(vV, vG);
    qW.premultiply(qD2);
    draaiQ(bone, qW);
  }
  // assen van een lichaamsdeel uit twee botten links/rechts (heupen of schouders), horizontaal: clips draaien het lijf tot ~180° t.o.v. de
  // wortel, dus knikken, armen en knieën rekenen in het eigen assenstelsel van romp en bekken. sp = -1 bij een gespiegelde figuur.
  const vAh = new THREE.Vector3(), vZh = new THREE.Vector3(), vAc = new THREE.Vector3(), vZc = new THREE.Vector3();
  function assen(links, rechts, sp, uitA, uitZ) {
    v1.setFromMatrixPosition(links.matrixWorld); v2.setFromMatrixPosition(rechts.matrixWorld);
    let x = (v1.x - v2.x) * sp, z = (v1.z - v2.z) * sp;
    const l = Math.hypot(x, z);
    if (l < 1e-4) { uitA.copy(vA); uitZ.copy(vZ); return; }
    x /= l; z /= l;
    uitA.set(x, 0, z); uitZ.set(-z, 0, x);  // zij x omhoog = voor (zoals bij de wortel)
  }
  // slag op de tel: korte aanloop, piek precies op de (halve) tel, dan uitdempen
  function slag(u, aan, uit) { const x = fr(u + aan); return x < aan ? glad(x / aan) : Math.exp(-(x - aan) * uit); }
  // tresillo over twee tellen (accenten op de 0e, 3e en 6e zestiende): heup snel naar de kant van het accent, dan vasthouden
  function tresillo(tc) {
    const cyc = Math.floor(tc / 2), e = (tc / 2 - cyc) * 8, j = e < 3 ? 0 : e < 6 ? 1 : 2, a = j * 3, b = j < 2 ? a + 3 : 8;
    const kant = ((cyc * 3 + j) & 1) ? -1 : 1;
    return -kant + 2 * kant * glad(Math.min(1, (e - a) / (b - a) / 0.4));
  }
  // benen: dij a naar voren (knie), scheen netto b naar achteren, voet plat. Steunbeen: b zo dat de voet recht onder blijft
  // (dij * sin a = scheen * sin b), de figuur zakt dan precies zo veel als het been korter wordt: geen glijden, niet door de vloer
  const zakVan = (r, a, b) => r.dij * (1 - Math.cos(a)) + r.scheen * (1 - Math.cos(b));
  const bVan = (r, a) => Math.asin(Math.min(0.99, r.dij / r.scheen * Math.sin(a)));
  const aVan = (r, z) => z > 1e-5 ? Math.sqrt(2 * z / (r.dij + r.dij * r.dij / r.scheen)) : 0;  // buiging voor z meter lager (klein-hoekbenadering)
  function been(r, links, a, b, z) {  // z: eerst het hele been zijwaarts (om de voor-as), zodat de voet ook zijwaarts op zijn plek blijft
    const B = r.b;
    if (z) draai(links ? B.LeftUpLeg : B.RightUpLeg, vZ, z);
    if (a < 1e-4 && b < 1e-4) return;
    draai(links ? B.LeftUpLeg : B.RightUpLeg, vA, -a);
    draai(links ? B.LeftLeg : B.RightLeg, vA, a + b);
    draai(links ? B.LeftFoot : B.RightFoot, vA, -b);
  }
  // Steunbeen: de heup zakt 'zak' meter en schuift mee met het bekken (afro: dH = bekkendraaiing om het heupbot), de voet blijft staan.
  // Eerst het been zijwaarts om de voor-as (z), dan een twee-schakel-IK in het vlak voor/omlaag (knie aan dezelfde kant als in de clip).
  // Uit: z, a = dij zoveel naar voren, b = scheen netto zoveel naar achteren (voor been()). Lukt het niet (been bijna zijwaarts): false.
  const IKL = { a: 0, b: 0, z: 0 }, IKR = { a: 0, b: 0, z: 0 }, vH0 = new THREE.Vector3(), vK0 = new THREE.Vector3(), vF0 = new THREE.Vector3();
  const vHc = new THREE.Vector3(), vDh = new THREE.Vector3(), qHeup = new THREE.Quaternion(), qH2 = new THREE.Quaternion();
  let heupDraait = false;
  function ikMeet(r, links, zak, uit) {
    const B = r.b;
    uit.a = uit.b = uit.z = 0;
    vH0.setFromMatrixPosition((links ? B.LeftUpLeg : B.RightUpLeg).matrixWorld);
    vK0.setFromMatrixPosition((links ? B.LeftLeg : B.RightLeg).matrixWorld);
    vF0.setFromMatrixPosition((links ? B.LeftFoot : B.RightFoot).matrixWorld);
    if (heupDraait) { vDh.copy(vH0).sub(vHc); vV.copy(vDh).applyQuaternion(qHeup); vDh.subVectors(vV, vDh); } else vDh.set(0, 0, 0);
    // gewenst heup->voet = (F - H) + zak omhoog - dH
    const dX = -vDh.x, dY = zak - vDh.y, dZ = -vDh.z;
    const Lh = Math.max(0.2, vH0.y - vF0.y);
    const z = klem((dX * vA.x + dY * vA.y + dZ * vA.z) / Lh, -0.3, 0.3), cz = Math.cos(z), sz = Math.sin(z);
    // dij en scheen na het zijwaarts zwaaien: voor-deel blijft, omlaag-deel = -(zij * sin z + omhoog * cos z)
    const tA = (vK0.x - vH0.x) * vA.x + (vK0.y - vH0.y) * vA.y + (vK0.z - vH0.z) * vA.z, sA = (vF0.x - vK0.x) * vA.x + (vF0.y - vK0.y) * vA.y + (vF0.z - vK0.z) * vA.z;
    const tX = (vK0.x - vH0.x) * vZ.x + (vK0.z - vH0.z) * vZ.z, tY = -(tA * sz + (vK0.y - vH0.y) * cz);
    const sX = (vF0.x - vK0.x) * vZ.x + (vF0.z - vK0.z) * vZ.z, sY = -(sA * sz + (vF0.y - vK0.y) * cz);
    const Lt = Math.hypot(tX, tY), Ls = Math.hypot(sX, sY);
    if (Lt < 0.05 || Ls < 0.05) { DG.ikMis++; return false; }
    const X = tX + sX + dX * vZ.x + dZ * vZ.z, Y = vH0.y - vF0.y - dY, rr = Math.min(Lt + Ls - 1e-4, Math.max(Math.abs(Lt - Ls) + 1e-4, Math.hypot(X, Y)));
    const ft = Math.atan2(tX, tY), fs = Math.atan2(sX, sY), gam = Math.atan2(X, Y);
    const al = Math.acos(klem((Lt * Lt + rr * rr - Ls * Ls) / (2 * Lt * rr), -1, 1));
    const knieVoor = ft >= Math.atan2(tX + sX, tY + sY);
    const ft2 = knieVoor ? gam + al : gam - al;
    const fs2 = Math.atan2(X - Lt * Math.sin(ft2), Y - Lt * Math.cos(ft2));
    uit.a = ft2 - ft; uit.b = fs - fs2; uit.z = z;
    return true;
  }
  const UP = new THREE.Vector3(0, 1, 0);
  function stijlLaag(d, s, g, A, dt) {
    const r = rig(d), Ly = s.lay, D = s.layD;
    if (!r) return;
    if (DG.laagUit) return;  // testen: alleen clips en niveau van de stijl, geen laag
    if (MOSH.has(d)) {  // de moshpit bestuurt deze figuur: niets erover, en straks vanaf nul weer invloeien
      for (let i = 0; i < LK.length; i++) Ly[LK[i]] = 0;
      if (r.vuil) { schoon(r); onthoud(r); r.vuil = false; }
      return;
    }
    const kk = 1 - Math.exp(-g.dtb * 1.6);  // ~1 tel overvloeien (ieder op zijn eigen wisseltel: gespreid)
    let som = 0;
    for (let i = 0; i < LK.length; i++) { const k = LK[i]; Ly[k] += (D[k] - Ly[k]) * kk; som += Ly[k]; }
    if (som < 0.003) { if (r.vuil) { schoon(r); onthoud(r); r.vuil = false; } return; }
    const tc = g.tc + s.tOff, B = r.b;
    // --- benen en hoogte: veren (kip = kniebuiging van beide steunbenen), extra optillen per been (x), pogo, heupen ---
    let kip = 0, y = 0, tuck = 0, rol = 0, gier = 0, aLx = 0, bLx = 0, aRx = 0, bRx = 0, armL = 0, armR = 0, onderA = 0;
    if (Ly.dip > 0.002) kip += Ly.dip * 0.5 * slag(tc, 0.12, 4);
    const cH = kWaarde(g.sync, g.tc) + s.tOff;  // gevoelde tel (halve tel bij hoog tempo)
    if (Ly.dipH > 0.002) kip += Ly.dipH * 0.6 * slag(cH, 0.1, 2.6);
    if (Ly.wieg > 0.002) {  // lounge: gewicht van het ene been op het andere (hiel even los), over twee gevoelde tellen
      const w = Math.sin(Math.PI * cH * 0.5 + s.ph), kw = 0.09 * Ly.wieg;
      aLx += kw * Math.max(0, w); bLx += 1.3 * kw * Math.max(0, w); aRx += kw * Math.max(0, -w); bRx += 1.3 * kw * Math.max(0, -w);
      d.root.rotation.z = 0.022 * Ly.wieg * w;
    }
    if (Ly.sprong > 0.002) {  // recht omhoog; hoogte uit de luchttijd (g t²/8), landen op de tel
      const cs = kWaarde(g.slag, g.tc) + s.tOff + s.sOff, rate = Math.max(0.25, kHelling(g.slag, g.tc)), fa = 0.62, x = fr(cs + 0.81);
      const H = Math.min(0.3, 1.225 * (fa * period / rate) ** 2) * Ly.sprong;
      if (x < fa) { const u = x / fa; y += 4 * H * u * (1 - u); tuck = 0.35 * Ly.sprong * Math.sin(Math.PI * u); }
      else kip += 0.34 * Ly.sprong * Math.sin(Math.PI * (x - fa) / (1 - fa));
    }
    if (Ly.skank > 0.002) {  // knie om en om omhoog op het hele tempo, het steunbeen veert bij elke stap
      const cS = kWaarde(g.stap, g.tc) + s.tOff, n = Math.floor(cS), x = cS - n, lift = Ly.skank * Math.pow(Math.sin(Math.PI * x), 1.3);
      if (n & 1) { aRx += 1.0 * lift; bRx += 1.3 * lift; } else { aLx += 1.0 * lift; bLx += 1.3 * lift; }
      kip += 0.1 * Ly.skank * (1 - Math.sin(Math.PI * x));
      const z = Math.cos(Math.PI * cS) * Ly.zwaai;  // armen tegen de benen in
      armL += 0.55 * z; armR -= 0.55 * z; onderA += 0.8 * Ly.zwaai;
    }
    if (Ly.heup > 0.002) { const v = tresillo(tc) * Ly.heup; rol = 0.11 * v; gier = 0.08 * v; }  // afro: bekken naar de kant van het accent
    if (Ly.pomp > 0.002) { const f = slag(tc, 0.12, 4) * Ly.pomp; armL -= 0.32 * f; armR -= 0.32 * f; onderA += 0.45 * f; }
    if (r.maatFn < frameNo - 120) {  // beenlengte (dij, scheen) en halve heupbreedte; af en toe opnieuw (het doolhof schaalt figuren)
      r.maatFn = frameNo;
      d.root.updateMatrixWorld(true);
      B.LeftUpLeg.getWorldPosition(v1); B.LeftLeg.getWorldPosition(v2);
      r.dij = Math.max(0.05, v1.distanceTo(v2));
      r.scheen = Math.max(0.05, v2.distanceTo(B.LeftFoot.getWorldPosition(vV)));
      B.RightUpLeg.getWorldPosition(v2);
      r.hw = 0.5 * v1.distanceTo(v2);
      r.sp = d.body.matrixWorld.determinant() < 0 ? -1 : 1;
    }
    // hoogte: de figuur zakt zo veel als kip bij een gestrekt been geeft (plus de bekkenkanteling); elk steunbeen buigt daarna met
    // een kleine IK in het vlak voor/omhoog precies zo dat zijn voet blijft staan. Extra (x: skank, wiegen, in de lucht) tilt de voet op.
    const zK = kip > 1e-4 ? zakVan(r, kip, bVan(r, kip)) : 0, hs = rol ? (r.hw || 0.09) * Math.sin(Math.abs(rol)) : 0, zak = zK + hs;
    d.root.position.y += y - zK - hs;
    r.dy = y - zK - hs; r.stL = aLx + tuck < 1e-3 && y < 1e-4; r.stR = aRx + tuck < 1e-3 && y < 1e-4;  // voor voetTest
    const opt = window.clubOpt && clubOpt.anim;
    if (!d.root.visible || (opt && opt.stil && opt.stil(d))) return;  // pose dit beeld niet bijgewerkt: dan ook niets erbovenop
    schoon(r); r.vuil = true;
    d.root.updateMatrixWorld(true);
    const e = d.root.matrixWorld.elements;
    vA.set(e[0], e[1], e[2]).normalize(); vZ.set(e[8], e[9], e[10]).normalize();
    assen(B.LeftUpLeg, B.RightUpLeg, r.sp, vAh, vZh); assen(B.LeftArm, B.RightArm, r.sp, vAc, vZc);
    vA.copy(vAh); vZ.copy(vZh);
    // benen meten vóór er iets draait (bekkendraaiing van de afro meegerekend); lukt de IK niet (been bijna zijwaarts): recht-been-benadering
    heupDraait = !!(rol || gier);
    if (heupDraait) { vHc.setFromMatrixPosition(B.Hips.matrixWorld); qHeup.setFromAxisAngle(UP, gier).multiply(qH2.setFromAxisAngle(vZ, rol)); }
    const ikNodig = zak > 1e-5 || heupDraait;
    if (!(ikNodig && ikMeet(r, true, zak, IKL))) { IKL.a = aVan(r, zK); IKL.b = IKL.a ? bVan(r, IKL.a) : 0; IKL.z = 0; }
    if (!(ikNodig && ikMeet(r, false, zak, IKR))) { IKR.a = aVan(r, zK); IKR.b = IKR.a ? bVan(r, IKR.a) : 0; IKR.z = 0; }
    // --- armen eerst (gemeten in de houding van de clip); romp en hoofd nemen ze daarna mee. Assen van de borst ---
    vA.copy(vAc); vZ.copy(vZc);
    const kL = r.sp;  // linkerarm zit aan de +zij-kant (gespiegeld: de andere)
    if (Ly.handen > 0.01) {  // V boven het hoofd, wiegend
      const o = 0.42 + 0.14 * Math.sin(Math.PI * cH + s.ph), w = Ly.handen;
      richt(B.LeftArm, B.LeftForeArm, 1, 0.28, o, w, kL); richt(B.RightArm, B.RightForeArm, 1, 0.28, o, w, -kL);
      B.LeftArm.updateMatrixWorld(true); B.RightArm.updateMatrixWorld(true);
      richt(B.LeftForeArm, B.LeftHand, 1, 0.2, o * 0.6, w, kL); richt(B.RightForeArm, B.RightHand, 1, 0.2, o * 0.6, w, -kL);
    }
    if (Ly.vuist > 0.01) {  // rechts (of links bij een gespiegelde figuur) de vuist omhoog, pompend op de tel
      const f = slag(tc, 0.1, 4), w = Ly.vuist;
      richt(B.RightArm, B.RightForeArm, 0.85 + 0.15 * f, 0.35 - 0.2 * f, 0.22, w, -kL);
      B.RightArm.updateMatrixWorld(true);
      richt(B.RightForeArm, B.RightHand, 1, 0.12, 0.05, w, -kL);
    }
    draai(B.LeftArm, vA, armL); draai(B.RightArm, vA, armR);
    if (onderA > 0.01) { draai(B.LeftForeArm, vA, -onderA); draai(B.RightForeArm, vA, -onderA); }
    // --- hoofd en romp: knikken op de tel, zwaar op de halve tel (snare harder), headbangen, voorover ---
    let hoofd = 0, nek = 0, borst = Ly.voor;
    if (Ly.knik > 0.002) { const f = Ly.knik * slag(tc + 0.02, 0.1, 5); hoofd += 0.2 * f; nek += 0.1 * f; }
    if (Ly.knikH > 0.002) { const f = Ly.knikH * (Math.floor(cH + 0.08) & 1 ? 1 : 0.65) * slag(cH, 0.08, 3.5); hoofd += 0.26 * f; nek += 0.18 * f; borst += 0.08 * f; }
    if (Ly.bang > 0.002) {
      const f = Ly.bang * slag(kWaarde(g.slag, g.tc) + s.tOff, 0.18, 3.2);
      hoofd += 0.45 * f; nek += 0.35 * f; borst += 0.24 * f;
    }
    draai(B.Head, vA, hoofd); draai(B.neck, vA, nek); draai(B.Spine, vA, borst);
    // --- heupen (afro): bekken kantelt en draait, romp en benen draaien terug (isolatie). Assen van het bekken ---
    vA.copy(vAh); vZ.copy(vZh);
    if (rol || gier) {
      draai(B.Hips, vZ, rol); draai(B.Hips, UP, gier);
      draai(B.Spine02, vZ, -rol * 1.1); draai(B.Spine02, UP, -gier * 0.7);
      draai(B.LeftUpLeg, vZ, -rol); draai(B.LeftUpLeg, UP, -gier); draai(B.RightUpLeg, vZ, -rol); draai(B.RightUpLeg, UP, -gier);
    }
    // in de lucht: voeten wat omhoog (telt niet mee voor de hoogte)
    been(r, true, IKL.a + aLx + tuck, IKL.b + bLx + tuck * 1.4, IKL.z);
    been(r, false, IKR.a + aRx + tuck, IKR.b + bRx + tuck * 1.4, IKR.z);
    onthoud(r);
  }

  // --- lounge: glas in de hand (een deel), groepjes die naar elkaar toe staan te kletsen ---
  function loungeIn(d, s) {
    if (!s.glas && d.body && Math.random() < 0.45 && typeof giveDrink === 'function' && typeof held !== 'undefined') {
      const n = held.length, soort = Math.random() < 0.6 ? 'glas' : 'bier';
      try { giveDrink(d, soort); } catch (e) { console.error('dansgevoel glas', e); }
      if (held.length > n && held[held.length - 1].d === d) { s.glas = held[held.length - 1]; s.glas.soort = soort; }
    }
    // groepje: naar de dichtstbijzijnde buur draaien (alleen in zaal 1 en zaal 2: daar kennen we de buren)
    const lijst = dancers.indexOf(d) >= 0 ? dancers : zone2Dancers.indexOf(d) >= 0 ? zone2Dancers : null;
    if (!lijst) return;
    let best = null, bd = 2.4;
    for (const o of lijst) {
      if (o === d || o.type !== 'model' || o.acts) continue;
      const dd = Math.hypot(o.home.x - d.home.x, o.home.z - d.home.z);
      if (dd < bd) { bd = dd; best = o; }
    }
    if (!best) return;
    s.faceVoor = d.faceT !== undefined ? d.faceT : d.face;
    s.kijk = Math.atan2(best.home.x - d.home.x, best.home.z - d.home.z) + (Math.random() - 0.5) * 0.5;
  }
  function loungeUit(d, s) {
    if (s.kijk !== null) { d.faceT = d.face0 !== undefined ? d.face0 : s.faceVoor; s.kijk = null; }
  }
  function glasWeg(s) {
    const h = s.glas;
    s.glas = null;
    if (!h) return;
    const i = held.indexOf(h);
    if (i >= 0) held.splice(i, 1);
    if (h.g.parent) h.g.parent.remove(h.g);
    if (h.soort === 'glas' && h.g.children[1]) h.g.children[1].material.dispose();  // eigen kleur van het drankje (glas en fles zijn gedeeld)
  }
  function blijfKijken(lijst) {
    for (let i = 0; i < lijst.length; i++) {
      const d = lijst[i], s = STAAT.get(d);
      if (s && s.kijk !== null && s.dans === 'lounge' && beatPos >= s.moment + 1) d.faceT = s.kijk;
    }
  }
  clubHooks.push(() => { if (SJ.dans === 'lounge') { blijfKijken(dancers); blijfKijken(zone2Dancers); } });  // na een moment draait index.html ze terug

  // momenten per stijl: YMCA alleen waar het past; in de lounge springt niemand op de drop (wel even juichen op laag niveau)
  const YMCA_NEE = ['lounge', 'halftime', 'skank', 'headbang', 'pogo'];
  if (typeof startMoment === 'function') {
    const oMoment = startMoment;
    startMoment = function (k, tb) {
      if (DG.aan && k === 'ymca' && SJ.dans && YMCA_NEE.indexOf(SJ.dans) >= 0) return;
      const r = oMoment.apply(this, arguments);
      if (DG.aan && k === 'drop' && SJ.dans === 'lounge') {
        const t = typeof tb === 'number' && isFinite(tb) ? tb : beatPos;
        for (const d of dancers) {
          const s = STAAT.get(d);
          if (!s || s.dans !== 'lounge' || d.acts) continue;
          if (d.type === 'model') { d.queue = []; if (s.moment > t + 3) s.moment = Math.floor(t) + 3; if (d.nextChange > t + 3) d.nextChange = Math.floor(t) + 3; }
          else d.pq = null;  // gebouwd: klappen, niet springen
        }
      }
      return r;
    };
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
    if (!k) { d.nextChange = Math.floor(t) + 2; return; }
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
      if (s && s.drinkA) s.drinkA.stop();
      if (s && s.glas) glasWeg(s);
    }
  };
  DG.staat = d => STAAT.get(d);  // testen
  // testen: hoeveel verschuift de laag de voeten die op de vloer staan? (met en zonder laag in hetzelfde beeld; mm)
  const vT0 = new THREE.Vector3(), vT1 = new THREE.Vector3();
  DG.voetTest = () => {
    let n = 0, som = 0, max = 0, zSom = 0, zMax = 0;
    for (const d of [...dancers, ...zone2Dancers]) {
      const r = RIG.get(d), s = STAAT.get(d);
      if (!r || !r.vuil || !s || !s.lay || !d.root.visible) continue;
      const K = r.keep;
      d.root.updateMatrixWorld(true);
      const p1 = [r.b.LeftFoot.getWorldPosition(new THREE.Vector3()), r.b.RightFoot.getWorldPosition(new THREE.Vector3())];
      for (const k of K) k.bone.quaternion.copy(k.base);
      d.root.position.y -= r.dy; d.root.updateMatrixWorld(true);
      const p0 = [r.b.LeftFoot.getWorldPosition(new THREE.Vector3()), r.b.RightFoot.getWorldPosition(new THREE.Vector3())];
      for (const k of K) k.bone.quaternion.copy(k.mine);
      d.root.position.y += r.dy; d.root.updateMatrixWorld(true);
      for (let i = 0; i < 2; i++) {
        if (!(i ? r.stR : r.stL) || p0[i].y > 0.25) continue;  // alleen steunvoeten die in de clip op de vloer staan (enkelbot 0,13-0,22 m)
        const h = Math.hypot(p1[i].x - p0[i].x, p1[i].z - p0[i].z) * 1000, z = Math.abs(p1[i].y - p0[i].y) * 1000;
        n++; som += h; max = Math.max(max, h); zSom += z;
        if (z > zMax) { zMax = z; DG.ergste = { fig: d.M ? d.M.file : d.type, voet: i ? "R" : "L", p0y: +p0[i].y.toFixed(3), p1y: +p1[i].y.toFixed(3), dy: +r.dy.toFixed(3), clip: d.cur ? clipNaam(d.cur.getClip()) : null, sectie: s.sst, moment: beatPos < s.moment }; }
      }
    }
    return { voeten: n, schuifMm: n ? +(som / n).toFixed(1) : 0, schuifMax: +max.toFixed(1), hoogteMm: n ? +(zSom / n).toFixed(1) : 0, hoogteMax: +zMax.toFixed(1) };
  };
  DG.stijl = () => ({ dans: SJ.dans, naam: SJ.naam, half: G.half, bpm: Math.round(G.bpm), mosh: MOSH.size,
    dansers: [...dancers, ...zone2Dancers].filter(d => d.root.parent).map(d => {
      const s = STAAT.get(d) || {}, L = s.lay;
      return { fig: d.M ? d.M.file.replace(/^models\/|\.glb$/g, '') : d.type, dans: s.dans, glas: !!s.glas,
               laag: L ? Object.fromEntries(LK.filter(k => L[k] > 0.01).map(k => [k, +L[k].toFixed(2)])) : null,
               clip: d.cur ? clipNaam(d.cur.getClip()) : 'move ' + d.move };
    }) });
  DG.info = () => [...dancers, ...zone2Dancers].filter(d => d.root.parent).map(d => {
    const s = STAAT.get(d) || {};
    return { fig: d.M ? d.M.file.replace(/^models\/|\.glb$/g, '') : d.type, T: +(s.T || 0).toFixed(2), sectie: s.sst, niveau: +(s.L || 0).toFixed(2),
             tempo: s.klok ? +kHelling(s.klok, G.tc).toFixed(2) : null, handen: !!s.handen,
             clip: d.cur ? (d.cur.getClip().name.split('|')[1] || d.cur.getClip().name) : d.type === 'model' ? null : 'move ' + d.move };
  });
})();

// Moshpit op de drop. In de laatste ~8 tellen van de opbouw opent de vloer een kring: de dansers lopen (loopclip, stappen op de tel)
// naar een ring om het midden en juichen met het gezicht naar binnen. Op de drop rennen ze het midden in (Run_02) en moshen 16 tellen:
// springen (Happy_jump_f, elke sprong op de tel), tegen elkaar aan beuken (uitval, botsing, het lijf slaat terug; heupen nooit dichter
// dan 0,58 m) en een deel rent een circle pit. Daarna lopen ze terug naar hun plek en dansgevoel.js neemt het vloeiend weer over.
// Verplaatsen alleen met een loop- of renclip die even snel gaat als de figuur (aandeel van de clip = snelheid / cliptempo): geen glijden.
// Waar: zaal 1 (vloerdansers, ook de gebouwde) en de doolhofkamer waar de camera is (figuren met rol dans/juich; vrije plek gemeten
// met stralen tegen de kamer vanaf de plekken van de dansers; de loper blijft via doolhof.houdLoper staan en doet mee).
// Camera: SHOTS.moshpit in zaal 1 (alleen de regie knipt erheen: de drop wordt dit shot) en in het doolhof een eigen kamer.cam zolang
// de pit loopt: eerst hoog boven de kring, op de drop laag in de pit tussen de springers, af en toe een rondgaande kraan.
// Kans 60% per drop; de eerste drop altijd en nooit twee drops achter elkaar zonder. meeleven.js slaat dan zijn drop-golf over.
// Alleen bij een stijl met mosh (window.clubStijl.preset.mosh: dubstep, dnb, rock, metal, punk); bij house, lounge enz. geen kring en
// geen pit (dansgevoel.js laat ze anders dansen); wisselt de stijl midden in de pit, dan lopen ze rustig terug. Zonder clubStijl geen
// mosh, tenzij .keus = true. Ophypen: zolang de kring open is juichen, klappen (gebouwd) en springen ze op de plek, steeds wilder; minstens
// preset.ophypeMin tellen (17-10: dubstep/dnb 20, rock/metal 16, punk 12). Bij dubstep/dnb vormt de kring zich al in de break vóór de
// opbouw (BREAK_OPEN tellen erin, zonder camera; die knipt pas bij de opbouw) en hypet de hele opbouw door. De pit gaat pas los op de echte drop (eigen meting per tel, preset.dropBevestig): na-stilte = stilte en dan de
// bassprong (een bas die na de opbouw terugkomt is nog geen drop; zonder stilte pas als hij een hele maat vol blijft), bassprong = grote
// sprong op tel 1, riff = harde volle inzet na een rustiger stuk (de kring opent dan ook zonder opbouw). Geen drop binnen ~32 tellen of
// een break: kring dicht. Duur preset.moshTellen, circle pit volgens preset.cirkel.
// Test: clubMoshpit.info(), .keus = true|false|null (altijd/nooit/stijl+kans), .zet(false), .meten = true -> .meting (glijden en afstanden).
(() => {
  'use strict';
  if (window.clubMoshpit || typeof pose !== 'function' || typeof clubHooks === 'undefined' || typeof SHOTS === 'undefined' ||
      typeof startShot !== 'function' || typeof startMoment !== 'function') return;
  const MP = window.clubMoshpit = { aan: true, kans: 0.6, keus: null, meten: false, meting: null, log: [], botsingen: 0 };
  const UP = new THREE.Vector3(0, 1, 0);
  const klem = (x, a, b) => Math.max(a, Math.min(b, x));
  const fr = x => x - Math.floor(x);
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  const glad = u => u * u * (3 - 2 * u);
  const nu = () => performance.now() / 1000;
  const noteer = (wat, x) => { MP.log.push(Object.assign({ t: Math.round(nu()), tel: Math.floor(beatPos), wat }, x)); if (MP.log.length > 40) MP.log.shift(); };

  // tellen vanaf de drop D (en de opening in de opbouw)
  const OPEN_TEL = 4, MAX_OPEN = 104;              // opbouwTel waarop de kring opent (de opbouw wordt ~3 tellen na zijn begin herkend); max. open
  const WACHT = 32;                                 // zo lang na het openen (en min. 16 na de opbouw) op de echte drop wachten
  // langer ophypen (17-10 avond): bij dubstep/dnb vormt de kring zich al BREAK_OPEN tellen in de break vóór de opbouw (zonder camera; die
  // knipt pas bij de opbouw), en hypet door de hele opbouw heen; de pit blijft op de drop. Komt er geen opbouw of drop: na BREAK_MAX dicht.
  const BREAK_OPEN = 8, BREAK_MAX = 72;
  const STORM = 2, CIRKEL0 = 4;                     // de pit zelf duurt A.T tellen (preset.moshTellen)
  const D_MIN = 0.58, D_RAAK = 0.68, V_MAX = 3.8;  // heupen nooit dichter dan D_MIN; botsing onder D_RAAK

  // --- clips: eigen kopieën (geen gedeelde acties met dansgevoel en de momenten) ---
  let CL = null;
  function clips() {
    if (CL) return CL;
    const A = ACTS;
    if (!A.Casual_Walk || !A.Run_02 || !A.Cheer_with_Both_Hands_Up || !A.Happy_jump_f) return null;
    CL = { loop: A.Casual_Walk.clone(), ren: A.Run_02.clone(), juich: A.Cheer_with_Both_Hands_Up.clone(), spring: A.Happy_jump_f.clone() };
    CL.pieken = sprongPieken(CL.spring);
    return CL;
  }
  // sprongen: de toppen van de heupen in Happy_jump_f (grote sprongen en kleine hupjes door elkaar, niet gelijkmatig)
  function sprongPieken(c) {
    const t = c.tracks.find(x => /(^|[.|/])Hips\.position$/.test(x.name));
    if (!t) return null;
    const v = t.values, ts = t.times, n = ts.length, ys = [];
    for (let i = 0; i < n; i++) ys.push(v[i * 3 + 1]);
    const srt = ys.slice().sort((a, b) => a - b), med = srt[n >> 1], drempel = med + (srt[n - 1] - med) * 0.18;
    const pk = [];
    for (let i = 1; i < n - 1; i++) if (ys[i] > drempel && ys[i] > ys[i - 1] && ys[i] >= ys[i + 1] && (!pk.length || ts[i] - pk[pk.length - 1] > 0.25)) pk.push(ts[i]);
    return pk.length >= 2 ? pk : null;
  }
  // tijdkaart: elke sprong krijgt een heel aantal tellen (zo dicht mogelijk bij zijn eigen duur), de top valt op de halve tel
  function sprongProgramma(P) {
    const pk = CL.pieken, D = CL.spring.duration;
    if (!pk) return null;
    const seg = [];
    let U = 0;
    for (let i = 0; i < pk.length; i++) {
      const a = pk[i], b = i + 1 < pk.length ? pk[i + 1] : pk[0] + D, gap = b - a, n = Math.max(1, Math.round(gap / P));
      seg.push({ a, gap, U, n }); U += n;
    }
    return { seg, U, D };
  }
  function sprongTijd(prog, u) {
    const x = ((u % prog.U) + prog.U) % prog.U;
    let s = prog.seg[0];
    for (const q of prog.seg) { if (q.U <= x) s = q; else break; }
    return (s.a + (x - s.U) / s.n * s.gap) % prog.D;
  }

  // --- tempo van lopen en rennen per figuur: gemeten aan de voeten (m/s bij clip-tempo 1 en 1,75 m lang, stapduur) ---
  const GANG = new Map(), STD = { loop: { v: 0.66, stap: 0.7, n: 6 }, ren: { v: 3.3, stap: 0.367, n: 2 } };
  const mv = new THREE.Vector3();
  function meetGang(M, clip) {
    const AN = window.clubOpt && clubOpt.anim, was = AN && AN.aan;
    if (AN) AN.aan = false;  // de optimalisatie zou de proefmixer overslaan (hangt niet in de scène)
    try {
      const body = THREE.SkeletonUtils.clone(M.scene), g = new THREE.Group();
      body.scale.setScalar(1.75 / M.h); g.add(body);
      const mix = new THREE.AnimationMixer(body); mix.clipAction(clip).play();
      const b = {};
      body.traverse(o => { if (o.isBone) b[o.name] = o; });
      if (!b.LeftFoot || !b.RightFoot) return null;
      const N = Math.max(40, Math.round(clip.duration * 60)), rij = [];
      for (let i = 0; i <= N; i++) {
        mix.setTime(clip.duration * i / N); g.updateMatrixWorld(true);
        rij.push([b.LeftFoot.getWorldPosition(mv).toArray(), b.RightFoot.getWorldPosition(mv).toArray()]);
      }
      let ymin = 1e9;
      for (const q of rij) ymin = Math.min(ymin, q[0][1], q[1][1]);
      let afst = 0, tijd = 0, wissels = 0, vorig = -1;
      const dt = clip.duration / N;
      for (let i = 1; i <= N; i++) {  // de laagste voet staat op de grond: zo snel als die naar achteren gaat, gaat het lijf vooruit
        const k = rij[i][0][1] < rij[i][1][1] ? 0 : 1;
        if (vorig >= 0 && k !== vorig) wissels++;
        vorig = k;
        const a = rij[i - 1][k], c = rij[i][k];
        if (a[1] < ymin + 0.03 && c[1] < ymin + 0.03) { afst -= c[2] - a[2]; tijd += dt; }
      }
      if (tijd <= 0 || afst <= 0 || wissels < 1) return null;
      const n = Math.max(2, 2 * Math.round(wissels / 2));
      return { v: afst / tijd, n, stap: clip.duration / n };
    } catch (e) { return null; } finally { if (AN) AN.aan = was; }
  }
  function meetVoorraad() {  // één clip per beeld, alleen zonder pit
    if (ZAAL || KAMER || !CL) return;
    for (const M of allModels()) {
      let g = GANG.get(M);
      if (!g) GANG.set(M, g = {});
      if (!g.loop) { g.loop = meetGang(M, CL.loop) || STD.loop; return; }
      if (!g.ren) { g.ren = meetGang(M, CL.ren) || STD.ren; return; }
    }
  }
  // stappen per tel: zo dat het cliptempo in de buurt van het eigen tempo blijft (lopen ~1,45x, rennen ~0,95x)
  function spbKies(stap, P, doel) {
    let best = 1, bs = 1e9;
    for (const s of [0.5, 1, 2]) { const sc = Math.abs(Math.log(stap * s / P / doel)); if (sc < bs) { bs = sc; best = s; } }
    return best;
  }

  // --- deelnemers ---
  const DEEL = new Map();  // figuur -> deelnemer
  let ZAAL = null, KAMER = null;
  function maakDeel(A, d, extra) {
    const built = d.type !== 'model';
    const h = built ? 1.75 * Math.abs(d.root.scale.y) : Math.abs(d.body.scale.y) * d.M.h;
    const g = !built && GANG.get(d.M) || {}, gl = g.loop || STD.loop, gr = g.ren || STD.ren;
    const DG = window.clubDansgevoel, s = DG && DG.staat ? DG.staat(d) : null;
    const p = Object.assign({
      d, A, built, f: klem(h / 1.75, 0.6, 1.5), gl, gr, spbL: spbKies(gl.stap, period, 1.45), spbR: spbKies(gr.stap, period, 0.95),
      x: d.root.position.x, z: d.root.position.z, vx: 0, vz: 0, wilX: 0, wilZ: 0, face: d.root.rotation.y,
      tx: 0, tz: 0, tdx: 0, tdz: 0, hx: 0, hz: 0, thuis: { x: d.home.x, z: d.home.z }, face0: d.face0 !== undefined ? d.face0 : d.face,
      st: 'wacht', wDans: 1, wl: 0, lr: 0, rj: 1, anim: 'staan', rust: 'juich', kijk: null, kijkDoel: null, snel: 0,
      offL: Math.floor(Math.random() * 6), offR: Math.floor(Math.random() * 2), offJ: Math.floor(Math.random() * 4), offS: 0,
      T: s && s.T !== undefined ? s.T : Math.random(), ank: null, duwT: -99, duwKijk: null, duwTot: -99, renner: false,
      act: null, mine: null, slot: null, vLoop: 1, vRen: 3, offK: Math.floor(Math.random() * 4),
    }, extra || {});
    if (built) { p.gl = STD.loop; p.gr = STD.ren; }
    DEEL.set(d, p); A.deel.push(p);
    snelheden(p);
    return p;
  }
  function snelheden(p) {  // loop- en rensnelheid bij de stappen op de tel (het cliptempo is dan stap * spb / period)
    const P = period;
    p.vLoop = p.gl.v * p.f * (p.gl.stap * p.spbL / P);
    p.vRen = p.gr.v * p.f * (p.gr.stap * p.spbR / P);
  }
  const mobiel = p => p.st !== 'ring' && p.st !== 'uit' && p.st !== 'wacht';
  function naarHuis(p) { p.st = 'terug'; p.ank = null; p.renner = false; }
  function laatLos(p) {  // terug naar dansgevoel (bij afbreken midden in de pit: ter plekke)
    const d = p.d;
    if (DEEL.get(d) === p) DEEL.delete(d);
    const i = p.A.deel.indexOf(p); if (i >= 0) p.A.deel.splice(i, 1);
    if (p.act) for (const k in p.act) p.act[k].stop();
    if (!d.root.parent) return;
    d.face = p.face; d.faceT = p.face + wrap(p.face0 - p.face);
    if (p.built) { d.pq = null; d.nextChange = Math.floor(beatPos + d.off) + 1; }
    else { d.px = p.x - d.home.x; d.pz = p.z - d.home.z; d.root.quaternion.setFromAxisAngle(UP, d.face); }
  }
  function startUit(p) {  // thuis: dansgevoel vloeit er weer in (gebouwd: meteen, hun gewrichten vloeien zelf)
    const d = p.d;
    p.st = 'uit'; p.vx = p.vz = 0;
    if (p.built) { laatLos(p); return; }
    d.queue = null; d.nextChange = Math.floor(beatPos) + 1;  // eerst een verse dans
    d.face = p.face; d.faceT = p.face + wrap(p.face0 - p.face);
    d.px = p.x - d.home.x; d.pz = p.z - d.home.z;
  }

  // --- arena: zaal 1 of de kamer ---
  function nieuweArena(soort, ouder, cx, cz) {
    return { soort, ouder, cx, cz, y0: 0, klein: false, rIn: 0.6, camLaag: null, deel: [], obst: [], statisch: [], D: null, T: 16, spanning: 0, b0: null, fase: 'nieuw', prog: null, nbJ: 4, dir: Math.random() < 0.5 ? -1 : 1,
             cirkel: false, cirkelUit: false, cirkelMag: true, cBasis: 0, cHoek: 0, cOmega: 0, terugTel: null, camAan: false,
             cam: { fase: null, ts0: 0, a: Math.random() * Math.PI * 2, dir: Math.random() < 0.5 ? -1 : 1, kraan: Math.random() < 0.75, k0: 6, k1: 14 } };
  }
  function straalMaten(A, n) {
    A.klein = A.Rring < 2.1;  // krappe kamer: de lage camera staat aan de rand (niet in het midden), springen tot in het midden
    A.rIn = A.klein ? 0 : 0.6;
    A.Rm = A.klein ? Math.max(0.6, A.Rring - 0.65) : klem(A.Rring - 1.15, 0.85, 1.35);  // springzone
    A.Rc = A.Rring - (A.klein ? 0.3 : 0.35);                                              // circle pit
    A.cirkelMag = A.Rc - 1.05 >= A.rIn + 0.45 && n >= 4;
  }
  function maakZaal() {
    if (typeof dancers === 'undefined') return null;
    const ds = dancers.filter(d => d.root.parent && !d.acts && !d.seat && !DEEL.has(d) && (d.type === 'model' ? !!(d.mixer && d.body && d.M) : !!d.joints));
    if (ds.length < 4) return null;
    const A = nieuweArena('zaal1', scene, 0, 0);
    A.f = 6; A.Rring = klem(ds.length * 1.3 / (Math.PI * 2) + 0.9, 2.3, 3.0);
    straalMaten(A, ds.length);
    Object.assign(A.cam, { rH: 3.3, yH: 5.9, fovH: 62, rK: 4.6, yK: 4.4 });
    A.obstFn = () => {  // de slak en wie niet (meer) meedoet: die staan te dansen, daar loopt niemand doorheen
      const o = typeof slug !== 'undefined' && slug && slug.root.visible ? [{ x: slug.root.position.x, z: slug.root.position.z, r: SLUG_R + 0.3 }] : [];
      for (const d of dancers) if (d.root.parent && !DEEL.has(d)) o.push({ x: d.root.position.x, z: d.root.position.z, r: 0.62 });
      return o;
    };
    for (const d of ds) maakDeel(A, d);
    noteer('zaal1', { n: A.deel.length, ring: +A.Rring.toFixed(2) });
    return A;
  }
  function ringSlots(A, lijst) {  // gelijk verdeeld over de ring, in de volgorde van de hoek (geen gekruiste paden)
    const n = lijst.length, hoek = p => Math.atan2(p.x - A.cx, p.z - A.cz);
    lijst.sort((a, b) => hoek(a) - hoek(b));
    let sx = 0, sz = 0;
    lijst.forEach((p, i) => { const a = hoek(p) - Math.PI * 2 * i / n; sx += Math.sin(a); sz += Math.cos(a); });
    const basis = Math.atan2(sx, sz);
    lijst.forEach((p, i) => { const a = basis + Math.PI * 2 * i / n; p.slot = { x: A.cx + Math.sin(a) * A.Rring, z: A.cz + Math.cos(a) * A.Rring }; });
  }
  function startOpen(A, tel) {
    A.b0 = tel; A.fase = 'open';
    if (A.soort === 'zaal1') ringSlots(A, A.deel.slice());
    // ophypen in de ring: springen (elke sprong op de tel, elk een andere) en juichen
    A.prog = sprongProgramma(period); A.progP = period;
    A.nbJ = Math.max(2, 2 * Math.round(CL.juich.duration / period / 2));
    for (const p of A.deel) { p.st = 'naarRing'; p.rust = 'juich'; p.offS = A.prog ? A.prog.seg[Math.floor(Math.random() * A.prog.seg.length)].U : 0; }
    noteer('open', { waar: A.soort, n: A.deel.length });
  }
  // op de tel: wie juicht en wie springt; hoe meer spanning (dichter bij de drop), hoe meer springers en hoe vaker een nieuwe keus.
  // Iedereen leunt op de tel even naar binnen (juichen naar het midden). Gebouwde dansers: juichen = klappen boven het hoofd.
  function ophypen(A, tel) {
    const s = A.spanning, per = s > 0.75 ? 2 : 4;
    for (const p of A.deel) {
      if (p.st !== 'ring') continue;
      if ((tel + p.offK) % per === 0) p.rust = Math.random() < 0.12 + 0.75 * s * (0.6 + 0.4 * p.T) ? 'spring' : 'juich';
      const nx = A.cx - p.x, nz = A.cz - p.z, l = Math.hypot(nx, nz) || 1, k = 0.04 + 0.1 * s;
      p.tdx += nx / l * k; p.tdz += nz / l * k;
    }
  }
  function nieuwAnker(A, p, rIn, rUit, dichtbij) {  // plek in de springzone, niet te dicht bij de andere ankers
    const a0 = Math.atan2(p.x - A.cx, p.z - A.cz);
    let best = null, bd = -1;
    for (let i = 0; i < 24; i++) {
      const a = dichtbij ? a0 + (Math.random() - 0.5) * 1.6 : a0 + (Math.random() - 0.5) * 1.0, r = Math.sqrt(rIn * rIn + Math.random() * (rUit * rUit - rIn * rIn));
      const x = A.cx + Math.sin(a) * r, z = A.cz + Math.cos(a) * r;
      let m = 9;
      for (const q of A.deel) if (q !== p && q.ank) m = Math.min(m, Math.hypot(q.ank.x - x, q.ank.z - z));
      if (m > bd) { bd = m; best = { x, z }; }
      if (m >= 0.72) break;
    }
    return best;
  }
  function startDrop(A, D) {
    A.D = D; A.fase = 'mosh'; A.T = Math.max(8, moshTellen());
    // de sprongen van het ophypen lopen door (anders springt de heup van wie net springt naar een andere fase); alleen bij een ander tempo opnieuw
    const nieuw = !A.prog || Math.abs(period - A.progP) / A.progP > 0.04;
    if (nieuw) { A.prog = sprongProgramma(period); A.progP = period; }
    A.nbJ = Math.max(2, 2 * Math.round(CL.juich.duration / period / 2));
    const n = A.deel.length, nr = A.cirkelMag && cirkelStijl() ? (n >= 6 ? Math.round(n * 0.45) : 2) : 0;
    const wild = A.deel.slice().sort((a, b) => b.T - a.T);
    wild.forEach((p, i) => { p.renner = i < nr; });
    for (const p of A.deel) {
      snelheden(p);
      p.ank = null;
      if (nieuw || p.offS == null) p.offS = A.prog ? A.prog.seg[Math.floor(Math.random() * A.prog.seg.length)].U : 0;  // elk een andere sprong, allemaal op de tel
    }
    for (const p of A.deel) { p.ank = nieuwAnker(A, p, A.rIn, A.Rm, false); p.st = 'storm'; p.kijkDoel = null; }
    noteer('drop', { waar: A.soort, n, renners: nr });
  }
  function startCirkel(A) {
    A.cirkel = true;
    const renners = A.deel.filter(p => p.renner && (p.st === 'spring' || p.st === 'storm'));
    if (renners.length < 2) { for (const p of A.deel) p.renner = false; return; }
    const hoek = p => Math.atan2(p.x - A.cx, p.z - A.cz), n = renners.length;
    renners.sort((a, b) => hoek(a) - hoek(b));
    let sx = 0, sz = 0;
    renners.forEach((p, i) => { const a = hoek(p) - Math.PI * 2 * i / n; sx += Math.sin(a); sz += Math.cos(a); });
    A.cBasis = Math.atan2(sx, sz); A.cHoek = 0;
    A.cOmega = 0.88 * renners.reduce((s, p) => s + p.vRen, 0) / n / A.Rc;
    renners.forEach((p, i) => { p.st = 'cirkel'; p.slotI = i; p.nR = n; });
    for (const p of A.deel) if (!p.renner && (p.st === 'spring' || p.st === 'storm')) p.ank = nieuwAnker(A, p, A.rIn, A.Rc - 1.05, true);  // springers naar binnen
  }
  function sluitArena(A, waarom) {  // geen drop (meer), of een stijl zonder mosh: iedereen loopt rustig terug
    if (A.fase === 'terug') return;
    A.fase = 'terug'; A.terugTel = Math.floor(beatPos); A.cirkelUit = true;
    for (const p of A.deel) if (p.st !== 'uit') naarHuis(p);
    noteer('dicht', { waar: A.soort, waarom });
  }

  // --- gedrag per beeld ---
  function zoek(p, tx, tz, v, rem) {  // gewenste snelheid naar (tx, tz), in de laatste rem meter afremmen
    const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
    if (d < 1e-4) { p.wilX = p.wilZ = 0; return 0; }
    const s = Math.min(v, v * d / rem);
    p.wilX = dx / d * s; p.wilZ = dz / d * s;
    return d;
  }
  function gedrag(A, p, tb, dt) {
    p.kijk = null;
    if (p.st !== 'uit') p.wDans = Math.max(0, p.wDans - dt / 0.6);
    switch (p.st) {
      case 'naarRing': {
        p.anim = 'loop'; p.rust = 'juich';
        const d = zoek(p, p.slot.x, p.slot.z, p.vLoop, 0.7);
        if (d < 0.08 && p.snel < 0.25) p.st = 'ring';
        break;
      }
      case 'ring':  // ophypen (juichen of springen: ophypen() op de tel)
        p.anim = 'staan';
        zoek(p, p.slot.x, p.slot.z, 0.3, 0.3);
        p.kijk = Math.atan2(A.cx - p.x, A.cz - p.z);
        break;
      case 'storm': {
        p.anim = 'ren'; p.rust = 'spring';
        const d = zoek(p, p.ank.x, p.ank.z, p.vRen, 1.1);
        if ((d < 0.4 && p.snel < 1.2) || (A.D != null && tb > A.D + STORM + 1.5)) p.st = 'spring';  // uitgerend (of klem tussen anderen): springen
        break;
      }
      case 'spring': {
        p.anim = 'staan'; p.rust = 'spring';
        zoek(p, p.ank.x, p.ank.z, 0.35, 0.5);
        if (tb < p.duwTot && p.duwKijk != null) p.kijk = p.duwKijk;
        else {
          if (p.kijkDoel == null || Math.random() < dt * 0.25) p.kijkDoel = Math.atan2(A.cx - p.x, A.cz - p.z) + (Math.random() - 0.5) * 2.4;
          p.kijk = p.kijkDoel;
        }
        break;
      }
      case 'cirkel': {
        p.anim = 'ren'; p.rust = 'spring';
        const th = A.cBasis + Math.PI * 2 * p.slotI / p.nR + A.dir * A.cHoek, lead = A.dir * 0.45;
        const tx = A.cx + Math.sin(th + lead) * A.Rc, tz = A.cz + Math.cos(th + lead) * A.Rc;
        const lag = wrap(th - Math.atan2(p.x - A.cx, p.z - A.cz)) * A.dir;  // achter het eigen slot: harder (tot het eigen tempo), ervoor: inhouden
        zoek(p, tx, tz, p.vRen * klem(0.92 + 1.2 * lag, 0.5, 1), 0.01);
        break;
      }
      case 'terug': {
        p.anim = 'loop'; p.rust = 'juich';
        const d = zoek(p, p.thuis.x, p.thuis.z, p.vLoop, 0.7);
        if (d < 0.04 && p.snel < 0.2) startUit(p);
        break;
      }
      case 'uit':
        p.anim = 'staan'; p.wilX = p.wilZ = 0;
        p.wDans = Math.min(1, p.wDans + dt / 0.9);
        if (p.wDans >= 1) laatLos(p);
        break;
      default: p.anim = 'staan'; p.wilX = p.wilZ = 0;
    }
  }
  function duwen(A, tb) {  // op de tel: een springer valt uit naar een buur (die daarna terugslaat in de botsing)
    const springers = A.deel.filter(p => p.st === 'spring');
    const keer = springers.length >= 7 ? 2 : 1;
    for (let k = 0; k < keer; k++) {
      if (Math.random() > 0.65) continue;
      const vrij = springers.filter(p => tb - p.duwT > 1.6);
      const a = vrij[Math.floor(Math.random() * vrij.length)];
      if (!a) return;
      let b = null, bd = 9;
      for (const q of springers) {
        if (q === a) continue;
        const d = Math.hypot(q.x - a.x, q.z - a.z);
        if (d > 0.7 && d < 1.45 && d < bd) { bd = d; b = q; }
      }
      if (!b) continue;
      const nx = (b.x - a.x) / bd, nz = (b.z - a.z) / bd;
      a.duwT = tb; a.duwTot = tb + 0.75; a.duwKijk = Math.atan2(nx, nz);
      a.vx += nx * 1.5; a.vz += nz * 1.5;
      a.tdx += nx * 0.16; a.tdz += nz * 0.16;  // schouder erin
    }
  }
  function uitwijken(A, p) {  // lopers en renners gaan om anderen en obstakels heen (zijwaarts), in plaats van ertegenaan te duwen
    if (p.anim === 'staan') return;
    const v = Math.hypot(p.wilX, p.wilZ);
    if (v < 0.05) return;
    const fx = p.wilX / v, fz = p.wilZ / v;
    let ax = 0, az = 0;
    const kijk = (qx, qz, r) => {
      const dx = p.x - qx, dz = p.z - qz, d = Math.hypot(dx, dz) || 1e-4, R = r + 0.55;
      if (d >= R || dx * fx + dz * fz > 0.3 * d) return;  // alleen wat vóór (of naast) hem staat
      const zij = fx * dz - fz * dx >= 0 ? 1 : -1, k = (R - d) / R;
      ax += (dx / d * 0.6 - fz * zij) * k; az += (dz / d * 0.6 + fx * zij) * k;
    };
    for (const q of A.deel) if (q !== p && q.st !== 'storm' && q.st !== 'cirkel') kijk(q.x, q.z, 0.45);
    for (const o of A.obstNu) kijk(o.x, o.z, o.r);
    if (!ax && !az) return;
    p.wilX += ax * v * 1.4; p.wilZ += az * v * 1.4;
    const n = Math.hypot(p.wilX, p.wilZ); if (n > v) { p.wilX *= v / n; p.wilZ *= v / n; }
  }
  function versnel(p, dt) {
    // eerst draaien, dan lopen; en pas op gang komen als de dans eruit is (anders schuiven de voeten van de dansclip mee)
    if (p.anim !== 'staan' && p.st !== 'cirkel') {
      const v = Math.hypot(p.wilX, p.wilZ);
      if (v > 0.05) {
        const fout = Math.abs(wrap(Math.atan2(p.wilX, p.wilZ) - p.face)), f = (1 - p.wDans) * (fout < 0.8 ? 1 : Math.max(0.3, Math.cos(fout - 0.8)));
        p.wilX *= f; p.wilZ *= f;
      }
    }
    const k = 1 - Math.exp(-dt * (p.st === 'spring' ? 2.5 : 5));
    p.vx += (p.wilX - p.vx) * k; p.vz += (p.wilZ - p.vz) * k;
  }
  // heupen nooit door elkaar: botsing (snelheid) en daarna de plek; wie stilstaat (ring, thuis) wordt niet geschoven
  function botsen(A, eerste) {
    const L = A.deel, n = L.length;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = L[i], b = L[j];
      const ax = a.x + a.hx, az = a.z + a.hz, bx = b.x + b.hx, bz = b.z + b.hz;
      let dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz);
      if (d >= D_RAAK) continue;
      if (d < 1e-4) { dx = Math.random() - 0.5; dz = Math.random() - 0.5; d = Math.hypot(dx, dz); }
      const nx = dx / d, nz = dz / d, ma = mobiel(a), mb = mobiel(b);
      const wa = ma ? (mb ? 0.5 : 1) : (mb ? 0 : 0.5);
      if (eerste) {
        const vrel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
        if (vrel < -0.3 && ma && mb && (a.st === 'spring' || b.st === 'spring')) {  // botsing: beiden slaan terug en leunen weg
          const J = -vrel * 0.85 + 0.35;
          a.vx -= nx * J * 0.5; a.vz -= nz * J * 0.5; b.vx += nx * J * 0.5; b.vz += nz * J * 0.5;
          a.tdx -= nx * 0.2; a.tdz -= nz * 0.2; b.tdx += nx * 0.26; b.tdz += nz * 0.26;
          MP.botsingen++; A.botsingen = (A.botsingen || 0) + 1;
        } else if (vrel < 0) {  // naar elkaar toe: dat deel van de snelheid eraf
          a.vx += nx * vrel * wa; a.vz += nz * vrel * wa; b.vx -= nx * vrel * (1 - wa); b.vz -= nz * vrel * (1 - wa);
        }
      }
      if (d < D_MIN) {
        const o = D_MIN - d;
        a.x -= nx * o * wa; a.z -= nz * o * wa; b.x += nx * o * (1 - wa); b.z += nz * o * (1 - wa);
      }
    }
    // vaste obstakels: andere figuren, de slak, de camera in het midden van de pit
    const obst = A.obstNu;
    for (const p of L) {
      if (!mobiel(p)) continue;
      for (const o of obst) {
        const dx = p.x + p.hx - o.x, dz = p.z + p.hz - o.z, d = Math.hypot(dx, dz) || 1e-4, r = o.r;
        if (d >= r) continue;
        const nx = dx / d, nz = dz / d, vn = p.vx * nx + p.vz * nz;
        p.x += nx * (r - d); p.z += nz * (r - d);
        if (vn < 0) { p.vx -= nx * vn; p.vz -= nz * vn; }
      }
    }
  }
  function beweeg(A, p, dt) {
    const d = p.d;
    let sp = Math.hypot(p.vx, p.vz);
    if (sp > V_MAX) { p.vx *= V_MAX / sp; p.vz *= V_MAX / sp; sp = V_MAX; }
    if (p.st === 'uit') { p.x = d.root.position.x; p.z = d.root.position.z; p.face = d.face; }
    else { p.x += p.vx * dt; p.z += p.vz * dt; }
    p.snel = sp;
    // kijkrichting: wie loopt of rent kijkt waar hij heen wil (ook als hij nog stilstaat: eerst draaien), anders p.kijk
    const loopt = (p.anim === 'loop' || p.anim === 'ren') && Math.hypot(p.wilX, p.wilZ) > 0.02;
    const want = loopt ? Math.atan2(p.wilX, p.wilZ) : p.kijk;
    // (draaien pas als de dans grotendeels weg is: in een danshouding staan de heupen soms ver naast de voeten en zwaaien ze mee rond)
    const draai = loopt ? (p.wDans > 0.5 ? 0 : 2.5 + 5 * p.wl) : 3;
    if (want != null && p.st !== 'uit') p.face += wrap(want - p.face) * Math.min(1, dt * draai);
    // kanteling: een duw dooft uit; renners in de cirkel leunen naar binnen
    const kd = Math.exp(-dt * 3);
    p.tdx *= kd; p.tdz *= kd;
    let gx = p.tdx, gz = p.tdz;
    if (p.st === 'cirkel') { const rx = A.cx - p.x, rz = A.cz - p.z, rl = Math.hypot(rx, rz) || 1, k = 0.13 * Math.min(1, sp / 2.5); gx += rx / rl * k; gz += rz / rl * k; }
    const kt = 1 - Math.exp(-dt * 7);
    p.tx += (gx - p.tx) * kt; p.tz += (gz - p.tz) * kt;
    const tl = Math.hypot(p.tx, p.tz); if (tl > 0.35) { p.tx *= 0.35 / tl; p.tz *= 0.35 / tl; }
    // aandeel lopen/rennen = echte snelheid / cliptempo: de voeten gaan even snel als de figuur
    snelheden(p);
    const vLoc = p.lr * p.vRen + (1 - p.lr) * p.vLoop;
    const wlWil = p.anim === 'staan' ? 0 : klem(sp / Math.max(0.1, vLoc), 0, 1);
    p.wl += (wlWil - p.wl) * (1 - Math.exp(-dt * 10));
    if (p.anim !== 'staan') p.lr += ((p.anim === 'ren' ? 1 : 0) - p.lr) * (1 - Math.exp(-dt * 5));
    p.rj += ((p.rust === 'juich' ? 1 : 0) - p.rj) * (1 - Math.exp(-dt * (p.st === 'ring' ? 3 : 5)));  // ophypen: juichen <-> springen rustig overvloeien
  }
  const hv = new THREE.Vector3();
  function heupVan(p) { return p.built ? p.d.hips : hipsOf(p.d); }
  function heupOffsets(A) {  // heup t.o.v. de wortel (uit het laatst getekende beeld), voor de afstanden
    for (const p of A.deel) {
      const h = heupVan(p), e = p.d.root.matrixWorld.elements;
      if (!h) { p.hx = p.hz = 0; continue; }
      h.getWorldPosition(hv);
      let ox = hv.x - e[12], oz = hv.z - e[14];
      const ol = Math.hypot(ox, oz); if (ol > 0.35) { ox *= 0.35 / ol; oz *= 0.35 / ol; }
      p.hx = ox; p.hz = oz;
    }
  }
  function arenaBeeld(A, dt, tb, opTel) {
    if (A.soort === 'kamer' && !kamerGeldig(A)) return afbreken(A, 'kamer weg');
    for (let i = A.deel.length - 1; i >= 0; i--) { const p = A.deel[i]; if (!p.d.root.parent || DEEL.get(p.d) !== p) { if (DEEL.get(p.d) === p) DEEL.delete(p.d); A.deel.splice(i, 1); } }
    if (A.D != null) {
      const k = tb - A.D;
      if (!A.cirkel && k >= CIRKEL0 && A.fase === 'mosh') startCirkel(A);
      if (A.cirkel && !A.cirkelUit && k >= A.T - 1) { A.cirkelUit = true; for (const p of A.deel) if (p.st === 'cirkel') naarHuis(p); }
      if (A.cirkel && !A.cirkelUit) A.cHoek += A.cOmega * dt;
      if (A.fase === 'mosh' && k >= A.T) { A.fase = 'terug'; A.terugTel = A.D + A.T; for (const p of A.deel) if (p.st !== 'terug' && p.st !== 'uit') naarHuis(p); }
      if (opTel && A.fase === 'mosh' && k >= STORM && k < A.T - 1) {
        duwen(A, tb);
        if (Math.floor(k) % 4 === 2) for (const p of A.deel) if (p.st === 'spring') p.ank = nieuwAnker(A, p, A.rIn, A.cirkel && !A.cirkelUit ? A.Rc - 1.05 : A.Rm, true);  // de pit schuift
      }
    } else if (A.fase === 'open') {
      A.spanning = SP;
      if (opTel) ophypen(A, Math.floor(tb));
      if (Math.floor(tb) - A.b0 > MAX_OPEN) sluitArena(A, 'te lang');
    }
    // obstakels van dit beeld
    const o = A.obstNu = A.statisch.slice();
    if (A.obstFn) for (const q of A.obstFn()) o.push(q);
    if ((A.D != null && tb >= A.D && tb < A.D + A.T && A.fase === 'mosh') || A.cam.hoog === false) o.push(A.camLaag ? { x: A.camLaag.x, z: A.camLaag.z, r: 0.45 } : { x: A.cx, z: A.cz, r: 0.5 });  // plek van de lage camera
    heupOffsets(A);
    for (const p of A.deel.slice()) gedrag(A, p, tb, dt);
    for (const p of A.deel) { uitwijken(A, p); versnel(p, dt); }
    botsen(A, true);
    for (const p of A.deel) beweeg(A, p, dt);
    botsen(A, false);
    if (MP.meten) meet(A, tb);
    if (A.camAan && camKlaar(A, tb)) camTerug(A);
    if (!A.deel.length) klaar(A);
  }
  function klaar(A) {
    camTerug(A);
    if (ZAAL === A) ZAAL = null;
    if (KAMER === A) KAMER = null;
    noteer('klaar', { waar: A.soort, botsingen: A.botsingen || 0 });
  }
  function afbreken(A, waarom) {
    for (const p of A.deel.slice()) {
      if (A.R && A.R.weg) { if (DEEL.get(p.d) === p) DEEL.delete(p.d); }  // de kern zette de figuren al terug in de voorraad
      else laatLos(p);
    }
    A.deel.length = 0;
    camTerug(A);
    if (ZAAL === A) ZAAL = null;
    if (KAMER === A) KAMER = null;
    noteer('afgebroken', { waar: A.soort, waarom });
  }

  // --- toepassen in pose: wortel, kanteling, clips op de tel ---
  const qY = new THREE.Quaternion(), qT = new THREE.Quaternion(), vAs = new THREE.Vector3();
  function zetWortel(d, p) {
    d.root.position.set(p.x, p.A.y0, p.z);
    qY.setFromAxisAngle(UP, p.face);
    const tl = Math.hypot(p.tx, p.tz);
    if (tl > 1e-3) { vAs.set(p.tz / tl, 0, -p.tx / tl); qT.setFromAxisAngle(vAs, tl); d.root.quaternion.multiplyQuaternions(qT, qY); }
    else d.root.quaternion.copy(qY);
  }
  function animModel(d, p, tb) {
    const C = CL, A = p.A;
    if (!p.act) {
      p.act = {};
      for (const k of ['loop', 'ren', 'juich', 'spring']) { const a = d.mixer.clipAction(C[k]); a.play(); a.setEffectiveWeight(0); p.act[k] = a; }
      p.mine = new Set(Object.values(p.act));
    }
    const keep = 1 - p.wDans, wl = p.wl;
    p.act.loop.time = fr((tb * p.spbL + p.offL) / p.gl.n) * C.loop.duration;
    p.act.ren.time = fr((tb * p.spbR + p.offR) / p.gr.n) * C.ren.duration;
    p.act.juich.time = fr((tb + p.offJ) / (A.nbJ || 4)) * C.juich.duration;
    p.act.spring.time = A.prog ? sprongTijd(A.prog, tb - 0.5 + p.offS) : fr((tb + p.offS) / 20) * C.spring.duration;
    p.act.loop.setEffectiveWeight(wl * (1 - p.lr) * keep);
    p.act.ren.setEffectiveWeight(wl * p.lr * keep);
    p.act.juich.setEffectiveWeight((1 - wl) * p.rj * keep);
    p.act.spring.setEffectiveWeight((1 - wl) * (1 - p.rj) * keep);
    // alles van dansgevoel en de momenten samen naar wDans (bij 0 helemaal weg). Hun gewichten tellen niet op tot 1 (de mixer middelt;
    // de rustlaag van dansgevoel weegt tot ~30): eerst op 1 brengen, anders domineren ze tot het laatste beeld en springt de houding
    const L = d.mixer._actions, n = d.mixer._nActiveActions;
    let som = 0;
    for (let i = 0; i < n; i++) if (!p.mine.has(L[i])) som += L[i].getEffectiveWeight();
    const f = p.wDans / Math.max(1, som);
    for (let i = 0; i < n; i++) { const a = L[i]; if (!p.mine.has(a)) a.setEffectiveWeight(a.getEffectiveWeight() * f); }
    d.mixer.update(0);
  }
  // gebouwde figuren: eigen houding, en net als in index.html vloeiend naar die houding (gewrichten), dus geen sprongen
  function gangBuilt(d, p, tb) {
    const ren = p.lr > 0.5, ph = Math.PI * (tb * (ren ? p.spbR : p.spbL) + p.offL), s = Math.sin(ph), c = Math.cos(ph);
    const a = (ren ? 0.85 : 0.5) * klem(p.snel / Math.max(0.1, ren ? p.vRen : p.vLoop), 0.25, 1), kb = ren ? 1.5 : 0.8;
    d.L.hip.rotation.x = -a * s; d.R.hip.rotation.x = a * s;
    d.L.knee.rotation.x = kb * a * Math.max(0, c); d.R.knee.rotation.x = kb * a * Math.max(0, -c);
    d.L.sh.rotation.x = 0.9 * a * s; d.R.sh.rotation.x = -0.9 * a * s;
    d.L.el.rotation.x = d.R.el.rotation.x = ren ? -1.4 : -0.4;
    d.torso.rotation.x = ren ? 0.18 : 0.05;
    d.hips.position.y = d.hipY - (ren ? 0.05 : 0.02) * Math.abs(c);
  }
  function poseBuilt(d, p, tb, dt) {
    const J = d.joints, P = d.prev;
    for (let i = 0; i < J.length; i++) { P[i * 3] = J[i].rotation.x; P[i * 3 + 1] = J[i].rotation.y; P[i * 3 + 2] = J[i].rotation.z; }
    P[J.length * 3] = d.hips.position.y;
    for (const g of J) g.rotation.set(0, 0, 0);
    d.hips.position.y = d.hipY;
    zetWortel(d, p);
    const t = tb + d.off, phi = fr(t);
    if (p.wl > 0.3) gangBuilt(d, p, tb);
    else if (p.rj < 0.5) MOVES[4](d, t, phi, 0.85);  // springen (op de tel)
    else MOVES[9](d, t, phi, 0.9);                    // klappen boven het hoofd
    d.head.rotation.x += 0.12 * Math.sin(Math.PI * 2 * t);
    const k = 1 - Math.exp(-dt * (d.type === 'robot' ? 34 : 17));
    for (let i = 0; i < J.length; i++) {
      const r = J[i].rotation;
      r.set(P[i * 3] + (r.x - P[i * 3]) * k, P[i * 3 + 1] + (r.y - P[i * 3 + 1]) * k, P[i * 3 + 2] + (r.z - P[i * 3 + 2]) * k);
    }
    d.hips.position.y = P[J.length * 3] + (d.hips.position.y - P[J.length * 3]) * k;
  }
  const oPose = pose;
  pose = function (d, tb, A, dt) {
    const p = d && DEEL.get(d);
    if (!p || !CL) return oPose.apply(this, arguments);
    try {
      if (p.built) return poseBuilt(d, p, tb, dt);
      if (p.wDans > 0.001) oPose.apply(this, arguments);  // dansgevoel eronder, vloeit weg of komt terug
      if (p.st !== 'uit') zetWortel(d, p);
      animModel(d, p, tb);
    } catch (e) { console.error('moshpit', e); laatLos(p); return oPose.apply(this, arguments); }
  };

  // --- doolhofkamer: dansers, vrije plek (stralen vanaf plekken waar zeker niets staat), loper vasthouden ---
  // Het zware deel (plek zoeken, vrije straal, camera) rekent op de achtergrond zodra de camera een kamer in komt, in stukjes van
  // ~1,5 ms per beeld (een volle kamer kost ~3000 stralen, ~0,4 s in één keer). Bij de opening of de drop alleen nog de ringplekken,
  // de paden erheen en de loper (een paar ms).
  const RC = new THREE.Raycaster(); RC.layers.enableAll();
  const vO = new THREE.Vector3(), vR = new THREE.Vector3();
  const PLAN = new WeakMap(), KAMER_NEE = new WeakMap(), STAP_MS = 1.5;
  let cyclusNr = 0;
  function botsLijst(G, figRoots, alles) {  // massieve dingen in de kamer (geen figuren, lichtbundels, gloed, punten of sprites)
    const uit = [];       // alles: ook gloed en panelen (voor de camera: die mag ook niet door een lichtplafond)
    const fysiek = m => m && m.visible !== false && (alles || (m.blending !== THREE.AdditiveBlending && !(m.transparent && m.depthWrite === false)));
    (function af(o) {
      if (!o.visible || figRoots.has(o)) return;
      if (o.isMesh && !o.isSkinnedMesh && o.geometry) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        if (ms.some(fysiek)) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); uit.push(o); }
      }
      for (const c of o.children) af(c);
    })(G);
    return uit;
  }
  function straal(K, x, y, z, dx, dy, dz, ver, cam) {  // afstand tot de eerste botsing (kamer-coördinaten; cam: alles telt)
    const G = K.G.position;
    RC.set(vO.set(G.x + x, G.y + K.y0 + y, G.z + z), vR.set(dx, dy, dz).normalize());
    RC.near = 0; RC.far = ver;
    K.stralen++;
    const h = RC.intersectObjects(cam ? K.lijstCam || (K.lijstCam = botsLijst(K.G, K.roots, true)) : K.lijst, false);
    return h.length ? h[0].distance : ver;
  }
  function* pauze(K) { if (K.ts != null && performance.now() - K.ts > STAP_MS) { yield; K.ts = performance.now(); } }
  const voltooi = it => { for (;;) { const s = it.next(); if (s.done) return s.value; } };
  function* vrijPadG(K, a, b) {  // rechte lijn van a naar b vrij (knie- en borsthoogte, geen ander figuur ernaast)?
    const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz);
    if (L < 0.05) return true;
    for (const o of K.statisch) {
      const t = klem(((o.x - a.x) * dx + (o.z - a.z) * dz) / (L * L), 0, 1);
      if (Math.hypot(a.x + dx * t - o.x, a.z + dz * t - o.z) < 0.55) return false;
    }
    for (const y of [0.35, 1.2]) { const h = straal(K, a.x, y, a.z, dx, 0, dz, L); yield* pauze(K); if (h < L - 0.02) return false; }
    return true;
  }
  const vrijPad = (K, a, b) => voltooi(vrijPadG(K, a, b));
  function* vrijeStraalG(K, x, z, hoogtes, cam) {  // vrije straal rond (x, z), max 4,5 m: figuren, wanden en stralen in 24 richtingen
    let f = 4.5;
    for (const o of K.statisch) f = Math.min(f, Math.hypot(o.x - x, o.z - z) - 0.55);
    f = Math.min(f, K.maat.w / 2 - Math.abs(x), K.maat.d / 2 - Math.abs(z));
    for (const y of hoogtes) for (let i = 0; i < 24 && f > 0; i++) {
      const a = i / 24 * Math.PI * 2;
      f = Math.min(f, straal(K, x, y, z, Math.sin(a), 0, Math.cos(a), f, cam));
      yield* pauze(K);
    }
    return f;
  }
  function loperKanBlijven(z) { const R = z.own; return z.dans || (z.dist >= R.ingangBoog + 2.9 && z.dist <= R.uitgangBoog - 3.5); }
  function kamerGeldig(A) {
    const z = A.z;
    return !!(z && !z.weg && A.R && !A.R.weg && z.own === A.R && window.doolhof && doolhof.toestand && doolhof.toestand() === z);
  }
  // basisplan van een kamer (zonder de loper, die loopt nog): waar de pit kan, hoe groot, en waar de camera kan staan
  function* basisPlan(R, uitleg) {
    const G = R.groep, maat = R.kamer.maat;
    const figs = R.figs.map(q => q.d).filter(d => d.root.parent === G);
    // dansers op één vloer: de grootste groep op dezelfde hoogte (verzonken vloer, podium); een paar op een draaiend plateau doet niet mee
    const niveau = d => Math.round((d.yOff === undefined ? 0 : d.yOff) * 20) / 20, groep = new Map();
    for (const d of figs) if ((d.rol === 'dans' || d.rol === 'juich') && d.mixer) { const k = niveau(d); groep.set(k, (groep.get(k) || []).concat(d)); }
    let kand = [], y0 = 0;
    for (const [k, l] of groep) if (l.length > kand.length) { kand = l; y0 = k; }
    if (kand.length < (y0 ? 4 : 3)) return { nee: 'dansers ' + kand.length };
    const roots = new Set(figs.map(d => d.root));
    G.updateMatrixWorld(true);
    const K = { G, maat, y0, roots, lijst: botsLijst(G, roots), stralen: 0, ts: performance.now(),
                statisch: figs.filter(d => !kand.includes(d)).map(d => ({ x: d.root.position.x, z: d.root.position.z, r: 0.5 })) };
    yield* pauze(K);
    const leden = kand.map(d => ({ d, x: d.root.position.x, z: d.root.position.z }));
    // kandidaten voor het midden: het zwaartepunt, de dansers zelf, tussen twee dansers in, het midden van de kamer
    const kc = [];
    let sx = 0, sz = 0;
    for (const q of leden) { sx += q.x; sz += q.z; kc.push({ x: q.x, z: q.z }); }
    kc.push({ x: sx / leden.length, z: sz / leden.length }, { x: 0, z: 0 });
    for (let i = 0; i < leden.length; i++) for (let j = i + 1; j < leden.length; j++) {
      const a = leden[i], b = leden[j];
      if (Math.hypot(a.x - b.x, a.z - b.z) < 5) kc.push({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
    }
    let best = null;
    for (const c of kc) {
      if (Math.abs(c.x) > maat.w / 2 - 1.8 || Math.abs(c.z) > maat.d / 2 - 1.8) continue;
      // alleen een plek die een paar dansers vrij kunnen bereiken: dan zit hij ook niet in iets massiefs
      const bereik = [];
      for (const q of leden) if (Math.hypot(q.x - c.x, q.z - c.z) < 5.5 && (yield* vrijPadG(K, q, c))) bereik.push(q);
      if (uitleg) uitleg.push({ x: +c.x.toFixed(2), z: +c.z.toFixed(2), bereik: bereik.length });
      if (bereik.length < 3) continue;
      const f = yield* vrijeStraalG(K, c.x, c.z, [0.35, 1.25]);
      if (uitleg) uitleg[uitleg.length - 1].f = +f.toFixed(2);
      if (f < 1.6) continue;
      const sc = Math.min(bereik.length, 8) + 0.8 * Math.min(f, 3.5);
      if (!best || sc > best.sc) best = { c, f, bereik, sc };
    }
    if (!best) return { nee: 'geen plek', stralen: K.stralen };
    const cx = best.c.x, cz = best.c.z, Rring = klem(best.f - (best.f < 2.5 ? 0.4 : 0.45), 1.2, 2.8), Rc = Rring - (Rring < 2.1 ? 0.3 : 0.35);
    // camera: hoog boven de kring, kraan erom heen; zo hoog en zo ver als de kamer toelaat, met vrij zicht op het midden
    const fHoog = Math.min(best.f, yield* vrijeStraalG(K, cx, cz, [1.0, 2.3], true));
    let rH = klem(fHoog - 0.45, 0.6, 2.2);
    const rK = Math.min(fHoog - 0.4, Rring + 1.1);
    const boven = function* (r) {  // ruimte boven de cirkel met straal r (8 plekken)
      let op = 9;
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; op = Math.min(op, 1.2 + straal(K, cx + Math.sin(a) * r, 1.2, cz + Math.cos(a) * r, 0, 1, 0, 6, true)); yield* pauze(K); }
      return Math.min(op, (maat.h || 4) - y0);
    };
    const zicht = function* (r, y) {  // vanaf de cirkel (r, hoogte y) vrij zicht op het midden van de pit (geen vloer, plafond of rand ertussen)
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2, px = cx + Math.sin(a) * r, pz = cz + Math.cos(a) * r, dx = cx - px, dy = 0.8 - y, dz = cz - pz, L = Math.hypot(dx, dy, dz);
        const h = straal(K, px, y, pz, dx, dy, dz, L, true);
        yield* pauze(K);
        if (h < L - 0.05) return false;
      }
      return true;
    };
    let yH = klem((yield* boven(rH)) - 0.35, 2.3, 5.5);
    for (let i = 0; i < 4 && !(yield* zicht(rH, yH)); i++) {
      if (rH > 0.75) { rH = Math.max(0.6, rH * 0.6); yH = klem((yield* boven(rH)) - 0.35, 2.3, 5.5); } else yH = Math.max(2.3, yH - 0.8);
    }
    const hoog = yield* zicht(rH, yH), yK = klem((yield* boven(rK)) - 0.4, 1.4, 3.8);
    const kraanMag = rK >= Rc + 0.75 && yK >= 2.0 && (yield* zicht(rK, 0.9)) && (yield* zicht(rK, yK));
    K.ts = null;  // klaar: de rest (bij de pit zelf) zonder pauzes
    return { K, figs, c: best.c, f: best.f, y0, Rring, bereik: best.bereik, kraanMag, stralen: K.stralen,
             cam: { rH, yH, fovH: yH < 3.6 ? 76 : 64, rK, yK, hoog } };
  }
  // achtergrondwerk: het plan van de kamer waar de camera is (één stukje per beeld)
  function planBeeld() {
    const z = window.doolhof && doolhof.toestand && doolhof.toestand();
    if (!z || z.weg || z.mislukt || z.fase !== 'doolhof' || !z.own || !z.own.isKamer || z.own.weg || !z.own.kamer) return;
    const R = z.own;
    let p = PLAN.get(R);
    if (!p) PLAN.set(R, p = { it: basisPlan(R), t0: nu() });
    if (!p.it) return;
    let s;
    try { s = p.it.next(); } catch (e) { console.error('moshpit plan', e); s = { done: true, value: { nee: 'fout' } }; }
    if (s.done) { const v = s.value || { nee: 'leeg' }; v.duur = +(nu() - p.t0).toFixed(1); PLAN.set(R, v); }
  }
  // de pit in deze kamer, nu (opening of drop): ringplekken, paden erheen en de loper
  function kamerArena(z, B) {
    const R = z.own, K = B.K, loper = z.loper && z.loper.d, mid = { x: B.c.x, z: B.c.z };
    const A = nieuweArena('kamer', R.groep, B.c.x, B.c.z);
    A.y0 = B.y0; A.f = B.f; A.Rring = B.Rring;
    // de loper: in de buurt en vrij baan naar het midden = hij doet mee; staat hij in de kring en kan hij er niet weg: geen pit
    let leden = B.bereik.slice(), lp = null;
    if (loper && !B.y0) {
      lp = { d: loper, x: loper.root.position.x, z: loper.root.position.z, loper: true };
      const dl = Math.hypot(lp.x - A.cx, lp.z - A.cz);
      if (dl < 5.5 && vrijPad(K, lp, mid)) leden.push(lp);
      else if (dl < A.Rring + 0.8) return { nee: 'loper in de kring' };
    }
    // niet meer dansers dan op de ring passen (min. 1,05 m tussen twee), de dichtstbijzijnde eerst (de loper altijd)
    const maxN = Math.floor(Math.PI * 2 * A.Rring / 1.05), afst = q => q.loper ? -1 : Math.hypot(q.x - A.cx, q.z - A.cz);
    leden = leden.sort((a, b) => afst(a) - afst(b)).slice(0, maxN);
    for (let ronde = 0; ronde < 2; ronde++) {  // ringplekken; wie er niet vrij heen kan, doet niet mee (en wordt een obstakel)
      ringSlots(A, leden);
      const ok = leden.filter(q => vrijPad(K, q, q.slot) && vrijPad(K, q.slot, mid));
      if (ok.length === leden.length) break;
      leden = ok;
    }
    if (leden.filter(q => !q.loper).length < 3) return { nee: 'paden' };
    if (lp && !leden.includes(lp) && Math.hypot(lp.x - A.cx, lp.z - A.cz) < A.Rring + 0.8) return { nee: 'loper in de kring' };
    straalMaten(A, leden.length);
    if (A.klein) {  // lage camera aan de rand, in het midden tussen twee ringplekken
      const hk = leden.map(q => Math.atan2(q.slot.x - A.cx, q.slot.z - A.cz)).sort((a, b) => a - b), i = Math.floor(Math.random() * hk.length);
      const a = hk.length > 1 ? hk[i] + wrap(hk[(i + 1) % hk.length] - hk[i]) / 2 : hk[0] + Math.PI;
      const r = Math.min(A.f - 0.3, A.Rring + 0.05);
      A.camLaag = { x: A.cx + Math.sin(a) * r, z: A.cz + Math.cos(a) * r, a };
    }
    Object.assign(A.cam, B.cam, { kraan: A.cam.kraan && B.kraanMag });
    // effectkamers: hun vlakken bewegen in de shader (stralen zien ze niet op hun echte plek) en van boven zie je vooral die vlakken:
    // daar de hele pit laag, tussen de mensen
    if (/^fx-/.test(R.soort)) Object.assign(A.cam, { hoog: false, kraan: false });
    A.statischD = B.figs.filter(d => !leden.some(q => q.d === d));
    A.statisch = A.statischD.map(d => ({ x: d.root.position.x, z: d.root.position.z, r: 0.85 }));
    if (lp && !leden.includes(lp)) A.statisch.push({ x: lp.x, z: lp.z, r: 0.85 });
    return { A, leden };
  }
  function probeerKamer(tel, naDrop) {
    if (KAMER || !window.doolhof || !doolhof.toestand || !doolhof.houdLoper) return;
    const z = doolhof.toestand();
    if (!z || z.weg || z.mislukt || z.fase !== 'doolhof' || !z.own || !z.own.isKamer || z.own.weg || !z.loper || !z.own.kamer) return;
    const R = z.own, B = PLAN.get(R);
    if (!B || B.it || KAMER_NEE.get(R) === cyclusNr || !loperKanBlijven(z)) return;  // plan nog bezig, al afgewezen, of loper nog niet binnen
    let r = B.nee ? B : null;
    if (!r) try { r = kamerArena(z, B); } catch (e) { console.error('moshpit kamer', e); r = { nee: 'fout' }; }
    if (!r.A) { KAMER_NEE.set(R, cyclusNr); noteer('kamer nee', { soort: R.soort, waarom: r.nee }); return; }
    if (!doolhof.houdLoper(6)) return;
    const A = r.A;
    A.R = R; A.z = z;
    for (const q of r.leden) {
      const p = maakDeel(A, q.d, q.loper ? { loper: true } : null);
      p.slot = q.slot;
      if (q.loper) p.thuis = { x: q.d.home.x, z: q.d.home.z };
    }
    KAMER = A;
    // eigen camera zolang de pit loopt (de kern gebruikt kamer.cam zodra de camera binnen is)
    const k = R.kamer;
    A.kamerObj = k; A.hadCam = Object.prototype.hasOwnProperty.call(k, 'cam'); A.oudCam = k.cam; A.camAan = true;
    const uit = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 60 }, cp = { p: new THREE.Vector3(), l: new THREE.Vector3(), fov: 60 };
    k.cam = function () {
      try {
        camProg(A, beatPos, nu(), cp);
        uit.pos.copy(cp.p).add(A.ouder.position); uit.look.copy(cp.l).add(A.ouder.position); uit.fov = cp.fov;
      } catch (e) { console.error('moshpit cam', e); }
      return uit;
    };
    noteer('kamer', { soort: R.soort, n: A.deel.length, loper: r.leden.some(q => q.loper), ring: +A.Rring.toFixed(2), vrij: +A.f.toFixed(2), stralen: B.stralen, planDuur: B.duur, kraan: A.cam.kraan });
    if (naDrop != null) startDrop(A, naDrop); else startOpen(A, tel);
  }

  // --- camera ---
  // hoog: boven de kring, langzaam rond; pit: laag in het midden, rondkijkend tussen de springers; kraan: rond de pit omhoog
  function camProg(A, tb, ts, o) {
    const c = A.cam, k = A.D == null ? -1 : tb - A.D;
    let fase = A.D == null || k < 0 ? 'hoog' : k < c.k0 ? 'pit' : k < c.k1 && c.kraan ? 'kraan' : k < A.T && A.fase === 'mosh' ? 'pit' : 'hoog';
    if (fase === 'hoog' && c.hoog === false) fase = 'pit';  // geen vrij zicht van boven: laag in (of aan) de kring
    if (fase !== c.fase) { c.fase = fase; c.ts0 = ts; c.a += 1.3 + Math.random() * 1.5; }
    const u = ts - c.ts0, y0 = A.y0;
    if (fase === 'hoog') {
      const a = c.a + c.dir * 0.09 * u;
      o.p.set(A.cx + Math.sin(a) * c.rH, y0 + c.yH, A.cz + Math.cos(a) * c.rH); o.l.set(A.cx, y0 + 0.2, A.cz); o.fov = c.fovH;
    } else if (fase === 'pit' && A.camLaag) {  // kleine pit: laag aan de rand, kijkt de pit in en zwenkt mee
      const L = A.camLaag, b = Math.atan2(A.cx - L.x, A.cz - L.z) + 0.35 * Math.sin(u * 0.45 * c.dir), sch = 0.035 * pulse * energy;
      o.p.set(L.x, y0 + 0.75 + sch, L.z); o.l.set(L.x + Math.sin(b) * 3, y0 + 1.55, L.z + Math.cos(b) * 3); o.fov = 74;
    } else if (fase === 'pit') {
      const b = c.a + c.dir * 0.32 * u, sch = 0.035 * pulse * energy;
      o.p.set(A.cx + 0.1 * Math.sin(u * 1.7), y0 + 0.8 + sch, A.cz + 0.1 * Math.cos(u * 1.3));
      o.l.set(A.cx + Math.sin(b) * 3, y0 + 1.85 + 0.1 * Math.sin(u * 0.9), A.cz + Math.cos(b) * 3); o.fov = 80;
    } else {
      const v = glad(klem((k - c.k0) / (c.k1 - c.k0), 0, 1)), a = c.a + c.dir * 0.3 * u;
      o.p.set(A.cx + Math.sin(a) * c.rK, y0 + 0.9 + (c.yK - 0.9) * v, A.cz + Math.cos(a) * c.rK); o.l.set(A.cx, y0 + 1.05 - 0.45 * v, A.cz); o.fov = 58;
    }
  }
  const camEind = A => A.terugTel != null ? A.terugTel + 4 : A.D != null ? A.D + A.T + 4 : A.b0 + MAX_OPEN + 8;
  const camKlaar = (A, tb) => tb >= camEind(A);
  function camTerug(A) {
    if (!A.camAan) return;
    A.camAan = false;
    if (A.kamerObj) { if (A.hadCam) A.kamerObj.cam = A.oudCam; else delete A.kamerObj.cam; }
  }
  const magCamZaal = () => S.cam === 'auto' && !!shot && shot.kind !== 'trip' && shot.kind !== 'doolhof' && shot.kind !== 'moshpit' &&
    Math.abs(camera.position.x) < ROOM - 0.5 && Math.abs(camera.position.z) < ROOM - 0.5 && !(shot.kind === 'boer' && beatPos - shot.b0 < 4);
  function knipZaal() {
    if (!ZAAL) return;
    startShot('moshpit', nu());
    if (shot && shot.kind === 'moshpit') { shot.regie = true; ZAAL.camAan = true; }
  }
  const CPZ = { p: new THREE.Vector3(), l: new THREE.Vector3(), fov: 60 };
  // alleen de regie knipt hierheen (niet-opsombaar: geen vaste camera via 'c' of willekeurig)
  Object.defineProperty(SHOTS, 'moshpit', { enumerable: false, configurable: true, writable: true, value: {
    w: 0, beats: 48, make: () => ({}),
    at(s, u, t) {
      const A = ZAAL;
      if (!A) { s.beats = Math.max(0.01, beatPos - s.b0); return; }  // pit al klaar: camera blijft staan, volgende beeld een nieuw shot
      camProg(A, beatPos, nu(), CPZ);
      camPos.copy(CPZ.p); camLook.copy(CPZ.l); camFov = CPZ.fov;
      s.beats = Math.max(0.01, camEind(A) - s.b0);
    } } });
  // de drop wordt het moshpit-shot (regie-momenten.js en showregie.js knippen naar 'drop')
  const oShot = startShot;
  startShot = function (kind, now) {
    try {
      if (kind === 'drop' && ZAAL && ZAAL.D != null && S.cam === 'auto') {
        if (shot && shot.kind === 'moshpit') return;
        kind = 'moshpit';
      }
      // een ander shot loopt af terwijl de pit in zaal 1 nog bezig is (en de camera is in zaal 1): weer de pit
      else if (kind === 'auto' && S.cam === 'auto' && ZAAL && ZAAL.fase !== 'terug' && shot && shot.kind !== 'moshpit' &&
               Math.abs(camera.position.x) < ROOM - 0.5 && Math.abs(camera.position.z) < ROOM - 0.5) kind = 'moshpit';
    } catch (e) { console.error('moshpit', e); }
    const r = oShot.call(this, kind, now);
    if (kind === 'moshpit' && shot && shot.kind === 'moshpit' && ZAAL) ZAAL.camAan = true;
    return r;
  };

  // --- stijl (club/stijl.js, window.clubStijl): alleen moshen bij dubstep, dnb, rock, metal, punk ---
  const stijlPreset = () => { const s = window.clubStijl; return s && s.preset ? s.preset : null; };
  function moshMag() {
    if (!MP.aan || MP.keus === false) return false;
    if (MP.keus === true) return true;  // handmatig afgedwongen (testen)
    const p = stijlPreset();
    return !!(p && p.mosh);             // geen stijl (nog) of een stijl zonder mosh: geen kring, geen pit
  }
  const ophypeMin = () => { const p = stijlPreset(); return p && p.ophypeMin > 0 ? p.ophypeMin : 8; };
  const bevestig = () => { const p = stijlPreset(); return (p && p.dropBevestig) || 'kick'; };
  const moshTellen = () => { const p = stijlPreset(); return p && p.moshTellen > 0 ? p.moshTellen : 16; };
  const cirkelStijl = () => { const p = stijlPreset(); return !p || p.cirkel !== false; };

  // --- de muziek per tel (eigen meting, ruw: zonder de auto-gain van de beatvolger) ---
  // per tel het gemiddelde van bas, totaal en hoog; referentie = omhullende van de groove (vast in break, opbouw en zolang de kring wacht)
  const HN = 64, hB = new Float32Array(HN), hT = new Float32Array(HN), hH = new Float32Array(HN), RAW = new Float32Array(3);
  const ht = (a, t) => a[((t % HN) + HN) % HN];
  let aTel = null, sB = 0, sT = 0, sH = 0, sN = 0, kort = 0, refB = 0, refT = 0, refH = 0, stilT = -99, stilRun = 0, rustRun = 0, wegStart = null;
  function ruw() {
    const nat = typeof native !== 'undefined' ? native : null;
    if (nat) { RAW[0] = nat[0]; RAW[1] = nat[1]; RAW[2] = nat[2]; return; }  // pc-geluid.py / de Mac-app
    if (typeof analyser !== 'undefined' && analyser && typeof bins !== 'undefined' && bins && ctx) {  // getUserMedia: zelfde banden als analyse()
      const hz = ctx.sampleRate / analyser.fftSize;
      for (let k = 0; k < 3; k++) {
        const b = bands[k], i0 = Math.max(1, Math.floor(b.lo / hz)), i1 = Math.min(bins.length - 1, Math.ceil(b.hi / hz));
        let s = 0;
        for (let i = i0; i <= i1; i++) s += bins[i];
        RAW[k] = s / (i1 - i0 + 1) / 255;
      }
      return;
    }
    for (let k = 0; k < 3; k++) RAW[k] = bands[k].v * bands[k].max;  // demo-beat
  }
  const omhul = (r, x) => !r ? x : r + (x - r) * (x > r ? 0.15 : 0.006);
  function meetAudio(dt, tb) {
    ruw();
    const tot = RAW[0] + RAW[1] + RAW[2], tel = Math.floor(tb);
    kort += (tot - kort) * (1 - Math.exp(-dt / 0.06));
    if (refT > 0 && kort < 0.25 * refT) stilT = tb;  // (bijna) niets: een stilte, ook een korte vlak vóór de drop
    if (aTel === null || tel > aTel + 8 || tel < aTel - 8) { aTel = tel; sB = sT = sH = sN = 0; }
    if (tel > aTel) {  // tel klaar (de beatvolger trekt soms een stukje terug: dan telt het bij de lopende tel)
      const mb = sN ? sB / sN : 0, mt = sN ? sT / sN : 0, mh = sN ? sH / sN : 0;
      for (let t = aTel; t < tel; t++) { const i = ((t % HN) + HN) % HN; hB[i] = mb; hT[i] = mt; hH[i] = mh; telKlaar(t); }
      aTel = tel; sB = sT = sH = sN = 0;
    }
    sB += RAW[0] * dt; sT += tot * dt; sH += RAW[2] * dt; sN += dt;
  }
  function telKlaar(t) {
    const b = ht(hB, t), tt = ht(hT, t), hh = ht(hH, t), c = cyclus, R = window.clubRegie, st = live && R ? R.stand : 'groove';
    const wacht = !!(c && c.open != null && c.D == null);
    if (!refT || !(wacht || st === 'break' || st === 'opbouw')) { refB = omhul(refB, b); refT = omhul(refT, tt); refH = omhul(refH, hh); }
    stilRun = tt < 0.3 * refT ? stilRun + 1 : 0;
    if (b < 0.3 * refB && ht(hB, t - 1) >= 0.6 * refB) wegStart = t;  // de bas valt weg (begin van een break, meestal tel 1): anker voor de maten
    rustRun = tt < 0.62 * refT && tt > 0.12 * refT ? rustRun + 1 : 0;  // rustiger stuk, de muziek speelt door
    if (wacht) {
      c.hPiek = Math.max(c.hPiek, hh);
      c.breakRun = b < 0.35 * refB && tt >= 0.3 * refT && hh < 0.6 * c.hPiek ? c.breakRun + 1 : 0;  // bas weg, geen stilte, riser weg: break
      if (b >= 0.45 * refB) c.basTerug = true;
    }
  }
  const opMaat = t => wegStart == null || t - wegStart > 128 || ((t - wegStart) % 4 + 4) % 4 === 0;
  const SM = { b: 0, t: 0, rb: 0, rt: 0, rh: 0 };
  function sprongMaat(tel) {  // de lopende tel t.o.v. de referentie (b, t) en t.o.v. de 6 tellen ervoor (rb, rt, rh)
    let pb = 0, pt = 0, ph = 0;
    for (let t = tel - 6; t < tel; t++) { pb += ht(hB, t); pt += ht(hT, t); ph += ht(hH, t); }
    pb /= 6; pt /= 6; ph /= 6;
    const cb = sB / sN, ct = sT / sN, ch = sH / sN;
    SM.b = cb / refB; SM.t = ct / refT;
    SM.rb = cb / Math.max(pb, 0.08 * refB); SM.rt = ct / Math.max(pt, 0.05 * refT); SM.rh = ch / Math.max(ph, 0.05 * (refH || 0.1));
    return SM;
  }

  // --- wanneer: opbouw (of een rustiger stuk bij riff) opent de kring, ophypen, de echte drop start de pit ---
  let cyclus = null, gezienDrop = null, vorigeDropPit, laatsteTel = -1, laatsteSinds = null, laatsteEinde = -99, SP = 0, breakKeus = null;
  function rol() {
    if (MP.keus !== null) return !!MP.keus;
    if (vorigeDropPit !== true) return true;  // de eerste drop, of de vorige had er geen
    return Math.random() < MP.kans;
  }
  const pitLoopt = tb => !!((ZAAL && ZAAL.D != null && tb < ZAAL.D + ZAAL.T + 8) || (KAMER && KAMER.D != null && tb < KAMER.D + KAMER.T + 8));
  MP.golfWeg = () => !!(moshMag() && ((cyclus && cyclus.pit && cyclus.open != null && (cyclus.D == null || Math.abs(beatPos - cyclus.D) < 4)) || pitLoopt(beatPos)));
  function nieuweCyclus(tel, sinds, pit, uitBreak) {  // pit: vooraf geloot (break), anders nu
    cyclus = { pit: pit != null ? pit : rol(), sinds, open: null, D: null, opbouwEind: null, kand: null, wacht: null, valse: 0, basTerug: false, hPiek: 0, breakRun: 0,
               evTel: null, zonder: false, herstart: false, geteld: false, eind: tel + 48, uitBreak: !!uitBreak, basis: null };
    cyclusNr++;
    if (!cyclus.pit) vorigeDropPit = false;
    noteer('cyclus', { pit: cyclus.pit, door: uitBreak ? 'break' : sinds != null ? 'opbouw' : 'rustig', stijl: window.clubStijl && clubStijl.naam });
  }
  // nog in de break, vóór de opbouw (kring uit de break): geen camera, geen kamer, niet dicht op break of stilte
  const inBreak = c => c.uitBreak && c.sinds == null;
  function openKring(tel) {
    cyclus.open = cyclus.basis = tel;
    if (!ZAAL) { ZAAL = maakZaal(); if (ZAAL) { startOpen(ZAAL, tel); if (!inBreak(cyclus) && magCamZaal()) knipZaal(); } }
    if (!KAMER && !inBreak(cyclus)) probeerKamer(tel, null);
  }
  function eindeCyclus(tel, dicht) {
    if (dicht) { for (const A of [ZAAL, KAMER]) if (A && A.D == null) sluitArena(A, dicht); vorigeDropPit = false; }
    cyclus = null; laatsteEinde = tel; SP = 0;
  }
  function afbouwen(waarom) {  // stijl zonder mosh (of uit): open kring en lopende pit rustig terug
    if (ZAAL && ZAAL.fase !== 'terug') sluitArena(ZAAL, waarom);
    if (KAMER && KAMER.fase !== 'terug') sluitArena(KAMER, waarom);
    if (cyclus) { if (cyclus.D == null && cyclus.open != null) vorigeDropPit = false; cyclus = null; laatsteEinde = Math.floor(beatPos); SP = 0; }
  }
  function dropNu(D, zonder) {
    const c = cyclus;
    c.D = D; c.zonder = zonder; c.kand = null; c.wacht = null; vorigeDropPit = true;
    if (ZAAL && ZAAL.D == null && ZAAL.fase === 'open') startDrop(ZAAL, D);
    if (!KAMER) probeerKamer(D, D);
    else if (KAMER.D == null && KAMER.fase === 'open') startDrop(KAMER, D);
    if (ZAAL && ZAAL.D != null && magCamZaal()) knipZaal();
    noteer('pit', { D, zonderStilte: zonder, tellen: moshTellen(), hype: D - c.open });
  }
  function herkend(D, zonder, bron) {  // echte drop gezien; nog niet genoeg opgehypet: dan op de eerste maatgrens nadat het mag
    const c = cyclus;
    if (D - c.open < ophypeMin()) { c.wacht = { D, zonder }; noteer('drop, nog even ophypen', { D, bron, hype: D - c.open }); return; }
    dropNu(D, zonder);
  }
  // de lichtregie (of het drop-moment van de kern) zag een drop: bij na-stilte zonder stilte alleen als de bas er nu echt vol staat,
  // en dan pas na een volle maat (een bas die na de opbouw terugkomt is vaak nog de aanloop)
  function regieDrop(D) {
    D = Math.round(D);
    if (D === gezienDrop) return;
    gezienDrop = D;
    const c = cyclus;
    if (!moshMag() || !c || !c.pit || c.open == null || c.D != null || c.kand || c.wacht) return;
    const mode = bevestig(), stilVoor = stilT >= D - 4, tel = Math.floor(beatPos);
    // lang genoeg opgehypet: de drop van de lichtregie (die van de hele club) is dan altijd goed
    if (stilVoor || mode === 'riff' || mode === 'kick' || D - c.open >= ophypeMin()) { herkend(D, !stilVoor, 'regie'); return; }
    if (mode === 'bassprong') { c.kand = { D, n: 1, bron: 'regie', vanaf: D }; return; }
    const nuB = Math.max(aTel === tel && sN ? sB / sN : 0, ht(hB, tel - 1));
    if (refB > 0 && nuB >= 0.75 * refB) { c.kand = { D, n: 4, bron: 'regie', vanaf: D }; noteer('kandidaat', { D, n: 4, bron: 'regie' }); }
    else noteer('regie-drop genegeerd', { D, b: refB ? +(nuB / refB).toFixed(2) : 0 });
  }
  function wachten(tb, tel, opTel, R, st, mode) {
    const c = cyclus, om = ophypeMin();
    if (opTel && !KAMER && !inBreak(c)) probeerKamer(tel, null);  // camera kwam later een kamer in: die doet mee
    // kandidaat (inzet zonder stilte): valt de bas weg of komt er een stilte binnen n tellen, dan was het een valse inzet; anders de drop
    // (bevestigd pas als de bas ook het begin van de tel erna nog vol is: een inzet van precies n tellen met daarna stilte telt niet)
    if (c.kand) {
      const k = c.kand;
      let weg = stilT > k.D + 0.3;
      for (let t = Math.max(k.D, k.vanaf); t < tel && !weg; t++) if (ht(hB, t) < 0.45 * refB || ht(hT, t) < 0.4 * refT) weg = true;
      if (tel > k.vanaf) k.vanaf = tel;
      if (weg) { c.kand = null; c.valse++; noteer('valse inzet', { D: k.D, bron: k.bron }); }
      else if (tel >= k.D + k.n && tb - tel >= 0.3 && aTel === tel && sN > 0) {
        if (sB / sN >= 0.45 * refB) { c.kand = null; noteer('inzet bevestigd', { D: k.D, nu: tel }); herkend(tel, true, k.bron); }
        else { c.kand = null; c.valse++; noteer('valse inzet', { D: k.D, bron: k.bron }); }
      }
    }
    // te vroeg herkend: op de eerste maatgrens (vanaf de drop) na ophypeMin, als de muziek dan nog vol is
    if (c.wacht && opTel) {
      const w = c.wacht;
      if (stilT > w.D + 0.3) { c.wacht = null; noteer('drop weer weg'); }
      else if (tel - c.open >= om && ((tel - w.D) % 4 + 4) % 4 === 0) {
        const vol = mode === 'riff' ? ht(hT, tel - 1) >= 0.7 * refT : ht(hB, tel - 1) >= 0.5 * refB;
        c.wacht = null;
        if (vol) dropNu(tel, w.zonder); else noteer('drop weer weg');
      }
    }
    if (c.D != null) return;
    // de lopende tel: sprong t.o.v. de tellen ervoor (eenmaal per tel, na ~1/3 tel: dan zit de aanslag erin)
    // (in de break zelf alleen een drop van de lichtregie: een baslijntje in de break is nog geen drop)
    if (!c.kand && !c.wacht && !(inBreak(c) && st === 'break') && c.evTel !== tel && tb - tel >= 0.35 && aTel === tel && sN > 0 && refB > 0 && refT > 0) {
      c.evTel = tel;
      const s = sprongMaat(tel), stilVoor = stilT >= tel - 4;
      let n = -1;  // -1 geen drop, 0 meteen, n > 0: bevestigen na n tellen
      if (mode === 'riff') { if (s.t >= 0.8 && s.rt >= 1.6 && s.rb >= 1.3 && s.rh >= 1.3) n = 0; }  // harde, volle inzet
      else if (s.b >= 0.6 && s.rb >= 1.9) {
        if (stilVoor) n = 0;                                                                         // stilte, dan de bas: de drop
        else if (mode === 'na-stilte') n = s.b >= 0.75 && s.rb >= 2.5 ? 4 : -1;                       // zonder stilte: een maat vol blijven
        else if (mode === 'bassprong') n = s.b >= 0.75 && s.rb >= 2.2 ? (opMaat(tel) ? 0 : 1) : -1;   // grote sprong op tel 1
        else n = 0;
      }
      if (n === 0) herkend(tel, !stilVoor, 'sprong');
      else if (n > 0) { c.kand = { D: tel, n, bron: 'sprong', vanaf: tel }; noteer('kandidaat', { D: tel, n, b: +s.b.toFixed(2), rb: +s.rb.toFixed(2) }); }
    }
    if (c.D != null) return;
    // kring dicht: break (bas weg en de riser is weg), lange stilte, of te lang geen drop
    let dicht = null;
    if (inBreak(c)) {  // kring uit de break: wacht op de opbouw (of een drop recht uit de break)
      if (tel - c.open > BREAK_MAX) dicht = 'geen opbouw';
      else if (st !== 'break' && !c.kand && !c.wacht && tel > c.open + WACHT) dicht = 'geen drop';
    }
    else if (mode !== 'riff' && c.breakRun >= 6) dicht = 'break';
    else if (st === 'break' && c.opbouwEind != null) dicht = 'break';
    else if (stilRun > 24) dicht = 'stil';  // (was 8: de stilte vóór de drop sloot de kring, net voordat de pit los moest)
    else if (!c.kand && !c.wacht && st !== 'opbouw' && tel > Math.max(c.basis + WACHT, (c.opbouwEind != null ? c.opbouwEind : c.basis) + 24)) dicht = 'geen drop';
    else if (tel - c.basis > MAX_OPEN - 8) dicht = 'te lang';
    if (dicht) { noteer('kring dicht', { waarom: dicht }); eindeCyclus(tel, dicht); return; }
    // spanning (hoe wild het ophypen is): loopt op met de tijd en de opbouw; vol bij een stilte of inzet vlak voor de drop
    let sp = 0.3 + 0.4 * klem((tb - c.open) / (om + 8), 0, 1) + (st === 'opbouw' && R ? 0.3 * klem(R.opbouwTel / 16, 0, 1) : c.opbouwEind != null || c.sinds == null ? 0.25 : 0);
    if (c.basTerug) sp += 0.1;
    if (c.valse) sp += 0.15;
    sp -= 0.1 * c.breakRun;  // het zakt in (break op komst): rustiger
    if (c.kand || c.wacht || tb - stilT < 2) sp = 1;
    SP = klem(sp, 0, 1);
  }
  // pit begonnen op een inzet zonder stilte (na-stilte) en dan toch nog stilte + bas: dát was de drop, de pit barst opnieuw los
  function herstartKijk(tb, tel, mode) {
    const c = cyclus;
    if (!c.zonder || c.herstart || mode !== 'na-stilte' || tb - c.D > 12 || tel < c.D + 2 || c.evTel === tel || tb - tel < 0.35 || aTel !== tel || !sN || !refB) return;
    c.evTel = tel;
    const s = sprongMaat(tel);
    if (!(stilT >= tel - 4 && stilT > c.D + 1 && s.b >= 0.6 && s.rb >= 1.9)) return;
    c.herstart = true; c.D = tel;
    for (const A of [ZAAL, KAMER]) if (A && A.fase === 'mosh') { A.cirkel = false; A.cirkelUit = false; startDrop(A, tel); }
    noteer('drop na stilte: pit opnieuw', { D: tel });
  }
  function wanneer(tb, tel, opTel) {
    const R = window.clubRegie, st = live && R ? R.stand : 'groove', mode = bevestig();
    if (R && st === 'drop' && R.dropBeat >= 0 && R.dropBeat !== gezienDrop) regieDrop(R.dropBeat);
    // openen: de opbouw (lichtregie), of bij riff (rock/metal/punk) een rustiger stuk: de harde inzet komt nog
    if (st === 'opbouw' && R && R.sinds !== laatsteSinds) {
      if (!cyclus && !pitLoopt(tb)) { nieuweCyclus(tel, R.sinds, breakKeus && tel - breakKeus.tel < BREAK_MAX + 8 ? breakKeus.pit : null); laatsteSinds = R.sinds; }
      else if (cyclus && cyclus.D == null) {  // nog een opbouw terwijl de kring wacht, of de opbouw na de break: nu pas camera en kamer
        const uitBr = inBreak(cyclus);
        cyclus.sinds = R.sinds; cyclus.opbouwEind = null; laatsteSinds = R.sinds;
        if (uitBr && cyclus.open != null) {
          cyclus.basis = tel;
          if (ZAAL && ZAAL.D == null && magCamZaal()) knipZaal();
          if (!KAMER) probeerKamer(tel, null);
        }
      }
      breakKeus = null;
    }
    // dubstep/dnb: de kring vormt zich al in de break (langer ophypen); de loting voor deze drop gebeurt dan nu
    if (!cyclus && mode !== 'riff' && st === 'break' && R && tb - R.sinds >= BREAK_OPEN && tel - laatsteEinde >= 16 && !pitLoopt(tb) && moshMag() &&
        (!breakKeus || breakKeus.sinds !== R.sinds)) {
      breakKeus = { sinds: R.sinds, tel, pit: rol() };
      if (breakKeus.pit) nieuweCyclus(tel, null, true, true);
    }
    if (!cyclus && mode === 'riff' && rustRun >= 6 && tel - laatsteEinde >= 24 && !pitLoopt(tb)) nieuweCyclus(tel, null);
    const c = cyclus;
    if (!c) return;
    if (c.sinds != null && st !== 'opbouw' && c.opbouwEind == null) c.opbouwEind = tel;
    if (!c.pit) {  // geen pit deze keer: alleen bijhouden tot de opbouw voorbij is
      if (tel > c.eind || (c.opbouwEind != null && tel > c.opbouwEind + 8)) eindeCyclus(tel, null);
      return;
    }
    if (c.open == null) {
      if (c.sinds == null || (st === 'opbouw' && R.opbouwTel >= OPEN_TEL)) openKring(tel);
      else if (c.opbouwEind != null) eindeCyclus(tel, 'opbouw te kort');  // opbouw al voorbij vóór de kring open was: geen ophypen, geen pit
      return;
    }
    if (c.D == null) { wachten(tb, tel, opTel, R, st, mode); return; }
    herstartKijk(tb, tel, mode);
    // de loper kwam pas na de drop ver genoeg de kamer in: tot 2 tellen na de drop nog instappen
    if (opTel && !KAMER && tb - c.D < 2.5) probeerKamer(tel, c.D);
    // was de pit te zien (zaal-1-shot of een pit in de kamer van de camera)? zo niet, dan telt deze drop als een drop zonder pit
    if (!c.geteld && tb > c.D + 3) {
      c.geteld = true;
      if (!(shot && shot.kind === 'moshpit') && !KAMER) { vorigeDropPit = false; noteer('niet gezien'); }
    }
    if (!pitLoopt(tb)) eindeCyclus(tel, null);
  }
  const oMoment = startMoment;
  startMoment = function (k, tb) {
    const r = oMoment.apply(this, arguments);
    if (k === 'drop' && MP.aan) try {
      const R = window.clubRegie, t = typeof tb === 'number' ? tb : beatPos;
      regieDrop(R && R.dropBeat >= 0 && Math.abs(R.dropBeat - t) < 2 ? R.dropBeat : t);
    } catch (e) { console.error('moshpit', e); }
    return r;
  };

  clubHooks.push((dt) => {
    try {
      const tb = beatPos, tel = Math.floor(tb), opTel = tel !== laatsteTel;
      laatsteTel = tel;
      meetAudio(Math.min(dt, 0.1), tb);  // altijd: dan klopt de referentie ook als de stijl wisselt
      if (!clips()) return;
      meetVoorraad();
      if (moshMag()) { planBeeld(); wanneer(tb, tel, opTel); }
      else afbouwen('stijl');
      if (KAMER && kamerGeldig(KAMER) && KAMER.deel.some(p => p.st !== 'uit')) doolhof.houdLoper(4);  // loper blijft tot iedereen thuis is
      if (ZAAL) arenaBeeld(ZAAL, Math.min(dt, 0.05), tb, opTel);
      if (KAMER) arenaBeeld(KAMER, Math.min(dt, 0.05), tb, opTel);
    } catch (e) { console.error('moshpit', e); }
  });

  // --- meten (testen): grootste heupverplaatsing per beeld (glijden) en kleinste afstand tussen heupen (door elkaar) ---
  const mh = new THREE.Vector3();
  function heupWereld(d, built, out) {
    const h = built ? d.hips : hipsOf(d);
    if (!h) return null;
    h.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(h.matrixWorld);
  }
  function meet(A, tb) {
    const M = MP.meting || (MP.meting = {});
    const k = A.D == null ? null : tb - A.D;
    const fase = A.D == null ? (A.fase === 'open' ? 'open' : 'terug') : k < 0 ? 'open' : A.fase === 'terug' ? 'terug' : k < STORM ? 'storm' : k < A.T ? (A.deel.some(p => p.st === 'cirkel') ? 'cirkel' : 'mosh') : 'terug';
    const m = M[A.soort + ':' + fase] || (M[A.soort + ':' + fase] = { beelden: 0, maxHeup: 0, maxWortel: 0, minHeup: 9, minFig: 9, n: 0, wie: '' });
    m.beelden++; m.n = Math.max(m.n, A.deel.length);
    const pts = [], AN = window.clubOpt && clubOpt.anim;
    for (const p of A.deel) {
      if (!p.built && AN && AN.stil && AN.stil(p.d)) { p.mh = null; continue; }  // mixer sloeg dit beeld over (buiten beeld): telt niet
      const w = heupWereld(p.d, p.built, mh); if (!w) continue;
      const q = { x: w.x, z: w.z, p };
      if (p.mh) {
        const dh = Math.hypot(q.x - p.mh.x, q.z - p.mh.z), dw = Math.hypot(p.d.root.position.x - p.mw.x, p.d.root.position.z - p.mw.z);
        if (dh > m.maxHeup) { m.maxHeup = dh; m.wie = p.st + ' ' + (p.built ? p.d.type : p.d.M.file.replace(/^models\/|\.glb$/g, '')); }
        m.maxWortel = Math.max(m.maxWortel, dw);
      }
      p.mh = { x: q.x, z: q.z }; p.mw = { x: p.d.root.position.x, z: p.d.root.position.z };
      pts.push(q);
    }
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) m.minHeup = Math.min(m.minHeup, Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z));
    for (const d of A.statischD || []) {  // andere figuren in de kamer
      const w = heupWereld(d, false, mh); if (!w) continue;
      for (const q of pts) m.minFig = Math.min(m.minFig, Math.hypot(q.x - w.x, q.z - w.z));
    }
  }

  // --- testen ---
  MP.zet = aan => {
    MP.aan = !!aan;
    if (!MP.aan) for (const A of [ZAAL, KAMER]) if (A) afbreken(A, 'uit');
  };
  MP.info = () => ({
    aan: MP.aan, mag: moshMag(), stijl: window.clubStijl ? clubStijl.naam : null, dropBevestig: bevestig(), ophypeMin: ophypeMin(), moshTellen: moshTellen(),
    cyclus: cyclus && { pit: cyclus.pit, open: cyclus.open, D: cyclus.D, kand: cyclus.kand && { D: cyclus.kand.D, n: cyclus.kand.n, bron: cyclus.kand.bron },
      wacht: cyclus.wacht && cyclus.wacht.D, valse: cyclus.valse, basTerug: cyclus.basTerug, breakRun: cyclus.breakRun, opbouwEind: cyclus.opbouwEind, zonder: cyclus.zonder, herstart: cyclus.herstart },
    spanning: +SP.toFixed(2), audio: MP.audio(), vorigeDropPit, botsingen: MP.botsingen,
    arenas: [ZAAL, KAMER].filter(Boolean).map(A => ({ waar: A.soort, soort: A.R && A.R.soort, fase: A.fase, D: A.D, b0: A.b0, ring: +A.Rring.toFixed(2), Rm: +A.Rm.toFixed(2),
      Rc: +A.Rc.toFixed(2), cirkel: A.cirkelMag, cam: A.camAan && A.cam.fase, midden: [+A.cx.toFixed(2), +A.cz.toFixed(2)],
      deel: A.deel.map(p => ({ st: p.st, fig: p.built ? p.d.type : p.d.M.file.replace(/^models\/|\.glb$/g, ''), x: +p.x.toFixed(2), z: +p.z.toFixed(2),
        v: +p.snel.toFixed(2), wl: +p.wl.toFixed(2), wDans: +p.wDans.toFixed(2), renner: p.renner, loper: !!p.loper })) })),
  });
  MP.arena = () => ({ zaal: ZAAL, kamer: KAMER });
  MP.audio = (n = 8) => {  // testen: referentie en de laatste n tellen (bas en totaal t.o.v. de referentie)
    const tel = Math.floor(beatPos), r = [];
    for (let t = tel - n; t < tel; t++) r.push([+(ht(hB, t) / (refB || 1)).toFixed(2), +(ht(hT, t) / (refT || 1)).toFixed(2)]);
    return { refB: +refB.toFixed(3), refT: +refT.toFixed(3), stilGeleden: +(beatPos - stilT).toFixed(1), rustRun, wegStart, tellen: r };
  };
  MP.planProef = () => {  // testen: het achtergrondplan van deze kamer stap voor stap (duur per stap en totaal, ms)
    const z = window.doolhof && doolhof.toestand && doolhof.toestand();
    if (!z || !z.own || !z.own.isKamer) return null;
    const it = basisPlan(z.own), t = [];
    for (;;) { const t0 = performance.now(), s = it.next(); t.push(performance.now() - t0); if (s.done) return { soort: z.own.soort, stappen: t.length, maxStap: +Math.max(...t).toFixed(1), totaal: +t.reduce((a, b) => a + b, 0).toFixed(0), stralen: s.value.stralen, nee: s.value.nee }; }
  };
  MP.kamerTest = () => {  // testen: wat zou de kamer van nu opleveren (kandidaten met bereik en vrije straal), alles in één keer
    const z = window.doolhof && doolhof.toestand && doolhof.toestand(), u = [];
    if (!z || !z.own || !z.own.isKamer) return null;
    const B = voltooi(basisPlan(z.own, u)), r = B.nee ? B : kamerArena(z, B);
    return { soort: z.own.soort, nee: r.nee, stralen: B.stralen, n: r.leden && r.leden.length, ring: r.A && +r.A.Rring.toFixed(2), kandidaten: u };
  };
})();

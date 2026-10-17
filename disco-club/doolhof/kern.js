// --- Het doolhof: achter een nieuwe ∞-deur in de rechterwand van zaal 2 begint een eindeloos gebouw van kamers ---
// Kamers staan ver van de club (x -400 en verder, z 300; daar knipt de regie niet weg) en er bestaan er hooguit twee tegelijk:
// de kamer waar de loper is en de volgende (al gebouwd en opgewarmd, maar verborgen). Tussen twee kamers ligt een
// S-gang (2 x 2,6 m) in een stijl uit doolhof/gangen.js. De gang achter de uitgang van kamer A en die vóór de ingang van kamer B zijn exact gelijk;
// in het dwarsstuk (geen deur in zicht) zet de kern loper en camera ongemerkt van A's gang naar dezelfde plek in B's gang.
// Kamermodules (doolhof/*.js) registreren een soort: doolhof.registreer(soort, { gewicht, maak(ctx) => kamer }) (contract: ctx/kamer hieronder).
// Shot SHOTS.doolhof: een loper loopt van het midden van zaal 2 door de ∞-deur en door 2-4 kamers ('Camera: het doolhof' = eindeloos);
// in 'auto' kiest club/showregie.js wanneer (in de break: doolhof.direct, meteen de gang vóór kamer 1 in).
// LIFT (doolhof/lift.js, 17-10): ~1 op 3 overgangen is een lift i.p.v. een S-gang (nooit twee achter elkaar, nooit vanuit zaal 2): sas,
// cabine, sas in een rechte lijn. De loper stopt in de cabine (liftStart), de liftcamera neemt het over, met de deuren dicht wordt kamer A
// onzichtbaar (liftVerstop: de lifthelft hangt dan los in de scène) en wisselt de kern naar de identieke lift vóór kamer B; B blijft
// verborgen tot de deuren opengaan. Levels: R.level per kamer, doolhof.level = nu (0 bij de ∞-deur). Kamers duren sinds 17-10 ~1,5x zo lang
// (BLIJF_X, LOOP_KAMER). Test: doolhof.lift({ cabine, uitzicht, deur, richting, levels }), doolhof.volgendeOvergang = 'lift' | 'gang'.
// Test: doolhof.start('boiler'), doolhof.start('boiler', true) (direct) of doolhof.volgende = 'boiler'.
//
// LICHT: het doolhof is een lichtshow, geen verlichte ruimte. De kern geeft geen vulverlichting (ambient bijna 0, getint met
// show.kleur(0), wit bij show.flits): kamers en gangen lichten zelf (emissive/additief/ShaderMaterial, ctx.licht). Bloom staat aan in
// hoog/midden met de drempel op de felste kleurcomponent (verzadigd rood en blauw gloeien ook op, de luminantie liet ze liggen), plus
// korte lichtsporen (feedback). In de ∞-gang vloeit dat alles vanuit de stand van zaal 2 in (en bij het opruimen weer terug).
// SHOW-BUS window.doolhof.show: één object, elk beeld bijgewerkt (vóór de gangen en kamers), alleen lezen. Zo hebben alle kamers en
// gangen dezelfde show-dynamiek op de tel:
//   stand     'groove' | 'break' | 'opbouw' | 'drop'  (window.clubRegie van club/lichtregie.js; zonder regie altijd 'groove')
//   opbouw    0..1  voortgang van de opbouw (0 bij het begin, 1 na 16 tellen); buiten de opbouw 0
//   drop      0..1  1 op de tel van de drop, klinkt in 16 tellen uit ((1 - tel/16)^2: na 4 tellen 0,56, na 8 0,25); anders 0
//   flits     0..1  strobe-moment (1 = vol wit), alleen op de tel: opbouw steeds sneller (1-2-4-8 per tel, zoals zaal 1), salvo en
//                   flitsen op de tel in de drop, de salvo's van de club in de groove, nooit in de break; altijd 0 als S.strobe 'uit'
//                   is. Wit alleen hiervoor gebruiken.
//   kleur(i)  THREE.Color: kleur i (geheel getal, modulo 3) van het palet van dit moment: verzadigd, nooit wit of pastel. Wisselt hard
//             op de tel: groove per maat (nieuw palet per 8 maten, kleuren volgen de fase van de avond), break per 2 maten (koel
//             blauw/violet), opbouw per maat -> 2 tellen -> elke tel, drop elke tel (heet palet, nieuw per 2 maten).
//             Gedeeld object: elk beeld opnieuw opvragen en niet aanpassen; kleur(i, uit) kopieert in uit en geeft uit terug.
//   blackout  0..1  hoe donker het nu moet: ~0,8 in de break (één spot of langzame bundel), zakt in de opbouw naar 0, 0 in groove en
//                   drop (in ~1 s erin, op de drop meteen 0). De kern dimt zelf alleen zijn ambient en de standaard-doos ermee.
(function () {
  'use strict';
  const doolhof = window.doolhof = window.doolhof || {};
  // show-bus (zie boven): bestaat altijd, ook als de kern hieronder niet start (dan blijft hij op groove)
  const SHOW_KL = [new THREE.Color(0xff0080), new THREE.Color(0x00e5ff), new THREE.Color(0x7a00ff)];
  let showRot = 0;  // welke kleur van het palet nu kleur(0) is
  const show = doolhof.show = { stand: 'groove', opbouw: 0, drop: 0, flits: 0, blackout: 0,
    kleur(i, uit) { const c = SHOW_KL[((((i | 0) + showRot) % 3) + 3) % 3]; return uit ? uit.copy(c) : c; } };
  doolhof.kamers = doolhof.kamers || {};
  doolhof.actief = null;     // de kamer (wat maak() teruggaf) waar de camera nu is
  doolhof.volgende = null;   // soort die als volgende kamer moet komen (testen); daarna weer loting
  doolhof.registreer = function (soort, def) {
    if (!soort || !def || typeof def.maak !== 'function') { console.error('doolhof.registreer: soort + { gewicht, maak(ctx) } nodig', soort); return; }
    doolhof.kamers[soort] = def;
  };
  // gangstijlen (doolhof/gangen.js): doolhof.gangStijl(naam, { gewicht, maak(g, maat, rnd, zwaar) => { muur?, vloer?, plafond?, update(dt, now, b, stand) } })
  doolhof.gangStijlen = doolhof.gangStijlen || {};
  doolhof.volgendeGang = null;  // stijl die de volgende overgang moet krijgen (testen); daarna weer loting
  doolhof.gangStijl = function (naam, def) {
    if (!naam || !def || typeof def.maak !== 'function') { console.error('doolhof.gangStijl: naam + { gewicht, maak(g, maat, rnd, zwaar) } nodig', naam); return; }
    doolhof.gangStijlen[naam] = def;
  };
  if (typeof SHOTS === 'undefined' || typeof zone2 === 'undefined' || typeof makeModelDancer === 'undefined') return;

  // --- maten en standen ---
  const L1 = 2.6, L2 = 5.2, L3 = 2.6, GW = 2.0, GH = 2.6;  // S-gang: been, dwarsstuk, been; breedte en hoogte = de deur
  const BACK = 2.4, VOORUIT = 1.2, OOG = 1.7, LOOP = 1.15; // camera zoveel meter achter de loper op zijn pad; LOOP = tempo van de loopclip
  const SLOT_X = -400, SLOT_STAP = 150, SLOT_Z = 300;     // plekken voor de kamers (om en om, ver van elkaar: buiten het zicht)
  const MAXFIG = [10, 6, 5], MAXLAMP = [2, 1, 0], POOL_MAX = 24;
  const zwaar = () => KW.stand === 'minimaal' ? 2 : KW.stand === 'laag' ? 1 : 0;
  const V3 = (x, z) => new THREE.Vector3(x, 0, z);
  const glad = (x, a, b) => THREE.MathUtils.smoothstep(x, a, b);
  const tA = new THREE.Vector3(), tB = new THREE.Vector3(), tP = new THREE.Vector3(), tL = new THREE.Vector3(), zv = new THREE.Vector3();
  const fout = (wat, e) => console.error('doolhof: ' + wat, e);

  // --- werk op de achtergrond: bouwen, opwarmen en opruimen in stukjes (gemeten op de 3070: doolhof-start 170-500 ms in één beeld,
  // kamerwissel 35-135 ms). Een klus is een generator; na elke yield kijkt de lus naar de klok (per beeld hooguit ~3 ms, in het doolhof
  // zelf 6 ms: daar is een beeld ~4 ms). `yield RUST` = deze klus gaat pas het volgende beeld verder (na een zware stap).
  const RUST = 'rust';
  const werk = [];
  const STAT = doolhof.stat = { klussen: 0, stappen: 0, langste: 0, langsteWat: '', zwaar: [], nu: '', hookMs: 0, shaders: 0, texturen: 0, afgevoerd: 0, voorraad: 0, gebruikt: 0, zonder: 0 };
  function klus(naam, it, voor) { const k = { naam, it }; if (voor) werk.unshift(k); else werk.push(k); STAT.klussen++; return k; }
  const voltooi = it => { for (;;) { const s = it.next(); if (s.done) return s.value; } };  // generator in één keer afmaken
  clubHooks.push(() => {
    STAT.hookMs = 0;
    if (!werk.length) return;
    const t0 = performance.now(), budget = actief && actief.fase === 'doolhof' ? 6 : 3;
    while (werk.length) {
      const k = werk[0], t1 = performance.now();
      let r;
      try { r = k.it.next(); } catch (e) { fout('klus ' + k.naam, e); r = { done: true }; }
      const d = performance.now() - t1;
      STAT.stappen++; if (d > STAT.langste) { STAT.langste = d; STAT.langsteWat = k.naam; }
      if (d > 8) { STAT.zwaar.push(k.naam + ':' + STAT.nu + ' ' + Math.round(d) + ' ms'); if (STAT.zwaar.length > 20) STAT.zwaar.shift(); }
      if (r.done) { const i = werk.indexOf(k); if (i >= 0) werk.splice(i, 1); }
      if (r.value === RUST || performance.now() - t0 >= budget) break;
    }
    STAT.hookMs = performance.now() - t0;
  });

  // --- show-bus bijwerken: elk beeld, vóór de gangen (hook hieronder) en de kamers (in het shot); clubRegie is dan al bij ---
  // paletten: drie verzadigde kleuren per moment, per fase van de avond (club/lichtregie.js); break koel, drop heet
  const PAL = {
    deuren: [[0xff3300, 0xff0066, 0xffaa00], [0xff1a1a, 0xff7a00, 0xc800ff], [0xff0040, 0xffc400, 0xff00b4]],
    piek: [[0xff0080, 0x00e5ff, 0x7a00ff], [0x00ff66, 0xff00c8, 0x0055ff], [0xff2200, 0x00aaff, 0xff00aa], [0xffcc00, 0xff0055, 0x6a00ff]],
    diep: [[0x2233ff, 0x8800ff, 0x00ddff], [0x00ffaa, 0x3300ff, 0xff00cc], [0x0066ff, 0x00ffcc, 0x7700ff]],
    ochtend: [[0xff5500, 0xff1a8c, 0x8a2cff], [0xff8800, 0xff0055, 0x00c8ff], [0xff3366, 0xffaa00, 0xaa00ff]],
  };
  const PAL_BREAK = [[0x1a22ff, 0x7700ff, 0x0099ff], [0x5500ff, 0x0044ff, 0xcc00ff], [0x0033ff, 0x00bbff, 0x6600ff]];
  const PAL_DROP = [[0xff0033, 0x00e5ff, 0xff00cc], [0xff00e5, 0x00ffcc, 0xffdd00], [0xff2200, 0x0066ff, 0xff0099]];
  let showPal = null, showFrase = null, showStand = null;
  function showPalet(fam) {  // nieuw palet uit de familie, niet hetzelfde als nu
    let p = fam[Math.floor(Math.random() * fam.length)];
    if (fam.length > 1 && p === showPal) p = fam[(fam.indexOf(p) + 1) % fam.length];
    showPal = p; for (let i = 0; i < 3; i++) SHOW_KL[i].setHex(p[i]);
  }
  function showBeeld(dt) {
    const R = window.clubRegie, st = (R && R.stand) || 'groove', tel = Math.max(0, beatPos);
    const now = (typeof last === 'number' ? last : performance.now()) / 1000;  // de klok van frame() (daarop staan de strobe-salvo's)
    const nieuw = st !== showStand; showStand = st;
    show.stand = st;
    const kbo = st === 'opbouw' && R ? tel - Math.floor(R.sinds || 0) : 0;  // tellen sinds het begin van de opbouw (als lichtregie)
    show.opbouw = Math.min(1, Math.max(0, kbo / 16));
    const kb = R && R.dropBeat >= 0 ? tel - R.dropBeat : 1e9;                 // tellen sinds de drop
    show.drop = st === 'drop' && kb < 16 ? Math.pow(1 - Math.max(0, kb) / 16, 2) : 0;
    // palet: nieuw bij elke sectie, in de groove per 8 maten, in de drop per 2 maten; de volgorde draait op de tel
    const fam = st === 'break' ? PAL_BREAK : st === 'drop' ? PAL_DROP : PAL[R && R.fase] || PAL.piek;
    const frase = st === 'drop' ? Math.floor(Math.max(0, kb) / 8) : st === 'groove' ? Math.floor(tel / 32) : 0;
    if (nieuw || frase !== showFrase || !showPal) { showFrase = frase; showPalet(fam); }
    const stap = st === 'drop' ? 1 : st === 'break' ? 8 : st === 'opbouw' ? (show.opbouw < 0.5 ? 4 : show.opbouw < 0.75 ? 2 : 1) : 4;
    showRot = Math.floor(tel / stap);
    // flits: alleen op de tel en nooit met de strobe uit
    let f = 0;
    if (S.strobe !== 'uit') {
      const vaak = S.strobe === 'vaak', fase = tel % 1;
      if (st === 'opbouw') {  // zoals zaal 1: 1, 2, 4, 8 flitsen per tel; zwak aan het begin, vol aan het eind
        const n = kbo < 8 ? 1 : kbo < 12 ? 2 : kbo < 16 ? 4 : 8;
        if ((tel * n) % 1 < 0.25) f = 0.3 + 0.7 * show.opbouw;
      } else if (st === 'drop' && kb >= -0.5) {
        const k = Math.max(0, kb);
        if (k < 1) f = Math.exp(-k * period / 0.13);                          // blinder op de tel van de drop
        if (k < (vaak ? 2 : 1)) { if ((tel * 4) % 1 < 0.3) f = 1; }            // salvo (4 per tel)
        else if (k < (vaak ? 8 : 4)) { if (fase < 0.15) f = Math.max(f, vaak ? 1 : 0.8); }  // op elke tel
        else if (vaak && k < 16 && (Math.floor(tel) & 1) === 0 && fase < 0.12) f = Math.max(f, 0.6 * show.drop + 0.2);
      } else if (st === 'groove' && now < strobeUntil) f = (now * strobeHz) % 1 < 0.3 ? 1 : 0;  // de salvo's van de club
    }
    show.flits = f > 0.02 ? f : 0;
    // blackout: break donker, opbouw licht weer op, drop meteen vol
    const wil = st === 'break' ? 0.8 : st === 'opbouw' ? 0.8 * (1 - show.opbouw) : 0;
    if (st === 'drop') show.blackout = 0;
    else show.blackout += (wil - show.blackout) * Math.min(1, dt * (wil > show.blackout ? 1.5 : 3));
    doosBeeld();
  }
  clubHooks.push(dt => showBeeld(dt));
  // groepen die (nog) los van de scène bestaan maar leven: de klaarstaande kamer, de volgende kamer, een nieuwe ∞-gang
  const losseGroepen = new Set();
  const levend = o => { while (o.parent) o = o.parent; return o === scene || losseGroepen.has(o); };
  doolhof.levend = levend;  // (doolhof/lift.js: welke lifthelften nog bestaan)

  // --- shaders vasthouden: three gooit een programma weg zodra geen materiaal het meer gebruikt. Bij het opruimen van een kamer
  // verdwenen zo alle shaders, en elke volgende kamer compileerde ze opnieuw (6-16 per kamer, ~10-100 ms per shader). Programma's van het
  // doolhof krijgen één vaste gebruiker extra; het aantal soorten is begrensd (vaste shaderbronnen met een handvol defines).
  const vast = new WeakSet();
  function vastzetten(van) {
    const P = renderer.info.programs;
    for (let i = van || 0; i < P.length; i++) { const p = P[i]; if (!vast.has(p)) { vast.add(p); p.usedTimes++; } }
  }
  // compileren met de lampen van een stand, zonder de scène te doorlopen. 'doolhof' = zaal 2 uit, de lampen van zaal 1 (de kamerlampen
  // zijn daarvan geleend, zie lampenAan), 'zaal2' = zaal 2 aan (∞-gang, loper in zaal 2). Sleutel van three: soort materiaal, aantal
  // lampen, mist, soort object.
  const nep = { isScene: true, fog: null, environment: null, lampen: [], lijst: [],
    traverseVisible(f) { for (const l of this.lampen) f(l); }, traverse(f) { for (const o of this.lijst) f(o); } };
  function lampenVan(stand) {
    const z2 = zone2.visible, uit = [];
    zone2.visible = stand === 'zaal2';
    try { scene.traverseVisible(o => { if (o.isLight && !poolLicht.includes(o)) uit.push(o); }); } finally { zone2.visible = z2; }
    if (stand === 'doolhof') for (let i = 0; i < tekortLampen(); i++) uit.push(poolLicht[i]);  // de kamerlampen zijn geleende clublampen (zie lampenAan)
    return uit;
  }
  // Compileren zonder te wachten (KHR_parallel_shader_compile): three r128 vraagt na het linken meteen de uniforms op (getUniforms ->
  // getProgramParameter) en dan wacht de hoofdlus tot de driver klaar is (ANGLE/D3D 10-250 ms per shader). Tijdens ons compileerwerk krijgt
  // een NIEUW programma daarom een lege uniformlijst (het linken loopt op de achtergrond door), en daarna vergeet het materiaal die stand
  // (renderer.properties.remove): bij het eerste echte tekenen zoekt three het programma opnieuw op uit de cache, nu met de echte uniforms.
  // Is het linken dan nog niet klaar, dan wacht three zoals vroeger. Zonder de extensie: gewoon compileren (blokkerend).
  const gl = renderer.getContext(), PAR = gl.getExtension('KHR_parallel_shader_compile');
  const LEEG = { seq: [], map: {}, setValue() {}, setOptional() {} }, lopend = new Set();
  let losBezig = false;
  if (PAR) {
    const P = renderer.info.programs, oPush = P.push;
    P.push = function (p) {
      if (losBezig && p && typeof p.getUniforms === 'function' && p.program) {
        const echt = p.getUniforms;
        p.getUniforms = function () { return losBezig ? LEEG : echt.call(this); };
        p.dhEcht = echt; lopend.add(p);
      }
      return oPush.apply(this, arguments);
    };
  }
  function losKlaar() {  // lopende programma's nakijken (vraagt niets dat wacht); true als er niets meer linkt
    for (const p of lopend) {
      if (!gl.getProgramParameter(p.program, PAR.COMPLETION_STATUS_KHR)) continue;
      lopend.delete(p); p.getUniforms = p.dhEcht; delete p.dhEcht;
      if (!gl.getProgramParameter(p.program, gl.LINK_STATUS)) console.error('THREE.WebGLProgram: shader error (doolhof)', gl.getProgramInfoLog(p.program));
    }
    return lopend.size === 0;
  }
  // fn() roept renderer.compile aan voor `objecten`; aantal nieuwe programma's (die blijven bestaan, zie vastzetten)
  function losCompileren(fn, objecten) {
    const P = renderer.info.programs, n0 = P.length, dbg = renderer.debug.checkShaderErrors;
    if (PAR) { losBezig = true; renderer.debug.checkShaderErrors = false; }
    try { fn(); } finally { losBezig = false; renderer.debug.checkShaderErrors = dbg; }
    const nieuw = P.length - n0;
    if (nieuw > 0) { vastzetten(n0); STAT.shaders += nieuw; }
    // lege stand vergeten: elk materiaal dat een programma kreeg dat nog linkt (nieuw, of al eerder gestart en nog niet klaar)
    if (PAR && lopend.size) for (const o of objecten) for (const m of [].concat(o.material || [])) {
      if (m && lopend.has(renderer.properties.get(m).currentProgram)) renderer.properties.remove(m);
    }
    return nieuw;
  }
  // hooguit 2 shaders tegelijk laten linken: te veel tegelijk houdt het gpu-proces bezig en dan staat de hoofdlus alsnog stil
  // (gemeten: 0,2-0,6 s per beeld toen de voorwarmer per beeld ~10 shaders startte)
  const MAXLOS = 2;
  const losVol = () => !!PAR && !losKlaar() && lopend.size >= MAXLOS;
  doolhof.losCompileren = losCompileren;  // ook voor club/voorwarm.js
  doolhof.losKlaar = () => !PAR || losKlaar();
  doolhof.losVol = losVol;
  doolhof.parallel = !!PAR;
  // echt: via de scène zelf (traverse/traverseVisible even vervangen door onze lijsten). three houdt per scène één lampstand bij; met
  // dezelfde lampen als zaal 1 (de doolhof-stand met geleende lampen) blijft zijn versie gelijk, dus hoeft three bij het eerste beeld in
  // het doolhof niet elk materiaal opnieuw op te zoeken (op een trage cpu ~30 ms in het eerste beeld)
  function compileer(lijst, lampen, echt) {
    if (echt) {
      scene.traverse = f => { for (const o of lijst) f(o); };
      scene.traverseVisible = f => { for (const l of lampen) f(l); };
      try { return losCompileren(() => renderer.compile(scene, camera), lijst); } finally { delete scene.traverse; delete scene.traverseVisible; }
    }
    nep.fog = scene.fog; nep.environment = scene.environment; nep.lampen = lampen; nep.lijst = lijst;
    try { return losCompileren(() => renderer.compile(nep, camera), lijst); } finally { nep.lijst = []; }
  }
  const gpuKlaar = t => renderer.properties.get(t).__version === t.version;
  function texturenVan(groepen) {
    const uit = new Set();
    const zet = v => { if (v && v.isTexture && !v.isCubeTexture && !v.isVideoTexture && !v.isWebGLRenderTarget) uit.add(v); };
    for (const g of groepen) g.traverse(o => {
      for (const m of [].concat(o.material || [])) {
        if (!m) continue;
        for (const k in m) zet(m[k]);
        if (m.uniforms) for (const k in m.uniforms) zet(m.uniforms[k] && m.uniforms[k].value);
      }
    });
    return [...uit];
  }

  // --- paden: afgeronde lijnen met booglengte ---
  function afronden(pts, r, n = 6) {  // hoeken vervangen door een boogje (kwadratische bezier) van hooguit r voor en na de hoek
    const uit = [pts[0].clone()];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1], b = pts[i], c = pts[i + 1], d1 = a.distanceTo(b), d2 = b.distanceTo(c);
      const u1 = tA.subVectors(b, a).normalize(), u2 = tB.subVectors(c, b).normalize(), rr = Math.min(r, d1 / 2, d2 / 2);
      if (rr < 1e-3 || u1.dot(u2) > 0.995) { uit.push(b.clone()); continue; }
      const p0 = b.clone().addScaledVector(u1, -rr), p2 = b.clone().addScaledVector(u2, rr);
      for (let k = 0; k <= n; k++) { const t = k / n, s = 1 - t; uit.push(V3(s * s * p0.x + 2 * s * t * b.x + t * t * p2.x, s * s * p0.z + 2 * s * t * b.z + t * t * p2.z)); }
    }
    uit.push(pts[pts.length - 1].clone());
    return uit;
  }
  function maakSpoor(pts) {
    const p = [pts[0]], cum = [0];
    for (let i = 1; i < pts.length; i++) { const d = pts[i].distanceTo(p[p.length - 1]); if (d < 1e-4) continue; p.push(pts[i]); cum.push(cum[cum.length - 1] + d); }
    return { pts: p, cum, len: cum[cum.length - 1] };
  }
  function opSpoor(sp, s, uit) {
    const c = sp.cum, n = c.length;
    if (s <= 0 || n < 2) return uit.copy(sp.pts[0]);
    if (s >= sp.len) return uit.copy(sp.pts[n - 1]);
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= s) lo = m; else hi = m; }
    return uit.lerpVectors(sp.pts[lo], sp.pts[hi], (s - c[lo]) / (c[hi] - c[lo]));
  }
  // de S-gang in zijn eigen ruimte: begint in (0,0) richting +z, dwarsstuk naar +x, eindigt in (L2, L1+L3) weer richting +z
  const SBS = maakSpoor(afronden([V3(0, 0), V3(0, L1), V3(L2, L1), V3(L2, L1 + L3)], 0.8)), SB_LEN = SBS.len;
  const boogBij = (sp, x, z) => { let b = 0, bd = 1e9; sp.pts.forEach((p, i) => { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; b = sp.cum[i]; } }); return b; };
  // wisselpunt: de camera (BACK erachter) is net de eerste bocht om, de loper is nog vóór de tweede: geen deur in beeld
  const E_TP = boogBij(SBS, 0.8, L1) + BACK + 0.25;
  const frameMat = f => new THREE.Matrix4().makeRotationY(f.yaw).setPosition(f.x, 0, f.z);
  const sbPunten = (f, sx) => { const m = frameMat(f); return SBS.pts.map(p => V3(p.x * sx, p.z).applyMatrix4(m)); };

  // --- gedeeld spul: nooit weggooien ---
  const KEEP = new Set([BOX, CYL, SPH, CONE, glassGeo, drinkGeo, cigGeo, tipGeo, slimeGeo, wallTex, envRT.texture, hiddenMat, tripMat, ...smokeTex]);
  const houd = x => { KEEP.add(x); return x; };
  const houden = x => !x || KEEP.has(x) || (x.userData && x.userData.doolhofHouden);

  // --- gangen: een S-vormige schil (muren, vloer, plafond, één dichte kop) met een stijl uit doolhof/gangen.js ---
  // Elke overgang (∞-deur -> kamer 1, kamer A -> kamer B) krijgt één stijl, een spiegeling en een zaad. De gang achter de uitgang van A
  // en die vóór de ingang van B worden er allebei mee gebouwd (zelfde maat, zelfde toevalsreeks, gedeelde geometrie en texturen) en lopen
  // op dezelfde klok (beatPos/now): bij de wissel ziet de camera precies hetzelfde. Nooit twee keer dezelfde stijl achter elkaar.
  // Gangcoördinaten (ook in de shaders, attribuut aP = (s, d, y)): s = booglengte langs de middellijn (0 = begindeur, G_LEN = einddeur),
  // d = zijwaarts (+ = binnenkant van de eerste bocht), y = hoogte; in de bochten draaien s en d om de binnenhoek.
  const GH2 = GW / 2, G_LEN = L1 + L2 + L3, KWART = Math.PI / 2;
  const I1 = [GH2, L1 - GH2], I2 = [L2 - GH2, L1 + GH2];  // binnenhoeken van de twee bochten
  function gangST(x, z) {  // punt in de gang (eigen ruimte) -> [s, d]
    const h = GH2;
    if (x <= h + 1e-6 && z <= L1 - h) return [z, x];
    if (x <= h + 1e-6) { const vx = x - I1[0], vz = z - I1[1]; return [L1 - h + Math.atan2(vz, -vx) / KWART * 2 * h, h - Math.hypot(vx, vz)]; }
    if (x < L2 - h - 1e-6) return [L1 + x, L1 - z];
    if (z < L1 + h - 1e-6) { const vx = x - I2[0], vz = z - I2[1]; return [L1 + L2 - h + Math.atan2(vx, -vz) / KWART * 2 * h, Math.hypot(vx, vz) - h]; }
    return [L2 + z, x - L2];
  }
  function gangXZ(s, d, uit) {  // omgekeerd: (s, d) -> { x, z, dx, dz } (dx, dz = looprichting bij s)
    const h = GH2; uit = uit || {};
    let x, z, dx, dz;
    if (s <= L1 - h) { x = d; z = s; dx = 0; dz = 1; }
    else if (s <= L1 + h) { const a = (s - L1 + h) / (2 * h) * KWART, r = h - d; x = I1[0] - r * Math.cos(a); z = I1[1] + r * Math.sin(a); dx = Math.sin(a); dz = Math.cos(a); }
    else if (s <= L1 + L2 - h) { x = s - L1; z = L1 - d; dx = 1; dz = 0; }
    else if (s <= L1 + L2 + h) { const a = (s - L1 - L2 + h) / (2 * h) * KWART, r = d + h; x = I2[0] + r * Math.sin(a); z = I2[1] - r * Math.cos(a); dx = Math.cos(a); dz = Math.sin(a); }
    else { x = L2 + d; z = s - L2; dx = 0; dz = 1; }
    uit.x = x; uit.z = z; uit.dx = dx; uit.dz = dz; return uit;
  }
  function gangLijn(d) {  // lijn evenwijdig aan de middellijn op afstand d, met verstek in de hoeken (d = ±1 = de muren): { len, punten, op(t) }
    const p = [[d, 0], [d, L1 - d], [L2 + d, L1 - d], [L2 + d, L1 + L3]], cum = [0];
    for (let i = 1; i < 4; i++) cum.push(cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
    return { len: cum[3], punten: p, op(t, uit) {
      uit = uit || {}; let i = 0; while (i < 2 && t > cum[i + 1]) i++;
      const a = p[i], b = p[i + 1], l = cum[i + 1] - cum[i] || 1, u = Math.max(0, Math.min(1, (t - cum[i]) / l));
      uit.x = a[0] + (b[0] - a[0]) * u; uit.z = a[1] + (b[1] - a[1]) * u; uit.dx = (b[0] - a[0]) / l; uit.dz = (b[1] - a[1]) / l; return uit;
    } };
  }
  const reeks = zaad => {  // mulberry32: zelfde zaad = zelfde reeks (beide helften van een overgang)
    let s = zaad >>> 0;
    return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  };
  const recenteGangen = [];
  // lift (doolhof/lift.js): na een S-gang de helft van de keren een lift (zo ~1 op 3 overgangen), nooit twee liften achter elkaar en nooit
  // vanuit zaal 2. lift = { na: de overgang vóór deze kamer, level: het level van de kamer } (alleen bij de uitgang van een kamer).
  // Test: doolhof.volgendeOvergang = 'lift' | 'gang' geldt voor de volgende uitgang van een kamer die gebouwd wordt.
  const LIFT_KANS = 0.5;
  function nieuweOvergang(vorige, sx, lift) {  // stijl kiezen (gewogen, niet de vorige en liefst niet een van de laatste drie)
    const LF = doolhof.lift, lvl = lift ? lift.level || 0 : 0;
    if (lift && LF && typeof LF.plan === 'function') {
      const vast = doolhof.volgendeOvergang, wil = vast === 'lift' || (vast !== 'gang' && !(lift.na && lift.na.lift) && Math.random() < LIFT_KANS);
      if (vast === 'lift' || vast === 'gang') doolhof.volgendeOvergang = null;
      if (wil) {
        try { return { lift: true, stijl: 'lift', vorigeGang: vorige, sx: 1, zaad: (Math.random() * 4294967296) >>> 0, zwaar: zwaar(), deel: new Map(), n: 0, level: lvl, L: LF.plan(lvl) }; }
        catch (e) { fout('lift plannen', e); }
      }
    }
    const S = doolhof.gangStijlen, namen = Object.keys(S).filter(n => S[n] && typeof S[n].maak === 'function' && (+S[n].gewicht || 0) > 0);
    let stijl = null;
    if (doolhof.volgendeGang && S[doolhof.volgendeGang]) { stijl = doolhof.volgendeGang; doolhof.volgendeGang = null; }
    else if (namen.length) {
      let kand = namen.filter(n => n !== vorige && !recenteGangen.includes(n));
      if (!kand.length) kand = namen.filter(n => n !== vorige);
      if (!kand.length) kand = namen;
      let r = Math.random() * kand.reduce((a, n) => a + +S[n].gewicht, 0);
      stijl = kand.find(n => (r -= +S[n].gewicht) < 0) || kand[0];
    }
    if (stijl) { recenteGangen.push(stijl); while (recenteGangen.length > Math.max(0, Math.min(3, namen.length - 2))) recenteGangen.shift(); }
    return { stijl, sx: sx || (Math.random() < 0.5 ? -1 : 1), zaad: (Math.random() * 4294967296) >>> 0, zwaar: zwaar(), deel: new Map(), n: 0, level: lvl };
  }
  // lengte en looplijn van een overgang: S-gang (SBS) of de rechte lift (sas, cabine, sas)
  const ovLen = ov => (ov && ov.lift ? ov.L.LEN : SB_LEN);
  const ovPunten = (f, ov) => (ov && ov.lift ? [V3(f.x, f.z), V3(f.x, f.z + ov.L.LEN / 2), V3(f.x, f.z + ov.L.LEN)] : sbPunten(f, ov.sx));

  // de schil: muren (in stukken van 0,4 m), vloer en plafond (rechte stukken + waaiers in de bochten), koppen apart.
  // uv muren = schildering per muurstuk (eigen verschuiving, naad alleen in de hoeken, leesbaar ook gespiegeld), vloer/plafond = meters
  function bak() {
    const P = [], N = [], U = [], A = [];
    const zet = (p, nx, ny, nz) => { P.push(p.x, p.y, p.z); N.push(nx, ny, nz); U.push(p.u, p.v); A.push(p.s, p.d, p.y); };
    const drie = (a, b, c, nx, ny, nz) => {  // volgorde zo dat de voorkant naar (nx, ny, nz) kijkt
      const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
      if ((uy * vz - uz * vy) * nx + (uz * vx - ux * vz) * ny + (ux * vy - uy * vx) * nz < 0) { const t = b; b = c; c = t; }
      zet(a, nx, ny, nz); zet(b, nx, ny, nz); zet(c, nx, ny, nz);
    };
    return { drie, vier(a, b, c, d, nx, ny, nz) { drie(a, b, c, nx, ny, nz); drie(a, c, d, nx, ny, nz); },
      geo() {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setAttribute('aP', new THREE.Float32BufferAttribute(A, 3));
        g.computeBoundingSphere(); return g;
      } };
  }
  function schilGeo(ov, st) {
    const h = GH2, r = reeks(ov.zaad ^ 0x5bd1e995), sx = ov.sx;
    const [bw, bh] = Array.isArray(st.muurMaat) ? st.muurMaat : [GH * 2048 / 869, GH], [vw, vh] = Array.isArray(st.vloerMaat) ? st.vloerMaat : [2, 2];
    const muren = bak(), vloer = bak(), plafond = bak(), kapB = bak(), kapE = bak();
    const wand = (B, x0, z0, x1, z1, nx, nz) => {  // muurstuk van (x0,z0) naar (x1,z1), voorkant naar (nx, nz)
      const len = Math.hypot(x1 - x0, z1 - z0), ex = (x1 - x0) / len, ez = (z1 - z0) / len;
      const heen = (ex * nz - ez * nx) * sx > 0;  // loopt het stuk voor de kijker naar rechts? anders de schildering omdraaien
      const u0 = r() * Math.max(0, 1 - len / bw), v0 = r() * Math.max(0, 1 - GH / bh), n = Math.max(1, Math.ceil(len / 0.4));
      const pt = (t, y) => {
        const tt = Math.min(len - 1e-3, Math.max(1e-3, t)), c = gangST(x0 + ex * tt, z0 + ez * tt);  // iets het stuk in: hoekpunten horen bij dit stuk
        return { x: x0 + ex * t, y, z: z0 + ez * t, u: u0 + (heen ? t : len - t) / bw, v: v0 + y / bh, s: c[0], d: c[1] };
      };
      for (let i = 0; i < n; i++) { const a = len * i / n, b = len * (i + 1) / n; B.vier(pt(a, 0), pt(b, 0), pt(b, GH), pt(a, GH), nx, 0, nz); }
    };
    wand(muren, -h, 0, -h, L1 + h, 1, 0); wand(muren, -h, L1 + h, L2 - h, L1 + h, 0, -1); wand(muren, L2 - h, L1 + h, L2 - h, L1 + L3, 1, 0);
    wand(muren, h, 0, h, L1 - h, -1, 0); wand(muren, h, L1 - h, L2 + h, L1 - h, 0, 1); wand(muren, L2 + h, L1 - h, L2 + h, L1 + L3, -1, 0);
    wand(kapB, -h, 0, h, 0, 0, 1); wand(kapE, L2 - h, L1 + L3, L2 + h, L1 + L3, 0, -1);
    const vlak = (B, y, ny) => {
      const P = (x, z, s, d) => ({ x, y, z, u: (x + h) / vw, v: z / vh, s, d });
      const recht = (x0, z0, x1, z1) => {
        const c = (x, z) => { const q = gangST(x + (x < (x0 + x1) / 2 ? 1e-3 : -1e-3), z + (z < (z0 + z1) / 2 ? 1e-3 : -1e-3)); return P(x, z, q[0], q[1]); };
        B.vier(c(x0, z0), c(x1, z0), c(x1, z1), c(x0, z1), 0, ny, 0);
      };
      recht(-h, 0, h, L1 - h); recht(h, L1 - h, L2 - h, L1 + h); recht(L2 - h, L1 + h, L2 + h, L1 + L3);
      const waaier = (I, dir, s0, sd) => {  // bocht: driehoeken vanuit de binnenhoek, s en d als poolcoördinaten
        const q = (a, f) => { const rho = 2 * h / Math.max(Math.cos(a), Math.sin(a)), rr = rho * f, [ux, uz] = dir(a); return P(I[0] + ux * rr, I[1] + uz * rr, s0 + a / KWART * 2 * h, sd * (h - rr)); };
        for (let k = 0; k < 8; k++) {
          const a0 = KWART * k / 8, a1 = KWART * (k + 1) / 8;
          B.drie(q((a0 + a1) / 2, 0), q(a0, 0.5), q(a1, 0.5), 0, ny, 0);
          B.vier(q(a0, 0.5), q(a0, 1), q(a1, 1), q(a1, 0.5), 0, ny, 0);
        }
      };
      waaier(I1, a => [-Math.cos(a), Math.sin(a)], L1 - h, 1);
      waaier(I2, a => [Math.sin(a), -Math.cos(a)], L1 + L2 - h, -1);
    };
    vlak(vloer, 0, 1); vlak(plafond, GH, -1);
    return { muren: muren.geo(), vloer: vloer.geo(), plafond: plafond.geo(), kapBegin: kapB.geo(), kapEind: kapE.geo() };
  }

  // standaard (kale) gang: de oude donkere gang met rode lampjes, als er (nog) geen stijlen zijn of een stijl faalt
  const gangMuur = houd(new THREE.MeshBasicMaterial({ map: wallTex, color: 0x2e2527 }));
  const gangVloer = houd(new THREE.MeshBasicMaterial({ color: 0x0b090b }));
  const gangPlafond = houd(new THREE.MeshBasicMaterial({ color: 0x060406 }));
  const gangLamp = houd(new THREE.MeshBasicMaterial({ color: 0xff3020 }));
  const gloedTex = houd(canvasTexture(64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }));
  const gangGloed = houd(new THREE.MeshBasicMaterial({ map: gloedTex, color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  const gangVlak1 = houd(new THREE.PlaneGeometry(1, 1));
  function kaleGang(g) {
    for (let s = 1.3; s < G_LEN; s += 2.6) {
      const p = gangXZ(s, 0);
      add(g, SPH, gangLamp, [p.x, GH - 0.07, p.z], [0.05, 0.05, 0.05]);
      const m = add(g, gangVlak1, gangGloed, [p.x, GH - 0.012, p.z], [1.2, 1.2, 1]); m.rotation.x = Math.PI / 2;
    }
    return { muur: gangMuur, vloer: gangVloer, plafond: gangPlafond, muurMaat: [5.2, GH],
      update(dt, now, b) {  // gedeeld materiaal: elke kale gang gelijk
        gangLamp.color.setRGB(1, 0.2, 0.12).multiplyScalar(0.55 + 0.45 * b.pulse);
        gangGloed.color.setRGB(0.45, 0.05, 0.03).multiplyScalar(0.6 + 0.4 * b.pulse);
      } };
  }

  // wat een stijl over de gang weet (gelijk voor beide helften van een overgang)
  const gangBol = new THREE.Sphere(new THREE.Vector3(L2 / 2, GH / 2, (L1 + L3) / 2), 4.8);  // omhullende bol (frustum-culling van instanced spul)
  const gangPad = SBS.pts.map(p => ({ x: p.x, z: p.z }));  // de looplijn (afgerond)
  function gangMaat(ov) {
    const h = GH2;
    return { L1, L2, L3, B: GW, H: GH, h, LEN: G_LEN, sx: ov.sx, zwaar: ov.zwaar, bol: gangBol, pad: gangPad,
      st: gangST, xz: gangXZ, lijn: gangLijn,
      dwars: [[0.2, L1 - h - 0.1], [L1 + h + 0.1, L1 + L2 - h - 0.1], [L1 + L2 + h + 0.1, G_LEN - 0.2]],  // rechte stukken (s): daar past iets dwars van muur tot muur
      kijk: [{ x: 0, z: L1 + h - 0.03, ry: Math.PI }, { x: L2 + h - 0.03, z: L1, ry: -Math.PI / 2 }],      // de muren recht vooruit (been 1, dwarsstuk)
      recht: o => { if (ov.sx < 0) o.scale.x = -o.scale.x; return o; },                                   // tekst leesbaar houden in een gespiegelde gang
      deel: (k, f) => { if (!ov.deel.has(k)) ov.deel.set(k, f()); return ov.deel.get(k); } };            // één keer maken, beide helften gebruiken het
  }
  function gangBeat() { const r = window.clubRegie || null; return { pos: beatPos, pulse, energy, bas: bands[0].v, mid: bands[1].v, hoog: bands[2].v, stand: (r && r.stand) || 'groove', regie: r }; }
  const gangLijst = new Set();  // levende gangen: elke frame update (ook verborgen: dan klopt ook het eerste beeld na de wissel)
  // gang plaatsen: frame f = begin en richting (yaw) in de ruimte van parent, ov = de overgang (stijl, sx, zaad), kap = welk eind dicht.
  // In stappen (generator): een stijl mag zelf een generator teruggeven (doolhof/gangen.js), dan per stuk; gang() = in één keer.
  function gang(parent, f, ov, kap) { return voltooi(gangStappen(parent, f, ov, kap)); }
  function* gangStappen(parent, f, ov, kap) {
    const g = new THREE.Group();
    g.position.set(f.x, 0, f.z); g.rotation.y = f.yaw; g.scale.x = ov.sx;  // spiegelen mag: three draait de voorkant dan zelf om
    parent.add(g);
    const def = ov.stijl && !ov.kapot ? doolhof.gangStijlen[ov.stijl] : null, maat = gangMaat(ov);
    let st = null;
    if (def) {
      try {
        const r = def.maak(g, maat, reeks(ov.zaad), ov.zwaar);
        if (r && typeof r.next === 'function' && typeof r.throw === 'function') {
          for (;;) { const s = r.next(); if (s.done) { st = s.value || {}; break; } yield; }
        } else st = r || {};
      } catch (e) {  // dan beide helften kaal (ov.kapot)
        fout('gangstijl ' + ov.stijl, e); ov.kapot = true; st = null;
        const weg = new THREE.Group(); for (const c of [...g.children]) weg.add(c);
        afvoerLater([weg]);
      }
    }
    if (!st) st = kaleGang(g);
    const sg = maat.deel('schil', () => schilGeo(ov, st));
    const muur = st.muur || gangMuur;
    for (const [geo, mat] of [[sg.muren, muur], [sg.vloer, st.vloer || gangVloer], [sg.plafond, st.plafond || gangPlafond]]) g.add(new THREE.Mesh(geo, mat));
    const kop = new THREE.Mesh(kap === 'begin' ? sg.kapBegin : sg.kapEind, st.kap || muur); kop.userData.kap = kap; g.add(kop);
    const x = { g, stijl: ov.stijl || 'kaal', update: typeof st.update === 'function' ? st.update : null };
    g.userData.gangStijl = x.stijl;
    gangLijst.add(x);
    if (x.update) { const b = gangBeat(); try { x.update(0, performance.now() / 1000, b, b.stand); } catch (e) { x.update = null; fout('gangstijl ' + x.stijl + ' (update)', e); } }
    if (++ov.n >= 2) ov.deel.clear();  // beide helften staan: het deel-lijstje is niet meer nodig
    return g;
  }
  clubHooks.push((dt, now) => {
    // de ∞-gang krijgt zijn eerste stijl zodra doolhof/gangen.js geladen is (bij het laden van de kern bestonden er nog geen)
    if (zaal2Ov && !zaal2Ov.stijl && !actief && !voorraad && Object.keys(doolhof.gangStijlen).length) zaal2Gang();
    if (!gangLijst.size) return;
    const b = gangBeat();
    for (const x of gangLijst) {
      // ook de gangen van een kamer die nog los klaarstaat: dan klopt het eerste beeld na de wissel meteen (update = functie van de klok)
      if (!levend(x.g)) { gangLijst.delete(x); continue; }
      if (x.update) try { x.update(dt, now, b, b.stand); } catch (e) { x.update = null; fout('gangstijl ' + x.stijl + ' (update)', e); }
    }
  });

  // --- de ∞-deur: rechterwand van zaal 2 (x = 17) rond z = 30, met dezelfde S-gang erachter ---
  const ZD = { x: Z2.x + Z2.w / 2, z: 30 };
  const ZAAL2_UIT = { x: ZD.x, z: ZD.z, yaw: Math.PI / 2 }, ZAAL2_SX = 1;
  let zaal2Ov = null, zaal2Groep = null;
  function zaal2Gang() {  // de ∞-gang opnieuw bouwen met een nieuwe stijl (bij elk doolhof-shot; de eerste kamer krijgt dezelfde gang)
    const oud = zaal2Groep;
    zaal2Ov = nieuweOvergang(zaal2Ov && zaal2Ov.stijl, ZAAL2_SX);
    zaal2Groep = gang(zone2, ZAAL2_UIT, zaal2Ov, 'eind');
    if (oud) { zone2.remove(oud); afvoerLater([oud]); }
  }
  (function bouwDeur() {
    const room2 = zone2.children.find(o => o.isMesh && Array.isArray(o.material) && o.material[0] === tripMat);
    if (!room2) { console.error('doolhof: wand van zaal 2 niet gevonden'); return; }
    room2.material = room2.material.slice(); room2.material[0] = hiddenMat;
    const X = ZD.x, z0 = Z2.z - Z2.d / 2, z1 = Z2.z + Z2.d / 2, H = Z2.h, DZ0 = ZD.z - GW / 2, DZ1 = ZD.z + GW / 2;
    // wand in drie stukken om de deur; vlak kijkt naar buiten (+x), het BackSide-materiaal toont hem van binnen; uv zoals de doos-wand
    const stuk = (mat, x, za, zb, ya, yb) => {
      const g = new THREE.PlaneGeometry(zb - za, yb - ya), pos = g.attributes.position, uv = g.attributes.uv, cz = (za + zb) / 2, cy = (ya + yb) / 2;
      for (let i = 0; i < pos.count; i++) uv.setXY(i, (z1 - (cz - pos.getX(i))) / Z2.d, (cy + pos.getY(i)) / H);
      const m = new THREE.Mesh(g, mat); m.position.set(x, cy, cz); m.rotation.y = Math.PI / 2; zone2.add(m); return m;
    };
    for (const [za, zb, ya, yb] of [[z0, DZ0, 0, H], [DZ1, z1, 0, H], [DZ0, DZ1, GH, H]]) stuk(tripMat, X, za, zb, ya, yb);
    // blacklight-binnendoos van z2/lasers.js: ook daar een gat, de stukken volgen zijn zichtbaarheid
    const uvDoos = zone2.children.find(o => o.isMesh && o.geometry === BOX && Array.isArray(o.material) && o.material.length === 6 &&
      o.material[0].blending === THREE.AdditiveBlending && o.material[0].side === THREE.BackSide);
    if (uvDoos) {
      const uvMat = uvDoos.material[0], e = 0.03, stukken = [];
      uvDoos.material = uvDoos.material.slice(); uvDoos.material[0] = hiddenMat;
      for (const [za, zb, ya, yb] of [[z0 + e, DZ0, 0.02, H - 0.02], [DZ1, z1 - e, 0.02, H - 0.02], [DZ0, DZ1, GH, H - 0.02]]) { const m = stuk(uvMat, X - e, za, zb, ya, yb); m.visible = false; stukken.push(m); }
      z2Hooks.push(() => { for (const m of stukken) m.visible = uvDoos.visible; });
    }
    const kozijn = std(0x18161c, 0.6, 0.5);
    for (const dz of [-GW / 2 - 0.06, GW / 2 + 0.06]) add(zone2, BOX, kozijn, [X - 0.05, GH / 2, ZD.z + dz], [0.12, GH, 0.12]);
    add(zone2, BOX, kozijn, [X - 0.05, GH + 0.06, ZD.z], [0.12, 0.12, GW + 0.24]);
    add(zone2, BOX, kozijn, [X - 0.04, 3.25, ZD.z], [0.04, 0.62, 1.9]);  // donkere plaat: additief neon verdween op de felle kaleidoscoopwand
    const bord = neonSign('∞', '#3cffc8', 1.6, 0.4); bord.position.set(X - 0.08, 3.25, ZD.z); bord.rotation.y = -Math.PI / 2; zone2.add(bord);
    zaal2Gang();
  })();

  // --- figuren: een eigen voorraad (geen nieuwe klonen per kamer: geen hapering bij het bouwen, geen geheugengroei) ---
  const pool = [];  // { d, M, vrij, orig: Map(mesh -> materiaal) }, op volgorde van gebruik (vooraan = langst niet gebruikt)
  function maakPoolFig(M) {
    const d = makeModelDancer(M, false);
    if (d.root.parent) d.root.parent.remove(d.root);
    M.used = Math.max(0, (M.used || 1) - 1);  // telt niet mee voor de verdeling van de club
    d.root.traverse(o => { o.castShadow = false; });
    const p = { d, M, vrij: true, orig: new Map(), vast: new Set() };
    d.body.traverse(o => { if (o.isMesh) p.orig.set(o, o.material); if (o.isBone) for (const c of o.children) if (!c.isBone) p.vast.add(c); });
    pool.push(p);
    return p;
  }
  function weggooien(p) {
    pool.splice(pool.indexOf(p), 1);
    const d = p.d;
    if (d.root.parent) d.root.parent.remove(d.root);
    d.mixer.stopAllAction(); d.mixer.uncacheRoot(d.body);
    d.body.traverse(o => { if (o.isSkinnedMesh && o.skeleton) o.skeleton.dispose(); });
    for (const m of p.orig.values()) if (!houden(m)) m.dispose();  // eigen kloon van de herkleuring; texturen horen bij het model
  }
  function lenen(R, filter, paal) {
    const mag = M => !M.keep && (!filter || filter.test(M.file));
    let ms = (paal ? poleModels() : allModels()).filter(mag);
    if (!ms.length && filter && !paal) ms = allModels().filter(M => !M.keep);  // filter vond niets: dan een ander figuur
    if (!ms.length) return null;
    // het model dat in deze kamer het minst voorkomt, liefst eentje dat al vrij in de voorraad staat
    const tel = M => R ? R.modelTel.get(M) || 0 : 0, lo = Math.min(...ms.map(tel)), kand = ms.filter(M => tel(M) === lo);
    const vrijM = kand.filter(M => pool.some(q => q.vrij && q.M === M)), M = pick(vrijM.length ? vrijM : kand);
    let p = pool.find(q => q.vrij && q.M === M);
    if (!p) {
      if (pool.length >= POOL_MAX) { const oud = pool.find(q => q.vrij); if (!oud) return null; weggooien(oud); }
      p = maakPoolFig(M);
    }
    p.vrij = false;
    pool.splice(pool.indexOf(p), 1); pool.push(p);
    return p;
  }
  // andere kleuren dan de vorige keer: de uniforms van recolorMat zitten na het compileren in de renderer-eigenschappen
  function herkleur(p, full) {
    p.d.body.traverse(o => {
      if (!o.isMesh) return;
      for (const m of new Set([].concat(o.material, p.orig.get(o) || []))) {
        const pr = renderer.properties.get(m), u = pr && pr.uniforms;
        if (!u || !u.uTop) continue;
        u.uTop.value = full ? Math.random() : rnd(-0.25, 0.25);
        u.uCloth.value.setHSL(Math.random(), rnd(0.2, 0.9), rnd(0.35, 0.8)).convertLinearToSRGB();
        u.uDark.value.setHSL(Math.random(), rnd(0.3, 0.9), rnd(0.15, 0.4)).convertLinearToSRGB();
        u.uDarkMix.value = full && Math.random() > 0.35 ? rnd(0.5, 1) : 0;
        u.uHair.value.set(pick(HAIR)).convertLinearToSRGB();
        u.uSkin.value = pick([0.55, 0.75, 1, 1.25, 1.45]);
      }
    });
  }
  function maat(p, paal) {  // maat en spiegeling zoals makeModelDancer (paal: ware grootte, daar zijn de grepen op berekend)
    const M = p.M, s = paal ? 1 : (M.type === 'alien' ? rnd(2.05, 2.35) : rnd(1.6, 1.85)) / M.h;
    p.d.body.scale.set((Math.random() < 0.4 ? -1 : 1) * s, s, s);
  }
  function terug(p) {  // figuur terug in de voorraad, schoon voor de volgende kamer
    const d = p.d;
    if (d.root.parent) d.root.parent.remove(d.root);
    d.mixer.stopAllAction();
    for (let i = held.length - 1; i >= 0; i--) if (held[i].d === d) { scene.remove(held[i].g); held.splice(i, 1); }
    for (let i = smokers.length - 1; i >= 0; i--) if (smokers[i].d === d) smokers.splice(i, 1);
    const weg = [];  // sigaret, telefoon en ander spul aan de botten
    d.body.traverse(o => { if (o.isBone) for (const c of o.children) if (!c.isBone && !p.vast.has(c)) weg.push(c); });
    for (const c of weg) { c.parent.remove(c); c.traverse(o => { if (o.geometry && !houden(o.geometry)) o.geometry.dispose(); if (o.material && !houden(o.material)) o.material.dispose(); }); }
    d.body.traverse(o => {  // eigen materiaal van een kamer eraf (de lambert-kopie van club/kwaliteit.js mag blijven)
      const org = p.orig.get(o), m = o.material;
      if (org && m !== org && !(m && m.isMeshLambertMaterial && m.userData === org.userData)) o.material = org;
    });
    Object.assign(d, { cur: null, prev: null, fade: 1, fadeK: 0.7, fadeRate: 2, queue: null, acts: null, actT: 0, nextChange: 0, tq: 0, px: 0, pz: 0,
      faceT: undefined, yOff: undefined, seat: undefined, zitPlek: null, zitKlaar: false, rol: null, djBasis: null, loopA: null, calm: false });
    d.home.set(0, 0, 0); d.face = 0;
    d.root.position.set(0, 0, 0); d.root.rotation.set(0, 0, 0); d.root.visible = true; d.body.visible = true;
    p.vrij = true;
  }

  // --- opruimen: geometrie, materialen en texturen die alleen in deze groep zaten ---
  function verzamel(root, G, Mt, T) {
    root.traverse(o => {
      if (o.geometry) G.add(o.geometry);
      if (!o.material) return;
      for (const m of [].concat(o.material)) {
        if (!m) continue;
        Mt.add(m);
        for (const k in m) { const v = m[k]; if (v && v.isTexture) T.add(v); }
        if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k] && m.uniforms[k].value; if (v && v.isTexture) T.add(v); }
      }
    });
  }
  // in stukjes (de hele scène doorlopen kostte ~7-10 ms in één beeld): eerst wat de groepen gebruiken, dan de rest van de scène per 32
  // kinderen, aan het eind in één keer wat er intussen bij kwam (andere kamers, de ∞-gang, de voorraad), dan weggooien. De groepen zijn al
  // uit de scène; wat de rest (club, zaal 2, de andere kamer) nog gebruikt, blijft.
  function* afvoerStappen(groepen) {
    const G = new Set(), Mt = new Set(), T = new Set(), g2 = new Set(), m2 = new Set(), t2 = new Set(), gezien = new Set();
    STAT.nu = 'afvoer';
    for (const g of groepen) verzamel(g, G, Mt, T);
    yield;
    const kids = scene.children.slice();
    for (let i = 0; i < kids.length; i++) {
      gezien.add(kids[i]);
      if (!groepen.includes(kids[i])) verzamel(kids[i], g2, m2, t2);
      if ((i & 15) === 15) { yield; STAT.nu = 'afvoer'; }
    }
    for (const c of scene.children) if (!gezien.has(c) && !groepen.includes(c)) verzamel(c, g2, m2, t2);
    if (zaal2Groep) verzamel(zaal2Groep, g2, m2, t2);
    for (const g of losseGroepen) if (!groepen.includes(g)) verzamel(g, g2, m2, t2);
    for (const p of pool) verzamel(p.d.root, g2, m2, t2);
    const weg = [];
    for (const x of G) if (!g2.has(x) && !houden(x)) weg.push(x);
    for (const x of Mt) if (!m2.has(x) && !houden(x)) weg.push(x);
    for (const x of T) if (!t2.has(x) && !houden(x)) weg.push(x);
    for (let i = 0; i < weg.length; i++) { weg[i].dispose(); if ((i & 31) === 31) { yield; STAT.nu = 'afvoer'; } }
    STAT.afgevoerd += weg.length;
  }
  function afvoerLater(groepen) { klus('opruimen', afvoerStappen(groepen)); }

  // --- standaardmaterialen van ctx.doos (onverlicht: geen lamp nodig, ook op de tv) ---
  const tegelTex = houd(canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#0e0d10'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const v = 30 + Math.floor(Math.random() * 16); g.fillStyle = `rgb(${v},${v - 3},${v + 4})`; g.fillRect(x * 64 + 2, y * 64 + 2, 60, 60); }
    const img = g.getImageData(0, 0, w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 14; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    g.putImageData(img, 0, 0);
  }));
  tegelTex.wrapS = tegelTex.wrapT = THREE.RepeatWrapping;
  const DOOS = {
    vloer: houd(new THREE.MeshBasicMaterial({ map: tegelTex, color: 0x9a96a4 })),
    muur: houd(new THREE.MeshBasicMaterial({ map: wallTex, color: 0x4a4048 })),
    plafond: houd(new THREE.MeshBasicMaterial({ color: 0x0d0b10 })),
  };
  // de standaard-doos zakt weg in het donker: alleen de show licht hem op (een zweem palet op de tel, wit bij een flits)
  function doosBeeld() {
    const a = 1 - 0.75 * show.blackout, p = pulse * energy * a, f = show.flits;
    show.kleur(0, DOOS.vloer.color).multiplyScalar(0.5 * p).addScalar(0.2 * a + 1.0 * f);
    show.kleur(1, DOOS.muur.color).multiplyScalar(0.14 * p).addScalar(0.06 * a + 0.6 * f);
    DOOS.plafond.color.setScalar(0.025 * a + 0.25 * f);
  }
  // vlak dat naar binnen kijkt; uv = deel [u0,u1,v0,v1] zodat stukken van één wand doorlopen.
  // BackSide-materiaal (zoals de club-doos): winding en normalen om, dan toont BackSide dezelfde binnenkant met dezelfde uv.
  function binnenVlak(parent, mat, bw, bh, pos, ry, rx, uv) {
    const g = new THREE.PlaneGeometry(bw, bh);
    if (uv) { const a = g.attributes.uv; for (let i = 0; i < a.count; i++) a.setXY(i, uv[0] + a.getX(i) * (uv[1] - uv[0]), uv[2] + a.getY(i) * (uv[3] - uv[2])); }
    if (mat.side === THREE.BackSide) {
      const idx = g.index.array; for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
      const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
    }
    const m = new THREE.Mesh(g, mat); m.position.set(pos[0], pos[1], pos[2]); m.rotation.set(rx || 0, ry || 0, 0); parent.add(m); return m;
  }
  function doos(R, o) {
    o = o || {};
    const w = Math.max(2.4, +o.w || 10), d = Math.max(2.4, +o.d || 14), h = Math.max(2.7, +o.h || 4), dh = Math.min(GH, h);
    const muur = i => (Array.isArray(o.muur) ? o.muur[i] : o.muur) || DOOS.muur, vl = o.vloer || DOOS.vloer, pl = o.plafond || DOOS.plafond;
    const g = new THREE.Group(); R.groep.add(g);
    binnenVlak(g, vl, w, d, [0, 0, 0], 0, -Math.PI / 2, vl === DOOS.vloer ? [0, w / 2, 0, d / 2] : null);  // standaardvloer: tegels van 0,5 m
    binnenVlak(g, pl, w, d, [0, h, 0], 0, Math.PI / 2, null);
    binnenVlak(g, muur(0), d, h, [-w / 2, h / 2, 0], Math.PI / 2, 0, null);
    binnenVlak(g, muur(1), d, h, [w / 2, h / 2, 0], -Math.PI / 2, 0, null);
    for (const [i, zw, ry] of [[2, -d / 2, 0], [3, d / 2, Math.PI]]) {  // ingang en uitgang: drie stukken om een deur van 2 x 2,6 m
      const sg = ry ? -1 : 1;  // de uitgangswand is 180 graden gedraaid: zijn 'rechts' is -x
      for (const [a0, a1, b0, b1] of [[-w / 2, -GW / 2, 0, h], [GW / 2, w / 2, 0, h], [-GW / 2, GW / 2, dh, h]]) {
        if (a1 - a0 < 1e-3 || b1 - b0 < 1e-3) continue;
        binnenVlak(g, muur(i), a1 - a0, b1 - b0, [sg * (a0 + a1) / 2, (b0 + b1) / 2, zw], ry, 0, [(a0 + w / 2) / w, (a1 + w / 2) / w, b0 / h, b1 / h]);
      }
    }
    return g;
  }

  // --- ctx: wat een kamer bij het bouwen krijgt ---
  function maakCtx(R) {
    let seed = (Math.random() * 4294967296) >>> 0;
    const rndK = () => {  // mulberry32: per kamer een eigen reeks
      seed = (seed + 0x6D2B79F5) >>> 0; let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
      groep: R.groep, rnd: rndK, zwaar: R.zwaar,
      doos: o => doos(R, o),
      figuur: o => figuur(R, o),
      // lamp-handvat: een PointLight die zelf niet in de scène hangt; de kern zet elk beeld een vaste lamp op zijn plek, kleur en sterkte
      // (zo blijft het aantal lampen gelijk en hoeft niets opnieuw te compileren). Positie in kamer-coördinaten, aan/uit via intensity.
      licht(kleur, sterkte, bereik, x, y, z) {
        if (R.weg || R.lampen.length >= MAXLAMP[R.zwaar]) return null;
        const l = new THREE.PointLight(kleur == null ? 0xffffff : kleur, sterkte == null ? 1 : sterkte, bereik == null ? 10 : bereik, 1.5);
        l.position.set(x || 0, y == null ? 2.5 : y, z || 0); l.visible = false;
        R.lampen.push(l); return l;
      },
      neon(tekst, kleur, b, h) { const m = neonSign(String(tekst), kleur || '#ff2d95', b || 2, h || (b || 2) / 4); R.groep.add(m); return m; },
      trip() { const m = tripMat.clone(); R.trips.push(m); return m; },
      beat: () => ({ pos: beatPos, pulse, energy, bas: bands[0].v, mid: bands[1].v, hoog: bands[2].v }),
    };
  }
  function figuur(R, o) {
    o = o || {};
    if (R.weg || R.figs.length >= MAXFIG[R.zwaar] || !allModels().length) return null;
    let rol = o.rol || 'dans';
    if (rol === 'paal' && !(poleBVH && poleModels().length)) rol = 'dans';
    if ((rol === 'staan' && !ACTS.Stand_and_Chat && !ACTS.Stand_and_Drink) || (rol === 'zit' && !ACTS.Chair_Sit_Idle_F && !ACTS.Chair_Sit_Idle_M && !ACTS.Sit_and_Drink) ||
        (rol === 'juich' && !ACTS.Cheer_with_Both_Hands_Up && !ACTS.Happy_jump_f)) rol = 'dans';  // clips (nog) niet binnen: dan dansen
    if (!['dans', 'staan', 'zit', 'juich', 'dj', 'paal'].includes(rol)) rol = 'dans';
    const p = lenen(R, o.filter instanceof RegExp ? o.filter : null, rol === 'paal');
    if (!p) return null;
    const d = p.d, M = p.M;
    R.modelTel.set(M, (R.modelTel.get(M) || 0) + 1);
    R.figs.push(p);
    herkleur(p, rol === 'paal' || (M.type === 'pop' && !/man-1/.test(M.file)));
    maat(p, rol === 'paal');
    if (typeof versier === 'function') try { versier(d, M, rol); } catch (e) { fout('versier', e); }  // per kamer een andere bouw en andere spullen (index.html)
    d.rol = rol;
    d.home.set(+o.x || 0, 0, +o.z || 0); d.face = +o.face || 0;
    d.root.position.set(d.home.x, rol === 'paal' ? +o.y || 0 : 0, d.home.z); d.root.rotation.set(0, d.face, 0);
    R.groep.add(d.root);
    d.root.visible = !!R.actief;  // in de nog verborgen volgende kamer: geen rookpluimpjes en drankjes die de club-voorraad opmaken
    if (rol === 'staan') {
      d.acts = ['Stand_and_Chat', 'Stand_and_Drink'].filter(n => ACTS[n]); d.actT = 0;
      const r = Math.random(); if (r < 0.3) giveDrink(d, 'sigaret'); else if (r < 0.65) giveDrink(d, null);
    } else if (rol === 'zit') {  // heupen op (x, 0,69, z), zoals de lounge
      d.yOff = 0.001; d.zitPlek = new THREE.Vector3(d.home.x, 0.69, d.home.z); d.zitKlaar = false;
      const vrouw = /pop-1|witch|burlesque|showgirl/.test(M.file);
      d.acts = [vrouw ? 'Chair_Sit_Idle_F' : 'Chair_Sit_Idle_M', 'Sit_and_Drink'].filter(n => ACTS[n]); d.actT = 0;
      if (Math.random() < 0.5) giveDrink(d, Math.random() < 0.5 ? 'sigaret' : null);
    } else if (rol === 'juich') {
      forceDance(d, ACTS.Cheer_with_Both_Hands_Up || ACTS.Happy_jump_f, beatPos, 8);
    } else if (rol === 'dj') {  // stand-clip op vol gewicht eronder: de dans komt er op halve kracht overheen
      const b = ACTS.Stand_and_Chat || ACTS.Stand_and_Drink;
      if (b) { d.djBasis = d.mixer.clipAction(b); d.djBasis.play(); d.djBasis.setEffectiveWeight(1); }
    } else if (rol === 'paal') {
      const clip = poleClipFor(M);
      d.cur = d.mixer.clipAction(clip); d.cur.play();
      d.cur.time = Math.random() * clip.duration; d.cur.timeScale = rnd(0.9, 1.1);
      if (o.face === undefined) d.root.rotation.y = rnd(0, TAU);
    }
    return d;
  }
  function beweegFig(R, d, dt) {
    switch (d.rol) {
      case 'paal': { const G = window.clubDansgevoel; d.mixer.update(dt * (G && G.aan && G.paalF > 0 ? G.paalF : 1)); break; }  // tempo mee met de sectie (club/dansgevoel.js)
      case 'zit': pose(d, beatPos, energy, dt); zitHier(R, d, dt); break;
      case 'juich': {
        if (!d.queue || !d.queue.length) {  // juichen en springen om de 8 tellen
          const c = d.cur && d.cur.getClip(), ander = c === ACTS.Cheer_with_Both_Hands_Up ? ACTS.Happy_jump_f : ACTS.Cheer_with_Both_Hands_Up;
          d.queue = [[ander || c, 8]];
        }
        pose(d, beatPos, energy, dt); break;
      }
      case 'dj': if (d.djBasis) { const c = d.djBasis.getClip(); d.djBasis.time = (d.djBasis.time + dt) % c.duration; } pose(d, beatPos, energy, dt); break;
      default: pose(d, beatPos, energy, dt);
    }
  }
  function zitHier(R, d, dt) {  // heupen naar de zitplek trekken (elk figuur en elke zitclip heeft een andere heuphoogte)
    const h = hipsOf(d); if (!h || !d.root.parent) return;
    d.root.updateMatrixWorld(true); h.getWorldPosition(zv); d.root.parent.worldToLocal(zv);
    const k = d.zitKlaar ? Math.min(1, dt * 4) : 1, t = d.zitPlek, ex = (t.x - zv.x) * k, ey = (t.y - zv.y) * k, ez = (t.z - zv.z) * k;
    d.zitKlaar = true;
    d.px = (d.px || 0) + ex; d.pz = (d.pz || 0) + ez; d.yOff += ey;
    d.root.position.x += ex; d.root.position.y += ey; d.root.position.z += ez;
  }

  // --- kamers bouwen, kiezen en slopen ---
  let sindsBoiler = 2;
  function kiesSoort(vorige, voorraad) {  // voorraad: doolhof.volgende (testwens) niet opmaken, die geldt voor de start zelf
    const K = doolhof.kamers, soorten = Object.keys(K);
    if (doolhof.volgende && K[doolhof.volgende] && !voorraad) { const s = doolhof.volgende; doolhof.volgende = null; return s; }
    if (K.boiler && vorige !== 'boiler' && sindsBoiler >= 3) return 'boiler';  // minstens eens per 4 kamers
    let kand = soorten.filter(s => s !== vorige);
    if (!kand.length) kand = soorten;
    const gw = s => Math.max(0, +K[s].gewicht || 0), som = kand.reduce((a, s) => a + gw(s), 0);
    if (som <= 0) return pick(kand);
    let r = Math.random() * som;
    return kand.find(s => (r -= gw(s)) < 0) || kand[0];
  }
  function kamerRoute(kamer, rndK) {  // looppad in de kamer: van (0,-d/2) naar (0,d/2), de eerste en laatste 0,9 m recht door de deur
    const w = kamer.maat.w, dh = kamer.maat.d / 2;
    let r = Array.isArray(kamer.route) && kamer.route.length >= 2 ? kamer.route.map(p => V3(+p.x || 0, +p.z || 0)) : null;
    if (!r) { const zij = rndK() < 0.5 ? -1 : 1, b = Math.max(0, Math.min(w * 0.15, w / 2 - 1.2)); r = [V3(0, -dh), V3(zij * b * 0.7, -dh / 2), V3(zij * b, 0), V3(zij * b * 0.7, dh / 2), V3(0, dh)]; }
    if (r[0].distanceTo(V3(0, -dh)) > 0.05) r.unshift(V3(0, -dh)); else r[0].set(0, 0, -dh);
    if (r[r.length - 1].distanceTo(V3(0, dh)) > 0.05) r.push(V3(0, dh)); else r[r.length - 1].set(0, 0, dh);
    if (r[1].z > -dh + 1.2) r.splice(1, 0, V3(0, -dh + 0.9));
    if (r[r.length - 2].z < dh - 1.2) r.splice(r.length - 1, 0, V3(0, dh - 0.9));
    return afronden(r, 0.7);
  }
  // een kamer bouwen, in stappen (generator): groep + maak (een kamer-module mag zelf ook een generator teruggeven: dan per stuk),
  // gang in, gang uit, looppad. De groep blijft los van de scène (losseGroepen) tot de wissel. inOv = de overgang vóór deze kamer (zelfde
  // gang als achter de vorige kamer). gestopt() = het doolhof of de voorraad is intussen weg: dan slopen. o.zonderGangen: proefkamer.
  let slotTel = 0;
  function* kamerStappen(soort, inOv, gestopt, o) {
    const def = doolhof.kamers[soort]; if (!def) return null;
    o = o || {};
    const sxIn = inOv ? inOv.sx : 1;
    const groep = new THREE.Group(), slot = slotTel++;
    groep.position.set(SLOT_X - (slot % 4) * SLOT_STAP, 0, SLOT_Z);
    groep.visible = false; groep.updateMatrixWorld(true);
    if (!o.zonderGangen) losseGroepen.add(groep);
    const R = { isKamer: true, soort, groep, figs: [], lampen: [], trips: [], modelTel: new Map(), zwaar: zwaar(), sxIn, sxUit: Math.random() < 0.5 ? -1 : 1, t0: 0, tIn: null, actief: false };
    R.ctx = maakCtx(R);
    let kamer = null;
    STAT.nu = 'maak ' + soort;
    try {
      const r = def.maak(R.ctx);
      if (r && typeof r.next === 'function' && !r.maat) {  // stapsgewijs: elke yield van de module = een pauzeplek
        for (;;) {
          const s = r.next();
          if (s.done) { kamer = s.value; break; }
          yield;
          if (gestopt && gestopt()) { sloop(null, R); return null; }
        }
      } else kamer = r;
    } catch (e) { fout('kamer ' + soort + ' bouwen', e); kamer = null; }
    if (!kamer || !kamer.maat || !(kamer.maat.w > 0) || !(kamer.maat.d > 0)) {
      if (kamer) console.error('doolhof: kamer ' + soort + ' gaf geen { maat: { w, d, h } } terug');
      sloop(null, R); return null;
    }
    kamer.soort = soort; R.kamer = kamer;
    if (o.zonderGangen) return R;
    yield RUST;
    if (gestopt && gestopt()) { sloop(null, R); return null; }
    const m = kamer.maat, G = groep.position, dh = m.d / 2;
    R.blijf = kamer.blijf == null ? 12 : Math.max(0, +kamer.blijf || 0);
    if (doolhof.liftTest > 0 && !inOv.lift) { R.blijf = Math.min(R.blijf, 1.5); doolhof.liftTest--; }  // test (doolhof.lift()): snel door naar de lift
    // het level van deze kamer (de lift ervoor bepaalt het; bij aankomst zet de kern het precies, zie liftKlok)
    R.level = inOv.lift ? inOv.L.naar : inOv.level || 0;
    // gangen in de ruimte van de kamer: vóór de ingang (begin dicht) en achter de uitgang (eind dicht); de uitgang krijgt een nieuwe stijl
    // (of een lift: doolhof/lift.js, recht: sas, cabine, sas)
    R.inOv = inOv; R.uitOv = nieuweOvergang(inOv.lift ? inOv.vorigeGang : inOv.stijl, undefined, { na: inOv, level: R.level }); R.sxUit = R.uitOv.sx;
    const LF = doolhof.lift, lenIn = ovLen(inOv), lenUit = ovLen(R.uitOv);
    const inL = inOv.lift ? { x: 0, z: -dh - lenIn, yaw: 0 } : { x: -sxIn * L2, z: -dh - L1 - L3, yaw: 0 }, uitL = { x: 0, z: dh, yaw: 0 };
    STAT.nu = 'gang ' + inOv.stijl;
    R.gangIn = inOv.lift ? yield* LF.bouw(groep, inL, inOv) : yield* gangStappen(groep, inL, inOv, 'begin');
    yield;
    if (gestopt && gestopt()) { sloop(null, R); return null; }
    STAT.nu = 'gang ' + R.uitOv.stijl;
    R.gangUit = R.uitOv.lift ? yield* LF.bouw(groep, uitL, R.uitOv) : yield* gangStappen(groep, uitL, R.uitOv, 'eind');
    yield;
    if (gestopt && gestopt()) { sloop(null, R); return null; }
    R.inFrame = { x: G.x + inL.x, z: G.z + inL.z, yaw: 0 }; R.uitFrame = { x: G.x, z: G.z + dh, yaw: 0 };
    // spoor in wereld-coördinaten: gang (of lift) in, route, gang (of lift) uit
    const route = kamerRoute(kamer, R.ctx.rnd).map(p => p.add(G));
    R.sp = maakSpoor([...ovPunten(R.inFrame, inOv), ...route.slice(1), ...ovPunten(R.uitFrame, R.uitOv).slice(1)]);
    R.ingangBoog = lenIn; R.uitgangBoog = R.sp.len - lenUit; R.tpBoog = R.uitgangBoog + (R.uitOv.lift ? R.uitOv.L.STOP : E_TP);
    R.inTP = inOv.lift ? inOv.L.STOP : E_TP;  // waar de wissel de loper in de ingang neerzet
    let bd = 1e9; R.midBoog = (R.ingangBoog + R.uitgangBoog) / 2;  // wachtplek: het punt van de route het dichtst bij het midden
    R.sp.pts.forEach((p, i) => { const b = R.sp.cum[i]; if (b < R.ingangBoog + 0.5 || b > R.uitgangBoog - 0.5) return; const d = Math.hypot(p.x - G.x, p.z - G.z); if (d < bd) { bd = d; R.midBoog = b; } });
    sindsBoiler = soort === 'boiler' ? 0 : sindsBoiler + 1;
    groep.updateMatrixWorld(true);
    return R;
  }
  function* bouwStappen(soort, inOv, gestopt) {  // lukt een kamer niet, dan de eenvoudige gang-kamer van de kern
    const R = yield* kamerStappen(soort, inOv, gestopt);
    if (R || soort === 'gang-kamer' || (gestopt && gestopt())) return R;
    return yield* kamerStappen('gang-kamer', inOv, gestopt);
  }
  function sloop(z, R) {
    if (R.weg) return; R.weg = true;
    if (R.kamer && R.kamer.opruimen) try { R.kamer.opruimen(); } catch (e) { fout('opruimen van ' + R.soort, e); }
    for (const p of R.figs) terug(p);
    R.figs.length = 0; R.lampen.length = 0; R.trips.length = 0;
    R.groep.visible = false; if (R.groep.parent) R.groep.parent.remove(R.groep);
    losseGroepen.delete(R.groep); if (z) z.eigen.delete(R.groep);
    if (doolhof.actief === R.kamer) doolhof.actief = null;
    const los = R.liftLos; R.liftLos = null;  // lifthelft die tijdens de rit los in de scène hing (liftVerstop)
    if (los) { if (los.parent) los.parent.remove(los); if (z) z.eigen.delete(los); }
    afvoerLater(los ? [R.groep, los] : [R.groep]);
  }

  // opwarmen in stappen, in de toestand waarin de groep straks getekend wordt (stand 'doolhof' of 'zaal2', zie lampenVan):
  // 1. shaders per materiaal (een nieuw programma = rust tot het volgende beeld), 2. texturen één voor één naar de gpu,
  // 3. één kleine render met een vervangend materiaal (alles in beeld, ook wat nog verborgen is): geometrie, instanties en botten naar de gpu.
  // Programma's bestaan na het voorwarmen (club/voorwarm.js) al; dan kost stap 1 alleen het bijhouden per materiaal.
  const warmRT = new THREE.WebGLRenderTarget(32, 32), warmCam = new THREE.PerspectiveCamera(100, 1, 0.5, 400);
  warmCam.up.set(0, 0, -1);
  const upScene = new THREE.Scene();
  const gedecodeerd = new WeakSet();
  function soortObj(o) { return o.isSkinnedMesh ? 1 : o.isInstancedMesh ? (o.instanceColor ? 3 : 2) : o.isPoints ? 4 : o.isLine ? 5 : o.isSprite ? 6 : 0; }
  // vervangend materiaal per soort object (geen overrideMaterial): three r128 wisselt bij instanceColor wel/niet niet van programma, dan
  // las een InstancedMesh zonder kleuren de kleuren van een vorige (TypeError 'isInterleavedBufferAttribute' van null, render afgebroken)
  const upMats = [];
  const upMat = o => { const k = soortObj(o); return upMats[k] || (upMats[k] = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })); };
  // de shaders van de upload-render (vervangend materiaal, één per soort object, zonder lampen) alvast compileren, zonder te wachten
  const nepUp = { isScene: true, fog: null, environment: null, lijst: [], traverseVisible() {}, traverse(f) { for (const o of this.lijst) f(o); } };
  function upCompileren(groepen) {
    const per = new Map();
    for (const g of groepen) g.traverse(o => { if (o.material) { const k = soortObj(o); if (!per.has(k)) per.set(k, o); } });
    for (const o of per.values()) {
      const m = o.material; o.material = upMat(o); nepUp.lijst = [o];
      try { losCompileren(() => renderer.compile(nepUp, camera), [o]); } finally { o.material = m; nepUp.lijst = []; }
    }
  }
  function* opwarmStappen(groepen, stand, gestopt, alleenShaders) {
    const lampen = lampenVan(stand), gedaan = new Map(), een = [null], echt = stand === 'doolhof' && tekortLampen() === 0;
    const objs = []; for (const g of groepen) g.traverse(o => { if (o.material) objs.push(o); });
    for (const o of objs) {
      // hetzelfde materiaal op hetzelfde soort object geeft dezelfde shader: één keer is genoeg
      const ms = [].concat(o.material), k = soortObj(o);
      if (ms.every(m => !m || (gedaan.get(m) || 0) & (1 << k))) continue;
      for (const m of ms) if (m) gedaan.set(m, (gedaan.get(m) || 0) | (1 << k));
      while (losVol()) { yield RUST; if (gestopt && gestopt()) return false; }
      een[0] = o; STAT.nu = 'shader ' + stand;
      const nieuw = compileer(een, lampen, echt);
      yield nieuw && !PAR ? RUST : undefined;  // zonder de extensie wacht een nieuwe shader: dan rust
      if (gestopt && gestopt()) return false;
    }
    upCompileren(groepen);
    if (alleenShaders) return true;  // (proefkamers: club/voorwarm.js wacht aan het eind in één keer op het linken)
    // wachten tot de driver klaar is met linken (kijkt alleen, wacht nergens op); hooguit ~5 s, daarna gewoon verder
    for (let i = 0; i < 300 && PAR && !losKlaar(); i++) { yield RUST; if (gestopt && gestopt()) return false; }
    for (const t of texturenVan(groepen)) {
      const im = t.image;
      if (t.version === 0 || !im || im.complete === false || gpuKlaar(t)) continue;
      // een foto (muurschildering, ~3168x1344) eerst buiten de hoofdlus uitpakken: anders doet texImage2D dat midden in het beeld
      // (~50 ms). In een verborgen tabblad kan decode blijven hangen: na 1,5 s dan toch.
      if (typeof im.decode === 'function' && im.complete !== undefined && !gedecodeerd.has(im)) {
        let klaar = false; const t0 = performance.now();
        im.decode().then(() => { klaar = true; }, () => { klaar = true; });
        while (!klaar && performance.now() - t0 < 1500) { yield RUST; if (gestopt && gestopt()) return false; }
        gedecodeerd.add(im);
      }
      STAT.nu = 'textuur ' + (im.width || 0) + 'x' + (im.height || 0);
      renderer.initTexture(t); STAT.texturen++;
      yield;
      if (gestopt && gestopt()) return false;
    }
    // geometrie naar de gpu: per ~60 objecten één kleine render (op een trage cpu ~10-20 ms per hele kamer)
    const tekenbaar = []; for (const g of groepen) g.traverse(o => { if (o.isMesh || o.isPoints || o.isLine || o.isSprite) tekenbaar.push(o); });
    for (let i = 0; i < tekenbaar.length; i += 60) {
      STAT.nu = 'upload';
      uploadRender(groepen, new Set(tekenbaar.slice(i, i + 60)));
      yield;
      if (gestopt && gestopt()) return false;
    }
    yield RUST;
    return true;
  }
  // alleen: alleen deze objecten tekenen (via een eigen laag: zo blijven hun kinderen gewoon bereikbaar); zonder: alles
  const UPLAAG = 30;
  function uploadRender(groepen, alleen) {
    const ouders = [], zicht = [], laag = [], fc = [], mats = [], rt = renderer.getRenderTarget(), P = renderer.info.programs, n0 = P.length;
    for (const g of groepen) {
      ouders.push([g, g.parent]); upScene.add(g);
      g.traverse(o => {
        if (!o.visible) { zicht.push(o); o.visible = true; }
        if (o.frustumCulled) { fc.push(o); o.frustumCulled = false; }
        if ((!alleen || alleen.has(o)) && !(o.layers.mask & (1 << UPLAAG))) {
          o.layers.enable(UPLAAG); laag.push(o);
          if (o.material) { mats.push(o, o.material); o.material = upMat(o); }
        }
      });
    }
    warmCam.position.set(0, -1000, 0); warmCam.lookAt(0, -2000, 0); warmCam.updateMatrixWorld(); warmCam.layers.set(UPLAAG);
    try { renderer.setRenderTarget(warmRT); renderer.render(upScene, warmCam); }
    catch (e) { fout('opwarmen', e); }
    finally {
      renderer.setRenderTarget(rt);
      for (const o of zicht) o.visible = false;
      for (const o of laag) o.layers.disable(UPLAAG);
      for (let i = 0; i < mats.length; i += 2) mats[i].material = mats[i + 1];
      for (const o of fc) o.frustumCulled = true;
      for (const [g, p] of ouders) { upScene.remove(g); if (p) p.add(g); }
      if (P.length > n0) vastzetten(n0);
    }
  }

  // --- de club tijdens het doolhof: figuren en wat altijd getekend wordt (frustumCulled uit) onzichtbaar, daarna terug ---
  const tekentAltijd = new WeakMap();
  function zwaarObject(o) {
    let v = tekentAltijd.get(o);
    if (v === undefined) {
      let fc = false, lamp = false;
      o.traverse(c => { if (c.frustumCulled === false && (c.isMesh || c.isPoints || c.isLine)) fc = true; if (c.isLight) lamp = true; });
      v = fc && !lamp;  // niets met een lamp erin: het aantal lampen mag niet veranderen
      tekentAltijd.set(o, v);
    }
    return v;
  }
  function verberg(z) {
    const zet = o => {
      if (!o || z.eigen.has(o)) return;
      if (!z.verborgen.has(o)) z.verborgen.set(o, o.visible); else if (o.visible) z.verborgen.set(o, true);
      o.visible = false;
    };
    for (const lijst of [dancers, crowd, walkers, poleDancers, worms]) for (const d of lijst) if (d && d.root && d.root.parent === scene) zet(d.root);
    if (dj && dj.root) zet(dj.root);
    if (slug) zet(slug.root);
    for (const c of scene.children) if (!z.eigen.has(c) && zwaarObject(c)) zet(c);
  }
  function herstel(z) {
    for (const [o, v] of z.verborgen) o.visible = v;
    for (const w of walkers) if (w && w.root) w.root.visible = w.state !== 'gone';
    z.verborgen.clear();
  }
  function bewaarKW(z) {  // geen bol-opname en geen schaduwkaart van een club die niemand ziet
    if (!z.kw || z.kw.stand !== KW.stand) z.kw = { stand: KW.stand, bol: KW.bol, schaduw: KW.schaduw };
    KW.bol = 0; KW.schaduw = 0;
  }
  function zaal2Licht(z, k) {  // lampen van zaal 2 doven terwijl de loper de ∞-gang in loopt (anders springt zijn belichting bij de wissel)
    for (const o of z.z2lampen) {
      let r = z.z2licht.get(o);
      if (!r) { r = { basis: o.intensity, schreef: NaN }; z.z2licht.set(o, r); }
      else if (o.intensity !== r.schreef) r.basis = o.intensity;  // een hook zette deze frame een nieuwe waarde
      o.intensity = r.schreef = r.basis * k;
    }
  }
  function zaal2LichtTerug(z) {
    for (const [o, r] of z.z2licht) if (o.intensity === r.schreef) o.intensity = r.basis;
    z.z2licht.clear();
  }

  // vaste lampen voor de kamers: elk beeld krijgen ze plek, kleur en sterkte van de lamp-handvatten van de actieve kamer.
  // Geleend van de club: vaste puntlampen van zaal 1 (direct in de scène, zonder schaduw, al een tijd onveranderd, bv. de lampen bij de
  // podia) gaan tijdens het doolhof naar de kamer en daarna terug. Dan telt three evenveel lampen als in zaal 1: geen eigen lampstand voor
  // de kamers en bij de terugkeer (de drop) geen golf van shader-wissels in heel zaal 1 (met 2 extra lampen: 5-10 beelden van 20-45 ms).
  // Zijn er te weinig, dan extra lampen (poolLicht) zoals vroeger.
  const poolLicht = [0, 1].map(() => new THREE.PointLight(0xffffff, 0, 10, 1.5));
  let vasteLampen = [];
  const leenProef = new Map();  // lamp -> stand bij de vorige blik
  const lampStand = l => [l.position.x, l.position.y, l.position.z, l.intensity, l.color.getHex(), l.distance, l.decay].join(',');
  function kijkLampen() {  // om de ~2 s (buiten het doolhof): welke clublampen veranderden sinds de vorige blik niet
    const uit = [];
    for (const c of scene.children) {
      if (!c.isPointLight || c.castShadow || !c.visible || poolLicht.includes(c) || c === strobeLight || (typeof slugLight !== 'undefined' && c === slugLight) || !(c.intensity > 0)) continue;
      const s = lampStand(c), was = leenProef.get(c);
      leenProef.set(c, s);
      if (was === s) uit.push(c);
    }
    vasteLampen = uit;
  }
  let lampTel = 0;
  clubHooks.push(() => { if (!actief && lampTel++ % 120 === 0) kijkLampen(); });
  const tekortLampen = () => Math.max(0, MAXLAMP[zwaar()] - vasteLampen.length);
  function lampenAan(z) {  // bij de eerste kamer (zaal 2 is dan uit beeld): clublampen lenen, zo nodig aangevuld met eigen lampen
    z.lampen = []; z.geleend = [];
    const vrij = vasteLampen.filter(l => l.parent === scene && l.visible && !l.castShadow);
    for (let i = 0; i < z.nLamp; i++) {
      const l = vrij[i];
      if (l) { z.geleend.push({ l, pos: l.position.clone(), kleur: l.color.clone(), int: l.intensity, dist: l.distance, decay: l.decay }); l.intensity = 0; z.lampen.push(l); }
      else { const p = poolLicht[i]; p.intensity = 0; if (p.parent !== scene) scene.add(p); z.eigen.add(p); z.lampen.push(p); }
    }
  }
  function lampenTerug(z) {
    for (const g of z.geleend || []) { const l = g.l; l.position.copy(g.pos); l.color.copy(g.kleur); l.intensity = g.int; l.distance = g.dist; l.decay = g.decay; l.updateMatrix(); }
    z.geleend = []; z.lampen = [];
    for (const l of poolLicht) if (l.parent) l.parent.remove(l);
  }
  function lampenBeeld(z) {
    if (!z.lampen) return;
    const R = z.own && z.own.isKamer ? z.own : null, lmax = Math.min(z.nLamp, MAXLAMP[zwaar()]);
    const X = z.lift;
    if (X && !X.loopt) {  // in de lift: de lampen hangen in de cabine (kleur van de ledshow), in 0,8 s aan
      const half = liftHelft(X), k = Math.min(1, Math.max(0, (z.lt - X.t0) / 0.8));
      for (let i = 0; i < z.lampen.length; i++) {
        const l = z.lampen[i];
        if (i >= lmax || !half) { l.intensity = 0; continue; }
        try { doolhof.lift.licht(X.L, half, i, l, k); } catch (e) { l.intensity = 0; }
      }
      return;
    }
    // vervagen: uit in het donkere stuk van de gang (rond de wissel), aan in de kamer
    const f = R ? glad(z.dist, (R.inTP != null ? R.inTP : E_TP) + 0.3, R.ingangBoog + 0.6) * (1 - glad(z.dist, R.uitgangBoog - 0.4, R.tpBoog - 0.3)) : 0;
    for (let i = 0; i < z.lampen.length; i++) {
      const l = z.lampen[i], px = R && i < lmax ? R.lampen[i] : null;
      if (!px) { l.intensity = 0; continue; }
      px.visible = false;
      l.color.copy(px.color); l.distance = px.distance; l.decay = px.decay; l.intensity = Math.max(0, px.intensity) * f;
      if (px.parent) px.getWorldPosition(l.position); else l.position.copy(px.position).applyMatrix4(R.groep.matrixWorld);
      l.updateMatrix();  // (club/optimaliseer.js zet matrixAutoUpdate uit op wat lang stilstaat)
    }
  }

  // --- het shot ---
  const vasteCam = () => { camPos.set(Z2.x, 2.2, Z2.z - 6.5); camLook.set(Z2.x, 1.4, Z2.z + 2); camFov = 60; };
  function zaal2Eigenaar() {  // looppad in zaal 2: vanuit het midden (tussen de vier dansers door) naar de ∞-deur en de gang in
    const D = V3(ZD.x, ZD.z), W0 = V3(Z2.x, Z2.z), dir = new THREE.Vector3().subVectors(D, W0).normalize();
    const C0 = W0.clone().addScaledVector(dir, -2.7), Q = V3(ZD.x - 1.4, ZD.z);
    const sp = maakSpoor([...afronden([C0, W0, Q, D], 0.6), ...sbPunten(ZAAL2_UIT, ZAAL2_SX).slice(1)]), uitgangBoog = sp.len - SB_LEN;
    return { isKamer: false, sp, uitgangBoog, tpBoog: uitgangBoog + E_TP, uitFrame: ZAAL2_UIT, sxUit: ZAAL2_SX, uitOv: zaal2Ov, gangUit: zaal2Groep, startBoog: 2.7 };
  }
  let actief = null;  // toestand van het lopende doolhof-shot
  function einde(s) { s.beats = Math.max(0.01, beatPos - s.b0); if (s.z) s.z.klaar = true; }

  // --- de voorraad: kamer 1 + ∞-gang + loper staan al klaar (gebouwd en opgewarmd op de achtergrond, los van de scène) vóór de showregie
  // het doolhof start (in de break). Zo kost de start zelf alleen nog het omhangen. Klaarmaken begint als het voorwarmen klaar is en
  // ~5 s na elk doolhof; de ∞-gang wordt pas gewisseld als zaal 2 niet in beeld is. Andere kwaliteitsstand = opnieuw.
  let voorraad = null, naShot = -1e9;
  const T_KERN = performance.now();
  function magVoorbereiden() {
    if (actief || voorraad) return false;
    if (performance.now() - naShot < 5000) return false;
    if (typeof LAAD !== 'undefined' && LAAD.klaar < LAAD.totaal) return false;
    if (!ACTS.Casual_Walk || !allModels().length || !Object.keys(doolhof.gangStijlen).length || !Object.keys(doolhof.kamers).length) return false;
    const VW = window.clubVoorwarm;  // eerst het voorwarmen (dat compileert de shaders van alle kamers en gangen); hooguit 2 min wachten
    if (VW && VW.klaar && !VW.klaar() && performance.now() - T_KERN < 120000) return false;
    return true;
  }
  clubHooks.push(() => {
    if (voorraad && !actief && (voorraad.stand !== KW.stand || voorraad.zwaar !== zwaar())) voorraadWeg();
    if (magVoorbereiden()) { voorraad = { stand: KW.stand, zwaar: zwaar(), klaar: false, weg: false, t0: performance.now() }; klus('voorraad', voorbereiden(voorraad)); }
  });
  function voorraadWeg() {
    const V = voorraad; if (!V) return;
    voorraad = null; V.weg = true;
    if (V.R && !V.R.weg) sloop(null, V.R);
    if (V.loper) { terug(V.loper); V.loper = null; }
    if (V.houder) { losseGroepen.delete(V.houder); if (V.gang && V.gang.parent === V.houder) afvoerLater([V.houder]); }
  }
  function* voorbereiden(V) {
    const weg = () => V.weg || voorraad !== V;
    if (weg()) return;
    // de ∞-gang: is de huidige nog niet gebruikt (alleen zijn eigen helft staat), dan komt kamer 1 daarachter; anders een nieuwe stijl
    if (zaal2Ov && zaal2Ov.stijl && zaal2Ov.n === 1 && !zaal2Ov.kapot) V.ov = zaal2Ov;
    else {
      V.ov = nieuweOvergang(zaal2Ov && zaal2Ov.stijl, ZAAL2_SX);
      V.houder = new THREE.Group(); losseGroepen.add(V.houder);
      V.gang = yield* gangStappen(V.houder, ZAAL2_UIT, V.ov, 'eind');
      yield RUST;
      if (weg()) return;
      if (!(yield* opwarmStappen([V.houder], 'zaal2', weg))) return;  // in zaal 2 te zien: daar opwarmen
    }
    // kamer 1, los van de scène
    const R = V.R = yield* bouwStappen(kiesSoort(null, true), V.ov, weg);
    if (!R || weg()) { if (R && !R.weg) sloop(null, R); if (voorraad === V) voorraadWeg(); return; }
    if (!(yield* opwarmStappen([R.groep], 'doolhof', weg))) return;
    // de loper: in beide standen (de wandeling door zaal 2 en de kamers)
    const p = V.loper = lenen(null, null, false);
    if (p) {
      const huis = new THREE.Group(); huis.add(p.d.root);
      for (const st of ['zaal2', 'doolhof']) if (!(yield* opwarmStappen([huis], st, weg))) { huis.remove(p.d.root); return; }
      huis.remove(p.d.root);
      herkleur(p, p.M.type === 'pop' && !/man-1/.test(p.M.file)); maat(p, false);  // na het compileren: dan bestaan de uniforms
    }
    // de ∞-gang omwisselen als de camera in zaal 1 is (vanuit zaal 1 is de ∞-deur nooit te zien; zone2.visible staat ook vanaf de
    // ingang van zaal 1 aan)
    const inZaal1 = () => Math.abs(camera.position.x) < ROOM + 0.5 && Math.abs(camera.position.z) < ROOM + 0.5;
    while (V.houder && (!inZaal1() || actief)) { yield RUST; if (weg()) return; }
    if (V.houder) {
      const oud = zaal2Groep;
      zone2.add(V.gang); losseGroepen.delete(V.houder); V.houder = null;
      zaal2Ov = V.ov; zaal2Groep = V.gang;
      if (oud) { zone2.remove(oud); afvoerLater([oud]); }
    }
    V.klaar = true; V.ms = Math.round(performance.now() - V.t0); STAT.voorraad++;
  }

  function maakShot() {
    const direct = !!doolhof.direct; doolhof.direct = false;  // showregie in de break: meteen de gang vóór kamer 1 in (de wandeling door zaal 2 duurt ~15 s)
    doolhof.level = 0;  // de ∞-deur van zaal 2 ligt op level 0
    const z = { lt: 0, eigen: new Set(), verborgen: new Map(), z2licht: new Map(), z2lampen: [], fase: 'zaal2', dist: 0, v: 1.1,
      dans: false, modus: 'volg', snap: null, rond: null, doel: 3 + Math.floor(Math.random() * 3), kw: null, nLamp: 0, naFlits: false };
    // klaarstaande voorraad gebruiken (niet als een test om een andere soort vraagt of de stand intussen anders is)
    let V = voorraad;
    if (!(V && V.klaar && !V.weg && V.stand === KW.stand && V.zwaar === zwaar() && V.R && (!doolhof.volgende || doolhof.volgende === V.R.soort))) V = null;
    try {
      if (V) { voorraad = null; STAT.gebruikt++; if (doolhof.volgende === V.R.soort) doolhof.volgende = null; z.voorraad = true; }
      else { voorraadWeg(); zaal2Gang(); STAT.zonder++; }  // nieuwe stijl voor de ∞-gang (de knip naar dit shot verbergt de wissel)
      const p = V && V.loper ? V.loper : ACTS.Casual_Walk ? lenen(null, null, false) : null;
      if (!p) { z.mislukt = true; if (V) { V.weg = true; if (V.R) sloop(null, V.R); } return z; }
      z.loper = p;
      const w = p.d;
      if (!(V && V.loper)) { herkleur(p, p.M.type === 'pop' && !/man-1/.test(p.M.file)); maat(p, false); }
      w.rol = 'loper';
      scene.add(w.root); z.eigen.add(w.root);
      z.own = zaal2Eigenaar(); z.dist = z.own.startBoog;
      opSpoor(z.own.sp, z.dist, w.root.position); opSpoor(z.own.sp, z.dist + 0.5, tA);
      w.root.rotation.y = Math.atan2(tA.x - w.root.position.x, tA.z - w.root.position.z);
      setClip(w, ACTS.Casual_Walk, 0.1);
      if (Math.random() < 0.45) giveDrink(w, Math.random() < 0.5 ? 'bier' : 'glas');  // geen sigaret: de rook zou bij de wissel achterblijven
      // de kamerlampen (geleend van zaal 1) pas bij de eerste wissel, als zaal 2 uit beeld is. Vroeger kwamen hier 2 extra lampen bij: met
      // zaal 2 in beeld (6 + 2) kreeg alles in beeld een eigen shader, ook zaal 1 in de spiegelpas (doolhof via zaal 2: 4 beelden van 57-700 ms)
      z.nLamp = MAXLAMP[zwaar()];
      zone2.traverse(o => { if (o.isLight) z.z2lampen.push(o); });
      verberg(z); bewaarKW(z);
      actief = z;
      z.bekend = new WeakSet(renderer.info.programs); z.nProg = renderer.info.programs.length;
      const R = V ? V.R : null;
      if (!R) {
        // geen voorraad (vlak na het laden, een test, net een andere kwaliteitsstand): kamer 1 op de achtergrond bouwen terwijl de loper
        // loopt (vroeger in één keer: 40-500 ms). Een directe start begint dan bij de ∞-deur (~6 m tot de wissel) i.p.v. vóór kamer 1.
        if (direct) {
          z.dist = Math.max(z.own.startBoog, z.own.uitgangBoog - 0.6);
          opSpoor(z.own.sp, z.dist, w.root.position); opSpoor(z.own.sp, z.dist + 0.5, tA);
          w.root.rotation.y = Math.atan2(tA.x - w.root.position.x, tA.z - w.root.position.z);
        }
        planVolgende(z);
        return z;
      }
      R.nr = 1; z.next = R; z.laatste = R.soort; R.klaar = true;
      if (direct) {  // de knip verbergt de sprong: de loper staat ~3 m voor de deur van kamer 1, de camera kijkt door de gang naar binnen
        const A = z.own;
        z.dist = A.tpBoog; opSpoor(A.sp, z.dist, w.root.position);
        wissel(z, 0, true);
        z.dist = Math.max(z.dist, R.ingangBoog - 3.2);
        opSpoor(R.sp, z.dist, w.root.position); opSpoor(R.sp, z.dist + 0.5, tA);
        w.root.rotation.y = Math.atan2(tA.x - w.root.position.x, tA.z - w.root.position.z);
        w.root.updateMatrixWorld(true);  // drankje meteen in de hand (anders één beeld op de oude plek)
        for (const h of held) if (h.d === w) { h.g.position.copy(h.off); h.hand.localToWorld(h.g.position); h.g.rotation.set(0, w.root.rotation.y, 0); }
        zone2.visible = false;
      }
    } catch (e) { fout('start', e); z.mislukt = true; }
    return z;
  }
  function opruimenShot(z) {
    if (z.weg) return; z.weg = true;
    if (actief === z) actief = null;
    naShot = performance.now();
    for (const R of [z.own, z.next]) if (R && R.isKamer) sloop(z, R);  // weggooien gebeurt op de achtergrond (terug naar zaal 1 = de drop)
    if (z.loper) { terug(z.loper); z.loper = null; }
    lampenTerug(z);
    herstel(z);
    // het hoofdscript zette sporen (feedback) en bloom deze frame al op 'zaal 2/verder', want de camera stond vorige frame nog in het
    // doolhof: één beeld vol sporen in zaal 1 (en de eerste keer na het laden ~120 ms compileren). Terug naar de stand van zaal 1.
    if (camera.position.z > TUN_END - 0.5) {
      if (feedback && !(KW.stand === 'laag' || KW.stand === 'minimaal')) {
        const u = feedback.material.uniforms, nu = performance.now() / 1000;
        feedback.enabled = S.fb > 0.01 || S.mirror;
        u.amount.value = S.fb; u.zoom.value = 1.02 + 0.012 * Math.sin(nu * 0.21); u.rotA.value = 0.006 * Math.sin(nu * 0.13);
      }
      if (bloom && bloom.enabled) bloom.strength /= 0.55;
    }
    lichtTerug();
    if (z.kw) { KW.bol = z.kw.bol; KW.schaduw = z.kw.schaduw; renderer.shadowMap.needsUpdate = true; }
    zaal2LichtTerug(z);
    doolhof.actief = null;
    if (!z.mislukt && typeof lastTrip !== 'undefined') lastTrip = performance.now() / 1000;  // het doolhof ging ook door zaal 2: de verplichte trip pas over 2 min weer
  }
  function* volgendeStappen(z) {  // de volgende kamer (of kamer 1 zonder voorraad) op de achtergrond bouwen en opwarmen, los van de scène
    const weg = () => z.weg;
    if (z.weg || z.next || !z.own) { z.bouwGepland = false; return; }
    const own = z.own, R = yield* bouwStappen(kiesSoort(own.isKamer ? z.laatste : null), own.uitOv, weg);
    if (!R) { z.bouwGepland = false; return; }
    if (z.weg || z.own !== own) { sloop(null, R); z.bouwGepland = false; return; }
    R.nr = (own.nr || 0) + 1; z.next = R; z.laatste = R.soort;
    if ((yield* opwarmStappen([R.groep], 'doolhof', () => z.weg || R.weg)) && !R.weg) R.klaar = true;
    z.bouwGepland = false;
  }
  function planVolgende(z) { if (!z.bouwGepland && !z.next) { z.bouwGepland = true; klus('volgende kamer', volgendeStappen(z), true); } }
  function wissel(z, t, later) {  // loper en camera van de gang van A naar dezelfde plek in de gang van B (later: volgende kamer pas plannen als z.doel vaststaat)
    const A = z.own, B = z.next, w = z.loper.d;
    const M = frameMat(B.inFrame).multiply(frameMat(A.uitFrame).invert()), dyaw = B.inFrame.yaw - A.uitFrame.yaw;
    w.root.position.applyMatrix4(M); w.root.rotation.y += dyaw; w.home.applyMatrix4(M);
    for (const h of held) if (h.d === w) { h.g.position.applyMatrix4(M); h.g.rotation.y += dyaw; }  // drankje stond al op de oude plek
    for (const v of [camPos, camLook]) v.applyMatrix4(M);
    if (z.snap) { z.snap.p.applyMatrix4(M); z.snap.l.applyMatrix4(M); }
    z.dist -= A.uitgangBoog;
    if (A.isKamer) sloop(z, A);
    else { z.fase = 'doolhof'; zaal2LichtTerug(z); lampenAan(z); }
    z.own = B; z.next = null; z.wacht = 0;
    // level: door een S-gang blijft het gelijk (de lift zet het bij aankomst zelf, zie liftKlok); een lift achter B vertrekt van dat level
    if (!(B.inOv && B.inOv.lift)) { B.level = A.isKamer ? A.level || 0 : 0; doolhof.level = B.level; if (B.uitOv && B.uitOv.lift && doolhof.lift) doolhof.lift.zetVan(B.uitOv.L, B.level); }
    if (B.groep.parent !== scene) scene.add(B.groep);
    losseGroepen.delete(B.groep); z.eigen.add(B.groep);
    B.t0 = t; B.actief = true; B.groep.visible = true; doolhof.actief = B.kamer;
    for (const p of B.figs) p.d.root.visible = true;
    if (later) z.planNa = true;
    else if (S.cam === 'doolhof' || B.nr < z.doel) planVolgende(z);
  }
  // hoe lang de loper op de wachtplek blijft (x kamer.blijf): sinds 17-10 ~1,5x zo lang in de kamers (Sierk: 'net iets te snel'; gemeten
  // ~35 s per kamer, 7,8 s per gang). De camera kijkt intussen rond (kamer.cam) of draait een rondje om hem heen; in de opbouw wacht hij op
  // de drop en op de drop blijft hij staan tot die uitklinkt (zie loperBeeld). Langzamer lopen in de kamer (LOOP_KAMER) doet de rest.
  const BLIJF_X = { groove: 2.0, drop: 2.0, opbouw: 1.8, break: 1.45 }, LOOP_KAMER = 0.95, LOOP_GANG = 1.3;
  function wachtLoper(z) {  // stilstaan waar hij is; de loopclip vloeit eruit
    const w = z.loper.d;
    if (w.prev) { w.prev.stop(); w.prev = null; }
    w.loopA = w.cur; w.loopW = 1; w.cur = null;
    w.home.copy(w.root.position); w.face = w.root.rotation.y; w.faceT = undefined; w.px = w.pz = 0; w.nextChange = 0; w.acts = null; w.queue = null;
  }
  function startDans(z, t) {  // stilstaan op de wachtplek en meedansen
    const x = BLIJF_X[show.stand] || 2;
    z.dans = true; z.dansTot = t + z.own.blijf * x; z.dansMax = z.dansTot + 20; z.own.blijfKlaar = true;
    wachtLoper(z);
  }
  function stopDans(z) {
    const w = z.loper.d;
    z.dans = false;
    if (w.loopA) { w.loopA.stop(); w.loopA = null; }
    setClip(w, ACTS.Casual_Walk, 0.6);
  }
  function loperBeeld(s, z, t, dt) {
    const w = z.loper.d;
    if (z.lift && !z.lift.loopt) { liftLoper(s, z, t, dt); return; }
    if (z.dans) {
      if (w.loopA) { w.loopW -= dt * 1.6; if (w.loopW <= 0) { w.loopA.stop(); w.loopA = null; } else w.loopA.setEffectiveWeight(w.loopW); }
      pose(w, beatPos, Math.max(energy, 0.1), dt);
      // de drop knalt in de kamer: in de opbouw wacht hij erop, op de drop blijft hij staan tot die uitklinkt (hooguit 20 s extra)
      if (z.own.isKamer && z.dansMax && t < z.dansMax) {
        if (show.stand === 'opbouw' && z.dansTot < t + 1.5) z.dansTot = Math.min(z.dansMax, t + 1.5);
        else if (show.stand === 'drop' && show.drop > 0.3 && z.dansTot < t + 3) z.dansTot = Math.min(z.dansMax, t + 3);
      }
      if (t >= z.dansTot) stopDans(z);
      return;
    }
    const own = z.own, inKamer = own.isKamer && z.dist > own.ingangBoog && z.dist < own.uitgangBoog;
    const vWil = !own.isKamer && z.dist < own.uitgangBoog ? 1.1 : inKamer ? LOOP_KAMER : LOOP_GANG;
    z.v += (vWil - z.v) * Math.min(1, dt * 1.5);
    z.dist += z.v * dt;
    // de lift achter deze kamer: niet tegen een deur oplopen die nog dicht is
    if (own.isKamer && own.uitOv && own.uitOv.lift && !z.lift) {
      const L = own.uitOv.L, voorDeur = own.uitgangBoog + L.C0 - 0.6;
      if (z.dist > voorDeur && L.deurA < 0.85) { z.dist = voorDeur; z.v = Math.min(z.v, 0.3); }
    }
    if (z.lift && z.lift.loopt && z.dist > own.ingangBoog + 0.3) z.lift = null;  // uitgestapt en de kamer in: de rit is klaar
    if (own.isKamer && own.tIn == null && z.dist >= own.ingangBoog) own.tIn = t;  // de loper is binnen: de klok van kamer.cam begint
    let stop = false;
    if (own.isKamer && !own.blijfKlaar && own.blijf > 0 && z.dist >= own.midBoog) { z.dist = own.midBoog; stop = true; }
    else if (z.dist >= own.tpBoog) {
      const eindeloos = S.cam === 'doolhof';
      if (own.isKamer && own.uitOv && own.uitOv.lift && !z.lift) { z.dist = own.tpBoog; liftStart(s, z, t); }  // in de cabine: de rit begint
      else if (own.isKamer && own.nr >= z.doel && !eindeloos && !z.next) { einde(s); z.dist = own.tpBoog; }  // laatste kamer: de loper verdwijnt in het donker
      else if (z.next && z.next.klaar) wissel(z, t);
      else { z.dist = own.tpBoog; planVolgende(z); if ((z.wacht = (z.wacht || 0) + dt) > 6) einde(s); }
    }
    if (z.lift && !z.lift.loopt) return;
    const o2 = z.own;
    opSpoor(o2.sp, z.dist, w.root.position); opSpoor(o2.sp, z.dist + 0.35, tA);
    const dx = tA.x - w.root.position.x, dz = tA.z - w.root.position.z;
    if (dx * dx + dz * dz > 1e-6) { let dr = Math.atan2(dx, dz) - w.root.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); w.root.rotation.y += dr * Math.min(1, dt * 6); }
    if (stop) { startDans(z, t); return; }
    if (w.cur && w.cur.getClip() === ACTS.Casual_Walk) w.cur.timeScale = z.v / LOOP;
    blend(w, dt);
  }
  // --- de lift (doolhof/lift.js) als overgang: instappen, rit met de wissel bij dichte deuren, uitstappen ---
  const liftHelft = X => (X.gewisseld ? X.B && X.B.gangIn : X.A.gangUit);
  function liftStart(s, z, t) {  // de loper staat in de cabine: stilstaan, camera mee naar binnen, deuren dicht zodra de camera binnen is
    const own = z.own, ov = own.uitOv;
    z.lift = { L: ov.L, ov, A: own, B: null, t0: t, gewisseld: false, loopt: false, wacht: 0, aangekomen: false, laatste: own.nr >= z.doel && S.cam !== 'doolhof' };
    z.dans = false;
    wachtLoper(z);
    try { doolhof.lift.instap(ov.L, camPos, camLook, own.gangUit); } catch (e) { fout('lift instap', e); }
    if (!z.next && !z.lift.laatste) planVolgende(z);
  }
  function liftLoper(s, z, t, dt) {
    const X = z.lift, L = X.L, w = z.loper.d;
    if (w.loopA) { w.loopW -= dt * 1.6; if (w.loopW <= 0) { w.loopA.stop(); w.loopA = null; } else w.loopA.setEffectiveWeight(w.loopW); }
    pose(w, beatPos, Math.max(energy * 0.6, 0.1), dt);  // zacht meedansen in de cabine
    // de wissel: deuren dicht, de rit is begonnen en de volgende kamer staat klaar; de lift van B is gelijk, B blijft verborgen tot de deuren opengaan
    if (!X.gewisseld && !X.laatste) {
      if (!z.next) planVolgende(z);
      if (doolhof.lift.magWissel(L) && z.next && z.next.klaar) {
        const B = z.next;
        wissel(z, t);
        X.gewisseld = true; X.B = B;
        liftVerstop(z, B, B.gangIn);
      } else if (L.verlengd > 0 && (X.wacht += dt) > 10) { einde(s); return; }  // de volgende kamer komt niet: terug naar de club
    }
    // laatste kamer van het rondje: de lift neemt je mee terug, maar pas na een flink stuk rit (was 1,6 s: dan zag je de lift amper rijden)
    if (X.laatste && L.fase === 'rit' && L.tFase > 9) { einde(s); return; }
    // uitstappen zodra de voordeuren half open zijn
    if (X.gewisseld && (L.fase === 'opent' || L.fase === 'uit') && L.deurV > 0.55) {
      X.loopt = true;
      if (w.loopA) { w.loopA.stop(); w.loopA = null; }
      setClip(w, ACTS.Casual_Walk, 0.6); z.v = 0.3;
    }
  }
  function liftVerstop(z, R, half) {  // de kamer onzichtbaar tijdens de rit (deuren dicht); de lifthelft hangt zolang los in de scène
    if (!R || !half || R.liftLos || R.weg) return;
    scene.attach(half); z.eigen.add(half); R.liftLos = half; R.groep.visible = false;
  }
  function liftTerug(z, R) {
    const half = R && R.liftLos; if (!half || R.weg) return;
    R.groep.attach(half); z.eigen.delete(half); R.liftLos = null; R.groep.visible = true;
  }
  function liftKlok(z, t, dt) {  // elk beeld: de liften van deze kamer (achter de uitgang en vóór de ingang) een stap verder
    const own = z.own, LF = doolhof.lift;
    if (!LF || !own || !own.isKamer) return;
    if (own.uitOv && own.uitOv.lift) try { LF.stap(own.uitOv.L, dt, { kant: 'A', d: z.dist - own.uitgangBoog, wissel: false }); } catch (e) { fout('lift', e); }
    if (own.inOv && own.inOv.lift) try { LF.stap(own.inOv.L, dt, { kant: 'B', d: z.dist, wissel: true }); } catch (e) { fout('lift', e); }
    const X = z.lift;
    if (X) {
      const L = X.L;
      if (!X.gewisseld && L.deurA <= 0 && (L.fase === 'start' || L.fase === 'rit')) liftVerstop(z, X.A, X.A.gangUit);
      if (X.gewisseld && X.B && X.B.liftLos && (L.fase === 'opent' || L.fase === 'uit' || L.fase === 'klaar')) liftTerug(z, X.B);
      if (X.gewisseld && !X.aangekomen && L.fase !== 'rit') {  // aangekomen: het level ligt nu vast (de rit kan langer zijn geweest)
        X.aangekomen = true; X.B.level = L.level;
        if (X.B.uitOv && X.B.uitOv.lift) LF.zetVan(X.B.uitOv.L, L.level);
      }
      doolhof.level = L.level;
    } else if (own.level != null) doolhof.level = own.level;
  }
  // --- meer camerahoeken in kamers met één eigen camerabaan (17-10 avond, Sierk: "niet zo veel verschillende camera angles"): om en om
  // de eigen baan van de kamer en een kern-shot, wisselen op de eerste tel van een frase (8 tellen, drop 4) na minstens 4,5-6 s. De
  // kern-shots rekenen in kamer-coördinaten binnen de maat (marge 0,8 m): hoge hoek, rit langs de zijwand, vogel (hoog plafond), laag op
  // de loper, tele uit de verste hoek, vanaf de ingang. Stijlkamers, effectkamers en de boiler hebben een eigen regisseur: niet hier.
  const EEN_BAAN = new Set(['paalkamer', 'slakkenhol', 'spiegeldisco', 'kaleidoscoop', 'laserkooi', 'rokerslounge', 'graffitigang', 'barkamer', 'omgekeerd', 'gang-kamer']);
  const ksKlem = (x, a, b) => Math.min(b, Math.max(a, x)), ksGlad = u => glad(u, 0, 1);
  const KS = {
    hoek: (M, r) => {
      const sx = r() < 0.5 ? -1 : 1, sz = r() < 0.5 ? -1 : 1, y = Math.min(M.h - 0.6, 3.3), x0 = sx * (M.w / 2 - 1.1), z0 = sz * (M.d / 2 - 1.2);
      return (u, lp, o) => { const k = ksGlad(Math.min(1, u / 12)); o.p.set(x0 * (1 - 0.15 * k), y, z0 * (1 - 0.15 * k)); o.l.set(lp.x * 0.5, 1.2, lp.z * 0.5); o.fov = 64; };
    },
    zij: (M, r) => {
      const sx = r() < 0.5 ? -1 : 1, dir = r() < 0.5 ? -1 : 1, y = Math.min(M.h - 0.7, 2.5);
      return (u, lp, o) => { const z = dir * (-M.d / 4 + (M.d / 2) * ksGlad(Math.min(1, u / 14))); o.p.set(sx * (M.w / 2 - 1.1), y, z); o.l.set(-sx * M.w / 2, 1.6, z + dir * 1.5); o.fov = 62; };
    },
    vogel: (M, r) => {
      if (M.h < 3.6) return null;
      const a0 = r() * Math.PI * 2, dir = r() < 0.5 ? -1 : 1;
      return (u, lp, o) => { const a = a0 + dir * 0.06 * u; o.p.set(lp.x * 0.6, M.h - 0.45, lp.z * 0.6); o.l.set(o.p.x + Math.cos(a) * 0.4, 0, o.p.z + Math.sin(a) * 0.4); o.fov = 72; };
    },
    laag: (M, r) => {
      const zij = r() < 0.5 ? -1 : 1;
      return (u, lp, o) => {
        const a = Math.atan2(-lp.x, -lp.z || 1e-3) + zij * (0.35 + 0.25 * Math.sin(u * 0.2));
        o.p.set(lp.x + Math.sin(a) * 1.5, 0.45, lp.z + Math.cos(a) * 1.5); o.l.set(lp.x, 1.35, lp.z); o.fov = 64;
      };
    },
    tele: (M, r) => {
      const ph = r() * 6;
      return (u, lp, o) => { o.p.set((lp.x > 0 ? -1 : 1) * (M.w / 2 - 1), 2.0, (lp.z > 0 ? -1 : 1) * (M.d / 2 - 1)); o.l.set(lp.x + 0.3 * Math.sin(u * 0.2 + ph), 1.3, lp.z); o.fov = 28; };
    },
    ingang: (M) => (u, lp, o) => { const k = ksGlad(Math.min(1, u / 12)); o.p.set(0.4, Math.min(M.h - 0.5, 2.4), -M.d / 2 + 0.7 + k); o.l.set(0, 1.2, M.d / 4); o.fov = 68; },
  };
  const KS_P = new THREE.Vector3(), KS_O = { p: new THREE.Vector3(), l: new THREE.Vector3(), fov: 60 }, KS_U = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 60 };
  function kernShot(own, t, w) {
    const m = own.kamer && own.kamer.maat;
    if (!EEN_BAAN.has(own.soort) || !m || !(m.w >= 4 && m.d >= 4) || !w || !w.root) return null;
    const M = { w: m.w, d: m.d, h: m.h || 3.3 }, b = typeof beatPos === 'number' ? beatPos : 0, fr = Math.floor(b / (show.stand === 'drop' ? 4 : 8));
    let k = own.kr;
    if (!k) k = own.kr = { eigen: true, t0: t, fr, f: null, lijst: [] };
    if (fr !== k.fr) {
      k.fr = fr;
      if (t - k.t0 > (k.eigen ? 6 : 4.5)) {
        k.t0 = t; k.eigen = !k.eigen; k.f = null;
        if (!k.eigen) {
          if (!k.lijst.length) { k.lijst = Object.keys(KS); for (let i = k.lijst.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const x = k.lijst[i]; k.lijst[i] = k.lijst[j]; k.lijst[j] = x; } }
          while (!k.f && k.lijst.length) k.f = KS[k.lijst.shift()](M, Math.random);
          if (!k.f) k.eigen = true;
        }
      }
    }
    if (k.eigen || !k.f) return null;
    KS_P.copy(w.root.position); own.groep.worldToLocal(KS_P);
    k.f(t - k.t0, KS_P, KS_O);
    KS_O.p.x = ksKlem(KS_O.p.x, -M.w / 2 + 0.8, M.w / 2 - 0.8); KS_O.p.z = ksKlem(KS_O.p.z, -M.d / 2 + 0.8, M.d / 2 - 0.8); KS_O.p.y = ksKlem(KS_O.p.y, 0.35, M.h - 0.35);
    KS_U.pos.copy(KS_O.p); own.groep.localToWorld(KS_U.pos); KS_U.look.copy(KS_O.l); own.groep.localToWorld(KS_U.look); KS_U.fov = KS_O.fov;
    return KS_U;
  }
  function cameraBeeld(z, t, dt) {
    const own = z.own, w = z.loper.d, X = z.lift;
    if (X && !X.loopt) {  // in de lift: eigen choreografie in de cabine (vanaf het beeld van nu)
      const half = liftHelft(X);
      if (half) {
        try { camFov = doolhof.lift.cam(X.L, half, dt, camPos, camLook); z.modus = 'lift'; z.snap = null; z.vorigDoel = null; return; }
        catch (e) { fout('liftcamera', e); }
      }
    }
    let modus = 'volg';
    if (own.isKamer) {
      // kamer.cam pas als ook de camera binnen is (overvloeien gaat dan nooit door een muur), tot 3 m voor de uitgang
      const binnen = own.tIn != null && z.dist - BACK >= own.ingangBoog + 0.3 && z.dist < own.uitgangBoog - 3.0;
      if (own.kamer.cam && !own.camKapot && binnen) modus = 'kamer';
      else if (z.dans) modus = 'rond';
    }
    if (modus !== z.modus) {  // zacht overvloeien vanaf het beeld van nu
      z.snap = { p: camPos.clone(), l: camLook.clone(), f: camFov, t0: t, dur: modus === 'kamer' ? 1.0 : 1.3 };
      z.modus = modus;
      if (modus === 'rond') {
        const p = w.root.position, m = own.kamer.maat; zv.copy(p); own.groep.worldToLocal(zv);
        z.rond = { a: Math.atan2(camPos.x - p.x, camPos.z - p.z), r0: Math.max(1.2, Math.hypot(camPos.x - p.x, camPos.z - p.z)), dir: Math.random() < 0.5 ? -1 : 1, t0: t,
          rT: Math.max(1.6, Math.min(3.2, Math.min(m.w / 2 - Math.abs(zv.x), m.d / 2 - Math.abs(zv.z)) - 0.6)) };
      }
    }
    let fov = 58, klaar = false;
    if (modus === 'kamer') {
      let r = null;
      try { r = kernShot(own, t, w); } catch (e) { r = null; EEN_BAAN.delete(own.soort); fout('kernshot ' + own.soort, e); }
      if (!r) try { r = own.kamer.cam(t - own.tIn, w, own.ctx); } catch (e) { own.camKapot = true; fout('cam van ' + own.soort, e); }
      if (r && r.pos && r.look) { tP.copy(r.pos); tL.copy(r.look); fov = r.fov || 58; klaar = true; }
      // knipt de kamer-camera tijdens het overvloeien: meteen het nieuwe beeld, anders glijdt hij na de knip nog na
      if (klaar && z.snap && z.vorigDoel && tP.distanceTo(z.vorigDoel) > 1.0) z.snap = null;
    } else if (modus === 'rond') {  // langzaam rond de dansende loper
      const p = w.root.position, q = z.rond, u = t - q.t0, a = q.a + q.dir * 0.22 * u, r = q.r0 + (q.rT - q.r0) * Math.min(1, u / 2.5);
      tP.set(p.x + Math.sin(a) * r, 1.75 + 0.25 * Math.sin(u * 0.5), p.z + Math.cos(a) * r); tL.set(p.x, 1.25, p.z); fov = 56; klaar = true;
    }
    z.vorigDoel = klaar && modus === 'kamer' ? (z.vorigDoel || new THREE.Vector3()).copy(tP) : null;
    if (!klaar) {  // achter de loper aan, op zijn eigen pad (blijft altijd binnen gang en deur; na een lift niet achter de dichte achterdeur)
      const sc = own.isKamer && own.inOv && own.inOv.lift ? Math.max(z.dist - BACK, own.inOv.L.camMin) : z.dist - BACK;
      opSpoor(own.sp, sc, tP); tP.y = OOG;
      opSpoor(own.sp, z.dist + VOORUIT, tL); tL.y = 1.35;
      fov = 58;
    }
    if (z.snap) {
      const k = ease(Math.min(1, (t - z.snap.t0) / z.snap.dur));
      camPos.lerpVectors(z.snap.p, tP, k); camLook.lerpVectors(z.snap.l, tL, k); camFov = z.snap.f + (fov - z.snap.f) * k;
      if (k >= 1) z.snap = null;
    } else { camPos.copy(tP); camLook.copy(tL); camFov = fov; }
  }
  // --- licht van het doolhof (zie boven): k = 1 in zaal 2 en het begin van de ∞-gang, 0 in de kamers; alles vloeit daartussen ---
  // ambient per zwaarte (hoog/midden, laag = 1 kamerlamp, minimaal = geen kamerlampen): bijna niets, de kamers lichten zelf
  const AMB_BASIS = [0.05, 0.07, 0.14];
  // bloom: drempel op de felste kleurcomponent met een zachte knie (uMax 1 = doolhof, 0 = de luminantie van de club); sterkte per stand
  const BL_DREMPEL = 0.6, BL_STRAAL = 0.6;  // (felle muren gloeien zo niet mee, lampen, neon en lasers wel)
  const AMB_KLEUR = ambient.color.clone(), BLOOM_OUD = bloom ? { threshold: bloom.threshold, radius: bloom.radius, hp: bloom.materialHighPassFilter } : null;
  const ambDoel = new THREE.Color(), WIT = new THREE.Color(1, 1, 1);
  let hpDoolhof = null;
  if (bloom && bloom.highPassUniforms && THREE.LuminosityHighPassShader) {
    hpDoolhof = houd(new THREE.ShaderMaterial({ uniforms: Object.assign({}, bloom.highPassUniforms, { uMax: { value: 0 } }),  // zelfde uniforms (tDiffuse, drempel)
      vertexShader: THREE.LuminosityHighPassShader.vertexShader,
      fragmentShader: `uniform sampler2D tDiffuse; uniform vec3 defaultColor; uniform float defaultOpacity, luminosityThreshold, smoothWidth, uMax;
        varying vec2 vUv;
        void main() {
          vec4 t = texture2D(tDiffuse, vUv);
          float v = mix(dot(t.rgb, vec3(0.299, 0.587, 0.114)), max(t.r, max(t.g, t.b)), uMax);
          gl_FragColor = mix(vec4(defaultColor, defaultOpacity), t, smoothstep(luminosityThreshold, luminosityThreshold + mix(smoothWidth, 0.3, uMax), v));
        }` }));
    // alvast compileren (op de achtergrond, zonder te wachten): anders hapert het eerste beeld in het doolhof
    klus('bloom-shader', (function* () { yield RUST; compileer([new THREE.Mesh(new THREE.PlaneGeometry(2, 2), hpDoolhof)], [], false); })());
  }
  function lichtTerug() {  // de club weer zoals hij was (de rest zetten het hoofdscript en de lichtregie zelf elk beeld)
    ambient.color.copy(AMB_KLEUR);
    if (bloom && BLOOM_OUD) { bloom.threshold = BLOOM_OUD.threshold; bloom.radius = BLOOM_OUD.radius; bloom.materialHighPassFilter = BLOOM_OUD.hp; }
  }
  function sfeer(z) {
    const k = z.fase === 'zaal2' ? 1 - glad(z.dist, z.own.uitgangBoog + 0.3, z.own.tpBoog - 0.4) : 0, sh = show;
    // ambient: een zweem van kleur(0) die op de kick even aanzwelt, in de break nog minder, wit bij een flits (dan flitsen de figuren
    // mee). ambient.intensity is hier wat het hoofdscript en de lichtregie deze frame voor zaal 2 zetten.
    const amb = AMB_BASIS[zwaar()] * (1 - 0.75 * sh.blackout) * (1 + 1.2 * pulse * energy + 0.6 * sh.drop) + 1.1 * sh.flits;
    ambDoel.copy(sh.kleur(0)).lerp(WIT, 0.25 + 0.75 * Math.min(1, sh.flits));
    ambient.intensity = ambient.intensity * k + amb * (1 - k);
    ambient.color.copy(AMB_KLEUR).lerp(ambDoel, 1 - k);
    strobeLight.intensity = 0;  // de stroboscoop (bereik 40 m) zou de loper in de ∞-gang door de muur heen laten flitsen
    const zfWas = camera.position.z > TUN_END - 0.5 ? 0.55 : 1;  // wat de kern en de lichtregie deze frame al toepasten (camera = vorige frame)
    if (bloom && bloom.enabled) {
      const z2 = bloom.strength * 0.55 / zfWas, st = sh.stand;  // zaal 2 (daar gedempt: al fel)
      // bij een strobe-flits minder bloom: anders wordt de flits een grijze waas zonder vorm (de leds en voegen moeten zichtbaar blijven)
      const B = ((st === 'break' ? 0.8 : st === 'opbouw' ? 0.8 + 0.4 * sh.opbouw : 0.9) + 0.3 * pulse * energy + 0.3 * sh.drop) * (1 - 0.65 * Math.min(1, sh.flits));
      bloom.strength = z2 * k + B * (1 - k);
      bloom.threshold = BLOOM_OUD.threshold * k + BL_DREMPEL * (1 - k);
      bloom.radius = BLOOM_OUD.radius * k + BL_STRAAL * (1 - k);
      if (hpDoolhof) { bloom.materialHighPassFilter = hpDoolhof; hpDoolhof.uniforms.uMax.value = 1 - k; }
    }
    if (feedback) {
      if (KW.stand === 'laag' || KW.stand === 'minimaal') feedback.enabled = false;
      else {
        // korte lichtsporen: bundels en lasers trekken strepen; in de break lang en dromerig, geen nagloed na een strobe-flits
        const u = feedback.material.uniforms, nu = performance.now() / 1000, st = sh.stand;
        let d = st === 'break' ? 0.5 : st === 'opbouw' ? 0.32 + 0.18 * sh.opbouw : 0.26 + 0.1 * pulse;
        d += 0.3 * sh.drop;
        if (z.naFlits) d *= 0.3;
        z.naFlits = sh.flits > 0.3;
        u.amount.value = Math.max(S.fb, 0.4 + 0.1 * pulse) * k + Math.max(S.fb, d) * (1 - k);
        feedback.enabled = S.fb > 0.01 || S.mirror || u.amount.value > 0.02;
        u.zoom.value = 1.035 * k + 1.01 * (1 - k) + (0.012 * k + 0.005 * (1 - k)) * Math.sin(nu * 0.21);
        u.rotA.value = (0.018 * k + 0.004 * (1 - k)) * Math.sin(nu * 0.13);
      }
    }
    if (z.fase === 'zaal2') zaal2Licht(z, k);
  }
  function stap(s, z, t) {
    const dt = Math.max(0, Math.min(0.1, t - z.lt)); z.lt = t;
    if (z.mislukt || !z.loper) { vasteCam(); einde(s); return; }
    const now = performance.now() / 1000;
    verberg(z); bewaarKW(z);
    if (z.planNa) { z.planNa = false; if (S.cam === 'doolhof' || z.own.nr < z.doel) planVolgende(z); }  // directe start: z.doel staat nu vast
    // nieuwe programma's (iets dat het opwarmen miste) vasthouden: ook die horen bij het doolhof
    const P = renderer.info.programs;
    if (P.length !== z.nProg) { for (const p of P) if (!z.bekend.has(p)) { z.bekend.add(p); if (!vast.has(p)) { vast.add(p); p.usedTimes++; STAT.laat = (STAT.laat || 0) + 1; } } z.nProg = P.length; }
    liftKlok(z, t, dt);
    loperBeeld(s, z, t, dt);
    const R = z.own.isKamer ? z.own : null;
    if (R) {
      for (const p of R.figs) { try { beweegFig(R, p.d, dt); } catch (e) { if (!R.figKapot) { R.figKapot = true; fout('figuur in ' + R.soort, e); } } }
      for (const m of R.trips) { m.uniforms.time.value = now; m.uniforms.bass.value = pulse * 0.7 + energy * 0.3; }
      if (R.kamer.update && !R.updKapot) try { R.kamer.update(dt, now); } catch (e) { R.updKapot = true; fout('update van ' + R.soort, e); }
    }
    lampenBeeld(z);
    cameraBeeld(z, t, dt);
    sfeer(z, dt);
    zone2.visible = z.fase === 'zaal2' && camPos.x > 3 && camPos.z > DOOR2.z - 4.5;  // ook in de frame van de wissel meteen goed (lampen!)
  }

  SHOTS.doolhof = { w: 0.8, beats: 100000,
    make() { const z = maakShot(); return { z, cleanup: () => opruimenShot(z) }; },
    at(s, u, t) {
      const z = s.z; if (!z) return;
      try { stap(s, z, t); } catch (e) { fout('shot', e); einde(s); vasteCam(); }
    } };
  clubHooks.push(() => { if (actief && (!shot || shot.z !== actief)) opruimenShot(actief); });  // shot = null (nieuwe bezetting, spatie) zonder cleanup

  // na de trip in 'auto': de helft van de keren door naar het doolhof (de trip eindigt in zaal 2, het doolhof begint daar)
  const kernStart = startShot;
  startShot = function (kind, now) {
    if (kind === 'auto' && shot && shot.kind === 'trip' && Math.random() < 0.5) kind = 'doolhof';
    // na het doolhof (ging ook door zaal 2) de verplichte trip pas over 2 min: vóór de keuze, anders kiest startShot hem meteen weer
    else if (shot && shot.kind === 'doolhof' && shot.z && !shot.z.mislukt && typeof lastTrip !== 'undefined') lastTrip = performance.now() / 1000;
    return kernStart(kind, now);
  };
  doolhof.start = (soort, direct) => { if (soort) doolhof.volgende = soort; doolhof.direct = !!direct; startShot('doolhof', performance.now() / 1000); };
  doolhof.direct = false;  // true vlak vóór startShot('doolhof'): begin in de gang vóór kamer 1 (showregie in de break)
  doolhof.toestand = () => actief;  // voor de testronde: kamer, loper, booglengte (null buiten het shot)
  // club/moshpit.js: de loper blijft (nog) minstens sec seconden dansen waar hij staat (moshpit in deze kamer). Alleen als hij ver
  // genoeg binnen is (de kamer-camera neemt het dan over) en niet vlak voor de uitgang; anders false (later nog eens proberen).
  doolhof.houdLoper = sec => {
    const z = actief;
    if (!z || z.weg || z.mislukt || !z.loper || !z.own || !z.own.isKamer) return false;
    if (!z.dans) {
      if (z.dist < z.own.ingangBoog + BACK + 0.5 || z.dist > z.own.uitgangBoog - 3.5) return false;
      startDans(z, z.lt);
    }
    z.dansTot = Math.max(z.dansTot, z.lt + sec);
    return true;
  };
  doolhof.voorraad = () => voorraad && { klaar: voorraad.klaar, soort: voorraad.R && voorraad.R.soort, gang: voorraad.ov && voorraad.ov.stijl, ms: voorraad.ms };
  doolhof.voorraadWeg = () => { if (!actief) voorraadWeg(); };  // (test doolhof.lift(): kamer 1 opnieuw bouwen met een lift erachter)
  doolhof.werk = () => werk.map(k => k.naam);
  doolhof.losse = () => [...losseGroepen, ...pool.map(p => p.d.root)];  // testronde: wat buiten de scène leeft (lekzoeker)

  // --- voor club/voorwarm.js: van elke kamersoort en elke gangstijl een proefexemplaar bouwen (los van de scène), de shaders compileren
  // (die blijven bestaan, zie vastzetten) en weer weggooien. Kamers in de doolhof-stand, gangen ook in de zaal-2-stand (de ∞-gang).
  // Texturen niet (die gooien we meteen weer weg); wel de shaders van de upload-render (vervangend materiaal).
  // Het geheugen van de loting (stijl.js: laatste sferen en schilderingen, de laatste gangen, de boiler-teller) blijft zoals het was.
  function bewaarLoting() {
    const G = doolhof.stijl && doolhof.stijl.GEHEUGEN, kopie = G ? JSON.parse(JSON.stringify(G)) : null;
    const laatste = doolhof.laatsteStijl, sb = sindsBoiler, rg = recenteGangen.slice();
    return () => {
      if (G && kopie) for (const k of Object.keys(kopie)) {
        if (Array.isArray(G[k])) { G[k].length = 0; G[k].push(...kopie[k]); }
        else if (G[k] && typeof G[k] === 'object') { for (const kk of Object.keys(G[k])) delete G[k][kk]; Object.assign(G[k], kopie[k]); }
      }
      doolhof.laatsteStijl = laatste; sindsBoiler = sb; recenteGangen.length = 0; recenteGangen.push(...rg);
    };
  }
  doolhof.proef = {
    *stappen() {  // elke next() = een klein stuk; 'rust' = er gebeurde iets zwaars (bouwen, een nieuwe shader)
      for (const soort of Object.keys(doolhof.kamers)) {
        const terugZet = bewaarLoting();
        let R = null;
        try { R = voltooi(kamerStappen(soort, null, null, { zonderGangen: true })); } catch (e) { fout('proefkamer ' + soort, e); }
        terugZet();
        yield RUST;
        if (!R) continue;
        yield* opwarmStappen([R.groep], 'doolhof', null, true);
        sloop(null, R);
        yield RUST;
      }
      for (const stijl of Object.keys(doolhof.gangStijlen)) {
        const ov = { stijl, sx: 1, zaad: (Math.random() * 4294967296) >>> 0, zwaar: zwaar(), deel: new Map(), n: 0 }, houder = new THREE.Group();
        try { gang(houder, { x: 0, z: 0, yaw: 0 }, ov, 'eind'); } catch (e) { fout('proefgang ' + stijl, e); }
        yield RUST;
        for (const st of ['doolhof', 'zaal2']) yield* opwarmStappen([houder], st, null, true);
        afvoerLater([houder]);
      }
      // liften (doolhof/lift.js): drie proefritten met verschillende cabines (de shaders van uitzicht, led, glas en display en de
      // instanced deuren), zonder de testkeuzes of het geheugen van de loting te raken
      const LF = doolhof.lift;
      if (LF && typeof LF.plan === 'function') for (const keus of [{ cabine: 'capsule', deur: 'iris' }, { cabine: 'messing', deur: 'harmonica' }, { cabine: 'kooi', deur: 'luik' }]) {
        const houder = new THREE.Group();
        try { const ov = { lift: true, stijl: 'lift', sx: 1, zaad: 0, zwaar: zwaar(), deel: new Map(), n: 0, level: 0, L: LF.plan(0, keus, true) }; voltooi(LF.bouw(houder, { x: 0, z: 0, yaw: 0 }, ov)); }
        catch (e) { fout('proeflift', e); }
        yield RUST;
        yield* opwarmStappen([houder], 'doolhof', null, true);
        afvoerLater([houder]);
      }
    },
  };
  {
    const sel = document.getElementById('cam');
    if (sel && !sel.querySelector('option[value="doolhof"]')) {
      const o = document.createElement('option'); o.value = 'doolhof'; o.textContent = 'Camera: het doolhof'; sel.appendChild(o);
      if (S.cam === 'doolhof') sel.value = 'doolhof';
    }
  }

  // --- eenvoudige kamer van de kern zelf: een smalle gang-kamer als lichttunnel (ledpoorten, ledbuizen, publiek langs de wanden) ---
  doolhof.registreer('gang-kamer', { gewicht: 0.3, maak(ctx) {
    const r = ctx.rnd, kies = a => a[Math.min(a.length - 1, Math.floor(r() * a.length))];
    const w = 6 + r() * 2, d = 13 + r() * 5, h = 3.3;
    const tint = new THREE.Color().setHSL(r(), 0.85, 0.55);
    // wanden en vloer: gedimde ledvlakken (doolhof/led.js; de poorten blijven de hoofdrol), plafond zwart. Zonder led.js: de oude
    // schildering in het donker, alleen de show licht hem op
    const LED = doolhof.led && doolhof.led.scherm ? doolhof.led : null;
    let muur = null;
    if (LED) {
      const hue = tint.getHSL({}).h, zaad = Math.floor(r() * 997);
      const pal = { a: tint.clone(), b: new THREE.Color().setHSL((hue + 0.33) % 1, 0.95, 0.5), c: new THREE.Color().setHSL((hue + 0.62) % 1, 0.95, 0.5), donker: 0x010003 };
      const zij = LED.scherm({ palet: pal, maat: { w: d, h }, zaad, modi: { patroon: 2, beeld: 1, golf: 0.6 }, helder: 0.42, zwaar: ctx.zwaar });
      const kop = LED.scherm({ palet: pal, maat: { w, h }, zaad: zaad + 5, modi: { patroon: 1, tekst: 1.2 }, helder: 0.42, zwaar: ctx.zwaar });
      ctx.doos({ w, d, h, muur: [zij, zij, kop, kop], vloer: LED.vloerMat(w, d, { palet: pal, tegel: 0.6, zaad, helder: 0.58, zwaar: ctx.zwaar }), plafond: new THREE.MeshBasicMaterial({ color: 0x000000 }) });
    } else {
      muur = new THREE.MeshBasicMaterial({ map: wallTex, color: 0x000000 });
      ctx.doos({ w, d, h, muur });
    }
    // ledbuizen onder het plafond langs beide wanden: een looplicht van de ingang naar de uitgang, op de show-bus
    const buizen = [], n = Math.max(3, Math.round(d / 3.2)), seg = d / n;
    for (const sx of [-1, 1]) for (let i = 0; i < n; i++) {
      const m = additive(0x000000);
      add(ctx.groep, BOX, m, [sx * (w / 2 - 0.05), h - 0.3, -d / 2 + (i + 0.5) * seg], [0.06, 0.06, seg * 0.82]);
      buizen.push({ m, i, sx });
    }
    const plint = additive(0x000000);  // gloeiende plint
    for (const sx of [-1, 1]) add(ctx.groep, BOX, plint, [sx * (w / 2 - 0.03), 0.04, 0], [0.04, 0.04, d - 0.2]);
    // ledpoorten: per poort twee staande balken langs de wanden (achter het publiek: silhouetten tegen het licht) en één over het
    // plafond; de camera kijkt er doorheen als door een lichttunnel. Eén draw, kleur per balk op de show-bus.
    const nb = Math.max(5, Math.round(d / 1.6)), balken = new THREE.InstancedMesh(BOX, additive(0xffffff), nb * 3), kc = new THREE.Color(), m4 = new THREE.Matrix4();
    for (let i = 0; i < nb; i++) {
      const z = -d / 2 + (i + 0.5) * d / nb;
      for (let s = 0; s < 2; s++) { m4.makeScale(0.07, h - 0.5, 0.07).setPosition((s ? 1 : -1) * (w / 2 - 0.05), 0.25 + (h - 0.5) / 2, z); balken.setMatrixAt(i * 3 + s, m4); }
      m4.makeScale(w - 0.1, 0.07, 0.07).setPosition(0, h - 0.06, z); balken.setMatrixAt(i * 3 + 2, m4);
      for (let s = 0; s < 3; s++) balken.setColorAt(i * 3 + s, kc.setRGB(0, 0, 0));
    }
    balken.frustumCulled = false; ctx.groep.add(balken);
    // licht dat de balken op muur en vloer werpen (zachte gloed, additief): per staande balk een veeg op de muur en een plas op de vloer
    const was = new THREE.InstancedMesh(gangVlak1, new THREE.MeshBasicMaterial({ map: gloedTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), nb * 4);
    const wq = new THREE.Quaternion(), wv = new THREE.Vector3(), ws = new THREE.Vector3(), we = new THREE.Euler();
    for (let i = 0; i < nb; i++) for (let s = 0; s < 2; s++) {
      const sx = s ? 1 : -1, z = -d / 2 + (i + 0.5) * d / nb;
      wq.setFromEuler(we.set(0, -sx * Math.PI / 2, 0)); m4.compose(wv.set(sx * (w / 2 - 0.02), h / 2, z), wq, ws.set(1.5, h * 1.1, 1)); was.setMatrixAt(i * 4 + s, m4);
      wq.setFromEuler(we.set(-Math.PI / 2, 0, 0)); m4.compose(wv.set(sx * (w / 2 - 0.5), 0.015, z), wq, ws.set(2.2, 2.2, 1)); was.setMatrixAt(i * 4 + 2 + s, m4);
      for (let k = 0; k < 4; k++) was.setColorAt(i * 4 + k, kc.setRGB(0, 0, 0));
    }
    was.frustumCulled = false; was.renderOrder = -1; ctx.groep.add(was);
    const bord = ctx.neon(kies(['DEEPER', 'NO EXIT', 'VERDWAALD', 'NOG DIEPER', 'LOST', 'AFTER', 'HIER NIET', '∞']), '#' + tint.getHexString(), 2.6, 0.65);
    const bs = r() < 0.5 ? -1 : 1;
    bord.position.set(bs * (w / 2 - 0.06), 2.2, (r() - 0.5) * d * 0.4); bord.rotation.y = -bs * Math.PI / 2;
    const lamp = ctx.licht(tint.getHex(), 1.6, 12, 0, h - 0.5, 0);
    // publiek langs de wanden: vooral staan (drankje, sigaret), een paar dansen; het midden blijft vrij voor de loper
    const nf = [6, 4, 3][ctx.zwaar];
    for (let i = 0; i < nf; i++) {
      const sx = i % 2 ? 1 : -1, z = -d / 2 + 2 + (d - 4) * (i + 0.5) / nf + (r() - 0.5) * 0.6;
      ctx.figuur({ x: sx * (w / 2 - 0.7), z, face: -sx * Math.PI / 2 + (r() - 0.5) * 0.9, rol: r() < 0.3 ? 'dans' : 'staan' });
    }
    // camera: laag bij de ingang, de blik door de poorten naar de uitgang; de dansende loper staat er als silhouet tussen
    const cp = new THREE.Vector3(), cl = new THREE.Vector3(), cr = { pos: cp, look: cl, fov: 60 }, cs = r() < 0.5 ? -1 : 1;
    return { maat: { w, d, h }, blijf: 8,
      cam(t) {
        const u = 0.5 + 0.5 * Math.sin(t * 0.13);
        cp.set(cs * (0.4 + 0.9 * u), 1.05 + 0.35 * u, -d / 2 + 1.3 + 1.2 * u); cl.set(-cs * 0.4 * u, 1.75 + 0.25 * u, d / 2);
        ctx.groep.updateWorldMatrix(true, false); ctx.groep.localToWorld(cp); ctx.groep.localToWorld(cl);
        return cr;
      },
      update() {
        const b = ctx.beat(), sh = doolhof.show, a = 1 - 0.6 * sh.blackout, st = sh.stand;  // break gedimd, niet zwart
        // golf van ingang naar uitgang: break traag (8 tellen), opbouw steeds sneller (4 -> 1), groove 4 tellen, drop elke tel
        const per = st === 'break' ? 8 : st === 'opbouw' ? 4 / (1 + 3 * sh.opbouw) : st === 'drop' ? 1 : 4;
        for (const t of buizen) {
          const f = ((b.pos / per - t.i / n) % 1 + 1) % 1;
          const v = (0.03 + 1.2 * Math.pow(1 - f, 6) * (0.45 + 0.55 * b.energy) + 0.7 * sh.drop * b.pulse) * a;
          sh.kleur(t.sx > 0 ? 0 : 1, t.m.color).multiplyScalar(v).addScalar(1.2 * sh.flits);
        }
        sh.kleur(2, plint.color).multiplyScalar((0.05 + 0.45 * b.pulse) * a);
        if (muur) sh.kleur(0, muur.color).multiplyScalar(0.05 * b.pulse * a).addScalar(0.05 * a + 0.55 * sh.flits);
        if (lamp) { sh.kleur(0, lamp.color); lamp.intensity = (0.4 + 1.6 * b.pulse * b.energy) * a + 2.5 * sh.flits; }
        // ledpoorten: break één trage poort, opbouw een looplicht dat versnelt, groove om en om op de tel + looplicht, drop alles aan
        const tel = Math.floor(b.pos);
        for (let i = 0; i < nb; i++) {
          let v, ki = i + tel;
          if (st === 'break') { const q = ((b.pos / 2 - i) % nb + nb) % nb; v = 0.08 + 0.7 * Math.exp(-q * 1.5); ki = 0; }  // trage golf door de poorten
          else if (st === 'opbouw') { const q = ((b.pos * (1 + 3 * sh.opbouw) - i) % nb + nb) % nb; v = 0.06 + 0.25 * sh.opbouw + Math.exp(-q * 0.8) * (0.5 + 0.9 * sh.opbouw); ki = 0; }
          else if (st === 'drop') v = (0.7 + 0.9 * b.pulse) * (0.6 + 0.4 * sh.drop);
          else { const q = ((b.pos * 2 - i) % nb + nb) % nb; v = 0.35 + 0.8 * b.pulse * b.energy * ((i + tel) & 1) + 1.0 * Math.exp(-q * 1.2); }
          for (let s = 0; s < 3; s++) {
            sh.kleur(ki + (s === 2 ? 1 : 0), kc).multiplyScalar(s === 2 ? v * 0.8 : v).addScalar(1.3 * sh.flits);
            balken.setColorAt(i * 3 + s, kc);
          }
          sh.kleur(ki, kc).multiplyScalar(0.55 * v);
          for (let k = 0; k < 4; k++) was.setColorAt(i * 4 + k, kc);
        }
        was.instanceColor.needsUpdate = true;
        balken.instanceColor.needsUpdate = true;
      } };
  } });
})();

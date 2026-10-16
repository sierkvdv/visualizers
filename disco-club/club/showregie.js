// Showregie: zaal 1 is het hoofdpodium. Uitstapjes naar de diepte (trip naar zaal 2, het doolhof) komen alleen via deze regie:
// in de break of het begin van de opbouw ('we gaan dieper in de break'), en zonder breaks af en toe; de drop knalt altijd in zaal 1.
// Alleen in 'auto'. Wrapt startShot (ná doolhof/kern.js): 'auto' wordt hier gekozen, dus de verplichte trip (TRIP_ELKE) en de
// 50%-doorloop trip -> doolhof van de kern komen niet meer aan bod. Tegoed: per seconde zaal 1 0,55 s diepte (hooguit ~35% buiten).
// Testen: showRegie.toestand(), showRegie.dieper('trip'|'doolhof'), showRegie.log.
(() => {
  'use strict';
  if (typeof SHOTS === 'undefined' || typeof startShot !== 'function' || typeof clubHooks === 'undefined') return;

  const OPWARM = 45;                                   // s na het laden: alleen zaal 1
  const RENTE = 0.55, MAX_TEGOED = 90, ROOD = 15;      // tegoed per s zaal 1 (hooguit ~35% buiten); spaarplafond; hooguit 15 s rood
  const MIN_BREAK = 16, MIN_GROOVE = 30, MIN_DOOR = 30; // tegoed nodig: uitstap in de break, zonder breaks, na de trip door naar het doolhof
  const RUST_BREAK = 35, RUST_GROOVE = 75;             // s zaal 1 tussen twee uitstapjes (Sierk zag de gangen te weinig)
  const ZONDER_BREAK = 60;                             // zo lang geen break gezien = muziek zonder secties (echte muziek: breaks vaak niet herkend)
  const BUITEN = new Set(['trip', 'doolhof']);
  const TERUG = ['rondje', 'kraan', 'voorlangs', 'dj']; // terug in de club: wijd over de zaal of de dj
  const klok = () => performance.now() / 1000;
  const een = a => a[Math.floor(Math.random() * a.length)];
  const r1 = x => Math.round(x * 10) / 10;

  // trip en doolhof uit de gewone loting (ook als het hoofdscript ooit zelf 'auto' loot)
  if (SHOTS.trip) SHOTS.trip.w = 0;
  if (SHOTS.doolhof) SHOTS.doolhof.w = 0;

  const T0 = klok();
  let tegoed = 0, tIn = 0, tUit = 0, nUit = 0;
  let uit = null;                                     // lopend uitstapje: { t0, b0, reden, brk, soort }
  let uitEind = -1e9, breakT = -1e9, dropGezien = -1, tel = -1, laadKlaar = null, plan = null, laatst = null;
  const log = [];
  const noteer = (wat, x) => { log.push(Object.assign({ t: Math.round(klok() - T0), tel: Math.floor(beatPos), wat }, x)); if (log.length > 40) log.shift(); };
  const stand = () => (window.clubRegie && window.clubRegie.stand) || 'groove';
  const opgewarmd = () => laadKlaar != null && klok() - laadKlaar >= OPWARM;
  const camWeg = () => camera.position.z > ROOM + 1 || Math.abs(camera.position.x) > 60;  // tunnel, zaal 2, doolhof

  // gewone loting van de zaal-1-shots (als in startShot, zonder trip en doolhof)
  function loting() {
    const cur = shot && shot.kind, pool = shotKinds().filter(k => k !== cur && !BUITEN.has(k));
    const w = pool.map(k => Math.max(0, +SHOTS[k].w || 0)), som = w.reduce((a, b) => a + b, 0);
    if (!(som > 0)) return SHOTS.rondje ? 'rondje' : pool[0];
    let r = Math.random() * som;
    for (let i = 0; i < pool.length; i++) if ((r -= w[i]) < 0) return pool[i];
    return pool[pool.length - 1];
  }
  function terugShot() { const k = TERUG.filter(k => SHOTS[k] && !(shot && shot.kind === k)); return k.length ? een(k) : loting(); }
  const dropShot = () => (SHOTS.drop ? 'drop' : SHOTS.kraan ? 'kraan' : terugShot());  // kraan omhoog als er geen drop-shot is
  const doelVoor = () => (tegoed >= 85 ? 2 : 1);     // kamers in het doolhof

  // mag er nu een uitstapje beginnen? { soort, reden, doel } of null
  function wilDieper() {
    if (S.cam !== 'auto' || uit || !opgewarmd()) return null;
    const R = window.clubRegie, st = stand(), nu = klok();
    const naDrop = R && R.dropBeat >= 0 && beatPos - R.dropBeat >= 0 && beatPos - R.dropBeat < 32;
    let reden = null;
    if ((st === 'break' || (st === 'opbouw' && R.opbouwTel < 4)) && tegoed >= MIN_BREAK && nu - uitEind >= RUST_BREAK) reden = 'break';
    else if (st === 'groove' && !naDrop && tegoed >= MIN_GROOVE && nu - uitEind >= RUST_GROOVE && nu - breakT >= ZONDER_BREAK) reden = 'groove';
    if (!reden) return null;
    // om en om trip en doolhof (de eerste keer de trip: iemand loopt van de club naar binnen); in de break kapt de drop het af,
    // zonder breaks loopt het doolhof tot het eind van een kamer: dan genoeg tegoed nodig
    const naarDoolhof = SHOTS.doolhof && nUit % 3 !== 0 && (reden === 'break' || tegoed >= MIN_DOOR + 5);  // trip, doolhof, doolhof, trip, ...
    const soort = naarDoolhof ? 'doolhof' : SHOTS.trip ? 'trip' : SHOTS.doolhof ? 'doolhof' : null;
    return soort ? { kind: soort, reden, doel: soort === 'doolhof' ? doelVoor() : 0 } : null;
  }
  // keuze als het shot afloopt in 'auto'
  function kies() {
    const st = stand();
    if (uit && shot && shot.kind === 'trip' && SHOTS.doolhof && st !== 'drop') {  // trip klaar: door de ∞-deur verder?
      const inBreak = st === 'break' || st === 'opbouw';
      if ((inBreak && tegoed >= 10) || (!inBreak && !uit.brk && uit.reden !== 'break' && tegoed >= MIN_DOOR)) return { kind: 'doolhof', reden: uit.reden, doel: doelVoor() };
    }
    if (uit) return { kind: terugShot(), waarom: 'einde' };
    return wilDieper() || { kind: loting() };
  }

  // na elke shotwissel: uitstapje bijhouden
  function na(s, p) {
    if (BUITEN.has(s.kind)) {
      if (!uit) { uit = { t0: klok(), b0: beatPos, reden: (p && p.reden) || 'los', brk: false }; nUit++; noteer('dieper', { soort: s.kind, reden: uit.reden, stand: stand(), tegoed: r1(tegoed) }); }
      else noteer('verder', { soort: s.kind, tegoed: r1(tegoed) });
      uit.soort = s.kind;
      if (p && p.doel && s.kind === 'doolhof' && s.z && !s.z.mislukt) s.z.doel = p.doel;
    } else if (uit) {
      noteer('terug', { soort: s.kind, waarom: (p && p.waarom) || 'los', na: r1(klok() - uit.t0), tegoed: r1(tegoed) });
      uit = null; uitEind = klok();
    }
    if (p && p.drop) { s.srDrop = true; s.regie = true; if (s.kind === 'kraan') s.up = true; }
  }

  const vorige = startShot;
  startShot = function (kind, now) {
    // regie-momenten.js ziet de drop pas als wij al terug zijn en wil nog eens knippen: ons drop-shot blijft staan
    if (kind === 'drop' && shot && shot.srDrop && beatPos - shot.b0 < 4) return;
    let p = plan; plan = null;
    if (kind === 'auto' && S.cam === 'auto') {
      try {
        p = kies();
        // dieper gaat op de tel: loopt het shot tussen twee tellen af, dan rekt het tot de volgende tel
        if (p.reden && !uit && shot && beatPos > shot.b0 && beatPos - Math.floor(beatPos) > 0.15) { shot.beats = Math.floor(beatPos) + 1.01 - shot.b0; return; }
        kind = p.kind;
      } catch (e) { console.error('showregie', e); p = null; }
    }
    if (shot) shot.srWeg = true;  // startShot ruimt dit shot zelf op
    // in de break is er geen tijd voor de wandeling door zaal 2 (~15 s): het doolhof begint dan in de gang vóór de eerste kamer
    if (kind === 'doolhof' && window.doolhof) {
      const st = stand();
      if (p && p.reden === 'break' && (st === 'break' || st === 'opbouw')) window.doolhof.direct = true;
    }
    const was = shot, res = vorige.call(this, kind, now);
    if (window.doolhof) window.doolhof.direct = false;
    if (shot && shot !== was) try { na(shot, p); } catch (e) { console.error('showregie', e); }
    return res;
  };
  function knip(kind, p) {
    plan = p || {};
    try { startShot(kind, klok()); } catch (e) { console.error('showregie: knip naar ' + kind, e); }
    plan = null;
    if (!BUITEN.has(kind) && typeof zone2 !== 'undefined') zone2.visible = false;  // terug in zaal 1: zaal 2 niet nog één beeld tekenen
  }

  // Auto-willekeurig zet de camera soms vast op een shot: nooit vast op trip of doolhof (dan zou het doolhof minutenlang lopen)
  if (typeof randomizeAll === 'function') {
    const oRandom = randomizeAll;
    randomizeAll = function () {
      const r = oRandom.apply(this, arguments);
      if (BUITEN.has(S.cam)) { S.cam = 'auto'; if (typeof syncUI === 'function') syncUI(); if (typeof save === 'function') save(); }
      return r;
    };
  }

  clubHooks.push((dt, now) => {
    if (typeof lastTrip !== 'undefined') lastTrip = now;  // de verplichte trip van het hoofdscript staat uit: deze regie kiest
    const R = window.clubRegie, st = stand();
    if (st === 'break' || st === 'opbouw') breakT = now;
    if (laadKlaar == null && (typeof LAAD === 'undefined' || LAAD.klaar >= LAAD.totaal || now - T0 > 60)) laadKlaar = now;
    const auto = S.cam === 'auto', diep = !!shot && BUITEN.has(shot.kind), weg = diep || camWeg();
    if (auto) {
      if (weg) { tUit += dt; tegoed -= dt; } else { tIn += dt; tegoed = Math.min(MAX_TEGOED, tegoed + RENTE * dt); }
    }
    // shot = null (spatie, nieuwe bezetting) slaat cleanup over: dan bleef de trip-loper staan
    if (laatst && laatst !== shot) { if (laatst.cleanup && !laatst.srWeg) { laatst.srWeg = true; try { laatst.cleanup(); } catch (e) { console.error('showregie', e); } } }
    laatst = shot;
    if (uit && !diep) { noteer('weg', { na: r1(now - uit.t0) }); uit = null; uitEind = now; }  // zonder ons beëindigd (spatie, bezetting, hand)
    const b = Math.floor(beatPos), opTel = b !== tel; tel = b;
    // de drop: meteen terug naar zaal 1 (de drop valt zelf al op de tel)
    const nieuweDrop = !!R && st === 'drop' && R.dropBeat !== dropGezien;
    if (nieuweDrop) dropGezien = R.dropBeat;
    if (!auto) return;
    if (nieuweDrop && (uit || weg)) { knip(dropShot(), { drop: true, waarom: 'drop' }); return; }
    if (uit) {
      if (st === 'break' || st === 'opbouw') uit.brk = true;
      if (!opTel) return;
      if (tegoed < -ROOD) knip(terugShot(), { waarom: 'tegoed op' });
      else if (uit.brk && st === 'groove' && beatPos - uit.b0 >= 8) knip(terugShot(), { waarom: 'break voorbij' });  // de bas is terug zonder drop
      return;
    }
    // dieper in de break: op de tel knippen; een vers momentshot (boer, solo, paar) eerst laten staan
    if (opTel && !(shot && shot.regie && beatPos - shot.b0 < 8)) {
      const w = wilDieper();
      if (w && w.reden === 'break') knip(w.kind, w);
    }
  });

  window.showRegie = {
    log,
    toestand: () => ({ tegoed: r1(tegoed), zaal1: tIn + tUit > 0 ? Math.round(100 * tIn / (tIn + tUit)) + '%' : '-', uitstapjes: nUit,
      uit: uit && { soort: uit.soort, reden: uit.reden, sinds: r1(klok() - uit.t0) }, opgewarmd: opgewarmd(), stand: stand(), shot: shot && shot.kind }),
    dieper: soort => { soort = soort || 'trip'; if (SHOTS[soort]) knip(soort, { reden: 'hand', doel: soort === 'doolhof' ? 1 : 0 }); },
  };
})();

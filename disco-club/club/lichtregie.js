// Lichtregisseur: herkent break, opbouw en drop in de muziek en stuurt de lichtshow daarop;
// in de groove volgt het palet de avond (deuren, piek, diep, ochtend) en krijgt elk nummer een eigen look.
// Draait als clubHook ná de kern-lichtshow en overschrijft die waar de stand dat vraagt.
// Publiceert window.clubRegie (gelezen door ledwand.js).
(function () {
  'use strict';
  if (typeof clubHooks === 'undefined' || typeof CUES === 'undefined') return;

  const col = h => new THREE.Color(h);
  const pair = p => p.map(col);
  const findCue = n => CUES.find(c => c.name === n);
  const ALLES = findCue('alles') || CUES[0], HEADS = findCue('heads'), LASERS = findCue('lasers');

  // eigen lichtstanden (één keer gemaakt; BUILD_CUE wordt per frame bijgewerkt)
  const BREAK_CUE = { name: 'break', spots: 0.12, heads: 0.9, lasers: 0, floor: 0.12, flecks: 1.7, wash: 0.1, forms: [0] };
  const BUILD_CUE = { name: 'opbouw', spots: 0.12, heads: 0.9, lasers: 0, floor: 0.12, flecks: 1.7, wash: 0.1, forms: [0] };
  const BREAK_PAL = pair([0x2a1aff, 0x8a2be2]);
  const DROP_PALS = [pair([0xff1744, 0xffffff]), pair([0xff00e5, 0x00e5ff])];

  // fasen van de avond met hun paletten
  const FASEN = ['deuren', 'piek', 'diep', 'ochtend'];
  const FASE_PAL = {
    deuren: [[0xff8a00, 0xff1a1a], [0xffb347, 0xff3d00], [0xff2d55, 0xffc070]].map(pair),
    piek: PALETTES,
    diep: [[0x2979ff, 0x7a00ff], [0x00e5ff, 0x304ffe], [0x00ff9c, 0x6a00ff]].map(pair),
    ochtend: [[0xff7a3d, 0xff4fa3], [0xffb199, 0xff6f91], [0xffd27a, 0xff5e7e]].map(pair),
  };
  const TRACK_CUES = [ALLES, ALLES, HEADS, findCue('vloer'), LASERS].filter(Boolean);
  const pickOther = (list, not) => { const r = list.filter(p => p !== not); return r.length ? pick(r) : list[0]; };

  // gedeelde stand voor andere bestanden: één object, velden worden bijgewerkt
  const REG = window.clubRegie = Object.assign(window.clubRegie || {}, { stand: 'groove', sinds: 0, opbouwTel: 0, fase: 'piek', dropBeat: -1 });

  // --- sectie-detector ---
  let eF = 0, eS = 0;
  const bF = [0, 0, 0], bS = [0, 0, 0];
  const ref = [0.1, 0.1, 0.1], bN = [0, 0, 0];  // in break/opbouw: bandniveau met bevroren auto-gain
  const aF = [0, 0, 0];  // ruw niveau (zonder auto-gain), snel gemiddeld; voor de vergelijking met 8 tellen terug
  const hiHist = new Float32Array(16), midHist = new Float32Array(16);
  let lastBeat = -1, breakRun = 0, breakFirst = 0, grooveBass = 0.5, grooveE = 0.8, breakBassSum = 0, breakBassN = 0, riseRun = 0, backRun = 0, buildStart = 0;

  // --- nummer en avond ---
  let fase = null, faseCheck = -99, trackPair = PALETTES[0], trackCue = null, trackStrobe = 'normaal', lastTrackT = -99;
  let stil = 0, refPeriod = period, candPeriod = 0, tempoRun = 0, rolledFor = -1;
  const T0 = performance.now() / 1000;
  let seenCue = cue, seenPal = palTarget;
  const setCue = c => { cue = c; seenCue = c; };
  const setPal = p => { palTarget = p; seenPal = p; };

  // --- look-toestand ---
  const own = heads.map(() => new THREE.Vector3()), doel = new THREE.Vector3();
  let headsOwn = false, wBreak = 0, myAmb = 0.12, myBloom = 0.5, narrow = 1, spotW = 0;
  const sAng = new Float32Array(spots.length), sRad = new Float32Array(spots.length);
  let dropT = -99, dropIdx = 1, dropPal = DROP_PALS[0];
  const zf = () => (camera.position.z > TUN_END - 0.5 ? 0.55 : 1);  // zaal 2 is al fel (zoals de kern)

  // CO2-jets: vaste pool sprites, onzichtbaar tot een drop
  const jet = [], jetCol = new THREE.Color();
  for (let i = 0; i < 24; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex[i % 3], color: 0x999999, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.visible = false;
    scene.add(sp);
    jet.push({ sp, v: new THREE.Vector3(), age: 0, life: 1 });
  }
  let jetUntil = 0, jetAcc = 0, jetsAlive = 0;

  function grabHeads() {
    if (headsOwn) return;
    heads.forEach((h, i) => own[i].copy(h.cur));
    headsOwn = true;
  }
  function setStand(s) {
    if (s !== 'groove') grabHeads();
    REG.stand = s; REG.sinds = beatPos;
    if (s !== 'opbouw') REG.opbouwTel = 0;
    if (s === 'groove') {
      headsOwn = false; breakRun = 0;
      if (cue === BREAK_CUE || cue === BUILD_CUE) setCue(trackCue || ALLES);
      if (!cue.white) setPal(trackPair);
    }
  }
  // willekeurige salvo's van de kern tegenhouden
  function geenSalvo(now) { nextStrobe = Math.max(nextStrobe, now + 4); strobeUntil = 0; }
  // eigen flits: stroboscoop + panelen, en de rookwolken lichten mee op (de kern deed dat al vóór deze hook)
  function flits(I) {
    const extra = I - strobeLight.intensity;
    strobeLight.intensity = I;
    strobeMat.color.setScalar(Math.min(1, I / 5));
    if (extra > 0.05 && typeof puffs !== 'undefined') {
      const a = extra * 0.012 * S.smoke * 1.6;
      for (const f of puffs) { const c = f.sp.material.color; c.r += a; c.g += a; c.b += a; }
    }
  }

  // drop-look: start via de wrapper om startMoment, zodat licht, publiek en camera op dezelfde tel zitten
  function startDropLook(tb) {
    const b = Math.round(typeof tb === 'number' ? tb : beatPos);  // afgerond: een aanslag net vóór de tel hoort bij die tel
    if (REG.stand === 'drop' && b - REG.dropBeat < 8) return;
    const now = performance.now() / 1000;
    grabHeads();
    REG.stand = 'drop'; REG.sinds = beatPos; REG.dropBeat = b; REG.opbouwTel = 0;
    dropT = now;
    dropIdx = (dropIdx + 1) % 2; dropPal = DROP_PALS[dropIdx];
    setCue(ALLES); setPal(dropPal);
    pal[0].copy(dropPal[0]); pal[1].copy(dropPal[1]);  // meteen om, niet vloeien
    for (const k in L) if (k in ALLES) L[k] = ALLES[k];
    wBreak = 0;
    for (const m of FOGGERS) fireFog(m, 1.2);
    jetUntil = now + 1.5;
    breakRun = 0; riseRun = 0; backRun = 0;
  }
  let lastDropMoment = -999;  // tel van het laatste publieks-drop-moment (lastMoment telt ook solo/paar/boer van de slak mee)
  const origMoment = startMoment;
  startMoment = function (k, tb) {
    const r = origMoment.apply(this, arguments);
    if (k === 'drop') { lastDropMoment = typeof tb === 'number' ? tb : beatPos; try { startDropLook(tb); } catch (e) { console.error('lichtregie', e); } }
    return r;
  };

  // --- meten (elke frame) ---
  function meet(dt) {
    const kf = 1 - Math.exp(-dt / 0.6), ks = 1 - Math.exp(-dt / 8);
    const held = REG.stand === 'break' || REG.stand === 'opbouw';
    for (let k = 0; k < 3; k++) {
      const b = bands[k], a = b.v * b.max;  // ≈ ruw niveau
      if (held) { ref[k] = Math.max(a, ref[k] - dt * 0.003, 0.02); bN[k] = Math.min(1.2, a / ref[k]); }
      else { ref[k] = b.max; bN[k] = b.v; }
      bF[k] += (bN[k] - bF[k]) * kf;
      bS[k] += (bN[k] - bS[k]) * ks;
      aF[k] += (a - aF[k]) * kf;
    }
    // energie zoals de kern hem rekent, maar met de bevroren bas (anders kruipt hij in een lange break weer omhoog)
    const eD = held ? Math.max(0, Math.min(1, energy + 0.6 * Math.min(1, S.sens + 0.2) * (bN[0] - bands[0].v))) : energy;
    eF += (eD - eF) * kf;
    eS += (eD - eS) * ks;
    // nieuw nummer na stilte
    if (live) {
      if (eF < 0.1) stil += dt;
      else if (eF > 0.15) { if (stil > 1.5) newTrack(performance.now() / 1000); stil = 0; }
    }
  }
  function newTrack(now) {
    if (now - lastTrackT < 20) return;
    lastTrackT = now;
    trackPair = pickOther(FASE_PAL[fase], trackPair);
    trackCue = pick(TRACK_CUES);
    trackStrobe = pick(['vaker', 'normaal', 'minder']);
    if (REG.stand === 'groove' && !cue.white) setPal(trackPair);
  }
  function updateFase(now) {
    if (now - faseCheck < 15) return;
    faseCheck = now;
    const h = new Date().getHours();
    let f;
    if (h >= 21 && h < 23) f = 'deuren';
    else if (h >= 23 || h < 2) f = 'piek';
    else if (h < 4) f = 'diep';
    else if (h < 6) f = 'ochtend';
    else f = FASEN[Math.floor((now - T0) / 1200) % 4];  // overdag: zelfde cyclus op looptijd, 20 min per fase
    if (f === fase) return;
    fase = f;
    REG.fase = f;
    trackPair = pick(FASE_PAL[f]);
    if (REG.stand === 'groove' && !cue.white) setPal(trackPair);
  }

  // drop: publiek (startMoment) en licht op dezelfde tel
  function dropNu(tb) {  // tb als bij de kern: de echte beatPos
    // een echte drop gaat vóór een los solo-/paar-moment of een boer van de slak; alleen niet twee drops binnen 16 tellen
    if (ACTS.Cheer_with_Both_Hands_Up && tb - lastDropMoment >= 16) {
      try { startMoment('drop', tb); } catch (e) { console.error('lichtregie', e); }
    }
    if (REG.stand !== 'drop') startDropLook(tb);  // geen publieksmoment mogelijk: dan alleen het licht
  }

  // --- beslissen (elke tel) ---
  function decide(beat, now) {
    const hi8 = hiHist[(beat - 8) & 15], mid8 = midHist[(beat - 8) & 15];
    hiHist[beat & 15] = aF[2]; midHist[beat & 15] = aF[1];
    // nieuw nummer: tempo verspringt > 7% en blijft 4 tellen stabiel
    if (live && eF > 0.1) {
      if (Math.abs(period - refPeriod) / refPeriod > 0.07) {
        if (tempoRun && Math.abs(period - candPeriod) / candPeriod < 0.04) tempoRun++; else { candPeriod = period; tempoRun = 1; }
        if (tempoRun >= 4) { refPeriod = period; tempoRun = 0; newTrack(now); }
      } else { tempoRun = 0; refPeriod += (period - refPeriod) * 0.1; }
    }
    const st = REG.stand;
    if (st === 'drop') return;  // de drop loopt 16 tellen (lookDrop)
    if (!live || eF < 0.08) { if (st !== 'groove') setStand('groove'); breakRun = 0; return; }
    if (st === 'groove') {
      // mid of hoog moet doorspelen: anders is het stilte tussen twee nummers, geen break
      const weg = (bF[0] < 0.45 * bS[0] || bF[0] < 0.18) && eF < eS - 0.1 && Math.max(bF[1], bF[2]) > 0.2;
      breakRun = weg ? breakRun + 1 : 0;
      if (breakRun >= 4) {
        breakFirst = beat - breakRun + 1; grooveBass = Math.max(bS[0], 0.25); grooveE = eS;
        breakBassSum = 0; breakBassN = 0; riseRun = 0; backRun = 0;
        setStand('break');
      }
      return;
    }
    // break of opbouw: komt de bas hard terug na minstens 8 tellen, dan is het de drop
    // (drempels 0,55 en +0,15, maar lager als de groove zelf minder bas/energie had)
    const lang = beat - breakFirst, breakBass = breakBassN ? breakBassSum / breakBassN : bF[0], weak = Math.max(0.6 * grooveBass, 0.2);
    if (lang >= 8 && bF[0] > Math.min(0.55, 0.8 * grooveBass) && bF[0] > 2 * breakBass && eF > eS + Math.min(0.15, Math.max(0.05, 0.5 * (grooveE - eS)))) {
      dropNu(Math.floor(beatPos));
      return;
    }
    // bas komt terug zonder drop, of het duurt te lang: weer groove
    backRun = bF[0] > weak ? backRun + 1 : 0;
    if (backRun >= 4 || lang > 96 || (st === 'opbouw' && beatPos - buildStart > 32)) { setStand('groove'); return; }
    breakBassSum += bF[0]; breakBassN++;
    if (st === 'break') {  // mid en hoog lopen op terwijl de bas weg blijft: opbouw
      const stijgt = (aF[2] - hi8) / ref[2] > 0.08 && (aF[1] - mid8) / ref[1] > -0.02 && bF[0] < weak;
      riseRun = stijgt ? riseRun + 1 : 0;
      if (riseRun >= 2) { buildStart = beat; setStand('opbouw'); }
    }
  }

  // --- looks ---
  function lookBreak(dt) {
    setCue(BREAK_CUE); setPal(BREAK_PAL);
    myAmb = 0.12; myBloom = 0.5;
    // alle heads smal en wit op de spiegelbol
    const k = 1 - Math.exp(-dt * 1.8);
    heads.forEach((h, i) => {
      own[i].lerp(ballPos, k);
      h.cur.copy(own[i]);
      h.beam.aim(h.cur);
      const u = h.beam.mat.uniforms;
      u.color.value.lerp(white, 0.3 * wBreak);  // de kern trekt elke frame 15% naar het palet: 0,3 houdt ze ~75% wit
      u.strength.value += (0.35 * (0.85 + 0.3 * bands[2].v) - u.strength.value) * wBreak;
      h.lens.material.color.copy(u.color.value);
    });
  }
  function lookBuild(dt) {
    const kb = Math.max(0, beatPos - buildStart), u = Math.min(1, kb / 16);
    REG.opbouwTel = Math.floor(kb);
    // stand loopt op van break naar bijna alles
    BUILD_CUE.spots = 0.12 + 0.45 * u; BUILD_CUE.heads = 0.9 + 0.4 * u; BUILD_CUE.floor = 0.12 + 0.4 * u;
    BUILD_CUE.flecks = 1.7 - u; BUILD_CUE.wash = 0.1 + 0.4 * u;
    setCue(BUILD_CUE);
    setPal(kb >= 8 ? WHITE_PAL : BREAK_PAL);
    // flitsen op de tel, steeds sneller: 1, 2, 4, 8 per tel
    let on = 0;
    if (S.strobe !== 'uit') {
      const n = kb < 8 ? 1 : kb < 12 ? 2 : kb < 16 ? 4 : 8;
      if ((beatPos * n) % 1 < 0.25) on = 1;
    }
    flits(on * 5);
    myAmb = 0.12 + 0.2 * u; myBloom = 0.5 + 0.4 * u + 0.25 * on;
    // heads trekken naar het midden en kantelen omhoog
    const k = 1 - Math.exp(-dt * 4);
    heads.forEach((h, i) => {
      doel.set(h.base.x * 0.2, 6.5 * u, h.base.z * 0.2);
      own[i].lerp(doel, k);
      h.cur.copy(own[i]);
      h.beam.aim(h.cur);
    });
  }
  function lookDrop(dt, now) {
    const t = now - dropT, kb = beatPos - REG.dropBeat;
    setCue(ALLES); setPal(dropPal);
    // blinder die uitdooft, plus de eerste 4 tellen een korte flits per tel
    let I = 12 * Math.exp(-t / 0.13);
    if (S.strobe === 'uit') I = Math.min(4, I);
    else if (kb < 4 && beatPos % 1 < 0.15) I = Math.max(I, 5);
    if (kb < 4) geenSalvo(now);
    if (I > 0.02) flits(I);
    if (bloom) bloom.strength += 1.2 * Math.exp(-t / 0.17) * zf();
    // heads in de snelle waaier
    const k = 1 - Math.exp(-dt * 9);
    heads.forEach((h, i) => {
      own[i].lerp(headTarget(h, i, 4, now), k);
      h.cur.copy(own[i]);
      h.beam.aim(h.cur);
    });
  }
  function lookGroove(now) {
    // cue-wissel (nextCue op beat%16, of een ander bestand): palet uit de fase, voorkeur-cue van het nummer
    if (cue !== seenCue) {
      const prev = seenCue, kernPal = palTarget !== seenPal;
      if (!cue.white) {
        if (fase === 'diep' && HEADS && LASERS && Math.random() < 0.5) cue = prev === LASERS ? HEADS : prev === HEADS ? LASERS : pick([LASERS, HEADS]);
        else if (trackCue && trackCue !== prev && Math.random() < 0.5) cue = trackCue;
      }
      if (!cue.white && (kernPal || palTarget === WHITE_PAL || !FASE_PAL[fase].includes(palTarget))) {
        palTarget = Math.random() < 0.6 ? trackPair : pickOther(FASE_PAL[fase], palTarget);
      }
      seenCue = cue; seenPal = palTarget;
    } else if (palTarget !== seenPal) seenPal = palTarget;
    // stroboscoop per fase en per nummer
    if (S.strobe === 'uit') return;
    let skip = fase === 'deuren' ? 0.5 : 0;
    if (trackStrobe === 'minder') skip = 1 - (1 - skip) * 0.6;
    // een salvo dat eraan komt vooraf overslaan (achteraf annuleren geeft een frame met gedimd licht)
    if (skip > 0 && nextStrobe !== rolledFor && nextStrobe - now < 0.15 && strobeUntil < now) {
      // overgeslagen: het volgende salvo krijgt opnieuw een kans; anders dit salvo niet nog eens loten
      if (Math.random() < skip) nextStrobe += S.strobe === 'vaak' ? rnd(10, 22) : rnd(25, 55);
      else rolledFor = nextStrobe;
    }
    const maxWait = fase === 'piek' ? 15 : trackStrobe === 'vaker' ? 20 : 0;
    if (maxWait && strobeUntil < now && nextStrobe > now + maxWait) nextStrobe = now + rnd(maxWait - 7, maxWait);
  }

  // spots: in break en opbouw eigen, tragere zwaai (opbouw versnelt); vloeiend in en uit
  function spotsSlow(dt, now) {
    const want = REG.stand === 'break' || REG.stand === 'opbouw' ? 1 : 0;
    if (want && spotW === 0) for (let i = 0; i < spots.length; i++) { sAng[i] = now * (0.5 + 0.13 * i) + i * 1.7; sRad[i] = now * 0.31 + i; }
    spotW = want ? Math.min(1, spotW + dt * 1.2) : Math.max(0, spotW - dt * 1.2);
    if (spotW <= 0) return;
    const sp = REG.stand === 'opbouw' ? 1 / 3 + (1.5 - 1 / 3) * Math.min(1, (beatPos - buildStart) / 16) : 1 / 3;
    spots.forEach((s, i) => {
      sAng[i] += dt * (0.5 + 0.13 * i) * sp;
      sRad[i] += dt * 0.31 * sp;
      const r = 3 + 2 * Math.sin(sRad[i]);
      doel.set(r * Math.cos(sAng[i]), 0, r * Math.sin(sAng[i]));
      s.light.target.position.lerp(doel, spotW);
      s.beam.aim(s.light.target.position);
    });
  }
  // heads smaller in break en opbouw
  function beamWidth(dt) {
    const want = REG.stand === 'break' || REG.stand === 'opbouw' ? 0.5 : 1;
    if (narrow === 1 && want === 1) return;
    narrow += (want - narrow) * (1 - Math.exp(-dt * 3));
    if (want === 1 && narrow > 0.995) narrow = 1;
    for (const h of heads) h.beam.g.scale.set(narrow, 1, narrow);
  }
  // CO2-jets: 1,5 s twee witte zuilen recht omhoog naast de dj
  function emit(side) {
    let p = null;
    for (const q of jet) if (!q.sp.visible) { p = q; break; }
    if (!p) return;
    p.sp.visible = true; p.age = 0; p.life = rnd(0.75, 0.95);
    p.sp.position.set(side * 4.2 + rnd(-0.06, 0.06), 0.3, -6.6 + rnd(-0.06, 0.06));
    p.v.set(rnd(-0.5, 0.5), rnd(6.5, 7.5), rnd(-0.5, 0.5));
    p.sp.material.rotation = rnd(0, TAU);
    jetsAlive++;
  }
  function jets(dt, now) {
    if (now < jetUntil) {
      jetAcc += dt * 15;
      while (jetAcc >= 1) { jetAcc -= 1; emit(-1); emit(1); }
    } else jetAcc = 0;
    if (!jetsAlive) return;
    jetCol.setScalar(0.6).lerp(pal[0], 0.25).multiplyScalar(2.4);  // rooktextuur is erg doorzichtig: x2,4 om als witte zuil te lezen
    jetsAlive = 0;
    for (const p of jet) {
      if (!p.sp.visible) continue;
      p.age += dt;
      const u = p.age / p.life;
      if (u >= 1) { p.sp.visible = false; continue; }
      jetsAlive++;
      p.v.y *= Math.exp(-dt * 0.6);
      const pos = p.sp.position, fan = 0.4 + 2 * u;  // uitwaaieren naarmate hij hoger komt
      pos.x += p.v.x * dt * fan; pos.z += p.v.z * dt * fan; pos.y += p.v.y * dt;
      const s = 0.4 + 1.6 * Math.pow(u, 0.7);
      p.sp.scale.set(s, s * 1.4, 1);
      p.sp.material.opacity = Math.pow(1 - u, 1.5);
      p.sp.material.color.copy(jetCol);
    }
  }

  updateFase(T0);  // fase meteen goed, ook vóór de eerste frame
  clubHooks.push((dt, now) => {
    updateFase(now);
    meet(dt);
    // na 8+ tellen opbouw is de eerste harde bas-aanslag de drop: meteen, niet pas een tel later (bevroren bas, dus geen ruis)
    if (REG.stand === 'opbouw' && live && pulse > 0.8 && bN[0] > 0.7 && beatPos - buildStart >= 8) dropNu(beatPos);
    const beat = Math.floor(beatPos);
    if (beat !== lastBeat) { lastBeat = beat; decide(beat, now); }
    if (REG.stand === 'drop' && beatPos - REG.dropBeat >= 16) setStand('groove');
    const st = REG.stand, held = st === 'break' || st === 'opbouw';
    wBreak = held ? Math.min(1, wBreak + dt) : Math.max(0, wBreak - dt);
    if (held) geenSalvo(now);
    if (st === 'break') lookBreak(dt);
    else if (st === 'opbouw') lookBuild(dt);
    else if (st === 'drop') lookDrop(dt, now);
    else lookGroove(now);
    // ambient en bloom vloeiend naar de break-/opbouwstand en terug
    if (wBreak > 0) {
      ambient.intensity += (myAmb - ambient.intensity) * wBreak;
      if (bloom) bloom.strength += (myBloom * zf() - bloom.strength) * wBreak;
    }
    spotsSlow(dt, now);
    beamWidth(dt);
    jets(dt, now);
  });
})();

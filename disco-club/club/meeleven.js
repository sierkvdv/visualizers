// Randpubliek leeft mee: knikken op de tel, wiegen op de bas, vuistpompen aan de bar,
// en bij een drop of YMCA golft het moment door de hele zaal (bar, wc-rij, hoeken, lounge, lopers, wormpjes).
// Alles bovenop de clip. De mixer schrijft een bot alleen als de clipwaarde verandert: clean() zet daarom eerst de schone stand terug.
(() => {
  if (window.clubPubliek) return;  // maar één keer laden (anders dubbel knikken en twee wrappers)
  const UP = new THREE.Vector3(0, 1, 0);
  const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vD = new THREE.Vector3(), vT = new THREE.Vector3(), vAx = new THREE.Vector3(), vF = new THREE.Vector3();
  const qW = new THREE.Quaternion(), qS = new THREE.Quaternion(), qD = new THREE.Quaternion(), qI = new THREE.Quaternion();
  const mP = new THREE.Matrix4(), mI = new THREE.Matrix4(), mR = new THREE.Matrix4();
  const cache = new WeakMap();
  const fr = x => x - Math.floor(x);
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  const beatsOf = c => c.beats || Math.max(1, Math.round(c.duration * 2));
  const pub = window.clubPubliek = { golf: null, totBeat: 0 };  // barman.js laat de bar-gasten met rust zolang golf gezet is

  // botten en eigen karakter per figuur (eenmalig; na rebuildAll zijn het nieuwe figuren)
  function info(d) {
    let s = cache.get(d);
    if (s) return s;
    const b = {};
    d.body.traverse(o => { if (o.isBone && !b[o.name]) b[o.name] = o; });
    s = { head: b.Head, neck: b.neck, spine: b.Spine02, rArm: b.RightArm, rFore: b.RightForeArm, lArm: b.LeftArm, lFore: b.LeftForeArm,
          rSh: b.RightShoulder, lSh: b.LeftShoulder, k: rnd(0.5, 1.2), late: Math.random() < 0.5, ph: Math.random() < 0.5 ? 0 : Math.PI,
          nod: 0, pump: 0, pumpOn: 0, gid: 0 };
    // per bot: schone stand (van de mixer) en wat wij er zelf van maakten
    s.keep = [s.head, s.neck, s.spine, s.rArm, s.lArm, s.rSh, s.lSh].filter(Boolean).map(bone => ({ bone, base: bone.quaternion.clone(), mine: bone.quaternion.clone() }));
    cache.set(d, s);
    return s;
  }
  // De mixer schrijft een bot alleen als de clipwaarde veranderd is (PropertyMixer.apply). Staat er nog precies
  // onze eigen stand, dan heeft hij niet geschreven: eerst de schone stand terugzetten, anders stapelt de knik op.
  function clean(s) {
    for (const k of s.keep) {
      if (k.bone.quaternion.equals(k.mine)) k.bone.quaternion.copy(k.base);
      k.base.copy(k.bone.quaternion); k.mine.copy(k.base);
    }
  }
  function remember(s) { for (const k of s.keep) k.mine.copy(k.bone.quaternion); }

  // draaiing q in wereldruimte om het eigen scharnier van het bot, omgezet naar lokaal.
  // Via de volledige oudermatrix: werkt ook bij gespiegelde figuren (schaal -1 en de 0,01 van het skelet vallen weg).
  function turnWorld(bone, q) {
    mP.copy(bone.parent.matrixWorld).setPosition(0, 0, 0);
    mI.copy(mP).invert();
    mR.makeRotationFromQuaternion(q);
    mI.multiply(mR).multiply(mP);
    qD.setFromRotationMatrix(mI);
    bone.quaternion.premultiply(qD);
  }
  // knikken: om de zij-as van de figuur, positief = kin omlaag
  function nodBone(bone, ry, ang) {
    if (!bone || Math.abs(ang) < 1e-3) return;
    vAx.set(Math.cos(ry), 0, -Math.sin(ry));
    qW.setFromAxisAngle(vAx, ang);
    turnWorld(bone, qW);
  }
  // doelrichting voor een arm: u omhoog, f naar voren, o naar buiten (de kant waar die arm zit, ook als gespiegeld)
  function armDir(d, arm, u, f, o) {
    const ry = d.root.rotation.y, sx = Math.sin(ry), cx = Math.cos(ry), p = d.root.position;
    vA.setFromMatrixPosition(arm.matrixWorld);
    const side = Math.sign((vA.x - p.x) * cx - (vA.z - p.z) * sx) || 1;
    return vT.set(f * sx + o * side * cx, u, f * cx - o * side * sx).normalize();
  }
  // bovenarm zo draaien dat schouder->elleboog naar dir wijst, met gewicht w
  function aim(d, arm, fore, u, f, o, w) {
    if (!arm || !fore || w < 0.01) return;
    const dir = armDir(d, arm, u, f, o);
    vA.setFromMatrixPosition(arm.matrixWorld); vB.setFromMatrixPosition(fore.matrixWorld);
    vD.subVectors(vB, vA);
    if (vD.lengthSq() < 1e-12) return;
    vD.normalize();
    qW.setFromUnitVectors(vD, dir);
    qS.copy(qI).slerp(qW, Math.min(1, w));
    turnWorld(arm, qS);
  }
  // schouder optrekken (bot richting omhoog kantelen)
  function lift(bone, child, ang) {
    if (!bone || !child || Math.abs(ang) < 1e-3) return;
    vA.setFromMatrixPosition(bone.matrixWorld); vB.setFromMatrixPosition(child.matrixWorld);
    vD.subVectors(vB, vA); vAx.crossVectors(vD, UP);
    if (vAx.lengthSq() < 1e-14) return;
    vAx.normalize(); qW.setFromAxisAngle(vAx, ang);
    turnWorld(bone, qW);
  }

  // --- golven: drop en YMCA lopen door de hele zaal ---
  let G = null, gid = 0;
  const eligible = d => d && d.type === 'model' && d.root.parent && poleDancers.indexOf(d) < 0;
  const standingCrowd = d => eligible(d) && d.acts && d.yOff === undefined && d.home.x <= 12.5;  // achter de bar = barman.js
  const isBar = d => standingCrowd(d) && d.home.x > 10.4 && Math.abs(d.home.z) < 4.6;  // langs de toog, niet de hoek bij de speakers
  const loungeCrowd = d => eligible(d) && d.acts && d.yOff !== undefined;
  const waitWalker = w => eligible(w) && w.state === 'wait' && w.acts && !(w.poi && w.poi.dance) && w.root.visible;
  const walkWalker = w => eligible(w) && w.state === 'walk' && !(w.poi && w.poi.dance) && w.root.visible;
  const toDj = (x, z) => Math.atan2(-x, -8.5 - z);

  function golf(kind, tb) {
    if (kind !== 'drop' && kind !== 'ymca') return;  // solo/paar: alleen knikken
    const CH = ACTS.Cheer_with_Both_Hands_Up, JU = ACTS.Happy_jump_f, YM = ACTS.ymca_dance;
    if (kind === 'drop' ? !CH || !JU : !YM) return;
    if (typeof tb !== 'number' || !isFinite(tb)) tb = beatPos;  // console of wrapper zonder tel: anders NaN-tijden en onzichtbare figuren
    if (G) stopGolf();
    const b0 = Math.floor(tb), first = kind === 'drop' ? CH : YM;
    G = { kind, tb, end: b0 + 16, half: b0 + 8, phase: 0, jStart: 0, t0: performance.now() / 1000, id: ++gid, parts: [] };
    const join = (d, p) => { info(d).gid = G.id; info(d).pumpOn = 0; p.d = d; G.parts.push(p); return p; };
    for (const d of crowd) {
      if (loungeCrowd(d)) { if (kind === 'drop') join(d, { role: 'sit' }); continue; }  // lounge blijft zitten
      if (!standingCrowd(d)) continue;
      join(d, { role: 'stand', face: d.face, faceT: d.faceT });
      d.actT = 1e9; setClip(d, first, 0.3);
      if (kind === 'ymca') d.faceT = toDj(d.home.x, d.home.z);
    }
    for (const w of walkers) {
      if (waitWalker(w)) {
        join(w, { role: 'stand', walker: true, face: w.root.rotation.y, faceT: w.faceT });
        w.actT = 1e9; w.wait = Math.max(w.wait, 0.5); setClip(w, first, 0.3);
        if (kind === 'ymca') w.faceT = toDj(w.root.position.x, w.root.position.z);
      } else if (kind === 'drop' && walkWalker(w)) {  // stilstaan en 8 tellen springen, daarna verder lopen
        join(w, { role: 'walk', x: w.root.position.x, z: w.root.position.z, ry: w.root.rotation.y });
        setClip(w, JU, 0.3);
      }
    }
    for (const w of worms) {
      if (!eligible(w)) continue;
      join(w, { role: 'worm', ry: w.root.rotation.y });
      w.state = 'feest'; w.actT = 1e9; w.until = 1e9;  // updateWorms valt dan in de chill-tak zonder clipwissel
      setClip(w, first, 0.3);
    }
    pub.golf = kind; pub.totBeat = G.end;
  }
  function stopGolf() {
    const g = G; G = null;
    pub.golf = null; pub.totBeat = 0;
    for (const p of g.parts) {
      const d = p.d;
      if (!d.root.parent || p.done) continue;
      if (p.role === 'stand') { d.actT = 0; if (g.kind === 'ymca') d.faceT = p.faceT !== undefined ? p.faceT : p.face; }
      else if (p.role === 'walk' && d.state === 'walk') setClip(d, d.walkClip, 0.4);
      else if (p.role === 'worm') { d.state = 'run'; d.until = rnd(14, 24); d.acts = null; d.actT = 0; }
    }
  }
  // tijd in de clip: YMCA gelijk met een vloerdanser, anders op de tel vanaf het begin van het moment
  function clipTime(clip, start, fromFloor) {
    if (fromFloor) for (const d of dancers) if (d.type === 'model' && !d.acts && d.cur && d.cur.getClip() === clip) return d.cur.time;
    const u = Math.max(0, beatPos - start) / beatsOf(clip);
    return fr(u) * clip.duration;
  }
  function runGolf(dt, now) {
    const tb = beatPos;
    if (tb >= G.end || tb < G.tb - 1 || now - G.t0 > 45) return stopGolf();
    const drop = G.kind === 'drop', JU = ACTS.Happy_jump_f;
    if (drop && G.phase === 0 && tb >= G.half) {  // na 8 tellen juichen: springen; lopers lopen weer door
      G.phase = 1; G.jStart = tb;
      for (const p of G.parts) if (p.role === 'walk' && !p.done) { p.done = true; if (p.d.root.parent && p.d.state === 'walk') setClip(p.d, p.d.walkClip, 0.4); }
    }
    const clip = drop ? (G.phase ? JU : ACTS.Cheer_with_Both_Hands_Up) : ACTS.ymca_dance;
    const t = clipTime(clip, drop && G.phase ? G.jStart : G.tb, !drop), tJump = drop ? clipTime(JU, G.tb, false) : 0;
    const c = slug ? slug.root.position : null, kk = Math.min(1, dt * 3);
    for (const p of G.parts) {
      const d = p.d;
      if (p.done || p.role === 'sit' || !d.root.parent) continue;
      let cl = clip, ct = t;
      if (p.role === 'walk') {  // op de plek houden (updateWalkers schuift anders door)
        if (d.state !== 'walk') { p.done = true; continue; }
        d.root.position.x = p.x; d.root.position.z = p.z; d.root.rotation.y = p.ry;
        cl = JU; ct = tJump;
      } else if (p.role === 'stand') {
        if (p.walker && d.state !== 'wait') { p.done = true; continue; }
        if (p.walker) d.wait = Math.max(d.wait, 0.5);  // niet midden in het moment weglopen
        d.actT = 1e9;
      } else {  // wormpje: feest in een kring om de baas, gezicht naar de slak (drop) of de dj (YMCA)
        d.state = 'feest'; d.actT = 1e9; d.until = 1e9;
        const q = d.root.position;
        if (c) { q.x += (c.x + Math.cos(d.angle) * 2.4 - q.x) * Math.min(1, dt * 2); q.z += (c.z + Math.sin(d.angle) * 2.4 - q.z) * Math.min(1, dt * 2); }
        const want = drop ? (c ? Math.atan2(c.x - q.x, c.z - q.z) : p.ry) : toDj(q.x, q.z);
        p.ry += wrap(want - p.ry) * kk;
        d.root.rotation.y = p.ry;
      }
      if (!d.cur || d.cur.getClip() !== cl) setClip(d, cl, 0.3);
      d.cur.time = ct;
      d.mixer.update(0);
    }
  }
  // veilig ketenen met lichtregie.js, ledwand.js en regie-momenten.js: altijd eerst het origineel
  const orig = startMoment;
  startMoment = function (k, tb) {
    const r = orig.apply(this, arguments);
    try { golf(k, tb); } catch (e) { console.error('club-hook', e); }
    return r;
  };

  // --- vuistpompen: bij hoge energie steeds 1-2 bar-gasten, nooit iedereen ---
  function pickPumpers() {
    let n = 0, cand = 0;
    for (const d of crowd) {
      if (!isBar(d)) continue;
      const s = info(d); cand++;
      if (s.pumpOn > 0) s.pumpOn--;
      if (s.pumpOn > 0) n++;
    }
    const max = Math.min(2, cand - 1);
    if (G || energy <= 0.65 || n >= max || Math.random() > (n ? 0.25 : 0.85)) return;
    let k = Math.floor(Math.random() * (cand - n));
    for (const d of crowd) {
      if (!isBar(d)) continue;
      const s = info(d);
      if (s.pumpOn > 0) continue;
      if (k-- === 0) { s.pumpOn = pick([4, 6, 8]); break; }
    }
  }

  // --- het meeleven zelf, per figuur ---
  // mode: stand (staand publiek), sit (lounge: hoofd en schouders), walk (lopers), worm
  function groove(d, mode, bar, dt, pLate) {
    if (!d.root.visible) return;
    const opt = window.clubOpt && clubOpt.anim;  // optimaliseer.js laadt na dit script
    if (opt && opt.stil && opt.stil(d)) return;  // clip dit beeld niet bijgewerkt (buiten beeld of klein): dan ook niets erbovenop
    const s = info(d), E = energy, inG = G && s.gid === G.id;
    clean(s);
    s.nod += ((s.late ? pLate : pulse) - s.nod) * Math.min(1, dt * 22);  // korte aanzet: knik óp de tel, geen schok
    const pl = s.nod;
    let nodK = mode === 'walk' ? 0.6 : mode === 'worm' ? 1.3 : 1, up = 0, pump = 0;
    if (bar) { s.pump += ((s.pumpOn > 0 && !G ? 1 : 0) - s.pump) * Math.min(1, dt * 5); pump = s.pump; nodK *= 1 + 0.5 * pump; }
    if (inG && mode === 'sit') {  // drop in de lounge: blijven zitten, armen de lucht in, hard knikken
      nodK = 2.2;
      up = Math.max(0, Math.min(1, (beatPos - G.tb) * 1.5, G.end - beatPos));
    } else if (inG) nodK *= 0.6;
    const ang = 0.2 * pl * E * s.k * nodK;
    const swing = (mode === 'stand' || mode === 'worm') && !inG;
    const sway = swing ? 0.06 * Math.cos(Math.PI * beatPos + s.ph) * (0.35 + 0.65 * bands[0].v) * E * s.k * (mode === 'worm' ? 1.5 : 1) : 0;
    const dip = swing ? 0.05 * pl * E * s.k : 0;
    const shrug = mode === 'sit' && !up ? 0.12 * pl * E * s.k : 0;
    if (ang < 0.003 && up < 0.01 && pump < 0.01 && Math.abs(sway) < 0.003 && shrug < 0.003) return;
    d.root.updateMatrixWorld(true);  // botten van deze frame (na mixer.update) meten
    const ry = d.root.rotation.y;
    // kinderen vóór ouders: elk bot draait met de nog niet aangepaste oudermatrix
    if (s.head && s.neck) { nodBone(s.head, ry, ang * 0.6); nodBone(s.neck, ry, ang * 0.4); }
    else nodBone(s.head || s.neck, ry, ang);
    if (up > 0.01) {
      const ph2 = G.phase === 1, wave = 0.15 * Math.sin(Math.PI * beatPos);
      const u = ph2 ? 0.75 + 0.35 * pl : 1, f = ph2 ? 0.35 - 0.15 * pl : 0.2, o = ph2 ? 0.35 : 0.45 + wave;
      aim(d, s.rArm, s.rFore, u, f, o, up);
      aim(d, s.lArm, s.lFore, u, f, o, up);
    }
    if (pump > 0.01) aim(d, s.rArm, s.rFore, 0.55 + 0.5 * pl, 0.55 - 0.25 * pl, 0.25, pump);  // glas zit links
    if (shrug) { lift(s.rSh, s.rArm, shrug); lift(s.lSh, s.lArm, shrug); }
    if (s.spine && (Math.abs(sway) > 0.002 || dip > 0.002)) {  // wiegen om de 2 tellen op de bas, lichte dip op de tel
      vF.set(Math.sin(ry), 0, Math.cos(ry)); qW.setFromAxisAngle(vF, sway);
      vAx.set(Math.cos(ry), 0, -Math.sin(ry)); qS.setFromAxisAngle(vAx, dip);
      qW.multiply(qS);
      turnWorld(s.spine, qW);
    }
    remember(s);
  }

  let lastBeat = -1;
  clubHooks.push((dt, now) => {
    if (G) runGolf(dt, now);
    const beat = Math.floor(beatPos);
    if (beat !== lastBeat) { lastBeat = beat; pickPumpers(); }
    const pLate = Math.exp(-5 * fr(beatPos + 0.5));  // de helft knikt een halve tel later
    for (const d of crowd) {
      if (loungeCrowd(d)) groove(d, 'sit', false, dt, pLate);
      else if (standingCrowd(d)) groove(d, 'stand', isBar(d), dt, pLate);
    }
    for (const w of walkers) {
      if (waitWalker(w)) groove(w, 'stand', false, dt, pLate);
      else if (walkWalker(w)) groove(w, 'walk', false, dt, pLate);
    }
    for (const w of worms) if (eligible(w)) groove(w, 'worm', false, dt, pLate);
  });
})();

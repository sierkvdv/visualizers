// --- Barman: schenkt in, doet fles-flair op de tel en zet af en toe een rondje vlammende shots ---
// De barman = het publiekslid achter de bar (home.x > 12.5); meeleven.js laat hem met rust.
// Bestelling: hij loopt over x 13 (d.home.z) naar een bar-gast, neemt op, schenkt in met zijn eigen fles
// (rechterarm via IK in wereldruimte, werkt ook bij gespiegelde figuren) en laat het glas over de toog glijden.
// Tussendoor, in sets (8 tellen flair, 8 tellen rust): fles opgooien op de tussentel en precies op de tel weer vangen, met een lichtspoor.
// Rondje: 16 tellen na een drop (of zo nu en dan bij energie) 8 shots, op de tellen aangestoken:
// blauwe vlammen die naar oranje kleuren, gasten juichen, drinken, vlammen doven met een rookpluimpje.
(() => {
  if (window.clubBarman) return;  // maar één keer laden (anders twee barmannen en een dubbele wrapper)
  const V3 = THREE.Vector3, UP = new V3(0, 1, 0);
  const BX = 13.0, LX = 12.8, TOP = 1.01, ROW_X = 12.15;  // looplijn, aansteeklijn, bovenkant toog, rij shots
  const ROW_Z = [0, 1, 2, 3, 4, 5, 6, 7].map(i => -1.75 + i * 0.5);
  const SS = 0.7, SH = TOP + 0.12 * SS;                     // schaal en bovenrand van een shotglaasje
  const PGS = 1.5, PG_TOP = TOP + 0.12 * PGS, PG_X = 12.55;  // schaal, bovenrand en startplek van het ingeschonken glas
  const GREEN = new THREE.Color(0x58ff7a);
  const golf = () => !!(window.clubPubliek && window.clubPubliek.golf);
  const isGuest = d => d.home && d.home.x >= 10.7 && d.home.x <= 11.1;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const sm = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  const bump = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));
  const turn = (a, b, k) => { let dr = b - a; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); return a + dr * k; };

  // eigen fles (CYL met hals); eigen kopie van het groene glas zodat hij bij het vangen kan oplichten
  const bMat = bottleMat[0].clone();
  const makeBottle = mat => { const g = new THREE.Group(); add(g, CYL, mat, [0, 0, 0], [0.036, 0.2, 0.036]); add(g, CYL, mat, [0, 0.14, 0], [0.013, 0.08, 0.013]); return g; };
  const NECK = 0.18;  // hals-tip boven het midden
  const bottle = makeBottle(bMat); bottle.visible = false; scene.add(bottle);
  // lichtspoor: drie vervagende kopieën achter de vliegende fles
  const ghosts = [0.42, 0.24, 0.12].map(o => { const m = additive(0x58ff7a, o); const g = makeBottle(m); g.visible = false; scene.add(g); return { g, m, o }; });
  // straal uit de flessenhals
  const jetMat = additive(pal[0], 0.85), jet = add(scene, CYL, jetMat); jet.visible = false;
  // het glas dat hij inschenkt en over de toog laat glijden
  const pgMat = glassMat.clone(), pdMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true });
  const pg = new THREE.Group(), pDrink = new THREE.Mesh(drinkGeo, pdMat);
  pg.add(new THREE.Mesh(glassGeo, pgMat), pDrink); pg.scale.setScalar(PGS); pg.visible = false; scene.add(pg);
  const PG = { on: false, s: -1, z0: 0, z1: 0, fill: 0, cust: null, served: false, col: new THREE.Color() };
  // 8 shotglaasjes met elk een vlammetje (additieve sprite)
  const shotLiq = new THREE.MeshBasicMaterial({ color: 0x2a1404 });
  const shots = ROW_Z.map((z, i) => {
    const g = new THREE.Group(), liq = new THREE.Mesh(drinkGeo, shotLiq);
    liq.position.y = -0.012; liq.scale.y = 0.8; g.add(new THREE.Mesh(glassGeo, glassMat), liq);
    g.position.set(ROW_X, TOP + 0.06 * SS, z); g.visible = false; scene.add(g);
    const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex[i % 3], color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    fl.visible = false; scene.add(fl);
    return { g, fl, z, i, set: 0, lit: -1, out: -1 };
  });
  // rookpluimpjes als een vlam dooft
  const smoke = [0, 1, 2, 3].map(i => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex[(i + 1) % 3], color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); sp.visible = false; scene.add(sp); return { sp, age: 0 }; });
  let smokeN = 0;
  // aansteker-vlammetje in zijn hand
  const lighter = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex[0], color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  lighter.visible = false; scene.add(lighter);
  // de enige lamp: al bij het laden in de scène (intensiteit 0), zodat er later geen shader-hapering komt
  const lamp = new THREE.PointLight(0x3a6bff, 0, 5, 1.5);
  lamp.position.set(12.1, 1.7, 0); scene.add(lamp);

  // toestand
  let B = null;  // { d, model, held, Hips, LeftArm, RightArm, RightForeArm, RightHand, k, handRight, keep }
  let mode = 'flair', mt = 0, cust = null, lastCust = null, nextOrder = 0, nextAuto = 0, roundAt = -1, want = false;
  let armW = 0, armKind = 'flair', flyCycle = -1, flying = false, flyH = 0.8, glow = 0, burning = 0, lastOutZ = -1;
  const R = { on: false, phase: '', b0: 0, L0: -1, dir: 1, arrived: false, beat: -1, bz: 0 };  // bz: waar zijn fles op de toog staat
  let seenDrop = -1;
  const vS = new V3(), vE = new V3(), vH = new V3(), E2 = new V3(), u = new V3(), sd = new V3(), pole = new V3(), a1 = new V3(), a2 = new V3();
  const la = new V3(), lb = new V3(), mInv = new THREE.Matrix4(), qa = new THREE.Quaternion(), qI = new THREE.Quaternion();
  const comp = new V3(), hipW = new V3(), handP = new V3(), fwd = new V3(), out = new V3(), T = new V3(), tv = new V3(), tip = new V3(), dirN = new V3(), fc = new THREE.Color(), avg = new THREE.Color();

  // --- barman zoeken (na rebuildAll is hij nieuw) ---
  function findBarman() {
    const d = crowd.find(c => c.home && c.home.x > 12.5 && c.root.parent);
    if (!d) return null;
    if (d.base !== undefined) d.base = undefined;  // pose zet de root op d.home; zonder base schuifelt hij niet zelf
    const b = { d, model: false, held: held.find(h => h.d === d) || null };  // zijn eigen glas (giveDrink): alleen tijdens een rondje
    if (d.type === 'model' && d.body) {
      d.body.traverse(o => { if (o.isBone && /^(Hips|LeftArm|RightArm|RightForeArm|RightHand)$/.test(o.name) && !b[o.name]) b[o.name] = o; });
      if (b.Hips && b.LeftArm && b.RightArm && b.RightForeArm && b.RightHand) {
        b.model = true;
        d.root.updateMatrixWorld(true);
        b.RightHand.getWorldScale(tv); b.k = Math.abs(tv.x) || 1;
        // zit het bot 'RightArm' echt rechts (gespiegeld: links)? bepaalt de looprichting bij het aansteken
        tv.setFromMatrixPosition(b.RightArm.matrixWorld).sub(tip.setFromMatrixPosition(b.LeftArm.matrixWorld));
        const r = d.root.rotation.y; b.handRight = Math.cos(r) * tv.x - Math.sin(r) * tv.z < 0;
        // de stand-clips schuiven de heupen ~0,4 m van de root: dat vangen we op, zodat zijn lijf op de looplijn staat
        comp.setFromMatrixPosition(b.Hips.matrixWorld).sub(d.root.position).setY(0);
        b.keep = [b.RightArm, b.RightForeArm].map(bone => ({ bone, base: bone.quaternion.clone(), mine: bone.quaternion.clone() }));
      }
    }
    return b;
  }
  function sync() {
    if (B && B.d.root.parent) return;
    B = findBarman();
    if (cust) guestRelease(cust, 0);  // halve bestelling: gast terug, glas toch laten glijden
    if (PG.on && PG.s < 0) PG.s = 0;
    flying = false; armW = 0; cust = null; mt = 0;
    mode = B && B.model && R.on ? 'round' : 'flair';
  }
  const setActs = (d, name) => { if (d.acts && d.acts.length === 1 && d.acts[0] === name) return; d.acts = [name]; d.actT = 0; };

  // --- bar-gasten: alleen als er geen golf is (afspraak met meeleven.js); daarna netjes terugzetten ---
  const saved = new Map();  // gast -> { acts, faceT, face, myActs, myFace, until }
  function guestSet(g, clip, faceT) {
    if (!g || golf() || g.type !== 'model' || !g.acts || !g.root.parent) return;
    let s = saved.get(g);
    if (!s) { s = { acts: g.acts, faceT: g.faceT, face: g.face }; saved.set(g, s); }
    if (clip) { s.myActs = g.acts = [clip]; g.actT = 0; }
    if (faceT !== undefined) s.myFace = g.faceT = faceT;
    s.until = Infinity;
  }
  const guestRelease = (g, at) => { const s = saved.get(g); if (s) s.until = at; };
  function updateGuests(now) {
    if (!saved.size || golf()) return;
    for (const [g, s] of saved) {
      if (!g.root.parent) { saved.delete(g); continue; }
      if (now < s.until) continue;
      {  // alleen terugzetten wat nog van ons is
        if (s.myActs && g.acts === s.myActs) { g.acts = s.acts; g.actT = 0; }
        if (s.myFace !== undefined && g.faceT === s.myFace) g.faceT = s.faceT !== undefined ? s.faceT : s.face;
      }
      saved.delete(g);
    }
  }
  function roundGuests(clip, turnTo) {
    for (const g of crowd) {
      if (!isGuest(g) || !g.root.parent) continue;
      const s = saved.get(g);
      if (s && s.myActs && g.acts === s.myActs && s.myActs[0] === clip) continue;
      guestSet(g, clip, turnTo ? Math.atan2(ROW_X - g.home.x, clamp(g.home.z, -1.75, 1.75) - g.home.z) : undefined);
    }
  }
  function pickCustomer() {
    const list = crowd.filter(g => isGuest(g) && g.root.parent && g.root.visible && g !== lastCust);
    return list.length ? pick(list) : null;
  }

  // --- rechterarm via twee-botten-IK in wereldruimte ---
  function aim(bone, from, to, w) {  // bot zo draaien (in de ruimte van zijn ouder) dat wereldrichting 'from' naar 'to' gaat
    mInv.copy(bone.parent.matrixWorld).invert();
    la.copy(from).transformDirection(mInv); lb.copy(to).transformDirection(mInv);
    qa.setFromUnitVectors(la, lb);
    if (w < 1) qa.slerp(qI, 1 - w);
    bone.quaternion.premultiply(qa);
    bone.updateMatrixWorld(true);
  }
  function reach(target, w) {  // bovenarm naar de elleboog, onderarm naar het doel; elleboog naar 'pole'
    const A = B.RightArm, F = B.RightForeArm, Hd = B.RightHand;
    vS.setFromMatrixPosition(A.matrixWorld); vE.setFromMatrixPosition(F.matrixWorld); vH.setFromMatrixPosition(Hd.matrixWorld);
    const a = vS.distanceTo(vE), b = vE.distanceTo(vH), dd = clamp(vS.distanceTo(target), Math.abs(a - b) + 1e-3, (a + b) * 0.995);
    u.subVectors(target, vS).normalize();
    sd.copy(pole).addScaledVector(u, -pole.dot(u));
    if (sd.lengthSq() < 1e-6) sd.set(0, -1, 0).addScaledVector(u, u.y);
    sd.normalize();
    const al = Math.acos(clamp((a * a + dd * dd - b * b) / (2 * a * dd), -1, 1));
    E2.copy(vS).addScaledVector(u, a * Math.cos(al)).addScaledVector(sd, a * Math.sin(al));
    aim(A, a1.subVectors(vE, vS), a2.subVectors(E2, vS), w);
    vE.setFromMatrixPosition(F.matrixWorld); vH.setFromMatrixPosition(Hd.matrixWorld);
    tv.copy(vS).addScaledVector(u, dd);
    aim(F, a1.subVectors(vH, vE), a2.subVectors(tv, vE), w);
  }
  const tilt = (obj, ang) => { dirN.copy(UP).multiplyScalar(Math.cos(ang)).addScaledVector(fwd, Math.sin(ang)); obj.quaternion.setFromUnitVectors(UP, dirN); };

  // --- het ingeschonken glas ---
  function startPour(z, c) {
    PG.on = true; PG.s = -1; PG.z0 = clamp(z, -4.3, 4.3); PG.z1 = c ? clamp(c.home.z, -4.3, 4.3) : PG.z0; PG.fill = 0; PG.cust = c; PG.served = false;
    PG.col.copy(pal[0]);  // kleur van de lichtshow van dit moment
    pg.visible = true; pg.position.set(PG_X, TOP + 0.06 * PGS, PG.z0); pgMat.opacity = glassMat.opacity; pdMat.opacity = 1;
  }
  function updatePG(dt, now) {
    if (!PG.on) return;
    if (PG.s >= 0) {  // glijden naar de gast, daarna pakt hij hem (vervaagt)
      PG.s += dt / 0.9;
      const k = 1 - (1 - Math.min(1, PG.s)) ** 3;
      pg.position.set(PG_X + (11.8 - PG_X) * k, TOP + 0.06 * PGS, PG.z0 + (PG.z1 - PG.z0) * k);
      if (PG.s >= 1 && !PG.served) { PG.served = true; if (PG.cust) { guestSet(PG.cust, 'Stand_and_Drink'); guestRelease(PG.cust, now + rnd(6, 9)); } }
      const fade = clamp(PG.s * 0.9 - 6, 0, 1);
      pgMat.opacity = glassMat.opacity * (1 - fade); pdMat.opacity = 1 - fade;
      if (fade >= 1) { PG.on = false; pg.visible = false; }
    }
    const f = Math.max(0.03, PG.fill);
    pDrink.scale.y = f; pDrink.position.y = -0.055 + 0.035 * f;
    pdMat.color.copy(PG.col).multiplyScalar(0.6 + 0.5 * PG.fill);
  }

  // --- de barman per frame ---
  function updateBarman(dt, now) {
    const d = B.d;
    mt += dt;
    let wantArm = 0, faceT = -Math.PI / 2, tx = BX;
    // flair-cyclus van 2 tellen: vangen op de tel (p = 0), opgooien op de tussentel (p = 0.5)
    const c2 = beatPos / 2, ci = Math.floor(c2), p = (c2 - ci) * 2;
    if (flying && ci !== flyCycle) { flying = false; glow = 1; }  // gevangen, precies op de tel
    if (mode === 'flair') {
      setActs(d, 'Stand_and_Chat');
      // flair in sets: 4 worpen in de eerste 8 tellen van elke 16 (arm een tel eerder omhoog), dan 8 tellen rust
      const bi = beatPos - 16 * Math.floor(beatPos / 16), inSet = energy > 0.1 && (bi < 8 || bi >= 15);
      armKind = 'flair'; wantArm = inSet || flying ? 1 : 0;
      if (!flying && p >= 0.5 && p < 1 && flyCycle !== ci) {
        flyCycle = ci;
        if (!want && inSet && bi < 7 && armW > 0.85) { flying = true; flyH = 0.4 + 0.8 * energy; }
      }
      if (!R.on && !want && !flying && !PG.on && now > nextOrder) {  // vorig glas eerst weg, anders springt het terug
        nextOrder = now + rnd(15, 30);
        cust = pickCustomer();
        if (cust) { lastCust = cust; mode = 'walk'; mt = 0; }
      }
    } else if (mode === 'walk' || mode === 'order' || mode === 'pour') {
      if (!cust || !cust.root.parent) { mode = 'flair'; cust = null; }
      else if (mode === 'walk') {
        const z = clamp(cust.home.z, -3.6, 3.6), dz = z - d.home.z;
        if (Math.abs(dz) < 0.05) { d.home.z = z; mode = 'order'; mt = 0; guestSet(cust, null, Math.atan2(BX - cust.home.x, z - cust.home.z)); }
        else { d.home.z += Math.sign(dz) * Math.min(Math.abs(dz), 1.05 * dt); setActs(d, 'Casual_Walk'); faceT = dz > 0 ? 0 : Math.PI; }
      } else if (mode === 'order') {  // bestelling opnemen
        setActs(d, 'Stand_and_Chat'); tx = LX;
        faceT = Math.atan2(cust.home.x - d.home.x, cust.home.z - d.home.z);
        if (mt > 2.2) { mode = 'pour'; mt = 0; startPour(d.home.z + lastOutZ * 0.14, cust); }
      } else {  // inschenken
        armKind = 'pour'; wantArm = mt < 2.3 ? 1 : 0; tx = LX;
        PG.fill = sm((mt - 0.75) / 1.3);
        if (mt > 2.9) { mode = 'flair'; mt = 0; PG.s = 0; cust = null; }
      }
    } else if (mode === 'round') {
      const z0 = R.dir > 0 ? ROW_Z[0] : ROW_Z[7], walkF = R.dir > 0 ? 0 : Math.PI;
      if (R.phase === 'set') {  // naar het begin van de rij; daar zet hij zijn fles naast zich neer
        tx = LX;
        const dz = z0 - d.home.z;
        if (Math.abs(dz) > 0.05) { d.home.z += Math.sign(dz) * Math.min(Math.abs(dz), 1.05 * dt); setActs(d, 'Casual_Walk'); faceT = dz > 0 ? 0 : Math.PI; R.arrived = false; }
        else { d.home.z = z0; R.arrived = true; R.bz = z0 - R.dir * 0.3; setActs(d, 'Stand_and_Chat'); faceT = walkF; }
      } else if (R.phase === 'light') {  // langs de rij lopen, op elke tel een glaasje aansteken
        tx = LX;
        const k = clamp(beatPos - R.L0, 0, 7);
        d.home.z += (z0 + R.dir * 0.5 * k - d.home.z) * Math.min(1, dt * 12);
        setActs(d, k < 7 ? 'Casual_Walk' : 'Stand_and_Chat'); faceT = walkF;
        armKind = 'light'; wantArm = 1;
      } else if (R.phase === 'burn') setActs(d, 'Cheer_with_Both_Hands_Up');
      else setActs(d, 'Stand_and_Drink');
    } else if (mode === 'fetch') {  // na het rondje: terug naar zijn fles op de toog
      const dz = R.bz - d.home.z;
      if (Math.abs(dz) > 0.05) { d.home.z += Math.sign(dz) * Math.min(Math.abs(dz), 1.05 * dt); setActs(d, 'Casual_Walk'); faceT = dz > 0 ? 0 : Math.PI; tx = LX; }
      else { d.home.z = R.bz; mode = 'flair'; mt = 0; }
    }
    // lopen en draaien (pose heeft deze frame al gezet; wij zetten de nieuwe plek meteen door)
    d.home.x += (tx - d.home.x) * Math.min(1, dt * 3);
    d.faceT = faceT;
    d.face = turn(d.face, faceT, Math.min(1, dt * 4));
    for (const q of B.keep) {  // de mixer schrijft een bot alleen als de clipwaarde verandert: anders onze stand eraf
      if (q.bone.quaternion.equals(q.mine)) q.bone.quaternion.copy(q.base);
      q.base.copy(q.bone.quaternion); q.mine.copy(q.base);
    }
    d.root.position.set(d.home.x - comp.x, d.yOff || 0, d.home.z - comp.z);
    d.root.rotation.set(0, d.face, 0);
    d.root.updateMatrixWorld(true);
    hipW.setFromMatrixPosition(B.Hips.matrixWorld);
    comp.x += (hipW.x - d.root.position.x - comp.x) * Math.min(1, dt * 6);
    comp.z += (hipW.z - d.root.position.z - comp.z) * Math.min(1, dt * 6);
    // richtingen van zijn lijf: voor, en de kant van zijn rechterarm
    fwd.set(Math.sin(d.face), 0, Math.cos(d.face));
    vS.setFromMatrixPosition(B.RightArm.matrixWorld);
    out.set(vS.x - hipW.x, 0, vS.z - hipW.z);
    out.addScaledVector(fwd, -out.dot(fwd));
    if (out.lengthSq() < 1e-6) out.set(fwd.z, 0, -fwd.x);
    out.normalize();
    if (mode !== 'pour') lastOutZ = Math.sign(out.z) || 1;
    // arm
    armW += (wantArm - armW) * Math.min(1, dt * 5);
    if (armW > 0.002) {
      pole.copy(out).multiplyScalar(0.6).addScaledVector(UP, -1).addScaledVector(fwd, -0.3);
      if (armKind === 'pour') {  // hand boven-achter het glas, zodat de hals er recht boven hangt
        T.set(PG_X, PG_TOP + 0.16, PG.z0).addScaledVector(fwd, -0.14);
      } else if (armKind === 'light') {  // arm uitgestoken naar het glaasje dat nu aan de beurt is
        T.set(ROW_X + 0.15, SH + 0.1, d.home.z + R.dir * 0.12);
      } else {  // flair: klaar voor de buik; duik bij het vangen, zwiep omhoog bij het opgooien
        T.copy(vS).addScaledVector(fwd, 0.3).addScaledVector(out, 0.03);
        let y = -0.02 - 0.07 * bump(p, 0.08, 0.09) - 0.05 * bump(p, 0.36, 0.08) + 0.09 * bump(p, 0.5, 0.06);
        if (flying) { const f = clamp((p - 0.5) / 1.5, 0, 1); y += 0.05 * sm(f * 3) * (1 - sm((f - 0.75) / 0.25)); }
        T.y += y;
      }
      reach(T, sm(armW));
    }
    for (const q of B.keep) q.mine.copy(q.bone.quaternion);
    // hand (handpalm, zoals updateHeld)
    handP.set(0, 0.07 / B.k, -0.055 / B.k); B.RightHand.localToWorld(handP);
    // fles
    bottle.visible = true;
    for (const g of ghosts) g.g.visible = false;
    jet.visible = false;
    glow = Math.max(0, glow - dt * 3);
    bMat.emissiveIntensity = 1 + 3.5 * glow;
    if (mode === 'fetch' || (mode === 'round' && (R.arrived || R.phase !== 'set'))) {  // neergezet op de toog, vóór het begin van de rij
      bottle.position.set(12.5, TOP + 0.1, R.bz); bottle.quaternion.identity();
    } else if (flying) {  // één slag rond, hoogte naar de energie, en een spoor van vervagende kopieën
      const f = clamp((p - 0.5) / 1.5, 0, 1);
      bottle.position.copy(handP).addScaledVector(UP, flyH * 4 * f * (1 - f)); tilt(bottle, TAU * f);
      ghosts.forEach((g, j) => {
        const fj = f - 0.055 * (j + 1);
        if (fj <= 0) return;
        g.g.visible = true; g.g.position.copy(handP).addScaledVector(UP, flyH * 4 * fj * (1 - fj)); tilt(g.g, TAU * fj);
        g.m.color.copy(GREEN).lerp(pal[0], 0.4); g.m.opacity = g.o * (0.6 + 0.4 * energy);
      });
    } else if (mode === 'pour') {  // kantelen en schenken
      const a = 2.25 * sm((mt - 0.3) / 0.5) * (1 - sm((mt - 2.0) / 0.4));
      bottle.position.copy(handP); tilt(bottle, a);
      if (a > 1.7 && mt > 0.6 && mt < 2.15) {  // dunne straal van de hals naar het glas
        tip.copy(handP).addScaledVector(dirN, NECK);
        tv.set(PG_X, PG_TOP - 0.03, PG.z0).sub(tip);
        const len = tv.length();
        if (len > 0.01) {
          jet.visible = true; jet.position.copy(tip).addScaledVector(tv, 0.5);
          jet.quaternion.setFromUnitVectors(UP, tv.divideScalar(len)); jet.scale.set(0.0045, len, 0.0045);
          jetMat.color.copy(pal[0]); jetMat.opacity = 0.65 + 0.3 * Math.sin(now * 40) ** 2;
        }
      }
    } else { bottle.position.copy(handP); bottle.quaternion.setFromAxisAngle(UP, d.face); }
    // aansteker
    lighter.visible = mode === 'round' && R.phase === 'light' && armW > 0.5;
    if (lighter.visible) {
      const fl = 0.8 + 0.2 * Math.sin(now * 31) * Math.sin(now * 17);
      lighter.position.copy(handP).add(tv.set(-0.06, 0.035, 0));
      lighter.scale.set(0.045 * fl, 0.075 * fl, 1);
      lighter.material.color.setRGB(1.6, 0.9, 0.35).multiplyScalar(fl);
    }
    // zijn eigen glas (updateHeld liep al): achter de bar weg, tijdens het rondje proost hij mee
    if (B.held) B.held.g.visible = d.root.visible && mode === 'round';
  }
  // geen 3D-figuur: alleen glazen, vlammen en lamp
  function updateSimple(dt, now) {
    mt += dt;
    bottle.visible = lighter.visible = jet.visible = false;
    for (const g of ghosts) g.g.visible = false;
    if (B && mode === 'flair' && !R.on && !want && !PG.on && now > nextOrder) {
      nextOrder = now + rnd(15, 30);
      const c = pickCustomer();
      if (c) { lastCust = c; mode = 'pour'; mt = 0; startPour(c.home.z, c); }
    } else if (mode === 'pour') { PG.fill = sm(mt / 1.6); if (mt > 2) { mode = 'flair'; PG.s = 0; } }
    else if (mode !== 'flair') mode = 'flair';
  }

  // --- rondje shots ---
  const orderIdx = n => R.dir > 0 ? n : 7 - n;  // n-de glaasje in de aansteekvolgorde
  function startRound(now) {
    R.on = true; R.phase = 'set'; R.b0 = beatPos; R.L0 = -1; R.arrived = false; R.beat = -1;
    R.dir = B && B.model ? (B.handRight ? 1 : -1) : 1;  // lopen met de aansteekhand aan de kant van de toog
    R.bz = (R.dir > 0 ? ROW_Z[0] : ROW_Z[7]) - R.dir * 0.3;
    for (const s of shots) { s.set = 0; s.lit = -1; s.out = -1; s.g.visible = false; s.fl.visible = false; }
    if (B && B.model) { mode = 'round'; mt = 0; }
  }
  function endRound(now) {
    R.on = false; R.phase = '';
    for (const s of shots) { s.g.visible = false; s.fl.visible = false; }
    for (const [g, s] of saved) if (isGuest(g)) s.until = now;
    if (mode === 'round') { mode = 'fetch'; mt = 0; }
    nextOrder = now + rnd(6, 12); nextAuto = now + rnd(70, 110);
  }
  function updateRound(dt, now) {
    if (!R.on) return;
    const b = beatPos;
    if (R.phase === 'set') {  // glaasjes één voor één neerzetten
      let all = true;
      for (let n = 0; n < 8; n++) { const s = shots[orderIdx(n)]; if (!s.g.visible && b >= R.b0 + 0.5 + 0.5 * n) { s.g.visible = true; s.set = 0; } if (!s.g.visible) all = false; }
      if (all && (R.arrived || mode !== 'round')) { R.phase = 'light'; R.L0 = Math.ceil(b); }
      return;
    }
    const k = b - R.L0;
    for (let n = 0; n < 8; n++) { const s = shots[orderIdx(n)]; if (s.lit < 0 && k >= n) s.lit = b; }  // aansteken op de tel
    if (R.phase === 'light' && k >= 7) R.phase = 'burn';
    if (R.phase === 'burn' && k >= 15) R.phase = 'drink';  // achterover: drinken
    if (k >= 0 && Math.floor(b) !== R.beat) {  // elke tel: gasten juichen naar de rij, daarna drinken (wie bij een golf oversloeg doet alsnog mee)
      R.beat = Math.floor(b);
      if (R.phase === 'light' || R.phase === 'burn') roundGuests('Cheer_with_Both_Hands_Up', true);
      else if (R.phase === 'drink') roundGuests('Stand_and_Drink', false);
    }
    if (R.phase === 'drink') {  // vlammen doven in volgorde, elk met een rookpluimpje
      for (let n = 0; n < 8; n++) {
        const s = shots[orderIdx(n)];
        if (s.out < 0 && k >= 15 + 0.5 * n) {
          s.out = b;
          const q = smoke[smokeN++ % smoke.length];
          q.sp.visible = true; q.age = 0; q.sp.position.set(ROW_X, SH + 0.08, s.z); q.sp.material.rotation = rnd(0, TAU);
        }
      }
      if (k >= 21) R.phase = 'clean';
    }
    if (R.phase === 'clean') {  // glaasjes weg
      const v = 1 - sm((k - 21) / 0.8);
      for (const s of shots) s.g.scale.setScalar(SS * Math.max(0.01, v));
      if (k >= 22) endRound(now);
    }
  }
  function updateFlames(dt, now) {
    const bass = bands[0].v, hi = bands[2].v;
    let heat = 0;
    avg.setRGB(0, 0, 0);
    for (const s of shots) {
      if (s.g.visible && s.set < 1) { s.set = Math.min(1, s.set + dt / 0.18); s.g.scale.setScalar(SS * (0.3 + 0.7 * sm(s.set))); }
      if (s.lit < 0) { s.fl.visible = false; continue; }
      let k = 1;
      if (s.out >= 0) { k = Math.min(1, 1 - (beatPos - s.out) / 0.35); if (k <= 0) { s.fl.visible = false; continue; } }  // beatPos kan bij een aanslag terugspringen
      const age = Math.max(0, beatPos - s.lit), whoosh = 1 + 0.9 * Math.exp(-age * 5);
      const fl = Math.sin(now * 23 + s.i * 1.7) * Math.sin(now * 37 + s.i * 2.9);  // flakkeren op de hoge tonen
      const h = (0.12 + 0.4 * bass) * whoosh * k * (1 + 0.18 * hi * fl) * (0.9 + 0.1 * Math.sin(now * 5 + s.i * 2.3));
      const w = (0.045 + 0.02 * hi) * (1 - 0.15 * hi * fl) * Math.min(1.3, whoosh) * Math.sqrt(k);
      s.fl.visible = true;
      s.fl.scale.set(w * 1.7, h * 1.6, 1);
      s.fl.position.set(ROW_X + 0.006 * hi * fl, SH + h * 0.45, s.z + 0.006 * hi * Math.sin(now * 29 + s.i));
      s.fl.material.rotation = 0.2 * hi * fl;
      const hc = sm(age / 10); fc.setHSL((0.625 + 0.447 * hc) % 1, 1, 0.6 - 0.05 * hc);  // blauw -> paars -> oranje (kortste weg over de kleurencirkel)
      s.fl.material.color.copy(fc).multiplyScalar(1.5 * k);
      heat += k * whoosh;
      avg.r += fc.r * k; avg.g += fc.g * k; avg.b += fc.b * k;
    }
    burning = heat > 0 ? 1 : 0;
    if (heat > 0) {
      lamp.color.setRGB(avg.r / heat, avg.g / heat, avg.b / heat);
      lamp.intensity = heat * 0.22 * (0.85 + 0.2 * Math.sin(now * 19) * Math.sin(now * 27) * (0.5 + hi));
      shotLiq.color.setRGB(0.16, 0.08, 0.015).lerp(lamp.color, Math.min(0.5, heat * 0.06));
    } else { lamp.intensity = 0; shotLiq.color.setRGB(0.16, 0.08, 0.015); }
    for (const q of smoke) {
      if (!q.sp.visible) continue;
      q.age += dt;
      if (q.age > 0.95) { q.sp.visible = false; continue; }
      q.sp.position.y += dt * 0.35;
      const sc = 0.07 + q.age * 0.4; q.sp.scale.set(sc, sc * 1.3, 1);
      q.sp.material.color.setScalar(0.35 * Math.min(1, q.age * 8) * (1 - q.age / 0.95));
    }
  }

  // drop: 16 tellen later een rondje (de golf van meeleven.js is dan voorbij)
  const orig = startMoment;
  startMoment = function (k, tb) { const r = orig.apply(this, arguments); if (k === 'drop') roundAt = (typeof tb === 'number' && isFinite(tb) ? tb : beatPos) + 16; return r; };

  clubHooks.push((dt, now) => {
    if (!nextAuto) { nextAuto = now + rnd(70, 110); nextOrder = now + rnd(5, 10); }
    sync();
    // drop die lichtregie.js zonder startMoment start (geen figuren, of te kort na een ander moment)
    const RG = window.clubRegie;
    if (RG && RG.dropBeat >= 0 && RG.dropBeat !== seenDrop) { seenDrop = RG.dropBeat; if (beatPos - RG.dropBeat < 4) roundAt = Math.max(roundAt, RG.dropBeat + 16); }
    if (roundAt >= 0 && beatPos >= roundAt) { roundAt = -1; if (!R.on) want = true; }
    if (now > nextAuto) { if (!R.on && energy > 0.45) want = true; nextAuto = now + (want ? rnd(70, 110) : rnd(8, 15)); }
    if (want && !R.on && !golf() && (!B || !B.model || (mode === 'flair' && !flying))) { want = false; startRound(now); }  // niet midden in een drop/YMCA-golf
    if (B && B.model) updateBarman(dt, now); else updateSimple(dt, now);
    updateRound(dt, now);
    updatePG(dt, now);
    updateFlames(dt, now);
    updateGuests(now);
  });

  // camera: laag op tooghoogte langs de brandende rij, richting de barman
  SHOTS.shots = {
    get w() { return burning ? 5 : 0; },
    beats: 8,
    make() {  // de barman staat aan het eind van de rij: van de andere kant erheen rijden (gespiegeld als hij links eindigt)
      const sg = R.on ? R.dir : B && B.d.home.z < 0 ? -1 : 1;
      return { sg, z0: -3.2 * sg, z1: -0.6 * sg, look: new V3() };
    },
    at(s, u, t) {
      const dt = Math.max(0, t - (s.lt || 0)); s.lt = t;
      const z = s.z0 + (s.z1 - s.z0) * sm(u);
      // lijven van bar-gasten ontwijken: zacht zijwaarts richting de toog (hooguit tot x 12, net voor de rij)
      let x = 11.5;
      for (const d of crowd) {
        if (!d.root.parent || !d.root.visible) continue;
        bodyOf(d, 1, hv);
        const dz = z - hv.z;
        if (hv.x < 11.6 && Math.abs(dz) < 0.6 && x - hv.x < Math.sqrt(0.36 - dz * dz)) x = Math.min(12.0, hv.x + Math.sqrt(0.36 - dz * dz));
      }
      s.cx = s.cx === undefined ? x : s.cx + (x - s.cx) * (1 - Math.exp(-dt * 6));
      camPos.set(s.cx, TOP + 0.16, z);
      s.look.set(12.25, TOP + 0.14, 1.9 * s.sg);
      if (B && B.d.root.parent) s.look.lerp(tv.set(B.d.home.x, 1.45, B.d.home.z), 0.4);
      // hard: ≥ 0,45 m van elk hoofd
      for (const list of PEOPLE) for (const d of list) {
        if (!d.root.parent || !d.root.visible) continue;
        bodyOf(d, 0, hv);
        const dx = camPos.x - hv.x, dy = camPos.y - hv.y, dz = camPos.z - hv.z;
        if (dx * dx + dy * dy + dz * dz >= 0.2025) continue;
        const hor = Math.hypot(dx, dz) || 1e-3, need = Math.sqrt(Math.max(0, 0.2025 - dy * dy)) + 0.01;
        camPos.x = Math.min(12.0, hv.x + dx / hor * need); camPos.z = hv.z + dz / hor * need;
      }
      camLook.copy(s.look);
      camFov = 40;
    },
  };
  const hv = new V3(), bodyBones = new WeakMap(), PEOPLE = [crowd, walkers];  // figuur -> [hoofd, heupen]
  function bodyOf(d, j, outV) {
    let h = bodyBones.get(d);
    if (!h) { h = [null, null]; if (d.body) d.body.traverse(o => { if (o.isBone && o.name === 'Head' && !h[0]) h[0] = o; if (o.isBone && o.name === 'Hips' && !h[1]) h[1] = o; }); bodyBones.set(d, h); }
    if (!h[j]) return outV.set(d.root.position.x, j ? 1 : 1.6, d.root.position.z);
    const A = window.clubOpt && clubOpt.anim;  // niet bijgewerkt figuur (optimaliseer.js, buiten beeld): botmatrices kunnen oud zijn, dan vers uitrekenen
    return A && A.stil(d) ? h[j].getWorldPosition(outV) : outV.setFromMatrixPosition(h[j].matrixWorld);
  }

  // om te testen in de console: clubBarman.rondje()
  window.clubBarman = { rondje() { want = true; }, get stand() { return { mode, fase: R.phase, branden: !!burning, flair: flying, glas: PG.on, barman: B ? (B.model ? 'model' : B.d.type) : null }; } };
})();

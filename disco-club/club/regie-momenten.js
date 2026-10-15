// Regie: de camera pakt de momenten (boer, drop, solo, paartje, YMCA, Rick).
// Dit is het enige bestand dat zelf startShot aanroept. Alleen in 'auto', nooit tijdens de trip,
// hooguit één momentknip per 16 tellen. Voorrang: boer > drop > solo/paar/ymca > Rick.
(() => {
  const NEON = new THREE.Vector3(0, 5.3, -7.4);              // rode BLOODLINE-neon boven de dj
  const W = new THREE.Vector3(), T = new THREE.Vector3();      // vaste tmp-vectoren
  const PILL = [10.6, 5, 10.6, -5, -10.6, 5, -10.6, -5, 5, 10.6, -5, 10.6];
  const HEAD = 1.6;                                            // kop van de slak: ~1,6 m voor zijn midden
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));     // hoek naar -pi..pi
  const clock = () => performance.now() / 1000;                // zelfde klok als slugBurpAt en de hooks

  let lastCut = -999, burpT = -999, precutFor = -1, dropSeen = -1;
  let hintA = null, hintB = null;                              // doel voor make() bij een momentknip
  let rickDone = null, rickPrev = '', rickGonePoi = null, rickBack = -999;
  const P = { kind: null, prio: 0, b: 0, now: false, x: null, y: null };  // één wachtende knip (hergebruikt)

  // camera binnen de zaal houden: weg van bar- en loungepubliek (x ±10,4), dj-podium, pilaren en paalpodia
  const inBox = (x, z) => x >= -9.8 && x <= 9.8 && z >= -6.2 && z <= 10.3;
  function keepIn(v) {
    const x0 = v.x, z0 = v.z;
    v.x = clamp(v.x, -9.8, 9.8); v.z = clamp(v.z, -6.2, 10.3);
    for (let i = 0; i < PILL.length; i += 2) {  // pilaar: naar de dichtstbijzijnde zijkant die binnen de zaal ligt
      const px = PILL[i], pz = PILL[i + 1];
      if (Math.abs(v.x - px) >= 0.8 || Math.abs(v.z - pz) >= 0.8) continue;
      let bx = v.x, bz = v.z, bd = 1e9;
      for (let k = 0; k < 4; k++) {
        const cx = k < 2 ? px + (k ? 0.8 : -0.8) : v.x, cz = k < 2 ? v.z : pz + (k > 2 ? 0.8 : -0.8), d = Math.hypot(cx - v.x, cz - v.z);
        if (d < bd && inBox(cx, cz)) { bd = d; bx = cx; bz = cz; }
      }
      v.x = bx; v.z = bz;
    }
    for (let i = 0; i < POLES.length; i++) {  // paalpodium: naar buiten, of (in de hoek) naar de zaalkant
      const p = POLES[i], dx = v.x - p.x, dz = v.z - p.z, d = Math.hypot(dx, dz) || 0.01, r = p.r + 0.5;
      if (d >= r) continue;
      v.x = p.x + dx / d * r; v.z = p.z + dz / d * r;
      if (!inBox(v.x, v.z)) { const c = Math.hypot(p.x, p.z); v.x = p.x - p.x / c * r; v.z = p.z - p.z / c * r; }
    }
    return Math.hypot(v.x - x0, v.z - z0);
  }
  function fixed(s) {  // vaste zaalcamera als er geen doel is
    const f = s.fix || (s.fix = pick(STILL));
    camPos.set(f[0][0], f[0][1], f[0][2]); camLook.set(f[1][0], f[1][1], f[1][2]); camFov = 50;
  }
  const RICK = /rick/;
  function findRick() { for (let i = 0; i < walkers.length; i++) { const w = walkers[i]; if (w.drunk && w.M && RICK.test(w.M.file)) return w; } return null; }
  function closestPair(list, ok) {  // dichtstbijzijnde twee (optioneel gefilterd)
    let best = 1e9; hintA = hintB = null;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (ok && (!ok(a) || !ok(b))) continue;
      const d = Math.hypot(a.root.position.x - b.root.position.x, a.root.position.z - b.root.position.z);
      if (d < best) { best = d; hintA = a; hintB = b; }
    }
    return hintA && hintB;
  }

  // slak: camera 4,2 m voor zijn kop, `ang` opzij van kijkrichting `ry` (de groene wolk blaast langs de lens)
  function aimSlug(out, ry, ang) {
    const p = slug.root.position;
    out.set(p.x + Math.sin(ry) * HEAD + Math.sin(ry + ang) * 4.2, 1.1, p.z + Math.cos(ry) * HEAD + Math.cos(ry + ang) * 4.2);
    const dis = keepIn(out);
    const dx = out.x - p.x, dz = out.z - p.z, d = Math.hypot(dx, dz) || 0.01;  // geklemd: nooit in de slak zelf (min. 3 m)
    if (d < 3) {  // naar buiten, en zit de rand in de weg: langs die rand schuiven
      out.x = p.x + dx / d * 3; out.z = p.z + dz / d * 3;
      if (out.z < -6.2 || out.z > 10.3) { out.z = clamp(out.z, -6.2, 10.3); out.x = p.x + (dx < 0 ? -1 : 1) * Math.sqrt(Math.max(0, 9 - (out.z - p.z) ** 2)); }
      if (out.x < -9.8 || out.x > 9.8) { out.x = clamp(out.x, -9.8, 9.8); out.z = clamp(p.z + (dz < 0 ? -1 : 1) * Math.sqrt(Math.max(0, 9 - (out.x - p.x) ** 2)), -6.2, 10.3); }
    }
    return dis;
  }
  const ANGS = [0.61, -0.61, 1.05, -1.05, 1.48, -1.48];  // 35, 60, 85 graden

  SHOTS.boer = { w: 0, beats: 12, make() {
      if (!slug) return { fix: null };
      // kant kiezen: zo min mogelijk geklemd, liefst 35 graden en van buitenaf (de vloer achter de slak)
      const p = slug.root.position, ry = slug.root.rotation.y;
      let ang = ANGS[0], best = 1e9;
      for (let i = 0; i < ANGS.length; i++) {
        const dis = aimSlug(W, ry, ANGS[i]), inner = Math.hypot(W.x, W.z) < Math.hypot(p.x, p.z);
        const sc = dis * 3 + (i >> 1) * 0.8 + (inner ? 0.6 : 0);
        if (sc < best) { best = sc; ang = ANGS[i]; }
      }
      return { ang, ry, cp: new THREE.Vector3(), init: false, lt: 0, made: clock() };
    },
    at(s, u, t) {
      if (!slug || !s.cp) return fixed(s);
      const dt = Math.max(0, t - s.lt); s.lt = t;
      const p = slug.root.position;
      // bocht (90°): de hoek volgen, niet de plek, zodat de camera om hem heen zwenkt en niet door hem heen;
      // keerpunt aan het eind van de route (180°): niet meedraaien, hij keert en glijdt van de camera weg
      const tg = RING[slugIdx];
      if (!tg || Math.abs(wrap(Math.atan2(tg[0] - p.x, tg[1] - p.z) - s.ry)) < 1.75) s.ry += wrap(slug.root.rotation.y - s.ry) * (1 - Math.exp(-dt * 1.2));
      aimSlug(W, s.ry, s.ang);
      if (!s.init) { s.cp.copy(W); s.init = true; } else s.cp.lerp(W, 1 - Math.exp(-dt * 4));  // klemsprongen dempen
      camPos.copy(s.cp); camLook.set(p.x, 1.9, p.z); camFov = 46;
      const e = clock() - burpT;
      if (burpT > s.made - 0.5 && e >= 0) {  // de boer: crash-zoom naar 30 in 0,4 s, schok van 6 cm, dan langzaam naar 52
        camFov = e < 0.4 ? 46 - 16 * (1 - (1 - e / 0.4) ** 3) : 30 + 22 * ease(clamp((e - 0.8) / 3.5, 0, 1));
        const A = 0.06 * Math.exp(-e * 3);
        camPos.x += A * Math.sin(e * 71); camPos.y += A * Math.sin(e * 83 + 1.3); camPos.z += A * Math.sin(e * 59 + 2.1);
      }
    } };

  SHOTS.drop = { w: 0, beats: 16, make() {  // laag tussen de dansers, omhoog naar de neon
      const q = awayFromDancers(V(rnd(-1.5, 1.5), 0.45, rnd(1, 3)), 1.2);
      const hr = Math.hypot(q.x, q.z);
      if (hr < 1.3) { q.x = hr ? q.x * 1.3 / hr : 0; q.z = hr ? q.z * 1.3 / hr : 1.3; }  // de kraan gaat niet door de spiegelbol
      let n = 0, hx = 0, hz = 0;  // handen in de lucht: de dansers voor de camera (richting dj)
      for (const d of dancers) { const dx = d.home.x - q.x, dz = d.home.z - q.z; if (dz < -0.4 && Math.hypot(dx, dz) < 4) { hx += d.home.x; hz += d.home.z; n++; } }
      const hands = n ? V(hx / n, 2.2, hz / n) : V(q.x * 0.5, 2.2, q.z - 2.5);
      return { pos: q, hands, floor: V(hands.x * 0.7, 0.7, hands.z - 1.2) };
    },
    at(s, u) {
      const b = u * 16;
      const k1 = ease(clamp((b - 1) / 6, 0, 1)), k2 = ease(clamp((b - 8) / 8, 0, 1));
      camPos.set(s.pos.x, 0.45 + 4.05 * k2 + 0.03 * pulse * energy, s.pos.z);  // tel 8-16: kraan recht omhoog
      camLook.copy(NEON).lerp(s.hands, k1).lerp(s.floor, k2);                   // neon -> handen -> springende vloer
      camFov = 72 - 1.5 * pulse * energy;
    } };

  SHOTS.duo = { w: 0, beats: 16, make() {  // het paartje: op de loodlijn door hun midden, langzame boog van 40 graden
      let a = hintA, b = hintB;
      if (!a || !b) { const ok = closestPair(dancers); a = hintA; b = hintB; hintA = hintB = null; if (!ok) return {}; }
      const pa = a.root.position, pb = b.root.position, mx = (pa.x + pb.x) / 2, mz = (pa.z + pb.z) / 2;
      let nx = -(pb.z - pa.z), nz = pb.x - pa.x; const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
      const r = clamp(nl * 1.5, 2.8, 4.5);
      const hide = (cx, cz, tx, tz) => {  // staat er een andere danser tussen camera en doel?
        let pen = 0; const sx = tx - cx, sz = tz - cz, L2 = sx * sx + sz * sz || 1;
        for (const d of dancers) if (d !== a && d !== b) {
          const q = d.root.position, k = clamp(((q.x - cx) * sx + (q.z - cz) * sz) / L2, 0, 1), dd = Math.hypot(cx + sx * k - q.x, cz + sz * k - q.z);
          if (dd < 0.6) pen += 1.5 - dd / 0.6;
        }
        return pen;
      };
      let a0 = 0, best = -1e9;
      for (const sg of [1, -1]) {  // kant met vrij zicht en de meeste ruimte
        const base = Math.atan2(sg * nx, sg * nz); let sc = 0, room = 9;
        for (const da of [-0.35, 0, 0.35]) {
          W.set(mx + Math.sin(base + da) * r, 1.35, mz + Math.cos(base + da) * r);
          sc -= keepIn(W) * 3;  // geklemd (dj-booth, speakers, rand) kost punten
          sc -= 2 * (hide(W.x, W.z, mx, mz) + hide(W.x, W.z, pa.x, pa.z) + hide(W.x, W.z, pb.x, pb.z));
          for (const d of dancers) if (d !== a && d !== b) room = Math.min(room, Math.hypot(d.root.position.x - W.x, d.root.position.z - W.z));
        }
        sc += Math.min(room, 1.5);
        if (sc > best) { best = sc; a0 = base; }
      }
      return { a, b, a0, r, dir: pick([-1, 1]), m: V(mx, 1.2, mz), lt: 0 };
    },
    at(s, u, t) {
      if (!s.a) return fixed(s);
      const dt = Math.max(0, t - s.lt); s.lt = t;
      const pa = s.a.root.position, pb = s.b.root.position;
      s.m.lerp(T.set((pa.x + pb.x) / 2, 1.2, (pa.z + pb.z) / 2), 1 - Math.exp(-dt * 2));
      const ang = s.a0 + s.dir * (ease(u) - 0.5) * 0.698;
      camPos.set(s.m.x + Math.sin(ang) * s.r, 1.35, s.m.z + Math.cos(ang) * s.r);
      keepIn(camPos);  // de boog mag niet de dj-booth, speakers of een pilaar in
      camLook.copy(s.m); camFov = 40;
    } };

  SHOTS.ymca = { w: 0, beats: 16, make: () => ({ side: pick([-1, 1]) }),  // hoog naast de dj-booth, onder de neon door
    at(s, u) { camPos.set(s.side * (3 - 1 * ease(u)), 4.4, -9.6); camLook.set(0, 1, 1); camFov = 50; } };

  // niet-opsombaar: alleen de regie knipt hierheen (geen vaste camera via 'c' of randomizeAll: dat wordt een stil deurbeeld)
  Object.defineProperty(SHOTS, 'binnenkomst', { enumerable: false, configurable: true, writable: true, value: {
    w: 0, beats: 16, make: () => ({ d: hintA || findRick(), side: pick([-1, 1]), look: V(0, 1.5, 14), lt: 0 }),
    at(s, u, t) {  // camera op de ingang, 1,3 m naast de looplijn (x = 0); draait traag mee, knipt weg als hij langs de lens komt
      const dt = Math.max(0, t - s.lt); s.lt = t;
      camPos.set(s.side * 1.3, 1.65, 8.9);
      const d = s.d;
      if (d && d.root.visible && d.root.position.z < ROOM) {
        const p = d.root.position;
        s.look.lerp(T.set(p.x, 1.45, p.z), 1 - Math.exp(-dt * 0.9));
        if (s.regie && p.z < 10.2) s.beats = Math.max(0.01, beatPos - s.b0);
      }
      camLook.copy(s.look); camFov = 38;
    } } });

  // --- aanvragen en knippen ---
  const free = () => S.cam === 'auto' && !(shot && shot.kind === 'trip') && beatPos - lastCut >= 16 && camera.position.z < ROOM - 0.1;
  function ask(kind, prio, now, x, y) {
    if (P.kind === kind) { if (now) P.now = true; return; }  // wacht al: hooguit 'meteen' maken
    if (P.kind && P.prio >= prio) return;
    P.kind = kind; P.prio = prio; P.b = beatPos; P.now = now; P.x = x || null; P.y = y || null;
  }
  function cut(kind, now, a, b) {
    hintA = a || null; hintB = b || null;
    startShot(kind, now);
    hintA = hintB = null;
    shot.regie = true;
    lastCut = beatPos;
  }
  function fire(now) {
    const k = P.kind, x = P.x, y = P.y, direct = P.now;
    P.kind = null;
    if (k === 'boer') { if (!slug) return; if (!direct) precutFor = slugBurpAt; cut('boer', now); }
    else if (k === 'drop') cut('drop', now);
    else if (k === 'ymca') cut('ymca', now);
    else if (k === 'solo') { if (!dancers.includes(x)) return; cut('ster', now); shot.d = x; shot.r = 2.1; shot.beats = 16; }
    else if (k === 'paar') { if (!dancers.includes(x) || !dancers.includes(y)) return; cut('duo', now, x, y); }
    else if (k === 'rick') { if (!x.root.visible) return; rickDone = x.path; cut('volg', now); shot.d = x; shot.front = false; shot.look = null; shot.beats = 32; }  // loopt tot hij de deur uit is
    else if (k === 'binnen') { rickBack = -999; cut('binnenkomst', now, x); }
  }

  // momenten van de vloer (updateMoments, lichtregie.js, console): eerst het origineel, dan het doel zoeken
  const oMoment = startMoment;
  startMoment = function (k, tb) {
    if (tb == null) tb = beatPos;
    const res = oMoment.call(this, k, tb);
    if (k === 'drop') dropSeen = Math.floor(tb);
    if (!free()) return res;
    const nb = Math.floor(tb) + 16;
    // de gekozen danser(s) herkennen aan hun nieuwe wisseltel: 3D-figuur floor(tb)+16, gebouwd floor(tb+off)+16 (geen klapper)
    // (een oude d.queue telt niet: forceDance leegt die niet; de juichende buren hebben floor(tb)+6)
    const isNew = d => d.type === 'model' ? d.nextChange === nb : d.nextChange === Math.floor(tb + d.off) + 16 && d.move !== 9 && d.pq == null;
    if (k === 'drop') ask('drop', 3);
    else if (k === 'ymca') ask('ymca', 2);
    else if (k === 'solo') {
      const star = floorModels().find(isNew) || dancers.find(d => d.type !== 'model' && isNew(d));
      if (star) ask('solo', 2, false, star);
    } else if (k === 'paar') {
      const one = dancers.find(isNew);  // zonder 3D-figuren maakt startMoment van 'paar' een solo
      if (closestPair(dancers, isNew)) ask('paar', 2, false, hintA, hintB);
      else if (one) ask('solo', 2, false, one);
      else if (closestPair(dancers)) ask('paar', 2, false, hintA, hintB);
      hintA = hintB = null;
    }
    return res;
  };
  // de boer: crash-zoom; zonder vooraf-knip meteen knippen
  const oBurp = slugBurpNow;
  slugBurpNow = function (now) {
    const res = oBurp.apply(this, arguments);
    burpT = clock();
    if (!(shot && shot.kind === 'boer') && free()) ask('boer', 4, true);
    return res;
  };

  function pathLeft(w) {  // resterende looplengte
    let len = 0, x = w.root.position.x, z = w.root.position.z;
    for (let i = 0; i < w.path.length; i++) { len += Math.hypot(w.path[i][0] - x, w.path[i][1] - z); x = w.path[i][0]; z = w.path[i][1]; }
    return len;
  }

  clubHooks.push((dt, now) => {
    if (beatPos < lastCut) lastCut = -999;  // beat-klok opnieuw begonnen
    const rick = findRick();
    if (rick) {  // Rick bijhouden: weg naar buiten, en weer binnen
      if (rick.state === 'gone' && rickPrev !== 'gone') rickGonePoi = rick.poi;
      if (rickPrev === 'gone' && rick.state !== 'gone' && rick.root.visible && rickGonePoi === POIS[3]) rickBack = beatPos;
      rickPrev = rick.state;
      // ons volgshot: wegknippen zodra hij de deur uit is
      if (shot && shot.regie && shot.kind === 'volg' && shot.d === rick && rick.state === 'gone') shot.beats = Math.max(0.01, beatPos - shot.b0);
    }
    if (!free()) { P.kind = null; return; }
    // drop die lichtregie.js zonder startMoment start (geen figuren, of te kort na een ander moment)
    const R = window.clubRegie;
    if (R && R.stand === 'drop' && R.dropBeat >= 0 && R.dropBeat !== dropSeen && Math.floor(beatPos) - R.dropBeat <= 1) { dropSeen = R.dropBeat; ask('drop', 3); }
    // de boer zien aankomen: knip vlak ervoor, op de tel
    if (slug && slugBurp <= 0 && slugBurpAt !== precutFor && slugBurpAt - now > 0 && slugBurpAt - now < 2.2 * period && !(shot && shot.kind === 'boer')) ask('boer', 4);
    if (rick && rick.root.visible && rick.state === 'walk') {
      if (beatPos - rickBack < 8 && rick.root.position.z > 11.5) ask('binnen', 1, false, rick);  // net weer binnen, nog bij de deur
      // Rick naar buiten: pas als het lopende shot al 4 tellen staat (na een momentshot eerst de gewone loting),
      // en pas als hij binnen ~28 tellen bij de deur is (0,7 m/s), zodat het shot ook echt eindigt met hem door de deur
      else if (rick.poi === POIS[3] && rick.path !== rickDone && shot && !shot.regie && beatPos - shot.b0 >= 4) {
        const left = pathLeft(rick);
        if (left > 3 && left < 0.7 * 28 * period) ask('rick', 1, false, rick);
      }
    }
    if (!P.kind) return;
    if (beatPos - P.b > 2) { P.kind = null; return; }  // te laat: laten schieten
    const fb = Math.floor(P.b);
    if (P.now || Math.floor(beatPos) > fb || beatPos - fb < 0.15) fire(now);  // op de tel (of meteen bij de boer)
  });
})();

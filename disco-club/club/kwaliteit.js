// Kwaliteitsstanden zodat de club ook op telefoons en trage computers loopt; 'hoog' is precies de kern zoals hij was.
//  hoog   - alles elk beeld (spiegelvloer, bol-opname elke 3e, schaduwen, feedback, bloom)
//  midden - bol-opname 1 op 6, spiegelvloer 256 px, schaduwen 1 op 10, bloom op halve resolutie, max ~2 megapixel
//  laag   - glimmende donkere vloer (lampen + bol-opname als envMap) i.p.v. de echte spiegel, geen bol-opname/schaduwen/feedback/bloom, ~1 megapixel, minder figuren,
//           minder rook, kleinere texturen (telefoon), figuren buiten beeld niet tekenen
//  minimaal - laag + alleen de twee hoofdspots aan (tv: elke lamp kost per pixel op elk figuur; testronde Mali-G52 6 -> 25 fps)
// Een bewaker schakelt op de beeldtijd omlaag/omhoog (alleen bij 'auto'). Ook: 'laden… x/y', inklapbare balk op smal scherm.
// Publiceert window.clubKwaliteit: { stand, keuze, bewaker, zet('auto'|'hoog'|'midden'|'laag'|'minimaal') }.
(function () {
  'use strict';
  if (typeof KW === 'undefined' || typeof clubHooks === 'undefined' || typeof LAAD === 'undefined') return;

  const STANDEN = ['minimaal', 'laag', 'midden', 'hoog'];
  const KEUZES = ['auto', 'hoog', 'midden', 'laag', 'minimaal'];
  const TV = /Android TV|GoogleTV|SmartTV|SMART-TV|Tizen|Web0S|webOS|AFT[A-Z]|BRAVIA|CrKey/i.test(navigator.userAgent);
  const isLaag = () => KW.stand === 'laag' || KW.stand === 'minimaal';  // alles wat laag doet, doet minimaal ook
  if (!KEUZES.includes(S.kwaliteit)) S.kwaliteit = 'auto';
  const PLAFOND = MOBIEL ? 'midden' : 'hoog';  // de bewaker gaat op mobiel nooit hoger
  const BODEM = MOBIEL ? 'minimaal' : 'midden';     // en op de pc nooit lager: de spiegelvloer blijft (laag kan nog met de hand)
  const PR_HOOG = PR;  // zoals de kern hem bij de start uitrekende
  const BUDGET = [1e6, 7e5, 5e5, 3e5];  // laag/minimaal: pixels; de bewaker kan nog drie stapjes zakken (tv: 0,5 MP = scherm, 0,3 MP = 730x410)
  let budget = 0;

  function prVoor(s) {
    if (s === 'hoog') return PR_HOOG;
    const opp = innerWidth * innerHeight;
    if (s === 'midden') return Math.min(PR_HOOG, Math.sqrt(2e6 / opp));
    return Math.min(window.devicePixelRatio || 1, 1, Math.sqrt(BUDGET[budget] / opp));
  }
  // bloom op een fractie van de beeldmaat (hoog: 1 = ongewijzigd)
  let bloomK = 1;
  if (bloom) {
    const kernSize = bloom.setSize.bind(bloom);
    bloom.setSize = (w, h) => kernSize(Math.max(1, Math.round(w * bloomK)), Math.max(1, Math.round(h * bloomK)));
  }

  // --- laag: glimmende donkere vloer onder de tegels (de echte spiegel gaat uit, de bol-opname geeft de weerschijn) ---
  const vloerTex = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#3e3c3a'; g.fillRect(0, 0, w, h);
    const img = g.getImageData(0, 0, w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 26; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    g.putImageData(img, 0, 0);
    for (let i = 0; i < 12; i++) {  // vlekken, niet over de rand (de textuur herhaalt)
      const r = rnd(10, 50), x = rnd(r, w - r), y = rnd(r, h - r), gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(10,10,12,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });
  vloerTex.wrapS = vloerTex.wrapT = THREE.RepeatWrapping;
  vloerTex.repeat.set(7, 7);
  const vloer = new THREE.Mesh(new THREE.PlaneGeometry(ROOM * 2, ROOM * 2), new THREE.MeshPhongMaterial({ color: 0x5a5a66, map: vloerTex, specular: 0x8888a0, shininess: 90, envMap: envRT.texture, combine: THREE.MixOperation, reflectivity: 0.32 }));
  vloer.rotation.x = -Math.PI / 2;
  vloer.visible = false;
  scene.add(vloer);

  // lampen die in laag uitgaan (minder licht per pixel): de twee spots op de stacks en het boerlicht van de slak
  const extraLicht = [slugLight];
  scene.traverse(o => { if (o.isSpotLight && !spots.some(s => s.light === o)) extraLicht.push(o); });

  // --- minimaal: alleen de twee hoofdspots, de rest van de lampen uit en de basisverlichting wat feller ---
  const lampUit = new Map();  // lamp -> zichtbaarheid van vóór minimaal
  function lampen(uit) {
    if (uit) scene.traverse(o => {
      if (!(o.isPointLight || o.isSpotLight) || o === spots[0].light || o === spots[1].light) return;
      if (!lampUit.has(o)) lampUit.set(o, o.visible);
      o.visible = false;
    });
    else { for (const [o, v] of lampUit) o.visible = v; lampUit.clear(); }
  }

  // --- goedkoper materiaal (tv-proef): PBR (MeshStandard) -> Lambert (licht per hoekpunt i.p.v. per pixel).
  // Kleur-, emissive- en textuurobjecten worden gedeeld (animaties lopen door), de herkleuring (onBeforeCompile) gaat mee.
  const lambertVan = new Map(), goedkoopOp = new Map(), goedkoopAan = { figuren: false, kamer: false };
  const isFiguur = o => o.isSkinnedMesh || (slug && (() => { for (let p = o; p; p = p.parent) if (p === slug.root) return true; return false; })());
  function naarLambert(m) {
    if (!m || !m.isMeshStandardMaterial) return m;
    let l = lambertVan.get(m);
    if (!l) {
      l = new THREE.MeshLambertMaterial({ map: m.map, emissiveMap: m.emissiveMap, alphaMap: m.alphaMap, transparent: m.transparent, opacity: m.opacity,
        alphaTest: m.alphaTest, side: m.side, skinning: m.skinning, vertexColors: m.vertexColors, depthWrite: m.depthWrite, emissiveIntensity: m.emissiveIntensity });
      l.color = m.color; l.emissive = m.emissive; l.userData = m.userData;
      if (m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) { l.onBeforeCompile = m.onBeforeCompile; l.customProgramCacheKey = m.customProgramCacheKey; }
      lambertVan.set(m, l);
    }
    l.opacity = m.opacity; l.emissiveIntensity = m.emissiveIntensity; l.visible = m.visible;
    return l;
  }
  function goedkoop(welke, aan) {
    if (welke) goedkoopAan[welke] = aan;
    scene.traverse(o => {
      if (!o.isMesh) return;
      const fig = isFiguur(o), wil = fig ? goedkoopAan.figuren : goedkoopAan.kamer;
      if (wil && !goedkoopOp.has(o)) {
        const org = o.material, nieuw = Array.isArray(org) ? org.map(naarLambert) : naarLambert(org);
        if (nieuw !== org && !(Array.isArray(org) && nieuw.every((m, i) => m === org[i]))) { goedkoopOp.set(o, org); o.material = nieuw; }
      } else if (!wil && goedkoopOp.has(o)) { o.material = goedkoopOp.get(o); goedkoopOp.delete(o); }
    });
  }
  let goedTel = 0;
  clubHooks.push(() => {  // nieuwe figuren (herbouwde bezetting) ook omzetten en ondoorzichtigheid bijhouden
    if (!goedkoopAan.figuren && !goedkoopAan.kamer) return;
    if (++goedTel % 60 === 0) goedkoop();
    for (const [m, l] of lambertVan) { l.opacity = m.opacity; l.emissiveIntensity = m.emissiveIntensity; l.visible = m.visible; }
  });

  const fogReserve = [];
  function rook(laag, geen) {  // laag: de helft van de rookwolken, rookmachines en lichtvlekjes; geen (minimaal/tv): geen rook
    if (fogReserve.length) fogPool.push(...fogReserve.splice(0));
    puffs.forEach((f, i) => { f.sp.visible = geen ? false : !(laag && i % 2); });
    if (laag) { fogReserve.push(...fogPool.splice(geen ? 0 : fogPool.length >> 1)); fogReserve.forEach(f => f.sp.visible = false); }
    flecks.count = laag ? FLECKS >> 1 : FLECKS;
  }

  // --- minder figuren in laag: dansers max 8, lopers, publiek en zaal 2 ongeveer de helft ---
  const kern = { buildCast, buildWalkers, buildCrowd, fillZone2 };
  buildCast = function () {
    const n = S.count;
    if (isLaag()) S.count = Math.min(n, 8);
    try { kern.buildCast(); } finally { S.count = n; }
  };
  buildWalkers = function () {
    kern.buildWalkers();
    if (isLaag()) for (const w of walkers.splice(2)) dropDancer(w);
  };
  buildCrowd = function () {
    const plekken = CROWD_SPOTS;
    if (isLaag()) CROWD_SPOTS = plekken.filter((p, i) => i % 2 === 0);  // index 4 (achter de bar) = barman blijft
    try { kern.buildCrowd(); } finally { CROWD_SPOTS = plekken; }
    if (!isLaag()) return;
    crowd.filter(d => d.yOff !== undefined).forEach((d, i) => { if (i % 2) { dropDancer(d); crowd.splice(crowd.indexOf(d), 1); } });  // lounge
  };
  fillZone2 = function () {
    kern.fillZone2();
    if (isLaag()) for (const d of zone2Dancers.splice(6)) dropDancer(d);
  };

  // --- kleinere texturen: telefoon of zelf gekozen midden/laag (auto op de pc nooit, dan kan hij terug naar hoog) ---
  const TEX_MAX = { minimaal: 512, laag: 512, midden: 1024 };
  const klein = new Map();  // origineel beeld -> verkleind canvas (texturen delen soms een beeld)
  function verklein(root) {
    const max = TEX_MAX[KW.stand];
    if (!max || !root || (!MOBIEL && S.kwaliteit === 'auto')) return;
    root.traverse(o => {
      if (!o.isMesh) return;
      for (const m of [].concat(o.material)) for (const k in m) {
        const t = m[k], img = t && t.isTexture && t.image;
        if (!img) continue;
        try {
          if (!klein.has(img)) {
            if (!(img.width > max || img.height > max)) continue;
            const f = max / Math.max(img.width, img.height), c = document.createElement('canvas');
            c.width = Math.max(1, Math.round(img.width * f)); c.height = Math.max(1, Math.round(img.height * f));
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            klein.set(img, c);
            if (img.close) img.close();  // ImageBitmap: het grote beeld meteen uit het geheugen
          }
          t.image = klein.get(img); t.needsUpdate = true;
        } catch (e) { console.error('verklein', e); }
      }
    });
  }
  LAAD.voor = g => verklein(g.scene);

  // --- laag: figuren buiten beeld niet tekenen (hun meshes staan op frustumCulled = false) ---
  const frus = new THREE.Frustum(), pm = new THREE.Matrix4(), bol = new THREE.Sphere(new THREE.Vector3(), 2), verborgen = [];
  function knip() {
    if (!isLaag()) return;
    camera.updateMatrixWorld();
    frus.setFromProjectionMatrix(pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    for (const lijst of [dancers, crowd, walkers, poleDancers, worms]) for (const d of lijst) {
      const o = d.body || d.hips;
      if (!o || !o.visible || !d.root.visible || d.root.parent !== scene) continue;
      bol.center.copy(d.root.position); bol.center.y += 1;
      if (!frus.intersectsSphere(bol)) { o.visible = false; verborgen.push(o); }
    }
  }
  function ruimOp() {  // na het tekenen weer zichtbaar: logica, lichtkrant en bol zien iedereen
    for (const o of verborgen) o.visible = true;
    verborgen.length = 0;
  }
  const kernCamera = updateCamera;
  updateCamera = function (now) { kernCamera(now); knip(); };

  // --- stand toepassen ---
  let bolNu = false;  // laag: één losse bol-opname (bij de start en als alles geladen is), anders blijft de bol zwart
  function zetStand(s) {
    lampen(false);  // eerst terug zoals het was, daarna zetten de standen hun eigen lampen
    const was = KW.stand, mini = s === 'minimaal', laag = s === 'laag' || mini, midden = s === 'midden';
    KW.stand = s;
    KW.schaduw = laag ? 0 : midden ? 10 : 1;
    KW.bol = laag ? 0 : midden ? 6 : 3;
    KW.imag = laag ? 12 : midden ? 6 : 3;
    KW.spiegel = !laag;
    mirror.visible = !laag;
    vloer.visible = laag;
    if (mirror.getRenderTarget) { const r = s === 'hoog' ? 512 : 256; mirror.getRenderTarget().setSize(r, r); }
    spots.forEach((p, i) => { if (i % 2 === 0) p.light.castShadow = !laag; });
    shadowCatcher.visible = !laag;
    if (!laag) renderer.shadowMap.needsUpdate = true;  // meteen een schaduwkaart, anders is de vloer even zwart onder die spots
    for (const l of extraLicht) l.visible = !laag;
    rook(laag, mini);
    if (bloom) bloom.enabled = !laag;
    if (feedback && laag) feedback.enabled = false;
    bloomK = laag ? 0.25 : midden ? 0.5 : 1;
    PR = prVoor(s);
    resize();
    if (laag) bolNu = true;
    if (mini) lampen(true);
    if ((was === 'laag' || was === 'minimaal') !== laag && allModels().length) { rebuildAll(); fillZone2(); }  // bezetting opnieuw verdelen
    toonKeuze();
  }
  addEventListener('resize', () => { if (KW.stand !== 'hoog') { PR = prVoor(KW.stand); resize(); } });  // laag/midden hangen van de schermmaat af

  // --- bewaker: beeldtijd over vensters van ~3 s, alleen bij 'auto' ---
  let bewaker = S.kwaliteit === 'auto', vorige = 0, venster = null, goed = 0, wachtOp = 15000, rustTot = performance.now() + 5000, lang = 0;
  const T0 = performance.now();
  function bewaak(ms, werk) {
    if (!bewaker) return;
    if (document.hidden) { vorige = 0; venster = null; lang = 0; return; }
    const iv = vorige ? ms - vorige : 0;
    vorige = ms;
    const nu = performance.now();
    if (nu < rustTot || (LAAD.klaar < LAAD.totaal && nu - T0 < 60000)) { venster = null; goed = 0; lang = 0; return; }  // laden of net gewisseld
    // één beeld > 250 ms: terug uit een ander tabblad of een losse hapering; vijf op rij: het apparaat is echt zo traag
    if (iv > 250) { if (++lang >= 5) { lang = 0; venster = null; goed = 0; omlaag(); } return; }
    lang = 0;
    if (!(iv > 0)) return;  // eerste beeld
    if (!venster) venster = { t0: ms, n: 0, iv: 0, werk: 0 };
    venster.n++; venster.iv += iv; venster.werk += werk;
    if (ms - venster.t0 < 3000) return;
    const gem = venster.iv / venster.n, gemWerk = venster.werk / venster.n, telt = venster.iv;  // telt: zonder de overgeslagen lange beelden
    venster = null;
    if (gem > 40) { goed = 0; omlaag(); }
    // omhoog: geen beelden gemist (bij 60 Hz is de tussentijd altijd ~16,7 ms) én het werk per beeld ruim onder 16 ms
    else if (gem < 18 && gemWerk < 10) { goed += telt; if (goed >= wachtOp) { goed = 0; omhoog(); } }
    else goed = 0;
  }
  function omlaag() {
    const i = STANDEN.indexOf(KW.stand);
    if (i > STANDEN.indexOf(BODEM)) zetStand(STANDEN[i - 1]);
    else if (isLaag() && budget < BUDGET.length - 1) { budget++; PR = prVoor('laag'); resize(); }
    else return;
    wachtOp = Math.min(wachtOp * 2, 120000);  // niet heen en weer blijven springen
    rustTot = performance.now() + 2000;
  }
  function omhoog() {
    const i = STANDEN.indexOf(KW.stand);
    if (isLaag() && budget > 0) { budget--; PR = prVoor('laag'); resize(); }
    else if (i < STANDEN.indexOf(PLAFOND)) zetStand(STANDEN[i + 1]);
    else return;
    rustTot = performance.now() + 2000;
  }
  function kies(k) {
    if (!KEUZES.includes(k)) return;
    S.kwaliteit = k; save();
    bewaker = k === 'auto';
    budget = 0; goed = 0; venster = null; wachtOp = 15000;
    zetStand(bewaker ? KW.stand : k);
  }

  // beeldtijd meten rond de kern-frame (frame plant zichzelf via de globale naam, dus deze omhulling blijft lopen)
  const kernFrame = frame;
  frame = function (ms) {
    const t0 = performance.now();
    try { kernFrame(ms); } finally { ruimOp(); }
    bewaak(ms, performance.now() - t0);
  };

  // --- balk: keuze, inklapbaar op smal scherm, Systeemaudio alleen als schermdelen bestaat ---
  const css = document.createElement('style');
  css.textContent = `
    #laden { position: fixed; left: 12px; bottom: 12px; padding: 3px 8px; border-radius: 6px; background: rgba(0,0,0,.55);
             font-size: 12px; opacity: .8; pointer-events: none; font-variant-numeric: tabular-nums; }
    #uiKnop { display: none; }
    @media (max-width: 640px), (max-height: 480px) {
      #ui { left: 8px; top: 8px; max-width: calc(100vw - 16px); max-height: calc(100vh - 16px); overflow-y: auto; padding: 8px; gap: 6px 8px; }
      #uiKnop { display: block; }
      #ui.dicht { padding: 4px; }
      #ui.dicht > :not(#uiKnop) { display: none; }
    }`;
  document.head.appendChild(css);
  const ui = $('ui');
  const sel = document.createElement('select');
  sel.id = 'kwaliteit';
  for (const k of KEUZES) sel.add(new Option('Kwaliteit: ' + k, k));
  ui.insertBefore(sel, $('btnFull'));
  sel.onchange = () => kies(sel.value);
  function toonKeuze() {
    sel.value = S.kwaliteit;
    sel.options[0].text = 'Kwaliteit: auto (' + KW.stand + ')';
  }
  const knop = document.createElement('button');
  knop.id = 'uiKnop';
  ui.insertBefore(knop, ui.firstChild);
  const knopTekst = () => { knop.textContent = ui.classList.contains('dicht') ? 'Menu' : 'Sluiten'; };
  if (matchMedia('(max-width: 640px), (max-height: 480px)').matches) ui.classList.add('dicht');  // telefoon staand of liggend
  knop.onclick = () => { ui.classList.toggle('dicht'); knopTekst(); };
  knopTekst();
  if (!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia)) $('btnSys').hidden = true;  // telefoon: alleen Audio-invoer
  addEventListener('touchstart', wake, { passive: true });

  // --- laadlabel ---
  const lab = document.createElement('div');
  lab.id = 'laden';
  document.body.appendChild(lab);
  let labTekst = '', geladen = false;
  function laadLabel() {  // true zodra alle figuren binnen zijn
    if (LAAD.klaar >= LAAD.totaal) { lab.remove(); return true; }
    const t = 'laden… ' + LAAD.klaar + '/' + LAAD.totaal;
    if (t !== labTekst) lab.textContent = labTekst = t;
    return false;
  }
  laadLabel();

  let lampTel = 0;
  clubHooks.push(() => {
    if (KW.stand === 'minimaal') {
      if (++lampTel % 120 === 0) lampen(true);
      ambient.intensity *= 1.7;  // de kern en de lichtregie zetten hem elk beeld opnieuw; zonder de andere lampen anders een grot
    }
    if (isLaag()) {
      if (feedback) feedback.enabled = false;  // de kern zet hem elk beeld aan bij sporen/spiegel/zaal 2
      if (bolNu) { bolNu = false; ball.visible = false; mirror.visible = false; vloer.visible = false; cubeCam.update(renderer, scene); vloer.visible = true; ball.visible = true; }
    }
    if (!geladen && laadLabel()) {
      geladen = true;
      rustTot = Math.max(rustTot, performance.now() + 5000);  // na het laden eerst even uitrazen
      if (isLaag()) bolNu = true;  // de bol ziet nu ook het publiek
    }
  });

  // --- start ---
  const start = S.kwaliteit === 'auto' ? (TV ? 'minimaal' : MOBIEL ? 'laag' : 'hoog') : S.kwaliteit;
  zetStand(start);
  for (const M of allModels()) verklein(M.scene);  // al binnen vóór dit script (zelden)
  if (slug) verklein(slug.root);
  if (wormModel) verklein(wormModel.scene);

  window.clubKwaliteit = {
    get stand() { return KW.stand; },     // wat er nu draait: hoog / midden / laag
    get keuze() { return S.kwaliteit; },  // auto / hoog / midden / laag
    get bewaker() { return bewaker; },
    goedkoop,                             // clubKwaliteit.goedkoop('figuren' | 'kamer', true/false)
    zet: kies,                            // clubKwaliteit.zet('minimaal'); 'auto' zet de bewaker weer aan
  };
})();

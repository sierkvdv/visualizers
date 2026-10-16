// Voorwarmen: wat de show pas later nodig heeft (zaal 2, het doolhof) al in de eerste seconden na het laden klaarzetten, zodat de
// eerste trip en het eerste doolhof niet haperen. Gemeten op de 3070 (hoog, vers geladen): eerste trip 1,24 s stilstand (35 shaders,
// 23 texturen), eerste doolhof 0,33 s.
// Oorzaak: three r128 maakt voor elk belicht materiaal een eigen shader per aantal lampen in beeld. Zaal 2 heeft 6 eigen lampen en het
// doolhof zet er 2 bij (kern: vaste lampen), dus de eerste keer compileerde elk belicht materiaal in beeld opnieuw (ANGLE/D3D ~35 ms per
// shader); daarbij gingen de texturen van zaal 2 en de muurschilderingen van het doolhof pas dan naar de gpu.
// Hier: renderer.compile voor die lampstanden (de shaders blijven per materiaal bewaard), in stukjes: hooguit één nieuwe shader per beeld
// en daarna gewone beelden rust naar rato (de kwaliteitsbewaker ziet dan geen traag apparaat). Daarna de texturen met renderer.initTexture
// (plaatje eerst met img.decode buiten de hoofdlus uitpakken), één per keer. Kost op de 3070 ~2 s werk, verspreid over de eerste ~10 s.
// Niet op telefoon/tv en niet in laag/minimaal (geheugen). Uitzetten: ?warm=0. Test: clubVoorwarm.toestand().
(() => {
  'use strict';
  if (typeof renderer === 'undefined' || typeof scene === 'undefined' || typeof zone2 === 'undefined' || typeof clubHooks === 'undefined') return;
  if ((typeof MOBIEL !== 'undefined' && MOBIEL) || /[?&]warm=0\b/.test(location.search)) return;

  const T = { fase: 'wacht', stap: 0, shaders: 0, texturen: 0, ms: 0, langste: 0, klaar: false };
  const MURAAL = ['arcade', 'baksteen', 'bass-tempel', 'beton-bunker', 'chroom', 'kosmos', 'neonsteeg', 'paddenstoelen', 'rave-flyers', 'slijmhol', 'staal', 'uv-jungle'];
  const HERHAAL = ['baksteen', 'staal'];  // gangen/stijl vragen deze ook als herhalende textuur (eigen object in de cache van doolhof.tex)
  const belicht = m => m && (m.isMeshStandardMaterial || m.isMeshPhongMaterial || m.isMeshLambertMaterial || m.isMeshToonMaterial || m.isShadowMaterial || (m.isShaderMaterial && m.lights));

  // renderer.compile op een deel van de objecten: lampen uit de echte scène (zoals ze nu zichtbaar zijn), materialen alleen van `stuk`.
  // isScene/fog/environment zoals de scène: die zitten in de sleutel van de shader (anders een andere shader dan bij het tekenen)
  const nep = { isScene: true, fog: null, environment: null, traverseVisible: f => scene.traverseVisible(f), traverse: null };
  function compileer(stuk) { nep.fog = scene.fog; nep.environment = scene.environment; nep.traverse = f => { for (const o of stuk) f(o); }; renderer.compile(nep, camera); }

  // lampstanden: zaal 2 zichtbaar (trip), doolhof (+2 lampen, zaal 2 uit) en doolhof via zaal 2 (+2 lampen, zaal 2 aan)
  const extra = [0, 1].map(() => new THREE.PointLight(0xffffff, 0, 10, 1.5));
  const inZaal2 = o => { for (let p = o; p; p = p.parent) if (p === zone2) return true; return false; };
  const lichtVan = o => [].concat(o.material).some(belicht);
  // per stand de objecten die er dan getekend worden (onbelichte shaders hangen niet van de lampen af: alleen bij zaal 2 alles).
  // Niet het decor van zaal 1 in de doolhof-standen: dat ziet niemand in het doolhof, en die shaders (veel lampen + schaduw) kostten elk ~0,3 s
  const STANDEN = [
    { naam: 'zaal2', zaal2: true, lampen: 0, mag: o => true },
    { naam: 'doolhof', zaal2: false, lampen: 2, mag: o => o.isSkinnedMesh && lichtVan(o) && !inZaal2(o) },   // figuren: de voorraad van het doolhof deelt hun shaders
    { naam: 'doolhof-zaal2', zaal2: true, lampen: 2, mag: o => lichtVan(o) && (inZaal2(o) || o.isSkinnedMesh) },  // doolhof dat door zaal 2 begint
  ];
  let lijst = null, pos = 0, rust = 0, texLijst = null;
  const een = [null];
  function stapCompile(st) {
    if (!lijst) { lijst = []; scene.traverse(o => { if (o.material && st.mag(o)) lijst.push(o); }); pos = 0; }
    const z2 = zone2.visible, p0 = renderer.info.programs.length, t0 = performance.now();
    zone2.visible = st.zaal2;
    for (let i = 0; i < st.lampen; i++) scene.add(extra[i]);
    try {
      // per beeld hooguit ~3 ms aan sleutels uitrekenen, of tot er één nieuwe shader bij kwam
      while (pos < lijst.length && performance.now() - t0 < 3 && renderer.info.programs.length === p0) { een[0] = lijst[pos++]; compileer(een); }
    } finally {
      for (let i = 0; i < st.lampen; i++) scene.remove(extra[i]);
      zone2.visible = z2;
    }
    const nieuw = renderer.info.programs.length - p0;
    T.shaders += nieuw;
    if (nieuw) rust = 2;
    if (pos >= lijst.length) { lijst = null; return true; }
    return false;
  }

  function texturenVan(root, uit) {
    const zet = v => { if (v && v.isTexture && !v.isCubeTexture && !v.isVideoTexture && !v.isDataTexture3D && !v.isDataTexture2DArray && !uit.includes(v)) uit.push(v); };
    root.traverse(o => {
      for (const m of [].concat(o.material || [])) {
        if (!m) continue;
        for (const k in m) zet(m[k]);
        if (m.uniforms) for (const k in m.uniforms) zet(m.uniforms[k] && m.uniforms[k].value);
      }
    });
    return uit;
  }
  function muurschilderingen() {
    const tex = window.doolhof && window.doolhof.tex;
    if (typeof tex !== 'function') return [];
    const uit = [];
    try { for (const n of MURAAL) uit.push(tex(n)); for (const n of HERHAAL) uit.push(tex(n, true)); } catch (e) { console.warn('voorwarm: muurschilderingen', e); }
    return uit.filter(Boolean);
  }
  const gpuKlaar = t => renderer.properties.get(t).__version === t.version;
  const decode = new WeakMap();  // plaatje eerst buiten de hoofdlus uitpakken (img.decode), anders doet texImage2D dat midden in het beeld
  function stapTex() {  // één textuur naar de gpu; true als alles klaar is (wat na 20 s nog niet geladen is, slaan we over)
    while (texLijst.length) {
      const t = texLijst[0], im = t.image;
      if (!im) { if (performance.now() - T.texStart > 20000) { texLijst.shift(); continue; } return false; }  // nog aan het laden
      if (t.version === 0 || gpuKlaar(t)) { texLijst.shift(); continue; }  // niets te uploaden (render-doel) of al op de gpu
      if (typeof im.decode === 'function' && im.complete !== undefined) {
        // (in een verborgen tabblad kan decode blijven wachten op een volgend getekend beeld: na 1,5 s dan toch uploaden)
        const d = decode.get(im);
        if (!d) { decode.set(im, performance.now()); im.decode().then(() => decode.set(im, 'klaar'), () => decode.set(im, 'klaar')); return false; }
        if (d !== 'klaar' && performance.now() - d < 1500) return false;
      }
      texLijst.shift();
      renderer.initTexture(t);
      T.texturen++; rust = 2;
      return !texLijst.length;
    }
    return true;
  }

  let wachtTot = 0;
  function stap() {
    if (T.klaar) return;
    if (T.fase === 'wacht') {
      if (typeof LAAD !== 'undefined' && LAAD.klaar < LAAD.totaal) return;
      if (typeof KW !== 'undefined' && (KW.stand === 'laag' || KW.stand === 'minimaal')) { T.fase = 'overgeslagen (' + KW.stand + ')'; T.klaar = true; return; }
      if (!wachtTot) { wachtTot = performance.now() + 1500; return; }  // eerst de bezetting en het eerste beeld na het laden
      if (performance.now() < wachtTot) return;
      T.fase = 'shaders'; T.stap = 0;
    }
    if (rust > 0) { rust--; return; }
    const t0 = performance.now();
    try {
      if (T.fase === 'shaders') {
        if (stapCompile(STANDEN[T.stap]) && ++T.stap >= STANDEN.length) {
          T.fase = 'texturen'; T.texStart = performance.now();
          texLijst = texturenVan(zone2, []);
          if (KW.stand === 'hoog' || KW.stand === 'midden') texLijst.push(...muurschilderingen());
        }
      } else if (T.fase === 'texturen') {
        if (stapTex()) { T.fase = 'klaar'; T.klaar = true; }
      }
    } catch (e) { console.warn('voorwarm', e); T.fase = 'fout'; T.klaar = true; }
    const ms = performance.now() - t0;
    T.ms += ms; T.langste = Math.max(T.langste, ms);
    // na een lange stap (zware shader ~0,1 s) zoveel gewone beelden rust dat het gemiddelde onder ~20 ms blijft: de bewaker van
    // club/kwaliteit.js zakt bij > 40 ms gemiddeld over 3 s naar midden
    if (ms > 12) rust = Math.max(rust, Math.ceil(ms / 10));
  }
  clubHooks.push(stap);
  window.clubVoorwarm = { toestand: () => {
    const t = texLijst && texLijst[0], im = t && t.image;
    return Object.assign({}, T, { open: texLijst ? texLijst.length : null, wachtOp: im ? (im.src || im.constructor.name) + ' ' + (decode.get(im) === 'klaar' ? 'klaar' : decode.has(im) ? 'decode' : '') : t ? 'laden' : null });
  } };
})();

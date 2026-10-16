// Voorwarmen: wat de show pas later nodig heeft (zaal 2, het doolhof) al in de eerste seconden na het laden klaarzetten, zodat de
// eerste trip en het eerste doolhof niet haperen. Gemeten op de 3070 (hoog, vers geladen): eerste trip 1,24 s stilstand (35 shaders,
// 23 texturen), eerste doolhof 0,33 s.
// Oorzaak: three r128 maakt voor elk materiaal een eigen shader per aantal lampen in beeld. Zaal 2 heeft 6 eigen lampen (het doolhof
// leent zijn lampen van zaal 1), dus de eerste keer compileerde elk materiaal in beeld opnieuw (ANGLE/D3D ~35 ms per
// shader); daarbij gingen de texturen van zaal 2 en de muurschilderingen van het doolhof pas dan naar de gpu.
// Hier: renderer.compile voor die lampstanden (de shaders blijven per materiaal bewaard), in stukjes van ~3 ms; het linken loopt via
// doolhof.losCompileren op de achtergrond (KHR_parallel_shader_compile). Zonder die extensie: hooguit één nieuwe shader per beeld en
// daarna gewone beelden rust naar rato (de kwaliteitsbewaker ziet dan geen traag apparaat). Dan de shaders van het doolhof: van elke
// kamersoort en gangstijl een proefexemplaar (doolhof/kern.js: doolhof.proef; de kern houdt die programma's vast, ook na het opruimen).
// Daarna de texturen met renderer.initTexture (plaatje eerst met img.decode buiten de hoofdlus uitpakken), één per keer. Kost op de 3070
// een paar seconden werk, verspreid over de eerste ~20-40 s (de showregie gaat de eerste 90 s niet dieper).
// Niet op telefoon/tv en niet in laag/minimaal (geheugen). Uitzetten: ?warm=0. Test: clubVoorwarm.toestand(); klaar() voor de kern.
(() => {
  'use strict';
  if (typeof renderer === 'undefined' || typeof scene === 'undefined' || typeof zone2 === 'undefined' || typeof clubHooks === 'undefined') return;
  if ((typeof MOBIEL !== 'undefined' && MOBIEL) || /[?&]warm=0\b/.test(location.search)) return;

  const T = { fase: 'wacht', stap: 0, shaders: 0, texturen: 0, ms: 0, langste: 0, klaar: false };
  const MURAAL = ['arcade', 'baksteen', 'bass-tempel', 'beton-bunker', 'chroom', 'kosmos', 'neonsteeg', 'paddenstoelen', 'rave-flyers', 'slijmhol', 'staal', 'uv-jungle'];
  const HERHAAL = ['baksteen', 'staal'];  // gangen/stijl vragen deze ook als herhalende textuur (eigen object in de cache van doolhof.tex)

  // renderer.compile op een deel van de objecten: lampen uit de echte scène (zoals ze nu zichtbaar zijn), materialen alleen van `stuk`.
  // isScene/fog/environment zoals de scène: die zitten in de sleutel van de shader (anders een andere shader dan bij het tekenen)
  // Via doolhof/kern.js (doolhof.losCompileren) wacht de hoofdlus niet op de driver: het linken loopt op de achtergrond door
  // (KHR_parallel_shader_compile); dan mogen er meer shaders per beeld en is er geen rust nodig.
  const nep = { isScene: true, fog: null, environment: null, traverseVisible: f => scene.traverseVisible(f), traverse: null };
  const los = () => window.doolhof && typeof window.doolhof.losCompileren === 'function' ? window.doolhof : null;
  function compileer(stuk) {
    nep.fog = scene.fog; nep.environment = scene.environment; nep.traverse = f => { for (const o of stuk) f(o); };
    const D = los();
    if (D) D.losCompileren(() => renderer.compile(nep, camera), stuk); else renderer.compile(nep, camera);
  }
  const parallel = () => { const D = los(); return !!(D && D.parallel); };

  // lampstanden: zaal 2 zichtbaar (trip, ook de wandeling van het doolhof door zaal 2). Het doolhof heeft geen eigen stand meer: de kern
  // leent zijn kamerlampen van zaal 1 (zelfde aantal lampen als zaal 1, zaal 2 uit) en compileert de kamers zelf (doolhof.proef)
  const extra = [0, 1].map(() => new THREE.PointLight(0xffffff, 0, 10, 1.5));
  // per stand de objecten die er dan getekend worden (onbelichte shaders hangen niet van de lampen af: alleen bij zaal 2 alles).
  // Niet het decor van zaal 1 in de doolhof-standen: dat ziet niemand in het doolhof, en die shaders (veel lampen + schaduw) kostten elk ~0,3 s
  const STANDEN = [
    { naam: 'zaal2', zaal2: true, lampen: 0, mag: o => true },
  ];
  let lijst = null, pos = 0, rust = 0, texLijst = null;
  const een = [null];
  function stapCompile(st) {
    if (!lijst) { lijst = []; scene.traverse(o => { if (o.material && st.mag(o)) lijst.push(o); }); pos = 0; }
    const z2 = zone2.visible, p0 = renderer.info.programs.length, t0 = performance.now();
    zone2.visible = st.zaal2;
    for (let i = 0; i < st.lampen; i++) scene.add(extra[i]);
    try {
      // per beeld hooguit ~3 ms aan sleutels uitrekenen, of (zonder parallel linken) tot er één nieuwe shader bij kwam
      const par = parallel(), D = los();
      while (pos < lijst.length && performance.now() - t0 < 3 && (par ? !D.losVol() : renderer.info.programs.length === p0)) { een[0] = lijst[pos++]; compileer(een); }
    } finally {
      for (let i = 0; i < st.lampen; i++) scene.remove(extra[i]);
      zone2.visible = z2;
    }
    const nieuw = renderer.info.programs.length - p0;
    T.shaders += nieuw;
    if (nieuw && !parallel()) rust = 2;
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

  // nabewerking die pas bij sporen/zaal 2/het doolhof aangaat (feedback): die shaders ook alvast (anders ~120 ms bij het eerste gebruik,
  // bv. het eerste beeld terug uit het doolhof). FullScreenQuad tekent zonder scène: geen lampen, geen mist.
  function passesCompileren() {
    if (typeof feedback === 'undefined' || !feedback) return;
    for (const q of [feedback.quad, feedback.copy]) {
      const mesh = q && q._mesh; if (!mesh) continue;
      const nepP = { isScene: true, fog: null, environment: null, traverseVisible() {}, traverse(f) { f(mesh); } }, D = los();
      if (D) D.losCompileren(() => renderer.compile(nepP, camera), [mesh]); else renderer.compile(nepP, camera);
    }
  }

  // doolhof: de proefkamers en -gangen van de kern, per beeld ~3 ms of tot er iets zwaars gebeurde (bouwen, een nieuwe shader)
  let proef = null;
  function stapProef() {
    const t0 = performance.now(), p0 = renderer.info.programs.length;
    for (;;) {
      const r = proef.next();
      if (r.done) { proef = null; T.doolhofShaders = renderer.info.programs.length - T.p0; return true; }
      if (r.value === 'rust' || performance.now() - t0 > 3) break;
    }
    const nieuw = renderer.info.programs.length - p0;
    if (nieuw > 0) { T.shaders += nieuw; if (!parallel()) rust = 2; }
    return false;
  }
  function naarTexturen() {
    T.fase = 'texturen'; T.texStart = performance.now();
    texLijst = texturenVan(zone2, []);
    if (KW.stand === 'hoog' || KW.stand === 'midden') texLijst.push(...muurschilderingen());
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
    const t0 = performance.now(), fase0 = T.fase;
    try {
      if (T.fase === 'shaders') {
        if (stapCompile(STANDEN[T.stap]) && ++T.stap >= STANDEN.length) {
          try { passesCompileren(); } catch (e) { console.warn('voorwarm: nabewerking', e); }
          const P = window.doolhof && window.doolhof.proef;
          if (P && typeof P.stappen === 'function') { T.fase = 'doolhof'; proef = P.stappen(); T.p0 = renderer.info.programs.length; }
          else naarTexturen();
        }
      } else if (T.fase === 'doolhof') {
        if (stapProef()) T.fase = 'linken';
      } else if (T.fase === 'linken') {  // wachten tot de driver alle shaders gelinkt heeft (alleen nakijken), hooguit ~10 s
        if (!T.linkStart) T.linkStart = performance.now();
        const D = los();
        if (!D || D.losKlaar() || performance.now() - T.linkStart > 10000) { T.linkMs = Math.round(performance.now() - T.linkStart); naarTexturen(); }
      } else if (T.fase === 'texturen') {
        if (stapTex()) { T.fase = 'klaar'; T.klaar = true; }
      }
    } catch (e) { console.warn('voorwarm', e); T.fase = 'fout'; T.klaar = true; }
    const ms = performance.now() - t0;
    T.ms += ms; if (ms > T.langste) { T.langste = ms; T.langsteFase = fase0; }
    // na een lange stap (zware shader ~0,1 s) zoveel gewone beelden rust dat het gemiddelde onder ~20 ms blijft: de bewaker van
    // club/kwaliteit.js zakt bij > 40 ms gemiddeld over 3 s naar midden
    if (ms > 12) rust = Math.max(rust, Math.ceil(ms / 10));
  }
  clubHooks.push(stap);
  window.clubVoorwarm = { klaar: () => T.klaar, toestand: () => {
    const t = texLijst && texLijst[0], im = t && t.image;
    return Object.assign({}, T, { open: texLijst ? texLijst.length : null, wachtOp: im ? (im.src || im.constructor.name) + ' ' + (decode.get(im) === 'klaar' ? 'klaar' : decode.has(im) ? 'decode' : '') : t ? 'laden' : null });
  } };
})();

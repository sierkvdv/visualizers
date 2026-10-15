// Meetstand voor als de club op een apparaat hapert: alleen actief met ?diag in de link.
// Meet 15 s lang waar de tijd per beeld heen gaat (updates, hooks, tekenen, WebGL-aanroepen zoals shaders compileren
// en texturen uploaden) en stuurt één regel naar ./diag?d=... (komt in de nginx-accesslog van club.sierk.dev).
(() => {
  const TVB = /Android TV|GoogleTV|SmartTV|SMART-TV|Tizen|Web0S|webOS|AFT[A-Z]|BRAVIA|CrKey/i.test(navigator.userAgent);
  if (!/[?&]diag\b/.test(location.search) || /[?&]diag=bench\b/.test(location.search) || TVB) return;  // op een tv is ?diag de testronde
  const T = {}, N = {}, errs = [];
  const tel = (k, ms) => { T[k] = (T[k] || 0) + ms; N[k] = (N[k] || 0) + 1; };
  const timed = (k, f) => function () { const t0 = performance.now(); try { return f.apply(this, arguments); } finally { tel(k, performance.now() - t0); } };
  addEventListener('error', e => errs.length < 4 && errs.push(String(e.message).slice(0, 120)));
  const ce = console.error; console.error = function () { if (errs.length < 4) errs.push([...arguments].map(String).join(' ').slice(0, 120)); return ce.apply(console, arguments); };
  // WebGL-aanroepen tellen die op sommige GPU's duur zijn (compileren, uploaden, terugleggen)
  const gl = renderer.getContext();
  for (const k of ['compileShader', 'linkProgram', 'getProgramParameter', 'texImage2D', 'texSubImage2D', 'readPixels', 'bufferData', 'generateMipmap', 'clientWaitSync', 'finish'])
    if (typeof gl[k] === 'function') gl[k] = timed('gl.' + k, gl[k].bind(gl));
  renderer.render = timed('render', renderer.render.bind(renderer));
  if (typeof composer !== 'undefined' && composer) composer.render = timed('composer', composer.render.bind(composer));
  for (const k of ['updateSlug', 'updateWorms', 'updateWalkers', 'updateHeld', 'updateCigs', 'updateSmoke', 'updateFog', 'updateFlecks', 'updateMoments', 'separate', 'updateCamera', 'pose', 'analyse', 'spectrum'])
    if (typeof window[k] === 'function') window[k] = timed(k, window[k]);

  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:99;font:12px monospace;color:#0f0;background:rgba(0,0,0,.7);padding:4px 6px;pointer-events:none';
  document.body.appendChild(box);
  let frames = 0, t0 = performance.now(), start = 0, done = false;
  const lus = () => { frames++; requestAnimationFrame(lus); };
  requestAnimationFrame(lus);
  const info = () => {
    const ri = renderer.info, dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      ua: navigator.userAgent.replace(/Mozilla\/5\.0 |\(KHTML, like Gecko\) /g, '').slice(0, 110),
      gpu: dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)).slice(0, 60) : '?',
      gl2: renderer.capabilities.isWebGL2, dpr: devicePixelRatio, pr: renderer.getPixelRatio(),
      cv: renderer.domElement.width + 'x' + renderer.domElement.height,
      kw: window.clubKwaliteit ? clubKwaliteit.stand + '/' + clubKwaliteit.keuze : '-',
      laad: typeof LAAD !== 'undefined' ? LAAD.klaar + '/' + LAAD.totaal : '-',
      prog: ri.programs ? ri.programs.length : -1, calls: ri.render.calls, tris: ri.render.triangles,
      tex: ri.memory.textures, geo: ri.memory.geometries, hidden: document.hidden,
    };
  };
  const stuur = (fase, extra) => {
    const d = Object.assign({ fase, t: Math.round((performance.now() - t0) / 1000) }, info(), extra || {}, errs.length ? { err: errs } : {});
    new Image().src = 'diag?d=' + encodeURIComponent(JSON.stringify(d));
  };
  setTimeout(() => stuur('10s'), 10000);
  const tick = () => {
    if (done) return;
    const now = performance.now(), klaar = typeof LAAD === 'undefined' || LAAD.klaar >= LAAD.totaal;
    if (!start && (klaar ? now - t0 > 8000 : now - t0 > 45000)) {  // meten zodra alles binnen is (of na 45 s)
      start = now; frames = 0; for (const k in T) { T[k] = 0; N[k] = 0; }
      info.prog0 = renderer.info.programs ? renderer.info.programs.length : -1;
    }
    const sec = (now - (start || t0)) / 1000;
    box.textContent = start ? `meten ${Math.min(15, sec).toFixed(0)}/15 s  ${(frames / Math.max(sec, 0.001)).toFixed(1)} fps` : `wachten op laden ${typeof LAAD !== 'undefined' ? LAAD.klaar + '/' + LAAD.totaal : ''}`;
    if (start && sec >= 15) {
      done = true;
      const per = {};  // ms per beeld per onderdeel (en aantal aanroepen per beeld voor gl.*)
      for (const k in T) if (N[k]) per[k] = Math.round(T[k] / Math.max(frames, 1) * 10) / 10 + (k.startsWith('gl.') ? '/' + Math.round(N[k] / Math.max(frames, 1)) + 'x' : '');
      stuur('meting', { fps: Math.round(frames / sec * 10) / 10, frames, prog0: info.prog0, per });
      box.textContent = `klaar: ${(frames / sec).toFixed(1)} fps — verstuurd, dank je!`;
      setTimeout(() => stuur('60s'), Math.max(0, 60000 - (now - t0)));
      return;
    }
    setTimeout(tick, 500);
  };
  setTimeout(tick, 500);
})();

// Testronde (?diag=bench, en op een tv gewoon ?diag): vaste camera en vaste vloer, zodat elke stap hetzelfde beeld meet.
// Meet een paar combinaties van de tv-stand, kiest de lichtste die vloeiend loopt (>= 28 fps) en bewaart die op dit apparaat (S.tv).
(() => {
  const TVB = /Android TV|GoogleTV|SmartTV|SMART-TV|Tizen|Web0S|webOS|AFT[A-Z]|BRAVIA|CrKey/i.test(navigator.userAgent);
  if (!/[?&]diag=bench\b/.test(location.search) && !(TVB && /[?&]diag\b/.test(location.search))) return;
  const K = window.clubKwaliteit;
  if (!K || !K.tvZet) return;
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:99;font:14px monospace;color:#0f0;background:rgba(0,0,0,.75);padding:6px 8px;pointer-events:none';
  document.body.appendChild(box);
  const stuur = x => { new Image().src = 'diag?d=' + encodeURIComponent(JSON.stringify(x)); };
  SHOTS.testronde = { w: 0, beats: 1e9, make: () => ({}), at() { camPos.set(8.6, 3.3, 8.6); camLook.set(0, 1.0, -1.2); camFov = 60; } };  // overzicht: vloer, dj, palen, publiek
  const STAPPEN = [
    ['basis', { lambert: false, minder: false, bundels: true }],
    ['lambert', { lambert: true, minder: false, bundels: true }],
    ['lambert + minder figuren', { lambert: true, minder: true, bundels: true }],
    ['lambert + zonder bundels', { lambert: true, minder: false, bundels: false }],
    ['lambert + minder + zonder bundels', { lambert: true, minder: true, bundels: false }],
    ['basis', { lambert: false, minder: false, bundels: true }]];
  const VOORKEUR = [1, 2, 3, 4];  // eerst wat het meest op het origineel lijkt
  const fps = ms => new Promise(r => { let n = 0; const a = performance.now(); const f = () => { n++; if (performance.now() - a < ms) requestAnimationFrame(f); else r(Math.round(n / (performance.now() - a) * 10000) / 10); }; requestAnimationFrame(f); });
  const wacht = ms => new Promise(r => setTimeout(r, ms));
  const uit = [], t0 = performance.now(), oud = { cam: S.cam, floor: S.floor };
  (async () => {
    while (typeof LAAD !== 'undefined' && LAAD.klaar < LAAD.totaal && performance.now() - t0 < 60000) { box.textContent = 'testronde: laden ' + LAAD.klaar + '/' + LAAD.totaal; await wacht(500); }
    K.zet('minimaal');  // vaste stand, geen bewaker die meeschakelt
    S.cam = 'testronde'; S.floor = 'tegels';
    await wacht(3000);
    for (let i = 0; i < STAPPEN.length; i++) {
      const [naam, cfg] = STAPPEN[i];
      box.textContent = `testronde ${i + 1}/${STAPPEN.length}: ${naam}…`;
      K.tvZet(cfg);
      await wacht(5000);  // ander materiaal of andere bezetting: shaders en figuren opnieuw
      const f = await fps(6000);
      uit.push(f);
      stuur({ fase: 'bench3', stap: naam, fps: f, cv: renderer.domElement.width + 'x' + renderer.domElement.height });
    }
    let keus = VOORKEUR.find(i => uit[i] >= 28);
    if (keus === undefined) keus = VOORKEUR.reduce((a, b) => (uit[b] > uit[a] ? b : a));
    K.tvZet(STAPPEN[keus][1]);
    S.cam = oud.cam === 'testronde' ? 'auto' : oud.cam; S.floor = oud.floor; save();
    K.zet('auto');
    const gl = renderer.getContext(), dbg = gl.getExtension('WEBGL_debug_renderer_info');
    stuur({ fase: 'bench3-klaar', gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '?', uit: Object.fromEntries(STAPPEN.map(([n], i) => [n + (i === 5 ? ' 2' : ''), uit[i]])), gekozen: STAPPEN[keus][0] });
    box.textContent = `klaar: gekozen "${STAPPEN[keus][0]}" (${uit[keus]} fps), onthouden — dank je!`;
  })();
})();

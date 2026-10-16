// VJ-laag op de ledwand achter de dj: scroller, woorden op de tel, golfvorm, pixel-mapping, countdown en live-camera (IMAG).
// Eigen vlak net vóór de fractalwand. Zolang een modus loopt gaan de equalizerstaven uit en dimt de fractal tot de helft.
(function () {
  const CW = 160, CH = 56;  // ledraster
  const cv = document.createElement('canvas');
  cv.width = CW; cv.height = CH;
  const g = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;

  // live-camera: kleine opname vanaf de voorkant van de dj-tafel de zaal in
  const rt = new THREE.WebGLRenderTarget(192, 72, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
  const imagCam = new THREE.PerspectiveCamera(50, 14.8 / 5.2, 0.3, 40);  // beeldverhouding van de wand, anders uitgerekt
  const imagLook = new THREE.Vector3();

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: tex }, level: { value: 0 }, imag: { value: 0 }, imagMap: { value: rt.texture },
      tint: { value: new THREE.Color() }, tint2: { value: new THREE.Color() }, glitch: { value: 0 }, time: { value: 0 },
    },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D map, imagMap; uniform float level, imag, glitch, time; uniform vec3 tint, tint2; varying vec2 vUv;
      float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
      void main() {
        vec2 grid = vec2(${CW}.0, ${CH}.0), gp = vUv * grid, cell = floor(gp), cel = fract(gp);
        // rond ledpunt; van ver (led kleiner dan ~2 px) egaal gemiddeld, anders moiré
        float mask = 1.0 - smoothstep(0.28, 0.5, length(cel - 0.5));
        mask = mix(mask, 0.45, smoothstep(0.3, 0.7, fwidth(gp.x)));
        // glitch: rijbanden schuiven hele leds opzij
        float tick = floor(time * 30.0), band = floor(cell.y / 5.0);
        float sh = glitch * step(0.5, hash(band * 7.13 + tick)) * floor((hash(band + tick * 1.7) - 0.5) * 40.0);
        vec2 uv = (vec2(cell.x + sh, cell.y) + 0.5) / grid;
        uv.x = fract(uv.x);
        vec3 c = texture2D(map, uv).rgb;
        if (imag > 0.5) {  // live-beeld in de twee paletkleuren, met scanlines en kleurscheiding bij glitch
          vec3 v = texture2D(imagMap, uv).rgb;
          float r2 = texture2D(imagMap, uv + vec2(glitch * 0.02, 0.0)).r;
          float lum = clamp(dot(v, vec3(0.3, 0.59, 0.11)) * 1.9, 0.0, 1.0);
          vec3 duo = mix(tint * lum * 1.4, mix(tint2, vec3(1.0), 0.45), smoothstep(0.6, 1.0, lum));
          duo = mix(duo, v * 2.2, 0.3);
          duo.r += glitch * max(0.0, r2 - v.r) * 2.0;
          float scan = mod(cell.y, 2.0) < 1.0 ? 1.0 : 0.7;
          scan *= 0.85 + 0.35 * pow(0.5 + 0.5 * sin((uv.y * 1.5 - time * 0.35) * 6.28318), 12.0);
          c += duo * scan;
        }
        gl_FragColor = vec4(c * level * (mask + 0.25), 1.0);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  mat.extensions.derivatives = true;
  const layer = new THREE.Mesh(new THREE.PlaneGeometry(14.8, 5.2), mat);
  layer.position.set(0, 3.3, -10.72);
  layer.visible = false;
  scene.add(layer);

  // --- tekenhulp ---
  const F = px => 'bold ' + px + 'px Impact, "Arial Black", sans-serif';
  const col = new THREE.Color(), WHITE = new THREE.Color(1, 1, 1);
  const ch8 = v => Math.min(255, Math.max(0, v * 255)) | 0;
  const css = (c, k) => { k = k === undefined ? 1 : k; return 'rgb(' + ch8(c.r * k) + ',' + ch8(c.g * k) + ',' + ch8(c.b * k) + ')'; };
  const clear = () => { g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.fillStyle = '#000'; g.fillRect(0, 0, CW, CH); };
  const metrics = new Map();
  function measure(text, px) {  // breedte en hoogte van de letters (gecachet)
    const key = px + text;
    let m = metrics.get(key);
    if (!m) {
      g.font = F(px);
      const t = g.measureText(text);
      m = { w: t.width, asc: t.actualBoundingBoxAscent || px * 0.76, desc: t.actualBoundingBoxDescent || 0 };
      metrics.set(key, m);
    }
    return m;
  }
  // tekst gecentreerd en zo groot als past (sy = gewenste hoogte in leds)
  function bigText(text, cx, cy, hLeds, maxW, stretch) {
    const m = measure(text, 60), sy = hLeds / (m.asc + m.desc), sx = Math.min(sy * (stretch || 1.15), maxW / m.w);
    g.save();
    g.font = F(60); g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.translate(cx, cy); g.scale(sx, sy);
    g.fillText(text, 0, (m.asc - m.desc) / 2);
    g.restore();
  }

  // (1) scroller: letters los gezet zodat ze apart kunnen veren
  const SCROLL = 'DEEP SAMSO CLUB • BLOODLINE PROJECT • DEEP STEPPER b2b SAMSONIGHT • ';
  let glyphs = null, scrollW = 0, scrollX = 0, scrollBase = 44;
  function layoutScroll() {
    g.font = F(44);
    glyphs = []; let x = 0;
    for (const ch of SCROLL) {
      const w = ch === '•' ? 16 : g.measureText(ch).width;
      glyphs.push({ ch, x, w }); x += w + 1.5;
    }
    scrollW = x;
    scrollBase = 28 + measure('H', 44).asc / 2;
  }
  function drawScroll(dt) {
    if (!glyphs) layoutScroll();
    scrollX = (scrollX + dt * 30 / Math.max(0.25, period)) % scrollW;  // 30 leds per tel
    g.font = F(44); g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    for (let rep = 0; rep < 2; rep++) for (const q of glyphs) {
      const x = q.x - scrollX + rep * scrollW;
      if (x > CW || x + q.w < 0) continue;
      const jump = pulse * 7 * (0.55 + 0.45 * Math.sin(q.x * 0.13 + beatPos * Math.PI));
      col.copy(pal[0]).lerp(pal[1], Math.min(1, Math.max(0, (x + q.w / 2) / CW))).lerp(WHITE, pulse * pulse * 0.25);
      g.fillStyle = css(col, 0.7 + 0.3 * pulse);
      if (q.ch === '•') { g.beginPath(); g.arc(x + q.w / 2, 28 - jump, 4.5, 0, TAU); g.fill(); }
      else g.fillText(q.ch, x, scrollBase - jump);
    }
  }

  // (2) één woord per tel over de volle hoogte; elke eerste tel van de maat omgekeerd
  const WORDS = ['DEEP', 'SAMSO', 'BLOOD', 'LINE', 'DEEPER'];
  function drawWord(b, phi) {
    const w = WORDS[((b - modeStart) % WORDS.length + WORDS.length) % WORDS.length];
    const k = 0.3 + 0.7 * pulse;
    col.copy(pal[b & 1]).lerp(WHITE, Math.pow(pulse, 3) * 0.6);
    if (b % 4 === 0) {  // vlak vol, letters uitgespaard
      g.fillStyle = css(col, k * 0.85); g.fillRect(0, 0, CW, CH);
      g.fillStyle = '#000';
    } else g.fillStyle = css(col, k);
    bigText(w, CW / 2, CH / 2, 50 + 4 * pulse, 154, 1.25);
  }

  // (3) golfvorm: echte audio als die er is, anders opgebouwd uit de banden; spectrum als vlam vanuit het midden
  let wbuf = null, gain = 1;
  const wy = new Float32Array(81), WAVE_PASSES = [[-1, 0.35], [1, 1]];
  function drawWave(t) {
    let peak = 0;
    if (analyser && !native) {
      if (!wbuf) wbuf = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(wbuf);
      let s0 = 0;  // stijgende nuldoorgang: dan staat de golf stil
      for (let i = 1; i < 512; i++) if (wbuf[i - 1] < 128 && wbuf[i] >= 128) { s0 = i; break; }
      for (let x = 0; x <= 80; x++) { const v = (wbuf[Math.min(wbuf.length - 1, s0 + x * 8)] - 128) / 128; wy[x] = v; peak = Math.max(peak, Math.abs(v)); }
    } else {
      for (let x = 0; x <= 80; x++) {
        const v = bands[0].v * 0.7 * Math.sin(x * 0.075 - beatPos * TAU) + bands[1].v * 0.35 * Math.sin(x * 0.29 + t * 7) + bands[2].v * 0.2 * Math.sin(x * 1.1 - t * 19);
        wy[x] = v; peak = Math.max(peak, Math.abs(v));
      }
    }
    gain += (Math.min(5, 0.9 / Math.max(peak, 0.05)) - gain) * 0.1;
    // vlammen: bas in het midden, hoog naar buiten, omhoog en omlaag
    const gr = g.createLinearGradient(0, 2, 0, CH - 2);
    gr.addColorStop(0, css(pal[0], 0.15)); gr.addColorStop(0.5, css(col.copy(pal[1]).lerp(WHITE, 0.2), 0.75)); gr.addColorStop(1, css(pal[0], 0.15));
    g.fillStyle = gr;
    for (let j = 0; j < 14; j++) {
      const v = (spectrum(2 * j) + spectrum(2 * j + 1)) / 2, h = Math.max(1, v * 26 * (0.9 + 0.1 * Math.random()));
      const w = 80 / 14;
      g.fillRect(80 + j * w + 0.5, 28 - h, w - 1, 2 * h);
      g.fillRect(80 - (j + 1) * w + 0.5, 28 - h, w - 1, 2 * h);
    }
    // lijn: horizontaal gespiegeld, plus een zwakke spiegeling verticaal
    g.lineJoin = 'round'; g.lineCap = 'round';
    for (const [flip, a] of WAVE_PASSES) {
      g.beginPath();
      for (let x = 80; x >= 0; x--) { const y = 28 - flip * wy[x] * gain * 24; x === 80 ? g.moveTo(80 - x, y) : g.lineTo(80 - x, y); }
      for (let x = 1; x <= 80; x++) g.lineTo(80 + x, 28 - flip * wy[x] * gain * 24);
      g.globalAlpha = a * 0.4; g.lineWidth = 7; g.strokeStyle = css(pal[1]); g.stroke();
      g.globalAlpha = a; g.lineWidth = 2.5; g.strokeStyle = css(col.copy(pal[1]).lerp(WHITE, 0.55), 0.8 + 0.2 * pulse); g.stroke();
    }
    g.globalAlpha = 1;
  }

  // (4) pixel-mapping: 8x3 blokken, chases op de achtste noten
  const BX = 8, BY = 3, blk = new Float32Array(BX * BY), blkC = new Uint8Array(BX * BY);
  let lastEighth = -1, pixPat = 0;
  const h2 = n => { const s = Math.sin(n * 91.345) * 47453.5453; return s - Math.floor(s); };
  function stepPixels(e) {
    const pat = (pixPat + Math.floor(e / 8)) % 6;  // om de 4 tellen een ander patroon
    for (let i = 0; i < BX * BY; i++) {
      const c = i % BX, r = Math.floor(i / BX);
      let on;
      if (pat === 0) { const k = e % 24, rr = Math.floor(k / 8); on = r === rr && c === (rr & 1 ? 7 - k % 8 : k % 8); }  // slang
      else if (pat === 1) { const k = e % 14; on = c === (k < 8 ? k : 14 - k); }  // kolom heen en weer
      else if (pat === 2) on = ((c + r + e) & 1) === 0;  // dambord
      else if (pat === 3) { const k = e % 8; on = Math.floor(Math.abs(c - 3.5)) === (k < 4 ? k : 7 - k); }  // midden naar buiten en terug
      else if (pat === 4) on = h2(e * 24 + i) > 0.68;  // vonken
      else on = (c + r) % 8 === e % 8;  // diagonaal
      if (on) { blk[i] = 1; blkC[i] = (c + r + (e >> 1)) & 1; }
    }
  }
  function drawPixels(dt) {
    const e = Math.floor(beatPos * 2);
    if (e !== lastEighth) { lastEighth = e; stepPixels(e); }
    const fade = Math.exp(-dt * 5);
    for (let i = 0; i < BX * BY; i++) {
      const c = i % BX, r = Math.floor(i / BX);
      const x0 = Math.round(c * CW / BX) + 1, x1 = Math.round((c + 1) * CW / BX) - 1;
      const y0 = Math.round(r * CH / BY) + 1, y1 = Math.round((r + 1) * CH / BY) - 1;
      g.fillStyle = css(col.copy(pal[blkC[i]]).lerp(WHITE, blk[i] > 0.9 ? 0.25 : 0), 0.04 + 0.96 * blk[i]);
      g.fillRect(x0, y0, x1 - x0, y1 - y0);
      blk[i] *= fade;
    }
  }

  // (5) countdown: groot cijfer per tel, streepjes ernaast tellen mee af
  function drawCount(b, phi) {
    const n = 16 - (b % 16);
    col.copy(pal[n & 1]).lerp(WHITE, (1 - n / 8) * 0.7 + pulse * 0.2);
    g.fillStyle = css(col, 0.45 + 0.55 * pulse);
    bigText(String(n), CW / 2, CH / 2, 50 * (1 + 0.25 * (1 - phi) * (1 - phi)), 90, 1.1);
    g.fillStyle = css(pal[0], 0.8);
    for (let k = 0; k < n; k++) { g.fillRect(6 + k * 6, 20, 3, 16); g.fillRect(CW - 9 - k * 6, 20, 3, 16); }
  }

  // (6) IMAG: alleen een REC-stip, LIVE en zoekerhoeken over het camerabeeld
  function drawImagOverlay(b) {
    g.fillStyle = css(col.setRGB(1, 0.1, 0.08), b & 1 ? 1 : 0.3);
    g.beginPath(); g.arc(9, 9, 3.2, 0, TAU); g.fill();
    g.font = F(11); g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillStyle = 'rgb(190,190,190)'; g.fillText('LIVE', 15, 13);
    g.strokeStyle = 'rgb(120,120,120)'; g.lineWidth = 1;
    g.beginPath();
    for (const [x, y, dx, dy] of [[3, 3, 1, 1], [CW - 3, 3, -1, 1], [3, CH - 3, 1, -1], [CW - 3, CH - 3, -1, -1]]) {
      if (x === 3 && y === 3) continue;  // daar staat LIVE
      g.moveTo(x + 0.5 * dx + 10 * dx, y + 0.5 * dy); g.lineTo(x + 0.5 * dx, y + 0.5 * dy); g.lineTo(x + 0.5 * dx, y + 0.5 * dy + 8 * dy);
    }
    g.stroke();
  }

  // DROP: één tel volle witte wand, letters uitgespaard (phi = voortgang van de drop)
  function drawDrop(phi) {
    g.fillStyle = css(WHITE, 1 - 0.35 * phi); g.fillRect(0, 0, CW, CH);
    g.fillStyle = '#000';
    bigText('DROP', CW / 2, CH / 2, 50, 150, 1.4);
  }

  function renderImag(now) {
    const side = Math.floor(beatPos / 16) & 1 ? 1 : -1;
    imagCam.position.set(2.4 * side, 3.2, -6.9);
    imagLook.set(1.6 * Math.sin(now * 0.17) - 0.6 * side, 0.7 + 0.3 * Math.sin(now * 0.11), 3);
    imagCam.lookAt(imagLook);
    const vm = mirror.visible, vb = ball.visible, prev = renderer.getRenderTarget();
    layer.visible = false; mirror.visible = false; ball.visible = false;
    try {
      renderer.setRenderTarget(rt);
      renderer.render(scene, imagCam);
    } finally {  // ook bij een fout: doel en zichtbaarheid terug, anders tekent de kern in rt
      renderer.setRenderTarget(prev);
      layer.visible = true; mirror.visible = vm; ball.visible = vb;
    }
    imagFresh = true;
  }

  // --- regie: welke modus wanneer ---
  const MODES = ['scroll', 'woord', 'golf', 'pixel', 'imag'];
  let mode = 'geen', lastPick = '', modeStart = 0, lastB = -1, dropEnd = -1, dropT0 = 0, lastDropB = -99, forcedUntil = -1;
  let hiS = 0.3, hiF = 0.3, loF = 0.3, imagFresh = false, overlayOk = false;
  window.clubLedwand = { get imag() { return mode === 'imag'; } };  // club/optimaliseer.js: figuren in zaal 1 blijven dan bewegen (de wand filmt ze)
  function setMode(m, b) {
    if (m !== mode) bars.visible = true;  // bij elke wissel terug; de hook zet ze daarna weer uit als er iets loopt
    mode = m; modeStart = b;
    if (m === 'pixel') { pixPat = Math.floor(Math.random() * 6); blk.fill(0); lastEighth = -1; }
    if (m === 'imag') { imagFresh = false; drawOverlay(b); }
  }
  function drawOverlay(b) { clear(); drawImagOverlay(b); tex.needsUpdate = true; overlayOk = true; }
  function pickMode(b) {
    if (Math.random() < 0.4) return setMode('geen', b);
    const m = pick(MODES.filter(q => q !== lastPick));
    lastPick = m;
    setMode(m, b);
  }
  const regie = () => window.clubRegie || null;  // van lichtregie.js, als die geladen is
  function buildUp() {  // opbouw: van clubRegie, of zelf: hoog stijgt en de bas valt weg
    const R = regie();
    if (R && R.stand !== undefined) return R.stand === 'opbouw';
    return live && hiF > hiS * 1.12 + 0.03 && hiF > 0.3 && loF < 0.3;
  }
  function onDrop() {  // altijd op de echte beatPos: tb kan ontbreken of afgerond zijn
    const b = Math.floor(beatPos);
    if (b === lastDropB) return;  // via startMoment én clubRegie: maar één keer
    lastDropB = b;
    setMode('drop', b);
    dropT0 = beatPos;
    dropEnd = beatPos - b > 0.5 ? b + 2 : b + 1;  // laat in de tel: tot het eind van de volgende, anders flitst hij maar even
    forcedUntil = dropEnd + 16;  // daarna precies 16 tellen woorden
  }
  if (typeof startMoment === 'function') {
    const orig = startMoment;
    startMoment = function (k, tb) {
      const r = orig(k, tb);
      if (k === 'drop') { try { onDrop(); } catch (e) { console.error('ledwand', e); } }
      return r;
    };
  }

  clubHooks.push((dt, now) => {
    const k = 1 - Math.exp(-dt / 6), kf = 1 - Math.exp(-dt / 1.2);
    hiS += (bands[2].v - hiS) * k; hiF += (bands[2].v - hiF) * kf; loF += (bands[0].v - loF) * kf;

    // drop die lichtregie.js zonder startMoment start (geen figuren geladen, of te kort na een ander moment)
    const R = regie();
    if (R && R.stand === 'drop' && R.dropBeat >= 0 && R.dropBeat !== lastDropB && Math.floor(beatPos) - R.dropBeat <= 1) onDrop();

    const b = Math.floor(beatPos), phi = beatPos - b;
    if (b !== lastB) {
      lastB = b;
      if (mode === 'drop' && b >= dropEnd) setMode('woord', b);
      if (forcedUntil >= 0) { if (b >= forcedUntil) { forcedUntil = -1; pickMode(b); } }
      else if (b % 16 === 0) pickMode(b);  // ook het einde van een countdown
      // countdown in de laatste 8 tellen vóór het volgende blok van 16; gaat voor de gewone wissel
      if (forcedUntil < 0 && mode !== 'count' && 16 - (b % 16) <= 8 && buildUp()) setMode('count', b);
      if (mode === 'imag') drawOverlay(b);
    }

    const on = mode !== 'geen';
    layer.visible = on;
    if (!on) { bars.visible = true; mat.uniforms.imag.value = 0; return; }
    bars.visible = false;
    wallFx.material.uniforms.level.value *= 0.5;

    // in de tweede zaal is de wand niet te zien: niets tekenen of renderen
    if (camera.position.z > TUN_END - 0.5) return;
    const imagOk = !(shot && shot.kind === 'trip');
    const eff = mode === 'imag' && !imagOk ? 'golf' : mode;
    const u = mat.uniforms, dp = Math.min(1, Math.max(0, (beatPos - dropT0) / Math.max(0.01, dropEnd - dropT0)));
    u.time.value = now % 1000;  // klein houden: de hash in de shader verliest anders precisie na uren draaien
    u.imag.value = eff === 'imag' ? 1 : 0;
    u.tint.value.copy(pal[0]); u.tint2.value.copy(pal[1]);
    u.glitch.value = eff === 'drop' ? 0.8 * (1 - dp) : eff === 'imag' && pulse > 0.8 ? (pulse - 0.8) * 5 : 0;
    u.level.value = (eff === 'drop' ? 1 : eff === 'imag' ? 0.75 : 0.85) * (now < strobeUntil ? 0.35 : 1);

    if (eff === 'imag') {  // de kern ververst de bol op %3 === 0; meteen bij de start, anders staat er een oud beeld
      if (!overlayOk) drawOverlay(b);  // na de trip staat de golf nog op het canvas
      if (frameNo % ((typeof KW !== 'undefined' && KW.imag) || 3) === 1 || !imagFresh) renderImag(now);  // midden/laag: minder vaak (kwaliteit.js)
      return;
    }
    clear(); overlayOk = false;
    if (eff === 'scroll') drawScroll(dt);
    else if (eff === 'woord') drawWord(b, phi);
    else if (eff === 'golf') drawWave(now);
    else if (eff === 'pixel') drawPixels(dt);
    else if (eff === 'count') drawCount(b, phi);
    else if (eff === 'drop') drawDrop(dp);
    tex.needsUpdate = true;
  });
})();

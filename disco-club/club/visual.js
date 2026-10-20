// VJ-laag (S.visual, toets J): psychedelische visuals óver het clubbeeld, zoals de oude Windows Media Player-visualisaties maar vetter,
// voor op een ledscherm achter of naast een dj. 'mix' = blendt op de beats over de club heen (zacht in de groove, hard in de drop),
// 'vol' = alleen de visuals. Bronnen die de club al heeft: de effectkamer-shaders uit doolhof/effect.js (olie/vloeistof, fractal,
// hypnose, warp, tunnel) op een plat vlak, en de ledpatronen van doolhof/led.js (plasma, tunnel, interferentie, radar, ...). Daar
// overheen een feedback-pass: caleidoscoop (4-12 spiegels), olie-vervorming (domain warp op ruis), zoom/draai-sporen, kleurrotatie op de
// tel, witte flits op de strobe. Elke 8 tellen (drop: 4, break: 16) een nieuwe combinatie, overvloeiend op de tel; de drop knipt hard.
// Alles in halve resolutie (max 1280x720), drie extra platte passes. Werkt ook in LIVE (regie en bezoekers zien hetzelfde ritme, niet
// hetzelfde beeld: de loting is lokaal). Test: S.visual = 'vol'; clubVisual.info(); clubVisual.forceer = { fx: 'vloeistof', kal: 8 }.
(function () {
  'use strict';
  if (typeof THREE === 'undefined' || typeof renderer === 'undefined' || typeof naTekenHooks === 'undefined' || typeof clubHooks === 'undefined') return;
  const D = window.doolhof || {}, f = v => ({ value: v });
  const FX_SOORTEN = ['vloeistof', 'fractal', 'hypnose', 'warp', 'tunnel'];  // oneindig/glitch hebben texturen van de kamer nodig
  const LED_BRONNEN = ['kosmos', 'neon', 'lava', 'ijs', 'jungle', 'synth'];
  const V = window.clubVisual = { forceer: null, info };

  // --- schermen (halve resolutie) ---
  const PR = Math.min(1, 0.5 * (window.devicePixelRatio || 1));
  let W = 2, H = 2;
  const rtOpt = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false, generateMipmaps: false };
  const rtFx = new THREE.WebGLRenderTarget(2, 2, rtOpt), rtLed = new THREE.WebGLRenderTarget(2, 2, rtOpt);
  const rtA = new THREE.WebGLRenderTarget(2, 2, rtOpt), rtB = new THREE.WebGLRenderTarget(2, 2, rtOpt);
  let vorige = rtA, huidige = rtB;
  function maat() {
    const w = Math.min(1280, Math.max(2, Math.floor(innerWidth * PR))), h = Math.min(720, Math.max(2, Math.floor(innerHeight * PR)));
    if (w === W && h === H) return;
    W = w; H = h;
    for (const r of [rtFx, rtLed, rtA, rtB]) r.setSize(W, H);
    comp.uniforms.uAsp.value = W / H;
  }

  // --- platte scène: één quad, per pass een ander materiaal ---
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadGeo = new THREE.PlaneGeometry(2, 2);
  const quad = new THREE.Mesh(quadGeo, null); quad.frustumCulled = false;
  const scn = new THREE.Scene(); scn.add(quad);
  function pas(mat, doel) { quad.material = mat; renderer.setRenderTarget(doel); renderer.render(scn, cam); }

  // --- laag 1: effectkamer-shader op een plat vlak (de vloer van een denkbeeldige kamer 12 x 7 m) ---
  const fxMats = {};
  const FX_VS = `uniform vec3 uMaat; varying vec3 vP, vN, vW; varying vec2 vUv;
    void main() { vUv = uv; vN = vec3(0.0, 1.0, 0.0); vP = vec3((uv.x - 0.5) * uMaat.x, 0.0, (uv.y - 0.5) * uMaat.z); vW = vP; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
  function fxMat(soort) {
    if (fxMats[soort]) return fxMats[soort];
    const FX = D.effect; if (!FX || !FX.SH || !FX.SH[soort]) return null;
    const extra = { uO: f(new THREE.Vector3()), uMaat: f(new THREE.Vector3(7, 4, 4)), uZaad: f(Math.floor(Math.random() * 97) + 0.37) };
    const m = new THREE.ShaderMaterial({ uniforms: Object.assign({}, FX.U, extra), vertexShader: FX_VS, fragmentShader: FX.KOP + FX.SH[soort],
      defines: { ZW: 0 }, extensions: { derivatives: true }, depthTest: false, depthWrite: false });
    fxMats[soort] = m;
    return m;
  }

  // --- laag 2: ledpatroon van doolhof/led.js (één groot scherm, fijne pitch) ---
  const ledMats = {};
  function ledMat(bron) {
    if (ledMats[bron]) return ledMats[bron];
    if (!D.led || typeof D.led.scherm !== 'function') return null;
    try {
      const m = D.led.scherm({ bron, maat: { w: 16, h: 9 }, pitch: 0.025, modi: { patroon: 1 }, zaad: Math.random() * 1000, helder: 1.2 });
      m.depthTest = false; m.depthWrite = false;
      ledMats[bron] = m;
      return m;
    } catch (e) { console.warn('visual: ledscherm', e); return null; }
  }
  const GL2 = !!(renderer.capabilities && renderer.capabilities.isWebGL2);  // led.js bouwt GLSL3-shaders op WebGL2: dan in/out i.p.v. attribute/varying
  const LED_VS = GL2 ? `precision highp float; in vec2 uv; in vec3 position; out vec2 vUv; out float vZ; void main() { vUv = uv; vZ = 0.0; gl_Position = vec4(position.xy, 0.0, 1.0); }`
    : `precision highp float; attribute vec2 uv; attribute vec3 position; varying vec2 vUv; varying float vZ; void main() { vUv = uv; vZ = 0.0; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

  // --- laag 3: compositie + feedback (sporen, caleidoscoop, olie, kleurrotatie) ---
  const comp = new THREE.ShaderMaterial({
    uniforms: {
      tFx: f(rtFx.texture), tLed: f(rtLed.texture), tPrev: f(rtA.texture),
      uAsp: f(1), uT: f(0), uPuls: f(0), uEn: f(0), uBas: f(0), uFlits: f(0), uDrop: f(0), uOpb: f(0),
      uWfx: f(1), uWled: f(0), uKal: f(0), uKalRot: f(0), uWarp: f(0.2), uOil: f(0.01), uTrail: f(0.9), uFzoom: f(1.0), uFrot: f(0), uHue: f(0.01),
      uChroma: f(0), uInvert: f(0), uMirror: f(0),
    },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `precision highp float;
      uniform sampler2D tFx, tLed, tPrev;
      uniform float uAsp, uT, uPuls, uEn, uBas, uFlits, uDrop, uOpb, uWfx, uWled, uKal, uKalRot, uWarp, uOil, uTrail, uFzoom, uFrot, uHue, uChroma, uInvert, uMirror;
      varying vec2 vUv;
      #define TAU 6.2831853
      float h21(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float vn(vec2 p) { vec2 i = floor(p), q = fract(p); q = q * q * (3.0 - 2.0 * q);
        return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), q.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), q.x), q.y); }
      vec3 hue(vec3 c, float a) { const vec3 k = vec3(0.57735); float co = cos(a), si = sin(a); return c * co + cross(k, c) * si + k * dot(k, c) * (1.0 - co); }
      vec2 kal(vec2 p) {
        if (uKal < 1.5) return p;
        float a = atan(p.y, p.x) + uKalRot, r = length(p), seg = TAU / uKal;
        a = mod(a, seg); a = abs(a - seg * 0.5);
        return r * vec2(cos(a), sin(a));
      }
      vec3 bron(vec2 p) {
        vec2 uv = p / vec2(uAsp, 1.0) + 0.5;
        if (uMirror > 0.5) uv.x = abs(fract(uv.x * 0.5 + 0.5) * 2.0 - 1.0);  // spiegel over het midden
        uv = fract(uv);
        vec3 a = texture2D(tFx, uv).rgb, b = texture2D(tLed, uv).rgb;
        vec3 c = a * uWfx + b * uWled;
        float l = dot(c, vec3(0.299, 0.587, 0.114));
        c = mix(vec3(l), c, 1.35);                       // verzadigder
        return pow(max(c, 0.0), vec3(1.3)) * 1.15;        // meer contrast: donker donkerder, licht iets feller
      }
      void main() {
        vec2 p = (vUv - 0.5) * vec2(uAsp, 1.0);
        vec2 pk = kal(p);
        // olie: domain warp op trage ruis, sterker op de kick
        vec2 w = vec2(vn(pk * 2.5 + uT * 0.25), vn(pk * 2.5 - uT * 0.2 + 7.3)) - 0.5;
        vec2 q = pk + w * uWarp * (0.35 + 0.65 * uPuls);
        vec3 cur = bron(q);
        if (uChroma > 0.001) { cur.r = bron(q + vec2(uChroma, 0.0)).r; cur.b = bron(q - vec2(uChroma, 0.0)).b; }
        // sporen: vorig beeld ingezoomd en gedraaid, langs de olie meegetrokken, kleur doorgedraaid
        float c = cos(uFrot), s = sin(uFrot);
        vec2 pf = mat2(c, -s, s, c) * p * uFzoom + w * uOil;
        vec3 prev = texture2D(tPrev, pf / vec2(uAsp, 1.0) + 0.5).rgb;
        prev = hue(prev, uHue) * uTrail;
        vec3 col = max(clamp(cur, 0.0, 1.0), prev);  // sporen: het vorige beeld dooft (uTrail) onder het nieuwe weg, telt nooit op tot wit
        col = mix(col, 1.0 - col, uInvert);
        col = mix(col, vec3(1.0), uFlits * 0.7);
        float vig = 1.0 - 0.45 * dot(p, p) / (1.0 + uAsp * uAsp);
        col = max(col - 0.1, 0.0) * 1.12;  // zwartniveau: de grijze waas eruit, zwart blijft zwart
        gl_FragColor = vec4(col * vig, 1.0);
      }`,
    depthTest: false, depthWrite: false,
  });
  // naar het scherm: 'vol' dekkend, 'mix' met een beat-envelop als alpha (screen-achtig via additief op een gedimd clubbeeld is te fel: gewoon mengen)
  const toon = new THREE.ShaderMaterial({
    uniforms: { tIn: f(rtA.texture), uAlpha: f(1) },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'uniform sampler2D tIn; uniform float uAlpha; varying vec2 vUv; void main() { gl_FragColor = vec4(texture2D(tIn, vUv).rgb, uAlpha); }',
    transparent: true, depthTest: false, depthWrite: false,
  });

  // --- regie: elke frase een nieuwe combinatie, overvloeiend op de tel ---
  const ST = { groove: 0, break: 1, opbouw: 2, drop: 3 };
  const een = a => a[Math.floor(Math.random() * a.length)];
  const r = (a, b) => a + Math.random() * (b - a);
  let autoM = null, autoTot = 0;
  let doel = null, nu = null, fraseB = -1, dropGezien = null, tijd = 0, kalRot = 0, hueT = 0, alpha = 0, aan = false, wasAan = false;
  function loot(st) {
    const F = V.forceer || {};
    const drop = st === 'drop', brk = st === 'break';
    const kalKeus = drop ? [0, 6, 8, 8, 12, 16] : brk ? [0, 0, 0, 4, 6] : [0, 0, 4, 6, 8];
    return {
      fx: F.fx || een(FX_SOORTEN), led: F.led || een(LED_BRONNEN),
      wfx: F.wfx !== undefined ? F.wfx : r(0.55, 1.0), wled: F.wled !== undefined ? F.wled : (Math.random() < 0.7 ? r(0.3, 0.9) : 0),
      kal: F.kal !== undefined ? F.kal : een(kalKeus),
      warp: F.warp !== undefined ? F.warp : (brk ? r(0.25, 0.6) : r(0.05, 0.35)),
      oil: r(0.004, 0.03),
      trail: F.trail !== undefined ? F.trail : (brk ? r(0.9, 0.96) : drop ? r(0.6, 0.85) : r(0.8, 0.92)),
      fzoom: drop ? r(1.004, 1.03) : r(0.985, 1.012),
      frot: r(-0.012, 0.012) * (drop ? 2 : 1),
      hue: r(-0.03, 0.03),
      kalV: r(-0.4, 0.4),
      mirror: Math.random() < 0.3 ? 1 : 0,
      chroma: drop ? r(0, 0.006) : 0,
    };
  }
  function naar(a, b, k) { for (const key in b) if (typeof b[key] === 'number') a[key] += (b[key] - a[key]) * k; else a[key] = b[key]; }

  clubHooks.push((dt, now) => {
    aan = typeof S !== 'undefined' && S.visual && S.visual !== 'uit';
    if (D.effect) D.effect.altijd = aan;
    if (!aan) { wasAan = false; return; }
    const sh = D.show || {}, st = sh.stand || 'groove', R = window.clubRegie;
    const b = typeof beatPos === 'number' ? beatPos : now * 2, B = Math.floor(b);
    const lengte = st === 'drop' ? 4 : st === 'break' ? 16 : 8;
    const fr = Math.floor(B / lengte);
    const nieuweDrop = !!R && st === 'drop' && R.dropBeat !== dropGezien;
    if (nieuweDrop) dropGezien = R.dropBeat;
    if (!nu || !wasAan) { nu = loot(st); doel = Object.assign({}, nu); fraseB = fr; wasAan = true; }
    if (fr !== fraseB || nieuweDrop) { fraseB = fr; doel = loot(st); if (nieuweDrop) { Object.assign(nu, doel); } }
    // overvloeien: snel in de drop, traag in de break; de bron (fx/led) wisselt pas als de rest grotendeels over is
    naar(nu, doel, 1 - Math.exp(-dt * (st === 'drop' ? 6 : st === 'break' ? 1.2 : 2.5)));
    tijd += dt; kalRot += dt * nu.kalV; hueT += dt * (0.4 + 2.0 * (sh.drop || 0));
    const pu = typeof pulse === 'number' ? pulse : 0, en = typeof energy === 'number' ? energy : 0.6;
    const U = comp.uniforms;
    U.uT.value = tijd; U.uPuls.value = pu; U.uEn.value = en; U.uBas.value = typeof bands !== 'undefined' ? bands[0].v : 0;
    U.uFlits.value = sh.flits || 0; U.uDrop.value = sh.drop || 0; U.uOpb.value = sh.opbouw || 0;
    U.uWfx.value = nu.wfx; U.uWled.value = nu.wled; U.uKal.value = Math.round(nu.kal); U.uKalRot.value = kalRot;
    U.uWarp.value = nu.warp; U.uOil.value = nu.oil; U.uTrail.value = Math.min(0.93, nu.trail);
    U.uFzoom.value = nu.fzoom + 0.02 * pu * (st === 'drop' ? 1.5 : 1);  // pompt mee op de kick
    U.uFrot.value = nu.frot; U.uHue.value = nu.hue + 0.15 * pu * (sh.drop || 0); U.uChroma.value = nu.chroma * (0.3 + pu);
    U.uInvert.value = (sh.flits || 0) > 0.9 && st === 'drop' ? 1 : 0; U.uMirror.value = nu.mirror;
    // hoe de laag over de club ligt: per modus een eigen envelop; 'auto' loot elke 16-32 tellen een andere (drop: vaker vol of knippen)
    if (S.visual === 'auto') {
      if (!autoM || B >= autoTot || nieuweDrop) {
        const pot = st === 'drop' ? ['vol', 'vol', 'flits', 'flits', 'mix'] : st === 'break' ? ['golf', 'golf', 'mix', 'vol'] : ['mix', 'mix', 'golf', 'flits', 'vol'];
        let m = een(pot); if (m === autoM) m = een(pot);
        autoM = m; autoTot = B + (st === 'drop' ? 16 : een([16, 16, 24, 32]));
      }
    } else autoM = null;
    const modus = autoM || S.visual;
    let wil, snel = 8;
    const basis = st === 'drop' ? 0.75 + 0.2 * (sh.drop || 0) : st === 'opbouw' ? 0.3 + 0.5 * (sh.opbouw || 0) : st === 'break' ? 0.45 : 0.3;
    if (modus === 'vol') wil = 1;
    else if (modus === 'golf') { wil = 0.5 + 0.5 * Math.sin(b * Math.PI / (st === 'break' ? 32 : 16)); wil = 0.1 + 0.9 * wil * wil; snel = 3; }  // traag op en neer tot helemaal vol
    else if (modus === 'flits') {  // hard: per maat aan of uit, in de drop 2 tellen aan / 2 uit, op de kick een tik
      const maat = Math.floor(b / (st === 'drop' ? 2 : 4)), aanNu = st === 'drop' ? maat % 2 === 0 : (maat % 4 === 0 || maat % 4 === 2 && st !== 'break');
      wil = aanNu ? 1 : 0.08 * pu; snel = 40;
    } else wil = Math.min(1, basis + 0.2 * pu * en);
    alpha += (wil - alpha) * (1 - Math.exp(-dt * snel));
  });

  naTekenHooks.push(() => {
    if (!aan || !nu) return;
    maat();
    const fm = fxMat(nu.fx), lm = nu.wled > 0.01 ? ledMat(nu.led) : null;
    const oudTarget = renderer.getRenderTarget(), oudClear = renderer.autoClear;
    renderer.autoClear = true;
    if (fm) pas(fm, rtFx);
    if (lm) { if (lm.vertexShader !== LED_VS) { lm.vertexShader = LED_VS; lm.needsUpdate = true; } pas(lm, rtLed); }
    comp.uniforms.tPrev.value = vorige.texture;
    pas(comp, huidige);
    renderer.setRenderTarget(oudTarget);
    renderer.autoClear = false;
    toon.uniforms.tIn.value = huidige.texture; toon.uniforms.uAlpha.value = alpha;
    quad.material = toon; renderer.render(scn, cam);
    renderer.autoClear = oudClear;
    const t = vorige; vorige = huidige; huidige = t;
  });

  function info() { return { aan, stand: S.visual, modus: autoM || S.visual, nu: nu && Object.assign({}, nu, { kal: Math.round(nu.kal) }), alpha: +alpha.toFixed(2), maat: W + 'x' + H, fxKlaar: Object.keys(fxMats), ledKlaar: Object.keys(ledMats) }; }
})();

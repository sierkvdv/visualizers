// --- Strand: tropisch feeststrand bij nacht (of een diep paarse zonsondergang), een buitenkamer van het doolhof ---
// Sierk (17-10): na de clubgang "ineens een gekke jungle in ... of een tropisch party strand ofzo en daarna weer de lift tegenkomt na een
// buitenwandeling". Uit de gang door de rotspoort het zand op: palmen vol lichtjes, de zee met maanglitter en lichtgevende branding die op
// de tel aanrolt, een groot kampvuur, tiki-fakkels en lampionzakjes langs het pad, een bamboe dj-hut/bar (rieten dak, ledranden, tiki-maskers
// in uv-verf, flessenwand, speakers met pompende ledringen), vuurdraaiers (poi, staf, spuwer, ledhoepel) op het zand, publiek met
// glowsticks, een steiger met lampjes en vuurkorven de zee in, vuurwerk boven zee (opbouw: salvo dat op de drop knalt; drop: om de tel;
// groove: af en toe één) met de weerspiegeling in het water, wensballonnen die naar zee drijven (in de break de hoofdrol). Het pad (~43 m)
// loopt van de poort langs het water naar het feest (daar blijft de loper dansen, blijf) en verder naar de glazen lifttoren aan het eind.
// Bouwt op doolhof/buiten-basis.js (B = doolhof.buiten): hemel + rotsPoort + liftToren sluiten de wereld af (hemel op het verre vlak, rots
// vóór de gang, toren om de lift). Eigen in dit bestand: palmen (1 draw, wind en lichtjes in de shader), bouwwerk (hut, speakers, palen,
// steiger, korven: 1 draw, één shader met soorten), lantaarns, surfplanken, lampionzakjes, wensballonnen, vuurwerk (1 Points-draw, alle banen
// in de vertex-shader; JS zet per knal alleen 4 vectoren), waterreflecties (lampen en vuurwerk als trillende strepen op het water) en een
// eigen camera met 19 shots die op de tel knipt (8 tellen, drop 4, break 16, opbouw 8 -> 4) en kiest op waar de loper is (voor/feest/na).
// Alles licht zelf (ShaderMaterial met B.KOP, show-bus via B.U): break donker en traag, opbouw sneller, drop groot. Geometrie is per kamer
// (de kern ruimt hem met de groep op; InstancedMeshes ruimen hun instantiebuffers mee op), alleen shaderbronnen zijn gedeeld.
// ctx.zwaar (0 hoog, 1 laag, 2 minimaal/tv) schaalt palmen, publiek, fakkels, zakjes, ballonnen, vuurwerk en deeltjes.
// Registreert 'strand' { gewicht 0.7, buiten: true } (maak is een generator: de kern bouwt het in stukjes); laden na buiten-basis.js.
// Test (console): doolhof.start('strand') of doolhof.volgende = 'strand'; doolhof.strand.info() (laatste bouw, tellers);
// doolhof.strand.shot = 'zee' zet de camera vast op één shot (null = weer op de tel kiezen). Burning Man (17-10 avond): shots 'brand' (wijd vanaf het
// publiek) en 'brandOmhoog' (laag, omhoog); de camera knipt erheen bij aansteken en instorten; doolhof.strand.brand = het handvat van de
// actieve kamer (.ontsteek()), doolhof.strand.info().laatste.brand = welk kunstwerk waar.
// Op de muziek (17-10 avond, Sierk: "buiten licht gaat niet echt op de muziek"): alles slaat op de lichtklok van buiten-basis (uSlag op elke
// tel, uKick/uSnare op echte aanslagen, uMaat per maat). Lichtrig (B.lichtrig): 8 moving heads om en om op de nok en de dakrand van de hut
// schieten bundels over het publiek de lucht boven zee in (nooit landinwaarts: daar staat de Burning Man), pars voor de toog en aan de voet
// van de feestpalmen. Ledstrips, palmlampjes en slingers jagen in stappen per tel en flitsen op de klap, speakers pompen op de kick, de
// hut-lamp klapt op de tel en wisselt per maat van kleur (drop: per tel). doolhof.strand.info().rig = patroon/jager van de laatste rig.
(function () {
  'use strict';
  const doolhof = window.doolhof = window.doolhof || {};
  if (typeof THREE === 'undefined' || typeof clubHooks === 'undefined' || typeof doolhof.registreer !== 'function' || !doolhof.buiten) return;
  const B = doolhof.buiten, U = B.U, KOP = B.KOP, TAU = Math.PI * 2, NF = 8;  // NF = vuurwerk-slots (tegelijk in de lucht)
  const f = v => ({ value: v });
  const klem = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const glad = (x, a, b) => { const t = klem((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const kies = (r, a) => a[Math.min(a.length - 1, Math.floor(r() * a.length))];
  const schud = (a, r) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
  const geenStraal = B.geenStraal;
  const tel = { gebouwd: 0, knallen: 0, laatste: null };
  let laatsteRig = null;  // lichtrig van de laatst gebouwde strandkamer (info)
  const shMat = (vs, fs, eigen, o) => new THREE.ShaderMaterial(Object.assign({ uniforms: Object.assign({}, U, eigen || {}), vertexShader: KOP + vs, fragmentShader: KOP + fs }, o || {}));
  const addMat = (vs, fs, eigen, o) => shMat(vs, fs, eigen, Object.assign({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }, o || {}));
  const QUAD_P = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), QUAD_I = [0, 1, 2, 0, 2, 3];
  function quadGeo(n, attrs) {  // n instanties van een quad (-1..1), attrs { naam: [Float32Array, grootte] }
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(QUAD_P, 3)); g.setIndex(QUAD_I);
    for (const k in attrs) g.setAttribute(k, new THREE.InstancedBufferAttribute(attrs[k][0], attrs[k][1]));
    g.instanceCount = n;
    return g;
  }
  function inst(geo, mat, n) {  // InstancedMesh die zijn instantiebuffers meeneemt als de kern de geometrie weggooit
    const m = new THREE.InstancedMesh(geo, mat, n);
    geo.addEventListener('dispose', () => m.dispose());
    m.frustumCulled = false;
    return m;
  }
  const M4 = new THREE.Matrix4(), Q1 = new THREE.Quaternion(), Q2 = new THREE.Quaternion(), EU = new THREE.Euler(), PV = new THREE.Vector3(), SV = new THREE.Vector3(), KL = new THREE.Color();
  const AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);
  const PALETTEN = [[0xff2d95, 0x00e5ff, 0xffb000], [0xff5e00, 0x00f0ff, 0xb026ff], [0x39ff14, 0xff10f0, 0x00e5ff], [0xff3c7a, 0x2affd5, 0xffe14d], [0xb026ff, 0xff7a00, 0x00ffc8]];
  const KLEDING = [0xff4f9a, 0x2ad4ff, 0xffc53a, 0x3dff8e, 0xff7b2e, 0xd9d9e8, 0x8c5bff, 0x1a1a22, 0x14141a, 0xff3355];
  const NEON = B.NEON || [0x39ff14, 0xff10f0, 0x00f0ff, 0xfff01f, 0xff5e00, 0xb026ff, 0xff073a];

  // =====================================================================================================================================
  // shaders (ShaderMaterial: three zet precisie, matrices, position/normal/uv en instanceMatrix/instanceColor er zelf voor; B.KOP ervoor)
  // =====================================================================================================================================
  const PAL_GLSL = `uniform vec3 uPa, uPb, uPc;
vec3 palK(float i) { float j = mod(floor(i), 3.0); return j < 0.5 ? uPa : j < 1.5 ? uPb : uPc; }
`;
  // --- bouwwerk: hut, speakers, palen, steiger en korven in één mesh; aS = soort, aK = vrij getal per stuk ---
  const BOUW_VS = `attribute float aS; attribute vec2 aK;
varying vec3 vN, vW, vP; varying vec2 vUv, vK; varying float vS;
void main() {
  vS = aS; vK = aK; vUv = uv; vP = position;
  vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
  const BOUW_FS = PAL_GLSL + `varying vec3 vN, vW, vP; varying vec2 vUv, vK; varying float vS;
uniform vec4 uL[4];      // lampen in kamer-ruimte: xyz + sterkte (0 = kampvuur: flakkert met uVlam)
uniform vec3 uLk[4];
uniform vec3 uMaanR, uVoor;
uniform float uKust, uZx;
vec3 lampen(vec3 n, vec3 p) {
  vec3 c = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    vec3 L = uL[i].xyz - p; float d2 = max(dot(L, L), 0.01);
    float k = uL[i].w * max(dot(n, L * inversesqrt(d2)), 0.0) / (1.0 + d2 * 0.12);
    if (i == 0) k *= uVlam * (0.8 + 0.12 * sin(uT * 11.3) + 0.08 * sin(uT * 23.1));
    c += uLk[i] * k;
  }
  return c + vec3(0.22, 0.27, 0.45) * max(dot(n, uMaanR), 0.0) * 0.06;
}
void main() {
  vec3 n = normalize(vN), V = normalize(cameraPosition - vW);
  float rim = pow(1.0 - abs(dot(n, V)), 2.5), niv = 1.0 - 0.55 * uBlack, s = vS, voor = dot(n, uVoor);
  vec3 Lm = lampen(n, vP), c = vec3(0.0);
  vec3 randK = mix(uPa, uPb, 0.5 + 0.5 * sin(vP.y * 0.8 + vP.z * 0.3 + uT * 0.5)) * rim * (0.6 + 0.6 * uPuls) * niv;
  if (s < 0.5) {            // bamboe en hout (vK.x = lengte van het stuk: knopen; 0 = glad, palen in het water)
    float ring = vK.x > 0.0 ? smoothstep(0.42, 0.48, abs(fract(vUv.y * vK.x / 0.42) - 0.5)) : 0.0;
    vec3 bas = vec3(0.09, 0.062, 0.03) * (0.7 + 0.4 * vn(vec2(vUv.x * 7.0, vUv.y * max(vK.x, 2.0) * 3.0))) * (1.0 - 0.5 * ring);
    c = bas * (0.12 + Lm * 1.4) + randK * 0.12;
  } else if (s < 1.5) {     // planken (steiger, toog, schappen)
    float pl = fract(vP.x / 0.24), naad = smoothstep(0.07, 0.0, min(pl, 1.0 - pl));
    vec3 bas = vec3(0.075, 0.05, 0.03) * (0.7 + 0.5 * vn(vP.xz * vec2(1.5, 9.0))) * (1.0 - 0.6 * naad);
    c = bas * (0.12 + Lm * 1.4) + randK * 0.08;
  } else if (s < 2.5) {     // rieten dak: sprieten langs de helling, onderkant warm van de bar
    float st = 0.6 * vn(vec2(vUv.x * 60.0, vUv.y * 5.0)) + 0.4 * vn(vec2(vUv.x * 150.0, vUv.y * 2.0));
    c = vec3(0.085, 0.06, 0.025) * (0.5 + 0.8 * st) * (0.1 + Lm * 1.6) + vec3(1.0, 0.55, 0.2) * max(-n.y, 0.0) * 0.07 * (0.8 + 0.3 * uPuls) + randK * 0.1;
  } else if (s < 3.5) {     // rafelrand onder het dak (uv.x in m, uv.y 0 boven .. 1 onder)
    float sp = vn(vec2(vUv.x * 38.0, 1.7));
    if (vUv.y > 0.5 + 0.5 * sp) discard;
    c = vec3(0.08, 0.055, 0.024) * (0.4 + 0.9 * vn(vec2(vUv.x * 90.0, vUv.y * 3.0))) * (0.12 + Lm * 1.6) + randK * 0.12;
  } else if (s < 4.5) {     // toog: voorkant met tiki-maskers in uv-verf, een golf licht loopt erlangs; zigzagbanden
    c = vec3(0.07, 0.045, 0.025) * (0.7 + 0.4 * vn(vP.zy * 6.0)) * (0.12 + Lm * 1.3);
    if (voor > 0.5) {
      vec2 q = vec2(vUv.x * 6.0, vUv.y), id = floor(q);
      vec2 cq = vec2((fract(q.x) - 0.5) * 0.77, (q.y - 0.5) * 1.02);
      float hh = h21(vec2(id.x, 3.0));
      float omtrek = abs(length(max(abs(cq) - vec2(0.2, 0.33), 0.0)) - 0.07);
      float oog = abs(length(vec2(abs(cq.x) - 0.11, cq.y - 0.13) * vec2(1.0, 1.3)) - 0.055 - 0.02 * hh);
      float mond = abs(length(max(abs(cq - vec2(0.0, -0.17)) - vec2(0.13, 0.025 + 0.035 * hh), 0.0)) - 0.012);
      float m = smoothstep(0.022, 0.006, min(omtrek, min(oog, mond)));
      float aan = exp(-((mod(uTel * 0.5, 8.0) - id.x - 1.0) * (mod(uTel * 0.5, 8.0) - id.x - 1.0)) * 0.7);
      c += palK(id.x + floor(uTel / 4.0)) * m * (0.22 + 1.1 * aan * (0.5 + 0.5 * uEn) + 0.7 * uSlag + 0.7 * uDrop * step(0.5, fract(uTel + hh))) * niv;
      float zz = abs(fract(vUv.x * 46.0) - 0.5) * 0.12;
      c += kl(vUv.x + uT * 0.1) * (smoothstep(0.014, 0.0, abs(vUv.y - 0.08 - zz)) + smoothstep(0.014, 0.0, abs(vUv.y - 0.92 + zz))) * (0.3 + 0.6 * uPuls) * niv;
    }
  } else if (s < 5.5) {     // ledstrips (dakrand, toog, mixer): looplicht in het palet, break ademt, drop knippert op de tel
    float a = vUv.y + vK.y * 0.25, stap = floor(uTel * (1.0 + isOpb() * step(0.5, uOpb)));
    float aan = step(mod(floor(a * 12.0) - stap, 3.0), 0.5);   // één op de drie segmenten aan, per tel een stap (eind opbouw: per achtste)
    float k = mix(0.2 + 0.85 * aan + 1.3 * uSlag + 0.4 * uKick, 0.12 + 0.12 * sin(uT * 1.3 + a * 6.0) + 0.25 * uSlag, isBreak());
    k += isDrop() * uSlag * 1.2;
    c = palK(vK.y + uMaat + floor(a * 4.0) + isDrop() * floor(uTel)) * k * 1.3 * niv;
  } else if (s < 6.5) {     // flessen: van achteren verlicht, een golf loopt per maat langs het schap
    float golf = exp(-(((vK.x - fract(uTel * 0.25)) * 7.0) * ((vK.x - fract(uTel * 0.25)) * 7.0)));
    float k = 0.16 + 0.9 * golf * (0.5 + 0.5 * uEn) + 0.45 * uSlag + 0.5 * uDrop * step(0.5, fract(uTel + vK.y * 0.37));
    c = neon(fract(vK.y * 0.17 + 0.05)) * k * (0.45 + 0.7 * rim) * niv;
  } else if (s < 7.5) {     // draaitafels: streepjesring die met de poi-klok meedraait, label pulst
    c = vec3(0.015);
    if (n.y > 0.5) {
      vec2 q = vUv - 0.5; float rr = length(q) * 2.0, a = atan(q.y, q.x);
      float streep = step(0.5, fract(a / TAU * 18.0 - uSpin * 0.75)) * smoothstep(0.98, 0.9, rr) * step(0.62, rr);
      c += (palK(1.0) * streep * (0.45 + 0.8 * uPuls) + palK(0.0) * smoothstep(0.28, 0.0, rr) * (0.35 + 0.9 * uPuls)) * niv;
    }
  } else if (s < 8.5) {     // achterwand: gevlochten bamboe met een gloed die meegolft (de dj als silhouet ervoor)
    vec2 q = vec2(vP.z, vP.y) * 7.0;
    float wv = abs(fract(q.x + step(0.5, fract(q.y)) * 0.5) - 0.5);
    float golf = 0.5 + 0.5 * sin(vP.z * 1.3 - uT * 1.6 + vP.y * 0.8);
    c = vec3(0.06, 0.04, 0.02) * (0.6 + 0.8 * wv) * (0.2 + Lm) + kl(vP.z * 0.08 + uT * 0.05) * (0.07 + 0.28 * golf * (0.4 + 0.6 * uPuls) + 0.2 * uDrop) * niv;
  } else {                  // speakers: voorkant twee woofers + tweeter, ledringen pompen op de bas
    c = vec3(0.012, 0.012, 0.016) * (0.3 + Lm) + randK * 0.15;
    if (voor > 0.5) {
      vec2 p = vec2((vUv.x - 0.5) * 0.95, vUv.y * 1.7);
      float pomp = max(uKick, 0.8 * uSlag) + 0.2 * uBas;   // de ringen pompen op de kick en op de tel
      float d1 = length(p - vec2(0.0, 0.5)), d2 = length(p - vec2(0.0, 1.15)), dm = min(d1, d2), dt = length(p - vec2(0.0, 1.56));
      c = mix(c, vec3(0.018) * (0.7 + 0.3 * sin(dm * 70.0 - pomp * 6.0)), smoothstep(0.33, 0.31, dm));
      float ring = smoothstep(0.025, 0.0, abs(dm - (0.34 + 0.025 * pomp)));
      vec3 rk = mix(palK(floor(uTel) + step(d2, d1) + vK.y), vec3(1.0), 0.6 * isDrop() * pow(1.0 - fract(uTel), 4.0));
      c += rk * ring * (0.35 + 1.5 * pomp) * niv;
      c += palK(vK.y + 2.0) * smoothstep(0.02, 0.0, abs(dt - 0.06)) * (0.4 + 0.8 * uPuls) * niv;
      c += palK(floor(uTel) + 1.0) * smoothstep(0.1, 0.0, dm) * pomp * 0.6 * niv;
    }
  }
  // water: blauwe schittering op alles vlak boven zee (palen, onderkant van de steiger)
  float zee = step(uKust, vP.x * uZx) * smoothstep(0.75, 0.0, vP.y);
  c += vec3(0.1, 0.5, 0.9) * zee * pow(vn(vP.xz * 2.5 + vec2(uT * 0.5, uT * 0.35) + vP.y * 2.0), 5.0) * 0.6 * niv;
  gl_FragColor = vec4(flitsWit(c), 1.0);
}`;
  // --- palmen: stam (buigt naar +x) + kroon; aD = (deel 0 stam / 1 blad, s langs, v dwars of hoek, fase van het blad) ---
  // instanceColor = (fase, soort lichtjes: 0 geen, ~0,33 warm, ~0,66 regenboog, ~0,95 show, windvariatie)
  const PALM_VS = `attribute vec4 aD;
varying vec4 vD; varying vec3 vN, vW, vR, vI; varying float vH;
void main() {
  vec3 p = position, iK = vec3(0.0);
#ifdef USE_INSTANCING_COLOR
  iK = instanceColor;
#endif
  float fase = iK.x * TAU;
  if (aD.x > 0.5) {   // blad: de punt wiegt het meest, op de bas een zwiep
    float k = aD.y * aD.y;
    float zw = 0.035 * sin(uT * (0.8 + 0.4 * iK.z) + fase + aD.w * 5.0) + 0.012 * sin(uT * 2.4 + aD.w * 11.0 + fase) + 0.03 * uBas * sin(uT * 7.0 + aD.w * 6.0);
    p.y += k * zw * 1.3; p.x += k * zw * 0.5 * cos(aD.w * TAU); p.z += k * zw * 0.5 * sin(aD.w * TAU);
  }
  p.x += (0.012 * sin(uT * 0.55 + fase) + 0.006 * uBas) * p.y * p.y;   // de hele palm zwaait traag
  vec4 r = instanceMatrix * vec4(p, 1.0), w = modelMatrix * r;
  vR = r.xyz; vW = w.xyz; vD = aD; vI = iK;
  vH = length(instanceMatrix[1].xyz);
  vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
  const PALM_FS = PAL_GLSL + `varying vec4 vD; varying vec3 vN, vW, vR, vI; varying float vH;
uniform vec3 uVuurP;
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 V = normalize(cameraPosition - vW);
  float rim = ((1.0 - abs(dot(n, V))) * (1.0 - abs(dot(n, V)))), niv = 1.0 - 0.55 * uBlack;
  vec3 Lv = uVuurP - vR; float dv = length(Lv);
  float vuur = max(dot(n, Lv / max(dv, 0.01)), 0.0) * 2.2 / (1.0 + dv * dv * 0.06) * uVlam * (0.82 + 0.1 * sin(uT * 11.3) + 0.08 * sin(uT * 23.1));
  vec3 c;
  if (vD.x < 0.5) {   // stam: ringen, warm aan de kant van het vuur, rand in het palet
    float t = vD.y, ring = smoothstep(0.3, 0.5, abs(fract(t * vH * 3.2) - 0.5));
    c = vec3(0.05, 0.034, 0.02) * (0.55 + 0.6 * ring) * (0.25 + vuur * vec3(1.0, 0.5, 0.2));
    c += mix(uPa, uPb, 0.5 + 0.5 * sin(vR.y * 0.35 + uT * 0.4)) * rim * 0.22 * (0.6 + 0.6 * uPuls) * niv;
    // lichtjes in een spiraal om de stam (~1 winding per meter, 9 lampjes per meter): jagen omhoog op de tel, break twinkelt, drop flitst
    float soort = vI.y;
    if (soort > 0.15) {
      float wd = fract(vD.z + t * vH * 0.9 + vI.x * 3.0), dw = min(wd, 1.0 - wd) * 1.4;
      float Nd = vH * 9.0, kI = floor(t * Nd), dl = (fract(t * Nd) - 0.5) * vH / Nd;
      float lamp = exp(-(dw * dw + dl * dl) / 0.0005) * smoothstep(0.03, 0.08, t) * smoothstep(0.99, 0.93, t);
      float u = kI / Nd;
      float aanP = step(mod(kI - floor(uTel) * 3.0 + floor(vI.x * 9.0), 9.0), 2.5);   // drie lampjes aan, per tel drie hoger
      float jaag = 0.22 + 0.75 * aanP + 1.1 * uSlag + 0.3 * uKick;
      float twinkel = 0.4 + 0.6 * sin(uT * (0.8 + h11(kI + vI.x * 40.0)) + kI * 3.7);
      float k = mix(jaag, twinkel + 0.3 * uSlag, isBreak()) + isDrop() * uSlag * 0.9 + 0.6 * isOpb() * uOpb * step(0.5, fract(uTel * 2.0 + u * 4.0)) + uFlits;
      vec3 lk = soort < 0.5 ? vec3(1.0, 0.7, 0.36) : soort < 0.85 ? neon(fract(kI * 0.13 + vI.x)) : palK(kI + floor(uTel / 4.0));
      c += lk * lamp * k * 1.4 * (1.0 - 0.3 * uBlack);
    }
  } else {            // blad: schuine blaadjes met gaten ertussen, bijna zwart, rand in het palet, gloeiende nerf
    float s = vD.y, av = abs(vD.z);
    float st = fract(s * 28.0 - av * 2.0 + vD.w * 7.0);
    if (av > 0.14 && st > 0.5 + 0.35 * (1.0 - av)) discard;
    if (av > 1.0 - 0.55 * s * s) discard;   // de punt loopt spits toe
    c = vec3(0.008, 0.022, 0.013) * (0.6 + 0.8 * h11(floor(s * 28.0 - av * 2.0) + vD.w * 50.0)) * (0.3 + vuur * vec3(1.0, 0.55, 0.25));
    c += mix(uPb, uPc, 0.5 + 0.5 * sin(vR.x * 0.2 + vR.z * 0.15 + uT * 0.3)) * rim * 0.28 * (0.55 + 0.6 * uPuls) * niv;
    c += vec3(0.18, 0.22, 0.38) * max(n.y, 0.0) * 0.05;
    float nerf = smoothstep(0.1, 0.0, av), golf = exp(-(((s - fract(uTel * mix(0.5, 1.0, isDrop()) + vI.x)) * 5.0) * ((s - fract(uTel * mix(0.5, 1.0, isDrop()) + vI.x)) * 5.0)));
    c += kl(vI.x + s * 0.35 + uT * 0.03) * nerf * (0.1 + 0.8 * golf * (0.4 + 0.6 * uEn) + 0.45 * uDrop) * niv;
    c += palK(vD.w * 9.0 + floor(uTel)) * smoothstep(0.75, 0.95, av) * uDrop * 0.5 * (0.5 + 0.5 * uPuls);   // uv-randjes in de drop
  }
  gl_FragColor = vec4(flitsWit(c), 1.0);
}`;
  // --- kleine instanced dingen: surfplanken (bol, geschaald) en lampionzakjes; instanceColor = eigen getallen ---
  const KLEIN_VS = `varying vec3 vN, vW, vL, vI;
void main() {
  vI = vec3(0.0);
#ifdef USE_INSTANCING_COLOR
  vI = instanceColor;
#endif
  vL = position;
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
  const PLANK_FS = PAL_GLSL + `varying vec3 vN, vW, vL, vI;
void main() {   // donkere plank, neon rand (tegenlicht) en een streep die op de tel omhoog jaagt; vI = (palet, fase, -)
  vec3 n = normalize(vN), V = normalize(cameraPosition - vW);
  float rim = pow(1.0 - abs(dot(n, V)), 3.0), niv = 1.0 - 0.5 * uBlack;
  float streep = smoothstep(0.1, 0.04, abs(vL.x)) + smoothstep(0.05, 0.0, abs(abs(vL.x) - 0.5)) * 0.6;
  float jaag = pow(0.5 + 0.5 * cos(TAU * (vL.y * 0.6 - uTel * 0.5 + vI.y)), 4.0);
  vec3 c = vec3(0.02, 0.018, 0.025) + palK(vI.x * 3.0 + 1.0) * rim * (0.35 + 0.5 * uPuls) * niv;
  c += palK(vI.x * 3.0) * streep * (0.2 + 0.9 * jaag + 0.8 * uSlag + 0.6 * uDrop) * niv;
  gl_FragColor = vec4(flitsWit(c), 1.0);
}`;
  const ZAK_FS = PAL_GLSL + `varying vec3 vN, vW, vL, vI;
void main() {   // papieren zakje met een kaarsje: warm of in het palet, uitgeknipte sterretjes, een lichtgolf loopt langs het pad naar de lift
  vec3 n = normalize(vN);
  float per = mix(mix(8.0, 2.0, isDrop()), 16.0, isBreak());
  float gp = fract(uTel / per) * 1.3 - 0.15, golf = exp(-(((vI.x - gp) * 9.0) * ((vI.x - gp) * 9.0)));
  float fl = 0.8 + 0.12 * sin(uT * 13.0 + vI.z * 40.0) + 0.08 * sin(uT * 29.0 + vI.z * 17.0);
  vec3 k = vI.y < 0.25 ? vec3(1.0, 0.55, 0.2) : palK(vI.y * 3.0);
  float h = clamp(vL.y / 0.26, 0.0, 1.0);
  vec2 sc = vec2(atan(vL.x, vL.z) * 2.2, vL.y * 26.0), sf = fract(sc) - 0.5;
  float gat = step(0.8, h21(floor(sc) + vI.z * 9.0)) * smoothstep(0.32, 0.12, length(sf)) * step(0.15, h) * step(h, 0.85);
  float sterk = (0.2 + 0.7 * pow(1.0 - h, 1.5) + 0.7 * gat) * fl * (0.5 + 1.3 * golf + 0.8 * uSlag + 0.4 * uDrop) * (1.0 - 0.4 * uBlack);
  vec3 c = n.y > 0.9 ? k * 1.4 * fl : k * sterk;
  gl_FragColor = vec4(flitsWit(c), 1.0);
}`;
  // --- lantaarns (bol, papier), hangen te wiegen ---
  const LAMP_VS = `varying vec3 vN, vW, vKl; varying float vZ;
void main() {
  vec3 kk = vec3(1.0);
#ifdef USE_INSTANCING_COLOR
  kk = instanceColor;
#endif
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  float z = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.61;
  w.x += 0.04 * sin(uT * 0.9 + z); w.z += 0.03 * cos(uT * 0.7 + z * 1.3);
  vW = w.xyz; vKl = kk; vZ = z;
  vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
  const LAMP_FS = `varying vec3 vN, vW, vKl; varying float vZ;
void main() {
  vec3 n = normalize(vN), V = normalize(cameraPosition - vW);
  float rib = 0.75 + 0.25 * smoothstep(0.0, 0.15, abs(fract(n.y * 4.0) - 0.5));
  float k = (0.55 + 0.2 * sin(uT * 3.0 + vZ * 7.0) + 0.85 * uSlag + 0.3 * uKick + 0.5 * uDrop) * (1.0 - 0.4 * uBlack);
  gl_FragColor = vec4(flitsWit(vKl * (0.45 + 0.6 * abs(dot(n, V))) * rib * k * 1.3), 1.0);
}`;
  // --- wensballonnen: stijgen traag op en drijven naar zee (alles als functie van de tijd), in de break de hoofdrol ---
  const BALLON_VS = `attribute vec4 iA;   // x, z (kamer), zaad, stijgsnelheid
uniform vec2 uWind; uniform float uCyc, uTop;
varying vec2 vC; varying vec3 vKl; varying float vA;
void main() {
  float z = iA.z, cyc = uCyc * (0.8 + 0.4 * h11(z * 7.3)), tt = mod(uT + z * cyc, cyc);
  vec3 p = vec3(iA.x, 0.6 + tt * iA.w, iA.y);
  p.xz += uWind * tt + vec2(sin(uT * 0.4 + z * 20.0), cos(uT * 0.33 + z * 13.0)) * 0.6 * min(1.0, tt * 0.1);
  float fade = smoothstep(0.0, 4.0, tt) * smoothstep(uTop, uTop * 0.7, p.y);
  vec4 mv = viewMatrix * (modelMatrix * vec4(p, 1.0));
  float s = 0.32 + 0.1 * h11(z * 3.1);
  mv.xy += position.xy * vec2(s * 0.8, s);
  vC = position.xy;
  vKl = mix(vec3(1.0, 0.5, 0.15), klH(z * 7.0), step(0.75, h11(z * 11.0)));
  vA = fade * (0.55 + 0.25 * sin(uT * 2.0 + z * 30.0)) * (1.0 + 0.8 * isBreak()) * (1.0 + 0.5 * uDrop + 0.3 * uPuls * uEn) * (1.0 - 0.2 * uBlack);
  gl_Position = projectionMatrix * mv;
}`;
  const BALLON_FS = `varying vec2 vC; varying vec3 vKl; varying float vA;
void main() {
  vec2 c = vC;
  float bw = 0.5 + 0.18 * c.y;
  float lijf = smoothstep(0.08, 0.0, abs(c.x) - bw) * smoothstep(0.08, 0.0, abs(c.y) - 0.82) * (0.55 + 0.45 * (0.5 - 0.5 * c.y));
  float vlam = exp(-(c.x * c.x * 18.0 + (c.y + 0.7) * (c.y + 0.7) * 30.0));
  float halo = exp(-dot(c, c) * 1.6) * 0.3;
  vec3 col = vKl * (lijf * 0.9 + halo) + vec3(1.0, 0.9, 0.6) * vlam * 1.5;
  if (max(col.r, max(col.g, col.b)) < 0.004) discard;
  gl_FragColor = vec4(col, vA);
}`;
  // --- vuurwerk: per slot een knal (uFw: plek + tijd van de knal), lanceerplek + stijgtijd (uFwL), kleur + stijl (uFwK), tweede kleur ---
  // aF = (slot, zaad, soort 0 ster / 1 raketspoor / 2 flits, spoorpunt), aG = 2 zaden. Stijlen: 0 bol, 1 ring, 2 treurwilg (goud), 3 palm.
  const VUURWERK_VS = `#define NF ${NF}
attribute vec4 aF; attribute vec2 aG;
uniform vec4 uFw[NF], uFwL[NF], uFwK[NF];
uniform vec3 uFwK2[NF];
varying vec3 vKl; varying float vA;
vec3 bol(float a, float b) { float z = a * 2.0 - 1.0, r = sqrt(max(0.0, 1.0 - z * z)), t = TAU * b; return vec3(r * cos(t), z, r * sin(t)); }
void main() {
  int i = int(aF.x + 0.5);
  vec4 Bp = uFw[i], Lp = uFwL[i], K = uFwK[i];
  float t = uT - Bp.w, stijl = K.w, sl = aF.w;
  vec3 p = Bp.xyz, col = K.rgb; float a = 0.0, sz = 0.0;
  if (aF.z < 0.5) {             // ster met twee spoorpunten erachter
    float tt = t - sl * 0.07, v0 = 11.0 + 4.0 * aG.y, k = 1.6, g = 3.2, duur = 2.4;
    vec3 dir = bol(aF.y, aG.x);
    if (stijl > 0.5 && stijl < 1.5) dir = normalize(vec3(dir.x, dir.y * 0.12 + 0.25 * dir.x, dir.z));
    else if (stijl > 1.5 && stijl < 2.5) { v0 *= 0.7; k = 1.1; g = 5.5; duur = 3.4; col = vec3(1.0, 0.72, 0.3); }
    else if (stijl > 2.5) { dir = normalize(vec3(dir.x, abs(dir.y) * 0.7 + 0.35, dir.z)); v0 *= 1.2; g = 6.5; duur = 2.8; }
    if (tt > 0.0 && tt < duur) {
      float life = tt / duur;
      p = Bp.xyz + dir * v0 * (1.0 - exp(-k * tt)) / k - vec3(0.0, 0.25 * g * tt * tt, 0.0);
      col = mix(col, uFwK2[i], smoothstep(0.3, 0.9, life * (0.5 + aG.y)));
      if (tt < 0.12) col = mix(vec3(1.0), col, tt / 0.12);
      a = pow(1.0 - life, 1.4) * (1.0 - sl * 0.33);
      if (life > 0.55) a *= 0.6 + 0.4 * step(0.5, h11(aF.y * 91.0 + floor(uT * 18.0)));
      sz = (0.8 - 0.4 * life) * (1.0 - sl * 0.3);
    }
  } else if (aF.z < 1.5) {      // raket: gouden spoor van de lanceerplek naar de knal
    float rise = Lp.w, tr = t + rise - sl * 0.05;
    if (rise > 0.05 && tr > 0.0 && tr < rise) {
      float k = tr / rise, e = 1.0 - (1.0 - k) * (1.0 - k);
      p = mix(Lp.xyz, Bp.xyz, e) + vec3(sin(tr * 30.0 + aF.y * 20.0), 0.0, cos(tr * 27.0)) * 0.05 * sl;
      col = vec3(1.0, 0.75, 0.4); a = (1.0 - sl / 8.0) * 0.9; sz = 0.22 * (1.0 - sl / 10.0);
    }
  } else if (t > 0.0 && t < 0.6) {   // flits: grote zachte gloed op de plek van de knal, de lucht licht even op
    col = mix(vec3(1.0), K.rgb, 0.5); a = exp(-t * 7.0) * 0.9; sz = 9.0;
  }
  a *= 1.0 - 0.2 * uBlack;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = clamp(sz * projectionMatrix[1][1] * uPx / max(0.5, -mv.z), 1.0, aF.z > 1.5 ? 220.0 : 64.0);
  vKl = col * 1.6; vA = a;
  gl_Position = a > 0.0 ? projectionMatrix * mv : vec4(2.0, 2.0, 2.0, 1.0);
}`;
  const VUURWERK_FS = `varying vec3 vKl; varying float vA;
void main() { vec2 c = gl_PointCoord * 2.0 - 1.0; float d = dot(c, c); if (d > 1.0) discard; gl_FragColor = vec4(vKl * (1.0 + 1.6 * exp(-d * 14.0)), exp(-d * 3.2) * vA); }`;
  // --- weerspiegeling op het water: per lamp (of vuurwerk-slot) een trillende streep van onder de lamp naar de kijker ---
  const SPIEGEL_VS = `#define NF ${NF}
attribute vec4 iP, iK;   // iP = lamp in kamer-ruimte + slot (0 = vaste lamp, n = vuurwerk-slot n-1); iK = kleur + breedte
uniform vec4 uFw[NF], uFwK[NF];
uniform vec2 uZd; uniform float uKust;
varying vec2 vC; varying vec3 vKl; varying float vA, vS;
void main() {
  vec3 L = iP.xyz, col = iK.rgb; float a, br = iK.w;
  if (iP.w > 0.5) {
    int i = int(iP.w - 0.5);
    float t = uT - uFw[i].w;
    L = uFw[i].xyz; col = uFwK[i].rgb; a = t > 0.0 ? 2.0 * exp(-t * 1.3) : 0.0;
  } else a = 0.55 + 0.25 * sin(uT * 3.0 + L.x * 2.0) + 0.3 * uPuls * uEn;
  vec3 Lw = (modelMatrix * vec4(L, 1.0)).xyz, C = cameraPosition;
  float wy = modelMatrix[3].y;
  vec3 M = vec3(Lw.x, 2.0 * wy - Lw.y, Lw.z);                       // spiegelbeeld van de lamp
  vec2 hit = mix(C.xz, M.xz, (C.y - wy) / max(C.y - M.y, 0.01));    // waar een vlakke spiegel hem zou tonen
  vec2 ver = mix(hit, Lw.xz, 0.75);                                 // ruw water: de streep loopt door naar onder de lamp
  vec2 ax = ver - hit; float l = length(ax); vec2 dir = l > 1e-3 ? ax / l : vec2(0.0, 1.0), nr = vec2(-dir.y, dir.x);
  vec2 xz = mix(hit, ver, position.y * 0.5 + 0.5) + nr * position.x * br * 0.35;
  vS = dot(xz - modelMatrix[3].xz, uZd) - uKust;
  vC = position.xy; vKl = col; vA = a * (1.0 - 0.4 * uBlack);
  gl_Position = projectionMatrix * viewMatrix * vec4(xz.x, wy + 0.004, xz.y, 1.0);
}`;
  const SPIEGEL_FS = `varying vec2 vC; varying vec3 vKl; varying float vA, vS;
void main() {
  if (vS < 0.3) discard;   // alleen op het water
  float y = vC.y, rib = 0.45 + 0.55 * sin(y * 22.0 + uT * 4.0 + vn(vec2(y * 6.0, uT * 1.5)) * 4.0);
  float m = exp(-vC.x * vC.x * (3.0 + 2.0 * rib)) * smoothstep(1.0, 0.3, abs(y)) * rib * smoothstep(0.3, 1.2, vS);
  gl_FragColor = vec4(vKl * 1.2, m * vA);
}`;

  // =====================================================================================================================================
  // geometrie-hulpjes
  // =====================================================================================================================================
  function palmGeo(Z) {  // één palm van hoogte 1 (schaal = hoogte in m): stam die naar +x buigt + kroon van bladeren (V-vorm, hangend)
    const P = [], A = [], I = [];
    const zij = [7, 6, 5][Z], ringen = [12, 9, 7][Z], NB = [10, 8, 7][Z], SEG = [9, 7, 5][Z];
    const as = t => 0.16 * t * t;
    for (let j = 0; j <= ringen; j++) {
      const t = j / ringen, cx = as(t), rr = 0.028 * (1 - 0.38 * t) + (j === 0 ? 0.008 : 0);
      for (let k = 0; k <= zij; k++) { const a = k / zij * TAU; P.push(cx + Math.cos(a) * rr, t, Math.sin(a) * rr); A.push(0, t, k / zij, 0); }
    }
    for (let j = 0; j < ringen; j++) for (let k = 0; k < zij; k++) { const a = j * (zij + 1) + k, b = a + 1, c = a + zij + 1, d = c + 1; I.push(a, c, b, b, c, d); }
    const kx = as(1);
    for (let b = 0; b < NB; b++) {
      const fi = b / NB * TAU + 0.35 * Math.sin(b * 2.3), L = 0.4 + 0.12 * Math.abs(Math.sin(b * 1.7 + 0.4)), op = 0.25 + 0.3 * Math.abs(Math.cos(b * 3.1));
      const dx = Math.cos(fi), dz = Math.sin(fi), px = -dz, pz = dx, s0 = P.length / 3, fase = b / NB;
      for (let s = 0; s <= SEG; s++) {
        const t = s / SEG, hd = L * t, dy = L * (op * t - 0.9 * t * t), bw = 0.07 * Math.sin(Math.PI * Math.pow(t, 0.7)) + 0.004;
        const cx = kx + dx * hd, cy = 1 + dy, cz = dz * hd;
        P.push(cx - px * bw, cy - bw * 0.4, cz - pz * bw); A.push(1, t, -1, fase);
        P.push(cx, cy, cz); A.push(1, t, 0, fase);
        P.push(cx + px * bw, cy - bw * 0.4, cz + pz * bw); A.push(1, t, 1, fase);
      }
      for (let s = 0; s < SEG; s++) { const a = s0 + s * 3; I.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('aD', new THREE.Float32BufferAttribute(A, 4));
    g.setIndex(I); g.computeVertexNormals();
    return g;
  }
  function bouwer() {  // vaste vormen (in een frame: positie + draaiing om y) met soort (aS) en vrij getal (aK); geo() voegt alles samen
    const delen = [], F = new THREE.Matrix4(), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), S = new THREE.Vector3();
    const v0 = new THREE.Vector3(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
    const b = {
      frame(x, z, yaw) { F.makeRotationY(yaw || 0).setPosition(x || 0, 0, z || 0); return b; },
      zet(geo, soort, k0, k1, pos, rot) {
        const n = geo.attributes.position.count, k = new Float32Array(n * 2);
        for (let i = 0; i < n; i++) { k[i * 2] = k0 || 0; k[i * 2 + 1] = k1 || 0; }
        geo.setAttribute('aS', new THREE.BufferAttribute(new Float32Array(n).fill(soort), 1));
        geo.setAttribute('aK', new THREE.BufferAttribute(k, 2));
        M.compose(P.set(pos[0], pos[1], pos[2]), Q.setFromEuler(E.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0)), S.set(1, 1, 1));
        geo.applyMatrix4(M.premultiply(F));
        delen.push(geo);
        return b;
      },
      cyl(rt, rb, h, seg, soort, k0, k1, pos, rot) { return b.zet(new THREE.CylinderGeometry(rt, rb, h, seg, 1), soort, k0, k1, pos, rot); },
      box(x, y, z, soort, k0, k1, pos, rot) { return b.zet(new THREE.BoxGeometry(x, y, z), soort, k0, k1, pos, rot); },
      vlak(pts, uvs, soort, uit) {  // drie- of vierhoek; uit = gewenste richting van de normaal (de volgorde draait om als dat nodig is)
        let p = pts.slice(), q = uvs.slice();
        v0.fromArray(p[0]); v1.fromArray(p[1]).sub(v0); v2.fromArray(p[2]).sub(v0);
        if (v1.cross(v2).dot(v0.fromArray(uit)) < 0) { p = p.reverse(); q = q.reverse(); }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute([].concat(...p), 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute([].concat(...q), 2));
        geo.setIndex(p.length === 4 ? [0, 1, 2, 0, 2, 3] : [0, 1, 2]);
        geo.computeVertexNormals();
        return b.zet(geo, soort, 0, 0, [0, 0, 0]);
      },
      geo() { if (!delen.length) return null; const g = samenvoegen(delen); g.computeBoundingSphere(); return g; },
    };
    return b;
  }

  // =====================================================================================================================================
  // camera: 19 shots (waarvan 2 op de Burning Man), knipt op de tel; de lijst hangt af van waar de loper is (voor het feest, op het feest, erna) en van de stand
  // =====================================================================================================================================
  function strandCam(ctx, o) {
    const r = ctx.rnd, { W, D, X, KUST } = o, HOOG = 18, VU = o.vuur, HU = o.hut, WT = o.wacht, PZ = o.pier.z;
    const BM = o.brand || null, SX = X(1);  // Burning Man-handvat (doolhof/buiten-brand.js) of null; SX = kant van de zee (+1/-1)
    const cp = new THREE.Vector3(), cl = new THREE.Vector3(), uit = { pos: cp, look: cl, fov: 60 }, lp = new THREE.Vector3(), tp = new THREE.Vector3();
    const dansers = (o.dansers || []).filter(Boolean), palm = o.palm;
    const plekVan = (x, v) => {
      if (!x.root) return v.set(x.x || 0, 0, x.z || 0);
      v.copy(x.root.position);
      if (x.root.parent && x.root.parent !== ctx.groep) { x.root.parent.localToWorld(v); ctx.groep.worldToLocal(v); }
      return v;
    };
    let zij = 1, dir = 1, a0 = 0, idx = 0, yaw = null, tLaatst = 0, blokNu = null, t0 = 0, shot = 'volg', faseNu = null, tKnip = -99, telNu = -1;
    let evGezien = BM ? BM.ev : 0, houdTot = -1, brandLaatst = -99, brandVorige = null;
    const recent = [];
    const S = {
      volg(u, lo, dt) {  // schouderhoogte achter en iets naast de loper
        if (!lo || !lo.root) return S.drone(u);
        plekVan(lo, lp);
        const doel = lo.root.rotation.y;
        if (yaw === null) yaw = doel; else { let dd = doel - yaw; dd = Math.atan2(Math.sin(dd), Math.cos(dd)); yaw += dd * Math.min(1, dt * 1.8); }
        const fx = Math.sin(yaw), fz = Math.cos(yaw);
        cp.set(lp.x - fx * 2.4 + fz * zij * 0.8, 1.65, lp.z - fz * 2.4 - fx * zij * 0.8); cl.set(lp.x + fx * 2.6, 1.35, lp.z + fz * 2.6); return 58;
      },
      tegemoet(u, lo) {  // voor de loper uit: hij loopt op de camera af
        if (!lo || !lo.root) return S.drone(u);
        plekVan(lo, lp);
        const yw = lo.root.rotation.y, fx = Math.sin(yw), fz = Math.cos(yw);
        cp.set(lp.x + fx * 3.6 + fz * zij * 0.9, 1.45, lp.z + fz * 3.6 - fx * zij * 0.9); cl.set(lp.x, 1.25, lp.z); return 50;
      },
      zee(u) {  // laag boven het water, terug naar het feest (vuur, dansers, palmen, hut)
        const z = WT.z + dir * (-5 + Math.min(10, 0.32 * u));
        cp.set(X(Math.min(W - 0.6, KUST + 3.4)), 0.8 + 0.12 * Math.sin(u * 0.6), z); cl.set(X(VU.u + 1.2), 1.45, VU.z + dir * 1.2); return 54;
      },
      branding(u) {  // op de waterlijn vlak boven het schuim, langs het strand (nooit onder de steiger door)
        const z0 = dir > 0 ? WT.z - 11 : Math.min(PZ - 1.8, WT.z + 11), z = z0 + dir * Math.min(10, 0.38 * u);
        cp.set(X(KUST - 0.25), 0.3, z); cl.set(X(KUST - 4.2), 1.0, z + dir * 9); return 70;
      },
      held(u) {  // laag bij een vuurdanser, omhoog naar de poi
        if (!dansers.length) return S.baan(u);
        plekVan(dansers[idx % dansers.length], tp);
        const a = a0 + dir * 0.15 * u;
        cp.set(tp.x + Math.sin(a) * 1.8, 0.4 + 0.05 * Math.sin(u * 0.7), tp.z + Math.cos(a) * 1.8); cl.set(tp.x, 1.7, tp.z); return 72;
      },
      dj(u) {  // over de hoofden naar de dj in zijn hut
        cp.set(X(HU.u + 5.6), 1.4 + 0.08 * Math.sin(u * 0.5), HU.z + zij * 1.6 - dir * Math.min(2.4, 0.12 * u)); cl.set(X(HU.u + 0.9), 1.55, HU.z); return 48;
      },
      achter(u) {  // in de hut achter de dj: zijn silhouet, het publiek, het vuur en de zee
        cp.set(X(HU.u - 0.75), 2.05, HU.z + zij * 0.75); cl.set(X(HU.u + 9), 1.1 + 0.3 * Math.sin(u * 0.2), HU.z - zij * 1.2 + dir * Math.min(3, 0.15 * u)); return 72;
      },
      drone(u) {  // hoog boven het strand, glijdt langs de kust en kijkt vooruit (feest, dan toren of rots)
        const z = -D * 0.55 * dir + dir * Math.min(D, 0.45 * u);
        cp.set(X(KUST * 0.4 + zij * 3), 11 + 2 * Math.sin(u * 0.15), z); cl.set(X(VU.u + 3), 0, z + dir * 14); return 62;
      },
      kraan(u) {  // stijgt op naast het feest en kantelt naar de lucht boven zee
        const k = glad(u, 0, 5.5);
        cp.set(X(WT.u - 0.6), 1.0 + 10 * k, WT.z - dir * 5.5); cl.set(X(VU.u + 14 + 14 * k), 1.3 + 11 * k, VU.z + dir * 3); return 64;
      },
      steiger(u) {  // op de steiger: terug naar het strand, of de zee op
        if (dir > 0) { cp.set(X(Math.min(14.2, 8.6 + 0.3 * u)), 2.15, PZ + zij * 0.4); cl.set(X(VU.u), 1.6, VU.z); }
        else { cp.set(X(Math.max(8.6, 14.2 - 0.3 * u)), 2.15, PZ - zij * 0.4); cl.set(X(30), 11, PZ + zij * 6); }
        return 60;
      },
      vuurwerk(u) {  // groothoek laag op het zand, omhoog naar de lucht boven zee
        cp.set(X(0.6 + zij * 0.4), 0.55, WT.z - 4 * dir + dir * 0.12 * u); cl.set(X(34), 16 + 1.5 * Math.sin(u * 0.3), WT.z + 5 * dir); return 74;
      },
      lantaarns(u) {  // de wensballonnen achterna de lucht in
        cp.set(X(2.0), 0.7, WT.z + zij * 3); cl.set(X(12 + 0.6 * u), 5 + 0.9 * Math.min(u, 20), WT.z + zij * 6); return 66;
      },
      baan(u) {  // traag rond het kampvuur, boven de hoofden
        const a = a0 + dir * 0.13 * u;
        cp.set(X(VU.u) + Math.sin(a) * 4.6, 2.45 + 0.3 * Math.sin(u * 0.3), VU.z + Math.cos(a) * 4.6); cl.set(X(VU.u), 1.0, VU.z); return 60;
      },
      palm(u) {  // aan de voet van een feestpalm recht omhoog: lichtjes, bladeren, slingers en de lucht
        if (!palm) return S.baan(u);
        const a = a0 + dir * 0.05 * u;
        cp.set(palm.x + Math.sin(a) * 1.3, 0.45, palm.z + Math.cos(a) * 1.3); cl.copy(palm.top); return 78;
      },
      // Burning Man (17-10 avond, Sierk: "niet echt een burning iets"): het kunstwerk zelf in beeld. Na het instorten kijken ze naar de hoop.
      brand(u) {  // groothoek vanaf de kant van het publiek (koppen als silhouet ervoor): het hele kunstwerk tegen de lucht; schuift traag in
        if (!BM) return S.baan(u);
        const v = BM.val, fu = BM.fx * SX, maxD = (-0.5 - BM.x * SX) / Math.max(0.25, fu);   // nooit voorbij u -0,5 (vuurdansers, pad, wachtplek)
        const d = Math.min(maxD, (BM.h * 1.08 + 3) * (1 - 0.4 * v)) - Math.min(3.5, 0.15 * u), zs = zij * (2.4 + 0.05 * BM.breed);
        cp.set(BM.x + BM.fx * d - BM.fz * zs, 2.4 + 3.6 * v + 0.12 * Math.sin(u * 0.4), BM.z + BM.fz * d + BM.fx * zs);   // ingestort: hoger, over de koppen op de hoop
        cl.set(BM.x + (BM.hoopX - BM.x) * v, BM.h * 0.48 * (1 - v) + 1.6 * v, BM.z + (BM.hoopZ - BM.z) * v);
        return klem(2 * Math.atan(BM.h * 0.62 * (1 - 0.6 * v) / Math.max(4, Math.hypot(cp.x - BM.x, cp.z - BM.z))) * 180 / Math.PI + 4, 50, 84);   // het hele figuur past erin (ook groot en ver)
      },
      brandOmhoog(u) {  // laag en dichtbij, groothoek omhoog langs het hout: het vuur kruipt omhoog, vonken de lucht in; draait traag om
        if (!BM) return S.palm(u);
        const v = BM.val, a = zij * (0.12 + 0.02 * Math.min(u, 10)), ca = Math.cos(a), sa = Math.sin(a), vx = BM.fx * ca - BM.fz * sa, vz = BM.fx * sa + BM.fz * ca;
        const d = Math.min(BM.voor + 8.5 - 1.5 * v, (-9.2 - BM.x * SX) / Math.max(0.25, BM.fx * SX));   // in de vrijgehouden strook, vóór het publiek
        cp.set(BM.x + vx * d, 0.6 + 0.1 * Math.sin(u * 0.5), BM.z + vz * d);
        cl.set(BM.x + (BM.hoopX - BM.x) * v, BM.h * (0.3 + 0.012 * Math.min(u, 10)) * (1 - v) + 1.2 * v, BM.z + (BM.hoopZ - BM.z) * v);
        return 80;
      },
      toren(u) { cp.set(zij * 2.6, 0.6, D - 2.2); cl.set(-zij * 0.3, 8 + Math.min(22, 1.6 * u), D + 5); return 74; },
      tegen(u) { cp.set(X(3.6), 2.3, D - 2.2 - Math.min(2.5, 0.12 * u)); cl.set(X(-1.5), 2.6, -D); return 58; },
      ingang(u) { cp.set(zij * 1.3, 1.6, -D + 1.3 + Math.min(2.5, 0.12 * u)); cl.set(X(3.0), 1.4, -4); return 64; },
    };
    const LIJST = {
      voor: ['volg', 'volg', 'tegemoet', 'ingang', 'zee', 'branding', 'drone', 'palm'],
      feest: ['zee', 'held', 'dj', 'achter', 'baan', 'kraan', 'drone', 'steiger', 'branding', 'palm', 'held', 'zee'],
      na: ['volg', 'tegemoet', 'toren', 'tegen', 'steiger', 'drone', 'branding'],
      drop: ['vuurwerk', 'held', 'zee', 'drone', 'kraan', 'dj', 'vuurwerk', 'baan'],
      break: ['lantaarns', 'zee', 'steiger', 'baan', 'branding', 'palm', 'achter'],
    };
    // Burning Man: brandt hij (of smeult de hoop nog fel), dan vaak in de lijst (het moet gezien worden), tot het instorten minstens om de ~14 s;
    // vooraf af en toe de wijde (hij staat er, met neon); op het aansteken en het instorten knipt de camera er meteen heen (zie cam)
    const brandt = () => BM && BM.aan && BM.na < 0.6;
    let voorGezien = false;  // het staande kunstwerk één keer wijd in beeld vóór het aansteken (Sierk: "zie de pop nog niet echt")
    function kiesShot(fase, st, t) {
      if (BM && !BM.aan && !voorGezien && t > 3) { voorGezien = true; recent.push('brand'); if (recent.length > 2) recent.shift(); return 'brand'; }
      let l = st === 'drop' ? LIJST.drop : st === 'break' ? LIJST.break : LIJST[fase];
      if (fase !== 'feest' && (st === 'drop' || st === 'break')) l = l.concat(['volg', 'volg', 'tegemoet']);
      if (brandt()) {
        if (BM.val < 1 && t - brandLaatst > 10 && recent.every(s => s.indexOf('brand') !== 0)) { const s = brandVorige === 'brand' ? 'brandOmhoog' : 'brand'; recent.push(s); if (recent.length > 2) recent.shift(); return s; }
        l = l.concat(['brand', 'brandOmhoog', 'brand']);
      } else if (BM && !BM.aan && fase !== 'voor') l = l.concat(['brand']);
      let kand = l.filter(s => (s === 'volg' ? recent[recent.length - 1] !== s : recent.indexOf(s) < 0) && (s !== 'held' || dansers.length));
      if (!kand.length) kand = l;
      const s = kand[Math.floor(r() * kand.length)];
      recent.push(s); if (recent.length > 2) recent.shift();
      return s;
    }
    const faseVan = lo => {
      if (!lo || !lo.root) return 'feest';
      plekVan(lo, lp);
      const dz = lp.z - WT.z;
      return Math.hypot(lp.x - X(WT.u), dz) < 2.6 ? 'feest' : dz < 0 ? 'voor' : 'na';
    };
    return function cam(t, loper) {
      if (t < tLaatst - 0.5) { blokNu = null; tKnip = -99; houdTot = -1; brandLaatst = -99; }  // klok terug (nieuwe start): opnieuw beginnen
      const dt = klem(t - tLaatst, 0, 0.1); tLaatst = t;
      const sh = doolhof.show || {}, st = sh.stand || 'groove';
      const per = st === 'break' ? 16 : st === 'drop' ? 4 : st === 'opbouw' ? ((sh.opbouw || 0) < 0.5 ? 8 : 4) : 8;
      const bp = Math.max(0, typeof beatPos === 'number' ? beatPos : 0), blok = Math.floor(bp / per) + ':' + per, ht = Math.floor(bp);
      const nieuweTel = ht !== telNu; telNu = ht;
      const fase = faseVan(loper);
      if (o.staat) o.staat.fase = fase;  // (de kamer geeft het door aan de Burning Man: loopt de loper weg, dan nu instorten)
      if (blok !== blokNu && blokNu !== null && t - tKnip <= 1.8) blokNu = blok;  // te snel na de vorige knip: dit blok overslaan
      // Burning Man steekt aan of stort in (gebeurt op de tel): meteen erheen en even blijven (aansteken laag omhoog, instorten wijd)
      if (BM && BM.ev !== evGezien) {
        evGezien = BM.ev;
        if (performance.now() / 1000 - BM.evTijd < 3) {
          const val = BM.evSoort === 'val';
          shot = 'brand'; recent.push(shot); if (recent.length > 2) recent.shift();   // ook bij aansteken wijd: het hele figuur met het vuur aan zijn voeten
          blokNu = blok; t0 = t; tKnip = t; faseNu = fase; houdTot = t + (val ? 9 : 8); brandLaatst = t; brandVorige = shot;
          zij = r() < 0.5 ? -1 : 1; dir = r() < 0.5 ? -1 : 1; a0 = r() * TAU; idx++; yaw = null;
        }
      }
      if (t < houdTot && blokNu !== null) { blokNu = blok; faseNu = fase; }  // vasthouden: de brand moet gezien worden
      else if (blokNu === null || blok !== blokNu || (fase !== faseNu && nieuweTel && t - tKnip > 2.0)) {
        shot = blokNu === null && fase === 'voor' ? 'volg' : kiesShot(fase, st, t);
        if (blokNu === null) { recent.length = 0; recent.push(shot); }
        blokNu = blok; t0 = t; tKnip = t; faseNu = fase;
        zij = r() < 0.5 ? -1 : 1; dir = r() < 0.5 ? -1 : 1; a0 = r() * TAU; idx++; yaw = null;
        if (shot.indexOf('brand') === 0) { brandLaatst = t; brandVorige = shot; }
        if (shot === 'brand' && BM && !BM.aan) houdTot = t + 6;  // het staande figuur even laten zien
      }
      const vast = doolhof.strand && doolhof.strand.shot;  // test: doolhof.strand.shot = 'zee' (null = weer op de tel kiezen)
      if (vast && S[vast] && vast !== shot) { shot = vast; t0 = t; tKnip = t; yaw = null; }
      uit.fov = (S[shot] || S.volg)(t - t0, loper, dt);
      cp.x = klem(cp.x, -W + 0.5, W - 0.5); cp.z = klem(cp.z, -D + 0.5, D - 0.5); cp.y = klem(cp.y, 0.25, HOOG);
      ctx.groep.updateWorldMatrix(true, false); ctx.groep.localToWorld(cp); ctx.groep.localToWorld(cl);
      return uit;
    };
  }

  // =====================================================================================================================================
  // de kamer
  // =====================================================================================================================================
  function* maak(ctx) {
    const r = ctx.rnd, Z = klem(ctx.zwaar | 0, 0, 2), g = ctx.groep;
    const w = 30, d = 42, W = w / 2, D = d / 2, maat = { w, d, h: 12 };
    // u = afstand richting zee (de zee ligt links of rechts van het pad), z = langs het strand van poort (-D) naar lift (+D)
    const sx = r() < 0.5 ? -1 : 1, X = u => u * sx, KUST = 8.6 + r() * 1.2, ZEE_AZ = sx * Math.PI / 2;
    const PAL = kies(r, PALETTEN).map(c => new THREE.Color(c));
    const p0 = r(), soort = p0 < 0.45 ? 'nacht' : p0 < 0.8 ? 'zonsondergang' : 'trippy', paars = soort === 'zonsondergang' && r() < 0.6, vulkaan = r() < 0.65;
    const nevel0 = soort === 'trippy' ? 0.9 : soort === 'nacht' ? 0.55 : 0.35;
    const hemelO = { soort, silhouet: 'palmen', verte: vulkaan ? 'vulkaan' : 'bergen', vulkaanAz: ZEE_AZ + (r() < 0.5 ? -1 : 1) * (0.45 + r() * 0.5),
      zonAz: ZEE_AZ + (r() - 0.5) * 0.5, maan: soort === 'zonsondergang' ? false : { az: ZEE_AZ + (r() - 0.5) * 0.9, el: 0.2 + r() * 0.2 },
      aurora: soort === 'trippy' ? 0.55 : soort === 'nacht' ? 0.3 : 0, nevel: nevel0, sterren: soort === 'zonsondergang' ? 0.6 : 1, verreVuren: 0.6,
      zee: { az: ZEE_AZ, breed: 1.25, kust: KUST }, grond: 'zand', rnd: r, zwaar: Z };
    if (paars) Object.assign(hemelO, { zenit: 0x0a0322, horizon: 0x8a2a6a, gloed: 0x7a1a80 });  // diep paarse zonsondergang (onder de bloom-drempel)
    const H = B.hemel(g, hemelO);
    B.rotsPoort(g, maat, { hemel: H, rnd: r, zwaar: Z, deco: 'kristallen', tekst: kies(r, ['PLAYA', 'BEACH', 'ALOHA', 'PARADISE', 'ISLA', 'SURF']), palet: PAL, mos: 0.35, ranken: 0.45 });
    B.liftToren(g, maat, { hemel: H, rnd: r, zwaar: Z, palet: PAL });
    yield;

    // ---------- indeling (u, z) ----------
    const VUUR = { u: -2.8, z: -0.8 }, HUT = { u: -10.5, z: 2.0 }, WACHT = { u: 1.8, z: 0.6 }, PIER = { u0: 6.4, u1: 24.0, z: 9.5, b: 1.1 }, PY = 0.58;
    const POOL = [{ u: 4.4, z: -6.0 }, { u: 4.8, z: 8.2 }];
    const L = (u, z) => ({ x: X(u), z });
    const route = [[0, -D], [0, -D + 2.5], [1.6, -D + 7], [3.0, -8.5], [3.2, -3.6], [WACHT.u, WACHT.z], [2.2, 6], [2.8, 11], [1.3, 15.5], [0, D - 2.5], [0, D]].map(([u, z]) => L(u, z));
    const cum = [0];
    for (let i = 1; i < route.length; i++) cum.push(cum[i - 1] + Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z));
    const LEN = cum[cum.length - 1];
    const opPad = s => {
      let i = 1; while (i < cum.length - 1 && cum[i] < s) i++;
      const a = route[i - 1], b = route[i], t = (s - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]), dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
      return { x: a.x + dx * t, z: a.z + dz * t, nx: -dz / l, nz: dx / l };
    };
    const padAf = (x, z) => {
      let m = 1e9;
      for (let i = 1; i < route.length; i++) {
        const a = route[i - 1], b = route[i], dx = b.x - a.x, dz = b.z - a.z, t = klem(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1));
        const px = a.x + dx * t - x, pz = a.z + dz * t - z; m = Math.min(m, px * px + pz * pz);
      }
      return Math.sqrt(m);
    };
    const hutP = (xl, y, zl) => new THREE.Vector3(X(HUT.u + xl), y, HUT.z + sx * zl);   // hut-ruimte (x' naar zee) -> kamer
    const pierP = (u, y, zl) => new THREE.Vector3(X(u), y, PIER.z + sx * zl);          // steiger-ruimte (x' = u) -> kamer
    const yawH = sx > 0 ? 0 : Math.PI;
    // bezette plekken: { x, z, r } of { x0, x1, z0, z1 } (kamer-ruimte)
    const bezet = [];
    const rond = (x, z, rr) => bezet.push({ x, z, r: rr });
    const vak = (u0, u1, z0, z1) => { const a = X(u0), b = X(u1); bezet.push({ x0: Math.min(a, b), x1: Math.max(a, b), z0, z1 }); };
    const vrij = (x, z, m) => bezet.every(o => o.r != null ? Math.hypot(x - o.x, z - o.z) > o.r + m : (x < o.x0 - m || x > o.x1 + m || z < o.z0 - m || z > o.z1 + m));
    rond(X(VUUR.u), VUUR.z, 1.9);
    vak(HUT.u - 2.5, HUT.u + 2.8, HUT.z - 3.95, HUT.z + 3.95);   // hut + speakers
    POOL.forEach(p => rond(X(p.u), p.z, 0.35));
    vak(PIER.u0 - 0.4, PIER.u1 + 2, PIER.z - 1.4, PIER.z + 1.4);
    const SURF = [[-9.6, 6.6], [-9.1, 7.05], [-8.6, 7.45], [-9.95, 7.55], [-9.35, 8.0], [-3.6, -D + 3.3], [-2.9, -D + 3.0]];
    SURF.forEach(([u, z]) => rond(X(u), z, 0.4));
    vak(-3.6, 3.6, -D - 1, -D + 2.4); vak(-8, 8, D - 1.4, D + 9);   // poort en lobby vrij

    // ---------- Burning Man (doolhof/buiten-brand.js): plek kiezen vóór palmen, flora en publiek, zodat die de voet en de zichtlijn vrijlaten ----------
    // Sierk (17-10): "ik zag wel vuur maar niet echt een burning iets". Stond op u -32 achter hut en palmen (bijna niet te zien); nu op open
    // zand landinwaarts naast het feest, ~18-27 m van het vuur, ~24 m hoog (schaal 0,8-1,3 per kunstwerk), de voorkant naar het publiek.
    // Eerst de -z-kant (zichtlijn langs de zuidkant van de hut; vanaf de steiger en de zee staat hij dan midden achter het feest, vanaf de
    // lift ook in beeld); past hij daar niet (de rotswand buigt aan de uiteinden om de kamer heen): de +z-kant, zichtlijn langs de noordkant
    // van de hut. Elke plek wordt getoetst op een raster over de voet: niet in de rotswand, de hut (+marge), het feest/pad/de zee (u > -9) of
    // de lobby van de lift. In u/z: f = richting van het kunstwerk naar het publiek (voorkant).
    const BRM = doolhof.brand, brandPlan = BRM && BRM.klaar && BRM.kiesNaam && BRM.maat ? (() => {
      const naam = BRM.kiesNaam(), m = naam && BRM.maat(naam);
      if (!m) return null;
      const br = (m.x1 - m.x0) / 2, dp = (m.z1 - m.z0) / 2, s0 = klem(34 / Math.max(m.h, 1.6 * Math.max(br, dp)), 1.05, 1.8);   // (Sierk 17-10 laat: "groter en verder"; was 24 m, 0,8-1,3)
      const muur = u => -D + Math.min(14, 0.03 * Math.pow(Math.max(0, Math.abs(u) - (W + 3)), 2));   // voet van de rotswand (buiten-basis, rotsPoort: buig)
      const VERB = [[HUT.u - 3.5, HUT.u + 3.8, HUT.z - 5, HUT.z + 5], [-9, 99, -99, 99], [-8.5, 8.5, D - 0.6, 99]];
      const plekVrij = (u, z) => z > muur(u) + 1 && VERB.every(([a, b, c, e]) => u < a || u > b || z < c || z > e);
      const kand = [];
      for (const a of [0.46, 0.4, 0.52, 0.58]) kand.push({ a, zs: 1, ref: VUUR });
      for (const a of [0.35, 0.28, 0.42, 0.5]) kand.push({ a, zs: -1, ref: { u: -2, z: 8 } });
      for (const sf of [1, 0.9, 0.8]) for (const k of kand) {
        const s = s0 * sf, Dc = klem(19 + dp * s, 25, 36), fu = Math.cos(k.a), fz = k.zs * Math.sin(k.a), Eu = k.ref.u - fu * Dc, Ez = k.ref.z - fz * Dc;
        let goed = true;
        for (let i = 0; i <= 4 && goed; i++) for (let j = 0; j <= 4; j++) {
          const a = (i / 2 - 1) * dp * s, b = (j / 2 - 1) * br * s;
          if (!plekVrij(Eu + fu * a - fz * b, Ez + fz * a + fu * b)) { goed = false; break; }
        }
        if (goed) return { naam, schaal: s, u: Eu, z: Ez, fu, fz, br: br * s, dp: dp * s, x: X(Eu), ry: Math.atan2(sx * fu, fz) };
      }
      return null;
    })() : null;
    if (brandPlan) {  // voet + een strook ervoor vrijhouden (geen palmen, struiken, fakkels of zakjes); de strook stopt vóór het publiek
      const P = brandPlan, pu = -P.fz, pz = P.fu;
      for (let a = -P.dp; a <= P.dp + 0.01; a += 3.5) for (let b = -P.br; b <= P.br + 0.01; b += 3.5) {
        const u = P.u + P.fu * a + pu * b, z = P.z + P.fz * a + pz * b, rr = Math.min(2.6, -8.6 - u);
        if (rr > 0.5) rond(X(u), z, rr);
      }
      for (let a = P.dp + 2; a < P.dp + 30; a += 2.5) {
        const u = P.u + P.fu * a, rr = Math.min(4.5, -8.8 - u);
        if (rr < 1.2) break;
        rond(X(u), P.z + P.fz * a, rr);
      }
    }

    // ---------- figuren: dj, vuurdraaiers, glowstick-dansers (kern: hooguit 10 / 6 / 5) ----------
    const djP = L(HUT.u + 0.85, HUT.z);
    const dj = ctx.figuur({ x: djP.x, z: djP.z, face: Math.atan2(sx, 0), rol: 'dj' });
    const VD = [{ u: 5.6, z: -4.2, soort: 'vuur' }, { u: 6.4, z: 2.6, soort: 'staf' }, { u: -0.4, z: -4.8, soort: 'spuwer', kijk: [1, -0.35] },
      { u: -3.2, z: -3.9, soort: 'hoepel' }, { u: 4.4, z: 6.6, soort: 'led' }].slice(0, [5, 3, 3][Z]);
    const vd = B.vuurDansers(ctx, VD.map(p => {
      const x = X(p.u);
      return { x, z: p.z, soort: p.soort, face: p.kijk ? Math.atan2(sx * p.kijk[0], p.kijk[1]) : Math.atan2(X(VUUR.u) - x, VUUR.z - p.z) };
    }), { zwaar: Z });
    VD.forEach(p => rond(X(p.u), p.z, 1.7));
    const glow = [];
    for (const p of [{ u: -5.6, z: -2.6 }, { u: -6.3, z: 1.5 }, { u: -2.2, z: 3.8 }, { u: -6.8, z: 5.0 }].slice(0, [4, 2, 1][Z])) {
      const x = X(p.u), fg = ctx.figuur({ x, z: p.z, face: Math.atan2(djP.x - x, djP.z - p.z) + (r() - 0.5) * 0.6, rol: 'dans' });
      if (fg) glow.push(fg);
      rond(x, p.z, 0.75);
    }
    if (glow.length) B.glowsticks(g, glow, { rnd: r, handen: 'mix' });
    yield;

    // ---------- palmen (1 draw): feestpalmen voor de slingers, een paar bij poort, toren en water, de rest in twee rijen op de landkant ----------
    const NPALM = [22, 15, 10][Z];
    const PVAST = [[-7.6, -6.8, 'A'], [-1.6, 9.8, 'B'], [-4.6, -D + 3.0], [4.8, -D + 3.6], [-6.0, D - 3.6], [6.0, D - 4.4], [KUST - 1.3, -14.5, 'zee'], [KUST - 1.5, 15.6, 'zee']];
    const kand = [];
    for (let z = -D + 2.5; z < D - 2; z += 3.1) kand.push([-9.4 - r() * 2.4, z + (r() - 0.5) * 1.4], [-12.6 - r() * 2.2, z + 1.5 + (r() - 0.5) * 1.4]);
    schud(kand, r);
    const palmLijst = [];
    for (const [u, z, rol] of PVAST.concat(kand)) {
      if (palmLijst.length >= NPALM) break;
      const x = X(u);
      if (!vrij(x, z, rol ? 0.4 : 0.7) || padAf(x, z) < 1.6 || Math.abs(z) > D - 1.5) continue;
      palmLijst.push({ x, z, u, rol }); rond(x, z, 0.6);
    }
    const palmen = inst(palmGeo(Z), shMat(PALM_VS, PALM_FS, { uPa: f(PAL[0]), uPb: f(PAL[1]), uPc: f(PAL[2]), uVuurP: f(new THREE.Vector3(X(VUUR.u), 1.0, VUUR.z)) }, { side: THREE.DoubleSide }), Math.max(1, palmLijst.length));
    palmen.name = 'strand-palmen';
    palmLijst.forEach((p, i) => {
      const feest = p.rol === 'A' || p.rol === 'B', s = feest ? 7.6 + r() * 0.8 : 6.4 + r() * 3.4;
      // buigen naar zee / het midden van het strand; de zeepalmen hangen schuin over het water
      const ang = p.rol === 'zee' ? (r() - 0.5) * 0.6 : (r() - 0.5) * 2.2, dx = sx * Math.cos(ang), dz = Math.sin(ang);
      const tilt = p.rol === 'zee' ? 0.22 + r() * 0.12 : 0.04 + r() * 0.1;
      Q1.setFromAxisAngle(AY, Math.atan2(-dz, dx)).multiply(Q2.setFromAxisAngle(AZ, -tilt));
      p.m = new THREE.Matrix4().compose(PV.set(p.x, -0.05, p.z), Q1, SV.setScalar(s)); p.s = s;
      palmen.setMatrixAt(i, p.m);
      const licht = feest ? 0.95 : padAf(p.x, p.z) < 6 ? kies(r, [0.33, 0.66, 0.95]) : (r() < 0.45 ? 0 : kies(r, [0.33, 0.66]));
      palmen.setColorAt(i, KL.setRGB(r(), licht, r()));
      p.top = new THREE.Vector3(0.16, 1, 0).applyMatrix4(p.m);
    });
    if (!palmLijst.length) palmen.count = 0;
    palmen.instanceMatrix.needsUpdate = true; if (palmen.instanceColor) palmen.instanceColor.needsUpdate = true;
    g.add(palmen);
    const stamPunt = (p, y) => { const t = klem(y / p.s); return new THREE.Vector3(0.16 * t * t, t, 0).applyMatrix4(p.m); };
    const palmA = palmLijst.find(p => p.rol === 'A'), palmB = palmLijst.find(p => p.rol === 'B');
    yield;

    // ---------- bouwwerk (1 draw): bamboe dj-hut/bar met rieten dak, speakers, slingerpalen, steiger, vuurkorven ----------
    const bw = bouwer();
    bw.frame(X(HUT.u), HUT.z, yawH);
    for (const [a, c] of [[1.75, -2.55], [1.75, 2.55], [-1.75, -2.55], [-1.75, 2.55], [-1.75, 0]]) bw.cyl(0.07, 0.085, 2.6, 7, 0, 2.6, 0, [a, 1.3, c]);
    for (const a of [1.75, -1.75]) bw.cyl(0.06, 0.06, 5.5, 6, 0, 5.5, 0, [a, 2.5, 0], [Math.PI / 2, 0, 0]);
    for (const c of [2.55, -2.55]) bw.cyl(0.06, 0.06, 3.9, 6, 0, 3.9, 0, [0, 2.5, c], [0, 0, Math.PI / 2]);
    const EX = 2.35, EZ = 3.15, EY = 2.47, NZ = 1.05, NY = 4.05;
    for (const dy of [0, -0.1]) {  // schilddak: bovenkant (normaal naar buiten) en onderkant (naar binnen/omlaag)
      const op = dy === 0 ? 1 : -1, y0 = EY + dy, y1 = NY + dy;
      const A = [EX, y0, -EZ], Bq = [EX, y0, EZ], C = [-EX, y0, EZ], Dq = [-EX, y0, -EZ], N1 = [0, y1, -NZ], N2 = [0, y1, NZ];
      bw.vlak([A, Bq, N2, N1], [[0, 0], [1, 0], [0.67, 1], [0.33, 1]], 2, [op, op, 0]);
      bw.vlak([C, Dq, N1, N2], [[0, 0], [1, 0], [0.67, 1], [0.33, 1]], 2, [-op, op, 0]);
      bw.vlak([Bq, C, N2], [[0, 0], [1, 0], [0.5, 1]], 2, [0, op, op]);
      bw.vlak([Dq, A, N1], [[0, 0], [1, 0], [0.5, 1]], 2, [0, op, -op]);
    }
    const rafel = (p0, p1, n, lang) => {  // rafelrand: hangt 0,42 m onder de dakrand, van beide kanten zichtbaar
      const b0 = [p0[0], EY - 0.42, p0[2]], b1 = [p1[0], EY - 0.42, p1[2]], uv = [[0, 0], [lang, 0], [lang, 1], [0, 1]];
      bw.vlak([p0, p1, b1, b0], uv, 3, n); bw.vlak([p0, p1, b1, b0], uv, 3, n.map(v => -v));
    };
    rafel([EX, EY, -EZ], [EX, EY, EZ], [1, 0, 0], 2 * EZ); rafel([-EX, EY, EZ], [-EX, EY, -EZ], [-1, 0, 0], 2 * EZ);
    rafel([EX, EY, EZ], [-EX, EY, EZ], [0, 0, 1], 2 * EX); rafel([-EX, EY, -EZ], [EX, EY, -EZ], [0, 0, -1], 2 * EX);
    // ledstrips voor de rafelrand langs (dakrand) en onder het blad van de toog
    bw.cyl(0.02, 0.02, 2 * EZ, 5, 5, 0, 0, [EX + 0.04, EY - 0.2, 0], [Math.PI / 2, 0, 0]);
    bw.cyl(0.02, 0.02, 2 * EZ, 5, 5, 0, 1, [-EX - 0.04, EY - 0.2, 0], [Math.PI / 2, 0, 0]);
    bw.cyl(0.02, 0.02, 2 * EX, 5, 5, 0, 2, [0, EY - 0.2, EZ + 0.04], [0, 0, Math.PI / 2]);
    bw.cyl(0.02, 0.02, 2 * EX, 5, 5, 0, 3, [0, EY - 0.2, -EZ - 0.04], [0, 0, Math.PI / 2]);
    bw.box(0.42, 1.02, 4.6, 4, 0, 0, [1.62, 0.51, 0]);                                   // toog (voorkant: tiki-maskers)
    bw.box(0.66, 0.06, 4.8, 1, 0, 0, [1.62, 1.05, 0]);                                   // blad
    bw.cyl(0.018, 0.018, 4.7, 5, 5, 0, 1, [1.95, 0.99, 0], [Math.PI / 2, 0, 0]);
    for (const c of [-0.42, 0.42]) bw.cyl(0.16, 0.16, 0.035, 20, 7, 0, 0, [1.56, 1.1, c]);   // draaitafels
    bw.box(0.32, 0.07, 0.34, 5, 0, 2, [1.56, 1.115, 0]);                                 // mixer
    for (const y of [1.25, 1.78]) {  // schappen met flessen
      bw.box(0.3, 0.04, 4.3, 1, 0, 0, [-1.55, y, 0]);
      const nb = [16, 12, 8][Z];
      for (let i = 0; i < nb; i++) { const hg = 0.2 + r() * 0.14; bw.box(0.07, hg, 0.07, 6, (i + 0.5) / nb, Math.floor(r() * 6), [-1.55 + (r() - 0.5) * 0.08, y + 0.02 + hg / 2, -2.0 + (i + 0.5) * 4.0 / nb]); }
    }
    bw.box(0.06, 2.3, 5.0, 8, 0, 0, [-1.82, 1.2, 0]);                                    // achterwand
    for (const c of [-3.45, 3.45]) bw.box(0.8, 1.7, 0.95, 9, 0, c > 0 ? 1 : 0, [2.35, 0.85, c]);   // speakers
    bw.frame(0, 0, 0);
    for (const p of POOL) bw.cyl(0.06, 0.085, 4.2, 6, 0, 4.2, 0, [X(p.u), 2.1, p.z]);  // palen voor de lichtslingers
    // steiger: dek + T-plateau, palen in het water, reling, lantaarnpalen, twee vuurkorven op het eind
    bw.frame(0, PIER.z, yawH);
    bw.box(PIER.u1 - PIER.u0, 0.12, 2 * PIER.b, 1, 0, 0, [(PIER.u0 + PIER.u1) / 2, PY - 0.06, 0]);
    bw.box(4.6, 0.12, 6.4, 1, 0, 0, [23.3, PY - 0.06, 0]);
    for (let u = PIER.u0 + 1.0; u < 21; u += 2.5) for (const c of [-1, 1]) bw.cyl(0.1, 0.11, 2.1, 6, 0, 0, 0, [u, (PY - 0.1 - 1.6) / 2, c * (PIER.b - 0.1)]);
    for (const [u, c] of [[21.2, -3.0], [21.2, 3.0], [25.4, -3.0], [25.4, 3.0], [23.3, -3.0], [23.3, 3.0]]) bw.cyl(0.1, 0.11, 2.1, 6, 0, 0, 0, [u, (PY - 0.1 - 1.6) / 2, c]);
    const RELU = [];
    for (let u = PIER.u0 + 0.2; u <= 21.01; u += 2.5) RELU.push(u);
    for (const c of [-1, 1]) {
      for (const u of RELU) bw.cyl(0.045, 0.05, 0.95, 5, 0, 0.95, 0, [u, PY + 0.475, c * (PIER.b - 0.04)]);
      bw.box(RELU[RELU.length - 1] - RELU[0], 0.05, 0.06, 1, 0, 0, [(RELU[0] + RELU[RELU.length - 1]) / 2, PY + 0.93, c * (PIER.b - 0.04)]);
    }
    const LPAAL = [[9, -1], [14, 1], [19, -1]], LPLAT = [[21.4, -3.0], [21.4, 3.0]];
    for (const [u, c] of LPAAL) bw.cyl(0.05, 0.055, 1.75, 5, 0, 1.75, 0, [u, PY + 0.875, c * (PIER.b - 0.04)]);
    for (const [u, c] of LPLAT) bw.cyl(0.05, 0.055, 1.75, 5, 0, 1.75, 0, [u, PY + 0.875, c]);
    const KORF = [[25.1, -2.7], [25.1, 2.7]];
    for (const [u, c] of KORF) { bw.cyl(0.05, 0.06, 0.5, 5, 0, 0, 0, [u, PY + 0.25, c]); bw.cyl(0.3, 0.17, 0.24, 10, 0, 0, 0, [u, PY + 0.62, c]); }
    const VUURP = new THREE.Vector3(X(VUUR.u), 1.1, VUUR.z), BARP = hutP(0.4, 2.2, 0);
    const maanR = H.uniforms.uMaan.value > 0.5 ? H.uniforms.uMaanDir.value.clone() : new THREE.Vector3(0.3, 0.8, 0.2).normalize();
    const bouwU = {
      uL: f([new THREE.Vector4(VUURP.x, VUURP.y, VUURP.z, 3.0), new THREE.Vector4(BARP.x, BARP.y, BARP.z, 1.6), (v => new THREE.Vector4(v.x, v.y, v.z, 1.0))(pierP(13.5, 2.3, 0)), (v => new THREE.Vector4(v.x, v.y, v.z, 1.4))(pierP(23.5, 1.6, 0))]),
      uLk: f([new THREE.Color(1.0, 0.5, 0.18), new THREE.Color(1.0, 0.62, 0.32), new THREE.Color(1.0, 0.62, 0.3), PAL[0].clone().lerp(new THREE.Color(1, 0.5, 0.2), 0.5)]),
      uMaanR: f(maanR), uVoor: f(new THREE.Vector3(sx, 0, 0)), uPa: f(PAL[0]), uPb: f(PAL[1]), uPc: f(PAL[2]), uKust: f(KUST), uZx: f(sx),
    };
    const bouw = new THREE.Mesh(bw.geo(), shMat(BOUW_VS, BOUW_FS, bouwU));
    bouw.name = 'strand-bouw'; g.add(bouw);
    // botsing voor de stralen van moshpit/camera (review 17-10: elke palm/hut/pop-driehoek kostte ~3,5 ms per straal): grove onzichtbare
    // vormen op laag 31 (wordt nooit getekend), zoals de jungle; de zee telt mee als obstakel (geen kring in het water)
    geenStraal(palmen); geenStraal(bouw);
    {
      const bots = [];
      for (const p of palmLijst) bots.push(new THREE.CylinderGeometry(0.35, 0.35, 6, 8, 1, false).translate(p.x, 3, p.z));
      const h0 = hutP(-EX, 0, -EZ), h1 = hutP(EX, 0, EZ);
      bots.push(new THREE.BoxGeometry(Math.abs(h1.x - h0.x) + 0.4, 3.2, Math.abs(h1.z - h0.z) + 0.4).translate((h0.x + h1.x) / 2, 1.6, (h0.z + h1.z) / 2));
      const x0 = X(KUST - 0.3), x1 = X(KUST + 40);
      bots.push(new THREE.BoxGeometry(Math.abs(x1 - x0), 1.5, 2 * D + 20).translate((x0 + x1) / 2, 0.75, 0));
      const bg = samenvoegen(bots); bg.computeBoundingSphere();
      const bm = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
      bm.layers.set(31); bm.name = 'strand-botsing'; g.add(bm);
    }
    const bord = geenStraal(ctx.neon(kies(r, soort === 'zonsondergang' ? ['SUNSET BAR', 'TIKI BAR', 'ALOHA'] : ['TIKI BAR', 'BEACH CLUB', 'LUAU', 'COCO LOCO', 'MOONBEACH', 'PARADISO']), '#' + PAL[0].getHexString(), 3.0, 0.75));
    bord.position.copy(hutP(EX + 0.1, 3.05, 0)); bord.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
    // lantaarns: hoeken van het dak, bovenop de slingerpalen, op de steiger (warm)
    const WARM = new THREE.Color(1.0, 0.58, 0.24), lant = [];
    [[EX, -EZ], [EX, EZ], [-EX, -EZ], [-EX, EZ]].forEach(([a, c], i) => lant.push({ p: hutP(a, 2.12, c), k: PAL[i % 3] }));
    POOL.forEach((p, i) => lant.push({ p: new THREE.Vector3(X(p.u), 4.32, p.z), k: PAL[(i + 1) % 3] }));
    const pierLant = [];
    LPAAL.forEach(([u, c]) => pierLant.push(pierP(u, PY + 1.85, c * (PIER.b - 0.04))));
    LPLAT.forEach(([u, c]) => pierLant.push(pierP(u, PY + 1.85, c)));
    pierLant.forEach(p => lant.push({ p, k: WARM }));
    const lm = inst(new THREE.SphereGeometry(1, 12, 8), shMat(LAMP_VS, LAMP_FS), lant.length);
    lant.forEach((l, i) => { lm.setMatrixAt(i, M4.compose(l.p, Q1.identity(), SV.set(0.16, 0.21, 0.16))); lm.setColorAt(i, l.k); });
    lm.instanceMatrix.needsUpdate = true; lm.instanceColor.needsUpdate = true; geenStraal(lm); g.add(lm);
    B.gloed(g, lant.map(l => ({ x: l.p.x, y: l.p.y, z: l.p.z, r: 0.75, kleur: l.k })), { plat: false, sterk: 0.4 });
    yield;

    // ---------- vuur: kampvuur (met lamp), vuurkorven in showkleuren, tiki-fakkels langs het pad ----------
    const lampVuur = ctx.licht(0xff7a2a, 2.6, 18, VUURP.x, 2.0, VUURP.z);
    B.kampvuur(g, { x: VUURP.x, z: VUURP.z }, { rnd: r, zwaar: Z, lamp: lampVuur, s: 2.6 });
    const lampHut = ctx.licht(PAL[0].getHex(), 1.5, 11, hutP(1.2, 0, 0).x, 2.3, HUT.z);
    const korfP = KORF.map(([u, c]) => pierP(u, PY + 0.72, c));
    B.vuur(g, korfP.map(v => ({ x: v.x, y: v.y, z: v.z, s: 0.7, h: 1.1 })), { rnd: r, zwaar: Z, kleur: 'show', vlammen: 18, vonken: 8 });
    const NFAK = [14, 10, 6][Z], fak = [];
    let kant = 1;
    for (let s = 5.0; s < LEN - 2.5 && fak.length < NFAK; s += 3.4) {
      const p = opPad(s); kant = -kant;
      const x = p.x + p.nx * 1.65 * kant, z = p.z + p.nz * 1.65 * kant;
      if (Math.abs(z) > D - 2 || !vrij(x, z, 0.4)) continue;
      fak.push({ x, z }); rond(x, z, 0.35);
    }
    B.fakkels(g, fak, { rnd: r, zwaar: Z });
    yield;

    // ---------- pad: lampionzakjes (1 draw) + gloed op het zand (golf naar de lift), surfplanken ----------
    const zak = [], zakGl = [], af = [1.6, 2.2, 3.2][Z];
    let nr = 0;
    for (let s = 1.6; s < LEN - 1.2; s += af, nr++) {
      const p = opPad(s);
      for (const k of [-1, 1]) {
        const x = p.x + p.nx * 0.95 * k + (r() - 0.5) * 0.12, z = p.z + p.nz * 0.95 * k + (r() - 0.5) * 0.12;
        if (Math.abs(z) > D - 1.0 || !vrij(x, z, 0.15)) continue;
        const kl = nr % 4 === 0 ? [0.4, 0.7, 1.0][nr % 3] : 0;
        zak.push({ x, z, s: s / LEN, kl });
        zakGl.push({ x, y: 0.03, z, r: 0.6, kleur: kl ? PAL[Math.floor(kl * 3) % 3] : 0xff8a30, s: s / LEN });
      }
    }
    if (zak.length) {
      const zm = inst(new THREE.CylinderGeometry(0.095, 0.11, 0.26, 10, 1).translate(0, 0.13, 0), shMat(KLEIN_VS, ZAK_FS, { uPa: f(PAL[0]), uPb: f(PAL[1]), uPc: f(PAL[2]) }), zak.length);
      zak.forEach((z, i) => { zm.setMatrixAt(i, M4.compose(PV.set(z.x, 0, z.z), Q1.setFromAxisAngle(AY, r() * TAU), SV.setScalar(1))); zm.setColorAt(i, KL.setRGB(z.s, z.kl, r())); });
      zm.instanceMatrix.needsUpdate = true; zm.instanceColor.needsUpdate = true; zm.name = 'strand-zakjes'; g.add(zm);
      B.gloed(g, zakGl, { plat: true, golf: true, sterk: 0.5 });
    }
    const pm = inst(new THREE.SphereGeometry(1, 16, 10), shMat(KLEIN_VS, PLANK_FS, { uPa: f(PAL[0]), uPb: f(PAL[1]), uPc: f(PAL[2]) }), SURF.length);
    SURF.forEach(([u, z], i) => {
      pm.setMatrixAt(i, M4.compose(PV.set(X(u), 0.72, z), Q1.setFromEuler(EU.set((r() - 0.5) * 0.3, Math.atan2(sx, 0) + (r() - 0.5) * 1.2, (r() - 0.5) * 0.3)), SV.set(0.27, 1.02, 0.045)));
      pm.setColorAt(i, KL.setRGB((i % 3) / 3, r(), 0));
    });
    pm.instanceMatrix.needsUpdate = true; pm.instanceColor.needsUpdate = true; pm.name = 'strand-planken'; g.add(pm);
    // flora uit Blender (doolhof/buiten-modellen.js), alleen als die geladen is: varens en monstera's op de landkant, tiki's bij de hut, drijfhout
    const FL = doolhof.flora;
    if (FL && FL.klaar && typeof FL.plant === 'function' && Z < 2) {
      const heeft = n => FL.namen && FL.namen.indexOf(n) >= 0, struik = [];
      for (let i = 0; i < 40 && struik.length < [14, 8][Z]; i++) {
        const u = -15 + r() * 6.2, z = -D + 3 + r() * (d - 6), x = X(u);
        if (vrij(x, z, 0.5) && padAf(x, z) > 2) { struik.push({ x, z, s: 0.8 + r() * 0.6 }); rond(x, z, 0.5); }
      }
      const half = Math.ceil(struik.length / 2);
      if (heeft('varen_1') && half) FL.plant(g, 'varen_1', struik.slice(0, half));
      if (heeft('monstera_1') && struik.length > half) FL.plant(g, 'monstera_1', struik.slice(half));
      if (heeft('tiki_1')) { const tk = [hutP(2.9, 0, -4.25), hutP(2.9, 0, 4.25)]; tk.forEach(v => rond(v.x, v.z, 0.45)); FL.plant(g, 'tiki_1', tk.map(v => ({ x: v.x, z: v.z, ry: Math.atan2(sx, 0) }))); }
      if (heeft('drijfhout_1')) FL.plant(g, 'drijfhout_1', [{ x: X(KUST - 2.4), z: -10.5 }, { x: X(KUST - 2.8), z: 12.8 }]);
    }
    yield;

    // ---------- publiek (1 draw): rond het vuur en voor de hut, een groepje bij het water; 60% met een glowstick ----------
    const NP = [110, 70, 40][Z], plek = [], vuurW = L(VUUR.u, VUUR.z), wachtW = L(WACHT.u, WACHT.z);
    for (let i = 0; i < NP * 8 && plek.length < NP; i++) {
      const bijZee = r() < 0.18, u = bijZee ? 3.4 + r() * 4.4 : -8.2 + r() * 9.6, z = bijZee ? -6.5 + r() * 12 : -6.8 + r() * 15.2, x = X(u);
      if (!vrij(x, z, 0.4) || padAf(x, z) < 1.25) continue;
      let ok = true;
      for (const p of plek) if ((p.x - x) * (p.x - x) + (p.z - z) * (p.z - z) < 0.4) { ok = false; break; }
      if (!ok) continue;
      const doel = u < -3.6 && r() < 0.75 ? djP : r() < 0.55 ? vuurW : wachtW;
      plek.push({ x, z, face: Math.atan2(doel.x - x, doel.z - z) + (r() - 0.5) * 0.8 });
    }
    const publiek = window.clubPubliek && clubPubliek.maak && plek.length ? clubPubliek.maak(g, { plekken: plek, vast: true, rnd: r, telefoons: 0.06, glowsticks: 0.6,
      licht: { x: VUURP.x, y: 1.4, z: VUURP.z }, kleuren: { a: new THREE.Color(0xff7a2a), b: PAL[1], vul: new THREE.Color(0x000000), kleding: KLEDING } }) : null;
    if (publiek && publiek.mesh) geenStraal(publiek.mesh);  // (zie de botsing hierboven)
    yield;

    // ---------- lichtslingers: een dak van lampjes boven de dansvloer (hut, palen, feestpalmen) en warme lampjes langs de steiger ----------
    const hoeken = [hutP(EX, EY - 0.05, -EZ), hutP(EX, EY - 0.05, EZ)].sort((a, b) => a.z - b.z);
    const pA = new THREE.Vector3(X(POOL[0].u), 4.15, POOL[0].z), pB = new THREE.Vector3(X(POOL[1].u), 4.15, POOL[1].z);
    const lijnen = [[hoeken[0], pA], [hoeken[1], pB], [pA, pB]];
    if (palmA) { const q = stamPunt(palmA, 3.9); lijnen.push([q, hoeken[0]], [q, pA]); }
    if (palmB) { const q = stamPunt(palmB, 3.7); lijnen.push([q, hoeken[1]], [q, pB]); }
    const xyz = v => ({ x: v.x, y: v.y, z: v.z });
    B.lichtslingers(g, lijnen.map(l => l.map(xyz)), { kleur: 'show', zak: 0.7, afstand: 0.3 });
    B.lichtslingers(g, [-1, 1].map(c => RELU.map(u => xyz(pierP(u, PY + 0.97, c * (PIER.b - 0.04))))), { kleur: 'warm', zak: 0.12, afstand: 0.26, grootte: 0.055 });

    // ---------- lichtrig (zie de kop): koppen om en om op de dakrand (laag, vlak over het publiek) en de nok (steiler), richting zee; pars voor
    // de toog en aan de voet van de feestpalmen, gericht op de stam ----------
    const AZ_ZEE = sx * Math.PI / 2, NKOP = [8, 6, 4][Z], koppen = [], pars = [];
    for (let i = 0; i < NKOP; i++) {
      const s = NKOP > 1 ? i / (NKOP - 1) * 2 - 1 : 0, nok = i % 2 === 1;
      const p = nok ? hutP(0.3, NY + 0.16, s * 0.95) : hutP(EX + 0.12, EY + 0.1, s * (EZ - 0.3));
      koppen.push({ x: p.x, y: p.y, z: p.z, az: AZ_ZEE, el: nok ? 0.55 : 0.3, s });
    }
    for (const zl of [-3.45, -1.15, 1.15, 3.45]) { const p = hutP(3.0, 0.05, zl); pars.push({ x: p.x, y: 0.05, z: p.z, az: AZ_ZEE, el: 1.2 }); }
    palmLijst.filter(p => p.rol === 'A' || p.rol === 'B').concat(palmLijst.filter(p => !p.rol && padAf(p.x, p.z) < 5)).slice(0, 6).forEach(p => {
      const dx = wachtW.x - p.x, dz = wachtW.z - p.z, l = Math.hypot(dx, dz) || 1, px = p.x + dx / l * 0.6, pz = p.z + dz / l * 0.6;
      pars.push({ x: px, y: 0.05, z: pz, az: Math.atan2(p.x - px, p.z - pz), el: 1.3 });
    });
    const rig = B.lichtrig(g, koppen, pars, { breed: 0.85, lengte: 46, dik: 0.035, parLengte: 7.5, rnd: r, zwaar: Z });
    laatsteRig = rig;

    // ---------- deeltjes: uv-sporen boven het feest, lichtjes tussen de palmen, gloeiende plekken plankton op zee ----------
    const xs = (a, b) => [Math.min(X(a), X(b)), Math.max(X(a), X(b))];
    const [sx0, sx1] = xs(-11, 8), [lx0, lx1] = xs(-15, -7);
    B.vuurvliegjes(g, { soort: 'sporen', kleur: 'show', aantal: 170, gebied: { x0: sx0, x1: sx1, z0: -12, z1: 13, y0: 0, y1: 7 }, rnd: r, zwaar: Z });
    B.vuurvliegjes(g, { soort: 'vliegjes', kleur: 'mix', aantal: 120, gebied: { x0: lx0, x1: lx1, z0: -D + 2, z1: D - 2, y0: 0.4, y1: 5 }, rnd: r, zwaar: Z });
    const vlek = [];
    for (let i = 0; i < [16, 10, 6][Z]; i++) vlek.push({ x: X(KUST + 2 + r() * 22), y: 0.004, z: -18 + r() * 38, r: 1.2 + r() * 2.2, kleur: r() < 0.6 ? 0x00d8ff : PAL[Math.floor(r() * 3)], s: r() });
    B.gloed(g, vlek, { plat: true, golf: true, sterk: 0.35 });

    // ---------- wensballonnen (1 draw): stijgen op van het strand en de steiger en drijven naar zee ----------
    const NBAL = [56, 34, 16][Z], ia = new Float32Array(NBAL * 4);
    for (let i = 0; i < NBAL; i++) ia.set([X(-4 + r() * 18), -14 + r() * 30, r(), 0.45 + r() * 0.45], i * 4);
    const ballon = geenStraal(new THREE.Mesh(quadGeo(NBAL, { iA: [ia, 4] }), addMat(BALLON_VS, BALLON_FS, { uWind: f(new THREE.Vector2(sx * 0.38, 0.06)), uCyc: f(80), uTop: f(42) })));
    ballon.frustumCulled = false; ballon.renderOrder = 5; ballon.name = 'strand-ballonnen'; g.add(ballon);

    // ---------- vuurwerk (1 draw) + weerspiegeling op het water (1 draw) ----------
    const NS = [90, 60, 32][Z], TR = 3, NR = 8, PER = NS * TR + NR + 1, NP2 = NF * PER;
    const aF = new Float32Array(NP2 * 4), aG = new Float32Array(NP2 * 2);
    let k = 0;
    for (let i = 0; i < NF; i++) {
      for (let s = 0; s < NS; s++) { const a = r(), b = r(), c = r(); for (let t = 0; t < TR; t++) { aF.set([i, a, 0, t], k * 4); aG.set([b, c], k * 2); k++; } }
      for (let s = 0; s < NR; s++) { aF.set([i, r(), 1, s], k * 4); k++; }
      aF.set([i, 0, 2, 0], k * 4); k++;
    }
    const fgeo = new THREE.BufferGeometry();
    fgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NP2 * 3), 3));
    fgeo.setAttribute('aF', new THREE.BufferAttribute(aF, 4)); fgeo.setAttribute('aG', new THREE.BufferAttribute(aG, 2));
    const fwU = { uFw: f(Array.from({ length: NF }, () => new THREE.Vector4(0, -100, 0, -1000))), uFwL: f(Array.from({ length: NF }, () => new THREE.Vector4(0, -100, 0, 0))),
      uFwK: f(Array.from({ length: NF }, () => new THREE.Vector4(1, 1, 1, 0))), uFwK2: f(Array.from({ length: NF }, () => new THREE.Vector3(1, 1, 1))) };
    const fwMat = addMat(VUURWERK_VS, VUURWERK_FS, fwU);
    const vuurwerk = geenStraal(new THREE.Points(fgeo, fwMat));
    vuurwerk.frustumCulled = false; vuurwerk.renderOrder = 6; vuurwerk.name = 'strand-vuurwerk'; g.add(vuurwerk);
    const sp = [];  // [x, y, z, slot, r, g, b, breedte]
    pierLant.forEach(p => sp.push([p.x, p.y, p.z, 0, WARM.r, WARM.g, WARM.b, 0.5]));
    korfP.forEach(p => sp.push([p.x, p.y + 0.4, p.z, 0, PAL[0].r, PAL[0].g, PAL[0].b, 0.7]));
    for (let i = 0; i < NF; i++) sp.push([0, 0, 0, i + 1, 1, 1, 1, 2.2]);
    const sP = new Float32Array(sp.length * 4), sK = new Float32Array(sp.length * 4);
    sp.forEach((v, i) => { sP.set(v.slice(0, 4), i * 4); sK.set(v.slice(4), i * 4); });
    const spMat = addMat(SPIEGEL_VS, SPIEGEL_FS, { uFw: fwU.uFw, uFwK: fwU.uFwK, uZd: f(new THREE.Vector2(sx, 0)), uKust: f(KUST) });
    const spiegel = geenStraal(new THREE.Mesh(quadGeo(sp.length, { iP: [sP, 4], iK: [sK, 4] }), spMat));
    spiegel.frustumCulled = false; spiegel.renderOrder = 3; spiegel.name = 'strand-spiegel'; g.add(spiegel);
    // knallen: JS kiest per tel, de shader doet de rest (opbouw: salvo dat op de drop knalt; drop: om de tel; groove: om de 16 tellen)
    const FW = { slot: 0, tel: -1, salvo: false, salvoT: -99, drop: false };
    const k1 = new THREE.Color(), k2 = new THREE.Color();
    const showKleur = (uitK, i) => { const sh = doolhof.show; if (sh && sh.kleur && Math.random() < 0.65) sh.kleur(i, uitK); else uitK.set(NEON[Math.floor(Math.random() * NEON.length)]); return uitK; };
    function knal(rise, i) {
      const s = FW.slot, nu = U.uT.value, rnd = Math.random; FW.slot = (FW.slot + 1) % NF; tel.knallen++;
      let bx, bz, lx, ly, lz;
      if (rnd() < 0.35) {  // vanaf de kop van de steiger
        const p = pierP(25.1, PY + 0.8, (rnd() - 0.5) * 4); lx = p.x; ly = p.y; lz = p.z;
        bx = X(22 + rnd() * 8); bz = PIER.z + (rnd() - 0.5) * 12;
      } else {             // vanaf een vlot op zee
        bx = X(KUST + 8 + rnd() * 22); bz = -14 + rnd() * 32; lx = bx + (rnd() - 0.5) * 4; ly = 0.4; lz = bz + (rnd() - 0.5) * 4;
      }
      const by = 13 + rnd() * 12 + (i || 0) * 1.5, st = rnd(), stijl = st < 0.45 ? 0 : st < 0.65 ? 1 : st < 0.85 ? 2 : 3;
      showKleur(k1, Math.floor(rnd() * 3)); showKleur(k2, Math.floor(rnd() * 3));
      fwU.uFw.value[s].set(bx, by, bz, nu + rise); fwU.uFwL.value[s].set(lx, ly, lz, rise);
      fwU.uFwK.value[s].set(k1.r, k1.g, k1.b, stijl); fwU.uFwK2.value[s].set(k2.r, k2.g, k2.b);
      fwMat.uniformsNeedUpdate = true; spMat.uniformsNeedUpdate = true;
    }
    function vuurwerkBeeld(sh, st) {
      const ht = Math.floor(typeof beatPos === 'number' ? beatPos : 0);
      if (ht === FW.tel) return;
      FW.tel = ht;
      const per = klem(typeof period === 'number' ? period : 0.5, 0.33, 0.8), opb = sh.opbouw || 0, dr = sh.drop || 0;
      if (st === 'opbouw') {
        if (opb > 0.86 && !FW.salvo) { FW.salvo = true; FW.salvoT = U.uT.value; for (let i = 0; i < 4; i++) knal(2 * per, i); }
        else if (opb > 0.5 && ht % 2 === 0 && Math.random() < 0.5) knal(2 * per);
      } else FW.salvo = false;
      if (st === 'drop') {
        if (dr > 0.9 && !FW.drop) { FW.drop = true; if (U.uT.value - FW.salvoT > 2.5) for (let i = 0; i < 3; i++) knal(0, i); }
        else if (dr > 0.3) { if (ht % 2 === 0) knal(2 * per); if (Math.random() < 0.35) knal(2 * per); }
        else if (ht % 4 === 0) knal(2 * per);
      } else FW.drop = false;
      if (st === 'groove' && ht % 16 === 0 && Math.random() < 0.7) { knal(2 * per); if (Math.random() < 0.4) knal(2 * per); }
    }

    // ---------- Burning Man (doolhof/buiten-brand.js, plek zie boven): leent de hut-lamp zolang hij brandt (die schuift dan naar het
    // kunstwerk en licht het publiek oranje aan; op laag/tv is er geen tweede lamp, dan doet alleen het silhouetpubliek mee) ----------
    const brand = brandPlan && doolhof.brand.plaats ? doolhof.brand.plaats(ctx, g, { naam: brandPlan.naam, x: brandPlan.x, z: brandPlan.z, ry: brandPlan.ry, schaal: brandPlan.schaal, lamp: lampHut }) : null;
    const camStaat = { fase: 'voor' };

    // ---------- camera, lift als uitgang ----------
    const cam = strandCam(ctx, { W, D, X, KUST, vuur: VUUR, hut: HUT, wacht: WACHT, pier: PIER, palm: palmA || palmB || null, dansers: vd ? vd.figs : [], brand, staat: camStaat });
    B.liftUitgang();  // de kern kiest de overgang direct na maak(): de uitgang wordt een lift (de lifttoren staat er al)
    tel.gebouwd++;
    tel.laatste = { lucht: soort + (paars ? ' (paars)' : ''), verte: vulkaan ? 'vulkaan' : 'bergen', zee: sx > 0 ? '+x' : '-x', kust: +KUST.toFixed(1), pad: +LEN.toFixed(1),
      palmen: palmLijst.length, publiek: publiek ? publiek.n : 0, glowsticksPubliek: publiek ? publiek.glowsticks : 0, dj: !!dj, vuurdansers: vd ? vd.figs.length : 0,
      glowDansers: glow.length, fakkels: fak.length, zakjes: zak.length, ballonnen: NBAL, vuurwerkPunten: NP2, lampen: [!!lampVuur, !!lampHut],
      brand: brand ? { naam: brand.naam, schaal: +brandPlan.schaal.toFixed(2), kant: brandPlan.fz > 0 ? '-z' : '+z', u: +brandPlan.u.toFixed(1), z: +brandPlan.z.toFixed(1), hoog: +brand.h.toFixed(1) } : (doolhof.brand && doolhof.brand.klaar ? 'past niet' : 'model niet geladen') };
    // publiek: het licht (randlicht in de shader) komt van het kampvuur; brandt de Burning Man, dan schuift het naar hem toe en wordt het feller
    const PLICHT0 = new THREE.Vector3(VUURP.x, 1.4, VUURP.z);
    const PZET = { helder: 0.5, flits: 0, rand: 1, armen: 0, gloed: 1, b: null, licht: PLICHT0.clone() };
    return {
      maat, route, blijf: 12, cam, publiek,
      update(dt) {
        const sh = doolhof.show || {}, st = sh.stand || 'groove';
        if (lampHut) {  // klapt op de tel (lichtklok), kleur per maat, in de drop per tel
          if (sh.kleur) sh.kleur(st === 'drop' ? Math.floor(U.uTel.value) : U.uMaat.value, lampHut.color);
          lampHut.intensity = 1.5 * (0.4 + 1.5 * U.uSlag.value + 0.5 * U.uKick.value + 0.6 * U.uDrop.value) * (1 - 0.5 * U.uBlack.value) + 2 * U.uFlits.value;
        }
        // na de hut-lamp: de Burning Man mengt zijn vuur over de geleende lamp; loopt de loper al naar de lift, dan steekt/stort hij nu
        // de loper blijft kijken tot het kunstwerk is ingestort (+ ~4 s nasmeulen); lukt dat niet (al bij de lift), dan haast de brand
        let houdt = false;
        // (pas vanaf het feest: houdLoper laat hem dansen waar hij staat, op het pad ervoor miste hij dan het feest; ook pas daar aansteken)
        if (brand && brand.aan && camStaat.fase !== 'voor' && !(brand.val >= 1 && brand.na > 0.05) && doolhof.houdLoper) houdt = doolhof.houdLoper(2.5);
        if (brand) { if (doolhof.strand) doolhof.strand.brand = brand; brand.update(dt, { haast: camStaat.fase === 'na' && !houdt, voor: camStaat.fase === 'voor' }); }  // (test: doolhof.strand.brand.ontsteek())
        if (publiek) {
          const sl = U.uSlag.value;
          PZET.helder = 0.5 + 0.25 * U.uVlam.value; PZET.flits = U.uFlits.value * 0.5; PZET.rand = 0.75 + 0.9 * sl; PZET.armen = 0.35 * U.uDrop.value;
          PZET.gloed = 0.75 + 0.9 * sl + 0.3 * U.uKick.value + 0.6 * U.uDrop.value; PZET.b = U.uK1.value;
          if (brand) { const k = Math.min(1, brand.gloed); PZET.helder += 0.35 * k; PZET.licht.lerpVectors(PLICHT0, brand.lichtP, 0.8 * k); }
          publiek.zet(PZET);
        }
        H.uniforms.uNevel.value = nevel0 * (1 + 0.6 * U.uDrop.value + 0.3 * U.uOpb.value) * (st === 'break' ? 0.8 : 1);
        vuurwerkBeeld(sh, st);
      },
      opruimen() { if (publiek) publiek.opruimen(); if (brand) brand.opruimen(); },
    };
  }

  doolhof.registreer('strand', { gewicht: 0.7, buiten: true, maak: ctx => maak(ctx) });
  doolhof.strand = { shot: null, info: () => ({ gebouwd: tel.gebouwd, knallen: tel.knallen, laatste: tel.laatste, rig: laatsteRig ? laatsteRig.info() : null }) };
})();

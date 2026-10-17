// --- Doolhof-kamer 'jungle': een trippy uv-nachtjungle buiten (laadt na doolhof/buiten-basis.js) ---
// Sierk (17-10): uit de clubgang ineens een gekke jungle in lopen, vol vuurmensen, draaiers en glowsticks; na de buitenwandeling weer de
// lift tegenkomen en verder de club in. Door de rotspoort stap je een lichtgevend regenwoud in: reuzenvarens en palmen waarvan de nerven
// in neon oplichten en op de tel van kleur verspringen, vliegenzwammen en psilocyben (hoeden zwellen op de bas en blazen sporen uit),
// lianen met lichtdruppels, mistlagen, een waterval in een rotsboog met een vijver vol lichtgevende waterlelies, en een open plek met een
// kampvuur, vuurdraaiers (poi, staf, hoepel, spuwer), ledpoi, mensen met glowsticks, publiek en een dj op een boomstronk achter een
// runenaltaar. Achter de dj staat een reuzenbloem met een caleidoscoop in de bladen: knop in de break, trillend dicht in de opbouw, op de
// drop schiet hij open en draait. Een gloeiend pad (~50 m) slingert van de poort langs de open plek (daar wacht de loper en danst mee) en
// langs de vijver naar de glazen lifttoren; de uitgang is altijd de lift (B.liftUitgang).
// Licht: alles licht zelf (ShaderMaterial op de muziek-uniforms van buiten-basis: B.U + B.KOP): donker met verzadigd, bewegend licht,
// break donkerder en trager, opbouw sneller, drop groot. Twee kamerlampen (ctx.licht): kampvuur (flakkert) en dj (showkleur), voor de
// GLB-figuren. Weinig draws: per soort één InstancedMesh, alles wat vast staat (bomen, takken, palmstammen, stronk, klif, ruïne, altaar,
// stenen, bloemsteel) in één samengevoegde mesh, deeltjes als Points/instanced quads met alle beweging in de vertex-shader. Per beeld
// alleen een handvol uniforms (bloem, dj-licht, hemel, publiek), geen lussen over planten.
// Indeling (kamer-ruimte, w 28 x d 40, ingang z -20, uitgang z +20; per kamer links/rechts gespiegeld met sx): kampvuur (4, 0,6), dj op
// de stronk (11,5, 0,6), reuzenbloem erachter (hart 12,9 / 6,8 m hoog), vijver (-9,3, 8,2) met de waterval in de rotsboog erachter,
// wachtplek van de loper (-1,4, -0,6) aan de rand van de open plek. Camerapunten (kraanzuilen, ingang, toren, waterval, paddo, rond
// de wachtplek) blijven vrij van hoge planten.
// Camera: eigen knip op de tel (8 tellen, drop 4, break 16, opbouw 8 -> 4) tussen 16 shots: volg, held, drone, kraan, vuur, toren,
// tegen (B.buitenCam) en poort, dj, bloem, waterval, pad, kroon, paddo, glow, baan (hier); break = rustige shots, drop = eerst de bloem.
// Zwaar (ctx.zwaar 0/1/2): planten, figuren (de kern geeft er 10/6/5), publiek, mist en deeltjes schalen mee.
// Test (console): doolhof.start('jungle') of doolhof.volgende = 'jungle'; doolhof.jungle.info() = tellers van de laatst gebouwde jungle;
// doolhof.actief.cam.zet('bloem') = vast shot (null = weer vrij), doolhof.actief.cam.shots() = wat kan.
(function () {
  'use strict';
  const doolhof = window.doolhof = window.doolhof || {};
  if (typeof THREE === 'undefined' || typeof doolhof.registreer !== 'function') return;
  const B = doolhof.buiten;
  if (!B || !B.KOP || !B.U) { console.warn('jungle: doolhof.buiten ontbreekt (eerst doolhof/buiten-basis.js laden)'); return; }

  // ---------- hulpjes ----------
  const f = v => ({ value: v });
  const houd = B.houd, geenStraal = B.geenStraal;
  const TAU = Math.PI * 2;
  const klem = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const glad = (x, a, b) => { const t = klem((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const kies = (r, a) => a[Math.min(a.length - 1, Math.floor(r() * a.length))];
  const tussen = (r, a, b) => a + r() * (b - a);
  const kloon = g => { const c = g.clone(); c.userData = {}; return c; };  // r128: clone deelt userData, dan zou de kloon ook 'houden' zijn
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), PV = new THREE.Vector3(), SV = new THREE.Vector3(), EEN = new THREE.Vector3(1, 1, 1);
  function ruis(seed) {  // waarde-ruis 2D in JS (vorm van rotsen en stammen)
    const s = seed | 0;
    const h = (x, y) => { let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
    return (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
  }
  const QUAD_P = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
  function quadGeo(n, attrs, basis) {  // n instanties van een quad (of van een basisgeometrie), attrs { naam: [Float32Array, grootte] }
    const g = new THREE.InstancedBufferGeometry();
    if (basis) { g.setAttribute('position', basis.attributes.position.clone()); if (basis.attributes.uv) g.setAttribute('uv', basis.attributes.uv.clone()); g.setIndex(basis.index.clone()); }
    else { g.setAttribute('position', new THREE.BufferAttribute(QUAD_P.slice(), 3)); g.setIndex([0, 1, 2, 0, 2, 3]); }
    for (const k in attrs) g.setAttribute(k, new THREE.InstancedBufferAttribute(attrs[k][0], attrs[k][1]));
    g.instanceCount = n;
    return g;
  }

  // ---------- GLSL: kamerpalet bovenop B.KOP (alle materialen krijgen de kamer-uniforms UJ, ook als ze ze niet gebruiken) ----------
  const J_KOP = `
uniform vec3 uJA, uJB, uJC;
vec3 jpal(float t) { t = fract(t) * 3.0; return t < 1.0 ? mix(uJA, uJB, t) : t < 2.0 ? mix(uJB, uJC, t - 1.0) : mix(uJC, uJA, t - 2.0); }
`;
  const mat = (vs, fs, u, o) => new THREE.ShaderMaterial(Object.assign({ uniforms: Object.assign({}, B.U, u || {}), vertexShader: B.KOP + J_KOP + vs, fragmentShader: B.KOP + J_KOP + fs }, o || {}));
  const addMat = (vs, fs, u, o) => mat(vs, fs, u, Object.assign({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }, o || {}));

  // 1. VARENS en PALMBLADEREN (één InstancedMesh): blad = gebogen strook, gevind in de fragment-shader; nerven gloeien in neon,
  //    een lichtgolf loopt per tel van voet naar punt, de kleur verspringt per maat (opbouw per 2 tellen, drop elke tel)
  const VAREN_VS = `attribute vec4 iV;   // lengte, halve breedte, beginhoek, doorbuiging
attribute vec4 iW;                     // kleur, fase, soort (0 varen, 1 palmblad), kom
varying vec2 vUv; varying vec3 vW, vN; varying vec4 vI;
void main() {
  float u = uv.x * 2.0 - 1.0, v = uv.y;
  float L = iV.x * (1.0 + 0.045 * uBas + 0.05 * uDrop);
  float zw = (0.08 * sin(uT * 0.8 + iW.y) + 0.035 * sin(uT * 2.1 + iW.y * 1.7)) * (1.0 + 0.8 * uOpb) + 0.06 * uBas * sin(uT * 6.0 + iW.y);
  float k = iV.w + zw;
  if (abs(k) < 0.02) k = k < 0.0 ? -0.02 : 0.02;
  float th = iV.z - k * v;
  float vooruit = L * (sin(iV.z) - sin(th)) / k, op = L * (cos(th) - cos(iV.z)) / k;   // nerf met een gelijkmatig buigende hoek
  float br = iV.y * pow(max(sin(PI * clamp((v - 0.06) * 1.1, 0.0, 1.0)), 0.0), 0.6) * (1.0 + 0.3 * v);
  vec3 p = vec3(u * br + sin(uT * 1.3 + iW.y + v * 2.0) * 0.05 * v * L, op - abs(u) * br * iW.w, vooruit);
  vec3 T = vec3(0.0, sin(th), cos(th)), S = normalize(vec3(1.0, -sign(u) * iW.w, 0.0));
  vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);
  vW = w.xyz; vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normalize(cross(S, T)));
  vUv = vec2(u, v); vI = vec4(iW.x, iW.y, iW.z, L);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
  const VAREN_FS = `varying vec2 vUv; varying vec3 vW, vN; varying vec4 vI;
uniform vec3 uVuurW;
void main() {
  float u = vUv.x, v = vUv.y, au = abs(u), palm = vI.z;
  float df = abs(fract(v * mix(15.0, 26.0, palm) + au * mix(3.0, 7.0, palm)) - 0.5);
  float bladB = mix(0.42, 0.36, palm) * (1.0 - mix(0.7, 0.85, palm) * au);
  float ver = smoothstep(9.0, 20.0, distance(cameraPosition, vW));   // ver weg dicht: geen flikkerende blaadjes
  float blad = max(step(df, bladB), ver * step(au, 0.9)) * step(au, 0.985) * step(0.05, v);
  if (blad + step(au, 0.06) < 0.5) discard;
  float hoofd = exp(-au * au * 700.0), zij = exp(-df * df * 200.0) * (1.0 - au) * blad;
  float rand = smoothstep(bladB - 0.1, bladB, df) * blad, punt = smoothstep(0.75, 0.97, au) * blad;
  float per = mix(mix(mix(4.0, 2.0, isOpb()), 1.0, isDrop()), 8.0, isBreak());
  vec3 kPal = jpal(vI.x * 2.0 + v * 0.4 + uT * 0.02);
  vec3 gk = mix(mix(kPal, neon(fract(vI.x + floor(uTel / per) * 0.137 + v * 0.12)), 0.45), kl(vI.x + v * 0.3), 0.25 + 0.35 * uDrop);
  float ft = fract(uTel);
  float golf = mix(exp(-(((v - ft * 1.25 + 0.1) * 5.0) * ((v - ft * 1.25 + 0.1) * 5.0))) * (1.0 - 0.4 * ft), 0.5 + 0.5 * sin(v * 7.0 - uT * 1.6 + vI.y), isBreak());
  float niv = 1.0 - 0.65 * uBlack;
  float k = (0.18 + 0.45 * uPuls * uEn + 0.9 * golf * (0.5 + 0.5 * uEn) + 0.25 * uOpb + 0.8 * uDrop) * niv;
  vec3 c = vec3(0.004, 0.016, 0.01) * (0.6 + 0.8 * v);
  c += gk * (hoofd * 1.1 + zij * 0.7 + rand * 0.3 + punt * 0.5) * k + gk * (0.06 + 0.05 * golf) * niv * blad;
  vec3 n = normalize(vN), Lv = uVuurW - vW;
  float dl = max(length(Lv), 0.01);
  c += vec3(1.0, 0.42, 0.12) * abs(dot(n, Lv / dl)) * 0.32 / (1.0 + dl * dl * 0.05) * uVlam;
  c += kPal * pow(1.0 - abs(dot(n, normalize(cameraPosition - vW))), 3.0) * 0.12 * niv;
  gl_FragColor = vec4(flitsWit(c), 1.0);
}`;
  const VAREN_GEO = houd(new THREE.PlaneGeometry(1, 1, 2, 14));

  // 2. PADDENSTOELEN (één InstancedMesh): vliegenzwam (bolle hoed, uv-witte stippen) of psilocybe (spitse kegel, tepeltje);
  //    hoeden zwellen op de bas en klappen op de drop, lamellen lichten op de tel op, een ring loopt vanuit het kampvuur
  const ZWAM_VS = `attribute vec4 iZ;   // kleur, soort (0 vliegenzwam, 1 psilocybe), fase, reus
varying vec3 vL, vW, vN; varying vec4 vZ; varying float vDeel;
void main() {
  vec3 p = position;
  float ps = iZ.y, deel = p.y < 0.945 ? 0.0 : (p.y < 1.02 && normal.y < 0.2 ? 1.0 : 2.0);
  float zwel = 1.0 + (0.1 + 0.08 * iZ.w) * uBas * (0.5 + 0.5 * uEn) + 0.12 * uDrop * ((1.0 - fract(uTel)) * (1.0 - fract(uTel)));
  if (deel > 0.5) {
    if (ps > 0.5) {
      float rr = length(p.xz) / 0.445;
      p.y = deel < 1.5 ? 0.95 + (p.y - 0.955) * 0.4 : 0.97 + 0.62 * pow(max(1.0 - rr, 0.0), 0.75) + 0.05 * exp(-rr * rr * 60.0);
      p.xz *= 0.68;
    }
    p.xz *= zwel; p.y = 0.94 + (p.y - 0.94) * zwel;
  } else if (ps > 0.5) { p.xz *= 0.55; p.x += sin(p.y * 4.0 + iZ.z) * 0.03; }
  p.x += sin(uT * 0.9 + iZ.z) * 0.025 * p.y * p.y;
  p.z += cos(uT * 0.7 + iZ.z) * 0.02 * p.y * p.y;
  vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);
  vW = w.xyz; vL = p; vZ = iZ; vDeel = deel;
  vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
  const ZWAM_FS = `varying vec3 vL, vW, vN; varying vec4 vZ; varying float vDeel;
uniform vec3 uVuurW;
void main() {
  vec3 n = normalize(vN), V = normalize(cameraPosition - vW);
  float rim = ((1.0 - abs(dot(n, V))) * (1.0 - abs(dot(n, V)))), niv = 1.0 - 0.6 * uBlack, ps = vZ.y;
  float golf = exp(-((distance(vW.xz, uVuurW.xz) - fract(uTel * 0.5) * 22.0) * (distance(vW.xz, uVuurW.xz) - fract(uTel * 0.5) * 22.0)) * 0.12);
  float k = (0.55 + 0.18 * sin(uT * 1.7 + vZ.z * 9.0) + 0.75 * uBas * uEn + 0.35 * uPuls + golf + 0.8 * uDrop) * niv;
  float stap = floor(uTel / mix(mix(4.0, 1.0, isDrop()), 16.0, isBreak()));
  vec3 kap = ps > 0.5 ? mix(jpal(vZ.x + stap * 0.21), neon(fract(0.55 + vZ.x * 0.3 + stap * 0.09)), 0.5)
                      : mix(neon(fract(0.97 + 0.06 * vZ.x + stap * 0.05)), jpal(vZ.x + stap * 0.11), 0.3);
  vec3 c;
  if (vDeel < 0.5) {         // steel: bleek uv-wit met strepen
    float st = 0.5 + 0.5 * sin(atan(vL.z, vL.x) * 7.0 + vL.y * 9.0);
    c = mix(vec3(0.35, 0.3, 0.75), kap, 0.25) * (0.06 + 0.12 * st) * (0.6 + 0.6 * k) + kap * rim * 0.25 * k;
  } else if (vDeel < 1.5) {  // lamellen onder de hoed
    float lam = pow(abs(sin(atan(vL.z, vL.x) * 30.0)), 8.0);
    c = kap * (0.05 + lam * (0.4 + 0.8 * uHoog + 0.6 * pow(1.0 - fract(uTel), 3.0)) * length(vL.xz) / 0.45) * k;
  } else {                   // hoed
    c = kap * (0.3 + 0.55 * rim) * k;
    if (ps < 0.5) {
      vec3 q = vL * 11.0 + vZ.z * 7.0, id = floor(q);
      float d = length(fract(q) - 0.5 - (h33(id) - 0.5) * 0.4);
      c = mix(c, vec3(0.8, 0.85, 1.0) * (0.35 + 0.9 * k), step(0.62, h31(id)) * smoothstep(0.32, 0.18, d) * smoothstep(1.05, 1.15, vL.y));
    } else {
      c += mix(kap, vec3(1.0), 0.4) * smoothstep(1.35, 1.6, vL.y) * (0.6 + 0.8 * uPuls) * niv;
      c += kap * smoothstep(0.08, 0.0, abs(fract(vL.y * 9.0 - uT * 0.7) - 0.5) - 0.42) * 0.3 * k;
    }
  }
  gl_FragColor = vec4(flitsWit(c), 1.0);
}`;
  const ZWAM_GEO = houd(new THREE.LatheGeometry([[0.001, 0], [0.11, 0], [0.1, 0.06], [0.085, 0.35], [0.075, 0.72], [0.085, 0.94], [0.16, 0.955], [0.3, 0.975],
    [0.43, 1.0], [0.445, 1.035], [0.42, 1.12], [0.36, 1.22], [0.26, 1.3], [0.13, 1.345], [0.001, 1.36]].map(([x, y]) => new THREE.Vector2(x, y)), 16));

  // 3. ALLES WAT VAST STAAT in één mesh (aS: 0 schors, 1 palmstam, 2 stronk-bovenkant, 3 rots, 4 runensteen, 5 bloemsteel; aL = lengte)
  const STAT_VS = `attribute float aS, aL;
varying vec3 vP, vW, vN; varying float vS, vLn;
void main() { vP = position; vS = aS; vLn = aL; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`;
  const STAT_FS = `varying vec3 vP, vW, vN; varying float vS, vLn;
uniform vec3 uVuurW, uStomp, uHor, uDjW, uDjK;
uniform float uDjI;
float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }
float rune(vec2 q, float h) {
  float d = seg(q, vec2(0.0, -0.38), vec2(0.0, 0.38));
  if (fract(h * 2.0) > 0.5) d = min(d, seg(q, vec2(0.0, 0.38), vec2(0.28, 0.12)));
  if (fract(h * 4.0) > 0.5) d = min(d, seg(q, vec2(0.0, 0.1), vec2(-0.28, -0.12)));
  if (fract(h * 8.0) > 0.5) d = min(d, seg(q, vec2(-0.26, 0.0), vec2(0.26, 0.0)));
  if (fract(h * 16.0) > 0.5) d = min(d, seg(q, vec2(0.0, -0.38), vec2(0.26, -0.18)));
  return d;
}
void main() {
  vec3 n = normalize(vN), V = normalize(cameraPosition - vW);
  float niv = 1.0 - 0.6 * uBlack, rim = pow(1.0 - abs(dot(n, V)), 2.5), s = vS;
  vec3 c;
  if (s < 0.5) {         // schors: vezels, lichtgevende aders die omhoog stromen, op elke 2 tellen klimt een ring, mos onderaan
    float vez = vn(vec2((vP.x + vP.z) * 4.0 + vP.y * 0.2, vP.y * 0.35));
    c = vec3(0.022, 0.016, 0.012) * (0.4 + 1.1 * vez);
    float ader = smoothstep(0.03, 0.0, abs(vn(vec2((vP.x - vP.z) * 1.4, vP.y * 0.22 - uReis * 0.12)) - 0.5));
    float ring = exp(-((vLn - fract(uTel * 0.5) * 18.0) * (vLn - fract(uTel * 0.5) * 18.0)) * 0.6) * (1.0 - 0.7 * isBreak());
    c += jpal(vP.y * 0.04 + uReis * 0.01 + vez * 0.3) * ader * (0.2 + 0.5 * uPuls * uEn + 1.2 * ring + 0.6 * uDrop) * niv;
    vec2 mq = vec2(vP.x + vP.z, vP.y) * 4.0;
    c += mix(vec3(0.1, 1.0, 0.5), uK1, 0.4) * step(0.9, h21(floor(mq))) * smoothstep(0.45, 0.1, length(fract(mq) - 0.5)) * smoothstep(6.0, 0.0, vP.y) * (0.3 + 0.5 * uPuls) * niv;
  } else if (s < 1.5) {  // palmstam: ringen, looplicht omhoog
    float rr = fract(vLn * 3.0);
    c = vec3(0.03, 0.022, 0.014) * (0.5 + 0.6 * smoothstep(0.0, 0.4, rr));
    float naad = smoothstep(0.1, 0.0, min(rr, 1.0 - rr)), loop = exp(-((vLn - fract(uTel * 0.25) * 12.0) * (vLn - fract(uTel * 0.25) * 12.0)) * 0.8);
    c += jpal(0.3 + vLn * 0.05) * naad * (0.12 + 0.4 * uPuls * uEn + 1.4 * loop + 0.6 * uDrop) * niv;
  } else if (s < 2.5) {  // stronk: jaarringen als ledringen, op de tel een golf naar buiten
    float r = length(vW.xz - uStomp.xz);
    float lijn = smoothstep(0.1, 0.0, abs(fract(r * 3.2 + 0.15 * vn(vW.xz * 2.0)) - 0.5));
    float golf = exp(-((r - fract(uTel) * 2.2) * (r - fract(uTel) * 2.2)) * 18.0);
    c = vec3(0.03, 0.02, 0.012) + klH(floor(r * 3.2) + floor(uTel)) * lijn * (0.12 + 0.5 * uPuls * uEn + 1.4 * golf + 0.6 * uDrop) * niv;
  } else if (s < 3.5) {  // rots: gesteente, aders, mos
    vec2 q = abs(n.y) > 0.7 ? vP.xz : vec2(vP.x + vP.z, vP.y);
    float r1 = fbm(q * 0.35);
    c = vec3(0.03, 0.028, 0.036) * (0.45 + r1) * (0.85 + 0.45 * max(n.y, 0.0));
    float ader = smoothstep(0.025, 0.0, abs(vn(q * vec2(0.25, 0.15) + vec2(0.0, -uReis * 0.05)) - 0.5));
    c += jpal(vP.y * 0.05 + r1) * ader * (0.15 + 0.45 * uPuls * uEn + 0.6 * uDrop + 0.3 * uOpb) * niv;
    vec2 mq = q * 4.5; float mh = h21(floor(mq) + 2.1);
    c += mix(vec3(0.15, 1.0, 0.55), uK1, 0.35) * step(0.72, mh) * smoothstep(0.42, 0.12, length(fract(mq) - 0.5)) * smoothstep(0.55, 0.75, fbm(q * 0.3 + 4.0)) * (0.35 + 0.35 * sin(uT * 2.0 + mh * 30.0) + 0.4 * uPuls) * niv;
  } else if (s < 4.5) {  // runensteen: runen lichten op, de golf klimt per tel
    vec2 q = abs(n.y) > 0.6 ? vP.xz : abs(n.x) > abs(n.z) ? vec2(vP.z, vP.y) : vec2(vP.x, vP.y);
    c = vec3(0.025, 0.022, 0.032) * (0.55 + 0.7 * fbm(q * 1.4));
    vec2 cel = q / 0.3, id = floor(cel);
    float h = h21(id + 3.3), d = rune(fract(cel) - 0.5, h);
    float aan = smoothstep(0.35, 0.0, fract(id.y * 0.13 + abs(id.x) * 0.07 - uTel * 0.25));
    float kk = (0.18 + 1.1 * aan * (0.5 + 0.5 * uEn) + 0.8 * uDrop * step(0.5, fract(uTel * 2.0 + h))) * niv;
    c = c * (1.0 - 0.5 * smoothstep(0.12, 0.05, d)) + klH(floor(uTel / 4.0) + step(0.5, h)) * smoothstep(0.075, 0.035, d) * kk;
  } else {               // bloemsteel: groen, sap stroomt omhoog
    float st = 0.5 + 0.5 * sin(atan(n.z, n.x) * 6.0 + vLn * 2.0);
    float sap = pow(fract(vLn * 0.35 - uT * 0.6), 6.0) + exp(-((vLn - fract(uTel) * 9.0) * (vLn - fract(uTel) * 9.0)) * 1.5);
    c = vec3(0.01, 0.04, 0.02) * (0.6 + 0.6 * st) + mix(vec3(0.2, 1.0, 0.4), jpal(0.6), 0.4) * (0.08 + sap * (0.5 + 0.6 * uEn) + 0.5 * uDrop) * (0.4 + 0.6 * st) * niv;
  }
  vec3 Lv = uVuurW - vW; float dl = max(length(Lv), 0.01);
  c += vec3(1.0, 0.33, 0.06) * max(dot(n, Lv / dl), 0.0) * 0.9 / (1.0 + dl * dl * 0.16) * uVlam * (0.75 + 0.25 * sin(uT * 11.0 + vW.y)) * (s > 3.5 && s < 4.5 ? 0.45 : 1.0);
  vec3 Ld = uDjW - vW; float dd = max(length(Ld), 0.01);
  c += uDjK * max(dot(n, Ld / dd), 0.0) * uDjI / (1.0 + dd * dd * 0.12);
  c += jpal(0.5) * rim * 0.06 * niv;
  c = mix(c, uHor * 0.18, smoothstep(30.0, 80.0, distance(cameraPosition, vW)) * 0.6);
  gl_FragColor = vec4(flitsWit(c), 1.0);
}`;

  // 4. BLADERDAK (klonten boven de zijkanten): bijna zwart, lichtgevende blaadjes die op de tel aangaan, rand in het palet
  const KROON_VS = `attribute vec2 iK;
varying vec3 vW, vN; varying vec2 vK;
void main() {
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  w.x += sin(uT * 0.4 + iK.y * 6.0) * 0.15 * (position.y + 1.0);
  vW = w.xyz; vK = iK; vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
  const KROON_FS = `varying vec3 vW, vN; varying vec2 vK;
void main() {
  vec3 n = normalize(vN), V = normalize(cameraPosition - vW);
  float niv = 1.0 - 0.6 * uBlack;
  vec3 c = vec3(0.003, 0.008, 0.006) * (0.6 + 0.6 * max(n.y, 0.0));
  vec3 q = vW * 2.2, id = floor(q);
  float h = h31(id), p = step(0.8, h) * smoothstep(0.38, 0.05, length(fract(q) - 0.5));
  float tw = 0.4 + 0.6 * sin(uT * (1.0 + 2.0 * h) + h * 40.0);
  c += jpal(h * 3.0 + vK.x) * p * (0.25 + 0.45 * tw + 0.7 * uPuls * uEn * step(0.5, fract(h * 7.0 + floor(uTel) * 0.37)) + 0.6 * uDrop) * niv;
  c += mix(vec3(1.0, 0.4, 0.12) * uVlam * 0.5, jpal(vK.x), 0.5) * max(-n.y, 0.0) * 0.05 * niv;
  c += jpal(vK.x + 0.3) * pow(1.0 - abs(dot(n, V)), 3.0) * 0.12 * niv;
  gl_FragColor = vec4(flitsWit(c), 1.0);
}`;
  const KROON_GEO = houd((() => {
    const g = new THREE.IcosahedronGeometry(1, 2), p = g.attributes.position, n = ruis(311);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 0.72 + 0.5 * n(x * 2.1 + 5, y * 2.3 + z * 1.7);
      p.setXYZ(i, x * k, y * k * (y < 0 ? 0.7 : 0.95), z * k);
    }
    g.computeVertexNormals();
    return g;
  })());

  // 5. LIANEN (instanced strook die naar de camera draait): blaadjes, lichtdruppels lopen omlaag, op de tel een golf van boven naar onder
  const LIAAN_VS = `attribute vec4 iL, iM;   // top (x, y, z), lengte | fase, kleur, dikte, sterkte
varying vec2 vC; varying float vLen; varying vec4 vM;
void main() {
  float onder = 0.5 - position.y;   // 0 bovenaan, 1 onderaan
  vec3 p = iL.xyz - vec3(0.0, onder * iL.w, 0.0);
  float zw = pow(onder, 1.6);
  p.x += zw * (0.35 * sin(uT * 0.6 + iM.x) + 0.12 * sin(uT * 1.7 + iM.x * 2.0) + 0.15 * uBas * sin(uT * 5.0 + iM.x));
  p.z += zw * 0.3 * cos(uT * 0.5 + iM.x * 1.3);
  vec3 w = (modelMatrix * vec4(p, 1.0)).xyz, nc = cameraPosition - w;
  w += normalize(vec3(nc.z, 0.0, -nc.x) + vec3(0.0001, 0.0, 0.0)) * position.x * iM.z;
  vC = vec2(position.x * 2.0, onder * iL.w); vLen = iL.w; vM = iM;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;
  const LIAAN_FS = `varying vec2 vC; varying float vLen; varying vec4 vM;
void main() {
  float x = abs(vC.x), m = vC.y;
  float kern = exp(-x * x * 40.0);
  float bi = floor(m / 0.3), kant = mod(bi, 2.0) * 2.0 - 1.0;
  float blad = smoothstep(0.5, 0.2, length(vec2((vC.x - kant * 0.45) * 1.6, (fract(m / 0.3) - 0.5) * 2.2)));
  float dr = pow(fract(m * 0.45 - uT * (0.5 + 0.4 * vM.w) + vM.x), 14.0);
  float golf = exp(-((m - fract(uTel) * (vLen + 2.0)) * (m - fract(uTel) * (vLen + 2.0))) * 1.5) * (1.0 - 0.6 * isBreak());
  float niv = 1.0 - 0.55 * uBlack;
  vec3 kk = mix(jpal(vM.y + m * 0.05), kl(vM.y), 0.3 + 0.4 * uDrop);
  vec3 c = kk * (kern * (0.08 + dr * 1.4 + golf * 1.2 + 0.6 * uDrop) + blad * (0.05 + 0.3 * golf + 0.2 * uPuls * uEn)) * vM.w;
  c *= smoothstep(0.0, 0.4, m);
  c += kk * exp(-(((vLen - m) * 3.0) * ((vLen - m) * 3.0))) * exp(-x * x * 4.0) * (0.4 + 0.8 * uPuls);   // gloeibolletje aan het eind
  gl_FragColor = vec4(c * niv * (1.0 + 0.8 * uFlits), 1.0);
}`;
  const LIAAN_GEO = houd(new THREE.PlaneGeometry(1, 1, 1, 16));

  // 6. WATERVAL (strepen stromen omlaag, schuim onderaan, op de tel valt een lichtgolf mee), VIJVER (spiegelt de lucht, kringen,
  //    lichtgevende algen en waterlelies), MIST (lage lagen, op het vuur oranje, in de break meer)
  const VAL_VS = `varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`;
  const VAL_FS = `varying vec2 vUv;
void main() {
  float u = vUv.x, v = vUv.y;
  float rand = smoothstep(0.0, 0.12, u) * smoothstep(1.0, 0.88, u);
  float s1 = vn(vec2(u * 14.0, v * 3.0 - uT * 2.6)), s2 = vn(vec2(u * 31.0 + 5.0, v * 7.0 - uT * 4.1));
  float str = pow(s1 * 0.6 + s2 * 0.5, 3.0);
  float niv = 1.0 - 0.5 * uBlack;
  vec3 kk = mix(vec3(0.3, 0.9, 1.0), jpal(u * 0.5 + v * 0.3 + uT * 0.03), 0.45);
  float golf = exp(-((v - fract(uTel) * 1.2) * (v - fract(uTel) * 1.2)) * 30.0) * (1.0 - 0.6 * isBreak());
  vec3 c = kk * (0.05 + str * (0.55 + 0.4 * uEn) + golf * 0.7 + 0.5 * uDrop * str) * rand;
  c += vec3(0.75, 0.9, 1.0) * smoothstep(0.82, 1.0, v) * (0.6 + 0.6 * s2) * (0.35 + 0.5 * uPuls) * rand;
  c += kk * smoothstep(0.08, 0.0, v) * 0.4 * rand;
  gl_FragColor = vec4(c * niv * (1.0 + 0.8 * uFlits), 1.0);
}`;
  const VIJVER_VS = `varying vec3 vP, vW;
void main() { vP = position; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
  const VIJVER_FS = `varying vec3 vP, vW;
uniform vec3 uHor, uZen, uValW;
void main() {
  float r = length(vP.xz);
  vec3 V = normalize(vW - cameraPosition);
  float dv = distance(vW.xz, uValW.xz), kr = sin(dv * 6.0 - uT * 5.0) * exp(-dv * 0.45) * 0.5;
  float ft = fract(uTel), tk = exp(-((r * 5.0 - ft * 5.5) * (r * 5.0 - ft * 5.5)) * 2.0) * (1.0 - ft) * (1.0 - 0.6 * isBreak());
  vec2 gg = vec2(vn(vW.xz * 1.3 + uT * 0.3), vn(vW.xz * 1.3 - uT * 0.25 + 7.0)) - 0.5;
  vec3 wn = normalize(vec3(gg.x * 0.5 + kr * 0.3, 1.0, gg.y * 0.5)), R = reflect(V, wn);
  float fr = pow(1.0 - max(dot(-V, wn), 0.0), 3.0);
  vec3 c = vec3(0.002, 0.006, 0.012) + mix(uHor, uZen, clamp(R.y * 2.0, 0.0, 1.0)) * (0.1 + 0.6 * fr);
  float niv = 1.0 - 0.5 * uBlack;
  vec3 kk = mix(vec3(0.0, 0.9, 1.0), jpal(0.2 + r * 0.3), 0.4);
  c += kk * smoothstep(0.75, 1.0, r) * (0.15 + 0.35 * uPuls * uEn + 0.5 * uDrop) * (0.5 + 0.5 * vn(vW.xz * 3.0 + uT)) * niv;
  c += kk * (max(kr, 0.0) * 0.25 + tk * 0.5) * niv;
  vec2 cel = vW.xz / 1.1, id = floor(cel);
  float h = h21(id + 9.1);
  if (h > 0.7 && r < 0.85) {   // waterlelie: blad met een gloeiende rand en een bloem die op de tel opflitst
    float d = length(fract(cel) - 0.5 - (vec2(h21(id + 1.3), h21(id + 2.9)) - 0.5) * 0.4);
    c = mix(c, vec3(0.005, 0.03, 0.015), smoothstep(0.24, 0.22, d));
    c += mix(vec3(0.2, 1.0, 0.5), kk, 0.5) * smoothstep(0.03, 0.0, abs(d - 0.23)) * 0.5 * niv;
    c += neon(fract(h * 5.0 + floor(uTel / 4.0) * 0.13)) * smoothstep(0.09, 0.0, d) * (0.6 + 0.9 * uPuls + uDrop) * niv;
  }
  gl_FragColor = vec4(c * (1.0 + 0.6 * uFlits), 1.0);
}`;
  const NEVEL_VS = `attribute vec4 iN;   // midden (x, y, z), straal
varying vec2 vC; varying vec3 vW;
void main() {
  vec3 p = vec3(iN.x + position.x * iN.w, iN.y + 0.06 * sin(uT * 0.3 + iN.x * 0.2 + iN.z * 0.3), iN.z + position.y * iN.w);
  vec4 w = modelMatrix * vec4(p, 1.0);
  vC = position.xy; vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
  const NEVEL_FS = `varying vec2 vC; varying vec3 vW;
uniform vec3 uVuurW;
void main() {
  float rr = dot(vC, vC);
  if (rr > 1.0) discard;
  vec2 mp = vW.xz * 0.11 + vec2(uReis * 0.03, -uReis * 0.02) + vW.y * 3.0;
  float n1 = 0.62 * vn(mp) + 0.38 * vn(mp * 2.03 + 17.1), n2 = vn(vW.xz * 0.35 - vec2(uT * 0.05, uT * 0.03));   // 3 ruislagen: goedkoop over het hele beeld
  float m = smoothstep(0.35, 0.85, n1 * 0.75 + n2 * 0.35) * (1.0 - rr);
  m *= smoothstep(0.8, 4.0, distance(cameraPosition, vW)) * smoothstep(0.05, 0.5, abs(cameraPosition.y - vW.y));   // nooit een harde laag door de camera
  vec3 kk = mix(jpal(n1 + uT * 0.02), vec3(1.0, 0.45, 0.15), exp(-distance(vW.xz, uVuurW.xz) * 0.25) * uVlam * 0.8);
  float niv = (0.06 + 0.05 * uPuls * uEn + 0.1 * uDrop + 0.05 * isBreak()) * (1.0 - 0.3 * uBlack) + uFlits * 0.2;
  gl_FragColor = vec4(kk * m * niv, 1.0);
}`;

  // 7. REUZENBLOEM: drie kransen bladen (instanced strook) om een as; open = uOpen (veer in update), draait met uDraai; caleidoscoop
  //    (gespiegelde hoek + kali-fractal) in de bladen, een ring loopt op de tel naar buiten. HART: mandala die meedraait.
  const BLAD_VS = `attribute vec4 iB;   // krans, hoek, lengte, breedte
uniform float uOpen, uDraai;
uniform vec3 uC, uAs, uE1, uE2;
varying vec2 vUv; varying vec3 vW; varying float vRing, vPhi, vR;
void main() {
  float u = uv.x * 2.0 - 1.0, v = uv.y, ring = iB.x;
  float phi = iB.y + uDraai * (mod(ring, 2.0) > 0.5 ? -1.0 : 1.0);
  vec3 R = cos(phi) * uE1 + sin(phi) * uE2, T = cos(phi) * uE2 - sin(phi) * uE1;
  float open = clamp(uOpen, 0.0, 1.3) * (1.0 - 0.16 * ring);
  float a0 = mix(0.2, 1.6, open), k = mix(1.1, -0.45, clamp(open, 0.0, 1.0));
  if (abs(k) < 0.02) k = 0.02;
  float al = a0 - k * v, L = iB.z * (1.0 + 0.04 * uBas + 0.05 * uDrop);
  float ax = L * (sin(a0) - sin(al)) / k, rad = L * (cos(al) - cos(a0)) / k;
  float wd = iB.w * pow(max(sin(PI * v), 0.0), 0.55) * (0.6 + 0.6 * v);
  vec3 Np = cos(al) * R - sin(al) * uAs;
  float rb = mix(0.95, 0.3, ring * 0.5);
  vec3 p = uC + R * (rb + rad) + uAs * (ax + 0.08 * ring) + T * u * wd - Np * u * u * wd * 0.35;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vW = w.xyz; vUv = vec2(u, v); vRing = ring; vR = rb + rad; vPhi = phi + u * wd / max(rb + rad, 0.4);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
  const BLAD_FS = `varying vec2 vUv; varying vec3 vW; varying float vRing, vPhi, vR;
uniform float uOpen;
void main() {
  float u = vUv.x, v = vUv.y;
  float af = abs(fract(vPhi * 6.0 / PI) - 0.5) * 2.0;   // 12 spiegelvakken
  vec2 q = vec2(af * 0.9 + 0.08, vR * 0.38 + 0.05 + 0.15 * sin(uReis * 0.05));
  vec2 c2 = vec2(0.7 + 0.08 * sin(uReis * 0.031), 0.55 + 0.07 * cos(uReis * 0.023));
  float acc = 0.0, mn = 9.0;
  for (int i = 0; i < 5; i++) { q = abs(q) / max(dot(q, q), 0.03) - c2; mn = min(mn, abs(q.x * q.y)); acc += exp(-dot(q, q) * 1.5); }
  float stap = floor(uTel / mix(mix(4.0, 2.0, isOpb()), 1.0, isDrop()));
  vec3 kk = mix(neon(fract(acc * 0.2 + vR * 0.07 + stap * 0.17 + uT * 0.02)), jpal(vRing * 0.33 + v * 0.3), 0.35);
  float puls = exp(-((vR - fract(uTel) * 4.5) * (vR - fract(uTel) * 4.5)) * 3.0) * (1.0 - 0.6 * isBreak());
  float niv = 1.0 - 0.65 * uBlack;
  float hel = (0.1 + 0.2 * uEn + 0.3 * uPuls * uEn + 0.8 * puls + 0.6 * uDrop) * (0.35 + 0.65 * clamp(uOpen, 0.0, 1.0)) * niv;
  vec3 c = vec3(0.012, 0.003, 0.014) + kk * (0.06 + 0.4 * smoothstep(0.4, 2.6, acc) + 0.5 * smoothstep(0.05, 0.0, mn)) * hel;
  c += kk * (smoothstep(0.8, 1.0, abs(u)) + smoothstep(0.93, 1.0, v)) * (0.25 + 0.7 * puls + 0.4 * uDrop) * niv;
  c += mix(kk, vec3(1.0), 0.3) * exp(-u * u * 260.0) * (0.12 + 0.5 * puls) * niv;
  c += jpal(0.1) * (1.0 - v) * uOpb * 0.35 * niv;
  gl_FragColor = vec4(flitsWit(c), 1.0);
}`;
  const HART_VS = `varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  const HART_FS = `varying vec2 vUv;
uniform float uDraai;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p), a = atan(p.y, p.x) + uDraai * 2.0;
  vec2 q = vec2(abs(fract(a * 8.0 / TAU) - 0.5), r) * 1.3;
  float acc = 0.0;
  for (int i = 0; i < 4; i++) { q = abs(q) / max(dot(q, q), 0.03) - vec2(0.9, 0.6); acc += exp(-length(q) * 2.5); }
  vec3 kk = neon(fract(acc * 0.2 - r * 0.5 + uT * 0.1 + floor(uTel) * 0.11));
  float stip = smoothstep(0.08, 0.0, abs(r - 0.62 - 0.05 * uPuls)) * step(0.5, fract(a * 12.0 / TAU + uTel * 0.5));
  float niv = 1.0 - 0.6 * uBlack;
  vec3 c = kk * (0.12 + 0.4 * smoothstep(0.3, 2.0, acc)) * (0.5 + 0.5 * uEn + uDrop) * niv + vec3(1.0, 0.9, 0.7) * exp(-r * r * 18.0) * (0.6 + 1.2 * uPuls) * niv;
  c += jpal(0.7) * stip * (0.6 + uPuls) * niv;
  gl_FragColor = vec4(flitsWit(c), 1.0);
}`;
  const BLAD_GEO = houd(new THREE.PlaneGeometry(1, 1, 4, 12));

  // 8. BLOEMETJES langs het pad (sprites: bladen gaan open op de tel), KRING op de open plek (ringen lopen op de tel vanuit het vuur,
  //    zwamdraden, runenstippen), SPOREN die op de tel uit de hoeden blazen (Points)
  const BLOEMPJE_VS = `attribute vec4 iF, iG;   // plek (x, y, z), maat | kleur, fase
varying vec2 vC; varying vec4 vG;
void main() {
  vec4 mv = modelViewMatrix * vec4(iF.xyz + vec3(0.0, 0.04 * sin(uT * 1.1 + iG.y * 6.0), 0.0), 1.0);
  mv.xy += position.xy * iF.w * (0.8 + 0.25 * uPuls + 0.2 * uDrop);
  vC = position.xy; vG = iG;
  gl_Position = projectionMatrix * mv;
}`;
  const BLOEMPJE_FS = `varying vec2 vC; varying vec4 vG;
void main() {
  float r = length(vC);
  if (r > 1.0) discard;
  float a = atan(vC.y, vC.x) + vG.y * 6.0 + uSpin * 0.2, nb = 5.0 + floor(vG.x * 3.0);
  float open = clamp(0.55 + 0.25 * uPuls + 0.3 * uDrop - 0.25 * isBreak(), 0.2, 1.0);
  float vorm = open * (0.55 + 0.45 * abs(cos(a * nb * 0.5)));
  float blad = smoothstep(0.08, 0.0, r - vorm), rand = blad * smoothstep(0.7, 1.0, r / max(vorm, 0.05));
  vec3 kk = neon(fract(vG.x + floor(uTel / 4.0) * 0.17));
  float niv = 1.0 - 0.5 * uBlack;
  vec3 c = (kk * (blad * 0.22 + rand * 0.8) * (0.5 + 0.6 * uPuls * uEn + 0.6 * uDrop) + vec3(1.0, 0.95, 0.8) * exp(-r * r * 40.0) * (0.4 + 0.8 * uPuls)) * niv;
  gl_FragColor = vec4(c * (1.0 + 0.6 * uFlits), 1.0);
}`;
  const KRING_VS = `varying vec3 vP, vW;
void main() { vP = position; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
  const KRING_FS = `varying vec3 vP, vW;
uniform vec3 uVuurW;
void main() {
  float r = length(vP.xz), rv = distance(vW.xz, uVuurW.xz), ft = fract(uTel);
  float ring = exp(-((rv - ft * 7.5) * (rv - ft * 7.5)) * 3.0) * (1.0 - ft) * (1.0 - 0.6 * isBreak());
  float kr = smoothstep(0.06, 0.0, abs(r - 0.92)) + 0.6 * smoothstep(0.04, 0.0, abs(r - 0.82));
  float a = atan(vP.z, vP.x);
  float stip = step(0.5, fract(a * 48.0 / TAU + floor(uTel) * 0.25)) * smoothstep(0.03, 0.0, abs(r - 0.87));
  float draad = smoothstep(0.02, 0.0, abs(vn(vW.xz * 0.9 + 3.0) - 0.5)) * smoothstep(1.0, 0.3, r) * (0.25 + ring * 2.0 + 0.4 * uDrop);
  vec3 kk = mix(jpal(rv * 0.06 + uT * 0.03), kl(rv * 0.05), 0.4);
  vec3 c = kk * (ring * 0.45 + kr * (0.18 + 0.35 * uPuls * uEn + 0.4 * uDrop) + stip * (0.5 + uPuls) + draad * 0.3) * (1.0 - 0.5 * uBlack) * smoothstep(1.0, 0.95, r);
  gl_FragColor = vec4(c, 1.0);
}`;
  const SPOOR_VS = `attribute vec3 aR;
varying vec3 vKl; varying float vA;
void main() {
  float per = mix(mix(mix(2.0, 1.0 + step(uOpb, 0.5), isOpb()), 1.0, isDrop()), 8.0, isBreak());
  float age = fract((uTel + aR.x * 0.12) / per), t = age * per * 0.5;
  vec3 dir = normalize(vec3(aR.y - 0.5, 0.6 + aR.z, aR.x - 0.5));
  vec3 p = position + dir * (1.0 - exp(-t * 3.0)) * (0.7 + 0.8 * aR.z) * 1.2 + vec3(sin(uT + aR.x * 30.0), 0.0, cos(uT * 0.8 + aR.y * 20.0)) * 0.15 * t + vec3(0.0, t * 0.35, 0.0);
  vKl = mix(kl(aR.x), neon(fract(aR.y + floor(uTel) * 0.13)), 0.5) * 1.3;
  vA = (1.0 - age) * smoothstep(0.0, 0.03, age) * (0.6 + 0.6 * uEn) * (1.0 - 0.5 * uBlack);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = clamp(0.045 * (0.7 + aR.z) * projectionMatrix[1][1] * uPx / max(0.1, -mv.z), 1.5, 30.0);
  gl_Position = projectionMatrix * mv;
}`;
  const PUNT_FS = `varying vec3 vKl; varying float vA;
void main() { vec2 c = gl_PointCoord * 2.0 - 1.0; float d = dot(c, c); if (d > 1.0) discard; gl_FragColor = vec4(vKl * (exp(-d * 4.0) + 0.6 * exp(-d * 25.0)) * vA, 1.0); }`;

  // =====================================================================================================================================
  // vaste indeling (basis-coördinaten; per kamer x -> sx * x)
  // =====================================================================================================================================
  const KW_ = 28, KD = 40;
  const IND = {
    V: { x: 4.0, z: 0.6 },                                   // kampvuur
    DJ: { x: 11.5, z: 0.6 }, STOMP: { x: 11.4, z: 0.6, h: 1.1 }, ALTAAR: { x: 10.45, z: 0.6 },
    F: { x: 12.9, y: 6.8, z: 0.6 },                          // hart van de reuzenbloem (kijkt naar -x)
    OPEN: { x: 6.6, z: 0.6, rx: 7.6, rz: 7.4 },              // de open plek
    VIJ: { x: -9.3, z: 8.2, rx: 4.0, rz: 4.2 },
    WACHT: { x: -1.4, z: -0.6 },
    PIL: [{ x: 9.6, z: -4.2, h: 2.7, kant: -0.06 }, { x: 9.6, z: 5.4, h: 3.3, kant: 0.05 }],
    ROUTE: [[0, -20], [0, -18.2], [-2.2, -14.5], [-4.6, -9.5], [-4.2, -4.5], [-1.4, -0.6], [-3.0, 4.5], [-4.6, 9.2], [-3.2, 13.6], [-0.9, 17.0], [0, 18.6], [0, 20]],
    BOMEN: [[-11.6, -15.6, 1.5], [12.4, -14.2, 1.6], [-13.2, -7.2, 1.3], [13.8, 8.6, 1.4], [-12.4, -1.4, 1.1], [14.2, -6.4, 1.2], [-11.2, 16.4, 1.4], [11.6, 16.0, 1.2], [17.2, 1.2, 1.8]],
    PALMEN: [[8.6, -15.8, 9], [-9.6, -11.4, 9.2], [9.0, 9.4, 8.4], [11.2, -10.6, 8], [12.2, 12.4, 9.6], [-7.4, -17.0, 8], [6.8, 13.2, 7.6], [-14.6, -10.6, 9.6],
      [13.8, -17.4, 10.5], [-7.8, 17.2, 7.8], [9.6, -8.0, 7.2], [-3.6, -17.8, 6.5]],
    REUS: [[-6.8, -6.8, 2.6, 0], [2.0, -11.0, 1.9, 0], [4.2, 13.6, 2.2, 0], [5.6, -13.4, 2.0, 1], [-5.4, -14.6, 1.7, 1], [-10.4, 1.4, 1.6, 0]],  // x, z, schaal, soort
    // camerapunten die vrij moeten blijven van hoge planten: kraanzuilen, ingang, toren/tegen, waterval, rond de wachtplek
    CAMVRIJ: [[5, -6, 1.8], [-5, 6, 1.8], [5, 6, 1.8], [-5, -6, 1.8], [1.3, -17.6, 1.6], [-1.3, -17.6, 1.6], [2.6, 17.6, 1.6], [-2.6, 17.6, 1.6], [-6.8, 3.6, 2.0], [-1.4, -0.6, 3.4]],
  };
  const KLIF_A0 = 125 * Math.PI / 180, KLIF_A1 = 235 * Math.PI / 180;  // rotsboog om de vijver (hoek a: x = cx + R cos a, z = cz + R sin a)
  const PALETTEN = [[0xff2bd6, 0x20f0ff, 0x7dff2b], [0xb026ff, 0x00ffc8, 0xff7a1a], [0xff1f6e, 0x2b8cff, 0xc8ff1a], [0x39ff14, 0xff10f0, 0x00f0ff], [0xff5ec4, 0x7a5cff, 0x00ffa2]];
  const ROUTE = IND.ROUTE.map(([x, z]) => ({ x, z }));
  function routeAfstand(x, z) {
    let m = 1e9;
    for (let i = 0; i < ROUTE.length - 1; i++) {
      const a = ROUTE[i], b = ROUTE[i + 1], dx = b.x - a.x, dz = b.z - a.z, t = klem(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1));
      m = Math.min(m, Math.hypot(x - a.x - dx * t, z - a.z - dz * t));
    }
    return m;
  }
  const inEllips = (x, z, e, k) => Math.pow((x - e.x) / (e.rx * k), 2) + Math.pow((z - e.z) / (e.rz * k), 2) < 1;
  function inKlif(x, z) {
    const dx = x - IND.VIJ.x, dz = z - IND.VIJ.z, R = Math.hypot(dx, dz);
    let a = Math.atan2(dz, dx); if (a < 0) a += TAU;
    return R > 4.4 && R < 13.5 && a > KLIF_A0 - 0.14 && a < KLIF_A1 + 0.14;
  }

  // =====================================================================================================================================
  // vaste geometrie (basis-coördinaten), samen één mesh
  // =====================================================================================================================================
  function naarDeel(g, s, lFn) {  // -> position + normal + aS + aL + index (zelfde attributen voor samenvoegen)
    if (!g.index) { const n = g.attributes.position.count, ix = new Array(n); for (let i = 0; i < n; i++) ix[i] = i; g.setIndex(ix); }
    if (!g.attributes.normal) g.computeVertexNormals();
    const p = g.attributes.position, n = p.count, aS = new Float32Array(n), aL = new Float32Array(n);
    for (let i = 0; i < n; i++) { aS[i] = typeof s === 'function' ? s(i, g) : s; aL[i] = lFn ? lFn(i, g) : p.getY(i); }
    const u = new THREE.BufferGeometry();
    u.setAttribute('position', p); u.setAttribute('normal', g.attributes.normal);
    u.setAttribute('aS', new THREE.BufferAttribute(aS, 1)); u.setAttribute('aL', new THREE.BufferAttribute(aL, 1));
    u.setIndex(g.index);
    return u;
  }
  function spiegel(g) {  // x -> -x; winding om, zodat de voorkant voorkant blijft
    const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) { p.setX(i, -p.getX(i)); n.setX(i, -n.getX(i)); }
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  }
  function stam(x, z, rr, H, r) {  // reuzenboom: plankwortels onderaan, licht gebogen, dichtere ringen bij de voet
    const g = new THREE.CylinderGeometry(rr * 0.5, rr, H, 14, 14, true), p = g.attributes.position;
    const ph = r() * 6.3, nF = 4 + Math.floor(r() * 3), bx = (r() - 0.5) * 1.6, bz = (r() - 0.5) * 1.6;
    for (let i = 0; i < p.count; i++) {
      const px = p.getX(i), pz = p.getZ(i), t = (p.getY(i) + H / 2) / H, y = H * Math.pow(t, 1.8) - 0.3;
      const a = Math.atan2(pz, px), fl = 1 + (0.25 + 1.1 * Math.pow(Math.max(0, Math.cos(nF * a + ph)), 5)) * Math.exp(-Math.max(y, 0) / 1.5);
      const tt = Math.max(y, 0) / H;
      p.setXYZ(i, px * fl + bx * tt * tt + x, y, pz * fl + bz * tt * tt + z);
    }
    g.computeVertexNormals();
    return { geo: g, bx, bz };
  }
  function tak(a, d, len, r0) {  // tak vanaf punt a in richting d
    const g = new THREE.CylinderGeometry(r0 * 0.4, r0, len, 8, 3, true).translate(0, len / 2, 0);
    g.applyMatrix4(M4.makeRotationFromQuaternion(Q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d)));
    return g.translate(a.x, a.y, a.z);
  }
  function palmStam(x, z, h, lx, lz) {
    const g = new THREE.CylinderGeometry(0.16, 0.27, h, 9, 12, true).translate(0, h / 2, 0), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i), t = y / h; p.setXYZ(i, p.getX(i) + lx * t * t + x, y, p.getZ(i) + lz * t * t + z); }
    g.computeVertexNormals();
    return g;
  }
  function steen(x, y, z, sx, sy, sz, ry, r) {
    const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position, n = ruis(Math.floor(r() * 1e5));
    for (let i = 0; i < p.count; i++) { const a = p.getX(i), b = p.getY(i), c = p.getZ(i), k = 0.75 + 0.45 * n(a * 1.7 + 3, b * 1.7 + c * 1.3); p.setXYZ(i, a * k, b * k, c * k); }
    g.scale(sx, sy, sz).rotateY(ry).translate(x, y, z);
    g.computeVertexNormals();
    return g;
  }
  function blok(w, h, d, x, y, z, ry, rz) { return new THREE.BoxGeometry(w, h, d).rotateZ(rz || 0).rotateY(ry || 0).translate(x, y, z); }
  function klif(r) {  // rotsboog achter de vijver (binnenkant naar de vijver), met een lage inkeping voor de waterval op a = pi
    const c = IND.VIJ, n = ruis(Math.floor(r() * 1e6)), NK = 24, kol = [];
    for (let i = 0; i <= NK; i++) kol.push(KLIF_A0 + (KLIF_A1 - KLIF_A0) * i / NK);
    const mid = a => Math.abs(a - Math.PI);
    const Rf = a => 5.25 + 0.45 * n(a * 5.3, 4.4) * glad(mid(a), 0.05, 0.35);
    const Hf = a => { const e = Math.min(a - KLIF_A0, KLIF_A1 - a); let h = 10.4 + 1.8 * n(a * 3.1, 1.7); h = 9.4 + (h - 9.4) * glad(mid(a), 0.07, 0.3); return Math.max(0.25, h * glad(e, 0, 0.4)); };
    const rel = (a, y) => (0.7 * n(a * 9 + 2, y * 0.35) + 0.5 * n(a * 21, y * 0.9 + 5)) * 1.2 * glad(mid(a), 0.06, 0.32);  // vlak achter de waterval
    const RIJ = 12, KAP = [[0.5, 0.45], [2.4, 0.9], [4.8, 0.3], [6.6, -3.0]], rijen = 1 + RIJ + KAP.length;
    const pos = [], idx = [], top = [];
    for (const a of kol) {
      const h = Hf(a), R0 = Rf(a), ca = Math.cos(a), sa = Math.sin(a);
      for (let j = 0; j <= RIJ; j++) { const y = h * j / RIJ, R = R0 + rel(a, y); pos.push(c.x + R * ca, j === 0 ? -0.25 : y, c.z + R * sa); }
      const Rt = R0 + rel(a, h);
      top.push({ x: c.x + Rt * ca, y: h, z: c.z + Rt * sa, a });
      for (const [dr, dy] of KAP) { const R = Rt + dr; pos.push(c.x + R * ca, Math.max(0, h + dy * (0.7 + 0.6 * n(a * 4, dr))), c.z + R * sa); }
    }
    for (let i = 0; i < kol.length - 1; i++) for (let j = 0; j < rijen - 1; j++) { const a = i * rijen + j, b = a + rijen; idx.push(a, b, b + 1, a, b + 1, a + 1); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    // de binnenkant moet naar de vijver kijken: anders de winding om
    const mi = Math.floor(kol.length / 2) * rijen + 4, nn = geo.attributes.normal;
    if (nn.getX(mi) * (c.x - pos[mi * 3]) + nn.getZ(mi) * (c.z - pos[mi * 3 + 2]) < 0) {
      for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
      geo.setIndex(idx); geo.computeVertexNormals();
    }
    return { geo, lip: { x: c.x - Rf(Math.PI), y: Hf(Math.PI), z: c.z }, top };
  }
  function watervalGeo(lip, sx) {  // gebogen strook van de rand tot in de vijver (u dwars 0..1, v boven 0 -> onder 1)
    const NU = 8, NV = 28, P = [], UV = [], I = [];
    for (let j = 0; j <= NV; j++) {
      const v = j / NV, y = lip.y * (1 - v) + 0.03 * v, uit = 1.45 * Math.sqrt(v) + 0.12, hb = 1.15 + 0.45 * v;
      for (let i = 0; i <= NU; i++) { const u = i / NU; P.push(sx * (lip.x + uit), y, lip.z + (u * 2 - 1) * hb); UV.push(u, v); }
    }
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) { const a = j * (NU + 1) + i, b = a + NU + 1; I.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.setIndex(I); g.computeBoundingSphere();
    return g;
  }

  // =====================================================================================================================================
  // camera: knip op de tel tussen de shots van B.buitenCam (één instantie per shot) en eigen jungle-shots
  // =====================================================================================================================================
  function jungleCam(ctx, maat, L) {
    const r = ctx.rnd, Wk = maat.w / 2, Dk = maat.d / 2, sx = L.sx;
    const cp = new THREE.Vector3(), cl = new THREE.Vector3(), uit = { pos: cp, look: cl, fov: 60 }, lp = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3();
    const o = { vuur: L.V, dj: L.DJ, dansers: L.draaiers, hoog: 16 }, KIT = {};
    for (const s of ['volg', 'drone', 'kraan', 'vuur', 'toren', 'tegen']) KIT[s] = B.buitenCam(ctx, maat, [s], o);  // (kit-'ingang' stond vlak voor een poortpost: eigen 'poort')
    if (L.draaiers.length) KIT.held = B.buitenCam(ctx, maat, ['held'], o);
    const R = L.route, cum = [0];
    for (let i = 1; i < R.length; i++) cum.push(cum[i - 1] + Math.hypot(R[i].x - R[i - 1].x, R[i].z - R[i - 1].z));
    const lenR = cum[cum.length - 1];
    const opRoute = (s, v) => { s = klem(s, 0, lenR); let i = 1; while (i < R.length - 1 && cum[i] < s) i++; const a = R[i - 1], b = R[i], t = (s - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]); return v.set(a.x + (b.x - a.x) * t, 0, a.z + (b.z - a.z) * t); };
    const boog = (x, z) => {
      let best = 1e9, sb = 0;
      for (let i = 0; i < R.length - 1; i++) {
        const a = R[i], b = R[i + 1], dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1, t = klem(((x - a.x) * dx + (z - a.z) * dz) / l2), d = Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
        if (d < best) { best = d; sb = cum[i] + t * Math.sqrt(l2); }
      }
      return sb;
    };
    const loperPlek = (loper, v) => { v.copy(loper.root.position); if (loper.root.parent) { loper.root.parent.localToWorld(v); ctx.groep.worldToLocal(v); } return v; };
    let zij = 1, dir = 1, a0 = 0;
    const EIGEN = {
      dj: u => {  // vanuit het publiek naar de dj, de bloem erboven; schuift langzaam naar voren
        const k = glad(u, 0, 14);
        cp.set(L.DJ.x - sx * (5.6 - 1.6 * k), 1.75 + 0.1 * Math.sin(u * 0.4), L.DJ.z + zij * 0.4); cl.set(L.DJ.x + sx * 0.6, 2.7 + 0.6 * k, L.DJ.z); return 52 - 6 * k;
      },
      bloem: u => {  // laag naast de stronk, steil omhoog naar de bloem
        cp.set(L.DJ.x - sx * (2.9 + 0.3 * Math.sin(u * 0.2)), 0.9 + 0.03 * u, L.DJ.z + zij * 2.4); cl.set(L.F.x, L.F.y + 0.3, L.F.z); return 70;
      },
      poort: u => {  // net binnen de rotspoort, de jungle in kijken (het pad, de open plek, de bloem)
        cp.set(zij * 0.5, 1.8 + 0.02 * u, -Dk + 1.3 + Math.min(1.5, 0.06 * u)); cl.set(L.V.x * 0.45 + zij * 0.6 * Math.sin(u * 0.15), 2.4, -2); return 66;
      },
      waterval: u => { cp.set(L.VAL.x + sx * (8.2 - 0.06 * u), 1.5 + 0.03 * u, L.VAL.z - 4.6 + dir * 0.06 * u); cl.set(L.VAL.x, 4.2, L.VAL.z); return 58; },
      pad: (u, loper) => {  // laag op het pad vóór de loper, kijkt hem aan
        if (!loper || !loper.root) return EIGEN.kroon(u);
        loperPlek(loper, lp);
        const s = boog(lp.x, lp.z); opRoute(s + 3.4, t1); opRoute(s + 3.9, t2);
        const dx = t2.x - t1.x, dz = t2.z - t1.z, l = Math.hypot(dx, dz) || 1;
        cp.set(t1.x - dz / l * 0.5 * zij, 0.55, t1.z + dx / l * 0.5 * zij); cl.set(lp.x, 1.25, lp.z); return 64;
      },
      kroon: u => { const k = glad(u, 0, 16); cp.set(sx * (-1.2 + 0.8 * zij), 9.5 - 3.2 * k, -7.5 + 3.0 * k); cl.set(L.V.x, 0.6, L.V.z); return 60; },
      paddo: u => { const p = L.paddo[zij > 0 ? 0 : 1]; cp.set(p.x, 0.42, p.z); cl.set(L.V.x + 0.04 * u * dir, 3.2, L.V.z); return 76; },
      glow: u => {  // tussen de glowsticks, vanaf het vuur terug op de danser
        const gf = L.glow, dx = L.V.x - gf.x, dz = L.V.z - gf.z, l = Math.hypot(dx, dz) || 1, a = 0.35 * zij + dir * 0.012 * u;
        const ux = dx / l, uz = dz / l, ca = Math.cos(a), sa = Math.sin(a);
        cp.set(gf.x + (ux * ca - uz * sa) * 2.2, 1.55, gf.z + (ux * sa + uz * ca) * 2.2); cl.set(gf.x, 1.6, gf.z); return 50;
      },
      baan: u => {  // traag rond het kampvuur, boven de hoofden, buiten de draaiers en binnen de fakkels
        const a = a0 + dir * 0.1 * u;
        cp.set(L.V.x + Math.sin(a) * 5.4, 3.0 + 0.3 * Math.sin(u * 0.3), L.V.z + Math.cos(a) * 5.4); cl.set(L.V.x, 1.1, L.V.z); return 62;
      },
    };
    const LIJST = {
      groove: ['volg', 'volg', 'dj', 'held', 'drone', 'pad', 'waterval', 'paddo', 'glow', 'baan', 'kraan', 'vuur', 'bloem', 'toren', 'kroon', 'tegen', 'poort'],
      break: ['drone', 'kraan', 'waterval', 'kroon', 'baan', 'bloem', 'poort', 'pad', 'volg'],
      opbouw: ['held', 'vuur', 'dj', 'glow', 'pad', 'bloem', 'paddo', 'volg'],
      drop: ['held', 'glow', 'dj', 'baan', 'vuur', 'drone', 'bloem', 'kraan', 'paddo'],
    };
    const kan = s => (KIT[s] || EIGEN[s]) && (s !== 'glow' || !!L.glow);
    let blokNu = null, t0 = 0, shot = 'volg', standWas = null;
    const recent = [];
    function cam(t, loper) {
      const sh = doolhof.show || {}, st = sh.stand || 'groove';
      const per = st === 'break' ? 16 : st === 'drop' ? 4 : st === 'opbouw' ? ((sh.opbouw || 0) < 0.5 ? 8 : 4) : 8;
      const blok = Math.floor(Math.max(0, typeof beatPos === 'number' ? beatPos : 0) / per) + ':' + per;
      if (blok !== blokNu) {
        let keus;
        if (cam.forceer && kan(cam.forceer)) keus = cam.forceer;  // test: doolhof.actief.cam.zet('bloem')
        else if (blokNu === null) keus = 'volg';
        else if (st === 'drop' && standWas !== 'drop') keus = kies(r, ['bloem', 'bloem', 'drone']);  // de drop: de bloem schiet open
        else {
          const lijst = LIJST[st] || LIJST.groove;
          let kand = lijst.filter(s => kan(s) && !recent.includes(s));
          if (!kand.length) kand = lijst.filter(kan);
          keus = kies(r, kand);
        }
        shot = kan(keus) ? keus : 'volg';
        recent.push(shot); if (recent.length > 3) recent.shift();
        blokNu = blok; t0 = t; zij = r() < 0.5 ? -1 : 1; dir = r() < 0.5 ? -1 : 1; a0 = r() * TAU;
      }
      standWas = st;
      if (KIT[shot]) return KIT[shot](t, loper);
      uit.fov = EIGEN[shot](t - t0, loper);
      cp.x = klem(cp.x, -Wk - 1.5, Wk + 1.5); cp.z = klem(cp.z, -Dk + 0.6, Dk - 0.6); cp.y = klem(cp.y, 0.3, 16);
      ctx.groep.updateWorldMatrix(true, false); ctx.groep.localToWorld(cp); ctx.groep.localToWorld(cl);
      return uit;
    }
    cam.shot = () => shot;
    cam.zet = naam => { cam.forceer = naam || null; blokNu = ''; };  // naam = vast shot (null = weer vrij), knipt meteen
    cam.shots = () => Object.keys(KIT).concat(Object.keys(EIGEN)).filter(kan);
    return cam;
  }

  // =====================================================================================================================================
  // de kamer (generator: de kern bouwt hem in stappen, elke yield = pauzeplek)
  // =====================================================================================================================================
  let laatste = null;
  function* bouw(ctx) {
    const r = ctx.rnd, Z = ctx.zwaar | 0, g = ctx.groep, sx = r() < 0.5 ? -1 : 1, X = x => sx * x;
    const maat = { w: KW_, d: KD, h: 12 };
    const PAL = kies(r, PALETTEN).map(c => new THREE.Color(c)), PALH = PAL.map(c => c.getHex());
    const tel = { varens: 0, palmbladen: 0, zwammen: 0, lianen: 0, kroon: 0, bloemetjes: 0, figuren: 0, publiek: 0, sporen: 0 };
    const V = IND.V, DJ = IND.DJ, F = IND.F, VIJ = IND.VIJ, ST = IND.STOMP;

    // ---------- 1. hemel, rotspoort, lifttoren (de buitenwereld dicht) ----------
    const H = B.hemel(g, { soort: 'jungle', silhouet: 'jungle', verte: r() < 0.55 ? 'vulkaan' : 'bergen', vulkaanAz: sx * -0.55, maan: { az: sx * (1.9 + r() * 0.4), el: 0.42 + r() * 0.12 },
      aurora: 0.75, nevel: 0.7, sterren: 1, verreVuren: 0.5, grond: 'jungle', rnd: r, zwaar: Z });
    B.rotsPoort(g, maat, { hemel: H, rnd: r, zwaar: Z, deco: 'paddenstoelen', palet: PALH, mos: 1, ranken: 1, tekst: kies(r, ['JUNGLE', 'JUNGLE RAVE', 'WILDERNIS', 'URWALD', 'DEEP JUNGLE', 'BOSFEEST']) });
    B.liftToren(g, maat, { hemel: H, rnd: r, zwaar: Z, palet: PALH });
    const UJ = {
      uJA: f(PAL[0]), uJB: f(PAL[1]), uJC: f(PAL[2]), uHor: H.uniforms.uHor, uZen: H.uniforms.uZen,
      uVuurW: f(new THREE.Vector3()), uDjW: f(new THREE.Vector3()), uStomp: f(new THREE.Vector3()), uValW: f(new THREE.Vector3()),
      uDjK: f(new THREE.Color(PAL[0])), uDjI: f(0.4),
    };
    yield;

    // ---------- 2. indeling: wat staat waar (bezet = cirkels die planten mijden) ----------
    const bezet = [];
    const vrij = (x, z, marge, metRoute = true) => {
      if (Math.abs(x) > 15.8 || z < -18.4 || z > 18.8 || (Math.abs(x) < 8.5 && z > 18.2)) return false;
      if (metRoute && routeAfstand(x, z) < marge + 1.2) return false;
      if (inEllips(x, z, IND.OPEN, 1.05) || inEllips(x, z, VIJ, 1.12) || inKlif(x, z)) return false;
      for (const [cx, cz, cr] of IND.CAMVRIJ) if (Math.hypot(x - cx, z - cz) < cr + marge * 0.6) return false;
      for (const b of bezet) if (Math.hypot(x - b.x, z - b.z) < b.r + marge) return false;
      return true;
    };
    for (const [x, z, rr] of IND.BOMEN) bezet.push({ x, z, r: rr + 1.0 });
    const palmen = IND.PALMEN.slice(0, [12, 9, 6][Z]);
    for (const [x, z] of palmen) bezet.push({ x, z, r: 0.8 });
    for (const [x, z, s] of IND.REUS) bezet.push({ x, z, r: 0.5 * s + 0.4 });
    for (const p of IND.PIL) bezet.push({ x: p.x, z: p.z, r: 0.9 });
    bezet.push({ x: 13.6, z: 0.6, r: 1.2 });  // bloemsteel
    // paddo-camera: naast de grootste vliegenzwam, van het vuur af (twee kanten)
    const M0 = IND.REUS[0], ax = M0[0] - V.x, az = M0[1] - V.z, al = Math.hypot(ax, az), awx = ax / al, awz = az / al;
    const paddoPlek = [1, -1].map(k => ({ x: M0[0] + awx * 2.4 - awz * 1.2 * k, z: M0[1] + awz * 2.4 + awx * 1.2 * k }));
    for (const p of paddoPlek) bezet.push({ x: p.x, z: p.z, r: 1.3 });
    // fakkels: langs het pad (om en om, 1,7 m ernaast) en zes rond de open plek
    const fakkelB = [];
    {
      const cum = [0]; for (let i = 1; i < ROUTE.length; i++) cum.push(cum[i - 1] + Math.hypot(ROUTE[i].x - ROUTE[i - 1].x, ROUTE[i].z - ROUTE[i - 1].z));
      let kant = 1, nPad = 0;
      for (let s = 4; s < cum[cum.length - 1] - 3 && nPad < [9, 6, 4][Z]; s += 6.2) {
        let i = 1; while (i < ROUTE.length - 1 && cum[i] < s) i++;
        const a = ROUTE[i - 1], b = ROUTE[i], t = (s - cum[i - 1]) / (cum[i] - cum[i - 1]), dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz);
        const x = a.x + dx * t - dz / l * 1.7 * kant, z = a.z + dz * t + dx / l * 1.7 * kant;
        kant = -kant;
        if (inEllips(x, z, IND.OPEN, 1.0) || inEllips(x, z, VIJ, 1.1) || Math.hypot(x - IND.WACHT.x, z - IND.WACHT.z) < 3.4) continue;
        fakkelB.push({ x, z }); bezet.push({ x, z, r: 0.5 }); nPad++;
      }
    }
    const openF = [];
    for (const a of [30, 80, 130, 230, 280, 330]) {
      const ar = a * Math.PI / 180, x = IND.OPEN.x + IND.OPEN.rx * 1.02 * Math.cos(ar), z = IND.OPEN.z + IND.OPEN.rz * 1.02 * Math.sin(ar);
      openF.push(fakkelB.length); fakkelB.push({ x, z }); bezet.push({ x, z, r: 0.5 });
    }
    // figuren op de open plek (basis): draaiers op een ring om het vuur, ledpoi en glowsticks in het publiek
    const ring = (a, rr = 3.2) => ({ x: V.x + rr * Math.cos(a * Math.PI / 180), z: V.z + rr * Math.sin(a * Math.PI / 180) });
    const FIG = [
      Object.assign(ring(155), { soort: 'vuur' }), Object.assign(ring(90), { soort: 'spuwer', kijk: { x: -1, z: -0.25 } }), { x: 8.0, z: -3.4, soort: 'led', naarDj: true },
      Object.assign(ring(235), { soort: 'staf' }), { x: 5.6, z: -4.2, glow: true }, Object.assign(ring(320), { soort: 'vuur' }), { x: 7.4, z: 4.6, glow: true },
      Object.assign(ring(30), { soort: 'hoepel' }), { x: 3.4, z: 7.0, soort: 'led' }, { x: 8.6, z: -0.6, glow: true },
    ];
    for (const p of FIG) bezet.push({ x: p.x, z: p.z, r: p.soort ? 1.5 : 1.0 });
    // publiek rond het vijvertje (silhouetten tegen de waterval) en op de open plek
    const vijverVolkB = [];
    for (let i = 0; i < 60 && vijverVolkB.length < [12, 8, 0][Z]; i++) {
      const a = (65 + r() * 50) * Math.PI / 180, rr = 4.9 + r() * 1.1, x = VIJ.x + rr * Math.cos(a), z = VIJ.z + rr * Math.sin(a);
      if (routeAfstand(x, z) < 2.2 || vijverVolkB.some(p => Math.hypot(p.x - x, p.z - z) < 0.7)) continue;
      vijverVolkB.push({ x, z });
    }
    for (const p of vijverVolkB) bezet.push({ x: p.x, z: p.z, r: 0.45 });
    yield;

    // ---------- 3. varens en palmbladen ----------
    const bladen = [];  // { x, y, z, ry, L, b, e0, k, hue, fase, palm, kom } (basis)
    const nVaren = [66, 44, 24][Z], nPer = [7, 6, 5][Z];
    let pogingen = 0, varens = 0;
    while (varens < nVaren && pogingen++ < nVaren * 45) {
      const reus = r() < 0.28, L = reus ? tussen(r, 1.8, 2.8) : tussen(r, 0.6, 1.6);
      const x = tussen(r, -15.6, 15.6), z = tussen(r, -18.2, 18.6);
      if (!vrij(x, z, 0.75 * L)) continue;
      bezet.push({ x, z, r: 0.55 * L }); varens++;
      if (varens === nVaren >> 1) yield;  // het zoeken naar plekken in twee stukken
      const hue = r(), a0 = r() * TAU;
      for (let k = 0; k < nPer; k++) bladen.push({ x, y: 0, z, ry: a0 + k / nPer * TAU + (r() - 0.5) * 0.4, L: L * tussen(r, 0.8, 1.1), b: 0.16 + 0.1 * L, e0: tussen(r, 1.0, 1.35), k: tussen(r, 1.9, 2.8), hue, fase: r() * 6.3, palm: 0, kom: 0.22 });
    }
    tel.varens = varens;
    // palmkronen (de stammen komen in de vaste mesh)
    const kronen = palmen.map(([x, z, h]) => {
      const l = Math.hypot(x, z) || 1, lean = tussen(r, 0.5, 1.4), lx = -x / l * lean + (r() - 0.5) * 0.4, lz = -z / l * lean * 0.5 + (r() - 0.5) * 0.4;
      return { x, z, h, lx, lz, top: { x: x + lx, y: h, z: z + lz }, hue: r() };
    });
    const nPalm = [9, 7, 6][Z];
    for (const k of kronen) {
      const a0 = r() * TAU;
      for (let i = 0; i < nPalm; i++) bladen.push({ x: k.top.x, y: k.top.y, z: k.top.z, ry: a0 + i / nPalm * TAU + (r() - 0.5) * 0.3, L: tussen(r, 2.8, 4.0), b: tussen(r, 0.5, 0.65),
        e0: i % 3 === 0 ? tussen(r, 0.8, 1.0) : tussen(r, 0.3, 0.6), k: tussen(r, 1.6, 2.3), hue: k.hue, fase: r() * 6.3, palm: 1, kom: 0.55 });
    }
    // twee grote bladen aan de voet van de bloemsteel
    for (let i = 0; i < 3; i++) bladen.push({ x: 13.5, y: 0.1, z: 0.6, ry: -Math.PI / 2 + (i - 1) * 0.9, L: tussen(r, 2.0, 2.6), b: 0.6, e0: 0.9, k: 1.8, hue: 0.3, fase: r() * 6.3, palm: 1, kom: 0.5 });
    // hangende varens op de rand van de rotsboog (niet boven de waterval)
    const K = klif(r);
    for (const t of K.top) {
      if (Math.abs(t.a - Math.PI) < 0.3 || r() < 0.4 || t.y < 3) continue;
      const ry = Math.atan2(VIJ.x - t.x, VIJ.z - t.z);
      bladen.push({ x: t.x, y: t.y + 0.1, z: t.z, ry, L: tussen(r, 2.0, 3.0), b: 0.5, e0: 0.35, k: 2.4, hue: r(), fase: r() * 6.3, palm: 0, kom: 0.3 });
    }
    tel.palmbladen = bladen.filter(b => b.palm).length;
    {
      const n = bladen.length, geo = kloon(VAREN_GEO), iV = new Float32Array(n * 4), iW = new Float32Array(n * 4);
      const m = new THREE.InstancedMesh(geo, mat(VAREN_VS, VAREN_FS, UJ, { side: THREE.DoubleSide }), n);
      bladen.forEach((p, i) => {
        m.setMatrixAt(i, M4.compose(PV.set(X(p.x), p.y, p.z), Q.setFromEuler(E.set(0, sx < 0 ? -p.ry : p.ry, 0)), EEN));
        iV.set([p.L, p.b, p.e0, p.k], i * 4); iW.set([p.hue, p.fase, p.palm, p.kom], i * 4);
      });
      geo.setAttribute('iV', new THREE.InstancedBufferAttribute(iV, 4)); geo.setAttribute('iW', new THREE.InstancedBufferAttribute(iW, 4));
      m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; m.name = 'jungle-bladen'; geenStraal(m); g.add(m);
    }
    yield;

    // ---------- 4. paddenstoelen (reuzen + groepjes) en hun sporen ----------
    const zwammen = IND.REUS.map(([x, z, s, ps]) => ({ x, z, s, ps, hue: r(), fase: r() * 6.3, reus: 1 }));
    let groepjes = 0; pogingen = 0;
    while (groepjes < [16, 11, 7][Z] && pogingen++ < 400) {
      const x = tussen(r, -15.4, 15.4), z = tussen(r, -18, 18.4);
      if (!vrij(x, z, 0.25)) continue;
      groepjes++; bezet.push({ x, z, r: 0.7 });
      const ps = r() < 0.45 ? 1 : 0, hue = r(), n = 3 + Math.floor(r() * 4);
      for (let i = 0; i < n; i++) zwammen.push({ x: x + (r() - 0.5) * 1.1, z: z + (r() - 0.5) * 1.1, s: tussen(r, 0.25, i === 0 ? 0.95 : 0.6), ps: r() < 0.8 ? ps : 1 - ps, hue: hue + (r() - 0.5) * 0.2, fase: r() * 6.3, reus: 0 });
    }
    tel.zwammen = zwammen.length;
    {
      const n = zwammen.length, geo = kloon(ZWAM_GEO), iZ = new Float32Array(n * 4);
      const m = new THREE.InstancedMesh(geo, mat(ZWAM_VS, ZWAM_FS, UJ), n);
      zwammen.forEach((p, i) => {
        m.setMatrixAt(i, M4.compose(PV.set(X(p.x), 0, p.z), Q.setFromEuler(E.set((r() - 0.5) * 0.12, r() * TAU, (r() - 0.5) * 0.12)), SV.setScalar(p.s)));
        iZ.set([p.hue, p.ps, p.fase, p.reus], i * 4);
      });
      geo.setAttribute('iZ', new THREE.InstancedBufferAttribute(iZ, 4));
      m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; m.name = 'jungle-zwammen'; g.add(m);
      // sporen: uit de hoeden van de reuzen en de grootste in elk groepje
      const bron = zwammen.filter(p => p.reus || p.s > 0.6), per = p => p.reus ? [26, 16, 8][Z] : [10, 6, 0][Z];
      const ns = bron.reduce((a, p) => a + per(p), 0);
      if (ns > 0) {
        const pos = new Float32Array(ns * 3), aR = new Float32Array(ns * 3);
        let k = 0;
        for (const p of bron) for (let i = 0; i < per(p); i++, k++) { pos.set([X(p.x), (p.ps ? 1.55 : 1.36) * p.s, p.z], k * 3); aR.set([r(), r(), r()], k * 3); }
        const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); sg.setAttribute('aR', new THREE.BufferAttribute(aR, 3));
        const sp = geenStraal(new THREE.Points(sg, addMat(SPOOR_VS, PUNT_FS, UJ))); sp.frustumCulled = false; sp.renderOrder = 5; sp.name = 'jungle-sporen'; g.add(sp);
        tel.sporen = ns;
      }
    }
    yield;

    // ---------- 5. alles wat vast staat: bomen + takken, palmstammen, stronk, ruïne, altaar, klif, stenen, bloemsteel (één mesh) ----------
    const delen = [], takken = [];
    for (const [x, z, rr] of IND.BOMEN) {
      const H0 = 22, S = stam(x, z, rr, H0, r);
      delen.push(naarDeel(S.geo, 0));
      if (Math.abs(x) > 16) continue;  // de boom achter de bloem: geen takken over de bloem
      for (let k = 0; k < (Z === 2 ? 1 : 2); k++) {
        const y = tussen(r, 8, 10.5), t = y / H0, a = new THREE.Vector3(x + S.bx * t * t, y, z + S.bz * t * t);
        const d = new THREE.Vector3(-Math.sign(x), tussen(r, 0.12, 0.3), (r() - 0.5) * 0.7).normalize(), len = tussen(r, 4.5, 6.5);
        delen.push(naarDeel(tak(a, d, len, rr * 0.22), 0));
        takken.push({ a, d, len });
      }
    }
    yield;
    for (const k of kronen) delen.push(naarDeel(palmStam(k.x, k.z, k.h, k.lx, k.lz), 1));
    // stronk (bovenkant = jaarringen) + wortels
    delen.push(naarDeel(new THREE.CylinderGeometry(1.75, 2.05, ST.h, 28, 2, false).translate(ST.x, ST.h / 2, ST.z), (i, gg) => gg.attributes.normal.getY(i) > 0.9 && gg.attributes.position.getY(i) > ST.h - 0.05 ? 2 : 0));
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * TAU + r() * 0.4;
      const w = new THREE.BoxGeometry(0.42, 0.5, 1.1).rotateX(0.28).translate(0, 0.1, 0.55).rotateY(a).translate(ST.x + Math.sin(a) * 1.6, 0, ST.z + Math.cos(a) * 1.6);
      delen.push(naarDeel(w, 0));
    }
    // ruïne: twee pilaren met een vuurschaal, brokstukken, en het runenaltaar waar de dj achter staat
    for (const p of IND.PIL) {
      delen.push(naarDeel(new THREE.BoxGeometry(0.8, p.h, 0.8, 1, 4, 1).translate(0, p.h / 2, 0).rotateZ(p.kant).translate(p.x, 0, p.z), 4));
      delen.push(naarDeel(new THREE.CylinderGeometry(0.42, 0.26, 0.3, 12, 1, false).translate(p.x - Math.sin(p.kant) * p.h, p.h * Math.cos(p.kant) + 0.12, p.z), 4));
      delen.push(naarDeel(blok(0.85, 0.35, 0.85, p.x + tussen(r, -1.2, -0.7), 0.17, p.z + tussen(r, -0.6, 0.6), r() * 3, 0.15), 4));
    }
    delen.push(naarDeel(new THREE.BoxGeometry(0.62, 0.95, 1.9).translate(IND.ALTAAR.x, ST.h + 0.475, IND.ALTAAR.z), 4));
    yield;
    // rotsboog met de waterval-inkeping; stenen langs de vijver en losse keien
    delen.push(naarDeel(K.geo, 3));
    for (let i = 0; i < [18, 12, 7][Z]; i++) {
      const a = r() * TAU;
      if (Math.abs(Math.atan2(Math.sin(a - Math.PI), Math.cos(a - Math.PI))) < 0.5) continue;  // niet onder de waterval
      const x = VIJ.x + VIJ.rx * 1.05 * Math.cos(a), z = VIJ.z + VIJ.rz * 1.05 * Math.sin(a), s = tussen(r, 0.18, 0.42);
      if (routeAfstand(x, z) < 0.6) continue;
      delen.push(naarDeel(steen(x, s * 0.3, z, s * 1.3, s * 0.8, s, r() * 6.3, r), 3));
    }
    let keien = 0; pogingen = 0;
    const keiB = [];
    while (keien < [8, 5, 3][Z] && pogingen++ < 200) {
      const x = tussen(r, -15, 15), z = tussen(r, -17, 18), s = tussen(r, 0.6, 1.4);
      if (!vrij(x, z, s * 0.9)) continue;
      bezet.push({ x, z, r: s }); keien++; keiB.push({ x, z, s });
      delen.push(naarDeel(steen(x, s * 0.35, z, s * 1.2, s * 0.85, s, r() * 6.3, r), 3));
    }
    yield;
    // bloemsteel
    const kromme = new THREE.CatmullRomCurve3([new THREE.Vector3(13.5, -0.2, 0.6), new THREE.Vector3(13.9, 2.4, 0.15), new THREE.Vector3(13.35, 4.9, 0.9), new THREE.Vector3(F.x + 0.25, F.y - 0.2, F.z)]);
    const lenS = kromme.getLength();
    delen.push(naarDeel(new THREE.TubeGeometry(kromme, 28, 0.17, 8, false), 5, (i, gg) => gg.attributes.uv.getX(i) * lenS));
    const vast = samenvoegen(delen);
    if (sx < 0) spiegel(vast);
    vast.computeBoundingSphere();
    yield;
    const vastMesh = geenStraal(new THREE.Mesh(vast, mat(STAT_VS, STAT_FS, UJ)));
    vastMesh.name = 'jungle-vast'; g.add(vastMesh);
    // botsing voor de stralen van moshpit/camera: grove onzichtbare vormen (laag 31: wordt nooit getekend) i.p.v. ~10k driehoeken per straal
    {
      const cyl = (x, z, r0, h) => new THREE.CylinderGeometry(r0, r0, h, 8, 1, false).translate(x, h / 2, z), bots = [];
      for (const [x, z, rr] of IND.BOMEN) bots.push(cyl(x, z, rr * 1.25, 6));
      for (const k of kronen) bots.push(cyl(k.x, k.z, 0.3, 4));
      bots.push(cyl(ST.x, ST.z, 2.05, ST.h + 0.95));
      for (const p of IND.PIL) bots.push(new THREE.BoxGeometry(0.85, p.h, 0.85).translate(p.x, p.h / 2, p.z));
      K.top.forEach((t, i) => { if (i % 2 === 0 && t.y > 1) bots.push(cyl(t.x, t.z, 1.5, 3)); });
      for (const k of keiB) bots.push(cyl(k.x, k.z, k.s, k.s));
      const bg = samenvoegen(bots);
      if (sx < 0) spiegel(bg);
      bg.computeBoundingSphere();
      const bm = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
      bm.layers.set(31); bm.name = 'jungle-botsing'; g.add(bm);
    }
    yield;

    // ---------- 6. bladerdak en lianen ----------
    const klonten = [];
    for (const [x, z] of IND.BOMEN) {
      for (let k = 0; k < [3, 2, 1][Z]; k++) {
        const kx = Math.sign(x) * Math.max(11, Math.abs(x) + (r() - 0.3) * 3), kz = z + (r() - 0.5) * 6, R = tussen(r, 3.0, 4.8);
        klonten.push({ x: kx, y: tussen(r, 14.5, 18), z: kz, sx: R * tussen(r, 1.0, 1.4), sy: R * 0.75, sz: R * tussen(r, 1.0, 1.3), hue: r(), fase: r() * 6.3 });
      }
    }
    for (const z of [5.8, 11.0]) klonten.push({ x: -15.5, y: tussen(r, 13.5, 15.5), z, sx: 4.5, sy: 3, sz: 4, hue: r(), fase: r() * 6.3 });  // boven de rotsboog
    if (Z < 2) for (const [x, z] of [[-13, -12], [13.5, -10], [12.5, 12.5], [-13.5, 13.5]]) klonten.push({ x, y: tussen(r, 15, 18), z, sx: 4.5, sy: 3.2, sz: 4.5, hue: r(), fase: r() * 6.3 });
    tel.kroon = klonten.length;
    {
      const n = klonten.length, geo = kloon(KROON_GEO), iK = new Float32Array(n * 2);
      const m = new THREE.InstancedMesh(geo, mat(KROON_VS, KROON_FS, UJ), n);
      klonten.forEach((p, i) => { m.setMatrixAt(i, M4.compose(PV.set(X(p.x), p.y, p.z), Q.setFromEuler(E.set(0, r() * TAU, 0)), SV.set(p.sx, p.sy, p.sz))); iK.set([p.hue, p.fase], i * 2); });
      geo.setAttribute('iK', new THREE.InstancedBufferAttribute(iK, 2));
      m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; m.name = 'jungle-kroon'; geenStraal(m); g.add(m);
    }
    const lianen = [], maxL = [72, 46, 24][Z];
    const hang = (x, y, z) => {  // liaan vanaf (x, y, z): boven het pad blijft de onderkant op 2,8 m (loper en camera)
      if (lianen.length >= maxL) return;
      const onder = routeAfstand(x, z) < 2.6 || inEllips(x, z, IND.OPEN, 1.0) ? 2.8 : 1.2, len = Math.min(tussen(r, 3, 8), y - onder);
      if (len < 1) return;
      lianen.push({ x, y, z, len, fase: r() * 6.3, hue: r(), dik: tussen(r, 0.1, 0.16), sterk: tussen(r, 0.6, 1.1) });
    };
    for (const t of takken) for (let k = 0; k < 5; k++) { const u = tussen(r, 0.35, 1.0); hang(t.a.x + t.d.x * t.len * u, t.a.y + t.d.y * t.len * u - 0.25, t.a.z + t.d.z * t.len * u); }
    for (const k of klonten) for (let i = 0; i < 3; i++) hang(k.x + (r() - 0.5) * k.sx, k.y - k.sy * 0.55, k.z + (r() - 0.5) * k.sz);
    tel.lianen = lianen.length;
    if (lianen.length) {
      const n = lianen.length, iL = new Float32Array(n * 4), iM = new Float32Array(n * 4);
      lianen.forEach((p, i) => { iL.set([X(p.x), p.y, p.z, p.len], i * 4); iM.set([p.fase, p.hue, p.dik, p.sterk], i * 4); });
      const m = geenStraal(new THREE.Mesh(quadGeo(n, { iL: [iL, 4], iM: [iM, 4] }, LIAAN_GEO), addMat(LIAAN_VS, LIAAN_FS, UJ, { side: THREE.DoubleSide })));
      m.frustumCulled = false; m.renderOrder = 4; m.name = 'jungle-lianen'; g.add(m);
    }
    yield;

    // ---------- 7. waterval, vijver, mist, reuzenbloem, kring, bloemetjes ----------
    const lip = K.lip, val = geenStraal(new THREE.Mesh(watervalGeo(lip, sx), addMat(VAL_VS, VAL_FS, UJ, { side: THREE.DoubleSide })));
    val.renderOrder = 4; val.name = 'jungle-waterval'; g.add(val);
    const voet = { x: lip.x + 1.6, z: lip.z };
    const vijver = new THREE.Mesh(new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2), mat(VIJVER_VS, VIJVER_FS, UJ));
    vijver.position.set(X(VIJ.x), 0.035, VIJ.z); vijver.scale.set(VIJ.rx, 1, VIJ.rz); vijver.name = 'jungle-vijver'; geenStraal(vijver); g.add(vijver);
    {
      const NV = [];
      const lagen = [[0.28, 7.0], [0.8, 7.5], [1.5, 8.0]].slice(0, [3, 2, 1][Z]);
      for (const [y, s] of lagen) for (let x = -11; x <= 11; x += 11) for (let z = -15; z <= 15; z += 10) NV.push(X(x + (r() - 0.5) * 3), y + r() * 0.15, z + (r() - 0.5) * 3, s);
      NV.push(X(VIJ.x), 0.4, VIJ.z, 5.5); if (Z < 2) NV.push(X(VIJ.x - 2), 1.1, VIJ.z, 5);
      const m = geenStraal(new THREE.Mesh(quadGeo(NV.length / 4, { iN: [new Float32Array(NV), 4] }), addMat(NEVEL_VS, NEVEL_FS, UJ, { side: THREE.DoubleSide })));
      m.frustumCulled = false; m.renderOrder = 6; m.name = 'jungle-mist'; g.add(m);
    }
    // reuzenbloem: as naar de open plek (iets omlaag)
    const as = new THREE.Vector3(-sx, -0.18, 0).normalize(), e1 = new THREE.Vector3(0, 1, 0).addScaledVector(as, -as.y).normalize(), e2 = new THREE.Vector3().crossVectors(as, e1);
    const UB = { uOpen: f(0.5), uDraai: f(0), uC: f(new THREE.Vector3(X(F.x), F.y, F.z)), uAs: f(as), uE1: f(e1), uE2: f(e2) };
    {
      const KR = [[12, 3.4, 0.78], [9, 2.4, 0.6], [7, 1.5, 0.42]], iB = [];
      KR.forEach(([n, L, w], ring) => { for (let i = 0; i < n; i++) iB.push(ring, (i + ring * 0.5) / n * TAU, L * tussen(r, 0.92, 1.08), w); });
      const bm = new THREE.Mesh(quadGeo(iB.length / 4, { iB: [new Float32Array(iB), 4] }, BLAD_GEO), mat(BLAD_VS, BLAD_FS, Object.assign({}, UJ, UB), { side: THREE.DoubleSide }));
      bm.frustumCulled = false; bm.name = 'jungle-bloem'; geenStraal(bm); g.add(bm);
      const hart = new THREE.Mesh(new THREE.CircleGeometry(1.05, 48), mat(HART_VS, HART_FS, Object.assign({}, UJ, UB), { side: THREE.DoubleSide }));
      hart.position.copy(UB.uC.value).addScaledVector(as, 0.3); hart.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), as); hart.name = 'jungle-bloemhart'; geenStraal(hart); g.add(hart);
    }
    {
      const kring = new THREE.Mesh(new THREE.CircleGeometry(1, 72).rotateX(-Math.PI / 2), addMat(KRING_VS, KRING_FS, UJ));
      kring.position.set(X(IND.OPEN.x), 0.04, IND.OPEN.z); kring.scale.set(IND.OPEN.rx * 1.06, 1, IND.OPEN.rz * 1.06); kring.renderOrder = 3; kring.name = 'jungle-kring'; geenStraal(kring); g.add(kring);
    }
    {
      const bl = [], nb = [60, 40, 20][Z];
      for (let s = 2.5, kant = 1; s < 50 && bl.length < nb * 0.7; s += tussen(r, 0.9, 1.8), kant = -kant) {
        const ri = Math.min(ROUTE.length - 2, Math.floor(s / 4.6)), a = ROUTE[ri], b = ROUTE[ri + 1], t = r(), dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1, o = tussen(r, 1.0, 1.6) * kant;
        const x = a.x + dx * t - dz / l * o, z = a.z + dz * t + dx / l * o;
        if (inEllips(x, z, VIJ, 1.02) || inEllips(x, z, IND.OPEN, 0.95) || routeAfstand(x, z) < 0.9) continue;
        bl.push({ x, y: tussen(r, 0.25, 0.75), z, s: tussen(r, 0.12, 0.22) });
      }
      for (let i = 0; i < nb * 0.4 && bl.length < nb; i++) {  // rond de vijver
        const a = r() * TAU;
        if (Math.abs(Math.atan2(Math.sin(a - Math.PI), Math.cos(a - Math.PI))) < 0.6) continue;
        const x = VIJ.x + VIJ.rx * tussen(r, 1.08, 1.25) * Math.cos(a), z = VIJ.z + VIJ.rz * tussen(r, 1.08, 1.25) * Math.sin(a);
        if (routeAfstand(x, z) < 0.9) continue;
        bl.push({ x, y: tussen(r, 0.2, 0.6), z, s: tussen(r, 0.12, 0.2) });
      }
      tel.bloemetjes = bl.length;
      if (bl.length) {
        const iF = new Float32Array(bl.length * 4), iG = new Float32Array(bl.length * 4);
        bl.forEach((p, i) => { iF.set([X(p.x), p.y, p.z, p.s], i * 4); iG.set([r(), r(), 0, 0], i * 4); });
        const m = geenStraal(new THREE.Mesh(quadGeo(bl.length, { iF: [iF, 4], iG: [iG, 4] }), addMat(BLOEMPJE_VS, BLOEMPJE_FS, UJ)));
        m.frustumCulled = false; m.renderOrder = 5; m.name = 'jungle-bloemetjes'; g.add(m);
      }
    }
    yield;

    // ---------- 8. vuur, fakkels, pad, slingers, gloed; lampen ----------
    const Vm = { x: X(V.x), z: V.z }, DJm = { x: X(DJ.x), z: DJ.z };
    const lampV = ctx.licht(0xff7a2a, 2.6, 18, Vm.x, 2.0, Vm.z), lampDj = ctx.licht(PAL[0].getHex(), 1.6, 13, X(10.2), 3.4, DJ.z);
    B.kampvuur(g, Vm, { s: 2.2, lamp: lampV, rnd: r, zwaar: Z });
    for (const p of IND.PIL) B.vuur(g, [{ x: X(p.x - Math.sin(p.kant) * p.h), y: p.h * Math.cos(p.kant) + 0.25, z: p.z, s: 0.8, h: 1.3 }], { kleur: 'show', vlammen: 20, vonken: 10, rnd: r, zwaar: Z });
    const fk = B.fakkels(g, fakkelB.map(p => ({ x: X(p.x), z: p.z })), { rnd: r, zwaar: Z });
    const Lr = ROUTE.map(p => ({ x: X(p.x), z: p.z }));
    B.gloeiPad(g, Lr, { rnd: r, zwaar: Z, palet: PALH, breed: 0.95, afstand: 0.85 });
    if (fk && fk.toppen) {
      const T = i => { const t = fk.toppen[i]; return t ? { x: t.x, y: t.y + 0.35, z: t.z } : null; };
      const boven = openF.slice(0, 3).map(T).filter(Boolean), onder = openF.slice(3).map(T).filter(Boolean);
      const pil = IND.PIL.map(p => ({ x: X(p.x - Math.sin(p.kant) * p.h), y: p.h + 0.2, z: p.z }));
      B.lichtslingers(g, [boven, onder, [pil[0], onder[onder.length - 1]].filter(Boolean), [pil[1], boven[0]].filter(Boolean)].filter(l => l.length > 1), { kleur: 'neon', zak: 0.45 });
    }
    B.gloed(g, [{ x: X(voet.x), y: 0.06, z: voet.z, r: 2.6, kleur: 0x30e0ff }, { x: X(IND.ALTAAR.x - 0.05), y: ST.h + 0.97, z: DJ.z - 0.45, r: 0.3, kleur: PAL[1] },
      { x: X(IND.ALTAAR.x - 0.05), y: ST.h + 0.97, z: DJ.z + 0.45, r: 0.3, kleur: PAL[2] }], { plat: true, sterk: 0.75 });
    B.gloed(g, [{ x: X(F.x + 0.5), y: F.y, z: F.z, r: 6, kleur: PAL[0] }], { plat: false, sterk: 0.16 });
    const LED = doolhof.led;
    if (LED && LED.strips) {
      const ax = X(IND.ALTAAR.x - 0.32), y = ST.h + 0.96, z0 = DJ.z - 0.95, z1 = DJ.z + 0.95;
      const k = LED.strips([[ax, y, z0, ax, y, z1], [ax, ST.h + 0.04, z0, ax, ST.h + 0.04, z1], [ax, ST.h + 0.04, z0, ax, y, z0], [ax, ST.h + 0.04, z1, ax, y, z1]],
        { palet: { a: PAL[0], b: PAL[1], c: PAL[2], donker: 0x020104 }, zaad: Math.floor(r() * 997), helder: 1, dik: 0.05, diep: 0.05 });
      geenStraal(k); g.add(k);
    }
    yield;

    // ---------- 9. figuren: dj op de stronk, draaiers (één poi-draw), glowstick-dansers; de kern geeft er 10/6/5 ----------
    const podium = new THREE.Group(); podium.position.y = ST.h; podium.name = 'jungle-podium'; g.add(podium);
    const naar = (p, q) => Math.atan2(q.x - p.x, q.z - p.z);
    const dj = ctx.figuur({ x: DJm.x, z: DJm.z, face: naar(DJm, Vm), rol: 'dj' });
    if (dj) { podium.add(dj.root); tel.figuren++; }
    const draaiers = [], glows = [];
    for (const p of FIG) {
      const pm = { x: X(p.x), z: p.z };
      const face = p.kijk ? Math.atan2(sx * p.kijk.x, p.kijk.z) : p.glow || p.naarDj ? naar(pm, DJm) : naar(pm, Vm);
      const d = ctx.figuur({ x: pm.x, z: pm.z, face, rol: 'dans' });
      if (!d) continue;
      tel.figuren++;
      if (p.glow) { delete d.poiSoort; glows.push(d); } else { d.poiSoort = p.soort; draaiers.push(d); }
    }
    if (draaiers.length) B.poi(g, draaiers, { zwaar: Z });
    if (glows.length) B.glowsticks(g, glows, { handen: 'beide', rnd: r });
    yield;

    // ---------- 10. publiek (glowsticks), vuurvliegjes, sporen in de lucht ----------
    let publiek = null, vijverVolk = null;
    if (window.clubPubliek && clubPubliek.maak) {
      const pl = [], O = IND.OPEN;
      for (let x = O.x - O.rx; x <= O.x + O.rx; x += 0.72) for (let z = O.z - O.rz; z <= O.z + O.rz; z += 0.72) {
        const px = x + (r() - 0.5) * 0.3, pz = z + (r() - 0.5) * 0.3;
        if (!inEllips(px, pz, O, 0.97) || Math.hypot(px - V.x, pz - V.z) < 4.4 || Math.hypot(px - ST.x, pz - ST.z) < 2.8) continue;
        if (IND.CAMVRIJ.slice(0, 4).some(([cx, cz]) => Math.hypot(px - cx, pz - cz) < 1.0)) continue;  // kraanzuilen
        if (routeAfstand(px, pz) < 2.0 || Math.hypot(px - IND.WACHT.x, pz - IND.WACHT.z) < 3.0) continue;
        if (FIG.some(p => Math.hypot(px - p.x, pz - p.z) < (p.soort ? 1.6 : 1.0)) || IND.PIL.some(p => Math.hypot(px - p.x, pz - p.z) < 1.0)) continue;
        if (fakkelB.some(p => Math.hypot(px - p.x, pz - p.z) < 0.6)) continue;
        if (Math.hypot(px - (DJ.x - 2.9), pz - (DJ.z + 2.4)) < 1.2 || Math.hypot(px - (DJ.x - 2.9), pz - (DJ.z - 2.4)) < 1.2) continue;  // bloem-camera
        pl.push({ x: px, z: pz });
      }
      for (let i = pl.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)), t = pl[i]; pl[i] = pl[j]; pl[j] = t; }
      pl.length = Math.min(pl.length, [110, 70, 40][Z]);
      const plekken = pl.map(p => {
        const m = { x: X(p.x), z: p.z }, bijVuur = Math.hypot(p.x - V.x, p.z - V.z) < 6 && p.x < V.x;
        return { x: m.x, z: m.z, face: (bijVuur ? naar(m, Vm) : naar(m, DJm)) + (r() - 0.5) * 0.5 };
      });
      if (plekken.length) publiek = clubPubliek.maak(g, { plekken, vast: true, rnd: r, telefoons: 0.04, glowsticks: 0.6,
        licht: { x: Vm.x, y: 1.4, z: Vm.z }, kleuren: { a: new THREE.Color(0xff7a2a), b: PAL[1], vul: new THREE.Color(0x000000) } });
      if (vijverVolkB.length) {
        const vm = { x: X(lip.x), z: lip.z };
        vijverVolk = clubPubliek.maak(g, { plekken: vijverVolkB.map(p => { const m = { x: X(p.x), z: p.z }; return { x: m.x, z: m.z, face: naar(m, vm) + (r() - 0.5) * 0.4 }; }), vast: true, rnd: r,
          telefoons: 0.1, glowsticks: 0.8, licht: { x: vm.x, y: 3, z: vm.z }, kleuren: { a: new THREE.Color(0x30e0ff), b: PAL[0], vul: new THREE.Color(0x000000) } });
      }
      tel.publiek = (publiek ? publiek.n : 0) + (vijverVolk ? vijverVolk.n : 0);
      // stralen (moshpit): het instanced publiek kost ~3 ms per straal (elke pop raakt de gedeelde bol); daarom onzichtbare paaltjes
      // op laag 31 als botsing en het publiek zelf doorzichtig voor stralen
      const palen = [];
      for (const H2 of [publiek, vijverVolk]) if (H2) { geenStraal(H2.mesh); for (const p of H2.plekken) palen.push(new THREE.CylinderGeometry(0.24, 0.24, 1.7, 6, 1, true).translate(p.x, 0.85, p.z)); }
      if (palen.length) {
        const pg = samenvoegen(palen); pg.computeBoundingSphere();
        const pm = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
        pm.layers.set(31); pm.name = 'jungle-botsing-publiek'; g.add(pm);
      }
    }
    yield;
    B.vuurvliegjes(g, { gebied: { w: KW_ + 6, d: KD - 1, y0: 0.3, y1: 4.5 }, aantal: 300, kleur: 'geel', rnd: r, zwaar: Z });
    B.vuurvliegjes(g, { soort: 'sporen', gebied: { x0: -16, x1: 16, z0: -19, z1: 19, y0: 0, y1: 10 }, aantal: 170, kleur: 'show', rnd: r, zwaar: Z });

    // ---------- 11. wereldposities voor de shaders, camera, kamer ----------
    const VUUR_L = new THREE.Vector3(Vm.x, 1.1, Vm.z), DJ_L = new THREE.Vector3(X(10.2), 3.4, DJ.z), STOMP_L = new THREE.Vector3(X(ST.x), ST.h, ST.z), VAL_L = new THREE.Vector3(X(voet.x), 0, voet.z);
    const wereld = () => {
      const m = g.matrixWorld;
      UJ.uVuurW.value.copy(VUUR_L).applyMatrix4(m); UJ.uDjW.value.copy(DJ_L).applyMatrix4(m);
      UJ.uStomp.value.copy(STOMP_L).applyMatrix4(m); UJ.uValW.value.copy(VAL_L).applyMatrix4(m);
    };
    g.updateMatrixWorld(true); wereld();
    const glowFig = FIG.find(p => p.glow && Math.hypot(p.x - DJ.x, p.z - DJ.z) > 4);
    const cam = jungleCam(ctx, maat, {
      sx, V: Vm, DJ: DJm, F: { x: X(F.x), y: F.y, z: F.z }, VAL: { x: X(lip.x), y: lip.y, z: lip.z }, route: Lr,
      paddo: paddoPlek.map(p => ({ x: X(p.x), z: p.z })), glow: glows.length && glowFig ? { x: X(glowFig.x), z: glowFig.z } : null, draaiers,
    });
    const VUURK = new THREE.Color(0xff7a2a), kB = new THREE.Color(), kD = new THREE.Color();
    let open = 0.5, openV = 0, draai = 0, tijd = 0, standWas = 'groove';
    laatste = Object.assign({ sx, palet: PALH.map(c => '#' + c.toString(16).padStart(6, '0')), lampen: (lampV ? 1 : 0) + (lampDj ? 1 : 0), vast: delen.length }, tel);
    // Reuzenpaddenstoelen, palmen, varens, rotsen en gloeibloemen uit Blender (doolhof/buiten-modellen.js, 17-10): achtergrond buiten de
    // kamer, dus nooit in de weg van pad of camera.
    const brand = null;  // (de Burning Man staat op het strand: het bladerdak van de jungle verbergt alles buiten de kamer)
    const FL = doolhof.flora;
    if (FL && FL.klaar && FL.plant) {
      const rr = (a, b) => a + r() * (b - a), veld = (n, x0, x1, z0, z1) => Array.from({ length: n }, () => ({ x: X(rr(x0, x1)), z: rr(z0, z1), s: rr(0.8, 1.3) }));
      FL.plant(g, 'paddo_3', veld(Z ? 2 : 4, -34, -21, -8, 18));
      FL.plant(g, 'paddo_2', veld(Z ? 3 : 6, -32, -17, -12, 20));
      FL.plant(g, 'palm_2', veld(Z ? 3 : 6, -42, -18, -20, 26));
      FL.plant(g, 'palm_1', veld(Z ? 3 : 6, 17, 36, -20, 26));
      FL.plant(g, 'varen_2', veld(Z ? 8 : 16, -30, -16, -10, 20));
      FL.plant(g, 'rots_3', veld(3, -34, -20, -6, 16));
      FL.plant(g, 'bloem_2', veld(Z ? 6 : 12, -30, -17, -8, 18));
    }
    B.liftUitgang();  // de uitgang van deze kamer wordt de lift (de kern kiest de overgang direct na maak)
    return {
      maat, route: Lr, blijf: 14, cam,
      update(dt) {
        dt = klem(+dt || 0, 0, 0.1); tijd += dt;
        if (brand) brand.update(dt);
        const sh = doolhof.show || {}, st = sh.stand || 'groove', pu = typeof pulse === 'number' ? pulse : 0, en = typeof energy === 'number' ? energy : 0.7;
        const opb = sh.opbouw || 0, dr = sh.drop || 0, bl = sh.blackout || 0, fl = sh.flits || 0;
        wereld();
        // reuzenbloem: veer naar het doel; knop in de break, trillend dicht in de opbouw, de drop schiet hem open
        if (st === 'drop' && standWas !== 'drop') openV += 7;
        standWas = st;
        const doel = st === 'break' ? 0.1 + 0.05 * Math.sin(tijd * 0.8) : st === 'opbouw' ? 0.42 - 0.3 * opb : st === 'drop' ? 0.95 + 0.12 * dr : 0.66 + 0.08 * pu * en;
        openV += ((doel - open) * 26 - openV * 5.5) * dt;
        open = klem(open + openV * dt, 0, 1.25);
        UB.uOpen.value = open + (st === 'opbouw' ? 0.025 * opb * Math.sin(tijd * 37) : 0);
        draai = (draai + dt * (st === 'break' ? 0.04 : st === 'opbouw' ? 0.12 + 0.5 * opb : st === 'drop' ? 0.35 + 0.9 * dr : 0.12 + 0.1 * pu)) % (TAU * 100);
        UB.uDraai.value = draai;
        // dj-licht in de showkleur (drop: elke tel een andere)
        if (sh.kleur) sh.kleur(st === 'drop' ? Math.floor(typeof beatPos === 'number' ? beatPos : 0) : 0, kD); else kD.copy(PAL[0]);
        UJ.uDjK.value.copy(kD);
        UJ.uDjI.value = (0.25 + 0.9 * pu * en + 0.7 * dr + 0.3 * opb) * (1 - 0.6 * bl) + 0.8 * fl;
        if (lampDj) { lampDj.color.copy(kD); lampDj.intensity = 0.3 + 1.4 * UJ.uDjI.value; }
        H.zet({ trip: 0.3 + (st === 'opbouw' ? 0.5 * opb : 0) + 0.7 * dr, aurora: 0.65 + 0.35 * dr });
        if (sh.kleur) sh.kleur(1, kB); else kB.copy(PAL[1]);
        const vl = B.U.uVlam.value;
        if (publiek) publiek.zet({ a: VUURK, b: kB, helder: 0.5 + 0.25 * vl, flits: fl * 0.5, rand: 0.8 + 0.6 * pu, armen: 0.35 * dr + 0.15 * opb, gloed: 1 + 0.6 * dr });
        if (vijverVolk) vijverVolk.zet({ b: kB, helder: 0.45, flits: fl * 0.5, rand: 0.9 + 0.5 * pu, armen: 0.3 * dr, gloed: 1 + 0.5 * dr });
      },
      opruimen() { if (publiek) publiek.opruimen(); if (vijverVolk) vijverVolk.opruimen(); if (brand) brand.opruimen(); },
    };
  }

  doolhof.registreer('jungle', { gewicht: 0.7, buiten: true, maak: ctx => bouw(ctx) });
  doolhof.jungle = { info: () => laatste, indeling: IND };
})();

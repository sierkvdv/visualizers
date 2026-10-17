// --- Burning Man in de buitenkamers: elke keer een ander gigantisch houten kunstwerk dat afbrandt (doolhof.brand) ---
// Kunstwerken uit Blender (deel/blender/brand.py -> models/buiten-brand.glb, ~2 MB): man, tempel, uil, walvis, raket, schedel, feniks,
// octopus (14-27 m hoog, vierkante balken). Vertexkleur = masker: R = toeval per balk, G = brandvolgorde (onder eerst), B = neonlijn.
// Sierk (17-10): "ik zag wel vuur maar niet echt een burning iets, een houten figuur afbranden". Daarom sinds 17-10 avond:
// - vóór de brand: echt hout (nerf langs de balk, donkere kopse kanten, stalen platen bij de verbindingen) dat van onderen wordt aangelicht
//   door bouwlampen op het zand om de voet (onder fel, boven zachter; de lampjes zelf gloeien op de grond), heldere neonlijnen op de tel;
// - de brand: het hout gloeit van onder naar boven oranje op en verkoolt tot houtskool met gloeiende naden; grote vlammentongen likken
//   langs de balken omhoog (instanced billboards, druppelvorm die golft), een vuurzuil met rookgloed erboven, vonken tot ~40 m hoog,
//   een gloed op het zand; het onverbrande hout erboven vangt het oranje licht van onderen;
// - instorten: losse balken vallen al tijdens de brand (onderste eerst, per balk als één stuk), daarna wankelt het geheel en kantelt
//   het om (versnellend, op de tel) en kreukt in tot een brandende hoop met gloeiende houtskool die nog lang nasmeult;
// - licht: een geleende of eigen lamp (oranje, flakkert) tussen het kunstwerk en het publiek; de kamer kan .gloed/.lichtP gebruiken om
//   het silhouetpubliek mee aan te lichten.
// Alle beweging in de vertex-shaders (twee draws: bouwsel + één instanced draw voor tongen, vonken, vuurballen, zuil/rook, grondgloed en
// bouwlampen). Nooit twee keer hetzelfde kunstwerk achter elkaar (kaartspel).
// Verloop (normaal): aansteken op de eerste drop terwijl de loper in de kamer is, anders na ~24 s (op de tel); het vuur kruipt in ~36 s
// naar boven (drops geven een stoot en versnellen, break remt), op de tel stort het in (~4,5 s), daarna smeult de hoop. Loopt de loper
// al naar de lift (update(dt, { haast: true })), dan steekt hij meteen aan / stort hij binnen ~7 s in, zodat het in beeld komt.
// API: doolhof.brand.klaar, .namen, .kiesNaam() (volgende kaart van de stapel), .maat(naam) -> { h, x0, x1, z0, z1 } (model, m),
//   .plaats(ctx, groep, { x, z, ry, schaal, naam?, lamp? }) -> handvat of null (model nog niet binnen). x/z = midden van de voet (kamer),
//   ry draait de voorkant (+z van het model) die kant op, lamp = een lamp-handvat van de kamer om tijdens de brand te lenen (de kamer zet
//   kleur/sterkte eerst zelf, update() mengt het vuur erover en zet hem daarna terug). Handvat: { naam, groep, x, z, h, voor, breed, fx, fz,
//   hoopX, hoopZ, aan, val (0..1 instorten), na (0..1 nasmeulen), gloed (vuursterkte), lichtP (Vector3, kamer), ev/evSoort ('aan'|'val')/
//   evTijd (s, performance.now), update(dt, { haast }), ontsteek(), opruimen() }. De kamer roept update in haar update en opruimen() bij
//   het opruimen aan.
// Test: doolhof.brand.volgende = 'uil' (zet het volgende kunstwerk vast), doolhof.brand.snel = true (brandt in ~10 s af).
(function () {
  'use strict';
  const doolhof = window.doolhof = window.doolhof || {};
  if (typeof THREE === 'undefined' || typeof clubHooks === 'undefined') return;
  const houd = x => { (x.userData = x.userData || {}).doolhofHouden = true; return x; };
  const GEO = {}, BOX = {}, PUNTEN = {};
  const AY = new THREE.Vector3(0, 1, 0);
  const BR = doolhof.brand = { klaar: false, namen: [], volgende: null, snel: false };

  // ---------- shaders ----------
  const PAL = `vec3 vuur(float t) { t = clamp(t, 0.0, 1.0); return t < 0.35 ? mix(vec3(0.5, 0.03, 0.0), vec3(1.0, 0.25, 0.02), t / 0.35) : t < 0.7 ? mix(vec3(1.0, 0.25, 0.02), vec3(1.0, 0.65, 0.12), (t - 0.35) / 0.35) : mix(vec3(1.0, 0.65, 0.12), vec3(1.0, 0.95, 0.75), (t - 0.7) / 0.3); }
float h11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float h21(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
`;
  // waar een punt van het bouwsel nu is (model-ruimte); Gb = brandmoment van de hele balk, R = toeval per balk: beide per balk gelijk, dus
  // elke balk beweegt als één stuk. w = hoeveel hij al gevallen is.
  // 1. losse balken (R < 0,33, onderste eerst) vallen al tijdens de brand recht omlaag (versnellend) en liggen plat in de as; wie pas na
  //    prog 0,88 aan de beurt zou zijn, valt mee met de rest (anders schoof hij na het instorten nog door de hoop).
  // 2. de rest op uVal (JS, op de tel): kantelt als geheel om de voet in de valrichting uValR (versnellend), per balk iets anders, en kreukt
  //    bij het neerkomen in tot een hoop. Vlak ervoor wankelt het. (De vloer geldt pas als hij valt: de octopus staat deels onder y 0.)
  const VAL = `uniform float uProg, uTijd, uVal, uH;
uniform vec2 uValR, uMid;
vec4 val(vec3 p, float Gb, float R) {
  float wank = smoothstep(0.72, 0.9, uProg) * (1.0 - smoothstep(0.0, 0.15, uVal));
  p.xz += uValR * (wank * p.y * 0.007 * sin(uTijd * 1.9));
  float hp = 0.12 + 1.7 * R * R * (1.0 - 0.6 * Gb);
  vec2 rel = p.xz - uMid, mz = vec2(R - 0.5, fract(R * 7.31) - 0.5);
  float moment = Gb + 0.3 + 0.45 * R;
  float los = step(R, 0.33) * step(moment, 0.88) * clamp((uProg - moment) / 0.04, 0.0, 1.0), e = los * los;
  vec3 a = vec3(p.x, mix(p.y, hp, e), p.z);
  a.xz += (rel / max(length(rel), 0.5) * 1.5 + mz * 3.0) * e;
  float kb = clamp(uVal * 1.15 - 0.15 * R, 0.0, 1.0), th = kb * kb * 1.45, ct = cos(th), st = sin(th);
  float al = dot(rel, uValR);
  vec2 zij = rel - uValR * al;
  vec3 b = vec3(0.0, p.y * ct - al * st, 0.0);
  b.xz = uMid + zij + uValR * (al * ct + p.y * st);
  float kr = smoothstep(0.75, 1.0, kb);   // pas vlak voor de grond inkreuken (eerder leek het een explosie van balken)
  b.xz = mix(b.xz, uMid + zij * 0.55 + uValR * (al * 0.4 + p.y * 0.3) + mz * 3.0, kr);
  b.y = mix(max(b.y, mix(-9.0, hp, smoothstep(0.0, 0.25, kb))), hp, kr);
  return vec4(mix(b, a, los), max(los, kb));
}
`;
  // het bouwsel; aB = (dwars over het vlak 0..1, langs de balk in m, lengte van de balk in m, brandmoment van de balk), zie bereid()
  const STR_V = `
attribute vec4 aB;
varying vec3 vM, vP, vN, vNv, vV, vB;
varying float vWeg;
${VAL}
void main() {
  vM = vec3(color.r, color.g, color.b);
  vec4 q = val(position, aB.w, vM.r);
  vP = position; vN = normal; vB = aB.xyz; vWeg = q.w;
  vec4 mv = modelViewMatrix * vec4(q.xyz, 1.0);
  vNv = normalMatrix * normal; vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;
  const STR_F = `
uniform float uProg, uTijd, uH, uPuls, uBurst, uDim, uFlits, uNa, uOplicht, uGloed;
uniform vec3 uA, uB, uRb;
uniform vec2 uMid;
varying vec3 vM, vP, vN, vNv, vV, vB;
varying float vWeg;
${PAL}
float lampje(vec3 L, vec3 n) { vec3 d = L - vP; float l2 = max(dot(d, d), 0.01); return max(dot(n, d * inversesqrt(l2)), 0.0) / (1.0 + l2 / (uH * uH * 0.3)); }
void main() {
  float R = vM.r, G = vM.g, N = vM.b, y = vP.y;
  vec3 n = normalize(vN), nv = normalize(vNv);
  if (!gl_FrontFacing) { n = -n; nv = -nv; }
  float u = vB.x, v = vB.y, L = max(vB.z, 0.05);
  // hout: tint per balk, nerf langs de balk, kopse kanten donker, een stalen plaat bij elke verbinding (langere balken)
  float nerf = 0.6 * vn(vec2(u * 4.0 + R * 37.0, v * 0.9)) + 0.4 * vn(vec2(u * 11.0 + R * 11.0, v * 3.1));
  float kop = min(v, L - v);
  float eind = 1.0 - smoothstep(0.05, 0.14, kop);
  float plaat = smoothstep(0.17, 0.2, kop) * (1.0 - smoothstep(0.4, 0.43, kop)) * step(1.2, L);
  vec3 alb = mix(vec3(0.42, 0.26, 0.13), vec3(0.64, 0.44, 0.24), R) * (0.68 + 0.5 * nerf) * (1.0 - 0.5 * eind);
  alb = mix(alb, vec3(0.13, 0.13, 0.14), plaat * 0.8);
  // licht: bouwlampen op de grond (de dichtstbijzijnde hoek + één voor), schijnen omhoog: onder fel, boven zachter; maan van boven
  vec3 hoek = vec3(uMid.x + sign(vP.x - uMid.x) * (uRb.x + 1.5), 0.35, uMid.y + sign(vP.z - uMid.y) * (uRb.z + 1.5));
  vec3 voorL = vec3(uMid.x, 0.35, uMid.y + uRb.z + 4.0);
  float op = lampje(hoek, n) * 0.9 + lampje(voorL, n) * 1.1;
  vec3 licht = vec3(1.0, 0.7, 0.42) * op * uOplicht + vec3(0.1, 0.11, 0.17) * (0.3 + 0.4 * max(n.y, 0.0));
  // het vuur eronder: oranje licht van onderen, het felst vlak boven het brandfront, flakkert
  float yF = clamp((uProg - 0.075) / 0.85, 0.0, 1.0) * uH;
  float flik = 0.6 + 0.4 * sin(uTijd * (9.0 + 7.0 * R) + y * 0.9 + R * 40.0) * sin(uTijd * 5.3 + R * 17.0);
  float dy = (y - yF) / (0.2 * uH);
  licht += vuur(0.55) * uGloed * (0.55 + 0.45 * flik) * (0.6 + 0.6 * max(-n.y, 0.0)) * 1.5 / (1.0 + dy * dy);
  float rim = 1.0 - abs(dot(nv, normalize(vV)));
  vec3 hout = alb * licht + vec3(0.3, 0.28, 0.45) * rim * rim * rim * 0.14;
  // brand: vlak achter het front fel oranje, daarna houtskool in blokjes met gloeiende naden (krokodillenhuid) die nasmeult
  float aan = smoothstep(G - 0.02, G + 0.05, uProg);
  float hitte = exp(-max(uProg - G, 0.0) * 7.0);
  vec2 cq = vec2(u * 2.0 + R * 5.0, v * 6.5 + floor(u * 2.0) * 0.5 + R * 7.0), fq = fract(cq);
  float naad = 1.0 - smoothstep(0.04, 0.14, min(min(fq.x, 1.0 - fq.x) * 0.8, min(fq.y, 1.0 - fq.y)));
  vec3 kool = vec3(0.03, 0.022, 0.018) * (0.6 + 0.6 * nerf) + alb * licht * 0.08;
  vec3 gloei = vuur(0.3 + 0.55 * flik * (0.35 + 0.65 * hitte)) * (naad * (0.5 + 0.6 * hitte) * (0.55 + 0.45 * flik) + hitte * 1.1 + 0.1 + 0.15 * vWeg)
    * (0.85 + 0.7 * uBurst) * (1.0 - 0.5 * uNa) * (1.0 + 0.6 * vWeg);   // de hoop gloeit na
  // neon (vóór de brand): looplicht in de showkleuren, pulseert op de tel
  vec3 neon = mix(uA, uB, 0.5 + 0.5 * sin(y * 0.3 - uTijd * 1.5)) * N * (1.0 - aan) * (1.2 + 1.4 * uPuls);
  vec3 c = mix(hout, kool + gloei, aan) + neon;
  c *= uDim;
  c += vec3(uFlits) * 0.3;
  gl_FragColor = vec4(c, 1.0);
}`;
  // vuur: instanced billboards; aP = plek op het bouwsel (model) + brandmoment van de balk, aI = (G, toeval, maat, soort)
  // soort 0 vlamtong, 1 vonk, 2 vuurbal (drop), 3 vuurzuil/rook (aP.y = plek in de zuil 0..1), 4 grondgloed (plat), 5 bouwlamp
  const VL_V = `
attribute vec4 aP, aI;
uniform float uBurst, uSchaal, uNa, uGloed, uOplicht;
uniform vec3 uRb;
varying vec2 vUv; varying float vA, vT, vSoort;
${PAL}
${VAL}
void main() {
  float G = aI.x, R = aI.y, maat = aI.z, soort = aI.w;
  float aan = smoothstep(G - 0.01, G + 0.04, uProg), yF = clamp((uProg - 0.075) / 0.85, 0.0, 1.0) * uH;
  vec3 c = aP.xyz; vec2 s = vec2(1.0); float a = 0.0, op = 0.0, vt = 0.0;
  bool plat = false;
  if (soort < 0.5) {            // vlamtong: groeit uit de balk omhoog, golft en dooft; vlak achter het front het grootst
    vec4 q = val(aP.xyz, aP.w, R);
    float heet = aan * (0.7 + 0.6 * exp(-max(uProg - G, 0.0) * 5.0)) * (1.0 - 0.3 * q.w) * (1.0 - 0.55 * uNa);
    vt = fract(uTijd * (0.7 + 0.6 * R) + R * 13.7 + aP.x * 0.37 + aP.y * 0.21 + aP.z * 0.53);
    float hg = (2.2 + 4.5 * R) * maat * heet * (1.0 + 0.7 * uBurst);
    c = q.xyz; c.y += vt * hg * 0.5; c.x += sin(uTijd * 2.3 + R * 20.0) * 0.4 * vt;
    s = vec2(hg * (0.42 + 0.18 * R), hg) * (1.0 - 0.4 * vt) * uSchaal;
    a = heet * (1.0 - vt) * smoothstep(0.0, 0.12, vt);
    op = 0.35;                  // de voet van de tong op het punt
  } else if (soort < 1.5) {     // vonk: hoog de lucht in, waait mee
    vec4 q = val(aP.xyz, aP.w, R);
    vt = fract(uTijd * (0.12 + 0.14 * R) + R * 13.7 + aP.x * 0.37 + aP.z * 0.53);
    c = q.xyz;
    c.y += vt * (16.0 + 22.0 * R) * (1.0 + 0.4 * uBurst);
    c.x += sin(vt * 6.0 + R * 40.0) * 2.5 * vt + vt * 4.0;
    c.z += cos(vt * 5.0 + R * 30.0) * 2.5 * vt;
    s = vec2(maat * (1.0 + 1.2 * uBurst)) * uSchaal;
    a = aan * (1.0 - vt) * (0.6 + 0.4 * sin(uTijd * 20.0 + R * 50.0)) * (1.0 - 0.5 * uNa) * (0.8 + 0.8 * uBurst);
  } else if (soort < 2.5) {     // vuurbal op de drop (uit het brandende deel)
    vec4 q = val(aP.xyz, aP.w, R);
    c = q.xyz; c.y += 2.0 + uBurst * 6.0 * (1.0 - uBurst * 0.3);
    s = vec2(maat * (0.3 + 1.6 * uBurst)) * uSchaal;
    a = uBurst * aan;
  } else if (soort < 3.5) {     // vuurzuil door het midden tot boven het front, erboven rookgloed; na het instorten laag boven de hoop
    float kk = fract(aP.y + uTijd * (0.04 + 0.03 * R) + R * 7.0), rook = smoothstep(0.5, 0.8, kk);
    float hz = mix(yF + 0.3 * uH, 3.0 + 3.0 * (1.0 - uNa), smoothstep(0.0, 1.0, uVal));
    c = vec3(aP.x + sin(uTijd * 0.3 + R * 9.0) * 1.2 + kk * kk * 7.0, kk * hz * (1.0 + 0.9 * rook), aP.z + cos(uTijd * 0.25 + R * 5.0) * 1.2);
    float w = max(uRb.x, uRb.z) * (0.4 + 0.5 * kk + 0.5 * rook) * (1.0 - 0.35 * uVal);
    s = vec2(w, w * 1.25) * uSchaal;
    a = uGloed * sin(kk * 3.14159) * (0.11 + 0.08 * R) * (1.0 - 0.5 * rook);
    vt = rook;
  } else if (soort < 4.5) {     // gloed op het zand: vooraf de warme plas van de bouwlampen, dan het vuur, daarna de hoop
    plat = true;
    c = vec3(aP.x + position.x * maat, 0.06, aP.z + position.y * maat);
    a = uOplicht * 0.16 + uGloed * (0.5 + 0.2 * sin(uTijd * 7.3) * sin(uTijd * 3.1));
    vt = clamp(uGloed * 2.0, 0.0, 1.0);
  } else {                      // bouwlamp op het zand: fel puntje, gaat uit als het vuur het overneemt
    s = vec2(maat) * uSchaal;
    a = clamp((uOplicht - 0.35) / 0.65, 0.0, 1.0);
  }
  vSoort = soort; vUv = position.xy; vA = a; vT = vt;
  vec4 mv = modelViewMatrix * vec4(c, 1.0);
  if (!plat) mv.xy += position.xy * s + vec2(0.0, op * s.y);   // billboard in kijkruimte
  if (soort < 3.5) vA *= smoothstep(1.5, 6.0, -mv.z);           // vlak voor de camera vervagen (anders vult één tong het hele beeld)
  gl_Position = projectionMatrix * mv;
  if (vA < 0.003) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);       // weg (buiten beeld)
}`;
  const VL_F = `
uniform float uTijd, uDim;
varying vec2 vUv; varying float vA, vT, vSoort;
${PAL}
void main() {
  vec2 q = vUv * 2.0;
  float d = length(q), a;
  vec3 c;
  if (vSoort < 0.5) {           // tong: bol onderaan, punt boven, golft; geel-wit in de voet, rood in de punt
    float hy = q.y * 0.5 + 0.5;
    float gol = sin(hy * 5.0 - uTijd * 9.0 + vT * 6.0) * 0.2 * hy;
    float w = 0.95 * pow(max(1.0 - hy, 0.0), 0.6) * (0.55 + 0.45 * smoothstep(0.0, 0.3, hy));
    float dx = abs(q.x + gol) / max(w, 0.02);
    a = (1.0 - smoothstep(0.3, 1.0, dx)) * smoothstep(0.0, 0.1, hy) * vA;   // (smoothstep met omgekeerde grenzen is ongedefinieerd: op ANGLE 0)
    c = vuur(0.9 - hy * 0.8 - vT * 0.3 - dx * 0.2) * 0.42;   // getemperd: anders telden de tongen op tot een witte vlek en verdween het hout erin
  } else if (vSoort < 1.5) {
    a = (1.0 - smoothstep(0.0, 1.0, d)) * vA; c = vuur(0.85) * 1.6;
  } else if (vSoort < 2.5) {
    a = (1.0 - smoothstep(0.0, 1.0, d)) * vA; c = vuur(1.0 - d * 0.7) * 1.3;
  } else if (vSoort < 3.5) {    // zuil/rook: zachte, kolkende vlek
    a = exp(-d * d * 2.4) * (0.6 + 0.4 * vn(q * 1.7 + vec2(uTijd * 0.2, -uTijd * 0.6))) * vA;
    c = mix(vuur(0.32) * 0.55, vec3(0.14, 0.06, 0.035), vT);
  } else if (vSoort < 4.5) {
    a = exp(-d * d * 3.5) * vA; c = mix(vec3(1.0, 0.75, 0.45) * 0.5, vuur(0.55) * 0.8, vT);
  } else {
    a = exp(-d * d * 7.0) * vA; c = vec3(1.0, 0.86, 0.62) * 2.2;
  }
  if (a < 0.004) discard;
  gl_FragColor = vec4(c * a * uDim, 1.0);
}`;

  const U = { uTijd: { value: 0 }, uPuls: { value: 0 }, uDim: { value: 1 }, uFlits: { value: 0 },
    uA: { value: new THREE.Color(0xff2bd6) }, uB: { value: new THREE.Color(0x20f0ff) } };

  // ---------- laden ----------
  const laden = () => {
    const L = typeof gltf !== 'undefined' && gltf && gltf.load ? gltf : (THREE.GLTFLoader ? new THREE.GLTFLoader() : null);
    if (!L) return;
    L.load('models/buiten-brand.glb', g => {
      g.scene.updateMatrixWorld(true);
      g.scene.traverse(o => {
        if (!o.isMesh) return;
        const geo = o.geometry.clone(); geo.applyMatrix4(o.matrixWorld); geo.computeBoundingSphere(); geo.computeBoundingBox();
        GEO[o.name] = houd(geo); BOX[o.name] = geo.boundingBox;
      });
      BR.namen = Object.keys(GEO);
      BR.klaar = true;
    }, undefined, err => console.warn('buiten-brand niet geladen', err));
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', laden); else laden();

  // balkmaten per hoekpunt, eenmalig per model (pas bij de eerste keer plaatsen; ~10k punten, een paar ms): aB = (dwars 0..1 over het
  // vlak, langs de balk in m, lengte in m, brandmoment van de balk = laagste G). Elk vlak van een balk is in het bestand een los
  // vierkant (platte normalen, samenhang via de driehoeken); alle vier vlakken van één balk hebben dezelfde R, lengte en laagste G, dus
  // de balk valt als één stuk. Plus de punten voor de vlammen/vonken (elk 3e hoekpunt).
  function bereid(naam) {
    if (PUNTEN[naam]) return;
    const geo = GEO[naam], p = geo.attributes.position, c = geo.attributes.color, n = p.count, ix = geo.index ? geo.index.array : null;
    // COLOR_0 komt als genormaliseerde uint16 binnen: de gpu deelt zelf, getX/getY in r128 niet
    const nm = c && c.normalized ? (c.array instanceof Uint16Array ? 65535 : c.array instanceof Uint8Array ? 255 : 1) : 1;
    const Gv = i => c ? c.getY(i) / nm : p.getY(i) / 25, Rv = i => c ? c.getX(i) / nm : Math.random();
    const ouder = new Int32Array(n);
    for (let i = 0; i < n; i++) ouder[i] = i;
    const zoek = i => { while (ouder[i] !== i) { ouder[i] = ouder[ouder[i]]; i = ouder[i]; } return i; };
    const m = ix ? ix.length : n;
    for (let k = 0; k + 2 < m; k += 3) {
      const a = zoek(ix ? ix[k] : k);
      for (let j = 1; j < 3; j++) { const b = zoek(ix ? ix[k + j] : k + j); if (b !== a) ouder[b] = a; }
    }
    const vlakken = new Map();
    for (let i = 0; i < n; i++) { const r = zoek(i); let l = vlakken.get(r); if (!l) vlakken.set(r, l = []); l.push(i); }
    const aB = new Float32Array(n * 4);
    const V = () => new THREE.Vector3(), q0 = V(), cA = V(), cB = V(), T = V(), o = V(), om = V(), e = V();
    const pos = i => V().fromBufferAttribute(p, i);
    for (const l of vlakken.values()) {
      const q = l.map(pos);
      let Gb = 1; for (const i of l) Gb = Math.min(Gb, Gv(i));
      // lengterichting: het verste paar, dan zuiver van het midden van het ene uiteinde naar het andere
      let bi = 0, bj = 0, best = -1;
      for (let a = 0; a < q.length; a++) for (let b = a + 1; b < q.length; b++) { const d = q[a].distanceToSquared(q[b]); if (d > best) { best = d; bi = a; bj = b; } }
      T.subVectors(q[bj], q[bi]).normalize();
      q0.set(0, 0, 0); q.forEach(v => q0.add(v)); q0.divideScalar(q.length);
      cA.set(0, 0, 0); cB.set(0, 0, 0); let nA = 0, nB = 0;
      for (const v of q) { if (o.subVectors(v, q0).dot(T) < 0) { cA.add(v); nA++; } else { cB.add(v); nB++; } }
      if (!nA || !nB) { l.forEach(i => aB.set([0.5, 0, 1, Gb], i * 4)); continue; }
      cA.divideScalar(nA); cB.divideScalar(nB);
      T.subVectors(cB, cA); const L = T.length() || 1e-3; T.divideScalar(L);
      // dwars: afstand tot de as in het vlak; de twee langsranden van het vlak krijgen 0 en 1
      const off = q.map(v => { const s = o.subVectors(v, cA).dot(T); return o.clone().addScaledVector(T, -s); });
      om.set(0, 0, 0); off.forEach(v => om.add(v)); om.divideScalar(off.length);
      e.set(0, 0, 0);
      for (const v of off) { e.subVectors(v, om); if (e.lengthSq() > 1e-8) break; }
      e.normalize();
      l.forEach((i, k) => {
        const s = o.subVectors(q[k], cA).dot(T);
        aB.set([o.subVectors(off[k], om).dot(e) > 0 ? 1 : 0, Math.min(L, Math.max(0, s)), L, Gb], i * 4);
      });
    }
    geo.setAttribute('aB', new THREE.BufferAttribute(aB, 4));
    const uit = [];
    for (let i = 0; i < n; i += 3) uit.push([p.getX(i), p.getY(i), p.getZ(i), Gv(i), Rv(i), aB[i * 4 + 3]]);
    PUNTEN[naam] = uit;
  }

  // kaartspel: elke keer een ander kunstwerk, nooit twee keer hetzelfde achter elkaar
  let stapel = [], vorige = null;
  function kies() {
    if (BR.volgende && GEO[BR.volgende]) { const n = BR.volgende; BR.volgende = null; return n; }
    if (!stapel.length) { stapel = BR.namen.slice(); for (let i = stapel.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [stapel[i], stapel[j]] = [stapel[j], stapel[i]]; } if (stapel[0] === vorige && stapel.length > 1) stapel.push(stapel.shift()); }
    return (vorige = stapel.shift());
  }
  BR.kiesNaam = () => (BR.klaar ? kies() : null);
  BR.maat = naam => { const b = BOX[naam]; return b ? { h: b.max.y, x0: b.min.x, x1: b.max.x, z0: b.min.z, z1: b.max.z } : null; };

  const VLAK = houd(new THREE.PlaneGeometry(1, 1));
  BR.plaats = function (ctx, groep, o) {
    o = o || {};
    if (!BR.klaar) return null;
    const naam = o.naam && GEO[o.naam] ? o.naam : kies(), geo = GEO[naam], bb = BOX[naam], zwaar = ctx && ctx.zwaar != null ? ctx.zwaar : 0;
    bereid(naam);
    const s = o.schaal || 1, ry = o.ry || 0, h = bb.max.y, cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
    const rx = (bb.max.x - bb.min.x) / 2, rz = (bb.max.z - bb.min.z) / 2;
    const g = new THREE.Group(); g.name = 'brand-' + naam;
    g.rotation.y = ry; g.scale.setScalar(s);
    const kamer = (mx, my, mz, v) => v.set(mx * s, my * s, mz * s).applyAxisAngle(AY, ry).add(g.position);   // model -> kamer
    const mid = kamer(cx, 0, cz, new THREE.Vector3());
    g.position.set((o.x || 0) - mid.x, 0, (o.z || 0) - mid.z);   // het midden van de voet op (x, z)
    groep.add(g);
    // valrichting (model): vaak opzij (vanaf het publiek zie je hem dan in zijn geheel omgaan), soms naar voren of achteren
    const rv = Math.random(), th = rv < 0.45 ? (Math.random() < 0.5 ? -1 : 1) * (Math.PI / 2 + (Math.random() - 0.5) * 0.8) : rv < 0.75 ? (Math.random() - 0.5) * 0.9 : Math.PI + (Math.random() - 0.5) * 0.9;
    const valR = new THREE.Vector2(Math.sin(th), Math.cos(th));
    const eigen = { uProg: { value: 0 }, uBurst: { value: 0 }, uSchaal: { value: s }, uVal: { value: 0 }, uValR: { value: valR }, uMid: { value: new THREE.Vector2(cx, cz) },
      uH: { value: h }, uRb: { value: new THREE.Vector3(rx, h, rz) }, uNa: { value: 0 }, uGloed: { value: 0 }, uOplicht: { value: 1 } };
    const sMat = new THREE.ShaderMaterial({ uniforms: Object.assign({}, U, eigen), vertexShader: STR_V, fragmentShader: STR_F, vertexColors: true, side: THREE.DoubleSide });
    const bouwsel = new THREE.Mesh(geo, sMat); bouwsel.frustumCulled = false; g.add(bouwsel);
    // vuur in één instanced draw: tongen, vonken, vuurballen, zuil/rook, grondgloed, bouwlampen
    const pnt = PUNTEN[naam], nV = [460, 260, 110][zwaar] || 110, nS = [520, 300, 110][zwaar] || 110, nK = [16, 11, 6][zwaar] || 6, nB = 6;
    const BOUWL = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => [cx + a * (rx + 1.5), 0.35, cz + b * (rz + 1.5)]).concat([[cx, 0.35, bb.max.z + 4]]);
    const n = nV + nS + nB + nK + 1 + BOUWL.length;
    const ig = new THREE.InstancedBufferGeometry();
    ig.index = VLAK.index; ig.setAttribute('position', VLAK.attributes.position);
    const aP = new Float32Array(n * 4), aI = new Float32Array(n * 4);
    let k = 0;
    const zet = (P, I) => { aP.set(P, k * 4); aI.set(I, k * 4); k++; };
    const punt = laag => { for (let t = 0; t < 12; t++) { const q = pnt[Math.floor(Math.random() * pnt.length)]; if (!laag || q[1] < h * 0.5) return q; } return pnt[Math.floor(Math.random() * pnt.length)]; };
    for (let i = 0; i < nV; i++) { const q = punt(); const groot = q[1] < h * 0.35 && Math.random() < 0.3; zet([q[0], q[1], q[2], q[5]], [q[3], q[4], groot ? 1.6 + Math.random() * 0.6 : 0.8 + Math.random() * 0.6, 0]); }
    for (let i = 0; i < nS; i++) { const q = punt(); zet([q[0], q[1], q[2], q[5]], [q[3], q[4], 0.14 + Math.random() * 0.16, 1]); }
    for (let i = 0; i < nB; i++) { const q = punt(true); zet([q[0], q[1], q[2], q[5]], [q[3], q[4], 7 + Math.random() * 5, 2]); }
    for (let i = 0; i < nK; i++) zet([cx + (Math.random() - 0.5) * rx * 0.3, i / nK, cz + (Math.random() - 0.5) * rz * 0.3, 0], [0, Math.random(), 1, 3]);
    zet([cx, 0, cz, 0], [0, 0.5, 2 * (Math.max(rx, rz) * 2 + 8), 4]);
    for (const L of BOUWL) zet([L[0], L[1], L[2], 0], [0, Math.random(), 1.1, 5]);
    ig.setAttribute('aP', new THREE.InstancedBufferAttribute(aP, 4));
    ig.setAttribute('aI', new THREE.InstancedBufferAttribute(aI, 4));
    ig.instanceCount = n;
    const vMat = new THREE.ShaderMaterial({ uniforms: Object.assign({}, U, eigen), vertexShader: VL_V, fragmentShader: VL_F, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const vlammen = new THREE.Mesh(ig, vMat); vlammen.frustumCulled = false; vlammen.renderOrder = 5; g.add(vlammen);
    // lamp: tussen het kunstwerk en het publiek op een derde van de hoogte (licht het publiek aan). Geleend (o.lamp: de kamer zet hem
    // eerst zelf, hier mengt het vuur erover en zet het hem daarna terug) of een eigen handvat van de kamer (geen over = geen lamp)
    const ORANJE = new THREE.Color(0xff7a28), LICHT = kamer(cx, h * 0.3, bb.max.z + 3, new THREE.Vector3());
    const leen = !!o.lamp, lamp = o.lamp || (ctx && ctx.licht ? ctx.licht(0xff7a28, 0, 60, LICHT.x, LICHT.y, LICHT.z) : null);
    const lamp0 = leen ? { pos: lamp.position.clone(), dist: lamp.distance } : null;
    const hoop = kamer(cx + valR.x * h * 0.15, 0, cz + valR.y * h * 0.15, new THREE.Vector3());
    const T = { aan: false, t: 0, brandT: 0, prog: 0, burst: 0, valT: -1, na: 0, gloed: 0, oplicht: 1, lampK: 0, ev: 0, tel: null, dropGezien: window.clubRegie ? clubRegie.dropBeat : null };
    const gebeurtenis = soort => { T.ev++; H.ev = T.ev; H.evSoort = soort; H.evTijd = performance.now() / 1000; };
    const H = {
      naam, groep: g, x: o.x || 0, z: o.z || 0, h: h * s, voor: rz * s, breed: rx * s, fx: Math.sin(ry), fz: Math.cos(ry), hoopX: hoop.x, hoopZ: hoop.z,
      aan: false, val: 0, na: 0, gloed: 0, lichtP: LICHT, ev: 0, evSoort: null, evTijd: -99,
      ontsteek() { if (!T.aan) { T.aan = true; T.burst = 1; T.prog = Math.max(T.prog, 0.02); gebeurtenis('aan'); } },
      update(dt, oo) {
        dt = Math.min(dt || 0, 0.1); oo = oo || {};
        const sh = doolhof.show || {}, R = window.clubRegie, snel = BR.snel, VALDUUR = snel ? 2.5 : 4.5;
        T.t += dt;
        const tel = Math.floor(Math.max(0, typeof beatPos === 'number' ? beatPos : 0)), nieuweTel = T.tel !== null && tel !== T.tel; T.tel = tel;
        const nieuweDrop = R && R.dropBeat !== T.dropGezien && sh.stand === 'drop';
        if (nieuweDrop) T.dropGezien = R.dropBeat;
        // aansteken: de eerste drop terwijl de loper hier is, anders na ~24 s; loopt hij al naar de lift: meteen (beide op de tel)
        if (!T.aan) {
          const wacht = snel ? 2 : 24;
          if ((nieuweDrop && T.t > 2) || ((T.t > wacht || oo.haast) && (nieuweTel || T.t > wacht + 2))) H.ontsteek();
        }
        if (T.aan) {
          T.brandT += dt;
          if (T.valT < 0) {   // het vuur kruipt omhoog (~36 s, met instorten ~40 s); opbouw en drop versnellen, break remt
            let v = (snel ? 1 / 6 : 1 / 40) * (1 + 0.8 * (sh.stand === 'opbouw' ? sh.opbouw || 0 : 0) + (sh.stand === 'drop' ? 0.3 : 0) - (sh.stand === 'break' ? 0.35 : 0));
            if (oo.haast && T.brandT > (snel ? 1 : 10)) {   // de loper gaat weg: binnen ~7 s instorten, voor hij bij de lift is (vaste deadline)
              if (T.haastTot == null) T.haastTot = T.brandT + (snel ? 2 : 7);
              v = Math.max(v, (0.92 - T.prog) / Math.max(0.3, T.haastTot - T.brandT));
            }
            T.prog = Math.min(0.95, T.prog + dt * v);
            if (nieuweDrop) { T.prog = Math.min(0.95, T.prog + 0.05); T.burst = 1; }
            if (T.prog >= 0.9 && (nieuweTel || T.prog >= 0.95)) { T.valT = 0; T.burst = 1; gebeurtenis('val'); }   // instorten op de tel
          } else {
            T.valT += dt;
            T.prog = Math.min(1.12, T.prog + dt * (snel ? 0.15 : 0.05));   // de bovenste balken vatten ook nog vlam
            if (T.valT > VALDUUR) T.na += dt;
            if (nieuweDrop) T.burst = 1;   // ook de hoop vlamt op de drop op
          }
        }
        T.burst *= Math.exp(-dt * 2.2);
        const val = T.valT < 0 ? 0 : Math.min(1, T.valT / VALDUUR), na = 1 - Math.exp(-T.na / (snel ? 8 : 40));
        // vuursterkte (lamp, publiek, zuil, grondgloed): bouwt op na het aansteken, laait op bij het instorten, daarna de hoop
        const doel = !T.aan ? 0 : T.valT < 0 ? Math.min(1, 0.25 + T.prog * 1.6) : val < 1 ? 1.15 : 0.6 * (1 - 0.5 * na);
        T.gloed += (doel - T.gloed) * Math.min(1, dt * 1.5);
        T.oplicht += ((T.aan ? 0.3 : 1) - T.oplicht) * Math.min(1, dt * 0.5);
        eigen.uProg.value = T.prog; eigen.uBurst.value = T.burst; eigen.uVal.value = val; eigen.uNa.value = na;
        eigen.uGloed.value = T.gloed; eigen.uOplicht.value = T.oplicht;
        H.aan = T.aan; H.val = val; H.na = na; H.gloed = T.gloed;
        if (lamp) {
          const I = (T.gloed * (4.5 + 2.0 * Math.sin(T.t * 11) * Math.sin(T.t * 7.3)) + 6 * T.burst) * (1 - 0.6 * (sh.blackout || 0));
          if (leen) {   // geleend: het vuur neemt de lamp in ~1 s over en schuift hem naar het kunstwerk
            T.lampK += ((T.aan ? 1 : 0) - T.lampK) * Math.min(1, dt * 1.2);
            const kk = T.lampK;
            lamp.position.lerpVectors(lamp0.pos, LICHT, kk);
            lamp.distance = lamp0.dist + (60 - lamp0.dist) * kk;
            if (kk > 0.002) { lamp.color.lerp(ORANJE, kk); lamp.intensity += (Math.max(0, I) - lamp.intensity) * kk; }
          } else lamp.intensity = Math.max(0, I);
        }
      },
      opruimen() {
        if (leen && lamp) { lamp.position.copy(lamp0.pos); lamp.distance = lamp0.dist; }
        if (g.parent) g.parent.remove(g);
        sMat.dispose(); vMat.dispose(); ig.dispose();  // (het model zelf en het vlak zijn gedeeld: houden)
      },
    };
    return H;
  };

  clubHooks.push(() => {
    const sh = doolhof.show;
    U.uTijd.value = (performance.now() / 1000) % 1000;
    U.uPuls.value = typeof pulse === 'number' ? pulse : 0;
    U.uDim.value = sh ? 1 - 0.5 * (sh.blackout || 0) : 1;
    U.uFlits.value = sh ? sh.flits || 0 : 0;
    if (sh && sh.kleur) { sh.kleur(0, U.uA.value); sh.kleur(1, U.uB.value); }
  });
})();

// --- Gangstijlen van het doolhof: elke S-gang tussen twee kamers krijgt een eigen stijl, minstens op het niveau van de acid-gang (z2/gang.js) ---
// Contract (doolhof/kern.js): doolhof.gangStijl(naam, { gewicht, maak(g, maat, rnd, zwaar) => { muur?, vloer?, plafond?, muurMaat?, vloerMaat?, update(dt, now, b, stand) } }).
// maak mag een generator zijn (zoals hier): de kern bouwt dan op de achtergrond en pauzeert bij een yield als het budget van het beeld op is.
// maak draait per overgang TWEE keer (de gang achter de uitgang van kamer A en die vóór de ingang van kamer B), met dezelfde maat en hetzelfde
// zaad. Daarom: alleen rnd gebruiken (nooit Math.random/rnd()/pick), maat.deel-fabriekjes trekken zelf geen rnd, en update is een zuivere
// functie van now/b/stand (geen tellertjes, geen dt-optelsommen): dan zijn beide helften op elk moment gelijk en valt de wissel niet op.
// maat: L1/L2/L3/B/H/h/LEN, sx + recht(o) (tekst leesbaar in een gespiegelde gang), zwaar, st(x,z) -> [s,d], xz(s,d) -> {x,z,dx,dz}, lijn(d),
// pad (looplijn), dwars (rechte stukken in s), kijk (de twee muren recht vooruit), bol (omhullende bol), deel(sleutel, maak) (één keer voor beide helften).
// Muren/vloer/plafond zijn shaders op de gangcoördinaten (s langs de gang, d zijwaarts, y hoogte): lichtpakketten, gloed en rasters lopen door de
// bochten heen. Alles onverlicht (shader/additief), weinig draw calls (InstancedMesh, één Points per gang); zwaar 2 (tv): minder deeltjes, geen nevel/halo's.
(function () {
  'use strict';
  const doolhof = window.doolhof = window.doolhof || {};
  doolhof.gangStijlen = doolhof.gangStijlen || {};
  if (!doolhof.gangStijl) doolhof.gangStijl = (naam, def) => { if (naam && def && typeof def.maak === 'function') doolhof.gangStijlen[naam] = def; };
  if (typeof THREE === 'undefined' || typeof renderer === 'undefined' || typeof clubHooks === 'undefined') return;

  window.doolhof.tex = window.doolhof.tex || (() => { const c = {}; return (naam, herhaal) => { const k = naam + (herhaal ? '*' : ''); if (!c[k]) { const t = new THREE.TextureLoader().load('tex/doolhof/' + naam + '.jpg'); if (renderer.outputEncoding === THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding; if (herhaal) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.userData = t.userData || {}; t.userData.doolhofHouden = true; c[k] = t; } return c[k]; }; })();
  // (eigen toevoeging: t.userData = t.userData || {} — een Texture heeft in three r128 geen userData; dit bestand laadt als eerste, dus deze lader wint)
  const tex = (naam, herhaal) => doolhof.tex(naam, herhaal);
  const ANISO = Math.min(4, (renderer.capabilities && renderer.capabilities.getMaxAnisotropy) ? renderer.capabilities.getMaxAnisotropy() : 1);
  const scherp = (t, zwaar) => { if (t && !zwaar && t.anisotropy < ANISO) t.anisotropy = ANISO; return t; };  // muren zie je schuin (geldt bij de eerste upload)

  // --- kleine hulpjes ---
  const TAU = Math.PI * 2, KLOK = 200 * Math.PI;  // shadertijd loopt rond na 200π s: sin(k t) met k in honderdsten springt dan niet
  const mtx = new THREE.Matrix4(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), vp = new THREE.Vector3(), vs = new THREE.Vector3(), eul = new THREE.Euler();
  const AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);
  const ca = new THREE.Color(), cb = new THREE.Color(), ZWART = new THREE.Color(0, 0, 0);
  const frac = x => x - Math.floor(x);
  const hash = n => frac(Math.sin(n * 127.1 + 311.7) * 43758.5453);  // vast 'toeval' voor flikkeren: zelfde moment = zelfde waarde in beide helften
  const kl = c => (c instanceof THREE.Color ? c.clone() : new THREE.Color(c == null ? 0xffffff : c));
  const kies = (rnd, a) => a[Math.min(a.length - 1, Math.floor(rnd() * a.length))];
  const houd = x => { (x.userData = x.userData || {}).doolhofHouden = true; return x; };  // (geometrie heeft in r128 geen userData)
  const VLAK = houd(new THREE.PlaneGeometry(1, 1));
  const TORUS = houd(new THREE.TorusGeometry(1, 0.028, 6, 44));
  const WIT = houd(new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)); WIT.needsUpdate = true;
  const zacht = (w, h, teken) => houd(canvasTexture(w, h, teken));
  const haloTex = zacht(64, 4, (c, w, h) => {  // gloedstrook: fel in het midden, uitlopend naar de randen (zoals de acid-gang)
    const gr = c.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.22)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(0.65, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
  });
  const rondTex = zacht(64, 64, (c, w, h) => {  // ronde gloed
    const gr = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
  });
  const plus = (map, side) => new THREE.MeshBasicMaterial({ map: map || null, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: side || THREE.FrontSide });

  // stemming van de muziek en de lichtregie (break: donkerder, opbouw: feller en sneller, drop: vol + stroboscoop in de eerste vier tellen)
  function stemming(b, now) {
    if (b._k) return b._k;
    const r = b.regie, st = b.stand, opb = st === 'opbouw' && r ? Math.min(1, (r.opbouwTel || 0) / 16) : 0;
    const sinds = r && r.dropBeat >= 0 ? b.pos - r.dropBeat : 1e9;
    return (b._k = {
      en: 0.35 + 0.65 * b.energy, opbouw: opb,
      dim: st === 'break' ? 0.5 : st === 'opbouw' ? 0.6 + 0.4 * opb : 1,
      drop: st === 'drop' ? Math.max(0, 1 - sinds / 16) : 0,
      flits: st === 'drop' && sinds >= 0 && sinds < 4 && frac(b.pos * 2) < 0.2 && !(typeof S !== 'undefined' && S.strobe === 'uit') ? 1 : 0,  // 'Stroboscoop: uit' = niet knipperen
      dropTel: st === 'drop' && sinds >= 0 && sinds < 64 ? sinds : 0,  // extra fase tijdens de drop: begint op 0, na 16 tellen een veelvoud van de cyclus
      tel: st === 'opbouw' && opb > 0.5 ? 1 : 2,  // looplicht: in twee tellen door de gang, in de tweede helft van de opbouw in één
      t: now % KLOK, b: b.pos % 64,
    });
  }

  // --- shaders (onverlicht, op de gangcoördinaten van de kern) ---
  const DRAAI = 'vec3 draai(vec3 c, float a) { const vec3 k = vec3(0.57735); float co = cos(a); return c * co + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - co); }\n';
  const MUUR_V = `attribute vec3 aP;
varying vec2 vUv; varying vec3 vP; varying vec3 vN; varying vec3 vV;
void main() {
  vUv = uv; vP = aP;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vN = mat3(modelMatrix) * normal; vV = cameraPosition - w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
  // muur: schildering x tint, felle/verzadigde delen gloeien (blacklight, glyphen, slijm), lichtpakket per tel, gloed langs vloer en plafond,
  // GOLF = regenboogbanden die door de gang trekken, IRIS = kleur draait met de kijkhoek (chroom), WARP = de schildering ademt
  const MUUR_F = `uniform sampler2D map;
uniform vec3 uTint, uGloeiW, uGloeiKleur, uScanKleur, uRandKleur;
uniform float uT, uB, uPuls, uBas, uFlits, uDonker, uLen, uH, uGloei, uDrempel, uSat, uScan, uScanTel, uRand, uGolf, uGolfT, uIris, uWarp;
varying vec2 vUv; varying vec3 vP; varying vec3 vN; varying vec3 vV;
${DRAAI}
void main() {
  vec2 uv = vUv;
#ifdef WARP
  uv += uWarp * vec2(sin(vP.z * 2.7 + uT * 0.9 + vP.x * 1.3), 0.6 * sin(vP.x * 1.9 - uT * 0.7 + vP.z * 1.1)) * (0.7 + 0.6 * uBas);
#endif
  vec3 t = texture2D(map, uv).rgb;
  vec3 c = t * uTint;
  float mx = max(max(t.r, t.g), t.b), mn = min(min(t.r, t.g), t.b);
  float m = smoothstep(uDrempel, uDrempel + 0.25, dot(t, uGloeiW) + uSat * (mx - mn));
  float pk = exp(-fract(uB / uScanTel - vP.x / uLen) * 7.0) * uScan;
  c += t * uGloeiKleur * m * (uGloei + 2.5 * pk) + uScanKleur * pk * 0.3;
#ifdef GOLF
  c = draai(c, uGolf * (vP.x * 0.9 + 0.7 * sin(vP.z * 2.1 + uT * 0.5)) - uGolfT);  // uGolf = dichtheid van de banden, uGolfT = vaste draaisnelheid
#endif
#ifdef IRIS
  vec3 nn = normalize(vN), vv = normalize(vV);
  float ndv = abs(dot(nn, vv));
  c = mix(c, draai(c * 1.3 + 0.03, ndv * 5.0 + uT * 0.35 + vP.z * 0.9 + vP.x * 0.2), uIris);
  c += uIris * 0.3 * pow(1.0 - ndv, 3.0) * draai(vec3(0.9, 0.3, 0.7), uT * 0.5 + vP.x * 0.6);
#endif
  c += uRandKleur * (exp(-vP.z * 4.0) + exp((vP.z - uH) * 4.0)) * uRand;
  gl_FragColor = vec4(c * uDonker + uFlits, 1.0);
}`;
  const VLAK_V = `attribute vec3 aP;
varying vec2 vUv; varying vec3 vP; varying vec3 vV;
void main() {
  vUv = uv; vP = aP;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vV = cameraPosition - w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
  // vloer/plafond: KAART (uv in meters) of PADUV (schildering langs de gang, ook door de bochten), RASTER (synthwave), PLAS (natte plassen),
  // STROOM (gloeiende goot over de middellijn), STREPEN (gevarenstrepen langs de muren), RIMPEL (kleurringen), VLEK (slijmplekken), GLANS
  const VLAK_F = `uniform sampler2D map;
uniform vec3 uTint, uScanKleur, uKleurA, uKleurB;
uniform vec2 uPad;
uniform float uT, uB, uPuls, uBas, uMid, uFlits, uDonker, uLen, uH2, uScan, uScanTel, uRaster, uGap, uPlas, uStroom, uStrepen, uRimpel, uVlek, uGlans;
varying vec2 vUv; varying vec3 vP; varying vec3 vV;
${DRAAI}
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float ruis(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  float s = vP.x, d = vP.y;
  vec3 c = uTint;
#ifdef KAART
  c *= texture2D(map, vUv).rgb;
#endif
#ifdef PADUV
  c *= texture2D(map, vec2(s / uPad.x, (d + uH2) / uPad.y)).rgb;
#endif
  float pk = exp(-fract(uB / uScanTel - s / uLen) * 7.0) * uScan;
  c += uScanKleur * pk * (0.12 + 0.7 * smoothstep(uH2 - 0.45, uH2, abs(d)));
#ifdef RASTER
  float fs = fract(s / uGap + uB * 0.5), fd = fract(d / uGap + 0.5);
  float lijn = exp(-min(fs, 1.0 - fs) * 26.0) + exp(-min(fd, 1.0 - fd) * 26.0);
  c += mix(uKleurA, uKleurB, 0.5 + 0.5 * sin(s * 0.6 - uT)) * lijn * uRaster * (0.7 + 0.6 * uPuls);
#endif
#ifdef PLAS
  vec2 q = vec2(s, d);
  float pm = smoothstep(0.5, 0.58, ruis(q * 1.3) * 0.7 + ruis(q * 3.1 + 7.0) * 0.3);
  float rimp = 0.5 + 0.5 * sin(length(fract(q * 0.7) - 0.5) * 38.0 - uT * 7.0);
  vec3 refl = mix(uKleurA, uKleurB, 0.5 + 0.5 * sin(s * 1.7 + d * 2.3 + uT * 0.3));
  c = mix(c, refl * (0.3 + 0.5 * uMid) * (0.75 + 0.5 * rimp * uPuls), pm * uPlas) + refl * 0.06 * uPlas;
#endif
#ifdef STROOM
  c += uKleurA * exp(-abs(d) * 12.0) * uStroom * (0.2 + 1.8 * pk + 0.5 * uBas);
#endif
#ifdef STREPEN
  float zone = smoothstep(uH2 - 0.24, uH2 - 0.22, abs(d));
  c = mix(c, uKleurB * step(0.5, fract((s + abs(d)) * 2.2)) + 0.015, zone * uStrepen);
#endif
#ifdef RIMPEL
  float rr = min(min(length(vec2(s - uLen * 0.17, d)), length(vec2(s - uLen * 0.5, d))), length(vec2(s - uLen * 0.83, d)));
  c += draai(uKleurA, rr * 0.8 - uT * 0.7) * pow(0.5 + 0.5 * sin(rr * 7.0 - uB * 3.14159), 6.0) * uRimpel;
#endif
#ifdef VLEK
  c += uKleurA * smoothstep(0.58 - 0.14 * uBas, 0.78, ruis(vec2(s, d) * 1.6 + vec2(uT * 0.05, 0.0))) * uVlek;
#endif
#ifdef GLANS
  float ndv = abs(normalize(vV).y);
  c += draai(uKleurB, ndv * 6.0 + uT * 0.4 + s * 0.3) * pow(1.0 - ndv, 3.0) * uGlans;
#endif
  gl_FragColor = vec4(c * uDonker + uFlits, 1.0);
}`;
  // deeltjes: alle beweging in de shader (zuivere functie van de tijd), langs de gang via dezelfde (s, d) -> (x, z) als de kern
  const DEELTJE_V = `attribute vec4 aZ;
uniform vec4 uL;
uniform float uT, uPuls, uE, uLen, uH, uSnel, uMaat, uSchaal, uModus, uZwaai, uKnip;
uniform vec3 uKleurA, uKleurB;
varying vec3 vKleur; varying float vA;
vec2 gangXZ(float s, float d) {
  float L1 = uL.x, L2 = uL.y, h = uL.w, K = 1.5707963;
  if (s <= L1 - h) return vec2(d, s);
  if (s <= L1 + h) { float a = (s - L1 + h) / (2.0 * h) * K, r = h - d; return vec2(h - r * cos(a), L1 - h + r * sin(a)); }
  if (s <= L1 + L2 - h) return vec2(s - L1, L1 - d);
  if (s <= L1 + L2 + h) { float a = (s - L1 - L2 + h) / (2.0 * h) * K, r = d + h; return vec2(L2 - h + r * sin(a), L1 + h - r * cos(a)); }
  return vec2(L2 + d, s - L2);
}
void main() {
  float s = aZ.x, d = aZ.y, y = aZ.z, f = aZ.w, ph = f * 6.2832;
  if (uModus < 0.5) {
    s += uZwaai * sin(uT * (0.31 + f * 0.4) + ph);
    d += uZwaai * 0.6 * sin(uT * (0.43 + f * 0.3) + ph * 1.7);
    y += uZwaai * 0.5 * sin(uT * (0.37 + f * 0.5) + ph * 2.3);
  } else if (uModus < 1.5) {
    s = mod(s + uSnel * (0.6 + 0.8 * f) * uT, uLen);
    d += 0.06 * sin(uT * 0.7 + ph); y += 0.06 * sin(uT * 0.9 + ph * 1.3);
  } else if (uModus < 2.5) {
    y = uH - mod(f * uH + uSnel * (0.7 + 0.6 * f) * uT, uH);
  } else {
    y = mod(y + uSnel * (0.6 + 0.8 * f) * uT, uH);
    d += 0.08 * sin(uT * 1.3 + ph);
  }
  s = clamp(s, 0.0, uLen); d = clamp(d, 0.05 - uL.w, uL.w - 0.05); y = clamp(y, 0.02, uH - 0.02);
  vec2 p = gangXZ(s, d);
  vec4 mv = modelViewMatrix * vec4(p.x, y, p.y, 1.0);
  gl_Position = projectionMatrix * mv;
  float a = smoothstep(0.0, 0.8, s) * (1.0 - smoothstep(uLen - 0.8, uLen, s));
  if (uModus > 1.5) a *= smoothstep(0.0, 0.3, y) * (1.0 - smoothstep(uH - 0.3, uH, y));
  a *= mix(1.0, 0.5 + 0.5 * sin(uT * (2.0 + f * 5.0) + ph * 3.0), uKnip);
  vA = a * (0.45 + 0.55 * uE + 0.9 * uPuls * step(0.6, f));
  vKleur = mix(uKleurA, uKleurB, fract(f * 7.31));
  gl_PointSize = clamp(uMaat * uSchaal / max(0.3, -mv.z), 1.0, 40.0);
}`;
  const DEELTJE_F = `uniform float uVorm;
varying vec3 vKleur; varying float vA;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float a = uVorm > 0.5 ? step(max(abs(q.x), abs(q.y)), 0.42) : exp(-dot(q, q) * 22.0);
  gl_FragColor = vec4(vKleur * vA * a, 1.0);
}`;
  // glans (instanced ringen/poorten/ribben): nep-omgevingsbanden op de spiegelrichting + randgloed; uIris laat de kleur met de kijkhoek draaien
  const GLANS_V = `varying vec3 vN; varying vec3 vV; varying vec3 vW; varying vec3 vC;
void main() {
  vec4 p = vec4(position, 1.0); vec3 n = normal;
#ifdef USE_INSTANCING
  p = instanceMatrix * p; n = mat3(instanceMatrix) * n;
#endif
#ifdef USE_INSTANCING_COLOR
  vC = instanceColor;
#else
  vC = vec3(1.0);
#endif
  vec4 w = modelMatrix * p;
  vW = w.xyz; vN = mat3(modelMatrix) * n; vV = cameraPosition - w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
  const GLANS_F = `uniform vec3 uKleur;
uniform float uIris, uT, uPuls;
varying vec3 vN; varying vec3 vV; varying vec3 vW; varying vec3 vC;
${DRAAI}
void main() {
  vec3 n = normalize(vN), v = normalize(vV);
  float ndv = abs(dot(n, v)), fr = pow(1.0 - ndv, 2.0);
  vec3 r = reflect(-v, n);
  float band = 0.5 + 0.5 * sin(r.y * 9.0 + r.x * 3.0 + r.z * 2.0 + uT * 0.8);
  vec3 c = uKleur * (0.2 + 0.8 * band * band) * (0.55 + 0.9 * fr);
  c = mix(c, draai(c + 0.05, ndv * 6.0 + uT * 0.6 + vW.y * 1.5), uIris);
  gl_FragColor = vec4(c * vC + vC * fr * uPuls * 0.35, 1.0);
}`;
  const U = v => ({ value: v });
  const v3 = a => (Array.isArray(a) ? new THREE.Vector3(a[0], a[1], a[2]) : new THREE.Vector3(0.3, 0.59, 0.11));
  function muurMat(map, o) {
    o = o || {}; scherp(map, o.zwaar);
    const m = new THREE.ShaderMaterial({ vertexShader: MUUR_V, fragmentShader: MUUR_F, defines: {}, uniforms: {
      map: U(map || WIT), uTint: U(kl(o.tint)), uGloeiW: U(v3(o.gloeiW)), uGloeiKleur: U(kl(o.gloeiKleur == null ? 0x000000 : o.gloeiKleur)),
      uScanKleur: U(kl(o.scanKleur == null ? 0x000000 : o.scanKleur)), uRandKleur: U(kl(o.randKleur == null ? 0x000000 : o.randKleur)),
      uT: U(0), uB: U(0), uPuls: U(0), uBas: U(0), uFlits: U(0), uDonker: U(1), uLen: U(10.4), uH: U(2.6),
      uGloei: U(0), uDrempel: U(o.drempel == null ? 0.6 : o.drempel), uSat: U(o.sat || 0), uScan: U(o.scan == null ? 1 : o.scan), uScanTel: U(2),
      uRand: U(o.rand || 0), uGolf: U(o.golf || 0), uGolfT: U(0), uIris: U(o.iris || 0), uWarp: U(o.warp || 0) } });
    if (o.golf) m.defines.GOLF = 1;
    if (o.iris) m.defines.IRIS = 1;
    if (o.warp) m.defines.WARP = 1;
    return m;
  }
  function vlakMat(map, o) {
    o = o || {};
    const m = new THREE.ShaderMaterial({ vertexShader: VLAK_V, fragmentShader: VLAK_F, defines: {}, uniforms: {
      map: U(map || WIT), uTint: U(kl(o.tint)), uScanKleur: U(kl(o.scanKleur == null ? 0x000000 : o.scanKleur)),
      uKleurA: U(kl(o.kleurA == null ? 0xffffff : o.kleurA)), uKleurB: U(kl(o.kleurB == null ? 0xffffff : o.kleurB)), uPad: U(new THREE.Vector2(...(o.pad || [10.4, 2]))),
      uT: U(0), uB: U(0), uPuls: U(0), uBas: U(0), uMid: U(0), uFlits: U(0), uDonker: U(1), uLen: U(10.4), uH2: U(1),
      uScan: U(o.scan == null ? 1 : o.scan), uScanTel: U(2), uRaster: U(o.raster || 0), uGap: U(o.gap || 0.5), uPlas: U(o.plas || 0),
      uStroom: U(o.stroom || 0), uStrepen: U(o.strepen || 0), uRimpel: U(o.rimpel || 0), uVlek: U(o.vlek || 0), uGlans: U(o.glans || 0) } });
    const D = m.defines;
    if (map && o.pad) D.PADUV = 1; else if (map) D.KAART = 1;
    for (const [k, n] of [['raster', 'RASTER'], ['plas', 'PLAS'], ['stroom', 'STROOM'], ['strepen', 'STREPEN'], ['rimpel', 'RIMPEL'], ['vlek', 'VLEK'], ['glans', 'GLANS']]) if (o[k]) D[n] = 1;
    return m;
  }
  function glansMat(kleur, iris) {
    return new THREE.ShaderMaterial({ vertexShader: GLANS_V, fragmentShader: GLANS_F, uniforms: { uKleur: U(kl(kleur)), uIris: U(iris || 0), uT: U(0), uPuls: U(0) } });
  }
  // gedeelde uniforms van één beeld (klok, tel, muziek, dimmer, flits); x = hoe hard de stroboscoop van de drop hier doorkomt
  function zet(m, maat, b, k, x) {
    const u = m.uniforms;
    if (u.uT) u.uT.value = k.t;
    if (u.uGolfT) u.uGolfT.value = (k.t * 0.6) % TAU;
    if (u.uB) u.uB.value = k.b;
    if (u.uPuls) u.uPuls.value = b.pulse;
    if (u.uBas) u.uBas.value = b.bas;
    if (u.uMid) u.uMid.value = b.mid;
    if (u.uE) u.uE.value = b.energy;
    if (u.uDonker) u.uDonker.value = k.dim * (1 + 0.25 * k.drop);
    if (u.uFlits) u.uFlits.value = k.flits * (x || 0);
    if (u.uScanTel) u.uScanTel.value = k.tel;
    if (u.uLen) u.uLen.value = maat.LEN;
    if (u.uH) u.uH.value = maat.H;
    if (u.uH2) u.uH2.value = maat.h;
  }

  // --- bouwstenen ---
  // (clone() neemt userData mee, dus ook doolhofHouden van VLAK/TORUS: dan gooide de kern deze kopie nooit weg, ~3 geometrieën per bezoek)
  const bolGeo = (maat, geo) => maat.deel('geo:' + geo.uuid, () => { const c = geo.clone(); c.userData = {}; c.boundingSphere = maat.bol.clone(); return c; });
  function inst(g, maat, geo, mat, n) {  // InstancedMesh met de omhullende bol van de gang (anders culling op het verkeerde bolletje)
    const m = new THREE.InstancedMesh(bolGeo(maat, geo), mat, Math.max(1, n));
    m.count = n;
    for (let i = 0; i < n; i++) m.setColorAt(i, ZWART);
    g.add(m); return m;
  }
  const plekken = (maat, aantallen) => {  // booglengtes, gelijk verdeeld over de rechte stukken (been 1, dwarsstuk, been 3)
    const r = [];
    maat.dwars.forEach(([a, b], i) => { const n = aantallen[i] || 0; for (let j = 0; j < n; j++) r.push(a + (j + 0.5) * (b - a) / n); });
    return r;
  };
  function wandPlek(maat, kant, s, y, inzet) {  // punt op de muur (kant -1 = muur aan de min-kant, +1 = plus-kant), naar binnen gericht
    const p = maat.xz(s, kant * (maat.h - (inzet == null ? 0.02 : inzet)));
    return { x: p.x, y, z: p.z, ry: Math.atan2(-kant * p.dz, kant * p.dx), dx: p.dx, dz: p.dz };
  }
  const plaatMat = houd(new THREE.MeshBasicMaterial({ color: 0x020203 }));
  // korte tekst (∞): op het doek van neonSign is één teken maar 12% van de breedte (een stipje op een lege zwarte plaat);
  // hier een eigen doek waar het teken het vlak vult
  function neonKort(tekst, kleur, w) {
    const tex = canvasTexture(256, 128, (g2, cw, ch) => {
      g2.font = '800 250px "Helvetica Neue", Arial, sans-serif';
      const f = Math.min(1, (cw - 36) / g2.measureText(tekst).width);
      g2.font = `800 ${Math.floor(250 * f)}px "Helvetica Neue", Arial, sans-serif`;
      g2.textAlign = 'center'; g2.textBaseline = 'middle';
      g2.shadowColor = kleur; g2.shadowBlur = 20; g2.strokeStyle = kleur; g2.lineWidth = 8; g2.strokeText(tekst, cw / 2, ch / 2 + 6);
      g2.shadowBlur = 6; g2.strokeStyle = '#ffffff'; g2.lineWidth = 2.5; g2.strokeText(tekst, cw / 2, ch / 2 + 6);
    });
    return new THREE.Mesh(new THREE.PlaneGeometry(w, w / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  }
  function bord(g, maat, tekst, kleur, plek, w, plaat) {  // neonwoord (gedeeld materiaal: flikkeren gebeurt in beide helften tegelijk)
    const kort = [...tekst].length <= 2, wk = Math.min(w, 0.7);  // ∞: compact bord van hooguit 0,7 m
    const bron = maat.deel('bord|' + tekst + '|' + kleur + '|' + w, () => kort ? neonKort(tekst, kleur, wk) : neonSign(tekst, kleur, w, w / 4));
    const m = bron.parent ? bron.clone() : bron;
    m.scale.set(1, 1, 1); m.position.set(plek.x, plek.y, plek.z); m.rotation.set(0, plek.ry, 0); maat.recht(m);
    g.add(m);
    if (plaat && maat.zwaar < 2) {  // donkere plaat erachter: additief neon verdwijnt anders op een felle schildering (tv: draw call besparen)
      const p = add(g, VLAK, plaatMat, [plek.x - Math.sin(plek.ry) * 0.01, plek.y, plek.z - Math.cos(plek.ry) * 0.01], kort ? [wk * 1.02, wk * 0.5, 1] : [w * 1.04, w * 0.3, 1]);
      p.rotation.y = plek.ry;
    }
    return m;
  }
  const kijkPlek = (maat, i, y) => Object.assign({}, maat.kijk[i], { y });
  // neonflikkering: af en toe een haperende buis (vast patroon op de klok)
  const hapert = (now, i) => { const n = Math.floor(now * 9); return hash(n * 0.37 + i * 13.1) < 0.05 && hash(n * 0.11 + i) < 0.6; };

  // looplicht (zoals de acid-gang): elke tel vertrekt bij de begindeur een lichtpakket dat in k.tel tellen naar de einddeur rent
  function pakket(c, s, maat, b, k, tinten, basis) {
    const x = b.pos - k.tel * s / maat.LEN, n = Math.floor(x), h = Math.exp(-(x - n) * 6) * k.en * (0.7 + 0.6 * b.pulse) * k.dim * (1 + 0.5 * k.drop), hot = h * h * 0.4;
    c.setHSL(tinten[((n % tinten.length) + tinten.length) % tinten.length], 1, 0.55).multiplyScalar(h);
    const bs = (0.7 + 0.6 * b.bas) * k.dim;
    c.r += basis.r * bs + hot + k.flits; c.g += basis.g * bs + hot + k.flits; c.b += basis.b * bs + hot + k.flits;
    return c;
  }
  // ledstrips langs de vloerranden (en eventueel de plafondranden), op lijnen met verstek: ze volgen de muren ook door de bochten
  function leds(g, maat, o) {
    o = o || {};
    const stap = [0.27, 0.33, 0.42][maat.zwaar], plek = [], ys = o.plafond ? [0.02, maat.H - 0.02] : [0.02];
    for (const y of ys) for (const kant of [-1, 1]) {
      const L = maat.lijn(kant * (maat.h - 0.07)), n = Math.floor(L.len / stap);
      for (let i = 0; i < n; i++) { const p = L.op((i + 0.5) * L.len / n); plek.push({ x: p.x, y, z: p.z, yaw: Math.atan2(p.dx, p.dz), s: maat.st(p.x, p.z)[0], kant, i }); }
    }
    const m = inst(g, maat, BOX, maat.deel('ledMat', () => plus()), plek.length);
    plek.forEach((p, i) => { mtx.compose(vp.set(p.x, p.y, p.z), qa.setFromAxisAngle(AY, p.yaw), vs.set(0.05, 0.025, 0.17)); m.setMatrixAt(i, mtx); });
    return { kleur(fn) { for (let i = 0; i < plek.length; i++) m.setColorAt(i, fn(plek[i], ca.setRGB(0, 0, 0))); m.instanceColor.needsUpdate = true; } };
  }
  // dwarsringen: twee staanders en een ligger (o.dik/o.diep/o.rand voor poorten), met zachte gloed op muren en plafond
  const haloMat = maat => maat.deel('haloMat', () => plus(haloTex, THREE.DoubleSide));
  function ringen(g, maat, lijst, o) {
    o = o || {};
    const n = lijst.length, dik = o.dik || 0.035, diep = o.diep || 0.05, rand = o.rand || dik / 2 + 0.005;
    const buis = inst(g, maat, BOX, o.mat || maat.deel('ringMat', () => plus()), n * 3);
    const halo = o.halo !== false && maat.zwaar < 2 ? inst(g, maat, VLAK, haloMat(maat), n * 3) : null;
    lijst.forEach((s, r) => {
      const p = maat.xz(s, 0), yaw = Math.atan2(p.dx, p.dz);
      qa.setFromAxisAngle(AY, yaw);
      [[-(maat.h - rand), maat.H / 2, dik, maat.H - 0.01], [maat.h - rand, maat.H / 2, dik, maat.H - 0.01], [0, maat.H - rand, maat.B - 0.01, dik]].forEach(([d, y, sx, sy], j) => {
        const q = maat.xz(s, d); mtx.compose(vp.set(q.x, y, q.z), qa, vs.set(sx, sy, diep)); buis.setMatrixAt(r * 3 + j, mtx);
      });
      if (!halo) return;
      for (const kant of [-1, 1]) {  // gloed op de muren (1,1 m langs de gang, naar binnen)
        const w = wandPlek(maat, kant, s, maat.H / 2, 0.012);
        mtx.compose(vp.set(w.x, w.y, w.z), qb.setFromAxisAngle(AY, w.ry), vs.set(1.1, maat.H - 0.04, 1)); halo.setMatrixAt(r * 3 + (kant < 0 ? 0 : 1), mtx);
      }
      qb.setFromEuler(eul.set(Math.PI / 2, yaw, Math.PI / 2, 'YXZ'));  // plafond: naar beneden, strook langs de gang
      mtx.compose(vp.set(p.x, maat.H - 0.012, p.z), qb, vs.set(1.1, maat.B - 0.04, 1)); halo.setMatrixAt(r * 3 + 2, mtx);
    });
    return { lijst, kleur(fn, haloK) {
      lijst.forEach((s, r) => {
        const c = fn(r, s, ca.setRGB(0, 0, 0));
        for (let j = 0; j < 3; j++) buis.setColorAt(r * 3 + j, c);
        if (halo) { cb.copy(c).multiplyScalar(haloK == null ? 0.5 : haloK); for (let j = 0; j < 3; j++) halo.setColorAt(r * 3 + j, cb); }
      });
      buis.instanceColor.needsUpdate = true; if (halo) halo.instanceColor.needsUpdate = true;
    } };
  }
  // gloeiende pijlen op de vloer langs de looplijn (lint door de bochten); springen op elke tel een halve tegel vooruit
  function pijlen(g, maat, o) {
    o = o || {};
    const t = maat.deel('pijlTex', () => {
      const tx = canvasTexture(128, 256, (c, w) => {  // twee chevrons, punt naar boven = vooruit
        c.lineCap = c.lineJoin = 'round'; c.lineWidth = 12; c.strokeStyle = '#ffffff'; c.shadowColor = '#ffffff'; c.shadowBlur = 14;
        for (const y of [40, 168]) { c.globalAlpha = 0.9; c.beginPath(); c.moveTo(w * 0.16, y + 46); c.lineTo(w * 0.5, y); c.lineTo(w * 0.84, y + 46); c.stroke(); }
      });
      tx.wrapS = tx.wrapT = THREE.RepeatWrapping; return tx;
    });
    const geo = maat.deel('pijlGeo|' + (o.breed || 0.55), () => lint(maat.pad, o.breed || 0.55, 0.9));
    const mat = maat.deel('pijlMat', () => { const m = plus(t, THREE.DoubleSide); m.color.setRGB(0, 0, 0); return m; });
    const m = new THREE.Mesh(geo, mat); m.position.y = 0.012; g.add(m);
    return { zet(b, c) {
      const bi = Math.floor(b.pos), hop = 1 - Math.pow(1 - Math.min(1, (b.pos - bi) / 0.35), 3);
      t.offset.y = -frac(((bi % 2) + hop) * 0.5); mat.color.copy(c);
    } };
  }
  function lint(pad, breed, tegel) {  // strook langs een lijn van punten, v = afgelegde weg / tegel
    const P = [], UV = [], I = [], n = pad.length; let cum = 0;
    for (let i = 0; i < n; i++) {
      const a = pad[Math.max(0, i - 1)], c = pad[Math.min(n - 1, i + 1)], dx = c.x - a.x, dz = c.z - a.z, l = Math.hypot(dx, dz) || 1;
      if (i) cum += Math.hypot(pad[i].x - pad[i - 1].x, pad[i].z - pad[i - 1].z);
      const nx = dz / l * breed / 2, nz = -dx / l * breed / 2;
      P.push(pad[i].x - nx, 0, pad[i].z - nz, pad[i].x + nx, 0, pad[i].z + nz); UV.push(0, cum / tegel, 1, cum / tegel);
      if (i) { const k = i * 2; I.push(k - 2, k, k - 1, k - 1, k, k + 1); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); geo.setIndex(I);
    geo.computeBoundingSphere(); return geo;
  }
  // deeltjes (één Points, beweging in de shader): 0 zwerm (vuurvliegjes, stof), 1 stroom (langs de gang; snel < 0 = naar de loper toe), 2 val, 3 stijg
  function deeltjes(g, maat, rnd, o) {
    const n = Math.max(1, Math.round(o.n * [1, 0.6, 0.3][maat.zwaar])), z = new Float32Array(n * 4);
    const y0 = o.y0 == null ? 0.2 : o.y0, dy = o.dy == null ? maat.H - 0.4 : o.dy;
    for (let i = 0; i < n; i++) { z[i * 4] = rnd() * maat.LEN; z[i * 4 + 1] = (rnd() * 2 - 1) * (maat.h - 0.1); z[i * 4 + 2] = y0 + rnd() * dy; z[i * 4 + 3] = rnd(); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); geo.setAttribute('aZ', new THREE.BufferAttribute(z, 4));
    geo.boundingSphere = maat.bol.clone();
    const mat = maat.deel('deeltjes|' + o.naam, () => new THREE.ShaderMaterial({ vertexShader: DEELTJE_V, fragmentShader: DEELTJE_F,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uL: U(new THREE.Vector4(maat.L1, maat.L2, maat.L3, maat.h)), uT: U(0), uPuls: U(0), uE: U(0), uLen: U(maat.LEN), uH: U(maat.H),
        uSnel: U(o.snel || 0), uMaat: U(o.maat || 0.03), uSchaal: U(600), uModus: U(o.modus || 0), uZwaai: U(o.zwaai == null ? 0.3 : o.zwaai),
        uKnip: U(o.knip || 0), uKleurA: U(kl(o.kleurA)), uKleurB: U(kl(o.kleurB == null ? o.kleurA : o.kleurB)), uVorm: U(o.vierkant ? 1 : 0) } }));
    g.add(new THREE.Points(geo, mat));
    return { mat, zet(b, k, sterkte) {
      const u = mat.uniforms, el = renderer.domElement, hgt = (el && el.height) || 720;
      u.uT.value = k.t; u.uPuls.value = b.pulse; u.uE.value = b.energy * k.dim * (sterkte == null ? 1 : sterkte);
      u.uSchaal.value = hgt / (2 * Math.tan(camera.fov * Math.PI / 360));
    } };
  }
  // nevel: platte wolkjes dwars op de gang die langzaam meedrijven (o.stijg: op vaste plekken omhoog, zoals stoom uit een rooster)
  function wolken(g, maat, rnd, o) {
    const n = maat.zwaar >= 2 ? 0 : maat.zwaar ? Math.ceil(o.n / 2) : o.n, w = [];
    for (let i = 0; i < o.n; i++) w.push({ s: o.plekken ? o.plekken[i % o.plekken.length] : rnd() * maat.LEN, d: (rnd() - 0.5) * 0.9, y: (o.y0 == null ? 1.5 : o.y0) + rnd() * (o.dy == null ? 0.8 : o.dy),
      v: (o.v || 0.12) * (0.7 + 0.6 * rnd()), spin: (rnd() - 0.5) * 0.3, sc: (o.maat || 1.6) * (0.8 + 0.4 * rnd()), f: rnd(), t: i % 3 });
    if (!n) return { zet() {} };  // (rnd wel getrokken: de reeks blijft gelijk, ook als de kwaliteit tussen de helften wisselt)
    const mat = maat.deel('wolkMat', () => new THREE.MeshBasicMaterial({ map: smokeTex[0], transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    const m = inst(g, maat, VLAK, mat, n), wk = new THREE.Color();
    return { zet(now, c, sterkte) {
      wk.copy(c);  // c is vaak het kladkleurtje ca: eerst bewaren
      for (let i = 0; i < n; i++) {
        const q = w[i]; let s = q.s, y = q.y, sc = q.sc, a;
        if (o.stijg) { const u = frac(now * q.v * 0.35 + q.f); y = 0.1 + u * (maat.H - 0.4); sc *= 0.4 + 0.8 * u; a = Math.sin(Math.PI * u); }
        else { s = frac((q.s + now * q.v) / maat.LEN) * maat.LEN; a = Math.max(0, Math.min(1, s / 1.2, (maat.LEN - s) / 1.2)); }
        const p = maat.xz(s, q.d);
        qa.setFromAxisAngle(AY, Math.atan2(p.dx, p.dz)); qb.setFromAxisAngle(AZ, q.spin * now + q.f * TAU); qa.multiply(qb);
        mtx.compose(vp.set(p.x, y, p.z), qa, vs.set(sc, sc * 0.7, 1)); m.setMatrixAt(i, mtx);
        m.setColorAt(i, ca.copy(wk).multiplyScalar(sterkte * a));
      }
      m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true;
    } };
  }
  // geometrie samenvoegen (één draw call) met ingebakken schaduw: bovenkant lichter, onderkant donker (geen lamp nodig)
  function samen(geos, kleur, licht) {
    let nv = 0; const delen = geos.map(g => (g.index ? g.toNonIndexed() : g)); for (const g of delen) nv += g.attributes.position.count;
    const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3), c = kl(kleur); let o = 0;
    for (const g of delen) {
      const p = g.attributes.position.array, nm = g.attributes.normal.array;
      pos.set(p, o * 3);
      for (let i = 0; i < g.attributes.position.count; i++) { const k = (licht == null ? 0.35 : licht) + (1 - (licht == null ? 0.35 : licht)) * (0.5 + 0.5 * nm[i * 3 + 1]); col[(o + i) * 3] = c.r * k; col[(o + i) * 3 + 1] = c.g * k; col[(o + i) * 3 + 2] = c.b * k; }
      o += g.attributes.position.count;
    }
    for (const g of geos) g.dispose(); for (const g of delen) g.dispose();
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.computeBoundingSphere(); return out;
  }
  const kleurVert = houd(new THREE.MeshBasicMaterial({ vertexColors: true }));
  // kabels die tussen haakjes doorhangen, langs de plafondranden (o.el: één gloeiende el-draad per kant, als lianen of neon)
  function kabels(g, maat, rnd, o) {
    const delen = [], el = [], gap = o.gap || 1.3;
    for (const kant of [-1, 1]) for (let j = 0; j < (o.n || 3); j++) {
      const d = kant * (maat.h - 0.06 - 0.045 * j), zak = (o.zak || 0.12) * (0.6 + 0.8 * rnd()), r = (o.dik || 0.016) * (0.7 + 0.6 * rnd()), ph = rnd() * TAU, gloei = o.el && j === 1;
      delen.push({ d, zak: gloei ? zak * 1.6 : zak, r: gloei ? 0.007 : r, ph, gloei });
    }
    const geo = maat.deel('kabels', () => {
      const donker = [], licht = [];
      for (const k of delen) {
        const L = maat.lijn(k.d), pts = [], n = Math.ceil(L.len / 0.12);
        for (let i = 0; i <= n; i++) { const t = i * L.len / n, p = L.op(t), u = frac(t / gap), span = Math.floor(t / gap); pts.push(new THREE.Vector3(p.x, maat.H - 0.03 - k.zak * 4 * u * (1 - u) * (0.8 + 0.4 * Math.sin(span * 2.1 + k.ph)), p.z)); }
        (k.gloei ? licht : donker).push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n, k.r, 5, false));
      }
      return { donker: samen(donker, o.kleur || 0x16141a, 0.3), licht: licht.length ? samen(licht, 0xffffff, 1) : null };
    });
    add(g, geo.donker, kleurVert);
    if (!geo.licht) return { zet() {} };
    const mat = maat.deel('elMat', () => plus());
    add(g, geo.licht, mat);
    return { zet(c) { mat.color.copy(c); } };
  }
  // smileys (acid): op de muren, deinen op de kick
  const smileyTex = zacht(128, 128, (c, w, h) => {
    c.translate(w / 2, h / 2); const r = 52;
    c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fillStyle = '#ffe81a'; c.shadowColor = '#ffe81a'; c.shadowBlur = 16; c.fill();
    c.shadowBlur = 0; c.strokeStyle = '#000'; c.lineWidth = 7; c.lineCap = 'round';
    c.beginPath(); for (const ex of [-0.36, 0.36]) { c.moveTo(r * (ex - 0.13), -r * 0.42); c.lineTo(r * (ex + 0.13), -r * 0.16); c.moveTo(r * (ex + 0.13), -r * 0.42); c.lineTo(r * (ex - 0.13), -r * 0.16); }
    c.moveTo(r * 0.58 * Math.cos(0.15 * Math.PI), r * 0.05 + r * 0.58 * Math.sin(0.15 * Math.PI)); c.arc(0, r * 0.05, r * 0.58, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
  });
  function smileys(g, maat, rnd, n) {
    const p = [];
    for (let i = 0; i < n; i++) { const [a, b] = maat.dwars[i % 3]; p.push({ s: a + rnd() * (b - a), kant: rnd() < 0.5 ? -1 : 1, y: 1.0 + rnd() * 1.1, sc: 0.32 + rnd() * 0.22, f: rnd() }); }
    const m = inst(g, maat, VLAK, maat.deel('smileyMat', () => plus(smileyTex)), n);
    return { zet(b, k) {
      p.forEach((q, i) => {
        const w = wandPlek(maat, q.kant, q.s, q.y, 0.015), sc = q.sc * (1 + 0.18 * b.pulse * k.en);
        mtx.compose(vp.set(w.x, w.y, w.z), qa.setFromAxisAngle(AY, w.ry), vs.set(sc, sc, 1)); m.setMatrixAt(i, mtx);
        m.setColorAt(i, ca.setRGB(1, 1, 1).multiplyScalar((0.45 + 0.7 * b.pulse) * k.dim + k.flits));
      });
      m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true;
    } };
  }

  // ======================= de stijlen =======================

  // 1. acid: de oude rode gang, opgepimpt: rode plafondlampjes, looplicht in acid-kleuren, lichtringen, vloerpijlen, smileys, 303
  doolhof.gangStijl('acid', { gewicht: 1, *maak(g, maat, rnd, zwaar) {
    const muur = maat.deel('muur', () => muurMat(wallTex, { zwaar, tint: 0x6a3034, drempel: 0.55, gloeiKleur: 0xff4020, scanKleur: 0xff2a10, randKleur: 0xff1a08, rand: 0.35 }));
    const vloer = maat.deel('vloer', () => vlakMat(null, { tint: 0x0d0808, kleurA: 0xffe01a, stroom: 0.35, scanKleur: 0xff3010 }));
    const plafond = maat.deel('plafond', () => vlakMat(null, { tint: 0x0a0405, scanKleur: 0xff2010, scan: 0.6 }));
    yield;
    const L = leds(g, maat), R = ringen(g, maat, plekken(maat, [1, 2, 1])), P = pijlen(g, maat), S = smileys(g, maat, rnd, [5, 4, 2][zwaar]);
    yield;
    const W = wolken(g, maat, rnd, { n: 6 });
    yield;
    const lampS = [1.3, 3.9, 6.5, 9.1], lamp = inst(g, maat, SPH, maat.deel('lampMat', () => plus()), 4), gloed = zwaar < 2 ? inst(g, maat, VLAK, maat.deel('gloedMat', () => plus(rondTex, THREE.DoubleSide)), 4) : null;
    lampS.forEach((s, i) => {
      const p = maat.xz(s, 0);
      mtx.compose(vp.set(p.x, maat.H - 0.07, p.z), qa.identity(), vs.set(0.06, 0.06, 0.06)); lamp.setMatrixAt(i, mtx);
      if (gloed) { mtx.compose(vp.set(p.x, maat.H - 0.012, p.z), qa.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2), vs.set(1.5, 1.5, 1)); gloed.setMatrixAt(i, mtx); }
    });
    yield;
    const B1 = bord(g, maat, kies(rnd, ['ACID HOUSE', 'GO DEEPER', 'ACID']), '#fff01f', kijkPlek(maat, 0, 1.75), 1.7, true);
    yield;
    const B2 = bord(g, maat, '303', '#39ff14', kijkPlek(maat, 1, 1.85), 1.1, true);
    yield;
    const tinten = [0.15, 0.33, 0.92, 0.02], basis = new THREE.Color(0.22, 0.02, 0.01), rood = new THREE.Color(1, 0.18, 0.1);
    return { muur, vloer, plafond, muurMaat: [5.2, maat.H], update(dt, now, b) {
      const k = stemming(b, now);
      for (const m of [muur, vloer, plafond]) zet(m, maat, b, k, 0.3);
      muur.uniforms.uGloei.value = 0.15 + 0.5 * b.pulse * k.en;
      L.kleur((p, c) => pakket(c, p.s, maat, b, k, tinten, basis));
      R.kleur((r, s, c) => pakket(c, s, maat, b, k, tinten, basis).multiplyScalar(1.4));
      P.zet(b, ca.setHSL(tinten[Math.floor(b.pos / 8) % 3], 1, 0.55).multiplyScalar((0.45 + 0.8 * b.pulse) * k.dim));
      S.zet(b, k);
      W.zet(now, ca.setRGB(1, 0.25, 0.12), (0.06 + 0.16 * b.bas + 0.08 * b.pulse) * k.dim);
      lampS.forEach((s, i) => {  // rode lampjes: kloppen op de kick, op de drop loopt er een golf langs
        const golf = k.drop ? Math.exp(-frac(b.pos - i * 0.25) * 4) : 0;
        lamp.setColorAt(i, ca.copy(rood).multiplyScalar((0.55 + 0.6 * b.pulse + golf) * k.dim + k.flits));
        if (gloed) gloed.setColorAt(i, cb.copy(rood).multiplyScalar((0.25 + 0.35 * b.pulse + 0.5 * golf) * k.dim));
      });
      lamp.instanceColor.needsUpdate = true; if (gloed) gloed.instanceColor.needsUpdate = true;
      B1.material.color.setScalar((0.75 + 0.5 * b.pulse) * (hapert(now, 1) ? 0.12 : 1));
      B2.material.color.setScalar((0.7 + 0.6 * b.bas) * (hapert(now, 2) ? 0.15 : 1));
    } };
  } });

  // 2. uv-jungle: blacklight-schildering die op de bas oplicht, violette uv-gloed langs vloer en plafond, vuurvliegjes, lianen van el-draad
  doolhof.gangStijl('uv-jungle', { gewicht: 1, *maak(g, maat, rnd, zwaar) {
    const muur = maat.deel('muur', () => muurMat(tex('uv-jungle'), { zwaar, tint: 0x6a6088, sat: 0.9, gloeiW: [0.2, 0.2, 0.2], drempel: 0.5, gloeiKleur: 0xd0b0ff, scanKleur: 0x8a40ff, randKleur: 0x6a20ff, rand: 0.45, warp: zwaar < 2 ? 0.003 : 0 }));
    const vloer = maat.deel('vloer', () => vlakMat(null, { tint: 0x08050f, kleurA: 0x7a30ff, vlek: 0.22, scanKleur: 0x9a50ff }));
    const plafond = maat.deel('plafond', () => vlakMat(tex('uv-jungle'), { pad: [12, 2.6], tint: 0x1a1430, scanKleur: 0x5020c0, scan: 0.5 }));
    yield;
    const L = leds(g, maat), K = kabels(g, maat, rnd, { n: 3, el: true, zak: 0.22, kleur: 0x0a1608, gap: 1.1 });
    yield;
    const R = ringen(g, maat, plekken(maat, [0, 2, 0]));
    yield;
    const D = deeltjes(g, maat, rnd, { naam: 'vuurvlieg', n: 150, modus: 0, kleurA: 0xd8ff40, kleurB: 0x40ffb0, maat: 0.03, knip: 1, zwaai: 0.35, y0: 0.3, dy: 2.0 });
    yield;
    const W = wolken(g, maat, rnd, { n: 5, y0: 1.5, v: 0.1, maat: 1.8 });
    yield;
    const B1 = bord(g, maat, kies(rnd, ['DEEPER', 'GO DEEPER', 'BLOODLINE']), '#39ff14', kijkPlek(maat, 0, 1.8), 1.7, true);
    yield;
    const B2 = bord(g, maat, '∞', '#ff2bd6', kijkPlek(maat, 1, 1.9), 1.0, true);
    yield;
    const tinten = [0.8, 0.9, 0.52], basis = new THREE.Color(0.09, 0.015, 0.26);
    return { muur, vloer, plafond, update(dt, now, b) {
      const k = stemming(b, now);
      for (const m of [muur, vloer, plafond]) zet(m, maat, b, k, 0.25);
      muur.uniforms.uGloei.value = (0.25 + 1.3 * b.bas + 0.6 * b.pulse) * k.en;  // blacklight-verf licht op op de bas
      muur.uniforms.uRand.value = 0.3 + 0.4 * b.bas;
      L.kleur((p, c) => pakket(c, p.s, maat, b, k, tinten, basis));
      R.kleur((r, s, c) => pakket(c, s, maat, b, k, tinten, basis).multiplyScalar(1.2), 0.6);
      K.zet(ca.setHSL(0.3 + 0.05 * Math.sin(now * 0.4), 1, 0.5).multiplyScalar((0.25 + 1.2 * b.hoog) * k.dim));
      D.zet(b, k);
      W.zet(now, ca.setRGB(0.5, 0.2, 1), (0.08 + 0.2 * b.bas + 0.1 * b.pulse) * k.dim);
      B1.material.color.setScalar((0.7 + 0.5 * b.pulse) * (hapert(now, 3) ? 0.12 : 1));
      B2.material.color.setScalar(0.6 + 0.6 * b.mid);
    } };
  } });

  // 3. bass-tempel: stenen tempelwand waarvan de speaker- en draaitafelglyphen oplichten als het lichtpakket langskomt, gouden poortjes
  // met een turquoise binnenrand die op de kick gloeit, een gloeiende goot in de stenen vloer en zwevend goudstof
  doolhof.gangStijl('bass-tempel', { gewicht: 1, *maak(g, maat, rnd, zwaar) {
    const muur = maat.deel('muur', () => muurMat(tex('bass-tempel'), { zwaar, tint: 0x8a7c66, sat: 1.0, gloeiW: [0.15, 0.15, 0.15], drempel: 0.32, gloeiKleur: 0xffe0a0, scanKleur: 0x30ffe0, randKleur: 0xffa030, rand: 0.12 }));
    const vloer = maat.deel('vloer', () => vlakMat(tex('baksteen', true), { tint: 0x4a4038, kleurA: 0x30ffe0, stroom: 1, scanKleur: 0x30ffe0 }));
    const plafond = maat.deel('plafond', () => vlakMat(tex('baksteen', true), { tint: 0x16120e, scanKleur: 0xffb040, scan: 0.4 }));
    yield;
    const poortS = plekken(maat, [1, 2, 1]);
    yield;
    const goud = maat.deel('goud', () => glansMat(0xd8a640, 0));
    yield;
    const P = ringen(g, maat, poortS, { mat: goud, dik: 0.13, diep: 0.24, halo: false });
    yield;
    const R = ringen(g, maat, poortS, { dik: 0.022, diep: 0.03, rand: 0.145 });
    yield;
    const D = deeltjes(g, maat, rnd, { naam: 'goudstof', n: 90, modus: 0, kleurA: 0xffc860, kleurB: 0xfff0c0, maat: 0.018, knip: 0.6, zwaai: 0.25 });
    yield;
    const W = wolken(g, maat, rnd, { n: 4, y0: 1.7, v: 0.07, maat: 1.6 });
    yield;
    const B1 = bord(g, maat, kies(rnd, ['BLOODLINE', 'DEEPER', 'SAMSONIGHT']), '#ffc040', kijkPlek(maat, 0, 1.8), 1.7, true);
    yield;
    const B2 = bord(g, maat, '∞', '#30ffe0', kijkPlek(maat, 1, 1.85), 0.9, true);
    yield;
    const turk = new THREE.Color(0.18, 1, 0.88);
    return { muur, vloer, plafond, vloerMaat: [1.4, 1.4], update(dt, now, b) {
      const k = stemming(b, now);
      for (const m of [muur, vloer, plafond]) zet(m, maat, b, k, 0.2);
      muur.uniforms.uGloei.value = (0.15 + 0.9 * b.pulse) * k.en;
      goud.uniforms.uT.value = k.t; goud.uniforms.uPuls.value = b.pulse;
      P.kleur(() => ca.setScalar((0.75 + 0.35 * b.pulse) * k.dim + k.flits));
      R.kleur((r, s, c) => {  // binnenrand: kick + het pakket dat langs komt
        const x = b.pos - k.tel * s / maat.LEN, h = Math.exp(-(x - Math.floor(x)) * 5);
        return c.copy(turk).multiplyScalar((0.25 + 0.6 * b.pulse + 1.2 * h * k.en) * k.dim + k.flits);
      }, 0.45);
      D.zet(b, k, 0.8);
      W.zet(now, ca.setRGB(1, 0.6, 0.25), (0.04 + 0.1 * b.bas) * k.dim);
      B1.material.color.setScalar((0.7 + 0.5 * b.pulse) * (hapert(now, 4) ? 0.15 : 1));
      B2.material.color.setScalar(0.5 + 0.8 * b.bas);
    } };
  } });

  // 4. paddenstoelen-trip: 70s-schildering die golft en door de regenboog draait, regenboogringen, kleurringen die over de vloer uitdijen, sporen
  doolhof.gangStijl('paddenstoelen', { gewicht: 1, *maak(g, maat, rnd, zwaar) {
    const muur = maat.deel('muur', () => muurMat(tex('paddenstoelen'), { zwaar, tint: 0x8a7c84, golf: 0.55, warp: zwaar < 2 ? 0.006 : 0, drempel: 0.75, gloeiKleur: 0xffffff, scanKleur: 0xff60c0, randKleur: 0xff40a0, rand: 0.15 }));
    const vloer = maat.deel('vloer', () => vlakMat(null, { tint: 0x0a0610, kleurA: 0xff40c0, rimpel: 0.75, scanKleur: 0xffa040 }));
    const plafond = maat.deel('plafond', () => vlakMat(tex('paddenstoelen'), { pad: [10.6, 2.4], tint: 0x2a2030, scanKleur: 0xff40a0, scan: 0.4 }));
    yield;
    const R = ringen(g, maat, plekken(maat, [1, 2, 1]));
    yield;
    const D = deeltjes(g, maat, rnd, { naam: 'sporen', n: 120, modus: 3, snel: 0.14, kleurA: 0xff70d0, kleurB: 0xffc040, maat: 0.03, knip: 0.5 });
    yield;
    const W = wolken(g, maat, rnd, { n: 5, y0: 1.3, v: 0.09, maat: 1.9 });
    yield;
    const B1 = bord(g, maat, kies(rnd, ['DEEPER', '∞', 'GO DEEPER']), '#ff8a1a', kijkPlek(maat, 0, 1.8), 1.6, true);
    yield;
    const B2 = bord(g, maat, kies(rnd, ['SAMSONIGHT', 'DEEP STEPPER']), '#ff3cc8', kijkPlek(maat, 1, 1.9), 1.6, true);
    return { muur, vloer, plafond, update(dt, now, b) {
      const k = stemming(b, now);
      for (const m of [muur, vloer, plafond]) zet(m, maat, b, k, 0.25);
      muur.uniforms.uGolf.value = 0.35 + 0.35 * b.mid + 0.3 * k.drop;
      R.kleur((r, s, c) => c.setHSL(frac(b.pos / 8 + r * 0.17 + s * 0.02), 1, 0.55).multiplyScalar((0.35 + 0.9 * Math.exp(-frac(b.pos - r * 0.25) * 4) * k.en) * k.dim + k.flits), 0.55);
      D.zet(b, k);
      W.zet(now, ca.setHSL(frac(now * 0.05), 0.8, 0.5), (0.06 + 0.16 * b.bas) * k.dim);
      B1.material.color.setScalar((0.7 + 0.5 * b.pulse) * (hapert(now, 5) ? 0.15 : 1));
      B2.material.color.setHSL(frac(now * 0.07), 0.6, 0.45 + 0.25 * b.pulse);
    } };
  } });

  // 5. rave-flyers: 90s folderwand, kale peertjes aan snoertjes die op de tel knipperen (loop, om en om, alles, fonkel), smileys, natte vloer
  doolhof.gangStijl('rave-flyers', { gewicht: 1, *maak(g, maat, rnd, zwaar) {
    const muur = maat.deel('muur', () => muurMat(tex('rave-flyers'), { zwaar, tint: 0x6a6460, drempel: 0.8, gloeiKleur: 0xfff0b0, scanKleur: 0xffe040, randKleur: 0xffa040, rand: 0.25 }));
    const vloer = maat.deel('vloer', () => vlakMat(null, { tint: 0x0c0b0d, plas: 0.8, kleurA: 0xffa050, kleurB: 0xff40a0, scanKleur: 0xffd040, scan: 0.6 }));
    const plafond = maat.deel('plafond', () => vlakMat(null, { tint: 0x080708, scan: 0 }));
    // peertjes in twee rijen naast de looplijn (onderkant boven 2,3 m: een lange alien loopt eronderdoor)
    yield;
    const pr = [];
    for (const kant of [-1, 1]) {
      const L = maat.lijn(kant * 0.66), n = Math.floor(L.len / 0.72);
      for (let i = 0; i < n; i++) { const p = L.op((i + 0.5) * L.len / n); pr.push({ x: p.x, z: p.z, snoer: 0.06 + rnd() * 0.1, i: pr.length, kant, s: maat.st(p.x, p.z)[0] }); }
    }
    yield;
    const peer = inst(g, maat, SPH, maat.deel('peerMat', () => plus()), pr.length);
    yield;
    const halo = zwaar < 2 ? inst(g, maat, VLAK, maat.deel('peerHalo', () => plus(rondTex, THREE.DoubleSide)), pr.length) : null;
    yield;
    const snoerGeo = maat.deel('snoeren', () => samen(pr.map(q => new THREE.CylinderGeometry(0.004, 0.004, q.snoer, 4).translate(q.x, maat.H - q.snoer / 2, q.z)), 0x111111, 0.5));
    add(g, snoerGeo, kleurVert);
    pr.forEach((q, i) => {
      mtx.compose(vp.set(q.x, maat.H - q.snoer - 0.04, q.z), qa.identity(), vs.set(0.045, 0.055, 0.045)); peer.setMatrixAt(i, mtx);
      if (halo) { const p = maat.xz(q.s, 0); mtx.compose(vp.set(q.x, maat.H - q.snoer - 0.04, q.z), qa.setFromAxisAngle(AY, Math.atan2(p.dx, p.dz)), vs.set(0.42, 0.42, 1)); halo.setMatrixAt(i, mtx); }
    });
    yield;
    const S = smileys(g, maat, rnd, [6, 5, 3][zwaar]);
    yield;
    const W = wolken(g, maat, rnd, { n: 5, y0: 1.6, v: 0.11, maat: 1.7 });
    yield;
    const B1 = bord(g, maat, kies(rnd, ['SAMSONIGHT', 'BLOODLINE']), '#fff01f', kijkPlek(maat, 0, 1.85), 1.7, true);
    yield;
    const B2 = bord(g, maat, kies(rnd, ['DEEP STEPPER', 'DEEPER', '∞']), '#ff2bd6', kijkPlek(maat, 1, 1.85), 1.6, true);
    yield;
    const warm = new THREE.Color(1, 0.62, 0.28);
    return { muur, vloer, plafond, update(dt, now, b) {
      const k = stemming(b, now);
      for (const m of [muur, vloer, plafond]) zet(m, maat, b, k, 0.6);
      muur.uniforms.uGloei.value = 0.2 + 0.6 * b.pulse;
      const modus = Math.floor(b.pos / 4) % 4, bi = Math.floor(b.pos), fase = b.pos - bi, flits = Math.exp(-fase * 5);
      pr.forEach((q, i) => {
        let aan;
        if (modus === 0) aan = flits;                                                                          // alles op de tel
        else if (modus === 1) aan = ((Math.floor(b.pos * 2) - q.i) % 4 + 4) % 4 === 0 ? Math.exp(-frac(b.pos * 2) * 3) : 0;  // looplicht
        else if (modus === 2) aan = (bi + (q.kant > 0 ? 1 : 0)) % 2 === 0 ? flits : 0;                     // om en om
        else aan = hash(q.i * 3.1 + Math.floor(b.pos * 4)) > 0.72 ? 1 : 0;                                    // fonkelen
        const h = ((0.12 + 1.3 * aan * k.en) * k.dim) + k.flits;
        peer.setColorAt(i, ca.copy(warm).multiplyScalar(h).addScalar(h * h * 0.15));
        if (halo) halo.setColorAt(i, cb.copy(warm).multiplyScalar(0.5 * h));
      });
      peer.instanceColor.needsUpdate = true; if (halo) halo.instanceColor.needsUpdate = true;
      S.zet(b, k);
      W.zet(now, ca.setRGB(1, 0.7, 0.4), (0.05 + 0.12 * b.bas) * k.dim);
      B1.material.color.setScalar((0.7 + 0.5 * b.pulse) * (hapert(now, 6) ? 0.12 : 1));
      B2.material.color.setScalar((0.65 + 0.5 * b.mid) * (hapert(now, 7) ? 0.12 : 1));
    } };
  } });

  // 6. betonbunker: brutalistisch beton met buizen en kabels, een rode noodlichtstrip waar twee zwaailichten overheen draaien,
  // kooilampjes (eentje stuk), gevarenstrepen langs de vloer; op de drop vol stroboscoop
  doolhof.gangStijl('betonbunker', { gewicht: 1, *maak(g, maat, rnd, zwaar) {
    const muur = maat.deel('muur', () => muurMat(tex('beton-bunker'), { zwaar, tint: 0x8a8888, gloeiW: [1, -0.6, -0.6], drempel: 0.3, gloeiKleur: 0xff2a18, scanKleur: 0xff1a10, randKleur: 0x501010, rand: 0.2 }));
    const vloer = maat.deel('vloer', () => vlakMat(tex('staal', true), { tint: 0x4a4848, strepen: 1, kleurB: 0xffb010, scanKleur: 0xff2010, scan: 0.7 }));
    const plafond = maat.deel('plafond', () => vlakMat(null, { tint: 0x0b0b0c, scanKleur: 0xff1010, scan: 0.3 }));
    // buizen onder het plafond langs beide muren (met bochtstukken)
    yield;
    const buisGeo = maat.deel('buizen', () => {
      const delen = [];
      for (const [d, y, r] of [[-(maat.h - 0.13), maat.H - 0.14, 0.075], [maat.h - 0.1, maat.H - 0.12, 0.05], [maat.h - 0.08, maat.H - 0.3, 0.035]]) {
        const p = maat.lijn(d).punten;
        for (let i = 0; i < 3; i++) {
          const [x0, z0] = p[i], [x1, z1] = p[i + 1], l = Math.hypot(x1 - x0, z1 - z0);
          delen.push(new THREE.CylinderGeometry(r, r, l, 10, 1, true).rotateX(Math.PI / 2).rotateY(Math.atan2(x1 - x0, z1 - z0)).translate((x0 + x1) / 2, y, (z0 + z1) / 2));
          if (i) delen.push(new THREE.SphereGeometry(r * 1.02, 10, 6).translate(x0, y, z0));
          for (let t = 0.6; t < l - 0.3; t += 1.6) delen.push(new THREE.CylinderGeometry(r * 1.25, r * 1.25, 0.05, 10).rotateX(Math.PI / 2).rotateY(Math.atan2(x1 - x0, z1 - z0)).translate(x0 + (x1 - x0) * t / l, y, z0 + (z1 - z0) * t / l));  // flenzen
        }
      }
      return samen(delen, 0x3a3836, 0.25);
    });
    add(g, buisGeo, kleurVert);
    yield;
    const K = kabels(g, maat, rnd, { n: 2, zak: 0.16, kleur: 0x121212 });
    // noodlichtstrip (stukjes van 0,4 m op 2,2 m hoogte langs beide muren) + twee zwaailichten in de bochten
    yield;
    const strip = [];
    for (const kant of [-1, 1]) { const L = maat.lijn(kant * (maat.h - 0.03)), n = Math.floor(L.len / 0.4); for (let i = 0; i < n; i++) { const p = L.op((i + 0.5) * L.len / n); strip.push({ x: p.x, z: p.z, yaw: Math.atan2(p.dx, p.dz) }); } }
    yield;
    const sm = inst(g, maat, BOX, maat.deel('stripMat', () => plus()), strip.length);
    strip.forEach((q, i) => { mtx.compose(vp.set(q.x, 2.2, q.z), qa.setFromAxisAngle(AY, q.yaw), vs.set(0.03, 0.05, 0.36)); sm.setMatrixAt(i, mtx); });
    yield;
    const zw = [maat.xz(maat.L1, 0), maat.xz(maat.L1 + maat.L2, 0)].map(p => ({ x: p.x, z: p.z }));
    yield;
    const kap = inst(g, maat, SPH, maat.deel('zwaaiMat', () => plus()), 2);
    zw.forEach((p, i) => { mtx.compose(vp.set(p.x, maat.H - 0.06, p.z), qa.identity(), vs.set(0.09, 0.07, 0.09)); kap.setMatrixAt(i, mtx); });
    // kooilampjes op de muren
    yield;
    const kooi = plekken(maat, [1, 2, 1]).map((s, i) => wandPlek(maat, i % 2 ? 1 : -1, s, 1.95, 0.06));
    yield;
    const km = inst(g, maat, BOX, maat.deel('kooiMat', () => plus()), kooi.length), stuk = Math.floor(rnd() * kooi.length);
    kooi.forEach((q, i) => { mtx.compose(vp.set(q.x, q.y, q.z), qa.setFromAxisAngle(AY, q.ry), vs.set(0.16, 0.1, 0.06)); km.setMatrixAt(i, mtx); });
    yield;
    const W = wolken(g, maat, rnd, { n: 6, y0: 1.3, v: 0.1, maat: 1.9 });
    yield;
    const B1 = bord(g, maat, kies(rnd, ['DEEPER', 'BLOODLINE']), '#ff2a20', kijkPlek(maat, 0, 1.75), 1.6, true);
    yield;
    const rood = new THREE.Color(1, 0.08, 0.04);
    return { muur, vloer, plafond, vloerMaat: [1.6, 1.6], update(dt, now, b) {
      const k = stemming(b, now), strobo = k.flits * 0.65;
      for (const m of [muur, vloer, plafond]) zet(m, maat, b, k, 0.65);
      muur.uniforms.uGloei.value = (0.3 + 0.9 * b.pulse) * k.en + 2 * k.drop;
      const hoek = now * 2.4 + k.dropTel * Math.PI / 2;  // zwaailichten draaien; op de drop een kwartslag extra per tel (na 16 tellen weer in fase)
      strip.forEach((q, i) => {
        let h = 0.18;
        for (let j = 0; j < 2; j++) { const a = Math.atan2(q.x - zw[j].x, q.z - zw[j].z), dist = Math.hypot(q.x - zw[j].x, q.z - zw[j].z); h += Math.pow(Math.max(0, Math.cos(a - hoek - j * Math.PI)), 6) * Math.exp(-dist * 0.35) * 1.6; }
        sm.setColorAt(i, ca.copy(rood).multiplyScalar(h * (0.6 + 0.6 * b.pulse) * k.dim).addScalar(strobo));
      });
      sm.instanceColor.needsUpdate = true;
      for (let j = 0; j < 2; j++) kap.setColorAt(j, ca.copy(rood).multiplyScalar((0.6 + 0.6 * Math.max(0, Math.cos(hoek * 2))) * k.dim + strobo));
      kap.instanceColor.needsUpdate = true;
      kooi.forEach((q, i) => {
        const kapot = i === stuk && hash(Math.floor(now * 7) + i) < 0.55;  // één lamp hapert
        km.setColorAt(i, ca.setRGB(1, 0.85, 0.6).multiplyScalar(kapot ? 0.05 : (0.55 + 0.3 * b.pulse) * k.dim + strobo));
      });
      km.instanceColor.needsUpdate = true;
      W.zet(now, ca.setRGB(0.7, 0.45, 0.42), (0.05 + 0.12 * b.bas + 0.4 * strobo) * k.dim);
      B1.material.color.setScalar((0.7 + 0.5 * b.pulse) * (hapert(now, 8) ? 0.1 : 1));
    } };
  } });

  // 7. kosmos-portaal: nevel op muren en plafond (draait langzaam door de kleuren), ovale portaalringen, sterren die naar je toe vliegen
  doolhof.gangStijl('kosmos', { gewicht: 1, *maak(g, maat, rnd, zwaar) {
    // de nevel is fel: tint en gloei laag (anders brandt de wand wit uit); de vloer is dezelfde nevel, donker, met glans (lopen door de ruimte)
    const muur = maat.deel('muur', () => muurMat(tex('kosmos'), { zwaar, tint: 0x5c5c7c, warp: zwaar < 2 ? 0.008 : 0, drempel: 0.7, gloeiKleur: 0xa0b4ff, scanKleur: 0x6080ff, randKleur: 0x3040b0, rand: 0.2 }));
    const vloer = maat.deel('vloer', () => vlakMat(tex('kosmos'), { pad: [10.6, 2.6], tint: 0x262640, glans: 0.35, kleurB: 0x6a40ff, scanKleur: 0x5060ff, scan: 0.6 }));
    const plafond = maat.deel('plafond', () => vlakMat(tex('kosmos'), { pad: [10.6, 2.6], tint: 0x6a6a90, scanKleur: 0x8040ff, scan: 0.5 }));
    yield;
    const ps = plekken(maat, [1, 2, 1]), ring = inst(g, maat, TORUS, maat.deel('portaalMat', () => plus()), ps.length);
    yield;
    const D = deeltjes(g, maat, rnd, { naam: 'sterren', n: 220, modus: 1, snel: -2.2, kleurA: 0xffffff, kleurB: 0x9ab8ff, maat: 0.022, knip: 0.3 });
    yield;
    const W = wolken(g, maat, rnd, { n: 3, y0: 1.2, v: 0.06, maat: 2.0 });
    yield;
    const B1 = bord(g, maat, kies(rnd, ['SAMSONIGHT', 'DEEPER', 'DEEP STEPPER']), '#7fe8ff', kijkPlek(maat, 0, 1.8), 1.7, true);
    yield;
    const B2 = bord(g, maat, '∞', '#b46cff', kijkPlek(maat, 1, 1.85), 1.0, true);
    return { muur, vloer, plafond, update(dt, now, b) {
      const k = stemming(b, now);
      for (const m of [muur, vloer, plafond]) zet(m, maat, b, k, 0.3);
      muur.uniforms.uGloei.value = (0.08 + 0.5 * b.bas) * k.en;
      ps.forEach((s, i) => {  // portaal: ovaal (top 2,57 m), deint op de kick, kleur draait per ring
        const p = maat.xz(s, 0), sc = 1 + 0.012 * b.pulse;
        mtx.compose(vp.set(p.x, 1.29, p.z), qa.setFromAxisAngle(AY, Math.atan2(p.dx, p.dz) + 0.15 * Math.sin(now * 0.5 + i)), vs.set(0.9 * sc, 1.24 * sc, 1)); ring.setMatrixAt(i, mtx);
        const x = b.pos - k.tel * s / maat.LEN, h = Math.exp(-(x - Math.floor(x)) * 4);
        ring.setColorAt(i, ca.setHSL(frac(0.6 + now * 0.03 + i * 0.12), 0.9, 0.55).multiplyScalar((0.45 + 1.2 * h * k.en + 0.4 * b.pulse) * k.dim + k.flits));
      });
      ring.instanceMatrix.needsUpdate = true; ring.instanceColor.needsUpdate = true;
      D.zet(b, k, 1.2 + 0.8 * k.drop);  // (vaste snelheid: een andere snelheid zou alle sterren laten verspringen)
      W.zet(now, ca.setRGB(0.4, 0.3, 1), (0.04 + 0.12 * b.bas) * k.dim);
      B1.material.color.setScalar((0.7 + 0.5 * b.pulse) * (hapert(now, 9) ? 0.15 : 1));
      B2.material.color.setScalar(0.5 + 0.7 * b.bas);
    } };
  } });

  // 8. neonsteeg: natte steeg vol neonbuizen (flikkeren), spiegelende plassen die op de kick rimpelen, stoom uit twee roosters, motregen
  doolhof.gangStijl('neonsteeg', { gewicht: 1, *maak(g, maat, rnd, zwaar) {
    const muur = maat.deel('muur', () => muurMat(tex('neonsteeg'), { zwaar, tint: 0x7a7a8a, sat: 0.6, gloeiW: [0.25, 0.25, 0.25], drempel: 0.55, gloeiKleur: 0xffffff, scanKleur: 0xff2a90, randKleur: 0x2a60ff, rand: 0.1 }));
    const vloer = maat.deel('vloer', () => vlakMat(null, { tint: 0x0b0b10, plas: 1, kleurA: 0xff2a90, kleurB: 0x20e0ff, scanKleur: 0x20e0ff, scan: 0.5 }));
    const plafond = maat.deel('plafond', () => vlakMat(null, { tint: 0x07070a, scan: 0 }));
    yield;
    const K = kabels(g, maat, rnd, { n: 2, zak: 0.14, kleur: 0x101014 });
    // neonbuizen op de muren (staand en liggend) + hun weerschijn op de natte vloer
    yield;
    const kl3 = [new THREE.Color(1, 0.16, 0.56), new THREE.Color(0.12, 0.88, 1), new THREE.Color(0.7, 0.3, 1), new THREE.Color(1, 0.85, 0.2)], buis = [];
    for (let i = 0; i < [10, 8, 6][zwaar]; i++) {
      const [a, b] = maat.dwars[i % 3], s = a + rnd() * (b - a), kant = rnd() < 0.5 ? -1 : 1, staand = rnd() < 0.5;
      buis.push({ s, kant, staand, y: staand ? 0.9 + rnd() * 0.8 : 1.4 + rnd() * 0.9, l: staand ? 0.5 + rnd() * 0.7 : 0.4 + rnd() * 0.8, c: Math.floor(rnd() * 4), i });
    }
    yield;
    const bm = inst(g, maat, BOX, maat.deel('neonMat', () => plus()), buis.length), rm = inst(g, maat, VLAK, maat.deel('weerMat', () => plus(rondTex, THREE.DoubleSide)), buis.length);
    buis.forEach((q, i) => {
      const w = wandPlek(maat, q.kant, q.s, q.y, 0.04);
      mtx.compose(vp.set(w.x, w.y, w.z), qa.setFromAxisAngle(AY, w.ry), q.staand ? vs.set(0.035, q.l, 0.035) : vs.set(q.l, 0.035, 0.035)); bm.setMatrixAt(i, mtx);
      const v = wandPlek(maat, q.kant, q.s, 0.006, 0.42);  // weerschijn: langgerekte vlek op de vloer, van de muur naar het midden
      qa.setFromEuler(eul.set(-Math.PI / 2, v.ry, 0, 'YXZ'));
      mtx.compose(vp.set(v.x, 0.006, v.z), qa, vs.set(q.staand ? 0.3 : q.l * 1.2, 0.8, 1)); rm.setMatrixAt(i, mtx);
    });
    yield;
    const roost = [2.0, 7.6], rooster = inst(g, maat, BOX, maat.deel('roosterMat', () => new THREE.MeshBasicMaterial({ color: 0x1a1a1e })), roost.length);
    roost.forEach((s, i) => { const p = maat.xz(s, 0.15); mtx.compose(vp.set(p.x, 0.004, p.z), qa.setFromAxisAngle(AY, Math.atan2(p.dx, p.dz)), vs.set(0.5, 0.008, 0.4)); rooster.setMatrixAt(i, mtx); rooster.setColorAt(i, ca.setRGB(1, 1, 1)); });
    yield;
    const ST = wolken(g, maat, rnd, { n: 6, stijg: true, plekken: roost, v: 0.5, maat: 0.9 });
    yield;
    const D = deeltjes(g, maat, rnd, { naam: 'regen', n: 110, modus: 2, snel: 2.4, kleurA: 0x9ac8ff, kleurB: 0xffffff, maat: 0.012 });
    yield;
    const B1 = bord(g, maat, kies(rnd, ['SAMSONIGHT', 'DEEPER']), '#ff2a90', kijkPlek(maat, 0, 1.8), 1.7, true);
    yield;
    const B2 = bord(g, maat, kies(rnd, ['DEEP STEPPER', 'BLOODLINE']), '#20e0ff', kijkPlek(maat, 1, 1.85), 1.7, true);
    return { muur, vloer, plafond, update(dt, now, b) {
      const k = stemming(b, now);
      for (const m of [muur, vloer, plafond]) zet(m, maat, b, k, 0.35);
      muur.uniforms.uGloei.value = (0.3 + 0.7 * b.mid + 0.4 * b.pulse) * k.en * (hapert(now, 20) ? 0.3 : 1);
      buis.forEach((q, i) => {
        const h = (hapert(now, 30 + i) ? 0.08 : 0.75 + 0.5 * (q.i % 2 ? b.pulse : b.mid)) * k.dim + k.flits;
        bm.setColorAt(i, ca.copy(kl3[q.c]).multiplyScalar(h)); rm.setColorAt(i, cb.copy(kl3[q.c]).multiplyScalar(0.22 * h));
      });
      bm.instanceColor.needsUpdate = true; rm.instanceColor.needsUpdate = true;
      ST.zet(now, ca.setRGB(0.75, 0.7, 0.9), (0.1 + 0.12 * b.bas) * k.dim);
      D.zet(b, k, 0.55);
      B1.material.color.setScalar((0.75 + 0.45 * b.pulse) * (hapert(now, 10) ? 0.1 : 1));
      B2.material.color.setScalar((0.7 + 0.5 * b.mid) * (hapert(now, 11) ? 0.1 : 1));
    } };
  } });

  // 9. slijmhol: biomechanische wand die ademt en groen opgloeit op de bas, slijmdruppels van het plafond met spatjes, ribben, bellen, groene grondmist
  doolhof.gangStijl('slijmhol', { gewicht: 1, *maak(g, maat, rnd, zwaar) {
    const muur = maat.deel('muur', () => muurMat(tex('slijmhol'), { zwaar, tint: 0x7a8670, gloeiW: [-0.6, 1.2, -0.6], drempel: 0.15, gloeiKleur: 0x80ff50, warp: 0.01, scanKleur: 0x40ff30, randKleur: 0x30ff40, rand: 0.3 }));
    const vloer = maat.deel('vloer', () => vlakMat(null, { tint: 0x050904, vlek: 0.55, kleurA: 0x40ff30, scanKleur: 0x60ff20, scan: 0.6 }));
    const plafond = maat.deel('plafond', () => vlakMat(tex('slijmhol'), { pad: [10.6, 2.4], tint: 0x3a4436, scanKleur: 0x40ff30, scan: 0.4 }));
    yield;
    const rib = maat.deel('rib', () => glansMat(0x2a3424, 0.15));
    yield;
    const R = ringen(g, maat, plekken(maat, [1, 2, 1]), { mat: rib, dik: 0.1, diep: 0.14, halo: false });
    yield;
    const G = ringen(g, maat, plekken(maat, [1, 2, 1]), { dik: 0.018, diep: 0.02, rand: 0.11 });
    // druppels: groeien aan het plafond, vallen, spatten (zuiver op de klok)
    yield;
    const dr = [];
    for (let i = 0; i < [12, 8, 5][zwaar]; i++) { const [a, b] = maat.dwars[i % 3]; dr.push({ s: a + rnd() * (b - a), d: (rnd() * 2 - 1) * 0.75, P: 4 + rnd() * 3, f: rnd() }); }
    yield;
    const dm = inst(g, maat, SPH, maat.deel('drupMat', () => plus()), dr.length), sp = inst(g, maat, VLAK, maat.deel('spatMat', () => plus(rondTex, THREE.DoubleSide)), dr.length);
    yield;
    const D = deeltjes(g, maat, rnd, { naam: 'bellen', n: 80, modus: 3, snel: 0.2, kleurA: 0x60ff40, kleurB: 0xb0ff60, maat: 0.035, knip: 0.4 });
    yield;
    const W = wolken(g, maat, rnd, { n: 6, y0: 0.15, dy: 0.35, v: 0.08, maat: 1.6 });
    yield;
    const B1 = bord(g, maat, kies(rnd, ['∞', 'DEEPER', 'BLOODLINE']), '#5aff2a', kijkPlek(maat, 0, 1.85), 1.4, true);
    yield;
    const groen = new THREE.Color(0.35, 1, 0.2), val = Math.sqrt((maat.H - 0.15) / 4.9);
    return { muur, vloer, plafond, update(dt, now, b) {
      const k = stemming(b, now);
      for (const m of [muur, vloer, plafond]) zet(m, maat, b, k, 0.25);
      muur.uniforms.uGloei.value = (0.2 + 1.6 * b.bas + 0.4 * b.pulse) * k.en;
      muur.uniforms.uWarp.value = 0.006 + 0.008 * b.bas;
      rib.uniforms.uT.value = k.t; rib.uniforms.uPuls.value = b.pulse;
      R.kleur(() => ca.setScalar((0.8 + 0.3 * b.bas) * k.dim));
      G.kleur((r, s, c) => c.copy(groen).multiplyScalar((0.2 + 1.2 * b.bas * Math.exp(-frac(b.pos - r * 0.25) * 3)) * k.dim + k.flits), 0.5);
      dr.forEach((q, i) => {
        const t = frac(now / q.P + q.f) * q.P, p = maat.xz(q.s, q.d);
        let y = maat.H - 0.04, sy = 0.03, sz = 0, a = 0, sc = 0;
        if (t < q.P - val - 0.6) { sy = 0.02 + 0.07 * t / (q.P - val - 0.6); y = maat.H - 0.01 - sy; }          // groeien
        else if (t < q.P - 0.6) { const u = t - (q.P - val - 0.6); y = maat.H - 0.1 - 4.9 * u * u; sy = 0.05; }     // vallen
        else { sy = 0; const u = (t - (q.P - 0.6)) / 0.6; sc = 0.1 + 0.5 * u; a = 1 - u; }                              // spat
        mtx.compose(vp.set(p.x, Math.max(0.03, y), p.z), qa.identity(), vs.set(sy ? 0.03 : 0, sy, sy ? 0.03 : 0)); dm.setMatrixAt(i, mtx);
        dm.setColorAt(i, ca.copy(groen).multiplyScalar((0.6 + 0.6 * b.bas) * k.dim));
        mtx.compose(vp.set(p.x, 0.008, p.z), qa.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2), vs.set(sc, sc, 1)); sp.setMatrixAt(i, mtx);
        sp.setColorAt(i, cb.copy(groen).multiplyScalar(a * 0.8 * k.dim));
      });
      dm.instanceMatrix.needsUpdate = sp.instanceMatrix.needsUpdate = true; dm.instanceColor.needsUpdate = sp.instanceColor.needsUpdate = true;
      D.zet(b, k);
      W.zet(now, ca.setRGB(0.3, 1, 0.25), (0.05 + 0.14 * b.bas) * k.dim);
      B1.material.color.setScalar((0.6 + 0.7 * b.bas) * (hapert(now, 12) ? 0.15 : 1));
    } };
  } });

  // 10. chroom: vloeibaar chroom dat met de kijkhoek van kleur verschiet, spiegelende ringen, glinsters, een zwarte spiegelvloer met olieglans
  doolhof.gangStijl('chroom', { gewicht: 1, *maak(g, maat, rnd, zwaar) {
    const muur = maat.deel('muur', () => muurMat(tex('chroom'), { zwaar, tint: 0x9a9aa4, iris: 0.55, drempel: 0.7, gloeiKleur: 0xffffff, scanKleur: 0xc0d0ff, randKleur: 0x8060ff, rand: 0.1 }));
    const vloer = maat.deel('vloer', () => vlakMat(tex('chroom'), { pad: [7.2, 2.2], tint: 0x34343e, glans: 0.7, kleurB: 0xa0c0ff, scanKleur: 0xc0c0ff, scan: 0.5 }));  // vloeibaar chroom, donkerder dan de wand
    const plafond = maat.deel('plafond', () => vlakMat(tex('chroom'), { pad: [10.6, 2.4], tint: 0x44444c, scanKleur: 0xffffff, scan: 0.3 }));
    yield;
    const spiegel = maat.deel('spiegel', () => glansMat(0xd8dce8, 0.75));
    yield;
    const R = ringen(g, maat, plekken(maat, [1, 2, 1]), { mat: spiegel, dik: 0.07, diep: 0.1, halo: false });
    yield;
    const H = ringen(g, maat, plekken(maat, [1, 2, 1]), { dik: 0.015, diep: 0.012, rand: 0.083 });
    yield;
    const D = deeltjes(g, maat, rnd, { naam: 'glinster', n: 160, modus: 0, kleurA: 0xffffff, kleurB: 0xc0e0ff, maat: 0.014, knip: 1, zwaai: 0.15 });
    yield;
    const L = leds(g, maat);
    yield;
    const B1 = bord(g, maat, kies(rnd, ['DEEP STEPPER', 'SAMSONIGHT']), '#e0f4ff', kijkPlek(maat, 0, 1.8), 1.7, true);
    yield;
    const B2 = bord(g, maat, '∞', '#ff7ae0', kijkPlek(maat, 1, 1.85), 1.0, true);
    yield;
    const tinten = [0.55, 0.8, 0.95], basis = new THREE.Color(0.06, 0.06, 0.09);
    return { muur, vloer, plafond, update(dt, now, b) {
      const k = stemming(b, now);
      for (const m of [muur, vloer, plafond]) zet(m, maat, b, k, 0.35);
      muur.uniforms.uGloei.value = (0.1 + 0.5 * b.hoog + 0.4 * b.pulse) * k.en;
      muur.uniforms.uIris.value = 0.45 + 0.35 * b.mid;
      spiegel.uniforms.uT.value = k.t; spiegel.uniforms.uPuls.value = b.pulse;
      R.kleur(() => ca.setScalar((0.8 + 0.4 * b.pulse) * k.dim + k.flits));
      H.kleur((r, s, c) => c.setHSL(frac(now * 0.08 + r * 0.2), 0.8, 0.6).multiplyScalar((0.3 + 1.0 * Math.exp(-frac(b.pos - r * 0.25) * 4)) * k.en * k.dim + k.flits), 0.5);
      D.zet(b, k, 0.5 + b.hoog);
      L.kleur((p, c) => pakket(c, p.s, maat, b, k, tinten, basis));
      B1.material.color.setScalar((0.7 + 0.5 * b.pulse) * (hapert(now, 13) ? 0.12 : 1));
      B2.material.color.setScalar(0.5 + 0.7 * b.mid);
    } };
  } });

  // 11. arcade: 80s synthwave, een neonraster op vloer en plafond dat op de tel naar je toe schuift, een gestreepte zon, pixels die opstijgen
  const zonTex = zacht(256, 256, (c, w, h) => {
    const gr = c.createLinearGradient(0, 20, 0, h - 20);
    gr.addColorStop(0, '#fff26a'); gr.addColorStop(0.5, '#ff7a3c'); gr.addColorStop(1, '#ff1fa8');
    c.save(); c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 20, 0, TAU); c.clip();
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 7; i++) { const y = h * 0.52 + i * i * 2.4 + i * 10; c.fillRect(0, y, w, 3 + i * 1.6); }
    c.restore();
    c.globalCompositeOperation = 'destination-over'; c.shadowColor = '#ff2fb0'; c.shadowBlur = 24;
    c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 22, 0, TAU); c.fillStyle = 'rgba(255,40,160,0.25)'; c.fill();
  });
  doolhof.gangStijl('arcade', { gewicht: 1, *maak(g, maat, rnd, zwaar) {
    const muur = maat.deel('muur', () => muurMat(tex('arcade'), { zwaar, tint: 0x7a7088, sat: 0.6, gloeiW: [0.2, 0.2, 0.2], drempel: 0.55, gloeiKleur: 0xffffff, scanKleur: 0xff20d0, randKleur: 0xff20c0, rand: 0.35 }));
    const vloer = maat.deel('vloer', () => vlakMat(null, { tint: 0x05020a, raster: 1, gap: 0.5, kleurA: 0xff20d0, kleurB: 0x20e0ff, scanKleur: 0xff40e0, scan: 0.6 }));
    const plafond = maat.deel('plafond', () => vlakMat(null, { tint: 0x030107, raster: 0.55, gap: 0.5, kleurA: 0x20e0ff, kleurB: 0xb040ff, scan: 0.3, scanKleur: 0x20e0ff }));
    yield;
    const L = leds(g, maat, { plafond: zwaar < 2 });
    yield;
    const zon = add(g, VLAK, maat.deel('zonMat', () => plus(zonTex)), [maat.kijk[0].x, 1.45, maat.kijk[0].z - 0.01], [1.5, 1.5, 1]);
    zon.rotation.y = maat.kijk[0].ry;
    yield;
    const D = deeltjes(g, maat, rnd, { naam: 'pixels', n: 110, modus: 3, snel: 0.25, kleurA: 0xff30d0, kleurB: 0x30f0ff, maat: 0.045, vierkant: true, knip: 0.3 });
    yield;
    const B1 = bord(g, maat, kies(rnd, ['SAMSONIGHT', 'DEEP STEPPER']), '#ff3ce0', kijkPlek(maat, 0, 2.3), 1.5);
    yield;
    const B2 = bord(g, maat, kies(rnd, ['GO DEEPER', 'DEEPER', 'BLOODLINE']), '#30f0ff', kijkPlek(maat, 1, 1.85), 1.7, true);
    yield;
    const tinten = [0.85, 0.52, 0.75], basis = new THREE.Color(0.12, 0.02, 0.2);
    return { muur, vloer, plafond, update(dt, now, b) {
      const k = stemming(b, now);
      for (const m of [muur, vloer, plafond]) zet(m, maat, b, k, 0.35);
      muur.uniforms.uGloei.value = (0.15 + 0.7 * b.pulse) * k.en;
      vloer.uniforms.uRaster.value = (0.8 + 0.6 * b.bas) * (1 + k.drop);
      L.kleur((p, c) => pakket(c, p.s, maat, b, k, tinten, basis));
      zon.material.color.setScalar((0.6 + 0.6 * b.bas) * k.dim + 0.3 * k.drop);
      D.zet(b, k);
      B1.material.color.setScalar((0.7 + 0.5 * b.pulse) * (hapert(now, 14) ? 0.12 : 1));
      B2.material.color.setScalar(0.6 + 0.6 * b.mid);
    } };
  } });

  // 12. laserraster: stalen gang met gevarenstrepen, laserstralen dwars door de gang die op de maat op en neer zwiepen en kantelen
  // (kleur per maat, op de drop allemaal aan en sneller), stippen waar ze de muur raken, nevel om de stralen te zien
  doolhof.gangStijl('laserraster', { gewicht: 1, *maak(g, maat, rnd, zwaar) {
    const muur = maat.deel('muur', () => muurMat(tex('staal', true), { zwaar, tint: 0x5a5e66, gloeiW: [0.4, 0.3, -0.6], drempel: 0.25, gloeiKleur: 0xffc040, scanKleur: 0xff1030, randKleur: 0xff0830, rand: 0.25 }));
    const vloer = maat.deel('vloer', () => vlakMat(tex('staal', true), { tint: 0x2a2c30, strepen: 1, kleurB: 0xffb000, scanKleur: 0xff1030, scan: 0.7 }));
    const plafond = maat.deel('plafond', () => vlakMat(null, { tint: 0x060608, scan: 0.3, scanKleur: 0xff1030 }));
    yield;
    const L = leds(g, maat);
    yield;
    const st = []; maat.dwars.forEach(([a, b], i) => { const n = [2, 3, 2][i]; for (let j = 0; j < n; j++) st.push({ s: a + (j + 0.5) * (b - a) / n, f: rnd(), f2: rnd(), j: st.length }); });
    yield;
    const kern = inst(g, maat, BOX, maat.deel('laserMat', () => plus()), st.length);
    yield;
    const gloed = zwaar < 2 ? inst(g, maat, BOX, maat.deel('laserGloed', () => plus()), st.length) : null;
    yield;
    const stip = inst(g, maat, VLAK, maat.deel('stipMat', () => plus(rondTex, THREE.DoubleSide)), st.length * 2);
    yield;
    const W = wolken(g, maat, rnd, { n: 7, y0: 0.9, dy: 1.3, v: 0.12, maat: 2.0 });
    yield;
    const B1 = bord(g, maat, kies(rnd, ['GO DEEPER', 'DEEPER', 'BLOODLINE']), '#ff2040', kijkPlek(maat, 0, 1.8), 1.7, true);
    yield;
    const tinten = [0.0, 0.33, 0.6, 0.85], basis = new THREE.Color(0.18, 0.0, 0.03), kleuren = [0xff1030, 0x20ff40, 0x2060ff, 0xff20e0].map(c => new THREE.Color(c));
    yield;
    const as = new THREE.Vector3();
    return { muur, vloer, plafond, vloerMaat: [1.6, 1.6], muurMaat: [1.8, 1.8], update(dt, now, b) {
      const k = stemming(b, now);
      for (const m of [muur, vloer, plafond]) zet(m, maat, b, k, 0.5);
      muur.uniforms.uGloei.value = (0.1 + 0.4 * b.pulse) * k.en;
      L.kleur((p, c) => pakket(c, p.s, maat, b, k, tinten, basis));
      const fase = b.pos + k.dropTel, maatNr = Math.floor(b.pos / 4);  // op de drop dubbel zo snel (dropTel loopt mee)
      st.forEach((q, i) => {
        const p = maat.xz(q.s, 0), yaw = Math.atan2(p.dx, p.dz);
        const y = 1.3 + 0.95 * Math.sin(TAU * (fase / 8 + q.f));                  // op en neer
        let kant = 0.42 * Math.sin(TAU * (fase / 4 + q.f2));                         // kantelen om de looprichting
        const ruimte = Math.min(y - 0.03, maat.H - 0.03 - y) / maat.h; kant = Math.max(-Math.atan(ruimte), Math.min(Math.atan(ruimte), kant));
        const len = maat.B / Math.cos(kant) - 0.02;
        qa.setFromAxisAngle(AY, yaw); qb.setFromAxisAngle(as.set(0, 0, 1), kant); qa.multiply(qb);
        mtx.compose(vp.set(p.x, y, p.z), qa, vs.set(len, 0.012, 0.012)); kern.setMatrixAt(i, mtx);
        if (gloed) { mtx.compose(vp.set(p.x, y, p.z), qa, vs.set(len, 0.05, 0.05)); gloed.setMatrixAt(i, mtx); }
        for (const z of [-1, 1]) {  // stip waar de straal de muur raakt
          const w = wandPlek(maat, z, q.s, y + z * maat.h * Math.tan(kant), 0.008);
          mtx.compose(vp.set(w.x, w.y, w.z), qb.setFromAxisAngle(AY, w.ry), vs.set(0.16, 0.16, 1)); stip.setMatrixAt(i * 2 + (z < 0 ? 0 : 1), mtx);
        }
        const aan = k.drop > 0 || (q.j + maatNr) % 3 !== 0 ? 1 : 0;                               // buiten de drop een derde uit, wisselt per maat
        const c = ca.copy(kleuren[(maatNr + q.j) % 4]).multiplyScalar(aan * (0.9 + 0.6 * b.pulse) * k.en * k.dim + k.flits);
        kern.setColorAt(i, c);
        if (gloed) gloed.setColorAt(i, cb.copy(c).multiplyScalar(0.18));
        stip.setColorAt(i * 2, cb.copy(c).multiplyScalar(0.8)); stip.setColorAt(i * 2 + 1, cb);
      });
      for (const m of [kern, gloed, stip]) if (m) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
      W.zet(now, ca.setRGB(0.55, 0.55, 0.65), (0.07 + 0.12 * b.bas) * k.dim);
      B1.material.color.setScalar((0.7 + 0.5 * b.pulse) * (hapert(now, 15) ? 0.1 : 1));
    } };
  } });

  // muurschilderingen alvast laden: ~30 s nadat de club staat één per seconde (de showregie gaat in de break meteen de gang in,
  // dan moet de schildering er al zijn), en anders zodra het doolhof voor het eerst begint
  const TE_LADEN = ['uv-jungle', 'bass-tempel', 'paddenstoelen', 'rave-flyers', 'beton-bunker', 'kosmos', 'neonsteeg', 'slijmhol', 'chroom', 'arcade', 'baksteen*', 'staal*'];
  let laadVanaf = null, laadI = 0;
  const laadEen = () => { const n = TE_LADEN[laadI++]; tex(n.replace('*', ''), n.endsWith('*')); };
  clubHooks.push((dt, now) => {
    if (laadI >= TE_LADEN.length) return;
    if (doolhof.toestand && doolhof.toestand()) { while (laadI < TE_LADEN.length) laadEen(); return; }
    if (laadVanaf == null) { if (typeof LAAD === 'undefined' || LAAD.klaar >= LAAD.totaal) laadVanaf = now + 30; return; }
    if (now >= laadVanaf) { laadEen(); laadVanaf = now + 1; }
  });
})();

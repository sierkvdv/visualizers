// --- De lift: een overgang tussen twee doolhofkamers, naast de S-gangen (doolhof/kern.js kiest ~1 op 3, nooit twee keer achter elkaar) ---
// Gevoel: de lift van de A'DAM Toren. De loper loopt vanuit kamer A een sas in, de liftdeuren gaan open, hij stapt in en de camera komt
// mee (over zijn schouder naar de voorhoek, kijkt terug), de deuren sluiten op de tel, de cabine trekt op en veert, de schacht schiet langs
// het raam (omhoog = alles schiet omlaag), de leveldisplay telt rollend mee (LVL -07 -> LVL 23), remt af, veert na, de camera staat weer
// achter de loper, de voordeuren gaan open: in het sas hangt het nieuwe level, daarachter kamer B. doolhof.level = het level van nu.
// Muziek (doolhof.show): deuren dicht en vertrek op de tel, opbouw = de lift versnelt, drop tijdens de rit = lichtexplosie (alles wit-heet,
// schok, sneller), break = trager en gedimd. Ledplafond/-wanden wisselen per 4 maten van patroon (zoals led.js).
// Onzichtbare wissel: met de deuren dicht zet de kern loper en camera van de lift achter kamer A naar dezelfde plek in de lift vóór kamer B.
// Beide helften delen ALLE geometrie, materialen en de toestand (ov.L): ze zijn op elk moment gelijk. Tijdens de rit (deuren dicht) zijn de
// kamers zelf onzichtbaar (kern: liftVerstop), dus de schacht hoeft niets af te schermen.
// Variatie (zaad per rit, assen gecombineerd): cabine (glasbuis, spiegel, kooi, draad, capsule, messing, led, kristal) x uitzicht (beton,
// ringen, ruimte, stad, water, lava, data, synth, wolken) x deur (schuif, tele, luik, rol, harmonica, iris) x palet (vast of uit het zaad)
// x richting x afstand 1-40 levels x levelhoogte x topsnelheid x ledpatronen x camerabewegingen x displaykleur.
// Uitzicht = één raycast-shader op een doos rond de cabine: virtuele wanden, cilinders, vlakken en sterren op hun echte afstand (parallax
// klopt, geen deeltjes-meshes); de snelheid veegt alles verticaal uit.
// Kern-contract: doolhof.lift.plan(van) -> L (op ov.L), bouw(parent, frame, ov) -> generator die de helft (Group) teruggeeft, stap(L, dt, info),
// instap(L, camPos, camLook, half), cam(L, half, uitP, uitL) -> fov, licht(L, half, i, lamp), magWissel(L), info().
// Test: doolhof.lift({ cabine, uitzicht, deur, richting: 1|-1, levels, kamer }) start het doolhof met een lift na de eerste kamer;
// doolhof.volgendeOvergang = 'lift' | 'gang' (volgende overgang die gebouwd wordt), doolhof.liftKeus = {...} (vaste keuzes voor de
// volgende lift), doolhof.liftInfo(), doolhof.level.
(function () {
  'use strict';
  const doolhof = window.doolhof = window.doolhof || {};
  if (typeof THREE === 'undefined' || typeof renderer === 'undefined' || typeof clubHooks === 'undefined') return;

  // ---------- maten: frame van een helft begint bij de kamerdeur (0,0) en loopt langs +z: sas, spleet, cabine, spleet, sas ----------
  const GW = 2.0, GH = 2.6, LV = 1.5, SG = 0.1, ZL = 0.1, CAM_ACHTER = 0.4, OOG = 1.7;
  const glad = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const eas = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
  const reeks = zaad => { let s = zaad >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const houd = x => { (x.userData = x.userData || {}).doolhofHouden = true; return x; };
  const f = v => ({ value: v });

  // ---------- 5 x 7 lettertype (display en de levelnummers in de schacht): 0-9, '-', L, V, spatie, pijl omhoog/omlaag ----------
  const GLYF = {
    0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'], 1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
    2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'], 3: ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
    4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'], 5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
    6: ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'], 7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
    8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'], 9: ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
    10: ['.....', '.....', '.....', '#####', '.....', '.....', '.....'], 11: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
    12: ['#...#', '#...#', '#...#', '.#.#.', '.#.#.', '..#..', '..#..'], 13: ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
    14: ['..#..', '.###.', '#####', '..#..', '..#..', '..#..', '..#..'], 15: ['..#..', '..#..', '..#..', '..#..', '#####', '.###.', '..#..'],
  };
  const G_MIN = 10, G_L = 11, G_V = 12, G_LEEG = 13, G_OP = 14, G_NEER = 15;
  const glyfTex = houd((() => {
    const d = new Uint8Array(80 * 7 * 4);
    for (let g = 0; g < 16; g++) GLYF[g].forEach((rij, r) => { for (let c = 0; c < 5; c++) { const i = (r * 80 + g * 5 + c) * 4, v = rij[c] === '#' ? 255 : 0; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; } });
    const t = new THREE.DataTexture(d, 80, 7, THREE.RGBAFormat);
    t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
    return t;
  })());

  // ---------- gedeelde uniforms (één update per beeld voor alle liften) ----------
  const LU = { tijd: f(0), tel: f(0), puls: f(0), energie: f(0), bas: f(0), mid: f(0), hoog: f(0), flits: f(0), blackout: f(0), opbouw: f(0),
    stand: f(0), showMix: f(0.15), snit: f(0), zwaar: f(0), glyfTex: f(glyfTex),
    k0: f(new THREE.Color(0xff0080)), k1: f(new THREE.Color(0x00e5ff)), k2: f(new THREE.Color(0x7a00ff)) };

  // ---------- GLSL (RawShaderMaterial: één programma per soort, lampen tellen niet mee) ----------
  const GL2 = !!(renderer.capabilities && renderer.capabilities.isWebGL2);
  const PREC = 'precision highp float;\nprecision highp int;\n';
  const V_KOP = PREC + (GL2 ? '#define attribute in\n#define varying out\n' : '') + 'uniform mat4 projectionMatrix, modelViewMatrix;\nattribute vec3 position;\n';
  const F_KOP = PREC + (GL2 ? '#define varying in\n#define texture2D texture\nout highp vec4 pc_fragColor;\n#define gl_FragColor pc_fragColor\n' : '');
  const VERT_UV = V_KOP + 'attribute vec2 uv;\nvarying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }\n';
  // de schacht: positie in eigen ruimte + camera in eigen ruimte (de schacht heeft alleen een verschuiving, geen draaiing of schaal)
  const VERT_UIT = V_KOP + 'uniform mat4 modelMatrix;\nuniform vec3 cameraPosition;\nvarying vec3 vP, vC;\nvoid main() { vP = position; vC = cameraPosition - modelMatrix[3].xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }\n';
  const KOP = F_KOP + `
uniform float tijd, tel, puls, energie, bas, mid, hoog, flits, blackout, opbouw, stand, showMix, snit, zwaar;
uniform float rit, snel, explosie, helder, zaad, cabW, cabD, cabH, levelH, van, basis, soort, rolRicht;
uniform vec3 k0, k1, k2, pa, pb, pc;
uniform sampler2D glyfTex;
vec3 A, B, C;
float h11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 h22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float ruis(vec2 p) { vec2 i = floor(p), q = fract(p); q = q * q * (3.0 - 2.0 * q);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), q.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), q.x), q.y); }
float fbm(vec2 p) { float v = 0.5 * ruis(p); p = p * 2.03 + 17.1; v += 0.25 * ruis(p); p = p * 2.01 + 9.3; v += 0.125 * ruis(p); return v / 0.875; }
vec3 pal3(float t) { t = fract(t) * 3.0; return t < 1.0 ? mix(A, B, t) : t < 2.0 ? mix(B, C, t - 1.0) : mix(C, A, t - 2.0); }
float lijnAfst(float v, float sp) { return (0.5 - abs(fract(v / sp) - 0.5)) * sp; }  // afstand (m) tot de dichtstbijzijnde lijn van een raster
vec3 palK(float i) { i = mod(floor(i), 3.0); return i < 0.5 ? A : i < 1.5 ? B : C; }
void paletZet() { A = mix(pa, k0, showMix); B = mix(pb, k1, showMix); C = mix(pc, k2, showMix); }
float glyf(float g, vec2 c) {
  if (c.x < 0.0 || c.x >= 5.0 || c.y < 0.0 || c.y >= 7.0) return 0.0;
  return texture2D(glyfTex, vec2((g * 5.0 + floor(c.x) + 0.5) / 80.0, (floor(c.y) + 0.5) / 7.0)).r;
}
`;

  // --- het uitzicht: raycast vanuit de camera door de doos rond de cabine ---
  const F_UIT = KOP + `
varying vec3 vP, vC;
float VB, TMIN;
float vlakT(float o, float d, float b) { float s = d >= 0.0 ? 1.0 : -1.0; return (s * b - o) / (s * max(abs(d), 1e-4)); }
float cil(vec3 ro, vec3 rd, float R) { float a = max(dot(rd.xz, rd.xz), 1e-6), b = dot(ro.xz, rd.xz), c = dot(ro.xz, ro.xz) - R * R; return (-b + sqrt(max(b * b - a * c, 0.0))) / a; }
// getal (teken + 2 cijfers) op een wand: q = meters vanaf het midden, h = hoogte
float getal(float n, vec2 q, float h) {
  float cw = h * 0.75, x = q.x / cw + 1.5, cel = floor(x);
  if (cel < 0.0 || cel > 2.0 || abs(q.y) > h * 0.5) return 0.0;
  float a = abs(n), g = cel < 0.5 ? (n < -0.5 ? 10.0 : 13.0) : cel < 1.5 ? floor(mod(a / 10.0 + 0.001, 10.0)) : floor(mod(a + 0.5, 10.0));
  return glyf(g, vec2((x - cel) * 6.0 - 0.5, (0.5 - q.y / h) * 7.0));
}
// punten op een cilinder (sterren, bubbels, vonken, koraal): één per cel, verticaal uitgeveegd met de snelheid; ring = bubbel
vec3 punten(vec3 ro, vec3 rd, float R, float c, float Yoff, float dicht, float gr, vec3 kl, float zs, float ring) {
  float t = cil(ro, rd, R);
  if (t < TMIN) return vec3(0.0);
  vec3 p = ro + rd * t;
  float u = atan(p.z, p.x) * R, Y = p.y + Yoff, cy = max(c, VB * 3.0);
  vec2 g = vec2(u / c, Y / cy), id = floor(g), q = fract(g) - 0.5, o = h22(id + zs) - 0.5;
  float aan = step(1.0 - dicht, h21(id * 1.31 + zs * 3.7));
  vec2 d = vec2((q.x - o.x * 0.6) * c, (q.y - o.y * 0.6) * cy);
  d.y = max(0.0, abs(d.y) - VB * 0.5);
  float r = gr * (0.5 + h21(id + 7.7 + zs)), l = length(d);
  float s = ring > 0.5 ? exp(-pow((l - r) / (r * 0.28 + 0.004), 2.0)) * 0.8 + 0.25 * exp(-l * l / (r * r * 0.08)) : exp(-l * l / (r * r));
  float tw = 0.65 + 0.35 * sin(tijd * (1.5 + 4.0 * h21(id + 3.3)) + 6.2831 * h21(id + 9.1));
  return kl * aan * s * tw * (r / (r + VB * 0.5)) * exp(-abs(p.y - ro.y) * 0.01);
}
// --- 0 beton: betonschacht met lichtbanden, levelplaten met dorpel, gevaarstreep en nummer, geleiderails ---
vec3 sBeton(vec3 ro, vec3 rd) {
  float bx = cabW * 0.5 + 0.85, bz = cabD * 0.5 + 0.6;
  float tx = vlakT(ro.x, rd.x, bx), tz = vlakT(ro.z, rd.z, bz), zij = step(tx, tz), t = min(tx, tz);
  vec3 p = ro + rd * t;
  float u = zij > 0.5 ? p.z * sign(p.x) : -p.x * sign(p.z), Y = p.y + rit;
  float n = fbm(vec2(u * 1.4 + zij * 13.0, Y * 0.7) + zaad);
  vec3 col = vec3(0.05, 0.048, 0.056) * (0.45 + 1.0 * n);
  float dn = abs(Y - 1.25 * floor(Y / 1.25 + 0.5));
  col *= 1.0 - 0.45 * (1.0 - smoothstep(0.0, 0.012 + VB * 0.25, dn));
  float j = floor((Y + 0.4) / levelH), rel = Y - j * levelH;
  if (rel < 0.0) col = vec3(0.022, 0.021, 0.025) * (0.6 + 0.8 * n);
  col += vec3(0.3) * (1.0 - smoothstep(0.0, 0.02 + VB * 0.4, abs(rel))) / (1.0 + VB * 6.0);
  float streep = step(0.0, rel) * step(rel, 0.13) * step(0.5, fract((u + Y) * 3.0));
  col = mix(col, vec3(0.32, 0.24, 0.02), streep * 0.8 / (1.0 + VB * 4.0));
  float nr = getal(van + j, vec2(u, rel - 1.3), 0.62) * zij;
  col = mix(col, vec3(0.42, 0.42, 0.4) + A * 0.1, nr * 0.85 / (1.0 + VB * 3.0));
  float rail = zij * (1.0 - smoothstep(0.035, 0.05, abs(abs(u) - 0.55)));
  float beugel = zij * step(abs(abs(u) - 0.55), 0.1) * (1.0 - smoothstep(0.03, 0.05 + VB * 0.5, abs(Y - 1.1 * floor(Y / 1.1 + 0.5))));
  col = mix(col, vec3(0.1, 0.1, 0.11), rail) + vec3(0.18) * beugel / (1.0 + VB * 4.0);
  float hb = levelH * 0.5, Yb = Y - levelH * 0.25, k = floor(Yb / hb + 0.5), db = abs(Yb - k * hb), w = 0.03 + VB * 0.5;
  float band = (1.0 - smoothstep(w, w + 0.02, db)) * (0.05 / (0.05 + VB)) * 1.4 + exp(-db * 3.5) * 0.12;
  col += pal3(k * 0.27 + floor(tel / 4.0) * 0.33) * band * (0.8 + 0.6 * puls);
  col += A * 0.1 * exp(-max(0.0, abs(p.y - cabH * 0.5) - cabH * 0.5) * 0.9) * (0.6 + 0.4 * puls);
  return col * exp(-abs(p.y - ro.y) * 0.035);
}
// --- 1 ringen: segmenten van lichtringen om de cabine, verre ringen erachter (trager in beeld) ---
vec3 sRingen(vec3 ro, vec3 rd) {
  float R1 = cabW * 0.5 + 1.1, sp = max(1.1, levelH * 0.34);
  float t = cil(ro, rd, R1); vec3 p = ro + rd * t; float Y = p.y + rit, a = atan(p.z, p.x);
  float id = floor(Y / sp + 0.5), dy = abs(Y - id * sp), w = 0.045 + VB * 0.5;
  float boog = step(0.18, fract(a / 6.2831853 * 3.0 + h11(id * 1.7 + zaad) + tijd * 0.08 * (h11(id + 4.0) - 0.5)));
  float jacht = 0.35 + 0.9 * pow(fract(tel * 0.5 - id * 0.125), 4.0);
  vec3 col = pal3(id * 0.19 + floor(tel / 8.0) * 0.21) * ((1.0 - smoothstep(w, w + 0.025, dy)) * 1.6 * (0.05 / (0.05 + VB)) + exp(-dy * 3.0) * 0.16) * boog * jacht;
  float t2 = cil(ro, rd, 13.0); vec3 p2 = ro + rd * t2; float Y2 = p2.y + rit, a2 = atan(p2.z, p2.x);
  float id2 = floor(Y2 / 3.6 + 0.5), dy2 = abs(Y2 - id2 * 3.6);
  col += pal3(id2 * 0.31 + 0.5) * ((1.0 - smoothstep(0.08 + VB * 0.5, 0.2 + VB * 0.5, dy2)) * 0.35 + exp(-dy2 * 1.2) * 0.06) * exp(-abs(p2.y - ro.y) * 0.03);
  col += C * 0.06 * fbm(vec2(a2 * 2.0, Y2 * 0.08) + zaad);
  return col * exp(-abs(p.y - ro.y) * 0.02);
}
// --- 2 ruimte: nevel, een planeet ver weg, sterren op drie afstanden ---
vec3 sRuimte(vec3 ro, vec3 rd) {
  float az = atan(rd.z, rd.x), el = asin(clamp(rd.y, -1.0, 1.0));
  vec2 q = vec2(az * 1.3, el * 1.6 - rit * 0.0015);
  float n = fbm(q * 1.4 + zaad), n2 = fbm(q * 2.7 + zaad * 1.7 + 3.0);
  vec3 col = A * pow(n, 3.0) * 0.5 + C * pow(n2, 3.0) * 0.4 + B * 0.015;
  vec3 cp = normalize(vec3(cos(zaad * 3.1), 0.2 * sin(zaad * 1.7), sin(zaad * 3.1))) * 420.0; cp.y -= rit;
  vec3 oc = ro - cp; float b = dot(oc, rd), c = dot(oc, oc) - 22500.0, hh = b * b - c;
  if (hh > 0.0 && -b > 0.0) {
    vec3 nn = normalize(ro + rd * (-b - sqrt(hh)) - cp);
    float lt = max(0.0, dot(nn, normalize(vec3(-0.6, 0.5, 0.4)))), band = fbm(vec2(nn.y * 6.0, atan(nn.z, nn.x) * 1.5) + zaad);
    col = mix(B, A, band) * (0.03 + 0.45 * lt) * 0.6 + C * pow(1.0 - max(0.0, dot(nn, -rd)), 3.0) * 0.7;
  }
  col += punten(ro, rd, 70.0, 7.0, rit, 0.45, 0.16, vec3(0.9, 0.92, 1.0), 1.0, 0.0);
  col += punten(ro, rd, 20.0, 2.6, rit, 0.35, 0.055, mix(vec3(1.0), B, 0.35), 2.0, 0.0);
  if (zwaar < 1.5) col += punten(ro, rd, 6.0, 1.1, rit, 0.28, 0.022, mix(vec3(1.0), A, 0.5), 3.0, 0.0);
  return col;
}
// --- 3 stad: glazen lift langs een toren, de stad bij nacht (twee rijen gebouwen, ramen, daklichten, maan) ---
vec4 gebouwen(vec3 ro, vec3 rd, float R, float bw, float H0, float zs) {
  float t = cil(ro, rd, R); vec3 p = ro + rd * t; float Y = p.y + H0, u = atan(p.z, p.x) * R;
  float bid = floor(u / bw), fx = fract(u / bw);
  float hb = 18.0 + 170.0 * pow(h11(bid * 1.37 + zs), 2.5);
  if (Y < 0.0 || Y > hb || fx < 0.1 || fx > 0.9) return vec4(0.0);
  vec2 rw = vec2(u / 2.4, Y / 3.4), ri = floor(rw), rf = fract(rw);
  float raam = step(0.18, rf.x) * step(rf.x, 0.82) * step(0.25, rf.y) * step(rf.y, 0.8);
  float aan = step(0.58, h21(ri + bid * 7.1 + zs)) * (0.75 + 0.25 * sin(tijd * 0.7 + h21(ri) * 40.0));
  vec3 rk = mix(vec3(1.0, 0.72, 0.4), mix(vec3(0.55, 0.75, 1.0), B, 0.5), step(0.6, h21(ri * 1.9 + bid)));
  vec3 c = vec3(0.012, 0.012, 0.02) + rk * raam * aan * 0.5;
  c += vec3(1.0, 0.08, 0.04) * (1.0 - smoothstep(0.0, 0.8, hb - Y)) * step(abs(fx - 0.5), 0.05) * step(0.5, fract(tijd * 0.7 + h11(bid)));
  return vec4(c, 1.0);
}
vec3 sStad(vec3 ro, vec3 rd) {
  float H0 = basis + rit, el = rd.y, hor = -atan((H0 + ro.y) / 900.0);
  vec3 col = mix(vec3(0.03, 0.012, 0.05) + C * 0.05, vec3(0.002, 0.003, 0.012), clamp((el - hor) * 2.5 + 0.1, 0.0, 1.0));
  col += A * 0.3 * exp(-abs(el - hor) * 14.0);
  vec3 md = normalize(vec3(cos(zaad * 2.3), 0.35, sin(zaad * 2.3)));
  float m = dot(rd, md);
  col += vec3(0.9, 0.9, 0.8) * smoothstep(0.9993, 0.9996, m) * 0.8 + vec3(0.3, 0.3, 0.45) * pow(max(0.0, m), 300.0) * 0.5;
  col += punten(ro, rd, 600.0, 30.0, 0.0, 0.5, 0.9, vec3(0.7), 5.0, 0.0) * smoothstep(hor, hor + 0.15, el);
  if (el < hor) {  // straat: lantaarns in een raster
    float tt = (H0 + ro.y) / max(-rd.y, 1e-3); vec2 s = (ro.xz + rd.xz * tt) / 40.0, sf = abs(fract(s) - 0.5);
    col = vec3(0.004, 0.003, 0.006) + vec3(1.0, 0.55, 0.15) * 0.35 * (exp(-sf.x * 60.0) + exp(-sf.y * 60.0)) * exp(-tt * 0.002);
  }
  vec4 g2 = gebouwen(ro, rd, 340.0, 26.0, H0, zaad + 5.0), g1 = gebouwen(ro, rd, 150.0, 16.0, H0, zaad);
  col = mix(col, g2.rgb * 0.6 + A * 0.03, g2.a);
  col = mix(col, g1.rgb, g1.a);
  if (rd.z < 0.0) {  // de toren zelf: gevel achter de lift (14 m breed), verdiepingen schieten langs
    float tz = vlakT(ro.z, rd.z, cabD * 0.5 + 0.7); vec3 q = ro + rd * tz; float Yq = q.y + rit;
    if (abs(q.x) < 7.0) {
      vec2 rr = vec2(q.x / 1.5, Yq / levelH), rf = fract(rr), ri = floor(rr);
      float glas = step(0.05, rf.x) * step(rf.x, 0.95), aan = step(0.45, h21(ri + zaad));
      float vl = abs(Yq - levelH * floor(Yq / levelH + 0.5));
      vec3 tc = vec3(0.008, 0.01, 0.016) + mix(vec3(0.9, 0.8, 0.6), A, 0.35) * aan * glas * 0.22 * smoothstep(0.1, 0.7, rf.y);
      tc += (vec3(0.14) + B * 0.4) * (1.0 - smoothstep(0.03, 0.06 + VB * 0.4, vl)) / (1.0 + VB * 5.0);
      col = tc;
    }
  }
  {  // de stalen liftschacht dichtbij: vier stijlen op de diagonalen en een ring per level (die schiet langs)
    float R = cabW * 0.5 + 1.0, t = cil(ro, rd, R);
    if (t > TMIN) {
      vec3 p = ro + rd * t; float Y = p.y + rit, a = atan(p.z, p.x);
      float post = 1.0 - step(0.06, abs(mod(a, 1.5708) - 0.7854) * R);
      float dl = abs(Y - levelH * floor(Y / levelH + 0.5)), ring = (1.0 - step(0.05 + VB * 0.5, dl)) * (0.08 / (0.08 + VB));
      float m = max(post, ring) * exp(-abs(p.y - ro.y) * 0.02);
      float lampje = (1.0 - step(0.035 + VB * 0.5, dl)) * post * step(0.5, fract(tijd * 1.3 + floor(Y / levelH) * 0.37));
      col = mix(col, vec3(0.015, 0.016, 0.02) + B * 0.08 * ring, m) + vec3(1.0, 0.2, 0.15) * lampje * 0.8;
    }
  }
  return col;
}
// --- 4 water: diep blauw, lichtbanen van boven, rotswand met caustics en koraal, bubbels, kwallen ---
vec3 sWater(vec3 ro, vec3 rd) {
  float el = rd.y, az = atan(rd.z, rd.x);
  vec3 col = mix(vec3(0.0, 0.02, 0.04), vec3(0.0, 0.15, 0.19) + B * 0.05, smoothstep(-0.6, 0.9, el));
  col += vec3(0.06, 0.24, 0.25) * pow(max(0.0, el), 1.2) * pow(0.5 + 0.5 * sin(az * 7.0 + 2.0 * sin(az * 2.0 + tijd * 0.25) + tijd * 0.15), 5.0);
  float R = cabW * 0.5 + 3.2, t = cil(ro, rd, R); vec3 p = ro + rd * t; float Y = p.y + rit, u = atan(p.z, p.x) * R;
  float rots = fbm(vec2(u * 0.5, Y * 0.5) + zaad);
  float ca = pow(abs(sin(u * 1.7 + 1.6 * sin(Y * 1.3 + tijd * 0.9)) * sin(Y * 1.9 + 1.6 * sin(u * 1.1 - tijd * 1.1))), 3.0);
  vec3 wand = vec3(0.01, 0.035, 0.04) * (0.4 + rots) + vec3(0.08, 0.32, 0.3) * ca * 0.6;
  wand += punten(ro, rd, R - 0.05, 0.9, rit, 0.22, 0.09, A, 4.0, 0.0) * (0.6 + 0.8 * puls);
  col = mix(col, wand, exp(-abs(p.y - ro.y) * 0.08));
  float stijg = tijd * 1.4;
  col += punten(ro, rd, 2.0 + cabW * 0.5, 0.7, rit - stijg, 0.3, 0.06, vec3(0.5, 0.85, 0.9), 6.0, 1.0);
  col += punten(ro, rd, 5.5, 1.4, rit - stijg * 0.8, 0.25, 0.12, vec3(0.4, 0.75, 0.85), 7.0, 1.0) * 0.6;
  col += punten(ro, rd, 14.0, 6.0, rit - tijd * 0.3, 0.3, 0.8, mix(C, vec3(0.6, 0.3, 1.0), 0.5), 8.0, 0.0) * (0.25 + 0.4 * puls);
  return col;
}
// --- 5 lava: rotsplaten met gloeiende scheuren (voronoi), vonken die opstijgen ---
vec3 sLava(vec3 ro, vec3 rd) {
  float R = cabW * 0.5 + 1.9, t = cil(ro, rd, R); vec3 p = ro + rd * t; float Y = p.y + rit, u = atan(p.z, p.x) * R;
  vec2 g = vec2(u, Y) * 0.6 + vec2(0.15 * sin(Y * 0.7 + tijd), 0.0), i = floor(g), q = fract(g);
  float d1 = 8.0, d2 = 8.0;
  for (int yy = -1; yy <= 1; yy++) for (int xx = -1; xx <= 1; xx++) {
    vec2 o = vec2(float(xx), float(yy)), r = o + h22(i + o + zaad) - q; float dd = dot(r, r);
    if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) d2 = dd;
  }
  float rand = sqrt(d2) - sqrt(d1), pp = 0.75 + 0.25 * sin(tijd * 1.7 + Y * 0.4) + 0.35 * bas;
  float gl = exp(-rand * (9.0 - 3.0 * pp)) * pp;
  vec3 heet = mix(vec3(1.0, 0.18, 0.01), vec3(1.0, 0.7, 0.18), gl);
  vec3 col = vec3(0.03, 0.007, 0.003) * (0.4 + fbm(vec2(u, Y) * 1.3 + zaad)) + heet * gl * 0.9 + A * 0.12 * gl;
  col *= exp(-abs(p.y - ro.y) * 0.05);
  col += punten(ro, rd, R - 0.6, 0.8, rit - tijd * 3.5, 0.3, 0.025, vec3(1.0, 0.55, 0.15), 9.0, 0.0) * 1.5;
  col += punten(ro, rd, R * 0.6 + 0.6, 0.6, rit - tijd * 4.5, 0.25, 0.018, vec3(1.0, 0.75, 0.3), 10.0, 0.0);
  return col;
}
// --- 6 data: kolommen met tekens die vallen, scanringen op elk level ---
vec3 kolommen(vec3 ro, vec3 rd, float R, float cw, float zs, vec3 kl) {
  float t = cil(ro, rd, R); vec3 p = ro + rd * t; float u = atan(p.z, p.x) * R, Y = p.y + rit;
  float kol = floor(u / cw), ch = cw * 1.3;
  vec2 cel = vec2(kol, floor(Y / ch)), q = vec2(fract(u / cw), fract(Y / ch));
  float sp = 1.5 + 4.0 * h11(kol + zs), d = mod(Y + tijd * sp + h11(kol * 3.1 + zs) * 40.0, 40.0);
  float hel = exp(-d * 0.22) + 0.05;
  vec2 px = floor(q * vec2(5.0, 6.0));
  float bit = step(0.45, h21(cel * 5.0 + px + floor(tijd * 3.0 + h21(cel) * 10.0) * 0.37)) * step(0.12, q.x) * step(q.x, 0.88) * step(0.1, q.y);
  bit = mix(bit, 0.4, clamp(VB * 2.0, 0.0, 1.0));
  return kl * bit * hel * step(0.35, h11(kol * 1.7 + zs)) * (1.0 + 2.0 * step(d, ch)) * exp(-abs(p.y - ro.y) * 0.03);
}
vec3 sData(vec3 ro, vec3 rd) {
  vec3 col = vec3(0.0, 0.01, 0.006) * (1.0 + rd.y);
  col += kolommen(ro, rd, 9.0, 0.45, zaad + 3.0, mix(vec3(0.1, 0.6, 1.0), B, 0.4)) * 0.9;
  col += kolommen(ro, rd, cabW * 0.5 + 1.3, 0.2, zaad, mix(vec3(0.2, 1.0, 0.5), A, 0.3)) * 1.6;
  float R = cabW * 0.5 + 1.3, t = cil(ro, rd, R), Y = ro.y + rd.y * t + rit, dl = abs(Y - levelH * floor(Y / levelH + 0.5));
  col += mix(vec3(0.3, 1.0, 0.6), A, 0.5) * ((1.0 - smoothstep(0.015, 0.03 + VB * 0.5, dl)) * (0.03 / (0.03 + VB)) * 1.3 + exp(-dl * 6.0) * 0.08);
  return col;
}
// --- 7 synth: rastervloeren op elk level, zonsondergang met strepen, draadbergen ---
vec3 sSynth(vec3 ro, vec3 rd) {
  float el = rd.y, az = atan(rd.z, rd.x);
  vec3 col = mix(mix(A, B, 0.5) * 0.3, vec3(0.03, 0.0, 0.07), smoothstep(-0.05, 0.5, el));
  vec3 zd = normalize(vec3(cos(zaad * 4.1), 0.1, sin(zaad * 4.1)));
  float zr = acos(clamp(dot(rd, zd), -1.0, 1.0)), dy = rd.y - zd.y;
  float zon = (1.0 - smoothstep(0.19, 0.2, zr)) * (dy > 0.0 ? 1.0 : step(0.35 + dy * 4.0, fract(dy * 40.0 - tijd * 0.4)));
  col += mix(vec3(1.0, 0.85, 0.2), vec3(1.0, 0.1, 0.5), clamp(-dy * 6.0 + 0.4, 0.0, 1.0)) * zon;
  float berg = 0.04 + 0.06 * abs(sin(az * 3.0 + zaad)) + 0.035 * sin(az * 7.3 + 1.0) + 0.02 * sin(az * 17.0);
  if (el < berg && el > -0.03) col = vec3(0.01, 0.0, 0.03) + B * 0.5 * (1.0 - smoothstep(0.0, 0.005, berg - el)) + B * 0.15 * step(0.92, fract(az * 30.0));
  float Yc = ro.y + rit, s = levelH, Yp = rd.y > 0.0 ? (floor(Yc / s) + 1.0) * s : floor(Yc / s) * s;
  for (int i = 0; i < 2; i++) {
    float tt = (Yp - Yc) / (abs(rd.y) < 1e-4 ? 1e-4 : rd.y);
    if (tt > TMIN && tt < 300.0) {
      vec3 q = ro + rd * tt; vec2 gg = abs(fract(q.xz / 2.0) - 0.5) * 2.0;
      float lijn = smoothstep(1.0 - (0.06 + tt * 0.003), 1.0, max(gg.x, gg.y));
      col += mix(B, A, float(i)) * lijn * exp(-tt * 0.025) * (0.9 + 0.5 * puls) * (i == 0 ? 1.0 : 0.5);
    }
    Yp += rd.y > 0.0 ? s : -s;
  }
  float t2 = cil(ro, rd, 7.0); vec3 p2 = ro + rd * t2; float Y2 = p2.y + rit, u2 = atan(p2.z, p2.x) * 7.0;
  float kooi = max(1.0 - smoothstep(0.02, 0.04, lijnAfst(u2, 1.5)), (1.0 - smoothstep(0.02 + VB * 0.4, 0.05 + VB * 0.4, lijnAfst(Y2, s))) / (1.0 + VB * 3.0));
  col += C * kooi * 0.18 * exp(-abs(p2.y - ro.y) * 0.05);
  return col;
}
// --- 8 wolken: noorderlicht, sterren, wolkenlagen om de 36 m die je doorkruist ---
vec3 sWolken(vec3 ro, vec3 rd) {
  float el = rd.y, az = atan(rd.z, rd.x), H0 = basis + rit;
  vec3 col = mix(vec3(0.01, 0.015, 0.06), vec3(0.0, 0.0, 0.015), smoothstep(-0.2, 0.7, el));
  float au = fbm(vec2(az * 2.0 + tijd * 0.03, el * 3.0) + zaad);
  col += mix(A, B, au) * smoothstep(0.1, 0.6, el) * pow(0.5 + 0.5 * sin(az * 3.0 + au * 4.0 + tijd * 0.2), 3.0) * 0.4 * smoothstep(0.35, 0.8, au);
  col += punten(ro, rd, 500.0, 25.0, 0.0, 0.5, 0.8, vec3(0.8), 11.0, 0.0) * smoothstep(0.0, 0.2, el);
  float s = 36.0, Yc = ro.y + H0, Yp = rd.y > 0.0 ? (floor(Yc / s) + 1.0) * s : floor(Yc / s) * s;
  vec3 wol = vec3(0.0); float dek = 0.0;
  for (int i = 0; i < 2; i++) {
    float tt = (Yp - Yc) / (abs(rd.y) < 1e-4 ? 1e-4 : rd.y);
    if (tt > 0.0 && tt < 900.0) {
      vec3 q = ro + rd * tt;
      float dicht = smoothstep(0.42, 0.75, fbm(q.xz * 0.012 + vec2(Yp * 0.37, tijd * 0.01) + zaad));
      vec3 wk = mix(vec3(0.05, 0.05, 0.09), mix(A, vec3(0.6), 0.5) * 0.35, fbm(q.xz * 0.04 + 7.0)) * exp(-tt * 0.0015) + vec3(0.6, 0.6, 0.9) * flits * 0.8;
      float a = dicht * (1.0 - dek) * exp(-tt * 0.0008);
      wol += wk * a; dek += a;
    }
    Yp += rd.y > 0.0 ? s : -s;
  }
  col = col * (1.0 - dek) + wol;
  col += punten(ro, rd, cabW * 0.5 + 1.6, 0.9, rit + tijd * 0.6, 0.35, 0.03, vec3(0.75, 0.85, 1.0), 12.0, 0.0) * 0.8;  // ijskristallen dichtbij
  col += punten(ro, rd, 6.0, 1.8, rit + tijd * 0.4, 0.3, 0.05, mix(vec3(0.8), A, 0.3), 13.0, 0.0) * 0.5;
  float binnen = 1.0 - smoothstep(1.5, 5.0, abs(Yc - s * floor(Yc / s + 0.5)));
  return mix(col, vec3(0.12, 0.12, 0.16) + A * 0.06, binnen * 0.85);
}
void main() {
  paletZet();
  VB = abs(snel) * 0.026;
  vec3 ro = vC, rd = normalize(vP - vC);
  TMIN = length(vP - vC);
  vec3 col;
  if (soort < 0.5) col = sBeton(ro, rd);
  else if (soort < 1.5) col = sRingen(ro, rd);
  else if (soort < 2.5) col = sRuimte(ro, rd);
  else if (soort < 3.5) col = sStad(ro, rd);
  else if (soort < 4.5) col = sWater(ro, rd);
  else if (soort < 5.5) col = sLava(ro, rd);
  else if (soort < 6.5) col = sData(ro, rd);
  else if (soort < 7.5) col = sSynth(ro, rd);
  else col = sWolken(ro, rd);
  col *= helder * (1.0 - 0.55 * blackout) * (1.0 + 0.8 * explosie);
  col += (pal3(floor(tel) * 0.37) * (0.15 + 0.4 * exp(-fract(tel) * 4.0)) + vec3(0.25) * exp(-fract(tel) * 9.0)) * explosie + vec3(0.25) * flits;
  gl_FragColor = vec4(col, 1.0);
}
`;

  // --- cabine: ledshow (10 patronen per snit), zwarte spiegel, ruimteschippaneel, deur, sas, knoppen, art-deco plafond ---
  const F_LED = KOP + `
uniform float modus, plafond, pitch, pzaad;
uniform vec2 midden, maat;
uniform vec3 tint;
varying vec2 vUv;
vec3 ledShow(vec2 p) {
  float r = length(p), a = atan(p.y, p.x);
  float s = plafond > 0.5 ? r : p.y, q = plafond > 0.5 ? a * max(0.6, r) : p.x;
  float stroom = plafond > 0.5 ? (-r + rit * 0.6) : (p.y + rit * 0.6);
  float pat = floor(h11(snit * 1.37 + pzaad * 7.31) * 10.0), v = 0.0;
  vec3 kl = A;
  if (pat < 0.5) {
    float kol = floor(q / 0.15), h = h11(kol * 1.7 + pzaad);
    v = pow(fract(stroom * (0.25 + 0.3 * h) + h * 7.0 + tijd * (0.15 + 0.3 * h)), 5.0) * step(0.3, h); kl = pal3(h + tel * 0.05);
  } else if (pat < 1.5) {
    v = pow(0.5 + 0.5 * cos((s * 1.4 - tel * 0.5 + stroom * 0.1) * 6.2831), 10.0) * (0.5 + 0.5 * puls); kl = pal3(floor(s * 1.4 - tel * 0.5) * 0.33);
  } else if (pat < 2.5) {
    vec2 g = vec2(a / 6.2831 * 24.0, log(r + 0.3) * 6.0 - tijd * (1.0 + abs(snel) * 0.15) - rit * 0.3 * plafond);
    vec2 id = floor(g), w = fract(g) - 0.5;
    v = step(0.7, h21(id + pzaad)) * smoothstep(0.35, 0.05, length(vec2(w.x, w.y * 0.4))); kl = mix(vec3(1.0), pal3(h21(id)), 0.6);
  } else if (pat < 3.5) {
    v = mod(floor(p.x / 0.3) + floor(p.y / 0.3) + floor(tel), 2.0) * (0.35 + 0.65 * puls); kl = palK(floor(tel));
  } else if (pat < 4.5) {
    float w = sin(p.x * 1.6 + tijd * 0.9) + sin(p.y * 1.9 - tijd * 1.2 + stroom * 0.5) + sin((p.x + p.y) * 1.1 + tijd * 0.7);
    v = 0.4 + 0.35 * sin(w * 2.0); kl = pal3(w * 0.15 + tijd * 0.04);
  } else if (pat < 5.5) {
    v = pow(0.5 + 0.5 * sin(a * 3.0 + r * 4.0 - tijd * 2.0 - rit * 0.4), 6.0) * (0.6 + 0.6 * puls); kl = pal3(a / 6.2831 + tijd * 0.05);
  } else if (pat < 6.5) {
    float x = (fract(tel * 0.5) - 0.5) * maat.x; v = exp(-abs(q - x) * 5.0) + 0.05; kl = palK(floor(tel * 0.5));
  } else if (pat < 7.5) {
    float bi = floor(q / 0.22), lv = mix(bas, hoog, h11(bi * 1.3)) * (0.7 + 0.5 * h11(bi + floor(tel)));
    float yn = plafond > 0.5 ? r / (0.5 * maat.x) : p.y / maat.y + 0.5;
    v = step(yn, lv) * step(0.15, fract(q / 0.22)) * (0.4 + 0.6 * step(lv - 0.06, yn)); kl = mix(A, C, clamp(yn, 0.0, 1.0));
  } else if (pat < 8.5) {
    float d = max(abs(p.x) / maat.x, abs(p.y) / maat.y), z = log(d + 0.03) * 3.0 - tijd * 0.7 - rit * 0.25;
    v = pow(0.5 + 0.5 * cos(z * 6.2831), 8.0); kl = pal3(floor(z) * 0.27);
  } else {
    vec2 g = vec2(q / 0.18, stroom / 0.18 + tijd * 2.0), id = floor(g), w = fract(g) - 0.5;
    v = step(0.82, h21(id + pzaad)) * smoothstep(0.3, 0.05, length(w)); kl = pal3(h21(id * 1.3));
  }
  if (explosie > 0.05) {
    float ft = fract(tel), golf = pow(0.5 + 0.5 * cos((r * 1.6 - ft * 5.0) * 6.2831), 6.0) * (1.0 - ft * 0.6);
    vec3 ek = pal3(floor(tel) * 0.37 + r * 0.2);
    return mix(kl * v, ek * (golf * 1.6 + 0.25), clamp(explosie * 1.3, 0.0, 1.0));
  }
  return kl * v;
}
vec3 spiegel(vec2 p) {
  vec3 c = vec3(0.008, 0.008, 0.012) + tint * 0.012;
  c += pal3(tel * 0.125) * 0.13 * smoothstep(maat.y * 0.1, maat.y * 0.5, p.y) * (0.5 + 0.5 * puls);
  c += vec3(0.12) * pow(max(0.0, sin((p.x * 0.8 + p.y * 0.45) * 3.0 + rit * 0.9 + tijd * 0.2)), 160.0);
  c += A * 0.12 * pow(max(0.0, sin((p.x * 0.6 - p.y * 0.3) * 2.0 - tijd * 0.4)), 60.0);
  return c;
}
vec3 paneel(vec2 p) {
  vec2 g = abs(fract(p / vec2(0.6, 0.45)) - 0.5);
  float naad = smoothstep(0.46, 0.5, max(g.x, g.y));
  vec3 c = (tint * 0.15 + vec3(0.025)) * (0.85 + 0.15 * sin(p.y * 2.0 + tijd)) * (1.0 - 0.75 * naad);
  float loop = exp(-abs(fract(p.x * 0.25 - tijd * 0.4 - rit * 0.05) - 0.5) * 25.0) * (1.0 - smoothstep(0.012, 0.025, lijnAfst(p.y, 0.9)));
  return (c + A * 0.5 * loop) * (0.85 + 0.25 * puls);
}
vec3 deur(vec2 p) {  // geborsteld metaal, weerkaatsing van het plafond, een lichtlijn die over de deur loopt, gloeiende onder- en bovenrand
  float ruw = h21(vec2(floor(p.x * 250.0), floor(p.y * 3.0)));
  vec3 c = tint * (0.09 + 0.035 * ruw) + vec3(0.012);
  c += pal3(tel * 0.125) * 0.12 * smoothstep(maat.y * 0.35, maat.y, p.y) * (0.6 + 0.4 * puls);
  float lat = 1.0 - smoothstep(0.006, 0.014, lijnAfst(p.y, 0.16));
  c *= 1.0 - 0.45 * lat * step(0.5, pzaad);
  c += A * 0.6 * exp(-abs(fract(p.y * 0.4 - tijd * 0.25) - 0.5) * 20.0) * (0.4 + 0.6 * puls);
  c += B * 0.5 * (1.0 - smoothstep(0.0, 0.035, min(p.y, maat.y - p.y))) * (0.6 + 0.4 * puls);
  c += vec3(0.1) * pow(max(0.0, sin((p.x * 0.7 + p.y * 0.4) * 3.0 + rit * 0.6 + tijd * 0.3)), 120.0);
  return c;
}
vec3 sas(vec2 p) {
  vec3 c = vec3(0.01, 0.01, 0.014) + tint * 0.012;
  float l1 = 1.0 - smoothstep(0.012, 0.03, abs(p.y - 0.28)), l2 = 1.0 - smoothstep(0.012, 0.03, abs(p.y - 2.32));
  float jaag = 0.25 + 0.75 * step(0.55, fract(p.x * 1.5 - tijd * 1.2));
  c += (A * l1 + B * l2) * jaag * (0.5 + 0.6 * puls);
  c *= 1.0 - 0.6 * (1.0 - smoothstep(0.004, 0.012, lijnAfst(p.x, 0.75)));
  return c;
}
vec3 knoppen(vec2 p) {
  vec2 cs = maat / vec2(2.0, 7.0), g = p / cs, id = floor(g), w = (fract(g) - 0.5) * cs;
  float knop = 1.0 - smoothstep(0.022, 0.03, length(w));
  float doel = 1.0 - step(0.5, abs(id.x + id.y * 2.0 - pzaad));
  vec3 c = vec3(0.015) + tint * 0.02;
  return c + knop * (doel * A * (0.7 + 0.3 * step(0.5, fract(tijd * 1.6))) * 1.5 + (1.0 - doel) * vec3(0.07) * (0.6 + 0.4 * puls));
}
vec3 deco(vec2 p) {
  float r = length(p), a = atan(p.y, p.x), rm = min(maat.x, maat.y) * 0.5;
  float straal = pow(0.5 + 0.5 * cos(a * 16.0), 8.0) * smoothstep(0.1, 0.4, r) * (1.0 - smoothstep(rm * 0.75, rm * 0.8, r));
  vec3 c = vec3(0.05, 0.034, 0.012) * (0.5 + 1.5 * straal) + vec3(0.02, 0.014, 0.006);
  float n = 24.0, ai = floor((a / 6.2831853 + 0.5) * n), ac = (ai + 0.5) / n * 6.2831853 - 3.14159265;
  float bol = 1.0 - smoothstep(0.03, 0.055, length(p - vec2(cos(ac), sin(ac)) * rm * 0.86));
  float aan = 0.2 + 0.8 * step(0.5, fract((ai - floor(tel * 2.0)) / 4.0));
  c += mix(vec3(1.0, 0.75, 0.35), A, 0.3) * bol * aan * 1.4;
  c += A * 0.35 * exp(-r * 4.0) * (0.5 + 0.5 * puls);
  return c;
}
void main() {
  paletZet();
  vec2 p = vUv - midden;
  vec3 c;
  if (modus < 0.5) {
    c = ledShow(p);
    if (zwaar < 1.5) { vec2 cc = fract(vUv / pitch) - 0.5; c *= 0.25 + 0.75 * smoothstep(0.5, 0.2, length(cc)); }
    c *= helder;
  } else if (modus < 1.5) c = spiegel(p);
  else if (modus < 2.5) c = paneel(p);
  else if (modus < 3.5) c = deur(p);
  else if (modus < 4.5) c = sas(p);
  else if (modus < 5.5) c = knoppen(p);
  else c = deco(p);
  float vol = modus < 0.5 || modus > 5.5 ? 1.0 : 0.45;
  c *= 1.0 - 0.6 * blackout;
  c += (pal3(floor(tel) * 0.37) * (0.35 + 0.9 * exp(-fract(tel) * 4.0)) + vec3(0.5) * exp(-fract(tel) * 9.0)) * explosie * vol;
  c += vec3(0.8) * flits * vol;
  gl_FragColor = vec4(c, 1.0);
}
`;

  // --- glas: een zweem tint, weerkaatsing van het plafond, een glimstreep die met de rit meeloopt (prisma: regenboogscherven) ---
  const F_GLAS = KOP + `
uniform vec3 tint;
uniform float alfa, prisma;
varying vec2 vUv;
void main() {
  paletZet();
  vec2 p = vUv;
  float streep = pow(max(0.0, sin((p.x * 0.9 + p.y * 0.4) * 2.2 + rit * 0.35 + tijd * 0.1)), 40.0);
  float boven = smoothstep(cabH * 0.55, cabH, p.y);
  vec3 c = tint * 0.05 + A * 0.14 * boven * (0.6 + 0.4 * puls) + vec3(0.5) * streep * 0.35;
  c += pal3(p.x * 0.8 + p.y * 0.3 + tijd * 0.05) * 0.1 * prisma * pow(max(0.0, sin(p.x * 7.0 + p.y * 3.0 + tijd * 0.3)), 6.0);
  gl_FragColor = vec4(c * (1.0 + explosie) + vec3(0.3) * flits, alfa + streep * 0.22 + boven * 0.07 + prisma * 0.04);
}
`;

  // --- leveldisplay: 8 cellen van 6 x 9 ledpuntjes ('LVL' + teken + 2 cijfers + pijl); de cijfers rollen mee met de rit ---
  const F_DISP = KOP + `
uniform vec4 gA, gB, nA, nB;
uniform float rol, gloed, knip;
uniform vec3 kleur;
varying vec2 vUv;
float kies4(vec4 v, float i) { return dot(v, vec4(equal(vec4(i), vec4(0.0, 1.0, 2.0, 3.0)))); }
void main() {
  vec2 q = vUv * vec2(48.0, 9.0);
  float cel = floor(q.x / 6.0), cx = floor(mod(q.x, 6.0)), ry = 8.0 - floor(q.y);
  float g = cel < 3.5 ? kies4(gA, cel) : kies4(gB, cel - 4.0), n = cel < 3.5 ? kies4(nA, cel) : kies4(nB, cel - 4.0);
  float rl = cel > 3.5 && cel < 6.5 && abs(n - g) > 0.5 ? rol : 0.0;
  float src = floor(ry + rl * 9.0 * rolRicht + 0.5), gg = g;
  if (src > 8.5) { gg = n; src -= 9.0; } else if (src < -0.5) { gg = n; src += 9.0; }
  float bit = glyf(gg, vec2(cx, src - 1.0));
  if (cel > 6.5) bit *= 0.5 + 0.5 * knip;
  vec2 w = fract(q) - 0.5;
  float stip = smoothstep(0.48, 0.22, length(w));
  vec3 c = kleur * (bit * 1.6 + 0.04) * stip + kleur * bit * gloed * 0.45 * smoothstep(0.75, 0.0, length(w));
  gl_FragColor = vec4(c * (1.0 - 0.4 * blackout) * (1.0 + explosie) + vec3(0.1) * flits, 1.0);
}
`;

  // ---------- keuzes per rit ----------
  const CABINES = ['glasbuis', 'spiegel', 'kooi', 'draad', 'capsule', 'messing', 'led', 'kristal'];
  const UITZICHT = ['beton', 'ringen', 'ruimte', 'stad', 'water', 'lava', 'data', 'synth', 'wolken'];
  const DEUREN = { glasbuis: ['luik', 'rol'], spiegel: ['schuif', 'tele', 'luik', 'iris'], kooi: ['luik', 'rol', 'harmonica'], draad: ['schuif', 'tele', 'iris', 'luik'],
    capsule: ['iris', 'iris', 'luik'], messing: ['harmonica', 'schuif'], led: ['schuif', 'tele', 'iris', 'rol'], kristal: ['schuif', 'iris', 'tele'] };
  const ALLE_DEUREN = ['schuif', 'tele', 'luik', 'rol', 'harmonica', 'iris'];
  const PALETTEN = [[0xff2d95, 0x00e5ff, 0x7a00ff], [0xff5a00, 0xffc400, 0xff0055], [0x00ffa2, 0x0072ff, 0xff00c8], [0x8cff00, 0x00d5ff, 0xc050ff],
    [0xff0080, 0xffaa00, 0x00c8ff], [0x3cffc8, 0xff3cac, 0x784bff], [0xffd400, 0xff2a00, 0x8a00ff], [0x00b3ff, 0xff4fd8, 0x2bff88]];
  const DISP_KL = [0xffa020, 0xff2a1a, 0x30ff60, 0x30e0ff, 0xff40c0, 0xffffff];
  const recent = { cab: [], uit: [], deur: [] };
  function kiesNieuw(rnd, lijst, mem, n) {
    let k = lijst.filter(x => !mem.includes(x)); if (!k.length) k = lijst;
    const x = k[Math.min(k.length - 1, Math.floor(rnd() * k.length))];
    mem.push(x); while (mem.length > n) mem.shift();
    return x;
  }

  // plan: alle keuzes en de toestand van één rit (komt op ov.L; beide helften lezen hieruit). van = level van de kamer ervoor.
  function plan(van, keus, proef) {  // proef: voor het voorwarmen (raakt de testkeuzes en het geheugen van de loting niet)
    keus = Object.assign({}, proef ? {} : doolhof.liftKeus || {}, keus || {});
    if (!proef) doolhof.liftKeus = null;
    const mem = proef ? { cab: [], uit: [], deur: [] } : recent;
    const zaad = (Math.random() * 4294967296) >>> 0, rnd = reeks(zaad), r = (a, b) => a + (b - a) * rnd();
    const cab = CABINES.includes(keus.cabine) ? keus.cabine : kiesNieuw(rnd, CABINES, mem.cab, 3);
    const uit = UITZICHT.includes(keus.uitzicht) ? keus.uitzicht : kiesNieuw(rnd, UITZICHT, mem.uit, 4);
    const deur = ALLE_DEUREN.includes(keus.deur) ? keus.deur : kiesNieuw(rnd, DEUREN[cab], mem.deur, 1);
    let W, D, R = 0, WB, vorm = 'recht';
    if (cab === 'glasbuis') { vorm = 'rond'; R = r(1.5, 1.68); D = r(2.2, 2.4); WB = 2 * Math.sqrt(R * R - D * D / 4); W = 2 * R; }
    else { W = r(2.35, 2.95); D = r(2.4, 2.95); WB = W; }
    const H = cab === 'kooi' ? r(2.75, 3.0) : r(2.7, 3.15);
    let dw, dh = r(2.2, 2.32);
    if (deur === 'schuif') dw = Math.min(1.75, (WB - 0.12) / 1.5);
    else if (deur === 'tele') dw = Math.min(1.7, (WB - 0.1) / 1.67);
    else if (deur === 'iris') { dw = Math.min(1.95, WB - 0.25); dh = Math.min(2.32, H - 0.4); }
    else dw = Math.min(1.8, WB - 0.3);
    dw = Math.max(1.4, dw); dh = Math.min(dh, H - 0.36);
    // rit: richting (terug naar 0 als je ver weg bent), afstand 1-40 levels, levelhoogte, topsnelheid (kruistijd 4-7 s)
    let richting = keus.richting === 1 || keus.richting === -1 ? keus.richting : van > 25 ? (rnd() < 0.8 ? -1 : 1) : van < -25 ? (rnd() < 0.8 ? 1 : -1) : rnd() < 0.58 ? 1 : -1;
    const x = rnd();
    const afstand = keus.levels ? Math.max(1, Math.min(40, Math.round(keus.levels))) : x < 0.2 ? 1 + Math.floor(rnd() * 6) : x < 0.68 ? 7 + Math.floor(rnd() * 14) : 21 + Math.floor(rnd() * 20);
    if (Math.abs(van + richting * afstand) > 99) richting = -richting;
    const levelH = r(3.3, 5.6), weg = afstand * levelH, kruis = r(5.5, 9.0);
    const vmax = Math.min(32, Math.max(2.4, weg / kruis)), acc = vmax / r(0.9, 1.8), rem = acc * r(0.8, 1.25);
    // palet: vast (gecureerd) of een driehoek uit het zaad
    let pa, pb, pc;
    if (rnd() < 0.45) { const p = PALETTEN[Math.floor(rnd() * PALETTEN.length)]; pa = new THREE.Color(p[0]); pb = new THREE.Color(p[1]); pc = new THREE.Color(p[2]); }
    else { const h = rnd(); pa = new THREE.Color().setHSL(h, 1, 0.52); pb = new THREE.Color().setHSL((h + r(0.28, 0.4)) % 1, 1, 0.5); pc = new THREE.Color().setHSL((h + r(0.55, 0.7)) % 1, 0.95, 0.5); }
    const dispKl = new THREE.Color(cab === 'messing' ? 0xffa020 : cab === 'capsule' ? 0x30e0ff : cab === 'kooi' ? (rnd() < 0.5 ? 0xff2a1a : 0xffa020) : rnd() < 0.3 ? pa.getHex() : DISP_KL[Math.floor(rnd() * DISP_KL.length)]);
    const glasVloer = cab === 'draad' || (cab === 'led' && rnd() < 0.6) || (cab === 'glasbuis' && rnd() < 0.45) || (cab === 'kristal' && rnd() < 0.4);
    const glasDak = (cab === 'draad' && rnd() < 0.5) || (cab === 'glasbuis' && rnd() < 0.45);
    // camerabewegingen tijdens de rit (volgorde uit het zaad)
    const schud = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
    const voor = schud(['gezicht', 'raamV', 'rond'].concat(glasDak ? ['dak'] : [])), achter = schud(['hoek', 'plafond', 'raamA'].concat(glasVloer ? ['vloer'] : []));
    const pool = voor.concat(achter);
    const C0 = LV + SG, LEN = 2 * LV + 2 * SG + D;
    const ramen = cab === 'spiegel' ? { v: -D / 2 + 2 * D / 3, a: -D / 2 + D / 3, zw: 0.06, d: 0.75, kz: 0.15, y: 1.6, fov: 70 }
      : cab === 'capsule' ? (D > 2.65 ? { v: -D / 2 + 2 * D / 3, a: -D / 2 + D / 3, zw: 0.04, d: 0.85, kz: 0.1, y: 1.55, fov: 64 } : { v: 0.2, a: -0.2, zw: 0.04, d: 0.85, kz: 0.1, y: 1.55, fov: 64 })
      : cab === 'led' ? { v: 0.62, a: -0.5, zw: 0.2, d: 0.35, kz: 1, y: 1.6, fov: 76 }
      : cab === 'messing' ? { v: 0.62, a: -0.5, zw: 0.2, d: 0.35, kz: 1, y: 1.7, fov: 76 }
      : cab === 'kooi' ? { v: 0.62, a: -0.5, zw: 0.2, d: 0.6, kz: 1, y: 1.55, fov: 74 }
      : { v: 0.62, a: -0.5, zw: 0.2, d: 0.32, kz: 1, y: 1.55, fov: 76 };
    const minLvl = Math.min(van, van + richting * afstand);
    const L = { zaad, cab, uit, deur, vorm, W, D, H, R, WB, dw, dh, richting, afstand, levelH, vmax, acc, rem, van, naar: van + richting * afstand, level: van,
      glasVloer, glasDak, pa, pb, pc, dispKl, camLijst: pool, ramen, camZij: rnd() < 0.5 ? -1 : 1, raamOp: rnd() < 0.5, camDraai: rnd() < 0.5 ? -1 : 1, camA: r(0, Math.PI * 2),
      schokK: cab === 'kooi' ? 1.6 : cab === 'messing' ? 1.2 : cab === 'capsule' ? 0.5 : 1, tDeur: deur === 'iris' ? 1.1 : deur === 'harmonica' ? 1.5 : deur === 'rol' ? 1.4 : r(0.9, 1.3),
      C0, LEN, STOP: C0 + D / 2 + ZL, camMin: C0 + CAM_ACHTER,
      fase: 'wacht', tFase: 0, deurA: 0, deurV: 0, pos: 0, v: 0, a: 0, veer: 0, veerV: 0, explosie: 0, schok: 0, doelPos: weg, remt: false, verlengd: 0, dropGezien: null,
      camBinnen: false, camAchter: false, cam: null, helften: new Set(), deel: null, stapBeeld: -1,
      U: { rit: f(0), snel: f(0), explosie: f(0), helder: f(1), zaad: f((zaad % 997) / 97), cabW: f(W), cabD: f(D), cabH: f(H), levelH: f(levelH), van: f(van),
        basis: f((van - minLvl) * levelH + 25), soort: f(UITZICHT.indexOf(uit)), rolRicht: f(richting), pa: f(pa), pb: f(pb), pc: f(pc) } };
    return L;
  }
  // het level van vertrek bleek anders (een vorige rit reed verder): plan bijstellen voordat de rit begint
  function zetVan(L, van) {
    if (L.van === van || L.fase !== 'wacht') return;
    L.van = L.level = van; L.U.van.value = van;
    if (Math.abs(van + L.richting * L.afstand) > 99) { L.richting = -L.richting; L.U.rolRicht.value = L.richting; }
    L.naar = van + L.richting * L.afstand;
    L.U.basis.value = (van - Math.min(van, L.naar)) * L.levelH + 25;
  }

  // ---------- materialen ----------
  function rawMat(L, frag, vert, eigen, o) {
    o = o || {};
    const m = new THREE.RawShaderMaterial({ uniforms: Object.assign({}, LU, L.U, eigen || {}), vertexShader: vert, fragmentShader: frag, side: THREE.DoubleSide,
      transparent: !!o.doorzicht, depthWrite: !o.doorzicht, glslVersion: GL2 ? THREE.GLSL3 : null });
    m.userData.lift = o.naam || 'lift';
    return m;
  }
  const ledMat = (L, modus, o) => rawMat(L, F_LED, VERT_UV, { modus: f(modus), plafond: f(o.plafond ? 1 : 0), pitch: f(o.pitch || 0.045), pzaad: f(o.pzaad || 0),
    midden: f(new THREE.Vector2(o.mx || 0, o.my || 0)), maat: f(new THREE.Vector2(o.w || 2, o.h || 2)), tint: f(new THREE.Color(o.tint == null ? 0x8090a0 : o.tint)) }, { naam: 'led' });
  const glasMat = (L, o) => rawMat(L, F_GLAS, VERT_UV, { tint: f(new THREE.Color(o.tint == null ? 0x6080a0 : o.tint)), alfa: f(o.alfa == null ? 0.07 : o.alfa), prisma: f(o.prisma ? 1 : 0) }, { doorzicht: true, naam: 'glas' });
  const dispMat = (L, gloed) => rawMat(L, F_DISP, VERT_UV, { gA: f(new THREE.Vector4(11, 12, 11, 13)), gB: f(new THREE.Vector4(13, 0, 0, 13)), nA: f(new THREE.Vector4(11, 12, 11, 13)),
    nB: f(new THREE.Vector4(13, 0, 0, 13)), rol: f(0), gloed: f(gloed || 0.5), knip: f(1), kleur: f(L.dispKl) }, { naam: 'display' });
  function basisMat(L, hex, o) {  // onverlicht; kleur volgt elk beeld de show (zie beeldL)
    o = o || {};
    const m = new THREE.MeshBasicMaterial({ color: hex, map: o.map || null, transparent: !!o.plus, blending: o.plus ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !o.plus, side: o.zijde || THREE.FrontSide });
    L.deel.basis.push({ m, c: new THREE.Color(hex), k: o.k == null ? 1 : o.k, plus: !!o.plus });
    return m;
  }
  // canvasstructuren (één keer, gedeeld): hout, marmer, traanplaat, gevaarstreep
  const TEX = {};
  function canvas(naam, w, h, teken) {
    if (!TEX[naam]) { const t = canvasTexture(w, h, teken); t.wrapS = t.wrapT = THREE.RepeatWrapping; TEX[naam] = houd(t); }
    return TEX[naam];
  }
  const hout = () => canvas('hout', 256, 256, (g, w, h) => {
    g.fillStyle = '#3a2414'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) { g.strokeStyle = `rgba(${20 + Math.random() * 40},${10 + Math.random() * 20},${4},${0.25 + Math.random() * 0.4})`; g.lineWidth = 1 + Math.random() * 2; g.beginPath(); const x = Math.random() * w; g.moveTo(x, 0); g.bezierCurveTo(x + 6, h * 0.3, x - 6, h * 0.6, x + 3, h); g.stroke(); }
    g.fillStyle = 'rgba(200,150,60,0.9)'; g.fillRect(0, 0, w, 5); g.fillRect(0, h - 5, w, 5);
  });
  const marmer = () => canvas('marmer', 256, 256, (g, w, h) => {
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { g.fillStyle = (x + y) % 2 ? '#0c0c0e' : '#b8b4aa'; g.fillRect(x * 128, y * 128, 128, 128); }
    for (let i = 0; i < 30; i++) { g.strokeStyle = 'rgba(90,90,100,0.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(Math.random() * w, Math.random() * h); g.lineTo(Math.random() * w, Math.random() * h); g.stroke(); }
  });
  const traan = () => canvas('traan', 128, 128, (g, w, h) => {
    g.fillStyle = '#2a2a2e'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.save(); g.translate(x * 16 + 8 + (y % 2) * 8, y * 16 + 8); g.rotate((x + y) % 2 ? 0.7 : -0.7); g.fillStyle = '#4a4a50'; g.fillRect(-5, -1.5, 10, 3); g.restore(); }
  });
  const gevaar = () => canvas('gevaar', 128, 32, (g, w, h) => {
    g.fillStyle = '#111'; g.fillRect(0, 0, w, h); g.fillStyle = '#e6b800';
    for (let x = -h; x < w + h; x += 32) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 16, h); g.lineTo(x + 16 + h, 0); g.lineTo(x + h, 0); g.fill(); }
  });

  // ---------- geometrie-hulpjes ----------
  function bak() {
    const P = [], U = [], I = [];
    return {
      // vlak vanuit hoek o langs eenheidsrichtingen u (breedte w) en v (hoogte h); uv in meters vanaf (u0, v0)
      quad(o, u, v, w, h, u0, v0) {
        const n = P.length / 3;
        for (const [a, b] of [[0, 0], [1, 0], [1, 1], [0, 1]]) { P.push(o[0] + u[0] * w * a + v[0] * h * b, o[1] + u[1] * w * a + v[1] * h * b, o[2] + u[2] * w * a + v[2] * h * b); U.push((u0 || 0) + a * w, (v0 || 0) + b * h); }
        I.push(n, n + 1, n + 2, n, n + 2, n + 3);
      },
      leeg: () => !I.length,
      geo() { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I); g.computeBoundingSphere(); return g; },
    };
  }
  const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1], NX = [-1, 0, 0], NZ = [0, 0, -1];
  // dozen samenvoegen tot één geometrie (één draw): [cx, cy, cz, sx, sy, sz] of { geo, m: Matrix4 }
  function samen(lijst) {
    const geos = [], m = new THREE.Matrix4();
    for (const d of lijst) {
      if (Array.isArray(d)) { const g = new THREE.BoxGeometry(d[3], d[4], d[5]); g.translate(d[0], d[1], d[2]); geos.push(g); }
      else { const g = d.geo.clone(); g.applyMatrix4(d.m); if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]); geos.push(g); }
    }
    for (const g of geos) { for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'uv') g.deleteAttribute(k); if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); }
    if (!geos.length) return null;
    const uit = samenvoegen(geos); uit.computeBoundingSphere(); m.identity();
    return uit;
  }
  // wand in het vlak z (cabine-ruimte) met een deurgat dw x dh in het midden; breedte w, hoogte h; uv: x vanaf links, y
  function wandMetGat(b, z, w, h, dw, dh) {
    const a = -w / 2;
    b.quad([a, 0, z], X, Y, w / 2 - dw / 2, h, 0, 0);
    b.quad([dw / 2, 0, z], X, Y, w / 2 - dw / 2, h, w / 2 + dw / 2, 0);
    b.quad([-dw / 2, dh, z], X, Y, dw, h - dh, w / 2 - dw / 2, dh);
  }
  // omtrek van de glasbuis (xz): vlakke kopwanden op z = ±D/2, ronde zijkanten met straal R
  function stadion(L, inset) {
    const s = new THREE.Shape(), R = L.R - inset, hz = L.D / 2 - inset, hx = Math.sqrt(Math.max(0.01, R * R - hz * hz)), a = Math.asin(Math.min(1, hz / R));
    s.moveTo(-hx, -hz); s.lineTo(hx, -hz); s.absarc(0, 0, R, -a, a, false); s.lineTo(-hx, hz); s.absarc(0, 0, R, Math.PI - a, Math.PI + a, false);
    return s;
  }
  const xMax = (L, z) => (L.vorm === 'rond' ? Math.sqrt(Math.max(0, L.R * L.R - z * z)) : L.W / 2) - 0.3;

  // ---------- de gedeelde delen van een overgang (één keer; beide helften maken er meshes van) ----------
  function* delenMaken(L) {
    const D = L.deel = { m: {}, basis: [], cab: [], sas: [], deur: {}, strips: null, schacht: null };
    const m = D.m, W = L.W, Dd = L.D, H = L.H, dw = L.dw, dh = L.dh, rnd = reeks(L.zaad ^ 0x9e3779b9), c = L.cab;
    const pal = { a: L.pa, b: L.pb, c: L.pc, donker: 0x020004 }, LED = doolhof.led && doolhof.led.vloerMat ? doolhof.led : null;
    const metaalKl = c === 'messing' ? 0x7a5520 : c === 'capsule' ? 0x5a5f69 : c === 'kooi' ? 0x3a3a40 : c === 'kristal' ? 0x405060 : 0x1e1e26;
    m.metaal = basisMat(L, metaalKl);
    m.donker = basisMat(L, 0x050507, { k: 0.4 });
    m.uitzicht = rawMat(L, F_UIT, VERT_UIT, {}, { naam: 'uitzicht' });
    m.glas = glasMat(L, { tint: c === 'kristal' ? 0x90b0ff : c === 'messing' ? 0x806040 : 0x6080a0, alfa: c === 'draad' ? 0.035 : c === 'kristal' ? 0.09 : 0.065, prisma: c === 'kristal' });
    m.dispLive = dispMat(L, 0.5); m.dispVan = dispMat(L, 0.5); m.dispNaar = dispMat(L, 1.2);
    const pz = () => Math.floor(rnd() * 997);
    const wandSoort = { glasbuis: 'spiegel', spiegel: 'spiegel', kooi: 'metaal', draad: 'led', capsule: 'paneel', messing: 'hout', led: 'led', kristal: 'spiegel' }[c];
    const maakWand = (soort, w, h, mx, my) => soort === 'led' ? ledMat(L, 0, { w, h, mx, my, pzaad: pz() }) : soort === 'spiegel' ? ledMat(L, 1, { w, h, mx, my, tint: L.pa.getHex() })
      : soort === 'paneel' ? ledMat(L, 2, { w, h, mx, my, tint: 0x9aa6b8 }) : soort === 'hout' ? basisMat(L, 0xffffff, { map: hout(), k: 0.4, zijde: THREE.DoubleSide }) : basisMat(L, metaalKl, { zijde: THREE.DoubleSide });
    m.wand = maakWand(wandSoort, Dd, H, 0, H / 2);
    m.kop = c === 'draad' ? ledMat(L, 0, { w: W, h: H, mx: 0, my: H / 2, pzaad: pz() }) : c === 'kooi' ? basisMat(L, 0x2a2a30, { zijde: THREE.DoubleSide }) : maakWand(wandSoort, W, H, W / 2, H / 2);
    m.deur = ledMat(L, 3, { w: dw, h: dh, tint: c === 'messing' ? 0xc89040 : c === 'capsule' ? 0xa8b0c0 : c === 'kooi' ? 0x707070 : c === 'kristal' ? 0x90a8d0 : 0x606878, pzaad: c === 'kooi' || deurLatten(L) ? 1 : 0 });
    if (c === 'led' || c === 'draad') m.deur = ledMat(L, 0, { w: dw, h: dh, mx: 0, my: dh / 2, pzaad: pz() });
    m.deurBasis = basisMat(L, c === 'messing' ? 0x9a7030 : 0x55606c, { zijde: THREE.DoubleSide });
    m.sas = ledMat(L, 4, { w: LV, h: GH, tint: L.pb.getHex() });
    m.knoppen = ledMat(L, 5, { w: 0.16, h: 0.42, pzaad: Math.floor(rnd() * 14), tint: 0x808080 });
    yield;
    // --- cabine (oorsprong = midden van de cabinevloer) ---
    const kopB = bak(), wandB = bak(), glasB = bak(), frame = [], strips = [];
    const zA = -Dd / 2, zV = Dd / 2;
    // kopwanden met deurgat (binnenkant), voor en achter
    wandMetGat(kopB, zA, L.WB, H, dw, dh); wandMetGat(kopB, zV, L.WB, H, dw, dh);
    // deurkozijn (dik genoeg om de deurpanelen te verbergen) en de stijlen in de spleet naar het sas
    for (const z of [zA, zV]) {
      const s = Math.sign(z);
      frame.push([-dw / 2 - 0.035, dh / 2, z + s * 0.01, 0.07, dh + 0.07, 0.14], [dw / 2 + 0.035, dh / 2, z + s * 0.01, 0.07, dh + 0.07, 0.14], [0, dh + 0.035, z + s * 0.01, dw + 0.14, 0.07, 0.14]);
      frame.push([-dw / 2 - 0.035, dh / 2, z + s * (SG / 2 + 0.03), 0.07, dh + 0.07, SG + 0.06], [dw / 2 + 0.035, dh / 2, z + s * (SG / 2 + 0.03), 0.07, dh + 0.07, SG + 0.06], [0, dh + 0.035, z + s * (SG / 2 + 0.03), dw + 0.14, 0.07, SG + 0.06]);
    }
    let vloerGeo, plafGeo, zijGlas = null;
    if (L.vorm === 'rond') {
      const vorm = stadion(L, 0);
      vloerGeo = new THREE.ShapeGeometry(vorm, 24); vloerGeo.rotateX(Math.PI / 2);
      plafGeo = vloerGeo.clone(); plafGeo.translate(0, H, 0);
      // ronde glaswanden (twee segmenten), uv in meters
      const a = Math.asin(Math.min(1, (Dd / 2) / L.R)), segs = [];
      for (const th0 of [Math.PI / 2 - a, Math.PI * 1.5 - a]) {
        const g = new THREE.CylinderGeometry(L.R, L.R, H, 20, 1, true, th0, 2 * a); g.translate(0, H / 2, 0);
        const p = g.attributes.position, uv = g.attributes.uv;
        for (let i = 0; i < p.count; i++) uv.setXY(i, Math.atan2(p.getX(i), p.getZ(i)) * L.R, p.getY(i));
        segs.push(g);
      }
      zijGlas = samenvoegen(segs);
      // ringen van metaal langs vloer en plafond (ledstrips in stukjes langs de boog)
      for (const y of [0.02, H - 0.02]) for (const sx of [-1, 1]) for (let k = 0; k < 10; k++) {
        const t0 = -a + 2 * a * k / 10, t1 = -a + 2 * a * (k + 1) / 10;
        strips.push([sx * L.R * Math.cos(t0) * 0.995, y, L.R * Math.sin(t0) * 0.995, sx * L.R * Math.cos(t1) * 0.995, y, L.R * Math.sin(t1) * 0.995]);
      }
      for (const sx of [-1, 1]) for (const z of [zA, zV]) frame.push([sx * L.WB / 2, H / 2, z, 0.08, H, 0.08]);
    } else {
      vloerGeo = new THREE.PlaneGeometry(W, Dd); vloerGeo.rotateX(-Math.PI / 2);
      plafGeo = new THREE.PlaneGeometry(W, Dd); plafGeo.rotateX(Math.PI / 2); plafGeo.translate(0, H, 0);
      // hoekstijlen en randen
      for (const sx of [-1, 1]) for (const z of [zA, zV]) frame.push([sx * (W / 2 - 0.03), H / 2, z, 0.07, H, 0.07]);
      for (const sx of [-1, 1]) for (const y of [0.03, H - 0.03]) frame.push([sx * (W / 2 - 0.03), y, 0, 0.07, 0.07, Dd]);
      zijwanden(L, wandB, glasB, frame, strips, D, rnd);
    }
    // ledstrips langs de vloer- en plafondranden (niet bij messing: daar de lampjes van het deco-plafond)
    if (c !== 'messing' && L.vorm !== 'rond') for (const y of [0.025, H - 0.025]) for (const sx of [-1, 1]) strips.push([sx * (W / 2 - 0.05), y, zA + 0.05, sx * (W / 2 - 0.05), y, zV - 0.05]);
    if (c === 'draad') {  // draadmodel: alle randen neon, kruizen in vloer en wanden
      for (const sx of [-1, 1]) for (const z of [zA, zV]) strips.push([sx * W / 2 * 0.98, 0, z * 0.98, sx * W / 2 * 0.98, H, z * 0.98]);
      for (const sx of [-1, 1]) strips.push([sx * W / 2 * 0.98, 0.02, zA, sx * W / 2 * 0.98, H - 0.02, zV], [sx * W / 2 * 0.98, H - 0.02, zA, sx * W / 2 * 0.98, 0.02, zV]);
      for (let k = 1; k < 4; k++) strips.push([-W / 2, 0.01, zA + Dd * k / 4, W / 2, 0.01, zA + Dd * k / 4], [-W / 2 + W * k / 4, 0.01, zA, -W / 2 + W * k / 4, 0.01, zV]);
    }
    // leuning
    if (c === 'spiegel' || c === 'capsule' || c === 'messing' || c === 'led' || c === 'kristal') for (const sx of [-1, 1]) {
      const x = sx * (xMax(L, 0) + 0.3 - 0.07);
      frame.push([x, 0.95, 0, 0.04, 0.04, Dd - 0.7], [x, 0.95, zA + 0.4, 0.04, 0.04, 0.04], [x, 0.95, zV - 0.4, 0.04, 0.04, 0.04]);
    }
    // vloer en plafond
    if (L.glasVloer) { D.cab.push({ geo: vloerGeo, mat: m.glas, glas: true }); frame.push(...(L.vorm === 'rond' ? [] : [[0, -0.01, 0, 0.06, 0.02, Dd], [0, -0.01, 0, W, 0.02, 0.06]])); }
    else {
      let vm;
      if (c === 'messing') vm = basisMat(L, 0xffffff, { map: marmer(), k: 0.36 });
      else if (c === 'kooi') vm = basisMat(L, 0xffffff, { map: traan(), k: 0.5 });
      else if (c === 'capsule') vm = ledMat(L, 2, { w: W, h: Dd, tint: 0x404858 });
      else if (LED && (c === 'led' || c === 'kristal' || c === 'glasbuis' || rnd() < 0.5)) {
        vm = LED.vloerMat(W, Dd, { palet: pal, tegel: 0.42, zaad: Math.floor(rnd() * 997), helder: 0.7 });
        if (L.vorm === 'rond') { const p = vloerGeo.attributes.position, uv = vloerGeo.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + W / 2) / W, (p.getZ(i) + Dd / 2) / Dd); }
      } else vm = basisMat(L, 0x0c0c10, { k: 0.5 });
      if (vm.map) { const uv = vloerGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * W / 1.2, uv.getY(i) * Dd / 1.2); }
      D.cab.push({ geo: vloerGeo, mat: vm });
    }
    if (L.glasDak) {
      D.cab.push({ geo: plafGeo, mat: m.glas, glas: true });
      if (L.vorm !== 'rond') frame.push([0, H, 0, W, 0.05, 0.08], [0, H, 0, 0.08, 0.05, Dd]);
    } else {
      const pm = c === 'messing' ? ledMat(L, 6, { w: W, h: Dd }) : ledMat(L, 0, { w: W, h: Dd, plafond: true, pzaad: pz(), pitch: 0.05 });
      if (L.vorm !== 'rond') { const uv = plafGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) - 0.5) * W, (uv.getY(i) - 0.5) * Dd); }
      D.cab.push({ geo: plafGeo, mat: pm });
    }
    if (zijGlas) D.cab.push({ geo: zijGlas, mat: m.glas, glas: true });
    D.cab.push({ geo: kopB.geo(), mat: m.kop });
    if (!wandB.leeg()) D.cab.push({ geo: wandB.geo(), mat: m.wand });
    if (!glasB.leeg()) D.cab.push({ geo: glasB.geo(), mat: m.glas, glas: true });
    yield;
    // displays in de cabine: boven de voordeur (naar achter kijkend) en boven de achterdeur
    const dh2 = Math.min(0.2, H - dh - 0.1), dw2 = dh2 * 48 / 9;
    for (const z of [zA, zV]) {
      const g = new THREE.PlaneGeometry(dw2, dh2); if (z > 0) g.rotateY(Math.PI);
      g.translate(0, dh + 0.07 + (H - dh - 0.07) / 2, z - Math.sign(z) * 0.022);
      D.cab.push({ geo: g, mat: m.dispLive });
    }
    frame.push([0, dh + 0.07 + (H - dh - 0.07) / 2, zV - 0.008, dw2 + 0.06, dh2 + 0.06, 0.01], [0, dh + 0.07 + (H - dh - 0.07) / 2, zA + 0.008, dw2 + 0.06, dh2 + 0.06, 0.01]);
    // knoppenpaneel naast de voordeur
    const kb = Math.min(0.16, (L.WB - dw) / 2 - 0.12);
    if (kb > 0.08) { const g = new THREE.PlaneGeometry(kb, 0.42), uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * kb, uv.getY(i) * 0.42); g.rotateY(Math.PI); g.translate(dw / 2 + 0.07 + (L.WB / 2 - dw / 2 - 0.07) / 2, 1.2, zV - 0.012); m.knoppen.uniforms.maat.value.set(kb, 0.42); D.cab.push({ geo: g, mat: m.knoppen }); }
    // extra's per cabine
    if (c === 'kristal') {  // gloeiende prisma's aan het plafond
      const pr = [];
      for (let i = 0; i < 9; i++) { const x = (rnd() - 0.5) * (W - 0.8), z = (rnd() - 0.5) * (Dd - 0.8), l = 0.25 + rnd() * 0.35, mm = new THREE.Matrix4().compose(new THREE.Vector3(x, H - l / 2, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI, rnd() * 3, 0)), new THREE.Vector3(0.06 + rnd() * 0.05, l, 0.06 + rnd() * 0.05)); pr.push({ geo: CONE, m: mm }); }
      D.cab.push({ geo: samen(pr), mat: basisMat(L, L.pb.getHex(), { plus: true, k: 1.4 }) });
    }
    if (c === 'kooi') {  // twee werklampen in een kooitje
      const lampen = [];
      for (const sx of [-1, 1]) { const x = sx * (W / 2 - 0.25); lampen.push({ geo: SPH, m: new THREE.Matrix4().compose(new THREE.Vector3(x, H - 0.18, 0), new THREE.Quaternion(), new THREE.Vector3(0.07, 0.07, 0.07)) }); }
      D.cab.push({ geo: samen(lampen), mat: basisMat(L, 0xffd28a, { k: 1.6 }) });
      for (const sx of [-1, 1]) frame.push([sx * (W / 2 - 0.25), H - 0.06, 0, 0.18, 0.02, 0.18], [sx * (W / 2 - 0.25) - 0.09, H - 0.17, 0, 0.012, 0.22, 0.012], [sx * (W / 2 - 0.25) + 0.09, H - 0.17, 0, 0.012, 0.22, 0.012]);
    }
    if (c === 'messing') {  // wijzerplaat met naald boven de voordeur
      const g = new THREE.CircleGeometry(0.32, 24, 0, Math.PI), p = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i), p.getY(i));
      g.rotateY(Math.PI); g.translate(0, H - 0.38, zV - 0.03);
      D.wijzerPlaat = g; D.cab.push({ geo: g, mat: ledMat(L, 6, { w: 0.64, h: 0.64 }) });
    }
    D.frame = samen(frame);
    D.strips = strips.length && LED && LED.strips ? LED.strips(strips, { palet: pal, zaad: Math.floor(rnd() * 997), helder: 0.9 }) : null;
    yield;
    // --- de schacht: doos rond de cabine (kopvlakken met een gat ter grootte van de vlakke cabinewand) ---
    {
      const b = bak(), hx = (L.vorm === 'rond' ? L.R : W / 2) + 0.3, hz = Dd / 2 + SG, y0 = -30, y1 = 34, gw = L.WB / 2;
      b.quad([-hx, y0, -hz], Z, Y, 2 * hz, y1 - y0); b.quad([hx, y0, -hz], Z, Y, 2 * hz, y1 - y0);
      b.quad([-hx, y1, -hz], X, Z, 2 * hx, 2 * hz); b.quad([-hx, y0, -hz], X, Z, 2 * hx, 2 * hz);
      for (const z of [-hz, hz]) {
        b.quad([-hx, y0, z], X, Y, 2 * hx, -y0); b.quad([-hx, H, z], X, Y, 2 * hx, y1 - H);
        b.quad([-hx, 0, z], X, Y, hx - gw, H); b.quad([gw, 0, z], X, Y, hx - gw, H);
      }
      D.schacht = b.geo();
    }
    // --- sas (frame-ruimte): A = vóór de cabine (z 0..LV), V = erna; eindwand met deurgat naar de lift ---
    {
      const h = GW / 2, zA1 = LV, zV0 = L.C0 + Dd + SG, sasB = bak(), plB = bak(), kopS = bak();
      for (const z0 of [0, zV0]) {
        sasB.quad([-h, 0, z0], Z, Y, LV, GH, z0, 0); sasB.quad([h, 0, z0], Z, Y, LV, GH, z0, 0);
        plB.quad([-h, GH, z0], X, Z, GW, LV);
        wandMetGatSas(kopS, z0 === 0 ? zA1 : zV0, dw, dh);
      }
      D.sas.push({ geo: sasB.geo(), mat: m.sas }, { geo: plB.geo(), mat: m.donker }, { geo: kopS.geo(), mat: m.sas });
      // ledvloer in beide sassen
      for (const z0 of [0, zV0]) {
        const g = new THREE.PlaneGeometry(GW, LV); g.rotateX(-Math.PI / 2); g.translate(0, 0.002, z0 + LV / 2);
        D.sas.push({ geo: g, mat: LED ? (m.sasVloer = m.sasVloer || LED.vloerMat(GW, LV, { palet: pal, tegel: 0.5, zaad: Math.floor(rnd() * 997), helder: 0.55 })) : m.donker });
      }
      // displays boven de liftdeur (A: het vertreklevel met de pijl; V: het level van nu, naar kamer B kijkend) en het bord bij aankomst
      const sh = Math.min(0.17, GH - dh - 0.1), sw = sh * 48 / 9, sy = dh + 0.05 + (GH - dh - 0.05) / 2;
      const gA = new THREE.PlaneGeometry(sw, sh); gA.rotateY(Math.PI); gA.translate(0, sy, zA1 - 0.01); D.sas.push({ geo: gA, mat: m.dispVan });
      const gV = new THREE.PlaneGeometry(sw, sh); gV.translate(0, sy, zV0 + 0.01); D.sas.push({ geo: gV, mat: m.dispLive });
      const bw = 1.55, bh = bw * 9 / 48, bz = L.LEN - 0.55, by = GH - 0.12 - bh / 2;
      const gN = new THREE.PlaneGeometry(bw, bh); gN.rotateY(Math.PI); gN.translate(0, by, bz - 0.03); D.sas.push({ geo: gN, mat: m.dispNaar });
      D.sasFrame = samen([[0, by, bz, bw + 0.08, bh + 0.08, 0.05], [-bw / 3, (GH + by + bh / 2) / 2, bz, 0.02, GH - by - bh / 2, 0.02], [bw / 3, (GH + by + bh / 2) / 2, bz, 0.02, GH - by - bh / 2, 0.02]]);
      // ledstrips: plinten en de deuromlijsting aan de liftkant
      const st = [];
      for (const [z0, z1] of [[0, zA1], [zV0, L.LEN]]) for (const sx of [-1, 1]) st.push([sx * (h - 0.02), 0.02, z0, sx * (h - 0.02), 0.02, z1], [sx * (h - 0.02), GH - 0.02, z0, sx * (h - 0.02), GH - 0.02, z1]);
      for (const [z, s] of [[zA1, -1], [zV0, 1]]) st.push([-dw / 2 - 0.1, 0, z + s * 0.02, -dw / 2 - 0.1, dh + 0.1, z + s * 0.02], [dw / 2 + 0.1, 0, z + s * 0.02, dw / 2 + 0.1, dh + 0.1, z + s * 0.02], [-dw / 2 - 0.1, dh + 0.1, z + s * 0.02, dw / 2 + 0.1, dh + 0.1, z + s * 0.02]);
      D.sasStrips = LED && LED.strips ? LED.strips(st, { palet: pal, zaad: Math.floor(rnd() * 997), helder: 1 }) : null;
    }
  }
  // eindwand van het sas (frame-ruimte, vlak z) rond het liftdeurgat; het sas is GW x GH
  function wandMetGatSas(b, z, dw, dh) {
    const h = GW / 2;
    b.quad([-h, 0, z], X, Y, h - dw / 2, GH, 0, 0);
    b.quad([dw / 2, 0, z], X, Y, h - dw / 2, GH, h + dw / 2, 0);
    b.quad([-dw / 2, dh, z], X, Y, dw, GH - dh, h - dw / 2, dh);
  }
  const deurLatten = L => L.deur === 'rol';
  // zijwanden van een rechthoekige cabine (x = ±W/2): banden van boven naar beneden, sleuven, patrijspoorten, tralies
  function zijwanden(L, wandB, glasB, frame, strips, D, rnd) {
    const W = L.W, Dd = L.D, H = L.H, c = L.cab, zA = -Dd / 2;
    for (const sx of [-1, 1]) {
      const x = sx * W / 2;
      const band = (b, y0, y1) => b.quad([x, y0, zA], Z, Y, Dd, y1 - y0, zA, y0);
      if (c === 'spiegel') {  // zwarte spiegel met twee raamsleuven
        const sb = 0.4, y0 = 0.35, y1 = H - 0.3, zs = [zA + Dd / 3, zA + 2 * Dd / 3];
        band(wandB, 0, y0); band(wandB, y1, H);
        let z = zA;
        for (const zc of zs) { wandB.quad([x, y0, z], Z, Y, zc - sb / 2 - z, y1 - y0, z, y0); glasB.quad([x, y0, zc - sb / 2], Z, Y, sb, y1 - y0, zc - sb / 2, y0); frame.push([x, (y0 + y1) / 2, zc - sb / 2, 0.05, y1 - y0, 0.03], [x, (y0 + y1) / 2, zc + sb / 2, 0.05, y1 - y0, 0.03]); z = zc + sb / 2; }
        wandB.quad([x, y0, z], Z, Y, Dd / 2 - z, y1 - y0, z, y0);
        for (const zc of zs) strips.push([x - sx * 0.03, y0, zc, x - sx * 0.03, y1, zc]);
      } else if (c === 'kooi') {  // open kooi: tralies, regels, schoppen met gevaarstreep
        const n = Math.round(Dd / 0.21);
        for (let i = 0; i <= n; i++) frame.push([x, (0.3 + H) / 2, zA + Dd * i / n, 0.025, H - 0.3, 0.025]);
        for (const y of [0.3, 1.05, 2.05, H - 0.06]) frame.push([x, y, 0, 0.05, 0.05, Dd]);
        frame.push([x, H * 0.55, 0, 0.03, 0.03, Dd]);
        D.kooiGevaar = D.kooiGevaar || bak();
        D.kooiGevaar.quad([x, 0, zA], Z, Y, Dd, 0.3, 0, 0);
      } else if (c === 'draad') {
        band(glasB, 0, H);
      } else if (c === 'capsule') {  // panelen met patrijspoorten (vorm met ronde gaten), glas erin, ringen eromheen
        const n = Dd > 2.65 ? 2 : 1, r = 0.36, yp = 1.55, s = new THREE.Shape();
        s.moveTo(zA, 0); s.lineTo(-zA, 0); s.lineTo(-zA, H); s.lineTo(zA, H); s.lineTo(zA, 0);
        const ring = [];
        for (let i = 0; i < n; i++) {
          const zc = zA + Dd * (i + 1) / (n + 1), hole = new THREE.Path(); hole.absarc(zc, yp, r, 0, Math.PI * 2, true); s.holes.push(hole);
          const disk = new THREE.CircleGeometry(r, 24); disk.rotateY(sx * -Math.PI / 2); disk.translate(x, yp, zc);
          const p = disk.attributes.position, uv = disk.attributes.uv; for (let k = 0; k < p.count; k++) uv.setXY(k, p.getZ(k), p.getY(k));
          D.capsuleGlas = D.capsuleGlas || []; D.capsuleGlas.push(disk);
          ring.push({ geo: new THREE.TorusGeometry(r + 0.02, 0.045, 6, 24), m: new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(x - sx * 0.02, yp, zc) });
        }
        const g = new THREE.ShapeGeometry(s, 24); g.rotateY(sx < 0 ? Math.PI / 2 : -Math.PI / 2);
        if (sx < 0) { const p = g.attributes.position; for (let k = 0; k < p.count; k++) p.setZ(k, -p.getZ(k)); }
        g.translate(x, 0, 0);
        D.capsuleWand = D.capsuleWand || []; D.capsuleWand.push(g);
        for (const rr of ring) frame.push(rr);
      } else if (c === 'messing') {  // hout onder en boven, glas met messing roeden ertussen
        const y0 = 1.0, y1 = H - 0.35;
        band(wandB, 0, y0); band(wandB, y1, H); band(glasB, y0, y1);
        for (let i = 1; i < 4; i++) frame.push([x, (y0 + y1) / 2, zA + Dd * i / 4, 0.035, y1 - y0, 0.035]);
        frame.push([x, y0, 0, 0.05, 0.05, Dd], [x, y1, 0, 0.05, 0.05, Dd], [x, y1 - 0.35, 0, 0.025, 0.025, Dd]);
      } else if (c === 'led') {  // ledwand met een glazen band op ooghoogte
        band(wandB, 0, 1.15); band(glasB, 1.15, 2.05); band(wandB, 2.05, H);
        frame.push([x, 1.15, 0, 0.05, 0.05, Dd], [x, 2.05, 0, 0.05, 0.05, Dd]);
      } else {  // kristal: glas met kristallen stijlen
        band(wandB, 0, 0.12); band(glasB, 0.12, H);
        for (let i = 1; i < 5; i++) frame.push([x, H / 2, zA + Dd * i / 5, 0.02, H, 0.02]);
        for (let i = 1; i < 5; i++) strips.push([x - sx * 0.02, 0.12, zA + Dd * i / 5, x - sx * 0.02, H, zA + Dd * i / 5]);
      }
    }
    if (c === 'kooi' && D.kooiGevaar) { const g = D.kooiGevaar.geo(); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 0.6, uv.getY(i) / 0.3); D.cab.push({ geo: g, mat: basisMat(L, 0xffffff, { map: gevaar(), k: 0.6, zijde: THREE.DoubleSide }) }); }
    if (D.capsuleWand) D.cab.push({ geo: samenvoegen(D.capsuleWand), mat: D.m.wand });
    if (D.capsuleGlas) D.cab.push({ geo: samenvoegen(D.capsuleGlas), mat: D.m.glas, glas: true });
  }

  // ---------- deuren: per soort een object met zet(o), o = 0 dicht .. 1 open (cabine-ruimte; kant A = achter, V = voor) ----------
  const mq = new THREE.Matrix4(), qq = new THREE.Quaternion(), vv = new THREE.Vector3(), ss = new THREE.Vector3(1, 1, 1), ZAS = new THREE.Vector3(0, 0, 1), YAS = new THREE.Vector3(0, 1, 0);
  function paneelGeo(w, h, d) {  // dunne doos met uv in meters (de deurshader rekent in meters)
    const g = new THREE.BoxGeometry(w, h, d), p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) + w / 2, p.getY(i) + h / 2);
    g.deleteAttribute('normal'); return g;
  }
  function deurMaken(L, kant) {
    const D = L.deel, m = D.m, dw = L.dw, dh = L.dh, s = kant === 'A' ? -1 : 1, z = s * (L.D / 2 + 0.035), g = new THREE.Group();
    const deel = (k, fn) => D.deur[k] || (D.deur[k] = fn());
    let zet;
    if (L.deur === 'schuif') {
      const geo = deel('p2', () => paneelGeo(dw / 2 + 0.02, dh, 0.03)), a = new THREE.Mesh(geo, m.deur), b = new THREE.Mesh(geo, m.deur);
      a.position.set(-dw / 4, dh / 2, z); b.position.set(dw / 4, dh / 2, z); g.add(a, b);
      zet = o => { const e = eas(o) * dw / 2; a.position.x = -dw / 4 - e; b.position.x = dw / 4 + e; };
    } else if (L.deur === 'tele') {
      const geo = deel('p3', () => paneelGeo(dw / 3 + 0.02, dh, 0.025)), p = [0, 1, 2].map(i => { const x = new THREE.Mesh(geo, m.deur); x.position.set(-dw / 3 + i * dw / 3, dh / 2, z + s * i * 0.03); g.add(x); return x; });
      zet = o => { const e = eas(o); p.forEach((x, i) => { const x0 = -dw / 3 + i * dw / 3; x.position.x = x0 + (-dw / 3 - x0) * e - e * dw * 0.32; }); };
    } else if (L.deur === 'luik') {
      const geo = deel('ph', () => paneelGeo(dw + 0.02, dh / 2 + 0.01, 0.035)), a = new THREE.Mesh(geo, m.deur), b = new THREE.Mesh(geo, m.deur);
      g.add(a, b); a.position.set(0, dh * 0.75, z); b.position.set(0, dh * 0.25, z);
      zet = o => { const e = eas(o) * (dh / 2 + 0.06); a.position.y = dh * 0.75 + e; b.position.y = dh * 0.25 - e; };
    } else if (L.deur === 'rol') {
      const geo = deel('pr', () => paneelGeo(dw + 0.02, dh, 0.03)), a = new THREE.Mesh(geo, m.deur);
      g.add(a); a.position.set(0, dh / 2, z);
      zet = o => { a.position.y = dh / 2 + eas(o) * (dh + 0.08) + 0.01 * Math.sin(o * 40) * (o > 0 && o < 1 ? 1 : 0); };
    } else if (L.deur === 'harmonica') {  // harmonica: lamellen die zigzag naar links vouwen (randen blijven aan elkaar)
      const n = 9, w = dw / n, geo = deel('lam', () => paneelGeo(w, dh, 0.02)), im = new THREE.InstancedMesh(geo, m.deurBasis, n);
      im.frustumCulled = false; g.add(im);
      const zh = s * (L.D / 2 - 0.05);
      zet = o => {
        const th = eas(o) * 1.32, cw = w * Math.cos(th);
        for (let i = 0; i < n; i++) { qq.setFromAxisAngle(YAS, i % 2 ? th : -th); vv.set(-dw / 2 + (i + 0.5) * cw, dh / 2, zh); im.setMatrixAt(i, mq.compose(vv, qq, ss)); }
        im.instanceMatrix.needsUpdate = true;
      };
    } else {  // iris: plaat met een rond gat, 8 bladen die om hun scharnier aan de rand wegdraaien
      // de bladen mogen niet buiten de cabine uitsteken (zijn dan door het zijglas te zien): straal begrensd (gerekend: max |x| ~1,27 ri)
      const ri = Math.min(Math.min(dw, dh) / 2 - 0.04, (L.WB / 2 - 0.08) / 1.27), cy = Math.max(dh / 2, ri + 0.05);
      const plaat = deel('plaat', () => {
        const sh = new THREE.Shape(); sh.moveTo(-dw / 2, 0); sh.lineTo(dw / 2, 0); sh.lineTo(dw / 2, dh); sh.lineTo(-dw / 2, dh); sh.lineTo(-dw / 2, 0);
        const ho = new THREE.Path(); ho.absarc(0, cy, ri, 0, Math.PI * 2, true); sh.holes.push(ho);
        return new THREE.ShapeGeometry(sh, 32);
      });
      const pm = new THREE.Mesh(plaat, m.kop); pm.position.z = s * L.D / 2; g.add(pm);
      const n = 8, sec = Math.PI * 2 / n, piv = new THREE.Vector2(Math.cos(sec + 0.2) * ri * 1.04, Math.sin(sec + 0.2) * ri * 1.04);
      const blad = deel('blad', () => {
        const sh = new THREE.Shape(), r2 = ri * 1.15;
        sh.moveTo(-piv.x, -piv.y); sh.lineTo(Math.cos(-0.15) * r2 - piv.x, Math.sin(-0.15) * r2 - piv.y); sh.lineTo(Math.cos(sec + 0.3) * r2 - piv.x, Math.sin(sec + 0.3) * r2 - piv.y); sh.lineTo(-piv.x, -piv.y);
        return new THREE.ShapeGeometry(sh);
      });
      const im = new THREE.InstancedMesh(blad, m.deurBasis, n); im.frustumCulled = false; g.add(im);
      for (let k = 0; k < n; k++) im.setColorAt(k, new THREE.Color().setScalar(k % 2 ? 0.62 : 1));
      const s97 = new THREE.Vector3(0.97, 0.97, 1);
      const zb = s * (L.D / 2 + 0.03);
      zet = o => {
        const e = eas(o), al = e, sc = 1 - 0.7 * e;  // draaien om het scharnier en krimpen: de bladen verdwijnen in de rand
        for (let k = 0; k < n; k++) {
          const b = k * sec, c = Math.cos(b), si = Math.sin(b);
          vv.set(piv.x * c - piv.y * si, cy + piv.x * si + piv.y * c, zb + k * 0.002 * s);
          qq.setFromAxisAngle(ZAS, b + al); s97.set(0.97 * sc, 0.97 * sc, 1); im.setMatrixAt(k, mq.compose(vv, qq, s97));
        }
        im.instanceMatrix.needsUpdate = true;
      };
    }
    zet(0);
    return { g, zet, o: 0 };
  }

  // ---------- een helft bouwen (generator): sas A, cabine, schacht, sas V, deuren ----------
  const alleL = new Set();
  function* bouw(parent, frame, ov) {
    const L = ov.L;
    if (!L.deel) yield* delenMaken(L);
    const D = L.deel, h = new THREE.Group();
    h.position.set(frame.x, 0, frame.z); h.name = 'lift';
    parent.add(h);
    const cab = new THREE.Group(); cab.position.z = L.C0 + L.D / 2; h.add(cab);
    for (const d of D.cab) { const x = new THREE.Mesh(d.geo, d.mat); if (d.glas) x.renderOrder = 2; cab.add(x); }
    if (D.frame) cab.add(new THREE.Mesh(D.frame, D.m.metaal));
    if (D.strips) cab.add(new THREE.Mesh(D.strips.geometry, D.strips.material));
    if (D.wijzerPlaat) {  // naald van de wijzer (messing)
      const nd = new THREE.Mesh(D.naald || (D.naald = (() => { const g = new THREE.BoxGeometry(0.018, 0.28, 0.01); g.translate(0, 0.14, 0); return g; })()), D.m.metaal);
      nd.position.set(0, L.H - 0.38, L.D / 2 - 0.04); cab.add(nd); h.userData.naald = nd;
    }
    const sch = new THREE.Mesh(D.schacht, D.m.uitzicht); sch.frustumCulled = false; cab.add(sch);
    yield;
    for (const d of D.sas) h.add(new THREE.Mesh(d.geo, d.mat));
    if (D.sasFrame) h.add(new THREE.Mesh(D.sasFrame, D.m.metaal));
    if (D.sasStrips) h.add(new THREE.Mesh(D.sasStrips.geometry, D.sasStrips.material));
    const deuren = { A: deurMaken(L, 'A'), V: deurMaken(L, 'V') };
    cab.add(deuren.A.g, deuren.V.g);
    h.userData.lift = { L, cab, deuren };
    L.helften.add(h); alleL.add(L);
    beeldHelft(L, h);
    return h;
  }

  // ---------- toestand ----------
  function zetFase(L, f) { L.fase = f; L.tFase = 0; }
  const DEUREN_DICHT = new Set(['sluit', 'start', 'rit', 'aankomst']), STAND_NR = { groove: 0, break: 1, opbouw: 2, drop: 3 };
  const opDeTel = () => { const b = typeof beatPos === 'number' ? beatPos : 0; return b - Math.floor(b) < 0.08; };
  // info: { kant: 'A' (loper nog in kamer A / de lift erachter) | 'B', d: m vanaf het begin van deze helft, wissel: al gewisseld }
  function stap(L, dt, info) {
    L.tFase += dt;
    const sh = doolhof.show || {}, R = window.clubRegie;
    // drop tijdens de rit: lichtexplosie
    if (sh.stand === 'drop' && sh.drop > 0.5 && R && R.dropBeat !== L.dropGezien && DEUREN_DICHT.has(L.fase)) { L.dropGezien = R.dropBeat; L.explosie = 1; L.schok = Math.max(L.schok, 1.3); }
    L.explosie *= Math.exp(-dt * 0.55);
    switch (L.fase) {
      case 'wacht': if (info.kant === 'A' && info.d > -5) zetFase(L, 'roep'); break;
      case 'roep': L.deurA = Math.min(1, L.deurA + dt / L.tDeur); if (L.deurA >= 1) zetFase(L, 'open'); break;
      case 'instap':
        L.deurA = Math.min(1, L.deurA + dt / L.tDeur);
        if (L.camBinnen && L.deurA >= 1 && (opDeTel() || L.tFase > 3.2)) zetFase(L, 'sluit');
        break;
      case 'sluit': L.deurA = Math.max(0, L.deurA - dt / L.tDeur); if (L.deurA <= 0) zetFase(L, 'start'); break;
      case 'start': if (L.tFase > 0.25 && (opDeTel() || L.tFase > 0.7)) { zetFase(L, 'rit'); L.schok = Math.max(L.schok, 0.9); } break;
      case 'rit': rit(L, dt, info); break;
      case 'aankomst': if (L.tFase > 0.6 && L.camAchter) zetFase(L, 'opent'); break;
      case 'opent': L.deurV = Math.min(1, L.deurV + dt / L.tDeur); if (L.deurV >= 1) zetFase(L, 'uit'); break;
      case 'uit': if (info.kant === 'B' && info.d > L.LEN + 0.6) zetFase(L, 'klaar'); break;
      case 'klaar': if (L.tFase > 3) L.deurV = Math.max(0, L.deurV - dt / L.tDeur); break;
    }
    // vering: de cabine zakt bij optrekken door en schiet bij het afremmen door; daarna naveren
    const doel = -L.richting * L.a * 0.012, ka = 110 * (doel - L.veer) - 3.2 * L.veerV;
    L.veerV += ka * Math.min(dt, 0.05); L.veer += L.veerV * Math.min(dt, 0.05);
    L.schok *= Math.exp(-dt * 5);
    const lvl = L.van + L.richting * Math.floor((L.pos + 1e-3) / L.levelH);
    L.level = lvl;
    beeldL(L, dt); for (const h of L.helften) beeldHelft(L, h);
    L.stapBeeld = beeldNr;
  }
  function rit(L, dt, info) {
    const sh = doolhof.show || {}, st = sh.stand;
    let fct = st === 'opbouw' ? 1 + 1.3 * (sh.opbouw || 0) : st === 'break' ? 0.75 : st === 'drop' ? 1.2 : 1;
    fct *= 1 + 0.7 * L.explosie;
    const vDoel = L.vmax * fct, rest = L.doelPos - L.pos;
    if (!L.remt && rest <= L.v * L.v / (2 * L.rem) + 0.02) {
      if (info.wissel) L.remt = true;
      else { L.doelPos += L.levelH; L.verlengd += 1; }  // de volgende kamer is nog niet klaar: een level verder
    }
    if (L.remt) L.a = rest > 1e-3 ? Math.max(-L.v * L.v / (2 * rest), -L.rem * 2.5) : -L.rem;
    else L.a = Math.max(-L.rem, Math.min(L.acc, (vDoel - L.v) * 2.2));
    L.v = Math.max(0, L.v + L.a * dt);
    L.pos += L.v * dt;
    if (L.remt && (L.pos >= L.doelPos - 0.003 || L.v < 0.04)) {
      L.pos = L.doelPos; L.v = 0; L.a = 0; L.schok = Math.max(L.schok, 0.8);
      L.naar = L.van + L.richting * Math.round(L.doelPos / L.levelH);
      zetFase(L, 'aankomst');
    }
  }
  const magWissel = L => (L.fase === 'rit' && L.tFase > 0.3) || L.fase === 'aankomst';
  // de loper staat in de cabine: camera mee naar binnen (vanaf het beeld van nu), deuren sluiten zodra hij binnen is
  function instap(L, camP, camL, half) {
    zetFase(L, 'instap');
    const c = cabWereld(half, wv);
    L.cam = { van: { p: camP.clone().sub(c), l: camL.clone().sub(c), fov: 58 }, t: 0, dur: 0.9, hold: 0, naar: 'binnen', lijst: L.camLijst.slice() };
    L.camBinnen = false; L.camAchter = false;
  }

  // ---------- camera in de cabine (cabine-ruimte: oorsprong midden van de vloer, +z = naar de voordeur) ----------
  const wv = new THREE.Vector3(), P1 = { p: new THREE.Vector3(), l: new THREE.Vector3(), fov: 60 }, P2 = { p: new THREE.Vector3(), l: new THREE.Vector3(), fov: 60 }, wp = new THREE.Vector3(), cv = new THREE.Vector3();
  function cabWereld(half, uit) { half.updateWorldMatrix(true, false); return uit.set(0, 0, 0).applyMatrix4(half.userData.lift.cab.matrixWorld); }
  function pose(L, naam, u, P) {
    const s = L.camZij, Dd = L.D, H = L.H;
    switch (naam) {
      case 'binnen': P.p.set(0.22 * s, 1.74, -Dd / 2 + 0.36); P.l.set(0.1 * s, 1.45, Dd / 2 + 1); P.fov = 64; break;
      case 'achter': P.p.set(0, OOG, -Dd / 2 + CAM_ACHTER); P.l.set(0, 1.5, Dd / 2 + 0.6); P.fov = 60; break;   // ~ de volgcamera van de kern bij het uitstappen
      case 'voor': { const z = Dd / 2 - 0.36; P.p.set(s * (xMax(L, z) - 0.05), 1.6 + 0.05 * Math.sin(u * 0.6), z); P.l.set(-s * 0.15, 1.3, -Dd / 2 - 0.6); P.fov = 68; break; }
      case 'hoek': { const z = -Dd / 2 + 0.36, k = 0.5 + 0.5 * Math.sin(u * 0.4); P.p.set(s * xMax(L, z), 0.7 + 0.4 * k, z); P.l.set(-s * 0.9, 2.1 + 0.3 * Math.sin(u * 0.3), Dd / 2); P.fov = 74; break; }
      case 'plafond': { const a = L.camA + u * 0.3 * L.camDraai; P.p.set(0.3 * s * Math.cos(a * 0.7), 1.4, -0.42); P.l.set(Math.cos(a) * 0.9, H + 2.6, Math.sin(a) * 0.9 - 0.2); P.fov = 84; break; }
      case 'raamV': case 'raamA': {  // bij een raam (sleuf, patrijspoort of glaswand), naar buiten en schuin omhoog of omlaag de schacht in
        const R = L.ramen, zr = naam === 'raamV' ? R.v : R.a, z = zr + R.zw * Math.sin(u * 0.25), xm = xMax(L, z), y = R.y;
        P.p.set(s * (xm + 0.3 - R.d), y, z); P.l.set(s * (xm + 4), y + (L.raamOp ? 2.4 : -2.4), z + R.kz * (naam === 'raamV' ? -1 : 1) * (0.6 + 0.5 * Math.sin(u * 0.3))); P.fov = R.fov; break;
      }
      case 'rond': { const a = L.camA + u * 0.42 * L.camDraai, r = Math.min(xMax(L, 0) + 0.3, Dd / 2) - 0.38; P.p.set(Math.sin(a) * r, 1.62, ZL + Math.cos(a) * r); P.l.set(0, 1.3, ZL); P.fov = 68; break; }
      case 'gezicht': { const z = Dd / 2 - 0.34; P.p.set(s * 0.45, 1.5 + 0.06 * Math.sin(u * 0.5), z); P.l.set(-s * 0.05, 1.55, ZL - 1.2); P.fov = 60; break; }
      case 'vloer': P.p.set(s * 0.55, 2.15, -0.45); P.l.set(s * 0.15, -4, 0.7); P.fov = 80; break;
      default: P.p.set(-s * 0.5, 1.35, 0.55); P.l.set(s * 0.2, H + 6, -0.3); P.fov = 82;  // 'dak': door het glazen dak omhoog
    }
  }
  // binnen de cabine houden en niet door de loper heen (hoofd ~1,85 m, schouders ~0,45 m van de as)
  function binnenHouden(L, p) {
    const Dd = L.D, zMin = -Dd / 2 + 0.3, zMax = Dd / 2 - 0.3;
    if (p.z > zMin - 0.05) {  // (vóór de achterdeur: de instap komt door de deuropening)
      p.z = Math.min(zMax, Math.max(zMin, p.z));
      const xm = xMax(L, p.z); p.x = Math.min(xm, Math.max(-xm, p.x));
    }
    p.y = Math.min(L.H - 0.28, Math.max(0.35, p.y));
    const dx = p.x, dz = p.z - ZL, d = Math.hypot(dx, dz);
    if (p.y < 2.05 && d < 0.58) { const k = 0.58 / Math.max(d, 1e-3); p.x = d < 1e-3 ? 0.58 * L.camZij : dx * k; p.z = ZL + dz * k; }
  }
  // overgang van pose A naar B: over de schouder (boven de loper langs) als B aan de andere kant van de loper ligt
  function meng(L, A, Bp, k, uit) {
    const e = eas(k);
    if ((A.p.z - ZL) * (Bp.p.z - ZL) < 0 && Math.abs(A.p.z - Bp.p.z) > 0.4) {
      wp.set(L.camZij * 0.62, Math.min(L.H - 0.3, 2.3), ZL);
      cv.copy(wp).multiplyScalar(2).sub(A.p).sub(Bp.p).multiplyScalar(0.5).add(wp);  // controlepunt: de kromme gaat door wp
      const a = (1 - e) * (1 - e), b = 2 * (1 - e) * e, c = e * e;
      uit.p.set(A.p.x * a + cv.x * b + Bp.p.x * c, A.p.y * a + cv.y * b + Bp.p.y * c, A.p.z * a + cv.z * b + Bp.p.z * c);
      // de blik zwenkt via het zijraam (naar buiten, de schacht in) in plaats van dwars door de cabine
      wp.set(L.camZij * (xMax(L, ZL) + 4), 1.9, ZL); cv.copy(wp).multiplyScalar(2).sub(A.l).sub(Bp.l).multiplyScalar(0.5).add(wp);
      uit.l.set(A.l.x * a + cv.x * b + Bp.l.x * c, A.l.y * a + cv.y * b + Bp.l.y * c, A.l.z * a + cv.z * b + Bp.l.z * c);
    } else { uit.p.lerpVectors(A.p, Bp.p, e); uit.l.lerpVectors(A.l, Bp.l, e); }
    uit.fov = A.fov + (Bp.fov - A.fov) * e;
  }
  // pose van dit moment: overgang van C.van (vast beeld bij het begin van de beweging) naar de (bewegende) pose C.naar
  function huidig(L, C, uit) {
    const k = Math.min(1, C.t / C.dur);
    pose(L, C.naar, C.t, P2);
    if (k < 1) meng(L, C.van, P2, k, uit); else { uit.p.copy(P2.p); uit.l.copy(P2.l); uit.fov = P2.fov; }
    return k;
  }
  function kruist(L, a, b) { pose(L, a, 0, P1); const za = P1.p.z; pose(L, b, 0, P1); return (za - ZL) * (P1.p.z - ZL) < 0; }
  function volgende(L, naam, dur, hold) {
    const C = L.cam;
    huidig(L, C, P1);
    C.van.p.copy(P1.p); C.van.l.copy(P1.l); C.van.fov = P1.fov;
    C.naar = naam; C.t = 0; C.dur = dur; C.hold = hold || 0;
  }
  // camera van dit beeld in wereldcoördinaten (uitP, uitL); geeft de fov terug
  function cam(L, half, dt, uitP, uitL) {
    const C = L.cam; if (!C) return 58;
    C.t += dt;
    const eind = L.fase === 'aankomst' || L.fase === 'opent' || L.fase === 'uit' || L.fase === 'klaar' || (L.fase === 'rit' && (L.remt || ritRest(L) < 2.6));
    if (eind) { if (C.naar !== 'achter') volgende(L, 'achter', kruist(L, C.naar, 'achter') ? 2.0 : 1.5, 0); }
    else if (C.t >= C.dur + C.hold) {
      if (C.naar === 'binnen') volgende(L, 'voor', 1.8, 0);
      else if (L.fase === 'rit') {
        let n = C.lijst.length ? C.lijst.shift() : L.camLijst[Math.floor(Math.random() * L.camLijst.length)];
        if (n === C.naar) n = C.lijst.length ? C.lijst.shift() : n === 'rond' ? 'hoek' : 'rond';
        volgende(L, n, kruist(L, C.naar, n) ? 2.2 : 1.4, 1.8 + Math.random() * 1.8);
      }
    }
    const k = huidig(L, C, P1);
    if (C.naar !== 'binnen' || C.t >= C.dur * 0.75) L.camBinnen = true;
    L.camAchter = C.naar === 'achter' && k >= 1;
    binnenHouden(L, P1.p);
    // schok en trilling: sterker bij snelheid, vertrek/aankomst en de explosie; de vering laat het beeld even zakken/veren
    const tr = (0.0025 + 0.00045 * Math.abs(L.v)) * L.schokK + L.schok * 0.03 * L.schokK + L.explosie * 0.03, tt = performance.now() / 1000;
    if (L.fase === 'rit' || L.schok > 0.02 || L.explosie > 0.02) {
      P1.p.x += tr * Math.sin(tt * 37.1); P1.p.y += tr * Math.sin(tt * 43.7 + 1) - L.veer * 0.3;
      P1.l.x += tr * 1.6 * Math.sin(tt * 29.3 + 2); P1.l.y += tr * 1.6 * Math.sin(tt * 31.9) - L.veer * 0.3;
    }
    const c = cabWereld(half, wv);
    uitP.copy(P1.p).add(c); uitL.copy(P1.l).add(c);
    return P1.fov;
  }
  function ritRest(L) {  // geschatte resttijd van de rit (s)
    if (L.fase !== 'rit') return 99;
    const rest = Math.max(0, L.doelPos - L.pos), v = Math.max(L.v, 0.5);
    return rest / v + v / Math.max(L.rem, 0.5) * 0.5;
  }

  // lamp van de cabine (de geleende kamerlampen van de kern): i = 0 plafond, 1 laag bij de voordeur
  const lk = new THREE.Color();
  function licht(L, half, i, lamp, k) {
    const sh = doolhof.show, puls = typeof pulse === 'number' ? pulse : 0, en = typeof energy === 'number' ? energy : 0.6;
    const c = cabWereld(half, wv);
    if (i === 0) {
      lamp.position.set(c.x, L.H - 0.3, c.z);
      if (sh && sh.kleur) sh.kleur(0, lk).lerp(L.pa, 0.5); else lk.copy(L.pa);
      lamp.color.copy(lk).lerp(LU.k0.value, 0.2);
      lamp.intensity = ((0.9 + 1.4 * puls * en) * (1 - 0.6 * (sh ? sh.blackout : 0)) + 3 * L.explosie * Math.exp(-((beatPos % 1) * 4)) + 2 * (sh ? sh.flits : 0)) * k;
      lamp.distance = 6; lamp.decay = 1.5;
    } else {
      lamp.position.set(c.x, 0.4, c.z + L.D / 2 - 0.4);
      lamp.color.copy(L.pb); lamp.intensity = (0.4 + 0.6 * puls) * k * (1 - 0.5 * (sh ? sh.blackout : 0)); lamp.distance = 4; lamp.decay = 1.5;
    }
    lamp.updateMatrix();
  }

  // ---------- beeld: uniforms, displays, kleuren, deuren ----------
  let beeldNr = 0;
  const cel = [0, 0, 0, 0, 0, 0, 0, 0], nCel = [0, 0, 0, 0, 0, 0, 0, 0];
  function cellen(n, pijl, uit) {
    const a = Math.min(99, Math.abs(Math.round(n)));
    uit[0] = G_L; uit[1] = G_V; uit[2] = G_L; uit[3] = G_LEEG; uit[4] = n < 0 ? G_MIN : G_LEEG; uit[5] = Math.floor(a / 10); uit[6] = a % 10; uit[7] = pijl;
  }
  function display(m, n, volg, rol, pijl, knip) {
    const u = m.uniforms;
    cellen(n, pijl, cel); cellen(volg, pijl, nCel);
    u.gA.value.set(cel[0], cel[1], cel[2], cel[3]); u.gB.value.set(cel[4], cel[5], cel[6], cel[7]);
    u.nA.value.set(nCel[0], nCel[1], nCel[2], nCel[3]); u.nB.value.set(nCel[4], nCel[5], nCel[6], nCel[7]);
    u.rol.value = rol; u.knip.value = knip;
  }
  function beeldL(L, dt) {
    const U = L.U, D = L.deel; if (!D) return;
    U.rit.value = L.richting * L.pos + L.veer; U.snel.value = L.richting * L.v; U.explosie.value = L.explosie;
    const sh = doolhof.show, b = typeof beatPos === 'number' ? beatPos : 0, puls = typeof pulse === 'number' ? pulse : 0, en = typeof energy === 'number' ? energy : 0.6;
    const pijl = L.richting > 0 ? G_OP : G_NEER, rijdt = L.fase === 'rit' || L.fase === 'start';
    const fr = L.pos / L.levelH - Math.floor((L.pos + 1e-3) / L.levelH), rol = rijdt && L.v > 0.15 ? glad(fr, 0.6, 1) : 0;
    const knip = rijdt ? (b % 1 < 0.5 ? 1 : 0.2) : L.fase === 'aankomst' || L.fase === 'opent' ? (Math.sin(performance.now() / 90) > 0 ? 1 : 0.15) : 1;
    display(D.m.dispLive, L.level, L.level + L.richting, rol, rijdt || L.fase === 'sluit' ? pijl : L.fase === 'wacht' || L.fase === 'roep' || L.fase === 'open' || L.fase === 'instap' ? pijl : G_LEEG, knip);
    display(D.m.dispVan, L.fase === 'wacht' || L.fase === 'roep' || L.fase === 'open' || L.fase === 'instap' || L.fase === 'sluit' ? L.van : L.level, L.level, 0, pijl, b % 1 < 0.5 ? 1 : 0.3);
    display(D.m.dispNaar, L.level, L.level + L.richting, rol, G_LEEG, 1);
    // basiskleuren (metaal, hout, marmer, lampjes) op de show: puls, break gedimd, flits, explosie
    const ao = 1 - 0.55 * (sh ? sh.blackout : 0), fl = sh ? sh.flits : 0, ex = L.explosie * Math.exp(-(b % 1) * 4);
    const kex = 0.35 * L.explosie, k0 = LU.k0.value;  // explosie: alles kleurt mee in de showkleur, wit alleen vlak op de tel
    for (const x of D.basis) {
      const v = (x.plus ? 0.35 + 1.0 * puls * en : 0.6 + 0.45 * puls * en) * ao * x.k, c = x.m.color;
      c.copy(x.c).multiplyScalar(v + 0.8 * ex);
      if (kex > 0.007) { c.r += k0.r * kex; c.g += k0.g * kex; c.b += k0.b * kex; }
      if (fl > 0 || ex > 0.01) c.addScalar(0.5 * fl + 0.2 * ex);
    }
    void dt;
  }
  function beeldHelft(L, h) {
    const x = h.userData.lift; if (!x) return;
    if (x.deuren.A.o !== L.deurA) { x.deuren.A.o = L.deurA; x.deuren.A.zet(L.deurA); }
    if (x.deuren.V.o !== L.deurV) { x.deuren.V.o = L.deurV; x.deuren.V.zet(L.deurV); }
    if (h.userData.naald) {  // wijzer: van het vertreklevel (links) naar de bestemming (rechts)
      const t = Math.min(1, Math.max(0, (L.level - L.van) / ((L.naar - L.van) || 1)));
      h.userData.naald.rotation.z = 1.25 - 2.5 * t;
    }
  }
  // elk beeld: gedeelde uniforms, en de liften die de kern deze frame niet zelf stapt (stilstaand, in een kamer)
  clubHooks.push(dt => {
    beeldNr++;
    const sh = doolhof.show, R = window.clubRegie, b = Math.max(0, typeof beatPos === 'number' ? beatPos : 0), st = (sh && sh.stand) || (R && R.stand) || 'groove';
    LU.tijd.value = (performance.now() / 1000) % 1000; LU.tel.value = b % 1024;
    LU.puls.value = typeof pulse === 'number' ? pulse : 0; LU.energie.value = typeof energy === 'number' ? energy : 0.6;
    if (typeof bands !== 'undefined') { LU.bas.value = bands[0].v; LU.mid.value = bands[1].v; LU.hoog.value = bands[2].v; }
    LU.flits.value = sh ? sh.flits : 0; LU.blackout.value = sh ? sh.blackout : 0; LU.opbouw.value = sh ? sh.opbouw : 0;
    const sn = STAND_NR[st] || 0;
    LU.stand.value = sn;
    LU.showMix.value = st === 'break' ? 0.7 : st === 'drop' ? 0.8 : st === 'opbouw' ? 0.25 + 0.45 * ((sh && sh.opbouw) || 0) : 0.15;
    if (sh && sh.kleur) { sh.kleur(0, LU.k0.value); sh.kleur(1, LU.k1.value); sh.kleur(2, LU.k2.value); }
    const d = st === 'break' ? 32 : st === 'drop' ? 4 : st === 'opbouw' ? ((sh && sh.opbouw) < 0.5 ? 8 : 4) : 16;
    LU.snit.value = sn * 1000 + (Math.floor(b / d) % 997);
    LU.zwaar.value = typeof KW !== 'undefined' && KW.stand === 'minimaal' ? 2 : typeof KW !== 'undefined' && KW.stand === 'laag' ? 1 : 0;
    if (!alleL.size) return;
    const levend = doolhof.levend || (o => { while (o.parent) o = o.parent; return o === scene; });
    for (const L of alleL) {
      for (const h of L.helften) if (!levend(h)) L.helften.delete(h);
      if (!L.helften.size) { alleL.delete(L); continue; }
      if (L.stapBeeld === beeldNr - 1) continue;  // de kern stapte hem vorige frame al (en doet dat zo weer)
      L.explosie *= Math.exp(-dt * 0.55);
      beeldL(L, dt); for (const h of L.helften) beeldHelft(L, h);
    }
  });

  // ---------- naar buiten ----------
  const LIFT = function (o) {  // test: doolhof.lift({ cabine, uitzicht, deur, richting, levels, kamer })
    o = o || {};
    doolhof.liftKeus = { cabine: o.cabine, uitzicht: o.uitzicht, deur: o.deur, richting: o.richting, levels: o.levels };
    doolhof.volgendeOvergang = 'lift';
    doolhof.liftTest = o.snel === false ? 0 : 1;  // eerste kamer kort (kern): meteen door naar de lift
    if (doolhof.voorraadWeg) doolhof.voorraadWeg();
    if (S.cam !== 'doolhof') S.cam = 'doolhof';
    if (typeof syncUI === 'function') syncUI();
    doolhof.start(o.kamer || 'gang-kamer', true);
    return 'lift na ' + (o.kamer || 'gang-kamer');
  };
  Object.assign(LIFT, {
    klaar: () => true, plan, zetVan, bouw, stap, instap, cam, licht, magWissel, LEN: L => L.LEN,
    CABINES, UITZICHT, DEUREN: ALLE_DEUREN, U: LU,
    info() {
      const z = doolhof.toestand && doolhof.toestand(), X = z && z.lift, L = X ? X.L : [...alleL].pop();
      if (!L) return null;
      return { fase: L.fase, level: L.level, van: L.van, naar: L.naar, richting: L.richting, afstand: L.afstand, v: Math.round(L.v * 10) / 10, pos: Math.round(L.pos * 10) / 10,
        cabine: L.cab, uitzicht: L.uit, deur: L.deur, levelH: Math.round(L.levelH * 100) / 100, vmax: Math.round(L.vmax * 10) / 10, explosie: Math.round(L.explosie * 100) / 100,
        cam: L.cam && L.cam.naar, verlengd: L.verlengd, glasVloer: L.glasVloer, glasDak: L.glasDak, gewisseld: !!(X && X.gewisseld) };
    },
  });
  doolhof.lift = LIFT;
  doolhof.liftInfo = LIFT.info;
  if (doolhof.level == null) doolhof.level = 0;
})();

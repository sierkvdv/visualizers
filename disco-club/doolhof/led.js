// --- LED-bibliotheek van het doolhof: bewegende ledschermen, ledvloeren en ledstrips (window.doolhof.led) ---
// Niets in het doolhof staat stil: muren, plafonds, pilaren en podia zijn een ledscherm (of donker), vloeren een ledvloer zoals in zaal 1,
// randen, deurposten, trappen en kozijnen een ledstrip met looplicht. De muurschilderingen (tex/doolhof/*.jpg) zijn beeldmateriaal OP de
// schermen (bewegend, met effecten, op de tel), nooit meer een stilstaand plaatje.
//
// GEBRUIK (in maak(ctx) van een kamer of in een gangstijl; zaad altijd uit de eigen toevalsreeks, dan blijven identieke gangen identiek):
//   const L = doolhof.led, pal = { a: kleurA, b: kleurB, c: kleurC, donker: 0x030006 };   // THREE.Color of hex
//   wand.material = L.scherm({ bron: 'kosmos', palet: pal, maat: { w: 8, h: 3.5 }, zaad: rnd() * 1000 });
//   const v = L.vloer(8, 10, { palet: pal, tegel: 0.6, zaad }); v.position.set(x, 0.01, z); groep.add(v);  // ligt al plat (xz, boven = +y)
//   const s = L.strip(2.6, { palet: pal, zaad }); s.position.set(...); s.rotation.z = Math.PI / 2;      // ligt langs de lokale x-as
//   const k = L.strips([[x1, y1, z1, x2, y2, z2], ...], { palet: pal, zaad });                          // heel kozijn/trap in één draw
//   const p = L.paneel(4, 2.25, { bron: 'arcade', palet: pal, zaad });                                  // vlak met scherm (maat al gezet)
// scherm(opts) => THREE.RawShaderMaterial (is ook een ShaderMaterial; niet clonen: dan raakt hij de gedeelde uniforms kwijt). opts:
//   bron    naam uit tex/doolhof (zonder .jpg) | THREE.Texture | null (geen beeld) | weggelaten (een muurschildering uit het zaad)
//   palet   { a, b, c, donker }; in break/drop schuift het naar de kleuren van doolhof.show (break koel, drop heet)
//   maat    { w, h } in m van het uv-vlak 0..1 (standaard 4 x 2,5): bepaalt het ledraster en de beeldverhouding
//   pitch   m per ledpixel (standaard 0,05); zaad (getal); helder 0..1+ (standaard 1); modi ['beeld','patroon','tekst','golf'] of
//           { beeld: 2, patroon: 1, ... } (gewichten); spiegel: true = uv links-rechts omgedraaid (BackSide-doos van binnen);
//   zijde   THREE.FrontSide/BackSide/DoubleSide; zwaar 0/1/2 (ctx.zwaar; 2 = tv: geen puntraster/scanlijn), standaard uit de kwaliteitsstand
//   instanced: true = voor een InstancedMesh (de plek van elke instantie geeft een eigen zaad). Uv's van de geometrie: 0..1 over het vlak.
// vloer(w, d, opts) => Mesh (één draw); opts: { palet, tegel (m, standaard 0,6), zaad, helder, zwaar }; vloerMat(w, d, opts) = alleen het materiaal
// strip(lengte, opts) => Mesh; strips(lijst, opts) => één Mesh; opts: { palet, zaad, helder, dik (0,035), diep (0,035), pitch (0,033) }
//
// INHOUD (alles uit de tel + het zaad, geen eigen tellers): per 4 maten (break 8, opbouw steeds sneller, drop elke tel) een nieuwe snit:
//   beeld   12 effecten op de muurschildering: scroll, zoompomp, kaleidoscoop, kleurcyclus (posterize naar palet), pixelate, RGB-split,
//           glitch, videowand (2x2/3x3 met chase), golfvervorming, beat-snit (elke tel een andere uitsnede), spiegeling, tunnel
//   patroon 15 soorten: balken, ringen, tunnel, plasma, interferentie, spectrum, dambord, chevrons, radar, warp, regen/vonken, ruiten,
//           spiraal, scanner, blokken (pixel-mapping)
//   tekst   lichtkrant, stempels (een woord per tel, tel 1 omgekeerd), tekstwand; in de opbouw aftellen 8..1
//   golf    oscilloscoop met spectrumvlammen, of een trillende ring
// Soms (en de eerste 2 maten van de drop) toont de hele kamer samen hetzelfde. Flitsen op de tel: kleurvlak, wit, beeld fel of negatief
// (eigen accenten ~1 op 6 tellen + kamerbreed op tel 1). Break: gedimd (show.blackout) en traag; opbouw: sneller, grovere pixels, lijn
// omhoog, strobe-aanloop; drop: witte klap, negatief + glitch, elke tel een snit en een flits. Strobe van de show (show.flits) = wit.
// Ledvloer: 15 patronen per 8 tellen (dambord, ringen, looplicht, ruis, blokken, chevrons, spectrum, golf, spiraal, diagonalen,
// vierkanten, plasma, slang, radar, explosie op de drop), tegels met voegen. Strip: komeet, vullen, stuiter, kleurstroom, vu, blokken,
// vonken, vol op de tel.
// U = gedeelde uniforms (één update per beeld voor alle schermen): tijd, vt (showklok: break traag, opbouw sneller), tel, snit, snitV,
// puls, energie, bas, mid, hoog, opbouw, drop, dropTel, flits, flitsMax, blackout, stand (0 groove, 1 break, 2 opbouw, 3 drop), showMix,
// k0..k2 (show-kleuren). Bron: doolhof.show (kern.js), anders clubRegie/pulse/bands.
// Test: doolhof.led.forceer = { stand, opbouw, dropTel, modus: 'beeld'|'patroon'|'tekst'|'golf'|'aftel', nr, vloer: 0..14, strip: 0..7 } (null = vrij).
// Prestatie: één shaderprogramma per soort (scherm/vloer/strip x hoog/minimaal), geen lampen, geen lussen in de fragment-shaders. Gemeten
// (3070, hoog 1080p, 6 grote schermen + vloer + 2 pilaren + strips in beeld = 10 draws): gpu +0,3-0,4 ms, cpu +0,3-0,5 ms per beeld.
// Compileren van het scherm kost ANGLE/D3D ~0,6 s: led.js warmt de drie programma's ~4 s na het laden voor op de achtergrond (hieronder).
(function () {
  'use strict';
  const doolhof = window.doolhof = window.doolhof || {};
  if (typeof THREE === 'undefined') return;
  // gedeelde textuurlader (zelfde als gangen.js/onderdelen.js; wie eerst laadt maakt hem)
  window.doolhof.tex = window.doolhof.tex || (() => { const c = {}; return (naam, herhaal) => { const k = naam + (herhaal ? '*' : ''); if (!c[k]) { const t = new THREE.TextureLoader().load('tex/doolhof/' + naam + '.jpg'); if (renderer.outputEncoding === THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding; if (herhaal) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.userData = t.userData || {}; t.userData.doolhofHouden = true; t.userData.naam = naam; c[k] = t; } return c[k]; }; })();
  const MURAAL = ['arcade', 'bass-tempel', 'beton-bunker', 'chroom', 'kosmos', 'neonsteeg', 'paddenstoelen', 'rave-flyers', 'slijmhol', 'uv-jungle'];
  const VIERKANT = { baksteen: 1, staal: 1 };  // de rest is 2048 x 869
  // helderheid per schildering gelijk trekken (vóór de contrastcurve c*c): gemeten na de curve lag bass-tempel/slijmhol op 0,01 en
  // rave-flyers/kosmos op 0,2 (factor 20: donkere schilderingen gaven zwarte wanden, lichte witte). Doel ~0,08. Ook voor gangen.js.
  const BRON_GAIN = { arcade: 1.05, baksteen: 2.3, 'bass-tempel': 2.6, 'beton-bunker': 1.65, chroom: 1.0, kosmos: 0.8, neonsteeg: 1.45, paddenstoelen: 0.9, 'rave-flyers': 0.75, slijmhol: 2.6, staal: 2.1, 'uv-jungle': 1.2 };
  const bronGain = b => BRON_GAIN[typeof b === 'string' ? b : (b && b.userData && b.userData.naam)] || 1;

  // --- tekstatlas: 8 rijen van 64 px (0 lichtkrant, 1-5 woorden, 6 cijfers 8..1, 7 DROP), wit op zwart, gedeeld door alle schermen ---
  const TW = 2048, TH = 512, RIJ = 64;
  const WOORDEN = ['DEEP STEPPER', 'SAMSONIGHT', 'BLOODLINE', 'DEEPER', '∞'];
  const KRANT = 'DEEP STEPPER  •  SAMSONIGHT  •  BLOODLINE  •  DEEPER  •  ∞  •  ';
  const breedte = [0.5, 0.2, 0.2, 0.2, 0.2, 0.05, 0.125, 0.1];
  const atlas = (() => {
    const cv = document.createElement('canvas'); cv.width = TW; cv.height = TH;
    const g = cv.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, TW, TH); g.fillStyle = '#fff'; g.textBaseline = 'alphabetic';
    const F = px => 'bold ' + px + 'px Impact, "Arial Black", sans-serif';
    const zet = (tekst, x, rij, px, links) => {  // verticaal precies in het midden van de rij
      g.font = F(px); g.textAlign = links ? 'left' : 'center';
      const m = g.measureText(tekst), asc = m.actualBoundingBoxAscent || px * 0.76, desc = m.actualBoundingBoxDescent || 0;
      g.fillText(tekst, x, RIJ * (rij + 0.5) + (asc - desc) / 2);
      return m.width;
    };
    g.font = F(58);
    let px = 58, w = g.measureText(KRANT).width;
    if (w > TW) { px = Math.floor(px * TW / w); g.font = F(px); w = g.measureText(KRANT).width; }
    breedte[0] = zet(KRANT, 0, 0, px, true) / TW;
    WOORDEN.forEach((wd, i) => { breedte[i + 1] = (zet(wd, TW / 2, i + 1, wd === '∞' ? 80 : 58) + 8) / TW; });
    for (let i = 0; i < 8; i++) zet(String(8 - i), TW / 8 * (i + 0.5), 6, 58);
    breedte[7] = (zet('DROP', TW / 2, 7, 58) + 8) / TW;
    const t = new THREE.CanvasTexture(cv);
    t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
    t.userData = t.userData || {}; t.userData.doolhofHouden = true;
    return t;
  })();

  // --- gedeelde uniforms ---
  const f = v => ({ value: v });
  const U = {
    tijd: f(0), vt: f(0), tel: f(0), snit: f(0), snitV: f(0), puls: f(0), energie: f(0), bas: f(0), mid: f(0), hoog: f(0),
    opbouw: f(0), drop: f(0), dropTel: f(99), flits: f(0), flitsMax: f(1), blackout: f(0), stand: f(0), showMix: f(0.15),
    dbg: f(new THREE.Vector4(-1, -1, -1, -1)), k0: f(new THREE.Color(0xff0080)), k1: f(new THREE.Color(0x00e5ff)), k2: f(new THREE.Color(0x7a00ff)),
    tekstTex: f(atlas), tekstB0: f(new THREE.Vector4(breedte[0], breedte[1], breedte[2], breedte[3])),
    tekstB1: f(new THREE.Vector4(breedte[4], breedte[5], breedte[6], breedte[7])),
  };

  // --- GLSL ---
  // RawShaderMaterial: three zet de lampen, schaduw en uitvoer-codering van het moment niet in de sleutel van het programma, dus één
  // programma per soort (scherm/vloer/strip x hoog/minimaal) in zaal 2 en het doolhof (een ShaderMaterial kreeg er één per lampstand,
  // en het scherm kost ANGLE/D3D ~0,6 s om te compileren). Zelf de kop voor WebGL1/2.
  const GL2 = !!(typeof renderer !== 'undefined' && renderer.capabilities && renderer.capabilities.isWebGL2);
  const PREC = 'precision highp float;\nprecision highp int;\n';
  const V_KOP = PREC + (GL2 ? '#define attribute in\n#define varying out\n' : '') + 'uniform mat4 projectionMatrix, modelViewMatrix;\nattribute vec3 position;\n';
  const F_KOP = PREC + (GL2 ? '#define varying in\n#define texture2D texture\nout highp vec4 pc_fragColor;\n#define gl_FragColor pc_fragColor\n' : '');
  // gedeelde kop van de fragment-shaders (hash, palet, flitsen op de tel)
  const KOP = F_KOP + `#define TAU 6.2831853
#define PI 3.1415927
uniform float tijd, vt, tel, snit, snitV, puls, energie, bas, mid, hoog, opbouw, drop, dropTel, flits, flitsMax, blackout, stand, showMix;
uniform vec3 k0, k1, k2, palA, palB, palC, palD;
uniform vec4 dbg;   // testen: modus, nummer, vloerpatroon, strippatroon (-1 = vrij)
uniform float zaad, helder;
vec3 A, B, C;
float h11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec3 pal3(float t) { t = fract(t) * 3.0; return t < 1.0 ? mix(A, B, t) : t < 2.0 ? mix(B, C, t - 1.0) : mix(C, A, t - 2.0); }
vec3 palK(float i) { i = mod(floor(i), 3.0); return i < 0.5 ? A : i < 1.5 ? B : C; }
void paletZet() { A = mix(palA, k0, showMix); B = mix(palB, k1, showMix); C = mix(palC, k2, showMix); }
// flits op de tel: groove = eigen accenten (~1 op 6 tellen) + kamerbreed op tel 1 (in de helft van de blokken van 2 maten),
// drop = elke tel, opbouw = vanaf ~1/3 op de tel, dan 2 en 4 per tel; break nooit
float flitsTel(float zs) {
  float bt = floor(tel), ph = fract(tel), fl = 0.0;
  if (stand < 0.5) {
    float kamer = step(mod(bt, 4.0), 0.5) * step(0.5, h11(floor(bt / 8.0) * 1.37 + 7.0));
    float eigen = step(0.83, h11(bt * 1.13 + zs * 13.7));
    fl = max(kamer, eigen * 0.85) * exp(-ph * 7.0) * (0.4 + 0.6 * energie);
  } else if (stand > 2.5) fl = exp(-ph * 6.0) * (0.55 + 0.45 * drop);
  else if (stand > 1.5) { float n = opbouw < 0.5 ? 1.0 : opbouw < 0.75 ? 2.0 : 4.0; fl = step(0.3, opbouw) * exp(-fract(tel * n) * 7.0) * opbouw * 0.8; }
  return fl * flitsMax;
}
`;
  const VERT_UV = V_KOP + `attribute vec2 uv;
#ifdef LED_INST
attribute mat4 instanceMatrix;
#endif
varying vec2 vUv; varying float vZ;
void main() {
  vUv = uv; vZ = 0.0;
  vec4 pos = vec4(position, 1.0);
#ifdef LED_INST
  pos = instanceMatrix * pos; vZ = dot(instanceMatrix[3].xyz, vec3(1.37, 2.71, 0.93));
#endif
  gl_Position = projectionMatrix * modelViewMatrix * pos;
}`;

  // --- ledscherm ---
  const SCHERM_FRAG = KOP + `
uniform vec2 grid, maat;
uniform vec4 modi, tekstB0, tekstB1;
uniform float heeftBron, bronAsp, spiegel, bronGain;
uniform sampler2D bron, tekstTex;
varying vec2 vUv; varying float vZ;
float SA;
// beeld: scherm-uv -> beeld-uv (beeld vult het scherm), gespiegeld herhalen (geen naden), p-ruimte (-SA..SA, -1..1) -> beeld-uv
vec2 dek(vec2 u) { vec2 s = SA > bronAsp ? vec2(1.0, bronAsp / SA) : vec2(SA / bronAsp, 1.0); return 0.5 + (u - 0.5) * s; }
vec2 spg(vec2 u) { return 1.0 - abs(mod(u, 2.0) - 1.0); }
vec3 tx(vec2 u) { return texture2D(bron, spg(u)).rgb; }
vec2 pu(vec2 pp) { return dek(0.5 + pp / vec2(SA * 2.0, 2.0)); }
// beeld in twee stappen: eerst alleen de beeld-uv per effect (u, RGB-split o, helderheid h), dan in main op het hoogste niveau de
// textuur (textuuropvragen binnen takken laten D3D/ANGLE elke tak uitrekenen: compileren duurde 570 ms), daarna de nabewerking
void beeldUv(vec2 q, vec2 p, float e, float bt, float ph, float zs, out vec2 u, out vec2 o, out float h) {
  float k = puls, t = vt, kk = 1.0 - exp(-ph * 5.0);
  o = vec2(0.0); h = 1.0;
  if (e < 0.5) u = dek(q) * 0.7 + vec2(t * 0.025 + 0.045 * (bt + kk), 0.12 + 0.1 * sin(t * 0.17));             // scroll, schok op de tel
  else if (e < 1.5) u = pu(rot(0.15 * sin(t * 0.23)) * p * (0.62 - 0.16 * k + 0.08 * sin(t * 0.31)));            // zoompomp
  else if (e < 2.5) {                                                                                            // kaleidoscoop
    float n = h11(snit * 2.3 + zs) < 0.5 ? 6.0 : 8.0, a = atan(p.y, p.x) + t * 0.15 + 0.3 * floor(bt * 0.5), r = length(p);
    a = mod(a, TAU / n); a = abs(a - PI / n);
    u = pu(r * vec2(cos(a), sin(a)) * (0.6 - 0.12 * k) + vec2(0.3 * sin(t * 0.07), 0.2 * cos(t * 0.05)));
  } else if (e < 3.5) u = pu(p * 0.8 + vec2(t * 0.03, 0.0));                                                    // kleurcyclus (nabewerking)
  else if (e < 4.5) {                                                                                            // pixelate: 8-4-2-1 leds per tel
    float bz = exp2(3.0 - mod(bt, 4.0));
    u = pu(((floor(q * grid / bz) + 0.5) * bz / grid - 0.5) * vec2(SA, 1.0) * 1.6); h = 1.0 + 0.4 * k;
  } else if (e < 5.5) { o = rot(bt * 1.7) * vec2(0.006 + 0.035 * k + 0.015 * bas, 0.0); u = pu(p * 0.75); }      // RGB-split op de kick
  else if (e < 6.5) {                                                                                            // glitch: rijen schuiven (nabewerking)
    float band = floor(q.y * grid.y / 4.0), g8 = floor(tel * 4.0);
    u = pu(p * 0.8) + vec2(step(0.65, h21(vec2(band, g8))) * (h21(vec2(band + 3.0, g8)) - 0.5) * 0.3, 0.0);
  } else if (e < 7.5) {                                                                                          // videowand: vakken, omklappen, chase
    float n = h11(snit * 4.1 + zs) < 0.5 ? 2.0 : 3.0;
    vec2 ti = floor(q * n), lq = fract(q * n);
    float id = ti.x + ti.y * n;
    if (mod(id + bt, 2.0) > 0.5) lq.x = 1.0 - lq.x;
    u = dek(lq) * 0.55 + vec2(h11(id * 1.3 + zs), h11(id * 2.7 + zs)) * 0.45;
    h = (abs(mod(bt, n * n) - id) < 0.5 ? 1.35 : 0.5) * step(0.03, lq.x) * step(lq.x, 0.97) * step(0.03, lq.y) * step(lq.y, 0.97);
  } else if (e < 8.5) {                                                                                          // golfvervorming op de banden
    u = pu(p * 0.8);
    u.x += 0.04 * sin(q.y * 10.0 + t * 2.0) * (0.4 + bas) + 0.05 * k * sin(q.y * 31.0);
    u.y += 0.03 * sin(q.x * 7.0 - t * 1.6) * (0.4 + mid);
  } else if (e < 9.5) {                                                                                          // beat-snit: elke tel een andere uitsnede
    u = pu(p * (0.35 + 0.3 * h11(bt * 3.7 + zs))) + (vec2(h11(bt * 1.1 + zs), h11(bt * 2.3 + zs)) - 0.5) * 0.6;
    h = 0.55 + 0.9 * exp(-ph * 3.5);
  } else if (e < 10.5) u = pu(rot(t * 0.1) * abs(p) * 0.7 - vec2(0.2, 0.1) * sin(t * 0.2));                    // spiegeling
  else {                                                                                                         // tunnel van het beeld
    float r = length(p) + 1e-3;
    u = vec2(atan(p.y, p.x) / TAU * 2.0 + t * 0.03, 0.35 / r + t * 0.25 + 0.1 * bt); h = smoothstep(0.05, 0.6, r);
  }
}
vec3 beeldKleur(vec3 c, vec2 q, float e, float bt) {
  c = min(c * bronGain, vec3(1.0));
  if (e > 2.5 && e < 3.5) {      // kleurcyclus: posterize naar het palet, schuift op de tel
    float l = floor(dot(c, vec3(0.3, 0.59, 0.11)) * 5.0) / 4.0;
    return pal3(l * 0.9 + bt * 0.334) * (0.06 + l * 1.15);
  }
  if (e > 5.5 && e < 6.5) {      // glitch: kanalen wisselen, banden negatief
    float band = floor(q.y * grid.y / 4.0), g8 = floor(tel * 4.0);
    if (mod(bt, 2.0) > 0.5) c = c.brg;
    if (h21(vec2(band, g8 + 9.0)) > 0.85) c = vec3(1.0) - c;
  }
  // kleur naar het palet, contrast: zwart blijft zwart, kleuren gloeien
  float l = dot(c, vec3(0.3, 0.59, 0.11));
  c = mix(c, pal3(l * 0.8 + vt * 0.02 + zaad * 0.1) * (l * 1.5 + 0.05), 0.3 + 0.3 * step(0.5, stand));
  return c * c * 1.4;
}
vec3 patroon(vec2 q, vec2 p, vec2 cell, float n, float bt, float ph, float zs) {
  float t = vt, v = 0.0, ci = 0.0, k = puls, r = length(p), a = atan(p.y, p.x);
  if (n < 0.5) {                     // balken die voorbij schuiven, dikker op de kick
    float hd = h11(snit + zs * 1.9);
    vec2 dir = hd < 0.33 ? vec2(1.0, 0.0) : hd < 0.66 ? vec2(0.0, 1.0) : vec2(0.7071, 0.7071);
    float x = dot(p, dir) * 3.0 - t * 1.2 - 0.5 * bt;
    v = step(fract(x), 0.3 + 0.3 * k); ci = floor(x) * 0.34;
  } else if (n < 1.5) {              // ringen: een felle ring per tel uit het midden, zwakke ringen eronder
    float f = fract(r * 2.0 - t * 0.6);
    v = 0.3 * step(f, 0.25) + smoothstep(0.12, 0.0, abs(r - ph * 2.2 * max(1.0, SA * 0.6))) * (1.0 - ph * 0.6);
    ci = floor(r * 2.0 - t * 0.6) * 0.34 + bt * 0.34;
  } else if (n < 2.5) {              // tunnel: dambord dat op je af komt
    float z = 0.45 / (r + 0.05) + t * 0.9, s = a / TAU * 12.0 + t * 0.1 + bt * 0.25;
    v = abs(step(0.5, fract(z)) - step(0.5, fract(s))) * smoothstep(0.05, 0.5, r); ci = floor(z) * 0.34;
  } else if (n < 3.5) {              // plasma in een paar trappen
    float s = sin(p.x * 3.0 + t) + sin(p.y * 4.0 - t * 1.3) + sin((p.x + p.y) * 2.5 + t * 0.7) + sin(r * 5.0 - t * 2.0 - k * 2.0);
    v = floor((0.5 + 0.5 * sin(s * 1.6)) * 5.0) / 4.0; ci = s * 0.12 + t * 0.05;
  } else if (n < 4.5) {              // interferentie: twee ringbronnen schuiven over elkaar (moire)
    vec2 c1 = vec2(sin(t * 0.37) * SA * 0.6, cos(t * 0.29) * 0.5);
    v = abs(step(0.5, fract(length(p - c1) * 4.0 - t)) - step(0.5, fract(length(p + c1) * 4.0 - t))); ci = floor(length(p - c1) * 2.0) * 0.34;
  } else if (n < 5.5) {              // spectrum: balken uit de banden, gespiegeld vanuit het midden
    float nb = 24.0, x = (p.x / SA * 0.5 + 0.5) * nb, bi = floor(x), d = abs(bi - nb * 0.5 + 0.5) / (nb * 0.5);
    float lvl = mix(mix(bas, mid, smoothstep(0.0, 0.5, d)), hoog, smoothstep(0.5, 1.0, d)) * (0.55 + 0.45 * h21(vec2(bi, floor(tel * 4.0))));
    float y = q.y;
    v = step(y, lvl * 1.05) * step(0.18, fract(x)) + 0.8 * step(abs(y - lvl * 1.05 - 0.04), 0.02) * step(0.18, fract(x)); ci = y * 0.6;
  } else if (n < 6.5) {              // dambord dat op de tel omklapt (drop: op zijn punt)
    float s = 2.0 + floor(h11(snit + zs * 2.0) * 3.0);
    vec2 m = rot(stand > 2.5 ? 0.785 : t * 0.05) * p * s * (1.0 - 0.15 * k);
    v = mod(floor(m.x) + floor(m.y) + bt, 2.0); ci = floor(m.x) * 0.34 + bt * 0.34;
  } else if (n < 7.5) {              // chevrons die omhoog lopen
    float x = (p.y + abs(p.x) * 0.7) * 2.5 - t * 1.5 - bt * 0.5;
    v = step(fract(x), 0.4); ci = floor(x) * 0.34;
  } else if (n < 8.5) {              // radar: draaiende bundel met naloop
    float d = fract((a - t * 1.5 - bt * 1.5708) / TAU);
    v = pow(1.0 - d, 6.0) * (0.35 + 0.65 * step(0.75, fract(r * 4.0))) + pow(1.0 - d, 40.0); ci = r * 0.5 + t * 0.05;
  } else if (n < 9.5) {              // warp: strepen schieten naar buiten
    float seg = floor((a / TAU + 0.5) * 48.0), hs = h11(seg * 1.7 + zs);
    float z = fract(hs + t * (0.25 + 0.5 * hs)), rr = r / max(SA, 1.0);
    v = smoothstep(0.06 + 0.15 * z, 0.0, abs(rr - z * 1.2)) * z * 1.6; ci = hs;
  } else if (n < 10.5) {             // regen per kolom + vonken op de achtsten
    float hc = h11(cell.x * 1.37 + zs), y = fract(q.y * (1.0 + hc) + t * (0.3 + 0.6 * hc) + hc);
    v = pow(y, 8.0) + step(0.97, h21(cell + floor(tel * 2.0) * 13.1)); ci = hc * 0.5 + y * 0.3;
  } else if (n < 11.5) {             // ruiten die uitdijen
    float x = (abs(p.x) + abs(p.y)) * 2.0 - t * 0.8 - bt * 0.25;
    v = step(fract(x), 0.3 + 0.25 * k); ci = floor(x) * 0.34;
  } else if (n < 12.5) {             // spiraal
    float f = fract(a / TAU * 3.0 + log(r + 0.05) * 1.2 - t * 0.5);
    v = smoothstep(0.32, 0.22, abs(f - 0.5)); ci = a / TAU + t * 0.05;
  } else if (n < 13.5) {             // scanner: per rij een balk die per tel overzwiept, met staart
    float rows = floor(q.y * 3.0), x = q.x;
    if (mod(bt + rows, 2.0) > 0.5) x = 1.0 - x;
    float d = fract(ph + rows * 0.17) * 1.3 - x;
    v = d > 0.0 ? exp(-d * 7.0) : 0.0; ci = rows * 0.34 + bt * 0.34;
  } else {                           // blokken: 8x3 vlakken met chases op de achtsten (pixel-mapping)
    float bx = floor(q.x * 8.0), by = floor(q.y * 3.0), e = floor(tel * 2.0), pat = mod(floor(snit) + floor(e / 8.0), 4.0), on;
    if (pat < 0.5) on = step(abs(bx - mod(e, 8.0)), 0.5);
    else if (pat < 1.5) on = step(mod(bx + by + e, 2.0), 0.5);
    else if (pat < 2.5) { float kk = mod(e, 8.0); kk = kk < 4.0 ? kk : 7.0 - kk; on = step(abs(floor(abs(bx - 3.5)) - kk), 0.5); }
    else on = step(0.65, h21(vec2(bx + by * 8.0, e)));
    vec2 lq = fract(q * vec2(8.0, 3.0));
    v = (0.06 + on * exp(-fract(tel * 2.0) * 2.5)) * step(0.04, lq.x) * step(lq.x, 0.96) * step(0.06, lq.y) * step(lq.y, 0.94);
    ci = (bx + by) * 0.34 + e * 0.17;
  }
  return pal3(ci + zs * 0.07) * v * 1.1;
}
// tekst uit de atlas (8 rijen): rij r, t = 0..1 binnen de rij (t.y 0 = onder) -> atlas-uv; de opvraag zelf gebeurt één keer in main
vec2 rij(float r, vec2 t) { return vec2(t.x, 1.0 - (r + 1.0 - t.y) / 8.0); }
float wb(float i) { return i < 3.5 ? dot(tekstB0, vec4(equal(vec4(i), vec4(0.0, 1.0, 2.0, 3.0)))) : dot(tekstB1, vec4(equal(vec4(i), vec4(4.0, 5.0, 6.0, 7.0)))); }
float binnen(vec2 t) { return step(0.0, t.x) * step(t.x, 1.0) * step(0.0, t.y) * step(t.y, 1.0); }
// geeft de letterkleur; tuv/msk = waar in de atlas, inv = 1: vlak vol met de letters uitgespaard, ex = wat er los bij komt
vec3 tekst(vec2 q, float sub, float bt, float ph, float zs, out vec2 tuv, out float msk, out float inv, out vec3 ex) {
  vec2 mt = maat, u = q;
  if (SA < 0.7) { mt = maat.yx; u = vec2(q.y, 1.0 - q.x); }   // staand scherm (pilaar): tekst een kwartslag gedraaid
  float sa = mt.x / mt.y, k = puls;
  inv = 0.0; ex = vec3(0.0);
  if (sub < 1.0) {                   // lichtkrant: 1-3 banden, om en om de andere kant op, letters veren op de tel
    float nb = sa > 2.6 ? 1.0 : sa > 1.2 ? 2.0 : 3.0, band = floor(u.y * nb), y = fract(u.y * nb);
    float dir = mod(band, 2.0) < 0.5 ? 1.0 : -1.0, w0 = tekstB0.x;
    float xs = u.x * mt.x / (mt.y / nb) + dir * (tel * 0.8 + band * 5.3 + zs * 3.0);
    float yy = (y - 0.5) * 1.2 + 0.5 - 0.15 * k * sin(floor(xs * 2.0) * 0.9 + tel * PI);
    tuv = rij(0.0, vec2(fract(xs / (w0 * 32.0)) * w0, yy)); msk = step(0.0, yy) * step(yy, 1.0);
    ex = palK(band) * 0.04;
    return pal3(xs * 0.03 + band * 0.33 + vt * 0.08) * (0.8 + 0.6 * k);
  }
  if (sub < 2.0) {                   // stempels: een woord per tel, popt op de tel; tel 1 van de maat vlak vol met letters uitgespaard
    float wi = 1.0 + mod(bt + floor(zs * 5.0), 5.0), w = wb(wi), th = mt.y * 1.05 * (1.0 + 0.2 * pow(1.0 - ph, 4.0)), tw = th * w * 32.0;
    if (tw > mt.x * 0.94) { th *= mt.x * 0.94 / tw; tw = mt.x * 0.94; }
    vec2 tt = (u - 0.5) * mt / vec2(tw, th) + 0.5;
    tuv = rij(wi, vec2(0.5 + (tt.x - 0.5) * w, tt.y)); msk = binnen(tt);
    inv = mod(bt, 4.0) < 0.5 ? 1.0 : 0.0;
    return palK(bt + floor(zs * 3.0)) * (inv > 0.5 ? 0.5 + 0.6 * k : 0.7 + 0.8 * k);
  }
  if (sub < 3.0) {                   // tekstwand: rijen woorden, om en om de andere kant op; de rij van deze tel licht wit op
    float nr = clamp(floor(mt.y / 0.7), 2.0, 5.0), row = floor(u.y * nr), y = fract(u.y * nr);
    float wi = 1.0 + mod(row + floor(zs * 5.0), 5.0), w = wb(wi), asp = w * 32.0;
    float x = mod(u.x * mt.x / (mt.y / nr) + (mod(row, 2.0) < 0.5 ? 1.0 : -1.0) * (tel * 0.9 + row * 2.1), asp + 0.8);
    float yy = (y - 0.5) * 1.15 + 0.5;
    tuv = rij(wi, vec2(0.5 - 0.5 * w + x / asp * w, yy)); msk = step(x, asp) * step(0.0, yy) * step(yy, 1.0);
    return mix(palK(row + floor(bt / 4.0)) * 0.85, vec3(1.3), step(abs(mod(bt, nr) - row), 0.5) * exp(-ph * 3.0));
  }
  // aftellen (opbouw): groot cijfer 8..1 per tel, streepjes ernaast tellen mee af
  float n = 16.0 - mod(bt, 16.0), th = maat.y * 1.1 * (1.0 + 0.3 * pow(1.0 - ph, 3.0)), tw = th * 1.25;
  if (tw > maat.x * 0.9) { th *= maat.x * 0.9 / tw; tw = maat.x * 0.9; }
  vec2 tt = (q - 0.5) * maat / vec2(tw, th) + 0.5;
  tuv = rij(6.0, vec2((8.0 - n + 0.5 + (tt.x - 0.5) * 0.3125) / 8.0, tt.y)); msk = binnen(tt);
  float sx = abs(q.x - 0.5) * maat.x - tw * 0.5, st = floor(sx / 0.12);
  ex = palK(n + 1.0) * step(0.0, sx) * step(st, n - 1.0) * step(0.4, fract(sx / 0.12)) * step(abs(q.y - 0.5), 0.15) * 0.8;
  return mix(palK(n), vec3(1.0), (1.0 - n / 8.0) * 0.6 + 0.2 * puls) * (0.6 + 0.8 * puls);
}
vec3 golf(vec2 q, vec2 p, float sub, float bt) {
  float lw = 2.4 / grid.y;           // lijn ~1,2 led dik (p.y loopt over 2 eenheden)
  if (sub < 0.5) {                   // oscilloscoop (gespiegeld) + spectrumvlammen vanuit het midden
    float y = 0.75 * (bas * 0.8 * sin(p.x * 2.4 - tel * PI) + mid * 0.4 * sin(p.x * 7.3 + vt * 5.0) + hoog * 0.25 * sin(p.x * 19.0 - vt * 11.0));
    float d1 = abs(p.y - y), v = smoothstep(lw * 1.5, 0.0, d1) + 0.35 * smoothstep(lw * 6.0, 0.0, d1) + 0.4 * smoothstep(lw * 1.5, 0.0, abs(p.y + y));
    float xb = abs(p.x) / SA * 14.0, bi = floor(xb), fb = bi / 14.0;
    float lvl = mix(bas, hoog, fb) * (0.6 + 0.4 * h21(vec2(bi, floor(tel * 4.0))));
    return pal3(fb * 0.6 + vt * 0.05) * step(abs(p.y), lvl * 0.95) * step(0.15, fract(xb)) * 0.45 + mix(B, vec3(1.0), 0.45) * v;
  }
  float a = atan(p.y, p.x), r = length(p);   // ring die op de banden trilt, binnenring, stralen op de hoge tonen
  float rr = 0.55 + 0.18 * bas * sin(a * 3.0 + vt * 2.0) + 0.1 * mid * sin(a * 7.0 - vt * 3.0) + 0.06 * hoog * sin(a * 17.0 + vt * 9.0) + 0.12 * puls;
  float d = abs(r - rr), v = smoothstep(lw * 1.5, 0.0, d) + 0.35 * smoothstep(lw * 7.0, 0.0, d) + 0.5 * smoothstep(lw * 1.5, 0.0, abs(r - rr * 0.55));
  return mix(pal3(a / TAU + vt * 0.1), vec3(1.0), 0.3) * v + palK(bt) * step(0.92, fract(a / TAU * 24.0 + vt * 0.2)) * step(r, rr * 0.5) * hoog * 0.7;
}
void main() {
  paletZet();
  SA = maat.x / maat.y;
  float bt = floor(tel), ph = fract(tel);
  float isDrop = step(2.5, stand), isOpb = step(1.5, stand) * (1.0 - isDrop), isBreak = step(0.5, stand) * (1.0 - step(1.5, stand));
  // soms (en de eerste 2 maten van de drop) toont de hele kamer hetzelfde
  float sync = max(step(h11(snit * 3.17 + 0.5), 0.2), isDrop * step(dropTel, 8.0));
  float zs = mix(zaad + vZ, 0.0, sync);
  vec2 gp = vec2(spiegel > 0.5 ? 1.0 - vUv.x : vUv.x, vUv.y) * grid;
  if (isDrop > 0.5 && dropTel < 4.0) {   // drop: rijen leds schuiven (glitch)
    float band = floor(gp.y / 3.0), g8 = floor(tel * 4.0);
    gp.x += step(0.55, h21(vec2(band, g8))) * floor((h21(vec2(band + 7.0, g8)) - 0.5) * grid.x * 0.25);
  }
  float bs = isOpb > 0.5 ? 1.0 + floor(max(0.0, opbouw - 0.35) * 9.0) : 1.0;   // opbouw: grovere pixels naar het eind
  vec2 cell = floor(gp / bs) * bs, cel = fract(gp);
  vec2 q = (cell + 0.5 * bs) / grid, p = (q - 0.5) * vec2(SA, 1.0) * 2.0;
  if (isDrop > 0.5) p *= 1.0 - 0.12 * puls;
  vec4 w = modi;
  if (heeftBron < 0.5) w.x = 0.0;
  if (isBreak > 0.5) w *= vec4(3.0, 1.0, 0.25, 0.6);   // break: vooral beeld
  float tot = max(1e-3, w.x + w.y + w.z + w.w), r = h11(snit * 1.731 + zs * 0.917 + 0.3) * tot, sub = h11(snit * 5.71 + zs * 3.33 + 0.7);
  float modus = r < w.x ? 0.0 : r < w.x + w.y ? 1.0 : r < w.x + w.y + w.z ? 2.0 : 3.0;
  if (isOpb > 0.5 && modi.z > 0.0 && mod(bt, 16.0) >= 8.0 && h11(zaad * 7.7 + 1.0) < 0.6) modus = 4.0;
  float e12 = floor(sub * 12.0), e15 = floor(sub * 15.0), e3 = sub * 3.0, e2 = fract(sub * 7.0);
  if (dbg.x >= 0.0) { modus = dbg.x; e12 = dbg.y; e15 = dbg.y; e3 = dbg.y + 0.5; e2 = dbg.y * 0.6; }
  vec3 col = vec3(0.0), kc = vec3(0.0), ex = vec3(0.0);
  vec2 bu = vec2(0.5), bo = vec2(0.0), tuv = vec2(0.0);
  float bh = 1.0, msk = 0.0, inv = 0.0, isTekst = step(1.5, modus) * (1.0 - step(2.5, modus)) + step(3.5, modus);
  if (modus < 0.5) beeldUv(q, p, e12, bt, ph, zs, bu, bo, bh);
  else if (modus < 1.5) col = patroon(q, p, cell, e15, bt, ph, zs);
  else if (isTekst > 0.5) kc = tekst(q, modus > 3.5 ? 3.5 : e3, bt, ph, zs, tuv, msk, inv, ex);
  else col = golf(q, p, e2, bt);
  // textuuropvragen op het hoogste niveau (zie beeldUv)
#ifdef LED_MIN
  vec3 bc = tx(bu);
#else
  vec3 bc = vec3(tx(bu + bo).r, tx(bu).g, tx(bu - bo).b);
#endif
  float g = texture2D(tekstTex, tuv).r * msk;
  if (modus < 0.5) col = beeldKleur(bc * bh, q, e12, bt);
  else if (isTekst > 0.5) col = (inv > 0.5 ? kc * (1.0 - g) : kc * g) + ex;
  // pompen op de kick; break: een trage lichtveeg schuift over het scherm
  col *= isBreak > 0.5 ? 0.7 + 0.9 * pow(0.5 + 0.5 * sin((q.x * 0.6 + q.y * 0.4) * TAU - vt * 2.5), 8.0) : 0.72 + 0.5 * puls * (0.45 + 0.55 * energie);
  if (isOpb > 0.5) col = col * (1.0 + 0.7 * opbouw * step(q.y, opbouw)) + mix(B, vec3(1.0), 0.4) * smoothstep(2.0 / grid.y, 0.0, abs(q.y - opbouw)) * 1.4;
  if (isDrop > 0.5) {   // drop: korte witte klap op de tel van de drop, dan 3 tellen negatieve banden die op de zestienden verspringen
    if (dropTel >= 1.0 && dropTel < 4.0 && h21(vec2(floor(gp.y / 4.0) * 1.3, floor(tel * 4.0) + 5.0)) > 0.55) col = (1.0 - min(col, vec3(1.0))) * palK(bt + floor(gp.y / 4.0)) * 0.7;
    col = mix(col, vec3(1.5), exp(-max(dropTel, 0.0) * 6.0));
  }
  float fl = flitsTel(zs), soort = h11(bt * 3.3 + zs * 1.7);
  vec3 fc = soort < 0.4 ? pal3(bt * 0.37 + zs) * 1.6 : soort < 0.6 ? vec3(1.4) : soort < 0.85 ? col * 3.0 + 0.08 : (1.0 - min(col, vec3(1.0))) * palK(bt + 1.0) * 1.5;
  col = mix(col, fc, fl * 0.85);
  col = col * (1.0 - 0.35 * blackout) + palD * 0.15;   // break: gedimd maar zichtbaar (het doolhof zie je vooral in de break)
  col = mix(col, vec3(1.5), flits);
#ifndef LED_MIN
  // ledlook: ronde ledpunten met zwart ertussen (van ver egaal, anders moire) en een scanlijn die langzaam omlaag loopt
  float dm = (1.0 - smoothstep(0.3, 0.47, length(cel - 0.5))) * 1.6;
  dm = mix(dm, 0.78, smoothstep(0.22, 0.55, max(fwidth(gp.x), fwidth(gp.y))));
  col *= (dm + 0.03) * (0.9 + 0.3 * pow(0.5 + 0.5 * sin((vUv.y * 1.3 + tijd * 0.35) * TAU), 14.0));
#endif
  gl_FragColor = vec4(col * helder, 1.0);
}`;

  // --- ledvloer: tegels met voegen, patroon per 8 tellen (zoals zaal 1) ---
  const VLOER_FRAG = KOP + `
uniform vec2 tegels;
varying vec2 vUv; varying float vZ;
void main() {
  paletZet();
  vec2 gp = vUv * tegels, t = floor(gp), c = fract(gp), m = (tegels - 1.0) * 0.5, d = t - m;
  float bt = floor(tel), ph = fract(tel), zs = zaad + vZ, R = length(d), W = tegels.x, H = tegels.y;
  float n = floor(h11(snitV * 1.37 + zs * 0.71 + 0.2) * 14.0);
  if (stand > 2.5 && dropTel < 2.0) n = 14.0;
  if (dbg.z >= 0.0) n = dbg.z;
  if (stand > 0.5 && stand < 1.5) bt = floor(tel * 0.5);   // break: halve snelheid
  float on = 0.0, ci = floor(R * 0.6) * 0.34 + bt * 0.34, vrij = -1.0;
  if (n < 0.5) on = step(mod(t.x + t.y + bt, 2.0), 0.5);                                           // dambord
  else if (n < 1.5) on = step(mod(floor(R) - bt + 300.0, 3.0), 0.5);                               // ringen uit het midden
  else if (n < 2.5) on = max(step(mod(t.x + bt, 4.0), 0.5), step(mod(t.y + bt, 4.0), 0.5));        // looplicht
  else if (n < 3.5) { on = step(0.62, h21(t + floor(tel * 2.0) * 17.3)); ci = h21(t * 1.7 + bt); } // ruis op de achtsten
  else if (n < 4.5) on = step(mod(floor(t.x / 3.0) + floor(t.y / 3.0) + bt, 2.0), 0.5);          // blokken
  else if (n < 5.5) { float x = abs(d.x) + t.y - bt + 400.0; on = step(mod(x, 4.0), 1.0); ci = floor(x / 4.0) * 0.34; }   // chevrons
  else if (n < 6.5) {                                                                              // spectrum vanuit de middenlijn
    float fx = abs(d.x) / max(1.0, m.x), lvl = mix(mix(bas, mid, smoothstep(0.0, 0.5, fx)), hoog, smoothstep(0.5, 1.0, fx)) * (0.6 + 0.4 * h21(vec2(t.x, floor(tel * 4.0))));
    on = step(abs(d.y), lvl * (m.y + 0.5)); ci = abs(d.y) / max(1.0, m.y) * 0.6;
  }
  else if (n < 7.5) { float y = m.y * 0.7 * sin(t.x * 0.55 + tel * PI * 0.5); on = max(step(abs(d.y - y), 1.2), step(abs(d.y + y), 1.2)); ci = step(0.0, d.y * y) * 0.34 + bt * 0.34; }   // twee golven, gespiegeld
  else if (n < 8.5) { float x = floor(atan(d.y, d.x) / TAU * 8.0 + R * 0.35 - tel); on = step(mod(x, 2.0), 0.5); ci = x * 0.34; }  // spiraal
  else if (n < 9.5) on = max(step(mod(t.x - t.y + bt + 400.0, 4.0), 0.5), step(mod(t.x + t.y - bt + 400.0, 4.0), 0.5));   // diagonalen
  else if (n < 10.5) { float s = floor(max(abs(d.x), abs(d.y))); on = step(mod(s - bt + 400.0, 4.0), 0.5); ci = s * 0.34; }  // vierkanten
  else if (n < 11.5) {                                                                             // plasma per tegel (pixel-mapping)
    float s = sin(t.x * 0.55 + vt) + sin(t.y * 0.43 - vt * 1.2) + sin(R * 0.7 - vt * 2.0);
    vrij = pow(0.5 + 0.5 * sin(s * 1.8 + puls), 2.0); ci = s * 0.18 + vt * 0.04;
  }
  else if (n < 12.5) {                                                                             // slang op de zestienden
    float idx = t.y * W + (mod(t.y, 2.0) < 0.5 ? t.x : W - 1.0 - t.x), N = W * H;
    float dd = mod(mod(floor(tel * 4.0) * 3.0, N) - idx + N, N * 0.5), len = max(8.0, N * 0.2);   // twee slangen, half rond verschoven
    vrij = dd < len ? pow(1.0 - dd / len, 1.5) : 0.0; ci = idx / N + bt * 0.34;
  }
  else if (n < 13.5) { vrij = pow(1.0 - fract((atan(d.y, d.x) - tel * PI * 0.5) / TAU), 4.0); ci = R * 0.1 + bt * 0.34; }   // radar
  else {                                                                                           // explosie op de drop
    float mm = max(m.x, m.y) + 2.0, rr = dropTel * 4.0;
    on = step(abs(R - mod(rr, mm)), 1.2) + step(abs(R - mod(rr * 0.6, mm)), 0.8); ci = R * 0.2 + bt * 0.34;
  }
  float brk = step(0.5, stand) * step(stand, 1.5), rimpel = 0.5 + 0.5 * sin(R * 0.9 - vt * 4.5);   // break: rimpel die door de vloer trekt
  float aan = brk > 0.5 ? 0.2 + 0.35 * rimpel : 0.3 + 0.7 * puls * (0.4 + energie * 0.6);
  vec3 kl = pal3(ci + zs * 0.13);
  vec3 col = vrij >= 0.0 ? kl * (0.05 + vrij * (aan + 0.25)) : on > 0.5 ? kl * aan : palD * 0.5 + kl * (0.03 + 0.2 * brk * rimpel * rimpel);
  col = mix(col, mix(pal3(bt * 0.37 + zs), vec3(1.0), 0.3) * 1.3, flitsTel(zs) * 0.6);
  col *= 1.0 - 0.3 * blackout;
  col = mix(col, vec3(1.4), flits);
  vec2 e = abs(c - 0.5) * 2.0;   // tegel: donkere voeg, midden iets feller (diffusor)
  float voeg = 1.0 - smoothstep(0.84, 0.9, max(e.x, e.y));
#ifndef LED_MIN
  voeg = mix(voeg, 0.85, smoothstep(0.08, 0.3, max(fwidth(gp.x), fwidth(gp.y))));
#endif
  gl_FragColor = vec4(col * mix(0.04, 1.15 - 0.2 * dot(e, e), voeg) * helder, 1.0);
}`;

  // --- ledstrip: aS = meters langs het stuk, aL = lengte van het stuk, aI = nummer van het stuk ---
  const STRIP_VERT = V_KOP + `attribute float aS, aL, aI; varying float vS, vL, vI;
void main() { vS = aS; vL = aL; vI = aI; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  const STRIP_FRAG = KOP + `
uniform float pitch;
varying float vS, vL, vI;
void main() {
  paletZet();
  float px = floor(vS / pitch), u = (px + 0.5) * pitch / max(vL, 0.01), bt = floor(tel), ph = fract(tel), zs = zaad + vI * 0.37;
  float n = floor(h11(snitV * 3.1 + zaad * 0.53 + 0.4) * 8.0);
  if (stand > 2.5 && dropTel < 4.0) n = 7.0;
  if (stand > 0.5 && stand < 1.5) n = mod(n, 3.0) < 1.0 ? 0.0 : mod(n, 3.0) < 2.0 ? 2.0 : 3.0;   // break: komeet, stuiter, kleurstroom
  if (dbg.w >= 0.0) n = dbg.w;
  float v = 0.0, ci = u * 0.6 + vI * 0.34;
  if (n < 0.5) v = pow(1.0 - fract(fract(tel * 0.5 + vI * 0.25) - u), 7.0);                                         // komeet
  else if (n < 1.5) { v = step(abs(u - 0.5) * 2.0, smoothstep(0.0, 0.35, ph)) * exp(-ph * 2.5); ci = bt * 0.34; }  // vult vanuit het midden
  else if (n < 2.5) v = exp(-abs(u - abs(fract(tel * 0.5 + vI * 0.13) * 2.0 - 1.0)) * 14.0);                       // stuiterbal
  else if (n < 3.5) { v = 0.55 + 0.45 * sin(u * 12.0 - vt * 4.0); ci = u * 1.5 - vt * 0.3; }                        // kleurstroom
  else if (n < 4.5) { v = step(u, 0.08 + 0.92 * bas); ci = u * 0.66; }                                                // vu-meter
  else if (n < 5.5) { v = step(mod(floor(px / 6.0) + floor(tel * 2.0), 2.0), 0.5); ci = floor(px / 6.0) * 0.34; }    // blokken op de achtsten
  else if (n < 6.5) { v = step(0.82, h21(vec2(px, floor(tel * 4.0) + vI * 31.0))); ci = h11(px); }                    // vonken
  else { v = 1.0; ci = bt * 0.34 + vI * 0.34; }                                                                       // vol op de tel
  float aan = stand > 0.5 && stand < 1.5 ? 0.35 : 0.45 + 0.75 * puls;
  vec3 col = pal3(ci + zs * 0.1) * v * aan + palD * 0.2;
  col = mix(col, mix(pal3(bt * 0.37), vec3(1.0), 0.4) * 1.4, flitsTel(zs) * 0.7);
  col *= 1.0 - 0.4 * blackout;
#ifndef LED_MIN
  float fp = fract(vS / pitch), lp = smoothstep(0.1, 0.25, fp) * smoothstep(0.9, 0.75, fp);
  col *= mix(0.3 + lp, 0.75, smoothstep(0.3, 0.8, fwidth(vS / pitch)));
#endif
  col = mix(col, vec3(1.5), flits);
  gl_FragColor = vec4(col * helder, 1.0);
}`;

  // --- materialen ---
  const kleur = (x, d) => x && x.isColor ? x : new THREE.Color(x !== undefined && x !== null ? x : d);
  const STD = { a: 0xff0080, b: 0x00e5ff, c: 0x7a00ff, donker: 0x020004 };
  const zwaarNu = o => o && o.zwaar !== undefined ? o.zwaar : (typeof KW !== 'undefined' && KW.stand === 'minimaal' ? 2 : 0);
  function strHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) % 997; }
  function basis(o, fragment, vertex, eigen) {
    const p = o.palet || {};
    const uni = Object.assign({}, U, {
      palA: f(kleur(p.a, STD.a)), palB: f(kleur(p.b, STD.b)), palC: f(kleur(p.c, STD.c)), palD: f(kleur(p.donker, STD.donker)),
      zaad: f(o.zaad !== undefined ? +o.zaad % 1000 : 0), helder: f(o.helder !== undefined ? o.helder : 1),
    }, eigen);
    const m = new THREE.RawShaderMaterial({ uniforms: uni, vertexShader: vertex, fragmentShader: fragment, side: o.zijde !== undefined ? o.zijde : THREE.FrontSide, glslVersion: GL2 ? THREE.GLSL3 : null });
    m.defines = {};
    if (zwaarNu(o) >= 2) m.defines.LED_MIN = '';
    if (o.instanced) m.defines.LED_INST = '';
    m.extensions.derivatives = true;
    return m;
  }
  const wachtAsp = [];  // schermen met een eigen textuur die nog laadt: verhouding zetten zodra het plaatje er is
  const MODI = ['beeld', 'patroon', 'tekst', 'golf'], MODI_W = { beeld: 1.3, patroon: 1.5, tekst: 0.7, golf: 0.5 };
  function scherm(o) {
    o = o || {};
    const maat = o.maat || { w: 4, h: 2.5 }, pitch = o.pitch || 0.05;
    let bron = o.bron, naam = typeof bron === 'string' ? bron : '';
    const zaad = o.zaad !== undefined ? o.zaad : strHash(naam + maat.w + 'x' + maat.h);
    if (bron === undefined) { naam = MURAAL[Math.floor(Math.abs(zaad * 7.31)) % MURAAL.length]; bron = naam; }
    let tex = null, asp = 2048 / 869;
    if (typeof bron === 'string') { tex = doolhof.tex(bron); asp = VIERKANT[bron] || asp; }
    else if (bron && bron.isTexture) { tex = bron; if (tex.image && tex.image.width) asp = tex.image.width / tex.image.height; }
    const mw = new THREE.Vector4();
    const lijst = Array.isArray(o.modi) ? o.modi : null, gew = !lijst && o.modi && typeof o.modi === 'object' ? o.modi : null;
    MODI.forEach((k, i) => mw.setComponent(i, gew ? +(gew[k] || 0) : !lijst || lijst.includes(k) ? MODI_W[k] : 0));
    if (mw.x + mw.y + mw.z + mw.w <= 0) mw.set(0, 1, 0, 0);
    const m = basis(Object.assign({}, o, { zaad }), SCHERM_FRAG, VERT_UV, {
      grid: f(new THREE.Vector2(Math.max(4, Math.round(maat.w / pitch)), Math.max(4, Math.round(maat.h / pitch)))),
      maat: f(new THREE.Vector2(maat.w, maat.h)), modi: f(mw), heeftBron: f(tex ? 1 : 0), bronAsp: f(asp), bron: f(tex), bronGain: f(bronGain(typeof bron === 'string' ? bron : tex)),
      spiegel: f(o.spiegel ? 1 : 0),
    });
    if (tex && !(typeof bron === 'string') && !(tex.image && tex.image.width)) wachtAsp.push(m);
    m.userData.led = 'scherm';
    return m;
  }
  function vloerMat(w, d, o) {  // alleen het materiaal (eigen geometrie met uv 0..1 over w x d)
    o = o || {};
    const tegel = o.tegel || 0.6;
    const m = basis(Object.assign({ zaad: strHash('vloer' + w + 'x' + d) }, o), VLOER_FRAG, VERT_UV,
      { tegels: f(new THREE.Vector2(Math.max(1, Math.round(w / tegel)), Math.max(1, Math.round(d / tegel)))) });
    m.userData.led = 'vloer';
    return m;
  }
  function vloer(w, d, o) {
    const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(g, vloerMat(w, d, o)); mesh.name = 'ledvloer';
    return mesh;
  }
  function stripMat(o) { const m = basis(Object.assign({ zaad: 0 }, o), STRIP_FRAG, STRIP_VERT, { pitch: f(o.pitch || 0.033) }); m.userData.led = 'strip'; return m; }
  function stukGeo(L, o, idx) {  // balk langs x (-L/2..L/2) met aS/aL/aI
    const g = new THREE.BoxGeometry(L, o.dik || 0.035, o.diep || 0.035), pos = g.attributes.position, n = pos.count;
    const s = new Float32Array(n), l = new Float32Array(n).fill(L), id = new Float32Array(n).fill(idx);
    for (let i = 0; i < n; i++) s[i] = pos.getX(i) + L / 2;
    g.setAttribute('aS', new THREE.BufferAttribute(s, 1)); g.setAttribute('aL', new THREE.BufferAttribute(l, 1)); g.setAttribute('aI', new THREE.BufferAttribute(id, 1));
    g.deleteAttribute('normal'); g.deleteAttribute('uv');
    return g;
  }
  function strip(lengte, o) {
    o = o || {};
    const mesh = new THREE.Mesh(stukGeo(lengte, o, o.index || 0), stripMat(o)); mesh.name = 'ledstrip';
    return mesh;
  }
  const xas = new THREE.Vector3(1, 0, 0), va = new THREE.Vector3(), vb = new THREE.Vector3(), qq = new THREE.Quaternion(), mm = new THREE.Matrix4(), een = new THREE.Vector3(1, 1, 1);
  function strips(lijst, o) {  // [[x1,y1,z1,x2,y2,z2] | { van, naar }, ...] -> één mesh, één draw
    o = o || {};
    const delen = [];
    lijst.forEach((s, i) => {
      if (Array.isArray(s)) { va.set(s[0], s[1], s[2]); vb.set(s[3], s[4], s[5]); } else { va.copy(s.van); vb.copy(s.naar); }
      const L = va.distanceTo(vb); if (L < 1e-3) return;
      const g = stukGeo(L, o, i);
      qq.setFromUnitVectors(xas, vb.clone().sub(va).divideScalar(L));
      g.applyMatrix4(mm.compose(va.clone().add(vb).multiplyScalar(0.5), qq, een));
      delen.push(g);
    });
    const geo = new THREE.BufferGeometry(), namen = ['position', 'aS', 'aL', 'aI'], data = {}, idx = [];
    let n = 0;
    for (const k of namen) data[k] = [];
    for (const g of delen) {
      for (const k of namen) data[k].push(...g.attributes[k].array);
      for (const i of g.index.array) idx.push(i + n);
      n += g.attributes.position.count; g.dispose();
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(data.position, 3));
    for (const k of ['aS', 'aL', 'aI']) geo.setAttribute(k, new THREE.Float32BufferAttribute(data[k], 1));
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, stripMat(o)); mesh.name = 'ledstrips';
    return mesh;
  }
  function paneel(w, h, o) { const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), scherm(Object.assign({}, o, { maat: { w, h } }))); mesh.name = 'ledscherm'; return mesh; }

  const led = doolhof.led = { U, scherm, vloer, vloerMat, strip, strips, paneel, MURAAL, bronGain, forceer: null };

  // --- één update per beeld voor alle schermen ---
  if (typeof clubHooks === 'undefined') return;
  const ST = { groove: 0, break: 1, opbouw: 2, drop: 3 };
  const knip = (s, sub) => sub * 300 + (((s % 300) + 300) % 300);
  let vt = 0;
  clubHooks.push(dt => {
    const sh = doolhof.show, R = window.clubRegie, F = led.forceer, bus = !!(doolhof.stat && sh);
    const b = Math.max(0, typeof beatPos === 'number' ? beatPos : performance.now() / 428.6);
    const st = F && F.stand ? F.stand : bus ? sh.stand : (R && R.stand) || 'groove';
    const kb = F && F.dropTel !== undefined ? F.dropTel : R && R.dropBeat >= 0 ? b - R.dropBeat : 1e9;
    const opb = F && F.opbouw !== undefined ? F.opbouw : bus ? sh.opbouw : st === 'opbouw' && R ? Math.min(1, Math.max(0, (b - Math.floor(R.sinds || 0)) / 16)) : 0;
    const drp = st === 'drop' ? (bus && !F ? sh.drop : kb < 16 ? Math.pow(1 - Math.max(0, kb) / 16, 2) : 0) : 0;
    const rate = st === 'break' ? 0.55 : st === 'opbouw' ? 1 + 2.5 * opb * opb : st === 'drop' ? 1.5 + drp : 1;
    vt = (vt + dt * rate) % 600;
    U.vt.value = vt; U.tijd.value = (performance.now() / 1000) % 1000; U.tel.value = b % 1024;
    U.puls.value = typeof pulse === 'number' ? pulse : Math.exp(-5 * (b % 1));
    U.energie.value = typeof energy === 'number' ? energy : 0.7;
    if (typeof bands !== 'undefined') { U.bas.value = bands[0].v; U.mid.value = bands[1].v; U.hoog.value = bands[2].v; }
    U.opbouw.value = st === 'opbouw' ? opb : 0; U.drop.value = drp; U.dropTel.value = st === 'drop' ? Math.min(99, Math.max(0, kb)) : 99;
    U.flits.value = bus ? sh.flits : 0;
    U.flitsMax.value = typeof S !== 'undefined' && S.strobe === 'uit' ? 0.5 : 1;
    U.blackout.value = bus ? sh.blackout : st === 'break' ? 0.8 : 0;
    U.stand.value = ST[st] || 0;
    U.showMix.value = st === 'break' ? 0.75 : st === 'drop' ? 0.85 : st === 'opbouw' ? 0.25 + 0.5 * opb : 0.15;
    if (sh && sh.kleur) { sh.kleur(0, U.k0.value); sh.kleur(1, U.k1.value); sh.kleur(2, U.k2.value); }
    else if (typeof pal !== 'undefined') { U.k0.value.copy(pal[0]); U.k1.value.copy(pal[1]); U.k2.value.copy(pal[0]).lerp(pal[1], 0.5); }
    // snit (schermen) en snitV (vloer/strips): wanneer de inhoud wisselt
    const o = (ST[st] || 0) * 1000, B = Math.floor(b);
    let s, v;
    if (st === 'break') { s = knip(Math.floor(b / 32), 0); v = knip(Math.floor(b / 16), 0); }
    else if (st === 'opbouw') { const i = opb < 0.5 ? 0 : opb < 0.75 ? 1 : 2, d = [4, 2, 1][i]; s = v = knip(Math.floor(b / d), i); }
    else if (st === 'drop') { s = kb < 8 ? knip(B, 0) : knip(Math.floor(b / 4), 1); v = knip(Math.floor(b / 4), 0); }
    else { s = knip(Math.floor(b / 16), 0); v = knip(Math.floor(b / 8), 0); }
    U.snit.value = o + s; U.snitV.value = o + v;
    const D = U.dbg.value; D.set(-1, -1, -1, -1);
    if (F) {  // testen: vaste inhoud
      if (F.modus !== undefined) { D.x = typeof F.modus === 'string' ? ['beeld', 'patroon', 'tekst', 'golf', 'aftel'].indexOf(F.modus) : F.modus; D.y = F.nr || 0; }
      if (F.vloer !== undefined) D.z = F.vloer;
      if (F.strip !== undefined) D.w = F.strip;
    }
    for (let i = wachtAsp.length - 1; i >= 0; i--) {
      const m = wachtAsp[i], t = m.uniforms.bron.value;
      if (t && t.image && t.image.width) { m.uniforms.bronAsp.value = t.image.width / t.image.height; wachtAsp.splice(i, 1); }
    }
    warmTel += dt; if (warmTel > 4) voorwarm();
  });

  // --- voorwarmen: de drie programma's (los van de lampen, zie boven) één keer per stand op de achtergrond compileren, ~4 s na het
  // laden, via doolhof.losCompileren (KHR_parallel_shader_compile: de hoofdlus wacht niet; de kern houdt ze daarna vast). Het scherm
  // kost ANGLE/D3D ~0,6 s; zonder dit viel dat in het eerste beeld met een ledscherm.
  let warmTel = 0;
  const warmKlaar = new Set(), warmHoud = [];
  function voorwarm() {
    const z = zwaarNu() >= 2 ? 2 : 0, D = typeof doolhof.losCompileren === 'function' ? doolhof : null;
    if (warmKlaar.has(z) || typeof camera === 'undefined' || (D && D.losVol && D.losVol())) return;
    warmKlaar.add(z);
    const o = { zwaar: z, bron: null }, vlak = new THREE.PlaneGeometry(1, 1);
    const stuk = [new THREE.Mesh(vlak, scherm(Object.assign({ maat: { w: 1, h: 1 } }, o))), new THREE.Mesh(vlak, vloerMat(1, 1, o)), strip(0.5, o)];
    const nep = { isScene: true, fog: null, environment: null, traverseVisible() {}, traverse(fn) { for (const x of stuk) fn(x); } };
    try { if (D) D.losCompileren(() => renderer.compile(nep, camera), stuk); else renderer.compile(nep, camera); }
    catch (e) { console.error('led voorwarmen', e); }
    if (D) setTimeout(() => { for (const m of stuk) { m.geometry.dispose(); m.material.dispose(); } }, 30000);  // de kern houdt de programma's vast
    else warmHoud.push(...stuk);  // zonder kern: materialen houden, anders gooit three het programma weg
  }
})();

// --- Effectkamers: de hele ruimte is één bewegend effect (zoals de trip-kaleidoscoop van zaal 2) en het publiek danst erin ---
// Acht soorten, elk totaal anders: fx-tunnel (eindeloze tunnel die op de bas naar je toe raast), fx-vloeistof (alles golft als olie,
// druppel op de tel), fx-oneindig (oneindigheidsspiegels met een kaleidoscoop van de muurschildering), fx-glitch (datamosh, RGB-split,
// blokken en woorden die op de tel verspringen), fx-fractal (fractale grot achter de wanden, ademt langzaam), fx-strobe (zwart/wit-kubus:
// scanlijnen en vlakflitsen), fx-warp (sterren schieten langs, hyperspace in de drop), fx-hypnose (draaiende spiralen als tandwielen).
// Vloer, wanden en plafond zijn één schil (één mesh, één draw, gaten voor de deuren) met per soort één shader (zelfde programma voor alle
// kamers van die soort). Alle effectkamers delen één set muziek-uniforms uit de show-bus (doolhof.show) + banden, één update per beeld.
// Publiek: silhouetten (club/publiek.js, één draw) + een paar 3D-dansers, één kamerlamp in de kleur van het effect. De sporen (feedback)
// zijn per soort sterker of juist zwakker, alleen zolang de camera in de kamer is (daarna weer precies wat de kern zet).
// Gewicht: samen ~1 op 4 kamers (getter: rekent met de gewichten van de andere soorten). ctx.zwaar 1 = minder iteraties, 2 (tv) = eenvoudig.
// Test: doolhof.start('fx-warp'), doolhof.volgende = 'fx-glitch', doolhof.effect.info().
(function () {
  'use strict';
  const doolhof = window.doolhof = window.doolhof || {};
  if (typeof THREE === 'undefined' || typeof doolhof.registreer !== 'function' || typeof clubHooks === 'undefined' || typeof renderer === 'undefined') return;

  // --- gedeelde muziek-uniforms (alle effectkamers, één update per beeld) ---
  const f = v => ({ value: v });
  const U = {
    uT: f(0), uTel: f(0), uReis: f(0), uPuls: f(0), uEn: f(0), uBas: f(0), uMid: f(0), uHoog: f(0),
    uOpb: f(0), uDrop: f(0), uFlits: f(0), uBlack: f(0), uStand: f(0),
    uK0: f(new THREE.Color(0xff0080)), uK1: f(new THREE.Color(0x00e5ff)), uK2: f(new THREE.Color(0x7a00ff)),
  };
  const STAND = { groove: 0, break: 1, opbouw: 2, drop: 3 };
  let tijd = 0, reis = 0, levend = 0, beeldNr = 0;
  const FX = doolhof.effect = { U, forceer: null, levend: () => levend };
  clubHooks.push(dt => {
    beeldNr++;
    if (!levend) return;
    const sh = doolhof.show, st = FX.forceer || (sh && sh.stand) || 'groove';
    const pu = typeof pulse === 'number' ? pulse : 0, en = typeof energy === 'number' ? energy : 0, B = typeof bands !== 'undefined' ? bands : null;
    const bas = B ? B[0].v : 0, opb = sh ? sh.opbouw : 0, drop = sh ? sh.drop : 0;
    // reis: hoe ver de kamer 'gevlogen' is; break traag, opbouw versnellend, drop hard; elke kick geeft een duw
    const v = st === 'break' ? 0.8 : st === 'opbouw' ? 0.55 + 2.4 * opb * opb : st === 'drop' ? 1.5 + 1.8 * drop : 0.8;
    reis = (reis + dt * v * (0.55 + 0.9 * pu * Math.max(0.25, en) + 0.35 * bas)) % 350;  // 350: veelvoud van alle periodes (geen sprong)
    tijd = (tijd + dt) % 3600;
    U.uT.value = tijd; U.uReis.value = reis;
    U.uTel.value = Math.max(0, typeof beatPos === 'number' ? beatPos : 0) % 256;  // 256 tellen = 64 maten: patronen lopen door
    U.uPuls.value = pu; U.uEn.value = en; U.uBas.value = bas; U.uMid.value = B ? B[1].v : 0; U.uHoog.value = B ? B[2].v : 0;
    U.uOpb.value = opb; U.uDrop.value = drop; U.uFlits.value = sh ? sh.flits : 0; U.uBlack.value = sh ? sh.blackout : 0;
    U.uStand.value = STAND[st] || 0;
    if (sh && sh.kleur) { sh.kleur(0, U.uK0.value); sh.kleur(1, U.uK1.value); sh.kleur(2, U.uK2.value); }
  });

  // --- shaders: één vertex-shader, per soort een fragment-shader met een gedeelde kop ---
  const VS = `uniform vec3 uO;
    varying vec3 vP, vN, vW;
    void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vP = w.xyz - uO; vN = normal; gl_Position = projectionMatrix * viewMatrix * w; }`;
  const KOP = `uniform float uT, uTel, uReis, uPuls, uEn, uBas, uMid, uHoog, uOpb, uDrop, uFlits, uBlack, uStand, uZaad;
    uniform vec3 uK0, uK1, uK2, uMaat;
    varying vec3 vP, vN, vW;
    #define TAU 6.2831853
    float h11(float n) { return fract(sin(n * 12.9898 + 4.1414) * 43758.5453); }
    float h21(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float vn(vec2 p) { vec2 i = floor(p), q = fract(p); q = q * q * (3.0 - 2.0 * q);
      return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), q.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), q.x), q.y); }
    // vloeiend door het palet van de show, of harde kleur i
    vec3 kl(float t) { t = fract(t) * 3.0; return t < 1.0 ? mix(uK0, uK1, t) : t < 2.0 ? mix(uK1, uK2, t - 1.0) : mix(uK2, uK0, t - 2.0); }
    vec3 klH(float i) { float j = mod(floor(i), 3.0); return j < 0.5 ? uK0 : j < 1.5 ? uK1 : uK2; }
    // vlak: 2D-coördinaat in meters en het vlaknummer (0 vloer, 1 plafond, 2/3 zijwanden, 4 ingang, 5 uitgang); op de wanden loopt u
    // van binnenuit gezien naar rechts (tekst leesbaar, doorlopend rond de kamer)
    vec2 vlak(out float id) {
      if (abs(vN.y) > 0.5) { id = vN.y > 0.0 ? 0.0 : 1.0; return vP.xz; }
      id = abs(vN.x) > 0.5 ? (vN.x > 0.0 ? 2.0 : 3.0) : (vN.z > 0.0 ? 4.0 : 5.0);
      return vec2(dot(vP.xz, vec2(vN.z, -vN.x)), vP.y);
    }
    vec2 vlakHalf(float id) { return id < 1.5 ? uMaat.xz * 0.5 : id < 3.5 ? uMaat.zy * 0.5 : uMaat.xy * 0.5; }
    vec2 vlakMid(float id) { return id < 1.5 ? vec2(0.0) : vec2(0.0, uMaat.y * 0.5); }
    float isBreak() { return step(0.5, uStand) * step(uStand, 1.5); }
    float isOpb() { return step(1.5, uStand) * step(uStand, 2.5); }
    float isDrop() { return step(2.5, uStand); }
    // slot: break gedimd met een trage lichtgolf door de kamer (ook de break staat nooit stil); toppen zacht afgekapt (de hele kamer
    // licht op: anders maakt de bloom er een witte muur van); een strobe-flits maakt het beeld wit waar het al licht is
    vec4 eind(vec3 c) {
      c *= (1.0 - 0.2 * uBlack) * (1.0 + isBreak() * 0.6 * sin(dot(vP, vec3(0.35, 0.25, 0.6)) - uT * 1.7));
      float m = max(c.r, max(c.g, c.b));
      if (m > 0.85) { c *= (0.85 + 0.35 * log(m / 0.85 + 1e-4) + (m - 0.85) * 0.15) / m; m = max(c.r, max(c.g, c.b)); }
      c = mix(c, vec3(0.03 + 1.3 * m), uFlits * 0.8);
      return vec4(c, 1.0);
    }
  `;
  const SH = {};

  // eindeloze tunnel: ringen (poorten) razen op de reis naar je toe, segmenten draaien als een spiraal en springen op de tel,
  // op elke tel (opbouw 1-2-4, drop 2 per tel) schiet een witte golf uit de diepte langs je heen; de kopse wanden tonen de tunnel
  // die erachter doorloopt tot in het verdwijnpunt
  SH.tunnel = `void main() {
    float W = uMaat.x * 0.5, H = uMaat.y, D = uMaat.z * 0.5;
    vec2 q = vec2(vP.x / W, (vP.y - H * 0.5) / (H * 0.5));
    float rho = max(abs(q.x), abs(q.y));
    float kop = step(0.5, abs(vN.z));
    float z = mix(vP.z, sign(vP.z) * (D + 2.6 * (1.0 / max(rho, 0.02) - 1.0)), kop);
    float diep = mix(1.0, smoothstep(0.03, 0.35, rho), kop);
    float a = atan(q.y, q.x) / TAU + 0.5;
    float br = isBreak(), op = isOpb(), dr = isDrop();
    float tel = floor(uTel);
    float rz = (z + uReis * 2.8) / 1.4;
    float ri = floor(rz), rf = fract(rz), dz = fwidth(rz);
    float aa = 1.0 - smoothstep(0.2, 0.6, dz);
    float draai = mod(floor(uTel / 16.0), 2.0) < 0.5 ? 1.0 : -1.0;
    float tw = fract(a + draai * (rz * (0.025 + 0.03 * uMid) + uT * 0.025));
    float ns = 12.0 + 12.0 * step(0.5, h11(floor(uTel / 32.0) + uZaad));
    float sg = floor(tw * ns), sf = fract(tw * ns);
    float band = smoothstep(0.0, 0.05 + dz, rf) * smoothstep(0.45 + dz, 0.38, rf);
    float aan = step(0.42, h21(vec2(sg + uZaad, ri * 1.7 + tel * 3.0)));
    aan = max(aan, dr * step(0.25, h21(vec2(sg, ri + tel))) + op * step(1.0 - uOpb, h21(vec2(sg * 1.3, ri))));
    aan *= mix(1.0, step(0.55, h11(ri * 3.3 + floor(uTel / 4.0))), br);
    float voeg = smoothstep(0.0, 0.07, sf) * smoothstep(1.0, 0.93, sf);
    vec3 col = klH(ri + tel) * band * aan * voeg * (0.5 + 1.1 * uPuls * uEn + 0.6 * uDrop) * aa;
    // golf op de tel uit de diepte
    float nf = br > 0.5 ? 0.25 : 1.0 + dr + op * (uOpb < 0.5 ? 0.0 : uOpb < 0.75 ? 1.0 : 3.0);
    float gp = fract(uTel * nf);
    float zg = mix(D + 6.0, -D - 1.0, gp);
    float golf = exp(-abs(z - zg) * 2.2) * (1.0 - gp) * (0.35 + 0.65 * uEn) * (1.0 - 0.6 * br);
    col += mix(klH(tel + 1.0), vec3(1.0), 0.45) * golf * 1.3 * mix(1.0, aa, kop);
    // snelheidsstrepen tussen de ringen
    float sid = floor(a * 90.0);
    float st = step(0.8, h11(sid + uZaad)) * smoothstep(0.75, 1.0, fract(z * 0.22 + uReis * 1.4 + h11(sid * 3.1)));
    col += kl(a + uT * 0.05) * st * (0.25 + 0.5 * uHoog) * aa * (1.0 - band);
    col += klH(tel + 2.0) * 0.025 * voeg * aa;
    col *= diep * mix(1.0, 1.25, br);  // break: minder ringen, maar die wel zichtbaar (was 0,75: bijna zwart)
    gl_FragColor = eind(col);
  }`;

  // vloeibare kamer: twee lagen domain warping (fbm), oliefilm-kleurbanden die meestromen, donkere poelen; op elke tel een druppel:
  // een ring loopt vanuit het midden van elk vlak naar buiten en breekt het oppervlak
  SH.vloeistof = `
    #if ZW == 2
      #define OCT 2
    #elif ZW == 1
      #define OCT 3
    #else
      #define OCT 4
    #endif
    float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < OCT; i++) { v += a * vn(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }
    void main() {
      float id; vec2 c = vlak(id);
      vec2 m = c - vlakMid(id);
      float br = isBreak(), dr = isDrop();
      float t = uT * (0.09 + 0.05 * br) + uReis * 0.05;
      float ft = fract(uTel), r = length(m);
      float rr = r - ft * (6.0 + 4.0 * dr);
      float rimpel = sin(rr * 5.0) * exp(-rr * rr * 1.2) * (1.0 - ft) * (0.35 + 0.65 * uEn) * (1.0 - 0.8 * br);
      vec2 uv = c * 0.26 + vec2(id * 4.3 + uZaad, id * 2.1);
      uv += m / max(r, 0.2) * rimpel * 0.15;
      vec2 w1 = vec2(fbm(uv + vec2(0.0, t)), fbm(uv + vec2(5.2, 1.3) - t * 0.8));
    #if ZW < 2
      vec2 w2 = vec2(fbm(uv + 3.0 * w1 + vec2(1.7, 9.2) + t * 0.6), fbm(uv + 3.0 * w1 + vec2(8.3, 2.8) - t * 0.5));
    #else
      vec2 w2 = w1;
    #endif
      float fv = fbm(uv + (2.2 + 1.6 * uBas + 1.5 * uDrop) * w2);
      float dik = fv * 7.0 + length(w2) * 3.0 - uT * 0.35 - uReis * 0.2;
      float banden = pow(0.5 + 0.5 * sin(dik * 3.14159), 5.0);
      vec3 col = kl(fv * 1.8 + w1.x * 1.2 + w2.y * 0.6 + uT * 0.02) * (0.12 + 1.5 * banden);
      col *= smoothstep(0.22, 0.58, fv);
      col += kl(0.5 + ft) * max(0.0, rimpel) * 1.1;
      col *= 0.6 + 0.6 * uPuls * uEn + 0.45 * uDrop + 0.35 * br;
      gl_FragColor = eind(col);
    }`;

  // oneindigheidsspiegels: elk vlak in vierkante panelen, elk paneel een spiegel tot in het oneindige: ledlijsten die wegzakken in de
  // diepte (looplicht erover), daartussen een kaleidoscoop van de muurschildering; in de drop negatief op de tel
  SH.oneindig = `uniform sampler2D uTex;
    void main() {
      float id; vec2 c = vlak(id);
      vec2 hv = vlakHalf(id), m = c - vlakMid(id);
      float cel = id < 1.5 ? 4.2 : uMaat.y;
      vec2 n = max(vec2(1.0), floor(2.0 * hv / cel + 0.5));
      vec2 cs = 2.0 * hv / n;
      vec2 pid = floor((m + hv) / cs);
      vec2 lc = ((m + hv) - (pid + 0.5) * cs) / (cs * 0.5);
      lc.x *= cs.x / cs.y;
      float mx = max(cs.x / cs.y, 1.0);
      float mm = max(abs(lc.x) / mx, abs(lc.y));
      float br = isBreak(), dr = isDrop(), op = isOpb();
      float tel = floor(uTel);
      float l = -log(max(mm, 0.002));
      float rich = mod(pid.x + pid.y + id, 2.0) < 0.5 ? 1.0 : -1.0;
      float zl = l * 1.7 + uReis * 0.6;
      float li = floor(zl), lf = fract(zl), dl = fwidth(zl);
      float om = atan(lc.y, lc.x) / TAU + 0.5;
      // ledlijst over de naad (verbergt ook de naad van de textuur), looplicht rond
      float dd = min(lf, 1.0 - lf);
      float lijn = smoothstep(0.06 + dl, 0.0, dd);
      float even = step(0.5, mod(li, 2.0));
      float loop = 0.35 + 0.65 * pow(0.5 + 0.5 * sin((om * 6.0 + rich * uT * (0.6 + 0.4 * br) - li * 0.25) * TAU), 4.0);
      // kaleidoscoop: hoek in 8 spiegelende partjes, diepte = de laag tussen twee lijsten
      float seg = 1.0 / 8.0;
      float af = abs(mod(om + rich * uT * 0.01, seg) - seg * 0.5) / seg;
      vec2 kuv = vec2(af * 0.9 + pid.x * 0.13 + id * 0.21, lf * 0.6 + li * 0.37 + pid.y * 0.11);
      vec3 tx = texture2D(uTex, kuv).rgb;
      float neg = dr * step(0.5, mod(tel, 2.0)) * step(uDrop, 0.99) * step(0.6, uDrop);
      tx = mix(tx, 1.0 - tx, neg);
      float lum = dot(tx, vec3(0.3, 0.59, 0.11));
      vec3 col = mix(tx, kl(lum * 1.3 + li * 0.33 + uT * 0.02) * lum * 1.7, 0.6) * exp(-l * 0.8) * (0.3 + 0.3 * uPuls * uEn) * mix(1.0, 0.15, even);
      col *= 1.0 - lijn;
      col += klH(li + tel) * lijn * loop * (0.85 + 1.3 * uPuls * (1.0 - br) + 0.5 * uDrop + 0.5 * op * uOpb) * exp(-l * 0.3);
      col *= smoothstep(0.0, 0.07, mm) * mix(1.0, 0.85, br);
      col += klH(tel + pid.x + pid.y) * smoothstep(0.975, 1.0, mm) * (0.25 + 0.9 * uPuls);
      gl_FragColor = eind(col);
    }`;

  // glitch: muurschildering in blokken die op de tel verspringen (datamosh), scheurbanden, uitgesmeerde regels, RGB-split op de bas,
  // kleuren naar het palet, negatieve blokken in de drop, dode blokken, scanlijnen en woorden die oplichten op de wanden
  SH.glitch = `uniform sampler2D uTex, uWoord;
    void main() {
      float id; vec2 c = vlak(id);
      float br = isBreak(), op = isOpb(), dr = isDrop();
      float snel = dr > 0.5 ? 4.0 : op > 0.5 ? (uOpb < 0.5 ? 1.0 : uOpb < 0.75 ? 2.0 : 4.0) : br > 0.5 ? 0.5 : 1.0;
      float tel = floor(uTel * snel), tel1 = floor(uTel);
      float ht = h11(tel * 1.37 + uZaad);
      float bs = 0.35 + 1.1 * h11(tel * 2.1 + uZaad);
      vec2 bid = floor(c / bs) + id * 17.0;
      float hb = h21(bid + tel * 0.37);
      vec2 uv = c / vec2(3.4, 2.6) + vec2(id * 0.31, id * 0.17 + uT * (0.03 + 0.1 * br));
      if (hb > 0.62) uv += (vec2(h21(bid + 3.1 + tel), h21(bid + 7.7 + tel)) - 0.5) * 0.9;
      if (hb > 0.9) uv.y = floor(c.y / bs) * bs / 2.6 + id * 0.17;
      float bandId = floor(c.y * 3.0 + tel * 1.7);
      float scheur = step(0.84 - 0.25 * uBas - 0.2 * uDrop, h11(bandId * 1.7 + tel));
      uv.x += scheur * (h11(bandId + tel * 3.3) - 0.5) * 1.6;
      float px = mix(0.003, 0.05, step(0.72, ht));
      uv = floor(uv / px) * px;
      float sp = 0.006 + 0.03 * uBas + 0.05 * uDrop * uPuls + 0.02 * uPuls;
      vec3 col = vec3(texture2D(uTex, uv + vec2(sp, 0.0)).r, texture2D(uTex, uv).g, texture2D(uTex, uv - vec2(sp, sp * 0.5)).b);
      float l = dot(col, vec3(0.3, 0.59, 0.11));
      float lq = floor(l * 4.0 + 0.5) / 4.0;
      vec3 pk = mix(klH(tel1 + id), klH(tel1 + id + 1.0), step(0.5, lq)) * lq * 1.5;
      col = mix(col, pk, 0.45 + 0.4 * step(0.5, h11(tel * 5.3 + id)));
      if (h21(bid * 0.5 + tel + 1.0) > 0.93 - 0.35 * uDrop) col = klH(tel + 2.0) * (1.0 - l) * 1.3;
      col *= step(0.12 + 0.15 * br, h21(bid + 11.0 + tel));
      float sl = fract(vP.y * 22.0);
      col *= mix(1.0, 0.55 + 0.45 * step(0.5, sl), 1.0 - smoothstep(0.3, 0.6, fwidth(vP.y * 22.0)));
      col *= 0.45 + 0.75 * uPuls * uEn + 0.35 * uDrop + 0.5 * br;
      // woorden op de wanden: om de paar tellen een band met een woord, met RGB-split
      if (id > 1.5 && h11(tel1 * 7.3 + uZaad) > 0.45 - 0.3 * uDrop) {
        float yc = 1.0 + h11(tel1 * 3.1) * (uMaat.y - 2.2), bh = 0.55 + 0.5 * h11(tel1 * 5.7);
        float v = (vP.y - (yc - bh * 0.5)) / bh;
        if (v > 0.0 && v < 1.0) {
          float rij = floor(h11(tel1 * 9.1 + id) * 4.0);
          float u = c.x / (bh * 8.0) + h11(tel1) + uT * 0.05 * (mod(id, 2.0) * 2.0 - 1.0);
          float s2 = 0.004 + 0.01 * uBas;
          vec2 wv = vec2(u, (3.0 - rij + v) / 4.0);
          vec3 w = vec3(texture2D(uWoord, wv + vec2(s2, 0.0)).r, texture2D(uWoord, wv).r, texture2D(uWoord, wv - vec2(s2, 0.0)).r);
          col = mix(col * 0.25, mix(klH(tel1 + 1.0), vec3(1.0), 0.35) * w * (0.8 + 0.8 * uPuls), max(w.g, 0.6));
        }
      }
      gl_FragColor = eind(col);
    }`;

  // fractale grot: de wanden zijn ramen in een fractale grot (kaliset-draden in drie lagen achter het vlak, langs de kijkstraal: diepte
  // als je beweegt); de vorm ademt langzaam en zwelt op de bas, de draden gloeien op de tel, kleuren uit het palet
  SH.fractal = `
    #if ZW == 2
      #define LAG 1
      #define IT 7
    #elif ZW == 1
      #define LAG 2
      #define IT 8
    #else
      #define LAG 3
      #define IT 9
    #endif
    void main() {
      vec3 rd = normalize(vW - cameraPosition);
      float br = isBreak(), dr = isDrop();
      float adem = 0.5 + 0.5 * sin(uT * 0.16 + uReis * 0.05);
      vec3 C = vec3(0.86, 0.62, 0.74) + 0.05 * vec3(sin(uT * 0.11), sin(uT * 0.13 + 1.0), sin(uT * 0.07 + 2.0)) + 0.012 * sin(uT * 0.9) + 0.03 * uBas + 0.02 * uDrop;
      vec3 col = vec3(0.0);
      float fade = 1.0;
      for (int L = 0; L < LAG; L++) {
        float fl = float(L);
        vec3 q = vP + rd * fl * 1.1;
        vec3 p = q * (0.13 + 0.015 * adem) + vec3(uZaad * 0.05, 0.2, 0.4 + uReis * 0.012 + uT * 0.002);
        float tr = 9.0, gw = 0.0;
        for (int i = 0; i < IT; i++) {
          p = abs(p) / dot(p, p) - C;
          tr = min(tr, min(abs(p.x), abs(p.y)));
          gw += exp(-4.0 * dot(p, p));
        }
        float draad = exp(-tr * (60.0 - 20.0 * uPuls * uEn));
        col += kl(fl * 0.3 + gw * 0.12 + uT * 0.015) * (draad * 0.5 + 0.004 * gw * gw) * fade;
        fade *= 0.5;
      }
      col *= (0.6 + 0.8 * uPuls * uEn + 0.5 * uDrop) * mix(1.0, 0.85, br);
      gl_FragColor = eind(col);
    }`;

  // stroboscoop-kubus: zwart/wit. Scanlijnen over alle vlakken (break één trage, opbouw steeds meer en sneller, drop een raster),
  // op de tel licht één vlak fel op (drop: per kwarttel om de beurt), opbouw met een strobe-aanloop van 1-2-4-8 per tel
  SH.strobe = `void main() {
      float id; vec2 c = vlak(id);
      vec2 hv = vlakHalf(id), m = c - vlakMid(id);
      vec2 u = m / hv;
      float br = isBreak(), op = isOpb(), dr = isDrop();
      float tel = floor(uTel), ft = fract(uTel);
      float n = br > 0.5 ? 3.0 : op > 0.5 ? 2.0 + floor(uOpb * 6.0) : dr > 0.5 ? 6.0 : 4.0;
      float spd = br > 0.5 ? 0.35 : op > 0.5 ? 0.25 + 1.5 * uOpb : dr > 0.5 ? 1.0 : 0.5;
      float y = id < 1.5 ? u.y : u.y;
      float lp = fract(y * 0.5 * n + 0.5 - uReis * spd * (mod(id, 2.0) * 2.0 - 1.0));
      float dy = fwidth(y * 0.5 * n);
      float lijn = smoothstep(0.006 + dy * 1.5, 0.0, abs(lp - 0.5));
      float gloed = exp(-abs(lp - 0.5) * 40.0) * 0.25;
      float k = (lijn + gloed) * (0.8 + 0.7 * uPuls * (1.0 - br) + 0.4 * br);
      // raster: dwarslijnen die heen en weer vegen (groove half, opbouw groeit, drop vol)
      float x = u.x;
      float lp2 = fract(x * 2.0 + 0.5 + sin(uT * 2.0 + id) * 0.5);
      float dx = fwidth(x * 2.0);
      float rw = dr * (0.6 + 0.6 * uDrop) + op * uOpb * 0.8 + (1.0 - br - op - dr) * 0.45;  // groove half, opbouw groeit, drop vol
      k += rw * (smoothstep(0.006 + dx * 1.5, 0.0, abs(lp2 - 0.5)) + exp(-abs(lp2 - 0.5) * 40.0) * 0.2);
      // vlakflits: op de tel één vlak; drop per kwarttel; opbouw 1-2-4-8 per tel (zoals zaal 1)
      float nf = dr > 0.5 ? 4.0 : op > 0.5 ? (uOpb < 0.5 ? 1.0 : uOpb < 0.75 ? 2.0 : uOpb < 1.0 ? 4.0 : 8.0) : 1.0;
      float q = floor(uTel * nf), fq = fract(uTel * nf);
      float wie = floor(h11(q * 3.7 + uZaad) * 6.0);
      float vl = step(abs(id - wie), 0.5) * pow(1.0 - fq, 4.0);
      vl *= br > 0.5 ? 0.0 : op > 0.5 ? 0.25 + 0.75 * uOpb : dr > 0.5 ? 0.6 + 0.4 * uDrop : 0.55 * uEn;
      // ook het tegenoverliggende vlak in de drop
      float tegen = floor(wie / 2.0) * 2.0 + (1.0 - mod(wie, 2.0));
      vl += dr * step(abs(id - tegen), 0.5) * pow(1.0 - fq, 6.0) * 0.5;
      // rand van elk vlak: dunne lijn (de kubus blijft leesbaar in het zwart)
      vec2 rnd = 1.0 - abs(u);
      float rand = smoothstep(0.012, 0.0, min(rnd.x * hv.x, rnd.y * hv.y)) * (0.15 + 0.5 * uPuls * (1.0 - br));
      float wit = min(1.6, k + vl * 1.4 + rand);
      gl_FragColor = eind(vec3(wit));
    }`;

  // warp: de kamer is een raam op de ruimte; sterren op cilinders om de looprichting (+z) schieten langs, strepen lengen met de snelheid
  // (break traag drijven, drop hyperspace), nevel in het palet, gloed in het verdwijnpunt; op de tel een schokgolf uit het midden
  SH.warp = `
    #if ZW == 2
      #define LAGEN 2
    #else
      #define LAGEN 3
    #endif
    void main() {
      vec3 rd = normalize(vW - cameraPosition);
      float br = isBreak(), op = isOpb(), dr = isDrop();
      float r2 = length(rd.xy) + 1e-4;
      float ang = atan(rd.y, rd.x) / TAU + 0.5 + uT * 0.008;
      float zc = rd.z / r2;
      float tel = floor(uTel);
      float snel = br > 0.5 ? 0.2 : op > 0.5 ? 0.3 + 1.2 * uOpb * uOpb : dr > 0.5 ? 1.2 + 0.6 * uDrop : 0.45;
      float streep = 0.03 + 0.4 * min(1.0, snel * (0.6 + 0.6 * uPuls));
      vec3 col = vec3(0.0);
      for (int L = 0; L < LAGEN; L++) {
        float fl = float(L);
        float R = 1.0 + fl * 0.8;
        float zz = zc * R - uReis * (4.0 + fl * 2.0);
        vec2 g = vec2(ang * (36.0 + fl * 28.0), zz * 0.35);
        vec2 ci = floor(g), cf = fract(g);
        float hs = h21(ci + fl * 17.3 + uZaad);
        float px = 0.2 + 0.6 * h21(ci + 3.1);
        float ddx = (cf.x - px) * (36.0 + fl * 28.0) * r2 * 0.12;
        float ddy = max(0.0, abs(cf.y - 0.5) - streep) * 2.8;
        float b = exp(-(ddx * ddx * 600.0 + ddy * ddy * 200.0)) * step(0.35, hs) * 1.8;
        b *= smoothstep(4.0, 0.0, abs(zc) * 0.25 + fl * 0.3) * smoothstep(0.02, 0.15, r2);
        col += mix(vec3(1.0), klH(ci.x + ci.y + tel), 0.35 + 0.35 * dr) * b * (0.9 - fl * 0.2);
      }
      float neb = vn(vec2(ang * 7.0 + uT * 0.01, zc * 0.25 - uReis * 0.8)) * vn(vec2(ang * 3.0, zc * 0.1 + uT * 0.02));
      col += kl(neb + ang + uT * 0.01) * pow(neb, 1.3) * 0.85;   // nevel: kleur achter de sterren (zijwaarts gezien was het bijna zwart)
      // gloed in het verdwijnpunt (voor en achter), schokgolf op de tel
      float as = 1.0 - r2;
      col += kl(uT * 0.03) * pow(max(0.0, as), 18.0) * (0.4 + 0.8 * uPuls + uDrop) ;
      float gp = fract(uTel * (1.0 + dr));
      float sch = exp(-abs(abs(zc) - mix(6.0, 0.2, gp)) * 3.0) * (1.0 - gp) * (1.0 - br) * (0.3 + 0.7 * uEn);
      col += mix(klH(tel), vec3(1.0), 0.3) * sch * 0.9;
      col *= 0.95 + 0.5 * uPuls * uEn + 0.3 * uDrop;
      col *= mix(1.0, 0.9, br);
      gl_FragColor = eind(col);
    }`;

  // hypnose: spiralen. Wanden als rij tandwielen (buren draaien tegengesteld), vloer en plafond één grote spiraal; de spiraal zoomt
  // op de kick, draait om per 4 maten, zwart met palet om en om per arm; in de drop wisselen zwart en kleur op de tel
  SH.hypnose = `void main() {
      float id; vec2 c = vlak(id);
      vec2 m = c - vlakMid(id);
      float br = isBreak(), op = isOpb(), dr = isDrop();
      float tel = floor(uTel);
      float s = uMaat.y;
      vec2 lc = m; float cid = id;
      if (id > 1.5) { float hx = vlakHalf(id).x; float k = max(1.0, floor(2.0 * hx / s + 0.5)); float cw = 2.0 * hx / k;
        cid = floor((m.x + hx) / cw); lc = vec2((m.x + hx) - (cid + 0.5) * cw, m.y); cid += id * 7.0; }
      float r = length(lc) + 1e-3, a = atan(lc.y, lc.x) / TAU;
      float rich = (mod(cid, 2.0) < 0.5 ? 1.0 : -1.0) * (mod(floor(uTel / 16.0), 2.0) < 0.5 ? 1.0 : -1.0);
      float zoom = 1.0 + (0.22 * uPuls * uEn + 0.12 * uDrop) * (1.0 - br);
      float armen = id < 1.5 ? 5.0 : 3.0;
      float sp = a * armen + log(r * zoom) * (id < 1.5 ? 2.2 : 3.0) - rich * (uReis * 0.55 + uT * 0.06);
      float ds = fwidth(sp);
      float fb = fract(sp), arm = floor(sp);
      float band = smoothstep(0.0, ds + 0.02, fb) * smoothstep(0.42 + ds + 0.02, 0.42, fb);
      float wissel = dr * mod(tel, 2.0);
      vec3 kleur = klH(arm + floor(uTel / 4.0)) * (0.5 + 0.6 * uPuls * uEn + 0.4 * uDrop);
      vec3 col = mix(kleur * band, kleur * (1.0 - band) * 0.9, wissel);
      // ringen op de tel vanuit het midden
      float ring = exp(-abs(r - fract(uTel) * s * 1.2) * 6.0) * (1.0 - fract(uTel)) * (1.0 - br);
      col += vec3(1.0) * ring * 0.6 * uEn;
      col *= smoothstep(0.0, 0.25, r) * (1.0 - smoothstep(0.35, 0.8, ds));
      col *= mix(1.0, 0.7, br) * (0.9 + 0.3 * op * uOpb);
      gl_FragColor = eind(col);
    }`;

  // --- woorden voor de glitch-kamer: één canvas-textuur, 4 regels ---
  let woordTex = null;
  function woorden() {
    if (woordTex) return woordTex;
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 512;
    const g = cv.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, 1024, 512);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    ['DEEP STEPPER', 'SAMSONIGHT', 'BLOODLINE', 'DEEPER ∞'].forEach((w, i) => {
      g.font = '900 96px Arial Black, Arial, sans-serif';
      const b = g.measureText(w).width, s = Math.min(1, 980 / b);
      g.save(); g.translate(512, i * 128 + 66); g.scale(s, 1); g.fillText(w, 0, 0); g.restore();
    });
    woordTex = new THREE.CanvasTexture(cv);
    woordTex.wrapS = THREE.RepeatWrapping; woordTex.wrapT = THREE.ClampToEdgeWrapping;
    woordTex.userData = woordTex.userData || {}; woordTex.userData.doolhofHouden = true;
    return woordTex;
  }
  const BRON = ['kosmos', 'uv-jungle', 'neonsteeg', 'paddenstoelen', 'rave-flyers', 'arcade', 'bass-tempel', 'slijmhol', 'chroom'];
  const tex = (naam, herhaal) => doolhof.tex ? doolhof.tex(naam, herhaal) : null;

  // --- de schil: vloer, plafond, wanden met de twee deurgaten (2 x 2,6 m), voorkant naar binnen; één geometrie ---
  function schil(w, d, h) {
    const W = w / 2, D = d / 2, DW = 1.0, DH = Math.min(2.6, h), pos = [], nor = [];
    const V = (x, y, z) => new THREE.Vector3(x, y, z), kr = new THREE.Vector3();
    function rect(o, a, b, n) {  // o + a + b, voorkant naar n
      if (kr.crossVectors(a, b).dot(n) < 0) { const t = a; a = b; b = t; }
      const p = [o, o.clone().add(a), o.clone().add(a).add(b), o.clone().add(b)];
      for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(p[i].x, p[i].y, p[i].z); nor.push(n.x, n.y, n.z); }
    }
    rect(V(-W, 0, -D), V(w, 0, 0), V(0, 0, d), V(0, 1, 0));
    rect(V(-W, h, -D), V(w, 0, 0), V(0, 0, d), V(0, -1, 0));
    rect(V(-W, 0, -D), V(0, h, 0), V(0, 0, d), V(1, 0, 0));
    rect(V(W, 0, -D), V(0, h, 0), V(0, 0, d), V(-1, 0, 0));
    for (const [z, nz] of [[-D, 1], [D, -1]]) {
      const n = V(0, 0, nz);
      rect(V(-W, 0, z), V(W - DW, 0, 0), V(0, h, 0), n);
      rect(V(DW, 0, z), V(W - DW, 0, 0), V(0, h, 0), n);
      if (h > DH + 1e-3) rect(V(-DW, DH, z), V(2 * DW, 0, 0), V(0, h - DH, 0), n);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.computeBoundingSphere();
    return g;
  }

  // --- per soort: maat, camerastandpunten, sporen, publiek, lamp ---
  const SOORT = {
    tunnel: { maat: r => ({ w: 6.2 + r() * 1.2, d: 19 + r() * 4, h: 4.2 + r() * 0.6 }), shots: ['eind', 'ingang', 'omhoog', 'rond', 'terug'], spoor: { a: 0.4, z: 1.015, r: 0 }, publiek: 20 },
    vloeistof: { maat: r => ({ w: 9.5 + r() * 2, d: 13 + r() * 3, h: 4.8 + r() * 0.8 }), shots: ['hoek', 'rond', 'plafond', 'ingang', 'terug'], spoor: { a: 0.6, z: 1.0, r: 0.008 }, publiek: 30 },
    oneindig: { maat: r => ({ w: 9 + r() * 2, d: 13 + r() * 3, h: 4.4 + r() * 0.6 }), shots: ['hoek', 'ingang', 'rond', 'omhoog', 'terug'], spoor: { a: 0.45, z: 0.985, r: 0 }, publiek: 28, bron: true },
    glitch: { maat: r => ({ w: 9 + r() * 2, d: 13 + r() * 3, h: 4.2 + r() * 0.6 }), shots: ['ingang', 'hoek', 'rond', 'terug', 'plafond'], spoor: { a: 0.12, z: 1.0, r: 0 }, publiek: 28, bron: true },
    fractal: { maat: r => ({ w: 10 + r() * 2, d: 13 + r() * 3, h: 5.5 + r() * 1 }), shots: ['omhoog', 'hoek', 'ingang', 'rond', 'terug'], spoor: { a: 0.45, z: 1.008, r: 0.003 }, publiek: 30 },
    strobe: { maat: r => { const s = 9 + r() * 1.5; return { w: s, d: s, h: 5.5 + r() * 0.8 }; }, shots: ['hoek', 'ingang', 'rond', 'terug', 'omhoog'], spoor: { a: 0.06, z: 1.0, r: 0 }, publiek: 26, wit: true },
    warp: { maat: r => ({ w: 10.5 + r() * 2, d: 14 + r() * 3, h: 5.5 + r() * 1 }), shots: ['eind', 'omhoog', 'ingang', 'rond', 'hoek'], spoor: { a: 0.5, z: 1.02, r: 0 }, publiek: 30 },
    hypnose: { maat: r => ({ w: 9 + r() * 2, d: 14 + r() * 3, h: 4.4 + r() * 0.6 }), shots: ['plafond', 'hoek', 'ingang', 'rond', 'omhoog'], spoor: { a: 0.42, z: 1.0, r: 0.02 }, publiek: 28 },
  };
  const MIJN = Object.keys(SOORT);

  // --- camera: per kamer vijf standpunten, knip op de tel (groove per 8 tellen, break 16, opbouw 8 -> 4, drop 4) ---
  function maakCam(ctx, maat, lijst) {
    const { w, d, h } = maat, W = w / 2, D = d / 2, r = ctx.rnd, zij = r() < 0.5 ? -1 : 1;
    const cp = new THREE.Vector3(), cl = new THREE.Vector3(), uit = { pos: cp, look: cl, fov: 60 }, lp = new THREE.Vector3();
    let blokNu = null, t0 = 0, keuze = -1;
    const SHOT = {
      eind: u => { cp.set(0.35 * zij, 1.5, -D + 1.0 + Math.min(1.5, 0.08 * u)); cl.set(-0.2 * zij, h * 0.5, D); return 58; },
      ingang: u => { cp.set(zij * Math.min(1.3, W - 0.7), 1.05 + 0.15 * Math.sin(u * 0.35), -D + 1.3 + Math.min(1.5, 0.07 * u)); cl.set(-zij * 0.4, 1.9, D); return 64; },
      hoek: u => { cp.set(zij * (W - 0.7), h * 0.6, -D + 1.4); cl.set(-zij * W * 0.4 + 0.4 * Math.sin(u * 0.25), 0.7, D * 0.3); return 74; },
      omhoog: u => { cp.set(zij * 1.1, 0.75, -D * 0.3 + Math.min(1.2, 0.05 * u)); cl.set(-zij * 0.8 * Math.cos(u * 0.2), h, D * 0.45); return 82; },
      rond: (u, loper) => {
        lp.set(0, 0, 0); if (loper && loper.root) { lp.copy(loper.root.position); ctx.groep.worldToLocal(lp); }
        const a = u * 0.28 + (zij > 0 ? 0.6 : Math.PI + 0.6), R = 1.75;  // binnen de ring van dansers (2,5 m+) en publiek (2,3 m+)
        cp.set(lp.x + Math.sin(a) * R, 1.45 + 0.3 * Math.sin(u * 0.5), lp.z + Math.cos(a) * R); cl.set(lp.x, 1.35, lp.z); return 66;
      },
      terug: u => { cp.set(-zij * (W - 0.8), h * 0.5, D - 1.3 - Math.min(1.2, 0.06 * u)); cl.set(zij * 0.6, 1.0, -D * 0.4); return 70; },
      plafond: u => { cp.set(0.4 * zij, h - 0.45, -D * 0.5); cl.set(-0.3 * zij + 0.3 * Math.sin(u * 0.3), 0.0, D * 0.2); return 76; },
    };
    return function cam(t, loper) {
      const sh = doolhof.show, st = sh ? sh.stand : 'groove', per = st === 'break' ? 16 : st === 'drop' ? 4 : st === 'opbouw' ? (sh.opbouw < 0.5 ? 8 : 4) : 8;
      const blok = Math.floor(Math.max(0, beatPos) / per) + ':' + per;
      if (blok !== blokNu) {
        keuze = blokNu === null ? 0 : (keuze + 1 + Math.floor(r() * (lijst.length - 1))) % lijst.length;
        blokNu = blok; t0 = t;
      }
      uit.fov = SHOT[lijst[keuze]](t - t0, loper);
      cp.x = Math.max(-W + 0.4, Math.min(W - 0.4, cp.x)); cp.z = Math.max(-D + 0.4, Math.min(D - 0.4, cp.z)); cp.y = Math.max(0.4, Math.min(h - 0.3, cp.y));
      ctx.groep.updateWorldMatrix(true, false); ctx.groep.localToWorld(cp); ctx.groep.localToWorld(cl);
      return uit;
    };
  }

  // --- sporen (feedback) per soort: alleen zolang de camera in een effectkamer staat; de kern zet ze elk beeld zelf, wij buigen ze
  // vlak voor het tekenen af (weg uit de kamer = meteen weer de waarden van de kern) ---
  let huidig = null;  // { R: kamer-info, stamp }
  const cw = new THREE.Vector3();
  function spoorK() {
    if (!huidig || huidig.stamp !== beeldNr || typeof camera === 'undefined') return 0;
    const k = huidig, g = k.groep; if (!g.visible) return 0;
    cw.copy(camera.position); g.worldToLocal(cw);
    const bx = k.maat.w / 2 - Math.abs(cw.x), bz = k.maat.d / 2 - Math.abs(cw.z);
    return Math.max(0, Math.min(1, bx / 0.5, bz / 1.5));
  }
  if (typeof feedback !== 'undefined' && feedback && !feedback.dhEffect) {
    const oud = feedback.render;
    feedback.render = function () {
      const k = spoorK();
      if (k > 0) {
        const u = this.material.uniforms, sp = huidig.spoor, sh = doolhof.show;
        const a = sp.a * (sh && sh.flits > 0.3 ? 0.35 : 1) * (1 + 0.25 * (sh ? sh.blackout : 0));
        u.amount.value += (a - u.amount.value) * k;
        u.zoom.value += (sp.z - u.zoom.value) * k;
        u.rotA.value += (sp.r * Math.sin(U.uT.value * 0.11) - u.rotA.value) * k;
      }
      return oud.apply(this, arguments);
    };
    feedback.dhEffect = true;
  }
  // bloom: in een effectkamer licht de hele ruimte op; met de bloom van het doolhof (gemaakt voor donkere kamers met lijntjes licht) werd
  // dat een witte waas. Alleen tijdens het tekenen zachter, daarna staat de waarde van de kern er weer
  if (typeof bloom !== 'undefined' && bloom && !bloom.dhEffect) {
    const oud = bloom.render;
    bloom.render = function () {
      const k = spoorK();
      if (k <= 0) return oud.apply(this, arguments);
      const s0 = this.strength; this.strength = s0 * (1 - 0.45 * k);
      try { return oud.apply(this, arguments); } finally { this.strength = s0; }
    };
    bloom.dhEffect = true;
  }

  // --- gewicht: samen ~1 op 4 kamers. De boiler komt elke 4e kamer vanzelf; van de rest moet ~1/3 een effectkamer zijn, dus samen de
  // helft van de andere gewichten. De laatst bezochte soort even minder (niet twee keer dezelfde kort na elkaar) ---
  let recent = null;
  function gewicht(s) {
    const K = doolhof.kamers; let ander = 0;
    for (const k in K) if (!k.startsWith('fx-')) ander += Math.max(0, +K[k].gewicht || 0);
    return (ander * 0.5 / MIJN.length) * (recent === s ? 0.2 : 1);
  }

  // --- een effectkamer bouwen ---
  function* maak(soort, ctx) {
    const S = SOORT[soort], r = ctx.rnd, maat = S.maat(r), { w, d, h } = maat, W = w / 2, D = d / 2, Z = ctx.zwaar;
    const extra = { uO: f(ctx.groep.getWorldPosition(new THREE.Vector3())), uMaat: f(new THREE.Vector3(w, h, d)), uZaad: f(Math.floor(r() * 97) + 0.37) };
    if (S.bron) extra.uTex = f(tex(BRON[Math.floor(r() * BRON.length)], true));
    if (soort === 'glitch') extra.uWoord = f(woorden());
    const mat = new THREE.ShaderMaterial({ uniforms: Object.assign({}, U, extra), vertexShader: VS, fragmentShader: KOP + SH[soort],
      defines: { ZW: Z }, extensions: { derivatives: true } });
    const wand = new THREE.Mesh(schil(w, d, h), mat);
    wand.name = 'fx-' + soort; wand.renderOrder = -2;
    ctx.groep.add(wand);
    yield;
    // publiek: silhouetten rondom, het pad (x = 0) en de deuren vrij, een open plek in het midden voor de loper
    const plekken = [], NS = window.clubPubliek && clubPubliek.maak ? clubPubliek.aantal(S.publiek) : 0;
    for (let p = 0; plekken.length < NS && p < 700; p++) {
      const x = (r() * 2 - 1) * (W - 0.6), z = (r() * 2 - 1) * (D - 0.6);
      if (Math.abs(x) < 0.95) continue;
      if (Math.abs(x) < 2.0 && Math.abs(z) > D - 2.2) continue;
      if (Math.hypot(x, z) < 2.3) continue;  // de cirkel van de 'rond'-camera vrij
      if (plekken.some(q => Math.hypot(q.x - x, q.z - z) < 0.62)) continue;
      plekken.push({ x, z, face: Math.atan2(-x, -z * 0.3) + (r() - 0.5) * 1.6 });
    }
    const publiek = NS && plekken.length ? clubPubliek.maak(ctx.groep, { plekken, vast: true, rnd: r, telefoons: 0.1, licht: { x: 0, y: h * 0.8, z: 0 },
      kleuren: { a: U.uK0.value, b: U.uK1.value, vul: new THREE.Color(0x000000) } }) : null;
    yield;
    // 3D-dansers rond het midden
    const nf = [5, 4, 3][Z] || 3, figs = [];
    for (let i = 0; i < nf; i++) {
      const a = (i + 0.5) / nf * Math.PI * 2 + r() * 0.5, rr = 2.5 + r() * 1.0;
      let x = Math.sin(a) * rr, z = Math.cos(a) * rr * 1.2;
      if (Math.abs(x) < 1.1) x = (x < 0 ? -1 : 1) * (1.1 + r() * 0.4);
      x = Math.max(-W + 0.8, Math.min(W - 0.8, x)); z = Math.max(-D + 2.4, Math.min(D - 2.4, z));
      const fd = ctx.figuur({ x, z, face: Math.atan2(-x, -z) + (r() - 0.5) * 1.2, rol: 'dans' });
      if (fd) figs.push(fd);
    }
    const lamp = ctx.licht(0xffffff, 1.2, Math.max(w, d) * 1.2, 0, h - 0.6, 0);
    const info = { groep: ctx.groep, maat, spoor: S.spoor, stamp: -1 };
    const cam = maakCam(ctx, maat, S.shots);
    const wp = new THREE.Vector3(), lk = new THREE.Color();
    let weg = false;
    levend++;  // pas nu: een afgebroken bouw (gestopt) krijgt geen opruimen()
    return {
      maat, blijf: 14,
      route: [{ x: 0, z: -D }, { x: 0.35 * (r() < 0.5 ? -1 : 1), z: -D / 2 }, { x: 0, z: 0 }, { x: 0, z: D / 2 }, { x: 0, z: D }],
      cam,
      update() {
        if (weg) return;
        if (recent !== soort) recent = soort;
        info.stamp = beeldNr; huidig = info;
        extra.uO.value.copy(ctx.groep.getWorldPosition(wp));
        const sh = doolhof.show, pu = U.uPuls.value, en = U.uEn.value, fl = sh ? sh.flits : 0, blk = sh ? sh.blackout : 0;
        // publiek: tegenlicht in de kleuren van het effect, flitst mee
        if (publiek) publiek.zet({ a: S.wit ? lk.setRGB(1, 1, 1) : U.uK0.value, b: S.wit ? lk : U.uK1.value,
          helder: (0.22 + 0.3 * pu * en) * (1 - 0.6 * blk), flits: fl * 0.6, rand: (0.7 + 0.7 * pu * en + 0.4 * U.uDrop.value) * (1 - 0.5 * blk) });
        // de lamp: het licht dat het effect op de dansers werpt
        if (lamp) {
          if (S.wit) lamp.color.setRGB(1, 1, 1); else lamp.color.copy(U.uK0.value).lerp(U.uK1.value, 0.5 + 0.5 * Math.sin(U.uT.value * 0.7));
          lamp.intensity = ((0.5 + 1.4 * pu * en + 0.8 * U.uDrop.value) * (1 - 0.7 * blk) + 2.0 * fl) * (S.wit ? 0.6 + 1.2 * pu : 1);
        }
      },
      opruimen() {
        if (weg) return; weg = true;
        levend = Math.max(0, levend - 1);
        if (huidig === info) huidig = null;
        if (publiek) publiek.opruimen();
      },
    };
  }

  for (const s of MIJN) {
    const def = { maak: ctx => maak(s, ctx) };
    Object.defineProperty(def, 'gewicht', { enumerable: true, get: () => gewicht(s) });
    doolhof.registreer('fx-' + s, def);
  }
  FX.soorten = MIJN.map(s => 'fx-' + s);
  FX.bron = { VS, KOP, SH };  // testen: shader in een draaiende kamer vervangen
  FX.info = () => ({ levend, recent, reis: +reis.toFixed(2), gewichten: Object.fromEntries(MIJN.map(s => ['fx-' + s, +gewicht(s).toFixed(2)])), spoor: +spoorK().toFixed(2) });
})();

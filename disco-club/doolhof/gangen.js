// --- Gangstijlen van het doolhof: elke S-gang tussen twee kamers krijgt een eigen stijl, minstens op het niveau van de acid-gang (z2/gang.js) ---
// Contract (doolhof/kern.js): doolhof.gangStijl(naam, { gewicht, maak(g, maat, rnd, zwaar) => { muur?, vloer?, plafond?, muurMaat?, vloerMaat?, update(dt, now, b, stand) } }).
// maak mag een generator zijn (zoals hier): de kern bouwt dan op de achtergrond en pauzeert bij een yield als het budget van het beeld op is.
// maak draait per overgang TWEE keer (de gang achter de uitgang van kamer A en die vóór de ingang van kamer B), met dezelfde maat en hetzelfde
// zaad. Daarom: alleen rnd gebruiken (nooit Math.random/rnd()/pick), maat.deel-fabriekjes trekken zelf geen rnd, en update is een zuivere
// functie van now/b/stand (geen tellertjes, geen dt-optelsommen): dan zijn beide helften op elk moment gelijk en valt de wissel niet op.
// maat: L1/L2/L3/B/H/h/LEN, sx + recht(o) (tekst leesbaar in een gespiegelde gang), zwaar, st(x,z) -> [s,d], xz(s,d) -> {x,z,dx,dz}, lijn(d),
// pad (looplijn), dwars (rechte stukken in s), kijk (de twee muren recht vooruit), bol (omhullende bol), deel(sleutel, maak) (één keer voor beide helften).
// Ledgang (ronde 3): muren, plafond en vloer zijn bewegende ledoppervlakken op de gangcoördinaten (s langs de gang, d zijwaarts, y hoogte):
// één shaderprogramma voor alle muren/plafonds en één voor alle vloeren (zie LEDW_F/LEDV_F), per stijl alleen andere uniforms. Op de muren
// de schildering van de stijl als beeldmateriaal (scroll, zoom op de kick, kaleidoscoop, kleur naar het palet, pixelate, RGB-split,
// negatief/glitch op de drop) of patronen (balken die door de gang rennen, spectrum, golven, lopende tekst, plasma, blokken, chevrons);
// de vloer is een ledvloer zoals in zaal 1 (tegels met voegen, patroon per tel) of fijne leds met de schildering. Wat erop staat kiest de
// ledregie (ledRegie) per 4 maten uit tel + zaad, dus beide helften blijven gelijk. De schermen flitsen op de tel (vlak, golf door de gang,
// één muur, band), om de 8 maten groot; break = donker en traag, opbouw = balken versnellen + strobe-blokken, drop = strobe-salvo, daarna
// elke maat een andere inhoud en elke tel een flits/negatief. Daarbij de lichtshow van ronde 2: koppen aan het plafond, laserwaaiers,
// ringen, ledstrips met looplicht, neonborden. Alles onverlicht (shader/additief), weinig draw calls; zwaar 2 (tv): MINI (geen ledpuntjes).
// Test: doolhof.gangLedForceer = { muur, plafond, vloer } (nummers van M/V) zet de inhoud vast.
(function () {
  'use strict';
  const doolhof = window.doolhof = window.doolhof || {};
  doolhof.gangStijlen = doolhof.gangStijlen || {};
  if (!doolhof.gangStijl) doolhof.gangStijl = (naam, def) => { if (naam && def && typeof def.maak === 'function') doolhof.gangStijlen[naam] = def; };
  if (typeof THREE === 'undefined' || typeof renderer === 'undefined' || typeof clubHooks === 'undefined') return;

  window.doolhof.tex = window.doolhof.tex || (() => { const c = {}; return (naam, herhaal) => { const k = naam + (herhaal ? '*' : ''); if (!c[k]) { const t = new THREE.TextureLoader().load('tex/doolhof/' + naam + '.jpg'); if (renderer.outputEncoding === THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding; if (herhaal) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.userData = t.userData || {}; t.userData.doolhofHouden = true; c[k] = t; } return c[k]; }; })();
  // (eigen toevoeging: t.userData = t.userData || {} — een Texture heeft in three r128 geen userData; dit bestand laadt als eerste, dus deze lader wint)
  const tex = (naam, herhaal) => doolhof.tex(naam, herhaal);

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

  // stemming van de muziek en de lichtregie: één toestand per beeld voor alle gangen (zelfde b en now = beide helften gelijk).
  // Bron: de show-bus van de kern (doolhof.show: stand, opbouw 0..1, drop 0..1, flits 0..1, kleur(i), blackout 0..1) zodat gangen en
  // kamers dezelfde dynamiek hebben; ontbreekt hij (of een veld), dan zelf uit clubRegie/pulse. Kleuren: in de groove en de opbouw het eigen
  // palet van de stijl (elke gang een eigen karakter), in de break en de drop het palet van de bus (break koel, drop heet: alles samen).
  const getal = (o, k) => (o && typeof o[k] === 'number' && isFinite(o[k]) ? o[k] : null);
  function showBus() {
    const s = doolhof.show;
    if (!s) return null;
    try { const v = typeof s === 'function' ? s() : s; return v && typeof v === 'object' ? v : null; } catch (e) { return null; }
  }
  function stemming(b, now) {
    if (b._k) return b._k;
    const r = b.regie, bus = showBus();
    const st = bus && typeof bus.stand === 'string' ? bus.stand : (b.stand || 'groove');
    const sinds = r && r.dropBeat >= 0 ? b.pos - r.dropBeat : 1e9;
    const opb = getal(bus, 'opbouw') != null ? Math.min(1, getal(bus, 'opbouw')) : st === 'opbouw' && r ? Math.min(1, (r.opbouwTel || 0) / 16) : 0;
    const drop = getal(bus, 'drop') != null ? getal(bus, 'drop') : st === 'drop' ? Math.max(0, 1 - sinds / 16) : 0;
    // stroboscoop (bus, anders zelf): drop = salvo (vier flitsen per tel), daarna een flits op de tel; opbouw = aanloop, steeds sneller.
    // salvo = het stuk waarin de koppen en ringen wit meeflitsen en lasers/gobo's uit zijn. 'Stroboscoop: uit' = niet knipperen.
    let flits = 0, salvo = 0;
    if (!(typeof S !== 'undefined' && S.strobe === 'uit')) {
      if (getal(bus, 'flits') != null) {
        flits = getal(bus, 'flits') * (st === 'opbouw' ? 0.4 : st === 'drop' ? 1 : 0.7);
        salvo = st === 'drop' && sinds >= -0.5 && sinds < (typeof S !== 'undefined' && S.strobe === 'vaak' ? 2 : 1) ? 1 : 0;
      }
      else if (st === 'drop' && sinds >= 0 && sinds < 4) { salvo = 1; flits = frac(b.pos * 4) < 0.3 ? 1 : 0; }
      else if (st === 'drop' && sinds >= 4 && sinds < 8) flits = frac(b.pos) < 0.1 ? 0.6 : 0;
      else if (st === 'opbouw' && opb >= 0.5) { const n = opb < 0.75 ? 1 : opb < 0.9 ? 2 : 4; flits = frac(b.pos * n) < 0.2 ? 0.15 + 0.35 * opb : 0; }
    }
    const brk = st === 'break', opbSt = st === 'opbouw', dropSt = st === 'drop', en = 0.35 + 0.65 * b.energy;
    const zwart = getal(bus, 'blackout');  // bus: vloeit in ~1 s naar de break en weer terug
    return (b._k = {
      st, en, opbouw: opb, drop, flits, salvo,
      bus: bus && typeof bus.kleur === 'function' && (brk || dropSt) ? bus : null,
      dim: (zwart != null ? Math.max(0.1, 1 - 1.08 * zwart) : brk ? 0.14 : opbSt ? 0.35 + 0.65 * opb : 1) * (dropSt ? 1 + 0.25 * drop : 1),  // niveau van alles wat zelf licht geeft
      pak: (brk ? 0.05 : opbSt ? 0.45 + 0.8 * opb : dropSt ? 1.4 : 1) * en,             // looplicht
      basis: brk ? 0.012 : dropSt ? 0.04 : 0.028,                                        // licht op de schildering zonder show: bijna zwart
      per: opbSt ? (opb < 0.5 ? 1 : opb < 0.85 ? 2 : 4) : dropSt ? 2 : 1,               // lichtpakketten per tel
      tel: opbSt ? (opb < 0.5 ? 2 : 1) : dropSt ? 1 : 2,                                // tellen om door de gang te rennen
      kstap: dropSt ? Math.floor(b.pos) : opbSt ? Math.floor(b.pos / (opb < 0.5 ? 2 : 1)) : brk ? 0 : Math.floor(b.pos / 4),  // paletstap: per maat, drop per tel
      maat: Math.floor(b.pos / 4),
      richt: st === 'groove' && Math.floor(b.pos / 32) % 2 ? 1 : -1,  // looplicht: naar de camera toe (-1), in de groove om de 8 maten mee
      dropTel: dropSt && sinds >= 0 && sinds < 64 ? sinds : 0,  // extra fase tijdens de drop: begint op 0, na 16 tellen een veelvoud van de cyclus
      t: now % KLOK, b: b.pos % 64,
    });
  }

  // --- ledoppervlakken (ronde 3): muren, plafond en vloer zijn bewegende ledschermen op de gangcoördinaten van de kern ---
  // (attribuut aP = (s, d, y): s langs de gang, ook door de bochten, d zijwaarts, y hoogte). Eén programma voor alle muren en plafonds
  // (LEDW), één voor alle vloeren (LEDV): elke stijl alleen andere uniforms (bron, palet, inhoud), dus geen nieuwe shader per gang.
  // Inhoud per ledpixel (uPitch m) uit (s, y); de ledregie (JS, alleen uit tel/klok/stand + zaad: beide helften gelijk) kiest per 4 maten
  // wat erop staat: de muurschildering met effecten (scroll, zoom op de kick, kaleidoscoop, kleur naar het palet, pixelate, RGB-split,
  // negatief/glitch op de drop), balken die door de gang rennen, spectrum, golven, lopende tekst, plasma, blokken, chevrons.
  // Ledlook: rond puntje met zwarte voeg + scanlijn; van ver egaal (geen moiré); tv (MINI): zonder puntjes, één textuurlookup.
  const DRAAI = 'vec3 draai(vec3 c, float a) { const vec3 k = vec3(0.57735); float co = cos(a); return c * co + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - co); }\n';
  const LED_V = `attribute vec3 aP;
varying vec3 vP;
void main() { vP = aP; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  const LED_GEDEELD = `uniform sampler2D map;
uniform vec3 uA, uB, uC;
uniform float uT, uTel, uPakT, uPuls, uBas, uMid, uHoog, uE, uNiveau, uFlits, uTik, uLen, uh, uPer, uTelN, uRicht, uScroll, uTexW, uMapPx, uOrig, uGroot, uGain;
varying vec3 vP;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float pakX(float s) { return (uPakT - uRicht * uTelN * s / uLen) * uPer; }  // looplicht: elke 1/uPer tel een pakket, in uTelN tellen door de gang
vec3 duo(vec3 t) {  // schildering naar het palet van het moment (donker -> A -> B), uOrig = hoeveel van de eigen kleuren
  t = min(t * uGain, vec3(1.0));  // helderheid per schildering gelijk getrokken (led.js bronGain)
  float l = dot(t, vec3(0.3, 0.59, 0.11));
  vec3 c = mix(uC * 0.05, uA * 0.8, smoothstep(0.22, 0.55, l));
  c = mix(c, uB * 1.1, smoothstep(0.58, 0.92, l));
  return mix(c, smoothstep(0.04, 0.85, t) * 1.1, uOrig);  // eigen kleuren, iets meer contrast: het donker blijft zwart
}
`;
  const LEDW_F = `${LED_GEDEELD}
uniform sampler2D uTekst;
uniform vec3 uRingK[4];
uniform vec4 uRingS;
uniform float uLoop, uModus, uVlak, uSx, uPitch, uPix, uH, uKal, uRgb, uNeg, uGlitch, uZoom, uWarp, uBeeldI, uPakI, uRij, uWoordW, uSpec, uVar, uTikVorm, uTikFase;
vec3 beeld(vec2 q) {
  vec2 t;
  if (uKal > 0.5) {  // kaleidoscoop: gespiegelde blokken van een wandhoogte
    vec2 m = abs(fract(vec2(q.x + uScroll, q.y) / uH) * 2.0 - 1.0);
    t = vec2(0.3 + 0.08 * sin(uT * 0.13) + m.x * 0.5 * uH / (uTexW * uGroot), 0.5 + (m.y - 0.5) / uGroot);
  } else t = vec2((q.x + uScroll) / (uTexW * uGroot), 0.5 + (q.y / uH - 0.5) / uGroot);  // uGroot: ingezoomd (grove schilderingen)
  t.y = 0.5 + (t.y - 0.5) / (1.0 + uZoom);                                   // zoom op de kick
  t += uWarp * vec2(sin(q.y * 3.1 + uT * 1.1), sin(q.x * 2.3 - uT * 0.9));    // ademen
  float rij = floor(q.y / 0.2), tk = floor(uT * 15.0);                         // glitch: rijen leds schuiven opzij
  t.x += uGlitch * step(0.62, hash(vec2(rij, tk))) * (hash(vec2(rij * 1.7, tk + 3.0)) - 0.5) * 0.35;
  t = vec2(fract(t.x), clamp(t.y, 0.003, 0.997));
  float bias = log2(max(1.0, uMapPx * uPitch * uPix / (uTexW * uGroot)));                 // één led = het gemiddelde van zijn stukje schildering
#ifdef MINI
  vec3 im = texture2D(map, t, bias).rgb;
#else
  vec3 im = vec3(texture2D(map, vec2(fract(t.x + uRgb), t.y), bias).r, texture2D(map, t, bias).g, texture2D(map, vec2(fract(t.x - uRgb), t.y), bias).b);
  vec3 om = texture2D(map, t, bias + 3.0).rgb;                                  // omgeving: lokaal contrast, vlakke stukken vallen weg
  im = clamp((im - om) * 1.4 + om * 0.9, 0.0, 1.0);
#endif
  vec3 c = duo(im);
  return mix(c, (vec3(1.0) - c) * (uB + 0.25), uNeg);                          // negatief (drop)
}
vec3 balken(float s) {  // lichtbalken die door de gang rennen (muren + plafond samen: een lichttunnel)
  float x = pakX(s), f = fract(x);
  return (mod(floor(x), 2.0) < 0.5 ? uA : uB) * (exp(-f * 6.0) * 1.5 + 0.45 * smoothstep(0.88, 1.0, f));
}
vec3 spectrum(vec2 q) {  // ledstaven: bas/mid/hoog, per halve tel verspringend, kapje erop
  float ci = floor(q.x / 0.2), g = fract(q.x / 0.2), f = fract(ci * 0.618);
  float lv = f < 0.34 ? uBas : f < 0.67 ? uMid : uHoog;
  lv = lv * (0.5 + 0.7 * hash(vec2(ci, floor(uTel * 2.0)))) * (0.55 + 0.6 * uE) + 0.2 * uPuls;
  float y = uSpec > 0.5 ? abs(q.y - uH * 0.5) * 2.0 : q.y, top = clamp(lv, 0.06, 1.0) * uH;
  float aan = step(y, top) * step(g, 0.74), kap = step(top - 0.11, y);
  return mix(mix(uA, uB, y / uH), uC * 1.4 + 0.15, kap) * aan * 0.8;
}
vec3 golf(vec2 q) {  // drie oscilloscooplijnen op bas, mid en hoog
  vec3 c = vec3(0.0);
  float m = uH * 0.5;
  for (int i = 0; i < 3; i++) {
    float fi = float(i), band = i == 0 ? uBas : i == 1 ? uMid : uHoog;
    float a = (0.12 + 0.75 * band) * m * 0.9;
    float y = m + a * sin(q.x * (1.3 + 0.8 * fi) - uT * (2.4 + fi * 0.9) + fi * 2.1) * (0.65 + 0.35 * sin(q.x * 0.37 + uT * 0.6 + fi));
    c += (i == 0 ? uA : i == 1 ? uB : uC) * exp(-abs(q.y - y) / (0.035 + 0.04 * band));
  }
  return c * 1.3;
}
vec3 tekst(vec2 q, float dir) {  // lopende tekst (atlas: 5 woorden onder elkaar), leesbaar op beide muren, rent naar de camera
  float Ht = uH * 0.54, y0 = uH * 0.5 - Ht * 0.5, rowM = Ht * 16.0, wM = uWoordW * rowM, per = wM + 1.6;
  float lx = mod((q.x + uLoop * 1.6) * dir, per), v = (q.y - y0) / Ht, a = 0.0;
  if (lx < wM && v > 0.0 && v < 1.0) a = texture2D(uTekst, vec2(0.5 - 0.5 * uWoordW + lx / rowM, 1.0 - (uRij + 1.0 - v) / 5.0), log2(max(1.0, 2048.0 * uPitch * uPix / rowM))).r;
  return mix(uA, uB, 0.5 + 0.5 * sin(q.x * 0.9 - uT * 2.2)) * a * 1.1;
}
vec3 plasma(vec2 q) {
  float t = uT * 0.8;
  float v = sin(q.x * 1.1 + t) + sin(q.y * 2.3 - t * 1.3) + sin(q.x * 0.6 + q.y * 1.3 + t * 0.7) + sin(length(q - vec2(uLen * 0.5 + 3.0 * sin(t * 0.21), uH * 0.5)) * 2.4 - t * 1.9);
  float r = pow(0.5 + 0.5 * sin(v * 2.4 + uBas * 2.5), 7.0);
  return mix(uA, uB, 0.5 + 0.5 * sin(v * 1.3 + t * 0.5)) * r + uC * pow(r, 6.0) * 0.6;
}
vec3 blokken(vec2 q) {  // blokken van 0,4 m: dambord op de tel, of (drop/opbouw) willekeurige blokken op de strobe
  vec2 id = floor(q / 0.4);
  float tk = floor(uTel * uPer), h = hash(id + vec2(tk * 3.1, tk * 7.7));
  float aan = uVar > 0.5 ? step(0.68, h) : mod(id.x + id.y + tk, 2.0);
  return (h < 0.33 ? uA : h < 0.66 ? uB : uC) * aan * (0.25 + 0.75 * uPuls);
}
vec3 chevron(vec2 q) {  // pijlen die vooruit wijzen en de gang in schuiven
  float v = (q.x + abs(q.y - uH * 0.5) * 0.9 - uLoop * 2.0) / 0.8, f = fract(v);
  return (mod(floor(v), 2.0) < 0.5 ? uA : uB) * smoothstep(0.0, 0.06, f) * (1.0 - smoothstep(0.28, 0.36, f)) * (0.6 + 0.8 * uPuls);
}
void main() {
  float s = vP.x, d = vP.y, kop = 1.0 - step(uh - 0.03, abs(d));  // kop = de dichte kopwand (s vast, d loopt)
  vec2 p = uVlak > 0.5 ? vec2(s, d + uh) : vec2(s + kop * d * uSx, vP.z);
  float dir = uVlak > 0.5 || kop > 0.5 ? 1.0 : sign(d) * uSx;     // d+ = linkermuur: lezen langs +s
  float P = uPitch * uPix;
  vec2 q = (floor(p / P) + 0.5) * P;                                // inhoud per (gepixelde) led
  vec3 c;
  if (uModus < 0.5) c = beeld(q) * (uBeeldI + uPakI * exp(-fract(pakX(q.x)) * 5.0)) * 0.6;
  else if (uModus < 1.5) c = balken(q.x) + beeld(q) * 0.05;
  else if (uModus < 2.5) c = spectrum(q) * 0.35;
  else if (uModus < 3.5) c = golf(q) * 0.6 + beeld(q) * 0.04;
  else if (uModus < 4.5) c = tekst(q, dir) + beeld(q) * 0.08;
  else if (uModus < 5.5) c = plasma(q) * 0.45;
  else if (uModus < 6.5) c = blokken(q) * 1.3;
  else c = chevron(q) * 0.6;
  c *= uNiveau;
  vec4 r = exp(-abs(vec4(s) - uRingS) * 4.0);                       // licht van de ringen/poorten
  c += uRingK[0] * r.x + uRingK[1] * r.y + uRingK[2] * r.z + uRingK[3] * r.w;
  // de schermen flitsen op de tel: hele vlak, een golf die door de gang naar je toe rent, één muur, of een band van boven naar beneden
  float tv = 1.0;
  if (uTikVorm > 2.5) tv = exp(-abs(p.y - uH * (1.0 - uTikFase * 1.4)) * 3.0);
  else if (uTikVorm > 1.5) tv = uVlak > 0.5 ? 0.3 : step(0.0, d * (mod(floor(uTel), 2.0) - 0.5));
  else if (uTikVorm > 0.5) tv = exp(-abs(s - uLen * (1.0 - uTikFase * 1.6)) * 1.2) * 1.6;
  c += mix(uA, vec3(1.0), 0.4) * uTik * tv + vec3(uFlits);          // + stroboscoop
#ifndef MINI
  vec2 f = fract(p / uPitch) - 0.5;
  float w = max(fwidth(p.x), fwidth(p.y)) / uPitch;
  c *= mix((1.0 - smoothstep(0.3, 0.48, length(f))) * 1.3, 0.62, smoothstep(0.3, 0.75, w));
  c *= 0.9 + 0.22 * pow(0.5 + 0.5 * sin((p.y / 2.6 - uT * 0.45) * 6.2832), 24.0);  // scanlijn
#else
  c *= 0.62;  // zonder puntjes (en zonder bloom) is het vlak anders veel feller dan in hoog
#endif
  gl_FragColor = vec4(c, 1.0);
}`;
  // vloer: ledtegels (uTegel m, voeg ertussen) met patronen per tel zoals de vloer van zaal 1, of fijne leds met de schildering (video)
  const LEDV_F = `${LED_GEDEELD}
uniform float uPat, uTegel;
void main() {
  float s = vP.x, d = vP.y;
  vec2 g = vec2(s, d + uh) / uTegel, id = floor(g), f = fract(g);
  float jc = floor(2.0 * uh / uTegel + 0.5) * 0.5 - 0.5, ic = floor(uLen / uTegel * 0.5), tel = floor(uTel), k = 0.0;
  vec3 kl = uA;
  if (uPat < 0.5) { k = mod(id.x + id.y + tel, 2.0); kl = mod(floor(id.x * 0.5) + tel, 2.0) < 1.0 ? uA : uB; }                   // dambord
  else if (uPat < 1.5) { float x = (uPakT - uRicht * uTelN * (id.x + 0.5) * uTegel / uLen) * uPer; k = exp(-fract(x) * 2.5) * 1.15; kl = mod(floor(x), 2.0) < 0.5 ? uA : uB; }  // looplicht
  else if (uPat < 2.5) { float r = abs(id.x - ic) + abs(id.y - jc); k = step(mod(r - tel, 3.0), 0.99); kl = mod(floor(r / 3.0), 2.0) < 1.0 ? uA : uB; }  // ringen uit het midden
  else if (uPat < 3.5) { float v = id.x - abs(id.y - jc) - tel; k = step(mod(v, 4.0), 0.99); kl = mod(floor(v / 4.0), 2.0) < 1.0 ? uA : uB; }       // chevron vooruit
  else if (uPat < 4.5) { float yw = jc + (jc + 0.5) * sin(id.x * 0.5 - uT * 2.5) * (0.35 + 0.65 * uBas); k = step(abs(id.y - yw), 0.6); kl = mix(uA, uB, 0.5 + 0.5 * sin(id.x * 0.4 + uT)); }  // golf
  else if (uPat < 5.5) { float h = hash(id + vec2(floor(uTel * uPer) * 3.7, 1.3)); k = step(0.64, h); kl = h > 0.88 ? uB : h > 0.76 ? uC : uA; }  // fonkelen
  else if (uPat < 6.5) { float a = abs(id.y - jc), band = a < 0.6 ? uBas : a < 1.6 ? uMid : uHoog; k = step(abs(id.x - ic), clamp(band * (0.6 + 0.6 * uE) + 0.2 * uPuls, 0.0, 1.0) * (ic + 1.0)); kl = mix(uA, uB, abs(id.x - ic) / (ic + 1.0)); }  // spectrum
  else if (uPat < 7.5) { k = max(step(mod(id.x + tel, 4.0), 0.99), step(jc, abs(id.y - jc)) * 0.45); kl = mod(floor((id.x + tel) / 4.0), 2.0) < 1.0 ? uA : uB; }  // raster (synthwave)
  else {  // video: fijne leds (6,25 cm) met de schildering die naar je toe stroomt
    vec2 q = (floor(vec2(s, d + uh) / 0.0625) + 0.5) * 0.0625;
    kl = duo(texture2D(map, vec2(fract((q.x + uScroll) / uTexW), clamp(q.y / (2.0 * uh), 0.0, 1.0)), log2(max(1.0, uMapPx * 0.0625 / uTexW))).rgb);
    k = 0.55 + 0.6 * exp(-fract(pakX(s)) * 4.0);
#ifndef MINI
    vec2 fl = fract(vec2(s, d + uh) / 0.0625) - 0.5;
    k *= mix((1.0 - smoothstep(0.3, 0.48, length(fl))) * 1.3, 0.62, smoothstep(0.3, 0.75, max(fwidth(s), fwidth(d)) / 0.0625));
#endif
  }
  float I = k > 0.01 ? k * (0.22 + 0.65 * uPuls * (0.4 + 0.6 * uE)) : 0.02;
  vec2 e = min(f, 1.0 - f);
  vec3 c = kl * I * (0.8 + 0.3 * (1.0 - length(f - 0.5) * 1.6)) * uNiveau + mix(uA, vec3(1.0), 0.4) * uTik * 0.5 + vec3(uFlits);
  gl_FragColor = vec4(c * smoothstep(0.012, 0.045, min(e.x, e.y)), 1.0);
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
  // bundel (bewegende kop): open kegel van lengte 1 langs -y, uniform geschaald = vaste bundelhoek; fel bij de lens, zacht naar de rand en
  // naar het eind (nep-volumetrisch, additief), dicht bij de camera weg (anders vult hij het beeld als je erdoor loopt)
  const BUNDEL_V = `uniform float uBreed;
varying vec3 vN; varying vec3 vV; varying vec3 vC; varying float vL; varying float vU; varying float vWeg;
void main() {
  vec4 p = vec4(position, 1.0); vec3 n = normal;
  mat4 m = modelMatrix;
#ifdef USE_INSTANCING
  m = modelMatrix * instanceMatrix; n = mat3(instanceMatrix) * n;
#endif
#ifdef USE_INSTANCING_COLOR
  vC = instanceColor;
#else
  vC = vec3(1.0);
#endif
  vL = -position.y; vU = uv.x;
  vec4 w = m * p;
  vN = mat3(modelMatrix) * n; vV = cameraPosition - w.xyz;
  // staat de camera in (of vlak naast) deze bundel: hele bundel weg, anders vult hij het beeld
  vec3 kop = (m * vec4(0.0, 0.0, 0.0, 1.0)).xyz, ax = mat3(m) * vec3(0.0, -1.0, 0.0);
  float len = length(ax); ax /= len;
  float t = clamp(dot(cameraPosition - kop, ax), 0.0, len), r = t * uBreed + 0.03;
  vWeg = smoothstep(r + 0.12, r + 0.8, length(cameraPosition - kop - ax * t));
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
  const BUNDEL_F = `uniform float uT;
varying vec3 vN; varying vec3 vV; varying vec3 vC; varying float vL; varying float vU; varying float vWeg;
void main() {
  float f = abs(dot(normalize(vN), normalize(vV)));
  float stof = 0.74 + 0.26 * sin(vU * 56.5 + uT * 0.6) * sin(vL * 7.0 - uT * 1.3 + vU * 12.6);  // nevel in de bundel
  float a = f * f * pow(1.0 - vL, 1.3) * (0.45 + 1.8 * exp(-vL * 16.0)) * stof * smoothstep(0.3, 1.2, length(vV)) * vWeg;
  gl_FragColor = vec4(vC * a, 1.0);
}`;
  const U = v => ({ value: v });
  // inhoud van muren/plafond (M) en patronen van de vloer (V); de nummers staan zo in de shaders
  const M = { BEELD: 0, BALKEN: 1, SPECTRUM: 2, GOLF: 3, TEKST: 4, PLASMA: 5, BLOKKEN: 6, CHEVRON: 7 };
  const V = { DAMBORD: 0, LOOP: 1, RINGEN: 2, CHEVRON: 3, GOLF: 4, FONKEL: 5, SPECTRUM: 6, RASTER: 7, BEELD: 8 };
  // tekstatlas: vijf woorden onder elkaar (rij 128 px), woordB = breedte van het woord als deel van de rij
  const WOORDEN = ['DEEP STEPPER', 'SAMSONIGHT', 'BLOODLINE', 'DEEPER', '∞'], woordB = [];
  const tekstTex = houd(canvasTexture(2048, 640, (c, w) => {
    c.fillStyle = '#000'; c.fillRect(0, 0, w, 640); c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    WOORDEN.forEach((t, i) => {
      const px = t.length <= 2 ? 150 : 112;
      c.font = `900 ${px}px Impact, "Arial Black", sans-serif`;
      c.fillText(t, w / 2, i * 128 + 66);
      woordB.push(Math.min(1, (c.measureText(t).width + 30) / w));
    });
  }));
  // graffiti van zaal 1 (tex/graffiti-1.jpg, geladen in index.html) als bron voor de acid-gang; zolang hij laadt de oude betonwand
  function graffiti() {
    const m = typeof room !== 'undefined' && room && Array.isArray(room.material) ? room.material[0] : null, t = m && m.map;
    if (!t || !t.image || !(t.image.width > 1500)) return wallTex;
    t.userData = t.userData || {}; t.userData.doolhofHouden = true;  // hoort bij zaal 1: nooit weggooien
    return t;
  }
  // gedeelde uniforms van muur, plafond en vloer
  const ledU = (cfg, maat) => ({
    map: U(cfg.bron || WIT), uA: U(new THREE.Color(1, 0.1, 0.4)), uB: U(new THREE.Color(0.1, 0.7, 1)), uC: U(new THREE.Color(0.5, 0.1, 1)),
    uT: U(0), uTel: U(0), uPakT: U(0), uPuls: U(0), uBas: U(0), uMid: U(0), uHoog: U(0), uE: U(0), uNiveau: U(1), uFlits: U(0), uTik: U(0),
    uLen: U(maat.LEN), uh: U(maat.h), uPer: U(1), uTelN: U(2), uRicht: U(1), uScroll: U(0), uTexW: U(cfg.texW), uMapPx: U(cfg.px), uOrig: U(0.5), uGroot: U(cfg.groot),
    uGain: U(doolhof.led && doolhof.led.bronGain ? doolhof.led.bronGain(cfg.bron) : 1) });
  function ledMuur(cfg, maat, zwaar, plafond) {
    const m = new THREE.ShaderMaterial({ vertexShader: LED_V, fragmentShader: LEDW_F, defines: zwaar >= 2 ? { MINI: 1 } : {}, uniforms: Object.assign(ledU(cfg, maat), {
      uTekst: U(tekstTex), uRingK: U([0, 1, 2, 3].map(() => new THREE.Vector3())), uRingS: U(new THREE.Vector4(-99, -99, -99, -99)),
      uModus: U(0), uVlak: U(plafond ? 1 : 0), uSx: U(maat.sx < 0 ? -1 : 1), uPitch: U(cfg.pitch), uPix: U(1), uH: U(plafond ? maat.B : maat.H),
      uKal: U(0), uRgb: U(0), uNeg: U(0), uGlitch: U(0), uZoom: U(0), uWarp: U(0), uBeeldI: U(0.4), uPakI: U(0.8),
      uRij: U(0), uWoordW: U(0.3), uSpec: U(plafond ? 1 : cfg.spec), uVar: U(0), uTikVorm: U(0), uTikFase: U(0), uLoop: U(0) }) });
    m.extensions.derivatives = true;
    m.userData.led = plafond ? 'plafond' : 'muur';
    return m;
  }
  function ledVloer(cfg, maat, zwaar) {
    const m = new THREE.ShaderMaterial({ vertexShader: LED_V, fragmentShader: LEDV_F, defines: zwaar >= 2 ? { MINI: 1 } : {},
      uniforms: Object.assign(ledU(cfg, maat), { uPat: U(0), uTegel: U(cfg.tegel) }) });
    m.extensions.derivatives = true;
    m.userData.led = 'vloer';
    return m;
  }
  // de ledset van een stijl: c = { bron, modi (muur), plafond, vloer, rust (inhoud in de break), pitch, tegel, orig, kal, rgb, glitch, warp,
  // spec, woorden }. Het zaad komt uit rnd (vóór de deel-fabriekjes: zelfde reeks in beide helften); beide helften delen de materialen.
  function ledSet(maat, rnd, zwaar, c) {
    const z = Math.floor(rnd() * 1e4);
    const LC = maat.deel('led', () => {
      const t = c.bron, im = t && t.image, cfg = Object.assign({ pitch: 0.05, tegel: 0.5, orig: 0.4, kal: 0, rgb: 1, glitch: 0.4, warp: 0, spec: 0, groot: 1.4,
        rust: M.BEELD, modi: [M.BEELD, M.BALKEN], plafond: [M.BALKEN, M.PLASMA], vloer: [V.DAMBORD, V.LOOP], woorden: [0, 1, 2, 3] }, c, { z, L: {} });
      const asp = im && im.width > 1 ? im.width / im.height : (c.aspect || 2.357);
      cfg.texW = maat.H * asp; cfg.px = im && im.width > 1 ? im.width : (c.px || 2048);
      return cfg;
    });
    return { LC, muur: maat.deel('muur', () => ledMuur(LC, maat, zwaar, false)), plafond: maat.deel('plafond', () => ledMuur(LC, maat, zwaar, true)),
      vloer: maat.deel('vloer', () => ledVloer(LC, maat, zwaar)) };
  }
  // ledregie van één beeld: welke inhoud, hoe snel, welke effecten. Zuiver uit tel (b.pos), klok, stand en zaad: beide helften gelijk.
  // Groove: inhoud wisselt per 4 maten (vloer per 2), op elke tel een tik, elke maat een flits, om de 8 maten een grote; break: donker
  // en traag (schildering met één langzame lichtband, of plasma); opbouw: balken versnellen, op het eind strobe-blokken; drop: inhoud
  // per maat, kleur per tel, negatief/pixelate/glitch op de tel; tijdens het salvo witte strobe.
  const lijstKies = (lijst, blok, pos, z) => lijst[(((Math.floor(pos / blok) + z) % lijst.length) + lijst.length) % lijst.length];
  function ledRegie(cfg, b, k) {
    const L = cfg.L, pos = b.pos, bi = Math.floor(pos), fase = pos - bi, tel4 = ((bi % 4) + 4) % 4, maatNr = Math.floor(pos / 4), z = cfg.z, st = k.st;
    if (L.pos === pos && L.st === st && L.fl === k.flits) return L;  // tweede helft van hetzelfde beeld
    L.pos = pos; L.st = st; L.fl = k.flits;
    let m, pl, vl, rate;
    if (st === 'break') { m = cfg.rust; pl = M.PLASMA; vl = V.GOLF; rate = 0.18; }  // vloer: trage golf (fonkelen per 4 tellen stond stil)
    else if (st === 'opbouw') { m = k.opbouw < 0.75 ? M.BALKEN : M.BLOKKEN; pl = M.BALKEN; vl = k.opbouw < 0.85 ? V.LOOP : V.FONKEL; rate = 0.25 * k.per; }
    else if (st === 'drop') { m = lijstKies(cfg.modi, 4, pos, z); pl = lijstKies(cfg.plafond, 4, pos, z + 1); vl = lijstKies(cfg.vloer, 4, pos, z); rate = 0.7; }
    else { m = lijstKies(cfg.modi, 16, pos, z); pl = lijstKies(cfg.plafond, 16, pos, z + 1); vl = lijstKies(cfg.vloer, 8, pos, z); rate = 0.3; }
    if (m === M.BALKEN || m === M.PLASMA || m === M.BLOKKEN || m === M.CHEVRON) pl = m;  // plafond loopt mee: een lichttunnel
    L.muur = m; L.plafond = pl === M.TEKST ? M.BALKEN : pl; L.vloer = vl;
    // beat-snit: in de drop elke tel, in de groove de tweede helft van elke 4 maten springt het beeld op de tel naar een ander stuk
    const snit = st === 'drop' || (st === 'groove' && maatNr % 4 >= 2) ? hash(bi * 0.137 + z) * 40 : 0;
    L.scroll = (pos * rate + snit) % 1000; L.loop = (pos * rate) % 1000;  // loop = zonder snit (tekst, chevrons)
    // looplicht (balken, lichtband over de schildering, vloer): break één trage band per 4 tellen
    if (st === 'break') { L.per = 0.25; L.telN = 8; } else { L.per = k.per; L.telN = k.tel; }
    L.richt = k.richt; L.tel = pos % 192;
    L.niveau = st === 'break' ? 0.8 : 0.2 + 0.8 * Math.min(1.25, k.dim);  // break: gedimd maar zichtbaar (de showregie gaat juist in de break het doolhof in)
    L.beeldI = st === 'break' ? 0.3 : st === 'drop' ? 0.25 + 0.25 * b.pulse : st === 'opbouw' ? 0.2 + 0.15 * k.opbouw : 0.32 + 0.3 * b.pulse * k.en;
    L.pakI = st === 'break' ? 1.2 : st === 'drop' ? 0.7 : st === 'opbouw' ? 1.0 : 0.8;
    const om = ((Math.floor(pos / 16) + z) % 2 + 2) % 2;  // per 4 maten: eigen kleuren van de schildering of het palet
    L.orig = st === 'break' ? 0.7 : st === 'drop' ? 0.1 : st === 'opbouw' ? cfg.orig * 0.5 : om ? Math.min(0.85, cfg.orig + 0.3) : cfg.orig;
    L.kal = (cfg.kal && ((Math.floor(pos / 32) + z) % 2 + 2) % 2 === 0) || (st === 'drop' && maatNr % 2 === 1) ? 1 : 0;
    L.pix = st === 'drop' && tel4 === 0 ? (fase < 0.2 ? 6 : fase < 0.45 ? 3 : 1) : st === 'groove' && maatNr % 4 === 3 && tel4 >= 2 ? 2 : st === 'opbouw' && k.opbouw > 0.85 ? 2 : 1;
    L.rgb = cfg.rgb * (st === 'drop' ? 0.02 * b.pulse : st === 'opbouw' ? 0.012 * k.opbouw * k.opbouw : 0.008 * b.pulse * b.hoog);  // (vast een beetje = kleurruis per led)
    L.neg = st === 'drop' ? (tel4 % 2 === 0 && fase < 0.1 ? 1 : 0) : st === 'groove' && maatNr % 8 === 7 && tel4 === 3 && fase < 0.12 ? 1 : 0;
    L.glitch = cfg.glitch * (st === 'drop' ? 0.5 + 0.5 * b.pulse : st === 'opbouw' ? 0.6 * k.opbouw * k.opbouw : 0.08 * b.hoog);
    L.zoom = (0.05 + (st === 'drop' ? 0.12 : 0)) * b.pulse * k.en;
    L.warp = cfg.warp * (1 + 2 * b.bas);
    L.rij = lijstKies(cfg.woorden, 8, pos, z);
    L.var = st === 'drop' || st === 'opbouw' ? 1 : 0;
    // de schermen flitsen: groove een tik per tel, een flits per maat, om de 8 maten (en op een vaste loting) een grote; drop elke tel
    if (st === 'groove') L.tik = ((tel4 === 0 ? 0.28 : 0.07) * Math.exp(-fase * 7) + (tel4 === 0 && (maatNr % 8 === 0 || hash(maatNr * 0.71 + z) > 0.82) ? 0.55 * Math.exp(-fase * 4) : 0)) * k.en;
    else if (st === 'opbouw') L.tik = 0.18 * Math.exp(-frac(pos * k.per) * 6) * k.opbouw;
    else if (st === 'drop') L.tik = (k.salvo ? 0 : 0.35) * Math.exp(-fase * 6);
    else L.tik = 0;
    L.tikVorm = st === 'drop' ? tel4 : st === 'groove' && tel4 === 0 ? Math.floor(hash(maatNr * 1.31 + z) * 4) : 0;
    L.tikFase = fase;
    L.flits = k.flits * 0.6;
    if (doolhof.gangLedForceer) Object.assign(L, doolhof.gangLedForceer);  // test: { muur, plafond, vloer, ... } vast zetten
    return L;
  }
  function glansMat(kleur, iris) {
    return new THREE.ShaderMaterial({ vertexShader: GLANS_V, fragmentShader: GLANS_F, uniforms: { uKleur: U(kl(kleur)), uIris: U(iris || 0), uT: U(0), uPuls: U(0) } });
  }
  const bundelMat = () => new THREE.ShaderMaterial({ vertexShader: BUNDEL_V, fragmentShader: BUNDEL_F, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uT: U(0), uBreed: U(0.16) } });

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

  // looplicht (zoals de acid-gang): elke 1/k.per tel vertrekt bij de begindeur een lichtpakket dat in k.tel tellen naar de einddeur rent,
  // om en om in de twee kleuren van het moment (zelfde formule als pakLicht in de shaders, ook op k.b: dan lopen leds en muurlicht gelijk)
  function pakket(c, s, maat, b, k, SH, basis) {
    const x = (k.b - k.richt * k.tel * s / maat.LEN) * k.per, n = Math.floor(x), h = Math.exp(-(x - n) * 7) * k.pak * (0.75 + 0.5 * b.pulse) * 1.6;
    c.copy(n % 2 ? SH.B : SH.A).multiplyScalar(h);
    const bs = k.basis * 4 * (basis == null ? 1 : basis);
    c.r += SH.A.r * bs + k.flits; c.g += SH.A.g * bs + k.flits; c.b += SH.A.b * bs + k.flits;
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
  // dwarsringen: twee staanders en een ligger (o.dik/o.diep/o.rand voor poorten); hun licht op muren/vloer zit in het lichtmasker
  // (show().mat met deze ringen), de oude gloedstroken alleen nog met o.halo
  const haloMat = maat => maat.deel('haloMat', () => plus(haloTex, THREE.DoubleSide));
  function ringen(g, maat, lijst, o) {
    o = o || {};
    const n = lijst.length, dik = o.dik || 0.035, diep = o.diep || 0.05, rand = o.rand || dik / 2 + 0.005;
    const buis = inst(g, maat, BOX, o.mat || maat.deel('ringMat', () => plus()), n * 3);
    const halo = o.halo === true && maat.zwaar < 2 ? inst(g, maat, VLAK, haloMat(maat), n * 3) : null, kl = lijst.map(() => new THREE.Color());
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
    return { lijst, kl, kleur(fn, haloK) {
      lijst.forEach((s, r) => {
        const c = fn(r, s, ca.setRGB(0, 0, 0));
        kl[r].copy(c);
        for (let j = 0; j < 3; j++) buis.setColorAt(r * 3 + j, c);
        if (halo) { cb.copy(c).multiplyScalar(haloK == null ? 0.5 : haloK); for (let j = 0; j < 3; j++) halo.setColorAt(r * 3 + j, cb); }
      });
      buis.instanceColor.needsUpdate = true; if (halo) halo.instanceColor.needsUpdate = true;
    } };
  }

  // --- de lichtshow van een gang (zie bovenaan) ---
  // koppen: paren aan het plafond in de twee bochten en midden in het dwarsstuk (daar kijkt de camera naartoe, tegen een donkere muur);
  // zwaar 2 (tv): één kop per plek. Waaiers: vanaf de muur aan het eind van been 1 (kijk[0]) en van het dwarsstuk (kijk[1]) terug de gang in.
  // o.pal = 3 kleuren (hoofd, tweede, diep/break); o.lasers = false: geen waaiers. Geen rnd: de toevalsreeks van de stijl blijft gelijk.
  const KEGEL = houd(new THREE.CylinderGeometry(0.012, 0.16, 1, 20, 1, true).translate(0, -0.5, 0));
  const OMLAAG = new THREE.Vector3(0, -1, 0), vr = new THREE.Vector3(), vl = new THREE.Vector3(), vf = new THREE.Vector3(), PLAT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  function uitgang(x, y, z, dx, dy, dz, d, H) {  // afstand tot de rand van een rechthoekig gangstuk d = [x0, x1, z0, z1] (vloer 0, plafond H)
    let t = 20;
    if (dx > 1e-5) t = Math.min(t, (d[1] - x) / dx); else if (dx < -1e-5) t = Math.min(t, (d[0] - x) / dx);
    if (dz > 1e-5) t = Math.min(t, (d[3] - z) / dz); else if (dz < -1e-5) t = Math.min(t, (d[2] - z) / dz);
    if (dy > 1e-5) t = Math.min(t, (H - y) / dy); else if (dy < -1e-5) t = Math.min(t, -y / dy);
    return Math.max(0.05, t);
  }
  function show(g, maat, zwaar, o) {
    o = o || {};
    const pal = (o.pal || [0xff2060, 0x20c0ff, 0x8040ff]).map(c => new THREE.Color(c)), NP = pal.length, h = maat.h, H = maat.H, H0 = H - 0.04;
    const kleur = (i, k, uit) => (k.bus ? k.bus.kleur(i, uit) : uit.copy(pal[(((k.kstap + i) % NP) + NP) % NP]));
    const kop = [];
    [maat.L1, maat.L1 + maat.L2 / 2, maat.L1 + maat.L2].forEach((s, p) => {
      for (const d of zwaar >= 2 ? [0] : [-0.55, 0.55]) { const q = maat.xz(s, d); kop.push({ x: q.x, z: q.z, fx: q.dx, fz: q.dz, kant: Math.sign(d), p, j: d > 0 ? 1 : 0 }); }
    });
    const bm = inst(g, maat, KEGEL, maat.deel('bundelMat', bundelMat), kop.length);
    const pm = inst(g, maat, VLAK, maat.deel('plekMat', () => plus(rondTex, THREE.DoubleSide)), kop.length);
    const nl = o.lasers === false ? 0 : [7, 5, 3][zwaar];
    const fans = nl ? [
      { x: 0, z: maat.L1 + h - 0.06, bx: 0, bz: -1, lx: 1, lz: 0, doos: [-h, h, 0, maat.L1 + h], open: (x, z) => z < 0.02 },  // begin: deur of kop
      { x: maat.L2 + h - 0.06, z: maat.L1, bx: -1, bz: 0, lx: 0, lz: -1, doos: [-h, maat.L2 + h, maat.L1 - h, maat.L1 + h],
        open: (x, z) => (z < maat.L1 - h + 0.02 && x < h) || (z > maat.L1 + h - 0.02 && x > maat.L2 - h) },  // de openingen naar been 1 en been 3
    ] : [];
    const lm = nl ? inst(g, maat, BOX, maat.deel('waaierMat', () => plus()), nl * 2) : null;
    const sm = nl && zwaar < 2 ? inst(g, maat, VLAK, maat.deel('waaierStip', () => plus(rondTex, THREE.DoubleSide)), nl * 2) : null;
    const c = new THREE.Color(), WITc = new THREE.Color(1, 1, 1), geenRing = { lijst: [], kl: [] };
    const SH = {
      pal, kleur, A: new THREE.Color(), B: new THREE.Color(), C: new THREE.Color(),
      // ringflits: groove = loopt per tel van ver naar dichtbij, drop = alles op elke tel (kleur per tel), opbouw = steeds sneller, break = uit
      ring(c2, r, n, b, k) {
        const pos = k.b, st = k.st, terug = n - 1 - r;
        let I;
        if (st === 'break') I = 0.03;
        else if (st === 'drop') I = 0.15 + 1.7 * Math.exp(-frac(pos) * 6);
        else if (st === 'opbouw') I = (0.08 + 1.3 * Math.exp(-frac(pos * k.per - terug * 0.25) * 5)) * (0.3 + 0.7 * k.opbouw);
        else I = (0.1 + 1.35 * Math.exp(-frac(pos - terug * 0.25) * 5)) * k.en;
        if (k.salvo) return c2.copy(WITc).multiplyScalar(1.0 * k.flits);
        return kleur(st === 'drop' ? r : r % 2, k, c2).multiplyScalar(I).addScalar(k.flits * 0.5);
      },
      // koppen, plekken en waaiers van dit beeld
      zet(b, now, k) {
        const st = k.st, pos = k.b, fl = Math.exp(-frac(pos) * 3.5);
        kleur(0, k, SH.A); kleur(1, k, SH.B); kleur(2, k, SH.C);
        bm.material.uniforms.uT.value = k.t;
        kop.forEach((q, i) => {
          let lat, fwd, I;
          if (st === 'break') {  // één langzame bundel per plek (de rechter van elk paar), diep van kleur
            lat = 0.42 * Math.sin(now * 0.29 + q.p * 2.1); fwd = 0.5 * Math.sin(now * 0.17 + q.p * 1.3);
            I = q.j === 0 || zwaar >= 2 ? 0.75 : 0; if (k.bus) kleur(0, k, c); else c.copy(pal[2 % NP]);
          } else if (st === 'opbouw') {  // naar het midden, steeds sneller heen en weer; de plekken lichten om de beurt op
            lat = -q.kant * 0.45 * (1 - 0.6 * k.opbouw) * Math.sin(TAU * pos * k.per / 8 + q.p * 0.8); fwd = 0.3 * Math.sin(TAU * pos * k.per / 16 + q.p);
            I = (Math.floor(pos * k.per) % 3 === q.p ? 1.3 : 0.12) * (0.4 + 0.6 * k.opbouw); kleur(q.p, k, c);
          } else if (st === 'drop') {  // alles vol, snel kruisen, kleur per tel
            lat = -q.kant * 0.5 * Math.sin(TAU * pos / 2 + q.p * 0.9); fwd = 0.45 * Math.sin(TAU * pos / 4 + q.p * 1.7);
            I = 1.3 * (0.55 + 0.45 * fl); kleur(q.j + q.p, k, c);
          } else {  // groove: om de tel een andere plek fel, X-zwaai per twee maten
            lat = -q.kant * 0.48 * Math.sin(TAU * pos / 8 + q.p * 0.7); fwd = 0.32 * Math.sin(TAU * pos / 16 + q.p * 1.9);
            I = ((Math.floor(pos) + q.p) % 2 === 0 ? 0.35 + 1.0 * Math.max(fl, b.pulse) : 0.28) * k.en; kleur(q.p, k, c);
          }
          if (q.kant && Math.sign(lat) === q.kant) lat *= 0.55;  // naar de eigen muur: minder ver
          if (k.salvo) { c.copy(WITc); I = 0.9 * k.flits; }
          vf.set(q.fx, 0, q.fz); vl.set(q.fz, 0, -q.fx);
          vr.copy(OMLAAG).addScaledVector(vl, Math.tan(lat)).addScaledVector(vf, Math.tan(fwd)).normalize();
          const len = Math.min(4, H0 / -vr.y), r = len * 0.16 * 2.6;
          qa.setFromUnitVectors(OMLAAG, vr);
          mtx.compose(vp.set(q.x, H0, q.z), qa, vs.set(len, len, len)); bm.setMatrixAt(i, mtx);
          bm.setColorAt(i, ca.copy(c).multiplyScalar(I).addScalar(k.salvo ? 0 : k.flits * 0.3));
          mtx.compose(vp.set(q.x + vr.x * len, 0.014, q.z + vr.z * len), PLAT, vs.set(r, r, 1)); pm.setMatrixAt(i, mtx);
          pm.setColorAt(i, ca.multiplyScalar(0.55));
        });
        bm.instanceMatrix.needsUpdate = pm.instanceMatrix.needsUpdate = true; bm.instanceColor.needsUpdate = pm.instanceColor.needsUpdate = true;
        if (!nl) return;
        // waaiers: groove twee van de vier maten, opbouw vanaf de helft op de achtsten, drop altijd (kleur per straal per tel); uit tijdens het salvo
        const aan = k.salvo ? 0 : st === 'drop' ? 1 : st === 'groove' ? (k.maat % 4 >= 2 ? 1 : 0) : st === 'opbouw' && k.opbouw >= 0.5 ? (frac(pos * 2) < 0.5 ? 1 : 0.15) : 0;
        const snel = st === 'drop' ? 2 : 1, open = st === 'drop' ? 0.6 : 0.3 + 0.14 * Math.sin(TAU * pos / 8);
        fans.forEach((f, w) => {
          for (let j = 0; j < nl; j++) {
            const i = w * nl + j, I = aan * (0.9 + 0.5 * b.pulse) * k.en * 1.5;
            const a = (j / (nl - 1) - 0.5) * 2 * open + 0.22 * Math.sin(TAU * pos * snel / 16 + w * 1.3);
            const e = -0.04 - 0.15 * (0.5 + 0.5 * Math.sin(TAU * pos * snel / 8 + j * 0.5 + w)), ce = Math.cos(e);
            const dx = (f.bx * Math.cos(a) + f.lx * Math.sin(a)) * ce, dz = (f.bz * Math.cos(a) + f.lz * Math.sin(a)) * ce, dy = Math.sin(e);
            const y0 = H - 0.22, t = uitgang(f.x, y0, f.z, dx, dy, dz, f.doos, H), dik = I > 0 ? 0.013 : 0;
            vr.set(dx, dy, dz); qa.setFromUnitVectors(AZ, vr);
            mtx.compose(vp.set(f.x + dx * t / 2, y0 + dy * t / 2, f.z + dz * t / 2), qa, vs.set(dik, dik, t)); lm.setMatrixAt(i, mtx);
            kleur(w + (st === 'drop' ? j : 0), k, c); lm.setColorAt(i, ca.copy(c).multiplyScalar(I));
            if (sm) {  // stip waar de straal iets raakt (niet in een opening: daar hangt hij in de lucht)
              const st2 = I > 0 && !f.open(f.x + dx * t, f.z + dz * t) ? 0.13 : 0;
              mtx.compose(vp.set(f.x + dx * (t - 0.02), y0 + dy * (t - 0.02), f.z + dz * (t - 0.02)), qa, vs.set(st2, st2, 1)); sm.setMatrixAt(i, mtx); sm.setColorAt(i, ca.multiplyScalar(0.7));
            }
          }
        });
        lm.instanceMatrix.needsUpdate = lm.instanceColor.needsUpdate = true;
        if (sm) sm.instanceMatrix.needsUpdate = sm.instanceColor.needsUpdate = true;
      },
      // ledschermen van muur/vloer/plafond (o.led = de ledset van de stijl); R = ringen (lijst + kl) waarvan het licht op de wanden valt
      mat(mats, b, k, R) {
        R = R || geenRing;
        const L = ledRegie(o.led, b, k);
        for (const m of mats) {
          const u = m.uniforms, w = m.userData.led;
          if (!w) continue;
          u.uA.value.copy(SH.A); u.uB.value.copy(SH.B); u.uC.value.copy(SH.C);
          u.uT.value = k.t; u.uTel.value = L.tel; u.uPakT.value = k.b; u.uPuls.value = b.pulse; u.uBas.value = b.bas; u.uMid.value = b.mid; u.uHoog.value = b.hoog; u.uE.value = b.energy;
          u.uNiveau.value = L.niveau; u.uFlits.value = L.flits * (w === 'vloer' ? 0.6 : 1); u.uTik.value = L.tik;
          u.uPer.value = L.per; u.uTelN.value = L.telN; u.uRicht.value = L.richt; u.uScroll.value = L.scroll; u.uOrig.value = L.orig;
          if (w === 'vloer') { u.uPat.value = L.vloer; continue; }
          u.uModus.value = w === 'plafond' ? L.plafond : L.muur;
          u.uPix.value = L.pix; u.uKal.value = L.kal; u.uRgb.value = L.rgb; u.uNeg.value = L.neg; u.uGlitch.value = L.glitch; u.uZoom.value = L.zoom; u.uWarp.value = L.warp;
          u.uBeeldI.value = L.beeldI * (w === 'plafond' ? 0.55 : 1); u.uPakI.value = L.pakI; u.uRij.value = L.rij; u.uWoordW.value = woordB[L.rij] || 0.3; u.uVar.value = L.var; u.uTikVorm.value = L.tikVorm; u.uTikFase.value = L.tikFase; u.uLoop.value = L.loop;
          const rs = u.uRingS.value, rk = u.uRingK.value;
          for (let i = 0; i < 4; i++) {
            const s = R.lijst[i], q = R.kl[i];
            rs.setComponent(i, s == null ? -99 : s);
            if (q) rk[i].set(q.r, q.g, q.b).multiplyScalar(0.3); else rk[i].set(0, 0, 0);
          }
        }
      },
      // gedimd neon (borden, buizen): in de break op een kwart, op de drop een tik feller
      neon: k => 0.22 + 0.78 * Math.min(1.15, k.dim),
    };
    return SH;
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
  // Elke update: stemming -> SH.zet (koppen, waaiers) -> ringen -> SH.mat (lichtmasker) -> eigen spul. Tint van de muur = hoe fel de schildering
  // is als er vol licht op valt; zonder show blijft hij donker (k.basis). Neon (borden, buizen) dimt in de break tot een kwart (SH.neon).

  // 1. acid: de oude rode gang als lichtshow: rode plafondlampjes, looplicht in acid-kleuren, lichtringen, vloerpijlen, smileys, 303
  doolhof.gangStijl('acid', { gewicht: 1, *maak(g, maat, rnd, zwaar) {
    const LS = ledSet(maat, rnd, zwaar, { bron: graffiti(), groot: 1.3, modi: [M.BEELD, M.BALKEN, M.TEKST, M.CHEVRON, M.BLOKKEN], plafond: [M.BALKEN, M.CHEVRON, M.PLASMA], vloer: [V.CHEVRON, V.DAMBORD, V.LOOP, V.RINGEN, V.FONKEL], orig: 0.35, glitch: 0.5, woorden: [0, 2, 3, 4] });
    const { muur, vloer, plafond } = LS;
    yield;
    const L = leds(g, maat), R = ringen(g, maat, plekken(maat, [1, 2, 1])), S = smileys(g, maat, rnd, [5, 4, 2][zwaar]);
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
    const SH = show(g, maat, zwaar, { pal: [0xff1a08, 0xffd400, 0x30ff10], led: LS.LC }), rood = new THREE.Color(1, 0.12, 0.05);
    return { muur, vloer, plafond, update(dt, now, b) {
      const k = stemming(b, now), n = SH.neon(k);
      SH.zet(b, now, k);
      R.kleur((r, s, c) => SH.ring(c, r, R.lijst.length, b, k));
      SH.mat([muur, vloer, plafond], b, k, R);
      L.kleur((p, c) => pakket(c, p.s, maat, b, k, SH));
      S.zet(b, k);
      W.zet(now, ca.copy(SH.A), (0.03 + 0.08 * b.bas) * k.dim);
      lampS.forEach((s, i) => {  // rode lampjes: kloppen op de kick, op de drop loopt er een golf langs
        const golf = k.drop ? Math.exp(-frac(b.pos - i * 0.25) * 4) : 0;
        lamp.setColorAt(i, ca.copy(rood).multiplyScalar((0.35 + 0.8 * b.pulse + golf) * k.dim + k.flits));
        if (gloed) gloed.setColorAt(i, cb.copy(rood).multiplyScalar((0.08 + 0.25 * b.pulse + 0.4 * golf) * k.dim));
      });
      lamp.instanceColor.needsUpdate = true; if (gloed) gloed.instanceColor.needsUpdate = true;
      B1.material.color.setScalar((0.75 + 0.5 * b.pulse) * n * (hapert(now, 1) ? 0.12 : 1));
      B2.material.color.setScalar((0.7 + 0.6 * b.bas) * n * (hapert(now, 2) ? 0.15 : 1));
    } };
  } });

  // 2. uv-jungle: blacklight-schildering die op de bas oplicht, violette uv-gloed langs vloer en plafond, vuurvliegjes, lianen van el-draad
  doolhof.gangStijl('uv-jungle', { gewicht: 1, *maak(g, maat, rnd, zwaar) {
    const LS = ledSet(maat, rnd, zwaar, { bron: tex('uv-jungle'), modi: [M.BEELD, M.PLASMA, M.GOLF, M.BEELD, M.TEKST], plafond: [M.PLASMA, M.BEELD, M.GOLF], vloer: [V.BEELD, V.GOLF, V.FONKEL, V.RINGEN], orig: 0.65, warp: 0.004, rust: M.PLASMA, woorden: [3, 2, 4] });
    const { muur, vloer, plafond } = LS;
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
    const SH = show(g, maat, zwaar, { pal: [0x8a30ff, 0xff2bd6, 0x60ff20], led: LS.LC });
    return { muur, vloer, plafond, update(dt, now, b) {
      const k = stemming(b, now), n = SH.neon(k);
      SH.zet(b, now, k);
      R.kleur((r, s, c) => SH.ring(c, r, R.lijst.length, b, k));
      SH.mat([muur, vloer, plafond], b, k, R);
      L.kleur((p, c) => pakket(c, p.s, maat, b, k, SH));
      K.zet(ca.setHSL(0.3 + 0.05 * Math.sin(now * 0.4), 1, 0.5).multiplyScalar((0.15 + 1.0 * b.hoog) * k.dim));
      D.zet(b, k, 0.8);
      W.zet(now, ca.copy(SH.A), (0.03 + 0.1 * b.bas) * k.dim);
      B1.material.color.setScalar((0.7 + 0.5 * b.pulse) * n * (hapert(now, 3) ? 0.12 : 1));
      B2.material.color.setScalar((0.6 + 0.6 * b.mid) * n);
    } };
  } });

  // 3. bass-tempel: stenen tempelwand waarvan de speaker- en draaitafelglyphen oplichten als het lichtpakket langskomt, gouden poortjes
  // met een turquoise binnenrand die op de tel flitst, een gloeiende goot in de stenen vloer en zwevend goudstof
  doolhof.gangStijl('bass-tempel', { gewicht: 1, *maak(g, maat, rnd, zwaar) {
    const LS = ledSet(maat, rnd, zwaar, { bron: tex('bass-tempel'), groot: 1.6, modi: [M.BEELD, M.SPECTRUM, M.BALKEN, M.TEKST], plafond: [M.BALKEN, M.SPECTRUM, M.BEELD], vloer: [V.SPECTRUM, V.RINGEN, V.DAMBORD, V.LOOP], tegel: 0.67, orig: 0.55, woorden: [2, 3, 1] });
    const { muur, vloer, plafond } = LS;
    yield;
    const poortS = plekken(maat, [1, 2, 1]);
    yield;
    const goud = maat.deel('goud', () => glansMat(0xd8a640, 0));
    yield;
    const P = ringen(g, maat, poortS, { mat: goud, dik: 0.13, diep: 0.24 });
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
    const SH = show(g, maat, zwaar, { pal: [0x20ffe0, 0xffa018, 0xff3010], led: LS.LC });
    return { muur, vloer, plafond, update(dt, now, b) {
      const k = stemming(b, now), n = SH.neon(k);
      SH.zet(b, now, k);
      R.kleur((r, s, c) => SH.ring(c, r, R.lijst.length, b, k));
      SH.mat([muur, vloer, plafond], b, k, R);
      goud.uniforms.uT.value = k.t; goud.uniforms.uPuls.value = b.pulse;
      P.kleur(() => ca.setScalar((0.22 + 0.3 * b.pulse) * k.dim + k.flits));  // goud: alleen een glans, de binnenrand is het licht
      D.zet(b, k, 0.7);
      W.zet(now, ca.copy(SH.B), (0.03 + 0.08 * b.bas) * k.dim);
      B1.material.color.setScalar((0.7 + 0.5 * b.pulse) * n * (hapert(now, 4) ? 0.15 : 1));
      B2.material.color.setScalar((0.5 + 0.8 * b.bas) * n);
    } };
  } });

  // 4. paddenstoelen-trip: 70s-schildering die golft en door de regenboog draait (alleen waar licht valt), ringen, kleurringen die over de
  // vloer uitdijen, sporen
  doolhof.gangStijl('paddenstoelen', { gewicht: 1, *maak(g, maat, rnd, zwaar) {
    const LS = ledSet(maat, rnd, zwaar, { bron: tex('paddenstoelen'), modi: [M.BEELD, M.PLASMA, M.GOLF, M.BEELD], plafond: [M.PLASMA, M.BEELD], vloer: [V.RINGEN, V.GOLF, V.BEELD, V.FONKEL], kal: 1, orig: 0.7, warp: 0.006, rust: M.PLASMA });
    const { muur, vloer, plafond } = LS;
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
    const SH = show(g, maat, zwaar, { pal: [0xff28c0, 0xff8a10, 0x8a30ff], led: LS.LC });
    return { muur, vloer, plafond, update(dt, now, b) {
      const k = stemming(b, now), n = SH.neon(k);
      SH.zet(b, now, k);
      R.kleur((r, s, c) => SH.ring(c, r, R.lijst.length, b, k));
      SH.mat([muur, vloer, plafond], b, k, R);
      D.zet(b, k);
      W.zet(now, ca.copy(SH.A), (0.03 + 0.1 * b.bas) * k.dim);
      B1.material.color.setScalar((0.7 + 0.5 * b.pulse) * n * (hapert(now, 5) ? 0.15 : 1));
      B2.material.color.setHSL(frac(now * 0.07), 0.6, (0.45 + 0.25 * b.pulse) * n);
    } };
  } });

  // 5. rave-flyers: 90s folderwand in het donker, kale peertjes aan snoertjes die op de tel knipperen (loop, om en om, alles, fonkel), smileys,
  // natte vloer met weerschijn
  doolhof.gangStijl('rave-flyers', { gewicht: 1, *maak(g, maat, rnd, zwaar) {
    const LS = ledSet(maat, rnd, zwaar, { bron: tex('rave-flyers'), groot: 2.2, modi: [M.BEELD, M.TEKST, M.BLOKKEN, M.BALKEN], plafond: [M.BLOKKEN, M.BALKEN], vloer: [V.DAMBORD, V.FONKEL, V.LOOP, V.CHEVRON], pitch: 0.06, orig: 0.8, woorden: [1, 2, 0, 3] });
    const { muur, vloer, plafond } = LS;
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
    const SH = show(g, maat, zwaar, { pal: [0xff9a20, 0xff20c0, 0xffe010], led: LS.LC }), warm = new THREE.Color(1, 0.55, 0.18);
    return { muur, vloer, plafond, update(dt, now, b) {
      const k = stemming(b, now), n = SH.neon(k);
      SH.zet(b, now, k);
      SH.mat([muur, vloer, plafond], b, k);
      // peertjes: elke maat een ander patroon; drop = alles op elke tel + fonkelen ertussen, break = gloeidraadjes
      const modus = k.st === 'drop' ? (k.maat % 2 ? 3 : 0) : Math.floor(b.pos / 4) % 4, bi = Math.floor(b.pos), fase = b.pos - bi, flits = Math.exp(-fase * 5);
      const per = k.st === 'opbouw' ? k.per : 1;
      pr.forEach((q, i) => {
        let aan;
        if (k.st === 'break') aan = 0.04;
        else if (modus === 0) aan = flits;                                                                                            // alles op de tel
        else if (modus === 1) aan = ((Math.floor(b.pos * 2 * per) - q.i) % 4 + 4) % 4 === 0 ? Math.exp(-frac(b.pos * 2 * per) * 3) : 0;  // looplicht
        else if (modus === 2) aan = (bi + (q.kant > 0 ? 1 : 0)) % 2 === 0 ? flits : 0;                                              // om en om
        else aan = hash(q.i * 3.1 + Math.floor(b.pos * 4)) > 0.72 ? 1 : 0;                                                             // fonkelen
        const h = (0.03 + 1.5 * aan * k.en) * Math.min(1.2, k.dim) + k.flits;
        peer.setColorAt(i, ca.copy(warm).multiplyScalar(h).addScalar(h * h * 0.06));
        if (halo) halo.setColorAt(i, cb.copy(warm).multiplyScalar(0.45 * h));
      });
      peer.instanceColor.needsUpdate = true; if (halo) halo.instanceColor.needsUpdate = true;
      S.zet(b, k);
      W.zet(now, ca.copy(SH.A), (0.03 + 0.08 * b.bas) * k.dim);
      B1.material.color.setScalar((0.7 + 0.5 * b.pulse) * n * (hapert(now, 6) ? 0.12 : 1));
      B2.material.color.setScalar((0.65 + 0.5 * b.mid) * n * (hapert(now, 7) ? 0.12 : 1));
    } };
  } });

  // 6. betonbunker: brutalistisch beton met buizen en kabels in het donker, twee zwaailichten die de muren rood afvegen (hun licht valt op
  // de schildering), een noodlichtstrip, kooilampjes (eentje stuk), gevarenstrepen langs de vloer; op de drop vol stroboscoop
  doolhof.gangStijl('betonbunker', { gewicht: 1, *maak(g, maat, rnd, zwaar) {
    const LS = ledSet(maat, rnd, zwaar, { bron: tex('beton-bunker'), modi: [M.BEELD, M.BALKEN, M.BLOKKEN, M.TEKST], plafond: [M.BALKEN, M.BLOKKEN], vloer: [V.LOOP, V.DAMBORD, V.FONKEL, V.CHEVRON], orig: 0.25, glitch: 1, woorden: [3, 2] });
    const { muur, vloer, plafond } = LS;
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
      return samen(delen, 0x1a1918, 0.25);
    });
    add(g, buisGeo, kleurVert);
    yield;
    const K = kabels(g, maat, rnd, { n: 2, zak: 0.16, kleur: 0x0c0c0c });
    // noodlichtstrip (stukjes van 0,4 m op 2,2 m hoogte langs beide muren) + twee zwaailichten in de bochten
    yield;
    const strip = [];
    for (const kant of [-1, 1]) { const L = maat.lijn(kant * (maat.h - 0.03)), n = Math.floor(L.len / 0.4); for (let i = 0; i < n; i++) { const p = L.op((i + 0.5) * L.len / n); strip.push({ x: p.x, z: p.z, yaw: Math.atan2(p.dx, p.dz) }); } }
    yield;
    const sm = inst(g, maat, BOX, maat.deel('stripMat', () => plus()), strip.length);
    strip.forEach((q, i) => { mtx.compose(vp.set(q.x, 2.2, q.z), qa.setFromAxisAngle(AY, q.yaw), vs.set(0.03, 0.05, 0.36)); sm.setMatrixAt(i, mtx); });
    yield;
    const zwS = [maat.L1, maat.L1 + maat.L2], zw = zwS.map(s => maat.xz(s, 0)).map(p => ({ x: p.x, z: p.z }));
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
    const SH = show(g, maat, zwaar, { pal: [0xff1208, 0xffa000, 0xff0038], led: LS.LC }), rood = new THREE.Color(1, 0.06, 0.03);
    const Z = { lijst: zwS, kl: [new THREE.Color(), new THREE.Color()] };  // licht van de zwaailichten op muren en vloer (via het lichtmasker)
    return { muur, vloer, plafond, update(dt, now, b) {
      const k = stemming(b, now), n = SH.neon(k), strobo = k.flits * 0.65;
      SH.zet(b, now, k);
      const hoek = now * 2.4 + k.dropTel * Math.PI / 2;  // zwaailichten draaien; op de drop een kwartslag extra per tel (na 16 tellen weer in fase)
      const zwI = k.st === 'break' ? 0.12 : (0.5 + 0.5 * b.pulse) * Math.min(1.2, k.dim);
      for (let j = 0; j < 2; j++) Z.kl[j].copy(rood).multiplyScalar(zwI * (0.4 + 1.4 * Math.pow(Math.abs(Math.cos(hoek + j * Math.PI)), 3)));
      SH.mat([muur, vloer, plafond], b, k, Z);
      strip.forEach((q, i) => {
        let h = 0.04;
        for (let j = 0; j < 2; j++) { const a = Math.atan2(q.x - zw[j].x, q.z - zw[j].z), dist = Math.hypot(q.x - zw[j].x, q.z - zw[j].z); h += Math.pow(Math.max(0, Math.cos(a - hoek - j * Math.PI)), 6) * Math.exp(-dist * 0.35) * 1.8; }
        sm.setColorAt(i, ca.copy(rood).multiplyScalar(h * zwI * 1.6).addScalar(strobo));
      });
      sm.instanceColor.needsUpdate = true;
      for (let j = 0; j < 2; j++) kap.setColorAt(j, ca.copy(rood).multiplyScalar((0.6 + 0.8 * Math.max(0, Math.cos(hoek * 2))) * zwI * 1.4 + strobo));
      kap.instanceColor.needsUpdate = true;
      kooi.forEach((q, i) => {
        const kapot = i === stuk && hash(Math.floor(now * 7) + i) < 0.55;  // één lamp hapert
        km.setColorAt(i, ca.setRGB(1, 0.6, 0.25).multiplyScalar(kapot ? 0.03 : (0.25 + 0.4 * b.pulse) * k.dim + strobo));
      });
      km.instanceColor.needsUpdate = true;
      W.zet(now, ca.copy(rood), (0.03 + 0.08 * b.bas + 0.3 * strobo) * k.dim);
      B1.material.color.setScalar((0.7 + 0.5 * b.pulse) * n * (hapert(now, 8) ? 0.1 : 1));
    } };
  } });

  // 7. kosmos-portaal: nevel op muren en plafond die alleen oplicht waar het licht valt, ovale portaalringen die op de tel flitsen,
  // sterren die naar je toe vliegen
  doolhof.gangStijl('kosmos', { gewicht: 1, *maak(g, maat, rnd, zwaar) {
    const LS = ledSet(maat, rnd, zwaar, { bron: tex('kosmos'), modi: [M.BEELD, M.PLASMA, M.BALKEN, M.GOLF], plafond: [M.BEELD, M.PLASMA, M.BALKEN], vloer: [V.BEELD, V.RINGEN, V.LOOP, V.FONKEL], kal: 1, orig: 0.75, warp: 0.003, woorden: [1, 0, 4] });
    const { muur, vloer, plafond } = LS;
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
    const SH = show(g, maat, zwaar, { pal: [0x2a50ff, 0xb030ff, 0x20d8ff], led: LS.LC }), R = { lijst: ps, kl: ps.map(() => new THREE.Color()) };
    return { muur, vloer, plafond, update(dt, now, b) {
      const k = stemming(b, now), n = SH.neon(k);
      SH.zet(b, now, k);
      ps.forEach((s, i) => {  // portaal: ovaal (top 2,57 m), deint op de kick, flitst als de ringen
        const p = maat.xz(s, 0), sc = 1 + 0.012 * b.pulse;
        mtx.compose(vp.set(p.x, 1.29, p.z), qa.setFromAxisAngle(AY, Math.atan2(p.dx, p.dz) + 0.15 * Math.sin(now * 0.5 + i)), vs.set(0.9 * sc, 1.24 * sc, 1)); ring.setMatrixAt(i, mtx);
        SH.ring(R.kl[i], i, ps.length, b, k); ring.setColorAt(i, R.kl[i]);
      });
      ring.instanceMatrix.needsUpdate = true; ring.instanceColor.needsUpdate = true;
      SH.mat([muur, vloer, plafond], b, k, R);
      D.zet(b, k, 1.0 + 0.8 * k.drop);  // (vaste snelheid: een andere snelheid zou alle sterren laten verspringen)
      W.zet(now, ca.copy(SH.A), (0.03 + 0.08 * b.bas) * k.dim);
      B1.material.color.setScalar((0.7 + 0.5 * b.pulse) * n * (hapert(now, 9) ? 0.15 : 1));
      B2.material.color.setScalar((0.5 + 0.7 * b.bas) * n);
    } };
  } });

  // 8. neonsteeg: natte steeg in het donker vol neonbuizen (flikkeren, op de tel), spiegelende plassen die op de kick rimpelen, stoom uit
  // twee roosters, motregen
  doolhof.gangStijl('neonsteeg', { gewicht: 1, *maak(g, maat, rnd, zwaar) {
    const LS = ledSet(maat, rnd, zwaar, { bron: tex('neonsteeg'), groot: 1.4, modi: [M.BEELD, M.TEKST, M.GOLF, M.BALKEN], plafond: [M.BALKEN, M.PLASMA], vloer: [V.FONKEL, V.GOLF, V.LOOP, V.BEELD], orig: 0.75, woorden: [1, 0, 2] });
    const { muur, vloer, plafond } = LS;
    yield;
    const K = kabels(g, maat, rnd, { n: 2, zak: 0.14, kleur: 0x08080a });
    // neonbuizen op de muren (staand en liggend) + hun weerschijn op de natte vloer
    yield;
    const kl3 = [new THREE.Color(1, 0.12, 0.5), new THREE.Color(0.08, 0.85, 1), new THREE.Color(0.6, 0.2, 1), new THREE.Color(1, 0.75, 0.1)], buis = [];
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
    const roost = [2.0, 7.6], rooster = inst(g, maat, BOX, maat.deel('roosterMat', () => new THREE.MeshBasicMaterial({ color: 0x0c0c0e })), roost.length);
    roost.forEach((s, i) => { const p = maat.xz(s, 0.15); mtx.compose(vp.set(p.x, 0.004, p.z), qa.setFromAxisAngle(AY, Math.atan2(p.dx, p.dz)), vs.set(0.5, 0.008, 0.4)); rooster.setMatrixAt(i, mtx); rooster.setColorAt(i, ca.setRGB(1, 1, 1)); });
    yield;
    const ST = wolken(g, maat, rnd, { n: 6, stijg: true, plekken: roost, v: 0.5, maat: 0.9 });
    yield;
    const D = deeltjes(g, maat, rnd, { naam: 'regen', n: 110, modus: 2, snel: 2.4, kleurA: 0x9ac8ff, kleurB: 0xffffff, maat: 0.012 });
    yield;
    const B1 = bord(g, maat, kies(rnd, ['SAMSONIGHT', 'DEEPER']), '#ff2a90', kijkPlek(maat, 0, 1.8), 1.7, true);
    yield;
    const B2 = bord(g, maat, kies(rnd, ['DEEP STEPPER', 'BLOODLINE']), '#20e0ff', kijkPlek(maat, 1, 1.85), 1.7, true);
    const SH = show(g, maat, zwaar, { pal: [0xff1a88, 0x10d8ff, 0x8a30ff], led: LS.LC });
    return { muur, vloer, plafond, update(dt, now, b) {
      const k = stemming(b, now), n = SH.neon(k);
      SH.zet(b, now, k);
      SH.mat([muur, vloer, plafond], b, k);
      const bi = Math.floor(b.pos);
      buis.forEach((q, i) => {  // groove: om en om op de tel; drop: alles, op elke tel een andere kleur; break: flauw, hapert
        const tik = Math.exp(-frac(b.pos) * 3), op = k.st === 'drop' ? 1 : (bi + q.i) % 2 === 0 ? 1 : 0.3;
        const h = (hapert(now, 30 + i) ? 0.05 : (0.35 + 0.9 * tik * op) * n * (k.st === 'break' ? 0.5 : 1)) + k.flits;
        const c = k.st === 'drop' ? kl3[(q.c + bi) % 4] : kl3[q.c];
        bm.setColorAt(i, ca.copy(c).multiplyScalar(h)); rm.setColorAt(i, cb.copy(c).multiplyScalar(0.22 * h));
      });
      bm.instanceColor.needsUpdate = true; rm.instanceColor.needsUpdate = true;
      ST.zet(now, ca.copy(SH.B), (0.05 + 0.1 * b.bas) * k.dim);
      D.zet(b, k, 0.5);
      B1.material.color.setScalar((0.75 + 0.45 * b.pulse) * n * (hapert(now, 10) ? 0.1 : 1));
      B2.material.color.setScalar((0.7 + 0.5 * b.mid) * n * (hapert(now, 11) ? 0.1 : 1));
    } };
  } });

  // 9. slijmhol: biomechanische wand die ademt en groen opgloeit op de bas, slijmdruppels van het plafond met spatjes, ribben met een
  // groene binnenrand die flitst, bellen, groene grondmist
  doolhof.gangStijl('slijmhol', { gewicht: 1, *maak(g, maat, rnd, zwaar) {
    const LS = ledSet(maat, rnd, zwaar, { bron: tex('slijmhol'), groot: 2, modi: [M.BEELD, M.PLASMA, M.GOLF, M.BEELD], plafond: [M.PLASMA, M.BEELD], vloer: [V.GOLF, V.FONKEL, V.RINGEN, V.BEELD], orig: 0.6, warp: 0.01, rust: M.PLASMA, woorden: [4, 3, 2] });
    const { muur, vloer, plafond } = LS;
    yield;
    const rib = maat.deel('rib', () => glansMat(0x2a3424, 0.15));
    yield;
    const R0 = ringen(g, maat, plekken(maat, [1, 2, 1]), { mat: rib, dik: 0.1, diep: 0.14 });
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
    const SH = show(g, maat, zwaar, { pal: [0x30ff20, 0xc0ff10, 0x10ffa0], led: LS.LC }), groen = new THREE.Color(0.3, 1, 0.15), val = Math.sqrt((maat.H - 0.15) / 4.9);
    return { muur, vloer, plafond, update(dt, now, b) {
      const k = stemming(b, now);
      SH.zet(b, now, k);
      G.kleur((r, s, c) => SH.ring(c, r, G.lijst.length, b, k));
      SH.mat([muur, vloer, plafond], b, k, G);
      rib.uniforms.uT.value = k.t; rib.uniforms.uPuls.value = b.pulse;
      R0.kleur(() => ca.setScalar((0.35 + 0.3 * b.bas) * k.dim));
      dr.forEach((q, i) => {
        const t = frac(now / q.P + q.f) * q.P, p = maat.xz(q.s, q.d);
        let y = maat.H - 0.04, sy = 0.03, a = 0, sc = 0;
        if (t < q.P - val - 0.6) { sy = 0.02 + 0.07 * t / (q.P - val - 0.6); y = maat.H - 0.01 - sy; }          // groeien
        else if (t < q.P - 0.6) { const u = t - (q.P - val - 0.6); y = maat.H - 0.1 - 4.9 * u * u; sy = 0.05; }     // vallen
        else { sy = 0; const u = (t - (q.P - 0.6)) / 0.6; sc = 0.1 + 0.5 * u; a = 1 - u; }                              // spat
        mtx.compose(vp.set(p.x, Math.max(0.03, y), p.z), qa.identity(), vs.set(sy ? 0.03 : 0, sy, sy ? 0.03 : 0)); dm.setMatrixAt(i, mtx);
        dm.setColorAt(i, ca.copy(groen).multiplyScalar((0.5 + 0.6 * b.bas) * k.dim));
        mtx.compose(vp.set(p.x, 0.008, p.z), qa.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2), vs.set(sc, sc, 1)); sp.setMatrixAt(i, mtx);
        sp.setColorAt(i, cb.copy(groen).multiplyScalar(a * 0.8 * k.dim));
      });
      dm.instanceMatrix.needsUpdate = sp.instanceMatrix.needsUpdate = true; dm.instanceColor.needsUpdate = sp.instanceColor.needsUpdate = true;
      D.zet(b, k);
      W.zet(now, ca.copy(SH.A), (0.03 + 0.1 * b.bas) * k.dim);
      B1.material.color.setScalar((0.6 + 0.7 * b.bas) * SH.neon(k) * (hapert(now, 12) ? 0.15 : 1));
    } };
  } });

  // 10. chroom: vloeibaar chroom dat alleen glimt waar licht valt en met de kijkhoek van kleur verschiet, spiegelende ringen met een
  // lichtrand, glinsters, een zwarte spiegelvloer met olieglans
  doolhof.gangStijl('chroom', { gewicht: 1, *maak(g, maat, rnd, zwaar) {
    const LS = ledSet(maat, rnd, zwaar, { bron: tex('chroom'), modi: [M.BEELD, M.SPECTRUM, M.BALKEN, M.CHEVRON], plafond: [M.BALKEN, M.SPECTRUM, M.CHEVRON], vloer: [V.BEELD, V.CHEVRON, V.SPECTRUM, V.DAMBORD], rgb: 2.5, spec: 1, orig: 0.45, woorden: [0, 1, 4] });
    const { muur, vloer, plafond } = LS;
    yield;
    const spiegel = maat.deel('spiegel', () => glansMat(0xd8dce8, 0.75));
    yield;
    const R = ringen(g, maat, plekken(maat, [1, 2, 1]), { mat: spiegel, dik: 0.07, diep: 0.1 });
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
    const SH = show(g, maat, zwaar, { pal: [0x3070ff, 0xff40d8, 0x40e8ff], led: LS.LC });
    return { muur, vloer, plafond, update(dt, now, b) {
      const k = stemming(b, now), n = SH.neon(k);
      SH.zet(b, now, k);
      H.kleur((r, s, c) => SH.ring(c, r, H.lijst.length, b, k));
      SH.mat([muur, vloer, plafond], b, k, H);
      spiegel.uniforms.uT.value = k.t; spiegel.uniforms.uPuls.value = b.pulse;
      R.kleur(() => ca.setScalar((0.3 + 0.3 * b.pulse) * k.dim + k.flits));
      D.zet(b, k, 0.4 + b.hoog);
      L.kleur((p, c) => pakket(c, p.s, maat, b, k, SH));
      B1.material.color.setScalar((0.7 + 0.5 * b.pulse) * n * (hapert(now, 13) ? 0.12 : 1));
      B2.material.color.setScalar((0.5 + 0.7 * b.mid) * n);
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
    const LS = ledSet(maat, rnd, zwaar, { bron: tex('arcade'), groot: 1.5, modi: [M.BEELD, M.SPECTRUM, M.BLOKKEN, M.TEKST], plafond: [M.BLOKKEN, M.SPECTRUM, M.BALKEN], vloer: [V.RASTER, V.DAMBORD, V.SPECTRUM, V.CHEVRON], pitch: 0.065, orig: 0.75, woorden: [1, 0, 3] });
    const { muur, vloer, plafond } = LS;
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
    const SH = show(g, maat, zwaar, { pal: [0xff18d0, 0x18e0ff, 0x9a30ff], led: LS.LC });
    return { muur, vloer, plafond, update(dt, now, b) {
      const k = stemming(b, now), n = SH.neon(k);
      SH.zet(b, now, k);
      SH.mat([muur, vloer, plafond], b, k);
      L.kleur((p, c) => pakket(c, p.s, maat, b, k, SH));
      zon.material.color.setScalar((0.5 + 0.6 * b.bas) * n + 0.3 * k.drop);
      D.zet(b, k);
      B1.material.color.setScalar((0.7 + 0.5 * b.pulse) * n * (hapert(now, 14) ? 0.12 : 1));
      B2.material.color.setScalar((0.6 + 0.6 * b.mid) * n);
    } };
  } });

  // 12. laserraster: stalen gang in het donker met gevarenstrepen, laserstralen dwars door de gang die op de maat op en neer zwiepen en
  // kantelen (kleur per maat, op de drop allemaal aan en sneller, in de break uit), stippen waar ze de muur raken, nevel om de stralen te zien
  doolhof.gangStijl('laserraster', { gewicht: 1, *maak(g, maat, rnd, zwaar) {
    const LS = ledSet(maat, rnd, zwaar, { bron: tex('staal', true), aspect: 1, px: 1024, modi: [M.BALKEN, M.GOLF, M.CHEVRON, M.BEELD], plafond: [M.BALKEN, M.CHEVRON], vloer: [V.LOOP, V.RASTER, V.CHEVRON, V.FONKEL], orig: 0.1, rust: M.BALKEN, woorden: [3, 2] });
    const { muur, vloer, plafond } = LS;
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
    const kleuren = [0xff1030, 0x20ff40, 0x2060ff, 0xff20e0].map(c => new THREE.Color(c));
    yield;
    const SH = show(g, maat, zwaar, { pal: [0xff1030, 0x20ff40, 0x2060ff], led: LS.LC }), as = new THREE.Vector3();
    return { muur, vloer, plafond, update(dt, now, b) {
      const k = stemming(b, now), n = SH.neon(k);
      SH.zet(b, now, k);
      SH.mat([muur, vloer, plafond], b, k);
      L.kleur((p, c) => pakket(c, p.s, maat, b, k, SH));
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
        // groove: een derde uit (wisselt per maat), opbouw: om de beurt op de achtsten, drop: allemaal, break: uit; tijdens het salvo wit
        const aan = k.st === 'break' ? 0 : k.st === 'drop' ? 1 : k.st === 'opbouw' ? (Math.floor(b.pos * 2 * k.per) % st.length === q.j ? 1 : 0.1) * (0.4 + 0.6 * k.opbouw) : (q.j + maatNr) % 3 !== 0 ? 1 : 0;
        const c = k.salvo ? ca.setRGB(1, 1, 1).multiplyScalar(1.5 * k.flits) : ca.copy(kleuren[(maatNr + q.j + (k.st === 'drop' ? Math.floor(b.pos) : 0)) % 4]).multiplyScalar(aan * (0.9 + 0.6 * b.pulse) * k.en * Math.min(1.2, k.dim));
        kern.setColorAt(i, c);
        if (gloed) gloed.setColorAt(i, cb.copy(c).multiplyScalar(0.18));
        stip.setColorAt(i * 2, cb.copy(c).multiplyScalar(0.8)); stip.setColorAt(i * 2 + 1, cb);
      });
      for (const m of [kern, gloed, stip]) if (m) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
      W.zet(now, ca.copy(SH.A), (0.04 + 0.08 * b.bas) * k.dim);
      B1.material.color.setScalar((0.7 + 0.5 * b.pulse) * n * (hapert(now, 15) ? 0.1 : 1));
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

// --- Publiek: goedkoop maar echt ogend 3D-publiek, één draw call per menigte ---
// window.clubPubliek.maak(parent, opties) -> handvat. Een low-poly pop (romp, hoofd, haar, armen met ellebogen, benen, schoenen;
// ~580 driehoeken) met drie lichaamsvormen in één geometrie (morph: man / vrouw / breed), als InstancedMesh.
// Alle beweging zit in de vertex-shader, op de muziek: deinen op de tel (boven ~126 BPM op de halve tel, zoals dansgevoel.js),
// hoofdknikken op elke tel, armen omhoog en pompen in de drop, de eersten al aan het eind van de opbouw, rustig wiegen in de
// break (window.clubRegie.stand); per persoon een eigen fase, temperament, lengte, huid, kleding en soms lange mouwen.
// Per muziekstijl (window.clubStijl.preset.dans) anders: lounge rustig met glas, headbangen + vuist, pogo-springen, handen in de
// lucht (trance), heupen (afro), skank-knieën (dnb), bouncen (hiphop), zwaar op de halve tel (dubstep); ieder wisselt op een eigen moment.
// Licht zonder lampen: donker silhouet met een rand van tegenlicht in het palet van de kamer (kleur a vanaf het podium,
// kleur b van achter/boven), een paar telefoons die oplichten en soms flitsen (en het gezicht erachter bijlichten).
// Eén gedeeld materiaal (één shader, wordt nooit opnieuw gecompileerd); per beeld alleen een handvol uniforms, geen matrices.
// Opties: plekken [{x, z, y?, face?}] of vorm { soort: 'kring' (c, r0, r1, a0?, a1?) | 'rijen' (c, u, d0, d1, breed) |
// 'vlak' (x0, x1, z0, z1) } met aantal, afstand en vrij(x, z); kijk {x, z}; kleuren { a, b, vul, kleding: [...] };
// licht {x, y, z} (podium, in de ruimte van parent); schaal; telefoons (aandeel); rnd; dicht (camera-afstand waarbinnen iemand
// verdwijnt); vast (aantal niet schalen met de kwaliteitsstand). Handvat: { mesh, n, plekken, zet({ a, b, vul, helder, flits,
// armen, rand }), opruimen() }. Test: clubPubliek.forceer = { stand: 'drop', energie: 1, half: true, dans: 'pogo' } (null = muziek volgen).
(() => {
  'use strict';
  // window.clubPubliek bestaat al (meeleven.js: golf/totBeat, laadt eerder): we hangen er alleen maak/aantal/forceer aan
  if ((window.clubPubliek && window.clubPubliek.maak) || typeof THREE === 'undefined') return;
  const RONDE = Math.PI * 2;
  const klem = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  // aantal per kwaliteitsstand (de doolhof-kamers geven het aantal van 'hoog' op)
  const FACTOR = { hoog: 1, midden: 0.85, laag: 0.6, minimaal: 0.4 };
  const factor = () => FACTOR[typeof KW !== 'undefined' && KW && KW.stand] || 1;

  // --- de pop: maten als lineaire functie van vrouw (v) en breed (b); de shader rekent de draaipunten met dezelfde getallen ---
  const M = { heup: 0.95, heupV: -0.025, sx: 0.19, sxV: -0.028, sxB: 0.03, sy: 1.43, syV: -0.04, nek: 1.5, nekV: -0.04, boven: 0.285, onder: 0.33 };
  const DEEL = { been: 0, romp: 1, hoofd: 2, bovenL: 3, onderL: 4, bovenR: 5, onderR: 6, tel: 7, pet: 8, muts: 9, hoed: 10 };  // 8-10: hoofddeksels (per persoon hooguit één, de rest klapt weg)
  const KL = { broek: 0, top: 1, huid: 2, haar: 3, scherm: 4, schoen: 5, onderarm: 6, hoed: 7 };

  // buis door horizontale ringen [y, rx, rz, x, z, klasse]; n hoeken; onder/boven = dop met een middelpunt
  function buis(G, ringen, n, deel, onder, boven) {
    const start = G.pos.length / 3;
    for (const [y, rx, rz, x = 0, z = 0, kl] of ringen) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * RONDE + Math.PI / n;
        G.pos.push(x + Math.sin(a) * rx, y, z + Math.cos(a) * rz); G.deel.push(deel); G.kl.push(kl);
      }
    }
    // voorkant naar buiten: de volgorde hangt af van of de ringen omhoog of omlaag lopen (armen bouwen we van de schouder af)
    const op = ringen[ringen.length - 1][0] > ringen[0][0];
    for (let r = 0; r < ringen.length - 1; r++) for (let i = 0; i < n; i++) {
      const a = start + r * n + i, b = start + r * n + (i + 1) % n, c = a + n, d = b + n;
      if (op) G.idx.push(a, b, c, b, d, c); else G.idx.push(a, c, b, b, c, d);
    }
    const dop = ri => {  // dop op het eerste of laatste stuk: onderkant wijst omlaag, bovenkant omhoog
      const [y, , , x = 0, z = 0, kl] = ringen[ri], m = G.pos.length / 3, laag = (ri === 0) === op;
      G.pos.push(x, y + (laag ? -0.012 : 0.012), z); G.deel.push(deel); G.kl.push(kl);
      for (let i = 0; i < n; i++) { const a = start + ri * n + i, b = start + ri * n + (i + 1) % n; if (laag) G.idx.push(m, b, a); else G.idx.push(m, a, b); }
    };
    if (onder) dop(0);
    if (boven) dop(ringen.length - 1);
  }
  function blok(G, x0, x1, y0, y1, z0, z1, deel, kl, scherm) {  // doos van 8 hoekpunten (zacht belicht); scherm: +z-vlak apart
    const s = G.pos.length / 3, P = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
    for (const p of P) { G.pos.push(...p); G.deel.push(deel); G.kl.push(kl); }
    const F = [[0, 3, 2, 1], [1, 2, 6, 5], [5, 6, 7, 4], [4, 7, 3, 0], [3, 7, 6, 2], [0, 1, 5, 4]];
    for (let f = 0; f < F.length; f++) {
      let [a, b, c, d] = F[f].map(i => s + i);
      if (scherm != null && f === 2) {  // +z: eigen hoekpunten met de schermklasse
        const t = G.pos.length / 3;
        for (const i of [5, 6, 7, 4]) { G.pos.push(...P[i]); G.deel.push(deel); G.kl.push(scherm); }
        [a, b, c, d] = [t, t + 1, t + 2, t + 3];
      }
      G.idx.push(a, b, c, a, c, d);
    }
  }
  function lijf(v, b) {
    const G = { pos: [], deel: [], kl: [], idx: [] };
    const heup = M.heup + M.heupV * v, sx = M.sx + M.sxV * v + M.sxB * b, sy = M.sy + M.syV * v, nek = M.nek + M.nekV * v;
    // benen (5 hoeken, zonder doppen: boven in de romp, onder in de schoen) en schoenen
    for (const s of [-1, 1]) {
      buis(G, [[0.085, 0.038, 0.042, s * 0.1, 0, KL.broek], [0.32, 0.055 + 0.012 * b, 0.06 + 0.012 * b, s * 0.096, -0.012, KL.broek],
        [0.5, 0.055 + 0.012 * b, 0.058 + 0.012 * b, s * (0.093 + 0.006 * v + 0.01 * b), 0.012, KL.broek],
        [heup + 0.03, 0.085 + 0.012 * v + 0.028 * b, 0.09 + 0.006 * v + 0.022 * b, s * (0.088 + 0.012 * v + 0.014 * b), 0, KL.broek]], 5, DEEL.been);
      const bw = 0.05 - 0.006 * v;
      blok(G, s * 0.1 - bw, s * 0.1 + bw, 0, 0.09, -0.06 + 0.01 * v, 0.17 - 0.02 * v, DEEL.been, KL.schoen);
    }
    // romp (8 hoeken): broek tot de riem (dubbele ring = harde rand), dan het bovenstuk tot de nekvoet
    const riem = heup + 0.1;
    const t = (y, rx, rz, z, kl) => [y, rx, rz, 0, z, kl];
    buis(G, [t(heup - 0.07, 0.135 + 0.02 * v + 0.03 * b, 0.095 + 0.005 * v + 0.025 * b, 0, KL.broek),
      t(heup + 0.03, 0.16 + 0.03 * v + 0.035 * b, 0.105 + 0.012 * v + 0.03 * b, -0.006 - 0.012 * v, KL.broek),
      t(riem, 0.152 + 0.004 * v + 0.045 * b, 0.1 + 0.004 * v + 0.05 * b, 0.0 + 0.02 * b, KL.broek),
      t(riem, 0.152 + 0.004 * v + 0.045 * b, 0.1 + 0.004 * v + 0.05 * b, 0.0 + 0.02 * b, KL.top),
      t(heup + 0.21 - 0.02 * v, 0.145 - 0.03 * v + 0.05 * b, 0.098 - 0.008 * v + 0.06 * b, 0.006 + 0.03 * b, KL.top),
      t(sy - 0.14, 0.165 - 0.025 * v + 0.04 * b, 0.112 + 0.022 * v + 0.04 * b, 0.012 + 0.018 * v + 0.01 * b, KL.top),
      t(sy - 0.035, sx - 0.008, 0.1 + 0.02 * b, 0, KL.top),
      t(sy + 0.012, sx - 0.05, 0.085 + 0.015 * b, -0.004, KL.top),
      t(sy + 0.06, 0.068 - 0.006 * v + 0.01 * b, 0.062 + 0.008 * b, -0.006, KL.top)], 8, DEEL.romp, true, true);  // schouders aflopend naar de nek
    // nek, hoofd (iets kleiner bij v) en haar (kort of lang; ligt als helm om het hoofd, het gezicht steekt erdoor)
    const k = 1 - 0.06 * v;
    buis(G, [[nek - 0.035, 0.05 + 0.008 * b, 0.052 + 0.008 * b, 0, 0.003, KL.huid], [nek + 0.07, 0.046 * k, 0.048 * k, 0, 0.008, KL.huid]], 6, DEEL.hoofd);
    const h = (dy, rx, rz, z) => [nek + dy * k, rx * k, rz * k, 0, z * k, KL.huid];
    buis(G, [h(0.045, 0.045, 0.05, 0.035), h(0.085, 0.075, 0.088, 0.02), h(0.14, 0.085, 0.1, 0.012), h(0.2, 0.08, 0.095, 0.006), h(0.235, 0.05, 0.06, 0.002)], 8, DEEL.hoofd, true, true);
    const hr = (dy, rx, rz, z) => [nek + dy * k, rx * k, rz * k, 0, z * k, KL.haar];
    buis(G, v ? [hr(-0.035, 0.1, 0.068, -0.058), hr(0.14, 0.098, 0.1, -0.02), hr(0.215, 0.08, 0.092, -0.004), hr(0.25, 0.05, 0.058, 0)]
      : [hr(0.115, 0.088, 0.09, -0.03), hr(0.17, 0.09, 0.104, -0.008), hr(0.222, 0.074, 0.087, 0), hr(0.252, 0.046, 0.054, 0)], 8, DEEL.hoofd, false, true);
    // hoofddeksels (17-10, meer variatie): pet met klep, hoge muts, hoed met rand; de shader laat per persoon er hooguit één staan
    const hd = (dy, rx, rz, z) => [nek + dy * k, rx * k, rz * k, 0, z * k, KL.hoed];
    buis(G, [hd(0.16, 0.1, 0.11, -0.004), hd(0.22, 0.095, 0.105, -0.002), hd(0.268, 0.06, 0.066, 0)], 8, DEEL.pet, true, true);
    blok(G, -0.075 * k, 0.075 * k, nek + 0.162 * k, nek + 0.176 * k, 0.04 * k, 0.175 * k, DEEL.pet, KL.hoed);
    buis(G, [hd(0.13, 0.102, 0.112, -0.004), hd(0.2, 0.099, 0.109, -0.004), hd(0.27, 0.076, 0.081, -0.008), hd(0.315, 0.03, 0.034, -0.012)], 8, DEEL.muts, true, true);
    buis(G, [hd(0.176, 0.095, 0.105, 0), hd(0.176, 0.178, 0.188, 0)], 10, DEEL.hoed);  // rand (boven en onder)
    buis(G, [hd(0.172, 0.178, 0.188, 0), hd(0.172, 0.095, 0.105, 0)], 10, DEEL.hoed);
    buis(G, [hd(0.17, 0.097, 0.107, 0), hd(0.29, 0.086, 0.094, 0)], 10, DEEL.hoed, false, true);
    // armen: bovenarm (mouw) en onderarm + hand; telefoon in de rechterhand (bij wie geen heeft klapt hij in de shader weg)
    for (const s of [1, -1]) {
      const ex = s * (sx + 0.012), ey = sy - M.boven;
      buis(G, [[sy + 0.015, 0.052 + 0.015 * b, 0.058 + 0.015 * b, s * sx, 0, KL.top], [sy - 0.06, 0.05 - 0.005 * v + 0.015 * b, 0.05 + 0.015 * b, s * (sx + 0.004), 0, KL.top],
        [ey, 0.04 - 0.004 * v + 0.008 * b, 0.042 + 0.008 * b, ex, 0, KL.top]], 6, s > 0 ? DEEL.bovenL : DEEL.bovenR, true, true);
      buis(G, [[ey + 0.01, 0.04 - 0.004 * v + 0.008 * b, 0.042 + 0.008 * b, ex, 0, KL.onderarm], [ey - 0.25, 0.028, 0.032, ex, 0, KL.onderarm],
        [ey - 0.25, 0.028, 0.032, ex, 0, KL.huid], [ey - 0.3, 0.022, 0.045, ex, 0.005, KL.huid], [ey - 0.37, 0.016, 0.032, ex, 0.01, KL.huid]], 6, s > 0 ? DEEL.onderL : DEEL.onderR, true, true);
      if (s < 0) blok(G, ex - 0.035, ex + 0.035, ey - 0.42, ey - 0.27, 0.035, 0.047, DEEL.tel, KL.schoen, KL.scherm);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(G.pos, 3));
    geo.setIndex(G.idx);
    geo.computeVertexNormals();
    return { geo, deel: G.deel, kl: G.kl };
  }
  // basis + verschillen (zelfde topologie): één keer, de arrays delen alle menigtes
  const BASIS = (() => {
    const m = lijf(0, 0), f = lijf(1, 0), b = lijf(0, 1);
    const pm = m.geo.attributes.position.array, nm = m.geo.attributes.normal.array;
    const verschil = (g, k) => { const a = g.geo.attributes[k].array, uit = new Float32Array(a.length), o = k === 'position' ? pm : nm; for (let i = 0; i < a.length; i++) uit[i] = a[i] - o[i]; return uit; };
    const info = new Float32Array(m.deel.length * 2);
    for (let i = 0; i < m.deel.length; i++) { info[i * 2] = m.deel[i]; info[i * 2 + 1] = m.kl[i]; }
    const uit = { pos: pm, nor: nm, idx: m.geo.index.array, aV: verschil(f, 'position'), aVn: verschil(f, 'normal'), aB: verschil(b, 'position'), aBn: verschil(b, 'normal'), info, tris: m.geo.index.count / 3 };
    for (const g of [m, f, b]) g.geo.dispose();
    return uit;
  })();

  // --- shader ---
  const f = x => (Math.round(x * 10000) / 10000).toFixed(4);
  const VERT = `
attribute vec3 aV, aB, aVn, aBn;
attribute vec2 aInfo;
attribute vec4 iA, iB;
attribute vec3 iC;
uniform float uDein, uTel, uTijd, uRust, uDrop, uArmen, uEnergie, uDicht, uArmenExtra, uSMix, uSlag, uStap;
uniform vec4 uSA0, uSB0, uSA1, uSB1;
varying vec3 vN, vW, vKl;
varying float vScherm, vZicht;
#include <fog_pars_vertex>
// draaimatrices (kolommen); alles zonder vertakkingen: de shader compileert dan veel sneller (ANGLE/D3D)
mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
float is(float d, float k) { return step(abs(d - k), 0.5); }
void main() {
  float deel = aInfo.x, kl = aInfo.y;
  float fase = iA.x, temp = iA.y, vr = iA.z, br = iA.w, tel = iB.x, zaad = iB.w;
  vec3 p = position + aV * vr + aB * br;
  vec3 n = normal + aVn * vr + aBn * br;
  vec3 n0 = n;
  // muziekstijl (window.clubStijl): ieder op een eigen moment van de oude naar de nieuwe stijl (uSMix loopt in ~4 tellen naar 1)
  // sA = lounge, headbang, pogo, handen; sB = heupen (afro), skank (dnb), bounce (hiphop), zwaar (dubstep)
  float wS = smoothstep(0.0, 1.0, clamp((uSMix - fract(zaad * 2.71) * 0.75) / 0.25, 0.0, 1.0));
  vec4 sA = mix(uSA0, uSA1, wS), sB = mix(uSB0, uSB1, wS);
  float sL = sA.x, sBang = sA.y * (1.0 - 0.8 * uRust), sPogo = sA.z * (1.0 - uRust), sHand = sA.w * (1.0 - 0.8 * uRust);
  float sHeup = sB.x * (1.0 - 0.6 * uRust), sSkank = sB.y * (1.0 - 0.85 * uRust), sBounce = sB.z, sZwaar = sB.w;
  float dropS = uDrop * (1.0 - 0.75 * sL);  // lounge: op de drop hooguit iets meer
  // ritme: deinklok (op de tel, of de halve tel bij hoog tempo) en de tel voor het hoofd
  float lev = (0.3 + 0.7 * uEnergie) * (1.0 - 0.72 * uRust) * (1.0 - 0.65 * sL);
  float d = uDein + fase, h = uTel + fase * 0.6, wd = 6.2832 * d;
  float dip = (0.018 + 0.045 * temp) * lev * (1.0 + 0.5 * dropS + 1.2 * sBounce + 1.5 * sZwaar) * (0.5 + 0.5 * cos(wd));
  float spring = dropS * smoothstep(0.62, 0.8, temp) * 0.13 * max(0.0, sin(3.1416 * fract(d))) * (1.0 - sL);
  spring += sPogo * step(0.25, temp) * (0.1 + 0.12 * temp) * max(0.0, sin(3.1416 * fract(uSlag + fase * 0.5)));  // pogo: recht omhoog
  // armen: groove = gebogen voor het lijf en meezwaaien; omhoog = V boven het hoofd, pompen op de tel; telefoon = rechts omhoog
  float isL = is(deel, 3.0) + is(deel, 4.0), isR = step(4.5, deel), zij = 2.0 * isL - 1.0;
  // handen omhoog: in de drop snel (ieder op een eigen drempel, een golf door de zaal); op energie/opbouw per 4 maten opnieuw
  // beslist, ieder op een eigen tel (niet allemaal tegelijk) en in een halve tel gewisseld (nooit blijven hangen met de armen half omhoog)
  float opD = smoothstep(-0.06, 0.06, max(dropS, uArmenExtra) - (0.12 + 0.82 * iB.z));
  float tE = uTel + floor(fract(zaad * 1.73) * 16.0), k16 = floor(tE / 16.0), w16 = smoothstep(0.0, 0.45, tE - k16 * 16.0);
  float opE = mix(step(0.2 + 0.78 * fract(iB.z + (k16 - 1.0) * 0.618), uArmen), step(0.2 + 0.78 * fract(iB.z + k16 * 0.618), uArmen), w16);
  float op = max(opD, opE);
  op = max(op * (1.0 - 0.85 * sL), sHand * step(fract(zaad * 5.3), 0.35 + 0.45 * uEnergie + 0.3 * uDrop));  // trance: handen in de lucht
  float een = step(0.72, fract(zaad * 7.13));
  float opA = max(op * (1.0 - een * isL), sBang * step(0.5, fract(zaad * 4.1)) * isR);  // headbang: vuist omhoog
  // armstijl per persoon: hangend (meezwaaien), dansend (ellebogen gebogen, onderarmen omhoog, om en om) of glas voor de borst
  float zw = sin(wd + zij * 1.4 + zaad * 5.0), bew = (1.0 - uRust) * (0.4 + 0.6 * uEnergie);
  float st = fract(zaad * 3.31), dansA = step(0.3, st) * step(st, 0.8) * (1.0 - sL), glas = step(0.8 - 0.45 * sL, st) * isR;  // lounge: glas
  float th0 = 0.1 + 0.1 * dansA + 0.06 * temp + 0.04 * zw * lev;
  float ph0 = 0.04 + (0.1 + 0.12 * temp) * dansA * bew + (0.04 + 0.1 * temp) * lev * zw + 0.3 * glas;
  float e0 = 0.2 + dansA * bew * (1.85 + 0.3 * temp + 0.2 * zw) + (1.0 - dansA) * 0.12 * lev * (0.5 + 0.5 * zw) + 1.6 * glas;
  float pomp = (0.5 + 0.5 * cos(6.2832 * h)) * max(dropS, 0.6 * sBang);
  float th1 = 2.85 + 0.1 * temp - 0.1 * pomp, ph1 = 0.22 + 0.2 * pomp, e1 = 0.2 + 0.25 * (1.0 - temp) + 0.65 * pomp * temp;
  float th = mix(th0, th1, opA), ph = mix(ph0, ph1, opA) + 0.9 * sin(3.1416 * opA), e = mix(e0, e1, opA);  // omhoog via voren, niet als vliegtuig
  float zwS = cos(3.1416 * uStap);  // skank: armen als bij rennen, tegen de benen in; bounce: armen pompen op de tel
  ph += (1.0 - opA) * (sSkank * 0.55 * zij * zwS + sBounce * 0.3 * (0.5 + 0.5 * cos(6.2832 * h)));
  e += (1.0 - opA) * (sSkank * 1.1 + sBounce * 0.5 * (0.5 + 0.5 * cos(6.2832 * h)));
  float tArm = tel * isR;
  th = mix(th, 0.18, tArm); ph = mix(ph, 1.9 + 0.05 * sin(uTijd * 1.3 + zaad * 9.0), tArm); e = mix(e, 0.9, tArm);
  float SX = ${f(M.sx)} + ${f(M.sxV)} * vr + ${f(M.sxB)} * br, SY = ${f(M.sy)} + ${f(M.syV)} * vr;
  float NK = ${f(M.nek)} + ${f(M.nekV)} * vr, HP = ${f(M.heup)} + ${f(M.heupV)} * vr;
  vec3 sch = vec3(zij * SX, SY, 0.0), ell = sch + vec3(zij * 0.012, -${f(M.boven)}, 0.0);
  // telefoon: alleen bij wie er een heeft (anders klapt hij weg in de hand)
  p = mix(p, mix(ell + vec3(0.0, -${f(M.onder)}, 0.04), p, tel), is(deel, 7.0));
  // onderarm om de elleboog, dan de hele arm om de schouder
  float isO = is(deel, 4.0) + is(deel, 6.0) + is(deel, 7.0), isA = step(2.5, deel) * (1.0 - step(7.5, deel));
  mat3 rE = rotX(-e), rS = rotZ(zij * th) * rotX(-ph);
  p = mix(p, rE * (p - ell) + ell, isO); n = mix(n, rE * n, isO);
  p = mix(p, rS * (p - sch) + sch, isA); n = mix(n, rS * n, isA);
  // hoofd: knikken op de tel (telefoonhouders kijken omhoog naar hun scherm)
  float knik = (0.05 + 0.2 * temp) * (0.35 + 0.65 * uEnergie) * (1.0 - 0.75 * uRust) * (0.5 + 0.5 * cos(6.2832 * h)) * (1.0 - 0.7 * sL) + 0.04 - 0.2 * tel;
  float bng = pow(0.5 + 0.5 * cos(6.2832 * (uSlag + fase * 0.3)), 3.0), zw3 = pow(0.5 + 0.5 * cos(wd), 3.0);
  knik += sBang * (0.32 + 0.3 * temp) * bng + sZwaar * (0.22 + 0.15 * temp) * zw3;  // headbangen op de tel; dubstep zwaar op de halve tel
  float hrol = 0.07 * temp * (1.0 - uRust) * sin(3.1416 * h + zaad * 3.0);
  float isH = is(deel, 2.0) + step(7.5, deel);  // hoofd + hoofddeksel
  vec3 nk = vec3(0.0, NK, 0.0);
  float hv = floor(fract(zaad * 7.77) * 7.0);  // 4 pet, 5 muts, 6 hoed, anders niets
  p = mix(p, nk + vec3(0.0, 0.1, 0.0), step(7.5, deel) * (1.0 - is(hv, deel - 4.0)));
  mat3 rH = rotZ(hrol) * rotX(knik);
  p = mix(p, rH * (p - nk) + nk, isH); n = mix(n, rH * n, isH);
  // lijf: wiegen, voorover op de dip, wat draaien; de benen buigen mee (knie naar voren), de voeten blijven staan
  float hp3 = sin(4.1888 * uTel + zaad * 6.0);  // afro: heup wisselt elke 3/4 tel (tresillo-raster)
  float rol = (0.035 + 0.055 * temp) * lev * sin(3.1416 * d + zaad * 6.0) + uRust * 0.04 * sin(uTijd * 0.8 + zaad * 6.3)
    + sL * 0.035 * sin(1.5708 * d + zaad * 6.0) + sHeup * 0.1 * hp3;
  float voor = 0.04 + 0.03 * temp + 0.6 * dip + 0.06 * dropS * temp + sBang * 0.14 * bng + sZwaar * 0.08 * zw3;
  float draai = (0.08 + 0.12 * temp) * (1.0 - 0.5 * uRust) * (1.0 - 0.6 * sL) * sin(1.5708 * d + zaad * 6.28) + sHeup * 0.16 * hp3;
  vec3 hp = vec3(0.0, HP, 0.0);
  mat3 rB = rotY(draai) * rotX(voor) * rotZ(rol);
  float been = 1.0 - step(0.5, deel), k = mix(1.0, clamp(p.y / HP, 0.0, 1.0), been);
  p = mix(p, rB * (p - hp) + hp, k); n = mix(n, rB * n, k);
  p.y -= dip * k; p.z += dip * 1.3 * sin(3.1416 * k) * been;
  // skank: knie om en om omhoog (been aan de +x- of -x-kant), op het hele tempo
  float lift = sSkank * step(0.2, temp) * max(0.0, sign(position.x) * sin(3.1416 * uStap)) * been;
  float kh = clamp(position.y / HP, 0.0, 1.0);
  p.y += lift * 0.2 * (1.0 - kh); p.z += lift * 0.16 * sin(3.1416 * kh);
  p.y += spring;
  // dicht bij de camera: over 0,9 m uitvagen (gerasterd), daarbinnen weg; van dichtbij is het een etalagepop
  vec4 o = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float ca = distance(cameraPosition, o.xyz + vec3(0.0, 1.2, 0.0));
  vZicht = smoothstep(uDicht, uDicht + 0.9, ca);
  p *= step(0.001, vZicht);
  vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * n);
  // kleuren per klasse: broek, bovenstuk (per persoon), huid, haar, scherm, schoen/telefoon, onderarm (huid of lange mouw)
  vec3 huid = mix(vec3(0.13, 0.08, 0.055), vec3(0.5, 0.36, 0.28), iB.y);
  vec3 haar = mix(vec3(0.025, 0.02, 0.018), vec3(0.3, 0.2, 0.1), step(0.8, fract(zaad * 3.7)));
  vec3 broek = vec3(0.04, 0.042, 0.05) * (0.6 + 0.9 * fract(zaad * 11.3)) + iC * 0.1;
  float lang = step(0.55, fract(zaad * 5.9));
  vec3 hoed = mix(vec3(0.03, 0.03, 0.035), iC * 1.15, step(0.45, fract(zaad * 17.3))) + vec3(0.25) * step(0.9, fract(zaad * 23.1));
  vKl = broek * is(kl, 0.0) + iC * is(kl, 1.0) + huid * is(kl, 2.0) + haar * is(kl, 3.0) + vec3(0.025) * (is(kl, 4.0) + is(kl, 5.0)) + mix(huid, iC, lang) * is(kl, 6.0) + hoed * is(kl, 7.0);
  float flits = step(fract(uTijd * 0.09 + zaad * 13.7), 0.012);
  vScherm = tel * (is(kl, 4.0) * (0.85 + 0.15 * sin(uTijd * 3.0 + zaad * 20.0)) * (1.0 + 2.5 * flits)
    + isH * is(kl, 2.0) * max(n0.z, 0.0) * (0.22 + 0.5 * flits));  // scherm, en het gezicht in het schermlicht
  vec4 mvPosition = viewMatrix * w;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
  const FRAG = `
uniform vec3 uKleurA, uKleurB, uVul, uLicht;
uniform float uHelder, uFlits, uRandA, uRandB;
varying vec3 vN, vW, vKl;
varying float vScherm, vZicht;
#include <fog_pars_fragment>
void main() {
  if (vZicht < 1.0 && fract(52.9829 * fract(dot(gl_FragCoord.xy, vec2(0.06711, 0.00584)))) > vZicht) discard;
  vec3 N = normalize(vN), V = normalize(cameraPosition - vW);
  vec3 L = normalize(uLicht - vW);
  vec3 C = normalize(vec3(-L.x, 0.0, -L.z) + vec3(0.0, 0.7, 0.0));  // tegenlicht: van achter het publiek en wat van boven
  float fr = 1.0 - clamp(dot(N, V), 0.0, 1.0), nl = dot(N, L), nc = dot(N, C), f4 = fr * fr * fr * fr;
  float randA = f4 * smoothstep(-0.15, 0.6, nl), randB = f4 * fr * smoothstep(0.0, 0.8, nc);  // smalle rand, alleen aan de lichtkant
  vec3 A = mix(uKleurA, vec3(dot(uKleurA, vec3(0.3, 0.55, 0.15))), 0.45);  // podiumlicht op de voorkant: wat minder verzadigd
  vec3 licht = uVul + A * (0.18 * max(nl, 0.0)) + uKleurB * (0.16 * max(nc, 0.0)) + (uKleurA + uKleurB) * (0.05 * max(N.y, 0.0));
  vec3 kleur = vKl * licht + uKleurA * (randA * uRandA * 1.3) + uKleurB * (randB * uRandB);
  kleur *= uHelder;
  kleur += vec3(0.75, 0.85, 1.0) * vScherm;
  kleur += (uKleurA * 0.5 + 0.5) * (uFlits * (0.12 + 0.6 * (randA + randB)));
  gl_FragColor = vec4(kleur, 1.0);
  #include <fog_fragment>
}`;

  // gedeelde uniforms (één keer per beeld bijgewerkt) en het ene materiaal
  const U = { uDein: { value: 0 }, uTel: { value: 0 }, uTijd: { value: 0 }, uRust: { value: 0 }, uDrop: { value: 0 }, uArmen: { value: 0 }, uEnergie: { value: 0.8 },
              uSMix: { value: 1 }, uSlag: { value: 0 }, uStap: { value: 0 },
              uSA0: { value: new THREE.Vector4(0, 0, 0, 0) }, uSB0: { value: new THREE.Vector4(0, 0, 0, 0) }, uSA1: { value: new THREE.Vector4(0, 0, 0, 0) }, uSB1: { value: new THREE.Vector4(0, 0, 0, 0) } };
  // muziekstijl -> sterktes in de shader (sA: lounge, headbang, pogo, handen; sB: heupen, skank, bounce, zwaar); groove = het gewone deinen
  const STIJL = { handen: [0, 0, 0, 1, 0, 0, 0, 0], halftime: [0, 0.25, 0, 0, 0, 0, 0, 1], skank: [0, 0, 0, 0, 0, 1, 0, 0], bounce: [0, 0, 0, 0, 0, 0, 1, 0],
                  afro: [0, 0, 0, 0, 1, 0, 0, 0], lounge: [1, 0, 0, 0, 0, 0, 0, 0], headbang: [0, 1, 0, 0, 0, 0, 0, 0], pogo: [0, 0, 1, 0, 0, 0, 0, 0] };
  const GEEN = [0, 0, 0, 0, 0, 0, 0, 0];
  const MAT = new THREE.ShaderMaterial({
    uniforms: Object.assign({
      fogDensity: { value: 0.00025 }, fogNear: { value: 1 }, fogFar: { value: 2000 }, fogColor: { value: new THREE.Color(0xffffff) },
      uDicht: { value: 0.9 }, uArmenExtra: { value: 0 }, uKleurA: { value: new THREE.Color() }, uKleurB: { value: new THREE.Color() }, uVul: { value: new THREE.Color() },
      uLicht: { value: new THREE.Vector3() }, uHelder: { value: 1 }, uFlits: { value: 0 }, uRandA: { value: 1 }, uRandB: { value: 0.7 },
    }, U),
    vertexShader: VERT, fragmentShader: FRAG, fog: true,
  });
  MAT.userData.doolhofHouden = true;  // de doolhof-kern gooit hem nooit weg: de shader blijft gecompileerd

  // --- muziek: één keer per beeld ---
  const G = { fn: -1, nu: 0, tc: 0, dein: 0, half: false, rust: 0, drop: 0, opb: 0, en: 0.8, dans: null, slag: 0, snel: false, stap: 0 };
  function stijlNaar(dans) {  // nieuwe stijl: wat nu (gemiddeld) te zien is wordt de oude, de nieuwe vloeit per persoon in
    const u = U.uSMix.value, a0 = U.uSA0.value, b0 = U.uSB0.value, a1 = U.uSA1.value, b1 = U.uSB1.value, v = STIJL[dans] || GEEN;
    a0.lerp(a1, u); b0.lerp(b1, u);
    a1.set(v[0], v[1], v[2], v[3]); b1.set(v[4], v[5], v[6], v[7]);
    U.uSMix.value = 0; G.dans = dans;
  }
  const klokNaar = (x, doel, dt) => { let f = doel - x; f -= Math.round(f); return x + f * (1 - Math.exp(-dt * 1.5)); };  // fase bijtrekken zonder sprong
  function globaal() {
    const fn = typeof frameNo !== 'undefined' ? frameNo : -2;
    if (fn === G.fn && fn !== -2) return;
    G.fn = fn;
    const nu = (typeof last !== 'undefined' ? last : performance.now()) / 1000, dt = klem(nu - (G.nu || nu), 0, 0.1);
    G.nu = nu;
    const F = window.clubPubliek && window.clubPubliek.forceer;
    const tb = typeof beatPos !== 'undefined' ? beatPos : nu * 2, per = typeof period !== 'undefined' && period > 0.2 ? period : 0.5;
    // tel zonder sprongen: de beat-volger trekt de fase bij, hier glijdt dat
    const tc0 = G.tc;
    if (Math.abs(tb - G.tc) > 1.5) G.tc = tb;
    else { G.tc += dt / per; G.tc += (tb - G.tc) * (1 - Math.exp(-dt * 10)); }
    const dtb = klem(G.tc - tc0, 0, 2);
    const DG = window.clubDansgevoel;
    if (F && F.half != null) G.half = !!F.half;
    else if (DG && DG.aan && typeof DG.half === 'boolean') G.half = DG.half;
    else if (!G.half && per < 0.475) G.half = true; else if (G.half && per > 0.485) G.half = false;
    G.dein += dtb * (G.half ? 0.5 : 1);
    let fout = (G.half ? G.tc * 0.5 : G.tc) - G.dein; fout -= Math.round(fout);  // dip op de (even) tel houden, zonder sprong
    G.dein += fout * (1 - Math.exp(-dt * 1.5));
    const R = window.clubRegie || {}, st = (F && F.stand) || R.stand || 'groove';
    const naar = (x, doel, v) => x + (doel - x) * Math.min(1, dt * v);
    G.rust = naar(G.rust, st === 'break' ? 1 : 0, 1.2);
    G.opb = naar(G.opb, st === 'opbouw' ? klem((R.opbouwTel || 0) / 16) : 0, 2);
    const sinds = tb - (R.dropBeat >= 0 ? R.dropBeat : -1e9), dropDoel = st === 'drop' ? (sinds < 32 || (F && F.stand) ? 1 : 0.55) : 0;
    G.drop = naar(G.drop, dropDoel, dropDoel > G.drop ? 8 : 0.6);
    G.en = naar(G.en, F && F.energie != null ? F.energie : typeof energy !== 'undefined' ? energy : 0.8, 2);
    // armen buiten de drop (die zit in uDrop): eind van de opbouw de eersten, hoge energie in de groove een paar; break: omlaag
    const armen = Math.max(G.opb > 0.5 ? (G.opb - 0.5) * 1.2 : 0, Math.max(0, G.en - 0.6)) * (1 - G.rust);
    // stijl: preset.dans uit club/stijl.js; pogo/headbang op de tel (boven ~150 BPM om de tel), skank-stappen op het hele tempo
    const CS = window.clubStijl, dans = (F && F.dans !== undefined) ? F.dans : CS && CS.preset && STIJL[CS.preset.dans] ? CS.preset.dans : null;
    if (dans !== G.dans) stijlNaar(dans);
    U.uSMix.value = Math.min(1, U.uSMix.value + dtb / 4);
    const bpm = 60 / per;
    if (!G.snel && bpm > 152) G.snel = true; else if (G.snel && bpm < 146) G.snel = false;
    const rS = G.snel ? 0.5 : 1, rT = bpm < 110 ? 2 : 1;
    G.slag = klokNaar(G.slag + dtb * rS, G.tc * rS, dt); G.stap = klokNaar(G.stap + dtb * rT, G.tc * rT, dt);
    U.uSlag.value = G.slag % 1024; U.uStap.value = G.stap % 1024;
    U.uDein.value = G.dein % 1024; U.uTel.value = G.tc % 1024; U.uTijd.value = nu % 1000;
    U.uRust.value = G.rust; U.uDrop.value = G.drop; U.uArmen.value = armen; U.uEnergie.value = G.en;
  }

  // --- plekken uit een vorm ---
  function plekkenUit(o, r) {
    const z = o.vorm, st = o.afstand || 0.62, uit = [], jit = () => (r() - 0.5) * st * 0.4;
    if (z.soort === 'kring') {
      const a0 = z.a0 || 0, a1 = z.a1 == null ? RONDE : z.a1;
      for (let rr = z.r0; rr <= z.r1 + 1e-3; rr += st) {
        const nr = Math.max(1, Math.floor((a1 - a0) * rr / st)), off = z.a1 == null ? r() * RONDE : 0;
        for (let i = 0; i < nr; i++) { const a = a0 + (a1 - a0) * (i + 0.5) / nr + off; uit.push({ x: z.c.x + Math.cos(a) * rr + jit(), z: z.c.z + Math.sin(a) * rr + jit() }); }
      }
    } else if (z.soort === 'rijen') {
      const [ux, uz] = z.u, vx = -uz, vz = ux;
      for (let dd = z.d0, rij = 0; dd <= z.d1 + 1e-3; dd += st * 1.05, rij++) {
        for (let l = -z.breed + (rij % 2) * st / 2; l <= z.breed + 1e-3; l += st) uit.push({ x: z.c.x + ux * dd + vx * l + jit(), z: z.c.z + uz * dd + vz * l + jit() });
      }
    } else if (z.soort === 'vlak') {
      for (let x = z.x0; x <= z.x1 + 1e-3; x += st) for (let zz = z.z0; zz <= z.z1 + 1e-3; zz += st) uit.push({ x: x + jit(), z: zz + jit() });
    }
    const vrij = o.vrij || (() => true);
    const goed = uit.filter(p => vrij(p.x, p.z));
    for (let i = goed.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = goed[i]; goed[i] = goed[j]; goed[j] = t; }
    return goed;
  }

  // --- een menigte maken ---
  const KLEDING = [[0.0, 0.0, 0.05], [0.0, 0.0, 0.03], [0.6, 0.5, 0.2], [0.98, 0.6, 0.22], [0.33, 0.45, 0.17], [0.1, 0.55, 0.25], [0.75, 0.45, 0.2], [0.55, 0.3, 0.13], [0.0, 0.0, 0.5], [0.08, 0.3, 0.22]];
  const kleurVan = x => x == null ? null : x.isColor ? x.clone() : new THREE.Color(x);
  function maak(parent, o) {
    o = o || {};
    const r = typeof o.rnd === 'function' ? o.rnd : Math.random;
    let lijst = o.plekken ? o.plekken.slice() : o.vorm ? plekkenUit(o, r) : [];
    const max = o.aantal != null ? Math.max(0, Math.round(o.vast ? o.aantal : o.aantal * factor())) : lijst.length;
    if (lijst.length > max) lijst.length = max;
    const n = lijst.length;
    if (!n || !parent) return null;
    const kijk = o.kijk || (o.vorm && o.vorm.c) || { x: 0, z: 0 };
    // geometrie: eigen attributen (de kern gooit hem weg met de kamer), de arrays zijn gedeeld
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(BASIS.pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(BASIS.nor, 3));
    geo.setAttribute('aV', new THREE.BufferAttribute(BASIS.aV, 3));
    geo.setAttribute('aVn', new THREE.BufferAttribute(BASIS.aVn, 3));
    geo.setAttribute('aB', new THREE.BufferAttribute(BASIS.aB, 3));
    geo.setAttribute('aBn', new THREE.BufferAttribute(BASIS.aBn, 3));
    geo.setAttribute('aInfo', new THREE.BufferAttribute(BASIS.info, 2));
    geo.setIndex(new THREE.BufferAttribute(BASIS.idx, 1));
    const iA = new Float32Array(n * 4), iB = new Float32Array(n * 4), iC = new Float32Array(n * 3);
    const mesh = new THREE.InstancedMesh(geo, MAT, n);
    mesh.name = 'clubPubliek';
    const schaal = o.schaal || 1, telAandeel = o.telefoons == null ? 0.12 : o.telefoons;
    const kleding = (o.kleuren && o.kleuren.kleding) || null;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pv = new THREE.Vector3(), sv = new THREE.Vector3(), c = new THREE.Color();
    const midden = new THREE.Vector3(), plekken = [];
    let nTel = 0;
    for (let i = 0; i < n; i++) {
      const p = lijst[i], y = p.y || 0;
      const face = p.face != null ? p.face : Math.atan2(kijk.x - p.x, kijk.z - p.z) + (r() - 0.5) * 0.5;
      const vrouw = r() < 0.45 ? 1 : 0, breed = r() < 0.22 ? 0.45 + 0.55 * r() : 0.2 * r();
      const s = schaal * (vrouw ? 0.93 + 0.08 * r() : 0.97 + 0.1 * r());
      m4.compose(pv.set(p.x, y, p.z), q.setFromEuler(e.set(0, face, 0)), sv.set(s, s, s));
      mesh.setMatrixAt(i, m4);
      midden.x += p.x; midden.y += y; midden.z += p.z;
      plekken.push({ x: p.x, y, z: p.z, face });
      const tel = r() < telAandeel ? 1 : 0; nTel += tel;
      const fase = r() < 0.15 ? 0.12 + 0.1 * r() : (r() - 0.5) * 0.12;  // de meesten op de tel, een paar wat later
      iA.set([fase, 0.12 + 0.88 * Math.pow(r(), 1.2), vrouw, breed], i * 4);
      iB.set([tel, r(), 0.2 + 0.78 * r(), r()], i * 4);
      if (kleding) c.copy(kleurVan(kleding[Math.floor(r() * kleding.length)]));
      else { const k = KLEDING[Math.floor(r() * KLEDING.length)]; c.setHSL((k[0] + (r() - 0.5) * 0.06 + 1) % 1, k[1], k[2] * (0.75 + 0.5 * r())); }
      iC.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('iA', new THREE.InstancedBufferAttribute(iA, 4));
    geo.setAttribute('iB', new THREE.InstancedBufferAttribute(iB, 4));
    geo.setAttribute('iC', new THREE.InstancedBufferAttribute(iC, 3));
    // omhullende bol over alle plekken (anders snoeit three op het bolletje van één pop)
    midden.divideScalar(n);
    let straal = 0;
    for (const p of plekken) straal = Math.max(straal, Math.hypot(p.x - midden.x, p.y - midden.y, p.z - midden.z));
    midden.y += 1.0;
    geo.boundingSphere = new THREE.Sphere(midden, straal + 1.6 * schaal);
    mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    parent.add(mesh);

    // handvat: kleuren en lichtniveau van de kamer; de rand klopt vanzelf mee op de pulse
    const P = o.kleuren || {};
    const H = {
      mesh, n, plekken, telefoons: nTel, driehoeken: n * BASIS.tris,
      a: kleurVan(P.a) || new THREE.Color(0xff3a7a), b: kleurVan(P.b) || new THREE.Color(0x3a8cff), vul: kleurVan(P.vul) || new THREE.Color(0x0c0a10),
      licht: new THREE.Vector3(o.licht ? o.licht.x : kijk.x, o.licht && o.licht.y != null ? o.licht.y : 3, o.licht ? o.licht.z : kijk.z),
      helder: 1, flits: 0, armen: 0, rand: 1, dicht: o.dicht == null ? 0.9 : o.dicht,
      zet(w) {
        if (!w) return H;
        for (const k of ['a', 'b', 'vul']) if (w[k] != null) { if (w[k].isColor) H[k].copy(w[k]); else H[k].set(w[k]); }
        for (const k of ['helder', 'flits', 'armen', 'rand', 'dicht']) if (w[k] != null) H[k] = w[k];
        if (w.licht) H.licht.set(w.licht.x, w.licht.y, w.licht.z);
        return H;
      },
      opruimen() { if (mesh.parent) mesh.parent.remove(mesh); geo.dispose(); },
    };
    const lw = new THREE.Vector3(), vul = new THREE.Color();
    mesh.onBeforeRender = function () {
      globaal();
      const u = MAT.uniforms, pu = typeof pulse !== 'undefined' ? pulse : 0;
      u.uKleurA.value.copy(H.a); u.uKleurB.value.copy(H.b);
      u.uVul.value.copy(vul.copy(H.vul).multiplyScalar(0.6).addScalar(0.035));
      u.uLicht.value.copy(lw.copy(H.licht).applyMatrix4(mesh.parent ? mesh.parent.matrixWorld : mesh.matrixWorld));
      u.uHelder.value = H.helder; u.uFlits.value = H.flits; u.uArmenExtra.value = H.armen; u.uDicht.value = H.dicht;
      u.uRandA.value = H.rand * (0.85 + 0.55 * pu); u.uRandB.value = H.rand * (0.55 + 0.25 * pu);
      MAT.uniformsNeedUpdate = true;  // gedeeld materiaal: per menigte de eigen waarden opnieuw doorgeven (mist zet de renderer zelf)
    };
    geo.addEventListener('dispose', () => mesh.dispose());  // ook als de kern de kamer opruimt: de instantiebuffers mee weg
    return H;
  }

  // shader meteen bij het laden compileren (ANGLE/D3D: ~0,1 s; het eerste beeld moet dan nog komen) i.p.v. bij de eerste
  // doolhofkamer midden in de show. Het materiaal houdt zijn programma daarna (geen lampen: lichtwissels compileren niet opnieuw).
  try {
    if (typeof renderer !== 'undefined' && typeof scene !== 'undefined' && typeof camera !== 'undefined') {
      const sc = new THREE.Scene(), g = new THREE.Group(); sc.fog = scene.fog; sc.add(g);
      const h = maak(g, { plekken: [{ x: 0, z: -4 }], vast: true });
      h.mesh.frustumCulled = false;  // altijd tekenen, waar de camera bij het laden ook staat
      const rt = new THREE.WebGLRenderTarget(1, 1), oud = renderer.getRenderTarget();
      renderer.setRenderTarget(rt); renderer.render(sc, camera); renderer.setRenderTarget(oud);
      h.opruimen(); rt.dispose();
    }
  } catch (e) { console.warn('clubPubliek: voorcompileren mislukt', e); }

  Object.assign(window.clubPubliek || (window.clubPubliek = {}), { maak, aantal: n => Math.round(n * factor()), materiaal: MAT, driehoeken: BASIS.tris, forceer: null });
})();

// --- Burning Man in de buitenkamers: elke keer een ander gigantisch houten kunstwerk dat afbrandt (doolhof.brand) ---
// Kunstwerken uit Blender (deel/blender/brand.py -> models/buiten-brand.glb, ~2 MB): man, tempel, uil, walvis, raket, schedel, feniks,
// octopus (14-27 m hoog, vierkante balken). Vertexkleur = masker: R = toeval per balk, G = brandvolgorde (onder eerst), B = neonlijn.
// Verloop: eerst staat het te gloeien met neonlijnen (pulseren op de tel); op de drop (of na ~24 s) gaat het in de fik: het vuur kruipt
// van onder naar boven, balken gloeien oranje, verkolen en storten in (in de vertex-shader: wat doorgebrand is valt naar de grond en
// kantelt), vlammen en vonken (instanced billboards, alle beweging in de shader), elke drop een vuurbal en een sprong in de brand, een
// oranje lamp (ctx.licht) die met het vuur flakkert en het publiek aanlicht. Nooit twee keer hetzelfde kunstwerk achter elkaar.
// API: doolhof.brand.klaar, .namen, .plaats(ctx, groep, { x, z, ry, schaal, naam? }) -> { naam, update(dt), ontsteek(), opruimen() }
//   of null (model nog niet binnen). De kamer roept update(dt) aan in haar eigen update en opruimen() in opruimen().
// Test: doolhof.brand.volgende = 'uil' (zet het volgende kunstwerk vast), doolhof.brand.snel = true (brandt in ~10 s af).
(function () {
  'use strict';
  const doolhof = window.doolhof = window.doolhof || {};
  if (typeof THREE === 'undefined' || typeof clubHooks === 'undefined') return;
  const houd = x => { (x.userData = x.userData || {}).doolhofHouden = true; return x; };
  const GEO = {}, PUNTEN = {};
  const BR = doolhof.brand = { klaar: false, namen: [], volgende: null, snel: false };

  // ---------- shaders ----------
  const PAL = `vec3 vuur(float t) { t = clamp(t, 0.0, 1.0); return t < 0.35 ? mix(vec3(0.5, 0.03, 0.0), vec3(1.0, 0.25, 0.02), t / 0.35) : t < 0.7 ? mix(vec3(1.0, 0.25, 0.02), vec3(1.0, 0.65, 0.12), (t - 0.35) / 0.35) : mix(vec3(1.0, 0.65, 0.12), vec3(1.0, 0.95, 0.75), (t - 0.7) / 0.3); }
float h11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
`;
  // instorten: wat doorgebrand is (prog voorbij G + 0,3) zakt naar de grond, schuift opzij en kantelt
  const VAL = `vec3 val(vec3 p, float G, float R, float prog) {
  // per balk als geheel (R is per balk gelijk): na 55% brand valt de ene na de andere balk, ligt dan plat in de as (zelfde hoogte voor
  // beide uiteinden) en schuift wat opzij
  float weg = smoothstep(0.5 + 0.38 * R, 0.62 + 0.38 * R, prog);
  float ry = p.y;
  p.y = mix(p.y, 0.15 + 0.5 * R + 0.04 * ry, weg);
  p.x += weg * (R - 0.5) * (2.0 + ry * 0.35);
  p.z += weg * (fract(R * 7.31) - 0.5) * (2.0 + ry * 0.35);
  return p;
}
`;
  const STR_V = `
uniform float uProg, uTijd;
varying vec3 vM; varying float vY, vWeg;
${VAL}
void main() {
  vM = vec3(color.r, color.g, color.b);
  vec3 p = val(position, vM.g, vM.r, uProg);
  vY = position.y; vWeg = smoothstep(0.5 + 0.38 * vM.r, 0.62 + 0.38 * vM.r, uProg);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
  const STR_F = `
uniform float uProg, uTijd, uPuls, uBurst, uDim, uFlits;
uniform vec3 uA, uB;
varying vec3 vM; varying float vY, vWeg;
${PAL}
void main() {
  float R = vM.r, G = vM.g, N = vM.b;
  float aan = smoothstep(G - 0.02, G + 0.05, uProg);                 // dit stuk brandt
  float flik = 0.6 + 0.4 * sin(uTijd * (9.0 + 7.0 * R) + vY * 3.0 + R * 40.0) * sin(uTijd * 5.3 + R * 17.0);
  vec3 hout = vec3(0.07, 0.04, 0.02) * (0.6 + 0.7 * R) + vec3(0.25, 0.1, 0.02) * 0.15 * uProg;
  vec3 neon = mix(uA, uB, 0.5 + 0.5 * sin(vY * 0.3 - uTijd * 1.5)) * N * (1.0 - aan) * (0.6 + 0.9 * uPuls);
  vec3 gloed = vuur(0.45 + 0.5 * flik) * aan * (1.0 - vWeg * 0.75) * (0.9 + 0.8 * uBurst);
  vec3 kool = vuur(0.3) * 0.35 * vWeg * step(0.62, fract(vY * 2.7 + R * 9.0)) * (0.5 + 0.5 * flik);  // gloeiende scheuren in de as
  vec3 c = hout * (1.0 - aan * 0.85) + neon + gloed + kool;
  c *= uDim;
  c += vec3(uFlits) * 0.3;
  gl_FragColor = vec4(c, 1.0);
}`;
  // vlammen en vonken: instanced billboards; aP = plek op het bouwsel (model), aI = (G, toeval, maat, soort 0 vlam / 1 vonk / 2 vuurbal)
  const VL_V = `
attribute vec3 aP;
attribute vec4 aI;
uniform float uProg, uTijd, uBurst, uSchaal;
varying vec2 vUv; varying float vA, vT, vSoort;
${PAL}
${VAL}
void main() {
  float G = aI.x, R = aI.y, maat = aI.z, soort = aI.w;
  float aan = smoothstep(G - 0.01, G + 0.04, uProg) * (1.0 - smoothstep(1.0, 1.3, uProg));
  vec3 basis = val(aP, G, R, uProg);
  float snel = soort < 0.5 ? 0.9 + 0.8 * R : soort < 1.5 ? 0.18 + 0.2 * R : 0.6;
  float t = fract(uTijd * snel + R * 13.7 + aP.x * 0.37 + aP.y * 0.21 + aP.z * 0.53);
  vec3 c = basis;
  float s = maat * uSchaal;
  if (soort < 0.5) {            // vlam: stijgt 1-3 m, krimpt, flakkert
    float groei = 1.0 + 1.8 * smoothstep(0.15, 0.7, uProg);  // hoe verder de brand, hoe hoger de vlammen (alles in lichterlaaie)
    c.y += t * (1.2 + 2.0 * R) * groei * (1.0 + uBurst);
    c.x += 0.25 * sin(uTijd * 3.0 + R * 20.0) * t * groei;
    s *= (1.0 - t * 0.7) * (0.8 + 0.6 * uBurst) * groei;
    vA = aan * (1.0 - t) * smoothstep(0.0, 0.1, t);
  } else if (soort < 1.5) {     // vonk: hoog de lucht in, draait mee met de wind
    c.y += t * (14.0 + 10.0 * R);
    c.x += sin(t * 6.0 + R * 40.0) * 2.0 * t + t * 3.0;
    c.z += cos(t * 5.0 + R * 30.0) * 2.0 * t;
    vA = aan * (1.0 - t) * (0.6 + 0.4 * sin(uTijd * 20.0 + R * 50.0));
  } else {                      // vuurbal op de drop
    c.y += 3.0 + uBurst * 6.0 * (1.0 - uBurst * 0.3);
    s *= 0.3 + 1.6 * uBurst;
    vA = uBurst * step(0.02, uProg);
  }
  vT = t; vSoort = soort; vUv = position.xy;
  vec4 mv = modelViewMatrix * vec4(c, 1.0);
  mv.xy += position.xy * s;     // billboard in kijkruimte
  gl_Position = projectionMatrix * mv;
  if (vA < 0.003) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);  // weg (buiten beeld)
}`;
  const VL_F = `
uniform float uTijd, uDim;
varying vec2 vUv; varying float vA, vT, vSoort;
${PAL}
void main() {
  vec2 q = vUv * 2.0;
  float d;
  if (vSoort < 0.5) { q.y += 0.35; d = length(vec2(q.x * (1.3 + q.y * 0.6), q.y * 0.75)); }   // druppelvorm, punt omhoog
  else d = length(q);
  float a = (1.0 - smoothstep(0.0, 1.0, d)) * vA;  // (smoothstep met omgekeerde grenzen is ongedefinieerd: op ANGLE 0)
  if (a < 0.004) discard;
  vec3 c = vSoort < 0.5 ? vuur(1.0 - d * 0.8 - vT * 0.5) : vSoort < 1.5 ? vuur(0.85) * 1.4 : vuur(1.0 - d * 0.7) * 1.3;
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
        const geo = o.geometry.clone(); geo.applyMatrix4(o.matrixWorld); geo.computeBoundingSphere();
        GEO[o.name] = houd(geo);
        // punten voor vlammen/vonken: elk 3e hoekpunt (balkuiteinden), met hun brandvolgorde
        const p = geo.attributes.position, c = geo.attributes.color, uit = [];
        // COLOR_0 komt als genormaliseerde uint16 binnen: de gpu deelt zelf, getX/getY in r128 niet
        const nm = c && c.normalized ? (c.array instanceof Uint16Array ? 65535 : c.array instanceof Uint8Array ? 255 : 1) : 1;
        for (let i = 0; i < p.count; i += 3) uit.push([p.getX(i), p.getY(i), p.getZ(i), c ? c.getY(i) / nm : p.getY(i) / 25, c ? c.getX(i) / nm : Math.random()]);
        PUNTEN[o.name] = uit;
      });
      BR.namen = Object.keys(GEO);
      BR.klaar = true;
    }, undefined, err => console.warn('buiten-brand niet geladen', err));
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', laden); else laden();

  // kaartspel: elke keer een ander kunstwerk, nooit twee keer hetzelfde achter elkaar
  let stapel = [], vorige = null;
  function kies() {
    if (BR.volgende && GEO[BR.volgende]) { const n = BR.volgende; BR.volgende = null; return n; }
    if (!stapel.length) { stapel = BR.namen.slice(); for (let i = stapel.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [stapel[i], stapel[j]] = [stapel[j], stapel[i]]; } if (stapel[0] === vorige && stapel.length > 1) stapel.push(stapel.shift()); }
    return (vorige = stapel.shift());
  }

  const VLAK = houd(new THREE.PlaneGeometry(1, 1));
  BR.plaats = function (ctx, groep, o) {
    o = o || {};
    if (!BR.klaar) return null;
    const naam = o.naam && GEO[o.naam] ? o.naam : kies(), geo = GEO[naam], zwaar = ctx && ctx.zwaar != null ? ctx.zwaar : 0;
    const g = new THREE.Group(); g.name = 'brand-' + naam;
    g.position.set(o.x || 0, 0, o.z || 0); g.rotation.y = o.ry || 0; g.scale.setScalar(o.schaal || 1);
    groep.add(g);
    const eigen = { uProg: { value: 0 }, uBurst: { value: 0 }, uSchaal: { value: o.schaal || 1 } };
    const sMat = new THREE.ShaderMaterial({ uniforms: Object.assign({}, U, eigen), vertexShader: STR_V, fragmentShader: STR_F, vertexColors: true, side: THREE.DoubleSide });
    const bouwsel = new THREE.Mesh(geo, sMat); bouwsel.frustumCulled = false; g.add(bouwsel);
    // vlammen, vonken en vuurballen in één instanced draw
    const pnt = PUNTEN[naam], nV = [620, 380, 180][zwaar] || 180, nS = [420, 240, 100][zwaar] || 100, nB = 6, n = nV + nS + nB;
    const ig = new THREE.InstancedBufferGeometry();
    ig.index = VLAK.index; ig.setAttribute('position', VLAK.attributes.position);
    const aP = new Float32Array(n * 3), aI = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const soort = i < nV ? 0 : i < nV + nS ? 1 : 2, q = pnt[Math.floor(Math.random() * pnt.length)];
      if (soort === 2) { aP.set([0, (geo.boundingSphere.center.y || 8), 0], i * 3); aI.set([0, Math.random(), 7 + Math.random() * 5, 2], i * 4); continue; }
      aP.set([q[0], q[1], q[2]], i * 3);
      const groot = soort === 0 && i % 6 === 0 && q[1] < 7;  // elke 6e vlam laag aan het bouwsel: een grote
      aI.set([q[3], q[4], soort === 0 ? (groot ? 3 + Math.random() * 3 : 0.9 + Math.random() * 1.3) : 0.08 + Math.random() * 0.1, soort], i * 4);  // R van de balk: vlammen vallen mee
    }
    ig.setAttribute('aP', new THREE.InstancedBufferAttribute(aP, 3));
    ig.setAttribute('aI', new THREE.InstancedBufferAttribute(aI, 4));
    ig.instanceCount = n;
    const vMat = new THREE.ShaderMaterial({ uniforms: Object.assign({}, U, eigen), vertexShader: VL_V, fragmentShader: VL_F, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const vlammen = new THREE.Mesh(ig, vMat); vlammen.frustumCulled = false; vlammen.renderOrder = 5; g.add(vlammen);
    // lamp: oranje, flakkert met het vuur (één van de lamp-handvatten van de kamer; geen handvat over = geen lamp)
    const hoogte = geo.boundingSphere.center.y * 2;
    const lamp = ctx && ctx.licht ? ctx.licht(0xff7a20, 0, 45, g.position.x, Math.min(8, hoogte * 0.4), g.position.z) : null;
    const T = { aan: false, t: 0, prog: 0, burst: 0, dropGezien: window.clubRegie ? clubRegie.dropBeat : null };
    const H = {
      naam, groep: g,
      ontsteek() { if (!T.aan) { T.aan = true; T.burst = 1; } },
      update(dt) {
        dt = Math.min(dt || 0, 0.1);
        const sh = doolhof.show || {}, R = window.clubRegie;
        T.t += dt;
        const nieuweDrop = R && R.dropBeat !== T.dropGezien && sh.stand === 'drop';
        if (nieuweDrop) T.dropGezien = R.dropBeat;
        if (!T.aan && ((nieuweDrop && T.t > 2) || T.t > (BR.snel ? 2 : 24))) H.ontsteek();
        if (T.aan) {
          const snelheid = (BR.snel ? 1 / 10 : 1 / 42) * (1 + 0.8 * (sh.stand === 'opbouw' ? sh.opbouw || 0 : 0) + (sh.stand === 'drop' ? 0.4 : 0) - (sh.stand === 'break' ? 0.4 : 0));
          T.prog = Math.min(1.35, T.prog + dt * snelheid);
          if (nieuweDrop) { T.prog = Math.min(1.35, T.prog + 0.06); T.burst = 1; }
        }
        T.burst *= Math.exp(-dt * 2.2);
        eigen.uProg.value = T.prog; eigen.uBurst.value = T.burst;
        if (lamp) {
          const vuur = T.aan ? Math.min(1, T.prog * 3) * (1 - Math.max(0, T.prog - 1) * 2) : 0;
          lamp.intensity = Math.max(0, (vuur * (3.5 + 2.5 * Math.sin(T.t * 11) * Math.sin(T.t * 7.3)) + 5 * T.burst) * (1 - 0.6 * (sh.blackout || 0)));
        }
      },
      opruimen() {
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

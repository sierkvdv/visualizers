// --- Flora en spullen voor de buitenkamers, gemaakt in Blender (deel/blender/buiten.py -> models/buiten-flora.glb, ~0,5 MB) ---
// 20 modellen: palm_1..3, varen_1..2, monstera_1..2, paddo_1..3, rots_1..4, bloem_1..2, drijfhout_1, tiki_1, surfplank_1..2 (meters).
// De vertexkleur is een masker, geen kleur: R = basistint, G = gloeimasker (nerven, stippen, kristaladers, tiki-ogen, strepen),
// B = variatie. Eén gedeelde shader (per soort alleen andere uniforms): donkere basis met een rand van tegenlicht in het palet en
// gloeiende delen die op de tel oplichten en door het palet draaien; planten wiegen in de wind (in de vertex-shader, per exemplaar
// een eigen fase). Werkt op een ledscherm: donker met fel bewegend licht, niets grijs en stil.
// API: doolhof.flora.klaar (bool), .namen, .geo(naam), .hoogte(naam),
//   .plant(groep, naam, plekken [{x, y?, z, s?, ry?, tint?}], opts { soort: 'plant'|'paddo'|'rots'|'hout'|'tiki'|'plank', wind, gloei, palet: [a,b,c] })
//     -> InstancedMesh (één draw) of null als het model (nog) niet geladen is. Schaal s = factor op de modelmaat.
//   .zet(palet) zet het palet van alle flora (de kamers doen dat bij het bouwen; de show schuift er in de drop iets naartoe).
// Test: doolhof.flora.namen, doolhof.flora.klaar.
(function () {
  'use strict';
  const doolhof = window.doolhof = window.doolhof || {};
  if (typeof THREE === 'undefined' || typeof clubHooks === 'undefined') return;
  const houd = x => { (x.userData = x.userData || {}).doolhofHouden = true; return x; };
  const GEO = {}, HOOGTE = {};
  const F = doolhof.flora = { klaar: false, namen: [], geo: n => GEO[n] || null, hoogte: n => HOOGTE[n] || 1 };

  const U = {  // gedeelde uniforms (één update per beeld)
    uTijd: { value: 0 }, uPuls: { value: 0 }, uBas: { value: 0 }, uHoog: { value: 0 }, uDim: { value: 1 }, uFlits: { value: 0 }, uDrop: { value: 0 },
    uA: { value: new THREE.Color(0xff2bd6) }, uB: { value: new THREE.Color(0x20f0ff) }, uC: { value: new THREE.Color(0x7dff2b) },
  };
  const VERT = `
uniform float uTijd, uBas, uWind, uHoogte;
varying vec3 vMasker, vN, vV, vW;
varying float vFase;
void main() {
  vec3 p = position;
  float fase = 0.0;
#ifdef USE_INSTANCING
  fase = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.61;
#endif
  // wind: hoe hoger in het model, hoe meer het wiegt (stam/steel staat vast); op de bas een extra zwiep
  float h = clamp(p.y / uHoogte, 0.0, 1.0), k = h * h * uWind;
  p.x += k * (0.35 * sin(uTijd * 0.9 + fase) + 0.12 * sin(uTijd * 2.3 + fase * 1.7) + 0.25 * uBas * sin(uTijd * 6.0 + fase));
  p.z += k * (0.25 * cos(uTijd * 0.7 + fase * 1.3) + 0.1 * sin(uTijd * 2.9 + fase));
  vec4 w = vec4(p, 1.0);
#ifdef USE_INSTANCING
  w = instanceMatrix * w;
  vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
#else
  vN = normalize(mat3(modelMatrix) * normal);
#endif
  w = modelMatrix * w;
  vW = w.xyz; vV = cameraPosition - w.xyz;
  vMasker = vec3(color.r, color.g, color.b); vFase = fase;  // (COLOR_0 uit Blender is RGBA: dan is color een vec4)
#ifdef USE_INSTANCING_COLOR
  vMasker.b = fract(vMasker.b + instanceColor.r);
#endif
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
  const FRAG = `
uniform float uTijd, uPuls, uHoog, uDim, uFlits, uDrop, uGloei, uRand, uDonker;
uniform vec3 uA, uB, uC;
varying vec3 vMasker, vN, vV, vW;
varying float vFase;
vec3 pal(float t) { t = fract(t) * 3.0; return t < 1.0 ? mix(uA, uB, t) : t < 2.0 ? mix(uB, uC, t - 1.0) : mix(uC, uA, t - 2.0); }
void main() {
  vec3 n = normalize(vN), v = normalize(vV);
  float ndv = abs(dot(n, v)), rand = pow(1.0 - ndv, 2.2);
  float R = vMasker.r, G = vMasker.g, B = vMasker.b;
  // basis: bijna zwart met een zweem van het palet (anders grijs), licht van boven
  vec3 c = pal(B * 0.6 + 0.1) * (0.02 + 0.05 * R) * uDonker * (0.6 + 0.4 * max(n.y, 0.0));
  // tegenlicht-rand in het palet: het silhouet tekent op het ledscherm
  c += mix(uA, uB, 0.5 + 0.5 * sin(vW.y * 0.4 + uTijd * 0.3)) * rand * uRand * (0.55 + 0.6 * uPuls);
  // gloeimasker: licht op de tel, kleur draait door het palet, een golf loopt omhoog; de drop maakt alles feller
  float golf = 0.55 + 0.45 * sin(vW.y * 1.7 - uTijd * 3.0 + vFase);
  c += pal(B + uTijd * 0.05 + vFase * 0.1) * G * uGloei * (0.35 + 1.1 * uPuls + 0.5 * uHoog) * golf * (1.0 + 0.8 * uDrop);
  c *= uDim;
  c += vec3(uFlits) * (0.15 + 0.6 * G);
  gl_FragColor = vec4(c, 1.0);
}`;
  const SOORT = {  // wind, gloei, rand, donker
    plant: [0.35, 1.0, 0.9, 1.0], paddo: [0.06, 1.3, 0.7, 1.4], rots: [0, 1.6, 0.5, 0.9], hout: [0, 0.4, 0.6, 1.4], tiki: [0, 2.0, 0.6, 1.5], plank: [0, 1.4, 0.5, 2.5],
  };
  const MAT = {};
  function mat(soort, hoogte) {
    const k = soort + ':' + hoogte.toFixed(2);
    if (MAT[k]) return MAT[k];
    const s = SOORT[soort] || SOORT.plant;
    const m = new THREE.ShaderMaterial({
      uniforms: Object.assign({}, U, { uWind: { value: s[0] }, uGloei: { value: s[1] }, uRand: { value: s[2] }, uDonker: { value: s[3] }, uHoogte: { value: hoogte } }),
      vertexShader: VERT, fragmentShader: FRAG, vertexColors: true, side: THREE.DoubleSide,
    });
    m.userData.flora = soort;
    return (MAT[k] = houd(m));
  }
  const soortVan = n => /^palm|^varen|^monstera|^bloem/.test(n) ? 'plant' : /^paddo/.test(n) ? 'paddo' : /^rots/.test(n) ? 'rots' : /^tiki/.test(n) ? 'tiki' : /^surf/.test(n) ? 'plank' : 'hout';

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pv = new THREE.Vector3(), sv = new THREE.Vector3(), kl = new THREE.Color();
  F.plant = function (groep, naam, plekken, o) {
    o = o || {};
    const g = GEO[naam];
    if (!g || !plekken || !plekken.length) return null;
    const soort = o.soort || soortVan(naam), m = mat(soort, HOOGTE[naam]);
    if (o.wind != null || o.gloei != null) {  // eigen instelling: eigen materiaal (zelfde programma)
      const eigen = m.clone(); eigen.uniforms = Object.assign({}, m.uniforms, { uWind: { value: o.wind != null ? o.wind : m.uniforms.uWind.value }, uGloei: { value: o.gloei != null ? o.gloei : m.uniforms.uGloei.value } });
      eigen.userData.eigen = true;
      return zet(groep, g, eigen, plekken);
    }
    return zet(groep, g, m, plekken);
  };
  function zet(groep, g, m, plekken) {
    const im = new THREE.InstancedMesh(g, m, plekken.length);
    plekken.forEach((p, i) => {
      const s = p.s || 1;
      m4.compose(pv.set(p.x, p.y || 0, p.z), q.setFromEuler(e.set(0, p.ry != null ? p.ry : (i * 2.39996) % (Math.PI * 2), 0)), sv.set(s, s, s));
      im.setMatrixAt(i, m4);
      im.setColorAt(i, kl.setRGB(p.tint != null ? p.tint : ((i * 0.618) % 1), 0, 0));
    });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.frustumCulled = false; im.castShadow = false; im.receiveShadow = false;
    im.name = 'flora';
    groep.add(im);
    return im;
  }
  F.zet = function (palet) {
    if (!palet) return;
    if (palet[0] != null) U.uA.value.set(palet[0]);
    if (palet[1] != null) U.uB.value.set(palet[1]);
    if (palet[2] != null) U.uC.value.set(palet[2]);
  };

  // laden (los van de figuren-teller: de buitenkamers komen pas veel later)
  const laden = () => {
    const L = typeof gltf !== 'undefined' && gltf && gltf.load ? gltf : (THREE.GLTFLoader ? new THREE.GLTFLoader() : null);
    if (!L) return;
    L.load('models/buiten-flora.glb', g => {
      g.scene.updateMatrixWorld(true);
      g.scene.traverse(o => {
        if (!o.isMesh) return;
        const geo = o.geometry.clone();
        geo.applyMatrix4(o.matrixWorld);
        geo.computeBoundingBox();
        HOOGTE[o.name] = Math.max(0.2, geo.boundingBox.max.y);
        if (!geo.attributes.color) { const n = geo.attributes.position.count; geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(0.5), 3)); }
        GEO[o.name] = houd(geo);
      });
      F.namen = Object.keys(GEO);
      F.klaar = true;
    }, undefined, err => console.warn('buiten-flora niet geladen', err));
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', laden); else laden();

  // elk beeld: tijd en muziek (show-bus van het doolhof)
  clubHooks.push(dt => {
    const sh = doolhof.show, b = typeof beatPos === 'number' ? beatPos : 0;
    U.uTijd.value = (performance.now() / 1000) % 1000;
    U.uPuls.value = typeof pulse === 'number' ? pulse : 0;
    if (typeof bands !== 'undefined') { U.uBas.value = bands[0].v; U.uHoog.value = bands[2].v; }
    U.uDim.value = sh ? 1 - 0.7 * (sh.blackout || 0) : 1;
    U.uFlits.value = sh ? sh.flits || 0 : 0;
    U.uDrop.value = sh ? sh.drop || 0 : 0;
    void dt; void b;
  });
})();

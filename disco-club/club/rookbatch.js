// Rook in één of een paar draws per pass i.p.v. één per wolkje (club/optimaliseer.js kwam door de glaasjes en plassen op ~20 per pass).
// Alle rookwolkjes die als losse THREE.Sprite met een van de drie smokeTex direct in de scène hangen (hangende wolken `puffs`, rookmachines
// `fogPool` + de groene boer van de slak, sigarettenpluimpjes, CO2-jets van lichtregie.js, barman, gang naar zaal 2) blijven gewoon bestaan:
// de kern en de uitbreidingen zetten plek, schaal, kleur, draaiing en zichtbaarheid zoals altijd. Ze staan alleen op geen enkele layer
// (layers.mask 0, dat raakt niemand anders aan), zodat geen camera ze nog tekent. Vóór de eerste render van elk beeld leest één mesh hun
// toestand (alleen de zichtbare) in een instance-buffer (één upload per beeld) en tekent ze met dezelfde sprite-wiskunde: billboard,
// schaal x/y, draaiing, kleur x textuur, opacity, mist, additief zonder dieptes te schrijven. Dus ook in spiegel en bol zoals voorheen.
// Volgorde: optellen is volgorde-vrij. Alleen grote doorzichtige lagen die niet additief mengen in hetzelfde renderOrder-blok (de plassen
// van rommel.js, r ~11 m) hingen ervan af: wolkjes verder weg dan zo'n laag kwamen ervóór. Daarom per pass vóór elke grote laag een draw
// met alleen de wolkjes met z (zoals three sorteert) voorbij die laag (de vertex-shader gooit de rest weg) en één aan het eind van het
// blok; zonder grote laag één draw. Kleine (glaasjes, r < 1 m) tellen niet mee: hooguit een paar pixels.
// Vergelijken: ?rook=0 = uit; console: clubRook.schakel(false/true) (A/B in dezelfde toestand), clubRook.info().
(function () {
  'use strict';
  if (typeof scene === 'undefined' || typeof renderer === 'undefined' || typeof smokeTex === 'undefined' || !Array.isArray(smokeTex) || smokeTex.length !== 3) return;
  if (/[?&]rook=0(&|$)/.test(location.search)) { window.clubRook = { aan: false }; return; }
  const caps = renderer.capabilities, T = smokeTex, ADD = THREE.AdditiveBlending;
  if (!(caps.isWebGL2 || renderer.extensions.get('ANGLE_instanced_arrays')) || renderer.clippingPlanes.length) return;
  // de sprite-shader leest de textuur zonder uv-verschuiving en zonder omrekening (lineair); anders niet overnemen
  if (!T.every(t => t && t.isTexture && t.encoding === THREE.LinearEncoding && t.offset.x === 0 && t.offset.y === 0 && t.repeat.x === 1 && t.repeat.y === 1 && t.rotation === 0)) return;
  const P3 = THREE.Object3D.prototype, PM = THREE.Material.prototype, SPRITE_GEO = new THREE.Sprite().geometry;
  const CAP = 1024, ST = 12, MAXSEP = 3, BIG = 1e30, GROOT = 1, EPS = 1e-5;  // EPS: marge op z (gpu rekent in float32) bij het overslaan van lege stukken
  const tel = { leden: 0, getekend: 0, draws: 0, passes: 0, verzamelMs: 0, sorteerMs: 0, beelden: 0, los: 0 };
  let foutGemeld = false;
  const fout = e => { if (!foutGemeld) { foutGemeld = true; console.error('rookbatch', e); } };

  // ---------- shader: de sprite-shader van three r128 (sprite_vert/sprite_frag), maar per instance ----------
  const VS = `
    attribute vec4 iPos;  // xyz = plek, w = draaiing
    attribute vec4 iScl;  // xy = schaal, z = welke textuur (0..2)
    attribute vec4 iCol;  // rgb = kleur, a = opacity
    uniform float uLo, uHi;  // alleen wolkjes met z (na projectie, zoals three sorteert) in (uLo, uHi]
    varying vec2 vUv; varying vec4 vCol; varying float vTex;
    #include <common>
    #include <fog_pars_vertex>
    #include <logdepthbuf_pars_vertex>
    void main() {
      vUv = uv; vCol = iCol; vTex = iScl.z;
      vec4 mvPosition = viewMatrix * vec4( iPos.xyz, 1.0 );
      vec4 c = projectionMatrix * mvPosition;
      float zc = c.z / c.w;
      vec2 alignedPosition = position.xy * iScl.xy;
      vec2 rotatedPosition;
      rotatedPosition.x = cos( iPos.w ) * alignedPosition.x - sin( iPos.w ) * alignedPosition.y;
      rotatedPosition.y = sin( iPos.w ) * alignedPosition.x + cos( iPos.w ) * alignedPosition.y;
      mvPosition.xy += rotatedPosition;
      gl_Position = projectionMatrix * mvPosition;
      #include <logdepthbuf_vertex>
      #include <fog_vertex>
      if ( !( zc > uLo && zc <= uHi ) ) gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );  // hoort bij een ander stuk: buiten beeld
    }`;
  // textuur kiezen met een sprong: vTex is per wolkje gelijk, dus de afgeleiden (mipmaps) kloppen; op de mac maar één textuurlezing
  const FS = `
    uniform sampler2D map0, map1, map2;
    varying vec2 vUv; varying vec4 vCol; varying float vTex;
    #include <common>
    #include <fog_pars_fragment>
    #include <logdepthbuf_pars_fragment>
    void main() {
      vec4 diffuseColor = vCol;
      #include <logdepthbuf_fragment>
      vec4 texelColor;
      if ( vTex < 0.5 ) texelColor = texture2D( map0, vUv );
      else if ( vTex < 1.5 ) texelColor = texture2D( map1, vUv );
      else texelColor = texture2D( map2, vUv );
      diffuseColor *= texelColor;
      gl_FragColor = diffuseColor;
      #include <tonemapping_fragment>
      #include <encodings_fragment>
      #include <fog_fragment>
    }`;
  function maakMat() {
    const u = THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);  // eerst samenvoegen: merge kloont texturen
    u.map0 = { value: T[0] }; u.map1 = { value: T[1] }; u.map2 = { value: T[2] };
    u.uLo = { value: -BIG }; u.uHi = { value: BIG };
    return new THREE.ShaderMaterial({ uniforms: u, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, blending: ADD, fog: true });
  }

  // ---------- instance-buffer en de mesh ----------
  const data = new Float32Array(CAP * ST);
  const buf = new THREE.InstancedInterleavedBuffer(data, ST, 1).setUsage(THREE.DynamicDrawUsage);
  const geo = new THREE.InstancedBufferGeometry();
  geo.setIndex([0, 1, 2, 0, 2, 3]);  // zelfde vlakje als de sprite-geometrie van three
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geo.setAttribute('iPos', new THREE.InterleavedBufferAttribute(buf, 4, 0));
  geo.setAttribute('iScl', new THREE.InterleavedBufferAttribute(buf, 4, 4));
  geo.setAttribute('iCol', new THREE.InterleavedBufferAttribute(buf, 4, 8));
  geo.instanceCount = 0;
  const mesh = new THREE.Mesh(geo, maakMat());  // eigen materiaal = alles in één draw (ook als het sorteren hieronder niet meedoet)
  mesh.name = 'rookbatch'; mesh.frustumCulled = false; mesh.matrixAutoUpdate = false; mesh.userData.rookbatch = true;
  scene.add(mesh);
  // per render-diepte (genest tekenen) eigen materialen: elk stuk heeft eigen grenzen (uniforms)
  const lagen = [];
  function laag(d) {
    let S = lagen[d];
    if (!S) {
      S = { mats: [], items: [] };
      for (let j = 0; j <= MAXSEP; j++) {
        const m = maakMat();
        S.mats.push(m);
        S.items.push({ id: mesh.id, object: mesh, geometry: geo, material: m, groupOrder: 0, renderOrder: 0, z: 0, group: null });
      }
      lagen[d] = S;
    }
    return S;
  }

  // ---------- welke sprites ----------
  // alles wat de sprite-shader van three precies zo zou tekenen als de shader hierboven
  function geschikt(sp) {
    const m = sp.material;
    return !!(m && m.isSpriteMaterial && (m.map === T[0] || m.map === T[1] || m.map === T[2]) && m.blending === ADD && m.transparent && !m.depthWrite && m.depthTest &&
      m.depthFunc === THREE.LessEqualDepth && m.sizeAttenuation && m.fog && !m.alphaMap && !(m.alphaTest > 0) && !m.premultipliedAlpha && m.side === THREE.FrontSide &&
      m.colorWrite && !m.vertexColors && !m.clippingPlanes && !m.stencilWrite && !m.polygonOffset && !m.alphaToCoverage && m.onBeforeCompile === PM.onBeforeCompile &&
      sp.geometry === SPRITE_GEO && sp.center.x === 0.5 && sp.center.y === 0.5 && sp.renderOrder === 0 && (sp.matrixAutoUpdate || ikVast.has(sp)) &&
      sp.onBeforeRender === P3.onBeforeRender && sp.onAfterRender === P3.onAfterRender);
  }
  // leden[i] met ledenMat[i] = het materiaal dat de volledige keuring doorstond (elk beeld alleen een snelle controle, elke 60 beelden alles)
  let leden = [], ledenMat = [], gezien = new WeakSet(), aan = true, n = 0, laatsteFrame = -1, scanTel = 0, kinderenN = -1;
  const oudMask = new WeakMap(), ikVast = new WeakSet();  // ikVast: matrixAutoUpdate door mij uit (niemand leest hun matrix nog; scheelt ~340x compose per beeld)
  function scan() {  // alleen directe kinderen van de scène (wereldplek = position); wat in groepen hangt (zaal 2, doolhof) blijft bij optimaliseer.js
    for (let i = 0; i < leden.length; i++) {
      const sp = leden[i];
      if (sp.parent === scene && sp.layers.mask === 0 && geschikt(sp)) ledenMat[i] = sp.material; else { laatLos(i); i--; }
    }
    const ch = scene.children;
    for (let i = 0; i < ch.length; i++) {
      const c = ch[i];
      if (!c.isSprite || gezien.has(c)) continue;
      gezien.add(c);
      if (leden.length < CAP && c.layers.mask === 1 && geschikt(c)) {
        oudMask.set(c, c.layers.mask); c.layers.mask = 0; leden.push(c); ledenMat.push(c.material);
        if (c.matrixAutoUpdate) { c.matrixAutoUpdate = false; ikVast.add(c); }
      }
    }
    tel.leden = leden.length;
  }
  function laatLos(i) {  // three tekent hem weer zelf (en optimaliseer.js bundelt hem dan zoals vroeger)
    const sp = leden[i];
    if (sp.layers.mask === 0) sp.layers.mask = oudMask.has(sp) ? oudMask.get(sp) : 1;
    if (ikVast.has(sp)) { ikVast.delete(sp); sp.matrixAutoUpdate = true; }
    const l = leden.length - 1;
    leden[i] = leden[l]; ledenMat[i] = ledenMat[l]; leden.pop(); ledenMat.pop();
    tel.los++; tel.leden = leden.length;
  }
  function allesLos() { while (leden.length) laatLos(leden.length - 1); n = 0; geo.instanceCount = 0; }
  const ID = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  function verzamel() {  // vóór de eerste render van een beeld: toestand van de zichtbare wolkjes in de buffer
    const t0 = performance.now();
    if (++scanTel >= 60 || scene.children.length !== kinderenN) { scanTel = 0; kinderenN = scene.children.length; scan(); }
    const e = scene.matrixWorld.elements;
    for (let i = 0; i < 16; i++) if (e[i] !== ID[i]) { allesLos(); aan = false; console.warn('rookbatch: scène verplaatst, uit'); return; }
    let q = 0, x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity, smax = 0;
    for (let i = 0; i < leden.length; i++) {
      const sp = leden[i];
      if (!sp.visible) continue;
      const m = sp.material;
      if (sp.parent !== scene || sp.layers.mask !== 0 || m !== ledenMat[i] || (m.map !== T[0] && m.map !== T[1] && m.map !== T[2]) || m.blending !== ADD || m.depthWrite || !m.transparent) {
        if (sp.parent === scene && sp.layers.mask === 0 && geschikt(sp)) ledenMat[i] = m; else { laatLos(i); i--; continue; }
      }
      if (!m.visible || !(m.opacity > 0)) continue;  // three tekent niets / alpha 0 telt niets op
      const p = sp.position, s = sp.scale, c = m.color, k = q * ST;
      data[k] = p.x; data[k + 1] = p.y; data[k + 2] = p.z; data[k + 3] = m.rotation;
      data[k + 4] = Math.abs(s.x); data[k + 5] = Math.abs(s.y); data[k + 6] = m.map === T[0] ? 0 : m.map === T[1] ? 1 : 2; data[k + 7] = 0;
      data[k + 8] = c.r; data[k + 9] = c.g; data[k + 10] = c.b; data[k + 11] = m.opacity;
      if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; if (p.z < z0) z0 = p.z; if (p.z > z1) z1 = p.z;
      if (data[k + 4] > smax) smax = data[k + 4]; if (data[k + 5] > smax) smax = data[k + 5];
      q++;
    }
    n = q; geo.instanceCount = q;
    // bol om alle wolkjes samen (vlakje: halve diagonaal <= 0,71 x grootste schaal): buiten het kijkveld (zaal 2, gang) geen draw
    if (q) { allesBol.center.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); allesBol.radius = Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 + smax * 0.7072; }
    if (q) { buf.updateRange.offset = 0; buf.updateRange.count = q * ST; buf.needsUpdate = true; }
    tel.getekend = q; tel.beelden++;
    tel.verzamelMs += performance.now() - t0;
  }

  // ---------- haken: vóór elke render van de scène (camera + verzamelen) en na het sorteren van three (stukken op hun plek) ----------
  const stapel = [], orgRender = renderer.render;
  renderer.render = function (sc, cam) {
    if (sc !== scene) return orgRender.apply(this, arguments);
    // één keer per beeld (teken() zet info één keer per beeld terug); niet zolang de mesh verborgen is (doolhof verbergt hem)
    if (aan && mesh.visible && renderer.info.render.frame !== laatsteFrame) { laatsteFrame = renderer.info.render.frame; try { verzamel(); } catch (e) { fout(e); } }
    stapel.push(cam);
    try { return orgRender.apply(this, arguments); } finally { stapel.pop(); }
  };
  const sepI = new Int32Array(MAXSEP), sepZ = new Float64Array(MAXSEP), telR = new Int32Array(MAXSEP + 1), uit = [], pv = new THREE.Matrix4();
  const allesBol = new THREE.Sphere(), kijk = new THREE.Frustum();
  function groot(it) {  // grote doorzichtige laag die niet additief mengt: daar hangt het beeld van de volgorde af
    const m = it.material;
    if (m.blending === ADD && !m.depthWrite) return false;
    const bs = it.geometry && it.geometry.boundingSphere;
    return !bs || bs.radius * it.object.matrixWorld.getMaxScaleOnAxis() >= GROOT;
  }
  function stuk(S, j, ns, z) {  // draw j: wolkjes met z in (sepZ[j], sepZ[j-1]]
    if (!telR[j]) return;
    const m = S.mats[j], it = S.items[j];
    m.uniforms.uHi.value = j === 0 ? BIG : sepZ[j - 1];
    m.uniforms.uLo.value = j === ns ? -BIG : sepZ[j];
    it.z = z;
    uit.push(it);
    tel.draws++;
  }
  function sorteer(L) {
    const t = L.transparent;
    let k = -1;
    for (let i = 0; i < t.length; i++) if (t[i].object === mesh) { k = i; break; }
    if (k < 0) return;
    tel.passes++;
    const cam = stapel[stapel.length - 1], pe = cam && cam.projectionMatrix && cam.matrixWorldInverse ? pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).elements : null;
    if (!aan || n === 0 || (pe && !kijk.setFromProjectionMatrix(pv).intersectsSphere(allesBol))) {  // niets (in beeld) te tekenen: geen lege draw
      for (let i = k; i < t.length - 1; i++) t[i] = t[i + 1];
      t.length--;
      return;
    }
    const t0 = performance.now(), it = t[k], go = it.groupOrder, ro = it.renderOrder;
    let b0 = k, b1 = k + 1;  // het blok met dezelfde groupOrder/renderOrder (de lijst is gesorteerd)
    while (b0 > 0 && t[b0 - 1].groupOrder === go && t[b0 - 1].renderOrder === ro) b0--;
    while (b1 < t.length && t[b1].groupOrder === go && t[b1].renderOrder === ro) b1++;
    let ns = 0;
    for (let i = b0; i < b1 && ns < MAXSEP; i++) if (i !== k && groot(t[i])) { sepI[ns] = i; sepZ[ns] = t[i].z; ns++; }
    if (ns === 0) { tel.draws++; tel.sorteerMs += performance.now() - t0; return; }  // één draw waar three hem zette
    // welke stukken hebben wolkjes (met marge: liever een draw te veel dan een wolkje kwijt)
    telR.fill(0);
    if (pe) {
      const e = pe;
      for (let q = 0; q < n; q++) {
        const o = q * ST, x = data[o], y = data[o + 1], z = data[o + 2];
        const zz = (e[2] * x + e[6] * y + e[10] * z + e[14]) / (e[3] * x + e[7] * y + e[11] * z + e[15]);
        for (let j = 0; j <= ns; j++) if ((j === ns || zz > sepZ[j] - EPS) && (j === 0 || zz <= sepZ[j - 1] + EPS)) telR[j]++;
      }
    } else telR.fill(1);
    const S = laag(Math.max(0, stapel.length - 1));
    uit.length = 0;
    for (let i = 0; i < b0; i++) uit.push(t[i]);
    for (let i = b0, j = 0; i < b1; i++) {
      if (i === k) continue;
      if (j < ns && i === sepI[j]) { stuk(S, j, ns, t[i].z); j++; }
      uit.push(t[i]);
    }
    stuk(S, ns, ns, it.z);  // de rest aan het eind van het blok
    for (let i = b1; i < t.length; i++) uit.push(t[i]);
    t.length = 0;
    for (let i = 0; i < uit.length; i++) t.push(uit[i]);
    uit.length = 0;
    tel.sorteerMs += performance.now() - t0;
  }
  const lijstGet = renderer.renderLists.get;
  renderer.renderLists.get = function (sc, d) {
    const L = lijstGet.apply(this, arguments);
    if (sc === scene && L && !L._rookSort) {
      const srt = L.sort;
      L.sort = function () { srt.apply(this, arguments); try { sorteer(this); } catch (e) { fout(e); } };
      L._rookSort = true;
    }
    return L;
  };

  scan();
  window.clubRook = {
    get aan() { return aan; }, tel,
    schakel(b) {  // false: de originele sprites tekenen weer zelf (A/B in dezelfde toestand); true: weer overnemen
      b = !!b;
      if (b === aan) return aan;
      aan = b;
      if (!b) allesLos(); else { gezien = new WeakSet(); scan(); laatsteFrame = -1; }
      return aan;
    },
    info() {
      const b = Math.max(1, tel.beelden);
      return { aan, leden: leden.length, getekend: n, losGelaten: tel.los, drawsPerBeeld: +(tel.draws / b).toFixed(2), passesPerBeeld: +(tel.passes / b).toFixed(2),
        verzamelMs: +(tel.verzamelMs / b).toFixed(4), sorteerMs: +(tel.sorteerMs / b).toFixed(4) };
    },
    reset() { for (const k of ['draws', 'passes', 'verzamelMs', 'sorteerMs', 'beelden']) tel[k] = 0; },
  };
})();

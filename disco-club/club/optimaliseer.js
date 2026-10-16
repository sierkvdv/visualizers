// Optimalisaties zonder zichtbaar verschil: minder draw calls en minder CPU per beeld, in elke stand.
//  1. figuren (SkinnedMesh): weer frustum-culling, met een bol uit de botten van dat moment (stond uit: elk figuur werd in elke
//     pass getekend, ook als het er niet in stond: hoofdbeeld, spiegel, schaduwkaarten)
//  2. rook: na het sorteren door three worden de wolkjes (additieve Sprites) tussen twee niet-additieve doorzichtige dingen per textuur
//     één instanced draw op die plek in de volgorde; zelfde sprite-wiskunde en mist, en optellen is volgorde-vrij
//  3. vaste, dekkende meshes: wat > 10 s niet bewoog, wordt per materiaal (of per gelijk materiaal) samengevoegd tot één geometrie onder het
//     eerste bewegende of verborgen voorouder-object. Vlak vóór elke scene.updateMatrixWorld wordt nagekeken of een origineel of
//     tussen-object veranderde (plek, ouder, materiaal, geometrie): dan gaat de samenvoeging meteen terug. Is een origineel even
//     onzichtbaar (bv. klein decor buiten de bol-opname), dan tekenen voor die render de originelen.
//  4. vaste objecten: matrixAutoUpdate uit (ook op de scène zelf), zodat scene.updateMatrixWorld ze niet steeds opnieuw uitrekent;
//     dezelfde controle zet een object dat toch bewoog weer gewoon aan.
// Het zoek- en bouwwerk loopt in stukjes van samen hooguit 0,5 ms per beeld (geen haperingen).
// Vergelijken: ?opt=0 achter de link = alles uit. In de console: clubOpt.staat(), clubOpt.schakel(false/true) (A/B in dezelfde toestand),
// clubOpt.uit() (alles terug zoals het was).
(function () {
  'use strict';
  if (typeof scene === 'undefined' || typeof renderer === 'undefined' || typeof clubHooks === 'undefined') return;
  const UIT = /[?&]opt=0(&|$)/.test(location.search);
  const tel = { onderhoudMax: 0, onderhoudLang: 0, figuren: 0, rook: 0, rookWeg: 0, groepen: 0, leden: 0, terug: 0, wachtMs: 0, wachtN: 0, vastMs: 0, vastN: 0 };
  const log = [];
  window.clubOpt = { aan: !UIT, tel, log };
  if (UIT) return;

  const P3 = THREE.Object3D.prototype, PM = THREE.Material.prototype;
  let aan = true, geschakeld = true, rookSchakel = true, foutGemeld = false;  // geschakeld: false = tijdelijk de originelen tekenen (clubOpt.schakel, vergelijken)
  const fout = e => { if (!foutGemeld) { foutGemeld = true; console.error('optimaliseer', e); } };

  // ---------- haken: vóór elke render van de scène (zichtbaarheid samenvoegingen) en vóór elke scene.updateMatrixWorld (bevroren objecten) ----------
  // Botstanden veranderen alleen tussen buitenste renders (teken() in index.html meldt zich als één buitenste render; bol-zijden 2-6
  // via cubeCam.update tellen ook niet apart): dan pas nieuwe bollen voor de figuren.
  let diepte = 0, tijdperk = 0, inKubus = 0, kubusVlak = 0, umwTel = 0, umwTelVorig = 0, tijdperkVorig = 0;
  function voorRender() {
    diepte++;
    if (diepte === 1 && !(inKubus && kubusVlak++ > 0)) tijdperk++;  // nieuwe botstanden mogelijk: bollen van de figuren opnieuw
    if (!aan || !geschakeld) return;
    // zichtbaarheid bij elke render, ook genest: index.html zet per pass dingen uit (zaal 2 buiten spiegel en bol); kost een paar µs
    const t0 = performance.now();
    groepWacht();
    tel.wachtMs += performance.now() - t0; tel.wachtN++;
  }
  function haakRender() {
    const v = scene.onBeforeRender, n = scene.onAfterRender;
    scene.onBeforeRender = function (a, b, c, d) { try { voorRender(); } catch (e) { fout(e); } return v.call(this, a, b, c, d); };
    scene.onAfterRender = function (a, b, c) { if (diepte > 0) diepte--; return n.call(this, a, b, c); };
    scene.onBeforeRender.optHaak = scene.onAfterRender.optHaak = true;
  }
  function haakMatrix() {
    const org = scene.updateMatrixWorld;
    scene.updateMatrixWorld = function (force) {
      umwTel++;
      if (aan) { const t0 = performance.now(); try { vastWacht(); } catch (e) { fout(e); } tel.vastMs += performance.now() - t0; tel.vastN++; }
      return org.call(this, force);
    };
  }
  haakRender();
  haakMatrix();
  if (typeof cubeCam !== 'undefined' && cubeCam) {
    const kubusUpdate = cubeCam.update;
    cubeCam.update = function () { inKubus++; kubusVlak = 0; try { return kubusUpdate.apply(this, arguments); } finally { inKubus--; } };
  }

  // ---------- 1. figuren: frustum-culling met een bol uit de botten ----------
  // Een geskinde vertex = som w_i * (bot_i.matrixWorld * q_i), met q_i de vertex in botruimte (bindhouding). Elke term ligt binnen
  // schaal_i * |q_i| van bot i, dus de hele mesh ligt in de bol om de botten met per bot die straal erbij (r_i = max |q_i|).
  const stralen = new WeakMap(), klussen = [];
  function stralenVoor(o) {
    const g = o.geometry, inv = o.skeleton.boneInverses, b = o.bindMatrix.elements;
    let lijst = stralen.get(g);
    if (!lijst) stralen.set(g, lijst = []);
    let s = lijst.find(x => x.inv === inv && x.bind.every((v, i) => v === b[i]));
    if (!s) {
      s = { inv, bind: b.slice(), r: null };
      lijst.push(s);
      klussen.push({ s, g, M: inv.map(bi => new THREE.Matrix4().multiplyMatrices(bi, o.bindMatrix).elements), v: 0, r: new Float64Array(inv.length), mis: false });
    }
    return s;
  }
  function klusStap(eind) {  // in stukjes van 200 hoekpunten tot de eindtijd: geen hapering bij een nieuw figuur
    while (klussen.length && performance.now() < eind) {
      const k = klussen[0], g = k.g, pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, r = k.r, M = k.M;
      const stop = Math.min(pos.count, k.v + 200);
      for (let v = k.v; v < stop && !k.mis; v++) {
        const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
        for (let j = 0; j < 4; j++) {
          const w = j === 0 ? sw.getX(v) : j === 1 ? sw.getY(v) : j === 2 ? sw.getZ(v) : sw.getW(v);
          if (!(w > 0)) continue;
          const bi = j === 0 ? si.getX(v) : j === 1 ? si.getY(v) : j === 2 ? si.getZ(v) : si.getW(v), e = M[bi];
          if (!e) { k.mis = true; break; }  // botindex buiten het skelet: dit figuur niet cullen
          const qx = e[0] * x + e[4] * y + e[8] * z + e[12], qy = e[1] * x + e[5] * y + e[9] * z + e[13], qz = e[2] * x + e[6] * y + e[10] * z + e[14];
          const d = qx * qx + qy * qy + qz * qz;
          if (d > r[bi]) r[bi] = d;
        }
      }
      k.v = stop;
      if (k.mis) { k.s.r = false; klussen.shift(); }
      else if (stop >= pos.count) { k.s.r = Float32Array.from(r, d => Math.sqrt(d) * 1.001 + 1e-4); klussen.shift(); }
    }
    return klussen.length > 0;
  }
  const FR = THREE.Frustum.prototype, orgSnijdt = FR.intersectsObject;
  FR.intersectsObject = function (o) {
    const F = o._optFig;
    if (F === undefined) return orgSnijdt.call(this, o);
    if (F.tp !== tijdperk) figBol(o, F);
    return this.intersectsSphere(F.bol);
  };
  function figBol(o, F) {
    F.tp = tijdperk;
    const bones = o.skeleton.bones, r = F.r, n = bones.length;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < n; i++) {
      const e = bones[i].matrixWorld.elements, x = e[12], y = e[13], z = e[14];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
    let R = 0;
    for (let i = 0; i < n; i++) {
      const e = bones[i].matrixWorld.elements, dx = e[12] - cx, dy = e[13] - cy, dz = e[14] - cz;
      const s2 = Math.max(e[0] * e[0] + e[1] * e[1] + e[2] * e[2], e[4] * e[4] + e[5] * e[5] + e[6] * e[6], e[8] * e[8] + e[9] * e[9] + e[10] * e[10]);
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + Math.sqrt(s2) * r[i];
      if (d > R) R = d;
    }
    F.bol.center.set(cx, cy, cz);
    // marge: de botten-textuur gaat één keer per beeld naar de gpu, een figuur kan dus een beeldje achterlopen op zijn botten
    F.bol.radius = R * 1.02 + 0.15;
  }
  const figWacht = new Set(), figGezien = new WeakSet();
  function figuurKandidaat(o) {
    if (figGezien.has(o) || o.frustumCulled !== false || o._optFig) return;
    const sk = o.skeleton, g = o.geometry, a = g && g.attributes;
    figGezien.add(o);
    if (!sk || o.bindMode !== 'attached' || !a || !a.position || !a.skinIndex || !a.skinWeight || a.position.normalized || g.morphAttributes.position) return;
    if (sk.bones.length !== sk.boneInverses.length || sk.bones.some(b => !b)) return;
    figWacht.add(o);
    stralenVoor(o);
  }
  function figurenKlaar() {
    for (const o of figWacht) {
      const s = stralenVoor(o);
      if (s.r === null) continue;
      figWacht.delete(o);
      if (!s.r || o.frustumCulled !== false) continue;
      o._optFig = { r: s.r, bol: new THREE.Sphere(), tp: -1 };
      o.frustumCulled = true;
      tel.figuren++;
    }
  }

  // ---------- 2. rook: opeenvolgende additieve sprites als één instanced draw ----------
  // three bepaalt zelf wat er getekend wordt en in welke volgorde (zichtbaarheid, frustum, sortering van achter naar voren). Ná die
  // sortering worden in de lijst met doorzichtige dingen de wolkjes tussen twee 'scheiders' (doorzichtig maar niet additief, of
  // diepte-schrijvend: glazen, flessen, bekertjes) per textuur samengenomen tot één draw op die plek. Wat er tussen twee scheiders
  // staat is allemaal additief zonder diepte te schrijven, en optellen is volgorde-vrij: het beeld blijft gelijk.
  // De gegevens per wolkje gaan in een float-textuur (per render opnieuw), de draw leest ze met texelFetch (webgl2, vertex-texturen).
  const SPRITE_GEO = new THREE.Sprite().geometry, caps = renderer.capabilities;
  const ROOK_AAN = !!(caps.isWebGL2 && caps.maxVertexTextures > 0 && caps.floatVertexTextures) && renderer.outputEncoding === THREE.LinearEncoding && renderer.toneMapping === THREE.NoToneMapping;
  const ROOK_CAP = 4096, ROOK_W = 1024;  // max wolkjes per render; textuur 1024 breed, 3 texels per wolkje
  const ROOK_VS = `
    uniform sampler2D uData; uniform float uStart; uniform mat3 uvTransform;
    attribute float iIdx;
    varying vec2 vUv; varying vec4 vCol;
    #include <fog_pars_vertex>
    vec4 rij(int k) { return texelFetch(uData, ivec2(k % ${ROOK_W}, k / ${ROOK_W}), 0); }
    void main() {
      int i = int(uStart + iIdx) * 3;
      vec4 a = rij(i), b = rij(i + 1);
      vCol = rij(i + 2);
      vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
      vec4 mvPosition = viewMatrix * vec4( a.xyz, 1.0 );
      vec2 alignedPosition = position.xy * b.xy;
      vec2 rotatedPosition;
      rotatedPosition.x = cos( a.w ) * alignedPosition.x - sin( a.w ) * alignedPosition.y;
      rotatedPosition.y = sin( a.w ) * alignedPosition.x + cos( a.w ) * alignedPosition.y;
      mvPosition.xy += rotatedPosition;
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`;
  const ROOK_FS = `
    uniform sampler2D map;
    varying vec2 vUv; varying vec4 vCol;
    #include <fog_pars_fragment>
    void main() {
      gl_FragColor = vCol * texture2D( map, vUv );
      #include <fog_fragment>
    }`;
  // gedeelde geometrie (sprite-vlakje + vaste instance-index); een onzichtbare drager in de scène zorgt dat three hem uploadt
  let rookGeo = null, drager = null;
  const rookOk = new WeakMap();  // materiaal -> [versie, bruikbaar]
  function rookMat(m) {
    const c = rookOk.get(m);
    if (c && c[0] === m.version) return c[1];
    const t = m.map;
    const ok = !!(m.isSpriteMaterial && t && t.isTexture && t.encoding === THREE.LinearEncoding && m.blending === THREE.AdditiveBlending && m.transparent &&
      !m.depthWrite && m.depthTest && m.sizeAttenuation && !m.alphaMap && !(m.alphaTest > 0) && m.fog && !m.premultipliedAlpha && m.side === THREE.FrontSide &&
      m.colorWrite && !m.vertexColors && !m.clippingPlanes && m.onBeforeCompile === PM.onBeforeCompile && !m.stencilWrite);
    rookOk.set(m, [m.version, ok]);
    return ok;
  }
  const rookGezien = new WeakSet(), rookSprite = new WeakSet();
  function rookKandidaat(sp) {
    if (!ROOK_AAN || rookGezien.has(sp)) return;
    rookGezien.add(sp);
    if (sp.geometry === SPRITE_GEO && sp.onBeforeRender === P3.onBeforeRender && sp.onAfterRender === P3.onAfterRender) { rookSprite.add(sp); tel.rook++; }
  }
  function rookStart() {
    rookGeo = new THREE.InstancedBufferGeometry();
    rookGeo.setIndex(SPRITE_GEO.index);
    rookGeo.setAttribute('position', SPRITE_GEO.attributes.position);
    rookGeo.setAttribute('uv', SPRITE_GEO.attributes.uv);
    rookGeo.setAttribute('iIdx', new THREE.InstancedBufferAttribute(Float32Array.from({ length: ROOK_CAP }, (v, i) => i), 1));
    rookGeo.instanceCount = 0;
    drager = new THREE.Mesh(rookGeo, new THREE.MeshBasicMaterial({ visible: false }));
    drager.frustumCulled = false; drager.matrixAutoUpdate = false; drager.userData.optRook = true; drager.name = 'opt-rook';
    scene.add(drager);
  }
  // per renderlijst (diepte): datatextuur + een voorraad draws (elk een eigen materiaal: three ververst de uniforms bij elk ander materiaal)
  // de textuur gaat elke render helemaal naar de gpu: zo klein als nodig (rijen van 1024 texels = 341 wolkjes), groeit mee
  function lijstData(L, nodig) {
    let d = L._optRook;
    const rijen = Math.max(1, Math.ceil(Math.min(nodig, ROOK_CAP) * 3 / ROOK_W));
    if (d && d.rijen >= rijen) return d;
    const arr = new Float32Array(ROOK_W * rijen * 4);
    const tex = new THREE.DataTexture(arr, ROOK_W, rijen, THREE.RGBAFormat, THREE.FloatType);
    tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
    if (d) { d.tex.dispose(); d.arr = arr; d.tex = tex; d.rijen = rijen; for (const s of d.slots) s.mat.uniforms.uData.value = tex; }
    else d = L._optRook = { arr, tex, rijen, slots: [], n: 0, w: 0 };
    return d;
  }
  function slot(d, i) {
    let s = d.slots[i];
    if (s) return s;
    const u = THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);
    u.map = { value: null }; u.uvTransform = { value: new THREE.Matrix3() }; u.uData = { value: d.tex }; u.uStart = { value: 0 };
    const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: ROOK_VS, fragmentShader: ROOK_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
    const mesh = new THREE.Mesh(rookGeo, mat);
    s = { mesh, mat, n: 0, item: { id: mesh.id, object: mesh, geometry: rookGeo, material: mat, groupOrder: 0, renderOrder: 0, z: 0, group: null } };
    mesh.onBeforeRender = () => { rookGeo.instanceCount = s.n; };  // vlak vóór deze draw: zoveel wolkjes
    d.slots[i] = s;
    return s;
  }
  // wachtende wolkjes per textuur (sinds de laatste scheider)
  const wachtMap = [], wachtSp = [], wachtItem = [], rookUit = [];
  function rookSpuit(d, uit) {  // de wachtende wolkjes als één draw per textuur
    for (let k = 0; k < wachtMap.length; k++) {
      const map = wachtMap[k], sp = wachtSp[k], its = wachtItem[k];
      if (!sp.length) continue;
      if (sp.length === 1 || d.w + sp.length > ROOK_CAP) { for (let j = 0; j < its.length; j++) uit.push(its[j]); sp.length = 0; its.length = 0; continue; }
      const s = slot(d, d.n++), a = d.arr, start = d.w;
      for (let j = 0; j < sp.length; j++) {
        const o = sp[j], m = o.material, e = o.matrixWorld.elements, c = m.color, q = (d.w++) * 12;
        a[q] = e[12]; a[q + 1] = e[13]; a[q + 2] = e[14]; a[q + 3] = m.rotation;
        a[q + 4] = Math.sqrt(e[0] * e[0] + e[1] * e[1] + e[2] * e[2]); a[q + 5] = Math.sqrt(e[4] * e[4] + e[5] * e[5] + e[6] * e[6]);
        a[q + 8] = c.r; a[q + 9] = c.g; a[q + 10] = c.b; a[q + 11] = m.opacity;
      }
      s.n = sp.length; s.mat.uniforms.uStart.value = start; s.mat.uniforms.map.value = map;
      if (map.matrixAutoUpdate) map.updateMatrix();
      s.mat.uniforms.uvTransform.value.copy(map.matrix);
      const it0 = its[0];
      s.item.groupOrder = it0.groupOrder; s.item.renderOrder = it0.renderOrder; s.item.z = it0.z;
      uit.push(s.item);
      tel.rookWeg += sp.length - 1;
      sp.length = 0; its.length = 0;
    }
  }
  function rookSorteer(L) {
    const t = L.transparent;
    if (!aan || !rookSchakel || !rookGeo || t.length < 2) return;
    let n = 0;
    for (let i = 0; i < t.length; i++) if (rookSprite.has(t[i].object)) n++;
    if (n < 2) return;
    const d = lijstData(L, n), uit = rookUit;
    d.n = 0; d.w = 0; uit.length = 0;
    for (let k = 0; k < wachtSp.length; k++) wachtSp[k].length = wachtItem[k].length = 0;  // niets meer van een vorige (afgebroken) ronde
    for (let i = 0; i < t.length; i++) {
      const it = t[i], o = it.object, m = it.material;
      if (rookSprite.has(o) && m === o.material && o.center.x === 0.5 && o.center.y === 0.5 && rookMat(m)) {
        let k = wachtMap.indexOf(m.map);
        if (k < 0) { k = wachtMap.length; wachtMap.push(m.map); wachtSp.push([]); wachtItem.push([]); }
        wachtSp[k].push(o); wachtItem[k].push(it);
        continue;
      }
      if (!(m.blending === THREE.AdditiveBlending && !m.depthWrite)) rookSpuit(d, uit);  // scheider: eerst de wachtende wolkjes
      uit.push(it);
    }
    rookSpuit(d, uit);
    if (d.n) {
      d.tex.needsUpdate = true;
      t.length = 0;
      for (let i = 0; i < uit.length; i++) t.push(uit[i]);
    }
    uit.length = 0;
    if (wachtMap.length > 64) { wachtMap.length = wachtSp.length = wachtItem.length = 0; }  // oude textures (doolhof) niet vasthouden
  }
  // haak in de renderlijsten van three: na het sorteren
  if (ROOK_AAN && renderer.renderLists && renderer.renderLists.get) {
    const lijstGet = renderer.renderLists.get;
    renderer.renderLists.get = function (sc, d) {
      const L = lijstGet.call(this, sc, d);
      if (!L._optSort) {
        const srt = L.sort;
        L.sort = function (a, b) { srt.call(this, a, b); try { rookSorteer(this); } catch (e) { fout(e); } };
        L._optSort = true;
      }
      return L;
    };
    rookStart();
  }

  // ---------- 3 + 4. vaste objecten bevriezen en samenvoegen ----------
  // st: 0 = kijken (nog niet lang genoeg stil), 1 = vast (matrixAutoUpdate uit), 2 = samengevoegd (vast + origineel tekent niet), 3 = los (beweegt)
  const REC = new Map(), VAST = [], MATREC = new WeakMap(), GROEPEN = new Set();
  const STIL = 600, CLUB = 70;  // beelden stil vóór bevriezen (~10 s); alleen binnen de club (doolhofkamers liggen op x -400)
  let tik = 0, vastVuil = false, nieuwVast = false;
  function snap(r) {
    const o = r.o, p = r.p, q = r.q, sc = r.sc, s = r.s;
    s[0] = p.x; s[1] = p.y; s[2] = p.z; s[3] = q.x; s[4] = q.y; s[5] = q.z; s[6] = q.w; s[7] = sc.x; s[8] = sc.y; s[9] = sc.z;
    r.par = o.parent; r.mat = o.material; r.geo = o.geometry; r.cs = o.castShadow; r.rs = o.receiveShadow; r.ro = o.renderOrder; r.fc = o.frustumCulled;
    r.gv = o.geometry && o.geometry.attributes && o.geometry.attributes.position ? o.geometry.attributes.position.version : -1;
  }
  function zelfdeT(r) {  // plek, draaiing, schaal en ouder
    const o = r.o, p = r.p, q = r.q, sc = r.sc, s = r.s;
    return p.x === s[0] && p.y === s[1] && p.z === s[2] && q.x === s[3] && q.y === s[4] && q.z === s[5] && q.w === s[6] && sc.x === s[7] && sc.y === s[8] && sc.z === s[9] && o.parent === r.par;
  }
  function zelfdeM(r) {  // wat het tekenen bepaalt (zichtbaarheid apart: die mag wisselen)
    const o = r.o;
    return o.material === r.mat && o.geometry === r.geo && o.castShadow === r.cs && o.receiveShadow === r.rs && o.renderOrder === r.ro && o.frustumCulled === r.fc &&
      (r.gv < 0 || o.geometry.attributes.position.version === r.gv);
  }
  function nieuwRec(o) {
    const r = { o, p: o.position, q: o.quaternion, sc: o.scale, s: new Float64Array(10), st: 0, par: null, mat: null, geo: null, cs: false, rs: false, ro: 0, fc: true, gv: -1,
      t0: tik, wissel: 0, v: 0, lm: 1, lay: o.layers, groep: null, afh: null, vuil: false, qcb: null, ecb: null, weg: null };
    snap(r);
    const e = o.matrixWorld.elements;
    if (o.matrixAutoUpdate === false || Math.abs(e[12]) > CLUB || Math.abs(e[14]) > CLUB || o.isCamera) r.st = 3;
    REC.set(o, r);
    return r;
  }
  // materiaal: numerieke toestand (kleur, sterkte, zichtbaar, versie ...) om veranderingen te zien
  const MATW = 22;
  function matWaarden(m, s) {
    const c = m.color, em = m.emissive, sp = m.specular;
    s[0] = c ? c.r : -1; s[1] = c ? c.g : -1; s[2] = c ? c.b : -1; s[3] = em ? em.r : -1; s[4] = em ? em.g : -1; s[5] = em ? em.b : -1;
    s[6] = sp ? sp.r : -1; s[7] = sp ? sp.g : -1; s[8] = sp ? sp.b : -1; s[9] = m.opacity; s[10] = m.visible ? 1 : 0; s[11] = m.version;
    s[12] = m.roughness === undefined ? -1 : m.roughness; s[13] = m.metalness === undefined ? -1 : m.metalness; s[14] = m.emissiveIntensity === undefined ? -1 : m.emissiveIntensity;
    s[15] = m.shininess === undefined ? -1 : m.shininess; s[16] = m.reflectivity === undefined ? -1 : m.reflectivity; s[17] = m.transparent ? 1 : 0; s[18] = m.side;
    s[19] = m.blending; s[20] = m.depthWrite ? 1 : 0; s[21] = m.wireframe ? 1 : 0;
  }
  const tmpW = new Float64Array(MATW);
  function matZelfde(mr) {
    const m = mr.m;
    if (m.map !== mr.map || m.envMap !== mr.env) return false;
    matWaarden(m, tmpW);
    const s = mr.s;
    for (let i = 0; i < MATW; i++) if (tmpW[i] !== s[i]) return false;
    return true;
  }
  function matRec(m) {
    let mr = MATREC.get(m);
    if (!mr) { mr = { m, s: new Float64Array(MATW), map: m.map, env: m.envMap, dyn: false, fp: null }; matWaarden(m, mr.s); MATREC.set(m, mr); }
    return mr;
  }
  // structurele vingerafdruk: twee materialen met dezelfde afdruk tekenen identiek
  const ids = new WeakMap(); let idTel = 0;
  const idVan = x => { let i = ids.get(x); if (i === undefined) ids.set(x, i = ++idTel); return i; };
  const NIET = new Set(['uuid', 'name', 'id', 'version', 'userData', '_listeners', 'needsUpdate']);
  function vingerafdruk(m) {
    const d = [m.type];
    for (const k in m) {
      if (NIET.has(k)) continue;
      const v = m[k];
      if (v === null || v === undefined || typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') d.push(k + '=' + v);
      else if (v.isColor) d.push(k + '=' + v.r + ',' + v.g + ',' + v.b);
      else if (v.isTexture) d.push(k + '=t' + idVan(v));
      else if (v.isVector2 || v.isVector3) d.push(k + '=' + v.toArray().join(','));
      else if (typeof v === 'function') d.push(k + '=' + (v === PM[k] ? 'std' : 'f' + idVan(v)));
      else if (k === 'defines') d.push(k + '=' + JSON.stringify(v));
      else d.push(k + '=o' + idVan(v));
    }
    return d.join('|');
  }
  function samenbaar(o) {
    const m = o.material, g = o.geometry;
    if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || !m || Array.isArray(m) || !g || !g.isBufferGeometry) return false;
    if (m.isShaderMaterial || m.isRawShaderMaterial || m.isShadowMaterial || m.onBeforeCompile !== PM.onBeforeCompile || !m.visible) return false;
    if (m.transparent) return false;  // doorzichtig: de tekenvolgorde t.o.v. glazen e.d. zou veranderen (alleen dekkende dingen samen)
    if (o.onBeforeRender !== P3.onBeforeRender || o.onAfterRender !== P3.onAfterRender || !o.frustumCulled || !o.visible) return false;
    const a = g.attributes;
    if (!a.position || a.tangent || Object.keys(g.morphAttributes).length || g.drawRange.start !== 0 || g.drawRange.count !== Infinity) return false;
    if (!(a.position.array instanceof Float32Array) || a.position.normalized || a.position.itemSize !== 3) return false;
    if (a.normal && (!(a.normal.array instanceof Float32Array) || a.normal.itemSize !== 3)) return false;
    return true;
  }
  const attrCache = new WeakMap();
  function attrSleutel(g) {
    let k = attrCache.get(g);
    if (k === undefined) { k = Object.keys(g.attributes).sort().map(n => { const a = g.attributes[n]; return n + ':' + a.itemSize + ':' + a.array.constructor.name + ':' + a.normalized; }).join(','); attrCache.set(g, k); }
    return k;
  }

  // achtergrondwerk in stukjes (elk beeld hooguit ~0,5 ms samen): kijken, ontdekken, opruimen, indelen, samenvoegen
  let kijkIt = null;
  function kijkStap(eind) {  // wie bewoog er in het kijk-stadium (een ronde loopt over een paar beelden)
    if (!kijkIt) kijkIt = REC.values();
    for (let n = 0; ; n++) {
      if ((n & 7) === 7 && performance.now() > eind) return true;
      const x = kijkIt.next();
      if (x.done) { kijkIt = null; return false; }
      const r = x.value;
      if (r.st !== 0) continue;
      if (!zelfdeT(r) || !zelfdeM(r)) { snap(r); r.t0 = tik; if (++r.wissel >= 3) r.st = 3; continue; }
      if (r.o.isMesh && r.o.material && !Array.isArray(r.o.material)) { const mr = matRec(r.o.material); if (!mr.dyn && !matZelfde(mr)) { mr.dyn = true; mr.fp = null; } }
    }
  }
  let ontdekStapel = null;
  function ontdekStap(eind) {  // nieuwe objecten, figuren en rookwolkjes (skeletten worden overgeslagen: die bewegen altijd)
    if (!ontdekStapel) ontdekStapel = [scene];
    for (let n = 0; ontdekStapel.length; n++) {
      if ((n & 3) === 3 && performance.now() > eind) return true;
      const o = ontdekStapel.pop(), ch = o.children;
      for (let i = 0; i < ch.length; i++) {
        const c = ch[i];
        if (c.isBone) continue;
        if (c.isSkinnedMesh) { figuurKandidaat(c); continue; }
        if (c.isSprite) { rookKandidaat(c); continue; }
        const u = c.userData;
        if (u && (u.optSamen || u.optRook)) continue;
        if (!REC.has(c)) nieuwRec(c);
        if (c.children.length) ontdekStapel.push(c);
      }
    }
    ontdekStapel = null;
    return false;
  }
  function inScene(o) { while (o.parent) o = o.parent; return o === scene; }
  // bevroren: draaiing en ouder melden zich zelf (onChange van quaternion/rotation, 'removed'); plek en schaal worden vergeleken
  function bevries(r) {
    const o = r.o, q = o.quaternion, e = o.rotation;
    snap(r);
    r.vuil = false;
    r.qcb = q._onChangeCallback; r.ecb = e._onChangeCallback;
    q._onChangeCallback = function () { r.vuil = true; r.qcb.call(this); };
    e._onChangeCallback = function () { r.vuil = true; r.ecb.call(this); };
    o.addEventListener('removed', r.weg = () => { r.vuil = true; });
    o.updateMatrix();
    o.matrixAutoUpdate = false;
    r.st = 1; r.v++;
    VAST.push(r);
    nieuwVast = true;
  }
  function ontdooi(r) {
    const o = r.o;
    if (r.qcb) { o.quaternion._onChangeCallback = r.qcb; o.rotation._onChangeCallback = r.ecb; o.removeEventListener('removed', r.weg); r.qcb = r.ecb = r.weg = null; }
    o.matrixAutoUpdate = true;
  }
  function veranderd(r, metWereld, reden) {  // r bewoog of werd anders getekend: groepen terug, weer gewoon meedoen
    tel.terug++; r.v++;
    if (log.length < 200) log.push((r.o.name || r.o.type) + '#' + r.o.id + ' ' + reden);
    if (r.groep) groepTerug(r.groep);
    if (r.afh) for (const G of [...r.afh]) groepTerug(G);
    ontdooi(r);
    if (metWereld) r.o.updateMatrixWorld(true);  // na scene.updateMatrixWorld: matrix van deze render meteen goed
    // bewogen: voortaan los; alleen ander materiaal (bv. een andere kwaliteitsstand): opnieuw kijken, later mag hij weer vast
    if (reden === 'teken' && ++r.wissel < 3) { r.st = 0; r.t0 = tik; snap(r); } else r.st = 3;
    vastVuil = true;
  }
  function zetActief(G, actief) {  // lagen: de originelen of de samenvoeging tekent
    G.actief = actief;
    G.mesh.layers.mask = actief ? G.lm : 0;
    for (const r of G.leden) r.o.layers.mask = actief ? 0 : r.lm;
  }
  function groepTerug(G) {
    if (!GROEPEN.has(G)) return;
    GROEPEN.delete(G);
    if (G.mesh.parent) G.mesh.parent.remove(G.mesh);
    G.mesh.geometry.dispose();
    for (const r of G.leden) { if (r.o.layers.mask === 0) r.o.layers.mask = r.lm; r.groep = null; if (r.st === 2) r.st = 1; }
    for (const r of G.pad) if (r.afh) r.afh.delete(G);
    tel.groepen--; tel.leden -= G.leden.length;
    nieuwVast = true;  // de rest kan later opnieuw samen
  }
  // Vóór elke scene.updateMatrixWorld (= vóór de renders die de nieuwe matrices gebruiken): bewoog er een bevroren object, dan doet het weer
  // gewoon mee; is een samengevoegd origineel anders gaan tekenen (materiaal, geometrie, schaduw ...), dan gaat die samenvoeging terug.
  // Wat ná de update nog verschuift, ziet ook het origineel pas bij de volgende update: dat is dus gelijk.
  function vastWacht() {
    const sc = scene;
    if (!sc.matrixAutoUpdate && !(sc.position.x === 0 && sc.position.y === 0 && sc.position.z === 0 && sc.quaternion.x === 0 && sc.quaternion.y === 0 &&
        sc.quaternion.z === 0 && sc.quaternion.w === 1 && sc.scale.x === 1 && sc.scale.y === 1 && sc.scale.z === 1 && sc.parent === null)) sc.matrixAutoUpdate = true;
    for (let i = 0; i < VAST.length; i++) {
      const r = VAST[i];
      if (r.st !== 1 && r.st !== 2) continue;
      const p = r.p, c = r.sc, s = r.s;
      if (r.vuil || p.x !== s[0] || p.y !== s[1] || p.z !== s[2] || c.x !== s[7] || c.y !== s[8] || c.z !== s[9]) {
        if (r.vuil) { r.vuil = false; if (zelfdeT(r)) continue; }  // zelfde waarde opnieuw gezet, of weg en terug bij dezelfde ouder
        veranderd(r, false, 'plek');
      }
    }
    tekenWacht();
  }
  // materiaal, geometrie en lagen elke keer; schaduw-, volgorde- en cullingvlaggen en geometrie-versie per groep om de 8 keer
  // (die zet in deze club alleen de figuren-code, en dan bij het maken, vóór een object 10 s stil stond)
  let tekenTel = 0;
  function tekenWacht() {
    const ronde = tekenTel++ & 7;
    for (const G of GROEPEN) {
      let weg = false;
      const L = G.leden, alles = (G.nr & 7) === ronde;
      for (let i = 0; i < L.length; i++) {
        const r = L[i], o = r.o;
        if (o.material !== r.mat || o.geometry !== r.geo || r.lay.mask !== (G.actief ? 0 : r.lm) || (alles && !zelfdeM(r))) { veranderd(r, false, 'teken'); weg = true; break; }
      }
      if (!weg && G.mats) for (let i = 0; i < G.mats.length; i++) if (!matZelfde(G.mats[i])) { G.mats[i].dyn = true; G.mats[i].fp = null; groepTerug(G); break; }
    }
  }
  // vóór elke render: is een origineel of tussen-object nu onzichtbaar (bv. buiten de bol-opname), dan tekenen de originelen
  function groepWacht() {
    for (const G of GROEPEN) {
      let zicht = true;
      const L = G.leden, P = G.pad;
      for (let i = 0; i < L.length; i++) if (!L[i].o.visible) { zicht = false; break; }
      if (zicht) for (let i = 0; i < P.length; i++) if (!P[i].o.visible) { zicht = false; break; }
      if (zicht !== G.actief) zetActief(G, zicht);
    }
  }
  let snoeiIt = null;
  function snoeiStap(eind) {  // weg uit de scène: terug zoals het was en vergeten (geen geheugengroei)
    if (!snoeiIt) { for (const G of [...GROEPEN]) if (!inScene(G.anker)) groepTerug(G); snoeiIt = REC.entries(); }
    for (let n = 0; ; n++) {
      if ((n & 7) === 7 && performance.now() > eind) return true;
      const x = snoeiIt.next();
      if (x.done) break;
      const [o, r] = x.value;
      if (inScene(o)) continue;
      if (r.groep) groepTerug(r.groep);
      if (r.afh) for (const G of [...r.afh]) groepTerug(G);
      if (r.st === 1 || r.st === 2) ontdooi(r);
      REC.delete(o); vastVuil = true;
    }
    snoeiIt = null;
    if (vastVuil) { vastVuil = false; const gezien = new Set(); let j = 0; for (let i = 0; i < VAST.length; i++) { const r = VAST[i]; if ((r.st === 1 || r.st === 2) && REC.get(r.o) === r && !gezien.has(r)) { gezien.add(r); VAST[j++] = r; } } VAST.length = j; }
    return false;
  }
  const clubPlek = () => Math.abs(camera.position.x) < CLUB && Math.abs(camera.position.z) < CLUB;
  // zoals de bol-opname in index.html indeelt: buiten zaal 1 (topobject verder dan ROOM + 1) en klein decor apart houden,
  // zodat een samenvoeging in de bol in zijn geheel aan of uit gaat
  function soort(o) {
    let t = o; while (t.parent && t.parent !== scene) t = t.parent;
    const ver = typeof ROOM !== 'undefined' && (Math.abs(t.position.x) > ROOM + 1 || Math.abs(t.position.z) > ROOM + 1);
    let klein = false;
    try { klein = typeof isKleinDecor === 'function' && isKleinDecor(o); } catch (e) {}
    return (ver ? 'v' : '') + (klein ? 'k' : '');
  }
  const bouwRij = [];
  let planSt = null;
  function planStap(eind) {  // eerst bevriezen wat lang genoeg stilstond, dan indelen in groepen (per anker, materiaal, vlaggen)
    if (!planSt) planSt = { fase: 0, it: REC.values(), i: 0, groepen: new Map() };
    const P = planSt;
    if (P.fase === 0) {
      for (let n = 0; ; n++) {
        if ((n & 15) === 15 && performance.now() > eind) return true;
        const x = P.it.next();
        if (x.done) break;
        const r = x.value;
        if (r.st === 0 && tik - r.t0 >= STIL) bevries(r);
      }
      if (!nieuwVast || bouwRij.length || bouwSt || !clubPlek() || (typeof LAAD !== 'undefined' && LAAD.klaar < LAAD.totaal)) { planSt = null; return false; }
      nieuwVast = false; P.fase = 1;
    }
    while (P.i < VAST.length) {
      if (performance.now() > eind) return true;
      const r = VAST[P.i++];
      if (r.st !== 1 || r.groep || !samenbaar(r.o)) continue;
      const o = r.o, e = o.matrixWorld.elements;
      if (Math.abs(e[12]) > CLUB || Math.abs(e[14]) > CLUB) continue;
      // anker = eerste voorouder die beweegt of verborgen is (of de scène); alles ertussen is vast en zichtbaar
      const pad = [];
      let a = o.parent;
      while (a && a !== scene) { const ar = REC.get(a); if (!ar || (ar.st !== 1 && ar.st !== 2) || !a.visible) break; pad.push(ar); a = a.parent; }
      if (!a) continue;
      const m = o.material, mr = matRec(m);
      let mk;
      if (mr.dyn) mk = 'i' + m.uuid;
      else { if (!mr.fp) mr.fp = vingerafdruk(m); mk = 'f' + mr.fp; }
      const k = [a.id, o.castShadow, o.receiveShadow, o.renderOrder, o.layers.mask, soort(o), attrSleutel(o.geometry), mk].join('/');
      let G = P.groepen.get(k);
      if (!G) P.groepen.set(k, G = { anker: a, leden: [], paden: [] });
      G.leden.push(r); G.paden.push(pad);
    }
    for (const G of P.groepen.values()) if (G.leden.length >= 2) bouwRij.push(G);
    planSt = null;
    return false;
  }
  const mA = new THREE.Matrix4(), nA = new THREE.Matrix3();
  let groepNr = 0;
  // samenvoegen in stukjes: per beeld een paar leden; aan het eind nakijken of alles nog vast en ongewijzigd is
  let bouwSt = null;
  const geldig = (r, pad) => r.st === 1 && !r.groep && pad.every(p => p.st === 1 || p.st === 2) && zelfdeT(r) && zelfdeM(r);
  function bouwStap(eind) {
    while (performance.now() < eind) {
      if (!bouwSt) {
        const G = bouwRij.shift();
        if (!G) return false;
        if (!inScene(G.anker)) continue;
        const idx = G.leden.map((r, i) => i).filter(i => geldig(G.leden[i], G.paden[i]));
        if (idx.length < 2) continue;
        bouwSt = bouwBegin(G.anker, idx.map(i => G.leden[i]), idx.map(i => G.paden[i]));
        continue;
      }
      const B = bouwSt;
      if (B.j < B.leden.length) { bouwLid(B, B.j++); continue; }
      bouwSt = null;
      if (inScene(B.anker) && B.leden.every((r, i) => r.v === B.versies[i] && geldig(r, B.paden[i]) && B.paden[i].every((p, k) => p.v === B.padVersies[i][k]))) bouwAf(B);
    }
    return !!bouwSt || bouwRij.length > 0;
  }
  function bouwBegin(anker, leden, paden) {
    const g0 = leden[0].o.geometry, namen = Object.keys(g0.attributes);
    let nv = 0, ni = 0;
    for (const r of leden) { const g = r.o.geometry; nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
    const uit = {};
    for (const k of namen) { const a = g0.attributes[k]; uit[k] = new a.array.constructor(nv * a.itemSize); }
    return { anker, leden, paden, namen, g0, uit, index: nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni), v0: 0, i0: 0, j: 0,
      versies: leden.map(r => r.v), padVersies: paden.map(p => p.map(r => r.v)) };
  }
  function bouwLid(B, li) {
    const r = B.leden[li], o = r.o, g = o.geometry, n = g.attributes.position.count, v0 = B.v0, i0 = B.i0, index = B.index;
    // ligging t.o.v. het anker: de (bevroren) lokale matrices van het pad, van onder naar boven vermenigvuldigd
    mA.copy(o.matrix);
    for (const p of B.paden[li]) mA.premultiply(p.o.matrix);
    nA.getNormalMatrix(mA);
    const e = mA.elements, ne = nA.elements;
    for (const k of B.namen) {
      const a = g.attributes[k], d = B.uit[k], s = a.itemSize;
      if (k === 'position') for (let i = 0; i < n; i++) { const x = a.getX(i), y = a.getY(i), z = a.getZ(i), j = (v0 + i) * 3; d[j] = e[0] * x + e[4] * y + e[8] * z + e[12]; d[j + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; d[j + 2] = e[2] * x + e[6] * y + e[10] * z + e[14]; }
      else if (k === 'normal') for (let i = 0; i < n; i++) {
        const x = a.getX(i), y = a.getY(i), z = a.getZ(i), j = (v0 + i) * 3;
        const nx = ne[0] * x + ne[3] * y + ne[6] * z, ny = ne[1] * x + ne[4] * y + ne[7] * z, nz = ne[2] * x + ne[5] * y + ne[8] * z;
        const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        d[j] = nx / l; d[j + 1] = ny / l; d[j + 2] = nz / l;
      }
      else if (a.isInterleavedBufferAttribute) for (let i = 0; i < n; i++) for (let c = 0; c < s; c++) d[(v0 + i) * s + c] = c === 0 ? a.getX(i) : c === 1 ? a.getY(i) : c === 2 ? a.getZ(i) : a.getW(i);
      else d.set(a.array.subarray(0, n * s), v0 * s);
    }
    const spiegel = mA.determinant() < 0;  // gespiegeld: driehoeken omdraaien (three draait dan de voorkant om, dat doet de samenvoeging niet)
    const ix = g.index, m = ix ? ix.count : n;
    for (let t = 0; t < m; t += 3) {
      const a0 = ix ? ix.getX(t) : t, a1 = ix ? ix.getX(t + 1) : t + 1, a2 = ix ? ix.getX(t + 2) : t + 2;
      index[i0 + t] = v0 + a0; index[i0 + t + 1] = v0 + (spiegel ? a2 : a1); index[i0 + t + 2] = v0 + (spiegel ? a1 : a2);
    }
    B.v0 += n; B.i0 += m;
  }
  function bouwAf(B) {
    const { anker, leden, paden, namen, g0 } = B;
    const geo = new THREE.BufferGeometry();
    for (const k of namen) { const a = g0.attributes[k]; geo.setAttribute(k, new THREE.BufferAttribute(B.uit[k], a.itemSize, a.normalized)); }
    geo.setIndex(new THREE.BufferAttribute(B.index, 1));
    geo.computeBoundingSphere();
    const o0 = leden[0].o, mesh = new THREE.Mesh(geo, o0.material);
    mesh.castShadow = o0.castShadow; mesh.receiveShadow = o0.receiveShadow; mesh.renderOrder = o0.renderOrder;
    mesh.matrixAutoUpdate = false; mesh.userData.optSamen = true; mesh.name = 'opt-samen';
    anker.add(mesh);
    mesh.updateMatrixWorld(true);
    const G = { anker, mesh, leden, pad: [], mats: null, actief: false, lm: o0.layers.mask, nr: groepNr++ };
    const mats = new Set(leden.map(r => r.o.material));
    if (mats.size > 1) G.mats = [...mats].map(matRec);  // gelijke maar losse materialen: elke update nakijken
    const padSet = new Set();
    for (const p of paden) for (const r of p) padSet.add(r);
    G.pad = [...padSet];
    for (const r of G.pad) (r.afh || (r.afh = new Set())).add(G);
    for (const r of leden) { r.lm = r.o.layers.mask; r.st = 2; r.groep = G; snap(r); }
    zetActief(G, leden.every(r => r.o.visible) && G.pad.every(r => r.o.visible));
    GROEPEN.add(G);
    tel.groepen++; tel.leden += leden.length;
  }

  // ---------- onderhoud: één keer per beeld (clubHook) ----------
  scene.updateMatrix();
  scene.matrixAutoUpdate = false;  // de scène zelf staat stil; anders rekent elke update alle kinderen opnieuw uit (force)
  while (ontdekStap(Infinity));
  // taken in volgorde van voorrang; elk beeld samen hooguit BUDGET ms
  const BUDGET = 0.5;
  const TAKEN = [['klus', klusStap], ['bouw', bouwStap], ['plan', planStap], ['kijk', kijkStap], ['ontdek', ontdekStap], ['snoei', snoeiStap]].map(([naam, stap]) => ({ naam, stap, aan: false }));
  const taak = naam => TAKEN.find(t => t.naam === naam);
  const KLUS = taak('klus'), BOUW = taak('bouw'), PLAN = taak('plan'), KIJK = taak('kijk'), ONTDEK = taak('ontdek'), SNOEI = taak('snoei');
  clubHooks.push(() => {
    if (!aan || !geschakeld) return;
    const t0 = performance.now();
    try { onderhoud(); } finally { const ms = performance.now() - t0; if (ms > tel.onderhoudMax) tel.onderhoudMax = ms; if (ms > 2) tel.onderhoudLang++; }
  });
  function onderhoud() {
    tik++; diepte = 0;
    if (!scene.onBeforeRender.optHaak || !scene.onAfterRender.optHaak) haakRender();
    // niemand riep scene.updateMatrixWorld via onze haak aan terwijl er wel getekend werd: haak opnieuw zetten
    if (umwTel === umwTelVorig && tijdperk !== tijdperkVorig) haakMatrix();
    umwTelVorig = umwTel; tijdperkVorig = tijdperk;
    if (figWacht.size) figurenKlaar();
    if (klussen.length) KLUS.aan = true;
    if (bouwRij.length || bouwSt) BOUW.aan = true;
    if (tik % 8 === 0) KIJK.aan = true;
    if (tik % 120 === 30) ONTDEK.aan = true;
    if (tik % 120 === 90) SNOEI.aan = true;
    if (tik % 120 === 100) PLAN.aan = true;
    const eind = performance.now() + BUDGET;
    for (const T of TAKEN) {
      if (!T.aan) continue;
      if (performance.now() >= eind) break;
      const t1 = performance.now();
      T.aan = T.stap(eind);
      const ms = performance.now() - t1;
      if (!(duurMax[T.naam] >= ms)) duurMax[T.naam] = +ms.toFixed(2);
    }
  }
  const duurMax = {};
  tel.duurMax = duurMax;

  // ---------- alles terug (vergelijken in dezelfde sessie) ----------
  window.clubOpt.uit = function () {
    if (!aan) return;
    aan = false;
    for (const G of [...GROEPEN]) groepTerug(G);
    for (const r of REC.values()) if (r.st === 1 || r.st === 2) { ontdooi(r); r.st = 3; }
    VAST.length = 0;
    scene.matrixAutoUpdate = true;
    scene.traverse(o => { if (o._optFig) { o.frustumCulled = false; delete o._optFig; } });
    FR.intersectsObject = orgSnijdt;
    scene.updateMatrixWorld(true);
  };
  // tijdelijk zonder samenvoegingen, rook-bakken en figuren-culling tekenen (bevroren matrices blijven): voor een A/B in dezelfde toestand
  // welk (alleen bij uitzetten): 'groepen' | 'rook' | 'figuren' = alleen dat deel uit
  window.clubOpt.schakel = (j, welk) => {
    j = !!j;
    if (!aan || j === geschakeld) return geschakeld;
    geschakeld = j;
    if (!welk || welk === 'groepen') for (const G of GROEPEN) zetActief(G, j && G.leden.every(r => r.o.visible) && G.pad.every(r => r.o.visible));
    rookSchakel = !welk || welk === 'rook' ? j : true;
    if (!welk || welk === 'figuren') scene.traverse(o => { if (o._optFig) o.frustumCulled = j; });
    return geschakeld;
  };
  window.clubOpt.bench = (n = 200) => {  // µs per aanroep van de nakijkers (alleen om te meten)
    const tm = f => { for (let k = 0; k < 20; k++) f(); const t0 = performance.now(); for (let k = 0; k < n; k++) f(); return Math.round((performance.now() - t0) / n * 1000 * 10) / 10; };
    return { vastWacht: tm(vastWacht), tekenWacht: tm(tekenWacht), groepWacht: tm(groepWacht), vast: VAST.length, groepen: GROEPEN.size };
  };
  window.clubOpt.staat = () => {
    const st = [0, 0, 0, 0];
    for (const r of REC.values()) st[r.st]++;
    let actief = 0; for (const G of GROEPEN) if (G.actief) actief++;
    return { kijk: st[0], vast: st[1], samen: st[2], los: st[3], groepen: GROEPEN.size, actief, rook: tel.rook, rookWeg: tel.rookWeg, figuren: tel.figuren,
      wachtUs: tel.wachtN ? Math.round(tel.wachtMs / tel.wachtN * 1000) : 0, vastUs: tel.vastN ? Math.round(tel.vastMs / tel.vastN * 1000) : 0, terug: tel.terug };
  };
})();

// --- Het doolhof: achter een nieuwe ∞-deur in de rechterwand van zaal 2 begint een eindeloos gebouw van kamers ---
// Kamers staan ver van de club (x -400 en verder, z 300; daar knipt de regie niet weg) en er bestaan er hooguit twee tegelijk:
// de kamer waar de loper is en de volgende (al gebouwd en opgewarmd, maar verborgen). Tussen twee kamers ligt een donkere
// S-gang (2 x 2,6 m, rode lampjes). De gang achter de uitgang van kamer A en die vóór de ingang van kamer B zijn exact gelijk;
// in het dwarsstuk (geen deur in zicht) zet de kern loper en camera ongemerkt van A's gang naar dezelfde plek in B's gang.
// Kamermodules (doolhof/*.js) registreren een soort: doolhof.registreer(soort, { gewicht, maak(ctx) => kamer }) (contract: ctx/kamer hieronder).
// Shot SHOTS.doolhof: een loper loopt van het midden van zaal 2 door de ∞-deur en door 3-5 kamers ('Camera: het doolhof' = eindeloos);
// in 'auto' volgt hij in de helft van de gevallen op de trip. Test: doolhof.start('boiler') of doolhof.volgende = 'boiler'.
(function () {
  'use strict';
  const doolhof = window.doolhof = window.doolhof || {};
  doolhof.kamers = doolhof.kamers || {};
  doolhof.actief = null;     // de kamer (wat maak() teruggaf) waar de camera nu is
  doolhof.volgende = null;   // soort die als volgende kamer moet komen (testen); daarna weer loting
  doolhof.registreer = function (soort, def) {
    if (!soort || !def || typeof def.maak !== 'function') { console.error('doolhof.registreer: soort + { gewicht, maak(ctx) } nodig', soort); return; }
    doolhof.kamers[soort] = def;
  };
  if (typeof SHOTS === 'undefined' || typeof zone2 === 'undefined' || typeof makeModelDancer === 'undefined') return;

  // --- maten en standen ---
  const L1 = 2.6, L2 = 5.2, L3 = 2.6, GW = 2.0, GH = 2.6;  // S-gang: been, dwarsstuk, been; breedte en hoogte = de deur
  const BACK = 2.4, VOORUIT = 1.2, OOG = 1.7, LOOP = 1.15; // camera zoveel meter achter de loper op zijn pad; LOOP = tempo van de loopclip
  const SLOT_X = -400, SLOT_STAP = 150, SLOT_Z = 300;     // plekken voor de kamers (om en om, ver van elkaar: buiten het zicht)
  const MAXFIG = [10, 6, 5], MAXLAMP = [2, 1, 0], POOL_MAX = 24;
  const zwaar = () => KW.stand === 'minimaal' ? 2 : KW.stand === 'laag' ? 1 : 0;
  const V3 = (x, z) => new THREE.Vector3(x, 0, z);
  const glad = (x, a, b) => THREE.MathUtils.smoothstep(x, a, b);
  const tA = new THREE.Vector3(), tB = new THREE.Vector3(), tP = new THREE.Vector3(), tL = new THREE.Vector3(), zv = new THREE.Vector3();
  const fout = (wat, e) => console.error('doolhof: ' + wat, e);

  // --- paden: afgeronde lijnen met booglengte ---
  function afronden(pts, r, n = 6) {  // hoeken vervangen door een boogje (kwadratische bezier) van hooguit r voor en na de hoek
    const uit = [pts[0].clone()];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1], b = pts[i], c = pts[i + 1], d1 = a.distanceTo(b), d2 = b.distanceTo(c);
      const u1 = tA.subVectors(b, a).normalize(), u2 = tB.subVectors(c, b).normalize(), rr = Math.min(r, d1 / 2, d2 / 2);
      if (rr < 1e-3 || u1.dot(u2) > 0.995) { uit.push(b.clone()); continue; }
      const p0 = b.clone().addScaledVector(u1, -rr), p2 = b.clone().addScaledVector(u2, rr);
      for (let k = 0; k <= n; k++) { const t = k / n, s = 1 - t; uit.push(V3(s * s * p0.x + 2 * s * t * b.x + t * t * p2.x, s * s * p0.z + 2 * s * t * b.z + t * t * p2.z)); }
    }
    uit.push(pts[pts.length - 1].clone());
    return uit;
  }
  function maakSpoor(pts) {
    const p = [pts[0]], cum = [0];
    for (let i = 1; i < pts.length; i++) { const d = pts[i].distanceTo(p[p.length - 1]); if (d < 1e-4) continue; p.push(pts[i]); cum.push(cum[cum.length - 1] + d); }
    return { pts: p, cum, len: cum[cum.length - 1] };
  }
  function opSpoor(sp, s, uit) {
    const c = sp.cum, n = c.length;
    if (s <= 0 || n < 2) return uit.copy(sp.pts[0]);
    if (s >= sp.len) return uit.copy(sp.pts[n - 1]);
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= s) lo = m; else hi = m; }
    return uit.lerpVectors(sp.pts[lo], sp.pts[hi], (s - c[lo]) / (c[hi] - c[lo]));
  }
  // de S-gang in zijn eigen ruimte: begint in (0,0) richting +z, dwarsstuk naar +x, eindigt in (L2, L1+L3) weer richting +z
  const SBS = maakSpoor(afronden([V3(0, 0), V3(0, L1), V3(L2, L1), V3(L2, L1 + L3)], 0.8)), SB_LEN = SBS.len;
  const boogBij = (sp, x, z) => { let b = 0, bd = 1e9; sp.pts.forEach((p, i) => { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; b = sp.cum[i]; } }); return b; };
  // wisselpunt: de camera (BACK erachter) is net de eerste bocht om, de loper is nog vóór de tweede: geen deur in beeld
  const E_TP = boogBij(SBS, 0.8, L1) + BACK + 0.25;
  const frameMat = f => new THREE.Matrix4().makeRotationY(f.yaw).setPosition(f.x, 0, f.z);
  const sbPunten = (f, sx) => { const m = frameMat(f); return SBS.pts.map(p => V3(p.x * sx, p.z).applyMatrix4(m)); };

  // --- gedeeld spul: nooit weggooien ---
  const KEEP = new Set([BOX, CYL, SPH, CONE, glassGeo, drinkGeo, cigGeo, tipGeo, slimeGeo, wallTex, envRT.texture, hiddenMat, tripMat, ...smokeTex]);
  const houd = x => { KEEP.add(x); return x; };
  const houden = x => !x || KEEP.has(x) || (x.userData && x.userData.doolhofHouden);

  // --- de donkere S-gang: één sjabloon, elke gang is een kloon (zelfde geometrie, zelfde materialen: de wissel valt niet op) ---
  const gangMuur = houd(new THREE.MeshBasicMaterial({ map: wallTex, color: 0x2e2527 }));
  const gangVloer = houd(new THREE.MeshBasicMaterial({ color: 0x0b090b }));
  const gangPlafond = houd(new THREE.MeshBasicMaterial({ color: 0x060406 }));
  const gangLamp = houd(new THREE.MeshBasicMaterial({ color: 0xff3020 }));
  const gloedTex = houd(canvasTexture(64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }));
  const gangGloed = houd(new THREE.MeshBasicMaterial({ map: gloedTex, color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  function gangVlak(g, mat, w, h, x, y, z, ry, rx) {
    const m = new THREE.Mesh(houd(new THREE.PlaneGeometry(w, h)), mat);
    m.position.set(x, y, z); m.rotation.set(rx || 0, ry || 0, 0); g.add(m); return m;
  }
  const gangSjabloon = (() => {
    const g = new THREE.Group(), h = GW / 2;
    const mx = (x, z0, z1, n) => gangVlak(g, gangMuur, z1 - z0, GH, x, GH / 2, (z0 + z1) / 2, n > 0 ? Math.PI / 2 : -Math.PI / 2);  // muur langs z, kijkt naar +x of -x
    const mz = (z, x0, x1, n) => gangVlak(g, gangMuur, x1 - x0, GH, (x0 + x1) / 2, GH / 2, z, n > 0 ? 0 : Math.PI);                   // muur langs x, kijkt naar +z of -z
    mx(-h, 0, L1 + h, 1); mx(h, 0, L1 - h, -1);
    mz(L1 + h, -h, L2 - h, -1); mz(L1 - h, h, L2 + h, 1);
    mx(L2 + h, L1 - h, L1 + L3, -1); mx(L2 - h, L1 + h, L1 + L3, 1);
    mz(0, -h, h, 1).userData.kap = 'begin';
    mz(L1 + L3, L2 - h, L2 + h, -1).userData.kap = 'eind';
    for (const [x0, x1, z0, z1] of [[-h, h, 0, L1 - h], [-h, L2 + h, L1 - h, L1 + h], [L2 - h, L2 + h, L1 + h, L1 + L3]]) {
      gangVlak(g, gangVloer, x1 - x0, z1 - z0, (x0 + x1) / 2, 0, (z0 + z1) / 2, 0, -Math.PI / 2);
      gangVlak(g, gangPlafond, x1 - x0, z1 - z0, (x0 + x1) / 2, GH, (z0 + z1) / 2, 0, Math.PI / 2);
    }
    const ruw = maakSpoor([V3(0, 0), V3(0, L1), V3(L2, L1), V3(L2, L1 + L3)]);  // rode lampjes op de middellijn
    for (let b = 1.3; b < ruw.len; b += 2.6) {
      const p = opSpoor(ruw, b, new THREE.Vector3());
      add(g, SPH, gangLamp, [p.x, GH - 0.07, p.z], [0.05, 0.05, 0.05]);
      gangVlak(g, gangGloed, 1.2, 1.2, p.x, GH - 0.012, p.z, 0, Math.PI / 2);
    }
    return g;
  })();
  // gang plaatsen: frame f = begin en richting (yaw) in de ruimte van parent, sx = dwarsstuk naar rechts (1) of links (-1), kap = welk eind dicht
  function gang(parent, f, sx, kap) {
    const g = gangSjabloon.clone();
    for (const c of [...g.children]) if (c.userData.kap && c.userData.kap !== kap) g.remove(c);
    g.position.set(f.x, 0, f.z); g.rotation.y = f.yaw; g.scale.x = sx;  // spiegelen mag: three draait de voorkant dan zelf om
    parent.add(g); return g;
  }
  clubHooks.push(() => {  // lampjes kloppen zacht mee (gedeeld materiaal: elke gang gelijk)
    gangLamp.color.setRGB(1, 0.2, 0.12).multiplyScalar(0.55 + 0.45 * pulse);
    gangGloed.color.setRGB(0.45, 0.05, 0.03).multiplyScalar(0.6 + 0.4 * pulse);
  });

  // --- de ∞-deur: rechterwand van zaal 2 (x = 17) rond z = 30, met dezelfde S-gang erachter ---
  const ZD = { x: Z2.x + Z2.w / 2, z: 30 };
  const ZAAL2_UIT = { x: ZD.x, z: ZD.z, yaw: Math.PI / 2 }, ZAAL2_SX = 1;
  (function bouwDeur() {
    const room2 = zone2.children.find(o => o.isMesh && Array.isArray(o.material) && o.material[0] === tripMat);
    if (!room2) { console.error('doolhof: wand van zaal 2 niet gevonden'); return; }
    room2.material = room2.material.slice(); room2.material[0] = hiddenMat;
    const X = ZD.x, z0 = Z2.z - Z2.d / 2, z1 = Z2.z + Z2.d / 2, H = Z2.h, DZ0 = ZD.z - GW / 2, DZ1 = ZD.z + GW / 2;
    // wand in drie stukken om de deur; vlak kijkt naar buiten (+x), het BackSide-materiaal toont hem van binnen; uv zoals de doos-wand
    const stuk = (mat, x, za, zb, ya, yb) => {
      const g = new THREE.PlaneGeometry(zb - za, yb - ya), pos = g.attributes.position, uv = g.attributes.uv, cz = (za + zb) / 2, cy = (ya + yb) / 2;
      for (let i = 0; i < pos.count; i++) uv.setXY(i, (z1 - (cz - pos.getX(i))) / Z2.d, (cy + pos.getY(i)) / H);
      const m = new THREE.Mesh(g, mat); m.position.set(x, cy, cz); m.rotation.y = Math.PI / 2; zone2.add(m); return m;
    };
    for (const [za, zb, ya, yb] of [[z0, DZ0, 0, H], [DZ1, z1, 0, H], [DZ0, DZ1, GH, H]]) stuk(tripMat, X, za, zb, ya, yb);
    // blacklight-binnendoos van z2/lasers.js: ook daar een gat, de stukken volgen zijn zichtbaarheid
    const uvDoos = zone2.children.find(o => o.isMesh && o.geometry === BOX && Array.isArray(o.material) && o.material.length === 6 &&
      o.material[0].blending === THREE.AdditiveBlending && o.material[0].side === THREE.BackSide);
    if (uvDoos) {
      const uvMat = uvDoos.material[0], e = 0.03, stukken = [];
      uvDoos.material = uvDoos.material.slice(); uvDoos.material[0] = hiddenMat;
      for (const [za, zb, ya, yb] of [[z0 + e, DZ0, 0.02, H - 0.02], [DZ1, z1 - e, 0.02, H - 0.02], [DZ0, DZ1, GH, H - 0.02]]) { const m = stuk(uvMat, X - e, za, zb, ya, yb); m.visible = false; stukken.push(m); }
      z2Hooks.push(() => { for (const m of stukken) m.visible = uvDoos.visible; });
    }
    const kozijn = std(0x18161c, 0.6, 0.5);
    for (const dz of [-GW / 2 - 0.06, GW / 2 + 0.06]) add(zone2, BOX, kozijn, [X - 0.05, GH / 2, ZD.z + dz], [0.12, GH, 0.12]);
    add(zone2, BOX, kozijn, [X - 0.05, GH + 0.06, ZD.z], [0.12, 0.12, GW + 0.24]);
    add(zone2, BOX, kozijn, [X - 0.04, 3.25, ZD.z], [0.04, 0.62, 1.9]);  // donkere plaat: additief neon verdween op de felle kaleidoscoopwand
    const bord = neonSign('∞', '#3cffc8', 1.6, 0.4); bord.position.set(X - 0.08, 3.25, ZD.z); bord.rotation.y = -Math.PI / 2; zone2.add(bord);
    gang(zone2, ZAAL2_UIT, ZAAL2_SX, 'eind');
  })();

  // --- figuren: een eigen voorraad (geen nieuwe klonen per kamer: geen hapering bij het bouwen, geen geheugengroei) ---
  const pool = [];  // { d, M, vrij, orig: Map(mesh -> materiaal) }, op volgorde van gebruik (vooraan = langst niet gebruikt)
  function maakPoolFig(M) {
    const d = makeModelDancer(M, false);
    if (d.root.parent) d.root.parent.remove(d.root);
    M.used = Math.max(0, (M.used || 1) - 1);  // telt niet mee voor de verdeling van de club
    d.root.traverse(o => { o.castShadow = false; });
    const p = { d, M, vrij: true, orig: new Map(), vast: new Set() };
    d.body.traverse(o => { if (o.isMesh) p.orig.set(o, o.material); if (o.isBone) for (const c of o.children) if (!c.isBone) p.vast.add(c); });
    pool.push(p);
    return p;
  }
  function weggooien(p) {
    pool.splice(pool.indexOf(p), 1);
    const d = p.d;
    if (d.root.parent) d.root.parent.remove(d.root);
    d.mixer.stopAllAction(); d.mixer.uncacheRoot(d.body);
    d.body.traverse(o => { if (o.isSkinnedMesh && o.skeleton) o.skeleton.dispose(); });
    for (const m of p.orig.values()) if (!houden(m)) m.dispose();  // eigen kloon van de herkleuring; texturen horen bij het model
  }
  function lenen(R, filter, paal) {
    const mag = M => !M.keep && (!filter || filter.test(M.file));
    let ms = (paal ? poleModels() : allModels()).filter(mag);
    if (!ms.length && filter && !paal) ms = allModels().filter(M => !M.keep);  // filter vond niets: dan een ander figuur
    if (!ms.length) return null;
    // het model dat in deze kamer het minst voorkomt, liefst eentje dat al vrij in de voorraad staat
    const tel = M => R ? R.modelTel.get(M) || 0 : 0, lo = Math.min(...ms.map(tel)), kand = ms.filter(M => tel(M) === lo);
    const vrijM = kand.filter(M => pool.some(q => q.vrij && q.M === M)), M = pick(vrijM.length ? vrijM : kand);
    let p = pool.find(q => q.vrij && q.M === M);
    if (!p) {
      if (pool.length >= POOL_MAX) { const oud = pool.find(q => q.vrij); if (!oud) return null; weggooien(oud); }
      p = maakPoolFig(M);
    }
    p.vrij = false;
    pool.splice(pool.indexOf(p), 1); pool.push(p);
    return p;
  }
  // andere kleuren dan de vorige keer: de uniforms van recolorMat zitten na het compileren in de renderer-eigenschappen
  function herkleur(p, full) {
    p.d.body.traverse(o => {
      if (!o.isMesh) return;
      for (const m of new Set([].concat(o.material, p.orig.get(o) || []))) {
        const pr = renderer.properties.get(m), u = pr && pr.uniforms;
        if (!u || !u.uTop) continue;
        u.uTop.value = full ? Math.random() : rnd(-0.25, 0.25);
        u.uCloth.value.setHSL(Math.random(), rnd(0.2, 0.9), rnd(0.35, 0.8)).convertLinearToSRGB();
        u.uDark.value.setHSL(Math.random(), rnd(0.3, 0.9), rnd(0.15, 0.4)).convertLinearToSRGB();
        u.uDarkMix.value = full && Math.random() > 0.35 ? rnd(0.5, 1) : 0;
        u.uHair.value.set(pick(HAIR)).convertLinearToSRGB();
        u.uSkin.value = pick([0.55, 0.75, 1, 1.25, 1.45]);
      }
    });
  }
  function maat(p, paal) {  // maat en spiegeling zoals makeModelDancer (paal: ware grootte, daar zijn de grepen op berekend)
    const M = p.M, s = paal ? 1 : (M.type === 'alien' ? rnd(2.05, 2.35) : rnd(1.6, 1.85)) / M.h;
    p.d.body.scale.set((Math.random() < 0.4 ? -1 : 1) * s, s, s);
  }
  function terug(p) {  // figuur terug in de voorraad, schoon voor de volgende kamer
    const d = p.d;
    if (d.root.parent) d.root.parent.remove(d.root);
    d.mixer.stopAllAction();
    for (let i = held.length - 1; i >= 0; i--) if (held[i].d === d) { scene.remove(held[i].g); held.splice(i, 1); }
    for (let i = smokers.length - 1; i >= 0; i--) if (smokers[i].d === d) smokers.splice(i, 1);
    const weg = [];  // sigaret, telefoon en ander spul aan de botten
    d.body.traverse(o => { if (o.isBone) for (const c of o.children) if (!c.isBone && !p.vast.has(c)) weg.push(c); });
    for (const c of weg) { c.parent.remove(c); c.traverse(o => { if (o.geometry && !houden(o.geometry)) o.geometry.dispose(); if (o.material && !houden(o.material)) o.material.dispose(); }); }
    d.body.traverse(o => {  // eigen materiaal van een kamer eraf (de lambert-kopie van club/kwaliteit.js mag blijven)
      const org = p.orig.get(o), m = o.material;
      if (org && m !== org && !(m && m.isMeshLambertMaterial && m.userData === org.userData)) o.material = org;
    });
    Object.assign(d, { cur: null, prev: null, fade: 1, fadeK: 0.7, fadeRate: 2, queue: null, acts: null, actT: 0, nextChange: 0, tq: 0, px: 0, pz: 0,
      faceT: undefined, yOff: undefined, seat: undefined, zitPlek: null, zitKlaar: false, rol: null, djBasis: null, loopA: null, calm: false });
    d.home.set(0, 0, 0); d.face = 0;
    d.root.position.set(0, 0, 0); d.root.rotation.set(0, 0, 0); d.root.visible = true; d.body.visible = true;
    p.vrij = true;
  }

  // --- opruimen: geometrie, materialen en texturen die alleen in deze groep zaten ---
  function verzamel(root, G, Mt, T) {
    root.traverse(o => {
      if (o.geometry) G.add(o.geometry);
      if (!o.material) return;
      for (const m of [].concat(o.material)) {
        if (!m) continue;
        Mt.add(m);
        for (const k in m) { const v = m[k]; if (v && v.isTexture) T.add(v); }
        if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k] && m.uniforms[k].value; if (v && v.isTexture) T.add(v); }
      }
    });
  }
  function afvoeren(groep) {
    const G = new Set(), Mt = new Set(), T = new Set(), g2 = new Set(), m2 = new Set(), t2 = new Set();
    verzamel(groep, G, Mt, T);
    verzamel(scene, g2, m2, t2);  // wat de rest van de scène (club, zaal 2, de andere kamer) nog gebruikt, blijft
    for (const p of pool) verzamel(p.d.root, g2, m2, t2);
    for (const x of G) if (!g2.has(x) && !houden(x)) x.dispose();
    for (const x of Mt) if (!m2.has(x) && !houden(x)) x.dispose();
    for (const x of T) if (!t2.has(x) && !houden(x)) x.dispose();
  }

  // --- standaardmaterialen van ctx.doos (onverlicht: geen lamp nodig, ook op de tv) ---
  const tegelTex = houd(canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#0e0d10'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const v = 30 + Math.floor(Math.random() * 16); g.fillStyle = `rgb(${v},${v - 3},${v + 4})`; g.fillRect(x * 64 + 2, y * 64 + 2, 60, 60); }
    const img = g.getImageData(0, 0, w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 14; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    g.putImageData(img, 0, 0);
  }));
  tegelTex.wrapS = tegelTex.wrapT = THREE.RepeatWrapping;
  const DOOS = {
    vloer: houd(new THREE.MeshBasicMaterial({ map: tegelTex, color: 0x9a96a4 })),
    muur: houd(new THREE.MeshBasicMaterial({ map: wallTex, color: 0x4a4048 })),
    plafond: houd(new THREE.MeshBasicMaterial({ color: 0x0d0b10 })),
  };
  // vlak dat naar binnen kijkt; uv = deel [u0,u1,v0,v1] zodat stukken van één wand doorlopen.
  // BackSide-materiaal (zoals de club-doos): winding en normalen om, dan toont BackSide dezelfde binnenkant met dezelfde uv.
  function binnenVlak(parent, mat, bw, bh, pos, ry, rx, uv) {
    const g = new THREE.PlaneGeometry(bw, bh);
    if (uv) { const a = g.attributes.uv; for (let i = 0; i < a.count; i++) a.setXY(i, uv[0] + a.getX(i) * (uv[1] - uv[0]), uv[2] + a.getY(i) * (uv[3] - uv[2])); }
    if (mat.side === THREE.BackSide) {
      const idx = g.index.array; for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
      const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
    }
    const m = new THREE.Mesh(g, mat); m.position.set(pos[0], pos[1], pos[2]); m.rotation.set(rx || 0, ry || 0, 0); parent.add(m); return m;
  }
  function doos(R, o) {
    o = o || {};
    const w = Math.max(2.4, +o.w || 10), d = Math.max(2.4, +o.d || 14), h = Math.max(2.7, +o.h || 4), dh = Math.min(GH, h);
    const muur = i => (Array.isArray(o.muur) ? o.muur[i] : o.muur) || DOOS.muur, vl = o.vloer || DOOS.vloer, pl = o.plafond || DOOS.plafond;
    const g = new THREE.Group(); R.groep.add(g);
    binnenVlak(g, vl, w, d, [0, 0, 0], 0, -Math.PI / 2, vl === DOOS.vloer ? [0, w / 2, 0, d / 2] : null);  // standaardvloer: tegels van 0,5 m
    binnenVlak(g, pl, w, d, [0, h, 0], 0, Math.PI / 2, null);
    binnenVlak(g, muur(0), d, h, [-w / 2, h / 2, 0], Math.PI / 2, 0, null);
    binnenVlak(g, muur(1), d, h, [w / 2, h / 2, 0], -Math.PI / 2, 0, null);
    for (const [i, zw, ry] of [[2, -d / 2, 0], [3, d / 2, Math.PI]]) {  // ingang en uitgang: drie stukken om een deur van 2 x 2,6 m
      const sg = ry ? -1 : 1;  // de uitgangswand is 180 graden gedraaid: zijn 'rechts' is -x
      for (const [a0, a1, b0, b1] of [[-w / 2, -GW / 2, 0, h], [GW / 2, w / 2, 0, h], [-GW / 2, GW / 2, dh, h]]) {
        if (a1 - a0 < 1e-3 || b1 - b0 < 1e-3) continue;
        binnenVlak(g, muur(i), a1 - a0, b1 - b0, [sg * (a0 + a1) / 2, (b0 + b1) / 2, zw], ry, 0, [(a0 + w / 2) / w, (a1 + w / 2) / w, b0 / h, b1 / h]);
      }
    }
    return g;
  }

  // --- ctx: wat een kamer bij het bouwen krijgt ---
  function maakCtx(R) {
    let seed = (Math.random() * 4294967296) >>> 0;
    const rndK = () => {  // mulberry32: per kamer een eigen reeks
      seed = (seed + 0x6D2B79F5) >>> 0; let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
      groep: R.groep, rnd: rndK, zwaar: R.zwaar,
      doos: o => doos(R, o),
      figuur: o => figuur(R, o),
      // lamp-handvat: een PointLight die zelf niet in de scène hangt; de kern zet elk beeld een vaste lamp op zijn plek, kleur en sterkte
      // (zo blijft het aantal lampen gelijk en hoeft niets opnieuw te compileren). Positie in kamer-coördinaten, aan/uit via intensity.
      licht(kleur, sterkte, bereik, x, y, z) {
        if (R.weg || R.lampen.length >= MAXLAMP[R.zwaar]) return null;
        const l = new THREE.PointLight(kleur == null ? 0xffffff : kleur, sterkte == null ? 1 : sterkte, bereik == null ? 10 : bereik, 1.5);
        l.position.set(x || 0, y == null ? 2.5 : y, z || 0); l.visible = false;
        R.lampen.push(l); return l;
      },
      neon(tekst, kleur, b, h) { const m = neonSign(String(tekst), kleur || '#ff2d95', b || 2, h || (b || 2) / 4); R.groep.add(m); return m; },
      trip() { const m = tripMat.clone(); R.trips.push(m); return m; },
      beat: () => ({ pos: beatPos, pulse, energy, bas: bands[0].v, mid: bands[1].v, hoog: bands[2].v }),
    };
  }
  function figuur(R, o) {
    o = o || {};
    if (R.weg || R.figs.length >= MAXFIG[R.zwaar] || !allModels().length) return null;
    let rol = o.rol || 'dans';
    if (rol === 'paal' && !(poleBVH && poleModels().length)) rol = 'dans';
    if ((rol === 'staan' && !ACTS.Stand_and_Chat && !ACTS.Stand_and_Drink) || (rol === 'zit' && !ACTS.Chair_Sit_Idle_F && !ACTS.Chair_Sit_Idle_M && !ACTS.Sit_and_Drink) ||
        (rol === 'juich' && !ACTS.Cheer_with_Both_Hands_Up && !ACTS.Happy_jump_f)) rol = 'dans';  // clips (nog) niet binnen: dan dansen
    if (!['dans', 'staan', 'zit', 'juich', 'dj', 'paal'].includes(rol)) rol = 'dans';
    const p = lenen(R, o.filter instanceof RegExp ? o.filter : null, rol === 'paal');
    if (!p) return null;
    const d = p.d, M = p.M;
    R.modelTel.set(M, (R.modelTel.get(M) || 0) + 1);
    R.figs.push(p);
    herkleur(p, rol === 'paal' || (M.type === 'pop' && !/man-1/.test(M.file)));
    maat(p, rol === 'paal');
    d.rol = rol;
    d.home.set(+o.x || 0, 0, +o.z || 0); d.face = +o.face || 0;
    d.root.position.set(d.home.x, rol === 'paal' ? +o.y || 0 : 0, d.home.z); d.root.rotation.set(0, d.face, 0);
    R.groep.add(d.root);
    d.root.visible = !!R.actief;  // in de nog verborgen volgende kamer: geen rookpluimpjes en drankjes die de club-voorraad opmaken
    if (rol === 'staan') {
      d.acts = ['Stand_and_Chat', 'Stand_and_Drink'].filter(n => ACTS[n]); d.actT = 0;
      const r = Math.random(); if (r < 0.3) giveDrink(d, 'sigaret'); else if (r < 0.65) giveDrink(d, null);
    } else if (rol === 'zit') {  // heupen op (x, 0,69, z), zoals de lounge
      d.yOff = 0.001; d.zitPlek = new THREE.Vector3(d.home.x, 0.69, d.home.z); d.zitKlaar = false;
      const vrouw = /pop-1|witch|burlesque|showgirl/.test(M.file);
      d.acts = [vrouw ? 'Chair_Sit_Idle_F' : 'Chair_Sit_Idle_M', 'Sit_and_Drink'].filter(n => ACTS[n]); d.actT = 0;
      if (Math.random() < 0.5) giveDrink(d, Math.random() < 0.5 ? 'sigaret' : null);
    } else if (rol === 'juich') {
      forceDance(d, ACTS.Cheer_with_Both_Hands_Up || ACTS.Happy_jump_f, beatPos, 8);
    } else if (rol === 'dj') {  // stand-clip op vol gewicht eronder: de dans komt er op halve kracht overheen
      const b = ACTS.Stand_and_Chat || ACTS.Stand_and_Drink;
      if (b) { d.djBasis = d.mixer.clipAction(b); d.djBasis.play(); d.djBasis.setEffectiveWeight(1); }
    } else if (rol === 'paal') {
      const clip = poleClipFor(M);
      d.cur = d.mixer.clipAction(clip); d.cur.play();
      d.cur.time = Math.random() * clip.duration; d.cur.timeScale = rnd(0.9, 1.1);
      if (o.face === undefined) d.root.rotation.y = rnd(0, TAU);
    }
    return d;
  }
  function beweegFig(R, d, dt) {
    switch (d.rol) {
      case 'paal': d.mixer.update(dt); break;
      case 'zit': pose(d, beatPos, energy, dt); zitHier(R, d, dt); break;
      case 'juich': {
        if (!d.queue || !d.queue.length) {  // juichen en springen om de 8 tellen
          const c = d.cur && d.cur.getClip(), ander = c === ACTS.Cheer_with_Both_Hands_Up ? ACTS.Happy_jump_f : ACTS.Cheer_with_Both_Hands_Up;
          d.queue = [[ander || c, 8]];
        }
        pose(d, beatPos, energy, dt); break;
      }
      case 'dj': if (d.djBasis) { const c = d.djBasis.getClip(); d.djBasis.time = (d.djBasis.time + dt) % c.duration; } pose(d, beatPos, energy, dt); break;
      default: pose(d, beatPos, energy, dt);
    }
  }
  function zitHier(R, d, dt) {  // heupen naar de zitplek trekken (elk figuur en elke zitclip heeft een andere heuphoogte)
    const h = hipsOf(d); if (!h || !d.root.parent) return;
    d.root.updateMatrixWorld(true); h.getWorldPosition(zv); d.root.parent.worldToLocal(zv);
    const k = d.zitKlaar ? Math.min(1, dt * 4) : 1, t = d.zitPlek, ex = (t.x - zv.x) * k, ey = (t.y - zv.y) * k, ez = (t.z - zv.z) * k;
    d.zitKlaar = true;
    d.px = (d.px || 0) + ex; d.pz = (d.pz || 0) + ez; d.yOff += ey;
    d.root.position.x += ex; d.root.position.y += ey; d.root.position.z += ez;
  }

  // --- kamers bouwen, kiezen en slopen ---
  let sindsBoiler = 2;
  function kiesSoort(vorige) {
    const K = doolhof.kamers, soorten = Object.keys(K);
    if (doolhof.volgende && K[doolhof.volgende]) { const s = doolhof.volgende; doolhof.volgende = null; return s; }
    if (K.boiler && vorige !== 'boiler' && sindsBoiler >= 3) return 'boiler';  // minstens eens per 4 kamers
    let kand = soorten.filter(s => s !== vorige);
    if (!kand.length) kand = soorten;
    const gw = s => Math.max(0, +K[s].gewicht || 0), som = kand.reduce((a, s) => a + gw(s), 0);
    if (som <= 0) return pick(kand);
    let r = Math.random() * som;
    return kand.find(s => (r -= gw(s)) < 0) || kand[0];
  }
  function kamerRoute(kamer, rndK) {  // looppad in de kamer: van (0,-d/2) naar (0,d/2), de eerste en laatste 0,9 m recht door de deur
    const w = kamer.maat.w, dh = kamer.maat.d / 2;
    let r = Array.isArray(kamer.route) && kamer.route.length >= 2 ? kamer.route.map(p => V3(+p.x || 0, +p.z || 0)) : null;
    if (!r) { const zij = rndK() < 0.5 ? -1 : 1, b = Math.max(0, Math.min(w * 0.15, w / 2 - 1.2)); r = [V3(0, -dh), V3(zij * b * 0.7, -dh / 2), V3(zij * b, 0), V3(zij * b * 0.7, dh / 2), V3(0, dh)]; }
    if (r[0].distanceTo(V3(0, -dh)) > 0.05) r.unshift(V3(0, -dh)); else r[0].set(0, 0, -dh);
    if (r[r.length - 1].distanceTo(V3(0, dh)) > 0.05) r.push(V3(0, dh)); else r[r.length - 1].set(0, 0, dh);
    if (r[1].z > -dh + 1.2) r.splice(1, 0, V3(0, -dh + 0.9));
    if (r[r.length - 2].z < dh - 1.2) r.splice(r.length - 1, 0, V3(0, dh - 0.9));
    return afronden(r, 0.7);
  }
  function probeerKamer(z, soort, sxIn) {
    const def = doolhof.kamers[soort]; if (!def) return null;
    const groep = new THREE.Group(), slot = z.slot++;
    groep.position.set(SLOT_X - (slot % 4) * SLOT_STAP, 0, SLOT_Z);
    groep.visible = false; scene.add(groep); groep.updateMatrixWorld(true); z.eigen.add(groep);
    const R = { isKamer: true, soort, groep, figs: [], lampen: [], trips: [], modelTel: new Map(), zwaar: zwaar(), sxIn, sxUit: Math.random() < 0.5 ? -1 : 1, t0: 0, tIn: null, actief: false };
    R.ctx = maakCtx(R);
    let kamer = null;
    try { kamer = def.maak(R.ctx); } catch (e) { fout('kamer ' + soort + ' bouwen', e); }
    if (!kamer || !kamer.maat || !(kamer.maat.w > 0) || !(kamer.maat.d > 0)) {
      if (kamer !== null) console.error('doolhof: kamer ' + soort + ' gaf geen { maat: { w, d, h } } terug');
      sloop(z, R, true); return null;
    }
    kamer.soort = soort; R.kamer = kamer;
    const m = kamer.maat, G = groep.position, dh = m.d / 2;
    R.blijf = kamer.blijf == null ? 12 : Math.max(0, +kamer.blijf || 0);
    // gangen in de ruimte van de kamer: vóór de ingang (begin dicht) en achter de uitgang (eind dicht)
    const inL = { x: -sxIn * L2, z: -dh - L1 - L3, yaw: 0 }, uitL = { x: 0, z: dh, yaw: 0 };
    gang(groep, inL, sxIn, 'begin'); gang(groep, uitL, R.sxUit, 'eind');
    R.inFrame = { x: G.x + inL.x, z: G.z + inL.z, yaw: 0 }; R.uitFrame = { x: G.x, z: G.z + dh, yaw: 0 };
    // spoor in wereld-coördinaten: gang in, route, gang uit
    const route = kamerRoute(kamer, R.ctx.rnd).map(p => p.add(G));
    R.sp = maakSpoor([...sbPunten(R.inFrame, sxIn), ...route.slice(1), ...sbPunten(R.uitFrame, R.sxUit).slice(1)]);
    R.ingangBoog = SB_LEN; R.uitgangBoog = R.sp.len - SB_LEN; R.tpBoog = R.uitgangBoog + E_TP;
    let bd = 1e9; R.midBoog = (R.ingangBoog + R.uitgangBoog) / 2;  // wachtplek: het punt van de route het dichtst bij het midden
    R.sp.pts.forEach((p, i) => { const b = R.sp.cum[i]; if (b < R.ingangBoog + 0.5 || b > R.uitgangBoog - 0.5) return; const d = Math.hypot(p.x - G.x, p.z - G.z); if (d < bd) { bd = d; R.midBoog = b; } });
    sindsBoiler = soort === 'boiler' ? 0 : sindsBoiler + 1;
    groep.updateMatrixWorld(true);
    return R;
  }
  function bouwKamer(z, soort, sxIn) {
    return probeerKamer(z, soort, sxIn) || (soort !== 'gang-kamer' ? probeerKamer(z, 'gang-kamer', sxIn) : null);
  }
  function sloop(z, R, nu) {
    if (R.weg) return; R.weg = true;
    if (R.kamer && R.kamer.opruimen) try { R.kamer.opruimen(); } catch (e) { fout('opruimen van ' + R.soort, e); }
    for (const p of R.figs) terug(p);
    R.figs.length = 0; R.lampen.length = 0; R.trips.length = 0;
    R.groep.visible = false; scene.remove(R.groep); z.eigen.delete(R.groep);
    if (doolhof.actief === R.kamer) doolhof.actief = null;
    if (nu) afvoeren(R.groep);
    else { z.afvoer.push(R.groep); z.klus.unshift({ wacht: 2, doe: () => { const i = z.afvoer.indexOf(R.groep); if (i >= 0) { z.afvoer.splice(i, 1); afvoeren(R.groep); } } }); }
  }
  // opwarmen: de verborgen kamer één keer klein tekenen (shaders compileren, texturen en geometrie naar de gpu), in dezelfde
  // toestand als na de wissel (zaal 2 uit, club-figuren uit, zelfde lampen): bij de wissel zelf hapert dan niets
  const warmRT = new THREE.WebGLRenderTarget(32, 32), warmCam = new THREE.PerspectiveCamera(100, 1, 0.5, 400);
  warmCam.up.set(0, 0, -1);
  function opwarmen(z, R) {
    const m = R.kamer.maat, G = R.groep.position;
    const ext = Math.max(m.w / 2 + 1, L2 + 2, m.d / 2 + L1 + L3 + 1), hoog = ext / Math.tan(50 * Math.PI / 180) + (m.h || 4) + 2;
    warmCam.position.set(G.x, hoog, G.z); warmCam.lookAt(G.x, 0, G.z); warmCam.updateMatrixWorld();
    const z2v = zone2.visible, gv = R.groep.visible, rt = renderer.getRenderTarget(), fv = R.figs.map(p => p.d.root.visible);
    zone2.visible = false; R.groep.visible = true; for (const p of R.figs) p.d.root.visible = true;
    try { renderer.setRenderTarget(warmRT); renderer.render(scene, warmCam); } catch (e) { fout('opwarmen', e); }
    finally { renderer.setRenderTarget(rt); zone2.visible = z2v; R.groep.visible = gv; R.figs.forEach((p, i) => { p.d.root.visible = fv[i]; }); }
  }

  // --- de club tijdens het doolhof: figuren en wat altijd getekend wordt (frustumCulled uit) onzichtbaar, daarna terug ---
  const tekentAltijd = new WeakMap();
  function zwaarObject(o) {
    let v = tekentAltijd.get(o);
    if (v === undefined) {
      let fc = false, lamp = false;
      o.traverse(c => { if (c.frustumCulled === false && (c.isMesh || c.isPoints || c.isLine)) fc = true; if (c.isLight) lamp = true; });
      v = fc && !lamp;  // niets met een lamp erin: het aantal lampen mag niet veranderen
      tekentAltijd.set(o, v);
    }
    return v;
  }
  function verberg(z) {
    const zet = o => {
      if (!o || z.eigen.has(o)) return;
      if (!z.verborgen.has(o)) z.verborgen.set(o, o.visible); else if (o.visible) z.verborgen.set(o, true);
      o.visible = false;
    };
    for (const lijst of [dancers, crowd, walkers, poleDancers, worms]) for (const d of lijst) if (d && d.root && d.root.parent === scene) zet(d.root);
    if (dj && dj.root) zet(dj.root);
    if (slug) zet(slug.root);
    for (const c of scene.children) if (!z.eigen.has(c) && zwaarObject(c)) zet(c);
  }
  function herstel(z) {
    for (const [o, v] of z.verborgen) o.visible = v;
    for (const w of walkers) if (w && w.root) w.root.visible = w.state !== 'gone';
    z.verborgen.clear();
  }
  function bewaarKW(z) {  // geen bol-opname en geen schaduwkaart van een club die niemand ziet
    if (!z.kw || z.kw.stand !== KW.stand) z.kw = { stand: KW.stand, bol: KW.bol, schaduw: KW.schaduw };
    KW.bol = 0; KW.schaduw = 0;
  }
  function zaal2Licht(z, k) {  // lampen van zaal 2 doven terwijl de loper de ∞-gang in loopt (anders springt zijn belichting bij de wissel)
    for (const o of z.z2lampen) {
      let r = z.z2licht.get(o);
      if (!r) { r = { basis: o.intensity, schreef: NaN }; z.z2licht.set(o, r); }
      else if (o.intensity !== r.schreef) r.basis = o.intensity;  // een hook zette deze frame een nieuwe waarde
      o.intensity = r.schreef = r.basis * k;
    }
  }
  function zaal2LichtTerug(z) {
    for (const [o, r] of z.z2licht) if (o.intensity === r.schreef) o.intensity = r.basis;
    z.z2licht.clear();
  }

  // vaste lampen voor de kamers: elk beeld krijgen ze plek, kleur en sterkte van de lamp-handvatten van de actieve kamer
  const poolLicht = [0, 1].map(() => new THREE.PointLight(0xffffff, 0, 10, 1.5));
  function lampenBeeld(z) {
    const R = z.own && z.own.isKamer ? z.own : null, lmax = Math.min(z.nLamp, MAXLAMP[zwaar()]);
    // vervagen: uit in het donkere stuk van de gang (rond de wissel), aan in de kamer
    const f = R ? glad(z.dist, E_TP + 0.3, R.ingangBoog + 0.6) * (1 - glad(z.dist, R.uitgangBoog - 0.4, R.tpBoog - 0.3)) : 0;
    for (let i = 0; i < z.nLamp; i++) {
      const l = poolLicht[i], px = R && i < lmax ? R.lampen[i] : null;
      if (!px) { l.intensity = 0; continue; }
      px.visible = false;
      l.color.copy(px.color); l.distance = px.distance; l.decay = px.decay; l.intensity = Math.max(0, px.intensity) * f;
      if (px.parent) px.getWorldPosition(l.position); else l.position.copy(px.position).applyMatrix4(R.groep.matrixWorld);
    }
  }

  // --- het shot ---
  const vasteCam = () => { camPos.set(Z2.x, 2.2, Z2.z - 6.5); camLook.set(Z2.x, 1.4, Z2.z + 2); camFov = 60; };
  function zaal2Eigenaar() {  // looppad in zaal 2: vanuit het midden (tussen de vier dansers door) naar de ∞-deur en de gang in
    const D = V3(ZD.x, ZD.z), W0 = V3(Z2.x, Z2.z), dir = new THREE.Vector3().subVectors(D, W0).normalize();
    const C0 = W0.clone().addScaledVector(dir, -2.7), Q = V3(ZD.x - 1.4, ZD.z);
    const sp = maakSpoor([...afronden([C0, W0, Q, D], 0.6), ...sbPunten(ZAAL2_UIT, ZAAL2_SX).slice(1)]), uitgangBoog = sp.len - SB_LEN;
    return { isKamer: false, sp, uitgangBoog, tpBoog: uitgangBoog + E_TP, uitFrame: ZAAL2_UIT, sxUit: ZAAL2_SX, startBoog: 2.7 };
  }
  let actief = null;  // toestand van het lopende doolhof-shot
  function einde(s) { s.beats = Math.max(0.01, beatPos - s.b0); if (s.z) s.z.klaar = true; }

  function maakShot() {
    const z = { lt: 0, klus: [], afvoer: [], eigen: new Set(), verborgen: new Map(), z2licht: new Map(), z2lampen: [], fase: 'zaal2', dist: 0, v: 1.1,
      dans: false, modus: 'volg', snap: null, rond: null, slot: 0, doel: 3 + Math.floor(Math.random() * 3), amb: ambient.intensity, kw: null, nLamp: 0 };
    try {
      const p = ACTS.Casual_Walk ? lenen(null, null, false) : null;
      if (!p) { z.mislukt = true; return z; }
      z.loper = p;
      const w = p.d;
      herkleur(p, p.M.type === 'pop' && !/man-1/.test(p.M.file)); maat(p, false);
      w.rol = 'loper';
      scene.add(w.root); z.eigen.add(w.root);
      z.own = zaal2Eigenaar(); z.dist = z.own.startBoog;
      opSpoor(z.own.sp, z.dist, w.root.position); opSpoor(z.own.sp, z.dist + 0.5, tA);
      w.root.rotation.y = Math.atan2(tA.x - w.root.position.x, tA.z - w.root.position.z);
      setClip(w, ACTS.Casual_Walk, 0.1);
      if (Math.random() < 0.45) giveDrink(w, Math.random() < 0.5 ? 'bier' : 'glas');  // geen sigaret: de rook zou bij de wissel achterblijven
      z.nLamp = MAXLAMP[zwaar()];
      for (let i = 0; i < z.nLamp; i++) { poolLicht[i].intensity = 0; scene.add(poolLicht[i]); z.eigen.add(poolLicht[i]); }
      zone2.traverse(o => { if (o.isLight) z.z2lampen.push(o); });
      verberg(z); bewaarKW(z);
      actief = z;
      const R = bouwKamer(z, kiesSoort(null), ZAAL2_SX);
      if (!R) { z.mislukt = true; return z; }
      R.nr = 1; z.next = R; z.laatste = R.soort;
      opwarmen(z, R); R.klaar = true;
    } catch (e) { fout('start', e); z.mislukt = true; }
    return z;
  }
  function opruimenShot(z) {
    if (z.weg) return; z.weg = true;
    if (actief === z) actief = null;
    for (const R of [z.own, z.next]) if (R && R.isKamer) sloop(z, R, true);
    for (const g of z.afvoer.splice(0)) afvoeren(g);
    if (z.loper) { terug(z.loper); z.loper = null; }
    for (const l of poolLicht) if (l.parent) l.parent.remove(l);
    herstel(z);
    if (z.kw) { KW.bol = z.kw.bol; KW.schaduw = z.kw.schaduw; renderer.shadowMap.needsUpdate = true; }
    zaal2LichtTerug(z);
    doolhof.actief = null;
    if (!z.mislukt && typeof lastTrip !== 'undefined') lastTrip = performance.now() / 1000;  // het doolhof ging ook door zaal 2: de verplichte trip pas over 2 min weer
  }
  function bouwVolgende(z) {
    z.bouwGepland = false;
    if (z.weg || z.next || !z.own || !z.own.isKamer) return;
    const R = bouwKamer(z, kiesSoort(z.laatste), z.own.sxUit);
    if (!R) return;
    R.nr = z.own.nr + 1; z.next = R; z.laatste = R.soort;
    z.klus.push({ wacht: 2, doe: () => { if (!R.weg) { opwarmen(z, R); R.klaar = true; } } });
  }
  function planVolgende(z) { if (!z.bouwGepland && !z.next) { z.bouwGepland = true; z.klus.push({ wacht: 8, doe: () => bouwVolgende(z) }); } }
  function wissel(z, t) {  // loper en camera van de gang van A naar dezelfde plek in de gang van B
    const A = z.own, B = z.next, w = z.loper.d;
    const M = frameMat(B.inFrame).multiply(frameMat(A.uitFrame).invert()), dyaw = B.inFrame.yaw - A.uitFrame.yaw;
    w.root.position.applyMatrix4(M); w.root.rotation.y += dyaw; w.home.applyMatrix4(M);
    for (const h of held) if (h.d === w) { h.g.position.applyMatrix4(M); h.g.rotation.y += dyaw; }  // drankje stond al op de oude plek
    for (const v of [camPos, camLook]) v.applyMatrix4(M);
    if (z.snap) { z.snap.p.applyMatrix4(M); z.snap.l.applyMatrix4(M); }
    z.dist -= A.uitgangBoog;
    if (A.isKamer) sloop(z, A, false);
    else { z.fase = 'doolhof'; zaal2LichtTerug(z); }
    z.own = B; z.next = null; z.wacht = 0;
    B.t0 = t; B.actief = true; B.groep.visible = true; doolhof.actief = B.kamer;
    for (const p of B.figs) p.d.root.visible = true;
    if (S.cam === 'doolhof' || B.nr < z.doel) planVolgende(z);
  }
  function startDans(z, t) {  // stilstaan op de wachtplek en meedansen; de loopclip vloeit eruit
    const w = z.loper.d;
    z.dans = true; z.dansTot = t + z.own.blijf; z.own.blijfKlaar = true;
    if (w.prev) { w.prev.stop(); w.prev = null; }
    w.loopA = w.cur; w.loopW = 1; w.cur = null;
    w.home.copy(w.root.position); w.face = w.root.rotation.y; w.faceT = undefined; w.px = w.pz = 0; w.nextChange = 0; w.acts = null; w.queue = null;
  }
  function stopDans(z) {
    const w = z.loper.d;
    z.dans = false;
    if (w.loopA) { w.loopA.stop(); w.loopA = null; }
    setClip(w, ACTS.Casual_Walk, 0.6);
  }
  function loperBeeld(s, z, t, dt) {
    const w = z.loper.d;
    if (z.dans) {
      if (w.loopA) { w.loopW -= dt * 1.6; if (w.loopW <= 0) { w.loopA.stop(); w.loopA = null; } else w.loopA.setEffectiveWeight(w.loopW); }
      pose(w, beatPos, Math.max(energy, 0.1), dt);
      if (t >= z.dansTot) stopDans(z);
      return;
    }
    const own = z.own, inKamer = own.isKamer && z.dist > own.ingangBoog && z.dist < own.uitgangBoog;
    const vWil = !own.isKamer && z.dist < own.uitgangBoog ? 1.1 : inKamer ? 1.1 : 1.3;
    z.v += (vWil - z.v) * Math.min(1, dt * 1.5);
    z.dist += z.v * dt;
    if (own.isKamer && own.tIn == null && z.dist >= own.ingangBoog) own.tIn = t;  // de loper is binnen: de klok van kamer.cam begint
    let stop = false;
    if (own.isKamer && !own.blijfKlaar && own.blijf > 0 && z.dist >= own.midBoog) { z.dist = own.midBoog; stop = true; }
    else if (z.dist >= own.tpBoog) {
      const eindeloos = S.cam === 'doolhof';
      if (own.isKamer && own.nr >= z.doel && !eindeloos && !z.next) { einde(s); z.dist = own.tpBoog; }  // laatste kamer: de loper verdwijnt in het donker
      else if (z.next && z.next.klaar) wissel(z, t);
      else { z.dist = own.tpBoog; if (own.isKamer) planVolgende(z); if ((z.wacht = (z.wacht || 0) + dt) > 6) einde(s); }
    }
    const o2 = z.own;
    opSpoor(o2.sp, z.dist, w.root.position); opSpoor(o2.sp, z.dist + 0.35, tA);
    const dx = tA.x - w.root.position.x, dz = tA.z - w.root.position.z;
    if (dx * dx + dz * dz > 1e-6) { let dr = Math.atan2(dx, dz) - w.root.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); w.root.rotation.y += dr * Math.min(1, dt * 6); }
    if (stop) { startDans(z, t); return; }
    if (w.cur && w.cur.getClip() === ACTS.Casual_Walk) w.cur.timeScale = z.v / LOOP;
    blend(w, dt);
  }
  function cameraBeeld(z, t) {
    const own = z.own, w = z.loper.d;
    let modus = 'volg';
    if (own.isKamer) {
      // kamer.cam pas als ook de camera binnen is (overvloeien gaat dan nooit door een muur), tot 3 m voor de uitgang
      const binnen = own.tIn != null && z.dist - BACK >= own.ingangBoog + 0.3 && z.dist < own.uitgangBoog - 3.0;
      if (own.kamer.cam && !own.camKapot && binnen) modus = 'kamer';
      else if (z.dans) modus = 'rond';
    }
    if (modus !== z.modus) {  // zacht overvloeien vanaf het beeld van nu
      z.snap = { p: camPos.clone(), l: camLook.clone(), f: camFov, t0: t, dur: modus === 'kamer' ? 1.0 : 1.3 };
      z.modus = modus;
      if (modus === 'rond') {
        const p = w.root.position, m = own.kamer.maat; zv.copy(p); own.groep.worldToLocal(zv);
        z.rond = { a: Math.atan2(camPos.x - p.x, camPos.z - p.z), r0: Math.max(1.2, Math.hypot(camPos.x - p.x, camPos.z - p.z)), dir: Math.random() < 0.5 ? -1 : 1, t0: t,
          rT: Math.max(1.6, Math.min(3.2, Math.min(m.w / 2 - Math.abs(zv.x), m.d / 2 - Math.abs(zv.z)) - 0.6)) };
      }
    }
    let fov = 58, klaar = false;
    if (modus === 'kamer') {
      let r = null;
      try { r = own.kamer.cam(t - own.tIn, w, own.ctx); } catch (e) { own.camKapot = true; fout('cam van ' + own.soort, e); }
      if (r && r.pos && r.look) { tP.copy(r.pos); tL.copy(r.look); fov = r.fov || 58; klaar = true; }
      // knipt de kamer-camera tijdens het overvloeien: meteen het nieuwe beeld, anders glijdt hij na de knip nog na
      if (klaar && z.snap && z.vorigDoel && tP.distanceTo(z.vorigDoel) > 1.0) z.snap = null;
    } else if (modus === 'rond') {  // langzaam rond de dansende loper
      const p = w.root.position, q = z.rond, u = t - q.t0, a = q.a + q.dir * 0.22 * u, r = q.r0 + (q.rT - q.r0) * Math.min(1, u / 2.5);
      tP.set(p.x + Math.sin(a) * r, 1.75 + 0.25 * Math.sin(u * 0.5), p.z + Math.cos(a) * r); tL.set(p.x, 1.25, p.z); fov = 56; klaar = true;
    }
    z.vorigDoel = klaar && modus === 'kamer' ? (z.vorigDoel || new THREE.Vector3()).copy(tP) : null;
    if (!klaar) {  // achter de loper aan, op zijn eigen pad (blijft altijd binnen gang en deur)
      opSpoor(own.sp, z.dist - BACK, tP); tP.y = OOG;
      opSpoor(own.sp, z.dist + VOORUIT, tL); tL.y = 1.35;
      fov = 58;
    }
    if (z.snap) {
      const k = ease(Math.min(1, (t - z.snap.t0) / z.snap.dur));
      camPos.lerpVectors(z.snap.p, tP, k); camLook.lerpVectors(z.snap.l, tL, k); camFov = z.snap.f + (fov - z.snap.f) * k;
      if (k >= 1) z.snap = null;
    } else { camPos.copy(tP); camLook.copy(tL); camFov = fov; }
  }
  function sfeer(z, dt) {  // ambient vast, sporen en bloom van zaal 2 vloeien in de ∞-gang naar die van de kamers
    const k = z.fase === 'zaal2' ? 1 - glad(z.dist, z.own.uitgangBoog + 0.3, z.own.tpBoog - 0.4) : 0;
    z.amb += ((KW.stand === 'minimaal' ? 1.25 : 0.8) - z.amb) * Math.min(1, dt * 1.5);
    ambient.intensity = z.amb;
    strobeLight.intensity = 0;  // de stroboscoop (bereik 40 m) zou de loper in de ∞-gang door de muur heen laten flitsen
    const zfWas = camera.position.z > TUN_END - 0.5 ? 0.55 : 1;  // wat de kern en de lichtregie deze frame al toepasten (camera = vorige frame)
    if (bloom && bloom.enabled) bloom.strength *= (1 - 0.45 * k) / zfWas;
    if (feedback) {
      if (KW.stand === 'laag' || KW.stand === 'minimaal') feedback.enabled = false;
      else {
        const u = feedback.material.uniforms, nu = performance.now() / 1000;
        feedback.enabled = S.fb > 0.01 || S.mirror || k > 0.02;
        u.amount.value = S.fb + (Math.max(S.fb, 0.4 + 0.1 * pulse) - S.fb) * k;
        u.zoom.value = 1.02 + 0.015 * k + 0.012 * Math.sin(nu * 0.21);
        u.rotA.value = (0.006 + 0.012 * k) * Math.sin(nu * 0.13);
      }
    }
    if (z.fase === 'zaal2') zaal2Licht(z, k);
  }
  function stap(s, z, t) {
    const dt = Math.max(0, Math.min(0.1, t - z.lt)); z.lt = t;
    if (z.mislukt || !z.loper) { vasteCam(); einde(s); return; }
    const now = performance.now() / 1000;
    verberg(z); bewaarKW(z);
    if (z.klus.length && --z.klus[0].wacht <= 0) z.klus.shift().doe();  // hooguit één klusje per beeld
    loperBeeld(s, z, t, dt);
    const R = z.own.isKamer ? z.own : null;
    if (R) {
      for (const p of R.figs) { try { beweegFig(R, p.d, dt); } catch (e) { if (!R.figKapot) { R.figKapot = true; fout('figuur in ' + R.soort, e); } } }
      for (const m of R.trips) { m.uniforms.time.value = now; m.uniforms.bass.value = pulse * 0.7 + energy * 0.3; }
      if (R.kamer.update && !R.updKapot) try { R.kamer.update(dt, now); } catch (e) { R.updKapot = true; fout('update van ' + R.soort, e); }
    }
    lampenBeeld(z);
    cameraBeeld(z, t);
    sfeer(z, dt);
    zone2.visible = z.fase === 'zaal2' && camPos.x > 3 && camPos.z > DOOR2.z - 4.5;  // ook in de frame van de wissel meteen goed (lampen!)
  }

  SHOTS.doolhof = { w: 0.8, beats: 100000,
    make() { const z = maakShot(); return { z, cleanup: () => opruimenShot(z) }; },
    at(s, u, t) {
      const z = s.z; if (!z) return;
      try { stap(s, z, t); } catch (e) { fout('shot', e); einde(s); vasteCam(); }
    } };
  clubHooks.push(() => { if (actief && (!shot || shot.z !== actief)) opruimenShot(actief); });  // shot = null (nieuwe bezetting, spatie) zonder cleanup

  // na de trip in 'auto': de helft van de keren door naar het doolhof (de trip eindigt in zaal 2, het doolhof begint daar)
  const kernStart = startShot;
  startShot = function (kind, now) {
    if (kind === 'auto' && shot && shot.kind === 'trip' && Math.random() < 0.5) kind = 'doolhof';
    // na het doolhof (ging ook door zaal 2) de verplichte trip pas over 2 min: vóór de keuze, anders kiest startShot hem meteen weer
    else if (shot && shot.kind === 'doolhof' && shot.z && !shot.z.mislukt && typeof lastTrip !== 'undefined') lastTrip = performance.now() / 1000;
    return kernStart(kind, now);
  };
  doolhof.start = soort => { if (soort) doolhof.volgende = soort; startShot('doolhof', performance.now() / 1000); };
  doolhof.toestand = () => actief;  // voor de testronde: kamer, loper, booglengte (null buiten het shot)
  {
    const sel = document.getElementById('cam');
    if (sel && !sel.querySelector('option[value="doolhof"]')) {
      const o = document.createElement('option'); o.value = 'doolhof'; o.textContent = 'Camera: het doolhof'; sel.appendChild(o);
      if (S.cam === 'doolhof') sel.value = 'doolhof';
    }
  }

  // --- eenvoudige kamer van de kern zelf: een smalle gang-kamer met neonbuizen en wat publiek langs de wanden ---
  doolhof.registreer('gang-kamer', { gewicht: 0.3, maak(ctx) {
    const r = ctx.rnd, kies = a => a[Math.min(a.length - 1, Math.floor(r() * a.length))];
    const w = 6 + r() * 2, d = 13 + r() * 5, h = 3.3;
    const tint = new THREE.Color().setHSL(r(), 0.85, 0.55);
    ctx.doos({ w, d, h, muur: new THREE.MeshBasicMaterial({ map: wallTex, color: new THREE.Color(0x40363a).lerp(tint, 0.18) }) });
    // neonbuizen onder het plafond langs beide wanden: op de tel loopt er een lichtgolf van de ingang naar de uitgang
    const buizen = [], n = Math.max(3, Math.round(d / 3.2)), seg = d / n;
    for (const sx of [-1, 1]) for (let i = 0; i < n; i++) {
      const m = additive(0x000000);
      add(ctx.groep, BOX, m, [sx * (w / 2 - 0.05), h - 0.3, -d / 2 + (i + 0.5) * seg], [0.06, 0.06, seg * 0.82]);
      buizen.push({ m, i });
    }
    const plint = additive(0x000000);  // gloeiende plint
    for (const sx of [-1, 1]) add(ctx.groep, BOX, plint, [sx * (w / 2 - 0.03), 0.04, 0], [0.04, 0.04, d - 0.2]);
    const bord = ctx.neon(kies(['DEEPER', 'NO EXIT', 'VERDWAALD', 'NOG DIEPER', 'LOST', 'AFTER', 'HIER NIET', '∞']), '#' + tint.getHexString(), 2.6, 0.65);
    const bs = r() < 0.5 ? -1 : 1;
    bord.position.set(bs * (w / 2 - 0.06), 2.2, (r() - 0.5) * d * 0.4); bord.rotation.y = -bs * Math.PI / 2;
    const lamp = ctx.licht(tint.getHex(), 1.6, 12, 0, h - 0.5, 0);
    // publiek langs de wanden: vooral staan (drankje, sigaret), een paar dansen; het midden blijft vrij voor de loper
    const nf = [6, 4, 3][ctx.zwaar];
    for (let i = 0; i < nf; i++) {
      const sx = i % 2 ? 1 : -1, z = -d / 2 + 2 + (d - 4) * (i + 0.5) / nf + (r() - 0.5) * 0.6;
      ctx.figuur({ x: sx * (w / 2 - 0.7), z, face: -sx * Math.PI / 2 + (r() - 0.5) * 0.9, rol: r() < 0.3 ? 'dans' : 'staan' });
    }
    return { maat: { w, d, h }, blijf: 8,
      update() {
        const b = ctx.beat();
        for (const t of buizen) {
          const f = ((b.pos / 4 - t.i / n) % 1 + 1) % 1;  // golf van ingang naar uitgang, elke 4 tellen
          t.m.color.copy(tint).multiplyScalar(0.12 + 0.9 * Math.pow(1 - f, 6) * (0.4 + 0.6 * b.energy));
        }
        plint.color.copy(tint).multiplyScalar(0.15 + 0.35 * b.pulse);
        if (lamp) lamp.intensity = 1.1 + 1.3 * b.pulse * b.energy;
      } };
  } });
})();

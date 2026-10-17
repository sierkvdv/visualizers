// --- Buiten: bouwdoos voor de trippy buitenkamers van het doolhof (window.doolhof.buiten) ---
// Sierk (17-10): uit de clubgang ineens een gekke nachtjungle in lopen, vol vuurmensen, vuurdraaiers (poi, staf, hoepel) en glowsticks,
// of een tropisch feeststrand op; na de buitenwandeling weer de lift tegenkomen en verder de club in. Dit bestand registreert zelf GEEN
// kamer en zet geen script-tag: de jungle- en de strandkamer bouwen hierop. Laden na doolhof/lift.js.
// Licht: alles licht zelf (ShaderMaterial, additief), dus leesbaar op tv/ledwand: donkere nacht met verzadigde, bewegende gloed, alles op de
// show-bus (doolhof.show): break donker en traag, opbouw sneller, drop groot. Eén set muziek-uniforms (U) voor alle materialen, één update
// per beeld (clubHooks). Deeltjes: één draw per aanroep (instanced quads of THREE.Points), alle beweging in de vertex-shader als functie van
// de tijd; poi en glowsticks lezen één keer per beeld de handbotten van hooguit 8/24 figuren (onBeforeRender) en geven ze als uniform-array.
// Gedeeld spul (geometrie, glyph-textuur) heeft userData.doolhofHouden; wat per kamer gemaakt wordt, ruimt de kern met de groep op.
// DE BUITENWERELD IS DICHT ZO: de hemel staat op het verre vlak (alles in de kamer tekent ervoor, buiten de 100 m van de camera is niets),
// een grondschijf (r 96 m) sluit de onderkant af (de liftschacht steekt 30 m de grond in), de rotswand (ingang) en de lifttoren (uitgang)
// zijn massieve coulissen vóór de S-gang of lift erachter. Dus altijd hemel + rotsPoort + liftToren samen gebruiken.
//
// API (maten in m, kamer-ruimte: ingang z = -d/2, uitgang z = +d/2, deuren op x = 0; hoeken in rad, az 0 = +z (naar de lift), pi/2 = +x).
// Elke functie zet zijn meshes in `groep` (meestal ctx.groep) en geeft een handvat terug; niets hoeft per beeld aangeroepen te worden.
//   B = doolhof.buiten
//   B.liftUitgang()                       in maak(ctx) aanroepen: de uitgang van deze kamer wordt een lift (doolhof.volgendeOvergang)
//   B.hemel(groep, o) -> { mesh, grond, uniforms, zet(o) }       nachthemel op oneindig + grondschijf
//       o: soort 'nacht'|'jungle'|'zonsondergang'|'trippy', silhouet 'jungle'|'palmen'|'geen', verte 'bergen'|'vulkaan'|'geen',
//          maan true|false|{az, el}, aurora 0..1, nevel 0..1, sterren 0..1, vulkaanAz, zonAz (zonsondergang: synthwave-zon), verreVuren 0..1,
//          zee null|{ az, breed (halve hoek, 1.1), kust (m van het midden tot de waterlijn) } (strand: open zee + lichtgevende branding),
//          grond 'jungle'|'zand'|'donker'|false, grondY (-0.03), zaad, zwaar.   zet({ aurora, nevel, trip, sterren }) = live bijstellen.
//   B.rotsPoort(groep, maat, o) -> { groep, rots }   rotswand/bergflank over de hele breedte met deur 2 x 2,6 m op x 0 (z -d/2), runenpoort,
//       gloeiende aderen, mos, lianen. o: hemel (handvat, voor de nevelkleur), hoog (14), piek (38: dekt een lift-ingang af), breed (26 m
//       extra per kant), diep (16), deco 'paddenstoelen'|'kristallen'|'geen', tekst (neon boven de poort), palet [a, b, c], rnd, zwaar
//   B.liftToren(groep, maat, o) -> { groep }   glazen lifttoren (6,6 x 9 m, 44 m hoog) + lobby (15 x 8 x 4,6 m) om lift/S-gang achter de
//       uitgang; ledlijnen, verdiepingsnummers, cabine in de glazen schacht, kroon, obstakellichten, 2 zoeklichten, LIFT-neon, leveldisplay
//       (doolhof.level). o: hemel, hoog (44), breed (lobby, 15), tekst ('LIFT'), palet, zoeklichten (2), rnd, zwaar
//   B.vuur(groep, plekken, o) -> { mesh, zet({ sterk }) }   vlammen + opstijgende vonken + halo + grondgloed, één draw voor alle plekken
//       plekken [{ x, y?, z, s? (schaal), h? (hoogte) }]; o: vlammen (24), vonken (14), kleur 'vuur'|'blauw'|'groen'|'paars'|'show', sterk, lamp
//       (ctx.licht-handvat: flakkert mee), gloed (true), zwaar
//   B.kampvuur(groep, plek, o) -> { vuur, hout, stenen }   groot vuur (s 2,4) + brandende houtblokken + stenen kring. o als vuur + s
//   B.fakkels(groep, plekken, o) -> { palen, vuur, toppen }   tiki-fakkels (bamboe + kom + vlam), plekken [{ x, z, s? }], o: hoogte (1,9),
//       kleur, lamp, zwaar; toppen = [{ x, y, z }] van de vlammen (handig voor lichtslingers ertussen)
//   B.poi(groep, figs, o) -> { mesh, dansers }   vuurdraaiers aan bestaande figuren (ctx.figuur): ballen aan kettingen rond de handen met
//       sporen (cirkels, split-time, vlinder, antispin-bloem, liggende acht, wiel; per 8 tellen een ander patroon, drop 4, break 16).
//       o: soort 'vuur'|'led'|'staf'|'hoepel'|'spuwer'|'mix' (of per figuur figs[i].poiSoort), ketting (0,72), zwaar
//   B.vuurDansers(ctx, plekken, o) -> { figs, mesh, dansers } | null   maakt de figuren (rol 'dans') en geeft ze poi.
//       plekken [{ x, z, face?, soort? }]; o als poi + filter (RegExp voor de modellen)
//   B.glowsticks(groep, figs, o) -> { mesh }   gloeiende staafjes in een of beide handen (verlengen de onderarm, zwaaien mee met de dans)
//       o: handen 'een'|'beide'|'mix', kleuren [hex], lengte (0,26), helder (1)
//   publiek: clubPubliek.maak(groep, { ..., glowsticks: 0.6 }) = dat deel van de menigte zwaait met een neon staafje (club/publiek.js)
//   B.vuurvliegjes(groep, o) -> { mesh }   THREE.Points; o: soort 'vliegjes'|'sporen'|'vonken', aantal (260), gebied { x0, x1, z0, z1, y0, y1 }
//       of { w, d } (rond het midden), kleur 'geel'|'groen'|'show'|'mix', grootte (m), zwaar
//   B.lichtslingers(groep, lijnen, o) -> { lampjes, draad }   lijnen [[{x,y,z}, ...], ...] (palen/boomtoppen), doorhang o.zak (0,5),
//       o.afstand (0,32), o.kleur 'warm'|'neon'|'show', o.draad (true)
//   B.gloeiPad(groep, route, o) -> { stenen, gloed, lantaarns }   lichtgevend pad langs een route [{x, z}] (bv. de kamerroute): stenen met een
//       rune die golft richting uitgang, gloed op de grond; o: vorm 'rand'|'midden', afstand (0,8), breed (0,9), lantaarns (true), palet
//   B.gloed(groep, lijst, o) -> mesh   losse gloeivlekken [{ x, y, z, r, kleur?, s? }], o: plat (true = op de grond), golf (chase langs s), sterk
//   B.buitenCam(ctx, maat, shots, o) -> cam(t, loper)   als kamer.cam: knipt op de tel (8 tellen, drop 4, break 16, opbouw 8 -> 4) tussen
//       'volg' (schouderhoogte achter/naast de loper), 'held' (laag op een vuurdanser), 'drone' (hoog over alles), 'kraan' (stijgt op),
//       'baan' (traag rond vuur/dj), 'ingang', 'toren' (omhoog langs de lift), 'vuur' (laag langs het kampvuur), 'tegen' (van de toren terug).
//       shots = lijst namen (null = alles wat kan); o: { vuur: {x, z}, dj: {x, z}, dansers: [figs of {x, z}], hoog (max cam-hoogte, 18) }
//   B.U  gedeelde uniforms (uT, uTel, uReis, uPuls, uEn, uBas, uMid, uHoog, uOpb, uDrop, uFlits, uBlack, uStand, uSpin, uVlam, uPx, uK0..2)
//   B.KOP  GLSL-kop (hashes, ruis, kleuren, standen) voor eigen shaders: vertexShader/fragmentShader = B.KOP + eigen code; uniforms:
//       Object.assign({}, B.U, eigen)
//   B.demo(ctx) -> kamer   voorbeeld/test met alles erin. Proef in de club (console): doolhof.registreer('buiten-demo', { gewicht: 0,
//       maak: ctx => doolhof.buiten.demo(ctx) }); doolhof.start('buiten-demo')        B.info() = tellers
(function () {
  'use strict';
  const doolhof = window.doolhof = window.doolhof || {};
  if (typeof THREE === 'undefined' || typeof clubHooks === 'undefined' || typeof renderer === 'undefined') return;

  // ---------- hulpjes ----------
  const f = v => ({ value: v });
  const houd = x => { x.userData = x.userData || {}; x.userData.doolhofHouden = true; return x; };
  const geenStraal = o => { o.raycast = () => {}; return o; };  // geen obstakel voor de stralen van moshpit/camera (gloed, deeltjes, hemel)
  const klem = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const glad = (x, a, b) => { const t = klem((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const zwaarNu = () => typeof KW !== 'undefined' && KW ? (KW.stand === 'minimaal' ? 2 : KW.stand === 'laag' ? 1 : 0) : 0;
  const zwVan = o => klem(Math.round(o && o.zwaar != null ? o.zwaar : zwaarNu()), 0, 2);
  const rndVan = o => (o && typeof o.rnd === 'function' ? o.rnd : Math.random);
  const kleurVan = (x, d) => x == null ? new THREE.Color(d) : x.isColor ? x.clone() : new THREE.Color(x);
  const beeldNr = () => (typeof frameNo !== 'undefined' ? frameNo : Math.floor(performance.now() / 16));
  const NEON = [0x39ff14, 0xff10f0, 0x00f0ff, 0xfff01f, 0xff5e00, 0xb026ff, 0xff073a];
  const STAND = { groove: 0, break: 1, opbouw: 2, drop: 3 };
  const tel = { aanroepen: 0, poi: 0, sticks: 0 };
  function ruis2(seed) {  // waarde-ruis 2D in JS (voor de vorm van rotsen)
    const s = seed | 0;
    const h = (x, y) => { let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
    return (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
  }

  // ---------- gedeelde muziek-uniforms: één update per beeld ----------
  const U = {
    uT: f(0), uTel: f(0), uReis: f(0), uPuls: f(0), uEn: f(0), uBas: f(0), uMid: f(0), uHoog: f(0), uOpb: f(0), uDrop: f(0),
    uFlits: f(0), uBlack: f(0), uStand: f(0), uSpin: f(0), uVlam: f(1), uPx: f(500), uZwaar: f(0),
    uK0: f(new THREE.Color(0xff0080)), uK1: f(new THREE.Color(0x00e5ff)), uK2: f(new THREE.Color(0x7a00ff)),
  };
  const G = { tc: 0, spin: 0, reis: 0, tijd: 0, vlam: 1 };
  const BUF = new THREE.Vector2();
  const klokNaar = (x, doel, dt) => { let d = doel - x; d -= Math.round(d); return x + d * (1 - Math.exp(-dt * 1.5)); };  // fase bijtrekken zonder sprong
  clubHooks.push(dt => {
    dt = klem(+dt || 0, 0, 0.1);
    const sh = doolhof.show || {}, st = sh.stand || 'groove';
    const pu = typeof pulse === 'number' ? pulse : 0, en = typeof energy === 'number' ? energy : 0.7;
    const B = typeof bands !== 'undefined' ? bands : null, bas = B ? B[0].v : 0;
    const per = typeof period === 'number' && period > 0.2 ? period : 0.5, tb = Math.max(0, typeof beatPos === 'number' ? beatPos : 0);
    // tel zonder sprongen (de beatvolger trekt bij, hier glijdt dat), daarop de draaiklok van de poi (omwentelingen)
    const tc0 = G.tc;
    if (Math.abs(tb - G.tc) > 1.5) G.tc = tb; else { G.tc += dt / per; G.tc += (tb - G.tc) * (1 - Math.exp(-dt * 10)); }
    const dtb = klem(G.tc - tc0, 0, 2), opb = sh.opbouw || 0, drop = sh.drop || 0;
    const rate = st === 'break' ? 0.5 : st === 'opbouw' && opb > 0.75 ? 2 : 1;  // 1 omwenteling per tel; break half, eind opbouw dubbel
    G.spin = klokNaar(G.spin + dtb * rate, G.tc * rate, dt);
    // reis: de showklok (break traag, opbouw versnellend, drop hard, elke kick een duw)
    const v = st === 'break' ? 0.6 : st === 'opbouw' ? 0.8 + 2.2 * opb * opb : st === 'drop' ? 1.6 + 1.6 * drop : 1;
    G.reis = (G.reis + dt * v * (0.6 + 0.8 * pu * Math.max(0.25, en) + 0.3 * bas)) % 3600;
    G.tijd = (G.tijd + dt) % 3600;
    // vlam: hoe hoog het vuur slaat (snel omhoog, traag omlaag)
    const vd = (st === 'break' ? 0.6 : st === 'opbouw' ? 0.85 + 0.5 * opb : st === 'drop' ? 1.2 + 0.9 * drop : 1) + 0.45 * pu * en;
    G.vlam += (vd - G.vlam) * Math.min(1, dt * (vd > G.vlam ? 9 : 2.5));
    U.uT.value = G.tijd; U.uTel.value = tb % 512; U.uReis.value = G.reis; U.uSpin.value = G.spin % 256;
    U.uPuls.value = pu; U.uEn.value = en; U.uBas.value = bas; U.uMid.value = B ? B[1].v : 0; U.uHoog.value = B ? B[2].v : 0;
    U.uOpb.value = st === 'opbouw' ? opb : 0; U.uDrop.value = drop; U.uFlits.value = sh.flits || 0; U.uBlack.value = sh.blackout || 0;
    U.uStand.value = STAND[st] || 0; U.uVlam.value = G.vlam; U.uZwaar.value = zwaarNu();
    U.uPx.value = renderer.getDrawingBufferSize(BUF).y * 0.5;
    if (sh.kleur) { sh.kleur(0, U.uK0.value); sh.kleur(1, U.uK1.value); sh.kleur(2, U.uK2.value); }
  });

  // ---------- GLSL-kop (ShaderMaterial: three zet precisie en de standaard-attributen/matrices er zelf voor) ----------
  const KOP = `
uniform float uT, uTel, uReis, uPuls, uEn, uBas, uMid, uHoog, uOpb, uDrop, uFlits, uBlack, uStand, uSpin, uVlam, uPx, uZwaar;
uniform vec3 uK0, uK1, uK2;
#define TAU 6.2831853
#define PI 3.1415927
float h11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float h31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
vec3 h33(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
float vn(vec2 p) { vec2 i = floor(p), q = fract(p); q = q * q * (3.0 - 2.0 * q);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), q.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), q.x), q.y); }
float fbm(vec2 p) { float v = 0.5 * vn(p); p = p * 2.03 + 17.1; v += 0.25 * vn(p); p = p * 2.01 + 9.3; v += 0.125 * vn(p); return v / 0.875; }
vec3 kl(float t) { t = fract(t) * 3.0; return t < 1.0 ? mix(uK0, uK1, t) : t < 2.0 ? mix(uK1, uK2, t - 1.0) : mix(uK2, uK0, t - 2.0); }
vec3 klH(float i) { float j = mod(floor(i), 3.0); return j < 0.5 ? uK0 : j < 1.5 ? uK1 : uK2; }
float isBreak() { return step(0.5, uStand) * step(uStand, 1.5); }
float isOpb() { return step(1.5, uStand) * step(uStand, 2.5); }
float isDrop() { return step(2.5, uStand); }
vec3 neon(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
vec3 vuurKleur(float l) {  // 0 = kern (wit-geel), dan oranje, rood, donker
  vec3 c = mix(vec3(1.0, 0.95, 0.72), vec3(1.0, 0.52, 0.1), smoothstep(0.0, 0.3, l));
  c = mix(c, vec3(0.85, 0.11, 0.03), smoothstep(0.3, 0.75, l));
  return c * (1.35 - l);
}
vec3 flitsWit(vec3 c) { return mix(c, vec3(0.03 + 1.2 * max(c.r, max(c.g, c.b))), uFlits * 0.6); }
`;
  // materiaal-fabrieken: eigen exemplaar per aanroep (de kern ruimt het op), zelfde bron = zelfde programma
  const shMat = (vs, fs, eigen, o) => new THREE.ShaderMaterial(Object.assign({ uniforms: Object.assign({}, U, eigen || {}), vertexShader: KOP + vs, fragmentShader: KOP + fs }, o || {}));
  const addMat = (vs, fs, eigen, o) => shMat(vs, fs, eigen, Object.assign({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }, o || {}));

  // ---------- gedeelde geometrie ----------
  const QUAD_P = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), QUAD_I = [0, 1, 2, 0, 2, 3];
  function quadGeo(n, attrs) {  // n instanties van een quad (-1..1), attrs { naam: [Float32Array, grootte] }
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(QUAD_P, 3));
    g.setIndex(QUAD_I);
    for (const k in attrs) g.setAttribute(k, new THREE.InstancedBufferAttribute(attrs[k][0], attrs[k][1]));
    g.instanceCount = n;
    return g;
  }
  const HEMEL_GEO = houd(new THREE.SphereGeometry(1, 48, 24));
  const GROND_GEO = houd(new THREE.CircleGeometry(96, 96).rotateX(-Math.PI / 2));
  const STEEN_GEO = houd((() => {  // grillige steen (niet-geïndexeerd: facetten), straal ~1
    const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position, n = ruis2(77);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 0.72 + 0.5 * n(x * 1.7 + 3, y * 1.7 + z * 1.3);
      p.setXYZ(i, x * k, y * k * 0.8, z * k);
    }
    g.computeVertexNormals();
    return g;
  })());
  const ZWAM_GEO = houd((() => {  // paddenstoel: steel (y 0..1) + hoed (vanaf y 0,98)
    const steel = new THREE.CylinderGeometry(0.07, 0.11, 1, 8, 1).translate(0, 0.5, 0);
    const hoed = new THREE.SphereGeometry(0.36, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1).translate(0, 0.98, 0);
    return samenvoegen([steel, hoed]);
  })());
  const KRISTAL_GEO = houd(new THREE.OctahedronGeometry(1, 0).scale(0.28, 1, 0.28).translate(0, 0.85, 0));
  const HOUT_GEO = houd(new THREE.CylinderGeometry(0.1, 0.12, 1.6, 7, 3));
  const BUNDEL_GEO = houd(new THREE.CylinderGeometry(1, 1, 1, 18, 1, true).translate(0, 0.5, 0));
  const LANT_GEO = houd(new THREE.SphereGeometry(1, 12, 8));
  // kloon per kamer: three r128 deelt bij clone() het userData-object (doolhofHouden), dan ruimde de kern de kloon nooit op (gpu-lek)
  const losKloon = g => { const k = g.clone(); k.userData = {}; return k; };

  // ---------- 5 x 7 letters (verdiepingsnummers en het leveldisplay): 0-9, '-', L, I, F, T, pijl omhoog ----------
  const GLYF = [
    ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'], ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
    ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'], ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
    ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'], ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
    ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'], ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
    ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'], ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
    ['.....', '.....', '.....', '#####', '.....', '.....', '.....'], ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
    ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'], ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
    ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'], ['..#..', '.###.', '#####', '..#..', '..#..', '..#..', '..#..'],
  ];
  const GLYF_TEX = houd((() => {
    const d = new Uint8Array(80 * 7 * 4);
    GLYF.forEach((g, gi) => g.forEach((rij, r) => { for (let c = 0; c < 5; c++) { const i = (r * 80 + gi * 5 + c) * 4, v = rij[c] === '#' ? 255 : 0; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; } }));
    const t = new THREE.DataTexture(d, 80, 7, THREE.RGBAFormat);
    t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
    return t;
  })());
  const GLYF_GLSL = `uniform sampler2D uGlyf;
float glyf(float g, vec2 c) {
  if (c.x < 0.0 || c.x >= 5.0 || c.y < 0.0 || c.y >= 7.0) return 0.0;
  return texture2D(uGlyf, vec2((g * 5.0 + floor(c.x) + 0.5) / 80.0, (floor(c.y) + 0.5) / 7.0)).r;
}
`;

  // =====================================================================================================================================
  // 1. HEMEL: koepel op het verre vlak (volgt de camera: oneindig ver), silhouetten aan de horizon, land of zee eronder + grondschijf
  // =====================================================================================================================================
  const HEMEL_VS = `varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * (position * 40.0), 1.0);
  gl_Position = vec4(p.xy, p.w * 0.99999, p.w);   // op het verre vlak: alles in de kamer tekent ervoor
}`;
  const HEMEL_FS = `varying vec3 vDir;
uniform vec3 uZen, uHor, uGloed, uLand, uMaanDir;
uniform float uMaan, uAurora, uNevel, uSter, uSil, uSil2, uZee, uZeeAz, uZeeB, uZaad, uZons, uZonAz, uTrip, uVulkAz, uVerre;
float wrapA(float a) { return mod(a + PI, TAU) - PI; }
float ringRuis(float az, float R, float z) { return vn(vec2(cos(az), sin(az)) * R + vec2(z, z * 1.7)); }   // naadloos rond
float bergen(float az) { float v = 0.55 * ringRuis(az, 2.2, uZaad) + 0.3 * ringRuis(az, 6.0, uZaad + 3.0) + 0.15 * ringRuis(az, 15.0, uZaad + 7.0); return 0.01 + 0.09 * pow(v, 1.7); }
float vulkaan(float az) { float d = abs(wrapA(az - uVulkAz)); return 0.2 - d * 0.75 - 0.018 * smoothstep(0.035, 0.0, d); }
float kruinen(float az, float N, float h0, float hv, float zs) {  // bolle boomkruinen naast elkaar (hoogte in rad)
  float cw = TAU / N, x = (az + PI) / cw, i0 = floor(x), m = 0.0;
  for (int k = -2; k <= 2; k++) {
    float ii = i0 + float(k), i = mod(ii, N);
    float hA = h21(vec2(i, zs)), hB = h21(vec2(i, zs + 5.3)), hC = h21(vec2(i, zs + 9.1));
    float r = 0.6 + 1.1 * hB, dx = x - (ii + 0.5 + (hA - 0.5) * 0.8);
    m = max(m, step(abs(dx), r) * (h0 + hv * hC + sqrt(max(r * r - dx * dx, 0.0)) * cw * 0.7));
  }
  return m;
}
float palmen(float az, float el, float N, float zs) {  // palmsilhouetten: gebogen stam + 7 hangende bladeren
  if (el > 0.2 || el < -0.002) return 0.0;
  float cw = TAU / N, x = (az + PI) / cw, i0 = floor(x), ax = az + PI, m = 0.0;
  vec2 p = vec2(ax, el);
  for (int k = -1; k <= 1; k++) {
    float ii = i0 + float(k), i = mod(ii, N);
    float hA = h21(vec2(i, zs + 1.1)), hB = h21(vec2(i, zs + 2.7)), hC = h21(vec2(i, zs + 4.9));
    if (hC < 0.3) continue;
    float c = (ii + 0.25 + 0.5 * hA) * cw, H = 0.05 + 0.09 * hB, buig = (hA - 0.5) * 0.05;
    float t = clamp(el / H, 0.0, 1.0), sw = 0.0032 * (1.0 - 0.4 * t) + 0.0006;
    m = max(m, smoothstep(sw + 0.0007, sw, abs(ax - c - buig * t * t)) * step(el, H));
    vec2 T = vec2(c + buig, H);
    for (int j = 0; j < 7; j++) {
      float fj = float(j), ang = 0.15 + fj * 0.47 + (hB - 0.5) * 0.3, L = 0.04 + 0.025 * h21(vec2(i + fj, zs + 7.3));
      vec2 dir = vec2(cos(ang), sin(ang));
      float s = clamp(dot(p - T, dir) / L, 0.0, 1.0);
      vec2 q = T + L * s * dir - vec2(0.0, L * 0.85 * s * s);
      float w = (0.0045 * (1.0 - s) + 0.0006) * (0.55 + 0.6 * abs(sin(s * 26.0)));
      m = max(m, smoothstep(w + 0.0007, w, length(p - q)));
    }
  }
  return m;
}
vec3 sterren(vec3 d, float el) {
  float vis = smoothstep(0.02, 0.2, el) * uSter * (1.0 - 0.7 * uZons);
  if (vis <= 0.0) return vec3(0.0);
  vec3 c = vec3(0.0);
  for (int i = 0; i < 2; i++) {
    float fi = float(i), sc = mix(140.0, 48.0, fi);
    vec3 q = d * sc, id = floor(q);
    float h = h31(id + fi * 17.0);
    if (h > mix(0.8, 0.93, fi)) {
      vec3 dv = q - (id + 0.5 + (h33(id + 3.1) - 0.5) * 0.55);
      dv -= d * dot(dv, d);   // alleen de afstand dwars op de kijkrichting
      float tw = 0.55 + 0.45 * sin(uT * (1.5 + 5.0 * h) + h * 60.0);
      vec3 kk = mix(vec3(0.75, 0.85, 1.0), mix(vec3(1.0, 0.8, 0.6), uK1, 0.4 * uTrip), step(0.7, fract(h * 13.0)));
      c += kk * exp(-dot(dv, dv) / mix(0.012, 0.007, fi)) * tw * mix(0.9, 1.7, fi);
    }
  }
  return c * vis * (1.0 + 0.8 * uDrop + 0.4 * uPuls * uEn);
}
vec3 aurora(float az, float el) {
  if (el < 0.0 || uAurora <= 0.0) return vec3(0.0);
  vec3 c = vec3(0.0);
  for (int i = 0; i < 2; i++) {
    float fi = float(i), drift = uReis * (0.012 + 0.008 * fi) * (fi * 2.0 - 1.0);
    float basis = 0.13 + 0.1 * fi + 0.07 * ringRuis(az + drift, 1.6 + fi, uZaad + 4.0 + fi * 9.0);
    float dd = el - basis;
    float vorm = smoothstep(-0.004, 0.018, dd) * exp(-max(dd, 0.0) * (8.0 - 3.0 * fi));
    float st = ringRuis(az + drift * 2.0, 26.0 + 14.0 * fi, fi * 13.0 + uReis * 0.08);
    float band = smoothstep(0.2, 0.85, ringRuis(az - drift, 2.4 + fi, uZaad + fi * 3.0));
    vec3 laag = mix(vec3(0.1, 1.0, 0.45), uK1, 0.3 + 0.45 * uTrip), hoog = mix(vec3(0.55, 0.1, 1.0), uK2, 0.3 + 0.45 * uTrip);
    c += mix(laag, hoog, clamp(dd * 6.0, 0.0, 1.0)) * vorm * (0.25 + 0.75 * st * st) * band;
  }
  return c * uAurora * (0.35 + 0.35 * uEn + 0.5 * uPuls * uEn + 0.9 * uDrop + 0.4 * uOpb) * (1.0 - 0.45 * uBlack);
}
vec3 meteoor(vec3 d, float el) {  // vallende ster: elke 16 tellen (drop elke 4) één
  if (el < 0.12) return vec3(0.0);
  float per = mix(16.0, 4.0, isDrop()), blok = floor(uTel / per), t = uTel - blok * per;
  if (t > 1.6) return vec3(0.0);
  vec2 P = d.xz / (d.y + 0.25), S = (vec2(h11(blok + uZaad), h11(blok * 1.7 + 3.0)) - 0.5) * 2.4;
  float ang = h11(blok * 2.3 + 7.0) * TAU; vec2 V = vec2(cos(ang), sin(ang));
  vec2 pa = P - (S + V * (t * 0.9 - 0.5));
  float hh = clamp(dot(pa, V) / 0.5, 0.0, 1.0), dd = length(pa - V * 0.5 * hh);
  return vec3(0.85, 0.9, 1.0) * exp(-dd * dd / 0.00002) * hh * hh * (1.0 - t / 1.6) * 1.5;
}
void main() {
  vec3 d = normalize(vDir);
  float el = asin(clamp(d.y, -1.0, 1.0)), az = atan(d.x, d.z), e = max(el, 0.0);
  float zeeM = uZee * smoothstep(uZeeB, uZeeB - 0.3, abs(wrapA(az - uZeeAz)));
  // --- lucht ---
  vec3 col = mix(uHor, uZen, pow(min(e * 2.2, 1.0), 0.55));
  col += uGloed * exp(-e * 9.0) * 0.8;
  col = mix(col, uGloed, exp(-(((e - 0.16) / 0.12) * ((e - 0.16) / 0.12))) * 0.45 * uZons);
  if (uNevel > 0.0 && el > 0.0) {
    vec2 p = d.xz / (d.y + 0.35);
    float n1 = fbm(p * 1.3 + vec2(uReis * 0.01, 0.0)), n2 = fbm(p * 2.7 - vec2(0.0, uReis * 0.015) + n1);
    col += mix(uK2, uK0, n2) * pow(n1, 2.5) * uNevel * (0.25 + 0.45 * uTrip) * (0.7 + 0.5 * uPuls * uEn + uDrop) * smoothstep(0.0, 0.25, el);
  }
  col += sterren(d, el) + aurora(az, el) + meteoor(d, el);
  if (uMaan > 0.5) {
    vec3 md = normalize(uMaanDir);
    float c = dot(d, md), a = acos(clamp(c, -1.0, 1.0));
    vec3 t1 = normalize(cross(md, vec3(0.0, 1.0, 0.0))), t2 = cross(t1, md);
    vec2 q = vec2(dot(d, t1), dot(d, t2)) / 0.05;
    float schijf = smoothstep(1.0, 0.95, length(q)) * step(0.0, c);
    vec3 mk = vec3(0.95, 0.92, 0.82) * (0.62 + 0.45 * fbm(q * 2.3 + 4.0)) * (1.0 - 0.25 * dot(q, q));
    col = mix(col, mk * 1.15, schijf);
    col += vec3(0.6, 0.65, 0.8) * (exp(-a * 14.0) * 0.22 + exp(-a * 4.0) * 0.05);
    col += kl(uT * 0.05) * exp(-(((a - 0.13 - 0.03 * uPuls) / 0.006) * ((a - 0.13 - 0.03 * uPuls) / 0.006))) * (0.12 + 0.5 * uDrop + 0.3 * uTrip);   // ring op de tel
  }
  if (uZons > 0.0) {  // synthwave-zon die half in zee zakt, strepen schuiven omlaag
    vec2 q = vec2(wrapA(az - uZonAz), el - 0.035) / 0.13;
    float r = length(q), gap = 0.12 + 0.55 * clamp((0.25 - q.y) / 1.25, 0.0, 1.0);
    float vis = q.y > 0.25 ? 1.0 : step(gap, fract(q.y * 7.0 - uT * 0.2));
    vec3 zk = mix(vec3(1.0, 0.15, 0.55), vec3(1.0, 0.85, 0.25), clamp(q.y * 0.5 + 0.5, 0.0, 1.0));
    col = mix(col, zk * 1.2, smoothstep(1.0, 0.985, r) * vis * uZons);
    col += vec3(1.0, 0.45, 0.35) * exp(-r * 1.6) * 0.35 * uZons * (0.8 + 0.4 * uPuls * uEn);
  }
  col += (uHor + 0.15) * uFlits * 0.12;
  // --- verre laag: bergen of een vulkaan (boven zee alleen lage eilandjes; de vulkaan blijft) ---
  float hF = 0.0, isV = 0.0;
  if (uSil2 > 0.5) {
    hF = bergen(az) * mix(1.0, 0.25, zeeM);
    if (uSil2 > 1.5) { float hv = vulkaan(az); if (hv > hF) { hF = hv; isV = 1.0; } }
  }
  if (el < hF) {
    vec3 fk = uHor * 0.16 + uZen * 0.25 + vec3(0.004, 0.004, 0.008);
    fk += (uGloed * 0.25 + vec3(0.08, 0.09, 0.14) * uMaan) * smoothstep(0.006, 0.0, hF - el) * 0.5;
    if (isV > 0.5) {  // lavastromen
      float va = wrapA(az - uVulkAz);
      float stroom = smoothstep(0.004, 0.0, abs(va - 0.025 * sin(el * 60.0 + 1.0) - 0.02)) + smoothstep(0.003, 0.0, abs(va + 0.03 + 0.01 * sin(el * 90.0)));
      fk += vec3(1.0, 0.3, 0.05) * stroom * smoothstep(0.03, 0.17, el) * (0.6 + 0.4 * sin(el * 120.0 + uT * 3.0)) * (0.8 + 0.6 * uPuls);
    }
    col = fk;
  } else if (uSil2 > 1.5) {  // pluim en kratergloed boven de vulkaan (de drop = uitbarsting)
    float vd = abs(wrapA(az - uVulkAz)), boven = el - 0.18;
    if (vd < 0.3 && boven > -0.03) {
      float pl = fbm(vec2(wrapA(az - uVulkAz) * 18.0, boven * 12.0 - uT * 0.35)) * exp(-max(boven, 0.0) * 9.0) * smoothstep(0.05 + boven * 0.6, 0.0, vd);
      vec3 pk = mix(vec3(0.02, 0.01, 0.015), vec3(1.0, 0.35, 0.08), exp(-max(boven, 0.0) * 25.0) * (0.6 + 0.8 * uDrop + 0.4 * uPuls));
      col = mix(col, pk, clamp(pl * 1.5, 0.0, 1.0));
      col += vec3(1.0, 0.4, 0.1) * exp(-vd * 30.0) * exp(-abs(boven) * 30.0) * (0.5 + 1.5 * uDrop + 0.5 * uPuls * uEn);
    }
  }
  // --- nabije laag: boomkruinen (jungle) of palmen met struikjes (strand), nooit voor de open zee ---
  if (uSil > 0.5) {
    float hN = uSil < 1.5 ? kruinen(az, 110.0, 0.018, 0.035, uZaad) : kruinen(az, 160.0, 0.004, 0.01, uZaad + 2.0);
    float nab = smoothstep(hN + 0.0006, hN - 0.0006, el) * step(-0.01, el);
    if (uSil > 1.5) nab = max(nab, palmen(az, el, 34.0, uZaad + 1.0));
    nab *= 1.0 - zeeM;
    vec3 nk = vec3(0.003, 0.004, 0.007) + uGloed * 0.03 + vec3(0.05, 0.06, 0.09) * uMaan * smoothstep(0.004, 0.0, hN - el) * step(uSil, 1.5);
    col = mix(col, nk, nab);
  }
  // --- onder de horizon: donker land of zee (lucht gespiegeld, maanglitter, neonreflecties) ---
  if (el < 0.0) {
    float ee = -el;
    vec3 land = uLand + uHor * 0.18 * exp(-ee * 25.0);
    vec3 zee = vec3(0.0);
    if (zeeM > 0.0) {
      vec2 X = d.xz * (2.0 / max(ee, 0.002));
      float golf = vn(X * vec2(0.35, 0.9) + vec2(uT * 0.4, 0.0));
      zee = mix(uHor, uZen, 0.2 + min(ee * 3.0, 0.8)) * 0.4 * (0.6 + 0.5 * golf);
      if (uMaan > 0.5) {
        float mAz = atan(uMaanDir.x, uMaanDir.z), pad = exp(-abs(wrapA(az - mAz)) / (0.02 + ee * 0.6) * 3.0);
        zee += vec3(0.8, 0.85, 1.0) * pad * pow(vn(X * 3.0 + uT * vec2(0.7, 1.3)), 6.0) * 5.0;
      }
      if (uZons > 0.0) zee += vec3(1.0, 0.4, 0.5) * exp(-abs(wrapA(az - uZonAz)) / (0.03 + ee) * 2.0) * pow(golf, 3.0) * uZons;
      zee += kl(az * 0.3 + uT * 0.05) * pow(golf, 4.0) * 0.08 * (0.6 + uPuls * uEn + uDrop);
    }
    col = mix(land, zee, zeeM);
  }
  // --- verre vuurtjes langs de horizon: andere feestjes ver weg ---
  if (uVerre > 0.0 && abs(el) < 0.012) {
    float N = 260.0, cw = TAU / N, x = (az + PI) / cw, i = floor(x), h = h21(vec2(mod(i, N), uZaad + 3.3));
    if (h > 0.82) {
      float dd = length(vec2(fract(x) - 0.5, (el - 0.002) / cw * 1.5));
      col += vec3(1.0, 0.45, 0.12) * exp(-dd * dd * 80.0) * (0.55 + 0.45 * sin(uT * (5.0 + 7.0 * h) + h * 50.0)) * (1.0 - zeeM) * uVerre;
    }
  }
  gl_FragColor = vec4(col, 1.0);
}`;
  const GROND_VS = `varying vec3 vP, vW;
void main() { vP = position; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
  const GROND_FS = `varying vec3 vP, vW;
uniform vec3 uHor, uZen, uLand, uMaanDir, uZonDir;
uniform float uSoort, uZee, uZeeAz, uKust, uZaad, uMaan, uZons;
void main() {
  vec2 p = vP.xz;
  float niv = 1.0 - 0.5 * uBlack;
  vec3 col = uLand * 1.5;
  float golf0 = exp(-((length(p) - fract(uTel) * 30.0) * (length(p) - fract(uTel) * 30.0)) * 0.03) * (1.0 - fract(uTel));   // ring vanuit het midden op elke tel
  if (uSoort > 1.5) {  // zand in maanlicht: ribbels en glinsterende korrels
    float rib = sin(dot(p, vec2(0.8, 0.6)) * 5.0 + vn(p * 0.7) * 6.0);
    col = vec3(0.05, 0.045, 0.06) * (0.8 + 0.25 * rib + 0.3 * vn(p * 3.0)) + uHor * 0.03;
    float hk = h21(floor(p * 25.0) + uZaad);
    col += vec3(0.6, 0.7, 1.0) * pow(hk, 60.0) * (0.5 + 0.5 * sin(uT * 3.0 + hk * 30.0)) * 0.7;
  } else if (uSoort > 0.5) {  // junglebodem: bladafval, lichtgevende mosstipjes en zwamdraden die op de tel oplichten
    col = vec3(0.016, 0.014, 0.012) * (0.6 + 0.8 * fbm(p * 0.6));
    vec2 c = floor(p * 3.0), fr = fract(p * 3.0) - 0.5;
    float h = h21(c + uZaad);
    float tapijt = smoothstep(0.5, 0.8, fbm(p * 0.12 + uZaad));   // plekken met lichtgevend mos
    if (h > 0.9 - 0.25 * tapijt) { float r = length(fr - (vec2(h21(c + 1.7), h21(c + 4.1)) - 0.5) * 0.6); col += mix(vec3(0.1, 1.0, 0.6), uK1, 0.4) * exp(-r * r * 90.0) * (0.5 + 0.3 * sin(uT * 2.0 + h * 40.0) + 0.8 * golf0) * niv; }
    col += mix(vec3(0.05, 0.6, 0.35), uK1, 0.3) * tapijt * 0.035 * (0.7 + 0.5 * uPuls) * niv;
    float m = abs(vn(p * 0.45 + 3.0) - 0.5), loop = pow(fract(vn(p * 0.2 + 7.0) * 3.0 - uReis * 0.15), 6.0);
    col += kl(length(p) * 0.03 + uReis * 0.02) * smoothstep(0.014, 0.0, m) * (0.1 + 0.6 * loop + 0.3 * golf0 + 0.2 * uDrop) * niv;
  } else {
    col += kl(length(p) * 0.02) * smoothstep(0.015, 0.0, abs(vn(p * 0.3) - 0.5)) * (0.04 + 0.2 * golf0) * niv;
  }
  vec3 ver = uLand + uHor * 0.18;
  if (uZee > 0.5) {  // water voorbij de kustlijn, lichtgevende branding die op de tel naar het strand rolt
    vec2 zd = vec2(sin(uZeeAz), cos(uZeeAz));
    float s = dot(p, zd) - uKust;
    col *= 1.0 - 0.4 * smoothstep(-2.5, 0.0, s);   // nat zand
    vec2 q = vec2(dot(p, vec2(zd.y, -zd.x)), s);
    // golfjes: normaal uit twee ruislagen, dan spiegeling (fresnel: dichtbij donker, ver weg de lucht) en een glitterpad naar zon/maan
    vec2 o1 = vec2(uT * 0.15, -uT * 0.35), o2 = vec2(-uT * 0.3, -uT * 0.8);
    float g1 = vn(q * vec2(0.25, 0.6) + o1);
    mat2 dr = mat2(0.8, -0.6, 0.6, 0.8);   // twee gedraaide lagen: geen raster in de schittering
    vec2 qa = dr * q * vec2(0.9, 1.7) + o2, qb = q * vec2(1.9, 0.8) * dr - o1 * 1.7;
    float g2 = vn(qa) + 0.6 * vn(qb);
    float gx = vn(qa + vec2(0.12, 0.0)) + 0.6 * vn(qb + vec2(0.12, 0.0)) - g2, gz = vn(qa + vec2(0.0, 0.12)) + 0.6 * vn(qb + vec2(0.0, 0.12)) - g2;
    g2 *= 0.62;
    vec3 wn = normalize(vec3(gx * 0.55, 1.0, gz * 0.55));
    vec3 V = normalize(vW - cameraPosition), Rf = reflect(V, wn);
    float fr = pow(1.0 - max(dot(-V, wn), 0.0), 4.0);
    vec3 lucht = mix(uHor, uZen, clamp(Rf.y * 2.5, 0.0, 1.0));
    vec3 water = vec3(0.004, 0.008, 0.02) + uZen * 0.15 + lucht * (0.08 + 0.55 * fr);
    if (uMaan > 0.5) water += vec3(0.8, 0.85, 1.0) * pow(max(dot(Rf, normalize(uMaanDir)), 0.0), 240.0) * 3.0;
    if (uZons > 0.0) water += vec3(1.0, 0.55, 0.4) * pow(max(dot(Rf, normalize(uZonDir)), 0.0), 120.0) * 2.5 * uZons;
    water += kl(q.x * 0.05 + uT * 0.05) * pow(g1, 6.0) * 0.06 * (0.6 + uPuls * uEn + uDrop);
    float fase = s * 0.16 + uReis * 0.22 + 0.25 * vn(q * 0.15);
    float front = pow(0.5 + 0.5 * sin(fase * TAU), 8.0) * (0.6 + 0.8 * g1);
    float breek = exp(-max(s, 0.0) * 0.12) * (0.35 + 0.65 * smoothstep(0.0, 2.0, s));
    vec3 bio = mix(vec3(0.0, 0.85, 1.0), uK1, 0.35);
    water += bio * front * breek * (0.35 + 0.5 * uPuls * uEn + 0.6 * pow(1.0 - fract(uTel), 3.0) + 0.8 * uDrop) * (0.6 + 0.6 * g2) * niv;
    water += bio * smoothstep(0.9, 0.0, abs(s - 0.4)) * (0.25 + 0.4 * uPuls) * niv;   // schuimlijn
    col = mix(col, water, smoothstep(0.0, 0.6, s));
    ver = mix(ver, mix(uHor, uZen, 0.2) * 0.4, smoothstep(-20.0, 20.0, s));
  }
  col = mix(col, ver, smoothstep(45.0, 92.0, distance(cameraPosition, vW)));
  gl_FragColor = vec4(col, 1.0);
}`;
  const HEMEL_SOORT = {
    nacht: { zen: 0x02030c, hor: 0x1a1240, gloed: 0x2a1650, land: 0x030306 },
    jungle: { zen: 0x010610, hor: 0x0b2a2a, gloed: 0x14402e, land: 0x020403 },
    zonsondergang: { zen: 0x0c0420, hor: 0xb83a2c, gloed: 0xa01860, land: 0x07030a, zons: 1 },  // onder de bloom-drempel (0,6): alleen de zon gloeit op
    trippy: { zen: 0x080014, hor: 0x3a0a5a, gloed: 0x6a10a0, land: 0x040208, trip: 1 },
  };
  const richting = (az, el) => new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
  function hemel(groep, o) {
    o = o || {}; tel.aanroepen++;
    const P = HEMEL_SOORT[o.soort] || HEMEL_SOORT.nacht, r = rndVan(o), Z = zwVan(o);
    const maan = o.maan === false ? null : Object.assign({ az: 0.55, el: 0.42 }, typeof o.maan === 'object' ? o.maan : {});
    const zee = o.zee || null;
    const u = {
      uZen: f(kleurVan(o.zenit, P.zen)), uHor: f(kleurVan(o.horizon, P.hor)), uGloed: f(kleurVan(o.gloed, P.gloed)), uLand: f(kleurVan(o.land, P.land)),
      uMaanDir: f(maan ? richting(maan.az, maan.el) : new THREE.Vector3(0, 1, 0)), uMaan: f(maan ? 1 : 0),
      uAurora: f(o.aurora != null ? +o.aurora : (o.soort === 'zonsondergang' ? 0 : 0.7)) , uNevel: f(o.nevel != null ? +o.nevel : 0.6),
      uSter: f(o.sterren != null ? +o.sterren : 1), uSil: f({ geen: 0, jungle: 1, palmen: 2 }[o.silhouet || 'jungle'] || 0),
      uSil2: f({ geen: 0, bergen: 1, vulkaan: 2 }[o.verte || 'bergen'] || 0), uZee: f(zee ? 1 : 0), uZeeAz: f(zee ? +zee.az || 0 : 0),
      uZeeB: f(zee ? (zee.breed || 1.1) : 1), uKust: f(zee ? (zee.kust != null ? zee.kust : 12) : 0), uZaad: f(o.zaad != null ? +o.zaad % 97 : r() * 97),
      uZons: f(P.zons || 0), uZonAz: f(o.zonAz != null ? o.zonAz : zee ? +zee.az || 0 : 0), uTrip: f(P.trip || 0),
      uVulkAz: f(o.vulkaanAz != null ? o.vulkaanAz : -0.7 + r() * 0.5), uVerre: f(o.verreVuren != null ? +o.verreVuren : 1),
      uSoort: f({ donker: 0, jungle: 1, zand: 2 }[o.grond] != null ? { donker: 0, jungle: 1, zand: 2 }[o.grond] : (o.soort === 'jungle' ? 1 : zee ? 2 : 0)),
    };
    if (Z >= 2) { u.uNevel.value *= 0.5; u.uAurora.value *= 0.7; }
    const mat = shMat(HEMEL_VS, HEMEL_FS, u, { side: THREE.BackSide, depthWrite: false });
    const mesh = geenStraal(new THREE.Mesh(HEMEL_GEO, mat));
    mesh.frustumCulled = false; mesh.renderOrder = 1e6;  // als laatste van de dichte dingen: wat al getekend is, rekent hij niet
    mesh.name = 'buiten-hemel'; groep.add(mesh);
    let grond = null;
    if (o.grond !== false) {
      const gm = shMat(GROND_VS, GROND_FS, { uHor: u.uHor, uZen: u.uZen, uLand: u.uLand, uMaanDir: u.uMaanDir, uMaan: u.uMaan, uSoort: u.uSoort,
        uZee: u.uZee, uZeeAz: u.uZeeAz, uKust: u.uKust, uZaad: u.uZaad, uZons: u.uZons, uZonDir: f(richting(u.uZonAz.value, 0.035)) });
      grond = new THREE.Mesh(GROND_GEO, gm);
      grond.position.y = o.grondY != null ? o.grondY : -0.03; grond.name = 'buiten-grond'; grond.frustumCulled = false;
      grond.raycast = () => {};  // vlak onder de vloer: geen botsing (de figuren staan op y 0)
      groep.add(grond);
    }
    return {
      mesh, grond, uniforms: u,
      zet(w) {
        if (!w) return;
        const k = { aurora: 'uAurora', nevel: 'uNevel', trip: 'uTrip', sterren: 'uSter', verreVuren: 'uVerre' };
        for (const n in k) if (w[n] != null) u[k[n]].value = +w[n];
      },
    };
  }

  // =====================================================================================================================================
  // 2. ROTSPOORT: de ingang. Bergflank over de hele breedte (en verder, de uiteinden buigen om de kamer heen) met een runenpoort om de deur
  // =====================================================================================================================================
  const ROTS_VS = `attribute float aTop;
varying vec3 vP, vN, vW; varying float vTop;
void main() { vP = position; vN = normal; vTop = aTop; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
  const ROTS_FS = `varying vec3 vP, vN, vW; varying float vTop;
uniform vec3 uHor;
uniform float uMos, uRanken;
void main() {
  vec3 n = normalize(vN);
  vec2 q = abs(n.y) > 0.65 ? vP.xz : vec2(vP.x + vP.z * 0.4, vP.y);
  float r1 = fbm(q * 0.33), r2 = vn(q * 2.1 + 5.0);
  vec3 c = vec3(0.032, 0.027, 0.036) * (0.45 + 1.0 * r1) * (0.8 + 0.4 * r2);
  c *= 0.85 + 0.15 * sin(vP.y * 2.6 + r1 * 5.0);                                        // gesteentelagen
  c *= 0.45 + 0.75 * max(n.z, 0.0) + 0.35 * max(n.y, 0.0);                                // reliëf: zijvlakken en overhang donkerder
  float fl = 0.75 + 0.25 * sin(uT * 9.0 + vP.x * 0.5) * sin(uT * 13.7 + vP.y);
  c += vec3(1.0, 0.42, 0.12) * max(n.z, 0.0) * exp(-max(vP.y, 0.0) * 0.1) * 0.12 * fl * uVlam;   // vuurgloed uit de kamer
  c += vec3(0.28, 0.34, 0.6) * max(n.y * 0.7 + n.z * 0.3, 0.0) * 0.045;                           // maanlicht
  float niv = 1.0 - 0.55 * uBlack;
  // aderen die langzaam omhoog stromen; op elke tel een ring vanuit de poort
  float a = vn(q * vec2(0.2, 0.12) + vec2(1.3, -uReis * 0.05)), b = vn(q * vec2(0.55, 0.33) + vec2(7.1, -uReis * 0.09));
  float ader = smoothstep(0.028, 0.0, abs(a - 0.5)) + 0.7 * smoothstep(0.02, 0.0, abs(b - 0.5)) * smoothstep(0.35, 0.5, a);
  float dp = length(vec2(vP.x, (vP.y - 1.3) * 1.2));
  float ring = exp(-((dp - fract(uTel) * 22.0) * (dp - fract(uTel) * 22.0)) * 0.06) * (1.0 - fract(uTel));
  c += kl(vP.y * 0.03 + vP.x * 0.01 + uReis * 0.02) * ader * (0.18 + 0.35 * uPuls * uEn + ring * (0.9 + 1.2 * uDrop) + 0.3 * uOpb) * niv;
  if (uMos > 0.0) {  // bioluminescent mos in plekken
    vec2 mc = floor(q * 5.0), mf = fract(q * 5.0) - 0.5;
    float mh = h21(mc + 3.7);
    if (mh > 0.6) {
      float rr = length(mf - (vec2(h21(mc + 1.1), h21(mc + 2.2)) - 0.5) * 0.6);
      c += mix(vec3(0.15, 1.0, 0.55), uK1, 0.4) * exp(-rr * rr * 60.0) * smoothstep(0.55, 0.75, fbm(q * 0.25 + 9.0)) * uMos * (0.35 + 0.4 * sin(uT * 2.0 + mh * 30.0) + 0.5 * uPuls) * niv;
    }
  }
  if (uRanken > 0.0 && n.z > 0.3) {  // lichtgevende lianen van de bovenrand, met druppels licht die omlaag lopen
    float ci = floor(vP.x / 1.7), hR = h21(vec2(ci, 4.4));
    if (hR > 0.35) {
      float lang = 3.0 + 8.0 * h21(vec2(ci, 8.8)), onder = vTop - lang;
      float xc = (ci + 0.5 + (hR - 0.5) * 0.6) * 1.7 + 0.18 * sin(vP.y * 1.1 + hR * 6.0);
      float lijn = smoothstep(0.05, 0.0, abs(vP.x - xc)) * smoothstep(onder - 0.5, onder + 0.5, vP.y);
      c += mix(vec3(0.2, 1.0, 0.5), uK0, 0.3) * lijn * (0.12 + 0.9 * pow(fract(vP.y * 0.5 + uT * 0.6 + hR * 5.0), 8.0)) * uRanken * niv;
    }
  }
  c = mix(c, uHor * 0.25, smoothstep(6.0, 40.0, vP.y) * 0.5 + smoothstep(25.0, 75.0, distance(cameraPosition, vW)) * 0.4);
  gl_FragColor = vec4(flitsWit(c), 1.0);
}`;
  const POORT_VS = `varying vec3 vP, vN, vW;
void main() { vP = position; vN = normal; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
  const POORT_FS = `varying vec3 vP, vN, vW;
uniform vec3 uB;
float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }
float rune(vec2 q, float h) {  // een stam met 0-5 takken uit de bits van h
  float d = seg(q, vec2(0.0, -0.38), vec2(0.0, 0.38));
  if (fract(h * 2.0) > 0.5) d = min(d, seg(q, vec2(0.0, 0.38), vec2(0.28, 0.12)));
  if (fract(h * 4.0) > 0.5) d = min(d, seg(q, vec2(0.0, 0.1), vec2(-0.28, -0.12)));
  if (fract(h * 8.0) > 0.5) d = min(d, seg(q, vec2(-0.26, 0.0), vec2(0.26, 0.0)));
  if (fract(h * 16.0) > 0.5) d = min(d, seg(q, vec2(0.0, -0.38), vec2(0.26, -0.18)));
  if (fract(h * 32.0) > 0.5) d = min(d, seg(q, vec2(0.0, 0.38), vec2(-0.26, 0.2)));
  return d;
}
void main() {
  vec3 n = normalize(vN);
  vec2 q = abs(n.z) > 0.5 ? vP.xy : abs(n.x) > 0.5 ? vec2(vP.z, vP.y) : vP.xz;
  vec3 c = vec3(0.04, 0.036, 0.045) * (0.6 + 0.7 * fbm(q * 1.3));
  c += vec3(1.0, 0.42, 0.12) * max(n.z, 0.0) * 0.08 * uVlam;
  float niv = 1.0 - 0.5 * uBlack;
  vec2 cel = q / 0.26, id = floor(cel);
  float h = h21(id + 7.7), d = rune(fract(cel) - 0.5, h);
  float aan = smoothstep(0.35, 0.0, fract((id.y + abs(id.x) * 0.37) * 0.11 - uTel * 0.25));   // runen lichten op, de golf klimt per tel
  float kk = (0.12 + 0.9 * aan * (0.6 + 0.6 * uEn) + 0.8 * uDrop * step(0.5, fract(uTel * 2.0 + h))) * niv;
  c = c * (1.0 - 0.6 * smoothstep(0.12, 0.05, d)) + klH(floor(uTel / 4.0) + step(0.5, h)) * smoothstep(0.075, 0.035, d) * kk;
  float binnen = ((abs(n.x) > 0.5 && abs(vP.x) < 1.3) || n.y < -0.5) ? 1.0 : 0.0;   // binnenkant van de poort: uv-gloed
  c += uB * binnen * (0.18 + 0.4 * uPuls * uEn + 0.5 * uDrop) * niv;
  gl_FragColor = vec4(flitsWit(c), 1.0);
}`;
  const STEEN_VS = `attribute vec4 iS;
varying vec3 vN, vW, vL; varying vec4 vS;
void main() {
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vW = w.xyz; vL = position; vS = iS;
  vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
  const STEEN_FS = `varying vec3 vN, vW, vL; varying vec4 vS;
uniform vec3 uLicht, uHor;
uniform float uLichtK, uMos, uPad;
void main() {
  vec3 n = normalize(vN);
  vec3 c = vec3(0.03, 0.028, 0.034) * (0.6 + 0.7 * vn(vL.xz * 3.0 + vL.y * 2.0 + vS.y * 5.0));
  vec3 L = uLicht - vW; float dl = length(L);
  c += vec3(1.0, 0.45, 0.14) * max(dot(n, L / max(dl, 0.01)), 0.0) * uLichtK / (1.0 + dl * dl * 0.15) * (0.75 + 0.25 * sin(uT * 13.0 + vW.x)) * uVlam;
  c += vec3(0.25, 0.3, 0.5) * max(n.y, 0.0) * 0.04;
  float niv = 1.0 - 0.5 * uBlack;
  if (uMos > 0.0) {  // mos: kleine lichtgevende stipjes bovenop
    vec2 mc = floor(vL.xz * 9.0 + vS.y * 31.0); float mh = h21(mc);
    float st = step(0.86, mh) * smoothstep(0.42, 0.12, length(fract(vL.xz * 9.0 + vS.y * 31.0) - 0.5));
    c += mix(uK1, vec3(0.2, 1.0, 0.6), 0.5) * st * smoothstep(0.1, 0.5, n.y) * uMos * (0.35 + 0.35 * sin(uT * 2.0 + mh * 40.0) + 0.5 * uPuls) * niv;
  }
  if (uPad > 0.0) {  // rune bovenop, een golf licht loopt langs het pad naar de uitgang
    float per = mix(mix(8.0, 2.0, isDrop()), 16.0, isBreak());
    float gp = fract(uTel / per) * 1.3 - 0.15, golf = 0.3 + 1.6 * exp(-(((vS.x - gp) * 9.0) * ((vS.x - gp) * 9.0)));
    float rr = length(vL.xz);
    float lijn = smoothstep(0.07, 0.0, abs(rr - 0.55)) + smoothstep(0.06, 0.0, abs(vL.x * 0.7 + vL.z * 0.7)) * step(rr, 0.55);
    c += kl(vS.x + uT * 0.05) * smoothstep(0.4, 0.8, n.y) * lijn * golf * uPad * niv;
  }
  gl_FragColor = vec4(flitsWit(c), 1.0);
}`;
  const ZWAM_VS = `attribute vec4 iK;
varying vec3 vN, vW, vL; varying vec4 vK;
void main() {
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vW = w.xyz; vL = position; vK = iK;
  vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
  const ZWAM_FS = `varying vec3 vN, vW, vL; varying vec4 vK;
uniform vec3 uBron;
uniform float uKristal;
void main() {
  vec3 n = normalize(vN), V = normalize(cameraPosition - vW);
  float rim = ((1.0 - abs(dot(n, V))) * (1.0 - abs(dot(n, V))));
  float golf = exp(-((distance(vW.xz, uBron.xz) - fract(uTel * 0.5) * 16.0) * (distance(vW.xz, uBron.xz) - fract(uTel * 0.5) * 16.0)) * 0.25);   // golf vanuit de poort, om de 2 tellen
  float k = (0.35 + 0.17 * sin(uT * 1.5 + vK.w * 20.0) + 0.5 * uPuls * uEn + golf * 1.2 + 0.6 * uDrop) * (1.0 - 0.5 * uBlack);
  vec3 c;
  if (uKristal > 0.5) {
    float facet = pow(abs(dot(n, normalize(vec3(0.3, 1.0, 0.2)))), 4.0);
    c = vK.rgb * (0.15 + 0.6 * facet + 0.7 * rim) * k + vec3(1.0) * pow(facet, 8.0) * 0.4 * k;
  } else if (vL.y > 0.97) {
    float stip = step(0.82, h21(floor(vL.xz * 14.0 + vK.w * 9.0)));
    c = vK.rgb * (0.25 + 0.6 * rim) * k + vec3(1.0) * stip * 0.4 * k;
  } else c = mix(vec3(0.05, 0.06, 0.05), vK.rgb * 0.4, 0.4 + 0.4 * rim) * (0.4 + 0.6 * k);
  gl_FragColor = vec4(flitsWit(c), 1.0);
}`;
  const PALET0 = [0xff2d95, 0x00e5ff, 0x7cff00];
  const palet = o => (o && o.palet ? o.palet : PALET0).map(c => kleurVan(c));
  function steenMesh(lijst, o) {  // lijst [{ x, y, z, sx, sy, sz, ry, s (padpositie) }] -> InstancedMesh met de steen-shader
    const geo = losKloon(STEEN_GEO), n = Math.max(1, lijst.length), iS = new Float32Array(n * 4);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pv = new THREE.Vector3(), sv = new THREE.Vector3();
    const mesh = new THREE.InstancedMesh(geo, shMat(STEEN_VS, STEEN_FS, { uLicht: f(o.licht ? new THREE.Vector3(o.licht.x, o.licht.y, o.licht.z) : new THREE.Vector3(0, 1, 0)),
      uLichtK: f(o.lichtK || 0), uMos: f(o.mos || 0), uPad: f(o.pad || 0), uHor: f(new THREE.Color(0x1a1240)) }), n);
    lijst.forEach((s, i) => {
      mesh.setMatrixAt(i, m4.compose(pv.set(s.x, s.y || 0, s.z), q.setFromEuler(e.set(s.rx || 0, s.ry || 0, s.rz || 0)), sv.set(s.sx, s.sy, s.sz)));
      iS.set([s.s || 0, Math.random(), 0, 0], i * 4);
    });
    geo.setAttribute('iS', new THREE.InstancedBufferAttribute(iS, 4));
    mesh.frustumCulled = false; mesh.instanceMatrix.needsUpdate = true;
    // uniforms vasthouden: bij het opwarmen hangt de kern tijdelijk een ander materiaal aan de mesh (uploadRender)
    const um = mesh.material.uniforms, lokaal = um.uLicht.value.clone();  // lamp in kamer-ruimte; de shader rekent in de wereld
    mesh.onBeforeRender = () => { um.uLicht.value.copy(lokaal).applyMatrix4(mesh.matrixWorld); };
    return mesh;
  }
  function rotsPoort(groep, maat, o) {
    o = o || {}; tel.aanroepen++;
    const r = rndVan(o), Z = zwVan(o), w = maat.w, D = maat.d / 2, PAL = palet(o);
    const hoog = o.hoog || 14, piek = o.piek == null ? 38 : o.piek, X = w / 2 + (o.breed == null ? 26 : o.breed), diep = o.diep || 16;
    const n = ruis2(Math.floor(r() * 1e6)), g = new THREE.Group(); g.name = 'buiten-rotspoort'; groep.add(g);
    const H = x => {  // hoogte van de wand; rond de deur hoog genoeg voor een liftschacht (34 m) erachter
      let h = Math.max(hoog + (n(x * 0.13, 7.7) - 0.5) * 6, piek * Math.exp(-Math.pow(x / 9.5, 2)) + (n(x * 0.2, 3.3) - 0.5) * 4);
      if (piek > 30 && Math.abs(x) < 4.2) h = Math.max(h, piek - 2);
      return h;
    };
    const buig = x => Math.min(14, 0.03 * Math.pow(Math.max(0, Math.abs(x) - (w / 2 + 3)), 2));  // uiteinden buigen om de kamer heen (+z)
    const relief = (x, y) => {  // naar achteren (-z), nooit de kamer in; vlak rond de poort
      const dx = Math.max(Math.abs(x) - 2.0, 0), dy = Math.max(y - 3.8, 0), fade = glad(Math.hypot(dx, dy), 0, 2.5);
      return (1.5 * n(x * 0.17, y * 0.19) + 0.7 * n(x * 0.6 + 5, y * 0.6) + 0.9 * Math.max(0, Math.sin(x * 0.45 + 2 * n(x * 0.1, 3)))) * fade;
    };
    // kolommen (x): fijn rond de deur, grof naar buiten; ±1 (deurpost) zit erin
    const xs = [0];
    for (let x = 0; x < X - 1e-3;) { x += Math.abs(x) < 3 ? 0.5 : Math.abs(x) < 10 ? 1.0 : Math.abs(x) < 20 ? 1.6 : 2.4; xs.push(Math.min(x, X)); }
    const kol = xs.slice(1).reverse().map(x => -x).concat(xs);
    const ONDER = [0, 0.65, 1.3, 1.95, 2.6], NB = Z >= 2 ? 9 : 14;
    const KAP = [[0.8, 0.6], [3, 1.4], [7, 1.2], [12, 0], [diep, -2.5]];
    const rijen = ONDER.length + NB + KAP.length;
    const pos = [], top = [], idx = [];
    for (const x of kol) {
      const h = H(x), bz = -D + buig(x);
      for (const y of ONDER) { pos.push(x, y, bz - relief(x, y)); top.push(h); }
      for (let j = 1; j <= NB; j++) { const y = 2.6 + (h - 2.6) * j / NB; pos.push(x, y, bz - relief(x, y) - (j === NB ? 0.4 : 0)); top.push(h); }
      const zt = bz - relief(x, h) - 0.4;
      for (const [dz, dy] of KAP) { pos.push(x, h + dy * (0.7 + 0.6 * n(x * 0.3, dz)), zt - dz); top.push(h); }
    }
    for (let i = 0; i < kol.length - 1; i++) for (let j = 0; j < rijen - 1; j++) {
      if (j < ONDER.length - 1 && kol[i] >= -1 - 1e-3 && kol[i + 1] <= 1 + 1e-3) continue;  // het deurgat (2 x 2,6 m)
      const a = i * rijen + j, b = (i + 1) * rijen + j, c = b + 1, d = a + 1;
      idx.push(a, b, c, a, c, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aTop', new THREE.Float32BufferAttribute(top, 1));
    geo.setIndex(idx); geo.computeVertexNormals(); geo.computeBoundingSphere();
    const hz = o.hemel && o.hemel.uniforms ? o.hemel.uniforms.uHor : f(new THREE.Color(0x1a1240));
    const rots = new THREE.Mesh(geo, shMat(ROTS_VS, ROTS_FS, { uHor: hz, uMos: f(o.mos != null ? o.mos : 1), uRanken: f(o.ranken != null ? o.ranken : 1) }));
    rots.name = 'rotswand'; g.add(rots);
    // runenpoort: twee posten, latei en deksteen (0,55 m de kamer in, binnenkant van de deur blijft 2 x 2,6 m)
    const bx = (x0, x1, y0, y1, z0, z1) => new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    const pg = samenvoegen([bx(1.0, 1.8, 0, 3.0, -D - 0.05, -D + 0.55), bx(-1.8, -1.0, 0, 3.0, -D - 0.05, -D + 0.55),
      bx(-1.8, 1.8, 2.6, 3.45, -D - 0.05, -D + 0.6), bx(-2.05, 2.05, 3.45, 3.78, -D - 0.05, -D + 0.7)]);
    pg.computeBoundingSphere();
    g.add(new THREE.Mesh(pg, shMat(POORT_VS, POORT_FS, { uB: f(PAL[1]) })));
    // voet van de wand: brokken steen en (jungle) lichtgevende paddenstoelen of (strand) kristallen
    const brok = [];
    for (let i = 0; i < [16, 11, 7][Z]; i++) {
      let x = (r() - 0.5) * (w + 8); if (Math.abs(x) < 3.2) x = (x < 0 ? -1 : 1) * (3.2 + r() * 3);
      const s = 0.5 + r() * 1.3;
      brok.push({ x, y: s * 0.25, z: -D + buig(x) + 0.2 + r() * 1.2, sx: s * (1 + r() * 0.6), sy: s * (0.7 + r() * 0.5), sz: s, ry: r() * 6.3 });
    }
    g.add(steenMesh(brok, { mos: 0.8, licht: { x: 0, y: 1.2, z: -D + 6 }, lichtK: 1.2 }));
    const deco = o.deco || 'paddenstoelen';
    if (deco !== 'geen') {
      const kris = deco === 'kristallen', lijst = [];
      for (let c = 0; c < [9, 6, 4][Z]; c++) {
        let cx = (r() - 0.5) * (w + 6); if (Math.abs(cx) < 2.3) cx = (cx < 0 ? -1 : 1) * (2.3 + r() * 2.5);
        const cz = -D + buig(cx) + 0.4 + r() * 1.6, kleur = r() < 0.6 ? PAL[Math.floor(r() * 3)] : new THREE.Color(NEON[Math.floor(r() * NEON.length)]);
        for (let k = 0; k < 2 + Math.floor(r() * 4); k++) {
          const s = kris ? 0.5 + r() * 1.6 : (r() < 0.12 ? 1.6 + r() * 0.8 : 0.35 + r() * 0.9);
          lijst.push({ x: cx + (r() - 0.5) * 1.4, z: cz + (r() - 0.5) * 1.0, s, ry: r() * 6.3, tilt: kris ? (r() - 0.5) * 0.7 : (r() - 0.5) * 0.25, kleur });
        }
      }
      const zg = losKloon(kris ? KRISTAL_GEO : ZWAM_GEO), nz = lijst.length, iK = new Float32Array(nz * 4);
      const zm = new THREE.InstancedMesh(zg, shMat(ZWAM_VS, ZWAM_FS, { uBron: f(new THREE.Vector3(0, 0, -D)), uKristal: f(kris ? 1 : 0) }), nz);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pv = new THREE.Vector3(), sv = new THREE.Vector3();
      lijst.forEach((p, i) => {
        zm.setMatrixAt(i, m4.compose(pv.set(p.x, 0, p.z), q.setFromEuler(e.set(p.tilt, p.ry, p.tilt * 0.5)), sv.setScalar(p.s)));
        iK.set([p.kleur.r, p.kleur.g, p.kleur.b, r()], i * 4);
      });
      zg.setAttribute('iK', new THREE.InstancedBufferAttribute(iK, 4));
      zm.frustumCulled = false; g.add(zm);
      const zu = zm.material.uniforms;  // (vast: zie steenMesh)
      zm.onBeforeRender = () => { zu.uBron.value.set(0, 0, -D).applyMatrix4(zm.matrixWorld); };
    }
    if (o.tekst) {  // neon boven de poort
      const bord = geenStraal(neonSign(String(o.tekst), '#' + PAL[0].getHexString(), 3.6, 0.9));
      bord.position.set(0, 4.45, -D + 0.75); g.add(bord);
    }
    return { groep: g, rots };
  }

  // =====================================================================================================================================
  // 3. LIFTTOREN: de uitgang. Glazen toren om de liftschacht (34 m hoog, 30 m diep) + lobby om het sas of de S-gang
  // =====================================================================================================================================
  const GEVEL_VS = `attribute float aS;
varying vec3 vP, vN, vW; varying float vS;
void main() { vP = position; vN = normal; vS = aS; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
  const GEVEL_FS = GLYF_GLSL + `varying vec3 vP, vN, vW; varying float vS;
uniform vec3 uA, uB, uC, uHor, uZen;
uniform float uH, uZ0, uZ1, uTW, uPH, uNul;
vec3 pal(float i) { float j = mod(floor(i), 3.0); return j < 0.5 ? uA : j < 1.5 ? uB : uC; }
void main() {
  vec3 n = normalize(vN), V = normalize(cameraPosition - vW);
  float niv = 1.0 - 0.6 * uBlack, y = vP.y;
  vec3 c;
  if (vS > 1.5) {  // daken: donker, ledraster
    vec2 g = abs(fract(vP.xz / 2.0) - 0.5);
    c = vec3(0.012, 0.012, 0.018) + uB * 0.06 * smoothstep(0.47, 0.5, max(g.x, g.y)) * niv;
  } else {
    float u = dot(vP, vec3(n.z, 0.0, -n.x));   // langs de gevel, naar rechts voor wie ervoor staat
    bool toren = vS < 0.5;
    float cw = toren ? 1.1 : 1.5, fh = toren ? 3.5 : uPH;
    vec2 cel = vec2(u / cw, y / fh), id = floor(cel), fr = fract(cel);
    float mul = max(smoothstep(0.05, 0.0, min(fr.x, 1.0 - fr.x) * cw), smoothstep(0.07, 0.0, min(fr.y, 1.0 - fr.y) * fh));
    vec3 R = reflect(-V, n);   // glas: de nachtlucht en wat neon spiegelen
    vec3 refl = mix(uHor * 0.45, uZen * 0.7 + vec3(0.01, 0.01, 0.03), clamp(R.y * 1.3 + 0.15, 0.0, 1.0));
    refl += kl(R.x * 0.15 + uT * 0.02) * 0.05 * pow(max(0.0, sin(R.y * 9.0 + R.x * 3.0 + uT * 0.4)), 10.0);
    // achter elk raam een eigen leven (donker, kantoorlicht of een feestje), nieuw per 8 tellen; op de drop overal feest
    float hh = h21(id + vec2(floor(uTel / 8.0) * 7.13, vS * 31.0));
    float feest = step(0.72 - 0.3 * uDrop - 0.15 * uOpb, hh), kantoor = step(0.55, hh) * (1.0 - feest);
    vec2 cr = fr - 0.5;
    vec3 binnen = vec3(1.0, 0.78, 0.5) * 0.13 * kantoor + pal(hh * 7.0 + floor(uTel)) * feest * (0.18 + 0.45 * uPuls * uEn + 0.5 * uDrop) * (0.6 + 0.4 * step(0.5, fract(uTel * 2.0 + hh)));
    if (!toren) binnen = vec3(0.14, 0.11, 0.18) + pal(id.x * 0.5 + floor(uTel / 2.0)) * (0.12 + 0.25 * uPuls * uEn);   // lobby: altijd licht
    c = refl * 0.55 + binnen * (1.0 - 1.2 * dot(cr, cr)) * niv;
    c = mix(c, vec3(0.008, 0.008, 0.012), mul);
    // lichtring die op elke tel langs de toren omhoog loopt (opbouw sneller)
    float sn = 1.0 + isOpb() * floor(uOpb * 4.0) + isDrop();
    float rp = fract(uTel * sn) * (uH + 10.0) - 5.0, ring = exp(-(((y - rp) / 1.6) * ((y - rp) / 1.6))) * (1.0 - 0.6 * isBreak());
    float dl = abs(fract(y / fh + 0.5) - 0.5) * fh;
    c += pal(floor(y / fh + 0.5) + floor(uTel)) * exp(-dl * dl * 500.0) * step(0.3, y) * (0.25 + 0.5 * uPuls * uEn + 1.4 * ring + 0.6 * uDrop) * niv;
    if (toren) {
      float ed = abs(n.z) > 0.5 ? abs(abs(vP.x) - uTW) : min(abs(vP.z - uZ0), abs(vP.z - uZ1));   // hoekstrips met looplicht omhoog
      c += pal(1.0) * exp(-ed * ed * 260.0) * (0.3 + 0.7 * step(0.5, fract(y * 0.6 - uT * (1.5 + 3.0 * uOpb + 2.0 * uDrop)))) * (0.6 + 0.6 * uPuls + ring) * niv;
      if (n.z < -0.5) {
        // verdiepingsnummers bij de rechterhoek: 2 cijfers als ledmatrix, fel als de ring langskomt
        float k = floor((y - 0.4) / fh), ly = y - k * fh - 0.55;
        vec2 gc = vec2((u - (uTW - 1.05)) / 0.07, (0.7 - ly) / 0.1);
        if (k >= 1.0 && gc.x >= 0.0 && gc.x < 11.0 && gc.y >= 0.0 && gc.y < 7.0) {
          float nr = k + uNul, ci = floor(gc.x / 6.0);
          float gi = ci < 0.5 ? floor(mod(nr / 10.0, 10.0)) : floor(mod(nr, 10.0));
          float led = glyf(gi, vec2(gc.x - ci * 6.0, gc.y)) * smoothstep(0.5, 0.3, length(fract(gc) - 0.5));
          c += pal(2.0) * led * (0.25 + 1.2 * exp(-(((y - rp) / 2.5) * ((y - rp) / 2.5))) + 0.4 * uDrop) * niv;
        }
        // de schacht: glazen strook midden op de voorgevel, de cabine gaat op en neer (op de reis: opbouw/drop sneller)
        float cabY = uPH + 3.0 + (uH - uPH - 8.0) * (0.5 + 0.5 * sin(uReis * 0.17));
        if (abs(vP.x) < 0.8 && y > uPH) {
          c = vec3(0.01, 0.015, 0.04) + pal(0.0) * 0.06 + uB * 0.2 * exp(-dl * dl * 300.0);
          c += vec3(1.0, 0.95, 0.85) * smoothstep(1.1, 0.8, abs(y - cabY)) * (0.8 + 0.4 * uPuls);
          c += pal(1.0) * smoothstep(0.08, 0.0, 0.8 - abs(vP.x)) * 0.6 * niv;
        } else c += vec3(0.9, 0.85, 1.0) * exp(-(((y - cabY) / 4.0) * ((y - cabY) / 4.0))) * exp(-abs(vP.x) * 0.9) * 0.12;
      }
      if (y > uH - 1.8) c = c * 0.3 + kl(u * 0.08 - uT * 0.4 + y * 0.1) * (0.5 + 0.8 * uPuls * uEn + 0.6 * uDrop) * niv * (0.6 + 0.4 * step(0.5, fract(u * 2.0 - uT * 3.0)));
    } else {
      c += kl(u * 0.05 - uT * 0.3) * (smoothstep(0.22, 0.0, uPH - y) + smoothstep(0.12, 0.0, y)) * (0.6 + 0.6 * uPuls) * niv;   // lobby: ledrand dak en plint
    }
    c = mix(c, uHor * 0.3, smoothstep(10.0, 60.0, y) * 0.35);
  }
  gl_FragColor = vec4(flitsWit(c), 1.0);
}`;
  const DISPLAY_VS = 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
  const DISPLAY_FS = GLYF_GLSL + `varying vec2 vUv;
uniform float uLvl; uniform vec3 uA;
void main() {   // pijl omhoog (knippert), dan het level met 2 cijfers ('-' bij een negatief level)
  vec2 gc = vec2(vUv.x * 17.0, (1.0 - vUv.y) * 7.0);
  float ci = floor(gc.x / 6.0), a = abs(uLvl);
  float g = ci < 0.5 ? 15.0 : ci < 1.5 ? (uLvl < -0.5 ? 10.0 : floor(mod(a / 10.0, 10.0))) : floor(mod(a, 10.0));
  float led = glyf(g, vec2(gc.x - ci * 6.0, gc.y)) * smoothstep(0.5, 0.25, length(fract(gc) - 0.5));
  float knip = ci < 0.5 ? 0.3 + 0.7 * step(0.5, fract(uTel * 0.5)) : 1.0;
  gl_FragColor = vec4(vec3(0.015, 0.008, 0.005) + uA * led * knip * (1.2 + 0.4 * uPuls), 1.0);
}`;
  const BAKEN_VS = `attribute vec2 aK;
varying vec3 vKl; varying float vA;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float wit = step(0.5, aK.x);
  float knip = mix(step(0.55, fract(uT * 0.8 + aK.y)), pow(1.0 - fract(uTel), 6.0) * (0.5 + 0.5 * uEn) + uFlits, wit);
  vKl = mix(vec3(1.0, 0.08, 0.04), vec3(1.0), wit); vA = 0.25 + knip;
  gl_PointSize = clamp((0.5 + 0.7 * wit) * projectionMatrix[1][1] * uPx / max(1.0, -mv.z), 2.0, 48.0);
  gl_Position = projectionMatrix * mv;
}`;
  const PUNT_FS = `varying vec3 vKl; varying float vA;
void main() { vec2 c = gl_PointCoord * 2.0 - 1.0; float d = dot(c, c); if (d > 1.0) discard; gl_FragColor = vec4(vKl, (exp(-d * 4.0) + 0.6 * exp(-d * 25.0)) * vA); }`;
  const BUNDEL_VS = `attribute float iB;
uniform vec3 uTop;
varying float vT, vF; varying vec3 vKl;
void main() {
  float az = iB * PI + 0.9 * sin(uT * 0.21 + iB * 2.0) + uT * 0.12 * (iB * 2.0 - 1.0) + uReis * 0.02;
  float el = 0.95 + 0.3 * sin(uT * 0.17 + iB * 4.0);
  vec3 dir = vec3(cos(el) * sin(az), sin(el), cos(el) * cos(az));
  vec3 zij = normalize(cross(dir, vec3(0.0, 0.0, 1.0)) + vec3(0.0, 0.001, 0.0)), op = cross(zij, dir);
  vec3 rn = position.x * zij + position.z * op;
  vec3 w = (modelMatrix * vec4(uTop, 1.0)).xyz + dir * position.y * 70.0 + rn * (0.25 + position.y * 5.5);
  vec3 V = normalize(cameraPosition - w);
  vT = position.y; vF = abs(dot(normalize(rn), V));
  vKl = mix(klH(iB + floor(uTel / 8.0)), vec3(1.0), 0.35);
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;
  const BUNDEL_FS = `varying float vT, vF; varying vec3 vKl;
void main() {
  float a = ((1.0 - vT) * (1.0 - vT)) * pow(1.0 - vF, 1.5) * (0.1 + 0.08 * uPuls * uEn + 0.15 * uDrop) * (1.0 - 0.7 * uBlack);
  gl_FragColor = vec4(vKl, a);
}`;
  function bouwer() {  // quads met normaal + soort-attribuut; ux x uy = de normaal (naar buiten)
    const P = [], N = [], A = [], I = [];
    return {
      quad(o, ux, uy, s) {
        const i = P.length / 3, nx = ux[1] * uy[2] - ux[2] * uy[1], ny = ux[2] * uy[0] - ux[0] * uy[2], nz = ux[0] * uy[1] - ux[1] * uy[0], l = Math.hypot(nx, ny, nz) || 1;
        for (const [a, b] of [[0, 0], [1, 0], [1, 1], [0, 1]]) { P.push(o[0] + ux[0] * a + uy[0] * b, o[1] + ux[1] * a + uy[1] * b, o[2] + ux[2] * a + uy[2] * b); N.push(nx / l, ny / l, nz / l); A.push(s); }
        I.push(i, i + 1, i + 2, i, i + 2, i + 3);
      },
      geo() {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
        g.setAttribute('aS', new THREE.Float32BufferAttribute(A, 1)); g.setIndex(I); g.computeBoundingSphere();
        return g;
      },
    };
  }
  function liftToren(groep, maat, o) {
    o = o || {}; tel.aanroepen++;
    const r = rndVan(o), Z = zwVan(o), D = maat.d / 2, PAL = palet(o);
    const TH = Math.max(36, o.hoog || 44), TW = 3.3, Z0 = D + 0.4, Z1 = D + 9.4, PW = (o.breed || 15) / 2, PH = 4.6, PZ = D + 8.0;
    const g = new THREE.Group(); g.name = 'buiten-lifttoren'; groep.add(g);
    // gevel: toren (soort 0), lobby (1), daken (2) in één mesh. De voorgevel van de toren begint pas boven de lobby (anders snijdt hij het sas)
    const b = bouwer();
    b.quad([TW, PH, Z0], [-2 * TW, 0, 0], [0, TH - PH, 0], 0);           // voor (-z, naar de kamer)
    b.quad([-TW, 0, Z1], [2 * TW, 0, 0], [0, TH, 0], 0);                 // achter
    b.quad([TW, 0, Z1], [0, 0, -(Z1 - Z0)], [0, TH, 0], 0);              // rechts (+x)
    b.quad([-TW, 0, Z0], [0, 0, Z1 - Z0], [0, TH, 0], 0);                // links
    b.quad([-TW, TH, Z1], [2 * TW, 0, 0], [0, 0, -(Z1 - Z0)], 2);        // dak
    // lobby: voorgevel met het deurgat (x ±1, y 0..2,6) precies op de deur van de kamer
    b.quad([PW, 0, D], [-(PW - 1), 0, 0], [0, PH, 0], 1);
    b.quad([-1, 0, D], [-(PW - 1), 0, 0], [0, PH, 0], 1);
    b.quad([1, 2.6, D], [-2, 0, 0], [0, PH - 2.6, 0], 1);
    b.quad([-PW, 0, PZ], [2 * PW, 0, 0], [0, PH, 0], 1);
    b.quad([PW, 0, PZ], [0, 0, -(PZ - D)], [0, PH, 0], 1);
    b.quad([-PW, 0, D], [0, 0, PZ - D], [0, PH, 0], 1);
    b.quad([-PW, PH, PZ], [2 * PW, 0, 0], [0, 0, -(PZ - D)], 2);
    // binnenkant van het deurgat in de lobbygevel is nul diep (de gevel is een vlak): het sas van de lift / de gang begint daar meteen
    const hz = o.hemel && o.hemel.uniforms ? o.hemel.uniforms : null;
    const gevel = new THREE.Mesh(b.geo(), shMat(GEVEL_VS, GEVEL_FS, { uA: f(PAL[0]), uB: f(PAL[1]), uC: f(PAL[2]),
      uHor: hz ? hz.uHor : f(new THREE.Color(0x1a1240)), uZen: hz ? hz.uZen : f(new THREE.Color(0x02030c)), uGlyf: f(GLYF_TEX),
      uH: f(TH), uZ0: f(Z0), uZ1: f(Z1), uTW: f(TW), uPH: f(PH), uNul: f(Math.floor(r() * 3)) }));
    gevel.name = 'lifttoren'; g.add(gevel);
    // antenne op het dak
    const ant = new THREE.Mesh(new THREE.BoxGeometry(0.12, 7, 0.12), new THREE.MeshBasicMaterial({ color: 0x0a0a10 }));
    ant.position.set(0, TH + 3.5, (Z0 + Z1) / 2); g.add(ant);
    // deurkozijn: ledstrips om de deur (led.js), het LIFT-neon en het leveldisplay erboven
    const LED = doolhof.led, zk = D - 0.04;
    if (LED && LED.strips) {
      const k = LED.strips([[-1.06, 0, zk, -1.06, 2.66, zk], [1.06, 0, zk, 1.06, 2.66, zk], [-1.06, 2.66, zk, 1.06, 2.66, zk]], { palet: { a: PAL[0], b: PAL[1], c: PAL[2], donker: 0x020104 }, zaad: Math.floor(r() * 997), helder: 1, dik: 0.07, diep: 0.06 });
      geenStraal(k); g.add(k);
    } else {
      const km = new THREE.MeshBasicMaterial({ color: PAL[1] });
      for (const [x, y, sx, sy] of [[-1.06, 1.33, 0.07, 2.66], [1.06, 1.33, 0.07, 2.66], [0, 2.66, 2.2, 0.07]]) { const m = geenStraal(new THREE.Mesh(BOX_EIG, km)); m.position.set(x, y, zk); m.scale.set(sx, sy, 0.06); g.add(m); }
    }
    const bord = geenStraal(neonSign(o.tekst || 'LIFT', '#' + PAL[0].getHexString(), 2.4, 0.75));
    bord.position.set(0, 3.62, D - 0.06); bord.rotation.y = Math.PI; g.add(bord);
    const dm = shMat(DISPLAY_VS, DISPLAY_FS, { uLvl: f(0), uA: f(new THREE.Color(0xff7a10)), uGlyf: f(GLYF_TEX) });
    const disp = geenStraal(new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.35), dm));
    disp.position.set(0, 2.98, D - 0.05); disp.rotation.y = Math.PI;
    disp.onBeforeRender = () => { const l = typeof doolhof.level === 'number' ? doolhof.level : 0; if (dm.uniforms.uLvl.value !== l) { dm.uniforms.uLvl.value = l; dm.uniformsNeedUpdate = true; } };
    g.add(disp);
    // obstakellichten (rood, knipperen) op de hoeken + witte flits op de antenne (op de tel)
    const bp = [], bk = [];
    for (const [x, z] of [[-TW, Z0], [TW, Z0], [-TW, Z1], [TW, Z1]]) {
      bp.push(x, TH + 0.25, z); bk.push(0, r());
      for (let y = 12; y < TH - 4; y += 12) { bp.push(x, y, z); bk.push(0, r()); }
    }
    bp.push(0, TH + 7.1, (Z0 + Z1) / 2); bk.push(1, 0);
    const bgeo = new THREE.BufferGeometry();
    bgeo.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3)); bgeo.setAttribute('aK', new THREE.Float32BufferAttribute(bk, 2));
    const bak = new THREE.Points(bgeo, addMat(BAKEN_VS, PUNT_FS)); bak.frustumCulled = false; g.add(bak);
    // zoeklichten vanaf het dak, zwaaien langzaam door de lucht
    const nb = o.zoeklichten == null ? (Z >= 2 ? 1 : 2) : o.zoeklichten;
    if (nb > 0) {
      const ig = new THREE.InstancedBufferGeometry();
      for (const k of ['position', 'normal', 'uv']) ig.setAttribute(k, BUNDEL_GEO.attributes[k].clone());
      ig.setIndex(BUNDEL_GEO.index.clone());
      ig.setAttribute('iB', new THREE.InstancedBufferAttribute(new Float32Array(Array.from({ length: nb }, (_, i) => i)), 1)); ig.instanceCount = nb;
      const bm = geenStraal(new THREE.Mesh(ig, addMat(BUNDEL_VS, BUNDEL_FS, { uTop: f(new THREE.Vector3(0, TH + 0.5, (Z0 + Z1) / 2)) }, { side: THREE.DoubleSide })));
      bm.frustumCulled = false; bm.renderOrder = 4; g.add(bm);
    }
    // gloed op de grond voor de deur
    gloed(g, [{ x: 0, y: 0.02, z: D - 1.2, r: 2.6, kleur: PAL[1] }], { plat: true, sterk: 0.5 });
    return { groep: g, gevel };
  }
  const BOX_EIG = houd(new THREE.BoxGeometry(1, 1, 1));

  // =====================================================================================================================================
  // 4. VUUR: vlammen, vonken, halo en grondgloed in één draw; kampvuur (+ hout en stenen), fakkels (bamboe + kom + vlam)
  // =====================================================================================================================================
  const VUUR_VS = `attribute vec3 iP; attribute vec4 iD;
uniform float uSterk, uKleur;
varying vec2 vC; varying vec3 vKl; varying float vA, vS, vZ;
vec3 kleurVuur(float l) {  // varianten: 1 blauw (gas), 2 groen (chemisch), 3 paars, 4 de kleuren van de show
  vec3 c = vuurKleur(l);
  if (uKleur < 0.5) return c;
  vec3 a = uKleur < 1.5 ? vec3(0.4, 0.9, 1.0) : uKleur < 2.5 ? vec3(0.5, 1.0, 0.3) : uKleur < 3.5 ? vec3(1.0, 0.4, 1.0) : uK0;
  vec3 b = uKleur < 1.5 ? vec3(0.1, 0.25, 1.0) : uKleur < 2.5 ? vec3(0.05, 0.7, 0.2) : uKleur < 3.5 ? vec3(0.45, 0.05, 1.0) : uK1;
  return mix(mix(vec3(1.0), a, smoothstep(0.0, 0.25, l)), b, smoothstep(0.25, 0.75, l)) * (1.35 - l);
}
void main() {
  float soort = iD.x, z = iD.y, s = iD.z, F = uVlam * uSterk;
  vec3 b = (modelMatrix * vec4(iP, 1.0)).xyz, w = b;
  float H = 0.9 * s * iD.w * (0.75 + 0.45 * F);
  vec2 sz = vec2(0.0); vec3 col = vec3(0.0); float a = 0.0; bool plat = false;
  if (soort < 0.5) {         // vlam: stijgt op, krimpt, wit -> oranje -> rood
    float life = fract(uT * (1.25 + 0.6 * z) * (0.7 + 0.35 * F) + z * 7.31), ang = z * 40.0;
    float rr = 0.16 * s * (1.0 - life) * (0.4 + 0.6 * fract(z * 3.7));
    w += vec3(cos(ang) * rr, life * H, sin(ang) * rr);
    w.x += sin(uT * 3.1 + z * 21.0 + life * 5.0) * 0.07 * s * life;
    w.z += cos(uT * 2.7 + z * 13.0 + life * 4.0) * 0.07 * s * life;
    float gr = (0.3 - 0.18 * life) * s * (0.85 + 0.3 * fract(z * 5.3)) * (0.8 + 0.25 * F);
    sz = vec2(gr * 0.8, gr * 1.25); col = kleurVuur(life); a = smoothstep(0.0, 0.08, life) * (1.0 - life);
  } else if (soort < 1.5) {  // vonk: stijgt hoog op, wervelt, dooft (drop: een fontein)
    float life = fract(uT * (0.35 + 0.3 * z) + z * 3.97);
    float hh = life * H * (2.2 + 1.6 * fract(z * 9.1)) * (0.8 + 0.8 * uDrop + 0.2 * F);
    w += vec3(sin(z * 50.0 + life * 6.0 + uT * 0.7) * 0.35 * life * s, hh, cos(z * 31.0 + life * 5.0) * 0.35 * life * s);
    sz = vec2((0.018 + 0.016 * fract(z * 7.7)) * (0.7 + 0.5 * s)); col = kleurVuur(0.15) * 1.3;
    a = (1.0 - life) * (0.6 + 0.4 * sin(uT * 20.0 + z * 90.0));
  } else if (soort < 2.5) {  // halo
    w += vec3(0.0, H * 0.45, 0.0);
    sz = vec2(H * 1.5 * (0.9 + 0.2 * F)); col = kleurVuur(0.35); a = 0.2 * (0.8 + 0.2 * sin(uT * 11.0 + z * 6.0)) * F;
  } else {                   // grondgloed: plat op de grond
    plat = true; col = kleurVuur(0.4); a = 0.5 * F * (0.85 + 0.15 * sin(uT * 9.0 + z * 4.0));
    w += vec3(position.x, 0.0, position.y) * s * 3.2 * (0.9 + 0.15 * F) + vec3(0.0, 0.03, 0.0);
  }
  vC = position.xy; vKl = col; vA = a * (1.0 - 0.35 * uBlack); vS = soort; vZ = z;
  if (plat) gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
  else { vec4 mv = viewMatrix * vec4(w, 1.0); mv.xy += position.xy * sz; gl_Position = projectionMatrix * mv; }
}`;
  const VUUR_FS = `varying vec2 vC; varying vec3 vKl; varying float vA, vS, vZ;
void main() {
  vec2 c = vC; float m;
  if (vS < 0.5) {  // druppel met de punt omhoog en tongen die omhoog lekken
    float y = c.y * 0.5 + 0.5, bx = c.x / (1.0 - 0.55 * y);
    m = smoothstep(1.0, 0.25, length(vec2(bx, (c.y + 0.15) * 0.85))) * (0.7 + 0.6 * vn(vec2(c.x * 2.5 + vZ * 30.0, c.y * 2.0 - uT * 6.0)));
  } else if (vS < 1.5) m = exp(-dot(c, c) * 4.0);
  else m = exp(-dot(c, c) * 3.0) * smoothstep(1.0, 0.7, length(c));
  gl_FragColor = vec4(vKl, m * vA);
}`;
  const VUUR_KLEUR = { vuur: 0, blauw: 1, groen: 2, paars: 3, show: 4 };
  function vuur(groep, plekken, o) {
    o = o || {}; tel.aanroepen++;
    if (!plekken || !plekken.length) return null;
    const Z = zwVan(o), r = rndVan(o);
    const nV = Math.max(3, Math.round((o.vlammen || 24) * [1, 0.6, 0.35][Z])), nE = Math.round((o.vonken == null ? 14 : o.vonken) * [1, 0.6, 0.3][Z]);
    const per = nV + nE + (o.gloed === false ? 0 : 2), n = plekken.length * per;
    const iP = new Float32Array(n * 3), iD = new Float32Array(n * 4);
    const mid = new THREE.Vector3(); let k = 0, maxS = 0;
    for (const p of plekken) {
      const s = p.s || 1, h = p.h || 1, y = p.y || 0; mid.x += p.x; mid.y += y; mid.z += p.z; maxS = Math.max(maxS, s * h);
      const zet = soort => { iP.set([p.x, y, p.z], k * 3); iD.set([soort, r(), s, h], k * 4); k++; };
      for (let i = 0; i < nV; i++) zet(0);
      for (let i = 0; i < nE; i++) zet(1);
      if (o.gloed !== false) { zet(2); zet(3); }
    }
    const geo = quadGeo(n, { iP: [iP, 3], iD: [iD, 4] });
    mid.divideScalar(plekken.length);
    let straal = 0; for (const p of plekken) straal = Math.max(straal, Math.hypot(p.x - mid.x, p.z - mid.z));
    geo.boundingSphere = new THREE.Sphere(mid.add(new THREE.Vector3(0, maxS, 0)), straal + 4 * maxS + 1);
    const mat = addMat(VUUR_VS, VUUR_FS, { uSterk: f(o.sterk || 1), uKleur: f(VUUR_KLEUR[o.kleur] || 0) });
    const mesh = geenStraal(new THREE.Mesh(geo, mat)); mesh.name = 'buiten-vuur'; mesh.renderOrder = 5;
    const lamp = o.lamp || null, lampK = lamp ? lamp.intensity : 0;
    if (lamp) mesh.onBeforeRender = () => { const t = U.uT.value; lamp.intensity = lampK * U.uVlam.value * (0.82 + 0.1 * Math.sin(t * 11.3) + 0.08 * Math.sin(t * 23.1)) * (1 - 0.4 * U.uBlack.value); };
    groep.add(mesh);
    return { mesh, plekken, zet(w) { if (w && w.sterk != null) mat.uniforms.uSterk.value = w.sterk; } };
  }
  const HOUT_VS = `varying vec3 vL, vN, vW;
void main() { vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vW = w.xyz; vL = position; vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`;
  const HOUT_FS = `varying vec3 vL, vN, vW;
uniform vec3 uKern;
void main() {   // verkoold hout met gloeiende barsten, het felst bij de kern van het vuur
  float bars = smoothstep(0.06, 0.0, abs(vn(vec2(vL.y * 6.0, atan(vL.x, vL.z) * 2.0)) - 0.5));
  float dicht = exp(-distance(vW, uKern) * 1.4);
  float k = (0.4 + 0.6 * sin(uT * 2.3 + vL.y * 7.0)) * uVlam;
  vec3 c = vec3(0.025, 0.015, 0.01) * (0.6 + 0.6 * vn(vL.xy * 9.0)) + vec3(1.0, 0.35, 0.06) * bars * (0.3 + 1.2 * dicht) * k + vec3(1.0, 0.5, 0.15) * dicht * 0.25 * k;
  gl_FragColor = vec4(c, 1.0);
}`;
  function kampvuur(groep, plek, o) {
    o = Object.assign({ vlammen: 60, vonken: 34 }, o || {}); tel.aanroepen++;
    const s = o.s || 2.4, r = rndVan(o), Z = zwVan(o), x = plek.x, z = plek.z;
    const v = vuur(groep, [{ x, z, s, h: o.h || 1.15 }], o);
    // houtblokken: tipi van 6 + 3 liggend
    const nh = 9, hout = new THREE.InstancedMesh(HOUT_GEO, shMat(HOUT_VS, HOUT_FS, { uKern: f(new THREE.Vector3()) }), nh);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pv = new THREE.Vector3(), sv = new THREE.Vector3(), k = s / 2.4;
    for (let i = 0; i < nh; i++) {
      const a = i / 6 * Math.PI * 2 + r() * 0.3;
      if (i < 6) m4.compose(pv.set(x + Math.sin(a) * 0.35 * k, 0.55 * k, z + Math.cos(a) * 0.35 * k), q.setFromEuler(e.set(-0.62 * Math.cos(a), 0, 0.62 * Math.sin(a))), sv.setScalar(k));
      else { const b = (i - 6) / 3 * Math.PI * 2; m4.compose(pv.set(x + Math.sin(b) * 0.55 * k, 0.1 * k, z + Math.cos(b) * 0.55 * k), q.setFromEuler(e.set(Math.PI / 2, b + Math.PI / 2, 0, 'YXZ')), sv.setScalar(k * 0.9)); }
      hout.setMatrixAt(i, m4);
    }
    const hu = hout.material.uniforms;  // (vast: zie steenMesh)
    hout.onBeforeRender = () => { hu.uKern.value.set(x, 0.3 * k, z).applyMatrix4(hout.matrixWorld); };
    hout.frustumCulled = false; groep.add(hout);
    // stenen kring, verlicht door het vuur
    const ns = [16, 12, 9][Z], kring = [];
    for (let i = 0; i < ns; i++) { const a = i / ns * Math.PI * 2 + r() * 0.2, rr = 1.05 * k + r() * 0.15, sc = (0.18 + r() * 0.1) * k; kring.push({ x: x + Math.sin(a) * rr, y: sc * 0.35, z: z + Math.cos(a) * rr, sx: sc * 1.3, sy: sc, sz: sc, ry: r() * 6.3 }); }
    const stenen = steenMesh(kring, { licht: { x, y: 0.8 * k, z }, lichtK: 2.5 });
    groep.add(stenen);
    return { vuur: v, hout, stenen, mesh: v && v.mesh };
  }
  const BAMBOE_VS = `varying vec3 vL, vN; varying float vTop;
uniform float uTop;
void main() { vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vL = position; vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`;
  const BAMBOE_FS = `varying vec3 vL, vN;
uniform float uTop;
void main() {
  vec3 n = normalize(vN);
  float kom = step(uTop - 0.02, vL.y), ringen = smoothstep(0.03, 0.0, abs(fract(vL.y / 0.32) - 0.5) - 0.44);
  float licht = exp(-(uTop - vL.y) * 1.3) * (0.8 + 0.2 * sin(uT * 12.0 + vL.y)) * uVlam;
  vec3 c = mix(vec3(0.06, 0.04, 0.022) * (1.0 - 0.5 * ringen), vec3(0.03, 0.025, 0.02), kom);
  c += vec3(1.0, 0.45, 0.12) * licht * (0.25 + 0.35 * max(n.y, 0.0)) + vec3(1.0, 0.5, 0.1) * kom * 0.15 * uVlam;
  gl_FragColor = vec4(c, 1.0);
}`;
  function fakkels(groep, plekken, o) {
    o = o || {}; tel.aanroepen++;
    if (!plekken || !plekken.length) return null;
    const r = rndVan(o), h0 = o.hoogte || 1.9;
    const paal = new THREE.CylinderGeometry(0.035, 0.05, h0, 6).translate(0, h0 / 2, 0), kom = new THREE.CylinderGeometry(0.12, 0.06, 0.22, 8).translate(0, h0 + 0.09, 0);
    const geo = samenvoegen([paal, kom]);
    const m = new THREE.InstancedMesh(geo, shMat(BAMBOE_VS, BAMBOE_FS, { uTop: f(h0) }), plekken.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pv = new THREE.Vector3(), sv = new THREE.Vector3();
    const vlammen = plekken.map((p, i) => {
      const s = p.s || (0.9 + r() * 0.2), tilt = (r() - 0.5) * 0.08;
      m.setMatrixAt(i, m4.compose(pv.set(p.x, 0, p.z), q.setFromEuler(e.set(tilt, r() * 6.3, -tilt)), sv.setScalar(s)));
      return { x: p.x, y: (h0 + 0.16) * s, z: p.z, s: 0.36 * s, h: 1.1 };
    });
    m.frustumCulled = false; groep.add(m);
    const v = vuur(groep, vlammen, Object.assign({ vlammen: 14, vonken: 5 }, o, { lamp: o.lamp }));
    return { palen: m, vuur: v, toppen: vlammen };
  }

  // =====================================================================================================================================
  // 5. POI: vuurdraaiers aan figuren (ballen aan kettingen, staf, ledhoepel, vuurspuwer); alle banen in de vertex-shader
  // =====================================================================================================================================
  const MAXD = 8;
  const POI_VS = `#define MAXD ${MAXD}
attribute vec4 iA;
uniform vec3 uHandL[MAXD], uHandR[MAXD], uRechts[MAXD], uVoor[MAXD], uHeup[MAXD], uHoofd[MAXD];
uniform float uModus[MAXD], uSpuw[MAXD];
uniform vec4 uPat[MAXD];
uniform float uKet, uT1;
varying vec2 vC; varying vec3 vKl; varying float vA, vKern;
vec3 poiPat(float p, float b, float ph) {  // (rechts, op, voor) in kettinglengtes; b = 0 linkerbal, 1 rechterbal; ph = omwentelingen
  float th = TAU * ph, sb = b * 2.0 - 1.0, tb = th + PI * b;
  if (p < 0.5) return vec3(cos(th), sin(th), 0.0);                       // zelfde tijd, zelfde richting
  if (p < 1.5) return vec3(cos(tb), sin(tb), 0.0);                       // split-time
  if (p < 2.5) return vec3(sb * cos(th), sin(th), 0.0);                  // vlinder (gespiegeld)
  if (p < 3.5) { float a = th * 0.5 + PI * b; return vec3(0.34 * cos(a) + 0.8 * cos(-3.0 * a), 0.34 * sin(a) + 0.8 * sin(-3.0 * a), 0.0); }   // antispin-bloem, 4 bladen
  if (p < 4.5) return vec3(sin(tb), 0.5 * sin(2.0 * tb), 0.0);           // liggende acht
  return vec3(0.0, sin(tb), cos(tb));                                     // wiel: in het zijvlak
}
vec3 stafPat(float p, float b, float ph) {  // staf: halve snelheid, twee brandende uiteinden
  float th = PI * ph, sb = b * 2.0 - 1.0;
  if (p < 0.5) return sb * vec3(cos(th), sin(th), 0.0);
  if (p < 1.5) { float k = 0.7 * sin(th * 0.5); return sb * vec3(cos(th), sin(th) * cos(k), sin(th) * sin(k)); }   // acht (vlak kantelt)
  return sb * vec3(cos(th), 0.0, sin(th));                                // propeller boven het hoofd
}
void main() {
  int i = int(iA.x + 0.5);
  float slot = iA.y, z = iA.z, modus = uModus[i];
  vec4 P = uPat[i];
  vec3 R = uRechts[i], F = uVoor[i], Y = vec3(0.0, 1.0, 0.0), w = vec3(0.0), col = vec3(0.0);
  float g = 0.0, a = 0.0, kern = 0.0, ph = uSpin + P.w;
  if (modus < 2.5) {           // poi (0 vuur, 1 led) of staf (2): bal/uiteinde b, spoorpunt k (0 = kop)
    float b = floor(slot / uT1), k = mod(slot, uT1) / max(uT1 - 1.0, 1.0);
    float q = ph - k * (modus < 0.5 ? 0.5 : modus < 1.5 ? 0.6 : 0.5);
    if (modus < 1.5) {
      vec3 o = mix(poiPat(P.x, b, q), poiPat(P.y, b, q), P.z);
      w = (b < 0.5 ? uHandL[i] : uHandR[i]) + uKet * (o.x * R + o.y * Y + o.z * F);
    } else {
      vec3 o = mix(stafPat(P.x, b, q), stafPat(P.y, b, q), P.z);
      vec3 c = 0.5 * (uHandL[i] + uHandR[i]);
      c = mix(c, uHoofd[i] + Y * 0.3, mix(step(1.5, P.x), step(1.5, P.y), P.z));
      w = c + uKet * 0.95 * (o.x * R + o.y * Y + o.z * F);
    }
    if (modus > 0.5 && modus < 1.5) {   // ledpoi: harde kleur per bal (op de tel/halve tel om), gestreept spoor; af en toe regenboog
      vec3 c1 = klH(b + floor(uTel * mix(0.5, 2.0, isDrop())));
      vec3 c2 = neon(fract(k * 1.5 + uT * 0.25 + b * 0.5));
      col = mix(mix(c1, c2, step(0.5, fract(uTel / 32.0))), vec3(1.0), 0.15 + 0.6 * uFlits) * 1.4;
      g = 0.095 - 0.04 * k; a = (1.0 - 0.8 * k) * (0.35 + 0.65 * step(0.4, fract(k * 7.0)));
      kern = (1.0 - step(0.01, k)) * 0.6;
    } else {                           // vuur: witte kern, oranje-rood spoor dat flakkert
      col = vuurKleur(k * 0.9);
      g = (0.21 - 0.11 * k) * (1.0 + 0.25 * uPuls);
      a = pow(1.0 - k, 0.85) * (0.7 + 0.3 * h11(z * 7.0 + floor(uT * 20.0)));
      kern = 1.0 - k;
    }
  } else if (modus < 3.5) {    // ledhoepel om de heup (opbouw/drop: naar borst en boven het hoofd), 3 spoorpunten per led
    float NL = floor(2.0 * uT1 / 3.0), led = mod(slot, NL), k = floor(slot / NL) / 2.0;
    float th = TAU * (ph * 0.5 - k * 0.12), rise = mix(P.x, P.y, P.z);
    vec3 c = uHeup[i] + Y * 0.08;
    c = mix(c, mix(c + Y * 0.45, uHoofd[i] + Y * 0.35, clamp(rise - 1.0, 0.0, 1.0)), clamp(rise, 0.0, 1.0));
    c += 0.12 * (cos(th) * R + sin(th) * F) * (1.0 - 0.6 * clamp(rise - 1.0, 0.0, 1.0));
    vec3 nrm = normalize(Y + 0.28 * (cos(th) * R + sin(th) * F)), e1 = normalize(cross(nrm, F)), e2 = cross(nrm, e1);
    float aL = TAU * led / NL + th * 0.25;
    w = c + 0.48 * (cos(aL) * e1 + sin(aL) * e2);
    col = kl(led / NL + uT * 0.3) * (1.0 + 0.8 * step(0.75, fract(led / NL * 4.0 - uTel))) * 1.2;
    g = 0.055; a = (1.0 - k * 0.8) * step(k, 1.01);
  } else if (modus < 4.5) {    // vuurspuwer: een vuurbal uit de mond, vooruit en omhoog
    float age = uSpuw[i] - slot / (2.0 * uT1) * 0.3, aan = step(0.0, age) * step(age, 1.3);
    vec3 sp = (vec3(h11(z * 3.1), h11(z * 5.7), h11(z * 9.3)) - 0.5) * 1.6;
    w = uHoofd[i] + F * 0.16 - Y * 0.04 + (F * 4.2 + Y * 1.6 + sp) * age * (1.0 - 0.3 * age) + Y * 1.2 * age * age;
    g = (0.06 + 0.6 * age) * aan; col = vuurKleur(age * 0.75); a = pow(1.0 - age / 1.3, 1.6) * aan;
  }
  vC = position.xy; vKl = col; vA = a * (1.0 - 0.3 * uBlack); vKern = kern;
  vec4 mv = viewMatrix * vec4(w, 1.0); mv.xy += position.xy * g;
  gl_Position = projectionMatrix * mv;
}`;
  const POI_FS = `varying vec2 vC; varying vec3 vKl; varying float vA, vKern;
void main() {
  float d = dot(vC, vC);
  if (d > 1.0) discard;
  gl_FragColor = vec4(vKl + vec3(1.0, 0.9, 0.7) * vKern * exp(-d * 20.0), (exp(-d * 3.5) + vKern * 1.2 * exp(-d * 16.0)) * vA);
}`;
  const POI_MODUS = { vuur: 0, led: 1, staf: 2, hoepel: 3, spuwer: 4 };
  const POI_PAT = { 0: [0, 1, 2, 3, 4, 5], 1: [0, 1, 2, 3, 4, 5], 2: [0, 1, 2], 3: [0, 1, 2], 4: [0] };
  const BOTNAMEN = new Set(['LeftHand', 'RightHand', 'LeftForeArm', 'RightForeArm', 'Hips', 'Head', 'Spine02']);
  const BOT_CACHE = new WeakMap();
  function botten(d) {  // handbotten enz. (Meshy-namen, gedeeld door alle figuren); per lijf één keer zoeken
    if (!d || !d.body) return {};
    let b = BOT_CACHE.get(d.body);
    if (!b) { b = {}; d.body.traverse(x => { if (x.isBone && BOTNAMEN.has(x.name) && !b[x.name]) b[x.name] = x; }); BOT_CACHE.set(d.body, b); }
    return b;
  }
  const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vH = new THREE.Vector3(), vK = new THREE.Vector3(), vR = new THREE.Vector3(), vF = new THREE.Vector3();
  function poi(groep, figs, o) {
    o = o || {}; tel.aanroepen++;
    const Z = zwVan(o), T = [26, 18, 10][Z], T1 = T + 1, S = 2 * T1;
    const D = (figs || []).filter(d => d && d.root).slice(0, MAXD).map((d, i) => {
      const sm = d.poiSoort || o.soort || 'mix', modus = POI_MODUS[sm] != null ? POI_MODUS[sm] : [0, 1, 0, 2, 3, 0, 4][i % 7];
      return { d, i, modus, blok: null, pA: 0, pB: 0, t0: -9, off: (i % 2) * 0.5 + (o.synchroon === false ? Math.random() : 0), spuwT: -99, laatsteTel: -1 };
    });
    if (!D.length) return null;
    const n = D.length * S, iA = new Float32Array(n * 4);
    for (let i = 0; i < D.length; i++) for (let s = 0; s < S; s++) iA.set([i, s, Math.random(), 0], (i * S + s) * 4);
    const geo = quadGeo(n, { iA: [iA, 4] });
    const vec3s = () => Array.from({ length: MAXD }, () => new THREE.Vector3());
    const u = { uHandL: f(vec3s()), uHandR: f(vec3s()), uRechts: f(vec3s()), uVoor: f(vec3s()), uHeup: f(vec3s()), uHoofd: f(vec3s()),
      uModus: f(new Array(MAXD).fill(9)), uSpuw: f(new Array(MAXD).fill(99)), uPat: f(Array.from({ length: MAXD }, () => new THREE.Vector4())),
      uKet: f(o.ketting || 0.72), uT1: f(T1) };
    const mat = addMat(POI_VS, POI_FS, u);
    const mesh = geenStraal(new THREE.Mesh(geo, mat)); mesh.frustumCulled = false; mesh.renderOrder = 6; mesh.name = 'buiten-poi';
    let laatst = -1;
    function beeld() {
      const fn = beeldNr(); if (fn === laatst) return; laatst = fn;
      const nu = U.uT.value, tb = Math.max(0, typeof beatPos === 'number' ? beatPos : 0), sh = doolhof.show || {}, st = sh.stand || 'groove';
      const per = st === 'break' ? 16 : st === 'drop' ? 4 : st === 'opbouw' && (sh.opbouw || 0) > 0.5 ? 4 : 8, blok = Math.floor(tb / per);
      for (const x of D) {
        const d = x.d, B = botten(d), i = x.i;
        if (!d.root.visible || !d.root.parent || !B.LeftHand || !B.RightHand) { u.uModus.value[i] = 9; continue; }
        u.uModus.value[i] = x.modus;
        const m = d.root.matrixWorld.elements;
        vR.set(m[0], m[1], m[2]).normalize(); vF.set(m[8], m[9], m[10]).normalize();
        if (B.Hips) B.Hips.getWorldPosition(vH); else d.root.getWorldPosition(vH).setY(0.95);
        u.uHeup.value[i].copy(vH); u.uRechts.value[i].copy(vR); u.uVoor.value[i].copy(vF);
        if (B.Head) B.Head.getWorldPosition(u.uHoofd.value[i]); else u.uHoofd.value[i].copy(vH).setY(vH.y + 0.65);
        // draaipunt: half de echte hand (danst mee), half een vast punt voor de borst (de poi draaien voor het lijf, niet door de benen)
        for (const [bot, uit] of [[B.LeftHand, u.uHandL.value[i]], [B.RightHand, u.uHandR.value[i]]]) {
          bot.getWorldPosition(vA);
          const zij = Math.sign(vB.copy(vA).sub(vH).dot(vR)) || (uit === u.uHandL.value[i] ? -1 : 1);
          vK.copy(vH).addScaledVector(vR, zij * 0.3).addScaledVector(vF, 0.36); vK.y += 0.42;
          uit.copy(vA).lerp(vK, 0.55);
        }
        // patroon: per blok een ander, in 1 tel overvloeien
        if (blok !== x.blok) {
          const L = POI_PAT[x.modus] || [0];
          let nw = L[Math.floor(Math.random() * L.length)];
          if (L.length > 1 && nw === x.pB) nw = L[(L.indexOf(nw) + 1) % L.length];
          if (x.modus === 3) nw = st === 'drop' ? 2 : st === 'opbouw' ? 1 : st === 'break' ? 0 : [0, 0, 1][Math.floor(Math.random() * 3)];  // hoepel: hoogte per stand
          if (x.blok === null) { x.pA = x.pB = nw; x.t0 = -9; } else { x.pA = x.pB; x.pB = nw; x.t0 = tb; }
          x.blok = blok;
        }
        u.uPat.value[i].set(x.pA, x.pB, glad(tb - x.t0, 0, 1), x.off);
        // vuurspuwer: op de drop, in de drop elke 4 tellen, in de groove om de 8 (tel 7), eind opbouw elke tel; nooit in de break
        if (x.modus === 4) {
          const ht = Math.floor(tb);
          if (ht !== x.laatsteTel) {
            x.laatsteTel = ht;
            const kb = sh.drop || 0, fase = ht % 8;
            if ((st === 'drop' && (kb > 0.9 || ht % 4 === 0)) || (st === 'groove' && fase === 7 && Math.random() < 0.7) || (st === 'opbouw' && (sh.opbouw || 0) > 0.75)) x.spuwT = nu;
          }
          u.uSpuw.value[i] = Math.min(99, nu - x.spuwT);
        }
      }
      mat.uniformsNeedUpdate = true;
    }
    mesh.onBeforeRender = beeld;
    groep.add(mesh); tel.poi += D.length;
    return { mesh, dansers: D, figs: D.map(x => x.d) };
  }
  function vuurDansers(ctx, plekken, o) {
    o = o || {};
    const figs = [];
    for (const p of plekken || []) {
      if (figs.length >= MAXD) break;
      const d = ctx.figuur({ x: p.x, z: p.z, face: p.face != null ? p.face : Math.atan2(-p.x, -p.z), rol: 'dans', filter: o.filter });
      if (!d) continue;
      if (p.soort) d.poiSoort = p.soort; else delete d.poiSoort;  // figuren komen uit een voorraad: oude keus weg
      figs.push(d);
    }
    if (!figs.length) return null;
    const P = poi(ctx.groep, figs, Object.assign({ zwaar: ctx.zwaar }, o));
    return P ? { figs, mesh: P.mesh, dansers: P.dansers } : null;
  }

  // =====================================================================================================================================
  // 6. GLOWSTICKS aan figuren: staafje in de vuist dat de onderarm verlengt (één draw voor alle staafjes)
  // =====================================================================================================================================
  const MAXS = 24;
  const STICK_VS = `#define MAXS ${MAXS}
attribute vec4 iA; attribute vec3 iK;
uniform vec3 uA[MAXS], uB[MAXS];
uniform float uDik, uHelder;
varying vec2 vC; varying vec3 vKl; varying float vL;
void main() {
  int i = int(iA.x + 0.5);
  vec4 va = viewMatrix * vec4(uA[i], 1.0), vb = viewMatrix * vec4(uB[i], 1.0);
  vec2 ax = vb.xy - va.xy; float L = length(ax);
  vec2 dir = L > 1e-5 ? ax / L : vec2(0.0, 1.0), nr = vec2(-dir.y, dir.x);
  vec4 v = mix(va, vb, position.y * 0.5 + 0.5);
  v.xy += dir * position.y * uDik + nr * position.x * uDik;
  vC = position.xy; vL = L / uDik;
  vKl = iK * uHelder * (0.85 + 0.3 * uPuls * uEn + 0.4 * uDrop) * (1.0 - 0.25 * uBlack) * step(1e-4, distance(uA[i], uB[i]));
  gl_Position = projectionMatrix * v;
}`;
  const STICK_FS = `varying vec2 vC; varying vec3 vKl; varying float vL;
void main() {   // capsule: felle kern, zachte gloed
  float s = vC.y * (vL * 0.5 + 1.0);
  float d = length(vec2(vC.x, max(abs(s) - vL * 0.5, 0.0)));
  if (d > 1.0) discard;
  gl_FragColor = vec4(vKl * (1.0 + 1.5 * smoothstep(0.32, 0.12, d)) + vec3(0.6) * smoothstep(0.2, 0.05, d) * dot(vKl, vec3(0.33)), exp(-d * d * 3.0) * 0.9);
}`;
  function glowsticks(groep, figs, o) {
    o = o || {}; tel.aanroepen++;
    const r = rndVan(o), kleuren = (o.kleuren || NEON).map(c => kleurVan(c)), L = o.lengte || 0.26, hand = o.handen || 'mix';
    const S = [];
    for (const d of figs || []) {
      if (!d || !d.body) continue;
      const kl = kleuren[Math.floor(r() * kleuren.length)], beide = hand === 'beide' || (hand === 'mix' && r() < 0.6);
      const kanten = beide ? ['Right', 'Left'] : [r() < 0.5 ? 'Right' : 'Left'];
      for (const k of kanten) if (S.length < MAXS) S.push({ d, k, kl: beide && k === 'Left' && r() < 0.5 ? kleuren[Math.floor(r() * kleuren.length)] : kl });
    }
    if (!S.length) return null;
    const n = S.length, iA = new Float32Array(n * 4), iK = new Float32Array(n * 3);
    S.forEach((s, i) => { iA.set([i, r(), 0, 0], i * 4); iK.set([s.kl.r, s.kl.g, s.kl.b], i * 3); });
    const geo = quadGeo(n, { iA: [iA, 4], iK: [iK, 3] });
    const u = { uA: f(Array.from({ length: MAXS }, () => new THREE.Vector3())), uB: f(Array.from({ length: MAXS }, () => new THREE.Vector3())), uDik: f(0.07), uHelder: f(o.helder || 1) };
    const mat = addMat(STICK_VS, STICK_FS, u);
    const mesh = geenStraal(new THREE.Mesh(geo, mat)); mesh.frustumCulled = false; mesh.renderOrder = 6; mesh.name = 'buiten-glowsticks';
    let laatst = -1;
    mesh.onBeforeRender = () => {
      const fn = beeldNr(); if (fn === laatst) return; laatst = fn;
      S.forEach((s, i) => {
        const B = botten(s.d), h = B[s.k + 'Hand'], oa = B[s.k + 'ForeArm'] || (h && h.parent);
        if (!h || !oa || !s.d.root.visible || !s.d.root.parent) { u.uA.value[i].set(0, 0, 0); u.uB.value[i].set(0, 0, 0); return; }
        h.getWorldPosition(vA); oa.getWorldPosition(vB);
        vH.copy(vA).sub(vB); const l = vH.length(); if (l < 1e-4) vH.set(0, 1, 0); else vH.divideScalar(l);
        u.uA.value[i].copy(vA).addScaledVector(vH, -0.03); u.uB.value[i].copy(vA).addScaledVector(vH, L);
      });
      mat.uniformsNeedUpdate = true;
    };
    groep.add(mesh); tel.sticks += n;
    return { mesh, n };
  }

  // =====================================================================================================================================
  // 7. VUURVLIEGJES / SPOREN / VONKEN (Points), LICHTSLINGERS, GLOEIEND PAD, losse GLOED
  // =====================================================================================================================================
  const VLIEG_VS = `attribute vec2 aZ;
uniform float uSoort, uGrootte, uHoogte, uKleur;
varying vec3 vKl; varying float vA;
void main() {
  vec3 p = position; float z = aZ.x, z2 = aZ.y, a = 1.0; vec3 col;
  if (uSoort < 0.5) {         // vuurvliegjes: dwalen en knipperen, een deel op de tel (in de drop allemaal)
    p += vec3(sin(uT * (0.23 + 0.2 * z) + z * 30.0) * 0.9, sin(uT * (0.31 + 0.17 * z2) + z2 * 20.0) * 0.35, cos(uT * (0.19 + 0.21 * z2) + z * 17.0) * 0.9);
    float knip = pow(0.5 + 0.5 * sin(uT * (0.9 + 1.3 * z2) + z * 60.0), 6.0);
    float sync = pow(1.0 - fract(uTel), 6.0) * max(step(0.55, fract(z * 7.0)), isDrop()) * (0.4 + 0.6 * uEn);
    a = max(knip, sync) * (1.0 - 0.3 * uBlack);
    col = mix(vec3(0.75, 1.0, 0.2), vec3(1.0, 0.85, 0.3), z2);
  } else if (uSoort < 1.5) {  // sporen: zweven traag omhoog, uv-kleuren, kloppen op de tel
    p.y = position.y + mod(uT * 0.06 * (0.5 + z) + z2 * uHoogte, uHoogte);
    p.xz += vec2(sin(uT * 0.3 + z * 20.0), cos(uT * 0.27 + z2 * 20.0)) * 0.4;
    a = (0.35 + 0.65 * ((0.5 + 0.5 * cos(TAU * (uTel * 0.5 + z))) * (0.5 + 0.5 * cos(TAU * (uTel * 0.5 + z))))) * (1.0 - 0.4 * uBlack) * smoothstep(0.0, 0.1, fract((p.y - position.y) / uHoogte)) * smoothstep(1.0, 0.85, (p.y - position.y) / uHoogte);
    col = mix(kl(z + uT * 0.02), vec3(0.6, 0.2, 1.0), 0.4);
  } else {                    // vonken: stijgen snel op uit de grond en doven
    float life = fract(uT * (0.4 + 0.4 * z) + z2 * 5.0);
    p.y = position.y + life * uHoogte * (0.8 + 0.6 * uDrop);
    p.xz += vec2(sin(life * 6.0 + z * 40.0), cos(life * 5.0 + z2 * 40.0)) * life * 0.6;
    a = 1.0 - life; col = vuurKleur(life * 0.6);
  }
  if (uKleur > 0.5) col = uKleur < 1.5 ? mix(col, vec3(0.3, 1.0, 0.35), 0.7) : uKleur < 2.5 ? kl(z) : neon(fract(z * 7.0));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = clamp(uGrootte * projectionMatrix[1][1] * uPx / max(0.1, -mv.z), 1.5, 48.0);
  vKl = col * 1.3; vA = a;
  gl_Position = projectionMatrix * mv;
}`;
  function vuurvliegjes(groep, o) {
    o = o || {}; tel.aanroepen++;
    const Z = zwVan(o), r = rndVan(o), soort = { vliegjes: 0, sporen: 1, vonken: 2 }[o.soort || 'vliegjes'] || 0;
    const n = Math.max(8, Math.round((o.aantal || 260) * [1, 0.6, 0.35][Z]));
    const gb = o.gebied || {}, w = gb.w || 20, d = gb.d || 30;
    const x0 = gb.x0 != null ? gb.x0 : -w / 2, x1 = gb.x1 != null ? gb.x1 : w / 2, z0 = gb.z0 != null ? gb.z0 : -d / 2, z1 = gb.z1 != null ? gb.z1 : d / 2;
    const y0 = gb.y0 != null ? gb.y0 : 0.3, y1 = gb.y1 != null ? gb.y1 : (soort === 2 ? 0.2 : 3.5);
    const pos = new Float32Array(n * 3), az = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { pos.set([x0 + r() * (x1 - x0), soort === 1 ? y0 : y0 + r() * (y1 - y0), z0 + r() * (z1 - z0)], i * 3); az.set([r(), r()], i * 2); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aZ', new THREE.BufferAttribute(az, 2));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2 + 2, (z0 + z1) / 2), Math.hypot(x1 - x0, y1 - y0 + 6, z1 - z0) / 2 + 2);
    const kleur = { geel: 0, groen: 1, show: 2, mix: 3 }[o.kleur] || 0;
    const mesh = new THREE.Points(geo, addMat(VLIEG_VS, PUNT_FS, { uSoort: f(soort), uGrootte: f(o.grootte || [0.05, 0.07, 0.035][soort]),
      uHoogte: f(soort === 1 ? Math.max(1, (gb.y1 || 6) - y0) : soort === 2 ? (o.hoogte || 4) : 1), uKleur: f(kleur) }));
    mesh.name = 'buiten-' + (o.soort || 'vliegjes'); mesh.renderOrder = 5; groep.add(mesh);
    return { mesh, n };
  }
  const SLINGER_VS = `attribute vec2 aI;
uniform float uKleur, uGrootte;
varying vec3 vKl; varying float vA;
void main() {
  float s = aI.x, z = aI.y;
  vec3 col = uKleur < 0.5 ? vec3(1.0, 0.72, 0.38) : uKleur < 1.5 ? neon(fract(floor(s * 400.0) * 0.17 + 0.92)) : klH(floor(s * 400.0) + floor(uTel / 4.0));
  float jaag = 0.35 + 0.65 * pow(0.5 + 0.5 * cos(TAU * (s * 6.0 - uTel * 0.5)), 4.0);
  float twinkel = 0.45 + 0.55 * sin(uT * (0.7 + z) + z * 30.0);
  float k = mix(jaag, twinkel, isBreak()) + isDrop() * pow(1.0 - fract(uTel), 3.0) * 1.5 + uFlits;
  vKl = col * 1.3; vA = k * (1.0 - 0.4 * uBlack);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(uGrootte * projectionMatrix[1][1] * uPx / max(0.1, -mv.z), 1.5, 40.0);
  gl_Position = projectionMatrix * mv;
}`;
  function lichtslingers(groep, lijnen, o) {
    o = o || {}; tel.aanroepen++;
    const zak = o.zak == null ? 0.5 : o.zak, af = o.afstand || 0.32, P = [], I = [], W = [];
    let totaal = 0;
    for (const lijn of lijnen || []) for (let i = 0; i < lijn.length - 1; i++) totaal += Math.hypot(lijn[i + 1].x - lijn[i].x, lijn[i + 1].z - lijn[i].z);
    let s0 = 0;
    for (const lijn of lijnen || []) {
      for (let i = 0; i < lijn.length - 1; i++) {
        const A = lijn[i], B = lijn[i + 1], len = Math.hypot(B.x - A.x, (B.y || 0) - (A.y || 0), B.z - A.z), nn = Math.max(2, Math.ceil(len / af));
        const pt = t => [A.x + (B.x - A.x) * t, (A.y || 0) + ((B.y || 0) - (A.y || 0)) * t - zak * 4 * t * (1 - t) * Math.min(1, len / 6), A.z + (B.z - A.z) * t];
        for (let k = 0; k < nn; k++) { const t = (k + 0.5) / nn; P.push(...pt(t)); I.push((s0 + len * t) / Math.max(1, totaal), Math.random()); }
        if (o.draad !== false) for (let k = 0; k < 12; k++) W.push(...pt(k / 12), ...pt((k + 1) / 12));
        s0 += len;
      }
    }
    if (!P.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('aI', new THREE.Float32BufferAttribute(I, 2)); geo.computeBoundingSphere();
    const lampjes = new THREE.Points(geo, addMat(SLINGER_VS, PUNT_FS, { uKleur: f({ warm: 0, neon: 1, show: 2 }[o.kleur] || 0), uGrootte: f(o.grootte || 0.07) }));
    lampjes.renderOrder = 5; lampjes.name = 'buiten-slingers'; groep.add(lampjes);
    let draad = null;
    if (W.length) {
      const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.Float32BufferAttribute(W, 3)); dg.computeBoundingSphere();
      draad = geenStraal(new THREE.LineSegments(dg, new THREE.LineBasicMaterial({ color: 0x040404 }))); groep.add(draad);
    }
    return { lampjes, draad };
  }
  const GLOED_VS = `attribute vec4 iP; attribute vec4 iK;
uniform float uPlat, uSterk, uGolf;
varying vec2 vC; varying vec3 vKl;
void main() {
  vec3 b = (modelMatrix * vec4(iP.xyz, 1.0)).xyz;
  float k = uSterk * (0.55 + 0.45 * uPuls * uEn) * (1.0 - 0.5 * uBlack) + 0.4 * uDrop * uSterk;
  if (uGolf > 0.5) { float per = mix(mix(8.0, 2.0, isDrop()), 16.0, isBreak()); k *= 0.35 + 1.4 * exp(-(((iK.w - (fract(uTel / per) * 1.3 - 0.15)) * 9.0) * ((iK.w - (fract(uTel / per) * 1.3 - 0.15)) * 9.0))); }
  vKl = iK.rgb * k; vC = position.xy;
  if (uPlat > 0.5) gl_Position = projectionMatrix * viewMatrix * vec4(b + vec3(position.x, 0.0, position.y) * iP.w, 1.0);
  else { vec4 mv = viewMatrix * vec4(b, 1.0); mv.xy += position.xy * iP.w; gl_Position = projectionMatrix * mv; }
}`;
  const GLOED_FS = `varying vec2 vC; varying vec3 vKl;
void main() { float d = dot(vC, vC); gl_FragColor = vec4(vKl, exp(-d * 3.0) * smoothstep(1.0, 0.6, d)); }`;
  function gloed(groep, lijst, o) {
    o = o || {};
    if (!lijst || !lijst.length) return null;
    const n = lijst.length, iP = new Float32Array(n * 4), iK = new Float32Array(n * 4), c = new THREE.Color();
    lijst.forEach((p, i) => { c.set(p.kleur != null ? p.kleur : 0xff7a20); iP.set([p.x, p.y || 0.02, p.z, p.r || 1], i * 4); iK.set([c.r, c.g, c.b, p.s || 0], i * 4); });
    const mesh = geenStraal(new THREE.Mesh(quadGeo(n, { iP: [iP, 4], iK: [iK, 4] }), addMat(GLOED_VS, GLOED_FS, { uPlat: f(o.plat === false ? 0 : 1), uSterk: f(o.sterk || 1), uGolf: f(o.golf ? 1 : 0) })));
    mesh.frustumCulled = false; mesh.renderOrder = 4; mesh.name = 'buiten-gloed'; groep.add(mesh);
    return mesh;
  }
  const LANT_VS = `attribute vec4 iK;
varying vec3 vN, vW, vKl; varying float vZ;
void main() {
  vec3 p = position;
  vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);
  w.y += 0.12 * sin(uT * 0.9 + iK.w * 20.0);
  w.x += 0.05 * sin(uT * 0.7 + iK.w * 13.0);
  vW = w.xyz; vKl = iK.rgb; vZ = iK.w; vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
  const LANT_FS = `varying vec3 vN, vW, vKl; varying float vZ;
void main() {   // papieren lantaarn: licht van binnen, ribben, onderkant feller
  vec3 n = normalize(vN), V = normalize(cameraPosition - vW);
  float rib = 0.75 + 0.25 * smoothstep(0.0, 0.15, abs(fract(n.y * 4.0) - 0.5));
  float k = (0.7 + 0.25 * sin(uT * 3.0 + vZ * 40.0) + 0.4 * uPuls * uEn + 0.5 * uDrop) * (1.0 - 0.4 * uBlack);
  gl_FragColor = vec4(flitsWit(vKl * (0.45 + 0.6 * abs(dot(n, V))) * rib * k * 1.3), 1.0);
}`;
  function gloeiPad(groep, route, o) {
    o = o || {}; tel.aanroepen++;
    if (!route || route.length < 2) return null;
    const r = rndVan(o), Z = zwVan(o), PAL = palet(o), af = o.afstand || 0.8, br = o.breed || 0.9, rand = (o.vorm || 'rand') === 'rand';
    const cum = [0]; for (let i = 1; i < route.length; i++) cum.push(cum[i - 1] + Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z));
    const len = cum[cum.length - 1];
    const op = s => { let i = 1; while (i < cum.length - 1 && cum[i] < s) i++; const t = (s - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]), A = route[i - 1], B = route[i]; const dx = B.x - A.x, dz = B.z - A.z, l = Math.hypot(dx, dz) || 1; return { x: A.x + dx * t, z: A.z + dz * t, nx: -dz / l, nz: dx / l }; };
    const stenen = [], gl = [], lant = [];
    let nr = 0;
    for (let s = af * 0.6; s < len - af * 0.4; s += af, nr++) {
      const p = op(s), u = s / len;
      const kanten = rand ? [-1, 1] : [0];
      for (const k of kanten) {
        const x = p.x + p.nx * br * k + (r() - 0.5) * 0.15, z = p.z + p.nz * br * k + (r() - 0.5) * 0.15, sc = 0.22 + r() * 0.1;
        stenen.push({ x, y: sc * 0.12, z, sx: sc * 1.3, sy: sc * 0.45, sz: sc, ry: r() * 6.3, s: u });
        gl.push({ x, y: 0.025, z, r: 0.75, kleur: PAL[nr % 3], s: u });
      }
      if (o.lantaarns !== false && nr % 3 === 1 && Z < 2) {
        const k = rand ? (nr % 2 ? 1 : -1) : (nr % 2 ? 1 : -1);
        lant.push({ x: p.x + p.nx * (br + 0.35) * k, z: p.z + p.nz * (br + 0.35) * k, y: 1.35 + r() * 0.6, kleur: r() < 0.5 ? new THREE.Color(0xff8a30) : PAL[Math.floor(r() * 3)] });
      }
    }
    const sm = steenMesh(stenen, { pad: 1, licht: { x: 0, y: 1, z: 0 }, lichtK: 0 }); groep.add(sm);
    const gm = gloed(groep, gl, { plat: true, golf: true, sterk: 0.55 });
    let lm = null;
    if (lant.length) {
      const lg = losKloon(LANT_GEO), iK = new Float32Array(lant.length * 4);
      lm = new THREE.InstancedMesh(lg, shMat(LANT_VS, LANT_FS), lant.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pv = new THREE.Vector3(), sv = new THREE.Vector3();
      lant.forEach((l, i) => { lm.setMatrixAt(i, m4.compose(pv.set(l.x, l.y, l.z), q, sv.set(0.16, 0.22, 0.16))); iK.set([l.kleur.r, l.kleur.g, l.kleur.b, r()], i * 4); });
      lg.setAttribute('iK', new THREE.InstancedBufferAttribute(iK, 4));
      lm.frustumCulled = false; geenStraal(lm); groep.add(lm);
      gloed(groep, lant.map(l => ({ x: l.x, y: l.y, z: l.z, r: 0.7, kleur: l.kleur })), { plat: false, sterk: 0.35 });
    }
    return { stenen: sm, gloed: gm, lantaarns: lm, lengte: len };
  }

  // =====================================================================================================================================
  // 8. CAMERA: buitenCam, zoals effect.js maakCam (knip op de tel), met volg-, held-, drone-, kraan-, baan-, ingang-, toren-, vuur- en tegenshot
  // =====================================================================================================================================
  function buitenCam(ctx, maat, shots, o) {
    o = o || {};
    const { w, d } = maat, W = w / 2, D = d / 2, r = ctx.rnd, HOOG = o.hoog || 18;
    const cp = new THREE.Vector3(), cl = new THREE.Vector3(), uit = { pos: cp, look: cl, fov: 60 }, lp = new THREE.Vector3(), tp = new THREE.Vector3();
    const focus = o.vuur || o.dj || null, dansers = (o.dansers || []).filter(Boolean);
    const plekVan = (x, uitV) => { if (x.root) { uitV.copy(x.root.position); if (x.root.parent) { x.root.parent.localToWorld(uitV); ctx.groep.worldToLocal(uitV); } } else uitV.set(x.x || 0, 0, x.z || 0); return uitV; };
    let zij = 1, dir = 1, a0 = 0, idx = 0, yaw = null, tLaatst = 0;
    const SHOT = {
      volg: (u, loper, dt) => {  // schouderhoogte achter en iets naast de loper, kijkt langs hem vooruit
        if (!loper || !loper.root) return SHOT.drone(u);
        plekVan(loper, lp);
        const doel = loper.root.rotation.y;
        if (yaw === null) yaw = doel; else { let dd = doel - yaw; dd = Math.atan2(Math.sin(dd), Math.cos(dd)); yaw += dd * Math.min(1, dt * 1.8); }
        const fx = Math.sin(yaw), fz = Math.cos(yaw);
        cp.set(lp.x - fx * 2.3 + fz * zij * 0.75, 1.6, lp.z - fz * 2.3 - fx * zij * 0.75); cl.set(lp.x + fx * 2.6, 1.35, lp.z + fz * 2.6); return 58;
      },
      held: u => {  // laag bij een vuurdanser, omhoog kijken naar de draaiende poi
        if (!dansers.length) return SHOT.baan(u);
        plekVan(dansers[idx % dansers.length], tp);
        const a = a0 + dir * 0.15 * u;
        cp.set(tp.x + Math.sin(a) * 1.7, 0.35 + 0.05 * Math.sin(u * 0.7), tp.z + Math.cos(a) * 1.7); cl.set(tp.x, 1.75, tp.z); return 72;
      },
      drone: u => {  // hoog over de hele kamer, schuift langzaam
        const y = Math.min(HOOG, Math.max(9, 0.45 * Math.max(w, d))), z = -D * 0.55 + Math.min(D * 1.1, 0.35 * u) * dir;
        cp.set(zij * W * 0.35, y, dir > 0 ? z : -z); cl.set(focus ? focus.x : 0, 0.5, focus ? focus.z : 0); return 62;
      },
      kraan: u => {  // stijgt op vanaf de grond tot boven de bomen
        const k = glad(u, 0, 12), x = zij * Math.min(W - 1, 5), z = -dir * Math.min(D - 1, 6);
        cp.set(x, 1.2 + (HOOG * 0.8 - 1.2) * k, z); cl.set(focus ? focus.x : 0, 1.2 + 1.5 * (1 - k), focus ? focus.z : 0); return 64;
      },
      baan: u => {  // traag rond het vuur of de dj
        const c = focus || { x: 0, z: 0 }, R = Math.min(6.2, Math.max(3.5, Math.min(W, D) - 1.5)), a = a0 + dir * 0.12 * u;
        cp.set(c.x + Math.sin(a) * R, 2.2 + 0.4 * Math.sin(u * 0.3), c.z + Math.cos(a) * R); cl.set(c.x, 1.1, c.z); return 60;
      },
      ingang: u => { cp.set(zij * 1.3, 1.6, -D + 1.2 + Math.min(2.5, 0.12 * u)); cl.set(-zij * 0.6, 4.5, D); return 66; },
      toren: u => { cp.set(zij * 2.6, 0.6, D - 2.2); cl.set(-zij * 0.3, 8 + Math.min(22, 1.6 * u), D + 5); return 74; },
      vuur: u => {  // laag langs het kampvuur, de vlammen voorgrond
        const c = focus || { x: 0, z: 0 }, a = a0 + dir * 0.08 * u;
        cp.set(c.x + Math.sin(a) * 2.4, 0.55, c.z + Math.cos(a) * 2.4); cl.set(c.x - Math.sin(a) * 4, 1.3, c.z - Math.cos(a) * 4); return 66;
      },
      tegen: u => { cp.set(zij * Math.min(W - 1, 2.5), 2.2, D - 1.5 - Math.min(2, 0.1 * u)); cl.set(0, 3.5, -D); return 60; },
    };
    let lijst = (shots && shots.length ? shots : Object.keys(SHOT)).filter(s => SHOT[s]);
    if (!shots) lijst = lijst.filter(s => (s !== 'held' || dansers.length) && (s !== 'vuur' || o.vuur));
    if (!lijst.length) lijst = ['volg'];
    let blokNu = null, t0 = 0, keuze = -1;
    return function cam(t, loper) {
      const dt = klem(t - tLaatst, 0, 0.1); tLaatst = t;
      const sh = doolhof.show, st = sh ? sh.stand : 'groove', per = st === 'break' ? 16 : st === 'drop' ? 4 : st === 'opbouw' ? (sh.opbouw < 0.5 ? 8 : 4) : 8;
      const blok = Math.floor(Math.max(0, beatPos) / per) + ':' + per;
      if (blok !== blokNu) {
        keuze = blokNu === null ? 0 : (keuze + 1 + Math.floor(r() * Math.max(1, lijst.length - 1))) % lijst.length;
        blokNu = blok; t0 = t; zij = r() < 0.5 ? -1 : 1; dir = r() < 0.5 ? -1 : 1; a0 = r() * Math.PI * 2; idx++; yaw = null;
      }
      uit.fov = SHOT[lijst[keuze]](t - t0, loper, dt);
      cp.x = klem(cp.x, -W + 0.5, W - 0.5); cp.z = klem(cp.z, -D + 0.5, D - 0.5); cp.y = klem(cp.y, 0.3, HOOG);
      ctx.groep.updateWorldMatrix(true, false); ctx.groep.localToWorld(cp); ctx.groep.localToWorld(cl);
      return uit;
    };
  }

  // =====================================================================================================================================
  // lift als uitgang + voorbeeldkamer
  // =====================================================================================================================================
  // De kern kiest de overgang achter een kamer direct ná maak() (kamerStappen: nieuweOvergang). doolhof.volgendeOvergang = 'lift' geldt
  // voor de eerstvolgende uitgang. Een proefkamer (voorwarm, zonder gangen) gebruikt hem niet: dan zou hij blijven hangen tot een andere
  // kamer; na 4 s halen we onze eigen vraag weer weg.
  let liftVraag = 0;
  function liftUitgang() {
    if (!doolhof.volgendeOvergang) { doolhof.volgendeOvergang = 'lift'; liftVraag = performance.now(); }
  }
  clubHooks.push(() => { if (liftVraag && performance.now() - liftVraag > 4000) { if (doolhof.volgendeOvergang === 'lift') doolhof.volgendeOvergang = null; liftVraag = 0; } });

  function demo(ctx) {  // voorbeeld: nachtjungle met vulkaan, kampvuur, vuurdansers, glowsticks, publiek, pad en lift (gewicht 0: alleen voor testen)
    const r = ctx.rnd, Z = ctx.zwaar, g = ctx.groep, w = 26, d = 40, maat = { w, d, h: 24 }, D = d / 2, PAL = [0xff2d95, 0x00e5ff, 0x7cff00];
    liftUitgang();
    const H = hemel(g, { soort: 'jungle', silhouet: 'jungle', verte: 'vulkaan', aurora: 0.8, grond: 'jungle', rnd: r, zwaar: Z });
    rotsPoort(g, maat, { hemel: H, rnd: r, zwaar: Z, deco: 'paddenstoelen', tekst: 'JUNGLE', palet: PAL });
    liftToren(g, maat, { hemel: H, rnd: r, zwaar: Z, palet: PAL });
    const VUUR = { x: 2.5, z: 1 };
    const lamp = ctx.licht(0xff7a2a, 2.4, 16, VUUR.x, 2.2, VUUR.z);
    kampvuur(g, VUUR, { rnd: r, zwaar: Z, lamp });
    const route = [{ x: 0, z: -D }, { x: 0, z: -D + 3 }, { x: -3.5, z: -8 }, { x: -4.5, z: 0 }, { x: -2.5, z: 9 }, { x: 0, z: D - 3 }, { x: 0, z: D }];
    const pad = gloeiPad(g, route, { rnd: r, zwaar: Z, palet: PAL });
    const toppen = [];
    for (const [x, z] of [[-6.5, -12], [6, -12], [-8, -2], [8, -1], [-6, 8], [7, 9], [-3, 15], [3.5, 15]]) toppen.push({ x, z });
    const fk = fakkels(g, toppen, { rnd: r, zwaar: Z });
    if (fk) lichtslingers(g, [fk.toppen.slice(0, 4).map(p => ({ x: p.x, y: p.y + 0.4, z: p.z })), fk.toppen.slice(4).map(p => ({ x: p.x, y: p.y + 0.4, z: p.z }))], { kleur: 'neon' });
    const vd = vuurDansers(ctx, [{ x: VUUR.x - 3.2, z: VUUR.z + 2.2, soort: 'vuur' }, { x: VUUR.x + 3.4, z: VUUR.z + 1.5, soort: 'led' },
      { x: VUUR.x + 2.5, z: VUUR.z - 3.2, soort: 'staf' }, { x: VUUR.x - 2.0, z: VUUR.z - 3.5, soort: 'hoepel' }, { x: VUUR.x + 0.4, z: VUUR.z + 4.2, soort: 'spuwer' }]);
    const gfig = [];
    for (const [x, z] of [[6, 6], [7.5, 4], [5, 9], [-7, 4], [6.5, -6]].slice(0, [5, 3, 2][Z])) { const f2 = ctx.figuur({ x, z, face: Math.atan2(VUUR.x - x, VUUR.z - z), rol: 'dans' }); if (f2) gfig.push(f2); }
    glowsticks(g, gfig, { rnd: r });
    const plekken = [];
    for (let i = 0; i < [90, 55, 30][Z]; i++) {
      const a = r() * Math.PI * 2, rr = 5 + r() * 5, x = VUUR.x + Math.sin(a) * rr, z = VUUR.z + Math.cos(a) * rr * 1.2;
      if (Math.abs(x) > W2(w) || Math.abs(z) > D - 3 || Math.hypot(x - (-4.5), z) < 2 || x < -2) continue;
      plekken.push({ x, z, face: Math.atan2(VUUR.x - x, VUUR.z - z) + (r() - 0.5) * 0.6 });
    }
    const publiek = window.clubPubliek && clubPubliek.maak && plekken.length ? clubPubliek.maak(g, { plekken, vast: true, rnd: r, telefoons: 0.08, glowsticks: 0.55,
      licht: { x: VUUR.x, y: 1.5, z: VUUR.z }, kleuren: { a: new THREE.Color(0xff7a2a), b: U.uK1.value, vul: new THREE.Color(0x000000) } }) : null;
    vuurvliegjes(g, { gebied: { w: w + 8, d, y0: 0.3, y1: 4 }, rnd: r, zwaar: Z });
    vuurvliegjes(g, { soort: 'sporen', gebied: { x0: -W2(w) - 4, x1: W2(w) + 4, z0: -D, z1: D, y0: 0, y1: 9 }, aantal: 160, kleur: 'show', rnd: r, zwaar: Z });
    const cam = buitenCam(ctx, maat, null, { vuur: VUUR, dansers: vd ? vd.figs : [] });
    return {
      maat, blijf: 16, route, cam,
      update() { if (publiek) publiek.zet({ helder: 0.55 + 0.25 * U.uVlam.value, flits: U.uFlits.value * 0.5, rand: 0.8 + 0.6 * U.uPuls.value, armen: 0.3 * U.uDrop.value }); },
      opruimen() { if (publiek) publiek.opruimen(); },
      _pad: pad,
    };
  }
  const W2 = w => w / 2 - 1.2;

  doolhof.buiten = {
    U, KOP, liftUitgang, hemel, rotsPoort, liftToren, vuur, kampvuur, fakkels, poi, vuurDansers, glowsticks, vuurvliegjes, lichtslingers, gloeiPad,
    gloed, buitenCam, demo, botten, NEON, houd, geenStraal,
    info: () => ({ aanroepen: tel.aanroepen, poiDansers: tel.poi, glowsticks: tel.sticks, spin: +G.spin.toFixed(2), vlam: +G.vlam.toFixed(2), liftVraag: !!liftVraag }),
  };
})();

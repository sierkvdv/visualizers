// --- Doolhof-kamer 'boiler': Boiler Room-kelder vol leds met een ledpiramide in het midden ---
// Achter de dj (uitgangswand) één groot ledscherm, de ingangswand ook een ledscherm, de zijwanden ledkolommen met zwart ertussen, een
// ledvloer onder het publiek (doolhof.led, zie led.js; zolang die er niet is de terugval hieronder). De piramide is een ledobject: vlakken
// van ledgaas (doorzichtig: de dj staat erin), randen ledstrips, scanringen en een gloeiende top; bundels uit de top omhoog en over het
// publiek. Daarin de dj op een verhoging achter twee draaitafels, één kale hete lamp boven zijn hoofd. Publiek in een kring van 360 graden:
// 3D-figuren vooraan, daarachter een 3D-menigte van club/publiek.js, telefoons als lichtpuntjes (meer in de break). Camera: over de
// schouder van de dj de kring in, vanaf de ingangskant met de dj als silhouet voor het grote scherm, vanuit het publiek tegen de
// piramide in, af en toe een totaal.
// Bovenaan staat het gedeelde lichtshow-gereedschap (doolhof.lichtshow), ook gebruikt door mix.js (laadt na dit bestand).
(() => {
  if (!window.doolhof) { console.warn('boiler: window.doolhof ontbreekt'); return; }
  const RONDE = Math.PI * 2;

  // ======================= Lichtshow-gereedschap (doolhof.lichtshow), gedeeld met mix.js =======================
  // Diepzwart als basis; licht is de hoofdrol in 2-3 verzadigde kleuren die per maat/sectie wisselen, wit alleen als flits.
  // Geen echte lampen: elke soort licht is één draw call (InstancedMesh of Points) en vloer/muren krijgen het showvlak-materiaal
  // (textuur in het donker, opgelicht waar een bundel raakt en door de strobe). Testen: doolhof.lichtshow.forceer = { stand, opb }.
  const LS = window.doolhof.lichtshow = { forceer: null };
  const klem01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
  const getal = v => (typeof v === 'number' && isFinite(v) ? v : typeof v === 'boolean' ? (v ? 1 : 0) : NaN);
  const houdVast = x => { x.userData = x.userData || {}; x.userData.doolhofHouden = true; return x; };  // gedeeld: de kern gooit het niet weg

  // --- stand van de show: één keer per beeld (alle kamers lezen hetzelfde object). Bron: doolhof.show (kern) als die er is,
  // anders window.clubRegie + de tel. stand groove|break|opbouw|drop, k = tellen sinds het begin van de sectie, opb 0..1,
  // drop 1 -> 0 over 16 tellen, knal = de klap van de drop, flits = strobe nu (0..1), niv = lichtniveau, tempo = snelheid van de bewegingen ---
  const ST = { stand: 'groove', k: 0, opb: 0, drop: 0, knal: 0, flits: 0, donker: 0, niv: 0.8, tempo: 1, pos: 0, tel: 0, fase: 0, kick: 0, bas: 0, mid: 0, hoog: 0, en: 0, kleurTel: 0, wissel: false, dPos: 0 };
  let stVorig = '', stSinds = 0, stPos = NaN, stKleur = -1;
  // uniforms van de terugval-leds (zie LS.led), bijgewerkt in LS.stand
  const NU = { uTijd: { value: 0 }, uTel: { value: 0 }, uPuls: { value: 0 }, uBas: { value: 0 }, uOpb: { value: 0 }, uDrop: { value: 0 }, uFlits: { value: 0 }, uNiv: { value: 1 }, uStand: { value: 0 } };
  const STAND_I = { groove: 0, break: 1, opbouw: 2, drop: 3 };
  LS.stand = b => {
    b = b || {};
    const pos = +b.pos || 0;
    if (pos === stPos) return ST;  // al bijgewerkt dit beeld
    ST.dPos = isFinite(stPos) ? Math.max(0, Math.min(1, pos - stPos)) : 0; stPos = pos;
    const R = window.clubRegie || {}, B = window.doolhof.show || null, F = LS.forceer;
    let stand = (F && F.stand) || (B && typeof B.stand === 'string' && B.stand) || R.stand || 'groove';
    if (stand !== 'break' && stand !== 'opbouw' && stand !== 'drop') stand = 'groove';
    if (stand !== stVorig) {
      stVorig = stand;
      stSinds = !F && stand === 'drop' && R.stand === 'drop' && R.dropBeat >= 0 ? R.dropBeat : !F && stand === R.stand && isFinite(R.sinds) ? R.sinds : pos;
      if (stSinds > pos) stSinds = pos;
    }
    const k = pos - stSinds, fase = pos - Math.floor(pos), en = b.energy || 0;
    let opb = 0, drop = 0, knal = 0;
    if (stand === 'opbouw') {
      const bo = B ? getal(B.opbouw) : NaN;
      opb = klem01(F && F.opb != null ? F.opb : isFinite(bo) ? bo : Math.max(k, R.opbouwTel || 0) / 16);
    }
    if (stand === 'drop') {
      const bd = B ? getal(B.drop) : NaN;
      drop = klem01(isFinite(bd) && !F ? bd : 1 - k / 16);
      knal = Math.exp(-k * 2.2);
    }
    // eigen strobe (zonder show-bus, of bij forceer): opbouw = aanloop (1, 2, 4 flitsen per tel), drop = klap + de eerste 4 tellen
    // elke tel, daarna op de 1 van de maat; groove = een kort salvo aan het eind van elke 8 maten als er energie is.
    let fl = 0;
    if (stand === 'opbouw') {
      const n = opb < 0.5 ? 1 : opb < 0.8 ? 2 : 4;
      fl = (pos * n) % 1 < 0.26 ? (opb < 0.5 ? 0.5 * opb : 0.45 + 0.55 * opb) : 0;
    } else if (stand === 'drop') {
      if (k < 4) fl = fase < 0.16 ? 1 : 0;
      else if (k < 16 && Math.floor(pos) % 4 === 0) fl = fase < 0.1 ? 0.75 : 0;
      fl = Math.max(fl, knal);
    } else if (stand === 'groove' && en > 0.55 && Math.floor(pos) % 32 === 31) fl = (pos * 4) % 1 < 0.25 ? 0.6 : 0;
    // de kern (show-bus) bepaalt de strobe als hij die doorgeeft: alle kamers en gangen flitsen tegelijk (en nooit met de strobe uit)
    const bf = B ? getal(B.flits) : NaN;
    if (isFinite(bf) && !F) fl = klem01(bf);
    else if (!F && typeof S !== 'undefined' && S && S.strobe === 'uit') fl = 0;
    // blackout van de bus: de stand zit al in niv (break ~0,8 donker); alleen wat daar bovenop komt dimt nog verder
    const bb = B ? getal(B.blackout) : NaN, verwacht = stand === 'break' ? 0.8 : stand === 'opbouw' ? 0.8 * (1 - opb) : 0;
    const donker = isFinite(bb) && !F ? klem01(bb - verwacht) : 0;
    const niv = stand === 'break' ? 0.3 : stand === 'opbouw' ? 0.35 + 0.65 * opb : stand === 'drop' ? 1 + 0.35 * drop : 0.72 + 0.28 * en;
    Object.assign(ST, { stand, k, opb, drop, knal, flits: fl * (1 - donker), donker, niv: niv * (1 - donker), pos, tel: Math.floor(pos), fase,
      tempo: stand === 'break' ? 0.3 : stand === 'opbouw' ? 0.6 + 1.6 * opb : stand === 'drop' ? 1.7 : 1,
      kick: b.pulse || 0, bas: b.bas || 0, mid: b.mid || 0, hoog: b.hoog || 0, en });
    // kleurwissel: groove per maat, opbouw steeds sneller, drop elke tel, break per 4 maten
    const kt = stand === 'drop' ? Math.floor(pos) : stand === 'opbouw' ? Math.floor(pos / (opb < 0.5 ? 4 : opb < 0.85 ? 2 : 1)) : stand === 'break' ? Math.floor(pos / 16) : Math.floor(pos / 4);
    ST.wissel = kt !== stKleur; stKleur = kt; ST.kleurTel = kt;
    NU.uTijd.value = performance.now() / 1000; NU.uTel.value = pos; NU.uPuls.value = ST.kick; NU.uBas.value = ST.bas; NU.uOpb.value = opb;
    NU.uDrop.value = drop; NU.uFlits.value = ST.flits; NU.uNiv.value = ST.niv; NU.uStand.value = STAND_I[stand];
    return ST;
  };
  // kleur i van het palet van de kamer op dit moment (draait mee met kleurTel)
  LS.kleur = (pal, i) => { const n = pal.length; return pal[(((ST.kleurTel + (i | 0)) % n) + n) % n]; };

  // --- gedeelde texturen en vormen ---
  let gloedDoek = null;
  const gloedTex = houdVast(new THREE.Texture());
  LS.gloed = () => {  // zachte stip met een hete kern (punten, flares)
    if (!gloedDoek) {
      gloedDoek = document.createElement('canvas'); gloedDoek.width = gloedDoek.height = 64;
      const g = gloedDoek.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.12, 'rgba(255,255,255,0.85)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      gloedTex.image = gloedDoek; gloedTex.needsUpdate = true;
    }
    return gloedTex;
  };
  const witTex = houdVast(new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)); witTex.needsUpdate = true;
  // bundel: afgeknotte kegel langs +z van 0 (bron, 6% van de eindbreedte) tot 1; laser/lijn: balkje langs +z van 0 tot 1
  const bundelGeo = houdVast((() => { const g = new THREE.CylinderGeometry(0.06, 1, 1, 18, 1, true); g.translate(0, -0.5, 0); g.rotateX(-Math.PI / 2); return g; })());
  const lijnGeo = houdVast(new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5));
  const ZAS = new THREE.Vector3(0, 0, 1), lsM = new THREE.Matrix4(), lsQ = new THREE.Quaternion(), lsS = new THREE.Vector3(), lsC = new THREE.Color(), NUL = new THREE.Matrix4().makeScale(0, 0, 0);

  // --- bundels: volumetrische lichtkegels (zachte randen, fel bij de bron, uitdovend), één InstancedMesh, kleur per bundel (mag > 1:
  // dan wordt de kern bij de bron wit-heet) ---
  const BUNDEL_VS = `
    uniform float uTijd; varying vec3 vK, vN, vV; varying float vL, vA;
    void main() {
      vec4 p = vec4(position, 1.0); mat3 m = mat3(1.0);
      #ifdef USE_INSTANCING
        p = instanceMatrix * p; m = mat3(instanceMatrix);
      #endif
      vec3 s2 = vec3(dot(m[0], m[0]), dot(m[1], m[1]), dot(m[2], m[2])) + 1e-6;
      vec4 mv = modelViewMatrix * p;
      vN = normalize(normalMatrix * (m * (normal / s2))); vV = normalize(-mv.xyz);
      vL = position.z; vA = uv.x;
      #ifdef USE_INSTANCING_COLOR
        vK = instanceColor;
      #else
        vK = vec3(1.0);
      #endif
      gl_Position = projectionMatrix * mv;
    }`;
  const BUNDEL_FS = `
    uniform float uTijd, uSterk; varying vec3 vK, vN, vV; varying float vL, vA;
    void main() {
      float rand = pow(abs(dot(normalize(vN), normalize(vV))), 1.3);
      float lengte = pow(1.0 - vL, 1.7) * 0.92 + 0.08 * (1.0 - vL);
      float stof = 0.8 + 0.2 * sin(vA * 69.1 + uTijd * 1.3 + vL * 5.0) * sin(vA * 23.7 - uTijd * 0.7);
      vec3 c = vK * (rand * lengte * stof * uSterk);
      c += vec3(dot(c, vec3(0.33))) * 0.8 * pow(1.0 - vL, 12.0);  // hete kern bij de lens
      gl_FragColor = vec4(c, 1.0);
    }`;
  LS.bundels = (parent, n, sterk = 0.65) => {
    const mat = new THREE.ShaderMaterial({ uniforms: { uTijd: { value: 0 }, uSterk: { value: sterk } }, vertexShader: BUNDEL_VS, fragmentShader: BUNDEL_FS,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.InstancedMesh(bundelGeo, mat, Math.max(1, n));
    for (let i = 0; i < mesh.count; i++) { mesh.setMatrixAt(i, NUL); mesh.setColorAt(i, lsC.setRGB(0, 0, 0)); }
    mesh.frustumCulled = false; mesh.renderOrder = 6; parent.add(mesh);
    return {
      mesh, mat, n,
      // bundel i: bron p, richting dir (eenheid), lengte, straal aan het eind, kleur x k
      zet(i, p, dir, len, rad, kleur, k) {
        if (i >= n) return;
        if (!(k > 0.002) || !(len > 0.01)) { mesh.setMatrixAt(i, NUL); return; }
        lsM.compose(p, lsQ.setFromUnitVectors(ZAS, dir), lsS.set(rad, rad, len)); mesh.setMatrixAt(i, lsM);
        mesh.setColorAt(i, lsC.copy(kleur).multiplyScalar(k));
      },
      uit(i) { if (i < n) mesh.setMatrixAt(i, NUL); },
      klaar(t) { mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; mat.uniforms.uTijd.value = t || 0; },
    };
  };
  // --- lijnen: lasers en ledlijnen (kern + zachte gloed eromheen), één InstancedMesh ---
  LS.lijnen = (parent, n, gloed = true, gloedMaat = 6, wit = 0.25) => {  // wit: hoeveel de kern naar wit trekt (laser ja, ledstrip nauwelijks)
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const tot = Math.max(1, n * (gloed ? 2 : 1)), mesh = new THREE.InstancedMesh(lijnGeo, mat, tot);
    for (let i = 0; i < tot; i++) { mesh.setMatrixAt(i, NUL); mesh.setColorAt(i, lsC.setRGB(0, 0, 0)); }
    mesh.frustumCulled = false; mesh.renderOrder = 7; parent.add(mesh);
    return {
      mesh, mat, n,
      zet(i, p, dir, len, kleur, k, dik = 0.014) {
        if (i >= n) return;
        if (!(k > 0.002) || !(len > 0.01)) { mesh.setMatrixAt(i, NUL); if (gloed) mesh.setMatrixAt(n + i, NUL); return; }
        lsQ.setFromUnitVectors(ZAS, dir);
        lsM.compose(p, lsQ, lsS.set(dik, dik, len)); mesh.setMatrixAt(i, lsM);
        mesh.setColorAt(i, lsC.copy(kleur).multiplyScalar(k).addScalar(wit * k));  // kern iets witter
        if (gloed) { lsM.compose(p, lsQ, lsS.set(dik * gloedMaat, dik * gloedMaat, len)); mesh.setMatrixAt(n + i, lsM); mesh.setColorAt(n + i, lsC.copy(kleur).multiplyScalar(0.16 * k)); }
      },
      uit(i) { if (i < n) { mesh.setMatrixAt(i, NUL); if (gloed) mesh.setMatrixAt(n + i, NUL); } },
      klaar() { mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; },
    };
  };
  // --- punten: lenzen, flares, ledpixels, telefoons (Points met kleur per punt; zwart = uit) ---
  LS.punten = (parent, n, maat, map) => {
    const pos = new Float32Array(n * 3), kl = new Float32Array(n * 3), geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(kl, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: maat, map: map || LS.gloed(), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    pts.frustumCulled = false; pts.renderOrder = 8; parent.add(pts);
    return {
      pts, n, pos,
      zet(i, x, y, z, kleur, k) { if (i >= n) return; pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; kl[i * 3] = kleur.r * k; kl[i * 3 + 1] = kleur.g * k; kl[i * 3 + 2] = kleur.b * k; },
      plek(i, x, y, z) { pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; },
      kleur(i, kleur, k) { kl[i * 3] = kleur.r * k; kl[i * 3 + 1] = kleur.g * k; kl[i * 3 + 2] = kleur.b * k; },
      klaar() { geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true; },
    };
  };

  // --- showvlak: vloer, muren en plafond in het donker; licht alleen waar een lichtvlek valt (bundel die raakt, lamp, vuur) en bij
  // een flits. Lichtvlekken in kamermaten (spots.zet), de shader rekent in wereldmaten. Alle vlakken van een kamer delen de uniforms ---
  const VLAK_VS = `uniform vec2 uRep; varying vec2 vUv; varying vec3 vW;
    void main() { vUv = uv * uRep; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
  const VLAK_FS = n => `#define NS ${n}
    uniform sampler2D map; uniform vec3 uKleur, uVul, uFlits; uniform vec4 uSpot[NS]; uniform vec3 uSpotK[NS]; varying vec2 vUv; varying vec3 vW;
    void main() {
      vec3 t = texture2D(map, vUv).rgb * uKleur, l = uVul + uFlits;
      for (int i = 0; i < NS; i++) {
        vec3 d = vW - uSpot[i].xyz; float f = max(0.0, 1.0 - dot(d, d) / (uSpot[i].w * uSpot[i].w + 1e-4));
        l += uSpotK[i] * (f * f + 1.5 * pow(f, 10.0));
      }
      gl_FragColor = vec4(t * l, 1.0);
    }`;
  LS.spots = (ctx, n) => {
    n = n || (ctx.zwaar === 2 ? 4 : 8);
    const P = Array.from({ length: n }, () => new THREE.Vector4(0, -999, 0, 0.01)), K = Array.from({ length: n }, () => new THREE.Vector3());
    const U = { uSpot: { value: P }, uSpotK: { value: K }, uVul: { value: new THREE.Vector3(0.015, 0.015, 0.018) }, uFlits: { value: new THREE.Vector3() } };
    const g = ctx.groep, v = new THREE.Vector3(), fs = VLAK_FS(n);
    let i0 = 0;
    return {
      n, U,
      begin() { i0 = 0; for (const k of K) k.set(0, 0, 0); g.updateWorldMatrix(true, false); },
      zet(x, y, z, r, kleur, k) {  // lichtvlek: midden (kamermaten), straal, kleur x k
        if (i0 >= n || !(k > 0.003)) return;
        v.set(x, y, z).applyMatrix4(g.matrixWorld); P[i0].set(v.x, v.y, v.z, r); K[i0].set(kleur.r * k, kleur.g * k, kleur.b * k); i0++;
      },
      vul(kleur, k) { U.uVul.value.set(0.006 + kleur.r * k, 0.006 + kleur.g * k, 0.008 + kleur.b * k); },  // heel zacht gekleurd strooilicht
      flits(kleur, k) { U.uFlits.value.set(kleur.r * k, kleur.g * k, kleur.b * k); },
      // materiaal voor een vlak: textuur (herhaling uit map.repeat), tint
      mat(map, kleur) {
        const t = map || witTex;
        return new THREE.ShaderMaterial({ uniforms: { map: { value: t }, uRep: { value: t.repeat }, uKleur: { value: new THREE.Color(kleur == null ? 0xffffff : kleur) },
          uSpot: U.uSpot, uSpotK: U.uSpotK, uVul: U.uVul, uFlits: U.uFlits }, vertexShader: VLAK_VS, fragmentShader: fs, side: THREE.DoubleSide });
      },
    };
  };

  // afstand van o langs v tot de binnenkant van een kamer (w x d x h, vloer op 0)
  LS.raak = (o, v, w, d, h) => {
    const e = 0.03; let t = 60;
    if (v.x > 1e-5) t = Math.min(t, (w / 2 - e - o.x) / v.x); else if (v.x < -1e-5) t = Math.min(t, (-w / 2 + e - o.x) / v.x);
    if (v.y > 1e-5) t = Math.min(t, (h - e - o.y) / v.y); else if (v.y < -1e-5) t = Math.min(t, (e - o.y) / v.y);
    if (v.z > 1e-5) t = Math.min(t, (d / 2 - e - o.z) / v.z); else if (v.z < -1e-5) t = Math.min(t, (-d / 2 + e - o.z) / v.z);
    return Math.max(0.05, t);
  };
  // camera in kamermaten (vorig beeld)
  LS.camLokaal = (ctx, out) => { out.copy(camera.position); ctx.groep.updateWorldMatrix(true, false); return ctx.groep.worldToLocal(out); };

  // --- moving heads: koppen op vaste plekken die op de tel van formatie wisselen; zet bundels, lenzen (punten) en de lichtvlekken
  // waar ze raken. o: { bundels, spots, punten, maat {w,d,h}, plekken [[x,y,z]], focus {x,y,z}, pal [Color], spreid (rad), patronen,
  // eerste (index in bundels/punten), vlek (sterkte van de lichtvlek), omhoog (staan op de vloer: bundels omhoog) } ---
  const PATRONEN = ['waaier', 'kruis', 'zwaai', 'cirkel', 'midden', 'publiek'];
  LS.koppen = (ctx, o) => {
    const n = o.plekken.length, M = o.maat, i0 = o.eerste || 0, pal = o.pal, spreid = o.spreid || 0.06;
    const pat = (o.patronen || PATRONEN).filter(p => PATRONEN.includes(p) || p === 'omhoog');
    const patG = pat.filter(p => p !== 'publiek').length ? pat.filter(p => p !== 'publiek') : ['waaier'];  // 'publiek' alleen op de klap van de drop
    const kop = o.plekken.map(([x, y, z], i) => ({ p: new THREE.Vector3(x, y, z), dir: new THREE.Vector3(0, -1, 0), doel: new THREE.Vector3(), i }));
    const cam = new THREE.Vector3(), T = new THREE.Vector3(), eind = new THREE.Vector3(), focus = new THREE.Vector3();
    let ph = Math.random() * 6.28, patroon = pat[0], patVorig = '', camT = -1;
    const kies = s => {
      if (s.stand === 'break') return 'midden';
      if (s.stand === 'opbouw') return s.opb < 0.55 ? 'zwaai' : 'midden';
      if (s.stand === 'drop') return s.k < 4 ? (pat.includes('publiek') ? 'publiek' : 'waaier') : patG[Math.floor(s.pos / 4) % patG.length];
      return patG[Math.floor(s.pos / 8) % patG.length];
    };
    return {
      kop,
      update(s, dt, now) {
        patroon = kies(s);
        if (patroon !== patVorig) { patVorig = patroon; }
        ph += s.dPos * Math.PI / 4 * s.tempo;  // een hele zwaai per 2 maten (groove), sneller in opbouw/drop
        if (patroon === 'publiek' && now - camT > 0.25) { LS.camLokaal(ctx, cam); camT = now; }
        if (o.focus) focus.set(o.focus.x, o.focus.y || 0, o.focus.z);
        const snel = s.stand === 'drop' ? 10 : s.stand === 'break' ? 1.2 : s.stand === 'opbouw' ? 3 + 6 * s.opb : 4;
        const kBreak = Math.floor(s.pos / 16) % n;
        for (const h of kop) {
          const i = h.i, u = n > 1 ? i / (n - 1) - 0.5 : 0;
          // doelpunt per patroon (kamermaten)
          switch (patroon) {
            case 'waaier': T.set(u * M.w * 0.9 * (0.75 + 0.25 * Math.sin(ph)), o.omhoog ? M.h : 0, (o.omhoog ? h.p.z : 0) + M.d * 0.3 * Math.sin(ph * 0.5 + u)); break;
            case 'kruis': T.set(-h.p.x * 0.9, o.omhoog ? M.h : 0, -h.p.z * 0.5 + M.d * 0.25 * Math.sin(ph + i)); break;
            case 'zwaai': T.set(h.p.x + Math.sin(ph) * M.w * 0.45, o.omhoog ? M.h : 0, h.p.z + Math.cos(ph * 0.7) * M.d * 0.2); break;
            case 'cirkel': { const a = ph * 1.5 + i * 6.283 / n; T.set(focus.x + Math.cos(a) * 2.6, o.omhoog ? M.h : 0, focus.z + Math.sin(a) * 2.6); break; }
            case 'publiek': T.set(cam.x + (i % 2 ? 1 : -1) * (0.9 + 1.4 * Math.abs(u)), cam.y + 0.8 + 0.3 * Math.sin(ph * 2 + i), cam.z); break;  // vlak langs de camera: de bundels komen op je af
            case 'omhoog': T.set(h.p.x + Math.sin(ph + i) * 2.5, M.h, h.p.z + Math.cos(ph * 0.8 + i) * 2.5); break;
            default: T.set(focus.x + 0.35 * Math.sin(ph + i * 2), focus.y || 0, focus.z + 0.35 * Math.cos(ph + i * 2));  // midden
          }
          h.doel.subVectors(T, h.p); if (h.doel.lengthSq() < 1e-4) h.doel.set(0, -1, 0); h.doel.normalize();
          h.dir.lerp(h.doel, 1 - Math.exp(-snel * dt)).normalize();
          // sterkte en kleur per stand
          let k, kl;
          if (s.stand === 'break') { k = i === kBreak ? 0.5 + 0.15 * Math.sin(now * 0.9) : 0; kl = pal[pal.length - 1]; }
          else if (s.stand === 'opbouw') {
            const loop = Math.floor(s.pos * (s.opb < 0.5 ? 1 : 2)) % n;  // looplicht: één kop per tel, later twee per tel
            k = (s.opb < 0.7 ? (i === loop ? 1 : 0.2) : 1) * (0.35 + 0.75 * s.opb); kl = LS.kleur(pal, i % 2);
          } else if (s.stand === 'drop') { k = (1.15 + 0.8 * s.knal) * (s.k < 4 ? 0.45 + 0.55 * Math.exp(-s.fase * 5) : 0.8 + 0.3 * s.kick); kl = LS.kleur(pal, i); }
          else { k = (0.7 + 0.4 * (i % 2 ? s.kick : 1 - s.fase)) * (0.75 + 0.25 * s.en); kl = LS.kleur(pal, i % 2); }
          k *= o.sterk || 1;
          if (s.flits > 0.5) { kl = WIT_SHOW; k = Math.max(k, 1.4 * s.flits); }
          const len = LS.raak(h.p, h.dir, M.w, M.d, M.h), rad = 0.05 + len * spreid;
          o.bundels.zet(i0 + i, h.p, h.dir, len, rad, kl, k);
          if (o.punten) o.punten.zet(i0 + i, h.p.x, h.p.y, h.p.z, kl, Math.min(2.5, 0.4 + 1.4 * k));
          if (o.spots && k > 0.02) { eind.copy(h.p).addScaledVector(h.dir, len); o.spots.zet(eind.x, eind.y, eind.z, rad * 1.5 + 0.35, kl, (o.vlek || 0.55) * Math.min(1.4, k)); }
        }
      },
    };
  };
  const WIT_SHOW = new THREE.Color(1, 1, 1);
  LS.wit = WIT_SHOW;

  // ======================= leds: bewegende ledoppervlakken (doolhof/led.js), met een eenvoudige eigen terugval =======================
  // Geen stilstaand vlak: muren, vloeren, plafonds, podia zijn een ledscherm (doolhof.led.scherm), ledvloer (.vloer), ledstrip (.strip)
  // of donker. Zolang led.js er (nog) niet is of stuk is: deze terugval met hetzelfde contract (patronen, beeld schuift, flits op de tel).
  const noodMini = () => typeof KW !== 'undefined' && KW && KW.stand === 'minimaal';
  const NOOD_VS = 'uniform float uLen; varying vec2 vUv; varying float vL; void main() { vUv = uv; vL = uLen > 0.0 ? position.x / uLen + 0.5 : uv.x; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
  const NOOD_KOP = `uniform float uTijd, uTel, uPuls, uBas, uOpb, uDrop, uFlits, uNiv, uStand, uZaad, uHelder; uniform vec3 uA, uB, uC, uD; varying vec2 vUv; varying float vL;
    float hs(float n) { return fract(sin(n * 91.345) * 47453.53); }
    vec3 pal3(float t) { t = fract(t) * 3.0; return t < 1.0 ? mix(uA, uB, t) : t < 2.0 ? mix(uB, uC, t - 1.0) : mix(uC, uA, t - 2.0); }
    float tempo() { return uStand < 0.5 ? 1.0 : uStand < 1.5 ? 0.3 : uStand < 2.5 ? 1.0 + 2.0 * uOpb : 2.0; }
    vec3 eind(vec3 c) { return c * uHelder * (0.3 + 0.7 * uNiv) + vec3(0.85 * uFlits); }
  `;
  const NOOD_SCHERM = `uniform sampler2D uMap; uniform float uMapAan; uniform vec2 uRes;
    void main() {
      vec2 g = vUv * uRes, uv = (floor(g) + 0.5) / uRes;
      float m = mod(floor(uTel / 16.0) + uZaad, 4.0), fase = fract(uTel), sp = tempo();
      vec3 c;
      if (m < 1.0 && uMapAan > 0.5) {  // beeld: schuift en zoomt, kleur naar het palet
        vec2 q = (uv - 0.5) / (1.0 + 0.15 * sin(uTel * 0.39)) + 0.5 + vec2(uTijd * 0.03 * sp, 0.0);
        float l = dot(texture2D(uMap, q).rgb, vec3(0.3, 0.59, 0.11));
        c = (l < 0.5 ? mix(uD, uA, l * 2.0) : mix(uA, uB, l * 2.0 - 1.0)) * (0.6 + 0.8 * uPuls);
      } else if (m < 2.0) {  // balken die op de tel verspringen
        float b = floor(uv.x * 10.0);
        c = pal3(b * 0.1 + floor(uTel / 4.0) / 3.0) * step(0.45, hs(b + floor(uTel) * 7.0 + uZaad)) * (1.0 - 0.75 * fase);
      } else if (m < 3.0) {  // ringen vanuit het midden
        float r = length((uv - 0.5) * vec2(uRes.x / uRes.y, 1.0));
        c = pal3(r * 0.4 + floor(uTel) / 3.0) * smoothstep(0.35, 0.0, abs(fract(r * 2.0 - uTel * 0.5) - 0.5));
      } else {  // plasma
        float t = uTijd * sp, v = sin(uv.x * 9.0 + t) + sin(uv.y * 7.0 - t * 0.7) + sin((uv.x + uv.y) * 6.0 + t * 1.3);
        c = pal3(v * 0.15 + t * 0.05) * (0.4 + 0.6 * uBas);
      }
      #ifndef LED_EENVOUDIG
        c *= smoothstep(0.5, 0.25, length(fract(g) - 0.5)) * 1.5;  // ledpunt
      #endif
      gl_FragColor = vec4(eind(c), 1.0);
    }`;
  const NOOD_VLOER = `uniform vec2 uN;
    void main() {
      vec2 g = vUv * uN, cel = floor(g), f = fract(g), p = cel - uN * 0.5 + 0.5;
      float voeg = step(0.05, f.x) * step(0.05, f.y) * step(f.x, 0.95) * step(f.y, 0.95);
      float brk = step(0.5, uStand) * step(uStand, 1.5), opb = step(1.5, uStand) * step(uStand, 2.5);
      float m = brk > 0.5 ? 1.0 : opb > 0.5 ? 0.0 : mod(floor(uTel / (uStand > 2.5 ? 4.0 : 8.0)) + uZaad, 4.0);
      float t = floor(opb > 0.5 ? uTel * (uOpb < 0.5 ? 1.0 : 2.0) : uTel), fase = fract(uTel), k, ci;
      if (m < 1.0) { k = mod(cel.x + cel.y + t, 2.0); ci = mod(cel.x + cel.y, 3.0); }
      else if (m < 2.0) { float d = length(p) - fract(uTel / 4.0) * length(uN) * 0.6; k = 0.05 + exp(-d * d * 0.6); ci = mod(t, 3.0); }
      else if (m < 3.0) { float h = hs(dot(cel, vec2(12.99, 78.23)) + t); k = step(0.72, h); ci = floor(h * 30.0); }
      else { k = step(mod(cel.y + t, 4.0), 0.5); ci = mod(cel.y, 3.0); }
      ci = mod(ci, 3.0);
      vec3 c = ci < 1.0 ? uA : ci < 2.0 ? uB : uC;
      float licht = brk > 0.5 ? 0.22 : 0.3 + 0.45 * (1.0 - fase) + 0.25 * uPuls;
      gl_FragColor = vec4(eind(c * max(k, 0.04) * licht * voeg + uD * 0.3), 1.0);
    }`;
  const NOOD_STRIP = `void main() {
      float run = fract(uTel * (uStand > 1.5 && uStand < 2.5 ? (uOpb < 0.5 ? 1.0 : 2.0) : 1.0)), d = vL - run;
      float k = uStand > 2.5 ? 0.8 + 0.5 * uPuls : uStand > 0.5 && uStand < 1.5 ? 0.25 : 0.15 + 1.2 * exp(-d * d * 40.0);
      gl_FragColor = vec4(eind(pal3(floor(uTel / 4.0) / 3.0 + vL * 0.2) * k), 1.0);
    }`;
  const noodTex = new Map();
  function noodBron(b) {
    if (b && b.isTexture) return b;
    if (typeof b !== 'string') return null;
    if (!noodTex.has(b)) { const t = houdVast(new THREE.TextureLoader().load('tex/doolhof/' + b + '.jpg')); t.wrapS = t.wrapT = THREE.RepeatWrapping; noodTex.set(b, t); }
    return noodTex.get(b);
  }
  const noodMat = (o, fs, extra) => {
    const P = o.palet || {}, kl = (c, d) => new THREE.Color(c == null ? d : c);
    return new THREE.ShaderMaterial({
      uniforms: Object.assign({ uZaad: { value: (+o.zaad || 0) % 97 }, uHelder: { value: o.helder == null ? 1 : o.helder }, uLen: { value: 0 },
        uA: { value: kl(P.a, 0xff2d95) }, uB: { value: kl(P.b, 0x00e5ff) }, uC: { value: kl(P.c, 0x7a2cff) }, uD: { value: kl(P.donker, 0x020104) } }, NU, extra),
      vertexShader: NOOD_VS, fragmentShader: (noodMini() ? '#define LED_EENVOUDIG\n' : '') + NOOD_KOP + fs });
  };
  const NOOD = {
    nood: true,
    scherm(o = {}) {
      const t = noodBron(o.bron), m = o.maat || { w: 4, h: 3 }, p = o.pitch || 0.05;
      return noodMat(o, NOOD_SCHERM, { uMap: { value: t || witTex }, uMapAan: { value: t ? 1 : 0 }, uRes: { value: new THREE.Vector2(Math.max(4, Math.round(m.w / p)), Math.max(4, Math.round(m.h / p))) } });
    },
    vloer(w, d, o = {}) {
      const t = o.tegel || 0.6, m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), noodMat(o, NOOD_VLOER, { uN: { value: new THREE.Vector2(Math.max(1, Math.round(w / t)), Math.max(1, Math.round(d / t))) } }));
      m.rotation.x = -Math.PI / 2; return m;
    },
    strip(len, o = {}) {
      const mat = noodMat(o, NOOD_STRIP); mat.uniforms.uLen.value = len;
      return new THREE.Mesh(new THREE.BoxGeometry(len, o.dik || 0.035, o.dik || 0.035), mat);
    },
  };
  // de leds van led.js als die er (al) is, anders de terugval
  LS.led = () => { const L = window.doolhof.led; return L && typeof L.scherm === 'function' && typeof L.vloer === 'function' && typeof L.strip === 'function' ? L : NOOD; };
  LS.nood = NOOD;
  // palet voor de leds: { a, b, c, donker } uit drie kleuren (getal, css of Color)
  LS.palet = (pal, donker) => ({ a: new THREE.Color(pal[0]), b: new THREE.Color(pal[1 % pal.length]), c: new THREE.Color(pal[2 % pal.length]), donker: new THREE.Color(donker == null ? 0x030208 : donker) });
  // ledvloer plat op de vloer van parent (hoe led.js hem ook aflevert), net boven y = 0
  const _bb = new THREE.Box3(), _bv = new THREE.Vector3(), _bc = new THREE.Vector3(), AS_X = new THREE.Vector3(1, 0, 0), AS_Y = new THREE.Vector3(0, 1, 0);
  LS.ledVloer = (parent, w, d, o, y = 0.005) => {
    const m = LS.led().vloer(w, d, o);
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    m.updateMatrix(); _bb.copy(m.geometry.boundingBox).applyMatrix4(m.matrix).getSize(_bv);
    if (_bv.y > 0.3 * Math.min(_bv.x, _bv.z) + 0.05) m.rotation.x -= Math.PI / 2;  // staat rechtop (vlak in xy): plat leggen
    m.position.y += y; m.frustumCulled = false; parent.add(m);
    return m;
  };
  // ledstrip van punt a in richting dir (eenheid) over len: de langste as van de strip wordt dir
  LS.ledStrip = (parent, a, dir, len, o) => {
    const m = LS.led().strip(len, o), g = m.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    g.boundingBox.getSize(_bv); g.boundingBox.getCenter(_bc);
    m.quaternion.setFromUnitVectors(_bv.x >= _bv.y && _bv.x >= _bv.z ? AS_X : _bv.y >= _bv.z ? AS_Y : ZAS, dir);
    m.position.copy(a).addScaledVector(dir, len / 2).sub(_bc.applyQuaternion(m.quaternion));
    parent.add(m);
    return m;
  };
  // meerdere ledstrips in één draw (led.strips als die er is): [[x1, y1, z1, x2, y2, z2], ...]
  LS.ledStrips = (parent, lijst, o) => {
    const L = LS.led();
    if (typeof L.strips === 'function') { const m = L.strips(lijst, o); m.frustumCulled = false; parent.add(m); return m; }
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    for (const s of lijst) { a.set(s[0], s[1], s[2]); b.set(s[3], s[4], s[5]); const len = a.distanceTo(b); if (len > 1e-3) LS.ledStrip(parent, a, b.sub(a).divideScalar(len), len, o); }
    return null;
  };
  // losse rechthoeken met één materiaal in één mesh (één draw): [{ w, h, x, y, z, ry, rx?, uv: [u0, u1, v0, v1] }]
  LS.vlakken = (parent, mat, lijst) => {
    const pos = [], nor = [], uv = [], M = new THREE.Matrix4(), E = new THREE.Euler(), Qv = new THREE.Quaternion(), P = new THREE.Vector3(), N = new THREE.Vector3(), EEN = new THREE.Vector3(1, 1, 1);
    for (const v of lijst) {
      M.compose(P.set(v.x, v.y, v.z), Qv.setFromEuler(E.set(v.rx || 0, v.ry || 0, 0)), EEN);
      N.set(0, 0, 1).applyQuaternion(Qv);
      const [u0, u1, v0, v1] = v.uv || [0, 1, 0, 1], hw = v.w / 2, hh = v.h / 2;
      for (const [x, y, a, b] of [[-hw, -hh, u0, v0], [hw, -hh, u1, v0], [hw, hh, u1, v1], [-hw, -hh, u0, v0], [hw, hh, u1, v1], [-hw, hh, u0, v1]]) {
        P.set(x, y, 0).applyMatrix4(M); pos.push(P.x, P.y, P.z); nor.push(N.x, N.y, N.z); uv.push(a, b);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; parent.add(m);
    return m;
  };
  // ledpanelen op een wand van een kamer (w x d x h, vloer 0): wand 'x-' | 'x+' | 'z-' | 'z+', n kolommen x rijen, vul/vulY = deel dat
  // paneel is (de rest blijft zwart), y0..y1. De uv loopt over de hele wand door (één beeld achter een rooster). Op z-wanden blijft de deur
  // (2 x 2,6 m in het midden) vrij. Geeft een lijst voor LS.vlakken.
  LS.paneelLijst = (wand, w, d, o) => {
    const n = o.n || 1, rijen = o.rijen || 1, vul = o.vul == null ? 1 : o.vul, vulY = o.vulY == null ? 1 : o.vulY, y0 = o.y0 || 0, y1 = o.y1, uit = o.uit || 0.02;
    const L = wand[0] === 'x' ? d : w, deur = o.deur == null ? wand[0] === 'z' : o.deur, lijst = [];
    const ry = { 'x-': Math.PI / 2, 'x+': -Math.PI / 2, 'z-': 0, 'z+': Math.PI }[wand];
    const plek = (s, y) => wand === 'x-' ? [-w / 2 + uit, y, -s] : wand === 'x+' ? [w / 2 - uit, y, s] : wand === 'z-' ? [s, y, -d / 2 + uit] : [-s, y, d / 2 - uit];
    const stuk = (s0, s1, ya, yb) => {
      if (s1 - s0 < 0.05 || yb - ya < 0.03) return;
      const [x, y, z] = plek((s0 + s1) / 2, (ya + yb) / 2);
      lijst.push({ w: s1 - s0, h: yb - ya, x, y, z, ry, uv: [(s0 + L / 2) / L, (s1 + L / 2) / L, (ya - y0) / (y1 - y0), (yb - y0) / (y1 - y0)] });
    };
    for (let i = 0; i < n; i++) for (let j = 0; j < rijen; j++) {
      const sc = -L / 2 + (i + 0.5) * L / n, pw = L / n * vul, yc = y0 + (j + 0.5) * (y1 - y0) / rijen, ph = (y1 - y0) / rijen * vulY;
      const s0 = sc - pw / 2, s1 = sc + pw / 2, ya = yc - ph / 2, yb = yc + ph / 2;
      if (deur && ya < 2.75 && s0 < 1.15 && s1 > -1.15) {  // deur vrij: links en rechts ervan, en wat erboven valt
        stuk(s0, Math.min(s1, -1.15), ya, yb); stuk(Math.max(s0, 1.15), s1, ya, yb);
        if (yb > 2.8) stuk(Math.max(s0, -1.15), Math.min(s1, 1.15), 2.8, yb);
      } else stuk(s0, s1, ya, yb);
    }
    return lijst;
  };

  // ======================= de boiler-kamer =======================
  const W = 14, D = 14, H = 6.2;                 // kamer: vloer x/z -7..7, plafond 6,2 (ruimte voor de bundels boven het publiek)
  const B = 2.6, PH = 4.0;                       // piramide: halve basis (5,2 m breed), hoogte
  const DAIS = 0.3, DJZ = 0.15, TZ = -0.45;      // verhoging, plek van de dj (kijkt naar -z), midden van de tafel
  const LAMP_Y = 3.1;                            // kale lamp boven de dj, hangt aan de top
  // camera: binnenkomst, dan 5 s schouder + 4,5 s voor (de dj als silhouet tegen het grote ledscherm) + 4,5 s tegenlicht + 3 s totaal
  const BLIJF = 20, T_IN = 2.8, SCHOUDER = 5, VOOR = 4.5, TEGEN = 4.5, CYCLUS = 17;
  // looppad: ingang -> links om de piramide door het publiek -> uitgang; het middelste punt is de wachtplek
  const ROUTE = [[0, -7], [0, -6.2], [-2, -5.4], [-4.4, -3.3], [-4.7, 0], [-4.4, 3.3], [-2, 5.4], [0, 6.2], [0, 7]].map(([x, z]) => ({ x, z }));
  const WACHT = ROUTE[4];

  // --- gedeelde doeken: één keer tekenen, per kamer een eigen texture (die mag de kern opruimen) ---
  const doeken = {};
  function tex(naam, w, h, teken, rx, ry) {
    if (!doeken[naam]) { const c = document.createElement('canvas'); c.width = w; c.height = h; teken(c.getContext('2d'), w, h); doeken[naam] = c; }
    const t = new THREE.CanvasTexture(doeken[naam]);
    if (rx) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); }
    return t;
  }
  const kans = (a, b) => a + Math.random() * (b - a);
  function korrel(g, w, h, n) {
    const img = g.getImageData(0, 0, w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const k = (Math.random() - 0.5) * n; d[i] += k; d[i + 1] += k; d[i + 2] += k; }
    g.putImageData(img, 0, 0);
  }
  function vlekken(g, w, h, n, kleuren) {
    for (let i = 0; i < n; i++) {
      const x = kans(0, w), y = kans(0, h), r = kans(20, 110), gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, kleuren[Math.floor(Math.random() * kleuren.length)]); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  // beton: vlekken, naden en scheuren
  const tekenBeton = (g, w, h) => {
    g.fillStyle = '#2e2b29'; g.fillRect(0, 0, w, h);
    vlekken(g, w, h, 40, ['rgba(0,0,0,0.35)', 'rgba(60,40,25,0.25)', 'rgba(255,255,255,0.05)']);
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 2;
    for (let x = 0; x <= w; x += 256) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); g.beginPath(); g.moveTo(0, x); g.lineTo(w, x); g.stroke(); }
    g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
      let x = kans(0, w), y = kans(0, h); g.beginPath(); g.moveTo(x, y);
      for (let j = 0; j < 12; j++) { x += kans(-14, 14); y += kans(4, 16); g.lineTo(x, y); }
      g.stroke();
    }
    korrel(g, w, h, 28);
  };
  // telefoonscherm met een zachte gloed eromheen
  const tekenTelefoon = (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, 44);
    gr.addColorStop(0, 'rgba(200,220,255,0.6)'); gr.addColorStop(1, 'rgba(200,220,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff'; g.fillRect(22, 28, 20, 40);
  };
  const tekenGloed = (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  };
  // plaat: groeven, wit label (krijgt de kleur van het materiaal) en een streepje zodat je hem ziet draaien
  const tekenPlaat = (g, w, h) => {
    const c = w / 2;
    g.fillStyle = '#060607'; g.beginPath(); g.arc(c, c, c, 0, RONDE); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 1;
    for (let r = 44; r < c - 2; r += 3) { g.beginPath(); g.arc(c, c, r, 0, RONDE); g.stroke(); }
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(c, c, 40, 0, RONDE); g.fill();
    g.fillRect(c + 44, c - 2, c - 50, 4);
    g.fillStyle = '#000000'; g.beginPath(); g.arc(c, c, 3, 0, RONDE); g.fill();
  };

  // --- geometrie samenvoegen: veel statische stukjes in één draw call ---
  const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
  const mat4 = (x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
  function samen(delen, metKleur) {  // delen: [[geometrie, Matrix4, kleur?], ...]
    const pos = [], nor = [], uv = [], kl = [];
    const nm = new THREE.Matrix3(), v = new THREE.Vector3(), c = new THREE.Color();
    for (const [geo, m, kleur] of delen) {
      const g = geo.index ? geo.toNonIndexed() : geo;
      const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
      nm.getNormalMatrix(m);
      if (metKleur) c.set(kleur === undefined ? 0xffffff : kleur);
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(m); pos.push(v.x, v.y, v.z);
        if (n) v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); else v.set(0, 1, 0);
        nor.push(v.x, v.y, v.z);
        uv.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0);
        if (metKleur) kl.push(c.r, c.g, c.b);
      }
      if (g !== geo) g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    if (metKleur) out.setAttribute('color', new THREE.Float32BufferAttribute(kl, 3));
    return out;
  }
  const additief = (kleur, extra) => new THREE.MeshBasicMaterial(Object.assign({ color: kleur, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }, extra || {}));
  LS.samen = samen; LS.mat4 = mat4;  // ook voor mix.js

  // afstand van een punt tot het looppad
  function routeAfstand(p) {
    let best = 1e9;
    for (let i = 0; i < ROUTE.length - 1; i++) {
      const a = ROUTE[i], b = ROUTE[i + 1], dx = b.x - a.x, dz = b.z - a.z;
      const u = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
      best = Math.min(best, Math.hypot(a.x + dx * u - p.x, a.z + dz * u - p.z));
    }
    return best;
  }
  const afst = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  // punt op 'off' meter buiten de vierkante voet van de piramide, in richting a
  function ringPunt(a, off) {
    const c = Math.cos(a), s = Math.sin(a), r = B / Math.max(Math.abs(c), Math.abs(s)) + off;
    return { x: c * r, z: s * r };
  }

  // in stappen (generator): de kern bouwt op de achtergrond en pauzeert bij een yield als het budget van het beeld op is (~13 ms in één keer)
  function* maak(ctx) {
    const G = ctx.groep, Z = Math.max(0, Math.min(2, ctx.zwaar | 0)), R = ctx.rnd;
    const rr = (a, b) => a + R() * (b - a);
    // kleur van deze kelder: meestal oranje, soms rood, roze of (zelden) cyaan
    const hr = R(), HUE = hr < 0.5 ? 0.065 : hr < 0.75 ? 0.0 : hr < 0.9 ? 0.93 : 0.53;
    const NEON = new THREE.Color().setHSL(HUE, 1, 0.55), neonCss = '#' + NEON.getHexString();
    // palet: de kelderkleur, een felle tegenkleur en een diepe kleur voor de break
    const [ACC, DIEP] = HUE === 0.065 ? [0.93, 0.62] : HUE === 0.0 ? [0.53, 0.76] : HUE === 0.93 ? [0.5, 0.7] : [0.93, 0.67];
    const PAL = [NEON.clone(), new THREE.Color().setHSL(ACC, 1, 0.55), new THREE.Color().setHSL(DIEP, 1, 0.5)];
    const bronnen = [];  // losse bron-geometrieën: na het samenvoegen weggooien
    const bron = g => (bronnen.push(g), g);
    const bx = bron(new THREE.BoxGeometry(1, 1, 1)), cy = bron(new THREE.CylinderGeometry(1, 1, 1, 12));

    // --- kelder vol leds: achter de dj (uitgangswand) één groot ledscherm, de ingangswand ook, de zijwanden ledkolommen met zwart
    // ertussen, een ledvloer onder het publiek; alleen het plafond (buizen) is donker beton waar de bundels op vallen ---
    const LED = LS.led(), zaad = Math.floor(R() * 997), P4 = LS.palet(PAL, NEON.clone().multiplyScalar(0.03));
    const BRON = ['beton-bunker', 'rave-flyers', 'neonsteeg', 'baksteen', 'staal'][Math.floor(R() * 5)];
    const spots = LS.spots(ctx), zwart = new THREE.MeshBasicMaterial({ color: 0x010101 });
    const held = LED.scherm({ bron: BRON, palet: P4, maat: { w: W, h: H }, zaad, modi: ['beeld', 'tekst', 'golf', 'patroon'], helder: 0.9 });
    const ingang = LED.scherm({ bron: BRON, palet: P4, maat: { w: W, h: H }, zaad: zaad + 7, modi: ['patroon', 'beeld', 'golf'], helder: 0.5 });
    const plafond = spots.mat(tex('beton', 512, 512, tekenBeton, W / 4, D / 4), 0x4a4644);
    ctx.doos({ w: W, d: D, h: H, vloer: zwart, muur: [zwart, zwart, ingang, held], plafond });
    LS.ledVloer(G, W, D, { palet: P4, tegel: 0.5, zaad });
    const kolom = LED.scherm({ bron: BRON === 'staal' ? 'beton-bunker' : 'staal', palet: P4, maat: { w: D, h: H - 0.7 }, zaad: zaad + 3, modi: ['golf', 'patroon', 'beeld'], helder: 0.65 });
    LS.vlakken(G, kolom, [...LS.paneelLijst('x-', W, D, { n: 7, vul: 0.5, y0: 0.35, y1: H - 0.35 }), ...LS.paneelLijst('x+', W, D, { n: 7, vul: 0.5, y0: 0.35, y1: H - 0.35 })]);

    yield;
    // --- de dj eerst: zijn lengte bepaalt de tafelhoogte en de camerahoogte ---
    const podium = new THREE.Group(); podium.position.y = DAIS; G.add(podium);  // dj staat op de verhoging
    const dj = ctx.figuur({ x: 0, z: DJZ, face: Math.PI, rol: 'dj', filter: /alien|wizard/ }) || ctx.figuur({ x: 0, z: DJZ, face: Math.PI, rol: 'dj' });
    let djH = 1.75;
    if (dj) {
      podium.add(dj.root);  // haalt hem uit ctx.groep en zet hem 0,3 m hoger; lokale plek blijft (0, 0, DJZ)
      if (dj.M && dj.body) djH = Math.abs(dj.body.scale.y) * (dj.M.h || 1);
      if (!(djH > 1 && djH < 3)) djH = 1.75;
    }
    const TOP = DAIS + Math.max(0.95, Math.min(1.25, 0.56 * djH));  // tafelblad op heuphoogte
    const CAMY = Math.min(DAIS + 0.93 * djH, 2.15);                  // schoudercamera; hoger past niet in de piramide

    yield;
    // --- statisch spul in één belicht mesh (lambert, kleur per hoekpunt) ---
    const vast = [];
    vast.push([bx, mat4(0, DAIS / 2, 0, 2.7, DAIS, 2.7), 0x17151a]);                                   // verhoging
    vast.push([bx, mat4(0, (DAIS + TOP - 0.04) / 2, TZ, 1.7, TOP - 0.04 - DAIS, 0.55), 0x0e0e12]);     // tafelkast
    vast.push([bx, mat4(0, TOP - 0.02, TZ, 1.82, 0.04, 0.62), 0x1c1c22]);                              // tafelblad
    for (const dx of [-0.5, 0.5]) {                                                                     // draaitafels
      vast.push([bx, mat4(dx, TOP + 0.025, TZ, 0.46, 0.05, 0.36), 0x26262c]);
      vast.push([cy, mat4(dx - 0.03, TOP + 0.056, TZ, 0.155, 0.012, 0.155), 0x8a8a94]);
      vast.push([cy, mat4(dx + 0.18, TOP + 0.065, TZ - 0.12, 0.02, 0.03, 0.02), 0x55555c]);
      vast.push([bx, mat4(dx + 0.125, TOP + 0.08, TZ - 0.03, 0.008, 0.008, 0.211, 0, Math.atan2(-0.11, 0.18), 0), 0xb0b0b8]);
    }
    vast.push([bx, mat4(0, TOP + 0.035, TZ, 0.3, 0.07, 0.36), 0x1e1e24]);                              // mixer
    for (const sx of [-1, 1]) {                                                                          // monitorboxen op een paal, naar de dj
      vast.push([cy, mat4(sx * 1.12, DAIS + 0.4, TZ + 0.05, 0.025, 0.8, 0.025), 0x333338]);
      vast.push([bx, mat4(sx * 1.12, DAIS + 1.0, TZ + 0.05, 0.3, 0.42, 0.3), 0x111113]);
    }
    vast.push([cy, mat4(0, (PH + LAMP_Y) / 2, 0, 0.008, PH - LAMP_Y - 0.04, 0.008), 0x050505]);        // lampsnoer
    // kale buizen, een ventilatiekoker en twee buizen in de hoeken
    for (const [as, x, y, z, r, k] of [['x', 0, H - 0.16, 6.55, 0.08, 0x3a3a3e], ['x', 0, H - 0.12, 6.28, 0.05, 0x5a3422], ['x', 0, H - 0.18, -6.5, 0.1, 0x444448],
      ['z', 6.6, H - 0.14, 0, 0.07, 0x3a3a3e], ['z', -6.62, H - 0.6, 0, 0.045, 0x5a3422], ['y', -6.75, H / 2, 6.75, 0.07, 0x3a3a3e], ['y', 6.75, H / 2, -6.75, 0.05, 0x5a3422]]) {
      const len = as === 'x' ? W : as === 'z' ? D : H;
      vast.push([cy, mat4(x, y, z, r, len, r, as === 'z' ? Math.PI / 2 : 0, 0, as === 'x' ? Math.PI / 2 : 0), k]);
    }
    vast.push([bx, mat4(-6.0, H - 0.26, 0, 0.8, 0.45, D - 0.2), 0x55555a]);
    if (Z < 2) for (const [z0, zm, z1, zak] of [[-3.2, -3.0, -3.4, 0.7], [3.4, 3.1, 2.9, 0.55]]) {      // doorhangende kabels
      const kromme = new THREE.CatmullRomCurve3([new THREE.Vector3(-W / 2 + 0.1, H - 0.1, z0), new THREE.Vector3(-0.5, H - zak, zm), new THREE.Vector3(W / 2 - 0.1, H - 0.1, z1)]);
      vast.push([bron(new THREE.TubeGeometry(kromme, 24, 0.012, 4)), new THREE.Matrix4(), 0x050505]);
    }
    G.add(new THREE.Mesh(samen(vast, true), new THREE.MeshLambertMaterial({ vertexColors: true })));

    yield;
    // --- de piramide als ledobject: vier vlakken ledgaas (doorzichtig ledscherm met patronen: de dj staat erin), randen ledstrips,
    // scanringen, top ---
    const hoek = [[-B, -B], [B, -B], [B, B], [-B, B]].map(([x, z]) => new THREE.Vector3(x, 0, z)), apex = new THREE.Vector3(0, PH, 0);
    const pyrMat = LED.scherm({ palet: P4, maat: { w: 2 * B, h: Math.hypot(PH, B) }, zaad: zaad + 11, modi: ['patroon', 'golf'], helder: Z === 2 ? 0.3 : 0.38, pitch: 0.08 });
    // zwart = doorzichtig; alleen van buiten (de voorkant van de driehoeken wijst naar binnen): één laag gaas, en vanuit de booth vrij zicht
    Object.assign(pyrMat, { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide });
    {
      const pos = [], uv = [], nor = [];
      for (let i = 0; i < 4; i++) {
        const a = hoek[i], b = hoek[(i + 1) % 4], n = new THREE.Vector3((a.x + b.x) / 2, B * B / PH, (a.z + b.z) / 2).normalize();
        pos.push(a.x, 0.02, a.z, b.x, 0.02, b.z, 0, PH, 0); uv.push(0, 0, 1, 0, 0.5, 1); for (let k = 0; k < 3; k++) nor.push(n.x, n.y, n.z);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      const m = new THREE.Mesh(geo, pyrMat); m.renderOrder = 5; G.add(m);
    }
    // randen: ribben van de voet naar de top en de voet rondom, samen één draw
    LS.ledStrips(G, [0, 1, 2, 3].flatMap(r => { const a = hoek[r], b = hoek[(r + 1) % 4]; return [[a.x, 0.02, a.z, 0, PH, 0], [a.x, 0.03, a.z, b.x, 0.03, b.z]]; }),
      { palet: P4, zaad: zaad + 4, dik: 0.05, diep: 0.05 });
    // scanringen: vierkante lijsten die elke 8 tellen van de voet naar de top klimmen
    const ringGeo = samen([[bx, mat4(1, 0, 0, 0.02, 0.025, 2.02)], [bx, mat4(-1, 0, 0, 0.02, 0.025, 2.02)], [bx, mat4(0, 0, 1, 2.02, 0.025, 0.02)], [bx, mat4(0, 0, -1, 2.02, 0.025, 0.02)]]);
    const ringen = [];
    for (let i = 0; i < [3, 2, 1][Z]; i++) { const r = new THREE.Mesh(ringGeo, additief(0x000000)); G.add(r); ringen.push(r); }
    const topMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const top = new THREE.Mesh(new THREE.OctahedronGeometry(0.18), topMat); top.position.copy(apex); G.add(top);

    yield;
    // --- lamp: kale peer met gloed en (niet op minimaal) een lichtkegel over de dj ---
    const peer = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff2dd })); peer.position.set(0, LAMP_Y, 0); G.add(peer);
    const peerGloed = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex('gloed', 64, 64, tekenGloed), color: 0xffc890, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    peerGloed.position.copy(peer.position); peerGloed.scale.setScalar(0.9); G.add(peerGloed);
    // bundels: van de top omhoog en over het publiek (NTOP), plus de kegel van de kale lamp over de dj
    const NTOP = [6, 4, 3][Z], bundels = LS.bundels(G, NTOP + 1), TOPP = new THREE.Vector3(0, PH + 0.08, 0);
    const koppen = Array.from({ length: NTOP }, (_, i) => ({ dir: new THREE.Vector3(0, 1, 0), doel: new THREE.Vector3(), i }));
    const LAMPP = new THREE.Vector3(0, LAMP_Y - 0.05, 0), NEERV = new THREE.Vector3(0, -1, 0), WARM = new THREE.Color(1, 0.62, 0.3);
    const flares = LS.punten(G, 2, 0.9);  // de top en de lamp
    const lamp = ctx.licht(0xffb070, 2.4, 11, 0, LAMP_Y - 0.08, 0);
    const tegen = ctx.licht(NEON.getHex(), 1.0, 9, 0, 3.7, 0);  // piramidelicht vanuit de top op de binnenste kring

    yield;
    // --- draaiende platen, mixerknopjes, crossfader, monitorringen ---
    const plaatTex = tex('plaat', 256, 256, tekenPlaat), platen = [];
    for (const [dx, kleur] of [[-0.5, NEON.getHex()], [0.5, 0x22e0ff]]) {
      const p = new THREE.Mesh(new THREE.CircleGeometry(0.15, 32), new THREE.MeshBasicMaterial({ map: plaatTex, color: kleur }));
      p.position.set(dx - 0.03, TOP + 0.064, TZ); p.rotation.x = -Math.PI / 2; p.rotation.z = R() * RONDE;
      G.add(p); platen.push(p);
    }
    const knop = [];
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 3; r++) knop.push([cy, mat4(-0.105 + c * 0.07, TOP + 0.08, TZ - 0.14 + r * 0.065, 0.012, 0.02, 0.012)]);
      knop.push([bx, mat4(-0.105 + c * 0.07, TOP + 0.077, TZ + 0.08, 0.02, 0.014, 0.028)]);
    }
    const knopMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    G.add(new THREE.Mesh(samen(knop), knopMat));
    const xfader = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.014, 0.02), new THREE.MeshBasicMaterial({ color: 0xffe600 }));
    xfader.position.set(0, TOP + 0.077, TZ + 0.15); G.add(xfader);
    const torus = bron(new THREE.TorusGeometry(0.1, 0.012, 6, 28));
    const monMat = additief(0xffffff);
    G.add(new THREE.Mesh(samen([[torus, mat4(-1.12, DAIS + 1.0, TZ + 0.201, 1, 1, 1)], [torus, mat4(1.12, DAIS + 1.0, TZ + 0.201, 1, 1, 1)]]), monMat));
    // ledlijst om de verhoging en onder het tafelblad
    const led = [[bron(new THREE.RingGeometry(1.29 * Math.SQRT2, 1.35 * Math.SQRT2, 4, 1)), mat4(0, DAIS + 0.004, 0, 1, 1, 1, -Math.PI / 2, 0, Math.PI / 4)],
      [bx, mat4(0, TOP - 0.06, TZ - 0.281, 1.75, 0.018, 0.01)]];
    const ledMat = additief(0xffffff, { side: THREE.DoubleSide });
    G.add(new THREE.Mesh(samen(led), ledMat));
    // neonlijst om beide deuropeningen (2 x 2,6 m)
    const deur = [];
    for (const s of [-1, 1]) {
      const z0 = s * (D / 2 - 0.03);
      deur.push([bx, mat4(-1.05, 1.325, z0, 0.05, 2.65, 0.05)], [bx, mat4(1.05, 1.325, z0, 0.05, 2.65, 0.05)], [bx, mat4(0, 2.65, z0, 2.15, 0.05, 0.05)]);
    }
    const deurMat = additief(0xffffff);
    G.add(new THREE.Mesh(samen(deur), deurMat));

    yield;
    // --- neon: kelder-naam op de linkerwand, knipperend LIVE rechts, BLOODLINE op de tafel ---
    const bord = ctx.neon('DEEP BOILER', neonCss, 4.6, 1.15);
    if (bord) { bord.position.set(-W / 2 + 0.06, 3.25, 0); bord.rotation.y = Math.PI / 2; }
    const live = ctx.neon('● LIVE', '#ff2030', 1.5, 0.42);
    if (live) { live.position.set(W / 2 - 0.06, 3.45, 2.6); live.rotation.y = -Math.PI / 2; }
    const naam = ctx.neon('BLOODLINE', '#ff1f3d', 1.2, 0.3);
    if (naam) { naam.position.set(0, DAIS + 0.5, TZ - 0.29); naam.rotation.y = Math.PI; }

    // waas onder het plafond: vangt het licht van de bundels (de lichtvlekken op muren en vloer komen uit spots, zie update)
    const waas = [], waasTex = [];
    for (let i = 0; i < [6, 3, 0][Z]; i++) {
      const bronTex = waasTex[i % 3] || (waasTex[i % 3] = typeof smokeTex !== 'undefined' && smokeTex[i % 3] && smokeTex[i % 3].image ? new THREE.CanvasTexture(smokeTex[i % 3].image) : tex('gloed', 64, 64, tekenGloed));
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: bronTex, color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, rotation: rr(0, RONDE) }));
      sp.scale.setScalar(rr(3, 4.2)); G.add(sp);
      waas.push({ sp, a: rr(0, RONDE), r: rr(2.4, 5.2), y: rr(3.6, 5.4), v: rr(0.03, 0.07) * (R() < 0.5 ? -1 : 1) });
    }

    yield;
    // --- publiek: 3D-figuren in de binnenste kring (vrij van het looppad en de wachtplek) ---
    const kand = [], a0 = R() * RONDE, NK = 18;
    for (let i = 0; i < NK; i++) {
      const p = ringPunt(a0 + i / NK * RONDE + rr(-0.08, 0.08), rr(0.85, 1.3));
      if (routeAfstand(p) < 1.0 || afst(p, WACHT) < 1.3) continue;
      kand.push(p);
    }
    const N = Math.min([9, 5, 4][Z], kand.length), stap = kand.length / Math.max(1, N), gekozen = [];
    for (let i = 0; i < N; i++) gekozen.push(kand[Math.floor(i * stap)]);
    const ROLLEN = ['dans', 'juich', 'dans', 'staan', 'dans', 'juich', 'dans', 'staan', 'juich'];
    const figuren = [];
    for (let i = 0; i < gekozen.length; i++) {
      const p = gekozen[i], rol = ROLLEN[i % ROLLEN.length];
      const d = ctx.figuur({ x: p.x, z: p.z, face: Math.atan2(-p.x, DJZ - p.z) + rr(-0.35, 0.35), rol });
      if (!d) break;  // maximum van deze stand bereikt
      figuren.push({ d, rol });
    }
    // telefoons omhoog bij een paar juichers: gloeiend schermpje in de rechterhand (anders los boven het hoofd)
    const telTex = tex('telefoon', 64, 96, tekenTelefoon), telefoons = [];
    let nTel = [3, 2, 1][Z];
    for (const f of figuren) {
      if (!nTel || f.rol !== 'juich' || !f.d.root) continue;
      nTel--;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: telTex, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      let hand = null;
      if (f.d.body) f.d.body.traverse(o => { if (!hand && o.isBone && o.name === 'RightHand') hand = o; });
      const ws = new THREE.Vector3();
      if (hand) {
        f.d.root.updateWorldMatrix(true, true); hand.getWorldScale(ws);
        const k = Math.abs(ws.x) || 1;
        sp.position.set(0, 0.12 / k, 0); sp.scale.set(0.16 / k, 0.24 / k, 1); hand.add(sp);
      } else {
        f.d.root.updateWorldMatrix(true, false); f.d.root.getWorldScale(ws);
        const k = Math.abs(ws.y) || 1;
        sp.position.set(0.18 / k, 1.95 / k, 0.1 / k); sp.scale.set(0.16 / k, 0.24 / k, 1); f.d.root.add(sp);
      }
      telefoons.push({ sp, mat: sp.material, sx: sp.scale.x, sy: sp.scale.y, basis: rr(0.7, 1), flits: 0 });
    }

    yield;
    // --- achtergrondpubliek in de buitenste kringen: 3D-menigte van club/publiek.js, kijkt naar de piramide ---
    // rand van de neonkleur (piramide + lamp) vanuit het midden, tegenlicht van de muurvegen erachter
    const plekken = [], NS = window.clubPubliek && clubPubliek.maak ? clubPubliek.aantal(48) : 0;
    for (let poging = 0; plekken.length < NS && poging < 900; poging++) {
      const off = rr(1.45, 3.7), p = ringPunt(R() * RONDE, off);
      if (Math.abs(p.x) > W / 2 - 0.45 || Math.abs(p.z) > D / 2 - 0.45) continue;
      if (Math.abs(p.x) < 1.7 && Math.abs(p.z) > D / 2 - 1.8) continue;  // deuren vrij
      if (routeAfstand(p) < 0.75 || afst(p, WACHT) < 1.1) continue;
      if (plekken.some(s => afst(s, p) < 0.5) || gekozen.some(f => afst(f, p) < 0.72)) continue;
      plekken.push({ x: p.x, z: p.z, face: Math.atan2(-p.x, -p.z) + rr(-0.3, 0.3) });
    }
    const publiek = NS ? clubPubliek.maak(G, { plekken, vast: true, rnd: R, telefoons: 0.16, licht: { x: 0, y: 2.4, z: 0 },
      kleuren: { a: NEON, b: PAL[1], vul: PAL[2].clone().multiplyScalar(0.03) } }) : null;

    // telefoons boven de menigte: lichtpuntjes (meer in de break: het aanstekermoment), flitsjes van foto's in de drop
    const NTEL = Math.min(plekken.length, [40, 26, 14][Z]), telPunten = NTEL ? LS.punten(G, NTEL, 0.11) : null, tels = [];
    for (let i = 0; i < NTEL; i++) {
      const p = plekken[Math.floor(i * plekken.length / NTEL)], a = Math.atan2(-p.x, -p.z);
      telPunten.plek(i, p.x + Math.sin(a) * 0.25 + rr(-0.15, 0.15), rr(1.9, 2.3), p.z + Math.cos(a) * 0.25 + rr(-0.15, 0.15));
      tels.push({ drempel: R(), fase: R() * 10, flits: 0 });
    }
    const TELK = new THREE.Color(0.7, 0.82, 1);

    for (const g of bronnen) g.dispose();

    // --- elk beeld: de show ---
    const E = new THREE.Vector3();
    let ph = R() * RONDE;
    function update(dt, now) {
      const s = LS.stand(ctx.beat()), pos = s.pos, pu = s.kick, stand = s.stand;
      dt = Math.min(dt || 0, 0.1);
      const A = LS.kleur(PAL, 0), Bk = LS.kleur(PAL, 1), C = PAL[2], wit = s.flits > 0.5;
      spots.begin();
      // gloed van de piramide op de vloer en de onderkant van de muren, de lichtpoel van de kale lamp om de dj
      spots.zet(0, 0.4, 0, 7.6, stand === 'break' ? C : A, (0.05 + 0.1 * pu) * s.niv);
      const lampK = stand === 'break' ? 0.55 : stand === 'drop' ? 0.25 : 0.32 + 0.12 * pu;
      spots.zet(0, DAIS, 0, 1.4, WARM, lampK);

      // --- bundels uit de top: kroon (draaiend, schuin omhoog), golf, laag over het publiek, zuil (recht omhoog) ---
      ph += s.dPos * Math.PI / 8 * s.tempo;  // groove: de kroon draait een rondje per 4 maten
      const vorm = stand === 'break' ? 'zuil' : stand === 'opbouw' ? (s.opb < 0.6 ? 'kroon' : 'zuil')
        : stand === 'drop' ? (s.k < 4 ? 'publiek' : ['kroon', 'golf', 'publiek', 'kroon'][Math.floor(pos / 4) % 4])
          : ['kroon', 'golf', 'publiek', 'zuil'][Math.floor(pos / 16) % 4];
      const snel = stand === 'drop' ? 9 : stand === 'break' ? 1 : 3 + 4 * s.opb;
      for (const h of koppen) {
        const i = h.i, a = ph + i * RONDE / NTOP;
        const e = vorm === 'zuil' ? 1.22 + 0.12 * Math.sin(ph * 2 + i) : vorm === 'golf' ? 0.45 + 0.4 * Math.sin(ph * 3 + i * 1.7)
          : vorm === 'publiek' ? -0.08 + 0.12 * Math.sin(pos * Math.PI / 2 + i) : 0.55 + 0.1 * Math.sin(ph);
        h.doel.set(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e));
        h.dir.lerp(h.doel, 1 - Math.exp(-snel * dt)).normalize();
        let k, c;
        if (stand === 'break') { k = i === 0 ? 0.55 + 0.15 * Math.sin(now * 0.8) : 0; c = C; }
        else if (stand === 'opbouw') { const loop = Math.floor(pos * (s.opb < 0.5 ? 1 : 2)) % NTOP; k = (s.opb < 0.7 ? (i === loop ? 1 : 0.15) : 1) * (0.4 + 0.8 * s.opb); c = i % 2 ? Bk : A; }
        else if (stand === 'drop') { k = (1.2 + 0.8 * s.knal) * (s.k < 4 ? 0.5 + 0.5 * Math.exp(-s.fase * 5) : 0.85 + 0.3 * pu); c = (i + s.tel) % 2 ? Bk : A; }
        else { k = (0.6 + 0.4 * (i % 2 ? pu : 1 - s.fase)) * (0.75 + 0.25 * s.en); c = i % 2 ? Bk : A; }
        if (wit) { c = LS.wit; k = Math.max(k, 1.4 * s.flits); }
        const len = LS.raak(TOPP, h.dir, W, D, H), rad = 0.05 + len * 0.055;
        bundels.zet(i, TOPP, h.dir, len, rad, c, k);
        if (k > 0.02) { E.copy(TOPP).addScaledVector(h.dir, len); spots.zet(E.x, E.y, E.z, rad * 1.6 + 0.45, c, 0.6 * Math.min(1.4, k)); }
      }
      bundels.zet(NTOP, LAMPP, NEERV, LAMP_Y - DAIS - 0.05, 0.85, WARM, lampK * 0.8);  // de kegel van de kale lamp
      bundels.klaar(now);
      flares.zet(0, 0, PH + 0.06, 0, stand === 'break' ? C : wit ? LS.wit : A, (1 + 1.2 * pu) * Math.max(0.35, s.niv));
      flares.zet(1, LAMPP.x, LAMP_Y, LAMPP.z, WARM, 0.5 + 0.6 * lampK);
      flares.klaar();
      spots.vul(stand === 'break' ? C : A, 0.012 * s.niv);
      spots.flits(LS.wit, s.flits * 0.25);

      // piramide: scanringen, top (vlakken en randen zijn leds: die lopen zelf op de tel)
      ringen.forEach((r, i) => {
        const u = ((pos / (stand === 'drop' ? 4 : 8) + i / ringen.length) % 1 + 1) % 1, y = u * PH * 0.97, sc = B * (1 - y / PH) + 0.02;
        r.position.y = y; r.scale.set(sc, 1, sc);
        r.material.color.copy(stand === 'break' ? C : Bk).multiplyScalar(Math.sin(Math.PI * u) * (0.35 + 0.8 * pu) * s.niv);
      });
      top.rotation.y += dt * (0.6 + 1.5 * s.tempo); top.scale.setScalar(1 + 0.25 * pu);
      topMat.color.copy(stand === 'break' ? C : A).multiplyScalar((0.8 + 0.8 * pu) * Math.max(0.4, s.niv));
      // lampen (figuren): de kale lamp warm, het piramidelicht in de kleur van de tel, wit bij een flits
      if (lamp) lamp.intensity = 1.0 * (0.8 + 0.3 * pu);
      if (tegen) { if (wit) { tegen.color.setRGB(1, 1, 1); tegen.intensity = 3 * s.flits; } else { tegen.color.copy(A); tegen.intensity = (0.3 + 0.8 * pu) * s.niv; } }
      peerGloed.scale.setScalar(0.9 * (1 + 0.35 * pu));
      ledMat.color.copy(A).multiplyScalar((0.4 + 0.8 * pu) * s.niv);
      deurMat.color.copy(Bk).multiplyScalar(0.25 + 0.2 * pu);
      monMat.color.copy(A).multiplyScalar((0.3 + 0.8 * s.bas) * s.niv);
      knopMat.color.copy(Bk).multiplyScalar(0.4 + 0.4 * pu);
      if (live) live.visible = (now % 1.5) < 1.05;
      // draaitafels: 33 toeren, crossfader schuift op de tel
      for (const p of platen) p.rotation.z -= dt * 3.49;
      xfader.position.x = 0.07 * Math.sin(pos * Math.PI * 0.5);
      // waas drijft langzaam rond en vangt het licht van de bundels
      for (const w of waas) {
        w.a += dt * w.v;
        w.sp.position.set(Math.cos(w.a) * w.r, w.y + 0.12 * Math.sin(now * 0.3 + w.r), Math.sin(w.a) * w.r);
        w.sp.material.color.copy(wit ? LS.wit : A).multiplyScalar((0.05 + 0.1 * pu) * s.niv + 0.25 * s.flits);
        w.sp.material.rotation += dt * 0.02;
      }
      // achtergrondpubliek: silhouetten met een rand van piramidelicht (a) en bundellicht (b), flitst mee met de strobe
      if (publiek) publiek.zet({ a: stand === 'break' ? C : A, b: Bk, helder: 0.25 + 0.25 * s.niv, flits: s.flits * 0.6, rand: 0.6 + 0.7 * s.niv });
      // telefoons boven de menigte
      if (telPunten) {
        const deel = stand === 'break' ? 0.75 : stand === 'opbouw' ? 0.3 + 0.45 * s.opb : stand === 'drop' ? 0.5 : 0.22, kans = stand === 'drop' ? 0.25 : 0.03;
        for (let i = 0; i < NTEL; i++) {
          const t = tels[i];
          if (t.flits > 0) t.flits -= dt; else if (Math.random() < dt * kans) t.flits = 0.07;
          const k = t.drempel < deel ? (t.flits > 0 ? 3 : 0.5 + 0.12 * Math.sin(now * 2 + t.fase)) : 0;
          telPunten.kleur(i, TELK, k);
        }
        telPunten.klaar();
      }
      // telefoons van de 3D-figuren: zacht flakkerend scherm, af en toe een flits
      for (const t of telefoons) {
        if (t.flits > 0) t.flits -= dt; else if (Math.random() < dt * 0.1) t.flits = 0.08;
        const k = t.flits > 0 ? 3 : t.basis * (0.85 + 0.15 * Math.sin(now * 2.5 + t.basis * 9));
        t.mat.color.setRGB(0.8 * k, 0.86 * k, k);
        const z = t.flits > 0 ? 1.6 : 1; t.sp.scale.set(t.sx * z, t.sy * z, 1);
      }
    }

    // --- camera ---
    // in: achter de loper aan naar binnen; schouder: laag over de schouder van de dj de kring in, langzaam zwaaiend;
    // tegen: vanuit het publiek tegen de piramide in; totaal: hoog uit een hoek op de piramide; uit (na BLIJF): achter de loper aan naar de uitgang
    const camP = new THREE.Vector3(), camL = new THREE.Vector3(), lp = new THREE.Vector3(), vA = new THREE.Vector3(), vB = new THREE.Vector3(), richting = new THREE.Vector3(0, 0, 1);
    const uit = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 62 };
    const zwaaiFase = rr(0, RONDE);
    let vorigeFase = '', vorigeK = -1, vorigeT = 0;
    function loperLokaal(loper, out) {
      if (!loper) return null;
      const o = loper.root || loper;
      if (o.isVector3) out.copy(o);
      else if (o.getWorldPosition) o.getWorldPosition(out);
      else if (o.position) out.copy(o.position);
      else return null;
      return G.worldToLocal(out);
    }
    // richting langs de route: naar het routepunt na het dichtstbijzijnde stuk
    function vooruit(p, out) {
      let best = 1e9, j = 0;
      for (let i = 0; i < ROUTE.length - 1; i++) {
        const a = ROUTE[i], b = ROUTE[i + 1], dx = b.x - a.x, dz = b.z - a.z;
        const u = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
        const e = Math.hypot(a.x + dx * u - p.x, a.z + dz * u - p.z);
        if (e < best) { best = e; j = i; }
      }
      let t = ROUTE[j + 1];
      if (Math.hypot(t.x - p.x, t.z - p.z) < 0.8 && j + 2 < ROUTE.length) t = ROUTE[j + 2];
      out.set(t.x - p.x, 0, t.z - p.z);
      return out.lengthSq() < 1e-4 ? out.set(0, 0, 1) : out.normalize();
    }
    function binnen(v) {  // camera in de kelder houden (in de deuropening mag hij er even buiten)
      const deurlijn = Math.abs(v.x) < 0.9;
      v.x = Math.max(-W / 2 + 0.35, Math.min(W / 2 - 0.35, v.x));
      v.z = deurlijn ? Math.max(-D / 2 - 1, Math.min(D / 2 + 1, v.z)) : Math.max(-D / 2 + 0.35, Math.min(D / 2 - 0.35, v.z));
      v.y = Math.max(0.5, Math.min(H - 0.3, v.y));
      return v;
    }
    function cam(t, loper) {
      G.updateWorldMatrix(true, false);
      const dt = Math.max(0, Math.min(0.1, t - vorigeT)); vorigeT = t;
      let fase, k = 0, ts = 0;
      if (t < T_IN) fase = 'in';
      else if (t >= BLIJF) fase = 'uit';
      else { k = Math.floor((t - T_IN) / CYCLUS); ts = t - T_IN - k * CYCLUS; fase = ts < SCHOUDER ? 'schouder' : ts < SCHOUDER + VOOR ? 'voor' : ts < SCHOUDER + VOOR + TEGEN ? 'tegen' : 'totaal'; }
      const nieuw = fase !== vorigeFase || k !== vorigeK; vorigeFase = fase; vorigeK = k;
      if (fase === 'in' || fase === 'uit') {
        if (loperLokaal(loper, lp)) {
          vooruit(lp, vA);
          if (nieuw || richting.lengthSq() < 0.01) richting.copy(vA); else richting.lerp(vA, 1 - Math.exp(-3 * dt)).normalize();
          vB.copy(lp).addScaledVector(richting, -2.5); vB.y = 1.8;
          vA.copy(lp).addScaledVector(richting, 2.2); vA.y = 1.15;
        } else if (fase === 'in') { vB.set(0, 1.8, -D / 2 + 0.8); vA.set(0, 1.3, 0); }  // geen loper: vanuit de ingang de kelder in
        else { vB.set(0, 1.8, D / 2 - 3.2); vA.set(0, 1.3, D / 2 + 2); }
        binnen(vB);
        if (nieuw) { camP.copy(vB); camL.copy(vA); }
        else { const f = 1 - Math.exp(-4 * dt); camP.lerp(vB, f); camL.lerp(vA, f); }
        uit.fov = 62;
      } else if (fase === 'schouder') {
        // hoek 0 = achter de dj (hij kijkt naar -z); de camera zwaait van links via achter naar rechts, iets over zijn rechterschouder
        // R0/zij: 0,85 m achter en 0,58 m naast hem (verder kan niet: glas van de piramide), dj aan de rand van het beeld i.p.v. zijn rug ervoor
        const th = 1.55 * Math.sin(ts * 0.19 + k * 2.4 + zwaaiFase), s = Math.sin(th), c = Math.cos(th), R0 = 0.85, zij = 0.58;
        camP.set(s * R0 + c * zij, CAMY + 0.04 * Math.sin(t * 0.8), DJZ + c * R0 - s * zij);
        camL.set(-s * 6 - c * zij * 0.8 + 0.03 * Math.sin(t * 1.7), 1.75 + 0.02 * Math.sin(t * 2.3), DJZ - c * 6 + s * zij * 0.8);  // beetje handheld, iets omhoog: de bundels boven de kring
        uit.fov = 66;
      } else if (fase === 'voor') {
        // boven de hoofden aan de ingangskant, schuin op de dj: hij staat als silhouet voor het grote ledscherm (naast de deur, niet ervoor)
        const kant = k % 2 ? -1 : 1, u = ts - SCHOUDER;
        camP.set(kant * (2.4 - 0.08 * u), 2.45 + 0.04 * Math.sin(t * 0.7), -6.2 + 0.12 * u);
        camL.set(-kant * 1.3, 2.3 + 0.05 * Math.sin(t * 0.5), D / 2);
        uit.fov = 58;
      } else if (fase === 'tegen') {
        // vanuit het publiek (rechterhelft, het looppad ligt links) tegen de piramide in: silhouetten tegen de ribben en bundels
        const u = ts - SCHOUDER - VOOR, a = (k % 2 ? 0.75 : -0.75) + (k % 2 ? -1 : 1) * u * 0.06, r = 5.5 - 0.15 * u;
        camP.set(Math.cos(a) * r, 1.3 + 0.05 * Math.sin(t * 0.9), Math.sin(a) * r);
        camL.set(0, 2.5 + 0.2 * Math.sin(t * 0.37), 0);
        uit.fov = 62;
      } else {
        const kant = k % 2 ? -1 : 1, a = kant * Math.PI / 4 - kant * (ts - SCHOUDER - VOOR - TEGEN) * 0.05;
        camP.set(Math.cos(a) * 7.2, H - 1.1, Math.sin(a) * 7.2);
        camL.set(0, 1.5, 0);
        uit.fov = 70;
      }
      uit.pos.copy(camP); G.localToWorld(uit.pos);
      uit.look.copy(camL); G.localToWorld(uit.look);
      return uit;
    }

    function opruimen() {
      if (publiek) publiek.opruimen();
      for (const t of telefoons) { if (t.sp.parent) t.sp.parent.remove(t.sp); t.mat.dispose(); }
      telefoons.length = 0;
      telTex.dispose();
    }

    return { maat: { w: W, d: D, h: H }, route: ROUTE.map(p => ({ x: p.x, z: p.z })), blijf: BLIJF, cam, update, opruimen, publiek };
  }

  doolhof.registreer('boiler', { gewicht: 1.5, maak });
})();

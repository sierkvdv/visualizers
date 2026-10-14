// --- Zaal 2, kunst en sfeer: paddenstoelen in de hoeken, een oog met mandala boven de vloer, vloerringen op de tel, vuurvliegjes en tentakels aan het plafond ---
(() => {
  const CX = Z2.x, CZ = Z2.z, H = Z2.h;
  // gedeelde uniforms: één keer per frame bijwerken, alle shaders hieronder lezen dezelfde objecten
  const U = { time: { value: 0 }, pulse: { value: 0 }, energy: { value: 0 }, bass: { value: 0 }, mid: { value: 0 }, high: { value: 0 }, beat: { value: 0 }, sway: { value: 0 } };
  const uni = own => Object.assign({}, U, own);
  const ADD = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };
  const LIB = `
    vec3 hsv(float h, float s, float v) { vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); return v * mix(vec3(1.0), k, s); }
    float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }`;
  const VS_RIM = `varying vec3 vP; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    void main() { vP = position; vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalMatrix * normal; vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`;
  const VS_UV = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
  const VS_XY = 'varying vec2 vXY; void main() { vXY = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
  // zachte witte gloeivlek (voor halo en lichtplekken op de vloer)
  const glowTex = canvasTexture(128, 128, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const flatGlow = (r, color, x, y, z) => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 40), Object.assign(additive(color, 0.3), { map: glowTex }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); zone2.add(m); return m;
  };
  const BEAD = new THREE.IcosahedronGeometry(1, 1);

  // 1. Paddenstoelen: vier clusters in de hoeken; donkere hoed met stippen die op de tel oplichten, gloeiende lamellen eronder
  const capFS = `uniform float time, pulse, energy, high, beat, hue, seed, flash;
    varying vec3 vP; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    ${LIB}
    void main() {
      float rim = pow(max(0.0, 1.0 - abs(dot(normalize(vN), normalize(vV)))), 2.0);
      float h = hue + 0.04 * sin(time * 0.3 + seed);
      vec3 col;
      if (vUv.y < 0.375) {  // onderkant: lamellen die van binnenuit gloeien
        float g = pow(abs(sin(vUv.x * 150.796)), 6.0);
        col = hsv(h + 0.1, 0.8, 0.1) + hsv(h + 0.15, 0.6, 1.0) * g * (vUv.y / 0.375) * (0.25 + 0.5 * pulse + 0.6 * flash);
      } else {  // bovenkant: stippen op een 3D-raster, een deel licht op elke tel op
        vec3 q = vP * 4.5 + seed;
        vec3 ci = floor(q);
        float r1 = hash(ci), r2 = hash(ci + 7.31);
        vec3 f = fract(q) - 0.5 - (vec3(hash(ci + 1.7), hash(ci + 3.1), hash(ci + 5.3)) - 0.5) * 0.2;
        float rr = 0.14 + 0.13 * r2;
        float spot = (1.0 - smoothstep(rr - 0.05, rr, length(f))) * step(0.3, r1);
        float tw = 0.5 + 0.5 * sin(time * (1.5 + 2.0 * r2) + r1 * 40.0);
        float on = step(0.55, fract(r1 * 13.7 + floor(beat) * 0.618));
        float sb = 0.35 + 0.35 * tw + 0.9 * pulse * on + 0.9 * flash;
        float t = (vUv.y - 0.375) / 0.625, dw = t - fract(beat);
        float wave = exp(-dw * dw * 70.0) * (0.15 + 0.5 * energy);  // lichtring die elke tel van de rand naar de top kruipt
        col = hsv(h, 0.95, 0.2 + 0.12 * energy) * (1.0 - 0.4 * t)
            + mix(hsv(h + 0.45, 0.6, 1.0), vec3(1.0), 0.35 * pulse * on) * spot * sb
            + hsv(h + 0.08, 0.7, 1.0) * wave;
      }
      col += hsv(h - 0.06, 0.6, 1.0) * rim * (0.35 + 0.5 * high + 0.5 * flash);
      gl_FragColor = vec4(col, 1.0);
    }`;
  const stemFS = `uniform float time, energy, beat, hue, flash;
    varying vec3 vP; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    ${LIB}
    void main() {
      float t = vUv.y;
      float rim = pow(max(0.0, 1.0 - abs(dot(normalize(vN), normalize(vV)))), 1.6);
      float fib = pow(abs(sin(vUv.x * 75.398 + sin(t * 9.0) * 0.5)), 10.0);
      float du = t - fract(beat * 0.5), up = exp(-du * du * 60.0);  // sap dat om de twee tellen omhoog stroomt
      vec3 col = hsv(hue - 0.05, 0.35, 0.14 + 0.08 * t) + hsv(hue, 0.5, 1.0) * (fib * 0.12 + rim * 0.35)
               + hsv(hue + 0.1, 0.7, 1.0) * up * (0.3 + 0.6 * energy + 0.6 * flash);
      gl_FragColor = vec4(col, 1.0);
    }`;
  const STEM = lathe([[1.25, 0], [1.4, 0.025], [1.25, 0.07], [1, 0.2], [0.85, 0.5], [0.78, 0.8], [0.82, 0.95], [0.9, 1]], 16);
  const CAP = lathe([[0, 0.03], [0.4, 0.05], [0.8, 0.1], [1, 0.17], [0.97, 0.28], [0.86, 0.45], [0.66, 0.62], [0.36, 0.75], [0, 0.8]], 32);  // punt 0-3 = onderkant (uv.y < 0,375)
  // [ox, oz, steelhoogte, hoedstraal, hoedvorm (y-schaal), steeldikte]; ox/oz = afstand vanaf het midden richting de hoek (hoek = 8, 8)
  const SHROOMS = [[7.0, 7.0, 2.85, 0.8, 0.8, 0.13], [5.95, 7.2, 1.95, 0.6, 1.0, 0.09], [7.25, 5.9, 1.45, 0.5, 1.35, 0.075], [6.3, 6.15, 0.95, 0.36, 0.7, 0.055],
    [5.8, 6.35, 0.42, 0.2, 1.0, 0.035], [6.65, 5.75, 0.32, 0.17, 1.2, 0.03], [7.55, 6.55, 0.55, 0.24, 0.9, 0.04]];
  const CORNERS = [[-1, -1, 0.86], [1, -1, 0.52], [1, 1, 0.76], [-1, 1, 0.06]];  // [teken x, teken z, kleur]; volgorde = rondje, zo lichten ze om de beurt op
  const flashes = [], caps = [], cornerGlows = [];
  CORNERS.forEach(([sx, sz, hue], c) => {
    const flash = { value: 0 }; flashes.push(flash);
    SHROOMS.forEach(([a, b, sh, R, ky, th], i) => {
      const swap = sx * sz < 0, ox = swap ? b : a, oz = swap ? a : b, stemH = sh * rnd(0.9, 1.03), lean = rnd(0.03, 0.08);
      const own = { hue: { value: hue + (i % 3 === 2 ? 0.12 : rnd(-0.04, 0.04)) }, seed: { value: rnd(0, 10) }, flash };
      const g = new THREE.Group(); g.position.set(CX + sx * ox, 0, CZ + sz * oz);
      g.rotation.set(-sz * lean, 0, sx * lean);  // leunt een beetje naar het midden van de zaal
      add(g, STEM, new THREE.ShaderMaterial({ uniforms: uni(own), vertexShader: VS_RIM, fragmentShader: stemFS, side: THREE.DoubleSide }), [0, 0, 0], [th, stemH, th]);
      const cap = add(g, CAP, new THREE.ShaderMaterial({ uniforms: uni(own), vertexShader: VS_RIM, fragmentShader: capFS, side: THREE.DoubleSide }), [0, stemH - 0.03 * R * ky - 0.01, 0], [R, R * ky, R]);
      cap.userData = { R, ky, c }; caps.push(cap);
      zone2.add(g);
    });
    cornerGlows.push(flatGlow(1.45, new THREE.Color().setHSL(hue, 1, 0.5), CX + sx * 6.55, 0.045, CZ + sz * 6.55));  // lichtplas onder het cluster
  });

  // 2. Het oog: reuzenoogbol boven het midden die de camera volgt, gyroscoopringen, satellietjes en een mandala tegen het plafond
  const eyeFS = `uniform float time, pulse, bass, high, lid;
    varying vec3 vP; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    ${LIB}
    void main() {
      vec3 p = normalize(vP);
      float d = acos(clamp(p.z, -1.0, 1.0)), a = atan(p.y, p.x);  // hoek vanaf de kijkrichting (+z) en rond die as
      float pr = 0.19 + 0.14 * bass, ir = 0.62;
      // oogwit: diep paars met gloeiende adertjes
      float v1 = pow(max(0.0, 1.0 - abs(sin(a * 5.0 + sin(d * 7.0 + time * 0.6) * 0.8))), 40.0);
      float v2 = pow(max(0.0, 1.0 - abs(sin(a * 9.0 + 1.3 + sin(d * 11.0 - time * 0.4) * 0.6))), 60.0);
      vec3 col = hsv(0.76, 0.7, 0.15) + hsv(0.93 + 0.08 * sin(time * 0.3), 0.85, 1.0) * (v1 + 0.7 * v2)
               * smoothstep(ir, ir + 0.3, d) * (1.0 - smoothstep(1.3, 2.6, d)) * (0.45 + 0.9 * pulse);
      // iris: regenboogringen met vezels, gloeirand om de pupil
      float st = 0.5 + 0.5 * sin(a * 42.0 + sin(d * 25.0 + time) * 1.5);
      vec3 ic = hsv(fract(time * 0.05 + d * 1.6), 0.85, 1.0) * (0.4 + 0.6 * st) * (0.75 + 0.6 * pulse);
      ic += hsv(fract(time * 0.05 + 0.5), 0.4, 1.0) * exp(-abs(d - pr - 0.03) * 40.0) * 0.8;
      ic *= 1.0 - 0.75 * smoothstep(ir - 0.1, ir, d);
      col = mix(ic, col, smoothstep(ir - 0.01, ir + 0.01, d));
      // pupil: donker gat met een trage spiraal, zet uit op de bas
      vec3 pc = hsv(fract(time * 0.1), 0.8, 0.12) * (0.5 + 0.5 * sin(d * 90.0 - a * 3.0 - time * 5.0));
      col = mix(col, pc, 1.0 - smoothstep(pr - 0.015, pr + 0.015, d));
      col += vec3(1.0) * exp(-length(p.xy - vec2(-0.17, 0.19)) * 30.0) * step(0.0, p.z) * 0.9;  // glinstering
      float rim = pow(max(0.0, 1.0 - abs(dot(normalize(vN), normalize(vV)))), 2.5);
      col += hsv(0.55 + 0.1 * sin(time * 0.2), 0.8, 1.0) * rim * (0.3 + 0.6 * high);
      // oogleden: knipperen van boven en onder naar het midden
      float th = 1.05 * (1.0 - lid);
      col = mix(col, hsv(0.82, 0.7, 0.1), step(th, abs(p.y)));
      col += hsv(0.9, 0.6, 1.0) * exp(-abs(abs(p.y) - th) * 45.0) * min(1.0, lid * 8.0);
      gl_FragColor = vec4(col, 1.0);
    }`;
  const mandalaFS = `uniform float time, pulse, energy, mid, high, beat;
    varying vec2 vUv;
    ${LIB}
    void main() {
      vec2 p = (vUv - 0.5) * 2.0;
      float r = length(p);
      if (r > 1.0) discard;
      float a = atan(p.y, p.x), s1 = 6.2831853 / 12.0, s2 = 6.2831853 / 8.0;
      float a1 = mod(a + time * 0.15, s1) - s1 * 0.5, a2 = mod(a - time * 0.09, s2) - s2 * 0.5;  // twaalf en acht bladen, tegen elkaar in draaiend
      float c1 = max(0.0, cos(a1 / s1 * 3.14159)), c2 = max(0.0, cos(a2 / s2 * 3.14159));
      float l1 = exp(-abs(r - (0.22 + 0.42 * c1 * c1 * (0.9 + 0.2 * pulse))) * 70.0);
      float l2 = exp(-abs(r - (0.45 + 0.4 * c2 * c2 * c2)) * 55.0);
      float rings = pow(0.5 + 0.5 * cos(r * 46.0 - time * 1.6), 16.0) * (1.0 - smoothstep(0.7, 0.98, r)) * 0.45;
      float dots = 1.0 - smoothstep(0.012, 0.03, length(vec2(sin((a + time * 0.06) * 24.0) * 0.042, r - 0.9)));
      float dw = r - fract(beat), wave = exp(-dw * dw * 260.0) * (0.25 + 0.9 * pulse);  // golf die elke tel naar buiten loopt
      float hue = fract(r * 0.7 - time * 0.04 + abs(a1) * 0.8);
      vec3 col = hsv(hue, 0.85, 1.0) * (l1 * (0.55 + 0.7 * mid) + rings) + hsv(hue + 0.33, 0.8, 1.0) * l2 * (0.45 + 0.7 * high);
      col += hsv(hue + 0.5, 0.4, 1.0) * dots * (0.35 + 1.0 * pulse) + vec3(0.9, 0.8, 1.0) * wave;
      col += hsv(0.78, 0.9, 0.07) * (1.0 - r);
      col *= (1.0 - smoothstep(0.92, 1.0, r)) * (0.6 + 0.5 * energy);
      gl_FragColor = vec4(col, 1.0);
    }`;
  const EYE_Y = 3.95;
  const eyeMat = new THREE.ShaderMaterial({ uniforms: uni({ lid: { value: 0 } }), vertexShader: VS_RIM, fragmentShader: eyeFS });
  const eye = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), eyeMat);
  eye.position.set(CX, EYE_Y, CZ); eye.scale.setScalar(0.42); zone2.add(eye);
  const aim = new THREE.Object3D(), aimAt = new THREE.Vector3(), sacc = new THREE.Vector3();
  aim.position.copy(eye.position); aim.lookAt(CX, 1.7, TUN_END); eye.quaternion.copy(aim.quaternion);  // begint naar de gang te staren
  const halo = new THREE.Sprite(new THREE.SpriteMaterial(Object.assign({ map: glowTex, color: 0xff60ff }, ADD)));
  halo.scale.set(1.5, 1.5, 1); halo.position.copy(eye.position); zone2.add(halo);
  // gyroscoop: drie dunne ringen die elk om een eigen as tollen, sneller bij energie
  const gyro = new THREE.Group(); gyro.position.copy(eye.position); zone2.add(gyro);
  const AXES = [[1, 0.3, 0], [0.2, 1, 0.4], [0.5, -0.3, 1]];
  const gRings = [0.5, 0.58, 0.66].map((R, i) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(R, 0.016, 6, 90), additive(0xffffff, 0.9));
    m.rotation.set(rnd(0, Math.PI), rnd(0, Math.PI), 0);
    m.userData = { axis: new THREE.Vector3(...AXES[i]).normalize(), sp: (i % 2 ? -1 : 1) * rnd(0.5, 0.9) };
    gyro.add(m); return m;
  });
  const beads = [];
  for (let i = 0; i < 7; i++) {
    const m = add(gyro, BEAD, additive(new THREE.Color().setHSL(i / 7, 1, 0.65), 1), [0, 0, 0], [0.04, 0.04, 0.04]);
    m.userData = { a: i * TAU / 7, w: rnd(0.6, 1.1) * (i % 2 ? 1 : -1), tilt: rnd(-0.35, 0.35), R: rnd(0.82, 0.98) };
    beads.push(m);
  }
  const mandala = new THREE.Mesh(new THREE.CircleGeometry(3.3, 96), new THREE.ShaderMaterial(Object.assign({ uniforms: U, vertexShader: VS_UV, fragmentShader: mandalaFS }, ADD)));
  mandala.position.set(CX, H - 0.22, CZ); mandala.rotation.x = Math.PI / 2; zone2.add(mandala);  // plat tegen het plafond, kijkt naar beneden
  const eyeLight = new THREE.PointLight(0xff40ff, 1, 11, 1.4); eyeLight.position.set(CX, EYE_Y - 0.6, CZ); zone2.add(eyeLight);  // kleurt de dansers van boven op de tel
  const centerGlow = flatGlow(1.9, 0xff40ff, CX, 0.04, CZ);

  // 3. Vloerringen: bij elke tel dijt er een ring uit vanuit het midden (pool van 8, de oudste wordt hergebruikt)
  const ringFS = `uniform vec3 color; uniform float alpha, dash, spin;
    varying vec2 vXY;
    void main() {
      float t = clamp((length(vXY) - 0.9) / 0.1, 0.0, 1.0);
      float prof = smoothstep(0.0, 0.8, t) * (1.0 - smoothstep(0.82, 1.0, t));
      float f = fract(atan(vXY.y, vXY.x) * 5.7296 + spin);
      float m = mix(1.0, smoothstep(0.15, 0.3, f) * (1.0 - smoothstep(0.7, 0.85, f)), dash);
      gl_FragColor = vec4(color * prof * m * alpha, 1.0);
    }`;
  const RING = new THREE.RingGeometry(0.9, 1, 128, 1);
  const rings = [];
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(RING, new THREE.ShaderMaterial(Object.assign({
      uniforms: { color: { value: new THREE.Color() }, alpha: { value: 0 }, dash: { value: 0 }, spin: { value: 0 } },
      vertexShader: VS_XY, fragmentShader: ringFS }, ADD)));  // enkelzijdig (kijkt omhoog): doorzichtig + DoubleSide kost in r128 twee tekenrondes
    m.rotation.x = -Math.PI / 2; m.position.set(CX, 0.03, CZ); m.visible = false;
    m.userData = { age: 9, k: 0, dir: 1 }; zone2.add(m); rings.push(m);
  }
  let T = 0;
  function spawnRing(b) {
    const m = rings.reduce((o, r) => (r.userData.age > o.userData.age ? r : o)), u = m.material.uniforms, down = b % 4 === 0;
    m.userData.age = 0; m.userData.k = (down ? 1.25 : 0.7) * (0.55 + 0.6 * energy); m.userData.dir = Math.random() < 0.5 ? -1 : 1;
    u.dash.value = b % 2 ? 1 : 0; u.spin.value = Math.random();
    u.color.value.setHSL((b * 0.09 + T * 0.01) % 1, down ? 0.6 : 1, down ? 0.75 : 0.55);  // eerste tel van de maat: lichter, bijna wit
    m.scale.set(0.45, 0.45, 1); m.visible = true;
  }

  // 4. Vuurvliegjes: 400 zwevende lichtpuntjes; beweging, knipperen en kleur zitten helemaal in de shader
  const fliesVS = `uniform float time, pulse, beat, scale;
    attribute vec4 seed;
    varying vec3 vCol; varying float vA;
    ${LIB}
    void main() {
      vec3 p = position;
      float t = time * (0.15 + 0.25 * seed.y);
      p.x += sin(t * 1.3 + seed.x * 6.28) * 0.9 + sin(t * 2.9 + seed.z * 9.0) * 0.25;
      p.y += sin(t * 1.7 + seed.w * 6.28) * 0.35;
      p.z += cos(t * 1.1 + seed.x * 4.0) * 0.9 + cos(t * 2.3 + seed.y * 7.0) * 0.25;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      float tw = 0.5 + 0.5 * sin(time * (1.5 + 3.0 * seed.z) + seed.w * 40.0);
      float on = step(0.6, fract(seed.x * 17.3 + floor(beat) * 0.37));  // per tel licht een ander deel extra op
      vA = 0.2 + 0.8 * tw * tw + 1.2 * pulse * on;
      vCol = hsv(fract(0.78 + seed.w * 0.25 + time * 0.012), 0.75, 1.0);
      gl_PointSize = clamp((0.035 + 0.06 * seed.z) * (1.0 + 0.6 * pulse * on) * scale / max(0.1, -mv.z), 1.0, 40.0);
      gl_Position = projectionMatrix * mv;
    }`;
  const fliesFS = `varying vec3 vCol; varying float vA;
    void main() {
      vec2 q = gl_PointCoord - 0.5;
      float d = dot(q, q) * 4.0;
      if (d > 1.0) discard;
      gl_FragColor = vec4(vCol * (exp(-d * 5.0) + 0.5 * exp(-d * 40.0)) * vA, 1.0);
    }`;
  const NF = 400, fPos = new Float32Array(NF * 3), fSeed = new Float32Array(NF * 4);
  for (let i = 0; i < NF; i++) {
    fPos.set([CX + rnd(-6.7, 6.7), rnd(0.45, 4.35), CZ + rnd(-6.7, 6.7)], i * 3);
    fSeed.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
  }
  const fGeo = new THREE.BufferGeometry();
  fGeo.setAttribute('position', new THREE.BufferAttribute(fPos, 3)); fGeo.setAttribute('seed', new THREE.BufferAttribute(fSeed, 4));
  const flies = new THREE.Points(fGeo, new THREE.ShaderMaterial(Object.assign({ uniforms: uni({ scale: { value: 800 } }), vertexShader: fliesVS, fragmentShader: fliesFS }, ADD)));
  flies.frustumCulled = false; zone2.add(flies);

  // 5. Tentakels: gloeiende slierten aan het plafond die zachtjes wiegen, met lichtjes die naar beneden zakken en een bolletje aan de punt
  const tentVS = `uniform float sway, len, seed, amp;
    varying float vS; varying vec3 vN; varying vec3 vV;
    void main() {
      vec3 p = position;
      float s = clamp(-p.y / len, 0.0, 1.0);  // 0 aan het plafond, 1 bij de punt
      float w = sway * (0.8 + 0.4 * fract(seed * 3.7));
      p.x += amp * s * s * sin(w + seed + s * 2.5);
      p.z += amp * s * s * cos(w * 0.8 + seed * 1.3 + s * 2.0);
      vS = s;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      vN = normalMatrix * normal; vV = -mv.xyz;
      gl_Position = projectionMatrix * mv;
    }`;
  const tentFS = `uniform float time, pulse, high, beat, hue, seed;
    varying float vS; varying vec3 vN; varying vec3 vV;
    ${LIB}
    void main() {
      float rim = pow(max(0.0, 1.0 - abs(dot(normalize(vN), normalize(vV)))), 1.5);
      float band = pow(0.5 + 0.5 * sin(vS * 22.0 - time * 4.0 - seed), 6.0);
      float dd = vS - fract(beat + seed * 0.1), drop = exp(-dd * dd * 60.0);
      vec3 c = hsv(hue + vS * 0.15 + time * 0.02, 0.85, 1.0);
      gl_FragColor = vec4(c * ((0.12 + 0.6 * vS) * (0.3 + 0.7 * rim) + band * 0.3 * (0.3 + high) + drop * (0.4 + pulse)), 1.0);
    }`;
  // de zwevende vormen uit buildZone2 staan willekeurig: weg uit het oog en de paddenstoelhoeken, niet door het plafond
  const shapes = zone2.userData.shapes || [];
  for (const m of shapes) {
    m.position.y = Math.min(m.position.y, 4.3);
    for (let n = 0; n < 80; n++) {
      const dx = m.position.x - CX, dz = m.position.z - CZ;
      if (Math.hypot(dx, dz) > 1.9 && !(Math.abs(dx) > 4.9 && Math.abs(dz) > 4.9)) break;
      m.position.x = CX + rnd(-6.5, 6.5); m.position.z = CZ + rnd(-6.5, 6.5);
    }
  }
  const tents = [], spots = [];
  for (let n = 0; n < 400 && tents.length < 22; n++) {
    const dx = rnd(-7.3, 7.3), dz = rnd(-7.3, 6.9);  // achterin niet verder dan 6,9: de punt blijft uit de booth-spots en het neon van dj.js
    // niet boven de mandala, niet boven de paddenstoelen in de hoeken, niet door een zwevende vorm, niet te dicht op elkaar
    if (Math.hypot(dx, dz) < 3.7 || (Math.abs(dx) > 4.8 && Math.abs(dz) > 4.8) || spots.some(p => Math.hypot(p[0] - dx, p[1] - dz) < 0.9)
      || shapes.some(s => Math.hypot(s.position.x - CX - dx, s.position.z - CZ - dz) < 1.1)) continue;
    spots.push([dx, dz]);
    const len = rnd(0.75, 1.45), seed = rnd(0, 20), amp = 0.16 + 0.14 * len, hue = pick([0.83, 0.55, 0.75, 0.3, 0.92]);
    const geo = new THREE.CylinderGeometry(rnd(0.045, 0.075), 0.01, len, 7, 24, true); geo.translate(0, -len / 2, 0);
    const m = new THREE.Mesh(geo, new THREE.ShaderMaterial(Object.assign({
      uniforms: uni({ len: { value: len }, seed: { value: seed }, amp: { value: amp }, hue: { value: hue } }),
      vertexShader: tentVS, fragmentShader: tentFS, side: THREE.DoubleSide }, ADD)));
    m.position.set(CX + dx, H - 0.02, CZ + dz); m.frustumCulled = false;
    const bulb = add(m, BEAD, additive(0xffffff, 1), [0, -len, 0], [0.05, 0.05, 0.05]);
    m.userData = { len, seed, amp, hue, bulb, k: 0.8 + 0.4 * ((seed * 3.7) % 1), r: rnd(0.035, 0.06), flash: 0 };
    zone2.add(m); tents.push(m);
  }

  // per frame: uniforms, tel-momenten, oog volgen, ringen, tentakelpunten
  let swayPh = 0, topBeat = -Infinity, lidT = 1, saccT = 0;
  z2Hooks.push(dt => {
    T += dt; swayPh += dt * (0.55 + 0.6 * energy);
    U.time.value = T; U.pulse.value = pulse; U.energy.value = energy; U.sway.value = swayPh;
    U.bass.value = bands[0].v; U.mid.value = bands[1].v; U.high.value = bands[2].v; U.beat.value = beatPos % 256;
    // nieuwe tel: ring, de volgende hoek flitst, tentakelbolletjes, soms knippert het oog
    const b = Math.floor(beatPos);
    if (b > topBeat) {
      topBeat = b;
      spawnRing(b);
      flashes[b % 4].value = 1;
      for (const m of tents) if (Math.random() < 0.25) m.userData.flash = 1;
      if (b % 16 === 15 || Math.random() < 0.03) lidT = 0;
    }
    // paddenstoelen: flits uitdoven, hoed veert even in
    for (let c = 0; c < 4; c++) {
      const f = flashes[c]; f.value *= Math.exp(-dt * 3.5);
      cornerGlows[c].material.opacity = 0.12 + 0.25 * bands[0].v + 0.45 * f.value;
    }
    for (const cap of caps) { const d = cap.userData, f = flashes[d.c].value; cap.scale.set(d.R * (1 + 0.04 * f), d.R * d.ky * (1 - 0.05 * f), d.R * (1 + 0.04 * f)); }
    // oog: deint, kijkt (met kleine schokjes) naar de camera, knippert, pupil via de shader
    saccT -= dt;
    if (saccT <= 0) { saccT = rnd(0.5, 1.8); sacc.set(rnd(-0.6, 0.6), rnd(-0.4, 0.4), rnd(-0.6, 0.6)); }
    const y = EYE_Y + 0.03 * Math.sin(T * 0.8);
    eye.position.y = halo.position.y = gyro.position.y = y;
    aim.position.copy(eye.position); aim.lookAt(aimAt.copy(camera.position).add(sacc));
    eye.quaternion.slerp(aim.quaternion, 1 - Math.exp(-dt * 5));
    lidT += dt / 0.24; eyeMat.uniforms.lid.value = lidT < 1 ? Math.sin(Math.PI * lidT) : 0;
    eye.scale.setScalar(0.42 * (1 + 0.05 * pulse));
    halo.material.color.setHSL(0.83 + 0.1 * Math.sin(T * 0.2), 1, 0.5); halo.material.opacity = 0.3 + 0.55 * pulse;
    for (let i = 0; i < 3; i++) { const m = gRings[i]; m.rotateOnAxis(m.userData.axis, dt * m.userData.sp * (0.6 + energy + 1.5 * pulse)); m.material.color.setHSL((T * 0.05 + i / 3) % 1, 1, 0.5 + 0.25 * pulse); }
    for (const m of beads) {
      const d = m.userData, a = d.a + T * d.w;
      m.position.set(Math.cos(a) * d.R, Math.sin(a) * d.R * Math.sin(d.tilt), Math.sin(a) * d.R * Math.cos(d.tilt));
      m.scale.setScalar(0.035 + 0.03 * pulse);
    }
    eyeLight.color.setHSL((T * 0.04) % 1, 1, 0.55); eyeLight.intensity = 0.8 + 2.2 * pulse;
    centerGlow.material.color.setHSL((T * 0.04 + 0.5) % 1, 1, 0.5); centerGlow.material.opacity = 0.1 + 0.45 * pulse;
    // vloerringen uitdijen en vervagen
    for (const m of rings) {
      if (!m.visible) continue;
      const d = m.userData; d.age += dt;
      const u = d.age / 2.2;
      if (u >= 1) { m.visible = false; continue; }
      const R = 0.45 + 7.1 * (1 - Math.pow(1 - u, 2.2)); m.scale.set(R, R, 1);
      m.material.uniforms.alpha.value = Math.pow(1 - u, 1.6) * d.k;
      m.material.uniforms.spin.value += dt * 0.3 * d.dir;
    }
    // vuurvliegjes: puntgrootte in meters omrekenen naar pixels
    flies.material.uniforms.scale.value = renderer.domElement.height / (2 * Math.tan(camera.fov * Math.PI / 360));
    // tentakels: bolletje volgt de punt (zelfde formule als de shader), flitst op de tel
    for (const m of tents) {
      const d = m.userData, w = swayPh * d.k;
      d.bulb.position.set(d.amp * Math.sin(w + d.seed + 2.5), -d.len - d.r * 0.6, d.amp * Math.cos(w * 0.8 + d.seed * 1.3 + 2.0));
      d.flash *= Math.exp(-dt * 5);
      d.bulb.scale.setScalar(d.r * (1 + 0.5 * d.flash + 0.3 * pulse));
      d.bulb.material.color.setHSL((d.hue + T * 0.02) % 1, 1, 0.45 + 0.4 * d.flash);
    }
  });
})();

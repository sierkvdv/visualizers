// Camera nooit in de slak: na elke camera-update wordt een positie binnen het lijf van de slak naar buiten geschoven
// (de slak glijdt over de looproute en sommige shots staan daar laag of dichtbij, zoals de wormpjes- en de volgcamera).
// Laadt vóór club/kwaliteit.js, zodat diens culling (knip) al de verschoven camera ziet.
(() => {
  'use strict';
  if (typeof updateCamera !== 'function' || typeof THREE === 'undefined') return;
  const RAND = 0.45;                       // m vrij om het lijf (deinen en de boer laten hem tot ~18% zwellen)
  const lok = new THREE.Vector3(), box = new THREE.Box3();
  let maat = null;                         // lijf van de slak in zijn eigen assen (los van plek en draaiing)
  function meet() {
    const r = slug.root, p = r.position.clone(), q = r.quaternion.clone();
    r.position.set(0, 0, 0); r.quaternion.identity(); r.updateMatrixWorld(true);
    box.setFromObject(slug.wob);
    r.position.copy(p); r.quaternion.copy(q); r.updateMatrixWorld(true);
    if (box.isEmpty()) return null;
    const z = 1.15;                        // ruimte voor het zwellen
    return { x0: box.min.x * z - RAND, x1: box.max.x * z + RAND, z0: box.min.z * z - RAND, z1: box.max.z * z + RAND, y1: box.max.y * z + RAND };
  }
  const vorige = updateCamera;
  updateCamera = function (now) {
    vorige(now);
    if (typeof slug === 'undefined' || !slug || !slug.root || !slug.root.visible || !slug.root.parent) return;
    if (!maat) maat = meet();
    if (!maat) return;
    slug.root.updateMatrixWorld();
    lok.copy(camera.position); slug.root.worldToLocal(lok);
    const M = maat;
    if (lok.x <= M.x0 || lok.x >= M.x1 || lok.z <= M.z0 || lok.z >= M.z1 || lok.y >= M.y1) return;
    // langs de kortste weg naar buiten: opzij, voor/achter of omhoog
    const uit = [[lok.x - M.x0, 'x', M.x0], [M.x1 - lok.x, 'x', M.x1], [lok.z - M.z0, 'z', M.z0], [M.z1 - lok.z, 'z', M.z1], [M.y1 - lok.y, 'y', M.y1]];
    uit.sort((a, b) => a[0] - b[0]);
    lok[uit[0][1]] = uit[0][2];
    slug.root.localToWorld(lok);
    camera.position.copy(lok);
    if (camera.position.y < 0.2) camera.position.y = 0.2;
    camera.lookAt(camLook);
  };
})();

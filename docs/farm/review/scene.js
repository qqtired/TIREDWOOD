// 3D-сцена фермы из layout.json: участки, колодец, углы лужайки. Модели из client/assets/farm/models, чего нет — простые заглушки.
import { THREE, makeLoader, Rig } from './viewer.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { h } from './lib.js';

const col = (hex) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.95, metalness: 0 });

/** Копии мешей из узлов GLB по списку матриц (одна отрисовка на меш вместо сотни) */
function instancesFrom(scene, nodeNames, matrices, group) {
  scene.updateMatrixWorld(true);
  const tmp = new THREE.Matrix4();
  const out = [];
  scene.traverse((o) => {
    if (!o.isMesh) return;
    if (nodeNames) {
      let p = o; let ok = false;
      while (p && p !== scene) { if (nodeNames.includes(p.name)) { ok = true; break; } p = p.parent; }
      if (!ok) return;
    }
    const im = new THREE.InstancedMesh(o.geometry, o.material, matrices.length);
    matrices.forEach((m, i) => { tmp.multiplyMatrices(m, o.matrixWorld); im.setMatrixAt(i, tmp); });
    im.castShadow = true;
    im.receiveShadow = true;
    im.frustumCulled = false;
    group.add(im);
    out.push(im);
  });
  return out;
}

const mat = (x, z, yaw = 0, y = 0, s = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(s, s, s));

export async function createFarmScene(host, { L, modelUrl, onProgress }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.3, 700);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.485;
  controls.minDistance = 4;
  // колесо листает страницу; зум колесом — только после клика по сцене
  controls.enableZoom = false;
  renderer.domElement.addEventListener("pointerdown", () => { controls.enableZoom = true; });
  renderer.domElement.addEventListener("pointerleave", () => { controls.enableZoom = false; });
  controls.maxDistance = 150;
  const rig = new Rig(scene, renderer, { mapSize: 4096 });
  rig.fit(new THREE.Vector3(0, 0, 0), 46);
  rig.sun.shadow.bias = -0.0006;

  const world = new THREE.Group();
  scene.add(world);
  const B = L.bounds;
  const W = B.maxX - B.minX;

  // ───── земля, море, забор ─────
  const ground = new THREE.Mesh(new THREE.BoxGeometry(W, 3, W), col(0xb6cf82));
  ground.position.y = -1.5;
  ground.receiveShadow = true;
  const lawn = new THREE.Mesh(new THREE.CircleGeometry(24, 64), col(0xc2d98e));
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.y = 0.01;
  lawn.receiveShadow = true;
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: 0x7fb1ad, roughness: 0.35, metalness: 0 }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -3.4;
  world.add(ground, lawn, sea);
  const fenceMat = col(0xb98a52);
  for (const [cx, cz, sx, sz] of [[0, B.minZ, W, 0.2], [0, B.maxZ, W, 0.2], [B.minX, 0, 0.2, W], [B.maxX, 0, 0.2, W]]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(sx, 1.1, sz), fenceMat);
    f.position.set(cx, 0.55, cz);
    f.castShadow = true;
    world.add(f);
  }

  // ───── дорожки: лента на земле, polygonOffset вместо зазора ─────
  const pathMat = new THREE.MeshStandardMaterial({ color: 0xe6d3a1, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const flat = (geo, x, z, rot = 0) => {
    const m = new THREE.Mesh(geo, pathMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.03, z);
    if (rot) m.rotation.z = rot;
    m.receiveShadow = true;
    world.add(m);
    return m;
  };
  const P = L.paths;
  flat(new THREE.CircleGeometry(P.apron.r, 48), P.apron.x, P.apron.z);
  const strip = (x0, z0, x1, z1, width) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(width, len).rotateX(-Math.PI / 2), pathMat);
    m.position.set((x0 + x1) / 2, 0.03, (z0 + z1) / 2);
    m.rotation.y = Math.atan2(x1 - x0, z1 - z0);
    m.receiveShadow = true;
    world.add(m);
  };
  for (const r of P.radial) strip(r.from[0], r.from[1], r.to[0], r.to[1], r.width);
  // дуги вокруг мест у корыт: радиус D от точки у корыта до калиток своих участков
  for (const c of P.ring.centers) {
    const mine = L.plots.filter((p) => p.trough === c.trough);
    if (!mine.length) continue;
    const angs = mine.map((p) => Math.atan2(p.gate.z - c.z, p.gate.x - c.x));
    const base = Math.atan2(angs.reduce((a, x) => a + Math.sin(x), 0), angs.reduce((a, x) => a + Math.cos(x), 0));
    const d = angs.map((a) => ((a - base + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    const lo = base + Math.min(...d) - 0.1; const hi = base + Math.max(...d) + 0.1;
    // RingGeometry лежит в XY, после поворота на −90° по X локальный Y смотрит в −Z: угол в мире = −угол кольца
    const ring = new THREE.RingGeometry(P.ring.in, P.ring.out, 72, 1, -hi, hi - lo);
    flat(ring, c.x, c.z);
  }
  for (const r of [P.road, ...P.foot].filter((q) => q?.points)) {
    for (let i = 0; i + 1 < r.points.length; i++) strip(r.points[i][0], r.points[i][1], r.points[i + 1][0], r.points[i + 1][1], r.width);
  }

  // ───── загрузка моделей ─────
  const loader = makeLoader();
  const names = ['plot', 'bed', 'well', 'campfire', 'order_board', 'notice_board', 'van', 'compost', 'hive', 'seed_stall', 'grib_kiosk', 'pig-pen', 'pedestal', 'boss-tree', 'trees', 'decor', 'cart_town', 'plaza_gate', 'npc-semechkin', 'npc-grib', 'npc-zina', 'truffle-pig'];
  const got = {};
  let done = 0;
  await Promise.all(names.map(async (n) => {
    const u = modelUrl(n);
    if (!u) { done++; return; }
    try { got[n] = await loader.loadAsync(u); } catch (e) { console.warn('scene model', n, e); }
    done++;
    onProgress?.(done / names.length);
  }));
  const used = [];
  const mixers = [];
  const obj = (id) => L.objects.find((o) => o.id === id);
  // перед модели — игровой −Z при rotation.y = yaw (art/farm/MODELS.md)
  const nodesOf = (g, list) => { const grp = new THREE.Group(); for (const n of list) { const o = g.scene.getObjectByName(n); if (o) grp.add(o.clone(true)); } return grp; };
  const putAt = (node, x, z, yaw = 0, y = 0) => { node.position.set(x, y, z); node.rotation.y = yaw; world.add(node); return node; };
  const idleOf = (g, root) => { const clip = g.animations.find((a) => /idle/i.test(a.name)) || g.animations[0]; if (!clip) return; const mx = new THREE.AnimationMixer(root); mx.clipAction(clip).play(); mixers.push(mx); };
  const useIf = (name) => { if (got[name] && !used.includes(name)) used.push(name); return got[name]; };

  // деревья: из trees.glb, иначе простые шары
  const treeNode = { apple: 'tree_apple', cypress: 'tree_cypress', linden: 'tree_linden' };
  if (got.trees) {
    for (const [kind, node] of Object.entries(treeNode)) {
      const list = L.trees.filter((t) => t.kind === kind);
      if (!list.length) continue;
      instancesFrom(got.trees.scene, [node], list.map((t, i) => mat(t.x, t.z, ((i * 2.399) % 6.28), 0, 0.92 + ((i * 37) % 10) / 45)), world);
    }
    useIf('trees');
  } else {
    const treeKinds = { apple: { crown: 0x6fa24f, r: 1.5, trunk: 2.2 }, cypress: { crown: 0x4c7a3f, r: 0.9, trunk: 1.2, cone: true, h: 4.8 }, linden: { crown: 0x7fb157, r: 2.0, trunk: 2.6 } };
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.26, 1, 8);
    for (const [kind, k] of Object.entries(treeKinds)) {
      const list = L.trees.filter((t) => t.kind === kind);
      if (!list.length) continue;
      const trunks = new THREE.InstancedMesh(trunkGeo, col(0x8a5f38), list.length);
      const crowns = new THREE.InstancedMesh(k.cone ? new THREE.ConeGeometry(k.r, k.h, 10) : new THREE.SphereGeometry(k.r, 14, 10), col(k.crown), list.length);
      list.forEach((t, i) => {
        trunks.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(t.x, k.trunk / 2, t.z), new THREE.Quaternion(), new THREE.Vector3(1, k.trunk, 1)));
        crowns.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(t.x, k.trunk + (k.cone ? k.h * 0.45 : k.r * 0.7), t.z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)));
      });
      for (const m of [trunks, crowns]) { m.castShadow = m.receiveShadow = true; m.frustumCulled = false; world.add(m); }
    }
  }

  // участки
  const plotMats = L.plots.map((p) => mat(p.x, p.z, p.yaw));
  if (got.plot) { instancesFrom(got.plot.scene, null, plotMats, world); used.push('plot'); }
  else {
    for (const p of L.plots) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(L.plot.w, 0.1, L.plot.l), col(0xcaa86a));
      m.position.set(p.x, 0.05, p.z); m.rotation.y = p.yaw; m.receiveShadow = true; world.add(m);
    }
  }
  const PL = L.plotLocal;
  const inPlot = (o) => plotMats.map((pm) => pm.clone().multiply(mat(o.x, o.z, 0)));
  const bedMats = [];
  L.plots.forEach((p, i) => { for (const b of PL.beds) bedMats.push(plotMats[i].clone().multiply(mat(b.x, b.z, 0))); });
  if (got.bed) { instancesFrom(got.bed.scene, ['bed_frame', 'bed_dug'], bedMats, world); used.push('bed'); }
  if (got.compost) { instancesFrom(got.compost.scene, ['compost'], inPlot(PL.compost), world); used.push('compost'); }
  if (got.hive) { instancesFrom(got.hive.scene, ['hive'], inPlot(PL.hive), world); used.push('hive'); }
  if (got['pig-pen']) { instancesFrom(got['pig-pen'].scene, null, inPlot(PL.pen), world); used.push('pig-pen'); }
  else {
    const pens = new THREE.InstancedMesh(new THREE.BoxGeometry(PL.pen.w, 0.5, PL.pen.d), col(0xc99a62), L.plots.length);
    inPlot(PL.pen).forEach((m, i) => pens.setMatrixAt(i, m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.25, 0))));
    pens.castShadow = pens.receiveShadow = true; pens.frustumCulled = false; world.add(pens);
  }
  // свиньи в загонах двух участков: чтобы было видно, как это выглядит
  if (got['truffle-pig']) {
    for (const n of [3, 7]) {
      const p = L.plots.find((q) => q.n === n);
      if (!p) continue;
      const c = SkeletonUtils.clone(got['truffle-pig'].scene);
      const pm = plotMats[n - 1].clone().multiply(mat(PL.pen.x, PL.pen.z, 0.4));
      c.applyMatrix4(pm);
      world.add(c);
      idleOf(got['truffle-pig'], c);
    }
    used.push('truffle-pig');
  }

  // колодец и четыре корыта
  if (got.well) {
    const w = got.well.scene.clone(true);
    const t = w.getObjectByName('trough');
    if (t) t.visible = false;
    world.add(w);
    used.push('well');
    if (t) instancesFrom(got.well.scene, ['trough'], L.troughs.map((tr) => mat(tr.x, tr.z, tr.id === 'E' || tr.id === 'W' ? Math.PI / 2 : 0)), world);
  }

  // углы лужайки
  if (got.campfire && obj('campfire')) {
    const o = obj('campfire');
    const c = got.campfire.scene.clone(true);
    const seat = c.getObjectByName('campfire_seat');
    if (seat) seat.visible = false;
    putAt(c, o.x, o.z, 0);
    if (seat) instancesFrom(got.campfire.scene, ['campfire_seat'], [[0, -1.9, 0], [Math.PI / 2, 1.9, 0], [Math.PI, 0, 1.9], [-Math.PI / 2, -1.9, 0]].map(([yy, dx, dz], i) => {
      const pos = [[0, -2.0], [2.0, 0], [0, 2.0], [-2.0, 0]][i];
      return mat(o.x + pos[0], o.z + pos[1], i % 2 ? Math.PI / 2 : 0);
    }), world);
    used.push('campfire');
  }
  if (got.order_board && obj('orders')) { const o = obj('orders'); putAt(got.order_board.scene.clone(true), o.x, o.z, o.yaw); used.push('order_board'); }
  if (got.notice_board && obj('farmBoard')) { const o = obj('farmBoard'); putAt(got.notice_board.scene.clone(true), o.x, o.z, o.yaw); used.push('notice_board'); }
  if (got.van && obj('van')) {
    const o = obj('van');
    const v = got.van.scene.clone(true);
    for (const n of ['van_away_sign', 'van_closed', 'van_wheel']) { const x = v.getObjectByName(n); if (x) x.visible = false; }
    putAt(v, o.x, o.z, o.yaw);
    used.push('van');
  }
  const npcAt = (key, o, back = 0.2) => {
    const g = got[key];
    if (!g) return;
    const c = SkeletonUtils.clone(g.scene);
    putAt(c, o.x + Math.sin(o.yaw) * back, o.z + Math.cos(o.yaw) * back, o.yaw);
    idleOf(g, c);
    used.push(key);
  };
  if (got.seed_stall && obj('semechkin')) { const o = obj('semechkin'); putAt(got.seed_stall.scene.clone(true), o.x, o.z, o.yaw); used.push('seed_stall'); npcAt('npc-semechkin', o, 0.35); }
  if (got.grib_kiosk && obj('grib')) {
    const o = obj('grib');
    const k = got.grib_kiosk.scene.clone(true);
    const sc = k.getObjectByName('grib_scales'); if (sc) sc.visible = false;
    putAt(k, o.x, o.z, o.yaw); used.push('grib_kiosk');
    npcAt('npc-grib', o, 0.15);
  }
  // тётя Зина рядом с доской фермы
  if (got['npc-zina'] && obj('farmBoard')) { const o = obj('farmBoard'); const c = SkeletonUtils.clone(got['npc-zina'].scene); putAt(c, o.x + Math.cos(o.yaw) * 1.7, o.z - Math.sin(o.yaw) * 1.7 + 0.4, o.yaw); idleOf(got['npc-zina'], c); used.push('npc-zina'); }
  // телега в город
  if (obj('cart')) {
    const o = obj('cart');
    const g = got.cart_town || got.plaza_gate;
    if (got.cart_town) { putAt(got.cart_town.scene.clone(true), o.x, o.z, o.yaw); used.push('cart_town'); }
    else if (got.plaza_gate?.scene.getObjectByName('plaza_cart')) { putAt(nodesOf(got.plaza_gate, ['plaza_cart']), o.x, o.z, o.yaw, 0.6); used.push('plaza_gate (телега)'); }
    else { const b = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.9, 1.6), col(0xb88a4a)); b.position.set(o.x, 0.45, o.z); b.castShadow = b.receiveShadow = true; world.add(b); }
    void g;
  }
  // пьедестал Древа: состояния пня и само Древо
  const bossO = obj('boss');
  const bossStates = {};
  if (got.pedestal && bossO) {
    const ped = got.pedestal.scene.clone(true);
    putAt(ped, bossO.x, bossO.z, bossO.yaw);
    const stump = { sleep: ped.getObjectByName('boss_stump'), cracked: ped.getObjectByName('boss_stump_cracked'), bloom: ped.getObjectByName('boss_stump_bloom') };
    let tree = null;
    if (got['boss-tree']) { tree = SkeletonUtils.clone(got['boss-tree'].scene); tree.position.set(bossO.x, 0.48, bossO.z); tree.rotation.y = bossO.yaw; world.add(tree); idleOf(got['boss-tree'], tree); used.push('boss-tree'); }
    const setBoss = (st) => {
      for (const [k, n] of Object.entries(stump)) if (n) n.visible = (st === k);
      if (tree) tree.visible = st === 'tree';
    };
    setBoss('sleep');
    bossStates.set = setBoss;
    bossStates.hasTree = !!tree;
    used.push('pedestal');
  } else if (bossO?.foot) {
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.8, 0.5, 20), col(0xb8a98a));
    ped.position.set(bossO.x, 0.25, bossO.z); ped.castShadow = ped.receiveShadow = true;
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 3, 10), col(0x7d5a3a)); tr.position.set(bossO.x, 2, bossO.z); tr.castShadow = true;
    const cr = new THREE.Mesh(new THREE.SphereGeometry(1.9, 16, 12), col(0x6fa24f)); cr.position.set(bossO.x, 4.2, bossO.z); cr.castShadow = true;
    world.add(ped, tr, cr);
  }
  // убранство из decor.glb: фонари, лавки, перила обрыва, ворота Фургона, подзорная труба, сено
  if (got.decor) {
    const D = got.decor;
    const lanterns = L.objects.filter((o) => /^lantern/.test(o.id));
    instancesFrom(D.scene, ['lantern_post'], lanterns.map((o) => mat(o.x, o.z, Math.atan2(o.z, -o.x))), world);
    const rail = []; for (let x = -34.8; x < 34.8; x += 2.4) rail.push(mat(x, B.maxZ - 0.9, 0));
    instancesFrom(D.scene, ['railing_segment'], rail, world);
    for (const n of L.nooks) {
      for (const it of n.items || []) {
        if (it.kind === 'bench') instancesFrom(D.scene, ['bench'], [mat(it.x, it.z, it.yaw || 0)], world);
        if (it.kind === 'vanGate') instancesFrom(D.scene, ['gate_big'], [mat(it.x, it.z, Math.PI / 2)], world);
      }
      if (n.id === 'viewpoint') instancesFrom(D.scene, ['telescope', 'bench'], [mat(n.x + 1.2, n.z - 1.2, 0.8)], world);
    }
    used.push('decor');
  }
  if (got.hive) {
    for (const n of L.nooks) { const hv = (n.items || []).filter((i) => i.kind === 'hiveDecor'); if (hv.length) instancesFrom(got.hive.scene, ['hive'], hv.map((i, k) => mat(i.x, i.z, k * 1.3)), world); }
  }
  // точки появления: маленькие кружки
  const spawn = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 16), new THREE.MeshStandardMaterial({ color: 0x5e88a8, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), L.spawns.length);
  L.spawns.forEach((s, i) => spawn.setMatrixAt(i, mat(s.x, s.z, 0, 0.04)));
  spawn.frustumCulled = false;
  world.add(spawn);

  // ───── подписи ─────
  const labels = [];
  const addLabel = (text, x, y, z, cls = '') => {
    const el = h('div.scene-label' + (cls ? '.' + cls : ''), text);
    host.appendChild(el);
    labels.push({ el, v: new THREE.Vector3(x, y, z) });
  };
  L.plots.forEach((p) => addLabel(String(p.n), p.x, 3.2, p.z, 'plot-no'));
  addLabel('Колодец', 0, 4.1, 0);
  const lab = (id, text, y = 3.4) => { const o = obj(id); if (o) addLabel(text, o.x, y, o.z); };
  lab('semechkin', 'Семечкин', 3); lab('grib', 'Дядюшка Гриб', 3); lab('orders', 'Доска заказов', 3.2); lab('farmBoard', 'Доска фермы', 3.2); lab('cart', 'Телега «В город»', 2.4); lab('van', 'Фургон', 3.6); lab('campfire', 'Костёр', 2.2); lab('boss', 'Древо разлома', 6.6);
  addLabel('появление', L.spawns[4].x, 1.6, L.spawns[4].z);

  // ───── камера ─────
  const tween = { t: 1, from: null, to: null };
  function focus(x, z, dist = 22, azimuth = 0.7, polar = 0.9, ms = 900) {
    const tgt = new THREE.Vector3(x, 0.8, z);
    const dir = new THREE.Vector3(Math.sin(azimuth) * Math.sin(polar), Math.cos(polar), Math.cos(azimuth) * Math.sin(polar));
    const pos = tgt.clone().addScaledVector(dir, dist);
    tween.from = { p: camera.position.clone(), t: controls.target.clone() };
    tween.to = { p: pos, t: tgt };
    tween.t = 0; tween.ms = ms; tween.start = performance.now();
  }
  function jump(x, z, dist, azimuth, polar) { focus(x, z, dist, azimuth, polar, 0); }
  jump(0, 0, 112, 0.55, 0.78);

  function resize() {
    const w = host.clientWidth || 800; const hh = host.clientHeight || 450;
    renderer.setSize(w, hh, false);
    camera.aspect = w / hh;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  let disposed = false;
  const clock = new THREE.Clock();
  const v3 = new THREE.Vector3();
  function frame() {
    if (disposed) return;
    requestAnimationFrame(frame);
    if (document.hidden || !host.offsetParent) return;
    const dt = Math.min(clock.getDelta(), 0.1);
    for (const m of mixers) m.update(dt);
    if (tween.t < 1) {
      tween.t = tween.ms ? Math.min(1, (performance.now() - tween.start) / tween.ms) : 1;
      const e = 1 - Math.pow(1 - tween.t, 3);
      camera.position.lerpVectors(tween.from.p, tween.to.p, e);
      controls.target.lerpVectors(tween.from.t, tween.to.t, e);
    }
    controls.update();
    renderer.render(scene, camera);
    const w = host.clientWidth; const hh = host.clientHeight;
    const dist = camera.position.distanceTo(controls.target);
    for (const l of labels) {
      v3.copy(l.v).project(camera);
      const behind = v3.z > 1 || v3.z < -1;
      const small = l.el.classList.contains('plot-no');
      const far = l.v.distanceTo(camera.position);
      l.el.style.display = behind || (small && far > 120) || (!small && far > 150) ? 'none' : '';
      l.el.style.left = ((v3.x * 0.5 + 0.5) * w) + 'px';
      l.el.style.top = ((-v3.y * 0.5 + 0.5) * hh) + 'px';
      l.el.style.opacity = small ? String(Math.max(0.35, Math.min(1, 1.3 - far / 140))) : '1';
    }
  }
  requestAnimationFrame(frame);

  return {
    camera, controls, focus, jump, used, boss: bossStates,
    dispose() {
      disposed = true;
      ro.disconnect();
      controls.dispose();
      rig.dispose();
      renderer.dispose();
      renderer.forceContextLoss?.();
      renderer.domElement.remove();
      labels.forEach((l) => l.el.remove());
    },
  };
}

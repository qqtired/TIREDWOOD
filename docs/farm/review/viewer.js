// 3D-просмотрщик моделей (three.js r170): мягкий «вечерний» свет, тени, анимации, варианты узлов, счётчик треугольников.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { h, nf } from './lib.js';

export { THREE };

const DRACO_PATH = 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/';
let sharedLoader = null;
export function makeLoader() {
  if (sharedLoader) return sharedLoader;
  const l = new GLTFLoader();
  const d = new DRACOLoader();
  d.setDecoderPath(DRACO_PATH);
  l.setDRACOLoader(d);
  l.setMeshoptDecoder(MeshoptDecoder);
  sharedLoader = l;
  return l;
}

export const MOODS = {
  evening: { label: 'Вечер', hemiSky: 0xfff0d2, hemiGround: 0xa68058, hemi: 0.95, sun: 0xffbf7a, sunI: 3.1, sunDir: [4.2, 3.0, 3.4], fill: 0xc9b9ff, fillI: 0.38, env: 0.3, exposure: 1.02 },
  neutral: { label: 'Нейтральный', hemiSky: 0xffffff, hemiGround: 0xd4cab4, hemi: 1.0, sun: 0xffffff, sunI: 2.2, sunDir: [3, 5, 4], fill: 0xffffff, fillI: 0.5, env: 0.6, exposure: 1.0 },
};

/** Свет «вечернее солнце»: тёплое низкое солнце, холодноватая заливка, полусфера и мягкая карта окружения. */
export class Rig {
  constructor(scene, renderer, { shadows = true, mapSize = 2048 } = {}) {
    this.scene = scene;
    this.renderer = renderer;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    this.fill = new THREE.DirectionalLight(0xffffff, 0.3);
    this.sun.castShadow = shadows;
    if (shadows) {
      this.sun.shadow.mapSize.set(mapSize, mapSize);
      this.sun.shadow.bias = -0.0004;
      this.sun.shadow.normalBias = 0.02;
    }
    scene.add(this.hemi, this.sun, this.sun.target, this.fill);
    const pm = new THREE.PMREMGenerator(renderer);
    this.envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
    scene.environment = this.envTex;
    this.center = new THREE.Vector3();
    this.radius = 1;
    this.mood = 'evening';
    this.apply('evening');
  }
  apply(name) {
    const m = MOODS[name] || MOODS.evening;
    this.mood = name;
    this.hemi.color.set(m.hemiSky);
    this.hemi.groundColor.set(m.hemiGround);
    this.hemi.intensity = m.hemi;
    this.sun.color.set(m.sun);
    this.sun.intensity = m.sunI;
    this.fill.color.set(m.fill);
    this.fill.intensity = m.fillI;
    this.scene.environmentIntensity = m.env;
    this.renderer.toneMappingExposure = m.exposure;
    this.fit(this.center, this.radius);
  }
  fit(center, radius) {
    const m = MOODS[this.mood] || MOODS.evening;
    this.center.copy(center);
    this.radius = radius;
    const d = new THREE.Vector3(...m.sunDir).normalize();
    this.sun.position.copy(center).addScaledVector(d, radius * 5);
    this.sun.target.position.copy(center);
    this.sun.target.updateMatrixWorld();
    const c = this.sun.shadow.camera;
    const r = radius * 1.7;
    c.left = -r; c.right = r; c.top = r; c.bottom = -r;
    c.near = radius * 0.5; c.far = radius * 11;
    c.updateProjectionMatrix();
    this.fill.position.copy(center).add(new THREE.Vector3(-d.x, d.y * 0.6, -d.z).multiplyScalar(radius * 4));
  }
  dispose() { this.envTex?.dispose(); }
}

export function visibleBox(root) {
  const box = new THREE.Box3();
  root.updateWorldMatrix(true, true);
  root.traverseVisible((o) => {
    if (o.isMesh && o.geometry) {
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));
    }
  });
  return box;
}

export function countVisible(root) {
  let tris = 0; let verts = 0; let meshes = 0;
  const mats = new Set(); const texs = new Set();
  root.traverseVisible((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry;
    const idx = g.index ? g.index.count : g.attributes.position.count;
    tris += (idx / 3) * (o.isInstancedMesh ? o.count : 1);
    verts += g.attributes.position.count;
    meshes++;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      mats.add(m);
      for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) if (m[k]) texs.add(m[k]);
    }
  });
  return { tris: Math.round(tris), verts, meshes, materials: mats.size, textures: texs.size };
}

/** во сколько раз сумма объёмов габаритов узлов больше объёма их объединения (≈1 — части одной вещи, много — узлы лежат друг на друге) */
function overlapRatio(nodes) {
  const U = new THREE.Box3();
  let sum = 0;
  const vol = (b) => Math.max(b.max.x - b.min.x, 0.01) * Math.max(b.max.y - b.min.y, 0.01) * Math.max(b.max.z - b.min.z, 0.01);
  for (const n of nodes) {
    const b = visibleBox(n);
    if (b.isEmpty()) continue;
    U.union(b);
    sum += vol(b);
  }
  return U.isEmpty() ? 1 : sum / vol(U);
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,246,214,0.85)');
  gr.addColorStop(0.55, 'rgba(255,236,190,0.42)');
  gr.addColorStop(1, 'rgba(255,236,190,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const STAGE_RE = /^stage[-_ ]?(\d+)$/i;
const STAGE_LABELS = ['Стадия 1', 'Стадия 2', 'Стадия 3', 'Спелая'];

export class ModelViewer {
  constructor(host, opts = {}) {
    this.host = host;
    this.opts = opts;
    host.classList.add('viewer-host');
    if (opts.tall) host.classList.add('tall');
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x000000, 0);
    host.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.01, 400);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 1.1;
    this.controls.addEventListener('start', () => this._setAuto(false));
    this.rig = new Rig(this.scene, this.renderer);
    // пол: мягкое сияние и поверхность для теней
    this.floor = new THREE.Group();
    this.glow = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false }));
    this.glow.rotation.x = -Math.PI / 2;
    this.shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ color: 0x5a3a14, opacity: 0.3 }));
    this.shadowPlane.rotation.x = -Math.PI / 2;
    this.shadowPlane.position.y = 0.0008;
    this.shadowPlane.receiveShadow = true;
    this.floor.add(this.glow, this.shadowPlane);
    this.scene.add(this.floor);
    this.root = null;
    this.mixer = null;
    this.actions = [];
    this.state = { wire: false, mood: 'evening', spread: false };
    this.sources = [];
    this.srcIndex = 0;
    this.variantMode = null;
    this.clock = new THREE.Clock();
    this.running = true;
    this.disposed = false;
    this._buildUI();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this._msg('Контекст WebGL потерян. Закрой и открой окно заново.'); });
    this.resize();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  // ───── интерфейс поверх canvas ─────
  _buildUI() {
    const ui = (this.ui = {});
    ui.root = h('div.v-ui');
    ui.stats = h('div.v-stats');
    ui.tools = h('div.v-tools');
    ui.bottom = h('div.v-bottom');
    ui.srcRow = h('div.v-row');
    ui.varRow = h('div.v-row');
    ui.animRow = h('div.v-row');
    const mk = (icon, title, fn, pressed) => {
      const b = h('button.v-btn', { type: 'button', title, 'aria-label': title, onclick: () => fn(b) }, icon);
      if (pressed != null) b.setAttribute('aria-pressed', String(pressed));
      return b;
    };
    ui.btnAuto = mk('⟳', 'Автоповорот', () => this._setAuto(!this.controls.autoRotate), true);
    ui.btnWire = mk('▦', 'Каркас (wireframe)', (b) => { this.state.wire = !this.state.wire; b.setAttribute('aria-pressed', String(this.state.wire)); this._applyWire(); }, false);
    ui.btnLight = mk('☀', 'Свет: вечер / нейтральный', (b) => { const next = this.state.mood === 'evening' ? 'neutral' : 'evening'; this.state.mood = next; this.rig.apply(next); b.setAttribute('aria-pressed', String(next === 'neutral')); b.title = 'Свет: ' + MOODS[next].label; }, false);
    ui.btnReset = mk('⌖', 'Сбросить вид', () => this.frame());
    ui.tools.append(ui.btnAuto, ui.btnWire, ui.btnLight, ui.btnReset);
    ui.hint = h('div.v-hint', 'вращать — ЛКМ · приблизить — колесо · сдвиг — ПКМ');
    ui.bottom.append(ui.srcRow, ui.varRow, ui.animRow, ui.hint);
    ui.msg = h('div.v-msg', { hidden: true });
    ui.root.append(ui.stats, ui.tools, ui.bottom, ui.msg);
    this.host.appendChild(ui.root);
  }
  _msg(html, spinner = false) {
    const m = this.ui.msg;
    m.hidden = !html;
    m.innerHTML = '';
    if (html) m.appendChild(h('div', spinner ? h('div.spin') : null, h('div', { html })));
  }
  _setAuto(v) {
    this.controls.autoRotate = v;
    this.ui.btnAuto.setAttribute('aria-pressed', String(v));
  }
  _applyWire() {
    this.root?.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.wireframe = this.state.wire;
    });
  }

  resize() {
    if (this.disposed) return;
    const w = this.host.clientWidth || 300;
    const hh = this.host.clientHeight || 300;
    this.renderer.setSize(w, hh, false);
    this.camera.aspect = w / hh;
    this.camera.updateProjectionMatrix();
  }

  _loop() {
    if (this.disposed) return;
    requestAnimationFrame(this._loop);
    if (!this.running || document.hidden || !this.host.isConnected || !this.host.offsetParent) return;
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this.mixer?.update(dt);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  // ───── источники (несколько файлов для одной сущности) ─────
  async setSources(list, index = 0) {
    this.sources = list;
    this.ui.srcRow.innerHTML = '';
    if (list.length > 1) {
      list.forEach((s, i) => {
        this.ui.srcRow.appendChild(h('button.v-chip', { type: 'button', 'aria-pressed': String(i === index), onclick: () => this.setSources(this.sources, i) }, s.label || `Модель ${i + 1}`));
      });
    }
    this.srcIndex = index;
    await this.load(list[index]);
  }

  async load(src) {
    this._msg('Загружаю модель…', true);
    this._clear();
    let gltf;
    try {
      gltf = await makeLoader().loadAsync(src.url);
    } catch (e) {
      if (this.disposed) return;
      this._msg(`Не удалось загрузить модель.<br><span class="tiny">${String(e?.message || e).replace(/</g, '&lt;')}</span>`);
      return;
    }
    if (this.disposed) return;
    this._msg('');
    this.src = src;
    this.root = gltf.scene;
    this.root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = true;
      }
    });
    this.scene.add(this.root);
    this._setupVariants();
    this._setupAnimations(gltf.animations || []);
    this._applyWire();
    this._refresh(true);
  }

  _clear() {
    if (this.root) {
      this.scene.remove(this.root);
      this.root.traverse((o) => {
        if (o.isMesh) {
          o.geometry?.dispose();
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
            for (const k of Object.keys(m)) if (m[k]?.isTexture) m[k].dispose();
            m.dispose();
          }
        }
      });
    }
    this.root = null;
    this.mixer?.stopAllAction();
    this.mixer = null;
    this.actions = [];
    this.ui.varRow.innerHTML = '';
    this.ui.animRow.innerHTML = '';
    this.variants = [];
    this.variantMode = null;
    this.state.spread = false;
  }

  // ───── варианты: стадии роста или отдельные узлы ─────
  _setupVariants() {
    let nodes = this.root.children.filter((c) => c.name);
    // «Scene → один узел-обёртка → части»
    for (let k = 0; k < 2 && nodes.length === 1 && nodes[0].children.length > 1; k++) nodes = nodes[0].children.filter((c) => c.name);
    this.variants = nodes;
    nodes.forEach((n) => { n.userData.basePos = n.position.clone(); });
    const meta = this.src?.variants || [];
    const metaOf = (name) => meta.find((v) => v.name === name);
    const stageNodes = nodes.filter((n) => STAGE_RE.test(n.name));
    this.ui.varRow.innerHTML = '';
    // «альтернативы»: узлы лежат друг на друге (скины инструмента, разные виды одной вещи) — показываем по одному
    const alt = !stageNodes.length && nodes.length >= 3 && nodes.length <= 24 && overlapRatio(nodes) > 2.5;
    if ((stageNodes.length >= 2 && stageNodes.length === nodes.length) || alt) {
      this.variantMode = 'stage';
      if (alt) stageNodes.push(...[...nodes].sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true })));
      else stageNodes.sort((a, b) => Number(a.name.match(STAGE_RE)[1]) - Number(b.name.match(STAGE_RE)[1]));
      this.stageNodes = stageNodes;
      const labels = alt ? stageNodes.map((n) => n.name) : stageNodes.length === 4 ? STAGE_LABELS : stageNodes.map((n, i) => `Стадия ${i + 1}`);
      this.stageSel = alt ? 0 : stageNodes.length - 1;
      this.stageBtns = stageNodes.map((n, i) => {
        const vm = metaOf(n.name);
        const tris = vm?.tris ?? countVisible(n).tris;
        const b = h('button.v-chip' + (vm?.over ? '.over' : ''), { type: 'button', title: vm?.budget ? `Ориентир документа: ${nf(vm.budget[0])}–${nf(vm.budget[1])} треуг.` : '', onclick: () => this._selectStage(i) }, labels[i], h('span.t', nf(tris)));
        return b;
      });
      this.allBtn = h('button.v-chip', { type: 'button', title: 'Показать все стадии в ряд', onclick: () => this._selectStage('all') }, 'Все рядом');
      this.ui.varRow.append(...this.stageBtns, this.allBtn);
      this._selectStage(this.stageSel, true);
    } else if (nodes.length >= 2 && nodes.length <= 24) {
      this.variantMode = 'parts';
      this.partBtns = nodes.map((n, i) => {
        const vm = metaOf(n.name);
        const b = h('button.v-chip', { type: 'button', 'aria-pressed': 'true', onclick: () => { n.visible = !n.visible; b.setAttribute('aria-pressed', String(n.visible)); this._refresh(false); } }, n.name, h('span.t', nf(vm?.tris ?? countVisible(n).tris)));
        return b;
      });
      const all = h('button.v-chip', { type: 'button', onclick: () => { const on = nodes.some((n) => !n.visible); nodes.forEach((n, i) => { n.visible = on; this.partBtns[i].setAttribute('aria-pressed', String(on)); }); this._refresh(false); } }, 'все / ни одного');
      this.ui.varRow.append(...this.partBtns, all);
    }
  }

  _selectStage(i, silent) {
    const nodes = this.stageNodes;
    this.state.spread = i === 'all';
    nodes.forEach((n, k) => {
      n.visible = i === 'all' || k === i;
      n.position.copy(n.userData.basePos);
    });
    if (i === 'all') {
      const boxes = nodes.map((n) => { n.visible = true; return visibleBox(n); });
      const maxW = Math.max(...boxes.map((b) => b.max.x - b.min.x));
      const step = maxW * 1.18;
      nodes.forEach((n, k) => { n.position.x = n.userData.basePos.x + (k - (nodes.length - 1) / 2) * step; });
    } else this.stageSel = i;
    this.stageBtns?.forEach((b, k) => b.setAttribute('aria-pressed', String(i !== 'all' && k === i)));
    this.allBtn?.setAttribute('aria-pressed', String(i === 'all'));
    if (!silent) this._refresh(true);
  }

  // ───── анимации ─────
  _setupAnimations(clips) {
    if (!clips.length) return;
    this.mixer = new THREE.AnimationMixer(this.root);
    this.actions = clips.map((c) => ({ clip: c, action: this.mixer.clipAction(c) }));
    const idle = this.actions.findIndex((a) => /idle/i.test(a.clip.name));
    this.animBtns = this.actions.map((a, i) => h('button.v-chip', { type: 'button', 'aria-pressed': 'false', title: `${a.clip.duration.toFixed(2)} с`, onclick: () => this._playClip(i) }, a.clip.name || `anim ${i}`, h('span.t', a.clip.duration.toFixed(1) + ' с')));
    this.pauseBtn = h('button.v-chip', { type: 'button', 'aria-pressed': 'false', onclick: () => { this.mixer.timeScale = this.mixer.timeScale === 0 ? 1 : 0; this.pauseBtn.setAttribute('aria-pressed', String(this.mixer.timeScale === 0)); } }, '⏸ пауза');
    this.ui.animRow.append(h('span.v-chip', { style: 'border-style:dashed;pointer-events:none' }, 'Анимации'), ...this.animBtns, this.pauseBtn);
    this._playClip(idle >= 0 ? idle : 0);
  }
  _playClip(i) {
    this.actions.forEach((a, k) => {
      if (k === i) { a.action.reset().fadeIn(0.2).play(); } else a.action.fadeOut(0.2);
      this.animBtns[k].setAttribute('aria-pressed', String(k === i));
    });
    this.mixer.timeScale = 1;
    this.pauseBtn?.setAttribute('aria-pressed', 'false');
  }

  // ───── статистика и камера ─────
  _refresh(reframe) {
    if (!this.root) return;
    const st = countVisible(this.root);
    const box = visibleBox(this.root);
    const size = box.getSize(new THREE.Vector3());
    this.size = size;
    // бюджет: по выбранной стадии или по всей модели
    let budget = this.src?.budget || null;
    if (this.variantMode === 'stage' && typeof this.stageSel === 'number' && !this.state.spread) {
      const vm = (this.src?.variants || []).find((v) => v.name === this.stageNodes[this.stageSel].name);
      if (vm?.budget) budget = vm.budget;
    }
    this._stats(st, size, budget);
    if (reframe) this.frame();
    this.opts.onStats?.({ ...st, size: size.toArray() });
  }
  _stats(st, size, budget) {
    const cls = !budget ? '' : st.tris > budget[1] ? 'bad' : st.tris >= budget[0] ? 'ok' : 'mid';
    const el = this.ui.stats;
    el.innerHTML = '';
    el.append(...[
      h('span.v-stat' + (cls ? '.' + cls : ''), { title: budget ? `Ориентир документа: ${nf(budget[0])}–${nf(budget[1])} треугольников` : 'Треугольники видимой части' }, h('i'), `△ ${nf(st.tris)}`, budget ? h('span.tiny', `/ ${nf(budget[1])}`) : null),
      h('span.v-stat', `${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)} м`),
      h('span.v-stat', `${st.meshes} мешей · ${st.materials} мат.${st.textures ? ' · ' + st.textures + ' текст.' : ''}`),
      this.actions.length ? h('span.v-stat', `${this.actions.length} анимаций`) : null,
    ].filter(Boolean));
  }

  frame() {
    if (!this.root) return;
    const box = visibleBox(this.root);
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const r = Math.max(sphere.radius, 0.05);
    const fov = (this.camera.fov * Math.PI) / 180;
    const aspect = this.camera.aspect || 1;
    const fitFov = aspect < 1 ? 2 * Math.atan(Math.tan(fov / 2) * aspect) : fov;
    const dist = (r / Math.sin(fitFov / 2)) * 1.08;
    const dir = new THREE.Vector3(0.78, 0.62, 1).normalize();
    this.controls.target.copy(sphere.center);
    this.camera.position.copy(sphere.center).addScaledVector(dir, dist);
    this.camera.near = Math.max(dist / 200, 0.005);
    this.camera.far = dist * 40;
    this.camera.updateProjectionMatrix();
    this.controls.minDistance = r * 0.5;
    this.controls.maxDistance = r * 9;
    this.controls.update();
    this.rig.fit(sphere.center, r);
    const R = Math.max(r * 1.7, 0.5);
    this.floor.position.set(sphere.center.x, box.min.y, sphere.center.z);
    this.glow.scale.setScalar(R);
    this.shadowPlane.scale.setScalar(R * 6);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.ro.disconnect();
    this._clear();
    this.rig.dispose();
    this.glow.material.map?.dispose();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
    this.renderer.domElement.remove();
    this.ui.root.remove();
  }
}

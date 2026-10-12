// 3D-окна страницы ревью: лодки и стоянка, остров «Последний свет», косметика.
// three.js r169 с jsDelivr (importmap в index.html). Модели — относительными путями из models/ и cosmetics/.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const loader = new GLTFLoader();
const cache = new Map();
function load(url, onProg) {
  if (!cache.has(url)) {
    cache.set(url, new Promise((res, rej) => loader.load(url, res, onProg, () => { cache.delete(url); rej(new Error('не загрузился ' + url)); })));
  }
  return cache.get(url);
}
async function loadAll(urls, progress, optional = []) {
  const got = urls.map(() => 0), tot = urls.map(() => 0);
  const upd = () => { const t = tot.reduce((a, b) => a + b, 0); if (t) progress?.(got.reduce((a, b) => a + b, 0) / t); };
  return Promise.all(urls.map((u, i) => load(u, (e) => { got[i] = e.loaded; tot[i] = e.total || e.loaded; upd(); })
    .catch((e) => { if (optional.includes(u)) return null; throw e; })));
}
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (a, b, v) => { const k = clamp01((v - a) / (b - a)); return k * k * (3 - 2 * k); };

function isDark() {
  const t = document.documentElement.dataset.theme;
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
}
function onTheme(fn) {
  const mq = matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', fn);
  const mo = new MutationObserver(fn);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  fn();
  return () => { mq.removeEventListener('change', fn); mo.disconnect(); };
}

let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.16, 'rgba(255,255,255,.8)');
  gr.addColorStop(0.42, 'rgba(255,255,255,.2)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}
function glowSprite(color, size, fog = false) {
  const m = new THREE.SpriteMaterial({ map: glowTexture(), color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog });
  const s = new THREE.Sprite(m);
  s.scale.setScalar(size);
  s.renderOrder = 5;
  return s;
}
function countTris(obj) {
  let n = 0;
  obj.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    const g = o.geometry;
    n += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return Math.round(n);
}
const fmt = (n) => Math.round(n).toLocaleString('ru-RU');

// ------------------------------------------------------------------------------------------------ сцена
class Stage {
  constructor(host, { fov = 40, near = 0.1, far = 2000 } = {}) {
    this.host = host;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    host.insertBefore(r.domElement, host.firstChild);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(fov, 1, near, far);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    // Колесо мыши над сценой не должно отнимать прокрутку у страницы: зум включается после клика по сцене
    // и выключается, когда курсор ушёл
    this.controls.enableZoom = false;
    r.domElement.addEventListener('pointerdown', () => { this.controls.enableZoom = true; });
    r.domElement.addEventListener('pointerleave', () => { this.controls.enableZoom = false; });
    this.tickers = [];
    this.labels = [];
    this.clock = new THREE.Clock();
    this.time = 0;
    this.visible = true;
    this.hud = document.createElement('div'); this.hud.className = 'hud'; host.appendChild(this.hud);
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(host);
    this.io = new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; }, { threshold: 0.02 });
    this.io.observe(host);
    this.resize();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(this.clock.getDelta(), 0.1);
      if (!this.visible || document.hidden) return;
      this.time += dt;
      for (const t of [...this.tickers]) t(dt, this.time);
      this.controls.update();
      r.render(this.scene, this.camera);
      this.placeLabels();
      this.afterRender?.();
    };
    this.raf = requestAnimationFrame(loop);
  }
  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  setHud(items) { this.hud.innerHTML = items.filter(Boolean).map((t) => `<span>${t}</span>`).join(''); }
  label(text, obj, off = 0, maxDist = Infinity, dx = 0) {
    const el = document.createElement('div');
    el.className = 'lbl'; el.textContent = text; el.style.display = 'none';
    this.host.appendChild(el);
    const L = { el, obj, off, maxDist, dx, v: new THREE.Vector3(), show: true, hidden: false };
    this.labels.push(L);
    return L;
  }
  dropLabels(list) {
    for (const L of list) { L.el.remove(); const i = this.labels.indexOf(L); if (i >= 0) this.labels.splice(i, 1); }
  }
  placeLabels() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    for (const L of this.labels) {
      if (L.obj.isVector3) L.v.copy(L.obj); else L.obj.getWorldPosition(L.v);
      L.v.y += L.off;
      const d = L.v.distanceTo(this.camera.position);
      L.v.project(this.camera);
      let vis = L.show && !L.hidden && L.v.z < 1 && Math.abs(L.v.x) < 1.1 && Math.abs(L.v.y) < 1.1 && d < (typeof L.maxDist === 'function' ? L.maxDist() : L.maxDist);
      if (vis && !L.obj.isVector3) { let o = L.obj; while (o) { if (o.visible === false) { vis = false; break; } o = o.parent; } }
      L.el.style.display = vis ? '' : 'none';
      if (vis) L.el.style.transform = `translate(${((L.v.x * 0.5 + 0.5) * w + L.dx).toFixed(1)}px, ${((-L.v.y * 0.5 + 0.5) * h).toFixed(1)}px) translate(-50%, -120%)`;
    }
  }
  toast(text, ms = 4200) {
    if (!this.toastEl) { this.toastEl = document.createElement('div'); this.toastEl.className = 'toast'; this.host.appendChild(this.toastEl); }
    this.toastEl.textContent = text;
    this.toastEl.style.opacity = '1';
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => { if (this.toastEl) this.toastEl.style.opacity = '0'; }, ms);
  }
  tween(pos, target, dur = 1.6, done) {
    const c = this.camera, ctl = this.controls;
    const p0 = c.position.clone(), t0 = ctl.target.clone();
    if (REDUCED || dur <= 0) { c.position.copy(pos); ctl.target.copy(target); done?.(); return; }
    let k = 0;
    ctl.enabled = false;
    const f = (dt) => {
      k = Math.min(1, k + dt / dur);
      const e = ease(k);
      c.position.lerpVectors(p0, pos, e);
      ctl.target.lerpVectors(t0, target, e);
      if (k >= 1) { this.tickers.splice(this.tickers.indexOf(f), 1); ctl.enabled = true; done?.(); }
    };
    this.tickers.push(f);
  }
  frame(obj, dir = new THREE.Vector3(1, 0.55, -1.1), k = 1.5) {
    const box = new THREE.Box3().setFromObject(obj);
    const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    const r = Math.max(s.x, s.y, s.z);
    const dist = r * k / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 0.5 + r * 0.4;
    this.camera.position.copy(c).addScaledVector(dir.normalize(), dist);
    this.controls.target.copy(c);
    this.camera.near = Math.max(0.005, dist / 200);
    this.camera.updateProjectionMatrix();
    this.controls.minDistance = r * 0.6;
    this.controls.maxDistance = dist * 3;
    return { center: c, size: s, dist };
  }
  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect(); this.io.disconnect();
    this.offTheme?.();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.hud.remove();
    this.toastEl?.remove();
    for (const L of this.labels) L.el.remove();
    this.labels = [];
  }
}

// ------------------------------------------------------------------------------------------------ лодки
function makeSonar() {
  const c = document.createElement('canvas'); c.width = 192; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#071b2c'; g.fillRect(0, 0, 192, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  let acc = 0, x = 0, depth = 96;
  return {
    tex,
    step(dt) {
      acc += dt;
      if (acc < 0.08) return;
      acc = 0; x++;
      g.drawImage(c, -2, 0);
      g.fillStyle = '#071b2c'; g.fillRect(190, 0, 2, 128);
      depth = Math.max(70, Math.min(116, depth + (Math.sin(x * 0.07) + Math.sin(x * 0.019) * 1.5) * 0.9));
      const gr = g.createLinearGradient(0, depth, 0, 128);
      gr.addColorStop(0, '#ffcf4a'); gr.addColorStop(0.25, '#d2552a'); gr.addColorStop(1, '#3a1420');
      g.fillStyle = gr; g.fillRect(190, depth, 2, 128 - depth);
      if (Math.sin(x * 0.37) > 0.93 || Math.sin(x * 0.11 + 2) > 0.985) {
        const fy = 24 + ((x * 37) % 50);
        g.fillStyle = '#7cf0ff'; g.fillRect(189, fy, 3, 2);
      }
      g.fillStyle = 'rgba(124,240,255,.25)'; g.fillRect(0, 10 + (x % 2), 192, 1);
      tex.needsUpdate = true;
    },
  };
}
function plateTexture(n) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#f4efe4'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#1d2b3a'; g.lineWidth = 6; g.strokeRect(8, 8, 112, 112);
  g.fillStyle = '#1d2b3a'; g.font = '700 70px Rubik, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(n), 64, 70);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false;
  return t;
}
const JELLY_COLORS = [0xff5d5d, 0xff9a3c, 0x5fd8a8, 0x7aa8ff];
const SEAT_NAMES = ['Штурвал', 'Сзади слева', 'Сзади справа'];

export async function boats(host, { data, boat, progress, onInfo, onSlots }) {
  const st = new Stage(host, { fov: 35, near: 0.05, far: 800 });
  const { scene, camera, controls } = st;
  scene.add(new THREE.HemisphereLight(0xeaf3f7, 0x4d5c55, 1.7));
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.4); sun.position.set(-8, 14, 6); scene.add(sun);
  const fill = new THREE.DirectionalLight(0xcfe6ff, 0.6); fill.position.set(6, 4, -8); scene.add(fill);
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x4f98ad, roughness: 0.25, metalness: 0.05, transparent: true, opacity: 0.72, depthWrite: false });
  const water = new THREE.Mesh(new THREE.CircleGeometry(900, 72), waterMat);
  scene.fog = new THREE.Fog(0xcfe4ec, 70, 420);
  water.rotation.x = -Math.PI / 2; water.renderOrder = 2;
  scene.add(water);
  st.offTheme = onTheme(() => {
    scene.background = new THREE.Color(isDark() ? 0x13303d : 0xcfe4ec);
    scene.fog.color.copy(scene.background);
    waterMat.color.set(isDark() ? 0x1f5a6e : 0x4f98ad);
  });
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.autoRotate = !REDUCED;
  controls.autoRotateSpeed = 0.7;
  controls.addEventListener('start', () => { controls.autoRotate = false; });

  const meta = Object.fromEntries(data.boats.map((b) => [b.id, b]));
  const group = new THREE.Group(); scene.add(group);
  const sonar = makeSonar();
  const S = { id: null, lod: false, anchor: false, anchorK: 0, seats: false, nodes: null, seatLabels: [], jelly: null, pier: null, busy: false, info: true };
  const DEPTH = 2.6;
  let jellyP = null;
  const getJelly = () => (jellyP ||= load('cosmetics/jelly.glb').catch(() => null));

  function clearGroup() {
    group.clear();
    st.dropLabels(st.labels.slice());
    S.seatLabels = []; S.nodes = null; S.pier = null;
  }
  async function showBoat(id) {
    const url = `models/${id}${S.lod ? '_lod1' : ''}.glb`;
    const g = await loadAll([url], progress).then((a) => a[0]);
    clearGroup();
    S.id = id;
    water.position.y = 0;
    const root = g.scene.clone(true);
    group.add(root);
    const n = (name) => root.getObjectByName(name);
    const nodes = { anchor: n('anchor'), rope: n('anchor_rope'), seats: [0, 1, 2].map((i) => n('seat_' + i)), meta: n(id) };
    if (nodes.anchor) nodes.anchor.userData.y0 ??= nodes.anchor.position.y;
    root.traverse((o) => {
      if (o.isMesh && /^echosounder_screen/.test(o.name)) {
        const m = o.material.clone();
        m.map = sonar.tex; m.color = new THREE.Color(0xffffff);
        if ('emissive' in m) { m.emissive = new THREE.Color(0xffffff); m.emissiveMap = sonar.tex; m.emissiveIntensity = 0.85; }
        o.material = m;
      }
    });
    S.nodes = nodes;
    applyAnchor();
    if (S.framedFor !== id) {
      st.frame(root, new THREE.Vector3(1.05, 0.62, -1.15), 0.82);
      S.framedFor = id;
    }
    controls.maxDistance = 60;
    const tris = countTris(root);
    if (S.seats) await placeSeats();
    const ex = nodes.meta?.userData || {};
    const b = meta[id];
    S.hudBase = [`«${b.name}»${S.lod ? ' · LOD1' : ''}`, `${fmt(tris)} треугольников`];
    S.needCalls = true;
    onInfo?.(`Модель ${S.lod ? 'LOD1' : 'LOD0'}: ${fmt(tris)} треугольников (бюджет дизайна ${fmt(S.lod ? b.tris.lod1 : b.tris.lod0)}). Корпус по прототипу ${ex.length_m ? String(ex.length_m).replace('.', ',') + ' м' : ''}, ${ex.seats || 3} места.`);
  }
  function applyAnchor() {
    const nd = S.nodes;
    if (!nd?.anchor) return;
    const d = DEPTH * ease(S.anchorK);
    nd.anchor.position.y = nd.anchor.userData.y0 - d;
    if (nd.rope) nd.rope.scale.y = 0.02 + d;
  }
  async function placeSeats() {
    const nd = S.nodes;
    if (!nd) return;
    const jg = await getJelly();
    nd.seats.forEach((seat, i) => {
      if (!seat) return;
      let m = seat.getObjectByName('seat-marker');
      if (!m) {
        if (jg) {
          m = jg.scene.clone(true);
          m.scale.setScalar(0.42);
          m.traverse((o) => {
            if (o.isMesh && /jelly/.test(o.material?.name || '')) { o.material = o.material.clone(); o.material.color.setHex(JELLY_COLORS[i]); }
          });
        } else {
          m = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.04, 8, 24), new THREE.MeshBasicMaterial({ color: 0xffb347 }));
          m.rotation.x = Math.PI / 2; m.position.y = 0.03;
        }
        m.name = 'seat-marker';
        seat.add(m);
        S.seatLabels.push(st.label(SEAT_NAMES[i], seat, jg ? 0.85 : 0.35, Infinity, [0, -46, 46][i]));
      }
      m.visible = S.seats;
    });
    S.seatLabels.forEach((L) => { L.show = S.seats; });
  }

  // ---------------------------------------------------------------- стоянка
  const ids = data.boats.map((b) => b.id);
  const INIT = [['northsilver', 'Tester1', 12], ['volzhanka', 'Tester2', 31], ['albakor', 'Tester3', 4], null, ['volzhanka', 'Tester4', 18], ['albakor', 'Tester5', 26], ['northsilver', 'Tester6', -1], ['volzhanka', 'Tester7', 9], null, ['albakor', 'Tester8', 22]];
  let nextTester = 9;
  async function showPier() {
    const [pg, ...bg] = await loadAll(['models/boat-pier.glb', ...ids.map((id) => `models/${id}_lod1.glb`)], progress);
    clearGroup();
    S.id = 'pier';
    water.position.y = -1.25;
    const pier = pg.scene.clone(true);
    group.add(pier);
    group.updateMatrixWorld(true);
    const protos = Object.fromEntries(ids.map((id, i) => [id, bg[i]]));
    const slots = [];
    for (let i = 1; i <= 10; i++) {
      const nn = String(i).padStart(2, '0');
      const slip = pier.getObjectByName('slip_' + nn);
      const plate = pier.getObjectByName('slip_no_' + nn);
      if (plate?.isMesh) { plate.material = plate.material.clone(); plate.material.map = plateTexture(i); plate.material.color = new THREE.Color(0xffffff); plate.material.needsUpdate = true; }
      const p = new THREE.Vector3(), q = new THREE.Quaternion();
      slip.getWorldPosition(p); slip.getWorldQuaternion(q);
      slots.push({ p, q, fwd: new THREE.Vector3(0, 0, -1).applyQuaternion(q), boat: null });
    }
    const lenOf = (id) => (protos[id].scene.getObjectByName(id)?.userData?.length_m) || meta[id].length;
    const placeAt = (slot, id) => {
      const b = protos[id].scene.clone(true);
      const L = lenOf(id);
      b.quaternion.copy(slot.q);
      b.position.copy(slot.p).addScaledVector(slot.fwd, -(L / 2 + 0.6));
      b.userData.home = b.position.clone();
      b.userData.len = L;
      group.add(b);
      return b;
    };
    INIT.forEach((s, i) => {
      if (!s) return;
      const [id, owner, idle] = s;
      slots[i].boat = { id, owner, idle: Math.max(0, idle), aboard: idle < 0, obj: placeAt(slots[i], id) };
    });
    S.pier = { slots, placeAt, lenOf };
    st.tween(new THREE.Vector3(26, 17, 36), new THREE.Vector3(0, -1, 12), S.framedFor === 'pier' ? 0 : 0.01);
    S.framedFor = 'pier';
    controls.maxDistance = 120;
    controls.minDistance = 4;
    S.hudBase = ['Стоянка «У Семёна»', `${slots.filter((x) => x.boat).length} из 10 мест занято`];
    S.needCalls = true;
    reportSlots();
  }
  function reportSlots(oldest) {
    const P = S.pier;
    if (!P) return;
    onSlots?.(P.slots.map((s, i) => (s.boat ? { name: meta[s.boat.id].name, owner: s.boat.owner, idle: s.boat.idle, aboard: s.boat.aboard, oldest: i === oldest } : null)));
    S.hudBase = ['Стоянка «У Семёна»', `${P.slots.filter((x) => x.boat).length} из 10 мест занято`];
    S.needCalls = true;
  }
  function animate(obj, from, to, dur, extra) {
    return new Promise((res) => {
      let k = 0;
      if (REDUCED) { obj.position.copy(to); extra?.(1); res(); return; }
      const f = (dt) => {
        k = Math.min(1, k + dt / dur);
        obj.position.lerpVectors(from, to, ease(k));
        extra?.(k);
        if (k >= 1) { st.tickers.splice(st.tickers.indexOf(f), 1); res(); }
      };
      st.tickers.push(f);
    });
  }
  async function ninth() {
    const P = S.pier;
    if (!P || S.busy) return;
    S.busy = true;
    const freeI = P.slots.findIndex((s) => !s.boat);
    const id = ids[nextTester % 3];
    const owner = 'Tester' + nextTester++;
    const slot = P.slots[freeI];
    const obj = P.placeAt(slot, id);
    const home = obj.position.clone();
    const from = home.clone().addScaledVector(slot.fwd, -26);
    obj.position.copy(from);
    slot.boat = { id, owner, idle: 0, aboard: true, obj };
    st.toast(`${owner} вызвал «${meta[id].name}» — лодка встаёт в берт ${freeI + 1}. Занято 9 из 10.`);
    reportSlots();
    await animate(obj, from, home, 3.2);
    // свободных меньше двух — уходит та, что дольше всех стоит без хозяина
    let oi = -1;
    P.slots.forEach((s, i) => { if (s.boat && !s.boat.aboard && (oi < 0 || s.boat.idle > P.slots[oi].boat.idle)) oi = i; });
    reportSlots(oi);
    await new Promise((r) => setTimeout(r, REDUCED ? 300 : 900));
    if (oi >= 0) {
      const gone = P.slots[oi];
      const ob = gone.boat.obj;
      st.toast(`${gone.boat.owner}: твоя «${meta[gone.boat.id].name}» ушла со стоянки — стояла без хозяина ${gone.boat.idle} мин. Снова свободно 2 места.`, 5200);
      const a = ob.position.clone(), b = a.clone().addScaledVector(gone.fwd, -16);
      b.y -= 0.9;
      await animate(ob, a, b, 2.4, (k) => ob.scale.setScalar(1 - 0.7 * k));
      group.remove(ob);
      gone.boat = null;
    }
    P.slots.forEach((s) => { if (s.boat && !s.boat.aboard) s.boat.idle += 4; });
    slot.boat.aboard = false;
    reportSlots();
    S.busy = false;
  }

  // ---------------------------------------------------------------- тики
  st.tickers.push((dt, t) => {
    sonar.step(dt);
    if (S.nodes) {
      const target = S.anchor ? 1 : 0;
      if (S.anchorK !== target) {
        const dur = Math.max(0.3, meta[S.id]?.anchorS || 1);
        S.anchorK = target > S.anchorK ? Math.min(1, S.anchorK + dt / dur) : Math.max(0, S.anchorK - dt / dur);
        applyAnchor();
      }
    }
    if (!REDUCED && S.id !== 'pier') {
      group.position.y = Math.sin(t * 1.3) * 0.035;
      group.rotation.z = Math.sin(t * 0.9) * 0.018;
      group.rotation.x = Math.sin(t * 0.7 + 1) * 0.01;
    } else { group.position.y = 0; group.rotation.set(0, 0, 0); }
  });
  st.afterRender = () => {
    if (!S.needCalls) return;
    S.needCalls = false;
    st.setHud([...(S.hudBase || []), `${st.renderer.info.render.calls} отрисовок`]);
  };

  const api = {
    async show(id) {
      if (id === 'pier') await showPier();
      else await showBoat(id);
    },
    anchor() { S.anchor = !S.anchor; if (S.anchor && !REDUCED) st.toast(`Якорь: ${String(meta[S.id]?.anchorS ?? 1).replace('.', ',')} с — как у этой лодки в игре`, 2600); return S.anchor; },
    seats() { S.seats = !S.seats; placeSeats(); return S.seats; },
    async lod() { S.lod = !S.lod; if (S.id && S.id !== 'pier') await showBoat(S.id); return S.lod; },
    ninth,
    dispose() { st.dispose(); },
  };
  // lod() у кнопки читается синхронно — вернём новое состояние сразу
  const lodAsync = api.lod;
  api.lod = () => { lodAsync(); return S.lod; };
  await api.show(boat);
  return api;
}

// ------------------------------------------------------------------------------------------------ остров
function labelTexture(text, aspect, faded) {
  const W = 512, H = Math.max(64, Math.round(W / Math.max(0.5, aspect)));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = faded ? '#d9d1c0' : '#ede4cf'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(90,70,40,${Math.random() * 0.06})`; g.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 10, 1 + Math.random() * 3); }
  g.fillStyle = faded ? 'rgba(60,48,36,.55)' : '#2a241c';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const lines = String(text).split('\n');
  let size = Math.min(H * 0.62 / lines.length, 120);
  g.font = `700 ${size}px Rubik, system-ui, sans-serif`;
  const widest = Math.max(...lines.map((l) => g.measureText(l).width));
  if (widest > W * 0.88) { size *= W * 0.88 / widest; g.font = `700 ${size}px Rubik, system-ui, sans-serif`; }
  lines.forEach((l, i) => g.fillText(l, W / 2, H / 2 + (i - (lines.length - 1) / 2) * size * 1.15));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.anisotropy = 4;
  return t;
}

export async function isle(host, { data, cos, progress, onDist, fog }) {
  const st = new Stage(host, { fov: 50, near: 0.5, far: 6000 });
  const { scene, camera, controls } = st;
  const files = ['island-terrain', 'lighthouse', 'pier-breakwater', 'houses', 'keeper-house', 'cannery', 'schooner-wreck', 'props'].map((n) => `models/island/${n}.glb`);
  const ig = cos?.npc?.ignat;
  const ignatUrl = ig?.glb?.[0] ? cos.base + ig.glb[0] : null;
  const urls = ignatUrl ? [...files, ignatUrl] : files;
  const got = await loadAll(urls, progress, ignatUrl ? [ignatUrl] : []);
  const world = new THREE.Group(); scene.add(world);
  for (let i = 0; i < files.length; i++) world.add(got[i].scene.clone(true));
  world.updateMatrixWorld(true);

  const W = data.weather;
  const colN = new THREE.Color(W.normal.color), colE = new THREE.Color(W.fogEvent.color);
  scene.fog = new THREE.Fog(colN.clone(), W.normal.fogNear, W.normal.fogFar);
  scene.background = colN.clone();
  st.renderer.toneMappingExposure = W.normal.exposure || 0.95;
  scene.add(new THREE.HemisphereLight(0xf6f1e8, 0x5f665b, 2.3));
  const sun = new THREE.DirectionalLight(0xffe7c8, 0.75); sun.position.set(-300, 180, 60); scene.add(sun);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshStandardMaterial({ color: 0x86a09c, roughness: 0.5, metalness: 0.05 }));
  water.rotation.x = -Math.PI / 2; water.position.y = -0.02;
  scene.add(water);

  const lit = [];
  world.traverse((o) => {
    if (o.userData?.hidden_with_full_island) o.visible = false;
    if (o.isMesh && o.name === 'label_season_board') {
      const now = new Date(), msk = new Date(now.getTime() + (now.getTimezoneOffset() + 180) * 60000);
      const h = msk.getHours(), m = msk.getMinutes();
      const left = h % 2 === 1 && m < 10 ? 0 : (h % 2 === 1 ? 120 : 60) - m;
      o.userData.text = left ? `Сезон острова\nчерез ${left} мин` : 'Сезон острова\nидёт сейчас!';
    }
    if (o.isMesh && /^label_/.test(o.name) && o.userData?.text) {
      o.geometry.computeBoundingBox();
      const s = o.geometry.boundingBox.getSize(new THREE.Vector3());
      const dims = [s.x, s.y, s.z].sort((a, b) => b - a);
      o.material = o.material.clone();
      o.material.map = labelTexture(o.userData.text, dims[0] / Math.max(0.01, dims[1]), o.userData.faded);
      o.material.color = new THREE.Color(0xffffff);
      o.material.needsUpdate = true;
    }
  });
  const get = (n) => { const all = world.getObjectsByProperty('name', n); return all.find((o) => !o.isMesh) || all[0]; };
  // ---------------------------------------------------------------- маяк
  const focus = get('lamp_focus');
  const lampPos = focus ? focus.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(75, 40, -60);
  const lamp = get('lamp'), lens = get('lens');
  let lampBase = null;
  if (lamp?.isMesh) { lamp.material = lamp.material.clone(); lampBase = lamp.material.color.clone(); }
  const BEAM = 150;
  const beamGeo = new THREE.CylinderGeometry(0.5, 11, BEAM, 32, 1, true);
  beamGeo.translate(0, -BEAM / 2, 0);
  beamGeo.rotateZ(Math.PI / 2);
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0xffc56a) }, uI: { value: 0.4 }, uLen: { value: BEAM } },
    vertexShader: 'varying float vD; varying vec3 vN; varying vec3 vV; uniform float uLen;\nvoid main(){ vD = position.x / uLen; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying float vD; varying vec3 vN; varying vec3 vV; uniform vec3 uColor; uniform float uI;\nvoid main(){ float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.3); float a = uI * pow(1.0 - clamp(vD, 0.0, 1.0), 1.4) * edge; gl_FragColor = vec4(uColor, clamp(a, 0.0, 0.9)); }',
    transparent: true, depthWrite: false, blending: THREE.NormalBlending, side: THREE.DoubleSide, fog: false,
  });
  const beams = new THREE.Group(); beams.position.copy(lampPos);
  const b1 = new THREE.Mesh(beamGeo, beamMat), b2 = new THREE.Mesh(beamGeo, beamMat);
  b2.rotation.y = Math.PI;
  b1.renderOrder = b2.renderOrder = 6;
  beams.add(b1, b2);
  scene.add(beams);
  const halo = glowSprite(0xffc56a, 10); halo.position.copy(lampPos); scene.add(halo);
  // ---------------------------------------------------------------- буи и огни
  const BUOY = [[/^buoy_red_\d+$/, 0xff4a3a, 4, 0], [/^buoy_green_\d+$/, 0x52ff8f, 4, 2], [/^buoy_route_\d+$/, 0xffffff, 5, 1], [/^buoy_bell_\d+$/, 0xffb04a, 3, 0.5], [/^buoy_danger_\d+$/, 0xffd84a, 1.5, 0]];
  world.traverse((o) => {
    for (const [re, col, per, ph] of BUOY) {
      if (!re.test(o.name)) continue;
      const box = new THREE.Box3().setFromObject(o);
      const c = box.getCenter(new THREE.Vector3());
      const s = glowSprite(col, 3.2);
      s.position.set(c.x, box.max.y - 0.25, c.z);
      scene.add(s);
      lit.push({ s, per, ph, base: 3.2 });
    }
  });
  const mole = get('mole_light');
  if (mole) { const s = glowSprite(0xff3b2e, 3.4); mole.getWorldPosition(s.position); scene.add(s); lit.push({ s, per: 3, ph: 0.3, base: 3.4 }); }
  const bell = get('buoy_bell_01_bell');
  // ---------------------------------------------------------------- Игнат
  let ignat = null, mixer = null, acts = {};
  if (ignatUrl && got[files.length]) {
    const g = got[files.length];
    ignat = g.scene.clone(true);
    const spot = get('npc_ignat');
    if (spot) { spot.getWorldPosition(ignat.position); ignat.rotation.y = spot.userData?.yaw_game ?? -Math.PI / 2; }
    else ignat.position.set(54.5, 2.6, -16.4);
    scene.add(ignat);
    mixer = new THREE.AnimationMixer(ignat);
    for (const clip of g.animations) acts[clip.name] = mixer.clipAction(clip);
    if (acts.idle && !REDUCED) acts.idle.play();
    mixer.addEventListener('finished', (e) => { if (e.action === acts.wave && acts.idle) { acts.idle.reset().play(); acts.idle.crossFadeFrom(acts.wave, 0.4, false); } });
  }
  // ---------------------------------------------------------------- подписи
  const fogFar = () => (scene.fog ? scene.fog.far * 1.05 : Infinity);
  const L = (name, text, off) => {
    const o = get(name);
    if (!o) return;
    const box = new THREE.Box3().setFromObject(o);
    const p = box.getCenter(new THREE.Vector3()); p.y = box.max.y + off;
    st.label(text, p, 0, fogFar);
  };
  L('lighthouse', 'Маяк «Последний свет»', 3);
  L('keeper_house', 'Дом смотрителя', 1.5);
  L('cannery', 'Консервный завод «Маяк»', 1.5);
  L('schooner_wreck', 'Остов шхуны', 1.5);
  L('buoy_route_01', 'F6', 1);
  L('buoy_bell_01', 'Колокольный буй', 1);
  const moleTip = get('fish_7'); if (moleTip) st.label('Мол · 8 мест рыбалки', moleTip, 3, fogFar);
  const berth = get('berth_2'); if (berth) st.label('Причал · 6 бертов', berth, 3, fogFar);
  if (ignat) st.label('Игнат', ignat, 2.2, () => 60);
  const ray = new THREE.Raycaster();
  const solid = [];
  world.traverse((o) => { if (o.isMesh && o.visible) solid.push(o); });
  let occT = 0;
  st.tickers.push((dt) => {
    occT += dt;
    if (occT < 0.3) return;
    occT = 0;
    const cam = camera.position;
    for (const Lb of st.labels) {
      const p = Lb.obj.isVector3 ? Lb.obj.clone() : Lb.obj.getWorldPosition(new THREE.Vector3());
      p.y += Lb.off;
      const d = p.distanceTo(cam);
      ray.set(cam, p.clone().sub(cam).normalize());
      ray.far = d - 2;
      const hit = ray.intersectObjects(solid, false)[0];
      Lb.hidden = !!hit;
    }
  });

  // ---------------------------------------------------------------- туман
  const F = { t: 0, off: false, density: 0 };
  function setFog({ t, off }) {
    F.t = t; F.off = off;
    const near = THREE.MathUtils.lerp(W.normal.fogNear, W.fogEvent.fogNear, t);
    const far = THREE.MathUtils.lerp(W.normal.fogFar, W.fogEvent.fogFar, t);
    const col = colN.clone().lerp(colE, t);
    scene.fog.color.copy(col);
    scene.background.copy(col);
    if (off) { scene.fog.near = 4000; scene.fog.far = 9000; } else { scene.fog.near = near; scene.fog.far = far; }
    F.density = off ? 0 : 1 - (far - 85) / (160 - 85) * 0.4;
  }
  setFog(fog || { t: 0, off: false });

  // ---------------------------------------------------------------- камера
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const VIEWS = {
    boat: [V3(178, 8, 44), V3(58, 14, -22)],
    top: [V3(70, 230, 250), V3(15, 0, -10)],
  };
  camera.position.copy(VIEWS.boat[0]);
  controls.target.copy(VIEWS.boat[1]);
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.maxDistance = 900;
  controls.minDistance = 3;
  const dockLook = V3(70, 3, -8);
  const path = new THREE.CatmullRomCurve3([V3(660, 9, -122), V3(500, 8, -92), V3(395, 7, -52), V3(310, 6.5, -45), V3(246, 6, -43.6), V3(187, 5.5, -33), V3(128, 5, -22.6), V3(104, 4.5, -15), V3(96, 4, -14)]);
  const FLY = { on: false, k: 0, dur: 34 };
  let houseMarks = null;
  function stopFly() {
    if (!FLY.on) return;
    FLY.on = false; controls.enabled = true;
    onDist?.(dist(), false);
  }
  st.renderer.domElement.addEventListener('pointerdown', stopFly);
  st.renderer.domElement.addEventListener('wheel', stopFly, { passive: true });
  const dist = () => Math.hypot(camera.position.x, camera.position.z);
  function clearHouse() { if (houseMarks) { houseMarks.forEach((m) => scene.remove(m)); st.dropLabels(houseMarks.labels); houseMarks = null; } }
  function go(act) {
    if (act === 'approach') {
      if (FLY.on) { stopFly(); return 'stopped'; }
      clearHouse();
      FLY.on = true; FLY.k = 0; FLY.held = 0;
      controls.enabled = false;
      return 'started';
    }
    stopFly();
    if (act === 'boat') { clearHouse(); st.tween(VIEWS.boat[0], VIEWS.boat[1]); }
    if (act === 'top') { clearHouse(); st.tween(VIEWS.top[0], VIEWS.top[1], 2); }
    if (act === 'ignat' && ignat) {
      clearHouse();
      const p = ignat.position;
      st.tween(V3(p.x + 5.2, p.y + 2.1, p.z + 2.4), V3(p.x, p.y + 1.25, p.z), 2, () => {
        if (acts.wave) { acts.wave.reset(); acts.wave.setLoop(THREE.LoopOnce, 1); acts.wave.clampWhenFinished = false; acts.wave.play(); if (acts.idle) acts.wave.crossFadeFrom(acts.idle, 0.3, false); }
      });
    }
    if (act === 'house') {
      clearHouse();
      const a = get('house_a'), b = get('house_a_2');
      houseMarks = [];
      houseMarks.labels = [];
      for (const [o, t] of [[a, 'Дом A'], [b, 'Пятый дом — копия дома A']]) {
        if (!o) continue;
        const box = new THREE.Box3().setFromObject(o).expandByScalar(0.6);
        const hl = new THREE.Box3Helper(box, 0xffa640);
        hl.material.transparent = true; hl.material.depthTest = false; hl.renderOrder = 9;
        scene.add(hl); houseMarks.push(hl);
        const c = box.getCenter(new THREE.Vector3()); c.y = box.max.y;
        houseMarks.labels.push(st.label(t, c, 1.2));
      }
      st.tween(V3(64, 38, 46), V3(20, 3, -12), 2);
    }
    return 'ok';
  }
  // ---------------------------------------------------------------- кадр
  const tmp = new THREE.Vector3();
  let distAcc = 0;
  const STEPS = [0, 0.32, 0.55, 0.72, 0.86, 1];
  st.tickers.push((dt, t) => {
    // огонь маяка: два луча, оборот 12 с — вспышка раз в 6 с
    const th = REDUCED ? 0.9 : t * Math.PI * 2 / 12;
    beams.rotation.y = th;
    if (lens && !REDUCED) lens.rotateOnWorldAxis(THREE.Object3D.DEFAULT_UP, dt * Math.PI * 2 / 12);
    tmp.copy(camera.position).sub(lampPos); tmp.y = 0; tmp.normalize();
    const bx = Math.cos(th), bz = -Math.sin(th);
    const flash = Math.pow(Math.max(0, Math.abs(bx * tmp.x + bz * tmp.z)), 40) * (bx * tmp.x + bz * tmp.z > -2 ? 1 : 0);
    beamMat.uniforms.uI.value = (F.off ? 0.18 : 0.42 + 0.3 * F.density) * (0.85 + 0.35 * flash);
    halo.material.opacity = 0.6 + 0.4 * flash;
    const dl = camera.position.distanceTo(lampPos);
    halo.scale.setScalar(Math.max(9, dl * 0.07) * (1 + 1.4 * flash));
    if (lampBase) lamp.material.color.copy(lampBase).multiplyScalar(1.3 + 2.5 * flash);
    // буи
    const ff = scene.fog.far;
    for (const b of lit) {
      const on = REDUCED ? 1 : (((t + b.ph) % b.per) < Math.min(1, b.per * 0.35) ? 1 : 0.18);
      const d = camera.position.distanceTo(b.s.position);
      const vis = F.off ? 1 : clamp01((ff * 1.7 - d) / (ff * 0.6));
      b.s.material.opacity = on * vis;
      b.s.scale.setScalar(b.base * Math.max(1, d / 90));
    }
    if (bell && !REDUCED) { bell.rotation.x = Math.sin(t * 1.9) * 0.22; bell.rotation.z = Math.sin(t * 1.3 + 1) * 0.12; }
    mixer?.update(dt);
    if (houseMarks) for (const m of houseMarks) m.material.opacity = 0.55 + 0.45 * Math.sin(t * 4);
    // подход с моря
    if (FLY.on) {
      let k;
      if (REDUCED) {
        FLY.held += dt;
        const i = Math.min(STEPS.length - 1, Math.floor(FLY.held / 3));
        k = STEPS[i];
        if (FLY.held > STEPS.length * 3) k = 1;
      } else {
        FLY.k = Math.min(1, FLY.k + dt / FLY.dur);
        k = ease(FLY.k) * 0.15 + FLY.k * 0.85;
      }
      camera.position.copy(path.getPointAt(Math.min(1, k)));
      const look = lampPos.clone().lerp(dockLook, smooth(0.55, 0.92, k));
      controls.target.copy(look);
      camera.lookAt(look);
      if (k >= 1) { FLY.on = false; controls.enabled = true; onDist?.(dist(), false); }
    }
    distAcc += dt;
    if (distAcc > 0.12) { distAcc = 0; onDist?.(dist(), FLY.on); }
  });
  st.afterRender = () => {
    if (st._hudDone) return;
    st._hudDone = true;
    st.setHud([`${fmt(countTris(world))} треугольников`, '8 моделей острова', ignat ? '+ Игнат' : null]);
  };
  return { setFog, go, dispose() { st.renderer.domElement.removeEventListener('pointerdown', stopFly); st.dispose(); } };
}

// ------------------------------------------------------------------------------------------------ косметика
export async function cos(host, { cos: C, key, item, progress, tools }) {
  const st = new Stage(host, { fov: 30, near: 0.01, far: 200 });
  const { scene, controls } = st;
  scene.add(new THREE.HemisphereLight(0xf2f6f8, 0x7b7461, 1.9));
  const key1 = new THREE.DirectionalLight(0xfff0dc, 2.3); key1.position.set(2.5, 4, 3); scene.add(key1);
  const rim = new THREE.DirectionalLight(0xd7ecff, 0.9); rim.position.set(-3, 2, -3); scene.add(rim);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0xe8dbb6, roughness: 0.95 });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(4, 64), groundMat);
  ground.rotation.x = -Math.PI / 2;
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x4f98ad, roughness: 0.2, transparent: true, opacity: 0.8, depthWrite: false });
  const water = new THREE.Mesh(new THREE.CircleGeometry(4, 64), waterMat);
  water.rotation.x = -Math.PI / 2; water.renderOrder = 2;
  scene.add(ground, water);
  st.offTheme = onTheme(() => {
    const d = isDark();
    scene.background = new THREE.Color(d ? 0x15252f : 0xdcebf1);
    groundMat.color.set(d ? 0x6d6447 : 0xe8dbb6);
    waterMat.color.set(d ? 0x1f5a6e : 0x4f98ad);
  });
  controls.autoRotate = !REDUCED;
  controls.autoRotateSpeed = 1.1;
  controls.addEventListener('start', () => { controls.autoRotate = false; });
  const group = new THREE.Group(); scene.add(group);
  const S = { mixers: [], halos: [], blink: [], parts: {}, token: 0, auto: null };

  function clear() {
    group.clear();
    S.mixers.forEach((m) => m.stopAllAction());
    S.mixers = []; S.halos = []; S.blink = []; S.parts = {};
    clearInterval(S.auto);
    if (tools) tools.innerHTML = '';
  }
  async function show(k, it) {
    const token = ++S.token;
    const urls = (it.glb || []).map((f) => C.base + f);
    if (!urls.length) { clear(); return; }
    const got = await loadAll(urls, progress);
    if (token !== S.token) return;
    clear();
    const water3 = it.stage === 'water';
    ground.visible = !water3; water.visible = water3;
    got.forEach((g, i) => {
      const root = g.scene.clone(true);
      root.name = (it.glb[i] || '').replace('.glb', '');
      group.add(root);
      S.parts[root.name] = root;
      root.traverse((o) => {
        const hs = o.userData?.halo_size;
        if (hs) {
          const sp = glowSprite(new THREE.Color(o.userData.halo_color || '#ffb04a'), hs * 1.4);
          o.add(sp);
          S.halos.push(sp);
        }
        if (o.isMesh && /tip_light|lantern_glow|^light$/.test(o.name)) {
          o.material = o.material.clone();
          S.blink.push({ m: o.material, base: o.material.color.clone() });
        }
      });
      if (g.animations?.length) {
        const mixer = new THREE.AnimationMixer(root);
        const acts = Object.fromEntries(g.animations.map((c) => [c.name, mixer.clipAction(c)]));
        S.mixers.push(mixer);
        root.userData.acts = acts;
        mixer.addEventListener('finished', (e) => {
          if (acts.idle && e.action !== acts.idle) { acts.idle.reset().play(); acts.idle.crossFadeFrom(e.action, 0.35, false); }
        });
        if (acts.idle && !REDUCED) acts.idle.play();
      }
    });
    const dir = k === 'r:lighthouse' ? new THREE.Vector3(1.4, 0.5, 0.2) : new THREE.Vector3(0.7, 0.42, -1.1);
    st.frame(group, dir, k === 'r:lighthouse' ? 1.1 : 1.35);
    st.setHud([`${fmt(countTris(group))} треугольников`, it.glb.join(' + ')]);
    // кнопки
    if (!tools) return;
    const btns = [];
    const animRoot = Object.values(S.parts).find((r) => r.userData.acts);
    if (it.anims && animRoot) {
      for (const [name, label] of Object.entries(it.anims)) {
        if (!animRoot.userData.acts[name]) continue;
        btns.push(`<button class="btn" type="button" data-anim="${name}">${label}</button>`);
      }
    }
    if (it.mannequin) {
      for (const [file, label] of [['keeper-hat', 'Шапка'], ['keeper-sweater', 'Свитер']]) {
        if (S.parts[file]) btns.push(`<button class="btn" type="button" data-part="${file}" aria-pressed="true">${label}</button>`);
      }
    }
    tools.innerHTML = btns.join('') || '<span class="muted small">Крути мышью, колесо — ближе.</span>';
    tools.onclick = (e) => {
      const a = e.target.closest('[data-anim]');
      if (a && animRoot) {
        const acts = animRoot.userData.acts, act = acts[a.dataset.anim];
        if (a.dataset.anim === 'idle') { Object.values(acts).forEach((x) => x !== act && x.fadeOut(0.3)); act.reset().fadeIn(0.3).play(); return; }
        act.reset(); act.setLoop(THREE.LoopOnce, 1); act.clampWhenFinished = false;
        if (a.dataset.anim === 'blink') { act.play(); return; }
        act.play();
        if (acts.idle?.isRunning()) act.crossFadeFrom(acts.idle, 0.3, false);
      }
      const p = e.target.closest('[data-part]');
      if (p) {
        const r = S.parts[p.dataset.part];
        r.visible = !r.visible;
        p.setAttribute('aria-pressed', String(r.visible));
      }
    };
    // поплавок-колокол: «дзынь» сам раз в 5 с
    if (animRoot?.userData.acts.ring && !REDUCED) {
      const ring = animRoot.userData.acts.ring;
      const fire = () => { ring.reset(); ring.setLoop(THREE.LoopOnce, 1); ring.play(); };
      fire();
      S.auto = setInterval(fire, 5000);
    }
  }
  st.tickers.push((dt, t) => {
    S.mixers.forEach((m) => m.update(dt));
    const pulse = REDUCED ? 1 : 0.8 + 0.2 * Math.sin(t * 2.2);
    const fl = REDUCED ? 0 : Math.max(0, 1 - ((t % 6) / 0.6)); // вспышка раз в 6 с
    for (const h of S.halos) h.material.opacity = 0.65 * pulse + 0.35 * fl;
    for (const b of S.blink) b.m.color.copy(b.base).multiplyScalar(1 + 1.5 * fl);
    if (!REDUCED && water.visible) group.position.y = Math.sin(t * 2) * 0.008;
    else group.position.y = 0;
  });
  await show(key, item);
  return { show, clear() { S.token++; clear(); }, dispose() { clearInterval(S.auto); st.dispose(); } };
}

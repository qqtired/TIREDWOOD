
/* ---- 4. 3D: один WebGLRenderer на всю страницу ----------------------
   Холст переезжает в тот просмотрщик, который сейчас виднее всего на экране.
   Остальные показывают превью (PNG) или концепт-арт. */
const Stage = {
  state: 'idle', views: [], ratios: new Map(), active: null, cache: new Map(), cur: null, playing: false, locked: false, raf: 0,
  init() {
    if (this.initP) return this.initP;
    this.initP = (async () => {
      try {
        for (const u of THREE_URLS) await loadScript(u);
        if (!window.THREE || !THREE.GLTFLoader || !THREE.OrbitControls) throw new Error('three не готов');
        const canvas = document.createElement('canvas');
        canvas.className = 'stage';
        canvas.setAttribute('aria-label', '3D-модель, можно вращать мышью или пальцем');
        const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        r.outputEncoding = THREE.sRGBEncoding;
        r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        r.setClearColor(0x000000, 0);
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 2000);
        const controls = new THREE.OrbitControls(camera, canvas);
        controls.enableDamping = true; controls.dampingFactor = 0.1; controls.enablePan = false; controls.enableZoom = false;
        controls.autoRotateSpeed = 2.2;
        canvas.style.touchAction = 'pan-y';                      // вертикальный свайп листает страницу
        controls.addEventListener('change', () => this.kick());
        scene.add(new THREE.HemisphereLight(0xf0dcc0, 0x3a2c25, 0.7));
        const key = new THREE.DirectionalLight(0xffe2b4, 1.1); key.position.set(3, 6, 5); scene.add(key);
        const rim = new THREE.DirectionalLight(0x7be8da, 0.65); rim.position.set(-5, 3, -4); scene.add(rim);
        const fill = new THREE.DirectionalLight(0xb88fff, 0.35); fill.position.set(-3, 2, 5); scene.add(fill);
        const holder = new THREE.Group(); scene.add(holder);
        const floor = new THREE.Mesh(new THREE.CircleGeometry(1, 72), new THREE.MeshStandardMaterial({ color: 0x4d3a29, roughness: 1, metalness: 0 }));
        floor.rotation.x = -Math.PI / 2; floor.position.y = -0.0015; scene.add(floor);
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.975, 1, 72), new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.35 }));
        ring.rotation.x = -Math.PI / 2; ring.position.y = 0.001; scene.add(ring);
        const sc = document.createElement('canvas'); sc.width = sc.height = 128;
        const g = sc.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
        gr.addColorStop(0, 'rgba(0,0,0,.7)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
        const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
        shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.003; scene.add(shadow);
        Object.assign(this, { canvas, renderer: r, scene, camera, controls, holder, floor, ring, shadow, clock: new THREE.Clock(), loader: new THREE.GLTFLoader() });
        canvas.addEventListener('wheel', (e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); this.zoom(e.deltaY > 0 ? 1.12 : 0.89); } }, { passive: false });
        canvas.addEventListener('pointerdown', () => { this.locked = true; });
        window.addEventListener('pointerup', () => { this.locked = false; this.pick(); });
        this.ro = new ResizeObserver(() => this.resize()); if (this.active) this.ro.observe(this.active.el);
        this.state = 'ready';
        return true;
      } catch (e) { console.warn('[3D] недоступно:', e.message); this.state = 'failed'; this.views.forEach((v) => v.refresh()); return false; }
    })();
    return this.initP;
  },
  register(v) {
    this.views.push(v);
    if (!this.io) {
      this.io = new IntersectionObserver((es) => { es.forEach((e) => { const view = this.views.find((x) => x.el === e.target); if (view) this.ratios.set(view, e.isIntersecting ? e.intersectionRatio : 0); }); this.pick(); }, { threshold: [0, 0.15, 0.3, 0.5, 0.7, 0.9, 1] });
    }
    this.io.observe(v.el);
  },
  pick() {
    if (this.locked) return;
    let best = null, br = 0.12;
    for (const v of this.views) { const r = this.ratios.get(v) || 0; if (r > br) { best = v; br = r; } }
    if (this.active && best && best !== this.active && (this.ratios.get(this.active) || 0) >= br - 0.06) best = this.active;
    if (best && best !== this.active) this.attach(best);
    else if (!best && this.active) this.detach();
  },
  attach(v) {
    if (this.active === v) return;
    this.detach();
    this.active = v;
    if (this.ro) { this.ro.disconnect(); this.ro.observe(v.el); }
    this.viewChanged(v);
  },
  detach() {
    if (this.active) { this.active.setCanvas(false); }
    if (this.canvas && this.canvas.parentNode) this.canvas.remove();
    this.active = null; this.playing = false;
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
  },
  async viewChanged(v) {
    if (this.active !== v) return;
    if (!v.def || !v.def.glbFile) { v.setCanvas(false); if (this.canvas && this.canvas.parentNode) this.canvas.remove(); return; }
    if (this.state === 'failed') return;
    if (this.state !== 'ready') { v.setBusy(true); const ok = await this.init(); v.setBusy(false); if (!ok) return; }
    if (this.active !== v) return;
    const url = v.def.glbFile;
    try {
      const info = await this.load(v.def);
      if (this.active !== v || v.def.glbFile !== url) return;
      v.el.appendChild(this.canvas);
      v.setCanvas(true);
      this.setModel(info, v);
    } catch (e) { console.warn('[3D] модель не открылась', url, e); v.fail('Файл модели не открылся'); }
  },
  loadRaw(url) {
    if (!this.raw) this.raw = new Map();
    // Artifact не отдаёт .glb, поэтому рядом лежит <имя>.glb.txt — тот же файл в base64
    if (!this.raw.has(url)) this.raw.set(url, fetch(url + '.txt').then((r) => { if (!r.ok) throw new Error(url + ': ' + r.status); return r.text(); }).then((b64) => {
      const bin = atob(b64.trim()), buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      return new Promise((res, rej) => this.loader.parse(buf.buffer, '', res, rej));
    }));
    return this.raw.get(url);
  },
  load(def) {
    const url = def.glbFile, nodes = def.isKit && def.nodes ? def.nodes : null, key = url + (nodes ? '|' + nodes.join(',') : '');
    if (!this.cache.has(key)) this.cache.set(key, this.loadRaw(url).then((g) => this.build(g, nodes)));
    return this.cache.get(key);
  },
  /* Из GLB делаем «модель для показа». У набора (kit) берём только нужные корневые узлы, клонируем,
     сбрасываем сдвиг (в файле пропы разложены сеткой) и ставим рядами. */
  build(g, nodes) {
    const tri = (o) => { let n = 0; o.traverse((m) => { if (m.isMesh && m.geometry) { const ge = m.geometry; n += ge.index ? ge.index.count / 3 : ge.attributes.position.count / 3; m.frustumCulled = false; } }); return Math.round(n); };
    let root = g.scene, clips = g.animations || [], parts = null, tris = 0;
    if (nodes) {
      root = new THREE.Group(); parts = [];
      const items = [];
      for (const nm of nodes) {
        const src = g.scene.getObjectByName(nm); if (!src) continue;
        const c = src.clone(true); c.position.set(0, 0, 0);
        const w = new THREE.Group(); w.add(c); w.updateMatrixWorld(true);
        const bx = new THREE.Box3().setFromObject(w), sz = bx.getSize(new THREE.Vector3()), ct = bx.getCenter(new THREE.Vector3());
        const t = tri(c); items.push({ w, sz, ct, name: nm }); parts.push({ name: nm, tris: t });
      }
      const n = items.length, cols = n <= 4 ? n : Math.ceil(Math.sqrt(n * 1.4));
      const rows = []; for (let i = 0; i < n; i += cols) rows.push(items.slice(i, i + cols));
      const gap = Math.max(0.4, items.reduce((a, it) => a + Math.max(it.sz.x, it.sz.z), 0) / Math.max(n, 1) * 0.12);
      let z = 0; const placed = [];
      rows.forEach((r) => {
        const rd = Math.max(...r.map((it) => it.sz.z)), rw = r.reduce((a, it) => a + it.sz.x, 0) + gap * (r.length - 1);
        let x = -rw / 2;
        r.forEach((it) => { it.w.position.set(x + it.sz.x / 2 - it.ct.x, 0, z + rd / 2 - it.ct.z); x += it.sz.x + gap; root.add(it.w); });
        z += rd + gap;
      });
      root.position.z = -(z - gap) / 2; const wrap2 = new THREE.Group(); wrap2.add(root); root = wrap2;
      tris = parts.reduce((a, p) => a + p.tris, 0);
      // клипы: только те, что двигают показанные узлы
      const names = new Set(); root.traverse((o) => names.add(o.name));
      clips = clips.filter((c) => c.tracks.some((tr) => names.has(tr.name.split('.')[0])));
    } else tris = tri(root);
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    return { root, clips, tris, parts, maxTris: parts && parts.length ? Math.max(...parts.map((p) => p.tris)) : tris, box, size: box.getSize(new THREE.Vector3()), center: box.getCenter(new THREE.Vector3()), mixer: clips.length ? new THREE.AnimationMixer(root) : null };
  },
  setModel(info, v) {
    if (this.cur && this.cur.mixer) this.cur.mixer.stopAllAction();
    this.holder.clear(); this.holder.add(info.root);
    this.cur = info;
    const { size, center, box } = info;
    this.holder.position.set(-center.x, -box.min.y, -center.z);
    const R = Math.max(size.length() / 2, 0.05);
    this.R = R; this.ty = size.y * 0.45;
    const fr = Math.max(size.x, size.z) * 0.62 + R * 0.22;
    this.floor.scale.setScalar(fr); this.ring.scale.setScalar(fr);
    this.shadow.scale.setScalar(Math.max(size.x, size.z) * 1.5 + R * 0.3);
    this.camera.near = R / 80; this.camera.far = R * 120; this.camera.updateProjectionMatrix();
    this.controls.minDistance = R * 0.8; this.controls.maxDistance = R * 14;
    v.onModel(info);
    this.pose(v, true);
    // анимация по умолчанию: ходьба / бездействие, если не просили меньше движения
    if (v.state.clip === null && info.clips.length && !REDUCED) { const c = info.clips.find((c) => /walk|idle|run|move/i.test(c.name)); v.state.clip = (c || info.clips[0]).name; }
    this.playClip(v, v.state.clip);
    v.hooks.forEach((f) => f());
    this.resize();
    this.kick();
  },
  pose(v, fresh) {
    const R = this.R || 1, fov = this.camera.fov * Math.PI / 180, d = (R / Math.sin(fov / 2)) * 0.95;
    const el = (v.state.game ? 62 : 26) * Math.PI / 180, az = (v.state.game ? 0 : 32) * Math.PI / 180;
    const t = this.controls.target; t.set(0, this.ty || 0, 0);
    this.camera.position.set(t.x + d * Math.sin(az) * Math.cos(el), t.y + d * Math.sin(el), t.z + d * Math.cos(az) * Math.cos(el));
    this.controls.update(); this.kick();
  },
  zoom(k) {
    const t = this.controls.target, p = this.camera.position, v = p.clone().sub(t).multiplyScalar(k);
    const len = clamp(v.length(), this.controls.minDistance, this.controls.maxDistance);
    p.copy(t).add(v.setLength(len)); this.controls.update(); this.kick();
  },
  playClip(v, name) {
    const info = this.cur; if (!info || !info.mixer) { this.playing = false; return; }
    info.mixer.stopAllAction();
    v.state.clip = name || null;
    if (!name) { this.playing = false; this.kick(); return; }
    const clip = info.clips.find((c) => c.name === name); if (!clip) { this.playing = false; return; }
    const a = info.mixer.clipAction(clip);
    if (/death/i.test(name)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; } else a.setLoop(THREE.LoopRepeat, Infinity);
    a.reset().play(); this.playing = true; this.kick();
  },
  resize() {
    const v = this.active; if (!v || !this.renderer) return;
    const r = v.el.getBoundingClientRect(), w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.kick();
  },
  kick() {
    if (this.raf || this.inTick || !this.active || !this.renderer || !this.cur) return;
    this.clock.getDelta();
    this.raf = requestAnimationFrame(() => this.tick());
  },
  tick() {
    this.raf = 0;
    const v = this.active; if (!v || document.hidden || !this.cur) return;
    const dt = Math.min(this.clock.getDelta(), 0.1);
    let go = false;
    if (this.playing && this.cur.mixer) { this.cur.mixer.update(dt); go = true; }
    this.controls.autoRotate = !!v.state.auto && !REDUCED;
    this.inTick = true;
    const moved = this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.inTick = false;
    if ((go || moved) && !this.raf) this.raf = requestAnimationFrame(() => this.tick());
  },
};
document.addEventListener('visibilitychange', () => { if (!document.hidden) Stage.kick(); });

/* Просмотрщик: окно на странице. Вся работа с three — в Stage. */
function createView(el, opts = {}) {
  el.insertAdjacentHTML('afterbegin', '<div class="poster"></div><div class="wip"></div><span class="tris" hidden></span><span class="hint" hidden>крутить мышью · Ctrl + колесо — масштаб</span>');
  const poster = $('.poster', el), wip = $('.wip', el), tris = $('.tris', el), hint = $('.hint', el);
  const v = { el, def: null, info: null, state: { auto: !REDUCED, game: false, clip: null }, hooks: [], opts };
  const art = () => (v.def && v.def.art) || opts.art || null;
  v.refresh = () => {
    const d = v.def; let html = '';
    if (d && d.prevFile) html = `<img src="${esc(d.prevFile)}" alt="Превью: ${esc(d.name)}" decoding="async">`;
    else if (art()) html = `<div class="crop" style="position:absolute;inset:0;border-radius:0;${cropCss(art())}"></div>`;
    else html = '<svg viewBox="0 0 100 100" width="38%" height="38%" aria-hidden="true" style="opacity:.35"><path d="M50 8 78 30 70 78 50 92 30 78 22 30Z" fill="none" stroke="#cdb89d" stroke-width="2" stroke-dasharray="4 4"/></svg>';
    poster.innerHTML = html;
    if (d && !d.glbFile) {
      wip.hidden = false;
      wip.innerHTML = `<b>Модель в работе</b><span>${d.prevFile ? 'Показано превью из Blender. 3D появится, когда ляжет файл GLB.' : art() ? 'Пока только концепт-арт. Файл модели ещё не лёг.' : 'Файла модели ещё нет. Появится после обновления страницы.'}</span>`;
    } else if (Stage.state === 'failed') {
      wip.hidden = false; wip.innerHTML = '<b>3D не включился</b><span>Браузер не дал WebGL или не загрузились библиотеки. Показано превью.</span>';
    } else wip.hidden = true;
    tris.hidden = !v.info; hint.hidden = true;
    v.hooks.forEach((f) => f());
  };
  v.set = (d) => { v.def = d; v.info = null; v.state.clip = null; v.refresh(); Stage.viewChanged(v); };
  v.setCanvas = (on) => { poster.style.visibility = on ? 'hidden' : ''; if (!on) { wip.hidden = !(v.def && !v.def.glbFile); } hint.hidden = !on; };
  v.setBusy = (on) => { if (on) { wip.hidden = false; wip.innerHTML = '<b>Грузим 3D…</b><span>Библиотека и модель.</span>'; } else if (v.def && v.def.glbFile) wip.hidden = true; };
  v.fail = (msg) => { wip.hidden = false; wip.innerHTML = `<b>${esc(msg)}</b><span>Показано превью.</span>`; poster.style.visibility = ''; };
  v.onModel = (info) => { v.info = info; tris.textContent = (info.parts && info.parts.length > 1 ? info.parts.length + ' шт. · ' : '') + nf(info.tris) + ' треуг.'; tris.hidden = false; v.hooks.forEach((f) => f()); };
  Stage.register(v);
  return v;
}

/* Панель кнопок под просмотрщиком */
function viewTools(v, host, full = true) {
  const mk = (txt, fn, o = {}) => { const b = document.createElement('button'); b.className = 'btn small'; b.type = 'button'; b.textContent = txt; if (o.toggle) b.setAttribute('aria-pressed', 'false'); b.addEventListener('click', () => fn(b)); if (o.title) b.title = o.title; return b; };
  const bAuto = mk('Автоповорот', (b) => { v.state.auto = !v.state.auto; b.setAttribute('aria-pressed', v.state.auto); Stage.kick(); }, { toggle: true });
  const bGame = mk('Вид как в игре', (b) => { v.state.game = !v.state.game; b.setAttribute('aria-pressed', v.state.game); if (Stage.active === v) Stage.pose(v); }, { toggle: true, title: 'Камера сверху под 62°, как в игре' });
  const bIn = mk('+', () => Stage.zoom(0.8), { title: 'Приблизить' }), bOut = mk('−', () => Stage.zoom(1.25), { title: 'Отдалить' });
  bIn.setAttribute('aria-label', 'Приблизить'); bOut.setAttribute('aria-label', 'Отдалить');
  const bReset = mk('Сброс', () => { v.state.game = false; bGame.setAttribute('aria-pressed', 'false'); if (Stage.active === v) Stage.pose(v); });
  const clips = document.createElement('span'); clips.style.display = 'contents';
  host.replaceChildren(bAuto, bGame, bIn, bOut);
  if (full) host.append(bReset);
  host.append(clips);
  const sync = () => {
    const ok = !!(v.def && v.def.glbFile);
    [bAuto, bGame, bIn, bOut, bReset].forEach((b) => { b.disabled = !ok; });
    bAuto.setAttribute('aria-pressed', !!v.state.auto); bGame.setAttribute('aria-pressed', !!v.state.game);
    clips.replaceChildren();
    const list = ((v.info && v.info.clips) || []).slice().sort((a, b) => clipRank(a.name) - clipRank(b.name));
    if (list.length) {
      const sep = document.createElement('span'); sep.className = 'sep'; clips.append(sep);
      list.forEach((c) => {
        const b = mk(clipLabel(c.name), () => { Stage.playClip(v, v.state.clip === c.name ? null : c.name); sync(); }, { toggle: true, title: `Клип ${c.name}, ${nf(c.duration, 2)} с` });
        b.setAttribute('aria-pressed', v.state.clip === c.name); clips.append(b);
      });
    } else if (ok && v.info) { const s = document.createElement('span'); s.className = 'note'; s.textContent = 'Анимаций в файле нет'; clips.append(s); }
  };
  v.hooks.push(sync); sync();
}

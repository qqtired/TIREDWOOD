// Остров «Последний свет» в 3D (флаг ISLE): 8 GLB острова (client/assets/isle/, PROVENANCE.md) и смотритель Игнат.
// Грузится, только когда камера ближе 2 км (с площади острова нет вовсе). Всё неподвижное склеено по материалу
// (8 отрисовок), таблички — один атлас-канвас (1), доска сезона — свой канвас с фоном (1). Отдельно — то, что движется:
// линза маяка (вращается), лампа (яркостью, не visible), колокол буя (качается).
// По дальности до центра: ближе 520 м — весь остров, до 1 300 м — силуэт (узел hidden_with_full_island), до 1 500 м —
// только свет маяка: два луча-конуса и ореол (без тумана — их видно над туманом) и огни буёв (одна отрисовка точками,
// мигают, гаснут в тумане). Новых ламп нет. Образец — сцена острова на странице ревью (lab/fishing-review/js/viewers.js).
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ISLE_CENTER, ISLE_IGNAT, ISLE_Y, isleDist } from '../../../shared/maps/isle.ts';
import { glowSprite, glowTexture } from '../../render/kit.ts';

const URLS = [
  new URL('../../assets/isle/island-terrain.glb', import.meta.url).href,
  new URL('../../assets/isle/lighthouse.glb', import.meta.url).href,
  new URL('../../assets/isle/pier-breakwater.glb', import.meta.url).href,
  new URL('../../assets/isle/houses.glb', import.meta.url).href,
  new URL('../../assets/isle/keeper-house.glb', import.meta.url).href,
  new URL('../../assets/isle/cannery.glb', import.meta.url).href,
  new URL('../../assets/isle/schooner-wreck.glb', import.meta.url).href,
  new URL('../../assets/isle/props.glb', import.meta.url).href,
];
const IGNAT_URL = new URL('../../assets/isle/ignat.glb', import.meta.url).href;
const BOARD_URL = new URL('../../assets/isle/season-board.webp', import.meta.url).href;

/** Весь остров ближе FULL_IN к центру, силуэт — дальше FULL_OUT (запас — против мигания на границе), м */
const FULL_IN = 520;
const FULL_OUT = 560;
const SILHOUETTE_FAR = 1300;
const LIGHT_FAR = 1500;
/** Таблички — ближе этого к центру (дальше их всё равно съедает туман) */
const LABEL_NEAR = 260;
/** Игнат: виден ближе 60 м, каждый кадр оживает ближе 28 м, дальше — 8 раз в секунду (как Семён) */
const IGNAT_FAR = 60;
const IGNAT_NEAR = 28;
const BEAM = 150;
/** Оборот линзы и лучей, с: два луча — вспышка раз в 6 с */
const TURN_S = 12;
/** Огни буёв: имя узла, цвет, период мигания (с), сдвиг фазы, размер ореола (м) */
const BUOY_LIGHTS: ReadonlyArray<readonly [RegExp, number, number, number, number]> = [
  [/^buoy_red_\d+$/, 0xff4a3a, 4, 0, 3.2], [/^buoy_green_\d+$/, 0x52ff8f, 4, 2, 3.2], [/^buoy_route_\d+$/, 0xffffff, 5, 1, 3.2],
  [/^buoy_bell_\d+$/, 0xffb04a, 3, 0.5, 3.2], [/^buoy_danger_\d+$/, 0xffd84a, 1.5, 0, 3.2], [/^mole_light$/, 0xff3b2e, 3, 0.3, 3.4],
];
const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

/** Свет в маяке: конус, ярче к фонарю и к оси (как на странице ревью) */
function beamMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0xffc56a) }, uI: { value: 0.4 }, uLen: { value: BEAM } },
    vertexShader: 'varying float vD; varying vec3 vN; varying vec3 vV; uniform float uLen;\nvoid main(){ vD = position.x / uLen; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying float vD; varying vec3 vN; varying vec3 vV; uniform vec3 uColor; uniform float uI;\nvoid main(){ float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.3); float a = uI * pow(1.0 - clamp(vD, 0.0, 1.0), 1.4) * edge; gl_FragColor = vec4(uColor, clamp(a, 0.0, 0.9)); }',
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
}

/** Огни буёв одной отрисовкой: точки с ореолом, цвет и яркость у каждой свои */
function lightPoints(n: number): THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage));
  const m = new THREE.ShaderMaterial({
    uniforms: { map: { value: glowTexture() }, uScale: { value: 600 } },
    vertexShader: 'attribute vec3 aColor; attribute float aSize; attribute float aAlpha; uniform float uScale; varying vec3 vC; varying float vA;\nvoid main(){ vC = aColor; vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / max(1.0, -mv.z); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform sampler2D map; varying vec3 vC; varying float vA;\nvoid main(){ float a = texture2D(map, gl_PointCoord).a * vA; if (a < 0.004) discard; gl_FragColor = vec4(vC * a, a); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  p.renderOrder = 5;
  return p;
}

/** Табличка на канве: доска, лёгкая фактура, текст по центру (Rubik); faded — выцветшая */
function drawLabel(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, text: string, faded: boolean): void {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.fillStyle = faded ? '#d9d1c0' : '#ede4cf';
  g.fillRect(x, y, w, h);
  let seed = (w * 31 + h * 17 + text.length * 7) % 997;
  const rnd = (): number => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 160; i++) {
    g.fillStyle = `rgba(90,70,40,${rnd() * 0.06})`;
    g.fillRect(x + rnd() * w, y + rnd() * h, 2 + rnd() * 10, 1 + rnd() * 3);
  }
  g.fillStyle = faded ? 'rgba(60,48,36,.55)' : '#2a241c';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const lines = text.split('\n');
  let size = Math.min((h * 0.62) / lines.length, 120);
  g.font = `700 ${size}px Rubik, system-ui, sans-serif`;
  const widest = Math.max(...lines.map((l) => g.measureText(l).width));
  if (widest > w * 0.88) {
    size *= (w * 0.88) / widest;
    g.font = `700 ${size}px Rubik, system-ui, sans-serif`;
  }
  lines.forEach((l, i) => g.fillText(l, x + w / 2, y + h / 2 + (i - (lines.length - 1) / 2) * size * 1.15));
  g.restore();
}

/** Индексы у всех (склейка не любит смешанные), только нужные атрибуты */
function prepared(src: THREE.BufferGeometry, m: THREE.Matrix4, keep: readonly string[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const k of keep) {
    const a = src.getAttribute(k);
    if (a) g.setAttribute(k, (a as THREE.BufferAttribute).clone());
    else if (k === 'color') g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(src.getAttribute('position').count * 3).fill(1), 3));
  }
  if (src.index) g.setIndex(src.index.clone());
  else g.setIndex([...Array(src.getAttribute('position').count).keys()]);
  return g.applyMatrix4(m);
}

interface Lit {
  per: number;
  ph: number;
  base: number;
  x: number;
  y: number;
  z: number;
}

/** Смотритель Игнат на крыльце: дышит и вглядывается в туман (idle), машет подошедшему (wave); фонарь мерцает яркостью */
class Ignat3D {
  readonly root: THREE.Object3D;
  private readonly mixer: THREE.AnimationMixer;
  private readonly idle: THREE.AnimationAction | null;
  private readonly wave: THREE.AnimationAction | null;
  private glow: THREE.MeshStandardMaterial | null = null;
  private halo: THREE.Sprite | null = null;
  private acc = 0;
  private near = false;
  private waveAt = -1e9;

  constructor(g: GLTF, at: THREE.Vector3, yaw: number) {
    this.root = g.scene;
    this.root.position.copy(at);
    this.root.rotation.y = yaw;
    this.mixer = new THREE.AnimationMixer(this.root);
    const clip = (n: string) => g.animations.find((a) => a.name === n);
    const idle = clip('idle'), wave = clip('wave');
    this.idle = idle ? this.mixer.clipAction(idle) : null;
    this.wave = wave ? this.mixer.clipAction(wave) : null;
    this.idle?.play();
    if (this.wave) {
      this.wave.setLoop(THREE.LoopOnce, 1);
      this.wave.clampWhenFinished = false;
    }
    this.mixer.addEventListener('finished', (e) => {
      if (e.action === this.wave && this.idle) {
        this.idle.reset().play();
        this.idle.crossFadeFrom(this.wave, 0.4, false);
      }
    });
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = false;
        m.receiveShadow = false;
        if (o.name === 'lantern_glow' && m.material instanceof THREE.MeshStandardMaterial) this.glow = m.material = m.material.clone();
      }
      if (o.name === 'halo') {
        const ud = o.userData as { halo_size?: number; halo_color?: string };
        const s = glowSprite(new THREE.Color(ud.halo_color ?? '#ffa83a').getHex(), (ud.halo_size ?? 0.6) * 1.6, 0.55);
        o.add(s);
        this.halo = s;
      }
    });
  }

  /** me — свой игрок в мире (ближе 5 м — помашет, раз в 20 с) */
  update(dt: number, t: number, cam: THREE.Vector3, me: { x: number; y: number; z: number } | null, wx: number, wz: number): void {
    const d = Math.hypot(cam.x - wx, cam.z - wz);
    this.root.visible = d < IGNAT_FAR;
    if (!this.root.visible) return;
    // фонарь: тёплое мерцание яркостью
    const flick = 0.85 + 0.1 * Math.sin(t * 7.3) + 0.05 * Math.sin(t * 17.1 + 1.3);
    if (this.glow) this.glow.emissiveIntensity = 1.6 * flick;
    if (this.halo) this.halo.material.opacity = 0.45 * flick;
    const close = !!me && Math.hypot(me.x - wx, me.z - wz) < 5;
    if (close && !this.near && t - this.waveAt > 20 && this.wave) {
      this.waveAt = t;
      this.wave.reset().play();
      if (this.idle) this.wave.crossFadeFrom(this.idle, 0.3, false);
    }
    this.near = close;
    this.acc += dt;
    if (d < IGNAT_NEAR || this.acc >= 1 / 8) {
      this.mixer.update(this.acc);
      this.acc = 0;
    }
  }
}

export class Island3D {
  /** В мире: центр острова на уровне воды */
  readonly root = new THREE.Group();
  /** Сколько загружено (0…1) — для экрана загрузки */
  progress = 0;
  ready = false;
  private readonly full = new THREE.Group();
  private readonly lights = new THREE.Group();
  private silhouette: THREE.Object3D | null = null;
  private lens: THREE.Object3D | null = null;
  private lampMat: THREE.MeshBasicMaterial | null = null;
  private readonly lampBase = new THREE.Color();
  private bell: THREE.Object3D | null = null;
  private readonly bellBase = new THREE.Quaternion();
  private labels: THREE.Mesh | null = null;
  private board: { ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture; img: HTMLImageElement | null; text: string } | null = null;
  private readonly beams = new THREE.Group();
  private readonly beamMat = beamMaterial();
  private readonly halo = glowSprite(0xffc56a, 10, 0.6);
  private readonly lamp = new THREE.Vector3();
  private points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> | null = null;
  private readonly lit: Lit[] = [];
  private ignat: Ignat3D | null = null;
  private readonly ignatAt = new THREE.Vector3();
  private fullOn = false;

  constructor(scene: THREE.Scene) {
    this.root.name = 'isle';
    // в мир (центр острова) — после сборки: собираем в координатах острова, с корнем в нуле
    this.root.visible = false;
    this.root.add(this.full, this.lights);
    scene.add(this.root);
  }

  /** Загрузить и собрать; прогреть шейдеры (compileAsync) и залить текстуры, пока кадр идёт */
  async load(gl: THREE.WebGLRenderer, camera: THREE.Camera, scene: THREE.Scene): Promise<void> {
    const loader = new GLTFLoader();
    const parts = new Array<number>(URLS.length + 1).fill(0);
    const prog = (i: number) => (e: ProgressEvent) => {
      parts[i] = e.total > 0 ? e.loaded / e.total : 0.5;
      this.progress = 0.85 * (parts.reduce((a, b) => a + b, 0) / parts.length);
    };
    const got = await Promise.all([...URLS, IGNAT_URL].map((u, i) => loader.loadAsync(u, prog(i)).then((g) => { parts[i] = 1; return g; })));
    this.build(got.slice(0, URLS.length));
    const ig = got[URLS.length];
    if (ig) {
      const spot = this.full.getObjectByName('npc_ignat');
      const at = spot ? spot.getWorldPosition(_v).sub(this.root.position) : new THREE.Vector3(ISLE_IGNAT.x - ISLE_CENTER.x, ISLE_IGNAT.y - ISLE_Y, ISLE_IGNAT.z - ISLE_CENTER.z);
      this.ignat = new Ignat3D(ig, at.clone(), ISLE_IGNAT.yaw);
      this.full.add(this.ignat.root);
      this.ignatAt.copy(at).add(this.root.position);
    }
    this.progress = 0.9;
    // прогрев: всё видимое разом (compileAsync берёт только видимое), потом — как скажет update
    const vis = [this.root.visible, this.full.visible, this.silhouette?.visible ?? false, this.labels?.visible ?? false];
    this.root.visible = this.full.visible = true;
    if (this.silhouette) this.silhouette.visible = true;
    if (this.labels) this.labels.visible = true;
    if (this.ignat) this.ignat.root.visible = true;
    this.root.updateMatrixWorld(true);
    try {
      await gl.compileAsync(this.root, camera, scene);
    } catch {
      // нет KHR_parallel_shader_compile — соберутся на первом кадре
    }
    if (this.labels) gl.initTexture((this.labels.material as THREE.MeshStandardMaterial).map!);
    if (this.board) gl.initTexture(this.board.tex);
    [this.root.visible, this.full.visible] = vis;
    if (this.silhouette) this.silhouette.visible = vis[2];
    if (this.labels) this.labels.visible = vis[3];
    this.progress = 1;
    this.ready = true;
  }

  private build(gltfs: GLTF[]): void {
    const dynamic = new Set<THREE.Object3D>();
    const spots: THREE.Object3D[] = [];
    const labels: THREE.Mesh[] = [];
    let boardMesh: THREE.Mesh | null = null;
    const buckets = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[] }>();
    for (const g of gltfs) {
      const sc = g.scene;
      sc.updateMatrixWorld(true);
      // подвижное и особое — отдельно (в мировой позе), остальное — в склейку
      sc.traverse((o) => {
        if (o.userData?.hidden_with_full_island) this.silhouette = o;
        else if (o.name === 'lens') this.lens = o;
        else if (o.name === 'lamp' && (o as THREE.Mesh).isMesh) {
          const m = o as THREE.Mesh;
          this.lampMat = (m.material as THREE.MeshBasicMaterial).clone();
          this.lampBase.copy(this.lampMat.color);
          m.material = this.lampMat;
          dynamic.add(o);
        } else if (o.name === 'buoy_bell_01_bell') this.bell = o;
        else if (o.name === 'lamp_focus') o.getWorldPosition(this.lamp);
        else if (o.name === 'npc_ignat') spots.push(o);
        if ((o as THREE.Mesh).isMesh) return;
        for (const [re, color, per, ph, base] of BUOY_LIGHTS) {
          if (!re.test(o.name)) continue;
          const box = new THREE.Box3().setFromObject(o);
          const c = box.isEmpty() ? o.getWorldPosition(new THREE.Vector3()) : box.getCenter(new THREE.Vector3());
          const y = box.isEmpty() ? c.y : box.max.y - 0.25;
          this.lit.push({ per, ph, base, x: c.x, y, z: c.z });
          (this.lit[this.lit.length - 1] as Lit & { color?: number }).color = color;
        }
      });
      for (const o of [this.silhouette, this.lens, this.bell]) if (o) dynamic.add(o);
      sc.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        for (let p: THREE.Object3D | null = o; p; p = p.parent) if (dynamic.has(p)) return;
        if (/^label_/.test(o.name) && (o.userData as { text?: string }).text) {
          if (o.name === 'label_season_board') boardMesh = m;
          else labels.push(m);
          return;
        }
        const mat = m.material as THREE.Material;
        const key = mat.name || mat.uuid;
        const b = buckets.get(key) ?? buckets.set(key, { mat, geos: [] }).get(key)!;
        b.geos.push(prepared(m.geometry, m.matrixWorld, ['position', 'normal', 'color']));
      });
    }
    // склеенное неподвижное: по отрисовке на материал
    for (const { mat, geos } of buckets.values()) {
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.matrixAutoUpdate = false;
      this.full.add(mesh);
    }
    // подвижное — в остров, с той же позой
    for (const o of [this.lens, this.bell]) if (o) this.full.attach(o);
    for (const o of dynamic) if (o !== this.silhouette && o !== this.lens && o !== this.bell) this.full.attach(o);
    for (const o of spots) this.full.attach(o);
    if (this.bell) this.bellBase.copy(this.bell.quaternion);
    if (this.silhouette) {
      this.root.attach(this.silhouette);
      this.silhouette.visible = false;
    }
    this.buildLabels(labels);
    if (boardMesh) this.buildBoard(boardMesh);
    // свет маяка: два луча одной отрисовкой и ореол
    const geo = new THREE.CylinderGeometry(0.5, 11, BEAM, 24, 1, true).translate(0, -BEAM / 2, 0).rotateZ(Math.PI / 2);
    const both = mergeGeometries([geo, geo.clone().rotateY(Math.PI)], false)!;
    const beams = new THREE.Mesh(both, this.beamMat);
    beams.renderOrder = 6;
    beams.frustumCulled = false;
    this.beams.add(beams);
    if (this.lamp.lengthSq() === 0) this.lamp.set(75, 40, -60);
    this.beams.position.copy(this.lamp);
    this.halo.position.copy(this.lamp);
    this.halo.material.fog = false;
    this.halo.renderOrder = 5;
    this.lights.add(this.beams, this.halo);
    // огни буёв и мола
    if (this.lit.length) {
      const p = lightPoints(this.lit.length);
      const pos = p.geometry.getAttribute('position') as THREE.BufferAttribute;
      const col = p.geometry.getAttribute('aColor') as THREE.BufferAttribute;
      const c = new THREE.Color();
      this.lit.forEach((l, i) => {
        pos.setXYZ(i, l.x, l.y, l.z);
        c.set((l as Lit & { color?: number }).color ?? 0xffffff);
        col.setXYZ(i, c.r, c.g, c.b);
      });
      this.points = p;
      this.lights.add(p);
    }
    this.root.position.set(ISLE_CENTER.x, ISLE_Y, ISLE_CENTER.z);
    this.root.updateMatrixWorld(true);
    for (const o of this.full.children) o.traverse((x) => { x.castShadow = false; x.receiveShadow = false; });
  }

  /** Все таблички (кроме доски сезона) — один атлас и одна отрисовка */
  private buildLabels(list: THREE.Mesh[]): void {
    if (!list.length) return;
    const W = 2048, CELL = 480;
    const rects: Array<{ x: number; y: number; w: number; h: number }> = [];
    let x = 0, y = 0, row = 0;
    for (const m of list) {
      const ud = m.userData as { size_m?: [number, number] };
      const [sw, sh] = ud.size_m ?? [1, 0.4];
      const w = CELL, h = Math.max(48, Math.min(CELL, Math.round(CELL / Math.max(0.5, sw / Math.max(0.05, sh)))));
      if (x + w > W) { x = 0; y += row; row = 0; }
      rects.push({ x, y, w, h });
      x += w + 4;
      row = Math.max(row, h + 4);
    }
    const H = THREE.MathUtils.ceilPowerOfTwo(Math.max(64, y + row));
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const g = canvas.getContext('2d')!;
    const geos: THREE.BufferGeometry[] = [];
    list.forEach((m, i) => {
      const ud = m.userData as { text: string; faded?: boolean };
      const r = rects[i];
      drawLabel(g, r.x, r.y, r.w, r.h, ud.text, !!ud.faded);
      const geo = prepared(m.geometry, m.matrixWorld, ['position', 'normal', 'uv']);
      const uv = geo.getAttribute('uv') as THREE.BufferAttribute | undefined;
      if (!uv) return;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, (r.x + uv.getX(k) * r.w) / W, (r.y + uv.getY(k) * r.h) / H);
      geos.push(geo);
    });
    const merged = geos.length ? mergeGeometries(geos, false) : null;
    if (!merged) return;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = false;
    tex.anisotropy = 4;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, metalness: 0 });
    this.labels = new THREE.Mesh(merged, mat);
    this.labels.matrixAutoUpdate = false;
    this.full.add(this.labels);
  }

  /** Доска сезона острова у дома Игната: фон — картинка (season-board.webp), текст пишет setBoard */
  private buildBoard(m: THREE.Mesh): void {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 464;
    const ctx = canvas.getContext('2d')!;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = false;
    tex.anisotropy = 4;
    const board = { ctx, tex, img: null as HTMLImageElement | null, text: '' };
    this.board = board;
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      board.img = img;
      const t = board.text;
      board.text = '';
      this.setBoard(t);
    };
    img.src = BOARD_URL;
    const mesh = new THREE.Mesh(prepared(m.geometry, m.matrixWorld, ['position', 'normal', 'uv']), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
    mesh.matrixAutoUpdate = false;
    this.full.add(mesh);
    this.setBoard('Сезон острова\n…');
  }

  /** Текст доски сезона (строки через \n: заголовок, крупно — когда, мелко — туман) */
  setBoard(text: string): void {
    const b = this.board;
    if (!b || b.text === text) return;
    b.text = text;
    const g = b.ctx;
    const W = g.canvas.width, H = g.canvas.height;
    if (b.img) {
      // середина картинки (гладкие доски) — на всю доску, края с сетью и рыбами чуть видны
      const iw = b.img.naturalWidth, ih = b.img.naturalHeight;
      const sw = Math.min(iw, (ih * W) / H);
      g.drawImage(b.img, (iw - sw) / 2, 0, sw, ih, 0, 0, W, H);
    } else {
      g.fillStyle = '#b9ad98';
      g.fillRect(0, 0, W, H);
    }
    const [title, big, small] = text.split('\n');
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    const line = (s: string | undefined, y: number, size: number, color: string): void => {
      if (!s) return;
      let px = size;
      g.font = `800 ${px}px Rubik, system-ui, sans-serif`;
      const w = g.measureText(s).width;
      if (w > W * 0.8) {
        px *= (W * 0.8) / w;
        g.font = `800 ${px}px Rubik, system-ui, sans-serif`;
      }
      g.lineWidth = px * 0.18;
      g.strokeStyle = 'rgba(40,30,20,.85)';
      g.strokeText(s, W / 2, y);
      g.fillStyle = color;
      g.fillText(s, W / 2, y);
    };
    line(title, H * 0.27, 52, '#fff3dc');
    line(big, H * 0.52, 66, '#ffd27a');
    line(small, H * 0.75, 40, '#e8eef0');
    b.tex.needsUpdate = true;
  }

  /**
   * Кадр: что видно по дальности, свет маяка, огни, линза, колокол, Игнат. fogFar — дальность тумана сейчас, viewH —
   * высота кадра в пикселях, fovY — угол камеры (размер огней), season — сезон острова (луч золотой).
   */
  update(dt: number, t: number, cam: THREE.Vector3, fogFar: number, viewH: number, fovY: number, season: boolean, me: { x: number; y: number; z: number } | null): void {
    const d = isleDist(cam.x, cam.z);
    this.root.visible = this.ready && d < LIGHT_FAR;
    if (!this.root.visible) return;
    if (this.fullOn ? d > FULL_OUT : d < FULL_IN) this.fullOn = !this.fullOn;
    this.full.visible = this.fullOn;
    if (this.silhouette) this.silhouette.visible = !this.fullOn && d < SILHOUETTE_FAR;
    if (this.labels) this.labels.visible = this.fullOn && d < LABEL_NEAR;
    const rx = this.root.position.x, ry = this.root.position.y, rz = this.root.position.z;
    // маяк: два луча, оборот 12 с; вспышка — когда луч смотрит на камеру
    const th = (t * Math.PI * 2) / TURN_S;
    this.beams.rotation.y = th;
    const lx = rx + this.lamp.x, ly = ry + this.lamp.y, lz = rz + this.lamp.z;
    _v.set(cam.x - lx, 0, cam.z - lz).normalize();
    const along = Math.abs(Math.cos(th) * _v.x - Math.sin(th) * _v.z);
    const flash = Math.pow(along, 40);
    const dense = clamp01(1 - (fogFar - 85) / (160 - 85) * 0.4);
    this.beamMat.uniforms.uI.value = (0.26 + 0.16 * dense) * (0.85 + 0.35 * flash);
    (this.beamMat.uniforms.uColor.value as THREE.Color).set(season ? 0xffb43a : 0xffc56a);
    const dl = Math.hypot(cam.x - lx, cam.y - ly, cam.z - lz);
    this.halo.material.opacity = 0.6 + 0.4 * flash;
    this.halo.scale.setScalar(Math.max(9, dl * 0.07) * (1 + 1.4 * flash));
    if (this.lampMat) this.lampMat.color.copy(this.lampBase).multiplyScalar(1.3 + 2.5 * flash);
    // огни буёв: мигают, гаснут дальше тумана, издалека — одного размера на экране
    if (this.points) {
      const size = this.points.geometry.getAttribute('aSize') as THREE.BufferAttribute;
      const alpha = this.points.geometry.getAttribute('aAlpha') as THREE.BufferAttribute;
      this.lit.forEach((l, i) => {
        const on = (t + l.ph) % l.per < Math.min(1, l.per * 0.35) ? 1 : 0.18;
        const dd = Math.hypot(cam.x - rx - l.x, cam.y - ry - l.y, cam.z - rz - l.z);
        const vis = Number.isFinite(fogFar) ? clamp01((fogFar * 1.7 - dd) / (fogFar * 0.6)) : 1;
        alpha.setX(i, on * vis);
        size.setX(i, l.base * Math.max(1, dd / 90));
      });
      size.needsUpdate = alpha.needsUpdate = true;
      this.points.material.uniforms.uScale.value = viewH / (2 * Math.tan(THREE.MathUtils.degToRad(fovY) / 2));
    }
    if (!this.fullOn) return;
    this.lens?.rotateOnWorldAxis(UP, (dt * Math.PI * 2) / TURN_S);
    if (this.bell) this.bell.quaternion.copy(this.bellBase).multiply(_q.setFromEuler(_e.set(Math.sin(t * 1.9) * 0.22, 0, Math.sin(t * 1.3 + 1) * 0.12)));
    this.ignat?.update(dt, t, cam, me, this.ignatAt.x, this.ignatAt.z);
  }

  /** Где колокольный буй и маяк — для звука (мир) */
  lampWorld(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.lamp).add(this.root.position);
  }
}

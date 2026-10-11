// Бюджет отрисовки новой набережной (флаг PLAZA3, пакет WP13; docs/plaza3/tech-foundation.md §5, docs/optimization.md):
// ≤ 300 отрисовок с высоты глаз и ≤ 80 программ шейдеров. Три вещи, и все — без смены картинки:
// 1. Программы. Набережная собрана из десятков модулей, и у похожих материалов отличаются мелочи, из-за которых three.js
//    собирает отдельную программу: есть ли цвет вершин и карта, двусторонний ли прозрачный материал, есть ли нормали у
//    неосвещённого. Приводим их к одному виду там, где это ничего не меняет на экране: белый цвет вершин и белая карта 1×1
//    (умножение на 1), прозрачное двустороннее — за один проход (forceSinglePass: ни второй программы, ни второй
//    отрисовки), неосвещённому — нормали (шейдер их не читает), металлическое отражение — заранее свёрнутым в куб (у three
//    иначе остаются две служебные программы), плоские грани — нормалями в геометрии, инстансам — белый цвет экземпляров,
//    паре материалов со своим шейдером — белая карта тому, у кого её нет, а модели, догрузившиеся после первого кадра, —
//    тем же «рисованным» видом, что и всё остальное (client/lobby/look.ts). Ловим всё, что встаёт в сцену
//    (Object3D.add), — до первой отрисовки.
// 2. Прогрев. Перед первым кадром набережной — весь «рисованный» вид и compileAsync по видимому плюс погода и след лодки
//    (warmHidden): программы собираются параллельно под экраном загрузки, а не рывком посреди прогулки.
// 3. Дальность. Узел сцены (стол, крыса, лодка, вывеска) не больше UNIT_MAX_R м не рисуется дальше cullDistance(радиус) —
//    через слой камеры, а не visible (visible — у логики модулей). Узлы вложены: крыса гаснет раньше всей дорожки.
//    Задник (город, дальний берег) не трогаем. В кадр пересчёта теней отсечение снимается: тени статики — с полной сценой.
import * as THREE from 'three';
import type { LobbyLook } from '../look.ts';

/** Слой «далеко — не рисовать»: камера набережной его не видит */
const FAR_LAYER = 7;
/** Узел крупнее (радиус описанной сферы, м) целиком не отсекается — смотрим его детей */
export const UNIT_MAX_R = 8;
/** В желейке узел — вещь в руке не меньше такого радиуса, м (удочка), и без желе внутри */
const HELD_MIN_R = 1;
/** Вещь в руке тонкая (удочка — пара сантиметров): дальше стольких метров она меньше пикселя */
const HELD_CULL = 25;
/** Скелетная сетка не больше такого радиуса (с запасом на позу), м — питомец, отсекаем; больше — житель, нет */
const PET_MAX_R = 0.9;
/** Где отсекаем: суша, порт и мол (shared/plaza3 land, port) — задник за рамкой (город, дальний берег, горы) не трогаем */
const AREA = { x0: -75, x1: 100, z0: -72, z1: 65 };
/** Пересобрать узлы и их сферы (с), проверить расстояния (с) */
const SCAN_S = 1;
const CULL_S = 0.2;
/** Вернуть узел, когда он ближе порога на столько, м — без мигания на границе */
const HYST = 4;

/**
 * С какого расстояния (м, от камеры до сферы узла) не рисуем узел радиуса r. Мелочь (крыса, фишки, кружка) — с 20 м,
 * до 0,75 м — по видимому размеру (~35 px на экране высотой 900), до 2 м — с 45 м (docs/optimization.md: «мелкие
 * предметы, вывески и таблички не рисовать дальше 40–60 м»), крупнее — пропорционально размеру (катер 3 м — с 67 м).
 */
export function cullDistance(r: number): number {
  return Math.max(Math.min(60 * r, 45), 20, 22.5 * r);
}

/** Узел в рамке набережной (задник за ней не отсекаем) */
export function inArea(x: number, z: number): boolean {
  return x >= AREA.x0 && x <= AREA.x1 && z >= AREA.z0 && z <= AREA.z1;
}

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Ключ программы материала без своего шейдера (в сборке Vite текст функции другой — берём настоящий) */
const DEFAULT_KEY = THREE.Material.prototype.onBeforeCompile.toString();
/** Стандартный материал без своего шейдера — или только с «мокротой» мира и «рисованным» видом */
const PLAIN_STD = new RegExp(`^(${esc(DEFAULT_KEY)}|wet)(\\|look2g?)?$`);
/** Точки: без своего шейдера или с дымкой задника */
const PLAIN_POINTS = new RegExp(`^${esc(DEFAULT_KEY)}(\\|haze(-glow)?)?$`);

/** Что можно привести к общему виду: vc — белый цвет вершин, map — белая карта 1×1 */
export interface Canon {
  vc: boolean;
  map: boolean;
}

/** Решение по материалу (чистая логика — test/plaza3-perf.test.ts); null — не трогаем */
export function canonOf(m: THREE.Material, avatar: boolean): Canon | null {
  if (avatar || m.userData.p3keep || m.name.startsWith('farm_')) return null;
  const key = m.customProgramCacheKey();
  if (m.type === 'MeshStandardMaterial') {
    if (!PLAIN_STD.test(key)) return null;
    const defines = Object.keys((m as THREE.MeshStandardMaterial).defines ?? {}).filter((k) => k !== 'STANDARD');
    return defines.length ? null : { vc: true, map: true };
  }
  if (m.type === 'MeshBasicMaterial') return key === DEFAULT_KEY ? { vc: true, map: true } : null;
  if (m.type === 'PointsMaterial') return PLAIN_POINTS.test(key) ? { vc: true, map: false } : null;
  return null;
}

/** Не трогает ли «рисованный» вид модели, которая встала после первого кадра (как paintAll в client/lobby/look.ts) */
export function paintsLate(m: THREE.Material, avatar: boolean): boolean {
  if (avatar || m.name.startsWith('farm_')) return false;
  const key = m.customProgramCacheKey();
  return PLAIN_STD.test(key) && !key.includes('|look2');
}

type Drawable = THREE.Mesh | THREE.Points | THREE.Line | THREE.Sprite;

/**
 * Спрятанное при прогреве, что всё равно греем: отдельная сетка верхнего уровня со своим шейдером — погода (дождь,
 * молния, радуга) и след проходящей лодки. Они появляются сами посреди прогулки; события (пираты, шторм, русалка) —
 * группы, их не греем.
 */
export function warmHidden(o: THREE.Object3D): boolean {
  const m = (o as THREE.Mesh).material;
  return !o.children.length && !!m && !Array.isArray(m) && m.type === 'ShaderMaterial';
}

/** Белая карта 1×1: «карта есть» у всех — одна программа на материалы с картой и без */
let white: THREE.DataTexture | null = null;
function whiteMap(): THREE.DataTexture {
  if (!white) {
    white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    white.colorSpace = THREE.SRGBColorSpace;
    white.name = 'p3-white';
    white.needsUpdate = true;
  }
  return white;
}

/** Белые цвета вершин (байт на канал) */
function whiteColors(n: number): THREE.BufferAttribute {
  return new THREE.BufferAttribute(new Uint8Array(n * 3).fill(255), 3, true);
}

/** Нормали «вверх» для неосвещённого: шейдер их не читает, но с ними и без них — разные программы */
function upNormals(n: number): THREE.BufferAttribute {
  const a = new Int8Array(n * 3);
  for (let i = 1; i < a.length; i += 3) a[i] = 127;
  return new THREE.BufferAttribute(a, 3, true);
}

interface Unit {
  o: THREE.Object3D;
  /** центр сферы в своих координатах узла: узел ходит (крыса, кошка, круги на воде) — центр за ним */
  local: THREE.Vector3;
  r: number;
  /** своя дальность (вещь в руке), иначе cullDistance(r) */
  lim?: number;
  drawables: Drawable[];
}

const _c = new THREE.Vector3();
/** Узел и все его предки видимы */
function shown(o: THREE.Object3D): boolean {
  for (let n: THREE.Object3D | null = o; n; n = n.parent) if (!n.visible) return false;
  return true;
}
const _inv = new THREE.Matrix4();

export interface PerfHooks {
  gl: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  look: LobbyLook | null;
}

export class Plaza3Perf {
  private readonly h: PerfHooks;
  /** Материалы, которые уже разобрали, и решение по ним */
  private readonly seen = new WeakMap<THREE.Material, Canon | null>();
  /** Металлическое отражение (развёртка) → свёрнутое в куб заранее */
  private readonly cubes = new Map<THREE.Texture, THREE.Texture>();
  /** Белые цвета вершин, которые добавили мы (свои цвета геометрии — повод материал не трогать, наши — нет) */
  private readonly mine = new WeakSet<THREE.BufferAttribute>();
  /** Геометрия → её копия с плоскими нормалями (и сама копия → себя) */
  private readonly flats = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();
  /** Геометрия со своими цветами → копия с белыми (для материала, который цвета не читает) */
  private readonly whites = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();
  /** Свои шейдеры с картой (тип|ключ) и материалы без карты, которые ждут брата */
  private readonly mapKeys = new Set<string>();
  private readonly mapless = new Set<THREE.Material>();
  private units: Unit[] = [];
  private readonly culled = new Map<THREE.Object3D, Unit>();
  /** Спрятанные сетки: прежняя маска слоёв и сколько узлов их прячут */
  private readonly hidden = new Map<Drawable, { mask: number; n: number }>();
  private readonly spheres = new WeakMap<THREE.Object3D, THREE.Sphere>();
  private scanAt = -1;
  private cullAt = -1;
  private warmed = false;
  private rendering = false;
  private shadowOpen = false;
  private readonly stats = { canon: 0, single: 0, normals: 0, colors: 0, maps: 0, cubes: 0, flat: 0, instColor: 0, copies: 0, late: 0, missed: 0, empty: 0, warmMs: -1, warmPrograms: 0 };

  constructor(h: PerfHooks) {
    this.h = h;
    // всё, что уже есть в сцене, — сейчас; всё, что встанет потом, — в момент add (до первой отрисовки)
    this.adopt(h.scene);
    const perf = this;
    const add = THREE.Object3D.prototype.add;
    THREE.Object3D.prototype.add = function (this: THREE.Object3D, ...objects: THREE.Object3D[]) {
      const r = add.apply(this, objects);
      if (perf.inScene(this)) for (const o of objects) perf.adopt(o);
      return r;
    } as typeof add;
    // страховка: материал подменили у сетки, что уже в сцене, или копия приведённого материала пришла к новой геометрии
    const before = THREE.Material.prototype.onBeforeRender;
    THREE.Material.prototype.onBeforeRender = function (this: THREE.Material, renderer, scene, camera, geometry, object, group) {
      before.call(this, renderer, scene, camera, geometry, object, group);
      if (scene === perf.h.scene) perf.atRender(this, geometry as THREE.BufferGeometry, object);
    };
  }

  /** Перед отрисовкой набережной: прогрев (один раз), дальность; в кадр пересчёта теней — вся сцена */
  beforeRender(): void {
    const { gl, camera } = this.h;
    if (!this.warmed) this.warm();
    const now = performance.now() / 1000;
    if (now >= this.scanAt) {
      this.scanAt = now + SCAN_S;
      this.scan();
      this.cullAt = 0;
    }
    if (now >= this.cullAt) {
      this.cullAt = now + CULL_S;
      this.cull(camera.position);
    }
    if (gl.shadowMap.enabled && gl.shadowMap.needsUpdate && this.culled.size) {
      this.shadowOpen = true;
      for (const u of this.culled.values()) this.show(u);
    }
    this.rendering = true;
  }

  afterRender(): void {
    this.rendering = false;
    if (!this.shadowOpen) return;
    this.shadowOpen = false;
    for (const u of this.culled.values()) this.hide(u);
  }

  /** Сколько чего сделано — для замера: __opus.app.lobby.world.perf.debug() */
  debug(): Record<string, unknown> {
    return { ...this.stats, units: this.units.length, culled: this.culled.size, programs: this.h.gl.info.programs?.length ?? 0 };
  }

  /** Программы шейдеров (тип, имя, сколько материалов): __opus.app.lobby.world.perf.programs() */
  programs(): Array<{ id: number; type: string; name: string; used: number }> {
    return (this.h.gl.info.programs ?? []).map((p) => {
      const q = p as unknown as { id: number; type: string; name: string; usedTimes: number };
      return { id: q.id, type: q.type, name: q.name, used: q.usedTimes };
    });
  }

  // ------------------------------------------------------------ прогрев

  /**
   * Весь «рисованный» вид сейчас и compileAsync по всему видимому — до первого кадра и с той же кривой тона, что у кадра.
   * Из скрытого — только погода и след лодки (warmHidden). События (пираты, шторм, русалка) не греем: их программы
   * соберутся, когда событие начнётся, как и раньше, и не съедают бюджет набережной.
   */
  private warm(): void {
    const { gl, scene, camera } = this.h;
    // материалы, которые модули подменили у сеток уже после add, — тоже к общему виду (до компиляции)
    this.adopt(scene);
    this.h.look?.paintNow();
    this.warmed = true;
    const t0 = performance.now();
    const tone = gl.toneMapping;
    gl.toneMapping = (scene.userData.toneMapping as THREE.ToneMapping | undefined) ?? THREE.ACESFilmicToneMapping;
    try {
      // compile обходит scene.traverse — подставляем обход только видимого; свет compile собирает из самой сцены
      // (targetScene), а у подставного «своего» света нет — иначе лампы посчитались бы дважды
      const visible = {
        traverse: (f: (o: THREE.Object3D) => void) => {
          scene.traverseVisible(f);
          for (const o of scene.children) if (!o.visible && warmHidden(o)) o.traverse(f);
        },
        traverseVisible: () => {},
      };
      gl.compileAsync(visible as unknown as THREE.Object3D, camera, scene).then(
        () => {
          this.stats.warmMs = Math.round(performance.now() - t0);
          this.stats.warmPrograms = gl.info.programs?.length ?? 0;
        },
        () => {},
      );
    } finally {
      gl.toneMapping = tone;
    }
  }

  // ------------------------------------------------------------ программы

  private inScene(o: THREE.Object3D): boolean {
    let n: THREE.Object3D = o;
    while (n.parent) n = n.parent;
    return n === this.h.scene;
  }

  /** Узел — желейка или в двух шагах от неё (корень аватара → узел приседания → тело 'jelly…', client/render/avatar.ts) */
  private static jellyNear(n: THREE.Object3D, depth = 2): boolean {
    const m = (n as THREE.Mesh).material;
    if (m && !Array.isArray(m) && m.customProgramCacheKey().startsWith('jelly')) return true;
    if (depth > 0) for (const c of n.children) if (Plaza3Perf.jellyNear(c, depth - 1)) return true;
    return false;
  }

  /** Часть желейки (тело, глаза, шапка, удочка в руке): кто-то из предков — её корень. «Рисованный» вид у желеек свой */
  private avatarOf(o: THREE.Object3D): boolean {
    for (let n: THREE.Object3D | null = o; n && n !== this.h.scene; n = n.parent) if (Plaza3Perf.jellyNear(n)) return true;
    return false;
  }

  /** Подграф встал в сцену: решения по новым материалам (по всем их геометриям), геометрия — под решение */
  private adopt(root: THREE.Object3D): void {
    const uses = new Map<THREE.Material, { meshes: THREE.Mesh[]; avatar: boolean }>();
    root.traverse((o) => {
      const d = o as THREE.Mesh;
      if (o === this.h.scene || !d.material || !d.geometry) return;
      const mats = Array.isArray(d.material) ? d.material : [d.material];
      const avatar = mats.some((m) => !this.seen.has(m)) && this.avatarOf(o);
      for (const m of mats) {
        let use = uses.get(m);
        if (!use) uses.set(m, (use = { meshes: [], avatar: false }));
        use.meshes.push(d);
        use.avatar ||= avatar;
      }
    });
    for (const [m, { meshes, avatar }] of uses) {
      this.decide(m, meshes.map((d) => d.geometry), avatar);
      for (const d of meshes) this.mesh(m, d);
    }
  }

  /** Сетка под решение по материалу: плоские грани — своими нормалями, инстансам — белый цвет, геометрии — цвета и нормали */
  private mesh(m: THREE.Material, d: THREE.Mesh): void {
    if (m.userData.p3flat && !Array.isArray(d.material)) {
      let flat = this.flats.get(d.geometry);
      if (!flat) {
        flat = d.geometry.index ? d.geometry.toNonIndexed() : d.geometry.clone();
        flat.deleteAttribute('normal');
        flat.computeVertexNormals();
        this.flats.set(d.geometry, flat);
        this.flats.set(flat, flat);
        this.stats.flat++;
      }
      d.geometry = flat;
    }
    if (m.userData.p3own && !Array.isArray(d.material)) {
      const col = d.geometry.getAttribute('color') as THREE.BufferAttribute | undefined;
      if (col && !this.mine.has(col)) d.geometry = this.whiteCopy(d.geometry);
    }
    const im = d as unknown as THREE.InstancedMesh;
    if (im.isInstancedMesh && !im.instanceColor && this.seen.get(m) && m.type === 'MeshStandardMaterial') {
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(im.instanceMatrix.count * 3).fill(1), 3);
      this.stats.instColor++;
    }
    this.geometry(m, d.geometry);
  }

  /** Решение по материалу — один раз: уже собранную программу не трогаем (вторая жила бы в кэше материала) */
  private decide(m: THREE.Material, geos: readonly THREE.BufferGeometry[], avatar: boolean): void {
    if (this.seen.has(m)) return;
    let c = canonOf(m, avatar);
    const compiled = (this.h.gl.properties.get(m) as { programs?: Map<string, unknown> }).programs?.size ?? 0;
    // свои цвета вершин у геометрии при материале без них: белые поверх в ту же геометрию поменяли бы картинку
    const colors = !(m as THREE.MeshBasicMaterial).vertexColors && geos.some((g) => {
      const c = g.getAttribute('color');
      return c && !this.mine.has(c as THREE.BufferAttribute);
    });
    if (c && compiled > 0) {
      m.userData.p3why = 'compiled';
      c = null;
    } else if (!c) m.userData.p3why = avatar ? 'avatar' : 'kind';
    // свои цвета вершин у геометрии, а материал их не читает: сетке — копия геометрии с теми же буферами и белым цветом
    // (только у неподвижной геометрии: живую модуль правит по своей ссылке — копия бы отстала)
    else if (colors && geos.every((g) => (g.getAttribute('position') as THREE.BufferAttribute | undefined)?.usage !== THREE.DynamicDrawUsage)) m.userData.p3own = true;
    else if (colors) {
      m.userData.p3why = 'colors';
      c = null;
    }
    this.seen.set(m, c);
    this.material(m, c, avatar);
    if (!c && !avatar) this.sibling(m, compiled);
  }

  /**
   * Свой шейдер (onBeforeCompile) у пары материалов, один с картой, другой без: второму — белую карту, и программа одна
   * (след катеров регаты: client/lobby/regattawake.ts). Порядок появления любой — ждём брата до первой компиляции.
   */
  private sibling(m: THREE.Material, compiled: number): void {
    if (!('map' in m) || m.type === 'ShaderMaterial' || m.userData.p3keep || m.name.startsWith('farm_')) return;
    const key = m.customProgramCacheKey();
    if (key === DEFAULT_KEY) return;
    const k = `${m.type}|${key}`;
    const s = m as THREE.MeshBasicMaterial;
    if (s.map) {
      if (this.mapKeys.has(k)) return;
      this.mapKeys.add(k);
      for (const p of this.mapless) if (p.userData.p3sib === k) this.whiten(p);
    } else if (!compiled) {
      m.userData.p3sib = k;
      if (this.mapKeys.has(k)) this.whiten(m);
      else this.mapless.add(m);
    }
  }

  private whiten(m: THREE.Material): void {
    this.mapless.delete(m);
    if ((this.h.gl.properties.get(m) as { programs?: Map<string, unknown> }).programs?.size) return;
    (m as THREE.MeshBasicMaterial).map = whiteMap();
    m.needsUpdate = true;
    m.userData.p3why = 'sibling';
    this.stats.maps++;
  }

  private material(m: THREE.Material, c: Canon | null, avatar: boolean): void {
    // прозрачное двустороннее — за один проход: без второй программы (flipSided) и второй отрисовки
    if (m.transparent && m.side === THREE.DoubleSide && !m.forceSinglePass) {
      m.forceSinglePass = true;
      this.stats.single++;
    }
    const s = m as THREE.MeshStandardMaterial;
    if (!this.rendering && s.envMap?.mapping === THREE.EquirectangularReflectionMapping) s.envMap = this.cube(s.envMap);
    if (c) {
      let changed = false;
      if (c.vc && !s.vertexColors) {
        s.vertexColors = true;
        // копии материала (clone) несут метку: их геометрии тоже нужны белые цвета
        m.userData.p3vc = true;
        changed = true;
      }
      if (c.map && !s.map) {
        s.map = whiteMap();
        this.stats.maps++;
        changed = true;
      }
      // плоские грани: те же нормали, но посчитанные в геометрии (mesh), — программа общая с гладкими
      if (s.flatShading && m.type === 'MeshStandardMaterial') {
        s.flatShading = false;
        m.userData.p3flat = true;
        changed = true;
      }
      if (changed) {
        m.needsUpdate = true;
        this.stats.canon++;
      }
    }
    // модель встала после первого кадра — «рисованный» вид, как у всего, что было в сцене тогда
    if (this.warmed && paintsLate(m, avatar) && this.h.look?.paintLate(m)) this.stats.late++;
  }

  /** Геометрия под материал: белые цвета вершин, если их включили мы; неосвещённому — нормали */
  private geometry(m: THREE.Material, g: THREE.BufferGeometry): void {
    let pos = g.getAttribute('position');
    if (!pos) {
      // пустая сетка-заглушка (материал «в сцене до первого кадра»): без position и нормалей у three — своя программа
      if (g.index || Object.keys(g.attributes).length) return;
      g.setAttribute('position', (pos = new THREE.Float32BufferAttribute([], 3)));
      g.setAttribute('normal', new THREE.Float32BufferAttribute([], 3));
      this.stats.empty++;
    }
    if (m.userData.p3vc && !g.getAttribute('color')) {
      const white = whiteColors(pos.count);
      this.mine.add(white);
      g.setAttribute('color', white);
      this.stats.colors++;
    }
    if (m.type === 'MeshBasicMaterial' && !g.getAttribute('normal')) {
      g.setAttribute('normal', upNormals(pos.count));
      this.stats.normals++;
    }
  }

  /** Копия геометрии на тех же буферах (позиции, индексы, uv — общие), только цвет вершин — белый, наш */
  private whiteCopy(g: THREE.BufferGeometry): THREE.BufferGeometry {
    let w = this.whites.get(g);
    if (w) return w;
    w = new THREE.BufferGeometry();
    w.name = g.name;
    w.setIndex(g.index);
    for (const [k, a] of Object.entries(g.attributes)) if (k !== 'color') w.setAttribute(k, a);
    w.morphAttributes = g.morphAttributes;
    w.morphTargetsRelative = g.morphTargetsRelative;
    for (const gr of g.groups) w.addGroup(gr.start, gr.count, gr.materialIndex);
    w.setDrawRange(g.drawRange.start, g.drawRange.count);
    w.boundingBox = g.boundingBox;
    w.boundingSphere = g.boundingSphere;
    const white = whiteColors(g.getAttribute('position').count);
    this.mine.add(white);
    w.setAttribute('color', white);
    this.whites.set(g, w);
    this.stats.copies++;
    return w;
  }

  /** Отрисовка материала, которого не видели (подменили у сетки): только правки без геометрии — иначе кадр был бы чёрным */
  private atRender(m: THREE.Material, g: THREE.BufferGeometry, o: THREE.Object3D): void {
    if (!this.seen.has(m)) {
      this.seen.set(m, null);
      m.userData.p3why = 'render';
      this.material(m, null, this.avatarOf(o));
      this.stats.missed++;
    }
    if (g && (m.userData.p3vc || m.type === 'MeshBasicMaterial')) this.geometry(m, g);
    if (m.userData.p3flat && (o as THREE.Mesh).geometry === g && this.flats.get(g) !== g) this.mesh(m, o as THREE.Mesh);
    const col = g?.getAttribute('color') as THREE.BufferAttribute | undefined;
    if (m.userData.p3own && col && !this.mine.has(col) && (o as THREE.Mesh).geometry === g) this.mesh(m, o as THREE.Mesh);
  }

  /** Развёртку отражения сворачиваем в куб сами и сразу освобождаем генератор (иначе у three живут две его программы) */
  private cube(src: THREE.Texture): THREE.Texture {
    let t = this.cubes.get(src);
    if (!t) {
      const pmrem = new THREE.PMREMGenerator(this.h.gl);
      t = pmrem.fromEquirectangular(src).texture;
      pmrem.dispose();
      this.cubes.set(src, t);
      this.stats.cubes++;
    }
    return t;
  }

  // ------------------------------------------------------------ дальность

  /**
   * Сферы всех узлов (снизу вверх) и узлы для отсечения: каждый не крупнее UNIT_MAX_R — и группа, и её мелкие части
   * (крысы гаснут раньше своей дорожки, чашки — раньше стола). Сетка спрятана, пока спрятан хоть один её узел.
   */
  private scan(): void {
    const { scene } = this.h;
    for (const c of scene.children) this.sphere(c);
    const units: Unit[] = [];
    // в желейке (игрок, житель с удочкой) узел — только длинная вещь без желе (удочка целиком); лицо, глаза, шапка — нет
    const visit = (o: THREE.Object3D, avatar: boolean, out: Unit[]): { ds: Drawable[]; jelly: boolean } => {
      const ds: Drawable[] = [];
      if (o.userData.p3keep) return { ds, jelly: false };
      if (o.parent === scene && Plaza3Perf.jellyNear(o)) avatar = true;
      const m = (o as Drawable).material;
      let jelly = !!m && !Array.isArray(m) && m.customProgramCacheKey().startsWith('jelly');
      if (m) ds.push(o as Drawable);
      const inner: Unit[] = [];
      for (const c of o.children) {
        const r = visit(c, avatar, avatar ? inner : out);
        for (const d of r.ds) ds.push(d);
        jelly ||= r.jelly;
      }
      const s = this.spheres.get(o);
      const ok = ds.length > 0 && !!s && !s.isEmpty() && s.radius <= UNIT_MAX_R && inArea(s.center.x, s.center.z);
      const unit = (lim?: number): Unit => ({ o, local: s!.center.clone().applyMatrix4(_inv.copy(o.matrixWorld).invert()), r: s!.radius, lim, drawables: ds });
      if (!avatar) {
        if (ok) out.push(unit());
      } else if (ok && !jelly && s!.radius >= HELD_MIN_R) out.push(unit(HELD_CULL));
      else for (const u of inner) out.push(u);
      return { ds, jelly };
    };
    for (const c of scene.children) visit(c, false, units);
    // отсечённые узлы: вернуть сетки и, если узел остался узлом, спрятать заново по свежему списку
    const next = new Map(units.map((u) => [u.o, u] as const));
    for (const [o, u] of this.culled) {
      this.show(u);
      const nu = next.get(o);
      if (nu) {
        this.culled.set(o, nu);
        this.hide(nu);
      } else this.culled.delete(o);
    }
    this.units = units;
  }

  /** Сфера подграфа в мировых координатах (пустая — рисовать нечего); скелетная сетка — «бесконечная» (не узел) */
  private sphere(o: THREE.Object3D): THREE.Sphere {
    let out = this.spheres.get(o);
    if (!out) this.spheres.set(o, (out = new THREE.Sphere()));
    out.makeEmpty();
    const d = o as THREE.Mesh;
    if (d.material && d.geometry) {
      const skin = (o as THREE.SkinnedMesh).isSkinnedMesh;
      const g = d.geometry;
      if (skin && !g.boundingSphere && g.getAttribute('position')) g.computeBoundingSphere();
      // скелетная: сфера позы привязки с запасом; мелкая (кошка, собака) — узел, крупная (житель) — никогда
      const skinR = skin && g.boundingSphere ? g.boundingSphere.radius * o.matrixWorld.getMaxScaleOnAxis() * 1.3 : Infinity;
      if (skin && skinR <= PET_MAX_R) {
        out.center.copy(g.boundingSphere!.center).applyMatrix4(o.matrixWorld);
        out.radius = skinR;
      } else if (skin || o.userData.p3keep) {
        out.center.setFromMatrixPosition(o.matrixWorld);
        out.radius = 1e6;
      } else if ((o as THREE.InstancedMesh).isInstancedMesh) {
        const im = o as THREE.InstancedMesh;
        if (im.count > 0) {
          if (!o.frustumCulled || !im.boundingSphere) im.computeBoundingSphere();
          if (im.boundingSphere) out.copy(im.boundingSphere).applyMatrix4(o.matrixWorld);
        }
      } else {
        const g = d.geometry;
        if (!g.boundingSphere && g.getAttribute('position')) g.computeBoundingSphere();
        if (g.boundingSphere && Number.isFinite(g.boundingSphere.radius) && g.boundingSphere.radius >= 0) out.copy(g.boundingSphere).applyMatrix4(o.matrixWorld);
      }
    }
    for (const c of o.children) {
      const s = this.sphere(c);
      if (s.isEmpty()) continue;
      if (out.isEmpty()) out.copy(s);
      else out.union(s);
    }
    return out;
  }

  private cull(cam: THREE.Vector3): void {
    for (const u of this.units) {
      const was = this.culled.has(u.o);
      // спрятанный модулем (круг на воде из запаса) — отпускаем: появится сразу, а далеко — погаснет на следующей проверке
      if (!shown(u.o)) {
        if (was) {
          this.culled.delete(u.o);
          this.show(u);
        }
        continue;
      }
      const d = Math.max(0, _c.copy(u.local).applyMatrix4(u.o.matrixWorld).distanceTo(cam) - u.r);
      const lim = u.lim ?? cullDistance(u.r);
      if (!was && d > lim) {
        this.culled.set(u.o, u);
        this.hide(u);
      } else if (was && d < lim - HYST) {
        this.culled.delete(u.o);
        this.show(u);
      }
    }
  }

  /** Спрятать сетки узла (счётчик: сетку прячут и её группа, и она сама) */
  private hide(u: Unit): void {
    for (const d of u.drawables) {
      const h = this.hidden.get(d);
      if (h) h.n++;
      else {
        this.hidden.set(d, { mask: d.layers.mask, n: 1 });
        d.layers.set(FAR_LAYER);
      }
    }
  }

  private show(u: Unit): void {
    for (const d of u.drawables) {
      const h = this.hidden.get(d);
      if (!h || --h.n > 0) continue;
      d.layers.mask = h.mask;
      this.hidden.delete(d);
    }
  }
}

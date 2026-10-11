// Павильоны новой набережной (флаг PLAZA3, пакет WP9): готовые GLB вместо серых коробок блокаута. Все файлы грузятся
// параллельно; группа (квартал) собирается, когда загрузились все её файлы: неподвижное (static_*, флажки) и предметы
// (anchor_prop__*) склеиваются по семейству материала — 2–3 отрисовки на группу, лампочки — в свечение группы (своей
// программы и отрисовки у них нет), живые узлы (флюгер, крылья мельницы, ставня картинга, часы, пропеллер и ветроуказатель, огонь мола) —
// отдельные сетки. Перед показом группы — прогрев шейдеров (compileAsync), затем прячутся коробки блокаута этих павильонов
// и пересчитываются тени. Холсты игры (доски почёта и онлайна, экран пейнтбола, джекпот, «Рекорды рыбаков» и рыбы дня)
// встают на поля моделей, маяк — модель вместо кодового, луч — от anchor_lamp. Твёрдое — в layout.json, от GLB не зависит:
// не загрузился файл — остаётся коробка блокаута (риск 11). Места — client/lobby/plaza3/pavdata.ts.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { TokarevLighthouse } from '../tokarev-lighthouse.ts';
import type { VenueCtx } from '../plaza/venue.ts';
import { loadPav, worldGeometry, type Family, type Part, type PavModel } from './models.ts';
import { plaza3Shadows, setRoofScreen, setShowcase } from './mounts.ts';
import { BOARD_FIELDS, PAVILIONS, PROP_FILES, SKIP_LIVE, type PavGroup, type PavPlace } from './pavdata.ts';
import type { Plaza3World } from './world.ts';
import type { CirclePosition } from '../../../shared/startzones.ts';
import { fortEntryOccupied, stepFortEntryDoor } from './fortentry.ts';

/** Порядок сборки групп: сначала то, что видно с точки появления */
const ORDER: readonly PavGroup[] = ['hub', 'games', 'arenas', 'port', 'beach', 'cliffs', 'farm', 'pier'];
const FAMILIES: readonly Family[] = ['matte', 'gloss', 'glow'];
/** Лампочка: шарик 5 см тёплого цвета, как во вьюере моделей; склеивается в свечение (гаснет вместе с ним) */
const BULB = ((): THREE.BufferGeometry => {
  const g = new THREE.IcosahedronGeometry(0.05, 0);
  const c = new THREE.Color(0xffe3a6);
  const n = g.getAttribute('position').count;
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).map((_v, i) => [c.r, c.g, c.b][i % 3]), 3));
  return g;
})();
/** Свечение (окна, фонари, табло-заглушки) при погашенном в сети свете */
const GLOW_OFF = 0.32;

export type BoardKey = 'honor' | 'online' | 'jackpot' | 'kart';

/** Что мир набережной даёт павильонам */
export interface PavHooks {
  gl: THREE.WebGLRenderer;
  camera: THREE.Camera;
  refreshShadows: () => void;
  /** Холсты игры (PlaneGeometry лицом на +Z) и их запасные рамки блокаута (прячутся, когда холст встал на поле модели) */
  boards: Partial<Record<BoardKey, { mesh: THREE.Mesh; frame?: THREE.Object3D }>>;
  /** Что спрятать, когда встал павильон (id → объекты блокаута, которых в модели нет места) */
  hide?: Partial<Record<string, THREE.Object3D[]>>;
  /** Кодовый маяк: его фонарь и луч переезжают на anchor_lamp модели, башня прячется */
  lighthouse?: { model: TokarevLighthouse; beam: THREE.Object3D[] };
  /** Фаза картинга: рольставня открыта на отсчёте, полуоткрыта в покое */
  kartPhase?: () => string;
}

interface Live {
  pivot: THREE.Object3D;
  base: THREE.Quaternion;
  tick: (l: Live, dt: number, t: number) => void;
  value: number;
}

export interface GroupStat {
  draws: number;
  tris: number;
  props: number;
  ms: number;
}

const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _axisY = new THREE.Vector3(0, 1, 0);
const _axisZ = new THREE.Vector3(0, 0, 1);

/** Матрица корня павильона: (x, y, z) (y по умолчанию 0 — Лавка Семёна стоит на помосте у мола) и поворот yaw */
export function placeMatrix(p: Pick<PavPlace, 'x' | 'z' | 'yaw' | 'y'>, out = new THREE.Matrix4()): THREE.Matrix4 {
  return out.makeRotationY(p.yaw).setPosition(p.x, p.y ?? 0, p.z);
}

/** Плоскость w×h (лицом на +Z) — на поле пустышки: центр, поворот, масштаб — половины ширины и высоты */
export function mountOn(mesh: THREE.Mesh, field: THREE.Matrix4, contain = false): void {
  const g = mesh.geometry as THREE.PlaneGeometry;
  const w = g.parameters?.width ?? 1;
  const h = g.parameters?.height ?? 1;
  field.decompose(_p, _q, _s);
  mesh.position.copy(_p);
  mesh.quaternion.copy(_q);
  // contain: холст целиком внутри поля, пропорции целы (как экран Telegram на крыше склада): по меньшему из двух масштабов
  const kx = (2 * _s.x) / w;
  const ky = (2 * _s.y) / h;
  if (contain) mesh.scale.set(Math.min(kx, ky), Math.min(kx, ky), 1);
  else mesh.scale.set(kx, ky, 1);
  mesh.updateMatrix();
}

export class Plaza3Pavilions {
  readonly group = new THREE.Group();
  private readonly ctx: VenueCtx;
  private readonly world: Plaza3World;
  private readonly hooks: PavHooks;
  private readonly mats: Record<Family, THREE.Material>;
  private bulbs = 0;
  private readonly lives: Live[] = [];
  private readonly redLights: THREE.MeshBasicMaterial[] = [];
  private lampsOn = true;
  private fortOpen = false;
  /** Сколько и чего собрано: группы, упавшие файлы — для замера (__opus) */
  readonly stats = { groups: {} as Record<string, GroupStat>, failed: [] as string[], loaded: [] as string[], ready: false };

  constructor(ctx: VenueCtx, world: Plaza3World, hooks: PavHooks) {
    this.ctx = ctx;
    this.world = world;
    this.hooks = hooks;
    plaza3Shadows.refresh = hooks.refreshShadows;
    this.group.name = 'plaza3-pavilions';
    const std = (roughness: number, name: string): THREE.MeshStandardMaterial => {
      const m = ctx.wet(new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness: 0 }));
      m.name = name;
      return m;
    };
    const glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    glow.name = 'p3_glow';
    this.mats = { matte: std(0.85, 'p3_matte'), gloss: std(0.35, 'p3_gloss'), glow };
    // материалы — в сцене до первого кадра (пустые сетки): «рисованный» вид (look v2) красит всё, что есть в сцене тогда
    for (const f of FAMILIES) {
      const holder = new THREE.Mesh(new THREE.BufferGeometry(), this.mats[f]);
      holder.visible = false;
      this.group.add(holder);
    }
    ctx.scene.add(this.group);
    void this.load();
  }

  private async load(): Promise<void> {
    const pieces = this.loadPieces();
    const byGroup = new Map<PavGroup, Promise<Array<[PavPlace, PavModel | null]>>>();
    for (const g of ORDER) {
      const list = PAVILIONS.filter((p) => p.group === g);
      byGroup.set(g, Promise.all(list.map(async (p): Promise<[PavPlace, PavModel | null]> => [p, await loadPav(p.file)])));
    }
    const lib = await pieces;
    for (const g of ORDER) {
      const got = await byGroup.get(g)!;
      // группа за группой, между ними — кадр: склейка не стоит одним длинным куском
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      try {
        await this.build(g, got, lib);
      } catch (e) {
        console.warn('[набережная] группа павильонов', g, e);
        for (const [p] of got) this.stats.failed.push(p.id);
      }
    }
    this.stats.ready = true;
  }

  /** Детали предметов из библиотек: имя узла → его сетки (в осях детали) */
  private async loadPieces(): Promise<Map<string, Part[]>> {
    const lib = new Map<string, Part[]>();
    for (const m of await Promise.all(PROP_FILES.map((f) => loadPav(f)))) {
      if (!m) continue;
      for (const [name, parts] of m.nodes) if (!lib.has(name) && parts.length) lib.set(name, parts);
    }
    return lib;
  }

  private async build(g: PavGroup, got: Array<[PavPlace, PavModel | null]>, lib: Map<string, Part[]>): Promise<void> {
    const t0 = performance.now();
    const buckets: Record<Family, THREE.BufferGeometry[]> = { matte: [], gloss: [], glow: [] };
    const root = new THREE.Matrix4();
    let props = 0;
    const ok: Array<[PavPlace, PavModel]> = [];
    const skip = new Set<string>([...Object.values(BOARD_FIELDS).map((b) => b.live).filter(Boolean), ...SKIP_LIVE]);
    for (const [p, model] of got) {
      if (!model) {
        this.stats.failed.push(p.id);
        continue;
      }
      ok.push([p, model]);
      placeMatrix(p, root);
      for (const [name, parts] of model.nodes) {
        if (!(name.startsWith('static_') || name.startsWith('live_')) || skip.has(name) || p.live?.includes(name)) continue;
        for (const part of parts) buckets[part.family].push(this.world.dressPavilionGround(p.id, name, worldGeometry(part.geo, _m.multiplyMatrices(root, part.matrix))));
      }
      for (const prop of model.props) {
        const parts = lib.get(prop.name);
        if (!parts) continue;
        props++;
        _m2.multiplyMatrices(root, prop.matrix);
        for (const part of parts) buckets[part.family].push(worldGeometry(part.geo, _m.multiplyMatrices(_m2, part.matrix)));
      }
      for (const b of model.bulbs) {
        _p.copy(b).applyMatrix4(root);
        buckets.glow.push(worldGeometry(BULB, _m.makeTranslation(_p.x, _p.y, _p.z)));
      }
      this.bulbs += model.bulbs.length;
      for (const name of p.live ?? []) this.addLive(p, model, name, root);
    }
    const holder = new THREE.Group();
    holder.name = `plaza3-pav-${g}`;
    let tris = 0;
    for (const f of FAMILIES) {
      const list = buckets[f];
      if (!list.length) continue;
      const geo = mergeGeometries(list, false);
      for (const x of list) x.dispose();
      if (!geo) continue;
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, this.mats[f]);
      mesh.name = `plaza3-${g}-${f}`;
      mesh.castShadow = f !== 'glow';
      mesh.receiveShadow = f !== 'glow';
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      tris += (geo.index ? geo.index.count : geo.getAttribute('position').count) / 3;
      holder.add(mesh);
    }
    // прогрев: программы собираются параллельно, пока кадр идёт, — показ группы без замирания
    holder.updateMatrixWorld(true);
    try {
      await this.hooks.gl.compileAsync(holder, this.hooks.camera, this.ctx.scene);
    } catch {
      // нет KHR_parallel_shader_compile — соберутся на первом кадре
    }
    this.group.add(holder);
    for (const [p, model] of ok) {
      this.world.hidePavilion(p.id);
      this.mount(p, model);
      this.stats.loaded.push(p.id);
    }
    this.stats.groups[g] = { draws: holder.children.length, tris: Math.round(tris), props, ms: Math.round(performance.now() - t0) };
    this.hooks.refreshShadows();
  }


  /** Живой узел: своя сетка с точкой подвеса узла; поворот/масштаб — в update */
  private addLive(p: PavPlace, model: PavModel, name: string, root: THREE.Matrix4): void {
    const node = model.lives.get(name);
    const parts = model.nodes.get(name);
    if (!node || !parts?.length) return;
    if (name === 'live_lamp' && this.hooks.lighthouse) return;
    const pivot = new THREE.Group();
    pivot.name = `plaza3-${p.id}-${name}`;
    _m.multiplyMatrices(root, node.matrixWorld).decompose(pivot.position, pivot.quaternion, pivot.scale);
    const inv = new THREE.Matrix4().copy(node.matrixWorld).invert();
    const red = name === 'live_mole_red_light' ? new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }) : null;
    if (red) this.redLights.push(red);
    for (const part of parts) {
      const mesh = new THREE.Mesh(worldGeometry(part.geo, _m.multiplyMatrices(inv, part.matrix)), red ?? this.mats[part.family]);
      mesh.castShadow = part.family !== 'glow';
      mesh.receiveShadow = true;
      pivot.add(mesh);
    }
    this.group.add(pivot);
    this.lives.push({ pivot, base: pivot.quaternion.clone(), tick: liveTick(name, this.hooks, () => this.fortOpen), value: name.startsWith('live_fort_door_') ? 0 : pivot.scale.y });
  }

  /** Холсты и маяк — на поля модели, когда она встала */
  private mount(p: PavPlace, model: PavModel): void {
    const root = placeMatrix(p);
    const field = (anchor: string): THREE.Matrix4 | null => {
      const a = model.anchors.get(anchor);
      return a ? new THREE.Matrix4().multiplyMatrices(root, a.matrix) : null;
    };
    for (const [key, f] of Object.entries(BOARD_FIELDS) as Array<[string, (typeof BOARD_FIELDS)[keyof typeof BOARD_FIELDS]]>) {
      if (f.pav !== p.id) continue;
      const board = this.hooks.boards[key as BoardKey];
      const at = field(f.anchor);
      if (!board || !at) continue;
      mountOn(board.mesh, at, key === 'kart');
      if (board.frame) board.frame.visible = false;
    }
    for (const o of this.hooks.hide?.[p.id] ?? []) o.visible = false;
    if (p.id === 'fishshowcase') {
      const board = field('anchor_board_records');
      const roof = field('anchor_records_roof');
      if (board && roof) {
        const fish = [1, 2, 3].map((i) => {
          const a = model.anchors.get(`anchor_fish_${i}`);
          const head = Array.isArray(a?.data.head) ? Number((a.data.head as number[])[0]) : 1;
          return { matrix: field(`anchor_fish_${i}`) ?? new THREE.Matrix4(), len: Number(a?.data.len ?? 1.3), maxH: Number(a?.data.max_h ?? 0.7), head };
        });
        const tags = [1, 2, 3].map((i) => field(`anchor_tag_${i}`)).filter((m): m is THREE.Matrix4 => !!m);
        setShowcase({ board, roof, fish, tags });
      }
    }
    if (p.id === 'paintball') {
      const screen = field('anchor_screen');
      if (screen) setRoofScreen(screen);
    }
    if (p.id === 'lighthouse' && this.hooks.lighthouse) this.mountLighthouse(model, root, this.hooks.lighthouse);
  }

  /** Маяк: кодовая башня прячется (её фонарь остаётся — его гасит шторм), фонарь — линза модели, луч — от anchor_lamp */
  private mountLighthouse(model: PavModel, root: THREE.Matrix4, lh: NonNullable<PavHooks['lighthouse']>): void {
    const lamp = model.anchors.get('anchor_lamp');
    const lens = model.nodes.get('live_lamp');
    const node = model.lives.get('live_lamp');
    if (!lamp || !lens?.length || !node) return;
    const at = _p.setFromMatrixPosition(_m.multiplyMatrices(root, lamp.matrix));
    const t = lh.model;
    for (const ch of t.group.children) if (ch !== t.lampAnchor) ch.visible = false;
    // фонарь кодового маяка стоит в его группе (корень — та же точка площадки): высота — как у anchor_lamp
    t.lampAnchor.position.y = at.y - t.group.position.y;
    const inv = new THREE.Matrix4().copy(node.matrixWorld).invert();
    const geos = lens.map((part) => worldGeometry(part.geo, _m2.multiplyMatrices(inv, part.matrix)));
    const merged = geos.length > 1 ? mergeGeometries(geos, false) : geos[0];
    if (merged) {
      t.lamp.geometry.dispose();
      t.lamp.geometry = merged;
      t.lamp.material = this.mats.glow;
    }
    for (const b of lh.beam) b.position.y = at.y;
  }

  /** Круг крепости: открываем по желейкам, не по расстоянию камеры. */
  setFortEntryPlayers(me: CirclePosition | null, others: Iterable<CirclePosition>, enabled: boolean): void {
    this.fortOpen = fortEntryOccupied(me, others, enabled);
  }

  /** Кадр: живые узлы; свет в сети погас — свечение и лампочки тускнеют (яркостью, без смены шейдеров) */
  update(dt: number, t: number, lampsOn: boolean): void {
    for (const l of this.lives) l.tick(l, dt, t);
    // красный огонь головы мола: проблеск 0,7 с раз в 2,4 с
    const blink = t % 2.4 < 0.7;
    for (const m of this.redLights) m.color.setScalar(blink ? 1.6 : 0.2);
    if (lampsOn === this.lampsOn) return;
    this.lampsOn = lampsOn;
    (this.mats.glow as THREE.MeshBasicMaterial).color.setScalar(lampsOn ? 1 : GLOW_OFF);
  }

  debug(): Record<string, unknown> {
    return { ...this.stats, bulbs: this.bulbs, lives: this.lives.length };
  }
}

/** Как двигается живой узел (по README моделей) */
function liveTick(name: string, hooks: PavHooks, fortOpen: () => boolean): Live['tick'] {
  const turn = (l: Live, axis: THREE.Vector3, a: number): void => {
    l.pivot.quaternion.copy(l.base).multiply(_q.setFromAxisAngle(axis, a));
  };
  switch (name) {
    // флюгер-чайка кафе: медленно ходит по ветру
    case 'live_vane':
      return (l, _dt, t) => turn(l, _axisY, 0.55 * Math.sin(t * 0.071) + 0.18 * Math.sin(t * 0.53 + 1.3));
    // крылья мельницы — вокруг вала (локальная Z)
    case 'live_sails':
      return (l, _dt, t) => turn(l, _axisZ, t * 0.45);
    // пропеллер аэроклуба — вокруг оси на восток (локальная Z), ветроуказатель — вокруг мачты
    case 'live_aeroclub_propeller':
      return (l, _dt, t) => turn(l, _axisZ, t * 2.6);
    case 'live_aeroclub_windsock':
      return (l, _dt, t) => turn(l, _axisY, 0.45 * Math.sin(t * 0.17) + 0.12 * Math.sin(t * 1.1));
    // часы киоска «Кто на набережной»: по настоящему времени; по часовой для смотрящего — rotation.z = +угол
    case 'live_clock_hour':
      return (l) => {
        const d = new Date();
        turn(l, _axisZ, (2 * Math.PI * ((d.getHours() % 12) + d.getMinutes() / 60)) / 12);
      };
    case 'live_clock_minute':
      return (l) => {
        const d = new Date();
        turn(l, _axisZ, (2 * Math.PI * (d.getMinutes() + d.getSeconds() / 60)) / 60);
      };
    // вода фонтана: лёгкий пульс струй (README-gq, раздел фонтана)
    case 'live_water':
      return (l, _dt, t) => {
        const s = 1 + 0.012 * Math.sin(t * 2.1 + 0.8);
        l.pivot.scale.set(s, 1 + 0.025 * Math.sin(t * 2.1), s);
      };
    // рольставня картинга: 1 — закрыта, 0,5 — в покое (видны карты), 0,08 — открыта на отсчёте
    case 'live_door':
      return (l, dt) => {
        const ph = hooks.kartPhase?.() ?? 'idle';
        const want = ph === 'count' ? 0.08 : ph === 'race' ? 1 : 0.5;
        l.value += (want - l.value) * (1 - Math.exp(-dt * 2.5));
        l.pivot.scale.y = l.value;
      };
    case 'live_fort_door_l':
    case 'live_fort_door_r':
      return (l, dt) => {
        l.value = stepFortEntryDoor(l.value, fortOpen(), dt);
        turn(l, _axisY, (name === 'live_fort_door_l' ? 1 : -1) * 1.3962634 * l.value);
      };
    default:
      return () => {};
  }
}

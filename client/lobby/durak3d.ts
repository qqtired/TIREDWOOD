// Дурак на столиках кафе в 3D: карты на столах, веера в руках, колода с козырем (стопка худеет, над ней — сколько карт
// осталось), бито, рука дурака в итоге; боты — желейки на своих стульях; полёт помидора; звуки стола (тасовка, карты, итог).
// Все карты всех столов — один инстансный меш с атласом. У каждой карты свой ключ: при новом виде стола она
// едет к новой цели (сыграли из руки, отбили, ушли в бито, забрал отбивавшийся, раздача и добор из колоды).
// Раскладка стола развёрнута к тому, кто за ним сидит; столы, за которыми не сидишь, — к площади (на запад).
import * as THREE from 'three';
import { HAND_SIZE, rankOf, suitOf } from '../../shared/durak.ts';
import { ACT_DURAK } from '../../shared/lobby.ts';
import { TABLE_SEATS, seatChair, seatTable, tableSeat, type Interactable } from '../../shared/maps/lobby.ts';
import type { DurakTableView } from '../../shared/messages.ts';
import { E_ALIVE, E_GROUNDED } from '../../shared/protocol.ts';
import type { Sound } from '../audio.ts';
import { Avatar, type AvatarPose } from '../render/avatar.ts';
import { CARD_ATLAS, cardAtlasTexture } from '../render/textures.ts';
import type { LobbyWorld } from './world.ts';

const CARD_W = 0.14;
const CARD_H = 0.2;
const MAX_CARDS = 512;
/** Карты лежат на столешнице (её верх — 0,775) */
const TOP_Y = 0.779;
/** Пары на столе: шаг по ширине и ряды (дальний, ближний — если пар больше трёх) */
const PAIR_DU = 0.17;
const PAIR_W: readonly [number, number] = [0.13, -0.13];
/** Отбивающая карта: сдвиг вправо и к смотрящему, поворот по часовой */
const DEF_DU = 0.03;
const DEF_DW = -0.055;
const DEF_ROT = -0.24;
/** Колода слева (козырь под ней поперёк, торчит вправо), бито справа */
const DECK_U = -0.44;
const TRUMP_U = -0.37;
const DISCARD_U = 0.44;
/** Стопка колоды: рубашка на каждые 5 карт (до 6) — видно, как колода худеет */
const DECK_PER_BACK = 5;
const DECK_BACKS_MAX = 6;
/** Табличка «сколько карт в колоде»: над стопкой, ширина, видна не дальше 9 м */
const COUNT_U = DECK_U + 0.035;
const COUNT_Y = 0.14;
const COUNT_W = 0.17;
const COUNT_FAR = 9;
const COUNT_FONT = 'Rubik, system-ui, sans-serif';
const DISCARD_JITTER: ReadonlyArray<readonly [number, number, number]> = [[0, 0, 0.35], [0.018, 0.012, -0.3], [-0.012, 0.022, 0.12]];
/** Веер в руках: от стула к столу, высота, наклон назад, шаг, ось вращения ниже карт */
const FAN_D = 0.55;
const FAN_Y = 1.02;
const FAN_TILT = -0.3;
const FAN_STEP = (9 * Math.PI) / 180;
const FAN_PIVOT = 0.17;
const FAN_MAX = 10;
/** Своя рука (её карты — в HTML): отсюда вылетают свои карты и сюда прилетают взятые */
const HAND_D = 0.62;
const HAND_Y = 0.95;
/** Стопка рубашек отошедшего и рука дурака в итоге — у края стола со стороны стула */
const STACK_R = 0.42;
const FOOL_R = 0.26;
/** Голова сидящей желейки: сюда летит помидор, над ней реакции, по ней ловится клик */
const HEAD_Y = 1.33;
/** Лицо сидящей желейки — на столько ближе стула к середине стола (глаза у неё спереди) */
const FACE_IN = 0.42;
/** Полёты: сыграли, подвинулись, ушли в бито / в руку, погасли; раздача и добор — по одной */
const PLAY_S = 0.32;
const MOVE_S = 0.28;
const GONE_S = 0.42;
const FADE_S = 0.22;
const DEAL_GAP = 0.05;
const DRAW_GAP = 0.08;
/** Помидор: время полёта и высота дуги */
const TOMATO_S = 0.45;
const TOMATO_ARC = 0.45;
const MAX_TOMATOES = 6;
/** Куда развёрнуты столы, за которыми не сидишь: к площади */
const DEFAULT_VIEW = (270 * Math.PI) / 180;

interface Card {
  cell: number;
  p: THREE.Vector3;
  q: THREE.Quaternion;
  s: number;
  p0: THREE.Vector3;
  q0: THREE.Quaternion;
  s0: number;
  p1: THREE.Vector3;
  q1: THREE.Quaternion;
  s1: number;
  t0: number;
  dur: number;
  arc: number;
  /** Доедет — и пропадёт */
  dying: boolean;
  /** Летит в руку этого стула: веер вырастет, когда долетит (−1 — никуда) */
  to: number;
  mark: number;
}

interface Pose {
  p: THREE.Vector3;
  q: THREE.Quaternion;
  s: number;
}

interface Table {
  t: number;
  x: number;
  z: number;
  /** Стулья по номеру и направление на каждый от центра стола */
  chairs: Interactable[];
  angles: number[];
  view: DurakTableView | null;
  cards: Map<string, Card>;
  bots: Array<Avatar | null>;
  botPose: AvatarPose[];
  /** Сколько карт ещё летит в руку стула */
  incoming: number[];
  /** Откуда пришли новые карты стола: карта → стул */
  src: Map<number, number>;
  /** Куда уходят карты, пропавшие со стола: стул взявшего, −1 — в бито, −2 — просто погаснуть */
  goneTo: number;
  dirty: boolean;
  /** Табличка над колодой */
  count: DeckCount;
}

/** Сколько карт в колоде — табличкой над стопкой (картинка — на холсте, перерисовка при смене числа) */
interface DeckCount {
  sprite: THREE.Sprite;
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  /** Число на табличке (−1 — ещё не рисовали) */
  n: number;
  /** Идёт партия и в колоде есть карты */
  on: boolean;
}

/** Что случилось на столе с прошлого вида (для звука) */
interface Changes {
  deal: boolean;
  played: number;
  gone: number;
}

interface Tomato {
  node: THREE.Group;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  spin: THREE.Vector3;
  done: (() => void) | null;
}

const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _pose: Pose = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: 1 };
const _from: Pose = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: 1 };

/** Карта плашмя лицом вверх; верх карты смотрит в сторону (−sin yaw, −cos yaw). */
function flatQ(yaw: number, out: THREE.Quaternion): THREE.Quaternion {
  return out.setFromEuler(_e.set(-Math.PI / 2, yaw, 0, 'YXZ'));
}

/** Материал карт: атлас, ячейку выбирает атрибут aCard; лёгкое свечение — чтобы в сумерках читались. */
function cardMaterial(): THREE.MeshStandardMaterial {
  const map = cardAtlasTexture();
  const mat = new THREE.MeshStandardMaterial({
    map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.22, roughness: 0.6, side: THREE.DoubleSide, alphaTest: 0.5,
  });
  const A = CARD_ATLAS;
  const f = (n: number): string => n.toFixed(1);
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = `attribute float aCard;\n${sh.vertexShader}`.replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
      {
        float cardCol = mod(aCard, ${f(A.cols)});
        float cardRow = floor(aCard / ${f(A.cols)} + 0.001);
        vec2 cardUv = vec2(
          (cardCol * ${f(A.cellW)} + ${f(A.padX)} + uv.x * ${f(A.cellW - A.padX * 2)}) / ${f(A.cols * A.cellW)},
          1.0 - (cardRow * ${f(A.cellH)} + ${f(A.padY)} + (1.0 - uv.y) * ${f(A.cellH - A.padY * 2)}) / ${f(A.rows * A.cellH)});
        vMapUv = cardUv;
        #ifdef USE_EMISSIVEMAP
        vEmissiveMapUv = cardUv;
        #endif
      }`,
    );
  };
  mat.customProgramCacheKey = () => 'durak-card';
  return mat;
}

/** Порядок карт в руке дурака: по масти (козыри — последними), внутри — по достоинству. */
function handOrder(trumpSuit: number): (a: number, b: number) => number {
  const key = (c: number): number => (suitOf(c) === trumpSuit ? 4 : suitOf(c)) * 9 + rankOf(c);
  return (a, b) => key(a) - key(b);
}

function makeDeckCount(scene: THREE.Scene): DeckCount {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
  sprite.scale.set(COUNT_W, COUNT_W / 2, 1);
  sprite.renderOrder = 5;
  sprite.visible = false;
  scene.add(sprite);
  return { sprite, ctx, tex, n: -1, on: false };
}

/** Табличка: тёмная плашка, слева рубашка карты, справа число. */
function drawDeckCount(dc: DeckCount, n: number): void {
  if (dc.n === n) return;
  dc.n = n;
  const c = dc.ctx;
  c.clearRect(0, 0, 128, 64);
  c.fillStyle = 'rgba(32, 24, 20, 0.84)';
  c.strokeStyle = 'rgba(255, 236, 200, 0.75)';
  c.lineWidth = 3;
  c.beginPath();
  c.roundRect(3, 5, 122, 54, 18);
  c.fill();
  c.stroke();
  // рубашка: красная, с белой рамкой и ромбиком
  c.fillStyle = '#fff6ea';
  c.beginPath();
  c.roundRect(14, 13, 28, 38, 5);
  c.fill();
  c.fillStyle = '#c8323a';
  c.beginPath();
  c.roundRect(17, 16, 22, 32, 3);
  c.fill();
  c.fillStyle = '#fff6ea';
  c.beginPath();
  c.moveTo(28, 22);
  c.lineTo(34, 32);
  c.lineTo(28, 42);
  c.lineTo(22, 32);
  c.closePath();
  c.fill();
  c.fillStyle = '#ffffff';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.font = `900 ${n >= 10 ? 40 : 44}px ${COUNT_FONT}`;
  c.fillText(String(n), 84, 34);
  dc.tex.needsUpdate = true;
}

function newCard(cell: number): Card {
  return {
    cell, p: new THREE.Vector3(), q: new THREE.Quaternion(), s: 1,
    p0: new THREE.Vector3(), q0: new THREE.Quaternion(), s0: 1,
    p1: new THREE.Vector3(), q1: new THREE.Quaternion(), s1: 1,
    t0: 0, dur: 0, arc: 0, dying: false, to: -1, mark: 0,
  };
}

export class DurakTables3D {
  private readonly world: LobbyWorld;
  private readonly sound: Sound;
  private readonly mesh: THREE.InstancedMesh;
  private readonly cellAttr: THREE.InstancedBufferAttribute;
  private readonly tables: Table[] = [];
  private readonly allowedTables: ReadonlySet<number>;
  private readonly tomatoes: Tomato[] = [];
  private now = 0;
  private markN = 0;
  private flightN = 0;
  /** Свой стол и стул (−1 — не за столом) */
  private meTable = -1;
  private meChair = -1;

  constructor(world: LobbyWorld, sound: Sound, allowedTables?: readonly number[]) {
    this.world = world;
    this.sound = sound;
    this.allowedTables = new Set(allowedTables ?? world.map.tables.map((_, t) => t));
    const geo = new THREE.PlaneGeometry(CARD_W, CARD_H);
    this.cellAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_CARDS), 1);
    this.cellAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aCard', this.cellAttr);
    this.mesh = new THREE.InstancedMesh(geo, cardMaterial(), MAX_CARDS);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    world.scene.add(this.mesh);

    const { map } = world;
    map.tables.forEach((tp, t) => {
      const chairs: Interactable[] = [];
      for (const it of map.interact) if (it.kind === 'durak' && seatTable(it.arg) === t) chairs[seatChair(it.arg)] = it;
      this.tables.push({
        t, x: tp.x, z: tp.z, chairs, angles: chairs.map((it) => Math.atan2(it.x - tp.x, it.z - tp.z)),
        view: null, cards: new Map(), bots: new Array<Avatar | null>(TABLE_SEATS).fill(null),
        botPose: chairs.map((it) => ({ x: it.x, y: it.y, z: it.z, yaw: it.yaw, pitch: 0, flags: E_ALIVE | E_GROUNDED })),
        incoming: new Array<number>(TABLE_SEATS).fill(0), src: new Map(), goneTo: -2, dirty: false, count: makeDeckCount(world.scene),
      });
    });

    // помидоры: красный шарик с зелёной звёздочкой-хвостиком
    const red = new THREE.MeshStandardMaterial({ color: 0xe5322a, roughness: 0.35 });
    const green = new THREE.MeshStandardMaterial({ color: 0x3f8f2f, roughness: 0.7 });
    const ball = new THREE.SphereGeometry(0.075, 14, 10);
    ball.scale(1, 0.86, 1);
    const leaf = new THREE.ConeGeometry(0.045, 0.03, 5);
    leaf.translate(0, 0.07, 0);
    for (let i = 0; i < MAX_TOMATOES; i++) {
      const node = new THREE.Group();
      node.add(new THREE.Mesh(ball, red), new THREE.Mesh(leaf, green));
      node.visible = false;
      world.scene.add(node);
      this.tomatoes.push({ node, from: new THREE.Vector3(), to: new THREE.Vector3(), t: -1, spin: new THREE.Vector3(), done: null });
    }
  }

  // ------------------------------------------------------------ снаружи

  /** Своё место за столом (номер места на набережной), −1 — не за столом: свой веер не рисуем, стол разворачиваем к себе. */
  setMe(seat: number): void {
    if (seat >= 0 && !this.allowedTables.has(seatTable(seat))) seat = -1;
    const t = seat >= 0 ? seatTable(seat) : -1;
    const ch = seat >= 0 ? seatChair(seat) : -1;
    if (t === this.meTable && ch === this.meChair) return;
    const old = this.meTable;
    this.meTable = t;
    this.meChair = ch;
    for (const tb of this.tables) if (tb.t === old || tb.t === t) tb.dirty = true;
  }

  /** Новый вид стола с сервера. */
  apply(t: number, v: DurakTableView): void {
    const tb = this.tables[t];
    if (!tb || !this.allowedTables.has(t)) return;
    const prev = tb.view;
    tb.view = v;
    this.syncBots(tb);
    const ch = this.diff(tb, prev, v);
    this.layout(tb);
    this.playSounds(tb, prev, v, ch);
  }

  /** Тасовка при раздаче, щелчки карт, в конце — тромбон дураку и фанфары остальным. */
  private playSounds(tb: Table, prev: DurakTableView | null, v: DurakTableView, ch: Changes): void {
    const pos: [number, number, number] = [tb.x, 0.9, tb.z];
    if (ch.deal) this.sound.shuffle(pos);
    if (ch.played > 0 || ch.gone > 0) this.sound.card(pos);
    if (v.phase !== 'result' || prev?.phase !== 'play' || !v.result) return;
    const mine = tb.t === this.meTable && this.meChair >= 0 ? v.seats[this.meChair] : null;
    const iPlayed = mine !== null && mine.k === 1 && mine.p >= 0;
    if (iPlayed && mine.p === v.result.fool) this.sound.foolHorn(null);
    else if (iPlayed) this.sound.fanfare(null);
    else if (v.result.fool >= 0) this.sound.foolHorn(pos);
    else this.sound.fanfare(pos);
  }

  /** Вид стола, который сейчас показан. */
  view(t: number): DurakTableView | null {
    return this.tables[t]?.view ?? null;
  }

  /** Желейка-бот на стуле (для реакций и помидоров), null — там не бот. */
  botAvatar(t: number, ch: number): Avatar | null {
    return this.tables[t]?.bots[ch] ?? null;
  }

  /** Голова сидящего на стуле. */
  headPos(t: number, ch: number, out: THREE.Vector3): THREE.Vector3 {
    const tb = this.tables[t];
    const it = tb?.chairs[ch];
    if (!tb || !it || !this.allowedTables.has(t)) return out.set(0, -100, 0);
    const a = tb.angles[ch];
    return out.set(it.x - Math.sin(a) * FACE_IN, it.y + HEAD_Y, it.z - Math.cos(a) * FACE_IN);
  }

  /** Помидор летит из from в to; done — когда долетел. */
  throwTomato(from: THREE.Vector3, to: THREE.Vector3, done: () => void): void {
    const tm = this.tomatoes.find((x) => x.t < 0) ?? this.tomatoes[0];
    tm.done?.();
    tm.from.copy(from);
    tm.to.copy(to);
    tm.t = 0;
    tm.spin.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 30);
    tm.done = done;
    tm.node.position.copy(from);
    tm.node.visible = true;
  }

  /** Ушли с набережной: всё убрать. */
  reset(): void {
    for (const tb of this.tables) {
      for (let ch = 0; ch < TABLE_SEATS; ch++) {
        tb.bots[ch]?.dispose(this.world.scene);
        tb.bots[ch] = null;
      }
      tb.cards.clear();
      tb.view = null;
      tb.incoming.fill(0);
      tb.src.clear();
      tb.goneTo = -2;
      tb.dirty = false;
      tb.count.on = false;
      tb.count.sprite.visible = false;
    }
    for (const tm of this.tomatoes) {
      tm.t = -1;
      tm.done = null;
      tm.node.visible = false;
    }
    this.meTable = -1;
    this.meChair = -1;
    this.mesh.count = 0;
  }

  update(dt: number, time: number, camPos: THREE.Vector3): void {
    this.now += dt;
    let n = 0;
    for (const tb of this.tables) {
      for (const [key, c] of tb.cards) {
        if (this.now >= c.t0) {
          const k = c.dur > 0 ? Math.min(1, (this.now - c.t0) / c.dur) : 1;
          const e = 1 - (1 - k) ** 3;
          c.p.lerpVectors(c.p0, c.p1, e);
          c.p.y += c.arc * Math.sin(Math.PI * k);
          c.q.slerpQuaternions(c.q0, c.q1, e);
          c.s = c.s0 + (c.s1 - c.s0) * e;
          if (k >= 1 && c.dying) {
            tb.cards.delete(key);
            if (c.to >= 0) {
              tb.incoming[c.to] = Math.max(0, tb.incoming[c.to] - 1);
              tb.dirty = true;
            }
            continue;
          }
        }
        if (n >= MAX_CARDS || c.s <= 0.001) continue;
        _m.compose(c.p, c.q, _s.setScalar(c.s));
        this.mesh.setMatrixAt(n, _m);
        this.cellAttr.setX(n, c.cell);
        n++;
      }
      if (tb.dirty) this.layout(tb);
      const dc = tb.count;
      dc.sprite.visible = dc.on && dc.sprite.position.distanceTo(camPos) < COUNT_FAR;
      for (let ch = 0; ch < TABLE_SEATS; ch++) tb.bots[ch]?.update(tb.botPose[ch], dt, time, this.world.collision, camPos, false);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.cellAttr.needsUpdate = true;
    this.updateTomatoes(dt);
  }

  // ------------------------------------------------------------ боты

  private syncBots(tb: Table): void {
    const v = tb.view;
    for (let ch = 0; ch < TABLE_SEATS; ch++) {
      const s = v?.seats[ch];
      const want = s?.k === 2;
      let av = tb.bots[ch];
      if (want && !av) {
        av = new Avatar(900 + tableSeat(tb.t, ch), { gun: false, voice: false });
        av.setAction(ACT_DURAK, tableSeat(tb.t, ch));
        av.addTo(this.world.scene);
        tb.bots[ch] = av;
      } else if (!want && av) {
        av.dispose(this.world.scene);
        tb.bots[ch] = null;
        av = null;
      }
      if (av && s) {
        if (av.name !== `🤖 ${s.nick}`) av.setInfo(`🤖 ${s.nick}`, null, false);
        if (s.o) av.setOutfit(s.o);
      }
    }
  }

  // ------------------------------------------------------------ что изменилось

  /** Сравнить с прошлым видом: откуда пришли новые карты стола, куда ушли старые, кому прилетают из колоды. */
  private diff(tb: Table, prev: DurakTableView | null, v: DurakTableView): Changes {
    const out: Changes = { deal: false, played: 0, gone: 0 };
    tb.src.clear();
    tb.goneTo = -2;
    const g = v.game;
    const pg = prev?.game ?? null;
    if (!g) return out;
    const chairOf = (p: number): number => v.seats.findIndex((s) => s.p === p);
    if (!pg) {
      // раздача (видели отсчёт): по одной по кругу, из колоды
      if (prev?.phase === 'count' && g.table.length === 0 && g.bout === 0) {
        out.deal = true;
        let k = 0;
        for (let r = 0; r < HAND_SIZE; r++) {
          for (let p = 0; p < g.n; p++) if (r < g.counts[p]) this.flyIn(tb, chairOf(p), 0.5 + k++ * DEAL_GAP);
        }
      }
      return out;
    }
    const had = new Set<number>();
    for (const pr of pg.table) {
      had.add(pr.a);
      if (pr.d >= 0) had.add(pr.d);
    }
    const has = new Set<number>();
    for (const pr of g.table) {
      has.add(pr.a);
      if (pr.d >= 0) has.add(pr.d);
    }
    // новая карта стола — от того, у кого карт стало меньше (отбивающая — от отбивавшегося)
    const dec = pg.counts.map((c, p) => c - (g.counts[p] ?? c));
    const from = (prefer: number): number => {
      if (prefer >= 0 && dec[prefer] > 0) {
        dec[prefer]--;
        return prefer;
      }
      const p = dec.findIndex((d) => d > 0);
      if (p >= 0) dec[p]--;
      return p;
    };
    for (const pr of g.table) {
      if (!had.has(pr.a)) {
        out.played++;
        const p = from(-1);
        if (p >= 0) tb.src.set(pr.a, chairOf(p));
      }
      if (pr.d >= 0 && !had.has(pr.d)) {
        out.played++;
        const p = from(pg.defender);
        if (p >= 0) tb.src.set(pr.d, chairOf(p));
      }
    }
    let gone = 0;
    for (const c of had) if (!has.has(c)) gone++;
    out.gone = gone;
    if (gone > 0) tb.goneTo = pg.taking ? chairOf(pg.defender) : -1;
    // добор из колоды
    const drawn = pg.deck - g.deck;
    if (drawn > 0) {
      let k = 0;
      for (let p = 0; p < g.n && k < drawn; p++) {
        let inc = g.counts[p] - pg.counts[p];
        if (pg.taking && p === pg.defender) inc -= gone;
        for (let i = 0; i < inc && k < drawn; i++) this.flyIn(tb, chairOf(p), GONE_S * 0.6 + k++ * DRAW_GAP);
      }
    }
    return out;
  }

  /** Рубашкой из колоды в руку стула ch (через delay секунд). */
  private flyIn(tb: Table, ch: number, delay: number): void {
    if (ch < 0) return;
    const va = this.viewAngle(tb);
    this.local(tb, va, DECK_U, 0, TOP_Y + 0.02, _from.p);
    flatQ(va, _from.q);
    _from.s = 1;
    this.handPose(tb, ch, _pose);
    const c = newCard(CARD_ATLAS.back);
    c.p.copy(_from.p);
    c.q.copy(_from.q);
    this.retarget(c, _pose, PLAY_S, 0.1, delay);
    c.dying = true;
    c.to = ch;
    tb.incoming[ch]++;
    tb.cards.set(`x${++this.flightN}`, c);
  }

  // ------------------------------------------------------------ раскладка

  private layout(tb: Table): void {
    tb.dirty = false;
    const mark = ++this.markN;
    const v = tb.view;
    const g = v?.game ?? null;
    tb.count.on = !!g && !g.over && g.deck > 0;
    if (v && g) {
      const va = this.viewAngle(tb);
      const chairOf = (p: number): number => v.seats.findIndex((s) => s.p === p);

      // пары: до трёх в ряд, по центру ряда
      const n = g.table.length;
      const rows = n > 3 ? 2 : 1;
      g.table.forEach((pr, i) => {
        const row = Math.floor(i / 3);
        const inRow = Math.min(3, n - row * 3);
        const u = (i % 3 - (inRow - 1) / 2) * PAIR_DU;
        const w = rows === 1 ? 0 : PAIR_W[row];
        this.flat(tb, mark, `:${pr.a}`, pr.a, va, u, w, TOP_Y + 0.001, 0);
        if (pr.d >= 0) this.flat(tb, mark, `:${pr.d}`, pr.d, va, u + DEF_DU, w + DEF_DW, TOP_Y + 0.004, DEF_ROT);
      });

      // колода: козырь поперёк под стопкой, сверху рубашки — по одной на каждые 5 карт; над ней — сколько карт осталось
      if (g.deck >= 1) this.flat(tb, mark, 'tr', g.trump, va, TRUMP_U, 0, TOP_Y + 0.001, -Math.PI / 2);
      const backs = g.deck >= 2 ? Math.min(DECK_BACKS_MAX, Math.ceil((g.deck - 1) / DECK_PER_BACK)) : 0;
      for (let i = 0; i < backs; i++) this.flat(tb, mark, `k${i}`, CARD_ATLAS.back, va, DECK_U, 0, TOP_Y + 0.004 + i * 0.004, Math.sin(i * 2.1) * 0.04);
      if (tb.count.on) {
        drawDeckCount(tb.count, g.deck);
        this.local(tb, va, COUNT_U, 0, TOP_Y + COUNT_Y, tb.count.sprite.position);
      }

      // бито: до трёх рубашек вразброс
      const dn = g.discard > 0 ? Math.min(3, 1 + Math.floor(g.discard / 8)) : 0;
      for (let i = 0; i < dn; i++) {
        const [du, dw, rot] = DISCARD_JITTER[i];
        this.flat(tb, mark, `d${i}`, CARD_ATLAS.back, va, DISCARD_U + du, dw, TOP_Y + 0.002 + i * 0.003, rot);
      }

      // веера и стопки отошедших; у дурака в итоге — карты лицом вверх
      for (let ch = 0; ch < TABLE_SEATS; ch++) {
        const s = v.seats[ch];
        if (!s || s.p < 0 || s.p >= g.n) continue;
        if (g.over && s.p === g.fool) continue;
        if (tb.t === this.meTable && ch === this.meChair) continue;
        const cnt = Math.max(0, Math.min(FAN_MAX, g.counts[s.p] - tb.incoming[ch]));
        if (s.k === 1 && s.id === 0) this.stack(tb, mark, ch, cnt);
        else this.fan(tb, mark, ch, cnt);
      }
      if (g.over && g.fool >= 0) this.foolHand(tb, mark, va, chairOf(g.fool), [...g.foolHand].sort(handOrder(suitOf(g.trump))));
    }

    // пропавшие: карты стола — в бито или в руку взявшего, остальное гаснет на месте
    for (const [key, c] of tb.cards) {
      if (c.mark === mark || c.dying) continue;
      c.dying = true;
      if (key.startsWith(':') && tb.goneTo !== -2) {
        if (tb.goneTo >= 0) {
          this.handPose(tb, tb.goneTo, _pose);
          c.to = tb.goneTo;
          tb.incoming[tb.goneTo]++;
        } else {
          this.local(tb, this.viewAngle(tb), DISCARD_U, 0, TOP_Y + 0.012, _pose.p);
          flatQ(this.viewAngle(tb) + (Math.random() - 0.5) * 0.6, _pose.q);
          _pose.s = 1;
          c.cell = CARD_ATLAS.back;
        }
        this.retarget(c, _pose, GONE_S, 0.12, 0);
      } else {
        _pose.p.copy(c.p1);
        _pose.q.copy(c.q1);
        _pose.s = 0;
        this.retarget(c, _pose, FADE_S, 0, 0);
      }
    }
    tb.src.clear();
    tb.goneTo = -2;
  }

  /** Карта плашмя в координатах стола: u — вправо от смотрящего, w — от него вдаль, rot — поворот против часовой. */
  private flat(tb: Table, mark: number, key: string, cell: number, va: number, u: number, w: number, y: number, rot: number): void {
    this.local(tb, va, u, w, y, _pose.p);
    flatQ(va + rot, _pose.q);
    _pose.s = 1;
    let from: Pose | null = null;
    if (key.startsWith(':') && !tb.cards.has(key)) {
      const ch = tb.src.get(cell);
      if (ch !== undefined && ch >= 0) from = this.handPose(tb, ch, _from);
    }
    this.place(tb, mark, key, cell, _pose, from, from ? PLAY_S : MOVE_S, from ? 0.1 : 0);
  }

  /** Веер рубашек в руках сидящего на стуле ch. */
  private fan(tb: Table, mark: number, ch: number, n: number): void {
    const it = tb.chairs[ch];
    const a = tb.angles[ch];
    const cx = it.x - Math.sin(a) * FAN_D;
    const cz = it.z - Math.cos(a) * FAN_D;
    const base = _from.q.setFromEuler(_e.set(FAN_TILT, a, 0, 'YXZ'));
    for (let k = 0; k < n; k++) {
      const phi = ((n - 1) / 2 - k) * FAN_STEP;
      _v.set(-Math.sin(phi) * FAN_PIVOT, Math.cos(phi) * FAN_PIVOT - FAN_PIVOT, k * 0.0015).applyQuaternion(base);
      _pose.p.set(cx + _v.x, it.y + FAN_Y + _v.y, cz + _v.z);
      _pose.q.setFromEuler(_e.set(FAN_TILT, a, phi, 'YXZ'));
      _pose.s = 1;
      this.place(tb, mark, `f${ch}:${k}`, CARD_ATLAS.back, _pose, null, MOVE_S, 0);
    }
  }

  /** Отошёл: его карты стопкой на столе у его края. */
  private stack(tb: Table, mark: number, ch: number, n: number): void {
    const a = tb.angles[ch];
    for (let k = 0; k < n; k++) {
      _pose.p.set(tb.x + Math.sin(a) * STACK_R, TOP_Y + 0.001 + k * 0.0035, tb.z + Math.cos(a) * STACK_R);
      flatQ(a + Math.sin(k * 2.3) * 0.12, _pose.q);
      _pose.s = 1;
      this.place(tb, mark, `f${ch}:${k}`, CARD_ATLAS.back, _pose, null, GONE_S, 0.06);
    }
  }

  /** Итог: рука дурака лицом вверх ближе к его краю — смотрите все. */
  private foolHand(tb: Table, mark: number, va: number, ch: number, hand: number[]): void {
    if (ch < 0) return;
    const a = tb.angles[ch];
    const m = hand.length;
    const step = Math.min(0.085, 0.62 / Math.max(1, m));
    const tx = Math.cos(va);
    const tz = -Math.sin(va);
    hand.forEach((card, k) => {
      const off = (k - (m - 1) / 2) * step;
      _pose.p.set(tb.x + Math.sin(a) * FOOL_R + tx * off, TOP_Y + 0.002 + k * 0.0012, tb.z + Math.cos(a) * FOOL_R + tz * off);
      flatQ(va, _pose.q);
      _pose.s = 1;
      const key = `h:${card}`;
      const from = tb.cards.has(key) ? null : this.handPose(tb, ch, _from);
      this.place(tb, mark, key, card, _pose, from, PLAY_S + k * 0.02, 0.08);
    });
  }

  /** Поставить карту с ключом к цели: новая — из from (или сразу на место), старая — едет, если цель сменилась. */
  private place(tb: Table, mark: number, key: string, cell: number, to: Pose, from: Pose | null, dur: number, arc: number): void {
    let c = tb.cards.get(key);
    if (!c) {
      c = newCard(cell);
      const start = from ?? to;
      c.p.copy(start.p);
      c.q.copy(start.q);
      c.s = start.s;
      c.p1.copy(c.p);
      c.q1.copy(c.q);
      c.s1 = c.s;
      tb.cards.set(key, c);
    }
    c.mark = mark;
    c.cell = cell;
    const revived = c.dying;
    if (revived) {
      c.dying = false;
      if (c.to >= 0) tb.incoming[c.to] = Math.max(0, tb.incoming[c.to] - 1);
      c.to = -1;
    }
    if (revived || c.p1.distanceToSquared(to.p) > 1e-8 || c.q1.angleTo(to.q) > 1e-4 || Math.abs(c.s1 - to.s) > 1e-4) {
      this.retarget(c, to, dur, arc, 0);
    }
  }

  private retarget(c: Card, to: Pose, dur: number, arc: number, delay: number): void {
    c.p0.copy(c.p);
    c.q0.copy(c.q);
    c.s0 = c.s;
    c.p1.copy(to.p);
    c.q1.copy(to.q);
    c.s1 = to.s;
    c.t0 = this.now + delay;
    c.dur = dur;
    c.arc = arc;
  }

  /** Рука сидящего на стуле ch: у своего — перед собой, ниже камеры; у остальных — середина веера. */
  private handPose(tb: Table, ch: number, out: Pose): Pose {
    const it = tb.chairs[ch];
    const a = tb.angles[ch];
    out.s = 1;
    if (tb.t === this.meTable && ch === this.meChair) {
      out.p.set(it.x - Math.sin(a) * HAND_D, it.y + HAND_Y, it.z - Math.cos(a) * HAND_D);
      flatQ(a, out.q);
      return out;
    }
    out.p.set(it.x - Math.sin(a) * FAN_D, it.y + FAN_Y, it.z - Math.cos(a) * FAN_D);
    out.q.setFromEuler(_e.set(FAN_TILT, a, 0, 'YXZ'));
    return out;
  }

  /** Куда развёрнут стол: к своему стулу или к площади. */
  private viewAngle(tb: Table): number {
    return tb.t === this.meTable && this.meChair >= 0 ? tb.angles[this.meChair] : DEFAULT_VIEW;
  }

  /** Точка стола по координатам смотрящего (u — вправо, w — вдаль). */
  private local(tb: Table, va: number, u: number, w: number, y: number, out: THREE.Vector3): THREE.Vector3 {
    const fx = -Math.sin(va);
    const fz = -Math.cos(va);
    return out.set(tb.x + u * Math.cos(va) + w * fx, y, tb.z - u * Math.sin(va) + w * fz);
  }

  // ------------------------------------------------------------ помидоры

  private updateTomatoes(dt: number): void {
    for (const tm of this.tomatoes) {
      if (tm.t < 0) continue;
      tm.t += dt / TOMATO_S;
      const k = Math.min(1, tm.t);
      tm.node.position.lerpVectors(tm.from, tm.to, k);
      tm.node.position.y += TOMATO_ARC * Math.sin(Math.PI * k);
      tm.node.rotation.x += tm.spin.x * dt;
      tm.node.rotation.y += tm.spin.y * dt;
      tm.node.rotation.z += tm.spin.z * dt;
      if (k >= 1) {
        tm.t = -1;
        tm.node.visible = false;
        const done = tm.done;
        tm.done = null;
        done?.();
      }
    }
  }
}

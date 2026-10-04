// Дурак на столиках кафе в 3D: карты на столах, веера в руках, колода с козырем (стопка худеет, над ней — сколько карт
// осталось), бито, рука дурака в итоге; боты — желейки на своих стульях; полёт помидора; звуки стола (тасовка, карты, итог);
// «щик» по кромке клеёнки — кто на кого ходит: огонёк бежит по краю стола от ходящего к отбивающемуся.
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
import { CARD_ATLAS, cardAtlasTexture, drawSuit } from '../render/textures.ts';
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
const COUNT_W = 0.255;
const COUNT_FAR = 9;
const COUNT_FONT = 'Rubik, system-ui, sans-serif';
/**
 * Козырь на столе. Значок масти — светящийся круг на клеёнке у колоды, со стороны смотрящего (с дальней его закрывает
 * табличка с числом карт, висящая над колодой); рамка — под козырной картой, выглядывающей из-под колоды; отметка —
 * тоньше, под каждым козырем, лежащим на столе. Клеёнка — 0,7775, карты — от 0,780: всё это между ними.
 */
const MARK_U = DECK_U + 0.01;
const MARK_W = -0.27;
const MARK_Y = TOP_Y - 0.0005;
/** Диаметр картинки значка (видимый круг — 0,82 от неё) */
const MARK_SIZE = 0.285;
/** Ширина свечения вокруг карты: у козыря под колодой и у козырей на столе; опускаем под карту на 0,8 мм */
const FRAME_PAD = 0.026;
const MARKS_PAD = 0.015;
const UNDER_CARD = 0.0008;
const MAX_MARKS = 64;
const DISCARD_JITTER: ReadonlyArray<readonly [number, number, number]> = [[0, 0, 0.35], [0.018, 0.012, -0.3], [-0.012, 0.022, 0.12]];
/** Веер в руках: от стула к столу (чтобы и десять карт не заходили в тело желейки), высота, наклон назад, шаг, ось вращения ниже карт */
const FAN_D = 0.65;
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
/** Сидящая желейка для клика-помидора по экрану: отрезок от таза до макушки; радиус тела — для размера на экране */
const BODY_LOW_Y = 0.5;
const BODY_TOP_Y = 1.62;
const BODY_IN = 0.25;
export const TORSO_R = 0.42;
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

// «Щик» по кромке стола — кто на кого ходит: по краю клеёнки от ходящего к отбивающемуся пробегает золотой огонёк
// с хвостом и гаснет у отбивающегося; повторяется раз в SWISH_PERIOD_S, сменилась пара (новый отбой, перевод) — сразу.
// Бежит коротким путём, а если сидят ровно напротив — по ходу игры (ход идёт к меньшему номеру стула).
/** Огонёк — «комета» вдоль края клеёнки: внешний край — чуть за кромкой, по валику — яркая светлая линия (в SWISH_LINE м
 *  от внешнего края), к середине стола — оранжевое свечение, гаснет; ширина у головы SWISH_W, у конца хвоста SWISH_W0;
 *  голова скруглена (SWISH_CAP, рад); высота над полом */
const SWISH_R = 0.712;
const SWISH_W = 0.1;
const SWISH_W0 = 0.03;
const SWISH_CAP = 0.1;
const SWISH_Y = 0.786;
const SWISH_LINE = 0.023;
/** Хвост, рад; пробег — SWISH_T0 + SWISH_T1 × угол (рад), с; у отбивающегося гаснет за SWISH_OUT_S */
const SWISH_TAIL = 0.8;
const SWISH_T0 = 0.3;
const SWISH_T1 = 0.25;
const SWISH_OUT_S = 0.45;
const SWISH_PERIOD_S = 2.4;
/** Отрезков хвоста и скруглённой головы; дальше SWISH_FAR м от камеры не рисуем (последние 2 м — гаснет) */
const SWISH_SEG = 24;
const CAP_SEG = 5;
const SWISH_FAR = 12;
/** Подпись игрока на панели (ник, карты, кто ходит) — под животом сидящего: от стула к столу и высота над полом */
const TAG_IN = 0.4;
const TAG_Y = 0.7;
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
  /** Значок козырной масти на клеёнке (масть на нём — markSuit) и рамка под козырной картой */
  mark: THREE.Mesh;
  markSuit: number;
  frame: THREE.Mesh;
  swish: Swish;
}

/** «Щик» стола: стулья ходящего и отбивающегося (−1 — партии нет), сколько идёт нынешний круг, с, и полоса */
interface Swish {
  a: number;
  d: number;
  t: number;
  mesh: THREE.Mesh;
  /** Вершины полосы и на каждой: близость к огоньку (1 — он сам, 0 — конец хвоста), поперёк (0 — к середине, 1 — край),
   *  сколько метров до внешнего края, прозрачность */
  pos: THREE.BufferAttribute;
  uvk: THREE.BufferAttribute;
}

/** Сколько карт в колоде — табличкой над стопкой (картинка — на холсте, перерисовка при смене числа) */
interface DeckCount {
  sprite: THREE.Sprite;
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  /** Число на табличке (−1 — ещё не рисовали) и козырная масть на ней */
  n: number;
  suit: number;
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
  canvas.width = 192;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
  sprite.scale.set(COUNT_W, COUNT_W / 3, 1);
  sprite.renderOrder = 5;
  sprite.visible = false;
  scene.add(sprite);
  return { sprite, ctx, tex, n: -1, suit: -1, on: false };
}

/** Табличка: тёмная плашка; слева — монетка козырной масти, дальше рубашка карты и число карт в колоде. */
function drawDeckCount(dc: DeckCount, n: number, suit: number): void {
  if (dc.n === n && dc.suit === suit) return;
  dc.n = n;
  dc.suit = suit;
  const c = dc.ctx;
  c.clearRect(0, 0, 192, 64);
  c.fillStyle = 'rgba(32, 24, 20, 0.84)';
  c.strokeStyle = 'rgba(255, 236, 200, 0.75)';
  c.lineWidth = 3;
  c.beginPath();
  c.roundRect(3, 5, 186, 54, 18);
  c.fill();
  c.stroke();
  // монетка козыря: золотой ободок, светлый диск, масть цветом карты
  c.fillStyle = '#f2b92f';
  c.beginPath();
  c.arc(34, 32, 23, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#fff6e0';
  c.beginPath();
  c.arc(34, 32, 19, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = suit >= 2 ? '#cc2730' : '#1d1f2c';
  drawSuit(c, suit, 34, 32, 26);
  // рубашка: красная, с белой рамкой и ромбиком
  const bx = 68;
  c.fillStyle = '#fff6ea';
  c.beginPath();
  c.roundRect(bx, 13, 28, 38, 5);
  c.fill();
  c.fillStyle = '#c8323a';
  c.beginPath();
  c.roundRect(bx + 3, 16, 22, 32, 3);
  c.fill();
  c.fillStyle = '#fff6ea';
  c.beginPath();
  c.moveTo(bx + 14, 22);
  c.lineTo(bx + 20, 32);
  c.lineTo(bx + 14, 42);
  c.lineTo(bx + 8, 32);
  c.closePath();
  c.fill();
  c.fillStyle = '#ffffff';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.font = `900 ${n >= 10 ? 40 : 44}px ${COUNT_FONT}`;
  c.fillText(String(n), 142, 34);
  dc.tex.needsUpdate = true;
}

const suitMarks: Array<THREE.CanvasTexture | undefined> = [];

/** Значок козырной масти для клеёнки: золотое свечение, тёмный ободок, золото, светлый диск и масть цветом карты. Один на масть. */
function suitMarkTexture(suit: number): THREE.CanvasTexture {
  const old = suitMarks[suit];
  if (old) return old;
  const S = 256;
  const m = S / 2;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  const glow = ctx.createRadialGradient(m, m, m * 0.7, m, m, m);
  glow.addColorStop(0, 'rgba(255, 208, 70, 0.85)');
  glow.addColorStop(1, 'rgba(255, 208, 70, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(m, m, m, 0, Math.PI * 2);
  ctx.fill();
  // ободок тёмный, чтобы значок читался и на светлой, и на красной клетке клеёнки
  for (const [r, color] of [[0.82, '#4a2a16'], [0.77, '#f2b92f'], [0.68, '#fff6e0']] as const) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(m, m, m * r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = suit >= 2 ? '#cc2730' : '#1d1f2c';
  drawSuit(ctx, suit, m, m, m * 0.95);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  suitMarks[suit] = tex;
  return tex;
}

const frames = new Map<number, THREE.CanvasTexture>();

/** Свечение вокруг карты шириной pad (м): золотой ободок с тёмным контуром и мягкий ореол. Саму карту закроет она сама. */
function frameTexture(pad: number): THREE.CanvasTexture {
  const old = frames.get(pad);
  if (old) return old;
  const K = 1000;
  const p = Math.round(pad * K);
  const w = Math.round(CARD_W * K);
  const h = Math.round(CARD_H * K);
  const r = Math.round(w * 0.1);
  const ring = Math.max(5, Math.round(p * 0.28));
  const canvas = document.createElement('canvas');
  canvas.width = w + 2 * p;
  canvas.height = h + 2 * p;
  const ctx = canvas.getContext('2d')!;
  ctx.save();
  ctx.shadowColor = 'rgba(255, 190, 40, 1)';
  ctx.shadowBlur = p * 0.9;
  ctx.fillStyle = '#ffc93a';
  ctx.beginPath();
  ctx.roundRect(p - 2, p - 2, w + 4, h + 4, r + 2);
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(92, 48, 8, 0.75)';
  ctx.beginPath();
  ctx.roundRect(p - ring - 3, p - ring - 3, w + 2 * ring + 6, h + 2 * ring + 6, r + ring + 3);
  ctx.stroke();
  ctx.lineWidth = ring;
  ctx.strokeStyle = '#ffd84d';
  ctx.beginPath();
  ctx.roundRect(p - ring / 2 - 1, p - ring / 2 - 1, w + ring + 2, h + ring + 2, r + ring / 2 + 1);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  frames.set(pad, tex);
  return tex;
}

/**
 * Светящаяся подкладка: без света и тумана, золото не сереет. Сдвига глубины (polygonOffset) нет: под острым углом он
 * уносит плоскость глубже клеёнки, и она пропадает; от карт её отделяют миллиметры по высоте.
 */
function glowMaterial(map: THREE.Texture, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ map, transparent: true, opacity, depthWrite: false, fog: false, toneMapped: false });
}

/**
 * Полоса «щика»: по валику клеёнки — яркая светлая линия (на красном валике и тёмном полу за столом видна чётко), к
 * середине стола — насыщенное оранжевое свечение, гаснет; хвост — к красному и прозрачнее. Без света и тумана, как свечения.
 */
function swishMaterial(): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, fog: false, toneMapped: false, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = `attribute vec4 aSwish;\nvarying vec4 vSwish;\n${sh.vertexShader}`.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n  vSwish = aSwish;',
    );
    sh.fragmentShader = `varying vec4 vSwish;\n${sh.fragmentShader}`.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      {
        float near = vSwish.x;
        float v = vSwish.y;
        float line = (1.0 - smoothstep(0.004, 0.012, abs(vSwish.z - ${SWISH_LINE.toFixed(3)}))) * smoothstep(0.1, 0.6, near);
        float glow = smoothstep(0.0, 0.45, v) * (1.0 - smoothstep(0.95, 1.0, v));
        vec3 col = mix(vec3(0.95, 0.25, 0.0), vec3(1.0, 0.55, 0.0), near);
        diffuseColor.rgb = mix(col, vec3(1.0, 0.93, 0.6), line);
        diffuseColor.a = vSwish.w * pow(near, 0.8) * max(glow * 0.95, line);
      }`,
    );
  };
  mat.customProgramCacheKey = () => 'durak-swish';
  return mat;
}

/** Пар вершин в полосе «щика» (у середины стола и у края): хвост до головы и скругление головы */
const SWISH_PAIRS = SWISH_SEG + 1 + CAP_SEG;

/**
 * Полоса «щика» одного стола: между соседними парами вершин — по два треугольника. Меш всегда «видим», без огонька у
 * него пустой диапазон отрисовки: прогрев при входе (compileAsync берёт только видимое) соберёт шейдер заранее, и первый
 * «щик» в партии не дёрнет кадр.
 */
function swishMesh(mat: THREE.Material): Pick<Swish, 'mesh' | 'pos' | 'uvk'> {
  const geo = new THREE.BufferGeometry();
  const pos = new THREE.BufferAttribute(new Float32Array(SWISH_PAIRS * 6), 3);
  const uvk = new THREE.BufferAttribute(new Float32Array(SWISH_PAIRS * 8), 4);
  pos.setUsage(THREE.DynamicDrawUsage);
  uvk.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', pos);
  geo.setAttribute('aSwish', uvk);
  const idx: number[] = [];
  for (let i = 0; i < SWISH_PAIRS - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, mat);
  geo.setDrawRange(0, 0);
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  return { mesh, pos, uvk };
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
  /** Рамка под козырной картой (материал общий: мигает у всех столов вместе) и отметки под козырями на столе */
  private readonly frameMat: THREE.MeshBasicMaterial;
  private readonly marksMat: THREE.MeshBasicMaterial;
  private readonly marks: THREE.InstancedMesh;
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

    this.frameMat = glowMaterial(frameTexture(FRAME_PAD), 1);
    this.marksMat = glowMaterial(frameTexture(MARKS_PAD), 0.85);
    this.marks = new THREE.InstancedMesh(new THREE.PlaneGeometry(CARD_W + 2 * MARKS_PAD, CARD_H + 2 * MARKS_PAD), this.marksMat, MAX_MARKS);
    this.marks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.marks.count = 0;
    this.marks.frustumCulled = false;
    this.marks.renderOrder = 2;
    world.scene.add(this.marks);
    const swishMat = swishMaterial();
    const frameGeo = new THREE.PlaneGeometry(CARD_W + 2 * FRAME_PAD, CARD_H + 2 * FRAME_PAD);
    const markGeo = new THREE.PlaneGeometry(MARK_SIZE, MARK_SIZE);

    const { map } = world;
    map.tables.forEach((tp, t) => {
      const chairs: Interactable[] = [];
      for (const it of map.interact) if (it.kind === 'durak' && seatTable(it.arg) === t) chairs[seatChair(it.arg)] = it;
      const mark = new THREE.Mesh(markGeo, glowMaterial(suitMarkTexture(0), 1));
      const frame = new THREE.Mesh(frameGeo, this.frameMat);
      for (const m of [mark, frame]) {
        m.visible = false;
        m.renderOrder = 2;
        world.scene.add(m);
      }
      const swish = { a: -1, d: -1, t: 0, ...swishMesh(swishMat) };
      world.scene.add(swish.mesh);
      this.tables.push({
        t, x: tp.x, z: tp.z, chairs, angles: chairs.map((it) => Math.atan2(it.x - tp.x, it.z - tp.z)),
        view: null, cards: new Map(), bots: new Array<Avatar | null>(TABLE_SEATS).fill(null),
        botPose: chairs.map((it) => ({ x: it.x, y: it.y, z: it.z, yaw: it.yaw, pitch: 0, flags: E_ALIVE | E_GROUNDED })),
        incoming: new Array<number>(TABLE_SEATS).fill(0), src: new Map(), goneTo: -2, dirty: false, count: makeDeckCount(world.scene),
        mark, markSuit: 0, frame, swish,
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
    this.aimSwish(tb);
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

  /** Где подпись сидящего на стуле (ник, карты, кто ходит): под животом, со стороны стола. */
  tagPos(t: number, ch: number, out: THREE.Vector3): boolean {
    const tb = this.tables[t];
    const it = tb?.chairs[ch];
    if (!tb || !it || !this.allowedTables.has(t)) return false;
    const a = tb.angles[ch];
    out.set(it.x - Math.sin(a) * TAG_IN, it.y + TAG_Y, it.z - Math.cos(a) * TAG_IN);
    return true;
  }

  /** Сидящий на стуле как отрезок «таз — макушка»: по нему ловится клик-помидор (радиус на экране вокруг отрезка). */
  bodyEnds(t: number, ch: number, low: THREE.Vector3, top: THREE.Vector3): boolean {
    const tb = this.tables[t];
    const it = tb?.chairs[ch];
    if (!tb || !it || !this.allowedTables.has(t)) return false;
    const a = tb.angles[ch];
    const x = it.x - Math.sin(a) * BODY_IN;
    const z = it.z - Math.cos(a) * BODY_IN;
    low.set(x, it.y + BODY_LOW_Y, z);
    top.set(x, it.y + BODY_TOP_Y, z);
    return true;
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
      tb.mark.visible = false;
      tb.frame.visible = false;
      Object.assign(tb.swish, { a: -1, d: -1, t: 0 });
      tb.swish.mesh.geometry.setDrawRange(0, 0);
    }
    this.marks.count = 0;
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
    let marks = 0;
    // козырь мягко мигает: рамка и отметки — прозрачностью, значок на клеёнке «дышит» размером (он непрозрачный, чтобы клетка не просвечивала)
    const pulse = 0.5 + 0.5 * Math.sin(time * 3.2);
    this.frameMat.opacity = 0.62 + 0.38 * pulse;
    this.marksMat.opacity = 0.7 + 0.2 * pulse;
    for (const tb of this.tables) {
      const trump = tb.view?.game ? suitOf(tb.view.game.trump) : -1;
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
        // козырь лежит на столе — под ним свечение, едет вместе с картой (козырь под колодой — отдельно, в рамке)
        if (trump >= 0 && marks < MAX_MARKS && key !== 'tr' && c.cell < CARD_ATLAS.back && suitOf(c.cell) === trump) {
          _v.set(0, 0, -UNDER_CARD).applyQuaternion(c.q).add(c.p);
          _m.compose(_v, c.q, _s.setScalar(c.s));
          this.marks.setMatrixAt(marks++, _m);
        }
      }
      const tr = tb.cards.get('tr');
      tb.frame.visible = !!tr && !tr.dying && tr.s > 0.001;
      if (tr && tb.frame.visible) {
        tb.frame.position.copy(_v.set(0, 0, -UNDER_CARD).applyQuaternion(tr.q).add(tr.p));
        tb.frame.quaternion.copy(tr.q);
        tb.frame.scale.setScalar(tr.s);
      }
      tb.mark.scale.setScalar(1 + 0.05 * pulse);
      if (tb.dirty) this.layout(tb);
      const dc = tb.count;
      dc.sprite.visible = dc.on && dc.sprite.position.distanceTo(camPos) < COUNT_FAR;
      for (let ch = 0; ch < TABLE_SEATS; ch++) tb.bots[ch]?.update(tb.botPose[ch], dt, time, this.world.collision, camPos, false);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.cellAttr.needsUpdate = true;
    this.marks.count = marks;
    this.marks.instanceMatrix.needsUpdate = true;
    this.updateSwish(dt, camPos);
    this.updateTomatoes(dt);
  }

  // ------------------------------------------------------------ «щик» по кромке: кто на кого ходит

  /** Кто на кого ходит: стулья ходящего и отбивающегося. Сменилась пара — огонёк бежит сразу; нет партии или итог — нет. */
  private aimSwish(tb: Table): void {
    const v = tb.view;
    const g = v?.game;
    let a = -1;
    let d = -1;
    if (v && g && !g.over && g.attacker !== g.defender) {
      a = v.seats.findIndex((s) => s.p === g.attacker);
      d = v.seats.findIndex((s) => s.p === g.defender);
      if (a < 0 || d < 0 || !tb.chairs[a] || !tb.chairs[d]) a = d = -1;
    }
    const sw = tb.swish;
    if (a === sw.a && d === sw.d) return;
    sw.a = a;
    sw.d = d;
    sw.t = 0;
  }

  /**
   * Огонёк с хвостом по краю клеёнки: голова за SWISH_T0 + SWISH_T1 × угол с доезжает от ходящего до отбивающегося
   * (с замедлением), потом хвост подтягивается к ней и всё гаснет; пауза до конца круга — и снова.
   */
  private updateSwish(dt: number, camPos: THREE.Vector3): void {
    for (const tb of this.tables) {
      const sw = tb.swish;
      sw.mesh.geometry.setDrawRange(0, 0);
      if (sw.a < 0) continue;
      sw.t = (sw.t + dt) % SWISH_PERIOD_S;
      const far = 1 - THREE.MathUtils.smoothstep(Math.hypot(tb.x - camPos.x, tb.z - camPos.z), SWISH_FAR - 2, SWISH_FAR);
      if (far <= 0) continue;
      const from = tb.angles[sw.a];
      let turn = Math.atan2(Math.sin(tb.angles[sw.d] - from), Math.cos(tb.angles[sw.d] - from));
      // ровно напротив — по ходу игры: к меньшему номеру стула, это меньший угол
      if (Math.abs(turn) > Math.PI - 0.01) turn = -Math.PI;
      const len = Math.abs(turn);
      const run = SWISH_T0 + SWISH_T1 * len;
      if (sw.t > run + SWISH_OUT_S) continue;
      const k = Math.min(1, sw.t / run);
      const head = len * (1 - (1 - k) * (1 - k));
      const out = sw.t > run ? (sw.t - run) / SWISH_OUT_S : 0;
      const tail = Math.max(0, head - SWISH_TAIL * (1 - out));
      const alpha = far * (1 - out);
      const y = tb.chairs[sw.a].y + SWISH_Y;
      // голова растёт из точки: пока огонёк не отъехал на скругление, оно меньше
      const cap = Math.min(SWISH_CAP, head);
      for (let i = 0; i < SWISH_PAIRS; i++) {
        // хвост: от конца к голове, ширина растёт к голове; скругление: дальше головы, ширина — по полуокружности
        const inCap = i > SWISH_SEG;
        const c = inCap ? (i - SWISH_SEG) / CAP_SEG : 0;
        const s = inCap ? head + cap * c : tail + ((head - tail) * i) / SWISH_SEG;
        const near = inCap ? 1 : Math.max(0, 1 - (head - s) / SWISH_TAIL);
        const w = inCap ? SWISH_W * Math.sqrt(Math.max(0, 1 - c * c)) : SWISH_W0 + (SWISH_W - SWISH_W0) * near * near;
        const ang = from + Math.sign(turn) * (s - cap);
        const sn = Math.sin(ang);
        const cs = Math.cos(ang);
        sw.pos.setXYZ(i * 2, tb.x + sn * (SWISH_R - w), y, tb.z + cs * (SWISH_R - w));
        sw.pos.setXYZ(i * 2 + 1, tb.x + sn * SWISH_R, y, tb.z + cs * SWISH_R);
        sw.uvk.setXYZW(i * 2, near, 0, w, alpha);
        sw.uvk.setXYZW(i * 2 + 1, near, 1, 0, alpha);
      }
      sw.pos.needsUpdate = true;
      sw.uvk.needsUpdate = true;
      sw.mesh.geometry.setDrawRange(0, Infinity);
    }
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
    tb.mark.visible = !!g && !g.over;
    if (v && g) {
      const va = this.viewAngle(tb);
      const chairOf = (p: number): number => v.seats.findIndex((s) => s.p === p);
      if (tb.mark.visible) this.placeMark(tb, va, suitOf(g.trump));

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
        drawDeckCount(tb.count, g.deck, suitOf(g.trump));
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

  /** Значок козырной масти: на клеёнке у колоды, повёрнут к смотрящему (верх значка — от него). */
  private placeMark(tb: Table, va: number, suit: number): void {
    if (tb.markSuit !== suit) {
      tb.markSuit = suit;
      (tb.mark.material as THREE.MeshBasicMaterial).map = suitMarkTexture(suit);
    }
    this.local(tb, va, MARK_U, MARK_W, MARK_Y, tb.mark.position);
    flatQ(va, tb.mark.quaternion);
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

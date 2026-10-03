// Стол блэкджека в 3D: сукно с надписью, башмак и лоток фишек, крупье-желейка с бабочкой, карты, которые вылетают из
// башмака и переворачиваются, фишки ставок и выплат, суммы очков над руками и плавающая табличка над столом.
// Рендер получает только публичный вид стола (BlackjackView): закрытая карта дилера для него — рубашка (−1).
// Сервер об анимации ничего не знает: очередь `cursor` лишь растягивает показ — карты летят по одной, рубашка дилера
// открывается с паузой, фишки съезжают после раздачи. Кнопки панели ждут `busyUntil`, пока карты в воздухе.
import * as THREE from 'three';
import { BJ_MAX_BET, BJ_TABLE, handValue, type BlackjackSeatView, type BlackjackView } from '../../shared/blackjack.ts';
import { E_ALIVE, E_GROUNDED } from '../../shared/protocol.ts';
import type { Sound } from '../audio.ts';
import { Avatar, type AvatarPose } from '../render/avatar.ts';
import { BJ_ATLAS, bjAtlasTexture } from './bjcards.ts';
import { BJ_DENOMS, chipsFor } from './bjbet.ts';
import { BET_R, CHIP_H, FELT_Y, HAND_R, buildDressing, chipGeometry, chipMaterials, type Dressing } from './bjtable.ts';
import { TableSign, type SignModel } from './tablesign.ts';
import type { LobbyWorld } from './world.ts';

const D2R = Math.PI / 180;
const CARD_W = 0.105;
const CARD_H = 0.148;
/** Масштаб карт игроков и дилера (геометрия 10,5 × 14,8 см) */
const CARD_S = 0.96;
const DEALER_S = 1.02;
const CARD_Y = FELT_Y + 0.004;
const MAX_CARDS = 200;
const MAX_CHIPS = 200;
/** Полёт карты из башмака, переезд на новое место, уход со стола, переворот — секунды */
const FLY_S = 0.36;
const MOVE_S = 0.26;
const LEAVE_S = 0.34;
const FLIP_S = 0.4;
/** Промежутки в очереди раздачи: между картами и между фишками; пауза после тасовки */
const CARD_GAP = 0.15;
const CHIP_GAP = 0.075;
const DEAL_LEAD = 0.45;
/** Закрытая карта дилера открывается не сразу — интрига */
const REVEAL_PAUSE = 0.8;
/** Куда повёрнут стол, когда не сидишь: к площади (на запад) */
const DEFAULT_YAW = 270 * D2R;
const SIGN_Y = 1.62;
/** Крупье стоит за пультом на северной стороне, лицом к столу */
const DEALER_R = 1.5;
/** Подписи рук висят над картами: не закрывают их и не лежат на надписях сукна */
const LABEL_LIFT = 0.13;
/** Край стола у места игрока: отсюда фишки приезжают на круг ставки и сюда уходят, когда выигрыш забрали */
const EDGE_R = 0.95;
/** Стадии итога раунда (с): проигранные ставки в лоток, выплата, остальное — игрокам (пауза итога на сервере — 6 с) */
const STAGE_AT = [0.5, 1.2, 3.2];

type Tone = 'plain' | 'turn' | 'bust' | 'win' | 'gold' | 'push' | 'loss';

const TONES: Record<Tone, { bg: string; edge: string; fg: string }> = {
  plain: { bg: 'rgba(18,46,38,0.9)', edge: '#d8c690', fg: '#fff7e0' },
  turn: { bg: '#f6cf6a', edge: '#fff4cf', fg: '#3b2705' },
  bust: { bg: '#b8343a', edge: '#ffd9d6', fg: '#ffffff' },
  win: { bg: '#3da35d', edge: '#d9f7e2', fg: '#ffffff' },
  gold: { bg: '#e9b73c', edge: '#fff2c2', fg: '#3a2603' },
  push: { bg: '#6f8793', edge: '#e1edf2', fg: '#ffffff' },
  loss: { bg: '#5a3a3d', edge: '#e6c9c4', fg: '#ffe9e4' },
};

/** Подпись над рукой: пилюля с суммой очков и пометкой («перебор», «ход», «+20»). Перерисовывается только при смене текста. */
class HandLabel {
  readonly sprite: THREE.Sprite;
  used = false;
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly tex: THREE.CanvasTexture;
  /** Что нарисовано сейчас, что просили последним, и что ждёт, пока карты долетят */
  private key = '';
  private wanted = '';
  private queued: { at: number; big: string; sub: string; tone: Tone; result: boolean } | null = null;
  /** Нарисовано в фазе итога раунда («ПОБЕДА», «ПЕРЕБОР», …): это не переходит в следующую раздачу */
  private final = false;

  constructor() {
    this.canvas.width = 256;
    this.canvas.height = 112;
    this.ctx = this.canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false, fog: false }));
    this.sprite.scale.set(0.2, 0.2 * (112 / 256), 1);
    this.sprite.renderOrder = 7;
    this.sprite.visible = false;
  }

  size(width: number): void {
    this.sprite.scale.set(width, width * (112 / 256), 1);
  }

  /**
   * Текст подписи: новый появляется в момент `at` (когда долетела последняя карта руки), а не сразу.
   * `result` — это итог раунда: пока он не нарисован, старый итог не висит над новыми картами.
   */
  set(big: string, sub: string, tone: Tone, at: number, now: number, result = false): void {
    const key = `${big}|${sub}|${tone}`;
    if (key === this.wanted) return;
    // итог прошлого раунда не переживает раздачу: рука началась заново — подпись пустая, пока не долетят карты
    if (this.final && !result) this.clear();
    this.wanted = key;
    if (at > now) {
      this.queued = { at, big, sub, tone, result };
      return;
    }
    this.queued = null;
    this.draw(big, sub, tone, result);
  }

  /** Убрать нарисованное: подпись скрыта, пока не придёт новый текст. */
  clear(): void {
    this.key = '';
    this.wanted = '';
    this.queued = null;
    this.final = false;
  }

  tick(now: number): void {
    if (!this.queued || now < this.queued.at) return;
    const q = this.queued;
    this.queued = null;
    this.draw(q.big, q.sub, q.tone, q.result);
  }

  /** Есть что показывать (первый текст уже нарисован) */
  get ready(): boolean {
    return this.key !== '';
  }

  private draw(big: string, sub: string, tone: Tone, result: boolean): void {
    this.final = result;
    const key = `${big}|${sub}|${tone}`;
    if (key === this.key) return;
    this.key = key;
    const g = this.ctx;
    const t = TONES[tone];
    g.clearRect(0, 0, 256, 112);
    g.shadowColor = 'rgba(0,0,0,0.4)';
    g.shadowBlur = 8;
    g.shadowOffsetY = 3;
    g.fillStyle = t.bg;
    g.beginPath();
    g.roundRect(8, 6, 240, 92, 34);
    g.fill();
    g.shadowColor = 'transparent';
    g.lineWidth = 4;
    g.strokeStyle = t.edge;
    g.stroke();
    g.fillStyle = t.fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const fit = (text: string, size: number, maxW: number, weight: number): void => {
      g.font = `${weight} ${size}px Rubik, system-ui, sans-serif`;
      const w = g.measureText(text).width;
      if (w > maxW) g.font = `${weight} ${Math.floor((size * maxW) / w)}px Rubik, system-ui, sans-serif`;
    };
    if (sub) {
      fit(big, 54, 210, 900);
      g.fillText(big, 128, 40);
      fit(sub, 26, 210, 700);
      g.fillText(sub, 128, 76);
    } else {
      fit(big, 62, 210, 900);
      g.fillText(big, 128, 54);
    }
    this.tex.needsUpdate = true;
  }

  dispose(): void {
    this.sprite.removeFromParent();
    this.sprite.material.dispose();
    this.tex.dispose();
  }
}

interface Pose {
  p: THREE.Vector3;
  q: THREE.Quaternion;
  s: number;
}

/** Карта или фишка: ключ в таблице, поза сейчас, полёт из p0 в p1 (с дугой), переворот карты. */
interface Ent {
  card: boolean;
  /** Фишка: номинал (0 — «бесплатно») */
  den: number;
  /** Карта: что показано сейчас и что должно быть в конце переворота */
  cell: number;
  face: number;
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
  /** Переворот: начало (−1 — нет), длительность, с какой ячейки на какую */
  fT0: number;
  fDur: number;
  fFrom: number;
  fTo: number;
  dying: boolean;
  /** Ждёт своей очереди в башмаке: пока не вылетела — не рисуем */
  hidden: boolean;
  mark: number;
  /** Сколько клацаний фишек сыграть, когда доедет (0 — тишина) */
  clacks: number;
  heard: boolean;
}

interface Spawn {
  e: Ent;
  to: Pose;
  order: number;
  /** Куда ложится: карта (flip в полёте) или фишка */
  clacks: number;
}

const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _m = new THREE.Matrix4();
const _sc = new THREE.Vector3();
const _pose: Pose = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: 1 };
const _from = new THREE.Vector3();

/** Карта плашмя лицом вверх; верх карты смотрит в сторону (−sin yaw, −cos yaw); roll — небрежный поворот в плоскости. */
function flatQ(yaw: number, roll: number, out: THREE.Quaternion): THREE.Quaternion {
  return out.setFromEuler(_e.set(-Math.PI / 2, yaw, roll, 'YXZ'));
}

/** Ровный «шум» по строке: тот же ключ — то же число, без Math.random (иначе стопки дёргались бы при каждой раскладке). */
function hash01(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10007) / 10007;
}

function newEnt(card: boolean, den: number, cell: number): Ent {
  return {
    card, den, cell, face: cell,
    p: new THREE.Vector3(), q: new THREE.Quaternion(), s: 1,
    p0: new THREE.Vector3(), q0: new THREE.Quaternion(), s0: 1,
    p1: new THREE.Vector3(), q1: new THREE.Quaternion(), s1: 1,
    t0: 0, dur: 0, arc: 0, fT0: -1, fDur: FLIP_S, fFrom: cell, fTo: cell,
    dying: false, hidden: false, mark: 0, clacks: 0, heard: true,
  };
}

/** Что написать на табличке над столом. */
export function blackjackSignModel(v: BlackjackView | null): SignModel {
  const seated = v ? v.seats.filter((s) => s.k !== 0).length : 0;
  let state: string;
  let tone: SignModel['tone'];
  if (!v || (v.phase === 'betting' && seated === 0)) {
    state = 'свободно';
    tone = 'free';
  } else if (v.phase === 'betting') {
    state = 'ставки открыты';
    tone = 'wait';
  } else if (v.phase === 'countdown') {
    state = 'сейчас раздача';
    tone = 'wait';
  } else if (v.phase === 'result') {
    state = 'итоги раунда';
    tone = 'busy';
  } else {
    state = 'идёт игра';
    tone = 'busy';
  }
  return { title: 'BLACKJACK', sub: 'выплата 3:2 · шесть колод', stake: `🪙 ставка 1–${BJ_MAX_BET} или бесплатно`, seated, seats: 6, state, tone };
}

export class BlackjackTable3D {
  private readonly world: LobbyWorld;
  private readonly sound: Sound;
  private readonly group = new THREE.Group();
  private readonly dress: Dressing;
  private readonly cards: THREE.InstancedMesh;
  private readonly cells: THREE.InstancedBufferAttribute;
  private readonly cardTex = bjAtlasTexture();
  private readonly chipMeshes = new Map<number, THREE.InstancedMesh>();
  private readonly ents = new Map<string, Ent>();
  private readonly labels = new Map<string, HandLabel>();
  private readonly ring: THREE.Mesh;
  private readonly ringMat: THREE.MeshBasicMaterial;
  private readonly sign = new TableSign('blackjack', 0.7);
  private readonly dealer: Avatar;
  private readonly dealerPose: AvatarPose;
  private readonly pos: [number, number, number];
  private readonly timers: Array<{ at: number; fn: () => void }> = [];
  private readonly spawns: Spawn[] = [];
  private readonly exitHints = new Map<string, 'tray' | 'edge'>();
  private current: BlackjackView | null = null;
  private chair = -1;
  private now = 0;
  /** Очередь анимаций: следующая может начаться не раньше этого момента */
  private cursor = 0;
  private markN = 0;
  private layoutKey = '';
  /** Показали первый вид после сброса: до него всё ложится на место сразу, без полётов */
  private synced = false;
  private stage = 0;
  private prevPhase: BlackjackView['phase'] | null = null;
  private dirty = false;
  private signSeated = false;
  /** Кольцо под рукой, чей ход: нужно ли и с какого момента (когда долетели её карты) */
  private ringWant = false;
  private ringAt = 0;

  constructor(world: LobbyWorld, sound: Sound, x = 18, z = 11) {
    this.world = world;
    this.sound = sound;
    this.pos = [x, 0.95, z];
    this.group.position.set(x, 0, z);
    this.dress = buildDressing();
    this.group.add(this.dress.group);

    const geometry = new THREE.PlaneGeometry(CARD_W, CARD_H);
    this.cells = new THREE.InstancedBufferAttribute(new Float32Array(MAX_CARDS), 1);
    this.cells.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aCard', this.cells);
    const A = BJ_ATLAS;
    const f = (n: number): string => n.toFixed(1);
    const material = new THREE.MeshStandardMaterial({
      map: this.cardTex, emissive: 0xffffff, emissiveMap: this.cardTex, emissiveIntensity: 0.22, roughness: 0.6, side: THREE.DoubleSide, alphaTest: 0.5,
    });
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = `attribute float aCard;\n${shader.vertexShader}`.replace(
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
    material.customProgramCacheKey = () => 'blackjack-cards-52-v2';
    this.cards = new THREE.InstancedMesh(geometry, material, MAX_CARDS);
    this.cards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.cards.frustumCulled = false;
    this.cards.count = 0;
    this.cards.receiveShadow = true;
    this.group.add(this.cards);

    for (const den of [0, ...BJ_DENOMS]) {
      const mesh = new THREE.InstancedMesh(chipGeometry(), chipMaterials(den), den === 0 ? 24 : MAX_CHIPS);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.chipMeshes.set(den, mesh);
      this.group.add(mesh);
    }

    // кольцо под рукой, чей сейчас ход
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xffd45a, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.075, 0.088, 40), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = FELT_Y + 0.003;
    this.ring.visible = false;
    this.group.add(this.ring);

    this.sign.place(0, SIGN_Y, 0);
    this.sign.set(blackjackSignModel(null));
    this.group.add(this.sign.sprite);
    world.scene.add(this.group);

    // крупье: молочная желейка в цилиндре и с бабочкой, за пультом лицом к столу
    this.dealer = new Avatar(990, { gun: false, voice: false });
    this.dealer.setOutfit({ c: 15, c2: 3, p: 'none', e: 'happy', h: 'tophat', a: 'bowtie' });
    this.dealer.setInfo('Крупье', null, false);
    this.dealer.addTo(world.scene);
    this.dealerPose = { x: x, y: 0, z: z - DEALER_R, yaw: Math.PI, pitch: 0, flags: E_ALIVE | E_GROUNDED };
    this.layout();
  }

  // ------------------------------------------------------------ снаружи

  /** Своё место (стол и стул 0…5); не за этим столом — (−1, −1). */
  setMe(table: number, chair: number): void {
    const next = table === BJ_TABLE ? chair : -1;
    if (next === this.chair) return;
    this.chair = next;
    this.layoutKey = '';
    this.layout();
  }

  /** Новый вид стола с сервера (старый по версии игнорируем). */
  setView(view: BlackjackView): void {
    if (view.table !== BJ_TABLE || (this.current && view.rev < this.current.rev)) return;
    const prev = this.current;
    this.current = view;
    if (view.phase === 'result' && prev?.phase !== 'result') this.startResult(prev !== null);
    if (view.phase !== 'result' && this.stage !== 0) this.stage = 0;
    this.prevPhase = prev?.phase ?? null;
    this.sign.set(blackjackSignModel(view));
    this.layout();
  }

  view(): BlackjackView | null {
    return this.current;
  }

  /** performance.now()-время, до которого карты и фишки ещё в воздухе: кнопки панели ждут его. */
  get busyUntil(): number {
    return performance.now() + Math.max(0, this.cursor - this.now) * 1000;
  }

  reset(): void {
    this.current = null;
    this.chair = -1;
    this.synced = false;
    this.stage = 0;
    this.prevPhase = null;
    this.timers.length = 0;
    this.spawns.length = 0;
    this.cursor = this.now;
    this.ents.clear();
    this.layoutKey = '';
    this.sign.set(blackjackSignModel(null));
    this.layout();
    this.flush();
  }

  dispose(): void {
    this.group.removeFromParent();
    this.dress.dispose();
    this.cards.geometry.dispose();
    (this.cards.material as THREE.Material).dispose();
    this.cardTex.dispose();
    this.ringMat.dispose();
    this.ring.geometry.dispose();
    for (const l of this.labels.values()) l.dispose();
    this.labels.clear();
    this.sign.dispose();
    this.dealer.dispose(this.world.scene);
  }

  debug(): Record<string, unknown> {
    return { ents: this.ents.size, cursor: +(this.cursor - this.now).toFixed(2), stage: this.stage, labels: this.labels.size };
  }

  // ------------------------------------------------------------ кадр

  update(dt: number, time: number, camPos: THREE.Vector3): void {
    this.now += dt;
    if (this.timers.length) {
      const due = this.timers.filter((t) => t.at <= this.now);
      if (due.length) {
        this.timers.splice(0, this.timers.length, ...this.timers.filter((t) => t.at > this.now));
        for (const t of due) t.fn();
      }
    }
    if (this.dirty) {
      this.dirty = false;
      this.layoutKey = '';
      this.layout();
    }
    for (const l of this.labels.values()) {
      l.tick(this.now);
      l.sprite.visible = l.used && l.ready;
    }
    this.ring.visible = this.ringWant && this.now >= this.ringAt;
    this.flush();
    this.sign.sprite.visible = !this.signSeated;
    this.sign.update(time, camPos);
    this.ringMat.opacity = 0.55 + Math.sin(time * 5) * 0.3;
    // крупье стоит между двумя стульями: тем, кто сидит рядом, он заслонил бы стол, — для них он «отходит»
    this.dealer.hidden = Math.hypot(camPos.x - this.dealerPose.x, camPos.z - this.dealerPose.z) < 1.5;
    this.dealer.update(this.dealerPose, dt, time, this.world.collision, camPos, false);
  }

  /** Продвинуть все карты и фишки и записать в инстансы. */
  private flush(): void {
    let nCards = 0;
    const nChips = new Map<number, number>([[0, 0], [10, 0], [20, 0], [50, 0]]);
    for (const [key, e] of this.ents) {
      if (this.now >= e.t0) {
        if (e.hidden) e.hidden = false;
        const k = e.dur > 0 ? Math.min(1, (this.now - e.t0) / e.dur) : 1;
        const ease = 1 - (1 - k) ** 3;
        e.p.lerpVectors(e.p0, e.p1, ease);
        e.p.y += e.arc * Math.sin(Math.PI * k);
        e.q.slerpQuaternions(e.q0, e.q1, ease);
        e.s = e.s0 + (e.s1 - e.s0) * ease;
        if (k >= 1 && !e.heard) {
          e.heard = true;
          if (e.card) this.sound.card(this.pos);
          else if (e.clacks > 0) this.sound.chipStack(this.pos, e.clacks);
        }
        if (k >= 1 && e.dying) {
          this.ents.delete(key);
          continue;
        }
      }
      if (e.hidden) continue;
      let sx = 1;
      let lift = 0;
      if (e.card && e.fT0 >= 0 && this.now >= e.fT0) {
        const fk = Math.min(1, (this.now - e.fT0) / e.fDur);
        e.cell = fk < 0.5 ? e.fFrom : e.fTo;
        sx = Math.max(0.04, Math.abs(Math.cos(Math.PI * fk)));
        lift = Math.sin(Math.PI * fk) * 0.03;
        if (fk >= 1) {
          e.fT0 = -1;
          e.cell = e.fTo;
        }
      }
      if (e.s <= 0.001) continue;
      if (e.card) {
        if (nCards >= MAX_CARDS) continue;
        _m.compose(_from.copy(e.p).setY(e.p.y + lift), e.q, _sc.set(e.s * sx, e.s, 1));
        this.cards.setMatrixAt(nCards, _m);
        this.cells.setX(nCards, e.cell < 0 ? BJ_ATLAS.back : e.cell);
        nCards++;
      } else {
        const mesh = this.chipMeshes.get(e.den);
        const n = nChips.get(e.den) ?? 0;
        if (!mesh || n >= (e.den === 0 ? 24 : MAX_CHIPS)) continue;
        _m.compose(e.p, e.q, _sc.setScalar(e.s));
        mesh.setMatrixAt(n, _m);
        nChips.set(e.den, n + 1);
      }
    }
    // стопки фишек в лотке крупье стоят на месте
    for (const st of this.dress.trayStacks) {
      const mesh = this.chipMeshes.get(st.den)!;
      for (let i = 0; i < st.n; i++) {
        const n = nChips.get(st.den) ?? 0;
        if (n >= MAX_CHIPS) break;
        _pose.q.setFromEuler(_e.set(0, hash01(`tray${st.den}.${i}`) * 6.28, 0));
        _m.compose(_from.set(st.x, st.y + i * CHIP_H, st.z), _pose.q, _sc.setScalar(1));
        mesh.setMatrixAt(n, _m);
        nChips.set(st.den, n + 1);
      }
    }
    this.cards.count = nCards;
    this.cards.instanceMatrix.needsUpdate = true;
    this.cells.needsUpdate = true;
    for (const [den, mesh] of this.chipMeshes) {
      mesh.count = nChips.get(den) ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  // ------------------------------------------------------------ очередь и звуки

  private later(delay: number, fn: () => void): void {
    this.timers.push({ at: this.now + Math.max(0, delay), fn });
  }

  /** Начало следующей анимации в очереди; gap — сколько занимает эта. */
  private startAt(gap: number): number {
    const t = Math.max(this.now, this.cursor);
    this.cursor = t + gap;
    return t;
  }

  /** Итог раунда: проигранные ставки уезжают в лоток, потом выплата, потом выигрыш забирают; свой звук итога. */
  private startResult(live: boolean): void {
    this.stage = live ? 0 : 3;
    if (!live) return;
    STAGE_AT.forEach((at, i) => {
      this.later(at + Math.max(0, this.cursor - this.now), () => {
        if (this.current?.phase !== 'result') return;
        this.stage = i + 1;
        this.dirty = true;
      });
    });
    // свой звук итога и реакция крупье
    const mine = this.chair >= 0 ? this.current?.seats[this.chair] : undefined;
    const hands = mine?.hands ?? [];
    const v = this.current;
    this.later(0.35 + Math.max(0, this.cursor - this.now), () => {
      if (v && v.dealerTotal !== null && v.dealerTotal > 21) this.dealer.react(2);
      if (!hands.length) return;
      const net = hands.reduce((s, h) => s + h.payout - h.bet, 0);
      const bj = hands.some((h) => h.result === 'blackjack');
      const win = hands.some((h) => h.result === 'win' || h.result === 'blackjack');
      if (bj) this.sound.tableWin(true);
      else if (win && net >= 0) this.sound.tableWin(false);
      else if (net < 0) this.sound.tableLose();
      else this.sound.tablePush();
      if (bj) this.dealer.react(1);
    });
  }

  // ------------------------------------------------------------ раскладка

  private viewYaw(): number {
    return this.chair >= 0 ? (this.chair * 60 + 30) * D2R : DEFAULT_YAW;
  }

  /** Точка в системе зрителя: u — вправо, w — вдаль от него. */
  private local(va: number, u: number, w: number, y: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(u * Math.cos(va) - w * Math.sin(va), y, -u * Math.sin(va) - w * Math.cos(va));
  }

  private mouth(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.dress.mouth);
  }

  private fly(e: Ent, to: Pose, dur: number, arc: number, t0: number): void {
    e.p0.copy(e.p);
    e.q0.copy(e.q);
    e.s0 = e.s;
    e.p1.copy(to.p);
    e.q1.copy(to.q);
    e.s1 = to.s;
    e.t0 = t0;
    e.dur = dur;
    e.arc = arc;
  }

  private differs(e: Ent, to: Pose): boolean {
    return e.p1.distanceToSquared(to.p) > 1e-8 || e.q1.angleTo(to.q) > 1e-4 || Math.abs(e.s1 - to.s) > 1e-4;
  }

  /** Положить карту: новая вылетает из башмака (в очередь), старая переезжает, рубашка дилера открывается с паузой. */
  private putCard(key: string, value: number, to: Pose, mark: number, order: number, snap: boolean): void {
    const cell = value < 0 ? BJ_ATLAS.back : value;
    let e = this.ents.get(key);
    if (!e) {
      e = newEnt(true, 0, cell);
      this.ents.set(key, e);
      if (snap) {
        e.p.copy(to.p);
        e.q.copy(to.q);
        e.s = to.s;
        this.fly(e, to, 0, 0, this.now);
      } else {
        e.cell = BJ_ATLAS.back;
        e.hidden = true;
        e.heard = false;
        e.p.copy(this.mouth(_from));
        flatQ(0, 0, e.q);
        e.s = to.s * 0.7;
        this.spawns.push({ e, to: { p: to.p.clone(), q: to.q.clone(), s: to.s }, order, clacks: 0 });
      }
    } else {
      if (e.face !== cell) {
        e.face = cell;
        if (e.cell === BJ_ATLAS.back && cell !== BJ_ATLAS.back) {
          // закрытая карта дилера: пауза, потом переворот
          const t = Math.max(this.now + REVEAL_PAUSE, this.cursor);
          this.cursor = t + FLIP_S + 0.15;
          e.fFrom = BJ_ATLAS.back;
          e.fTo = cell;
          e.fT0 = t;
          e.fDur = FLIP_S;
          this.later(t - this.now, () => {
            this.sound.flip(this.pos);
          });
          if (!this.timers.some((tm) => tm.fn === this.thinking)) this.later(Math.max(0, t - this.now - 0.4), this.thinking);
        } else {
          e.cell = cell;
        }
      }
      if (e.dying) {
        e.dying = false;
        e.heard = true;
      }
      if (this.differs(e, to)) this.fly(e, to, MOVE_S, 0.015, this.now);
    }
    e.mark = mark;
  }

  private readonly thinking = (): void => {
    this.dealer.react(3);
  };

  /** Положить фишку на место; новая приезжает с края стола (от игрока) или из лотка (выплата). */
  private putChip(key: string, den: number, to: Pose, mark: number, order: number, snap: boolean, source: 'edge' | 'tray', edge: THREE.Vector3, clacks: number): void {
    let e = this.ents.get(key);
    if (!e) {
      e = newEnt(false, den, 0);
      this.ents.set(key, e);
      if (snap) {
        e.p.copy(to.p);
        e.q.copy(to.q);
        e.s = to.s;
        this.fly(e, to, 0, 0, this.now);
      } else {
        e.hidden = true;
        e.heard = false;
        e.p.copy(source === 'tray' ? this.dress.tray : edge);
        e.q.copy(to.q);
        e.s = 0.6;
        this.spawns.push({ e, to: { p: to.p.clone(), q: to.q.clone(), s: to.s }, order, clacks });
      }
    } else {
      if (e.dying) {
        e.dying = false;
        e.heard = true;
      }
      if (this.differs(e, to)) this.fly(e, to, MOVE_S, 0.02, this.now);
    }
    e.mark = mark;
  }

  private label(key: string): HandLabel {
    let l = this.labels.get(key);
    if (!l) {
      l = new HandLabel();
      this.group.add(l.sprite);
      this.labels.set(key, l);
    }
    l.used = true;
    return l;
  }

  private layout(): void {
    const v = this.current;
    const key = JSON.stringify([this.chair, this.stage, v && { ...v, left: 0 }]);
    if (key === this.layoutKey) return;
    this.layoutKey = key;
    const mark = ++this.markN;
    const snap = !this.synced;
    this.synced = true;
    const va = this.viewYaw();
    this.dress.felt.rotation.y = va;
    this.spawns.length = 0;
    this.exitHints.clear();
    for (const l of this.labels.values()) l.used = false;
    this.signSeated = this.chair >= 0;
    this.ringWant = false;
    const phase = v?.phase ?? 'betting';
    /** Подписи рук получают текст после того, как долетят карты руки (очередь вылетов известна только в конце раскладки) */
    const jobs: Array<{ l: HandLabel; big: string; sub: string; tone: Tone; keys: string[]; result: boolean }> = [];
    let ringKeys: string[] = [];

    // карты дилера: ряд по центру, верх карт — от зрителя
    const dealerCards = v?.dealer ?? [];
    const dn = dealerCards.length;
    const dstep = dn > 1 ? Math.min(0.068, 0.3 / (dn - 1)) : 0;
    dealerCards.forEach((card, i) => {
      this.local(va, (i - (dn - 1) / 2) * dstep, 0.012, CARD_Y + i * 0.0012, _pose.p);
      flatQ(va, (hash01(`D${i}`) - 0.5) * 0.06, _pose.q);
      _pose.s = DEALER_S;
      this.putCard(`D${i}`, card, _pose, mark, i * 100 + 50, snap);
    });
    if (dn) {
      const total = v!.dealerTotal;
      const up = handValue([dealerCards[0]]).total;
      const big = total === null ? String(up) : String(total);
      let sub = 'дилер';
      let tone: Tone = phase === 'dealer' ? 'turn' : 'plain';
      if (total !== null && total > 21) {
        sub = 'перебор';
        tone = 'bust';
      } else if (total === 21 && dn === 2) {
        sub = 'блэкджек';
        tone = 'gold';
      }
      const l = this.label('D');
      l.size(0.25);
      this.local(va, 0, 0.012, CARD_Y + LABEL_LIFT + 0.01, l.sprite.position);
      jobs.push({ l, big, sub, tone, keys: dealerCards.map((_c, i) => `D${i}`), result: phase === 'result' });
    }

    // места: руки, фишки ставок, подписи
    v?.seats.forEach((seat, c) => {
      const a = (c * 60 + 30) * D2R;
      const sx = Math.sin(a);
      const sz = Math.cos(a);
      const tx = Math.cos(a);
      const tz = -Math.sin(a);
      const edge = _from.set(sx * EDGE_R, FELT_Y + 0.1, sz * EDGE_R).clone();
      const split = seat.hands.length > 1;
      // фишки: до раздачи — общая ставка места, потом — по рукам
      const stacks: Array<{ h: number; amount: number; off: number }> = [];
      if (seat.hands.length) seat.hands.forEach((hand, h) => stacks.push({ h, amount: hand.bet, off: split ? (h === 0 ? -0.058 : 0.058) : 0 }));
      else if (seat.participating) stacks.push({ h: 0, amount: seat.bet, off: 0 });
      stacks.forEach(({ h, amount, off }) => {
        const hand = seat.hands[h];
        const lost = phase === 'result' && hand?.result === 'loss';
        const chips = amount > 0 ? chipsFor(amount) : [0];
        const sweepTray = lost && this.stage >= 1;
        const sweepEdge = phase === 'result' && !lost && hand?.result && this.stage >= 3;
        chips.forEach((den, i) => {
          const ck = `C${c}.${h}.${i}.${den}`;
          if (sweepTray || sweepEdge) {
            this.exitHints.set(ck, sweepTray ? 'tray' : 'edge');
            return;
          }
          _pose.p.set(sx * BET_R + tx * off, FELT_Y + CHIP_H * (0.5 + i), sz * BET_R + tz * off);
          _pose.q.setFromEuler(_e.set(0, hash01(ck) * 6.28, 0));
          _pose.s = 1;
          this.putChip(ck, den, _pose, mark, c * 10 + i, snap, 'edge', edge, i === 0 ? Math.min(3, chips.length) : 0);
        });
        // выплата: стопка из лотка рядом со ставкой
        if (hand && phase === 'result' && (hand.result === 'win' || hand.result === 'blackjack') && hand.bet > 0 && this.stage >= 2 && this.stage < 3) {
          const pile = chipsFor(Math.max(1, hand.payout - hand.bet));
          pile.forEach((den, i) => {
            const wk = `W${c}.${h}.${i}.${den}`;
            _pose.p.set(sx * BET_R + tx * (off + (split && h === 0 ? -0.056 : 0.056)), FELT_Y + CHIP_H * (0.5 + i), sz * BET_R + tz * (off + (split && h === 0 ? -0.056 : 0.056)));
            _pose.q.setFromEuler(_e.set(0, hash01(wk) * 6.28, 0));
            _pose.s = 1;
            this.putChip(wk, den, _pose, mark, 500 + c * 10 + i, snap, 'tray', edge, i === 0 ? Math.min(3, pile.length) : 0);
          });
        }
        if (hand && phase === 'result' && (hand.result === 'win' || hand.result === 'blackjack') && hand.bet > 0 && this.stage >= 3) {
          chipsFor(Math.max(1, hand.payout - hand.bet)).forEach((den, i) => this.exitHints.set(`W${c}.${h}.${i}.${den}`, 'edge'));
        }
      });

      // карты руки: веер вдоль касательной, верх — к центру стола
      seat.hands.forEach((hand, h) => {
        const n = hand.cards.length;
        const hOff = split ? (h === 0 ? -0.1 : 0.1) : 0;
        const step = n > 1 ? Math.min(split ? 0.046 : 0.06, (split ? 0.12 : 0.27) / (n - 1)) : 0;
        const seen = new Map<number, number>();
        const ownKeys: string[] = [];
        hand.cards.forEach((card, i) => {
          const nth = seen.get(card) ?? 0;
          seen.set(card, nth + 1);
          const ck = `S${c}:${card}:${nth}`;
          ownKeys.push(ck);
          const u = hOff + (i - (n - 1) / 2) * step;
          _pose.p.set(sx * HAND_R + tx * u, CARD_Y + i * 0.0012, sz * HAND_R + tz * u);
          flatQ(a, (hash01(ck) - 0.5) * 0.12, _pose.q);
          _pose.s = CARD_S;
          this.putCard(ck, card, _pose, mark, i * 100 + c, snap);
        });
        // подпись над рукой
        const active = phase === 'play' && v.turn === c && v.hand === h;
        const { big, sub, tone } = this.handText(hand, active, phase === 'result');
        const l = this.label(`S${c}.${h}`);
        l.size(split ? 0.17 : 0.22);
        l.sprite.position.set(sx * HAND_R + tx * hOff, CARD_Y + LABEL_LIFT, sz * HAND_R + tz * hOff);
        const keys = ownKeys;
        jobs.push({ l, big, sub, tone, keys, result: phase === 'result' });
        if (active) {
          this.ringWant = true;
          ringKeys = keys;
          this.ring.position.set(sx * HAND_R + tx * hOff, FELT_Y + 0.003, sz * HAND_R + tz * hOff);
        }
      });
    });

    // что не подтвердилось этим видом, уходит со стола: карты — в лоток, фишки — к игроку (или в лоток)
    for (const [k, e] of this.ents) {
      if (e.mark === mark || e.dying) continue;
      e.dying = true;
      e.heard = true;
      const toTray = e.card || this.exitHints.get(k) === 'tray';
      _pose.p.copy(toTray ? this.dress.tray : this.edgeOf(k));
      _pose.p.y += toTray ? 0.04 : 0.02;
      _pose.q.copy(e.q);
      _pose.s = 0;
      if (!e.hidden) this.fly(e, _pose, LEAVE_S, 0.04, this.now);
      else this.ents.delete(k);
      if (!e.card && toTray) {
        e.heard = false;
        e.clacks = 1;
      }
    }
    // очередь вылетов: раздача идёт по кругу — сначала первые карты всем, потом вторые
    if (this.spawns.length) {
      this.spawns.sort((x, y) => x.order - y.order);
      const cards = this.spawns.filter((s) => s.e.card).length;
      if (cards >= 3 && this.prevPhase !== 'play') {
        this.sound.shuffle(this.pos);
        this.cursor = Math.max(this.cursor, this.now) + DEAL_LEAD;
      }
      for (const sp of this.spawns) {
        const gap = sp.e.card ? CARD_GAP : CHIP_GAP;
        const t = this.startAt(gap);
        sp.e.hidden = true;
        this.fly(sp.e, sp.to, FLY_S, sp.e.card ? 0.07 : 0.05, t);
        sp.e.q0.copy(sp.e.q);
        if (sp.e.card) {
          sp.e.fT0 = sp.e.face !== BJ_ATLAS.back ? t + FLY_S * 0.36 : -1;
          sp.e.fFrom = BJ_ATLAS.back;
          sp.e.fTo = sp.e.face;
          sp.e.fDur = FLY_S * 0.5;
        } else {
          sp.e.clacks = sp.clacks;
        }
      }
      this.spawns.length = 0;
    }

    // тексты подписей и кольцо — когда долетят карты руки; итог раунда — ещё и после того, как дилер доиграл
    const landed = (keys: string[]): number => {
      let at = this.now;
      for (const k of keys) {
        const e = this.ents.get(k);
        if (!e || e.dying) continue;
        at = Math.max(at, e.t0 + e.dur, e.fT0 >= 0 ? e.fT0 + e.fDur : 0);
      }
      return at;
    };
    const settle = phase === 'result' && this.stage === 0 ? this.cursor + 0.25 : 0;
    for (const j of jobs) j.l.set(j.big, j.sub, j.tone, Math.max(landed(j.keys), phase === 'result' ? settle : 0), this.now, j.result);
    // рука ушла со стола: подпись стирается, а не ждёт следующей раздачи со старым текстом («Победа» над новыми картами)
    for (const l of this.labels.values()) if (!l.used) l.clear();
    this.ringAt = landed(ringKeys);
  }

  /** Куда уезжает фишка, когда её убрали со стола: к краю стола у места игрока (по номеру места в ключе). */
  private edgeOf(key: string): THREE.Vector3 {
    const c = Number(key.slice(1, 2));
    const a = (c * 60 + 30) * D2R;
    return _from.set(Math.sin(a) * EDGE_R, FELT_Y + 0.1, Math.cos(a) * EDGE_R);
  }

  /** Крупно и мелко на подписи руки. */
  private handText(hand: BlackjackSeatView['hands'][number], active: boolean, result: boolean): { big: string; sub: string; tone: Tone } {
    if (result && hand.result) {
      const net = hand.payout - hand.bet;
      const money = (n: number): string => (hand.bet > 0 ? (n >= 0 ? `+${n}` : `−${Math.abs(n)}`) : '');
      switch (hand.result) {
        case 'blackjack':
          return { big: 'БЛЭКДЖЕК', sub: money(net), tone: 'gold' };
        case 'win':
          return { big: 'ПОБЕДА', sub: money(net), tone: 'win' };
        case 'push':
          return { big: 'НИЧЬЯ', sub: hand.bet > 0 ? 'ставка вернулась' : '', tone: 'push' };
        default:
          return { big: hand.status === 'bust' ? 'ПЕРЕБОР' : 'ПРОИГРЫШ', sub: money(net), tone: hand.status === 'bust' ? 'bust' : 'loss' };
      }
    }
    const total = String(hand.total);
    if (hand.status === 'bust') return { big: total, sub: 'перебор', tone: 'bust' };
    if (hand.status === 'blackjack') return { big: '21', sub: 'блэкджек', tone: 'gold' };
    if (active) return { big: total, sub: hand.soft ? 'мягкая · ход' : 'ход', tone: 'turn' };
    return { big: total, sub: hand.soft ? 'мягкая' : hand.status === 'stood' ? 'хватит' : '', tone: 'plain' };
  }
}

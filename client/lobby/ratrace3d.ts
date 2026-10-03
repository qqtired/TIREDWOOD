// Крысиные бега в 3D (флаг RATRACE): понтон у набережной, арена с бортиком, овальная дорожка, газон с домиком и сыром,
// финишная арка, воротца старта, табло лицом к площади и шесть крыс в попонах с номерами. Забег у всех одинаковый:
// сервер шлёт сид и порядок на финише, план (shared/ratrace.ts ratPlan) проигрываем по серверному времени с поправкой
// на сеть. Между забегами крысы живут сами (у каждого игрока своя жизнь — это просто фон): спят, умываются, грызут сыр,
// бегают и гоняются друг за другом; перед стартом выстраиваются у воротец. Всё — простые меши, дёшево.
import * as THREE from 'three';
import { WATER_Y } from '../../shared/constants.ts';
import {
  RAT_BOARD, RAT_COUNT, RAT_DECK, RAT_GATE_MS, RAT_LAP, RAT_PEN, RAT_RUN_MS, RAT_TRACK, RATS, ratAt, ratPlan, ratStandings, ratTrackPoint, ratWon,
  type RatPlan, type RatRaceView,
} from '../../shared/ratrace.ts';
import { mergeColored, paint, place } from '../render/kit.ts';

type Mode = 'sleep' | 'groom' | 'sit' | 'wander' | 'chase' | 'flee' | 'eat' | 'line' | 'race' | 'win';

interface Rat {
  i: number;
  g: THREE.Group;
  /** Тело (кувырок, присел, свернулся) */
  body: THREE.Group;
  head: THREE.Group;
  tail: THREE.Group;
  paws: THREE.Object3D[];
  tag: THREE.Sprite;
  x: number;
  z: number;
  yaw: number;
  speed: number;
  gait: number;
  mode: Mode;
  until: number;
  tx: number;
  tz: number;
  prey: number;
  /** Кувырок (споткнулась): с какого мс забега */
  rollAt: number;
  /** Последний «пик» */
  squeakAt: number;
}

/** Забег у этого игрока: план, локальное время старта (performance.now) */
interface Race {
  race: number;
  plan: RatPlan;
  order: number[];
  start: number;
  /** Уже сообщили о старте / финише победителя / конце */
  started: boolean;
  won: boolean;
  ended: boolean;
  /** Происшествия, о которых уже пискнули */
  evDone: number;
}

const PEN_IN = { x0: RAT_PEN.x0 + 0.13, x1: RAT_PEN.x1 - 0.13, z0: RAT_PEN.z0 + 0.13, z1: RAT_PEN.z1 - 0.13 };
/** Домик, миска и сыр на газоне (в осях мира) */
const HOUSE = { x: RAT_TRACK.x - 0.75, z: RAT_TRACK.z, r: 0.3 };
const CHEESE = { x: RAT_TRACK.x + 0.55, z: RAT_TRACK.z + 0.12 };
const BOWL = { x: RAT_TRACK.x + 0.15, z: RAT_TRACK.z - 0.2 };
/** Где сидит кот-зритель: на северо-восточном угловом столбике бортика, и откуда он туда запрыгивает (с понтона) */
export const RAT_CAT_SEAT = { x: RAT_PEN.x1 + RAT_PEN.t / 2, y: RAT_PEN.h + 0.09, z: RAT_PEN.z0 - RAT_PEN.t / 2 };
export const RAT_CAT_APPROACH = [{ x: -4.85, z: 20.75 }, { x: -4.85, z: 22.35 }, { x: -4.3, z: 22.62 }] as const;
/** Сколько после конца забега висит итог на табло, мс */
export const RAT_RESULT_MS = 12_000;

const smooth = (v: number): number => {
  const x = Math.min(1, Math.max(0, v));
  return x * x * (3 - 2 * x);
};
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

function stadium(half: number, r: number, hole = 0): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(half, -r);
  s.lineTo(-half, -r);
  s.absarc(-half, 0, r, -Math.PI / 2, Math.PI / 2, true);
  s.lineTo(half, r);
  s.absarc(half, 0, r, Math.PI / 2, -Math.PI / 2, true);
  if (hole > 0) {
    const h = new THREE.Path();
    h.moveTo(half, -hole);
    h.absarc(half, 0, hole, -Math.PI / 2, Math.PI / 2, false);
    h.lineTo(-half, hole);
    h.absarc(-half, 0, hole, Math.PI / 2, -Math.PI / 2, false);
    h.lineTo(half, -hole);
    s.holes.push(h);
  }
  return s;
}

/** Плоская фигура на высоте y в центре трассы (форма в XY → пол XZ) */
function flat(shape: THREE.Shape, color: number, y: number): THREE.BufferGeometry {
  return place(paint(new THREE.ShapeGeometry(shape, 24).rotateX(-Math.PI / 2), color), RAT_TRACK.x, y, RAT_TRACK.z);
}

function numberTexture(n: number, color: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = color;
  g.beginPath(); g.arc(32, 32, 29, 0, Math.PI * 2); g.fill();
  g.lineWidth = 5; g.strokeStyle = '#fffaf0'; g.stroke();
  g.fillStyle = color === '#e8b923' ? '#2a2420' : '#ffffff';
  g.font = 'bold 40px Rubik, system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(n), 32, 35);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class RatRace3D {
  readonly group = new THREE.Group();
  /** Пискнула крыса (кувырок, крошка), открылись воротца, финишировал победитель */
  onSqueak: (x: number, y: number, z: number) => void = () => {};
  onGate: () => void = () => {};
  onWinner: (rat: number, x: number, z: number) => void = () => {};
  private readonly rats: Rat[] = [];
  private readonly gateArm: THREE.Group;
  private readonly sign: { ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture };
  private view: RatRaceView | null = null;
  private viewAt = 0;
  private latency = 0;
  private race: Race | null = null;
  /** Раунд, который уже проигран (повторное письмо о нём забег не перезапускает) */
  private playedRace = 0;
  /** Когда у этого игрока закончился последний забег (локальное время), для итога на табло */
  private endedAt = -1e9;
  private lastOrder: number[] | null = null;
  private endedRace = 0;
  private lastWinMult = 0;
  private signKey = '';
  private gateUp = 1;
  private cheerUntil = new Float64Array(RAT_COUNT);
  private time = 0;
  private readonly tp = { x: 0, z: 0, yaw: 0 };

  constructor(scene: THREE.Scene) {
    const g = this.group;
    g.name = 'rat-race';
    g.visible = false;
    const wood = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.02 });
    const parts: THREE.BufferGeometry[] = [];
    const box = (w: number, h: number, d: number, color: number, x: number, y: number, z: number, ry = 0): void => {
      parts.push(place(paint(new THREE.BoxGeometry(w, h, d), color), x, y, z, ry));
    };
    // --- понтон: настил из досок вдоль берега, рама под ним, сваи в воду
    const D = RAT_DECK;
    const dw = D.x1 - D.x0, cx = (D.x0 + D.x1) / 2;
    const tones = [0xb48a5c, 0xa77f53, 0xbd9464];
    let k = 0;
    for (let z = D.z0; z < D.z1 - 0.01; z += 0.2) box(dw, 0.06, 0.185, tones[k++ % 3], cx, -0.03, z + 0.1);
    box(dw - 0.1, 0.3, D.z1 - D.z0 - 0.1, 0x6d5136, cx, -0.21, (D.z0 + D.z1) / 2);
    for (const px of [D.x0 + 0.2, cx, D.x1 - 0.2]) for (const pz of [D.z0 + 1.6, D.z1 - 0.2]) {
      parts.push(place(paint(new THREE.CylinderGeometry(0.12, 0.13, 1.6, 10), 0x5a4330), px, WATER_Y + 0.3, pz));
    }
    // --- пол арены, дорожка, газон, белые бровки
    const P = RAT_PEN;
    box(P.x1 - P.x0, 0.01, P.z1 - P.z0, 0xcdb487, (P.x0 + P.x1) / 2, 0.005, (P.z0 + P.z1) / 2);
    const T = RAT_TRACK;
    const rin = T.r - T.w / 2, rout = T.r + T.w / 2;
    parts.push(flat(stadium(T.half, rout, rin), 0xd2aa72, 0.012));
    parts.push(flat(stadium(T.half, rin), 0x86b25a, 0.012));
    parts.push(flat(stadium(T.half, rout, rout - 0.03), 0xf6f1e4, 0.016));
    parts.push(flat(stadium(T.half, rin + 0.03, rin), 0xf6f1e4, 0.016));
    // --- бортик-заборчик: внизу белая доска с красной полосой, выше — просвет (крыс видно), поручень на столбиках;
    // твёрдый он на всю высоту h (выше шага), рисуем лёгким. Угловые столбики с шапочками
    const t = P.t, h = P.h;
    const W = P.x1 - P.x0 + 2 * t, Dz = P.z1 - P.z0 + 2 * t;
    const low = 0.26;
    for (const [w, d, x, z] of [[W, t, (P.x0 + P.x1) / 2, P.z0 - t / 2], [W, t, (P.x0 + P.x1) / 2, P.z1 + t / 2], [t, Dz, P.x0 - t / 2, (P.z0 + P.z1) / 2], [t, Dz, P.x1 + t / 2, (P.z0 + P.z1) / 2]] as const) {
      box(w, low, d, 0xf2ece0, x, low / 2, z);
      box(w - 0.02, 0.035, d + 0.01, 0xd85c48, x, low * 0.55, z);
      box(w + 0.02, 0.05, d + 0.03, 0xb07a4a, x, h - 0.025, z);
      // столбики через ~0,7 м
      const len = Math.max(w, d), n = Math.round(len / 0.7);
      for (let i = 1; i < n; i++) {
        const k = i / n - 0.5;
        box(0.045, h - low, 0.045, 0xe9e2d2, x + (w > d ? k * w : 0), low + (h - low) / 2, z + (w > d ? 0 : k * d));
      }
    }
    for (const x of [P.x0 - t / 2, P.x1 + t / 2]) for (const z of [P.z0 - t / 2, P.z1 + t / 2]) {
      box(0.13, h + 0.06, 0.13, 0x9a6a40, x, (h + 0.06) / 2, z);
      box(0.17, 0.03, 0.17, 0x7a5232, x, h + 0.075, z);
    }
    // --- финишная клетка поперёк передней прямой и арка «ФИНИШ»
    const fz0 = T.z - T.r - T.w / 2;
    for (let i = 0; i < 9; i++) for (let j = 0; j < 2; j++) {
      box(0.06, 0.004, T.w / 9, (i + j) % 2 ? 0x24242a : 0xf8f6f0, T.x - 0.03 + j * 0.06 - 0.03, 0.019, fz0 + (i + 0.5) * (T.w / 9));
    }
    // финишный столб — с внешней (северной) стороны линии, табличка смотрит на площадь
    box(0.05, 0.78, 0.05, 0xf2ece0, T.x, 0.39, fz0 - 0.05);
    // --- табло на столбах у южного края, лицом к площади
    const B = RAT_BOARD;
    for (const sx of [-1, 1]) box(0.1, B.y + B.h + 0.1, 0.1, 0x7a5232, B.x + sx * (B.w / 2 + 0.05), (B.y + B.h + 0.1) / 2, B.z);
    box(B.w + 0.14, B.h + 0.14, 0.05, 0x5a3e2b, B.x, B.y + B.h / 2, B.z + 0.03);
    box(B.w + 0.3, 0.06, 0.16, 0xb07a4a, B.x, B.y + B.h + 0.1, B.z);
    // --- газон: домик (стенки и красная крыша), миска, сыр
    box(0.42, 0.24, 0.34, 0xe9dcc0, HOUSE.x, 0.13, HOUSE.z);
    box(0.12, 0.13, 0.02, 0x3a2a20, HOUSE.x + 0.21, 0.08, HOUSE.z);
    parts.push(place(paint(new THREE.CylinderGeometry(0.001, 0.3, 0.18, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 0.8), 0xc0473a), HOUSE.x, 0.34, HOUSE.z));
    parts.push(place(paint(new THREE.CylinderGeometry(0.09, 0.07, 0.05, 14), 0x6a8fb0), BOWL.x, 0.04, BOWL.z));
    parts.push(place(paint(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 3).rotateY(0.4), 0xf2c94c), CHEESE.x, 0.055, CHEESE.z));
    // --- флажки над табло
    const flags: THREE.BufferGeometry[] = [];
    const fcols = [0xd64541, 0xf2c230, 0x3f7fd8, 0x3fa65a, 0xf08a2c];
    for (let i = 0; i < 11; i++) {
      const x = B.x - B.w / 2 - 0.1 + (i + 0.5) * ((B.w + 0.2) / 11);
      const sag = 0.06 * Math.sin((Math.PI * (i + 0.5)) / 11);
      flags.push(place(paint(new THREE.ConeGeometry(0.06, 0.13, 3).rotateX(Math.PI), fcols[i % fcols.length]), x, B.y + B.h + 0.06 - sag, B.z - 0.06));
    }
    parts.push(...flags);
    const body = new THREE.Mesh(mergeColored(parts), wood);
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);
    // --- табло: холст
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 464;
    const ctx = canvas.getContext('2d')!;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this.sign = { ctx, tex };
    const board = new THREE.Mesh(new THREE.PlaneGeometry(B.w, B.h * 0.96), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
    board.rotation.y = Math.PI;
    board.position.set(B.x, B.y + B.h / 2, B.z - 0.003);
    g.add(board);
    const finish = this.textPlane('ФИНИШ', 0.5, 0.14, '#d64541');
    finish.position.set(T.x, 0.84, fz0 - 0.08);
    finish.rotation.y = Math.PI;
    g.add(finish);
    const finishBack = finish.clone();
    finishBack.rotation.y = 0;
    finishBack.position.z = fz0 - 0.02;
    g.add(finishBack);
    // --- воротца старта: шлагбаум поперёк дорожки чуть впереди линии, поднимается от внешнего столбика
    this.gateArm = new THREE.Group();
    this.gateArm.position.set(T.x - 0.14, 0.16, fz0 - 0.02);
    const arm = new THREE.Mesh(mergeColored([0, 1, 2, 3, 4, 5].map((i) => place(paint(new THREE.BoxGeometry(0.03, 0.03, T.w / 6), i % 2 ? 0xf8f6f0 : 0xd64541), 0, 0, (i + 0.5) * (T.w / 6) + 0.02))), wood);
    arm.castShadow = true;
    this.gateArm.add(arm);
    g.add(this.gateArm);
    const gatePost = new THREE.Mesh(paint(new THREE.BoxGeometry(0.05, 0.22, 0.05), 0x7a5232), wood);
    gatePost.position.set(T.x - 0.14, 0.11, fz0 - 0.05);
    g.add(gatePost);
    // --- крысы
    RATS.forEach((def, i) => this.rats.push(this.makeRat(i, def.coat, def.belly, def.saddle, def.style === 'lazy' ? 1.22 : 1)));
    this.drawSign(performance.now());
    scene.add(g);
  }

  /** Включены ли бега (флаг сервера); приветствие набережной — начало с чистого листа */
  setOn(on: boolean): void {
    this.group.visible = on;
    this.view = null;
    this.race = null;
    this.playedRace = 0;
    this.signKey = '';
  }

  get on(): boolean { return this.group.visible; }

  /** Идёт ли забег у этого игрока (по своим часам): итог показываем после него */
  get running(): boolean { return this.race !== null && !this.race.ended; }

  /** Номер последнего забега, который у этого игрока уже добежал (0 — ни одного) */
  get lastRace(): number { return this.endedRace; }

  /** Сколько мс до старта (open) и идёт ли отсчёт */
  get countdown(): number {
    const v = this.view;
    return v?.phase === 'open' ? Math.max(0, v.left - (performance.now() - this.viewAt) + 0) : 0;
  }

  /** Кот смотрит: приняты ставки, идёт забег или только что закончился */
  get catWanted(): boolean {
    if (!this.group.visible || !this.view) return false;
    return this.view.phase !== 'idle' || this.running || performance.now() - this.endedAt < 7000;
  }

  /** Куда смотреть зрителю: на лидера в забеге, иначе — на ближайшую к нему крысу или середину арены */
  lookPoint(): { x: number; z: number } {
    const r = this.race;
    if (r && !r.ended) {
      const ms = performance.now() - r.start;
      const lead = ratStandings(r.plan, Math.max(0, ms))[0];
      return { x: this.rats[lead].x, z: this.rats[lead].z };
    }
    const k = Math.floor(this.time / 3) % RAT_COUNT;
    return { x: this.rats[k].x, z: this.rats[k].z };
  }

  /** Кто сейчас впереди (в забеге) — для табло и плашки; null — забега нет */
  standings(): number[] | null {
    const r = this.race;
    if (!r || r.ended) return null;
    return ratStandings(r.plan, Math.max(0, performance.now() - r.start));
  }

  /** Порядок прошлого забега, пока висит итог */
  resultOrder(): number[] | null {
    return this.lastOrder && performance.now() - this.endedAt < RAT_RESULT_MS ? this.lastOrder : null;
  }

  /** За крысу болеют: она оживляется (подпрыгивает на месте или бежит бодрее на вид) */
  cheer(rat: number): void {
    if (rat >= 0 && rat < RAT_COUNT) this.cheerUntil[rat] = performance.now() + 900;
  }

  setView(v: RatRaceView, latencyMs = 0): void {
    const now = performance.now();
    this.latency = Math.min(500, Math.max(0, latencyMs));
    this.view = v;
    this.viewAt = now - this.latency;
    if (v.phase === 'run' && v.seed !== undefined && v.order && v.race !== this.playedRace) {
      this.playedRace = v.race;
      const start = now - this.latency + v.left - RAT_RUN_MS;
      this.race = { race: v.race, plan: ratPlan(v.seed, v.order), order: v.order, start, started: false, won: false, ended: false, evDone: 0 };
      this.lastWinMult = v.odds[v.order[0]] ?? 0;
      for (const r of this.rats) r.mode = 'race';
    } else if (v.phase === 'open') {
      for (const r of this.rats) if (r.mode !== 'race') { r.mode = 'line'; r.until = 0; }
    } else if (v.phase === 'idle' && !this.running && v.last && !this.lastOrder) {
      // вошёл после забега — на табло итог прошлого
      this.lastOrder = v.last.order;
      this.lastWinMult = v.last.odds[v.last.order[0]] ?? 0;
      this.endedAt = now - RAT_RESULT_MS / 2;
    }
    this.signKey = '';
  }

  update(dt: number, time: number, cam: { x: number; y: number; z: number }): void {
    if (!this.group.visible) return;
    this.time = time;
    const now = performance.now();
    const far = Math.hypot(cam.x - RAT_TRACK.x, cam.z - RAT_TRACK.z) > 70;
    const r = this.race;
    let ms = 0;
    if (r) {
      ms = now - r.start;
      if (!r.started && ms >= 0) { r.started = true; this.onGate(); }
      if (!r.won && ms >= r.plan.finish[r.order[0]]) {
        r.won = true;
        const w = this.rats[r.order[0]];
        this.onWinner(r.order[0], w.x, w.z);
      }
      if (ms >= RAT_RUN_MS + 200) this.endRace(r, now);
    }
    // шлагбаум: опущен в отсчёте и до открытия воротец
    const phase = this.view?.phase ?? 'idle';
    const down = phase === 'open' || (r !== null && !r.ended && ms < RAT_GATE_MS * 0.4);
    this.gateUp += ((down ? 0 : 1) - this.gateUp) * Math.min(1, dt * (down ? 4 : 5));
    this.gateArm.rotation.x = -this.gateUp * 1.35;
    if (!far) {
      for (const rat of this.rats) this.stepRat(rat, dt, now, r && !r.ended ? ms : -1);
      this.separate();
      for (const rat of this.rats) this.pose(rat, dt, now, r && !r.ended ? ms : -1);
    }
    const left = this.view && this.view.phase !== 'idle' ? Math.ceil(Math.max(0, this.view.left - (now - this.viewAt)) / 1000) : 0;
    const st = r && !r.ended ? ratStandings(r.plan, Math.max(0, ms)).join('') : '';
    const key = `${phase}|${left}|${this.view?.bets.length}|${st}|${this.resultOrder() ? 1 : 0}|${this.view?.race}`;
    if (key !== this.signKey) {
      this.signKey = key;
      this.drawSign(now);
    }
  }

  private endRace(r: Race, now: number): void {
    r.ended = true;
    this.endedAt = now;
    this.endedRace = r.race;
    this.lastOrder = r.order;
    this.race = null;
    const open = this.view?.phase === 'open';
    for (const rat of this.rats) {
      // уже открыт приём на следующий забег — сразу к воротцам
      if (open) { rat.mode = 'line'; continue; }
      rat.mode = rat.i === r.order[0] ? 'win' : 'wander';
      rat.until = this.time + (rat.i === r.order[0] ? 3 : 1 + Math.random() * 2);
      rat.tx = rat.x - 0.4 - Math.random() * 0.6;
      rat.tz = rat.z + (Math.random() - 0.5) * 0.3;
    }
    this.signKey = '';
  }

  // ------------------------------------------------------------ жизнь крыс

  private pick(rat: Rat): void {
    const t = this.time;
    const roll = Math.random();
    const asleep = this.rats.filter((o) => o.mode === 'sleep').length;
    if (roll < 0.14 && asleep < 2) {
      rat.mode = 'sleep'; rat.until = t + 8 + Math.random() * 8;
      rat.tx = HOUSE.x + (Math.random() - 0.5) * 0.5; rat.tz = HOUSE.z + (Math.random() < 0.5 ? -1 : 1) * (0.3 + Math.random() * 0.12);
    } else if (roll < 0.3) {
      rat.mode = 'groom'; rat.until = t + 3 + Math.random() * 3; rat.tx = rat.x; rat.tz = rat.z;
    } else if (roll < 0.42) {
      rat.mode = 'eat'; rat.until = t + 4 + Math.random() * 3;
      const a = Math.random() * Math.PI * 2;
      rat.tx = CHEESE.x + Math.cos(a) * 0.17; rat.tz = CHEESE.z + Math.sin(a) * 0.17;
    } else if (roll < 0.56) {
      const prey = this.rats.filter((o) => o !== rat && (o.mode === 'wander' || o.mode === 'sit' || o.mode === 'groom'));
      if (prey.length) {
        const p = prey[Math.floor(Math.random() * prey.length)];
        rat.mode = 'chase'; rat.until = t + 3 + Math.random() * 2; rat.prey = p.i;
        p.mode = 'flee'; p.until = t + 3.5; this.fleeTarget(p, rat);
        return;
      }
      this.wander(rat, t);
    } else if (roll < 0.66) {
      rat.mode = 'sit'; rat.until = t + 1.5 + Math.random() * 2.5; rat.tx = rat.x; rat.tz = rat.z;
    } else this.wander(rat, t);
  }

  private wander(rat: Rat, t: number): void {
    rat.mode = 'wander';
    rat.until = t + 6;
    // чаще — по дорожке (видно с набережной), иногда — по газону
    if (Math.random() < 0.65) {
      ratTrackPoint(Math.random() * RAT_LAP, (Math.random() - 0.5) * (RAT_TRACK.w - 0.2), this.tp);
      rat.tx = this.tp.x; rat.tz = this.tp.z;
    } else {
      rat.tx = PEN_IN.x0 + Math.random() * (PEN_IN.x1 - PEN_IN.x0);
      rat.tz = PEN_IN.z0 + Math.random() * (PEN_IN.z1 - PEN_IN.z0);
    }
  }

  private fleeTarget(p: Rat, from: Rat): void {
    const a = Math.atan2(p.z - from.z, p.x - from.x) + (Math.random() - 0.5) * 1.2;
    p.tx = Math.min(PEN_IN.x1, Math.max(PEN_IN.x0, p.x + Math.cos(a) * 1.6));
    p.tz = Math.min(PEN_IN.z1, Math.max(PEN_IN.z0, p.z + Math.sin(a) * 1.2));
  }

  private stepRat(rat: Rat, dt: number, now: number, ms: number): void {
    if (rat.mode === 'race' && ms >= 0 && this.race) {
      const p = ratAt(this.race.plan, rat.i, ms);
      ratTrackPoint(p.dist, p.lat, this.tp);
      const d = Math.hypot(this.tp.x - rat.x, this.tp.z - rat.z);
      rat.speed = dt > 0 ? Math.min(4, d / dt) : 0;
      rat.x = this.tp.x; rat.z = this.tp.z;
      rat.yaw = this.tp.yaw;
      rat.gait += d * 34;
      this.raceEvents(rat, ms);
      return;
    }
    if (rat.mode === 'race') {
      // забег ещё не начался у этого игрока (сеть) — стоим на старте
      this.goLine(rat, dt);
      return;
    }
    const t = this.time;
    if (rat.mode === 'line') { this.goLine(rat, dt); return; }
    if (t >= rat.until) this.pick(rat);
    let speed = 0;
    let tx = rat.tx, tz = rat.tz;
    switch (rat.mode) {
      case 'wander': speed = 0.55; break;
      case 'sleep': case 'eat': speed = 0.45; break;
      case 'chase': {
        const p = this.rats[rat.prey];
        tx = p.x; tz = p.z; speed = 1.45;
        if (Math.hypot(p.x - rat.x, p.z - rat.z) < 0.24) { rat.mode = 'sit'; rat.until = t + 1.5; p.mode = 'groom'; p.until = t + 2; }
        break;
      }
      case 'flee': speed = 1.55; break;
      case 'win': speed = 0; break;
      default: speed = 0;
    }
    const d = Math.hypot(tx - rat.x, tz - rat.z);
    if (d < 0.06 || speed === 0) {
      rat.speed += (0 - rat.speed) * Math.min(1, dt * 8);
      if (rat.mode === 'wander' && d < 0.06) rat.until = Math.min(rat.until, t + 0.4);
      if (rat.mode === 'eat' || rat.mode === 'sleep') rat.yaw = turn(rat.yaw, Math.atan2(-(CHEESE.x - rat.x), -(CHEESE.z - rat.z)) * (rat.mode === 'eat' ? 1 : 0) + (rat.mode === 'sleep' ? rat.yaw : 0), dt, 3);
    } else this.move(rat, tx, tz, speed, dt);
  }

  private goLine(rat: Rat, dt: number): void {
    const lane = ((rat.i / (RAT_COUNT - 1)) * 2 - 1) * (RAT_TRACK.w / 2 - 0.1);
    ratTrackPoint(0, lane, this.tp);
    const d = Math.hypot(this.tp.x - rat.x, this.tp.z - rat.z);
    if (d < 0.04) {
      rat.x = this.tp.x; rat.z = this.tp.z;
      rat.speed += (0 - rat.speed) * Math.min(1, dt * 8);
      rat.yaw = turn(rat.yaw, this.tp.yaw, dt, 5);
      return;
    }
    // к своему месту — по дорожке вокруг газона не обязательно: крысы прыгают через бровку
    this.move(rat, this.tp.x, this.tp.z, d > 1 ? 1.3 : Math.max(0.35, d * 1.4), dt);
  }

  private move(rat: Rat, tx: number, tz: number, speed: number, dt: number): void {
    const want = Math.atan2(-(tx - rat.x), -(tz - rat.z));
    rat.yaw = turn(rat.yaw, want, dt, 7);
    const ahead = Math.cos(wrap(want - rat.yaw));
    rat.speed += (speed * Math.max(0.15, ahead) - rat.speed) * Math.min(1, dt * 6);
    const step = rat.speed * dt;
    rat.x += -Math.sin(rat.yaw) * step;
    rat.z += -Math.cos(rat.yaw) * step;
    rat.x = Math.min(PEN_IN.x1, Math.max(PEN_IN.x0, rat.x));
    rat.z = Math.min(PEN_IN.z1, Math.max(PEN_IN.z0, rat.z));
    // в домик не лезем — обходим
    const hx = rat.x - HOUSE.x, hz = rat.z - HOUSE.z, hd = Math.hypot(hx, hz);
    if (hd < HOUSE.r && hd > 1e-4) { rat.x = HOUSE.x + (hx / hd) * HOUSE.r; rat.z = HOUSE.z + (hz / hd) * HOUSE.r; }
    rat.gait += step * 34;
  }

  /** Крысы не проходят друг сквозь друга (кроме забега и сна) */
  private separate(): void {
    for (let a = 0; a < RAT_COUNT; a++) for (let b = a + 1; b < RAT_COUNT; b++) {
      const p = this.rats[a], q = this.rats[b];
      if (p.mode === 'race' || q.mode === 'race') continue;
      const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
      if (d > 0.17 || d < 1e-5) continue;
      const push = (0.17 - d) / 2;
      p.x -= (dx / d) * push; p.z -= (dz / d) * push;
      q.x += (dx / d) * push; q.z += (dz / d) * push;
    }
  }

  private raceEvents(rat: Rat, ms: number): void {
    const r = this.race;
    if (!r) return;
    for (const e of r.plan.events) {
      if (e.rat !== rat.i) continue;
      if (e.kind === 'trip' && ms >= e.at && ms < e.at + 560 && rat.rollAt !== e.at) {
        rat.rollAt = e.at;
        if (performance.now() - rat.squeakAt > 400) { rat.squeakAt = performance.now(); this.onSqueak(rat.x, 0.2, rat.z); }
      }
      if (e.kind === 'snack' && ms >= e.at && ms < e.at + 120 && performance.now() - rat.squeakAt > 900) {
        rat.squeakAt = performance.now();
        this.onSqueak(rat.x, 0.2, rat.z);
      }
    }
  }

  // ------------------------------------------------------------ позы

  private pose(rat: Rat, dt: number, now: number, ms: number): void {
    const t = this.time;
    const g = rat.g;
    g.position.set(rat.x, 0.02, rat.z);
    g.rotation.y = rat.yaw;
    const run = Math.min(1, rat.speed / 1.2);
    const step = Math.sin(rat.gait);
    rat.paws.forEach((p, k) => {
      const side = k % 2 ? 1 : -1;
      const front = k < 2 ? 1 : -1;
      const ph = (k === 0 || k === 3) ? step : -step;
      p.position.set(side * 0.045, 0.018 + Math.max(0, ph) * 0.02 * run, front * 0.075 + ph * 0.035 * run);
    });
    let pitch = 0, roll = 0, lift = Math.abs(step) * 0.012 * run, squash = 1, headDown = 0;
    let tailWag = Math.sin(t * (2 + run * 9) + rat.i) * (0.25 + run * 0.35);
    switch (rat.mode) {
      case 'sleep': squash = 0.78; headDown = 0.45; tailWag = 1.1 + Math.sin(t * 0.7 + rat.i) * 0.05; lift = 0.002 * Math.sin(t * 2.2 + rat.i); break;
      case 'groom': pitch = -0.55; headDown = -0.25 + Math.sin(t * 9 + rat.i) * 0.18; break;
      case 'eat': headDown = 0.35 + Math.abs(Math.sin(t * 10 + rat.i)) * 0.2; break;
      case 'sit': pitch = -0.2; headDown = Math.sin(t * 1.3 + rat.i) * 0.2; break;
      case 'win': lift = Math.abs(Math.sin(t * 7)) * 0.12; pitch = -0.4; break;
      default: break;
    }
    // болеют за неё — подпрыгивает (в забеге — только трясёт головой)
    const cheer = this.cheerUntil[rat.i] - now;
    if (cheer > 0 && rat.mode !== 'race') lift = Math.max(lift, Math.abs(Math.sin(cheer / 70)) * 0.07);
    if (cheer > 0) headDown += Math.sin(now / 45) * 0.12;
    // кувырок в забеге: полный оборот через бок за полсекунды
    if (rat.mode === 'race' && ms >= 0 && rat.rollAt >= 0 && ms - rat.rollAt < 520) {
      const u = (ms - rat.rollAt) / 520;
      roll = smooth(u) * Math.PI * 2;
      lift = Math.sin(Math.PI * u) * 0.08;
    }
    rat.body.position.y = lift;
    rat.body.rotation.set(pitch, 0, roll);
    rat.body.scale.set(1, squash, 1);
    rat.head.rotation.x = headDown;
    rat.tail.rotation.y = tailWag;
    // номер над крысой — когда идёт отсчёт, забег или висит итог
    const show = this.view?.phase !== 'idle' || ms >= 0 || this.resultOrder() !== null;
    rat.tag.visible = show;
    if (show) rat.tag.position.y = 0.36 + lift + (rat.mode === 'win' ? 0.1 : 0);
    void dt;
  }

  // ------------------------------------------------------------ модели

  private makeRat(i: number, coat: number, belly: number, saddle: string, fat: number): Rat {
    const g = new THREE.Group();
    g.name = `rat-${i}`;
    // чуть крупнее настоящей крысы — чтобы с набережной было видно, кто где
    g.scale.setScalar(1.3);
    const fur = new THREE.MeshStandardMaterial({ color: coat, roughness: 0.9 });
    const light = new THREE.MeshStandardMaterial({ color: belly, roughness: 0.9 });
    const pink = new THREE.MeshStandardMaterial({ color: 0xe8a3a3, roughness: 0.7 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x141214, roughness: 0.4 });
    const cloth = new THREE.MeshStandardMaterial({ color: new THREE.Color(saddle), roughness: 0.8 });
    const body = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), fur);
    torso.scale.set(0.072 * fat, 0.066 * fat, 0.14);
    torso.position.y = 0.075;
    torso.castShadow = true;
    body.add(torso);
    const tummy = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), light);
    tummy.scale.set(0.058 * fat, 0.045 * fat, 0.11);
    tummy.position.set(0, 0.055, 0.01);
    body.add(tummy);
    // попона с номером
    const blanket = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.32), cloth);
    blanket.scale.set(0.077 * fat, 0.07 * fat, 0.085);
    blanket.position.set(0, 0.08, 0.01);
    body.add(blanket);
    const head = new THREE.Group();
    head.position.set(0, 0.085, -0.13);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 9), fur);
    skull.scale.set(0.05, 0.048, 0.07);
    skull.position.z = -0.03;
    head.add(skull);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), pink);
    nose.position.set(0, -0.006, -0.098);
    head.add(nose);
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), pink);
      ear.scale.set(0.028, 0.03, 0.01);
      ear.position.set(sx * 0.036, 0.045, -0.005);
      ear.rotation.z = sx * -0.35;
      head.add(ear);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.0095, 8, 6), dark);
      eye.position.set(sx * 0.028, 0.018, -0.06);
      head.add(eye);
    }
    body.add(head);
    const tail = new THREE.Group();
    tail.position.set(0, 0.055, 0.13);
    const tailMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.011, 0.26, 6).rotateX(Math.PI / 2 + 0.28), pink);
    tailMesh.position.set(0, -0.026, 0.12);
    tail.add(tailMesh);
    body.add(tail);
    g.add(body);
    const paws: THREE.Object3D[] = [];
    for (let k = 0; k < 4; k++) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), pink);
      p.scale.set(1, 0.6, 1.3);
      g.add(p);
      paws.push(p);
    }
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: numberTexture(i + 1, saddle), depthWrite: false }));
    tag.scale.setScalar(0.17);
    tag.position.y = 0.36;
    tag.visible = false;
    g.add(tag);
    this.group.add(g);
    const a = (i / RAT_COUNT) * Math.PI * 2;
    const x = RAT_TRACK.x + Math.cos(a) * 1.6, z = RAT_TRACK.z + Math.sin(a) * 0.6;
    const rat: Rat = { i, g, body, head, tail, paws, tag, x, z, yaw: a, speed: 0, gait: 0, mode: 'wander', until: 0, tx: x, tz: z, prey: 0, rollAt: -1, squeakAt: 0 };
    return rat;
  }

  private textPlane(text: string, w: number, h: number, color: string): THREE.Mesh {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = Math.round((256 * h) / w);
    const g = c.getContext('2d')!;
    g.fillStyle = '#fbf6ea';
    g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = color; g.lineWidth = 6; g.strokeRect(3, 3, c.width - 6, c.height - 6);
    g.fillStyle = color;
    g.font = `bold ${Math.round(c.height * 0.62)}px Rubik, system-ui, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, c.width / 2, c.height / 2 + 2);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 }));
  }

  // ------------------------------------------------------------ табло

  private drawSign(now: number): void {
    const { ctx: g, tex } = this.sign;
    const v = this.view;
    const W = 1024, H = 464;
    g.fillStyle = '#2f3a33';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#e2c27a';
    g.lineWidth = 10;
    g.strokeRect(8, 8, W - 16, H - 16);
    g.textBaseline = 'alphabetic';
    g.textAlign = 'center';
    g.fillStyle = '#f4e8c8';
    g.font = 'bold 58px Rubik, system-ui, sans-serif';
    g.fillText('🐀 КРЫСИНЫЕ БЕГА', W / 2, 78);
    const odds = v?.odds ?? [];
    const st = this.standings();
    const res = st ? null : this.resultOrder();
    const row = (list: number[], label: (rat: number, place: number) => string): void => {
      list.forEach((rat, k) => {
        const col = k % 2, line = Math.floor(k / 2);
        const x = 60 + col * 470, y = 168 + line * 80;
        g.fillStyle = RATS[rat].saddle;
        g.beginPath(); g.arc(x + 26, y - 18, 26, 0, Math.PI * 2); g.fill();
        g.fillStyle = RATS[rat].saddle === '#e8b923' ? '#2a2420' : '#ffffff';
        g.font = 'bold 34px Rubik, system-ui, sans-serif';
        g.textAlign = 'center';
        g.fillText(String(rat + 1), x + 26, y - 6);
        g.textAlign = 'left';
        g.fillStyle = '#f4e8c8';
        g.font = '38px Rubik, system-ui, sans-serif';
        g.fillText(label(rat, k), x + 66, y - 4);
      });
    };
    let footer = '';
    if (st) {
      g.fillStyle = '#e7c77a';
      g.font = 'bold 44px Rubik, system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText('Забег идёт!', W / 2, 128);
      row(st, (rat, k) => `${k + 1}. ${RATS[rat].name}`);
    } else if (res) {
      g.fillStyle = '#e7c77a';
      g.font = 'bold 44px Rubik, system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText(`${ratWon(res[0])} · ×${this.lastWinMult}`, W / 2, 128);
      row(res, (rat, k) => `${k + 1}. ${RATS[rat].name}`);
      footer = v?.phase === 'open' ? 'Приём ставок на следующий забег' : 'E — ставка на следующий забег';
    } else {
      const order = [0, 1, 2, 3, 4, 5];
      g.fillStyle = '#e7c77a';
      g.font = 'bold 44px Rubik, system-ui, sans-serif';
      g.textAlign = 'center';
      if (v?.phase === 'open') {
        const secs = Math.max(0, Math.ceil((v.left - (now - this.viewAt)) / 1000));
        g.fillText(`Старт через ${secs} с · ставок: ${v.bets.length}`, W / 2, 128);
      } else g.fillText('Коэффициенты забега', W / 2, 128);
      row(order, (rat) => `${RATS[rat].name}  ×${odds[rat] ?? '?'}`);
      footer = v?.phase === 'open' ? 'Ставь сейчас: E у арены' : 'E — сделать ставку · старт через 15 с после первой';
    }
    if (footer) {
      g.textAlign = 'center';
      g.fillStyle = '#b9c4ad';
      g.font = '30px Rubik, system-ui, sans-serif';
      g.fillText(footer, W / 2, H - 30);
    }
    tex.needsUpdate = true;
  }
}

function turn(cur: number, target: number, dt: number, rate: number): number {
  const d = wrap(target - cur);
  const s = rate * dt;
  return cur + Math.max(-s, Math.min(s, d));
}

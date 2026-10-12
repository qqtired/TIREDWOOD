// Однорукие бандиты в павильоне набережной. Корпус с полукруглым верхом, окно с тремя барабанами (у каждого
// своя лента: 6 символов по два раза), лампочки по контуру, рычаг справа, табличка с названием и ставкой,
// таблица выплат (у каждого автомата своя, в жетонах; выигравшая строка подсвечивается) и лоток для монет. Автоматы светятся: тёплый ореол на стене за корпусом (дышит вместе с лампочками)
// и цветное пятно на ковре перед ним.
// По slotSpin барабаны разгоняются и по очереди встают на присланные сервером символы — с перелётом и отскоком;
// через SPIN_MS — итог: монеты и «+N», бегущие огни, звон (мелочь меньше ставки — пара монет и короткий звон).
// Крупный выигрыш — фонтаны искр и конфетти;
// джекпот — сирена, салют, конфетти-пушки на крыше павильона и мигание всего зала.
// Неподвижное склеено в несколько мешей на весь зал; отдельно крутятся только барабаны и рычаги.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeRng } from '../../shared/math.ts';
import { BIG_WIN_MULT, JACKPOT_MULT, MACHINE_NAMES, PAYTABLES, REEL_STOP_MS, SPIN_MS, STAKES } from '../../shared/slots.ts';
import type { Sound } from '../audio.ts';
import type { Avatar } from '../render/avatar.ts';
import { glowTexture, paint } from '../render/kit.ts';
import { glowCardTexture, metalEnvTexture } from '../render/textures.ts';
import type { LobbyFx } from './fx.ts';
import type { LobbyWorld } from './world.ts';

/** То, что нужно автоматам из сообщения slotSpin */
export interface SpinMsg {
  m: number;
  nick: string;
  reels: number[];
  win: number;
  /** Выигравшая строка таблицы выплат (−1 — ничего) */
  line: number;
  jackpot: boolean;
}

const FONT = 'Rubik, system-ui, sans-serif';
const TAU = Math.PI * 2;

/** Цвет корпуса по номеру: красный, синий, зелёный, фиолетовый, золотой */
const COLORS = [0xb8322a, 0x2f5fa8, 0x2f8a4a, 0x6a3a8a, 0xc9a23a];

// Корпус 1,0 × 1,9 × 0,8 м: прямоугольник высотой 1,4 и полукруг сверху. Начало координат — середина
// передней грани у пола, корпус уходит назад по −z.
const W = 1.0;
const DEPTH = 0.8;
const BODY_H = 1.4;
const ARCH_R = 0.5;
const BEVEL = 0.02;
// окно барабанов
const WIN_W = 0.62;
const WIN_H = 0.28;
const WIN_Y = 1.28;
// барабаны: ось X, передний край — чуть за лицевой панелью
const REEL_R = 0.16;
const REEL_W = 0.18;
const REEL_Z = -0.2;
const REEL_XS = [-0.2, 0, 0.2];
const CELLS = 12;
const CELL = TAU / CELLS;
// табличка с названием: полукруг над окном
const SIGN_R = 0.32;
const SIGN_Y = 1.5;
// рычаг на правом боку
const LEVER_Y = 1.02;
const LEVER_Z = -0.3;
const LEVER_REST = -0.12;
const LEVER_PULL = 1.1;
const LEVER_S = 0.6;

// Вращение: разгон, ровный ход, торможение к символу с перелётом на 6° и отскок назад
const SPIN_SPEED = 15;
const ACCEL_S = 0.25;
const DECEL_S = 0.45;
const OVERSHOOT = (6 * Math.PI) / 180;
const SETTLE_S = 0.22;
/** Быстрее этого (рад/с) лента рисуется смазанной */
const BLUR_SPEED = 7;
/** Трещотка: шаг и до какого расстояния слышно чужие автоматы */
const TICK_S = 0.06;
const TICK_RANGE = 16;

// Лампочки по контуру: снизу вверх по левому краю, дугой, вниз по правому — так бегут огни
const BULB_R = 0.465;
const SIDE_BULB_YS = [0.6, 0.7625, 0.925, 1.0875, 1.25];
const ARCH_BULBS = 11;
const BULBS = SIDE_BULB_YS.length * 2 + ARCH_BULBS;
const BULB_ON = new THREE.Color(1, 0.8, 0.45);
/** Ореол на стене за автоматом: ширина вокруг корпуса, яркость (доля среднего света лампочек), отступ от передней грани */
const BACK_GLOW_M = 0.5;
const BACK_GLOW_K = 0.4;
const BACK_GLOW_Z = -1.69;
/** Отсвет на ковре перед автоматом цветом корпуса: ширина, глубина, яркость */
const POOL_W = 1.7;
const POOL_D = 1.3;
const POOL_K = 0.35;

// Итог вращения
const WIN_LIGHTS_MS = 2000;
const LOSE_DIM_MS = 600;
const JACKPOT_MS = 4000;
const JACKPOT_COINS = 90;
const FIREWORKS_AT = new THREE.Vector3(-20, 12, -10);
/** Фонтаны искр: по бокам автомата (за рычагом), сколько секунд у крупного выигрыша */
const FOUNTAIN_DX = [-0.78, 0.78];
/** Конфетти-пушки на углах крыши павильона: при джекпоте стреляют над площадью */
const CANNONS: ReadonlyArray<readonly [number, number, number]> = [[-27.4, 5.3, -15.7], [-12.6, 5.3, -15.7]];
const BIG_FOUNTAIN_S = 1.6;

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _c = new THREE.Color();

interface StripTex {
  sharp: THREE.CanvasTexture;
  blur: THREE.CanvasTexture;
}

interface Reel {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  tex: StripTex;
  angle: number;
  from: number;
  /** Угол покоя после вращения (символ на линии выигрыша) */
  to: number;
  speed: number;
  /** Когда встаёт, с от начала вращения */
  stopAt: number;
  stopped: boolean;
}

interface Pending {
  win: number;
  /** Во сколько раз больше ставки (мелочь — меньше 1) */
  mult: number;
  line: number;
  jackpot: boolean;
  nick: string;
  mine: boolean;
}

/** Таблица выплат автомата: свой холст, подсвеченная строка и до какого времени */
interface Table {
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  hi: number;
  hiUntil: number;
}

type Mode = 'idle' | 'spin' | 'win' | 'lose';

interface Machine {
  x: number;
  z: number;
  /** Откуда звучит: середина передней панели */
  pos: [number, number, number];
  reels: Reel[];
  lever: THREE.Group;
  /** Время с рывка рычага, с; −1 — в покое */
  leverT: number;
  spinning: boolean;
  spinStart: number;
  mine: boolean;
  reveal: Pending | null;
  mode: Mode;
  modeUntil: number;
  occupied: boolean;
  tickAcc: number;
  table: Table;
}

export class SlotMachines3D {
  /** Джекпот выпал (барабаны встали): крупная надпись на экране */
  onJackpot: (nick: string, win: number) => void = () => {};
  private readonly world: LobbyWorld;
  private readonly sound: Sound;
  private readonly fx: LobbyFx;
  private readonly machines: Machine[] = [];
  private readonly bulbs: THREE.InstancedMesh;
  private readonly haloCol: Float32Array;
  private readonly haloAttr: THREE.BufferAttribute;
  private readonly backCol: Float32Array;
  private readonly backAttr: THREE.BufferAttribute;
  private jackpotUntil = 0;

  constructor(world: LobbyWorld, sound: Sound, fx: LobbyFx) {
    this.world = world;
    this.sound = sound;
    this.fx = fx;
    fx.onBurst = (x, y, z) => sound.firework([x, y, z]);
    const env = metalEnvTexture();
    const scene = world.scene;

    const cabinetMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.35, envMap: env, envMapIntensity: 0.55 });
    const darkMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.1 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe6e6ea, roughness: 0.18, metalness: 1, envMap: env, envMapIntensity: 1.1 });
    const knobMat = new THREE.MeshStandardMaterial({ color: 0xd42a1e, roughness: 0.22, metalness: 0.15, envMap: env, envMapIntensity: 0.8 });
    const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    const signMat = new THREE.MeshBasicMaterial({ map: signAtlas() });
    const shadeMat = new THREE.MeshBasicMaterial({ map: shadeTexture(), transparent: true, depthWrite: false });
    const glassMat = new THREE.MeshBasicMaterial({ map: glassTexture(), transparent: true, depthWrite: false, toneMapped: false });

    const strips = STRIPS.map(stripTextures);
    const reelGeo = reelGeometry();
    const rodGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.44, 10).translate(0, 0.22, 0);
    const knobGeo = new THREE.SphereGeometry(0.058, 20, 14).translate(0, 0.46, 0);
    const cab = cabinetGeometry();
    const bezel = bezelGeometry();

    const cabinets: THREE.BufferGeometry[] = [];
    const dark: THREE.BufferGeometry[] = [];
    const chrome: THREE.BufferGeometry[] = [];
    const glow: THREE.BufferGeometry[] = [];
    const signs: THREE.BufferGeometry[] = [];
    const tableGeo = new THREE.PlaneGeometry(0.78, 0.366);
    const shades: THREE.BufferGeometry[] = [];
    const glasses: THREE.BufferGeometry[] = [];

    world.machineAnchors.forEach((anchor, i) => {
      const ax = anchor.position.x;
      const az = anchor.position.z;
      const at = (g: THREE.BufferGeometry) => g.translate(ax, 0, az);

      const color = COLORS[i % COLORS.length];
      cabinets.push(at(paint(cab.clone(), color)));
      // задний короб до стены (там уже не пройти) — тот же цвет, только темнее
      cabinets.push(at(paint(box(0.96, 1.5, 0.88, 0, 0.75, -1.24), new THREE.Color(color).multiplyScalar(0.4))));
      // задняя стенка окна, цоколь, ниша лотка, пульт под окном
      dark.push(at(paint(new THREE.PlaneGeometry(WIN_W + 0.04, WIN_H + 0.04).translate(0, WIN_Y, -0.39), 0x0e0a08)));
      dark.push(at(paint(box(1.04, 0.09, 0.84, 0, 0.045, -0.4), 0x1b1511)));
      dark.push(at(paint(new THREE.PlaneGeometry(0.42, 0.13).translate(0, 0.37, 0.003), 0x080605)));
      dark.push(at(paint(new THREE.BoxGeometry(0.86, 0.05, 0.16).rotateX(0.2).translate(0, 1.03, 0.07), 0x2b2622)));
      // хром: рамка окна, губа и кромка лотка, кант пульта, крепление рычага
      chrome.push(at(bezel.clone()));
      chrome.push(at(box(0.46, 0.022, 0.1, 0, 0.3, 0.05)));
      chrome.push(at(box(0.46, 0.014, 0.025, 0, 0.44, 0.012)));
      chrome.push(at(new THREE.BoxGeometry(0.88, 0.014, 0.014).rotateX(0.2).translate(0, 1.039, 0.153)));
      chrome.push(at(new THREE.CylinderGeometry(0.055, 0.055, 0.05, 20).rotateZ(Math.PI / 2).translate(W / 2 + 0.02, LEVER_Y, LEVER_Z)));
      // кнопки на пульте
      [0xff3b30, 0xffb020, 0x3ad16a].forEach((col, k) => {
        glow.push(at(paint(new THREE.CylinderGeometry(0.03, 0.03, 0.022, 16).rotateX(0.2).translate((k - 1) * 0.26, 1.065, 0.077), col)));
      });
      signs.push(at(signGeometry(i)));
      shades.push(at(new THREE.PlaneGeometry(WIN_W, WIN_H).translate(0, WIN_Y, -0.025)));
      glasses.push(at(new THREE.PlaneGeometry(WIN_W, WIN_H).translate(0, WIN_Y, -0.006)));

      const reels: Reel[] = REEL_XS.map((x, r) => {
        const mat = new THREE.MeshBasicMaterial({ map: strips[r].sharp });
        const mesh = new THREE.Mesh(reelGeo, mat);
        const angle = idleAngle(i, r);
        mesh.position.set(x, WIN_Y, REEL_Z);
        mesh.rotation.x = angle;
        anchor.add(mesh);
        return { mesh, mat, tex: strips[r], angle, from: angle, to: angle, speed: 0, stopAt: 0, stopped: true };
      });

      const [tc, tctx] = canvas(1024, 480);
      drawPaytable(tctx, i, -1);
      const table: Table = { ctx: tctx, tex: tex(tc), hi: -1, hiUntil: 0 };
      const tableMesh = new THREE.Mesh(tableGeo, new THREE.MeshBasicMaterial({ map: table.tex, color: 0xd8d0c0 }));
      tableMesh.position.set(0, 0.72, 0.004);
      anchor.add(tableMesh);

      const lever = new THREE.Group();
      lever.position.set(W / 2 + 0.05, LEVER_Y, LEVER_Z);
      const rod = new THREE.Mesh(rodGeo, chromeMat);
      const knob = new THREE.Mesh(knobGeo, knobMat);
      rod.castShadow = true;
      knob.castShadow = true;
      lever.add(rod, knob);
      lever.rotation.x = LEVER_REST;
      anchor.add(lever);

      this.machines.push({
        x: ax, z: az, pos: [ax, WIN_Y, az + 0.1], reels, lever, leverT: -1, spinning: false, spinStart: 0, mine: false,
        reveal: null, mode: 'idle', modeUntil: 0, occupied: false, tickAcc: 0, table,
      });
    });

    const add = (list: THREE.BufferGeometry[], mat: THREE.Material, shadows: boolean, order = 0) => {
      const mesh = new THREE.Mesh(merge(list), mat);
      mesh.castShadow = shadows;
      mesh.receiveShadow = shadows;
      mesh.renderOrder = order;
      mesh.matrixAutoUpdate = false;
      scene.add(mesh);
    };
    add(cabinets, cabinetMat, true);
    add(dark, darkMat, true);
    add(chrome, chromeMat, true);
    add(glow, glowMat, false);
    add(signs, signMat, false);
    // сначала затенение барабанов, поверх — стекло с линией выигрыша
    add(shades, shadeMat, false, 1);
    add(glasses, glassMat, false, 2);

    // лампочки и мягкие ореолы вокруг них
    const n = this.machines.length * BULBS;
    this.bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.021, 10, 8), new THREE.MeshBasicMaterial({ toneMapped: false }), n);
    const haloPos = new Float32Array(n * 3);
    this.haloCol = new Float32Array(n * 3);
    let k = 0;
    for (const mc of this.machines) {
      for (let j = 0; j < BULBS; j++, k++) {
        const [lx, ly] = bulbLocal(j);
        _m.makeTranslation(mc.x + lx, ly, mc.z + 0.016);
        this.bulbs.setMatrixAt(k, _m);
        this.bulbs.setColorAt(k, BULB_ON);
        haloPos[k * 3] = mc.x + lx;
        haloPos[k * 3 + 1] = ly;
        haloPos[k * 3 + 2] = mc.z + 0.03;
      }
    }
    scene.add(this.bulbs);
    const haloGeo = new THREE.BufferGeometry();
    haloGeo.setAttribute('position', new THREE.BufferAttribute(haloPos, 3));
    this.haloAttr = new THREE.BufferAttribute(this.haloCol, 3).setUsage(THREE.DynamicDrawUsage);
    haloGeo.setAttribute('color', this.haloAttr);
    const halos = new THREE.Points(haloGeo, new THREE.PointsMaterial({
      size: 0.22, sizeAttenuation: true, map: glowTexture(), vertexColors: true, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    halos.renderOrder = 3;
    scene.add(halos);

    // ореол на стене за корпусом: середину закрывает автомат, по краям видно свечение; цвет — в updateBulbs
    const cabH = BODY_H + ARCH_R;
    const backGeo = merge(this.machines.map((mc) =>
      new THREE.PlaneGeometry(W + BACK_GLOW_M * 2, cabH + BACK_GLOW_M * 2).translate(mc.x, cabH / 2, mc.z + BACK_GLOW_Z)));
    this.backCol = new Float32Array(backGeo.getAttribute('position').count * 3);
    this.backAttr = new THREE.BufferAttribute(this.backCol, 3).setUsage(THREE.DynamicDrawUsage);
    backGeo.setAttribute('color', this.backAttr);
    const back = new THREE.Mesh(backGeo, new THREE.MeshBasicMaterial({
      map: glowCardTexture(W, cabH, BACK_GLOW_M, ARCH_R), vertexColors: true, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    back.matrixAutoUpdate = false;
    scene.add(back);
    // отсвет на ковре: ярче всего у цоколя, под самим корпусом не виден
    const pools = this.machines.map((mc, i) => paint(
      new THREE.PlaneGeometry(POOL_W, POOL_D).rotateX(-Math.PI / 2).translate(mc.x, 0.013, mc.z + POOL_D / 2 - 0.2),
      new THREE.Color(COLORS[i % COLORS.length]).multiplyScalar(POOL_K),
    ));
    const pool = new THREE.Mesh(merge(pools), new THREE.MeshBasicMaterial({
      map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    }));
    pool.renderOrder = 2;
    pool.matrixAutoUpdate = false;
    scene.add(pool);
  }

  /** Кто-то дёрнул рычаг: барабаны крутятся к присланным символам, итог — через SPIN_MS. */
  onSpin(msg: SpinMsg, isMine: boolean, puller: Avatar | null): void {
    const mc = this.machines[msg.m];
    if (!mc) return;
    // прошлое вращение ещё не докрутилось (не должно быть: сервер ждёт дольше) — сразу к итогу
    if (mc.spinning) this.settle(mc);
    puller?.pullLever();
    mc.leverT = 0;
    mc.spinning = true;
    mc.spinStart = performance.now();
    mc.mine = isMine;
    mc.tickAcc = 0;
    mc.mode = 'spin';
    this.highlight(mc, -1, 0);
    for (let i = 0; i < mc.reels.length; i++) {
      const r = mc.reels[i];
      const T = REEL_STOP_MS[i] / 1000;
      // время «полного хода»: разгон и торможение идут вдвое медленнее
      const span = T - ACCEL_S / 2 - DECEL_S / 2;
      const from = r.angle;
      const need = from + SPIN_SPEED * span - OVERSHOOT;
      // ближайшее положение символа не раньше, чем через полный оборот хода (символ на ленте дважды)
      let to = Infinity;
      STRIPS[i].forEach((s, k) => {
        if (s !== msg.reels[i]) return;
        const base = (k + 0.5) * CELL;
        to = Math.min(to, base + Math.ceil((need - base) / TAU) * TAU);
      });
      if (!Number.isFinite(to)) to = need;
      r.from = from;
      r.to = to;
      r.speed = (to + OVERSHOOT - from) / span;
      r.stopAt = T;
      r.stopped = false;
    }
    const stake = STAKES[msg.m] ?? 1;
    const mult = msg.jackpot ? JACKPOT_MULT : msg.win / stake;
    mc.reveal = { win: msg.win, mult, line: msg.line, jackpot: msg.jackpot, nick: msg.nick, mine: isMine };
    this.sound.slotSpinStart(isMine ? null : mc.pos);
  }

  /** Ушли с набережной: барабаны — сразу на места, без итогов и звуков (чтобы не догнали по возвращении). */
  reset(): void {
    this.jackpotUntil = 0;
    for (const mc of this.machines) {
      mc.reveal = null;
      if (mc.spinning) this.settle(mc);
      mc.mode = 'idle';
      mc.leverT = -1;
      mc.lever.rotation.x = LEVER_REST;
      mc.occupied = false;
      this.highlight(mc, -1, 0);
    }
  }

  /** Подсветить строку таблицы выплат (−1 — погасить) до времени until. */
  private highlight(mc: Machine, line: number, until: number): void {
    const t = mc.table;
    t.hiUntil = until;
    if (t.hi === line) return;
    t.hi = line;
    drawPaytable(t.ctx, this.machines.indexOf(mc), line);
    t.tex.needsUpdate = true;
  }

  /** Кто-то стоит у автомата: огни горят ровно; свободный зазывает бегущими огнями. */
  setOccupied(m: number, occupied: boolean): void {
    const mc = this.machines[m];
    if (mc) mc.occupied = occupied;
  }

  update(dt: number, time: number, camPos: THREE.Vector3): void {
    const now = performance.now();
    for (const mc of this.machines) {
      if (mc.leverT >= 0) {
        mc.leverT += dt;
        if (mc.leverT >= LEVER_S) mc.leverT = -1;
        mc.lever.rotation.x = mc.leverT < 0 ? LEVER_REST : leverAngle(mc.leverT);
      }
      if (mc.spinning) this.updateSpin(mc, now, dt, camPos);
      if ((mc.mode === 'win' || mc.mode === 'lose') && now >= mc.modeUntil) mc.mode = 'idle';
      if (mc.table.hi >= 0 && now >= mc.table.hiUntil) this.highlight(mc, -1, 0);
    }
    this.updateBulbs(time, now);
  }

  private updateSpin(mc: Machine, now: number, dt: number, camPos: THREE.Vector3): void {
    const t = (now - mc.spinStart) / 1000;
    const where = mc.mine ? null : mc.pos;
    let moving = false;
    for (let i = 0; i < mc.reels.length; i++) {
      const r = mc.reels[i];
      r.angle = reelAngle(r, t);
      r.mesh.rotation.x = r.angle;
      const map = reelSpeed(r, t) > BLUR_SPEED ? r.tex.blur : r.tex.sharp;
      if (r.mat.map !== map) r.mat.map = map;
      if (!r.stopped && t >= r.stopAt) {
        r.stopped = true;
        this.sound.reelStopAt(i, where);
      }
      if (!r.stopped) moving = true;
    }
    // трещотка: свой автомат — всегда, чужой — если рядом
    if (moving && (mc.mine || camPos.distanceTo(_v.set(mc.pos[0], mc.pos[1], mc.pos[2])) < TICK_RANGE)) {
      mc.tickAcc += dt;
      while (mc.tickAcc >= TICK_S) {
        mc.tickAcc -= TICK_S;
        this.sound.reelTickAt(where);
      }
    }
    if (mc.reveal && t >= SPIN_MS / 1000) this.reveal(mc);
    if (t >= REEL_STOP_MS[REEL_STOP_MS.length - 1] / 1000 + SETTLE_S) this.settle(mc);
  }

  /** Всё на свои места: барабаны — на символы, итог (если ещё не показан) — сейчас. */
  private settle(mc: Machine): void {
    for (const r of mc.reels) {
      r.angle = ((r.to % TAU) + TAU) % TAU;
      r.mesh.rotation.x = r.angle;
      r.mat.map = r.tex.sharp;
      r.stopped = true;
    }
    mc.spinning = false;
    if (mc.reveal) this.reveal(mc);
    if (mc.mode === 'spin') mc.mode = 'idle';
  }

  private reveal(mc: Machine): void {
    const rv = mc.reveal;
    mc.reveal = null;
    if (!rv) return;
    const now = performance.now();
    const where = rv.mine ? null : mc.pos;
    if (rv.win > 0) {
      // мелочь (меньше ставки) — пара монет; дальше — больше, чем крупнее выигрыш
      const n = rv.jackpot ? JACKPOT_COINS : rv.mult < 1 ? 3 : Math.min(40, Math.round(6 + rv.mult * 2));
      this.fx.coins(mc.x, 0.4, mc.z + 0.07, n);
      // у джекпота сумма — на крупной надписи поверх экрана
      if (!rv.jackpot) this.fx.floatText(mc.x, 2.08, mc.z + 0.15, `+${rv.win}`, rv.mult < 1 ? '#f3e2bf' : '#ffd34d');
      this.sound.coins(where, n);
      this.sound.slotWinAt(where, rv.mult >= BIG_WIN_MULT ? 2 : rv.mult < 1 ? 0 : 1);
      if (rv.line >= 0) this.highlight(mc, rv.line, now + WIN_LIGHTS_MS + 1500);
      // крупный выигрыш — фонтаны искр по бокам автомата (у джекпота — пока гремит салют)
      if (rv.mult >= BIG_WIN_MULT) {
        const sec = rv.jackpot ? JACKPOT_MS / 1000 : BIG_FOUNTAIN_S;
        for (const dx of FOUNTAIN_DX) this.fx.fountain(mc.x + dx, 0.05, mc.z + 0.2, sec);
        // конфетти из макушки автомата — вверх и к игроку (под крышей павильона)
        this.fx.confetti(mc.x, 2.0, mc.z - 0.25, rv.jackpot ? 160 : 90, 0, 1, 0.45, 0.4, 6.5);
      }
      mc.mode = 'win';
      mc.modeUntil = now + (rv.mult < 1 ? WIN_LIGHTS_MS / 2 : WIN_LIGHTS_MS);
    } else {
      mc.mode = 'lose';
      mc.modeUntil = now + LOSE_DIM_MS;
    }
    if (rv.jackpot) {
      this.jackpotUntil = now + JACKPOT_MS;
      this.sound.siren();
      this.fx.fireworks(FIREWORKS_AT, 8);
      for (const [x, y, z] of CANNONS) this.fx.confetti(x, y, z, 260, 0, 0.75, 0.66, 0.35, 14);
      this.world.jackpotBoard.flash(JACKPOT_MS / 1000);
      this.onJackpot(rv.nick, rv.win);
    }
  }

  private updateBulbs(t: number, now: number): void {
    const jackpot = now < this.jackpotUntil;
    const perMachine = this.backCol.length / this.machines.length;
    let k = 0;
    for (const [m, mc] of this.machines.entries()) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let j = 0; j < BULBS; j++, k++) {
        if (jackpot) {
          // весь зал мигает разноцветным
          _c.setHSL((t * 0.6 + j / BULBS) % 1, 0.85, 0.6).multiplyScalar((Math.floor(t * 8) + j) % 2 === 0 ? 1 : 0.12);
        } else {
          _c.copy(BULB_ON).multiplyScalar(bulbLevel(mc, j, t, now));
        }
        this.bulbs.setColorAt(k, _c);
        this.haloCol[k * 3] = _c.r * 0.5;
        this.haloCol[k * 3 + 1] = _c.g * 0.5;
        this.haloCol[k * 3 + 2] = _c.b * 0.5;
        r += _c.r;
        g += _c.g;
        b += _c.b;
      }
      // ореол на стене — средний свет лампочек этого автомата
      const kk = BACK_GLOW_K / BULBS;
      for (let i = m * perMachine; i < (m + 1) * perMachine; i += 3) {
        this.backCol[i] = r * kk;
        this.backCol[i + 1] = g * kk;
        this.backCol[i + 2] = b * kk;
      }
    }
    if (this.bulbs.instanceColor) this.bulbs.instanceColor.needsUpdate = true;
    this.haloAttr.needsUpdate = true;
    this.backAttr.needsUpdate = true;
  }
}

// ------------------------------------------------------------ движение

/** Угол барабана через t с после рывка: разгон, ровный ход, торможение до to + перелёт, отскок на to. */
function reelAngle(r: Reel, t: number): number {
  const T = r.stopAt;
  const w = r.speed;
  if (t < ACCEL_S) return r.from + (0.5 * w * t * t) / ACCEL_S;
  if (t < T - DECEL_S) return r.from + w * (t - ACCEL_S / 2);
  if (t < T) {
    const s = t - (T - DECEL_S);
    return r.from + w * (T - DECEL_S - ACCEL_S / 2) + w * (s - (s * s) / (2 * DECEL_S));
  }
  const u = Math.min(1, (t - T) / SETTLE_S);
  return r.to + OVERSHOOT * (1 - u * u * (3 - 2 * u));
}

function reelSpeed(r: Reel, t: number): number {
  const T = r.stopAt;
  if (t < ACCEL_S) return (r.speed * t) / ACCEL_S;
  if (t < T - DECEL_S) return r.speed;
  if (t < T) return r.speed * (1 - (t - (T - DECEL_S)) / DECEL_S);
  return 0;
}

/** Рычаг: рывок вниз, короткая пауза, возврат пружиной с лёгким перелётом назад. */
function leverAngle(t: number): number {
  let f: number;
  if (t < 0.12) f = Math.sin((t / 0.12) * (Math.PI / 2));
  else if (t < 0.18) f = 1;
  else {
    const u = Math.min(1, (t - 0.18) / (LEVER_S - 0.18));
    f = (1 - u) * (1 - u) * Math.cos(u * Math.PI * 1.5);
  }
  return LEVER_REST + (LEVER_PULL - LEVER_REST) * f;
}

/** Яркость лампочки j: крутится — быстрые бегущие огни, выигрыш — ещё быстрее, проигрыш — притухли. */
function bulbLevel(mc: Machine, j: number, t: number, now: number): number {
  const chase = (speed: number, period: number, on: number) => (((j - t * speed) % period) + period) % period < on;
  switch (mc.mode) {
    case 'spin':
      return chase(18, 3, 1) ? 1 : 0.3;
    case 'win':
      return chase(34, 4, 2) ? 1 : Math.floor(t * 10) % 2 ? 0.35 : 0.15;
    case 'lose':
      return 0.18 + 0.5 * (1 - (mc.modeUntil - now) / LOSE_DIM_MS);
    default:
      // занят — горят ровно; свободен — зазывают
      return mc.occupied ? 0.78 + 0.08 * Math.sin(t * 2.4 + j * 0.7) : chase(5, 6, 2) ? 0.95 : 0.32;
  }
}

/** Положение лампочки j на лицевой панели (x, y). */
function bulbLocal(j: number): [number, number] {
  const n = SIDE_BULB_YS.length;
  if (j < n) return [-BULB_R, SIDE_BULB_YS[j]];
  j -= n;
  if (j < ARCH_BULBS) {
    const a = Math.PI - (j / (ARCH_BULBS - 1)) * Math.PI;
    return [BULB_R * Math.cos(a), BODY_H + BULB_R * Math.sin(a)];
  }
  j -= ARCH_BULBS;
  return [BULB_R, SIDE_BULB_YS[n - 1 - j]];
}

/** Барабаны до первого вращения: у каждого автомата свои символы, у всех игроков одинаковые. */
function idleAngle(m: number, r: number): number {
  return (Math.floor(makeRng(m * 31 + r * 7 + 3)() * CELLS) + 0.5) * CELL;
}

// ------------------------------------------------------------ ленты барабанов

/** Лента барабана i: 6 символов по два раза, одинаковые не рядом (и через стык). */
function makeStrip(i: number): number[] {
  const rng = makeRng(0x51075 + i * 977);
  for (;;) {
    const a = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5];
    for (let k = a.length - 1; k > 0; k--) {
      const j = Math.floor(rng() * (k + 1));
      [a[k], a[j]] = [a[j], a[k]];
    }
    if (a.every((s, k) => s !== a[(k + 1) % a.length])) return a;
  }
}

const STRIPS = REEL_XS.map((_, i) => makeStrip(i));

/** Лента на холсте (клетка k — снизу вверх, как идёт угол) и её смазанная копия для быстрого хода. */
function stripTextures(strip: number[]): StripTex {
  const w = 256;
  const cell = 128;
  const h = cell * CELLS;
  const [c, ctx] = canvas(w, h);
  // бумага ленты: к краям барабана темнее
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, '#d6c8aa');
  g.addColorStop(0.2, '#f7f0e0');
  g.addColorStop(0.8, '#f7f0e0');
  g.addColorStop(1, '#d6c8aa');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  for (let k = 0; k < CELLS; k++) {
    const top = h - (k + 1) * cell;
    ctx.fillStyle = 'rgba(120, 96, 60, 0.35)';
    ctx.fillRect(0, top, w, 2);
    drawSymbol(ctx, strip[k], w / 2, top + cell / 2, 108);
  }
  // смаз по вертикали: среднее из сдвинутых копий (лента замкнута — рисуем с переносом)
  const [b, bx] = canvas(w, h);
  bx.globalCompositeOperation = 'lighter';
  const taps = 10;
  bx.globalAlpha = 1 / taps;
  for (let i = 0; i < taps; i++) {
    const dy = Math.round((i / (taps - 1) - 0.5) * 120);
    bx.drawImage(c, 0, dy);
    bx.drawImage(c, 0, dy - h);
    bx.drawImage(c, 0, dy + h);
  }
  return { sharp: tex(c), blur: tex(b) };
}

/** Боковина барабана без торцов: v — по окружности (угол / 2π), u — поперёк. Перед (угол 0) смотрит в +z. */
function reelGeometry(): THREE.BufferGeometry {
  const seg = 48;
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * TAU;
    const sy = Math.sin(a);
    const cz = Math.cos(a);
    for (let side = 0; side < 2; side++) {
      pos.push(side ? REEL_W / 2 : -REEL_W / 2, sy * REEL_R, cz * REEL_R);
      nor.push(0, sy, cz);
      uv.push(side, i / seg);
    }
  }
  for (let i = 0; i < seg; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// ------------------------------------------------------------ корпус

/** Корпус: прямоугольник с полукругом, скруглённые кромки, сквозное окно под барабаны. */
function cabinetGeometry(): THREE.BufferGeometry {
  // фаска добавляется снаружи контура — сам контур меньше на её размер
  const hw = W / 2 - BEVEL;
  const s = new THREE.Shape();
  s.moveTo(-hw, BEVEL);
  s.lineTo(hw, BEVEL);
  s.lineTo(hw, BODY_H);
  s.absarc(0, BODY_H, ARCH_R - BEVEL, 0, Math.PI, false);
  s.lineTo(-hw, BEVEL);
  // у отверстия фаска внутрь: на лицевой стороне оно шире на её размер, внутри — ровно окно
  const hx = WIN_W / 2 + BEVEL;
  const hy = WIN_H / 2 + BEVEL;
  const hole = new THREE.Path();
  hole.moveTo(-hx, WIN_Y - hy);
  hole.lineTo(hx, WIN_Y - hy);
  hole.lineTo(hx, WIN_Y + hy);
  hole.lineTo(-hx, WIN_Y + hy);
  hole.lineTo(-hx, WIN_Y - hy);
  s.holes.push(hole);
  const depth = DEPTH - 2 * BEVEL;
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL, bevelSegments: 3, curveSegments: 28 });
  g.translate(0, 0, -(depth + BEVEL));
  return g;
}

/** Хромированная рамка окна. */
function bezelGeometry(): THREE.BufferGeometry {
  const s = roundedRect(-0.37, WIN_Y - 0.2, 0.74, 0.4, 0.04);
  const hole = new THREE.Path();
  hole.moveTo(-WIN_W / 2, WIN_Y - WIN_H / 2);
  hole.lineTo(WIN_W / 2, WIN_Y - WIN_H / 2);
  hole.lineTo(WIN_W / 2, WIN_Y + WIN_H / 2);
  hole.lineTo(-WIN_W / 2, WIN_Y + WIN_H / 2);
  hole.lineTo(-WIN_W / 2, WIN_Y - WIN_H / 2);
  s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 6 });
  g.translate(0, 0, 0.008);
  return g;
}

/** Табличка-полукруг над окном; uv — в свою строку атласа табличек. */
function signGeometry(i: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(SIGN_R, 0);
  s.absarc(0, 0, SIGN_R, 0, Math.PI, false);
  s.lineTo(SIGN_R, 0);
  const g = new THREE.ShapeGeometry(s, 32);
  const p = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  const rows = COLORS.length;
  for (let k = 0; k < p.count; k++) {
    const u = (p.getX(k) + SIGN_R) / (2 * SIGN_R);
    const v = p.getY(k) / SIGN_R;
    uv.setXY(k, u, 1 - (i + 1) / rows + v / rows);
  }
  g.translate(0, SIGN_Y, 0.004);
  return g;
}

function roundedRect(x: number, y: number, w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(list.map((x) => (x.index ? x.toNonIndexed() : x)), false);
  if (!g) throw new Error('slots3d: геометрия не склеилась');
  return g;
}

// ------------------------------------------------------------ холсты

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Таблички всех автоматов в одном атласе (512 × 256 на каждую): лучи, кант, название, ставка. */
function signAtlas(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(512, S * COLORS.length);
  COLORS.forEach((hex, i) => {
    ctx.save();
    ctx.translate(0, i * S);
    ctx.beginPath();
    ctx.rect(0, 0, 512, S);
    ctx.clip();
    const base = new THREE.Color(hex);
    ctx.fillStyle = base.clone().multiplyScalar(0.18).getStyle();
    ctx.fillRect(0, 0, 512, S);
    // лучи от середины снизу
    ctx.fillStyle = base.clone().multiplyScalar(0.34).getStyle();
    for (let k = 0; k < 18; k++) {
      const a0 = Math.PI + (k / 18) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(256, S);
      ctx.arc(256, S, 300, a0, a0 + Math.PI / 36);
      ctx.closePath();
      ctx.fill();
    }
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#e8b64a';
    ctx.beginPath();
    ctx.arc(256, S, 245, Math.PI, 0);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#7a4a10';
    ctx.beginPath();
    ctx.arc(256, S, 231, Math.PI, 0);
    ctx.stroke();
    // название
    const name = MACHINE_NAMES[i].toUpperCase();
    let size = 76;
    ctx.font = `900 ${size}px ${FONT}`;
    while (ctx.measureText(name).width > 330 && size > 30) {
      size -= 2;
      ctx.font = `900 ${size}px ${FONT}`;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 9;
    ctx.strokeStyle = '#2a1004';
    ctx.strokeText(name, 256, 150);
    const g = ctx.createLinearGradient(0, 150 - size / 2, 0, 150 + size / 2);
    g.addColorStop(0, '#fff3b8');
    g.addColorStop(1, '#ffb22a');
    ctx.fillStyle = g;
    ctx.fillText(name, 256, 150);
    // ставка: монетка и число
    const stake = String(STAKES[i]);
    ctx.font = `800 40px ${FONT}`;
    const x0 = 256 - (46 + ctx.measureText(stake).width) / 2;
    coinIcon(ctx, x0 + 18, 214, 17);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffe9c2';
    ctx.fillText(stake, x0 + 46, 216);
    ctx.restore();
  });
  return tex(c);
}

/**
 * Таблица выплат автомата m на нижней панели (1024 × 480): две колонки, сверху вниз по убыванию выплаты, суммы —
 * в жетонах. «–» — любой символ; «вперемешку» — эти символы в любом порядке. hi — подсвеченная строка, −1 — нет.
 */
function drawPaytable(ctx: CanvasRenderingContext2D, m: number, hi: number): void {
  const w = 1024;
  const h = 480;
  ctx.fillStyle = '#1d130d';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#c99a3e';
  ctx.lineWidth = 10;
  ctx.strokeRect(12, 12, w - 24, h - 24);
  ctx.lineWidth = 3;
  ctx.strokeRect(28, 28, w - 56, h - 56);
  const rows = PAYTABLES[m];
  const per = Math.ceil(rows.length / 2);
  const top = 46;
  const rh = (h - 2 * top) / per;
  const size = Math.min(54, rh * 0.62);
  rows.forEach((l, k) => {
    const x = 62 + Math.floor(k / per) * 470;
    const y = top + rh * ((k % per) + 0.5);
    if (k === hi) {
      ctx.fillStyle = 'rgba(255, 196, 64, 0.3)';
      ctx.strokeStyle = '#ffcf4a';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect(x - 22, y - rh / 2 + 5, 440, rh - 10, 14);
      ctx.fill();
      ctx.stroke();
    }
    const mixed = l.kind === 'mix';
    const s = mixed ? size * 0.8 : size;
    const sy = mixed ? y - rh * 0.11 : y;
    const syms = l.kind === 'triple' ? [l.syms[0], l.syms[0], l.syms[0]] : l.kind === 'pair' ? [l.syms[0], l.syms[0]] : l.kind === 'left' ? [l.syms[0], -1, -1] : l.syms;
    syms.forEach((sym, q) => {
      const cx = x + s * 0.55 + q * s * 1.1;
      if (sym >= 0) {
        drawSymbol(ctx, sym, cx, sy, s);
        return;
      }
      ctx.strokeStyle = '#8a7350';
      ctx.lineWidth = s * 0.09;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.2, sy);
      ctx.lineTo(cx + s * 0.2, sy);
      ctx.stroke();
    });
    if (mixed) {
      ctx.font = `600 ${Math.round(rh * 0.22)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#c9b48a';
      ctx.fillText('вперемешку', x + s * 1.65, y + rh * 0.3);
    }
    const jackpot = k === 0;
    const label = jackpot ? 'ДЖЕКПОТ' : String(l.win);
    ctx.font = `800 ${Math.round(jackpot ? size * 0.6 : size * 0.86)}px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = jackpot ? '#ffcf4a' : '#f3e2bf';
    ctx.fillText(label, x + 396, y + 2);
    if (!jackpot) coinIcon(ctx, x + 396 - ctx.measureText(label).width - size * 0.36, y, size * 0.24);
  });
}

/** Тень в окне: барабан темнеет к верху и низу, тёмные щели между барабанами. */
function shadeTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 128);
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(0,0,0,0.92)');
  g.addColorStop(0.3, 'rgba(0,0,0,0)');
  g.addColorStop(0.7, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.92)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = 'rgba(8,5,3,0.9)';
  for (const u of [0.339, 0.661]) ctx.fillRect(u * 256 - 4, 0, 8, 128);
  ctx.fillRect(0, 0, 8, 128);
  ctx.fillRect(248, 0, 8, 128);
  return tex(c);
}

/** Стекло: блик наискосок и линия выигрыша с треугольничками по краям. */
function glassTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 128);
  ctx.save();
  ctx.translate(128, 64);
  ctx.rotate(-0.5);
  const g = ctx.createLinearGradient(-60, 0, 60, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.1)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.16)');
  g.addColorStop(0.62, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(-60, -200, 120, 400);
  ctx.restore();
  ctx.fillStyle = 'rgba(255, 60, 40, 0.7)';
  ctx.fillRect(10, 62, 236, 3);
  ctx.fillStyle = '#ffcf4a';
  ctx.beginPath();
  ctx.moveTo(0, 54);
  ctx.lineTo(12, 63.5);
  ctx.lineTo(0, 73);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(256, 54);
  ctx.lineTo(244, 63.5);
  ctx.lineTo(256, 73);
  ctx.fill();
  return tex(c);
}

function coinIcon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
  g.addColorStop(0, '#fff2b0');
  g.addColorStop(0.6, '#ffc93a');
  g.addColorStop(1, '#b07800');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#8a5a00';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.62, 0, TAU);
  ctx.stroke();
}

// ------------------------------------------------------------ символы (рисуются в квадрате 100 × 100)

/** Символ s в квадрате size × size с центром (cx, cy): вишня, лимон, колокол, якорь, звезда, семёрка. */
function drawSymbol(ctx: CanvasRenderingContext2D, s: number, cx: number, cy: number, size: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(size / 100, size / 100);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (s === 0) cherry(ctx);
  else if (s === 1) lemon(ctx);
  else if (s === 2) bell(ctx);
  else if (s === 3) anchor(ctx);
  else if (s === 4) star(ctx);
  else seven(ctx);
  ctx.restore();
}

function gloss(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot: number, a = 0.65): void {
  ctx.fillStyle = `rgba(255,255,255,${a})`;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
  ctx.fill();
}

function cherry(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = '#2f6b22';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-18, 10);
  ctx.quadraticCurveTo(-14, -18, 6, -34);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(18, 16);
  ctx.quadraticCurveTo(14, -10, 6, -34);
  ctx.stroke();
  const lg = ctx.createLinearGradient(6, -46, 34, -26);
  lg.addColorStop(0, '#8fd45a');
  lg.addColorStop(1, '#2f7a24');
  ctx.fillStyle = lg;
  ctx.beginPath();
  ctx.ellipse(20, -37, 15, 7, -0.45, 0, TAU);
  ctx.fill();
  for (const [x, y] of [[-18, 22], [18, 28]] as const) {
    const g = ctx.createRadialGradient(x - 6, y - 6, 2, x, y, 18);
    g.addColorStop(0, '#ff8a7e');
    g.addColorStop(0.45, '#e01a2c');
    g.addColorStop(1, '#7a0412');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, 17, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#5a020c';
    ctx.lineWidth = 2;
    ctx.stroke();
    gloss(ctx, x - 6, y - 7, 5, 3, -0.6);
  }
}

function lemon(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.rotate(-0.35);
  const g = ctx.createRadialGradient(-12, -10, 3, 0, 0, 44);
  g.addColorStop(0, '#fffbd2');
  g.addColorStop(0.45, '#ffe02e');
  g.addColorStop(1, '#cf9a00');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-44, 0);
  ctx.quadraticCurveTo(-40, -6, -34, -10);
  ctx.bezierCurveTo(-24, -32, 24, -32, 34, -10);
  ctx.quadraticCurveTo(40, -6, 44, 0);
  ctx.quadraticCurveTo(40, 6, 34, 10);
  ctx.bezierCurveTo(24, 32, -24, 32, -34, 10);
  ctx.quadraticCurveTo(-40, 6, -44, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#a07400';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  gloss(ctx, -12, -13, 12, 4.5, -0.15, 0.6);
  ctx.restore();
}

function bell(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = '#6e4400';
  ctx.lineWidth = 2.5;
  // язычок под колоколом
  ctx.fillStyle = '#7a4c00';
  ctx.beginPath();
  ctx.arc(0, 36, 7, 0, TAU);
  ctx.fill();
  const g = ctx.createLinearGradient(-36, 0, 36, 0);
  g.addColorStop(0, '#9a6400');
  g.addColorStop(0.35, '#ffe68a');
  g.addColorStop(0.6, '#ffc933');
  g.addColorStop(1, '#9a6400');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-6, -34);
  ctx.bezierCurveTo(-22, -33, -26, -12, -27, 6);
  ctx.bezierCurveTo(-28, 18, -36, 24, -38, 29);
  ctx.lineTo(38, 29);
  ctx.bezierCurveTo(36, 24, 28, 18, 27, 6);
  ctx.bezierCurveTo(26, -12, 22, -33, 6, -34);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // обод и ушко
  ctx.fillStyle = '#d99a14';
  ctx.beginPath();
  ctx.ellipse(0, 29, 39, 6, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#e0a820';
  ctx.beginPath();
  ctx.arc(0, -38, 6, 0, TAU);
  ctx.fill();
  ctx.stroke();
  gloss(ctx, -12, -8, 4, 14, 0.15, 0.55);
}

function anchor(ctx: CanvasRenderingContext2D): void {
  const draw = (color: string, w: number) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.arc(0, -35, 8, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -27);
    ctx.lineTo(0, 34);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-20, -16);
    ctx.lineTo(20, -16);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 4, 30, 0.12, Math.PI - 0.12);
    ctx.stroke();
  };
  draw('#173a5c', 11);
  draw('#2f6fa8', 7);
  // лапы
  ctx.fillStyle = '#2f6fa8';
  ctx.strokeStyle = '#173a5c';
  ctx.lineWidth = 2;
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(sx * 30, -2);
    ctx.lineTo(sx * 40, 14);
    ctx.lineTo(sx * 22, 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-2, -22);
  ctx.lineTo(-2, 24);
  ctx.stroke();
}

function star(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createRadialGradient(-8, -10, 3, 0, 0, 46);
  g.addColorStop(0, '#fff7c2');
  g.addColorStop(0.5, '#ffcf2e');
  g.addColorStop(1, '#ff8400');
  ctx.fillStyle = g;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 19 : 45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r + 3;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#a84e00';
  ctx.lineWidth = 3;
  ctx.stroke();
  gloss(ctx, -9, -8, 7, 3.5, -0.5, 0.6);
}

function seven(ctx: CanvasRenderingContext2D): void {
  ctx.font = `900 96px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 16;
  ctx.strokeStyle = '#ffd34d';
  ctx.strokeText('7', 0, 6);
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#4a0006';
  ctx.strokeText('7', 0, 6);
  const g = ctx.createLinearGradient(0, -40, 0, 44);
  g.addColorStop(0, '#ff7a5e');
  g.addColorStop(0.5, '#e3101e');
  g.addColorStop(1, '#8a0008');
  ctx.fillStyle = g;
  ctx.fillText('7', 0, 6);
}

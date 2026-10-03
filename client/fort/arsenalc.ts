// Арсенал «Крепости» на клиенте (агент arsenal): две руки (1 / 2 / колесо), гранаты (G: держишь — дуга, отпустил —
// бросок), предсказание стволов и лестниц (тот же shared/fortgun.ts, что у сервера), немодальная лавка у прилавка,
// панели ворот, кристалла и мест башен (1–9, E, Esc, отойти — закрыть), подсказки и таблички стоек, события арсенала
// (золото, общак, крит, выстрелы тяжёлых стволов, гранаты, башни, смола, огонь), цифры урона и золота из пула.
// Матч (match.ts) зовёт сюда в нужных местах; сам решает только своё (движение, камера, орда).
import * as THREE from 'three';
import { EYE_HEIGHT, TICK_RATE } from '../../shared/constants.ts';
import { FORT_MAX_ALIVE, FT_BREAK, FT_END, FT_GATHER, FT_WAVE, type FortEvent, type FortPlayerRow } from '../../shared/fort.ts';
import { FT_STRIDE, fortShotDir, nearestZombie } from '../../shared/fortaim.ts';
import {
  ACT_SHOP, ACT_TOWER, GREN_CD, GREN_FUSE, GUNS, GUN_CROSSBOW, GUN_MARKER, GUN_SHOTGUN, NOPE_FAR, NOPE_GOLD, TOWERS, TOWER_UPGRADE, UP_DMG,
  UP_POUCH, crystalMax, crystalRows, decodeArsenalTail, dmgMul, gateMax, gateRows, grenadeMax, gunMag, gunReload, makeArsenalRow,
  makeArsenalTail, shopRows, towerRows, towerUpgradePrice, type ArsenalRow, type Loadout, type PanelRow,
} from '../../shared/fortarsenal.ts';
import { grenadeLaunch, grenadeStep, makeGrenade, type Grenade } from '../../shared/fortgren.ts';
import {
  BTN_FT_GRENADE, BTN_FT_HEAVY, BTN_FT_NOTHROW, HEAVY_IN_HANDS, fortAfter, fortBefore, fortSpread, gunInHands, holsteredAmmo, makeFortStep,
} from '../../shared/fortgun.ts';
import { TOWER_SPOTS, type FortMap, type FortStation } from '../../shared/fortmap.ts';
import { clamp } from '../../shared/math.ts';
import { SHOT_RANGE, applySpread, type Input, type PlayerState, type StepEvents } from '../../shared/sim.ts';
import { makeRayHit, type CollisionWorld } from '../../shared/world.ts';
import type { Sound } from '../audio.ts';
import type { Input as InputDevice } from '../input.ts';
import type { Net } from '../net.ts';
import type { Avatar } from '../render/avatar.ts';
import type { Effects } from '../render/effects.ts';
import { TOUCH } from '../touch.ts';
import { avatarMuzzle, setAvatarGun, type Arsenal3D } from './arsenal3d.ts';
import type { FortHud } from './hud.ts';
import { FortSfx } from './sfx.ts';
import type { Zombies3D } from './zombies3d.ts';

/** Что арсеналу нужно от матча */
export interface ArsenalHost {
  myId(): number;
  phase(): number;
  wave(): number;
  alive(): boolean;
  state(): PlayerState;
  seed(): number;
  row(id: number): FortPlayerRow | undefined;
  rows(): readonly FortPlayerRow[];
  gate(): number;
  crystal(): number;
  colorOf(id: number): number;
  camPos(): THREE.Vector3;
  shoulder(): number;
  avatar(id: number): Avatar | undefined;
  localAvatar(): Avatar;
  shake(k: number): void;
  renderTick(): number;
  yaw(): number;
  pitch(): number;
}

export interface ArsenalDeps {
  map: FortMap;
  collision: CollisionWorld;
  arsenal3d: Arsenal3D;
  effects: Effects;
  zombies: Zombies3D;
  hud: FortHud;
  sound: Sound;
  input: InputDevice;
  net: Net;
  canvas: HTMLCanvasElement;
}

/** Номер «стрелка» башни в событиях (250 + место) */
export const TOWER_BY = 250;
/** Панель закрывается, если отойти от стойки дальше */
const CLOSE_DIST = 4;
const GUN_ICONS = ['mag', 'shotgun', 'crossbow', 'mg'];
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

interface GrenVis {
  gid: number;
  pid: number;
  g: Grenade;
  slot: number;
  ticks: number;
  acc: number;
  born: number;
  spin: number;
}

export class ArsenalClient {
  private readonly d: ArsenalDeps;
  private readonly host: ArsenalHost;
  readonly sfx: FortSfx;
  private readonly fstep = makeFortStep();
  readonly load: Loadout = { heavy: 0, rate: 0, mag: 0 };
  private row: ArsenalRow = makeArsenalRow();
  private readonly tail = makeArsenalTail();
  private wantHeavy = false;
  private grenHeld = false;
  private noThrow = false;
  private grenLocalReady = 0;
  private freeCursor = false;
  private lockedAtOpen = false;
  private station: FortStation | null = null;
  private pending: number | null = null;
  private pendingAt = 0;
  private rowsAt = -1;
  private rows: PanelRow[] = [];
  private readonly crits = new Map<number, number>();
  private readonly grenades: GrenVis[] = [];
  private readonly arcPts = new Float32Array(48 * 3);
  private readonly arcG = makeGrenade();
  private readonly hit = makeRayHit();
  private readonly near = { t: 0 };
  private readonly tg = new Float64Array(FORT_MAX_ALIVE * FT_STRIDE);
  private readonly dir = { dirX: 0, dirY: 0, dirZ: -1 };
  private readonly pd = { dirX: 0, dirY: 0, dirZ: -1 };
  private time = 0;
  private wheelAt = 0;
  private rungAt = 0;
  private readonly zombieAt = (zid: number, out: THREE.Vector3): boolean => this.d.zombies.where(zid, out);
  private readonly onWheel = (e: WheelEvent): void => {
    if (!this.d.input.locked || TOUCH || !this.host.alive() || this.load.heavy <= 0) return;
    if (Math.abs(e.deltaY) < 1 || this.time - this.wheelAt < 0.12) return;
    this.wheelAt = this.time;
    this.wantHeavy = !this.wantHeavy;
  };
  private readonly onCanvasDown = (): void => {
    if (this.freeCursor) void this.d.input.lock();
  };
  /** Esc у открытой панели: закрыть только её; меню игры не трогать (дальше событие не идёт) */
  private readonly escCapture = (e: KeyboardEvent): void => {
    if (e.code !== 'Escape' || !this.d.hud.stall.shown) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    this.closePanel();
  };

  constructor(d: ArsenalDeps, host: ArsenalHost) {
    this.d = d;
    this.host = host;
    this.sfx = new FortSfx(d.sound);
    window.addEventListener('wheel', this.onWheel, { passive: true });
    d.canvas.addEventListener('mousedown', this.onCanvasDown);
    d.hud.stall.onBuy = (id) => this.buy(id);
    d.hud.stall.onClose = () => this.closePanel();
    d.arsenal3d.reset();
    d.hud.floaters.clear();
  }

  dispose(): void {
    window.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('keydown', this.escCapture, true);
    this.d.canvas.removeEventListener('mousedown', this.onCanvasDown);
    this.closePanel();
    this.d.hud.stall.onBuy = () => {};
    this.d.hud.stall.onClose = () => {};
    this.d.hud.setResume(false);
    this.d.arsenal3d.hideArc();
    for (const g of this.grenades) this.d.arsenal3d.hideGrenade(g.slot);
    this.grenades.length = 0;
  }

  // ------------------------------------------------------------ предсказание

  before(s: PlayerState, inp: Input): Input {
    return fortBefore(this.fstep, s, inp, this.load);
  }

  after(s: PlayerState, ev: StepEvents): void {
    fortAfter(this.fstep, s, ev, true, this.host.seed());
  }

  /** Свои биты входа: рука, зажатая G, «отпустил без броска» (один тик) */
  buttons(): number {
    let b = 0;
    if (this.wantHeavy && this.load.heavy > 0) b |= BTN_FT_HEAVY;
    if (this.grenHeld) b |= BTN_FT_GRENADE;
    if (this.noThrow) {
      b |= BTN_FT_NOTHROW;
      this.noThrow = false;
    }
    return b;
  }

  /** Ввод заблокирован (чат, меню) или мышь ушла — гранату не бросаем, просто отпускаем */
  cancelGrenade(): void {
    if (!this.grenHeld) return;
    this.grenHeld = false;
    this.noThrow = true;
    this.d.arsenal3d.hideArc();
  }

  /** События своего шага (живой тик, не переигровка): смена ствола, бросок, лестница */
  onLocalStep(): void {
    const ev = this.fstep.ev;
    if (ev.swapped) this.sfx.swap(ev.gun !== GUN_MARKER);
    if (ev.release) this.localThrow();
    if (ev.ladder >= 0) {
      const s = this.host.state();
      if (Math.abs(s.vy) > 0.5 && this.time - this.rungAt > 0.28) {
        this.rungAt = this.time;
        this.sfx.rung();
      }
    }
  }

  /** Ствол в руках по предсказанию */
  get gun(): number {
    return gunInHands(this.host.state(), this.load);
  }

  spread(s: PlayerState, ads: boolean): number {
    return fortSpread(s, ads, this.load);
  }

  /** Во сколько раз приближает прицел ствол в руках */
  zoom(): number {
    return GUNS[this.gun]?.zoom ?? 1.25;
  }

  /** Патроны для полоски пейнтбола: магазин и доля перезарядки (null — не перезаряжается) */
  ammo(s: PlayerState): [number, number | null] {
    const gun = gunInHands(s, this.load);
    const mag = gunMag(gun, this.load.mag);
    const full = gunReload(gun, this.load.rate);
    return [mag, s.reloadT > 0 ? clamp(1 - s.reloadT / full, 0, 1) : null];
  }

  // ------------------------------------------------------------ состав и хвост

  setRoster(): void {
    const me = this.host.row(this.host.myId());
    this.row = me?.ar ?? makeArsenalRow();
    const had = this.load.heavy;
    this.load.heavy = this.row.hv;
    this.load.rate = this.row.lv[1] ?? 0;
    this.load.mag = this.row.lv[2] ?? 0;
    // купили первый тяжёлый ствол — сразу в руки
    if (!had && this.load.heavy > 0) this.wantHeavy = true;
    if (this.load.heavy <= 0) this.wantHeavy = false;
    this.rowsAt = -1;
  }

  /** Блок арсенала после зомби в хвосте снимка */
  applyTail(buf: ArrayBuffer, at: number): void {
    if (!decodeArsenalTail(buf, at, this.tail)) return;
    this.d.arsenal3d.setTowers(this.tail.type, this.tail.level);
    this.d.arsenal3d.setTar(this.tail.tar);
  }

  /** Ступени укрепления ворот и кристалла (для полосы сверху) */
  get gateTier(): number {
    return this.tail.gateTier;
  }

  get crystalTier(): number {
    return this.tail.crystalTier;
  }

  get gateMax(): number {
    return gateMax(this.tail.gateTier);
  }

  get crystalMax(): number {
    return crystalMax(this.tail.crystalTier);
  }

  private teamDmg(): number {
    const rows = this.host.rows();
    if (!rows.length) return 1;
    let s = 0;
    for (const r of rows) s += dmgMul(r.ar?.lv[UP_DMG] ?? 0);
    return s / rows.length;
  }

  // ------------------------------------------------------------ клавиши

  get cursorFree(): boolean {
    return this.freeCursor;
  }

  onKey(code: string, down: boolean, e: KeyboardEvent): boolean {
    const { input, hud } = this.d;
    if (down && this.freeCursor && code !== 'Escape' && !TOUCH) {
      // любая клавиша — жест пользователя: мышь снова в игру
      void input.lock();
    }
    const digit = /^(?:Digit|Numpad)([1-9])$/.exec(code);
    if (hud.stall.shown) {
      if (down && digit && !e.repeat) {
        e.preventDefault();
        const id = hud.stall.idAt(Number(digit[1]));
        if (id >= 0) this.buy(id);
        return true;
      }
      if (down && code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.closePanel();
        return true;
      }
    }
    if (code === 'KeyG') {
      if (!down) {
        if (this.grenHeld) {
          this.grenHeld = false;
          this.d.arsenal3d.hideArc();
        }
        return true;
      }
      if (!e.repeat && this.host.alive() && (input.locked || TOUCH)) this.grenHeld = true;
      return true;
    }
    if (!down || e.repeat || !(input.locked || TOUCH)) return false;
    if (digit && (digit[1] === '1' || digit[1] === '2')) {
      if (digit[1] === '1') this.wantHeavy = false;
      else if (this.load.heavy > 0) this.wantHeavy = true;
      else hud.pb.bannerMessage('🔫 Второй ствол — в лавке на террасе: дробовик, арбалет или пулемёт', 2400);
      return true;
    }
    return false;
  }

  /** Телефон: кнопка смены ствола */
  toggleGun(): void {
    if (this.load.heavy > 0) this.wantHeavy = !this.wantHeavy;
  }

  // ------------------------------------------------------------ панель (лавка, ворота, кристалл, башни)

  /** E у стойки: открыть панель (true — наша стойка) или закрыть открытую */
  use(st: FortStation | null): boolean {
    const stall = this.d.hud.stall;
    if (stall.shown) {
      this.closePanel();
      return true;
    }
    if (!st || (st.kind !== 'shop' && st.kind !== 'gate' && st.kind !== 'crystal' && st.kind !== 'tower')) return false;
    if (this.host.phase() === FT_END) return true;
    this.station = st;
    const title = st.kind === 'shop' ? 'Лавка оружейника' : st.kind === 'gate' ? 'Ворота' : st.kind === 'crystal' ? 'Кристалл' : TOWER_SPOTS[st.arg]?.name ?? 'Башня';
    stall.open(st.kind, title, this.panelSub(st));
    this.lockedAtOpen = this.d.input.locked;
    this.rowsAt = -1;
    this.pending = null;
    window.addEventListener('keydown', this.escCapture, true);
    this.renderPanel(true);
    return true;
  }

  private panelSub(st: FortStation): string {
    const calm = this.calm;
    if (st.kind === 'shop') return calm ? 'Покупки — до конца этой игры' : 'Работает и в бою — не стой на месте';
    if (st.kind === 'gate') return `Прочность ${Math.round(this.host.gate())} из ${this.gateMax}`;
    if (st.kind === 'crystal') return `Прочность ${Math.round(this.host.crystal())} из ${this.crystalMax}`;
    const type = this.tail.type[st.arg] ?? -1;
    return type < 0 ? 'Пусто · башня общая: награда — тем, кто вложился' : `${TOWERS[type].name} · уровень ${this.tail.level[st.arg]}`;
  }

  closePanel(): void {
    window.removeEventListener('keydown', this.escCapture, true);
    this.d.hud.stall.close();
    this.station = null;
    this.pending = null;
  }

  private get calm(): boolean {
    const ph = this.host.phase();
    return ph === FT_GATHER || ph === FT_BREAK;
  }

  private panelRows(): PanelRow[] {
    const st = this.station;
    if (!st) return [];
    const wave = Math.max(1, this.host.phase() === FT_WAVE ? this.host.wave() : this.host.wave() + 1);
    const team = { wave, calm: this.calm, gold: this.row.g, gate: this.host.gate(), gateTier: this.tail.gateTier, crystal: this.host.crystal(), crystalTier: this.tail.crystalTier };
    if (st.kind === 'shop') return shopRows({ wave, calm: this.calm, row: this.row });
    if (st.kind === 'gate') return gateRows(team);
    if (st.kind === 'crystal') return crystalRows(team);
    return towerRows(st.arg, this.tail.type[st.arg] ?? -1, this.tail.level[st.arg] ?? 0, this.row.g, this.teamDmg());
  }

  private renderPanel(force = false): void {
    if (!this.station) return;
    if (!force && this.time - this.rowsAt < 0.1) return;
    this.rowsAt = this.time;
    this.rows = this.panelRows();
    if (this.pending !== null && this.time - this.pendingAt > 2.5) {
      this.pending = null;
      this.d.hud.stall.message('Ответ задерживается — попробуй ещё раз', true);
    }
    this.d.hud.stall.setSub(this.panelSub(this.station));
    this.d.hud.stall.render(this.rows, this.row.g, this.pending);
  }

  private buy(id: number): void {
    const stall = this.d.hud.stall;
    const r = this.rows.find((x) => x.id === id);
    if (!r || !this.station) return;
    if (this.pending !== null && this.time - this.pendingAt < 0.6) return;
    if (r.locked) {
      stall.flash(id, false);
      stall.message(r.reason, true);
      this.sfx.deny();
      return;
    }
    if (r.price > this.row.g) {
      stall.flash(id, false);
      stall.message(`Не хватает ${r.price - this.row.g} 💰`, true);
      this.sfx.deny();
      return;
    }
    this.pending = id;
    this.pendingAt = this.time;
    this.d.net.send({ t: 'use', id });
    this.renderPanel(true);
  }

  /** Сервер не дал купить (опередили, золото ушло, отошёл): причина — в панели */
  private refused(id: number, why: number): void {
    const stall = this.d.hud.stall;
    if (this.pending === id) this.pending = null;
    if (!stall.shown) return;
    const r = this.rows.find((x) => x.id === id);
    stall.flash(id, false);
    stall.message(why === NOPE_FAR ? 'Подойди ближе к стойке' : why === NOPE_GOLD ? 'Не хватает 💰' : r?.reason || 'Сейчас нельзя', true);
    this.sfx.deny();
    this.rowsAt = -1;
  }

  // ------------------------------------------------------------ подсказки и таблички у стоек

  /** Подсказка у стойки: текст, цена, сработает ли E; null — не наша стойка */
  hint(st: FortStation): [string, number, boolean] | null {
    switch (st.kind) {
      case 'shop':
        return [TOUCH ? 'лавка оружейника: прокачка, стволы, гранаты' : 'лавка оружейника · прокачка, стволы, гранаты · 1–9 — купить', 0, true];
      case 'gate': {
        const max = this.gateMax;
        const g = this.host.gate();
        if (g <= 0) return [this.calm ? 'ворота разбиты — поставить новые' : 'ворота разбиты · новые ставят в передышку', 0, true];
        return [`ворота ${Math.round((g / max) * 100)} % · ремонт и укрепление`, 0, true];
      }
      case 'crystal':
        return [`кристалл ${Math.round((this.host.crystal() / this.crystalMax) * 100)} % · подлечить и укрепить`, 0, true];
      case 'tower': {
        const type = this.tail.type[st.arg] ?? -1;
        if (type < 0) return ['место для башни · баллиста, пушка, котёл, жаровня', 0, true];
        const lv = this.tail.level[st.arg] ?? 1;
        return [`${TOWERS[type].name} · ур. ${lv} · улучшить`, towerUpgradePrice(type, lv), true];
      }
    }
    return null;
  }

  /** Табличка над стойкой: значок и текст ('' — спрятать) */
  mark(st: FortStation): [string, string] | null {
    switch (st.kind) {
      case 'shop':
        // у прилавка своя вывеска «ЛАВКА» на навесе — парящая табличка лишняя
        return ['', ''];
      case 'gate': {
        const g = this.host.gate();
        if (g <= 0) return this.calm ? ['🚪', 'НОВЫЕ'] : ['', ''];
        return g < this.gateMax * 0.75 ? ['🔨', `${Math.round((g / this.gateMax) * 100)}%`] : ['', ''];
      }
      case 'crystal':
        return this.host.crystal() < this.crystalMax * 0.75 ? ['💎', `${Math.round((this.host.crystal() / this.crystalMax) * 100)}%`] : ['', ''];
      case 'tower': {
        const type = this.tail.type[st.arg] ?? -1;
        if (type < 0) return this.calm ? ['🏰', 'БАШНЯ'] : ['', ''];
        return [TOWERS[type].icon, `ур. ${this.tail.level[st.arg]}`];
      }
    }
    return null;
  }

  // ------------------------------------------------------------ выстрелы

  /** Свой выстрел тяжёлым стволом: дробь, болт или очередь — сразу, по тем же формулам, что у сервера */
  localShot(s: PlayerState, ev: StepEvents, ads: boolean, viewTick: number): boolean {
    const gun = gunInHands(s, this.load);
    if (gun === GUN_MARKER) return false;
    const { collision, effects, zombies } = this.d;
    const n = zombies.targets(viewTick, this.tg);
    const seed = this.host.seed();
    fortShotDir(s, ev.aimYaw, ev.aimPitch, ev.spread, seed, s.shots, this.host.shoulder(), ads, collision, this.tg, n, this.dir);
    const av = this.host.localAvatar();
    const m = avatarMuzzle(av, _v) ?? av.muzzle(_v);
    const spec = GUNS[gun];
    const color = this.host.colorOf(this.host.myId());
    const ox = s.x;
    const oy = s.y + EYE_HEIGHT;
    const oz = s.z;
    for (let k = 0; k < Math.max(1, spec.pellets); k++) {
      let dx = this.dir.dirX;
      let dy = this.dir.dirY;
      let dz = this.dir.dirZ;
      if (k > 0) {
        applySpread(dx, dy, dz, spec.cone, seed ^ 0x5eed, (s.shots * 16 + k) >>> 0, this.pd);
        dx = this.pd.dirX;
        dy = this.pd.dirY;
        dz = this.pd.dirZ;
      }
      let best = SHOT_RANGE;
      let kind = 2;
      let nx = 0;
      let ny = 0;
      let nz = 0;
      if (collision.raycast(ox, oy, oz, dx, dy, dz, SHOT_RANGE, this.hit, true)) {
        best = this.hit.t;
        kind = 0;
        nx = this.hit.nx;
        ny = this.hit.ny;
        nz = this.hit.nz;
      }
      if (nearestZombie(ox, oy, oz, dx, dy, dz, best, this.tg, n, this.near) >= 0) {
        best = this.near.t;
        kind = 1;
      }
      const ex = ox + dx * best;
      const ey = oy + dy * best;
      const ez = oz + dz * best;
      if (gun === GUN_CROSSBOW) this.d.arsenal3d.playerBolt(m.x, m.y, m.z, ex, ey, ez);
      else effects.shootBall(m.x, m.y, m.z, ex, ey, ez, color, this.host.myId(), { kind, nx, ny, nz, victim: 0, head: false });
      if (gun === GUN_CROSSBOW && kind !== 2) effects.burst(ex, ey, ez, color, 10, 4, nx, ny || 0.4, nz, 0.045);
    }
    av.onShot();
    effects.puff(m.x, m.y, m.z, gun === GUN_SHOTGUN ? 0.7 : 0.35, 0xffffff, 0.16, 0.35, 0.5, 1.6);
    if (gun === GUN_SHOTGUN) {
      this.sfx.shotgun(null);
      this.host.shake(0.18);
    } else if (gun === GUN_CROSSBOW) this.sfx.crossbow(null);
    else this.sfx.mg(null);
    return true;
  }

  private remoteShot(pid: number, gun: number, ox: number, oy: number, oz: number, ex: number, ey: number, ez: number, kind: number, nx: number, ny: number, nz: number): void {
    const { effects } = this.d;
    const av = this.host.avatar(pid);
    let sx = ox;
    let sy = oy;
    let sz = oz;
    if (av && av.shown) {
      setAvatarGun(av, gun);
      const m = avatarMuzzle(av, _v) ?? av.muzzle(_v);
      sx = m.x;
      sy = m.y;
      sz = m.z;
      av.onShot();
      effects.puff(sx, sy, sz, gun === GUN_SHOTGUN ? 0.6 : 0.35, 0xffffff, 0.14, 0.3, 0.45, 1.4);
    }
    const color = this.host.colorOf(pid);
    const dist = this.host.camPos().distanceTo(_v2.set(sx, sy, sz));
    if (gun === GUN_CROSSBOW) {
      this.d.arsenal3d.playerBolt(sx, sy, sz, ex, ey, ez);
      this.sfx.crossbow([sx, sy, sz], dist);
    } else if (gun === GUN_SHOTGUN) {
      const len = Math.hypot(ex - sx, ey - sy, ez - sz);
      for (let k = 0; k < 6; k++) {
        const j = len * 0.07;
        effects.shootBall(sx, sy, sz, ex + (Math.random() - 0.5) * j, ey + (Math.random() - 0.5) * j, ez + (Math.random() - 0.5) * j, color, pid, { kind: k === 0 ? kind : 2, nx, ny, nz, victim: 0, head: false });
      }
      this.sfx.shotgun([sx, sy, sz], dist);
    } else {
      effects.shootBall(sx, sy, sz, ex, ey, ez, color, pid, { kind, nx, ny, nz, victim: 0, head: false });
      this.sfx.mg([sx, sy, sz], dist);
    }
  }

  /** Своё попадание по зомби: цифра урона из пула (крит — если сервер о нём сказал) */
  hitNumber(zid: number, dmg: number, head: boolean, x: number, y: number, z: number): void {
    const at = this.crits.get(zid);
    const crit = at !== undefined && this.time - at < 0.6;
    if (crit) {
      this.crits.delete(zid);
      this.sfx.crit();
    }
    this.d.hud.floaters.damage(zid, x, y, z, dmg, head, crit);
  }

  // ------------------------------------------------------------ гранаты

  private freeSlot(): number {
    const used = new Set(this.grenades.map((g) => g.slot));
    for (let i = 0; i < this.d.arsenal3d.grenadeSlots; i++) if (!used.has(i)) return i;
    return -1;
  }

  private addGrenade(gid: number, pid: number, x: number, y: number, z: number, vx: number, vy: number, vz: number): GrenVis | null {
    const slot = this.freeSlot();
    if (slot < 0) return null;
    const g = makeGrenade();
    g.x = x;
    g.y = y;
    g.z = z;
    g.vx = vx;
    g.vy = vy;
    g.vz = vz;
    const v: GrenVis = { gid, pid, g, slot, ticks: 0, acc: 0, born: this.time, spin: 0 };
    this.grenades.push(v);
    return v;
  }

  /** Отпустил G (свой шаг): бросок сразу, не дожидаясь сервера (он подтвердит событием 'gren') */
  private localThrow(): void {
    if (!this.host.alive() || this.row.gr <= 0 || this.time < this.grenLocalReady) return;
    this.grenLocalReady = this.time + GREN_CD / TICK_RATE;
    const s = this.host.state();
    grenadeLaunch(s.x, s.y, s.z, this.fstep.orig.yaw, this.fstep.orig.pitch, this.d.collision, this.hit, this.arcG);
    this.addGrenade(-1, this.host.myId(), this.arcG.x, this.arcG.y, this.arcG.z, this.arcG.vx, this.arcG.vy, this.arcG.vz);
    this.sfx.throwGrenade(null);
    this.host.localAvatar().onShot();
  }

  private removeGrenade(i: number): void {
    const g = this.grenades[i];
    this.d.arsenal3d.hideGrenade(g.slot);
    this.grenades.splice(i, 1);
  }

  private stepGrenades(dt: number): void {
    const cam = this.host.camPos();
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const v = this.grenades[i];
      // не подтвердил сервер — пропала; взрыв не пришёл слишком долго — убрать
      if ((v.gid < 0 && this.time - v.born > 0.8) || this.time - v.born > GREN_FUSE / TICK_RATE + 1.2) {
        this.removeGrenade(i);
        continue;
      }
      v.acc += dt * TICK_RATE;
      while (v.acc >= 1 && v.ticks < GREN_FUSE + 30) {
        v.acc -= 1;
        v.ticks++;
        if (grenadeStep(v.g, this.d.collision, this.hit)) this.sfx.bounce([v.g.x, v.g.y, v.g.z], cam.distanceTo(_v.set(v.g.x, v.g.y, v.g.z)));
      }
      if (!v.g.rest) v.spin += dt * 12;
      this.d.arsenal3d.grenade(v.slot, v.g.x, v.g.y, v.g.z, v.spin);
    }
  }

  /** Дуга броска, пока держишь G: тот же шаг гранаты от своего (предсказанного) места */
  private updateArc(): void {
    const a3 = this.d.arsenal3d;
    if (!this.grenHeld || !this.host.alive()) {
      a3.hideArc();
      return;
    }
    const s = this.host.state();
    grenadeLaunch(s.x, s.y, s.z, this.host.yaw(), this.host.pitch(), this.d.collision, this.hit, this.arcG);
    let n = 0;
    for (let t = 0; t < GREN_FUSE && n < 48; t++) {
      grenadeStep(this.arcG, this.d.collision, this.hit);
      if (t % 2 === 0) {
        this.arcPts[n * 3] = this.arcG.x;
        this.arcPts[n * 3 + 1] = this.arcG.y;
        this.arcPts[n * 3 + 2] = this.arcG.z;
        n++;
      }
      if (this.arcG.rest) break;
    }
    a3.setArc(this.arcPts, n, this.arcG.x, Math.max(0, this.arcG.y - 0.1), this.arcG.z, this.row.gr > 0);
  }

  // ------------------------------------------------------------ события

  onEvent(e: FortEvent): boolean {
    const { effects, hud, arsenal3d: a3 } = this.d;
    const me = this.host.myId();
    const cam = this.host.camPos();
    switch (e[0]) {
      case 'gshot': {
        const [, pid, gun, ox, oy, oz, ex, ey, ez, kind, nx, ny, nz] = e;
        if (pid !== me) this.remoteShot(pid, gun, ox, oy, oz, ex, ey, ez, kind, nx, ny, nz);
        return true;
      }
      case 'crit':
        this.crits.set(e[1], this.time);
        return true;
      case 'gold': {
        const [, pid, amount, x, y, z] = e;
        if (pid === me) {
          hud.floaters.gold(x, y, z, amount);
          this.sfx.gold();
        }
        return true;
      }
      case 'pot': {
        const [, pid, share, bonus, clean] = e;
        if (pid === me) {
          // та же плашка «волна отбита» — с общаком; чистая волна — заголовком
          hud.ui.cleared(this.host.wave(), share, bonus, !!clean);
          this.sfx.pot(share + bonus);
        }
        return true;
      }
      case 'gren': {
        const [, pid, gid, x, y, z, vx, vy, vz] = e;
        if (pid === me) {
          const local = this.grenades.find((g) => g.gid < 0 && g.pid === me);
          if (local) {
            local.gid = gid;
            return true;
          }
        } else {
          this.sfx.throwGrenade([x, y, z]);
        }
        this.addGrenade(gid, pid, x, y, z, vx, vy, vz);
        return true;
      }
      case 'boom': {
        const [, x, y, z, r, kind, gid] = e;
        if (kind === 0) {
          const i = this.grenades.findIndex((g) => g.gid === gid);
          if (i >= 0) this.removeGrenade(i);
        }
        this.explosion(x, y, z, r, kind === 1);
        return true;
      }
      case 'tower': {
        const [, spot, type, level, pid] = e;
        const s = TOWER_SPOTS[spot];
        if (!s) return true;
        this.tail.type[spot] = type;
        this.tail.level[spot] = level;
        a3.setTowers(this.tail.type, this.tail.level);
        this.sfx.build([s.x, s.y + 1, s.z]);
        effects.puff(s.x, s.y + 0.6, s.z, 1.8, 0xfff1d0, 0.6, 0.7, 0.55);
        effects.burst(s.x, s.y + 0.8, s.z, 0xffd35a, 18, 4, 0, 1, 0, 0.04);
        if (pid === me) hud.pb.bannerMessage(level > 1 ? `🏰 ${TOWERS[type].name}: уровень <b>${level}</b>` : `🏰 ${TOWERS[type].name} на стене — стреляет сама!`, 1800);
        return true;
      }
      case 'bolt': {
        const [, spot, zid, x, y, z] = e;
        const m = a3.bolt(spot, x, y, z, _v, zid);
        this.sfx.ballista([m.x, m.y, m.z], cam.distanceTo(m));
        effects.burst(x, y, z, 0xd8c39a, 8, 3, 0, 0.5, 0, 0.035);
        return true;
      }
      case 'cball': {
        const [, spot, x, y, z, ticks] = e;
        const m = a3.cannon(spot, x, y, z, ticks, _v);
        effects.puff(m.x, m.y, m.z, 1.6, 0xe8e2d4, 0.9, 0.5, 0.65);
        this.sfx.cannon([m.x, m.y, m.z], cam.distanceTo(m));
        if (cam.distanceTo(m) < 12) this.host.shake(0.25);
        return true;
      }
      case 'tar': {
        const [, spot, x, z] = e;
        const m = a3.pour(spot, x, z, _v);
        effects.burst(m.x, m.y, m.z, 0x1a120c, 22, 3, 0, -1, 0, 0.07);
        effects.burst(x, 0.3, z, 0x2a1c12, 26, 4.5, 0, 1, 0, 0.06);
        this.sfx.tar([x, 0.5, z], cam.distanceTo(_v2.set(x, 0.5, z)));
        return true;
      }
      case 'coals': {
        const [, spot] = e;
        const m = a3.coals(spot, _v);
        effects.burst(m.x, m.y, m.z, 0xff8a2a, 30, 7, 0, 0.6, 0, 0.05);
        effects.burst(m.x, m.y, m.z, 0xffd35a, 14, 5, 0, 1, 0, 0.035);
        this.sfx.coals([m.x, m.y, m.z], cam.distanceTo(m));
        return true;
      }
      case 'burn': {
        const [, zid, ticks] = e;
        a3.burn(zid, ticks / TICK_RATE);
        return true;
      }
      case 'abuy': {
        const [, pid, id] = e;
        if (pid !== me) return true;
        const r = this.rows.find((x) => x.id === id);
        this.d.hud.stall.flash(id, true);
        this.d.hud.stall.message(r ? `Куплено: ${r.name}` : 'Куплено');
        this.pending = null;
        this.sfx.buy(id >= ACT_TOWER || (id >= ACT_SHOP + 6 && id < ACT_SHOP + 9));
        if (id >= ACT_TOWER && (id - ACT_TOWER) % 10 !== TOWER_UPGRADE) this.d.hud.pb.bannerMessage('🏰 Башня строится', 1200);
        this.rowsAt = -1;
        return true;
      }
      case 'anope': {
        const [, pid, id, why] = e;
        if (pid === me) this.refused(id, why);
        return true;
      }
      case 'grens': {
        const [, pid, n] = e;
        if (pid === me && n > this.row.gr) hud.pb.bannerMessage(`💣 Гранаты: <b>${n}</b> · G — бросок`, 1600);
        return true;
      }
    }
    return false;
  }

  private explosion(x: number, y: number, z: number, r: number, cannon: boolean): void {
    const { effects } = this.d;
    effects.burst(x, y, z, 0xff9a3a, 34, r * 2.2, 0, 1, 0, 0.07);
    effects.burst(x, y, z, 0xffe08a, 18, r * 1.6, 0, 1, 0, 0.05);
    effects.burst(x, y, z, 0x5a4a3a, 22, r * 1.4, 0, 1.2, 0, 0.06);
    effects.puff(x, y + 0.4, z, r * 1.1, 0xe8dcc8, 0.9, 0.9, 0.6, 2.2);
    effects.puff(x, y + 0.2, z, r * 0.6, 0xffb060, 0.3, 0.4, 0.7, 2.8);
    const cam = this.host.camPos();
    const dist = cam.distanceTo(_v.set(x, y, z));
    this.sfx.boom([x, y, z], dist, cannon);
    if (dist < r + 10) this.host.shake(Math.min(0.7, (r + 10 - dist) / (r + 10)));
  }

  // ------------------------------------------------------------ кадр

  /** Кадр: мышь и панель, дуга и полёт гранат, башни и снаряды, цифры, ствол на своей желейке, полоска стволов */
  frame(dt: number, camera: THREE.Camera, w: number, h: number): void {
    this.time += dt;
    const { hud, input, arsenal3d: a3 } = this.d;
    const s = this.host.state();
    const alive = this.host.alive();
    // ушла мышь (Esc у открытой панели) — панель закрыть, меню не звать: курсор свободен до клика
    if (!TOUCH && hud.stall.shown && this.lockedAtOpen && !input.locked && !input.lockPending) {
      this.closePanel();
      this.freeCursor = true;
      this.cancelGrenade();
    }
    if (this.freeCursor && input.locked) this.freeCursor = false;
    if (this.freeCursor && this.host.phase() === FT_END) this.freeCursor = false;
    hud.setResume(this.freeCursor);
    if (input.blocked || (!input.locked && !TOUCH)) this.cancelGrenade();
    // панель: далеко, сбили, итоги — закрыть
    const st = this.station;
    if (st && hud.stall.shown) {
      if (!alive || this.host.phase() === FT_END || Math.hypot(s.x - st.x, s.z - st.z) > CLOSE_DIST + st.r * 0.5 || Math.abs(s.y - st.y) > 2.4) this.closePanel();
      else this.renderPanel();
    }
    this.updateArc();
    this.stepGrenades(dt);
    a3.update(dt, this.host.camPos(), this.zombieAt);
    hud.floaters.update(dt, camera, w, h);
    // свой ствол на желейке и полоска стволов
    const gun = gunInHands(s, this.load);
    setAvatarGun(this.host.localAvatar(), gun);
    const heavy = this.load.heavy;
    hud.arms.set(gun, heavy, heavy ? GUNS[heavy].name : '', GUN_ICONS[heavy] ?? 'shotgun', heavy ? holsteredAmmo(s, this.load) : 0, this.row.gr, grenadeMax(this.row.lv[UP_POUCH] ?? 0));
    hud.arms.setVisible(alive && this.host.phase() !== FT_END);
  }

  /** Чужая желейка: какой ствол у неё в руках (из снимка: байт armor в крепости — номер ствола) */
  remoteGun(av: Avatar, gun: number): void {
    setAvatarGun(av, gun > 0 && gun < GUNS.length ? gun : 0);
  }

  /** Отладка в браузере (window.__opus.state().arsenal) */
  debug(): Record<string, unknown> {
    const s = this.host.state();
    return {
      gold: this.row.g, lv: this.row.lv, hv: this.row.hv, gn: this.row.gn, gr: this.row.gr, gun: gunInHands(s, this.load),
      heavyBit: (s.awp & HEAVY_IN_HANDS) !== 0, ammo: s.ammo, panel: this.d.hud.stall.kind, free: this.freeCursor,
      towers: this.tail.type.slice(), levels: this.tail.level.slice(), gateTier: this.tail.gateTier, crystalTier: this.tail.crystalTier,
      grenades: this.grenades.length, floaters: this.d.hud.floaters.active,
    };
  }
}

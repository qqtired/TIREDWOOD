// Стволы «Крепости»: две руки — маркер всегда при себе и один купленный тяжёлый ствол (дробовик, арбалет, пулемёт),
// прокачка темпа и магазина, бросок гранаты (G: держишь — дуга, отпустил — бросок), лестницы. Движение — общий
// stepPlayer (огонь и перезарядку от него прячем), оружие — здесь. Один и тот же код на сервере и в предсказании
// клиента (Predictor: before/after), поэтому только целые тики и детерминированные хэши.
//
// Поля PlayerState в крепости: ammo — патроны ствола в руках; fireCd — до выстрела в ЧЕТВЕРТЯХ тика (дробный темп
// пулемёта и прокачки); reloadT — тиков до конца перезарядки; awp — бит 7: в руках тяжёлый ствол, биты 0–6 — доля
// патронов в убранном стволе (127 — полный магазин). AWP в крепости не бывает, поле свободно.
import { RUN_SPEED } from './constants.ts';
import { DRAW_Q, GUNS, GUN_MARKER, gunIntervalQ, gunMag, gunReload, type GunSpec, type Loadout } from './fortarsenal.ts';
import { ladderBefore } from './fortladder.ts';
import { hashFloat } from './math.ts';
import { BTN_ADS, BTN_FIRE, BTN_RELOAD, shotDirection, stepPlayer, type Input, type PlayerState, type StepEvents } from './sim.ts';
import type { CollisionWorld } from './world.ts';

/** G держат: на клиенте — дуга броска; отпустили — бросок (решает сервер: есть ли гранаты) */
export const BTN_FT_GRENADE = 2048;
/** Какую руку хочется: бит есть — тяжёлый ствол, нет — маркер (1 / 2 / колесо мыши переключают на клиенте) */
export const BTN_FT_HEAVY = 4096;
/** G отпустили не сами (открылся чат, ушла мышь) — без броска */
export const BTN_FT_NOTHROW = 8192;

export const HEAVY_IN_HANDS = 128;
const Q_FULL = 127;
const BLOOM_DECAY = 0.0011;
const RECOIL_MAX = 0.085;
const RECOIL_KEEP_FIRING = 0.972;
const RECOIL_KEEP_IDLE = 0.86;

export interface FortGunEvents {
  /** Ствол в руках после шага */
  gun: number;
  /** В этом шаге сменили ствол */
  swapped: boolean;
  /** Отпустили G (сервер бросит гранату, если есть) */
  release: boolean;
  /** На лестнице (номер или −1) */
  ladder: number;
}

/** Черновик одного шага: исходный вход, вход для stepPlayer, сохранённое оружие */
export interface FortStep {
  readonly orig: Input;
  readonly masked: Input;
  pressed: number;
  ammo: number;
  fireCd: number;
  reloadT: number;
  bloom: number;
  recoilP: number;
  recoilY: number;
  shots: number;
  awp: number;
  readonly load: Loadout;
  readonly ev: FortGunEvents;
}

export function makeFortStep(): FortStep {
  return {
    orig: { seq: 0, buttons: 0, yaw: 0, pitch: 0, viewTick: 0 },
    masked: { seq: 0, buttons: 0, yaw: 0, pitch: 0, viewTick: 0 },
    pressed: 0, ammo: 0, fireCd: 0, reloadT: 0, bloom: 0, recoilP: 0, recoilY: 0, shots: 0, awp: 0,
    load: { heavy: 0, rate: 0, mag: 0 },
    ev: { gun: 0, swapped: false, release: false, ladder: -1 },
  };
}

/** Какой ствол в руках */
export function gunInHands(s: PlayerState, load: Loadout): number {
  return (s.awp & HEAVY_IN_HANDS) !== 0 && load.heavy > 0 ? load.heavy : GUN_MARKER;
}

/** Патроны в убранном стволе */
export function holsteredAmmo(s: PlayerState, load: Loadout): number {
  const other = (s.awp & HEAVY_IN_HANDS) !== 0 ? GUN_MARKER : load.heavy;
  if ((s.awp & HEAVY_IN_HANDS) === 0 && load.heavy <= 0) return 0;
  return unpackAmmo(s.awp & Q_FULL, gunMag(other, load.mag));
}

function packAmmo(ammo: number, mag: number): number {
  return ammo >= mag ? Q_FULL : Math.max(0, Math.floor((ammo * Q_FULL) / mag));
}

function unpackAmmo(q: number, mag: number): number {
  return q >= Q_FULL ? mag : Math.min(mag, Math.ceil((q * mag) / Q_FULL));
}

/** Свежий защитник: маркер в руках с полным магазином, тяжёлый (если есть) — полный в кобуре */
export function armFort(s: PlayerState, load: Loadout): void {
  s.awp = Q_FULL;
  s.ammo = gunMag(GUN_MARKER, load.mag);
  s.fireCd = 0;
  s.reloadT = 0;
}

/** Купили ствол или магазин: оба ствола полные, в руках — тот, что был (тяжёлый — если он есть) */
export function refillFort(s: PlayerState, load: Loadout): void {
  const heavy = (s.awp & HEAVY_IN_HANDS) !== 0 && load.heavy > 0;
  s.awp = (heavy ? HEAVY_IN_HANDS : 0) | Q_FULL;
  s.ammo = gunMag(heavy ? load.heavy : GUN_MARKER, load.mag);
  s.reloadT = 0;
}

/** Разброс ствола прямо сейчас (для выстрела и прицела на клиенте) */
export function gunSpread(g: GunSpec, s: PlayerState, ads: boolean): number {
  const hs = Math.sqrt(s.vx * s.vx + s.vz * s.vz);
  const moveFrac = hs > RUN_SPEED ? 1 : hs / RUN_SPEED;
  let spread = ads ? g.spreadAds + g.moveAds * moveFrac : g.spreadHip + g.moveHip * moveFrac;
  if (s.grounded === 0) spread += ads ? g.airAds : g.airHip;
  spread += ads ? s.bloom * 0.45 : s.bloom;
  return spread;
}

export function fortSpread(s: PlayerState, ads: boolean, load: Loadout): number {
  return gunSpread(GUNS[gunInHands(s, load)], s, ads);
}

/**
 * Перед stepPlayer: запомнить вход и оружие, на лестнице — своя вертикаль. Возвращает вход для stepPlayer
 * (без огня и перезарядки — их считает fortAfter).
 */
export function fortBefore(f: FortStep, s: PlayerState, inp: Input, load: Loadout): Input {
  const o = f.orig;
  o.seq = inp.seq;
  o.buttons = inp.buttons;
  o.yaw = inp.yaw;
  o.pitch = inp.pitch;
  o.viewTick = inp.viewTick;
  f.load.heavy = load.heavy;
  f.load.rate = load.rate;
  f.load.mag = load.mag;
  f.pressed = inp.buttons & ~s.prevButtons;
  f.ev.release = (s.prevButtons & ~inp.buttons & BTN_FT_GRENADE) !== 0 && (inp.buttons & BTN_FT_NOTHROW) === 0;
  f.ammo = s.ammo;
  f.fireCd = s.fireCd;
  f.reloadT = s.reloadT;
  f.bloom = s.bloom;
  f.recoilP = s.recoilP;
  f.recoilY = s.recoilY;
  f.shots = s.shots;
  f.awp = s.awp;
  const m = f.masked;
  m.seq = inp.seq;
  m.yaw = inp.yaw;
  m.pitch = inp.pitch;
  m.viewTick = inp.viewTick;
  m.buttons = inp.buttons & ~(BTN_FIRE | BTN_RELOAD);
  f.ev.ladder = ladderBefore(s, inp, m, f.pressed);
  return m;
}

/** После stepPlayer: вернуть оружие и сделать свой шаг ствола. ev — события stepPlayer (дополняются выстрелом). */
export function fortAfter(f: FortStep, s: PlayerState, ev: StepEvents, canFire: boolean, seed: number): void {
  s.ammo = f.ammo;
  s.fireCd = f.fireCd;
  s.reloadT = f.reloadT;
  s.bloom = f.bloom;
  s.recoilP = f.recoilP;
  s.recoilY = f.recoilY;
  s.shots = f.shots;
  s.awp = f.awp;
  ev.fired = false;
  ev.awp = false;
  ev.reloadStart = false;
  ev.reloaded = false;
  ev.dry = false;
  stepGun(s, f.orig, f.pressed, canFire, seed, ev, f.load, f.ev);
  s.prevButtons = f.orig.buttons;
}

/** Шаг защитника целиком (сервер, тесты) */
export function stepFort(f: FortStep, s: PlayerState, inp: Input, w: CollisionWorld, canFire: boolean, seed: number, ev: StepEvents, load: Loadout): void {
  const m = fortBefore(f, s, inp, load);
  stepPlayer(s, m, w, canFire, seed, ev);
  fortAfter(f, s, ev, canFire, seed);
}

function stepGun(s: PlayerState, inp: Input, pressed: number, canFire: boolean, seed: number, ev: StepEvents, load: Loadout, gev: FortGunEvents): void {
  const b = inp.buttons;
  gev.swapped = false;
  let heavy = (s.awp & HEAVY_IN_HANDS) !== 0;
  // тяжёлого больше нет (новая игра) — маркер в руки
  if (heavy && load.heavy <= 0) {
    heavy = false;
    s.awp = Q_FULL;
    s.ammo = Math.min(s.ammo, gunMag(GUN_MARKER, load.mag));
  }
  const want = (b & BTN_FT_HEAVY) !== 0 && load.heavy > 0;
  if (want !== heavy) {
    const cur = heavy ? load.heavy : GUN_MARKER;
    const next = want ? load.heavy : GUN_MARKER;
    const q = packAmmo(s.ammo, gunMag(cur, load.mag));
    s.ammo = unpackAmmo(s.awp & Q_FULL, gunMag(next, load.mag));
    s.awp = (want ? HEAVY_IN_HANDS : 0) | q;
    s.reloadT = 0;
    s.fireCd = DRAW_Q;
    s.bloom = 0;
    heavy = want;
    gev.swapped = true;
  }
  const gun = heavy ? load.heavy : GUN_MARKER;
  gev.gun = gun;
  const g = GUNS[gun];
  const mag = gunMag(gun, load.mag);
  const ads = (b & BTN_ADS) !== 0;
  s.fireCd = s.fireCd > 4 ? s.fireCd - 4 : 0;
  let fired = false;
  if (s.reloadT > 0) {
    s.reloadT--;
    if (s.reloadT === 0) {
      s.ammo = mag;
      ev.reloaded = true;
    }
  } else if ((pressed & BTN_RELOAD) && s.ammo < mag) {
    s.reloadT = gunReload(gun, load.rate);
    ev.reloadStart = true;
  }
  if (canFire && (b & BTN_FIRE) && s.fireCd < 4 && s.reloadT === 0) {
    if (s.ammo <= 0) {
      s.reloadT = gunReload(gun, load.rate);
      ev.reloadStart = true;
      ev.dry = true;
    } else {
      const interval = gunIntervalQ(gun, load.rate);
      s.ammo--;
      s.fireCd += interval;
      s.shots = (s.shots + 1) >>> 0;
      const spread = gunSpread(g, s, ads);
      ev.aimYaw = inp.yaw + s.recoilY;
      ev.aimPitch = inp.pitch + s.recoilP;
      ev.spread = spread;
      shotDirection(ev.aimYaw, ev.aimPitch, spread, seed, s.shots, ev);
      ev.fired = true;
      fired = true;
      s.bloom = s.bloom + g.bloom > g.bloomMax ? Math.max(s.bloom, g.bloomMax) : s.bloom + g.bloom;
      const k1 = hashFloat(seed ^ 0x51ed, s.shots);
      const k2 = hashFloat(seed ^ 0x2c1b, s.shots);
      const kick = ads ? 0.7 : 1;
      s.recoilP += g.kick * (0.8 + 0.4 * k1) * kick;
      if (s.recoilP > RECOIL_MAX) s.recoilP = RECOIL_MAX;
      s.recoilY += (k2 - 0.5) * 2 * g.kickYaw * kick;
      if (s.ammo === 0) {
        s.reloadT = gunReload(gun, load.rate) + Math.ceil(interval / 4);
        ev.reloadStart = true;
      }
    }
  }
  if (!fired) {
    s.bloom = s.bloom > BLOOM_DECAY ? s.bloom - BLOOM_DECAY : 0;
    const keep = s.fireCd > 0 ? RECOIL_KEEP_FIRING : RECOIL_KEEP_IDLE;
    s.recoilP *= keep;
    s.recoilY *= keep;
    if (s.recoilP < 1e-6 && s.recoilP > -1e-6) s.recoilP = 0;
    if (s.recoilY < 1e-6 && s.recoilY > -1e-6) s.recoilY = 0;
  }
}

// Хвост снимка крепости (протокол 13) — сразу за списком игроков (h.tail): заголовок FT_TAIL_HEAD (ворота, кристалл,
// краскомёты, лужи, сколько врагов осталось, щит строений, волна, событие, ящик припасов, длина блока arsenal), потом
// враги — запись ZOMBIE_BYTES, у кого идёт метка атаки или отсчёт (isTimedState) — ещё WARN_BYTES, потом блок arsenal
// как есть (его формат — их; здесь только длина). Врагов не больше FORT_MAX_ALIVE — снимок ≲ 1,5 КБ.
import {
  FORT_MAX_ALIVE, ZS_BARREL, ZS_BOSS_BOMB, ZS_BOSS_GATE, ZS_BOSS_OPEN, ZS_BOSS_PULSE, ZS_CHARGE, ZS_CHARGE_WARN, ZS_FLY_DIVE,
  ZS_FLY_WARN, ZS_HOP, ZS_KRAKEN_DIVE, ZS_KRAKEN_SPIT, ZS_METEOR, ZS_PLANT, ZS_QUAKE, ZS_SPIT, ZS_STOMP, ZS_TENT_REST,
  ZS_TENT_SLAM, ZS_THROW,
} from './fort.ts';

/**
 * Ворота u16, кристалл u16, краскомёты u8, лужи u8, осталось u16, врагов u8, защитников u8, щит u16, откат щита u16,
 * волна u16, событие u8, признаки волны u8, ящик: состояние u8, x i16, z i16 (см), блок arsenal: длина u16
 */
export const FT_TAIL_HEAD = 27;
/** Враг: номер u16, тип u8, состояние u8, доля HP u8, x z y i16 (см), курс u8, удары u8, признаки u8, стадия u8 */
export const ZOMBIE_BYTES = 15;
/** Метка или отсчёт (признак ZF_WARN): тиков u16, цель x y z i16 (см), радиус u8 (дм) */
export const WARN_BYTES = 9;

/** Признаки врага: ступень (0 — обычный, 1 — элита, 2 — чемпион) в двух младших битах */
export const ZF_TIER = 3;
/** За записью — метка атаки */
export const ZF_WARN = 4;
/** Абордажник (экипаж лодки) */
export const ZF_CREW = 8;
/** Щит щитоносца цел */
export const ZF_SHIELD = 16;
/** Босс в ярости */
export const ZF_RAGE = 32;
/** Горит фитиль, светится лекарь */
export const ZF_LIT = 64;
/** Несёт бочку (подрывник) */
export const ZF_CARRY = 128;

/** Признаки волны: вызвали раньше (+10 % золота) */
export const FM_EARLY = 1;

/** Состояния, у которых в снимке есть отсчёт и цель (метки атак, окно уязвимости) */
const TIMED = new Uint8Array(256);
for (const s of [ZS_FLY_WARN, ZS_FLY_DIVE, ZS_BOSS_GATE, ZS_BOSS_BOMB, ZS_BOSS_PULSE, ZS_BOSS_OPEN, ZS_SPIT, ZS_PLANT, ZS_HOP,
  ZS_CHARGE_WARN, ZS_CHARGE, ZS_STOMP, ZS_THROW, ZS_QUAKE, ZS_TENT_SLAM, ZS_TENT_REST, ZS_KRAKEN_DIVE, ZS_KRAKEN_SPIT, ZS_METEOR,
  ZS_BARREL]) TIMED[s] = 1;

export function isTimedState(state: number): boolean {
  return TIMED[state & 255] === 1;
}

export interface FortTail {
  /** Peak roster committed for this wave, and remaining combat bell ticks. */
  defenders?: number;
  rally?: number;
  rallyCd?: number;
  gate: number;
  crystal: number;
  turrets: number;
  jams: number;
  /** Зомби в волне: ещё не вышли + живые */
  left: number;
  /** Какая волна, её событие (EV_*), признаки (FM_*) */
  wave?: number;
  event?: number;
  mods?: number;
  /** Ящик припасов: 0 — нет, 1 — летит, 2 — лежит; где */
  crate?: number;
  crateX?: number;
  crateZ?: number;
  /** Блок arsenal: на записи — байты; на чтении — где он в буфере и сколько байт */
  ext?: Uint8Array | null;
  extAt?: number;
  extLen?: number;
}

export interface ZombieSnap {
  id: number;
  kind: number;
  state: number;
  /** Доля здоровья 0…1 */
  hp: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Растёт на каждом ударе (по воротам, кристаллу, игроку) — клиент машет руками */
  atk: number;
  /** Признаки ZF_* (ступень, экипаж, щит, ярость …) */
  flags?: number;
  /** Отсчёт метки или окна (тиков) и её цель — только в состояниях isTimedState; радиус метки, м */
  wind?: number;
  tx?: number;
  ty?: number;
  tz?: number;
  r?: number;
  /** Фаза босса, номер щупальца, сколько экипажа в лодке … — по типу */
  stage?: number;
}

export function makeFortTail(): FortTail {
  return { gate: 0, crystal: 0, turrets: 0, jams: 0, left: 0 };
}

export function makeZombieSnap(): ZombieSnap {
  return { id: 0, kind: 0, state: 0, hp: 1, x: 0, y: 0, z: 0, yaw: 0, atk: 0, flags: 0 };
}

const TAU = Math.PI * 2;

function i16(v: number): number {
  const r = Math.round(v);
  return r < -32768 ? -32768 : r > 32767 ? 32767 : r;
}

function u16(v: number): number {
  const r = Math.ceil(v);
  return r < 0 ? 0 : r > 65535 ? 65535 : r;
}

function u8(v: number): number {
  const r = Math.round(v);
  return r < 0 ? 0 : r > 255 ? 255 : r;
}

/** Байт на хвост: заголовок, враги (с метками), блок arsenal */
export function fortTailSize(list: readonly ZombieSnap[], count: number, extLen = 0): number {
  const n = Math.min(count, FORT_MAX_ALIVE, 255);
  let size = FT_TAIL_HEAD + n * ZOMBIE_BYTES + Math.max(0, extLen);
  for (let i = 0; i < n; i++) if (isTimedState(list[i].state)) size += WARN_BYTES;
  return size;
}

/** Хвост в буфер out с позиции at (out должен вместить fortTailSize); возвращает конец. */
export function encodeFortTail(out: Uint8Array, at: number, t: FortTail, list: readonly ZombieSnap[], count: number): number {
  const v = new DataView(out.buffer, out.byteOffset, out.byteLength);
  const n = Math.min(count, FORT_MAX_ALIVE, 255);
  const ext = t.ext && t.ext.length <= 0xffff ? t.ext : null;
  v.setUint16(at, u16(t.gate), true);
  v.setUint16(at + 2, u16(t.crystal), true);
  v.setUint8(at + 4, t.turrets & 0xff);
  v.setUint8(at + 5, t.jams & 0xff);
  v.setUint16(at + 6, u16(t.left), true);
  v.setUint8(at + 8, n);
  v.setUint8(at + 9, u8(t.defenders ?? 1));
  v.setUint16(at + 10, u16(t.rally ?? 0), true);
  v.setUint16(at + 12, u16(t.rallyCd ?? 0), true);
  v.setUint16(at + 14, u16(t.wave ?? 0), true);
  v.setUint8(at + 16, u8(t.event ?? 0));
  v.setUint8(at + 17, (t.mods ?? 0) & 0xff);
  v.setUint8(at + 18, u8(t.crate ?? 0));
  v.setInt16(at + 19, i16((t.crateX ?? 0) * 100), true);
  v.setInt16(at + 21, i16((t.crateZ ?? 0) * 100), true);
  v.setUint16(at + 23, ext ? ext.length : 0, true);
  v.setUint16(at + 25, 0, true);
  let o = at + FT_TAIL_HEAD;
  for (let i = 0; i < n; i++) {
    const z = list[i];
    const timed = isTimedState(z.state);
    v.setUint16(o, z.id & 0xffff, true);
    v.setUint8(o + 2, z.kind & 0xff);
    v.setUint8(o + 3, z.state & 0xff);
    v.setUint8(o + 4, z.hp <= 0 ? 0 : Math.max(1, Math.min(255, Math.ceil(z.hp * 255))));
    v.setInt16(o + 5, i16(z.x * 100), true);
    v.setInt16(o + 7, i16(z.z * 100), true);
    v.setInt16(o + 9, i16(z.y * 100), true);
    let yaw = z.yaw % TAU;
    if (yaw < 0) yaw += TAU;
    v.setUint8(o + 11, Math.round((yaw / TAU) * 256) & 0xff);
    v.setUint8(o + 12, z.atk & 0xff);
    v.setUint8(o + 13, ((z.flags ?? 0) & ~ZF_WARN & 0xff) | (timed ? ZF_WARN : 0));
    v.setUint8(o + 14, u8(z.stage ?? 0));
    o += ZOMBIE_BYTES;
    if (!timed) continue;
    v.setUint16(o, u16(z.wind ?? 0), true);
    v.setInt16(o + 2, i16((z.tx ?? 0) * 100), true);
    v.setInt16(o + 4, i16((z.ty ?? 0) * 100), true);
    v.setInt16(o + 6, i16((z.tz ?? 0) * 100), true);
    v.setUint8(o + 8, u8((z.r ?? 0) * 10));
    o += WARN_BYTES;
  }
  if (ext) {
    out.set(ext, o);
    o += ext.length;
  }
  return o;
}

/**
 * Разбор хвоста с позиции at. Враги — в out (переиспользуется). Возвращает их число или −1, если хвост битый.
 * Блок arsenal не разбирается: t.extAt и t.extLen говорят, где он лежит.
 */
export function decodeFortTail(buf: ArrayBuffer, at: number, t: FortTail, out: ZombieSnap[]): number {
  const v = new DataView(buf);
  if (v.byteLength < at + FT_TAIL_HEAD) return -1;
  t.gate = v.getUint16(at, true);
  t.crystal = v.getUint16(at + 2, true);
  t.turrets = v.getUint8(at + 4);
  t.jams = v.getUint8(at + 5);
  t.left = v.getUint16(at + 6, true);
  const n = v.getUint8(at + 8);
  t.defenders = v.getUint8(at + 9);
  t.rally = v.getUint16(at + 10, true);
  t.rallyCd = v.getUint16(at + 12, true);
  t.wave = v.getUint16(at + 14, true);
  t.event = v.getUint8(at + 16);
  t.mods = v.getUint8(at + 17);
  t.crate = v.getUint8(at + 18);
  t.crateX = v.getInt16(at + 19, true) / 100;
  t.crateZ = v.getInt16(at + 21, true) / 100;
  const extLen = v.getUint16(at + 23, true);
  let o = at + FT_TAIL_HEAD;
  if (n > FORT_MAX_ALIVE) return -1;
  for (let i = 0; i < n; i++) {
    if (v.byteLength < o + ZOMBIE_BYTES) return -1;
    const z = out[i] ?? (out[i] = makeZombieSnap());
    z.id = v.getUint16(o, true);
    z.kind = v.getUint8(o + 2);
    z.state = v.getUint8(o + 3);
    z.hp = v.getUint8(o + 4) / 255;
    z.x = v.getInt16(o + 5, true) / 100;
    z.z = v.getInt16(o + 7, true) / 100;
    z.y = v.getInt16(o + 9, true) / 100;
    z.yaw = (v.getUint8(o + 11) / 256) * TAU;
    z.atk = v.getUint8(o + 12);
    const flags = v.getUint8(o + 13);
    z.flags = flags;
    z.stage = v.getUint8(o + 14);
    o += ZOMBIE_BYTES;
    if (flags & ZF_WARN) {
      if (v.byteLength < o + WARN_BYTES) return -1;
      z.wind = v.getUint16(o, true);
      z.tx = v.getInt16(o + 2, true) / 100;
      z.ty = v.getInt16(o + 4, true) / 100;
      z.tz = v.getInt16(o + 6, true) / 100;
      z.r = v.getUint8(o + 8) / 10;
      o += WARN_BYTES;
    } else {
      z.wind = 0;
      z.tx = z.ty = z.tz = 0;
      z.r = 0;
    }
  }
  if (v.byteLength < o + extLen) return -1;
  t.extAt = o;
  t.extLen = extLen;
  return n;
}

/** Ступень врага из признаков */
export function snapTier(z: ZombieSnap): number {
  return (z.flags ?? 0) & ZF_TIER;
}

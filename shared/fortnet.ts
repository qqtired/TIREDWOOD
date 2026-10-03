// Хвост снимка крепости — сразу за списком игроков (h.tail): прочность ворот и кристалла, краскомёты, лужи варенья,
// сколько зомби осталось в волне, дальше сами зомби по ZOMBIE_BYTES. Зомби не больше FORT_MAX_ALIVE — снимок ~1 КБ.
import { FORT_MAX_ALIVE } from './fort.ts';

/** Ворота (u16), кристалл (u16), краскомёты (u8, бит на место), лужи (u8, бит на жёлоб), осталось (u16), зомби (u8) */
export const FT_TAIL_HEAD = 14;
/** Зомби: номер u16, тип | состояние << 3, доля здоровья u8, x и z i16 (см), высота i16 (см), курс u8, счётчик ударов u8 */
export const ZOMBIE_BYTES = 21;

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
  /** Remaining telegraph / recovery ticks; target is locked when warning begins. */
  wind?: number;
  tx?: number;
  ty?: number;
  tz?: number;
  stage?: number;
}

export function makeFortTail(): FortTail {
  return { gate: 0, crystal: 0, turrets: 0, jams: 0, left: 0 };
}

export function makeZombieSnap(): ZombieSnap {
  return { id: 0, kind: 0, state: 0, hp: 1, x: 0, y: 0, z: 0, yaw: 0, atk: 0 };
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

/** Хвост в буфер out с позиции at (out должен вместить fortTailSize(count)); возвращает конец. */
export function encodeFortTail(out: Uint8Array, at: number, t: FortTail, list: readonly ZombieSnap[], count: number): number {
  const v = new DataView(out.buffer, out.byteOffset, out.byteLength);
  const n = Math.min(count, FORT_MAX_ALIVE, 255);
  v.setUint16(at, u16(t.gate), true);
  v.setUint16(at + 2, u16(t.crystal), true);
  v.setUint8(at + 4, t.turrets & 0xff);
  v.setUint8(at + 5, t.jams & 0xff);
  v.setUint16(at + 6, u16(t.left), true);
  v.setUint8(at + 8, n);
  v.setUint8(at + 9, t.defenders ?? 1);
  v.setUint16(at + 10, u16(t.rally ?? 0), true);
  v.setUint16(at + 12, u16(t.rallyCd ?? 0), true);
  let o = at + FT_TAIL_HEAD;
  for (let i = 0; i < n; i++) {
    const z = list[i];
    v.setUint16(o, z.id & 0xffff, true);
    v.setUint8(o + 2, (z.kind & 7) | ((z.state & 31) << 3));
    v.setUint8(o + 3, z.hp <= 0 ? 0 : Math.max(1, Math.min(255, Math.ceil(z.hp * 255))));
    v.setInt16(o + 4, i16(z.x * 100), true);
    v.setInt16(o + 6, i16(z.z * 100), true);
    v.setInt16(o + 8, i16(z.y * 100), true);
    let yaw = z.yaw % TAU;
    if (yaw < 0) yaw += TAU;
    v.setUint8(o + 10, Math.round((yaw / TAU) * 256) & 0xff);
    v.setUint8(o + 11, z.atk & 0xff);
    v.setUint16(o + 12, u16(z.wind ?? 0), true);
    v.setInt16(o + 14, i16((z.tx ?? 0) * 100), true);
    v.setInt16(o + 16, i16((z.ty ?? 0) * 100), true);
    v.setInt16(o + 18, i16((z.tz ?? 0) * 100), true);
    v.setUint8(o + 20, z.stage ?? 0);
    o += ZOMBIE_BYTES;
  }
  return o;
}

export function fortTailSize(count: number): number {
  return FT_TAIL_HEAD + Math.min(count, FORT_MAX_ALIVE, 255) * ZOMBIE_BYTES;
}

/** Разбор хвоста с позиции at. Зомби — в out (переиспользуется). Возвращает их число или −1, если хвост битый. */
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
  let o = at + FT_TAIL_HEAD;
  if (n > FORT_MAX_ALIVE || v.byteLength < o + n * ZOMBIE_BYTES) return -1;
  for (let i = 0; i < n; i++) {
    const z = out[i] ?? (out[i] = makeZombieSnap());
    z.id = v.getUint16(o, true);
    const ks = v.getUint8(o + 2);
    z.kind = ks & 7;
    z.state = ks >> 3;
    z.hp = v.getUint8(o + 3) / 255;
    z.x = v.getInt16(o + 4, true) / 100;
    z.z = v.getInt16(o + 6, true) / 100;
    z.y = v.getInt16(o + 8, true) / 100;
    z.yaw = (v.getUint8(o + 10) / 256) * TAU;
    z.atk = v.getUint8(o + 11);
    z.wind = v.getUint16(o + 12, true);
    z.tx = v.getInt16(o + 14, true) / 100;
    z.ty = v.getInt16(o + 16, true) / 100;
    z.tz = v.getInt16(o + 18, true) / 100;
    z.stage = v.getUint8(o + 20);
    o += ZOMBIE_BYTES;
  }
  return n;
}

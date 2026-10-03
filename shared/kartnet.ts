// Снимок гонки (двоичный, 30 раз в секунду): заголовок, своё точное состояние карта (для предсказания),
// остальные карты и банки варенья на дороге. Чужие позиции — int16 с шагом 1/128 м (трасса в пределах ±256 м).
import { MT1_TICKS, MT2_TICKS, type KartState } from './kart.ts';
import { SNAP_HAS_SELF } from './protocol.ts';

export const MSG_KART_SNAPSHOT = 3;
/** KartSnap.misc bit 4: authoritative, one-hit item shield. Lower bits retain boost/spark encoding. */
export const KM_SHIELD = 16;

// Флаги карта в снимке
/** Карт на трассе; снят первые тики после возврата на КТ — его не тянут плавно через полкарты */
export const KE_ON = 1;
export const KE_GROUND = 2;
export const KE_DRIFT = 4;
/** Занос вправо (иначе влево) */
export const KE_DRIFT_R = 8;
export const KE_BOOST = 16;
export const KE_SLOW = 32;
export const KE_GHOST = 64;
export const KE_PAINT = 128;

const POS_SCALE = 128;
const HEADER_BYTES = 20;
const SELF_BYTES = 9 * 8 + 4 * 2 + 13;
const KART_BYTES = 14;
const TRAP_BYTES = 7;

export interface KartHeader {
  tick: number;
  ack: number;
  flags: number;
  queue: number;
  phase: number;
  phaseEnd: number;
  /** Ящики на месте: бит i — ящик i (до 32) */
  crates: number;
}

/** Карт в снимке. misc: искры заноса 0–2 + 4 × уровень ускорения 0–3 */
export interface KartSnap {
  id: number;
  flags: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  steer: number;
  lap: number;
  place: number;
  misc: number;
}

export interface TrapSnap {
  id: number;
  x: number;
  y: number;
  z: number;
}

export function makeKartHeader(): KartHeader {
  return { tick: 0, ack: 0, flags: 0, queue: 0, phase: 0, phaseEnd: 0, crates: 0 };
}

/** Флаги карта для снимка; on — карт на трассе (не прячется после возврата), painted — в краске */
export function kartFlags(s: KartState, on: boolean, painted: boolean): number {
  let flags = 0;
  if (on) flags |= KE_ON;
  if (s.grounded) flags |= KE_GROUND;
  if (s.drift !== 0) flags |= s.drift < 0 ? KE_DRIFT | KE_DRIFT_R : KE_DRIFT;
  if (s.boostT > 0) flags |= KE_BOOST;
  if (s.slowT > 0) flags |= KE_SLOW;
  if (s.ghostT > 0) flags |= KE_GHOST;
  if (painted) flags |= KE_PAINT;
  return flags;
}

/** «Разное» карта для снимка: искры заноса 0–2 + 4 × уровень ускорения 0–3 */
export function kartMisc(s: KartState): number {
  const spark = s.drift === 0 ? 0 : s.driftT >= MT2_TICKS ? 2 : s.driftT >= MT1_TICKS ? 1 : 0;
  return spark + 4 * (s.boostT > 0 ? s.boostLvl : 0);
}

/** Курс → yaw для отрисовки и снимка (yaw = 0 смотрит в −Z). Не в шаге физики: там atan2 нельзя. */
export function kartYaw(k: { hx: number; hz: number }): number {
  return Math.atan2(-k.hx, -k.hz);
}

function i16(v: number): number {
  const r = Math.round(v * POS_SCALE);
  return r < -32768 ? -32768 : r > 32767 ? 32767 : r;
}

export function encodeKarts(list: readonly KartSnap[]): Uint8Array {
  const buf = new Uint8Array(1 + list.length * KART_BYTES);
  const v = new DataView(buf.buffer);
  v.setUint8(0, list.length);
  let o = 1;
  for (const k of list) {
    v.setUint8(o, k.id);
    v.setUint8(o + 1, k.flags);
    v.setInt16(o + 2, i16(k.x), true);
    v.setInt16(o + 4, i16(k.y), true);
    v.setInt16(o + 6, i16(k.z), true);
    let yaw = k.yaw % (Math.PI * 2);
    if (yaw < 0) yaw += Math.PI * 2;
    v.setUint16(o + 8, Math.round((yaw / (Math.PI * 2)) * 65536) & 0xffff, true);
    v.setInt8(o + 10, Math.max(-127, Math.min(127, Math.round(k.steer * 127))));
    v.setUint8(o + 11, k.lap);
    v.setUint8(o + 12, k.place);
    v.setUint8(o + 13, k.misc);
    o += KART_BYTES;
  }
  return buf;
}

export function encodeTraps(list: readonly TrapSnap[]): Uint8Array {
  const buf = new Uint8Array(1 + list.length * TRAP_BYTES);
  const v = new DataView(buf.buffer);
  v.setUint8(0, list.length);
  let o = 1;
  for (const t of list) {
    v.setUint8(o, t.id);
    v.setInt16(o + 1, i16(t.x), true);
    v.setInt16(o + 3, i16(t.y), true);
    v.setInt16(o + 5, i16(t.z), true);
    o += TRAP_BYTES;
  }
  return buf;
}

/** Снимок для одного игрока: заголовок + (его точное состояние) + общие списки карт и ловушек. */
export function encodeKartSnapshot(h: KartHeader, self: KartState | null, karts: Uint8Array, traps: Uint8Array): Uint8Array<ArrayBuffer> {
  const buf = new Uint8Array(HEADER_BYTES + (self ? SELF_BYTES : 0) + karts.length + traps.length);
  const v = new DataView(buf.buffer);
  v.setUint8(0, MSG_KART_SNAPSHOT);
  v.setUint32(1, h.tick >>> 0, true);
  v.setUint32(5, h.ack >>> 0, true);
  v.setUint8(9, (h.flags & ~SNAP_HAS_SELF) | (self ? SNAP_HAS_SELF : 0));
  v.setUint8(10, Math.min(255, h.queue));
  v.setUint8(11, h.phase);
  v.setUint32(12, h.phaseEnd >>> 0, true);
  v.setUint32(16, h.crates >>> 0, true);
  let o = HEADER_BYTES;
  if (self) {
    const f = [self.x, self.y, self.z, self.vx, self.vy, self.vz, self.hx, self.hz, self.steer];
    for (let i = 0; i < f.length; i++) v.setFloat64(o + i * 8, f[i], true);
    o += 72;
    v.setUint16(o, self.seg, true);
    v.setUint16(o + 2, self.driftT, true);
    v.setUint16(o + 4, self.prevButtons, true);
    v.setUint16(o + 6, self.rt, true);
    o += 8;
    const b = [
      self.grounded, self.drift + 1, self.boostT, self.boostLvl, self.slowT, self.spinT, self.ghostT, self.cp, self.lap,
      self.done, self.item, self.itemT, self.hop,
    ];
    for (let i = 0; i < b.length; i++) v.setUint8(o + i, b[i]);
    o += 13;
  }
  buf.set(karts, o);
  buf.set(traps, o + karts.length);
  return buf;
}

const counts = { karts: 0, traps: 0 };

/** Разбор снимка на клиенте: карты и ловушки — в переиспользуемые массивы. null — снимок битый. */
export function decodeKartSnapshot(
  buf: ArrayBuffer,
  h: KartHeader,
  self: KartState,
  karts: KartSnap[],
  traps: TrapSnap[],
): { karts: number; traps: number } | null {
  const v = new DataView(buf);
  if (v.byteLength < HEADER_BYTES + 2 || v.getUint8(0) !== MSG_KART_SNAPSHOT) return null;
  const flags = v.getUint8(9);
  let o = HEADER_BYTES;
  if (flags & SNAP_HAS_SELF) {
    if (v.byteLength < o + SELF_BYTES + 2) return null;
    o += SELF_BYTES;
  }
  const nk = v.getUint8(o);
  const kartsAt = o + 1;
  o = kartsAt + nk * KART_BYTES;
  if (v.byteLength < o + 1) return null;
  const nt = v.getUint8(o);
  const trapsAt = o + 1;
  if (v.byteLength !== trapsAt + nt * TRAP_BYTES) return null;

  h.tick = v.getUint32(1, true);
  h.ack = v.getUint32(5, true);
  h.flags = flags;
  h.queue = v.getUint8(10);
  h.phase = v.getUint8(11);
  h.phaseEnd = v.getUint32(12, true);
  h.crates = v.getUint32(16, true);
  if (flags & SNAP_HAS_SELF) {
    o = HEADER_BYTES;
    self.x = v.getFloat64(o, true);
    self.y = v.getFloat64(o + 8, true);
    self.z = v.getFloat64(o + 16, true);
    self.vx = v.getFloat64(o + 24, true);
    self.vy = v.getFloat64(o + 32, true);
    self.vz = v.getFloat64(o + 40, true);
    self.hx = v.getFloat64(o + 48, true);
    self.hz = v.getFloat64(o + 56, true);
    self.steer = v.getFloat64(o + 64, true);
    o += 72;
    self.seg = v.getUint16(o, true);
    self.driftT = v.getUint16(o + 2, true);
    self.prevButtons = v.getUint16(o + 4, true);
    self.rt = v.getUint16(o + 6, true);
    o += 8;
    self.grounded = v.getUint8(o);
    self.drift = v.getUint8(o + 1) - 1;
    self.boostT = v.getUint8(o + 2);
    self.boostLvl = v.getUint8(o + 3);
    self.slowT = v.getUint8(o + 4);
    self.spinT = v.getUint8(o + 5);
    self.ghostT = v.getUint8(o + 6);
    self.cp = v.getUint8(o + 7);
    self.lap = v.getUint8(o + 8);
    self.done = v.getUint8(o + 9);
    self.item = v.getUint8(o + 10);
    self.itemT = v.getUint8(o + 11);
    self.hop = v.getUint8(o + 12);
  }
  o = kartsAt;
  for (let i = 0; i < nk; i++) {
    const k = karts[i] ?? (karts[i] = { id: 0, flags: 0, x: 0, y: 0, z: 0, yaw: 0, steer: 0, lap: 0, place: 0, misc: 0 });
    k.id = v.getUint8(o);
    k.flags = v.getUint8(o + 1);
    k.x = v.getInt16(o + 2, true) / POS_SCALE;
    k.y = v.getInt16(o + 4, true) / POS_SCALE;
    k.z = v.getInt16(o + 6, true) / POS_SCALE;
    k.yaw = (v.getUint16(o + 8, true) / 65536) * Math.PI * 2;
    k.steer = v.getInt8(o + 10) / 127;
    k.lap = v.getUint8(o + 11);
    k.place = v.getUint8(o + 12);
    k.misc = v.getUint8(o + 13);
    o += KART_BYTES;
  }
  o = trapsAt;
  for (let i = 0; i < nt; i++) {
    const t = traps[i] ?? (traps[i] = { id: 0, x: 0, y: 0, z: 0 });
    t.id = v.getUint8(o);
    t.x = v.getInt16(o + 1, true) / POS_SCALE;
    t.y = v.getInt16(o + 3, true) / POS_SCALE;
    t.z = v.getInt16(o + 5, true) / POS_SCALE;
    o += TRAP_BYTES;
  }
  counts.karts = nk;
  counts.traps = nt;
  return counts;
}

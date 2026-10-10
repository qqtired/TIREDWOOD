// Сетевой протокол. Частые сообщения (ввод, снимки мира) — бинарные,
// редкие (чат, события, состав команд) — JSON.
import type { Input, PlayerState } from './sim.ts';

export const MSG_INPUT = 1;
export const MSG_SNAPSHOT = 2;

// ---------------------------------------------------------------- ввод

const INPUT_BYTES = 19;
const INPUT_HEADER = 3;

/**
 * Пакет ввода: [MSG_INPUT, epoch, count, записи по 19 байт].
 * epoch — номер перехода между комнатами: сервер отбрасывает ввод, посланный ещё в прошлую комнату.
 */
export function encodeInputs(inputs: readonly Input[], from: number, count: number, epoch: number): Uint8Array<ArrayBuffer> {
  const buf = new Uint8Array(INPUT_HEADER + count * INPUT_BYTES);
  const v = new DataView(buf.buffer);
  v.setUint8(0, MSG_INPUT);
  v.setUint8(1, epoch & 0xff);
  v.setUint8(2, count);
  let o = INPUT_HEADER;
  for (let i = 0; i < count; i++) {
    const inp = inputs[from + i];
    v.setUint32(o, inp.seq >>> 0, true);
    v.setUint16(o + 4, inp.buttons & 0xffff, true);
    v.setFloat32(o + 6, inp.yaw, true);
    v.setFloat32(o + 10, inp.pitch, true);
    const vt = inp.viewTick > 0 ? inp.viewTick : 0;
    const whole = Math.floor(vt);
    v.setUint32(o + 14, whole >>> 0, true);
    v.setUint8(o + 18, Math.min(255, Math.floor((vt - whole) * 256)));
    o += INPUT_BYTES;
  }
  return buf;
}

/** Номер комнаты (epoch) из пакета ввода или -1, если пакет короче заголовка. */
export function inputEpoch(data: Uint8Array): number {
  return data.length < INPUT_HEADER ? -1 : data[1];
}

/** Разбирает пакет ввода в out. Возвращает количество входов или -1, если пакет битый. */
export function decodeInputs(data: Uint8Array, out: Input[]): number {
  if (data.length < INPUT_HEADER) return -1;
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (v.getUint8(0) !== MSG_INPUT) return -1;
  const count = v.getUint8(2);
  if (count === 0 || count > 32 || data.length !== INPUT_HEADER + count * INPUT_BYTES) return -1;
  for (let i = 0; i < count; i++) {
    const o = INPUT_HEADER + i * INPUT_BYTES;
    const inp = out[i] ?? (out[i] = { seq: 0, buttons: 0, yaw: 0, pitch: 0, viewTick: 0 });
    inp.seq = v.getUint32(o, true);
    inp.buttons = v.getUint16(o + 4, true);
    inp.yaw = v.getFloat32(o + 6, true);
    inp.pitch = v.getFloat32(o + 10, true);
    if (!Number.isFinite(inp.yaw) || !Number.isFinite(inp.pitch)) return -1;
    if (inp.pitch > PITCH_LIMIT) inp.pitch = PITCH_LIMIT;
    if (inp.pitch < -PITCH_LIMIT) inp.pitch = -PITCH_LIMIT;
    inp.viewTick = v.getUint32(o + 14, true) + v.getUint8(o + 18) / 256;
  }
  return count;
}

/** Предел наклона взгляда (чуть меньше 90°), уже округлённый до float32. */
export const PITCH_LIMIT = Math.fround(1.5533);

// ---------------------------------------------------------------- снимок мира

export const SNAP_HAS_SELF = 1;
export const SNAP_SELF_RESET = 2;

// Флаги сущности
export const E_ALIVE = 1;
export const E_TEAM = 2;
export const E_GROUNDED = 4;
export const E_DASH = 8;
export const E_RELOAD = 16;
export const E_ADS = 32;
export const E_PROTECTED = 64;
export const E_FIRING = 128;

/** Хвост снимка пейнтбола (сразу за списком сущностей): один байт — где AWP */
export const PB_TAIL_BYTES = 1;
/** AWP лежит на кресте; 0 — её нет (ждёт возвращения), иначе — номер того, у кого она в руках */
export const AWP_LYING = 255;

const POS_SCALE = 256;
const HEADER_BYTES = 22;
const SELF_BYTES = 11 * 8 + 4 + 2 + 9;
/** x и z — int24 / 256 (±32 км, шаг 4 мм: остров в 2,4 км от площади), y — int16 / 256 */
export const ENTITY_BYTES = 16;

export interface SnapshotHeader {
  tick: number;
  ack: number;
  flags: number;
  queue: number;
  phase: number;
  phaseEnd: number;
  scoreA: number;
  scoreB: number;
  pickups: number;
  /** Где в снимке кончился список сущностей (дальше — своё у режима: на набережной — мяч) */
  tail: number;
}

export interface EntitySnap {
  id: number;
  flags: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  hp: number;
  armor: number;
}

export function makeHeader(): SnapshotHeader {
  return { tick: 0, ack: 0, flags: 0, queue: 0, phase: 0, phaseEnd: 0, scoreA: 0, scoreB: 0, pickups: 0, tail: 0 };
}

/** Общая для всех часть снимка: список сущностей. */
export function encodeEntities(list: readonly EntitySnap[]): Uint8Array {
  const buf = new Uint8Array(1 + list.length * ENTITY_BYTES);
  const v = new DataView(buf.buffer);
  v.setUint8(0, list.length);
  let o = 1;
  for (const e of list) {
    v.setUint8(o, e.id);
    v.setUint8(o + 1, e.flags);
    setI24(v, o + 2, Math.round(e.x * POS_SCALE));
    v.setInt16(o + 5, clampI16(Math.round(e.y * POS_SCALE)), true);
    setI24(v, o + 7, Math.round(e.z * POS_SCALE));
    let yaw = e.yaw % (Math.PI * 2);
    if (yaw < 0) yaw += Math.PI * 2;
    v.setUint16(o + 10, Math.round((yaw / (Math.PI * 2)) * 65536) & 0xffff, true);
    v.setInt16(o + 12, clampI16(Math.round((e.pitch / (Math.PI / 2)) * 32767)), true);
    v.setUint8(o + 14, Math.max(0, Math.min(255, Math.ceil(e.hp))));
    v.setUint8(o + 15, Math.max(0, Math.min(255, Math.ceil(e.armor))));
    o += ENTITY_BYTES;
  }
  return buf;
}

function clampI16(v: number): number {
  return v < -32768 ? -32768 : v > 32767 ? 32767 : v;
}

/** Целое со знаком в 3 байтах (младший вперёд), с зажимом в ±8 388 607 */
function setI24(v: DataView, o: number, n: number): void {
  const c = n < -8388608 ? -8388608 : n > 8388607 ? 8388607 : n;
  const u = c & 0xffffff;
  v.setUint8(o, u & 0xff);
  v.setUint16(o + 1, u >>> 8, true);
}

function getI24(v: DataView, o: number): number {
  const u = v.getUint8(o) | (v.getUint16(o + 1, true) << 8);
  return u & 0x800000 ? u - 0x1000000 : u;
}

/** Полный снимок для конкретного игрока: заголовок + (его точное состояние) + общий список. */
export function encodeSnapshot(h: SnapshotHeader, self: PlayerState | null, entities: Uint8Array): Uint8Array {
  const size = HEADER_BYTES + (self ? SELF_BYTES : 0) + entities.length;
  const buf = new Uint8Array(size);
  const v = new DataView(buf.buffer);
  v.setUint8(0, MSG_SNAPSHOT);
  v.setUint32(1, h.tick >>> 0, true);
  v.setUint32(5, h.ack >>> 0, true);
  v.setUint8(9, (h.flags & ~SNAP_HAS_SELF) | (self ? SNAP_HAS_SELF : 0));
  v.setUint8(10, Math.min(255, h.queue));
  v.setUint8(11, h.phase);
  v.setUint32(12, h.phaseEnd >>> 0, true);
  v.setUint16(16, h.scoreA, true);
  v.setUint16(18, h.scoreB, true);
  v.setUint16(20, h.pickups, true);
  let o = HEADER_BYTES;
  if (self) {
    const f = [self.x, self.y, self.z, self.vx, self.vy, self.vz, self.dashX, self.dashZ, self.bloom, self.recoilP, self.recoilY];
    for (let i = 0; i < f.length; i++) v.setFloat64(o + i * 8, f[i], true);
    o += 88;
    v.setUint32(o, self.shots >>> 0, true);
    v.setUint16(o + 4, self.prevButtons, true);
    o += 6;
    v.setUint8(o, self.grounded);
    v.setUint8(o + 1, self.coyote);
    v.setUint8(o + 2, self.jumpBuf);
    v.setUint8(o + 3, self.dashT);
    v.setUint8(o + 4, self.dashCd);
    v.setUint8(o + 5, self.ammo);
    v.setUint8(o + 6, self.fireCd);
    v.setUint8(o + 7, self.reloadT);
    v.setUint8(o + 8, self.awp);
    o += 9;
  }
  buf.set(entities, o);
  return buf;
}

/**
 * Разбор снимка на клиенте. Сущности пишутся в массив out (переиспользуется),
 * возвращается их количество (или -1 при ошибке).
 */
export function decodeSnapshot(buf: ArrayBuffer, h: SnapshotHeader, self: PlayerState, out: EntitySnap[]): number {
  const v = new DataView(buf);
  if (v.byteLength < HEADER_BYTES + 1 || v.getUint8(0) !== MSG_SNAPSHOT) return -1;
  h.tick = v.getUint32(1, true);
  h.ack = v.getUint32(5, true);
  h.flags = v.getUint8(9);
  h.queue = v.getUint8(10);
  h.phase = v.getUint8(11);
  h.phaseEnd = v.getUint32(12, true);
  h.scoreA = v.getUint16(16, true);
  h.scoreB = v.getUint16(18, true);
  h.pickups = v.getUint16(20, true);
  let o = HEADER_BYTES;
  if (h.flags & SNAP_HAS_SELF) {
    self.x = v.getFloat64(o, true);
    self.y = v.getFloat64(o + 8, true);
    self.z = v.getFloat64(o + 16, true);
    self.vx = v.getFloat64(o + 24, true);
    self.vy = v.getFloat64(o + 32, true);
    self.vz = v.getFloat64(o + 40, true);
    self.dashX = v.getFloat64(o + 48, true);
    self.dashZ = v.getFloat64(o + 56, true);
    self.bloom = v.getFloat64(o + 64, true);
    self.recoilP = v.getFloat64(o + 72, true);
    self.recoilY = v.getFloat64(o + 80, true);
    o += 88;
    self.shots = v.getUint32(o, true);
    self.prevButtons = v.getUint16(o + 4, true);
    o += 6;
    self.grounded = v.getUint8(o);
    self.coyote = v.getUint8(o + 1);
    self.jumpBuf = v.getUint8(o + 2);
    self.dashT = v.getUint8(o + 3);
    self.dashCd = v.getUint8(o + 4);
    self.ammo = v.getUint8(o + 5);
    self.fireCd = v.getUint8(o + 6);
    self.reloadT = v.getUint8(o + 7);
    self.awp = v.getUint8(o + 8);
    o += 9;
  }
  const count = v.getUint8(o);
  o += 1;
  if (v.byteLength < o + count * ENTITY_BYTES) return -1;
  for (let i = 0; i < count; i++) {
    const e = out[i] ?? (out[i] = { id: 0, flags: 0, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, hp: 0, armor: 0 });
    e.id = v.getUint8(o);
    e.flags = v.getUint8(o + 1);
    e.x = getI24(v, o + 2) / POS_SCALE;
    e.y = v.getInt16(o + 5, true) / POS_SCALE;
    e.z = getI24(v, o + 7) / POS_SCALE;
    e.yaw = (v.getUint16(o + 10, true) / 65536) * Math.PI * 2;
    e.pitch = (v.getInt16(o + 12, true) / 32767) * (Math.PI / 2);
    e.hp = v.getUint8(o + 14);
    e.armor = v.getUint8(o + 15);
    o += ENTITY_BYTES;
  }
  h.tail = o;
  return count;
}

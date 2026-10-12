// Снимок «Fight Club»: общий MSG_SNAPSHOT (заголовок, своё точное движение, игроки по 14 байт — shared/protocol.ts),
// а за списком игроков — хвост боя: свет, своё точное состояние боя (для сверки предсказания) и по 3 байта
// на игрока в том же порядке (действие, тик действия, флаги).
// Заголовок: phase — фаза боя (FP_*), phaseEnd — тик её конца, scoreA/scoreB — победы в раундах, pickups — номер раунда.
// В общем списке: hp — здоровье, armor — выносливость в процентах, pitch не нужен.
import type { Zone } from './fight.ts';
import type { Fighter } from './fightsim.ts';

/** Флаги игрока в общем списке сверх E_ALIVE (не в нокауте), E_TEAM (команда 1), E_GROUNDED, E_DASH (уклон) */
export const FE_FIGHTER = 16;
export const FE_BLOCK = 32;
export const FE_STUN = 64;
export const FE_HELD = 128;

/** Флаги в хвосте */
export const FX_INV = 1;
export const FX_HOLDING = 2;
export const FX_BSTUN = 4;
/** Выносливости меньше, чем на джеб */
export const FX_WINDED = 8;

const HEAD_BYTES = 4;
const SELF_BYTES = 23;

export interface FightTailRow {
  act: number;
  actT: number;
  xf: number;
}

export interface FightTail {
  zoneR: number;
  stage: number;
  warn: boolean;
  hasSelf: boolean;
  rows: FightTailRow[];
  n: number;
}

export function makeFightTail(): FightTail {
  return { zoneR: 0, stage: 0, warn: false, hasSelf: false, rows: [], n: 0 };
}

/** Хвост: свет, своё состояние боя (null — зритель), строки игроков в порядке общего списка. */
export function encodeFightTail(zone: Zone, self: Fighter | null, rows: readonly FightTailRow[]): Uint8Array {
  const buf = new Uint8Array(HEAD_BYTES + (self ? SELF_BYTES : 0) + 1 + rows.length * 3);
  const v = new DataView(buf.buffer);
  v.setUint16(0, Math.max(0, Math.min(65535, Math.round(zone.r * 100))), true);
  v.setUint8(2, (zone.stage & 0x7f) | (zone.warn ? 0x80 : 0));
  v.setUint8(3, self ? 1 : 0);
  let o = HEAD_BYTES;
  if (self) {
    v.setFloat32(o, self.yaw, true);
    v.setUint16(o + 4, self.hp, true);
    v.setUint16(o + 6, self.st, true);
    const b = [self.stCd, self.act, self.actT, self.buf, self.stun, self.bstun, self.inv, self.block, self.ko, self.held, self.grab, self.mash];
    for (let i = 0; i < b.length; i++) v.setUint8(o + 8 + i, b[i]);
    v.setUint16(o + 20, self.pb, true);
    // 23-й байт — запас
    o += SELF_BYTES;
  }
  v.setUint8(o, rows.length);
  o += 1;
  for (const r of rows) {
    v.setUint8(o, r.act);
    v.setUint8(o + 1, Math.min(255, r.actT));
    v.setUint8(o + 2, r.xf);
    o += 3;
  }
  return buf;
}

/**
 * Разбор хвоста с позиции at (h.tail после decodeSnapshot). Своё состояние боя — в self (движение self.s уже
 * разобрал decodeSnapshot). false — снимок битый.
 */
export function decodeFightTail(data: ArrayBuffer, at: number, out: FightTail, self: Fighter): boolean {
  const v = new DataView(data);
  if (v.byteLength < at + HEAD_BYTES + 1) return false;
  out.zoneR = v.getUint16(at, true) / 100;
  const st = v.getUint8(at + 2);
  out.stage = st & 0x7f;
  out.warn = (st & 0x80) !== 0;
  out.hasSelf = v.getUint8(at + 3) === 1;
  let o = at + HEAD_BYTES;
  if (out.hasSelf) {
    if (v.byteLength < o + SELF_BYTES + 1) return false;
    self.yaw = v.getFloat32(o, true);
    self.hp = v.getUint16(o + 4, true);
    self.st = v.getUint16(o + 6, true);
    self.stCd = v.getUint8(o + 8);
    self.act = v.getUint8(o + 9);
    self.actT = v.getUint8(o + 10);
    self.buf = v.getUint8(o + 11);
    self.stun = v.getUint8(o + 12);
    self.bstun = v.getUint8(o + 13);
    self.inv = v.getUint8(o + 14);
    self.block = v.getUint8(o + 15);
    self.ko = v.getUint8(o + 16);
    self.held = v.getUint8(o + 17);
    self.grab = v.getUint8(o + 18);
    self.mash = v.getUint8(o + 19);
    self.pb = v.getUint16(o + 20, true);
    o += SELF_BYTES;
  }
  const n = v.getUint8(o);
  o += 1;
  if (v.byteLength < o + n * 3) return false;
  for (let i = 0; i < n; i++) {
    const r = out.rows[i] ?? (out.rows[i] = { act: 0, actT: 0, xf: 0 });
    r.act = v.getUint8(o);
    r.actT = v.getUint8(o + 1);
    r.xf = v.getUint8(o + 2);
    o += 3;
  }
  out.n = n;
  return true;
}

/** Склеить общий список игроков и хвост в одно тело снимка (encodeSnapshot допишет его за заголовком). */
export function joinBody(entities: Uint8Array, tail: Uint8Array): Uint8Array {
  const out = new Uint8Array(entities.length + tail.length);
  out.set(entities, 0);
  out.set(tail, entities.length);
  return out;
}

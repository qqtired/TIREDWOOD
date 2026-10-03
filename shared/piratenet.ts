import { PIRATE_MAX, type PirateTail } from './pirates.ts';
/** flags/count, chest x/z centimetres, carrier/wave, self knock at/until u32 + vx/vz quarter m/s. */
export const PIRATE_HEAD = 18;
/** id u8, flags u8, x/z i16 cm, hp u8, yaw u8. No allocation proportional to untrusted count. */
export const PIRATE_BYTES = 8;
export const pirateTailSize = (count: number): number => PIRATE_HEAD + Math.max(0, Math.min(PIRATE_MAX, count)) * PIRATE_BYTES;
const i16 = (v: number) => Math.max(-32768, Math.min(32767, Math.round(v * 100)));
export function writePirateTail(out: Uint8Array, at: number, t: PirateTail): number {
  const v = new DataView(out.buffer, out.byteOffset, out.byteLength), n = t.visible ? Math.min(PIRATE_MAX, t.pirates.length) : 0;
  v.setUint8(at, t.visible ? 1 : 0); v.setUint8(at + 1, n);
  v.setInt16(at + 2, i16(t.chestX), true); v.setInt16(at + 4, i16(t.chestZ), true);
  v.setUint8(at + 6, t.carrier); v.setUint8(at + 7, t.wave);
  v.setUint32(at + 8, t.knock.at >>> 0, true); v.setUint32(at + 12, t.knock.until >>> 0, true);
  v.setInt8(at + 16, Math.round(Math.max(-31, Math.min(31, t.knock.vx)) * 4));
  v.setInt8(at + 17, Math.round(Math.max(-31, Math.min(31, t.knock.vz)) * 4));
  let o = at + PIRATE_HEAD;
  for (let i = 0; i < n; i++) { const p = t.pirates[i];
    v.setUint8(o, p.id); v.setUint8(o + 1, (p.captain ? 1 : 0) | (p.rage ? 2 : 0) | (p.carrying ? 4 : 0));
    v.setInt16(o + 2, i16(p.x), true); v.setInt16(o + 4, i16(p.z), true); v.setUint8(o + 6, p.hp);
    v.setUint8(o + 7, Math.round((p.yaw / (Math.PI * 2) + 1) * 256) & 255); o += PIRATE_BYTES;
  } return o;
}
/** Returns end offset or -1; copy all values only after the complete byte range is validated. */
export function readPirateTail(buf: ArrayBuffer, at: number, out: PirateTail): number {
  if (!Number.isSafeInteger(at) || at < 0 || buf.byteLength < at + PIRATE_HEAD) return -1;
  const v = new DataView(buf), n = v.getUint8(at + 1);
  if (n > PIRATE_MAX || buf.byteLength < at + pirateTailSize(n)) return -1;
  out.visible = !!(v.getUint8(at) & 1); out.chestX = v.getInt16(at + 2, true) / 100; out.chestZ = v.getInt16(at + 4, true) / 100;
  out.carrier = v.getUint8(at + 6); out.wave = v.getUint8(at + 7);
  out.knock.at = v.getUint32(at + 8, true); out.knock.until = v.getUint32(at + 12, true);
  out.knock.vx = v.getInt8(at + 16) / 4; out.knock.vz = v.getInt8(at + 17) / 4;
  let o = at + PIRATE_HEAD;
  for (let i = 0; i < n; i++) {
    const p = out.pirates[i] ?? (out.pirates[i] = { id: 0, x: 0, z: 0, hp: 0, yaw: 0, captain: false, rage: false, carrying: false });
    p.id = v.getUint8(o); const flags = v.getUint8(o + 1); p.captain = !!(flags & 1); p.rage = !!(flags & 2); p.carrying = !!(flags & 4);
    p.x = v.getInt16(o + 2, true) / 100; p.z = v.getInt16(o + 4, true) / 100; p.hp = v.getUint8(o + 6); p.yaw = v.getUint8(o + 7) / 256 * Math.PI * 2; o += PIRATE_BYTES;
  }
  out.pirates.length = n; return o;
}

import type { DgMark } from './types.ts';
import { cosDeg, wrapD, wrapP } from './util.ts';

export const HERO_RADIUS = 0.45;
/** Опасная зона для центра героя: те же границы, что у проверки попадания ниже. */
export function attackFootprint(mk: DgMark) {
  const padding = mk.dmg > 0 || mk.what === 'rail_warn' ? HERO_RADIUS : 0;
  const r = mk.r + padding;
  return {
    x: mk.k === 'lane' ? wrapP(mk.x - mk.dx * padding) : mk.x,
    z: mk.k === 'lane' ? wrapP(mk.z - mk.dz * padding) : mk.z,
    r, inner: mk.inner ? Math.abs(mk.inner - padding) : 0,
    len: mk.len + padding * 2, width: mk.w + padding * 2,
    angle: Math.min(180, mk.w),
    // Старый сектор включает метровый диск у источника даже позади направления.
    centerRadius: mk.k === 'sector' ? Math.min(1, r) : 0,
  };
}

/** Попадает ли герой в метку */
export function heroInMark(h: { x: number; z: number }, mk: DgMark): boolean {
  const ox = wrapD(h.x - mk.x);
  const oz = wrapD(h.z - mk.z);
  const R = HERO_RADIUS;
  switch (mk.k) {
    case 'circle':
    case 'ring':
      return ox * ox + oz * oz < (mk.r + R) * (mk.r + R) && (!mk.inner||ox*ox+oz*oz>(mk.inner-R)**2);
    case 'lane': {
      const along = ox * mk.dx + oz * mk.dz;
      const perp = Math.abs(ox * mk.dz - oz * mk.dx);
      return along > -R && along < mk.len + R && perp < mk.w / 2 + R;
    }
    case 'sector': {
      const d2 = ox * ox + oz * oz;
      if (d2 > (mk.r + R) * (mk.r + R)) return false;
      const d = Math.sqrt(d2);
      if (d < 1) return true;
      // w — полный угол в градусах; ≥ 180 — полуплоскость
      const dot = (ox * mk.dx + oz * mk.dz) / d;
      return mk.w >= 180 ? dot >= 0 : dot >= halfCos(mk.w);
    }
  }
  return false;
}
const halfCosCache = new Map<number, number>();
function halfCos(deg: number): number {
  let v = halfCosCache.get(deg);
  if (v === undefined) {
    v = cosDeg(deg / 2);
    halfCosCache.set(deg, v);
  }
  return v;
}


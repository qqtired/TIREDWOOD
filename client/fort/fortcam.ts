// Камера «Крепости»: за спиной над плечом, как в пейнтболе, но дальше — со стены видно ворота и подход орды.
// Колесо мыши — ближе и дальше (от FORT_CAM_MIN до FORT_CAM_MAX, плавно), расстояние помнится до перезагрузки
// страницы: новая игра, набережная и обратно — то же. Прицеливание (ПКМ) подводит камеру к плечу, как раньше.
// Сквозь стены не проходит: общий cameraRig (коробки карты: стены, башни, ход) и вид замка без коллизии —
// надвратная башня и эркеры. Мешает стена — камера подъезжает по линии взгляда, а не к затылку: тогда прицел
// показывает туда же, куда считает выстрел сервер (fortShotDir строит камеру на этой же линии).
import { CAM_MIN, CAM_PAD, PIVOT_Y, cameraRig, type RigParams, type V3 } from '../../shared/aim.ts';
import { clamp, damp, viewDir } from '../../shared/math.ts';
import type { CollisionWorld } from '../../shared/world.ts';
import { BARTIZAN, BARTIZANS, GATEHOUSE, decorItems } from './castle/layout.ts';

/** Камера за спиной, м: по умолчанию (было 2,9 — как в пейнтболе), ближе всего и дальше всего колесом */
export const FORT_CAM_DEFAULT = 5.5;
export const FORT_CAM_MIN = 2;
export const FORT_CAM_MAX = 12;

/** Колесо — на всю сессию страницы */
let saved = FORT_CAM_DEFAULT;

interface Box {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
}

/** Вид замка, которого нет в коллизии карты: камера в него не заходит */
function blockers(): Box[] {
  const g = GATEHOUSE;
  const zc = (g.z0 + g.z1) / 2;
  const hz = (g.z1 - g.z0) / 2;
  const out: Box[] = [
    // этаж надвратной башни на консолях и шатёр (ступенями)
    { x0: -g.hx, y0: g.beams, z0: g.z0, x1: g.hx, y1: g.eave, z1: g.z1 },
    { x0: -g.hx * 0.9, y0: g.eave, z0: zc - hz * 0.9, x1: g.hx * 0.9, y1: g.eave + (g.peak - g.eave) * 0.35, z1: zc + hz * 0.9 },
    { x0: -g.hx * 0.5, y0: g.eave + (g.peak - g.eave) * 0.35, z0: zc - hz * 0.5, x1: g.hx * 0.5, y1: g.eave + (g.peak - g.eave) * 0.75, z1: zc + hz * 0.5 },
  ];
  // каменные консоли-столбы под ней и арки между ними (спереди над «горлом», сзади над ходом по стене): иначе с хода
  // под башней камера встаёт за столб и игрока не видно
  const legs = new Set(['консоль спереди', 'консоль сзади', 'арка спереди', 'арка сзади']);
  for (const it of decorItems()) if (it.box && legs.has(it.name)) out.push({ ...it.box });
  // эркеры на северных бастионах: башенка и колпак
  for (const b of BARTIZANS) {
    out.push({ x0: b.x - BARTIZAN.r, y0: BARTIZAN.corbel, z0: b.z - BARTIZAN.r, x1: b.x + BARTIZAN.r, y1: BARTIZAN.top, z1: b.z + BARTIZAN.r });
    const e = BARTIZAN.eave * 0.85;
    out.push({ x0: b.x - e, y0: BARTIZAN.top, z0: b.z - e, x1: b.x + e, y1: BARTIZAN.top + (BARTIZAN.peak - BARTIZAN.top) * 0.6, z1: b.z + e });
  }
  return out;
}
const BLOCKERS = blockers();

/** Ближайшее пересечение луча (o + d·t, |d| = 1) с видом замка на [0, maxT]; нет — Infinity */
export function castleBlockT(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number): number {
  let best = Infinity;
  for (const b of BLOCKERS) {
    let t0 = 0;
    let t1 = maxT;
    let ok = true;
    for (let a = 0; a < 3 && ok; a++) {
      const o = a === 0 ? ox : a === 1 ? oy : oz;
      const d = a === 0 ? dx : a === 1 ? dy : dz;
      const lo = a === 0 ? b.x0 : a === 1 ? b.y0 : b.z0;
      const hi = a === 0 ? b.x1 : a === 1 ? b.y1 : b.z1;
      if (Math.abs(d) < 1e-9) {
        if (o < lo || o > hi) ok = false;
        continue;
      }
      let ta = (lo - o) / d;
      let tb = (hi - o) / d;
      if (ta > tb) [ta, tb] = [tb, ta];
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) ok = false;
    }
    if (ok && t0 < best) best = t0;
  }
  return best;
}

const _f = { x: 0, y: 0, z: 0 };

/** Длина вылета камеры от опоры без стен: −взгляд·back + плечо + вверх */
function rigLen(yaw: number, pitch: number, rig: RigParams, side: number, back: number): number {
  viewDir(yaw, pitch, _f);
  const s = side * rig.side;
  const dx = -_f.x * back + Math.cos(yaw) * s;
  const dy = -_f.y * back + rig.up;
  const dz = -_f.z * back - Math.sin(yaw) * s;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export class FortCam {
  private zoomTo = saved;
  private zoom = saved;
  /** Отъезд сейчас: к стене — сразу, обратно — плавно (за столбом камера не прыгает) */
  private back = -1;

  /** Колесо мыши (deltaY события): вниз — дальше, вверх — ближе */
  zoomBy(deltaY: number): void {
    this.zoomTo = clamp(this.zoomTo * Math.exp(deltaY * 0.0012), FORT_CAM_MIN, FORT_CAM_MAX);
    saved = this.zoomTo;
  }

  /** Сейчас и куда тянет колесо, м (для проверки) */
  get distance(): number {
    return this.zoom;
  }

  /** После смерти и входа — сразу на место */
  reset(): void {
    this.back = -1;
  }

  /**
   * Камера игрока в (x, y, z) — в out. rig — плечо и подъём (уже с прицеливанием), adsBack — отъезд при полном
   * прицеливании, adsK 0…1. Возвращает расстояние от опоры.
   */
  place(x: number, y: number, z: number, yaw: number, pitch: number, rig: RigParams, adsBack: number, adsK: number, side: number, world: CollisionWorld, dt: number, out: V3): number {
    this.zoom = damp(this.zoom, this.zoomTo, 12, dt);
    const want = this.zoom + (adsBack - this.zoom) * adsK;
    const oy = y + PIVOT_Y;
    // свободный отъезд по линии взгляда: пока отрезок от опоры до камеры упирается в стену — ближе
    let b = want;
    for (let i = 0; i < 5; i++) {
      const full = rigLen(yaw, pitch, rig, side, b);
      let d = cameraRig(x, y, z, yaw, pitch, rig, side, world, out, b);
      if (d > 1e-6) {
        const t = castleBlockT(x, oy, z, (out.x - x) / d, (out.y - oy) / d, (out.z - z) / d, d);
        if (t < d) d = Math.max(CAM_MIN, t - CAM_PAD);
      }
      if (d >= full - 1e-3 || b <= CAM_MIN) break;
      b = Math.max(CAM_MIN, b * (d / full) - 0.05);
    }
    if (this.back < 0 || b < this.back) this.back = b;
    else this.back = damp(this.back, b, 5, dt);
    let d = cameraRig(x, y, z, yaw, pitch, rig, side, world, out, this.back);
    if (d > 1e-6) {
      const t = castleBlockT(x, oy, z, (out.x - x) / d, (out.y - oy) / d, (out.z - z) / d, d);
      if (t < d) {
        const k = Math.max(CAM_MIN, t - CAM_PAD) / d;
        out.x = x + (out.x - x) * k;
        out.y = oy + (out.y - oy) * k;
        out.z = z + (out.z - z) * k;
        d *= k;
      }
    }
    return d;
  }
}

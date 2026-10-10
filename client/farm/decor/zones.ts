// Где что лежит на земле фермы — из планировки (shared/farmlayout.ts): дорожки, участки, площадки, твёрдые боксы,
// места E. Нужно, чтобы нарисовать землю и раскидать траву и мелочь мимо дорожек, грядок и проходов.
import { FARM_LAYOUT } from '../../../shared/farmlayout.ts';

type Layout = typeof FARM_LAYOUT;
type P2 = readonly [number, number];

/** Отрезок дорожки: от a до b, полуширина hw; kind — как рисовать */
export interface Seg {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  hw: number;
  kind: 'dirt' | 'track' | 'worn' | 'plot';
}

/** Дуга кольца: центр, радиус середины, полуширина, углы канвы (θ = a − 90°, от +x к +z) */
export interface Arc {
  cx: number;
  cz: number;
  r: number;
  hw: number;
  t0: number;
  t1: number;
}

export interface Circle {
  x: number;
  z: number;
  r: number;
}

export interface Plot {
  x: number;
  z: number;
  yaw: number;
  c: number;
  s: number;
}

/** Площадки: вытоптанный круг у костра и у пьедестала Древа */
export const FIRE_R = 3.0;
export const PEDESTAL_R = 3.7;
/** Внутренний край мощёного круга у колодца */
export const APRON_EDGE = 0.35;

export class FarmZones {
  readonly L: Layout = FARM_LAYOUT;
  readonly segs: Seg[] = [];
  readonly arcs: Arc[] = [];
  readonly apron: Circle;
  readonly fire: Circle;
  readonly pedestal: Circle & { half: number };
  readonly plots: Plot[];
  readonly hw = FARM_LAYOUT.plot.w / 2;
  readonly hl = FARM_LAYOUT.plot.l / 2;
  /** Твёрдые боксы и следы предметов (min/max по x, z) — мимо них ничего не ставим */
  readonly blocks: { x0: number; z0: number; x1: number; z1: number }[] = [];
  /** Места, где стоят игроки: E-места, точки появления */
  readonly spots: Circle[] = [];
  readonly trees: { x: number; z: number; kind: string }[];
  readonly van: P2[];

  constructor() {
    const L = this.L;
    const P = L.paths;
    this.apron = { x: P.apron.x, z: P.apron.z, r: P.apron.r };
    const ringR = (P.ring.in + P.ring.out) / 2;
    const ringHw = (P.ring.out - P.ring.in) / 2;
    for (const c of P.ring.centers) {
      // сектор своего корыта: ±45° от направления на него и чуть внахлёст, чтобы дуги сомкнулись на диагоналях
      const a = Math.atan2(c.x, -c.z);
      const mid = a - Math.PI / 2;
      this.arcs.push({ cx: c.x, cz: c.z, r: ringR, hw: ringHw, t0: mid - 0.86, t1: mid + 0.86 });
    }
    for (const r of P.radial) this.addLine([r.from as unknown as P2, r.to as unknown as P2], r.width / 2, 'dirt');
    this.addLine(P.road.points as unknown as P2[], P.road.width / 2, 'dirt');
    for (const f of P.foot) {
      if (!('points' in f)) continue;
      this.addLine(f.points as unknown as P2[], f.width / 2, f.id === 'SE' ? 'track' : 'dirt');
    }
    const van = L.objects.find((o) => o.id === 'van') as { drive?: number[][] } | undefined;
    this.van = (van?.drive ?? []).map((p) => [p[0], p[1]] as const);
    // колея Фургона по лужайке — от конца тропинки до стоянки
    const drive = this.van.slice(2);
    if (drive.length > 1) this.addLine(drive, 1.1, 'track');

    this.plots = L.plots.map((p) => ({ x: p.x, z: p.z, yaw: p.yaw, c: Math.cos(p.yaw), s: Math.sin(p.yaw) }));
    for (let i = 0; i < this.plots.length; i++) {
      // дорожка от калитки к кольцу
      this.addLine([this.plotPoint(i, 0, this.hl - 0.2), this.plotPoint(i, 0, this.hl + 1.3)], 0.6, 'dirt');
    }

    const fire = L.objects.find((o) => o.id === 'campfire')!;
    this.fire = { x: fire.x, z: fire.z, r: FIRE_R };
    const boss = L.objects.find((o) => o.id === 'boss')!;
    this.pedestal = { x: boss.x, z: boss.z, r: PEDESTAL_R, half: 2 };
    // тропинка от костра к месту у Древа
    const use = boss.use as { x: number; z: number };
    this.addLine([[fire.x - 1.6, fire.z + 2.2], [use.x + 0.4, use.z - 0.6]], 0.55, 'worn');

    for (const b of L.boxes) {
      if (b.id.startsWith('wall')) continue;
      this.blocks.push({ x0: b.min[0], z0: b.min[2], x1: b.max[0], z1: b.max[2] });
    }
    for (const o of L.objects) {
      const foot = (o as unknown as { foot?: readonly (readonly number[])[] }).foot;
      if (o.id === 'campfire' || o.id === 'boss' || !foot) continue;
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const [x, z] of foot) {
        x0 = Math.min(x0, x); x1 = Math.max(x1, x);
        z0 = Math.min(z0, z); z1 = Math.max(z1, z);
      }
      this.blocks.push({ x0, z0, x1, z1 });
      const u = (o as unknown as { use?: { x: number; z: number; r: number } | null }).use;
      if (u) this.spots.push({ x: u.x, z: u.z, r: u.r });
    }
    for (const t of L.troughs) this.spots.push({ x: t.use.x, z: t.use.z, r: t.use.r });
    for (const s of L.spawns) this.spots.push({ x: s.x, z: s.z, r: 1.4 });
    for (const p of L.plots) this.spots.push({ x: p.use.x, z: p.use.z, r: 0.9 });
    this.trees = L.trees.map((t) => ({ x: t.x, z: t.z, kind: t.kind }));
  }

  private addLine(pts: readonly P2[], hw: number, kind: Seg['kind']): void {
    for (let i = 0; i + 1 < pts.length; i++) this.segs.push({ ax: pts[i][0], az: pts[i][1], bx: pts[i + 1][0], bz: pts[i + 1][1], hw, kind });
  }

  /** Точка участка в мире: lx, lz — в осях участка (+Z — к калитке), как в world.ts */
  plotPoint(i: number, lx: number, lz: number): [number, number] {
    const p = this.plots[i];
    return [p.x + lx * p.c + lz * p.s, p.z - lx * p.s + lz * p.c];
  }

  /** Расстояние до края ближайшей дорожки (внутри — меньше нуля). kinds — какие дорожки считать */
  pathDist(x: number, z: number, withTracks = true): number {
    let d = Math.hypot(x - this.apron.x, z - this.apron.z) - this.apron.r;
    for (const s of this.segs) {
      if (!withTracks && s.kind === 'track') continue;
      d = Math.min(d, segDist(x, z, s) - s.hw);
    }
    for (const a of this.arcs) d = Math.min(d, arcDist(x, z, a) - a.hw);
    return d;
  }

  /** Расстояние до ближайшего участка (внутри — меньше нуля) */
  plotDist(x: number, z: number): number {
    let d = Infinity;
    for (const p of this.plots) {
      const dx = x - p.x;
      const dz = z - p.z;
      const lx = p.c * dx - p.s * dz;
      const lz = p.s * dx + p.c * dz;
      d = Math.min(d, boxDist(lx, lz, this.hw, this.hl));
    }
    return d;
  }

  /** Газон во дворе участка: не плетень, не грядка (с запасом), не тропинка посередине */
  yardLawn(x: number, z: number): boolean {
    const pl = this.L.plotLocal;
    for (const p of this.plots) {
      const dx = x - p.x;
      const dz = z - p.z;
      const lx = p.c * dx - p.s * dz;
      const lz = p.s * dx + p.c * dz;
      if (Math.abs(lx) > this.hw || Math.abs(lz) > this.hl) continue;
      if (Math.abs(lx) > this.hw - 0.3 || Math.abs(lz) > this.hl - 0.3) return false;
      if (Math.abs(lx) < pl.path.x1 + 0.25 && lz > pl.path.z0 - 0.3) return false;
      for (const b of pl.beds) if (Math.abs(lx - b.x) < pl.bedSize / 2 + 0.3 && Math.abs(lz - b.z) < pl.bedSize / 2 + 0.3) return false;
      return true;
    }
    return false;
  }

  /** Расстояние до площадок у костра и у Древа (вытоптанные круги) */
  padDist(x: number, z: number): number {
    const f = Math.hypot(x - this.fire.x, z - this.fire.z) - this.fire.r;
    const p = Math.hypot(x - this.pedestal.x, z - this.pedestal.z) - this.pedestal.r;
    return Math.min(f, p);
  }

  /** Расстояние до твёрдых боксов, следов предметов и мест E */
  blockDist(x: number, z: number): number {
    let d = Infinity;
    for (const b of this.blocks) d = Math.min(d, boxDist(x - (b.x0 + b.x1) / 2, z - (b.z0 + b.z1) / 2, (b.x1 - b.x0) / 2, (b.z1 - b.z0) / 2));
    for (const s of this.spots) d = Math.min(d, Math.hypot(x - s.x, z - s.z) - s.r);
    return d;
  }

  treeDist(x: number, z: number): number {
    let d = Infinity;
    for (const t of this.trees) d = Math.min(d, Math.hypot(x - t.x, z - t.z));
    return d;
  }

  /** Сколько до забора изнутри (меньше нуля — за забором; на юге — перила над обрывом) */
  fenceDist(x: number, z: number): number {
    const B = this.L.bounds;
    return Math.min(x - B.minX, B.maxX - x, z - B.minZ, B.maxZ - z);
  }

  /** Свободное место для мелочи: не дорожка, не участок, не площадка, не предмет */
  free(x: number, z: number, pad = 0.2): boolean {
    return this.pathDist(x, z) > pad && this.plotDist(x, z) > pad && this.padDist(x, z) > pad && this.blockDist(x, z) > pad
      && this.treeDist(x, z) > 0.45 + pad;
  }
}

export function segDist(x: number, z: number, s: { ax: number; az: number; bx: number; bz: number }): number {
  const dx = s.bx - s.ax;
  const dz = s.bz - s.az;
  const l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.min(1, Math.max(0, ((x - s.ax) * dx + (z - s.az) * dz) / l2)) : 0;
  return Math.hypot(x - (s.ax + dx * t), z - (s.az + dz * t));
}

export function arcDist(x: number, z: number, a: Arc): number {
  const dx = x - a.cx;
  const dz = z - a.cz;
  let t = Math.atan2(dz, dx);
  const mid = (a.t0 + a.t1) / 2;
  while (t - mid > Math.PI) t -= Math.PI * 2;
  while (t - mid < -Math.PI) t += Math.PI * 2;
  if (t >= a.t0 && t <= a.t1) return Math.abs(Math.hypot(dx, dz) - a.r);
  const e = t < a.t0 ? a.t0 : a.t1;
  return Math.hypot(x - (a.cx + Math.cos(e) * a.r), z - (a.cz + Math.sin(e) * a.r));
}

/** Знаковое расстояние до прямоугольника с полуразмерами hx, hz в его осях */
export function boxDist(lx: number, lz: number, hx: number, hz: number): number {
  const qx = Math.abs(lx) - hx;
  const qz = Math.abs(lz) - hz;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
}

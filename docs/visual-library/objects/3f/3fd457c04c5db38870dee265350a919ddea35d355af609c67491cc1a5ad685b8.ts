// Ворота «по прочности» — без three.js: какие доски целы, пробиты или выбиты, какие трещины видны, какое железо стоит
// на ступени укрепления. Всё по порогам: одинаковая прочность и ступень — одинаковый вид у всех игроков, в любом
// порядке снимков (пришёл в разгар волны — видишь то же, что и остальные).
import { makeRng } from '../../../shared/math.ts';
import { LEAF } from './layout.ts';

export const PLANK_WHOLE = 0;
export const PLANK_HOLED = 1;
export const PLANK_GONE = 2;

/** Доска створки: поперёк — от петли (u0…u1), дыра — по высоте от низа створки */
export interface PlankSlot {
  /** 0 — левая створка (x < 0), 1 — правая */
  leaf: number;
  /** 0 — у петли … 4 — посередине проёма */
  i: number;
  u0: number;
  u1: number;
  hole: readonly [number, number];
  /** ниже этой доли прочности доска пробита (−1 — никогда) */
  holeAt: number;
  /** ниже этой — выбита и лежит на земле (−1 — никогда) */
  goneAt: number;
  /** яркость доски (чуть разные) */
  tint: number;
}

/** Пороги подобраны руками: первая дыра на 70 %, к 50 % — три, к 10 % — почти все, выбиты четыре доски из десяти */
const PLANK_PLAN: ReadonlyArray<readonly [number, number, number, number]> = [
  // [дыра от, дыра до, пробита ниже, выбита ниже]
  [1.55, 2.25, 0.22, -1],
  [0.5, 1.2, 0.48, 0.08],
  [1.75, 2.55, 0.62, -1],
  [0.85, 1.5, 0.35, 0.16],
  [2.0, 2.7, 0.3, -1],
  [0.6, 1.25, 0.4, -1],
  [1.6, 2.4, 0.18, 0.05],
  [0.75, 1.45, 0.55, 0.25],
  [1.9, 2.6, 0.7, -1],
  [0.45, 1.05, 0.42, -1],
];

export const PLANKS: readonly PlankSlot[] = PLANK_PLAN.map(([a, b, holeAt, goneAt], k) => {
  const leaf = k < LEAF.planks ? 0 : 1;
  const i = k % LEAF.planks;
  const pw = LEAF.w / LEAF.planks;
  return { leaf, i, u0: i * pw + 0.007, u1: (i + 1) * pw - 0.007, hole: [a, b] as const, holeAt, goneAt, tint: 0.9 + ((k * 37) % 11) / 50 };
});

export function plankState(s: PlankSlot, hp01: number): number {
  if (s.goneAt >= 0 && hp01 < s.goneAt) return PLANK_GONE;
  if (s.holeAt >= 0 && hp01 < s.holeAt) return PLANK_HOLED;
  return PLANK_WHOLE;
}

/** Трещина: на какой створке и стороне (0 — снаружи, 1 — со двора), где, размер, поворот, с какой прочности видна */
export interface Crack {
  leaf: number;
  side: number;
  u: number;
  y: number;
  size: number;
  rot: number;
  at: number;
}

export const CRACKS: readonly Crack[] = (() => {
  const out: Crack[] = [];
  for (let leaf = 0; leaf < 2; leaf++) {
    const rng = makeRng(31 + leaf * 7);
    for (let k = 0; k < 8; k++) {
      out.push({
        leaf, side: 0, u: 0.25 + rng() * (LEAF.w - 0.5), y: 0.35 + rng() * (LEAF.h - 0.7), size: 0.38 + rng() * 0.42,
        rot: (rng() - 0.5) * 1.6, at: 0.93 - k * 0.085 - leaf * 0.04,
      });
    }
    for (let k = 0; k < 3; k++) {
      out.push({ leaf, side: 1, u: 0.3 + rng() * (LEAF.w - 0.6), y: 0.4 + rng() * (LEAF.h - 0.8), size: 0.4 + rng() * 0.3, rot: (rng() - 0.5) * 1.6, at: 0.7 - k * 0.22 });
    }
  }
  return out;
})();

export const crackShown = (c: Crack, hp01: number): boolean => hp01 < c.at;

export const IRON_BOX = 0;
export const IRON_RIVET = 1;
export const IRON_SPIKE = 2;
export const IRON_BOSS = 3;

/**
 * Железо на створке (для одной створки; правая — зеркально). u — от петли, y — от низа, размеры в метрах, наружу — −z.
 * Видно при from ≤ ступень ≤ to; с goldFrom — позолочено.
 */
export interface IronPart {
  kind: number;
  u: number;
  y: number;
  su: number;
  sy: number;
  sz: number;
  /** поворот в плоскости створки (ромбики на концах петель) */
  rot: number;
  from: number;
  to: number;
  goldFrom: number;
}

/** Высоты полос: нижняя, средняя, верхняя */
export const BAND_Y = [0.55, 1.47, 2.39] as const;

export const IRON: readonly IronPart[] = (() => {
  const W = LEAF.w;
  const Hh = LEAF.h;
  const out: IronPart[] = [];
  const box = (u0: number, u1: number, y0: number, y1: number, sz: number, from: number, to = 99, rot = 0): void => {
    out.push({ kind: IRON_BOX, u: (u0 + u1) / 2, y: (y0 + y1) / 2, su: u1 - u0, sy: y1 - y0, sz, rot, from, to, goldFrom: 99 });
  };
  const rivet = (u: number, y: number, from: number, r = 0.03): void => {
    out.push({ kind: IRON_RIVET, u, y, su: r, sy: r, sz: r * 0.8, rot: 0, from, to: 99, goldFrom: 8 });
  };
  // петли — всегда: «кулаки» у края и короткие навесы с ромбиком (на 0-й ступени), дальше — полосы во всю ширину
  for (const y of [BAND_Y[0], BAND_Y[2]]) {
    box(-0.06, 0.05, y - 0.13, y + 0.13, 0.16, 0);
    box(0.02, 1.5, y - 0.045, y + 0.045, 0.025, 0, 0);
    box(1.45, 1.6, y - 0.075, y + 0.075, 0.025, 0, 0, Math.PI / 4);
    box(0.02, W - 0.03, y - 0.05, y + 0.05, 0.025, 1);
    for (let k = 0; k < 8; k++) rivet(0.18 + k * 0.33, y, 2);
  }
  // 3: средняя полоса
  box(0.02, W - 0.03, BAND_Y[1] - 0.05, BAND_Y[1] + 0.05, 0.025, 3);
  for (let k = 0; k < 8; k++) rivet(0.18 + k * 0.33, BAND_Y[1], 3);
  // 4: уголки
  for (const [ua, ub] of [[0.02, 0.46], [W - 0.46, W - 0.02]] as const) {
    const near = ua < 0.1;
    for (const top of [false, true]) {
      const y0 = top ? Hh - 0.2 : 0.06;
      const y1 = top ? Hh - 0.06 : 0.2;
      box(ua, ub, y0, y1, 0.032, 4);
      const ux0 = near ? ua : ub - 0.14;
      box(ux0, ux0 + 0.14, top ? Hh - 0.46 : 0.06, top ? Hh - 0.06 : 0.46, 0.032, 4);
      rivet(near ? ua + 0.07 : ub - 0.07, top ? Hh - 0.13 : 0.13, 4, 0.034);
    }
  }
  // 5: продольные полосы у петли и у середины
  for (const u of [0.24, W - 0.2]) {
    box(u - 0.045, u + 0.045, 0.24, Hh - 0.24, 0.022, 5);
    for (const y of [1.0, 1.93]) rivet(u, y, 5);
  }
  // 6: оковка низа и верха
  box(0.02, W - 0.02, 0.0, 0.36, 0.018, 6);
  box(0.02, W - 0.02, Hh - 0.13, Hh, 0.018, 6);
  for (let k = 0; k < 6; k++) rivet(0.3 + k * 0.42, 0.28, 6);
  // 7: шипы на полосах
  for (const [y, ks] of [[BAND_Y[1], [1, 3, 5, 7]], [BAND_Y[0], [2, 5]], [BAND_Y[2], [2, 5]]] as const) {
    for (const k of ks) out.push({ kind: IRON_SPIKE, u: 0.18 + k * 0.33, y, su: 0.05, sy: 0.05, sz: LEAF.spike, rot: 0, from: 7, to: 99, goldFrom: 8 });
  }
  // 8: золотой умбон с короной посередине створки
  out.push({ kind: IRON_BOSS, u: W * 0.56, y: BAND_Y[1], su: 0.22, sy: 0.22, sz: 0.07, rot: 0, from: 8, to: 99, goldFrom: 8 });
  return out;
})();

export const ironShown = (p: IronPart, tier: number): boolean => tier >= p.from && tier <= p.to;

/** Створки подаются внутрь (щель посередине), когда прочность мала, — рад на створку */
export function giveAngle(hp01: number): number {
  return hp01 >= 0.35 ? 0 : ((0.35 - Math.max(0, hp01)) / 0.35) * 0.055;
}

/** Провис свободного края створки, рад */
export function sagAngle(hp01: number): number {
  const d = 1 - Math.max(0, Math.min(1, hp01));
  return d * d * 0.018;
}

/** Сводка вида ворот (для проверки и подписи стенда) */
export function gateLook(hp01: number, tier: number): { holed: number; gone: number; cracks: number; iron: number } {
  let holed = 0;
  let gone = 0;
  for (const s of PLANKS) {
    const st = plankState(s, hp01);
    if (st === PLANK_HOLED) holed++;
    else if (st === PLANK_GONE) gone++;
  }
  const cracks = CRACKS.filter((c) => crackShown(c, hp01)).length;
  const iron = IRON.filter((p) => ironShown(p, tier)).length * 2;
  return { holed, gone, cracks, iron };
}

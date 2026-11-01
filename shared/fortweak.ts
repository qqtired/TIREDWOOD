// Т-23 «Слабые места тяжёлых» (с FORT50, бриф docs/fort50/brief-ideas.md): одна таблица на сервер, клиент
// и модели. Место — шар в осях моба: fwd — вперёд по взгляду, up — над ногами, side — вправо от моба; метры при росте 1
// (элита и чемпион умножают и место, и радиус). Модели ставят свою деталь (бочонок, клапан, ремень) центром
// сюда; стенд проверяет совпадение через weakSpotWorld.
import { Z_ARMORED, Z_BRUTE, Z_SHIELD } from './fortkinds.ts';

export interface WeakSpot {
  fwd: number;
  up: number;
  side: number;
  r: number;
  /** Что это — для подсказки и стенда */
  name: string;
}

export const WEAK_SPOTS: Readonly<Record<number, WeakSpot>> = {
  [Z_BRUTE]: { fwd: -0.8, up: 1.5, side: 0, r: 0.34, name: 'бочонок на спине' },
  [Z_ARMORED]: { fwd: -0.25, up: 1.62, side: 0, r: 0.2, name: 'клапан на кастрюле' },
  // у бобра спина тоньше черепахи: −0,3 — обе пряжки внутри шара (стенд lab/fort-ideas/models.html)
  [Z_SHIELD]: { fwd: -0.3, up: 1.0, side: 0, r: 0.24, name: 'ремень щита' },
};

/** Урон в слабое место — вместо множителя головы */
export const WEAK_MUL = 2.5;
/** Луч входит в шар слабого места не глубже этого за входом в тело (спереди сквозь тело — не засчитывается), м */
export const WEAK_DEPTH = 0.25;
/** Моб шатается после попадания, с; не чаще раза в WEAK_STAGGER_GAP_S, с */
export const WEAK_STAGGER_S = 0.6;
export const WEAK_STAGGER_GAP_S = 3;

/**
 * Центр слабого места в мире: ноги (x, y, z), курс yaw как у сервера (лицом в (−sin yaw, −cos yaw)), рост scale.
 * out — [x, y, z, r]; false — у вида нет слабого места.
 */
export function weakSpotWorld(kind: number, x: number, y: number, z: number, yaw: number, scale: number, out: number[]): boolean {
  const w = WEAK_SPOTS[kind];
  if (!w) return false;
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  // вперёд (−sin, −cos), вправо (cos, −sin)
  out[0] = x + (-s * w.fwd + c * w.side) * scale;
  out[1] = y + w.up * scale;
  out[2] = z + (-c * w.fwd - s * w.side) * scale;
  out[3] = w.r * scale;
  return true;
}

/** Луч (o, d — единичный) и шар: расстояние входа, −1 — мимо */
export function raySphere(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, cx: number, cy: number, cz: number, r: number): number {
  const lx = cx - ox;
  const ly = cy - oy;
  const lz = cz - oz;
  const tc = lx * dx + ly * dy + lz * dz;
  const d2 = lx * lx + ly * ly + lz * lz - tc * tc;
  if (d2 > r * r) return -1;
  const t = tc - Math.sqrt(r * r - d2);
  return t >= 0 ? t : tc >= 0 ? 0 : -1;
}

/** Попадание в тело на расстоянии tBody — в слабое место? (вход в шар не глубже WEAK_DEPTH за входом в тело) */
export function weakHit(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, tBody: number, spot: ArrayLike<number>): boolean {
  const t = raySphere(ox, oy, oz, dx, dy, dz, spot[0], spot[1], spot[2], spot[3]);
  return t >= 0 && t <= tBody + WEAK_DEPTH;
}

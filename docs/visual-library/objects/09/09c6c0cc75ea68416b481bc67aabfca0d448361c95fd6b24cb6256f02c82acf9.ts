// Порт B «Маячный мол» (WP4): типизированный взгляд на P3.port из docs/plaza3/level/layout.json. Числа — раскладка v5.1
// (concepts_blender/plaza3/layout/layout.md §9); подключают их pick()/xf() в shared/fishplaces.ts, ferry.ts, ownboat.ts.
// Здесь ничего не считается: только форма данных (P3.port в types.ts — Record<string, unknown>, чтобы схему не раздувать).
import { P3 } from './layout.ts';

/** Бокс на земле: [x0, z0, x1, z1] */
export type PortBox4 = readonly [number, number, number, number];
export type PortPt = readonly [number, number];

export interface PortDeck {
  id: string;
  box: PortBox4;
  /** Верх настила */
  y: number;
  kind: 'stone' | 'wood';
}

export interface PortData {
  /**
   * Маячный мол, голова мола, сходни к стоянке (их рисует модель pav_mole.glb) и помост Лавки Семёна lavka (доски —
   * client/lobby/fishplaces3d.ts); верх y −0,5. В карте все они невидимые: видимый настил один — модель или помост.
   */
  decks: readonly PortDeck[];
  /** Плоское сопряжение с площадкой маяка на y 0. */
  stair: { box: PortBox4; y: number };
  /** Пологий переход к нижнему молу; физика аппроксимирует его невидимыми ступенями ≤ 0,1 м. */
  ramp: { box: PortBox4; y0: number; y1: number; steps: number };
  /** Красный огонь на голове мола */
  light: { x: number; z: number; h: number };
  /** Места 20–27: 0–1 на голове мола, 2–7 на южной кромке мола (номера и порядок как были) */
  farSpots: ReadonlyArray<{ index: number; x: number; z: number; yaw: number }>;
  park: { x: number; z: number; gate: { x: number; z: number } };
  ferry: {
    home: { x: number; z: number; yaw: number };
    board: { x: number; z: number; yaw: number; r: number };
    landing: { x: number; z: number; yaw: number };
    sign: { x: number; z: number };
    spots: readonly PortPt[];
    out: readonly PortPt[];
    back: readonly PortPt[];
  };
  /** Лавка Семёна на помосте lavka (южная сторона мола, у сходней к стоянке): всё стоит на настиле y */
  semyon: {
    /** Корень модели pav_semyon.glb (client/lobby/plaza3/pavdata.ts): лицо — на −Z корня */
    root: { x: number; z: number; yaw: number };
    y: number;
    house: { x0: number; z0: number; x1: number; z1: number };
    npc: { x: number; z: number; yaw: number };
    use: { x: number; z: number; yaw: number; r: number };
    /** Стойка «Снасти у Семёна» (client/lobby/fisherman.ts) — середина и куда смотрит */
    gear: { x: number; z: number; yaw: number };
  };
  showcase: {
    box: { x0: number; z0: number; x1: number; z1: number };
    use: { x: number; z: number; yaw: number; r: number };
    podium: { x: number; z: number; yaw: number };
    board: { x: number; z: number; yaw: number; w: number; h: number; panelY: number };
  };
  pirates: { zone: { x0: number; x1: number; z0: number; z1: number } };
}

/** Данные порта plaza3 (читать только за веткой PLAZA3 / pick(): в старой раскладке они не нужны) */
export const PORT = P3.port as unknown as PortData;

/** Верх мола и головы мола (места ловли на моле стоят на этой высоте) */
export const MOLE_DECK_Y = -0.5;

/** Опоры рампы идут от мола к площадке, без перекрытий; видимая поверхность одна — модель. */
export function moleRampSteps(): ReadonlyArray<{ min: [number, number, number]; max: [number, number, number] }> {
  const { box: [x0, z0, x1, z1], y0, y1, steps } = PORT.ramp;
  return Array.from({ length: steps }, (_, k) => ({
    min: [x0 + (x1 - x0) * k / steps, y0 - 0.6, z0],
    max: [x0 + (x1 - x0) * (k + 1) / steps, y0 + (y1 - y0) * (k + 1) / steps, z1],
  }));
}

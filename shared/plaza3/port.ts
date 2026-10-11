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
  /** Маячный мол, голова мола, сходни к стоянке (верх y −0,5) */
  decks: readonly PortDeck[];
  /** Ступень площадка маяка → мол (на 0,25 выше мола) */
  stair: { box: PortBox4; y: number };
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
  semyon: {
    house: { x0: number; z0: number; x1: number; z1: number };
    npc: { x: number; z: number; yaw: number };
    use: { x: number; z: number; yaw: number; r: number };
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

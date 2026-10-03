// Stable course identities: legacy port geometry and records stay in their own namespace.
import { buildRing, type Ring } from './maps/ring.ts';
import { buildLand } from './maps/ringland.ts';
import { buildTrack, type TrackDef } from './track.ts';

export type RaceTrackId = 'port' | 'foundry';
export const RACE_TRACKS: ReadonlyArray<{ id: RaceTrackId; name: string; description: string }> = [
  { id: 'port', name: 'Портовое кольцо', description: 'Классическая трасса · причалы и прыжки' },
  { id: 'foundry', name: 'Литейный вираж', description: 'Сложная трасса · прессы, шиканы и новые бонусы' },
];
export function isRaceTrackId(id: unknown): id is RaceTrackId { return id === 'port' || id === 'foundry'; }

export const FOUNDRY: TrackDef = {
  name: 'Литейный вираж', width: 16, step: 2,
  nodes: [
    { x: -165, z: 125, r: 18 }, { x: 155, z: 125, r: 28 },
    { x: 155, z: -105, r: 22 }, { x: 45, z: -105, r: 16 },
    { x: 45, z: -35, r: 14 }, { x: -25, z: -35, r: 14 },
    { x: -25, z: -105, r: 16 }, { x: -165, z: -105, r: 22 },
    { x: -165, z: -30, r: 14 }, { x: -100, z: -30, r: 14 },
    { x: -100, z: 35, r: 14 }, { x: -35, z: 35, r: 14 },
    { x: -35, z: 80, r: 14 }, { x: -165, z: 80, r: 12 },
  ],
  widths: [
    { leg: 0, at: 100, w: 18 }, { leg: 0, at: 230, w: 18 },
    { leg: 1, at: 20, w: 12 }, { leg: 1, at: 140, w: 12 },
    { leg: 2, at: 30, w: 14 }, { leg: 3, at: 10, w: 10 },
    { leg: 5, at: 10, w: 10 }, { leg: 6, at: 20, w: 16 },
    { leg: 6, at: 90, w: 16 }, { leg: 8, at: 10, w: 11 },
    { leg: 10, at: 10, w: 11 }, { leg: 12, at: 50, w: 13 },
  ],
  start: { leg: 0, at: 40 },
  checkpoints: [
    { leg: 0, at: 110 }, { leg: 0, at: 240 }, { leg: 1, at: 35 }, { leg: 1, at: 115 },
    { leg: 2, at: 30 }, { leg: 3, at: 15 }, { leg: 4, at: 15 }, { leg: 5, at: 15 },
    { leg: 6, at: 30 }, { leg: 7, at: 12 }, { leg: 8, at: 12 }, { leg: 9, at: 15 },
    { leg: 10, at: 12 }, { leg: 11, at: 8 }, { leg: 12, at: 70 }, { leg: 13, at: 5 },
  ],
  ramps: [{ leg: 1, at: 55, up: 12, height: 2.4, gap: 12 }],
  open: [{ leg: 1, side: 'right', from: 10, to: 140 }],
  crates: [
    { leg: 0, at: 78, count: 4 }, { leg: 0, at: 204, count: 2, lat: 4 },
    { leg: 1, at: 125, count: 3 }, { leg: 4, at: 25, count: 3 },
    { leg: 6, at: 94, count: 4 }, { leg: 9, at: 26, count: 3 }, { leg: 12, at: 90, count: 4 },
  ],
  hazards: {
    pads: [
      { leg: 0, at: 155, lat: 4.5, len: 8, w: 3.5 },
      { leg: 1, at: 44, len: 7, w: 4 }, { leg: 6, at: 60, lat: -4.5, len: 7, w: 3 },
      { leg: 12, at: 40, lat: 2.8, len: 7, w: 3 },
    ],
    blocks: [
      // Central island: left is a clear bypass, right trades gate timing for boost and extra crates.
      { leg: 0, at: 170, len: 42, wid: 1.2 },
      { leg: 8, at: 23, lat: -2.4, len: 4.2, wid: 1, yaw: Math.PI / 2 },
      { leg: 9, at: 8, lat: 2.4, len: 4.2, wid: 1, yaw: Math.PI / 2 },
    ],
    slicks: [
      { leg: 3, at: 29, lat: 2.5, kind: 'oil', rl: 4, rw: 1.8 },
      { leg: 5, at: 29, lat: -2.5, kind: 'water', rl: 4, rw: 1.8 },
      { leg: 12, at: 22, lat: -2.5, kind: 'oil', rl: 4, rw: 2 },
    ],
    movers: [
      { kind: 'gate', leg: 0, at: 183, lat: 4.7, len: 6.8, wid: 1, period: 300 },
      { kind: 'gate', leg: 6, at: 75, lat: -4.5, len: 5.5, wid: 1, period: 270, phase: 110 },
      { kind: 'spin', leg: 6, at: 48, lat: 3, arm: 3.2, r: 0.35, period: -240 },
      { kind: 'spin', leg: 10, at: 27, lat: -3, arm: 2.6, r: 0.3, period: 250 },
    ],
  },
};

export function buildRaceCourse(id: RaceTrackId = 'port'): Ring {
  if (id === 'port') return buildRing();
  if (id !== 'foundry') throw new Error('Unknown race course');
  const track = buildTrack(FOUNDRY);
  track.strictCheckpoints = true;
  return { track, land: buildLand(track, [22]), deco: {
    yards: [{ x0: -115, z0: 96, x1: -45, z1: 111, alongZ: false }],
    sheds: [
      { x0: 0, z0: 55, x1: 72, z1: 72, h: 12, alongZ: false, color: 0x925a3f },
      { x0: 80, z0: -65, x1: 110, z1: 10, h: 14, alongZ: true, color: 0x657887 },
    ],
    tanks: [{ x: 85, z: 50, r: 8, h: 16 }, { x: 108, z: 50, r: 8, h: 12 }],
    cranes: [], cabins: [[-60, 0, 0]], water: [],
    signs: [
      { x: -20, z: 112, yaw: -Math.PI / 2, w: 7, text: 'ПРЕСС → БОНУС', bg: '#975316', dir: 1 },
      { x: 140, z: 55, yaw: 0, w: 6, text: 'РАЗГОН → ПРЫЖОК', bg: '#1d5fae', dir: 0 },
      { x: 52, z: -75, yaw: Math.PI, w: 5, text: 'ТОРМОЗИ · S', bg: '#a44426', dir: 0 },
    ],
  } };
}

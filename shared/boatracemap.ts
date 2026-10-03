import { buildTrack, type Track } from './track.ts';
export interface BoatGate { x: number; z: number; hx: number; hz: number; half: number; seg: number }
export interface BoatCourse { track: Track; gates: BoatGate[]; buoys: Array<{ x: number; z: number; gate: number; side: number }>; pickups: number[] }
export function makeBoatCourse(): BoatCourse {
  const track = buildTrack({ name: 'Лазурный круг', nodes: [
    { x: -100, z: -65, r: 24 }, { x: 75, z: -65, r: 23 }, { x: 115, z: -15, r: 23 },
    { x: 90, z: 75, r: 25 }, { x: -65, z: 85, r: 26 }, { x: -115, z: 15, r: 24 },
  ], width: 20, step: 2, start: { leg: 0, at: 25 }, checkpoints: [{ leg: 0, at: 100 }, { leg: 1, at: 8 }, { leg: 2, at: 24 }, { leg: 3, at: 55 }, { leg: 4, at: 15 }, { leg: 5, at: 20 }], ramps: [], open: [], crates: [] });
  const gates = [...track.cpSeg].map(seg => ({ x: track.px[seg], z: track.pz[seg], hx: track.tx[seg], hz: track.tz[seg], half: 10, seg }));
  const buoys = gates.flatMap((g, gate) => [-1, 1].map(side => ({ x: g.x - g.hz * g.half * side, z: g.z + g.hx * g.half * side, gate, side })));
  return { track, gates, buoys, pickups: [2, 5] };
}

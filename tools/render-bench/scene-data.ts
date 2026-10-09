import type { SceneConfig } from './types.ts';

export interface BuildingData { x: number; z: number; width: number; height: number; depth: number; color: number }
export interface TreeData { x: number; z: number; scale: number }
export interface PlayerData { x: number; z: number; phase: number; color: number; radius: number }
export interface RainData { x: number; z: number; phase: number }
export interface SceneData {
  buildings: BuildingData[];
  trees: TreeData[];
  players: PlayerData[];
  rain: RainData[];
}

// Local generator: no global random state and no renderer-dependent descriptors.
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let n = Math.imul(state ^ state >>> 15, state | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}

export function createSceneData(config: SceneConfig): SceneData {
  if (!Number.isInteger(config.seed) || config.seed < 0 || config.seed > 0xffffffff) throw new RangeError('seed must be a uint32');
  if (!Number.isInteger(config.players) || config.players < 0 || config.players > 640) throw new RangeError('players must be an integer from 0 to 640');
  if (typeof config.rain !== 'boolean') throw new TypeError('rain must be boolean');
  const complexity = config.complexity === undefined ? 1 : config.complexity;
  if (complexity !== 1 && complexity !== 10) throw new RangeError('complexity must be 1 or 10');
  const world = random(config.seed);
  const people = random(config.seed ^ 0x5a17b3d2);
  const drops = random(config.seed ^ 0x743e9821);
  const facades = [0xf3ddbd, 0xf8e9d1, 0xdfbba4, 0xe9cdbb];
  const colors = [0xf18c8d, 0x8dc9b3, 0x8aafe4, 0xd9a1cc, 0xefbb79, 0xb5a3dc];
  const data: SceneData = {
    buildings: Array.from({ length: 10 }, (_, i) => ({
      x: -27 + i * 6, z: -13, width: 4.5 + world(), height: 4 + world() * 3,
      depth: 5 + world() * 2, color: facades[i % facades.length],
    })),
    trees: Array.from({ length: 24 }, (_, i) => ({
      x: -32 + (i % 12) * 5.7, z: i < 12 ? -7.5 : 7.8, scale: 0.8 + world() * 0.4,
    })),
    players: Array.from({ length: config.players }, (_, i) => ({
      x: -19 + people() * 38, z: -3.5 + people() * 9, phase: people() * Math.PI * 2,
      color: colors[i % colors.length], radius: 0.65 + people() * 0.15,
    })),
    rain: config.rain ? Array.from({ length: 1800 * complexity }, () => ({
      x: -34 + drops() * 68, z: -17 + drops() * 47, phase: drops(),
    })) : [],
  };
  if (complexity === 10) {
    // Separate stream keeps all original world descriptors bit-for-bit unchanged.
    const extra = random(config.seed ^ 0x1874acf3);
    for (let i = 0; i < 90; i++) data.buildings.push({
      x: -31.5 + (i % 30) * (63 / 29), z: -4 + Math.floor(i / 30) * 4,
      width: 1.25 + extra() * 0.3, height: 1.7 + extra() * 0.6,
      depth: 1.2 + extra() * 0.25, color: facades[i % facades.length],
    });
    for (let i = 0; i < 216; i++) data.trees.push({
      x: -31.8 + (i % 54) * 1.2, z: [-5.8, -2.2, 1.8, 5.8][Math.floor(i / 54)],
      scale: 0.28 + extra() * 0.12,
    });
  }
  return data;
}

export function sceneSignature(config: SceneConfig, data: SceneData): string {
  const baselineConfig = { seed: config.seed, players: config.players, rain: config.rain };
  const sky = { color: 0x9ddbf1, radius: 140, widthSegments: 16, heightSegments: 8 };
  const heavy = config.complexity === 10;
  const source = JSON.stringify(heavy
    ? { version: 3, complexity: 10, waterSegments: [960, 80], counts: { buildings: 100, trees: 240, rain: data.rain.length }, sky, config: { ...baselineConfig, complexity: 10 }, data }
    : { version: 2, sky, config: baselineConfig, data });
  let hash = 0x811c9dc5;
  for (let i = 0; i < source.length; i++) hash = Math.imul(hash ^ source.charCodeAt(i), 0x01000193);
  return `${heavy ? 'harbour-v3-10x' : 'harbour-v2'}-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function playerPose(player: PlayerData, seconds: number) {
  return {
    x: player.x + Math.sin(seconds * 0.45 + player.phase) * 0.8,
    y: player.radius * 0.92 + Math.sin(seconds * 2.2 + player.phase) * 0.055,
    z: player.z + Math.cos(seconds * 0.38 + player.phase) * 0.6,
    yaw: Math.sin(seconds * 0.3 + player.phase) * 0.4,
  };
}

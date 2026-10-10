// «Подземелье»: построить карту-тор (world.ts) из наборов пропов по кускам, не замораживая экран загрузки.
import type { DungeonAssets } from './assets.ts';
import type { WorldLike } from './game.ts';
import { DungeonWorld, type LevelData } from './world.ts';
import level from '../assets/dungeon/level-data.json';

export async function makeWorld(assets: DungeonAssets, progress: (p: number) => void): Promise<WorldLike | null> {
  const world = new DungeonWorld(assets.kits, level as unknown as LevelData, { lazy: true });
  let n = 0;
  let t = performance.now();
  while (!world.buildStep()) {
    n++;
    // отдаём кадр примерно раз в 30 мс
    if (performance.now() - t > 30) {
      progress(Math.min(0.99, n / 100));
      await new Promise((r) => setTimeout(r, 0));
      t = performance.now();
    }
  }
  progress(1);
  return world;
}

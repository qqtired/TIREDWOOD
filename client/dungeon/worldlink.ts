// «Подземелье»: построить карту-тор (world.ts) из наборов пропов по кускам, не замораживая экран загрузки.
import * as THREE from 'three';
import type { DungeonAssets } from './assets.ts';
import type { WorldLike } from './game.ts';
import { DungeonWorld, type LevelData } from './world.ts';
import level from '../assets/dungeon/level-data.json';

/** Текстуры пола по зонам: бесшовные 1024 px (Codex image_gen, см. client/assets/dungeon/floor/PROVENANCE.md) */
const FLOOR_FILES: Record<string, string> = {
  cellars: new URL('../assets/dungeon/floor/cellars.jpg', import.meta.url).href,
  mushrooms: new URL('../assets/dungeon/floor/mushrooms.jpg', import.meta.url).href,
  crystals: new URL('../assets/dungeon/floor/crystals.jpg', import.meta.url).href,
  mine: new URL('../assets/dungeon/floor/mine.jpg', import.meta.url).href,
  jam: new URL('../assets/dungeon/floor/jam.jpg', import.meta.url).href,
};

/** Не загрузилась хоть одна — пол рисуется по-старому, цветом вершин */
async function loadFloor(): Promise<Map<string, THREE.Texture>> {
  const loader = new THREE.TextureLoader();
  const out = new Map<string, THREE.Texture>();
  await Promise.all(
    Object.entries(FLOOR_FILES).map(async ([id, url]) => {
      try {
        const t = await loader.loadAsync(url);
        t.name = `dungeon-floor-${id}`;
        t.colorSpace = THREE.SRGBColorSpace;
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = 4;
        out.set(id, t);
      } catch (e) {
        console.warn('dungeon: нет текстуры пола', id, e);
      }
    }),
  );
  return out;
}

export async function makeWorld(assets: DungeonAssets, progress: (p: number) => void): Promise<WorldLike | null> {
  const floor = await loadFloor();
  const world = new DungeonWorld(assets.kits, level as unknown as LevelData, { lazy: true, floor });
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

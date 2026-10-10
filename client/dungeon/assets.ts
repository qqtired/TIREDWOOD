// «Подземелье»: модели режима из client/assets/dungeon/*.glb — герой и босс (скелет и клипы), 9 видов врагов (жёсткие
// части с анимацией узлов) и наборы окружения kit_*.glb (каждый проп — корневой узел). Грузятся один раз при первом
// спуске и остаются в памяти (как миры других режимов). CSP: GLB самодостаточные, без внешних текстур.
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';

const MOB_FILES = {
  rat: new URL('../assets/dungeon/rat.glb', import.meta.url).href,
  bat: new URL('../assets/dungeon/bat.glb', import.meta.url).href,
  slug: new URL('../assets/dungeon/slug.glb', import.meta.url).href,
  shroom: new URL('../assets/dungeon/shroom.glb', import.meta.url).href,
  beetle: new URL('../assets/dungeon/beetle.glb', import.meta.url).href,
  spitter: new URL('../assets/dungeon/spitter.glb', import.meta.url).href,
  larva: new URL('../assets/dungeon/larva.glb', import.meta.url).href,
  cooper: new URL('../assets/dungeon/cooper.glb', import.meta.url).href,
  shaman: new URL('../assets/dungeon/shaman.glb', import.meta.url).href,
} as const;
export type MobModel = keyof typeof MOB_FILES;

const KIT_FILES = [
  new URL('../assets/dungeon/kit_common.glb', import.meta.url).href,
  new URL('../assets/dungeon/kit_cellars.glb', import.meta.url).href,
  new URL('../assets/dungeon/kit_mushrooms.glb', import.meta.url).href,
  new URL('../assets/dungeon/kit_grotto.glb', import.meta.url).href,
  new URL('../assets/dungeon/kit_mine.glb', import.meta.url).href,
  new URL('../assets/dungeon/kit_jam.glb', import.meta.url).href,
  new URL('../assets/dungeon/kit_buildings.glb', import.meta.url).href,
  new URL('../assets/dungeon/kit_extras.glb', import.meta.url).href,
];
const HERO_FILE = new URL('../assets/dungeon/hero.glb', import.meta.url).href;
const BOSS_FILE = new URL('../assets/dungeon/boss.glb', import.meta.url).href;

export interface DungeonAssets {
  hero: GLTF;
  boss: GLTF;
  mobs: Record<MobModel, GLTF>;
  /** все пропы всех наборов по имени корневого узла (позиция сброшена) */
  kits: Map<string, THREE.Object3D>;
  /** клипы наборов (altar_charge, chest_open, brazier_tip, spring_refill, trampoline_bounce …) по имени */
  kitClips: Map<string, THREE.AnimationClip>;
}

let cache: Promise<DungeonAssets> | null = null;

/** Загрузить всё (один раз за жизнь страницы); progress — доля 0…1 */
export function loadDungeonAssets(progress: (p: number) => void = () => {}): Promise<DungeonAssets> {
  cache ??= load(progress).catch((e: unknown) => {
    cache = null;
    throw e;
  });
  return cache;
}

async function load(progress: (p: number) => void): Promise<DungeonAssets> {
  const loader = new GLTFLoader();
  const total = Object.keys(MOB_FILES).length + KIT_FILES.length + 2;
  let done = 0;
  const one = async (url: string): Promise<GLTF> => {
    const g = await loader.loadAsync(url);
    done++;
    progress(done / total);
    return g;
  };
  const mobKeys = Object.keys(MOB_FILES) as MobModel[];
  const [hero, boss, mobList, kitList] = await Promise.all([
    one(HERO_FILE),
    one(BOSS_FILE),
    Promise.all(mobKeys.map((k) => one(MOB_FILES[k]))),
    Promise.all(KIT_FILES.map((u) => one(u))),
  ]);
  const mobs = {} as Record<MobModel, GLTF>;
  mobKeys.forEach((k, i) => (mobs[k] = mobList[i]));
  const kits = new Map<string, THREE.Object3D>();
  const kitClips = new Map<string, THREE.AnimationClip>();
  for (const g of kitList) {
    for (const node of [...g.scene.children]) {
      node.position.set(0, 0, 0);
      node.updateMatrixWorld(true);
      kits.set(node.name, node);
    }
    for (const c of g.animations) kitClips.set(c.name, c);
  }
  tameMetal(hero.scene);
  tameMetal(boss.scene);
  return { hero, boss, mobs, kits, kitClips };
}

/** Без карты окружения металл в three.js чернеет (README героя): снижаем металличность */
function tameMetal(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (m && 'metalness' in m) m.metalness = Math.min(m.metalness, 0.2);
  });
}

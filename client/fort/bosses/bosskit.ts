// Новые боссы крепости (стенд lab/fort-rework/bosses.html): общий договор моделей. Как MobDef из client/fort/mobs/kit.ts —
// жёсткие части на «костях», цвета в вершинах, общий материал крепости (mobMaterial: вспышка удара, оттенок, свечение),
// корень стоит ногами на y = 0 и смотрит по +Z, метры. Отличие одно: кости — любой список имён, а не 11 общих. Финальный
// босс и летающий — по одному на поле, им не нужна толпа инстансов: рисуются группой, одна отрисовка на часть.
// Поза — от тех же входов, что у мобов (MobAnim: состояние, секунды в нём, шаг, путь, удар, гибель, ярость, фаза в stage).
import * as THREE from 'three';
import { mobMaterial, type MobAnim, type MobFxUniforms } from '../mobs/kit.ts';

export type { MobAnim };

export interface BossPart {
  bone: string;
  geo: THREE.BufferGeometry;
  glow?: boolean;
}

/** Клип стенда: состояние сервера (st) и сколько оно длится; root — движение корня на стенде (в игре его ведёт сервер) */
export interface BossClip {
  id: string;
  /** Подпись кнопки */
  name: string;
  /** Что видно и что делать игроку — под кнопками стенда */
  note: string;
  st: number;
  /** Длина клипа, с (0 — длится, пока не выберут другое) */
  dur: number;
  /** Скорость по земле/воздуху на стенде, м/с */
  speed?: number;
  /** Ярость и фаза на время клипа */
  rage?: boolean;
  stage?: number;
  /** Удар (секунда клипа) — стенд рисует вспышку, пыль, метку и тряску */
  hits?: number[];
  /** Метка атаки: появляется в 0 и держится до удара */
  mark?: 'wall' | 'walk' | 'ring' | 'line' | 'tower' | 'none';
  /** Гибель вместо состояния */
  die?: boolean;
  /** Фаза у кнопки (1…3), для группировки */
  phase?: number;
}

export interface BossDef {
  id: string;
  name: string;
  height: number;
  bones: readonly string[];
  parts: BossPart[];
  clips: BossClip[];
  pose(a: MobAnim, out: Record<string, THREE.Matrix4>): void;
}

export function newBossPose(def: BossDef): Record<string, THREE.Matrix4> {
  const p: Record<string, THREE.Matrix4> = {};
  for (const b of def.bones) p[b] = new THREE.Matrix4();
  return p;
}

/** Треугольники модели */
export function bossTris(def: BossDef): number {
  return def.parts.reduce((n, p) => n + (p.geo.index ? p.geo.index.count : p.geo.getAttribute('position').count) / 3, 0);
}

/** Модель группой: одна сетка на часть, матрицы — из позы; flash — вспышка удара, tint — оттенок (ярость) */
export function buildBoss(def: BossDef): { group: THREE.Group; update(a: MobAnim, flash?: number, tint?: THREE.Color | null, tintMix?: number): void } {
  const group = new THREE.Group();
  const pose = newBossPose(def);
  const meshes: Array<{ mesh: THREE.Mesh; bone: string; fx: MobFxUniforms }> = [];
  for (const part of def.parts) {
    if (!pose[part.bone]) throw new Error(`${def.id}: нет кости ${part.bone}`);
    const mat = mobMaterial(part.glow);
    const mesh = new THREE.Mesh(part.geo, mat);
    mesh.castShadow = !part.glow;
    mesh.receiveShadow = false;
    mesh.matrixAutoUpdate = false;
    mesh.frustumCulled = false;
    group.add(mesh);
    meshes.push({ mesh, bone: part.bone, fx: mat.userData.mobFx as MobFxUniforms });
  }
  return {
    group,
    update(a, flash = 0, tint = null, tintMix = 0.3) {
      def.pose(a, pose);
      for (const { mesh, bone, fx } of meshes) {
        mesh.matrix.copy(pose[bone]);
        mesh.matrixWorldNeedsUpdate = true;
        fx.uMobFlash.value = flash;
        if (tint) fx.uMobTint.value.set(tint.r, tint.g, tint.b, tintMix);
        else fx.uMobTint.value.w = 0;
      }
    },
  };
}

// ------------------------------------------------------------ ноги: два звена и стопа (обратное колено птицы)

const _d = new THREE.Vector3();
const _b = new THREE.Vector3();
const _k = new THREE.Vector3();
const _u = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _one = new THREE.Vector3(1, 1, 1);
const DOWN = new THREE.Vector3(0, -1, 0);

/**
 * Две кости ноги от бедра hip до щиколотки ankle (в осях корня): верхнее звено длиной l1, нижнее l2, колено уходит
 * в сторону bend (у птиц — назад, −Z). Геометрия звеньев — вниз по −Y от сустава. Пишет матрицы звеньев, возвращает
 * колено в knee. Нога короче расстояния — тянется прямой (без разрыва), длиннее — колено сгибается сильнее.
 */
export function legIK(upper: THREE.Matrix4, lower: THREE.Matrix4, hip: THREE.Vector3, ankle: THREE.Vector3, l1: number, l2: number,
  bend: THREE.Vector3, knee: THREE.Vector3, sx = 1): void {
  _d.subVectors(ankle, hip);
  let d = _d.length();
  const maxD = (l1 + l2) * 0.999;
  const minD = Math.abs(l1 - l2) + 0.05;
  d = Math.min(maxD, Math.max(minD, d));
  _d.normalize();
  // направление сгиба — часть bend поперёк линии бедро–щиколотка
  _b.copy(bend).addScaledVector(_d, -bend.dot(_d));
  if (_b.lengthSq() < 1e-8) _b.set(0, 0, -1).addScaledVector(_d, _d.z).normalize();
  else _b.normalize();
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const a = Math.acos(Math.min(1, Math.max(-1, cosA)));
  knee.copy(hip).addScaledVector(_d, l1 * Math.cos(a)).addScaledVector(_b, l1 * Math.sin(a));
  _u.subVectors(knee, hip).normalize();
  _q.setFromUnitVectors(DOWN, _u);
  upper.compose(hip, _q, _one.set(sx, 1, sx));
  _k.copy(hip).addScaledVector(_d, d);
  _u.subVectors(_k, knee).normalize();
  _q.setFromUnitVectors(DOWN, _u);
  lower.compose(knee, _q, _one.set(sx, 1, sx));
  _one.set(1, 1, 1);
}

/** Точка (x, y, z) в осях матрицы m → out */
export function apply(m: THREE.Matrix4, x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set(x, y, z).applyMatrix4(m);
}

/** Шумная дрожь без выделений: сумма синусов, −1…1 */
export function jitter(t: number, seed: number): number {
  return 0.55 * Math.sin(t * 31.7 + seed * 11.3) + 0.45 * Math.sin(t * 47.3 + seed * 5.1);
}

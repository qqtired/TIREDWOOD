// Орда новых мобов «Крепости» инстансами: одна часть одной модели = один InstancedMesh на MOB_CAP особей. Кадр:
// begin() → add() на каждую особь (поза модели × корень особи, вспышка, оттенок) → end(). Пустые сетки не рисуются,
// в кадре ничего не выделяется. Вариант модели выбирается по seed и признакам (как pickVariant). Если для вида модели
// нет (или модель переполнена), add() отвечает false — крепость рисует эту особь по-старому (желейкой).
import * as THREE from 'three';
import type { Quality } from '../../settings.ts';
import { ALL_MOBS } from './index.ts';
import { mobMaterial, newPose, variantWeight, type BoneName, type MobAnim, type MobDef } from './kit.ts';

/** Особей одной модели в кадре — как CAP в zombies3d.ts (живых не больше FORT_MAX_ALIVE, с запасом) */
export const MOB_CAP = 72;

/** Одна модель: сетки частей, их кости, общие на все части вспышка и оттенок особи */
interface Slot {
  def: MobDef;
  meshes: THREE.InstancedMesh[];
  bones: BoneName[];
  glow: boolean[];
  flash: THREE.InstancedBufferAttribute;
  tint: THREE.InstancedBufferAttribute;
  geos: THREE.BufferGeometry[];
  /** Особей в этом кадре и в прошлом */
  n: number;
  used: number;
}

/** Варианты одного вида: обычные (по весам) и особые (when — только для особей с признаками) */
interface KindPick {
  slots: Slot[];
  weights: number[];
  total: number;
  /** Самый частый обычный вариант — на низком качестве весь вид рисуется им (меньше разных сеток — меньше вызовов) */
  main: Slot | null;
  mainWeight: number;
  special: Slot[];
  specialWhen: number[];
  specialWeights: number[];
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/**
 * Корень особи из снимка крепости: ноги в (x, y, z), курс yaw — как у сервера (лицом в (−sin yaw, −cos yaw)), модели же
 * смотрят по +Z — отсюда поворот на yaw + π. scale — общий масштаб (чемпион крупнее), pitch — наклон вперёд (лицом
 * вниз, радианы), roll — крен. Без выделений памяти.
 */
export function mobRoot(out: THREE.Matrix4, x: number, y: number, z: number, yaw: number, scale = 1, pitch = 0, roll = 0): THREE.Matrix4 {
  _e.set(pitch, yaw + Math.PI, roll, 'YXZ');
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(scale, scale, scale);
  return out.compose(_p, _q, _s);
}

/** Постоянный seed особи 0…1 по её номеру из снимка — у всех игроков одинаковый (вариант, рост, походка) */
export function mobSeed(id: number): number {
  let h = Math.imul(id | 0, 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca77);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae3d);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export interface MobRendererOptions {
  /**
   * Отбрасывать тени картой теней (на «высоком»). В крепости карта теней статичная (пересчёт только при смене ворот
   * и качества — client/render/renderer.ts), поэтому там false: живые мобы впечатались бы в неё призраками, у них
   * свои пятна-тени. Стенд и превью с живой картой теней могут включить.
   */
  castShadow?: boolean;
}

export class MobRenderer {
  readonly group = new THREE.Group();
  private readonly slots: Slot[] = [];
  private readonly kinds: Array<KindPick | undefined> = [];
  private readonly pose = newPose();
  private readonly material = mobMaterial(false);
  private readonly glowMaterial = mobMaterial(true);
  private readonly castShadow: boolean;
  /** Разные варианты одного вида; на низком качестве — нет: один вариант на вид */
  private variety = true;
  private open = false;
  private total = 0;

  constructor(parent: THREE.Object3D, defs: readonly MobDef[] = ALL_MOBS, quality: Quality = 'high', options: MobRendererOptions = {}) {
    this.castShadow = options.castShadow ?? false;
    this.group.name = 'mobs';
    this.group.matrixAutoUpdate = false;
    for (const def of defs) {
      // без частей или с весом 0 модель никогда не выбирается — и сеток не строим
      if (!def.parts.length || variantWeight(def) <= 0) continue;
      const flash = new THREE.InstancedBufferAttribute(new Float32Array(MOB_CAP), 1);
      const tint = new THREE.InstancedBufferAttribute(new Float32Array(MOB_CAP * 4), 4);
      flash.setUsage(THREE.DynamicDrawUsage);
      tint.setUsage(THREE.DynamicDrawUsage);
      const slot: Slot = { def, meshes: [], bones: [], glow: [], flash, tint, geos: [], n: 0, used: 0 };
      for (const part of def.parts) {
        // своя обёртка геометрии: те же буферы модели (position, normal, color, index) + атрибуты особи
        const geo = new THREE.BufferGeometry();
        for (const name of Object.keys(part.geo.attributes)) geo.setAttribute(name, part.geo.getAttribute(name));
        if (part.geo.index) geo.setIndex(part.geo.index);
        geo.setAttribute('mobFlash', flash);
        geo.setAttribute('mobTint', tint);
        const mesh = new THREE.InstancedMesh(geo, part.glow ? this.glowMaterial : this.material, MOB_CAP);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.count = 0;
        mesh.visible = false;
        mesh.frustumCulled = false;
        mesh.name = `mob:${def.id}:${part.bone}`;
        this.group.add(mesh);
        slot.meshes.push(mesh);
        slot.bones.push(part.bone);
        slot.glow.push(part.glow === true);
        slot.geos.push(geo);
      }
      this.slots.push(slot);
      const w = variantWeight(def);
      for (const kind of def.kinds) {
        const k = this.kinds[kind] ?? (this.kinds[kind] = { slots: [], weights: [], total: 0, main: null, mainWeight: 0, special: [], specialWhen: [], specialWeights: [] });
        if (def.when) {
          k.special.push(slot);
          k.specialWhen.push(def.when);
          k.specialWeights.push(w);
        } else {
          k.slots.push(slot);
          k.weights.push(w);
          k.total += w;
          if (w > k.mainWeight) {
            k.main = slot;
            k.mainWeight = w;
          }
        }
      }
    }
    parent.add(this.group);
    this.setQuality(quality);
  }

  /**
   * По качеству: принимать тени стен — на среднем и высоком; отбрасывать — только с castShadow и на высоком; на низком
   * у вида один вариант (самый частый) — разных сеток в кадре втрое меньше.
   */
  setQuality(q: Quality, slow = false): void {
    const tier = q === 'auto' ? (slow ? 'low' : 'medium') : q;
    this.variety = tier !== 'low';
    const receive = tier !== 'low';
    const cast = this.castShadow && tier === 'high';
    for (const slot of this.slots) {
      for (let i = 0; i < slot.meshes.length; i++) {
        slot.meshes[i].receiveShadow = receive && !slot.glow[i];
        slot.meshes[i].castShadow = cast && !slot.glow[i];
      }
    }
  }

  /** Морской туман (событие крепости): светящиеся части — глаза, фитили, огоньки — видны сквозь туман */
  setFogGlow(on: boolean): void {
    if (this.glowMaterial.fog === !on) return;
    this.glowMaterial.fog = !on;
    this.glowMaterial.needsUpdate = true;
  }

  /** Есть ли модель для вида (у особи с признаками flags — с учётом особых вариантов) */
  has(kind: number, flags = 0): boolean {
    return this.pick(kind, 0, flags) !== null;
  }

  /** Какая модель нарисует особь вида kind с этим seed и признаками (тот же выбор, что pickVariant); null — модели нет */
  variant(kind: number, seed: number, flags = 0): MobDef | null {
    return this.pick(kind, seed, flags)?.def ?? null;
  }

  /** Особей нарисовано в последнем кадре */
  get count(): number {
    return this.total;
  }

  begin(): void {
    for (const slot of this.slots) slot.n = 0;
    this.total = 0;
    this.open = true;
  }

  /**
   * Особь в кадр: root — корень (ноги, курс; см. mobRoot; масштаб может быть неравномерным — босс в воротах), anim —
   * поза (anim.flags участвует в выборе особого варианта, when), flash 0…1 — вспышка в белый, tint и tintMix — оттенок
   * (экипаж, лечение, ярость). false — модели для вида нет или она переполнена: рисуй по-старому.
   */
  add(kind: number, seed: number, root: THREE.Matrix4, anim: MobAnim, flash = 0, tint: THREE.Color | null = null, tintMix = 0.3): boolean {
    if (!this.open) return false;
    const slot = this.pick(kind, seed, anim.flags ?? 0);
    if (!slot || slot.n >= MOB_CAP) return false;
    const i = slot.n;
    const pose = this.pose;
    // кости этой модели — с чистого листа: поза прошлой модели не должна протечь в забытую кость
    for (const bone of slot.bones) pose[bone].identity();
    slot.def.pose(anim, pose);
    for (let p = 0; p < slot.meshes.length; p++) slot.meshes[p].setMatrixAt(i, _m.multiplyMatrices(root, pose[slot.bones[p]]));
    (slot.flash.array as Float32Array)[i] = flash > 0 ? Math.min(1, flash) : 0;
    const t = slot.tint.array as Float32Array;
    if (tint && tintMix > 0) {
      t[i * 4] = tint.r;
      t[i * 4 + 1] = tint.g;
      t[i * 4 + 2] = tint.b;
      t[i * 4 + 3] = Math.min(1, tintMix);
    } else {
      t[i * 4 + 3] = 0;
    }
    slot.n++;
    this.total++;
    return true;
  }

  /** Конец кадра: сколько особей у каждой сетки, что выгрузить; пустые сетки прячутся (ни одного вызова отрисовки) */
  end(): void {
    this.open = false;
    for (const slot of this.slots) {
      const n = slot.n;
      if (n === 0 && slot.used === 0) continue;
      for (const mesh of slot.meshes) {
        mesh.count = n;
        mesh.visible = n > 0;
        if (n > 0) {
          mesh.instanceMatrix.clearUpdateRanges();
          mesh.instanceMatrix.addUpdateRange(0, n * 16);
          mesh.instanceMatrix.needsUpdate = true;
        }
      }
      if (n > 0) {
        slot.flash.clearUpdateRanges();
        slot.flash.addUpdateRange(0, n);
        slot.flash.needsUpdate = true;
        slot.tint.clearUpdateRanges();
        slot.tint.addUpdateRange(0, n * 4);
        slot.tint.needsUpdate = true;
      }
      slot.used = n;
    }
  }

  /** Убрать всех (выход из режима, новая игра) */
  clear(): void {
    this.begin();
    this.end();
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const slot of this.slots) {
      for (const geo of slot.geos) geo.dispose();
      for (const mesh of slot.meshes) mesh.dispose();
    }
    this.material.dispose();
    this.glowMaterial.dispose();
    this.slots.length = 0;
    this.kinds.length = 0;
  }

  /**
   * Тот же выбор, что pickVariant(defs, kind, seed, flags): особые (when) — если подходят, иначе обычные; по весам. На
   * низком качестве обычный вариант — всегда самый частый.
   */
  private pick(kind: number, seed: number, flags: number): Slot | null {
    const k = this.kinds[kind];
    if (!k) return null;
    const u = seed >= 0 && seed < 1 ? seed : seed >= 1 ? 0.999999 : 0;
    if (flags && k.special.length) {
      let total = 0;
      for (let i = 0; i < k.special.length; i++) if ((flags & k.specialWhen[i]) === k.specialWhen[i]) total += k.specialWeights[i];
      if (total > 0) {
        let r = u * total;
        let last: Slot | null = null;
        for (let i = 0; i < k.special.length; i++) {
          if ((flags & k.specialWhen[i]) !== k.specialWhen[i]) continue;
          last = k.special[i];
          r -= k.specialWeights[i];
          if (r < 0) return last;
        }
        return last;
      }
    }
    if (k.total <= 0) return null;
    if (!this.variety) return k.main;
    let r = u * k.total;
    for (let i = 0; i < k.slots.length; i++) {
      r -= k.weights[i];
      if (r < 0) return k.slots[i];
    }
    return k.slots[k.slots.length - 1];
  }
}

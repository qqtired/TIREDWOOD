// «Набег пиратов»: толпа пиратов-желеек инстансами — лёгкая копия MobRenderer крепости (client/fort/mobs/renderer.ts)
// только для PIRATE_DEFS: одна часть одной модели = один InstancedMesh на PIRATE_CAP особей. Кадр: begin() → add() на
// каждую особь (поза модели × корень особи, вспышка, оттенок) → end(). Пустые сетки не рисуются, в кадре ничего не
// выделяется. Вариант матроса выбирается по seed (как pickVariant), на «низком» — всегда самый частый.
import * as THREE from 'three';
import { mobMaterial, newPose, variantWeight, type BoneName, type MobAnim, type MobDef } from '../fort/mobs/kit.ts';
import { PIRATE_DEFS } from './piratejelly.ts';

/** Особей одной модели в кадре */
export const PIRATE_CAP = 48;

/** Качество набережной (как LobbyQuality в world.ts) */
export type PirateQuality = 'low' | 'medium' | 'high';

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

/** Варианты одного вида: по весам; самый частый — на «низком» */
interface KindPick {
  slots: Slot[];
  weights: number[];
  total: number;
  main: Slot | null;
  mainWeight: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/**
 * Корень особи: ноги в (x, y, z), курс yaw — как у игроков (лицом в (−sin yaw, −cos yaw)), модели же смотрят по +Z —
 * отсюда поворот на yaw + π. scale — общий масштаб, pitch — наклон вперёд (радианы), roll — крен. Без выделений памяти.
 */
export function crowdRoot(out: THREE.Matrix4, x: number, y: number, z: number, yaw: number, scale = 1, pitch = 0, roll = 0): THREE.Matrix4 {
  _e.set(pitch, yaw + Math.PI, roll, 'YXZ');
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(scale, scale, scale);
  return out.compose(_p, _q, _s);
}

export class PirateCrowd {
  readonly group = new THREE.Group();
  private readonly slots: Slot[] = [];
  private readonly kinds: Array<KindPick | undefined> = [];
  private readonly pose = newPose();
  private readonly material = mobMaterial(false);
  private readonly glowMaterial = mobMaterial(true);
  /** Разные варианты матросов; на «низком» — один */
  private variety = true;
  private open = false;
  private total = 0;

  constructor(parent: THREE.Object3D, quality: PirateQuality = 'high', defs: readonly MobDef[] = PIRATE_DEFS) {
    this.group.name = 'pirate-crowd';
    this.group.matrixAutoUpdate = false;
    for (const def of defs) {
      if (variantWeight(def) <= 0 || !def.parts.length) continue;
      const flash = new THREE.InstancedBufferAttribute(new Float32Array(PIRATE_CAP), 1);
      const tint = new THREE.InstancedBufferAttribute(new Float32Array(PIRATE_CAP * 4), 4);
      flash.setUsage(THREE.DynamicDrawUsage);
      tint.setUsage(THREE.DynamicDrawUsage);
      const slot: Slot = { def, meshes: [], bones: [], glow: [], flash, tint, geos: [], n: 0, used: 0 };
      for (const part of def.parts) {
        // своя обёртка геометрии: те же буферы модели + атрибуты особи
        const geo = new THREE.BufferGeometry();
        for (const name of Object.keys(part.geo.attributes)) geo.setAttribute(name, part.geo.getAttribute(name));
        if (part.geo.index) geo.setIndex(part.geo.index);
        geo.setAttribute('mobFlash', flash);
        geo.setAttribute('mobTint', tint);
        const mesh = new THREE.InstancedMesh(geo, part.glow ? this.glowMaterial : this.material, PIRATE_CAP);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.count = 0;
        mesh.visible = false;
        mesh.frustumCulled = false;
        mesh.name = `pirate:${def.id}:${part.bone}`;
        this.group.add(mesh);
        slot.meshes.push(mesh);
        slot.bones.push(part.bone);
        slot.glow.push(part.glow === true);
        slot.geos.push(geo);
      }
      this.slots.push(slot);
      const w = variantWeight(def);
      for (const kind of def.kinds) {
        const k = this.kinds[kind] ?? (this.kinds[kind] = { slots: [], weights: [], total: 0, main: null, mainWeight: 0 });
        k.slots.push(slot);
        k.weights.push(w);
        k.total += w;
        if (w > k.mainWeight) {
          k.main = slot;
          k.mainWeight = w;
        }
      }
    }
    parent.add(this.group);
    this.setQuality(quality);
  }

  /** «Низкое» — у матросов один вариант и без теней на них; иначе принимают тени набережной */
  setQuality(q: PirateQuality): void {
    this.variety = q !== 'low';
    for (const slot of this.slots) {
      for (let i = 0; i < slot.meshes.length; i++) {
        slot.meshes[i].receiveShadow = q !== 'low' && !slot.glow[i];
        // карта теней набережной статична: живые пираты впечатались бы в неё призраками
        slot.meshes[i].castShadow = false;
      }
    }
  }

  /** Какая модель нарисует особь вида kind с этим seed; null — модели нет */
  variant(kind: number, seed: number): MobDef | null {
    return this.pick(kind, seed)?.def ?? null;
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
   * Особь в кадр: root — корень (см. crowdRoot), anim — поза, flash 0…1 — вспышка в белый, tint и tintMix — оттенок
   * (краска стрелка, злой капитан). false — вида нет или модель переполнена.
   */
  add(kind: number, seed: number, root: THREE.Matrix4, anim: MobAnim, flash = 0, tint: THREE.Color | null = null, tintMix = 0.3): boolean {
    if (!this.open) return false;
    const slot = this.pick(kind, seed);
    if (!slot || slot.n >= PIRATE_CAP) return false;
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

  /** Конец кадра: сколько особей у каждой сетки, что выгрузить; пустые сетки прячутся */
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

  /** Убрать всех */
  clear(): void {
    this.begin();
    this.end();
  }

  /** Сетки и материалы толпы (геометрии моделей PIRATE_DEFS общие — остаются) */
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

  /** Выбор по seed и весам (как pickVariant); на «низком» — самый частый вариант */
  private pick(kind: number, seed: number): Slot | null {
    const k = this.kinds[kind];
    if (!k || k.total <= 0) return null;
    if (!this.variety) return k.main;
    const u = seed >= 0 && seed < 1 ? seed : seed >= 1 ? 0.999999 : 0;
    let r = u * k.total;
    for (let i = 0; i < k.slots.length; i++) {
      r -= k.weights[i];
      if (r < 0) return k.slots[i];
    }
    return k.slots[k.slots.length - 1];
  }
}

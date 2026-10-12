// Accepted r7 rigid GLBs, attached to the real hero. Reuse the existing pose baker:
// one draw per role/type, shared materials/geometry, no per-projectile clones/mixers.
import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { bakeFortModel, fortBakedMaterial, frameAt, type BakedMob } from '../fort/approved/bake.ts';
import type { EvolutionModel } from './assets.ts';
import type { DgView, VProj } from './view.ts';
import { A_SOFT, type Billboards } from './fx.ts';
import { D } from '../../shared/dungeon/data.ts';
import { DG_HZ } from '../../shared/dungeon/api.ts';

type Role = 'equip' | 'projectile' | 'boulder';
const ANCHORS: Record<EvolutionModel, [number, number, number]> = {
  lantern_evo: [0, 0, 0], embers_evo: [0, .76, -.24], pickaxe_evo: [.39, .66, -.05],
  fireflies_evo: [.27, .9, -.23], spark_evo: [-.31, .77, -.19],
  stalactites_evo: [.12, .77, .18], charges_evo: [.25, .55, -.23], beam_evo: [0, 0, 0],
};
const PROJECTILES: Partial<Record<VProj['kind'], EvolutionModel>> = {
  ember: 'embers_evo', pick: 'pickaxe_evo', firefly: 'fireflies_evo', rock: 'stalactites_evo',
  boulder: 'stalactites_evo', charge: 'charges_evo', spark_pulse: 'spark_evo',
};
const CAP: Partial<Record<VProj['kind'], number>> = { ember: 200, pick: 40, firefly: 40, rock: 60, boulder: 20, charge: 60, spark_pulse: 20 };

/** Keep every animated transform/name, remove only the other role's geometry. */
export function evolutionRole(gltf: GLTF, role: Role): GLTF {
  const scene = gltf.scene.clone(true), remove: THREE.Mesh[] = [];
  scene.traverse(o => {
    if (!(o as THREE.Mesh).isMesh) return;
    let p: THREE.Object3D | null = o, selected = false;
    while (p) { if (p.name.endsWith('__' + role)) selected = true; p = p.parent; }
    if (!selected) remove.push(o as THREE.Mesh);
  });
  for (const mesh of remove) {
    const transform = new THREE.Object3D(); transform.name = mesh.name;
    transform.position.copy(mesh.position); transform.quaternion.copy(mesh.quaternion); transform.scale.copy(mesh.scale);
    mesh.parent?.add(transform); for (const child of [...mesh.children]) transform.add(child); mesh.removeFromParent();
  }
  return { ...gltf, scene };
}

class PoseBatch {
  readonly mesh: THREE.InstancedMesh;
  readonly baked: BakedMob;
  readonly anim: THREE.InstancedBufferAttribute;
  readonly minY: number;
  constructor(gltf: GLTF, id: EvolutionModel, role: Role, cap: number) {
    const source = evolutionRole(gltf, role); source.scene.updateMatrixWorld(true);
    this.minY = new THREE.Box3().setFromObject(source.scene).min.y;
    this.baked = bakeFortModel(source, id);
    const g = this.baked.geo;
    this.anim = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aAnim', this.anim);
    g.setAttribute('aTint', new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4));
    g.setAttribute('aTarget', new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4));
    this.mesh = new THREE.InstancedMesh(g, fortBakedMaterial(this.baked.tex), cap);
    this.mesh.name = `dg-evolution-${id}-${role}`; this.mesh.frustumCulled = false; this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }
  push(matrix: THREE.Matrix4, key: string, time: number, loop = false): boolean {
    const i = this.mesh.count; if (i >= this.mesh.instanceMatrix.count) return false;
    const c = this.baked.clips[key] ?? this.baked.clips.idle;
    const f = frameAt(c, loop ? ((time % c.duration) + c.duration) % c.duration : time), a = Math.floor(f);
    this.anim.setXYZW(i, c.start + a, c.start + Math.min(a + 1, c.frames - 1), f - a, 0);
    this.mesh.setMatrixAt(i, matrix); this.mesh.count++; return true;
  }
  end(): void { this.mesh.visible = this.mesh.count > 0; if (this.mesh.count) { this.anim.needsUpdate = true; this.mesh.instanceMatrix.needsUpdate = true; } }
}
interface Equipment { batch: PoseBatch; anchor: THREE.Group; fires: number; firedAt: number; progress: number; tick: number; period: number }
const identity = new THREE.Matrix4(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);

export class EvolutionRenderer {
  readonly root = new THREE.Group();
  readonly enabled: boolean;
  readonly beaconHeight: number;
  private readonly equipment = new Map<EvolutionModel, Equipment>();
  private readonly projectiles = new Map<VProj['kind'], PoseBatch>();
  private readonly started = new Map<number, number>();
  private readonly live = new Set<number>();
  private readonly matrix = new THREE.Matrix4();
  private readonly pos = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly glow = new THREE.Vector3(0, -.004, -.073);
  private readonly glowWorld = new THREE.Vector3();
  private time = 0;
  private tick = -1;
  private readonly hero: THREE.Group;

  constructor(models: Partial<Record<EvolutionModel, GLTF>> | undefined, hero: THREE.Group) {
    this.hero = hero;
    this.enabled = !!models?.beam_evo; this.root.name = 'dg-evolutions';
    hero.updateMatrixWorld(true);
    const heroTop = new THREE.Box3().setFromObject(hero).max.y - hero.position.y;
    this.beaconHeight = heroTop + .38;
    for (const id of Object.keys(models ?? {}) as EvolutionModel[]) {
      const gltf = models![id]!;
      const batch = new PoseBatch(gltf, id, 'equip', 1), anchor = new THREE.Group();
      anchor.name = `dg-equip-${id}`;
      const parent = id === 'beam_evo' ? hero : hero.getObjectByName(id === 'lantern_evo' ? 'lantern' : 'chest') ?? hero;
      const position = new THREE.Vector3().fromArray(ANCHORS[id]);
      if (id === 'beam_evo') position.set(0, this.beaconHeight - batch.minY, 0);
      else if (id !== 'lantern_evo') parent.worldToLocal(hero.localToWorld(position));
      anchor.position.copy(position); anchor.add(batch.mesh); parent.add(anchor);
      const def = D.evolutions.find(e => e.id === id);
      this.equipment.set(id, { batch, anchor, fires: 0, firedAt: -Infinity, progress: 0, tick: -1, period: Number((def?.stats as { cd?: number } | undefined)?.cd ?? 1) });
    }
    for (const [kind, id] of Object.entries(PROJECTILES) as [VProj['kind'], EvolutionModel][]) if (models?.[id]) {
      const batch = new PoseBatch(models[id]!, id, kind === 'boulder' ? 'boulder' : 'projectile', CAP[kind]!);
      this.projectiles.set(kind, batch); this.root.add(batch.mesh);
    }
  }

  reset(): void { this.started.clear(); this.tick = -1; for (const e of this.equipment.values()) { e.fires = 0; e.firedAt = -Infinity; e.tick = -1; e.anchor.visible = false; } }
  warm(on: boolean): void {
    for (const e of this.equipment.values()) { e.anchor.visible = on; e.batch.mesh.count = on ? 1 : 0; e.batch.mesh.visible = on; }
    for (const b of this.projectiles.values()) { b.mesh.count = on ? 1 : 0; b.mesh.visible = on; }
  }

  begin(v: DgView, time: number, beamYaw: number): void {
    this.time = time; this.live.clear(); for (const b of this.projectiles.values()) b.mesh.count = 0;
    const newTick = this.tick !== v.tick; this.tick = v.tick;
    const born = new Set<EvolutionModel>();
    // Observe the complete view before camera culling: re-entering the screen is
    // not a new projectile, and the first shot can precede the HUD's fires count.
    for (const p of v.projectiles) {
      const id = PROJECTILES[p.kind];
      if (!id || (!p.evo && p.kind !== 'boulder' && p.kind !== 'spark_pulse')) continue;
      this.live.add(p.id);
      if (!this.started.has(p.id)) { this.started.set(p.id, time); born.add(id); }
    }
    for (const [id, e] of this.equipment) {
      const w = v.weapons.find(w => w.id === id); e.anchor.visible = !!w; e.batch.mesh.count = 0; if (!w) continue;
      if (born.has(id)) e.firedAt = time;
      if (newTick) {
        const progress = w.cd01 ?? 1, delta = progress - e.progress;
        if (e.tick >= 0 && delta > .00001 && delta < .5) e.period = (v.tick - e.tick) / DG_HZ / delta;
        if ((w.fires ?? 0) > e.fires) e.firedAt = time;
        e.fires = w.fires ?? 0; e.progress = progress; e.tick = v.tick;
        // First actual shot is also available before the HUD has observed a complete cooldown.
        for (const fx of v.fx) if (fx.k === 'cone' && id === 'lantern_evo' || fx.k === 'chain' && (fx.what === 'charge' ? id === 'charges_evo' : id === 'spark_evo') || fx.k === 'shot' && ({ ember: 'embers_evo', pick: 'pickaxe_evo', spark: 'spark_evo', stalactites: 'stalactites_evo', charges: 'charges_evo', fireflies: 'fireflies_evo' }[fx.w] === id)) e.firedAt = time;
      }
      const continuous = id === 'beam_evo' ? v.rays.length > 0 : id === 'fireflies_evo' && v.projectiles.some(p => p.kind === 'firefly');
      const since = time - e.firedAt, toHit = (1 - e.progress) * e.period;
      const preparing = e.progress > 0 && e.progress < 1 && toHit <= .14, recovering = since < .24;
      const attack = continuous || preparing || recovering;
      const clipTime = continuous ? .5 : recovering ? .5 + Math.max(0, since) / .24 * .5 : (1 - toHit / .14) * .5;
      e.batch.push(identity, attack ? 'attack' : v.hero.speed > .6 ? 'run' : 'idle', attack ? clipTime : time, !attack);
      if (id === 'beam_evo') e.anchor.rotation.y = beamYaw - this.hero.rotation.y;
      e.batch.end();
    }
  }

  projectile(p: VProj, x: number, z: number, billboards: Billboards): boolean {
    const b = this.projectiles.get(p.kind); if (!b || (!p.evo && p.kind !== 'boulder' && p.kind !== 'spark_pulse')) return false;
    this.live.add(p.id); if (!this.started.has(p.id)) this.started.set(p.id, this.time);
    this.pos.set(x, p.y, z); this.rotation.setFromAxisAngle(up, p.yaw); this.matrix.compose(this.pos, this.rotation, one);
    b.push(this.matrix, 'flight', this.time - this.started.get(p.id)!, true);
    if (p.kind === 'firefly') {
      this.glowWorld.copy(this.glow).applyMatrix4(this.matrix);
      const pulse = .83 + .17 * Math.sin(this.time * 6 + p.id * 1.7);
      billboards.add(this.glowWorld.x, this.glowWorld.y, this.glowWorld.z, .34, .34, 0, A_SOFT, .72, 1, .22, .64 * pulse);
    } else if (p.kind === 'ember') billboards.add(x, p.y, z, .44, .44, 0, A_SOFT, 1, .55, .2, .32);
    return true;
  }
  end(): void { for (const b of this.projectiles.values()) b.end(); for (const id of this.started.keys()) if (!this.live.has(id)) this.started.delete(id); }
}

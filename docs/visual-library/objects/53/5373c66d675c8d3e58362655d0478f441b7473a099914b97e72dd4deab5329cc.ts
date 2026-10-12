import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { MobAnim } from '../mobs/kit.ts';
import type { Quality } from '../../settings.ts';
import { ZS_ATTACK, ZS_BOSS_OPEN } from '../../../shared/fort.ts';
import { Z_ROPECRAB, Z_JAMPUMP, Z_CANOPY, Z_FOREMAN, Z_CRABCRANE, Z_MILLER, Z_SIEGE_TOWER, Z_BATTERY, Z_SPRING,
  ZS_SIEGE_APPROACH, ZS_SIEGE_DEPLOY, ZS_SIEGE_WINDUP, ZS_SIEGE_ACTION, ZS_SIEGE_OPEN, ZS_SIEGE_SPENT,
} from '../../../shared/fortsiege.ts';
import { bakeFortModel, fortBakedMaterial, frameAt, type BakedMob } from './bake.ts';

export const APPROVED_ASSETS = [
  { kind: Z_ROPECRAB, id: 'ropecrab', name: 'Канатник', url: new URL('../../assets/fort/approved/ropecrab-r2-07.glb', import.meta.url).href },
  { kind: Z_JAMPUMP, id: 'jampump', name: 'Смоливщик', url: new URL('../../assets/fort/approved/jampump-r2-06.glb', import.meta.url).href },
  { kind: Z_CANOPY, id: 'canopy', name: 'Зонтиковик', url: new URL('../../assets/fort/approved/canopy-r2-07.glb', import.meta.url).href },
  { kind: Z_FOREMAN, id: 'foreman', name: 'Старшина осады', url: new URL('../../assets/fort/approved/foreman-r2-06.glb', import.meta.url).href },
  { kind: Z_CRABCRANE, id: 'crabcrane', name: 'Краб-Кран', url: new URL('../../assets/fort/approved/crabcrane-r2-06.glb', import.meta.url).href },
  { kind: Z_MILLER, id: 'miller', name: 'Мельничиха', url: new URL('../../assets/fort/approved/miller-r2-06.glb', import.meta.url).href },
  { kind: Z_SIEGE_TOWER, id: 'siegetower', name: 'Осадная башня', url: new URL('../../assets/fort/approved/siegetower-r3-03.glb', import.meta.url).href },
  { kind: Z_BATTERY, id: 'battery', name: 'Полевая батарея', url: new URL('../../assets/fort/approved/battery-r3-03.glb', import.meta.url).href },
  { kind: Z_SPRING, id: 'spring', name: 'Живой грибочек', url: new URL('../../assets/fort/approved/spring-r3-01.glb', import.meta.url).href },
] as const;

interface Slot { id: string; baked: BakedMob; mesh: THREE.InstancedMesh; anim: THREE.InstancedBufferAttribute; tint: THREE.InstancedBufferAttribute; target: THREE.InstancedBufferAttribute; n: number }
const CAP = 72;
const targetPoint = new THREE.Vector3();
const targetInverse = new THREE.Matrix4();
const LOAD_REST = new THREE.Vector3(2.48,2.03,2.05);

/** Native GLB silhouette/materials/animations, batched per type like the existing crowd. */
export class ApprovedMobRenderer {
  readonly group = new THREE.Group();
  readonly ready: Promise<void>;
  loading = true;
  error: string | null = null;
  private quality: Quality = 'high';
  private readonly slots = new Map<number, Slot>();

  constructor(parent: THREE.Object3D) {
    this.group.name = 'fort-approved-models'; parent.add(this.group);
    const loader = new GLTFLoader();
    this.ready = Promise.all(APPROVED_ASSETS.map(async spec => ({ spec, gltf: await loader.loadAsync(spec.url) })))
      .then(async loaded => {
        for (const { spec, gltf } of loaded) {
          const baked = bakeFortModel(gltf, spec.id);
          const anim = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 4), 4).setUsage(THREE.DynamicDrawUsage);
          const tint = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 4), 4).setUsage(THREE.DynamicDrawUsage);
          const target = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 4),4).setUsage(THREE.DynamicDrawUsage);
          baked.geo.setAttribute('aTarget',target);
          baked.geo.setAttribute('aAnim', anim); baked.geo.setAttribute('aTint', tint);
          const mesh = new THREE.InstancedMesh(baked.geo, fortBakedMaterial(baked.tex), CAP);
          mesh.name = `fort-native:${spec.id}`; mesh.frustumCulled = false;
          mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.count = 0; mesh.visible = false;
          mesh.receiveShadow = this.quality !== 'low'; this.group.add(mesh);
          this.slots.set(spec.kind, { id: spec.id, baked, mesh, anim, tint, target, n: 0 });
          await new Promise<void>(resolve => setTimeout(resolve, 0));
        }
      }).catch(error => { this.error = String(error); console.error('Fort approved models:', error); })
      .finally(() => { this.loading = false; });
  }

  has(kind: number): boolean { return this.slots.has(kind); }
  height(kind: number): number { return this.slots.get(kind)?.baked.height ?? 1.8; }
  duration(kind: number, clip: string): number { return this.slots.get(kind)?.baked.clips[clip]?.duration ?? 1.1; }
  begin(): void { for (const s of this.slots.values()) s.n = 0; }
  clear(): void { this.begin(); this.end(); }
  setQuality(q: Quality): void { this.quality = q; for (const s of this.slots.values()) s.mesh.receiveShadow = q !== 'low'; }

  /** stT is the server phase clock; only locomotion uses the accumulated stride. */
  add(kind: number, root: THREE.Matrix4, a: MobAnim, flash: number, tint: THREE.Color | null, tintMix: number, goal?: {tx:number;ty:number;tz:number}): boolean {
    const slot = this.slots.get(kind);
    if (!slot || slot.n === CAP) return false;
    let key = 'idle', time = a.t;
    if (a.die > 0) { key = 'death'; time = a.die * this.duration(kind, key); }
    else if (a.st === ZS_SIEGE_OPEN || a.st === ZS_BOSS_OPEN) { key = kind === Z_CANOPY ? 'cover_disabled' : 'open'; time = a.stT; }
    else if (a.st === ZS_SIEGE_DEPLOY) {
      key = slot.baked.clips.deploy ? 'deploy' : kind === Z_CRABCRANE ? 'anchor_set' : kind === Z_MILLER ? 'crank' : kind === Z_ROPECRAB ? 'route_attach' : kind === Z_FOREMAN ? 'device_set' : 'windup';
      const seconds = kind === Z_BATTERY ? 6 : kind === Z_SIEGE_TOWER || kind === Z_ROPECRAB || kind === Z_FOREMAN ? 4 : 2.4;
      time = a.stT / seconds * this.duration(kind, key);
    } else if (a.st === ZS_SIEGE_WINDUP) { key = kind === Z_CRABCRANE ? 'hook_windup' : kind === Z_MILLER ? 'crank' : 'windup'; time = a.stT / (kind === Z_BATTERY || kind === Z_FOREMAN ? 2.4 : 1.8) * this.duration(kind, key); }
    else if (a.st === ZS_SIEGE_ACTION || a.st === ZS_ATTACK) { key = kind === Z_CRABCRANE ? 'hook_swing' : kind === Z_MILLER ? 'gust' : 'attack'; time = a.st === ZS_ATTACK ? a.stT / .5 * this.duration(kind,key) : kind === Z_SPRING || kind === Z_SIEGE_TOWER ? a.stT % this.duration(kind,key) : a.stT; }
    else if (a.st === ZS_SIEGE_SPENT) { key = slot.baked.clips.spent ? 'spent' : 'recover'; time = a.stT; }
    else if (a.speed > .08 || a.st === ZS_SIEGE_APPROACH) { key = 'walk'; const wheelRadius = kind === Z_BATTERY ? .39 : kind === Z_SIEGE_TOWER ? .48 : 0;
      time = (wheelRadius && a.path !== undefined ? a.path / (Math.PI*2*wheelRadius) : a.gait) * this.duration(kind, key); }
    const drawn = this.addClip(kind, root, key, time, flash, tint, tintMix, a.hit, a.die === 0);
    if (drawn && kind === Z_CRABCRANE && goal && [ZS_SIEGE_WINDUP,ZS_SIEGE_ACTION,ZS_SIEGE_OPEN].includes(a.st)) {
      targetPoint.set(goal.tx,goal.ty+.6,goal.tz).applyMatrix4(targetInverse.copy(root).invert());
      if(a.st===ZS_SIEGE_WINDUP){const u=Math.min(1,a.stT/1.8);targetPoint.lerpVectors(LOAD_REST,targetPoint,u);targetPoint.y+=4*u;}
      else if(a.st===ZS_SIEGE_ACTION)targetPoint.y+=4*(1-Math.min(1,a.stT/.5));
      else {const u=Math.min(1,a.stT/3);targetPoint.lerp(LOAD_REST,u);}
      const o=(slot.n-1)*4,arr=slot.target.array as Float32Array;arr[o]=targetPoint.x;arr[o+1]=targetPoint.y;arr[o+2]=targetPoint.z;arr[o+3]=1;
    }
    return drawn;
  }

  addClip(kind: number, root: THREE.Matrix4, key: string, time: number, flash = 0, tint: THREE.Color | null = null, mix = 0, hit = 0, allowHit = false): boolean {
    const s = this.slots.get(kind); if (!s || s.n === CAP) return false;
    const clip = s.baked.clips[key] ?? s.baked.clips.idle;
    const frame = frameAt(clip, time), first = Math.floor(frame);
    const values = s.anim.array as Float32Array, colors = s.tint.array as Float32Array;
    const i = s.n++, o = i * 4;
    (s.target.array as Float32Array)[o+3]=0;
    s.mesh.setMatrixAt(i, root);
    values[o] = clip.start + first;
    values[o+1] = clip.start + Math.min(clip.frames - 1, first + 1); values[o+2] = frame - first; values[o+3] = flash;
    // A hit blends the authored recoil pose into the action without resetting its clock.
    const recoil = s.baked.clips.hit;
    if (allowHit && hit > .01 && recoil) { values[o+1] = recoil.start + Math.round(frameAt(recoil, (1-hit)*recoil.duration)); values[o+2] = hit * .65; }
    colors[o] = tint?.r ?? 1; colors[o+1] = tint?.g ?? 1; colors[o+2] = tint?.b ?? 1; colors[o+3] = mix;
    return true;
  }

  end(): void {
    for (const s of this.slots.values()) {
      s.mesh.count = s.n; s.mesh.visible = s.n > 0;
      if (!s.n) continue;
      for (const [attr, stride] of [[s.mesh.instanceMatrix, 16], [s.anim, 4], [s.tint, 4], [s.target, 4]] as const) {
        attr.clearUpdateRanges(); attr.addUpdateRange(0, s.n * stride); attr.needsUpdate = true;
      }
    }
  }

  inspect(): Record<string, unknown> {
    return { loading: this.loading, error: this.error, models: [...this.slots].map(([kind,s]) => ({kind,id:s.id,height:s.baked.height,triangles:s.baked.triangles,parts:s.baked.parts,clips:s.baked.clips,draws:s.n?1:0,count:s.n})) };
  }
}

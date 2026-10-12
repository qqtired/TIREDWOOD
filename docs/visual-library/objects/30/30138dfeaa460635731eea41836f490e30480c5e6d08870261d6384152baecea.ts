// «Подземелье»: Старый Повидл — SkinnedMesh с клипами boss_* (README-hero-boss). Что играть, говорит симуляция
// (anim + с какого шага); смены — перекрёстные, «лёжа» (move) ⇄ «стоя» — дольше. Под землёй модель скрыта, по полу
// ползёт бугор (рисует сцена). Нора — тёмное пятно на полу в (0, 0, −4,6) модели.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { VBoss } from './view.ts';
import { DG_MAP } from '../../shared/dungeon/api.ts';
import { D } from '../../shared/dungeon/data.ts';

type BossAnim = VBoss['anim'];
const ONCE: BossAnim[] = ['emerge', 'burrow', 'slam', 'spit', 'roar', 'death', 'attack', 'appear', 'pour', 'boil', 'phase2', 'phase3', 'recover'];

export class BossView {
  readonly root = new THREE.Group();
  readonly family: 'povidl' | 'cauldronmaster';
  private readonly model: THREE.Object3D;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private cur: string | null = null;
  private curAt = -1;
  private readonly meshes: THREE.Mesh[] = [];
  private flashT = 0;
  private readonly mats: THREE.MeshStandardMaterial[] = [];
  private readonly lid: THREE.Object3D | null;
  private lidWorld: THREE.Matrix4 | null = null;
  private readonly lidLocal = new THREE.Matrix4();
  private readonly lidTarget = new THREE.Matrix4();

  constructor(gltf: GLTF, family: 'povidl' | 'cauldronmaster' = 'povidl') {
    this.family = family;
    this.model = SkeletonUtils.clone(gltf.scene);
    this.lid = family === 'cauldronmaster' ? this.model.getObjectByName('lid') ?? null : null;
    this.root.add(this.model);
    this.root.name = `dg-boss-${family}`;
    this.root.visible = false;
    this.model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.frustumCulled = false;
        this.meshes.push(m);
        // клон делит материалы с исходной моделью: у каждого босса свои, иначе вспышка попадания зажглась бы у обоих Близнецов
        const own = (Array.isArray(m.material) ? m.material : [m.material]).map((x) => x.clone());
        m.material = Array.isArray(m.material) ? own : own[0];
        for (const mat of own) if ('emissive' in mat) this.mats.push(mat as THREE.MeshStandardMaterial);
      }
    });
    for (const mat of this.mats) mat.userData.baseEmissive = mat.emissive.clone();
    this.mixer = new THREE.AnimationMixer(this.model);
    const prefix = family === 'povidl' ? 'boss_' : 'cauldronmaster_';
    for (const clip of gltf.animations) {
      if (!clip.name.startsWith(prefix)) continue;
      const k = clip.name.slice(prefix.length);
      const a = this.mixer.clipAction(clip);
      const base = k.replace(/_p[23]$/, '');
      if (ONCE.includes(base as BossAnim) || base === 'phase') {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      this.actions.set(k, a);
    }
  }

  hitFlash(): void {
    this.flashT = 0.08;
  }

  private key(anim: BossAnim, phase: number): string {
    if (this.family === 'cauldronmaster') {
      if (anim === 'phase2') return 'phase_p2';
      if (anim === 'phase3') return 'phase_p3';
      if (anim === 'appear') return 'idle';
    }
    const phased = `${anim}_p${phase}`;
    return this.family === 'cauldronmaster' && phase > 1 && this.actions.has(phased) ? phased : anim;
  }

  duration(anim: BossAnim, phase = 1): number {
    return (this.actions.get(this.key(anim, phase))?.getClip().duration ?? 1) / this.actionSpeed;
  }

  private get actionSpeed(): number { return this.family === 'cauldronmaster' ? D.cauldron.actionSpeed : 1; }

  /** b — состояние на шаге; tick — текущий шаг; stepT — секунды с начала anim */
  update(dt: number, b: VBoss | null, x: number, z: number, stepT: number, camX = x, camZ = z): void {
    if (!b) {
      this.root.visible = false;
      this.lidWorld = null;
      if (this.cur) {
        this.mixer.stopAllAction();
        this.cur = null;
      }
      return;
    }
    const speed = this.actionSpeed, clipT = stepT * speed;
    const under = b.anim === 'under';
    this.root.visible = !under;
    this.root.position.set(x, 0, z);
    this.root.scale.setScalar(b.scale);
    let d = b.yaw - this.root.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.root.rotation.y += d * Math.min(1, dt * 4 * speed);
    const key = this.key(b.anim, b.phase);
    if (!under && (key !== this.cur || b.animAt !== this.curAt)) {
      const next = this.actions.get(key);
      const prev = this.cur ? this.actions.get(this.cur) : undefined;
      if (next) {
        // Фаза меняет геометрию и жидкость. Не смешиваем одновременно два непрозрачных слоя чана.
        const phaseChange = this.family === 'cauldronmaster' && this.cur !== null && key.match(/_p[23]$/)?.[0] !== this.cur.match(/_p[23]$/)?.[0];
        if (phaseChange) this.mixer.stopAllAction();
        next.reset().setEffectiveWeight(1).play();
        if (ONCE.includes(b.anim)) next.time = Math.min(clipT, next.getClip().duration - 0.01);
        const lying = (k: string | null): boolean => k === 'move';
        // mixer уже ускорен: 0.1 секунды клипа дают 0.05 секунды реального смешивания.
        const fade = this.family === 'cauldronmaster' ? 0.1 : lying(b.anim) !== lying(this.cur) ? 0.5 : 0.2;
        if (!phaseChange && prev && prev !== next && this.cur !== 'burrow') prev.crossFadeTo(next, fade, false);
        else if (prev && prev !== next) prev.stop();
      }
      this.cur = key;
      this.curAt = b.animAt;
    }
    const move = this.actions.get('move');
    if (move) move.timeScale = 1;
    this.mixer.update(dt * speed);
    if (this.family === 'cauldronmaster') {
      // Серверный elapsed удерживается при freeze и не сбрасывается между предупреждением и ударом.
      const a = this.actions.get(key);
      if (a) {
        const duration = a.getClip().duration;
        a.time = ONCE.includes(b.anim) ? Math.max(0, Math.min(clipT, duration - 1e-4)) : ((clipT % duration) + duration) % duration;
        this.mixer.update(0);
      }
      this.lockDetachedLid(b, clipT, camX, camZ);
    }
    // вспышка попадания: эмиссия ярче на миг
    this.flashT = Math.max(0, this.flashT - dt);
    const k = this.flashT > 0 ? 1 : 0;
    for (const mat of this.mats) {
      const base = mat.userData.baseEmissive as THREE.Color;
      mat.emissive.setRGB(base.r + k * 0.5, base.g + k * 0.45, base.b + k * 0.5);
    }
  }

  /** GLB удерживает крышку относительно asset root; в игре после отрыва она остаётся на настоящем полу. */
  private lockDetachedLid(b: VBoss, stepT: number, camX: number, camZ: number): void {
    if (!this.lid?.parent || b.phase < 3) { this.lidWorld = null; return; }
    const transition = this.actions.get('phase_p3')?.getClip().duration ?? 1.5;
    if (!this.lidWorld && b.anim === 'phase3' && stepT < transition - 1e-4) return;
    this.root.updateMatrixWorld(true);
    if (!this.lidWorld) this.lidWorld = this.lid.matrixWorld.clone();
    this.lidTarget.copy(this.lidWorld);
    // Ближайшая копия упавшей крышки на торе, а не привязка к шагающему телу.
    const e = this.lidTarget.elements;
    e[12] += DG_MAP * Math.round((camX - e[12]) / DG_MAP);
    e[14] += DG_MAP * Math.round((camZ - e[14]) / DG_MAP);
    this.lidLocal.copy(this.lid.parent.matrixWorld).invert().multiply(this.lidTarget);
    this.lidLocal.decompose(this.lid.position, this.lid.quaternion, this.lid.scale);
    this.lid.updateMatrixWorld(true);
  }

  dispose(): void {
    this.mixer.stopAllAction();
  }
}

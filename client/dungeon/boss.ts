// «Подземелье»: Старый Повидл — SkinnedMesh с клипами boss_* (README-hero-boss). Что играть, говорит симуляция
// (anim + с какого шага); смены — перекрёстные, «лёжа» (move) ⇄ «стоя» — дольше. Под землёй модель скрыта, по полу
// ползёт бугор (рисует сцена). Нора — тёмное пятно на полу в (0, 0, −4,6) модели.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { VBoss } from './view.ts';

type BossAnim = VBoss['anim'];
const ONCE: BossAnim[] = ['emerge', 'burrow', 'slam', 'spit', 'roar', 'death'];

export class BossView {
  readonly root = new THREE.Group();
  private readonly model: THREE.Object3D;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<BossAnim, THREE.AnimationAction>();
  private cur: BossAnim | null = null;
  private curAt = -1;
  private readonly meshes: THREE.Mesh[] = [];
  private flashT = 0;
  private readonly mats: THREE.MeshStandardMaterial[] = [];

  constructor(gltf: GLTF) {
    this.model = SkeletonUtils.clone(gltf.scene);
    this.root.add(this.model);
    this.root.name = 'dg-boss';
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
    for (const k of ['idle', 'move', 'emerge', 'burrow', 'slam', 'spit', 'roar', 'death'] as BossAnim[]) {
      const clip = THREE.AnimationClip.findByName(gltf.animations, `boss_${k}`);
      if (!clip) continue;
      const a = this.mixer.clipAction(clip);
      if (ONCE.includes(k)) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      this.actions.set(k, a);
    }
  }

  hitFlash(): void {
    this.flashT = 0.08;
  }

  /** b — состояние на шаге; tick — текущий шаг; stepT — секунды с начала anim */
  update(dt: number, b: VBoss | null, x: number, z: number, stepT: number): void {
    if (!b) {
      this.root.visible = false;
      if (this.cur) {
        this.mixer.stopAllAction();
        this.cur = null;
      }
      return;
    }
    const under = b.anim === 'under';
    this.root.visible = !under;
    this.root.position.set(x, 0, z);
    this.root.scale.setScalar(b.scale);
    let d = b.yaw - this.root.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.root.rotation.y += d * Math.min(1, dt * 4);
    if (!under && (b.anim !== this.cur || b.animAt !== this.curAt)) {
      const next = this.actions.get(b.anim);
      const prev = this.cur ? this.actions.get(this.cur) : undefined;
      if (next) {
        next.reset().setEffectiveWeight(1).play();
        if (ONCE.includes(b.anim)) next.time = Math.min(stepT, next.getClip().duration - 0.01);
        const lying = (k: BossAnim | null): boolean => k === 'move';
        const fade = lying(b.anim) !== lying(this.cur) ? 0.5 : 0.2;
        if (prev && prev !== next && this.cur !== 'burrow') prev.crossFadeTo(next, fade, false);
        else if (prev && prev !== next) prev.stop();
      }
      this.cur = b.anim;
      this.curAt = b.animAt;
    }
    const move = this.actions.get('move');
    if (move) move.timeScale = 1;
    this.mixer.update(dt);
    // вспышка попадания: эмиссия ярче на миг
    this.flashT = Math.max(0, this.flashT - dt);
    const k = this.flashT > 0 ? 1 : 0;
    for (const mat of this.mats) {
      const base = mat.userData.baseEmissive as THREE.Color;
      mat.emissive.setRGB(base.r + k * 0.5, base.g + k * 0.45, base.b + k * 0.5);
    }
  }

  dispose(): void {
    this.mixer.stopAllAction();
  }
}

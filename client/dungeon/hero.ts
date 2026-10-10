// «Подземелье»: Фонарщик — SkinnedMesh со своими клипами (README-hero-boss): покой и бег по скорости с перекрёстной
// сменой, рывок, заряд Q (замах держится, пока держат), удар в землю, вздрог, смерть. Настоящая лампа сцены одна —
// фонарь героя (PointLight на кости фонаря, качается с ним). Неуязвимость — мигание видимостью меша (не прозрачностью:
// смена прозрачности пересобрала бы шейдеры).
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';

type HeroClip = 'idle' | 'run' | 'dash' | 'strike' | 'hit' | 'death' | 'swing';

/** Кадр удержания замаха (12 из 24 к/с) и кадр удара о землю (17) */
const STRIKE_HOLD = 12 / 24;
const STRIKE_HIT = 17 / 24;
/** высота лампы над полом, м */
const LIGHT_Y = 2.7;

export class HeroView {
  readonly root = new THREE.Group();
  readonly light: THREE.PointLight;
  private readonly model: THREE.Object3D;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<HeroClip, THREE.AnimationAction>();
  private base: HeroClip = 'idle';
  private oneShot: HeroClip | null = null;
  private striking = false;
  private dead = false;
  private readonly meshes: THREE.Object3D[] = [];
  /** сила фонаря без вспышек; вспышка (новый уровень, Q) добавляется сверху и тает */
  private readonly baseIntensity = 34;
  private flashK = 0;
  private readonly lantern: THREE.Object3D | null;
  private readonly lp = new THREE.Vector3();

  constructor(gltf: GLTF) {
    this.model = SkeletonUtils.clone(gltf.scene);
    this.root.add(this.model);
    this.root.name = 'dg-hero';
    this.model.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.frustumCulled = false;
        this.meshes.push(o);
      }
    });
    this.mixer = new THREE.AnimationMixer(this.model);
    const names: Record<HeroClip, string> = { idle: 'hero_idle', run: 'hero_run', dash: 'hero_dash', strike: 'hero_strike', hit: 'hero_hit', death: 'hero_death', swing: 'hero_swing' };
    for (const k of Object.keys(names) as HeroClip[]) {
      const clip = THREE.AnimationClip.findByName(gltf.animations, names[k]);
      if (!clip) continue;
      const a = this.mixer.clipAction(clip);
      if (k !== 'idle' && k !== 'run') {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      this.actions.set(k, a);
    }
    this.actions.get('idle')?.play();
    // фонарь: тёплая лампа на кости фонаря, центр стекла (0; 0,21; 0)
    // лампа висит выше фонаря (иначе под ним — пересвеченное пятно), но ходит за ним по x/z
    this.light = new THREE.PointLight(0xffc27a, this.baseIntensity, 19, 1.1);
    this.light.name = 'dg-lantern-light';
    this.lantern = this.model.getObjectByName('lantern') ?? null;
    this.root.add(this.light);
    this.light.position.set(0, LIGHT_Y, 0);
    this.mixer.addEventListener('finished', (e) => {
      const done = (e as unknown as { action: THREE.AnimationAction }).action;
      if (this.dead) return;
      if (this.oneShot && this.actions.get(this.oneShot) === done) {
        this.oneShot = null;
        this.striking = false;
        this.fadeTo(this.base, 0.15);
      }
    });
  }

  private current(): THREE.AnimationAction | undefined {
    return this.actions.get(this.oneShot ?? this.base);
  }

  private fadeTo(k: HeroClip, dur: number): void {
    const next = this.actions.get(k);
    const prev = this.current();
    if (!next) return;
    if (next === prev && next.isRunning()) return;
    next.reset().setEffectiveWeight(1).play();
    if (prev && prev !== next) prev.crossFadeTo(next, dur, false);
  }

  private play(k: HeroClip, fade = 0.1, from = 0): void {
    if (this.dead) return;
    const prev = this.current();
    const next = this.actions.get(k);
    if (!next) return;
    this.oneShot = k;
    next.reset();
    next.time = from;
    next.setEffectiveWeight(1).play();
    if (prev && prev !== next) prev.crossFadeTo(next, fade, false);
  }

  dash(): void {
    this.play('dash', 0.06);
  }

  hit(): void {
    if (this.oneShot === 'dash' || this.striking) return;
    this.play('hit', 0.06);
  }

  /** Начал заряд Q: замах, держим на кадре 12 */
  chargeStart(): void {
    this.play('strike', 0.08);
    this.striking = true;
  }

  /** Отпустил Q: удар в землю */
  strike(): void {
    const a = this.actions.get('strike');
    if (!a) return;
    if (this.oneShot !== 'strike') this.play('strike', 0.05, STRIKE_HOLD);
    a.paused = false;
    a.time = Math.max(a.time, STRIKE_HOLD + 0.02);
    this.striking = false;
    this.flashK = Math.max(this.flashK, 0.8);
  }

  die(): void {
    if (this.dead) return;
    this.play('death', 0.1);
    this.dead = true;
  }

  revive(): void {
    this.dead = false;
    this.oneShot = null;
    this.striking = false;
    this.mixer.stopAllAction();
    this.base = 'idle';
    this.actions.get('idle')?.reset().play();
  }

  flash(k: number): void {
    this.flashK = Math.max(this.flashK, k);
  }

  /** speed — м/с; charging — держат Q; blink — неуязвимость (мигает) */
  update(dt: number, x: number, z: number, yaw: number, speed: number, charging: boolean, blink: boolean, time: number, lanternK: number, y = 0): void {
    this.root.position.set(x, y, z);
    // поворот — плавно, по кратчайшей дуге
    let d = yaw - this.root.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.root.rotation.y += d * Math.min(1, dt * 14);
    const want: HeroClip = speed > 0.6 ? 'run' : 'idle';
    if (want !== this.base) {
      const prevBase = this.base;
      this.base = want;
      if (!this.oneShot) {
        const a = this.actions.get(want);
        const p = this.actions.get(prevBase);
        if (a && p) {
          a.reset().setEffectiveWeight(1).play();
          p.crossFadeTo(a, 0.18, false);
        }
      }
    }
    const run = this.actions.get('run');
    if (run) run.timeScale = Math.max(0.6, Math.min(1.6, speed / 6));
    // заряд Q: замах держится на кадре удержания
    const st = this.actions.get('strike');
    if (st && this.striking && charging && this.oneShot === 'strike') {
      if (st.time >= STRIKE_HOLD) {
        st.time = STRIKE_HOLD;
        st.paused = true;
      }
    } else if (st && st.paused) st.paused = false;
    this.mixer.update(dt);
    const vis = !blink || Math.floor(time * 16) % 2 === 0 || this.dead;
    for (const m of this.meshes) m.visible = vis;
    this.flashK = Math.max(0, this.flashK - dt * 2.5);
    const flicker = 1 + Math.sin(time * 13.1) * 0.03 + Math.sin(time * 7.3) * 0.04;
    this.light.intensity = (this.baseIntensity * flicker + this.flashK * 70) * lanternK;
    if (this.lantern) {
      this.root.updateMatrixWorld(true);
      this.lantern.getWorldPosition(this.lp);
      this.root.worldToLocal(this.lp);
      this.light.position.set(this.lp.x * 0.6, LIGHT_Y, this.lp.z * 0.6);
    }
  }

  /** Точка фонаря в мире (для вспышек), пишет в out */
  lanternPos(out: THREE.Vector3): THREE.Vector3 {
    return this.light.getWorldPosition(out);
  }

  get isCharging(): boolean {
    return this.striking;
  }

  get strikeHitTime(): number {
    return STRIKE_HIT;
  }

  dispose(): void {
    this.mixer.stopAllAction();
  }
}

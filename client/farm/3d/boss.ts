// Древо разлома (design-v11 §11, §16.5; art/farm/MODELS.md «Древо разлома»): пень на пьедестале спит, вечером трескается,
// Древо вырастает из разлома (emerge) и ворчит. Полоса «Цветение» ведёт оттенки коры и мха и слои: почки (фаза 2), листва
// (3), цветы местами (4), полное цветение (победа). Фаза 2 — чихает облаком пыльцы раз в 40 с; фазы 2–3 — бросает
// шишки (их выдаёт сервер, здесь — бросок и шишки на земле); фаза 3 — хихикает от искорок; фаза 4 — пляшет. Победа:
// хохот, салют лепестков, зевает и уходит в разлом, пень в цветах. Не расцвело — пожимает ветками и уходит.
// Искорка роста: каждый сбор во время события — светлячок дугой с грядки в Древо, размер — от опыта.
// Состояние приходит от части B1 (FarmWorld.onSys → setState / spark / cone); без неё Древо спит.
import * as THREE from 'three';
import { FARM_LAYOUT } from '../../../shared/farmlayout.ts';
import { Actor, type FarmModel, type Part } from '../models.ts';
import type { FarmFx } from './fx.ts';

export type BossPhase = 'sleep' | 'awake' | 'won' | 'lost';

const SPOT = FARM_LAYOUT.objects.find((o) => o.id === 'boss')!;
const TOP = 0.3;
/** Облако пыльцы — на этой секунде клипа sneeze */
const SNEEZE_PUFF = 1.6;
/** Куда летят искорки: середина ствола */
const HIT_Y = 4.2;

interface Spark { x0: number; z0: number; y0: number; t: number; dur: number; size: number; trail: number }
interface Cone { actor: Actor; gone: number }

function group(parts: readonly Part[] | undefined): THREE.Group {
  const g = new THREE.Group();
  for (const p of parts ?? []) {
    const m = new THREE.Mesh(p.geo, p.mat);
    m.matrixAutoUpdate = false;
    m.matrix.copy(p.matrix);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  return g;
}

export class FarmBoss {
  private readonly fx: FarmFx;
  private readonly stump: THREE.Group;
  private readonly cracked: THREE.Group;
  private readonly bloomStump: THREE.Group;
  private readonly tree: Actor | null;
  private readonly layers: Record<'buds' | 'leaves' | 'some' | 'full', THREE.Object3D | null>;
  private readonly mats: { mat: THREE.MeshStandardMaterial; tints: number[][] }[] = [];
  private readonly coneModel: FarmModel | undefined;
  private readonly cones = new Map<number, Cone>();
  private readonly sparks: Spark[] = [];
  private phase: BossPhase = 'sleep';
  private bloom = 0;
  /** Ушло в разлом: Древо спрятано */
  private down = true;
  private leaveT = 0;
  /** Сколько до облака пыльцы после начала чиха, с */
  private sneezeT = 0;
  private won = false;
  private shadowUp = false;
  /** Фаза с сервера (0 — считать по полосе) */
  private serverStage = 0;
  private readonly hit = new THREE.Vector3(SPOT.x, HIT_Y, SPOT.z);
  private readonly tmp = new THREE.Vector3();

  private readonly refresh: () => void;

  /** refresh — пересчитать запечённые тени (пень сменился, Древо вышло или ушло) */
  constructor(scene: THREE.Scene, models: Map<string, FarmModel>, fx: FarmFx, refresh: () => void) {
    this.fx = fx;
    this.refresh = refresh;
    const ped = models.get('pedestal');
    const place = (g: THREE.Group): THREE.Group => {
      g.position.set(SPOT.x, TOP, SPOT.z);
      g.rotation.y = SPOT.yaw;
      scene.add(g);
      return g;
    };
    this.stump = place(group(ped?.nodes.get('boss_stump')));
    this.cracked = place(group(ped?.nodes.get('boss_stump_cracked')));
    this.bloomStump = place(group(ped?.nodes.get('boss_stump_bloom')));
    const m = models.get('boss-tree');
    this.tree = m && m.gltf.animations.length ? new Actor(m, true) : null;
    const find = (n: string) => this.tree?.root.getObjectByName(n) ?? null;
    this.layers = { buds: find('boss-tree_buds'), leaves: find('boss-tree_leaves'), some: find('boss-tree_flowers_some'), full: find('boss-tree_flowers_full') };
    if (this.tree) {
      const r = this.tree.root;
      r.position.set(SPOT.x, TOP, SPOT.z);
      r.rotation.y = SPOT.yaw;
      r.traverse((o) => {
        const mesh = o as THREE.SkinnedMesh;
        if (!mesh.isSkinnedMesh) return;
        mesh.castShadow = true;
        mesh.frustumCulled = false;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        const tints = mat.userData.phaseTints as number[][] | undefined;
        if (tints && !this.mats.some((x) => x.mat === mat)) this.mats.push({ mat, tints });
      });
      scene.add(r);
      this.tree.loop('idle');
    }
    this.coneModel = models.get('boss-cone');
    this.apply();
  }

  get awake(): boolean {
    return this.phase === 'awake';
  }

  /** Фаза полосы «Цветение»: 1–4 */
  private get stage(): number {
    if (this.serverStage > 0) return this.serverStage;
    return this.bloom < 0.25 ? 1 : this.bloom < 0.5 ? 2 : this.bloom < 0.75 ? 3 : 4;
  }

  /**
   * Состояние события: спит, идёт (bloom 0…1, stage — фаза 1–4 с сервера), расцвело, ушло без наград. instant — без
   * роликов (вошёл на ферму посреди события или после него)
   */
  setState(phase: BossPhase, bloom = this.bloom, stage = 0, instant = false): void {
    const was = this.phase;
    const wasStage = this.stage;
    this.serverStage = stage;
    if (instant) {
      this.phase = phase;
      this.bloom = phase === 'won' ? 1 : THREE.MathUtils.clamp(bloom, 0, 1);
      this.down = phase !== 'awake';
      this.won = phase === 'won';
      this.leaveT = 0;
      if (phase !== 'awake') for (const id of [...this.cones.keys()]) this.removeCone(id, false);
      this.apply();
      return;
    }
    this.bloom = THREE.MathUtils.clamp(bloom, 0, 1);
    this.phase = phase;
    const t = this.tree;
    if (phase === 'awake' && (was !== 'awake' || this.down)) {
      this.down = false;
      this.won = false;
      this.fx.burst({ x: SPOT.x, y: TOP + 0.4, z: SPOT.z, n: 40, color: 0x9a7b5a, spread: 2.2, up: 2.5, life: 1.6, size: 0.35, gravity: 1.2 });
      t?.play('emerge', 0.05);
    } else if (phase === 'won' && was !== 'won') {
      this.won = true;
      this.bloom = 1;
      t?.play('bloom_laugh');
      this.leaveT = 3;
      this.petals(80);
    } else if (phase === 'lost' && was !== 'lost') {
      this.won = false;
      t?.play('shrug_leave');
      this.leaveT = 3.4;
    } else if (phase === 'sleep') {
      this.down = true;
    }
    if (phase !== 'awake') for (const id of this.cones.keys()) this.removeCone(id, false);
    if (phase === 'awake' && this.stage !== wasStage) {
      // новый слой: «хлоп» листвы или цветов
      this.fx.burst({ x: SPOT.x, y: 4.5, z: SPOT.z, n: 30, color: this.stage >= 4 ? 0xffb6d0 : 0x8fd35a, spread: 2.5, up: 1, life: 1.4, size: 0.25, gravity: 0.6 });
    }
    this.apply();
  }

  private apply(): void {
    const up = !this.down;
    if (up !== this.shadowUp) {
      this.shadowUp = up;
      this.refresh();
    }
    this.stump.visible = this.down && !this.won;
    this.bloomStump.visible = this.down && this.won;
    this.cracked.visible = up;
    if (this.tree) this.tree.root.visible = up;
    const s = this.phase === 'won' ? 5 : this.stage;
    const L = this.layers;
    if (L.buds) L.buds.visible = s === 2;
    if (L.leaves) L.leaves.visible = s >= 3;
    if (L.some) L.some.visible = s >= 4;
    if (L.full) L.full.visible = s >= 5;
    this.tree?.loop(this.phase === 'awake' && s === 4 ? 'dance' : 'idle');
    // оттенки коры и мха по полосе: 5 точек от серого до цветения (линейный RGB)
    const k = (this.phase === 'won' ? 1 : this.bloom) * 4;
    for (const { mat, tints } of this.mats) {
      const i = Math.min(3, Math.floor(k));
      const f = k - i;
      const a = tints[i];
      const b = tints[Math.min(4, i + 1)];
      mat.color.setRGB(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f);
    }
  }

  private petals(n: number): void {
    for (const c of [0xffc2d6, 0xfff1f6, 0xffd36a]) this.fx.burst({ x: SPOT.x, y: 6, z: SPOT.z, n: n / 3, color: c, spread: 4, up: 3, life: 3, size: 0.3, gravity: 0.8 });
  }

  /** Искорка роста с грядки (x, z) в Древо; xp — размер (редис — точка, звёздный цветок — шар) */
  spark(x: number, z: number, xp: number): void {
    if (this.down) return;
    const size = THREE.MathUtils.clamp(0.18 + Math.sqrt(Math.max(1, xp)) * 0.05, 0.2, 0.75);
    const d = Math.hypot(x - SPOT.x, z - SPOT.z);
    this.sparks.push({ x0: x, z0: z, y0: 0.6, t: 0, dur: THREE.MathUtils.clamp(d / 14, 0.8, 2.6), size, trail: 0 });
  }

  /** Чих (фаза 2, раз в 40 с — по сигналу сервера) */
  sneeze(): void {
    if (this.down) return;
    this.tree?.play('sneeze');
    this.sneezeT = SNEEZE_PUFF;
  }

  /** Шишки на земле — как в виде сервера: новые падают, пропавшие подобраны */
  setCones(list: readonly { id: number; x: number; z: number }[]): void {
    const ids = new Set(list.map((c) => c.id));
    for (const id of [...this.cones.keys()]) if (!ids.has(id)) this.removeCone(id);
    for (const c of list) this.addCone(c.id, c.x, c.z);
  }

  /** Шишка-ворчунья упала (бросок из правой ветки) */
  addCone(id: number, x: number, z: number): void {
    if (!this.coneModel || this.cones.has(id)) return;
    this.tree?.play('throw');
    const actor = new Actor(this.coneModel);
    actor.root.position.set(x, 0, z);
    actor.root.rotation.y = Math.random() * Math.PI * 2;
    actor.loop('idle');
    actor.play('land');
    this.stump.parent?.add(actor.root);
    this.cones.set(id, { actor, gone: -1 });
  }

  /** Шишка на земле рядом с точкой (подобрать, пройдя сквозь неё): id или null */
  coneAt(x: number, z: number, r: number): number | null {
    for (const [id, c] of this.cones) {
      if (c.gone >= 0) continue;
      const p = c.actor.root.position;
      if (Math.hypot(p.x - x, p.z - z) < r) return id;
    }
    return null;
  }

  /** Шишку подобрали: «пуф», маленькая искорка в Древо */
  removeCone(id: number, spark = true): void {
    const c = this.cones.get(id);
    if (!c || c.gone >= 0) return;
    c.actor.play('pickup', 0.05);
    c.gone = 0.5;
    const p = c.actor.root.position;
    if (spark) this.spark(p.x, p.z, 4);
  }

  update(dt: number): void {
    const t = this.tree;
    if (this.leaveT > 0) {
      this.leaveT -= dt;
      if (this.leaveT <= 0 && t) {
        if (this.phase === 'won') { t.play('yawn_leave'); this.leaveT = -4; }
        else { this.down = true; this.apply(); }
      }
    } else if (this.leaveT < 0) {
      this.leaveT += dt;
      if (this.leaveT >= 0) {
        this.leaveT = 0;
        this.down = true;
        this.apply();
      }
    }
    if (this.sneezeT > 0) {
      this.sneezeT -= dt;
      // облако пыльцы — на ~1,6 с клипа
      if (this.sneezeT <= 0) this.fx.burst({ x: SPOT.x, y: 5, z: SPOT.z, n: 60, color: 0xffd86b, spread: 3.5, up: 0.4, life: 3, size: 0.3, gravity: 0.25, glow: true });
    }
    // искорки: дуга с грядки в ствол, тёплый след
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.t += dt;
      const k = Math.min(1, s.t / s.dur);
      const e = k * k * (3 - 2 * k);
      const x = s.x0 + (this.hit.x - s.x0) * e;
      const z = s.z0 + (this.hit.z - s.z0) * e;
      const y = s.y0 + (HIT_Y - s.y0) * e + Math.sin(k * Math.PI) * 4;
      s.trail -= dt;
      if (s.trail <= 0) {
        s.trail = 0.03;
        this.fx.one(x, y, z, 0, -0.2, 0, k < 0.5 ? 0xc8f06a : 0xffd36a, 0.5, s.size * 0.7);
      }
      this.fx.one(x, y, z, 0, 0, 0, 0xfff0a0, 0.05, s.size);
      if (k >= 1) {
        this.sparks.splice(i, 1);
        this.tmp.set(this.hit.x, HIT_Y, this.hit.z);
        this.fx.burst({ x: this.tmp.x, y: this.tmp.y, z: this.tmp.z, n: 14, color: 0x9be15a, spread: 1.4, up: 0.6, life: 0.8, size: 0.2, gravity: 0.5, glow: true });
        if (t && this.phase === 'awake' && (t.playing === 'idle' || t.playing === 'dance')) t.play(this.stage === 3 ? 'giggle' : 'spark_hit');
      }
    }
    for (const [id, c] of this.cones) {
      c.actor.update(dt);
      if (c.gone >= 0) {
        c.gone -= dt;
        if (c.gone < 0) {
          c.actor.root.removeFromParent();
          this.cones.delete(id);
        }
      }
    }
    t?.update(dt);
  }
}

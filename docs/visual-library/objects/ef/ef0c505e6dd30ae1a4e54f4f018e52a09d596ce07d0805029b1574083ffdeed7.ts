// The harbour's animals: three cats and a dog on the quays, gulls on the piers, crabs on the little sandbar by the
// lighthouse jetty. Positions come from the shared schedule (crittersim.ts, identical for every player); what the
// players do to them is local (critterbrain.ts). This file builds the models, drives them, and draws the extras:
// contact shadows, pet hearts, the sandbar (critter-cove.ts) with its bubbles and sand puffs.
import * as THREE from 'three';
import { TICK_RATE } from '../../shared/constants.ts';
import { CRITTERS, CRITTERS_ENABLED, type CritterDef } from '../../shared/maps/critters.ts';
import type { CollisionWorld } from '../../shared/world.ts';
import { pulse } from './critter-kit.ts';
import { Crab, Gull } from './critter-coastal.ts';
import { Cove } from './critter-cove.ts';
import { Quadruped } from './critter-quadruped.ts';
import { CritterBrain, brainWorld, type CritterVisit, type Mover, type Scare } from './critterbrain.ts';
import type { CritterPlayer } from './crittersim.ts';

export interface CritterOptions {
  onPurr?: (x: number, y: number, z: number, hiss: boolean) => void;
  onGullCry?: (x: number, y: number, z: number) => void;
  onWoof?: (x: number, y: number, z: number) => void;
  /** The lobby's solid world: lets the animals check where they can step. */
  collision?: CollisionWorld;
}
export interface PettableCat { id: number; x: number; y: number; z: number; label: string }
/** Another player (the local one is passed separately). */
export interface CritterOther { id: number; x: number; y: number; z: number }

type Visual = Quadruped | Gull | Crab;
interface Animal { def: CritterDef; visual: Visual; heart: number; wasBubbling: boolean; puffAt: number }

const HEARTS = 6;
/** Contact shadow half-extents (x, z) in metres per kind. */
const SHADOW: Record<CritterDef['kind'], readonly [number, number]> = { dog: [0.3, 0.62], cat: [0.18, 0.42], gull: [0.13, 0.27], crab: [0.25, 0.2] };


export class LobbyCritters {
  readonly group = new THREE.Group();
  /** Everything is built in code, so there is nothing to wait for (kept for the callers that await it). */
  readonly ready: Promise<void> = Promise.resolve();
  private readonly animals: Animal[] = [];
  private readonly brain: CritterBrain;
  private readonly cove: Cove;
  private readonly options: CritterOptions;
  private readonly shadows: THREE.InstancedMesh;
  private readonly hearts: THREE.InstancedMesh;
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly movers: Mover[] = [];
  private readonly scares: Scare[] = [];
  private readonly seen = new Map<number, { x: number; z: number; t: number; speed: number }>();
  private lastTime = 0;
  private hasTime = false;
  private lastPlayer = { x: 1e6, y: 1e6, z: 1e6 };

  constructor(scene: THREE.Scene, options: CritterOptions = {}) {
    this.options = options;
    this.group.name = 'city-critters'; this.group.visible = CRITTERS_ENABLED;
    this.brain = new CritterBrain(CRITTERS, options.collision ? brainWorld(options.collision) : null);
    this.shadows = new THREE.InstancedMesh(shadowGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), CRITTERS.length);
    this.shadows.name = 'critter-contact-shadows'; this.shadows.frustumCulled = false; this.shadows.renderOrder = 1;
    const heart = new THREE.Shape();
    heart.moveTo(0, -0.07); heart.bezierCurveTo(-0.14, 0.02, -0.085, 0.15, 0, 0.075); heart.bezierCurveTo(0.085, 0.15, 0.14, 0.02, 0, -0.07);
    this.hearts = new THREE.InstancedMesh(new THREE.ExtrudeGeometry(heart, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1, steps: 1 }), new THREE.MeshStandardMaterial({ color: 0xe990a4, roughness: 0.72 }), HEARTS);
    this.hearts.name = 'critter-pet-hearts'; this.hearts.frustumCulled = false;
    for (const mesh of [this.shadows, this.hearts]) for (let i = 0; i < mesh.count; i++) mesh.setMatrixAt(i, this.matrix.makeScale(0, 0, 0));
    this.group.add(this.shadows, this.hearts);
    this.cove = new Cove(this.group);
    scene.add(this.group);
    if (!CRITTERS_ENABLED) return;
    let heartSlot = 0;
    for (const def of CRITTERS) {
      const visual: Visual = def.kind === 'gull' ? new Gull(def.coat, def.id) : def.kind === 'crab' ? new Crab(def.coat, def.id) : new Quadruped(def.kind, def.coat, def.id);
      visual.group.visible = false; this.group.add(visual.group);
      this.animals.push({ def, visual, heart: def.kind === 'cat' || def.kind === 'dog' ? heartSlot++ : -1, wasBubbling: false, puffAt: 0 });
    }
  }

  update(serverTick: number, localSeconds: number, camera: { x: number; y: number; z: number }, player: CritterPlayer, catchingFish: readonly { x: number; z: number }[] = [], others: readonly CritterOther[] = []): void {
    if (!CRITTERS_ENABLED) return;
    const dt = this.hasTime ? Math.min(0.1, Math.max(0, localSeconds - this.lastTime)) : 0;
    this.lastTime = localSeconds; this.hasTime = true; Object.assign(this.lastPlayer, player);
    // who can scare or attract them: this player and the other players (their speed from successive positions)
    this.movers.length = 0;
    if (player.x < 1e5) this.movers.push({ id: -1, x: player.x, y: player.y, z: player.z, speed: player.speed });
    for (const o of others) {
      const s = this.seen.get(o.id);
      let speed = s?.speed ?? 0;
      if (s && localSeconds > s.t) speed += (Math.min(12, Math.hypot(o.x - s.x, o.z - s.z) / (localSeconds - s.t)) - speed) * 0.35;
      this.seen.set(o.id, { x: o.x, z: o.z, t: localSeconds, speed });
      this.movers.push({ id: o.id, x: o.x, y: o.y, z: o.z, speed });
    }
    if (this.seen.size > others.length + 8) { const ids = new Set(others.map((o) => o.id)); for (const k of this.seen.keys()) if (!ids.has(k)) this.seen.delete(k); }
    this.scares.length = 0;
    for (const f of catchingFish) this.scares.push({ x: f.x, z: f.z, r: 7 });

    this.brain.update(serverTick, localSeconds, dt, camera, this.movers, this.scares);
    for (const e of this.brain.events) {
      if (e.kind === 'cry') { if (Math.hypot(camera.x - e.x, camera.z - e.z) < 30) this.options.onGullCry?.(e.x, e.y, e.z); }
      else if (e.kind === 'purr') this.options.onPurr?.(e.x, e.y, e.z, e.hiss);
      else if (Math.hypot(camera.x - e.x, camera.z - e.z) < 30) this.options.onWoof?.(e.x, e.y, e.z);
    }

    const clock = serverTick / TICK_RATE;
    this.animals.forEach((a, i) => {
      const mind = this.brain.minds[i], p = mind.pose;
      const distance = Math.hypot(camera.x - p.x, camera.y - p.y, camera.z - p.z), visible = distance <= 80;
      a.visual.group.visible = visible;
      if (visible) {
        const t = clock + a.def.id * 0.37;
        a.visual.update(p, t, dt, distance <= 50);
        if (a.def.kind === 'crab') this.crabExtras(a, p, t, localSeconds, distance);
      }
      this.drawGround(a, i, visible, camera, mind.mode === 'hold' && this.brain.petted(i));
    });
    this.cove.update(dt, camera);
    this.shadows.instanceMatrix.needsUpdate = true; this.hearts.instanceMatrix.needsUpdate = true;
  }

  /** Bubbles from a sitting crab's mouth, sand flicked out while one digs in. */
  private crabExtras(a: Animal, p: { x: number; y: number; z: number; action: string; restWeight: number }, t: number, now: number, distance: number): void {
    if (distance > 30) return;
    const crab = a.visual as Crab, heading = crab.group.rotation.y;
    const bubbling = p.action === 'sit' && pulse(t, 3.4 + (a.def.id % 4) * 0.6, a.def.id, 0.12) >= 0;
    if (bubbling && !a.wasBubbling) this.cove.emitBubble(p.x - Math.sin(heading) * 0.11, p.y + 0.11, p.z - Math.cos(heading) * 0.11);
    a.wasBubbling = bubbling;
    if (p.action === 'burrow' && p.restWeight > 0.04 && p.restWeight < 0.96 && now > a.puffAt) {
      a.puffAt = now + 0.07; this.cove.emitSand(p.x + (Math.random() - 0.5) * 0.18, p.y, p.z + (Math.random() - 0.5) * 0.18);
    }
  }

  /** The animal the player can pet right now (E): a cat, or the dog. */
  nearestCat(player: { x: number; y: number; z: number }, maxDistance = 1.25): PettableCat | null {
    if (!CRITTERS_ENABLED) return null;
    let result: PettableCat | null = null, best = maxDistance;
    this.animals.forEach((a, i) => {
      if (a.def.kind !== 'cat' && a.def.kind !== 'dog') return;
      const p = this.brain.minds[i].pose;
      if (!a.visual.group.visible || !this.brain.pettable(i)) return;
      const d = Math.hypot(player.x - p.x, player.z - p.z);
      if (d < best && Math.abs(player.y - p.y) < 1.25) { best = d; result = { id: a.def.id, x: p.x, y: p.y, z: p.z, label: a.def.kind === 'dog' ? 'погладить пса' : 'погладить кота' }; }
    });
    return result;
  }
  petCat(id: number, serverTick: number, localSeconds: number): boolean {
    const i = this.animals.findIndex((a) => a.def.id === id);
    if (!CRITTERS_ENABLED || i < 0) return false;
    const p = this.brain.minds[i].pose;
    if (Math.hypot(this.lastPlayer.x - p.x, this.lastPlayer.z - p.z) > 1.4 || Math.abs(this.lastPlayer.y - p.y) > 1.25) return false;
    const done = this.brain.pet(i, localSeconds, serverTick);
    for (const e of this.brain.events) {
      if (e.kind === 'purr') this.options.onPurr?.(e.x, e.y, e.z, e.hiss);
      else if (e.kind === 'woof') this.options.onWoof?.(e.x, e.y, e.z);
    }
    this.brain.events.length = 0;
    return done;
  }

  /** Кот id идёт посмотреть (крысиные бега) или возвращается к своим делам (null) */
  setVisit(id: number, visit: CritterVisit | null): void {
    if (!CRITTERS_ENABLED) return;
    const i = this.animals.findIndex((a) => a.def.id === id);
    if (i >= 0) this.brain.setVisit(i, visit);
  }

  /** Где кот id и что делает (отладка, снимки) */
  where(id: number): { x: number; y: number; z: number; mode: string } | null {
    const i = this.animals.findIndex((a) => a.def.id === id);
    if (i < 0) return null;
    const m = this.brain.minds[i];
    return { x: m.pose.x, y: m.pose.y, z: m.pose.z, mode: m.mode };
  }

  debug(): Record<string, unknown> {
    return {
      enabled: CRITTERS_ENABLED, count: this.animals.length, modelsReady: this.animals.length,
      animals: this.animals.map((a, i) => { const m = this.brain.minds[i]; return { id: a.def.id, kind: a.def.kind, mode: m.mode, ...m.pose }; }),
    };
  }

  private drawGround(a: Animal, i: number, visible: boolean, camera: { x: number; y: number; z: number }, petted: boolean): void {
    const p = this.brain.minds[i].pose, kind = a.def.kind;
    this.quaternion.setFromAxisAngle(this.up, a.visual.group.rotation.y);
    const onFloor = visible && p.action !== 'fly' && !p.airborne, burrow = p.action === 'burrow' ? 1 - p.restWeight : 1, [sx, sz] = SHADOW[kind];
    this.matrix.compose(this.position.set(p.x, p.y + 0.006, p.z), this.quaternion, this.scale.set(onFloor ? sx * burrow : 0, 1, onFloor ? sz * burrow : 0));
    this.shadows.setMatrixAt(i, this.matrix);
    if (a.heart >= 0) {
      const show = visible && petted;
      this.quaternion.setFromAxisAngle(this.up, Math.atan2(camera.x - p.x, camera.z - p.z));
      this.matrix.compose(this.position.set(p.x, p.y + (kind === 'dog' ? 1.02 : 0.79) + Math.sin(this.lastTime * 3) * 0.022, p.z), this.quaternion, this.scale.setScalar(show ? 1 : 0));
      this.hearts.setMatrixAt(a.heart, this.matrix);
    }
  }
}

function shadowGeometry(): THREE.BufferGeometry {
  const positions: number[] = [], colors: number[] = [], indices: number[] = [], n = 24, rings = 5;
  for (let r = 0; r <= rings; r++) for (let j = 0; j < n; j++) {
    const radius = r / rings, angle = (j / n) * Math.PI * 2;
    positions.push(Math.cos(angle) * radius, 0, Math.sin(angle) * radius); colors.push(0, 0, 0, 0.24 * (1 - radius) ** 2);
  }
  for (let r = 0; r < rings; r++) for (let j = 0; j < n; j++) { const a = r * n + j, b = r * n + (j + 1) % n, c = b + n, d = a + n; indices.push(a, d, b, b, d, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4)); g.setIndex(indices);
  return g;
}

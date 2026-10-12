// Ходячие питомцы фермы (design-v11 §12.3): цыплёнок, поросёнок, жук, светлячок в банке, мини-гриб. Каждый клиент
// рисует их сам по позициям хозяев — по сети ничего не идёт: желейки сообщают о себе в WALKERS (outfitfarm.ts), а этот
// менеджер на своей сцене (ферма, набережная) ведёт питомцев. Питомец идёт по следу хозяина в 1,2–1,8 м позади и
// сбоку, на рывке бежит; дальше 12 м или после поездки — «пуф» рядом с хозяином; хозяин стоит у места — отходит в
// сторону и садится; эмоция, сбор и уровень хозяина — радуется. Видны 12 ближних к камере, дальше 25 м — упрощённая
// сетка, дальше 40 м — скрыт. Скелетных инстансов в three нет: у каждого видимого питомца своя сетка (1 отрисовка,
// у банки 3); всего не больше 12.
import * as THREE from 'three';
import { isAboard, isFerry, isRiding } from '../../../shared/lobby.ts';
import { WALKERS, WALK_PETS, type Walker } from '../../render/outfitfarm.ts';
import { Actor, loadModel, type FarmModel } from '../models.ts';
import type { FarmFx } from './fx.ts';

const SHOW = 12;
const LOD_R = 25;
const HIDE_R = 40;
const POOF_R = 12;
/** Сколько пути по следу держится позади хозяина и насколько сбоку */
const BEHIND = 1.4;
const SIDE = 0.55;
/** Хозяин стоит дольше — питомец садится в стороне */
const SIT_AFTER = 1.6;
/** Сообщений от хозяина нет дольше — его нет в кадре */
const STALE_MS = 400;

interface Pet {
  kind: string;
  actor: Actor | null;
  full: THREE.Object3D | null;
  lod: THREE.Object3D | null;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** След хозяина: точки, последняя — где он сейчас */
  trail: THREE.Vector3[];
  still: number;
  happySeen: number;
  side: number;
  placed: boolean;
  shown: boolean;
}

const models = new Map<string, FarmModel>();
const loadingKinds = new Set<string>();

function petModel(kind: string): FarmModel | null {
  const m = models.get(kind);
  if (m) return m;
  if (!loadingKinds.has(kind)) {
    loadingKinds.add(kind);
    void loadModel(`pet-${kind}`).then((x) => { if (x.gltf.animations.length) models.set(kind, x); });
  }
  return null;
}

/** Найти сетку питомца по имени: у банки это группа из трёх */
function part(root: THREE.Object3D, name: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  root.traverse((o) => {
    if (!found && o.name === name && ((o as THREE.Mesh).isMesh || o.children.some((c) => (c as THREE.Mesh).isMesh))) found = o;
  });
  return found;
}

export class WalkPets {
  private readonly scene: THREE.Object3D;
  private readonly fx: FarmFx | null;
  private readonly pets = new Map<Walker, Pet>();
  private readonly order: Pet[] = [];

  constructor(scene: THREE.Object3D, fx: FarmFx | null = null) {
    this.scene = scene;
    this.fx = fx;
  }

  /** Радость питомца у хозяина, ближайшего к точке (сбор грядки, уровень): r — радиус поиска */
  cheerNear(x: number, z: number, r = 6): void {
    let best: Walker | null = null;
    let bestD = r;
    for (const w of WALKERS.get(this.scene)?.values() ?? []) {
      const d = Math.hypot(w.x - x, w.z - z);
      if (d < bestD) { best = w; bestD = d; }
    }
    if (best) best.happy++;
  }

  private make(kind: string): Pet {
    return { kind, actor: null, full: null, lod: null, x: 0, y: 0, z: 0, yaw: 0, trail: [], still: 0, happySeen: 0, side: Math.random() < 0.5 ? -1 : 1, placed: false, shown: false };
  }

  private build(p: Pet): void {
    const m = petModel(p.kind);
    if (!m || p.actor) return;
    const a = new Actor(m);
    p.actor = a;
    p.full = part(a.root, `pet-${p.kind}`);
    p.lod = part(a.root, `pet-${p.kind}_lod1`);
    a.loop('idle');
    a.mixer.update(Math.random() * 2);
    a.root.visible = false;
    this.scene.add(a.root);
  }

  private drop(p: Pet): void {
    if (p.actor) {
      p.actor.root.removeFromParent();
      p.actor.mixer.stopAllAction();
    }
    p.actor = null;
  }

  private poof(p: Pet): void {
    this.fx?.burst({ x: p.x, y: p.y + 0.15, z: p.z, n: 12, color: 0xf6f1e4, spread: 0.7, up: 0.6, life: 0.6, size: 0.22, gravity: 0.4 });
  }

  update(dt: number, cam: THREE.Vector3): void {
    const now = performance.now();
    const list = WALKERS.get(this.scene);
    // хозяева: кто ещё здесь и с питомцем
    const live = new Set<Walker>();
    if (list) {
      for (const [key, w] of list) {
        if (now - w.at > STALE_MS * 4) list.delete(key);
        else if (now - w.at < STALE_MS && WALK_PETS.has(w.pet)) live.add(w);
      }
    }
    for (const [w, p] of this.pets) {
      if (live.has(w) && w.pet === p.kind) continue;
      this.drop(p);
      this.pets.delete(w);
    }
    for (const w of live) if (!this.pets.has(w)) this.pets.set(w, this.make(w.pet));
    // 12 ближних к камере
    this.order.length = 0;
    for (const [w, p] of this.pets) {
      this.step(p, w, dt);
      if (p.actor || petModel(p.kind)) this.order.push(p);
    }
    this.order.sort((a, b) => Math.hypot(a.x - cam.x, a.z - cam.z) - Math.hypot(b.x - cam.x, b.z - cam.z));
    for (let i = 0; i < this.order.length; i++) {
      const p = this.order[i];
      const d = Math.hypot(p.x - cam.x, p.z - cam.z);
      const show = i < SHOW && d < HIDE_R && p.shown;
      if (show && !p.actor) this.build(p);
      if (!p.actor) continue;
      p.actor.root.visible = show;
      if (!show) continue;
      const far = d > LOD_R;
      if (p.full && p.lod) {
        p.full.visible = !far;
        p.lod.visible = far;
      }
      p.actor.root.position.set(p.x, p.y, p.z);
      p.actor.root.rotation.y = p.yaw;
      p.actor.update(dt);
    }
  }

  /** Следовать за хозяином: по следу, сбоку, бегом на рывке; стоит — сесть; эмоция — радость */
  private step(p: Pet, w: Walker, dt: number): void {
    const owner = new THREE.Vector3(w.x, w.y, w.z);
    const away = isRiding(w.act) || isAboard(w.act) || isFerry(w.act);
    p.shown = !away;
    if (away) {
      p.placed = false;
      return;
    }
    const tr = p.trail;
    const last = tr[tr.length - 1];
    const moved = !last || last.distanceTo(owner) > 0.25;
    if (moved) {
      tr.push(owner);
      if (tr.length > 40) tr.shift();
      p.still = 0;
    } else p.still += dt;
    // первый раз, далеко или после поездки — «пуф» рядом с хозяином
    const fwdX = -Math.sin(w.yaw);
    const fwdZ = -Math.cos(w.yaw);
    if (!p.placed || Math.hypot(p.x - w.x, p.z - w.z) > POOF_R || Math.abs(p.y - w.y) > 4) {
      if (p.placed) this.poof(p);
      p.x = w.x - fwdX * BEHIND + fwdZ * SIDE * p.side;
      p.z = w.z - fwdZ * BEHIND - fwdX * SIDE * p.side;
      p.y = w.y;
      p.yaw = w.yaw;
      p.placed = true;
      tr.length = 0;
      tr.push(owner);
      this.poof(p);
    }
    // цель: точка следа на BEHIND пути позади, со сдвигом вбок; стоит долго — в сторону и сесть
    let tx = w.x;
    let tz = w.z;
    let acc = 0;
    for (let i = tr.length - 1; i > 0; i--) {
      const a = tr[i];
      const b = tr[i - 1];
      const seg = a.distanceTo(b);
      if (acc + seg >= BEHIND) {
        const k = (BEHIND - acc) / seg;
        tx = a.x + (b.x - a.x) * k;
        tz = a.z + (b.z - a.z) * k;
        acc = BEHIND;
        break;
      }
      acc += seg;
      tx = b.x;
      tz = b.z;
    }
    if (acc < BEHIND) {
      tx = w.x - fwdX * BEHIND;
      tz = w.z - fwdZ * BEHIND;
    }
    const sitting = p.still > SIT_AFTER;
    const side = sitting ? 1.3 : SIDE;
    tx += fwdZ * side * p.side;
    tz += -fwdX * side * p.side;
    const dx = tx - p.x;
    const dz = tz - p.z;
    const dist = Math.hypot(dx, dz);
    const run = dist > 2.6;
    const speed = Math.min(dist * 2.4, run ? 7.5 : 2.8);
    if (dist > 0.12) {
      const s = Math.min(dist, speed * dt);
      p.x += (dx / dist) * s;
      p.z += (dz / dist) * s;
      const want = Math.atan2(-dx, -dz);
      let d = want - p.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      p.yaw += d * Math.min(1, dt * 10);
    } else if (sitting) {
      // сидит лицом к хозяину
      const want = Math.atan2(-(w.x - p.x), -(w.z - p.z));
      let d = want - p.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      p.yaw += d * Math.min(1, dt * 4);
    }
    p.y += (w.y - p.y) * Math.min(1, dt * 8);
    const a = p.actor;
    if (!a) return;
    if (w.happy !== p.happySeen) {
      p.happySeen = w.happy;
      if (p.kind === 'firefly') p.yaw = Math.atan2(-(w.x - p.x), -(w.z - p.z));
      a.play('happy');
      return;
    }
    if (dist > 0.12) a.loop(run ? (a.has('run') ? 'run' : a.has('fly') ? 'fly' : 'follow') : 'follow');
    else a.loop(sitting ? 'sit' : 'idle');
  }
}

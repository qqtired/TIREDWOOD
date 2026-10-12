// Жители фермы (design-v11 §16.4): Семечкин у лотка и Дядюшка Гриб в киоске. Стоят с клипом idle, здороваются, когда
// подходишь (greet), разговаривают, пока открыто их окно (talk / weigh), радуются посадке (happy), Гриб взвешивает
// и платит при продаже (weigh → pay), смеётся на крупной сделке (laugh). Поворачиваются к игроку, если он рядом.
import * as THREE from 'three';
import { FARM_LAYOUT } from '../../../shared/farmlayout.ts';
import { lerpAngle } from '../../../shared/math.ts';
import { Actor, type FarmModel } from '../models.ts';

export type NpcId = 'semechkin' | 'grib';
export type NpcCue = 'greet' | 'talk' | 'happy' | 'sold' | 'bigsale' | 'point';

/** Подошёл ближе — поздоровается (не чаще раза в 20 с) */
const GREET_R = 5;
const GREET_AGAIN = 20;
/** Поворачивается к игроку не дальше этого */
const LOOK_R = 7;
/** Насколько может отвернуться от прилавка, рад */
const LOOK_MAX = 0.7;

interface Npc {
  id: NpcId;
  actor: Actor;
  x: number;
  z: number;
  yaw: number;
  near: boolean;
  greetAt: number;
  look: number;
  /** Окно открыто: разговор по кругу */
  talking: boolean;
}

export class FarmNpcs {
  private readonly list: Npc[] = [];
  private time = 0;

  constructor(scene: THREE.Scene, models: Map<string, FarmModel>) {
    for (const [id, name] of [['semechkin', 'npc-semechkin'], ['grib', 'npc-grib']] as const) {
      const m = models.get(name);
      const o = FARM_LAYOUT.objects.find((x) => x.id === id) as { npc?: { x: number; z: number; yaw: number } } | undefined;
      if (!m || !o?.npc || !m.gltf.animations.length) continue;
      const actor = new Actor(m, true);
      actor.root.position.set(o.npc.x, 0, o.npc.z);
      actor.root.rotation.y = o.npc.yaw;
      actor.root.traverse((x) => { x.castShadow = (x as THREE.Mesh).isMesh; });
      scene.add(actor.root);
      actor.loop('idle');
      // разные фазы — не синхронно
      actor.mixer.update(Math.random() * 3);
      this.list.push({ id, actor, x: o.npc.x, z: o.npc.z, yaw: o.npc.yaw, near: false, greetAt: -99, look: 0, talking: false });
    }
  }

  private get(id: NpcId): Npc | undefined {
    return this.list.find((n) => n.id === id);
  }

  /** Событие: поздороваться, говорить, радоваться, продажа */
  cue(id: NpcId, what: NpcCue): void {
    const n = this.get(id);
    if (!n) return;
    const a = n.actor;
    switch (what) {
      case 'greet': a.play('greet'); n.greetAt = this.time; break;
      case 'talk': a.play(a.has('talk') ? 'talk' : 'weigh'); break;
      case 'happy': a.play(a.has('happy') ? 'happy' : 'laugh'); break;
      case 'point': a.play('point'); break;
      case 'sold': if (!a.play('pay')) a.play('happy'); break;
      case 'bigsale': a.play('laugh'); break;
    }
  }

  /** Окно жителя открыто или закрыто: пока открыто — разговаривает */
  setTalking(id: NpcId, on: boolean): void {
    const n = this.get(id);
    if (!n || n.talking === on) return;
    n.talking = on;
    if (on) this.cue(id, 'talk');
  }

  /** px, pz — своя желейка (null — нет в мире) */
  update(dt: number, px: number | null, pz: number | null): void {
    this.time += dt;
    for (const n of this.list) {
      let want = 0;
      if (px !== null && pz !== null) {
        const dx = px - n.x;
        const dz = pz - n.z;
        const d = Math.hypot(dx, dz);
        const near = d < GREET_R;
        if (near && !n.near && this.time - n.greetAt > GREET_AGAIN) this.cue(n.id, 'greet');
        n.near = near;
        if (d < LOOK_R) {
          // лицо желейки — в −Z: угол на игрока относительно прилавка
          const face = Math.atan2(-dx, -dz);
          let rel = face - n.yaw;
          rel = Math.atan2(Math.sin(rel), Math.cos(rel));
          want = THREE.MathUtils.clamp(rel, -LOOK_MAX, LOOK_MAX);
        }
      }
      n.look = lerpAngle(n.look, want, Math.min(1, dt * 3));
      n.actor.root.rotation.y = n.yaw + n.look;
      // окно открыто: снова говорит, когда клип закончился
      if (n.talking && n.actor.playing === 'idle') this.cue(n.id, 'talk');
      n.actor.update(dt);
    }
  }
}

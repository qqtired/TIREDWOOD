// Т-23 «Слабые места тяжёлых»: подсветка только в прицеле. Каждый кадр луч из центра экрана против слабых мест видимых
// мобов в 70 м (shared/fortweak.ts, рост — ELITE_SCALE при elite в fideas); навёл — прицел меняется (класс is-weak) и на месте
// вспыхивает тёплое свечение (один спрайт, сложением, без ламп). Попал (['weak', zid, pid] со своим pid) — жёлтое «×2,5»
// и тихое «дзынь». Что считается слабым местом при выстреле, решает сервер.
import * as THREE from 'three';
import { ZF_TIER } from '../../../shared/fortnet.ts';
import { WEAK_MUL, WEAK_SPOTS } from '../../../shared/fortweak.ts';
import { makeRayHit } from '../../../shared/world.ts';
import { softDot } from '../../render/textures.ts';
import type { IdeasDeps } from './deps.ts';
import { aimWeak, mobScale, type WeakAim } from './logic.ts';

/** Дальше этого слабые места не ищем, м */
const RANGE = 70;
const _dir = new THREE.Vector3();
const _hit = makeRayHit();

export class WeakPart {
  private readonly d: IdeasDeps;
  private readonly glow: THREE.Sprite;
  private readonly aim: WeakAim = { t: 0, x: 0, y: 0, z: 0, r: 0 };
  private readonly best: WeakAim = { t: 0, x: 0, y: 0, z: 0, r: 0 };
  /** Где слабое место моба было в последний кадр — чтобы надпись попадания встала на него */
  private readonly seen = new Map<number, [number, number, number]>();
  private elite = false;
  private on = false;
  private found = false;
  private time = 0;
  private ox = 0;
  private oy = 0;
  private oz = 0;
  private dx = 0;
  private dy = 0;
  private dz = 0;

  /** Один обход видимых мобов за кадр, без выделений */
  private readonly visit = (kind: number, x: number, y: number, z: number, yaw: number, flags: number, id: number): void => {
    if (!WEAK_SPOTS[kind]) return;
    const sc = mobScale(this.elite, flags & ZF_TIER);
    let c = this.seen.get(id);
    if (!c) this.seen.set(id, (c = [x, y + 1.5 * sc, z]));
    const a = this.aim;
    if (!aimWeak(kind, x, y, z, yaw, sc, this.ox, this.oy, this.oz, this.dx, this.dy, this.dz, RANGE, a)) {
      c[0] = x;
      c[1] = y + 1.5 * sc;
      c[2] = z;
      return;
    }
    c[0] = a.x;
    c[1] = a.y;
    c[2] = a.z;
    const best = this.best;
    if (a.t < best.t) {
      best.t = a.t;
      best.x = a.x;
      best.y = a.y;
      best.z = a.z;
      best.r = a.r;
      this.found = true;
    }
  };

  constructor(d: IdeasDeps) {
    this.d = d;
    const mat = new THREE.SpriteMaterial({
      map: softDot('rgba(255,222,140,0.95)', 'rgba(255,150,50,0)'), transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0,
    });
    this.glow = new THREE.Sprite(mat);
    this.glow.visible = false;
    this.glow.renderOrder = 20;
    this.glow.frustumCulled = false;
    d.scene.add(this.glow);
  }

  setElite(on: boolean): void {
    this.elite = on;
  }

  frame(dt: number): void {
    this.time += dt;
    const cam = this.d.camera;
    cam.getWorldDirection(_dir);
    this.ox = cam.position.x;
    this.oy = cam.position.y;
    this.oz = cam.position.z;
    this.dx = _dir.x;
    this.dy = _dir.y;
    this.dz = _dir.z;
    this.found = false;
    const best = this.best;
    best.t = RANGE + 1;
    this.d.zombies.scan(this.visit);
    let found = this.found && this.d.alive();
    // стена на пути луча закрывает слабое место
    if (found && this.d.collision.raycast(this.ox, this.oy, this.oz, this.dx, this.dy, this.dz, best.t, _hit, true) && _hit.t < best.t - 0.05) found = false;
    this.set(found);
    if (found) {
      this.glow.position.set(best.x, best.y, best.z);
      const s = Math.max(0.5, best.r * 4.2) * (0.94 + 0.1 * Math.sin(this.time * 9));
      this.glow.scale.set(s, s, 1);
      this.glow.material.opacity = 0.62 + 0.14 * Math.sin(this.time * 9);
    }
    if (this.seen.size > 80) this.seen.clear();
  }

  private set(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    this.glow.visible = on;
    this.d.hud.ui.cross.root.classList.toggle('is-weak', on);
  }

  /** ['weak', zid, pid] — попадание в слабое место. true — наше */
  onEvent(e: readonly unknown[]): boolean {
    if (e[0] !== 'weak') return false;
    const zid = e[1] as number;
    const pid = e[2] as number;
    const c = this.seen.get(zid);
    if (pid === this.d.myId()) {
      if (c) this.d.hud.floaters.note(c[0], c[1] + 0.35, c[2], `×${String(WEAK_MUL).replace('.', ',')}`);
      this.d.sound.weakPing();
    } else if (c) {
      // чужое попадание: искорки на месте, без звука и надписей
      this.d.effects.burst(c[0], c[1], c[2], 0xffd35a, 6, 3, 0, 1, 0, 0.03);
    }
    return true;
  }

  dispose(): void {
    this.set(false);
    this.glow.removeFromParent();
    this.glow.material.map?.dispose();
    this.glow.material.dispose();
    this.seen.clear();
  }
}

// Мяч на площади — как его видно и слышно: пляжный, в цветных дольках; катится — крутится по ходу, на ударе
// пружинисто приплющивается, под ним мягкая тень, в воде покачивается, после возвращения домой «выпрыгивает».
// Пинок — «пумф» и облачко пыли, стук — «пок», батут прогибается, в воде — плюх. Где мяч и когда что
// случилось — считает BallPredictor (ballsim.ts); сюда он приходит из снимков и своих тиков.
import * as THREE from 'three';
import { BALL_BYTES, BALL_R } from '../../shared/ball.ts';
import type { EntitySnap, SnapshotHeader } from '../../shared/protocol.ts';
import type { PlayerState } from '../../shared/sim.ts';
import type { Sound } from '../audio.ts';
import type { Effects } from '../render/effects.ts';
import { beachBallTexture, softDot } from '../render/textures.ts';
import { BallPredictor, EV_APPEAR, EV_BOUNCE, EV_KICK, EV_SPLASH, EV_TRAMP, type BallEvent, type InputHistory } from './ballsim.ts';
import type { LobbyWorld } from './world.ts';

/** Тень видна, пока мяч не выше стольких метров над опорой */
const SHADOW_H = 6;
/** Появление дома: за столько секунд — из точки в мяч, с «перелётом» */
const POP_S = 0.35;

const _axis = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class LobbyBall {
  readonly sim: BallPredictor;
  /** Где мяч на экране */
  readonly pos = new THREE.Vector3();
  private readonly world: LobbyWorld;
  private readonly effects: Effects;
  private readonly sound: Sound;
  private readonly root = new THREE.Group();
  /** Сплющивание — от нижней точки мяча */
  private readonly squash = new THREE.Group();
  private readonly mesh: THREE.Mesh;
  private readonly shadow: THREE.Mesh;
  private readonly shadowMat: THREE.MeshBasicMaterial;
  /** Угловая скорость вращения, рад/с (вектор — ось) */
  private readonly spin = new THREE.Vector3();
  private sqAmp = 0;
  private sqT = 1;
  private pop = 1;
  private time = 0;

  constructor(world: LobbyWorld, effects: Effects, sound: Sound) {
    this.world = world;
    this.effects = effects;
    this.sound = sound;
    this.sim = new BallPredictor(world.collision);
    const mat = new THREE.MeshStandardMaterial({ map: beachBallTexture(), roughness: 0.3, metalness: 0 });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 32, 20), mat);
    this.mesh.position.y = BALL_R;
    // дольки — не строго «на боку»: так сразу видно, что мяч крутится
    this.mesh.rotation.set(0.5, 0.3, 0.2);
    this.squash.position.y = -BALL_R;
    this.squash.add(this.mesh);
    this.root.add(this.squash);
    this.shadowMat = new THREE.MeshBasicMaterial({
      map: softDot('rgba(20,16,30,0.6)'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4,
    });
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(BALL_R * 2.6, BALL_R * 2.6).rotateX(-Math.PI / 2), this.shadowMat);
    world.scene.add(this.root, this.shadow);
    this.reset();
  }

  /** Вход и выход с набережной: мяч лежит дома, ждём сервер. */
  reset(): void {
    this.sim.reset();
    this.spin.set(0, 0, 0);
    this.sqAmp = 0;
    this.pop = 1;
    this.draw(0);
  }

  /** Снимок набережной: чужие желейки — телами, мяч сервера — пересчитать до «сейчас» (после сверки своей желейки). */
  onSnapshot(buf: ArrayBuffer, h: SnapshotHeader, ents: readonly EntitySnap[], n: number, myId: number, hist: InputHistory): void {
    if (buf.byteLength < h.tail + BALL_BYTES) return;
    this.sim.setBodies(ents, n, myId);
    this.sim.rebase(new DataView(buf), h.tail, h.ack, hist);
  }

  /** Свой тик (желейка уже шагнула). */
  tick(seq: number, me: PlayerState, hold: number): void {
    this.sim.tick(seq, me, hold);
  }

  /**
   * Кадр: alpha — доля до следующего тика (как у своей желейки), (meX, meZ) — своя желейка,
   * remote — номер своего входа, во времени которого видны чужие желейки (null — ещё не знаем).
   */
  update(dt: number, alpha: number, meX: number, meZ: number, remote: number | null): void {
    this.time += dt;
    this.sim.frame(dt, alpha, meX, meZ, remote);
    const sh = this.sim.show;
    this.pos.set(sh.x, sh.y, sh.z);
    for (const e of this.sim.fired) this.onEvent(e);
    // качение: по земле крутится без проскальзывания, в воздухе — как крутился, в воде — затихает
    if (sh.grounded && !sh.wet) this.spin.set(sh.vz / BALL_R, 0, -sh.vx / BALL_R);
    else this.spin.multiplyScalar(Math.exp(-dt * (sh.wet ? 1.5 : 0.3)));
    const w = this.spin.length();
    if (w > 1e-3) {
      _q.setFromAxisAngle(_axis.copy(this.spin).divideScalar(w), w * dt);
      this.mesh.quaternion.premultiply(_q);
    }
    this.draw(dt);
  }

  debug(): Record<string, unknown> {
    const b = this.sim.ball;
    const r = (v: number) => Math.round(v * 100) / 100;
    return {
      x: r(b.x), y: r(b.y), z: r(b.z), vx: r(b.vx), vy: r(b.vy), vz: r(b.vz), kicks: b.kicks, bounces: b.bounces, wet: b.wet, still: b.still,
      known: this.sim.known, corrections: this.sim.corrections, tau: r(this.sim.tau), shown: this.root.visible,
      screen: [r(this.pos.x), r(this.pos.y), r(this.pos.z)],
    };
  }

  private onEvent(e: BallEvent): void {
    const p = this.pos;
    const at: [number, number, number] = [p.x, p.y, p.z];
    if (e.kind === EV_KICK) {
      this.sound.ballKick(at, e.speed);
      this.hit(0.24);
      this.effects.puff(p.x, p.y - BALL_R * 0.5, p.z, 0.45, 0xf3ece2, 0.45, 0.5, 0.45);
    } else if (e.kind === EV_TRAMP) {
      this.sound.trampoline(at);
      this.world.bounceTrampoline(p.x, p.z, 0.7);
      this.hit(0.2);
    } else if (e.kind === EV_BOUNCE) {
      this.sound.ballBounce(at, e.speed);
      this.hit(Math.min(0.2, 0.05 + e.speed * 0.02));
    } else if (e.kind === EV_SPLASH) {
      this.effects.waterSplash(p.x, p.z, false);
      this.sound.splash(at);
    } else if (e.kind === EV_APPEAR) {
      this.pop = 0;
      this.sound.pop(at);
    }
  }

  private hit(amp: number): void {
    // ещё дрожит от прошлого удара — не сбиваем в слабый
    if (this.sqT < 0.12 && this.sqAmp > amp) return;
    this.sqAmp = amp;
    this.sqT = 0;
  }

  /** Мяч, сплющивание, «выпрыгивание» и тень — по показу. */
  private draw(dt: number): void {
    const sh = this.sim.show;
    this.pos.set(sh.x, sh.y, sh.z);
    this.root.visible = sh.shown;
    this.root.position.copy(this.pos);
    if (sh.wet) this.root.position.y += Math.sin(this.time * 2.6) * 0.05;
    this.sqT += dt;
    const s = this.sqAmp * Math.exp(-this.sqT * 9) * Math.cos(this.sqT * 28);
    if (this.pop < 1) this.pop = Math.min(1, this.pop + dt / POP_S);
    const k = this.pop < 1 ? easeOutBack(this.pop) : 1;
    this.squash.scale.set((1 + s * 0.5) * k, (1 - s) * k, (1 + s * 0.5) * k);
    // тень на ближайшей опоре
    const ground = sh.shown && !sh.wet ? this.world.collision.groundBelow(sh.x, sh.y, sh.z) : -1000;
    const h = sh.y - BALL_R - ground;
    if (ground > -100 && h < SHADOW_H) {
      const f = 1 - Math.max(0, h) / SHADOW_H;
      this.shadow.visible = true;
      this.shadow.position.set(sh.x, ground + 0.02, sh.z);
      this.shadow.scale.setScalar((0.55 + 0.45 * f) * k);
      this.shadowMat.opacity = 0.25 + 0.75 * f;
    } else {
      this.shadow.visible = false;
    }
  }
}

function easeOutBack(t: number): number {
  const c = 1.9;
  const u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
}

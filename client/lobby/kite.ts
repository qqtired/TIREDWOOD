// Воздушные змеи всех игроков: один набор инстансов и одна общая линия. Управляет обычный взгляд; WASD остаётся ходьбой.
import * as THREE from 'three';
import { ACT_KITE, KITE_REEL_FIRST, kiteAmount, kiteOffset } from '../../shared/kite.ts';
import { LOBBY_CAPACITY } from '../../shared/lobby.ts';
import { damp, lerpAngle } from '../../shared/math.ts';
import type { Avatar, AvatarPose } from '../render/avatar.ts';
import { bowGeometry, kiteGeometry, spoolGeometry } from './kitemodel.ts';

const THREAD_SEGMENTS = 28;
const TAIL_SEGMENTS = 16;
const BOWS = 5;
const LINE_VERTICES = (THREAD_SEGMENTS + TAIL_SEGMENTS) * 2;

interface Flyer {
  avatar: Avatar;
  slot: number;
  hands: number[];
  yaw: number;
  pitch: number;
  amount: number;
  seen: boolean;
  ready: boolean;
  gripError: number;
  end: THREE.Vector3;
}

export class KiteFlyers {
  private readonly flyers = new Map<Avatar, Flyer>();
  private readonly material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.83, side: THREE.DoubleSide });
  private readonly bodies = new THREE.InstancedMesh(kiteGeometry(), this.material, LOBBY_CAPACITY);
  private readonly spools = new THREE.InstancedMesh(spoolGeometry(), this.material, LOBBY_CAPACITY);
  private readonly bows = new THREE.InstancedMesh(bowGeometry(), this.material, LOBBY_CAPACITY * BOWS);
  private readonly lineArray = new Float32Array(LOBBY_CAPACITY * LINE_VERTICES * 3);
  private readonly lines: THREE.LineSegments;
  private readonly lineGeo = new THREE.BufferGeometry();
  private readonly dummy = new THREE.Object3D();
  private readonly spool = new THREE.Object3D();
  private readonly offset = new THREE.Vector3();
  private readonly start = new THREE.Vector3();
  private readonly knot = new THREE.Vector3();
  private readonly left = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly tailRoot = new THREE.Vector3();
  private readonly tailA = new THREE.Vector3();
  private readonly tailB = new THREE.Vector3();
  private count = 0;
  private drawn = 0;

  constructor(scene: THREE.Scene) {
    this.lineGeo.setAttribute('position', new THREE.BufferAttribute(this.lineArray, 3).setUsage(THREE.DynamicDrawUsage));
    this.lines = new THREE.LineSegments(this.lineGeo, new THREE.LineBasicMaterial({ color: 0x8f7655 }));
    for (const mesh of [this.bodies, this.spools, this.bows]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
    }
    this.lines.frustumCulled = false;
    const color = new THREE.Color();
    for (let i = 0; i < LOBBY_CAPACITY * BOWS; i++) this.bows.setColorAt(i, color.set(i % 2 ? 0xe88f7e : 0xffffff));
    this.lineGeo.setDrawRange(0, 0);
    scene.add(this.bodies, this.spools, this.bows, this.lines);
  }

  begin(): void {
    this.count = 0;
    for (const f of this.flyers.values()) f.seen = false;
  }

  /** До Avatar.update: занимаем руки только своей позой; рыба и удочка держат свои массивы. */
  prepare(avatar: Avatar, slot = avatar.id): void {
    let f = this.flyers.get(avatar);
    if (avatar.action !== ACT_KITE) {
      if (f) this.drop(f);
      return;
    }
    if (!f) {
      f = { avatar, slot, hands: [-0.23, 0.86, -0.62, 0.23, 0.86, -0.62], yaw: 0, pitch: 0, amount: 0, ready: false, seen: true, gripError: 0, end: new THREE.Vector3() };
      this.flyers.set(avatar, f);
    }
    f.seen = true;
    avatar.hands = f.hands;
  }

  /** После Avatar.update: катушка и две варежки используют один реальный world transform. */
  draw(avatar: Avatar, pose: AvatarPose | null, dt: number, time: number): void {
    const f = this.flyers.get(avatar);
    if (!f || !pose || !avatar.inWorld || this.count >= LOBBY_CAPACITY) return;
    if (!f.ready) { f.yaw = pose.yaw; f.pitch = pose.pitch; f.amount = kiteAmount(avatar.arg); f.ready = true; }
    const k = 1 - Math.exp(-dt * 2.7);
    f.yaw = lerpAngle(f.yaw, pose.yaw, k);
    f.pitch = damp(f.pitch, pose.pitch, 2.7, dt);
    f.amount = damp(f.amount, kiteAmount(avatar.arg), 14, dt);
    const release = f.amount * f.amount * (3 - 2 * f.amount);
    const phase = time * 3.3 + f.slot * 1.71;
    const wind = Math.sin(phase) * 0.012 * release;
    avatar.held.updateWorldMatrix(true, false);
    this.spool.position.set(0, 0.86 + wind, -0.62);
    this.spool.rotation.set(0, 0, Math.sin(phase * 0.7) * 0.06 * release);
    this.spool.updateMatrix();
    this.spool.matrixWorld.multiplyMatrices(avatar.held.matrixWorld, this.spool.matrix);
    this.left.set(-0.23, 0, 0).applyMatrix4(this.spool.matrixWorld);
    this.right.set(0.23, 0, 0).applyMatrix4(this.spool.matrixWorld);
    f.gripError = avatar.gripWorld(this.left, this.right);
    this.start.set(0, 0.09, 0).applyMatrix4(this.spool.matrixWorld);
    this.spools.setMatrixAt(this.count, this.spool.matrixWorld);
    kiteOffset(f.yaw, f.pitch, time, f.slot, this.offset);
    f.end.copy(this.start).addScaledVector(this.offset, release);
    f.end.x += Math.cos(f.yaw) * 0.65 * (1 - release);
    f.end.y += 0.55 * (1 - release);
    this.dummy.position.copy(f.end);
    this.dummy.rotation.set(-0.15 + Math.sin(phase * 1.8) * 0.055, f.yaw, Math.sin(phase * 0.73) * 0.12);
    this.dummy.scale.setScalar(0.4 + 0.6 * release);
    this.dummy.updateMatrix();
    this.bodies.setMatrixAt(this.count, this.dummy.matrix);
    this.knot.set(0, 0.1, 0.095).applyMatrix4(this.dummy.matrix);
    this.tailRoot.set(0, -0.89, 0).applyMatrix4(this.dummy.matrix);
    const base = this.count * LINE_VERTICES * 3;
    const sag = (0.17 + (1 - release) * 0.5) * release;
    for (let i = 0; i < THREAD_SEGMENTS; i++) {
      for (let side = 0; side < 2; side++) {
        const u = (i + side) / THREAD_SEGMENTS;
        const at = base + (i * 2 + side) * 3;
        this.lineArray[at] = this.start.x + (this.knot.x - this.start.x) * u + Math.sin(u * Math.PI) * Math.sin(phase - u * 4) * 0.045 * release;
        this.lineArray[at + 1] = this.start.y + (this.knot.y - this.start.y) * u - Math.sin(u * Math.PI) * sag;
        this.lineArray[at + 2] = this.start.z + (this.knot.z - this.start.z) * u;
      }
    }
    for (let i = 0; i < TAIL_SEGMENTS; i++) {
      this.tailPoint(this.tailA, i / TAIL_SEGMENTS, f.yaw, phase, release);
      this.tailPoint(this.tailB, (i + 1) / TAIL_SEGMENTS, f.yaw, phase, release);
      this.tailA.toArray(this.lineArray, base + (THREAD_SEGMENTS * 2 + i * 2) * 3);
      this.tailB.toArray(this.lineArray, base + (THREAD_SEGMENTS * 2 + i * 2 + 1) * 3);
    }
    for (let i = 0; i < BOWS; i++) {
      const u = (i + 1) / BOWS;
      this.tailPoint(this.dummy.position, u, f.yaw, phase, release);
      this.dummy.rotation.set(0.15 * Math.sin(phase * 1.8 - u * 6), f.yaw, Math.sin(phase * 1.6 - u * 5) * 0.36);
      this.dummy.scale.setScalar(0.35 + 0.65 * release);
      this.dummy.updateMatrix();
      this.bows.setMatrixAt(this.count * BOWS + i, this.dummy.matrix);
    }
    this.count++;
  }

  private tailPoint(out: THREE.Vector3, u: number, yaw: number, phase: number, release: number): void {
    const sideways = Math.sin(phase * 1.6 - u * 5) * 0.25 * u * release;
    const trail = u * (0.4 + release * 0.7);
    out.set(this.tailRoot.x + Math.cos(yaw) * sideways + Math.sin(yaw) * trail,
      this.tailRoot.y - u * (0.35 + release * 1.35),
      this.tailRoot.z - Math.sin(yaw) * sideways + Math.cos(yaw) * trail);
  }

  end(): void {
    for (const f of this.flyers.values()) if (!f.seen) this.drop(f);
    this.bodies.count = this.spools.count = this.count;
    this.bows.count = this.count * BOWS;
    if (this.count || this.drawn) {
      for (const mesh of [this.bodies, this.spools, this.bows]) mesh.instanceMatrix.needsUpdate = true;
      this.lineGeo.attributes.position.needsUpdate = true;
    }
    this.lineGeo.setDrawRange(0, this.count * LINE_VERTICES);
    this.drawn = this.count;
  }

  private drop(f: Flyer): void {
    if (f.avatar.hands === f.hands) f.avatar.hands = null;
    this.flyers.delete(f.avatar);
  }

  reset(): void {
    for (const f of this.flyers.values()) this.drop(f);
    this.count = 0;
    this.end();
  }

  debug(): object {
    return { count: this.count, drawCalls: this.count ? 4 : 0, flyers: [...this.flyers.values()].map(f => ({ id: f.slot, amount: f.amount, reeling: f.avatar.arg >= KITE_REEL_FIRST, end: f.end.toArray(), gripError: f.gripError })) };
  }
}

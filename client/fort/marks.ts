// Метки событий «Крепости» на земле: красные круги метеоров (заполняются к удару, видны сквозь стены — как метки
// атак врагов) и маяк ящика припасов (жёлтое кольцо и столб света — видно издалека, в том числе из-за стены).
// Пока нет эффектов помощника fort-fx (eventfx.ts, EventFxApi ниже), здесь же простой ящик с парашютом.
import * as THREE from 'three';
import { TICK_RATE } from '../../shared/constants.ts';
import { CRATE_DOWN, CRATE_FALL, CRATE_NONE, SUPPLY_FALL_TICKS } from '../../shared/fortwaves.ts';

/**
 * Эффекты событий (помощник fort-fx: client/fort/eventfx.ts, класс EventFx(scene, camera, collision?)). Подключаются
 * в FortScene при слиянии; FortMatch зовёт их из событий волны. Метки и маяк — здесь, не у них.
 */
export interface EventFxApi {
  meteor(fx: number, fy: number, fz: number, tx: number, ty: number, tz: number, seconds: number): void;
  meteorHit(x: number, y: number, z: number, r?: number): void;
  /** 1 — начал падать (сядет через 7 с), 2 — лежит, 0 — пропал */
  crate(state: number, x: number, z: number, y?: number): void;
  cratePicked(x: number, y: number, z: number): void;
  fog(on: boolean): void;
  goldRush(on: boolean): void;
  coins(x: number, y: number, z: number, big?: boolean): void;
  update(dt: number): void;
  clear(): void;
}

const RED = 0xff5a3c;
const GOLD = 0xffd04a;
const MAX_RINGS = 8;
/** С какой высоты падает ящик (над точкой посадки) */
const DROP_H = 42;

interface Ring {
  x: number;
  y: number;
  z: number;
  r: number;
  /** Тик удара и сколько тиков метка видна до него */
  end: number;
  total: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

export class EventMarks {
  private readonly ring: THREE.InstancedMesh;
  private readonly fill: THREE.InstancedMesh;
  private readonly rings: Ring[] = [];
  private readonly beacon: THREE.Group;
  private readonly beaconRing: THREE.Mesh;
  private readonly beam: THREE.Mesh;
  private readonly box: THREE.Group;
  private readonly chute: THREE.Mesh;
  /** Ящик: состояние (CRATE_*), где; когда начал падать (с), а не тик — сервер прислал только «падает» */
  crateState = CRATE_NONE;
  crateX = 0;
  crateY = 0;
  crateZ = 0;
  private fallAt = 0;
  private time = 0;
  /** Простой ящик с парашютом — пока нет эффектов fort-fx */
  placeholder = true;

  constructor(scene: THREE.Scene) {
    const flat = (g: THREE.BufferGeometry) => g.rotateX(-Math.PI / 2);
    const mat = (opacity: number) => new THREE.MeshBasicMaterial({ transparent: true, opacity, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
    this.ring = new THREE.InstancedMesh(flat(new THREE.RingGeometry(0.9, 1, 48)), mat(0.9), MAX_RINGS);
    this.fill = new THREE.InstancedMesh(flat(new THREE.CircleGeometry(1, 40)), mat(0.2), MAX_RINGS);
    for (const m of [this.ring, this.fill]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.count = 0;
      m.frustumCulled = false;
      m.setColorAt(0, _c.set(RED));
      scene.add(m);
    }
    this.ring.renderOrder = 5;
    this.fill.renderOrder = 4;

    // маяк ящика: кольцо на земле и столб света
    this.beacon = new THREE.Group();
    this.beaconRing = new THREE.Mesh(flat(new THREE.RingGeometry(1.0, 1.25, 40)), new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.85, depthWrite: false, depthTest: false, side: THREE.DoubleSide }));
    this.beaconRing.renderOrder = 5;
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.32, 26, 10, 1, true).translate(0, 13, 0),
      new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.beacon.add(this.beaconRing, this.beam);
    this.beacon.visible = false;
    scene.add(this.beacon);

    // простой ящик: доски, жёлтая полоса; парашют — купол на стропах
    this.box = new THREE.Group();
    const wood = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.9).translate(0, 0.35, 0), new THREE.MeshStandardMaterial({ color: 0x9a6b42, roughness: 0.8 }));
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.16, 0.94).translate(0, 0.42, 0), new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.5, emissive: 0x4a3200 }));
    this.chute = new THREE.Mesh(new THREE.SphereGeometry(1.5, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 1).translate(0, 2.8, 0),
      new THREE.MeshStandardMaterial({ color: 0xf4efe2, roughness: 0.9, side: THREE.DoubleSide }));
    this.box.add(wood, band, this.chute);
    this.box.visible = false;
    scene.add(this.box);
  }

  /** Круг метеора: удар на тике end, метка видна total тиков */
  meteor(x: number, y: number, z: number, r: number, end: number, total: number): void {
    if (this.rings.length >= MAX_RINGS) this.rings.shift();
    this.rings.push({ x, y, z, r, end, total });
  }

  /** Ящик: CRATE_* и где (y — поверхность); падение — с этого момента */
  crate(state: number, x: number, y: number, z: number): void {
    if (state === CRATE_FALL && this.crateState !== CRATE_FALL) this.fallAt = this.time;
    this.crateState = state;
    this.crateX = x;
    this.crateY = y;
    this.crateZ = z;
  }

  clear(): void {
    this.rings.length = 0;
    this.crateState = CRATE_NONE;
    this.ring.count = this.fill.count = 0;
    this.beacon.visible = false;
    this.box.visible = false;
  }

  /** Кадр: renderTick — тик сервера, который сейчас на экране */
  update(dt: number, renderTick: number): void {
    this.time += dt;
    let n = 0;
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      if (renderTick > r.end + 3) {
        this.rings.splice(i, 1);
        continue;
      }
    }
    for (const r of this.rings) {
      const progress = Math.max(0.06, Math.min(1, 1 - (r.end - renderTick) / r.total));
      _q.identity();
      _p.set(r.x, r.y + 0.07, r.z);
      _s.set(r.r, 1, r.r);
      this.ring.setMatrixAt(n, _m.compose(_p, _q, _s));
      _s.set(r.r * progress, 1, r.r * progress);
      this.fill.setMatrixAt(n, _m.compose(_p, _q, _s));
      this.ring.setColorAt(n, _c.set(RED));
      this.fill.setColorAt(n, _c);
      n++;
    }
    this.ring.count = this.fill.count = n;
    for (const m of [this.ring, this.fill]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }

    const on = this.crateState !== CRATE_NONE;
    this.beacon.visible = on;
    this.box.visible = on && this.placeholder;
    if (!on) return;
    const pulse = 1 + 0.12 * Math.sin(this.time * 5);
    this.beacon.position.set(this.crateX, this.crateY + 0.06, this.crateZ);
    this.beaconRing.scale.set(pulse, 1, pulse);
    const fall = this.crateState === CRATE_FALL ? Math.max(0, 1 - (this.time - this.fallAt) / (SUPPLY_FALL_TICKS / TICK_RATE)) : 0;
    this.box.position.set(this.crateX, this.crateY + fall * DROP_H, this.crateZ);
    this.box.rotation.y = this.time * 0.6 * (fall > 0 ? 1 : 0);
    this.chute.visible = this.crateState === CRATE_FALL && fall > 0.02;
    // столб света тоньше, пока ящик в воздухе
    this.beam.scale.set(this.crateState === CRATE_DOWN ? 1 : 0.6, 1, this.crateState === CRATE_DOWN ? 1 : 0.6);
  }
}

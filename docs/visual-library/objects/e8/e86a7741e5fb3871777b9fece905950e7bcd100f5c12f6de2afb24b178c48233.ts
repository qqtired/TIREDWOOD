// Экипаж «Альбатроса» — живые, но без беготни: каждый занят своим делом на своём месте (твёрдые тела — в карте).
// Боцман Михалыч на баке попыхивает трубкой и раз в пару минут бьёт склянки в рынду (звук — в такт ударам). Рыбак
// Толик на краю люка чинит сеть челноком, иногда потягивается. Матрос Витёк в северном углу у кормы — без музыки, по
// кругу: стоит, курит папиросу (рука ко рту, клуб дыма), драит палубу шваброй, смотрит в море из-под ладони. Саня за
// прилавком взвешивает рыбу безменом, пересчитывает монеты, оборачивается к покупателю и машет лодке, когда она
// подходит. Вдали (дальше HIDE) экипаж не рисуется, дальше LAZY — двигается реже.
import * as THREE from 'three';
import { BARKAS, BARKAS_CREW, BARKAS_RYNDA, SANYA, SANYA_USE } from '../../../shared/barkas.ts';
import { FERRY_AWAY } from '../../../shared/ferry.ts';
import { makeFish3D } from '../fishart.ts';
import { at, crewMesh, ease, makePerson, type Person } from './people.ts';
import type { Smoke } from './smoke.ts';

/** Чем занят матрос Витёк */
export type MatrosPhase = 'stand' | 'smoke' | 'swab' | 'sea';

/** Дальше — экипажа не видно (с площади ≈130 м люди с палец — не рисуем, от хижины Семёна ≈65–70 м — видно);
 *  дальше LAZY — анимация 8 раз в секунду */
const HIDE = 75;
const LAZY = 40;
/** Склянки: раз в столько секунд; первый раз — через FIRST после загрузки */
const RING_EVERY = 120;
const RING_FIRST = 24;
/** Удары рынды от начала звона (парами, как на флоте), когда отворачивается обратно и когда всё */
const STRIKES = [0.8, 1.15, 2.0, 2.35];
const RING_BACK = 3.1;
const RING_END = 3.8;
/** Куда тянется рука боцмана: шкертик под рындой */
const LANYARD = new THREE.Vector3(BARKAS_RYNDA.x - 0.12, BARKAS_RYNDA.y - 0.45, BARKAS_RYNDA.z);

const M = BARKAS_CREW.mikhalych;
const L = BARKAS_CREW.tolik;
const V = BARKAS_CREW.vityok;
/** Круг дел матроса, с: [0, SMOKE) стоит, [SMOKE, SWAB) курит, [SWAB, SEA) драит палубу, [SEA, CYCLE) смотрит в море */
const V_CYCLE = 36;
const V_SMOKE = 6;
const V_SWAB = 15;
const V_SEA = 27;
/** Затяжки: начало от начала перекура, с, и сколько рука у рта */
const V_DRAGS = [0.6, 4.8];
const V_DRAG = 1.9;
/** Клубы изо рта после затяжки: через столько секунд */
const V_PUFFS = [0.15, 0.45];
/** Куда смотрит, когда драит (на восток, к ящикам — свой угол палубы) и когда смотрит в море (на север, на остров) */
const V_YAW_SWAB = -1.75;
const V_YAW_SEA = 0.1;
/** Швабра: черенок, где руки на черенке (м от низа) */
const MOP_LEN = 1.36;
const MOP_GRIP_R = 0.78;
const MOP_GRIP_L = 1.1;
const UP = new THREE.Vector3(0, 1, 0);

/** Курс, чтобы смотреть из (x, z) в (tx, tz) (как yaw игрока: 0 — на −Z) */
function yawTo(x: number, z: number, tx: number, tz: number): number {
  return Math.atan2(-(tx - x), -(tz - z));
}

function wrap(a: number): number {
  return a - Math.round(a / (2 * Math.PI)) * 2 * Math.PI;
}

/**
 * Повернуть руку так, чтобы кисть оказалась в точке (x, y, z) в осях туловища (плечо — arm.position, длина руки до
 * кисти ~0,38 м: дальше — тянется по направлению). Положительный rotation.x — вперёд (к −Z), z — в сторону.
 */
export function reach(arm: THREE.Group, x: number, y: number, z: number, k = 1): void {
  const dx = x - arm.position.x;
  const dy = y - arm.position.y;
  const dz = z - arm.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  const b = Math.asin(THREE.MathUtils.clamp(dx / len, -1, 1));
  const a = Math.atan2(-dz / len, -dy / len);
  arm.rotation.x += (a - arm.rotation.x) * k;
  arm.rotation.z += (b - arm.rotation.z) * k;
}

/** Плавно вернуть части к покою */
function rest(p: Person, dt: number, tau = 0.25): void {
  for (const o of [p.armL, p.armR, p.head, p.torso]) {
    o.rotation.x = ease(o.rotation.x, 0, dt, tau);
    o.rotation.y = ease(o.rotation.y, 0, dt, tau);
    o.rotation.z = ease(o.rotation.z, 0, dt, tau);
  }
}

/** Плавно повернуть часть к (x, y, z) */
function turn(o: THREE.Object3D, x: number, y: number, z: number, dt: number, tau: number): void {
  o.rotation.x = ease(o.rotation.x, x, dt, tau);
  o.rotation.y = ease(o.rotation.y, y, dt, tau);
  o.rotation.z = ease(o.rotation.z, z, dt, tau);
}

/** Цилиндр между двумя точками (пряди швабры) */
function strand(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, color: number): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r1, r0, len, 4).translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, b.clone().sub(a).normalize()));
  g.translate(a.x, a.y, a.z);
  return at(g, color, 0, 0, 0);
}

/** Папироса: гильза и тлеющий кончик спереди (−Z), ось вдоль Z; droop — насколько кончик опущен */
function papirosa(droop: number): THREE.Mesh {
  const dir = new THREE.Vector3(0, -Math.sin(droop), -Math.cos(droop));
  return crewMesh([
    strand(dir.clone().multiplyScalar(-0.035), dir.clone().multiplyScalar(0.03), 0.0075, 0.0075, 0xf3efe6),
    strand(dir.clone().multiplyScalar(0.03), dir.clone().multiplyScalar(0.042), 0.0082, 0.0078, 0xff5a1f),
  ]);
}

export class Crew {
  readonly group = new THREE.Group();
  private readonly mikhalych: Person;
  private readonly tolik: Person;
  private readonly vityok: Person;
  private readonly sanya: Person;
  /** Трубка боцмана: где дымится (в осях головы) */
  private readonly pipeBowl = new THREE.Vector3(0.1, -0.06, -0.31);
  /** Витёк: папироса в пальцах и в зубах (видна одна), швабра (только когда драит), кончики и рот — где дымится */
  private readonly cigHand: THREE.Mesh;
  private readonly cigMouth: THREE.Mesh;
  private readonly mop: THREE.Group;
  private readonly cigHandTip = new THREE.Vector3(0, -0.4 - 0.042 * Math.sin(0.15), -0.075 - 0.042 * Math.cos(0.15));
  private readonly cigMouthTip = new THREE.Vector3(0.035, -0.095 - 0.042 * Math.sin(0.2), -0.21 - 0.042 * Math.cos(0.2));
  private readonly mouth = new THREE.Vector3(0.0, -0.08, -0.2);
  private readonly mopAim = new THREE.Vector3();
  private readonly grip = new THREE.Vector3();
  /** Руки на черенке: правая ниже, левая выше (м от низа швабры) */
  private readonly grips: ReadonlyArray<readonly [THREE.Group, number]>;
  private vYaw: number = V.yaw;
  private cigT = 1;
  private exhaled = -1;
  private exhaleT = -1;
  /** Чем занят Витёк (для отладки, Barkas.debug) */
  matrosPhase: MatrosPhase = 'stand';
  private readonly needle: THREE.Mesh;
  private readonly steelyard: THREE.Group;
  private readonly onStrike: () => void;
  private nextRing = RING_FIRST;
  private ringT = -1;
  private struck = 0;
  private puffT = 1;
  private mYaw: number = M.yaw;
  private sYaw: number = SANYA.yaw;
  private waveT = -1;
  private lazy = 0;
  private readonly tmp = new THREE.Vector3();

  /** onStrike — боцман ударил в рынду (качнуть её и дать звук) */
  constructor(scene: THREE.Scene, onStrike: () => void) {
    this.onStrike = onStrike;
    this.group.name = 'barkas-crew';
    // боцман: капитанка, бушлат с медными пуговицами, седая борода, трубка
    this.mikhalych = makePerson({
      skin: 0xc4937a, coat: 0x1f2a3a, trim: 0xc9a24a, pants: 0x262b33, boots: 0x16191c, hat: 'captain', hatColor: 0xf2efe6, hatBand: 0x1d2228,
      hair: 0xb9b5ad, temples: 0xd2cec6, brows: 0xa9a49b, beard: 0xcfcac1, mustache: 0xc3bdb2, build: 1.12,
    });
    this.mikhalych.head.add(crewMesh([
      at(new THREE.CylinderGeometry(0.009, 0.009, 0.15, 5).rotateX(Math.PI / 2 - 0.25), 0x3b2a1e, 0.07, -0.095, -0.24),
      at(new THREE.CylinderGeometry(0.03, 0.024, 0.06, 8), 0x5a3a24, 0.1, -0.09, -0.31),
      at(new THREE.CylinderGeometry(0.022, 0.022, 0.005, 8), 0x2a1a10, 0.1, -0.058, -0.31),
    ]));
    this.place(this.mikhalych, M.x, M.y, M.z, M.yaw);
    // рыбак: жёлтая роба и зюйдвестка, сидит на краю люка; в правой руке — челнок
    this.tolik = makePerson({
      skin: 0xd6a283, coat: 0xe2b12f, pants: 0xe2b12f, boots: 0x2e4434, hat: 'souwester', hatColor: 0xe2b12f,
      hair: 0x6b4a32, brows: 0x5a3c28, young: true, seat: 0.5,
    });
    this.needle = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.16, 0.012), new THREE.MeshStandardMaterial({ color: 0x2f7d6a, roughness: 0.6 }));
    this.needle.position.set(0, -0.42, -0.04);
    this.tolik.armR.add(this.needle);
    this.place(this.tolik, L.x, L.y, L.z, L.yaw);
    // матрос: тельняшка, бескозырка с ленточками, клёши; папироса — в пальцах правой руки или в зубах
    this.vityok = makePerson({
      skin: 0xd9a888, coat: 0xf1eee6, stripes: 0x284a8e, pants: 0x1f2a44, boots: 0x18191b, hat: 'sailor', hatColor: 0xf7f5ef,
      hatBand: 0x1b2333, hair: 0x7a5232, brows: 0x6a4630, young: true, build: 0.96,
    });
    this.cigHand = papirosa(0.15);
    this.cigHand.position.set(0, -0.4, -0.075);
    this.vityok.armR.add(this.cigHand);
    this.cigMouth = papirosa(0.2);
    this.cigMouth.position.set(0.035, -0.095, -0.21);
    this.cigMouth.visible = false;
    this.vityok.head.add(this.cigMouth);
    // швабра: черенок, жестяная обойма и веер прядей до палубы; точка группы — низ прядей
    const mop: THREE.BufferGeometry[] = [
      at(new THREE.CylinderGeometry(0.017, 0.019, MOP_LEN - 0.1, 6), 0xc59b66, 0, 0.1 + (MOP_LEN - 0.1) / 2, 0),
      at(new THREE.CylinderGeometry(0.032, 0.03, 0.07, 8), 0x7d8386, 0, 0.11, 0),
    ];
    const top = new THREE.Vector3(0, 0.1, 0);
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + 0.3;
      const r = 0.13 + (i % 3) * 0.03;
      mop.push(strand(top, new THREE.Vector3(Math.cos(a) * r, 0.015, Math.sin(a) * r * 0.8), 0.016, 0.011, i % 3 === 1 ? 0xb4ab97 : 0xd3cbb8));
    }
    this.grips = [[this.vityok.armR, MOP_GRIP_R], [this.vityok.armL, MOP_GRIP_L]];
    this.mop = new THREE.Group();
    this.mop.add(crewMesh(mop));
    this.mop.visible = false;
    this.vityok.group.add(this.mop);
    this.place(this.vityok, V.x, V.y, V.z, V.yaw);
    // Саня: лицо Семёна, тёмные усы и виски с проседью, тельняшка с закатанными рукавами, оранжевый фартук
    this.sanya = makePerson({
      skin: 0xb9896f, coat: 0xd6cbb0, stripes: 0x405564, rolled: true, apron: 0xe0662e, pants: 0x2f3b4a, boots: 0x1d2a22,
      hat: 'knit', hatColor: 0x7a2a35, hair: 0x3a2c22, temples: 0xb9b3aa, brows: 0x3a2c22, mustache: 0x3a2c22, build: 1.12,
    });
    // безмен с рыбой: появляется в правой руке, когда он взвешивает
    this.steelyard = new THREE.Group();
    this.steelyard.add(crewMesh([
      at(new THREE.CylinderGeometry(0.012, 0.012, 0.32, 6).rotateZ(Math.PI / 2), 0x8d9599, 0, 0, 0),
      at(new THREE.SphereGeometry(0.035, 8, 6), 0x5d6468, 0.15, 0, 0),
      at(new THREE.CylinderGeometry(0.004, 0.004, 0.12, 4), 0x8d9599, -0.12, -0.06, 0),
    ]));
    const fish = makeFish3D(1, 700);
    fish.scale.multiplyScalar(0.75);
    fish.rotation.set(Math.PI / 2, 0, 0);
    fish.position.set(-0.12, -0.24, 0);
    this.steelyard.add(fish);
    this.steelyard.position.set(0.16, 0.66, -0.4);
    this.steelyard.visible = false;
    this.sanya.torso.add(this.steelyard);
    this.place(this.sanya, SANYA.x, SANYA.y, SANYA.z, SANYA.yaw);
    scene.add(this.group);
  }

  private place(p: Person, x: number, y: number, z: number, yaw: number): void {
    p.group.position.set(x, y, z);
    p.group.rotation.y = yaw;
    this.group.add(p.group);
  }

  /** Лодка подошла к борту — Саня машет */
  wave(): void {
    this.waveT = 0;
  }

  /**
   * cam — камера (вдали не рисуем), me — где свой игрок (Саня поворачивается к покупателю), smoke — дым трубки и
   * папиросы, rain — дождь 0…1.
   */
  update(dt: number, t: number, cam: THREE.Vector3, me: THREE.Vector3 | null, smoke: Smoke, rain: number): void {
    const d = Math.hypot(cam.x - BARKAS.x, cam.z - BARKAS.z);
    this.group.visible = d < HIDE;
    // склянки идут по часам и вдали — чтобы звон не сбивался
    this.stepRing(dt);
    if (!this.group.visible) return;
    this.lazy += dt;
    if (d > LAZY && this.lazy < 0.125) return;
    const step = this.lazy;
    this.lazy = 0;
    this.animMikhalych(step, t, smoke, rain);
    this.animTolik(step, t);
    this.animVityok(step, t, smoke, rain);
    this.animSanya(step, t, me);
  }

  private stepRing(dt: number): void {
    this.nextRing -= dt;
    if (this.nextRing <= 0 && this.ringT < 0) {
      this.nextRing = RING_EVERY;
      this.ringT = 0;
      this.struck = 0;
    }
    if (this.ringT < 0) return;
    this.ringT += dt;
    while (this.struck < STRIKES.length && this.ringT >= STRIKES[this.struck]) {
      this.struck++;
      this.onStrike();
    }
    if (this.ringT > RING_END) this.ringT = -1;
  }

  private animMikhalych(dt: number, t: number, smoke: Smoke, rain: number): void {
    const p = this.mikhalych;
    const r = this.ringT;
    const ringing = r >= 0 && r < RING_BACK;
    // к рынде — повернуться так, чтобы правая рука легла на шкертик
    const want = ringing ? yawTo(M.x, M.z, LANYARD.x, LANYARD.z) + 0.5 : M.yaw + Math.sin(t * 0.11) * 0.25;
    this.mYaw += wrap(want - this.mYaw) * Math.min(1, dt / (ringing ? 0.18 : 0.6));
    p.group.rotation.y = this.mYaw;
    p.torso.position.y = p.hip + Math.sin(t * 0.8) * 0.006;
    if (ringing && r > 0.45) {
      p.group.updateMatrixWorld(true);
      const local = p.torso.worldToLocal(this.tmp.copy(LANYARD));
      // рывок на каждом ударе: рука дёргает шкертик к себе
      let jerk = 0;
      for (const s of STRIKES) if (r > s - 0.12 && r < s + 0.1) jerk = Math.sin(((r - s + 0.12) / 0.22) * Math.PI);
      reach(p.armR, local.x, local.y - 0.05 * jerk, local.z + 0.06 * jerk, Math.min(1, dt / 0.08));
      p.torso.rotation.x = ease(p.torso.rotation.x, 0.08, dt, 0.2);
      p.head.rotation.x = ease(p.head.rotation.x, -0.2, dt, 0.2);
      p.armL.rotation.x = ease(p.armL.rotation.x, 0.05, dt, 0.2);
      p.armL.rotation.z = ease(p.armL.rotation.z, -0.12, dt, 0.2);
      return;
    }
    rest(p, dt, 0.3);
    // затяжка: левая рука к трубке, потом густой клуб
    const ph = t % 17;
    if (ph > 10 && ph < 13) {
      const k = Math.sin(((ph - 10) / 3) * Math.PI);
      p.armL.rotation.x = 2.25 * k;
      p.armL.rotation.z = 0.42 * k;
      p.head.rotation.x = -0.12 * k;
    } else {
      p.armR.rotation.z = -0.06;
      p.armL.rotation.z = 0.06;
      // смотрит то на остров, то на палубу
      p.head.rotation.y = Math.sin(t * 0.23) * 0.45;
    }
    this.puffT -= dt;
    if (this.puffT <= 0) {
      const big = ph > 12.4 && ph < 13.4;
      this.puffT = big ? 0.25 : 2.2 + Math.random() * 1.8;
      p.head.updateMatrixWorld(true);
      const w = p.head.localToWorld(this.tmp.copy(this.pipeBowl));
      smoke.puff(w.x, w.y + 0.04, w.z, 0xd9d6cf, big ? 2.6 : 1.8, 0.05, big ? 0.55 : 0.32, 0.25, (big ? 0.55 : 0.3) * (1 - 0.5 * rain));
    }
  }

  private animTolik(dt: number, t: number): void {
    const p = this.tolik;
    const ph = t % 26;
    if (ph > 20 && ph < 24) {
      // потянулся, посмотрел на море
      const k = Math.sin(((ph - 20) / 4) * Math.PI);
      p.armL.rotation.x = 2.7 * k;
      p.armR.rotation.x = 2.7 * k;
      p.armL.rotation.z = -0.3 * k;
      p.armR.rotation.z = 0.3 * k;
      p.torso.rotation.x = -0.12 * k;
      p.head.rotation.set(-0.25 * k, 0.6 * k, 0);
      this.needle.visible = k < 0.3;
      return;
    }
    this.needle.visible = true;
    // челнок ходит петлями, левая рука держит ячею
    const a = t * 3.4;
    reach(p.armR, 0.07 + Math.cos(a) * 0.05, 0.02 + Math.sin(a) * 0.04, -0.36 + Math.sin(a * 0.5) * 0.03, Math.min(1, dt / 0.06));
    reach(p.armL, -0.1, 0.03 + Math.sin(a * 0.5 + 1) * 0.015, -0.38, Math.min(1, dt / 0.15));
    this.needle.rotation.z = Math.sin(a) * 0.5;
    p.torso.rotation.x = ease(p.torso.rotation.x, 0.22, dt, 0.4);
    p.head.rotation.x = ease(p.head.rotation.x, 0.42, dt, 0.4);
    p.head.rotation.y = ease(p.head.rotation.y, Math.sin(t * 0.3) * 0.15, dt, 0.4);
  }

  /**
   * Матрос Витёк, без музыки, по кругу V_CYCLE: стоит и поглядывает по сторонам (папироса в опущенной руке) → курит
   * (две затяжки: рука ко рту, потом клуб дыма) → драит палубу шваброй (наклонился, швабра ходит взад-вперёд, папироса
   * в зубах) → смотрит в море (повернулся к борту, ладонь козырьком, другая рука на планшире).
   */
  private animVityok(dt: number, t: number, smoke: Smoke, rain: number): void {
    const p = this.vityok;
    const ph = (t + 11) % V_CYCLE;
    const phase: MatrosPhase = ph < V_SMOKE ? 'stand' : ph < V_SWAB ? 'smoke' : ph < V_SEA ? 'swab' : 'sea';
    this.matrosPhase = phase;
    const k = Math.min(1, dt / 0.18);
    const want = phase === 'swab' ? V_YAW_SWAB : phase === 'sea' ? V_YAW_SEA + Math.sin(t * 0.21) * 0.12 : V.yaw + Math.sin(t * 0.13) * 0.18;
    this.vYaw += wrap(want - this.vYaw) * Math.min(1, dt / 0.55);
    p.group.rotation.y = this.vYaw;
    p.torso.position.y = p.hip + Math.sin(t * 0.85) * 0.006;
    let atMouth = false;
    if (phase === 'swab') {
      // швабра на палубе перед собой: ходит из стороны в сторону, на каждом проходе — чуть вперёд-назад
      const a = (ph - V_SWAB) * 2.5;
      const sx = Math.sin(a) * 0.3;
      this.mop.visible = true;
      this.mop.position.set(sx, 0, -0.92 + Math.cos(2 * a) * 0.06);
      this.mopAim.set(0.08 + sx * 0.3, 1.18, -0.2).sub(this.mop.position).normalize();
      this.mop.quaternion.setFromUnitVectors(UP, this.mopAim);
      // наклонился вперёд (у туловища и головы отрицательный поворот по X — вперёд и вниз), плечи за шваброй
      turn(p.torso, -0.32, -sx * 0.45, 0, dt, 0.3);
      turn(p.head, -0.22, sx * 0.35, 0, dt, 0.3);
      // руки — на черенок: правая ниже, левая выше (точки черенка — в оси туловища)
      p.group.updateMatrixWorld(true);
      for (const [arm, along] of this.grips) {
        this.grip.copy(this.mopAim).multiplyScalar(along).add(this.mop.position);
        const g = p.torso.worldToLocal(p.group.localToWorld(this.grip));
        reach(arm, g.x, g.y, g.z, k);
      }
    } else {
      this.mop.visible = false;
      if (phase === 'sea') {
        // к борту: правая ладонь козырьком над глазами, левая рука на планшире, оглядывает горизонт
        turn(p.torso, -0.08, 0, 0, dt, 0.4);
        turn(p.head, 0.1, Math.sin(t * 0.33) * 0.4, 0, dt, 0.5);
        reach(p.armR, 0.06, 0.76, -0.27, Math.min(1, dt / 0.3));
        reach(p.armL, -0.22, 0.17, -0.45, Math.min(1, dt / 0.3));
      } else {
        // стоит: переминается, смотрит то на палубу, то на рыбаков; курит — две затяжки
        turn(p.torso, 0, 0, Math.sin(t * 0.7) * 0.025, dt, 0.4);
        let drag = -1;
        if (phase === 'smoke') for (let i = 0; i < V_DRAGS.length; i++) if (ph - V_SMOKE >= V_DRAGS[i] && ph - V_SMOKE < V_DRAGS[i] + V_DRAG) drag = i;
        if (drag >= 0) {
          const u = ph - V_SMOKE - V_DRAGS[drag];
          atMouth = u > 0.55 && u < V_DRAG - 0.45;
          reach(p.armR, 0.06, 0.56, -0.25, Math.min(1, dt / 0.22));
          turn(p.head, -0.04, -0.08, 0, dt, 0.3);
          this.exhaled = drag;
        } else {
          turn(p.armR, 0.12, 0, -0.06, dt, 0.35);
          // выдох после затяжки: голова чуть вверх, густой клуб изо рта
          if (this.exhaled >= 0) {
            this.exhaled = -1;
            this.exhaleT = 0;
          }
          const look = this.exhaleT >= 0 && this.exhaleT < 1.2 ? 0.2 : -0.02;
          turn(p.head, look, this.exhaleT >= 0 && this.exhaleT < 1.2 ? 0.1 : Math.sin(t * 0.29) * 0.55, 0, dt, 0.4);
        }
        turn(p.armL, 0, 0, 0.07, dt, 0.35);
      }
    }
    this.cigMouth.visible = phase === 'swab' || phase === 'sea' || atMouth;
    this.cigHand.visible = !this.cigMouth.visible;
    // дымок: тонкая струйка с кончика папиросы; после затяжки — два клуба изо рта
    if (this.exhaleT >= 0) {
      const was = this.exhaleT;
      this.exhaleT += dt;
      for (const at of V_PUFFS) {
        if (was < at && this.exhaleT >= at) {
          p.group.updateMatrixWorld(true);
          const w = p.head.localToWorld(this.tmp.copy(this.mouth));
          smoke.puff(w.x, w.y, w.z, 0xe9e6df, 2.4, 0.08, 0.55, 0.24, 0.55 * (1 - 0.5 * rain));
        }
      }
      if (this.exhaleT > 2) this.exhaleT = -1;
    }
    this.cigT -= dt;
    if (this.cigT <= 0) {
      this.cigT = 0.9 + Math.random() * 0.8;
      const holder = this.cigMouth.visible ? p.head : p.armR;
      p.group.updateMatrixWorld(true);
      const w = holder.localToWorld(this.tmp.copy(this.cigMouth.visible ? this.cigMouthTip : this.cigHandTip));
      smoke.puff(w.x, w.y + 0.01, w.z, 0xe4e1da, 1.6, 0.03, 0.17, 0.28, 0.32 * (1 - 0.5 * rain));
    }
  }

  private animSanya(dt: number, t: number, me: THREE.Vector3 | null): void {
    const p = this.sanya;
    // покупатель у прилавка — смотрит на него; лодка подошла — машет ей
    const buyer = me !== null && Math.hypot(me.x - SANYA_USE.x, me.z - SANYA_USE.z) < 2.4 && Math.abs(me.y) < 1.5;
    if (this.waveT >= 0) this.waveT += dt;
    if (this.waveT > 3.2) this.waveT = -1;
    const waving = this.waveT >= 0 && !buyer;
    const want = waving ? yawTo(SANYA.x, SANYA.z, FERRY_AWAY.x, FERRY_AWAY.z) : buyer ? yawTo(SANYA.x, SANYA.z, me!.x, me!.z) : SANYA.yaw;
    this.sYaw += wrap(want - this.sYaw) * Math.min(1, dt / 0.35);
    p.group.rotation.y = this.sYaw;
    p.torso.position.y = p.hip + Math.sin(t * 0.9) * 0.006;
    this.steelyard.visible = false;
    const k = Math.min(1, dt / 0.12);
    if (waving) {
      const w = Math.min(1, this.waveT / 0.4, (3.2 - this.waveT) / 0.4);
      reach(p.armR, 0.32, 0.95, -0.12, k * w);
      p.armR.rotation.z += Math.sin(t * 9) * 0.3 * w;
      p.armL.rotation.x = ease(p.armL.rotation.x, 0, dt, 0.2);
      p.head.rotation.x = ease(p.head.rotation.x, -0.08, dt, 0.2);
      return;
    }
    if (buyer) {
      // разговор: опёрся руками о прилавок, кивает
      reach(p.armL, -0.2, -0.02, -0.42, k);
      reach(p.armR, 0.2, -0.02, -0.42, k);
      p.torso.rotation.x = ease(p.torso.rotation.x, 0.12, dt, 0.3);
      p.head.rotation.x = Math.sin(t * 2.2) * 0.06;
      p.head.rotation.y = ease(p.head.rotation.y, 0, dt, 0.3);
      return;
    }
    const ph = t % 22;
    if (ph < 7) {
      // взвешивает: безмен с рыбой на уровне глаз, щурится на шкалу
      const w = Math.min(1, ph / 0.5, (7 - ph) / 0.5);
      this.steelyard.visible = w > 0.6;
      this.steelyard.rotation.z = Math.sin(t * 2.6) * 0.06;
      reach(p.armR, 0.16, 0.66, -0.4, k * w);
      p.armL.rotation.x = ease(p.armL.rotation.x, 0.1, dt, 0.2);
      p.head.rotation.x = ease(p.head.rotation.x, -0.05, dt, 0.3);
      p.head.rotation.y = ease(p.head.rotation.y, -0.2, dt, 0.3);
      p.torso.rotation.x = ease(p.torso.rotation.x, 0, dt, 0.3);
    } else if (ph > 10 && ph < 17) {
      // пересчитывает монеты на прилавке
      const c = t * 5;
      reach(p.armL, -0.1, 0.02, -0.4, k);
      reach(p.armR, 0.08 + Math.sin(c) * 0.03, 0.03 + Math.max(0, Math.sin(c)) * 0.03, -0.4, k);
      p.torso.rotation.x = ease(p.torso.rotation.x, 0.18, dt, 0.3);
      p.head.rotation.x = ease(p.head.rotation.x, 0.35, dt, 0.3);
      p.head.rotation.y = ease(p.head.rotation.y, 0, dt, 0.3);
    } else {
      rest(p, dt, 0.3);
      p.head.rotation.y = Math.sin(t * 0.31) * 0.5;
    }
  }
}

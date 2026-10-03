// Экипаж «Альбатроса» — живые, но без беготни: каждый занят своим делом на своём месте (твёрдые тела — в карте).
// Боцман Михалыч на баке попыхивает трубкой и раз в пару минут бьёт склянки в рынду (звук — в такт ударам). Рыбак
// Толик на краю люка чинит сеть челноком, иногда потягивается. Баянист Витёк на крыше рубки играет — меха ходят в
// такт музыке (ambient.ts), в паузах отдыхает. Саня за прилавком взвешивает рыбу безменом, пересчитывает монеты,
// оборачивается к покупателю и машет лодке, когда она подходит. Вдали (дальше HIDE) экипаж не рисуется, дальше
// LAZY — двигается реже.
import * as THREE from 'three';
import { BARKAS, BARKAS_CREW, BARKAS_RYNDA, SANYA, SANYA_USE } from '../../../shared/barkas.ts';
import { FERRY_AWAY } from '../../../shared/ferry.ts';
import { makeFish3D } from '../fishart.ts';
import { at, crewMesh, ease, makePerson, type Person } from './people.ts';
import type { Smoke } from './smoke.ts';

/** Что сейчас с баяном (ambient.ts): играет ли, насколько растянуты меха (0…1), доля текущей доли такта (0…1) */
export interface Squeeze {
  playing: boolean;
  bellows: number;
  beat: number;
}

/** Дальше — экипажа не видно (с площади ≈90 м люди с палец — не рисуем, с мостков Семёна ≈55 м — видно);
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
function reach(arm: THREE.Group, x: number, y: number, z: number, k = 1): void {
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

export class Crew {
  readonly group = new THREE.Group();
  private readonly mikhalych: Person;
  private readonly tolik: Person;
  private readonly vityok: Person;
  private readonly sanya: Person;
  /** Трубка боцмана: где дымится (в осях головы) */
  private readonly pipeBowl = new THREE.Vector3(0.1, -0.06, -0.31);
  private readonly accLeft: THREE.Group;
  private readonly accBellows: THREE.Mesh;
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
  private open = 0.1;
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
    // баянист: тельняшка, берет, на ящике; баян — правая половина у груди, левая ходит с мехами
    this.vityok = makePerson({
      skin: 0xdcae8e, coat: 0xeeeae2, stripes: 0x26407a, pants: 0x2a3550, boots: 0x1b1d20, hat: 'beret', hatColor: 0x1d2b4a,
      hair: 0x3d2b1f, brows: 0x3a2a1e, young: true, seat: 0.46, build: 0.95,
    });
    const acc = new THREE.Group();
    acc.position.set(0, 0.2, -0.31);
    acc.add(crewMesh([
      at(new THREE.BoxGeometry(0.1, 0.36, 0.2), 0x9e1f2a, 0.19, 0, 0),
      at(new THREE.BoxGeometry(0.03, 0.32, 0.05), 0xf3efe4, 0.155, 0, -0.1),
      ...[-0.12, -0.06, 0, 0.06, 0.12].map((y) => at(new THREE.BoxGeometry(0.032, 0.02, 0.03), 0x1a1a1a, 0.155, y + 0.02, -0.115)),
      at(new THREE.BoxGeometry(0.104, 0.05, 0.204), 0xd9c27a, 0.19, 0.16, 0),
    ]));
    this.accLeft = new THREE.Group();
    this.accLeft.add(crewMesh([
      at(new THREE.BoxGeometry(0.09, 0.34, 0.2), 0x9e1f2a, -0.045, 0, 0),
      ...[-0.08, 0, 0.08].flatMap((y) => [-0.05, 0.05].map((z) => at(new THREE.SphereGeometry(0.014, 6, 4), 0xf3efe4, -0.092, y, z))),
      at(new THREE.BoxGeometry(0.094, 0.05, 0.204), 0xd9c27a, -0.045, 0.15, 0),
    ]));
    acc.add(this.accLeft);
    // меха: складки поперёк, ширина 1 — растягиваются масштабом
    const folds: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 8; i++) folds.push(at(new THREE.BoxGeometry(1 / 8, 0.31, 0.19), i % 2 ? 0x1c1c1e : 0xb8323c, -(i + 0.5) / 8, 0, 0));
    this.accBellows = crewMesh(folds);
    this.accBellows.position.x = 0.14;
    acc.add(this.accBellows);
    this.vityok.torso.add(acc);
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
   * cam — камера (вдали не рисуем), me — где свой игрок (Саня поворачивается к покупателю), smoke — дым трубки,
   * squeeze — баян, rain — дождь 0…1.
   */
  update(dt: number, t: number, cam: THREE.Vector3, me: THREE.Vector3 | null, smoke: Smoke, squeeze: Squeeze, rain: number): void {
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
    this.animVityok(step, t, squeeze);
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

  private animVityok(dt: number, t: number, sq: Squeeze): void {
    const p = this.vityok;
    const open = sq.playing ? 0.07 + 0.2 * sq.bellows : 0.05;
    this.open = ease(this.open, open, dt, sq.playing ? 0.05 : 0.6);
    this.accLeft.position.x = 0.14 - this.open;
    this.accBellows.scale.x = this.open;
    // правая рука на клавиатуре (пальцы бегают в такт), левая держит левую половину за ремень
    const beat = sq.playing ? Math.sin(sq.beat * Math.PI * 2) : 0;
    const k = Math.min(1, dt / 0.06);
    reach(p.armR, 0.2 + beat * 0.012, 0.24 + beat * 0.02, -0.4, k);
    reach(p.armL, 0.14 - this.open - 0.1, 0.22, -0.33, k);
    if (sq.playing) {
      // качается в такт, кивает на сильную долю
      p.torso.rotation.z = Math.sin(t * 1.6) * 0.06;
      p.torso.rotation.x = 0.05 + Math.max(0, beat) * 0.03;
      p.head.rotation.x = 0.08 + Math.max(0, beat) * 0.08;
      p.head.rotation.y = ease(p.head.rotation.y, Math.sin(t * 0.4) * 0.3, dt, 0.5);
      p.head.rotation.z = -0.12;
    } else {
      // отдыхает: откинулся, поглядывает на палубу, поправляет берет
      p.torso.rotation.z = ease(p.torso.rotation.z, 0, dt, 0.5);
      p.torso.rotation.x = ease(p.torso.rotation.x, -0.08, dt, 0.5);
      p.head.rotation.z = ease(p.head.rotation.z, 0, dt, 0.5);
      p.head.rotation.x = ease(p.head.rotation.x, 0.1, dt, 0.5);
      p.head.rotation.y = ease(p.head.rotation.y, Math.sin(t * 0.5) * 0.7, dt, 0.5);
      const ph = t % 9;
      if (ph > 5 && ph < 6.6) {
        const w = Math.sin(((ph - 5) / 1.6) * Math.PI);
        p.armR.rotation.x = p.armR.rotation.x * (1 - w) + 2.7 * w;
        p.armR.rotation.z = p.armR.rotation.z * (1 - w) + 0.15 * w;
      }
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

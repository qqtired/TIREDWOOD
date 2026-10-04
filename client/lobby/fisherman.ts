// Дед Семён на крыльце своего дома на конце пирса (shared/fishplaces.ts — FISHER_NPC). Старый рыбак: вязаная шапка
// с отворотом, густая седая борода и усы, кустистые брови, румяный нос, трубка в зубах, вязаный свитер под рыбацким
// жилетом с карманами, тёплые штаны и резиновые сапоги. Руки — с локтями (плечо и предплечье двигаются отдельно).
// Живёт по кругу: чинит сеть челноком, курит трубку (рука к трубке, клуб дыма), поглядывает на море, переминается.
// Подошёл игрок — машет ему; открыт разговор — поворачивается к игроку, кивает и разводит руками. Вдали — обновляется
// реже. Рядом — вывеска «Снасти у Семёна» над крыльцом и доска со временем до сезона рыбалки на стойке крыльца.
import * as THREE from 'three';
import { FISHER_NPC, FISH_HOUSE } from '../../shared/fishplaces.ts';
import { glowTexture, mergeColored, paint, place } from '../render/kit.ts';
import { makeFish3D } from './fishart.ts';
import { FISH_SEASON, seasonLeft, seasonWait } from './fishseason.ts';

const SKIN = 0xd59f80;
const CHEEK = 0xe0907a;
const NOSE = 0xd78a72;
const BEARD = 0xeeebe4;
const BEARD_SH = 0xd9d4ca;
const CAP = 0x3c5873;
const CAP_RIB = 0x34506a;
const SWEATER = 0xe6dcc6;
const SWEATER_RIB = 0xd6cab0;
const VEST = 0x6f7a4a;
const VEST_DARK = 0x5b653b;
const PANTS = 0x4a5160;
const BOOTS = 0x2b3a33;
const PIPE = 0x6b4226;
const METAL = 0x5a6266;

/** Подошёл ближе — машет (не чаще раза в WAVE_GAP с); разговор — оборачивается */
const WAVE_R = 6.5;
const WAVE_GAP = 25;
const WAVE_S = 2.6;
/** Дальше — обновляется 8 раз в секунду */
const LAZY_R = 28;

type G = THREE.BufferGeometry;
function at(g: G, color: number, x: number, y: number, z: number): G {
  return place(paint(g, color), x, y, z);
}
function mesh(parts: G[], mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(mergeColored(parts), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function ease(cur: number, want: number, dt: number, tau: number): number {
  return cur + (want - cur) * Math.min(1, dt / tau);
}
function wrap(a: number): number {
  return a - Math.round(a / (2 * Math.PI)) * 2 * Math.PI;
}
const smooth = (k: number): number => {
  const c = Math.max(0, Math.min(1, k));
  return c * c * (3 - 2 * c);
};
/** Плавный «колокол» 0→1→0 на отрезке [a, b] с краями по e секунд */
function bell(t: number, a: number, b: number, e = 0.6): number {
  return smooth((t - a) / e) * smooth((b - t) / e);
}

interface Arm {
  shoulder: THREE.Group;
  elbow: THREE.Group;
  hand: THREE.Object3D;
}

export class Fisherman3D {
  readonly group = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly armL: Arm;
  private readonly armR: Arm;
  private readonly net: THREE.Mesh;
  private readonly shuttle: THREE.Mesh;
  private readonly pipeBowl = new THREE.Object3D();
  private readonly mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0.02, side: THREE.DoubleSide });
  private readonly puffs: THREE.Sprite[] = [];
  private readonly puffAge: number[] = [];
  private puffNext = 0;
  private readonly board: { ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture; key: string };
  private readonly tmp = new THREE.Vector3();
  private acc = 0;
  private yaw = 0;
  private near = false;
  private waveT = -1;
  private waveAt = -1e9;
  private boardT = 0;
  /** Где был круг курения в прошлом кадре: клуб дыма — один раз, когда время перешло отметку (при любом FPS) */
  private smokePrev = 0;

  constructor(scene: THREE.Scene) {
    this.group.name = 'pier-fisherman';
    this.group.position.set(FISHER_NPC.x, FISHER_NPC.y, FISHER_NPC.z);
    this.group.rotation.y = FISHER_NPC.yaw;
    this.group.add(this.body);
    this.buildLegs();
    this.torso.position.set(0, 0.82, 0);
    this.body.add(this.torso);
    this.buildTorso();
    this.head.position.set(0, 0.6, -0.02);
    this.torso.add(this.head);
    this.buildHead();
    this.armL = this.buildArm(-1);
    this.armR = this.buildArm(1);
    // кусок сети в левой руке (свисает), челнок — в правой
    this.net = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.5, 4, 4), new THREE.MeshStandardMaterial({ map: netTexture(), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.95 }));
    this.net.position.set(0.12, -0.24, -0.05);
    this.armL.hand.add(this.net);
    this.shuttle = new THREE.Mesh(mergeColored([at(new THREE.BoxGeometry(0.028, 0.15, 0.012), 0x8a6a3e, 0, 0, 0), at(new THREE.BoxGeometry(0.006, 0.1, 0.014), 0xcdb98c, 0, 0, -0.008)]), this.mat);
    this.shuttle.position.set(0, -0.05, -0.04);
    this.armR.hand.add(this.shuttle);
    // дымок трубки
    const tex = glowTexture();
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xe8e6e0, transparent: true, depthWrite: false, opacity: 0 }));
      s.visible = false;
      this.puffs.push(s);
      this.puffAge.push(1);
      this.group.add(s);
    }
    this.addGear();
    this.board = this.addSigns();
    this.group.visible = false;
    scene.add(this.group);
  }

  /**
   * camera — где камера (вдали реже), me — свой игрок (машет подошедшему, смотрит на него), talking — открыт разговор
   * с Семёном (оборачивается к игроку).
   */
  update(dt: number, time: number, camera: THREE.Vector3, me: { x: number; y: number; z: number } | null = null, talking = false): void {
    if (!this.group.visible) return;
    this.acc += dt;
    const far = (camera.x - FISHER_NPC.x) ** 2 + (camera.z - FISHER_NPC.z) ** 2 > LAZY_R * LAZY_R;
    if (far && this.acc < 0.125) return;
    const step = Math.min(0.25, this.acc);
    this.acc = 0;
    this.boardT -= step;
    if (this.boardT <= 0) {
      this.boardT = 1;
      this.drawBoard();
    }

    const dMe = me && Math.abs(me.y) < 2 ? Math.hypot(me.x - FISHER_NPC.x, me.z - FISHER_NPC.z) : Infinity;
    const isNear = dMe < WAVE_R;
    if (isNear && !this.near && !talking && time - this.waveAt > WAVE_GAP) {
      this.waveT = 0;
      this.waveAt = time;
    }
    this.near = isNear;
    if (this.waveT >= 0) {
      this.waveT += step;
      if (this.waveT > WAVE_S) this.waveT = -1;
    }
    const waving = this.waveT >= 0 && !talking;

    // куда повернуться: к игроку (разговор, приветствие, игрок рядом) или на пирс; не дальше чем на 70° от фасада
    let want = 0;
    if (me && (talking || waving || dMe < 3.2)) {
      const a = Math.atan2(-(me.x - FISHER_NPC.x), -(me.z - FISHER_NPC.z));
      want = Math.max(-1.2, Math.min(1.2, wrap(a - FISHER_NPC.yaw)));
    }
    this.yaw += wrap(want - this.yaw) * Math.min(1, step / 0.35);
    this.body.rotation.y = this.yaw;

    // дыхание и переминание
    this.torso.position.y = 0.82 + Math.sin(time * 1.1) * 0.006;
    this.body.position.x = Math.sin(time * 0.21) * 0.012;
    this.torso.rotation.z = Math.sin(time * 0.21) * 0.025;

    if (talking) this.poseTalk(step, time);
    else if (waving) this.poseWave(step, time, this.waveT);
    else this.poseIdle(step, time);

    this.updatePuffs(step, time);
  }

  // ------------------------------------------------------------ позы

  /** Разговор: смотрит на игрока, кивает, правой рукой показывает «вот, гляди» */
  private poseTalk(dt: number, t: number): void {
    const k = 0.18;
    this.net.visible = false;
    this.shuttle.visible = false;
    this.head.rotation.x = ease(this.head.rotation.x, -0.05 + Math.max(0, Math.sin(t * 2.4)) * 0.07, dt, k);
    this.head.rotation.y = ease(this.head.rotation.y, 0, dt, k);
    this.head.rotation.z = ease(this.head.rotation.z, Math.sin(t * 0.9) * 0.05, dt, k);
    this.torso.rotation.x = ease(this.torso.rotation.x, 0.04, dt, k);
    const g = 0.5 + 0.5 * Math.sin(t * 1.3);
    this.setArm(this.armR, 0.55 + g * 0.35, -0.12, 0.25, 1.15 + g * 0.25, dt, k);
    this.setArm(this.armL, 0.25, 0, -0.1, 0.55, dt, k);
    this.puffChance(dt, 0.15);
  }

  /** Машет подошедшему правой рукой, левая — на поясе */
  private poseWave(dt: number, t: number, w: number): void {
    const k = 0.12;
    this.net.visible = false;
    this.shuttle.visible = false;
    const up = smooth(w / 0.35) * smooth((WAVE_S - w) / 0.4);
    this.head.rotation.x = ease(this.head.rotation.x, -0.12, dt, k);
    this.head.rotation.y = ease(this.head.rotation.y, 0, dt, k);
    this.head.rotation.z = ease(this.head.rotation.z, 0.08 * up, dt, k);
    this.torso.rotation.x = ease(this.torso.rotation.x, -0.03, dt, k);
    this.setArm(this.armR, 0.25 * up, 0, 2.55 * up + 0.08, 0.35 * up + Math.sin(t * 9) * 0.45 * up, dt, k, true);
    this.setArm(this.armL, -0.25, 0, -0.55, 1.5, dt, k);
  }

  /** Круг дел: чинит сеть, курит, смотрит на море, отдыхает */
  private poseIdle(dt: number, t: number): void {
    const k = 0.35;
    const ph = t % 42;
    const mend = bell(ph, 0, 15, 0.8) + bell(ph, 30, 42, 0.8);
    const smoke = bell(ph, 17, 23.5, 0.7);
    const sea = bell(ph, 24.5, 29.5, 0.9);
    this.net.visible = mend > 0.3;
    this.shuttle.visible = mend > 0.3;
    if (mend > 0.01) {
      // чинит сеть: голова опущена к рукам, челнок ходит петлями
      const a = t * 3.2;
      this.head.rotation.x = ease(this.head.rotation.x, 0.42 * mend, dt, k);
      this.head.rotation.y = ease(this.head.rotation.y, Math.sin(t * 0.4) * 0.1, dt, k);
      this.head.rotation.z = ease(this.head.rotation.z, 0, dt, k);
      this.torso.rotation.x = ease(this.torso.rotation.x, 0.1 * mend, dt, k);
      this.setArm(this.armL, 0.75 * mend, 0, 0.05, 1.2 * mend, dt, 0.25);
      this.setArm(this.armR, (0.7 + Math.sin(a) * 0.12) * mend, Math.cos(a) * 0.12, -0.08 - Math.cos(a) * 0.08, (1.25 + Math.sin(a * 0.5) * 0.2) * mend, dt, 0.08);
      this.puffChance(dt, 0.2);
    } else if (smoke > 0.01) {
      // берёт трубку левой рукой, затягивается; клуб дыма — на выдохе
      const lp = (t % 42) - 17;
      const draw = bell(lp, 1.2, 3.4, 0.5);
      this.head.rotation.x = ease(this.head.rotation.x, -0.12 * smoke - 0.08 * draw, dt, 0.3);
      this.head.rotation.y = ease(this.head.rotation.y, 0.25 * smoke, dt, 0.4);
      this.head.rotation.z = ease(this.head.rotation.z, 0, dt, 0.3);
      this.torso.rotation.x = ease(this.torso.rotation.x, -0.04 * draw, dt, 0.3);
      this.setArm(this.armL, 1.05 * smoke, 0.15 * smoke, 0.32 * smoke, 2.05 * smoke, dt, 0.18);
      this.setArm(this.armR, 0.12, 0, 0.12, 0.3, dt, 0.3);
      const prev = this.smokePrev;
      this.smokePrev = lp;
      if (prev < 3.5 && lp >= 3.5) this.puff(true);
      if (prev < 4.3 && lp >= 4.3) this.puff(true);
    } else {
      // смотрит на море (на запад, к баркасу) или просто стоит, руки за спиной
      this.head.rotation.x = ease(this.head.rotation.x, -0.06, dt, 0.5);
      this.head.rotation.y = ease(this.head.rotation.y, sea * 0.95 + Math.sin(t * 0.17) * 0.25 * (1 - sea), dt, 0.5);
      this.head.rotation.z = ease(this.head.rotation.z, 0, dt, 0.5);
      this.torso.rotation.x = ease(this.torso.rotation.x, 0, dt, 0.5);
      // правая — козырьком ко лбу, когда смотрит вдаль
      this.setArm(this.armR, 1.2 * sea - 0.25 * (1 - sea), 0, 0.35 * sea + 0.06, 2.0 * sea + 0.35 * (1 - sea), dt, 0.3);
      this.setArm(this.armL, -0.3, 0, -0.08, 0.45, dt, 0.3);
      this.puffChance(dt, 0.25);
    }
  }

  /** Плечо: x — вперёд (+), y — поворот, z — в сторону (наружу у правой — +, у левой — −); локоть сгибается на bend */
  private setArm(a: Arm, x: number, y: number, z: number, bend: number, dt: number, tau: number, waveElbow = false): void {
    const side = a === this.armR ? 1 : -1;
    a.shoulder.rotation.x = ease(a.shoulder.rotation.x, x, dt, tau);
    a.shoulder.rotation.y = ease(a.shoulder.rotation.y, y * side, dt, tau);
    a.shoulder.rotation.z = ease(a.shoulder.rotation.z, z * side, dt, tau);
    if (waveElbow) {
      // при взмахе предплечье ходит из стороны в сторону, кисть — над головой
      a.elbow.rotation.x = ease(a.elbow.rotation.x, 0.3, dt, tau);
      a.elbow.rotation.z = bend - 0.35;
    } else {
      a.elbow.rotation.x = ease(a.elbow.rotation.x, bend, dt, tau);
      a.elbow.rotation.z = ease(a.elbow.rotation.z, 0, dt, tau);
    }
  }

  // ------------------------------------------------------------ дым трубки

  private puffChance(dt: number, rate: number): void {
    this.puffNext -= dt;
    if (this.puffNext > 0) return;
    this.puffNext = 1 / rate * (0.6 + Math.random() * 0.8);
    this.puff(false);
  }

  private puff(big: boolean): void {
    const i = this.puffAge.findIndex((a) => a >= 1);
    if (i < 0) return;
    this.puffAge[i] = 0;
    const s = this.puffs[i];
    s.visible = true;
    s.userData.big = big;
    this.head.updateWorldMatrix(true, false);
    this.pipeBowl.getWorldPosition(this.tmp);
    this.group.worldToLocal(this.tmp);
    s.userData.x = this.tmp.x;
    s.userData.y = this.tmp.y + 0.05;
    s.userData.z = this.tmp.z;
  }

  private updatePuffs(dt: number, t: number): void {
    for (let i = 0; i < this.puffs.length; i++) {
      if (this.puffAge[i] >= 1) continue;
      const big = this.puffs[i].userData.big as boolean;
      const life = big ? 2.4 : 1.7;
      const a = Math.min(1, this.puffAge[i] + dt / life);
      this.puffAge[i] = a;
      const s = this.puffs[i];
      s.visible = a < 1;
      s.position.set(s.userData.x + a * 0.35 + Math.sin(t * 2 + i) * 0.03, s.userData.y + a * (big ? 0.75 : 0.5), s.userData.z + a * 0.1);
      const size = (big ? 0.16 : 0.08) + a * (big ? 0.55 : 0.3);
      s.scale.set(size, size, 1);
      (s.material as THREE.SpriteMaterial).opacity = Math.sin(a * Math.PI) * (big ? 0.55 : 0.32);
    }
  }

  // ------------------------------------------------------------ модель

  private buildLegs(): void {
    const g: G[] = [];
    for (const sx of [-0.12, 0.12]) {
      // штанина — чуть шире к бедру, сапог с отворотом и толстой подошвой
      g.push(at(new THREE.CylinderGeometry(0.1, 0.088, 0.5, 12), PANTS, sx, 0.6, 0));
      g.push(at(new THREE.CylinderGeometry(0.098, 0.094, 0.36, 12), BOOTS, sx, 0.2, 0));
      g.push(at(new THREE.CylinderGeometry(0.108, 0.108, 0.06, 12), 0x3a4c43, sx, 0.36, 0));
      g.push(at(new THREE.SphereGeometry(0.1, 12, 8).scale(1, 0.62, 1.55), BOOTS, sx, 0.07, -0.07));
      g.push(at(new THREE.BoxGeometry(0.2, 0.035, 0.33), 0x1d2722, sx, 0.018, -0.06));
    }
    // таз
    g.push(at(new THREE.SphereGeometry(0.21, 14, 10).scale(1.05, 0.62, 0.86), PANTS, 0, 0.84, 0));
    this.body.add(mesh(g, this.mat));
  }

  private buildTorso(): void {
    const g: G[] = [];
    // свитер: «бочонок» с животиком, резинка внизу и вязаные косы
    g.push(at(new THREE.SphereGeometry(0.25, 16, 12).scale(1, 1.15, 0.86), SWEATER, 0, 0.27, 0));
    g.push(at(new THREE.SphereGeometry(0.19, 14, 10).scale(1.05, 0.9, 0.9), SWEATER, 0, 0.12, -0.06));
    g.push(at(new THREE.CylinderGeometry(0.235, 0.225, 0.08, 16).scale(1, 1, 0.86), SWEATER_RIB, 0, 0.0, 0));
    for (const x of [-0.06, 0.06]) for (let y = 0.1; y < 0.5; y += 0.07) g.push(at(new THREE.SphereGeometry(0.022, 6, 5), SWEATER_RIB, x, y, -0.235 + Math.abs(y - 0.27) * 0.12));
    // ворот
    g.push(at(new THREE.TorusGeometry(0.09, 0.04, 8, 16).rotateX(Math.PI / 2), SWEATER_RIB, 0, 0.53, -0.01));
    // жилет: две полы с карманами, спинка
    for (const s of [-1, 1]) {
      g.push(at(new THREE.SphereGeometry(0.262, 14, 12, s < 0 ? Math.PI * 0.53 : Math.PI * 1.18, Math.PI * 0.29, 0.35, Math.PI * 0.62).scale(1, 1.15, 0.88), VEST, 0, 0.26, 0));
      g.push(at(new THREE.BoxGeometry(0.11, 0.1, 0.025), VEST_DARK, s * 0.12, 0.13, -0.2));
      g.push(at(new THREE.BoxGeometry(0.11, 0.02, 0.03), 0x4b5431, s * 0.12, 0.18, -0.21));
      g.push(at(new THREE.BoxGeometry(0.08, 0.07, 0.022), VEST_DARK, s * 0.13, 0.32, -0.21));
      // бляшка-блесна на кармане
      g.push(at(new THREE.SphereGeometry(0.012, 6, 4).scale(1, 1.8, 0.4), 0xc9b071, s * 0.15, 0.335, -0.225));
    }
    g.push(at(new THREE.SphereGeometry(0.262, 14, 12, Math.PI * -0.28, Math.PI * 0.56, 0.3, Math.PI * 0.65).scale(1, 1.15, 0.88), VEST, 0, 0.26, 0));
    // ремень с пряжкой
    g.push(at(new THREE.CylinderGeometry(0.236, 0.236, 0.045, 16).scale(1, 1, 0.86), 0x4a3524, 0, 0.03, 0));
    g.push(at(new THREE.BoxGeometry(0.07, 0.05, 0.02), 0xbfa064, 0, 0.03, -0.205));
    // шея
    g.push(at(new THREE.CylinderGeometry(0.07, 0.08, 0.1, 10), SKIN, 0, 0.57, -0.01));
    this.torso.add(mesh(g, this.mat));
  }

  private buildHead(): void {
    const g: G[] = [];
    g.push(at(new THREE.SphereGeometry(0.18, 18, 14).scale(0.95, 1.08, 0.95), SKIN, 0, 0, 0));
    for (const s of [-1, 1]) {
      g.push(at(new THREE.SphereGeometry(0.04, 8, 6).scale(0.55, 1.1, 0.8), 0xc98e70, s * 0.172, -0.005, 0.01));
      // глаза — добрые щёлочки: белок, зрачок, морщинки
      g.push(at(new THREE.SphereGeometry(0.021, 8, 6).scale(1, 0.7, 0.4), 0xf2ede2, s * 0.064, 0.03, -0.158));
      g.push(at(new THREE.SphereGeometry(0.012, 8, 6).scale(1, 1, 0.5), 0x2c3b3c, s * 0.064, 0.03, -0.166));
      for (const dy of [-0.012, 0.012]) g.push(at(new THREE.BoxGeometry(0.03, 0.004, 0.008).rotateZ(s * (dy > 0 ? 0.35 : -0.35)), 0xb57a62, s * 0.105, 0.03 + dy, -0.142));
      // кустистые брови
      g.push(at(new THREE.SphereGeometry(0.04, 8, 6).scale(1.3, 0.45, 0.6).rotateZ(s * -0.18), BEARD, s * 0.068, 0.078, -0.15));
      // румяные щёки над бородой
      g.push(at(new THREE.SphereGeometry(0.042, 8, 6).scale(1, 0.75, 0.45), CHEEK, s * 0.096, -0.02, -0.142));
      // седые волосы из-под шапки над ушами
      g.push(at(new THREE.SphereGeometry(0.06, 8, 6).scale(0.55, 0.9, 1), BEARD_SH, s * 0.16, 0.06, 0.04));
    }
    // нос картошкой
    g.push(at(new THREE.SphereGeometry(0.045, 10, 8).scale(0.95, 0.9, 1), NOSE, 0, -0.012, -0.178));
    // борода: большая окладистая, из нескольких «клубов», и усы
    g.push(at(new THREE.SphereGeometry(0.16, 14, 10).scale(1.05, 1.05, 0.72), BEARD, 0, -0.14, -0.08));
    g.push(at(new THREE.SphereGeometry(0.11, 12, 8).scale(1, 1.2, 0.7), BEARD, 0, -0.25, -0.1));
    for (const s of [-1, 1]) {
      g.push(at(new THREE.SphereGeometry(0.09, 10, 8).scale(0.8, 1.15, 0.75), BEARD_SH, s * 0.115, -0.1, -0.07));
      g.push(at(new THREE.SphereGeometry(0.07, 10, 8).scale(0.85, 1, 0.75), BEARD, s * 0.07, -0.21, -0.12));
      // усы — двумя «щётками» вниз
      g.push(at(new THREE.SphereGeometry(0.05, 10, 6).scale(1.25, 0.5, 0.55).rotateZ(s * -0.35), BEARD, s * 0.05, -0.058, -0.178));
    }
    // вязаная шапка: купол, отворот в рубчик, хвостик-помпон
    g.push(at(new THREE.SphereGeometry(0.192, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(1, 1.05, 1), CAP, 0, 0.055, 0.0));
    g.push(at(new THREE.CylinderGeometry(0.196, 0.2, 0.085, 18), CAP_RIB, 0, 0.075, 0));
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2;
      g.push(at(new THREE.BoxGeometry(0.012, 0.08, 0.012), 0x2c465d, Math.sin(a) * 0.201, 0.075, Math.cos(a) * 0.201));
    }
    g.push(at(new THREE.SphereGeometry(0.045, 8, 6), CAP_RIB, 0, 0.255, 0.02));
    // трубка: мундштук из угла рта вбок и вниз, маленькая чашка у края бороды — лицо (нос, щёки) не закрывает; сторона —
    // та же, что у левой руки (−x), которой он её придерживает, когда затягивается
    const lip = new THREE.Vector3(-0.05, -0.095, -0.2);
    const cup = new THREE.Vector3(-0.165, -0.15, -0.235);
    const dir = cup.clone().sub(lip);
    const stem = new THREE.CylinderGeometry(0.008, 0.01, dir.length(), 6);
    stem.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
    g.push(at(stem, 0x2a1c12, (lip.x + cup.x) / 2, (lip.y + cup.y) / 2, (lip.z + cup.z) / 2));
    g.push(at(new THREE.CylinderGeometry(0.025, 0.019, 0.05, 10), PIPE, cup.x, cup.y + 0.022, cup.z));
    g.push(at(new THREE.CylinderGeometry(0.02, 0.02, 0.005, 10), 0x1b120c, cup.x, cup.y + 0.047, cup.z));
    this.pipeBowl.position.set(cup.x, cup.y + 0.055, cup.z);
    this.head.add(this.pipeBowl);
    this.head.add(mesh(g, this.mat));
  }

  private buildArm(side: -1 | 1): Arm {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.255, 0.44, 0);
    const upper: G[] = [
      at(new THREE.SphereGeometry(0.085, 10, 8), SWEATER, 0, 0, 0),
      at(new THREE.CapsuleGeometry(0.07, 0.2, 4, 10), SWEATER, 0, -0.14, 0),
    ];
    shoulder.add(mesh(upper, this.mat));
    const elbow = new THREE.Group();
    elbow.position.set(0, -0.27, 0);
    const fore: G[] = [
      at(new THREE.CapsuleGeometry(0.064, 0.17, 4, 10), SWEATER, 0, -0.1, 0),
      at(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 10), SWEATER_RIB, 0, -0.2, 0),
    ];
    elbow.add(mesh(fore, this.mat));
    const hand = new THREE.Group();
    hand.position.set(0, -0.27, -0.01);
    hand.add(mesh([
      at(new THREE.SphereGeometry(0.058, 10, 8).scale(0.85, 1.05, 0.75), SKIN, 0, 0, 0),
      at(new THREE.SphereGeometry(0.024, 8, 6).scale(1, 1.4, 1), SKIN, side * -0.045, 0.01, -0.025),
    ], this.mat));
    elbow.add(hand);
    shoulder.add(elbow);
    this.torso.add(shoulder);
    return { shoulder, elbow, hand };
  }

  /** Рядом на крыльце: ящик с уловом, ведро, удочки у стойки, бочонок-стол со снастями */
  private addGear(): void {
    const g: G[] = [];
    const lx = (x: number): number => x - FISHER_NPC.x;
    const lz = (z: number): number => z - FISHER_NPC.z;
    // ящик с рыбой и льдом справа от Семёна
    const cx = lx(-16.62);
    const cz = lz(59.25);
    g.push(at(new THREE.BoxGeometry(0.5, 0.03, 0.4), 0x8e7556, cx, 0.02, cz));
    for (let y = 0.07; y < 0.34; y += 0.075) for (const s of [-1, 1]) {
      g.push(at(new THREE.BoxGeometry(0.5, 0.055, 0.022), 0x9b8263, cx, y, cz + s * 0.2));
      g.push(at(new THREE.BoxGeometry(0.022, 0.055, 0.4), 0x8e7556, cx + s * 0.25, y, cz));
    }
    g.push(at(new THREE.BoxGeometry(0.46, 0.03, 0.36), 0xdfeef2, cx, 0.3, cz));
    // ведро
    g.push(at(new THREE.CylinderGeometry(0.12, 0.095, 0.25, 12, 1, true), 0x8d9a99, lx(-16.55), 0.125, lz(59.0) - 0.45));
    g.push(at(new THREE.TorusGeometry(0.12, 0.01, 4, 12).rotateX(Math.PI / 2), 0x6f7a7a, lx(-16.55), 0.25, lz(59.0) - 0.45));
    // удочки у восточной стойки крыльца
    for (let i = 0; i < 2; i++) {
      const rod = new THREE.CylinderGeometry(0.008, 0.015, 2.2, 6).rotateZ(-0.1 - i * 0.06).rotateX(0.05);
      g.push(at(rod, i ? 0x2b3b33 : 0x3a2a1e, lx(-16.3) + i * 0.08, 1.12, lz(58.75)));
      g.push(at(new THREE.CylinderGeometry(0.025, 0.025, 0.06, 8).rotateZ(Math.PI / 2), METAL, lx(-16.35) + i * 0.08, 0.45, lz(58.72)));
    }
    this.group.add(mesh(g, this.mat));
    for (let i = 0; i < 3; i++) {
      const fish = makeFish3D(i, 140);
      fish.scale.multiplyScalar(0.7);
      fish.position.set(cx - 0.1 + i * 0.1, 0.33, cz - 0.08 + i * 0.07);
      fish.rotation.y = 0.3 + i * 0.4;
      this.group.add(fish);
    }
  }

  /** Вывеска над крыльцом и доска «до сезона рыбалки» на восточной стойке крыльца */
  private addSigns(): { ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture; key: string } {
    const lx = (x: number): number => x - FISHER_NPC.x;
    const lz = (z: number): number => z - FISHER_NPC.z;
    // вывеска: доска на цепочках под краем навеса
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 200;
    const x = c.getContext('2d')!;
    x.fillStyle = '#6a4f34';
    x.fillRect(0, 0, 1024, 200);
    x.fillStyle = 'rgba(255,240,210,.08)';
    for (let y = 18; y < 200; y += 34) x.fillRect(0, y, 1024, 3);
    x.strokeStyle = '#e9dcb8';
    x.lineWidth = 8;
    x.strokeRect(14, 14, 996, 172);
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillStyle = '#f6ecd0';
    x.font = '800 78px Rubik, system-ui, sans-serif';
    x.fillText('СНАСТИ У СЕМЁНА', 512, 84);
    x.fillStyle = '#ffd36b';
    x.font = '600 38px Rubik, system-ui, sans-serif';
    x.fillText('улов · снасти · задания', 512, 150);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const signW = 2.3;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(signW, signW * 0.195), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
    sign.position.set(lx(-19), 2.02, lz(58.47) - 0.06);
    sign.rotation.y = Math.PI;
    this.group.add(sign);
    const wood: G[] = [at(new THREE.BoxGeometry(signW + 0.08, signW * 0.195 + 0.08, 0.05), 0x4e3a27, lx(-19), 2.02, lz(58.47) - 0.02)];
    for (const dx of [-0.9, 0.9]) wood.push(at(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 5), METAL, lx(-19) + dx, 2.3, lz(58.47) - 0.02));
    // доска сезона: чёрная грифельная в раме на стойке крыльца
    const bx = lx(-16.15);
    const bz = lz(58.55) - 0.11;
    wood.push(at(new THREE.BoxGeometry(0.7, 0.5, 0.04), 0x5d4630, bx, 1.5, bz + 0.02));
    wood.push(at(new THREE.CylinderGeometry(0.006, 0.006, 0.2, 4), METAL, bx, 1.83, bz + 0.03));
    this.group.add(mesh(wood, this.mat));
    const bc = document.createElement('canvas');
    bc.width = 512;
    bc.height = 352;
    const ctx = bc.getContext('2d')!;
    const btex = new THREE.CanvasTexture(bc);
    btex.colorSpace = THREE.SRGBColorSpace;
    btex.anisotropy = 4;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.426), new THREE.MeshStandardMaterial({ map: btex, roughness: 0.9, emissive: 0xffffff, emissiveMap: btex, emissiveIntensity: 0.12 }));
    face.position.set(bx, 1.5, bz - 0.005);
    face.rotation.y = Math.PI;
    this.group.add(face);
    return { ctx, tex: btex, key: '' };
  }

  /** Доска у крыльца: «до сезона рыбалки» или «сезон идёт» — мелом; перерисовывается, только когда меняется текст */
  private drawBoard(): void {
    const st = FISH_SEASON.state();
    // как в окне Семёна: «до сезона рыбалки: 1 ч 12 мин» / «Сезон рыбалки идёт! осталось 6:40»
    const big = !st ? 'скоро' : st.on ? seasonLeft(st.left) : seasonWait(st.left);
    const title = !st ? 'СЕЗОН РЫБАЛКИ' : st.on ? 'СЕЗОН РЫБАЛКИ ИДЁТ!' : 'ДО СЕЗОНА РЫБАЛКИ';
    const foot = !st ? 'спроси у Семёна' : st.on ? 'осталось · беги к воде!' : 'готовь удочку';
    const key = `${title}|${big}`;
    if (key === this.board.key) return;
    this.board.key = key;
    const c = this.board.ctx;
    c.fillStyle = '#2f3a35';
    c.fillRect(0, 0, 512, 352);
    c.fillStyle = 'rgba(255,255,255,.05)';
    for (let i = 0; i < 40; i++) c.fillRect((i * 97) % 512, (i * 61) % 352, 60, 2);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = st?.on ? '#ffd36b' : '#efeadc';
    c.font = '700 40px Rubik, system-ui, sans-serif';
    c.fillText(title, 256, 78, 450);
    c.font = '800 96px Rubik, system-ui, sans-serif';
    c.fillStyle = st?.on ? '#ffe9a8' : '#ffffff';
    c.fillText(big, 256, 190, 450);
    c.font = '500 40px Rubik, system-ui, sans-serif';
    c.fillStyle = '#c9d6cc';
    c.fillText(foot, 256, 290, 450);
    // рамка мелом
    c.strokeStyle = 'rgba(239,234,220,.55)';
    c.lineWidth = 5;
    c.strokeRect(18, 18, 476, 316);
    this.board.tex.needsUpdate = true;
  }
}

/** Ромбовая сеть (прозрачная текстура) */
function netTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const x = c.getContext('2d')!;
  x.strokeStyle = 'rgba(96,112,86,1)';
  x.lineWidth = 3;
  for (let i = -64; i < 128; i += 16) {
    x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 64, 64); x.stroke();
    x.beginPath(); x.moveTo(i, 64); x.lineTo(i + 64, 0); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Только для проверок: где стоит дом, к которому привязаны вывеска и доска */
export const FISHERMAN_HOUSE = FISH_HOUSE;

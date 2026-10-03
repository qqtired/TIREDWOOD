// Живое в крепости: ворота (трещины и сквозные дыры по прочности, дрожат от ударов, падают — обломки на земле,
// новые «вырастают»), кристалл над постаментом (цвет и мерцание по прочности, вспышка от удара, луч в небо),
// краскомёты на воротных башнях (целятся и стреляют по событиям), колокол на террасе, бочки с вареньем у жёлобов
// и лужи на дороге, таблички над стойками. Эффекты и звук — у матча, здесь только меши и их анимация.
import * as THREE from 'three';
import { CRYSTAL_HP, GATE_HP, JAM_R } from '../../shared/fort.ts';
import { CHUTES, CRYSTAL, GATE, TURRET_MUZZLE, TURRET_SPOTS, WALL_H, type FortMap, type FortStation } from '../../shared/fortmap.ts';
import { clamp, damp, makeRng } from '../../shared/math.ts';
import { glowSprite, mergeColored, paint, place, staticMesh } from '../render/kit.ts';
import { gateTexture, labelTexture, puddleTexture, ringTexture } from './textures.ts';

/** Табличка над стойкой: размер на экране (доля высоты кадра) */
const LABEL_H = 0.042;
const LABEL_W = LABEL_H * (256 / 96);
const CYAN = new THREE.Color(0x5fe3ff);
const RED = new THREE.Color(0xff5a4a);
const WHITE = new THREE.Color(0xffffff);
const _c = new THREE.Color();
const _v = new THREE.Vector3();

interface TurretVis {
  spot: THREE.Group;
  gun: THREE.Group;
  yawNode: THREE.Group;
  pitchNode: THREE.Group;
  barrel: THREE.Object3D;
  built: boolean;
  pop: number;
  yaw: number;
  pitch: number;
  wantYaw: number;
  wantPitch: number;
  recoil: number;
  lastShot: number;
}

interface Mark {
  st: FortStation;
  sprite: THREE.Sprite;
  key: string;
  baseY: number;
}

export class FortProps {
  private readonly scene: THREE.Scene;
  private readonly rally = new THREE.Group();
  private readonly rallyMat = new THREE.MeshBasicMaterial({ color: 0x75ffe0, transparent: true, opacity: .18,
    side: THREE.DoubleSide, depthWrite: false });
  // ворота
  private readonly gate = new THREE.Group();
  private readonly gateMat: THREE.MeshStandardMaterial;
  private readonly gateTex: THREE.CanvasTexture[] = [];
  private readonly debris = new THREE.Group();
  private gateLevel = -1;
  private gateUp = true;
  private gateShake = 0;
  private gateRise = 1;
  // кристалл
  private readonly crystal = new THREE.Group();
  private readonly gem: THREE.Mesh;
  private readonly gemMat: THREE.MeshStandardMaterial;
  private readonly core: THREE.Mesh;
  private readonly glow: THREE.Sprite;
  private readonly shards: THREE.Mesh[] = [];
  private readonly beamMat: THREE.MeshBasicMaterial;
  private crystalFrac = 1;
  private crystalFlash = 0;
  // краскомёты, колокол, лужи, таблички
  private readonly turrets: TurretVis[] = [];
  private readonly bell = new THREE.Group();
  private bellAngle = 0;
  private bellVel = 0;
  private readonly puddles: THREE.Mesh[] = [];
  private readonly puddleOn: boolean[] = [];
  private readonly puddlePop: number[] = [];
  private readonly marks: Mark[] = [];
  private readonly labelCache = new Map<string, THREE.CanvasTexture>();
  private time = 0;

  constructor(scene: THREE.Scene, map: FortMap) {
    this.scene = scene;
    // --- ворота: две плоскости (снаружи и со двора) с одной развёрткой по x — дыры сквозные
    for (let i = 0; i < 4; i++) this.gateTex.push(gateTexture(i));
    this.gateMat = new THREE.MeshStandardMaterial({ map: this.gateTex[0], alphaTest: 0.5, roughness: 0.85, side: THREE.DoubleSide });
    const w = GATE.x1 - GATE.x0;
    const h = GATE.h;
    const front = new THREE.PlaneGeometry(w, h);
    front.rotateY(Math.PI);
    const fuv = front.getAttribute('uv');
    for (let i = 0; i < fuv.count; i++) fuv.setX(i, 1 - fuv.getX(i));
    front.translate(0, h / 2, -0.15);
    const back = new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0.15);
    this.gate.add(new THREE.Mesh(front, this.gateMat), new THREE.Mesh(back, this.gateMat));
    // со двора — засов-брус поперёк створок, сверху — тёмная кромка
    const trim: THREE.BufferGeometry[] = [
      paint(new THREE.BoxGeometry(w + 0.3, 0.26, 0.2).translate(0, 1.45, 0.32), 0x5d3c22),
      paint(new THREE.BoxGeometry(w, 0.06, 0.3).translate(0, h - 0.03, 0), 0x3b2616),
      paint(new THREE.BoxGeometry(0.16, 0.5, 0.16).translate(-w / 2 - 0.05, 1.45, 0.32), 0x3b3a38),
      paint(new THREE.BoxGeometry(0.16, 0.5, 0.16).translate(w / 2 + 0.05, 1.45, 0.32), 0x3b3a38),
    ];
    const trimMesh = new THREE.Mesh(mergeColored(trim), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
    trimMesh.castShadow = true;
    this.gate.add(trimMesh);
    for (const m of this.gate.children) m.castShadow = true;
    this.gate.position.set((GATE.x0 + GATE.x1) / 2, 0, (GATE.face + GATE.z1) / 2);
    scene.add(this.gate);
    this.buildDebris();

    // --- кристалл
    this.gemMat = new THREE.MeshStandardMaterial({
      color: CYAN, emissive: 0x1aa6d6, emissiveIntensity: 0.9, roughness: 0.12, metalness: 0.05, flatShading: true, transparent: true, opacity: 0.93,
    });
    this.gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.62, 0).scale(1, 1.55, 1), this.gemMat);
    this.core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.3, 0).scale(1, 1.6, 1),
      new THREE.MeshBasicMaterial({ color: 0xd8fbff, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.glow = glowSprite(0x6fe6ff, 4.4, 0.45);
    this.crystal.add(this.gem, this.core, this.glow);
    const shardGeo = new THREE.OctahedronGeometry(0.13, 0).scale(1, 1.7, 1);
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(shardGeo, this.gemMat);
      this.shards.push(s);
      this.crystal.add(s);
    }
    this.crystal.position.set(CRYSTAL.x, CRYSTAL.y, CRYSTAL.z);
    scene.add(this.crystal);
    // луч в небо — видно из-за стен, куда бежать
    const beamGeo = new THREE.CylinderGeometry(0.12, 0.2, 36, 12, 8, true);
    const bpos = beamGeo.getAttribute('position');
    const bcol = new Float32Array(bpos.count * 4);
    for (let i = 0; i < bpos.count; i++) {
      // снизу проявляется (над кристаллом), кверху тает
      const k = (bpos.getY(i) + 18) / 36;
      bcol.set([1, 1, 1, Math.min(1, k * 6) * Math.pow(1 - k, 1.4)], i * 4);
    }
    beamGeo.setAttribute('color', new THREE.BufferAttribute(bcol, 4));
    this.beamMat = new THREE.MeshBasicMaterial({ color: 0x4fd8ff, vertexColors: true, transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const beam = new THREE.Mesh(beamGeo, this.beamMat);
    beam.position.set(CRYSTAL.x, CRYSTAL.y + 18.6, CRYSTAL.z);
    scene.add(beam);

    // The field is visual only: it mitigates structure damage, never blocks players or shots.
    const crystalShield = new THREE.Mesh(new THREE.SphereGeometry(2.2, 16, 10), this.rallyMat);
    crystalShield.position.set(CRYSTAL.x, CRYSTAL.y, CRYSTAL.z);
    const gateShield = new THREE.Mesh(new THREE.BoxGeometry(5.3, 3.2, .65), this.rallyMat);
    gateShield.position.set(0, 1.6, (GATE.face + GATE.z1) / 2);
    this.rally.add(crystalShield, gateShield);
    this.rally.name = 'fort-structure-shield';
    this.rally.visible = false;
    scene.add(this.rally);
    this.buildReturnSigns();
    this.buildTurrets();
    this.buildBell(map);
    this.buildJams();
    this.buildMarks(map);
  }

  setRally(active: boolean): void {
    this.rally.visible = active;
    this.rally.children[1].visible = this.gateUp;
  }

  private buildReturnSigns(): void {
    const texture = labelTexture('↑', 'НА СТЕНУ');
    const mat = new THREE.SpriteMaterial({ map: texture, depthWrite: false });
    for (const side of [-1, 1]) {
      const sign = new THREE.Sprite(mat);
      sign.name = 'fort-return-stairs';
      sign.position.set(side * 21.4, 2.3, 7.7);
      sign.scale.set(3.6, 1.35, 1);
      this.scene.add(sign);
      // Paired mint pennants make the new rescue approaches legible from the field.
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(.045, .045, 3.6, 6), new THREE.MeshStandardMaterial({color:0x665343}));
      pole.position.set(side * 23, 1.8, 7.2);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.4,.8), new THREE.MeshStandardMaterial({color:0x54bbab,side:THREE.DoubleSide}));
      flag.position.set(side * 23 + .7, 3.05, 7.2);
      this.scene.add(pole, flag);
    }
  }

  // ------------------------------------------------------------ постройка

  /** Обломки ворот: доски вразброс в проезде (видны, только когда ворота пали) */
  private buildDebris(): void {
    const rng = makeRng(3);
    const planks: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 9; i++) {
      const len = 0.8 + rng() * 1.6;
      const g = paint(new THREE.BoxGeometry(0.4, 0.07, len), new THREE.Color(0x8a5a34).multiplyScalar(0.8 + rng() * 0.35));
      g.rotateX((rng() - 0.5) * 0.3);
      planks.push(place(g, (rng() - 0.5) * 4.4, 0.05 + rng() * 0.12, (GATE.face + GATE.z1) / 2 + (rng() - 0.3) * 3.4, rng() * Math.PI));
    }
    planks.push(place(paint(new THREE.BoxGeometry(5.2, 0.22, 0.2), 0x5d3c22), 0.6, 0.12, GATE.z1 + 1.2, 0.35));
    const m = staticMesh(mergeColored(planks), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), true);
    this.debris.add(m);
    this.debris.visible = false;
    this.scene.add(this.debris);
  }

  /** Краскомёт: треножник, поворотная голова, ствол с бункером краски. Пока не куплен — пунктирный круг. */
  private buildTurrets(): void {
    const ringMat = new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, depthWrite: false, color: 0xfff1c8 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x7a5232, roughness: 0.85 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x51565c, roughness: 0.4, metalness: 0.6 });
    const paintMat = new THREE.MeshStandardMaterial({ color: 0xff8a1c, roughness: 0.35 });
    for (const t of TURRET_SPOTS) {
      const spot = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7).rotateX(-Math.PI / 2), ringMat);
      ring.position.y = 0.02;
      spot.add(ring);
      spot.position.set(t.x, t.y, t.z);
      this.scene.add(spot);

      const gun = new THREE.Group();
      gun.position.set(t.x, t.y, t.z);
      for (let k = 0; k < 3; k++) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.25, 6), woodMat);
        const a = (k / 3) * Math.PI * 2;
        leg.position.set(Math.cos(a) * 0.32, 0.55, Math.sin(a) * 0.32);
        leg.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3);
        gun.add(leg);
      }
      const yawNode = new THREE.Group();
      yawNode.position.y = TURRET_MUZZLE - 0.18;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.5), metal);
      yawNode.add(head);
      const pitchNode = new THREE.Group();
      pitchNode.position.y = 0.18;
      const barrel = new THREE.Group();
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 1.0, 12).rotateX(Math.PI / 2), metal);
      tube.position.z = -0.45;
      const ringM = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.035, 6, 14), paintMat);
      ringM.position.z = -0.95;
      const hopper = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), paintMat);
      hopper.position.set(0, 0.22, 0.12);
      barrel.add(tube, ringM, hopper);
      pitchNode.add(barrel);
      yawNode.add(pitchNode);
      gun.add(yawNode);
      gun.traverse((o) => (o.castShadow = true));
      gun.visible = false;
      this.scene.add(gun);
      this.turrets.push({ spot, gun, yawNode, pitchNode, barrel, built: false, pop: 0, yaw: 0, pitch: 0, wantYaw: 0, wantPitch: 0, recoil: 0, lastShot: -9 });
    }
  }

  /** Колокол на террасе: деревянная рама, бронзовый колокол с языком. */
  private buildBell(map: FortMap): void {
    const st = map.stations.find((s) => s.kind === 'bell');
    if (!st) return;
    const frame: THREE.BufferGeometry[] = [
      paint(new THREE.BoxGeometry(0.14, 2.1, 0.14).translate(-0.72, 1.05, 0), 0x6b4a2c),
      paint(new THREE.BoxGeometry(0.14, 2.1, 0.14).translate(0.72, 1.05, 0), 0x6b4a2c),
      paint(new THREE.BoxGeometry(1.8, 0.16, 0.18).translate(0, 2.12, 0), 0x5d3c22),
      paint(new THREE.BoxGeometry(0.5, 0.06, 0.5).translate(-0.72, 0.03, 0), 0x5d3c22),
      paint(new THREE.BoxGeometry(0.5, 0.06, 0.5).translate(0.72, 0.03, 0), 0x5d3c22),
    ];
    const f = staticMesh(mergeColored(frame), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), true);
    f.position.set(st.x, st.y, st.z);
    f.updateMatrix();
    this.scene.add(f);
    const prof = [[0.001, 0], [0.3, 0], [0.27, 0.06], [0.2, 0.2], [0.17, 0.36], [0.12, 0.44], [0.001, 0.47]].map(([r, y]) => new THREE.Vector2(r, y - 0.47));
    const bellMesh = new THREE.Mesh(new THREE.LatheGeometry(prof, 20), new THREE.MeshStandardMaterial({ color: 0xc99a3a, metalness: 0.7, roughness: 0.3, side: THREE.DoubleSide }));
    const clapper = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshStandardMaterial({ color: 0x3b3a38 }));
    clapper.position.y = -0.4;
    bellMesh.castShadow = true;
    this.bell.add(bellMesh, clapper);
    this.bell.position.set(st.x, st.y + 2.02, st.z);
    this.scene.add(this.bell);
  }

  /** Бочки варенья у жёлобов на северной стене и лужи на дороге под ними. */
  private buildJams(): void {
    const geos: THREE.BufferGeometry[] = [];
    for (const c of CHUTES) {
      geos.push(place(paint(new THREE.CylinderGeometry(0.34, 0.3, 0.8, 12), 0x7a4f2e), c.x + 0.6, WALL_H + 0.4, c.z + 0.5));
      geos.push(place(paint(new THREE.CylinderGeometry(0.31, 0.31, 0.04, 12), 0xb3122e), c.x + 0.6, WALL_H + 0.81, c.z + 0.5));
      geos.push(place(paint(new THREE.TorusGeometry(0.335, 0.025, 4, 14).rotateX(Math.PI / 2), 0x3b3a38), c.x + 0.6, WALL_H + 0.62, c.z + 0.5));
      // жёлоб через бруствер наружу
      const chute = paint(new THREE.BoxGeometry(0.42, 0.08, 2.0), 0x8a5a34);
      chute.rotateX(-0.32);
      geos.push(place(chute, c.x, WALL_H + 1.0, c.z - 1.0));
      geos.push(place(paint(new THREE.BoxGeometry(0.06, 0.16, 2.0).rotateX(-0.32), 0x6b4a2c), c.x - 0.21, WALL_H + 1.06, c.z - 1.0));
      geos.push(place(paint(new THREE.BoxGeometry(0.06, 0.16, 2.0).rotateX(-0.32), 0x6b4a2c), c.x + 0.21, WALL_H + 1.06, c.z - 1.0));
    }
    this.scene.add(staticMesh(mergeColored(geos), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), true));
    const tex = puddleTexture();
    for (const c of CHUTES) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(JAM_R * 2.2, JAM_R * 2.2).rotateX(-Math.PI / 2),
        new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.15, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
      );
      m.position.set(c.px, 0.03, c.pz);
      m.renderOrder = 2;
      m.visible = false;
      this.scene.add(m);
      this.puddles.push(m);
      this.puddleOn.push(false);
      this.puddlePop.push(0);
    }
  }

  /** Таблички над стойками: значок и цена (что именно — решает matchLabel у матча) */
  private buildMarks(map: FortMap): void {
    for (const st of map.stations) {
      // постоянного размера на экране (как ники желеек), вдали и вплотную — прячутся
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, sizeAttenuation: false }));
      const baseY = st.y + (st.kind === 'turret' ? 1.6 : st.kind === 'jam' ? 2.0 : st.kind === 'bell' ? 2.9 : 2.3);
      sprite.position.set(st.x, baseY, st.z);
      sprite.scale.set(LABEL_W, LABEL_H, 1);
      sprite.renderOrder = 6;
      sprite.visible = false;
      this.scene.add(sprite);
      this.marks.push({ st, sprite, key: '', baseY });
    }
  }

  // ------------------------------------------------------------ состояние с сервера

  /** Прочность ворот: уровень трещин; 0 — пали (обломки), снова больше 0 — встали. */
  setGate(hp: number): void {
    const up = hp > 0;
    if (up !== this.gateUp) {
      this.gateUp = up;
      this.gate.visible = up;
      this.debris.visible = !up;
      if (up) this.gateRise = 0;
    }
    const f = hp / GATE_HP;
    const level = f > 0.75 ? 0 : f > 0.5 ? 1 : f > 0.25 ? 2 : 3;
    if (level !== this.gateLevel) {
      this.gateLevel = level;
      this.gateMat.map = this.gateTex[level];
      this.gateMat.needsUpdate = true;
    }
  }

  /** Удар по воротам: створки вздрагивают */
  shakeGate(power = 1): void {
    this.gateShake = Math.min(1, this.gateShake + 0.5 * power);
  }

  setCrystal(hp: number): void {
    this.crystalFrac = clamp(hp / CRYSTAL_HP, 0, 1);
  }

  flashCrystal(): void {
    this.crystalFlash = 1;
  }

  /** Краскомёты: бит на место */
  setTurrets(bits: number): void {
    this.turrets.forEach((t, i) => {
      const on = (bits & (1 << i)) !== 0;
      if (on === t.built) return;
      t.built = on;
      t.gun.visible = on;
      t.spot.visible = !on;
      if (on) t.pop = 1;
    });
  }

  /** Краскомёт i выстрелил в (x, y, z): поворот к цели и отдача; в out — где дуло. */
  turretShot(i: number, x: number, y: number, z: number, out: THREE.Vector3): boolean {
    const t = this.turrets[i];
    if (!t) return false;
    const s = TURRET_SPOTS[i];
    const oy = s.y + TURRET_MUZZLE;
    const dx = x - s.x;
    const dy = y - oy;
    const dz = z - s.z;
    t.wantYaw = Math.atan2(-dx, -dz);
    t.wantPitch = Math.atan2(dy, Math.hypot(dx, dz));
    // по быстрой цели не догонит плавно — встаёт сразу
    t.yaw = t.wantYaw;
    t.pitch = t.wantPitch;
    t.recoil = 1;
    t.lastShot = this.time;
    const len = Math.hypot(dx, dy, dz) || 1;
    out.set(s.x + (dx / len) * 1.0, oy + (dy / len) * 1.0, s.z + (dz / len) * 1.0);
    return t.built;
  }

  /** Лужи: бит на жёлоб */
  setJams(bits: number): void {
    for (let i = 0; i < this.puddles.length; i++) {
      const on = (bits & (1 << i)) !== 0;
      if (on === this.puddleOn[i]) continue;
      this.puddleOn[i] = on;
      this.puddles[i].visible = on;
      if (on) this.puddlePop[i] = 1;
    }
  }

  ringBell(): void {
    this.bellVel += 4.2;
  }

  /** Табличка над стойкой: значок и текст; пустой значок — спрятать. */
  setMark(id: number, icon: string, text: string): void {
    const m = this.marks[id];
    if (!m) return;
    const key = icon ? `${icon}|${text}` : '';
    if (key === m.key) return;
    m.key = key;
    if (!icon) {
      m.sprite.visible = false;
      return;
    }
    let t = this.labelCache.get(key);
    if (!t) {
      t = labelTexture(icon, text);
      this.labelCache.set(key, t);
    }
    m.sprite.material.map = t;
    m.sprite.material.needsUpdate = true;
    m.sprite.scale.set(text ? LABEL_W : LABEL_H * 1.08, LABEL_H, 1);
    m.sprite.visible = true;
  }

  // ------------------------------------------------------------ кадр

  update(dt: number, t: number, camPos: THREE.Vector3): void {
    this.time = t;
    if (this.rally.visible) this.rallyMat.opacity = .15 + Math.sin(t * 3) * .025;
    // ворота: дрожь от ударов, «вырастают» после постройки
    this.gateShake = Math.max(0, this.gateShake - dt * 3.5);
    const sh = this.gateShake * this.gateShake;
    this.gate.position.x = (GATE.x0 + GATE.x1) / 2 + Math.sin(t * 61) * 0.035 * sh;
    this.gate.rotation.x = Math.sin(t * 47) * 0.02 * sh;
    if (this.gateRise < 1) {
      this.gateRise = Math.min(1, this.gateRise + dt * 2.2);
      const k = this.gateRise;
      const back = 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);
      this.gate.scale.set(1, Math.max(0.05, back), 1);
    }

    // кристалл: крутится и парит; цвет по прочности, мало — мигает красным; вспышка от удара
    const f = this.crystalFrac;
    this.crystalFlash = Math.max(0, this.crystalFlash - dt * 5);
    const low = f < 0.3 ? 0.5 + 0.5 * Math.sin(t * (f < 0.15 ? 14 : 8)) : 0;
    _c.copy(RED).lerp(CYAN, THREE.MathUtils.smoothstep(f, 0.12, 0.7));
    this.gemMat.color.copy(_c).lerp(WHITE, this.crystalFlash * 0.7);
    this.gemMat.emissive.copy(_c).multiplyScalar(0.55 + low * 0.5 + this.crystalFlash * 0.8);
    this.glow.material.color.copy(_c);
    this.glow.material.opacity = 0.35 + low * 0.25 + this.crystalFlash * 0.4;
    this.beamMat.color.copy(_c);
    this.gem.rotation.y = t * 0.6;
    this.core.rotation.y = -t * 0.9;
    const bob = Math.sin(t * 1.6) * 0.08;
    this.crystal.position.y = CRYSTAL.y + bob;
    const s = 1 + this.crystalFlash * 0.12;
    this.gem.scale.setScalar(s);
    this.shards.forEach((m, i) => {
      const a = t * (0.9 + i * 0.15) + (i * Math.PI) / 2;
      const r = 0.95 + Math.sin(t * 1.3 + i) * 0.08;
      m.position.set(Math.cos(a) * r, Math.sin(t * 2 + i * 1.7) * 0.35, Math.sin(a) * r);
      m.rotation.y = t * 2 + i;
      m.visible = f > i * 0.22;
    });

    // краскомёты: следят за целью, отдача, без дела — осматриваются
    for (const tr of this.turrets) {
      if (!tr.built) continue;
      tr.pop = Math.max(0, tr.pop - dt * 2.5);
      tr.gun.scale.setScalar(1 + Math.sin(tr.pop * Math.PI) * 0.3);
      if (t - tr.lastShot > 1.6) {
        tr.wantYaw = Math.sin(t * 0.4 + tr.spot.position.x) * 0.9;
        tr.wantPitch = -0.12;
      }
      tr.yaw = dampAngle(tr.yaw, tr.wantYaw, 6, dt);
      tr.pitch = damp(tr.pitch, tr.wantPitch, 6, dt);
      tr.recoil = Math.max(0, tr.recoil - dt * 6);
      tr.yawNode.rotation.y = tr.yaw;
      tr.pitchNode.rotation.x = tr.pitch;
      tr.barrel.position.z = tr.recoil * 0.14;
    }

    // колокол качается и затихает
    this.bellVel += (-this.bellAngle * 38 - this.bellVel * 1.6) * dt;
    this.bellAngle += this.bellVel * dt;
    this.bell.rotation.x = this.bellAngle * 0.35;

    // лужи «расплёскиваются» при появлении
    for (let i = 0; i < this.puddles.length; i++) {
      if (!this.puddleOn[i]) continue;
      this.puddlePop[i] = Math.max(0, this.puddlePop[i] - dt * 2.5);
      const k = 1 - this.puddlePop[i];
      this.puddles[i].scale.setScalar(0.3 + 0.7 * (1 - Math.pow(1 - k, 3)));
    }

    // таблички: покачиваются, вдали прячутся
    for (const m of this.marks) {
      if (!m.key) continue;
      m.sprite.position.y = m.baseY + Math.sin(t * 2 + m.st.id) * 0.06;
      const d = _v.set(m.st.x, m.baseY, m.st.z).distanceTo(camPos);
      m.sprite.visible = d < 42 && d > 2.2;
    }
  }
}

function dampAngle(a: number, b: number, k: number, dt: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-k * dt));
}

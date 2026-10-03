// Живое в крепости: кристалл над постаментом (цвет и мерцание по прочности, вспышка от удара, луч в небо),
// колокол на террасе, таблички над стойками, указатели к лестницам с луга, щит над воротами и кристаллом. Ворота
// (створки, повреждения, падение, прорыв) — в castle.ts; башни, лестницы и прилавок — арсенал (arsenal3d.ts).
// Эффекты и звук — у матча, здесь только меши и их анимация.
import * as THREE from 'three';
import { CRYSTAL_HP } from '../../shared/fort.ts';
import { LADDERS } from '../../shared/fortladder.ts';
import { CRYSTAL, GATE, type FortMap, type FortStation } from '../../shared/fortmap.ts';
import { clamp } from '../../shared/math.ts';
import { glowSprite, mergeColored, paint, staticMesh } from '../render/kit.ts';
import { labelTexture } from './textures.ts';

/** Табличка над стойкой: размер на экране (доля высоты кадра) */
const LABEL_H = 0.042;
const LABEL_W = LABEL_H * (256 / 96);
const CYAN = new THREE.Color(0x5fe3ff);
const RED = new THREE.Color(0xff5a4a);
const WHITE = new THREE.Color(0xffffff);
const _c = new THREE.Color();
const _v = new THREE.Vector3();

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
  // ворота стоят (для щита над ними; сами створки — castle.ts)
  private gateUp = true;
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
  // колокол, таблички
  private readonly bell = new THREE.Group();
  private bellAngle = 0;
  private bellVel = 0;
  private readonly marks: Mark[] = [];
  private readonly labelCache = new Map<string, THREE.CanvasTexture>();


  constructor(scene: THREE.Scene, map: FortMap) {
    this.scene = scene;
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
    this.buildBell(map);
    this.buildMarks(map);
  }

  setRally(active: boolean): void {
    this.rally.visible = active;
    this.rally.children[1].visible = this.gateUp;
  }

  /** С луга обратно в крепость: над каждой наружной лестницей — табличка «↑ НА СТЕНУ» и мятный вымпел рядом */
  private buildReturnSigns(): void {
    const texture = labelTexture('↑', 'НА СТЕНУ');
    const mat = new THREE.SpriteMaterial({ map: texture, depthWrite: false });
    for (const l of LADDERS) {
      if (l.name !== 'west-out' && l.name !== 'east-out') continue;
      const sign = new THREE.Sprite(mat);
      sign.name = 'fort-return-ladder';
      sign.position.set(l.x + l.nx * 1.6, 5.4, l.z);
      sign.scale.set(3.2, 1.2, 1);
      this.scene.add(sign);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(.045, .045, 3.6, 6), new THREE.MeshStandardMaterial({ color: 0x665343 }));
      pole.position.set(l.x + l.nx * 2.2, 1.8, l.z + 1.6);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.4, .8), new THREE.MeshStandardMaterial({ color: 0x54bbab, side: THREE.DoubleSide }));
      flag.position.set(l.x + l.nx * 2.2, 3.05, l.z + 2.3);
      flag.rotation.y = Math.PI / 2;
      this.scene.add(pole, flag);
    }
  }

  // ------------------------------------------------------------ постройка

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

  /** Таблички над стойками: значок и цена (что именно — решает matchLabel у матча) */
  private buildMarks(map: FortMap): void {
    for (const st of map.stations) {
      // постоянного размера на экране (как ники желеек), вдали и вплотную — прячутся
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, sizeAttenuation: false }));
      // над башней — выше её навершия и вымпела (башни client/fort/turrets — до 2,9 м)
      const baseY = st.y + (st.kind === 'tower' ? 3.2 : st.kind === 'shop' ? 3.6 : st.kind === 'bell' ? 2.9 : 2.3);
      sprite.position.set(st.x, baseY, st.z);
      sprite.scale.set(LABEL_W, LABEL_H, 1);
      sprite.renderOrder = 6;
      sprite.visible = false;
      this.scene.add(sprite);
      this.marks.push({ st, sprite, key: '', baseY });
    }
  }

  // ------------------------------------------------------------ состояние с сервера

  /** Ворота стоят или пали (щит над воротами виден, только пока стоят). Сами створки — castle.ts. */
  setGate(hp: number): void {
    this.gateUp = hp > 0;
  }

  setCrystal(hp: number, max = CRYSTAL_HP): void {
    this.crystalFrac = clamp(hp / max, 0, 1);
  }

  flashCrystal(): void {
    this.crystalFlash = 1;
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
    if (this.rally.visible) this.rallyMat.opacity = .15 + Math.sin(t * 3) * .025;

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

    // колокол качается и затихает
    this.bellVel += (-this.bellAngle * 38 - this.bellVel * 1.6) * dt;
    this.bellAngle += this.bellVel * dt;
    this.bell.rotation.x = this.bellAngle * 0.35;

    // таблички: покачиваются, вдали прячутся
    for (const m of this.marks) {
      if (!m.key) continue;
      m.sprite.position.y = m.baseY + Math.sin(t * 2 + m.st.id) * 0.06;
      const d = _v.set(m.st.x, m.baseY, m.st.z).distanceTo(camPos);
      // места башен — восемь штук по стенам: табличка только вблизи, иначе со двора — частокол «БАШНЯ»
      m.sprite.visible = d < (m.st.kind === 'tower' ? 15 : 42) && d > 2.2;
    }
  }
}

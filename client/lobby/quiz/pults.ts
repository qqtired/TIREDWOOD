// «Ракушка», часть 2: пульты «Своей игры» в люках сцены (docs/quiz/tech.md §19; venue-data.json hatch, pultPlate).
// Занятые пульты выезжают за hatch.liftSec (ease-in-out), лампа-кнопка поднимается последней и горит у отвечающего;
// таблички счёта — один атлас на меше plate_faces (рисует ui/plates.ts), квады едут вместе со своими пультами и в люке
// уходят под настил. Свободные пульты стоят внизу, крышка вровень с досками. Всё — инстансы общих материалов plaza3:
// тело — глянец, лампа — свечение с цветом экземпляра (та же программа, что у лампочек ракушки).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { QzBoard } from '../../../shared/quiz/types.ts';
import { QUIZ_VENUE } from '../../../shared/quiz/venue.ts';
import { worldGeometry } from '../plaza3/models.ts';
import { canvasMesh, canvasTex, ease, familyOf, type CanvasTex, type FamilyMats } from './kit3d.ts';
import { pultsUp } from './places.ts';
import { paintPlates } from './uikit.ts';

/** Лампа поднимается в последней трети подъёма (и опускается первой) */
const LAMP_FROM = 0.7;
const LAMP_OFF = new THREE.Color(0xa89a80);
const LAMP_TURN = new THREE.Color(0xffd27a).multiplyScalar(0.7);
const LAMP_OPEN = new THREE.Color(0xffe3a6);
const LAMP_LIT = new THREE.Color(0xffc23a).multiplyScalar(2.2);

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _one = new THREE.Vector3(1, 1, 1);
const _up = new THREE.Vector3(0, 1, 0);

export class QuizPults {
  private readonly d = QUIZ_VENUE.data;
  private readonly body: THREE.InstancedMesh | null = null;
  private readonly lamp: THREE.InstancedMesh | null = null;
  private readonly plates: THREE.Mesh | null = null;
  private readonly atlas: CanvasTex | null = null;
  /** Вершины табличек: чей пульт и высота в верхнем положении */
  private plateOwner: Int8Array = new Int8Array(0);
  private plateY: Float32Array = new Float32Array(0);
  /** Подъём каждого пульта 0…1 и куда едет */
  private readonly k: number[];
  private readonly want: boolean[];
  private readonly color: THREE.Color[];
  private moving = true;
  tris = 0;

  constructor(root: THREE.Object3D, pult: THREE.Group, venue: THREE.Group | null, mats: FamilyMats) {
    const n = this.d.pults.length;
    this.k = new Array<number>(n).fill(0);
    this.want = new Array<boolean>(n).fill(false);
    this.color = Array.from({ length: n }, () => LAMP_OFF.clone());
    pult.updateMatrixWorld(true);
    const bodyGeos: THREE.BufferGeometry[] = [];
    let lampGeo: THREE.BufferGeometry | null = null;
    let bodyFam: 'matte' | 'gloss' | 'glow' = 'gloss';
    pult.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const g = worldGeometry(m.geometry, m.matrixWorld);
      if (m.name.startsWith('pult_lamp')) lampGeo = g;
      else {
        bodyGeos.push(g);
        bodyFam = familyOf(Array.isArray(m.material) ? m.material[0] : m.material);
      }
    });
    const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, name: string): THREE.InstancedMesh => {
      const im = new THREE.InstancedMesh(geo, mat, n);
      im.name = name;
      // без тени: тень инстансов — своя программа глубины; p3keep — не гаснет по дальности
      im.castShadow = false;
      im.receiveShadow = true;
      im.userData.p3keep = true;
      im.frustumCulled = false;
      root.add(im);
      this.tris += ((geo.index ? geo.index.count : geo.getAttribute('position').count) / 3) * n;
      return im;
    };
    if (bodyGeos.length) this.body = inst(bodyGeos.length > 1 ? (mergeGeometries(bodyGeos, false) ?? bodyGeos[0]) : bodyGeos[0], mats[bodyFam], 'quiz-pults');
    if (lampGeo) {
      this.lamp = inst(lampGeo, mats.glow, 'quiz-pult-lamps');
      for (let i = 0; i < n; i++) this.lamp.setColorAt(i, LAMP_OFF);
    }
    // таблички: квады plate_faces в верхнем положении пультов; вершина — к ближайшему пульту
    const src = venue?.getObjectByName('plate_faces') as THREE.Mesh | undefined;
    if (src?.isMesh) {
      // с UV атласа (worldGeometry plaza3 переносит только позицию, нормаль и цвет)
      const geo = src.geometry.clone().applyMatrix4(src.matrixWorld);
      const pos = geo.getAttribute('position') as THREE.BufferAttribute;
      this.plateOwner = new Int8Array(pos.count);
      this.plateY = new Float32Array(pos.count);
      for (let v = 0; v < pos.count; v++) {
        let best = 0, bd = Infinity;
        this.d.pults.forEach((p, i) => {
          const dd = Math.hypot(pos.getX(v) - p.x, pos.getZ(v) - p.z);
          if (dd < bd) { bd = dd; best = i; }
        });
        this.plateOwner[v] = best;
        this.plateY[v] = pos.getY(v);
      }
      const t = canvasTex(this.d.pultPlate?.atlas?.w ?? 1024, this.d.pultPlate?.atlas?.h ?? 768);
      this.atlas = t;
      paintPlates(t.ctx, null, 0, 0);
      this.plates = canvasMesh(geo, t, 'quiz-plates');
      this.plates.frustumCulled = false;
      root.add(this.plates);
      this.tris += pos.count / 2;
    }
    this.place();
  }

  /** Снимок: какие пульты наверху (игроки «Своей игры»), лампы, таблички */
  set(b: QzBoard | null, mySlot: number, now: number): void {
    const jp = b?.phase === 'game' && b.mode === 'jeopardy' ? (b.jp ?? null) : null;
    const up = pultsUp(b);
    this.d.pults.forEach((_, i) => {
      const p = jp?.players.find((x) => x.pult === i);
      this.want[i] = up[i];
      let c = LAMP_OFF;
      if (p && jp) {
        if (jp.buzz?.slot === p.slot) c = LAMP_LIT;
        else if (jp.step === 'buzz' && !jp.out.includes(p.slot) && p.away <= now) c = LAMP_OPEN;
        else if (jp.turn === p.slot) c = LAMP_TURN;
      }
      this.color[i].copy(c);
    });
    if (this.lamp?.instanceColor) {
      this.color.forEach((c, i) => this.lamp!.setColorAt(i, c));
      this.lamp.instanceColor.needsUpdate = true;
    }
    if (this.atlas) {
      paintPlates(this.atlas.ctx, b, now, mySlot);
      this.atlas.tex.needsUpdate = true;
    }
    this.moving = true;
  }

  update(dt: number): void {
    if (!this.moving) return;
    const step = dt / Math.max(0.1, this.d.hatch?.liftSec ?? 1);
    let moving = false;
    for (let i = 0; i < this.k.length; i++) {
      const to = this.want[i] ? 1 : 0;
      if (this.k[i] !== to) {
        this.k[i] = to > this.k[i] ? Math.min(1, this.k[i] + step) : Math.max(0, this.k[i] - step);
        moving = true;
      }
    }
    this.place();
    this.moving = moving;
  }

  /** Подняты ли (или едут) пульты — для отладки и снимков */
  get raised(): number[] {
    return this.k.map((k) => Math.round(k * 100) / 100);
  }

  private place(): void {
    const ps = this.d.pults;
    let anyUp = false;
    ps.forEach((p, i) => {
      const k = ease(this.k[i]);
      const y = p.down + (p.up - p.down) * k;
      _m.compose(_p.set(p.x, y, p.z), _q.setFromAxisAngle(_up, p.yaw), _one);
      this.body?.setMatrixAt(i, _m);
      const lk = ease((this.k[i] - LAMP_FROM) / (1 - LAMP_FROM));
      _m.compose(_p.set(p.x, y - p.lampDrop * (1 - lk), p.z), _q, _one);
      this.lamp?.setMatrixAt(i, _m);
      if (this.k[i] > 0) anyUp = true;
    });
    if (this.body) this.body.instanceMatrix.needsUpdate = true;
    if (this.lamp) {
      this.lamp.instanceMatrix.needsUpdate = true;
      this.lamp.visible = anyUp;
    }
    if (this.plates) {
      const pos = this.plates.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let v = 0; v < pos.count; v++) {
        const p = ps[this.plateOwner[v]];
        const y = p.down + (p.up - p.down) * ease(this.k[this.plateOwner[v]]);
        pos.setY(v, this.plateY[v] - (p.up - y));
      }
      pos.needsUpdate = true;
      this.plates.visible = anyUp;
    }
  }
}


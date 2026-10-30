// «Ракушка», часть 2: пульты «Своей игры» в люках сцены (docs/quiz/tech.md §19; venue-data.json hatch, pultPlate).
// Занятые пульты выезжают за hatch.liftSec (ease-in-out), лампа-кнопка поднимается последней и горит у отвечающего;
// таблички счёта — один атлас на меше plate_faces (рисует ui/plates.ts), квады едут вместе со своими пультами и в люке
// уходят под настил. Свободные пульты стоят внизу, крышка вровень с досками. Всё — инстансы общих материалов plaza3:
// тело — глянец, лампа — свечение с цветом экземпляра (та же программа, что у лампочек ракушки).
// «Ракушка» 1.1, B3: перед открытием кнопок (jp.openAt) вокруг лампы каждого поднятого пульта — кольцо из 16 огоньков:
// гаснут по одному до момента открытия, потом зелёная вспышка «можно жать». Один InstancedMesh того же свечения (новой
// программы нет), рисуется только пока идёт отсчёт или вспышка.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { QzBoard, QzJpBoard } from '../../../shared/quiz/types.ts';
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
/** B3: кольцо-отсчёт — огоньков на пульте, зазор от лампы (м), вспышка «можно жать» (с); цвета — золото и зелёный кита */
const RING_SEG = 16;
const RING_GAP = 0.05;
const RING_FLASH_S = 0.7;
const RING_ON = new THREE.Color(0xffcd4a).multiplyScalar(1.5);
const RING_OFF = new THREE.Color(0x4a3a22).multiplyScalar(0.7);
const RING_GO = new THREE.Color(0x56c07d);
const _c = new THREE.Color();
const _mr = new THREE.Matrix4();
const _ql = new THREE.Quaternion();

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _one = new THREE.Vector3(1, 1, 1);
const ZERO = new THREE.Vector3(0, 0, 0);
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
  /** B3: кольцо вокруг лампы — центр и верх лампы в осях пульта, радиус; снимок «Своей игры» для отсчёта */
  private readonly ring: THREE.InstancedMesh | null = null;
  private ringAt = { x: 0, y: 0, z: 0, r: 0.08 };
  private jp: QzJpBoard | null = null;
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
      // кольцо: огонёк — короткий брусок по касательной, белый цвет вершин (цвет — у экземпляра, как у лампочек)
      const bb = new THREE.Box3().setFromBufferAttribute((lampGeo as THREE.BufferGeometry).getAttribute('position') as THREE.BufferAttribute);
      const r = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2 + RING_GAP;
      // у основания лампы, вокруг купола (сверху кольцо висело бы над кнопкой «короной»)
      this.ringAt = { x: (bb.min.x + bb.max.x) / 2, y: bb.min.y + 0.02, z: (bb.min.z + bb.max.z) / 2, r };
      const seg = new THREE.BoxGeometry(((2 * Math.PI * r) / RING_SEG) * 0.66, 0.03, 0.045);
      seg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(seg.getAttribute('position').count * 3).fill(1), 3));
      const ring = new THREE.InstancedMesh(seg, mats.glow, n * RING_SEG);
      ring.name = 'quiz-pult-ring';
      ring.castShadow = ring.receiveShadow = false;
      ring.userData.p3keep = true;
      ring.frustumCulled = false;
      ring.visible = false;
      for (let i = 0; i < n * RING_SEG; i++) ring.setColorAt(i, RING_OFF);
      root.add(ring);
      this.ring = ring;
      this.tris += 12 * n * RING_SEG;
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
    this.jp = jp;
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

  /** now — часы сервера (кольцо-отсчёт до jp.openAt) */
  update(dt: number, now = Date.now()): void {
    this.updateRing(now);
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

  /** B3: отсчёт до открытия кнопок — огоньки гаснут по одному; открылись — зелёная вспышка; иначе кольца нет */
  private updateRing(now: number): void {
    const ring = this.ring, jp = this.jp;
    if (!ring || !ring.instanceColor) return;
    const open = jp?.openAt ?? 0;
    const counting = !!jp && jp.step === 'read' && open > now;
    const flash = !!jp && open > 0 && open <= now && now - open < RING_FLASH_S * 1000 && (jp.step === 'buzz' || jp.step === 'answer');
    if (!counting && !flash) {
      ring.visible = false;
      return;
    }
    const frac = counting ? Math.max(0, Math.min(1, (open - now) / Math.max(1, jp!.total))) : 0;
    const lit = Math.ceil(frac * RING_SEG);
    const pulse = flash ? 1.3 + 0.9 * Math.abs(Math.sin(((now - open) / 1000) * Math.PI * 5)) : 0;
    const a = this.ringAt, ps = this.d.pults;
    let any = false;
    ps.forEach((p, i) => {
      const pl = jp!.players.find((x) => x.pult === i);
      const show = !!pl && this.k[i] > 0.95 && !jp!.out.includes(pl.slot) && pl.away <= now;
      const y = p.down + (p.up - p.down) * ease(this.k[i]);
      _m.compose(_p.set(p.x, y, p.z), _q.setFromAxisAngle(_up, p.yaw), _one);
      for (let s = 0; s < RING_SEG; s++) {
        const ang = (s / RING_SEG) * Math.PI * 2;
        _mr.compose(_p.set(a.x + Math.cos(ang) * a.r, a.y, a.z + Math.sin(ang) * a.r), _ql.setFromAxisAngle(_up, -ang - Math.PI / 2), show ? _one : ZERO);
        ring.setMatrixAt(i * RING_SEG + s, _mr.premultiply(_m));
        // гаснут по часовой с «двенадцати»: горят первые lit
        ring.setColorAt(i * RING_SEG + s, flash ? _c.copy(RING_GO).multiplyScalar(pulse) : s < lit ? RING_ON : RING_OFF);
      }
      if (show) any = true;
    });
    ring.instanceMatrix.needsUpdate = true;
    ring.instanceColor.needsUpdate = true;
    ring.visible = any;
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


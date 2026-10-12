// «Рыбная витрина» (pav_fishshowcase.glb, флаг PLAZA3): три крупнейшие рыбы дня стоят головой вверх в едином масштабе
// абсолютного веса на стойках внутри прежнего прилавка; под каждой — крупная эмалевая
// табличка «вес · рыбак». Строит FishPodium3D (client/lobby/fishpodium.ts), когда модель витрины встала: тогда старый
// пьедестал на пять мест не показывается, 4–5-е места остаются только в данных.
import * as THREE from 'three';
import { FISH, fmtWeight } from '../../../shared/fishing.ts';
import type { FishPodiumCatch } from '../../../shared/messages.ts';
import { makeFish3D } from '../fishart.ts';
import type { ShowcaseMount } from './mounts.ts';
import { makeShowcaseTrophy, disposeShowcaseTrophy } from './showcase-trophy.ts';

const FONT = 'Rubik, system-ui, sans-serif';
const TAG_W = 768;
const TAG_H = 284;

interface Tag {
  mesh: THREE.Mesh;
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
}

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();

export class ShowcaseFish {
  private readonly root = new THREE.Group();
  private readonly m: ShowcaseMount;
  private readonly lengthOf: (sp: number, g: number) => number;
  private readonly fish: Array<THREE.Object3D | null> = [null, null, null];
  private readonly tags: Tag[] = [];
  private key = '';

  /** parent — группа пьедестала (её видимость включает рыбалка); lengthOf — длина трофея на стенде, м */
  constructor(parent: THREE.Group, m: ShowcaseMount, lengthOf: (sp: number, g: number) => number) {
    this.m = m;
    this.lengthOf = lengthOf;
    this.root.name = 'showcase-fish';
    this.root.userData.p3keep = true;
    for (const [rank, t] of m.tags.entries()) {
      t.decompose(_p, _q, _s);
      const c = document.createElement('canvas');
      c.width = TAG_W;
      c.height = TAG_H;
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2),
        new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
      );
      mesh.position.copy(_p);
      mesh.name = `showcase-tag-${rank + 1}`;
      mesh.quaternion.copy(_q);
      mesh.scale.set(_s.x, _s.y, 1);
      this.root.add(mesh);
      this.tags.push({ mesh, ctx: c.getContext('2d')!, tex });
    }
    // мир витрины — в мировых осях: группа пьедестала встаёт в начало координат, старые части прячутся
    parent.position.set(0, 0, 0);
    parent.rotation.set(0, 0, 0);
    for (const ch of parent.children) ch.visible = false;
    parent.add(this.root);
  }

  set(rows: readonly FishPodiumCatch[]): void {
    const key = JSON.stringify(rows.slice(0, 3));
    if (key === this.key) return;
    this.key = key;
    for (let i = 0; i < 3; i++) {
      const old = this.fish[i];
      if (old) { this.root.remove(old); disposeShowcaseTrophy(old); }
      this.fish[i] = null;
      const row = rows[i];
      const spot = this.m.fish[i];
      if (row && FISH[row.sp] && spot) {
        const trophy = this.place(row, spot);
        trophy.name = `showcase-trophy-${i + 1}`;
        this.fish[i] = trophy;
      }
      if (this.tags[i]) this.drawTag(this.tags[i], row && FISH[row.sp] ? row : null, i);
    }
  }

  /** V2: голова вверх, хвост на опоре. Старые GLB сохраняют прежнюю горизонтальную постановку. */
  private place(row: FishPodiumCatch, spot: ShowcaseMount['fish'][number]): THREE.Object3D {
    if (spot.pose === 'upright') {
      const holder = makeShowcaseTrophy(row, spot, this.lengthOf);
      this.root.add(holder);
      return holder;
    }
    const model = makeFish3D(row.sp, row.g);
    const half = model.userData.half as THREE.Vector3;
    const want = Math.min(this.lengthOf(row.sp, row.g), spot.len * 0.96);
    let k = want / Math.max(0.01, half.x * 2);
    if (half.y * 2 * k > spot.maxH) k = spot.maxH / Math.max(0.01, half.y * 2);
    model.scale.multiplyScalar(k);
    const holder = new THREE.Group();
    spot.matrix.decompose(holder.position, holder.quaternion, _s);
    // голова — по head места (у 3-го места наружу вправо)
    if (spot.head < 0) model.rotation.y = Math.PI;
    model.position.y = half.y * k;
    holder.add(model);
    this.root.add(holder);
    return holder;
  }

  private drawTag(t: Tag, row: FishPodiumCatch | null, rank: number): void {
    const c = t.ctx;
    c.fillStyle = '#13675f';
    c.fillRect(0, 0, TAG_W, TAG_H);
    c.strokeStyle = '#f3e6c9';
    c.lineWidth = 10;
    c.strokeRect(9, 9, TAG_W - 18, TAG_H - 18);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#ffcd4a';
    if (!row) {
      fit(c, `${rank + 1} место · ждёт улова`, 66, 900);
      c.fillText(`${rank + 1} место · ждёт улова`, TAG_W / 2, TAG_H / 2);
    } else {
      const w = `${rank + 1} · ${fmtWeight(row.g)}`;
      fit(c, w, 110, 900);
      c.fillText(w, TAG_W / 2, TAG_H * 0.36);
      c.fillStyle = '#fff6e6';
      fit(c, row.nick, 70, 700);
      c.fillText(row.nick, TAG_W / 2, TAG_H * 0.74);
    }
    t.tex.needsUpdate = true;
  }
}

function fit(c: CanvasRenderingContext2D, text: string, size: number, weight: number): void {
  c.font = `${weight} ${size}px ${FONT}`;
  const w = c.measureText(text).width;
  const max = TAG_W - 44;
  if (w > max) c.font = `${weight} ${Math.max(18, Math.floor((size * max) / w))}px ${FONT}`;
}

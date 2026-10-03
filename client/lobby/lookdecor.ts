// Наполнение нового вида набережной (look v2): как на концепте — кипарисы и круглые деревья (в закутках, за домами
// на севере и за кафе на востоке), терракотовые горшки с цветами у стен, корзины с цветами на фонарях, кайма мозаики
// вокруг розы ветров и указатель «Пляж / Порт / Город». Животные вынесены в critters.ts.
// Только картинка: столкновений нет, всё стоит по краям, у стен и за оградой, куда не ходят; статуя и её окружение
// не тронуты. Одинаковое склеено: статика — один меш, кроны (качает ветер) — второй.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Deco } from '../../shared/maps/types.ts';
import { makeRng } from '../../shared/math.ts';
import { paint, place, staticMesh } from '../render/kit.ts';
import { swayAttr, windSway } from './decor.ts';
import type { Contact } from './lookbake.ts';
import { SIGN_ATLAS, SIGN_ROWS, lookRingTexture, lookSignpostTexture } from './looktex.ts';

type Wet = (m: THREE.MeshStandardMaterial) => THREE.MeshStandardMaterial;

/** Уровень улицы за площадью (на 0,6 м ниже настила), как в world.ts */
const STREET_Y = -0.6;
/** Роза ветров (decor.ts) и кайма вокруг неё: от края розы до внешнего радиуса */
const MOSAIC = { x: 0, z: 3.6, r: 3 };
const RING_OUT = 4.5;
/** Указатель у воды, за кнехтом (x 20): вплотную к столбу не подойти; доски — вдоль края, лицом к площади */
const SIGNPOST = { x: 20, z: 21.56 };

const POT = 0xc0643c;
const POT_DARK = 0x9a4a2c;
const SOIL = 0x4a3424;
const LEAVES = [0x4f9a3a, 0x5fae42, 0x3f8a36, 0x6ab048];
const FLOWERS = [0xe8403a, 0xf27aa8, 0xf6f1e6, 0xf7c840, 0xb070e0, 0xff7a3c, 0xff9ab8];
/** Цветы в корзинах на фонарях: петунии и герань */
const BASKET = [0xf05a9a, 0xe8403a, 0xff7ab8, 0xb070e0, 0xff7a3c];
const CYPRESS = [0x2f5a2c, 0x35632f, 0x2a5230];
const CROWN = [0x5a9e3c, 0x62a83c, 0x6cb444, 0x4f9236];

/** Горшки у стен: x, z, размер, что растёт (куст в цветах, шар-деревце, цветы) */
const POTS: ReadonlyArray<readonly [number, number, number, 'bush' | 'ball' | 'bloom']> = [
  // склад — по бокам ворот и по углам
  [-8.45, -15.55, 1.1, 'ball'],
  [-3.75, -15.55, 0.9, 'bloom'],
  [3.75, -15.55, 0.9, 'bloom'],
  [8.45, -15.55, 1.1, 'ball'],
  // павильон автоматов и гараж — по углам
  [-27.65, -15.55, 1.0, 'bush'],
  [-12.3, -15.55, 0.95, 'bloom'],
  [13.55, -15.55, 1.0, 'bush'],
  [27.45, -15.5, 1.05, 'ball'],
  // кафе — по углам западной стены; ларёк — у угла
  [23.62, -10.35, 1.0, 'bush'],
  [23.62, 4.35, 1.0, 'bloom'],
  [-25.2, -6.35, 0.9, 'bloom'],
];

/** Деревья: x, z, высота земли, кипарис или круглое, рост */
const NOOK_TREES: ReadonlyArray<readonly [number, number, number, 'cypress' | 'round', number]> = [
  // закутки за низкими стенками на северо-западе и северо-востоке
  [-29.0, -18.6, 0, 'cypress', 8.5],
  [-29.05, -23.6, 0, 'round', 5.5],
  [29.0, -18.8, 0, 'cypress', 9],
  [29.05, -23.6, 0, 'cypress', 7.5],
];

type Tree = readonly [number, number, number, 'cypress' | 'round', number];

function streetTrees(rng: () => number): Tree[] {
  const out: Tree[] = [];
  // улица за домами на севере: над крышами видны верхушки, как на концепте
  for (let x = -27; x <= 29; x += 4.2 + rng() * 1.6) {
    const kind = rng() < 0.7 ? 'cypress' : 'round';
    out.push([x + (rng() - 0.5) * 1.2, -29.5 - rng() * 3.5, STREET_Y, kind, kind === 'cypress' ? 10 + rng() * 4 : 6.5 + rng() * 2]);
  }
  // за кафе и колесом на востоке — за парапетом
  for (let z = -14; z <= 14; z += 7 + rng() * 2) out.push([33 + rng() * 2.5, z, STREET_Y, rng() < 0.75 ? 'cypress' : 'round', 9 + rng() * 3]);
  return out;
}

// ------------------------------------------------------------ геометрия

/** Кипарис: веретено (снизу шире, кверху остриё), цвет темнее книзу. h — рост, w — радиус. */
export function cypressGeometry(seg = 8, rows = 7): THREE.BufferGeometry {
  const prof: THREE.Vector2[] = [];
  const shape = [0.18, 0.62, 0.92, 1.0, 0.94, 0.8, 0.6, 0.38, 0.16, 0.0];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const f = t * (shape.length - 1);
    const k = Math.floor(f);
    const r = shape[k] + (shape[Math.min(k + 1, shape.length - 1)] - shape[k]) * (f - k);
    prof.push(new THREE.Vector2(Math.max(0.001, r), t));
  }
  const g = new THREE.LatheGeometry(prof, seg);
  g.computeVertexNormals();
  return g;
}

/** Покрасить геометрию: цвет темнее книзу (тень внутри кроны), чуть пятнами */
function shaded(g: THREE.BufferGeometry, hex: number, y0: number, y1: number, rng: () => number): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g;
  const pos = src.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const base = new THREE.Color(hex);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 3) {
    const v = 0.9 + rng() * 0.2;
    for (let k = 0; k < 3; k++) {
      const t = Math.min(1, Math.max(0, (pos.getY(i + k) - y0) / (y1 - y0)));
      c.copy(base).multiplyScalar((0.6 + 0.45 * t) * v);
      col.set([c.r, c.g, c.b], (i + k) * 3);
    }
  }
  src.setAttribute('color', new THREE.BufferAttribute(col, 3));
  src.deleteAttribute('uv');
  return src;
}

/** Шар кроны с буграми (как в decor.ts) */
function blob(r: number, x: number, y: number, z: number, hex: number, seed: number, rng: () => number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    const pz = pos.getZ(i);
    const k = r * (1 + 0.08 * Math.sin(px * 4 + seed) * Math.sin(py * 4 + seed * 2) * Math.sin(pz * 4 + seed * 3));
    pos.setXYZ(i, x + px * k, y + py * k * 0.92, z + pz * k);
  }
  g.computeVertexNormals();
  return shaded(g, hex, y - r, y + r, rng);
}

export interface LookDecorParts {
  scene: THREE.Scene;
  wind: THREE.IUniform<number>;
  wet: Wet;
  deco: readonly Deco[];
  /** телефон: деревьев за домами меньше */
  lite: boolean;
}

/** Статическое наполнение набережной; живность принадлежит LobbyCritters. */
export class LookDecor {
  /** Пятна затенения у подножий (горшки, деревья, указатель) — для запекания плитки (lookbake.ts) */
  readonly contacts: Contact[] = [];
  private readonly rng = makeRng(2026);
  private readonly solid: THREE.BufferGeometry[] = [];
  private readonly crowns: THREE.BufferGeometry[] = [];

  constructor(o: LookDecorParts) {
    const { scene } = o;
    const rng = this.rng;
    for (const [x, z, s, kind] of POTS) this.pot(x, z, s, kind);
    this.baskets(o.deco);
    for (const [x, z, y, kind, h] of [...NOOK_TREES, ...(o.lite ? [] : streetTrees(rng))]) {
      if (kind === 'cypress') this.cypress(x, y, z, h);
      else this.roundTree(x, y, z, h);
    }
    this.signpost(scene, o.wet);
    this.ring(scene, o.wet);

    const solid = staticMesh(mergeGeometries(this.solid, false)!, o.wet(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 })), true);
    scene.add(solid);
    const crownMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 });
    windSway(crownMat, o.wind, 0.08, 'look-crown');
    scene.add(staticMesh(mergeGeometries(this.crowns, false)!, crownMat, true));

  }

  /** Kept for the existing look update hook; crowns move in their shader. */
  update(_dt: number, _t: number): void {}

  // ------------------------------------------------------------ части

  private add(g: THREE.BufferGeometry, hex: number, x: number, y: number, z: number, ry = 0, rx = 0): void {
    const p = place(paint(g, hex), x, y, z, ry, rx);
    p.deleteAttribute('uv');
    this.solid.push(p);
  }

  /** Терракотовый горшок (s — размер) с кустом в цветах, шаром-деревцем или цветами. */
  private pot(x: number, z: number, s: number, kind: 'bush' | 'ball' | 'bloom'): void {
    const rng = this.rng;
    const h = 0.46 * s;
    const r = 0.27 * s;
    this.contacts.push([x, z, r * 2, 0.5]);
    this.add(new THREE.CylinderGeometry(r, r * 0.74, h, 14), POT, x, h / 2, z);
    this.add(new THREE.CylinderGeometry(r * 1.1, r * 1.1, 0.07 * s, 14), POT_DARK, x, h - 0.02 * s, z);
    this.add(new THREE.CylinderGeometry(r * 0.95, r * 0.95, 0.02, 14), SOIL, x, h + 0.015 * s, z);
    const top = h + 0.03;
    if (kind === 'ball') {
      this.add(new THREE.CylinderGeometry(0.025 * s, 0.035 * s, 0.6 * s, 6), 0x6b4a32, x, top + 0.3 * s, z);
      this.crowns.push(swayAttr(blob(0.36 * s, x, top + 0.78 * s, z, CROWN[(rng() * CROWN.length) | 0], x + z, rng), top, top + 1.2 * s));
      return;
    }
    const bushR = (kind === 'bush' ? 0.36 : 0.28) * s;
    const bush = blob(bushR, x, top + bushR * 0.7, z, LEAVES[(rng() * LEAVES.length) | 0], x * 3 + z, rng);
    this.crowns.push(swayAttr(bush, top, top + bushR * 2));
    // головки цветов по верху куста
    const n = kind === 'bloom' ? 16 : 7;
    const color = FLOWERS[(rng() * FLOWERS.length) | 0];
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const up = 0.15 + rng() * 0.8;
      const rr = Math.sqrt(1 - up * up) * bushR * 0.98;
      const head = paint(new THREE.IcosahedronGeometry((0.05 + rng() * 0.02) * s, 0), rng() < 0.75 ? color : FLOWERS[(rng() * FLOWERS.length) | 0]);
      head.deleteAttribute('uv');
      this.crowns.push(swayAttr(place(head, x + Math.cos(a) * rr, top + bushR * 0.7 + up * bushR * 0.95, z + Math.sin(a) * rr), top, top + bushR * 2));
    }
  }

  /** Корзины с цветами на фонарях: по две на столбе, поперёк кронштейна, на высоте 3 м. */
  private baskets(deco: readonly Deco[]): void {
    const rng = this.rng;
    for (const d of deco) {
      if (d.kind !== 'lamp') continue;
      // кронштейн смотрит по (−sin yaw, −cos yaw); корзины — поперёк
      const px = Math.cos(d.yaw);
      const pz = -Math.sin(d.yaw);
      for (const side of [-1, 1]) {
        const bx = d.x + px * side * 0.42;
        const bz = d.z + pz * side * 0.42;
        this.add(new THREE.BoxGeometry(0.03, 0.03, 0.42), 0x2f3a3a, d.x + px * side * 0.21, 3.32, d.z + pz * side * 0.21, Math.atan2(px, pz));
        this.add(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 4), 0x2f3a3a, bx, 3.17, bz);
        this.add(new THREE.SphereGeometry(0.19, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), 0x6a4a2c, bx, 3.02, bz);
        // шапка цветов: листва куполом, по ней и по краю — головки одного яркого цвета (немного других)
        const color = BASKET[(rng() * BASKET.length) | 0];
        const bit = (r: number, hex: number, px: number, py: number, pz: number, sy = 1) => {
          const g = paint(new THREE.IcosahedronGeometry(r, 0).scale(1, sy, 1), hex);
          g.deleteAttribute('uv');
          this.crowns.push(swayAttr(place(g, bx + px, py, bz + pz), 2.5, 3.3));
        };
        for (let i = 0; i < 10; i++) {
          const a = rng() * Math.PI * 2;
          const rr = 0.04 + rng() * 0.15;
          bit(0.08 + rng() * 0.03, LEAVES[(rng() * LEAVES.length) | 0], Math.cos(a) * rr, 3.05 + (0.2 - rr) * 0.5, Math.sin(a) * rr);
        }
        for (let i = 0; i < 24; i++) {
          // точки на куполе радиусом ~0,24 м: сверху и по бокам, до края корзины
          const a = rng() * Math.PI * 2;
          const up = rng() * 0.95;
          const rr = Math.sqrt(1 - up * up) * 0.23;
          const hex = rng() < 0.8 ? color : FLOWERS[(rng() * FLOWERS.length) | 0];
          bit(0.042 + rng() * 0.018, hex, Math.cos(a) * rr, 3.02 + up * 0.17, Math.sin(a) * rr);
        }
        // свисающая зелень: плети по краю, кое-где с цветком на конце
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2 + rng() * 0.5;
          const ca = Math.cos(a) * 0.2;
          const sa = Math.sin(a) * 0.2;
          const len = 0.14 + rng() * 0.16;
          bit(0.045, LEAVES[(rng() * LEAVES.length) | 0], ca, 2.98 - len * 0.5, sa, len / 0.09);
          if (rng() < 0.45) bit(0.04, color, ca * 1.05, 2.98 - len - 0.02, sa * 1.05);
        }
      }
    }
  }

  /** Кипарис ростом h на земле y. */
  private cypress(x: number, y: number, z: number, h: number): void {
    const rng = this.rng;
    const w = 0.55 + h * 0.06;
    if (y === 0) this.contacts.push([x, z, w * 1.1, 0.4]);
    this.add(new THREE.CylinderGeometry(0.08, 0.12, 0.9, 6), 0x5a4030, x, y + 0.45, z);
    const g = cypressGeometry(9, 9);
    g.scale(w, h - 0.5, w);
    g.rotateY(rng() * Math.PI);
    g.translate(x, y + 0.5, z);
    this.crowns.push(swayAttr(shaded(g, CYPRESS[(rng() * CYPRESS.length) | 0], y, y + h, rng), y + 1, y + h));
  }

  /** Круглое дерево ростом h: ствол и три-четыре шара кроны. */
  private roundTree(x: number, y: number, z: number, h: number): void {
    const rng = this.rng;
    const r = h * 0.24;
    const top = y + h - r;
    if (y === 0) this.contacts.push([x, z, 0.6, 0.35]);
    this.add(new THREE.CylinderGeometry(0.1, 0.16, h - r, 7), 0x6b4a32, x, y + (h - r) / 2, z);
    const blobs: Array<[number, number, number, number]> = [[r, 0, 0, 0], [r * 0.72, r * 0.62, -r * 0.3, r * 0.2], [r * 0.7, -r * 0.55, -r * 0.25, -r * 0.4], [r * 0.62, 0, r * 0.55, 0.1]];
    blobs.forEach(([br, dx, dy, dz], k) => {
      this.crowns.push(swayAttr(blob(br, x + dx, top + dy, z + dz, CROWN[(k + Math.floor(x)) & 3], x + k, rng), top - r, top + r));
    });
  }

  /** Указатель: столб, три стрелки (Пляж, Порт, Город) и табличка «Хорошие люди везде ♥»; доски смотрят на площадь. */
  private signpost(scene: THREE.Scene, wet: Wet): void {
    const { x, z } = SIGNPOST;
    this.contacts.push([x, z, 0.35, 0.3]);
    this.add(new THREE.CylinderGeometry(0.07, 0.085, 2.95, 8), 0x6a4a30, x, 1.475, z);
    this.add(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 8), 0x4a3424, x, 2.98, z);
    // лицом на север, к площади: стрелка «вправо» показывает на запад
    const yaw = Math.PI;
    const rows = SIGN_ATLAS.length;
    const parts: THREE.BufferGeometry[] = [];
    let arrows = 0;
    SIGN_ROWS.forEach(([, dir], i) => {
      const w = dir === 0 ? 1.15 : 1.3;
      const h = dir === 0 ? 0.32 : 0.3;
      // стрелки — выше головы (рост 1,6 м), табличка — ниже, на столбе
      const y = dir === 0 ? 1.25 : 2.65 - i * 0.38;
      // доска сдвинута в сторону стрелки; сзади — та же надпись, а стрелка — со своей полосы (в другую сторону)
      const dx = dir === 0 ? 0 : dir * 0.42;
      const backRow = dir === 0 ? i : SIGN_ROWS.length + arrows++;
      for (const back of [0, 1]) {
        const row = back ? backRow : i;
        const g = new THREE.PlaneGeometry(w, h);
        const uv = g.getAttribute('uv');
        for (let k = 0; k < uv.count; k++) uv.setY(k, 1 - (row + 1 - uv.getY(k)) / rows);
        if (back) g.rotateY(Math.PI);
        g.translate(dx, y, back ? -0.035 : 0.035);
        parts.push(g);
      }
      this.add(new THREE.BoxGeometry(w + 0.04, h + 0.04, 0.06), 0x5a3a24, x + Math.cos(yaw) * dx, y, z - Math.sin(yaw) * dx, yaw);
    });
    const g = mergeGeometries(parts, false)!;
    g.rotateY(yaw);
    g.translate(x, 0, z);
    const m = new THREE.Mesh(g, wet(new THREE.MeshStandardMaterial({ map: lookSignpostTexture(), roughness: 0.85 })));
    m.castShadow = true;
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    scene.add(m);
  }

  /** Кайма из смальты вокруг розы ветров — мозаика крупнее, как на концепте. */
  private ring(scene: THREE.Scene, wet: Wet): void {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(MOSAIC.r, RING_OUT, 96, 1).rotateX(-Math.PI / 2),
      wet(new THREE.MeshStandardMaterial({ map: lookRingTexture(MOSAIC.r, RING_OUT), roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 })),
    );
    m.position.set(MOSAIC.x, 0.006, MOSAIC.z);
    m.receiveShadow = true;
    m.renderOrder = 1;
    scene.add(m);
  }
}


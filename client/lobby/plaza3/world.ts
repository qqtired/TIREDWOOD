// Статика новой набережной (флаг PLAZA3, docs/plaza3/tech-foundation.md §1.6): суша, кварталы, павильоны. Строится вместо
// старой статики plaza2 в LobbyWorld, когда в docs/plaza3/level/layout.json legacyStatic: false.
// Сейчас — блокаут WP2: настил по многоугольнику суши со стенкой до воды, задник до города (улица, поле фермы), пятна
// (площадь, роза, песок, газоны, гравий), променады и бульвар; павильоны — серые коробки по боксам твёрдого и
// декор-фигуры (купола, кроны, конусы), по одному мешу на квартал. Всё — из layout.json, ничего не считается здесь.
// Павильоны-модели (WP9), вывески (WP10), жители (WP11) заменят коробки по кварталам.
import * as THREE from 'three';
import type { LobbyMap } from '../../../shared/maps/lobby.ts';
import { P3 } from '../../../shared/plaza3/layout.ts';
import type { P3Pt } from '../../../shared/plaza3/types.ts';
import { mergeColored, paint, place, staticMesh } from '../../render/kit.ts';
import type { VenueCtx } from '../plaza/venue.ts';
import { FLOOR_Y } from './floor.ts';
import { dressPlaza3Ground } from './ground.ts';

export interface Plaza3World {
  readonly group: THREE.Group;
  /** Сколько мешей и треугольников — для замера (__opus.info) */
  debug(): Record<string, unknown>;
  /** Модель павильона встала (client/lobby/plaza3/pavilions.ts) — его коробки блокаута не рисовать; твёрдое остаётся */
  hidePavilion(id: string): void;
}

/** Низ стенки набережной (как у старой: до воды и ниже) */
const QUAY_BOTTOM = -3.2;
const STONE = 0x7d776e;
const DECK = 0xd2c3aa;
const STREET = 0xa6a8a0;
const FIELD = 0x8c9a4e;
/** Пятна и дорожки: высота над настилом и цвет. Высоты — plaza3/floor.ts: вся стопка ниже плитки моделей и наклеек */
const PATCH: Record<string, [number, number]> = {
  sand: [FLOOR_Y.patch, 0xe6d29a],
  lawn: [FLOOR_Y.patch, 0x76a046],
  gravel: [FLOOR_Y.patch, 0xb9ad98],
  dirt: [FLOOR_Y.patch, 0x9a7a52],
  plaza: [FLOOR_Y.plaza, 0xe9e0cc],
  rose: [FLOOR_Y.rose, 0xc9784e],
};
/** Дорожки: цвет и высота по виду — разные виды пересекаются (перекрёстки), на одной высоте они бы мерцали */
const PATH: Record<string, [number, number]> = {
  main: [FLOOR_Y.main, 0xe4d9c2],
  secondary: [FLOOR_Y.secondary, 0xdacdb2],
  boulevard: [FLOOR_Y.boulevard, 0xc4ad84],
};

/** Плоский многоугольник [[x, z], …] на высоте y (ShapeGeometry в XY → поворот на пол) */
function flat(poly: readonly P3Pt[], y: number, color: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
  return paint(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2).translate(0, y, 0), color);
}

function disc(x: number, z: number, r: number, y: number, color: number): THREE.BufferGeometry {
  return paint(new THREE.CircleGeometry(r, Math.max(12, Math.round(r * 6))).rotateX(-Math.PI / 2).translate(x, y, z), color);
}

function inPoly(x: number, z: number, poly: readonly P3Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Стенка по краю многоугольника от y0 до y1, лицом наружу */
function walls(poly: readonly P3Pt[], y0: number, y1: number, color: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i];
    const [bx, bz] = poly[(i + 1) % poly.length];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-6) continue;
    let nx = (bz - az) / len;
    let nz = -(bx - ax) / len;
    if (inPoly((ax + bx) / 2 + nx * 0.05, (az + bz) / 2 + nz * 0.05, poly)) {
      nx = -nx;
      nz = -nz;
    }
    // треугольники a0-b0-b1, a0-b1-a1 смотрят в (−dz, dx) отрезка a→b; если это внутрь — меняем местами a и b
    const flip = (bx - ax) * nz - (bz - az) * nx < 0;
    const [px, pz, qx, qz] = flip ? [bx, bz, ax, az] : [ax, az, bx, bz];
    pos.push(px, y0, pz, qx, y0, qz, qx, y1, qz, px, y0, pz, qx, y1, qz, px, y1, pz);
    for (let k = 0; k < 6; k++) nor.push(nx, 0, nz);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return paint(g, color);
}

/** Ломаная шириной w на высоте y: прямоугольник на отрезок и круг на стыке */
function path(pts: readonly P3Pt[], w: number, y: number, color: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-6) continue;
    const g = new THREE.PlaneGeometry(w, len).rotateX(-Math.PI / 2);
    // PlaneGeometry после поворота лежит вдоль z: повернуть по направлению отрезка
    out.push(place(paint(g, color), (ax + bx) / 2, y, (az + bz) / 2, Math.atan2(bx - ax, bz - az)));
    if (i > 0) out.push(disc(ax, az, w / 2, y, color));
  }
  return out;
}

export function buildPlaza3World(ctx: VenueCtx, map: LobbyMap): Plaza3World {
  const group = new THREE.Group();
  group.name = 'plaza3';
  ctx.scene.add(group);
  const land = P3.land;

  // --- земля: задник до города (улица и поле), настил суши со стенкой до воды, пятна, дорожки — один меш без теней от себя
  const ground: THREE.BufferGeometry[] = [
    flat(land.backlot, land.streetY, STREET),
    flat(land.field, land.streetY + 0.02, FIELD),
    flat(land.polygon, land.deckY, DECK),
    walls(land.polygon, QUAY_BOTTOM, land.deckY, STONE),
  ];
  for (const g of P3.ground) {
    const [y, color] = PATCH[g.kind] ?? [FLOOR_Y.patch, DECK];
    if (g.circle) ground.push(disc(g.circle.x, g.circle.z, g.circle.r, y, color));
    else if (g.poly) ground.push(flat(g.poly, y, color));
  }
  for (const p of P3.paths) {
    const [y, color] = PATH[p.kind] ?? PATH.secondary;
    ground.push(...path(p.pts, p.w, y, color));
  }
  const mat = ctx.wet(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }));
  const groundMesh = staticMesh(mergeColored(ground), mat, true);
  groundMesh.castShadow = false;
  groundMesh.name = 'plaza3-ground';
  group.add(groundMesh);
  // земля в текстурах (plaza3/ground.ts): меш на картинку, развёртка в метрах, программа та же
  dressPlaza3Ground(group, ctx.wet);

  // --- коробки блокаута: видимое твёрдое (павильоны, балюстрада, скалы) и декор без твёрдого — по мешу на квартал
  const byQ = new Map<string, THREE.BufferGeometry[]>();
  const put = (q: string, g: THREE.BufferGeometry): void => {
    let list = byQ.get(q);
    if (!list) byQ.set(q, (list = []));
    list.push(g);
  };
  const drawn = new Set(map.plaza3Boxes ?? []);
  for (const i of drawn) {
    const b = map.boxes[i];
    if (b.mat === 'invisible' || b.mat === 'deck') continue;
    const c = P3.colliders[i - (map.plaza3Boxes?.[0] ?? 0)];
    const [x0, y0, z0] = b.min;
    const [x1, y1, z1] = b.max;
    put(c?.pav ?? c?.q ?? 'misc', place(paint(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), b.color), (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2));
  }
  for (const d of P3.decor) {
    const [x, y, z] = d.c;
    if (d.t === 'box' && d.s) put(d.pav ?? d.q, place(paint(new THREE.BoxGeometry(d.s[0], d.s[1], d.s[2]), d.color), x, y, z, d.yaw ?? 0));
    else if (d.r && d.h) {
      const g = d.t === 'cone' ? new THREE.ConeGeometry(d.r, d.h, 14) : new THREE.CylinderGeometry(d.r, d.r, d.h, 14);
      put(d.pav ?? d.q, place(paint(g, d.color), x, y + d.h / 2, z));
    }
  }
  const boxMat = ctx.wet(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 }));
  let tris = 0;
  for (const [q, list] of byQ) {
    const m = staticMesh(mergeColored(list), boxMat, true);
    m.name = `plaza3-${q}`;
    tris += m.geometry.getAttribute('position').count / 3;
    group.add(m);
  }
  tris += groundMesh.geometry.getAttribute('position').count / 3;
  const meshes = group.children.length;
  return {
    group,
    debug: () => ({ meshes, tris: Math.round(tris), quarters: [...byQ.keys()] }),
    hidePavilion: (id) => {
      const m = group.getObjectByName(`plaza3-${id}`);
      if (m) m.visible = false;
    },
  };
}

// «Ракушка»: декор plaza3 (кипарисы квартала «games» и т. п. из P3.decor), попавший в ограду площадки, прячем, пока
// площадка построена. Данные plaza3 не трогаем: фигуры склеены в меш квартала (plaza3/world.ts, «plaza3-<q>»), поэтому
// их треугольники схлопываются в точку, а без площадки (нет поля quiz) — возвращаются. Многоугольник — decorClear из
// venue-data.json (v3, сцена без ограды), иначе ограда: при смене места уберётся то, что попадёт в новую зону.
import type * as THREE from 'three';
import { P3 } from '../../../shared/plaza3/layout.ts';
import { QUIZ_VENUE, inPoly, toWorld } from '../../../shared/quiz/venue.ts';

/** Фигура декора: круг на полу и высота (координаты — как в layout, они же — геометрия меша квартала) */
interface Cut { x: number; z: number; r: number; y0: number; y1: number }

const EPS = 0.03;

/** Где прятать декор (мир, [x, z]): decorClear из данных (локальные координаты площадки), иначе ограда */
export function clearPoly(): [number, number][] {
  const d = QUIZ_VENUE.data;
  if (!d.decorClear || d.decorClear.length < 3) return QUIZ_VENUE.fence.map(([x, z]) => [x, z]);
  return d.decorClear.map(([x, z]) => { const v = toWorld(QUIZ_VENUE.world, x, 0, z); return [v[0], v[2]]; });
}

/** Декор plaza3 в ограде, по имени меша, где он склеен */
export function fenceDecor(fence: readonly (readonly [number, number])[] = clearPoly()): Map<string, Cut[]> {
  const out = new Map<string, Cut[]>();
  for (const d of P3.decor) {
    const [x, y, z] = d.c;
    if (!inPoly(fence, x, z)) continue;
    let cut: Cut | null = null;
    if (d.t === 'box' && d.s) {
      const r = Math.hypot(d.s[0], d.s[2]) / 2;
      cut = { x, z, r, y0: y - d.s[1] / 2, y1: y + d.s[1] / 2 };
    } else if (d.r && d.h) cut = { x, z, r: d.r, y0: y, y1: y + d.h };
    if (!cut) continue;
    const name = `plaza3-${d.pav ?? d.q}`;
    const list = out.get(name) ?? [];
    list.push(cut);
    out.set(name, list);
  }
  return out;
}

function inside(cuts: Cut[], x: number, y: number, z: number): Cut | null {
  for (const c of cuts) if (Math.hypot(x - c.x, z - c.z) <= c.r + EPS && y >= c.y0 - EPS && y <= c.y1 + EPS) return c;
  return null;
}

/** Схлопнутые треугольники: что вернуть */
interface Saved { attr: THREE.BufferAttribute; at: number[]; orig: number[] }

export class FenceClear {
  private saved: Saved[] = [];
  /** Сколько треугольников спрятано (для __quiz.debug) */
  tris = 0;

  /** Спрятать декор в ограде; повторный вызов ничего не делает */
  apply(root: THREE.Object3D, want: Map<string, Cut[]> = fenceDecor()): void {
    if (this.saved.length) return;
    if (!want.size) return;
    root.traverse((o) => {
      const cuts = want.get(o.name);
      const mesh = o as THREE.Mesh;
      if (!cuts || !mesh.isMesh || mesh.geometry.getAttribute('position') === undefined) return;
      const g = mesh.geometry;
      const pos = g.getAttribute('position') as THREE.BufferAttribute;
      const index = g.getIndex();
      const n = index ? index.count : pos.count;
      const vi = (k: number): number => (index ? index.getX(k) : k);
      const at: number[] = [];
      const orig: number[] = [];
      for (let k = 0; k + 2 < n; k += 3) {
        const a = vi(k), b = vi(k + 1), c = vi(k + 2);
        const hit = inside(cuts, pos.getX(a), pos.getY(a), pos.getZ(a));
        if (!hit || inside([hit], pos.getX(b), pos.getY(b), pos.getZ(b)) === null || inside([hit], pos.getX(c), pos.getY(c), pos.getZ(c)) === null) continue;
        if (index) {
          // все три угла — в первый: треугольник нулевой площади
          at.push(k + 1, k + 2);
          orig.push(b, c);
          index.setX(k + 1, a);
          index.setX(k + 2, a);
        } else {
          for (const v of [b, c]) {
            at.push(v * 3, v * 3 + 1, v * 3 + 2);
            orig.push(pos.getX(v), pos.getY(v), pos.getZ(v));
            pos.setXYZ(v, pos.getX(a), pos.getY(a), pos.getZ(a));
          }
        }
        this.tris++;
      }
      if (!at.length) return;
      const attr = (index ?? pos) as THREE.BufferAttribute;
      attr.needsUpdate = true;
      this.saved.push({ attr, at, orig });
    });
  }

  /** Площадку выключили — декор как был */
  restore(): void {
    for (const s of this.saved) {
      const arr = s.attr.array as unknown as number[];
      for (let i = 0; i < s.at.length; i++) arr[s.at[i]] = s.orig[i];
      s.attr.needsUpdate = true;
    }
    this.saved = [];
    this.tris = 0;
  }
}

// Белый флаг на террасе (стойка 'flag': E — сдаться, голосует вся команда, server/fort/surrender.ts): высокое древко у
// южной стены по оси крепости и белое полотнище, что слегка колышется на ветру с моря. Дёшево: полотнище — сетка 13×6
// вершин, 30 раз в секунду её двигает бегущая волна (у древка полотнище неподвижно, к краю размах растёт); древко — статика.
import * as THREE from 'three';
import { FLAG_POLE, TERRACE } from '../../shared/fortmap.ts';
import { mergeColored, paint, staticMesh } from '../render/kit.ts';

/** Древко над террасой, м: полотнище выше зубцов южной стены (они на 2,4 м над террасой) — видно с любого места двора; полотнище: ширина, высота, сетка */
const POLE_H = 4.6;
const CLOTH_W = 2.1;
const CLOTH_H = 1.3;
const SEG_X = 12;
const SEG_Y = 5;
/** Зазор между древком и краем полотнища, м */
const GAP = 0.05;

export class FortFlag {
  private readonly geo: THREE.PlaneGeometry;
  private readonly rest: Float32Array;
  private readonly pos: THREE.BufferAttribute;
  /** Не чаще 30 раз в секунду: глазу хватает, вершины и нормали считаются реже */
  private last = -1;

  constructor(scene: THREE.Scene) {
    const { x, z } = FLAG_POLE;
    const y = TERRACE.h;
    // древко, каменная пята и золотое навершие — один меш
    const frame: THREE.BufferGeometry[] = [
      paint(new THREE.CylinderGeometry(0.045, 0.06, POLE_H, 8).translate(0, POLE_H / 2, 0), 0x6b4a2c),
      paint(new THREE.BoxGeometry(0.5, 0.14, 0.5).translate(0, 0.07, 0), 0xb3a68c),
      paint(new THREE.BoxGeometry(0.32, 0.1, 0.32).translate(0, 0.19, 0), 0xcbbfa6),
      paint(new THREE.SphereGeometry(0.08, 10, 8).translate(0, POLE_H + 0.06, 0), 0xe0b13c),
      // кольца, на которых висит полотнище
      paint(new THREE.TorusGeometry(0.07, 0.014, 6, 10).translate(0, POLE_H - 0.12, 0), 0xc99a3a),
      paint(new THREE.TorusGeometry(0.07, 0.014, 6, 10).translate(0, POLE_H - 0.12 - CLOTH_H, 0), 0xc99a3a),
    ];
    const pole = staticMesh(mergeColored(frame), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), true);
    pole.position.set(x, y, z);
    pole.updateMatrix();
    scene.add(pole);

    // полотнище: от древка на восток, лицом к двору; свисает с верхнего кольца
    this.geo = new THREE.PlaneGeometry(CLOTH_W, CLOTH_H, SEG_X, SEG_Y).translate(GAP + CLOTH_W / 2, POLE_H - 0.12 - CLOTH_H / 2, 0);
    this.pos = this.geo.getAttribute('position') as THREE.BufferAttribute;
    this.rest = Float32Array.from(this.pos.array as ArrayLike<number>);
    // белое и в тени (двор смотрит на северную, теневую сторону полотнища): собственное свечение поднимает тень до светло-серого
    const cloth = new THREE.Mesh(this.geo, new THREE.MeshStandardMaterial({ color: 0xfffdf6, emissive: 0xc2bfb6, emissiveIntensity: 0.85, roughness: 0.92, side: THREE.DoubleSide }));
    cloth.position.set(x, y, z);
    cloth.name = 'fort-white-flag';
    // тень статична (считается один раз): колышущейся ткани в ней нет
    cloth.frustumCulled = false;
    scene.add(cloth);
    this.update(0);
  }

  /** Бегущая по полотнищу волна: у древка (u = 0) ткань стоит, к краю размах больше; низ чуть отстаёт и провисает */
  update(t: number): void {
    if (t - this.last < 1 / 30 && this.last >= 0) return;
    this.last = t;
    const a = this.pos.array as Float32Array;
    for (let i = 0; i < this.pos.count; i++) {
      const bx = this.rest[i * 3];
      const by = this.rest[i * 3 + 1];
      const u = Math.max(0, (bx - GAP) / CLOTH_W);
      const low = (POLE_H - 0.12 - by) / CLOTH_H;
      const amp = u * (0.5 + 0.5 * u);
      a[i * 3 + 2] = amp * (Math.sin(u * 5.4 - t * 3.1 + low * 1.2) * 0.1 + Math.sin(u * 11.3 - t * 5.2 + low * 2.4) * 0.025);
      a[i * 3 + 1] = by - u * u * 0.05 - amp * Math.sin(u * 5.4 - t * 3.1 + low * 1.2) * 0.02;
    }
    this.pos.needsUpdate = true;
    this.geo.computeVertexNormals();
  }
}

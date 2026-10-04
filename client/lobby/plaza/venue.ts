// «Площадка» оформления: одна группа сцены (её можно скрыть целиком — режим за флагом), накопители деталей, стен,
// флагов и лампочек, зазывалы и боксы коллизии. Строители входов (north.ts, harbor.ts, east.ts) работают с ней.
import * as THREE from 'three';
import { glowSprite } from '../../render/kit.ts';
import { Bulbs, Flags, Mesher, TexBoxes, detailMesh, marquee, type MarqueeOut, type MarqueeSpec, type Wet } from './gfx.ts';
import type { ToutDef } from './touts.ts';

/** Что мир даёт оформлению: ветер, мокрота в дождь, погасание огней в грозу */
export interface VenueCtx {
  scene: THREE.Scene;
  wind: THREE.IUniform<number>;
  wet: Wet;
  signs: Map<THREE.MeshStandardMaterial, number>;
  powered: THREE.Object3D[];
}

/** Твёрдый предмет оформления: бокс карты (shared/maps/lobby.ts — PLAZA_SOLIDS), сервер и клиент считают его одинаково */
export interface Solid {
  min: [number, number, number];
  max: [number, number, number];
}

export class Venue {
  readonly group = new THREE.Group();
  /** Раскрашенные детали (вершинные цвета) */
  readonly detail = new Mesher();
  /** Самосветящееся: окна, лампы, фонари, огонь */
  readonly glow = new Mesher();
  /** Без освещения, не гаснет в грозу: облака */
  readonly flat = new Mesher();
  /** Кирпич, камень, доски */
  readonly walls: TexBoxes;
  readonly bulbs = new Bulbs();
  readonly flags = new Flags();
  readonly touts: ToutDef[] = [];

  readonly key: string;
  readonly ctx: VenueCtx;
  private readonly shadows: boolean;

  /** shadows = false — далёкие строения за линией зданий (вне рамки теней): теней не отбрасывают */
  constructor(key: string, ctx: VenueCtx, seed = 1, shadows = true) {
    this.key = key;
    this.ctx = ctx;
    this.shadows = shadows;
    this.group.name = `plaza2-${key}`;
    this.walls = new TexBoxes(seed);
  }

  /** Расписная вывеска с лампочками */
  sign(spec: MarqueeSpec): MarqueeOut {
    return marquee({ group: this.group, detail: this.detail, bulbs: this.bulbs, signs: this.ctx.signs, powered: this.ctx.powered }, spec);
  }

  /** Тёплый ореол лампы (аддитивный спрайт; гаснет вместе со светом в сети) */
  lampGlow(color: number, size: number, x: number, y: number, z: number, opacity = 0.5): THREE.Sprite {
    const s = glowSprite(color, size, opacity);
    s.position.set(x, y, z);
    this.group.add(s);
    this.ctx.powered.push(s);
    return s;
  }

  /** Склеить всё накопленное и положить в группу; группу — в сцену. */
  finish(visible = true): this {
    const d = detailMesh(this.detail, this.ctx.wet, this.shadows);
    if (d) this.group.add(d);
    for (const m of this.walls.meshes(this.ctx.wet, this.shadows)) this.group.add(m);
    const fg = this.flat.geometry();
    if (fg) {
      const m = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ vertexColors: true }));
      m.matrixAutoUpdate = false;
      this.group.add(m);
    }
    const g = this.glow.geometry();
    if (g) {
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
      m.matrixAutoUpdate = false;
      this.group.add(m);
      this.ctx.powered.push(m);
    }
    if (!this.flags.empty) this.group.add(this.flags.mesh(this.ctx.wind, this.ctx.wet));
    this.bulbs.build(this.group);
    this.group.visible = visible;
    this.ctx.scene.add(this.group);
    return this;
  }
}

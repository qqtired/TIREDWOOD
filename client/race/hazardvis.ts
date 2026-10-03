// Помехи «Портового кольца» глазами (физика — shared/hazards.ts): плиты-ускорители с бегущими шевронами, лужи масла и
// воды, бочки и бетонные блоки, настилы срезки на сваях и подвижные помехи — контейнер на рельсах, груз портального
// крана и шлагбаум-вертушка. Подвижные берут положение у той же функции времени гонки (moverCap), что и физика.
import * as THREE from 'three';
import { MV_GATE, gatePhase, MV_SLIDE, MV_SWING, makeCap, moverCap, spinAngle, swingU, type Deck, type Mover, type Pad, type Slick, type Solid } from '../../shared/hazards.ts';
import { locateAny, makeLoc, type Track } from '../../shared/track.ts';
import { addBox, buildGeo, paint, parts, place, staticMesh, type V3 } from '../render/kit.ts';
import * as tex from '../render/textures.ts';
import { WHITE, face, same } from './geom.ts';
import { SLICK_FILL, padTexture, slickTexture } from './racetex.ts';

/** Высота плит и луж над дорогой (под разметкой и бордюрами они выше: polygonOffset) */
const PAD_Y = 0.036;
const SLICK_Y = 0.03;
/** Настил рисуется чуть выше физической высоты: на дороге асфальт его перекрывает, на суше он не мерцает */
const DECK_Y = 0.012;
const DECK_THICK = 0.4;
const PILE_STEP = 3.5;
const PILE_BOTTOM = -3.4;
const RAIL_H = 0.5;
const BARREL_R = 0.5;
const BARREL_COLORS = [0x2f6f9f, 0xb8452f, 0xd0a03a, 0x3f7f4a];
const RED = 0xd23b30;
const OFFWHITE = 0xf2f0ea;
const CONCRETE = 0xcfcac0;
const STEEL = 0x4a4f55;
const CRANE_RED = 0xb2473a;
const CRANE_WHITE = 0xe8e2d8;
const CONTAINER_COLORS = [0x9a4a3a, 0x3f6f8f, 0xc07a3a, 0x4c7a5a];
/** Груз крана: длина по дороге, ширина, высота (близко к кругу помехи радиусом 1,35) */
const LOAD_L = 2.7;
const LOAD_W = 2.4;
const LOAD_H = 2.4;
/** Груз висит на тросах от точки на высоте PIVOT_Y; у самой дороги — на LOAD_LOW, на краях взлетает на LOAD_RISE */
const PIVOT_Y = 10.2;
const LOAD_LOW = 0.2;
const LOAD_RISE = 0.5;
const UP = new THREE.Vector3(0, 1, 0);

/** Куда складывать статику: мир склеивает solid в один меш; текстуры доски и «опасность» общие с его трамплинами */
export interface HazardCtx {
  scene: THREE.Scene;
  solid: THREE.BufferGeometry[];
  planks: THREE.Texture;
  hazard: THREE.Texture;
  rng: () => number;
}

/** Путь подвижного контейнера (там, где он пересекает стену, в ней — проём) */
export interface Gate {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  r: number;
}

interface SlideVis {
  m: Mover;
  mesh: THREE.Mesh;
  shadow: THREE.Mesh;
  beacon: THREE.Mesh;
  ry: number;
}

interface SwingVis {
  m: Mover;
  load: THREE.Mesh;
  spreader: THREE.Mesh;
  cables: THREE.Mesh[];
  shadow: THREE.Mesh;
  /** Единица вправо по дороге (вдоль качания) и вперёд */
  ux: number;
  uz: number;
  fx: number;
  fz: number;
  ry: number;
}

interface SpinVis {
  m: Mover;
  arm: THREE.Group;
  shadow: THREE.Mesh;
}

const _cap = makeCap();
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _d = new THREE.Vector3();

export class HazardVis {
  readonly gates: Gate[] = [];
  private readonly ctx: HazardCtx;
  private readonly tr: Track;
  private readonly padTex: THREE.Texture | null = null;
  private readonly slides: SlideVis[] = [];
  private readonly swings: SwingVis[] = [];
  private readonly spins: SpinVis[] = [];
  private readonly presses: Array<{ m: Mover; beam: THREE.Mesh; lamp: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial> }> = [];
  private shadowMat: THREE.MeshBasicMaterial | null = null;
  private time = 0;

  constructor(ctx: HazardCtx, tr: Track) {
    this.ctx = ctx;
    this.tr = tr;
    const hz = tr.hz;
    if (hz.pads.length) this.padTex = this.buildPads(hz.pads);
    this.buildSlicks(hz.slicks);
    this.buildSolids(hz.solids);
    this.buildDecks(hz.decks);
    this.buildMovers(hz.movers);
    this.setTime(0);
  }

  // ------------------------------------------------------------ плиты и лужи

  private buildPads(pads: readonly Pad[]): THREE.Texture {
    const g = parts();
    for (const p of pads) {
      const rx = -p.fz;
      const rz = p.fx;
      const at = (a: number, b: number): V3 => [p.x + p.fx * a + rx * b, PAD_Y, p.z + p.fz * a + rz * b];
      const v1 = (p.hl * 2) / 7;
      face(g, at(-p.hl, -p.hw), at(-p.hl, p.hw), at(p.hl, p.hw), at(p.hl, -p.hw), [0, 1, 0], [0, 0, 1, 0, 1, v1, 0, v1], same(WHITE));
    }
    const map = padTexture();
    const mesh = staticMesh(buildGeo(g), new THREE.MeshStandardMaterial({
      map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.3, roughness: 0.62,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6,
    }), false);
    mesh.receiveShadow = true;
    mesh.renderOrder = 2;
    this.ctx.scene.add(mesh);
    return map;
  }

  private buildSlicks(slicks: readonly Slick[]): void {
    const maps = [[slickTexture(0, 301), slickTexture(0, 302)], [slickTexture(1, 311), slickTexture(1, 312)]];
    const mats = maps.map((list, kind) => list.map((map) => new THREE.MeshStandardMaterial({
      map, transparent: true, depthWrite: false, roughness: kind ? 0.16 : 0.1, metalness: kind ? 0.3 : 0,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6,
    })));
    slicks.forEach((s, i) => {
      const rx = -s.fz;
      const rz = s.fx;
      const hl = s.rl / SLICK_FILL;
      const hw = s.rw / SLICK_FILL;
      const g = parts();
      const at = (a: number, b: number): V3 => [s.x + s.fx * a + rx * b, SLICK_Y, s.z + s.fz * a + rz * b];
      // зеркалим развёртку: одинаковые лужи не повторяются
      const flip = i % 2 === 0;
      const u0 = flip ? 1 : 0;
      const u1 = flip ? 0 : 1;
      face(g, at(-hl, -hw), at(-hl, hw), at(hl, hw), at(hl, -hw), [0, 1, 0], [u0, 0, u1, 0, u1, 1, u0, 1], same(WHITE));
      const mesh = staticMesh(buildGeo(g), mats[s.kind][i % 2], false);
      mesh.receiveShadow = true;
      mesh.renderOrder = 2;
      this.ctx.scene.add(mesh);
    });
  }

  // ------------------------------------------------------------ бочки и блоки

  private buildSolids(solids: readonly Solid[]): void {
    const out = this.ctx.solid;
    for (const s of solids) {
      if (s.kind === 0) this.barrel(s, out);
      else this.block(s, out);
    }
  }

  private barrel(s: Solid, out: THREE.BufferGeometry[]): void {
    const c = BARREL_COLORS[(Math.round(s.ax / 3) * 7 + Math.round(s.az / 3) * 13) & 3];
    const dark = new THREE.Color(c).multiplyScalar(0.55);
    const { ax: x, az: z } = s;
    out.push(place(paint(new THREE.CylinderGeometry(BARREL_R, BARREL_R, 0.96, 18), c), x, 0.48, z));
    for (const y of [0.24, 0.72]) out.push(place(paint(new THREE.CylinderGeometry(BARREL_R + 0.018, BARREL_R + 0.018, 0.07, 18), dark), x, y, z));
    out.push(place(paint(new THREE.CylinderGeometry(BARREL_R - 0.04, BARREL_R, 0.05, 18), 0x4c4f55), x, 0.985, z));
    out.push(place(paint(new THREE.CylinderGeometry(BARREL_R - 0.12, BARREL_R - 0.12, 0.03, 18), 0x2a2d33), x, 1.01, z));
  }

  /** Бетонный блок — ступенчатый «джерси» с красно-белой полосой сверху: длина — вдоль капсулы, ширина — 2r */
  private block(s: Solid, out: THREE.BufferGeometry[]): void {
    const dx = s.bx - s.ax;
    const dz = s.bz - s.az;
    const l = Math.sqrt(dx * dx + dz * dz);
    const ry = l > 1e-6 ? Math.atan2(-dz, dx) : 0;
    const L = l + s.r * 2;
    const W = s.r * 2;
    const cx = (s.ax + s.bx) / 2;
    const cz = (s.az + s.bz) / 2;
    const box = (len: number, h: number, w: number, along: number, y: number, c: number): void => {
      // along — сдвиг вдоль оси блока
      const ox = Math.cos(ry) * along;
      const oz = -Math.sin(ry) * along;
      out.push(place(paint(new THREE.BoxGeometry(len, h, w), c), cx + ox, y + h / 2, cz + oz, ry));
    };
    box(L, 0.3, W, 0, 0, CONCRETE);
    box(L * 0.99, 0.38, W * 0.72, 0, 0.3, 0xd8d3c8);
    // верх — полосы по 0,75 м, красные и белые
    const n = Math.max(1, Math.round(L / 0.75));
    const w = L / n;
    for (let k = 0; k < n; k++) box(w, 0.27, W * 0.46, -L / 2 + w * (k + 0.5), 0.68, k % 2 ? OFFWHITE : RED);
  }

  // ------------------------------------------------------------ настилы срезки

  private buildDecks(decks: readonly Deck[]): void {
    if (!decks.length) return;
    const top = parts();
    const strip = parts();
    const fascia = parts();
    const wood = new THREE.Color(0xc79a6a);
    const dark = new THREE.Color(0x5a4632);
    for (const d of decks) {
      const rx = -d.fz;
      const rz = d.fx;
      const L = d.hl * 2;
      const slope = (d.y1 - d.y0) / L;
      const yAt = (a: number): number => d.y0 + slope * (a + d.hl) + DECK_Y;
      const P = (a: number, b: number, y = yAt(a)): V3 => [d.x + d.fx * a + rx * b, y, d.z + d.fz * a + rz * b];
      const nl = Math.sqrt(slope * slope + 1);
      const nrm: V3 = [(-d.fx * slope) / nl, 1 / nl, (-d.fz * slope) / nl];
      const u = d.hw / 2;
      face(top, P(-d.hl, -d.hw), P(-d.hl, d.hw), P(d.hl, d.hw), P(d.hl, -d.hw), nrm, [-u, 0, u, 0, u, L / 2, -u, L / 2], same(wood));
      // бока и торцы настила ниже досок
      const fl = (a0: number, b0: number, a1: number, b1: number, n: V3): void => {
        face(fascia, P(a0, b0), P(a1, b1), P(a1, b1, yAt(a1) - DECK_THICK), P(a0, b0, yAt(a0) - DECK_THICK), n, [0, 0, 1, 0, 1, 1, 0, 1], same(dark));
      };
      fl(-d.hl, -d.hw, d.hl, -d.hw, [-rx, 0, -rz]);
      fl(-d.hl, d.hw, d.hl, d.hw, [rx, 0, rz]);
      fl(d.hl, -d.hw, d.hl, d.hw, [d.fx, 0, d.fz]);
      fl(-d.hl, -d.hw, -d.hl, d.hw, [-d.fx, 0, -d.fz]);
      // сваи: два ряда по краям и поперечные балки между ними
      const count = Math.max(2, Math.round(L / PILE_STEP) + 1);
      for (let k = 0; k < count; k++) {
        const a = -d.hl + (L * k) / (count - 1);
        for (const b of [-d.hw + 0.5, d.hw - 0.5]) {
          const top0 = yAt(a) - DECK_THICK;
          const h = top0 - PILE_BOTTOM;
          const p = P(a, b, PILE_BOTTOM + h / 2);
          this.ctx.solid.push(place(paint(new THREE.CylinderGeometry(0.18, 0.21, h, 8), 0x4a3a2a), p[0], p[1], p[2]));
        }
      }
      if (Math.abs(slope) > 1e-6) {
        // подъём: жёлто-чёрные борта и полоса «опасность» на кромке
        const hs = (a0: number, a1: number, b: number, sd: number): void => {
          const o = b + sd * 0.16;
          const ua0 = a0 / 1.2;
          const ua1 = a1 / 1.2;
          const inn: V3 = [-rx * sd, 0, -rz * sd];
          const out: V3 = [rx * sd, 0, rz * sd];
          face(strip, P(a0, b), P(a1, b), P(a1, b, yAt(a1) + RAIL_H), P(a0, b, yAt(a0) + RAIL_H), inn, [ua0, 0, ua1, 0, ua1, 0.4, ua0, 0.4], same(WHITE));
          face(strip, P(a0, b, yAt(a0) + RAIL_H), P(a1, b, yAt(a1) + RAIL_H), P(a1, o, yAt(a1) + RAIL_H), P(a0, o, yAt(a0) + RAIL_H), [0, 1, 0], [ua0, 0, ua1, 0, ua1, 0.13, ua0, 0.13], same(WHITE));
          face(strip, P(a0, o, yAt(a0) - DECK_THICK), P(a1, o, yAt(a1) - DECK_THICK), P(a1, o, yAt(a1) + RAIL_H), P(a0, o, yAt(a0) + RAIL_H), out, [ua0, 0, ua1, 0, ua1, 0.9, ua0, 0.9], same(WHITE));
        };
        hs(-d.hl, d.hl, -d.hw, -1);
        hs(-d.hl, d.hl, d.hw, 1);
        const ly = (a: number): number => yAt(a) + 0.012;
        face(strip, P(d.hl - 1.2, -d.hw, ly(d.hl - 1.2)), P(d.hl - 1.2, d.hw, ly(d.hl - 1.2)), P(d.hl, d.hw, ly(d.hl)), P(d.hl, -d.hw, ly(d.hl)), nrm, [-d.hw / 1.2, 0, d.hw / 1.2, 0, d.hw / 1.2, 1, -d.hw / 1.2, 1], same(WHITE));
      }
    }
    const scene = this.ctx.scene;
    scene.add(staticMesh(buildGeo(top), new THREE.MeshStandardMaterial({ map: this.ctx.planks, vertexColors: true, roughness: 0.85 }), true));
    // склейка solid требует одинаковой индексации: у остальных частей индексов нет
    this.ctx.solid.push(buildGeo(fascia).toNonIndexed());
    scene.add(staticMesh(buildGeo(strip), new THREE.MeshStandardMaterial({
      map: this.ctx.hazard, roughness: 0.55, metalness: 0.3, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
    }), true));
  }

  // ------------------------------------------------------------ подвижные помехи

  private shadow(w: number, d: number): THREE.Mesh {
    this.shadowMat ??= new THREE.MeshBasicMaterial({
      map: tex.softDot('rgba(0,0,0,0.5)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.shadowMat);
    m.scale.set(w, 1, d);
    m.renderOrder = 3;
    this.ctx.scene.add(m);
    return m;
  }

  private buildMovers(movers: readonly Mover[]): void {
    const loc = makeLoc();
    let colorK = 0;
    const containerMat = new THREE.MeshStandardMaterial({ map: tex.containerTexture(), vertexColors: true, roughness: 0.62, metalness: 0.2 });
    for (const m of movers) {
      if (m.kind === MV_GATE) {
        const yaw = Math.atan2(-m.uz, m.ux);
        const lc = locateAny(this.tr, m.cx, m.cz, makeLoc());
        const axisX = m.cx - m.ux * lc.lat;
        const axisZ = m.cz - m.uz * lc.lat;
        const span = lc.hw + 1.6;
        for (const side of [-1, 1]) this.ctx.solid.push(place(paint(new THREE.BoxGeometry(0.5, 6.5, 0.6), STEEL), axisX + m.ux * span * side, 3.25, axisZ + m.uz * span * side, yaw));
        this.ctx.solid.push(place(paint(new THREE.BoxGeometry(span * 2 + 0.5, 0.5, 0.8), 0xc78d31), axisX, 6.3, axisZ, yaw));
        for (const side of [-1, 1]) this.ctx.solid.push(place(paint(new THREE.BoxGeometry(0.18, 1.2, 0.18), STEEL), m.cx + m.ux * m.h * side * 0.7, 5.45, m.cz + m.uz * m.h * side * 0.7));
        const beam = new THREE.Mesh(new THREE.BoxGeometry((m.h + m.r) * 2, 1.4, m.r * 2), new THREE.MeshStandardMaterial({ map: this.ctx.hazard, color: 0xffcc63, roughness: 0.6 }));
        beam.rotation.y = yaw;
        beam.position.set(m.cx, 4.2, m.cz);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshBasicMaterial({ color: 0x53f4a1, toneMapped: false }));
        lamp.position.set(m.cx, 5.2, m.cz);
        this.ctx.scene.add(beam, lamp);
        this.presses.push({ m, beam, lamp });
        // Yellow hatch footprint remains visible while the press is raised; the side lane is always clear.
        const footprint = new THREE.Mesh(new THREE.PlaneGeometry((m.h + m.r) * 2, 2.4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: this.ctx.hazard, transparent: true, opacity: 0.7, depthWrite: false }));
        footprint.position.set(m.cx, 0.046, m.cz);
        footprint.rotation.y = yaw;
        this.ctx.scene.add(footprint);
        continue;
      }
      if (m.kind === MV_SLIDE) {
        const L = (m.h + m.r) * 2;
        const W = m.r * 2;
        const color = CONTAINER_COLORS[colorK++ % CONTAINER_COLORS.length];
        const g = parts();
        addBox(g, { min: [-L / 2, 0.14, -W / 2], max: [L / 2, 2.73, W / 2], color, variant: colorK }, 'container', this.ctx.rng, 0.01);
        const mesh = new THREE.Mesh(buildGeo(g), containerMat);
        mesh.receiveShadow = true;
        this.ctx.scene.add(mesh);
        // тележка под контейнером и маячок на крыше
        const cart = place(paint(new THREE.BoxGeometry(L * 0.92, 0.14, W * 0.7), 0x30343a), 0, 0.07, 0);
        const cartMesh = new THREE.Mesh(cart, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.3 }));
        mesh.add(cartMesh);
        const beacon = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.3), new THREE.MeshBasicMaterial({ color: 0xffa21a, toneMapped: false }));
        beacon.position.set(L / 2 - 0.4, 2.84, 0);
        mesh.add(beacon);
        this.slides.push({ m, mesh, shadow: this.shadow(L + 1.2, W + 1.4), beacon, ry: Math.atan2(-m.uz, m.ux) });
        this.rails(m);
        this.gates.push({ ax: m.ax, az: m.az, bx: m.bx, bz: m.bz, r: m.r });
      } else if (m.kind === MV_SWING) {
        locateAny(this.tr, m.cx, m.cz, loc);
        this.swings.push(this.crane(m, loc.hw, loc.lat, containerMat, colorK++));
      } else {
        this.spins.push(this.spinner(m));
      }
    }
  }

  /** Рельсы контейнера: две нитки на шпалах от A до B и чуть дальше, упор у A */
  private rails(m: Mover): void {
    const out = this.ctx.solid;
    const lx = m.bx - m.ax;
    const lz = m.bz - m.az;
    const l = Math.sqrt(lx * lx + lz * lz);
    const ex = lx / l;
    const ez = lz / l;
    const ry = Math.atan2(-ez, ex);
    const px = -ez;
    const pz = ex;
    const x0 = -m.h - 0.6;
    const x1 = l + m.h + 0.6;
    const cx = m.ax + ex * ((x0 + x1) / 2);
    const cz = m.az + ez * ((x0 + x1) / 2);
    for (const s of [-0.85, 0.85]) {
      out.push(place(paint(new THREE.BoxGeometry(x1 - x0, 0.08, 0.14), STEEL), cx + px * s, 0.07, cz + pz * s, ry));
    }
    const n = Math.floor((x1 - x0) / 0.9);
    for (let k = 0; k <= n; k++) {
      const a = x0 + (k * (x1 - x0)) / n;
      out.push(place(paint(new THREE.BoxGeometry(0.22, 0.06, 2.2), 0x6b5238), m.ax + ex * a, 0.04, m.az + ez * a, ry));
    }
    // упор в начале пути: за ним контейнер стоит, как на стоянке
    const sx = m.ax - ex * (m.h + 0.9);
    const sz = m.az - ez * (m.h + 0.9);
    out.push(place(paint(new THREE.BoxGeometry(0.4, 0.7, 2.3), 0xd8a21c), sx, 0.35, sz, ry));
  }

  /** Портальный кран с грузом на тросах: колонна за стеной слева, консоль над дорогой, груз качается поперёк. */
  private crane(m: Mover, hw: number, lat: number, mat: THREE.Material, colorK: number): SwingVis {
    const out = this.ctx.solid;
    const ux = m.ux;
    const uz = m.uz;
    const fx = uz;
    const fz = -ux;
    const ry = Math.atan2(-fz, fx);
    const box = (len: number, h: number, w: number, x: number, y: number, z: number, c: number, rot = ry): void => {
      out.push(place(paint(new THREE.BoxGeometry(len, h, w), c), x, y + h / 2, z, rot));
    };
    // колонна: на расстоянии hw + 2,6 слева от оси дороги (с учётом сдвига центра качания)
    const off = hw + 2.6 + lat;
    const px = m.cx - ux * off;
    const pz = m.cz - uz * off;
    box(2.4, 0.7, 2.4, px, 0, pz, 0x8e8a82);
    box(1.0, PIVOT_Y + 1.6, 1.0, px, 0.7, pz, CRANE_RED);
    box(0.5, 0.5, 2.0, px, PIVOT_Y + 0.5, pz, CRANE_WHITE);
    // консоль от колонны над дорогой до её правого края, кабина и противовес за колонной
    const t0 = -1.6;
    const t1 = off + hw - lat + 0.4;
    const cx = px + ux * ((t0 + t1) / 2);
    const cz = pz + uz * ((t0 + t1) / 2);
    const jibRy = Math.atan2(-uz, ux);
    box(t1 - t0, 0.7, 0.7, cx, PIVOT_Y + 1.2, cz, CRANE_RED, jibRy);
    box(t1 - t0, 0.18, 0.2, cx, PIVOT_Y + 1.9, cz, CRANE_WHITE, jibRy);
    box(2.2, 1.6, 1.6, px - ux * 1.9, PIVOT_Y + 1.1, pz - uz * 1.9, 0x5a6470, jibRy);
    box(1.6, 1.8, 1.6, px + ux * 0.2 + fx * 1.3, PIVOT_Y - 0.8, pz + uz * 0.2 + fz * 1.3, CRANE_WHITE, jibRy);
    // тележка над грузом
    box(1.2, 0.5, 0.9, m.cx, PIVOT_Y + 0.55, m.cz, 0x3a4048, jibRy);

    const g = parts();
    addBox(g, { min: [-LOAD_L / 2, -LOAD_H / 2, -LOAD_W / 2], max: [LOAD_L / 2, LOAD_H / 2, LOAD_W / 2], color: CONTAINER_COLORS[colorK % CONTAINER_COLORS.length], variant: colorK }, 'container', this.ctx.rng, -9);
    const load = new THREE.Mesh(buildGeo(g), mat);
    load.receiveShadow = true;
    this.ctx.scene.add(load);
    const spreader = new THREE.Mesh(
      paint(new THREE.BoxGeometry(LOAD_L + 0.2, 0.2, LOAD_W * 0.55), 0x2d3036),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.4 }),
    );
    this.ctx.scene.add(spreader);
    const cableMat = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.7, metalness: 0.4 });
    const cables: THREE.Mesh[] = [];
    for (let i = 0; i < 2; i++) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1, 6), cableMat);
      this.ctx.scene.add(c);
      cables.push(c);
    }
    return { m, load, spreader, cables, shadow: this.shadow(3.4, 3.4), ux, uz, fx, fz, ry };
  }

  /** Шлагбаум-вертушка: опорная стойка с жёлто-чёрным кольцом и красно-белая стрела, которая крутится */
  private spinner(m: Mover): SpinVis {
    const out = this.ctx.solid;
    out.push(place(paint(new THREE.CylinderGeometry(0.6, 0.7, 0.3, 16), 0x6b6f76), m.ax, 0.15, m.az));
    out.push(place(paint(new THREE.CylinderGeometry(0.28, 0.32, 1.35, 14), 0x30343a), m.ax, 0.95, m.az));
    out.push(place(paint(new THREE.CylinderGeometry(0.34, 0.34, 0.14, 14), 0xf0c020), m.ax, 0.86, m.az));
    out.push(place(paint(new THREE.CylinderGeometry(0.22, 0.28, 0.12, 14), 0x30343a), m.ax, 1.68, m.az));
    const arm = new THREE.Group();
    arm.position.set(m.ax, 0, m.az);
    // стрела вдоль +X от оси на длину h (с короткой пятой у оси); при both — в обе стороны
    const beam = (x0: number, x1: number): void => {
      const n = Math.max(2, Math.round((x1 - x0) / 0.7));
      const w = (x1 - x0) / n;
      for (let k = 0; k < n; k++) {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(w * 0.98, m.r * 1.5, m.r * 2),
          new THREE.MeshStandardMaterial({ color: k % 2 ? OFFWHITE : RED, roughness: 0.55 }),
        );
        mesh.position.set(x0 + w * (k + 0.5), 0.52, 0);
        arm.add(mesh);
      }
      const bump = new THREE.Mesh(new THREE.CylinderGeometry(m.r * 0.9, m.r * 0.9, m.r * 2.1, 12), new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.8 }));
      bump.rotation.x = Math.PI / 2;
      bump.position.set(x1, 0.52, 0);
      arm.add(bump);
    };
    beam(0.25, m.h);
    if (m.arm0 < 0) beam(-m.h, -0.25);
    this.ctx.scene.add(arm);
    return { m, arm, shadow: this.shadow(m.h * 2 + 1, 1.6) };
  }

  // ------------------------------------------------------------ кадр

  /** Подвижные помехи — на момент rt (тики гонки, можно дробное): положения те же, что считает физика. */
  setTime(rt: number): void {
    this.time = rt;
    const cap = _cap;
    for (const p of this.presses) {
      const phase = gatePhase(p.m, rt);
      p.beam.position.y = phase === 2 ? 0.7 : 4.2;
      p.lamp.material.color.setHex(phase === 2 ? 0xff4a3d : phase === 1 ? 0xffbd39 : 0x53f4a1);
      p.lamp.scale.setScalar(phase === 1 ? 1 + 0.2 * Math.sin(rt * 0.5) : 1);
    }
    for (const s of this.slides) {
      moverCap(s.m, rt, cap);
      const x = (cap.ax + cap.bx) / 2;
      const z = (cap.az + cap.bz) / 2;
      s.mesh.position.set(x, 0, z);
      s.mesh.rotation.y = s.ry;
      s.shadow.position.set(x, 0.045, z);
      s.shadow.rotation.y = s.ry;
      // маячок мигает, пока контейнер едет
      const moving = Math.abs(cap.vx) + Math.abs(cap.vz) > 0.05;
      s.beacon.visible = moving ? Math.floor(rt / 10) % 2 === 0 : true;
    }
    for (const s of this.swings) this.placeLoad(s, rt);
    for (const s of this.spins) {
      const a = spinAngle(s.m, rt);
      s.arm.rotation.y = -a;
      s.shadow.position.set(s.m.ax + Math.cos(a) * s.m.h * 0.5, 0.045, s.m.az + Math.sin(a) * s.m.h * 0.5);
      s.shadow.rotation.y = -a;
    }
  }

  private placeLoad(s: SwingVis, rt: number): void {
    const m = s.m;
    const u = swingU(m, rt);
    // центр груза: от A к B по качанию (амплитуда — половина пути), у краёв приподнят
    const lx = (m.bx - m.ax) / 2;
    const lz = (m.bz - m.az) / 2;
    const x = m.cx + lx * u;
    const z = m.cz + lz * u;
    const y = LOAD_LOW + LOAD_H / 2 + LOAD_RISE * u * u;
    const roll = -0.35 * Math.atan2(Math.sqrt(lx * lx + lz * lz) * u, PIVOT_Y - y);
    _qa.setFromAxisAngle(UP, s.ry);
    _qb.setFromAxisAngle(_v1.set(s.fx, 0, s.fz), roll);
    s.load.position.set(x, y, z);
    s.load.quaternion.copy(_qb).multiply(_qa);
    const topY = y + LOAD_H / 2 + 0.1;
    s.spreader.position.set(x, topY, z);
    s.spreader.quaternion.copy(s.load.quaternion);
    s.shadow.position.set(x, 0.045, z);
    // тросы: от тележки (над центром пути) к двум концам траверсы
    s.cables.forEach((c, i) => {
      const side = i === 0 ? -1 : 1;
      _v1.set(m.cx, PIVOT_Y + 0.3, m.cz);
      _v2.set(x + s.fx * side * (LOAD_L / 2 - 0.1), topY + 0.1, z + s.fz * side * (LOAD_L / 2 - 0.1));
      _d.subVectors(_v2, _v1);
      const len = _d.length();
      c.position.addVectors(_v1, _v2).multiplyScalar(0.5);
      c.scale.set(1, len, 1);
      c.quaternion.setFromUnitVectors(UP, _d.divideScalar(len));
    });
  }

  /** Анимация плит-ускорителей: шевроны бегут вперёд. */
  update(dt: number): void {
    if (this.padTex) this.padTex.offset.y = (this.padTex.offset.y - dt * 0.2) % 1;
  }

  /** Время, на которое сейчас расставлены подвижные помехи */
  get at(): number {
    return this.time;
  }
}


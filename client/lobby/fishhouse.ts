// Дом рыбака Семёна на конце пирса (shared/fishplaces.ts — FISH_HOUSE, твёрдое — FISH_HOUSE_BOXES): дощатый сруб
// медового цвета с кремовыми наличниками и синими ставнями, двускатная крыша из тёмно-красной дранки, крыльцо под
// навесом лицом к мосткам, зелёная дверь с подковой, сети с поплавками на стене, бочки, ящики, спасательный круг,
// вёсла, фонарь «летучая мышь» у двери, кирпичная труба с дымком, вяленая рыба под навесом. Всё неподвижное склеено
// в одну сетку; отдельно — стёкла (тёплый свет изнутри), сеть (прозрачная текстура), фонарь и дымок.
import * as THREE from 'three';
import { FISH_HOUSE } from '../../shared/fishplaces.ts';
import { glowSprite, glowTexture, mergeColored, paint, place, staticMesh } from '../render/kit.ts';

const H = FISH_HOUSE;
const W = H.x1 - H.x0;
const D = H.z1 - H.z0;
const CX = (H.x0 + H.x1) / 2;
const CZ = (H.z0 + H.z1) / 2;
/** Крыша: уклон (м подъёма на м по горизонтали) и свесы */
const SLOPE = (H.ridge - H.wall) / (D / 2);
const EAVE = 0.38;
const GABLE = 0.3;

const PLANK = [0xc79d6c, 0xbd9263, 0xcfa776, 0xc3986a];
const SEAM = 0x7a5a3c;
const TRIM = 0xf1e6cc;
const ROOF = [0x9a4632, 0x8d3f2d, 0xa44f39];
const SHUTTER = 0x3f6f97;
const DOOR = 0x3f6b55;
const WOOD = 0x9b7650;
const DARK = 0x4a3a2a;
const BRICK = 0xa35b45;
const METAL = 0x3a3f42;
const ROPE = 0xcdb98c;

type G = THREE.BufferGeometry;
function box(out: G[], w: number, h: number, d: number, x: number, y: number, z: number, color: number, ry = 0, rx = 0): void {
  out.push(place(paint(new THREE.BoxGeometry(w, h, d), color), x, y, z, ry, rx));
}
function cyl(out: G[], r0: number, r1: number, h: number, x: number, y: number, z: number, color: number, seg = 10, rz = 0, rx = 0): void {
  const g = new THREE.CylinderGeometry(r0, r1, h, seg);
  if (rz) g.rotateZ(rz);
  if (rx) g.rotateX(rx);
  out.push(place(paint(g, color), x, y, z));
}

export class FishHouse3D {
  readonly group = new THREE.Group();
  private readonly lamp: THREE.Sprite;
  private readonly glass: THREE.MeshStandardMaterial;
  private readonly puffs: THREE.Sprite[] = [];
  private readonly puffAge: number[] = [];
  private readonly chimney = new THREE.Vector3(-17.3, 4.95, 62.45);
  private acc = 0;

  constructor(scene: THREE.Scene) {
    this.group.name = 'fish-house';
    const solid: G[] = [];
    const glass: G[] = [];
    this.walls(solid);
    this.roof(solid);
    this.porch(solid);
    this.openings(solid, glass);
    this.props(solid);
    const mesh = staticMesh(mergeColored(solid), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.02 }), true);
    this.group.add(mesh);
    this.glass = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.1, emissive: 0xffc985, emissiveIntensity: 0.22 });
    this.group.add(staticMesh(mergeColored(glass), this.glass, false));
    this.group.add(this.nets());
    // фонарь у двери: стекло светится, ореол — спрайт
    const lampAt = new THREE.Vector3(-21.05, 1.86, 58.72);
    const lantern: G[] = [];
    const lamp: G[] = [];
    cyl(lantern, 0.085, 0.1, 0.05, lampAt.x, lampAt.y - 0.16, lampAt.z, METAL, 8);
    cyl(lantern, 0.06, 0.085, 0.07, lampAt.x, lampAt.y + 0.13, lampAt.z, METAL, 8);
    cyl(lantern, 0.008, 0.008, 0.28, lampAt.x, lampAt.y + 0.31, lampAt.z, METAL, 4);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      cyl(lantern, 0.007, 0.007, 0.24, lampAt.x + Math.cos(a) * 0.075, lampAt.y - 0.01, lampAt.z + Math.sin(a) * 0.075, METAL, 4);
    }
    lamp.push(place(paint(new THREE.CylinderGeometry(0.058, 0.07, 0.22, 8), 0xffd28a), lampAt.x, lampAt.y - 0.02, lampAt.z));
    this.group.add(staticMesh(mergeColored(lantern), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.4 }), false));
    this.group.add(staticMesh(mergeColored(lamp), new THREE.MeshBasicMaterial({ vertexColors: true }), false));
    this.lamp = glowSprite(0xffc773, 0.9, 0.42);
    this.lamp.position.copy(lampAt);
    this.group.add(this.lamp);
    // дымок из трубы: несколько клубов по кругу
    const tex = glowTexture();
    for (let i = 0; i < 7; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xd6d3cc, transparent: true, depthWrite: false, opacity: 0 }));
      s.position.copy(this.chimney);
      this.puffs.push(s);
      this.puffAge.push(i / 7);
      this.group.add(s);
    }
    scene.add(this.group);
  }

  /** Дымок и фонарь; вдали — реже */
  update(dt: number, time: number, cam: THREE.Vector3, rain = 0): void {
    this.acc += dt;
    const far = (cam.x - CX) ** 2 + (cam.z - CZ) ** 2 > 70 * 70;
    if (far && this.acc < 0.2) return;
    const step = this.acc;
    this.acc = 0;
    const life = 4.2;
    for (let i = 0; i < this.puffs.length; i++) {
      let a = this.puffAge[i] + step / life;
      if (a >= 1) a -= 1;
      this.puffAge[i] = a;
      const s = this.puffs[i];
      // клуб поднимается, растёт и тает; ветер с моря сносит на восток
      s.position.set(this.chimney.x + a * 1.6 + Math.sin(time * 0.7 + i) * 0.08, this.chimney.y + a * 2.2, this.chimney.z + a * 0.35);
      const size = 0.35 + a * 1.25;
      s.scale.set(size, size, 1);
      (s.material as THREE.SpriteMaterial).opacity = Math.sin(a * Math.PI) * (0.42 - 0.15 * rain);
    }
    // фонарь чуть дрожит
    const flick = 0.42 + Math.sin(time * 7.1) * 0.03 + Math.sin(time * 12.7) * 0.02;
    (this.lamp.material as THREE.SpriteMaterial).opacity = flick;
    this.glass.emissiveIntensity = 0.2 + Math.sin(time * 1.3) * 0.02;
  }

  // ------------------------------------------------------------ сруб

  private walls(out: G[]): void {
    // цоколь и обвязка
    box(out, W + 0.12, 0.2, D + 0.12, CX, 0.1, CZ, DARK);
    // короб стен — основа; поверх — доски внахлёст (полосы с тенью под каждой)
    box(out, W, H.wall, D, CX, H.wall / 2, CZ, PLANK[0]);
    const n = Math.round((H.wall - 0.2) / 0.24);
    for (let i = 0; i < n; i++) {
      const y = 0.2 + i * 0.24 + 0.12;
      const c = PLANK[i % PLANK.length];
      // спереди и сзади
      for (const [z, s] of [[H.z0, -1], [H.z1, 1]] as const) {
        box(out, W + 0.02, 0.22, 0.03, CX, y + 0.01, z + s * 0.018, c);
        box(out, W + 0.02, 0.02, 0.035, CX, y - 0.105, z + s * 0.02, SEAM);
      }
      for (const [x, s] of [[H.x0, -1], [H.x1, 1]] as const) {
        box(out, 0.03, 0.22, D + 0.02, x + s * 0.018, y + 0.01, CZ, c);
        box(out, 0.035, 0.02, D + 0.02, x + s * 0.02, y - 0.105, CZ, SEAM);
      }
    }
    // угловые доски — кремовые
    for (const x of [H.x0, H.x1]) for (const z of [H.z0, H.z1]) box(out, 0.16, H.wall + 0.02, 0.16, x, H.wall / 2, z, TRIM);
    // фронтоны: треугольники досок над стенами (восток и запад)
    for (const [x, s] of [[H.x0, -1], [H.x1, 1]] as const) {
      const rows = Math.ceil((H.ridge - H.wall) / 0.24);
      for (let i = 0; i < rows; i++) {
        const y0 = H.wall + i * 0.24;
        const half = Math.max(0.05, D / 2 - (i * 0.24 + 0.12) / SLOPE);
        box(out, 0.05, 0.22, half * 2, x + s * 0.01, y0 + 0.12, CZ, PLANK[(i + 1) % PLANK.length]);
      }
      // круглое окошко-продух
      out.push(place(paint(new THREE.TorusGeometry(0.17, 0.035, 6, 14).rotateY(Math.PI / 2), TRIM), x + s * 0.045, H.wall + 0.62, CZ));
      out.push(place(paint(new THREE.CircleGeometry(0.15, 14).rotateY(s * Math.PI / 2), 0x2d3a40), x + s * 0.04, H.wall + 0.62, CZ));
    }
  }

  private roof(out: G[]): void {
    const run = D / 2 + EAVE;
    const len = Math.hypot(run, run * SLOPE);
    const ang = Math.atan(SLOPE);
    const w = W + GABLE * 2;
    // два ската: доска основы + ряды дранки внахлёст
    for (const s of [-1, 1]) {
      const midZ = CZ + s * (run / 2);
      const midY = H.ridge - (run / 2) * SLOPE + 0.06;
      box(out, w, 0.07, len, CX, midY, midZ, ROOF[1], 0, s * ang);
      const rows = Math.floor(len / 0.26);
      for (let r = 0; r < rows; r++) {
        const t = (r + 0.5) / rows;
        const z = CZ + s * run * t;
        const y = H.ridge - run * t * SLOPE + 0.1;
        // ряд разбит на дранки разного оттенка — лёгкая «рябь»
        const pieces = 9;
        for (let k = 0; k < pieces; k++) {
          const px = CX - w / 2 + (k + 0.5) * (w / pieces) + ((r % 2) * w) / pieces / 2 - w / pieces / 4;
          box(out, w / pieces - 0.02, 0.035, 0.3, px, y, z, ROOF[(k + r) % ROOF.length], 0, s * ang);
        }
      }
      // торцевые доски-ветровки по фронтонам
      for (const x of [H.x0 - GABLE + 0.04, H.x1 + GABLE - 0.04]) box(out, 0.08, 0.16, len, x, midY + 0.02, midZ, TRIM, 0, s * ang);
    }
    // конёк
    box(out, w + 0.04, 0.12, 0.2, CX, H.ridge + 0.12, CZ, ROOF[0]);
    // кирпичная труба на южном скате и колпак
    const cx = this.chimney.x;
    const cz = this.chimney.z;
    const base = H.ridge - (cz - CZ) * SLOPE - 0.3;
    const top = this.chimney.y - 0.12;
    for (let y = base, i = 0; y < top; y += 0.16, i++) box(out, 0.56, 0.15, 0.56, cx, y + 0.075, cz, i % 2 ? BRICK : 0x9a523e);
    box(out, 0.7, 0.07, 0.7, cx, top + 0.04, cz, METAL);
    for (const [dx, dz] of [[-0.28, -0.28], [0.28, -0.28], [-0.28, 0.28], [0.28, 0.28]]) box(out, 0.05, 0.14, 0.05, cx + dx, top + 0.14, cz + dz, METAL);
    box(out, 0.74, 0.05, 0.74, cx, top + 0.23, cz, METAL);
  }

  private porch(out: G[]): void {
    const z0 = H.z0 - H.porch;
    // настил крыльца — чуть выше пирса, доски поперёк
    for (let i = 0; i < 12; i++) {
      const x = H.x0 + 0.25 + i * ((W - 0.5) / 11);
      box(out, (W - 0.5) / 11 - 0.03, 0.05, H.porch, x, 0.025, z0 + H.porch / 2, i % 2 ? 0xa98457 : 0xb38e5f);
    }
    // стойки, балка, навес-односкат
    for (const x of [-21.85, -16.15]) {
      box(out, 0.15, 2.5, 0.15, x, 1.25, 58.55, WOOD);
      box(out, 0.24, 0.12, 0.24, x, 0.06, 58.55, DARK);
    }
    box(out, W + 0.3, 0.16, 0.16, CX, 2.42, 58.55, WOOD);
    const run = H.porch + 0.35;
    const drop = 0.28;
    const ang = Math.atan2(drop, run);
    const len = Math.hypot(run, drop);
    const zmid = H.z0 - run / 2;
    box(out, W + 0.5, 0.06, len, CX, 2.66 - drop / 2, zmid, ROOF[1], 0, -ang);
    for (let r = 0; r < 5; r++) {
      const t = (r + 0.5) / 5;
      box(out, W + 0.5, 0.03, 0.3, CX, 2.7 - drop * t, H.z0 - run * t, ROOF[r % ROOF.length], 0, -ang);
    }
    // ступенька с пирса на крыльцо
    box(out, W - 0.4, 0.04, 0.3, CX, 0.02, z0 - 0.15, 0x9b7a52);
    // вяленая рыба на бечёвке под навесом (между стойкой и стеной)
    const fy = 2.12;
    box(out, 0.012, 0.012, 1.0, -16.45, fy, 59.05, ROPE);
    for (let i = 0; i < 4; i++) {
      const z = 58.72 + i * 0.22;
      out.push(place(paint(new THREE.SphereGeometry(0.06, 7, 5).scale(0.45, 1.6, 0.9), i % 2 ? 0xb88a55 : 0xc49a62), -16.45, fy - 0.13, z));
      out.push(place(paint(new THREE.ConeGeometry(0.04, 0.07, 4).rotateX(Math.PI), 0x9c7447), -16.45, fy - 0.26, z));
    }
  }

  private openings(out: G[], glass: G[]): void {
    // дверь: рама, доски, ручка, подкова сверху
    const dx = H.door;
    const z = H.z0 - 0.06;
    box(out, 1.06, 2.08, 0.06, dx, 1.04, z, TRIM);
    for (let i = 0; i < 5; i++) box(out, 0.175, 1.94, 0.05, dx - 0.36 + i * 0.18, 0.99, z - 0.03, i % 2 ? DOOR : 0x467560);
    box(out, 0.86, 0.08, 0.04, dx, 0.5, z - 0.06, 0x355b49);
    box(out, 0.86, 0.08, 0.04, dx, 1.55, z - 0.06, 0x355b49);
    out.push(place(paint(new THREE.SphereGeometry(0.035, 8, 6), 0xc9a24a), dx + 0.31, 1.02, z - 0.09));
    out.push(place(paint(new THREE.TorusGeometry(0.1, 0.022, 5, 12, Math.PI * 1.3).rotateZ(-Math.PI * 0.15 + Math.PI), 0x8d9599), dx, 2.2, z - 0.02));
    // окна: спереди (между дверью и Семёном), по одному сбоку
    const win = (x: number, wz: number, ry: number): void => {
      const g: G[] = [];
      const gl: G[] = [];
      box(g, 0.98, 0.98, 0.07, 0, 0, 0, TRIM);
      gl.push(paint(new THREE.PlaneGeometry(0.8, 0.8).rotateY(Math.PI).translate(0, 0, -0.045), 0x2f4b5c));
      box(g, 0.05, 0.84, 0.03, 0, 0, -0.05, TRIM);
      box(g, 0.84, 0.05, 0.03, 0, 0, -0.05, TRIM);
      // подоконник и наличник сверху
      box(g, 1.12, 0.06, 0.16, 0, -0.52, -0.06, TRIM);
      box(g, 1.12, 0.1, 0.06, 0, 0.55, -0.03, TRIM);
      // ставни открыты по бокам, с прорезью-сердечком (просто ромб)
      for (const s of [-1, 1]) {
        box(g, 0.44, 0.96, 0.04, s * 0.74, 0, -0.03, SHUTTER);
        box(g, 0.44, 0.05, 0.05, s * 0.74, 0.3, -0.055, 0x335f82);
        box(g, 0.44, 0.05, 0.05, s * 0.74, -0.3, -0.055, 0x335f82);
        box(g, 0.08, 0.08, 0.05, s * 0.74, 0.02, -0.055, 0x1f3b55, 0, 0);
      }
      // ящик с цветами под окном
      box(g, 0.9, 0.18, 0.2, 0, -0.66, -0.13, 0x8a5a36);
      for (let k = 0; k < 5; k++) g.push(place(paint(new THREE.SphereGeometry(0.07, 7, 5), [0xe24c3c, 0xf2c230, 0xffffff, 0xe24c3c, 0xd96aa7][k]), -0.32 + k * 0.16, -0.52, -0.14));
      const m = new THREE.Matrix4().makeRotationY(ry);
      m.setPosition(x, 1.45, wz);
      for (const p of g) out.push(p.applyMatrix4(m));
      for (const p of gl) glass.push(p.applyMatrix4(m));
    };
    win(-18.75, H.z0 - 0.02, 0);
    win(H.x0 - 0.02, 61.6, Math.PI / 2);
    win(H.x1 + 0.02, 60.7, -Math.PI / 2);
    // окно на задней стене — к морю
    win(-19.0, H.z1 + 0.02, Math.PI);
  }

  private props(out: G[]): void {
    // бочки у западной стены (на обручах)
    for (const z of [62.3, 63.3]) {
      cyl(out, 0.4, 0.4, 0.9, -22.55, 0.45, z, 0x8b5e3a, 14);
      cyl(out, 0.42, 0.42, 0.06, -22.55, 0.42, z, 0x5d4a3b, 14);
      for (const y of [0.12, 0.8]) cyl(out, 0.415, 0.415, 0.05, -22.55, y, z, METAL, 14);
      cyl(out, 0.36, 0.36, 0.02, -22.55, 0.905, z, 0x6f4d32, 14);
    }
    // ящики штабелем у восточной стены
    const crate = (x: number, y: number, z: number, s: number, c: number): void => {
      box(out, s, s, s, x, y + s / 2, z, c);
      for (const dy of [0.12, s - 0.12]) box(out, s + 0.02, 0.07, s + 0.02, x, y + dy, z, 0x7c5a3a);
    };
    crate(-15.4, 0, 62.75, 0.62, 0xb08a5c);
    crate(-15.4, 0, 63.4, 0.62, 0xa47e52);
    crate(-15.4, 0.62, 63.05, 0.5, 0xb59060);
    // ящик с бухтой каната на крыльце
    crate(-21.55, 0, 59.3, 0.58, 0xa98457);
    for (let i = 0; i < 4; i++) out.push(place(paint(new THREE.TorusGeometry(0.2, 0.035, 5, 14).rotateX(Math.PI / 2), ROPE), -21.55, 0.6 + i * 0.04, 59.3));
    // спасательный круг на фасаде слева от двери
    out.push(place(paint(new THREE.TorusGeometry(0.27, 0.075, 8, 18), 0xe8642c), -21.3, 1.55, H.z0 - 0.08));
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      out.push(place(paint(new THREE.TorusGeometry(0.27, 0.079, 8, 3, 0.35).rotateZ(a - 0.17), 0xf3efe6), -21.3, 1.55, H.z0 - 0.08));
    }
    // вёсла крест-накрест на восточной стене
    for (const s of [-1, 1]) {
      const a = s * 0.55;
      out.push(place(paint(new THREE.CylinderGeometry(0.03, 0.03, 2.1, 6).rotateX(a), 0xc2a170), H.x1 + 0.06, 1.75, 63.0));
      out.push(place(paint(new THREE.BoxGeometry(0.03, 0.46, 0.13).rotateX(a), 0xa53c2c), H.x1 + 0.07, 1.75 + Math.cos(a) * 0.86, 63.0 + Math.sin(a) * 0.86));
    }
    // поплавки сетей гирляндой по западной стене и на крыльце
    for (let i = 0; i < 9; i++) {
      const z = 60.0 + i * 0.42;
      out.push(place(paint(new THREE.SphereGeometry(0.075, 8, 6), i % 2 ? 0xf3efe6 : 0xe8642c), H.x0 - 0.1, 2.28 - Math.sin((i / 8) * Math.PI) * 0.22, z));
    }
    // крючки, на которых висит сеть
    for (const z of [59.9, 61.5, 63.4]) box(out, 0.08, 0.05, 0.05, H.x0 - 0.05, 2.32, z, METAL);
    // удочки, прислонённые к стене у ящиков
    for (let i = 0; i < 3; i++) {
      const g = new THREE.CylinderGeometry(0.009, 0.016, 2.4, 6).rotateX(-0.18).rotateZ(0.08 * (i - 1));
      out.push(place(paint(g, i === 1 ? 0x2b3b33 : 0x3a2a1e), -14.95 + i * 0.13, 1.2, 62.05));
    }
  }

  /** Сеть на западной стене и на перилах крыльца: полупрозрачная текстура «ромбом», слегка провисшая */
  private nets(): THREE.Object3D {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const x = c.getContext('2d')!;
    x.clearRect(0, 0, 128, 128);
    x.strokeStyle = 'rgba(92,110,84,0.95)';
    x.lineWidth = 3;
    for (let i = -128; i < 256; i += 21) {
      x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 128, 128); x.stroke();
      x.beginPath(); x.moveTo(i, 128); x.lineTo(i + 128, 0); x.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 2);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.95 });
    const g = new THREE.PlaneGeometry(3.6, 1.7, 12, 6);
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) / 3.6 + 0.5;
      const v = p.getY(i) / 1.7 + 0.5;
      // провис между крючками и выпуклость от стены
      p.setZ(i, 0.06 + Math.sin(u * Math.PI * 2) * 0.03 + (1 - v) * 0.05);
      p.setY(i, p.getY(i) - Math.sin(u * Math.PI * 2) ** 2 * 0.12 * v);
    }
    g.computeVertexNormals();
    const net = new THREE.Mesh(g, mat);
    net.rotation.y = -Math.PI / 2;
    net.position.set(H.x0 - 0.02, 1.45, 61.65);
    const grp = new THREE.Group();
    grp.add(net);
    return grp;
  }
}

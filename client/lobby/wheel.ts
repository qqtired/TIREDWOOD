// Колесо обозрения у кафе в 3D (где колесо, как вертится, где кабинки — shared/wheel.ts): два белых обода-фермы на
// спицах с бегущими огоньками, ось на двух А-образных опорах, восемь цветных кабинок, которые всегда висят ровно;
// оградка вокруг места, где низко проходят кабинки, и арка с надписью над входом (помост и касса — боксы карты).
// Колесо и кабинки ставятся каждый кадр по часам отрисовки — тем же, по которым сервер везёт пассажиров.
import * as THREE from 'three';
import { CABIN_DROP, WHEEL, WHEEL_CABINS, WHEEL_GATE, WHEEL_HUB_Y, WHEEL_PRICE, WHEEL_R, cabinAt, wheelTurn } from '../../shared/wheel.ts';
import { mergeColored, paint, place } from '../render/kit.ts';

const WHITE = 0xf3f1ea;
const STEEL = 0xcfd6dd;
const FENCE = 0x2f7fb8;
const FONT = 'Rubik, system-ui, sans-serif';
/** Ободья — по обе стороны от плоскости кабинок; ступица шире ободьев (спицы сходятся к ней под углом) */
const RIM_X = 1.3;
const HUB_X = 1.75;
/** Ферма обода: внутреннее и внешнее кольцо */
const RING_IN = WHEEL_R - 0.24;
const RING_OUT = WHEEL_R + 0.24;
const SPOKES = 16;
const STRUTS = 48;
const BULBS_RIM = 48;
const BULBS_SPOKE = 5;
/** Ноги: от концов оси вниз и врозь */
const LEG_X = 2.35;
const LEG_Z = 4.6;
const PLATFORM_Y = 0.15;
const CABIN_COLORS = [0xe8402e, 0xff8a1c, 0xffc61a, 0x37b956, 0x1fb5a8, 0x1f7ae0, 0x8a4fd8, 0xff5c9e];

export class FerrisWheel {
  private readonly wheel = new THREE.Group();
  private readonly cabins: THREE.Mesh[] = [];
  private readonly bulbs: THREE.InstancedMesh;
  /** У каждого огонька: где он на бегущей волне и его цвет */
  private readonly bulbWave: number[] = [];
  private readonly bulbColor: THREE.Color[] = [];
  private readonly tmp = { y: 0, z: 0 };
  private readonly col = new THREE.Color();
  private lightAt = -1;

  constructor(scene: THREE.Scene) {
    // --- неподвижное: ноги, ось, оградка, арка
    const fixed: THREE.BufferGeometry[] = [];
    for (const sx of [-1, 1]) {
      const top = new THREE.Vector3(WHEEL.x + sx * HUB_X, WHEEL_HUB_Y, WHEEL.z);
      const feet = [-1, 1].map((sz) => new THREE.Vector3(WHEEL.x + sx * LEG_X, PLATFORM_Y, WHEEL.z + sz * LEG_Z));
      for (const f of feet) {
        fixed.push(bar(f, top, 0.15, WHITE));
        fixed.push(place(paint(new THREE.BoxGeometry(0.62, 0.3, 0.62), 0xb9b3a6), f.x, PLATFORM_Y + 0.15, f.z));
      }
      // распорки между ногами одной стороны (поперёк колеса их нет: там ходят кабинки)
      for (const k of [0.3, 0.62]) {
        const a = feet[0].clone().lerp(top, k);
        const b = feet[1].clone().lerp(top, k);
        fixed.push(bar(a, b, 0.07, WHITE));
      }
      fixed.push(place(paint(new THREE.BoxGeometry(0.5, 0.7, 0.7), STEEL), top.x + sx * 0.05, WHEEL_HUB_Y, WHEEL.z));
    }
    fixed.push(place(paint(new THREE.CylinderGeometry(0.2, 0.2, HUB_X * 2 + 0.5, 12).rotateZ(Math.PI / 2), STEEL), WHEEL.x, WHEEL_HUB_Y, WHEEL.z));
    this.fence(fixed);
    const fixedMesh = new THREE.Mesh(mergeColored(fixed), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.15 }));
    fixedMesh.castShadow = true;
    fixedMesh.matrixAutoUpdate = false;
    scene.add(fixedMesh);
    scene.add(sign(WHEEL_GATE.x + 1.2, WHEEL_GATE.z));

    // --- колесо: ободья-фермы, спицы, ступицы, оси кабинок; вертится вокруг оси x
    const spin: THREE.BufferGeometry[] = [];
    for (const sx of [-1, 1]) {
      const x = sx * RIM_X;
      for (const r of [RING_IN, RING_OUT]) spin.push(place(paint(new THREE.TorusGeometry(r, 0.065, 6, 120).rotateY(Math.PI / 2), WHITE), x, 0, 0));
      for (let i = 0; i < STRUTS; i++) {
        // зигзаг между кольцами
        const a0 = (i / STRUTS) * 2 * Math.PI;
        const a1 = ((i + 0.5) / STRUTS) * 2 * Math.PI;
        spin.push(bar(local(x, RING_IN, a0), local(x, RING_OUT, a1), 0.035, WHITE));
        spin.push(bar(local(x, RING_OUT, a1), local(x, RING_IN, a1 + Math.PI / STRUTS), 0.035, WHITE));
      }
      for (let i = 0; i < SPOKES; i++) {
        const a = ((i + 0.5) / SPOKES) * 2 * Math.PI;
        spin.push(bar(local(sx * HUB_X, 0.55, a), local(x, RING_IN, a), 0.045, STEEL));
      }
      spin.push(place(paint(new THREE.CylinderGeometry(0.75, 0.75, 0.16, 20).rotateZ(Math.PI / 2), 0xe8402e), sx * HUB_X, 0, 0));
    }
    for (let c = 0; c < WHEEL_CABINS; c++) {
      // ось подвеса кабинки — поперёк, от обода до обода
      const p = local(0, WHEEL_R, (c / WHEEL_CABINS) * 2 * Math.PI);
      spin.push(place(paint(new THREE.CylinderGeometry(0.06, 0.06, RIM_X * 2 + 0.1, 8).rotateZ(Math.PI / 2), STEEL), 0, p.y, p.z));
    }
    const spinMesh = new THREE.Mesh(mergeColored(spin), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.1 }));
    this.wheel.position.set(WHEEL.x, WHEEL_HUB_Y, WHEEL.z);
    this.wheel.add(spinMesh);

    // огоньки: по внешнему кольцу и вдоль спиц
    const spots: THREE.Vector3[] = [];
    for (const sx of [-1, 1]) {
      for (let i = 0; i < BULBS_RIM; i++) {
        spots.push(local(sx * (RIM_X + 0.07), RING_OUT, (i / BULBS_RIM) * 2 * Math.PI));
        this.bulbWave.push(i / BULBS_RIM);
        this.bulbColor.push(new THREE.Color(0xfff0c2));
      }
      for (let i = 0; i < SPOKES; i++) {
        const a = ((i + 0.5) / SPOKES) * 2 * Math.PI;
        for (let k = 1; k <= BULBS_SPOKE; k++) {
          const t = k / (BULBS_SPOKE + 1);
          const r = 0.55 + (RING_IN - 0.55) * t;
          spots.push(local(sx * (HUB_X + (RIM_X - HUB_X) * t + 0.06), r, a));
          this.bulbWave.push(t * 0.5);
          this.bulbColor.push(new THREE.Color(CABIN_COLORS[i % CABIN_COLORS.length]).lerp(new THREE.Color(0xffffff), 0.35));
        }
      }
    }
    this.bulbs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.075, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), spots.length);
    const m = new THREE.Matrix4();
    spots.forEach((s, i) => {
      this.bulbs.setMatrixAt(i, m.makeTranslation(s.x, s.y, s.z));
      this.bulbs.setColorAt(i, this.bulbColor[i]);
    });
    this.bulbs.computeBoundingSphere();
    this.wheel.add(this.bulbs);
    scene.add(this.wheel);

    // --- кабинки: висят ровно под своей осью
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.05 });
    for (let c = 0; c < WHEEL_CABINS; c++) {
      const mesh = new THREE.Mesh(cabin(CABIN_COLORS[c]), mat);
      this.cabins.push(mesh);
      scene.add(mesh);
    }
  }

  /** tick — часы отрисовки (дробные), time — секунды для огоньков. */
  update(tick: number, time: number): void {
    this.wheel.rotation.x = -wheelTurn(tick);
    for (let c = 0; c < this.cabins.length; c++) {
      const p = cabinAt(c, tick, this.tmp);
      this.cabins[c].position.set(WHEEL.x, p.y, p.z);
    }
    // огоньки: бегущая волна яркости — 20 раз в секунду хватает
    if (Math.abs(time - this.lightAt) < 0.05) return;
    this.lightAt = time;
    for (let i = 0; i < this.bulbColor.length; i++) {
      const k = 0.35 + 0.65 * Math.max(0, Math.sin((time * 0.9 - this.bulbWave[i]) * 2 * Math.PI * 3));
      this.bulbs.setColorAt(i, this.col.copy(this.bulbColor[i]).multiplyScalar(k));
    }
    this.bulbs.instanceColor!.needsUpdate = true;
  }

  /** Оградка вокруг места, где низко проходят кабинки (вход — с запада, у кассы): столбики и две перекладины. */
  private fence(out: THREE.BufferGeometry[]): void {
    const lines: Array<[number, number, number, number]> = [
      [25.6, 7.4, 25.6, 12.1],
      [25.6, 13.9, 25.6, 18.6],
      [28.4, 7.4, 28.4, 18.6],
      [25.6, 7.4, 28.4, 7.4],
      [25.6, 18.6, 28.4, 18.6],
    ];
    for (const [x0, z0, x1, z1] of lines) {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.max(1, Math.round(len / 1.15));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        out.push(place(paint(new THREE.BoxGeometry(0.07, 1.0, 0.07), FENCE), x0 + (x1 - x0) * t, PLATFORM_Y + 0.5, z0 + (z1 - z0) * t));
      }
      for (const y of [0.5, 0.95]) out.push(bar(new THREE.Vector3(x0, PLATFORM_Y + y, z0), new THREE.Vector3(x1, PLATFORM_Y + y, z1), 0.03, y > 0.9 ? WHITE : FENCE));
    }
  }
}

/** Точка на колесе (в его осях): x — поперёк, на расстоянии r от оси под углом a от низа. Так же считает cabinAt. */
function local(x: number, r: number, a: number): THREE.Vector3 {
  return new THREE.Vector3(x, -r * Math.cos(a), r * Math.sin(a));
}

/** Труба от a до b. */
function bar(a: THREE.Vector3, b: THREE.Vector3, r: number, color: number): THREE.BufferGeometry {
  const d = b.clone().sub(a);
  const g = new THREE.CylinderGeometry(r, r, d.length(), 6);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return paint(g, color);
}

/** Кабинка (начало координат — ось подвеса): крыша, стойки, борта по пояс со входом с запада, две скамейки. */
function cabin(color: number): THREE.BufferGeometry {
  const f = -CABIN_DROP;
  const p: THREE.BufferGeometry[] = [];
  const box = (w: number, h: number, d: number, c: number, x: number, y: number, z: number): void => {
    p.push(place(paint(new THREE.BoxGeometry(w, h, d), c), x, y, z));
  };
  const trim = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.75).getHex();
  // подвес и крыша с козырьком
  for (const x of [-0.75, 0.75]) box(0.07, 0.36, 0.07, STEEL, x, -0.15, 0);
  box(2.3, 0.1, 2.2, WHITE, 0, -0.38, 0);
  p.push(place(paint(new THREE.ConeGeometry(1.5, 0.3, 4).rotateY(Math.PI / 4).scale(1, 1, 0.95), color), 0, -0.18, 0));
  // пол и стойки
  box(2.1, 0.1, 2.0, 0x939aa1, 0, f - 0.05, 0);
  for (const x of [-1, 1]) for (const z of [-0.95, 0.95]) p.push(place(paint(new THREE.CylinderGeometry(0.045, 0.045, CABIN_DROP - 0.42, 6), WHITE), x, f + (CABIN_DROP - 0.42) / 2, z));
  // борта по пояс; на западе — проём для входа
  const h = 0.95;
  box(2.06, h, 0.05, color, 0, f + h / 2, -0.97);
  box(2.06, h, 0.05, color, 0, f + h / 2, 0.97);
  box(0.05, h, 1.9, color, 1.02, f + h / 2, 0);
  for (const z of [-0.7, 0.7]) box(0.05, h, 0.5, color, -1.02, f + h / 2, z);
  // поручень по верху бортов
  box(2.12, 0.06, 0.08, trim, 0, f + h, -0.97);
  box(2.12, 0.06, 0.08, trim, 0, f + h, 0.97);
  box(0.08, 0.06, 1.9, trim, 1.02, f + h, 0);
  // скамейки: сидят на высоте подушки «сидя» (0,3 м над полом)
  for (const sx of [-1, 1]) {
    box(0.42, 0.08, 1.85, 0xb07a4a, sx * 0.62, f + 0.26, 0);
    box(0.36, 0.22, 1.7, 0x5b6670, sx * 0.62, f + 0.11, 0);
  }
  return mergeColored(p);
}

/** Арка над входом с надписью (лицом на запад, к площади). */
function sign(x: number, z: number): THREE.Object3D {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 300;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#1f5f96';
  roundRect(ctx, 8, 8, 1008, 284, 40);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 10;
  roundRect(ctx, 22, 22, 980, 256, 30);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 104px ${FONT}`;
  ctx.fillText('КОЛЕСО ОБОЗРЕНИЯ', 512, 118, 940);
  // цена: число и нарисованная монетка (эмодзи монеты рисуется не везде)
  ctx.font = `800 64px ${FONT}`;
  const price = String(WHEEL_PRICE);
  const tail = ' · один оборот';
  const wPrice = ctx.measureText(price).width;
  const wTail = ctx.measureText(tail).width;
  const total = wPrice + 16 + 52 + wTail;
  let cx = 512 - total / 2;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffd35c';
  ctx.fillText(price, cx, 222);
  cx += wPrice + 16 + 26;
  coin(ctx, cx, 222, 26);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(tail, cx + 26, 222);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const g = new THREE.Group();
  const posts: THREE.BufferGeometry[] = [];
  for (const dz of [-1.0, 1.0]) posts.push(place(paint(new THREE.BoxGeometry(0.14, 3.0, 0.14), FENCE), x, PLATFORM_Y + 1.5, z + dz));
  posts.push(place(paint(new THREE.BoxGeometry(0.16, 0.16, 2.3), WHITE), x, PLATFORM_Y + 3.0, z));
  // оборот вывески — просто синяя доска (надпись — только с площади)
  posts.push(place(paint(new THREE.BoxGeometry(0.05, 0.8, 2.66), 0x1f5f96), x + 0.02, PLATFORM_Y + 3.46, z));
  const frame = new THREE.Mesh(mergeColored(posts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }));
  frame.castShadow = true;
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 0.76),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.2 }),
  );
  face.position.set(x - 0.01, PLATFORM_Y + 3.0 + 0.46, z);
  face.rotation.y = -Math.PI / 2;
  g.add(frame, face);
  return g;
}

function coin(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.fillStyle = '#c98a12';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = '#ffd35c';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.78, 0, 2 * Math.PI);
  ctx.fill();
  ctx.strokeStyle = '#c98a12';
  ctx.lineWidth = r * 0.14;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.45, 0, 2 * Math.PI);
  ctx.stroke();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

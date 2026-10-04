// Трасса «Портовой регаты» в бухте — стоит всегда, как аквапарк: канаты с поплавками по краям коридора, ворота 1–5
// (надувные пилоны с номерами), стартовая арка с табло (видно с площади: кто на каком месте), стартёр-желейка
// с клетчатым флагом на арке, пары жёлтых флажков (с «ёлочкой» на воде), буй, камни, маячок на камне, риф, лодки
// на якоре и трамплин. Гонщику — подсветка следующих ворот и маркер над ними; взятые на круге флажки — тусклые.
// Неподвижное склеено по материалам: на всю трассу — несколько десятков вызовов отрисовки.
import * as THREE from 'three';
import { WATER_Y } from '../../shared/constants.ts';
import { makeRng } from '../../shared/math.ts';
import type { Outfit } from '../../shared/outfit.ts';
import { E_ALIVE, E_GROUNDED } from '../../shared/protocol.ts';
import { regattaCourse, type RgCourse, type RgGate } from '../../shared/regattacourse.ts';
import { Avatar, type AvatarPose } from '../render/avatar.ts';
import { glowSprite, makeBoat, mergeColored, paint } from '../render/kit.ts';

/** Поплавки на канате — через столько метров */
const FLOAT_STEP = 2.2;
const ROPE_Y = WATER_Y + 0.1;
/**
 * Арка: пилоны — за канатом, балка на высоте, табло 16 × 8 м над ней (лицом на запад — к площади и к решётке):
 * с угла площади (~46 м) строка ника — с метр высотой, читается
 */
const ARCH_OUT = 1.6;
const BEAM_Y = 5.5;
const BOARD_W = 16;
const BOARD_H = 8;
const STARTER: Outfit = { c: 15, c2: 0, p: 'none', e: 'normal', h: 'sailor', a: 'none' };
/** Площадка стартёра на северном пилоне — над водой */
const STARTER_Y = 2.7;

export interface RgBoardRow {
  place: string;
  nick: string;
  info: string;
  me: boolean;
  /** 1–3 — медаль у места */
  medal: number;
}

export interface RgBoardData {
  title: string;
  phase: string;
  rows: RgBoardRow[];
  foot: string;
}

/** Плоский четырёхугольник на воде: центр, ось u (поперёк) и v (вдоль), половины сторон. */
function waterQuad(cx: number, cz: number, ux: number, uz: number, hu: number, vx: number, vz: number, hv: number, y: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const p = [
    cx - ux * hu - vx * hv, y, cz - uz * hu - vz * hv,
    cx + ux * hu - vx * hv, y, cz + uz * hu - vz * hv,
    cx + ux * hu + vx * hv, y, cz + uz * hu + vz * hv,
    cx - ux * hu + vx * hv, y, cz - uz * hu + vz * hv,
  ];
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  // обход против часовой, если смотреть сверху (u × v вниз — меняем порядок)
  const up = ux * vz - uz * vx > 0;
  g.setIndex(up ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]);
  return g;
}

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function numberSprite(n: number): THREE.SpriteMaterial {
  const map = canvasTexture(128, 128, (g) => {
    g.fillStyle = '#fff3de';
    g.beginPath();
    g.arc(64, 64, 58, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 8;
    g.strokeStyle = '#e8702a';
    g.stroke();
    g.fillStyle = '#23404e';
    g.font = '900 76px Rubik,system-ui,sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(n), 64, 68);
  });
  return new THREE.SpriteMaterial({ map, depthWrite: false });
}

/** Края коридора: точки левого и правого каната (по нормали к среднему направлению соседних отрезков). */
function edgeLines(c: RgCourse): [number[], number[]] {
  const tr = c.track;
  const left: number[] = [];
  const right: number[] = [];
  for (let i = 0; i < tr.n; i++) {
    const j = (i + tr.n - 1) % tr.n;
    let dx = tr.tx[i] + tr.tx[j];
    let dz = tr.tz[i] + tr.tz[j];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    const hw = tr.hw[i];
    // вправо по ходу — (−dz, dx)
    right.push(tr.px[i] - dz * hw, tr.pz[i] + dx * hw);
    left.push(tr.px[i] + dz * hw, tr.pz[i] - dx * hw);
  }
  return [left, right];
}

/** Лента каната по замкнутой ломаной */
function ropeGeometry(lines: number[][], width: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (const line of lines) {
    const n = line.length / 2;
    const base = pos.length / 3;
    for (let i = 0; i < n; i++) {
      const a = (i + n - 1) % n;
      const b = (i + 1) % n;
      let dx = line[b * 2] - line[a * 2];
      let dz = line[b * 2 + 1] - line[a * 2 + 1];
      const l = Math.hypot(dx, dz) || 1;
      dx /= l;
      dz /= l;
      const x = line[i * 2];
      const z = line[i * 2 + 1];
      pos.push(x - dz * width, ROPE_Y, z + dx * width, x + dz * width, ROPE_Y, z - dx * width);
    }
    for (let i = 0; i < n; i++) {
      const a = base + i * 2;
      const b = base + ((i + 1) % n) * 2;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Камень: икосаэдр с неровностями, на треть в воде */
function rockGeometry(x: number, z: number, r: number, rnd: () => number, flat = 0.75): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.getAttribute('position');
  // Неровность — по ПОЗИЦИИ вершины, а не по её номеру в списке. Геометрия без индексов: одна и та же точка входит в несколько
  // граней отдельными вершинами, и со своим случайным сдвигом у каждой грань отрывалась от соседей — камень рассыпался
  // осколками со щелями, сквозь которые были видны вода и буйки («полупрозрачные камни»). Теперь общая точка уходит одинаково.
  const kAt = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    const key = `${Math.round(p.getX(i) * 1000)},${Math.round(p.getY(i) * 1000)},${Math.round(p.getZ(i) * 1000)}`;
    let k = kAt.get(key);
    if (k === undefined) {
      k = 0.85 + rnd() * 0.3;
      kAt.set(key, k);
    }
    p.setXYZ(i, p.getX(i) * k * r * 1.05, p.getY(i) * k * r * flat, p.getZ(i) * k * r * 1.05);
  }
  g.rotateY(rnd() * Math.PI);
  g.translate(x, WATER_Y + r * 0.12, z);
  // икосаэдр в three.js и так без индексов: грани — отдельными треугольниками
  const out = g.index ? g.toNonIndexed() : g;
  if (out !== g) g.dispose();
  out.computeVertexNormals();
  const col = new Float32Array(out.getAttribute('position').count * 3);
  const base = new THREE.Color(0x8b8274);
  const c = new THREE.Color();
  for (let i = 0; i < col.length; i += 9) {
    c.copy(base).offsetHSL(0, 0, (rnd() - 0.5) * 0.12);
    for (let k = 0; k < 9; k += 3) {
      col[i + k] = c.r;
      col[i + k + 1] = c.g;
      col[i + k + 2] = c.b;
    }
  }
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.deleteAttribute('uv');
  return out;
}

function at(g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0): THREE.BufferGeometry {
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

interface Pennant {
  mesh: THREE.Mesh;
  yaw: number;
  phase: number;
  flag: number;
}

export class RegattaCourse3D {
  readonly root = new THREE.Group();
  readonly course: RgCourse = regattaCourse();
  private readonly strips: THREE.Mesh[] = [];
  private readonly stripMat: THREE.MeshBasicMaterial;
  private readonly marker: THREE.Mesh;
  private readonly pennants: Pennant[] = [];
  private readonly penLit: THREE.MeshStandardMaterial;
  private readonly penDim: THREE.MeshStandardMaterial;
  private readonly chevrons: THREE.Mesh[] = [];
  private readonly chevLit: THREE.MeshBasicMaterial;
  private readonly chevDim: THREE.MeshBasicMaterial;
  private readonly floaters: Array<{ obj: THREE.Object3D; y: number; phase: number }> = [];
  private readonly beaconGlow: THREE.Sprite;
  private readonly board: CanvasRenderingContext2D;
  private readonly boardTex: THREE.CanvasTexture;
  private boardKey = '';
  /** Стартёр на арке: где стоит (мир), куда смотрит, флаг в руке */
  readonly starter: Avatar;
  private readonly starterPose: AvatarPose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flags: E_ALIVE | E_GROUNDED };
  private readonly flag = new THREE.Group();
  private readonly ground = { groundBelow: (_x: number, _y: number, _z: number) => 0 };
  private taken = -1;
  private next = -2;

  constructor(scene: THREE.Scene) {
    this.root.name = 'regatta-course';
    const c = this.course;
    const rnd = makeRng(4242);
    // --- канаты и поплавки
    const [left, right] = edgeLines(c);
    const ropeMat = new THREE.MeshStandardMaterial({ color: 0xf3ead6, roughness: 0.8 });
    const rope = new THREE.Mesh(ropeGeometry([left, right], 0.04), ropeMat);
    rope.name = 'regatta-rope';
    this.root.add(rope);
    const spots: number[] = [];
    for (const line of [left, right]) {
      const n = line.length / 2;
      let carry = 0;
      for (let i = 0; i < n; i++) {
        const b = (i + 1) % n;
        const ax = line[i * 2];
        const az = line[i * 2 + 1];
        const dx = line[b * 2] - ax;
        const dz = line[b * 2 + 1] - az;
        const l = Math.hypot(dx, dz);
        let s = carry;
        while (s < l) {
          spots.push(ax + (dx * s) / l, az + (dz * s) / l);
          s += FLOAT_STEP;
        }
        carry = s - l;
      }
    }
    const floatGeo = new THREE.SphereGeometry(0.21, 10, 7);
    floatGeo.scale(1, 0.75, 1);
    const floats = new THREE.InstancedMesh(floatGeo, new THREE.MeshStandardMaterial({ roughness: 0.45 }), spots.length / 2);
    floats.name = 'regatta-floats';
    const m = new THREE.Matrix4();
    const red = new THREE.Color(0xe0473a);
    const white = new THREE.Color(0xf6f1e4);
    for (let k = 0; k < spots.length / 2; k++) {
      m.makeTranslation(spots[k * 2], WATER_Y + 0.07, spots[k * 2 + 1]);
      floats.setMatrixAt(k, m);
      floats.setColorAt(k, k % 6 < 3 ? red : white);
    }
    floats.instanceMatrix.needsUpdate = true;
    this.root.add(floats);
    // --- ворота 1–5: пилоны с номерами, полоса на воде (горит у следующих)
    const pylons: THREE.BufferGeometry[] = [];
    this.stripMat = new THREE.MeshBasicMaterial({ color: 0xffd35a, transparent: true, opacity: 0.5, depthWrite: false });
    for (let k = 1; k < c.gates.length; k++) {
      const g = c.gates[k];
      const rx = -g.tz;
      const rz = g.tx;
      for (const side of [-1, 1]) {
        const x = g.x + rx * (g.hw + 0.45) * side;
        const z = g.z + rz * (g.hw + 0.45) * side;
        pylons.push(paint(at(new THREE.CylinderGeometry(0.62, 0.66, 0.32, 14), x, WATER_Y + 0.08, z), 0x2c4b5a));
        pylons.push(paint(at(new THREE.CylinderGeometry(0.16, 0.5, 2.6, 14), x, WATER_Y + 1.4, z), 0xf07a32));
        pylons.push(paint(at(new THREE.CylinderGeometry(0.33, 0.37, 0.36, 14), x, WATER_Y + 1.55, z), 0xfff3de));
        const num = new THREE.Sprite(numberSprite(k));
        num.scale.setScalar(1.15);
        num.position.set(x, WATER_Y + 3.35, z);
        this.root.add(num);
      }
      const strip = new THREE.Mesh(waterQuad(g.x, g.z, rx, rz, g.hw, g.tx, g.tz, 0.45, WATER_Y + 0.035), this.stripMat);
      strip.visible = false;
      strip.renderOrder = 2;
      this.strips[k] = strip;
      this.root.add(strip);
    }
    const pylonMesh = new THREE.Mesh(mergeColored(pylons), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }));
    pylonMesh.castShadow = true;
    this.root.add(pylonMesh);
    // маркер над следующими воротами: ромб острием вниз
    const markerGeo = new THREE.OctahedronGeometry(0.55, 0);
    markerGeo.scale(1, 1.5, 1);
    this.marker = new THREE.Mesh(markerGeo, new THREE.MeshStandardMaterial({ color: 0xffd35a, emissive: 0x8a5a00, emissiveIntensity: 0.9, roughness: 0.35 }));
    this.marker.visible = false;
    this.root.add(this.marker);
    // --- стартовая арка с табло и клетчатой линией
    const boardCanvas = document.createElement('canvas');
    boardCanvas.width = 1024;
    boardCanvas.height = 512;
    this.board = boardCanvas.getContext('2d')!;
    this.boardTex = new THREE.CanvasTexture(boardCanvas);
    this.boardTex.colorSpace = THREE.SRGBColorSpace;
    this.boardTex.anisotropy = 8;
    this.strips[0] = this.buildArch(c.gates[0]);
    // --- флажки
    this.penLit = new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0x6b4a00, emissiveIntensity: 0.35, roughness: 0.6, side: THREE.DoubleSide });
    this.penDim = new THREE.MeshStandardMaterial({ color: 0xb9ad84, roughness: 0.9, side: THREE.DoubleSide, transparent: true, opacity: 0.55 });
    const chevTex = canvasTexture(128, 256, (g) => {
      g.clearRect(0, 0, 128, 256);
      g.fillStyle = 'rgba(255,214,70,0.95)';
      for (const y0 of [36, 132]) {
        g.beginPath();
        g.moveTo(64, y0);
        g.lineTo(122, y0 + 70);
        g.lineTo(98, y0 + 88);
        g.lineTo(64, y0 + 42);
        g.lineTo(30, y0 + 88);
        g.lineTo(6, y0 + 70);
        g.closePath();
        g.fill();
      }
    });
    this.chevLit = new THREE.MeshBasicMaterial({ map: chevTex, transparent: true, opacity: 0.75, depthWrite: false });
    this.chevDim = new THREE.MeshBasicMaterial({ map: chevTex, transparent: true, opacity: 0.16, depthWrite: false });
    const penGeo = new THREE.BufferGeometry();
    penGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, -0.32, 0, 0, 0.32, 0, 0.95, 0, 0], 3));
    penGeo.computeVertexNormals();
    const flagParts: THREE.BufferGeometry[] = [];
    c.flags.forEach((f, i) => {
      const rx = -f.tz;
      const rz = f.tx;
      for (const side of [-1, 1]) {
        const x = f.x + rx * (f.hw + 0.12) * side;
        const z = f.z + rz * (f.hw + 0.12) * side;
        flagParts.push(paint(at(new THREE.CylinderGeometry(0.3, 0.32, 0.34, 12), x, WATER_Y + 0.08, z), 0xffc42e));
        flagParts.push(paint(at(new THREE.CylinderGeometry(0.045, 0.05, 2.5, 6), x, WATER_Y + 1.3, z), 0x5a4636));
        const pen = new THREE.Mesh(penGeo, this.penLit);
        pen.position.set(x, WATER_Y + 2.15, z);
        // флажок смотрит внутрь, к просвету
        const yaw = Math.atan2(rz * side, -rx * side);
        pen.rotation.y = yaw;
        this.root.add(pen);
        this.pennants.push({ mesh: pen, yaw, phase: i * 1.7 + side, flag: i });
      }
      const chev = new THREE.Mesh(waterQuad(f.x, f.z, rx, rz, Math.max(1, f.hw - 0.5), f.tx, f.tz, 1.6, WATER_Y + 0.03), this.chevLit);
      chev.renderOrder = 2;
      this.chevrons.push(chev);
      this.root.add(chev);
    });
    const flagMesh = new THREE.Mesh(mergeColored(flagParts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }));
    flagMesh.castShadow = true;
    this.root.add(flagMesh);
    // --- препятствия
    const rocks: THREE.BufferGeometry[] = [];
    let beacon: { x: number; z: number } | null = null;
    for (const o of c.obstacles) {
      if (o.kind === 'rock') rocks.push(rockGeometry(o.ax, o.az, o.r, rnd));
      else if (o.kind === 'reef') {
        const len = Math.hypot(o.bx - o.ax, o.bz - o.az);
        const n = Math.max(2, Math.round(len / 1.5));
        for (let i = 0; i <= n; i++) {
          const t = i / n;
          rocks.push(rockGeometry(o.ax + (o.bx - o.ax) * t + (rnd() - 0.5) * 0.4, o.az + (o.bz - o.az) * t + (rnd() - 0.5) * 0.4, o.r * (0.7 + rnd() * 0.35), rnd, 0.55));
        }
      } else if (o.kind === 'beacon') {
        rocks.push(rockGeometry(o.ax, o.az, o.r, rnd, 0.6));
        beacon = { x: o.ax, z: o.az };
      } else if (o.kind === 'buoy') this.buildBuoy(o.ax, o.az);
      else if (o.kind === 'moored') this.buildMoored(o.ax, o.az, o.bx, o.bz, rnd);
    }
    const rockMesh = new THREE.Mesh(mergeColored(rocks), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }));
    rockMesh.castShadow = rockMesh.receiveShadow = true;
    rockMesh.name = 'regatta-rocks';
    this.root.add(rockMesh);
    this.beaconGlow = glowSprite(0xffcf6a, 2.6, 0);
    if (beacon) this.buildBeacon(beacon.x, beacon.z);
    this.buildRamp();
    // --- стартёр
    this.starter = new Avatar(-77, { voice: false });
    this.starter.setOutfit(STARTER);
    this.starter.setInfo('', null, false);
    this.starter.hands = [-0.42, 0.62, -0.1, 0.42, 1.42, -0.12];
    this.buildFlag();
    this.starter.held.add(this.flag);
    this.starter.addTo(scene);
    this.setBoard({ title: 'ПОРТОВАЯ РЕГАТА', phase: '', rows: [], foot: '' });
    scene.add(this.root);
  }

  /** Арка над линией старта: пилоны на понтонах, балка, табло (спереди — места, сзади — название), клетка на воде. */
  private buildArch(g: RgGate): THREE.Mesh {
    const arch = new THREE.Group();
    arch.name = 'regatta-arch';
    arch.position.set(g.x, WATER_Y, g.z);
    // локальная z — по ходу гонки, локальная x — поперёк (к северу у этой арки)
    arch.rotation.y = Math.atan2(g.tx, g.tz);
    const half = g.hw + ARCH_OUT;
    const parts: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      const x = side * half;
      parts.push(paint(new THREE.BoxGeometry(3, 0.9, 3).translate(x, 0.1, 0), 0xa8473a));
      parts.push(paint(new THREE.BoxGeometry(1.3, BEAM_Y + 0.4, 1.3).translate(x, (BEAM_Y + 0.4) / 2 + 0.3, 0), 0x2f5d73));
      for (const y of [1.6, 3.2, 4.6]) parts.push(paint(new THREE.BoxGeometry(1.38, 0.32, 1.38).translate(x, y, 0), 0xfff3de));
    }
    parts.push(paint(new THREE.BoxGeometry(half * 2 + 1.6, 0.8, 1.3).translate(0, BEAM_Y + 0.4, 0), 0xfff3de));
    parts.push(paint(new THREE.BoxGeometry(half * 2 + 1.6, 0.18, 1.34).translate(0, BEAM_Y + 0.02, 0), 0x2f5d73));
    // рама табло и вышка стартёра у северного пилона (площадка с перилами, лицом к решётке)
    parts.push(paint(new THREE.BoxGeometry(BOARD_W + 0.6, BOARD_H + 0.6, 0.3).translate(0, BEAM_Y + 0.8 + BOARD_H / 2, 0), 0x2f5d73));
    parts.push(paint(new THREE.BoxGeometry(1.8, 0.2, 1.6).translate(half, STARTER_Y - 0.1, -1.45), 0xa8473a));
    parts.push(paint(new THREE.BoxGeometry(1.8, 0.5, 0.08).translate(half, STARTER_Y + 0.25, -2.22), 0xfff3de));
    const frame = new THREE.Mesh(mergeColored(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }));
    frame.castShadow = true;
    arch.add(frame);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(BOARD_W, BOARD_H), new THREE.MeshBasicMaterial({ map: this.boardTex, toneMapped: false }));
    front.position.set(0, BEAM_Y + 0.8 + BOARD_H / 2, -0.17);
    front.rotation.y = Math.PI;
    front.name = 'regatta-board';
    arch.add(front);
    const backTex = canvasTexture(1024, 512, (x) => {
      x.fillStyle = '#1f4a5a';
      x.fillRect(0, 0, 1024, 512);
      checkerBar(x, 0, 1024, 40);
      checkerBar(x, 472, 1024, 40);
      x.fillStyle = '#fff3de';
      x.font = '900 110px Rubik,system-ui,sans-serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText('ПОРТОВАЯ', 512, 190);
      x.fillText('РЕГАТА', 512, 320);
    });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(BOARD_W, BOARD_H), new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.8 }));
    back.position.set(0, BEAM_Y + 0.8 + BOARD_H / 2, 0.17);
    arch.add(back);
    this.root.add(arch);
    arch.updateMatrixWorld(true);
    // стартёр — на вышке у северного пилона, лицом против хода (к решётке и площади)
    const spot = new THREE.Vector3(half, STARTER_Y, -1.45).applyMatrix4(arch.matrixWorld);
    this.starterPose.x = spot.x;
    this.starterPose.y = spot.y;
    this.starterPose.z = spot.z;
    this.starterPose.yaw = Math.atan2(g.tx, g.tz);
    this.ground.groundBelow = () => spot.y;
    // клетка на воде
    const checker = canvasTexture(256, 32, (x) => checkerBar(x, 0, 256, 32));
    checker.wrapS = THREE.RepeatWrapping;
    checker.repeat.set(Math.round(g.hw / 2), 1);
    const line = new THREE.Mesh(waterQuad(g.x, g.z, -g.tz, g.tx, g.hw, g.tx, g.tz, 0.7, WATER_Y + 0.035), new THREE.MeshBasicMaterial({ map: checker, transparent: true, opacity: 0.85, depthWrite: false }));
    line.renderOrder = 2;
    this.root.add(line);
    // подсветка «финиш круга — следующая» поверх клетки
    const strip = new THREE.Mesh(waterQuad(g.x, g.z, -g.tz, g.tx, g.hw, g.tx, g.tz, 0.75, WATER_Y + 0.04), this.stripMat);
    strip.visible = false;
    strip.renderOrder = 3;
    this.root.add(strip);
    return strip;
  }

  private buildBuoy(x: number, z: number): void {
    const parts = [
      paint(new THREE.CylinderGeometry(0.75, 0.9, 0.75, 16).translate(0, 0.05, 0), 0xd8402f),
      paint(new THREE.CylinderGeometry(0.66, 0.74, 0.3, 16).translate(0, 0.55, 0), 0xfff3de),
      paint(new THREE.ConeGeometry(0.62, 1.1, 16).translate(0, 1.25, 0), 0xd8402f),
      paint(new THREE.SphereGeometry(0.18, 10, 8).translate(0, 1.9, 0), 0x2f5d73),
    ];
    const buoy = new THREE.Mesh(mergeColored(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }));
    buoy.castShadow = true;
    buoy.position.set(x, WATER_Y, z);
    this.root.add(buoy);
    this.floaters.push({ obj: buoy, y: WATER_Y, phase: x * 0.3 });
  }

  private buildMoored(ax: number, az: number, bx: number, bz: number, rnd: () => number): void {
    const boat = makeBoat(rnd() < 0.5 ? 0x3c7d8f : 0xd9a441);
    // корпус makeBoat: нос по +z (от −3 до 4 м) — кладём вдоль отрезка a → b
    boat.scale.set(0.78, 0.85, 1);
    boat.rotation.y = Math.atan2(bx - ax, bz - az);
    const cx = (ax + bx) / 2;
    const cz = (az + bz) / 2;
    const l = Math.hypot(bx - ax, bz - az) || 1;
    boat.position.set(cx - ((bx - ax) / l) * 0.5, WATER_Y - 0.35, cz - ((bz - az) / l) * 0.5);
    boat.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
    this.root.add(boat);
    this.floaters.push({ obj: boat, y: WATER_Y - 0.35, phase: ax });
  }

  private buildBeacon(x: number, z: number): void {
    const parts: THREE.BufferGeometry[] = [];
    const base = WATER_Y + 0.9;
    for (let i = 0; i < 4; i++) {
      parts.push(paint(new THREE.CylinderGeometry(0.4 - i * 0.03, 0.43 - i * 0.03, 0.75, 14).translate(x, base + 0.38 + i * 0.75, z), i % 2 ? 0xfff3de : 0xd8402f));
    }
    parts.push(paint(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 14).translate(x, base + 3.06, z), 0x2f5d73));
    parts.push(paint(new THREE.ConeGeometry(0.4, 0.45, 14).translate(x, base + 3.78, z), 0x2f5d73));
    const tower = new THREE.Mesh(mergeColored(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }));
    tower.castShadow = true;
    this.root.add(tower);
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.45, 12), new THREE.MeshStandardMaterial({ color: 0xffe2a0, emissive: 0xffb84a, emissiveIntensity: 1.2, roughness: 0.3 }));
    lamp.position.set(x, base + 3.35, z);
    this.root.add(lamp);
    this.beaconGlow.position.set(x, base + 3.35, z);
    this.root.add(this.beaconGlow);
  }

  /** Трамплин: клин из воды вверх к кромке (по ходу — на север), полосатая кромка, поплавки под ним. */
  private buildRamp(): void {
    const r = this.course.ramp;
    // поверхность чуть ниже катера на ней (корпус — на 0,3 м ниже середины)
    const y0 = WATER_Y - 0.3;
    const y1 = WATER_Y + r.h - 0.3;
    const yb = WATER_Y - 0.6;
    const v = (x: number, y: number, z: number) => [x, y, z];
    const tri: number[] = [];
    const quad = (a: number[], b: number[], c: number[], d: number[]) => tri.push(...a, ...b, ...c, ...a, ...c, ...d);
    const A = v(r.x0, y0, r.z1);
    const B = v(r.x1, y0, r.z1);
    const C = v(r.x1, y1, r.z0);
    const D = v(r.x0, y1, r.z0);
    const E = v(r.x0, yb, r.z0);
    const F = v(r.x1, yb, r.z0);
    const G = v(r.x0, yb, r.z1);
    const H = v(r.x1, yb, r.z1);
    quad(A, B, C, D);
    quad(D, C, F, E);
    quad(A, D, E, G);
    quad(B, H, F, C);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(tri, 3));
    g.computeVertexNormals();
    const planks = canvasTexture(128, 256, (x) => {
      x.fillStyle = '#b98a5a';
      x.fillRect(0, 0, 128, 256);
      for (let y = 0; y < 256; y += 32) {
        x.fillStyle = y % 64 ? '#a87a4c' : '#c29466';
        x.fillRect(0, y + 2, 128, 28);
      }
    });
    const uv: number[] = [];
    for (let i = 0; i < tri.length / 3; i++) uv.push((tri[i * 3] - r.x0) / 3, (tri[i * 3 + 2] - r.z0) / 3 + tri[i * 3 + 1]);
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const ramp = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: planks, roughness: 0.85, side: THREE.DoubleSide }));
    ramp.castShadow = ramp.receiveShadow = true;
    ramp.name = 'regatta-ramp';
    this.root.add(ramp);
    const trim: THREE.BufferGeometry[] = [];
    const n = 6;
    for (let i = 0; i < n; i++) {
      const w = (r.x1 - r.x0) / n;
      trim.push(paint(new THREE.BoxGeometry(w, 0.16, 0.3).translate(r.x0 + w * (i + 0.5), y1 + 0.08, r.z0 + 0.15), i % 2 ? 0xfff3de : 0xd8402f));
    }
    for (const x of [r.x0 - 0.3, r.x1 + 0.3]) trim.push(paint(new THREE.CylinderGeometry(0.42, 0.42, r.z1 - r.z0, 12).rotateX(Math.PI / 2).translate(x, WATER_Y - 0.05, (r.z0 + r.z1) / 2), 0xffc42e));
    const trimMesh = new THREE.Mesh(mergeColored(trim), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }));
    trimMesh.castShadow = true;
    this.root.add(trimMesh);
  }

  /** Клетчатый флаг на древке — в правой варежке стартёра. */
  private buildFlag(): void {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.3, 6), new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 0.7 }));
    pole.position.y = 0.55;
    const cloth = new THREE.Mesh(
      new THREE.PlaneGeometry(0.85, 0.58, 6, 1),
      new THREE.MeshStandardMaterial({ map: canvasTexture(128, 96, (x) => checkerBar(x, 0, 128, 96, 6)), roughness: 0.8, side: THREE.DoubleSide }),
    );
    cloth.position.set(0.44, 0.92, 0);
    this.flag.add(pole, cloth);
    this.flag.position.set(0.42, 1.42, -0.12);
  }

  /**
   * Кадр: t — время, с. next — номер следующих ворот гонщика (−1 — не гонщик), taken — взятые на круге флажки (биты),
   * wave — стартёр машет (0 — нет, иначе сколько секунд назад «Марш!»), ready — отсчёт идёт (флаг поднят).
   */
  update(t: number, dt: number, camPos: THREE.Vector3, next: number, taken: number, wave: number, ready: boolean): void {
    if (next !== this.next) {
      this.next = next;
      for (let k = 0; k < this.strips.length; k++) if (this.strips[k]) this.strips[k].visible = k === next;
      this.marker.visible = next >= 0;
      if (next >= 0) {
        const g = this.course.gates[next];
        this.marker.position.set(g.x, 0, g.z);
      }
    }
    if (next >= 0) {
      this.stripMat.opacity = 0.32 + 0.22 * Math.sin(t * 5);
      this.marker.position.y = WATER_Y + (next === 0 ? 3.4 : 4.3) + Math.sin(t * 3) * 0.18;
      this.marker.rotation.y = t * 1.6;
    }
    if (taken !== this.taken) {
      this.taken = taken;
      for (const p of this.pennants) p.mesh.material = (taken & (1 << p.flag)) !== 0 ? this.penDim : this.penLit;
      this.chevrons.forEach((ch, i) => (ch.material = (taken & (1 << i)) !== 0 ? this.chevDim : this.chevLit));
    }
    for (const p of this.pennants) p.mesh.rotation.y = p.yaw + Math.sin(t * 6.5 + p.phase) * 0.28;
    for (const f of this.floaters) {
      f.obj.position.y = f.y + Math.sin(t * 1.2 + f.phase) * 0.06;
      f.obj.rotation.z = Math.sin(t * 0.9 + f.phase) * 0.04;
    }
    // маячок: вспышка 0,35 с каждые 2,5 с
    this.beaconGlow.material.opacity = (t % 2.5) < 0.35 ? 0.85 : 0.08;
    // стартёр: на «Марш!» машет флагом 2,5 с, на отсчёте держит его поднятым, иначе — опущен у плеча
    const h = this.starter.hands!;
    let swing: number;
    if (wave > 0 && wave < 2.5) {
      swing = Math.sin(wave * 13) * 0.9;
      h[3] = 0.4 + Math.sin(wave * 13) * 0.1;
      h[4] = 1.45 + Math.abs(Math.sin(wave * 13)) * 0.08;
    } else if (ready) {
      swing = 0.1 * Math.sin(t * 2);
      h[3] = 0.42;
      h[4] = 1.48;
    } else {
      swing = 0.25 + 0.06 * Math.sin(t * 1.5);
      h[3] = 0.44;
      h[4] = 0.95;
    }
    this.flag.position.set(h[3], h[4], h[5]);
    this.flag.rotation.z = -swing;
    this.starter.update(this.starterPose, dt, t, this.ground, camPos, false);
  }

  /** Табло на арке: перерисовка — только когда поменялось содержимое. */
  setBoard(d: RgBoardData): void {
    const key = JSON.stringify(d);
    if (key === this.boardKey) return;
    this.boardKey = key;
    const x = this.board;
    x.fillStyle = '#1f4a5a';
    x.fillRect(0, 0, 1024, 512);
    checkerBar(x, 0, 1024, 18);
    x.textBaseline = 'middle';
    x.fillStyle = '#ffd35a';
    x.font = '900 52px Rubik,system-ui,sans-serif';
    x.textAlign = 'left';
    x.fillText(d.title, 30, 64);
    x.fillStyle = '#fff3de';
    x.textAlign = 'right';
    x.fillText(d.phase, 994, 64);
    x.fillStyle = 'rgba(255,243,222,0.25)';
    x.fillRect(30, 100, 964, 3);
    // строк — по числу катеров (крупнее, когда их мало), но не меньше четырёх
    const rows = d.rows.slice(0, 6);
    const top = 108;
    const rowH = Math.floor((d.foot ? 352 : 392) / Math.max(4, rows.length));
    const big = Math.round(rowH * 0.74);
    rows.forEach((r, i) => {
      const y = top + rowH * i + rowH / 2;
      if (r.me) {
        x.fillStyle = 'rgba(255,211,90,0.24)';
        x.fillRect(18, top + rowH * i + 3, 988, rowH - 6);
      }
      const rad = rowH * 0.4;
      x.fillStyle = r.medal === 1 ? '#ffd35a' : r.medal === 2 ? '#d9e2e8' : r.medal === 3 ? '#e09a5b' : 'rgba(255,243,222,0.18)';
      x.beginPath();
      x.arc(30 + rad, y, rad, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = r.medal ? '#1f4a5a' : '#fff3de';
      x.font = `900 ${Math.round(rad * 1.3)}px Rubik,system-ui,sans-serif`;
      x.textAlign = 'center';
      x.fillText(r.place, 30 + rad, y + 2);
      x.fillStyle = '#fff3de';
      x.font = `800 ${big}px Rubik,system-ui,sans-serif`;
      x.textAlign = 'left';
      x.fillText(fit(x, r.nick, 600), 44 + rad * 2, y + 3);
      x.font = `800 ${Math.round(big * 0.9)}px Rubik,system-ui,sans-serif`;
      x.textAlign = 'right';
      x.fillStyle = '#ffe9b8';
      x.fillText(r.info, 1000, y + 3);
    });
    if (d.foot) {
      x.fillStyle = 'rgba(255,243,222,0.82)';
      x.font = '700 32px Rubik,system-ui,sans-serif';
      x.textAlign = 'center';
      x.fillText(fit(x, d.foot, 980), 512, 482);
    }
    this.boardTex.needsUpdate = true;
  }

  debug(): { next: number; taken: number; board: string } {
    return { next: this.next, taken: this.taken, board: this.boardKey };
  }
}

function checkerBar(x: CanvasRenderingContext2D, y: number, w: number, h: number, rows = 2): void {
  const s = h / rows;
  for (let i = 0; i * s < w; i++) {
    for (let j = 0; j < rows; j++) {
      x.fillStyle = (i + j) % 2 ? '#23303a' : '#f6f1e4';
      x.fillRect(i * s, y + j * s, s, s);
    }
  }
}

/** Ник не шире max px: обрезаем с многоточием */
function fit(x: CanvasRenderingContext2D, text: string, max: number): string {
  if (x.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && x.measureText(s + '…').width > max) s = s.slice(0, -1);
  return s + '…';
}

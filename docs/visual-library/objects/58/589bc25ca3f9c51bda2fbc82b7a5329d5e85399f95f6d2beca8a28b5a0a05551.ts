// Аквапарк «Волна» в 3D (полоса — shared/aqua.ts, движение — shared/aquadyn.ts): надувные подушки, площадки, батуты,
// ступень и башни, горка, площадка вертушки со столбом, бревно, тумбы, финиш, арки «СТАРТ» и «ФИНИШ», рама мешков,
// кольца и доска «Рекорды полосы» у мостика. Надувное — скруглённые «подушки» из ПВХ: яркий верх на синем основании,
// белые стропы. Всё неподвижное — один меш; подвижное — свои меши, у которых каждый кадр меняется только положение:
// паромы, лифт (площадка и гармошка под ней), тонущие подушки (перед тем как уйти под воду — мигают и дрожат),
// перекладина вертушки, мешки (один инстансный меш). Время на экране — то же, что у своей физики (scene.ts).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  AQUA_BAGS, AQUA_BAG_H, AQUA_BAG_R, AQUA_BOARD, AQUA_FINISH, AQUA_FINISH_X, AQUA_JETTY, AQUA_MOVERS, AQUA_PIECES, AQUA_RINGS, AQUA_START_X,
  AQUA_SWEEPER, fmtAquaTime, type AquaMover, type AquaPiece,
} from '../../shared/aqua.ts';
import { bagPose, makeBagPose, makeMoverBox, moverBox, sinkWarn, sweepAngle, type MoverBox } from '../../shared/aquadyn.ts';
import { PLAYER_HALF, WATER_Y } from '../../shared/constants.ts';
import type { AquaRow } from '../../shared/messages.ts';
import type { Effects } from '../render/effects.ts';
import { mergeColored, paint, place } from '../render/kit.ts';
import { drawPvc } from './plaza/art.ts';
import { paintTexture, planarUV } from './plaza/gfx.ts';

/** Надувное уходит под воду на столько */
const SINK = 0.25;
const BASE = 0x1f7ae0;
const STRAP = 0xf4f6f8;
/** Верх площадок — светлее основания */
const DECK_TOP = 0x5ab4ff;
const YELLOW = 0xffc61a;
const RED = 0xe8402e;
const ORANGE = 0xff7b1c;
const FONT = 'Rubik, system-ui, sans-serif';
/** Доска рекордов: холст и размер в метрах, низ — над настилом */
const BW = 512;
const BH = 420;
const BOARD_W = 1.5;
const BOARD_H = (BOARD_W * BH) / BW;
const BOARD_Y = 0.95;
const MEDALS = ['#ffd35c', '#dfe7ee', '#e3a066'];
/** Рама мешков: стойки по краям (x) и в стороне от бревна (±z), высота перекладины */
const GANTRY_X: readonly [number, number] = [-87.4, -77.0];
const GANTRY_DZ = 3.4;
const GANTRY_Y = 4.45;
/** Толщина площадки лифта (под ней — гармошка до воды) */
const LIFT_T = 0.5;
/** Подушка уходит под воду и прячется, когда верх ниже воды на столько */
const PAD_HIDE = 0.6;
/** Фактура ПВХ (plaza2): метров на плитку узора и сила рельефа */
const PVC_M = 1.0;
const PVC_BUMP = 0.9;

interface TrampVis {
  x: number;
  z: number;
  top: number;
  mat: THREE.Mesh;
  squash: number;
  vel: number;
}

interface MoverVis {
  m: AquaMover;
  mesh: THREE.Mesh;
  /** Только у тонущих подушек — свой материал, чтобы мигать */
  mat: THREE.MeshStandardMaterial | null;
  /** Под водой (для всплеска, когда уходит и всплывает) */
  under: boolean;
  /** Паром: где был в прошлом кадре и когда пускал круги */
  lx: number;
  wakeT: number;
}

export class AquaPark {
  private readonly tramps: TrampVis[] = [];
  private readonly movers: MoverVis[] = [];
  /** Площадки на этом кадре: для теней (groundBelow) и чужих на паромах (riderShift) */
  private readonly boxes: MoverBox[] = AQUA_MOVERS.map(makeMoverBox);
  private readonly tmpBox: MoverBox = makeMoverBox();
  private liftCol: THREE.Mesh | null = null;
  private readonly sweeper: THREE.Mesh;
  private readonly bags: THREE.InstancedMesh;
  private readonly bagTmp = makeBagPose();
  private readonly m4 = new THREE.Matrix4();
  private readonly m4b = new THREE.Matrix4();
  private readonly effects: Effects;
  private readonly boardCtx: CanvasRenderingContext2D;
  private readonly boardTex: THREE.CanvasTexture;
  private top: AquaRow[] = [];
  private mine = 0;
  private myPid = 0;
  private boardKey = '';
  private time = 0;

  /** skin — «кожа» надувного ПВХ (стёганые подушки со швами; оформление plaza2): та же полоса, только вид */
  constructor(scene: THREE.Scene, effects: Effects, skin = false) {
    this.effects = effects;
    const uv = (g: THREE.BufferGeometry): THREE.BufferGeometry => (skin ? planarUV(g, 1 / PVC_M) : g);
    const parts: THREE.BufferGeometry[] = [];
    for (const p of AQUA_PIECES) this.piece(parts, scene, p);
    arch(parts, AQUA_START_X, AQUA_JETTY.z0 - 0.3, AQUA_JETTY.z1 + 0.3, 2.9, BASE, YELLOW);
    arch(parts, AQUA_FINISH_X, AQUA_FINISH.z0 - 0.3, AQUA_FINISH.z1 + 0.3, 3.0, RED, STRAP);
    checkers(parts, AQUA_FINISH_X, AQUA_FINISH.z0 + 0.1, AQUA_FINISH.z1 - 0.1, AQUA_FINISH.top);
    AQUA_RINGS.forEach((r, i) => ring(parts, r.x, r.z, r.y, i % 2 === 0 ? RED : YELLOW));
    gantry(parts);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.02 });
    if (skin) {
      mat.map = mat.bumpMap = paintTexture(256, 256, drawPvc, true);
      mat.bumpScale = PVC_BUMP;
      mat.color.setScalar(1.22);
    }
    const mesh = new THREE.Mesh(uv(mergeColored(parts)), mat);
    mesh.matrixAutoUpdate = false;
    scene.add(mesh);
    scene.add(banner('СТАРТ', '#1f7ae0', AQUA_START_X, (AQUA_JETTY.z0 + AQUA_JETTY.z1) / 2, 2.9));
    scene.add(banner('ФИНИШ', '#e8402e', AQUA_FINISH_X, (AQUA_FINISH.z0 + AQUA_FINISH.z1) / 2, 3.0, true));

    // подвижное: у каждой площадки свой меш (у подушек — свой материал: мигать), перекладина и мешки
    for (const m of AQUA_MOVERS) {
      let geo: THREE.BufferGeometry;
      let mm = mat;
      if (m.kind === 'ferry') geo = uv(ferryGeo(m));
      else if (m.kind === 'lift') {
        geo = uv(liftGeo(m));
        const col = new THREE.Mesh(uv(bellowsGeo(m)), mat);
        col.position.set((m.x0 + m.x1) / 2, WATER_Y - SINK, (m.z0 + m.z1) / 2);
        scene.add(col);
        this.liftCol = col;
      } else {
        geo = uv(padGeo(m));
        mm = mat.clone();
        mm.emissive.set(0xffffff);
        mm.emissiveIntensity = 0;
      }
      const mv = new THREE.Mesh(geo, mm);
      scene.add(mv);
      this.movers.push({ m, mesh: mv, mat: m.kind === 'sink' ? mm : null, under: false, lx: (m.x0 + m.x1) / 2, wakeT: 0 });
    }
    this.sweeper = new THREE.Mesh(uv(sweeperGeo()), mat);
    this.sweeper.position.set(AQUA_SWEEPER.x, AQUA_SWEEPER.top, AQUA_SWEEPER.z);
    scene.add(this.sweeper);
    this.bags = new THREE.InstancedMesh(uv(bagGeo()), mat, AQUA_BAGS.length);
    this.bags.frustumCulled = false;
    scene.add(this.bags);
    this.update(0, 0);

    // доска рекордов на двух столбиках у мостика, лицом на восток (к площади)
    const canvas = document.createElement('canvas');
    canvas.width = BW;
    canvas.height = BH;
    this.boardCtx = canvas.getContext('2d')!;
    this.boardTex = new THREE.CanvasTexture(canvas);
    this.boardTex.colorSpace = THREE.SRGBColorSpace;
    this.boardTex.anisotropy = 8;
    const { x, z } = AQUA_BOARD;
    const wood: THREE.BufferGeometry[] = [];
    // столбики — за доской (с запада), лицевая сторона — на восток
    for (const dz of [-0.62, 0.62]) wood.push(place(paint(new THREE.BoxGeometry(0.1, 2.4, 0.1), 0x5b4130), x - 0.08, 1.2, z + dz));
    wood.push(place(paint(new THREE.BoxGeometry(0.04, BOARD_H + 0.08, BOARD_W + 0.08), 0x7a5536), x - 0.01, BOARD_Y + BOARD_H / 2, z));
    wood.push(place(paint(new THREE.ConeGeometry(0.08, 0.08, 4).rotateY(Math.PI / 4), 0x3a2a1e), x - 0.08, 2.44, z - 0.62));
    wood.push(place(paint(new THREE.ConeGeometry(0.08, 0.08, 4).rotateY(Math.PI / 4), 0x3a2a1e), x - 0.08, 2.44, z + 0.62));
    const frame = new THREE.Mesh(mergeColored(wood), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
    frame.castShadow = true;
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(BOARD_W, BOARD_H),
      new THREE.MeshStandardMaterial({ map: this.boardTex, roughness: 0.7, emissive: 0xffffff, emissiveMap: this.boardTex, emissiveIntensity: 0.18 }),
    );
    face.position.set(x + 0.015, BOARD_Y + BOARD_H / 2, z);
    face.rotation.y = Math.PI / 2;
    scene.add(frame, face);
    this.drawBoard();
  }

  /** Доска рекордов с сервера; pid и лучшее время — свои (своя строка подсвечена, внизу — свой лучший). */
  setTop(rows: AquaRow[], myPid: number, mine: number): void {
    this.top = rows;
    this.myPid = myPid;
    this.mine = mine;
    this.drawBoard();
  }

  /** Кто-то прыгнул на батут (x, z — где): сетка проседает. */
  bounce(x: number, z: number, power = 1): void {
    for (const tr of this.tramps) if (Math.hypot(tr.x - x, tr.z - z) < 1.6) tr.vel -= 5 * power;
  }

  /**
   * Кадр: t — время препятствий на экране (тики сервера с дробью; у своей желейки — то же, что в её физике).
   * Паромы, лифт и подушки — по общему расписанию, перекладина и мешки — по углу; батуты пружинят.
   */
  update(dt: number, t: number): void {
    this.time += dt;
    for (const tr of this.tramps) {
      tr.vel += (-tr.squash * 220 - tr.vel * 9) * dt;
      tr.squash += tr.vel * dt;
      tr.mat.position.y = tr.top - 0.04 + tr.squash * 0.35;
    }
    for (let i = 0; i < this.movers.length; i++) {
      const v = this.movers[i];
      const b = moverBox(v.m, t, this.boxes[i]);
      const cx = (b.x0 + b.x1) / 2;
      const cz = (b.z0 + b.z1) / 2;
      const mesh = v.mesh;
      mesh.position.set(cx, b.top, cz);
      if (v.m.kind === 'lift' && this.liftCol) this.liftCol.scale.y = Math.max(0.05, b.top - LIFT_T - (WATER_Y - SINK));
      else if (v.m.kind === 'ferry' && dt > 0) {
        // на ходу — круги на воде за кормой
        const dx = cx - v.lx;
        v.lx = cx;
        v.wakeT -= dt;
        if (Math.abs(dx) > 0.6 * dt && v.wakeT <= 0) {
          v.wakeT = 0.28;
          this.effects.ripple(cx - Math.sign(dx) * 1.3, cz, 2.4, 1.3);
        }
      } else if (v.m.kind === 'sink' && v.mat) {
        // перед тем как уйти под воду — мигает белым и дрожит; под водой — не видно
        const warn = sinkWarn(v.m, t);
        const blink = warn > 0 && Math.floor(this.time * (6 + warn * 10)) % 2 === 0;
        v.mat.emissiveIntensity = blink ? 0.6 : 0;
        const wob = warn > 0 ? Math.sin(this.time * 38) * 0.035 * (0.4 + warn) : 0;
        mesh.rotation.set(wob, 0, -wob * 0.7);
        const under = b.top < WATER_Y - PAD_HIDE;
        mesh.visible = !under;
        if (dt > 0 && under !== v.under) {
          if (under) this.effects.ripple(cx, cz, 2.6, 1.4);
          else this.effects.waterSplash(cx, cz, false);
        }
        v.under = under;
      }
    }
    this.sweeper.rotation.y = -sweepAngle(t);
    for (let i = 0; i < AQUA_BAGS.length; i++) {
      const bg = AQUA_BAGS[i];
      const p = bagPose(bg, t, this.bagTmp);
      this.m4.makeTranslation(bg.x, bg.py, bg.z).multiply(this.m4b.makeRotationX(-p.a));
      this.bags.setMatrixAt(i, this.m4);
    }
    this.bags.instanceMatrix.needsUpdate = true;
  }

  /** Самый высокий верх подвижной площадки под точкой не выше y — как они стоят на экране (для теней); −∞ — нет. */
  groundBelow(x: number, y: number, z: number): number {
    let best = -Infinity;
    for (const b of this.boxes) {
      if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
      if (b.top <= y + 1e-3 && b.top > best) best = b.top;
    }
    return best;
  }

  /**
   * Чужая желейка стоит в pose по времени своих препятствий tThem: если она на пароме, лифте или подушке — сдвинуть её
   * туда, где эта площадка на экране сейчас (у каждого игрока время препятствий своё, у чужих — в прошлом).
   */
  riderShift(pose: { x: number; y: number; z: number }, tThem: number): void {
    for (let i = 0; i < AQUA_MOVERS.length; i++) {
      const a = moverBox(AQUA_MOVERS[i], tThem, this.tmpBox);
      if (Math.abs(pose.y - a.top) > 0.12) continue;
      if (pose.x - PLAYER_HALF >= a.x1 || pose.x + PLAYER_HALF <= a.x0 || pose.z - PLAYER_HALF >= a.z1 || pose.z + PLAYER_HALF <= a.z0) continue;
      const b = this.boxes[i];
      pose.x += b.x0 - a.x0;
      pose.y += b.top - a.top;
      pose.z += b.z0 - a.z0;
      return;
    }
  }

  // ------------------------------------------------------------ неподвижные куски

  private piece(parts: THREE.BufferGeometry[], scene: THREE.Scene, p: AquaPiece): void {
    const w = p.x1 - p.x0;
    const d = p.z1 - p.z0;
    const cx = (p.x0 + p.x1) / 2;
    const cz = (p.z0 + p.z1) / 2;
    const y0 = WATER_Y - SINK;
    switch (p.kind) {
      case 'pad':
      case 'deck':
      case 'finish':
        cushion(parts, p, p.kind === 'pad' ? p.color : DECK_TOP);
        break;
      case 'step':
      case 'pillar':
        cushion(parts, p, p.color);
        // стропы по углам — высокая подушка держит форму
        for (const sx of [p.x0 + 0.1, p.x1 - 0.1]) for (const sz of [p.z0 + 0.1, p.z1 - 0.1]) parts.push(rbox(0.1, p.top - y0 - 0.3, 0.1, 0.04, STRAP, sx, (y0 + p.top - 0.3) / 2, sz));
        break;
      case 'tower': {
        cushion(parts, p, p.color);
        for (const sx of [p.x0 + 0.12, p.x1 - 0.12]) for (const sz of [p.z0 + 0.12, p.z1 - 0.12]) parts.push(rbox(0.12, p.top - y0 - 0.3, 0.12, 0.05, STRAP, sx, (y0 + p.top - 0.3) / 2, sz));
        // поясом — полосы и ручки «скалодрома» по бокам (для красоты: залезть нельзя)
        for (const k of [0.3, 0.62]) parts.push(rbox(w + 0.04, 0.1, d + 0.04, 0.04, STRAP, cx, y0 + (p.top - y0) * k, cz));
        const n = Math.floor((p.top - WATER_Y - 0.6) / 0.5);
        for (let k = 0; k < n; k++) {
          const hy = WATER_Y + 0.55 + k * 0.5;
          const side = k % 2 === 0 ? -0.6 : 0.6;
          parts.push(place(paint(new THREE.SphereGeometry(0.09, 8, 6), k % 3 === 0 ? RED : k % 3 === 1 ? 0x37b956 : YELLOW), p.x1 + 0.05, hy, cz + side));
          parts.push(place(paint(new THREE.SphereGeometry(0.09, 8, 6), k % 3 === 0 ? YELLOW : k % 3 === 1 ? RED : 0x37b956), cx + side, hy + 0.25, p.z0 - 0.05));
        }
        break;
      }
      case 'slide':
        slide(parts, p);
        break;
      case 'beam': {
        // бревно-«колбаса» во всю длину: красное в белых кольцах, концами — на площадках
        const h = p.top - y0;
        parts.push(rbox(w + 0.3, h, d, 0.45, p.color, cx, (y0 + p.top) / 2, cz));
        const n = Math.round(w / 1.3);
        for (let k = 1; k < n; k++) parts.push(rbox(0.14, h + 0.05, d + 0.05, 0.06, STRAP, p.x0 + (w * k) / n, (y0 + p.top) / 2, cz));
        break;
      }
      case 'disc': {
        // площадка вертушки: подушка, сверху мишень (кольца) — видно, куда достаёт перекладина
        cushion(parts, p, p.color);
        const r = Math.min(w, d) / 2 - 0.2;
        for (let k = 0; k < 4; k++) {
          const rr = r * (1 - k * 0.24);
          parts.push(place(paint(new THREE.CylinderGeometry(rr, rr, 0.012, 40), k % 2 === 0 ? STRAP : p.color), cx, p.top + 0.006 + k * 0.002, cz));
        }
        break;
      }
      case 'pylon': {
        // столб вертушки — в красно-белых полосах, сверху «шляпка» над осью перекладины
        const h = p.top - y0;
        parts.push(rbox(w, h, d, 0.2, p.color, cx, (y0 + p.top) / 2, cz));
        for (let k = 1; k <= 3; k++) parts.push(rbox(w + 0.03, 0.12, d + 0.03, 0.05, STRAP, cx, y0 + (h * k) / 4, cz));
        parts.push(place(paint(new THREE.CylinderGeometry(0.62, 0.62, 0.22, 24), YELLOW), cx, p.top + 0.11, cz));
        break;
      }
      case 'tramp': {
        // батут: скруглённое основание до верха, бортик цвета силы (зелёный — слабый, красный — сильный), тёмная
        // сетка (отдельно — проседает)
        parts.push(rbox(w, p.top - 0.12 - y0, d, 0.3, BASE, cx, (y0 + p.top - 0.12) / 2, cz));
        parts.push(place(paint(new THREE.TorusGeometry(Math.min(w, d) / 2 - 0.12, 0.14, 10, 32).rotateX(Math.PI / 2), p.color), cx, p.top - 0.08, cz));
        const mat = new THREE.Mesh(new THREE.CircleGeometry(Math.min(w, d) / 2 - 0.2, 32), new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.4 }));
        mat.rotation.x = -Math.PI / 2;
        mat.position.set(cx, p.top - 0.04, cz);
        scene.add(mat);
        this.tramps.push({ x: cx, z: cz, top: p.top, mat, squash: 0, vel: 0 });
        break;
      }
    }
  }

  // ------------------------------------------------------------ доска рекордов

  private drawBoard(): void {
    const key = JSON.stringify([this.top, this.myPid, this.mine]);
    if (key === this.boardKey) return;
    this.boardKey = key;
    const c = this.boardCtx;
    c.clearRect(0, 0, BW, BH);
    c.fillStyle = '#17446f';
    c.fillRect(0, 0, BW, BH);
    // волна поверху
    c.fillStyle = '#2a8de0';
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(BW, 0);
    c.lineTo(BW, 92);
    for (let x = BW; x >= 0; x -= 8) c.lineTo(x, 92 + Math.sin(x / 26) * 7);
    c.closePath();
    c.fill();
    c.strokeStyle = '#f4f2ec';
    c.lineWidth = 8;
    c.strokeRect(8, 8, BW - 16, BH - 16);
    c.textBaseline = 'middle';
    c.textAlign = 'center';
    c.fillStyle = '#ffffff';
    fit(c, 'АКВАПАРК «ВОЛНА»', BW / 2, 44, BW - 60, 900, 40);
    c.fillStyle = '#ffe48a';
    fit(c, 'Рекорды новой полосы', BW / 2, 78, BW - 60, 700, 24);
    for (let i = 0; i < 5; i++) {
      const y = 134 + i * 46;
      const r = this.top[i];
      if (r && r.pid === this.myPid) {
        c.fillStyle = 'rgba(255, 211, 92, 0.2)';
        c.fillRect(22, y - 21, BW - 44, 42);
      }
      // место — кружок (первые трое — золото, серебро, бронза)
      c.fillStyle = MEDALS[i] ?? '#9fc4e6';
      c.beginPath();
      c.arc(52, y, 16, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#17446f';
      c.textAlign = 'center';
      fit(c, String(i + 1), 52, y + 1, 30, 900, 22);
      c.textAlign = 'left';
      c.fillStyle = r ? '#ffffff' : '#7ea6c9';
      fit(c, r ? r.nick : '—', 82, y, 270, 700, 27);
      if (r) {
        c.textAlign = 'right';
        c.fillStyle = '#ffe48a';
        fit(c, fmtAquaTime(r.ms), BW - 34, y, 140, 900, 27);
      }
    }
    c.textAlign = 'center';
    c.fillStyle = '#bfe3ff';
    fit(c, this.mine > 0 ? `Твой лучший: ${fmtAquaTime(this.mine)}` : 'Сойди с мостика на запад — пойдёт время', BW / 2, 372, BW - 60, 700, 24);
    this.boardTex.needsUpdate = true;
  }
}

// ------------------------------------------------------------ фигуры

function rbox(w: number, h: number, d: number, r: number, color: number, x: number, y: number, z: number, seg = 3): THREE.BufferGeometry {
  const rr = Math.max(0.005, Math.min(r, w / 2 - 0.005, h / 2 - 0.005, d / 2 - 0.005));
  return place(paint(new RoundedBoxGeometry(w, h, d, seg, rr), color), x, y, z);
}

/** Надувная площадка: синее основание от воды, сверху — цветная подушка вровень с верхом куска, белая стропа по боку. */
function cushion(parts: THREE.BufferGeometry[], p: { x0: number; x1: number; z0: number; z1: number; top: number }, topColor: number): void {
  const w = p.x1 - p.x0;
  const d = p.z1 - p.z0;
  const cx = (p.x0 + p.x1) / 2;
  const cz = (p.z0 + p.z1) / 2;
  const y0 = WATER_Y - SINK;
  const yb = p.top - 0.18;
  parts.push(rbox(w, yb - y0, d, 0.18, BASE, cx, (y0 + yb) / 2, cz, 2));
  parts.push(rbox(w - 0.04, 0.24, d - 0.04, 0.1, topColor, cx, p.top - 0.12, cz));
  parts.push(rbox(w + 0.03, 0.07, d + 0.03, 0.03, STRAP, cx, Math.min(yb - 0.15, WATER_Y + 0.45), cz, 2));
}

/**
 * Горка: жёлтый скат по ступенькам (поверхность — посередине их высоты), синие бортики, синяя опора снизу.
 * Спускается на запад ('-x') или на юг ('+z').
 */
function slide(parts: THREE.BufferGeometry[], p: AquaPiece): void {
  const low = p.low ?? p.top;
  const south = p.down === '+z';
  const len = south ? p.z1 - p.z0 : p.x1 - p.x0;
  const width = south ? p.x1 - p.x0 : p.z1 - p.z0;
  const ang = Math.atan2(p.top - low, len);
  const l = Math.hypot(len, p.top - low);
  const xm = (p.x0 + p.x1) / 2;
  const zm = (p.z0 + p.z1) / 2;
  const ym = (p.top + low) / 2;
  // скат: верх — на 0,1 ниже линии по углам ступенек; нормаль ската — вверх и к нижнему краю
  const th = 0.22;
  const off = -0.1 - th / 2;
  const ny = Math.cos(ang);
  const nh = Math.sin(ang);
  const deck = new RoundedBoxGeometry(south ? width - 0.1 : l + 0.3, th, south ? l + 0.3 : width - 0.1, 2, 0.08);
  if (south) deck.rotateX(ang);
  else deck.rotateZ(ang);
  parts.push(place(paint(deck, p.color), xm + (south ? 0 : -nh * off), ym + ny * off, zm + (south ? nh * off : 0)));
  for (const side of [0.12, width - 0.12]) {
    const rail = new THREE.CylinderGeometry(0.15, 0.15, l + 0.3, 12);
    if (south) rail.rotateX(Math.PI / 2 + ang);
    else rail.rotateZ(ang - Math.PI / 2);
    const rx = south ? p.x0 + side : xm - nh * 0.06;
    const rz = south ? zm + nh * 0.06 : p.z0 + side;
    parts.push(place(paint(rail, BASE), rx, ym + ny * 0.06, rz));
  }
  // опора под скатом: трапеция от воды до ската (в плоскости спуска), толщиной во всю ширину
  const y0 = WATER_Y - SINK;
  const a = south ? p.z0 : p.x1;
  const dir = south ? 1 : -1;
  const shape = new THREE.Shape();
  shape.moveTo(0, y0);
  shape.lineTo(len - 0.2, y0);
  shape.lineTo(len - 0.2, low - 0.35);
  shape.lineTo(0, p.top - 0.35);
  shape.closePath();
  const body = new THREE.ExtrudeGeometry(shape, { depth: width - 0.5, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 2 });
  if (south) {
    // форма в (z от верхнего края, y), выдавлена по −x
    body.rotateY(-Math.PI / 2);
    body.translate(p.x1 - 0.25, 0, a);
  } else {
    // форма в (x от верхнего края на запад, y), выдавлена по +z
    body.scale(dir, 1, 1);
    body.translate(a, 0, p.z0 + 0.25);
  }
  parts.push(paint(body, BASE));
}

/** Надувная арка поперёк полосы: две колонны из воды и перекладина. */
function arch(parts: THREE.BufferGeometry[], x: number, z0: number, z1: number, h: number, col: number, stripe: number): void {
  const y0 = WATER_Y - SINK;
  for (const z of [z0, z1]) {
    parts.push(place(paint(new THREE.CapsuleGeometry(0.24, h - y0, 4, 14), col), x, (y0 + h) / 2, z));
    for (let k = 1; k <= 3; k++) parts.push(place(paint(new THREE.TorusGeometry(0.245, 0.05, 6, 14).rotateX(Math.PI / 2), stripe), x, y0 + ((h - y0) * k) / 4, z));
  }
  parts.push(place(paint(new THREE.CapsuleGeometry(0.26, z1 - z0, 4, 14).rotateX(Math.PI / 2), col), x, h, (z0 + z1) / 2));
}

/** Клетчатая финишная черта поперёк площадки (чуть над верхом, чтобы не мерцала). */
function checkers(parts: THREE.BufferGeometry[], x: number, z0: number, z1: number, top: number): void {
  const n = Math.round((z1 - z0) / 0.32);
  const s = (z1 - z0) / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < 2; j++) {
      parts.push(place(paint(new THREE.BoxGeometry(s, 0.012, s), (i + j) % 2 === 0 ? 0x1b1b1b : 0xf4f4f4), x - s / 2 + j * s, top + 0.006, z0 + s * (i + 0.5)));
    }
  }
}

/** Кольцо над полосой на стойке из воды. */
function ring(parts: THREE.BufferGeometry[], x: number, z: number, y: number, col: number): void {
  const r = 1.25;
  parts.push(place(paint(new THREE.TorusGeometry(r, 0.16, 12, 40).rotateY(Math.PI / 2), col), x, y, z));
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    // белая стропа вокруг трубы кольца: её ось — по касательной к кольцу
    parts.push(place(paint(new THREE.TorusGeometry(0.17, 0.045, 6, 12).rotateX(-(a + Math.PI / 2)), STRAP), x, y + Math.sin(a) * r, z + Math.cos(a) * r));
  }
  const bottom = y - r - 0.12;
  if (bottom > WATER_Y) parts.push(place(paint(new THREE.CylinderGeometry(0.1, 0.12, bottom - WATER_Y + SINK, 8), STRAP), x, (bottom + WATER_Y - SINK) / 2, z));
  parts.push(rbox(0.6, 0.3, 0.6, 0.12, BASE, x, WATER_Y + 0.05, z));
}

/** Рама мешков над бревном: две пары стоек из воды (в стороне от бревна) и перекладина вдоль него. */
function gantry(parts: THREE.BufferGeometry[]): void {
  const z = AQUA_BAGS[0].z;
  const y0 = WATER_Y - SINK;
  for (const x of GANTRY_X) {
    for (const s of [-1, 1]) {
      // стойка наклонена к перекладине: от воды в стороне — к верху над бревном
      const zb = z + s * GANTRY_DZ;
      const len = Math.hypot(GANTRY_Y - y0, GANTRY_DZ);
      const tilt = Math.atan2(GANTRY_DZ, GANTRY_Y - y0);
      const post = new THREE.CapsuleGeometry(0.2, len, 4, 12).rotateX(-s * tilt);
      parts.push(place(paint(post, YELLOW), x, (y0 + GANTRY_Y) / 2, (zb + z) / 2));
      parts.push(rbox(0.7, 0.35, 0.7, 0.14, BASE, x, WATER_Y + 0.08, zb));
    }
  }
  const span = GANTRY_X[1] - GANTRY_X[0];
  parts.push(place(paint(new THREE.CapsuleGeometry(0.24, span, 4, 14).rotateZ(Math.PI / 2), RED), (GANTRY_X[0] + GANTRY_X[1]) / 2, GANTRY_Y, z));
  for (let k = 1; k < 6; k++) parts.push(place(paint(new THREE.TorusGeometry(0.245, 0.05, 6, 14).rotateY(Math.PI / 2), STRAP), GANTRY_X[0] + (span * k) / 6, GANTRY_Y, z));
  // крепления верёвок
  for (const b of AQUA_BAGS) parts.push(place(paint(new THREE.TorusGeometry(0.12, 0.04, 6, 12), STRAP), b.x, b.py + 0.05, b.z));
}

/** Паром: плот (низ ниже воды — у всех паромов одна глубина), жёлтый верх, белая стропа, оранжевые кранцы, флажок. */
function ferryGeo(m: AquaMover): THREE.BufferGeometry {
  const w = m.x1 - m.x0;
  const d = m.z1 - m.z0;
  const list: THREE.BufferGeometry[] = [];
  const h = 1.4;
  list.push(rbox(w, h - 0.18, d, 0.22, BASE, 0, -0.18 - (h - 0.18) / 2, 0, 2));
  list.push(rbox(w - 0.04, 0.24, d - 0.04, 0.1, m.color, 0, -0.12, 0));
  list.push(rbox(w + 0.04, 0.08, d + 0.04, 0.03, STRAP, 0, -0.42, 0, 2));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) list.push(place(paint(new THREE.SphereGeometry(0.16, 10, 8), ORANGE), sx * (w / 2 + 0.06), -0.55, sz * (d / 2 + 0.06)));
  // флажок на тонкой мачте сбоку (за краем — об неё не споткнуться)
  list.push(place(paint(new THREE.CylinderGeometry(0.025, 0.025, 1.3, 6), STRAP), w / 2 + 0.08, 0.3, d / 2 + 0.08));
  const flag = new THREE.BufferGeometry();
  flag.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, -0.3, 0, -0.45, -0.15, 0, 0, 0, 0, -0.45, -0.15, 0, 0, -0.3, 0], 3));
  flag.computeVertexNormals();
  list.push(place(paint(flag, RED), w / 2 + 0.08, 0.92, d / 2 + 0.08));
  return mergeColored(list);
}

/** Тонущая подушка: квадратный плотик (низ — до воды, когда наверху), цветной верх, белая стропа. */
function padGeo(m: AquaMover): THREE.BufferGeometry {
  const w = m.x1 - m.x0;
  const d = m.z1 - m.z0;
  const h = m.top - (WATER_Y - SINK);
  const list: THREE.BufferGeometry[] = [];
  list.push(rbox(w, h - 0.18, d, 0.2, BASE, 0, -0.18 - (h - 0.18) / 2, 0, 2));
  list.push(rbox(w - 0.04, 0.24, d - 0.04, 0.11, m.color, 0, -0.12, 0));
  list.push(rbox(w + 0.03, 0.07, d + 0.03, 0.03, STRAP, 0, -h + 0.45, 0, 2));
  // кружок посередине — «кувшинка»
  list.push(place(paint(new THREE.CylinderGeometry(Math.min(w, d) * 0.28, Math.min(w, d) * 0.28, 0.012, 24), STRAP), 0, 0.006, 0));
  return mergeColored(list);
}

/** Лифт: площадка с оранжевым бортиком (снизу под ней — гармошка до воды, отдельный меш). */
function liftGeo(m: AquaMover): THREE.BufferGeometry {
  const w = m.x1 - m.x0;
  const d = m.z1 - m.z0;
  const list: THREE.BufferGeometry[] = [];
  list.push(rbox(w, LIFT_T - 0.18, d, 0.15, BASE, 0, -0.18 - (LIFT_T - 0.18) / 2, 0, 2));
  list.push(rbox(w - 0.04, 0.24, d - 0.04, 0.1, m.color, 0, -0.12, 0));
  list.push(rbox(w + 0.04, 0.08, d + 0.04, 0.03, ORANGE, 0, -LIFT_T + 0.08, 0, 2));
  // стрелки «вверх» на верху — видно, что это лифт
  for (const s of [-1, 1]) {
    const arrow = new THREE.ConeGeometry(0.22, 0.012, 3).rotateY(Math.PI / 2);
    list.push(place(paint(arrow, STRAP), s * 0.55, 0.006, 0));
  }
  return mergeColored(list);
}

/** Гармошка под лифтом: высота 1 (меш растягивают до площадки) — синий столб в белых кольцах. */
function bellowsGeo(m: AquaMover): THREE.BufferGeometry {
  const r = Math.min(m.x1 - m.x0, m.z1 - m.z0) / 2 - 0.2;
  const list: THREE.BufferGeometry[] = [];
  list.push(place(paint(new THREE.CylinderGeometry(r * 0.85, r * 0.85, 1, 18, 1, true), BASE), 0, 0.5, 0));
  for (let k = 0; k < 7; k++) list.push(place(paint(new THREE.CylinderGeometry(r, r, 0.06, 18), k % 2 === 0 ? STRAP : YELLOW), 0, (k + 0.5) / 7, 0));
  return mergeColored(list);
}

/** Перекладина вертушки: труба через ось в обе стороны (красная в белых полосах), на концах — мягкие шары. */
function sweeperGeo(): THREE.BufferGeometry {
  const sw = AQUA_SWEEPER;
  const yc = (sw.y0 + sw.y1) / 2;
  const list: THREE.BufferGeometry[] = [];
  list.push(place(paint(new THREE.CapsuleGeometry(sw.r, sw.len * 2 - sw.r * 2, 4, 14).rotateZ(Math.PI / 2), RED), 0, yc, 0));
  for (let k = -5; k <= 5; k++) {
    if (k === 0) continue;
    list.push(place(paint(new THREE.TorusGeometry(sw.r + 0.005, 0.045, 6, 14).rotateY(Math.PI / 2), STRAP), (k / 5.5) * sw.len, yc, 0));
  }
  for (const s of [-1, 1]) list.push(place(paint(new THREE.SphereGeometry(sw.r * 1.35, 14, 10), YELLOW), s * (sw.len - sw.r), yc, 0));
  // втулка на столбе
  list.push(place(paint(new THREE.CylinderGeometry(0.55, 0.55, (sw.y1 - sw.y0) + 0.2, 20), YELLOW), 0, yc, 0));
  return mergeColored(list);
}

/** Мешок с верёвкой: от точки подвеса вниз (середина мешка — на длине верёвки). */
function bagGeo(): THREE.BufferGeometry {
  const b = AQUA_BAGS[0];
  const list: THREE.BufferGeometry[] = [];
  const ropeLen = b.len - AQUA_BAG_H / 2;
  list.push(place(paint(new THREE.CylinderGeometry(0.035, 0.035, ropeLen, 6), 0xd8cfb8), 0, -ropeLen / 2, 0));
  list.push(place(paint(new THREE.CapsuleGeometry(AQUA_BAG_R, AQUA_BAG_H - AQUA_BAG_R * 2, 6, 16), RED), 0, -b.len, 0));
  for (const k of [-0.25, 0.05, 0.35]) list.push(place(paint(new THREE.TorusGeometry(AQUA_BAG_R + 0.005, 0.05, 6, 16).rotateX(Math.PI / 2), STRAP), 0, -b.len + k * AQUA_BAG_H, 0));
  list.push(place(paint(new THREE.SphereGeometry(0.12, 8, 6), YELLOW), 0, -b.len + AQUA_BAG_H / 2 + 0.02, 0));
  return mergeColored(list);
}

/** Надпись на арке: полотнище под перекладиной, с обеих сторон (с востока и с запада). */
function banner(text: string, color: string, x: number, z: number, h: number, checkered = false): THREE.Object3D {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 512, 128);
  if (checkered) {
    // клетчатая кайма сверху и снизу
    for (let i = 0; i < 32; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#1b1b1b' : '#f4f4f4';
      ctx.fillRect(i * 16, 0, 16, 16);
      ctx.fillStyle = i % 2 === 0 ? '#f4f4f4' : '#1b1b1b';
      ctx.fillRect(i * 16, 112, 16, 16);
    }
  }
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 76px ${FONT}`;
  ctx.fillText(text, 256, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.15 });
  const g = new THREE.Group();
  for (const side of [1, -1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), mat);
    m.rotation.y = side * (Math.PI / 2);
    m.position.set(x + side * 0.27, h - 0.55, z);
    g.add(m);
  }
  return g;
}

/** Строка в (x, y) не шире maxW: не влезает — шрифт мельче. */
function fit(c: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, weight: number, size: number): void {
  c.font = `${weight} ${size}px ${FONT}`;
  const w = c.measureText(text).width;
  if (w > maxW) c.font = `${weight} ${Math.floor((size * maxW) / w)}px ${FONT}`;
  c.fillText(text, x, y);
}

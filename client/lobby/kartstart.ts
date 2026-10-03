// Круг «Старт» у гаража картинга: шахматное кольцо и надпись на настиле, большое число отсчёта над кругом,
// табло на стене гаража. Всё — по статусу kart от сервера; секунды между сообщениями тикают сами.
import * as THREE from 'three';
import { KART_START } from '../../shared/maps/lobby.ts';
import type { KartStatus } from '../../shared/messages.ts';
import { KartBoard } from './boards.ts';

const FONT = 'Rubik, system-ui, sans-serif';
/** Кольцо: два ряда клеток по краю круга */
const CELLS = 44;
const BAND = 0.2;
/** Число отсчёта висит над кругом на такой высоте */
const NUM_Y = 3.3;
const NUM_SIZE = 1.9;
/** Табло на стене гаража справа от ворот (ширина, высота, центр) */
const BOARD_W = 3.3;
const BOARD_H = 1.85;
export const BOARD_POS = { x: 26.05, y: 2.75, z: -15.9 };

export class KartStart {
  readonly group = new THREE.Group();
  readonly board = new KartBoard(BOARD_W, BOARD_H);
  private st: KartStatus = { phase: 'idle', left: 0, n: 0, names: [], lap: 0, laps: 3 };
  /** Время мира, когда пришёл статус */
  private at = 0;
  private now = 0;
  private readonly glow: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private readonly num: THREE.Sprite;
  private readonly numCtx: CanvasRenderingContext2D;
  private readonly numTex: THREE.CanvasTexture;
  private numShown = '';
  /** Когда сменилось число (для «пружинки») */
  private numAt = -9;

  constructor() {
    const { x, z, r } = KART_START;
    const ring = new THREE.Mesh(checkerRing(r - 2 * BAND, r, CELLS), new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.82, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    ring.position.set(x, 0.012, z);
    ring.receiveShadow = true;
    // тёмная краска внутри кольца — на светлой плитке надпись иначе не читается
    const pad = new THREE.Mesh(new THREE.CircleGeometry(r - 2 * BAND + 0.01, 64), new THREE.MeshStandardMaterial({
      color: 0x34312e, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(x, 0.01, z);
    pad.receiveShadow = true;

    const label = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.25), new THREE.MeshStandardMaterial({
      map: labelTexture(), transparent: true, roughness: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    }));
    label.rotation.x = -Math.PI / 2;
    label.position.set(x, 0.014, z);
    label.receiveShadow = true;

    this.glow = new THREE.Mesh(new THREE.RingGeometry(r - 0.06, r + 0.32, 72), new THREE.MeshBasicMaterial({
      color: 0xffd27a, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    this.glow.rotation.x = -Math.PI / 2;
    this.glow.position.set(x, 0.02, z);

    const c = document.createElement('canvas');
    c.width = 384;
    c.height = 320;
    this.numCtx = c.getContext('2d')!;
    this.numTex = new THREE.CanvasTexture(c);
    this.numTex.colorSpace = THREE.SRGBColorSpace;
    this.num = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.numTex, transparent: true, depthWrite: false, toneMapped: false, fog: false }));
    this.num.position.set(x, NUM_Y, z);
    this.num.visible = false;

    const frame = new THREE.Mesh(new THREE.BoxGeometry(BOARD_W + 0.24, BOARD_H + 0.24, 0.12), new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.6 }));
    frame.position.set(BOARD_POS.x, BOARD_POS.y, BOARD_POS.z - 0.07);
    this.board.mesh.position.set(BOARD_POS.x, BOARD_POS.y, BOARD_POS.z);
    this.group.add(pad, ring, label, this.glow, this.num, frame, this.board.mesh);
  }

  update(st: KartStatus): void {
    this.st = { ...st, names: st.names.slice() };
    this.at = this.now;
    this.board.update(st);
  }

  /** Секунд до старта (между сообщениями сервера тикают сами). */
  get left(): number {
    return Math.max(0, this.st.left - Math.floor(this.now - this.at));
  }

  get status(): KartStatus {
    return this.st;
  }

  /** Каждый кадр (время мира в секундах). */
  tick(time: number): void {
    this.now = time;
    this.board.tick(time);
    const counting = this.st.phase === 'count';
    const m = this.glow.material;
    if (counting) {
      // вспышка на каждой секунде отсчёта, затухает к следующей
      const f = (time - this.at) % 1;
      m.opacity = 0.22 + 0.5 * Math.exp(-f * 5);
      m.color.setHex(0x7dffb0);
    } else {
      m.opacity = this.st.phase === 'idle' ? 0.1 + 0.05 * Math.sin(time * 2.2) : 0.05;
      m.color.setHex(0xffd27a);
    }
    this.num.visible = counting;
    if (!counting) return;
    const text = String(this.left);
    const sub = `гонщиков: ${Math.min(this.st.n, 6)} из 6`;
    if (text + sub !== this.numShown) {
      if (!this.numShown.startsWith(text)) this.numAt = time;
      this.numShown = text + sub;
      this.drawNumber(text, sub);
    }
    const pop = 1 + 0.35 * Math.exp(-(time - this.numAt) * 7);
    this.num.scale.set(NUM_SIZE * 1.2 * pop, NUM_SIZE * pop, 1);
    this.num.position.y = NUM_Y + 0.08 * Math.sin(time * 3);
  }

  private drawNumber(text: string, sub: string): void {
    const ctx = this.numCtx;
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.font = `900 190px ${FONT}`;
    ctx.lineWidth = 18;
    ctx.strokeStyle = 'rgba(20,16,12,0.9)';
    ctx.strokeText(text, W / 2, 128);
    ctx.fillStyle = Number(text) <= 3 ? '#ffd27a' : '#ffffff';
    ctx.fillText(text, W / 2, 128);
    ctx.font = `800 40px ${FONT}`;
    const tw = ctx.measureText(sub).width;
    if (tw > W - 24) ctx.font = `800 ${Math.floor((40 * (W - 24)) / tw)}px ${FONT}`;
    ctx.lineWidth = 8;
    ctx.strokeText(sub, W / 2, 278);
    ctx.fillStyle = '#7dffb0';
    ctx.fillText(sub, W / 2, 278);
    this.numTex.needsUpdate = true;
  }
}

/** Плоское кольцо из клеток (два ряда, шахматкой), лежит в плоскости XZ, нормаль вверх. */
function checkerRing(r0: number, r1: number, cells: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const dark = new THREE.Color(0x1b1b1d);
  const light = new THREE.Color(0xf1ece0);
  const rm = (r0 + r1) / 2;
  for (let band = 0; band < 2; band++) {
    const a0r = band === 0 ? r0 : rm;
    const a1r = band === 0 ? rm : r1;
    for (let i = 0; i < cells; i++) {
      const a0 = (i / cells) * Math.PI * 2;
      const a1 = ((i + 1) / cells) * Math.PI * 2;
      const p = (a: number, r: number): [number, number, number] => [Math.cos(a) * r, 0, Math.sin(a) * r];
      // обход против часовой, если смотреть сверху: лицевая сторона — вверх
      const v = [p(a0, a0r), p(a1, a1r), p(a0, a1r), p(a0, a0r), p(a1, a0r), p(a1, a1r)];
      const c = (band + i) % 2 ? light : dark;
      for (const q of v) {
        pos.push(...q);
        col.push(c.r, c.g, c.b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, k) => (k % 3 === 1 ? 1 : 0)), 3));
  return g;
}

/** Надпись на настиле: «СТАРТ» и подсказка под ней — читается от площади (с юга). */
function labelTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 768;
  c.height = 320;
  const ctx = c.getContext('2d')!;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 150px ${FONT}`;
  ctx.fillStyle = 'rgba(245,240,228,0.92)';
  ctx.fillText('СТАРТ', 384, 128);
  ctx.font = `700 50px ${FONT}`;
  ctx.fillStyle = 'rgba(245,240,228,0.8)';
  ctx.fillText('встань в круг — и поехали', 384, 262);
  // потёртость краски: светлые крапинки стираем
  ctx.globalCompositeOperation = 'destination-out';
  let seed = 7;
  for (let i = 0; i < 900; i++) {
    seed = (seed * 16807) % 2147483647;
    const px = (seed % 768) + 0.5;
    seed = (seed * 16807) % 2147483647;
    const py = (seed % 320) + 0.5;
    ctx.fillStyle = `rgba(0,0,0,${0.25 + (seed % 50) / 100})`;
    ctx.fillRect(px, py, 2 + (seed % 3), 2 + (seed % 2));
  }
  ctx.globalCompositeOperation = 'source-over';
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

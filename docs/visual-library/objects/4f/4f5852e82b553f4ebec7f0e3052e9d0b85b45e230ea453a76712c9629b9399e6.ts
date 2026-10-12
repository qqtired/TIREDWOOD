// Лицо желейки в новом виде (look v2, см. look.ts): рот и румянец под глазами. Рот меняется с настроением: улыбка,
// во весь рот в танце, смехе, «пять» и обнимашках, сонный у уставшего, «о» от боли, спокойный у статуи; пока
// желейка пишет в чат — «говорит». Глаза и веки — как были (avatar.ts).
// Один изогнутый по телу лоскут с прозрачной текстурой (рисуется на canvas при загрузке): все выражения — полосы
// одной текстуры, выражение — своя развёртка (геометрии общие на всех). На желейку — один вызов отрисовки.
import * as THREE from 'three';
import { ACT_DANCE, ACT_LAUGH, ACT_RESPECT, ACT_TIRED, ACT_WAVE } from '../../shared/lobby.ts';
import { BODY_H, bodyR } from './outfit3d.ts';

type Mouth = 'smile' | 'grin' | 'wide' | 'sleepy' | 'o' | 'grr' | 'calm';
const MOUTHS: readonly Mouth[] = ['smile', 'grin', 'wide', 'sleepy', 'o', 'grr', 'calm'];

/** Лоскут: полуширина по телу (м), низ и верх; рот — посередине на высоте MOUTH_Y, румянец — под глазами */
const HALF = 0.256;
const Y0 = 0.91;
const Y1 = 1.11;
const MOUTH_Y = 0.985;
/** Над телом, м: лоскут не тонет в желе, когда оно чуть качается */
const LIFT = 0.012;
/** Сдвиг вслед за макушкой на высоте рта — как у тела: (y / BODY_H)² */
const LEAN_K = (MOUTH_Y / BODY_H) ** 2;
/** Сколько секунд «говорит», когда появилось облачко чата */
const TALK_S = 1.4;
const TALK: readonly Mouth[] = ['o', 'smile', 'grin', 'o', 'calm', 'grin', 'smile'];

/** Текстура выражений: по полосе 512 × 200 пикселей (1 мм = 1 пиксель) на каждое, сверху вниз — как в MOUTHS. */
function faceTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 200;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H * MOUTHS.length;
  const ctx = c.getContext('2d')!;
  const ink = '#3a1418';
  const inside = '#5a1822';
  const tongue = '#ff7a8e';
  const cx = W / 2;
  const my = (Y1 - MOUTH_Y) * 1000;
  MOUTHS.forEach((m, i) => {
    ctx.save();
    ctx.translate(0, i * H);
    // румянец: мягкие розовые пятна под глазами (сильнее — когда смеётся)
    const blush = m === 'grin' || m === 'wide' ? 0.62 : m === 'calm' || m === 'sleepy' ? 0.3 : 0.45;
    for (const s of [-1, 1]) {
      const bx = cx + s * 200;
      const by = (Y1 - 1.012) * 1000;
      const g = ctx.createRadialGradient(bx, by, 0, bx, by, 56);
      g.addColorStop(0, `rgba(255,105,135,${blush})`);
      g.addColorStop(0.55, `rgba(255,105,135,${blush * 0.55})`);
      g.addColorStop(1, 'rgba(255,105,135,0)');
      ctx.fillStyle = g;
      ctx.save();
      ctx.translate(bx, by);
      ctx.scale(1, 0.6);
      ctx.translate(-bx, -by);
      ctx.fillRect(bx - 60, by - 60, 120, 120);
      ctx.restore();
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = ink;
    const open = (w: number, top: number, sag: number, depth: number, t: number) => {
      // открытый рот: верхняя губа чуть провисает, низ — глубокая дуга; язык снизу
      ctx.beginPath();
      ctx.moveTo(cx - w, my + top);
      ctx.quadraticCurveTo(cx, my + top + sag, cx + w, my + top);
      ctx.bezierCurveTo(cx + w * 0.82, my + top + depth, cx - w * 0.82, my + top + depth, cx - w, my + top);
      ctx.closePath();
      ctx.fillStyle = inside;
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = tongue;
      ctx.beginPath();
      ctx.ellipse(cx, my + top + depth * 0.78, w * 0.52, t, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.lineWidth = 6;
      ctx.stroke();
    };
    if (m === 'smile') {
      ctx.lineWidth = 11;
      ctx.beginPath();
      ctx.moveTo(cx - 68, my - 10);
      ctx.quadraticCurveTo(cx, my + 40, cx + 68, my - 10);
      ctx.stroke();
    } else if (m === 'grin') {
      open(76, -16, 12, 74, 19);
    } else if (m === 'wide') {
      open(84, -20, 14, 92, 25);
    } else if (m === 'sleepy') {
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(cx - 34, my + 4);
      ctx.bezierCurveTo(cx - 14, my - 5, cx + 12, my + 11, cx + 34, my + 2);
      ctx.stroke();
    } else if (m === 'o') {
      ctx.fillStyle = inside;
      ctx.beginPath();
      ctx.ellipse(cx, my + 4, 22, 27, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = tongue;
      ctx.beginPath();
      ctx.ellipse(cx, my + 21, 13, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.ellipse(cx, my + 4, 22, 27, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (m === 'grr') {
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(cx - 46, my + 8);
      ctx.quadraticCurveTo(cx, my - 3, cx + 46, my + 4);
      ctx.stroke();
    } else {
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(cx - 32, my + 2);
      ctx.quadraticCurveTo(cx, my + 11, cx + 32, my + 2);
      ctx.stroke();
    }
    ctx.restore();
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

let shared: { geos: Record<Mouth, THREE.BufferGeometry>; mat: THREE.MeshStandardMaterial } | null = null;

/** Лоскут по форме тела (смотрит вперёд, −Z) и по развёртке на каждое выражение. */
function makeShared() {
  const base = new THREE.PlaneGeometry(HALF * 2, Y1 - Y0, 16, 4).rotateY(Math.PI);
  const pos = base.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const s = pos.getX(i);
    const y = (Y0 + Y1) / 2 + pos.getY(i);
    const r = bodyR(y) + LIFT;
    const a = s / r;
    pos.setXYZ(i, r * Math.sin(a), y, -r * Math.cos(a));
  }
  base.computeVertexNormals();
  base.computeBoundingSphere();
  const n = MOUTHS.length;
  const geos = {} as Record<Mouth, THREE.BufferGeometry>;
  MOUTHS.forEach((m, row) => {
    const g = base.clone();
    const uv = g.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - (row + 1 - uv.getY(i)) / n);
    geos[m] = g;
  });
  const mat = new THREE.MeshStandardMaterial({
    map: faceTexture(),
    transparent: true,
    depthWrite: false,
    roughness: 0.55,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  return { geos, mat };
}

/** Рот и румянец одной желейки: node — в узел тела (сжимается вместе с ним), update — каждый кадр. */
export class JellyFace {
  readonly node = new THREE.Group();
  private readonly mesh: THREE.Mesh;
  private mouth: Mouth = 'smile';
  private talkUntil = -1;
  private wasTalking = false;

  constructor() {
    shared ??= makeShared();
    this.mesh = new THREE.Mesh(shared.geos.smile, shared.mat);
    this.node.add(this.mesh);
  }

  /**
   * lx, lz — сдвиг макушки (наклон желе), action — действие набережной, lid — веки (как в avatar.ts: open, sleepy,
   * angry, happy), hurt — больно, talking — висит облачко чата.
   */
  update(time: number, lx: number, lz: number, action: number, lid: string, hurt: boolean, talking: boolean): void {
    this.node.position.set(lx * LEAN_K, 0, lz * LEAN_K);
    if (talking && !this.wasTalking) this.talkUntil = time + TALK_S;
    this.wasTalking = talking;
    let m: Mouth;
    if (hurt) m = 'o';
    else if (action === ACT_RESPECT) m = 'calm';
    else if (time < this.talkUntil) m = TALK[Math.floor(time * 9) % TALK.length];
    else if (action === ACT_LAUGH) m = Math.floor(time * 6) % 2 ? 'wide' : 'grin';
    else if (action === ACT_TIRED || lid === 'sleepy') m = 'sleepy';
    else if (lid === 'happy' || action === ACT_DANCE || action === ACT_WAVE) m = 'grin';
    else if (lid === 'angry') m = 'grr';
    else m = 'smile';
    if (m !== this.mouth) {
      this.mouth = m;
      this.mesh.geometry = shared!.geos[m];
    }
  }
}

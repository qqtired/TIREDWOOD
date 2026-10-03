// Плавающая табличка над столом карточной игры (дурак, блэкджек): название, места, ставка, состояние стола.
// Рисуется один раз на холсте и перерисовывается только при смене текста — спрайт всегда лицом к камере,
// плавно «дышит» по высоте, а вдали увеличивается, чтобы читалась с набережной.
import * as THREE from 'three';
import { drawSuit } from '../render/textures.ts';

export type SignTone = 'free' | 'wait' | 'busy';
export type SignTheme = 'durak' | 'blackjack';

export interface SignModel {
  /** Крупно: «ДУРАК», «BLACKJACK» */
  title: string;
  /** Мелко под названием: режим, выплата */
  sub: string;
  /** Нижняя строка: ставка и банк */
  stake: string;
  /** Занято мест из seats */
  seated: number;
  seats: number;
  /** Плашка состояния и её цвет */
  state: string;
  tone: SignTone;
  /** Козырная масть идущей партии (0–3): золотая монетка на табличке дурака, чтобы козырь читался издалека */
  trump?: number;
}

const W = 1024;
const H = 320;
const FONT = 'Rubik, system-ui, sans-serif';
/** Ширина спрайта у стола, м; издали растёт (до FAR_MAX раз), чтобы читалась */
const BASE_W = 1.7;
const FAR_FROM = 5;
const FAR_MAX = 2;

interface Theme {
  top: string;
  bottom: string;
  edge: string;
  title: string;
  sub: string;
  stake: string;
  shadow: string;
}

const THEMES: Record<SignTheme, Theme> = {
  // дворовый стол: тёмное дерево и тёплый крем
  durak: { top: '#6a4430', bottom: '#44291b', edge: '#f4dcab', title: '#fff1d0', sub: '#f4d9a2', stake: '#ffd35c', shadow: 'rgba(30,14,6,0.55)' },
  // казино набережной: тёмно-зелёное сукно и золото
  blackjack: { top: '#1d6a52', bottom: '#103f31', edge: '#ecc983', title: '#fbe7ad', sub: '#d9f0d8', stake: '#ffd35c', shadow: 'rgba(5,28,20,0.55)' },
};

const TONES: Record<SignTone, { bg: string; fg: string }> = {
  free: { bg: '#78d68c', fg: '#0f3b1d' },
  wait: { bg: '#86cdfc', fg: '#0d2f4c' },
  busy: { bg: '#ffa04f', fg: '#431c06' },
};

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
}

/** Жирный шрифт такого размера, чтобы text влез в maxW. */
function fit(c: CanvasRenderingContext2D, text: string, size: number, maxW: number, weight = 900): void {
  c.font = `${weight} ${size}px ${FONT}`;
  const w = c.measureText(text).width;
  if (w > maxW) c.font = `${weight} ${Math.floor((size * maxW) / w)}px ${FONT}`;
}

function drawCard(c: CanvasRenderingContext2D, x: number, y: number, rot: number, face: { rank: string; suit: string; red: boolean } | null): void {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.shadowColor = 'rgba(0,0,0,0.4)';
  c.shadowBlur = 10;
  c.shadowOffsetY = 4;
  roundRect(c, -48, -68, 96, 136, 12);
  c.fillStyle = '#fff8ea';
  c.fill();
  c.shadowColor = 'transparent';
  if (face) {
    c.fillStyle = face.red ? '#c82734' : '#1c2430';
    c.textAlign = 'left';
    c.font = `900 34px ${FONT}`;
    c.fillText(face.rank, -38, -34);
    c.textAlign = 'center';
    c.font = `54px serif`;
    c.fillText(face.suit, 0, 22);
    c.font = `26px serif`;
    c.textAlign = 'left';
    c.fillText(face.suit, -38, -10);
  } else {
    // рубашка: красная с белой каймой и ромбом
    roundRect(c, -40, -60, 80, 120, 8);
    c.fillStyle = '#c93a42';
    c.fill();
    c.strokeStyle = '#fff3e2';
    c.lineWidth = 3;
    c.stroke();
    c.beginPath();
    c.moveTo(0, -30);
    c.lineTo(22, 0);
    c.lineTo(0, 30);
    c.lineTo(-22, 0);
    c.closePath();
    c.fillStyle = '#fff3e2';
    c.fill();
  }
  c.restore();
}

function paint(c: CanvasRenderingContext2D, theme: SignTheme, m: SignModel): void {
  const t = THEMES[theme];
  c.clearRect(0, 0, W, H);
  c.save();
  c.shadowColor = t.shadow;
  c.shadowBlur = 16;
  c.shadowOffsetY = 6;
  roundRect(c, 12, 10, W - 24, H - 28, 44);
  const g = c.createLinearGradient(0, 10, 0, H - 18);
  g.addColorStop(0, t.top);
  g.addColorStop(1, t.bottom);
  c.fillStyle = g;
  c.fill();
  c.restore();
  c.lineWidth = 7;
  c.strokeStyle = t.edge;
  roundRect(c, 12, 10, W - 24, H - 28, 44);
  c.stroke();
  c.lineWidth = 2;
  c.strokeStyle = 'rgba(255,240,210,0.28)';
  roundRect(c, 26, 24, W - 52, H - 56, 32);
  c.stroke();

  // значок слева: две карты (у блэкджека — туз и король и золотое «21»)
  if (theme === 'durak') {
    drawCard(c, 108, 158, -0.24, null);
    drawCard(c, 168, 150, 0.16, { rank: 'Т', suit: '♠', red: false });
    if (m.trump !== undefined) {
      c.beginPath();
      c.arc(212, 212, 40, 0, Math.PI * 2);
      c.fillStyle = '#4a2a16';
      c.fill();
      c.beginPath();
      c.arc(212, 212, 36, 0, Math.PI * 2);
      c.fillStyle = '#f2b92f';
      c.fill();
      c.beginPath();
      c.arc(212, 212, 29, 0, Math.PI * 2);
      c.fillStyle = '#fff6e0';
      c.fill();
      c.fillStyle = m.trump >= 2 ? '#cc2730' : '#1d1f2c';
      drawSuit(c, m.trump, 212, 212, 40);
    }
  } else {
    drawCard(c, 108, 158, -0.22, { rank: 'Т', suit: '♠', red: false });
    drawCard(c, 168, 150, 0.16, { rank: 'К', suit: '♥', red: true });
    c.beginPath();
    c.arc(206, 208, 34, 0, Math.PI * 2);
    c.fillStyle = '#f4c64e';
    c.fill();
    c.lineWidth = 4;
    c.strokeStyle = '#fff3c9';
    c.stroke();
    c.fillStyle = '#4a2f06';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `900 36px ${FONT}`;
    c.fillText('21', 206, 210);
    c.textBaseline = 'alphabetic';
  }

  // название, режим, ставка
  c.textAlign = 'left';
  c.fillStyle = t.title;
  fit(c, m.title, 118, 500);
  c.shadowColor = 'rgba(0,0,0,0.35)';
  c.shadowBlur = 6;
  c.shadowOffsetY = 3;
  c.fillText(m.title, 252, 142);
  c.shadowColor = 'transparent';
  c.fillStyle = t.sub;
  fit(c, m.sub, 44, 500, 600);
  c.fillText(m.sub, 254, 198);
  c.fillStyle = t.stake;
  fit(c, m.stake, 50, 500, 800);
  c.fillText(m.stake, 254, 262);

  // справа: точки-места и плашка состояния
  const cx = 888;
  for (let i = 0; i < m.seats; i++) {
    const x = cx + (i - (m.seats - 1) / 2) * 34;
    c.beginPath();
    c.arc(x, 70, 13, 0, Math.PI * 2);
    if (i < m.seated) {
      c.fillStyle = '#ffd35c';
      c.fill();
    } else {
      c.lineWidth = 3;
      c.strokeStyle = 'rgba(255,240,210,0.6)';
      c.stroke();
    }
  }
  c.fillStyle = t.title;
  c.textAlign = 'center';
  c.font = `700 40px ${FONT}`;
  c.fillText(`мест ${m.seated} из ${m.seats}`, cx, 136);
  const tone = TONES[m.tone];
  roundRect(c, cx - 112, 170, 224, 80, 40);
  c.fillStyle = tone.bg;
  c.fill();
  c.fillStyle = tone.fg;
  fit(c, m.state, 44, 192, 800);
  c.fillText(m.state, cx, 224);
}

const _wp = new THREE.Vector3();

export class TableSign {
  readonly sprite: THREE.Sprite;
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly tex: THREE.CanvasTexture;
  private key = '';
  private model: SignModel | null = null;
  private baseY = 0;
  private phase = 0;

  private readonly theme: SignTheme;

  constructor(theme: SignTheme, phase = 0) {
    this.theme = theme;
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false, fog: false }));
    this.sprite.scale.set(BASE_W, BASE_W * (H / W), 1);
    this.sprite.renderOrder = 6;
    this.phase = phase;
  }

  /** Поставить над точкой (локальные координаты родителя). */
  place(x: number, y: number, z: number): void {
    this.baseY = y;
    this.sprite.position.set(x, y, z);
  }

  set(m: SignModel): void {
    this.model = m;
    const key = JSON.stringify(m);
    if (key === this.key) return;
    this.key = key;
    paint(this.ctx, this.theme, m);
    this.tex.needsUpdate = true;
  }

  get current(): SignModel | null {
    return this.model;
  }

  /** Раз в кадр: покачивание и размер по расстоянию до камеры. */
  update(time: number, camPos: THREE.Vector3): void {
    if (!this.sprite.visible) return;
    this.sprite.position.y = this.baseY + Math.sin(time * 1.5 + this.phase) * 0.03;
    this.sprite.getWorldPosition(_wp);
    const d = _wp.distanceTo(camPos);
    const k = Math.min(FAR_MAX, Math.max(1, d / FAR_FROM));
    const w = BASE_W * k;
    this.sprite.scale.set(w, w * (H / W), 1);
  }

  dispose(): void {
    this.sprite.removeFromParent();
    this.sprite.material.dispose();
    this.tex.dispose();
  }
}

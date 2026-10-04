// Табличка с одной строкой, которую сцена перерисовывает по живому статусу режима (холст трогаем, только когда
// меняется текст). Плоскость смотрит в (sin ry, cos ry): 0 — на юг, к площади.
import * as THREE from 'three';
import { canvasTexture, FONT, makeCanvas, roundRectPath } from './gfx.ts';

export interface PlateStyle {
  bg: string;
  border: string;
  fg: string;
  /** Пикселей на метр */
  ppm?: number;
  weight?: number;
  /** Подсветка холста */
  glow?: number;
}

export class LinePlate {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly tex: THREE.CanvasTexture;
  private key = '\u0000';
  readonly w: number;
  readonly h: number;
  private readonly style: PlateStyle;

  /** signs — табличка гаснет вместе со светом в сети (гроза): материал заносится в общий список вывесок */
  constructor(w: number, h: number, style: PlateStyle, signs?: Map<THREE.MeshStandardMaterial, number>) {
    this.w = w;
    this.h = h;
    this.style = style;
    const ppm = style.ppm ?? 280;
    const [c, ctx] = makeCanvas(w * ppm, h * ppm);
    this.ctx = ctx;
    this.tex = canvasTexture(c);
    const glow = style.glow ?? 0.3;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ map: this.tex, emissiveMap: this.tex, emissive: 0xffffff, emissiveIntensity: glow, roughness: 0.8 }),
    );
    signs?.set(this.mesh.material, glow);
    this.set('');
  }

  /** Строка в табличке; те же слова второй раз не перерисовываются. */
  set(text: string): void {
    if (text === this.key) return;
    this.key = text;
    const { ctx } = this;
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    ctx.clearRect(0, 0, W, H);
    roundRectPath(ctx, 2, 2, W - 4, H - 4, H * 0.22);
    ctx.fillStyle = this.style.bg;
    ctx.fill();
    ctx.strokeStyle = this.style.border;
    ctx.lineWidth = Math.max(3, H * 0.07);
    ctx.stroke();
    ctx.font = `${this.style.weight ?? 700} ${Math.round(H * 0.5)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = this.style.fg;
    ctx.fillText(text, W / 2, H * 0.53, W - H * 0.5);
    this.tex.needsUpdate = true;
  }
}

// Эффекты Небесной каланчи: облачка и пыль, звёзды вокруг головы при ударе, конфетти у колокола, искры у флага,
// всплывающие надписи «БУМС!». Одна система точек (круг, звезда, квадратик) и несколько спрайтов-надписей.
import * as THREE from 'three';
import { fxKeep } from '../render/gfx.ts';

const MAX = 600;
const K_DOT = 0;
const K_STAR = 1;
const K_SQUARE = 2;

interface Pop { sprite: THREE.Sprite; tex: THREE.CanvasTexture; canvas: HTMLCanvasElement; life: number; vy: number }

export class SkillFx {
  private readonly geo = new THREE.BufferGeometry();
  private readonly pos = new Float32Array(MAX * 3);
  private readonly vel = new Float32Array(MAX * 3);
  private readonly col = new Float32Array(MAX * 3);
  private readonly size = new Float32Array(MAX);
  private readonly alpha = new Float32Array(MAX);
  private readonly kind = new Float32Array(MAX);
  private readonly spin = new Float32Array(MAX);
  private readonly life = new Float32Array(MAX);
  private readonly max = new Float32Array(MAX);
  private readonly drag = new Float32Array(MAX);
  private readonly grav = new Float32Array(MAX);
  private next = 0;
  private readonly pops: Pop[] = [];
  private readonly tmp = new THREE.Color();

  constructor(scene: THREE.Scene) {
    const g = this.geo;
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    g.setAttribute('aKind', new THREE.BufferAttribute(this.kind, 1));
    g.setAttribute('aSpin', new THREE.BufferAttribute(this.spin, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader: `
        attribute vec3 aColor; attribute float aSize; attribute float aAlpha; attribute float aKind; attribute float aSpin;
        varying vec3 vC; varying float vA; varying float vK; varying float vS;
        void main(){
          vC = aColor; vA = aAlpha; vK = aKind; vS = aSpin;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (520.0 / max(0.5, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vC; varying float vA; varying float vK; varying float vS;
        void main(){
          vec2 p = gl_PointCoord - 0.5;
          float c = cos(vS), s = sin(vS);
          p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
          float a;
          if (vK < 0.5) a = smoothstep(0.5, 0.15, length(p));
          else if (vK < 1.5) {
            float r = length(p) * 2.0; float t = atan(p.y, p.x);
            float star = 0.55 + 0.45 * cos(5.0 * t);
            a = 1.0 - smoothstep(star * 0.85, star * 0.85 + 0.12, r / 0.95);
          } else a = step(abs(p.x), 0.32) * step(abs(p.y), 0.2);
          if (a * vA < 0.02) discard;
          gl_FragColor = vec4(vC, a * vA);
          #include <colorspace_fragment>
        }`,
    });
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 5;
    scene.add(pts);
    for (let i = 0; i < 4; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 96;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
      sprite.visible = false;
      sprite.renderOrder = 10;
      scene.add(sprite);
      this.pops.push({ sprite, tex, canvas, life: 0, vy: 0 });
    }
  }

  private spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: number, size: number, life: number, kind: number, drag = 1.5, grav = 0): void {
    // меню → Графика → «Эффекты и частицы»: при «Меньше» часть частиц не рождается
    if (!fxKeep()) return;
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.tmp.setHex(color);
    this.col[i * 3] = this.tmp.r; this.col[i * 3 + 1] = this.tmp.g; this.col[i * 3 + 2] = this.tmp.b;
    this.size[i] = size;
    this.alpha[i] = 1;
    this.kind[i] = kind;
    this.spin[i] = Math.random() * 6.28;
    this.life[i] = life;
    this.max[i] = life;
    this.drag[i] = drag;
    this.grav[i] = grav;
  }

  /** Облачко пара/облака: мягкие белые клубы в стороны. */
  puff(x: number, y: number, z: number, n = 10, color = 0xffffff, spread = 2.2, size = 0.9): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = spread * (0.4 + Math.random() * 0.6);
      this.spawn(x, y, z, Math.cos(a) * s, 0.4 + Math.random() * 1.2, Math.sin(a) * s, color, size * (0.7 + Math.random() * 0.6), 0.6 + Math.random() * 0.5, K_DOT, 2.5);
    }
  }

  /** Пыль из-под ног или от удара тарана. */
  dust(x: number, y: number, z: number, n = 8): void {
    this.puff(x, y, z, n, 0xdccdb4, 1.8, 0.55);
  }

  /** Удар ловушки: звёзды кольцом и вспышка. */
  hit(x: number, y: number, z: number): void {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      this.spawn(x, y, z, Math.cos(a) * 4.5, 1.5 + Math.random(), Math.sin(a) * 4.5, i % 2 ? 0xffd23f : 0xffffff, 0.55, 0.65, K_STAR, 3.2);
    }
    this.puff(x, y, z, 6, 0xffffff, 3, 0.7);
    this.text(x, y + 1.2, z, 'БУМС!', '#e23b30');
  }

  /** Отскок гриба: жёлтые искры вниз-вбок. */
  boing(x: number, y: number, z: number): void {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      this.spawn(x, y + 0.1, z, Math.cos(a) * 3, 0.6, Math.sin(a) * 3, 0xffd23f, 0.35, 0.4, K_STAR, 4);
    }
  }

  /** Точка взята: золотые искры фонтаном. */
  sparkle(x: number, y: number, z: number): void {
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1 + Math.random() * 2.5;
      this.spawn(x, y, z, Math.cos(a) * s, 3 + Math.random() * 3, Math.sin(a) * s, i % 3 ? 0xffd23f : 0x8fe39a, 0.32, 1.1, K_STAR, 1.2, 7);
    }
  }

  /** Колокол: конфетти. */
  confetti(x: number, y: number, z: number, n = 140): void {
    const colors = [0xe23b30, 0xffd23f, 0x3f8ad4, 0x37b24d, 0xffffff, 0xff8fb1];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 2 + Math.random() * 5;
      this.spawn(x, y, z, Math.cos(a) * s, 4 + Math.random() * 6, Math.sin(a) * s, colors[i % colors.length], 0.3, 2.6 + Math.random(), K_SQUARE, 1.4, 5);
    }
  }

  /** Всплывающая надпись над точкой. */
  text(x: number, y: number, z: number, text: string, color = '#ffffff'): void {
    const p = this.pops.find((q) => q.life <= 0) ?? this.pops[0];
    const g = p.canvas.getContext('2d')!;
    g.clearRect(0, 0, 256, 96);
    g.font = '900 60px Rubik, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 10;
    g.strokeStyle = '#ffffff';
    g.strokeText(text, 128, 50, 240);
    g.fillStyle = color;
    g.fillText(text, 128, 50, 240);
    p.tex.needsUpdate = true;
    p.sprite.position.set(x, y, z);
    p.sprite.visible = true;
    p.life = 0.9;
    p.vy = 1.6;
  }

  update(dt: number): void {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.max[i]);
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= d;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt;
      this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.alpha[i] = k < 0.3 ? k / 0.3 : 1;
      if (this.kind[i] === K_DOT) this.size[i] *= 1 + dt * 0.9;
      this.spin[i] += dt * (this.kind[i] === K_SQUARE ? 7 : 3);
    }
    for (const name of ['position', 'aAlpha', 'aSize', 'aSpin', 'aColor', 'aKind'] as const) this.geo.getAttribute(name).needsUpdate = true;
    for (const p of this.pops) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.sprite.position.y += p.vy * dt;
      const k = Math.max(0, p.life / 0.9);
      const pop = k > 0.8 ? 1 + (k - 0.8) * 3 : 1;
      p.sprite.scale.set(2.4 * pop, 0.9 * pop, 1);
      (p.sprite.material as THREE.SpriteMaterial).opacity = Math.min(1, k * 2.5);
      if (p.life <= 0) p.sprite.visible = false;
    }
  }

  clear(): void {
    this.life.fill(0);
    for (const p of this.pops) { p.life = 0; p.sprite.visible = false; }
  }
}

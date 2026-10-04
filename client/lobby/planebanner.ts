// Баннер за гидропланом «Стриж»: полотнище с надписью до 40 знаков (рисуется на холсте — никакого HTML) на тросе за
// хвостом, колышется волной, как в прототипе лаборатории №19 «Самолёт с баннером». Надпись читается с обеих сторон:
// две сетки спиной к спине, у каждой — своя сторона. И окошко заказа: текст, счётчик знаков, цена, когда взлетит.
import * as THREE from 'three';
import { BANNER_MAX, BANNER_PRICE } from '../../shared/plane.ts';

const FONT = 'Rubik, system-ui, sans-serif';
/** Высота полотнища, м; длина — по тексту (10…24 м) */
const BH = 3.2;
const SEG_X = 36;
const SEG_Y = 3;
/** Трос: от хвоста (оси самолёта, нос на −Z) до передней кромки полотнища — длинный, полотнище висит за камерой пилота */
const TAIL = new THREE.Vector3(0, 0.05, 4.1);
const ROPE = 12;
const Z0 = TAIL.z + ROPE;
const YC = TAIL.y - 0.9;

/** Длина полотнища под текст: короткий — крупно, длинный — длиннее полотнище */
function clothLen(text: string): number {
  return Math.min(24, Math.max(10, BH * (1.3 + 0.36 * [...text].length)));
}

export class BannerCloth {
  readonly group = new THREE.Group();
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly tex: THREE.CanvasTexture;
  private readonly mat: THREE.MeshStandardMaterial;
  private readonly sides: { mesh: THREE.Mesh; base: Float32Array }[] = [];
  private readonly ropes: THREE.LineSegments;
  private readonly pole: THREE.Mesh;
  private text = '';
  private len = 10;

  constructor() {
    this.ctx = this.canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.mat = new THREE.MeshStandardMaterial({ map: this.tex, roughness: 0.9, metalness: 0 });
    const rg = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12), 3));
    this.ropes = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0x5b4a3a }));
    this.ropes.frustumCulled = false;
    this.pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, BH + 0.3, 6), new THREE.MeshStandardMaterial({ color: 0x5b4a3a, roughness: 0.8 }));
    this.pole.position.set(0, YC, Z0);
    this.group.add(this.ropes, this.pole);
    this.group.visible = false;
    // шрифт мог ещё не загрузиться — перерисуем, когда загрузится
    void document.fonts?.load(`900 80px ${FONT}`).then(() => {
      if (this.text) this.paint();
    });
  }

  /** Надпись ('' — баннера нет) */
  set(text: string): void {
    if (text === this.text) return;
    this.text = text;
    this.group.visible = text !== '';
    if (!text) return;
    const len = clothLen(text);
    if (len !== this.len || this.sides.length === 0) this.build(len);
    this.paint();
  }

  get on(): boolean {
    return this.text !== '';
  }

  /** Две стороны полотнища: +X и −X, у обеих начало надписи — слева для смотрящего */
  private build(len: number): void {
    this.len = len;
    for (const s of this.sides) {
      this.group.remove(s.mesh);
      s.mesh.geometry.dispose();
    }
    this.sides.length = 0;
    for (const dir of [1, -1]) {
      const g = new THREE.PlaneGeometry(len, BH, SEG_X, SEG_Y);
      g.rotateY((dir * Math.PI) / 2);
      g.translate(0, YC, Z0 + len / 2);
      const mesh = new THREE.Mesh(g, this.mat);
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.sides.push({ mesh, base: Float32Array.from(g.getAttribute('position').array as Float32Array) });
    }
    const p = this.ropes.geometry.getAttribute('position') as THREE.BufferAttribute;
    p.setXYZ(0, TAIL.x, TAIL.y, TAIL.z);
    p.setXYZ(1, 0, YC + BH / 2, Z0);
    p.setXYZ(2, TAIL.x, TAIL.y, TAIL.z);
    p.setXYZ(3, 0, YC - BH / 2, Z0);
    p.needsUpdate = true;
  }

  private paint(): void {
    const c = this.ctx;
    const W = 2048;
    const H = Math.round((W * BH) / this.len);
    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = W;
      this.canvas.height = H;
    }
    c.fillStyle = '#fffaf0';
    c.fillRect(0, 0, W, H);
    const bw = Math.max(10, Math.round(H * 0.07));
    c.strokeStyle = '#d6384a';
    c.lineWidth = bw;
    c.strokeRect(bw / 2, bw / 2, W - bw, H - bw);
    c.fillStyle = '#d6384a';
    for (let x = 30; x < W - 30; x += 52) {
      c.fillRect(x, bw + 6, 22, 6);
      c.fillRect(x, H - bw - 12, 22, 6);
    }
    let size = Math.round(H * 0.6);
    c.font = `900 ${size}px ${FONT}`;
    while (c.measureText(this.text).width > W - 120 && size > 20) {
      size -= 4;
      c.font = `900 ${size}px ${FONT}`;
    }
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#b3232f';
    c.fillText(this.text, W / 2, H / 2 + size * 0.05);
    this.tex.needsUpdate = true;
  }

  /** Кадр: полотнище бежит волной от троса к хвосту, конец чуть провисает (t — секунды) */
  update(t: number): void {
    if (!this.group.visible) return;
    const L = this.len;
    for (const s of this.sides) {
      const g = s.mesh.geometry;
      const pos = g.getAttribute('position') as THREE.BufferAttribute;
      const b = s.base;
      for (let i = 0; i < pos.count; i++) {
        const by = b[i * 3 + 1];
        const bz = b[i * 3 + 2];
        const u = (bz - Z0) / L;
        const ph = u * 9 - t * 6.5;
        pos.setXYZ(i, (0.05 + 0.5 * u) * Math.sin(ph), by - 0.45 * u * u + 0.08 * u * Math.sin(ph * 0.8), bz);
      }
      pos.needsUpdate = true;
      g.computeVertexNormals();
    }
  }

  dispose(): void {
    for (const s of this.sides) s.mesh.geometry.dispose();
    this.mat.dispose();
    this.tex.dispose();
    this.ropes.geometry.dispose();
    this.pole.geometry.dispose();
  }
}

// ------------------------------------------------------------ окошко заказа

export interface BannerPanelDeps {
  root: HTMLElement;
  /** Отправить заказ (текст уже обрезан до 40 знаков) */
  send(text: string): void;
  /** Окошко открылось (отпустить мышь) и закрылось (захватить снова) */
  onOpen(): void;
  onClose(): void;
}

const SAMPLES = ['С днём рождения, Миша!', 'Кто со мной на рыбалку?', 'Всем привет с набережной!', 'Аня, ты лучшая ❤', 'Собираемся у колеса!'];

export class BannerPanel {
  private readonly el: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private readonly sub: HTMLDivElement;
  private readonly input: HTMLInputElement;
  private readonly count: HTMLSpanElement;
  private readonly note: HTMLSpanElement;
  private readonly go: HTMLButtonElement;
  private readonly d: BannerPanelDeps;
  private open_ = false;

  constructor(d: BannerPanelDeps) {
    this.d = d;
    const el = (tag: string, cls: string, parent: HTMLElement, text = ''): HTMLElement => {
      const e = document.createElement(tag);
      e.className = cls;
      if (text) e.textContent = text;
      parent.appendChild(e);
      return e;
    };
    this.el = el('div', 'pb-back', d.root) as HTMLDivElement;
    this.el.hidden = true;
    const card = el('div', 'pb-card', this.el);
    this.title = el('div', 'pb-title', card) as HTMLDivElement;
    this.sub = el('div', 'pb-sub', card) as HTMLDivElement;
    this.input = el('input', 'pb-input', card) as HTMLInputElement;
    this.input.type = 'text';
    this.input.maxLength = BANNER_MAX;
    this.input.autocomplete = 'off';
    this.input.spellcheck = false;
    const row = el('div', 'pb-row', card);
    this.count = el('span', 'pb-count', row) as HTMLSpanElement;
    this.note = el('span', 'pb-note', row) as HTMLSpanElement;
    const btns = el('div', 'pb-btns', card);
    this.go = el('button', 'pb-go', btns) as HTMLButtonElement;
    this.go.type = 'button';
    const cancel = el('button', 'pb-cancel', btns, 'Отмена') as HTMLButtonElement;
    cancel.type = 'button';
    this.go.addEventListener('click', () => this.submit());
    cancel.addEventListener('click', () => this.close());
    this.input.addEventListener('input', () => this.recount());
    // клавиши в окошке — только ему: ни ходьбы, ни эмоций, ни чата
    for (const type of ['keydown', 'keyup', 'keypress'] as const) {
      this.el.addEventListener(type, (e) => {
        e.stopPropagation();
        if (type !== 'keydown') return;
        const k = (e as KeyboardEvent).key;
        if (k === 'Enter') this.submit();
        else if (k === 'Escape') this.close();
      });
    }
    this.el.addEventListener('pointerdown', (e) => {
      if (e.target === this.el) this.close();
    });
  }

  get isOpen(): boolean {
    return this.open_;
  }

  /** own — баннер за своим самолётом (в полёте), иначе — заказ пролёта; note — когда взлетит */
  open(own: boolean, note: string): void {
    this.title.textContent = own ? '✈ Баннер за твоим самолётом' : '✈ Баннер над набережной';
    this.sub.textContent = own
      ? 'Полотнище с надписью полетит за хвостом до конца полёта — его увидит вся набережная'
      : 'Самолёт пролетит над площадью, мостками к маяку и вдоль берега с твоей надписью — её увидят все';
    this.go.textContent = own ? `Прицепить — ${BANNER_PRICE} 🪙` : `Запустить — ${BANNER_PRICE} 🪙`;
    this.note.textContent = note;
    if (!this.input.value) this.input.placeholder = SAMPLES[Math.floor(Math.random() * SAMPLES.length)];
    this.recount();
    this.el.hidden = false;
    this.open_ = true;
    this.d.onOpen();
    setTimeout(() => this.input.focus(), 0);
  }

  /** Обновить строку «когда взлетит», пока окошко открыто */
  setNote(note: string): void {
    if (this.open_ && this.note.textContent !== note) this.note.textContent = note;
  }

  close(): void {
    if (!this.open_) return;
    this.open_ = false;
    this.el.hidden = true;
    this.input.blur();
    this.d.onClose();
  }

  private text(): string {
    return [...this.input.value.replace(/\s+/g, ' ').trim()].slice(0, BANNER_MAX).join('');
  }

  private recount(): void {
    const n = [...this.text()].length;
    this.count.textContent = `${n} / ${BANNER_MAX}`;
    this.go.disabled = n === 0;
  }

  private submit(): void {
    const t = this.text();
    if (!t) return;
    this.d.send(t);
    this.input.value = '';
    this.close();
  }
}

// Кадр игры: картинка нашей 3D-сцены с игровой камеры (Blender, 1440×900 логических px) + живые холсты в мире
// (табло, таблички, мольберт — в перспективу по 4 углам из JSON) + облачки и ники над головами + HUD поверх.
// Только для страницы-обзора: в игре всё это делают three.js (CanvasTexture и спрайты).
import { BOARD_H, BOARD_W } from './world/board.js';
import { BUBBLE_H, BUBBLE_W, TAG_H, TAG_W, drawBubble, drawTag } from './world/bubble.js';

export const SW = 1440;
export const SH = 900;

// ---------------------------------------------------------------- гомография: прямоугольник w×h → четырёхугольник
function solve(A, b) {
  const n = b.length;
  for (let i = 0; i < n; i++) {
    let m = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[m][i])) m = r;
    [A[i], A[m]] = [A[m], A[i]]; [b[i], b[m]] = [b[m], b[i]];
    for (let r = i + 1; r < n; r++) {
      const f = A[r][i] / A[i][i];
      for (let c = i; c < n; c++) A[r][c] -= f * A[i][c];
      b[r] -= f * b[i];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c];
    x[i] = s / A[i][i];
  }
  return x;
}
/** Матрица 3×3 (h0…h7, 1): (u,v) из w×h → точки quad [TL, TR, BR, BL] */
export function homography(w, h, quad) {
  const src = [[0, 0], [w, 0], [w, h], [0, h]];
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [u, v] = src[i], [x, y] = quad[i];
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); b.push(x);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]); b.push(y);
  }
  return solve(A, b);
}
export function project(H, u, v) {
  const d = H[6] * u + H[7] * v + 1;
  return [(H[0] * u + H[1] * v + H[2]) / d, (H[3] * u + H[4] * v + H[5]) / d];
}
function matrix3d(H) {
  const m = [H[0], H[3], 0, H[6], H[1], H[4], 0, H[7], 0, 0, 1, 0, H[2], H[5], 0, 1];
  return `matrix3d(${m.map((v) => +v.toFixed(10)).join(',')})`;
}

/** Холст, положенный в перспективу. Рисуем в полном размере (2048×1024), показываем уменьшенную копию
 *  (ступенчато, чтобы мелкий текст не «рябил» — в игре это делают мипмапы). */
export class QuadCanvas {
  constructor(parent, w, h, quad, cls = '') {
    this.w = w; this.h = h; this.quad = quad;
    this.src = document.createElement('canvas');
    this.src.width = w; this.src.height = h;
    const edge = Math.max(Math.hypot(quad[1][0] - quad[0][0], quad[1][1] - quad[0][1]), Math.hypot(quad[2][0] - quad[3][0], quad[2][1] - quad[3][1]));
    // показываем в 2,5× экранного размера (чёткость при масштабе страницы до 1,6)
    const k = Math.min(1, (edge * 2.5) / w);
    this.view = document.createElement('canvas');
    this.view.width = Math.round(w * k); this.view.height = Math.round(h * k);
    this.view.className = `st-quad ${cls}`;
    this.k = k;
    this.H = homography(this.view.width, this.view.height, quad);
    this.Hsrc = homography(w, h, quad);
    this.view.style.transform = matrix3d(this.H);
    parent.appendChild(this.view); // свой слой: позже созданный экран (мольберт) — поверх табло
    this.tmp = document.createElement('canvas');
  }
  get ctx() { return this.src.getContext('2d'); }
  /** Перенести нарисованное на показ */
  flush() {
    let cur = this.src, cw = this.src.width, ch = this.src.height;
    const tw = this.view.width, th = this.view.height;
    while (cw / 2 > tw) {
      const nw = Math.max(tw, Math.round(cw / 2)), nh = Math.max(th, Math.round(ch / 2));
      const t = document.createElement('canvas');
      t.width = nw; t.height = nh;
      const tc = t.getContext('2d');
      tc.imageSmoothingQuality = 'high';
      tc.drawImage(cur, 0, 0, nw, nh);
      cur = t; cw = nw; ch = nh;
    }
    const v = this.view.getContext('2d');
    v.clearRect(0, 0, tw, th);
    v.imageSmoothingQuality = 'high';
    v.drawImage(cur, 0, 0, tw, th);
  }
  /** Точка холста (в px исходника) → точка кадра */
  toStage(u, v) { return project(this.Hsrc, u, v); }
  remove() { this.view.remove(); }
}

// ---------------------------------------------------------------- кадр
export class Stage {
  constructor(root) {
    this.root = root;
    this.bg = root.querySelector('.st-bg');
    this.world = root.querySelector('.st-world');
    this.fx = root.querySelector('.st-fx');
    // экраны в мире (табло, таблички, мольберт) — отдельным слоем под облачками, с маской перекрытий кадра
    this.boards = document.createElement('div');
    this.boards.className = 'st-boards';
    this.world.before(this.boards);
    this.frame = null;
    this.heads = new Map();
    this.quads = [];
    this.icons = {};
  }

  /** Загрузить кадр: frames/<name>.json + картинка (список — frames/index.json, его пишет frames/sync.mjs) */
  async load(name) {
    this.list ??= await fetch('frames/index.json', { cache: 'no-store' }).then((r) => r.json()).catch(() => []);
    if (!this.list.includes(name)) throw new Error(`нет кадра ${name}`);
    const f = await fetch(`frames/${name}.json`, { cache: 'no-store' }).then((r) => r.json());
    const dir = 'frames/';
    f.dir = dir;
    const img = new Image();
    img.src = `${dir}${f.image ?? `${name}.jpg`}`;
    await img.decode();
    this.clear();
    this.frame = f;
    const cv = document.createElement('canvas');
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const c = cv.getContext('2d');
    c.drawImage(img, 0, 0);
    // черновые кадры: закрасить служебные подписи прошлого просмотрщика
    for (const p of f.patches ?? []) {
      const k = img.naturalWidth / SW;
      const [x, y, w, h, sx, sy] = p.map((v) => v * k);
      const px = c.getImageData(sx, sy, 1, 1).data;
      c.fillStyle = `rgb(${px[0]},${px[1]},${px[2]})`;
      c.fillRect(x, y, w, h);
    }
    this.bg.replaceChildren(cv);
    cv.className = 'st-bg-img';
    await this.useMask(f.mask ? `${dir}${f.mask}` : null);
    // закрытые головы (vis < 0,5) — без облачков
    for (const hd of f.heads ?? []) if ((hd.vis ?? 1) >= 0.5) this.heads.set(hd.id, { ...hd, bubble: null, tag: null });
    return f;
  }

  /** Маска кадра: где экран виден (красное, зелёное, синее) — непрозрачно, где закрыт головой или вещью — прозрачно */
  async useMask(src) {
    const st = this.boards.style;
    if (!src) { st.maskImage = st.webkitMaskImage = 'none'; return; }
    try {
      const img = new Image();
      img.src = src;
      await img.decode();
      const cv = document.createElement('canvas');
      cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      const c = cv.getContext('2d', { willReadFrequently: true });
      c.drawImage(img, 0, 0);
      const d = c.getImageData(0, 0, cv.width, cv.height), p = d.data;
      for (let i = 0; i < p.length; i += 4) { const on = p[i] > 128 || p[i + 1] > 128 || p[i + 2] > 128; p[i] = p[i + 1] = p[i + 2] = 0; p[i + 3] = on ? 255 : 0; }
      c.putImageData(d, 0, 0);
      const url = `url(${cv.toDataURL('image/png')})`;
      st.maskImage = st.webkitMaskImage = url;
    } catch { st.maskImage = st.webkitMaskImage = 'none'; }
  }

  clear() {
    for (const q of this.quads) q.remove();
    this.quads = [];
    this.world.replaceChildren();
    this.fx.replaceChildren();
    this.heads.clear();
  }

  /** Холст в перспективу по углам кадра */
  quad(quad, w = BOARD_W, h = BOARD_H, cls = '') {
    const q = new QuadCanvas(this.boards, w, h, quad, cls);
    this.quads.push(q);
    return q;
  }

  /** Плашки ников над головами: who — { id: { nick, level, own } } */
  tags(who) {
    for (const [id, p] of Object.entries(who)) {
      const hd = this.heads.get(id);
      if (!hd) continue;
      const k = this.sizeK(hd);
      const cv = document.createElement('canvas');
      cv.width = TAG_W; cv.height = TAG_H;
      drawTag(cv, p.nick, p.level ?? 1, p.own);
      cv.className = 'st-tag';
      const w = TAG_W * 0.45 * k, h = TAG_H * 0.45 * k;
      // ник центрирован по (W+44)/2 холста — сдвигаем, чтобы ник был над серединой головы
      const off = (22 / TAG_W) * w;
      Object.assign(cv.style, { width: `${w}px`, height: `${h}px`, left: `${hd.x - w / 2 - off}px`, top: `${hd.y - h - 4 * k}px` });
      this.world.appendChild(cv);
      hd.tag = { el: cv, h };
      hd.nick = p.nick;
    }
  }

  /** Масштаб облачка и ника по дальности: дальние меньше (по радиусу головы в кадре) */
  sizeK(hd) {
    const ref = this.frame?.refR ?? 50;
    return Math.max(0.85, Math.min(1.12, Math.sqrt((hd.r ?? ref) / ref)));
  }

  /** Облачко над головой: одно на голову, новое заменяет старое */
  say(id, text, tone = 'new', life = 7000, nick = '') {
    const hd = this.heads.get(id);
    if (!hd) return null;
    if (hd.bubble) this.dropBubble(hd, true);
    const cv = document.createElement('canvas');
    cv.width = BUBBLE_W; cv.height = BUBBLE_H;
    const box = drawBubble(cv, text, tone, this.icons, nick);
    const k = this.sizeK(hd) * 0.5;
    const w = BUBBLE_W * k, h = BUBBLE_H * k;
    const el = document.createElement('div');
    el.className = 'st-bubble is-in';
    el.appendChild(cv);
    Object.assign(el.style, { width: `${w}px`, height: `${h}px` });
    const b = { el, cv, text, nick, tone, k, w, h, box: { x: box.x * k, y: box.y * k, w: box.w * k, h: box.h * k }, until: life ? performance.now() + life : 0, lift: 0 };
    hd.bubble = b;
    this.world.appendChild(el);
    this.layout();
    if (life) b.timer = setTimeout(() => { if (hd.bubble === b) this.dropBubble(hd); }, life);
    return b;
  }

  /** Перерисовать облачко в другой тон (отметка загадывающего) */
  mark(id, tone, life = 0) {
    const hd = this.heads.get(id);
    const b = hd?.bubble;
    if (!b) return null;
    clearTimeout(b.timer);
    b.tone = tone;
    const box = drawBubble(b.cv, b.text, tone, this.icons, b.nick);
    b.box = { x: box.x * b.k, y: box.y * b.k, w: box.w * b.k, h: box.h * b.k };
    b.el.classList.remove('is-in');
    void b.el.offsetWidth;
    b.el.classList.add(tone === 'miss' ? 'is-miss' : 'is-marked');
    this.layout();
    if (life) b.timer = setTimeout(() => { if (hd.bubble === b) this.dropBubble(hd); }, life);
    return b;
  }

  dropBubble(hd, now = false) {
    const b = hd.bubble;
    if (!b) return;
    hd.bubble = null;
    clearTimeout(b.timer);
    if (now) { b.el.remove(); return; }
    b.el.classList.add('is-out');
    setTimeout(() => b.el.remove(), 600);
    this.layout();
  }

  /** Расставить облачка: над ником, без наложений (ближние на месте, дальние поднимаются) */
  layout() {
    const list = [...this.heads.values()].filter((hd) => hd.bubble).sort((a, b) => (b.r ?? 0) - (a.r ?? 0));
    const placed = [];
    for (const hd of list) {
      const b = hd.bubble;
      const tagH = hd.tag?.h ?? 0;
      let left = hd.x - b.w / 2;
      let top = hd.y - tagH - 2 - b.h;
      left = Math.max(4, Math.min(SW - b.w - 4, left));
      // рамка пузыря (без пустых полей холста)
      const rect = () => ({ x0: left + b.box.x - 4, x1: left + b.box.x + b.box.w + 4, y0: top + b.box.y - 4, y1: top + b.box.y + b.box.h + 4 });
      for (let n = 0; n < 12; n++) {
        const r = rect();
        const hit = placed.find((p) => r.x0 < p.x1 && r.x1 > p.x0 && r.y0 < p.y1 && r.y1 > p.y0);
        if (!hit) break;
        top -= r.y1 - hit.y0 + 2;
      }
      placed.push(rect());
      b.left = left; b.top = top;
      Object.assign(b.el.style, { left: `${left}px`, top: `${top}px` });
    }
  }

  /** Центр пузыря облачка на кадре */
  bubbleCenter(id) {
    const b = this.heads.get(id)?.bubble;
    if (!b) return null;
    return [b.left + b.box.x + b.box.w / 2, b.top + b.box.y + b.box.h / 2];
  }

  /** 👍: облачко взлетает и улетает на табло в рамку rect (точки кадра), потом исчезает */
  fly(id, quadRect, ms = 950) {
    const hd = this.heads.get(id);
    const b = hd?.bubble;
    if (!b) return Promise.resolve();
    clearTimeout(b.timer);
    hd.bubble = null;
    const [cx, cy] = [b.left + b.box.x + b.box.w / 2, b.top + b.box.y + b.box.h / 2];
    const tx = (quadRect[0][0] + quadRect[1][0] + quadRect[2][0] + quadRect[3][0]) / 4;
    const ty = (quadRect[0][1] + quadRect[1][1] + quadRect[2][1] + quadRect[3][1]) / 4;
    const tw = Math.hypot(quadRect[1][0] - quadRect[0][0], quadRect[1][1] - quadRect[0][1]);
    const s = Math.max(0.25, Math.min(1, tw / b.box.w));
    const dx = tx - cx, dy = ty - cy;
    const peak = Math.min(cy, ty) - 70 - cy;
    const a = b.el.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${dx * 0.18}px, -26px) scale(1.12)`, opacity: 1, offset: 0.18 },
      { transform: `translate(${dx * 0.55}px, ${peak}px) scale(${(1 + s) / 2})`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: 0.85, offset: 0.92 },
      { transform: `translate(${dx}px, ${dy}px) scale(${s * 0.9})`, opacity: 0 },
    ], { duration: ms, easing: 'cubic-bezier(.45,.05,.35,1)', fill: 'forwards' });
    b.el.style.transformOrigin = `${b.box.x + b.box.w / 2}px ${b.box.y + b.box.h / 2}px`;
    b.el.classList.add('is-flying');
    this.layout();
    return a.finished.then(() => b.el.remove());
  }

  /** Рамка элемента страницы в координатах кадра 1440×900 (кадр масштабирован целиком) */
  rectOf(el) {
    const r = el.getBoundingClientRect(), b = this.root.getBoundingClientRect(), k = b.width / SW;
    return { x: (r.left - b.left) / k, y: (r.top - b.top) / k, w: r.width / k, h: r.height / k };
  }

  /** Копия элемента HUD (строка дока) летит в рамку to (координаты кадра) */
  flyEl(el, to, ms = 800) {
    const from = this.rectOf(el);
    const c = el.cloneNode(true);
    c.classList.add('st-flyer');
    Object.assign(c.style, { position: 'absolute', left: `${from.x}px`, top: `${from.y}px`, width: `${from.w}px`, margin: 0, transformOrigin: '0 0' });
    for (const b of c.querySelectorAll('.qz-markbtns, .qz-near')) b.remove();
    this.fx.appendChild(c);
    const dx = to.x - from.x, dy = to.y - from.y, sc = Math.max(0.6, Math.min(1.3, to.w / from.w));
    return c.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${dx * 0.35}px, ${dy * 0.35 - 40}px) scale(1.08)`, opacity: 1, offset: 0.4 },
      { transform: `translate(${dx}px, ${dy}px) scale(${sc})`, opacity: 0.9 },
    ], { duration: ms, easing: 'cubic-bezier(.45,.05,.35,1)', fill: 'forwards' }).finished.then(() => c.remove());
  }

  /** Конфетти над точкой (CSS-частицы) */
  confetti(x, y, n = 60, spread = 520) {
    const cols = ['var(--gold)', 'var(--good)', '#ff7a5c', '#fff4dc', 'var(--special)', '#8fd9cf'];
    for (let i = 0; i < n; i++) {
      const p = document.createElement('i');
      p.className = 'st-confetti';
      p.style.left = `${x}px`; p.style.top = `${y}px`;
      p.style.background = cols[i % cols.length];
      this.fx.appendChild(p);
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const v = 0.5 + Math.random() * 0.6;
      const tx = Math.cos(ang) * spread * v, ty = Math.sin(ang) * spread * 0.7 * v;
      p.animate([
        { transform: 'translate(0,0) rotate(0)', opacity: 1 },
        { transform: `translate(${tx * 0.8}px, ${ty}px) rotate(${360 * Math.random()}deg)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${tx}px, ${ty + 420}px) rotate(${720 * Math.random()}deg)`, opacity: 0 },
      ], { duration: 1800 + Math.random() * 900, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' }).finished.then(() => p.remove());
    }
  }

  /** Хлопок-облачко на месте появления загадывающего */
  puff(x, y, r = 60) {
    for (let i = 0; i < 9; i++) {
      const p = document.createElement('i');
      p.className = 'st-puff';
      const a = (i / 9) * Math.PI * 2;
      p.style.left = `${x}px`; p.style.top = `${y}px`;
      p.style.width = p.style.height = `${r * (0.6 + Math.random() * 0.5)}px`;
      this.fx.appendChild(p);
      p.animate([
        { transform: 'translate(-50%,-50%) scale(.2)', opacity: 0.95 },
        { transform: `translate(calc(-50% + ${Math.cos(a) * r}px), calc(-50% + ${Math.sin(a) * r * 0.6}px)) scale(1)`, opacity: 0 },
      ], { duration: 700, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' }).finished.then(() => p.remove());
    }
  }

  /** Значок над головой на ms (выбор в голосовании «Во что играем?»): всплывает и тает */
  pin(id, src, ms = 2000) {
    const hd = this.heads.get(id);
    if (!hd) return null;
    hd.pin?.remove();
    const k = this.sizeK(hd), s = 48 * k;
    const p = document.createElement('div');
    p.className = 'st-pin';
    p.innerHTML = `<img src="${src}" alt="" draggable="false">`;
    Object.assign(p.style, { left: `${hd.x - s / 2}px`, top: `${hd.y - s - 12 * k}px`, width: `${s}px`, height: `${s}px` });
    this.world.appendChild(p);
    hd.pin = p;
    p.animate([{ transform: 'translateY(12px) scale(.4)', opacity: 0 }, { transform: 'translateY(0) scale(1.15)', opacity: 1, offset: 0.6 }, { transform: 'none', opacity: 1 }], { duration: 340, easing: 'cubic-bezier(.2,.8,.2,1)' });
    setTimeout(() => p.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-16px)' }], { duration: 380, fill: 'forwards' }).finished.then(() => { p.remove(); if (hd.pin === p) hd.pin = null; }), ms);
    return p;
  }

  /** Подсветка желейки (голос «Кто из нас?», «угадал») */
  ring(id, cls = 'is-gold') {
    const hd = this.heads.get(id);
    if (!hd) return null;
    const el = document.createElement('i');
    el.className = `st-ring ${cls}`;
    const r = hd.r ?? 30;
    Object.assign(el.style, { left: `${hd.x - r * 1.25}px`, top: `${hd.y - r * 0.15}px`, width: `${r * 2.5}px`, height: `${r * 3.1}px` });
    this.world.prepend(el);
    return el;
  }
}

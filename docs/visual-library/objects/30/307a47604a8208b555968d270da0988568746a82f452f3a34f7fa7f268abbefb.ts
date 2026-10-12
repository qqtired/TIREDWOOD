// Рисунки «Fight Club» на канвасе — всё своё, без чужих логотипов и кадров: надпись краской по трафарету с подтёками,
// картон с надписью маркером, круг мелом, бетон с пятнами, доска «Правила клуба» мелом, этикетка розового мыла
// и кадр-вспышка (мыло с ухмылкой). Картинки — только канвас: под CSP сайта blob: нельзя.
import * as THREE from 'three';

/** Узкий жирный шрифт «как трафарет»: где есть Impact — он, иначе Rubik 900 */
export const STENCIL = 'Impact, "Haettenschweiler", "Arial Narrow", Rubik, sans-serif';
const MARKER = 'Rubik, system-ui, sans-serif';

/** Детерминированный шум, чтобы картинки не менялись от запуска к запуску */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

export function texture(c: HTMLCanvasElement, repeat = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/**
 * Надпись краской по трафарету: перемычки трафарета (разрывы в буквах), напыление вокруг, подтёки вниз, потёртости.
 * color — краска; tilt — наклон строки (криво набита).
 */
export function stencilTexture(text: string, w: number, h: number, color: string, seed = 7, tilt = -0.03): THREE.CanvasTexture {
  const [c, ctx] = canvas(w, h);
  const r = seeded(seed);
  ctx.translate(w / 2, h / 2);
  ctx.rotate(tilt);
  let px = Math.round(h * 0.62);
  ctx.font = `900 ${px}px ${STENCIL}`;
  while (ctx.measureText(text).width > w * 0.9 && px > 10) {
    px -= 4;
    ctx.font = `900 ${px}px ${STENCIL}`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tw = ctx.measureText(text).width;
  // напыление: мягкий ореол краски
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = px * 0.18;
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = color;
  ctx.fillText(text, 0, 0);
  ctx.restore();
  ctx.fillStyle = color;
  ctx.fillText(text, 0, 0);
  // перемычки трафарета: горизонтальный разрыв посередине и короткие вертикальные — по буквам
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillRect(-tw / 2 - 4, -px * 0.035, tw + 8, px * 0.06);
  let x = -tw / 2;
  for (const ch of text) {
    const cw = ctx.measureText(ch).width;
    if (/[OОDДBВPРRQAАМ0-9Б]/.test(ch)) ctx.fillRect(x + cw * 0.46, -px * 0.4, cw * 0.08, px * 0.22);
    x += cw;
  }
  // потёртости: краска осыпалась пятнышками
  for (let i = 0; i < 260; i++) {
    ctx.globalAlpha = 0.25 + r() * 0.6;
    const s = 1 + r() * px * 0.05;
    ctx.fillRect(-tw / 2 + r() * tw, -px * 0.45 + r() * px * 0.9, s, s);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  // подтёки: тонкие струйки вниз от букв
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const dx = -tw / 2 + tw * (0.04 + r() * 0.92);
    const len = px * (0.12 + r() * 0.5);
    ctx.lineWidth = 2 + r() * px * 0.035;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.moveTo(dx, px * 0.28);
    ctx.lineTo(dx + (r() - 0.5) * 3, px * 0.28 + len);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(dx, px * 0.28 + len, ctx.lineWidth * 0.9, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return texture(c);
}

/** Картон: неровные края, гофра просвечивает, сгиб; рисовать надпись — writeMarker. */
export function cardboard(ctx: CanvasRenderingContext2D, w: number, h: number, seed = 3): void {
  const r = seeded(seed);
  ctx.clearRect(0, 0, w, h);
  ctx.beginPath();
  const pts = 18;
  for (let i = 0; i <= pts; i++) {
    const t = i / pts;
    const x = 6 + t * (w - 12) + (r() - 0.5) * 6;
    ctx.lineTo(x, 5 + r() * 7);
  }
  for (let i = 0; i <= pts; i++) {
    const t = i / pts;
    ctx.lineTo(w - 4 - r() * 8, 6 + t * (h - 12));
  }
  for (let i = pts; i >= 0; i--) {
    const t = i / pts;
    ctx.lineTo(6 + t * (w - 12) + (r() - 0.5) * 6, h - 5 - r() * 7);
  }
  for (let i = pts; i >= 0; i--) {
    const t = i / pts;
    ctx.lineTo(4 + r() * 8, 6 + t * (h - 12));
  }
  ctx.closePath();
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#b98d5a');
  g.addColorStop(1, '#a37848');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  // гофра
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = '#4a3218';
  for (let x = 0; x < w; x += 9) ctx.fillRect(x, 0, 3, h);
  // пятна и сгиб
  ctx.globalAlpha = 0.12;
  for (let i = 0; i < 14; i++) {
    ctx.beginPath();
    ctx.arc(r() * w, r() * h, 6 + r() * 30, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 0.18;
  ctx.fillRect(0, h * 0.52, w, 2);
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** Строка маркером: чуть наискосок, буквы разного наклона. */
export function writeMarker(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, color: string, maxW: number, seed = 1): void {
  const r = seeded(seed);
  let size = px;
  ctx.font = `700 ${size}px ${MARKER}`;
  while (ctx.measureText(text).width > maxW && size > 10) {
    size -= 2;
    ctx.font = `700 ${size}px ${MARKER}`;
  }
  const w = ctx.measureText(text).width;
  ctx.save();
  ctx.translate(x - w / 2, y);
  ctx.rotate((r() - 0.5) * 0.06);
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  let cx = 0;
  for (const ch of text) {
    ctx.save();
    ctx.translate(cx, (r() - 0.5) * size * 0.08);
    ctx.rotate((r() - 0.5) * 0.12);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    cx += ctx.measureText(ch).width;
  }
  ctx.restore();
}

/** Круг мелом: неровная толстая линия из коротких штрихов, внутри — надпись мелом. */
export function chalkCircle(ctx: CanvasRenderingContext2D, size: number, label: string, seed = 11): void {
  const r = seeded(seed);
  ctx.clearRect(0, 0, size, size);
  const c = size / 2;
  const R = size * 0.46;
  ctx.lineCap = 'round';
  for (let pass = 0; pass < 3; pass++) {
    const n = 90;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2 + r() * 0.02;
      const a1 = a0 + (Math.PI * 2) / n + r() * 0.03;
      const rr = R + (r() - 0.5) * size * 0.012 + pass * size * 0.004;
      ctx.strokeStyle = `rgba(240,236,224,${0.35 + r() * 0.45})`;
      ctx.lineWidth = size * (0.012 + r() * 0.01);
      ctx.beginPath();
      ctx.arc(c, c, rr, a0, a1);
      ctx.stroke();
    }
  }
  // крошки мела
  ctx.fillStyle = 'rgba(240,236,224,0.35)';
  for (let i = 0; i < 160; i++) {
    const a = r() * Math.PI * 2;
    const d = R + (r() - 0.5) * size * 0.05;
    ctx.fillRect(c + Math.cos(a) * d, c + Math.sin(a) * d, 2, 2);
  }
  if (label) {
    ctx.save();
    ctx.translate(c, c + R * 0.62);
    ctx.font = `900 ${Math.round(size * 0.075)}px ${STENCIL}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(240,236,224,0.78)';
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }
}

/** Бетон: пятна, сырость снизу, мелкие трещины (повторяется). */
export function concreteTexture(size: number, base: string, seed: number, damp = 0.4): THREE.CanvasTexture {
  const [c, ctx] = canvas(size, size);
  const r = seeded(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 70; i++) {
    const x = r() * size;
    const y = r() * size;
    const rad = 10 + r() * size * 0.18;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const dark = r() < 0.6;
    g.addColorStop(0, dark ? `rgba(0,0,0,${0.05 + r() * 0.1})` : `rgba(255,255,240,${0.03 + r() * 0.05})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
      ctx.save();
      ctx.translate(ox, oy);
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      ctx.restore();
    }
  }
  // зерно
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * 22;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  // трещины
  ctx.strokeStyle = 'rgba(20,18,14,0.35)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    let x = r() * size;
    let y = r() * size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 8; k++) {
      x += (r() - 0.5) * 30;
      y += (r() - 0.5) * 30;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  if (damp > 0) {
    const g = ctx.createLinearGradient(0, size * 0.6, 0, size);
    g.addColorStop(0, 'rgba(10,20,10,0)');
    g.addColorStop(1, `rgba(10,22,12,${damp * 0.35})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  return texture(c, true);
}

/** Правила клуба — свои, с юмором */
export const RULES = [
  'О клубе — никому.',
  'См. правило первое.',
  'Растёкся лужей — бой окончен.',
  'Дерутся только желейки.',
  'Мыло не есть.',
  'Погасил лампу — сам и меняй.',
  'Бой идёт столько, сколько нужно.',
  'Новенький — сразу в круг.',
];

/** Школьная доска с правилами мелом (стёртые места, рамка). */
export function rulesTexture(): THREE.CanvasTexture {
  const W = 768;
  const H = 1024;
  const [c, ctx] = canvas(W, H);
  const r = seeded(5);
  ctx.fillStyle = '#5a3b22';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#26332b';
  ctx.fillRect(26, 26, W - 52, H - 52);
  // разводы стёртого мела
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = `rgba(220,225,215,${0.02 + r() * 0.04})`;
    ctx.beginPath();
    ctx.ellipse(40 + r() * (W - 80), 40 + r() * (H - 80), 40 + r() * 140, 12 + r() * 40, r() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  const chalk = 'rgba(236,236,226,0.92)';
  ctx.textAlign = 'center';
  ctx.fillStyle = chalk;
  ctx.font = `900 74px ${STENCIL}`;
  ctx.fillText('ПРАВИЛА КЛУБА', W / 2, 120);
  ctx.fillRect(120, 146, W - 240, 4);
  ctx.textAlign = 'left';
  RULES.forEach((t, i) => {
    const y = 236 + i * 96;
    ctx.save();
    ctx.translate(70 + (r() - 0.5) * 6, y);
    ctx.rotate((r() - 0.5) * 0.03);
    ctx.font = `700 46px ${MARKER}`;
    ctx.fillStyle = chalk;
    ctx.fillText(`${i + 1}.`, 0, 0);
    ctx.font = `500 40px ${MARKER}`;
    let size = 40;
    while (ctx.measureText(t).width > W - 220 && size > 22) {
      size -= 2;
      ctx.font = `500 ${size}px ${MARKER}`;
    }
    ctx.fillText(t, 62, 0);
    ctx.restore();
  });
  // мел осыпается: стираем крошки
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 900; i++) {
    ctx.globalAlpha = r() * 0.5;
    ctx.fillRect(40 + r() * (W - 80), 60 + r() * (H - 120), 2, 2);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = '#26332b';
  ctx.fillRect(26, 26, W - 52, H - 52);
  ctx.globalCompositeOperation = 'source-over';
  return texture(c);
}

/** Этикетка розового мыла: своя — «ЖЕЛЕ-МЫЛО» и пузырь (выдавлено на бруске). */
export function soapTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 160);
  ctx.fillStyle = '#f2a6bf';
  ctx.fillRect(0, 0, 256, 160);
  const g = ctx.createLinearGradient(0, 0, 0, 160);
  g.addColorStop(0, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(120,30,60,0.18)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 160);
  // выдавленная надпись: светлая кромка снизу, тёмная — сверху
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 34px ${STENCIL}`;
  ctx.fillStyle = 'rgba(255,240,245,0.85)';
  ctx.fillText('ЖЕЛЕ-МЫЛО', 128, 98);
  ctx.fillStyle = 'rgba(150,50,85,0.6)';
  ctx.fillText('ЖЕЛЕ-МЫЛО', 128, 96);
  ctx.strokeStyle = 'rgba(150,50,85,0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(128, 50, 20, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(121, 43, 6, 0, Math.PI * 2);
  ctx.stroke();
  return texture(c);
}

/** Кадр-вспышка: на мгновение — розовое мыло с ухмылкой на тёмном. */
export function flashCanvas(): HTMLCanvasElement {
  const [c, ctx] = canvas(512, 288);
  ctx.fillStyle = '#16140f';
  ctx.fillRect(0, 0, 512, 288);
  const g = ctx.createRadialGradient(256, 150, 10, 256, 150, 260);
  g.addColorStop(0, 'rgba(255,230,170,0.25)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 288);
  ctx.save();
  ctx.translate(256, 150);
  ctx.rotate(-0.12);
  ctx.fillStyle = '#f09ab5';
  roundRect(ctx, -120, -62, 240, 124, 40);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  roundRect(ctx, -104, -52, 208, 30, 15);
  ctx.fill();
  // глаза и ухмылка
  ctx.fillStyle = '#2a1018';
  ctx.beginPath();
  ctx.arc(-40, -6, 9, 0, Math.PI * 2);
  ctx.arc(40, -10, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#2a1018';
  ctx.beginPath();
  ctx.moveTo(-48, 24);
  ctx.quadraticCurveTo(10, 50, 58, 14);
  ctx.stroke();
  ctx.restore();
  return c;
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Мягкое пятно (свет, тень, лужа): радиальный градиент от центра к краю. */
export function blobTexture(inner: string, outer: string, size = 128): THREE.CanvasTexture {
  const [c, ctx] = canvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return texture(c);
}

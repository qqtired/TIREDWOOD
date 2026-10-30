// «Ракушка»: общее для холстов в мире (табло, вывеска, таблички пультов): палитра «Ретро-парка 2.0» как в
// client/ui/kit/tokens.css, шрифты, скругления, перенос строк, подгонка размера, картинки. Перенос
// lab/quiz/v2/js/world/paint.js на TypeScript. Только CanvasRenderingContext2D, без DOM: картинки (значки режимов,
// «тепло / мимо / угадал», картинки вопросов) берутся лениво и только если есть Image (в Node-тестах их просто нет).

/** Цвета — из tokens.css (retro2 + HUD «Светлый»); своих не придумываем */
export const C = {
  enamel: '#13675f', enamelLo: '#0d524d', enamelSolid: '#0e5550', ink: '#0a3b37', deep: '#072b28',
  cream: '#fff4dc', cream2: '#f3e6c9', creamDim: 'rgba(255, 244, 220, .76)', creamFaint: 'rgba(255, 244, 220, .55)',
  coral: '#ff7a5c', gold: '#ffcd4a', goldHi: '#ffdd7a', goldLo: '#a8760a', goldInk: '#3a2603', goldText: '#ffd665',
  good: '#56c07d', goodHi: '#84dba0', goodLo: '#2a7a4a', goodText: '#9eecb6', goodTint: '#e6f6ec',
  bad: '#e5484d', badHi: '#f47a7e', badLo: '#8e1f27', badText: '#ffa0a3',
  info: '#8fd9cf', infoText: '#b4efe7', special: '#a9b4ff',
  plate: '#fffcf6', plateInk: '#16313a', plateDim: '#4b6670', plateFaint: '#66808a',
  track: 'rgba(3, 32, 30, .5)',
} as const;

/** Цвета ников — как --nick-1…6 HUD «Светлый» */
export const NICK = ['#d0562d', '#1b7a48', '#4b48c9', '#b8336a', '#0b7774', '#955a00'] as const;

/** Номер цвета ника 0…5 — тот же хеш, что у чата (client/chat.ts nickTone, там 1…6) */
export function nickTone(nick: string): number {
  let h = 0;
  for (const ch of nick) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return h % 6;
}

export const nickColor = (nick: string): string => NICK[nickTone(nick)];

export const TEXT = 'Rubik, system-ui, sans-serif';
export const DISPLAY = "'Rubik Mono One', Rubik, system-ui, sans-serif";
export const font = (w: number, px: number, fam: string = TEXT): string => `${w} ${px}px ${fam}`;

export function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

/** Подогнать кегль, чтобы текст влез в ширину; вернуть кегль (шрифт уже выставлен) */
export function fit(ctx: CanvasRenderingContext2D, text: string, weight: number, px: number, maxW: number, fam: string = TEXT, min = 18): number {
  let s = px;
  ctx.font = font(weight, s, fam);
  while (s > min && ctx.measureText(text).width > maxW) { s -= 2; ctx.font = font(weight, s, fam); }
  return s;
}

/** Обрезать многоточием по ширине (шрифт уже выставлен) */
export function clip(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/** Перенос по словам, не больше maxLines строк (последняя — с многоточием); шрифт уже выставлен */
export function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const word of text.split(/\s+/)) {
    const next = cur ? `${cur} ${word}` : word;
    if (ctx.measureText(next).width <= maxW || !cur) cur = next;
    else { lines.push(cur); cur = word; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = clip(ctx, `${lines[maxLines - 1]}…`, maxW); }
  return lines.map((l) => clip(ctx, l, maxW));
}

/** Эмаль табло: бирюзовый градиент окна «Ретро-парка» + мягкий блик сверху */
export function enamel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.save();
  rr(ctx, x, y, w, h, r);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, C.enamel);
  g.addColorStop(1, C.enamelLo);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.clip();
  const s = ctx.createLinearGradient(0, y, 0, y + h * 0.32);
  s.addColorStop(0, 'rgba(255,255,255,.06)');
  s.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = s;
  ctx.fillRect(x, y, w, h * 0.32);
  ctx.restore();
}

/** Узкая маркиза — как полоса в шапке окна (--awning-h/w, коралл/крем) */
export function awning(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, stripe: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  for (let i = 0, sx = x; sx < x + w; i++, sx += stripe) {
    ctx.fillStyle = i % 2 ? C.cream2 : C.coral;
    ctx.fillRect(sx, y, stripe, h);
  }
  ctx.fillStyle = 'rgba(0,0,0,.12)';
  ctx.fillRect(x, y + h - 2, w, 2);
  ctx.restore();
}

/** Заголовок «вывеской»: Rubik Mono One с тёмной ступенькой, как --title-shadow */
export function title(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, color: string = C.cream, align: CanvasTextAlign = 'left', step = 5): void {
  ctx.save();
  ctx.font = font(400, px, DISPLAY);
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = C.ink;
  ctx.fillText(text, x, y + step);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Картинка, которую умеет нарисовать холст (Image или готовый холст) и которая уже загружена */
export type Pic = CanvasImageSource | null | undefined;

function ready(img: Pic): img is CanvasImageSource {
  if (!img) return false;
  const i = img as { complete?: boolean; naturalWidth?: number };
  return i.complete === undefined ? true : !!i.complete && !!i.naturalWidth;
}

function sizeOf(img: CanvasImageSource): [number, number] {
  const i = img as { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number; videoWidth?: number };
  return [i.naturalWidth ?? i.width ?? 1, i.naturalHeight ?? i.height ?? 1];
}

/** Картинка, вписанная в квадрат size с центром (cx, cy); нет картинки — ничего */
export function icon(ctx: CanvasRenderingContext2D, img: Pic, cx: number, cy: number, size: number): void {
  if (!ready(img)) return;
  const [iw, ih] = sizeOf(img);
  const k = size / Math.max(iw, ih);
  const w = iw * k, h = ih * k;
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
}

/** Картинка, вписанная в прямоугольник (contain) с центром в его середине */
export function contain(ctx: CanvasRenderingContext2D, img: Pic, x: number, y: number, w: number, h: number): void {
  if (!ready(img)) return;
  const [iw, ih] = sizeOf(img);
  const k = Math.min(w / iw, h / ih);
  const dw = iw * k, dh = ih * k;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

/** Кружок-значок со значком внутри (как .k-event-ic / .k-toast-ic): подложка, кольцо, картинка */
export function badge(ctx: CanvasRenderingContext2D, img: Pic, cx: number, cy: number, r: number, fill: string, ring = '#ffffff'): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy + r * 0.08, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(10,40,56,.28)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = ring;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.84, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
  icon(ctx, img, cx, cy, r * 1.5);
}

/** Детерминированный «случай» для конфетти и т. п. */
export function rand(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** Конфетти на холсте: t — мс (любые часы, лишь бы шли вперёд), n — сколько; цвета кита */
export function confetti(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, n = 90, seed = 7): void {
  const r = rand(seed);
  const cols = [C.gold, C.coral, C.cream, C.good, C.special, C.info];
  ctx.save();
  for (let i = 0; i < n; i++) {
    const x0 = r() * W, sp = 0.18 + r() * 0.22, ph = r() * H, sw = 20 + r() * 40, rot = r() * 6;
    const y = ((ph + t * sp) % (H + 80)) - 40;
    const x = x0 + Math.sin(t / 600 + i) * sw;
    ctx.translate(x, y);
    ctx.rotate(rot + t / (400 + i * 7));
    ctx.fillStyle = cols[i % cols.length];
    ctx.fillRect(-9, -5, 18, 10);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  ctx.restore();
}

/** м:сс */
export const mmss = (sec: number): string => `${Math.floor(Math.max(0, sec) / 60)}:${String(Math.floor(Math.max(0, sec) % 60)).padStart(2, '0')}`;

/** Секунды до срока по часам сервера (целые, вверх; не меньше 0) */
export const leftSec = (endsAt: number, nowMs: number): number => Math.max(0, Math.ceil((endsAt - nowMs) / 1000));

// ------------------------------------------------------------------ картинки

/** Адреса значков по id: client/assets/ui/icons/<id>.webp и client/assets/quiz/ui/<id>.png. В сборке Vite глоб превращается
 *  в готовый словарь; в Node (тесты) import.meta.glob нет — словарь пустой, картинок нет, холст рисуется без них. */
function glob<T>(get: () => T, empty: T): T {
  try { return get(); } catch { return empty; }
}
const ICON_FILES = glob(() => import.meta.glob('../../../assets/ui/icons/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>, {});
const QUIZ_FILES = glob(() => import.meta.glob('../../../assets/quiz/ui/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>, {});

const URL_BY = new Map<string, string>();
for (const files of [ICON_FILES, QUIZ_FILES]) {
  for (const [p, url] of Object.entries(files)) URL_BY.set(p.slice(p.lastIndexOf('/') + 1).replace(/\.(webp|png)$/, ''), url);
}

/** Подменить адреса (стенд для снимков вне Vite): id → адрес */
export function setQuizImageUrls(map: Record<string, string>): void {
  for (const [id, url] of Object.entries(map)) URL_BY.set(id, url);
  cache.clear();
}

/** Адрес значка по id ('scroll', 'q-warm' …); нет — '' */
export function quizImgUrl(id: string): string {
  return URL_BY.get(id) ?? '';
}

const cache = new Map<string, HTMLImageElement | null>();
/** Сколько картинок ещё грузится и кто просил сообщить, когда одна догрузилась (табло перерисовывается только при смене снимка,
 *  поэтому без этого значок, догрузившийся после первого кадра, остался бы пустым кругом, пока снимок не изменится) */
let pending = 0;
const listeners = new Set<() => void>();

function load(key: string, url: string): HTMLImageElement | null {
  if (cache.has(key)) return cache.get(key) ?? null;
  if (!url || typeof Image !== 'function') { cache.set(key, null); return null; }
  const img = new Image();
  img.decoding = 'async';
  pending++;
  const settled = (): void => {
    pending = Math.max(0, pending - 1);
    for (const cb of [...listeners]) cb();
  };
  img.addEventListener('load', settled, { once: true });
  img.addEventListener('error', settled, { once: true });
  img.src = url;
  cache.set(key, img);
  return img;
}

/** Сколько картинок табло ещё грузится (0 — все на месте) */
export const quizImagesPending = (): number => pending;

/** Позвать, когда очередная картинка догрузилась (или не нашлась): интегратор по этому сигналу перерисовывает табло. Возвращает отписку */
export function onQuizImages(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** Заранее начать грузить значки: к первому кадру табло они уже готовы */
export function preloadQuizImages(ids: readonly string[]): void {
  for (const id of ids) quizImg(id);
}

/** Значок по id: ленивая загрузка, пока не загрузился — рисуется без него (табло перерисуется само ≤ 4 раз в секунду) */
export function quizImg(id: string): HTMLImageElement | null {
  return load(`i:${id}`, quizImgUrl(id));
}

/** Картинка вопроса «Своей игры» (адрес /quiz/m/<пак>/<файл> — тот же сайт, холст не «пачкается»); не больше 12 в памяти */
export function remoteImg(url: string): HTMLImageElement | null {
  const key = `u:${url}`;
  if (!cache.has(key)) {
    const remote = [...cache.keys()].filter((k) => k.startsWith('u:'));
    if (remote.length >= 12) cache.delete(remote[0]);
  }
  return load(key, url);
}

/** Значки режимов на табло «Во что играем?» и отметки «Загадки»: грузятся при старте игры, не при первом кадре табло */
preloadQuizImages(['scroll', 'bell', 'paint', 'online', 'q-warm', 'q-miss', 'q-win']);

// Иллюстрации карточек: SVG-строка 320 x 200 из небольших деталей (небо, море, желейка, реквизит).
// Только атрибуты оформления: ни style=, ни скриптов, ни ссылок наружу, ни градиентов с id — id общие на весь документ,
// а карточки прячутся и показываются. Поэтому страница работает и под строгим CSP сайта (style-src 'self').
// Координаты — в системе 320 x 200; у каждой детали x, y — точка опоры (низ посередине), s — масштаб.

export const COLOR = {
  skyTop: '#9fd8f6', sky: '#bfe7fb', skyLow: '#e0f5fd', sun: '#ffd24d', sunGlow: '#fff3b8',
  cloud: '#ffffff', cloudShade: '#d9eaf7',
  sea: '#3fbfca', seaDeep: '#2aa3bd', seaLight: '#9be6e0',
  sand: '#f7dfa4', sandDark: '#e6c47b',
  deck: '#e8b06b', deckDark: '#cf9255', deckSeam: '#b97a3d',
  grass: '#93d56e', grassDark: '#72b852',
  wood: '#b9792f', woodDark: '#8d5722',
  ink: '#3a2b31', white: '#ffffff', paper: '#fff7e4', red: '#ff5a5f', orange: '#ff8a1c', yellow: '#ffd23f',
  green: '#5ccf7a', blue: '#4a63ff', pink: '#ff9ec7', purple: '#9b6fd6', brown: '#8d5a34', gold: '#f5b82e', gray: '#aab4bd',
} as const;

const n = (v: number): string => String(Math.round(v * 10) / 10);

/** Повторяемые «случайные» числа: иллюстрация не меняется от показа к показу */
function rng(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Обёртка: label читает экранный диктор */
export function svg(inner: string, label: string): string {
  return `<svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(label)}">${inner}</svg>`;
}

// ------------------------------------------------------------ фон

export type Backdrop = 'day' | 'deck' | 'sea' | 'sand' | 'sky' | 'grass';

function cloud(x: number, y: number, s = 1): string {
  return (
    `<g transform="translate(${n(x)} ${n(y)}) scale(${n(s)})">` +
    `<ellipse cx="2" cy="9" rx="34" ry="8" fill="${COLOR.cloudShade}"/>` +
    `<circle cx="-18" cy="0" r="12" fill="${COLOR.cloud}"/><circle cx="-2" cy="-8" r="17" fill="${COLOR.cloud}"/>` +
    `<circle cx="17" cy="-2" r="13" fill="${COLOR.cloud}"/><circle cx="30" cy="3" r="8" fill="${COLOR.cloud}"/>` +
    `<rect x="-30" y="0" width="68" height="9" rx="4.5" fill="${COLOR.cloud}"/></g>`
  );
}

export function sun(x: number, y: number, s = 1): string {
  return (
    `<g transform="translate(${n(x)} ${n(y)}) scale(${n(s)})">` +
    `<circle r="34" fill="${COLOR.sunGlow}" opacity=".55"/><circle r="22" fill="${COLOR.sun}"/>` +
    `<circle cx="-7" cy="-7" r="7" fill="#fff" opacity=".35"/></g>`
  );
}

function waves(y0: number, y1: number, seed: number): string {
  const r = rng(seed);
  let out = '';
  for (let y = y0 + 7; y < y1; y += 11) {
    for (let k = 0; k < 4; k++) {
      const x = r() * 300 + 8;
      out += `<path d="M${n(x)} ${n(y)}q5-4 10 0t10 0" stroke="${COLOR.seaLight}" stroke-width="2" fill="none" stroke-linecap="round" opacity=".8"/>`;
    }
  }
  return out;
}

function planks(y0: number): string {
  let out = `<rect x="0" y="${y0}" width="320" height="${200 - y0}" fill="${COLOR.deck}"/>`;
  for (let y = y0 + 12, row = 0; y < 200; y += 14, row++) {
    out += `<path d="M0 ${y}H320" stroke="${COLOR.deckSeam}" stroke-width="1.6" opacity=".55"/>`;
    for (let x = (row % 2) * 30 + 14; x < 320; x += 62) out += `<path d="M${x} ${y - 14}V${y}" stroke="${COLOR.deckSeam}" stroke-width="1.4" opacity=".4"/>`;
  }
  return out + `<rect x="0" y="${y0}" width="320" height="5" fill="${COLOR.deckDark}"/>`;
}

/** Фон: небо, солнце, большие облака и то, на чём стоят (море, настил, остров, трава). */
export function backdrop(kind: Backdrop): string {
  const horizon = kind === 'sea' ? 96 : kind === 'sky' ? 176 : 118;
  let out = `<rect width="320" height="200" fill="${COLOR.sky}"/><rect y="${horizon - 40}" width="320" height="42" fill="${COLOR.skyLow}"/>`;
  out += sun(kind === 'sky' ? 266 : 254, kind === 'sky' ? 40 : 46, kind === 'sky' ? 0.9 : 1);
  out += cloud(58, kind === 'sky' ? 62 : 40, 1.25) + cloud(196, kind === 'sky' ? 34 : 70, 0.9);
  if (kind === 'sky') out += cloud(262, 110, 1.1) + cloud(30, 130, 0.8);
  out += `<rect y="${horizon}" width="320" height="${200 - horizon}" fill="${COLOR.sea}"/>`;
  out += `<rect y="${horizon}" width="320" height="6" fill="${COLOR.seaDeep}" opacity=".5"/>` + waves(horizon, 200, 7);
  if (kind === 'deck') out += planks(150);
  if (kind === 'sand') {
    out += `<ellipse cx="160" cy="214" rx="230" ry="58" fill="${COLOR.sand}"/><ellipse cx="160" cy="214" rx="230" ry="58" fill="none" stroke="${COLOR.sandDark}" stroke-width="3"/>`;
  }
  if (kind === 'grass') out += `<ellipse cx="160" cy="226" rx="250" ry="70" fill="${COLOR.grass}"/><path d="M0 170Q80 158 160 166T320 164V200H0Z" fill="${COLOR.grassDark}" opacity=".5"/>`;
  return out;
}

/** Готовая сцена: фон + детали по порядку (дальние первыми) */
export function scene(kind: Backdrop, label: string, parts: string[]): string {
  return svg(backdrop(kind) + parts.join(''), label);
}

// ------------------------------------------------------------ желейка

export const JELLY = {
  orange: ['#ff9a36', '#e87523', '#ffc27a'], blue: ['#5a78ff', '#3a4fd6', '#9db0ff'], pink: ['#ff9ec7', '#e46fa3', '#ffd0e4'],
  green: ['#9bd13b', '#74a824', '#c6ec7a'], mint: ['#5fd8a8', '#38b186', '#a2ecce'], purple: ['#b39ddb', '#8b72bd', '#d9cbf1'],
  yellow: ['#ffd23f', '#e0aa17', '#ffe68a'], red: ['#ff4d6d', '#d92f4f', '#ff95a8'], sky: ['#5ab8ff', '#3592d9', '#a3d8ff'],
  brown: ['#d9913c', '#b06f22', '#efbd7e'], teal: ['#1fb5b0', '#118e8a', '#7cdcd8'], ice: ['#bfe9ff', '#8fcdf0', '#eefaff'],
  white: ['#f2eadc', '#d6ccb8', '#ffffff'], melon: ['#58c05a', '#2f8f3f', '#9be08c'], donut: ['#f2c27b', '#d9a057', '#ffe0ae'],
} as const;
export type JellyColor = keyof typeof JELLY;
export type Hat = 'none' | 'cap' | 'party' | 'crown' | 'chef' | 'sailor' | 'melon' | 'tophat' | 'straw' | 'bandana' | 'helmet' | 'fool' | 'pirate';
export type Face = 'smile' | 'grin' | 'cheer' | 'oh' | 'smug' | 'dizzy' | 'sleepy' | 'angry' | 'laugh';
export type Arms = 'down' | 'up' | 'wave' | 'out' | 'hold' | 'none';

export interface JellyOpts {
  x: number;
  y: number;
  s?: number;
  c?: JellyColor;
  hat?: Hat;
  face?: Face;
  arms?: Arms;
  /** Развернуть по горизонтали */
  flip?: boolean;
  /** Наклон, градусов (вокруг точки опоры) */
  rot?: number;
  shadow?: boolean;
  /** Куда смотрят зрачки: −1 влево … 1 вправо */
  look?: number;
  /** Что-то на теле (узор, костюм): рисуется поверх тела до лица */
  body?: string;
}

function hatSvg(h: Hat): string {
  switch (h) {
    case 'cap':
      return `<path d="M-27-76C-25-100 25-100 27-76Z" fill="#4a63ff"/><path d="M-3-80H38C38-73 30-71 22-71H-3Z" fill="#3548d4"/><circle cx="0" cy="-96" r="3.5" fill="#fff"/>`;
    case 'party':
      return `<path d="M-15-80L0-122L15-80Z" fill="#ff5a8a"/><path d="M-9-95L9-95M-12-86L12-86" stroke="#fff" stroke-width="3"/><circle cx="0" cy="-123" r="5" fill="${COLOR.yellow}"/>`;
    case 'crown':
      return `<path d="M-23-79L-27-104L-12-93L0-108L12-93L27-104L23-79Z" fill="${COLOR.gold}" stroke="#d99a14" stroke-width="2" stroke-linejoin="round"/><circle cx="0" cy="-92" r="3.5" fill="${COLOR.red}"/><circle cx="-15" cy="-87" r="2.6" fill="#4a63ff"/><circle cx="15" cy="-87" r="2.6" fill="#4a63ff"/>`;
    case 'chef':
      return `<circle cx="-14" cy="-98" r="13" fill="#fff"/><circle cx="2" cy="-106" r="15" fill="#fff"/><circle cx="17" cy="-97" r="12" fill="#fff"/><rect x="-23" y="-92" width="46" height="14" rx="3" fill="#fff" stroke="#d9e2ea" stroke-width="1.5"/>`;
    case 'sailor':
      return `<ellipse cx="0" cy="-80" rx="29" ry="8" fill="#fff" stroke="#c9d4de" stroke-width="1.5"/><path d="M-24-80C-22-96 22-96 24-80Z" fill="#fff" stroke="#c9d4de" stroke-width="1.5"/><path d="M-24-84H24" stroke="#3a4fd6" stroke-width="4"/>`;
    case 'melon':
      return `<path d="M-33-74A33 31 0 0 1 33-74Z" fill="#43b04f"/><path d="M-20-76Q-24-92-14-100M0-76V-104M20-76Q24-92 14-100" stroke="#2c8a3c" stroke-width="4" fill="none"/><path d="M-33-74H33" stroke="#ff5a6e" stroke-width="6"/>`;
    case 'tophat':
      return `<rect x="-17" y="-112" width="34" height="34" rx="3" fill="#2d2630"/><rect x="-28" y="-82" width="56" height="7" rx="3.5" fill="#2d2630"/><rect x="-17" y="-90" width="34" height="7" fill="${COLOR.red}"/>`;
    case 'straw':
      return `<ellipse cx="0" cy="-79" rx="38" ry="9" fill="#f1cf79" stroke="#d9ab45" stroke-width="2"/><path d="M-20-80C-18-100 18-100 20-80Z" fill="#f6dc93"/><path d="M-20-85H20" stroke="${COLOR.red}" stroke-width="4"/>`;
    case 'bandana':
      return `<path d="M-33-72C-20-86 20-86 33-72L28-64C16-72-16-72-28-64Z" fill="${COLOR.red}"/><circle cx="-10" cy="-74" r="2" fill="#fff"/><circle cx="6" cy="-76" r="2" fill="#fff"/><path d="M30-70L42-62L34-60Z" fill="${COLOR.red}"/>`;
    case 'helmet':
      return `<path d="M-30-74C-30-102 30-102 30-74Z" fill="#ffd23f" stroke="#d9a21a" stroke-width="2"/><rect x="-33" y="-77" width="66" height="6" rx="3" fill="#e0aa17"/>`;
    case 'fool':
      return `<path d="M-26-78L-40-100L-22-92L-6-110L8-92L26-104L26-78Z" fill="#ff5a8a"/><circle cx="-40" cy="-101" r="4" fill="${COLOR.yellow}"/><circle cx="-6" cy="-111" r="4" fill="${COLOR.yellow}"/><circle cx="26" cy="-105" r="4" fill="${COLOR.yellow}"/>`;
    case 'pirate':
      return `<path d="M-32-78C-30-98 30-98 32-78Z" fill="#2d2630"/><path d="M-32-78H32" stroke="#2d2630" stroke-width="6"/><circle cx="0" cy="-90" r="5" fill="#fff"/><path d="M-3-90H3M0-93V-87" stroke="#2d2630" stroke-width="1.5"/>`;
    default:
      return '';
  }
}

function eyes(face: Face, look: number): string {
  const px = look * 2.6;
  const white = (cx: number) => `<ellipse cx="${cx}" cy="-52" rx="8" ry="10" fill="#fff"/>`;
  const pupil = (cx: number) => `<circle cx="${n(cx + px)}" cy="-50" r="4" fill="${COLOR.ink}"/><circle cx="${n(cx + px + 1.4)}" cy="-52.4" r="1.3" fill="#fff"/>`;
  switch (face) {
    case 'cheer':
    case 'laugh':
      return `<path d="M-21-50Q-13-62-5-50M5-50Q13-62 21-50" stroke="${COLOR.ink}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    case 'sleepy':
      return `<path d="M-21-52Q-13-44-5-52M5-52Q13-44 21-52" stroke="${COLOR.ink}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    case 'dizzy':
      return `<path d="M-20-58l12 12M-8-58l-12 12M8-58l12 12M20-58l-12 12" stroke="${COLOR.ink}" stroke-width="3" stroke-linecap="round"/>`;
    case 'smug':
      return `${white(-13)}${white(13)}${pupil(-13)}${pupil(13)}<path d="M-23-56H-4M4-56H23" stroke="${COLOR.ink}" stroke-width="3.5" stroke-linecap="round" opacity=".85"/>`;
    case 'angry':
      return `${white(-13)}${white(13)}${pupil(-13)}${pupil(13)}<path d="M-23-66L-5-58M23-66L5-58" stroke="${COLOR.ink}" stroke-width="3.5" stroke-linecap="round"/>`;
    case 'oh':
      return `<ellipse cx="-13" cy="-52" rx="9" ry="11.5" fill="#fff"/><ellipse cx="13" cy="-52" rx="9" ry="11.5" fill="#fff"/><circle cx="${n(-13 + px)}" cy="-52" r="3.4" fill="${COLOR.ink}"/><circle cx="${n(13 + px)}" cy="-52" r="3.4" fill="${COLOR.ink}"/>`;
    default:
      return `${white(-13)}${white(13)}${pupil(-13)}${pupil(13)}`;
  }
}

function mouth(face: Face): string {
  const line = `stroke="${COLOR.ink}" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"`;
  switch (face) {
    case 'grin':
    case 'cheer':
      return `<path d="M-10-36Q0-22 10-36Z" fill="#7a2230" stroke="${COLOR.ink}" stroke-width="2" stroke-linejoin="round"/><path d="M-5-30Q0-26 5-30" stroke="#ff7a8e" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    case 'laugh':
      return `<path d="M-12-38Q0-18 12-38Z" fill="#7a2230" stroke="${COLOR.ink}" stroke-width="2" stroke-linejoin="round"/><path d="M-6-28Q0-23 6-28" stroke="#ff7a8e" stroke-width="3.5" fill="none" stroke-linecap="round"/>`;
    case 'oh':
      return `<ellipse cx="0" cy="-32" rx="4.5" ry="5.5" fill="#7a2230" stroke="${COLOR.ink}" stroke-width="2"/>`;
    case 'smug':
      return `<path d="M-8-33Q2-27 11-36" ${line}/>`;
    case 'dizzy':
      return `<path d="M-9-33q3-4 6 0t6 0t6 0" ${line}/>`;
    case 'sleepy':
      return `<ellipse cx="0" cy="-33" rx="3" ry="3.5" fill="#7a2230"/>`;
    case 'angry':
      return `<path d="M-8-29Q0-37 8-29" ${line}/>`;
    default:
      return `<path d="M-8-35Q0-27 8-35" ${line}/>`;
  }
}

function armsSvg(a: Arms, fill: string, stroke: string): string {
  const m = (x: number, y: number) => `<circle cx="${x}" cy="${y}" r="7.5" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
  switch (a) {
    case 'up':
      return m(-42, -64) + m(42, -64);
    case 'wave':
      return m(-40, -24) + `<path d="M44-52q6-6 12 0M46-60q8-8 16 0" stroke="${COLOR.ink}" stroke-width="1.8" fill="none" opacity=".5" stroke-linecap="round"/>` + m(44, -68);
    case 'out':
      return m(-50, -42) + m(50, -42);
    case 'hold':
      return m(-22, -22) + m(22, -22);
    case 'none':
      return '';
    default:
      return m(-41, -22) + m(41, -22);
  }
}

/** Желейка. Точка опоры — низ тела посередине; в рост (s = 1) около 82 единиц */
export function jelly(o: JellyOpts): string {
  const [base, dark, light] = JELLY[o.c ?? 'orange'];
  const s = o.s ?? 1;
  const face = o.face ?? 'smile';
  const tf = `translate(${n(o.x)} ${n(o.y)})${o.rot ? ` rotate(${n(o.rot)})` : ''} scale(${n(o.flip ? -s : s)} ${n(s)})`;
  const hat = o.hat ?? 'none';
  return (
    `<g transform="${tf}">` +
    (o.shadow === false ? '' : `<ellipse cx="0" cy="3" rx="38" ry="7" fill="#1d5c6a" opacity=".22"/>`) +
    armsSvg(o.arms ?? 'down', base, dark) +
    `<path d="M-35 0C-42-30-34-78 0-82C34-78 42-30 35 0C18 7-18 7-35 0Z" fill="${base}"/>` +
    `<path d="M-35 0C-18 7 18 7 35 0C39-14 37-24 33-30C20-12-20-12-33-30C-37-24-39-14-35 0Z" fill="${dark}" opacity=".42"/>` +
    (o.body ?? '') +
    `<ellipse cx="-17" cy="-64" rx="9" ry="5.5" transform="rotate(-28 -17 -64)" fill="${light}" opacity=".9"/>` +
    eyes(face, o.look ?? 0) +
    `<ellipse cx="-24" cy="-40" rx="6" ry="3.6" fill="#ff6a8c" opacity=".35"/><ellipse cx="24" cy="-40" rx="6" ry="3.6" fill="#ff6a8c" opacity=".35"/>` +
    mouth(face) +
    hatSvg(hat) +
    `</g>`
  );
}

// ------------------------------------------------------------ мелкие детали

export function star(x: number, y: number, r: number, fill: string = COLOR.yellow): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push(`${n(x + Math.cos(a) * rr)},${n(y + Math.sin(a) * rr)}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="${fill}" stroke="#e0aa17" stroke-width="1" stroke-linejoin="round"/>`;
}

export function spark(x: number, y: number, r: number, fill: string = '#fff'): string {
  return `<path d="M${n(x)} ${n(y - r)}Q${n(x)} ${n(y)} ${n(x + r)} ${n(y)}Q${n(x)} ${n(y)} ${n(x)} ${n(y + r)}Q${n(x)} ${n(y)} ${n(x - r)} ${n(y)}Q${n(x)} ${n(y)} ${n(x)} ${n(y - r)}Z" fill="${fill}"/>`;
}

export function heart(x: number, y: number, s = 1, fill: string = COLOR.red): string {
  return `<path transform="translate(${n(x)} ${n(y)}) scale(${n(s)})" d="M0 8C-12-2-10-12-3-12Q0-12 0-6Q0-12 3-12C10-12 12-2 0 8Z" fill="${fill}"/>`;
}

export function note(x: number, y: number, s = 1, fill: string = COLOR.ink): string {
  return `<g transform="translate(${n(x)} ${n(y)}) scale(${n(s)})"><path d="M2 0V-18L12-21V-3" stroke="${fill}" stroke-width="2.4" fill="none" stroke-linejoin="round"/><ellipse cx="-1" cy="0" rx="4.5" ry="3.4" fill="${fill}"/><ellipse cx="9" cy="-3" rx="4.5" ry="3.4" fill="${fill}"/></g>`;
}

export function confetti(seed: number, x0: number, y0: number, x1: number, y1: number, count = 26): string {
  const r = rng(seed);
  const colors = [COLOR.red, COLOR.yellow, COLOR.blue, COLOR.green, COLOR.pink, COLOR.orange];
  let out = '';
  for (let i = 0; i < count; i++) {
    const x = x0 + r() * (x1 - x0);
    const y = y0 + r() * (y1 - y0);
    out += `<rect x="${n(x)}" y="${n(y)}" width="5" height="9" rx="1" transform="rotate(${Math.round(r() * 180)} ${n(x)} ${n(y)})" fill="${colors[i % colors.length]}"/>`;
  }
  return out;
}

export function bubble(x: number, y: number, w: number, text: string, tail: 'l' | 'r' = 'l', size = 12): string {
  const h = size + 14;
  const tx = tail === 'l' ? x + 16 : x + w - 16;
  return (
    `<g><rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="9" fill="#fff" stroke="${COLOR.ink}" stroke-width="2"/>` +
    `<path d="M${n(tx - 6)} ${n(y + h - 1)}L${n(tx + (tail === 'l' ? -5 : 5))} ${n(y + h + 10)}L${n(tx + 6)} ${n(y + h - 1)}" fill="#fff" stroke="${COLOR.ink}" stroke-width="2" stroke-linejoin="round"/>` +
    `<rect x="${n(tx - 5)}" y="${n(y + h - 3)}" width="10" height="4" fill="#fff"/>` +
    `<text x="${n(x + w / 2)}" y="${n(y + h / 2 + size * 0.36)}" font-size="${size}" font-weight="700" fill="${COLOR.ink}" text-anchor="middle">${esc(text)}</text></g>`
  );
}

export function label(x: number, y: number, text: string, size = 12, fill: string = COLOR.ink, weight = 700): string {
  return `<text x="${n(x)}" y="${n(y)}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="middle">${esc(text)}</text>`;
}

export function ripple(x: number, y: number, r: number): string {
  return `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(r)}" ry="${n(r * 0.32)}" fill="none" stroke="#fff" stroke-width="2" opacity=".85"/>`;
}

// ------------------------------------------------------------ реквизит

export function palm(x: number, y: number, s = 1): string {
  const leaf = (rot: number) => `<path d="M0 0Q18-16 40-4Q20-6 0 0Z" fill="${COLOR.grassDark}" transform="rotate(${rot})"/><path d="M0 0Q16-24 38-14Q18-12 0 0Z" fill="#7fd157" transform="rotate(${rot})"/>`;
  return (
    `<g transform="translate(${n(x)} ${n(y)}) scale(${n(s)})"><path d="M-4 0Q-10-40 2-74L9-74Q0-40 6 0Z" fill="#b9792f"/>` +
    `<g transform="translate(5 -74)">${leaf(-30)}${leaf(-100)}${leaf(20)}${leaf(-160)}${leaf(60)}<circle cx="-3" cy="6" r="5" fill="#7a4a2e"/><circle cx="5" cy="7" r="5" fill="#7a4a2e"/></g></g>`
  );
}

export function crate(x: number, y: number, s = 1, fill: string = COLOR.wood): string {
  return `<g transform="translate(${n(x)} ${n(y)}) scale(${n(s)})"><rect x="-16" y="-30" width="32" height="30" rx="2" fill="${fill}" stroke="${COLOR.woodDark}" stroke-width="2"/><path d="M-16-30L16 0M16-30L-16 0" stroke="${COLOR.woodDark}" stroke-width="2" opacity=".55"/></g>`;
}

export function bench(x: number, y: number, s = 1): string {
  return (
    `<g transform="translate(${n(x)} ${n(y)}) scale(${n(s)})"><rect x="-38" y="-32" width="76" height="6" rx="2" fill="${COLOR.wood}"/><rect x="-38" y="-44" width="76" height="6" rx="2" fill="${COLOR.wood}"/>` +
    `<rect x="-38" y="-20" width="76" height="8" rx="2" fill="#cf8f45" stroke="${COLOR.woodDark}" stroke-width="1.5"/><rect x="-32" y="-12" width="6" height="12" fill="${COLOR.woodDark}"/><rect x="26" y="-12" width="6" height="12" fill="${COLOR.woodDark}"/>` +
    `<rect x="-34" y="-44" width="5" height="24" fill="${COLOR.woodDark}"/><rect x="29" y="-44" width="5" height="24" fill="${COLOR.woodDark}"/></g>`
  );
}

export function banana(x: number, y: number, s = 1, rot = 0): string {
  return `<g transform="translate(${n(x)} ${n(y)}) rotate(${rot}) scale(${n(s)})"><path d="M-17-4C-8 12 12 12 20-10C14-3 6 2-4 2C-10 2-15-1-17-4Z" fill="${COLOR.yellow}" stroke="#c99a12" stroke-width="1.6" stroke-linejoin="round"/><circle cx="20" cy="-10" r="2.4" fill="#7a4a2e"/><circle cx="-17" cy="-4" r="2.2" fill="#7a4a2e"/></g>`;
}

export function peel(x: number, y: number, s = 1): string {
  const petal = (rot: number, cx: number) => `<ellipse cx="${cx}" cy="0" rx="14" ry="5" transform="rotate(${rot})" fill="${COLOR.yellow}" stroke="#c99a12" stroke-width="1.6"/>`;
  return `<g transform="translate(${n(x)} ${n(y)}) scale(${n(s)})">${petal(-24, -9)}${petal(24, 9)}${petal(0, 0)}<ellipse cx="0" cy="1" rx="7" ry="3" fill="#fff3a8"/></g>`;
}

export function cushion(x: number, y: number, s = 1, puffed = true): string {
  return `<g transform="translate(${n(x)} ${n(y)}) scale(${n(s)})"><ellipse cx="0" cy="-${puffed ? 7 : 4}" rx="21" ry="${puffed ? 9 : 5}" fill="#ff7aa8" stroke="#d9487f" stroke-width="2"/><rect x="18" y="-10" width="8" height="5" rx="2" fill="#d9487f"/><ellipse cx="-6" cy="-${puffed ? 10 : 6}" rx="7" ry="2.5" fill="#ffc2d8"/></g>`;
}

export function melon(x: number, y: number, s = 1, fuse = true): string {
  return (
    `<g transform="translate(${n(x)} ${n(y)}) scale(${n(s)})"><circle r="23" fill="#43b04f" stroke="#2c8a3c" stroke-width="2"/>` +
    `<path d="M-13-18Q-20 0-13 18M0-23Q-7 0 0 23M13-18Q20 0 13 18" stroke="#2c8a3c" stroke-width="4" fill="none" stroke-linecap="round" opacity=".8"/>` +
    `<ellipse cx="-9" cy="-11" rx="6" ry="3.4" transform="rotate(-35 -9 -11)" fill="#fff" opacity=".5"/>` +
    (fuse ? `<path d="M0-22Q3-30 10-33" stroke="${COLOR.brown}" stroke-width="3" fill="none" stroke-linecap="round"/>${star(11, -35, 8, COLOR.orange)}${spark(11, -35, 4, '#fff7c2')}` : '') +
    `</g>`
  );
}

export function plane(x: number, y: number, s = 1, rot = 0): string {
  return (
    `<g transform="translate(${n(x)} ${n(y)}) rotate(${rot}) scale(${n(s)})"><path d="M-30 0Q-30-12 0-12L24-8L34 0L24 6L0 9Q-30 9-30 0Z" fill="${COLOR.red}" stroke="#c93a3f" stroke-width="1.5"/>` +
    `<path d="M-26-4L-38-20L-29-20L-17-4Z" fill="#fff" stroke="#c9d4de" stroke-width="1.2"/><path d="M-6-6H10L4-28H-8Z" fill="#fff" stroke="#c9d4de" stroke-width="1.2"/><path d="M-6 6H10L4 24H-8Z" fill="#f2f7fb" stroke="#c9d4de" stroke-width="1.2"/>` +
    `<circle cx="10" cy="-5" r="4.2" fill="#bfe9ff" stroke="#6aa5cf" stroke-width="1.2"/><ellipse cx="35" cy="0" rx="2.2" ry="13" fill="#46505a" opacity=".55"/><circle cx="35" cy="0" r="3" fill="#46505a"/></g>`
  );
}

export function banner(x: number, y: number, w: number, text: string, size = 12): string {
  const h = 26;
  const seg = w / 6;
  let top = `M${n(x)} ${n(y)}`;
  let bottom = '';
  for (let i = 0; i < 6; i++) {
    const dy = i % 2 === 0 ? -5 : 5;
    top += `q${n(seg / 2)} ${dy} ${n(seg)} 0`;
  }
  for (let i = 5; i >= 0; i--) {
    const dy = i % 2 === 0 ? 5 : -5;
    bottom += `q${n(-seg / 2)} ${dy} ${n(-seg)} 0`;
  }
  return (
    `<path d="${top}v${h}${bottom}z" fill="${COLOR.paper}" stroke="${COLOR.red}" stroke-width="2.4" stroke-linejoin="round"/>` +
    `<text x="${n(x + w / 2)}" y="${n(y + h / 2 + size * 0.36)}" font-size="${size}" font-weight="900" fill="${COLOR.red}" text-anchor="middle">${esc(text)}</text>`
  );
}

export function tower(x: number, y: number, s = 1, puck = 0.7): string {
  const top = -130;
  const py = -10 + (top + 22 + 10) * puck;
  let ticks = '';
  for (let i = 1; i < 10; i++) ticks += `<path d="M-9 ${-i * 12.2}H${i % 3 === 0 ? 1 : -3}" stroke="${COLOR.woodDark}" stroke-width="2"/>`;
  return (
    `<g transform="translate(${n(x)} ${n(y)}) scale(${n(s)})"><rect x="-26" y="-8" width="52" height="10" rx="3" fill="${COLOR.wood}" stroke="${COLOR.woodDark}" stroke-width="2"/>` +
    `<rect x="-9" y="${top}" width="18" height="124" rx="5" fill="${COLOR.paper}" stroke="${COLOR.woodDark}" stroke-width="3"/>` +
    `<rect x="-9" y="${top + 4}" width="18" height="26" rx="4" fill="${COLOR.red}" opacity=".85"/><rect x="-9" y="${top + 30}" width="18" height="26" fill="${COLOR.yellow}" opacity=".9"/><rect x="-9" y="${top + 56}" width="18" height="26" fill="${COLOR.green}" opacity=".9"/>` +
    ticks +
    `<circle cx="0" cy="${n(py)}" r="7.5" fill="${COLOR.red}" stroke="#a82a30" stroke-width="2"/>` +
    `<path d="M-13 ${top - 6}Q-13 ${top - 26} 0 ${top - 26}Q13 ${top - 26} 13 ${top - 6}Z" fill="${COLOR.gold}" stroke="#c4901b" stroke-width="2" stroke-linejoin="round"/><circle cx="0" cy="${top - 2}" r="3.5" fill="#7a4a2e"/>` +
    `<path d="M-20 ${top - 22}l-5-6M20 ${top - 22}l5-6M-22 ${top - 14}h-7M22 ${top - 14}h7" stroke="${COLOR.gold}" stroke-width="2.4" stroke-linecap="round"/></g>`
  );
}

export function mallet(x: number, y: number, s = 1, rot = 0): string {
  return `<g transform="translate(${n(x)} ${n(y)}) rotate(${rot}) scale(${n(s)})"><rect x="-3" y="-4" width="6" height="52" rx="3" fill="${COLOR.wood}" stroke="${COLOR.woodDark}" stroke-width="1.5"/><rect x="-14" y="-18" width="28" height="18" rx="4" fill="#cf8f45" stroke="${COLOR.woodDark}" stroke-width="2"/><rect x="-14" y="-12" width="28" height="3" fill="${COLOR.woodDark}" opacity=".5"/></g>`;
}

export function campfire(x: number, y: number, s = 1): string {
  return (
    `<g transform="translate(${n(x)} ${n(y)}) scale(${n(s)})"><ellipse cx="0" cy="2" rx="30" ry="7" fill="#1d5c6a" opacity=".2"/>` +
    `<rect x="-26" y="-9" width="52" height="8" rx="4" fill="${COLOR.wood}" transform="rotate(-9)"/><rect x="-26" y="-9" width="52" height="8" rx="4" fill="${COLOR.woodDark}" transform="rotate(9)"/>` +
    `<path d="M0-8C-22-12-20-40 0-62C20-40 22-12 0-8Z" fill="${COLOR.orange}"/><path d="M0-8C-12-12-11-30 0-44C11-30 12-12 0-8Z" fill="${COLOR.yellow}"/><path d="M0-8C-5-11-5-20 0-26C5-20 5-11 0-8Z" fill="#fff7c2"/>` +
    `<circle cx="-22" cy="-44" r="2" fill="${COLOR.yellow}"/><circle cx="20" cy="-52" r="1.8" fill="${COLOR.orange}"/><circle cx="12" cy="-66" r="1.6" fill="${COLOR.yellow}"/>` +
    `<ellipse cx="-34" cy="0" rx="6" ry="4" fill="${COLOR.gray}"/><ellipse cx="34" cy="0" rx="6" ry="4" fill="${COLOR.gray}"/><ellipse cx="-20" cy="5" rx="5" ry="3.4" fill="#99a4ad"/><ellipse cx="22" cy="5" rx="5" ry="3.4" fill="#99a4ad"/></g>`
  );
}

export function marshmallow(x: number, y: number, s = 1, rot = 0, tone: 'white' | 'gold' | 'black' = 'white'): string {
  const fill = tone === 'gold' ? '#e9a640' : tone === 'black' ? '#3a2b31' : '#fff';
  return `<g transform="translate(${n(x)} ${n(y)}) rotate(${rot}) scale(${n(s)})"><path d="M0 0L-60 -26" stroke="${COLOR.brown}" stroke-width="3" stroke-linecap="round"/><rect x="-9" y="-10" width="18" height="14" rx="6" fill="${fill}" stroke="${tone === 'white' ? '#d9d2c4' : '#6d4a22'}" stroke-width="1.5"/></g>`;
}

export function log(x: number, y: number, s = 1, rot = 0): string {
  return `<g transform="translate(${n(x)} ${n(y)}) rotate(${rot}) scale(${n(s)})"><rect x="-26" y="-12" width="52" height="16" rx="8" fill="${COLOR.wood}" stroke="${COLOR.woodDark}" stroke-width="2"/><ellipse cx="22" cy="-4" rx="4" ry="6" fill="#e0b277"/></g>`;
}

export function cup(x: number, y: number, s = 1): string {
  return (
    `<g transform="translate(${n(x)} ${n(y)}) scale(${n(s)})"><rect x="-14" y="-8" width="28" height="8" rx="2" fill="#c4901b"/><rect x="-4" y="-22" width="8" height="15" fill="${COLOR.gold}"/>` +
    `<path d="M-20-58h40c0 22-8 36-20 38-12-2-20-16-20-38Z" fill="${COLOR.gold}" stroke="#c4901b" stroke-width="2" stroke-linejoin="round"/>` +
    `<path d="M-20-52C-34-52-34-34-18-32M20-52C34-52 34-34 18-32" stroke="#c4901b" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M-11-52Q-12-36-6-28" stroke="#fff" stroke-width="3" fill="none" opacity=".6" stroke-linecap="round"/>${star(0, -40, 7, '#fff7c2')}</g>`
  );
}

export function balloon(x: number, y: number, fill: string, s = 1): string {
  return `<g transform="translate(${n(x)} ${n(y)}) scale(${n(s)})"><path d="M0 0Q-3 14 2 28" stroke="${COLOR.ink}" stroke-width="1.2" fill="none" opacity=".6"/><ellipse cx="0" cy="-14" rx="12" ry="15" fill="${fill}"/><path d="M-3-1L3-1L0 3Z" fill="${fill}"/><ellipse cx="-4" cy="-20" rx="3" ry="5" fill="#fff" opacity=".45"/></g>`;
}

export function cake(x: number, y: number, s = 1): string {
  return (
    `<g transform="translate(${n(x)} ${n(y)}) scale(${n(s)})"><ellipse cx="0" cy="0" rx="34" ry="8" fill="#fff" stroke="#d9d2c4" stroke-width="1.5"/><rect x="-28" y="-26" width="56" height="26" rx="5" fill="#ffcf9a"/><path d="M-28-26Q-20-16-12-26Q-4-16 4-26Q12-16 20-26Q24-20 28-26V-30H-28Z" fill="#ff9ec7"/>` +
    `<rect x="-24" y="-48" width="48" height="22" rx="5" fill="#ffe0b8"/><path d="M-24-48Q-16-38-8-48Q0-38 8-48Q16-38 24-48V-52H-24Z" fill="#fff"/>` +
    `<rect x="-11" y="-66" width="5" height="18" fill="${COLOR.red}"/><rect x="6" y="-66" width="5" height="18" fill="${COLOR.blue}"/><path d="M-8.5-68Q-12-74-8.5-79Q-5-74-8.5-68Z" fill="${COLOR.orange}"/><path d="M8.5-68Q5-74 8.5-79Q12-74 8.5-68Z" fill="${COLOR.orange}"/></g>`
  );
}

export function camera(x: number, y: number, s = 1): string {
  return `<g transform="translate(${n(x)} ${n(y)}) scale(${n(s)})"><rect x="-26" y="-34" width="52" height="34" rx="7" fill="#46505a"/><rect x="-26" y="-34" width="52" height="9" rx="4" fill="#5b6672"/><circle cx="0" cy="-16" r="12" fill="#2d343b" stroke="#aab4bd" stroke-width="3"/><circle cx="0" cy="-16" r="6" fill="#4a63ff"/><circle cx="-3" cy="-19" r="2" fill="#fff" opacity=".8"/><rect x="-20" y="-40" width="12" height="6" rx="2" fill="#5b6672"/><circle cx="17" cy="-28" r="2.6" fill="${COLOR.red}"/></g>`;
}

export function umbrella(x: number, y: number, s = 1, rot = 0): string {
  return `<g transform="translate(${n(x)} ${n(y)}) rotate(${rot}) scale(${n(s)})"><path d="M0 0V-40" stroke="${COLOR.ink}" stroke-width="2.4"/><path d="M-42-40Q-36-80 0-84Q36-80 42-40Q34-48 28-40Q20-48 14-40Q6-48 0-40Q-6-48-14-40Q-20-48-28-40Q-34-48-42-40Z" fill="${COLOR.red}" stroke="#c93a3f" stroke-width="2" stroke-linejoin="round"/><path d="M0-84V-42M-21-76L-14-42M21-76L14-42" stroke="#fff" stroke-width="3" opacity=".7"/><path d="M0 0q-5 4-9 0" stroke="${COLOR.ink}" stroke-width="2.4" fill="none"/></g>`;
}

export function raft(x: number, y: number, s = 1): string {
  return (
    `<g transform="translate(${n(x)} ${n(y)}) scale(${n(s)})"><ellipse cx="0" cy="0" rx="46" ry="12" fill="${COLOR.wood}" stroke="${COLOR.woodDark}" stroke-width="2"/><ellipse cx="0" cy="-2" rx="38" ry="9" fill="#cf8f45"/>` +
    `<ellipse cx="0" cy="-3" rx="28" ry="6.5" fill="#fff"/><ellipse cx="0" cy="-3" rx="19" ry="4.4" fill="${COLOR.red}"/><ellipse cx="0" cy="-3" rx="10" ry="2.4" fill="#fff"/><ellipse cx="0" cy="-3" rx="4" ry="1.2" fill="${COLOR.red}"/></g>`
  );
}

export function dolphin(x: number, y: number, s = 1, rot = 0): string {
  return (
    `<g transform="translate(${n(x)} ${n(y)}) rotate(${rot}) scale(${n(s)})"><path d="M-34 4C-26-22 6-30 30-12L44-22L42-2L48 6L32 6C14 20-18 20-34 4Z" fill="#7aa7d6" stroke="#4f7fb3" stroke-width="2" stroke-linejoin="round"/>` +
    `<path d="M-30 6C-10 14 14 14 30 6C14 18-14 18-30 6Z" fill="#e6f1fa"/><path d="M-8-20L-2-34L8-20Z" fill="#6c97c9" stroke="#4f7fb3" stroke-width="1.5" stroke-linejoin="round"/><circle cx="-18" cy="-6" r="2.6" fill="${COLOR.ink}"/><path d="M-30 2Q-26 5-22 3" stroke="${COLOR.ink}" stroke-width="1.6" fill="none"/></g>`
  );
}

export function gull(x: number, y: number, s = 1, rot = 0): string {
  return (
    `<g transform="translate(${n(x)} ${n(y)}) rotate(${rot}) scale(${n(s)})"><ellipse cx="0" cy="0" rx="17" ry="9" fill="#fff" stroke="#c9d4de" stroke-width="1.5"/><path d="M-4-4Q-14-26-34-22Q-20-14-12 0Z" fill="#f2f7fb" stroke="#c9d4de" stroke-width="1.5" stroke-linejoin="round"/>` +
    `<path d="M4-4Q14-24 34-18Q20-12 12 0Z" fill="#e3ecf4" stroke="#c9d4de" stroke-width="1.5" stroke-linejoin="round"/><circle cx="16" cy="-5" r="6.5" fill="#fff" stroke="#c9d4de" stroke-width="1.5"/><path d="M21-5L31-3L21 0Z" fill="${COLOR.orange}"/><circle cx="17" cy="-7" r="1.5" fill="${COLOR.ink}"/></g>`
  );
}

export function crab(x: number, y: number, s = 1): string {
  return (
    `<g transform="translate(${n(x)} ${n(y)}) scale(${n(s)})"><path d="M-12-4L-24-10M12-4L24-10M-12 0L-24 2M12 0L24 2" stroke="#d9433a" stroke-width="2.6" stroke-linecap="round"/>` +
    `<ellipse cx="0" cy="-6" rx="15" ry="10" fill="#ef5a4a" stroke="#d9433a" stroke-width="2"/><circle cx="-22" cy="-18" r="6" fill="#ef5a4a" stroke="#d9433a" stroke-width="2"/><circle cx="22" cy="-18" r="6" fill="#ef5a4a" stroke="#d9433a" stroke-width="2"/>` +
    `<path d="M-6-14V-20M6-14V-20" stroke="#d9433a" stroke-width="2"/><circle cx="-6" cy="-21" r="3" fill="#fff"/><circle cx="6" cy="-21" r="3" fill="#fff"/><circle cx="-6" cy="-21" r="1.4" fill="${COLOR.ink}"/><circle cx="6" cy="-21" r="1.4" fill="${COLOR.ink}"/></g>`
  );
}

export function bucket(x: number, y: number, s = 1): string {
  return `<g transform="translate(${n(x)} ${n(y)}) scale(${n(s)})"><path d="M-16-26H16L12 0H-12Z" fill="#8fa3b5" stroke="#6b7f92" stroke-width="2" stroke-linejoin="round"/><path d="M-16-26Q0-34 16-26" stroke="#6b7f92" stroke-width="2.4" fill="none"/><path d="M-12-14H13" stroke="#fff" stroke-width="2" opacity=".5"/></g>`;
}

export function cat(x: number, y: number, s = 1, flip = false): string {
  return (
    `<g transform="translate(${n(x)} ${n(y)}) scale(${n(flip ? -s : s)} ${n(s)})"><path d="M18-8Q34-10 30-26" stroke="#e08a3a" stroke-width="5" fill="none" stroke-linecap="round"/><ellipse cx="2" cy="-10" rx="20" ry="11" fill="#f0a35a"/>` +
    `<circle cx="-14" cy="-18" r="11" fill="#f0a35a"/><path d="M-23-26L-21-37L-14-29ZM-5-26L-7-37L-14-29Z" fill="#f0a35a"/><path d="M-17-19L-11-19" stroke="${COLOR.ink}" stroke-width="2" stroke-linecap="round"/><circle cx="-17" cy="-20" r="1.8" fill="${COLOR.ink}"/><circle cx="-11" cy="-20" r="1.8" fill="${COLOR.ink}"/><path d="M-15-15Q-14-13-12.5-15" stroke="${COLOR.ink}" stroke-width="1.4" fill="none"/>` +
    `<rect x="-10" y="-3" width="5" height="8" rx="2.5" fill="#e08a3a"/><rect x="9" y="-3" width="5" height="8" rx="2.5" fill="#e08a3a"/></g>`
  );
}

export function boat(x: number, y: number, s = 1, hull: string = COLOR.wood): string {
  return `<g transform="translate(${n(x)} ${n(y)}) scale(${n(s)})"><path d="M-44-14H44L32 6H-32Z" fill="${hull}" stroke="${COLOR.woodDark}" stroke-width="2" stroke-linejoin="round"/><path d="M-40-8H40" stroke="#fff" stroke-width="3" opacity=".5"/><ellipse cx="0" cy="8" rx="46" ry="4" fill="#fff" opacity=".6"/></g>`;
}

export function ferry(x: number, y: number, s = 1): string {
  let windows = '';
  for (let i = 0; i < 5; i++) windows += `<rect x="${-38 + i * 17}" y="-34" width="11" height="10" rx="3" fill="#bfe9ff" stroke="#6aa5cf" stroke-width="1.5"/>`;
  return (
    `<g transform="translate(${n(x)} ${n(y)}) scale(${n(s)})"><path d="M-70-18H70L56 8H-56Z" fill="#fff" stroke="#c9d4de" stroke-width="2" stroke-linejoin="round"/><path d="M-64-8H64" stroke="#4a63ff" stroke-width="5"/>` +
    `<rect x="-46" y="-44" width="92" height="28" rx="6" fill="#f2f7fb" stroke="#c9d4de" stroke-width="2"/>${windows}` +
    `<rect x="-10" y="-70" width="20" height="28" rx="4" fill="${COLOR.red}" stroke="#c93a3f" stroke-width="2"/><rect x="-10" y="-62" width="20" height="6" fill="${COLOR.yellow}"/>` +
    `<ellipse cx="0" cy="10" rx="74" ry="5" fill="#fff" opacity=".6"/></g>`
  );
}

export function pier(x: number, y: number, w: number): string {
  let posts = '';
  for (let px = x + 10; px < x + w; px += 46) posts += `<rect x="${px}" y="${y}" width="9" height="28" fill="${COLOR.woodDark}"/>`;
  return `${posts}<rect x="${x}" y="${y - 7}" width="${w}" height="12" rx="3" fill="${COLOR.deck}" stroke="${COLOR.deckSeam}" stroke-width="2"/><path d="M${x} ${y - 1}H${x + w}" stroke="${COLOR.deckSeam}" stroke-width="1.4" opacity=".6"/>`;
}

export function clockSign(x: number, y: number, s = 1, text = '17:30'): string {
  return `<g transform="translate(${n(x)} ${n(y)}) scale(${n(s)})"><rect x="-3" y="-4" width="6" height="40" fill="${COLOR.woodDark}"/><circle cx="0" cy="-26" r="22" fill="#fff" stroke="${COLOR.woodDark}" stroke-width="4"/><path d="M0-26V-40M0-26L10-20" stroke="${COLOR.ink}" stroke-width="3" stroke-linecap="round"/>${label(0, 26, text, 9, COLOR.ink, 700)}</g>`;
}

export function easel(x: number, y: number, s = 1): string {
  return `<g transform="translate(${n(x)} ${n(y)}) scale(${n(s)})"><path d="M-30 0L-16-70M30 0L16-70M0 0V-64" stroke="${COLOR.woodDark}" stroke-width="5" stroke-linecap="round"/><rect x="-44" y="-112" width="88" height="62" rx="5" fill="#fff" stroke="${COLOR.wood}" stroke-width="5"/><path d="M-26-78Q-12-98 8-88Q22-80 14-68Q2-60-12-68" stroke="${COLOR.blue}" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M14-68L28-62L24-74" stroke="${COLOR.red}" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="-18" cy="-84" r="2.4" fill="${COLOR.ink}"/></g>`;
}

export function chest(x: number, y: number, s = 1): string {
  return `<g transform="translate(${n(x)} ${n(y)}) scale(${n(s)})"><rect x="-26" y="-22" width="52" height="22" rx="3" fill="${COLOR.wood}" stroke="${COLOR.woodDark}" stroke-width="2.4"/><path d="M-26-22Q-26-42 0-42Q26-42 26-22Z" fill="#cf8f45" stroke="${COLOR.woodDark}" stroke-width="2.4" stroke-linejoin="round"/><path d="M-9-42V0M9-42V0" stroke="${COLOR.gold}" stroke-width="4" opacity=".9"/><rect x="-5" y="-26" width="10" height="11" rx="2" fill="${COLOR.gold}" stroke="#c4901b" stroke-width="1.5"/></g>`;
}

export function mapPiece(x: number, y: number, rot: number, mark: string, s = 1): string {
  return `<g transform="translate(${n(x)} ${n(y)}) rotate(${rot}) scale(${n(s)})"><path d="M-22-18L-6-22L8-17L22-21L19-2L23 14L6 19L-8 15L-21 20L-18 0Z" fill="#f6e3b5" stroke="#b98a45" stroke-width="2" stroke-linejoin="round"/>${mark}</g>`;
}

export function beam(x: number, y: number, h: number, color: string = COLOR.yellow): string {
  return (
    `<ellipse cx="${n(x)}" cy="${n(y)}" rx="26" ry="8" fill="${color}" opacity=".5"/><rect x="${n(x - 16)}" y="${n(y - h)}" width="32" height="${n(h)}" fill="${color}" opacity=".25"/>` +
    `<rect x="${n(x - 10)}" y="${n(y - h)}" width="20" height="${n(h)}" fill="${color}" opacity=".3"/><rect x="${n(x - 4)}" y="${n(y - h)}" width="8" height="${n(h)}" fill="#fff" opacity=".5"/>` +
    `<path d="M${n(x - 12)} ${n(y - h - 4)}L${n(x)} ${n(y - h - 18)}L${n(x + 12)} ${n(y - h - 4)}L${n(x)} ${n(y - h - 9)}Z" fill="${COLOR.red}" stroke="#a82a30" stroke-width="1.5" stroke-linejoin="round"/>`
  );
}

export function megaphone(x: number, y: number, s = 1, rot = 0): string {
  return `<g transform="translate(${n(x)} ${n(y)}) rotate(${rot}) scale(${n(s)})"><path d="M0-8L30-22V22L0 8Z" fill="${COLOR.red}" stroke="#c93a3f" stroke-width="2" stroke-linejoin="round"/><rect x="-14" y="-9" width="16" height="18" rx="4" fill="#46505a"/><path d="M-8 9V20" stroke="#46505a" stroke-width="5" stroke-linecap="round"/><path d="M38-14Q46 0 38 14M46-22Q60 0 46 22" stroke="${COLOR.ink}" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".6"/></g>`;
}

export function fish(x: number, y: number, s = 1, rot = 0, fill: string = '#ff9a36'): string {
  return `<g transform="translate(${n(x)} ${n(y)}) rotate(${rot}) scale(${n(s)})"><path d="M-14 0Q0-12 14 0Q0 12-14 0ZM14 0L24-8V8Z" fill="${fill}" stroke="#c9631a" stroke-width="1.5" stroke-linejoin="round"/><circle cx="-7" cy="-2" r="1.8" fill="${COLOR.ink}"/></g>`;
}

export function rod(x: number, y: number, s = 1, rot = 0): string {
  return `<g transform="translate(${n(x)} ${n(y)}) rotate(${rot}) scale(${n(s)})"><path d="M0 0L58-44" stroke="${COLOR.woodDark}" stroke-width="3.4" stroke-linecap="round"/><path d="M58-44Q64-20 62 6" stroke="${COLOR.ink}" stroke-width="1.2" fill="none" opacity=".7"/><circle cx="62" cy="8" r="3" fill="${COLOR.red}"/></g>`;
}

export function podium(x: number, y: number, s = 1): string {
  const box = (bx: number, h: number, num: string, fill: string) => `<rect x="${bx}" y="${-h}" width="34" height="${h}" fill="${fill}" stroke="${COLOR.woodDark}" stroke-width="2"/>${label(bx + 17, -h + 20, num, 16, COLOR.ink, 900)}`;
  return `<g transform="translate(${n(x)} ${n(y)}) scale(${n(s)})">${box(-52, 26, '2', '#d9dee3')}${box(-17, 38, '1', COLOR.gold)}${box(18, 20, '3', '#d9a066')}</g>`;
}

export function wheel(x: number, y: number, r: number): string {
  const colors = ['#ff9ec7', '#ffd23f', '#9bd13b', '#5ab8ff', '#b39ddb', '#ff8a1c', '#5fd8a8', '#ff5a5f'];
  let out = '';
  for (let i = 0; i < 8; i++) {
    const a0 = (i * Math.PI) / 4 - Math.PI / 2 - Math.PI / 8;
    const a1 = a0 + Math.PI / 4;
    const p = (a: number, rr: number) => `${n(x + Math.cos(a) * rr)} ${n(y + Math.sin(a) * rr)}`;
    out += `<path d="M${p(a0, r * 0.32)}L${p(a0, r)}A${r} ${r} 0 0 1 ${p(a1, r)}L${p(a1, r * 0.32)}A${n(r * 0.32)} ${n(r * 0.32)} 0 0 0 ${p(a0, r * 0.32)}Z" fill="${colors[i]}" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>`;
    const am = a0 + Math.PI / 8;
    const ix = x + Math.cos(am) * r * 0.66;
    const iy = y + Math.sin(am) * r * 0.66;
    if (i === 0) out += star(ix, iy, 8, '#fff');
    else if (i === 1) out += heart(ix, iy - 2, 0.8, '#fff');
    else if (i === 2) out += note(ix - 4, iy + 6, 0.7, '#fff');
    else if (i === 3) out += `<path d="M${n(ix - 7)} ${n(iy)}Q${n(ix)} ${n(iy + 9)} ${n(ix + 7)} ${n(iy)}" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="${n(ix - 5)}" cy="${n(iy - 6)}" r="2" fill="#fff"/><circle cx="${n(ix + 5)}" cy="${n(iy - 6)}" r="2" fill="#fff"/>`;
    else if (i === 4) out += spark(ix, iy, 9, '#fff');
    else if (i === 5) out += `<path d="M${n(ix - 7)} ${n(iy + 6)}L${n(ix)} ${n(iy - 8)}L${n(ix + 7)} ${n(iy + 6)}Z" fill="#fff"/>`;
    else if (i === 6) out += `<circle cx="${n(ix)}" cy="${n(iy)}" r="6" fill="none" stroke="#fff" stroke-width="3"/>`;
    else out += `<path d="M${n(ix - 6)} ${n(iy - 6)}L${n(ix + 6)} ${n(iy + 6)}M${n(ix + 6)} ${n(iy - 6)}L${n(ix - 6)} ${n(iy + 6)}" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`;
  }
  return out + `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r * 0.3)}" fill="#fff7e4" stroke="${COLOR.ink}" stroke-width="2"/>`;
}

export function fireburst(x: number, y: number, r: number, fill: string = COLOR.yellow): string {
  let out = '';
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5;
    out += `<path d="M${n(x + Math.cos(a) * r * 0.35)} ${n(y + Math.sin(a) * r * 0.35)}L${n(x + Math.cos(a) * r)} ${n(y + Math.sin(a) * r)}" stroke="${fill}" stroke-width="3" stroke-linecap="round"/>`;
  }
  return out + `<circle cx="${n(x)}" cy="${n(y)}" r="3" fill="#fff"/>`;
}

export function awning(x: number, y: number, w: number): string {
  const seg = w / 8;
  let out = '';
  for (let i = 0; i < 8; i++) out += `<path d="M${n(x + i * seg)} ${y}h${n(seg)}v14q${n(-seg / 2)} 7 ${n(-seg)} 0Z" fill="${i % 2 === 0 ? COLOR.red : '#fff'}" stroke="#c93a3f" stroke-width="1"/>`;
  return out;
}

export function lantern(x: number, y: number, s = 1): string {
  return `<g transform="translate(${n(x)} ${n(y)}) scale(${n(s)})"><path d="M0-12V-4" stroke="${COLOR.ink}" stroke-width="1.6"/><rect x="-5" y="-4" width="10" height="13" rx="3" fill="${COLOR.yellow}" stroke="#c99a12" stroke-width="1.5"/><circle cx="0" cy="3" r="9" fill="${COLOR.sunGlow}" opacity=".5"/></g>`;
}

export function trophyBadge(x: number, y: number, text: string, w = 80): string {
  return `<rect x="${n(x - w / 2)}" y="${n(y - 11)}" width="${w}" height="20" rx="10" fill="${COLOR.paper}" stroke="${COLOR.gold}" stroke-width="2.4"/>${label(x, y + 4, text, 10, COLOR.ink, 700)}`;
}

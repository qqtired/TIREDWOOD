// Вывески новой набережной (PLAZA3, WP10): стиль «Ретро-парк 2.0», выбран владельцем 11.10.2026. Токены — по
// game-opus-ui/docs/sign-tokens-retropark2.md (шрифты, цвета, форма щита, раскладка «иконка + название + строка
// статуса»); скин меняется правкой этого файла. Здесь же вся чистая математика (без three.js и DOM): раскладка щита по
// размеру поля, упаковка холстов в атлас, разбор стрелок столбов-указателей — её проверяет test/plaza3-signs.test.ts.
import type { StatusMode } from './status.ts';

// ---------------------------------------------------------------------------------------------------------- токены
export const SIGN_FONT = {
  /** Заголовок: Rubik Mono One, ВЕРХНИЙ регистр. Запасной — Rubik 900 (если файл шрифта не загрузился) */
  title: '"Rubik Mono One"',
  titleFallback: '900 {px}px Rubik, sans-serif',
  status: 'Rubik, sans-serif',
  /** Трекинг и пробел моноширинного заголовка, в em (word-spacing −0,3 em: у Mono One слишком широкий пробел) */
  letter: 0.01,
  word: -0.3,
  /** Ширина знака Rubik Mono One, em (проверено в Chrome по measureText) */
  mono: 0.85,
} as const;

export const SIGN_COLOR = {
  enamelTop: '#13675f',
  enamelBottom: '#0d524d',
  /** Блик сверху: белый 5,5 % → 0 на 32 % высоты */
  sheen: 'rgba(255,255,255,0.055)',
  cream: '#f3e6c9',
  outline: '#0a3b37',
  text: '#fff4dc',
  textDim: 'rgba(255,244,220,0.76)',
  coral: '#ff7a5c',
  gold: '#ffcd4a',
  good: '#56c07d',
  bad: '#e5484d',
  /** Фон иконки: radial-gradient(circle at 35% 30%, #fff8e6, #f1dcb0 70%) */
  iconA: '#fff8e6',
  iconB: '#f1dcb0',
  /** Столб-указатель: бирюзовая эмаль, кремовые пояски, колпак цвета щита */
  pole: '#0d524d',
  poleBand: '#f3e6c9',
} as const;

/** Цвет точки статуса */
export const TONE_COLOR = { open: SIGN_COLOR.good, go: SIGN_COLOR.gold, bad: SIGN_COLOR.bad } as const;

/** Акцент режима (токены §2): пока нужен для кольца иконки у «горящих» входов и для будущего надзаголовка */
export const MODE_ACCENT: Readonly<Record<string, string>> = {
  fishing: '#7fe3d4', farm: '#8fd46e', fort: '#ff9a52', kart: '#ff6b5b', dungeon: '#e0b45c', paint: '#ff8a1c',
  hide: '#c99cff', sky: '#8fc2ff', regatta: '#6cc8f0', aqua: '#6cc8f0',
};

// ------------------------------------------------------------------------------------- какая вывеска что показывает
/** Иконки — client/assets/plaza3/icons/<id>.webp (из набора UI-треда); 'ball' рисуется кодом (в наборе нет бильярдного шара) */
export type IconId =
  | 'paint' | 'horn' | 'kart' | 'bell-cloud' | 'dungeon' | 'hide-box' | 'boat' | 'regatta' | 'lighthouse' | 'quest-fish' | 'rat'
  | 'slide' | 'wardrobe' | 'compass' | 'token' | 'scroll' | 'cards' | 'music' | 'ticket' | 'records' | 'online' | 'farm-gate' | 'ball';

/** Режим за флагом сервера: вывеска видна, только когда режим включён (Plaza3Dress.setMode) */
export type FlagMode = 'fort' | 'sky' | 'regatta' | 'hide' | 'dungeon';

export interface SignMeta {
  icon: IconId | null;
  /** Чья строка статуса; 'none' — без статуса (узкая лента) */
  mode: StatusMode;
  /** Название на щите, если короче, чем text в layout.json (длинное сокращаем, а не уменьшаем кегль) */
  title?: string;
  flag?: FlagMode;
  /** Как держится: на стене/раме модели (по умолчанию), на одной стойке или порталом из двух стоек (нет модели) */
  mount?: 'post' | 'portal';
}

/** Вывески по id из layout.json → signs */
export const SIGN_META: Readonly<Record<string, SignMeta>> = {
  honor: { icon: 'records', mode: 'honor' },
  online: { icon: 'online', mode: 'online', title: 'КТО НА НАБЕРЕЖНОЙ' },
  rotunda: { icon: 'music', mode: 'rotunda', title: 'РОТОНДА · МУЗЫКА' },
  cafe: { icon: 'scroll', mode: 'cafe' },
  cards: { icon: 'cards', mode: 'cards', title: 'ДУРАК · БЛЭКДЖЕК' },
  kurzal: { icon: 'token', mode: 'slots' },
  billiards: { icon: 'ball', mode: 'billiards' },
  wheel: { icon: 'ticket', mode: 'wheel', title: 'КОЛЕСО', mount: 'portal' },
  kalancha: { icon: 'bell-cloud', mode: 'sky', flag: 'sky' },
  paintball: { icon: 'paint', mode: 'paint' },
  fortress: { icon: 'horn', mode: 'fort', flag: 'fort' },
  karting: { icon: 'kart', mode: 'kart' },
  dungeon: { icon: 'dungeon', mode: 'dungeon', flag: 'dungeon' },
  aquapark: { icon: 'slide', mode: 'aqua', title: 'АКВАПАРК' },
  wardrobe: { icon: 'wardrobe', mode: 'wardrobe' },
  plane: { icon: 'compass', mode: 'plane', title: 'АЭРОКЛУБ' },
  jettyarch: { icon: 'lighthouse', mode: 'fishing' },
  semyon: { icon: 'quest-fish', mode: 'semyon', title: 'ЛАВКА СЕМЁНА' },
  sunset: { icon: null, mode: 'none', title: 'ЗАКАТ' },
  udalaya: { icon: null, mode: 'ferry', title: '«УДАЛАЯ»' },
  showcase: { icon: null, mode: 'none' },
  hide: { icon: 'hide-box', mode: 'hide', flag: 'hide' },
  ratrace: { icon: 'rat', mode: 'rats' },
  lastochka: { icon: 'boat', mode: 'boat' },
  regatta: { icon: 'regatta', mode: 'regatta', flag: 'regatta', title: 'РЕГАТА' },
  farmarch: { icon: 'farm-gate', mode: 'farm' },
  farmgate: { icon: 'farm-gate', mode: 'none', title: 'ФЕРМА', mount: 'post' },
};

// ------------------------------------------------------------------------------------------------- раскладка щита
/** Единица раскладки: 1 u = 1/128 высоты щита (в токенах главный щит — 128 css-пикселей). Меньше 0,6 px не берём. */
const unit = (h: number): number => Math.max(h / 128, 0.6);

export interface Frame {
  /** Внешняя обводка, px */
  outline: number;
  /** Кремовый кант, px */
  rim: number;
  radius: number;
  /** Высота маркизы и ширина её полосы */
  awnH: number;
  stripe: number;
  /** Поля внутри (по x и сверху/снизу контента) */
  padX: number;
  padY: number;
  /** Область контента: от низа маркизы до канта */
  top: number;
  bottom: number;
}

export function frameOf(w: number, h: number): Frame {
  const u = unit(h);
  const outline = Math.max(1, Math.round(u));
  const rim = Math.max(2, Math.round(2 * u));
  const awnH = Math.max(6, Math.round(10 * u));
  const top = outline + awnH;
  const bottom = h - outline - rim;
  return {
    outline,
    rim,
    radius: Math.min(Math.round(12 * u), Math.floor(Math.min(w, h) / 2)),
    awnH,
    stripe: Math.max(8, Math.round(22 * u)),
    padX: Math.round(16 * u + rim),
    padY: Math.round(6 * u),
    top,
    bottom,
  };
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Content {
  frame: Frame;
  /** Иконка: центр и внешний радиус (кольца включены); null — без иконки */
  icon: { cx: number; cy: number; r: number } | null;
  /** Левый край текста и доступная ширина (до правого поля) */
  textX: number;
  textW: number;
  /** Кегль названия и его базовая линия */
  titleEm: number;
  titleBase: number;
  /** Строка статуса (null — без статуса): кегль, базовая линия, зона в щите (она же — плашка в атласе статусов), точка */
  status: { em: number; base: number; zone: Rect; dot: { cx: number; cy: number; r: number } } | null;
}

/**
 * Раскладка «иконка + название + строка статуса» на щите w×h px (токены §4). Размеры — доли высоты контента, чтобы щит
 * любой пропорции (у моделей поля от 3:1 до 12:1) читался: название ~46 % высоты контента, статус ~27 %, иконка — на всю
 * высоту. withStatus=false — одна крупная строка по центру (ленты и мелкие таблички).
 */
export function contentOf(w: number, h: number, withIcon: boolean, withStatus: boolean): Content {
  const f = frameOf(w, h);
  const innerTop = f.top + f.padY;
  const innerH = f.bottom - f.padY - innerTop;
  const cy = innerTop + innerH / 2;
  const iconR = innerH / 2;
  const gap = Math.round(innerH * 0.2);
  const icon = withIcon ? { cx: f.padX + iconR, cy, r: iconR } : null;
  const textX = icon ? Math.round(f.padX + 2 * iconR + gap) : f.padX;
  const textW = Math.max(8, w - textX - f.padX);
  if (!withStatus) {
    const em = innerH * 0.62;
    return { frame: f, icon, textX, textW, titleEm: em, titleBase: Math.round(cy + em * 0.36), status: null };
  }
  const titleEm = innerH * 0.46;
  const em = innerH * 0.27;
  const cap = titleEm * 0.72;
  const g = titleEm * 0.24;
  const asc = em * 0.74;
  const desc = em * 0.22;
  const top = cy - (cap + g + asc + desc) / 2;
  const titleBase = Math.round(top + cap);
  const base = Math.round(top + cap + g + asc);
  const zoneTop = Math.round(titleBase + titleEm * 0.16);
  const zone: Rect = { x: textX, y: zoneTop, w: Math.max(8, w - f.padX - textX), h: Math.max(6, Math.round(base + desc + em * 0.1 - zoneTop)) };
  const r = em * 0.36;
  return { frame: f, icon, textX, textW, titleEm, titleBase, status: { em, base, zone, dot: { cx: zone.x + zone.w - r, cy: base - asc / 2, r } } };
}

/** Цвет эмали на высоте y (0…h): вертикальный градиент верх → низ щита */
export function enamelAt(y: number, h: number): string {
  const t = h > 0 ? Math.min(1, Math.max(0, y / h)) : 0;
  const a = [0x13, 0x67, 0x5f];
  const b = [0x0d, 0x52, 0x4d];
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/**
 * Положение знаков моноширинного заголовка: шаг = знак + трекинг, пробел сужен (word-spacing −0,3 em). Возвращает смещения
 * знаков от левого края и полную ширину (без хвостового трекинга).
 */
export function monoRun(text: string, em: number): { xs: number[]; width: number } {
  const xs: number[] = [];
  let x = 0;
  for (const ch of text) {
    xs.push(x);
    x += (SIGN_FONT.mono + SIGN_FONT.letter + (ch === ' ' ? SIGN_FONT.word : 0)) * em;
  }
  return { xs, width: Math.max(0, x - SIGN_FONT.letter * em) };
}

/**
 * Подбор кегля названия под ширину: не меньше minFrac от базового, иначе обрезка с «…» (длинное сокращаем, а не мельчим).
 * Возвращает кегль и текст.
 */
export function fitTitle(text: string, em: number, maxW: number, minFrac = 0.72): { em: number; text: string } {
  let t = text;
  let e = em;
  const w = (s: string, k: number): number => monoRun(s, k).width;
  if (w(t, e) <= maxW) return { em: e, text: t };
  e = Math.max(em * minFrac, Math.min(em, (em * maxW) / w(t, em)));
  while (w(t, e) > maxW + 1e-6 && t.length > 1) t = `${t.slice(0, -2).trimEnd()}…`;
  return { em: e, text: t };
}

// ------------------------------------------------------------------------------------------------ упаковка в атлас
export interface AtlasItem {
  id: string;
  /** Размер в метрах (если fixed — в пикселях) */
  w: number;
  h: number;
  /** Множитель плотности (мелкое и дальнее рисуем грубее) */
  k?: number;
  fixed?: boolean;
}

export interface AtlasRect extends Rect {
  id: string;
}

export interface Atlas {
  /** Пикселей на метр у k = 1 */
  density: number;
  rects: AtlasRect[];
  /** Доля занятой площади */
  fill: number;
}

function shelves(items: readonly AtlasItem[], size: number, pad: number, d: number): AtlasRect[] | null {
  const sized = items.map((it) => ({
    id: it.id,
    w: it.fixed ? it.w : Math.max(8, Math.ceil(it.w * d * (it.k ?? 1))),
    h: it.fixed ? it.h : Math.max(8, Math.ceil(it.h * d * (it.k ?? 1))),
  }));
  sized.sort((a, b) => b.h - a.h || b.w - a.w || (a.id < b.id ? -1 : 1));
  const out: AtlasRect[] = [];
  let x = pad;
  let y = pad;
  let rowH = 0;
  for (const it of sized) {
    if (it.w + 2 * pad > size) return null;
    if (x + it.w + pad > size) {
      x = pad;
      y += rowH + pad;
      rowH = 0;
    }
    if (y + it.h + pad > size) return null;
    out.push({ id: it.id, x, y, w: it.w, h: it.h });
    x += it.w + pad;
    rowH = Math.max(rowH, it.h);
  }
  return out;
}

/**
 * Укладывает холсты в квадратный атлас size×size полками. Плотность (px на метр) подбирается бинарным поиском: самая
 * большая, при которой всё помещается, но не выше maxDensity. Между холстами pad px (чтобы mip-уровни не подмешивали
 * соседей).
 */
export function packAtlas(items: readonly AtlasItem[], size: number, pad: number, maxDensity: number): Atlas {
  let lo = 8;
  let hi = maxDensity;
  let best = shelves(items, size, pad, hi);
  if (best) lo = hi;
  else {
    best = shelves(items, size, pad, lo);
    if (!best) throw new Error(`Вывески не помещаются в атлас ${size}×${size} даже при ${lo} px/м`);
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2;
      const r = shelves(items, size, pad, mid);
      if (r) {
        lo = mid;
        best = r;
      } else hi = mid;
    }
  }
  const used = best.reduce((s, r) => s + r.w * r.h, 0);
  return { density: lo, rects: best, fill: used / (size * size) };
}

// ----------------------------------------------------------------------------------------------- столбы-указатели
/** Куда указывает стрелка в названии: (dx, dz) на карте, север — вверх (−Z) */
const ARROWS: Readonly<Record<string, readonly [number, number]>> = {
  '↑': [0, -1], '↗': [Math.SQRT1_2, -Math.SQRT1_2], '→': [1, 0], '↘': [Math.SQRT1_2, Math.SQRT1_2],
  '↓': [0, 1], '↙': [-Math.SQRT1_2, Math.SQRT1_2], '←': [-1, 0], '↖': [-Math.SQRT1_2, -Math.SQRT1_2],
};

export interface Arrow {
  /** Название без стрелки */
  name: string;
  /** Направление на карте (длина 1) или null, если стрелки в строке нет */
  dir: readonly [number, number] | null;
}

/** «Маяк · Рыбалка ↙» → { name: «Маяк · Рыбалка», dir: юго-запад } */
export function parseArrow(s: string): Arrow {
  const m = /\s*([↑↗→↘↓↙←↖])\s*$/.exec(s);
  if (!m) return { name: s.trim(), dir: null };
  return { name: s.slice(0, m.index).trim(), dir: ARROWS[m[1]] };
}

/** Доска-указатель: высота и размеры в метрах (длина — по числу знаков названия, но не больше PLANK_MAX) */
export const PLANK = { h: 0.4, tip: 0.24, root: 0.1, pitch: 0.44, min: 0.9, max: 2.7 } as const;
const PLANK_EM = 0.36;

export function plankSize(name: string): { w: number; em: number } {
  const em = PLANK.h * PLANK_EM;
  const w = monoRun(name.toUpperCase(), em).width + 2 * 0.11;
  return { w: Math.min(PLANK.max, Math.max(PLANK.min, Math.round(w * 20) / 20)), em };
}

export interface PostPlan {
  /** Высота столба, м */
  height: number;
  /** Доски сверху вниз: название, направление (единичное, по карте), длина, центр по высоте */
  planks: Array<{ name: string; dir: readonly [number, number]; w: number; em: number; y: number }>;
}

/** Угол между направлениями на карте, 0…π */
const turn = (a: readonly [number, number], b: readonly [number, number]): number => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1])));

/**
 * Порядок досок сверху вниз: первая — как в данных, каждая следующая смотрит как можно дальше от предыдущей (равные — по
 * порядку в данных). Доски в 3D друг друга не пересекают (шаг PLANK.pitch 0,44 м при высоте 0,4), но вблизи, с высоты глаз,
 * соседние по высоте доски на соседние стороны света (↖ ← ↙) перекрываются на экране и «режут» друг друга; через одну —
 * на другую сторону — перекрытий в разы меньше (WP14a: S0 — доля перекрытия на экране 0,12 → 0,03).
 */
export function spreadOrder<T extends { dir: readonly [number, number] }>(list: readonly T[]): T[] {
  const left = list.slice();
  const out = left.splice(0, 1);
  while (left.length) {
    const last = out[out.length - 1];
    let best = 0;
    let bestTurn = -1;
    left.forEach((p, k) => {
      const t = turn(p.dir, last.dir);
      if (t > bestTurn + 1e-9) {
        bestTurn = t;
        best = k;
      }
    });
    out.push(...left.splice(best, 1));
  }
  return out;
}

/** Столб из строк layout.json → posts[].arrows: доски через PLANK.pitch сверху вниз (порядок — spreadOrder), колпак выше верхней */
export function planPost(arrows: readonly string[]): PostPlan {
  const n = arrows.length;
  const base = 1.05;
  const top = base + n * PLANK.pitch;
  // без стрелки в строке доска смотрит по кругу, чтобы не слипались
  const list = arrows.map((a, i) => {
    const p = parseArrow(a);
    const dir = p.dir ?? ([Math.cos((i * Math.PI) / 4), Math.sin((i * Math.PI) / 4)] as const);
    const { w, em } = plankSize(p.name);
    return { name: p.name, dir, w, em };
  });
  const planks = spreadOrder(list).map((p, i) => ({ ...p, y: top - PLANK.pitch * (i + 0.5) }));
  // не ниже 3,3 м: заглушка столба из блокаута (layout.json → decor, цилиндр r 0,09 × 3,2) прячется внутри ствола
  return { height: Math.max(top + 0.3, 3.3), planks };
}

// ----------------------------------------------------------------------------------- холсты: размеры и состав атласов
export const HEAD_SIZE = 2048;
export const STATUS_SIZE = 1024;
/** Не плотнее токенов (§5: 640 px/м у главного входа) */
export const DENSITY_MAX = 640;
/** Доски-указатели читают вблизи — рисуем грубее щитов */
export const PLANK_K = 0.8;
export const ATLAS_PAD = 6;
/** Статус и иконку не рисуем на щитах ниже этой высоты, м (две строки не читаются) */
export const MIN_STATUS_H = 0.34;
export const MIN_ICON_H = 0.34;

/** Состав атласа заголовков: белый пиксель для крашеных деталей, щиты по размеру поля, доски столбов по длине названия */
export function headItems(
  signs: ReadonlyArray<{ id: string; w: number; h: number }>,
  posts: ReadonlyArray<{ id: string; arrows: readonly string[] }>,
): { items: AtlasItem[]; plans: PostPlan[] } {
  const items: AtlasItem[] = [{ id: '_white', w: 8, h: 8, fixed: true }];
  for (const s of signs) items.push({ id: s.id, w: s.w, h: s.h });
  const plans = posts.map((p) => {
    const plan = planPost(p.arrows);
    plan.planks.forEach((pk, i) => items.push({ id: `${p.id}.${i}`, w: pk.w, h: PLANK.h, k: PLANK_K }));
    return plan;
  });
  return { items, plans };
}

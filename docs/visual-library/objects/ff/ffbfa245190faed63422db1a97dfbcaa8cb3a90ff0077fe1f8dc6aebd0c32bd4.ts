// «Рыбный двор»: во что превращаются прячущиеся. Размер — один понятный выбор сразу из трёх свойств:
// маленький быстрый, его трудно заметить, но он лопается от одной кляксы; большой медленный и заметный, зато терпит три.
// Коробка предмета (w, d — полуширины по своим осям, h — высота) общая для движения, выстрелов и картинки.
export const HIDE_KINDS = ['bucket', 'pot', 'buoy', 'gnome', 'gull', 'can', 'barrel', 'crate', 'chair', 'sack', 'churn', 'trap', 'bench', 'barrow', 'cart', 'pallet'] as const;
export type HideKind = typeof HIDE_KINDS[number];
export type HideSize = 0 | 1 | 2;
type Gender = 'm' | 'f' | 'n';

export interface HideKindInfo {
  /** Именительный падеж, со строчной: «садовый гном» */
  readonly name: string;
  /** Винительный: «вся краска ушла на садового гнома» */
  readonly acc: string;
  /** Род — для глаголов: «бочка продержалась», «гном продержался» */
  readonly g: Gender;
  readonly size: HideSize;
  readonly w: number;
  readonly d: number;
  readonly h: number;
}

export const HIDE_KIND: Readonly<Record<HideKind, HideKindInfo>> = {
  bucket: { name: 'ведро', acc: 'ведро', g: 'n', size: 0, w: 0.2, d: 0.2, h: 0.4 },
  pot: { name: 'горшок с цветком', acc: 'горшок с цветком', g: 'm', size: 0, w: 0.22, d: 0.22, h: 0.62 },
  buoy: { name: 'буй', acc: 'буй', g: 'm', size: 0, w: 0.26, d: 0.26, h: 0.62 },
  gnome: { name: 'садовый гном', acc: 'садового гнома', g: 'm', size: 0, w: 0.2, d: 0.2, h: 0.58 },
  gull: { name: 'чучело чайки', acc: 'чучело чайки', g: 'n', size: 0, w: 0.3, d: 0.14, h: 0.5 },
  can: { name: 'лейка', acc: 'лейку', g: 'f', size: 0, w: 0.28, d: 0.13, h: 0.38 },
  barrel: { name: 'бочка', acc: 'бочку', g: 'f', size: 1, w: 0.36, d: 0.36, h: 0.92 },
  crate: { name: 'ящик', acc: 'ящик', g: 'm', size: 1, w: 0.36, d: 0.36, h: 0.64 },
  chair: { name: 'стул', acc: 'стул', g: 'm', size: 1, w: 0.25, d: 0.25, h: 0.92 },
  sack: { name: 'мешок', acc: 'мешок', g: 'm', size: 1, w: 0.3, d: 0.22, h: 0.68 },
  churn: { name: 'бидон', acc: 'бидон', g: 'm', size: 1, w: 0.21, d: 0.21, h: 0.74 },
  trap: { name: 'ловушка для крабов', acc: 'ловушку для крабов', g: 'f', size: 1, w: 0.38, d: 0.3, h: 0.42 },
  bench: { name: 'скамейка', acc: 'скамейку', g: 'f', size: 2, w: 0.9, d: 0.32, h: 0.86 },
  barrow: { name: 'тачка', acc: 'тачку', g: 'f', size: 2, w: 0.78, d: 0.34, h: 0.62 },
  cart: { name: 'тележка мороженщика', acc: 'тележку мороженщика', g: 'f', size: 2, w: 0.7, d: 0.42, h: 1.35 },
  pallet: { name: 'поддон с ящиками', acc: 'поддон с ящиками', g: 'm', size: 2, w: 0.6, d: 0.45, h: 1.0 },
};

/** Размер → сколько клякс выдерживает и доля обычной скорости бега. */
export const HIDE_SIZES: readonly { readonly hits: number; readonly speed: number }[] = [
  { hits: 1, speed: 0.95 },
  { hits: 2, speed: 0.85 },
  { hits: 3, speed: 0.75 },
];

export function isHideKind(v: unknown): v is HideKind {
  return typeof v === 'string' && (HIDE_KINDS as readonly string[]).includes(v);
}
export function hideKindIndex(kind: HideKind): number { return HIDE_KINDS.indexOf(kind); }
export function hideKindAt(i: number): HideKind | null { return Number.isInteger(i) && i >= 0 && i < HIDE_KINDS.length ? HIDE_KINDS[i] : null; }
export function hideHits(kind: HideKind): number { return HIDE_SIZES[HIDE_KIND[kind].size].hits; }
export function hideSpeed(kind: HideKind): number { return HIDE_SIZES[HIDE_KIND[kind].size].speed; }

/** Слово в роде предмета: m — «гном продержался», f — «бочка продержалась», n — «ведро продержалось». */
export function hideG(kind: HideKind, m: string, f: string, n: string): string {
  const g = HIDE_KIND[kind].g;
  return g === 'm' ? m : g === 'f' ? f : n;
}
export function hideCap(s: string): string { return s ? s[0].toUpperCase() + s.slice(1) : s; }
export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}

/** Подсказка при наведении: «ведро (быстрое, 1 клякса)». */
export function hideKindHint(kind: HideKind): string {
  const size = HIDE_KIND[kind].size;
  const speed = size === 0 ? hideG(kind, 'быстрый', 'быстрая', 'быстрое') : size === 1 ? hideG(kind, 'средний', 'средняя', 'среднее') : hideG(kind, 'медленный', 'медленная', 'медленное');
  const hits = hideHits(kind);
  return `${HIDE_KIND[kind].name} (${speed}, ${hits} ${plural(hits, 'клякса', 'кляксы', 'клякс')})`;
}

// ------------------------------------------------------------ повороты

/** Поворот предмета — шаг 15° (24 положения): соседние предметы карты стоят так же «ровно». */
export const HIDE_YAW_STEPS = 24;
export function hideYaw(i: number): number { return i * Math.PI / 12; }
export function hideYawIndex(v: unknown): number {
  return typeof v === 'number' && Number.isInteger(v) ? ((v % HIDE_YAW_STEPS) + HIDE_YAW_STEPS) % HIDE_YAW_STEPS : 0;
}
// |cos| для 0°, 15° … 90°: таблица, а не Math.cos — коробки для движения совпадают на сервере и в браузере бит в бит
const COS = [1, 0.9659258262890683, 0.8660254037844387, 0.7071067811865476, 0.5, 0.25881904510252074, 0];
function absCos(i: number): number { const k = i % 12; return COS[k <= 6 ? k : 12 - k]; }
function absSin(i: number): number { const k = i % 12; return COS[k <= 6 ? 6 - k : k - 6]; }

/** Полуразмеры по мировым X/Z повёрнутого предмета (его «осевая» коробка для столкновений). */
export function hideHalf(kind: HideKind, yawIdx: number, out: { x: number; z: number }): { x: number; z: number } {
  const f = HIDE_KIND[kind], c = absCos(yawIdx), s = absSin(yawIdx);
  out.x = f.w * c + f.d * s;
  out.z = f.w * s + f.d * c;
  return out;
}

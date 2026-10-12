// Значок в начале текста уведомления → картинка кита (ui/toasts.ts). Без DOM и без kit/icons.ts — грузится в тестах
// (test/ui-kit.test.ts). Эмодзи сравниваем без «вариантного селектора» U+FE0F: его то пишут, то нет.

/** Начальный эмодзи → id картинки кита (client/ui/kit/icons.ts) */
const RAW: Record<string, string> = {
  '\u{1F327}': 'rain', '\u{26C8}': 'storm', '\u{1F3C1}': 'flag-finish', '\u{1F3F0}': 'shield', '\u{1F400}': 'rat',
  '\u{1F3A3}': 'float', '\u{1F0CF}': 'cards', '\u{1F3B0}': 'roulette', '\u{1F3F4}\u{200D}\u{2620}\u{FE0F}': 'pirate-flag',
  '\u{1F531}': 'gold', '\u{1F381}': 'gift', '\u{1F4E3}': 'horn', '\u{1F3B5}': 'music', '\u{1F6A4}': 'boat', '\u{26F5}': 'regatta',
  '\u{1F331}': 'farm-gate', '\u{1FA99}': 'token',
};
const norm = (s: string): string => s.replace(/\u{FE0F}/gu, '');
const LEAD_ICON = new Map(Object.entries(RAW).map(([k, v]) => [norm(k), v]));
/** Эмодзи в начале: значок, его варианты и склейки (флаг пиратов — 🏴 + ZWJ + ☠ + U+FE0F), оттенки кожи; пробел после */
const LEAD_RE = /^(\p{Extended_Pictographic}(?:\u{FE0F}|\p{Emoji_Modifier}|\u{200D}\p{Extended_Pictographic})*)\s*/u;

/**
 * Что показать в тосте: icon — id картинки по начальному эмодзи ('' — такого нет в списке), title — текст без него.
 * Начальный эмодзи убираем всегда: у тоста всегда своя картинка, эмодзи рядом с ней — повтор.
 */
export function toastLead(text: string): { icon: string; title: string } {
  const lead = LEAD_RE.exec(text);
  if (!lead) return { icon: '', title: text };
  return { icon: LEAD_ICON.get(norm(lead[1])) ?? '', title: text.slice(lead[0].length) };
}

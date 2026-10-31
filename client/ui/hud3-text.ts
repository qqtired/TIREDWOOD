// HUD «Веранда v3» (docs/ui3/brief.md): разбор текста для перестроек разметки client/ui/hud3.ts — без DOM (тест: test/ui3-flag.test.ts).
// Правила — как в лаборатории lab/ui3/v/veranda3-msg.js.
const NEWS = /^(\S+)(?=\s+(?:вытащил|поймал|выиграл|победил|взял|нашёл|нашла|собрал|открыл|добыл|забрал|прош[её]л))/u;
const EMOJI = /^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}️?)*)\s*/u;
const RUN = /\p{Extended_Pictographic}️?(?:[  ]*\p{Extended_Pictographic}️?)+/gu;
const AMOUNT = /^\s*([+\-−]?\d[\d\s ]*)/u;

/** Сумма в начале заголовка награды («+20 🪙 за улов» → +20) и сколько символов срезать; не число — null */
export function leadAmount(text: string): { num: string; len: number } | null {
  const m = AMOUNT.exec(text);
  return m ? { num: m[1].trim(), len: m[0].length } : null;
}

/** Ник в начале новости про игрока («Tester7 вытащил…»); не новость — null */
export function newsNick(text: string): string | null {
  return NEWS.exec(text)?.[1] ?? null;
}

/** Первый эмодзи системной строки чата и сколько символов срезать вместе с пробелом; без эмодзи — null */
export function leadEmoji(text: string): { icon: string; len: number } | null {
  const m = EMOJI.exec(text);
  return m ? { icon: m[1], len: m[0].length } : null;
}

/** Куски строки: текст и плотные блоки из двух и больше эмодзи подряд без пробелов (рецепт крепости «💥 🛡️ 🍒» — одним блоком) */
export function emojiRuns(text: string): { text: string; run: boolean }[] {
  const out: { text: string; run: boolean }[] = [];
  let at = 0;
  for (const m of text.matchAll(RUN)) {
    if (m.index > at) out.push({ text: text.slice(at, m.index), run: false });
    out.push({ text: m[0].replace(/[  ]+/g, ''), run: true });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at), run: false });
  return out;
}

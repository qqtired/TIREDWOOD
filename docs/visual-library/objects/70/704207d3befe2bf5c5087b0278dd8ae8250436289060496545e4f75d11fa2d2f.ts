// Окружение площади без «мерзкого повтора»: шум моря и дождя — длинные петли, у которых конец перетекает в начало
// (раньше петля была в 2 с — ровно раз в две секунды на слух возвращался один и тот же рокот), и крик чайки, каждый
// раз немного другой. Чистая логика без WebAudio — проверяется в node (test/ambience.test.ts); узлы и шины — в audio.ts.

type Rnd = () => number;

/** Длины петель прибоя, с: разные, чтобы петли не совпадали — вместе они повторяются раз в много минут */
export const SURF_LOOPS: readonly number[] = [11, 17];
/** Петля шума дождя, с */
export const RAIN_LOOP = 8;
/** Сколько секунд на стыке петли конец перетекает в начало */
export const LOOP_FADE = 1;
/** Ближние чайки набережной слышны, только если слушатель не дальше (м): на площади их не слышно, у берега — слышно */
export const GULL_NEAR = 14;
/** Пауза между криками ближних чаек, с (от…до, случайно): все чайки вместе — не чаще */
export const GULL_GAP: readonly [number, number] = [7, 15];
/** Далёкая чайка (общий фон): раз в столько секунд (от…до, случайно) */
export const FAR_GULL_EVERY: readonly [number, number] = [14, 40];

/**
 * Шум для петли длиной len отсчётов. Первые fade отсчётов — смесь начала с продолжением шума (тем, что шло бы после
 * конца) по равной мощности: на стыке нет ни щелчка, ни провала громкости. brown — низкий рокот моря (тот же шум, что
 * в audio.ts makeNoise), иначе белый.
 */
export function loopNoise(len: number, fade: number, brown: boolean, rnd: Rnd = Math.random): Float32Array<ArrayBuffer> {
  const f = Math.max(0, Math.min(Math.floor(fade), Math.floor(len / 2)));
  const raw = new Float32Array(len + f);
  let last = 0;
  // «разгон» шума: с нуля он первые отсчёты тише, а на стыке начало и продолжение должны быть одной громкости
  if (brown) for (let i = 0; i < 1000; i++) last = (last + 0.02 * (rnd() * 2 - 1)) / 1.02;
  for (let i = 0; i < raw.length; i++) {
    const w = rnd() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * w) / 1.02;
      raw[i] = last * 3.5;
    } else {
      raw[i] = w;
    }
  }
  const out = raw.slice(0, len);
  for (let i = 0; i < f; i++) {
    const a = ((i + 0.5) / f) * (Math.PI / 2);
    out[i] = raw[i] * Math.sin(a) + raw[len + i] * Math.cos(a);
  }
  return out;
}

/** Слог крика чайки: когда начать (с), на какой высоте (Гц) и насколько громко (0…1) */
export interface GullSyllable {
  at: number;
  base: number;
  gain: number;
}

/**
 * Крик чайки: от одного до трёх слогов, у каждой чайки своя высота, слоги чуть разные и не через равные промежутки —
 * каждый раз не так, как прошлый (раньше все чайки кричали одним и тем же «ки-йа ки-йа»).
 */
export function gullCall(rnd: Rnd = Math.random): GullSyllable[] {
  const n = 1 + Math.floor(rnd() * 3);
  const base = 1050 + rnd() * 350;
  const out: GullSyllable[] = [];
  let at = 0;
  for (let i = 0; i < n; i++) {
    out.push({ at, base: base * (1 + (rnd() - 0.5) * 0.08), gain: (0.7 + rnd() * 0.3) * (i > 0 && i === n - 1 ? 0.75 : 1) });
    at += 0.24 + rnd() * 0.12;
  }
  return out;
}

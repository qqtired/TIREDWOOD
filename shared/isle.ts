// Остров «Последний свет» (флаг сервера ISLE, нужна FISH2): расписание его погоды и сезона, что знает клиент, туман по
// дальности. Где что стоит на острове — shared/maps/isle.ts. Дизайн — docs/superpowers/plans/2026-10-10-fishing-island.md
// §4.3–4.4 (числа — .json, weather).
//  · Туман на острове всегда (видно на 160 м). Событие «Туман наступает» — как дождь у набережной: свой экземпляр
//    Weather (server/lobby/weather.ts, ясно 15–30 мин, туман 4 мин 48 с — 8 мин), видно на 85 м. С дождём площади не связан.
//  · Сезон острова («Великий туман») — раз в 2 часа в нечётные часы по Москве на 10 минут; держит «Туман наступает».
//    Шансы рыб в туман и в сезон применяет рыбалка (shared/fishisle.ts), здесь — только когда.

/** ISLE=1 — включить, ISLE=0 — выключить, без переменной — только с --dev; без рыбалки 2.0 (FISH2) острова нет */
export function isleEnabled(env: string | undefined, dev: boolean, fish2: boolean): boolean {
  return fish2 && (env === undefined ? dev : env === '1');
}

/** Сезон острова: (мс + 4 ч) кратно 2 ч — нечётный час по Москве (сезон набережной — в чётные, сдвиг 3 ч) */
export const ISLE_SEASON_SHIFT_MS = 4 * 3600_000;

/** «На большую землю» у Игната, 🪙 (если нет своей лодки) */
export const ISLE_HOME_PRICE = 250;

/** Сезон острова, как у набережной: идёт ли, конец идущего (или ближайшего), начало следующего — мс серверных часов */
export interface IsleSeasonView {
  on: boolean;
  endsAt: number;
  nextAt: number;
}

/** Что знает клиент: идёт ли «Туман наступает» и до когда (0 — без конца), сезон острова */
export interface IsleView {
  fog: boolean;
  fogUntil: number;
  season: IsleSeasonView;
}

// ------------------------------------------------------------ туман по дальности (§4.3)

/** Обычный туман острова: near, far (м), цвет — жемчужный с тёплым отсветом */
export const ISLE_FOG = { near: 18, far: 160, color: 0xd9d3c9 } as const;
/** «Туман наступает» (и сезон): вдвое ближе, светлее и холоднее */
export const ISLE_FOG_EVENT = { near: 8, far: 85, color: 0xd2d4d6 } as const;
/** Экспозиция у острова: свет мягкий, без солнца и теней */
export const ISLE_EXPOSURE = 0.95;

/** Сколько «погоды острова» в точке (0…1): туман, цвет, без солнца */
export interface IsleClimate {
  /** near/far тумана (м); Infinity — туман набережной как есть */
  near: number;
  far: number;
  /** Насколько цвет неба и тумана — жемчужный (0 — как на набережной) */
  tint: number;
  /** Дымка дальнего берега и кораблей (uHaze), 0…1 */
  haze: number;
  /** Сколько солнца остаётся (1 — как на набережной, 0 — нет) */
  sun: number;
  /** Насколько это уже остров (событие тумана, экспозиция, звук) */
  isle: number;
  /** Насколько стих дождь набережной (у острова своя погода): 0 — идёт как есть, 1 — не слышно и не видно */
  rainMute: number;
}

const ss = (a: number, b: number, x: number): number => {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
const mix = (a: number, b: number, k: number): number => a + (b - a) * k;

/**
 * Погода острова по дальности камеры: dBay — от площади (0; 0), dIsle — от центра острова, ev — «Туман наступает» (0…1,
 * плавно за 20 с). Бухта (до 250 м) — как на набережной; 300–900 м — туман 200→60 / 1 400→450, дымка к 400 м, солнце
 * слабеет; от 1 500 м до границы вод — 60→30 / 450→220, солнца нет; в водах — 18/160 (в событие — 8/85). Переходы плавные.
 */
export function isleClimate(dBay: number, dIsle: number, ev: number, out: IsleClimate = { near: Infinity, far: Infinity, tint: 0, haze: 0, sun: 1, isle: 0, rainMute: 0 }): IsleClimate {
  const kBay = ss(300, 900, dBay);
  const kOpen = ss(1500, 300, dIsle);
  // в водах: от границы (300 м) до 260 м — сгущается до тумана острова
  const kIn = ss(300, 260, dIsle);
  const e = Math.max(0, Math.min(1, ev));
  // событие чувствуется уже на подходе: к 1 000 м — в полную силу у самой границы
  const eNear = e * ss(1000, 300, dIsle);
  const inNear = mix(ISLE_FOG.near, ISLE_FOG_EVENT.near, e);
  const inFar = mix(ISLE_FOG.far, ISLE_FOG_EVENT.far, e);
  const bayNear = dBay < 300 ? Infinity : mix(200, 60, kBay);
  const bayFar = dBay < 300 ? Infinity : mix(1400, 450, kBay);
  const openNear = dIsle > 1500 ? Infinity : mix(60, 30, kOpen) * mix(1, ISLE_FOG_EVENT.near / ISLE_FOG.near, eNear * 0.5);
  const openFar = dIsle > 1500 ? Infinity : mix(450, 220, kOpen) * mix(1, ISLE_FOG_EVENT.far / ISLE_FOG.far, eNear * 0.6);
  let near = Math.min(bayNear, openNear);
  let far = Math.min(bayFar, openFar);
  if (kIn > 0) {
    near = mix(Number.isFinite(near) ? near : 30, inNear, kIn);
    far = mix(Number.isFinite(far) ? far : 220, inFar, kIn);
  }
  out.near = near;
  out.far = far;
  out.isle = Math.max(kOpen, kIn);
  out.tint = Math.max(0.7 * kBay, out.isle);
  out.haze = ss(250, 400, dBay);
  out.sun = (1 - 0.5 * kBay) * (1 - kOpen);
  out.rainMute = ss(250, 600, dBay);
  return out;
}

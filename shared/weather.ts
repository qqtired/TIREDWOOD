// Погода набережной: одно событие дождя — от первых туч до просвета. Когда оно идёт, решает сервер и присылает его
// один раз ({el, dur, seed, k}); силу дождя по времени и молнии каждый клиент считает сам — здесь, одинаково у всех.
// Тот же расчёт молний у шторма маяка: шторм — это просто гроза на максимальной силе.
import { TICK_RATE } from './constants.ts';
import { hash32, hashFloat, makeRng } from './math.ts';

/**
 * Откуда дождь: 0 — пришёл сам, 1 — бубен Семёна (платный — всегда с грозой), 2 — DEV_WEATHER=storm (гроза почти сразу),
 * 3 — сезон рыбалки (особый дождь на 10 минут: быстро набирает силу, гроза — как у обычного, в конце — радуга)
 */
export type RainKind = 0 | 1 | 2 | 3;

/** Событие по сети: el — сколько тиков оно уже идёт, dur — длина в тиках (0 — без конца), seed, k — откуда */
export interface RainWire {
  el: number;
  dur: number;
  seed: number;
  k: RainKind;
}

/** Событие для расчётов: длина в секундах (0 — без конца), сид, откуда */
export interface RainEvent {
  dur: number;
  seed: number;
  k: RainKind;
}

export function rainEvent(w: Pick<RainWire, 'dur' | 'seed' | 'k'>): RainEvent {
  return { dur: Math.max(0, w.dur) / TICK_RATE, seed: w.seed >>> 0, k: w.k === 1 || w.k === 2 || w.k === 3 ? w.k : 0 };
}

/** Сид из строки (id шторма): FNV-1a */
export function seedOf(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** Как идёт событие (все времена — секунды от начала) */
export interface RainPlan {
  /** Длина (Infinity — без конца) */
  dur: number;
  /** Тучи собрались (первые капли — раньше), кончилась морось, дождь набрал силу */
  gather: number;
  drizzle: number;
  build: number;
  /** Обычная сила дождя, 0…1 */
  base: number;
  /** Гроза: пик с молниями — с, по, сила дождя на пике; null — дождь без грозы */
  storm: { from: number; to: number; level: number } | null;
  /** Стихает с, последняя морось с */
  fade: number;
  last: number;
  /** После дождя выйдет солнце и будет радуга */
  rainbow: boolean;
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const ss = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const mix = (a: number, b: number, k: number): number => a + (b - a) * k;

export function rainPlan(ev: RainEvent): RainPlan {
  const r = makeRng((ev.seed ^ 0x5eed5eed) >>> 0);
  const r1 = r(), r2 = r(), r3 = r(), r4 = r(), r5 = r(), r6 = r();
  const base = 0.52 + 0.2 * r1;
  if (!(ev.dur > 0)) return { dur: Infinity, gather: 12, drizzle: 30, build: 50, base, storm: null, fade: Infinity, last: Infinity, rainbow: false };
  const D = ev.dur;
  if (ev.k === 2) {
    const to = Math.max(40, D - 45);
    return { dur: D, gather: 4, drizzle: 10, build: 16, base, storm: { from: 20, to, level: 0.95 + 0.05 * r5 }, fade: Math.min(to + 8, D - 16), last: D - 12, rainbow: true };
  }
  const drum = ev.k === 1;
  // бубен и сезон рыбалки набирают силу быстро — событие короткое, ждать его некогда
  const quick = drum || ev.k === 3;
  const gather = quick ? 10 : clamp(0.055 * D, 8, 24);
  const drizzle = gather + (quick ? 14 : clamp(0.11 * D, 10, 45));
  const build = drizzle + (quick ? 14 : clamp(0.09 * D, 8, 35));
  let storm: RainPlan['storm'] = null;
  // гроза — примерно в половине обычных дождей; бубен платный — у него всегда, и пораньше
  if (drum || r2 < 0.5) {
    const from = drum ? build + 6 : build + Math.max(0, D * 0.62 - build) * (0.15 + 0.5 * r3);
    const to = Math.min(D * 0.8, from + (drum ? clamp(0.4 * D, 80, 160) : clamp(D * (0.22 + 0.12 * r4), 45, 140)));
    storm = { from, to, level: 0.9 + 0.1 * r5 };
  }
  const last = D - clamp(0.07 * D, 6, 30);
  const fade = Math.min(last - 4, Math.max(storm ? storm.to + 12 : 0, D * 0.74));
  return { dur: D, gather, drizzle, build, base, storm, fade, last, rainbow: (ev.k === 0 && r6 < 0.5) || ev.k === 3 };
}

/** Насколько сейчас гроза (0…1): нарастает 14 с до пика, спадает 16 с после */
export function thunderAt(p: RainPlan, t: number): number {
  const s = p.storm;
  return s ? ss((t - s.from + 14) / 14) * (1 - ss((t - s.to) / 16)) : 0;
}

/** Плавный шум 0…1: порывы ветра и колебания дождя */
function wobble(seed: number, x: number): number {
  const i = Math.floor(x);
  return mix(hashFloat(seed, i), hashFloat(seed, i + 1), ss(x - i));
}

/** Погода в момент: rain — сила дождя, overcast — тучи, dark — сумрак сверх обычного дождя, wind — ветер, thunder — гроза */
export interface RainSample {
  rain: number;
  overcast: number;
  dark: number;
  wind: number;
  thunder: number;
}

export const emptySample = (): RainSample => ({ rain: 0, overcast: 0, dark: 0, wind: 0, thunder: 0 });

/** Погода события ev (по плану p) через t секунд от начала; out переиспользуется. */
export function rainAt(ev: RainEvent, p: RainPlan, t: number, out: RainSample = emptySample()): RainSample {
  if (!(t >= 0) || t > p.dur) {
    out.rain = out.overcast = out.dark = out.wind = out.thunder = 0;
    return out;
  }
  let r: number;
  if (t < p.gather) r = 0.1 * ss((t - 0.35 * p.gather) / (0.65 * p.gather));
  else if (t < p.drizzle) r = mix(0.1, 0.3, ss((t - p.gather) / (p.drizzle - p.gather)));
  else r = mix(0.3, p.base, ss((t - p.drizzle) / (p.build - p.drizzle)));
  const th = thunderAt(p, t);
  if (p.storm) r = mix(r, p.storm.level, th);
  if (t > p.fade) r = mix(r, 0.14, ss((t - p.fade) / (p.last - p.fade)));
  if (t > p.last) r = mix(0.14, 0.02, ss((t - p.last) / (p.dur - p.last)));
  // порывы: то сильнее, то слабее (не в самом начале)
  const g = wobble(ev.seed, t / 7) * 0.65 + wobble(ev.seed ^ 0x77, t / 2.3) * 0.35;
  r = clamp(r * (1 + 0.24 * (g - 0.5) * ss((t - p.gather) / 10)), 0, 1);
  let o = t < p.gather ? 0.85 * ss(t / p.gather) : 0.85 + 0.15 * ss((r - 0.3) / 0.6);
  if (t > p.last) o = mix(o, 0.5, ss((t - p.last) / (p.dur - p.last)));
  out.rain = r;
  out.overcast = o;
  out.thunder = th;
  out.dark = 0.34 * th + 0.1 * ss((r - 0.55) / 0.35);
  out.wind = clamp(0.12 + 0.72 * r + 0.25 * th + 0.3 * (g - 0.5), 0, 1.2);
  if (t < p.gather) out.wind = Math.max(out.wind, 0.5 * ss(t / p.gather));
  return out;
}

/** Шторм маяка как погода: f — сила шторма (0…1, shared/storm.ts stormForce) */
export function stormSample(f: number, out: RainSample = emptySample()): RainSample {
  out.overcast = clamp(f * 1.7, 0, 1);
  out.rain = ss((f - 0.3) / 0.55);
  out.dark = 0.58 * ss((f - 0.45) / 0.55);
  out.wind = clamp(0.2 + 0.9 * f, 0, 1.1);
  out.thunder = ss((f - 0.8) / 0.2);
  return out;
}

// ------------------------------------------------------------ молнии

/** Удар молнии (или далёкая гроза) */
export interface Strike {
  /** Когда: секунды от начала события (у шторма — от начала фазы) */
  t: number;
  x: number;
  z: number;
  /** Сила 0.5…1: яркость вспышки и громкость грома */
  power: number;
  /** Далёкая гроза: разряда не видно, только отсвет в тучах и долгий низкий гром */
  far: boolean;
  /** Форма разряда */
  shape: number;
}

/** Баркас «Альбатрос» на якоре: иногда молния бьёт рядом — видно с палубы */
export const BARKAS_AT = { x: -60, z: 68 };
/** Куда молнии не бьют (x0, x1, z0, z1): аквапарк, мостки с маяком, отмелью и причалом Семёна, баркас */
const KEEP_OUT: ReadonlyArray<readonly [number, number, number, number]> = [
  [-95, -33.5, 6, 39],
  [-24.5, -11.5, 21.5, 46.5],
  [-74.5, -45.5, 64, 72],
];
/** Не ближе стольких метров к людным местам (и к игроку — это клиент) */
export const STRIKE_CLEAR = 25;

/** До суши, м: площадь и город — всё восточнее x = −30 и севернее z = 22; дальний берег на юге и острова на западе. */
export function landDist(x: number, z: number): number {
  if (z > 470 || x < -360) return 0;
  return Math.hypot(Math.max(0, -30 - x), Math.max(0, z - 22));
}

/** Сюда молния может ударить: открытое море, не ближе STRIKE_CLEAR к людным местам и не ближе 30 м к суше. */
export function strikeClear(x: number, z: number): boolean {
  if (landDist(x, z) < STRIKE_CLEAR + 5) return false;
  for (const [x0, x1, z0, z1] of KEEP_OUT) {
    if (Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1)) < STRIKE_CLEAR) return false;
  }
  return true;
}

/** Из середины площади (0, 10) по направлению (dx, dz): через сколько метров кончается суша */
function landExit(dx: number, dz: number): number {
  const tx = dx < 0 ? 30 / -dx : Infinity;
  const tz = dz > 0 ? 12 / dz : Infinity;
  return Math.min(tx, tz);
}

/** Разряд в море: обычно в 60–250 м от берега, иногда ближе, иногда у баркаса; всегда видно с площади (юг…запад). */
function bolt(rng: () => number, t: number, close: number): Strike {
  const power = 0.65 + 0.35 * rng();
  const shape = hash32(Math.floor(rng() * 4294967296), 7);
  for (let tries = 0; tries < 8; tries++) {
    const u = rng();
    let x: number, z: number;
    if (u < 0.12) {
      const a = -0.2 + 2.1 * rng();
      const d = 42 + 16 * rng();
      x = BARKAS_AT.x - Math.sin(a) * d;
      z = BARKAS_AT.z + Math.cos(a) * d;
    } else {
      const off = u < 0.12 + close ? 32 + 28 * rng() : 60 + 190 * rng();
      const phi = -0.45 + 2.35 * rng();
      const dx = -Math.sin(phi), dz = Math.cos(phi);
      const d = landExit(dx, dz) + off;
      x = dx * d;
      z = 10 + dz * d;
    }
    if (strikeClear(x, z)) return { t, x, z, power, far: false, shape };
  }
  return { t, x: -40, z: 240, power, far: false, shape };
}

/** Далёкая гроза: за горизонтом или над горами, 650–1300 м */
function rumble(rng: () => number, t: number): Strike {
  const phi = -0.8 + 2.6 * rng();
  const d = 650 + 650 * rng();
  return { t, x: -Math.sin(phi) * d, z: 10 + Math.cos(phi) * d, power: 0.5 + 0.4 * rng(), far: true, shape: hash32(Math.floor(rng() * 4294967296), 3) };
}

/**
 * Молнии события по порядку: перед пиком — далёкие раскаты (гроза подходит), на пике — удары каждые 8–25 с (иногда
 * вместо удара только гром), после — пара раскатов вдали. Разряды — только на пике и только в море.
 */
export function rainStrikes(ev: RainEvent, p: RainPlan = rainPlan(ev)): Strike[] {
  const s = p.storm;
  if (!s) return [];
  const rng = makeRng((ev.seed ^ 0x11970) >>> 0);
  const out: Strike[] = [];
  for (let t = Math.max(p.gather, s.from - 50) + rng() * 8; t < s.from - 4; t += 12 + rng() * 16) out.push(rumble(rng, t));
  const [g0, g1] = ev.k === 2 ? [6, 16] : [8, 25];
  for (let t = s.from + 2 + rng() * 4; t < s.to - 3; t += g0 + rng() * (g1 - g0)) out.push(rng() < 0.2 ? rumble(rng, t) : bolt(rng, t, 0.28));
  for (let t = s.to + 6 + rng() * 6; t < Math.min(p.dur - 2, s.to + 45); t += 14 + rng() * 14) out.push(rumble(rng, t));
  return out;
}

/** Молнии шторма маяка (максимальная сила): от начала фазы «шторм», чаще и ближе; dur — сколько длится фаза, с. */
export function stormStrikes(seed: number, dur: number): Strike[] {
  const rng = makeRng((seed ^ 0x570f) >>> 0);
  const out: Strike[] = [];
  for (let t = 2.5 + rng() * 2; t < dur - 1; t += 6 + rng() * 9) out.push(rng() < 0.15 ? rumble(rng, t) : bolt(rng, t, 0.3));
  return out;
}

/** Пока шторм только идёт (предупреждение): три раската вдали, всё ближе и громче. dur — длина предупреждения, с. */
export function stormRumbles(seed: number, dur: number): Strike[] {
  const rng = makeRng((seed ^ 0x9a1f) >>> 0);
  return [0.32, 0.6, 0.86].map((k, i) => ({ ...rumble(rng, dur * k + rng() * 3), power: 0.45 + 0.18 * i }));
}

// Графика по пунктам (меню → Графика): разрешение, тени, эффекты и частицы, дальность, ограничение кадров.
// «Качество картинки» (Авто / Высокое / Среднее / Низкое) — только пресет: он выставляет все пункты, а правка пункта
// вручную делает «Своё». Модуль без three.js и DOM (его проверяют тесты): здесь считается, что именно действует сейчас
// (resolveGfx), а применяют это App (разрешение, FPS), Renderer (тени, дальность) и частицы (gfx.fx, fxCount).
import type { Quality } from '../settings.ts';
import { sceneQuality } from './quality.ts';

/** Уровень детализации, который App раздаёт сценам (их setQuality): точечные лампы, чайки, мелкие детали, толпа */
export type Tier = Exclude<Quality, 'auto'>;
export type ShadowLevel = 'off' | 'low' | 'high';
export type EffectsLevel = 'less' | 'normal' | 'more';
/** Дальность прорисовки: «далеко» — как задумала сцена, ближе — туман подступает раньше, а то, что за ним, не рисуется */
export type DistanceLevel = 'near' | 'mid' | 'far';
/** Ограничение кадров в секунду: 0 — без ограничения */
export type FpsCap = 0 | 60 | 30;

export const SHADOW_LEVELS: readonly ShadowLevel[] = ['off', 'low', 'high'];
export const EFFECTS_LEVELS: readonly EffectsLevel[] = ['less', 'normal', 'more'];
export const DISTANCE_LEVELS: readonly DistanceLevel[] = ['near', 'mid', 'far'];
export const FPS_CAPS: readonly FpsCap[] = [0, 60, 30];

/** Пункты меню «Графика» (всё, что игрок крутит руками) */
export interface GfxItems {
  /** Разрешение рендера: доля родного разрешения экрана (но не выше двойного), 0,25…1 — см. minScale */
  renderScale: number;
  shadows: ShadowLevel;
  effects: EffectsLevel;
  viewDistance: DistanceLevel;
  fpsCap: FpsCap;
}

/** Что из настроек нужно, чтобы понять, чем играем: пресет, «Своё» и сами пункты */
export interface GfxSource extends GfxItems {
  quality: Quality;
  custom: boolean;
}

/** Чем играем сейчас */
export interface GfxState extends GfxItems {
  /** Пикселей рендера на пиксель экрана (WebGLRenderer.setPixelRatio) */
  ratio: number;
  /** Уровень детализации для сцен — из эффектов и теней (tierOf), у пресетов совпадает с пресетом */
  tier: Tier;
  /** «Авто»: разрешение подбирает игра по кадрам, а не пункт «Разрешение» */
  auto: boolean;
}

/** Где живёт то, что надо знать кроме настроек */
export interface GfxEnv {
  dpr: number;
  /** Разрешение, до которого «Авто» дошло сейчас, и с чего начинало */
  autoRatio: number;
  autoStart: number;
  touch: boolean;
}

/** Больше двух пикселей на пиксель экрана не рисуем (на экранах 3×–4× это только лишний жар), меньше половины — тоже */
export const MAX_RATIO = 2;
export const MIN_RATIO = 0.5;
export const SCALE_STEP = 0.05;

/** Родное разрешение для рендера: пикселей на пиксель экрана, но не больше двух */
export function nativeRatio(dpr: number): number {
  return Math.min(Number.isFinite(dpr) && dpr > 0 ? dpr : 1, MAX_RATIO);
}

/** Самый малый масштаб, который можно выбрать: на обычном экране 50 %, на плотном (×2) — 25 %, чтобы рендер не падал ниже 0,5 пикселя на пиксель */
export function minScale(dpr: number): number {
  const m = MIN_RATIO / Math.max(nativeRatio(dpr), 1);
  return Math.min(0.5, Math.round(Math.ceil(m / SCALE_STEP - 1e-9) * SCALE_STEP * 100) / 100);
}

export function clampScale(v: number, dpr: number): number {
  return Math.min(1, Math.max(minScale(dpr), Number.isFinite(v) ? v : 1));
}

/** Пиксель-рацио без плавающего шума (1,25, а не 1,2500000000000002): иначе лишний пересчёт размера */
const roundRatio = (r: number): number => Math.round(r * 1000) / 1000;

/** Во сколько раз больше частиц, чем «обычно» (по набережной это дождь, салют, фонтаны, конфетти, брызги) */
export const EFFECTS_K: Record<EffectsLevel, number> = { less: 0.5, normal: 1, more: 1.5 };

/** Дальность: на сколько умножаем расстояния тумана и ближе-дальнюю плоскость камеры */
export const VIEW_K: Record<DistanceLevel, number> = { far: 1, mid: 0.6, near: 0.3 };

/** «Низкие» тени — карта не больше этого размера (у сцен — 2048 и 4096) */
export const LOW_SHADOW_SIZE = 1024;

/**
 * Уровень детализации сцен по пунктам: «эффекты» и «тени» решают, нужны ли точечные лампы, чайки и мелкие детали.
 * Совпадает с пресетами: Высокое (обычно + высокие тени) — высокий, Среднее (меньше + высокие) — средний, Низкое (меньше + низкие) — низкий.
 */
export function tierOf(i: Pick<GfxItems, 'effects' | 'shadows'>): Tier {
  const score = (i.effects === 'less' ? 0 : 1) + (i.shadows === 'high' ? 1 : 0);
  return score >= 2 ? 'high' : score === 1 ? 'medium' : 'low';
}

/**
 * Пункты пресета. Разрешение — как было у пресетов: высокое — родное (не выше двойного), среднее — не выше 1,25,
 * низкое — три четверти пикселя экрана.
 */
export function presetItems(tier: Tier, dpr: number): GfxItems {
  const nat = nativeRatio(dpr);
  const rel = (ratio: number): number => ratio / nat;
  if (tier === 'low') return { renderScale: rel(Math.min(dpr, 1) * 0.75), shadows: 'low', effects: 'less', viewDistance: 'far', fpsCap: 0 };
  if (tier === 'medium') return { renderScale: rel(Math.min(dpr, 1.25)), shadows: 'high', effects: 'less', viewDistance: 'far', fpsCap: 0 };
  return { renderScale: 1, shadows: 'high', effects: 'normal', viewDistance: 'far', fpsCap: 0 };
}

/** Что действует сейчас: у «Своё» — пункты из настроек, у пресета — его значения, у «Авто» — то, до чего дошла игра */
export function resolveGfx(s: GfxSource, env: GfxEnv): GfxState {
  const nat = nativeRatio(env.dpr);
  if (s.custom) {
    const items: GfxItems = { renderScale: clampScale(s.renderScale, env.dpr), shadows: s.shadows, effects: s.effects, viewDistance: s.viewDistance, fpsCap: s.fpsCap };
    return { ...items, ratio: roundRatio(nat * items.renderScale), tier: tierOf(items), auto: false };
  }
  const tier = sceneQuality(s.quality, env.autoRatio, env.autoStart, env.touch);
  const items = presetItems(tier, env.dpr);
  const auto = s.quality === 'auto';
  const ratio = auto ? env.autoRatio : roundRatio(nat * items.renderScale);
  return { ...items, renderScale: ratio / nat, ratio, tier, auto };
}

/** Настройки, которые меняет игрок: пресет, «Своё» и пункты */
export type GfxWritable = GfxSource;

/**
 * Игрок правит пункт: если до этого был пресет — его нынешние значения (cur) становятся пунктами настроек и включается
 * «Своё» (внешний вид не меняется), и уже поверх — правка.
 */
export function editGfx(s: GfxWritable, cur: GfxItems, patch: Partial<GfxItems>): void {
  if (!s.custom) {
    s.custom = true;
    s.renderScale = cur.renderScale;
    s.shadows = cur.shadows;
    s.effects = cur.effects;
    s.viewDistance = cur.viewDistance;
    s.fpsCap = cur.fpsCap;
  }
  Object.assign(s, patch);
}

/** Игрок выбрал пресет: он выставляет все пункты, «Своё» выключается */
export function pickPreset(s: GfxWritable, q: Quality): void {
  s.quality = q;
  s.custom = false;
}

/** «Своё» нажали, не трогая пункты: берём то, что действует, как есть */
export function pickCustom(s: GfxWritable, cur: GfxItems): void {
  editGfx(s, cur, {});
}

/**
 * Ограничитель кадров. allow(now, cap): рисовать ли этот кадр. Расписание держится на своём темпе, а не «от прошлого
 * кадра»: на экране 144 Гц и ограничении 60 выходит около 57 кадров, а не 48. Кадр браузера может прийти на миллисекунду
 * раньше срока — это допуск.
 */
export class FrameLimiter {
  private next = 0;

  allow(now: number, cap: number): boolean {
    if (!(cap > 0)) {
      this.next = 0;
      return true;
    }
    if (now + 1 < this.next) return false;
    const step = 1000 / cap;
    // отстали больше чем на кадр (вкладка спала, шейдеры компилировались) — расписание заново, пачку кадров не догоняем
    this.next = now - this.next > step ? now + step : this.next + step;
    return true;
  }
}

/**
 * То, что читают частицы, пока им нет дела до меню: множитель из «Эффектов и частиц». App ставит его при любой
 * смене настроек, частицы читают при каждом залпе (поэтому действует сразу, без перезагрузки).
 */
export const gfx = { fx: 1 };

/** Сколько частиц пускать вместо n: 0 остаётся 0, а непустой залп не пропадает совсем */
export function fxCount(n: number): number {
  return n > 0 ? Math.max(1, Math.round(n * gfx.fx)) : 0;
}

/** Для частиц, что рождаются по одной: оставить ли эту. «Меньше» пропускает часть, «больше» таким способом не получить */
export function fxKeep(): boolean {
  return gfx.fx >= 1 || Math.random() < gfx.fx;
}

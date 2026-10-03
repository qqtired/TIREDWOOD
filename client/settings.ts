// Настройки игрока — хранятся в localStorage этого браузера. Ключ прежний: новые поля дописываются со значениями
// по умолчанию, старые сохранения читаются как были.

import { DISTANCE_LEVELS, EFFECTS_LEVELS, FPS_CAPS, SHADOW_LEVELS, type DistanceLevel, type EffectsLevel, type FpsCap, type ShadowLevel } from './render/gfx.ts';

export type Quality = 'auto' | 'high' | 'medium' | 'low';
/** Сообщения чата на экране: тают через несколько секунд, видны всегда или скрыты (видно, пока чат открыт — Enter) */
export type ChatFeed = 'fade' | 'keep' | 'hide';

export interface Settings {
  /** Версия набора настроек в сохранении (SETTINGS_VERSION): по ней прежние значения по умолчанию меняются на новые, а выбор игрока остаётся */
  ver: number;
  sens: number;
  adsSens: number;
  fov: number;
  volume: number;
  /** «Без звука» (клавиша M и флажок в меню): громкость при этом не трогаем — включили, и звук прежний */
  muted: boolean;
  /** Качество картинки — пресет: выставляет все пункты графики ниже. «Авто» подбирает разрешение само */
  quality: Quality;
  /** «Своё»: пункты графики заданы вручную и от пресета не зависят (сам пресет остаётся как был) */
  custom: boolean;
  /** Разрешение рендера: доля родного разрешения экрана (не выше двойного), 0,25…1 — действует при «Своё» */
  renderScale: number;
  /** Тени: выкл / низкие / высокие */
  shadows: ShadowLevel;
  /** Эффекты и частицы: меньше / обычно / больше (дождь, салют, фонтаны, брызги) */
  effects: EffectsLevel;
  /** Дальность прорисовки: ближе / средне / далеко */
  viewDistance: DistanceLevel;
  /** Ограничение кадров в секунду: 0 — без ограничения, 60 или 30 */
  fpsCap: FpsCap;
  showStats: boolean;
  /** Эффекты (выстрелы, шаги, моторы, удары) — доля от общей громкости */
  sfxVolume: number;
  /** Окружение (море, чайки, ветер, дождь, гром) — доля от общей громкости */
  ambVolume: number;
  /** Музыка (музыкальный автомат на площади и другая музыка в мире) — доля от общей громкости */
  musicVolume: number;
  /** Интерфейс (кнопки, уведомления, монетки) — доля от общей громкости */
  uiVolume: number;
  /** Мышь (палец) вверх — взгляд вниз */
  invertY: boolean;
  /** Подсказки клавиш на экране: полоска эмоций, строки «W — газ …» в режимах */
  keyHints: boolean;
  /** Масштаб меню, чата, жетонов, «кто где» и уведомлений */
  uiScale: number;
  chatFeed: ChatFeed;
}

const KEY = 'opus.settings.v1';

/**
 * Версия сохранения. Сохранение целиком пишется при каждом входе, и по значению нельзя отличить «ползунок не трогали» от
 * «выбрали именно это». Поэтому у сохранения есть версия: без неё (1) значение, равное прежнему умолчанию, считаем
 * нетронутым и заменяем новым умолчанием.
 *   1 — до версий: музыка по умолчанию 0,8;
 *   2 — музыка по умолчанию 0,5 (на 0,8 музыка в меню и на набережной заглушала остальное).
 */
export const SETTINGS_VERSION = 2;
/** Музыка по умолчанию в сохранениях до версии 2 */
const OLD_MUSIC_DEFAULT = 0.8;

/** Размеры интерфейса на выбор (меню → Интерфейс) */
export const UI_SCALES = [0.9, 1, 1.15, 1.3] as const;

export const DEFAULTS: Settings = {
  ver: SETTINGS_VERSION,
  sens: 1,
  adsSens: 0.8,
  // горизонтальный угол обзора для экрана 16:9 (на других пропорциях — тот же вертикальный)
  fov: 95,
  volume: 0.7,
  muted: false,
  quality: 'auto',
  custom: false,
  renderScale: 1,
  shadows: 'high',
  effects: 'normal',
  viewDistance: 'far',
  fpsCap: 0,
  showStats: true,
  sfxVolume: 1,
  ambVolume: 1,
  musicVolume: 0.5,
  uiVolume: 1,
  invertY: false,
  keyHints: true,
  uiScale: 1,
  chatFeed: 'fade',
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const s = { ...DEFAULTS, ...parsed };
    const from = typeof parsed.ver === 'number' && Number.isFinite(parsed.ver) ? parsed.ver : 1;
    s.sens = clampNum(s.sens, 0.1, 6, DEFAULTS.sens);
    s.adsSens = clampNum(s.adsSens, 0.2, 2, DEFAULTS.adsSens);
    s.fov = clampNum(s.fov, 70, 120, DEFAULTS.fov);
    s.volume = clampNum(s.volume, 0, 1, DEFAULTS.volume);
    s.muted = s.muted === true;
    if (!['auto', 'high', 'medium', 'low'].includes(s.quality)) s.quality = 'auto';
    // пункты графики появились позже пресета: в старом сохранении их нет — пресет решает всё, как раньше
    s.custom = s.custom === true;
    s.renderScale = clampNum(s.renderScale, 0.25, 1, DEFAULTS.renderScale);
    if (!SHADOW_LEVELS.includes(s.shadows)) s.shadows = DEFAULTS.shadows;
    if (!EFFECTS_LEVELS.includes(s.effects)) s.effects = DEFAULTS.effects;
    if (!DISTANCE_LEVELS.includes(s.viewDistance)) s.viewDistance = DEFAULTS.viewDistance;
    if (!FPS_CAPS.includes(s.fpsCap)) s.fpsCap = DEFAULTS.fpsCap;
    if (typeof s.showStats !== 'boolean') s.showStats = DEFAULTS.showStats;
    s.sfxVolume = clampNum(s.sfxVolume, 0, 1, DEFAULTS.sfxVolume);
    s.ambVolume = clampNum(s.ambVolume, 0, 1, DEFAULTS.ambVolume);
    s.musicVolume = clampNum(s.musicVolume, 0, 1, DEFAULTS.musicVolume);
    // 0,8 в сохранении без версии — прежнее умолчание: ползунок «Музыка» не трогали, теперь там 0,5. Свои значения не трогаем
    if (from < 2 && Math.abs(s.musicVolume - OLD_MUSIC_DEFAULT) < 1e-9) s.musicVolume = DEFAULTS.musicVolume;
    // интерфейс раньше звучал вместе с эффектами: в старом сохранении его доля — та же, что у эффектов
    s.uiVolume = clampNum(parsed.uiVolume, 0, 1, s.sfxVolume);
    s.invertY = s.invertY === true;
    s.keyHints = s.keyHints !== false;
    s.uiScale = nearestScale(clampNum(s.uiScale, UI_SCALES[0], UI_SCALES[UI_SCALES.length - 1], DEFAULTS.uiScale));
    if (!['fade', 'keep', 'hide'].includes(s.chatFeed)) s.chatFeed = DEFAULTS.chatFeed;
    s.ver = SETTINGS_VERSION;
    return s;
  } catch {
    return { ...DEFAULTS };
  }
}

/** Громкость, с которой играет звук: при «без звука» — ноль, сама настройка остаётся как была. */
export function effectiveVolume(s: Pick<Settings, 'volume' | 'muted'>): number {
  return s.muted ? 0 : s.volume;
}

/**
 * M: «без звука» ⇄ звук. Возвращает новое состояние. Громкость не трогаем, кроме одного случая: ползунок стоял на нуле,
 * а звук просят включить — тогда возвращаем обычную громкость, иначе «звук включён» осталось бы без звука.
 */
export function toggleMute(s: Pick<Settings, 'volume' | 'muted'>): boolean {
  s.muted = !s.muted;
  if (!s.muted && s.volume <= 0) s.volume = DEFAULTS.volume;
  return s.muted;
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // приватный режим — просто не запоминаем
  }
}

function clampNum(v: unknown, lo: number, hi: number, def: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : def;
  return Math.min(hi, Math.max(lo, n));
}

/** Ближайший из предложенных размеров интерфейса */
function nearestScale(v: number): number {
  let best: number = UI_SCALES[0];
  for (const k of UI_SCALES) if (Math.abs(k - v) < Math.abs(best - v)) best = k;
  return best;
}

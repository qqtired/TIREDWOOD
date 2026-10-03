// Настройки игрока — хранятся в localStorage этого браузера. Ключ прежний: новые поля дописываются со значениями
// по умолчанию, старые сохранения читаются как были.

export type Quality = 'auto' | 'high' | 'medium' | 'low';
/** Сообщения чата на экране: тают через несколько секунд, видны всегда или скрыты (видно, пока чат открыт — Enter) */
export type ChatFeed = 'fade' | 'keep' | 'hide';

export interface Settings {
  sens: number;
  adsSens: number;
  fov: number;
  volume: number;
  /** «Без звука» (клавиша M и флажок в меню): громкость при этом не трогаем — включили, и звук прежний */
  muted: boolean;
  quality: Quality;
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

/** Размеры интерфейса на выбор (меню → Интерфейс) */
export const UI_SCALES = [0.9, 1, 1.15, 1.3] as const;

export const DEFAULTS: Settings = {
  sens: 1,
  adsSens: 0.8,
  // горизонтальный угол обзора для экрана 16:9 (на других пропорциях — тот же вертикальный)
  fov: 95,
  volume: 0.7,
  muted: false,
  quality: 'auto',
  showStats: true,
  sfxVolume: 1,
  ambVolume: 1,
  musicVolume: 0.8,
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
    s.sens = clampNum(s.sens, 0.1, 6, DEFAULTS.sens);
    s.adsSens = clampNum(s.adsSens, 0.2, 2, DEFAULTS.adsSens);
    s.fov = clampNum(s.fov, 70, 120, DEFAULTS.fov);
    s.volume = clampNum(s.volume, 0, 1, DEFAULTS.volume);
    s.muted = s.muted === true;
    if (!['auto', 'high', 'medium', 'low'].includes(s.quality)) s.quality = 'auto';
    if (typeof s.showStats !== 'boolean') s.showStats = DEFAULTS.showStats;
    s.sfxVolume = clampNum(s.sfxVolume, 0, 1, DEFAULTS.sfxVolume);
    s.ambVolume = clampNum(s.ambVolume, 0, 1, DEFAULTS.ambVolume);
    s.musicVolume = clampNum(s.musicVolume, 0, 1, DEFAULTS.musicVolume);
    // интерфейс раньше звучал вместе с эффектами: в старом сохранении его доля — та же, что у эффектов
    s.uiVolume = clampNum(parsed.uiVolume, 0, 1, s.sfxVolume);
    s.invertY = s.invertY === true;
    s.keyHints = s.keyHints !== false;
    s.uiScale = nearestScale(clampNum(s.uiScale, UI_SCALES[0], UI_SCALES[UI_SCALES.length - 1], DEFAULTS.uiScale));
    if (!['fade', 'keep', 'hide'].includes(s.chatFeed)) s.chatFeed = DEFAULTS.chatFeed;
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

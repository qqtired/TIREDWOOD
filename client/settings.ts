// Настройки игрока — хранятся в localStorage этого браузера.

export type Quality = 'auto' | 'high' | 'medium' | 'low';

export interface Settings {
  sens: number;
  adsSens: number;
  fov: number;
  volume: number;
  /** «Без звука» (клавиша M и флажок в паузе): громкость при этом не трогаем — включили, и звук прежний */
  muted: boolean;
  quality: Quality;
  showStats: boolean;
}

const KEY = 'opus.settings.v1';

export const DEFAULTS: Settings = {
  sens: 1,
  adsSens: 0.8,
  // горизонтальный угол обзора для экрана 16:9 (на других пропорциях — тот же вертикальный)
  fov: 95,
  volume: 0.7,
  muted: false,
  quality: 'auto',
  showStats: true,
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

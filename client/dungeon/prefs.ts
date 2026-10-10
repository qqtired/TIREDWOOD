// «Подземелье»: настройки игрока режима (звук режима, звук опыта) — в localStorage этого браузера.
// Хранилище может быть недоступно (приватное окно, запрет сайта): тогда работают значения по умолчанию.
const KEY = 'dg.prefs.v1';

export interface DgPrefs {
  /** все звуки режима (фон, удары, интерфейс) */
  sound: boolean;
  /** «динь» подбора опыта */
  xp: boolean;
}

const DEFAULTS: DgPrefs = { sound: true, xp: true };
const subs = new Set<(p: DgPrefs) => void>();

function load(): DgPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const o = JSON.parse(raw) as Partial<DgPrefs>;
    return { sound: o.sound !== false, xp: o.xp !== false };
  } catch {
    return { ...DEFAULTS };
  }
}

const cur: DgPrefs = load();

export function dgPrefs(): Readonly<DgPrefs> {
  return cur;
}

export function setDgPref<K extends keyof DgPrefs>(k: K, v: DgPrefs[K]): void {
  if (cur[k] === v) return;
  cur[k] = v;
  try {
    localStorage.setItem(KEY, JSON.stringify(cur));
  } catch {
    // нет хранилища — настройка живёт до перезагрузки
  }
  for (const f of subs) f(cur);
}

export function onDgPrefs(f: (p: DgPrefs) => void): () => void {
  subs.add(f);
  return () => subs.delete(f);
}

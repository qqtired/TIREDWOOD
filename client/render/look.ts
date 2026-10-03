// Вид игры: 1 — прежний, 2 — новый «тёплый, цветастый» (look v2, docs/superpowers/plans/2026-10-02-look-v2.md).
// Посмотреть новый вид — адрес с ?look=2 (вернуть — ?look=1): выбор запоминается в этом браузере. Всем вид задаёт
// одна константа DEFAULT_LOOK. Модуль без three.js и DOM при загрузке — его можно импортировать и в тестах.

export type LookId = 1 | 2;

/** Вид по умолчанию. Включить новый вид всем — поставить 2. */
export const DEFAULT_LOOK: LookId = 2;

const KEY = 'opus.look';

/** Какой вид: ?look=1|2 в адресе, иначе запомненный выбор, иначе по умолчанию. */
export function pickLook(search: string, stored: string | null, def: LookId = DEFAULT_LOOK): LookId {
  const q = new URLSearchParams(search).get('look');
  if (q === '1' || q === '2') return q === '2' ? 2 : 1;
  if (stored === '1' || stored === '2') return stored === '2' ? 2 : 1;
  return def;
}

function readLook(): LookId {
  if (typeof location === 'undefined') return DEFAULT_LOOK;
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(KEY);
  } catch {
    // приватный режим или запрет хранилища — без памяти
  }
  const q = new URLSearchParams(location.search).get('look');
  if (q === '1' || q === '2') {
    try {
      localStorage.setItem(KEY, q);
    } catch {
      // не запомнили — не беда
    }
  }
  return pickLook(location.search, stored);
}

/** Вид этой загрузки страницы (меняется только перезагрузкой) */
export const LOOK: LookId = readLook();
/** Включён новый вид */
export const LOOK2 = LOOK === 2;

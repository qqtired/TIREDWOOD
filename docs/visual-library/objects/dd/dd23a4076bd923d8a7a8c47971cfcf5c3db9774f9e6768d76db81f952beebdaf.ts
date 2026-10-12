// Оформление площади (plaza2, docs/plaza-redesign-2026-10-04.md): входы в режимы, улица аттракционов, афиша у кафе.
// Посмотреть прежнюю площадь — адрес с ?plaza=1 (вернуть новую — ?plaza=2): выбор запоминается в этом браузере.
// Всем оформление задаёт одна константа DEFAULT_PLAZA. Модуль без three.js и DOM при загрузке — его можно импортировать
// и в тестах. Сервер и протокол от выбора не зависят: твёрдых предметов у оформления мало, и они одинаково есть у всех.

export type PlazaId = 1 | 2;

/** Оформление по умолчанию. Вернуть всем прежнюю площадь — поставить 1. */
export const DEFAULT_PLAZA: PlazaId = 2;

const KEY = 'opus.plaza';

/** Какое оформление: ?plaza=1|2 в адресе, иначе запомненный выбор, иначе по умолчанию. */
export function pickPlaza(search: string, stored: string | null, def: PlazaId = DEFAULT_PLAZA): PlazaId {
  const q = new URLSearchParams(search).get('plaza');
  if (q === '1' || q === '2') return q === '2' ? 2 : 1;
  if (stored === '1' || stored === '2') return stored === '2' ? 2 : 1;
  return def;
}

function readPlaza(): PlazaId {
  if (typeof location === 'undefined') return DEFAULT_PLAZA;
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(KEY);
  } catch {
    // приватный режим или запрет хранилища — без памяти
  }
  const q = new URLSearchParams(location.search).get('plaza');
  if (q === '1' || q === '2') {
    try {
      localStorage.setItem(KEY, q);
    } catch {
      // не запомнили — не беда
    }
  }
  return pickPlaza(location.search, stored);
}

/** Оформление этой загрузки страницы (меняется только перезагрузкой) */
export const PLAZA: PlazaId = readPlaza();
/** Включено новое оформление площади */
export const PLAZA2 = PLAZA === 2;

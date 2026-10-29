// Свой простой формат пака: руками (текст) и из таблиц Google («Файл → Скачать → CSV» или TSV).
// Модуль чистый, без DOM — потом переедет в shared/quiz/text.ts и будет под тестами в Node.
//
//   parseText(text) → { pack, lines, errors, warnings }   lines[i] = { cls: 'kw'|'q'|'fin'|'cmt'|'blank'|'err'|'warn', msg? }
//   parseCsv(text)  → то же (строки .lines — по номерам строк файла)
//   parseAny(text)  → то же + format: 'text' | 'csv'
//   countPack(pack) → { rounds, themes, questions }
//
// Текстовый формат (регистр не важен, пустые строки и строки с # игнорируются):
//   Пак: Набережная            название          Автор: Кракозябра        автор         18+      пометка «для взрослых»
//   Раунд: Первый              новый раунд        Тема: Рыбы              новая тема
//   100 Вопрос = ответ / вариант                  цена, вопрос, «=», ответы через «/»
//   Финал                      дальше — темы финала по одному вопросу:    ? Вопрос = ответ
//   Комментарий: …             комментарий к последнему вопросу

export const SAMPLE_TEXT = `Пак: Моя первая «Своя игра»
Автор: Кракозябра
Раунд: Первый
Тема: Рыбы
100 Кому Дед Семён платит больше всех? = осётр / осетра
200 Из какой рыбы делают чёрную икру? = белуга / осётр
300 Какая плоская рыба лежит на дне? = камбала
Тема: Море
100 Сколько рук у осьминога? = 8 / восемь
200 Какой океан самый большой? = Тихий
300 Что показывает кораблям путь ночью? = маяк
Раунд: Второй
Тема: Лодки
200 Как называется левый борт корабля? = бакборт
400 Чем судно привязывают к причалу? = швартов
600 Как называется пиратский флаг? = Весёлый Роджер
Тема: Порт
200 Где корабли стоят у берега? = причал / пристань
400 Кто отвечает за всю команду корабля? = капитан
600 Что держит пустой корабль ровно? = балласт
Финал
Тема: Маяк
? Сколько метров каланча «Выше облаков»? = 185
Тема: Жетоны
? Как называется валюта на набережной? = жетоны`;

const plural = (n, f) => {
  const m = Math.abs(n) % 100;
  const d = m % 10;
  return f[m > 10 && m < 20 ? 2 : d > 1 && d < 5 ? 1 : d === 1 ? 0 : 2];
};
export { plural };

export function countPack(pack) {
  let themes = 0;
  let questions = 0;
  for (const r of pack?.rounds ?? []) {
    themes += r.themes.length;
    for (const t of r.themes) questions += t.questions.length;
  }
  return { rounds: pack?.rounds?.length ?? 0, themes, questions };
}

const blankPack = () => ({ title: '', author: '', kind: 'jeopardy', adult: false, tags: [], source: { format: 'text' }, rounds: [] });
const answersOf = (s) => s.split('/').map((x) => x.trim()).filter(Boolean);

/** «вопрос = ответ / вариант»: делим по первому « = » (с пробелами), иначе по первому «=» */
function splitQA(body) {
  let k = body.indexOf(' = ');
  let len = 3;
  if (k < 0) {
    k = body.indexOf('=');
    len = 1;
  }
  if (k < 0) return null;
  return { q: body.slice(0, k).trim(), a: body.slice(k + len).trim() };
}

/** Убрать пустые темы и раунды, назвать безымянное; вернуть число пустых тем для предупреждений */
function tidy(pack) {
  for (const r of pack.rounds) r.themes = r.themes.filter((t) => t.questions.length);
  pack.rounds = pack.rounds.filter((r) => r.themes.length);
  return pack;
}

// ------------------------------------------------------------------ текстовый формат

export function parseText(text) {
  const src = String(text).replace(/\r\n?/g, '\n').split('\n');
  const pack = blankPack();
  const lines = src.map(() => ({ cls: 'blank' }));
  let round = null;
  let theme = null;
  let last = null;
  const mark = (i, cls, msg) => {
    lines[i] = msg ? { cls, msg } : { cls };
  };
  const newRound = (name, fin) => {
    const n = pack.rounds.filter((r) => !r.final).length + 1;
    round = { name: name || (fin ? 'Финал' : `Раунд ${n}`), final: fin, themes: [], line: 0 };
    pack.rounds.push(round);
    theme = null;
    last = null;
    return round;
  };

  for (let i = 0; i < src.length; i++) {
    const s = src[i].trim();
    if (!s) continue;
    if (/^(#|\/\/)/.test(s)) {
      mark(i, 'cmt');
      continue;
    }
    let m;
    if ((m = /^(?:пак|название)\s*:\s*(.*)$/i.exec(s))) {
      pack.title = m[1].trim();
      pack.title ? mark(i, 'kw') : mark(i, 'err', 'Напиши название после «Пак:».');
    } else if ((m = /^авторы?\s*:\s*(.*)$/i.exec(s))) {
      pack.author = m[1].trim();
      mark(i, 'kw');
    } else if (/^(?:18\s*\+|возраст\s*:\s*18\s*\+?)$/i.test(s)) {
      pack.adult = true;
      mark(i, 'kw');
    } else if ((m = /^раунд(?=[\s:]|$)\s*:?\s*(.*)$/i.exec(s))) {
      newRound(m[1].trim(), false).line = i;
      mark(i, 'kw');
    } else if ((m = /^финал(?=[\s:]|$)\s*:?\s*(.*)$/i.exec(s))) {
      newRound(m[1].trim(), true).line = i;
      mark(i, 'kw');
    } else if ((m = /^тема\s*:\s*(.*)$/i.exec(s))) {
      const name = m[1].trim();
      if (!name) {
        mark(i, 'err', 'Напиши название темы после «Тема:».');
        theme = null;
        continue;
      }
      round ??= newRound('', false);
      theme = { name, questions: [], line: i };
      round.themes.push(theme);
      last = null;
      mark(i, 'kw');
    } else if ((m = /^(?:комментарий|коммент)\s*:\s*(.*)$/i.exec(s))) {
      if (!last) mark(i, 'err', 'Комментарий пишут после вопроса, к которому он относится.');
      else {
        last.comment = m[1].trim();
        mark(i, 'cmt');
      }
    } else if ((m = /^(\d{1,6})\s+(.+)$/.exec(s)) || (m = /^\?\s*(.+)$/.exec(s))) {
      const hasPrice = m.length === 3;
      const price = hasPrice ? Number(m[1]) : 0;
      const body = hasPrice ? m[2] : m[1];
      const qa = splitQA(body);
      if (!theme) {
        mark(i, 'err', 'Сначала напиши тему: «Тема: Рыбы».');
        continue;
      }
      if (!qa) {
        mark(i, 'err', 'Нет ответа: допиши « = ответ ».');
        continue;
      }
      if (!qa.q) {
        mark(i, 'err', 'Нет вопроса перед «=».');
        continue;
      }
      const answers = answersOf(qa.a);
      if (!answers.length) {
        mark(i, 'err', 'Нет ответа после «=».');
        continue;
      }
      if (!round.final && !hasPrice) {
        mark(i, 'err', 'Нужна цена в начале строки: 100 Вопрос = ответ.');
        continue;
      }
      if (round.final && theme.questions.length) {
        mark(i, 'warn', 'В финале у темы один вопрос — этот не возьмём.');
        continue;
      }
      last = { price: round.final ? 0 : price, type: 'simple', content: [{ kind: 'text', value: qa.q }], answers, wrong: [], comment: '' };
      theme.questions.push(last);
      mark(i, round.final ? 'fin' : 'q');
    } else if (/^\d+\s*$/.test(s)) {
      mark(i, 'err', 'После цены напиши вопрос и « = ответ ».');
    } else {
      mark(i, 'err', 'Не понял строку. Начни с «Тема:», «Раунд:», цены или «?».');
    }
  }
  // пустые темы — предупреждение на строке темы
  for (const r of pack.rounds) {
    for (const t of r.themes) if (!t.questions.length && lines[t.line].cls === 'kw') mark(t.line, 'warn', 'В этой теме пока нет вопросов — её не возьмём.');
    if (!r.themes.length && r.line !== undefined && lines[r.line]?.cls === 'kw') mark(r.line, 'warn', 'В этом раунде пока нет тем — его не возьмём.');
  }
  tidy(pack);
  for (const r of pack.rounds) {
    delete r.line;
    for (const t of r.themes) delete t.line;
  }
  return summary(pack, lines);
}

function summary(pack, lines) {
  return {
    pack,
    lines,
    errors: lines.filter((l) => l.cls === 'err').length,
    warnings: lines.filter((l) => l.cls === 'warn').length,
  };
}

// ------------------------------------------------------------------ таблица (CSV / TSV)

/** Разбор CSV: кавычки, удвоенные кавычки и переводы строк внутри ячеек. → [{ cells, line }] — line: номер строки файла (с 0) */
function splitCsv(text, delim) {
  const rows = [];
  let cells = [];
  let cell = '';
  let quoted = false;
  let line = 0;
  let rowLine = 0;
  const endRow = () => {
    cells.push(cell);
    if (cells.some((c) => c.trim())) rows.push({ cells, line: rowLine });
    cells = [];
    cell = '';
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else {
        if (c === '\n') line++;
        cell += c;
      }
    } else if (c === '"' && !cell) quoted = true;
    else if (c === delim) {
      cells.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      endRow();
      line++;
      rowLine = line;
    } else cell += c;
  }
  if (cell || cells.length) endRow();
  return rows;
}

const COLS = {
  round: ['раунд', 'round'],
  theme: ['тема', 'theme'],
  price: ['цена', 'стоимость', 'price'],
  question: ['вопрос', 'question'],
  answer: ['ответ', 'ответы', 'answer'],
  image: ['картинка', 'изображение', 'фото', 'image'],
  comment: ['комментарий', 'коммент', 'comment'],
};
const DEFAULT_COLS = ['round', 'theme', 'price', 'question', 'answer', 'image'];

export function parseCsv(text) {
  const src = String(text).replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/).find((l) => l.trim()) ?? '';
  const count = (ch) => firstLine.split(ch).length - 1;
  const delim = count('\t') ? '\t' : count(';') >= count(',') && count(';') ? ';' : ',';
  const rows = splitCsv(src, delim);
  const nLines = src.split(/\r?\n/).length;
  const lines = Array.from({ length: nLines }, () => ({ cls: 'blank' }));
  const pack = blankPack();
  pack.source = { format: 'csv' };

  let cols = DEFAULT_COLS;
  const head = rows[0]?.cells.map((c) => c.trim().toLowerCase()) ?? [];
  const named = head.map((c) => Object.keys(COLS).find((k) => COLS[k].includes(c)) ?? null);
  let start = 0;
  if (named.filter(Boolean).length >= 2) {
    cols = named;
    start = 1;
    if (lines[rows[0].line]) lines[rows[0].line] = { cls: 'kw' };
  }
  const at = (cells, key) => {
    const i = cols.indexOf(key);
    return i >= 0 ? (cells[i] ?? '').trim() : '';
  };
  let round = null;
  let theme = null;
  for (let r = start; r < rows.length; r++) {
    const { cells, line } = rows[r];
    const put = (cls, msg) => {
      if (lines[line]) lines[line] = msg ? { cls, msg } : { cls };
    };
    const rn = at(cells, 'round');
    const tn = at(cells, 'theme');
    if (rn && (!round || round.name !== rn)) {
      const fin = /^финал/i.test(rn);
      round = { name: rn, final: fin, themes: [] };
      pack.rounds.push(round);
      theme = null;
    }
    if (tn && (!theme || theme.name !== tn || (rn && theme.round !== round))) {
      round ??= (pack.rounds.push({ name: 'Раунд 1', final: false, themes: [] }), pack.rounds[pack.rounds.length - 1]);
      theme = { name: tn, questions: [], round };
      round.themes.push(theme);
    }
    const q = at(cells, 'question');
    const a = at(cells, 'answer');
    const priceRaw = at(cells, 'price');
    if (!q && !a && !priceRaw) {
      put('kw');
      continue;
    }
    if (!theme) {
      put('err', 'Нет темы: заполни столбец «Тема».');
      continue;
    }
    if (!q) {
      put('err', 'Нет вопроса.');
      continue;
    }
    if (!a) {
      put('err', 'Нет ответа.');
      continue;
    }
    const price = parseInt(priceRaw, 10);
    if (!round.final && !(price > 0)) {
      put('err', 'Нужна цена: число больше нуля.');
      continue;
    }
    const content = [{ kind: 'text', value: q }];
    const img = at(cells, 'image');
    if (img) content.push(/^https?:\/\//i.test(img) ? { kind: 'image', url: img } : { kind: 'image', missing: img });
    const item = { price: round.final ? 0 : price, type: 'simple', content, answers: answersOf(a), wrong: [], comment: at(cells, 'comment') };
    theme.questions.push(item);
    put(round.final ? 'fin' : 'q');
  }
  for (const r of pack.rounds) for (const t of r.themes) delete t.round;
  tidy(pack);
  return summary(pack, lines);
}

// ------------------------------------------------------------------ что передали: текст или таблица

export function parseAny(text) {
  const src = String(text);
  const head = src.split(/\r?\n/).find((l) => l.trim()) ?? '';
  const low = head.toLowerCase();
  const names = ['round', 'theme', 'price', 'question', 'answer'].filter((k) => COLS[k].some((w) => low.includes(w))).length;
  // таблица: табы, две и больше «;» в первой строке или заголовок из названий столбцов через запятую
  const looksCsv = head.includes('\t') || (head.match(/;/g) ?? []).length >= 2 || (names >= 3 && /,/.test(head));
  const res = looksCsv ? parseCsv(src) : parseText(src);
  return { ...res, format: looksCsv ? 'csv' : 'text' };
}

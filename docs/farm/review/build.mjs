#!/usr/bin/env node
/**
 * Сборка данных для страницы-обзора «Ферма».
 *
 *   node docs/farm/review/build.mjs        (из любой папки)
 *
 * Читает исходники и пишет docs/farm/review/data.json:
 *   - docs/farm/design-v11.md        — культуры, инструменты, косметика, достижения, заказы, Фургон, репутация, босс…
 *   - docs/farm/decisions.md         — ответы владельца
 *   - tools/farm-sim/results.json    — симуляция (уровни, грядки, доход, таблица K, итоговые цены v11)
 *   - tools/farm-sim/RESULTS.md      — выводы симуляции; раздел «Итоговые числа v11» подхватывается сам
 *   - docs/farm/level/{layout.json,map.svg,level.md} — локация
 *   - client/assets/farm/icons/*.png — иконки
 *   - client/assets/farm/models/**.glb, art/farm/renders/**, art/farm/MODELS.md — модели, рендеры, заметки художников
 *   - docs/farm/review/editorial.json — немного авторского текста (вопросы владельцу, подбор карточек для обложки)
 *
 * Числа в HTML не вписаны: страница берёт всё из data.json. Что не разобралось уверенно — попадает в `rawTables`
 * как сырая таблица и показывается как есть. Сводка разбора печатается в конце.
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative, basename, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const P = {
  design: join(ROOT, 'docs/farm/design-v11.md'),
  decisions: join(ROOT, 'docs/farm/decisions.md'),
  results: join(ROOT, 'tools/farm-sim/results.json'),
  resultsMd: join(ROOT, 'tools/farm-sim/RESULTS.md'),
  levelMd: join(ROOT, 'docs/farm/level/level.md'),
  layout: join(ROOT, 'docs/farm/level/layout.json'),
  map: join(ROOT, 'docs/farm/level/map.svg'),
  icons: join(ROOT, 'client/assets/farm/icons'),
  models: join(ROOT, 'client/assets/farm/models'),
  renders: join(ROOT, 'art/farm/renders'),
  modelsMd: join(ROOT, 'art/farm/MODELS.md'),
  editorial: join(HERE, 'editorial.json'),
  out: join(HERE, 'data.json'),
};

const warns = [];
const notes = [];
const warn = (m) => warns.push(m);
const rel = (p) => relative(ROOT, p).split(sep).join('/');
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null);
const mtime = (p) => (existsSync(p) ? statSync(p).mtime.toISOString() : null);

// ───────────────────────────── общие утилиты разбора markdown ─────────────────────────────

const NBSP = /[\u00a0\u202f\u2009\u2007]/g;
const norm = (s) => String(s ?? '').replace(NBSP, ' ');
/** текст без разметки */
const txt = (s) =>
  norm(s)
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
/** число из строки «2 500», «1,5» */
const num = (s) => {
  const m = norm(s).replace(/\s/g, '').replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
};
const firstInt = (s) => {
  const m = norm(s).replace(/\*\*/g, '').match(/\d+/);
  return m ? Number(m[0]) : null;
};
const isChanged = (s) => /изм\./.test(norm(s));
const was = (s) => {
  const m = norm(s).match(/\(было\s+([^)]+)\)/);
  return m ? m[1].trim() : null;
};

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  const cells = [];
  let cur = '';
  let tick = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '`') tick = !tick;
    if (ch === '|' && !tick && s[i - 1] !== '\\') {
      cells.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

/** логические блоки markdown: строка таблицы, пункт списка (со строками продолжения), абзац */
function blocks(text) {
  const out = [];
  let cur = null;
  for (const raw of norm(text).split('\n')) {
    const ln = raw.replace(/\s+$/, '');
    if (!ln.trim()) { cur = null; continue; }
    if (/^\s*\|/.test(ln)) { out.push(ln.trim()); cur = null; continue; }
    if (/^#{1,6}\s/.test(ln)) { out.push(ln.trim()); cur = null; continue; }
    if (/^\s*([-*]|\d+\.)\s+/.test(ln) || /^[¹²³⁴⁵⁶⁷⁸⁹]\s/.test(ln)) { out.push(ln.trim()); cur = out.length - 1; continue; }
    if (cur != null) { out[cur] += ' ' + ln.trim(); continue; }
    out.push(ln.trim());
    cur = out.length - 1;
  }
  return out;
}
const isBullet = (b) => /^([-*]|\d+\.)\s+/.test(b);
const bulletsOf = (text) => blocks(text).filter((b) => /^[-*]\s+/.test(b)).map((b) => b.replace(/^[-*]\s+/, ''));
const parasOf = (text) => blocks(text).filter((b) => !/^\|/.test(b) && !/^#{1,6}\s/.test(b) && !isBullet(b));

/** индексы колонок по регуляркам заголовка: cols(header, {level: /^Ур/, ...}) */
function cols(header, spec) {
  const h = header.map(txt);
  const out = {};
  for (const [k, re] of Object.entries(spec)) {
    const i = h.findIndex((c) => re.test(c));
    out[k] = i;
  }
  return out;
}

/** все таблицы текста: {header, rows, before} */
function tablesIn(text) {
  const lines = text.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*\|/.test(lines[i]) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) {
      const header = splitRow(lines[i]);
      const rows = [];
      let j = i + 2;
      while (j < lines.length && /^\s*\|/.test(lines[j])) {
        rows.push(splitRow(lines[j]));
        j++;
      }
      let k = i - 1;
      while (k >= 0 && !lines[k].trim()) k--;
      out.push({ header, rows, before: k >= 0 ? lines[k].trim() : '' });
      i = j - 1;
    }
  }
  return out;
}

/** разделы: плоский список заголовков с номерами */
function parseSections(md) {
  const lines = md.split('\n');
  const heads = [];
  lines.forEach((ln, i) => {
    const m = ln.match(/^(#{1,6})\s+(?:(\d+(?:\.\d+)*)\.?\s+)?(.*?)\s*$/);
    if (m) heads.push({ i, level: m[1].length, num: m[2] || null, title: m[3], raw: ln });
  });
  heads.forEach((h, idx) => {
    const next = heads[idx + 1];
    h.bodyLines = lines.slice(h.i + 1, next ? next.i : lines.length);
    let end = lines.length;
    for (let k = idx + 1; k < heads.length; k++) if (heads[k].level <= h.level) { end = heads[k].i; break; }
    h.treeLines = lines.slice(h.i + 1, end);
    h.body = h.bodyLines.join('\n').trim();
    h.tree = h.treeLines.join('\n').trim();
  });
  return { lines, heads };
}

// ───────────────────────────── реестры (имена, иконки, ресурсы) ─────────────────────────────

/** культуры: id из раздела 16.1 дизайн-документа, id симуляции, файл иконки, названия для поиска моделей */
const CROPS = [
  { id: 'radish', sim: 'radish', icon: 'radish', name: 'Редис', alias: ['radish'] },
  { id: 'wheat', sim: 'wheat', icon: 'wheat', name: 'Пшеница', alias: ['wheat'] },
  { id: 'lettuce', sim: 'lettuce', icon: 'lettuce', name: 'Салат', alias: ['lettuce', 'salad'] },
  { id: 'onion', sim: 'onion', icon: 'onion', name: 'Лук', alias: ['onion'] },
  { id: 'pumpkin', sim: 'pumpkin', icon: 'pumpkin', name: 'Тыква', alias: ['pumpkin'] },
  { id: 'carrot', sim: 'carrot', icon: 'carrot', name: 'Морковь', alias: ['carrot'] },
  { id: 'sunflower', sim: 'sunflower', icon: 'sunflower-seeds', name: 'Подсолнух', alias: ['sunflower'] },
  { id: 'strawberry', sim: 'strawberry', icon: 'strawberry', name: 'Клубника', alias: ['strawberry'] },
  { id: 'giant-mushroom', sim: 'mushroom', icon: 'giant-mushroom', name: 'Гриб-гигант', alias: ['giant-mushroom', 'giantmushroom', 'giant_mushroom', 'gigant'] },
  { id: 'dill', sim: 'dill', icon: 'dill', name: 'Укроп', alias: ['dill'] },
  { id: 'chili', sim: 'chili', icon: 'chili', name: 'Перец чили', alias: ['chili', 'chilli', 'pepper'] },
  { id: 'crystal', sim: 'crystal', icon: 'crystal', name: 'Кристальный цветок', alias: ['crystal-flower', 'crystalflower', 'crystal'] },
  { id: 'microgreens', sim: 'micro', icon: 'microgreens', name: 'Микро-зелень', alias: ['microgreens', 'micro-greens', 'micro'] },
  { id: 'lotus', sim: 'lotus', icon: 'lotus', name: 'Лунный лотос', alias: ['lotus'] },
  { id: 'life-tree', sim: 'tree', icon: 'life-fruit', name: 'Древо жизни', alias: ['life-tree', 'lifetree', 'life_tree', 'tree-of-life'] },
  { id: 'golden-apple', sim: 'apple', icon: 'golden-apple', name: 'Золотое яблоко', alias: ['golden-apple', 'goldenapple', 'gold-apple'] },
  { id: 'dragon-fruit', sim: 'dragon', icon: 'dragon-fruit', name: 'Драконий плод', alias: ['dragon-fruit', 'dragonfruit', 'dragon'] },
  { id: 'star-flower', sim: 'star', icon: 'star', name: 'Звёздный цветок', alias: ['star-flower', 'starflower', 'star_flower'] },
  { id: 'mythic-mushroom', sim: 'mythic', icon: 'myth-mushroom', name: 'Мифический гриб', alias: ['mythic-mushroom', 'mythicmushroom', 'mythic'] },
];

const RES = [
  { key: 'root', name: 'Корешок', icon: 'rootlet', stems: ['корешк', 'корешок'] },
  { key: 'fiber', name: 'Волокно', icon: 'fiber', stems: ['волокн'] },
  { key: 'seeds', name: 'Зёрна', icon: 'seeds', stems: ['зёрен', 'зерен', 'зёрна', 'зерна', 'зёрн', 'зерн', 'семен', 'семена'] },
  { key: 'spores', name: 'Споры', icon: 'spores', stems: ['спор'] },
  { key: 'crystal', name: 'Крист. пыль', icon: 'crystal-dust', stems: ['крист', 'кристалл. пыл'] },
  { key: 'wood', name: 'Древесина', icon: 'wood', stems: ['древесин'] },
  { key: 'gold', name: 'Золотой лист', icon: 'golden-leaf', stems: ['золот'] },
  { key: 'scale', name: 'Чешуйка', icon: 'scale', stems: ['чешуйк'] },
  { key: 'star', name: 'Звёздная пыль', icon: 'star-dust', stems: ['звёздн', 'звездн', 'зв. пыл'] },
];
const resKey = (s) => {
  const t = norm(s).toLowerCase();
  for (const r of RES) if (r.stems.some((st) => t.includes(st))) return r.key;
  return null;
};

const ARCH_FALLBACK = {
  casual: 'Казуал',
  active: 'Активный',
  fast: 'Только быстрые',
  fastNoVan: 'Только быстрые, без Фургона',
  nonstop: 'Нон-стоп (контроль)',
};

// ───────────────────────────── чтение источников ─────────────────────────────

const designMd = read(P.design);
if (!designMd) {
  console.error('Нет ' + rel(P.design));
  process.exit(1);
}
const D = parseSections(designMd);
const sec = (num) => D.heads.find((h) => h.num === num);
const secBody = (num) => sec(num)?.body ?? '';
const secTree = (num) => sec(num)?.tree ?? '';
const firstTable = (text, pred) => tablesIn(text).find(pred || (() => true));

/** строка документа, содержащая подстроку (для цитат в editorial.json) */
const designBlocks = blocks(designMd);
function quote(sub) {
  const s = norm(sub);
  const ln = designBlocks.find((l) => l.includes(s));
  if (!ln) return null;
  return ln.trim().replace(/^([-*]|\d+\.)\s+/, '');
}

const data = {
  meta: {},
  base: '../../../',
  rawTables: [],
};
const rawTable = (id, title, t) => data.rawTables.push({ id, title, header: t.header.map(txt), rows: t.rows.map((r) => r.map(txt)) });

// ───────────────────────────── decisions.md ─────────────────────────────

function parseDecisions() {
  const md = read(P.decisions);
  if (!md) { warn('нет decisions.md'); return []; }
  const out = [];
  for (const ln of md.split('\n')) {
    let m = ln.match(/^(\d+)\.\s+\*\*(.+?)\*\*\s*(.*)$/);
    if (m) {
      out.push({ id: m[1], from: Number(m[1]), to: Number(m[1]), title: txt(m[2]).replace(/:$/, ''), text: txt(m[3]) });
      continue;
    }
    m = ln.match(/^(\d+)[–-](\d+)\.\s+(.*)$/);
    if (m) out.push({ id: `${m[1]}–${m[2]}`, from: Number(m[1]), to: Number(m[2]), title: 'На усмотрение ведущего', text: txt(m[3]) });
  }
  return out;
}
data.decisions = parseDecisions();
data.decisionsIntro = (read(P.decisions) || '').split('\n').filter((l) => /^(Источник|# )/.test(l)).map(txt);

// ───────────────────────────── раздел 0, 1 ─────────────────────────────

data.cover = {
  title: txt(designMd.split('\n')[0].replace(/^#\s*/, '')),
  headerLine: txt(designMd.split('\n').find((l) => /^\d{2}\.\d{2}\.\d{4}/.test(l)) || ''),
  zero: secBody('0'),
  pillars: secBody('1.1'),
};

function parsePath() {
  const out = { steps: [], first10: null, entry: secBody('1.3'), short: secBody('1.5'), veteran: secBody('1.6') };
  const t12 = firstTable(secBody('1.2'));
  if (t12) out.steps = t12.rows.map((r) => ({ step: txt(r[0]), text: txt(r[1]), md: r[1] }));
  else warn('1.2: таблица пути игрока не найдена');
  const b14 = secBody('1.4');
  const t14 = firstTable(b14);
  if (t14) {
    out.first10 = {
      rows: t14.rows.map((r) => ({ time: txt(r[0]), phrase: txt(r[1]), does: txt(r[2]), result: txt(r[3]), changed: isChanged(r.join(' ')) })),
      before: parasOf(b14).join('\n'),
      after: b14.slice(b14.lastIndexOf('|') + 1).trim(),
    };
    // «Обучение даёт 175 XP и 20 🪙» — для плашки
    const m = b14.match(/Обучение даёт\s+([\d\s]+)\s*XP и\s+([\d\s]+)\s*🪙/);
    if (m) out.first10.tutorialXp = num(m[1]), (out.first10.tutorialCoins = num(m[2]));
  } else warn('1.4: таблица «первые 10 минут» не найдена');
  return out;
}
data.path = parsePath();

// ───────────────────────────── раздел 2 (решения) ─────────────────────────────

{
  const t = firstTable(secBody('2'));
  data.diffs = t ? t.rows.map((r) => ({ no: txt(r[0]), topic: txt(r[1]), decision: txt(r[2]), why: txt(r[3]) })) : [];
  if (!t) warn('2: таблица решений не найдена');
  data.diffsNote = parasOf(secBody('2')).map(txt).join(' ');
}

// ───────────────────────────── раздел 3 (уровни) ─────────────────────────────

function parseLevels() {
  const out = { xp: [], unlock: [] };
  const t31 = firstTable(secBody('3.1'));
  if (t31) {
    const lv = t31.header.slice(1).map((c) => firstInt(c));
    const toNext = t31.rows.find((r) => /До следующего/i.test(r[0]));
    const total = t31.rows.find((r) => /Всего/i.test(r[0]));
    lv.forEach((L, i) => out.xp.push({ level: L, toReach: num(toNext?.[i + 1]), total: num(total?.[i + 1]) }));
    out.xp.unshift({ level: 1, toReach: 0, total: 0 });
  } else warn('3.1: кривая XP не найдена');
  const t32 = firstTable(secBody('3.2'));
  if (t32) {
    out.unlock = t32.rows.map((r) => ({
      level: firstInt(r[0]),
      stage: txt(r[1]).replace(/\s*изм\.\S*/, ''),
      crops: txt(r[2]),
      systems: txt(r[3]),
      reward: txt(r[4]),
      changed: isChanged(r.join(' ')),
      raw: r.map(txt),
    }));
  } else warn('3.2: таблица открытий не найдена');
  out.note = parasOf(secBody('3.2')).filter((l) => /^\*\*изм\.\*\*/.test(l)).map(txt).join(' ');
  out.general = secBody('3.3');
  out.afterMax = quote('После 13 уровня') ? txt(quote('После 13 уровня')) : null;
  return out;
}
data.levels = parseLevels();

// ───────────────────────────── раздел 4 (культуры) ─────────────────────────────

function parseDuration(s) {
  const t = norm(s).replace(/\*\*/g, '');
  const m = t.match(/(\d+(?:[.,]\d+)?)\s*(мин|ч)/);
  if (!m) return null;
  const v = Number(m[1].replace(',', '.'));
  return m[2] === 'ч' ? Math.round(v * 60) : v;
}
const pairArrow = (s) => {
  const m = norm(s).replace(/\*\*/g, '').match(/([\d ]+)\s*→\s*([\d ]+)/);
  return m ? [num(m[1]), num(m[2])] : [null, null];
};

function parseCrops() {
  const b = secBody('4');
  const t = firstTable(b, (x) => /Культура/.test(x.header[1] || ''));
  if (!t) { warn('4: таблица культур не найдена'); return []; }
  const C = cols(t.header, { level: /^Ур/, crop: /Культур/, grow: /Рост/, xp: /^XP$/, sec: /Вторич/, seed: /Посадка/, sell: /Продаж/, coinsH: /🪙\/ч/, xpH: /XP\/ч/, van: /Фургон/ });
  for (const k of ['level', 'crop', 'grow', 'xp', 'sec', 'seed', 'sell']) if (C[k] < 0) warn('4: нет колонки «' + k + '» в таблице культур');
  const foot = {};
  for (const p of parasOf(b)) {
    const m = p.match(/^([¹²³⁴⁵⁶⁷⁸⁹])\s+([\s\S]*)$/);
    if (m) foot[m[1]] = txt(m[2]);
  }
  const crops = [];
  for (const r of t.rows) {
    const nameCell = txt(r[C.crop]);
    const mm = nameCell.match(/^(🟢|🟡|🟠)\s*(.+?)\s*→\s*(.+)$/);
    if (!mm) { warn('4: не разобрана строка «' + nameCell + '»'); continue; }
    const reg = CROPS.find((c) => c.name.toLowerCase() === mm[2].trim().toLowerCase());
    if (!reg) { warn('4: культура «' + mm[2] + '» не в реестре build.mjs'); continue; }
    const [seedV10, seed] = pairArrow(r[C.seed]);
    const [sellV10, sell] = pairArrow(r[C.sell]);
    const sec2 = txt(r[C.sec]).match(/^(.+?)\s+(\d+)\s*%/);
    const notes = [];
    for (const ch of norm(r.join(' ')).match(/[¹²³⁴⁵⁶⁷⁸⁹]/g) || []) if (foot[ch] && !notes.includes(foot[ch])) notes.push(foot[ch]);
    crops.push({
      id: reg.id,
      sim: reg.sim,
      icon: reg.icon,
      name: reg.name,
      product: txt(mm[3]),
      group: mm[1] === '🟢' ? 'fast' : mm[1] === '🟡' ? 'normal' : 'long',
      groupEmoji: mm[1],
      level: firstInt(r[C.level]),
      levelChanged: isChanged(r[C.level]),
      minutes: parseDuration(r[C.grow]),
      growText: txt(r[C.grow]),
      xp: firstInt(r[C.xp]),
      xpChanged: isChanged(r[C.xp]),
      secName: sec2 ? sec2[1] : txt(r[C.sec]),
      secKey: resKey(sec2 ? sec2[1] : r[C.sec]),
      secChance: sec2 ? Number(sec2[2]) : null,
      seedV10, seed, sellV10, sell,
      compressed: /[¹²³⁴⁵⁶⁷⁸⁹]/.test(norm(r[C.seed] + r[C.sell])),
      coinsH: C.coinsH >= 0 ? num(r[C.coinsH]) : null,
      xpH: C.xpH >= 0 ? num(r[C.xpH]) : null,
      vanLimit: C.van >= 0 ? num(r[C.van]) : null,
      notes,
    });
  }
  return crops;
}
data.crops = parseCrops();
data.cropNotes = parasOf(secBody('4')).filter((l) => /^[¹²³⁴⁵⁶⁷⁸⁹]/.test(l)).map(txt);
data.cropRules = parasOf(secBody('4')).filter((l) => /^Правила из v10/.test(l)).map(txt).join(' ');
data.cropIntro = parasOf(secBody('4')).filter((l) => !/^[¹²³⁴⁵⁶⁷⁸⁹]/.test(l) && !/^Правила из v10/.test(l)).join('\n\n');

// ───────────────────────────── раздел 5 (ресурсы) ─────────────────────────────

{
  const t = firstTable(secBody('5'));
  data.resources = [];
  if (t) {
    for (const r of t.rows) {
      const name = txt(r[0]).replace(/\s*\(.*\)$/, '');
      const key = resKey(name);
      const reg = RES.find((x) => x.key === key);
      data.resources.push({ key, name: reg ? reg.name : name, icon: reg?.icon || null, sources: txt(r[1]), type: txt(r[2]), xpPer: num(r[3]), changed: isChanged(r[0]) });
    }
  } else warn('5: таблица ресурсов не найдена');
  data.resourcesNote = bulletsOf(secBody('5')).map(txt);
}

// ───────────────────────────── раздел 6 (улучшения) ─────────────────────────────

function parseResList(cell) {
  const s = norm(cell).replace(/\*\*/g, '').replace(/\([^)]*\)/g, '').replace(/изм\.[¹²³⁴⁵⁶⁷⁸⁹]*/g, '');
  const out = [];
  for (const part of s.split(/\s*(?:\+|,)\s*/)) {
    const m = part.trim().match(/^(\d+)\s+(.+)$/);
    if (!m) continue;
    out.push({ n: Number(m[1]), name: m[2].trim(), key: resKey(m[2]) });
  }
  return out;
}
const goalId = (name) => {
  const n = name.toLowerCase();
  let m = n.match(/^грядка\s+(\d)/);
  if (m) return 'bed' + m[1];
  m = n.match(/^(грабли|лопатка|лейка|сумка)\s+(\d)/);
  if (m) return { грабли: 'rake', лопатка: 'shovel', лейка: 'can', сумка: 'bag' }[m[1]] + m[2];
  if (n.includes('свин')) return 'pig';
  if (n.includes('пчёл') || n.includes('пчел')) return 'bees';
  if (n.includes('компост')) return 'compost';
  return null;
};

function parseUpgrades() {
  const b = secBody('6');
  const t = firstTable(b, (x) => /Что/.test(x.header[0]));
  if (!t) { warn('6: таблица улучшений не найдена'); return []; }
  const foot = {};
  for (const p of parasOf(b)) {
    const m = p.match(/^([¹²³⁴⁵⁶⁷⁸⁹])\s+([\s\S]*)$/);
    if (m) foot[m[1]] = txt(m[2]);
  }
  return t.rows.map((r) => {
    const nameFull = txt(r[0]);
    const colon = nameFull.indexOf(':');
    const name = colon > 0 ? nameFull.slice(0, colon) : nameFull;
    const [costV10, cost] = pairArrow(r[2]);
    const notes = [];
    for (const ch of norm(r.join(' ')).match(/[¹²³⁴⁵⁶⁷⁸⁹]/g) || []) if (foot[ch]) notes.push(foot[ch]);
    return {
      id: goalId(name),
      name,
      what: colon > 0 ? nameFull.slice(colon + 1).trim() : '',
      level: firstInt(r[1]),
      levelChanged: isChanged(r[1]),
      levelWas: was(r[1]),
      costV10, cost,
      res: parseResList(r[3]),
      resText: txt(r[3]),
      resChanged: isChanged(r[3]),
      why: txt(r[4]),
      notes,
    };
  });
}
data.upgrades = parseUpgrades();
data.upgradesIntro = parasOf(secBody('6')).filter((l) => !/^[¹²³⁴⁵⁶⁷⁸⁹]/.test(l)).slice(0, 1).map(txt).join(' ');
data.upgradeNotes = bulletsOf(secBody('6')).filter((l) => /^\*\*/.test(l)).map(txt);

// 6.1
{
  const t = firstTable(secBody('6.1'));
  data.toolWhy = t ? t.rows.map((r) => ({ tool: txt(r[0]), what: txt(r[1]), why: txt(r[2]), balance: txt(r[3]) })) : [];
  data.toolWhyIntro = parasOf(secBody('6.1')).map(txt).join(' ');
  if (!t) warn('6.1: таблица не найдена');
}

// ───────────────────────────── раздел 7 (лейка, мини-игра) ─────────────────────────────

function parseMinigame() {
  const b = secTree('7');
  const src = {};
  const pick = (key, re, def, conv = (x) => num(x)) => {
    const m = b.match(re);
    if (m) { src[key] = 'doc'; return conv(m[1]); }
    src[key] = 'default';
    return def;
  };
  const mg = {
    charges: [10, 20, 50],
    tiltUpSec: pick('tiltUpSec', /за\s*([\d,]+)\s*с\s*от\s*0°\s*до\s*90°/, 0.8),
    tiltDownSec: pick('tiltDownSec', /выпрямляется за\s*([\d,]+)\s*с/, 0.4),
    shiftPct: pick('shiftPct', /до\s*\+(\d+)\s*%\s*ширины поля/, 25),
    mouthPct: pick('mouthPct', /горлышко\s*\((\d+)\s*%\s*ширины поля/, 18),
    amplitudePct: pick('amplitudePct', /амплитудой\s*(\d+)\s*%\s*поля/, 30),
    durationSec: pick('durationSec', /Конец:\*\*\s*(\d+)\s*с налива/, 10),
    emptySec: pick('emptySec', /за\s*(\d+)\s*с при полном наклоне/, 4),
    releaseSec: pick('releaseSec', /отпущена дольше\s*([\d,]+)\s*с/, 1.5),
    waterSets: pick('waterSets', /у каждого фермера\s*(\d+)\s*набора/, 4),
    waterMin: pick('waterMin', /новый\s*—\s*каждые\s*(\d+)\s*мин/, 15),
    closeAfterSec: pick('closeAfterSec', /закрывается сама через\s*(\d+)\s*с/, 1),
  };
  const per = b.match(/период\s*([\d,]+)[–-]([\d,]+)\s*с/);
  if (per) { mg.periodMin = num(per[1]); mg.periodMax = num(per[2]); src.period = 'doc'; } else { mg.periodMin = 2.5; mg.periodMax = 4; src.period = 'default'; }
  const ch = b.match(/заряды\s*(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)/);
  if (ch) { mg.charges = [Number(ch[1]), Number(ch[2]), Number(ch[3])]; src.charges = 'doc'; } else src.charges = 'default';
  mg.src = src;
  const t = firstTable(secBody('7.1'));
  mg.skill = t ? t.rows.map((r) => ({ how: txt(r[0]), fill: txt(r[1]) })) : [];
  mg.intro = secBody('7');
  mg.how = secBody('7.1');
  mg.anti = secBody('7.2');
  mg.sound = secBody('7.3');
  return mg;
}
data.minigame = parseMinigame();

// ───────────────────────────── раздел 8 (помощь, репутация) ─────────────────────────────

{
  const t = firstTable(secBody('8.1'));
  data.help = t ? t.rows.map((r) => ({ rule: txt(r[0]), value: txt(r[1]), changed: isChanged(r.join(' ')) })) : [];
  const h = secBody('8.1');
  data.helpNums = {
    repPerDay: (h.match(/не больше\s*(\d+)\s*в сутки/) || [])[1] ? Number(h.match(/не больше\s*(\d+)\s*в сутки/)[1]) : null,
    cycleMaxHelps: (h.match(/До\s*(\d+)\s*помощей на грядку/) || [])[1] ? Number(h.match(/До\s*(\d+)\s*помощей на грядку/)[1]) : null,
    perCycle: 20,
  };
  const tr = firstTable(secBody('8.2'));
  data.rep = tr
    ? tr.rows.map((r) => ({
        level: firstInt(r[0]),
        name: txt(r[1]).replace(/\s*\(.*\)$/, ''),
        nameNote: (txt(r[1]).match(/\((.*)\)$/) || [])[1] || null,
        rep: num(r[2]),
        sell: txt(r[3]),
        sellPct: /\d/.test(r[3]) ? num(String(r[3]).replace(/[+%]/g, '')) : 0,
        van: txt(r[4]),
        vanSlot: /\+1/.test(r[4]) ? 1 : 0,
        cosmetic: txt(r[5]),
        raw: r.map(txt),
      }))
    : [];
  if (!t) warn('8.1: таблица помощи не найдена');
  if (!tr) warn('8.2: таблица репутации не найдена');
  data.repSources = parasOf(secBody('8.2')).filter((l) => /^Источники/.test(l)).map(txt).join(' ');
  data.repOnly = parasOf(secBody('8.2')).filter((l) => /^Только растёт/.test(l)).map(txt).join(' ');
}

// ───────────────────────────── раздел 9 (экономика) ─────────────────────────────

{
  const b9 = secTree('9');
  data.economy = {
    why: secBody('9.1'),
    scales: secBody('9.2'),
    lever: secBody('9.3'),
    time: secBody('9.4'),
    other: secBody('9.5'),
  };
  // таблица K из документа (сырая — страница рисует собственную из results.json)
  const t91 = firstTable(secBody('9.1'));
  if (t91) rawTable('9.1', 'K и доход по документу', t91);
  const t93 = firstTable(secBody('9.3'));
  data.economy.leverTable = t93 ? { header: t93.header.map(txt), rows: t93.rows.map((r) => r.map(txt)), boldRow: t93.rows.findIndex((r) => /\*\*/.test(r[0])) } : null;
  const t94 = firstTable(secBody('9.4'));
  data.economy.passTime = t94 ? { header: t94.header.map(txt), rows: t94.rows.map((r) => r.map(txt)) } : null;
  // другие монетные числа (раздел 9.5) → v10 и 🪙 при K=0,1
  const t95 = firstTable(secBody('9.5'));
  data.economy.coins = t95
    ? t95.rows.map((r) => ({
        what: txt(r[0]),
        v10: txt(r[1]),
        v10num: (() => { const a = txt(r[1]).match(/(\d[\d ]*)(?:[–-](\d+))?/); if (!a) return null; const x = num(a[1]); return a[2] ? (x + Number(a[2])) / 2 : x; })(),
        now: txt(r[2]),
        nowNum: num(r[2]),
      }))
    : [];
  // цели дохода из текста: «~1 200–1 500 🪙 в день у активного фермера, 600–900 у казуала»
  const tx = norm(secBody('0')) + '\n' + norm(secTree('9'));
  const tg = tx.match(/~?\s*(\d[\d ]*)\s*[–-]\s*(\d[\d ]*)\s*🪙 в день у активного[^,]*,\s*(\d[\d ]*)\s*[–-]\s*(\d[\d ]*)\s*у казуала/);
  const tg2 = tx.match(/активный[^()\n]*\(цель\s*(\d[\d ]*)\s*[–-]\s*(\d[\d ]*)\)[^()\n]*казуал[^()\n]*\(цель\s*(\d[\d ]*)\s*[–-]\s*(\d[\d ]*)/);
  data.economy.targets = tg2
    ? { active: [num(tg2[1]), num(tg2[2])], casual: [num(tg2[3]), num(tg2[4])], source: 'doc' }
    : tg
      ? { active: [num(tg[1]), num(tg[2])], casual: [num(tg[3]), num(tg[4])], source: 'doc' }
      : null;
  if (!data.economy.targets) warn('9: цель «🪙 в день» не разобралась — на графиках не будет полосы цели');
  const nm = norm(secBody('9.1')).match(/норма\s*(\d+)[–-](\d+)\s*🪙\/мин/i);
  data.economy.norm = nm ? [Number(nm[1]), Number(nm[2])] : (norm(designMd).match(/норма\s*8[–-]15/) ? [8, 15] : null);
  // базовые числа K из шапки: «K = 0,1»
  const km = norm(designMd).match(/\*\*K\s*=\s*([\d,]+)\*\*/);
  data.economy.kDoc = km ? num(km[1]) : null;
}

// ───────────────────────────── раздел 10 (Гриб, Фургон, заказы) ─────────────────────────────

function parseVan() {
  const b = secBody('10.2');
  const v = { text: b, slots: null, assortment: [], formula: [], mults: null, params: {} };
  const slotLine = bulletsOf(b).find((l) => /Слоты/.test(l)) || '';
  const sm = norm(slotLine).match(/ур\.\s*(\d+)[–-](\d+)\s*→\s*(\d+),\s*ур\.\s*(\d+)[–-](\d+)\s*→\s*(\d+),\s*ур\.\s*(\d+)[–-](\d+)\s*→\s*(\d+).*?репутацию\s*([\d, ]+?)\.\s*Не больше\s*(\d+)/);
  if (sm) {
    v.slots = { steps: [{ from: +sm[1], to: +sm[2], n: +sm[3] }, { from: +sm[4], to: +sm[5], n: +sm[6] }, { from: +sm[7], to: +sm[8], n: +sm[9] }], repLevels: sm[10].split(/,\s*/).map(Number), max: +sm[11], src: 'doc' };
  } else {
    warn('10.2: слоты Фургона не разобрались — взят запасной вариант 3→1, 5→2, 10→3, реп. 2/4/6, максимум 6');
    v.slots = { steps: [{ from: 3, to: 4, n: 1 }, { from: 5, to: 9, n: 2 }, { from: 10, to: 13, n: 3 }], repLevels: [2, 4, 6], max: 6, src: 'default' };
  }
  const mm = norm(b).match(/m\s*∈\s*\{([\d,; ]+)\}/);
  v.mults = mm ? mm[1].split(/;\s*/).map((x) => num(x)).filter((x) => x) : [1.3, 1.4, 1.5];
  v.params.cycleHours = 1;
  const t = firstTable(b, (x) => /Ур\./.test(x.header[0]));
  v.assortment = t ? t.rows.map((r) => ({ level: txt(r[0]), items: txt(r[1]) })) : [];
  // формула — нумерованный список
  const fm = blocks(b).filter((l) => /^\d+\.\s/.test(l));
  v.formula = fm.map((l) => txt(l.replace(/^\d+\.\s+/, '')));
  const q = norm(b).match(/Q\s*=\s*max\(1,\s*min\((\d+),\s*⌈(\d+)\s*\/\s*рост в часах⌉\)\)/);
  v.params.qCap = q ? Number(q[1]) : 30;
  v.params.qNum = q ? Number(q[2]) : 30;
  const u = norm(b).match(/u\s*∈\s*\[([\d,]+);\s*([\d,]+)\]/);
  v.params.u = u ? [num(u[1]), num(u[2])] : [0.25, 0.6];
  const bf = norm(b).match(/N\s*≤\s*⌊([\d,]+)\s*×\s*вместимость сумки⌋/);
  v.params.bagFrac = bf ? num(bf[1]) : 0.8;
  const sh = norm(b).match(/N\s*≤\s*грядки\s*×\s*⌊(\d+)\s*\/\s*рост в мин⌋/);
  v.params.shortMax = sh ? Number(sh[1]) : 55;
  v.params.xpFrac = 0.25;
  v.cycle = txt(bulletsOf(b).find((l) => /Цикл/.test(l)) || '');
  return v;
}
data.van = parseVan();
data.grib = secBody('10.1');

function parseOrders() {
  const b = secBody('10.3');
  const tabs = tablesIn(b);
  const t = tabs.find((x) => /Тип/.test(x.header[0]));
  const out = { templates: [], weights: null, formula: '', intro: bulletsOf(b).map(txt) };
  if (t) {
    out.templates = t.rows.map((r) => {
      const [coinsV10, coins] = pairArrow(r[3]);
      return { type: txt(r[0]), name: txt(r[1]).replace(/\s*\(изм.*$/, ''), nameChanged: isChanged(r[1]), nameRaw: txt(r[1]), cond: txt(r[2]), coinsV10, coins, xp: num(r[4]), rep: /\d/.test(r[5]) ? num(r[5]) : 0 };
    });
  } else warn('10.3: таблица заказов не найдена');
  const w = tabs.find((x) => /быстрые/.test(x.header.join(' ')));
  if (w) out.weights = { header: w.header.map(txt), rows: w.rows.map((r) => r.map(txt)) };
  const fi = b.indexOf('**Формула подбора**');
  out.formula = fi >= 0 ? b.slice(fi) : '';
  return out;
}
data.orders = parseOrders();

// ───────────────────────────── раздел 11 (босс) ─────────────────────────────

function parseBoss() {
  const b = secBody('11');
  const tabs = tablesIn(b);
  const rules = tabs.find((x) => /Правило/.test(x.header[0]));
  const phases = tabs.find((x) => /Фаза/.test(x.header[0]));
  const out = {
    intro: parasOf(b).slice(0, 1).map(txt).join(' '),
    rules: rules ? rules.rows.map((r) => ({ rule: txt(r[0]), value: txt(r[1]), changed: isChanged(r.join(' ')) })) : [],
    phases: phases
      ? phases.rows.map((r) => {
          const m = txt(r[0]).match(/^(\d)\.\s*(.+?),\s*(\d+)[–-](\d+)\s*%/);
          return { no: m ? Number(m[1]) : null, name: m ? m[2] : txt(r[0]), from: m ? Number(m[3]) : null, to: m ? Number(m[4]) : null, look: txt(r[1]), sound: txt(r[2]), label: txt(r[0]) };
        })
      : [],
    fight: parasOf(b).filter((l) => /^\*\*Как выглядит бой/.test(l)).map(txt).join(' '),
    win: parasOf(b).filter((l) => /^\*\*Ролик победы/.test(l)).map(txt).join(' '),
  };
  const hm = norm(b).match(/Здоровье\s*\|\s*([\d ]+)\s*×\s*N,\s*N[^,]*,\s*от\s*(\d+)\s*до\s*(\d+)/) || norm(b).match(/([\d ]{3,})\s*×\s*N[^|]*?от\s*(\d+)\s*до\s*(\d+)/);
  out.health = hm ? { perN: num(hm[1]), nMin: Number(hm[2]), nMax: Number(hm[3]), src: 'doc' } : { perN: 2000, nMin: 3, nMax: 20, src: 'default' };
  if (!hm) warn('11: здоровье Древа не разобралось — запасной вариант 2000 × N, 3–20');
  if (!phases) warn('11: таблица фаз не найдена');
  const wm = norm(b).match(/(\d\d:\d\d)[–-](\d\d:\d\d)\s*МСК/);
  out.window = wm ? [wm[1], wm[2]] : ['19:00', '01:00'];
  return out;
}
data.boss = parseBoss();

// ───────────────────────────── раздел 12 (косметика, питомцы) ─────────────────────────────

const SLOT_BY_PREFIX = { h: 'Голова', u: 'Верх', l: 'Низ', a: 'Аксессуар', f: 'Эффект', em: 'Эмоция', ti: 'Титул', n: 'Значок', fr: 'Рамка', tl: 'Скин инструмента', pl: 'Участок', s: 'Питомец' };
function parseCosmetics() {
  const b = secBody('12.2');
  const items = [];
  let group = '';
  const lines = b.split('\n');
  // идём по тексту, запоминая «**Заголовок**» перед таблицей
  const tabs = tablesIn(b);
  for (const t of tabs) {
    group = txt(t.before);
    for (const r of t.rows) {
      const id = txt(r[0]);
      const prefix = id.split(':')[0];
      const nameRaw = txt(r[1]);
      const src = txt(r[2]);
      const lvl = src.match(/ур\.\s*(\d+)/);
      const rep = src.match(/репутация\s*(\d+)/i);
      items.push({
        id,
        slotKey: prefix,
        slot: SLOT_BY_PREFIX[prefix] || prefix,
        group,
        name: nameRaw,
        source: src.replace(/\s*\(\s*изм\..*$/, '').trim(),
        sourceRaw: src,
        sourceKind: lvl ? 'level' : rep ? 'rep' : /дост\./.test(src) ? 'achievement' : 'other',
        level: lvl ? Number(lvl[1]) : null,
        rep: rep ? Number(rep[1]) : null,
        achievement: (src.match(/дост\.\s*«([^»]+)»/) || [])[1] || null,
        look: txt(r[3]),
        changed: isChanged(r.join(' ')),
        changeNote: (src.match(/\(\s*(изм\..*)\)\s*$/) || [])[1] || null,
      });
    }
  }
  return items;
}
data.cosmetics = parseCosmetics();
if (!data.cosmetics.length) warn('12.2: каталог косметики не разобрался');
data.slots = (() => {
  const t = firstTable(secBody('12.1'));
  return t ? t.rows.map((r) => ({ code: txt(r[0]), slot: txt(r[1]).replace(/\s*\(.*\)/, ''), what: txt(r[2]), draw: txt(r[3]), changed: isChanged(r.join(' ')) })) : [];
})();
data.slotsNote = bulletsOf(secBody('12.1')).map(txt);

function parsePets() {
  const t = firstTable(secBody('12.3'));
  if (!t) { warn('12.3: таблица питомцев не найдена'); return { pets: [], behavior: '' }; }
  const pets = t.rows.map((r) => {
    const anim = txt(r[4]).split('/').map((x) => x.trim());
    return {
      id: txt(r[0]),
      name: txt(r[1]),
      source: txt(r[2]),
      look: txt(r[3]),
      idle: anim[0] || '', follow: anim[1] || '', happy: anim[2] || '',
      changed: isChanged(r.join(' ')),
    };
  });
  const bi = secBody('12.3').indexOf('**Поведение');
  return { pets, behavior: bi >= 0 ? secBody('12.3').slice(bi) : '', intro: parasOf(secBody('12.3')).filter((l) => /^Все в слоте/.test(l)).map(txt).join(' ') };
}
{
  const p = parsePets();
  data.pets = p.pets;
  data.petBehavior = p.behavior;
  data.petIntro = p.intro;
}

// ───────────────────────────── раздел 13 (достижения) ─────────────────────────────

function parseAchievements() {
  const t = firstTable(secBody('13'));
  if (!t) { warn('13: таблица достижений не найдена'); return []; }
  // поиск награды в каталоге
  const bag = data.cosmetics.map((c) => {
    const names = [c.name.toLowerCase()];
    const q = c.name.match(/«([^»]+)»/);
    if (q) names.push(q[1].toLowerCase());
    return { id: c.id, names };
  });
  return t.rows.map((r) => {
    const reward = txt(r[4]);
    const rl = reward.toLowerCase();
    let best = null;
    for (const c of bag) for (const n of c.names) if (n.length > 3 && rl.includes(n) && (!best || n.length > best.n.length)) best = { id: c.id, n };
    return {
      category: txt(r[0]),
      name: txt(r[1]).replace(/\s*\(.*\)$/, ''),
      nameNote: (txt(r[1]).match(/\((.*)\)$/) || [])[1] || null,
      level: firstInt(r[2]),
      levelChanged: isChanged(r[2]),
      levelWas: (txt(r[2]).match(/было\s+(\d+)/) || [])[1] ? Number(txt(r[2]).match(/было\s+(\d+)/)[1]) : null,
      levelNote: txt(r[2]).replace(/^\d+\s*/, ''),
      cond: txt(r[3]),
      reward,
      rewardItem: best?.id || null,
      coins: (reward.match(/→\s*(\d+)\s*🪙/) || [])[1] ? Number(reward.match(/→\s*(\d+)\s*🪙/)[1]) : null,
    };
  });
}
data.achievements = parseAchievements();
data.achievementsNote = parasOf(secBody('13')).map(txt);

// ───────────────────────────── раздел 14 (интерфейс) ─────────────────────────────

{
  data.ui = {
    rules: secBody('14.1'),
    windows: (() => { const t = firstTable(secBody('14.2')); return t ? t.rows.map((r) => ({ name: txt(r[0]).replace(/\s*\(.*\)$/, ''), nameNote: (txt(r[0]).match(/\((.*)\)$/) || [])[1] || null, open: txt(r[1]), inside: txt(r[2]), md: r[2] })) : []; })(),
    hud: secBody('14.3'),
    notifications: (() => { const t = firstTable(secBody('14.4')); return t ? t.rows.map((r) => ({ where: txt(r[0]), what: txt(r[1]) })) : []; })(),
    notificationsNote: parasOf(secBody('14.4')).map(txt),
  };
  if (!data.ui.windows.length) warn('14.2: таблица окон не найдена');
}

// ───────────────────────────── раздел 15, 16, 17, 19 ─────────────────────────────

data.locationDoc = secBody('15');
data.assets = (() => {
  const out = { general: secBody('16'), budgets: {}, crops: [], tables: {} };
  const g = norm(secBody('16'));
  const bm = (re) => { const m = g.match(re); return m ? [num(m[1]) * (m[3] ? 1000 : 1), num(m[2]) * (m[3] ? 1000 : 1)] : null; };
  // «стадия культуры 300–1 500, проп 1–5 тыс., NPC 4–8 тыс., босс ≤ 15 тыс., питомец 1,5–3 тыс., косметика 300–1 500»
  const tri = {
    crop: g.match(/стадия культуры\s*([\d ]+)[–-]([\d ]+)/),
    prop: g.match(/проп\s*([\d,]+)[–-]([\d,]+)\s*тыс/),
    npc: g.match(/NPC\s*([\d,]+)[–-]([\d,]+)\s*тыс/),
    boss: g.match(/босс\s*≤\s*([\d ]+)\s*тыс/),
    pet: g.match(/питомец\s*([\d,]+)[–-]([\d,]+)\s*тыс/),
    cosmetic: g.match(/косметика\s*([\d ]+)[–-]([\d ]+)/),
  };
  if (tri.crop) out.budgets.crop = [num(tri.crop[1]), num(tri.crop[2])];
  if (tri.prop) out.budgets.prop = [num(tri.prop[1]) * 1000, num(tri.prop[2]) * 1000];
  if (tri.npc) out.budgets.npc = [num(tri.npc[1]) * 1000, num(tri.npc[2]) * 1000];
  if (tri.boss) out.budgets.boss = [0, num(tri.boss[1]) * 1000];
  if (tri.pet) out.budgets.pet = [num(tri.pet[1]) * 1000, num(tri.pet[2]) * 1000];
  if (tri.cosmetic) out.budgets.cosmetic = [num(tri.cosmetic[1]), num(tri.cosmetic[2])];
  const t161 = firstTable(secBody('16.1'));
  if (t161) {
    out.crops = t161.rows.map((r) => ({
      id: txt(r[0]).replace(/`/g, ''),
      inBed: txt(r[1]),
      stages: txt(r[2]).split('→').map((x) => x.trim()),
      ripe: txt(r[3]),
    }));
  } else warn('16.1: таблица моделей культур не найдена');
  out.cropBudgetText = parasOf(secBody('16.1')).filter((l) => /Треугольники/.test(l)).map(txt).join(' ');
  const sb = norm(secBody('16.1'));
  const stageRe = (n) => { const m = sb.match(new RegExp('стадия\\s*' + n + '\\s*[—-]\\s*([\\d ]+)[–-]([\\d ]+)')); return m ? [num(m[1]), num(m[2])] : null; };
  out.stageBudgets = { 1: stageRe(1), 2: stageRe(2), 3: stageRe(3) };
  const rm = sb.match(/спелая\s*[—-]\s*([\d ]+)[–-]([\d ]+)/);
  out.stageBudgets[4] = rm ? [num(rm[1]), num(rm[2])] : null;
  const big = sb.match(/до\s*([\d ]+)\s*только у крупных/);
  out.bigBudget = big ? num(big[1]) : null;
  for (const k of ['16.2', '16.3', '16.4', '16.5', '16.6', '16.7']) {
    const body = secBody(k);
    const t = firstTable(body);
    out.tables[k] = { title: sec(k)?.title || k, header: t ? t.header.map(txt) : [], rows: t ? t.rows.map((r) => r.map(txt)) : [], text: body };
  }
  out.cropsAnim = parasOf(secBody('16.1')).filter((l) => /^Анимация культур/.test(l)).map(txt).join(' ');
  return out;
})();

data.diffsV10 = (() => {
  const b = sec('19.2') ? secBody('19.2') : secTree('19');
  return bulletsOf(b)
    .filter((l) => /^\*\*/.test(l))
    .map((l) => {
      const m = l.match(/^\*\*(.+?):\*\*\s*(.*)$/);
      if (!m) return null;
      return { title: txt(m[1]), items: txt(m[2]).replace(/\.$/, '').split(/;\s+/).map((s) => s.trim()).filter(Boolean) };
    })
    .filter(Boolean);
})();

// 19.1 — почему поздние культуры не про деньги
data.late = (() => {
  const b = secBody('19.1');
  if (!b) return null;
  const t = firstTable(b);
  const lines = b.split('\n');
  const ti = lines.findIndex((l) => /^\s*\|/.test(l));
  let te = ti;
  while (te < lines.length && /^\s*\|/.test(lines[te])) te++;
  return {
    title: sec('19.1').title,
    intro: lines.slice(0, ti < 0 ? lines.length : ti).join('\n').trim(),
    rows: t ? t.rows.map((r) => ({ what: txt(r[0]), numbers: txt(r[1]), why: txt(r[2]) })) : [],
    outro: ti < 0 ? '' : lines.slice(te).join('\n').trim(),
  };
})();

// «изм.» — все пометки с разделом
data.changes = (() => {
  const out = [];
  let cur = { num: '', title: '' };
  const seen = new Set();
  for (const ln of norm(designMd).split('\n')) {
    const h = ln.match(/^(#{1,6})\s+(?:(\d+(?:\.\d+)*)\.?\s+)?(.*?)\s*$/);
    if (h) { cur = { num: h[2] || '', title: h[3] }; continue; }
    if (!/изм\./.test(ln)) continue;
    if (cur.num === '19' || cur.num.startsWith('19.') || cur.num === '') continue;
    if (/^\*\*Как читать|^- \*\*изм\.\*\* —/.test(ln)) continue;
    let text;
    if (/^\s*\|/.test(ln)) text = splitRow(ln).map(txt).filter(Boolean).join(' · ');
    else text = txt(ln.replace(/^[-*]\s+/, ''));
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push({ section: cur.num, sectionTitle: cur.title, text });
  }
  return out;
})();

// все разделы дизайн-документа целиком (для блоков «подробнее»)
data.docs = {};
for (const h of D.heads) if (h.num) data.docs[h.num] = { title: h.title, level: h.level, body: h.body };

// ───────────────────────────── симуляция ─────────────────────────────

const r1 = (v, d = 1) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
function compactStat(s) {
  return s ? { reached: r1(s.reached, 3), mean: r1(s.mean), p50: r1(s.p50), p90: r1(s.p90) } : null;
}
function compactArch(a) {
  const out = {
    runs: a.runs,
    levels: {},
    beds: {},
    goals: {},
    complete: { real: compactStat(a.complete?.real), active: compactStat(a.complete?.active) },
    completePlus: { real: compactStat(a.completePlus?.real), active: compactStat(a.completePlus?.active) },
    final: a.final ? { endDays: r1(a.final.endDays), levelMean: r1(a.final.levelMean), bedsMean: r1(a.final.bedsMean) } : null,
    maxGap: a.maxGap ? { meanH: r1(a.maxGap.meanH), p90H: r1(a.maxGap.p90H), endedBy: a.maxGap.endedBy } : null,
    ordersPerDay: r1(a.ordersPerDay, 2), vanDealsPerDay: r1(a.vanDealsPerDay, 2), helpsGivenPerDay: r1(a.helpsGivenPerDay, 2), helpsGotPerDay: r1(a.helpsGotPerDay, 2), bossBuffs: r1(a.bossBuffs, 1),
    refills: (a.refillsPerActiveHour || []).map((x) => r1(x, 2)),
    harvestShare: Object.fromEntries(Object.entries(a.harvestShare || {}).map(([k, v]) => [k, r1(v, 3)])),
    xpSources: Object.fromEntries(Object.entries(a.xpSources || {}).map(([k, v]) => [k, r1(v, 3)])),
  };
  for (const [L, v] of Object.entries(a.levels || {})) out.levels[L] = { real: compactStat(v.real), active: compactStat(v.active) };
  for (const [n, v] of Object.entries(a.beds || {})) out.beds[n] = { gate: v.gate, real: compactStat(v.real), active: compactStat(v.active), lag: compactStat(v.lagAfterGate?.real ? v.lagAfterGate.real : v.lagAfterGate), blocker: v.blocker || null };
  for (const [n, v] of Object.entries(a.goals || {})) out.goals[n] = { gate: v.gate, real: compactStat(v.real), lag: compactStat(v.lagAfterGate), blocker: v.blocker || null };
  const inc = a.income || {};
  out.income = {
    netPerActiveMin: r1(inc.netPerActiveMin), netPerActiveMinP90: r1(inc.netPerActiveMinP90), netPerRealHour: r1(inc.netPerRealHour), netPerDay: r1(inc.netPerDay), activeMinPerDay: r1(inc.activeMinPerDay),
    spentGoals: inc.spentGoals, netTotal: r1(inc.netTotal, 0), seeds: r1(inc.seeds, 0),
    bySource: Object.fromEntries(Object.entries(inc.bySource || {}).map(([k, v]) => [k, r1(v, 0)])),
    phases: (inc.phases || []).map((p) => ({ label: p.label, activeMin: r1(p.activeMin, 0), realH: r1(p.realH, 0), netPerActiveMin: r1(p.netPerActiveMin), netPerDay: r1(p.netPerDay, 0), xpPerActiveMin: r1(p.xpPerActiveMin) })),
  };
  if (a.finale) out.finale = { source: a.finale.source, netPerDay: r1(a.finale.netPerDay, 0), perActiveMin: r1(a.finale.perActiveMin), capCutPerDay: r1(a.finale.capCutPerDay, 0), srcPerDay: Object.fromEntries(Object.entries(a.finale.srcPerDay || {}).map(([k, v]) => [k, r1(v, 0)])) };
  out.daily = (a.dailyCurve || []).map((d) => [d.day, r1(d.level, 2), r1(d.beds, 2), d.net, d.activeMin, d.xp]);
  return out;
}

function parseSim() {
  const raw = read(P.results);
  if (!raw) { warn('нет results.json — раздел «Экономика» будет без графиков'); return null; }
  let r;
  try { r = JSON.parse(raw); } catch (e) { warn('results.json не читается: ' + e.message); return null; }
  const sim = { generated: r.generated, runs: r.runs, recommendedK: r.recommendedK, override: r.override || {}, presets: {}, presetOrder: Object.keys(r.presets || {}), kTable: null };
  for (const [name, p] of Object.entries(r.presets || {})) {
    const cropsFinal = (p.numbers?.crops || []).map((c) => ({ sim: c.id, name: c.name, lvl: c.lvl, min: c.min, xp: c.xp, sec: c.sec, chance: c.chance, seed: c.seed, sell: c.sell, profit: c.profit, coinsH: c.coinsH, xpH: c.xpH, vanLimit: c.vanLimit }));
    sim.presets[name] = {
      K: p.K,
      cropRows: (p.crops?.rows || []).map((c) => ({ sim: c.id, name: c.name, lvl: c.lvl, min: c.min, xp: c.xp, profit: c.profit, coinsH: c.coinsH, xpH: c.xpH, sec: c.sec, chance: c.chance, secPerH: c.secPerH, demand: c.demand })),
      dominance: p.crops?.dominance || [],
      crops: cropsFinal,
      goals: (p.numbers?.goals || []).map((g) => ({ id: g.id, kind: g.kind, lvl: g.lvl, coins: g.coins, res: g.res })),
      orders: p.numbers?.orders || null,
      other: p.numbers?.other || null,
      archetypes: Object.fromEntries(Object.entries(p.archetypes || {}).map(([k, a]) => [k, compactArch(a)])),
    };
  }
  if (Array.isArray(r.kTable)) {
    sim.kTable = r.kTable.map((row) => ({ K: row.K, arch: Object.fromEntries(Object.entries(row.arch || {}).map(([a, v]) => [a, Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'number' ? r1(x, 2) : x]))])) }));
  }
  // главный пресет: v11 (итог), иначе tweaked, иначе первый
  sim.primary = ['v11', 'tweaked', 'base'].find((n) => sim.presets[n]) || sim.presetOrder[0];
  sim.hasFinal = Boolean(sim.presets.v11);
  return sim;
}
data.sim = parseSim();

// RESULTS.md: архетипы, разделы; раздел «Итоговые числа v11» подхватывается сам
function parseResultsMd() {
  const md = read(P.resultsMd);
  if (!md) { warn('нет RESULTS.md'); return null; }
  const S = parseSections(md);
  const out = { title: txt(md.split('\n')[0].replace(/^#\s*/, '')), sections: [], final: null, archetypes: null, mtime: mtime(P.resultsMd) };
  for (const h of S.heads) {
    if (h.level !== 2) continue;
    const entry = { title: h.title, md: h.tree };
    out.sections.push(entry);
    if (/Итоговые числа/i.test(h.title)) out.final = entry;
  }
  const arch = S.heads.find((h) => /Архетипы/.test(h.title));
  if (arch) {
    const t = firstTable(arch.body);
    if (t) out.archetypes = t.rows.map((r) => ({ label: txt(r[0]), schedule: txt(r[1]), perDay: txt(r[2]) }));
  }
  out.intro = S.lines.slice(1, S.heads[1]?.i ?? 12).filter((l) => l.trim()).map(txt).join(' ');
  return out;
}
data.resultsMd = parseResultsMd();
if (data.resultsMd && !data.resultsMd.final) notes.push('RESULTS.md: раздела «Итоговые числа v11» пока нет — страница показывает итоговые цены из results.json (пресет v11), как только раздел появится, он подхватится сам');

data.archLabels = { ...ARCH_FALLBACK };
if (data.resultsMd?.archetypes) {
  const m = { 'Казуал': 'casual', 'Активный': 'active', 'Только быстрые': 'fast', 'Нон-стоп (контроль)': 'nonstop' };
  for (const a of data.resultsMd.archetypes) if (m[a.label]) data.archLabels[m[a.label]] = a.label;
}

// ───────────────────────────── локация ─────────────────────────────

function parseLocation() {
  const layoutRaw = read(P.layout);
  if (!layoutRaw) { warn('нет layout.json'); return null; }
  const layout = JSON.parse(layoutRaw);
  const out = {
    svg: rel(P.map),
    bounds: layout.bounds,
    cell: layout.cell,
    jelly: layout.jelly,
    rule: layout.rule?.text || '',
    well: layout.well,
    troughs: layout.troughs.map((t) => ({ id: t.id, x: t.x, z: t.z, w: t.w, d: t.d, h: t.h, use: t.use })),
    plot: layout.plot,
    plotLocal: layout.plotLocal,
    plots: layout.plots.map((p) => ({ n: p.n, trough: p.trough, x: p.x, z: p.z, yaw: p.yaw, w: p.w, l: p.l, gate: p.gate, corners: p.corners, use: p.use, sign: p.sign, angleDeg: p.angleDeg })),
    objects: layout.objects.map((o) => ({ id: o.id, name: o.name, x: o.x, z: o.z, yaw: o.yaw, note: o.note || '', foot: o.foot, use: o.use || null, solid: (o.solid || []).map((s) => ({ min: s.min, max: s.max })) })),
    spawns: layout.spawns,
    paths: layout.paths,
    trees: layout.trees,
    nooks: layout.nooks,
    boxes: layout.boxes,
    plazaGate: layout.plazaGate,
    van: layout.van || null,
    counts: { plots: layout.plots.length, objects: layout.objects.length, trees: layout.trees.length, boxes: layout.boxes.length },
  };
  // level.md: таблицы
  const lm = read(P.levelMd);
  if (lm) {
    const L = parseSections(lm);
    const tabs = tablesIn(lm);
    const where = tabs.find((t) => /Что/.test(t.header[0]) && /Подсказка/.test(t.header.join(' ')));
    out.where = where ? where.rows.map((r) => ({ what: txt(r[0]), at: txt(r[1]), looks: txt(r[2]), use: txt(r[3]), hint: txt(r[4]) })) : [];
    const corners = tabs.find((t) => /Угол/.test(t.header[0]));
    out.corners = corners ? corners.rows.map((r) => ({ corner: txt(r[0]), what: txt(r[1]), why: txt(r[2]) })) : [];
    const plotTab = tabs.find((t) => /Грядка/.test(t.header[0]) && /Открывается/.test(t.header.join(' ')));
    out.bedsDoc = plotTab ? plotTab.rows.map((r) => ({ bed: txt(r[0]), at: txt(r[1]), opens: txt(r[2]), cost: txt(r[3]) })) : [];
    const states = tabs.find((t) => /Состояние/.test(t.header[0]));
    out.states = states ? states.rows.map((r) => ({ state: txt(r[0]), sign: txt(r[1]), seen: txt(r[2]) })) : [];
    const sec9 = L.heads.find((h) => h.num === '9');
    const get = (num) => L.heads.find((h) => h.num === num);
    out.md = {
      short: L.heads.find((h) => h.title === 'Коротко')?.body || '',
      image: get('1')?.body || '',
      scale: get('2')?.body || '',
      layout: get('3')?.tree || '',
      plot: get('4')?.body || '',
      where: get('5')?.body || '',
      paths: get('6')?.body || '',
      states: get('7')?.body || '',
      noticeable: get('8')?.body || '',
      gate: sec9?.tree || '',
      collisions: get('10')?.body || '',
      budget: get('11')?.body || '',
      disputed: get('12')?.body || '',
    };
    const budget = tabs.find((t) => /Группа/.test(t.header[0]));
    out.budgetTable = budget ? { header: budget.header.map(txt), rows: budget.rows.map((r) => r.map(txt)) } : null;
  } else warn('нет level.md');
  return out;
}
data.location = parseLocation();

// ───────────────────────────── файлы: иконки, модели, рендеры ─────────────────────────────

function walk(dir, exts) {
  const out = [];
  if (!existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const n of readdirSync(d)) {
      if (n.startsWith('.')) continue;
      const p = join(d, n);
      const st = statSync(p);
      if (st.isDirectory()) stack.push(p);
      else if (exts.includes(extname(n).toLowerCase())) out.push(p);
    }
  }
  return out.sort();
}

data.icons = Object.fromEntries(walk(P.icons, ['.png', '.webp']).filter((p) => !basename(p).startsWith('_')).map((p) => [basename(p, extname(p)), rel(p)]));
data.iconSheet = existsSync(join(P.icons, '_sheet.png')) ? rel(join(P.icons, '_sheet.png')) : null;
data.resKeys = RES.map((r) => ({ key: r.key, name: r.name, icon: r.icon }));

function readGlb(file) {
  const buf = readFileSync(file);
  if (buf.length < 20 || buf.readUInt32LE(0) !== 0x46546c67) return { error: 'не GLB' };
  const jsonLen = buf.readUInt32LE(12);
  const j = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
  let tris = 0;
  let verts = 0;
  for (const m of j.meshes || []) {
    for (const p of m.primitives || []) {
      const mode = p.mode ?? 4;
      const pos = j.accessors?.[p.attributes?.POSITION];
      if (pos) verts += pos.count;
      if (mode === 4) tris += p.indices != null ? j.accessors[p.indices].count / 3 : pos ? pos.count / 3 : 0;
      else if (mode === 5 || mode === 6) tris += Math.max(0, (p.indices != null ? j.accessors[p.indices].count : pos?.count || 0) - 2);
    }
  }
  // габариты по минимумам/максимумам POSITION (без учёта трансформаций узлов — оценка)
  let mn = [Infinity, Infinity, Infinity];
  let mx = [-Infinity, -Infinity, -Infinity];
  for (const m of j.meshes || []) for (const p of m.primitives || []) {
    const a = j.accessors?.[p.attributes?.POSITION];
    if (a?.min && a?.max) for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], a.min[i]); mx[i] = Math.max(mx[i], a.max[i]); }
  }
  const size = Number.isFinite(mn[0]) ? [r1(mx[0] - mn[0], 3), r1(mx[1] - mn[1], 3), r1(mx[2] - mn[2], 3)] : null;
  const meshTris = (mi) => {
    let t = 0;
    for (const p of j.meshes?.[mi]?.primitives || []) {
      const mode = p.mode ?? 4;
      const pos = j.accessors?.[p.attributes?.POSITION];
      if (mode === 4) t += p.indices != null ? j.accessors[p.indices].count / 3 : pos ? pos.count / 3 : 0;
    }
    return t;
  };
  const nodeTris = (ni, depth = 0) => {
    const n = j.nodes?.[ni];
    if (!n || depth > 32) return 0;
    return (n.mesh != null ? meshTris(n.mesh) : 0) + (n.children || []).reduce((a, c) => a + nodeTris(c, depth + 1), 0);
  };
  const rootIdx = j.scenes?.[j.scene ?? 0]?.nodes || [];
  const sceneNodes = rootIdx.map((i) => j.nodes?.[i]?.name).filter(Boolean);
  const variants = rootIdx.map((i) => ({ name: j.nodes?.[i]?.name || 'node' + i, tris: Math.round(nodeTris(i)) }));
  return {
    tris: Math.round(tris),
    verts,
    meshes: (j.meshes || []).length,
    nodes: (j.nodes || []).length,
    materials: (j.materials || []).length,
    textures: (j.textures || []).length,
    anims: (j.animations || []).map((a, i) => a.name || 'anim' + i),
    skins: (j.skins || []).length,
    rootNodes: sceneNodes,
    variants,
    size,
    ext: j.extensionsUsed || [],
    generator: j.asset?.generator || '',
  };
}

const slug = (s) => norm(s).toLowerCase().replace(/[\s_.]+/g, '-').replace(/[^a-z0-9а-яё-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');

// ключи для сопоставления: косметика, питомцы, NPC, объекты
const COSMETIC_KEYS = data.cosmetics.map((c) => ({ id: c.id, key: c.id.split(':')[1], slot: c.slotKey }));
const PET_KEYS = data.pets.map((p) => ({ id: p.id, key: p.id.split(':')[1] }));
const PROP_ALIASES = {
  well: ['well', 'kolodets'],
  trough: ['trough', 'koryto'],
  semechkin: ['semechkin', 'seed-stall', 'seedstall', 'seed-stand', 'stall-seeds', 'lotok'],
  grib: ['grib-kiosk', 'kiosk', 'mushroom-kiosk', 'mushroom-stall'],
  orders: ['orders', 'order-board', 'orderboard', 'quest-board'],
  farmBoard: ['farm-board', 'farmboard', 'plots-board'],
  cart: ['cart', 'telega', 'hay-cart'],
  van: ['van', 'furgon', 'truck'],
  campfire: ['campfire', 'bonfire', 'fireplace', 'fire'],
  boss: ['pedestal', 'stump'],
  lantern: ['lantern', 'lamp', 'lamppost'],
  gate: ['gate', 'arch', 'wicket', 'plaza-gate'],
  apple: ['apple-tree', 'appletree'],
  haystack: ['haystack', 'hay-stack', 'hay'],
  hive: ['beehive', 'hive'],
  compost: ['compost'],
  pig: ['pig', 'pigpen', 'pig-pen', 'truffle-pig'],
  chest: ['chest', 'crate', 'khozyaistvo'],
  fence: ['fence', 'plet'],
};

function classify(name, dirParts) {
  const s = slug(name);
  const dirs = dirParts.map(slug);
  const full = slug([...dirParts, name].join('-'));
  const has = (alias) => new RegExp('(^|-)' + alias + '(-|$)').test(full);
  const aliasList = CROPS.flatMap((c) => c.alias.map((a) => ({ a: slug(a), id: c.id }))).sort((x, y) => y.a.length - x.a.length);
  const asCrop = () => {
    for (const { a, id } of aliasList) {
      if (!has(a)) continue;
      let stage = null;
      const rest = full.replace(a, '');
      const m = rest.match(/(?:stage|st|s|стад\w*)?-?([1-4])(?:-|$)/);
      if (/(^|-)(ripe|mature|ready|final|harvest|grown|spelaya|spely|full)(-|$)/.test(rest)) stage = 4;
      else if (m) stage = Number(m[1]);
      return { category: 'crop', ref: { type: 'crop', id, stage } };
    }
    return null;
  };
  const asCosmetic = () => {
    for (const c of COSMETIC_KEYS) {
      if (!['h', 'u', 'l', 'a', 'tl', 'pl', 'f'].includes(c.slot)) continue;
      const k = slug(c.key);
      if (s === k || s === c.slot + '-' + k || has(c.slot + '-' + k) || has('cos-' + c.slot + '-' + k) || has('cos-' + k) || has(k)) return { category: 'cosmetic', ref: { type: 'cosmetic', id: c.id } };
    }
    return null;
  };
  const asPet = (strict) => {
    for (const p of PET_KEYS) {
      const k = slug(p.key);
      if (s === k || s === 'pet-' + k || s === 's-' + k || has('pet-' + k) || (!strict && has(k))) return { category: 'pet', ref: { type: 'pet', id: p.id } };
    }
    if (/(^|-)pets?(-|$)/.test(full)) return { category: 'pet', ref: { type: 'pet', id: null } };
    return null;
  };
  const asNpc = () => {
    if (/(semechkin|семечкин)/.test(full) && !/stall|lotok|stand|kiosk/.test(full)) return { category: 'npc', ref: { type: 'npc', id: 'semechkin' } };
    if (/(^|-)(grib|uncle-grib|gribok)(-|$)/.test(full) && !/kiosk|stall|stand/.test(full)) return { category: 'npc', ref: { type: 'npc', id: 'grib' } };
    if (/(zina|зина)/.test(full)) return { category: 'npc', ref: { type: 'npc', id: 'zina' } };
    if (/(^|-)(galya|galia)(-|$)/.test(full)) return { category: 'npc', ref: { type: 'npc', id: 'galya' } };
    if (/(^|-)npc(-|$)/.test(full)) return { category: 'npc', ref: { type: 'npc', id: null } };
    return null;
  };
  const asTool = () => {
    const tool = full.match(/(^|-)(rake|watering-can|wateringcan|can|shovel|trowel|bucket|tools?)(?:-(\d|gold|golden))?(-|$)/);
    if (!tool) return null;
    const id = tool[2].replace('watering-can', 'can').replace('wateringcan', 'can').replace('trowel', 'shovel').replace(/^tools?$/, 'all');
    return { category: 'tool', ref: { type: 'tool', id, variant: tool[3] || null } };
  };
  const asBed = () => (/(^|-)(bed|plot|garden-bed)(-|$)/.test(full) ? { category: 'bed', ref: { type: 'bed', id: /plot/.test(full) ? 'plot' : 'bed' } } : null);
  const asProp = () => {
    for (const [id, aliases] of Object.entries(PROP_ALIASES)) for (const a of aliases) if (has(slug(a))) return { category: 'prop', ref: { type: 'prop', id } };
    return null;
  };
  const asBoss = () => {
    if (/(^|-)(boss|tree-boss|rift|razlom)(-|$)|razlom/.test(full)) return { category: 'boss', ref: { type: 'boss', id: 'boss', variant: s } };
    if (/(^|-)(pinecone|pine-cone|shishka)(-|$)/.test(full)) return { category: 'boss', ref: { type: 'boss', id: 'pinecone' } };
    return null;
  };
  // 1. явные префиксы имени или подпапки
  const pre = (re) => re.test(s) || dirs.some((d) => re.test(d + '-'));
  if (pre(/^(crops?)[-]/)) { const r = asCrop(); if (r) return r; }
  if (pre(/^(cos|cosmetics?|[hulaf])[-]/)) { const r = asCosmetic(); if (r) return r; }
  if (pre(/^(pets?)[-]/)) { const r = asPet(false); if (r) return r; }
  if (pre(/^npc[-]/)) { const r = asNpc(); if (r) return r; }
  if (pre(/^(boss)[-]/)) { const r = asBoss(); if (r) return r; }
  if (pre(/^(tools?)[-]/)) { const r = asTool(); if (r) return r; }
  // 2. подпапки-категории
  const dirCat = dirs.find((d) => /^(crops?|cosmetics?|pets?|npcs?|bosse?s?|tools?|props?|objects?|buildings?|location)$/.test(d));
  if (dirCat) {
    const m = { crop: asCrop, cosmetic: asCosmetic, pet: () => asPet(false), npc: asNpc, boss: asBoss, tool: asTool }[dirCat.replace(/s$/, '').replace(/^cosmetic$/, 'cosmetic').replace(/^objec?t$/, 'prop')];
    const r = m && m();
    if (r) return r;
    if (/^(props?|objects?|buildings?|location)$/.test(dirCat)) return asProp() || { category: 'prop', ref: { type: 'prop', id: null } };
  }
  // 3. по имени: босс → растения → косметика → NPC → питомцы (строго) → инструменты → грядка → объекты
  return asBoss() || asCrop() || asCosmetic() || asNpc() || asPet(true) || asTool() || asBed() || asProp() || { category: 'other', ref: null };
}

const CATEGORY_LABEL = {
  crop: 'Культуры', cosmetic: 'Косметика', pet: 'Питомцы', npc: 'NPC', boss: 'Босс', tool: 'Инструменты', bed: 'Грядка и участок', prop: 'Объекты и постройки', other: 'Прочее',
};

// MODELS.md — описания от художников: строки таблицы с именем .glb
function parseModelsMd() {
  const md = read(P.modelsMd);
  if (!md) return { exists: false, text: '', rows: {} };
  const rows = {};
  for (const t of tablesIn(md)) {
    for (const r of t.rows) {
      const joined = r.join(' ');
      const m = joined.match(/([A-Za-z0-9_\-./]+\.glb)/);
      if (m) {
        const key = slug(basename(m[1], '.glb'));
        rows[key] = { header: t.header.map(txt), cells: r.map(txt) };
      }
    }
  }
  return { exists: true, text: md, rows, mtime: mtime(P.modelsMd) };
}
const modelsMd = parseModelsMd();

const renderFiles = walk(P.renders, ['.png', '.jpg', '.jpeg', '.webp']);
data.renders = renderFiles.map((p) => ({ path: rel(p), name: basename(p, extname(p)), size: statSync(p).size, mtime: mtime(p) }));

data.models = walk(P.models, ['.glb']).map((p) => {
  const name = basename(p, '.glb');
  const dirParts = relative(P.models, dirname(p)).split(sep).filter(Boolean);
  let info;
  try { info = readGlb(p); } catch (e) { info = { error: e.message }; warn('GLB не читается: ' + rel(p) + ' — ' + e.message); }
  const cls = classify(name, dirParts);
  const nm = slug(name);
  const render = renderFiles.find((r) => slug(basename(r, extname(r))) === nm) || renderFiles.find((r) => slug(basename(r, extname(r))).startsWith(nm + '-')) || null;
  const st = statSync(p);
  const meta = modelsMd.rows[nm] || null;
  return {
    path: rel(p),
    name,
    dir: dirParts.join('/'),
    size: st.size,
    mtime: st.mtime.toISOString(),
    ...info,
    category: cls.category,
    ref: cls.ref,
    render: render ? rel(render) : null,
    note: meta,
  };
});

// бюджет треугольников по стадиям культуры (узлы stage0..stage3 внутри одного GLB)
const BIG_CROPS = ['pumpkin', 'giant-mushroom', 'life-tree', 'golden-apple', 'mythic-mushroom', 'dragon-fruit'];
for (const m of data.models) {
  if (m.category !== 'crop' || !m.variants) continue;
  m.variants.forEach((v) => {
    const mm = v.name.match(/^stage[-_]?(\d)$/i);
    if (!mm) return;
    const idx = Number(mm[1]); // stage0 — первая стадия, stage3 — спелая
    const b = data.assets.stageBudgets?.[idx + 1];
    if (!b) return;
    const hi = BIG_CROPS.includes(m.ref?.id) && data.assets.bigBudget ? data.assets.bigBudget : b[1];
    v.stageNo = idx + 1;
    v.budget = [b[0], hi];
    v.over = v.tris > hi;
  });
}

// сопоставление с объектами сцены
data.scene = { assets: {}, assetsByCategory: {} };
for (const m of data.models) {
  if (m.ref?.type === 'prop' && m.ref.id) data.scene.assets[m.ref.id] = data.scene.assets[m.ref.id] || m.path;
  if (m.ref?.type === 'bed') data.scene.assets[m.ref.id] = m.path;
}

// ожидаемое количество моделей по категориям (из раздела 16 и каталога)
data.expected = (() => {
  const A = data.assets;
  const cos = data.cosmetics.filter((c) => ['h', 'u', 'l', 'a', 'tl', 'pl'].includes(c.slotKey)).length;
  const props = (A.tables['16.2']?.rows.length || 0) + (A.tables['16.3']?.rows.length || 0) + (A.tables['16.6']?.rows.length || 0);
  const npcRows = (A.tables['16.4']?.rows || []).filter((r) => !/своей модели не нужно/.test(r.join(' '))).length;
  return {
    crop: { count: (A.crops.length || data.crops.length) * 4, note: 'каждая культура — 3 стадии роста и спелая' },
    cosmetic: { count: cos, note: 'шапки, верх, низ, аксессуары, скины, декор участка (эффекты, эмоции, значки без модели)' },
    pet: { count: data.pets.length, note: 'ходячие питомцы с анимациями idle / follow / happy' },
    npc: { count: npcRows, note: 'Семечкин, Дядюшка Гриб, Тётя Зина' },
    boss: { count: 2, note: 'Древо разлома и шишка-ворчунья' },
    tool: { count: (A.tables['16.7']?.rows.length || 0), note: 'грабли, лейка, лопатка, ведро (скины по уровням)' },
    prop: { count: props, note: 'грядка/участок, объекты локации, постройки участка' },
  };
})();

// ───────────────────────────── редакторский слой ─────────────────────────────

function parseEditorial() {
  const raw = read(P.editorial);
  if (!raw) { warn('нет editorial.json — на обложке не будет отобранных карточек и вопросов'); return null; }
  const e = JSON.parse(raw);
  const vars = {
    K: data.sim?.presets?.[data.sim?.primary]?.K ?? data.economy.kDoc ?? 0.1,
    recommendedK: data.sim?.recommendedK ?? 0.1,
    plots: data.location?.counts?.plots ?? 20,
    crops: data.crops.length,
    achievements: data.achievements.length,
    pets: data.pets.length,
    levels: data.levels.unlock.length || 13,
    targetActive: data.economy.targets ? data.economy.targets.active.join('–') : '',
    targetCasual: data.economy.targets ? data.economy.targets.casual.join('–') : '',
    earlyPerMin: (() => { const v = data.sim?.presets?.[data.sim?.primary]?.archetypes?.casual?.income?.phases?.[0]?.netPerActiveMin; return v != null ? Math.round(v) : '?'; })(),
    bossPerN: data.boss.health.perN,
    bossNMin: data.boss.health.nMin,
    bossNMax: data.boss.health.nMax,
    repPerDay: data.helpNums?.repPerDay ?? '?',
    cropStagesTotal: data.models.filter((m) => m.category === 'crop').reduce((a, m) => a + (m.variants || []).filter((v) => v.budget).length, 0),
    cropStagesOver: data.models.filter((m) => m.category === 'crop').reduce((a, m) => a + (m.variants || []).filter((v) => v.over).length, 0),
  };
  const sub = (s) => (typeof s === 'string' ? s.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] != null ? String(vars[k]).replace('.', ',') : '?')) : s);
  data.editorialVars = vars;
  const deep = (o) => (Array.isArray(o) ? o.map(deep) : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, deep(v)])) : sub(o));
  const out = deep(e);
  out.questions = (out.questions || []).filter((q) => !q.requires || vars[q.requires]);
  // цитаты из документа
  out.quotes = (e.quotes || []).map((q) => {
    const text = quote(q.find);
    if (!text) warn('editorial: цитата не найдена в документе: «' + q.find + '»');
    let t = text ? txt(text) : null;
    if (t && /^\|/.test(text.trim())) { const cells = splitRow(text).map(txt).filter(Boolean); t = cells[0] + ': ' + cells.slice(1).join(' '); }
    if (t && q.from && t.includes(q.from)) t = t.slice(t.indexOf(q.from));
    if (t) t = t.replace(/^[¹²³⁴⁵⁶⁷⁸⁹]\s*/, '');
    return { ...q, text: t };
  }).filter((q) => q.text);
  return out;
}
data.editorial = parseEditorial();

// ───────────────────────────── метаданные и сводка ─────────────────────────────

data.meta = {
  builtAt: new Date().toISOString(),
  sources: {
    design: { path: rel(P.design), mtime: mtime(P.design), bytes: designMd.length },
    decisions: { path: rel(P.decisions), mtime: mtime(P.decisions) },
    results: { path: rel(P.results), mtime: mtime(P.results), generated: data.sim?.generated || null },
    resultsMd: { path: rel(P.resultsMd), mtime: mtime(P.resultsMd), hasFinalSection: Boolean(data.resultsMd?.final) },
    layout: { path: rel(P.layout), mtime: mtime(P.layout) },
    modelsMd: { path: rel(P.modelsMd), exists: modelsMd.exists, mtime: modelsMd.mtime || null },
  },
  counts: {
    crops: data.crops.length, upgrades: data.upgrades.length, cosmetics: data.cosmetics.length, pets: data.pets.length, achievements: data.achievements.length,
    orders: data.orders.templates.length, decisions: data.decisions.length, changes: data.changes.length, icons: Object.keys(data.icons).length,
    models: data.models.length, renders: data.renders.length,
  },
  categoryLabels: CATEGORY_LABEL,
  modelsMd: modelsMd.exists ? { text: modelsMd.text } : null,
  warnings: warns,
};
data.cropRegistry = CROPS.map(({ id, sim, icon, name }) => ({ id, sim, icon, name }));

// проверки полноты
if (data.crops.length !== 19) warn(`культур разобрано ${data.crops.length}, а в документе должно быть 19`);
if (data.levels.unlock.length !== 13) warn(`уровней разобрано ${data.levels.unlock.length}, ожидалось 13`);
if (data.achievements.length < 20) warn(`достижений разобрано ${data.achievements.length}`);
if (data.rep.length !== 8) warn(`ступеней репутации разобрано ${data.rep.length}, ожидалось 8`);
for (const c of data.crops) if (!data.icons[c.icon]) warn(`нет иконки для культуры ${c.id} (${c.icon}.png)`);
const upSum = data.upgrades.reduce((s, u) => s + (u.cost || 0), 0);
data.meta.upgradesTotal = upSum;

writeFileSync(P.out, JSON.stringify(data));

const byCat = {};
for (const m of data.models) byCat[m.category] = (byCat[m.category] || 0) + 1;
console.log(`data.json: ${(statSync(P.out).size / 1024).toFixed(0)} КБ`);
console.log(`  культур ${data.crops.length}, уровней ${data.levels.unlock.length}, улучшений ${data.upgrades.length} (сумма 🪙 ${upSum}), заказов-шаблонов ${data.orders.templates.length}, вещей ${data.cosmetics.length}, питомцев ${data.pets.length}, достижений ${data.achievements.length}, пометок «изм.» ${data.changes.length}`);
console.log(`  симуляция: ${data.sim ? data.sim.presetOrder.join(', ') + ' (главный ' + data.sim.primary + ', таблица K: ' + (data.sim.kTable ? 'есть' : 'нет') + ')' : 'нет'}; итоговый раздел в RESULTS.md: ${data.resultsMd?.final ? 'есть' : 'нет'}`);
console.log(`  иконок ${Object.keys(data.icons).length}, моделей ${data.models.length}${data.models.length ? ' (' + Object.entries(byCat).map(([k, v]) => `${CATEGORY_LABEL[k]} ${v}`).join(', ') + ')' : ''}, рендеров ${data.renders.length}, MODELS.md: ${modelsMd.exists ? 'есть' : 'нет'}`);
for (const n of notes) console.log('  примечание: ' + n);
if (warns.length) console.log('Предупреждения:\n' + warns.map((w) => '  ! ' + w).join('\n'));
else console.log('Предупреждений нет.');

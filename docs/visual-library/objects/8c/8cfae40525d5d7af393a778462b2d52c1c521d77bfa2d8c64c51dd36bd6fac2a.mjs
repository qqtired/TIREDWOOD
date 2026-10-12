#!/usr/bin/env node
// Только данные обзора предложения: бриф + расчётная модель + существующая геометрия.
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const farm = resolve(here, '..');
const sources = {
  brief: join(farm, 'pack1-2026-10-11.md'),
  balance: join(farm, 'pack1-balance.json'),
  layout: join(farm, 'level/layout.json'),
};
const sourceText = Object.fromEntries(Object.entries(sources).map(([k, p]) => [k, readFileSync(p, 'utf8')]));
const brief = sourceText.brief;
const balance = JSON.parse(sourceText.balance);
const layout = JSON.parse(sourceText.layout);
const clean = (s) => s.replace(/\*\*|`/g, '').replace(/<br\s*\/?\s*>/gi, ' ').trim();
const number = (s) => Number(s.replace(/−/g, '-').replace(',', '.').trim());
const match = (re, label) => {
  const m = brief.match(re);
  if (!m) throw new Error('Бриф: не удалось прочитать ' + label);
  return m;
};
const cells = (s) => s.trim().replace(/^\|\s*|\s*\|$/g, '').split(/(?<!\\)\|/).map((v) => clean(v.replace(/\\\|/g, '|')));

// Все таблицы с номером/ID, включая новые таблицы и дополнительные строки брифа.
let heading = '', group = null;
const requirementGroups = [];
const sections = [];
for (const line of brief.split('\n')) {
  if (/^##\s/.test(line)) {
    heading = line.replace(/^##\s+/, '');
    sections.push({ title: heading, lines: [] });
    group = null;
  } else {
    sections.at(-1)?.lines.push(line);
  }
  if (!line.trim().startsWith('|')) { group = null; continue; }
  const row = cells(line);
  if (row.every((c) => /^:?-+:?$/.test(c))) continue;
  if (/^(№|ID)$/i.test(row[0])) {
    group = { title: heading, columns: row, items: [] };
    requirementGroups.push(group);
  } else if (group && row[0]) {
    group.items.push({ id: row[0], title: row[1] || '', acceptance: row.slice(2).join(' · ') });
  }
}
const allItems = requirementGroups.flatMap((g) => g.items);
for (const id of [...Array.from({ length: 17 }, (_, i) => String(i)), ...Array.from({ length: 14 }, (_, i) => 'V' + (i + 1))]) {
  if (!allItems.some((r) => r.id === id)) throw new Error('Потерян обязательный пункт ' + id);
}
if (balance.crops.length !== 19 || balance.total.length !== 13) throw new Error('Ожидались 19 культур и 13 уровней модели');
if (new Set(balance.crops.map((c) => c.id)).size !== balance.crops.length || balance.next.length !== balance.total.length - 1) throw new Error('Неверные идентификаторы культур или длина XP');
if (balance.total[0] !== 0 || balance.next.some((n, i) => balance.total[i] + n !== balance.total[i + 1])) throw new Error('Пороги XP не совпадают с шагами');
if (balance.scenarios.some((s) => s.levelHours.length !== balance.total.length || ![s.p10, s.p50, s.p90, ...s.levelHours].every(Number.isFinite))) throw new Error('Неполные числа сценария');

const plotDims = match(/Участок остаётся ([\d,]+)×([\d,]+) м/, 'размер участка');
const bedRows = match(/колонки x=±([\d,]+) и пять рядов z=([^;]+); размер ([\d,]+) м/, 'десять грядок');
const pondCenter = match(/Пруд: центр \(([\d,−-]+);([\d,−-]+)\), вода ([\d,]+)×([\d,]+) м/, 'пруд');
const deck = match(/помост x=([\d,−-]+)…([\d,−-]+) \/ z=([\d,−-]+)…([\d,−-]+)/, 'помост');
const bossFormula = match(/квота реального участника `(\d+) \+ (\d+) × \(уровень − (\d+)\)`/, 'квоту босса');
const unitCap = number(match(/min\((\d+),\s*sale/, 'потолок цены')[1]);
const startBeds = number(match(/Новый профиль начинает с (\d+)/, 'стартовые грядки')[1]);
const maxBeds = number(match(/начальные грядки, максимум (\d+)/, 'максимум грядок')[1]);
const targetHours = match(/за (\d+)[–-](\d+) ч игры/, 'целевое время прогрессии');
// Позднее ведущий добавляет в бриф изображение с alt «Согласованная схема набережной».
const waterfrontImage = sections.filter((s) => /набереж|схем/i.test(s.title)).map((s) => s.lines.join('\n')).join('\n').match(/!\[([^\]]*(?:согласован|выбран)[^\]]*(?:схем|план)[^\]]*)\]\(([^)]+)\)/i);
const x = number(bedRows[1]);
const rows = bedRows[2].split('/').map(number);
const resNames = { root: 'Корешок', fiber: 'Волокно', grain: 'Зёрна', spores: 'Споры', 'crystal-dust': 'Кристаллическая пыль', wood: 'Древесина', 'gold-leaf': 'Золотой лист', scale: 'Чешуйка', 'star-dust': 'Звёздная пыль' };
const scenarioLabels = [
  ['control', 'Контроль: точный сбор, весь полив, постоянный бонус XP'],
  ['overnight', 'По 2 часа в день: визиты каждые 12 минут, 50% полива, один урожай после офлайна'],
  ['XPbuff', 'Визиты каждые 12 минут, 50% полива, постоянный бонус XP'],
  ['25min', 'Визиты каждые 25 минут, 50% полива'],
  ['no water', 'Визиты каждые 12 минут, без полива'],
  ['half watered', 'Визиты каждые 12 минут, 50% полива'],
];
const data = {
  meta: { title: brief.split('\n')[0].replace(/^#\s+/, ''), status: 'Проект следующего пакета, ещё не в игре', builtAt: new Date().toISOString(), sources: Object.entries(sources).map(([key, path]) => ({ key, file: path.replace(resolve(here, '../../..') + '/', ''), href: key === 'layout' ? '../level/layout.json' : '../' + path.split('/').at(-1), mtime: statSync(path).mtime.toISOString(), sha256: createHash('sha256').update(sourceText[key]).digest('hex') })) },
  contract: { startBeds, maxBeds, unitCap, harvestCap: unitCap * 2, maxMinutes: Math.max(...balance.crops.map((c) => c.min)), maxLevel: balance.total.length, maxXp: balance.total.at(-1), targetHours: [number(targetHours[1]), number(targetHours[2])], bossBase: number(bossFormula[1]), bossStep: number(bossFormula[2]), bossLevelOffset: number(bossFormula[3]) },
  requirementGroups,
  sections: sections.map((s) => ({ title: s.title, text: s.lines.filter((line) => !line.trim().startsWith('|')).join('\n').trim() })),
  balance: { ...balance, crops: balance.crops.map((c) => ({ ...c, resourceName: resNames[c.res] || c.res })), scenarios: balance.scenarios.map((s) => ({ ...s, title: scenarioLabels.find(([test]) => s.label.includes(test))?.[1] || s.label, control: s.label.includes('control') })) },
  plot: { w: number(plotDims[1]), l: number(plotDims[2]), bedSize: number(bedRows[3]), path: layout.plotLocal.path, beds: rows.flatMap((z, i) => [{ n: i * 2 + 1, x, z }, { n: i * 2 + 2, x: -x, z }]), fixtures: ['pen', 'compost', 'hive'].map((key) => ({ key, ...layout.plotLocal[key] })) },
  map: { bounds: layout.bounds, plots: layout.plots.map((p) => ({ n: p.n, x: p.x, z: p.z, corners: p.corners })), paths: layout.paths, objects: layout.objects.map(({ id, x, z, name }) => ({ id, x, z, name })), trees: layout.trees },
  pond: { x: number(pondCenter[1]), z: number(pondCenter[2]), w: number(pondCenter[3]), l: number(pondCenter[4]), deck: { x0: number(deck[1]), x1: number(deck[2]), z0: number(deck[3]), z1: number(deck[4]) }, seats: Array.from({ length: 6 }, (_, i) => ({ n: i + 1, x: number(deck[1]) + (i + 0.5) * (number(deck[2]) - number(deck[1])) / 6, z: (number(deck[3]) + number(deck[4])) / 2 })) },
  waterfrontDiagram: waterfrontImage ? { src: /^(https?:|\/)/.test(waterfrontImage[2]) ? waterfrontImage[2] : '../' + waterfrontImage[2], alt: clean(waterfrontImage[1]) } : null,
};
if (data.plot.beds.length !== maxBeds || data.map.plots.length !== 20) throw new Error('Количество мест схемы не совпало с брифом');
writeFileSync(join(here, './pack1-data.json'), JSON.stringify(data, null, 2) + '\n');
console.log(`Пакет 1: ${allItems.length} пунктов в ${requirementGroups.length} таблицах; ${balance.crops.length} культур; ${balance.scenarios.length} сценариев; ${maxBeds} грядок, ${data.pond.seats.length} мест пруда. Генератор обновил только данные обзора.`);

// Сводка решений Лаборатории: каталог идей и прототипов плюс то, что владелец отметил на странице.
//   node tools/lab/decisions.mjs [lab.json или папка DATA_DIR] [--json]
// Без аргумента берёт DATA_DIR/lab.json из переменной окружения; если файла нет, показывает каталог со статусами по умолчанию.
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { CATALOG } from '../../client/lab/experiments.ts';
import { LAB_STATUSES, LAB_STATUS_LABEL, normalizeLabFile } from '../../shared/lab.ts';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const src = args.find((a) => !a.startsWith('--')) ?? process.env.DATA_DIR;

let file = null;
if (src) {
  try {
    file = statSync(src).isDirectory() ? path.join(src, 'lab.json') : src;
  } catch {
    file = null;
  }
}
let raw = null;
if (file) {
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    console.error(`Нет читаемого файла решений (${file}): показываю каталог со статусами по умолчанию.`);
  }
}
const decisions = normalizeLabFile(raw, new Date().toISOString()).decisions;

const rows = CATALOG.map((e) => {
  const d = decisions[e.id];
  return {
    id: e.id,
    title: e.title,
    category: e.category,
    status: d ? d.status : e.live ? 'prototype' : 'idea',
    decided: Boolean(d),
    note: d?.note ?? '',
    at: d?.at ?? null,
    priority: Boolean(e.priority),
    live: Boolean(e.live),
  };
});

if (asJson) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  const order = ['take', 'rework', 'testing', 'prototype', 'idea', 'skip'].filter((s) => LAB_STATUSES.includes(s));
  for (const s of order) {
    const list = rows.filter((r) => r.status === s);
    if (!list.length) continue;
    console.log(`\n${LAB_STATUS_LABEL[s]} (${list.length})`);
    for (const r of list) {
      const mark = `${r.priority ? ' [очень полезно]' : ''}${r.live ? ' [живое превью]' : ''}`;
      console.log(`  ${r.id.padEnd(22)} ${r.title}${mark}${r.note ? `\n      заметка: ${r.note.replace(/\s+/g, ' ')}` : ''}`);
    }
  }
  console.log(`\nВсего карточек: ${rows.length}, решено владельцем: ${rows.filter((r) => r.decided).length}.`);
}

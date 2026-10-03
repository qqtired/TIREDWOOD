// Реестр лаборатории: уникальные id и номера, обязательные поля, безопасные и целые иллюстрации, дисциплина импортов.
// Файлы прототипов не должны тянуть three.js и код отрисовки при загрузке: страница лёгкая, реестр читается без DOM.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { LAB_TITLE_MAX, isLabId } from '../shared/lab.ts';
import { CATALOG, PROTOTYPES } from '../client/lab/experiments.ts';
import { CATEGORIES, type Idea } from '../client/lab/types.ts';

const LAB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'client', 'lab');
const read = (...p: string[]): string => readFileSync(path.join(LAB, ...p), 'utf8');

test('lab: у каждой записи есть всё нужное, id и номера не повторяются', () => {
  assert.ok(CATALOG.length >= 30, 'в каталоге не меньше тридцати идей');
  assert.ok(PROTOTYPES.length >= 6, 'живых прототипов не меньше шести');
  const ids = new Set<string>();
  const nums = new Set<number>();
  for (const e of CATALOG) {
    assert.ok(isLabId(e.id), `id ${e.id}`);
    assert.ok(!ids.has(e.id), `повтор id ${e.id}`);
    ids.add(e.id);
    assert.ok(Number.isInteger(e.n) && e.n >= 1, `номер у ${e.id}`);
    assert.ok(!nums.has(e.n), `повтор номера ${e.n}`);
    nums.add(e.n);
    assert.ok(e.title.length > 1 && e.title.length <= LAB_TITLE_MAX, `название ${e.id}`);
    assert.ok(e.pitch.length >= 20 && e.pitch.length <= 400, `суть ${e.id}`);
    assert.ok(e.fun.length >= 10 && e.fun.length <= 300, `почему весело ${e.id}`);
    assert.ok((CATEGORIES as readonly string[]).includes(e.category), `категория ${e.id}`);
    assert.ok(['S', 'M', 'L'].includes(e.size), `размер ${e.id}`);
    if (e.live) {
      assert.equal(typeof e.live.create, 'function', `create у ${e.id}`);
      assert.ok(e.live.hint.length > 10, `подсказка у ${e.id}`);
    }
  }
  for (const p of PROTOTYPES) assert.ok(p.live, `у прототипа ${p.id} есть живая сцена`);
  const priority = CATALOG.filter((e) => e.priority).map((e) => e.id);
  assert.deepEqual(priority, ['call-to-play'], 'метка «очень полезно» только у «Зова на игру»');
  assert.ok(CATALOG.find((e) => e.id === 'call-to-play')!.live === undefined, 'у «Зова на игру» нет прототипа');
  assert.ok(CATALOG.find((e) => e.id === 'pet-buddy')!.live === undefined, 'питомец остаётся карточкой-идеей');
});

/** Проверка разметки без DOM: теги закрыты по порядку, атрибуты в кавычках, чисел вроде NaN нет */
function checkSvg(id: string, svg: string): void {
  assert.ok(svg.startsWith('<svg ') && svg.endsWith('</svg>'), `${id}: обёртка svg`);
  assert.ok(/viewBox="0 0 320 200"/.test(svg), `${id}: viewBox`);
  assert.ok(/aria-label="[^"]{6,}"/.test(svg), `${id}: подпись для экранного диктора`);
  assert.ok(!/NaN|undefined|Infinity|null|\[object/.test(svg), `${id}: в разметку попало лишнее значение`);
  for (const bad of [/<script/i, /<style/i, /\sstyle\s*=/i, /\son[a-z]+\s*=/i, /javascript:/i, /<foreignObject/i, /<image/i, /<use/i, /\shref\s*=/i, /xlink:/i, /url\(/i, /@import/i, /<iframe/i, /<a[\s>]/i]) {
    assert.ok(!bad.test(svg), `${id}: запрещено ${bad}`);
  }
  const stack: string[] = [];
  const re = /<(\/?)([a-zA-Z][\w-]*)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>/g;
  let rest = svg;
  let m: RegExpExecArray | null;
  let consumed = 0;
  while ((m = re.exec(svg)) !== null) {
    const between = svg.slice(consumed, m.index);
    assert.ok(!/[<>]/.test(between), `${id}: лишний знак рядом с ${between.slice(0, 40)}`);
    consumed = m.index + m[0].length;
    const [, closing, name, , selfClosing] = m;
    if (closing) {
      assert.equal(stack.pop(), name, `${id}: тег </${name}> закрыт не по порядку`);
    } else if (!selfClosing) {
      stack.push(name!);
    }
  }
  rest = svg.slice(consumed);
  assert.equal(rest.trim(), '', `${id}: разметка не разобралась до конца`);
  assert.equal(stack.length, 0, `${id}: не закрыт ${stack.join(',')}`);
}

test('lab: иллюстрации — целый и безопасный SVG', () => {
  for (const e of CATALOG as readonly Idea[]) checkSvg(e.id, e.art());
});

test('lab: файлы прототипов берут из three.js и отрисовки только типы', () => {
  const dir = path.join(LAB, 'proto');
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));
  assert.ok(files.length >= 6);
  const registry = read('experiments.ts');
  for (const f of files) {
    const src = read('proto', f);
    const imports = [...src.matchAll(/^import\s+(type\s+)?[^;]*?from\s+'([^']+)';/gms)];
    for (const [, isType, from] of imports) {
      if (from === '../art.ts' || from.startsWith('../../../shared/')) continue;
      // three.js, типы сцены и набора kit3d: только как типы, без единой строки в готовом коде
      assert.ok(['../types.ts', '../kit3d.ts', 'three'].includes(from), `${f}: нельзя импортировать ${from}`);
      assert.ok(isType, `${f}: из ${from} — только import type`);
    }
    assert.ok(!/\bimport\(|require\(/.test(src), `${f}: динамический импорт`);
    assert.ok(registry.includes(`./proto/${f}`), `${f}: не записан в experiments.ts`);
  }
  for (const f of readdirSync(path.join(LAB, 'ideas')).filter((x) => x.endsWith('.ts') && x !== 'index.ts')) {
    assert.ok(read('ideas', 'index.ts').includes(`./${f}`), `ideas/${f}: не подключён в ideas/index.ts`);
  }
});

test('lab: код страницы не пишет inline-стили (строгий CSP сайта: style-src без unsafe-inline)', () => {
  for (const f of readdirSync(LAB).filter((x) => x.endsWith('.ts'))) {
    const src = read(f);
    assert.ok(!/setAttribute\(\s*['"]style['"]/.test(src), `${f}: setAttribute('style')`);
    assert.ok(!/\sstyle\s*=\s*["']/.test(src.replace(/\/\/.*$/gm, '')), `${f}: style= в разметке`);
    assert.ok(!/document\.write|eval\(|new Function\(/.test(src), `${f}: динамический код`);
  }
  const html = readFileSync(path.join(LAB, '..', '..', 'lab', 'index.html'), 'utf8');
  assert.ok(!/<style|\sstyle=|<script(?![^>]*src=)/i.test(html), 'lab/index.html: без встроенных стилей и скриптов');
});

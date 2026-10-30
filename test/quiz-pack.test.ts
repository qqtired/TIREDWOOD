import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { crc32, deflateRawSync } from 'node:zlib';
import { countPack, PackError, validatePack } from '../shared/quiz/pack.ts';
import { parseAny, parseCsv, parseText } from '../shared/quiz/text.ts';
import { parseSiqXml } from '../shared/quiz/siqxml.ts';
import { loadBuiltinPacks } from '../server/lobby/quiz/builtin.ts';
import { QZ_PACK } from '../shared/quiz/types.ts';

const fixtures = new URL('./fixtures/quiz/', import.meta.url);
const text = () => readFileSync(new URL('naberezhnaya.txt', fixtures), 'utf8');
const pack = () => parseText(text()).pack;

test('текст: раунд, три темы, финал, варианты /, комментарий и строки живого вида', () => {
  const r = parseText(text());
  assert.equal(r.errors, 0); assert.equal(r.warnings, 0);
  assert.deepEqual(countPack(r.pack), { rounds: 2, themes: 6, questions: 7 });
  assert.deepEqual(r.pack.rounds[0].themes[0].questions[0].answers, ['осётр', 'осетра']);
  assert.equal(r.pack.rounds[0].themes[0].questions[0].comment, 'Рыба из моря');
  assert.equal(r.pack.rounds[1].final, true);
  assert.equal(r.pack.rounds[1].themes[0].questions[0].price, 0);
  assert.ok(r.lines.some(l => l.cls === 'fin'));
  assert.equal(validatePack(r.pack, []).pack.title, r.pack.title);
  assert.equal(parseText('Тема: Пусто\n100 Что?').errors, 1);
});

test('CSV/TSV: кавычки, переносы, продолжение темы, финал, внешняя картинка — предупреждение', () => {
  const r = parseCsv('Раунд;Тема;Цена;Вопрос;Ответ;Картинка\nПервый;Море;100;"Кто сказал ""Привет""?\nОн же";кот / котик;https://example.invalid/a.png\n;;200;Ещё?;маяк;\nФинал;Маяк;;Сколько?;3;\n;;0;Лишний?;4;');
  assert.equal(r.errors, 0); assert.equal(r.warnings, 2);
  assert.equal(r.pack.rounds[0].themes[0].questions.length, 2);
  assert.deepEqual(r.pack.rounds[0].themes[0].questions[0].content, [{ kind: 'text', value: 'Кто сказал "Привет"?\nОн же' }]);
  assert.equal(r.pack.rounds[1].themes[0].questions.length, 1);
  assert.equal(parseAny('Раунд\tТема\tЦена\tВопрос\tОтвет\nПервый\tРыбы\t100\tКто?\tосётр').format, 'csv');
  assert.equal(parseAny(text()).format, 'text');
  assert.ok(parseCsv('Тема,Цена,Вопрос,Ответ\nМоре,100,"не закрыто,кот').errors);
});

test('слова трёх сложностей и «Кто из нас?» с титулом, префиксом и знаком вопроса', () => {
  const words = parseText(readFileSync(new URL('croc-words.txt', fixtures), 'utf8'));
  assert.equal(words.pack.kind, 'words'); assert.equal(words.errors, 0);
  assert.deepEqual(words.pack.words?.mid, ['пароход', 'морской кот']);
  const who = parseText(readFileSync(new URL('whoofus.txt', fixtures), 'utf8'));
  assert.equal(who.pack.kind, 'whoofus'); assert.equal(who.errors, 0);
  assert.equal(who.pack.who?.[0].title, 'Соня набережной');
  assert.deepEqual(who.pack.who?.[2], { q: 'Кто из нас приведёт корабль в порт?', title: 'Капитан' });
  assert.equal(validatePack(words.pack).pack.words?.hard.length, 2);
  assert.equal(validatePack(who.pack).pack.who?.length, 3);
});

test('validatePack: очистка без обрезки до лимита чата, лишние поля, пределы и ссылки на файлы', () => {
  const p = pack(); p.title = '\u0000  Пак   у моря  '; p.rounds[0].themes[0].questions[0].content = [{ kind: 'text', value: 'я'.repeat(500) }];
  const r = validatePack({ ...p, secret: 'не должно остаться' });
  assert.equal(r.pack.title, 'Пак у моря'); assert.ok(!('secret' in r.pack));
  assert.equal((r.pack.rounds[0].themes[0].questions[0].content[0] as { value: string }).value.length, 500);
  assert.throws(() => validatePack({ ...p, title: 'я'.repeat(61) }), PackError);
  const overflow = pack(); overflow.rounds[0].themes[0].questions = Array.from({ length: 601 }, () => overflow.rounds[0].themes[1].questions[0]);
  assert.throws(() => validatePack(overflow), /600|слишком/);
  const missing = pack(); missing.rounds[0].themes[0].questions[0].content.push({ kind: 'image', file: `${'a'.repeat(64)}.png` });
  assert.throws(() => validatePack(missing), /списке файлов/);
  const descriptor = { sha256: 'a'.repeat(64), ext: 'png', kind: 'image', size: 8 };
  assert.equal(validatePack(missing, [descriptor]).files.length, 1);
  assert.throws(() => validatePack(missing, [{ ...descriptor, size: QZ_PACK.IMAGE_BYTES + 1 }]), (e: unknown) => e instanceof PackError && e.status === 413);
  assert.throws(() => validatePack(missing, [{ ...descriptor, sha256: '../file' }]), PackError);
  assert.throws(() => validatePack(missing, [descriptor, descriptor]), /дважды/);
  const extra = pack(); extra.rounds[0].themes[0].questions[0].answers = Array(9).fill('да');
  assert.throws(() => validatePack(extra), PackError);
  const two = pack(); two.rounds[0].themes.length = 2; assert.throws(() => validatePack(two), /тремя/);
  const wordPack = parseText('Пак: Слова\nСлова: лёгкие\nкот').pack;
  wordPack.words!.easy = Array(2001).fill('кот'); assert.throws(() => validatePack(wordPack), PackError);
  const wrongType = structuredClone(p) as unknown as Record<string, unknown>; wrongType.adult = 'false';
  assert.throws(() => validatePack(wrongType), PackError);
});

/** Полноценный маленький .siq (ZIP, deflate, CRC, центральный каталог), без постоянного бинарного fixture. */
function siq(xml: string): Blob {
  const name = Buffer.from('content.xml'), data = Buffer.from(xml), compressed = deflateRawSync(data), crc = crc32(data);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
  local.writeUInt32LE(crc, 14); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10);
  central.writeUInt32LE(crc, 16); central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12); end.writeUInt32LE(local.length + name.length + compressed.length, 16);
  return new Blob([local, name, compressed, central, name, end]);
}
test('маленькие .siq 4 и 5: content.xml без DOM, say/reveal, типы, wrong, media resolver', async () => {
  // Готовый ZIP-разборщик лаборатории не использует DOM; XML отдаём нашему новому модулю.
  const { openZip } = await import(new URL('../lab/quiz/js/siq.js', import.meta.url).href);
  for (const version of [4, 5]) {
    const scenario = version === 4
      ? '<type name="cat"><param name="theme">Тайна</param></type><scenario><atom>Вопрос &amp; текст</atom><atom type="say">Секрет ведущего</atom><atom type="image">@кот.png</atom><atom type="marker"/><atom>Раскрытие</atom><atom type="video">@film.mp4</atom></scenario>'
      : '<params><param name="question"><item><![CDATA[Вопрос & текст]]></item><item placement="replic">Секрет ведущего</item><item type="image" isRef="true">кот.png</item><item type="audio" duration="4">@tone.mp3</item></param><param name="theme">Тайна</param><param name="answer"><item>Раскрытие</item><item type="html">@page.html</item></param></params>';
    const xml = `<package xmlns="urn:siq" name="Пак &quot;Море&quot;" version="${version}.0" restriction="18+"><info><authors><author>Автор</author></authors></info><rounds><round name="Первый"><themes><theme name="Тема"><questions><question price="100" ${version === 5 ? 'type="secret"' : ''}>${scenario}<right><answer>кот / котик</answer></right><wrong><answer>кит</answer></wrong><info><comments>Комментарий</comments></info></question></questions></theme></themes></round><round name="Финал" type="final"><themes><theme name="Конец"><questions><question price="500"><scenario><atom>Сколько?</atom></scenario><right><answer>3</answer></right></question></questions></theme></themes></round></rounds></package>`;
    const zip = await openZip(siq(xml)); const content = await (await zip.read(zip.entries[0])).text();
    const r = parseSiqXml(content, kind => ({ file: `${'a'.repeat(64)}.${kind === 'image' ? 'png' : 'mp3'}`, sec: 4 }));
    assert.equal(r.version, version); assert.equal(r.pack.adult, true); assert.equal(r.pack.author, 'Автор');
    const q = r.pack.rounds[0].themes[0].questions[0];
    assert.equal(q.type, 'cat'); assert.equal(q.catTheme, 'Тайна'); assert.deepEqual(q.answers, ['кот', 'котик']); assert.deepEqual(q.wrong, ['кит']);
    assert.ok(q.content.some(c => c.kind === 'text' && c.say)); assert.equal(q.reveal.length, 1); assert.ok(r.warnings.length);
    assert.equal(r.pack.rounds[1].themes[0].questions[0].price, 0);
  }
});
test('XML: повреждённое дерево и внешние сущности отклоняются; встроенные паки грузятся независимо', () => {
  for (const xml of ['<package><x></package>', '<!DOCTYPE package [<!ENTITY x SYSTEM "file:///no">]><package>&x;</package>', '<package a="&unknown;"/>']) assert.throws(() => parseSiqXml(xml), PackError);
  const logs: string[] = [];
  const builtins = loadBuiltinPacks(fixtures, s => logs.push(s));
  assert.equal(builtins.length, 3); assert.equal(logs.length, 0);
  assert.ok(builtins.every(b => b.id.startsWith('b-') && b.pack.author === 'Затейник' && b.pack.source.format === 'builtin'));
  assert.equal(loadBuiltinPacks(new URL('absent/', fixtures), s => logs.push(s)).length, 0); assert.equal(logs.length, 1);
});

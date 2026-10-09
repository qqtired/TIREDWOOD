import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ITEMS } from '../shared/outfit.ts';
import type { FittingItem, FittingProject } from '../shared/fitting-room.ts';
import { BUILTIN_SETS, createCatalog } from '../client/fitting-room/catalog.ts';
import {
  buildGenerationBrief, canPreview, createProject, equipItem, equipSet,
  normalizeProject, unequipSlot, updateItem,
} from '../client/fitting-room/state.ts';

const reference = (): FittingItem => ({
  id: 'lab:reference', name: 'Новая панама', slot: 'h', tier: 'common', price: 300,
  source: 'lab', stage: 'reference', notes: '', reference: 'local:panama-ref',
});

// Самостоятельная небольшая копия: ошибки каталога не скрывают проверки импорта.
const fixture = (): FittingProject => ({
  version: 1,
  items: [
    { ...reference(), id: 'lab:beanie', model: 'harbor-beanie', stage: 'model' },
    { ...reference(), id: 'lab:bag', name: 'Сумка', slot: 'a', model: 'messenger-bag', stage: 'model' },
    { ...reference(), id: 'lab:panama', model: 'flower-panama', stage: 'model' },
    reference(),
    { id: 'game:h:cap', name: 'Кепка', slot: 'h', tier: 'free', price: 0, source: 'game', stage: 'model', notes: '', gameKey: 'cap' },
  ],
  sets: [{ id: 'set:coast', name: 'На набережную', itemIds: ['lab:beanie', 'lab:bag'] }],
  outfit: { c: 3, c2: 15, p: 'stripes', e: 'normal', h: 'none', a: 'none' },
  equipped: { h: 'lab:beanie', a: 'lab:bag' },
});

test('каталог содержит все реальные вещи, их цены и отдельные лабораторные модели', () => {
  const items = createCatalog();
  const game = items.filter(item => item.source === 'game');
  assert.equal(game.length, ITEMS.length);
  assert.equal(new Set(items.map(item => item.id)).size, items.length);
  for (const original of ITEMS) {
    const copy = game.find(item => item.id === `game:${original.id}`);
    assert.ok(copy, original.id);
    assert.equal(copy.slot, original.slot);
    assert.equal(copy.gameKey, original.key);
    assert.equal(copy.tier, original.tier);
    assert.equal(copy.name, original.name);
  }
  assert.equal(game.find(item => item.id === 'game:h:panama')?.price, 300);
  assert.equal(game.find(item => item.id === 'game:h:helmet')?.price, 1200);
  assert.equal(game.find(item => item.id === 'game:h:tophat')?.price, 3600);
  assert.equal(game.find(item => item.id === 'game:h:astronaut')?.price, 12000);
  assert.equal(game.find(item => item.id === 'game:h:crown')?.price, 0);
  assert.deepEqual(items.filter(item => item.source === 'lab').map(item => [item.id, item.slot, item.model]), [
    ['lab:harbor-beanie', 'h', 'harbor-beanie'], ['lab:flower-panama', 'h', 'flower-panama'],
    ['lab:messenger-bag', 'a', 'messenger-bag'], ['lab:camera', 'a', 'camera'],
    ['lab:round-glasses', 'e', 'round-glasses'], ['lab:crab-buddy', 's', 'crab-buddy'],
  ]);
  assert.ok(items.filter(item => item.source === 'lab').every(item => item.stage === 'model' && /предварительн/iu.test(item.notes)));
  assert.equal(items.find(item => item.id === 'lab:harbor-beanie')?.reference, 'assets/harbor-beanie.png');
});

test('новый проект можно примерять сразу, а каталог и сеты не разделяют изменяемые массивы', () => {
  const first = createProject();
  const second = createProject();
  assert.deepEqual(first.outfit, { c: 3, c2: 15, p: 'none', e: 'normal', h: 'none', a: 'none' });
  assert.deepEqual(first.equipped, { h: 'lab:harbor-beanie', a: 'lab:messenger-bag', e: 'lab:round-glasses' });
  assert.ok(first.items.length > 6);
  assert.ok(first.sets.some(set => set.itemIds.includes('lab:crab-buddy')));
  assert.ok(BUILTIN_SETS.length > 0);
  first.items[0].name = 'Изменено';
  first.sets[0].itemIds.pop();
  assert.notEqual(second.items[0].name, 'Изменено');
  assert.equal(second.sets[0].itemIds.length, 4);
  assert.equal(BUILTIN_SETS[0].itemIds.length, 4);
});

test('импорт валидной копии создаёт независимый проект и отбрасывает посторонние права', () => {
  const raw = { ...fixture(), owned: ['h:crown'], tokens: 999999 };
  const normalized = normalizeProject(raw);
  assert.notEqual(normalized, raw);
  assert.notEqual(normalized.items, raw.items);
  assert.notEqual(normalized.sets[0].itemIds, raw.sets[0].itemIds);
  assert.equal('owned' in normalized, false);
  assert.equal('tokens' in normalized, false);
  normalized.items[0].name = 'Другая вещь';
  assert.equal(raw.items[0].name, 'Новая панама');
});

test('неверная версия, структура и каталог больше 1000 вещей отклоняются', () => {
  for (const raw of [null, [], 'проект', {}, { ...fixture(), version: 2 }, { ...fixture(), items: {} }]) {
    assert.throws(() => normalizeProject(raw), /[А-Яа-яЁё]/u);
  }
  const project = fixture();
  project.items = Array.from({ length: 1001 }, (_, index) => ({ ...reference(), id: `lab:ref-${index}` }));
  project.sets = [];
  project.equipped = {};
  assert.throws(() => normalizeProject(project), /1000/u);
});

test('повторные id и неверные имя, цена, цвет и трансформация отклоняются', () => {
  const badItems: Array<Partial<FittingItem>> = [
    { name: '  ' }, { price: -1 }, { price: 3.5 }, { price: Infinity },
    { slot: 'x' as FittingItem['slot'] }, { tier: 'unknown' as FittingItem['tier'] },
    { stage: 'unknown' as FittingItem['stage'] }, { color: 'javascript:alert(1)' },
    { transform: { position: [0, Infinity, 0], rotation: [0, 0, 0], scale: 1 } },
    { transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: 0 } },
  ];
  for (const patch of badItems) {
    const project = fixture();
    project.items[0] = { ...project.items[0], ...patch };
    assert.throws(() => normalizeProject(project), /[А-Яа-яЁё]/u);
  }
  const project = fixture();
  project.items.push({ ...project.items[0] });
  assert.throws(() => normalizeProject(project), /[А-Яа-яЁё]/u);
});

test('игровую вещь нельзя подменить через импорт id, ключа, слота, редкости или модели', () => {
  const patches: Array<Partial<FittingItem>> = [
    { id: 'game:h:unknown' }, { gameKey: 'crown' }, { slot: 'a' }, { tier: 'promo' },
    { asset: 'local:replacement' }, { model: 'harbor-beanie' },
  ];
  for (const patch of patches) {
    const project = fixture();
    project.items[4] = { ...project.items[4], ...patch };
    assert.throws(() => normalizeProject(project), /[А-Яа-яЁё]/u);
  }
  const project = fixture();
  project.items[0].gameKey = 'crown';
  assert.throws(() => normalizeProject(project), /[А-Яа-яЁё]/u);
});

test('импорт допускает встроенные и local-файлы, а внешние ссылки и обход пути запрещает', () => {
  for (const path of ['local:panama-ref', 'assets/hat.webp', './assets/hat.webp', '/lab/fitting-room/assets/hat.webp']) {
    const project = fixture();
    project.items[3].reference = path;
    assert.equal(normalizeProject(project).items[3].reference, path);
  }
  for (const path of ['https://example.org/hat.webp', '//example.org/hat.webp', 'data:image/svg+xml,x', 'blob:test', '../hat.webp', '/assets/%2e%2e/hat.webp', 'assets\\hat.webp']) {
    const project = fixture();
    project.items[3].reference = path;
    assert.throws(() => normalizeProject(project), /[А-Яа-яЁё]/u);
    project.items[3].reference = 'local:panama-ref';
    project.items[3].asset = path;
    assert.throws(() => normalizeProject(project), /[А-Яа-яЁё]/u);
  }
});

test('без модели нет примерки и готовности к переносу; GLB и известная фабрика дают примерку', () => {
  assert.equal(canPreview(reference()), false);
  assert.equal(canPreview({ ...reference(), model: 'unknown' }), false);
  assert.equal(canPreview({ ...reference(), model: 'harbor-beanie' }), true);
  assert.equal(canPreview({ ...reference(), asset: 'local:hat-glb' }), true);
  assert.equal(canPreview({ ...reference(), asset: 'assets/missing.glb' }), false);
  assert.equal(canPreview({ ...reference(), asset: 'https://example.org/hat.glb' }), false);
  const project = fixture();
  for (const stage of ['model', 'approved'] as const) {
    project.items[3].stage = stage;
    assert.throws(() => normalizeProject(project), /[А-Яа-яЁё]/u);
  }
  assert.throws(() => equipItem(fixture(), 'lab:reference'), /[А-Яа-яЁё]/u);
});

test('примерка заменяет только свой слот и не меняет исходный проект', () => {
  const project = fixture();
  const before = structuredClone(project);
  const next = equipItem(project, 'lab:panama');
  assert.equal(next.equipped.h, 'lab:panama');
  assert.equal(next.equipped.a, 'lab:bag');
  assert.equal(next.outfit.p, 'stripes');
  assert.equal(next.outfit.c, 3);
  assert.deepEqual(project, before);
  assert.throws(() => equipItem(project, 'lab:missing'), /[А-Яа-яЁё]/u);
});

test('игровая и лабораторная вещь взаимно заменяют друг друга в наряде', () => {
  const game = equipItem(fixture(), 'game:h:cap');
  assert.equal(game.outfit.h, 'cap');
  assert.equal(game.equipped.h, 'game:h:cap');
  const lab = equipItem(game, 'lab:beanie');
  assert.equal(lab.outfit.h, 'none');
  assert.equal(lab.equipped.h, 'lab:beanie');
  assert.equal(lab.equipped.a, 'lab:bag');
});

test('снятие вещи очищает только нужный слот', () => {
  const project = equipItem(fixture(), 'game:h:cap');
  const next = unequipSlot(project, 'h');
  assert.equal(next.equipped.h, undefined);
  assert.equal(next.outfit.h, 'none');
  assert.equal(next.equipped.a, 'lab:bag');
  assert.equal(project.equipped.h, 'game:h:cap');
});

test('сет примеряется целиком и сохраняет другие слоты', () => {
  const project = fixture();
  project.equipped = {};
  const next = equipSet(project, 'set:coast');
  assert.deepEqual(next.equipped, { h: 'lab:beanie', a: 'lab:bag' });
  assert.equal(next.outfit.p, 'stripes');
  assert.deepEqual(project.equipped, {});
});

test('конфликт слотов, отсутствующая вещь и референс в сете отклоняются атомарно', () => {
  for (const ids of [['lab:beanie', 'lab:panama'], ['lab:bag', 'lab:missing'], ['lab:bag', 'lab:reference']]) {
    const project = fixture();
    project.sets[0].itemIds = ids;
    const before = structuredClone(project);
    assert.throws(() => equipSet(project, 'set:coast'), /[А-Яа-яЁё]/u);
    assert.deepEqual(project, before);
  }
});

test('импорт проверяет соответствие слота надетой вещи и каждый состав сета', () => {
  const project = fixture();
  project.equipped.h = 'lab:bag';
  assert.throws(() => normalizeProject(project), /[А-Яа-яЁё]/u);
  project.equipped.h = 'lab:beanie';
  project.sets[0].itemIds = ['lab:beanie', 'lab:panama'];
  assert.throws(() => normalizeProject(project), /[А-Яа-яЁё]/u);
});

test('редактирование сохраняет метаданные и требует модель для готовности к переносу', () => {
  const project = fixture();
  const next = updateItem(project, 'lab:beanie', { name: '  Портовая шапка  ', price: 450, notes: 'Проверить шов', stage: 'approved' });
  assert.equal(next.items[0].name, 'Портовая шапка');
  assert.equal(next.items[0].price, 450);
  assert.equal(next.items[0].stage, 'approved');
  assert.equal(project.items[0].price, 300);
  assert.throws(() => updateItem(project, 'lab:reference', { stage: 'approved' }), /[А-Яа-яЁё]/u);
  assert.throws(() => updateItem(project, 'lab:beanie', { price: -10 }), /[А-Яа-яЁё]/u);
  assert.throws(() => updateItem(project, 'lab:beanie', { name: '' }), /[А-Яа-яЁё]/u);
});

test('источник и игровая идентичность при редактировании защищены', () => {
  const project = fixture();
  const next = updateItem(project, 'game:h:cap', { name: 'Кепка для варианта', price: 50, notes: 'Предложение Lab' });
  assert.equal(next.items[4].source, 'game');
  assert.equal(next.items[4].gameKey, 'cap');
  assert.equal(next.items[4].price, 50);
  for (const patch of [{ source: 'lab' }, { gameKey: 'crown' }, { tier: 'epic' }, { slot: 'a' }, { id: 'game:h:crown' }] as const) {
    assert.throws(() => updateItem(project, 'game:h:cap', patch), /[А-Яа-яЁё]/u);
  }
  assert.throws(() => updateItem(project, 'lab:beanie', { source: 'game' }), /[А-Яа-яЁё]/u);
});

test('изменение слота GLB снимает вещь со старого слота, не трогая другие', () => {
  const project = fixture();
  project.items[0] = { ...project.items[0], model: undefined, asset: 'local:generic-glb' };
  const next = updateItem(project, 'lab:beanie', { slot: 's' });
  assert.equal(next.items[0].slot, 's');
  assert.equal(next.equipped.h, undefined);
  assert.equal(next.outfit.h, 'none');
  assert.equal(next.equipped.a, 'lab:bag');
});

test('задание для генерации допускает от 1 до 40 отдельных вариантов и проверяет входные данные', () => {
  const brief = buildGenerationBrief('h', 40, 'Портовая прогулка');
  assert.ok(brief.length > 100);
  assert.ok(brief.includes('40'));
  assert.ok(brief.includes('Портовая прогулка'));
  for (const count of [0, 41, -1, 2.5, NaN]) assert.throws(() => buildGenerationBrief('h', count, 'Море'), /[А-Яа-яЁё]/u);
  assert.throws(() => buildGenerationBrief('x' as 'h', 1, 'Море'), /[А-Яа-яЁё]/u);
  assert.throws(() => buildGenerationBrief('a', 1, '   '), /[А-Яа-яЁё]/u);
});

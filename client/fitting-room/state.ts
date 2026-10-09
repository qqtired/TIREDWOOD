import { itemById, itemOf, PALETTE, TIER_NAMES, SLOT_NAMES, type Outfit, type Slot, type Tier } from '../../shared/outfit.ts';
import {
  FITTING_SLOTS, FITTING_STAGES, type FittingItem, type FittingProject,
  type FittingSet, type FittingStage, type FittingTransform,
} from '../../shared/fitting-room.ts';
import { BUILTIN_MODEL_SLOTS, BUILTIN_SETS, createCatalog } from './catalog.ts';

const EMPTY: Record<Slot, string> = {
  p: 'none', e: 'normal', h: 'none', a: 'none', s: 'none', r: 'basic', b: 'classic', w: 'wood', n: 'none',
};
const CORE_SLOTS: readonly Slot[] = ['p', 'e', 'h', 'a'];

function fail(message: string): never { throw new Error(message); }

function record(raw: unknown, label: string): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail(`${label}: нужен объект.`);
  return raw as Record<string, unknown>;
}

function text(raw: unknown, label: string, max: number, empty = false): string {
  if (typeof raw !== 'string') fail(`${label}: нужен текст.`);
  const value = raw.trim();
  if ((!empty && !value) || value.length > max) fail(`${label}: проверь длину текста.`);
  return value;
}

function id(raw: unknown, label: string): string {
  const value = text(raw, label, 160);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9:._-]*$/u.test(value)) fail(`${label}: недопустимый идентификатор.`);
  return value;
}

function slot(raw: unknown): Slot {
  if (!FITTING_SLOTS.includes(raw as Slot)) fail('Неизвестный слот вещи.');
  return raw as Slot;
}

/** Ресурс хранится в браузере либо поставляется с этой страницей. URL сюда не попадают. */
function isLocalResource(raw: unknown): raw is string {
  if (typeof raw !== 'string' || raw.length > 500 || raw !== raw.trim()) return false;
  if (/^local:[a-zA-Z0-9][a-zA-Z0-9:._-]*$/u.test(raw)) return true;
  if (!/^(?:\.\/|\/)?[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/u.test(raw)) return false;
  const path = raw.startsWith('./') ? raw.slice(2) : raw;
  return !path.split('/').some(part => part === '.' || part === '..');
}

function resource(raw: unknown, label: string): string | undefined {
  if (raw === undefined) return undefined;
  if (!isLocalResource(raw)) fail(`${label}: выбери локальный или встроенный файл без внешних ссылок.`);
  return raw;
}

function vector(raw: unknown, label: string): [number, number, number] {
  if (!Array.isArray(raw) || raw.length !== 3 || !raw.every(value => typeof value === 'number' && Number.isFinite(value))) {
    fail(`${label}: нужны три конечных числа.`);
  }
  return [raw[0], raw[1], raw[2]];
}

function transform(raw: unknown): FittingTransform | undefined {
  if (raw === undefined) return undefined;
  const value = record(raw, 'Положение модели');
  if (typeof value.scale !== 'number' || !Number.isFinite(value.scale) || value.scale <= 0 || value.scale > 10) {
    fail('Масштаб модели должен быть больше нуля и не больше 10.');
  }
  return { position: vector(value.position, 'Положение'), rotation: vector(value.rotation, 'Поворот'), scale: value.scale };
}

function gameIdentity(item: FittingItem): boolean {
  const original = typeof item.gameKey === 'string' ? itemById(`${item.slot}:${item.gameKey}`) : undefined;
  return !!original && item.id === `game:${original.id}` && item.slot === original.slot
    && item.tier === original.tier && item.model === undefined && item.asset === undefined;
}

export function createProject(): FittingProject {
  return {
    version: 1, items: createCatalog(),
    sets: BUILTIN_SETS.map(set => ({ ...set, itemIds: [...set.itemIds] })),
    outfit: { c: 3, c2: 15, p: 'none', e: 'normal', h: 'none', a: 'none' },
    equipped: { h: 'lab:harbor-beanie', a: 'lab:messenger-bag', e: 'lab:round-glasses' },
  };
}

export function canPreview(item: FittingItem): boolean {
  if (item.source === 'game') return gameIdentity(item);
  if (item.source !== 'lab') return false;
  if (item.asset !== undefined) return item.asset.startsWith('local:') && isLocalResource(item.asset);
  return (typeof item.model === 'string' && Object.hasOwn(BUILTIN_MODEL_SLOTS, item.model)
    && BUILTIN_MODEL_SLOTS[item.model] === item.slot);
}

function normalizeItem(raw: unknown): FittingItem {
  const value = record(raw, 'Вещь');
  const itemId = id(value.id, 'Код вещи');
  const itemSlot = slot(value.slot);
  const tier = value.tier as Tier;
  if (!Object.hasOwn(TIER_NAMES, tier)) fail('Неизвестная редкость вещи.');
  if (typeof value.price !== 'number' || !Number.isSafeInteger(value.price) || value.price < 0) fail('Цена должна быть целым неотрицательным числом.');
  if (value.source !== 'game' && value.source !== 'lab') fail('Неизвестный источник вещи.');
  if (!FITTING_STAGES.includes(value.stage as FittingStage)) fail('Неизвестный этап вещи.');
  const item: FittingItem = {
    id: itemId, name: text(value.name, 'Название', 120), slot: itemSlot, tier, price: value.price,
    source: value.source, stage: value.stage as FittingStage, notes: text(value.notes, 'Заметки', 4000, true),
  };
  if (value.gameKey !== undefined) item.gameKey = text(value.gameKey, 'Ключ игровой вещи', 80);
  if (value.model !== undefined) item.model = text(value.model, 'Модель', 80);
  const reference = resource(value.reference, 'Референс');
  const asset = resource(value.asset, 'Модель');
  if (asset !== undefined && !asset.startsWith('local:')) fail('Модель должна быть загружена в примерочную и включена в копию проекта.');
  if (reference !== undefined) item.reference = reference;
  if (asset !== undefined) item.asset = asset;
  if (value.color !== undefined) {
    if (typeof value.color !== 'string' || !/^#[0-9a-f]{6}$/iu.test(value.color)) fail('Цвет модели должен быть в формате #rrggbb.');
    item.color = value.color;
  }
  const adjustment = transform(value.transform);
  if (adjustment) item.transform = adjustment;
  if (item.source === 'game') {
    if (!gameIdentity(item)) fail('Игровая вещь не совпадает с действующим каталогом: ключ, слот и редкость менять нельзя.');
  } else {
    if (!item.id.startsWith('lab:') || item.gameKey !== undefined) fail('Лабораторную вещь нельзя выдавать за игровую.');
    if (item.model !== undefined && (!Object.hasOwn(BUILTIN_MODEL_SLOTS, item.model) || BUILTIN_MODEL_SLOTS[item.model] !== item.slot)) {
      fail('Встроенная модель неизвестна или не подходит к этому слоту.');
    }
  }
  if ((item.stage === 'model' || item.stage === 'approved') && !canPreview(item)) fail('Для 3D-примерки и готовности к переносу сначала добавь модель.');
  return item;
}

function normalizeOutfit(raw: unknown): Outfit {
  const value = record(raw, 'Наряд');
  for (const field of ['c', 'c2']) {
    const color = value[field];
    if (typeof color !== 'number' || !Number.isInteger(color) || color < 0 || color >= PALETTE.length) fail('Цвет тела и узора должен быть из игровой палитры.');
  }
  const outfit: Outfit = { c: value.c as number, c2: value.c2 as number, p: 'none', e: 'normal', h: 'none', a: 'none' };
  for (const itemSlot of FITTING_SLOTS) {
    const key = value[itemSlot];
    if (key === undefined && !CORE_SLOTS.includes(itemSlot)) continue;
    if (typeof key !== 'string' || !itemOf(itemSlot, key)) fail('Наряд содержит неизвестную игровую вещь.');
    outfit[itemSlot] = key;
  }
  return outfit;
}

function members(set: FittingSet, items: readonly FittingItem[], preview: boolean): FittingItem[] {
  const seen = new Set<Slot>();
  return set.itemIds.map(itemId => {
    const item = items.find(candidate => candidate.id === itemId);
    if (!item) fail(`Сет «${set.name}» содержит отсутствующую вещь.`);
    if (seen.has(item.slot)) fail(`В сете «${set.name}» две вещи одного слота.`);
    if (preview && !canPreview(item)) fail(`У вещи «${item.name}» ещё нет модели для примерки.`);
    seen.add(item.slot);
    return item;
  });
}

function putOn(project: FittingProject, item: FittingItem): void {
  project.equipped[item.slot] = item.id;
  const key = item.source === 'game' ? item.gameKey! : EMPTY[item.slot];
  if (!CORE_SLOTS.includes(item.slot) && key === EMPTY[item.slot]) delete project.outfit[item.slot];
  else project.outfit[item.slot] = key;
}

export function normalizeProject(raw: unknown): FittingProject {
  const value = record(raw, 'Проект');
  if (value.version !== 1) fail('Версия проекта не поддерживается.');
  if (!Array.isArray(value.items) || value.items.length > 1000) fail('В проекте должно быть не больше 1000 вещей.');
  const items = value.items.map(normalizeItem);
  if (new Set(items.map(item => item.id)).size !== items.length) fail('В проекте повторяются коды вещей.');
  if (!Array.isArray(value.sets) || value.sets.length > 1000) fail('Список сетов неверный или слишком большой.');
  const sets: FittingSet[] = value.sets.map(rawSet => {
    const set = record(rawSet, 'Сет');
    if (!Array.isArray(set.itemIds) || !set.itemIds.length || set.itemIds.length > FITTING_SLOTS.length) fail('Сет должен содержать от 1 до 9 вещей.');
    const result = { id: id(set.id, 'Код сета'), name: text(set.name, 'Название сета', 120), itemIds: set.itemIds.map(itemId => id(itemId, 'Код вещи сета')) };
    members(result, items, false);
    return result;
  });
  if (new Set(sets.map(set => set.id)).size !== sets.length) fail('В проекте повторяются коды сетов.');
  const project: FittingProject = { version: 1, items, sets, outfit: normalizeOutfit(value.outfit), equipped: {} };
  const equipped = record(value.equipped, 'Надетые вещи');
  for (const [rawSlot, itemId] of Object.entries(equipped)) {
    const itemSlot = slot(rawSlot);
    const item = items.find(candidate => candidate.id === itemId);
    if (!item || item.slot !== itemSlot) fail('Надетая вещь отсутствует или указана в чужом слоте.');
    if (!canPreview(item)) fail(`У вещи «${item.name}» ещё нет модели для примерки.`);
    putOn(project, item);
  }
  return project;
}

function findItem(project: FittingProject, itemId: string): FittingItem {
  return project.items.find(item => item.id === itemId) ?? fail('Вещь не найдена в проекте.');
}

export function equipItem(project: FittingProject, itemId: string): FittingProject {
  const next = normalizeProject(project);
  const item = findItem(next, itemId);
  if (!canPreview(item)) fail('Для примерки сначала добавь модель.');
  putOn(next, item);
  return next;
}

function takeOff(project: FittingProject, itemSlot: Slot): void {
  delete project.equipped[itemSlot];
  if (CORE_SLOTS.includes(itemSlot)) project.outfit[itemSlot] = EMPTY[itemSlot];
  else delete project.outfit[itemSlot];
}

export function unequipSlot(project: FittingProject, itemSlot: Slot): FittingProject {
  slot(itemSlot);
  const next = normalizeProject(project);
  takeOff(next, itemSlot);
  return next;
}

export function equipSet(project: FittingProject, setId: string): FittingProject {
  const next = normalizeProject(project);
  const set = next.sets.find(candidate => candidate.id === setId) ?? fail('Сет не найден в проекте.');
  const ready = members(set, next.items, true);
  for (const item of ready) putOn(next, item);
  return next;
}

export function updateItem(project: FittingProject, itemId: string, patch: Partial<FittingItem>): FittingProject {
  const next = normalizeProject(project);
  const previous = findItem(next, itemId);
  const changes = record(patch, 'Изменения вещи');
  const fixed = previous.source === 'game' ? ['id', 'source', 'slot', 'tier', 'gameKey'] : ['id', 'source'];
  for (const field of fixed) {
    if (Object.hasOwn(changes, field) && changes[field] !== previous[field as keyof FittingItem]) fail('Источник и игровую идентичность вещи менять нельзя.');
  }
  const changed = normalizeItem({ ...previous, ...changes });
  next.items[next.items.findIndex(item => item.id === itemId)] = changed;
  if (next.equipped[previous.slot] === itemId) {
    if (changed.slot !== previous.slot || !canPreview(changed)) takeOff(next, previous.slot);
    else putOn(next, changed);
  }
  return normalizeProject(next);
}

export function buildGenerationBrief(itemSlot: Slot, count: number, theme: string): string {
  slot(itemSlot);
  if (!Number.isInteger(count) || count < 1 || count > 40) fail('Выбери от 1 до 40 вариантов.');
  const direction = text(theme, 'Тема', 2000);
  return [
    `Создай ${count} разных референсов вещей TIREDWOOD. Слот: ${SLOT_NAMES[itemSlot]}. Тема: ${direction}.`,
    'Мир: уютный солнечный приморский городок, повседневные материалы, тёплый свет, сочные спокойные цвета, без неона и sci-fi.',
    'Покажи каждую вещь на настоящей желейке: legless jelly height 1.58 m, округлое блестящее тело, ручки-варежки, без ног и ступней. Шапки и аксессуары должны подходить этой форме; не используй человеческий манекен.',
    'No texts, labels, logos or watermarks. No blue-yellow flags, pennants or boats. Без надписей, логотипов и водяных знаков; без сине-жёлтых флагов, вымпелов и лодок.',
    `Каждый из ${count} вариантов сохрани отдельным PNG или WebP файлом. Не делай общий коллаж или сетку. Вещь полностью видна, фон простой, понятны посадка и крепление.`,
    'Рядом сохрани PROVENANCE.md: источник, дата, модель генерации, полный промпт и соответствие названий файлам.',
    'В конце импортируй файлы в отдельную лабораторию примерочной как кандидатов этапа «Референс». Не публикуй, не выкладывай и не добавляй вещи в игровой каталог или профили игроков.',
  ].join('\n\n');
}

// Каталог нарядов: у каждой вещи понятный id, сервер не даёт надеть чужое.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_OUTFIT, ITEMS, JACKPOT_ITEMS, PALETTE, PALETTE_NAMES, PATTERN_INDEX, isOwned, itemById, itemOf, randomOutfit,
  sanitizeOutfit, shownOutfit, withItem, type Slot,
} from '../shared/outfit.ts';

// Старые слоты (поля наряда всегда есть); новые слоты рыбалки — в test/fishstyle.test.ts
const SLOTS = ['p', 'e', 'h', 'a'] as const satisfies readonly Slot[];
type OldSlot = (typeof SLOTS)[number];
const EMPTY: Record<OldSlot, string> = { p: 'none', e: 'normal', h: 'none', a: 'none' };

test('каталог: id = слот:ключ, без повторов; у каждого слота есть бесплатная «пустая» вещь', () => {
  assert.equal(PALETTE.length, 16);
  assert.equal(PALETTE_NAMES.length, 16);
  const ids = new Set<string>();
  for (const it of ITEMS) {
    assert.equal(it.id, `${it.slot}:${it.key}`);
    assert.ok(!ids.has(it.id), `повтор ${it.id}`);
    ids.add(it.id);
    assert.equal(itemById(it.id), it);
    assert.equal(itemOf(it.slot, it.key), it);
    assert.ok(it.name.length > 1);
  }
  for (const slot of SLOTS) assert.equal(itemOf(slot, EMPTY[slot])?.tier, 'free');
  for (const id of JACKPOT_ITEMS) assert.equal(itemById(id)?.tier, 'jackpot');
  for (const it of ITEMS.filter((i) => i.slot === 'p')) assert.ok(PATTERN_INDEX[it.key] >= 0, `номер узора ${it.key}`);
  assert.equal(itemById('h:nothing'), undefined);
});

test('наряд по умолчанию собран из бесплатных вещей', () => {
  for (const slot of SLOTS) assert.equal(itemOf(slot, DEFAULT_OUTFIT[slot])?.tier, 'free');
  assert.deepEqual(sanitizeOutfit(DEFAULT_OUTFIT, []), DEFAULT_OUTFIT);
});

test('сервер чистит наряд: чужие, системные и несуществующие вещи снимаются, цвета в палитре', () => {
  const o = sanitizeOutfit({ c: 99, c2: -1, p: 'gold', e: 'zzz', h: 'tophat', a: 42 }, []);
  assert.ok(o.c >= 0 && o.c < 16 && Number.isInteger(o.c));
  assert.ok(o.c2 >= 0 && o.c2 < 16 && Number.isInteger(o.c2));
  assert.equal(o.p, 'none');
  assert.equal(o.e, 'normal');
  assert.equal(o.h, 'none');
  assert.equal(o.a, 'none');
  assert.equal(sanitizeOutfit({ ...DEFAULT_OUTFIT, h: 'tophat' }, ['h:tophat']).h, 'tophat');
  assert.equal(sanitizeOutfit({ ...DEFAULT_OUTFIT, h: 'fool' }, ['h:fool']).h, 'none', 'системную вещь не надеть');
  assert.equal(sanitizeOutfit({ ...DEFAULT_OUTFIT, c: 3.5 }, []).c, DEFAULT_OUTFIT.c);
  assert.deepEqual(sanitizeOutfit(null, []), { ...DEFAULT_OUTFIT, h: 'none' });
  assert.deepEqual(sanitizeOutfit('мусор', []), { ...DEFAULT_OUTFIT, h: 'none' });
});

test('владение: бесплатное — у всех, системное — ни у кого, остальное — по списку', () => {
  assert.ok(isOwned([], itemById('h:cap')!));
  assert.ok(!isOwned([], itemById('h:panama')!));
  assert.ok(isOwned(['h:panama'], itemById('h:panama')!));
  assert.ok(!isOwned(['a:epaulets'], itemById('a:epaulets')!));
  assert.deepEqual(withItem(DEFAULT_OUTFIT, itemById('e:monocle')!), { ...DEFAULT_OUTFIT, e: 'monocle' });
});

test('случайный наряд ботов: зависит только от номера, только бесплатные вещи', () => {
  const seen = new Set<string>();
  for (let seed = 1; seed <= 200; seed++) {
    const a = randomOutfit(seed);
    assert.deepEqual(a, randomOutfit(seed));
    for (const slot of SLOTS) assert.equal(itemOf(slot, a[slot])?.tier, 'free', `${slot}:${a[slot]}`);
    assert.ok(a.c >= 0 && a.c < 16 && a.c2 >= 0 && a.c2 < 16);
    seen.add(JSON.stringify(a));
  }
  assert.ok(seen.size > 50, 'наряды разнообразные');
});

test('колпак дурака и погоны поверх наряда — пока не истёк срок; сам наряд не меняется', () => {
  const o = { ...DEFAULT_OUTFIT, h: 'tophat', a: 'scarf' };
  const copy = { ...o };
  assert.deepEqual(shownOutfit(o, 0, 0, 1000), o);
  assert.deepEqual(shownOutfit(o, 2000, 0, 1000), { ...o, h: 'fool' });
  assert.deepEqual(shownOutfit(o, 2000, 2000, 1000), { ...o, h: 'fool', a: 'epaulets' });
  assert.deepEqual(shownOutfit(o, 2000, 2000, 2000), o, 'срок вышел');
  assert.deepEqual(o, copy);
  assert.equal(itemOf('h', 'fool')?.tier, 'system');
  assert.equal(itemOf('a', 'epaulets')?.tier, 'system');
});

// Preserve existing IDs and per-slot catalogue order across the expansion.
test('expansion: old slot indexes preserved, premium items only appended and require ownership', () => {
  const old: Record<OldSlot, string[]> = {
    p: ['none', 'stripes', 'dots', 'spots', 'sunset', 'camo', 'sugar', 'gold'],
    e: ['normal', 'sleepy', 'angry', 'happy', 'glasses', 'shades', 'patch', 'monocle', 'angler'],
    h: ['none', 'cap', 'panama', 'ushanka', 'fisher', 'bandana', 'helmet', 'sailor', 'tophat', 'crown', 'fool', 'angler'],
    a: ['none', 'scarf', 'mustache', 'bowtie', 'headphones', 'lifebuoy', 'chain', 'epaulets', 'angler'],
  };
  for (const slot of SLOTS) assert.deepEqual(ITEMS.filter(it => it.slot === slot).slice(0, old[slot].length).map(it => it.key), old[slot]);
  const premium = ITEMS.filter(it => it.tier === 'premium');
  assert.deepEqual(premium.map(it => it.id), ['h:astronaut', 'h:storm', 'a:jetpack', 'e:prism']);
  for (const it of premium) {
    assert.equal(isOwned([], it), false);
    assert.equal(sanitizeOutfit(withItem(DEFAULT_OUTFIT, it), [it.id])[it.slot], it.key);
    assert.equal(sanitizeOutfit(withItem(DEFAULT_OUTFIT, it), [])[it.slot], EMPTY[it.slot as OldSlot]);
  }
  for (const id of ['e:angler', 'h:angler', 'a:angler']) assert.equal(itemById(id)?.tier, 'trophy');
});

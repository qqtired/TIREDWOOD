import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { emptyFarm, saleUnit, sell } from '../shared/farm.ts';
import { CROPS, REP_LEVELS, TUTORIAL_STEPS, TUTORIAL_XP, TUTORIAL_COINS, TRUFFLE, TRUFFLE_PRICE, VAN_MULTS, cropById } from '../shared/farmdata.ts';
import { vanOffers, type VanOffer } from '../shared/farmvan.ts';
import { seedPrices, tutorialRewards, vanPayment, gribPayment, gribTotal } from '../client/farm/ui/price-model.ts';
import { POND_SPOTS, POND_USE } from '../shared/farmpond.ts';
import { POND_SEAT_USE_RADIUS, pondTarget } from '../client/farm/pond-target.ts';

// Vite's asset imports are absent in Node; interaction methods run unchanged, without constructing Three/DOM UI.
const hook = registerHooks({ load(url, context, next) {
  if (/\.(webp|png|jpg|glb|bin|css)$/.test(new URL(url).pathname)) return { format: 'module', source: `export default ${JSON.stringify(url)}`, shortCircuit: true };
  const loaded = next(url, context);
  const source = loaded.source == null ? '' : String(loaded.source);
  return source.includes('import.meta.glob(') ? { ...loaded, source: source.replaceAll('import.meta.glob(', '((..._g: unknown[]) => ({}))(') } : loaded;
} });
let FarmPond: typeof import('../client/farm/pond.ts').FarmPond;
try { FarmPond = (await import('../client/farm/pond.ts')).FarmPond; } finally { hook.deregister(); }

const NOW = Date.UTC(2026, 9, 12, 9);
const offer = (item: string, n = 10, mult = 1.5, coins = 1500): VanOffer => ({ slot: 0, kind: 'expensive', item, n, mult, coins, xp: 20 });

test('выбор семян показывает конечную текущую цену и первую бесплатную посадку', () => {
  const f = emptyFarm(NOW); f.rep = 3000; f.buffs = [{ kind: 'price', until: NOW + 1000 }];
  const c = cropById('golden-apple')!;
  assert.deepEqual(seedPrices(f, c, NOW), { seed: 0, sale: 150 });
  f.firstPlanted.push(c.id);
  assert.equal(seedPrices(f, c, NOW).seed, c.seed);
});

test('ящик при конечном пределе150 не обещает ложную денежную прибавку', () => {
  const f = emptyFarm(NOW); f.rep = 3000; f.buffs = [{ kind: 'price', until: NOW + 1000 }];
  assert.deepEqual(vanPayment(f, offer('golden-apple'), NOW), { unit: 150, coins: 1500, gribCoins: 1500, extra: 0 });
});

test('цена ящика обновляется после баффа, а не остаётся прошлым offer.coins', () => {
  const f = emptyFarm(NOW); const c = cropById('wheat')!;
  f.buffs = [{ kind: 'price', until: NOW + 1000 }];
  const o = offer(c.id, 7, 1.3, Math.round(7 * saleUnit(f, c, NOW, 1.3)));
  assert.equal(vanPayment(f, o, NOW + 1001).coins, Math.round(7 * saleUnit(f, c, NOW + 1001, 1.3)));
  assert.notEqual(vanPayment(f, o, NOW).coins, vanPayment(f, o, NOW + 1001).coins);
});

test('текущие ящики используют те же выплаты, что реальные vanOffers, после700 без штрафа', () => {
  const f = emptyFarm(NOW); f.xp = 21750; f.rep = 3000; f.sold.coins = 5000;
  for (const o of vanOffers(f, 17, 123, NOW)) assert.equal(vanPayment(f, o, NOW).coins, o.coins);
});

test('все цены культуры с репутацией/баффом/покупателем соблюдают единый предел', () => {
  const f = emptyFarm(NOW);
  for (const c of CROPS) for (const rep of REP_LEVELS) for (const buff of [false, true]) for (const mult of VAN_MULTS) {
    f.rep = rep.need; f.buffs = buff ? [{ kind: 'price', until: NOW + 1000 }] : [];
    const p = vanPayment(f, offer(c.id, 2, mult), NOW);
    assert.equal(p.unit, saleUnit(f, c, NOW, mult));
    assert.equal(p.coins, Math.round(2 * p.unit));
    assert.ok(p.unit <= 150);
  }
});

test('гурманский трюфель сохраняет свою цену и бонус, не подрезается как культура', () => {
  const f = emptyFarm(NOW);
  const p = vanPayment(f, { ...offer(TRUFFLE, 3, 1.8, Math.round(3 * TRUFFLE_PRICE * 1.8)), kind: 'gourmet' }, NOW);
  assert.equal(p.coins, Math.round(3 * TRUFFLE_PRICE * 1.8));
  assert.equal(p.gribCoins, 3 * TRUFFLE_PRICE);
});

test('сводка обучения обещает только ещё не выданные награды', () => {
  for (let paid = 0; paid <= TUTORIAL_STEPS; paid++) assert.deepEqual(tutorialRewards(paid), {
    steps: TUTORIAL_STEPS - paid, xp: TUTORIAL_XP.slice(paid).reduce((a, n) => a + n, 0), coins: paid < TUTORIAL_STEPS ? TUTORIAL_COINS : 0,
  });
});

test('каждый из шести точных маркеров выбирает рыбалку, включая перекрывающийсяslot0', () => {
  POND_SPOTS.forEach((s, seat) => assert.deepEqual(pondTarget(s.x, s.z, true, null), { kind: 'seat', seat }));
  assert.deepEqual(pondTarget(POND_USE.x, POND_USE.z, true, null), { kind: 'npc' });
});

test('точная граница зоны и равенство NPC/рыбалки выбираются предсказуемо', () => {
  assert.deepEqual(pondTarget(POND_USE.x - POND_USE.r, POND_USE.z, true, null), { kind: 'npc' });
  assert.deepEqual(pondTarget(POND_SPOTS[5].x + POND_SEAT_USE_RADIUS, POND_SPOTS[5].z, true, null), { kind: 'seat', seat: 5 });
  assert.equal(pondTarget(POND_SPOTS[5].x + POND_SEAT_USE_RADIUS + .001, POND_SPOTS[5].z, true, null), null);
  assert.deepEqual(pondTarget((POND_SPOTS[0].x + POND_USE.x) / 2, (POND_SPOTS[0].z + POND_USE.z) / 2, true, null), { kind: 'seat', seat: 0 });
  assert.deepEqual(pondTarget((POND_SPOTS[0].x + POND_SPOTS[1].x) / 2, POND_SPOTS[0].z, true, null), { kind: 'seat', seat: 0 });
});

test('недоступный пруд и уже занятый собственный activeSeat не выбирают новый target', () => {
  const s = POND_SPOTS[0];
  assert.equal(pondTarget(s.x, s.z, false, null), null);
  assert.equal(pondTarget(s.x, s.z, true, 0), null);
});

function pondAt(x: number, z: number) {
  const sent: unknown[] = [], opened: string[] = [], notices: string[] = [];
  let casts = 0;
  const pond = Object.assign(Object.create(FarmPond.prototype), {
    active: true, enabled: true, epoch: 7, self: { id: 10, x, y: .1, z }, seats: Array(6).fill(0),
    d: { net: { send: (m: unknown) => sent.push(m) }, ui: { toasts: { show: (text: string) => notices.push(text) } } },
    hud: { modalOpen: false, requestNpcOpen: (zone: string) => opened.push(zone) },
    press: () => casts++, // casting is a separate fishing lifecycle; this test covers target routing
  });
  return { pond, sent, opened, notices, casts: () => casts };
}

test('actual FarmPond E/мышь использует ту же ближайшую цель, включая занятую, и не перескакивает к NPC', () => {
  for (const mouse of [false, true]) {
    POND_SPOTS.forEach((s, seat) => {
      const k = pondAt(s.x, s.z);
      assert.ok(k.pond.nearHint);
      assert.equal(k.pond.onUse(mouse), true);
      assert.deepEqual(k.sent, [{ t: 'farmPondSeat', epoch: 7, seat }]);
      assert.deepEqual(k.opened, []);
    });
    const npc = pondAt(POND_USE.x, POND_USE.z);
    assert.ok(npc.pond.nearHint);
    assert.equal(npc.pond.onUse(mouse), true);
    assert.deepEqual(npc.opened, ['pond']); assert.deepEqual(npc.sent, []);
    const busy = pondAt(POND_SPOTS[0].x, POND_SPOTS[0].z);
    busy.pond.seats[0] = 11;
    assert.equal(busy.pond.onUse(mouse), true);
    assert.deepEqual(busy.sent, []); assert.deepEqual(busy.opened, []);
    assert.deepEqual(busy.notices, [busy.pond.nearHint]);
  }
});

test('actual FarmPond недоступен/модален без действий; свой activeSeat сохраняет E встать и мышь забросить', () => {
  const s = POND_SPOTS[0];
  const off = pondAt(s.x, s.z); off.pond.enabled = false;
  assert.equal(off.pond.nearHint, null); assert.equal(off.pond.onUse(false), false);
  assert.deepEqual(off.sent, []); assert.deepEqual(off.opened, []);
  const modal = pondAt(s.x, s.z); modal.pond.hud.modalOpen = true;
  assert.equal(modal.pond.nearHint, null); assert.equal(modal.pond.onUse(false), true);
  assert.deepEqual(modal.sent, []); assert.deepEqual(modal.opened, []);
  const seated = pondAt(s.x, s.z); seated.pond.seats[0] = 10;
  assert.equal(seated.pond.nearHint, null);
  assert.equal(seated.pond.onUse(false), true);
  assert.deepEqual(seated.sent, [{ t: 'farmPondSeat', epoch: 7, seat: null }]);
  assert.equal(seated.pond.onUse(true), true); assert.equal(seated.casts(), 1);
  assert.deepEqual(seated.opened, []);
});


test('предсказанная сумма Гриба совпадает с продажей с дробным остатком и новыми сутками', () => {
  const f = emptyFarm(NOW); f.rep = REP_LEVELS[2].need;
  f.sold.day = '2026-10-12'; f.sold.frac = .73;
  f.bag = { radish: 3, wheat: 2, [TRUFFLE]: 1 };
  const rows = Object.entries(f.bag).map(([item, n]) => ({ item, n }));
  const expected = gribTotal(f, rows, NOW);
  let actual = 0;
  for (const row of rows) {
    const quoted = gribPayment(f, row.item, row.n, NOW);
    const got = sell(f, row.item, row.n, NOW);
    assert.ok(got.ok); if (got.ok) { assert.equal(quoted, got.coins); actual += got.coins; }
  }
  assert.equal(expected, actual);
  f.bag = { wheat: 1 }; f.sold.day = '2026-10-11'; f.sold.frac = .95;
  const quoted = gribPayment(f, 'wheat', 1, NOW);
  const got = sell(f, 'wheat', 1, NOW);
  assert.ok(got.ok); if (got.ok) assert.equal(quoted, got.coins);
});

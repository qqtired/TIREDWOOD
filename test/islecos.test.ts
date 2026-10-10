// Косметика острова «Последний свет»: своя лестница по видам острова (каждые 4 вида, сет — за все 20), выдача сервером
// вместе с лестницей коллекции, нормализация нарядов и старых профилей; модели из GLB читаются в те же интерфейсы вещей.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import type * as THREE from 'three';
import { FISH } from '../shared/fishing.ts';
import { COLLECTION } from '../shared/fishrules.ts';
import { GEAR_SLOTS, ISLE_ITEMS, ISLE_LADDER, LADDER, REWARD_INFO, SHELL_ACCS, earnedItems, isleEarned, isleNeedOf, isleNextStep, stepNeed } from '../shared/fishstyle.ts';
import { ISLE_SPECIES, ISLE_TOTAL, isleCaught } from '../shared/islestyle.ts';
import { DEFAULT_OUTFIT, itemById, sanitizeOutfit } from '../shared/outfit.ts';
import { devIsleAlbum, grantLadder, ladderAnnounce, ladderToast } from '../server/fishstyle.ts';
import { Hub } from '../server/hub.ts';
import { Profiles } from '../server/profiles.ts';
import { Store, normalizeProfile } from '../server/store.ts';
import { FISH_ICONS } from '../client/ui/fishicons.ts';
import { islePuffin, isleWear, parseGlb, primeIsle, type IsleModel } from '../client/render/islegear.ts';
import { SMOKE, login } from './kit.ts';

const dirs: string[] = [];
after(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function env() {
  const dir = mkdtempSync(path.join(tmpdir(), 'opus-islecos-'));
  dirs.push(dir);
  const clock = { now: Date.UTC(2026, 9, 10, 12) };
  const store = new Store(dir, { log: () => {}, saveDelayMs: 60_000, now: () => clock.now });
  store.load();
  const profiles = new Profiles(store, { now: () => clock.now });
  const hub = new Hub({ store, profiles, smokeToken: SMOKE, build: 'test', now: () => clock.now, log: () => {}, fish2: true, isle: true });
  return { hub, profiles };
}

/** Альбом: первые n видов острова и первые k видов коллекции */
function album(n: number, k = 0): Record<string, [number, number]> {
  const a: Record<string, [number, number]> = {};
  for (const id of ISLE_SPECIES.slice(0, n)) a[id] = [500, 1];
  for (const sp of COLLECTION.slice(0, k)) a[FISH[sp].id] = [FISH[sp].g[0], 1];
  return a;
}

test('лестница острова: 4, 8, 12, 16 и сет «Смотритель маяка» за все 20; вещи — трофеи с описанием и значком', () => {
  assert.equal(ISLE_TOTAL, 20);
  assert.equal(ISLE_SPECIES.length, ISLE_TOTAL);
  assert.deepEqual(ISLE_LADDER.map((s) => stepNeed(s, ISLE_TOTAL)), [4, 8, 12, 16, 20]);
  assert.deepEqual(ISLE_LADDER.map((s) => s.items), [['b:bellbuoy'], ['r:lighthouse'], ['w:fog'], ['s:puffin'], ['h:keeper', 'a:keeper', 'n:lighthouse']]);
  assert.equal(ISLE_LADDER.at(-1)!.set, 'Смотритель маяка');
  for (const id of ISLE_ITEMS) {
    assert.equal(itemById(id)?.tier, 'trophy', `${id}: трофей, не продаётся`);
    assert.ok(REWARD_INFO[id]?.text, `${id}: описание`);
    assert.ok(FISH_ICONS[id]?.startsWith('<svg'), `${id}: значок`);
    assert.ok(!LADDER.some((s) => s.items.includes(id)), `${id}: не на лестнице 52 видов`);
  }
  assert.equal(isleNeedOf('s:puffin'), 16);
  assert.equal(isleNeedOf('b:duck'), null);
  assert.deepEqual(isleEarned(11), ['b:bellbuoy', 'r:lighthouse']);
  assert.equal(isleNextStep(19)?.set, 'Смотритель маяка');
  assert.equal(isleNextStep(20), null);
  // свитер прячется под командным жилетом в пейнтболе, как другие оболочки
  assert.ok(SHELL_ACCS.has('keeper'));
  // счётчик острова — по ключам альбома, виды пристани и баркаса его не трогают
  assert.equal(isleCaught({ album: album(7, 30) }), 7);
});

test('выдача: по видам острова ровно на пороге, снасти надеваются сами, одежда — в примерочной; лестница 52 не сдвинулась', () => {
  const e = env();
  const p = login(e.hub, 'Смотритель').c.profile!;
  const at = new Map(ISLE_LADDER.map((s) => [stepNeed(s, ISLE_TOTAL), s.items]));
  for (let n = 0; n <= ISLE_TOTAL; n++) {
    p.album = album(n);
    const g = grantLadder(e.profiles, p);
    assert.deepEqual(g.items, at.get(n) ?? [], `${n} видов острова`);
    assert.equal(g.master, false, 'остров — не финал коллекции');
    assert.deepEqual(p.owned, isleEarned(n), `${n} видов острова: всё положенное и только оно`);
  }
  // снасти острова надеты, одежда и питомец — нет
  assert.equal(p.outfit.b, 'bellbuoy');
  assert.equal(p.outfit.r, 'lighthouse');
  assert.equal(p.outfit.w, 'fog');
  assert.equal(p.outfit.n, 'lighthouse');
  assert.equal(p.outfit.h, DEFAULT_OUTFIT.h);
  assert.equal(p.outfit.a, DEFAULT_OUTFIT.a);
  assert.equal(p.outfit.s, undefined);
  // вместе с коллекцией: награды обеих лестниц, каждой — по своему счётчику
  const q = login(e.hub, 'Рыбак').c.profile!;
  q.album = album(4, 10);
  assert.deepEqual(grantLadder(e.profiles, q).items, [...earnedItems(10), 'b:bellbuoy']);
});

test('тост и чат: награда острова и сет «Смотритель маяка» объявляются, как прежние сеты', () => {
  const e = env();
  const p = login(e.hub, 'Игнатыч').c.profile!;
  p.album = album(4);
  assert.match(ladderToast(grantLadder(e.profiles, p)), /^🗼 Награды острова «Последний свет»: поплавок «Колокольный буй»\. Снасти уже на тебе/);
  p.album = album(20);
  const g = grantLadder(e.profiles, p);
  assert.deepEqual(g.items, ['r:lighthouse', 'w:fog', 's:puffin', 'h:keeper', 'a:keeper', 'n:lighthouse']);
  assert.match(ladderToast(g), /одежда \(3\) — в примерочной/);
  assert.deepEqual(ladderAnnounce('Игнатыч', g), ['🗼 Игнатыч поймал все 20 видов острова «Последний свет» — сет «Смотритель маяка»: шапка, свитер с фонарём и маяк у ника!']);
  // повтор ничего не выдаёт и не объявляет
  const again = grantLadder(e.profiles, p);
  assert.deepEqual(again.items, []);
  assert.deepEqual(ladderAnnounce('Игнатыч', again), []);
  // /isle (DEV_GO): весь сет сразу на желейке
  const d = login(e.hub, 'Tester7').c.profile!;
  devIsleAlbum(e.profiles, d, 20);
  assert.deepEqual({ h: d.outfit.h, a: d.outfit.a, s: d.outfit.s, r: d.outfit.r, b: d.outfit.b, w: d.outfit.w, n: d.outfit.n },
    { h: 'keeper', a: 'keeper', s: 'puffin', r: 'lighthouse', b: 'bellbuoy', w: 'fog', n: 'lighthouse' });
});

test('старые профили: без видов острова ничего не выдаётся; вещи острова в наряде — только свои', () => {
  const e = env();
  const old = login(e.hub, 'Старожил').c.profile!;
  old.album = album(0, COLLECTION.length);
  const g = grantLadder(e.profiles, old);
  assert.ok(g.items.every((id) => !ISLE_ITEMS.has(id)), 'без видов острова — ни одной вещи острова');
  const loaded = normalizeProfile({ id: 9, nick: 'Старик', owned: ['b:duck'], outfit: { ...DEFAULT_OUTFIT, b: 'duck' } })!;
  assert.deepEqual(loaded.owned, ['b:duck']);
  assert.equal(loaded.outfit.b, 'duck');
  const full = { ...DEFAULT_OUTFIT, h: 'keeper', a: 'keeper', s: 'puffin', r: 'lighthouse', b: 'bellbuoy', w: 'fog', n: 'lighthouse' };
  assert.deepEqual(sanitizeOutfit(full, [...ISLE_ITEMS]), full);
  assert.deepEqual(sanitizeOutfit(full, []), { ...DEFAULT_OUTFIT, h: 'none' }, 'чужие вещи острова снимаются');
  assert.ok(GEAR_SLOTS.includes('b') && GEAR_SLOTS.includes('n'));
});

function glb(name: IsleModel): ArrayBuffer {
  const b = readFileSync(new URL(`../client/assets/islecos/${name}.glb`, import.meta.url));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

function tris(g: THREE.BufferGeometry | null | undefined): number {
  if (!g) return 0;
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) assert.ok(Number.isFinite(p.getX(i) + p.getY(i) + p.getZ(i)));
  const c = g.getAttribute('color');
  assert.ok(c && c.itemSize === 3, 'цвет в вершинах — RGB, как у вещей из кода');
  return (g.index?.count ?? p.count) / 3;
}

test('модели GLB: шапка, свитер с фонарём и ореолом, тупик с узлами анимации, поплавки — в бюджете', () => {
  for (const name of ['bellbuoy', 'goldfish-glow', 'puffin', 'keeper-hat', 'keeper-sweater'] as const) {
    const m = parseGlb(glb(name));
    assert.ok(m.roots.length > 0, name);
  }
  primeIsle('keeper-hat', glb('keeper-hat'));
  primeIsle('keeper-sweater', glb('keeper-sweater'));
  primeIsle('puffin', glb('puffin'));
  const hat = isleWear('h', 'keeper')!;
  assert.equal(isleWear('h', 'keeper'), hat, 'одна геометрия на всех');
  assert.equal(hat.y, 1.42);
  const nh = tris(hat.geo);
  assert.ok(nh > 1000 && nh < 2500, `шапка: ${nh}`);
  hat.geo!.computeBoundingBox();
  assert.ok(hat.geo!.boundingBox!.min.y > -0.15 && hat.geo!.boundingBox!.max.y < 0.5, 'шапка — у макушки');
  const sw = isleWear('a', 'keeper')!;
  assert.equal(sw.y, 0.7);
  const ns = tris(sw.geo) + tris(sw.glow);
  assert.ok(ns > 2000 && ns < 4000, `свитер: ${ns}`);
  assert.ok(sw.glow, 'фонарь светится');
  assert.ok(sw.halo && sw.halo.size > 0.3 && sw.halo.x < 0 && sw.halo.z < 0, 'ореол фонаря — слева спереди');
  assert.equal(isleWear('h', 'cap'), undefined, 'прочие вещи — не с острова');
  const puffin = islePuffin()!;
  for (const n of ['puffin_body', 'head', 'lid_L', 'lid_R', 'capelin', 'wing_L', 'wing_R']) assert.ok(puffin.getObjectByName(n), n);
  let draws = 0;
  puffin.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) draws++;
  });
  assert.equal(draws, 7, 'тупик: тело, голова, два века, мойва, два крыла');
});

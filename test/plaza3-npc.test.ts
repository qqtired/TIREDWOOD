// Жители новой набережной (флаг PLAZA3, WP11): у каждого место на настиле и не в стене (кроме задуманного — Бочка
// в бочке, Тоня в нише окна кафе), не на точке входа и не в круге сбора; у каждой модели есть нужные части
// (userData.animation_part), а склейка всех 17 — одна геометрия с костью на часть; реплики по статусу ≤ 60 знаков.
// Раскладка выбирается при импорте (shared/layout.ts): сначала PLAZA3=1, потом — только динамический import().
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

process.env.PLAZA3 = '1';
const { buildLobby } = await import('../shared/maps/lobby.ts');
const { CollisionWorld } = await import('../shared/world.ts');
const { NPCS, NPC_REQUIRED, npcStatusLines, fashionOfDay } = await import('../client/lobby/plaza3/npcdata.ts');
const { npcParts, buildCrowd, idleEase } = await import('../client/lobby/plaza3/npc.ts');
const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
const { ITEMS } = await import('../shared/outfit.ts');

const map = buildLobby();
const world = new CollisionWorld(map);
const glb = (id: string): URL => new URL(`../client/assets/plaza3/npc/${id}.glb`, import.meta.url);
/** Круги сбора: житель в них не стоит */
const CIRCLES = new Set(['pb_gate', 'garage', 'skill', 'boatrace', 'hide', 'fort']);

test('plaza3 жители: 17, у каждого модель, место на настиле и не в стене', () => {
  assert.equal(NPCS.length, 17);
  assert.equal(new Set(NPCS.map((n) => n.id)).size, 17);
  const bad: string[] = [];
  for (const n of NPCS) {
    if (!existsSync(glb(n.id))) bad.push(`${n.id}: нет ${n.id}.glb`);
    if (Math.abs(world.groundBelow(n.x, n.y + 0.01, n.z) - n.y) > 1e-6) bad.push(`${n.id}: нет опоры в (${n.x}; ${n.z})`);
    const inBox = world.overlaps(n.x - 0.45, n.y + 0.05, n.z - 0.45, n.x + 0.45, n.y + 1.5, n.z + 0.45);
    if (inBox !== !!n.inside) bad.push(`${n.id}: ${inBox ? 'в стене' : 'помечен «внутри», а стены нет'} (${n.x}; ${n.z})`);
    for (const it of map.interact) {
      if (it.r <= 0) continue;
      const d = Math.hypot(it.x - n.x, it.z - n.z);
      if (d < 0.8 || (CIRCLES.has(it.kind) && d < it.r + 0.4)) bad.push(`${n.id}: на точке ${it.id} ${it.kind} (${d.toFixed(2)} м)`);
    }
    if (n.lines.some((l) => l.length > 60)) bad.push(`${n.id}: реплика длиннее 60 знаков`);
  }
  assert.deepEqual(bad, []);
});

test('plaza3 жители: части моделей по userData.animation_part и склейка в одну сетку с жёсткими костями', async () => {
  const list = [];
  for (const def of NPCS) {
    const bytes = readFileSync(glb(def.id));
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const parts = npcParts(gltf.scene);
    for (const p of NPC_REQUIRED) assert.ok(parts.has(p), `${def.id}: нет части ${p}`);
    // ходы ожидания и взмах — только по частям, что есть в модели
    for (const m of def.idle.moves) assert.ok(parts.has(m.p), `${def.id}: ход по несуществующей части ${m.p}`);
    assert.ok(parts.has(def.wave.hand), `${def.id}: нечем махать`);
    // у Гены, Лизы, Толика, Лёни, Тони, Мирона, Шуры — две вещи; у Аси — конец шарфа; у Бочки — бочка
    if (['gena', 'liza', 'tolik', 'lyonya', 'tonya', 'miron', 'shura'].includes(def.id)) assert.ok(parts.has('prop.L') && parts.has('prop.R'), def.id);
    if (def.id === 'asya') assert.ok(parts.has('live'));
    if (def.id === 'bochka') assert.ok(parts.has('static'));
    list.push({ def, model: gltf.scene });
  }
  const crowd = buildCrowd(list);
  const g = crowd.geometry;
  const verts = g.getAttribute('position').count;
  assert.equal(crowd.rigs.length, 17);
  assert.equal(crowd.rigs.reduce((s, r) => s + r.count, 0), verts);
  // кость на корень и на каждую часть
  const want = list.reduce((s, x) => s + 1 + npcParts(x.model).size, 0);
  assert.equal(crowd.bones.length, want);
  const si = g.getAttribute('skinIndex');
  const sw = g.getAttribute('skinWeight');
  let maxBone = 0;
  for (let i = 0; i < verts; i++) {
    maxBone = Math.max(maxBone, si.getX(i));
    assert.equal(sw.getX(i), 1);
  }
  assert.ok(maxBone < crowd.bones.length);
  for (const k of ['normal', 'color', 'surf']) assert.equal(g.getAttribute(k).count, verts, k);
  assert.ok(crowd.triangles <= 17 * 8000, `треугольников ${crowd.triangles}`);
  for (const r of crowd.rigs) {
    assert.ok(r.count > 0, r.def.id);
    assert.ok(r.tag.y > 1.5 && r.tag.y < 2.5, `${r.def.id}: табличка на ${r.tag.y}`);
    // вершины жителя — у его места (в пределах 3 м по горизонтали: шарики Вовы и кий Лёни — тоже)
    const p = g.getAttribute('position');
    for (let i = r.first; i < r.first + r.count; i += 97) assert.ok(Math.hypot(p.getX(i) - r.def.x, p.getZ(i) - r.def.z) < 3, r.def.id);
  }
});

test('plaza3 жители: формы ходов ожидания и реплики по статусу', () => {
  const m = { p: 'body' as const, t: 0, d: 1 };
  for (const e of ['hold', 'arc', 'osc'] as const) {
    assert.ok(Math.abs(idleEase({ ...m, e }, 0)) < 1e-9 && Math.abs(idleEase({ ...m, e, n: 2 }, 1)) < 1e-9, e);
  }
  assert.equal(idleEase({ ...m, e: 'hold' }, 0.5), 1);
  const s = { dg: { top: { nick: 'Tester7', waves: 21 }, week: { nick: 'Саня', waves: 12 } }, season: { on: false, left: 65 * 60_000 }, fashion: fashionOfDay(ITEMS, Date.UTC(2026, 9, 11)) };
  assert.deepEqual(npcStatusLines('dungeon', s), ['Рекорд — 21 волна, Tester7. Побьёшь?', 'За неделю лучший — Саня: 12 волн']);
  assert.deepEqual(npcStatusLines('dungeon', { ...s, dg: { top: null, week: null } }), ['Рекордов ещё нет. Будь первым!']);
  assert.deepEqual(npcStatusLines('lighthouse', s), ['До сезона рыбалки 1 ч 5 мин. Проверь удочку']);
  assert.ok(s.fashion && npcStatusLines('wardrobe', s)[0].startsWith('Сегодня в моде: '));
  assert.equal(fashionOfDay(ITEMS, Date.UTC(2026, 9, 11, 1)), fashionOfDay(ITEMS, Date.UTC(2026, 9, 11, 23)));
  for (const t of ['dungeon', 'lighthouse', 'wardrobe'] as const) for (const l of npcStatusLines(t, s)) assert.ok(l.length <= 60, l);
});

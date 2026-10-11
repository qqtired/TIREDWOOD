// Павильоны новой набережной (флаг PLAZA3, WP9): модели из client/assets/plaza3 стоят там, где их ждёт игра, и твёрдое
// layout.json совпадает с боксами col_* моделей (в пределах 0,2 м). Только чистые функции (client/lobby/plaza3/pavdata.ts):
// GLB читается без three.js, корни и повороты — из PAVILIONS.
// Раскладка выбирается при импорте (shared/layout.ts): сначала PLAZA3=1, потом — только динамический import().
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

process.env.PLAZA3 = '1';
const { PAVILIONS, PROP_FILES, BOARD_FIELDS, glbJson, pavAnchors, pavColliders } = await import('../client/lobby/plaza3/pavdata.ts');
const { P3 } = await import('../shared/plaza3/layout.ts');
const { buildLobby } = await import('../shared/maps/lobby.ts');

const ASSETS = new URL('../client/assets/plaza3/', import.meta.url);
const json = new Map(
  [...PAVILIONS.map((p) => p.file), ...PROP_FILES].map((f) => [f, glbJson(new Uint8Array(readFileSync(new URL(f, ASSETS))))]),
);
const place = (id: string) => PAVILIONS.find((p) => p.id === id)!;
const anchors = (id: string) => pavAnchors(json.get(place(id).file)!, place(id));
const near = (a: number, b: number, eps: number): boolean => Math.abs(a - b) <= eps;

test('павильоны: все файлы на месте, без картинок (CSP: без blob:), материалы — семейства p3_*', () => {
  assert.equal(new Set(PAVILIONS.map((p) => p.id)).size, PAVILIONS.length);
  for (const [file, j] of json) {
    const g = j as unknown as { images?: unknown[]; materials?: Array<{ name?: string }> };
    assert.equal(g.images?.length ?? 0, 0, `${file}: картинки`);
    for (const m of g.materials ?? []) assert.match(m.name ?? '', /^p3_(matte|gloss|glow|foliage)/, `${file}: материал ${m.name}`);
  }
});

test('павильоны: поля досок и витрины есть у своих моделей', () => {
  for (const [key, f] of Object.entries(BOARD_FIELDS)) assert.ok(anchors(f.pav).has(f.anchor), `${key}: ${f.pav} без ${f.anchor}`);
  const sc = anchors('fishshowcase');
  for (const a of ['anchor_records_roof', 'anchor_fish_1', 'anchor_fish_2', 'anchor_fish_3', 'anchor_tag_1']) assert.ok(sc.has(a), a);
  assert.ok(anchors('paintball').has('anchor_screen'));
  assert.ok(anchors('lighthouse').has('anchor_lamp'));
});

test('павильоны: вход «Подземелья», доска рекордов, калитка фермы и «Рекорды рыбаков» — там же, где их ставит игра', () => {
  const cliff = anchors('dungeon_cliff');
  for (const [a, at] of [['anchor_entrance', P3.modes.dungeonRock], ['anchor_records_board', P3.modes.dungeonBoard]] as const) {
    const m = cliff.get(a)!;
    assert.ok(near(m.x, at.x, 0.05) && near(m.z, at.z, 0.05), `${a} (${m.x}; ${m.z}) ≠ (${at.x}; ${at.z})`);
    assert.ok(near(Math.cos(m.yaw - at.yaw), 1, 1e-3), `${a}: yaw ${m.yaw} ≠ ${at.yaw}`);
  }
  // калитка (WP7): середина бокса farmgate из layout.json
  const gate = anchors('farm_arch').get('anchor_farm_gate')!;
  const fg = P3.pavilions.find((p) => p.id === 'farmgate')!.box!;
  assert.ok(near(gate.x, (fg.x0 + fg.x1) / 2, 0.05) && near(gate.z, (fg.z0 + fg.z1) / 2, 0.05), `калитка (${gate.x}; ${gate.z})`);
  // щит «Рекордов рыбаков» (WP4, port.showcase.board): лицо — на 2 см перед корнем щита, на север
  const board = anchors('fishshowcase').get('anchor_board_records')!;
  const b = (P3 as unknown as { port: { showcase: { board: { x: number; z: number } } } }).port.showcase.board;
  assert.ok(near(board.x, b.x, 0.05) && near(board.z, b.z - 0.02, 0.05), `щит (${board.x}; ${board.z})`);
});

/** Тело павильона: боксы col_* без растений, скамеек и мелочи у входа (сквозь них пройти не страшно) */
const BODY: Record<string, RegExp> = {
  skytower: /^col_tower$/,
  paintball: /^col_body_/,
  fort: /^col_(wall_|neck|keep)/,
  karting: /^col_body$/,
  farm_arch: /^col_(post_|fence_)/,
  kursaal: /^col_(wall_|pier_|turret_|roof|facade)/,
  cafe: /^col_house$/,
  rotunda: /^col_(column_|step2_)/,
  honor: /^col_(plinth|board)$/,
  online: /^col_kiosk_/,
  lighthouse_arch: /^col_post_/,
  sunset: /^col_column_/,
  lifeguard: /^col_(leg_|brace_|deck|ladder)/,
  aeroclub: /^col_booth$/,
  cabins: /^col_building$/,
};

test('павильоны: твёрдое layout.json покрывает боксы col_* моделей (допуск 0,2 м)', () => {
  // боксы карты PLAZA3 целиком (layout.json + режимы): корпус автомата в ротонде режет её подиум
  const boxes = buildLobby().boxes;
  /** Допуск по x и z: стык с заполнителем блокаута (уголок донжона у pav.back.fw) */
  const T = 0.21;
  const solid = (x: number, y: number, z: number): boolean =>
    boxes.some((b) => x >= b.min[0] - T && x <= b.max[0] + T && y >= b.min[1] && y <= b.max[1] && z >= b.min[2] - T && z <= b.max[2] + T);
  for (const [id, re] of Object.entries(BODY)) {
    const p = place(id);
    assert.equal(p.solid, 'layout', `${id}: твёрдое — у режима`);
    // только то, во что игрок упирается (низ ниже его роста): крыши и шатры над залом — для камеры, не для ходьбы
    const cols = pavColliders(json.get(p.file)!, p).filter((c) => re.test(c.name) && c.min[1] < 1.6);
    assert.ok(cols.length, `${id}: нет боксов ${re}`);
    for (const c of cols) {
      // сетка точек внутри бокса, отступив 0,2 м от граней; по высоте — на уровне груди игрока над низом бокса (выше
      // 6 м донжон крепости шире блокаута на 0,4 м: там заполнители pav.back.*, до этой высоты игроку не добраться)
      const x0 = c.min[0] + 0.2, x1 = c.max[0] - 0.2, z0 = c.min[2] + 0.2, z1 = c.max[2] - 0.2;
      const y = c.min[1] + Math.min(0.8, (c.max[1] - c.min[1]) / 2);
      const miss: string[] = [];
      for (let i = 0; i <= 4; i++) {
        for (let k = 0; k <= 4; k++) {
          const x = x0 <= x1 ? x0 + ((x1 - x0) * i) / 4 : (c.min[0] + c.max[0]) / 2;
          const z = z0 <= z1 ? z0 + ((z1 - z0) * k) / 4 : (c.min[2] + c.max[2]) / 2;
          if (!solid(x, y, z)) miss.push(`(${x.toFixed(2)}; ${y.toFixed(2)}; ${z.toFixed(2)})`);
        }
      }
      assert.deepEqual(miss, [], `${id}.${c.name}: пусто в layout`);
    }
  }
});

test('павильоны: коробки блокаута с pav — у существующих павильонов', () => {
  const ids = new Set(PAVILIONS.map((p) => p.id));
  for (const c of P3.colliders) if (c.pav) assert.ok(ids.has(c.pav), `${c.id}: pav ${c.pav}`);
  for (const d of P3.decor) if (d.pav) assert.ok(ids.has(d.pav), `декор pav ${d.pav}`);
});

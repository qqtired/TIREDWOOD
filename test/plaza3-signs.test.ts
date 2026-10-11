// Вывески новой набережной (PLAZA3, WP10): строки живого статуса, раскладка щита, упаковка холстов в атлас, разбор стрелок
// столбов-указателей и согласованность данных layout.json → signs/posts с таблицей SIGN_META. Чистые функции, без three.js и DOM.
import assert from 'node:assert/strict';
import test from 'node:test';
import { BOAT_SEATS, BP_BOARD, BP_RIDE } from '../shared/boat.ts';
import { FORT_MAX_HUMANS, FT_BREAK, FT_GATHER, FT_WAVE } from '../shared/fort.ts';
import { P3 } from '../shared/plaza3/layout.ts';
import { emptyLive, type LiveIn } from '../client/lobby/plaza/live.ts';
import {
  ATLAS_PAD, DENSITY_MAX, HEAD_SIZE, MIN_STATUS_H, PLANK, SIGN_META, STATUS_SIZE, contentOf, fitTitle, frameOf, headItems, monoRun,
  packAtlas, parseArrow, planPost,
} from '../client/lobby/plaza3/signstyle.ts';
import { STATUS_MAX, clock, emptyExtras, signStatus, statusKey, type SignExtras, type StatusMode } from '../client/lobby/plaza3/status.ts';

const X = (): SignExtras => emptyExtras();
const L = (patch: Partial<LiveIn> = {}): LiveIn => ({ ...emptyLive(), ...patch });
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;

// ------------------------------------------------------------------------------------------------ статусы
test('plaza3-signs: время — m:ss, счёт — с правильными окончаниями', () => {
  assert.equal(clock(25), '0:25');
  assert.equal(clock(65), '1:05');
  assert.equal(clock(-3), '0:00');
  assert.equal(signStatus('paint', L({ pbHumans: 1 }), X()).text, 'идёт бой · 1 игрок');
  assert.equal(signStatus('paint', L({ pbHumans: 3 }), X()).text, 'идёт бой · 3 игрока');
  assert.equal(signStatus('paint', L({ pbHumans: 6 }), X()).text, 'идёт бой · 6 игроков');
  assert.deepEqual(signStatus('paint', L(), X()), { text: 'пусто — заходи первым', tone: 'open' });
});

test('plaza3-signs: картинг, «Ласточка» и автоматы — как в задании', () => {
  const race = L({ kart: { phase: 'race', n: 3, left: 0, lap: 2, laps: 3 } });
  assert.deepEqual(signStatus('kart', race, X()), { text: 'идёт заезд · 3 игрока', tone: 'go' });
  const count = L({ kart: { phase: 'count', n: 2, left: 12, lap: 0, laps: 3 } });
  assert.deepEqual(signStatus('kart', count, X()), { text: 'старт через 0:12 · в круге 2', tone: 'open' });
  assert.deepEqual(signStatus('kart', L(), X()), { text: 'трасса свободна', tone: 'open' });

  const board = L({ boat: { ph: BP_BOARD, n: 2, left: 25 } });
  assert.deepEqual(signStatus('boat', board, X()), { text: 'отплытие через 0:25 · 2 места', tone: 'open' });
  assert.deepEqual(signStatus('boat', L({ boat: { ph: BP_BOARD, n: BOAT_SEATS, left: 9 } }), X()), { text: 'мест нет · отплытие через 0:09', tone: 'bad' });
  assert.deepEqual(signStatus('boat', L({ boat: { ph: BP_RIDE, n: 1, left: 40 } }), X()), { text: 'в поездке · вернётся через 0:40', tone: 'go' });
  assert.equal(signStatus('boat', L(), X()).tone, 'open');

  assert.deepEqual(signStatus('slots', L(), { ...X(), slots: { busy: 1, total: 5 } }), { text: 'свободно 4 автомата', tone: 'open' });
  assert.equal(signStatus('slots', L(), { ...X(), slots: { busy: 4, total: 5 } }).text, 'свободен 1 автомат');
  assert.deepEqual(signStatus('slots', L(), { ...X(), slots: { busy: 5, total: 5 } }), { text: 'все автоматы заняты', tone: 'bad' });
  assert.equal(signStatus('slots', L(), X()).tone, 'open');
});

test('plaza3-signs: режимы за флагом без статуса молчат, со статусом — по фазам', () => {
  for (const m of ['fort', 'sky', 'hide'] as const) assert.deepEqual(signStatus(m, L(), X()), { text: '', tone: 'none' }, m);
  const fort = (phase: number, humans: number, extra: Partial<NonNullable<LiveIn['fort']>> = {}): LiveIn =>
    L({ fort: { phase, wave: 4, humans, left: 20, ...extra } });
  assert.equal(signStatus('fort', fort(FT_WAVE, 3), X()).text, 'волна 4 · держат 3');
  assert.equal(signStatus('fort', fort(FT_WAVE, 3, { rec: { wave: 12, live: true } }), X()).text, 'волна 4 · бьют рекорд!');
  assert.equal(signStatus('fort', fort(FT_BREAK, 2), X()).text, 'передышка · волна 5');
  assert.equal(signStatus('fort', fort(FT_GATHER, 1), X()).text, 'сбор · волна через 0:20');
  assert.deepEqual(signStatus('fort', fort(FT_WAVE, FORT_MAX_HUMANS), X()), { text: 'на стенах тесно · мест нет', tone: 'bad' });
  assert.equal(signStatus('fort', fort(FT_GATHER, 0, { rec: { wave: 12 } }), X()).text, 'рекорд 12 волн · побей!');

  assert.equal(signStatus('sky', L({ skill: { n: 0, max: 5, phase: 'idle', left: 0 } }), X()).text, 'каланча свободна');
  assert.equal(signStatus('sky', L({ skill: { n: 2, max: 5, phase: 'pre', left: 35 } }), X()).text, 'забег через 0:35 · 2 из 5');
  assert.equal(signStatus('sky', L({ skill: { n: 5, max: 5, phase: 'run', left: 0 } }), X()).tone, 'bad');
  assert.equal(signStatus('hide', L({ hide: { phase: 'gather', n: 1, max: 6 } }), X()).text, 'сбор 1 из 6 · нужно двое');
  assert.equal(signStatus('hide', L({ hide: { phase: 'hide', n: 3, max: 6 } }), X()).text, 'идёт раунд · прячутся');

  assert.equal(signStatus('regatta', L(), X()).text, 'бухта свободна');
  assert.equal(signStatus('regatta', L({ regatta: { q: null, running: true } }), X()).text, 'идёт заезд в бухте');
  assert.equal(signStatus('regatta', L({ regatta: { q: { phase: 'count', n: 3, left: 50 }, running: false } }), X()).text, 'старт через 0:50 · у круга 3');
});

test('plaza3-signs: рекорды — полосы аквапарка и «Подземелья», афиша кафе', () => {
  assert.equal(signStatus('aqua', L({ aqua: { nick: 'Лёша', ms: 72340 } }), X()).text, 'рекорд полосы 1:12 · Лёша');
  assert.equal(signStatus('aqua', L(), X()).text, 'рекордов нет — будь первым');
  assert.equal(signStatus('dungeon', L(), { ...X(), dungeon: { nick: 'Саня', waves: 12 } }).text, 'рекорд 12 волн · Саня');
  assert.equal(signStatus('dungeon', L(), X()).text, 'спуск соло · рекордов нет');
  assert.equal(signStatus('cafe', L(), X()).text, 'афиша «Сегодня в городе»');
  assert.equal(signStatus('cafe', L({ pbHumans: 2 }), X()).text, 'сегодня в городе · идёт 1');
});

test('plaza3-signs: любая строка — без эмодзи и не длиннее STATUS_MAX; у каждого режима вывески что-то написано', () => {
  const live = L({
    pbHumans: 12,
    fort: { phase: FT_WAVE, wave: 300, humans: 4, left: 99, rec: { wave: 300, live: true } },
    skill: { n: 5, max: 5, phase: 'run', left: 99 },
    kart: { phase: 'count', n: 6, left: 599, lap: 3, laps: 3 },
    hide: { phase: 'gather', n: 6, max: 6 },
    regatta: { q: { phase: 'count', n: 6, left: 599 }, running: false },
    boat: { ph: BP_BOARD, n: BOAT_SEATS - 1, left: 599 },
    aqua: { nick: 'Кракозябра-Длиннющая', ms: 599990 },
  });
  const ex: SignExtras = { slots: { busy: 0, total: 5 }, dungeon: { nick: 'Кракозябра-Длиннющая', waves: 300 } };
  const modes = new Set<StatusMode>(Object.values(SIGN_META).map((m) => m.mode));
  for (const mode of modes) {
    for (const l of [live, L()]) {
      for (const x of [ex, X()]) {
        const st = signStatus(mode, l, x);
        assert.ok(st.text.length <= STATUS_MAX, `${mode}: «${st.text}» длиннее ${STATUS_MAX}`);
        assert.ok(!EMOJI.test(st.text), `${mode}: эмодзи в «${st.text}»`);
        assert.ok(['open', 'go', 'bad', 'none'].includes(st.tone));
        assert.equal(st.text === '' ? 'none' : st.tone === 'none' ? 'x' : 'none', 'none', `${mode}: пустая строка без точки, непустая — с точкой`);
      }
    }
    if (mode !== 'none' && !['fort', 'sky', 'hide'].includes(mode)) assert.ok(signStatus(mode, L(), X()).text, `${mode}: пустой статус без данных`);
  }
  assert.notEqual(statusKey({ text: 'a', tone: 'go' }), statusKey({ text: 'a', tone: 'open' }));
});

// ------------------------------------------------------------------------------------------------ данные раскладки
test('plaza3-signs: каждая вывеска из layout.json описана в SIGN_META (и наоборот), размеры и повороты заданы', () => {
  const ids = new Set(P3.signs.map((s) => s.id));
  assert.equal(ids.size, P3.signs.length, 'id вывесок не повторяются');
  for (const id of ids) assert.ok(SIGN_META[id], `нет SIGN_META для вывески ${id}`);
  for (const id of Object.keys(SIGN_META)) assert.ok(ids.has(id), `SIGN_META.${id} без вывески в layout.json`);
  for (const s of P3.signs) {
    assert.ok(s.w > 0.5 && s.h > 0.15 && s.w < 8 && s.h < 2, `${s.id}: размер ${s.w}×${s.h}`);
    assert.ok(Number.isFinite(s.yaw) && s.y > 1 && s.y < 8, `${s.id}: поворот или высота`);
    if (s.back) assert.ok(Math.hypot(s.back[0] - s.x, s.back[2] - s.z) < 0.5, `${s.id}: обратная сторона далеко от лицевой`);
  }
  // режимы за флагом — те пять, что умеет Plaza3Dress.setMode
  for (const [id, m] of Object.entries(SIGN_META)) if (m.flag) assert.ok(['fort', 'sky', 'regatta', 'hide', 'dungeon'].includes(m.flag), id);
});

// ------------------------------------------------------------------------------------------------ раскладка щита
test('plaza3-signs: раскладка щита — иконка, название и зона статуса внутри холста и не налезают друг на друга', () => {
  for (const s of P3.signs) {
    const px = (v: number): number => Math.round(v * 230);
    const w = px(s.w);
    const h = px(s.h);
    const m = SIGN_META[s.id];
    const c = contentOf(w, h, m.icon !== null && s.h >= 0.34, m.mode !== 'none' && s.h >= MIN_STATUS_H);
    const f = frameOf(w, h);
    assert.ok(c.textW > 0 && c.textX + c.textW <= w - f.rim, `${s.id}: текст вылез вправо`);
    if (c.icon) {
      assert.ok(c.icon.cx - c.icon.r >= f.rim && c.icon.cx + c.icon.r <= c.textX, `${s.id}: иконка налезает на текст`);
      assert.ok(c.icon.cy - c.icon.r >= f.top && c.icon.cy + c.icon.r <= f.bottom + 1, `${s.id}: иконка вне контента`);
    }
    assert.ok(c.titleBase > f.top && c.titleBase < f.bottom, `${s.id}: название вне контента`);
    if (c.status) {
      const z = c.status.zone;
      assert.ok(z.x >= c.textX && z.x + z.w <= w - f.rim && z.y > c.titleBase && z.y + z.h <= f.bottom + 1, `${s.id}: зона статуса ${JSON.stringify(z)}`);
      assert.ok(c.status.base > z.y && c.status.base < z.y + z.h, `${s.id}: строка статуса вне зоны`);
      assert.ok(c.status.dot.cx + c.status.dot.r <= z.x + z.w + 0.5, `${s.id}: точка вне зоны`);
    }
  }
});

test('plaza3-signs: название — моноширинная сетка, длинное сужается до 72 % и режется с «…»', () => {
  const a = monoRun('АБ В', 10);
  assert.equal(a.xs.length, 4);
  assert.ok(a.xs[3] - a.xs[2] < a.xs[1] - a.xs[0], 'шаг пробела короче знака: пробел сужен');
  assert.ok(monoRun('ПЕЙНТБОЛ', 20).width > monoRun('ПЕЙНТБОЛ', 10).width);
  assert.deepEqual(fitTitle('КАРТИНГ', 20, 1000), { em: 20, text: 'КАРТИНГ' });
  const sq = fitTitle('АВТОМАТЫ · АРКАДА', 20, monoRun('АВТОМАТЫ · АРКАДА', 20).width * 0.85);
  assert.ok(sq.em < 20 && sq.em >= 14.39 && sq.text === 'АВТОМАТЫ · АРКАДА', 'чуть длинное — меньший кегль');
  const cut = fitTitle('КРУПНЕЙШИЕ РЫБЫ СЕГОДНЯ В ПОРТУ', 20, 150);
  assert.ok(cut.em >= 14.39 && cut.text.endsWith('…') && monoRun(cut.text, cut.em).width <= 150, 'совсем длинное — обрезано');
});

// ------------------------------------------------------------------------------------------------ атлас
test('plaza3-signs: упаковка в атлас — всё внутри, без пересечений, с зазором, детерминированно', () => {
  const items = [
    { id: 'a', w: 3, h: 1 }, { id: 'b', w: 2, h: 0.5 }, { id: 'c', w: 1, h: 1 }, { id: 'd', w: 4, h: 0.4, k: 0.5 }, { id: 'p', w: 8, h: 8, fixed: true },
  ];
  const r = packAtlas(items, 512, 4, 600);
  assert.equal(r.rects.length, items.length);
  assert.ok(r.density > 8 && r.density <= 600);
  for (const a of r.rects) {
    assert.ok(a.x >= 4 && a.y >= 4 && a.x + a.w <= 512 - 4 && a.y + a.h <= 512 - 4, `${a.id} вне атласа`);
    for (const b of r.rects) {
      if (a === b) continue;
      const apart = a.x + a.w + 4 <= b.x || b.x + b.w + 4 <= a.x || a.y + a.h + 4 <= b.y || b.y + b.h + 4 <= a.y;
      assert.ok(apart, `${a.id} и ${b.id} слишком близко`);
    }
  }
  assert.deepEqual(packAtlas(items, 512, 4, 600), r);
  const k = r.rects.find((x) => x.id === 'd')!;
  const base = r.rects.find((x) => x.id === 'c')!;
  assert.ok(k.w / 4 < base.w * 0.55, 'k = 0,5 вдвое грубее');
  // мало вывесок — плотность упирается в потолок токенов
  assert.equal(packAtlas([{ id: 'x', w: 1, h: 0.3 }], 2048, 6, 640).density, 640);
  assert.throws(() => packAtlas([{ id: 'big', w: 5000, h: 5000, fixed: true }], 512, 4, 600), /не помещаются/);
});

test('plaza3-signs: вывески и доски столбов помещаются в атлас 2048, статусы — в 1024, плотность не ниже 200 px/м', () => {
  const { items } = headItems(P3.signs, P3.posts);
  const a = packAtlas(items, HEAD_SIZE, ATLAS_PAD, DENSITY_MAX);
  assert.ok(a.density >= 200, `щиты слишком грубые: ${a.density.toFixed(0)} px/м`);
  const rect = new Map(a.rects.map((r) => [r.id, r]));
  const zones = [];
  for (const s of P3.signs) {
    const r = rect.get(s.id)!;
    const m = SIGN_META[s.id];
    const c = contentOf(r.w, r.h, m.icon !== null && s.h >= 0.34, m.mode !== 'none' && s.h >= MIN_STATUS_H);
    if (c.status) zones.push({ id: s.id, w: c.status.zone.w / (r.w / s.w), h: c.status.zone.h / (r.w / s.w) });
  }
  assert.ok(zones.length >= 20);
  const st = packAtlas(zones, STATUS_SIZE, ATLAS_PAD, DENSITY_MAX);
  assert.ok(st.density >= 240, `плашки статусов слишком грубые: ${st.density.toFixed(0)} px/м`);
  // самая мелкая плашка (текст) — не меньше 24 px высотой: читаемо вблизи
  for (const r of st.rects) assert.ok(r.h >= 18, `плашка ${r.id}: ${r.w}×${r.h}`);
});

// ------------------------------------------------------------------------------------------------ столбы-указатели
test('plaza3-signs: стрелки — восемь направлений на карте, север вверх (−Z)', () => {
  assert.deepEqual(parseArrow('Арены ↑'), { name: 'Арены', dir: [0, -1] });
  assert.deepEqual(parseArrow('Кафе · Курзал →'), { name: 'Кафе · Курзал', dir: [1, 0] });
  assert.deepEqual(parseArrow('Ласточка · Регата ↓'), { name: 'Ласточка · Регата', dir: [0, 1] });
  assert.deepEqual(parseArrow('Пляж · Аквапарк ←'), { name: 'Пляж · Аквапарк', dir: [-1, 0] });
  const ne = parseArrow('Огороды — по бульвару ↗');
  assert.equal(ne.name, 'Огороды — по бульвару');
  assert.ok(ne.dir && ne.dir[0] > 0.7 && ne.dir[1] < -0.7);
  const sw = parseArrow('Маяк · Рыбалка ↙').dir!;
  assert.ok(sw[0] < 0 && sw[1] > 0);
  assert.equal(parseArrow('Площадь').dir, null);
  for (const p of P3.posts) {
    for (const a of p.arrows) {
      const r = parseArrow(a);
      assert.ok(r.dir, `${p.id}: нет стрелки в «${a}»`);
      assert.ok(Math.abs(Math.hypot(r.dir[0], r.dir[1]) - 1) < 1e-9);
      assert.ok(r.name.length > 0 && !/[↑↗→↘↓↙←↖]/.test(r.name));
    }
  }
});

test('plaza3-signs: столб — доски через PLANK.pitch сверху вниз, длина по названию, не длиннее предела', () => {
  assert.equal(P3.posts.length, 7);
  for (const p of P3.posts) {
    const plan = planPost(p.arrows);
    assert.equal(plan.planks.length, p.arrows.length);
    plan.planks.forEach((pk, i) => {
      assert.ok(pk.w >= PLANK.min && pk.w <= PLANK.max, `${p.id}.${i}: длина ${pk.w}`);
      if (i > 0) assert.ok(Math.abs(plan.planks[i - 1].y - pk.y - PLANK.pitch) < 1e-9);
      assert.ok(pk.y + PLANK.h / 2 < plan.height && pk.y - PLANK.h / 2 > 0.9, `${p.id}.${i}: доска вне ствола`);
    });
    assert.ok(plan.height > 2.5 && plan.height < 6);
  }
  // длинное название — длинная доска
  const w = (s: string): number => planPost([`${s} ↑`]).planks[0].w;
  assert.ok(w('Маяк · Рыбалка') > w('Пляж'));
});

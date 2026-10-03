// Графика по пунктам (client/render/gfx.ts, client/settings.ts): пресеты дают то же, что давали раньше; «Своё» берёт пункты
// из настроек; правка пункта делает «Своё», не меняя картинку; ограничитель кадров держит темп; старые сохранения читаются.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import {
  EFFECTS_K, FrameLimiter, VIEW_K, clampScale, editGfx, fxCount, fxKeep, gfx, minScale, nativeRatio, pickCustom, pickPreset,
  presetItems, resolveGfx, tierOf, type GfxEnv, type GfxSource, type Tier,
} from '../client/render/gfx.ts';
import { sceneQuality } from '../client/render/quality.ts';
import { DEFAULTS, loadSettings, saveSettings } from '../client/settings.ts';

const env = (dpr: number, over: Partial<GfxEnv> = {}): GfxEnv => ({ dpr, autoRatio: dpr >= 2 ? 1.5 : Math.min(dpr, 1.25), autoStart: dpr >= 2 ? 1.5 : Math.min(dpr, 1.25), touch: false, ...over });
const src = (over: Partial<GfxSource> = {}): GfxSource => ({ quality: 'auto', custom: false, renderScale: 1, shadows: 'high', effects: 'normal', viewDistance: 'far', fpsCap: 0, ...over });
const DPRS = [0.8, 1, 1.25, 1.5, 2, 3];
const TIERS: Tier[] = ['high', 'medium', 'low'];

function fakeStorage(initial?: unknown) {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set('opus.settings.v1', JSON.stringify(initial));
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, String(v)) },
  });
  return data;
}
after(() => { delete (globalThis as { localStorage?: unknown }).localStorage; gfx.fx = 1; });

test('пресеты дают то же разрешение и ту же детализацию, что и до пунктов графики', () => {
  for (const dpr of DPRS) {
    const old = { high: Math.min(dpr, 2), medium: Math.min(dpr, 1.25), low: Math.min(dpr, 1) * 0.75 };
    for (const q of TIERS) {
      const g = resolveGfx(src({ quality: q }), env(dpr));
      assert.ok(Math.abs(g.ratio - old[q]) < 1e-9, `dpr ${dpr}, ${q}: ${g.ratio} ≠ ${old[q]}`);
      assert.equal(g.tier, q);
      assert.equal(g.auto, false);
      assert.equal(g.fpsCap, 0);
      assert.equal(g.viewDistance, 'far');
    }
  }
});

test('уровень детализации по пунктам совпадает с пресетами', () => {
  for (const dpr of DPRS) for (const t of TIERS) assert.equal(tierOf(presetItems(t, dpr)), t, `${t} при ${dpr}`);
  assert.equal(tierOf({ effects: 'more', shadows: 'high' }), 'high');
  assert.equal(tierOf({ effects: 'normal', shadows: 'off' }), 'medium');
  assert.equal(tierOf({ effects: 'less', shadows: 'off' }), 'low');
  assert.equal(tierOf({ effects: 'less', shadows: 'high' }), 'medium');
});

test('«Авто»: разрешение и детализация — как у игры сейчас, пункты показывают это', () => {
  for (const touch of [false, true]) {
    for (const dpr of [1, 1.5, 2]) {
      const e = env(dpr, { touch });
      const start = e.autoStart;
      for (const ratio of [start, start - 0.25, 0.75]) {
        const g = resolveGfx(src({ quality: 'auto' }), { ...e, autoRatio: ratio });
        assert.equal(g.ratio, ratio);
        assert.equal(g.tier, sceneQuality('auto', ratio, start, touch));
        assert.equal(g.auto, true);
        assert.ok(Math.abs(g.renderScale * nativeRatio(dpr) - ratio) < 1e-9, 'ползунок показывает фактическое разрешение');
      }
    }
  }
  // на слабом компьютере «Авто» дошло до низкого: пункты показывают низкое (тени, эффекты), а не высокое
  const low = resolveGfx(src(), env(1, { autoRatio: 0.75 }));
  assert.deepEqual([low.tier, low.shadows, low.effects], ['low', 'low', 'less']);
});

test('«Своё»: пункты из настроек, пресет и «Авто» не мешают', () => {
  const g = resolveGfx(src({ quality: 'auto', custom: true, renderScale: 0.6, shadows: 'off', effects: 'more', viewDistance: 'mid', fpsCap: 30 }), env(1, { autoRatio: 0.75 }));
  assert.deepEqual([g.ratio, g.shadows, g.effects, g.viewDistance, g.fpsCap, g.auto], [0.6, 'off', 'more', 'mid', 30, false]);
  assert.equal(g.tier, 'medium');
  // на плотном экране 100 % — двойное, 50 % — единица
  assert.equal(resolveGfx(src({ custom: true, renderScale: 1 }), env(2)).ratio, 2);
  assert.equal(resolveGfx(src({ custom: true, renderScale: 0.5 }), env(2)).ratio, 1);
  assert.equal(resolveGfx(src({ custom: true, renderScale: 1 }), env(3)).ratio, 2, 'выше двойного не рисуем');
  // слишком малое или лишнее — в пределы
  assert.equal(resolveGfx(src({ custom: true, renderScale: 0.05 }), env(1)).ratio, 0.5);
  assert.equal(resolveGfx(src({ custom: true, renderScale: 7 }), env(1)).ratio, 1);
});

test('предел ползунка разрешения: на обычном экране 50 %, на плотном ниже, чтобы рендер не падал ниже 0,5 пикселя на пиксель', () => {
  assert.equal(minScale(1), 0.5);
  assert.equal(minScale(1.25), 0.4);
  assert.equal(minScale(1.5), 0.35);
  assert.equal(minScale(2), 0.25);
  assert.equal(minScale(3), 0.25);
  assert.equal(minScale(0.8), 0.5);
  for (const dpr of DPRS) assert.ok(minScale(dpr) * nativeRatio(dpr) >= 0.5 - 1e-9 || dpr < 1, `рендер не ниже половины пикселя: ${dpr}`);
  assert.equal(clampScale(0.1, 1), 0.5);
  assert.equal(clampScale(2, 1), 1);
  assert.equal(clampScale(Number.NaN, 2), 1);
});

test('правка пункта делает «Своё» и не меняет картинку, пока пункт не тронут', () => {
  for (const dpr of DPRS) {
    for (const quality of ['auto', 'high', 'medium', 'low'] as const) {
      const s = src({ quality });
      const e = env(dpr);
      const before = resolveGfx(s, e);
      pickCustom(s, before);
      const after = resolveGfx(s, e);
      assert.equal(s.custom, true);
      assert.equal(s.quality, quality, 'сам пресет остаётся записанным');
      for (const k of ['ratio', 'tier', 'shadows', 'effects', 'viewDistance', 'fpsCap'] as const) assert.equal(after[k], before[k], `${quality}/${dpr}: ${k}`);
      assert.ok(Math.abs(after.ratio - before.ratio) < 1e-9);
      assert.equal(after.auto, false);
    }
  }
  const s = src({ quality: 'low' });
  editGfx(s, resolveGfx(s, env(1)), { shadows: 'off' });
  assert.equal(s.custom, true);
  assert.deepEqual([s.shadows, s.effects, s.renderScale], ['off', 'less', 0.75], 'остальные пункты — как были у пресета');
  // ещё одна правка — те же значения, только она
  editGfx(s, resolveGfx(s, env(1)), { fpsCap: 60 });
  assert.deepEqual([s.shadows, s.fpsCap], ['off', 60]);
});

test('пресет выставляет все пункты и выключает «Своё»', () => {
  const s = src({ custom: true, quality: 'auto', renderScale: 0.4, shadows: 'off', effects: 'more', viewDistance: 'near', fpsCap: 30 });
  pickPreset(s, 'high');
  assert.deepEqual([s.custom, s.quality], [false, 'high']);
  const g = resolveGfx(s, env(1));
  assert.deepEqual([g.ratio, g.shadows, g.effects, g.viewDistance, g.fpsCap, g.tier], [1, 'high', 'normal', 'far', 0, 'high']);
});

test('ограничитель кадров: 30 на 60 Гц — каждый второй, 60 на 60 Гц — все, на 144 Гц — около 60, без ограничения — все', () => {
  const run = (hz: number, cap: number, seconds: number, jitter = 0.4) => {
    const lim = new FrameLimiter();
    const step = 1000 / hz;
    const times: number[] = [];
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2 * jitter;
    for (let t = 1000, i = 0; t < 1000 + seconds * 1000; i++, t = 1000 + i * step) if (lim.allow(t + rnd(), cap)) times.push(t);
    return times;
  };
  assert.equal(run(60, 0, 10).length, 600);
  const k30 = run(60, 30, 10);
  assert.ok(Math.abs(k30.length - 300) <= 2, `30 на 60 Гц: ${k30.length}`);
  const gaps = k30.slice(1).map((t, i) => t - k30[i]);
  assert.ok(gaps.every((g) => g > 30 && g < 37), 'кадры ровные, без пачек');
  const k60 = run(60, 60, 10);
  assert.ok(k60.length >= 595, `60 на 60 Гц: ${k60.length}`);
  const k144 = run(144, 60, 10);
  assert.ok(k144.length >= 550 && k144.length <= 610, `60 на 144 Гц: ${k144.length}`);
  const k144b = run(144, 30, 10);
  assert.ok(k144b.length >= 280 && k144b.length <= 310, `30 на 144 Гц: ${k144b.length}`);
});

test('ограничитель кадров: после долгой паузы догоняющей пачки нет', () => {
  const lim = new FrameLimiter();
  assert.equal(lim.allow(1000, 30), true);
  assert.equal(lim.allow(1016, 30), false);
  // вкладка спала две секунды
  assert.equal(lim.allow(3000, 30), true);
  assert.equal(lim.allow(3016, 30), false);
  assert.equal(lim.allow(3034, 30), true);
  // ограничение сняли — все кадры, а потом включили снова — без хвоста от старого расписания
  assert.equal(lim.allow(3040, 0), true);
  assert.equal(lim.allow(3050, 0), true);
  assert.equal(lim.allow(3056, 60), true);
});

test('частицы: меньше — вдвое, больше — в полтора раза; пустой залп остаётся пустым, непустой не пропадает', () => {
  for (const [level, k] of Object.entries(EFFECTS_K)) {
    gfx.fx = k;
    assert.equal(fxCount(0), 0, level);
    assert.equal(fxCount(1), Math.max(1, Math.round(k)), level);
    assert.equal(fxCount(14), Math.round(14 * k), level);
  }
  assert.deepEqual([EFFECTS_K.less, EFFECTS_K.normal, EFFECTS_K.more], [0.5, 1, 1.5]);
  // по одной: при «Меньше» остаётся около половины, при «Обычно» и «Больше» — все
  const was = Math.random;
  try {
    let n = 0;
    Math.random = () => ((n++ * 0.6180339887) % 1);
    gfx.fx = 0.5;
    let kept = 0;
    for (let i = 0; i < 1000; i++) if (fxKeep()) kept++;
    assert.ok(kept > 470 && kept < 530, `оставлено ${kept} из 1000`);
    gfx.fx = 1;
    assert.equal(fxKeep(), true);
    gfx.fx = 1.5;
    assert.equal(fxKeep(), true);
  } finally {
    Math.random = was;
    gfx.fx = 1;
  }
});

test('дальность: «далеко» — как у сцены, ближе — строго меньше', () => {
  assert.equal(VIEW_K.far, 1);
  assert.ok(VIEW_K.mid < 1 && VIEW_K.near < VIEW_K.mid && VIEW_K.near > 0.1);
});

test('сохранения: старое читается как было, новые пункты по умолчанию', () => {
  fakeStorage({ sens: 2, quality: 'low', fov: 100 });
  const s = loadSettings();
  assert.equal(s.quality, 'low');
  assert.deepEqual([s.custom, s.renderScale, s.shadows, s.effects, s.viewDistance, s.fpsCap], [false, 1, 'high', 'normal', 'far', 0]);
  assert.deepEqual(
    [s.custom, s.renderScale, s.shadows, s.effects, s.viewDistance, s.fpsCap],
    [DEFAULTS.custom, DEFAULTS.renderScale, DEFAULTS.shadows, DEFAULTS.effects, DEFAULTS.viewDistance, DEFAULTS.fpsCap],
  );
  // и играется так же, как играло: пресет решает всё
  const g = resolveGfx(s, env(1));
  assert.deepEqual([g.ratio, g.tier, g.shadows, g.effects], [0.75, 'low', 'low', 'less']);
  for (const quality of ['auto', 'high', 'medium']) {
    fakeStorage({ quality });
    assert.equal(loadSettings().quality, quality);
    assert.equal(loadSettings().custom, false);
  }
});

test('сохранения: «Своё» записывается и читается, мусор — в пределы или по умолчанию', () => {
  const data = fakeStorage();
  saveSettings({ ...loadSettings(), quality: 'high', custom: true, renderScale: 0.65, shadows: 'low', effects: 'more', viewDistance: 'mid', fpsCap: 30 });
  assert.ok(data.has('opus.settings.v1'), 'под прежним ключом');
  const back = loadSettings();
  assert.deepEqual([back.quality, back.custom, back.renderScale, back.shadows, back.effects, back.viewDistance, back.fpsCap], ['high', true, 0.65, 'low', 'more', 'mid', 30]);
  fakeStorage({ custom: 'yes', renderScale: 9, shadows: 'ultra', effects: 3, viewDistance: null, fpsCap: 45 });
  const junk = loadSettings();
  assert.deepEqual([junk.custom, junk.renderScale, junk.shadows, junk.effects, junk.viewDistance, junk.fpsCap], [false, 1, 'high', 'normal', 'far', 0]);
  fakeStorage({ renderScale: 0.01 });
  assert.equal(loadSettings().renderScale, 0.25);
  fakeStorage({ renderScale: 'big', fpsCap: '60' });
  assert.deepEqual([loadSettings().renderScale, loadSettings().fpsCap], [1, 0]);
  for (const fpsCap of [0, 60, 30]) {
    fakeStorage({ fpsCap });
    assert.equal(loadSettings().fpsCap, fpsCap);
  }
});

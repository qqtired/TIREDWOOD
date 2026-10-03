// «Мерзкий повторяющийся звук» на площади (баг владельца): шум моря был петлёй в 2 с и ровно раз в две секунды возвращал
// один и тот же рокот; чайки набережной кричали по очереди одним и тем же «ки-йа ки-йа» каждые ~6 с. Здесь — что
// теперь: длинные петли без стыка, редкие и разные крики, ближние чайки — только вблизи, всё идёт через голоса.
import assert from 'node:assert/strict';
import test from 'node:test';
import { FAR_GULL_EVERY, GULL_GAP, GULL_NEAR, gullCall, LOOP_FADE, loopNoise, RAIN_LOOP, SURF_LOOPS } from '../client/ambience.ts';
import { Sound } from '../client/audio.ts';
import { RainVoice } from '../client/weathersound.ts';

const SR = 48000;

/** Предсказуемый «случайный» ряд (mulberry32): тест не мигает */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rms = (a: Float32Array, from: number, to: number): number => {
  let s = 0;
  for (let i = from; i < to; i++) s += a[i] * a[i];
  return Math.sqrt(s / (to - from));
};
/** Нормированная корреляция куска [a, a+n) с куском на lag отсчётов правее */
function ncc(x: Float32Array, a: number, lag: number, n: number): number {
  let xy = 0;
  let xx = 0;
  let yy = 0;
  for (let i = 0; i < n; i++) {
    const p = x[a + i];
    const q = x[a + lag + i];
    xy += p * q;
    xx += p * p;
    yy += q * q;
  }
  return xy / Math.sqrt(xx * yy);
}

test('петля шума: на стыке нет щелчка (конец перетекает в начало), громкость вдоль петли ровная', () => {
  let ratio = 0;
  const seeds = 12;
  for (let seed = 1; seed <= seeds; seed++) {
    const d = loopNoise(SR * 11, SR * LOOP_FADE, true, rng(seed));
    assert.equal(d.length, SR * 11);
    let steps = 0;
    for (let i = 1; i < d.length; i++) steps += (d[i] - d[i - 1]) ** 2;
    const typical = Math.sqrt(steps / (d.length - 1));
    // шаг от последнего отсчёта к первому (петля) — обычный шаг шума, а не скачок (у прежней петли без перетекания он
    // был от долей до 8 типичных шагов, в среднем ~3)
    assert.ok(Math.abs(d[0] - d[d.length - 1]) < 4 * typical, `seed ${seed}: стык ${Math.abs(d[0] - d[d.length - 1])} при типичном шаге ${typical}`);
    ratio += rms(d, 0, SR * LOOP_FADE) / rms(d, SR * LOOP_FADE, d.length);
  }
  // перетекание по равной мощности: на стыке громкость та же, что вдоль петли (линейное «провалилось» бы на ~13%)
  ratio /= seeds;
  assert.ok(ratio > 0.92 && ratio < 1.08, `громкость у стыка / вдоль петли: ${ratio}`);
});

test('петля шума не повторяется короткими кусками: через 2 с (длина прежней петли) и 4 с корреляции нет', () => {
  for (const brown of [true, false]) {
    const d = loopNoise(SR * 11, SR * LOOP_FADE, brown, rng(brown ? 7 : 8));
    for (const lag of [0.5, 1, 2, 4]) assert.ok(Math.abs(ncc(d, SR * 2, Math.round(lag * SR), SR * 3)) < 0.12, `${brown ? 'коричневый' : 'белый'}, сдвиг ${lag} с`);
  }
  // а у прежней двухсекундной петли (то же, что audio.ts makeNoise) через 2 с — полный повтор: ради этого всё и затеяно
  const old = loopNoise(SR * 2, 0, true, rng(3));
  const twice = new Float32Array(SR * 10);
  for (let i = 0; i < twice.length; i++) twice[i] = old[i % old.length];
  assert.ok(ncc(twice, 0, SR * 2, SR * 3) > 0.99);
});

test('шум: белый остаётся белым (обычная громкость; на перетекании не выше √2), коричневый — с прежней громкостью', () => {
  const white = loopNoise(SR * 4, SR, false, rng(5));
  assert.ok(white.every((v) => Math.abs(v) <= Math.SQRT2));
  assert.ok(Math.abs(rms(white, 0, white.length) - Math.sqrt(1 / 3)) < 0.01);
  const brown = loopNoise(SR * 11, SR, true, rng(6));
  // прежний шум: AR(1) 0,02/1,02, ×3,5 — среднеквадратичное ≈ 0,2
  assert.ok(Math.abs(rms(brown, 0, brown.length) - 0.2) < 0.05, String(rms(brown, 0, brown.length)));
});

test('длины петель: прибой — две разные и длинные, дождь — длинная', () => {
  assert.ok(SURF_LOOPS.length >= 2);
  assert.ok(SURF_LOOPS.every((s) => s >= 8), 'не короче 8 с — повтор на слух не ловится');
  assert.equal(new Set(SURF_LOOPS).size, SURF_LOOPS.length);
  assert.ok(SURF_LOOPS[1] % SURF_LOOPS[0] !== 0, 'длины не кратны: петли не сходятся на каждом повторе');
  assert.ok(RAIN_LOOP >= 6);
  assert.ok(LOOP_FADE >= 0.5 && LOOP_FADE <= 2);
});

test('крик чайки каждый раз другой: 1–3 слога, своя высота и громкость, слоги не через равные промежутки', () => {
  const r = rng(11);
  const counts = new Set<number>();
  const bases = new Set<number>();
  const seen = new Set<string>();
  for (let i = 0; i < 300; i++) {
    const c = gullCall(r);
    assert.ok(c.length >= 1 && c.length <= 3);
    counts.add(c.length);
    assert.equal(c[0].at, 0);
    c.forEach((s, k) => {
      assert.ok(s.base >= 1050 * 0.96 && s.base <= 1400 * 1.04, `высота ${s.base}`);
      assert.ok(s.gain > 0.5 && s.gain <= 1);
      if (k > 0) assert.ok(s.at - c[k - 1].at >= 0.24 && s.at - c[k - 1].at <= 0.36);
      bases.add(Math.round(s.base));
    });
    seen.add(JSON.stringify(c.map((s) => [Math.round(s.base / 5), Math.round(s.gain * 10)])));
  }
  assert.deepEqual([...counts].sort(), [1, 2, 3]);
  assert.ok(bases.size > 200, 'высота плавает');
  assert.ok(seen.size > 280, 'повторов почти нет');
});

/** Поддельный AudioContext: узлы запоминают, что с ними делали */
function fakeContext() {
  const nodes: any[] = [];
  const param = (v = 0) => ({ value: v, ramps: [] as number[], setValueAtTime() {}, exponentialRampToValueAtTime(x: number) { this.ramps.push(x); }, linearRampToValueAtTime() {}, setTargetAtTime() {} });
  const mk = (kind: string) => {
    const n: any = {
      kind, type: '', loop: false, buffer: null, started: [] as unknown[][], to: [] as any[],
      frequency: param(), gain: param(1), Q: param(), pan: param(), detune: param(),
      connect(d: any) { n.to.push(d); return d; }, disconnect() {}, start(...a: unknown[]) { n.started.push(a); }, stop() {},
    };
    nodes.push(n);
    return n;
  };
  return {
    sampleRate: SR, currentTime: 0, state: 'running', nodes,
    createGain: () => mk('gain'), createOscillator: () => mk('osc'), createBiquadFilter: () => mk('filter'), createStereoPanner: () => mk('stereo'), createBufferSource: () => mk('src'),
    createBuffer: (_ch: number, len: number, sr: number) => { const data = new Float32Array(len); return { length: len, sampleRate: sr, duration: len / sr, getChannelData: () => data }; },
  };
}

test('прибой: две длинные петли разной длины без стыка, не прежний шум на 2 с; каждая стартует с случайного места', () => {
  const s = new Sound() as any;
  const ctx = fakeContext();
  s.ctx = ctx;
  s.amb = { bus: 'amb' };
  s.brownBuf = ctx.createBuffer(1, SR * 2, SR);
  s.startAmbience();
  const srcs = ctx.nodes.filter((n) => n.kind === 'src');
  assert.equal(srcs.length, SURF_LOOPS.length);
  for (const n of srcs) {
    assert.ok(n.loop && n.buffer !== s.brownBuf && n.buffer.duration >= 8, 'длинная петля, не общий шум на 2 с');
    assert.equal(n.started.length, 1);
    assert.ok((n.started[0][1] as number) >= 0 && (n.started[0][1] as number) < n.buffer.duration);
  }
  assert.deepEqual(srcs.map((n) => Math.round(n.buffer.duration)), [...SURF_LOOPS]);
  // обе петли идут через один смеситель с понижением на √½ (общая громкость как раньше) в фильтр прибоя
  const mix = srcs[0].to[0];
  assert.ok(srcs.every((n) => n.to[0] === mix));
  assert.ok(Math.abs(mix.gain.value - Math.SQRT1_2) < 1e-9);
});

/** Слушатель там-то (то, что запоминает setListener, — без настоящего AudioListener) */
function listen(s: any, x: number, y: number, z: number): void {
  s.lx = x;
  s.ly = y;
  s.lz = z;
}

/** Звук с подставными узлами: что играет и куда (out подменён, как в test/lobby-event-audio.test.ts) */
function stubSound() {
  const s = new Sound() as any;
  const calls: any[] = [];
  const outs: any[] = [];
  s.ctx = { state: 'running', currentTime: 0 };
  s.amb = { bus: 'amb' };
  s.sfx = { bus: 'sfx' };
  s.out = (pos: any, bus: any, _muffle: number, _ref: number, key: string) => { outs.push({ pos, bus, key }); return { pos, bus }; };
  s.tone = (...a: any[]) => calls.push({ kind: 'tone', a });
  s.noise = (...a: any[]) => calls.push({ kind: 'noise', a });
  return { s, calls, outs };
}

test('ближняя чайка: слышна только вблизи (на площади — нет), не чаще раза в 7–15 с на всех, через голоса с ключом', () => {
  const { s, calls, outs } = stubSound();
  listen(s, 0, 2, 6);
  // с площади (спавн) до чаек пирса — 14,5 м и дальше: не кричат
  s.gullCry([-5, 0.25, 20.5]);
  s.gullCry([5, 0.25, 20.4]);
  s.gullCry([16.5, 0.25, 20.3]);
  assert.equal(outs.length, 0);
  assert.ok(Math.hypot(5, 14.4) > GULL_NEAR && 14 === GULL_NEAR, 'граница — 14 м по земле');
  // у берега — кричит, через out() с шиной «Окружение» и ключом: ограничитель голосов её видит
  listen(s, 0, 2, 14);
  s.gullCry([-5, 0.25, 20.5]);
  assert.equal(outs.length, 1);
  assert.equal(outs[0].bus, s.amb);
  assert.equal(outs[0].key, 'gullCry');
  assert.ok(calls.length >= 2 && calls.length % 2 === 0 && calls.length <= 6, `слогов 1–3, по два тона: ${calls.length}`);
  assert.ok(calls.every((c) => c.a[5] <= 0.05 && c.a[0].bus === s.amb), 'тихо, в шине «Окружение»');
  // следующий крик сразу — склеен
  const n = calls.length;
  for (let i = 0; i < 5; i++) s.gullCry([-5, 0.25, 20.5]);
  assert.equal(calls.length, n);
  assert.equal(outs.length, 1);
  assert.ok(GULL_GAP[0] >= 6 && GULL_GAP[1] > GULL_GAP[0]);
  // не играет, пока звук не разрешён
  s.ctx.state = 'suspended';
  s.gullCry([-5, 0.25, 15]);
  assert.equal(calls.length, n);
});

test('ближняя чайка: с отключённым ограничителем (legacy) каждый крик другой — слогов то один, то три, высота плавает', () => {
  const { s, calls } = stubSound();
  s.pool.off = true;
  listen(s, 0, 2, 18);
  const shapes = new Set<number>();
  const firstNotes = new Set<number>();
  for (let i = 0; i < 200; i++) {
    const from = calls.length;
    s.gullCry([-5, 0.25, 20.5]);
    shapes.add((calls.length - from) / 2);
    firstNotes.add(Math.round(calls[from].a[1] / 4));
  }
  assert.deepEqual([...shapes].sort(), [1, 2, 3]);
  assert.ok(firstNotes.size > 40);
});

test('далёкая чайка (фон): через out() с ключом, не прямо в шину; тише прежней; делит паузу с ближними', () => {
  const { s, outs } = stubSound();
  const ctx = fakeContext();
  s.ctx = ctx;
  s.mute = { bus: 'mute' };
  s.out = (pos: any, bus: any, _m: number, _r: number, key: string) => { outs.push({ pos, bus, key }); return ctx.createGain(); };
  s.gull();
  assert.equal(outs.length, 1);
  assert.deepEqual([outs[0].pos, outs[0].bus, outs[0].key], [null, s.amb, 'gull']);
  const env = ctx.nodes.filter((n) => n.kind === 'gain').flatMap((n) => n.gain.ramps).filter((v: number) => v > 0.001);
  assert.ok(env.length >= 1 && env.length <= 3);
  assert.ok(env.every((v: number) => v <= 0.0225), `прежний пик был 0,0315, теперь ≤ 0,022: ${env}`);
  // сразу ещё одна — склеена с предыдущей; ближняя тоже молчит
  s.gull();
  listen(s, 0, 2, 18);
  s.gullCry([-5, 0.25, 20.5]);
  assert.equal(outs.length, 1);
  // вытеснена из голосов (out вернул mute) — узлов не строит
  const before = ctx.nodes.length;
  s.pool.off = true;
  s.out = () => s.mute;
  s.gull();
  assert.equal(ctx.nodes.length, before);
});

test('раз в кадр: далёкая чайка — раз в 14–40 с (было 7–21), в дождь молчит', () => {
  const { s } = stubSound();
  let gulls = 0;
  s.gull = () => { gulls++; };
  s.horn = () => {};
  for (let i = 0; i < 100; i++) {
    s.nextGull = 0.01;
    s.nextHorn = 1000;
    s.tick(0.02);
    assert.ok(s.nextGull >= FAR_GULL_EVERY[0] - 0.02 && s.nextGull <= FAR_GULL_EVERY[1], `${s.nextGull}`);
  }
  assert.equal(gulls, 100);
  s.rainLevel = 0.5;
  s.nextGull = 0.01;
  s.tick(0.02);
  assert.equal(gulls, 100, 'в дождь чайки прячутся');
  assert.ok(FAR_GULL_EVERY[0] >= 14);
});

test('дождь: шум — длинная петля, левый и правый край берут её из мест, отстоящих на полпетли', () => {
  const ctx = fakeContext();
  const noise = ctx.createBuffer(1, SR * RAIN_LOOP, SR);
  const brown = ctx.createBuffer(1, SR * RAIN_LOOP, SR);
  new RainVoice(ctx as unknown as AudioContext, ctx.createGain() as unknown as AudioNode, noise as unknown as AudioBuffer, brown as unknown as AudioBuffer);
  const beds = ctx.nodes.filter((n) => n.kind === 'src' && n.buffer === noise && n.started[0][1] !== undefined).slice(0, 2);
  assert.equal(beds.length, 2);
  const [a, b] = beds.map((n) => n.started[0][1] as number);
  assert.ok(a >= 0 && a < noise.duration && b >= 0 && b < noise.duration);
  const apart = Math.abs(a - b);
  assert.ok(Math.abs(Math.min(apart, noise.duration - apart) - noise.duration / 2) < 1e-6, `${a} и ${b} в петле ${noise.duration} с`);
});

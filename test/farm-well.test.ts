// Ферма: мини-игра «Набери лейку» (shared/farmwell.ts). Сервер переигрывает отсчёты клиента той же моделью со своим
// зерном: честная игра даёт высокую долю, зажал-и-стоял — не больше трети, подделка отсчётов не проходит.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  WELL, WELL_AFK_SHARE, WELL_HZ, WELL_MAX_SAMPLES, WELL_MAX_TICKS, WELL_X, mouthAt, newWell, stepWell, wellShare, type WellSim,
} from '../shared/farmwell.ts';

const SEEDS = Array.from({ length: 60 }, (_, i) => 1000 + i * 7919);

/** Управление: по модели на этом тике решает, куда вести ведро (0–1) и наклонять ли (0–1) */
type Ctl = (s: WellSim, tick: number) => [number, number];

/** Сыграть как клиент: каждый тик записать отсчёт (x в ‰, наклон) и сдвинуть модель; вернуть отсчёты и итог модели */
function record(seed: number, ctl: Ctl, maxTicks = WELL_MAX_TICKS): { samples: number[]; sim: WellSim } {
  const sim = newWell(seed);
  const samples: number[] = [];
  for (let i = 0; i < maxTicks && sim.phase !== 'done'; i++) {
    const [x, tilt] = ctl(sim, i);
    const xi = Math.round(Math.min(1, Math.max(0, x)) * WELL_X);
    samples.push(xi, tilt);
    stepWell(sim, xi / WELL_X, tilt);
  }
  return { samples, sim };
}

/** Тот, кто следит за горлышком: рука отстаёт на lag секунд, мышь дрожит на ±noise/2; наклон зажат целиком */
function tracker(lag: number, noise: number, seed: number): Ctl {
  let r = seed >>> 0;
  const rnd = (): number => { r = (Math.imul(r, 1664525) + 1013904223) >>> 0; return r / 4294967296 - 0.5; };
  return (s) => [mouthAt(s.can, Math.max(0, s.t - lag)) - s.tilt * WELL.shift + rnd() * noise, 1];
}

const mean = (v: number[]): number => v.reduce((a, b) => a + b, 0) / v.length;

test('честная игра: ведро ведёт струю за горлышком — доля высокая и совпадает у клиента и сервера', () => {
  const shares: number[] = [];
  for (const seed of SEEDS) {
    const { samples, sim } = record(seed, tracker(0.1, 0.03, seed));
    const share = wellShare(seed, samples);
    // клиент крутит ту же модель, что и сервер: цифры на экране и в профиле сходятся до последнего знака
    assert.equal(share, Math.min(1, sim.fill), `зерно ${seed}`);
    shares.push(share);
  }
  assert.ok(mean(shares) >= 0.95, `в среднем ${mean(shares).toFixed(2)}`);
  assert.ok(Math.min(...shares) >= 0.7, `худшая ${Math.min(...shares).toFixed(2)}`);
  // чуть неповоротливее (рука отстаёт на 0,15 с) — всё ещё заметно больше половины
  const slower = SEEDS.map((seed) => wellShare(seed, record(seed, tracker(0.15, 0.04, seed)).samples));
  assert.ok(mean(slower) >= 0.8, `медленнее ${mean(slower).toFixed(2)}`);
});

test('AFK: зажал ЛКМ и не двигал мышь — не больше трети, сколько бы ни повезло с горлышком', () => {
  const all: number[] = [];
  const natural: number[] = [];
  for (const x0 of [0.15, 0.3, 0.5, 0.7]) {
    for (const seed of SEEDS) {
      const { samples, sim } = record(seed, () => [x0, 1]);
      all.push(wellShare(seed, samples));
      if (x0 === 0.3) natural.push(sim.fill);
    }
  }
  assert.ok(Math.max(...all) <= WELL_AFK_SHARE + 1e-9, `предел ${Math.max(...all)}`);
  // без предела модель сама даёт стоящему 25–35 % (дизайн §7.1), предел — страховка от удачного места
  assert.ok(mean(natural) > 0.2 && mean(natural) < 0.4, `само по себе ${mean(natural).toFixed(2)}`);
  // а вот ловкий с минимальным ходом ведра, но живым наклоном (пульсирует ЛКМ) под предел не попадает
  const pulse = SEEDS.map((seed) => wellShare(seed, record(seed, (s, i) => [mouthAt(s.can, s.t) - 0.12, Math.floor(i / 18) % 2 === 0 ? 1 : 0.2]).samples));
  assert.ok(pulse.some((v) => v > WELL_AFK_SHARE), 'играющий наклоном не считается стоящим');
  assert.equal(wellShare(5, []), 0, 'пустая попытка — ноль');
});

test('подделка отсчётов: рывки, чужая запись, мусор и «лишнее» время не дают выигрыша', () => {
  // 1. ведро и наклон не телепортируются: за тик ведро едет не дальше speed/30, наклон растёт не быстрее 1/(0,8·30)
  const s = newWell(7);
  stepWell(s, 0.95, 1);
  assert.ok(s.x - 0.5 <= WELL.speed / WELL_HZ + 1e-9, `ведро прыгнуло на ${s.x - 0.5}`);
  assert.ok(s.tilt <= 1 / (WELL.tiltUp * WELL_HZ) + 1e-9, `наклон сразу ${s.tilt}`);
  stepWell(s, Number.NaN, Number.POSITIVE_INFINITY);
  assert.ok(Number.isFinite(s.x) && s.tilt >= 0 && s.tilt <= 1);

  // 2. запись идеальной игры под одно зерно на другом зерне не работает: горлышко качается иначе
  const own: number[] = [];
  const foreign: number[] = [];
  for (let i = 0; i < 30; i++) {
    const a = 11 + i * 104_729;
    const b = a + 777;
    const rec = record(a, tracker(0.05, 0.01, a)).samples;
    own.push(wellShare(a, rec));
    foreign.push(wellShare(b, rec));
  }
  assert.ok(mean(own) > 0.95, `своя запись ${mean(own).toFixed(2)}`);
  assert.ok(mean(foreign) < 0.5, `чужая запись ${mean(foreign).toFixed(2)}`);

  // 3. мусор в отсчётах не ломает и не даёт больше 100 %
  const junk = [Number.NaN, Number.POSITIVE_INFINITY, -5, 1e9, '7' as unknown as number, null as unknown as number, 500, 1];
  for (const seed of SEEDS.slice(0, 10)) {
    const v = wellShare(seed, junk.concat(Array.from({ length: 4000 }, (_, i) => (i % 2 ? 1 : 500 + (i % 7) * 40))));
    assert.ok(Number.isFinite(v) && v >= 0 && v <= 1, `мусор дал ${v}`);
  }
  assert.ok(WELL_MAX_SAMPLES >= 2 * WELL_MAX_TICKS);

  // 4. сервер не засчитывает больше игрового времени, чем прошло с fillStart (+2 с запаса)
  const seed = 4242;
  const rec = record(seed, tracker(0.05, 0.01, seed)).samples;
  const full = wellShare(seed, rec);
  const quick = wellShare(seed, rec, 500);
  assert.ok(full > 0.95);
  assert.ok(quick < full, `за полсекунды набрать как за налив нельзя: ${quick.toFixed(2)}`);
  assert.equal(quick, wellShare(seed, rec.slice(0, 2 * Math.floor((500 + 2000) * WELL_HZ / 1000))));
  assert.equal(wellShare(seed, rec, 60_000), full, 'реальное время больше игрового — без изменений');
});

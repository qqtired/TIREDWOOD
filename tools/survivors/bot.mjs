// Простой бот «Подземелья»: бегает по кругу и от толпы, жмёт рывок и Q, берёт первую карточку.
// Печатает, до какой волны доживает за N сидов, и время шага. Заодно пишет журнал событий (как клиент).
// Запуск: node tools/survivors/bot.mjs [сидов=5] [макс. минут игры=20]
import { performance } from 'node:perf_hooks';
import { applyEvent, createRun, dgHash, dgResult, step, wrapD } from '../../shared/dungeon/sim.ts';

const N = Number(process.argv[2] || 5);
const MAX_MIN = Number(process.argv[3] || 20);

/** Решение бота на шаг: возвращает события (с t = sim.t) */
export function botEvents(sim, mem) {
  const ev = [];
  const t = sim.t;
  if (sim.chest) return [{ t, k: 'pick', i: 0 }];
  if (sim.choice) return [{ t, k: 'pick', i: 0 }];
  const h = sim.hero;
  if (sim.wave.stage === 'breather' && t - sim.wave.t0 > 30) ev.push({ t, k: 'go' });
  // от толпы: сумма отталкиваний от близких врагов + кружение
  let ax = 0;
  let az = 0;
  let near = 0;
  let close = 0;
  for (const m of sim.mobs) {
    if (m.die || m.under) continue;
    const dx = wrapD(h.x - m.x);
    const dz = wrapD(h.z - m.z);
    const d2 = dx * dx + dz * dz;
    if (d2 > 100) continue;
    const d = Math.sqrt(d2) || 0.1;
    const w = (m.elite ? 4 : 1) / (d * d);
    ax += (dx / d) * w;
    az += (dz / d) * w;
    if (d < 4.5) near++;
    if (d < 1.6) close++;
  }
  // метки на полу — уйти
  for (const mk of sim.marks) {
    if (mk.own) continue;
    const dx = wrapD(h.x - mk.x);
    const dz = wrapD(h.z - mk.z);
    const d = Math.sqrt(dx * dx + dz * dz) || 0.1;
    if (d < mk.r + 2) {
      ax += (dx / d) * 2;
      az += (dz / d) * 2;
    }
  }
  // кружение по большому кругу, чтобы не стоять на месте
  const a = t / 300;
  const cx = Math.cos(a) * 0.15;
  const cz = Math.sin(a) * 0.15;
  ax += cx;
  az += cz;
  const l = Math.sqrt(ax * ax + az * az) || 1;
  const mx = Math.round((ax / l) * 100);
  const mz = Math.round((az / l) * 100);
  if (mx !== mem.mx || mz !== mem.mz) {
    ev.push({ t, k: 'mv', x: mx, y: mz });
    mem.mx = mx;
    mem.mz = mz;
  }
  if (close >= 2 && h.dashCd === 0) ev.push({ t, k: 'dash' });
  if (!mem.q && h.qCd === 0 && near >= 6) {
    ev.push({ t, k: 'q', on: 1 });
    mem.q = t;
  } else if (mem.q && t - mem.q >= 31) {
    ev.push({ t, k: 'q', on: 0 });
    mem.q = 0;
  }
  return ev;
}

export function runBot(seed, maxSteps) {
  const sim = createRun(seed);
  sim.noFx = true;
  const mem = { mx: 0, mz: 0, q: 0 };
  const log = [];
  let worst = 0;
  let total = 0;
  let steps = 0;
  let guard = 0;
  while (sim.end === 'running' && sim.t < maxSteps && guard < maxSteps * 3) {
    guard++;
    for (const e of botEvents(sim, mem)) {
      log.push(e);
      applyEvent(sim, e);
    }
    const t0 = performance.now();
    step(sim);
    const dt = performance.now() - t0;
    total += dt;
    steps++;
    if (dt > worst) worst = dt;
  }
  return { sim, log, avg: total / steps, worst, res: dgResult(sim), hash: dgHash(sim) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = [];
  for (let s = 1; s <= N; s++) {
    const r = runBot(s * 7919, MAX_MIN * 60 * 30);
    const alive = r.sim.mobs.filter((m) => !m.die).length;
    rows.push(r.res.waves);
    console.log(
      `сид ${s * 7919}: волн ${r.res.waves}, ур. ${r.res.level}, убито ${r.res.kills}, ${r.res.end} (${r.res.killedBy || '—'}), ` +
        `игра ${(r.sim.t / 30 / 60).toFixed(1)} мин, шаг ср. ${r.avg.toFixed(3)} мс, худший ${r.worst.toFixed(1)} мс, живых в конце ${alive}, ` +
        `оружия ${r.sim.weapons.map((w) => w.id + w.lv + (w.evo ? '*' : '')).join(' ')}`,
    );
  }
  rows.sort((a, b) => a - b);
  console.log('волны:', rows.join(' '), 'медиана', rows[Math.floor(rows.length / 2)]);
}

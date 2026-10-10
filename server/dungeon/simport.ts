// Одна точка, через которую сервер берёт симуляцию «Подземелья» (часть A, shared/dungeon/sim.ts). Пока её нет в этой
// ветке — тонкая заглушка с тем же API: волна раз в 30 с, передышка 5 с, каждая 10-я — босс, смерти нет. После вехи «М1»
// здесь остаётся только реэкспорт настоящей симуляции (DG_SIM = { createRun, applyEvent, step, dgResult, dgHash }).
import { DG_HZ, type DgEvent, type DgResult, type DgStage } from '../../shared/dungeon/api.ts';

/** Что сервер читает у забега сам: номер шага и стадию (волны и итог — через dgResult) */
export interface DgSimLike {
  tick: number;
  stage: DgStage;
}

/** API симуляции, как его видит сервер (в тестах подменяется быстрой управляемой копией) */
export interface DgSimApi<S extends DgSimLike = DgSimLike> {
  createRun(seed: number): S;
  applyEvent(sim: S, ev: DgEvent): void;
  step(sim: S): void;
  dgResult(sim: S): DgResult;
  dgHash(sim: S): number;
}

// ------------------------------------------------------------ заглушка до вехи «М1»

interface StubSim extends DgSimLike {
  until: number;
  wave: number;
  cleared: number;
  ms: number;
  kills: number;
  bosses: number;
  hash: number;
}

const mix = (h: number, x: number): number => Math.imul((h ^ x) >>> 0, 0x9e3779b1) >>> 0;
const EV_CODE: Record<DgEvent['k'], number> = { mv: 1, dash: 2, q: 3, use: 4, pick: 5, reroll: 6, ban: 7, go: 8 };

const stub: DgSimApi<StubSim> = {
  createRun: (seed) => ({ tick: 0, stage: 'intro', until: 3 * DG_HZ, wave: 0, cleared: 0, ms: 0, kills: 0, bosses: 0, hash: seed >>> 0 }),
  applyEvent(sim, ev) {
    sim.hash = mix(sim.hash, EV_CODE[ev.k] * 1000 + sim.tick);
    if (ev.k === 'go' && sim.stage === 'breather') sim.until = sim.tick;
  },
  step(sim) {
    sim.tick++;
    sim.hash = mix(sim.hash, sim.tick);
    if (sim.stage === 'over') return;
    if ((sim.stage === 'wave' || sim.stage === 'boss') && sim.tick % 15 === 0) sim.kills++;
    if (sim.tick < sim.until) return;
    if (sim.stage === 'wave' || sim.stage === 'boss') {
      sim.cleared = sim.wave;
      sim.ms = Math.round((sim.tick * 1000) / DG_HZ);
      if (sim.stage === 'boss') sim.bosses++;
      sim.stage = 'breather';
      sim.until = sim.tick + 5 * DG_HZ;
      return;
    }
    sim.wave++;
    sim.stage = sim.wave % 10 === 0 ? 'boss' : 'wave';
    sim.until = sim.tick + 30 * DG_HZ;
  },
  dgResult: (sim) => ({ waves: sim.cleared, ms: sim.ms, kills: sim.kills, level: 1 + sim.cleared, bosses: sim.bosses, killedBy: '', dmg: {}, end: sim.stage === 'over' ? 'death' : 'running' }),
  dgHash: (sim) => sim.hash,
};

/** Симуляция для сервера: сейчас — заглушка, после вехи «М1» — настоящая */
export const DG_SIM: DgSimApi = stub;

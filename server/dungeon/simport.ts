// Одна точка, через которую сервер берёт симуляцию «Подземелья» (часть A, shared/dungeon/sim.ts). Сервер повторяет забег
// по журналу: события с t ≤ sim.t — applyEvent, затем step. Пока открыт выбор карточек или сундук (sim.choice / sim.chest),
// мир стоит и t не растёт — сервер ждёт pick из следующего куска журнала. Эффекты (fx) серверу не нужны: noFx.
// Итог симуляции бывает только running / death; leave и timeout ставит комната (server/dungeon/room.ts).
import type { DgEvent, DgResult, DgStage } from '../../shared/dungeon/api.ts';
import { applyEvent, createRun, dgHash, dgResult, step, type DgSim } from '../../shared/dungeon/sim.ts';

/**
 * API симуляции, как его видит сервер (в тестах подменяется быстрой управляемой копией). Сверх договора A — три чтения
 * состояния: номер шага (sim.t), стадия (sim.wave.stage) и «забег кончился» (sim.end !== 'running'). Волны, боссы и итог —
 * через dgResult.
 */
export interface DgSimApi<S extends object = object> {
  createRun(seed: number): S;
  applyEvent(sim: S, ev: DgEvent): void;
  step(sim: S): void;
  dgResult(sim: S): DgResult;
  dgHash(sim: S): number;
  tick(sim: S): number;
  stage(sim: S): DgStage;
  over(sim: S): boolean;
}

/** Настоящая симуляция для сервера */
export const DG_SIM: DgSimApi<DgSim> = {
  createRun: (seed) => Object.assign(createRun(seed), { noFx: true }),
  applyEvent,
  step,
  dgResult,
  dgHash,
  tick: (s) => s.t,
  stage: (s) => s.wave.stage,
  over: (s) => s.end !== 'running',
};

// Аквапарк «Волна» на сервере: у кого идёт забег и с какого шага (полоса и зоны — shared/aqua.ts). Шаг — номер входа
// самого игрока: время забега — сколько его шагов прошло от старта до финиша, как на его секундомере, без дрожания
// сети. Сошёл с мостика на запад — пошло время; встал на финишную площадку — стоп; вернулся на мостик или на площадь,
// упал в воду, поставил игру на паузу — забег снят. Время препятствий (метки входов) и шаги должны идти вместе:
// разошлись (игра подвисала, метку тянули или придерживали) — тоже снят. Зовётся после каждого настоящего входа
// (додуманные сервером шаги не в счёт). Профили, доску рекордов и сообщения ведёт комната: этот класс только решает,
// что случилось.
import { AQUA_JETTY, AQUA_MAX_TICKS, AQUA_PAUSE, AQUA_SKEW, AQUA_SKEW_K, onFinish, onJetty } from '../../shared/aqua.ts';

/** Что случилось после шага: забег начался, снят (вернулся, слишком долго, пауза) или финиш (время в шагах) */
export type AquaStep = { k: 'start' } | { k: 'stop'; pause: boolean } | { k: 'finish'; steps: number } | null;

interface Run {
  /** Стоит на мостике: сойдёт на запад — пойдёт время */
  armed: boolean;
  /** Забег идёт: с какого входа (номер) и метка времени на старте */
  on: boolean;
  at: number;
  t0: number;
  /** Метка времени прошлого входа (пауза — когда она прыгнула вперёд, а шагов не было) */
  t: number;
}

export class AquaRuns {
  private readonly runs = new Map<number, Run>();

  /** Номер входа, с которого идёт забег игрока (−1 — не бежит). */
  startOf(slot: number): number {
    const r = this.runs.get(slot);
    return r?.on ? r.at : -1;
  }

  /** Шаг игрока: вход seq с меткой времени t, где он после шага и стоит ли на полу. */
  step(slot: number, x: number, y: number, z: number, grounded: boolean, seq: number, t: number): AquaStep {
    let r = this.runs.get(slot);
    const jetty = onJetty(x, y, z);
    if (!r) {
      if (!jetty) return null;
      r = { armed: false, on: false, at: 0, t0: t, t };
      this.runs.set(slot, r);
    }
    const dt = t - r.t;
    r.t = t;
    if (r.on) {
      if (jetty) {
        r.on = false;
        r.armed = true;
        return { k: 'stop', pause: false };
      }
      const n = seq - r.at;
      if (dt > AQUA_PAUSE || Math.abs(t - r.t0 - n) > AQUA_SKEW + AQUA_SKEW_K * n) {
        this.runs.delete(slot);
        return { k: 'stop', pause: true };
      }
      if (grounded && onFinish(x, y, z)) {
        this.runs.delete(slot);
        return { k: 'finish', steps: seq - r.at };
      }
      // допрыгнул обратно до площади мимо мостика или бежит слишком долго
      if (x > AQUA_JETTY.x1 || n > AQUA_MAX_TICKS) {
        this.runs.delete(slot);
        return { k: 'stop', pause: false };
      }
      return null;
    }
    if (jetty) {
      r.armed = true;
      return null;
    }
    // ушёл с мостика: на запад, к полосе — старт; обратно на площадь — ничего
    const go = r.armed && x < AQUA_JETTY.x0;
    this.runs.delete(slot);
    if (!go) return null;
    this.runs.set(slot, { armed: false, on: true, at: seq, t0: t, t });
    return { k: 'start' };
  }

  /** Упал в воду или вышел: забег снят. true — он шёл. */
  drop(slot: number): boolean {
    const r = this.runs.get(slot);
    this.runs.delete(slot);
    return !!r && r.on;
  }
}

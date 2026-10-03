// Предсказание своего бойца «Fight Club»: тот же stepFighter, что на сервере, считается сразу по своему вводу
// (ходьба, замах, блок, уклон — без ожидания сервера). Снимок приносит точное состояние после входа ack: сверяем,
// при расхождении встаём как сервер и переигрываем неподтверждённые входы — каждый с тем «можно» (gate), с каким
// он был предсказан; разницу на экране плавно растворяем. Попадания и урон решает только сервер.
import { copyFighter, fightersEqual, makeFightEvents, makeFighter, stepFighter, type FightEvents, type Fighter } from '../../shared/fightsim.ts';
import type { Input } from '../../shared/sim.ts';
import type { CollisionWorld } from '../../shared/world.ts';

const RING = 256;

interface Entry {
  seq: number;
  input: Input;
  gate: number;
  after: Fighter;
}

export class FightPredictor {
  /** Боец сейчас (после последнего предсказанного входа) и тиком раньше — для плавности между тиками */
  readonly f: Fighter = makeFighter();
  readonly prev: Fighter = makeFighter();
  /** Визуальная поправка после расхождения (затухает) */
  readonly offset = { x: 0, y: 0, z: 0 };
  readonly ev: FightEvents = makeFightEvents();
  private readonly replayEv: FightEvents = makeFightEvents();
  private readonly ring: Entry[] = [];
  private readonly world: CollisionWorld;
  private newest = -1;
  /** Радиус ринга (край толпы) — один на весь бой */
  ringR = 5;
  corrections = 0;

  constructor(world: CollisionWorld) {
    this.world = world;
    for (let i = 0; i < RING; i++) {
      this.ring.push({ seq: -1, input: { seq: 0, buttons: 0, yaw: 0, pitch: 0, viewTick: 0 }, gate: 0, after: makeFighter() });
    }
  }

  /** Встать в состояние сервера жёстко (начало раунда, вернулся в ринг). */
  reset(server: Fighter, ack: number): void {
    copyFighter(this.f, server);
    this.offset.x = this.offset.y = this.offset.z = 0;
    for (const e of this.ring) if (e.seq <= ack) e.seq = -1;
    this.replayFrom(ack);
    copyFighter(this.prev, this.f);
  }

  /** Тик предсказания: шаг своего бойца по входу inp; события — для звука и анимации. */
  step(inp: Input, gate: number): FightEvents {
    copyFighter(this.prev, this.f);
    stepFighter(this.f, inp, this.world, this.ringR, gate, this.ev);
    this.store(inp, gate);
    return this.ev;
  }

  /** Записать вход без шага (в толпе, без своего бойца) — чтобы номера не рвались. */
  record(inp: Input, gate: number): void {
    this.store(inp, gate);
  }

  private store(inp: Input, gate: number): void {
    const e = this.ring[inp.seq % RING];
    e.seq = inp.seq;
    e.input.seq = inp.seq;
    e.input.buttons = inp.buttons;
    e.input.yaw = inp.yaw;
    e.input.pitch = inp.pitch;
    e.input.viewTick = inp.viewTick;
    e.gate = gate;
    copyFighter(e.after, this.f);
    this.newest = inp.seq;
  }

  /** Сверка: server — боец после входа ack. true — пришлось поправляться. */
  reconcile(ack: number, server: Fighter): boolean {
    const e = this.ring[ack % RING];
    if (ack < 0 || e.seq !== ack) {
      if (ack > this.newest) return false;
      // такого входа уже нет в истории — встаём как сервер
      this.corrections++;
      this.jumpTo(server, ack);
      return true;
    }
    if (fightersEqual(e.after, server)) return false;
    this.corrections++;
    copyFighter(e.after, server);
    this.jumpTo(server, ack);
    return true;
  }

  /** Встать как сервер после входа ack и переиграть остальное; маленький скачок — растворяется на экране. */
  private jumpTo(server: Fighter, ack: number): void {
    const bx = this.f.s.x;
    const by = this.f.s.y;
    const bz = this.f.s.z;
    copyFighter(this.f, server);
    this.replayFrom(ack);
    const sx = this.f.s.x - bx;
    const sy = this.f.s.y - by;
    const sz = this.f.s.z - bz;
    if (sx * sx + sy * sy + sz * sz > 4) {
      this.offset.x = this.offset.y = this.offset.z = 0;
      copyFighter(this.prev, this.f);
    } else {
      this.prev.s.x += sx;
      this.prev.s.y += sy;
      this.prev.s.z += sz;
      this.offset.x -= sx;
      this.offset.y -= sy;
      this.offset.z -= sz;
    }
  }

  private replayFrom(ack: number): void {
    for (let seq = ack + 1; seq <= this.newest; seq++) {
      const e = this.ring[seq % RING];
      if (e.seq !== seq) continue;
      stepFighter(this.f, e.input, this.world, this.ringR, e.gate, this.replayEv);
      copyFighter(e.after, this.f);
    }
  }

  decay(dt: number): void {
    const k = Math.exp(-dt * 14);
    this.offset.x *= k;
    this.offset.y *= k;
    this.offset.z *= k;
  }
}

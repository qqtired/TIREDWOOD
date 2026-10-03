// Общее для тестов пряток: детерминированная игра на N человек и прицел в точку.
import { HideGame, type HidePlayer } from '../server/hide/game.ts';
import { HIDE_COUNT_TICKS, HIDE_PREP_TICKS, type HideEvent, type HideResult, type HideServerMsg } from '../shared/hide.ts';
import { EYE_HEIGHT } from '../shared/constants.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';

export const lcg = (seed: number) => { let s = seed >>> 0 || 1; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; };

export function hideSetup(n = 2, seed = 7) {
  const rng = lcg(seed), sent = new Map<number, HideServerMsg[]>(), results: (HideResult & { pid: number })[] = [];
  const game = new HideGame({ finished: (pid, r) => results.push({ pid, ...r }), rand: k => Math.floor(rng() * k) });
  const ps: HidePlayer[] = [];
  for (let pid = 1; pid <= n; pid++) {
    const box: HideServerMsg[] = []; sent.set(pid, box);
    ps.push(game.addHuman({ pid, nick: `Tester${pid}`, level: 1, outfit: DEFAULT_OUTFIT }, { sendJson: m => box.push(m) })!);
  }
  const events = (pid: number): HideEvent[] => sent.get(pid)!.flatMap(m => m.t === 'hide_ev' ? m.e : []);
  return { game, ps, sent, results, events, rng };
}

export const steps = (game: HideGame, n: number) => { for (let i = 0; i < n; i++) game.step(); };
export function toSeek(game: HideGame): void { steps(game, HIDE_COUNT_TICKS + HIDE_PREP_TICKS); }

/** Поставить игрока, как будто он честно играл (для проверок наград). */
export function active(p: HidePlayer): void { p.moved = 10; p.chose = true; }

/** yaw/pitch из глаз ищущего в точку */
export function aimAt(h: HidePlayer, x: number, y: number, z: number): [number, number] {
  const dx = x - h.state.x, dy = y - (h.state.y + EYE_HEIGHT), dz = z - h.state.z;
  return [Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz))];
}

/** Выстрел; по умолчанию без отката (клиент видел тот же тик, в который сервер стреляет). */
export function shoot(game: HideGame, h: HidePlayer, aim: [number, number], view = game.tick + 1): void {
  game.action(h, { t: 'hide', a: 'shoot', aim, view, seq: h.input.ack });
  game.step();
}

/** Что знает клиент о предметах после всех снимков (дельты применяются по порядку). */
export function mirror(msgs: readonly HideServerMsg[]): Map<number, number[]> {
  const bodies = new Map<number, number[]>();
  for (const m of msgs) {
    if (m.t !== 'hide_state') continue;
    if (m.full) bodies.clear();
    for (let i = 0; i < m.p.length; i += 7) bodies.set(m.p[i], m.p.slice(i, i + 7));
    for (const id of m.gone) bodies.delete(id);
  }
  return bodies;
}

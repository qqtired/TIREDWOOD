// Рыбак на сервере для тестов вываживания (test/fishreel-*.test.ts): хаб с рыбалкой 2.0, место 0, поклёвка — what;
// catchWith — забросить, подсечь и сыграть нажатия, как честный клиент (сообщение раз в 15 тиков); sloppy — «обычный»
// игрок, который вытаскивает рыбу с заданным числом ошибок.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after } from 'node:test';
import { TICK_RATE } from '../shared/constants.ts';
import { FE_BITE, FP_HOLD, FP_REEL } from '../shared/fishing.ts';
import type { ReelStyle } from '../shared/fishreel.ts';
import { reelStyleFor, type Hooked } from '../shared/fishrules.ts';
import type { LobbyEvent } from '../shared/messages.ts';
import { Hub } from '../server/hub.ts';
import type { FishingHall2 } from '../server/lobby/fishing2.ts';
import { Profiles } from '../server/profiles.ts';
import { Store } from '../server/store.ts';
import { TYPICAL, playReel, type Play, type Skill } from './fishbot.ts';
import { SMOKE, lastOf, login, placeAt, type FakeSink } from './kit.ts';

const dirs: string[] = [];
after(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

export function fisher(what: Hooked) {
  const dir = mkdtempSync(path.join(tmpdir(), 'opus-reel-'));
  dirs.push(dir);
  const clock = { now: Date.UTC(2026, 9, 4, 12) };
  const store = new Store(dir, { log: () => {}, saveDelayMs: 60_000, now: () => clock.now });
  store.load();
  const profiles = new Profiles(store, { now: () => clock.now });
  const hub = new Hub({ store, profiles, smokeToken: SMOKE, build: 'test', now: () => clock.now, log: () => {}, fish2: true, weather: 'clear' });
  const a = login(hub, 'Tester7');
  const it = hub.lobby.map.interact.find((i) => i.kind === 'fish' && i.arg === 0)!;
  placeAt(hub, a.c, it.x, it.z);
  hub.onJson(a.c, { t: 'use', id: it.id });
  const hall = hub.lobby.fishing2 as FishingHall2;
  hall.rand = () => 0.5;
  hall.roll = () => ({ ...what });
  const advance = (n: number): void => {
    for (let i = 0; i < n; i++) {
      clock.now += 1000 / TICK_RATE;
      hub.step();
    }
  };
  return { hub, clock, a, hall, advance };
}

function bites(s: FakeSink): boolean {
  return s.msgs.some((m) => m.t === 'lev' && (m.e as LobbyEvent[]).some((e) => e[0] === 'fish' && e[1] === FE_BITE));
}

/** Забросить, подсечь, сыграть нажатия от pick, как честный клиент — что прислал сервер (fishLand) и с какими бонусами */
export function catchWith(e: ReturnType<typeof fisher>, pick: (style: ReelStyle, seed: number, drunk: boolean) => Play) {
  e.clock.now += 1000;
  e.a.s.msgs.length = 0;
  // рыба в руках ждёт выбора, заброс с ней не принимается (хотфикс 10.10): сперва «В рюкзак»
  if (e.hall.phase(0) === FP_HOLD) e.hub.onJson(e.a.c, { t: 'fish', a: 'keep' });
  e.hub.onJson(e.a.c, { t: 'fish', a: 'cast' });
  for (let i = 0; i < 30 * TICK_RATE && !bites(e.a.s); i++) e.advance(1);
  e.hub.onJson(e.a.c, { t: 'fish', a: 'hook', n: 2 });
  const m = lastOf(e.a.s, 'fishReel');
  assert.ok(m && e.hall.phase(0) === FP_REEL, 'шкала: сид от сервера');
  const style = reelStyleFor(m.sp, m.mods);
  const play = pick(style, m.seed, m.mods.drink === 4);
  let sent = 0;
  for (let u = 0; u < play.ticks;) {
    const next = Math.min(play.ticks, u + 15);
    e.advance(next - u);
    const i = sent;
    const k: number[] = [];
    while (sent < play.toggles.length && play.toggles[sent] < next) k.push(play.toggles[sent++]);
    e.hub.onJson(e.a.c, { t: 'reel', i, k, u: next, ...(next === play.ticks ? { d: 1 } : {}) });
    u = next;
  }
  return { play, land: lastOf(e.a.s, 'fishLand'), mods: m.mods, style, seed: m.seed };
}

/** Игрок (по умолчанию «обычный») со своей случайностью: первый расклад, где он вытащил рыбу с ошибками от min до max */
export function sloppy(min: number, max: number, skill: Skill = TYPICAL) {
  return (style: ReelStyle, seed: number, drunk: boolean): Play => {
    for (let r = 1; r < 400; r++) {
      const p = playReel(style, seed, skill, r * 7919, drunk);
      if (p.caught && p.err >= min && p.err <= max) return p;
    }
    throw new Error('не нашлось расклада');
  };
}

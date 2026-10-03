// Общие помощники тестов хаба и набережной: поддельные соединения, вход, ввод.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after } from 'node:test';
import { PROTOCOL_VERSION } from '../shared/constants.ts';
import type { ServerMsg } from '../shared/messages.ts';
import { encodeInputs } from '../shared/protocol.ts';
import { makeInput } from '../shared/sim.ts';
import { Hub, type Client, type Sink } from '../server/hub.ts';
import { Profiles } from '../server/profiles.ts';
import { Store } from '../server/store.ts';

const dirs: string[] = [];
after(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

export interface FakeSink extends Sink {
  msgs: ServerMsg[];
  bins: Uint8Array[];
  closed: { code: number; reason: string } | null;
}

export function fakeSink(): FakeSink {
  const s: FakeSink = {
    msgs: [],
    bins: [],
    closed: null,
    sendBinary(d) {
      s.bins.push(d);
    },
    sendJson(m) {
      s.msgs.push(m);
    },
    close(code, reason) {
      s.closed = { code, reason };
    },
  };
  return s;
}

export const SMOKE = 'f'.repeat(64);

export function setupHub(opts: { roll?: () => number; durakDeck?: () => number[]; blackjackDeck?: () => number[]; skill?: boolean; fort?: boolean; fight?: boolean; fish2?: boolean; boatrace?: boolean; hide?: boolean; storm?: boolean; pirates?: boolean; devStorm?: boolean; devPirates?: boolean; log?: (s: string) => void } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'opus-hub-'));
  dirs.push(dir);
  const clock = { now: Date.UTC(2026, 9, 1, 12) };
  const store = new Store(dir, { log: () => {}, saveDelayMs: 60_000, now: () => clock.now });
  store.load();
  const profiles = new Profiles(store, { now: () => clock.now });
  const hub = new Hub({
    store, profiles, smokeToken: SMOKE, build: 'test', roll: opts.roll, durakDeck: opts.durakDeck, blackjackDeck: opts.blackjackDeck, skill: opts.skill ?? true, fort: opts.fort, now: () => clock.now, log: opts.log ?? (() => {}),
    fish2: opts.fish2, storm: opts.storm, pirates: opts.pirates, devStorm: opts.devStorm, devPirates: opts.devPirates,
    boatrace: opts.boatrace, hide: opts.hide, fight: opts.fight,
  });
  return { hub, store, profiles, clock };
}

let keyN = 0;
export function newKey(): string {
  return `hubkey-${String(++keyN).padStart(10, '0')}-abcdef`;
}

export function connect(hub: Hub, ip = '10.0.0.1'): { c: Client; s: FakeSink } {
  const s = fakeSink();
  return { c: hub.connect(s, ip), s };
}

/** Новый игрок: соединение + hello с ником. С одного адреса — не больше 5 новых профилей в час. */
export function login(hub: Hub, nick: string, key = newKey(), ip = '10.0.0.1'): { c: Client; s: FakeSink; key: string } {
  const { c, s } = connect(hub, ip);
  hub.onJson(c, { t: 'hello', v: PROTOCOL_VERSION, key, nick });
  assert.ok(c.profile, `вход ${nick} не удался: ${JSON.stringify(s.msgs)}`);
  return { c, s, key };
}

export function types(s: FakeSink): string[] {
  return s.msgs.map((m) => m.t);
}

export function lastOf<T extends ServerMsg['t']>(s: FakeSink, t: T): Extract<ServerMsg, { t: T }> | undefined {
  for (let i = s.msgs.length - 1; i >= 0; i--) if (s.msgs[i].t === t) return s.msgs[i] as Extract<ServerMsg, { t: T }>;
  return undefined;
}

export function allOf<T extends ServerMsg['t']>(s: FakeSink, t: T): Array<Extract<ServerMsg, { t: T }>> {
  return s.msgs.filter((m) => m.t === t) as Array<Extract<ServerMsg, { t: T }>>;
}

const seqs = new WeakMap<Client, number>();

/** Отправить один вход от игрока (с его текущим или указанным epoch). Возвращает номер входа. */
export function sendInput(hub: Hub, c: Client, buttons: number, yaw = 0, epoch = c.epoch): number {
  const seq = (seqs.get(c) ?? 0) + 1;
  seqs.set(c, seq);
  const inp = makeInput();
  inp.seq = seq;
  inp.buttons = buttons;
  inp.yaw = yaw;
  hub.onBinary(c, encodeInputs([inp], 0, 1, epoch));
  return seq;
}

/** n тиков: каждый тик игроки шлют по входу с этими кнопками, потом шаг хаба. */
export function hold(hub: Hub, who: Client[], buttons: number, ticks: number, yaw = 0): void {
  for (let i = 0; i < ticks; i++) {
    for (const c of who) sendInput(hub, c, buttons, yaw);
    hub.step();
  }
}

export function steps(hub: Hub, n: number): void {
  for (let i = 0; i < n; i++) hub.step();
}

/** Поставить игрока набережной в точку (как будто дошёл сам). */
export function placeAt(hub: Hub, c: Client, x: number, z: number, y = 0): void {
  const p = hub.lobby.playerOf(c);
  assert.ok(p, 'игрок на набережной');
  const st = p.state;
  st.x = x;
  st.y = y;
  st.z = z;
  st.vx = 0;
  st.vy = 0;
  st.vz = 0;
}

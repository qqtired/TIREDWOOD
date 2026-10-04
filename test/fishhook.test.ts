// Баг «изредка нет „Подсекай!“ и шкалы вываживания»: игрок встал шагом и тут же снова сел на то же место рыбалки
// (W и E почти разом — между двумя снимками сервера). Снимок пришёл «как было» (сидит там же), а FE_OFF старой посадки —
// после него; клиент сбрасывал своё место в −1 и до следующей посадки отбрасывал свои события (BITE → нет «Подсекай!»)
// и fishReel (нет шкалы). Здесь — настоящий сервер (Hub, LobbyRoom, FishingHall2) и порядок его сообщений, клиент —
// функции своего места из client/lobby/fishspot.ts (как в scene.ts) и прежнее правило «только при смене действия».
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { PROTOCOL_VERSION, TICK_RATE } from '../shared/constants.ts';
import { FE_BITE, FE_CAST, FE_NIBBLE, FISH, FP_BITE, FP_IDLE, FP_REEL, hookTicks } from '../shared/fishing.ts';
import { ACT_FISH, ACT_NONE } from '../shared/lobby.ts';
import type { ServerMsg } from '../shared/messages.ts';
import { decodeSnapshot, encodeInputs, makeHeader } from '../shared/protocol.ts';
import { BTN_FORWARD, makeInput, makeState } from '../shared/sim.ts';
import { fishSpotOnOff, fishSpotOnSnapshot } from '../client/lobby/fishspot.ts';
import { Hub } from '../server/hub.ts';
import { BITE_GRACE } from '../server/lobby/fishing2.ts';
import { Profiles } from '../server/profiles.ts';
import { Store } from '../server/store.ts';
import { SMOKE } from './kit.ts';

const dirs: string[] = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

type Item = { bin?: Uint8Array; msg?: ServerMsg };

function env() {
  const dir = mkdtempSync(path.join(tmpdir(), 'opus-fishhook-'));
  dirs.push(dir);
  const clock = { now: Date.UTC(2026, 9, 4, 12) };
  const store = new Store(dir, { log: () => {}, saveDelayMs: 60_000, now: () => clock.now });
  store.load();
  const profiles = new Profiles(store, { now: () => clock.now });
  const hub = new Hub({ store, profiles, smokeToken: SMOKE, build: 'test', now: () => clock.now, log: () => {}, fish2: true, weather: 'clear' });
  // порядок писем важен: снимки и JSON — в одном потоке, как в сокете
  const stream: Item[] = [];
  const sink = { sendBinary(d: Uint8Array) { stream.push({ bin: d }); }, sendJson(m: ServerMsg) { stream.push({ msg: m }); }, close() {} };
  const c = hub.connect(sink as never, '10.0.0.7');
  hub.onJson(c, { t: 'hello', v: PROTOCOL_VERSION, key: 'fishhook-key-0000000001-abcdef', nick: 'Рыбак' });
  let seq = 0;
  const input = (buttons: number): void => {
    const inp = makeInput();
    inp.seq = ++seq;
    inp.buttons = buttons;
    hub.onBinary(c, encodeInputs([inp], 0, 1, c.epoch));
  };
  const step = (n = 1, buttons = 0): void => {
    for (let i = 0; i < n; i++) { clock.now += 1000 / TICK_RATE; input(buttons); hub.step(); }
  };
  return { hub, c, stream, clock, step };
}

/** Клиент набережной в части рыбалки (scene.ts): действие по снимкам, своё место, фильтр событий своего места. */
function client(fixed: boolean) {
  const cl = { myId: -1, action: ACT_NONE, arg: 0, spot: -1, bites: 0, reels: 0, dropped: 0, n: 0 };
  const h = makeHeader();
  const self = makeState();
  const ents: Parameters<typeof decodeSnapshot>[3] = [];
  const feed = (stream: Item[]): void => {
    for (const it of stream.splice(0)) {
      if (it.bin) {
        const buf = it.bin.buffer.slice(it.bin.byteOffset, it.bin.byteOffset + it.bin.byteLength) as ArrayBuffer;
        const n = decodeSnapshot(buf, h, self, ents);
        if (n < 0 || cl.myId < 0) continue;
        let action = cl.action;
        let arg = cl.arg;
        for (let i = 0; i < n; i++) if (ents[i].id === cl.myId) { action = ents[i].hp; arg = ents[i].hp === ACT_NONE ? 0 : ents[i].armor; }
        const changed = action !== cl.action || arg !== cl.arg;
        cl.action = action;
        cl.arg = arg;
        if (fixed) cl.spot = fishSpotOnSnapshot(cl.spot, action, arg);
        else if (changed && action === ACT_FISH) cl.spot = arg;
        continue;
      }
      const m = it.msg!;
      if (m.t === 'lobby') cl.myId = m.id;
      else if (m.t === 'fishReel') { if (m.spot === cl.spot) cl.reels++; else cl.dropped++; }
      else if (m.t === 'lev') {
        for (const e of m.e) {
          if (e[0] !== 'fish') continue;
          const [, kind, spot, a] = e;
          if (kind === FE_CAST) cl.n = 0;
          if (kind === FE_NIBBLE || kind === FE_BITE) cl.n = a;
          if (spot !== cl.spot) { cl.dropped++; continue; }
          if (kind === FE_BITE) cl.bites++;
          if (kind === 8 /* FE_OFF */) cl.spot = fixed ? fishSpotOnOff(cl.spot, spot, cl.action, cl.arg) : -1;
        }
      }
    }
  };
  return { cl, feed };
}

/** Сел на место 0; встал шагом на нечётном тике (после него снимка нет) и через gap тиков снова сел; заброс, поклёвка, подсечка. */
function scenario(fixed: boolean, gap: number) {
  const e = env();
  const { cl, feed } = client(fixed);
  const room = e.hub.lobby;
  const it = room.map.interact.find((i) => i.kind === 'fish' && i.arg === 0)!;
  const p = room.playerOf(e.c)!;
  p.state.x = it.x;
  p.state.z = it.z;
  p.state.y = it.y;
  e.hub.onJson(e.c, { t: 'use', id: it.id });
  e.step(6);
  feed(e.stream);
  assert.equal(cl.spot, 0, 'сел — место наше');
  const hall = room.fishing2!;
  hall.rand = () => 0.5;
  if ((room.tick + 1) % 2 === 0) e.step(1);
  e.step(1, BTN_FORWARD);
  assert.equal(p.action, ACT_NONE, 'шаг — встал (FE_OFF)');
  e.step(gap);
  e.hub.onJson(e.c, { t: 'use', id: it.id });
  e.step(2);
  feed(e.stream);
  assert.equal(p.action, ACT_FISH, 'снова сидит на месте 0');
  e.clock.now += 1000;
  e.hub.onJson(e.c, { t: 'fish', a: 'cast' });
  for (let t = 0; t < 25 * TICK_RATE && hall.phase(0) !== FP_BITE; t++) e.step(1);
  e.step(2);
  feed(e.stream);
  e.hub.onJson(e.c, { t: 'fish', a: 'hook', n: cl.n });
  const hooked = hall.phase(0) === FP_REEL;
  e.step(2);
  feed(e.stream);
  return { cl, hooked };
}

test('встал и тут же снова сел на то же место между снимками: «Подсекай!» и шкала приходят (раньше — молчали)', () => {
  const old = scenario(false, 0);
  assert.equal(old.cl.spot, -1, 'прежнее правило: место сброшено — баг воспроизводится');
  assert.equal(old.cl.bites, 0);
  assert.equal(old.cl.reels, 0);
  const now = scenario(true, 0);
  assert.equal(now.cl.spot, 0);
  assert.equal(now.cl.bites, 1, '«Подсекай!»');
  assert.ok(now.hooked, 'подсёк вовремя');
  assert.equal(now.cl.reels, 1, 'шкала вываживания');
});

test('встал, снимок между — и снова сел: место наше и по-старому, и по-новому; ушёл совсем — место сброшено', () => {
  for (const fixed of [false, true]) {
    const r = scenario(fixed, 1);
    assert.equal(r.cl.spot, 0);
    assert.equal(r.cl.bites, 1);
    assert.equal(r.cl.reels, 1);
  }
  assert.equal(fishSpotOnOff(0, 0, ACT_NONE, 0), -1, 'встал — место не наше');
  assert.equal(fishSpotOnOff(2, 0, ACT_FISH, 2), 2, 'FE_OFF чужого места — не трогает');
  assert.equal(fishSpotOnOff(0, 0, ACT_FISH, 0), 0, 'снова сидим там же');
  assert.equal(fishSpotOnSnapshot(-1, ACT_FISH, 3), 3);
  assert.equal(fishSpotOnSnapshot(3, ACT_NONE, 0), 3, 'встал — место ждёт FE_OFF (убрать шкалу и карточку)');
});

test('поклёвка, а ввод рыбака замер (вкладка подвисла, связь встала): окно подсечки ждёт до BITE_GRACE; живой ввод — окно обычное', () => {
  const scad = FISH.findIndex((f) => f.id === 'scad');
  const win = hookTicks(0, 0);
  for (const [silent, extra] of [[false, 10], [true, 10], [true, BITE_GRACE + 12]] as const) {
    const e = env();
    const room = e.hub.lobby;
    const it = room.map.interact.find((i) => i.kind === 'fish' && i.arg === 0)!;
    const p = room.playerOf(e.c)!;
    p.state.x = it.x;
    p.state.z = it.z;
    p.state.y = it.y;
    e.hub.onJson(e.c, { t: 'use', id: it.id });
    e.step(6);
    const hall = room.fishing2!;
    hall.rand = () => 0.5;
    hall.roll = () => ({ sp: scad, g: 300, coins: 0 });
    e.clock.now += 1000;
    e.hub.onJson(e.c, { t: 'fish', a: 'cast' });
    for (let t = 0; t < 25 * TICK_RATE && hall.phase(0) !== FP_BITE; t++) e.step(1);
    assert.equal(hall.phase(0), FP_BITE);
    for (let t = 0; t < win + extra; t++) {
      if (silent) { e.clock.now += 1000 / TICK_RATE; e.hub.step(); } else e.step(1);
    }
    if (!silent || extra > BITE_GRACE) {
      assert.equal(hall.phase(0), FP_IDLE, silent ? 'молчит дольше BITE_GRACE — ушла' : 'ввод шёл — не успел, ушла');
      continue;
    }
    assert.equal(hall.phase(0), FP_BITE, 'молчал — окно ещё ждёт');
    const bite = e.stream.flatMap((x) => (x.msg?.t === 'lev' ? x.msg.e : [])).filter((ev) => ev[0] === 'fish' && ev[1] === FE_BITE).at(-1)!;
    e.hub.onJson(e.c, { t: 'fish', a: 'hook', n: bite[3] as number });
    assert.equal(hall.phase(0), FP_REEL, 'ожил, увидел «Подсекай!» и подсёк');
  }
});

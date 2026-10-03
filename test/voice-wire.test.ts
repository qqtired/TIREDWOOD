import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseClientJson, sendServerJson } from '../server/voice-wire.ts';

test('larger SDP envelope is accepted only for enabled voice; ordinary JSON keeps its old budget', () => {
  const voice = JSON.stringify({ t: 'voiceSignal', self: 1, to: 2, signal: { kind: 'offer', sdp: 'a'.repeat(7000) } });
  assert.equal(parseClientJson(voice, false), null);
  assert.equal((parseClientJson(voice, true) as { t: string }).t, 'voiceSignal');
  assert.equal(parseClientJson(JSON.stringify({ t: 'chat', text: 'a'.repeat(7000) }), true), null);
  assert.deepEqual(parseClientJson('{"t":"ping","c":12}', false), { t: 'ping', c: 12 });
});
test('malformed and oversized UTF-8 signaling cannot expand the websocket limit', () => {
  assert.equal(parseClientJson('{', true), null);
  assert.equal(parseClientJson(JSON.stringify({ t: 'voiceSignal', signal: '🐟'.repeat(5000) }), true), null);
  assert.equal(parseClientJson(JSON.stringify({ t: 'voiceSignal', signal: 'a'.repeat(17000) }), true), null);
});
function socket(bufferedAmount = 0) {
  const sent: string[] = [], closed: Array<[number, string]> = [];
  return { OPEN: 1, readyState: 1, bufferedAmount, sent, closed, send: (text: string) => sent.push(text), close: (code: number, reason: string) => closed.push([code, reason]) };
}
test('critical voice controls close a congested connection so it can recover explicitly', () => {
  for (const t of ['voiceConfig', 'voiceState', 'voiceSignal', 'voiceError']) {
    const ws = socket(1024 * 1024); let failures = 0;
    sendServerJson(ws, { t }, true, () => failures++);
    assert.equal(ws.sent.length, 0); assert.deepEqual(ws.closed, [[1013, 'backpressure']]); assert.equal(failures, 1);
  }
});
test('JSON control pressure is explicit even with VOICE off; ordinary sends still work', () => {
  const ws = socket(); sendServerJson(ws, { t: 'voiceState', self: 3 }, true);
  assert.deepEqual(JSON.parse(ws.sent[0]), { t: 'voiceState', self: 3 });
  const busy = socket(1024 * 1024); sendServerJson(busy, { t: 'scene' }, true); sendServerJson(busy, { t: 'voiceState' }, false);
  assert.equal(busy.sent.length, 0); assert.equal(busy.closed.length, 2);
  const closed = socket(); closed.readyState = 3; sendServerJson(closed, { t: 'voiceState' }, true); assert.equal(closed.sent.length, 0); assert.equal(closed.closed.length, 0);
});


test('all room, private hand, reward and state JSON close at1MiB regardless of voice flag', () => {
  for (const voice of [false,true]) for (const t of ['scene','lobby','welcome','durakHand','blackjack','tokens','me','pbReward','fcReward','brReward','voiceState']) {
    const ws=socket(1024*1024);let pressure=0;sendServerJson(ws,{t},voice,()=>pressure++);
    assert.equal(ws.sent.length,0,t);assert.deepEqual(ws.closed,[[1013,'backpressure']],t);assert.equal(pressure,1,t);
  }
  const below=socket(1024*1024-1);sendServerJson(below,{t:'scene',scene:'lobby'},false);assert.equal(below.sent.length,1);assert.equal(below.closed.length,0);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VoiceRouter, type VoiceClient } from '../server/voice.ts';
import type { VoiceServerMsg } from '../shared/voice.ts';

function setup(worldKinds?: readonly string[]) {
  const router = new VoiceRouter({ worldKinds, now: () => 1000,
    ice: () => ({ iceServers: [], expiresAt: null, relayOnly: false }) });
  let nextId = 1;
  function client(room: { kind: string }) {
    const id = nextId++, messages: VoiceServerMsg[] = [];
    const c: VoiceClient & { messages: VoiceServerMsg[] } = {
      id, pid: id, nick: `P${id}`, profile: { id }, room, spot: null, closed: false, ephemeral: false,
      sink: { sendJson: m => messages.push(m) }, messages,
    };
    router.connected(c);
    router.handle(c, { t: 'voice', a: 'join' });
    return c;
  }
  return { router, client };
}

const state = (c: { messages: VoiceServerMsg[] }) =>
  c.messages.filter((m): m is Extract<VoiceServerMsg, { t: 'voiceState' }> => m.t === 'voiceState').at(-1)!;

test('dungeon override shares world peers and preserves the voice ID on both transitions', () => {
  const { router, client } = setup(['dungeon']);
  const lobby = { kind: 'lobby' }, dungeon = { kind: 'dungeon' };
  const a = client(lobby), b = client(dungeon);
  assert.equal(state(a).zone, 'world');
  assert.equal(state(b).zone, 'world');
  assert.deepEqual(state(a).peers.map(p => p.pid), [b.pid]);
  assert.deepEqual(state(b).peers.map(p => p.pid), [a.pid]);
  const self = state(a).self!;
  router.handle(a, { t: 'voice', a: 'talk', self, on: true });
  for (const room of [{ kind: 'dungeon' }, lobby]) {
    a.room = room;
    router.moved(a);
    assert.equal(state(a).self, self);
    assert.equal(state(a).zone, 'world');
    assert.deepEqual(state(b).peers.map(p => [p.pid, p.talking]), [[a.pid, true]]);
    router.handle(a, { t: 'voiceSignal', self, to: state(b).self, signal: { kind: 'restart' } });
    assert.deepEqual(b.messages.at(-1), { t: 'voiceSignal', from: self, to: state(b).self, signal: { kind: 'restart' } });
  }
});

test('without the override dungeon keeps its separate voice zone', () => {
  const { client } = setup();
  const a = client({ kind: 'lobby' }), b = client({ kind: 'dungeon' });
  assert.equal(state(a).zone, 'world');
  assert.equal(state(b).zone, 'dungeon');
  assert.deepEqual(state(a).peers, []);
  assert.deepEqual(state(b).peers, []);
});

test('fort and race remain isolated with and without the dungeon override', () => {
  for (const worldKinds of [undefined, ['dungeon']]) {
    const { router, client } = setup(worldKinds);
    const lobby = client({ kind: 'lobby' });
    for (const kind of ['fort', 'race']) {
      const other = client({ kind });
      assert.equal(state(other).zone, kind);
      assert.deepEqual(state(other).peers, []);
      assert.deepEqual(state(lobby).peers, []);
      router.handle(lobby, { t: 'voiceSignal', self: state(lobby).self, to: state(other).self, signal: { kind: 'restart' } });
      assert.equal(other.messages.some(m => m.t === 'voiceSignal'), false);
    }
  }
});

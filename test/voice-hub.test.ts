import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import { Hub } from '../server/hub.ts';
import { Profiles } from '../server/profiles.ts';
import { Store } from '../server/store.ts';
import { PROTOCOL_VERSION } from '../shared/constants.ts';
import { VOICE_TALK_LEASE_MS } from '../shared/voice.ts';
import { allOf, connect, lastOf, login, SMOKE } from './kit.ts';

function fixture(t: TestContext, voice = true) {
  const dir = mkdtempSync(path.join(tmpdir(), 'opus-voice-hub-'));
  const clock = { now: Date.UTC(2026, 9, 3, 12) };
  const store = new Store(dir, { log: () => {}, saveDelayMs: 60_000, now: () => clock.now });
  store.load();
  const profiles = new Profiles(store, { now: () => clock.now });
  const hub = new Hub({ store, profiles, smokeToken: SMOKE, build: 'voice-test', voice,
    voiceIce: () => ({ iceServers: [], expiresAt: null, relayOnly: false }), now: () => clock.now, log: () => {} });
  t.after(() => { for (const c of hub.clients) hub.disconnect(c); store.close(); rmSync(dir, { recursive: true, force: true }); });
  return { hub, clock };
}

test('voice flag off is silent; unauthenticated and smoke sessions never receive configuration', t => {
  const off = fixture(t, false), a = login(off.hub, 'VoiceOff');
  off.hub.onJson(a.c, { t: 'voice', a: 'join' });
  assert.equal(a.s.msgs.some(m => m.t.startsWith('voice')), false);
  const { hub } = fixture(t), guest = connect(hub);
  hub.onJson(guest.c, { t: 'voice', a: 'join' });
  assert.equal(guest.s.msgs.some(m => m.t.startsWith('voice')), false);
  hub.onJson(guest.c, { t: 'hello', v: PROTOCOL_VERSION, smoke: SMOKE });
  hub.onJson(guest.c, { t: 'voice', a: 'join' });
  assert.equal(guest.c.ephemeral, true);
  assert.equal(guest.s.msgs.some(m => m.t.startsWith('voice')), false);
});

test('voice joins only by opt-in; server room moves replace ids and reject old signals', t => {
  const { hub } = fixture(t), a = login(hub, 'VoiceA'), b = login(hub, 'VoiceB');
  assert.equal(lastOf(a.s, 'voiceConfig')?.enabled, true);
  assert.equal(lastOf(a.s, 'voiceState')?.self, null);
  hub.onJson(a.c, { t: 'voice', a: 'join' }); hub.onJson(b.c, { t: 'voice', a: 'join' });
  const oldA = lastOf(a.s, 'voiceState')!.self!, oldB = lastOf(b.s, 'voiceState')!.self!;
  assert.deepEqual(lastOf(a.s, 'voiceState')!.peers.map(p => p.id), [oldB]);
  const relay = { t: 'voiceSignal', self: oldA, to: oldB, signal: { kind: 'ice', candidate: null } };
  hub.onJson(a.c, relay); assert.equal(allOf(b.s, 'voiceSignal').length, 1);
  assert.equal(hub.move(a.c, hub.paintball, true), true);
  const newA = lastOf(a.s, 'voiceState')!.self!;
  assert.notEqual(newA, oldA); assert.deepEqual(lastOf(b.s, 'voiceState')!.peers, []);
  hub.onJson(a.c, relay); assert.equal(allOf(b.s, 'voiceSignal').length, 1);
  hub.move(b.c, hub.paintball, true);
  const newB = lastOf(b.s, 'voiceState')!.self!;
  hub.onJson(a.c, { ...relay, self: newA, to: newB });
  assert.equal(allOf(b.s, 'voiceSignal').length, 2);
  assert.equal(lastOf(b.s, 'voiceSignal')!.from, newA);
  assert.equal(lastOf(b.s, 'voiceState')!.room, 'paintball');
});

test('voice Hub propagates rename, expires talking, and removes replaced/disconnected sessions', t => {
  const { hub, clock } = fixture(t), a = login(hub, 'VoiceOne'), b = login(hub, 'VoiceTwo');
  hub.onJson(a.c, { t: 'voice', a: 'join' }); hub.onJson(b.c, { t: 'voice', a: 'join' });
  const self = lastOf(a.s, 'voiceState')!.self!;
  hub.onJson(a.c, { t: 'voice', a: 'talk', self, on: true });
  assert.equal(lastOf(b.s, 'voiceState')!.peers[0].talking, true);
  clock.now += VOICE_TALK_LEASE_MS + 1; hub.step();
  assert.equal(lastOf(b.s, 'voiceState')!.peers[0].talking, false);
  hub.onJson(a.c, { t: 'rename', nick: 'VoiceRenamed' });
  assert.equal(lastOf(b.s, 'voiceState')!.peers[0].nick, 'VoiceRenamed');
  const replacement = login(hub, 'VoiceRenamed', a.key);
  assert.equal(a.c.closed, true); assert.deepEqual(lastOf(b.s, 'voiceState')!.peers, []);
  assert.equal(lastOf(replacement.s, 'voiceState')!.self, null);
  hub.onJson(replacement.c, { t: 'voice', a: 'join' });
  assert.notEqual(lastOf(replacement.s, 'voiceState')!.self, self);
  hub.disconnect(replacement.c);
  assert.deepEqual(lastOf(b.s, 'voiceState')!.peers, []);
});

test('observers outside voice receive talking tied to the room actor, not the connection id', t => {
  const { hub } = fixture(t);
  const discarded = login(hub, 'DiscardedVoice');
  hub.disconnect(discarded.c);
  const speaker = login(hub, 'SpeakingActor'), observer = login(hub, 'SilentObserver');
  const actor = hub.lobby.playerOf(speaker.c)!;
  assert.notEqual(speaker.c.id, actor.slot, 'exercise distinct connection and actor identifiers');
  hub.onJson(speaker.c, { t: 'voice', a: 'join' });
  const self = lastOf(speaker.s, 'voiceState')!.self!;
  hub.onJson(speaker.c, { t: 'voice', a: 'talk', self, on: true });
  const state = lastOf(observer.s, 'voiceState')!;
  assert.equal(state.self, null, 'observer never joined voice');
  assert.deepEqual(state.peers.map(p => ({ entityId: p.entityId, talking: p.talking })),
    [{ entityId: actor.slot, talking: true }]);
  hub.move(speaker.c, hub.paintball, true);
  assert.deepEqual(lastOf(observer.s, 'voiceState')!.peers, []);
  hub.move(observer.c, hub.paintball, true);
  assert.equal(lastOf(observer.s, 'voiceState')!.peers[0].entityId, hub.paintball.playerOf(speaker.c)!.id);
  hub.disconnect(speaker.c);
  assert.deepEqual(lastOf(observer.s, 'voiceState')!.peers, []);
});

test('twelve authenticated lobby clients all join voice through Hub admission',t=>{
 const {hub}=fixture(t),players=Array.from({length:12},(_,i)=>login(hub,'VoiceMember'+i,undefined,'10.0.1.'+(i+1)));
 for(const p of players){assert.equal(p.c.room,hub.lobby);hub.onJson(p.c,{t:'voice',a:'join'});}
 for(const p of players){assert.equal(lastOf(p.s,'voiceConfig')!.maxPeers,0);const state=lastOf(p.s,'voiceState')!;
  assert.ok(state.self);assert.equal(state.peers.length,11);assert.ok(!allOf(p.s,'voiceError').length);
 }
 const speaker=players.at(-1)!,self=lastOf(speaker.s,'voiceState')!.self!;
 hub.onJson(speaker.c,{t:'voice',a:'talk',self,on:true});assert.equal(lastOf(players[0].s,'voiceState')!.peers.find(p=>p.id===self)!.talking,true);
});

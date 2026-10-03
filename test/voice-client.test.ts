import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VoiceController, type VoiceDependencies } from '../client/voice.ts';
import type { VoiceClientMsg } from '../shared/voice.ts';

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function deferred<T>() { let resolve!: (v: T) => void; let reject!: (v: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
class Track extends EventTarget { enabled = true; stopped = false; kind = 'audio'; readyState = 'live'; stop() { this.stopped = true; this.readyState = 'ended'; } }
class Stream { track = new Track(); getTracks() { return [this.track]; } getAudioTracks() { return [this.track]; } }
class AudioNode { gain = { value: 1 }; disconnected = false; connect(_to: unknown) { return this; } disconnect() { this.disconnected = true; } }
class Sink {
  muted = false; defaultMuted = false; srcObject: unknown = null; plays = 0; pauses = 0; failPlay = false; pending: Promise<void> | null = null;
  async play() { this.plays++; if (this.pending) await this.pending; if (this.failPlay) throw Error('secret playback details'); }
  pause() { this.pauses++; }
}
class Context { state = 'running'; destination = new AudioNode(); nodes: AudioNode[] = []; closed = false; failResume = false;
  holdResume: Promise<void> | null = null;
  async resume() { if (this.holdResume) await this.holdResume; if (this.failResume) throw Error('secret'); this.state = 'running'; }
  async close() { this.closed = true; this.state = 'closed'; }
  createGain() { const n = new AudioNode(); this.nodes.push(n); return n; }
  createMediaStreamSource(_s: unknown) { const n = new AudioNode(); this.nodes.push(n); return n; }
}
interface Sender { track: unknown; replaceTrack(t: unknown): Promise<void>; getParameters(): { encodings: object[] }; setParameters(p: unknown): Promise<void> }
interface Transceiver { sender: Sender; receiver: { track: { kind: string } }; mid: string | null; direction: string; setCodecPreferences(c: unknown): void }
class Peer {
  connectionState = 'new'; localDescription: { type: string; sdp: string } | null = null; remoteDescription: unknown = null;
  onicecandidate: ((e: unknown) => void) | null = null; ontrack: ((e: unknown) => void) | null = null; onconnectionstatechange: (() => void) | null = null;
  closed = false; offers = 0; configs = 0; ice: unknown[] = []; tracks: unknown[] = []; txs: Transceiver[] = []; answerTrack: unknown; answerDirection: string | undefined; codecs: unknown; parameters: unknown;
  hold: Promise<void> | null = null;
  makeSender(): Sender { const sender: Sender = { track: null, replaceTrack: async (t: unknown) => { if (this.hold) await this.hold; sender.track = t; this.tracks.push(t); }, getParameters: () => ({ encodings: [{}] }), setParameters: async (p: unknown) => { this.parameters = p; } }; return sender; }
  sender = this.makeSender();
  get transceivers() { return this.txs.length; }
  tx(sender: Sender, mid: string | null, direction: string): Transceiver { return { sender, receiver: { track: { kind: 'audio' } }, mid, direction, setCodecPreferences: (c: unknown) => { this.codecs = c; } }; }
  addTransceiver(_kind: string, _opts: unknown) { const tx = this.tx(this.sender, null, 'sendrecv'); this.txs.push(tx); return tx; }
  getTransceivers() { return this.txs; }
  async createOffer() { this.offers++; return { type: 'offer', sdp: 'private-offer' }; }
  async createAnswer() { const tx = this.txs.find(t => t.mid !== null); this.answerTrack = tx?.sender.track; this.answerDirection = tx?.direction; return { type: 'answer', sdp: 'private-answer' }; }
  async setLocalDescription(d: { type: string; sdp: string }) { this.localDescription = d; }
  async setRemoteDescription(d: { type: string }) { this.remoteDescription = d; if (d.type === 'offer') this.txs.push(this.tx(this.makeSender(), '0', 'recvonly')); }
  async addIceCandidate(c: unknown) { this.ice.push(c); }
  setConfiguration(_c: unknown) { this.configs++; }
  close() { this.closed = true; this.connectionState = 'closed'; }
  async getStats() { return new Map([['a', { type: 'outbound-rtp', kind: 'audio', bytesSent: 123, codecId: 'codec' }], ['codec', { type: 'codec', mimeType: 'audio/opus', clockRate: 48000, sdpFmtpLine: 'SECRET' }]]); }
}
function setup() {
  const peers: Peer[] = [], contexts: Context[] = [], sinks: Sink[] = [], sent: VoiceClientMsg[] = [], streams: Stream[] = [];
  const win = new EventTarget(), doc = new EventTarget(); let hidden = false, eligible = true, time = 0, captures = 0;
  let gum: (() => Promise<MediaStream>) | null = null; const timers = new Map<number, { at: number; fn: () => void }>(); let serial = 0;
  const deps: VoiceDependencies = {
    supported: () => true,
    createPeerConnection: () => { const p = new Peer(); peers.push(p); return p as unknown as RTCPeerConnection; },
    createAudioElement: () => { const sink = new Sink(); sinks.push(sink); return sink as unknown as HTMLAudioElement; },
    createAudioContext: () => { const c = new Context(); contexts.push(c); return c as unknown as AudioContext; },
    getUserMedia: async () => { captures++; if (gum) return gum(); const s = new Stream(); streams.push(s); return s as unknown as MediaStream; },
    createMediaStream: () => new Stream() as unknown as MediaStream,
    audioCapabilities: () => ({ codecs: [{ mimeType: 'audio/opus', clockRate: 48000, channels: 2 }, { mimeType: 'audio/PCMU', clockRate: 8000 }], headerExtensions: [] }),
    now: () => time, setTimer: (fn, ms) => { const id = ++serial; timers.set(id, { at: time + ms, fn }); return id; }, clearTimer: id => { timers.delete(id as number); },
    window: win, document: doc, hidden: () => hidden,
  };
  const controller = new VoiceController({ send: m => sent.push(m), canTalk: () => eligible, onChange: () => {} }, deps);
  controller.onMessage({ t: 'voiceConfig', enabled: true, maxPeers: 6, bitrate: 32000, iceServers: [], expiresAt: null, relayOnly: false });
  const state = (self: number | null = 1, ids = [2]) => controller.onMessage({ t: 'voiceState', self, room: 'lobby', peers: ids.map(id => ({ id, entityId: id, nick: `P${id}`, talking: false })) });
  const advance = (ms: number) => { time += ms; for (const [id, t] of [...timers]) if (t.at <= time) { timers.delete(id); t.fn(); } };
  return { controller, peers, contexts, sinks, sent, streams, win, doc, state, advance, timers, captures: () => captures,
    gum: (fn: () => Promise<MediaStream>) => { gum = fn; }, eligibility: (b: boolean) => { eligible = b; }, hidden: (b: boolean) => { hidden = b; } };
}

test('explicit enable activates playback only; microphone requires separate action and remains disabled', async t => {
  const s = setup(); t.after(() => s.controller.dispose());
  assert.equal(s.contexts.length, 0); assert.equal(s.captures(), 0);
  await s.controller.enable(); s.state(); await flush();
  assert.equal(s.contexts.length, 1); assert.equal(s.captures(), 0); assert.equal(s.peers[0].transceivers, 1);
  assert.equal(s.peers[0].offers, 1);
  await s.controller.enableMic(); await flush();
  assert.equal(s.streams[0].track.enabled, false); assert.equal(s.controller.view.mic, 'ready');
  assert.deepEqual(s.peers[0].parameters, { encodings: [{ maxBitrate: 32000 }] });
  for (const pc of s.peers) { pc.connectionState = 'connected'; pc.onconnectionstatechange?.(); } s.controller.push(true); assert.equal(s.streams[0].track.enabled, true);
  s.controller.push(false); assert.equal(s.streams[0].track.enabled, false);
  assert.equal(s.peers[0].offers, 1, 'PTT never renegotiates');
});

test('release, blur, hidden, focus and lost eligibility stop capture synchronously', async t => {
  const s = setup(); t.after(() => s.controller.dispose()); await s.controller.enable(); s.state(); await s.controller.enableMic();
  const track = s.streams[0].track;
  for (const trigger of [() => s.controller.handleKey('KeyV', false, {} as KeyboardEvent), () => s.win.dispatchEvent(new Event('blur')), () => { s.hidden(true); s.doc.dispatchEvent(new Event('visibilitychange')); }, () => s.doc.dispatchEvent(new Event('focusin')), () => { s.eligibility(false); s.advance(600); }]) {
    s.hidden(false); s.eligibility(true); for (const pc of s.peers) { pc.connectionState = 'connected'; pc.onconnectionstatechange?.(); } s.controller.push(true); assert.equal(track.enabled, true); trigger(); assert.equal(track.enabled, false);
  }
  const typing = { tagName: 'TEXTAREA' } as unknown as EventTarget;
  assert.equal(s.controller.handleKey('KeyV', true, { target: typing } as KeyboardEvent), false); assert.equal(track.enabled, false);
});

test('late microphone permission after disable cannot revive capture', async () => {
  const s = setup(), permission = deferred<MediaStream>(); s.gum(() => permission.promise);
  await s.controller.enable(); s.state(); const pending = s.controller.enableMic();
  s.controller.disable(); const stream = new Stream(); permission.resolve(stream as unknown as MediaStream); await pending;
  assert.equal(stream.track.stopped, true); assert.equal(s.controller.view.mic, 'off'); assert.equal(s.controller.view.enabled, false);
  assert.equal(s.contexts[0].closed, true); assert.ok(s.peers.every(p => p.closed)); assert.equal(s.timers.size, 0);
  s.controller.dispose();
});

test('microphone permission errors are sanitized and retry is explicit', async t => {
  const s = setup(); t.after(() => s.controller.dispose()); await s.controller.enable(); s.state();
  s.gum(async () => { throw Object.assign(Error('private device credentials'), { name: 'NotAllowedError' }); });
  await s.controller.enableMic(); assert.equal(s.controller.view.mic, 'denied'); assert.doesNotMatch(s.controller.view.error, /private|credentials/);
  for (const pc of s.peers) { pc.connectionState = 'connected'; pc.onconnectionstatechange?.(); } s.controller.push(true); s.advance(6000); assert.equal(s.captures(), 1);
});

test('room generation closes peers and rejects late offer, old self and unknown peers', async t => {
  const s = setup(); t.after(() => s.controller.dispose()); await s.controller.enable(); s.state(4, [2]); await flush();
  assert.equal(s.peers[0].offers, 0);
  s.controller.onMessage({ t: 'voiceSignal', from: 2, to: 4, signal: { kind: 'ice', candidate: null } }); await flush(); assert.equal(s.peers[0].ice.length, 0);
  s.controller.roomChanged(); s.state(8, [9]);
  s.controller.onMessage({ t: 'voiceSignal', from: 2, to: 4, signal: { kind: 'offer', sdp: 'old' } });
  s.controller.onMessage({ t: 'voiceSignal', from: 555, to: 8, signal: { kind: 'offer', sdp: 'unknown' } }); await flush();
  assert.ok(s.peers[0].closed); assert.equal(s.peers.length, 2); assert.equal(s.controller.view.enabled, true);
  assert.equal(s.peers[1].remoteDescription, null);
});

test('ICE before offer drains in order, duplicate offers do not create transceivers, bounded ICE queue', async t => {
  const s = setup(); t.after(() => s.controller.dispose()); await s.controller.enable(); s.state(4, [2]);
  for (let i = 0; i < 100; i++) s.controller.onMessage({ t: 'voiceSignal', from: 2, to: 4, signal: { kind: 'ice', candidate: { candidate: `c${i}`, sdpMid: '0', sdpMLineIndex: 0 } } });
  s.controller.onMessage({ t: 'voiceSignal', from: 2, to: 4, signal: { kind: 'offer', sdp: 'offer' } }); await flush(); await flush(); await flush();
  assert.ok(s.peers[0].ice.length <= 64); assert.ok(s.peers[0].ice.length > 0); assert.equal(s.peers[0].transceivers, 1);
});

test('receive gain controls are independent of outgoing mic and redact debug', async t => {
  const s = setup(); t.after(() => s.controller.dispose()); await s.controller.enable(); s.state(); await s.controller.enableMic(); await flush();
  s.peers[0].ontrack?.({ track: new Track(), streams: [new Stream()] }); for (const pc of s.peers) { pc.connectionState = 'connected'; pc.onconnectionstatechange?.(); } s.controller.push(true);
  s.controller.setVolume(.4); s.controller.setGameMuted(true);
  assert.equal(s.contexts[0].nodes[0].gain.value, 0); assert.equal(s.streams[0].track.enabled, true);
  s.controller.setGameMuted(false); assert.equal(s.contexts[0].nodes[0].gain.value, .4);
  s.controller.setPeerMuted(2, true); assert.equal(s.controller.view.peers[0].muted, true);
  s.controller.setReceiving(false); assert.equal(s.contexts[0].nodes[0].gain.value, 0);
  const debug = JSON.stringify(await s.controller.debug()); assert.match(debug, /123/); assert.match(debug, /audio\/opus/); assert.doesNotMatch(debug, /private|SECRET|sdp|candidate|credential/i);
});

test('talk lease heartbeats stop on release; config refresh is one bounded request', async t => {
  const s = setup(); t.after(() => s.controller.dispose()); await s.controller.enable(); s.state(); await s.controller.enableMic(); for (const pc of s.peers) { pc.connectionState = 'connected'; pc.onconnectionstatechange?.(); } s.controller.push(true);
  s.advance(600); assert.equal(s.sent.filter(m => m.t === 'voice' && m.a === 'talk' && m.on).length, 2);
  s.controller.stopTalking(); s.advance(5000); assert.equal(s.sent.filter(m => m.t === 'voice' && m.a === 'talk' && m.on).length, 2);
  s.controller.onMessage({ t: 'voiceConfig', enabled: true, maxPeers: 6, bitrate: 32000, iceServers: [], expiresAt: 9000, relayOnly: false });
  s.advance(4000); assert.equal(s.sent.filter(m => m.t === 'voice' && m.a === 'refresh').length, 1); s.advance(50000);
  assert.equal(s.sent.filter(m => m.t === 'voice' && m.a === 'refresh').length, 1);
});

test('pending replaceTrack and disconnected never reenable tracks or send stale signaling', async () => {
  const s = setup(); await s.controller.enable(); s.state(); await flush();
  const gate = deferred<void>(); s.peers[0].hold = gate.promise; await s.controller.enableMic(); for (const pc of s.peers) { pc.connectionState = 'connected'; pc.onconnectionstatechange?.(); } s.controller.push(true); s.controller.disableMic();
  assert.equal(s.streams[0].track.enabled, false); assert.equal(s.streams[0].track.stopped, true);
  s.controller.disconnected(); const count = s.sent.length; gate.resolve(); await flush();
  assert.equal(s.sent.length, count); assert.ok(s.peers[0].closed); assert.equal(s.controller.view.enabled, false); assert.equal(s.controller.view.mic, 'off'); s.controller.dispose();
});

test('explicit retry rejoins after full group and denied playback can resume without a new context', async t => {
  const s = setup(); t.after(() => s.controller.dispose()); await s.controller.enable();
  s.controller.onMessage({ t: 'voiceError', code: 'full' }); s.state(null, []);
  await s.controller.enable(); assert.equal(s.sent.filter(m => m.t === 'voice' && m.a === 'join').length, 2);
  s.state(); s.contexts[0].state = 'suspended'; s.contexts[0].failResume = true; await s.controller.enable();
  assert.match(s.controller.view.error, /воспроизведение/); assert.doesNotMatch(s.controller.view.error, /secret/);
  s.contexts[0].failResume = false; await s.controller.enable(); assert.equal(s.controller.view.error, ''); assert.equal(s.contexts.length, 1);
});

test('room transition during playback activation preserves explicit join intent', async t => {
  const s = setup(); t.after(() => s.controller.dispose()); const enable = s.controller.enable(); s.controller.roomChanged(); await enable;
  assert.equal(s.sent.filter(m => m.t === 'voice' && m.a === 'join').length, 1);
});

test('server membership errors immediately stop PTT and disabled tears down resources', async t => {
  const s = setup(); t.after(() => s.controller.dispose()); await s.controller.enable(); s.state(); await s.controller.enableMic(); for (const pc of s.peers) { pc.connectionState = 'connected'; pc.onconnectionstatechange?.(); } s.controller.push(true);
  s.controller.onMessage({ t: 'voiceError', code: 'stale' }); assert.equal(s.streams[0].track.enabled, false);
  s.controller.onMessage({ t: 'voiceError', code: 'disabled' }); assert.equal(s.streams[0].track.stopped, true); assert.equal(s.contexts[0].closed, true); assert.equal(s.controller.view.enabled, false);
});

test('explicit retry replaces a failed RTC generation; no automatic reconnect loop', async t => {
  const s = setup(); t.after(() => s.controller.dispose()); await s.controller.enable(); s.state(); await flush();
  s.peers[0].connectionState = 'failed'; s.peers[0].onconnectionstatechange?.(); s.advance(60000);
  assert.equal(s.sent.filter(m => m.t === 'voice' && m.a === 'join').length, 1);
  await s.controller.enable(); assert.ok(s.peers[0].closed); assert.equal(s.sent.filter(m => m.t === 'voice' && m.a === 'join').length, 2);
  s.state(3, [2]); await flush(); assert.equal(s.peers.length, 2); assert.equal(s.controller.view.transmitting, false);
});

test('expired configuration does not schedule a refresh churn', async t => {
  const s = setup(); t.after(() => s.controller.dispose()); await s.controller.enable(); s.state(); s.advance(20000);
  for (let i = 0; i < 4; i++) { s.controller.onMessage({ t: 'voiceConfig', enabled: true, maxPeers: 6, bitrate: 32000, iceServers: [], expiresAt: 10000, relayOnly: false }); s.advance(2000); }
  assert.equal(s.sent.filter(m => m.t === 'voice' && m.a === 'refresh').length, 0);
  assert.match(s.controller.view.error, /истекла/);
});

for (const code of ['invalid', 'rate_limit'] as const) test(`${code} signaling failure requires one explicit fresh join even while RTC is connecting`, async t => {
  const s = setup(); t.after(() => s.controller.dispose()); await s.controller.enable(); s.state(); await flush();
  const old = s.peers[0]; assert.equal(s.controller.view.peers[0].link, 'connecting');
  s.controller.onMessage({ t: 'voiceError', code }); s.advance(60000);
  assert.equal(s.sent.filter(m => m.t === 'voice' && m.a === 'join').length, 1, 'failure alone does not retry');
  await s.controller.enable();
  assert.equal(old.closed, true, 'explicit retry closes the rejected signaling generation');
  assert.equal(s.sent.filter(m => m.t === 'voice' && m.a === 'leave').length, 1);
  assert.equal(s.sent.filter(m => m.t === 'voice' && m.a === 'join').length, 2);
  s.state(3, [4]); await flush(); assert.equal(s.peers[1].offers, 1, 'fresh membership negotiates once');
  s.controller.onMessage({ t: 'voiceSignal', from: 2, to: 1, signal: { kind: 'answer', sdp: 'stale' } }); await flush();
  assert.equal(s.peers[1].remoteDescription, null);
  const signalCount = s.sent.length; await s.controller.enable(); assert.equal(s.sent.length, signalCount, 'successful retry clears the restart requirement');
});

for (const connection of ['failed', 'disconnected']) test(`${connection} RTC event exposes actionable error without auto retry`, async t => {
  const s = setup(); t.after(() => s.controller.dispose()); await s.controller.enable(); s.state(); await flush();
  s.peers[0].connectionState = connection; s.peers[0].onconnectionstatechange?.();
  assert.equal(s.controller.view.peers[0].link, 'failed'); assert.match(s.controller.view.error, /Переподключите|Повторите подключение/);
  s.advance(60000); assert.equal(s.sent.filter(m => m.t === 'voice' && m.a === 'join').length, 1);
});

test('autoplay-only retry resumes existing RTC without leave, join or new offer', async t => {
  const s = setup(); t.after(() => s.controller.dispose()); await s.controller.enable(); s.state(); await flush();
  s.peers[0].connectionState = 'connected'; s.contexts[0].state = 'suspended'; s.contexts[0].failResume = true;
  await s.controller.enable(); assert.match(s.controller.view.error, /воспроизведение/);
  s.contexts[0].failResume = false; const count = s.sent.length; await s.controller.enable();
  assert.equal(s.sent.length, count); assert.equal(s.peers[0].closed, false); assert.equal(s.peers[0].offers, 1); assert.equal(s.controller.view.error, '');
});

test('answerer attaches microphone to the remotely negotiated sender before creating answer', async t => {
  const s = setup(); t.after(() => s.controller.dispose()); await s.controller.enable(); s.state(4, [2]); await s.controller.enableMic(); await flush();
  const peer = s.peers[0]; assert.equal(peer.transceivers, 0, 'answerer must not create an unassociated local transceiver');
  s.controller.onMessage({ t: 'voiceSignal', from: 2, to: 4, signal: { kind: 'offer', sdp: 'one-audio-offer' } }); await flush(); await flush();
  assert.equal(peer.transceivers, 1); assert.equal(peer.txs[0].mid, '0'); assert.equal(peer.answerDirection, 'sendrecv');
  assert.equal(peer.answerTrack, s.streams[0].track, 'the answered m-line uses the microphone sender'); assert.equal(peer.sender.track, null, 'no orphan sender gets a microphone');
  assert.deepEqual(peer.codecs, [{ mimeType: 'audio/opus', clockRate: 48000, channels: 2 }]);
  assert.deepEqual(peer.parameters, { encodings: [{ maxBitrate: 32000 }] });
  s.controller.disableMic(); await flush(); assert.equal(peer.txs[0].sender.track, null);
});

test('listen-only answerer later enables mic on the same negotiated sender without a second transceiver or offer', async t => {
  const s = setup(); t.after(() => s.controller.dispose()); await s.controller.enable(); s.state(4, [2]);
  s.controller.onMessage({ t: 'voiceSignal', from: 2, to: 4, signal: { kind: 'offer', sdp: 'one-audio-offer' } }); await flush(); await flush();
  const peer = s.peers[0]; assert.equal(peer.answerTrack, null); assert.equal(peer.answerDirection, 'sendrecv');
  await s.controller.enableMic(); await flush(); assert.equal(peer.txs[0].sender.track, s.streams[0].track);
  assert.equal(peer.transceivers, 1); assert.equal(peer.offers, 0);
});

test('connection error clears after every current peer is connected', async t => {
  const s = setup(); t.after(() => s.controller.dispose()); await s.controller.enable(); s.state(1, [2, 3]); await flush();
  s.peers[0].connectionState = 'disconnected'; s.peers[0].onconnectionstatechange?.(); assert.match(s.controller.view.error, /прервано/);
  s.peers[0].connectionState = 'connected'; s.peers[0].onconnectionstatechange?.(); assert.match(s.controller.view.error, /прервано/, 'other current peer is still connecting');
  s.peers[1].connectionState = 'connected'; s.peers[1].onconnectionstatechange?.(); assert.equal(s.controller.view.error, '');
});

test('connection error clears when the offending peer leaves without hiding another connection error', async t => {
  const s = setup(); t.after(() => s.controller.dispose()); await s.controller.enable(); s.state(1, [2, 3]); await flush();
  for (const p of s.peers) { p.connectionState = 'failed'; p.onconnectionstatechange?.(); }
  s.state(1, [3]); assert.match(s.controller.view.error, /участник/i, 'second failing peer remains');
  s.state(1, [4]); assert.equal(s.controller.view.error, '', 'offending peers left, replacement may still connect');
});

test('RTC recovery or peer departure cannot clear microphone permission error', async t => {
  const s = setup(); t.after(() => s.controller.dispose()); await s.controller.enable(); s.state(); await flush();
  s.peers[0].connectionState = 'disconnected'; s.peers[0].onconnectionstatechange?.();
  s.gum(async () => { throw Object.assign(Error('denied'), { name: 'NotAllowedError' }); }); await s.controller.enableMic();
  const permissionError = s.controller.view.error; assert.match(permissionError, /Доступ к микрофону/);
  s.peers[0].connectionState = 'connected'; s.peers[0].onconnectionstatechange?.(); assert.equal(s.controller.view.error, permissionError);
  s.state(1, []); assert.equal(s.controller.view.error, permissionError);
});

test('remote audio has one muted decoder sink while audible output stays in WebAudio gain graph', async t => {
  const s = setup(); t.after(() => s.controller.dispose()); await s.controller.enable(); s.state(); await flush();
  const stream = new Stream(); s.peers[0].ontrack?.({ track: stream.track, streams: [stream] }); await flush();
  assert.equal(s.sinks.length, 1); assert.equal(s.sinks[0].srcObject, stream); assert.equal(s.sinks[0].plays, 1);
  assert.equal(s.sinks[0].muted, true); assert.equal(s.sinks[0].defaultMuted, true, 'decoder element is never a second audible output');
  s.controller.setPeerMuted(2, true); assert.equal(s.contexts[0].nodes[2].gain.value, 0); assert.equal(s.sinks[0].muted, true);
  s.controller.setPeerMuted(2, false); s.controller.setVolume(.3); assert.equal(s.contexts[0].nodes[0].gain.value, .3);
  s.controller.setGameMuted(true); assert.equal(s.contexts[0].nodes[0].gain.value, 0); assert.equal(s.sinks[0].muted, true);
  s.state(1, []); assert.equal(s.sinks[0].pauses, 1); assert.equal(s.sinks[0].srcObject, null);
});

test('replaced remote track and disconnect release every decoder sink', async () => {
  const s = setup(); await s.controller.enable(); s.state(); await flush();
  for (let i = 0; i < 2; i++) s.peers[0].ontrack?.({ track: new Track(), streams: [new Stream()] }); await flush();
  assert.equal(s.sinks.length, 2); assert.equal(s.sinks[0].pauses, 1); assert.equal(s.sinks[0].srcObject, null);
  s.controller.disconnected(); assert.equal(s.sinks[1].pauses, 1); assert.equal(s.sinks[1].srcObject, null); s.controller.dispose();
});

test('decoder playback denial is sanitized, explicit enable retries sinks without RTC churn', async t => {
  const s = setup(); t.after(() => s.controller.dispose()); await s.controller.enable(); s.state(); await flush();
  s.peers[0].ontrack?.({ track: new Track(), streams: [new Stream()] }); await flush();
  s.sinks[0].failPlay = true; await s.controller.enable();
  assert.match(s.controller.view.error, /воспроизведение/); assert.doesNotMatch(s.controller.view.error, /secret|details/);
  const count = s.sent.length; s.sinks[0].failPlay = false; await s.controller.enable();
  assert.equal(s.controller.view.error, ''); assert.equal(s.sinks[0].plays, 3); assert.equal(s.sent.length, count); assert.equal(s.peers[0].offers, 1);
});

test('late decoder play rejection after disconnect does not restore stale playback error', async () => {
  const s = setup(); await s.controller.enable(); s.state(); await flush(); s.peers[0].ontrack?.({ track: new Track(), streams: [new Stream()] }); await flush();
  const gate = deferred<void>(); s.sinks[0].pending = gate.promise; const retry = s.controller.enable(); await flush();
  s.controller.disconnected(); gate.reject(Error('secret late device information')); await retry; await flush();
  assert.equal(s.controller.view.error, ''); assert.equal(s.sinks[0].srcObject, null); s.controller.dispose();
});

test('silent signaling and ICE checking have bounded failure states and explicit retry uses fresh membership', async t => {
  const s = setup(); t.after(() => s.controller.dispose());
  await s.controller.enable(); s.state(); await flush();
  s.advance(21_000);
  assert.equal(s.controller.view.peers[0].link, 'failed');
  assert.match(s.controller.view.error, /участник|ответ|согласовать/i);
  assert.equal(s.peers[0].closed, true);
  await s.controller.enable(); s.state(3, [4]); await flush();
  s.controller.onMessage({ t: 'voiceSignal', from: 4, to: 3, signal: { kind: 'answer', sdp: 'answer' } }); await flush();
  s.advance(21_000);
  assert.equal(s.controller.view.peers[0].link, 'failed');
  assert.match(s.controller.view.error, /сеть/i);
  const count = s.sent.length; s.advance(120_000); assert.equal(s.sent.length, count, 'no retry loop');
});

test('server join silence times out and late successful membership cancels failure', async t => {
  const s = setup(); t.after(() => s.controller.dispose()); await s.controller.enable();
  s.advance(11_000); assert.match(s.controller.view.error, /сервер/i);
  await s.controller.enable(); s.state(5, []); s.advance(11_000); assert.equal(s.controller.view.error, '');
});

test('public talking presence reaches nonparticipants without capture or peer connections', () => {
  const s = setup();
  s.controller.onMessage({ t: 'voiceState', self: null, room: 'lobby', peers: [{ id: 44, entityId: 7, nick: 'P7', talking: true }] });
  assert.deepEqual(s.controller.view.presence, [{ id: 44, entityId: 7, nick: 'P7', talking: true }]);
  assert.equal(s.controller.view.enabled, false); assert.equal(s.peers.length, 0); assert.equal(s.captures(), 0);
  s.controller.roomChanged(); assert.deepEqual(s.controller.view.presence, []); s.controller.dispose();
});

test('ICE diagnostics retain only states, counters and whitelisted route types', async t => {
  const s = setup(); t.after(() => s.controller.dispose()); await s.controller.enable(); s.state(); await flush();
  s.peers[0].onicecandidate?.({ candidate: { candidate: 'candidate:1 1 udp 1 private.invalid 1234 typ relay', sdpMid: '0', sdpMLineIndex: 0 } });
  s.controller.onMessage({ t: 'voiceSignal', from: 2, to: 1, signal: { kind: 'answer', sdp: 'secret' } }); await flush();
  const debug = await s.controller.debug();
  assert.equal(debug.peers[0].localIce, 1); assert.equal(debug.peers[0].descriptionsReceived, 1);
  assert.doesNotMatch(JSON.stringify(debug), /private|secret|credential|address|candidate:/i);
});

 test('PTT never announces a transmission before media connection and stops synchronously when last route drops', async t => {
 const s=setup();t.after(()=>s.controller.dispose());await s.controller.enable();s.state();await s.controller.enableMic();
 s.controller.push(true);assert.equal(s.streams[0].track.enabled,false);assert.equal(s.sent.filter(m=>m.t==='voice'&&m.a==='talk'&&m.on).length,0);
 s.peers[0].connectionState='connected';s.peers[0].onconnectionstatechange?.();s.controller.push(true);assert.equal(s.streams[0].track.enabled,true);
 s.peers[0].connectionState='disconnected';s.peers[0].onconnectionstatechange?.();assert.equal(s.streams[0].track.enabled,false);
 });

test('mixed group keeps PTT to connected peers and mutes only when the final route drops', async t => {
 const s=setup();t.after(()=>s.controller.dispose());await s.controller.enable();s.state(1,[2,3,4]);await s.controller.enableMic();await flush();
 s.peers[0].connectionState='connected';s.peers[0].onconnectionstatechange?.();
 s.peers[1].connectionState='failed';s.peers[1].onconnectionstatechange?.();
 s.controller.push(true);assert.equal(s.streams[0].track.enabled,true);
 s.peers[2].connectionState='connected';s.peers[2].onconnectionstatechange?.();
 s.peers[0].connectionState='disconnected';s.peers[0].onconnectionstatechange?.();assert.equal(s.streams[0].track.enabled,true);
 s.peers[2].connectionState='disconnected';s.peers[2].onconnectionstatechange?.();assert.equal(s.streams[0].track.enabled,false);
});

test('playback failure blocks V until explicit successful resume even with connected transport', async t => {
 const s=setup();t.after(()=>s.controller.dispose());await s.controller.enable();s.state();await s.controller.enableMic();
 s.peers[0].connectionState='connected';s.peers[0].onconnectionstatechange?.();s.contexts[0].failResume=true;
 await s.controller.enable();s.controller.push(true);assert.equal(s.streams[0].track.enabled,false);
 s.contexts[0].failResume=false;await s.controller.enable();s.controller.push(true);assert.equal(s.streams[0].track.enabled,true);
});

 test('atomic mic activation cannot revive capture after cancellation and a new listen-only enable', async t => {
 const s=setup();t.after(()=>s.controller.dispose());await s.controller.enable();
 const resume=deferred<void>();s.contexts[0].holdResume=resume.promise;const old=s.controller.connectMic();
 s.controller.disable();await s.controller.enable();assert.equal(s.captures(),0);
 resume.resolve();await old;assert.equal(s.captures(),0);assert.equal(s.controller.view.mic,'off');assert.equal(s.controller.view.enabled,true);
 });

 test('first V explicitly activates mic but never transmits until the next hold', async t => {
 const s=setup();t.after(()=>s.controller.dispose());
 assert.equal(s.controller.handleKey('KeyV',true,{} as KeyboardEvent),true);await flush();await flush();
 assert.equal(s.captures(),1);assert.equal(s.controller.view.mic,'ready');assert.equal(s.streams[0].track.enabled,false);
 s.state(1,[]);s.controller.handleKey('KeyV',false,{} as KeyboardEvent);
 assert.equal(s.controller.handleKey('KeyV',true,{} as KeyboardEvent),true);assert.equal(s.streams[0].track.enabled,true);
 s.controller.handleKey('KeyV',false,{} as KeyboardEvent);assert.equal(s.streams[0].track.enabled,false);
 });

 test('first V ignores typing, modifiers, repeat, hidden and ineligible gameplay before requesting mic', async t => {
 const s=setup();t.after(()=>s.controller.dispose());
 for(const event of [{target:{tagName:'TEXTAREA'}},{ctrlKey:true},{altKey:true},{metaKey:true},{repeat:true}]) assert.equal(s.controller.handleKey('KeyV',true,event as unknown as KeyboardEvent),false);
 s.hidden(true);assert.equal(s.controller.handleKey('KeyV',true,{} as KeyboardEvent),false);s.hidden(false);
 s.eligibility(false);assert.equal(s.controller.handleKey('KeyV',true,{} as KeyboardEvent),false);await flush();assert.equal(s.captures(),0);assert.equal(s.contexts.length,0);
 });

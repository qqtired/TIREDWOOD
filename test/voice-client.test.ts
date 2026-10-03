// Голос в браузере (client/voice.ts) на поддельном WebRTC: слушаем по умолчанию, соединения только там, где есть
// микрофон, V, перезапуск ICE, заглушение по профилю, обрыв игровой связи, настройки.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VoiceController, withDtx, type VoiceDependencies, type MicPermission } from '../client/voice.ts';
import { defaultVoicePrefs, loadVoicePrefs, setPeerPref, type VoicePrefs } from '../client/voice-prefs.ts';
import type { VoiceClientMsg, VoicePeer } from '../shared/voice.ts';

const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
class Track extends EventTarget { enabled = true; stopped = false; kind = 'audio'; label = 'Mic'; stop() { this.stopped = true; } }
class Stream { track = new Track(); getTracks() { return [this.track]; } getAudioTracks() { return [this.track]; } }
class Sink { muted = false; volume = 1; autoplay = false; srcObject: unknown = null; plays = 0; failPlay = false; async play() { this.plays++; if (this.failPlay) throw Error('blocked'); } pause() {} }
interface Sender { track: unknown; replaceTrack(t: unknown): Promise<void>; getParameters(): { encodings: object[] }; setParameters(p: unknown): Promise<void> }
let session = 100;
class Peer {
  connectionState = 'new'; signalingState = 'stable'; localDescription: { type: string; sdp: string } | null = null; remoteDescription: { type: string; sdp: string } | null = null;
  onicecandidate: ((e: unknown) => void) | null = null; ontrack: ((e: unknown) => void) | null = null; onconnectionstatechange: (() => void) | null = null; onicecandidateerror: (() => void) | null = null;
  closed = false; offers: Array<{ iceRestart?: boolean }> = []; answers = 0; txs: Array<{ sender: Sender; receiver: { track: { kind: string } }; mid: string | null; direction: string; setCodecPreferences(c: unknown): void }> = [];
  session = ++session;
  sender(): Sender { const s: Sender = { track: null, replaceTrack: async t => { s.track = t; }, getParameters: () => ({ encodings: [{}] }), setParameters: async () => {} }; return s; }
  tx(mid: string | null) { return { sender: this.sender(), receiver: { track: { kind: 'audio' } }, mid, direction: 'sendrecv', setCodecPreferences: () => {} }; }
  addTransceiver() { const t = this.tx('0'); this.txs.push(t); return t; }
  getTransceivers() { return this.txs; }
  sdp(kind: string) { return `v=0\r\no=- ${this.session} 2 IN IP4 127.0.0.1\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\na=fmtp:111 minptime=10\r\na=${kind}\r\n`; }
  async createOffer(o: { iceRestart?: boolean } = {}) { this.offers.push(o); return { type: 'offer', sdp: this.sdp('offer') }; }
  async createAnswer() { this.answers++; return { type: 'answer', sdp: this.sdp('answer') }; }
  async setLocalDescription(d: { type: string; sdp: string }) {
    if (d.type === 'rollback') { this.signalingState = 'stable'; return; }
    this.localDescription = d; this.signalingState = d.type === 'offer' ? 'have-local-offer' : 'stable';
  }
  async setRemoteDescription(d: { type: string; sdp: string }) {
    this.remoteDescription = d;
    if (d.type === 'offer') { if (!this.txs.length) this.txs.push(this.tx('0')); this.signalingState = 'have-remote-offer'; } else this.signalingState = 'stable';
  }
  async addIceCandidate() {}
  setConfiguration() {}
  close() { this.closed = true; this.connectionState = 'closed'; }
  async getStats() { return new Map(); }
  set(state: string) { this.connectionState = state; this.onconnectionstatechange?.(); }
  track() { this.ontrack?.({ streams: [new Stream()], track: new Track() }); }
}
const key = (extra: object = {}) => ({ repeat: false, ctrlKey: false, metaKey: false, altKey: false, target: null, ...extra }) as unknown as KeyboardEvent;
type Who = Partial<VoicePeer> & { id: number };

function setup(o: { prefs?: VoicePrefs; permission?: MicPermission } = {}) {
  const pcs: Peer[] = [], sinks: Sink[] = [], sent: VoiceClientMsg[] = [], streams: Stream[] = [], saved: VoicePrefs[] = [];
  const win = new EventTarget(), doc = new EventTarget(); let time = 0, captures = 0, serial = 0, blocked = false;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const deps: VoiceDependencies = {
    supported: () => true,
    createPeerConnection: () => { const p = new Peer(); pcs.push(p); return p as unknown as RTCPeerConnection; },
    createAudioElement: () => { const s = new Sink(); s.failPlay = blocked; sinks.push(s); return s as unknown as HTMLAudioElement; },
    getUserMedia: async () => { captures++; const s = new Stream(); streams.push(s); return s as unknown as MediaStream; },
    createMediaStream: () => new Stream() as unknown as MediaStream,
    audioCapabilities: () => null, micPermission: async () => o.permission ?? 'prompt',
    now: () => time, setTimer: (fn, ms) => { const id = ++serial; timers.set(id, { at: time + ms, fn }); return id; }, clearTimer: id => { timers.delete(id as number); },
    window: win, document: doc, hidden: () => false,
  };
  const prefs = o.prefs ?? defaultVoicePrefs();
  const voice = new VoiceController({ send: m => sent.push(m), canTalk: () => true, onChange: () => {}, prefs, savePrefs: p => saved.push(structuredClone(p)) }, deps);
  voice.onMessage({ t: 'voiceConfig', enabled: true, maxPeers: 0, bitrate: 32000, iceServers: [], expiresAt: null, relayOnly: false });
  const state = (self: number | null, who: Who[], zone = 'world') => voice.onMessage({ t: 'voiceState', self, room: 'lobby', zone,
    peers: who.map(p => ({ entityId: p.id, pid: p.id, nick: `P${p.id}`, talking: false, mic: false, ...p })) });
  const advance = (ms: number) => { time += ms; for (const [id, t] of [...timers]) if (t.at <= time) { timers.delete(id); t.fn(); } };
  const signals = () => sent.filter((m): m is Extract<VoiceClientMsg, { t: 'voiceSignal' }> => m.t === 'voiceSignal');
  const offerFrom = (pc: Peer, from: number, to: number) => voice.onMessage({ t: 'voiceSignal', from, to, signal: { kind: 'offer', sdp: pc.sdp('offer') } });
  const blockAudio = (on: boolean) => { blocked = on; for (const k of sinks) k.failPlay = on; };
  return { voice, pcs, sinks, sent, streams, saved, win, state, advance, signals, offerFrom, blockAudio, captures: () => captures };
}
const micMsgs = (sent: VoiceClientMsg[]) => sent.filter(m => m.t === 'voice' && m.a === 'mic').map(m => (m as { on: boolean }).on);

test('после входа — сразу в канале и слушаем: без микрофона; слушатели между собой не соединяются', async () => {
  const s = setup();
  assert.deepEqual(s.sent, [{ t: 'voice', a: 'join' }]);
  s.state(1, [{ id: 2 }, { id: 3 }]);
  await flush();
  assert.equal(s.captures(), 0, 'микрофон без спроса не открываем');
  assert.equal(s.pcs.length, 0, 'оба слушают — соединение не нужно');
  assert.equal(s.voice.view.joined, true); assert.equal(s.voice.view.people.length, 2); assert.equal(s.voice.view.peers.length, 0);
  // у третьего включился микрофон — к нему подключаемся (мы меньший номер: предлагаем мы)
  s.state(1, [{ id: 2 }, { id: 3, mic: true }]);
  await flush();
  assert.equal(s.pcs.length, 1); assert.equal(s.pcs[0].offers.length, 1);
  const offer = s.signals()[0].signal;
  assert.match(offer.kind === 'offer' ? offer.sdp : '', /a=fmtp:111 minptime=10;usedtx=1/, 'Opus DTX в предложении');
  // и выключился — соединение закрыто
  s.state(1, [{ id: 2 }, { id: 3 }]);
  assert.equal(s.pcs[0].closed, true); assert.equal(s.voice.view.peers.length, 0);
});

test('первое V включает микрофон без передачи; удержание — говорим, отпустил — сразу тишина', async () => {
  const s = setup();
  s.state(1, [{ id: 2 }, { id: 3 }]);
  assert.equal(s.voice.handleKey('KeyV', true, key()), true);
  await flush();
  assert.equal(s.captures(), 1);
  const track = s.streams[0].track;
  assert.equal(track.enabled, false, 'разрешение не превращается в передачу');
  assert.deepEqual(micMsgs(s.sent), [true]);
  assert.equal(s.pcs.length, 2, 'с микрофоном — соединения со всеми в зоне');
  s.voice.handleKey('KeyV', false, key());
  // пока ни одно соединение не поднялось — не говорим
  s.voice.handleKey('KeyV', true, key()); assert.equal(track.enabled, false);
  s.voice.handleKey('KeyV', false, key());
  s.pcs[0].set('connected');
  s.voice.handleKey('KeyV', true, key()); assert.equal(track.enabled, true);
  assert.ok(s.sent.some(m => m.t === 'voice' && m.a === 'talk' && m.on));
  s.voice.handleKey('KeyV', false, key()); assert.equal(track.enabled, false);
  assert.equal(s.sent.filter(m => m.t === 'voice' && m.a === 'talk').at(-1)?.t, 'voice');
  // потеря фокуса — тоже тишина
  s.voice.handleKey('KeyV', true, key()); s.win.dispatchEvent(new Event('blur')); assert.equal(track.enabled, false);
  // выключил микрофон — соединения со слушателями закрыты, поток остановлен
  s.voice.disableMic();
  assert.deepEqual(micMsgs(s.sent), [true, false]); assert.equal(track.stopped, true);
  assert.ok(s.pcs.every(p => p.closed));
});

test('режим «V — вкл/выкл»: нажал — говоришь, нажал ещё раз — замолчал', async () => {
  const prefs = defaultVoicePrefs(); prefs.mode = 'toggle';
  const s = setup({ prefs });
  s.state(1, []);
  s.voice.handleKey('KeyV', true, key()); await flush();
  const track = s.streams[0].track;
  s.voice.handleKey('KeyV', false, key());
  s.voice.handleKey('KeyV', true, key()); s.voice.handleKey('KeyV', false, key());
  assert.equal(track.enabled, true, 'отпустил — всё ещё говоришь');
  s.voice.handleKey('KeyV', true, key()); assert.equal(track.enabled, false);
});

test('связь пропала: предлагающий перезапускает ICE, отвечающий просит его; потом соединение с нуля', async () => {
  const s = setup();
  s.state(2, [{ id: 1, mic: true }, { id: 3, mic: true }]);
  await flush();
  const [answerer, offerer] = s.pcs; // с 1 мы отвечаем, с 3 — предлагаем
  assert.equal(offerer.offers.length, 1); assert.equal(answerer.offers.length, 0);
  offerer.set('failed'); await flush();
  assert.deepEqual(offerer.offers.at(-1), { iceRestart: true });
  answerer.set('failed');
  assert.deepEqual(s.signals().at(-1), { t: 'voiceSignal', self: 2, to: 1, signal: { kind: 'restart' } });
  // просьба перезапуска от отвечающего (3 — больший номер)
  s.voice.onMessage({ t: 'voiceSignal', from: 3, to: 2, signal: { kind: 'restart' } }); await flush();
  assert.equal(offerer.offers.filter(o => o.iceRestart).length, 2);
  // перезапуски не помогают — новое соединение вместо старого
  for (let i = 0; i < 10 && !offerer.closed; i++) { s.advance(31_000); await flush(); }
  assert.ok(offerer.closed); assert.ok(s.pcs.length > 2); assert.deepEqual(s.pcs.at(-1)!.offers, [{}]);
  // «disconnected» сам часто проходит: перезапуск только через паузу
  const fresh = s.pcs.at(-1)!; fresh.set('connected'); fresh.set('disconnected'); await flush();
  assert.equal(fresh.offers.length, 1); s.advance(3_000); await flush(); assert.deepEqual(fresh.offers.at(-1), { iceRestart: true });
});

test('отвечающий: новое предложение из новой сессии — соединение с нуля; микрофон на согласованном отправителе', async () => {
  const s = setup();
  s.state(3, [{ id: 1, mic: true }]);
  const remote = new Peer();
  s.offerFrom(remote, 1, 3); await flush();
  const first = s.pcs[0];
  assert.equal(first.answers, 1); assert.equal(first.txs.length, 1);
  assert.match(s.signals().at(-1)!.signal.kind === 'answer' ? (s.signals().at(-1)!.signal as { sdp: string }).sdp : '', /usedtx=1/);
  s.offerFrom(remote, 1, 3); await flush();
  assert.equal(s.pcs.length, 1, 'та же сессия (перезапуск ICE) — то же соединение');
  s.offerFrom(new Peer(), 1, 3); await flush();
  assert.equal(first.closed, true); assert.equal(s.pcs.length, 2); assert.equal(s.pcs[1].answers, 1);
});

test('заглушение и громкость — по профилю: переживают смену зоны и номеров, сохраняются', async () => {
  const s = setup();
  s.state(1, [{ id: 2, pid: 77, mic: true }]); await flush();
  s.pcs[0].track();
  assert.equal(s.sinks[0].muted, false);
  s.voice.setPeerMuted(77, true); s.voice.setPeerVolume(77, 0.5);
  assert.equal(s.sinks[0].muted, true); assert.equal(s.sinks[0].volume, 0.5);
  assert.deepEqual(s.saved.at(-1)!.peers, { 77: { muted: true, volume: 0.5 } });
  // крепость: новые номера у всех, тот же человек
  s.state(5, [{ id: 9, pid: 77, mic: true }], 'fort'); await flush();
  assert.equal(s.pcs[0].closed, true);
  s.pcs.at(-1)!.track();
  assert.equal(s.sinks.at(-1)!.muted, true); assert.equal(s.sinks.at(-1)!.volume, 0.5);
  assert.equal(s.voice.view.people[0].muted, true);
});

test('обрыв игровой связи: голосовые соединения живут, говорить нельзя до возврата', async () => {
  const s = setup();
  s.state(1, [{ id: 2, mic: true }]);
  await s.voice.enableMic(); await flush();
  s.pcs[0].set('connected');
  s.voice.push(true); assert.equal(s.streams[0].track.enabled, true);
  s.voice.linkDown();
  assert.equal(s.streams[0].track.enabled, false); assert.equal(s.pcs[0].closed, false);
  s.voice.push(true); assert.equal(s.streams[0].track.enabled, false);
  s.voice.linkUp();
  s.voice.push(true); assert.equal(s.streams[0].track.enabled, true);
});

test('«Слышать голос» выключено: из канала, микрофон отпущен; включено — снова в канале без микрофона', async () => {
  const s = setup();
  s.state(1, [{ id: 2, mic: true }]);
  await s.voice.enableMic(); await flush();
  s.voice.setListen(false);
  assert.ok(s.sent.some(m => m.t === 'voice' && m.a === 'leave')); assert.equal(s.streams[0].track.stopped, true);
  assert.ok(s.pcs.every(p => p.closed)); assert.equal(s.saved.at(-1)!.listen, false);
  s.state(null, [{ id: 2, mic: true }]); assert.equal(s.pcs.length, 1, 'вне канала соединений нет');
  s.voice.setListen(true);
  assert.deepEqual(s.sent.at(-1), { t: 'voice', a: 'join' }); assert.equal(s.captures(), 1);
});

test('браузер не дал включить звук: первый клик или клавиша включают', async () => {
  const s = setup();
  s.state(1, [{ id: 2, mic: true }]); await flush();
  s.blockAudio(true); s.pcs[0].track(); await flush();
  assert.equal(s.voice.view.playbackBlocked, true);
  s.win.dispatchEvent(new Event('keydown')); await flush();
  assert.equal(s.voice.view.playbackBlocked, true, 'не вышло — ждём следующего жеста');
  s.blockAudio(false); s.win.dispatchEvent(new Event('pointerdown')); await flush();
  assert.equal(s.voice.view.playbackBlocked, false); assert.equal(s.sinks[0].plays, 3);
});

test('после нового входа микрофон включается сам, только если браузер уже разрешил', async () => {
  const s = setup({ permission: 'granted' });
  s.state(1, []); await s.voice.enableMic(); await flush();
  s.voice.disconnected(true);
  s.voice.onMessage({ t: 'voiceConfig', enabled: true, maxPeers: 0, bitrate: 32000, iceServers: [], expiresAt: null, relayOnly: false });
  s.state(4, []); await flush(); await flush();
  assert.equal(s.captures(), 2); assert.equal(s.streams[1].track.enabled, false); assert.deepEqual(micMsgs(s.sent), [true, true]);
  // выход в меню — забываем
  s.voice.disconnected();
  s.voice.onMessage({ t: 'voiceConfig', enabled: true, maxPeers: 0, bitrate: 32000, iceServers: [], expiresAt: null, relayOnly: false });
  s.state(6, []); await flush(); await flush();
  assert.equal(s.captures(), 2);
});

test('DTX в описании Opus и настройки голоса с нормализацией', () => {
  const sdp = 'a=rtpmap:111 opus/48000/2\r\na=fmtp:111 minptime=10;useinbandfec=1\r\n';
  assert.equal(withDtx(sdp), 'a=rtpmap:111 opus/48000/2\r\na=fmtp:111 minptime=10;useinbandfec=1;usedtx=1\r\n');
  assert.equal(withDtx(withDtx(sdp)), withDtx(sdp));
  assert.equal(withDtx('a=rtpmap:111 opus/48000/2\r\n'), 'a=rtpmap:111 opus/48000/2\r\na=fmtp:111 usedtx=1\r\n');
  const store = (v: unknown) => ({ getItem: () => typeof v === 'string' ? v : JSON.stringify(v), setItem: () => {} });
  assert.deepEqual(loadVoicePrefs(store('{bad json')), defaultVoicePrefs());
  const p = loadVoicePrefs(store({ listen: false, volume: 7, mode: 'shout', device: 5, noise: false, peers: { 12: { muted: true }, x: { muted: true }, 13: { volume: -1 }, 14: { volume: 1 } } }));
  assert.deepEqual(p, { listen: false, volume: 1, mode: 'hold', device: '', noise: false, peers: { 12: { muted: true, volume: 1 }, 13: { muted: false, volume: 0 } } });
  setPeerPref(p, 12, { muted: false }); assert.deepEqual(Object.keys(p.peers), ['13'], 'обычные значения не храним');
});

// Голос в браузере (client/voice.ts) на поддельном WebRTC: слушаем по умолчанию, соединения только там, где есть
// микрофон, V, перезапуск ICE, заглушение по профилю, обрыв игровой связи, настройки.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VoiceController, withDtx, VOICE_FADE_IN_S, VOICE_FADE_OUT_TAU_S, VOICE_ONSET_S, VOICE_TAIL_MS, VOICE_TAIL_PLAIN_MS, type VoiceDependencies, type MicPermission } from '../client/voice.ts';
import { defaultVoicePrefs, loadVoicePrefs, setPeerPref, type VoicePrefs } from '../client/voice-prefs.ts';
import { MicTest } from '../client/voice-mictest.ts';
import type { VoiceClientMsg, VoicePeer } from '../shared/voice.ts';

const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
/** Дождаться, пока все обещания (вся цепочка согласования) отработают: таймеры здесь поддельные */
const settle = () => new Promise<void>(r => setImmediate(r));
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
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
  /** Применённые кандидаты ICE (по порядку); сколько transceiver создали сами; задержка setRemoteDescription */
  ice: unknown[] = []; added = 0; hold: Promise<void> | null = null;
  sender(): Sender { const s: Sender = { track: null, replaceTrack: async t => { s.track = t; }, getParameters: () => ({ encodings: [{}] }), setParameters: async () => {} }; return s; }
  tx(mid: string | null) { return { sender: this.sender(), receiver: { track: { kind: 'audio' } }, mid, direction: 'sendrecv', setCodecPreferences: () => {} }; }
  addTransceiver() { this.added++; const t = this.tx('0'); this.txs.push(t); return t; }
  getTransceivers() { return this.txs; }
  sdp(kind: string) { return `v=0\r\no=- ${this.session} 2 IN IP4 127.0.0.1\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\na=fmtp:111 minptime=10\r\na=${kind}\r\n`; }
  async createOffer(o: { iceRestart?: boolean } = {}) { this.offers.push(o); return { type: 'offer', sdp: this.sdp('offer') }; }
  async createAnswer() { this.answers++; return { type: 'answer', sdp: this.sdp('answer') }; }
  async setLocalDescription(d: { type: string; sdp: string }) {
    if (d.type === 'rollback') { this.signalingState = 'stable'; return; }
    this.localDescription = d; this.signalingState = d.type === 'offer' ? 'have-local-offer' : 'stable';
  }
  async setRemoteDescription(d: { type: string; sdp: string }) {
    if (this.hold) await this.hold;
    this.remoteDescription = d;
    if (d.type === 'offer') { if (!this.txs.length) this.txs.push(this.tx('0')); this.signalingState = 'have-remote-offer'; } else this.signalingState = 'stable';
  }
  async addIceCandidate(c: unknown) { this.ice.push(c); }
  setConfiguration() {}
  close() { this.closed = true; this.connectionState = 'closed'; }
  async getStats() { return new Map(); }
  set(state: string) { this.connectionState = state; this.onconnectionstatechange?.(); }
  track() { this.ontrack?.({ streams: [new Stream()], track: new Track() }); }
}
// Звуковой движок для цепочки отправки: записываем, что делали с громкостью
class Param {
  value: number; log: string[] = [];
  constructor(v: number) { this.value = v; }
  cancelScheduledValues(t: number) { this.log.push(`cancel@${t}`); return this; }
  setValueAtTime(v: number, t: number) { this.log.push(`set ${v}@${t}`); this.value = v; return this; }
  linearRampToValueAtTime(v: number, t: number) { this.log.push(`ramp ${v}@${t}`); this.value = v; return this; }
  setTargetAtTime(v: number, t: number, tau: number) { this.log.push(`target ${v}@${t}/${tau}`); this.value = v; return this; }
}
class AudioPart { links: unknown[] = []; connect(n: unknown) { this.links.push(n); return n; } disconnect() { this.links = []; } }
class Ctx {
  state: string; currentTime = 0; resumes = 0; closed = false; failResume = false;
  gains: Array<AudioPart & { gain: Param }> = []; dests: Stream[] = []; sources: unknown[] = [];
  constructor(state: string) { this.state = state; }
  async resume() { this.resumes++; if (!this.failResume) this.state = 'running'; }
  async close() { this.closed = true; this.state = 'closed'; }
  createMediaStreamSource(s: unknown) { this.sources.push(s); return new AudioPart(); }
  createGain() { const g = Object.assign(new AudioPart(), { gain: new Param(1) }); this.gains.push(g); return g; }
  createMediaStreamDestination() { const stream = new Stream(); this.dests.push(stream); return Object.assign(new AudioPart(), { stream }); }
}
const key = (extra: object = {}) => ({ repeat: false, ctrlKey: false, metaKey: false, altKey: false, target: null, ...extra }) as unknown as KeyboardEvent;
type Who = Partial<VoicePeer> & { id: number };

/** audio: состояние звукового движка; без него — запасной путь (дорожка микрофона, хвост без затухания) */
function setup(o: { prefs?: VoicePrefs; permission?: MicPermission; audio?: 'running' | 'suspended' | 'broken' } = {}) {
  const ctxs: Ctx[] = [];
  const pcs: Peer[] = [], sinks: Sink[] = [], sent: VoiceClientMsg[] = [], streams: Stream[] = [], saved: VoicePrefs[] = [];
  const win = new EventTarget(), doc = new EventTarget(); let time = 0, captures = 0, serial = 0, blocked = false, hidden = false, eligible = true;
  let gum: ((c: MediaStreamConstraints) => Promise<MediaStream>) | null = null;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const deps: VoiceDependencies = {
    supported: () => true,
    createPeerConnection: () => { const p = new Peer(); pcs.push(p); return p as unknown as RTCPeerConnection; },
    createAudioElement: () => { const s = new Sink(); s.failPlay = blocked; sinks.push(s); return s as unknown as HTMLAudioElement; },
    createAudioContext: () => {
      if (!o.audio) return null;
      if (o.audio === 'broken') throw new Error('no audio');
      const c = new Ctx(o.audio); ctxs.push(c); return c as unknown as AudioContext;
    },
    getUserMedia: async c => { captures++; if (gum) return gum(c); const s = new Stream(); streams.push(s); return s as unknown as MediaStream; },
    createMediaStream: () => new Stream() as unknown as MediaStream,
    audioCapabilities: () => null, micPermission: async () => o.permission ?? 'prompt',
    now: () => time, setTimer: (fn, ms) => { const id = ++serial; timers.set(id, { at: time + ms, fn }); return id; }, clearTimer: id => { timers.delete(id as number); },
    window: win, document: doc, hidden: () => hidden,
  };
  const prefs = o.prefs ?? defaultVoicePrefs();
  const voice = new VoiceController({ send: m => sent.push(m), canTalk: () => eligible, onChange: () => {}, prefs, savePrefs: p => saved.push(structuredClone(p)) }, deps);
  voice.onMessage({ t: 'voiceConfig', enabled: true, maxPeers: 0, bitrate: 32000, iceServers: [], expiresAt: null, relayOnly: false });
  const state = (self: number | null, who: Who[], zone = 'world') => voice.onMessage({ t: 'voiceState', self, room: 'lobby', zone,
    peers: who.map(p => ({ entityId: p.id, pid: p.id, nick: `P${p.id}`, talking: false, mic: false, ...p })) });
  const advance = (ms: number) => { time += ms; for (const [id, t] of [...timers]) if (t.at <= time) { timers.delete(id); t.fn(); } };
  const signals = () => sent.filter((m): m is Extract<VoiceClientMsg, { t: 'voiceSignal' }> => m.t === 'voiceSignal');
  const offerFrom = (pc: Peer, from: number, to: number) => voice.onMessage({ t: 'voiceSignal', from, to, signal: { kind: 'offer', sdp: pc.sdp('offer') } });
  const blockAudio = (on: boolean) => { blocked = on; for (const k of sinks) k.failPlay = on; };
  return { voice, pcs, sinks, sent, streams, saved, win, doc, state, advance, signals, offerFrom, blockAudio, ctxs, captures: () => captures,
    hide: (on: boolean) => { hidden = on; }, canTalk: (on: boolean) => { eligible = on; },
    gum: (fn: ((c: MediaStreamConstraints) => Promise<MediaStream>) | null) => { gum = fn; } };
}
const micMsgs = (sent: VoiceClientMsg[]) => sent.filter(m => m.t === 'voice' && m.a === 'mic').map(m => (m as { on: boolean }).on);
/** Что сервер слышал про «говорю»: true — говорит, false — замолчал */
const talkMsgs = (sent: VoiceClientMsg[]) => sent.flatMap(m => m.t === 'voice' && m.a === 'talk' ? [m.on] : []);

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

test('первое V включает микрофон без передачи; удержание — говорим, отпустил — после короткого хвоста тишина', async () => {
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
  s.voice.handleKey('KeyV', false, key()); assert.equal(track.enabled, true, 'хвост: последний слог не режем');
  s.advance(VOICE_TAIL_PLAIN_MS); assert.equal(track.enabled, false);
  assert.deepEqual(talkMsgs(s.sent), [true, false]);
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
  s.advance(1000);
  assert.equal(track.enabled, true, 'отпустил — всё ещё говоришь');
  s.voice.handleKey('KeyV', true, key()); assert.equal(track.enabled, true, 'выключил — короткий хвост');
  s.advance(VOICE_TAIL_PLAIN_MS); assert.equal(track.enabled, false);
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

// ------------------------------------------------------------ приватность микрофона

test('V не трогает микрофон и не говорит: фокус в поле ввода, повтор, Ctrl/Meta/Alt, скрытая вкладка, canTalk() = false', async () => {
  const s = setup();
  s.state(1, [{ id: 2 }]);
  const ignored: Array<[string, object]> = [
    ['INPUT text', { target: { tagName: 'INPUT', type: 'text' } }],
    ['INPUT search', { target: { tagName: 'INPUT', type: 'search' } }],
    ['TEXTAREA', { target: { tagName: 'TEXTAREA' } }],
    ['contentEditable', { target: { tagName: 'DIV', isContentEditable: true } }],
    ['повтор клавиши', { repeat: true }], ['Ctrl', { ctrlKey: true }], ['Meta', { metaKey: true }], ['Alt', { altKey: true }],
  ];
  const tryAll = async (when: string) => {
    for (const [name, extra] of ignored) assert.equal(s.voice.handleKey('KeyV', true, key(extra)), false, `${when}: ${name}`);
    s.hide(true); assert.equal(s.voice.handleKey('KeyV', true, key()), false, `${when}: скрытая вкладка`); s.hide(false);
    s.canTalk(false); assert.equal(s.voice.handleKey('KeyV', true, key()), false, `${when}: canTalk() = false`); s.canTalk(true);
    await settle();
  };
  await tryAll('микрофон выключен');
  assert.equal(s.captures(), 0, 'браузер о микрофоне не спрашивали');
  assert.equal(s.voice.view.mic, 'off');
  // микрофон уже включён, связь есть: те же нажатия не включают передачу
  await s.voice.enableMic(); await settle();
  s.pcs[0].set('connected');
  const track = s.streams[0].track;
  await tryAll('микрофон включён');
  assert.equal(track.enabled, false); assert.deepEqual(talkMsgs(s.sent), [], '«говорит» не объявляли');
  // обычное V — говорим: проверка выше не пустая
  assert.equal(s.voice.handleKey('KeyV', true, key({ target: { tagName: 'CANVAS' } })), true); assert.equal(track.enabled, true);
});

test('blur окна, скрытие вкладки, фокус в другом месте и запрет говорить гасят track.enabled синхронно', async () => {
  const s = setup();
  s.state(1, [{ id: 2 }]);
  await s.voice.enableMic(); await settle();
  s.pcs[0].set('connected');
  const track = s.streams[0].track;
  const cases: Array<[string, () => void]> = [
    ['blur окна', () => s.win.dispatchEvent(new Event('blur'))],
    ['visibilitychange → hidden', () => { s.hide(true); s.doc.dispatchEvent(new Event('visibilitychange')); }],
    ['фокус ушёл (focusin)', () => s.doc.dispatchEvent(new Event('focusin'))],
    // игра каждый кадр сверяет право говорить (App.syncVoiceVisibility) и зовёт stopTalking
    ['canTalk() = false: остановка от игры', () => { s.canTalk(false); s.voice.stopTalking(); }],
    // сам контроллер перепроверяет право на каждом пульсе «говорю» (600 мс) и не продлевает его
    ['canTalk() = false: пульс контроллера', () => { s.canTalk(false); s.advance(600); }],
  ];
  for (const [name, trigger] of cases) {
    s.hide(false); s.canTalk(true);
    s.voice.push(true); assert.equal(track.enabled, true, `${name}: говорим`);
    const said = talkMsgs(s.sent).length;
    trigger();
    assert.equal(track.enabled, false, `${name}: сразу тишина, без await`);
    assert.deepEqual(talkMsgs(s.sent).slice(said), [false], `${name}: серверу — «замолчал», без продления`);
  }
});

test('поздний ответ браузера на микрофон после «Слышать голос» выкл, стопа микрофона или выхода не оживляет захват', async () => {
  for (const stop of ['«Слышать голос» выкл', 'стоп микрофона', 'выход из игры'] as const) {
    const s = setup();
    s.state(1, [{ id: 2 }]);
    const late = deferred<MediaStream>(); s.gum(() => late.promise);
    const pending = s.voice.enableMic();
    assert.equal(s.voice.view.mic, 'requesting', stop);
    if (stop === '«Слышать голос» выкл') s.voice.setListen(false); else if (stop === 'стоп микрофона') s.voice.disableMic(); else s.voice.disconnected();
    const stream = new Stream(); late.resolve(stream as unknown as MediaStream); await pending; await settle();
    assert.equal(stream.track.stopped, true, `${stop}: дорожка остановлена`); assert.equal(stream.track.enabled, false, stop);
    assert.equal(s.voice.view.mic, 'off', stop);
    assert.deepEqual(micMsgs(s.sent), [], `${stop}: «микрофон включён» серверу не ушло`);
    s.voice.push(true); assert.equal(stream.track.enabled, false, `${stop}: V не включает`);
  }
});

test('смена устройства и шумоподавления: поздний поток старого поколения сразу останавливается', async () => {
  const s = setup();
  s.state(1, [{ id: 2 }]);
  await s.voice.enableMic(); await settle();
  s.pcs[0].set('connected');
  const first = s.streams[0];
  s.voice.push(true); assert.equal(first.track.enabled, true);
  const a = deferred<MediaStream>(), b = deferred<MediaStream>();
  s.gum(() => a.promise); s.voice.setDevice('mic-a');
  assert.equal(first.track.enabled, false, 'смена устройства прерывает передачу');
  s.gum(() => b.promise); s.voice.setDevice('mic-b');
  const sa = new Stream(), sb = new Stream();
  b.resolve(sb as unknown as MediaStream); await settle();
  assert.equal(first.track.stopped, true, 'прежний поток отпущен');
  a.resolve(sa as unknown as MediaStream); await settle();
  assert.equal(sa.track.stopped, true, 'поздний поток (mic-a) остановлен'); assert.equal(sa.track.enabled, false);
  assert.equal(sb.track.stopped, false); assert.equal(sb.track.enabled, false, 'новый поток молчит до нажатия');
  assert.equal(s.pcs[0].txs[0].sender.track, sb.track, 'собеседнику — дорожка нового потока');
  // шумоподавление переключают, а микрофон тут же выключили: поздний поток — стоп
  const c = deferred<MediaStream>(); s.gum(() => c.promise);
  s.voice.setNoise(false); s.voice.disableMic();
  const sc = new Stream(); c.resolve(sc as unknown as MediaStream); await settle();
  assert.equal(sc.track.stopped, true); assert.equal(sc.track.enabled, false); assert.equal(sb.track.stopped, true);
  assert.equal(s.voice.view.mic, 'off');
});

test('ошибки микрофона — человеческим текстом: имя и сообщение исключения браузера наружу не уходят', async () => {
  const leak = /private|secret|credential|snd|NotAllowed|Security|NotReadable|Abort|Overconstrained|Error/;
  const cases: Array<[string, string, RegExp]> = [
    ['NotAllowedError', 'denied', /^Доступ к микрофону запрещён/], ['SecurityError', 'denied', /^Доступ к микрофону запрещён/],
    ['NotReadableError', 'unavailable', /^Не удалось открыть микрофон/], ['AbortError', 'unavailable', /^Не удалось открыть микрофон/],
  ];
  for (const [name, mic, text] of cases) {
    const s = setup(); s.state(1, []);
    s.gum(async () => { throw Object.assign(new Error('private secret device credentials /dev/snd0'), { name }); });
    await s.voice.enableMic();
    assert.equal(s.voice.view.mic, mic, name); assert.match(s.voice.view.error, text, name);
    assert.doesNotMatch(`${s.voice.view.error} ${s.voice.view.notice}`, leak, name);
  }
  // выбранного раньше микрофона нет — берём основной, подсказка тоже без подробностей
  const prefs = defaultVoicePrefs(); prefs.device = 'gone';
  const s = setup({ prefs }); s.state(1, []);
  s.gum(async c => {
    if ((c.audio as MediaTrackConstraints).deviceId) throw Object.assign(new Error('secret device gone'), { name: 'OverconstrainedError' });
    return new Stream() as unknown as MediaStream;
  });
  await s.voice.enableMic();
  assert.equal(s.voice.view.mic, 'ready'); assert.match(s.voice.view.notice, /взят основной/); assert.doesNotMatch(s.voice.view.notice, leak);
  // проверка микрофона в меню — так же
  const check = new MicTest({ getUserMedia: async () => { throw Object.assign(new Error('private secret'), { name: 'NotAllowedError' }); }, createAudioContext: () => { throw new Error('не нужен'); } });
  const text = await check.start({ audio: true });
  assert.match(text ?? '', /^Доступ к микрофону запрещён/); assert.doesNotMatch(text ?? '', leak); assert.equal(check.running, false);
});

test('ICE до предложения копится не больше ICE_LIMIT (64) и сливается по порядку; повторное предложение не плодит transceiver и sender', async () => {
  const s = setup();
  s.state(4, [{ id: 2, mic: true }]); // у 2 микрофон, предлагает он (меньший номер)
  const pc = s.pcs[0];
  const ice = (i: number) => s.voice.onMessage({ t: 'voiceSignal', from: 2, to: 4, signal: { kind: 'ice', candidate: { candidate: `candidate:${i} 1 udp 1 10.0.0.1 ${5000 + i} typ host`, sdpMid: '0', sdpMLineIndex: 0 } } });
  for (let i = 0; i < 100; i++) ice(i);
  await settle();
  assert.equal(pc.ice.length, 0, 'до предложения кандидаты не применяются');
  const remote = new Peer();
  s.offerFrom(remote, 2, 4); await settle();
  const ids = () => pc.ice.map(c => (c as { candidate: string }).candidate.split(' ')[0]);
  assert.deepEqual(ids(), Array.from({ length: 64 }, (_, i) => `candidate:${i}`), 'первые 64, по порядку');
  ice(500); await settle(); assert.equal(ids().at(-1), 'candidate:500', 'после предложения — сразу');
  const sender = pc.txs[0].sender;
  s.offerFrom(remote, 2, 4); await settle(); // повтор той же сессии (перезапуск ICE)
  assert.equal(pc.answers, 2); assert.equal(pc.txs.length, 1); assert.equal(pc.added, 0, 'отвечающий transceiver сам не создаёт');
  assert.equal(pc.txs[0].sender, sender); assert.equal(s.pcs.length, 1);
});

test('сигналы прошлой зоны не создают соединений и не трогают новые; старое согласование молчит', async () => {
  const s = setup();
  s.state(4, [{ id: 2, mic: true }]);
  const old = s.pcs[0];
  const gate = deferred<void>(); old.hold = gate.promise;
  s.offerFrom(new Peer(), 2, 4); await settle(); // ответ на него застрял в setRemoteDescription
  s.state(9, [{ id: 12, mic: true }], 'fort'); await settle(); // в крепость: новый номер, другие люди
  assert.equal(old.closed, true);
  assert.equal(s.pcs.length, 2); const fresh = s.pcs[1];
  assert.equal(fresh.offers.length, 1, 'с новым собеседником — своё предложение');
  const before = s.signals().length;
  gate.resolve(); await settle();
  assert.equal(s.signals().length, before, 'застрявшее согласование прошлой зоны ничего не шлёт');
  const late = new Peer();
  s.voice.onMessage({ t: 'voiceSignal', from: 2, to: 4, signal: { kind: 'offer', sdp: late.sdp('offer') } });
  s.voice.onMessage({ t: 'voiceSignal', from: 2, to: 9, signal: { kind: 'offer', sdp: late.sdp('offer') } });
  s.voice.onMessage({ t: 'voiceSignal', from: 12, to: 4, signal: { kind: 'answer', sdp: late.sdp('answer') } });
  s.voice.onMessage({ t: 'voiceSignal', from: 2, to: 9, signal: { kind: 'ice', candidate: null } });
  s.voice.onMessage({ t: 'voiceSignal', from: 2, to: 9, signal: { kind: 'restart' } });
  await settle();
  assert.equal(s.pcs.length, 2, 'новых соединений нет');
  assert.equal(fresh.remoteDescription, null); assert.equal(fresh.ice.length, 0); assert.equal(fresh.closed, false); assert.equal(fresh.offers.length, 1);
  assert.equal(s.signals().length, before);
});

test('«говорит» не объявляется до живого соединения; оборвался последний маршрут — сразу тишина', async () => {
  const s = setup();
  s.state(1, [{ id: 2 }, { id: 3 }, { id: 4 }]);
  await s.voice.enableMic(); await settle();
  const [p2, p3, p4] = s.pcs; const track = s.streams[0].track;
  s.voice.push(true);
  assert.equal(track.enabled, false); assert.equal(s.voice.view.transmitting, false);
  assert.deepEqual(talkMsgs(s.sent), [], 'пока никто не соединился, «говорит» не объявляем');
  s.voice.push(false);
  p2.set('connected'); p3.set('failed');
  s.voice.push(true); assert.equal(track.enabled, true); assert.deepEqual(talkMsgs(s.sent), [true]);
  p4.set('connected'); p2.set('disconnected');
  assert.equal(track.enabled, true, 'один маршрут ещё жив — говорим');
  p4.set('disconnected');
  assert.equal(track.enabled, false, 'последний маршрут оборвался — сразу тишина'); assert.deepEqual(talkMsgs(s.sent), [true, false]);
  s.advance(600); assert.deepEqual(talkMsgs(s.sent), [true, false], 'пульс «говорю» больше не идёт');
  s.voice.push(true); assert.equal(track.enabled, false, 'и снова не включить, пока нет маршрута');
});

// ------------------------------------------------------------ затухание при отпускании V

/** Говорим через цепочку движка с одним живым соединением */
async function talking(audio: 'running' | 'suspended' = 'running') {
  const s = setup({ audio });
  s.state(1, [{ id: 2 }]);
  await s.voice.enableMic(); await settle();
  s.pcs[0].set('connected');
  const ctx = s.ctxs[0], mic = s.streams[0].track, out = ctx.dests[0].track, gain = ctx.gains[0].gain;
  return { s, ctx, mic, out, gain };
}

test('затухание: собеседнику уходит поток цепочки; свежее нажатие — пауза, пока звук дойдёт до движка, и подъём за 25 мс; движок будится нажатием', async () => {
  const { s, ctx, mic, out, gain } = await talking('suspended');
  assert.equal(s.pcs[0].txs[0].sender.track, out, 'собеседнику — поток цепочки, а не дорожка микрофона');
  assert.equal(gain.value, 0); assert.equal(out.enabled, false); assert.equal(mic.enabled, false);
  ctx.currentTime = 5;
  assert.equal(s.voice.handleKey('KeyV', true, key()), true);
  assert.equal(ctx.resumes, 1, 'нажатие V будит движок');
  assert.equal(mic.enabled, true); assert.equal(out.enabled, true);
  assert.deepEqual(gain.log.slice(-4), ['cancel@0', 'set 0@5', `set 0@${5 + VOICE_ONSET_S}`, `ramp 1@${5 + VOICE_ONSET_S + VOICE_FADE_IN_S}`], 'ноль, пока звук не дошёл, потом подъём');
  assert.equal(s.pcs[0].offers.length, 1, 'без пересогласования');
  // после хвоста нажатие снова свежее: опять пауза и подъём с нуля
  s.voice.handleKey('KeyV', false, key()); s.advance(VOICE_TAIL_MS); ctx.currentTime = 7;
  s.voice.handleKey('KeyV', true, key());
  assert.deepEqual(gain.log.slice(-4), ['cancel@0', 'set 0@7', `set 0@${7 + VOICE_ONSET_S}`, `ramp 1@${7 + VOICE_ONSET_S + VOICE_FADE_IN_S}`]);
});

test('затухание: после отпускания поток ещё идёт до конца хвоста с плавным спадом, потом тишина и «замолчал»', async () => {
  const { s, ctx, mic, out, gain } = await talking();
  s.voice.handleKey('KeyV', true, key());
  s.advance(1000); ctx.currentTime = 1;
  const pulses = talkMsgs(s.sent).length;
  s.voice.handleKey('KeyV', false, key());
  assert.deepEqual(gain.log.slice(-1), [`target 0@1/${VOICE_FADE_OUT_TAU_S}`], 'громкость плавно уходит в ноль');
  assert.equal(mic.enabled, true); assert.equal(out.enabled, true); assert.equal(s.voice.view.transmitting, true);
  s.advance(VOICE_TAIL_MS - 1);
  assert.equal(mic.enabled, true, 'хвост ещё идёт'); assert.equal(talkMsgs(s.sent).length, pulses, '«говорит» пока не сняли и не продлевали');
  s.advance(1);
  assert.equal(mic.enabled, false); assert.equal(out.enabled, false); assert.equal(gain.value, 0);
  assert.deepEqual(talkMsgs(s.sent).slice(pulses), [false]);
  assert.equal(s.voice.view.transmitting, false);
});

test('затухание: нажатие посреди хвоста отменяет его — громкость быстро обратно, та же дорожка, без пересогласования', async () => {
  const { s, ctx, mic, out, gain } = await talking();
  const sender = s.pcs[0].txs[0].sender, offers = s.pcs[0].offers.length, txs = s.pcs[0].txs.length;
  s.voice.handleKey('KeyV', true, key()); s.voice.handleKey('KeyV', false, key());
  s.advance(100); ctx.currentTime = 0.1; gain.value = 0.11; // движок успел приглушить
  s.voice.handleKey('KeyV', true, key());
  assert.deepEqual(gain.log.slice(-3), ['cancel@0.1', 'set 0.11@0.1', `ramp 1@${0.1 + VOICE_FADE_IN_S}`], 'с текущей громкости — без щелчка');
  s.advance(5000);
  assert.equal(mic.enabled, true, 'хвост отменён'); assert.equal(out.enabled, true);
  assert.equal(talkMsgs(s.sent).filter(on => !on).length, 0, '«замолчал» не посылали');
  assert.equal(sender.track, out); assert.equal(s.pcs[0].offers.length, offers); assert.equal(s.pcs[0].txs.length, txs); assert.equal(s.pcs[0].added, 1);
});

test('затухание: blur, скрытая вкладка, запрет говорить, выключение голоса или микрофона, смена зоны, обрыв и dispose посреди хвоста режут сразу', async () => {
  const cuts: Array<[string, (t: Awaited<ReturnType<typeof talking>>) => void]> = [
    ['blur окна', ({ s }) => s.win.dispatchEvent(new Event('blur'))],
    ['скрытая вкладка', ({ s }) => { s.hide(true); s.doc.dispatchEvent(new Event('visibilitychange')); }],
    ['запрет говорить (игра)', ({ s }) => { s.canTalk(false); s.voice.stopTalking(); }],
    ['«Слышать голос» выкл', ({ s }) => s.voice.setListen(false)],
    ['микрофон выкл', ({ s }) => s.voice.disableMic()],
    ['смена зоны', ({ s }) => s.state(9, [{ id: 12 }], 'fort')],
    ['смена комнаты', ({ s }) => s.voice.roomChanged()],
    ['обрыв связи с сервером', ({ s }) => s.voice.linkDown()],
    ['выход из игры', ({ s }) => s.voice.disconnected()],
    ['dispose', ({ s }) => s.voice.dispose()],
  ];
  for (const [name, cut] of cuts) {
    const t = await talking();
    const { s, mic, out, gain } = t;
    s.voice.handleKey('KeyV', true, key()); s.voice.handleKey('KeyV', false, key());
    s.advance(50);
    assert.equal(mic.enabled, true, `${name}: хвост идёт`);
    cut(t);
    assert.equal(mic.enabled, false, `${name}: микрофон сразу`); assert.equal(out.enabled, false, `${name}: поток сразу`);
    assert.equal(gain.value, 0, `${name}: громкость — ноль сразу`);
    assert.deepEqual(talkMsgs(s.sent), [true, false], `${name}: «замолчал» один раз, сразу`);
    s.advance(VOICE_TAIL_MS * 2);
    assert.equal(mic.enabled, false, name); assert.deepEqual(talkMsgs(s.sent), [true, false], `${name}: хвост не доигрывает`);
  }
});

test('затухание: без звукового движка или если он не проснулся — хвост 150 мс без затухания, ничего не ломается', async () => {
  for (const audio of ['broken', 'suspended'] as const) {
    const s = setup({ audio });
    s.state(1, [{ id: 2 }]);
    await s.voice.enableMic(); await settle();
    s.pcs[0].set('connected');
    const mic = s.streams[0].track;
    if (audio === 'suspended') s.ctxs[0].failResume = true;
    s.voice.handleKey('KeyV', true, key()); await settle();
    assert.equal(s.pcs[0].txs[0].sender.track, mic, `${audio}: собеседнику — дорожка микрофона напрямую`);
    assert.equal(mic.enabled, true, audio);
    s.voice.handleKey('KeyV', false, key());
    s.advance(VOICE_TAIL_PLAIN_MS - 1); assert.equal(mic.enabled, true, `${audio}: хвост`);
    s.advance(1); assert.equal(mic.enabled, false, audio);
    s.voice.handleKey('KeyV', true, key()); s.win.dispatchEvent(new Event('blur')); assert.equal(mic.enabled, false, `${audio}: blur — сразу`);
  }
});

test('затухание: смена устройства — поток цепочки тот же у собеседника, поздний поток старого поколения остановлен', async () => {
  const { s, ctx, out } = await talking();
  s.voice.handleKey('KeyV', true, key());
  const a = deferred<MediaStream>(), b = deferred<MediaStream>();
  s.gum(() => a.promise); s.voice.setDevice('mic-a');
  s.gum(() => b.promise); s.voice.setDevice('mic-b');
  const sa = new Stream(), sb = new Stream();
  b.resolve(sb as unknown as MediaStream); await settle();
  a.resolve(sa as unknown as MediaStream); await settle();
  assert.equal(sa.track.stopped, true); assert.equal(sa.track.enabled, false);
  const fresh = ctx.dests.at(-1)!.track;
  assert.equal(s.pcs[0].txs[0].sender.track, fresh); assert.equal(fresh.enabled, false, 'новый поток молчит до нажатия');
  assert.equal(out.stopped, true, 'прежний поток цепочки остановлен');
  s.voice.dispose(); assert.equal(ctx.closed, true, 'dispose закрывает движок');
});

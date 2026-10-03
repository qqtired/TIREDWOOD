// Голос (WebRTC). После входа — сразу в канале своей зоны и слушаем, без микрофона и без вопросов браузера.
// V — говорить: в первый раз браузер спросит микрофон. Соединение между двумя людьми поднимается, только если
// микрофон включён хотя бы у одного из них: слушатели между собой не соединяются. Связь с человеком пропала —
// сами перезапускаем ICE (и, если не помогло, соединение целиком), без кнопок. Звук каждого — свой <audio>:
// так работает эхоподавление браузера. Обрыв игровой связи голос не рвёт (linkDown/linkUp).
import { voiceCanTransmit, VOICE_BITRATE, VOICE_MAX_PEERS, type VoiceClientMsg, type VoiceLinkState, type VoicePeer, type VoicePerson,
  type VoiceServerMsg, type VoiceSignal, type VoiceView } from '../shared/voice.ts';
import { peerPref, setPeerPref, type VoicePrefs } from './voice-prefs.ts';

type Config = Extract<VoiceServerMsg, { t: 'voiceConfig' }>;
type StateMsg = Extract<VoiceServerMsg, { t: 'voiceState' }>;
type SignalMsg = Extract<VoiceServerMsg, { t: 'voiceSignal' }>;
type Timer = ReturnType<typeof setTimeout> | number;
export type MicPermission = 'granted' | 'denied' | 'prompt' | 'unknown';
export interface VoiceDependencies {
  supported(): boolean;
  createPeerConnection(config: RTCConfiguration): RTCPeerConnection;
  createAudioElement(): HTMLAudioElement;
  /** Звуковой движок для цепочки отправки (затухание); null — без него, просто короткий хвост */
  createAudioContext(): AudioContext | null;
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  createMediaStream(tracks: MediaStreamTrack[]): MediaStream;
  audioCapabilities(): RTCRtpCapabilities | null;
  micPermission(): Promise<MicPermission>;
  now(): number;
  setTimer(fn: () => void, ms: number): Timer;
  clearTimer(timer: Timer): void;
  window: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> | null;
  document: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> | null;
  hidden(): boolean;
}
interface Options {
  send(message: VoiceClientMsg): void;
  canTalk(): boolean;
  onChange(view: VoiceView): void;
  prefs: VoicePrefs;
  savePrefs(prefs: VoicePrefs): void;
}
interface Peer {
  info: VoicePeer; pc: RTCPeerConnection; sender: RTCRtpSender | null; offerer: boolean;
  chain: Promise<void>; pending: number; ice: Array<RTCIceCandidateInit | null>; remoteReady: boolean;
  timer: Timer | null; restarts: number; askedAt: number; closed: boolean; audio?: HTMLAudioElement;
  /** Номер сессии из строки o= последнего предложения: сменился — собеседник начал соединение с нуля */
  remoteSession: string;
  localIce: number; remoteIce: number; descriptionsSent: number; descriptionsReceived: number; iceErrors: number;
}
export interface VoiceDebug {
  enabled: boolean; joined: boolean; self: number | null; zone: string; mic: VoiceView['mic']; transmitting: boolean; playbackBlocked: boolean;
  /** Что уходит собеседникам: webaudio — через цепочку с затуханием; track — дорожка микрофона напрямую */
  send: 'webaudio' | 'track'; engine: string; gain: number | null; tail: boolean;
  peers: Array<{ id: number; pid: number; connection: string; ice: string; gathering: string; signaling: string; offerer: boolean; restarts: number; localIce: number; remoteIce: number; descriptionsSent: number; descriptionsReceived: number; iceErrors: number; route: string; bytesSent: number; bytesReceived: number; audioEnergy: number; samplesReceived: number; codecs: string[]; dtx: boolean;
    /** Звук собеседника: none — дорожки ещё нет, playing — играет, paused — браузер не дал включить */
    audio: 'none' | 'playing' | 'paused'; muted: boolean }>;
}
const defaults: VoiceDependencies = {
  supported: () => typeof RTCPeerConnection !== 'undefined' && typeof Audio !== 'undefined',
  createPeerConnection: config => new RTCPeerConnection(config),
  createAudioElement: () => { const a = new Audio(); a.autoplay = true; return a; },
  createAudioContext: () => typeof AudioContext === 'undefined' ? null : new AudioContext({ latencyHint: 'interactive' }),
  getUserMedia: constraints => navigator.mediaDevices.getUserMedia(constraints), createMediaStream: tracks => new MediaStream(tracks),
  audioCapabilities: () => typeof RTCRtpReceiver === 'undefined' ? null : RTCRtpReceiver.getCapabilities('audio'),
  micPermission: async () => {
    try { const s = await navigator.permissions?.query({ name: 'microphone' as PermissionName }); return (s?.state as MicPermission | undefined) ?? 'unknown'; }
    catch { return 'unknown'; }
  },
  now: () => Date.now(), setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: timer => clearTimeout(timer),
  window: typeof window === 'undefined' ? null : window, document: typeof document === 'undefined' ? null : document,
  hidden: () => typeof document !== 'undefined' && document.hidden,
};
const ICE_LIMIT = 64;
/**
 * Отпустили V — передача идёт ещё столько, громкость отправки плавно уходит в ноль: последний слог не обрезается.
 * Без звукового движка — короткий хвост без затухания. Хвост только у добровольного отпускания: blur, скрытая
 * вкладка, запрет говорить, выключение голоса или микрофона, смена зоны, обрыв — тишина сразу (stopTalking).
 */
export const VOICE_TAIL_MS = 230;
export const VOICE_TAIL_PLAIN_MS = 150;
/** Затухание — экспонента: за ~190 мс тише на 36 дБ; подъём при нажатии — 25 мс, без щелчка */
export const VOICE_FADE_OUT_TAU_S = 0.045;
export const VOICE_FADE_IN_S = 0.025;
/**
 * Свежее нажатие: звук только что включённой дорожки микрофона доходит до движка не сразу (в Chrome замерено 0–21 мс).
 * Подъём начинаем после этой паузы — иначе звук входит уже на половине громкости, скачком (щелчок).
 */
export const VOICE_ONSET_S = 0.04;
/** Новое соединение: столько ждём «connected», потом ICE restart */
const CONNECT_GRACE = 15_000;
/** «disconnected» часто проходит само (короткий провал сети) — ждём, потом ICE restart */
const DISCONNECT_GRACE = 3_000;
const RETRY_MAX = 30_000;
/** После стольких перезапусков ICE подряд — соединение с нуля */
const REBUILD_AFTER = 3;
const JOIN_RETRY = [3_000, 6_000, 12_000, 20_000];
const NOTICE_MS = 4_000;
const MIC_ERRORS = ['Доступ к микрофону запрещён', 'Не удалось открыть микрофон', 'Микрофон недоступен', 'Микрофон отключился'];
/** Цепочка отправки: микрофон (уже с эхо- и шумоподавлением браузера) → громкость → поток, который уходит собеседникам */
interface SendChain { ctx: AudioContext; source: MediaStreamAudioSourceNode; gain: GainNode; track: MediaStreamTrack }
function typing(target: EventTarget | null | undefined) {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'file', 'image'].includes((el as HTMLInputElement).type)));
}
/**
 * Где V — голос: везде в игре — в меню Esc, настройках, окнах, на паузе. Нельзя одно: набор текста (фокус в поле
 * ввода, открыт чат) — там V просто буква. Плюс технические паузы: экран загрузки и восстановление связи.
 */
export function voiceInputAllowed(s: { inGame: boolean; loading: boolean; chatOpen: boolean; focused: EventTarget | null }): boolean {
  return s.inGame && !s.loading && !s.chatOpen && !typing(s.focused);
}
/**
 * Opus DTX в отправляемом описании: при отпущенной V дорожка молчит, и с DTX тишина почти не занимает канал (пакет
 * раз в 400 мс вместо 50 в секунду) — важно, когда к говорящему подключена вся зона. Параметр читает кодер собеседника.
 */
export function withDtx(sdp: string): string {
  const pt = /a=rtpmap:(\d+) opus\/48000/i.exec(sdp)?.[1];
  if (!pt) return sdp;
  const fmtp = new RegExp(`^a=fmtp:${pt} ([^\\r\\n]*)`, 'm');
  const m = fmtp.exec(sdp);
  if (m) return /(^|;)\s*usedtx=/.test(m[1]) ? sdp : sdp.replace(fmtp, `a=fmtp:${pt} ${m[1]};usedtx=1`);
  return sdp.replace(new RegExp(`^(a=rtpmap:${pt} opus/48000[^\\r\\n]*)`, 'mi'), `$1\r\na=fmtp:${pt} usedtx=1`);
}
const sessionOf = (sdp: string): string => /^o=\S+ (\d+)/m.exec(sdp)?.[1] ?? '';

/** Передача — только синхронным track.enabled; захват микрофона — по явному действию (V или кнопка). */
export class VoiceController {
  private readonly opts: Options;
  private readonly deps: VoiceDependencies;
  private readonly prefs: VoicePrefs;
  private readonly listeners = new Set<(view: VoiceView) => void>();
  private config: Config | null = null;
  private disposed = false;
  private self: number | null = null;
  private room = '';
  private zone = '';
  private mic: VoiceView['mic'] = 'off';
  /** Включал микрофон в этой вкладке: после нового входа включим сами, если разрешение уже дано */
  private micWanted = false;
  private micAnnounced = false;
  private restoring = false;
  private error = '';
  private notice = '';
  private noticeTimer: Timer | null = null;
  private playbackBlocked = false;
  private gestureArmed = false;
  private held = false;
  private gameMuted = false;
  private linkIsDown = false;
  private stream: MediaStream | null = null;
  private audio: AudioContext | null = null;
  /** Движок не создался или не проснулся — дальше без него */
  private audioBroken = false;
  private chain: SendChain | null = null;
  /** Хвост после отпускания V: таймер до тишины */
  private tail: Timer | null = null;
  private peers = new Map<number, Peer>();
  private presence: VoicePeer[] = [];
  private joining = false;
  private joinTimer: Timer | null = null;
  private joinTries = 0;
  private generation = 0;
  private micGeneration = 0;
  private pulse: Timer | null = null;
  private refresh: Timer | null = null;
  private readonly blur = () => this.stopTalking();
  private readonly visibility = () => { if (this.deps.hidden()) this.stopTalking(); };
  // Фокус ушёл в поле ввода (чат, ник, сумма ставки) — там V буква: тишина сразу. Окна и кнопки фокус тоже забирают,
  // но говорить там можно: отпускание V игра ловит на window в фазе захвата, его не проглотит ни одно окно.
  private readonly focus = (event: Event) => { if (typing(event.target)) this.stopTalking(); };
  private readonly gesture = () => { void this.unblock(); };

  constructor(opts: Options, dependencies: Partial<VoiceDependencies> = {}) {
    this.opts = opts; this.deps = { ...defaults, ...dependencies }; this.prefs = opts.prefs;
    this.deps.window?.addEventListener('blur', this.blur);
    this.deps.document?.addEventListener('visibilitychange', this.visibility);
    this.deps.document?.addEventListener('focusin', this.focus);
  }
  /** В канале: голос на сервере есть, браузер умеет, «Слышать голос» включено */
  private get on(): boolean { return !this.disposed && !!this.config && this.deps.supported() && this.prefs.listen; }
  get view(): VoiceView {
    const people = this.presence.map(p => this.person(p));
    return { available: !!this.config && this.deps.supported() && !this.disposed, enabled: this.on, joined: this.self !== null, room: this.room, zone: this.zone,
      mic: this.mic, playbackBlocked: this.playbackBlocked, transmitting: !!this.stream?.getAudioTracks().some(t => t.enabled), receiving: this.on,
      gameMuted: this.gameMuted, volume: this.prefs.volume, mode: this.prefs.mode, noise: this.prefs.noise, device: this.prefs.device, linkDown: this.linkIsDown,
      maxPeers: this.config?.maxPeers ?? VOICE_MAX_PEERS, error: this.error, notice: this.notice,
      presence: this.presence.map(p => ({ ...p })), people, peers: people.filter(p => p.link !== 'none') };
  }
  private person(p: VoicePeer): VoicePerson {
    const pref = peerPref(this.prefs, p.pid), peer = this.peers.get(p.id);
    return { ...p, muted: pref.muted, volume: pref.volume, link: peer ? this.linkOf(peer) : 'none' };
  }
  private linkOf(peer: Peer): VoiceLinkState {
    const s = peer.pc.connectionState;
    return s === 'connected' ? 'connected' : s === 'failed' || peer.restarts >= REBUILD_AFTER ? 'failed' : 'connecting';
  }
  subscribe(fn: (view: VoiceView) => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private changed() {
    const view = this.view;
    try { this.opts.onChange(view); } catch { /* UI exceptions never expose signaling data. */ }
    for (const fn of this.listeners) { try { fn(view); } catch { /* одна панель не ломает другие */ } }
  }
  private send(message: VoiceClientMsg) { try { this.opts.send(message); } catch { /* связь с сервером вернётся — состояние придёт заново */ } }
  private save() { try { this.opts.savePrefs(this.prefs); } catch { /* ничего */ } }
  private flash(text: string) {
    this.notice = text;
    if (this.noticeTimer !== null) this.deps.clearTimer(this.noticeTimer);
    this.noticeTimer = text ? this.deps.setTimer(() => { this.noticeTimer = null; this.notice = ''; this.changed(); }, NOTICE_MS) : null;
    this.changed();
  }
  private inputEligible() { try { return !this.disposed && !this.deps.hidden() && this.opts.canTalk(); } catch { return false; } }
  private eligible() { return !this.linkIsDown && voiceCanTransmit(this.view) && this.inputEligible(); }
  private rtcConfig(): RTCConfiguration {
    return { iceServers: this.config?.iceServers ?? [], iceTransportPolicy: this.config?.relayOnly ? 'relay' : 'all', bundlePolicy: 'max-bundle', rtcpMuxPolicy: 'require' };
  }

  // ------------------------------------------------------------ канал

  private join() {
    if (!this.on || this.self !== null || this.joining) return;
    this.joining = true;
    this.send({ t: 'voice', a: 'join' });
    this.clearJoin();
    const wait = JOIN_RETRY[Math.min(this.joinTries++, JOIN_RETRY.length - 1)];
    this.joinTimer = this.deps.setTimer(() => { this.joinTimer = null; this.joining = false; if (!this.linkIsDown) this.join(); }, wait);
  }
  private clearJoin() { if (this.joinTimer !== null) this.deps.clearTimer(this.joinTimer); this.joinTimer = null; }
  /** «Слышать голос» (настройка): включено — в канал без микрофона; выключено — из канала, микрофон отпускаем. */
  setListen(on: boolean): void {
    if (this.prefs.listen === on) return;
    this.prefs.listen = on; this.save();
    if (on) { this.join(); this.changed(); return; }
    const was = this.self !== null;
    this.stopTalking(); this.micWanted = false; this.stopMic(); this.generation++; this.clearPeers();
    this.self = null; this.micAnnounced = false; this.joining = false; this.clearJoin(); this.joinTries = 0;
    if (was) this.send({ t: 'voice', a: 'leave' });
    this.changed();
  }
  /** Совместимость: прежние «Включить/Выйти из голоса» */
  enable(): Promise<void> { this.setListen(true); return Promise.resolve(); }
  disable(): void { this.setListen(false); }
  setReceiving(on: boolean): void { this.setListen(on); }
  /** Полностью заново войти в голос (кнопка «Переподключить голос» на крайний случай). */
  rejoin(): void {
    if (!this.on) return;
    const was = this.self !== null;
    this.stopTalking(); this.generation++; this.clearPeers(); this.self = null; this.micAnnounced = false; this.joining = false; this.joinTries = 0;
    if (was) this.send({ t: 'voice', a: 'leave' });
    this.join(); this.changed();
  }

  onMessage(message: VoiceServerMsg): void {
    if (this.disposed) return;
    if (message.t === 'voiceConfig') {
      this.config = message;
      for (const peer of this.peers.values()) { try { peer.pc.setConfiguration(this.rtcConfig()); } catch { /* старые адреса TURN — до restart */ } }
      this.scheduleRefresh();
      if (this.self === null) this.join();
      this.changed(); return;
    }
    if (message.t === 'voiceError') { this.onError(message.code); return; }
    if (message.t === 'voiceState') { this.onState(message); return; }
    this.onSignal(message);
  }
  private onError(code: Extract<VoiceServerMsg, { t: 'voiceError' }>['code']) {
    if (code === 'disabled') { this.teardown(); this.config = null; this.error = 'Голос на сервере выключен.'; this.changed(); return; }
    if (code === 'not_joined') {
      // сервер считает нас вне голоса — заходим заново, без кнопок
      this.stopTalking(); this.generation++; this.clearPeers(); this.self = null; this.micAnnounced = false; this.joining = false;
      this.join(); this.changed(); return;
    }
    // stale — сигнал ушедшему; invalid — сорвалось согласование: следующий voiceState и перезапуск всё поправят
    this.stopTalking();
    if (code === 'rate_limit') this.flash('Слишком много голосовых запросов — чуть подождём.');
  }
  private onState(m: StateMsg) {
    this.presence = m.peers.map(p => ({ ...p })); this.room = m.room; this.zone = typeof m.zone === 'string' ? m.zone : '';
    if (!this.on) { if (this.peers.size) this.clearPeers(); this.self = null; this.changed(); return; }
    if (m.self !== this.self) {
      // новая зона (или новый номер): соединения прежней зоны — в прошлое
      this.stopTalking(); this.generation++; this.clearPeers(); this.self = m.self; this.micAnnounced = false;
    }
    if (this.self !== null) {
      this.joining = false; this.clearJoin(); this.joinTries = 0;
      // сначала сказать серверу про микрофон, потом предлагать соединения: собеседник узнает о нём раньше предложения
      if (this.mic === 'ready' && !this.micAnnounced) this.announceMic(true);
      else if (this.micWanted && this.mic === 'off') void this.restoreMic();
    } else this.join();
    this.syncPeers();
    this.changed();
  }
  private announceMic(on: boolean) { this.micAnnounced = on; this.send({ t: 'voice', a: 'mic', on }); }
  /** Соединение нужно, только если микрофон есть хотя бы у одного из двоих. */
  private wants(info: VoicePeer): boolean { return this.mic === 'ready' || info.mic; }
  private syncPeers() {
    if (this.self === null || !this.on) { this.clearPeers(); return; }
    const members = new Map(this.presence.map(p => [p.id, p]));
    for (const [id, peer] of this.peers) {
      const info = members.get(id);
      if (!info || !this.wants(info)) this.dropPeer(peer);
      else peer.info = { ...info };
    }
    for (const info of this.presence) if (this.wants(info) && !this.peers.has(info.id)) this.addPeer(info);
    for (const peer of this.peers.values()) this.applyAudio(peer);
  }

  // ------------------------------------------------------------ сигналы и соединения

  private onSignal(message: SignalMsg) {
    if (!this.on || this.self === null || message.to !== this.self || message.from === this.self) return;
    const signal = message.signal;
    let found = this.peers.get(message.from);
    if (!found) {
      // предложение от участника, о чьём микрофоне мы ещё не знаем: он включил его — соединяемся
      const info = this.presence.find(p => p.id === message.from);
      if (!info || signal.kind !== 'offer' || this.self < info.id) return;
      info.mic = true; this.addPeer(info); found = this.peers.get(message.from);
      if (!found) return;
    }
    const peer = found;
    if (peer.closed) return;
    if (signal.kind === 'restart') { if (peer.offerer) this.restart(peer); return; }
    if (signal.kind === 'ice') {
      if (signal.candidate?.candidate) peer.remoteIce++;
      if (!peer.remoteReady) { if (peer.ice.length < ICE_LIMIT) peer.ice.push(signal.candidate); return; }
      this.enqueue(peer, () => this.addIce(peer, signal.candidate));
      return;
    }
    peer.descriptionsReceived++;
    if (signal.kind === 'offer') {
      if (peer.offerer) return; // предлагает всегда меньший номер: встречных предложений не бывает
      const session = sessionOf(signal.sdp);
      if (peer.remoteSession && session && session !== peer.remoteSession) { this.rebuild(peer, message); return; }
      peer.remoteSession = session;
      this.enqueue(peer, valid => this.answer(peer, signal.sdp, message, valid));
      return;
    }
    if (!peer.offerer) return;
    // ответ из новой сессии: собеседник пересоздал соединение — и мы с нуля, новым предложением
    const session = sessionOf(signal.sdp);
    if (peer.remoteSession && session && session !== peer.remoteSession) { const info = peer.info; this.dropPeer(peer); this.addPeer(info); this.changed(); return; }
    peer.remoteSession = session;
    this.enqueue(peer, async valid => {
      if (peer.pc.signalingState !== 'have-local-offer') return; // ответ на устаревшее предложение
      await peer.pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp }); if (!valid()) return;
      peer.remoteReady = true;
      await this.drainIce(peer, valid); if (!valid()) return;
      await this.bitrate(peer);
    });
  }
  private async answer(peer: Peer, sdp: string, message: SignalMsg, valid: () => boolean) {
    try { await peer.pc.setRemoteDescription({ type: 'offer', sdp }); }
    catch (err) {
      if (!valid() || !peer.remoteReady) throw err;
      this.rebuild(peer, message);
      return;
    }
    if (!valid()) return;
    peer.remoteReady = true;
    await this.drainIce(peer, valid); if (!valid()) return;
    if (!peer.sender) {
      // The remote offer creates/associates its own transceiver. A pre-created answerer
      // transceiver can remain unassociated and silently send on the wrong m-line.
      const tx = peer.pc.getTransceivers().find(t => t.mid !== null && t.receiver.track.kind === 'audio');
      if (!tx) throw new Error('Missing audio transceiver');
      this.configureTransceiver(tx); peer.sender = tx.sender;
    }
    await this.replaceMic(peer, valid); if (!valid()) return;
    const answer = await peer.pc.createAnswer(); if (!valid()) return;
    await peer.pc.setLocalDescription(answer); if (!valid()) return;
    this.signal(peer, { kind: 'answer', sdp: withDtx(peer.pc.localDescription?.sdp ?? answer.sdp ?? '') });
    await this.bitrate(peer);
  }
  /** Предлагающий начал соединение с нуля (новая сессия, новый отпечаток DTLS) — и мы с нуля; предложение — новому. */
  private rebuild(peer: Peer, message: SignalMsg) {
    const info = peer.info; this.dropPeer(peer); this.addPeer(info);
    const fresh = this.peers.get(info.id);
    if (fresh && fresh !== peer) this.onSignal(message);
  }
  private async addIce(peer: Peer, candidate: RTCIceCandidateInit | null) {
    // кандидаты прошлого поколения ICE после перезапуска отвергаются — это не беда
    try { await peer.pc.addIceCandidate(candidate ?? undefined); } catch { peer.iceErrors++; }
  }
  private async drainIce(peer: Peer, valid: () => boolean) {
    for (const candidate of peer.ice.splice(0)) { await this.addIce(peer, candidate); if (!valid()) return; }
  }
  private addPeer(info: VoicePeer): void {
    if (this.self === null) return;
    let pc: RTCPeerConnection;
    try { pc = this.deps.createPeerConnection(this.rtcConfig()); } catch { this.flash('Браузер не смог открыть голосовое соединение.'); return; }
    const offerer = this.self < info.id;
    const peer: Peer = { info: { ...info }, pc, sender: null, offerer, chain: Promise.resolve(), pending: 0, ice: [], remoteReady: false, timer: null,
      restarts: 0, askedAt: -Infinity, closed: false, remoteSession: '', localIce: 0, remoteIce: 0, descriptionsSent: 0, descriptionsReceived: 0, iceErrors: 0 };
    try {
      if (offerer) { const tx = pc.addTransceiver('audio', { direction: 'sendrecv' }); this.configureTransceiver(tx); peer.sender = tx.sender; }
      this.peers.set(info.id, peer);
      pc.onicecandidate = event => {
        if (!this.current(peer)) return;
        const c = event.candidate; if (c?.candidate) peer.localIce++;
        this.signal(peer, { kind: 'ice', candidate: c ? { candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex, ...(c.usernameFragment ? { usernameFragment: c.usernameFragment } : {}) } : null });
      };
      pc.onicecandidateerror = () => { if (this.current(peer)) peer.iceErrors++; };
      pc.onconnectionstatechange = () => { if (this.current(peer)) this.onLink(peer); };
      pc.ontrack = event => { if (this.current(peer)) this.receive(peer, event.streams[0] ?? this.deps.createMediaStream([event.track])); };
      this.attachMic(peer);
      this.arm(peer, CONNECT_GRACE);
      if (offerer) this.negotiate(peer, false);
    } catch { this.dropPeer(peer); }
  }
  private negotiate(peer: Peer, iceRestart: boolean) {
    this.enqueue(peer, async valid => {
      const pc = peer.pc;
      if (pc.signalingState === 'have-local-offer') {
        // прошлое предложение осталось без ответа — откатываем и предлагаем заново
        await pc.setLocalDescription({ type: 'rollback' }); if (!valid()) return;
      } else if (pc.signalingState !== 'stable') return;
      const offer = await pc.createOffer(iceRestart ? { iceRestart: true } : {}); if (!valid()) return;
      await pc.setLocalDescription(offer); if (!valid()) return;
      this.signal(peer, { kind: 'offer', sdp: withDtx(pc.localDescription?.sdp ?? offer.sdp ?? '') });
      await this.bitrate(peer);
    });
  }
  private onLink(peer: Peer) {
    const s = peer.pc.connectionState;
    if (s === 'connected') { this.clearTimer(peer); peer.restarts = 0; }
    else if (s === 'disconnected') this.arm(peer, DISCONNECT_GRACE, true);
    else if (s === 'failed') this.restart(peer);
    if (!this.reachable()) this.stopTalking();
    this.changed();
  }
  /** Есть кому говорить: нет соединений вовсе или хотя бы одно живое. */
  private reachable() { return this.peers.size === 0 || [...this.peers.values()].some(p => p.pc.connectionState === 'connected'); }
  /** Связь не поднялась или пропала: предлагающий перезапускает ICE, отвечающий просит его об этом; паузы растут. */
  private restart(peer: Peer) {
    if (!this.current(peer)) return;
    this.clearTimer(peer);
    peer.restarts++;
    if (peer.offerer) {
      if (peer.restarts > REBUILD_AFTER) { const info = peer.info; this.dropPeer(peer); this.addPeer(info); this.changed(); return; }
      this.negotiate(peer, true);
    } else {
      const now = this.deps.now();
      if (now - peer.askedAt > 2000) { peer.askedAt = now; this.signal(peer, { kind: 'restart' }); }
    }
    this.arm(peer, Math.min(RETRY_MAX, 5000 * 2 ** (peer.restarts - 1)));
    this.changed();
  }
  private arm(peer: Peer, ms: number, keep = false) {
    if (peer.timer !== null) { if (keep) return; this.deps.clearTimer(peer.timer); }
    peer.timer = this.deps.setTimer(() => { peer.timer = null; if (this.current(peer) && peer.pc.connectionState !== 'connected') this.restart(peer); }, ms);
  }
  private clearTimer(peer: Peer) { if (peer.timer !== null) this.deps.clearTimer(peer.timer); peer.timer = null; }
  private current(peer: Peer) { return this.on && !peer.closed && this.peers.get(peer.info.id) === peer && this.self !== null; }
  private signal(peer: Peer, signal: VoiceSignal) {
    if (!this.current(peer)) return;
    if (signal.kind === 'offer' || signal.kind === 'answer') peer.descriptionsSent++;
    this.send({ t: 'voiceSignal', self: this.self!, to: peer.info.id, signal });
  }
  private enqueue(peer: Peer, operation: (valid: () => boolean) => Promise<void>) {
    if (peer.pending >= 80 || !this.current(peer)) return;
    const generation = this.generation; peer.pending++;
    const valid = () => generation === this.generation && this.current(peer);
    peer.chain = peer.chain.then(async () => { if (valid()) await operation(valid); })
      // сорвалось согласование — не беда: через пару секунд перезапуск
      .catch(() => { if (valid()) this.arm(peer, 2000); })
      .finally(() => { peer.pending--; });
  }
  private attachMic(peer: Peer) { this.enqueue(peer, valid => this.replaceMic(peer, valid)); }
  private configureTransceiver(tx: RTCRtpTransceiver) {
    tx.direction = 'sendrecv';
    try { const caps = this.deps.audioCapabilities(); const opus = caps?.codecs.filter(c => c.mimeType.toLowerCase() === 'audio/opus'); if (opus?.length) tx.setCodecPreferences(opus); } catch { /* Native default audio codec remains usable. */ }
  }
  private async replaceMic(peer: Peer, valid: () => boolean) {
    const sender = peer.sender; if (!sender) return;
    // Read current track at execution, not enqueue time. A detached/closed generation never attaches.
    const track = this.sendTrack();
    await sender.replaceTrack(track);
    if (!valid()) return;
    const current = this.sendTrack();
    if (track !== current) await sender.replaceTrack(current);
    if (valid()) await this.bitrate(peer);
  }
  private async bitrate(peer: Peer) {
    if (!peer.sender) return;
    try { const p = peer.sender.getParameters(); if (!p.encodings?.length) p.encodings = [{}]; for (const e of p.encodings) e.maxBitrate = VOICE_BITRATE; await peer.sender.setParameters(p); } catch { /* Some browsers cannot set parameters before negotiation. */ }
  }
  private dropPeer(peer: Peer) { this.closePeer(peer); if (this.peers.get(peer.info.id) === peer) this.peers.delete(peer.info.id); }
  private closePeer(peer: Peer) {
    this.clearTimer(peer); peer.closed = true; peer.ice.length = 0;
    peer.pc.onicecandidateerror = null; peer.pc.ontrack = null; peer.pc.onicecandidate = null; peer.pc.onconnectionstatechange = null;
    this.releaseAudio(peer);
    try { peer.pc.close(); } catch { /* уже закрыто */ }
  }
  private clearPeers() { for (const peer of this.peers.values()) this.closePeer(peer); this.peers.clear(); }

  // ------------------------------------------------------------ звук

  private receive(peer: Peer, stream: MediaStream) {
    this.releaseAudio(peer);
    const el = this.deps.createAudioElement();
    el.autoplay = true; el.srcObject = stream; peer.audio = el;
    this.applyAudio(peer);
    void this.play(peer, el);
    this.changed();
  }
  private applyAudio(peer: Peer) {
    const el = peer.audio; if (!el) return;
    const pref = peerPref(this.prefs, peer.info.pid);
    el.muted = pref.muted || this.gameMuted;
    el.volume = Math.max(0, Math.min(1, this.prefs.volume * pref.volume));
  }
  private async play(peer: Peer, el: HTMLAudioElement) {
    try { await el.play(); }
    catch { if (this.current(peer) && peer.audio === el) this.blockPlayback(); }
  }
  /** Браузер не дал включить звук без жеста: первый же клик или клавиша — пробуем снова. */
  private blockPlayback() {
    if (!this.gestureArmed) { this.gestureArmed = true; for (const type of ['pointerdown', 'keydown']) this.deps.window?.addEventListener(type, this.gesture, true); }
    if (!this.playbackBlocked) { this.playbackBlocked = true; this.changed(); }
  }
  private disarmGesture() {
    if (!this.gestureArmed) return;
    this.gestureArmed = false; for (const type of ['pointerdown', 'keydown']) this.deps.window?.removeEventListener(type, this.gesture, true);
  }
  /** Внутри жеста пользователя: снова запустить звук собеседников. */
  async unblock(): Promise<void> {
    if (!this.playbackBlocked) return;
    const results = await Promise.all([...this.peers.values()].map(p => p.audio ? p.audio.play().then(() => true, () => false) : Promise.resolve(true)));
    if (this.playbackBlocked && results.every(Boolean)) { this.playbackBlocked = false; this.disarmGesture(); this.changed(); }
  }
  private releaseAudio(peer: Peer) {
    const el = peer.audio; peer.audio = undefined;
    if (el) { try { el.pause(); } catch { /* ничего */ } el.srcObject = null; }
  }
  setVolume(value: number) { if (!Number.isFinite(value)) return; this.prefs.volume = Math.max(0, Math.min(1, value)); this.save(); for (const p of this.peers.values()) this.applyAudio(p); this.changed(); }
  setGameMuted(on: boolean) { this.gameMuted = on; for (const p of this.peers.values()) this.applyAudio(p); this.changed(); }
  /** Заглушить человека — по профилю: переживает переходы между комнатами и перезагрузку страницы. */
  setPeerMuted(pid: number, muted: boolean) { setPeerPref(this.prefs, pid, { muted }); this.save(); this.applyPid(pid); this.changed(); }
  setPeerVolume(pid: number, volume: number) { if (!Number.isFinite(volume)) return; setPeerPref(this.prefs, pid, { volume }); this.save(); this.applyPid(pid); this.changed(); }
  private applyPid(pid: number) { for (const p of this.peers.values()) if (p.info.pid === pid) this.applyAudio(p); }
  setMode(mode: VoiceView['mode']) { if (mode !== 'hold' && mode !== 'toggle') return; this.stopTalking(); this.prefs.mode = mode; this.save(); this.changed(); }

  // ------------------------------------------------------------ микрофон

  private constraints(device = this.prefs.device): MediaStreamConstraints {
    return { video: false, audio: { channelCount: 1, echoCancellation: true, noiseSuppression: this.prefs.noise, autoGainControl: true, ...(device ? { deviceId: { exact: device } } : {}) } };
  }
  /** Те же настройки, что у живого микрофона: для проверки микрофона в панели. */
  micConstraints(): MediaStreamConstraints { return this.constraints(); }
  private async capture(): Promise<MediaStream> {
    try { return await this.deps.getUserMedia(this.constraints()); }
    catch (err) {
      const name = (err as { name?: string })?.name;
      if (!this.prefs.device || (name !== 'OverconstrainedError' && name !== 'NotFoundError')) throw err;
      this.flash('Выбранный микрофон не найден — взят основной.');
      return await this.deps.getUserMedia(this.constraints(''));
    }
  }
  /** Кнопка микрофона в игре (жест): включить микрофон; заодно — звук, если браузер его держал. */
  async connectMic(): Promise<void> {
    void this.unblock();
    if (!this.view.available) return;
    if (!this.on) { this.flash('Голос выключен — включите «Слышать голос» в меню (Esc → Голос).'); return; }
    await this.enableMic();
  }
  async enableMic(): Promise<void> {
    if (!this.on || this.mic === 'requesting' || this.mic === 'ready') return;
    this.stopTalking(); const generation = ++this.micGeneration;
    this.mic = 'requesting'; this.micWanted = true; if (MIC_ERRORS.some(e => this.error.startsWith(e))) this.error = ''; this.changed();
    try {
      const stream = await this.capture();
      // Never allow even a late permission result to send a live sample.
      for (const track of stream.getTracks()) track.enabled = false;
      if (generation !== this.micGeneration || !this.on) { for (const track of stream.getTracks()) track.stop(); return; }
      if (!stream.getAudioTracks()[0]) { for (const t of stream.getTracks()) t.stop(); this.mic = 'unavailable'; this.error = 'Микрофон недоступен.'; this.changed(); return; }
      this.useStream(stream); this.mic = 'ready';
      if (this.self !== null) this.announceMic(true);
      for (const peer of this.peers.values()) this.attachMic(peer);
      this.syncPeers();
      this.changed();
    } catch (err) {
      if (generation !== this.micGeneration) return;
      const name = (err as { name?: string })?.name;
      this.mic = name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable'; this.micWanted = false;
      this.error = this.mic === 'denied' ? 'Доступ к микрофону запрещён. Разрешите его в браузере (значок слева от адреса) и нажмите V ещё раз.'
        : 'Не удалось открыть микрофон. Проверьте устройство и нажмите V ещё раз.';
      this.changed();
    }
  }
  private useStream(stream: MediaStream) {
    this.stream = stream;
    const old = this.chain; this.chain = this.makeChain(stream); this.dropChain(old);
    stream.getAudioTracks()[0]?.addEventListener('ended', () => {
      if (this.stream !== stream) return;
      this.disableMic(); this.micWanted = true; this.error = 'Микрофон отключился. Подключите его и нажмите V.'; this.changed();
    }, { once: true });
  }
  /** После нового входа: микрофон был включён и разрешение уже дано — включаем сам, без вопросов. */
  private async restoreMic() {
    if (this.restoring) return;
    this.restoring = true;
    try { if (await this.deps.micPermission() === 'granted' && this.micWanted && this.mic === 'off' && this.self !== null) await this.enableMic(); }
    finally { this.restoring = false; }
  }
  disableMic() {
    const was = this.mic === 'ready';
    this.micWanted = false; this.stopMic();
    if (was && this.self !== null) this.announceMic(false);
    this.syncPeers(); this.changed();
  }
  private stopMic() {
    this.stopTalking(); this.micGeneration++;
    const stream = this.stream; this.stream = null; this.mic = 'off';
    if (stream) for (const track of stream.getTracks()) { track.enabled = false; track.stop(); }
    this.dropChain(this.chain); this.chain = null;
    for (const peer of this.peers.values()) this.attachMic(peer);
  }
  /** Что уходит собеседникам: поток цепочки (с затуханием) или, без движка, дорожка микрофона */
  private sendTrack(): MediaStreamTrack | null { return this.chain?.track ?? this.stream?.getAudioTracks()[0] ?? null; }
  private makeChain(stream: MediaStream): SendChain | null {
    if (this.audioBroken || !stream.getAudioTracks()[0]) return null;
    try {
      this.audio ??= this.deps.createAudioContext();
      const ctx = this.audio;
      if (!ctx) { this.audioBroken = true; return null; }
      const source = ctx.createMediaStreamSource(stream), gain = ctx.createGain(), dest = ctx.createMediaStreamDestination();
      gain.gain.value = 0;
      source.connect(gain); gain.connect(dest);
      const track = dest.stream.getAudioTracks()[0];
      if (!track) { source.disconnect(); gain.disconnect(); this.audioBroken = true; return null; }
      track.enabled = false;
      return { ctx, source, gain, track };
    } catch { this.audioBroken = true; return null; }
  }
  private dropChain(chain: SendChain | null) {
    if (!chain) return;
    chain.track.enabled = false;
    try { chain.source.disconnect(); chain.gain.disconnect(); chain.track.stop(); } catch { /* уже разобрана */ }
  }
  /** Нажатие V — жест: будим движок. Не проснулся — дальше шлём дорожку микрофона напрямую (хвост без затухания). */
  private wake() {
    const chain = this.chain, ctx = chain?.ctx;
    if (!chain || !ctx || ctx.state === 'running') return;
    const fail = () => {
      if (this.chain !== chain || ctx.state === 'running') return;
      this.audioBroken = true; this.chain = null;
      // дорожка микрофона уже в том же состоянии (gate), собеседникам — она
      this.dropChain(chain);
      for (const peer of this.peers.values()) this.attachMic(peer);
    };
    ctx.resume().then(fail, fail);
  }
  /** Всё, что может прозвучать у собеседников: дорожка микрофона и поток цепочки */
  private gate(on: boolean) {
    if (this.stream) for (const t of this.stream.getTracks()) t.enabled = on;
    if (this.chain) this.chain.track.enabled = on;
  }
  /** Громкость отправки: start — свежее нажатие (ждём звук, потом подъём за 25 мс), in — подъём за 25 мс с текущей, out — затухание, cut — ноль сразу */
  private ramp(mode: 'start' | 'in' | 'out' | 'cut') {
    const c = this.chain;
    if (!c) return;
    try {
      const p = c.gain.gain, now = c.ctx.currentTime;
      if (mode === 'cut') { p.cancelScheduledValues(0); p.setValueAtTime(0, now); return; }
      if (mode === 'start') {
        p.cancelScheduledValues(0); p.setValueAtTime(0, now); p.setValueAtTime(0, now + VOICE_ONSET_S);
        p.linearRampToValueAtTime(1, now + VOICE_ONSET_S + VOICE_FADE_IN_S);
        return;
      }
      // с текущего значения: перехват посреди затухания — без скачка
      const v = p.value; p.cancelScheduledValues(now); p.setValueAtTime(v, now);
      if (mode === 'in') p.linearRampToValueAtTime(1, now + VOICE_FADE_IN_S); else p.setTargetAtTime(0, now, VOICE_FADE_OUT_TAU_S);
    } catch { /* движок сломался — остаётся хвост без затухания */ }
  }
  /** Сменить устройство или шумоподавление на ходу: новый поток, собеседникам — новая дорожка без пересогласования. */
  private async reacquire() {
    if (this.mic !== 'ready') return;
    this.stopTalking(); const generation = ++this.micGeneration;
    try {
      const stream = await this.capture();
      for (const t of stream.getTracks()) t.enabled = false;
      if (generation !== this.micGeneration || this.mic !== 'ready' || !this.on) { for (const t of stream.getTracks()) t.stop(); return; }
      const old = this.stream; this.useStream(stream);
      for (const peer of this.peers.values()) this.attachMic(peer);
      if (old) for (const t of old.getTracks()) { t.enabled = false; t.stop(); }
      this.changed();
    } catch { if (generation === this.micGeneration) this.flash('Не удалось переключить микрофон — остался прежний.'); }
  }
  setDevice(id: string) { if (typeof id !== 'string' || id.length > 512 || id === this.prefs.device) return; this.prefs.device = id; this.save(); void this.reacquire(); this.changed(); }
  setNoise(on: boolean) { if (this.prefs.noise === !!on) return; this.prefs.noise = !!on; this.save(); void this.reacquire(); this.changed(); }

  // ------------------------------------------------------------ передача

  push(down: boolean) {
    if (this.prefs.mode === 'toggle') { if (down) { if (this.held) this.release(); else this.startTalking(); } return; }
    if (down) this.startTalking(); else this.release();
  }
  private startTalking(): boolean {
    if (this.held) return true;
    if (this.mic !== 'ready' || !this.stream) return false;
    if (!this.eligible()) {
      if (this.tail !== null) this.stopTalking();
      if (this.peers.size && !this.reachable() && this.inputEligible()) this.flash('Соединяем голос — ещё секунду…');
      return false;
    }
    // нажали посреди затухания — оно отменяется, громкость быстро возвращается (та же дорожка, без пересогласования)
    const resume = this.tail !== null;
    this.clearTail();
    this.held = true;
    this.wake();
    this.gate(true);
    // посреди хвоста звук ещё идёт — подъём сразу; свежее нажатие — подъём, когда звук дошёл до движка
    this.ramp(resume ? 'in' : 'start');
    this.send({ t: 'voice', a: 'talk', self: this.self!, on: true }); this.heartbeat(); this.changed();
    return true;
  }
  /** Отпустили V сами: передача идёт ещё хвост с затуханием, потом тишина и «замолчал» (stopTalking). */
  private release() {
    if (!this.held) return;
    this.held = false;
    if (this.pulse !== null) this.deps.clearTimer(this.pulse); this.pulse = null;
    this.ramp('out');
    this.clearTail();
    // tail не обнуляем до stopTalking: по нему видно, что «говорит» ещё надо снять
    this.tail = this.deps.setTimer(() => this.stopTalking(), this.chain ? VOICE_TAIL_MS : VOICE_TAIL_PLAIN_MS);
    this.changed();
  }
  private clearTail() { if (this.tail !== null) this.deps.clearTimer(this.tail); this.tail = null; }
  handleKey(code: string, down: boolean, event: KeyboardEvent): boolean {
    if (code !== 'KeyV') return false;
    if (!down) {
      if (this.prefs.mode === 'toggle') return this.on;
      const handled = this.held || this.on; this.release(); return handled;
    }
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || typing(event.target) || !this.inputEligible()) return false;
    if (!this.view.available) return false;
    void this.unblock(); // нажатие — жест: заодно включаем звук, если браузер его держал
    if (!this.on) { this.flash('Голос выключен — включите «Слышать голос» в меню (Esc → Голос).'); return true; }
    if (this.mic === 'off' || this.mic === 'denied' || this.mic === 'unavailable') {
      void this.enableMic();
      // Permission activation never carries the original key press into transmission.
      return true;
    }
    if (this.mic === 'requesting') return true;
    this.push(true);
    return true;
  }
  /** Тишина сразу, без хвоста: приватность (blur, скрытая вкладка, запрет, выключение, смена зоны, обрыв) и конец хвоста. */
  stopTalking() {
    // Privacy boundary: synchronous, ahead of signaling, callbacks and queued RTC operations.
    this.gate(false);
    this.ramp('cut');
    const was = this.held || this.tail !== null;
    this.held = false; this.clearTail();
    if (this.pulse !== null) this.deps.clearTimer(this.pulse); this.pulse = null;
    if (was && this.self !== null) this.send({ t: 'voice', a: 'talk', self: this.self, on: false });
    if (was) this.changed();
  }
  private heartbeat() {
    if (this.pulse !== null) this.deps.clearTimer(this.pulse);
    this.pulse = this.deps.setTimer(() => {
      this.pulse = null;
      if (!this.held || !this.eligible()) { this.stopTalking(); return; }
      this.send({ t: 'voice', a: 'talk', self: this.self!, on: true }); this.heartbeat();
    }, 600);
  }

  // ------------------------------------------------------------ жизнь сессии

  /** Переход между сценами: передача прекращается; зону и соединения решает сервер (voiceState). */
  roomChanged() { this.stopTalking(); }
  /** Связь с игровым сервером пропала, ждём возврата: голосовые соединения живут, говорить нельзя. */
  linkDown() { this.linkIsDown = true; this.stopTalking(); this.changed(); }
  linkUp() { this.linkIsDown = false; if (this.self === null) this.join(); this.changed(); }
  /**
   * Игровая сессия закончилась: всё закрыть, микрофон отпустить. Настройки остаются. keepMic — сессия оборвалась
   * сама (переподключаемся): после нового входа микрофон включится снова, если браузер уже разрешил его.
   */
  disconnected(keepMic = false) {
    if (!keepMic) this.micWanted = false;
    this.teardown(); this.config = null; this.presence = []; this.room = ''; this.zone = ''; this.linkIsDown = false; this.changed();
  }
  private teardown() {
    this.stopTalking(); this.stopMic(); this.generation++; this.clearPeers(); this.self = null; this.micAnnounced = false;
    this.joining = false; this.clearJoin(); this.joinTries = 0; this.clearRefresh(); this.playbackBlocked = false; this.disarmGesture();
    this.error = ''; if (this.noticeTimer !== null) this.deps.clearTimer(this.noticeTimer); this.noticeTimer = null; this.notice = '';
  }
  private clearRefresh() { if (this.refresh !== null) this.deps.clearTimer(this.refresh); this.refresh = null; }
  private scheduleRefresh() {
    this.clearRefresh();
    if (!this.config?.expiresAt) return;
    // TURN credentials are refreshed ahead of expiry: one request per config.
    const remaining = this.config.expiresAt - this.deps.now();
    if (remaining <= 0) return;
    this.refresh = this.deps.setTimer(() => { this.refresh = null; if (this.on) this.send({ t: 'voice', a: 'refresh' }); }, Math.max(1000, remaining - Math.min(60_000, remaining / 5)));
  }
  async debug(): Promise<VoiceDebug> {
    const peers = await Promise.all([...this.peers.values()].map(async p => {
      const row = { id: p.info.id, pid: p.info.pid, connection: p.pc.connectionState, ice: p.pc.iceConnectionState ?? 'new', gathering: p.pc.iceGatheringState ?? 'new', signaling: p.pc.signalingState ?? 'stable', offerer: p.offerer, restarts: p.restarts, localIce: p.localIce, remoteIce: p.remoteIce, descriptionsSent: p.descriptionsSent, descriptionsReceived: p.descriptionsReceived, iceErrors: p.iceErrors, route: 'unknown', bytesSent: 0, bytesReceived: 0, audioEnergy: 0, samplesReceived: 0, codecs: [] as string[], dtx: /usedtx=1/.test(p.pc.remoteDescription?.sdp ?? ''),
        audio: (!p.audio ? 'none' : p.audio.paused ? 'paused' : 'playing') as 'none' | 'playing' | 'paused', muted: !!p.audio?.muted };
      try { const stats = await p.pc.getStats(); stats.forEach(s => {
        if (s.type === 'candidate-pair' && s.state === 'succeeded' && (s.nominated || s.selected)) {
          const local = stats.get(s.localCandidateId), remote = stats.get(s.remoteCandidateId);
          if (local?.candidateType === 'relay' || remote?.candidateType === 'relay') row.route = 'relay';
          else if (['host', 'srflx', 'prflx'].includes(local?.candidateType)) row.route = 'direct';
        }
        if ((s.kind ?? s.mediaType) === 'audio' && s.type === 'outbound-rtp') row.bytesSent += Number(s.bytesSent) || 0;
        if ((s.kind ?? s.mediaType) === 'audio' && s.type === 'inbound-rtp') {
          row.bytesReceived += Number(s.bytesReceived) || 0; row.audioEnergy += Number(s.totalAudioEnergy) || 0; row.samplesReceived += Number(s.totalSamplesReceived) || 0;
        }
        if (s.type === 'codec' && typeof s.mimeType === 'string' && /^audio\/[\w.-]+$/.test(s.mimeType)) row.codecs.push(s.mimeType);
      }); } catch { /* Closed peers may reject stats; never return their exception text. */ }
      return row;
    }));
    return { enabled: this.on, joined: this.self !== null, self: this.self, zone: this.zone, mic: this.mic, transmitting: this.view.transmitting, playbackBlocked: this.playbackBlocked,
      send: this.chain ? 'webaudio' : 'track', engine: this.audio?.state ?? 'none', gain: this.chain ? this.chain.gain.gain.value : null, tail: this.tail !== null, peers };
  }
  dispose() {
    if (this.disposed) return;
    this.teardown(); this.disposed = true; this.listeners.clear();
    const audio = this.audio; this.audio = null;
    if (audio) void audio.close().catch(() => { /* уже закрыт */ });
    this.deps.window?.removeEventListener('blur', this.blur); this.deps.document?.removeEventListener('visibilitychange', this.visibility); this.deps.document?.removeEventListener('focusin', this.focus);
  }
}

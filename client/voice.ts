import { voiceCanTransmit, VOICE_BITRATE, VOICE_MAX_PEERS, type VoiceClientMsg, type VoiceServerMsg, type VoiceView, type VoiceSignal, type VoicePeer } from '../shared/voice.ts';

type Config = Extract<VoiceServerMsg, { t: 'voiceConfig' }>;
type Timer = ReturnType<typeof setTimeout> | number;
export interface VoiceDependencies {
  supported(): boolean;
  createPeerConnection(config: RTCConfiguration): RTCPeerConnection;
  createAudioContext(): AudioContext;
  createAudioElement(): HTMLAudioElement;
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  createMediaStream(tracks: MediaStreamTrack[]): MediaStream;
  audioCapabilities(): RTCRtpCapabilities | null;
  now(): number;
  setTimer(fn: () => void, ms: number): Timer;
  clearTimer(timer: Timer): void;
  window: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> | null;
  document: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> | null;
  hidden(): boolean;
}
interface Options { send(message: VoiceClientMsg): void; canTalk(): boolean; onChange(view: VoiceView): void }
interface Peer {
  info: VoicePeer; pc: RTCPeerConnection; sender: RTCRtpSender | null; muted: boolean;
  chain: Promise<void>; pending: number; ice: Array<RTCIceCandidateInit | null>; remoteReady: boolean;
  deadline: Timer | null; localIce: number; remoteIce: number; descriptionsSent: number; descriptionsReceived: number; iceErrors: number;
  closed: boolean; failed: boolean; source?: MediaStreamAudioSourceNode; gain?: GainNode; sink?: HTMLAudioElement;
}
export interface VoiceDebug {
  enabled: boolean; joined: boolean; self: number | null; mic: VoiceView['mic']; transmitting: boolean;
  audioState: string; peers: Array<{ id: number; connection: string; ice: string; gathering: string; signaling: string; localIce: number; remoteIce: number; descriptionsSent: number; descriptionsReceived: number; iceErrors: number; route: string; bytesSent: number; bytesReceived: number; audioEnergy: number; samplesReceived: number; codecs: string[] }>;
}
const defaults: VoiceDependencies = {
  supported: () => typeof RTCPeerConnection !== 'undefined' && typeof AudioContext !== 'undefined',
  createPeerConnection: config => new RTCPeerConnection(config), createAudioContext: () => new AudioContext(),
  createAudioElement: () => new Audio(),
  getUserMedia: constraints => navigator.mediaDevices.getUserMedia(constraints), createMediaStream: tracks => new MediaStream(tracks),
  audioCapabilities: () => typeof RTCRtpReceiver === 'undefined' ? null : RTCRtpReceiver.getCapabilities('audio'),
  now: () => Date.now(), setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: timer => clearTimeout(timer),
  window: typeof window === 'undefined' ? null : window, document: typeof document === 'undefined' ? null : document,
  hidden: () => typeof document !== 'undefined' && document.hidden,
};
const ICE_LIMIT = 64;
const CONNECTION_ERROR = 'Соединение с участником прервано. Переподключите голос.';
const JOIN_ERROR = 'Сервер не ответил на подключение голоса. Повторите подключение.';
const SIGNAL_ERROR = 'Участник не ответил: не удалось согласовать голос. Повторите подключение.';
const NETWORK_ERROR = 'Сеть не пропускает голос между участниками. Повторите подключение или попробуйте другую сеть.';
const CONNECT_TIMEOUT = 20_000;
function typing(target: EventTarget | null | undefined) {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'file', 'image'].includes((el as HTMLInputElement).type)));
}
/** Capture is opt-in, while transmission is exclusively a synchronous track.enabled gate. */
export class VoiceController {
  private readonly opts: Options;
  private readonly deps: VoiceDependencies;
  private config: Config | null = null;
  private enabled = false;
  private disposed = false;
  private self: number | null = null;
  private room = '';
  private mic: VoiceView['mic'] = 'off';
  private error = '';
  private playbackBlocked = false;
  private restartRequired = false;
  private connectionErrors = new Set<number>();
  private held = false;
  private receiving = true;
  private gameMuted = false;
  private volume = 1;
  private stream: MediaStream | null = null;
  private audio: AudioContext | null = null;
  private master: GainNode | null = null;
  private peers = new Map<number, Peer>();
  private presence: VoicePeer[] = [];
  private joining: Timer | null = null;
  private generation = 0;
  private enableGeneration = 0;
  private micGeneration = 0;
  private pulse: Timer | null = null;
  private refresh: Timer | null = null;
  private readonly blur = () => this.stopTalking();
  private readonly visibility = () => { if (this.deps.hidden()) this.stopTalking(); };
  // Any focus change relinquishes an existing press. A new eligible press may start again.
  private readonly focus = () => this.stopTalking();

  constructor(opts: Options, dependencies: Partial<VoiceDependencies> = {}) {
    this.opts = opts; this.deps = { ...defaults, ...dependencies };
    this.deps.window?.addEventListener('blur', this.blur);
    this.deps.document?.addEventListener('visibilitychange', this.visibility);
    this.deps.document?.addEventListener('focusin', this.focus);
  }
  get view(): VoiceView {
    return { available: !!this.config && this.deps.supported() && !this.disposed, enabled: this.enabled, joined: this.self !== null,
      room: this.room, mic: this.mic, playbackBlocked: this.playbackBlocked, transmitting: !!this.stream?.getAudioTracks().some(t => t.enabled),
      receiving: this.receiving, gameMuted: this.gameMuted, volume: this.volume, maxPeers: this.config?.maxPeers ?? VOICE_MAX_PEERS, error: this.error,
      presence: this.presence.map(p => ({ ...p })),
      peers: [...this.peers.values()].map(p => ({ ...p.info, muted: p.muted, link: p.failed || ['failed', 'closed', 'disconnected'].includes(p.pc.connectionState) ? 'failed' : p.pc.connectionState === 'connected' ? 'connected' : 'connecting' })) };
  }
  private changed() {
    for (const id of this.connectionErrors) if (!this.peers.has(id)) this.connectionErrors.delete(id);
    if (this.connectionErrors.size === 0 || [...this.peers.values()].every(p => !p.failed && p.pc.connectionState === 'connected')) {
      this.connectionErrors.clear();
      if ([CONNECTION_ERROR, SIGNAL_ERROR, NETWORK_ERROR].includes(this.error)) this.error = '';
    }
    try { this.opts.onChange(this.view); } catch { /* UI exceptions never expose signaling data. */ }
  }
  private send(message: VoiceClientMsg) {
    try { this.opts.send(message); } catch { this.error = 'Не удалось отправить голосовое сообщение. Переподключите голос.'; this.changed(); }
  }
  private inputEligible() { try { return !this.disposed && !this.deps.hidden() && this.opts.canTalk(); } catch { return false; } }
  private eligible() { return voiceCanTransmit(this.view) && this.inputEligible(); }
  private rtcConfig(): RTCConfiguration {
    return { iceServers: this.config?.iceServers ?? [], iceTransportPolicy: this.config?.relayOnly ? 'relay' : 'all' };
  }
  async enable(): Promise<void> {
    if (this.disposed || !this.config || !this.deps.supported()) return;
    const first = !this.enabled;
    if (first) { this.enabled = true; this.generation++; }
    else if (this.restartRequired || [...this.peers.values()].some(p => p.failed || ['failed', 'closed', 'disconnected'].includes(p.pc.connectionState))) {
      this.roomChanged(); this.send({ t: 'voice', a: 'leave' });
    }
    const generation = ++this.enableGeneration;
    this.error = '';
    try {
      if (!this.audio) { this.audio = this.deps.createAudioContext(); this.master = this.audio.createGain(); this.master.connect(this.audio.destination); this.applyGain(); }
      await this.audio.resume();
      if (generation !== this.enableGeneration || !this.enabled) return;
      this.playbackBlocked = this.audio?.state !== 'running';
      if (this.playbackBlocked) this.error = 'Звук заблокирован браузером. Нажмите «Включить голос» ещё раз.';
    } catch { if (generation === this.enableGeneration) { this.playbackBlocked = true; this.stopTalking(); this.error = 'Не удалось включить воспроизведение. Нажмите «Включить голос» ещё раз.'; } }
    if (generation !== this.enableGeneration || !this.enabled) return;
    await Promise.all([...this.peers.values()].map(peer => peer.sink ? this.playSink(peer, peer.sink) : Promise.resolve()));
    if (generation !== this.enableGeneration || !this.enabled) return;
    if (this.self === null) {
      this.clearJoin();
      this.joining = this.deps.setTimer(() => { this.joining = null; if (this.enabled && this.self === null) { this.restartRequired = true; this.error = JOIN_ERROR; this.changed(); } }, 10_000);
      this.send({ t: 'voice', a: 'join' });
    }
    else if (this.config.expiresAt !== null && this.config.expiresAt <= this.deps.now() + 60_000) this.send({ t: 'voice', a: 'refresh' });
    this.scheduleRefresh(); this.changed();
  }
  /** One user gesture owns both playback activation and the subsequent capture request. */
  async connectMic(): Promise<void> {
    const activation = this.enable();
    const generation = this.enableGeneration;
    await activation;
    // A disable, disconnect or newer playback activation cancels the entire old intent.
    if (generation !== this.enableGeneration || !this.enabled || this.disposed) return;
    await this.enableMic();
  }
  disable() { this.shutdown(true); }
  disconnected() { this.shutdown(false); this.presence = []; this.config = null; this.changed(); }
  private shutdown(notify: boolean) {
    const wasEnabled = this.enabled;
    this.stopTalking(); this.disableMic(); this.enabled = false; this.generation++; this.enableGeneration++;
    this.self = null; this.room = ''; this.restartRequired = false; this.playbackBlocked = false; this.clearPeers(); this.clearRefresh(); this.clearJoin();
    this.master?.disconnect(); this.master = null;
    const audio = this.audio; this.audio = null;
    if (audio) void audio.close().catch(() => {});
    if (notify && wasEnabled) this.send({ t: 'voice', a: 'leave' });
    this.error = ''; this.changed();
  }
  async enableMic(): Promise<void> {
    if (!this.enabled || this.disposed || this.mic === 'requesting' || this.mic === 'ready') return;
    this.stopTalking(); const generation = ++this.micGeneration;
    this.mic = 'requesting'; this.error = ''; this.changed();
    try {
      const stream = await this.deps.getUserMedia({ video: false, audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      // Never allow even a late permission result to send a live sample.
      for (const track of stream.getTracks()) track.enabled = false;
      if (generation !== this.micGeneration || !this.enabled || this.disposed) { for (const track of stream.getTracks()) track.stop(); return; }
      const track = stream.getAudioTracks()[0];
      if (!track) { for (const t of stream.getTracks()) t.stop(); this.mic = 'unavailable'; this.error = 'Микрофон недоступен.'; this.changed(); return; }
      this.stream = stream; this.mic = 'ready';
      track.addEventListener('ended', () => { if (this.stream === stream) { this.disableMic(); this.error = 'Микрофон отключён. Подключите его и включите снова.'; this.changed(); } }, { once: true });
      for (const peer of this.peers.values()) this.attachMic(peer);
      this.changed();
    } catch (err) {
      if (generation !== this.micGeneration || !this.enabled) return;
      this.mic = (err as { name?: string })?.name === 'NotAllowedError' ? 'denied' : 'unavailable';
      this.error = this.mic === 'denied' ? 'Доступ к микрофону не разрешён. Разрешите его в браузере и повторите.' : 'Не удалось открыть микрофон. Проверьте устройство и повторите.';
      this.changed();
    }
  }
  disableMic() {
    this.stopTalking(); this.micGeneration++;
    const stream = this.stream; this.stream = null; this.mic = 'off';
    if (stream) for (const track of stream.getTracks()) { track.enabled = false; track.stop(); }
    for (const peer of this.peers.values()) this.attachMic(peer);
    this.changed();
  }
  push(down: boolean) {
    if (!down) { this.stopTalking(); return; }
    if (this.held || !this.eligible() || this.mic !== 'ready' || !this.stream) return;
    this.held = true;
    for (const track of this.stream.getAudioTracks()) track.enabled = true;
    this.send({ t: 'voice', a: 'talk', self: this.self!, on: true }); this.heartbeat(); this.changed();
  }
  handleKey(code: string, down: boolean, event: KeyboardEvent): boolean {
    if (code !== 'KeyV') return false;
    if (!down) { const handled = this.held || this.enabled; this.stopTalking(); return handled; }
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || typing(event.target) || !this.inputEligible()) return false;
    if (!this.view.available) return false;
    const needsRetry = this.restartRequired && ![...this.peers.values()].some(p => !p.failed && p.pc.connectionState === 'connected');
    if (!this.enabled || ['off', 'denied', 'unavailable'].includes(this.mic) || this.playbackBlocked || needsRetry) {
      void this.connectMic();
      // Permission/connection activation never carries the original key press into transmission.
      return true;
    }
    if (this.mic === 'requesting') return true;
    if (!this.eligible()) return false;
    this.push(true); return this.enabled;
  }
  stopTalking() {
    // Privacy boundary: synchronous, ahead of signaling, callbacks and queued RTC operations.
    if (this.stream) for (const track of this.stream.getTracks()) track.enabled = false;
    const wasHeld = this.held; this.held = false;
    if (this.pulse !== null) this.deps.clearTimer(this.pulse); this.pulse = null;
    if (wasHeld && this.self !== null) this.send({ t: 'voice', a: 'talk', self: this.self, on: false });
    if (wasHeld) this.changed();
  }
  private heartbeat() {
    if (this.pulse !== null) this.deps.clearTimer(this.pulse);
    this.pulse = this.deps.setTimer(() => {
      this.pulse = null;
      if (!this.held || !this.eligible()) { this.stopTalking(); return; }
      this.send({ t: 'voice', a: 'talk', self: this.self!, on: true }); this.heartbeat();
    }, 600);
  }
  roomChanged() {
    this.stopTalking(); this.generation++; this.self = null; this.room = ''; this.restartRequired = false; this.presence = []; this.clearPeers(); this.clearJoin(); this.changed();
  }
  setReceiving(on: boolean) { this.receiving = on; this.applyGain(); this.changed(); }
  setVolume(value: number) { if (!Number.isFinite(value)) return; this.volume = Math.max(0, Math.min(1, value)); this.applyGain(); this.changed(); }
  setGameMuted(on: boolean) { this.gameMuted = on; this.applyGain(); this.changed(); }
  setPeerMuted(id: number, muted: boolean) { const peer = this.peers.get(id); if (!peer) return; peer.muted = muted; if (peer.gain) peer.gain.gain.value = muted ? 0 : 1; this.changed(); }
  private applyGain() { if (this.master) this.master.gain.value = this.receiving && !this.gameMuted ? this.volume : 0; }
  onMessage(message: VoiceServerMsg) {
    if (this.disposed) return;
    if (message.t === 'voiceConfig') {
      this.config = message;
      for (const peer of this.peers.values()) { try { peer.pc.setConfiguration(this.rtcConfig()); } catch { this.error = 'Не удалось обновить соединение. Переподключите голос.'; } }
      this.scheduleRefresh(); this.changed(); return;
    }
    if (message.t === 'voiceError') {
      const labels = { disabled: 'Голос на сервере выключен.', full: 'Голосовая группа заполнена. Попробуйте позже.', not_joined: 'Подключитесь к голосу заново.', stale: 'Голосовое соединение устарело. Переподключите голос.', invalid: 'Не удалось согласовать голосовое соединение.', rate_limit: 'Слишком много голосовых запросов. Попробуйте позже.' };
      if (message.code === 'disabled') { this.shutdown(false); this.config = null; }
      else if (message.code === 'not_joined' || message.code === 'stale' || message.code === 'full') this.roomChanged();
      else if (message.code === 'invalid' || message.code === 'rate_limit') this.restartRequired = true;
      this.error = labels[message.code]; this.changed(); return;
    }
    if (message.t === 'voiceState') {
      this.presence = message.peers.map(p => ({ ...p })); this.room = message.room;
      if (!this.enabled) { this.changed(); return; }
      if (message.self !== null) { this.clearJoin(); if (this.error === JOIN_ERROR) this.error = ''; }
      if (message.self !== this.self) { this.stopTalking(); this.generation++; this.restartRequired = false; this.clearPeers(); this.self = message.self; }
      this.room = message.room;
      if (this.self === null) { this.changed(); return; }
      const members = message.peers.filter(p => p.id !== this.self);
      const ids = new Set(members.map(p => p.id));
      for (const [id, peer] of this.peers) if (!ids.has(id)) { this.closePeer(peer); this.peers.delete(id); }
      for (const info of members) { const existing = this.peers.get(info.id); if (existing) existing.info = { ...info }; else this.addPeer(info); }
      this.changed(); return;
    }
    if (!this.enabled) return;
    if (message.to !== this.self || message.from === this.self) return;
    const peer = this.peers.get(message.from); if (!peer || peer.closed || peer.failed) return;
    const signal = message.signal;
    if (signal.kind === 'ice') peer.remoteIce += signal.candidate?.candidate ? 1 : 0;
    else peer.descriptionsReceived++;
    if (signal.kind === 'ice' && !peer.remoteReady) { if (peer.ice.length < ICE_LIMIT) peer.ice.push(signal.candidate); return; }
    this.enqueue(peer, async valid => {
      if (signal.kind === 'ice') { await peer.pc.addIceCandidate(signal.candidate ?? undefined); return; }
      // IDs assign one offerer; no glare or unrequested renegotiation on PTT.
      if (signal.kind === 'offer' && this.self! < peer.info.id) return;
      if (signal.kind === 'answer' && this.self! > peer.info.id) return;
      if (peer.remoteReady) return;
      await peer.pc.setRemoteDescription({ type: signal.kind, sdp: signal.sdp }); if (!valid()) return;
      peer.remoteReady = true;
      for (const candidate of peer.ice.splice(0)) { await peer.pc.addIceCandidate(candidate ?? undefined); if (!valid()) return; }
      if (signal.kind === 'offer') {
        // The remote offer creates/associates its own transceiver. A pre-created answerer
        // transceiver can remain unassociated and silently send on the wrong m-line.
        const tx = peer.pc.getTransceivers().find(t => t.mid !== null && t.receiver.track.kind === 'audio');
        if (!tx) throw new Error('Missing audio transceiver');
        this.configureTransceiver(tx); peer.sender = tx.sender;
        await this.replaceMic(peer, valid); if (!valid()) return;
        const answer = await peer.pc.createAnswer(); if (!valid()) return;
        await peer.pc.setLocalDescription(answer); if (!valid()) return;
        this.signal(peer, { kind: 'answer', sdp: peer.pc.localDescription?.sdp ?? answer.sdp ?? '' });
      }
      await this.bitrate(peer);
    });
  }
  private addPeer(info: VoicePeer) {
    let pc: RTCPeerConnection;
    try { pc = this.deps.createPeerConnection(this.rtcConfig()); } catch { this.error = 'Браузер не смог открыть голосовое соединение.'; return; }
    try {
      const tx = this.self! < info.id ? pc.addTransceiver('audio', { direction: 'sendrecv' }) : null;
      if (tx) this.configureTransceiver(tx);
      const peer: Peer = { info: { ...info }, pc, sender: tx?.sender ?? null, muted: false, chain: Promise.resolve(), pending: 0, ice: [], remoteReady: false, closed: false, failed: false, deadline: null, localIce: 0, remoteIce: 0, descriptionsSent: 0, descriptionsReceived: 0, iceErrors: 0 };
      this.peers.set(info.id, peer);
      this.armDeadline(peer, CONNECT_TIMEOUT);
      pc.onicecandidate = event => { if (!this.current(peer)) return; const c = event.candidate; if (c?.candidate) peer.localIce++; this.signal(peer, { kind: 'ice', candidate: c ? { candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex, ...(c.usernameFragment ? { usernameFragment: c.usernameFragment } : {}) } : null }); };
      pc.onicecandidateerror = () => { if (this.current(peer)) peer.iceErrors++; };
      pc.onconnectionstatechange = () => {
        if (!this.current(peer)) return;
        if (pc.connectionState === 'connected') { this.clearDeadline(peer); }
        else if (pc.connectionState === 'failed') { this.failPeer(peer, peer.remoteReady ? NETWORK_ERROR : SIGNAL_ERROR); return; }
        else if (pc.connectionState === 'disconnected') { this.connectionErrors.add(peer.info.id); this.error = CONNECTION_ERROR; this.armDeadline(peer, 5_000); if (!this.eligible()) this.stopTalking(); }
        this.changed();
      };
      pc.ontrack = event => { if (this.current(peer)) this.receive(peer, event.streams[0] ?? this.deps.createMediaStream([event.track])); };
      this.attachMic(peer);
      if (this.self! < info.id) this.enqueue(peer, async valid => {
        const offer = await pc.createOffer(); if (!valid()) return;
        await pc.setLocalDescription(offer); if (!valid()) return;
        this.signal(peer, { kind: 'offer', sdp: pc.localDescription?.sdp ?? offer.sdp ?? '' }); await this.bitrate(peer);
      });
    } catch { pc.close(); this.error = 'Не удалось согласовать голос. Переподключите голос.'; }
  }
  private clearJoin() { if (this.joining !== null) this.deps.clearTimer(this.joining); this.joining = null; }
  private clearDeadline(peer: Peer) { if (peer.deadline !== null) this.deps.clearTimer(peer.deadline); peer.deadline = null; }
  private armDeadline(peer: Peer, ms: number) {
    if (peer.deadline !== null) return;
    peer.deadline = this.deps.setTimer(() => {
      peer.deadline = null;
      if (this.current(peer) && peer.pc.connectionState !== 'connected') this.failPeer(peer, peer.remoteReady ? NETWORK_ERROR : SIGNAL_ERROR);
    }, ms);
  }
  private failPeer(peer: Peer, message: string) {
    this.connectionErrors.add(peer.info.id); peer.failed = true; this.closePeer(peer); this.restartRequired = true;
    if (![...this.peers.values()].some(p => !p.failed && p.pc.connectionState === 'connected')) this.stopTalking();
    this.error = message; this.changed();
  }
  private current(peer: Peer) { return this.enabled && !peer.closed && this.peers.get(peer.info.id) === peer && this.self !== null; }
  private signal(peer: Peer, signal: VoiceSignal) { if (this.current(peer)) { if (signal.kind !== 'ice') peer.descriptionsSent++; this.send({ t: 'voiceSignal', self: this.self!, to: peer.info.id, signal }); } }
  private enqueue(peer: Peer, operation: (valid: () => boolean) => Promise<void>) {
    if (peer.pending >= 80 || !this.current(peer)) return;
    const generation = this.generation; peer.pending++;
    const valid = () => generation === this.generation && this.current(peer);
    peer.chain = peer.chain.then(async () => { if (valid()) await operation(valid); }).catch(() => {
      if (valid()) this.failPeer(peer, 'Не удалось соединиться с участником. Переподключите голос.');
    }).finally(() => { peer.pending--; });
  }
  private attachMic(peer: Peer) {
    this.enqueue(peer, valid => this.replaceMic(peer, valid));
  }
  private configureTransceiver(tx: RTCRtpTransceiver) {
    tx.direction = 'sendrecv';
    try { const caps = this.deps.audioCapabilities(); const opus = caps?.codecs.filter(c => c.mimeType.toLowerCase() === 'audio/opus'); if (opus?.length) tx.setCodecPreferences(opus); } catch { /* Native default audio codec remains usable. */ }
  }
  private async replaceMic(peer: Peer, valid: () => boolean) {
    const sender = peer.sender; if (!sender) return;
    // Read current track at execution, not enqueue time. A detached/closed generation never attaches.
    const track = this.stream?.getAudioTracks()[0] ?? null;
    await sender.replaceTrack(track);
    if (!valid()) return;
    const current = this.stream?.getAudioTracks()[0] ?? null;
    if (track !== current) await sender.replaceTrack(current);
    if (valid()) await this.bitrate(peer);
  }
  private async bitrate(peer: Peer) {
    if (!peer.sender) return;
    try { const p = peer.sender.getParameters(); if (!p.encodings?.length) p.encodings = [{}]; for (const e of p.encodings) e.maxBitrate = VOICE_BITRATE; await peer.sender.setParameters(p); } catch { /* Some browsers cannot set parameters before negotiation. */ }
  }
  private receive(peer: Peer, stream: MediaStream) {
    if (!this.audio || !this.master) return;
    try {
      peer.source?.disconnect(); peer.gain?.disconnect(); this.releaseSink(peer);
      peer.source = this.audio.createMediaStreamSource(stream); peer.gain = this.audio.createGain(); peer.gain.gain.value = peer.muted ? 0 : 1;
      peer.source.connect(peer.gain); peer.gain.connect(this.master);
      // Chromium may not decode remote RTP for a MediaStreamSource alone. Keep a
      // muted media sink playing; the gain graph above is the only audible path.
      const sink = this.deps.createAudioElement(); peer.sink = sink;
      sink.muted = true; sink.defaultMuted = true; sink.srcObject = stream;
      void this.playSink(peer, sink);
      if (this.audio.state !== 'running') { this.playbackBlocked = true; this.stopTalking(); this.error = 'Браузер приостановил звук. Нажмите «Включить голос» ещё раз.'; }
      this.changed();
    } catch { this.playbackBlocked = true; this.stopTalking(); this.error = 'Не удалось воспроизвести голос участника. Переподключите голос.'; this.changed(); }
  }
  private async playSink(peer: Peer, sink: HTMLAudioElement) {
    try { await sink.play(); }
    catch {
      if (!this.current(peer) || peer.sink !== sink) return;
      this.playbackBlocked = true; this.stopTalking(); this.error = 'Не удалось включить воспроизведение. Нажмите «Включить голос» ещё раз.'; this.changed();
    }
  }
  private releaseSink(peer: Peer) {
    const sink = peer.sink; peer.sink = undefined;
    if (sink) { sink.pause(); sink.srcObject = null; }
  }
  private closePeer(peer: Peer) {
    this.clearDeadline(peer); peer.pc.onicecandidateerror = null;
    peer.closed = true; peer.ice.length = 0; peer.pc.ontrack = null; peer.pc.onicecandidate = null; peer.pc.onconnectionstatechange = null;
    peer.source?.disconnect(); peer.gain?.disconnect(); this.releaseSink(peer); peer.pc.close();
  }
  private clearPeers() { for (const peer of this.peers.values()) this.closePeer(peer); this.peers.clear(); }
  private clearRefresh() { if (this.refresh !== null) this.deps.clearTimer(this.refresh); this.refresh = null; }
  private scheduleRefresh() {
    this.clearRefresh();
    if (!this.enabled || !this.config?.expiresAt) return;
    // One request per config. Failure awaits a user's explicit retry, never a retry loop.
    const remaining = this.config.expiresAt - this.deps.now();
    if (remaining <= 0) { this.error = 'Конфигурация голоса истекла. Нажмите «Включить голос» ещё раз.'; return; }
    this.refresh = this.deps.setTimer(() => { this.refresh = null; if (this.enabled) this.send({ t: 'voice', a: 'refresh' }); }, Math.max(1000, remaining - Math.min(60_000, remaining / 5)));
  }
  async debug(): Promise<VoiceDebug> {
    const peers = await Promise.all([...this.peers.values()].map(async p => {
      const row = { id: p.info.id, connection: p.pc.connectionState, ice: p.pc.iceConnectionState ?? 'new', gathering: p.pc.iceGatheringState ?? 'new', signaling: p.pc.signalingState ?? 'stable', localIce: p.localIce, remoteIce: p.remoteIce, descriptionsSent: p.descriptionsSent, descriptionsReceived: p.descriptionsReceived, iceErrors: p.iceErrors, route: 'unknown', bytesSent: 0, bytesReceived: 0, audioEnergy: 0, samplesReceived: 0, codecs: [] as string[] };
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
    return { enabled: this.enabled, joined: this.self !== null, self: this.self, mic: this.mic, transmitting: this.view.transmitting, audioState: this.audio?.state ?? 'closed', peers };
  }
  dispose() {
    if (this.disposed) return;
    this.disable(); this.disposed = true;
    this.deps.window?.removeEventListener('blur', this.blur); this.deps.document?.removeEventListener('visibilitychange', this.visibility); this.deps.document?.removeEventListener('focusin', this.focus);
  }
}

import { isIP } from 'node:net';
import { VOICE_BITRATE, VOICE_MAX_PEERS, VOICE_MAX_SDP, VOICE_MAX_SIGNAL_TEXT, VOICE_TALK_LEASE_MS, VOICE_WORLD, voiceZoneName,
  type VoiceErrorCode, type VoiceIceConfig, type VoiceServerMsg, type VoiceSignal } from '../shared/voice.ts';
export interface VoiceClient {
  id: number; pid: number; nick: string; profile: { id: number } | null;
  room: { kind: string } | null; closed: boolean; ephemeral: boolean;
  sink: { sendJson(message: VoiceServerMsg): void };
}
/** Ключ голосовой зоны: внешний мир — одна строка на всех; инстанс — сам объект комнаты (у каждого экземпляра свой голос). */
type ZoneKey = string | object;
function zoneOf(room: { kind: string }): ZoneKey {
  return voiceZoneName(room.kind) === VOICE_WORLD ? VOICE_WORLD : room;
}
interface Member { id: number; client: VoiceClient; room: { kind: string }; zone: ZoneKey; talkingUntil: number; mic: boolean }
interface SignalBudget { messageTokens: number; byteTokens: number; at: number }
interface Session extends SignalBudget { member: Member | null; controlTokens: number; errorAt: number; peers: Map<VoiceClient, SignalBudget> }
const SIGNAL_RATE = 30, SIGNAL_BURST = 120, BYTE_RATE = 32 * 1024, BYTE_BURST = 96 * 1024;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: readonly string[]): boolean => Object.keys(v).every(k => keys.includes(k));
const integer = (v: unknown, min: number, max: number): v is number => Number.isSafeInteger(v) && (v as number) >= min && (v as number) <= max;
const token = (v: unknown, min = 1, max = 256): v is string => typeof v === 'string' && v.length >= min && v.length <= max && /^[A-Za-z0-9+/_!.-]+$/.test(v);
function address(v: string): boolean { return !!isIP(v) || /^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)*[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(v); }
function candidateText(v: unknown): v is string {
  if (typeof v !== 'string' || v.length > 1024 || !/^[\x20-\x7e]*$/.test(v)) return false;
  if (v === '') return true;
  const fields = v.split(' ');
  if (fields.length < 8 || fields.length > 30 || !/^candidate:[A-Za-z0-9+/]{1,32}$/.test(fields[0]) || !/^[12]$/.test(fields[1])
    || !/^(udp|tcp)$/i.test(fields[2]) || !/^\d{1,10}$/.test(fields[3]) || +fields[3] > 0xffffffff || !address(fields[4])
    || !/^\d{1,5}$/.test(fields[5]) || +fields[5] < 1 || +fields[5] > 65535 || fields[6] !== 'typ' || !/^(host|srflx|prflx|relay)$/.test(fields[7]) || fields.length % 2) return false;
  const seen = new Set<string>();
  for (let i = 8; i < fields.length; i += 2) {
    const key = fields[i], value = fields[i + 1]; if (seen.has(key)) return false; seen.add(key);
    if (key === 'raddr') { if (!address(value)) return false; }
    else if (key === 'rport') { if (!/^\d{1,5}$/.test(value) || +value > 65535) return false; }
    else if (key === 'tcptype') { if (!/^(active|passive|so)$/.test(value)) return false; }
    else if (key === 'ufrag') { if (!token(value, 4)) return false; }
    else if (key === 'generation' || key === 'network-id' || key === 'network-cost') { if (!/^\d{1,5}$/.test(value) || +value > 65535) return false; }
    else return false;
  }
  return true;
}
const ATTRIBUTES = new Set(['group','msid-semantic','ice-ufrag','ice-pwd','ice-options','fingerprint','setup','mid','sendrecv','sendonly','recvonly','inactive',
  'rtcp','rtcp-mux','rtcp-rsize','rtcp-xr','rtpmap','fmtp','rtcp-fb','extmap','extmap-allow-mixed','ssrc','ssrc-group','msid','candidate','end-of-candidates','bundle-only','maxptime','ptime']);
/** RFC3611 section5.1: bounded standard RTCP extended-report formats, including Chromium receiver RTT. */
function rtcpXr(line: string): boolean {
  if (line === 'a=rtcp-xr' || line === 'a=rtcp-xr:') return true;
  if (!line.startsWith('a=rtcp-xr:')) return false;
  return line.slice(10).split(' ').every(value => /^(?:pkt-(?:loss-rle|dup-rle|rcpt-times)(?:=\d{1,10})?|rcvr-rtt=(?:all|sender)(?::\d{1,10})?|stat-summary(?:=(?:loss|dup|jitt|TTL|HL)(?:,(?:loss|dup|jitt|TTL|HL))*)?|voip-metrics)$/.test(value));
}
function audioSdp(v: unknown): v is string {
  if (typeof v !== 'string' || v.length > VOICE_MAX_SDP || !/^[\x20-\x7e\r\n]+$/.test(v) || /\r(?!\n)/.test(v)) return false;
  const lines = v.split(/\r?\n/).filter(Boolean);
  if (lines.length > 128 || lines[0] !== 'v=0' || lines.some(l => l.length > 2048 || !/^[vosctmba]=/.test(l))) return false;
  const media = lines.filter(l => l.startsWith('m='));
  if (media.length !== 1 || !/^m=audio \d{1,5} (?:UDP\/TLS\/RTP\/SAVPF|TCP\/TLS\/RTP\/SAVPF|RTP\/SAVPF)(?: \d{1,3}){1,32}$/.test(media[0])) return false;
  const parts = media[0].split(' '); if (+parts[1] > 65535 || parts.slice(3).some(p => +p > 127)) return false;
  if (!lines.some(l => /^o=\S{1,128} \d{1,20} \d{1,20} IN IP[46] \S+$/.test(l)) || !lines.includes('t=0 0') || !lines.some(l => l.startsWith('s='))) return false;
  if (!lines.some(l => /^a=rtpmap:\d+ opus\/48000(?:\/[12])?$/i.test(l)) || !lines.some(l => /^a=mid:[A-Za-z0-9_-]{1,32}$/.test(l))
    || !lines.some(l => /^a=ice-ufrag:[A-Za-z0-9+/]{4,256}$/.test(l)) || !lines.some(l => /^a=ice-pwd:[A-Za-z0-9+/]{22,256}$/.test(l))
    || !lines.some(l => /^a=fingerprint:sha-(?:256|384|512) (?:[a-fA-F0-9]{2}:){31,63}[a-fA-F0-9]{2}$/.test(l)) || !lines.some(l => /^a=setup:(?:actpass|active|passive)$/.test(l))) return false;
  for (const line of lines) {
    if (line.startsWith('a=')) {
      const name = line.slice(2).split(/[: ]/, 1)[0]; if (!ATTRIBUTES.has(name)) return false;
      if (name === 'rtcp-xr' && !rtcpXr(line)) return false;
      if (name === 'candidate' && !candidateText(line.slice(2))) return false;
      if (name === 'rtpmap' && !/^a=rtpmap:\d+ (?:opus|PCMU|PCMA|G722|CN|telephone-event|red)\/\d+(?:\/[12])?$/i.test(line)) return false;
    }
  }
  return true;
}
/** Whitelisted fields only: never forward caller-supplied sender identity or arbitrary nested objects. */
function signal(v: unknown): VoiceSignal | null {
  if (!record(v)) return null;
  if ((v.kind === 'offer' || v.kind === 'answer') && exact(v, ['kind','sdp']) && audioSdp(v.sdp)) return { kind: v.kind, sdp: v.sdp };
  if (v.kind === 'restart' && exact(v, ['kind'])) return { kind: 'restart' };
  if (v.kind !== 'ice' || !exact(v, ['kind','candidate'])) return null;
  if (v.candidate === null) return { kind: 'ice', candidate: null };
  const c = v.candidate;
  if (!record(c) || !exact(c, ['candidate','sdpMid','sdpMLineIndex','usernameFragment']) || !candidateText(c.candidate)
    || c.sdpMid !== null && !token(c.sdpMid, 1, 32) || c.sdpMLineIndex !== null && c.sdpMLineIndex !== 0
    || c.usernameFragment != null && !token(c.usernameFragment, 4)) return null;
  return { kind: 'ice', candidate: { candidate: c.candidate, sdpMid: c.sdpMid as string | null, sdpMLineIndex: c.sdpMLineIndex as number | null,
    ...(typeof c.usernameFragment === 'string' ? { usernameFragment: c.usernameFragment } : {}) } };
}
export class VoiceRouter {
  private readonly ice: (client: VoiceClient) => VoiceIceConfig;
  private readonly now: () => number;
  private readonly entityId: (client: VoiceClient) => number | null;
  private readonly sessions = new Map<VoiceClient, Session>();
  private readonly members = new Map<number, Member>();
  private nextId = 1;
  constructor(options: { ice: (client: VoiceClient) => VoiceIceConfig; now?: () => number; entityId?: (client: VoiceClient) => number | null }) { this.ice = options.ice; this.now = options.now ?? Date.now; this.entityId = options.entityId ?? (() => null); }
  private authenticated(c: VoiceClient): boolean { return !c.closed && !c.ephemeral && !!c.profile && integer(c.id,1,Number.MAX_SAFE_INTEGER) && integer(c.pid,1,Number.MAX_SAFE_INTEGER) && c.profile.id === c.pid; }
  connected(c: VoiceClient): void {
    if (!this.authenticated(c)) return;
    if (!this.sessions.has(c)) this.sessions.set(c, { member: null, messageTokens: SIGNAL_BURST, byteTokens: BYTE_BURST, controlTokens: 12, at: this.now(), errorAt: -Infinity, peers: new Map() });
    this.config(c); this.state(c);
  }
  private config(c: VoiceClient): void {
    try { c.sink.sendJson({ t: 'voiceConfig', enabled: true, maxPeers: VOICE_MAX_PEERS, bitrate: VOICE_BITRATE, ...this.ice(c) }); }
    catch { this.error(c, 'invalid'); }
  }
  /** Участник ещё в своей зоне (клиент мог уйти в другую комнату, а переход ещё не разобран). */
  private live(p: Member): boolean { return this.authenticated(p.client) && !!p.client.room && zoneOf(p.client.room) === p.zone; }
  private state(c: VoiceClient): void {
    if (!this.authenticated(c)) return;
    const zone = c.room ? zoneOf(c.room) : null;
    const member = this.sessions.get(c)?.member;
    c.sink.sendJson({ t: 'voiceState', self: member && zone !== null && member.zone === zone ? member.id : null, room: c.room?.kind ?? '',
      zone: c.room ? voiceZoneName(c.room.kind) : '',
      peers: zone === null ? [] : [...this.members.values()].filter(p => p.client !== c && p.zone === zone && this.live(p))
        // значок над головой — только тем, кто в той же комнате: номера фигурок у каждой комнаты свои
        .map(p => { const entityId = p.client.room === c.room ? this.entityId(p.client) : null;
          return { id: p.id, entityId: integer(entityId, 1, Number.MAX_SAFE_INTEGER) ? entityId : null, pid: p.client.pid, nick: p.client.nick, talking: p.talkingUntil > this.now(), mic: p.mic }; }) });
  }
  private changed(zone: ZoneKey): void { for (const c of this.sessions.keys()) if (c.room && zoneOf(c.room) === zone) this.state(c); }
  private remove(c: VoiceClient): boolean {
    const session = this.sessions.get(c), m = session?.member; if (!session || !m) return false;
    this.members.delete(m.id); session.member = null; this.changed(m.zone); return true;
  }
  private join(c: VoiceClient): void {
    const session = this.sessions.get(c)!;
    if (session.member) { this.state(c); return; }
    if (!c.room) { this.error(c,'not_joined'); this.state(c); return; }
    if (!Number.isSafeInteger(this.nextId)) { this.error(c,'invalid'); this.state(c); return; }
    const member: Member = { id: this.nextId++, client: c, room: c.room, zone: zoneOf(c.room), talkingUntil: 0, mic: false };
    session.member = member; this.members.set(member.id, member); this.changed(member.zone);
  }
  /** Переход в другую комнату. Та же зона (внешний мир) — номер в голосе и соединения сохраняются; другая — новый номер. */
  moved(c: VoiceClient): void {
    const session = this.sessions.get(c); if (!session) return;
    if (!this.authenticated(c)) { this.remove(c); this.clearPeerBudgets(c); this.sessions.delete(c); return; }
    const m = session.member, zone = c.room ? zoneOf(c.room) : null;
    if (m && zone !== null && m.zone === zone) {
      if (m.room !== c.room) { m.room = c.room!; this.changed(zone); } else this.state(c);
      return;
    }
    this.clearPeerBudgets(c);
    const joined = this.remove(c);
    if (joined) this.join(c); else this.state(c);
  }
  disconnected(c: VoiceClient): void { this.remove(c); this.clearPeerBudgets(c); this.sessions.delete(c); }
  private clearPeerBudgets(c: VoiceClient): void {
    this.sessions.get(c)?.peers.clear();
    for (const session of this.sessions.values()) session.peers.delete(c);
  }
  renamed(c: VoiceClient): void { const m = this.sessions.get(c)?.member; if (m && this.authenticated(c)) this.changed(m.zone); }
  private error(c: VoiceClient, code: VoiceErrorCode): void {
    const s = this.sessions.get(c), now = this.now();
    if (!s || !this.authenticated(c) || now - s.errorAt < 1000) return;
    s.errorAt = now; c.sink.sendJson({ t: 'voiceError', code });
  }
  private budget(c: VoiceClient, bytes: number, control: boolean, target?: VoiceClient): boolean {
    const session = this.sessions.get(c)!, now = this.now();
    // Only authenticated members of the same room can allocate a destination budget.
    // Keep it across voice leave/rejoin, so a new voice ID cannot reset flood protection.
    let bucket: SignalBudget = session;
    if (target) {
      let peer = session.peers.get(target);
      if (!peer) { peer = { messageTokens: SIGNAL_BURST, byteTokens: BYTE_BURST, at: now }; session.peers.set(target, peer); }
      bucket = peer;
    }
    const elapsed = Math.max(0, Math.min(10, (now - bucket.at) / 1000));
    bucket.at = now; bucket.messageTokens = Math.min(SIGNAL_BURST, bucket.messageTokens + elapsed * SIGNAL_RATE);
    bucket.byteTokens = Math.min(BYTE_BURST, bucket.byteTokens + elapsed * BYTE_RATE);
    if (!target) session.controlTokens = Math.min(12, session.controlTokens + elapsed * 4);
    if (bucket.messageTokens < 1 || bucket.byteTokens < bytes || control && session.controlTokens < 1) { this.error(c,'rate_limit'); return false; }
    bucket.messageTokens--; bucket.byteTokens -= bytes; if (control) session.controlTokens--; return true;
  }
  private rejectSignal(c: VoiceClient, bytes: number, code: VoiceErrorCode): void {
    if (this.budget(c, Math.min(bytes, VOICE_MAX_SIGNAL_TEXT), false)) this.error(c, code);
  }

  handle(c: VoiceClient, raw: unknown): void {
    if (!this.authenticated(c) || !this.sessions.has(c)) return;
    const session = this.sessions.get(c)!;
    if (session.member && session.member.room !== c.room) this.moved(c);
    if (!record(raw)) { if (this.budget(c,32,true)) this.error(c,'invalid'); return; }
    if (raw.t === 'voice') {
      // Privacy/cleanup controls may clear existing state even after a sender exhausts its budget.
      // They only broadcast on a real transition, so repeats cannot become a feedback amplifier.
      if (raw.a === 'leave' && exact(raw,['t','a']) && session.member) { this.remove(c); return; }
      if (raw.a === 'talk' && raw.on === false && exact(raw,['t','a','self','on']) && session.member && session.member.id === raw.self) {
        const m = session.member;
        if (m.talkingUntil) { m.talkingUntil = 0; this.changed(m.zone); }
        return;
      }
      // выключение микрофона — тоже уборка: только уменьшает число соединений, проходит и без запаса
      if (raw.a === 'mic' && raw.on === false && exact(raw,['t','a','on']) && session.member) {
        const m = session.member;
        if (m.mic) { m.mic = false; this.changed(m.zone); }
        return;
      }
      if (!this.budget(c,64,true)) return;
      if (raw.a === 'talk') {
        if (!exact(raw,['t','a','self','on']) || typeof raw.on !== 'boolean') return this.error(c,'invalid');
        const m = session.member; if (!m) return this.error(c,'not_joined'); if (raw.self !== m.id) return this.error(c,'stale');
        const was = m.talkingUntil > this.now(); m.talkingUntil = raw.on ? this.now() + VOICE_TALK_LEASE_MS : 0;
        if (was !== raw.on) this.changed(m.zone); return;
      }
      if (raw.a === 'mic') {
        if (!exact(raw,['t','a','on']) || typeof raw.on !== 'boolean') return this.error(c,'invalid');
        const m = session.member; if (!m) return this.error(c,'not_joined');
        if (m.mic !== raw.on) { m.mic = raw.on; this.changed(m.zone); }
        return;
      }
      if (!exact(raw,['t','a'])) return this.error(c,'invalid');
      if (raw.a === 'join') this.join(c);
      else if (raw.a === 'leave') { this.remove(c); this.state(c); }
      else if (raw.a === 'refresh') { this.config(c); this.state(c); }
      else this.error(c,'invalid');
      return;
    }
    if (raw.t !== 'voiceSignal') { if (this.budget(c,32,true)) this.error(c,'invalid'); return; }
    if (record(raw.signal) && (typeof raw.signal.sdp === 'string' && raw.signal.sdp.length > VOICE_MAX_SDP
      || record(raw.signal.candidate) && typeof raw.signal.candidate.candidate === 'string' && raw.signal.candidate.candidate.length > 1024)) {
      if (this.budget(c, VOICE_MAX_SIGNAL_TEXT, false)) this.error(c,'invalid'); return;
    }
    let bytes: number;
    try { bytes = Buffer.byteLength(JSON.stringify(raw)); }
    catch { if (this.budget(c,128,false)) this.error(c,'invalid'); return; }
    if (bytes > VOICE_MAX_SIGNAL_TEXT) return this.rejectSignal(c,bytes,'invalid');
    if (!exact(raw,['t','self','to','signal']) || !integer(raw.self,1,Number.MAX_SAFE_INTEGER) || !integer(raw.to,1,Number.MAX_SAFE_INTEGER)) return this.rejectSignal(c,bytes,'invalid');
    const from = session.member, to = this.members.get(raw.to), zone = c.room ? zoneOf(c.room) : null;
    if (!from) return this.rejectSignal(c,bytes,'not_joined');
    if (from.id !== raw.self || !to || to === from || !this.live(to) || zone === null || from.zone !== zone || to.zone !== zone) return this.rejectSignal(c,bytes,'stale');
    if (!this.budget(c,bytes,false,to.client)) return;
    const value = signal(raw.signal); if (!value) return this.error(c,'invalid');
    to.client.sink.sendJson({ t: 'voiceSignal', from: from.id, to: to.id, signal: value });
  }
  step(): void {
    const now = this.now();
    for (const [c,s] of this.sessions) {
      if (!this.authenticated(c)) { this.disconnected(c); continue; }
      if (s.member?.room !== c.room && s.member) { this.moved(c); continue; }
      if (s.member && s.member.talkingUntil > 0 && s.member.talkingUntil <= now) { s.member.talkingUntil = 0; this.changed(s.member.zone); }
    }
  }
}

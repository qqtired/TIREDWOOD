import { isIP } from 'node:net';
import { VOICE_BITRATE, VOICE_MAX_PEERS, VOICE_MAX_SDP, VOICE_MAX_SIGNAL_TEXT, VOICE_TALK_LEASE_MS,
  type VoiceErrorCode, type VoiceIceConfig, type VoiceServerMsg, type VoiceSignal } from '../shared/voice.ts';
export interface VoiceClient {
  id: number; pid: number; nick: string; profile: { id: number } | null;
  room: { kind: string } | null; closed: boolean; ephemeral: boolean;
  sink: { sendJson(message: VoiceServerMsg): void };
}
interface Member { id: number; client: VoiceClient; room: { kind: string }; talkingUntil: number }
interface Session { member: Member | null; messageTokens: number; byteTokens: number; controlTokens: number; at: number; errorAt: number }
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
    if (!this.sessions.has(c)) this.sessions.set(c, { member: null, messageTokens: SIGNAL_BURST, byteTokens: BYTE_BURST, controlTokens: 12, at: this.now(), errorAt: -Infinity });
    this.config(c); this.state(c);
  }
  private config(c: VoiceClient): void {
    try { c.sink.sendJson({ t: 'voiceConfig', enabled: true, maxPeers: VOICE_MAX_PEERS, bitrate: VOICE_BITRATE, ...this.ice(c) }); }
    catch { this.error(c, 'invalid'); }
  }
  private state(c: VoiceClient): void {
    if (!this.authenticated(c)) return;
    const member = this.sessions.get(c)?.member;
    c.sink.sendJson({ t: 'voiceState', self: member?.room === c.room ? member.id : null, room: c.room?.kind ?? '',
      peers: [...this.members.values()].filter(p => p.client !== c && p.room === c.room && this.authenticated(p.client) && p.client.room === p.room)
        .map(p => { const entityId = this.entityId(p.client); return { id: p.id, entityId: integer(entityId, 1, Number.MAX_SAFE_INTEGER) ? entityId : null, nick: p.client.nick, talking: p.talkingUntil > this.now() }; }) });
  }
  private changed(room: object): void { for (const c of this.sessions.keys()) if (c.room === room) this.state(c); }
  private remove(c: VoiceClient): boolean {
    const session = this.sessions.get(c), m = session?.member; if (!session || !m) return false;
    this.members.delete(m.id); session.member = null; this.changed(m.room); return true;
  }
  private join(c: VoiceClient): void {
    const session = this.sessions.get(c)!;
    if (session.member) { this.state(c); return; }
    if (!c.room) { this.error(c,'not_joined'); this.state(c); return; }
    const peers = [...this.members.values()].filter(m => m.room === c.room && this.authenticated(m.client) && m.client.room === m.room);
    if (peers.length >= VOICE_MAX_PEERS || !Number.isSafeInteger(this.nextId)) { this.error(c,'full'); this.state(c); return; }
    const member: Member = { id: this.nextId++, client: c, room: c.room, talkingUntil: 0 };
    session.member = member; this.members.set(member.id, member); this.changed(member.room);
  }
  moved(c: VoiceClient): void {
    const session = this.sessions.get(c); if (!session) return;
    const joined = this.remove(c);
    if (!this.authenticated(c)) { this.sessions.delete(c); return; }
    if (joined) this.join(c); else this.state(c);
  }
  disconnected(c: VoiceClient): void { this.remove(c); this.sessions.delete(c); }
  renamed(c: VoiceClient): void { const m = this.sessions.get(c)?.member; if (m && this.authenticated(c)) this.changed(m.room); }
  private error(c: VoiceClient, code: VoiceErrorCode): void {
    const s = this.sessions.get(c), now = this.now();
    if (!s || !this.authenticated(c) || now - s.errorAt < 1000) return;
    s.errorAt = now; c.sink.sendJson({ t: 'voiceError', code });
  }
  private budget(c: VoiceClient, bytes: number, control: boolean): boolean {
    const s = this.sessions.get(c)!, now = this.now(), elapsed = Math.max(0, Math.min(10, (now - s.at) / 1000));
    s.at = now; s.messageTokens = Math.min(SIGNAL_BURST, s.messageTokens + elapsed * SIGNAL_RATE);
    s.byteTokens = Math.min(BYTE_BURST, s.byteTokens + elapsed * BYTE_RATE); s.controlTokens = Math.min(12, s.controlTokens + elapsed * 4);
    if (s.messageTokens < 1 || s.byteTokens < bytes || control && s.controlTokens < 1) { this.error(c,'rate_limit'); return false; }
    s.messageTokens--; s.byteTokens -= bytes; if (control) s.controlTokens--; return true;
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
        if (m.talkingUntil) { m.talkingUntil = 0; this.changed(m.room); }
        return;
      }
      if (!this.budget(c,64,true)) return;
      if (raw.a === 'talk') {
        if (!exact(raw,['t','a','self','on']) || typeof raw.on !== 'boolean') return this.error(c,'invalid');
        const m = session.member; if (!m) return this.error(c,'not_joined'); if (raw.self !== m.id) return this.error(c,'stale');
        const was = m.talkingUntil > this.now(); m.talkingUntil = raw.on ? this.now() + VOICE_TALK_LEASE_MS : 0;
        if (was !== raw.on) this.changed(m.room); return;
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
    if (!this.budget(c,bytes,false)) return;
    if (bytes > VOICE_MAX_SIGNAL_TEXT) return this.error(c,'invalid');
    if (!exact(raw,['t','self','to','signal']) || !integer(raw.self,1,Number.MAX_SAFE_INTEGER) || !integer(raw.to,1,Number.MAX_SAFE_INTEGER)) return this.error(c,'invalid');
    const from = session.member, to = this.members.get(raw.to);
    if (!from) return this.error(c,'not_joined');
    if (from.id !== raw.self || !to || to === from || !this.authenticated(to.client) || to.client.room !== to.room || from.room !== c.room || to.room !== c.room) return this.error(c,'stale');
    const value = signal(raw.signal); if (!value) return this.error(c,'invalid');
    to.client.sink.sendJson({ t: 'voiceSignal', from: from.id, to: to.id, signal: value });
  }
  step(): void {
    const now = this.now();
    for (const [c,s] of this.sessions) {
      if (!this.authenticated(c)) { this.disconnected(c); continue; }
      if (s.member?.room !== c.room && s.member) { this.moved(c); continue; }
      if (s.member && s.member.talkingUntil > 0 && s.member.talkingUntil <= now) { s.member.talkingUntil = 0; this.changed(s.member.room); }
    }
  }
}

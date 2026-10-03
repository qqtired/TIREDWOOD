/** Optional live PTT. Signaling carries temporary ICE addresses/credentials, never audio samples or saved profile data; do not log it. */
export const VOICE_MAX_PEERS = 6;
export const VOICE_BITRATE = 32_000;
export const VOICE_MAX_SDP = 12_000;
export const VOICE_MAX_SIGNAL_TEXT = 16_384;
export const VOICE_TALK_LEASE_MS = 1_800;

export interface VoiceIceServer { urls: string[]; username?: string; credential?: string }
export interface VoiceIceConfig { iceServers: VoiceIceServer[]; expiresAt: number | null; relayOnly: boolean }
export interface VoicePeer { id: number; entityId: number | null; nick: string; talking: boolean }
export type VoiceSignal =
  | { kind: 'offer' | 'answer'; sdp: string }
  | { kind: 'ice'; candidate: { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null; usernameFragment?: string } | null };
export type VoiceErrorCode = 'disabled' | 'full' | 'not_joined' | 'stale' | 'invalid' | 'rate_limit';
export type VoiceClientMsg =
  | { t: 'voice'; a: 'join' | 'leave' | 'refresh' }
  | { t: 'voice'; a: 'talk'; self: number; on: boolean }
  | { t: 'voiceSignal'; self: number; to: number; signal: VoiceSignal };
export type VoiceServerMsg =
  | ({ t: 'voiceConfig'; enabled: true; maxPeers: number; bitrate: number } & VoiceIceConfig)
  | { t: 'voiceState'; self: number | null; room: string; peers: VoicePeer[] }
  | { t: 'voiceSignal'; from: number; to: number; signal: VoiceSignal }
  | { t: 'voiceError'; code: VoiceErrorCode };

export type VoiceLinkState = 'connecting' | 'connected' | 'failed';
export type VoiceMicState = 'off' | 'requesting' | 'ready' | 'denied' | 'unavailable';
export interface VoiceView {
  available: boolean; enabled: boolean; joined: boolean; room: string;
  mic: VoiceMicState; playbackBlocked: boolean; transmitting: boolean; receiving: boolean; gameMuted: boolean; volume: number;
  maxPeers: number; error: string;
  presence: VoicePeer[];
  peers: Array<VoicePeer & { muted: boolean; link: VoiceLinkState }>;
}

/** One transport/capture gate shared by keyboard and the microphone button. */
export function voiceCanTransmit(view: Pick<VoiceView, 'enabled' | 'joined' | 'mic' | 'playbackBlocked' | 'peers'>): boolean {
  return view.enabled && view.joined && view.mic === 'ready' && !view.playbackBlocked
    && (view.peers.length === 0 || view.peers.some(peer => peer.link === 'connected'));
}

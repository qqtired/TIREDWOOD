/** Optional live PTT. Signaling carries temporary ICE addresses/credentials, never audio samples or saved profile data; do not log it. */
import type { RoomKind } from './messages.ts';

/** Wire compatibility: zero means no separate voice participant limit; room admission still applies. */
export const VOICE_MAX_PEERS = 0;
export const VOICE_BITRATE = 32_000;
export const VOICE_MAX_SDP = 12_000;
export const VOICE_MAX_SIGNAL_TEXT = 16_384;
export const VOICE_TALK_LEASE_MS = 1_800;

/**
 * Голосовые зоны. «world» — внешний мир: одна зона на всех, кто в нём (набережная, город, море и регата у пирса,
 * баркас, будущий остров и паром) — переход между такими комнатами голос не рвёт. «instance» — отдельный мир, куда
 * телепортируют: у каждого экземпляра комнаты свой голос (крепость, картинг, «Выше облаков», прятки, пейнтбол,
 * Fight Club). Новый вид комнаты без строки здесь не скомпилируется — остров добавляется одной строкой.
 */
export const VOICE_ZONES: Record<RoomKind, 'world' | 'instance'> = {
  lobby: 'world',
  race: 'instance',
  paintball: 'instance',
  fort: 'instance',
  fight: 'instance',
  skill: 'instance',
  hide: 'instance',
  dungeon: 'instance',
};
export const VOICE_WORLD = 'world';

/** Имя зоны для клиента: «world» или вид комнаты-инстанса. Неизвестный вид — отдельная зона. */
export function voiceZoneName(kind: string): string {
  return (VOICE_ZONES as Record<string, string | undefined>)[kind] === 'world' ? VOICE_WORLD : kind;
}

export interface VoiceIceServer { urls: string[]; username?: string; credential?: string }
export interface VoiceIceConfig { iceServers: VoiceIceServer[]; expiresAt: number | null; relayOnly: boolean }
/** Участник голосовой зоны. id — номер в голосе (меняется при смене зоны), pid — профиль (постоянный: по нему
 *  запоминается заглушение и громкость), entityId — фигурка в той же комнате (для значка над головой), mic — включён
 *  ли у него микрофон (соединения поднимаются только там, где микрофон есть хотя бы у одного из двоих). */
export interface VoicePeer { id: number; entityId: number | null; pid: number; nick: string; talking: boolean; mic: boolean }
export type VoiceSignal =
  | { kind: 'offer' | 'answer'; sdp: string }
  | { kind: 'ice'; candidate: { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null; usernameFragment?: string } | null }
  /** Отвечающая сторона просит предлагающую перезапустить ICE (связь пропала) */
  | { kind: 'restart' };
export type VoiceErrorCode = 'disabled' | 'full' | 'not_joined' | 'stale' | 'invalid' | 'rate_limit';
export type VoiceClientMsg =
  | { t: 'voice'; a: 'join' | 'leave' | 'refresh' }
  | { t: 'voice'; a: 'talk'; self: number; on: boolean }
  /** Микрофон включён/выключен: к включившему подключаются слушатели зоны */
  | { t: 'voice'; a: 'mic'; on: boolean }
  | { t: 'voiceSignal'; self: number; to: number; signal: VoiceSignal };
export type VoiceServerMsg =
  | ({ t: 'voiceConfig'; enabled: true; maxPeers: number; bitrate: number } & VoiceIceConfig)
  /** room — вид комнаты; zone — голосовая зона («world» или вид инстанса) */
  | { t: 'voiceState'; self: number | null; room: string; zone: string; peers: VoicePeer[] }
  | { t: 'voiceSignal'; from: number; to: number; signal: VoiceSignal }
  | { t: 'voiceError'; code: VoiceErrorCode };

/** none — соединение не нужно (оба только слушают) */
export type VoiceLinkState = 'none' | 'connecting' | 'connected' | 'failed';
export type VoiceMicState = 'off' | 'requesting' | 'ready' | 'denied' | 'unavailable';
/** hold — говорить, пока держишь V; toggle — V включает и выключает */
export type VoiceMode = 'hold' | 'toggle';
export interface VoicePerson extends VoicePeer { muted: boolean; volume: number; link: VoiceLinkState }
export interface VoiceView {
  available: boolean;
  /** «Слышать голос» включено: в канале своей зоны */
  enabled: boolean; joined: boolean; room: string; zone: string;
  mic: VoiceMicState; playbackBlocked: boolean; transmitting: boolean;
  /** Совместимость со старым видом: то же, что enabled */
  receiving: boolean;
  gameMuted: boolean; volume: number; mode: VoiceMode; noise: boolean; device: string;
  /** Связь с игровым сервером пропала, ждём возврата (голосовые соединения живут дальше) */
  linkDown: boolean;
  maxPeers: number;
  /** Постоянная беда (микрофон запрещён, голос на сервере выключен); notice — короткая подсказка */
  error: string; notice: string;
  /** Все в зоне, кроме себя: и те, с кем соединения нет (оба только слушают) */
  presence: VoicePeer[];
  /** Те же люди с настройками и состоянием связи */
  people: VoicePerson[];
  /** Только те, с кем соединение нужно (link не 'none') */
  peers: VoicePerson[];
}

/** One transport/capture gate shared by keyboard and the microphone button. */
export function voiceCanTransmit(view: Pick<VoiceView, 'enabled' | 'joined' | 'mic' | 'peers'>): boolean {
  return view.enabled && view.joined && view.mic === 'ready'
    && (view.peers.length === 0 || view.peers.some(peer => peer.link === 'connected'));
}

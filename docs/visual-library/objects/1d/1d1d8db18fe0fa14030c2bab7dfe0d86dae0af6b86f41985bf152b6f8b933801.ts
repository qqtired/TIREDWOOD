// Настройки голоса этого браузера (localStorage opus.voice.v1): слышать ли голос, громкость, режим микрофона,
// устройство, шумоподавление и, для каждого человека (по номеру профиля), заглушён ли он и его громкость.
// Отдельный ключ от общих настроек игры: меню их показывает, но хранит голос сам.
import type { VoiceMode } from '../shared/voice.ts';

export interface VoicePeerPref { muted: boolean; volume: number }
export interface VoicePrefs {
  /** «Слышать голос»: после входа сразу в канале, без микрофона */
  listen: boolean;
  /** Общая громкость голоса 0…1 */
  volume: number;
  mode: VoiceMode;
  /** deviceId микрофона; '' — как в системе */
  device: string;
  /** Шумоподавление браузера */
  noise: boolean;
  /** По номеру профиля */
  peers: Record<string, VoicePeerPref>;
}

export const VOICE_PREFS_KEY = 'opus.voice.v1';
const MAX_PEERS = 200;

export function defaultVoicePrefs(): VoicePrefs {
  return { listen: true, volume: 1, mode: 'hold', device: '', noise: true, peers: {} };
}

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;
function store(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

const unit = (v: unknown, def: number): number => typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : def;

/** Чтение с нормализацией: мусор и старые форматы не ломают голос — берутся значения по умолчанию. */
export function loadVoicePrefs(storage: Storage | null = store()): VoicePrefs {
  const p = defaultVoicePrefs();
  let raw: unknown = null;
  try { raw = JSON.parse(storage?.getItem(VOICE_PREFS_KEY) ?? 'null'); } catch { raw = null; }
  if (!raw || typeof raw !== 'object') return p;
  const r = raw as Record<string, unknown>;
  if (typeof r.listen === 'boolean') p.listen = r.listen;
  p.volume = unit(r.volume, p.volume);
  if (r.mode === 'hold' || r.mode === 'toggle') p.mode = r.mode;
  if (typeof r.device === 'string' && r.device.length <= 512) p.device = r.device;
  if (typeof r.noise === 'boolean') p.noise = r.noise;
  if (r.peers && typeof r.peers === 'object') {
    for (const [pid, v] of Object.entries(r.peers as Record<string, unknown>).slice(0, MAX_PEERS)) {
      if (!/^\d{1,12}$/.test(pid) || !v || typeof v !== 'object') continue;
      const q = v as Record<string, unknown>;
      const pref = { muted: q.muted === true, volume: unit(q.volume, 1) };
      if (pref.muted || pref.volume !== 1) p.peers[pid] = pref;
    }
  }
  return p;
}

export function saveVoicePrefs(p: VoicePrefs, storage: Storage | null = store()): void {
  try { storage?.setItem(VOICE_PREFS_KEY, JSON.stringify(p)); } catch { /* приватный режим — просто не запоминаем */ }
}

/** Работающий голос (VoiceController): его громкость — живая, меняет звук сразу и сохраняется им самим */
export interface VoiceVolumeOwner {
  readonly view: { volume: number; presence?: ReadonlyArray<VoiceTalker> };
  setVolume(volume: number): void;
  /** Громкость и «заглушить» одного человека: меню Tab и вкладка «Голос» меняют одно и то же */
  setPeerMuted?(pid: number, muted: boolean): void;
  setPeerVolume?(pid: number, volume: number): void;
  subscribe?(fn: () => void): () => void;
}
/** Человек в голосе (номер профиля), говорит ли сейчас, включён ли микрофон */
export interface VoiceTalker { pid: number; talking: boolean; mic: boolean }
let volumeOwner: VoiceVolumeOwner | null = null;
/** Голос включился или пропал (client/ui/voicepanel.ts → setVoiceSource) */
export function setVoiceVolumeOwner(owner: VoiceVolumeOwner | null): void { volumeOwner = owner; }

/**
 * Громкость голосов игроков 0…1 — одна на меню «Звук» и вкладку «Голос»: у работающего голоса — его, иначе — из
 * сохранения (голос прочитает её, когда включится).
 */
export function voiceVolume(storage: Storage | null = store()): number {
  return volumeOwner ? volumeOwner.view.volume : loadVoicePrefs(storage).volume;
}
export function setVoiceVolume(volume: number, storage: Storage | null = store()): void {
  if (!Number.isFinite(volume)) return;
  if (volumeOwner) { volumeOwner.setVolume(volume); return; }
  const p = loadVoicePrefs(storage);
  p.volume = unit(volume, p.volume);
  saveVoicePrefs(p, storage);
}

export function peerPref(p: VoicePrefs, pid: number): VoicePeerPref {
  return p.peers[String(pid)] ?? { muted: false, volume: 1 };
}

/**
 * Настройки людей для меню Tab: читаем сохранённое (работающий голос сохраняет каждое изменение сразу), так что и тот,
 * кого сейчас нет в голосе, — со своей громкостью.
 */
export function peerVoices(storage: Storage | null = store()): (pid: number) => VoicePeerPref {
  const p = loadVoicePrefs(storage);
  return (pid) => peerPref(p, pid);
}

/** Поменять громкость или «заглушить» человека: голос работает — через него (звук меняется сразу), иначе — в сохранение */
export function setPeerVoice(pid: number, patch: Partial<VoicePeerPref>, storage: Storage | null = store()): void {
  if (!Number.isSafeInteger(pid) || pid <= 0) return;
  const owner = volumeOwner;
  if (owner?.setPeerMuted && owner.setPeerVolume) {
    if (patch.volume !== undefined && Number.isFinite(patch.volume)) owner.setPeerVolume(pid, patch.volume);
    if (patch.muted !== undefined) owner.setPeerMuted(pid, patch.muted);
    return;
  }
  const p = loadVoicePrefs(storage);
  setPeerPref(p, pid, patch);
  saveVoicePrefs(p, storage);
}

/** Кто сейчас в голосе (без себя); голоса нет — никого */
export function voiceTalkers(): ReadonlyArray<VoiceTalker> {
  return volumeOwner?.view.presence ?? [];
}

/** Подписка на перемены голоса (кто говорит); голоса нет — ничего */
export function onVoiceChange(fn: () => void): () => void {
  return volumeOwner?.subscribe?.(fn) ?? (() => {});
}

/** Записать настройку человека; обычные (не заглушён, 100 %) не храним. */
export function setPeerPref(p: VoicePrefs, pid: number, patch: Partial<VoicePeerPref>): void {
  if (!Number.isSafeInteger(pid) || pid <= 0) return;
  const next = { ...peerPref(p, pid), ...patch };
  next.volume = unit(next.volume, 1);
  if (!next.muted && next.volume === 1) delete p.peers[String(pid)];
  else {
    p.peers[String(pid)] = next;
    const keys = Object.keys(p.peers);
    if (keys.length > MAX_PEERS) delete p.peers[keys[0]];
  }
}

import { VOICE_MAX_SIGNAL_TEXT } from '../shared/voice.ts';
import { MSG_SNAPSHOT, SNAP_SELF_RESET } from '../shared/protocol.ts';

/** Preserve the ordinary 2k-character budget. SDP is the one opt-in exception, still inside WSS's 16 KiB limit. */
export function parseClientJson(text: string, voice: boolean): unknown | null {
  if (Buffer.byteLength(text, 'utf8') > VOICE_MAX_SIGNAL_TEXT || (!voice && text.length > 2000)) return null;
  let value: unknown;
  try { value = JSON.parse(text); } catch { return null; }
  if (text.length > 2000 && (!value || typeof value !== 'object' || (value as { t?: unknown }).t !== 'voiceSignal')) return null;
  return value;
}

interface JsonSocket {
  readonly OPEN: number; readonly readyState: number; readonly bufferedAmount: number;
  send(data: string): unknown;
  close(code: number, reason: string): unknown;
}
interface BinarySocket {
  readonly OPEN: number; readonly readyState: number; readonly bufferedAmount: number;
  send(data: Uint8Array, options: { binary: boolean }): unknown;
  close(code: number, reason: string): unknown;
}
const CONTROL_HIGH_WATER = 1024 * 1024;
const SNAPSHOT_HIGH_WATER = 512 * 1024;

/** All JSON is control/state, not replaceable snapshots. Preserve the established call signature. */
export function sendServerJson<T extends { t: string }>(socket: JsonSocket, message: T, _voice: boolean, onBackpressure?: () => void): void {
  if (socket.readyState !== socket.OPEN) return;
  sendServerText(socket, JSON.stringify(message), onBackpressure);
}

/** То же для готовой строки JSON: связь сессии (link.ts) сериализует один раз и хранит строку для возврата после обрыва. */
export function sendServerText(socket: JsonSocket, text: string, onBackpressure?: () => void): void {
  if (socket.readyState !== socket.OPEN) return;
  if (socket.bufferedAmount >= CONTROL_HIGH_WATER) {
    onBackpressure?.();
    socket.close(1013, 'backpressure');
    return;
  }
  socket.send(text);
}

/** Ordinary snapshots can be replaced. A one-shot selfReset must reach the client or force a fresh handshake. */
export function sendServerBinary(socket: BinarySocket, data: Uint8Array, onBackpressure?: () => void): void {
  if (socket.readyState !== socket.OPEN) return;
  // Snapshot flags are byte9 in shared/protocol.ts; regression tests use its real encoder.
  const reset = data.length > 9 && data[0] === MSG_SNAPSHOT && (data[9] & SNAP_SELF_RESET) !== 0;
  if (socket.bufferedAmount >= (reset ? CONTROL_HIGH_WATER : SNAPSHOT_HIGH_WATER)) {
    if (reset) { onBackpressure?.(); socket.close(1013, 'backpressure'); }
    return;
  }
  socket.send(data, { binary: true });
}

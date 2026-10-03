import { createHmac, randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import type { VoiceIceConfig, VoiceIceServer } from '../shared/voice.ts';
export const VOICE_TURN_TTL_MS = 12 * 60 * 60_000;
export interface VoiceCredentialClient { id: number; pid: number; profile: { id: number } | null; closed: boolean; ephemeral: boolean }
type Env = Record<string, string | undefined>;
const invalid = (): never => { throw new Error('Invalid voice configuration'); };
function urls(raw: string | undefined, defaults: readonly string[], turn: boolean): string[] {
  if (raw === undefined) return [...defaults];
  if (typeof raw !== 'string' || raw.length > 4096) return invalid();
  const result = raw.trim() ? raw.trim().split(/[\s,]+/) : [];
  if (result.length > 8) return invalid();
  for (const uri of result) {
    if (uri.length > 512 || !/^[\x21-\x7e]+$/.test(uri)) return invalid();
    const match = /^(stun|stuns|turn|turns):(?:\[([^\]]+)\]|([^:\/?#@]+))(?::(\d+))?(?:\?transport=(udp|tcp))?$/.exec(uri);
    if (!match || (turn ? !match[1].startsWith('turn') : !match[1].startsWith('stun'))) return invalid();
    const host = match[2] ?? match[3];
    if (match[2] ? isIP(host) !== 6 : !isIP(host) && (/^[\d.]+$/.test(host)
      || !/^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)*[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(host))) return invalid();
    if (match[4] && (+match[4] < 1 || +match[4] > 65535)) return invalid();
    if (!turn && match[5] || match[1] === 'turns' && match[5] === 'udp') return invalid();
  }
  return [...new Set(result)];
}
/** Configuration is checked once at startup. No source secret or endpoint appears in errors.
 * coturn REST: username expiry seconds + random opaque nonce, password base64(HMAC-SHA1(secret,username)). */
export function voiceConfigFromEnv(env: Env, now: () => number = Date.now): (client: VoiceCredentialClient) => VoiceIceConfig {
  const stun = urls(env.VOICE_STUN_URLS, ['stun:stun.cloudflare.com:3478'], false);
  const turn = urls(env.VOICE_TURN_URLS, [], true);
  const secret = env.VOICE_TURN_SECRET;
  if (turn.length ? !secret || secret.length < 16 || secret.length > 4096 : secret !== undefined && secret !== '') return invalid();
  if (stun.length + turn.length > 8) return invalid();
  if (env.VOICE_RELAY_ONLY !== undefined && env.VOICE_RELAY_ONLY !== '0' && env.VOICE_RELAY_ONLY !== '1') return invalid();
  const relayOnly = env.VOICE_RELAY_ONLY === '1';
  if (relayOnly && !turn.length) return invalid();
  return (client) => {
    if (client.closed || client.ephemeral || !client.profile || !Number.isSafeInteger(client.id) || client.id <= 0
      || !Number.isSafeInteger(client.pid) || client.pid <= 0 || client.profile.id !== client.pid) throw new Error('Voice unavailable');
    const iceServers: VoiceIceServer[] = stun.length ? [{ urls: [...stun] }] : [];
    let expiresAt: number | null = null;
    if (turn.length) {
      const stamp = now();
      if (!Number.isFinite(stamp) || stamp < 0 || stamp > Number.MAX_SAFE_INTEGER - VOICE_TURN_TTL_MS) throw new Error('Voice unavailable');
      expiresAt = Math.floor((stamp + VOICE_TURN_TTL_MS) / 1000) * 1000;
      const username = `${expiresAt / 1000}:${randomBytes(12).toString('hex')}`;
      const credential = createHmac('sha1', secret!).update(username).digest('base64');
      iceServers.push({ urls: [...turn], username, credential });
    }
    return { iceServers, expiresAt, relayOnly };
  };
}
export const fromEnv = voiceConfigFromEnv;

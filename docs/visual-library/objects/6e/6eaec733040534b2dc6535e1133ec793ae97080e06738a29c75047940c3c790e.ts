import { createHash, timingSafeEqual } from 'node:crypto';
import { DEVIL_GIFT_ITEMS, GIFT_CODE_MAX_LENGTH, type GiftResultCode } from '../shared/gifts.ts';
import type { Profiles } from './profiles.ts';
import { RateLimiter } from './ratelimit.ts';
import type { Profile } from './store.ts';

/** Только серверный клиент после входа; сообщение не может выбирать профиль. */
export interface GiftClient {
  pid: number;
  profile: Profile | null;
  closed: boolean;
  ephemeral: boolean;
  ip?: string;
}

const WINDOW_MS = 60_000;

export class GiftCodes {
  private readonly profiles: Profiles;
  private readonly expected: Buffer | null;
  private readonly limits: RateLimiter;

  constructor(options: { profiles: Profiles; codeHash: string | null; now?: () => number }) {
    this.profiles = options.profiles;
    this.expected = typeof options.codeHash === 'string' && /^[a-fA-F0-9]{64}$/.test(options.codeHash)
      ? Buffer.from(options.codeHash, 'hex') : null;
    this.limits = new RateLimiter(options.now);
  }

  get enabled(): boolean { return this.expected !== null; }

  handle(client: GiftClient, rawCode: unknown): GiftResultCode {
    const p = client.profile;
    if (client.closed || client.ephemeral || !p || !Number.isSafeInteger(client.pid) || client.pid <= 0
      || p.id !== client.pid || this.profiles.byId(client.pid) !== p) return 'unavailable';
    if (!this.expected) return 'disabled';
    this.limits.sweep(WINDOW_MS);
    if (!this.limits.hit(`profile:${p.id}`, 5, WINDOW_MS)) return 'rate_limit';
    if (client.ip && !this.limits.hit(`ip:${client.ip}`, 20, WINDOW_MS)) return 'rate_limit';
    if (typeof rawCode !== 'string' || rawCode.length > GIFT_CODE_MAX_LENGTH) return 'invalid';
    const code = rawCode.trim();
    // Проверяем ASCII до uppercase: Unicode-преобразования не должны создавать подходящий код.
    if (!/^[A-Za-z0-9-]+$/.test(code)) return 'invalid';
    const actual = createHash('sha256').update(code.toUpperCase()).digest();
    if (!timingSafeEqual(actual, this.expected)) return 'invalid';
    return this.profiles.grantSet(p, DEVIL_GIFT_ITEMS);
  }
}

/** Campaign entitlements only. The redeem code/hash must never be bundled with the client. */
export const DEVIL_GIFT_ITEMS = ['h:devil', 'a:deviltail'] as const;
export const GIFT_CODE_MAX_LENGTH = 64;
export type GiftResultCode = 'granted' | 'already' | 'invalid' | 'rate_limit' | 'disabled' | 'unavailable';
export type GiftClientMsg = { t: 'redeem'; code: string };
export type GiftServerMsg = { t: 'redeemResult'; result: GiftResultCode };

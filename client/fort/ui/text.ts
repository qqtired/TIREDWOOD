// Слова и значки интерфейса «Крепости» без DOM (грузится в тестах): какой картинкой рисовать врага, тревогу
// и событие волны, откуда идёт волна, цвет ника в точках команды. Картинки — id из client/assets/ui/icons/ или
// client/assets/fort/ (их адрес даёт ui/icons.ts — там import.meta.glob, сюда его нельзя).
import {
  Z_ARMORED, Z_BLOATER, Z_BOAT, Z_BOSS, Z_BRUTE, Z_CLIMBER, Z_FLYER, Z_GOLEM, Z_KRAKEN, Z_LESHY, Z_MEDIC, Z_PUMPKIN, Z_RAM,
  Z_RUNNER, Z_SAPPER, Z_SHIELD, Z_SPITTER, Z_TENTACLE, Z_WALKER, Z_WEAVER,
} from '../../../shared/fortkinds.ts';
import { EV_FOG, EV_GOLD, EV_METEORS, EV_SUPPLY } from '../../../shared/fortwaves.ts';

/** Враг → картинка. Своих картинок нет у части врагов — ближайшая похожая (список — в отчёте задачи 7, «Missing icons») */
const FOE: Record<number, string> = {
  [Z_WALKER]: 'zombie', [Z_RUNNER]: 'runner', [Z_BRUTE]: 'brute', [Z_CLIMBER]: 'climber', [Z_BLOATER]: 'bomb', [Z_FLYER]: 'bat',
  [Z_BOSS]: 'boss', [Z_SHIELD]: 'shield', [Z_SPITTER]: 'paint', [Z_SAPPER]: 'bomb', [Z_MEDIC]: 'medic', [Z_ARMORED]: 'zombie',
  [Z_RAM]: 'boss', [Z_GOLEM]: 'boss', [Z_BOAT]: 'landing', [Z_TENTACLE]: 'kraken', [Z_KRAKEN]: 'kraken', [Z_PUMPKIN]: 'boss',
  [Z_WEAVER]: 'boss', [Z_LESHY]: 'rift-tree',
};

export function foeIcon(kind: number): string {
  return FOE[kind] ?? 'zombie';
}

/** Событие волны: картинка, имя, что делать */
export const EVENT_TEXT: Readonly<Record<number, { icon: string; name: string; hint: string }>> = {
  [EV_METEORS]: { icon: 'meteor', name: 'Метеоры', hint: 'красные круги бьют всех — двигайся' },
  [EV_SUPPLY]: { icon: 'supply', name: 'Сброс припасов', hint: 'ящик с жёлтым дымом — подбери: E' },
  [EV_GOLD]: { icon: 'gold', name: 'Золотая лихорадка', hint: 'враги быстрее, награда ×2' },
  [EV_FOG]: { icon: 'fog', name: 'Морской туман', hint: 'видно недалеко — смотри на светящиеся глаза' },
};

/** Эмодзи в начале строки тревоги (match.ts, krakenfx.ts, bosses-f.ts) → картинка тоста */
const LEAD: Record<string, string> = {
  '🚪': 'gate', '💎': 'crystal', '🧗': 'climber', '☄': 'meteor', '💦': 'paint', '💣': 'bomb', '🐗': 'boss', '🛡': 'shield',
  '🍳': 'shield', '⚓': 'landing', '⛵': 'landing', '👑': 'boss', '🌟': 'gold', '🌫': 'fog', '📦': 'supply', '🔔': 'bell',
  '🐙': 'kraken', '🪨': 'boss', '🎃': 'boss', '🕷': 'boss', '🕸': 'boss', '🌳': 'rift-tree', '💪': 'brute', '✪': 'champion',
  '🔨': 'hammer', '🏰': 'ballista', '🔫': 'shotgun', '🏆': 'records', '⭐': 'level', '⚔': 'records', '🏳': 'white-flag',
};
/** Спокойные тревоги (колокол, припасы, щит) — сведения, не опасность */
const CALM = new Set(['bell', 'supply', 'hammer', 'ballista', 'shotgun']);
const LEAD_RE = /^(\p{Extended_Pictographic}|[☄✪⚓⚔])[\u{FE0F}\u{200D}\p{Extended_Pictographic}]*\s*/u;

export type ToastTone = 'info' | 'reward' | 'warn' | 'good';

export interface AlarmText {
  icon: string;
  title: string;
  sub: string;
  tone: ToastTone;
}

/**
 * Строка тревоги или подтверждения → тост: значок по эмодзи в начале (нет — «внимание»), заголовок до первого « · »,
 * остальное — подстрокой. Теги (<b>) убираем: тост пишет текст, а не разметку.
 */
export function alarmText(raw: string, fallback = 'warn'): AlarmText {
  const text = raw.replace(/<[^>]*>/g, '').trim();
  const m = LEAD_RE.exec(text);
  const lead = m ? m[1] : '';
  const icon = (lead && LEAD[lead]) || fallback;
  const body = m ? text.slice(m[0].length) : text;
  const cut = body.indexOf(' · ');
  const title = cut < 0 ? body : body.slice(0, cut);
  const sub = cut < 0 ? '' : body.slice(cut + 3);
  return { icon, title, sub, tone: CALM.has(icon) ? 'info' : 'warn' };
}

const ROAD_FROM = ['запада', 'севера', 'востока'];

/** Откуда идёт волна: «идут с севера», «идут с запада и востока», «идут с севера, запада и моря» */
export function roadsText(roads: readonly number[], boats = 0): string {
  const from = roads.map((r) => ROAD_FROM[r]).filter(Boolean);
  if (boats > 0) from.push('моря');
  if (!from.length) return '';
  const list = from.length === 1 ? from[0] : `${from.slice(0, -1).join(', ')} и ${from[from.length - 1]}`;
  return `идут с ${list}`;
}

/** Цвет ника (1…6) — так же, как в чате (client/chat.ts nickTone) */
export function nickTone(nick: string): number {
  let h = 0;
  for (const ch of nick) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return (h % 6) + 1;
}

/** «лавка оружейника» → «Лавка оружейника» */
export function capFirst(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** 3,4 */
export function sec1(s: number): string {
  return (Math.max(0, s)).toFixed(1).replace('.', ',');
}

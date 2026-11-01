// Пакет «Т-идеи» крепости, клиент без DOM и без three: разбор сообщения fideas, строки окна ремёсел, вид голосования
// за карточку, замедление, слабое место в прицеле. Всё, что решает игрок, считает сервер (server/fort), здесь — только
// вид и подсказки. Модуль грузят тесты (test/fort-ideas-client.test.ts), поэтому import.meta.glob сюда нельзя.
import { TICK_RATE } from '../../../shared/constants.ts';
import type { PanelRow } from '../../../shared/fortarsenal.ts';
import { zombieRay } from '../../../shared/fortaim.ts';
import {
  CARDS, CARD_VOTE_S, CRAFTS, CRAFT_GUNNER, CRAFT_MASON, CRAFT_NONE, CRAFT_RIFLE, CRAFT_SAPPER, ELITE_SCALE, RACK, RACK_REACH, SLOW_RATE,
  TRAMP_REACH, TRAMP_SPOTS, USE_CRAFT, type CardDef, type FortIdeasMsg,
} from '../../../shared/fortideas.ts';
import { WEAK_SPOTS, weakHit, weakSpotWorld } from '../../../shared/fortweak.ts';

/** Сервер проверяет досягаемость строго (server/fort/ideas.ts), поэтому подсказка — с небольшим запасом внутрь */
export const NEAR_PAD = -0.05;

// ------------------------------------------------------------ состояние из сообщения fideas

export interface VoteState {
  ids: string[];
  votes: number[];
  /** Свой голос: 0…2, −1 — не голосовал */
  mine: number;
  /** Тик конца голосования */
  end: number;
}

export interface IdeasState {
  ideas: boolean;
  elite: boolean;
  /** Номер игрока → ремесло */
  crafts: Map<number, number>;
  full: boolean;
  tramps: number;
  taken: string[];
  vote: VoteState | null;
}

export function emptyIdeas(): IdeasState {
  return { ideas: false, elite: false, crafts: new Map(), full: false, tramps: 0, taken: [], vote: null };
}

const finite = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** Сообщение сервера → состояние; лишние и недостающие поля не страшны (новые поля шлют JSON-ом без смены формата) */
export function readIdeas(m: Partial<FortIdeasMsg> | null | undefined): IdeasState {
  const s = emptyIdeas();
  if (!m) return s;
  s.ideas = m.ideas === true;
  s.elite = m.elite === true;
  for (const row of Array.isArray(m.crafts) ? m.crafts : []) {
    if (Array.isArray(row) && Number.isFinite(row[0]) && cardOrCraftOk(row[1])) s.crafts.set(row[0], row[1]);
  }
  s.full = m.full === true;
  s.tramps = finite(m.tramps) | 0;
  s.taken = (Array.isArray(m.taken) ? m.taken : []).filter((id) => typeof id === 'string' && !!cardById(id));
  const v = m.vote;
  if (v && Array.isArray(v.ids) && v.ids.length > 0) {
    const ids = v.ids.filter((id) => typeof id === 'string' && !!cardById(id)).slice(0, 3);
    if (ids.length > 0) {
      s.vote = {
        ids,
        votes: ids.map((_, i) => Math.max(0, finite(v.votes?.[i]) | 0)),
        mine: Number.isInteger(v.mine) && v.mine >= 0 && v.mine < ids.length ? v.mine : -1,
        end: finite(v.end),
      };
    }
  }
  return s;
}

function cardOrCraftOk(c: unknown): c is number {
  return typeof c === 'number' && c >= CRAFT_NONE && c <= CRAFT_RIFLE;
}

// ------------------------------------------------------------ имена и значки

export function cardById(id: string): CardDef | undefined {
  return CARDS.find((c) => c.id === id);
}

/** Значок карточки: id картинки из client/assets/ui/icons или client/assets/fort */
export const CARD_ICON: Readonly<Record<string, string>> = {
  pierce: 'crossbow', stones: 'card-stones', repair: 'hammer', tar: 'tar', towers: 'rate', bounty: 'gold', mag: 'mag',
  bandage: 'heart', crystal: 'crystal', eye: 'headshot',
  goldtowers: 'ballista', squall: 'crit', stonewalls: 'card-wall', grenadebox: 'pouch',
};

export function cardIcon(id: string): string {
  return CARD_ICON[id] ?? 'level';
}

/** Значок ремесла: те же ключи, что у шапок (CraftDef.hat) */
export const CRAFT_ICON: Readonly<Record<number, string>> = {
  [CRAFT_MASON]: 'craft-mason', [CRAFT_GUNNER]: 'craft-gunner', [CRAFT_SAPPER]: 'craft-sapper', [CRAFT_RIFLE]: 'craft-rifle',
};

export function craftName(c: number): string {
  return CRAFTS.find((d) => d.id === c)?.name ?? '';
}

// ------------------------------------------------------------ вешалка и батуты

/** Как на сервере (server/fort/ideas.ts): стоять надо у земли, не на лестнице и стене */
const REACH_Y = 0.6;

export function nearRack(x: number, y: number, z: number): boolean {
  return Math.hypot(x - RACK.x, z - RACK.z) <= RACK_REACH + NEAR_PAD && Math.abs(y) <= REACH_Y;
}

/** Номер места батута рядом (−1 — нет) */
export function nearTramp(x: number, y: number, z: number): number {
  let best = -1;
  let bd = Infinity;
  for (let i = 0; i < TRAMP_SPOTS.length; i++) {
    const d = Math.hypot(x - TRAMP_SPOTS[i].x, z - TRAMP_SPOTS[i].z);
    if (d <= TRAMP_REACH + NEAR_PAD && Math.abs(y) <= REACH_Y && d < bd) {
      best = i;
      bd = d;
    }
  }
  return best;
}

/** Окно ремёсел: четыре ремесла и «Без ремесла»; own — моё сейчас, calm — можно менять (сбор и передышка) */
export function craftRows(own: number, calm: boolean): PanelRow[] {
  const rows: PanelRow[] = CRAFTS.map((c) => ({
    id: USE_CRAFT + c.id, key: 'craft', icon: CRAFT_ICON[c.id] ?? 'level', name: c.name, detail: c.text, tier: -1, max: 0, price: 0,
    reason: calm ? '' : 'в передышке', locked: !calm && own !== c.id, tag: own === c.id ? 'Надето' : calm ? 'Взять' : undefined,
  }));
  rows.push({
    id: USE_CRAFT + CRAFT_NONE, key: 'craft', icon: 'release', name: 'Без ремесла', detail: 'шапка и умения не нужны', tier: -1, max: 0, price: 0,
    reason: calm ? '' : 'в передышке', locked: !calm && own !== CRAFT_NONE, tag: own === CRAFT_NONE ? 'Сейчас' : calm ? 'Снять' : undefined,
  });
  return rows;
}

// ------------------------------------------------------------ карточки: голосование

export interface VoteView {
  cards: Array<{ def: CardDef; votes: number; mine: boolean; lead: boolean }>;
  /** Осталось секунд (целых, вверх) и доля полосы 0…1 */
  sec: number;
  frac: number;
  total: number;
  voted: boolean;
}

export function voteView(v: VoteState, tick: number): VoteView {
  const left = Math.max(0, (v.end - tick) / TICK_RATE);
  const top = Math.max(...v.votes, 0);
  const cards = v.ids.map((id, i) => ({
    def: cardById(id) ?? { id, name: id, text: '', gold: false },
    votes: v.votes[i] ?? 0,
    mine: v.mine === i,
    lead: top > 0 && (v.votes[i] ?? 0) === top,
  }));
  return {
    cards, sec: Math.ceil(left), frac: Math.round(Math.max(0, Math.min(1, left / CARD_VOTE_S)) * 100) / 100,
    total: v.votes.reduce((a, b) => a + b, 0), voted: v.mine >= 0,
  };
}

/** Клавиши 1/2/3 → номер карточки (−1 — не она) */
export function digitCard(code: string, count: number): number {
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(code);
  if (!m) return -1;
  const n = Number(m[1]) - 1;
  return n < count ? n : -1;
}

export function clock(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ------------------------------------------------------------ замедление (Т-27)

/** Плавность входа и выхода, с */
export const SLOW_FADE_S = 0.15;

/** Доля замедления 0…1: растёт за SLOW_FADE_S после начала и спадает за SLOW_FADE_S до конца; leftS — осталось секунд */
export function slowAmount(leftS: number, spentS: number): number {
  if (leftS <= 0) return 0;
  return Math.max(0, Math.min(1, spentS / SLOW_FADE_S, leftS / SLOW_FADE_S));
}

/** Темп анимаций мобов при доле замедления k (1 — обычный) */
export function slowTimeScale(k: number): number {
  return 1 + (SLOW_RATE - 1) * k;
}

// ------------------------------------------------------------ слабые места в прицеле (Т-23)

const _tg = new Float64Array(4);
const _spot = [0, 0, 0, 0];

export interface WeakAim {
  /** Расстояние входа луча в слабое место и его центр с радиусом */
  t: number;
  x: number;
  y: number;
  z: number;
  r: number;
}

/**
 * Луч прицела (o, d — единичный, длиннее maxT не считаем) против слабого места одного моба: попал ли в слабое место
 * по правилу сервера — луч входит в шар не глубже WEAK_DEPTH за входом в тело. false — у вида нет места, луч мимо тела
 * или слабое место закрыто телом.
 */
export function aimWeak(
  kind: number, x: number, y: number, z: number, yaw: number, scale: number,
  ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number, out: WeakAim,
): boolean {
  if (!WEAK_SPOTS[kind]) return false;
  weakSpotWorld(kind, x, y, z, yaw, scale, _spot);
  // быстрый отсев: луч далеко от шара
  const lx = _spot[0] - ox;
  const ly = _spot[1] - oy;
  const lz = _spot[2] - oz;
  const tc = lx * dx + ly * dy + lz * dz;
  if (tc < 0 || tc > maxT) return false;
  const d2 = lx * lx + ly * ly + lz * lz - tc * tc;
  const reach = _spot[3] + 0.05;
  if (d2 > reach * reach) return false;
  _tg[0] = x;
  _tg[1] = y;
  _tg[2] = z;
  _tg[3] = kind;
  const body = zombieRay(ox, oy, oz, dx, dy, dz, _tg, 0, scale);
  if (body < 0 || body > maxT || !weakHit(ox, oy, oz, dx, dy, dz, body, _spot)) return false;
  out.t = tc;
  out.x = _spot[0];
  out.y = _spot[1];
  out.z = _spot[2];
  out.r = _spot[3];
  return true;
}

/** Рост моба по ступени: при elite в fideas элита и чемпион крупнее */
export function mobScale(elite: boolean, tier: number): number {
  return elite ? ELITE_SCALE[Math.max(0, Math.min(2, tier))] ?? 1 : 1;
}

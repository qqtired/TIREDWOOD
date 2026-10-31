// «Общее» на сервере (флаг SOCIAL, shared/social.ts): кнопка «Позвать» (О-1) со строкой в Telegram (О-2, флаг TG_CALL),
// викторина в общем чате (Р-2, server/chatquiz.ts) и огни букв TIREDWOOD (Н-5). Класс не знает про Hub: всё нужное ему
// даёт SocialHost (хаб в server/hub.ts) — поэтому проверяется тестами без сервера (test/social.test.ts).
//
// «Позвать»: игрок на набережной (в крепости — только «в крепость») зовёт в круг сбора, к «Ракушке» или в крепость. Не чаще
// раза в CALL_GAP_MS. Позванные на набережной получают плашку «Иду» и световой столб над входом, позванные в режимах —
// строку в общий чат. Если в игре меньше трёх, TgCall (server/tgcall.ts) пишет одну строку в группу.
//
// Огни букв: каждая доигранная партия двух и больше людей зажигает следующую букву надписи на горе; режим даёт не больше
// LETTERS_PER_MODE букв за вечер. Вечер кончается в 06:00 по Москве. Девятая буква — салют и жетоны тем, кто зажигал.
// Состояние (какая буква горит, кто зажигал) — DATA_DIR/social.json: после перезапуска буквы горят до утра.
import { closeSync, fsyncSync, openSync, readFileSync, renameSync, writeSync } from 'node:fs';
import path from 'node:path';
import { FISH } from '../shared/fishing.ts';
import type { RoomKind, ServerMsg } from '../shared/messages.ts';
import {
  CALL_ASK_MS, CALL_BEAM_MS, CALL_GAP_MS, CALL_INFO, LETTERS_PER_MODE, LETTERS_REWARD, LETTER_COUNT, LETTER_MODES, ROOM_PLACE,
  isCallKind, mskWeekStart, nightOf, type CallKind, type LetterMode, type SocialClientMsg,
} from '../shared/social.ts';
import type { State } from './store.ts';
import type { ChatQuestion, ChatQuiz } from './chatquiz.ts';
import type { TgCall } from './tgcall.ts';

export const SOCIAL_FILE = 'social.json';
const DAY = 86_400_000;
/** Итоги недели уходят в понедельник после этого часа по Москве (и не позже конца понедельника) */
export const DIGEST_HOUR = 12;
/** Сайт в строках для Telegram */
const SITE = 'game.tired.solutions';

/** Игрок, как его видит Social: хаб даёт тонкую обёртку над Client */
export interface SocialPeer {
  readonly pid: number;
  readonly nick: string;
  readonly room: RoomKind | null;
  send(msg: ServerMsg): void;
}

export interface SocialHost {
  now(): number;
  /** Все в игре (с профилем, не проверочные), в любой комнате */
  peers(): SocialPeer[];
  /** Системная строка в общий чат всем, но не в журнал чата */
  announceLive(text: string): void;
  /** Системная строка в общий чат (с журналом) */
  announce(text: string): void;
  /** Строка в общий чат только этим игрокам */
  sayTo(pids: readonly number[], text: string): void;
  toast(p: SocialPeer, text: string): void;
  /** Начислить жетоны профилю (и онлайн, и нет); false — профиля нет */
  pay(pid: number, tokens: number): boolean;
  /** Выполнить через столько тиков хаба */
  later(ticks: number, fn: () => void): void;
  log(s: string): void;
  /** Состояние хранилища — для итогов недели */
  state(): State;
}

export interface SocialOptions {
  host: SocialHost;
  /** DATA_DIR: здесь social.json */
  dir: string;
  /** Зов в Telegram (флаг TG_CALL); нет — только в игре */
  tg?: TgCall | null;
  /** Викторина в чате: объект Р-2 (server/chatquiz.ts); нет — без неё */
  quiz?: ChatQuiz | null;
}

interface LetterState {
  night: number;
  lit: number;
  modes: Partial<Record<LetterMode, number>>;
  lighters: number[];
  boomed: boolean;
}

/** Улов недели: лучший за день, храним 8 дней */
interface CatchLog { at: number; nick: string; sp: number; g: number }
interface Saved { letters: LetterState; catches: CatchLog[] }

interface Call { kind: CallKind; from: number; nick: string; until: number; answered: Set<number> }

function fresh(night: number): LetterState {
  return { night, lit: 0, modes: {}, lighters: [], boomed: false };
}

function readSaved(file: string): Partial<Saved> {
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as unknown;
    return raw && typeof raw === 'object' ? raw as Partial<Saved> : {};
  } catch {
    return {};
  }
}

function parseLetters(raw: unknown, night: number): LetterState {
  const r = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  if (r.night !== night) return fresh(night);
  const lit = Math.min(LETTER_COUNT, Math.max(0, Math.floor(Number(r.lit) || 0)));
  const modes: Partial<Record<LetterMode, number>> = {};
  const rm = r.modes && typeof r.modes === 'object' ? r.modes as Record<string, unknown> : {};
  for (const m of LETTER_MODES) {
    const n = Math.floor(Number(rm[m]) || 0);
    if (n > 0) modes[m] = Math.min(LETTERS_PER_MODE, n);
  }
  const lighters = Array.isArray(r.lighters) ? r.lighters.filter((x): x is number => Number.isSafeInteger(x) && x > 0) : [];
  return { night, lit, modes, lighters: [...new Set(lighters)], boomed: r.boomed === true && lit >= LETTER_COUNT };
}

function parseCatches(raw: unknown): CatchLog[] {
  if (!Array.isArray(raw)) return [];
  const out: CatchLog[] = [];
  for (const c of raw) {
    if (!c || typeof c !== 'object') continue;
    const o = c as Record<string, unknown>;
    if (typeof o.nick === 'string' && Number.isFinite(o.at) && Number.isInteger(o.sp) && Number.isFinite(o.g)) {
      out.push({ at: Number(o.at), nick: o.nick.slice(0, 20), sp: Number(o.sp), g: Number(o.g) });
    }
  }
  return out.slice(-16);
}

// ------------------------------------------------------------ итоги недели

export interface DigestData {
  fort?: { wave: number; names: string[] };
  regatta?: { ms: number; nick: string };
  dungeon?: { waves: number; nick: string };
  catch?: { nick: string; sp: number; g: number };
}

const wavesWord = (n: number): string => {
  const d = n % 10, h = n % 100;
  return d === 1 && h !== 11 ? 'волна' : d >= 2 && d <= 4 && (h < 12 || h > 14) ? 'волны' : 'волн';
};

function lapText(ms: number): string {
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}` : `${s.toFixed(1)} с`;
}

function weightText(g: number): string {
  return g >= 1000 ? `${(g / 1000).toFixed(1).replace('.', ',')} кг` : `${Math.round(g)} г`;
}

/** Текст итогов недели; null — за неделю нечего сказать (в группу пустое не шлём) */
export function formatDigest(d: DigestData): string | null {
  const lines: string[] = [];
  if (d.fort) lines.push(`🏰 Крепость: ${d.fort.wave} ${wavesWord(d.fort.wave)} — ${d.fort.names.slice(0, 4).join(', ')}`);
  if (d.dungeon) lines.push(`🕳 Подземелье: ${d.dungeon.waves} ${wavesWord(d.dungeon.waves)} — ${d.dungeon.nick}`);
  if (d.regatta) lines.push(`🚤 Регата: лучший круг ${lapText(d.regatta.ms)} — ${d.regatta.nick}`);
  if (d.catch) lines.push(`🎣 Лучший улов: ${FISH[d.catch.sp]?.name ?? 'рыба'} ${weightText(d.catch.g)} — ${d.catch.nick}`);
  if (!lines.length) return null;
  return `📊 Итоги недели в TIREDWOOD\n${lines.join('\n')}\n\nЗаходи, побей рекорды: ${SITE}`;
}

/** Рекорды за последние 7 дней из хранилища */
export function collectDigest(state: State, catches: readonly CatchLog[], now: number): DigestData {
  const since = now - 7 * DAY;
  const d: DigestData = {};
  const fort = (state.fortTop ?? []).filter((r) => r.at >= since && r.wave > 0).sort((a, b) => b.wave - a.wave)[0];
  if (fort) d.fort = { wave: fort.wave, names: fort.names };
  const lap = state.regatta.filter((r) => r.at >= since && r.ms > 0).sort((a, b) => a.ms - b.ms)[0];
  if (lap) d.regatta = { ms: lap.ms, nick: lap.nick };
  const dg = (state.dgTop ?? []).filter((r) => r.at >= since && r.waves > 0).sort((a, b) => b.waves - a.waves)[0];
  if (dg) d.dungeon = { waves: dg.waves, nick: dg.nick };
  const fish = catches.filter((c) => c.at >= since).sort((a, b) => b.g - a.g)[0];
  if (fish) d.catch = { nick: fish.nick, sp: fish.sp, g: fish.g };
  return d;
}

// ------------------------------------------------------------ Social

export class Social {
  private readonly h: SocialHost;
  private readonly file: string;
  private readonly tg: TgCall | null;
  readonly quiz: ChatQuiz | null;
  private letters: LetterState;
  private catches: CatchLog[];
  private readonly lastCall = new Map<number, number>();
  private readonly calls = new Map<number, Call>();
  private nextCall = 1;
  /** Партии, закончившиеся в этом тике: режим → кто участвовал и дошёл ли кто-то до конца */
  private readonly pending = new Map<LetterMode, { pids: Set<number>; done: boolean }>();
  private statAt = 0;

  constructor(o: SocialOptions) {
    this.h = o.host;
    this.file = path.join(o.dir, SOCIAL_FILE);
    this.tg = o.tg ?? null;
    this.quiz = o.quiz ?? null;
    const saved = readSaved(this.file);
    this.letters = parseLetters(saved.letters, nightOf(this.h.now()));
    this.catches = parseCatches(saved.catches);
  }

  /** Сколько букв горит сейчас */
  get lit(): number {
    this.rollNight();
    return this.letters.lit;
  }

  // ------------------------------------------------------------ вход и выход

  joined(p: SocialPeer): void {
    p.send({ t: 'social', call: 1, quiz: this.quiz ? 1 : 0, lit: this.lit });
  }

  left(pid: number): void {
    this.quiz?.left(pid);
  }

  onMessage(p: SocialPeer, msg: SocialClientMsg): void {
    if (msg.t === 'call') this.call(p, msg.kind);
    else if (msg.t === 'callGo') this.go(p, msg.id);
    else if (msg.t === 'socPref') this.quiz?.setOn(p.pid, msg.quiz === true);
  }

  /** Строка игрока в общем чате: ответ на вопрос викторины */
  chat(p: SocialPeer, text: string): void {
    try { this.quiz?.onChat(p.pid, text); } catch { /* викторина не должна мешать чату */ }
  }

  // ------------------------------------------------------------ «Позвать»

  /** Сколько секунд до следующего зова игрока (0 — можно) */
  callWait(pid: number): number {
    const t = this.lastCall.get(pid);
    return t === undefined ? 0 : Math.max(0, Math.ceil((CALL_GAP_MS - (this.h.now() - t)) / 1000));
  }

  private call(from: SocialPeer, kind: unknown): void {
    if (!isCallKind(kind)) return;
    // зовут с набережной; из крепости — только в крепость (Tab крепости)
    if (from.room !== 'lobby' && !(from.room === 'fort' && kind === 'fort')) {
      this.h.toast(from, 'Позвать можно с набережной');
      from.send({ t: 'callWait', sec: 0 });
      return;
    }
    const wait = this.callWait(from.pid);
    if (wait > 0) {
      this.h.toast(from, `Звать можно раз в 2 минуты — ещё ${wait} с`);
      from.send({ t: 'callWait', sec: wait });
      return;
    }
    const now = this.h.now();
    const peers = this.h.peers();
    const others = peers.filter((p) => p.pid !== from.pid);
    const info = CALL_INFO[kind];
    const tg = this.tg;
    if (!others.length && !tg) {
      this.h.toast(from, 'Пока в игре больше никого');
      from.send({ t: 'callWait', sec: 0 });
      return;
    }
    this.lastCall.set(from.pid, now);
    from.send({ t: 'callWait', sec: Math.ceil(CALL_GAP_MS / 1000) });
    const id = this.nextCall++;
    this.calls.set(id, { kind, from: from.pid, nick: from.nick, until: now + CALL_ASK_MS, answered: new Set() });
    const inMode: number[] = [];
    for (const p of others) {
      // кто уже в том месте, куда зовут (в крепости — «в крепость»), приглашение не нужно
      if (p.room === 'lobby') {
        p.send({ t: 'callAsk', id, kind, nick: from.nick, ms: CALL_ASK_MS });
        p.send({ t: 'callBeam', kind, ms: CALL_BEAM_MS });
      } else if (p.room !== 'fort' || kind !== 'fort') inMode.push(p.pid);
    }
    // тому, кто позвал, столб тоже виден: видно, что зов ушёл
    if (from.room === 'lobby') from.send({ t: 'callBeam', kind, ms: CALL_BEAM_MS });
    if (inMode.length) this.h.sayTo(inMode, `📣 ${from.nick} зовёт ${info.on} — приходи на набережную!`);
    this.h.toast(from, others.length ? `Позвал друзей ${info.on}` : 'Никого рядом — зову друзей в Telegram');
    if (tg) {
      const text = `${from.nick} ${ROOM_PLACE[from.room ?? 'lobby']}, зовёт ${info.on} — ${SITE}`;
      void tg.call({ pid: from.pid, online: peers.length, text })
        .then((st) => {
          this.h.log(`[зов] ${from.nick}: ${info.title}, Telegram: ${st}`);
          if (st === 'sent') this.h.toast(from, 'Написал и в Telegram');
        })
        .catch(() => this.h.log('[зов] Telegram: сбой'));
    }
    this.pruneCalls(now);
  }

  /** «Иду» на приглашение: зовущему приходит «идёт» (один раз от человека) */
  private go(p: SocialPeer, id: unknown): void {
    const c = typeof id === 'number' ? this.calls.get(id) : undefined;
    if (!c || c.until < this.h.now() || c.from === p.pid || c.answered.has(p.pid)) return;
    c.answered.add(p.pid);
    const caller = this.h.peers().find((x) => x.pid === c.from);
    if (caller) this.h.toast(caller, `${p.nick} идёт ${CALL_INFO[c.kind].on}`);
  }

  private pruneCalls(now: number): void {
    for (const [id, c] of this.calls) if (c.until + 5000 < now) this.calls.delete(id);
  }

  // ------------------------------------------------------------ огни букв

  /**
   * Игрок pid закончил партию режима mode (done — дошёл до конца). Все такие вызовы одного тика — одна партия:
   * через пару тиков по ним решаем, зажигать ли букву.
   */
  result(mode: LetterMode, pid: number, done = true): void {
    if (pid <= 0) return;
    let cur = this.pending.get(mode);
    if (!cur) {
      cur = { pids: new Set(), done: false };
      this.pending.set(mode, cur);
      this.h.later(2, () => {
        const m = this.pending.get(mode);
        this.pending.delete(mode);
        if (m?.done) this.matchDone(mode, [...m.pids]);
      });
    }
    cur.pids.add(pid);
    if (done) cur.done = true;
  }

  /** Партия закончена людьми pids (двое и больше): зажечь следующую букву. true — зажглась */
  matchDone(mode: LetterMode, pids: readonly number[]): boolean {
    this.rollNight();
    const who = [...new Set(pids.filter((p) => p > 0))];
    const l = this.letters;
    if (who.length < 2 || l.lit >= LETTER_COUNT || (l.modes[mode] ?? 0) >= LETTERS_PER_MODE) return false;
    l.lit++;
    l.modes[mode] = (l.modes[mode] ?? 0) + 1;
    for (const p of who) if (!l.lighters.includes(p)) l.lighters.push(p);
    const last = l.lit >= LETTER_COUNT;
    if (last) l.boomed = true;
    this.save();
    this.broadcastLetters(last);
    const names = this.h.peers().filter((p) => who.includes(p.pid)).map((p) => p.nick).slice(0, 4);
    if (last) {
      this.h.announce(`🎆 Все девять букв TIREDWOOD горят! Салют над бухтой, каждому, кто зажигал, — по ${LETTERS_REWARD} 🪙`);
      for (const pid of l.lighters) {
        const ok = this.h.pay(pid, LETTERS_REWARD);
        const p = this.h.peers().find((x) => x.pid === pid);
        if (ok && p) this.h.toast(p, `Огни TIREDWOOD: +${LETTERS_REWARD} 🪙`);
      }
    } else {
      this.h.announce(`🔥 Зажглась буква «${'TIREDWOOD'[l.lit - 1]}» на горе — ${l.lit} из ${LETTER_COUNT}${names.length ? ` (${names.join(', ')})` : ''}`);
    }
    return true;
  }

  private broadcastLetters(boom: boolean): void {
    const msg: ServerMsg = boom ? { t: 'letters', lit: this.letters.lit, boom: 1 } : { t: 'letters', lit: this.letters.lit };
    for (const p of this.h.peers()) p.send(msg);
  }

  /** Новый вечер (06:00 по Москве) — буквы гаснут */
  private rollNight(): void {
    const night = nightOf(this.h.now());
    if (this.letters.night === night) return;
    const was = this.letters.lit;
    this.letters = fresh(night);
    this.save();
    if (was > 0) this.broadcastLetters(false);
  }

  private save(): void {
    const body = JSON.stringify({ letters: this.letters, catches: this.catches } satisfies Saved) + '\n';
    const tmp = `${this.file}.tmp`;
    try {
      const fd = openSync(tmp, 'w', 0o600);
      try {
        writeSync(fd, body);
        fsyncSync(fd);
      } finally { closeSync(fd); }
      renameSync(tmp, this.file);
    } catch {
      this.h.log('social: не удалось сохранить social.json');
    }
  }

  // ------------------------------------------------------------ раз в секунду

  step(): void {
    const now = this.h.now();
    this.rollNight();
    try { this.quiz?.step(); } catch { /* игра важнее викторины */ }
    if (now < this.statAt) return;
    this.statAt = now + 60_000;
    this.pruneCalls(now);
    this.pollCatches(now);
    this.sendDigest(now);
  }

  /** Лучший улов недели: раз в минуту смотрим подиум дня (пять крупнейших уловов дня) */
  private pollCatches(now: number): void {
    const podium = this.h.state().fishPodium?.catches ?? [];
    let changed = false;
    for (const c of podium) {
      const day = Math.floor((c.at + 3 * 3600_000) / DAY);
      const mine = this.catches.find((x) => Math.floor((x.at + 3 * 3600_000) / DAY) === day);
      if (!mine) {
        this.catches.push({ at: c.at, nick: c.nick, sp: c.sp, g: c.g });
        changed = true;
      } else if (c.g > mine.g) {
        Object.assign(mine, { at: c.at, nick: c.nick, sp: c.sp, g: c.g });
        changed = true;
      }
    }
    const keep = this.catches.filter((c) => c.at >= now - 8 * DAY).slice(-16);
    if (keep.length !== this.catches.length) changed = true;
    this.catches = keep;
    if (changed) this.save();
  }

  /** Понедельник после DIGEST_HOUR по Москве: итоги недели в группу (раз в неделю — это держит TgCall) */
  private sendDigest(now: number): void {
    const tg = this.tg;
    if (!tg) return;
    const week = mskWeekStart(now);
    if (now < week + DIGEST_HOUR * 3600_000 || now >= week + DAY || !tg.digestDue(week)) return;
    const text = formatDigest(collectDigest(this.h.state(), this.catches, now));
    if (!text) return;
    void tg.digest({ weekStart: week, text })
      .then((st) => this.h.log(`[итоги недели] Telegram: ${st}`))
      .catch(() => this.h.log('[итоги недели] Telegram: сбой'));
  }
}

export type { ChatQuestion };

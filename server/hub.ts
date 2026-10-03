// Hub: все соединения, вход в профиль, переходы между комнатами, общий чат, «кто где».
// Один на процесс. Комнаты (набережная, пейнтбол, гонка) шагаются из общего цикла 60 тиков в секунду.
import { timingSafeEqual } from 'node:crypto';
import { PROTOCOL_VERSION, TICK_RATE } from '../shared/constants.ts';
import { addRecord } from '../shared/aqua.ts';
import { rgLapMs, type RgRecordRow, type RgRow } from '../shared/regatta.ts';
import type { HideResult } from '../shared/hide.ts';
import { FOOL_MS, type PbReward, type RcReward } from '../shared/economy.ts';
import { emptyFishProgress } from '../shared/fishprogress.ts';
import type { FcMode, FcResultRow, FcReward } from '../shared/fight.ts';
import type { FortResultRow, FortStatus, FtReward } from '../shared/fort.ts';
import { CLOSE_SILENCE, type ChatLine, type ClientMsg, type ErrorCode, type HonorInfo, type OnlineEntry, type PbStatus, type RaceResultRow, type RoomKind, type ServerMsg } from '../shared/messages.ts';
import { DEFAULT_OUTFIT, shownOutfit, type Outfit } from '../shared/outfit.ts';
import { MSG_INPUT, decodeInputs, inputEpoch } from '../shared/protocol.ts';
import type { RaceTrackId } from '../shared/racecourse.ts';
import { makeInput, type Input } from '../shared/sim.ts';
import { sanitizeChat } from '../shared/text.ts';
import { FightRoom } from './fight/room.ts';
import { FortRoom } from './fort/room.ts';
import type { DurakResult } from './lobby/durak.ts';
import { LobbyRoom } from './lobby/room.ts';
import type { WeatherMode } from './lobby/weather.ts';
import type { Player, Sink } from './paintball/game.ts';
import { PaintballRoom } from './paintball/room.ts';
import type { Profiles } from './profiles.ts';
import { RaceRoom } from './race/room.ts';
import { SkillRoom } from './skilltest/room.ts';
import type { SkillReward } from './skilltest/game.ts';
import { applySkillFinish } from '../shared/skilltest.ts';
import { mskDayNum } from '../shared/fishrules.ts';
import { HideRoom } from './hide/room.ts';
import { RateLimiter } from './ratelimit.ts';
import { ReadyGate } from './readygate.ts';
import type { Prestart } from '../shared/loading.ts';
import { emptyStats, type Profile, type Store } from './store.ts';
import type { TgFeed } from './tgfeed.ts';
import { SessionLink, type LinkSocket } from './link.ts';
import { VoiceRouter, type VoiceClient } from './voice.ts';
import type { VoiceIceConfig } from '../shared/voice.ts';
import { GiftCodes } from './gifts.ts';
import { grantLadder, ladderAnnounce, ladderToast } from './fishstyle.ts';

export type { Sink };

export interface Room {
  readonly kind: RoomKind;
  readonly humans: number;
  readonly tick: number;
  /** Existing per-room actor lookup; identifiers are room-local, never socket/client IDs. */
  playerOf?(c: Client): { id?: number; slot?: number } | undefined;
  /** Отсчёт перед стартом раунда, который ждёт загрузки всех (server/readygate.ts); null — сейчас ждать нечего */
  readonly prestart?: Prestart | null;
  hasSpace(): boolean;
  /** from — откуда пришёл (с пейнтбола на набережную — к воротам склада, из гонки — к гаражу) */
  join(c: Client, from: RoomKind | null): boolean;
  leave(c: Client): void;
  onInputs(c: Client, inputs: Input[], count: number): void;
  onMessage(c: Client, msg: ClientMsg): void;
  step(): void;
}

export class Client {
  readonly id: number;
  /** Связь сессии: комнаты шлют сюда, а сокет за ней может смениться (возврат после обрыва связи, link.ts) */
  readonly sink: SessionLink;
  readonly ip: string;
  profile: Profile | null = null;
  /** Временный профиль проверки после выкладки: не сохраняется, никому не виден */
  ephemeral = false;
  room: Room | null = null;
  epoch = 0;
  ping = 0;
  lastMove = -9999;
  helloTries = 0;
  closed = false;
  /** Когда открылось соединение (часы хаба) — для журнала */
  since = 0;
  /** Сколько ошибок браузера записано с этого соединения */
  errors = 0;
  /** Связь оборвалась, игрок ждёт в своей комнате возврата: когда (часы хаба) и почему; 0 — связь есть */
  lostAt = 0;
  lostWhy = '';
  /** Этот сокет вернул прежнюю сессию после обрыва: дальше его сообщения — ей */
  adopted: Client | null = null;
  /** Клиент попрощался (закрыл вкладку, обновил страницу): закрытие — сразу выход, без ожидания возврата */
  bye = false;

  constructor(id: number, sink: LinkSocket, ip: string) {
    this.id = id;
    this.sink = new SessionLink(sink);
    this.ip = ip;
  }

  get nick(): string {
    return this.profile?.nick ?? '';
  }

  get pid(): number {
    return this.profile?.id ?? 0;
  }
}

export interface HubOptions {
  store: Store;
  profiles: Profiles;
  /** Токен проверки после выкладки (файл DATA_DIR/smoke-token); пусто — вход проверки выключен */
  smokeToken: string;
  /** Номер сборки клиента: сменился после переподключения — клиент перезагружает страницу */
  build: string;
  /** Случайное число 0..63 для барабанов автоматов (подменяется в тестах и DEV_RIG) */
  roll?: () => number;
  /** Колода для раздачи в дурака (подменяется в тестах) */
  durakDeck?: () => number[];
  blackjackDeck?: () => number[];
  /** Погода на набережной: как в игре или для разработки (DEV_WEATHER) */
  weather?: WeatherMode;
  /** Экран с чатом друзей из Telegram на крыше склада (tgfeed.ts): нет — на экране заставка */
  tg?: TgFeed;
  /** «Крепость» (выпуск 6): комната есть, только если режим включён флагом сервера (FORTRESS) */
  fort?: boolean;
  /** «Fight Club» (выпуск 6): комната есть, только если режим включён флагом сервера (FIGHT) */
  fight?: boolean;
  skill?: boolean;
  boatrace?: boolean;
  hide?: boolean;
  storm?: boolean;
  pirates?: boolean;
  voice?: boolean;
  voiceIce?: (client: VoiceClient) => VoiceIceConfig;
  giftCodeHash?: string | null;
  devStorm?: boolean;
  devPirates?: boolean;
  /** Рыбалка 2.0: шкала вываживания, коллекция, доска у мостков — флаг сервера FISH2; нет — старая рыбалка */
  fish2?: boolean;
  /** Рулетка рыбака (ставка уловом из рюкзака) — флаг сервера ROULETTE, работает только с рыбалкой 2.0 */
  roulette?: boolean;
  /** Музыкальный автомат на площади (флаг сервера JUKEBOX, shared/jukebox.ts) */
  jukebox?: boolean;
  now?: () => number;
  log?: (s: string) => void;
}

const ERROR_TEXT: Record<ErrorCode, string> = {
  version: 'Вышла новая версия игры — обновляю страницу',
  need_nick: 'Придумай ник',
  nick_taken: 'Этот ник уже занят',
  bad_nick: 'Ник — от 2 до 16 символов: буквы, цифры, пробел, _ - .',
  bad_code: 'Код не подошёл или устарел',
  bad_key: 'Ключ устройства испорчен — обнови страницу',
  replaced: 'Ты зашёл в игру в другом окне',
  full: 'Сейчас мест нет, попробуй чуть позже',
  rate: 'Слишком много попыток — подожди немного',
};

/** Причина закрытия соединения по коду — для журнала. */
export function closeReason(code: number, reason = ''): string {
  switch (code) {
    case 1000:
    case 1005:
      return 'закрыл соединение';
    case 1001:
      return 'закрыл вкладку или обновил страницу';
    case 1006:
      return 'обрыв связи';
    case 1008:
      return reason === 'flood' ? 'слишком много сообщений' : 'нарушил протокол';
    case 1012:
      return 'перезапуск сервера';
    case 1013:
      return 'нет мест';
    case 4001:
      return 'зашёл в другом окне';
    case 4002:
      return 'старая версия';
    case CLOSE_SILENCE:
      return 'не слышал сервер 20 с';
    default:
      return `код ${code}`;
  }
}

/**
 * Текст из браузера для журнала: только строка, без переводов строк и управляющих символов;
 * в адресах — без сайта и параметров (в параметрах может оказаться что угодно).
 */
export function cleanLog(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v
    .slice(0, max * 4)
    .replace(/[a-z][\w+.-]*:\/\/[^/\s]+/gi, '')
    .replace(/(\/[^\s?#]*)[?#][^\s:)]*/g, '$1')
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** Сколько ждём возврата игрока после обрыва связи: всё это время он в своей комнате, на своём месте */
export const RESUME_MS = 45_000;

/**
 * Обрыв, после которого игрок может вернуться в ту же сессию. Не считаются: выход в меню (1000/1005), нарушение
 * и флуд (1008), перезапуск сервера (1012), вход в другом окне и старая версия. 1001 браузер шлёт и когда вкладку
 * закрыли, и когда заморозил её в фоне — закрытие клиент отмечает сам сообщением «bye».
 */
export function resumableClose(code: number): boolean {
  return ![1000, 1005, 1008, 1012, 4001, 4002].includes(code);
}

/** Не больше стольких ошибок браузера с одного соединения и в минуту с одного адреса */
const ERR_PER_CONN = 20;
const ERR_PER_MIN = 30;

function since(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 120 ? `${s} с` : `${Math.round(s / 60)} мин`;
}

const CHAT_KEEP = 30;
const MOVE_COOLDOWN = 2 * TICK_RATE;

export class Hub {
  readonly store: Store;
  readonly profiles: Profiles;
  readonly lobby: LobbyRoom;
  readonly paintball: PaintballRoom;
  readonly race: RaceRoom;
  readonly skill: SkillRoom | null;
  /** «Портовая регата» включена (флаг BOATRACE): гонка идёт в бухте набережной (server/lobby/regatta.ts) */
  readonly boatrace: boolean;
  readonly hide: HideRoom | null;
  private readonly voice: VoiceRouter | null;
  private readonly gifts: GiftCodes;
  /** «Крепость»: null — режим выключен флагом (арки на набережной не видно, вход закрыт) */
  readonly fort: FortRoom | null;
  /** «Fight Club»: null — режим выключен флагом (двери в подвал на набережной не видно, вход закрыт) */
  readonly fight: FightRoom | null;
  /** Экран с чатом друзей из Telegram: что на нём — входящему на набережную, новое — всем на набережной */
  readonly tg: TgFeed | null;
  /** Рыбалка 2.0 включена (флаг FISH2) */
  readonly fish2: boolean;
  /** Рулетка рыбака включена (флаг ROULETTE вместе с FISH2) */
  readonly roulette: boolean;
  readonly clients = new Set<Client>();
  readonly limits: RateLimiter;
  /** Ожидание загрузки перед стартом раунда (server/readygate.ts) */
  readonly gate = new ReadyGate(this);
  tick = 0;
  private readonly smokeToken: string;
  private readonly build: string;
  private readonly now: () => number;
  private readonly log: (s: string) => void;
  private readonly byPid = new Map<number, Client>();
  private readonly chatLog: ChatLine[] = [];
  private delayed: Array<{ at: number; fn: () => void }> = [];
  private readonly inputs: Input[] = Array.from({ length: 32 }, makeInput);
  private nextClientId = 1;
  private nextEphemeral = -1;
  private lastPb = '';
  private lastFort = '';
  /** Профили в колпаке дурака: раз в секунду проверяем, не пора ли снять */
  private readonly capped = new Set<number>();

  constructor(o: HubOptions) {
    this.store = o.store;
    this.profiles = o.profiles;
    this.profiles.onLevel = (profile, event) => {
      const c = this.byPid.get(profile.id);
      if (c && !c.closed) { this.sendMe(c); c.sink.sendJson({ t: 'levelUp', pid: profile.id, ...event }); }
      this.outfitChanged(profile.id);
      this.lobby.levelsChanged();
      this.broadcastOnline();
      for (const milestone of event.milestones) this.announce(`✨ ${profile.nick}: уровень ${milestone.min} — рамка «${milestone.name}»!`);
    };
    this.smokeToken = o.smokeToken;
    this.build = o.build;
    this.now = o.now ?? Date.now;
    this.gifts = new GiftCodes({ profiles: this.profiles, codeHash: o.giftCodeHash ?? null, now: this.now });
    this.voice = o.voice ? new VoiceRouter({ now: this.now, ice: o.voiceIce ?? (() => ({ iceServers: [], expiresAt: null, relayOnly: false })),
      entityId: client => {
        if (!(client instanceof Client) || !client.room || client.room.kind === 'hide') return null;
        const actor = client.room.playerOf?.(client);
        return (client.room.kind === 'lobby' ? actor?.slot : actor?.id) ?? null;
      },
    }) : null;
    this.log = o.log ?? ((s) => console.log(s));
    this.limits = new RateLimiter(this.now);
    this.fish2 = o.fish2 ?? false;
    this.roulette = this.fish2 && (o.roulette ?? false);
    // до набережной: круг у двери в подвал спрашивает у хаба, есть ли бой
    this.fight = o.fight
      ? new FightRoom({
        outfitOf: (p) => this.outfitOf(p),
        result: (c, row, reward) => this.onFightResult(c, row, reward),
        over: (clients) => this.onRaceOver(clients),
        announce: (text) => this.announce(text),
      })
      : null;
    this.skill = o.skill ? new SkillRoom({ outfitOf: (p) => this.outfitOf(p), afk: (c) => this.onPaintballAfk(c), result: (c, ticks, falls) => this.onSkillResult(c, ticks, falls) }) : null;
    this.boatrace = !!o.boatrace;
    this.hide = o.hide ? new HideRoom({ outfitOf: p => this.outfitOf(p), finished: (pid,result) => this.onHideResult(pid,result), afk: c => this.onPaintballAfk(c) }) : null;
    this.lobby = new LobbyRoom(this, o.roll, this.now, o.durakDeck, o.weather, o.blackjackDeck, o);
    this.tg = o.tg ?? null;
    if (this.tg) this.tg.onSend = (msg) => this.lobby.broadcast(msg);
    this.paintball = new PaintballRoom(this);
    this.race = new RaceRoom({
      outfitOf: (p) => this.outfitOf(p),
      result: (c, row, reward) => this.onRaceResult(c, row, reward),
      over: (clients) => this.onRaceOver(clients),
      announce: (text) => this.announce(text),
    });
    this.fort = o.fort
      ? new FortRoom({
        outfitOf: (p) => this.outfitOf(p),
        result: (c, row, reward, win, wave) => this.onFortResult(c, row, reward, win, wave),
        afk: (c) => this.onPaintballAfk(c),
      })
      : null;
    const now = this.now();
    for (const p of this.store.state.profiles) if (p.foolUntil > now || p.epUntil > now) this.capped.add(p.id);
  }

  /** Есть ли кто-то в комнатах (иначе цикл спит). */
  get active(): boolean {
    return this.lobby.humans + this.paintball.humans + this.race.humans + (this.skill?.humans ?? 0) + (this.hide?.humans ?? 0) + (this.fort?.humans ?? 0) + (this.fight?.humans ?? 0) > 0 || !!this.hide?.active || this.lobby.blackjack.active || this.lobby.durak.active || this.lobby.director.active || this.delayed.length > 0;
  }

  // ------------------------------------------------------------ соединения

  connect(sink: LinkSocket, ip: string): Client {
    this.sweepLost();
    const c = new Client(this.nextClientId++, sink, ip);
    c.since = this.now();
    this.clients.add(c);
    return c;
  }

  /**
   * Сокет соединения закрылся (socket — какой именно: после возврата старый сокет закрывается позже, его не слушаем).
   * Обрыв в игре — игрок остаётся в комнате без связи RESUME_MS и может вернуться на то же место; выход в меню,
   * закрытая вкладка, флуд, вход в другом окне — отключаем сразу, как раньше.
   */
  linkLost(c: Client, socket: LinkSocket, why: string, code: number): void {
    if (!this.clients.has(c) || !c.sink.has(socket)) return;
    if (!resumableClose(code) || c.bye || !c.profile || c.ephemeral || !c.room) {
      this.disconnect(c, why);
      return;
    }
    c.sink.detach();
    c.lostAt = this.now();
    // 1001 без прощания — браузер усыпил вкладку (фон, заморозка), а не закрыл её
    c.lostWhy = code === 1001 ? 'вкладка уснула' : why;
  }

  /** Кто не вернулся за RESUME_MS — отключаем по-настоящему. */
  private sweepLost(): void {
    const now = this.now();
    for (const c of this.clients) {
      if (c.lostAt && now - c.lostAt >= RESUME_MS) this.disconnect(c, `${c.lostWhy}, не вернулся за ${RESUME_MS / 1000} с`);
    }
  }

  /** why — причина для журнала (closeReason, «нет ответа 6 с» и т. п.) */
  disconnect(c: Client, why = ''): void {
    if (!this.clients.has(c)) return;
    this.clients.delete(c);
    c.closed = true;
    c.lostAt = 0;
    this.voice?.disconnected(c);
    c.room?.leave(c);
    c.room = null;
    if (c.profile && this.byPid.get(c.pid) === c) this.byPid.delete(c.pid);
    if (c.profile && !c.ephemeral) {
      this.profiles.touch(c.profile);
      const reason = why ? `, ${why}` : '';
      this.log(`[выход] ${c.nick} (#${c.pid}, пинг ~${Math.round(c.ping)} мс${reason}, был ${since(this.now() - c.since)}); в игре: ${this.onlineCount()}`);
      this.broadcastOnline();
      this.lobby.honorChanged();
    }
  }

  onJson(c: Client, raw: unknown): void {
    if (!raw || typeof raw !== 'object' || typeof (raw as { t?: unknown }).t !== 'string') return;
    const msg = raw as ClientMsg;
    if (msg.t === 'ping') {
      if (typeof msg.c === 'number') c.sink.sendJson({ t: 'pong', c: msg.c, k: c.room?.tick ?? this.tick });
      c.sink.ack(msg.r);
      return;
    }
    if (msg.t === 'bye') {
      c.bye = true;
      return;
    }
    if (msg.t === 'err') {
      this.onClientError(c, msg);
      return;
    }
    if (!c.profile) {
      if (msg.t === 'hello') this.hello(c, msg);
      return;
    }
    switch (msg.t) {
      case 'redeem': {
        if (c.closed || c.ephemeral) return;
        const result = c.room === this.lobby ? this.gifts.handle(c, msg.code) : 'unavailable';
        if (result === 'granted' || result === 'already') this.sendMe(c);
        c.sink.sendJson({ t: 'redeemResult', result });
        return;
      }
      case 'voice':
      case 'voiceSignal':
        this.voice?.handle(c, msg);
        return;
      case 'hello':
        return;
      case 'ready':
        this.gate.ready(c, msg.e);
        return;
      case 'chat':
        this.onChat(c, msg.text);
        return;
      case 'rename':
        this.onRename(c, msg.nick);
        return;
      case 'code':
        if (c.ephemeral || !this.limits.hit(`code:${c.pid}`, 3, 60_000)) return;
        c.sink.sendJson({ t: 'code', ...this.profiles.issueCode(c.profile) });
        return;
      case 'leave':
        if (c.room === this.paintball || c.room === this.race || (this.skill !== null && c.room === this.skill) || (this.hide !== null && c.room === this.hide) || (this.fort !== null && c.room === this.fort) || (this.fight !== null && c.room === this.fight)) this.move(c, this.lobby);
        return;
      default:
        c.room?.onMessage(c, msg);
    }
  }

  onBinary(c: Client, data: Uint8Array): void {
    if (!c.room || !c.profile) return;
    if (data.length < 3 || data[0] !== MSG_INPUT || inputEpoch(data) !== c.epoch) return;
    const n = decodeInputs(data, this.inputs);
    if (n > 0) c.room.onInputs(c, this.inputs, n);
  }

  /** Ошибка из браузера игрока — строкой в журнал. До входа — тоже: так видно, у кого игра не запустилась. */
  private onClientError(c: Client, msg: Extract<ClientMsg, { t: 'err' }>): void {
    if (c.errors >= ERR_PER_CONN) return;
    const m = cleanLog(msg.m, 200);
    if (!m || !this.limits.hit(`err:${c.ip}`, ERR_PER_MIN, 60_000)) return;
    c.errors++;
    const where = [cleanLog(msg.sc, 16), cleanLog(msg.ua, 40)].filter(Boolean).join(', ');
    let who: string;
    if (c.profile) who = `${c.nick} (#${c.pid}${where ? `, ${where}` : ''})`;
    else {
      const n = cleanLog(msg.n, 16);
      who = `до входа (${[where, n ? `ник на устройстве «${n}»` : ''].filter(Boolean).join(', ')})`;
    }
    const at = cleanLog(msg.at, 160);
    const st = cleanLog(msg.st, 400);
    this.log(`[ошибка у игрока] ${who}: ${m}${at ? ` @ ${at}` : ''}${st ? ` | ${st}` : ''}`);
  }

  // ------------------------------------------------------------ вход

  private hello(c: Client, msg: Extract<ClientMsg, { t: 'hello' }>): void {
    if (++c.helloTries > 10) {
      c.sink.close(1008, 'hello');
      return;
    }
    if (msg.v !== PROTOCOL_VERSION) {
      this.error(c, 'version');
      c.sink.close(4002, 'version');
      return;
    }
    if (typeof msg.smoke === 'string' && this.smokeToken && sameSecret(msg.smoke, this.smokeToken)) {
      const now = this.now();
      c.ephemeral = true;
      this.enter(c, {
        id: this.nextEphemeral--, nick: 'Проверка', keyHashes: [], createdAt: now, lastSeen: now, tokens: 0, owned: [],
        outfit: { ...DEFAULT_OUTFIT }, daily: '', stats: emptyStats(), foolUntil: 0, epUntil: 0, album: {}, fishing: emptyFishProgress(),
        xp: 0, level: 1, levelsVersion: 1, fishingResetVersion: 1,
      }, 0);
      return;
    }
    const r = this.profiles.login({ key: msg.key, nick: msg.nick, code: msg.code }, c.ip);
    if (!r.ok) {
      this.error(c, r.code);
      return;
    }
    if (r.created) this.log(`[новый профиль] ${r.profile.nick} (#${r.profile.id})`);
    const re = msg.re;
    const again = typeof re === 'number' && Number.isInteger(re) && re >= 1000 && re <= 4999 ? `, переподключился: ${closeReason(re)}` : '';
    this.enter(c, r.profile, r.daily, again, msg.rs);
  }

  /** note — дописать в строку журнала о входе; rs — клиент просит вернуться в прежнюю сессию после обрыва */
  private enter(c: Client, profile: Profile, daily: number, note = '', rs?: unknown): void {
    const old = this.byPid.get(profile.id);
    if (old && old !== c) {
      if (rs !== undefined && this.resume(old, c, rs)) return;
      if (old.lostAt) this.disconnect(old, `${old.lostWhy}, вошёл заново`);
      else {
        this.error(old, 'replaced');
        old.sink.close(4001, 'replaced');
        this.disconnect(old, closeReason(4001));
      }
    }
    c.profile = profile;
    if (!c.ephemeral) this.byPid.set(profile.id, c);
    // награды коллекции рыб, положенные по альбому (server/fishstyle.ts): ветеранам — при первом входе
    const ladder = this.fish2 && !c.ephemeral ? grantLadder(this.profiles, profile) : null;
    this.sendMe(c);
    if (daily > 0) this.toast(c, `Ежедневный бонус: +${daily} 🪙`);
    if (ladder?.items.length) {
      this.toast(c, ladderToast(ladder));
      for (const line of ladderAnnounce(profile.nick, ladder)) this.announce(line);
    }
    c.sink.sendJson({ t: 'chatlog', list: this.chatLog });
    if (!this.move(c, this.lobby, true)) {
      this.error(c, 'full');
      c.sink.close(1013, 'full');
      return;
    }
    this.voice?.connected(c);
    if (!c.ephemeral) {
      this.log(`[вход] ${profile.nick} (#${profile.id}${note}); в игре: ${this.onlineCount()}`);
      this.lobby.honorChanged();
    }
  }

  /**
   * Возврат после обрыва: сокет нового соединения c подхватывает прежнюю сессию old. Комната, место, стол, голос —
   * как были; клиенту досылается всё, что он не принял (с номера from), сцену он не пересоздаёт.
   */
  private resume(old: Client, c: Client, from: unknown): boolean {
    if (old.closed || old.ephemeral || !old.room || !old.sink.canResume(from)) return false;
    const socket = c.sink.take();
    if (!socket) return false;
    const away = old.lostAt ? `без связи ${since(this.now() - old.lostAt)}` : 'старое соединение ещё не закрылось';
    const why = old.lostAt ? `${old.lostWhy}, ` : '';
    // старый сокет мог ещё числиться живым (клиент заметил тишину раньше сервера) — закрываем, его закрытие не в счёт
    old.sink.dropSocket(4003, 'resumed');
    socket.sendJson({ t: 'resumed' });
    old.sink.attach(socket, from);
    old.lostAt = 0;
    old.lostWhy = '';
    c.adopted = old;
    c.closed = true;
    this.clients.delete(c);
    this.sendMe(old);
    this.log(`[возврат] ${old.nick} (#${old.pid}, ${why}${away}); в игре: ${this.onlineCount()}`);
    return true;
  }

  private error(c: Client, code: ErrorCode): void {
    c.sink.sendJson({ t: 'error', code, text: ERROR_TEXT[code] });
  }

  // ------------------------------------------------------------ комнаты

  /** Перевести в другую комнату. force — без ограничения частоты (вход, AFK). */
  move(c: Client, room: Room, force = false): boolean {
    if (c.room === room) return true;
    if (!force && this.tick - c.lastMove < MOVE_COOLDOWN) {
      this.toast(c, 'Не так быстро 🙂');
      return false;
    }
    if (!room.hasSpace()) return false;
    const from = c.room?.kind ?? null;
    c.room?.leave(c);
    c.epoch = (c.epoch + 1) & 255;
    c.lastMove = this.tick;
    c.room = room;
    c.sink.sendJson({ t: 'scene', scene: room.kind, epoch: c.epoch });
    if (!room.join(c, from)) {
      // места кончились в последний момент — назад на набережную
      c.room = null;
      if (room !== this.lobby) return this.move(c, this.lobby, true);
      return false;
    }
    this.gate.moved(c, room);
    this.voice?.moved(c);
    if (!c.ephemeral) this.broadcastOnline();
    return true;
  }

  // ------------------------------------------------------------ чат

  private onChat(c: Client, raw: unknown): void {
    if (c.ephemeral) return;
    const text = sanitizeChat(raw);
    if (!text) return;
    if (!this.limits.hit(`chat:${c.pid}`, 5, 5000)) {
      this.privateLine(c, 'Не так быстро 🙂');
      return;
    }
    if (text.startsWith('/')) {
      if (this.gate.command(c, text)) return;
      if (c.room === this.paintball) this.paintball.command(c, text);
      else if (this.skill && c.room === this.skill) this.skill.command(c, text);
      else if (this.fort !== null && c.room === this.fort) this.fort.command(c, text);
      else if (this.fight !== null && c.room === this.fight) this.privateLine(c, 'Fight Club: ЛКМ — джеб (три подряд — серия), ПКМ — тяжёлый, Q — блок, Shift — уклон, E — захват и бросок, Пробел — прыжок, 1–6 — эмоции в толпе, M — звук, Esc → «На набережную» — выйти. Первое правило ты знаешь.');
      else if (c.room === this.race) this.privateLine(c, 'Гонка: W/S — газ и тормоз, A/D — руль, Пробел с рулём — подскок и занос (отпусти — ускорение), E — бонус, R — на трассу, M — звук, Esc → «На набережную» — выйти. Команды /restart, /bots и другие работают на складе.');
      else this.privateLine(c, 'Набережная: E — действие, 1–4 — эмоции, колесо мыши — камера, Tab — кто где, M — звук. Команды /restart, /bots и другие работают на складе.');
      return;
    }
    const room = c.room?.kind ?? 'lobby';
    this.addChat({ from: c.nick, pid: c.pid, room, team: c.room === this.paintball ? this.paintball.teamOf(c) : -1, text, sys: false });
  }

  private onRename(c: Client, nick: unknown): void {
    if (c.ephemeral || !c.profile) return;
    const old = c.nick;
    const r = this.profiles.rename(c.profile, nick);
    if (r !== 'ok') {
      this.toast(c, r === 'rate' ? 'Ник можно менять раз в минуту' : ERROR_TEXT[r]);
      return;
    }
    this.sendMe(c);
    this.lobby.onRename(c);
    this.skill?.onRename(c);
    this.hide?.onRename(c);
    this.voice?.renamed(c);
    this.outfitChanged(c.pid);
    this.broadcastOnline();
    this.log(`[ник] ${old} → ${c.nick}`);
  }

  private addChat(line: ChatLine): void {
    this.chatLog.push(line);
    if (this.chatLog.length > CHAT_KEEP) this.chatLog.splice(0, this.chatLog.length - CHAT_KEEP);
    const msg: ServerMsg = { t: 'chat', ...line };
    for (const c of this.clients) if (c.profile && !c.ephemeral) c.sink.sendJson(msg);
  }

  /** Общая системная строка (джекпот, крупный выигрыш), можно с задержкой в тиках. */
  announce(text: string, delayTicks = 0): void {
    const send = (): void => this.addChat({ from: '', pid: 0, room: '', team: -1, text, sys: true });
    if (delayTicks > 0) this.later(delayTicks, send);
    else send();
  }

  /** Выполнить через столько тиков хаба (итог вращения, объявления). */
  later(delayTicks: number, fn: () => void): void {
    this.delayed.push({ at: this.tick + delayTicks, fn });
  }

  privateLine(c: Client, text: string): void {
    c.sink.sendJson({ t: 'chat', from: '', pid: 0, room: '', team: -1, text, sys: true });
  }

  // ------------------------------------------------------------ профиль и жетоны

  sendMe(c: Client): void {
    const p = c.profile;
    if (!p) return;
    this.profiles.refreshFishing(p);
    c.sink.sendJson({ t: 'me', pid: p.id, nick: p.nick, tokens: p.tokens, xp: p.xp, level: p.level, owned: p.owned, outfit: p.outfit, stats: p.stats, album: p.album, fishing: { ...p.fishing }, ...(this.gifts.enabled && !c.ephemeral ? { gifts: true } : {}), build: this.build });
    if (this.fish2) c.sink.sendJson({ t: 'fishProgress', progress: { ...p.fishing }, now: this.now() });
  }

  /** Погода одна на весь хаб, уведомление получают и игроки в других комнатах. */
  fishEvent(on: boolean, until: number): void {
    if (!this.fish2) return;
    for (const c of this.clients) if (c.profile && !c.ephemeral) c.sink.sendJson({ t: 'fishEvent', on, until });
  }

  tokens(c: Client, n: number, delay?: number): void {
    c.sink.sendJson(delay ? { t: 'tokens', n, delay } : { t: 'tokens', n });
  }

  toast(c: Client, text: string): void {
    c.sink.sendJson({ t: 'toast', text });
  }

  /** Итог раунда пейнтбола: жетоны и статистика. */
  onPaintballRound(c: Client, p: Player, r: PbReward, won: boolean, mvp: boolean): void {
    const prof = c.profile;
    if (!prof || c.ephemeral) return;
    this.profiles.credit(prof, r.total, 'mode');
    prof.stats.pbRounds++;
    if (won) prof.stats.pbWins++;
    if (mvp) prof.stats.pbMvp++;
    prof.stats.pbKills += p.kills;
    this.store.markDirty();
    this.tokens(c, prof.tokens);
    this.lobby.honorChanged();
  }

  /** Подключённый игрок по номеру профиля (в любой комнате) */
  clientOf(pid: number): Client | undefined {
    return this.byPid.get(pid);
  }

  /** Наряд, который видят все: свой, а поверх — колпак дурака и погоны, пока не истёк срок. */
  outfitOf(p: Profile): Outfit {
    return shownOutfit(p.outfit, p.foolUntil, p.epUntil, this.now());
  }

  /** Видимый наряд игрока поменялся — разослать там, где он сейчас. */
  private outfitChanged(pid: number): void {
    const c = this.byPid.get(pid);
    if (!c) return;
    if (c.room === this.lobby) this.lobby.outfitChanged(c);
    else if (c.room === this.paintball) this.paintball.outfitChanged(c);
    else if (c.room === this.race) this.race.outfitChanged(c);
    else if (this.skill && c.room === this.skill) this.skill.outfitChanged(c);
    else if (this.hide && c.room === this.hide) this.hide.outfitChanged(c);
    else if (this.fort !== null && c.room === this.fort) this.fort.outfitChanged(c);
    else if (this.fight !== null && c.room === this.fight) this.fight.outfitChanged(c);
  }

  /** Итог партии в дурака: колпак дураку, жетоны и статистика сидевшим за столом, строка в общий чат. */
  onDurakGame(r: DurakResult): void {
    const now = this.now();
    for (const pl of r.players) {
      if (pl.bot || pl.pid <= 0) continue;
      const prof = this.profiles.byId(pl.pid);
      if (!prof) continue;
      const c = this.byPid.get(pl.pid);
      if (pl.fool) {
        prof.foolUntil = now + FOOL_MS;
        if (r.ep) prof.epUntil = now + FOOL_MS;
        this.capped.add(prof.id);
        this.store.markDirty();
        this.outfitChanged(prof.id);
      }
      if (!c) continue;
      const cap = r.ep ? 'колпак и погоны на 10 минут' : 'колпак на 10 минут';
      if (!pl.present) {
        if (pl.fool) this.toast(c, `Ты остался в дураках 🃏 — ${cap}`);
        continue;
      }
      prof.stats.dkGames++;
      if (pl.fool) prof.stats.dkFools++;
      if (pl.first && !pl.fool) prof.stats.dkFirst++;
      this.store.markDirty();
      this.tokens(c, prof.tokens);
      this.sendMe(c);
      if (pl.fool) this.toast(c, `Ты дурак! 🃏 — ${cap}`);
      else this.toast(c, r.draw ? 'Ничья — ставки возвращены.' : pl.first ? 'Ты вышел первым! Выплаты по ставкам — на столе.' : 'Партия завершена. Выплаты по ставкам — на столе.');
    }
    const fool = r.players.find((pl) => pl.fool);
    this.announce(fool
      ? `🃏 Стол ${r.table + 1}: ${fool.nick} остаётся в дураках${r.ep ? ' — и с погонами!' : ''}`
      : `🃏 Стол ${r.table + 1}: ничья — дураков нет`);
    this.lobby.honorChanged();
  }

  /** Раз в секунду: у кого истёк колпак — снять (наряд разослать заново). */
  private uncap(): void {
    if (this.capped.size === 0) return;
    const now = this.now();
    for (const pid of [...this.capped]) {
      const p = this.profiles.byId(pid);
      if (!p) {
        this.capped.delete(pid);
        continue;
      }
      let changed = false;
      if (p.foolUntil !== 0 && p.foolUntil <= now) {
        p.foolUntil = 0;
        changed = true;
      }
      if (p.epUntil !== 0 && p.epUntil <= now) {
        p.epUntil = 0;
        changed = true;
      }
      if (p.foolUntil === 0 && p.epUntil === 0) this.capped.delete(pid);
      if (!changed) continue;
      this.store.markDirty();
      this.outfitChanged(pid);
    }
  }

  // ------------------------------------------------------------ гонка

  /** Круг «Старт» досчитал: новая гонка, все из круга — в неё, старт. */
  startRace(clients: Client[], track: RaceTrackId = 'port'): void {
    this.race.open(track);
    for (const c of clients) this.move(c, this.race, true);
    this.race.launch();
  }

  /** «Портовая регата»: итог заезда в профиль (сошедшему посреди гонки — заезд без награды). */
  onRegattaResult(pid: number, row: RgRow): void {
    const p = this.profiles.byId(pid);
    const c = this.byPid.get(pid);
    if (!p || c?.ephemeral) return;
    p.stats.brRaces++;
    if (row.finished && row.pos === 1) p.stats.brWins++;
    if (row.best > 0 && (!p.stats.brBestLapHarbor || row.best < p.stats.brBestLapHarbor)) p.stats.brBestLapHarbor = row.best;
    if (row.reward > 0) this.profiles.credit(p, row.reward, 'mode');
    this.store.markDirty();
    if (c && c.profile === p) {
      this.tokens(c, p.tokens);
      this.sendMe(c);
    }
    this.lobby.honorChanged();
  }

  /** Круг регаты — на доску бухты (5 лучших, у каждого — только свой лучший): место или −1. */
  regattaRecord(pid: number, nick: string, ticks: number): number {
    const st = this.store.state;
    const { top, place } = addRecord(st.regatta, { pid, nick, ms: rgLapMs(ticks), at: this.now() });
    if (place < 0) return -1;
    st.regatta = top;
    this.store.markDirty();
    return place;
  }

  regattaTop(): RgRecordRow[] {
    return this.store.state.regatta.map(r => ({ pid: r.pid, nick: r.nick, ms: r.ms }));
  }

  /** «Выше облаков»: позвонил в колокол — статистика профиля, жетоны (медаль, «без падений», первый за день). */
  onSkillResult(c: Client, ticks: number, falls: number): SkillReward | null {
    const p = c.profile;
    if (!p || c.ephemeral) return null;
    const r = applySkillFinish(p.stats, ticks, falls, mskDayNum(this.now()));
    if (r.tokens > 0) this.profiles.credit(p, r.tokens, 'mode');
    this.store.markDirty(); this.tokens(c, p.tokens); this.sendMe(c); this.lobby.honorChanged();
    return r;
  }

  startHide(clients: Client[]): void {
    if (!this.hide || this.hide.active) return;
    for (const c of clients) this.move(c, this.hide, true);
  }

  onHideResult(pid: number, result: HideResult): void {
    const p = this.profiles.byId(pid);
    if (!p) return;
    p.stats.hiGames++;
    if (result.won) p.stats.hiWins++;
    p.stats.hiFound += result.found;
    if (result.survived) p.stats.hiSurvived++;
    if (result.reward > 0) this.profiles.credit(p, result.reward, 'mode');
    this.store.markDirty();
    const c = this.byPid.get(pid);
    if (c) { this.tokens(c, p.tokens); this.sendMe(c); }
    this.lobby.honorChanged();
  }

  /** Итог гонки человеку: жетоны (если доехал) и статистика. raceReward клиенту уже отправила сама гонка. */
  onRaceResult(c: Client, row: RaceResultRow, reward: RcReward | null): void {
    const prof = c.profile;
    if (!prof || c.ephemeral) return;
    const st = prof.stats;
    st.rcRaces++;
    if (row.place === 1) st.rcWins++;
    if (row.place >= 1 && row.place <= 3) st.rcPodiums++;
    const record = row.track === 'foundry' ? 'rcBestLapFoundry' : 'rcBestLap';
    if (row.best > 0 && (st[record] === 0 || row.best < st[record])) st[record] = row.best;
    if (reward) this.profiles.credit(prof, reward.total, 'mode');
    this.store.markDirty();
    this.tokens(c, prof.tokens);
    this.sendMe(c);
    this.lobby.honorChanged();
  }

  /** Итоги показаны — всех из гонки на набережную, к гаражу. Набережная полна — закрыть (переподключатся позже). */
  private onRaceOver(clients: Client[]): void {
    for (const c of clients) {
      if (c.closed || this.move(c, this.lobby, true)) continue;
      this.error(c, 'full');
      c.sink.close(1013, 'full');
    }
  }

  onPaintballAfk(c: Client): void {
    if (this.move(c, this.lobby, true)) this.toast(c, 'Ты долго стоял без дела — вернули на набережную');
  }

  // ------------------------------------------------------------ крепость

  /** E у арки «Крепость» на набережной: в крепость (режим включён и есть место). */
  enterFort(c: Client): void {
    const f = this.fort;
    if (!f || c.room !== this.lobby) return;
    if (!f.hasSpace()) {
      this.toast(c, 'В крепости уже шестеро — подожди, кто-нибудь выйдет');
      return;
    }
    this.move(c, f);
  }

  /** Итог игры в крепости человеку: жетоны (если отбил хоть одну волну) и статистика. fortReward ему уже отправила игра. */
  onFortResult(c: Client, row: FortResultRow, reward: FtReward | null, win: boolean, wave: number): void {
    const prof = c.profile;
    if (!prof || c.ephemeral) return;
    const st = prof.stats;
    st.ftGames++;
    if (win) st.ftWins++;
    if (wave > st.ftBest) st.ftBest = wave;
    st.ftKills += row.k;
    if (reward) this.profiles.credit(prof, reward.total, 'mode');
    this.store.markDirty();
    this.tokens(c, prof.tokens);
    this.sendMe(c);
    this.lobby.honorChanged();
  }

  // ------------------------------------------------------------ Fight Club

  /** Круг у двери в подвал досчитал: новый бой, бойцы и зрители — вниз, старт. */
  startFight(fighters: Client[], crowd: Client[], mode: FcMode): void {
    const f = this.fight;
    if (!f || !f.idle) return;
    f.open(mode, fighters.map((c) => c.pid));
    for (const c of [...fighters, ...crowd]) this.move(c, f, true);
    f.launch();
  }

  /** E у двери, пока внизу бой: спуститься зрителем. */
  watchFight(c: Client): void {
    const f = this.fight;
    if (!f || c.room !== this.lobby) return;
    if (!f.hasSpace()) {
      this.toast(c, 'В подвале не протолкнуться — подожди конца боя');
      return;
    }
    this.move(c, f);
  }

  /** Итог боя человеку: жетоны и статистика. fcReward ему уже отправил бой. */
  onFightResult(c: Client, row: FcResultRow, reward: FcReward): void {
    const prof = c.profile;
    if (!prof || c.ephemeral) return;
    const st = prof.stats;
    st.fcFights++;
    if (row.won) st.fcWins++;
    st.fcKos += row.kos;
    this.profiles.credit(prof, reward.total, 'mode');
    this.store.markDirty();
    this.tokens(c, prof.tokens);
    this.sendMe(c);
    this.lobby.honorChanged();
  }

  /** Что в крепости — для арки на набережной (null — режим выключен) */
  fortStatus(): FortStatus | null {
    return this.fort?.status() ?? null;
  }

  // ------------------------------------------------------------ «кто где» и статус склада

  private onlineCount(): number {
    let n = 0;
    for (const c of this.clients) if (c.profile && !c.ephemeral && c.room) n++;
    return n;
  }

  broadcastOnline(): void {
    const list: OnlineEntry[] = [];
    for (const c of this.clients) if (c.profile && !c.ephemeral && c.room) list.push({ nick: c.nick, room: c.room.kind, level: c.profile.level });
    list.sort((a, b) => a.nick.localeCompare(b.nick, 'ru'));
    const msg: ServerMsg = { t: 'online', list };
    for (const c of this.clients) if (c.profile && c.room) c.sink.sendJson(msg);
  }

  pbStatus(): PbStatus {
    return this.paintball.status();
  }

  /** Доска почёта и её обратная сторона — «Последние входы» (кто в игре — по живым соединениям). */
  honor(): HonorInfo {
    return { ...this.profiles.honor(), recent: this.profiles.recent((pid) => this.byPid.has(pid)) };
  }

  // ------------------------------------------------------------ тик

  step(): void {
    this.tick++;
    this.gate.step();
    this.voice?.step();
    if (this.delayed.length) {
      const due = this.delayed.filter((d) => d.at <= this.tick);
      if (due.length) {
        this.delayed = this.delayed.filter((d) => d.at > this.tick);
        for (const d of due) d.fn();
      }
    }
    // Погода не зависит от присутствия рыбаков на набережной и шагается только здесь.
    this.lobby.stepWeather();
    if (this.paintball.humans > 0) this.paintball.step();
    if (this.lobby.humans > 0 || this.lobby.blackjack.active || this.lobby.durak.active || this.lobby.director.active) this.lobby.step();
    if (this.race.humans > 0) this.race.step();
    if (this.skill && this.skill.humans > 0) this.skill.step();
    if (this.hide && (this.hide.humans > 0 || this.hide.active)) this.hide.step();
    if (this.fort && this.fort.humans > 0) this.fort.step();
    if (this.fight && this.fight.humans > 0) this.fight.step();
    if (this.tick % TICK_RATE === 0) {
      const st = this.pbStatus();
      const key = JSON.stringify(st);
      if (key !== this.lastPb || this.paintball.humans > 0) {
        this.lastPb = key;
        this.lobby.broadcast({ t: 'pb', ...st });
      }
    }
    if (this.fort && this.tick % TICK_RATE === 0) {
      const st = this.fort.status();
      const key = JSON.stringify(st);
      if (key !== this.lastFort || this.fort.humans > 0) {
        this.lastFort = key;
        this.lobby.broadcast({ t: 'fortSt', ...st });
      }
    }
    if (this.tick % TICK_RATE === 0) {
      this.sweepLost();
      if (this.skill) this.lobby.broadcast({ t: 'skillSt', ...this.skill.status() });
      this.uncap();
      for (const c of this.clients) if (c.profile && !c.ephemeral && this.profiles.refreshFishing(c.profile)) this.sendMe(c);
    }
    if (this.tick % (60 * TICK_RATE) === 0) this.limits.sweep(3600_000);
  }

  /** Busy counts occupied game rooms and unsettled Blackjack hands; deploy must not interrupt either. */
  health(): { online: number; lobby: number; paintball: number; race: number; fort: number; fight: number; skill: number; boatrace: number; hide: number; busy: number } {
    const { lobby, paintball, race } = this;
    const fort = this.fort?.humans ?? 0;
    const fight = this.fight?.humans ?? 0;
    const skill = this.skill?.humans ?? 0;
    const boatrace = lobby.regatta?.humans ?? 0;
    const hide = this.hide?.humans ?? 0;
    return { online: this.onlineCount(), lobby: lobby.humans, paintball: paintball.humans, race: race.humans, fort, fight, skill, boatrace, hide, busy: paintball.humans + race.humans + fort + fight + skill + boatrace + (this.hide?.busy ?? 0) + lobby.blackjack.busy + lobby.durak.busy + Number(lobby.director.busy) };
  }

  /** Перезапуск сервера: предупредить всех, сохранить, закрыть с кодом 1012 (клиенты переподключатся). */
  shutdown(): void {
    for (const c of this.clients) c.sink.sendJson({ t: 'restart' });
    // кто был в игре — «был последний раз» сейчас, а не при входе (на доске «Последние входы»)
    for (const c of this.clients) if (c.profile && !c.ephemeral) this.profiles.touch(c.profile);
    this.lobby.blackjack.shutdown();
    this.lobby.durak.shutdown();
    this.store.flush();
    for (const c of this.clients) c.sink.close(1012, 'restart');
  }
}

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

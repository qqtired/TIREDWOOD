// Хранилище профилей и банка джекпота: один JSON-файл в DATA_DIR.
// Запись атомарная (временный файл → fsync → переименование), раз в день — копия, хранятся 7 последних.
import { normalizeFarm, type FarmProgress } from '../shared/farm.ts';
import { FARM_PLOTS } from '../shared/farmdata.ts';
import { normalizeBoss, type FarmBossState } from '../shared/farmboss.ts';
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, unlinkSync, writeSync } from 'node:fs';
import path from 'node:path';
import { AQUA_COURSE, addRecord, type AquaRecord } from '../shared/aqua.ts';
import { RG_COURSE } from '../shared/regattacourse.ts';
import { emptyStats, mskDay, type Stats } from '../shared/economy.ts';
import { FISH, sanitizeAlbum, type FishAlbum } from '../shared/fishing.ts';
import { FORT_TOP, type FortRunRec } from '../shared/fort.ts';
import { normalizeFishProgress, type FishProgress } from '../shared/fishprogress.ts';
import { COLLECTION, isCollected } from '../shared/fishrules.ts';
import type { FishPodiumCatch } from '../shared/messages.ts';
import { DEFAULT_OUTFIT, sanitizeOutfit, type Outfit } from '../shared/outfit.ts';
import { FISHING_RESET_VERSION, LEVELS_VERSION, legacyXp, levelFromXp, safeXp } from '../shared/levels.ts';
import { POOL_MIN } from '../shared/slots.ts';
import type { DgRec } from '../shared/dungeon/api.ts';
import { parseDgTop, parseDgWeek, type DgWeekTable } from './dungeon/records.ts';

export { emptyStats };
export type { Stats };

export interface Profile {
  id: number;
  nick: string;
  /** sha256(ключ устройства) в hex, до 5 штук */
  keyHashes: string[];
  createdAt: number;
  lastSeen: number;
  tokens: number;
  xp: number;
  level: number;
  levelsVersion: number;
  fishingResetVersion: number;
  /** Зарезервированные жетоны текущей раздачи: возвращаются один раз после аварийного рестарта. */
  blackjackEscrow?: { round: string; amount: number } | null;
  durakEscrow?: { round: string; amount: number } | null;
  /** Улов на рулетке рыбака (его цена, жетонов) до остановки колеса: после аварийного рестарта возвращается жетонами. */
  rouletteEscrow?: { round: string; amount: number } | null;
  /** Ставка на крысиных бегах до конца забега: после аварийного рестарта возвращается жетонами. */
  ratEscrow?: { round: string; amount: number } | null;
  /** Ставка в банке бильярдной партии (предложена или идёт партия): после аварийного рестарта возвращается. */
  billiardsEscrow?: { round: string; amount: number } | null;
  /** Купленные и выигранные вещи: 'h:tophat', 'p:gold'… */
  owned: string[];
  outfit: Outfit;
  /** День последнего ежедневного бонуса по Москве, 'ГГГГ-ММ-ДД' */
  daily: string;
  stats: Stats;
  /** До какого времени (мс) на голове колпак дурака и на плечах погоны; 0 — нет */
  foolUntil: number;
  epUntil: number;
  /** Альбом рыбака: вид → [рекорд, граммы; сколько положено в альбом] */
  album: FishAlbum;
  /** Отдельный навык, последовательный квест, одна удочка и срок рыбацкого пива. */
  fishing: FishProgress;
  /** Ферма (shared/farm.ts): появляется при первом входе на ферму; хранится и без флага FARM */
  farm?: FarmProgress;
}

export interface State {
  v: 1;
  nextId: number;
  /** Банк джекпота (может быть дробным: 5 % от ставки 1) */
  jackpot: number;
  lastJackpot: { nick: string; win: number; at: number } | null;
  /** Сколько раз отдавали честь у статуи («RESPECTS PAID») */
  respects: number;
  /** Доска «Рекорды полосы» аквапарка: лучшие AQUA_TOP, у каждого — только свой лучший */
  aqua: AquaRecord[];
  /**
   * Для какой полосы эта доска и личные лучшие (AQUA_COURSE). Полоса новая — при загрузке доска пустеет, а лучшее время
   * в профилях сбрасывается: старые времена с новыми несравнимы (сколько раз прошёл — остаётся)
   */
  aquaCourse: number;
  /**
   * «Портовая регата»: пять лучших кругов бухты (мс; у каждого — только свой лучший) и для какой трассы (RG_COURSE).
   * Трасса новая — доска пустеет (личные лучшие круги — у каждой трассы своё поле в статистике).
   */
  regatta: AquaRecord[];
  regattaCourse: string;
  /** Пять отдельных крупнейших уловов календарного дня по Москве; не личные рекорды игроков. */
  fishPodium: { day: string; catches: FishPodiumCatch[] };
  /** Сроки общих событий, абсолютные миллисекунды; переживают перезапуск. */
  lobbyEvents?: { stormAt: number; piratesAt: number; endedAt: number; lockUntil?: number };
  /**
   * Рекорды «Крепости»: лучшие забеги (волн отбито, кто держал стены, когда), по убыванию; первая строка — рекорд
   * крепости. Забег обновляется после каждой отбитой волны (id — номер игры). Старые сохранения — пусто
   */
  fortTop?: FortRunRec[];
  /**
   * Рекорды «Подземелья» (server/dungeon/records.ts): за всё время и за неделю (с понедельника 00:00 МСК; неделя сменилась —
   * таблица читается пустой). У профиля одна строка — лучшая. Старые сохранения — поля нет (появится с первым забегом)
   */
  dgTop?: DgRec[];
  dgWeek?: DgWeekTable;
  /** Ферма: кто держит какой из 20 участков и когда был там последний раз (спящие участки переживают перезапуск) */
  farmPlots?: Array<{ pid: number; seen: number } | null>;
  /** Ферма: Древо разлома — текущее или прошлое событие (вклады, «Последняя капля», выданные баффы) */
  farmBoss?: FarmBossState;
  profiles: Profile[];
}

export interface StoreOptions {
  saveDelayMs?: number;
  now?: () => number;
  log?: (s: string) => void;
  keepBackups?: number;
  onWriteError?: (error: StoreWriteError) => void;
}

/** The primary snapshot was not committed; callers must stop gameplay until restart. */
export class StoreWriteError extends Error {
  constructor() { super('Хранилище: запись не завершена'); this.name = 'StoreWriteError'; }
}

const FILE = 'state.json';
const BACKUP_RE = /^state-\d{4}-\d{2}-\d{2}\.json$/;

function emptyState(): State {
  return { v: 1, nextId: 1, jackpot: POOL_MIN, lastJackpot: null, respects: 0, aqua: [], aquaCourse: AQUA_COURSE, regatta: [], regattaCourse: RG_COURSE, fishPodium: { day: '', catches: [] }, lobbyEvents: { stormAt: 0, piratesAt: 0, endedAt: 0, lockUntil: 0 }, profiles: [] };
}

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function normalizeBlackjackEscrow(raw: unknown): Profile['blackjackEscrow'] {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.round !== 'string' || !r.round || r.round.length > 100 || !Number.isSafeInteger(r.amount) || (r.amount as number) <= 0) return null;
  return { round: r.round, amount: r.amount as number };
}

/** Профиль из прочитанного JSON: недостающие поля — по умолчанию; без id или ника — null. */
export function normalizeProfile(raw: unknown): Profile | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'number' || !Number.isInteger(r.id) || typeof r.nick !== 'string' || !r.nick) return null;
  const owned = strings(r.owned);
  const stats = emptyStats();
  if (r.stats && typeof r.stats === 'object') {
    const s = r.stats as Record<string, unknown>;
    // все счётчики неотрицательные: минус из битой или поправленной руками записи — ноль (num его пропустил бы)
    for (const k of Object.keys(stats) as Array<keyof Stats>) stats[k] = Math.max(0, num(s[k]));
  }
  const album = sanitizeAlbum(r.album);
  // Старый максимум хранится в альбоме; сундуки, хлам и старая золотая рыбка сюда не входят.
  for (const sp of COLLECTION) stats.fsMaxGrams = Math.max(stats.fsMaxGrams, album[FISH[sp].id]?.[0] ?? 0);
  const fishing = normalizeFishProgress(r.fishing);
  if (num(r.fishingResetVersion) < FISHING_RESET_VERSION) {
    fishing.xp = 0; fishing.questsDone = 0; fishing.questCaught = 0; fishing.rod = 0;
  }
  const xp = num(r.levelsVersion) >= LEVELS_VERSION ? safeXp(num(r.xp)) : legacyXp(stats);
  return {
    id: r.id,
    nick: r.nick,
    keyHashes: strings(r.keyHashes).slice(-5),
    createdAt: num(r.createdAt),
    lastSeen: num(r.lastSeen),
    tokens: Math.max(0, Math.floor(num(r.tokens))),
    xp, level: levelFromXp(xp), levelsVersion: LEVELS_VERSION, fishingResetVersion: FISHING_RESET_VERSION,
    blackjackEscrow: normalizeBlackjackEscrow(r.blackjackEscrow),
    durakEscrow: normalizeBlackjackEscrow(r.durakEscrow),
    rouletteEscrow: normalizeBlackjackEscrow(r.rouletteEscrow),
    ratEscrow: normalizeBlackjackEscrow(r.ratEscrow),
    billiardsEscrow: normalizeBlackjackEscrow(r.billiardsEscrow),
    owned,
    outfit: r.outfit ? sanitizeOutfit(r.outfit, owned) : { ...DEFAULT_OUTFIT },
    daily: typeof r.daily === 'string' ? r.daily : '',
    stats,
    foolUntil: num(r.foolUntil),
    epUntil: num(r.epUntil),
    album,
    fishing,
    ...(r.farm !== undefined ? { farm: normalizeFarm(r.farm) } : {}),
  };
}

function parseState(text: string): State {
  const raw = JSON.parse(text) as Record<string, unknown>;
  if (!raw || raw.v !== 1 || !Array.isArray(raw.profiles)) throw new Error('не то содержимое');
  const profiles: Profile[] = [];
  for (const p of raw.profiles) {
    const n = normalizeProfile(p);
    if (n) profiles.push(n);
  }
  let nextId = Math.max(1, Math.floor(num(raw.nextId, 1)));
  for (const p of profiles) if (p.id >= nextId) nextId = p.id + 1;
  const lj = raw.lastJackpot as Record<string, unknown> | null | undefined;
  // полоса аквапарка сменилась — доска и личные лучшие с чистого листа
  const sameCourse = num(raw.aquaCourse, 1) === AQUA_COURSE;
  if (!sameCourse) for (const p of profiles) p.stats.aqBest = 0;
  return {
    v: 1,
    nextId,
    jackpot: Math.max(POOL_MIN, num(raw.jackpot, POOL_MIN)),
    lastJackpot: lj && typeof lj.nick === 'string' ? { nick: lj.nick, win: num(lj.win), at: num(lj.at) } : null,
    respects: Math.max(0, Math.floor(num(raw.respects))),
    aqua: sameCourse ? parseAqua(raw.aqua) : [],
    aquaCourse: AQUA_COURSE,
    regatta: raw.regattaCourse === RG_COURSE ? parseAqua(raw.regatta) : [],
    regattaCourse: RG_COURSE,
    fishPodium: parseFishPodium(raw.fishPodium),
    lobbyEvents: parseLobbyEvents(raw.lobbyEvents),
    // необязательное: старые сохранения без рекордов крепости читаются как есть (поле появится с первым забегом)
    ...(raw.fortTop !== undefined ? { fortTop: parseFortTop(raw.fortTop) } : {}),
    ...(raw.dgTop !== undefined ? { dgTop: parseDgTop(raw.dgTop) } : {}),
    ...(raw.dgWeek !== undefined ? { dgWeek: parseDgWeek(raw.dgWeek) } : {}),
    ...(raw.farmPlots !== undefined ? { farmPlots: parseFarmPlots(raw.farmPlots) } : {}),
    ...(normalizeBoss(raw.farmBoss) ? { farmBoss: normalizeBoss(raw.farmBoss)! } : {}),
    profiles,
  };
}

/** Рекорды крепости: только целые записи, не больше FORT_TOP, по убыванию волн (раньше — выше) */
export function parseFortTop(raw: unknown): FortRunRec[] {
  if (!Array.isArray(raw)) return [];
  const out: FortRunRec[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const wave = Math.floor(num(o.wave));
    if (wave <= 0 || wave > 100000) continue;
    const id = Number.isSafeInteger(o.id) && (o.id as number) > 0 ? { id: o.id as number } : {};
    out.push({ wave, names: strings(o.names).slice(0, 6).map((s) => s.slice(0, 40)), at: Math.max(0, num(o.at)), n: Math.max(1, Math.min(6, Math.floor(num(o.n, 1)))), ...id });
  }
  return sortFortTop(out);
}

/**
 * Забег в таблицу рекордов: по убыванию волн, при равенстве — кто раньше; не больше FORT_TOP. Забег с номером игры (id),
 * который уже есть в таблице, заменяет свою прежнюю запись (игра идёт — рекорд растёт), а не добавляет вторую.
 */
export function addFortRun(top: readonly FortRunRec[], rec: FortRunRec): FortRunRec[] {
  const rest = rec.id ? top.filter((r) => r.id !== rec.id) : top;
  return sortFortTop([...rest, rec]);
}

function sortFortTop(list: FortRunRec[]): FortRunRec[] {
  return list.sort((a, b) => b.wave - a.wave || a.at - b.at).slice(0, FORT_TOP);
}

/** Участки фермы: ровно FARM_PLOTS мест, у каждого — pid и время или пусто; один игрок — один участок */
export function parseFarmPlots(raw: unknown): NonNullable<State['farmPlots']> {
  const out: NonNullable<State['farmPlots']> = Array.from({ length: FARM_PLOTS }, () => null);
  if (!Array.isArray(raw)) return out;
  const seen = new Set<number>();
  raw.slice(0, FARM_PLOTS).forEach((r, i) => {
    const o = r && typeof r === 'object' ? r as Record<string, unknown> : null;
    if (!o || !Number.isSafeInteger(o.pid) || (o.pid as number) <= 0 || seen.has(o.pid as number)) return;
    seen.add(o.pid as number);
    out[i] = { pid: o.pid as number, seen: Math.max(0, Math.min(8_640_000_000_000_000, num(o.seen))) };
  });
  return out;
}

function parseLobbyEvents(raw: unknown): NonNullable<State['lobbyEvents']> {
  const r = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const stamp = (key: string): number => Math.min(8_640_000_000_000_000, Math.max(0, Math.floor(num(r[key]))));
  return { stormAt: stamp('stormAt'), piratesAt: stamp('piratesAt'), endedAt: stamp('endedAt'), lockUntil: stamp('lockUntil') };
}

/** Не разворачиваем альбомы в подиум: там нет времени и веса каждого отдельного исторического улова. */
function parseFishPodium(raw: unknown): State['fishPodium'] {
  const empty = { day: '', catches: [] as FishPodiumCatch[] };
  if (!raw || typeof raw !== 'object') return empty;
  const r = raw as Record<string, unknown>;
  if (typeof r.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.day) || !Array.isArray(r.catches)) return empty;
  const catches: FishPodiumCatch[] = [];
  for (const rawCatch of r.catches) {
    if (!rawCatch || typeof rawCatch !== 'object') continue;
    const c = rawCatch as Record<string, unknown>;
    const pid = num(c.pid), sp = num(c.sp, -1), g = num(c.g), at = num(c.at);
    if (!Number.isSafeInteger(pid) || pid <= 0 || !Number.isInteger(sp) || !isCollected(sp) || !Number.isSafeInteger(g) || g <= 0
      || !Number.isSafeInteger(at) || at <= 0 || at > 8_640_000_000_000_000 - 3 * 3600_000 || mskDay(at) !== r.day || typeof c.nick !== 'string' || !c.nick) continue;
    catches.push({ pid, nick: c.nick, sp, g, at });
  }
  catches.sort((a, b) => b.g - a.g || a.at - b.at || a.pid - b.pid || a.sp - b.sp);
  return { day: r.day, catches: catches.slice(0, 5) };
}

/** Доска рекордов аквапарка из JSON: только целые записи, у каждого профиля — одна (лучшая), по порядку. */
function parseAqua(v: unknown): AquaRecord[] {
  let top: AquaRecord[] = [];
  if (!Array.isArray(v)) return top;
  for (const r of v) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const ms = num(o.ms);
    if (typeof o.pid !== 'number' || typeof o.nick !== 'string' || !o.nick || ms <= 0) continue;
    top = addRecord(top, { pid: o.pid, nick: o.nick, ms, at: num(o.at) }).top;
  }
  return top;
}

export class Store {
  readonly dir: string;
  state: State = emptyState();
  private readonly saveDelayMs: number;
  private readonly now: () => number;
  private readonly log: (s: string) => void;
  private readonly keepBackups: number;
  private readonly onWriteError?: (error: StoreWriteError) => void;
  private dirty = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Не позволяем продолжить запись, если вызывающий код перехватил отказ загрузки существовавшей базы. */
  private loadFailed = false;
  /** Ревизия успешно записанного основного файла, даже если последующая резервная копия не удалась. */
  private committedRevision = 0;

  get primaryRevision(): number { return this.committedRevision; }

  constructor(dir: string, opts: StoreOptions = {}) {
    this.dir = dir;
    this.saveDelayMs = opts.saveDelayMs ?? 1000;
    this.now = opts.now ?? Date.now;
    this.log = opts.log ?? ((s) => console.log(s));
    this.keepBackups = opts.keepBackups ?? 7;
    this.onWriteError = opts.onWriteError;
  }

  private get backupDir(): string {
    return path.join(this.dir, 'backups');
  }

  /** Новый DATA_DIR может быть пустым; потеря существовавшего сохранения без валидной копии запрещает запуск. */
  load(): void {
    this.loadFailed = true;
    this.dirty = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    try {
      mkdirSync(this.backupDir, { recursive: true });
      const file = path.join(this.dir, FILE);
      let missing = false;
      try {
        // existsSync возвращает false и для dangling symlink/некоторых отказов доступа: это не первый запуск.
        lstatSync(file);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
        missing = true;
      }
      if (!missing) {
        try {
          this.state = parseState(readFileSync(file, 'utf8'));
          this.loadFailed = false;
          return;
        } catch {
          // Текст JSON/ошибки парсера может содержать данные профиля — оператору только общий факт отказа.
          this.log('Хранилище: существующее сохранение не читается; проверяются резервные копии');
        }
      }
      // Отказ чтения каталога не равен отсутствию копий.
      const copies = readdirSync(this.backupDir).filter((name) => BACKUP_RE.test(name)).sort().reverse();
      const entries = new Set(readdirSync(this.dir));
      const remnant = entries.has(`${FILE}.tmp`) || [...entries].some((name) => name.startsWith(`${FILE}.corrupt-`));
      if (missing && copies.length === 0 && !remnant) {
        this.state = emptyState();
        this.loadFailed = false;
        return;
      }
      for (const name of copies) {
        let recovered: State;
        try {
          recovered = parseState(readFileSync(path.join(this.backupDir, name), 'utf8'));
        } catch {
          continue;
        }
        if (!missing) {
          // Оригинал переносится только после нахождения читаемой копии; без неё остаётся на рабочем пути.
          const base = `${FILE}.corrupt-${Math.floor(this.now())}`;
          let aside = base;
          for (let n = 1; entries.has(aside); n++) aside = `${base}-${n}`;
          renameSync(file, path.join(this.dir, aside));
          this.log(`Хранилище: оригинал сохранён как ${aside}`);
        }
        this.state = recovered;
        this.loadFailed = false;
        const day = name.slice(6, 16);
        const age = Math.max(0, Math.floor((Date.parse(mskDay(this.now())) - Date.parse(day)) / 86_400_000));
        this.log(`Хранилище восстановлено из ${name}: копия за ${day}, возраст ${age} дн.; выполнен откат состояния`);
        this.markDirty();
        return;
      }
      throw new Error('no usable state');
    } catch {
      this.loadFailed = true;
      throw new Error('Хранилище недоступно или повреждено: безопасный запуск невозможен');
    }
  }

  markDirty(): void {
    if (this.loadFailed) throw new Error('Хранилище недоступно или повреждено: безопасный запуск невозможен');
    this.dirty = true;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      try { this.flush(); }
      catch (error) {
        if (!(error instanceof StoreWriteError)) throw error;
        // flush has already notified the runtime; never throw a disk error out of a timer.
        if (!this.onWriteError) this.log(error.message);
      }
    }, this.saveDelayMs);
    this.timer.unref?.();
  }

  /** Записывает несохранённое прямо сейчас (синхронно). */
  flush(): void {
    if (this.loadFailed) throw new Error('Хранилище недоступно или повреждено: безопасный запуск невозможен');
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.dirty) return;
    let text: string;
    try {
      text = JSON.stringify(this.state);
      const file = path.join(this.dir, FILE);
      writeAtomic(file, text);
    } catch {
      // Keep pending memory intact. Even a caller which catches this error must stop the runtime.
      const error = new StoreWriteError();
      try { this.onWriteError?.(error); }
      finally { throw error; }
    }
    this.committedRevision++;
    this.dirty = false;
    try {
      const backup = path.join(this.backupDir, `state-${mskDay(this.now())}.json`);
      if (!existsSync(backup)) {
        writeAtomic(backup, text);
        const list = this.backups();
        for (const old of list.slice(0, Math.max(0, list.length - this.keepBackups))) unlinkSync(path.join(this.backupDir, old));
      }
    } catch {
      // Primary is durable: an unavailable daily copy must not reject an already committed action.
      // A later save will retry the missing daily copy.
      this.log('Хранилище: основной файл сохранён, резервная копия не обновлена');
    }
  }

  close(): void {
    this.flush();
  }

  /** Имена копий по возрастанию даты. */
  private backups(): string[] {
    try {
      return readdirSync(this.backupDir).filter((f) => BACKUP_RE.test(f)).sort();
    } catch {
      return [];
    }
  }
}

function writeAtomic(file: string, text: string): void {
  const tmp = `${file}.tmp`;
  const fd = openSync(tmp, 'w', 0o600);
  try {
    writeSync(fd, text);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, file);
}

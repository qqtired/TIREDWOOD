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

export const LEGACY_SKILL_COURSE = 'sky-tower-v1';
export const TOWER_SKILL_COURSE = 'cloud-tower-185-v2';
export type SkillRecordCourse = typeof LEGACY_SKILL_COURSE | typeof TOWER_SKILL_COURSE;
export interface SkillCourseRecord { best: number; medal: number; clean: number; day: number; runs: number }
export interface RecordCourses { aqua: number; regatta: string; skill: SkillRecordCourse }

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
  /** Личные времена всех версий аквапарка, мс; aqBest — проекция активного курса. */
  aquaBests?: Record<string, number>;
  /** Полные рекорды курсов каланчи. Общий skRuns и оплаченный skDay не обнуляются при смене курса. */
  skillRecords?: Record<string, SkillCourseRecord>;
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
   * Активная полоса. Перед её сменой доска и личные лучшие сохраняются в архив курса.
   */
  aquaCourse: number;
  aquaArchive: Record<string, AquaRecord[]>;
  /**
   * «Портовая регата»: пять лучших кругов бухты (мс; у каждого — только свой лучший) и для какой трассы (RG_COURSE).
   * Трасса новая — доска пустеет (личные лучшие круги — у каждой трассы своё поле в статистике).
   */
  regatta: AquaRecord[];
  regattaCourse: string;
  regattaArchive: Record<string, AquaRecord[]>;
  skillCourse: SkillRecordCourse;
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
  /** Явные цели полезны для проверки миграции/отката на копии, без изменения окружения процесса. */
  recordCourses?: Partial<RecordCourses>;
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

function currentRecordCourses(overrides: Partial<RecordCourses> = {}): RecordCourses {
  return { aqua: overrides.aqua ?? AQUA_COURSE, regatta: overrides.regatta ?? RG_COURSE,
    skill: overrides.skill ?? (process.env.SKILL_TOWER2 === '1' ? TOWER_SKILL_COURSE : LEGACY_SKILL_COURSE) };
}

function emptyState(courses = currentRecordCourses()): State {
  return { v: 1, nextId: 1, jackpot: POOL_MIN, lastJackpot: null, respects: 0, aqua: [], aquaCourse: courses.aqua,
    aquaArchive: {}, regatta: [], regattaCourse: courses.regatta, regattaArchive: {}, skillCourse: courses.skill,
    fishPodium: { day: '', catches: [] }, lobbyEvents: { stormAt: 0, piratesAt: 0, endedAt: 0, lockUntil: 0 }, profiles: [] };
}

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function courseId(v: unknown): string | null {
  return typeof v === 'string' && /^[a-z0-9][a-z0-9_.-]{0,79}$/.test(v)
    && v !== 'constructor' && v !== 'prototype' ? v : null;
}

function aquaId(v: string): boolean { return /^[1-9]\d{0,7}$/.test(v); }
function better(a: number | undefined, b: number): number {
  return a && a > 0 ? b > 0 ? Math.min(a, b) : a : Math.max(0, b);
}

function parseBests(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, value] of Object.entries(raw)) if (aquaId(id) && num(value) > 0) out[id] = num(value);
  return out;
}

function cleanSkill(raw: unknown): SkillCourseRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  return { best: Math.max(0, num(r.best)), medal: Math.max(0, Math.min(3, Math.floor(num(r.medal)))),
    clean: num(r.clean) > 0 ? 1 : 0, day: Math.max(0, Math.floor(num(r.day))), runs: Math.max(0, Math.floor(num(r.runs))) };
}

function mergeSkill(a: SkillCourseRecord | undefined, raw: SkillCourseRecord): SkillCourseRecord {
  const b = cleanSkill(raw)!;
  return { best: better(a?.best, b.best), medal: Math.max(a?.medal ?? 0, b.medal), clean: Math.max(a?.clean ?? 0, b.clean),
    day: Math.max(a?.day ?? 0, b.day), runs: Math.max(a?.runs ?? 0, b.runs) };
}

function parseSkillRecords(raw: unknown): Record<string, SkillCourseRecord> {
  const out: Record<string, SkillCourseRecord> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw)) {
    const id = courseId(key), record = cleanSkill(value);
    if (id && record) out[id] = record;
  }
  return out;
}

/** Архив хранит всех ранее сохранённых участников курса; лимит доски применяется только к active top. */
function mergeRecordRows(a: readonly AquaRecord[], raw: unknown): AquaRecord[] {
  const records = new Map<number, AquaRecord>(a.map((r) => [r.pid, { ...r }]));
  if (Array.isArray(raw)) for (const value of raw) {
    if (!value || typeof value !== 'object') continue;
    const r = value as Record<string, unknown>;
    if (!Number.isSafeInteger(r.pid) || num(r.pid) <= 0 || typeof r.nick !== 'string' || !r.nick || num(r.ms) <= 0) continue;
    const next = { pid: num(r.pid), nick: r.nick, ms: num(r.ms), at: Math.max(0, num(r.at)) };
    const previous = records.get(next.pid);
    if (!previous || next.ms < previous.ms || next.ms === previous.ms && next.at < previous.at) records.set(next.pid, next);
  }
  return [...records.values()].sort((a, b) => a.ms - b.ms || a.at - b.at || a.pid - b.pid);
}

function parseRecordArchive(raw: unknown, aqua = false): Record<string, AquaRecord[]> {
  const out: Record<string, AquaRecord[]> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, rows] of Object.entries(raw)) if ((aqua ? aquaId(id) : courseId(id)) && Array.isArray(rows)) out[id] = mergeRecordRows([], rows);
  return out;
}

function archiveTop(archive: Record<string, AquaRecord[]>, course: string, raw: unknown): void {
  const rows = mergeRecordRows(archive[course] ?? [], raw);
  if (rows.length || Object.hasOwn(archive, course)) archive[course] = rows;
}

/** Только числовые проекции: существующий stats wire остаётся достаточным для карточек текущего и прежних курсов. */
function projectCourseRecords(p: Profile, aqua: number, skill: SkillRecordCourse): void {
  const s = p.stats, a = p.aquaBests ?? {}, k = p.skillRecords ?? {};
  s.aqCourse = aqua;
  s.aqBestCourse1 = a['1'] ?? 0; s.aqBestCourse2 = a['2'] ?? 0; s.aqBestCourse3 = a['3'] ?? 0;
  s.skCourse = skill === TOWER_SKILL_COURSE ? 2 : 1;
  const old = k[LEGACY_SKILL_COURSE], tower = k[TOWER_SKILL_COURSE];
  s.skBestLegacy = old?.best ?? 0; s.skMedalLegacy = old?.medal ?? 0; s.skCleanLegacy = old?.clean ?? 0;
  s.skDayLegacy = old?.day ?? 0; s.skRunsLegacy = old?.runs ?? 0;
  s.skBestTower185 = tower?.best ?? 0; s.skMedalTower185 = tower?.medal ?? 0; s.skCleanTower185 = tower?.clean ?? 0;
  s.skDayTower185 = tower?.day ?? 0; s.skRunsTower185 = tower?.runs ?? 0;
}

function captureSkill(p: Profile, course: string, finished = false): void {
  const records = p.skillRecords ?? (p.skillRecords = {});
  const prior = records[course];
  const elsewhere = Object.entries(records).reduce((sum, [id, r]) => sum + (id === course ? 0 : r.runs), 0);
  records[course] = mergeSkill(records[course], { best: p.stats.skBest, medal: p.stats.skMedal, clean: p.stats.skClean,
    // skDay — общий оплаченный день. Дату конкретного курса обновляет только его финиш или первая миграция.
    day: finished || !prior || !p.stats.skCourse ? p.stats.skDay : prior.day,
    runs: Math.max(0, p.stats.skRuns - elsewhere) });
}

/** Сначала сохранить исходный активный курс, затем выбрать цель. Можно вызывать повторно, в том числе при входе. */
export function selectProfileCourses(p: Profile, courses: Pick<RecordCourses, 'aqua' | 'skill'>,
  fromAqua = p.stats.aqCourse || courses.aqua,
  fromSkill: string = p.stats.skCourse === 1 ? LEGACY_SKILL_COURSE : p.stats.skCourse === 2 ? TOWER_SKILL_COURSE : courses.skill): void {
  const bests = p.aquaBests ?? (p.aquaBests = {});
  if (p.stats.aqBest > 0) bests[String(fromAqua)] = better(bests[String(fromAqua)], p.stats.aqBest);
  p.stats.aqBest = bests[String(courses.aqua)] ?? 0;
  captureSkill(p, fromSkill);
  const records = p.skillRecords!;
  const record = records[courses.skill] ?? (records[courses.skill] = { best: 0, medal: 0, clean: 0, day: 0, runs: 0 });
  const paidDay = Math.max(p.stats.skDay, ...Object.values(records).map((r) => r.day));
  p.stats.skBest = record.best; p.stats.skMedal = record.medal; p.stats.skClean = record.clean;
  // Суточная награда общая для режима: смена курса не даёт её второй раз в тот же день.
  p.stats.skDay = paidDay;
  projectCourseRecords(p, courses.aqua, courses.skill);
}

/** После штатного applySkillFinish: сохранить именно текущий курс, не смешивая времена разных высот. */
export function saveSkillRecord(p: Profile, course: SkillRecordCourse): void {
  captureSkill(p, course, true);
  projectCourseRecords(p, p.stats.aqCourse || AQUA_COURSE, course);
}

/** После финиша аквапарка: aqRuns считает вызывающий код, здесь только best и его проекции. */
export function saveAquaRecord(p: Profile, course: number): void {
  const records = p.aquaBests ?? (p.aquaBests = {});
  if (p.stats.aqBest > 0) records[String(course)] = better(records[String(course)], p.stats.aqBest);
  projectCourseRecords(p, course, p.stats.skCourse === 2 ? TOWER_SKILL_COURSE : LEGACY_SKILL_COURSE);
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
  const aquaBests = parseBests(r.aquaBests);
  for (const [id, value] of [['1', stats.aqBestCourse1], ['2', stats.aqBestCourse2], ['3', stats.aqBestCourse3]] as const) {
    if (value > 0) aquaBests[id] = better(aquaBests[id], value);
  }
  const skillRecords = parseSkillRecords(r.skillRecords);
  for (const [id, value] of [[LEGACY_SKILL_COURSE, { best: stats.skBestLegacy, medal: stats.skMedalLegacy, clean: stats.skCleanLegacy, day: stats.skDayLegacy, runs: stats.skRunsLegacy }],
    [TOWER_SKILL_COURSE, { best: stats.skBestTower185, medal: stats.skMedalTower185, clean: stats.skCleanTower185, day: stats.skDayTower185, runs: stats.skRunsTower185 }]] as const) {
    if (value.best || value.medal || value.clean || value.runs) skillRecords[id] = mergeSkill(skillRecords[id], value);
  }
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
    aquaBests,
    skillRecords,
    foolUntil: num(r.foolUntil),
    epUntil: num(r.epUntil),
    album,
    fishing,
    ...(r.farm !== undefined ? { farm: normalizeFarm(r.farm) } : {}),
  };
}

function parseState(text: string, courses: RecordCourses): State {
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
  const oldAqua = Number.isSafeInteger(raw.aquaCourse) && num(raw.aquaCourse) > 0 ? num(raw.aquaCourse) : 1;
  const oldRegatta = courseId(raw.regattaCourse) ?? 'legacy-unknown';
  const oldSkill = courseId(raw.skillCourse) ?? LEGACY_SKILL_COURSE;
  const aquaArchive = parseRecordArchive(raw.aquaArchive, true);
  const regattaArchive = parseRecordArchive(raw.regattaArchive);
  archiveTop(aquaArchive, String(oldAqua), raw.aqua);
  archiveTop(regattaArchive, oldRegatta, raw.regatta);
  for (const p of profiles) selectProfileCourses(p, courses, oldAqua, oldSkill);
  return {
    v: 1,
    nextId,
    jackpot: Math.max(POOL_MIN, num(raw.jackpot, POOL_MIN)),
    lastJackpot: lj && typeof lj.nick === 'string' ? { nick: lj.nick, win: num(lj.win), at: num(lj.at) } : null,
    respects: Math.max(0, Math.floor(num(raw.respects))),
    aqua: parseAqua(aquaArchive[String(courses.aqua)]),
    aquaCourse: courses.aqua,
    aquaArchive,
    regatta: parseAqua(regattaArchive[courses.regatta]),
    regattaCourse: courses.regatta,
    regattaArchive,
    skillCourse: courses.skill,
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
  state: State;
  private readonly recordCourses: RecordCourses;
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
    this.recordCourses = currentRecordCourses(opts.recordCourses);
    this.state = emptyState(this.recordCourses);
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
          this.state = parseState(readFileSync(file, 'utf8'), this.recordCourses);
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
        this.state = emptyState(this.recordCourses);
        this.loadFailed = false;
        return;
      }
      for (const name of copies) {
        let recovered: State;
        try {
          recovered = parseState(readFileSync(path.join(this.backupDir, name), 'utf8'), this.recordCourses);
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
      // Каноническая запись уже содержит архивы текущего top и проекции новых профилей.
      // Тогда восстановление той же копии не вносит ещё одну миграцию в только что записанный снимок.
      archiveTop(this.state.aquaArchive, String(this.state.aquaCourse), this.state.aqua);
      archiveTop(this.state.regattaArchive, this.state.regattaCourse, this.state.regatta);
      for (const p of this.state.profiles) selectProfileCourses(p, { aqua: this.state.aquaCourse, skill: this.state.skillCourse });
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

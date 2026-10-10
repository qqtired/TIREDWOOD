// «Подземелье»: настоящая симуляция (shared/dungeon/sim.ts) для сцены. Шаги, события журнала, хеш и итог — как у
// сервера; здесь только перевод DgSim в DgView (что рисовать) раз в шаг: состояния врагов → клипы, метки → тревоги на
// полу, постройки → вид и свечение, fx шага → эффекты и звук, выбор и сундук → экраны интерфейса.
import type { DgEvent, DgResult } from '../../shared/dungeon/api.ts';
import { DG_HZ } from '../../shared/dungeon/api.ts';
import {
  applyEvent, beamDir, createRun, dgHash, dgResult, DG_DATA, orbCount, orbPos, step, wstats,
  type DgBoss, type DgCard, type DgFx, type DgMob, type DgProp, type DgSim,
} from '../../shared/dungeon/sim.ts';
import { evoOf } from '../../shared/dungeon/data.ts';
import { BOSS_NAME, BUFFS, MISC, MOBS, PASSIVES, WEAPONS } from './data.ts';
import type { HudBuff, HudCard, HudChest, HudItem } from './hudtypes.ts';
import type { RunSource } from './source.ts';
import {
  ACT_ATTACK, ACT_LOOP, ACT_SPECIAL, ACT_STUN, ACT_WALK,
  type BuildingKind, type DgView, type MobKind, type PickupKind, type VBoss, type VBuilding, type VEnemy, type VFx, type VPickup, type VProj, type VPuddle, type VTele,
} from './view.ts';

const DT = 1 / DG_HZ;
const L = 240;
const wrap = (d: number): number => d - L * Math.round(d / L);
/** Имена босса по варианту (sim.bosses[].kind) */
const BOSS_NAMES = [BOSS_NAME, 'Повидл II', 'Близнецы', 'Повидл III'];
const PROP_KIND: Record<DgProp['k'], BuildingKind> = {
  altar: 'altar', brazier: 'brazier', chest: 'chest', spring: 'spring', lamp: 'lamppost', cart: 'minecart', keg: 'keg', tramp: 'trampoline', forge: 'forge',
};
const DASH_DIST = DG_DATA.actives.dash.distance;
/** Высота прыжка с гриба-батута, м */
const JUMP_H = 3.2;

/** Кто одолел героя — по-человечески */
function killerName(by: string, bossName: string): string {
  if (!by) return '';
  if (by === 'povidl') return bossName;
  if (by in MOBS) return MOBS[by as MobKind].name;
  if (by === 'puddle') return 'Лужа повидла';
  if (by === 'keg' || by === 'barrel') return 'Пороховая бочка';
  return '';
}

function weaponItem(id: string, lv: number, evo: boolean): HudItem {
  const key = evo ? `${id}_evo` : id;
  const info = WEAPONS[key] ?? WEAPONS[id];
  return { id: key, icon: info?.icon ?? '•', name: info?.name ?? id, lv, max: WEAPONS[id]?.max ?? 7, evo };
}

/** Числа оружия на карточке: ключ уровня → подпись и формат */
const W_STATS: [string, string, (v: number) => string][] = [
  ['dmg', 'Урон', (v) => num(v)],
  ['cd', 'Перезарядка', (v) => `${num(v)} с`],
  ['n', 'Снарядов', (v) => num(v)],
  ['jumps', 'Целей', (v) => num(v)],
  ['chains', 'Цепей', (v) => num(v)],
  ['pierce', 'Пробивает', (v) => num(v)],
  ['angle', 'Конус', (v) => `${num(v)}°`],
  ['range', 'Дальность', (v) => `${num(v)} м`],
  ['radius', 'Радиус', (v) => `${num(v)} м`],
  ['length', 'Длина луча', (v) => `${num(v)} м`],
  ['width', 'Ширина', (v) => `${num(v)} м`],
  ['maxOnFloor', 'На полу до', (v) => num(v)],
];
/** Пассивки на карточке: подпись, знак, единица (проценты — у кого per < 1) */
const P_STAT: Record<string, [string, string, string]> = {
  might: ['Урон', '+', ''], cooldown: ['Перезарядка', '−', ''], area: ['Область', '+', ''], amount: ['Снаряды', '+', ''],
  maxhp: ['Здоровье', '+', ' HP'], armor: ['Удар по тебе', '−', ''], speed: ['Скорость', '+', ''], magnet: ['Подбор', '+', ''],
};
/** 1,1 — по-русски, без лишних нулей */
function num(v: number): string {
  return String(Math.round(v * 100) / 100).replace('.', ',');
}

function cardView(sim: DgSim, c: DgCard): HudCard {
  if (c.k === 'stew') {
    const m = MISC.stew;
    const h = sim.hero;
    return { id: c.k, icon: m.icon, name: m.name, from: 0, to: 0, text: m.text, kind: 'misc', cat: { label: 'Лечение', tone: 'heal' }, stats: [`Сейчас ${Math.ceil(h.hp)} из ${Math.round(h.hpMax)} HP`] };
  }
  if (c.k === 'temper') {
    const m = MISC.temper;
    const t = DG_DATA.levelUp.temper;
    return { id: c.k, icon: m.icon, name: m.name, from: 0, to: 0, text: m.text, kind: 'misc', cat: { label: 'Закалка', tone: 'gold' }, stats: [`Всем оружиям: +${num(sim.temper * t.dmg * 100)} % → +${num((sim.temper + 1) * t.dmg * 100)} %`, `Взято ${sim.temper} из ${t.max}`] };
  }
  if (c.k === 'w') {
    const info = WEAPONS[c.id];
    const def = DG_DATA.weapons.find((w) => w.id === c.id);
    const cur = (c.lv > 1 ? def?.levels[c.lv - 2] : undefined) as Record<string, unknown> | undefined;
    const nxt = def?.levels[c.lv - 1] as Record<string, unknown> | undefined;
    const stats: string[] = [];
    for (const [k, label, f] of W_STATS) {
      const b = nxt?.[k];
      if (typeof b !== 'number') continue;
      const a = cur?.[k];
      if (typeof a === 'number' && a !== b) stats.push(`${label} ${f(a)} → ${f(b)}`);
      else if (!cur && stats.length < 4) stats.push(`${label} ${f(b)}`);
    }
    // эволюция: на 7-м уровне вместе с нужной пассивкой
    const e = evoOf(c.id);
    let hint: string | undefined;
    if (e) {
      const has = sim.passives.some((p) => p.id === e.with);
      hint = `Эволюция: 7-й ур. + «${PASSIVES[e.with]?.name ?? e.with}»${has ? ' ✓' : ''} → «${WEAPONS[e.id]?.name ?? e.name}»`;
    }
    const up = c.lv > 1 ? (nxt?.up as string | undefined) : undefined;
    return {
      id: c.id, icon: info?.icon ?? '•', name: info?.name ?? c.id, from: c.lv - 1, to: c.lv, text: up ?? def?.desc ?? info?.text ?? '', kind: 'weapon',
      cat: { label: 'Оружие', tone: 'weapon' }, stats, hint,
    };
  }
  const info = PASSIVES[c.id];
  const def = DG_DATA.passives.find((p) => p.id === c.id);
  const stats: string[] = [];
  if (def) {
    const [label, sign, unit] = P_STAT[c.id] ?? ['Бонус', '+', ''];
    const pct = def.per < 1;
    const f = (lv: number): string => `${sign}${pct ? num(def.per * lv * 100) : num(def.per * lv)}${pct ? ' %' : unit}`;
    stats.push(c.lv > 1 ? `${label}: ${f(c.lv - 1)} → ${f(c.lv)}` : `${label}: ${f(1)}`);
  }
  // для эволюции какого своего оружия нужна
  let hint: string | undefined;
  for (const w of sim.weapons) {
    const e = evoOf(w.id);
    if (e && e.with === c.id && !w.evo) {
      hint = `Нужна для эволюции: «${WEAPONS[w.id]?.name ?? w.id}» → «${WEAPONS[e.id]?.name ?? e.name}»`;
      break;
    }
  }
  return {
    id: c.id, icon: info?.icon ?? '•', name: info?.name ?? c.id, from: c.lv - 1, to: c.lv, text: def?.text ?? info?.text ?? '', kind: 'passive',
    cat: { label: 'Бонус', tone: 'passive' }, stats, hint,
  };
}

function chestView(sim: DgSim): HudChest | null {
  const ch = sim.chest;
  if (!ch) return null;
  const items: HudChest['items'] = [];
  let fallback: string | undefined;
  for (const r of ch.rows) {
    if (r.k === 'gold') fallback = '+50 опыта и +30 HP';
    else if (r.k === 'evo') {
      const info = WEAPONS[r.id];
      items.push({ id: r.id, kind: 'evo', icon: info?.icon ?? '★', name: info?.name ?? r.id, from: 0, to: 0, evo: true });
    } else {
      const info = r.k === 'w' ? WEAPONS[r.id] : PASSIVES[r.id];
      items.push({ id: r.id, kind: r.k === 'w' ? 'weapon' : 'passive', icon: info?.icon ?? '•', name: info?.name ?? r.id, from: r.lv - 1, to: r.lv });
    }
  }
  const title = ch.kind === 'plain' ? 'Сундук' : ch.kind === 'isle' ? 'Сундук островка' : undefined;
  return { items, big: ch.kind === 'big', title, fallback: items.length ? undefined : fallback ?? '+50 опыта и +30 HP' };
}

/** Состояние врага → что играть */
function mobAct(m: DgMob, sim: DgSim): number {
  switch (m.st) {
    case 'stun':
      return ACT_STUN;
    case 'wind':
    case 'cast':
    case 'summon':
      return ACT_SPECIAL;
    case 'dash':
      return m.k === 'barrel' ? ACT_LOOP : ACT_WALK;
    default: {
      // вплотную к герою — кусает (атака по кругу)
      const h = sim.hero;
      const dx = wrap(h.x - m.x);
      const dz = wrap(h.z - m.z);
      const rr = m.r + 0.9;
      return m.st === 'walk' && dx * dx + dz * dz < rr * rr ? ACT_ATTACK : ACT_WALK;
    }
  }
}

/** Состояние червя → клип босса */
function bossAnim(m: DgMob): VBoss['anim'] {
  if (m.die) return 'death';
  switch (m.st) {
    case 'under':
    case 'rise':
      return 'under';
    case 'dive':
      return 'burrow';
    case 'stuck':
      return 'emerge';
    case 'roar':
    case 'summon':
      return 'roar';
    case 'wind':
      return 'spit';
    case 'tail':
      return 'slam';
    default:
      return Math.abs(m.vx) + Math.abs(m.vz) > 0.3 ? 'move' : 'idle';
  }
}

export class SimRun implements RunSource {
  readonly sim: DgSim;
  private cached: DgView | null = null;
  private fx: VFx[] = [];
  private lastShot = 0;
  /** Каждый червь-босс (у Близнецов два): состояние, текущий клип и с какого шага он идёт, масштаб */
  private readonly bossTrack = new Map<number, { st: string; anim: VBoss['anim']; at: number; scale: number }>();
  private bossSeen = false;
  /** шаг последнего озверения (вспышка на озверевших 0,4 с) */
  private rageAt = -100;
  private readonly buffTotal = new Map<string, number>();
  /** перезарядка оружий для HUD: полная (шагов) — с последнего выстрела, выстрелов всего */
  private readonly wcd = new Map<string, { max: number; prev: number; fires: number; idle: boolean }>();

  constructor(seed: number) {
    this.sim = createRun(seed);
  }

  get tick(): number {
    return this.sim.t;
  }

  get frozen(): boolean {
    return !!(this.sim.choice || this.sim.chest);
  }

  apply(ev: DgEvent): void {
    applyEvent(this.sim, ev);
    this.cached = null;
  }

  step(): void {
    step(this.sim);
    this.cached = null;
    this.fx = [];
    for (const f of this.sim.fx) this.onFx(f);
    for (const f of this.sim.fx) if (f.k === 'rage') this.rageAt = this.sim.t;
    this.trackBoss();
    this.trackWeapons();
    // новые снаряды — звук выстрела
    let ember = false;
    let pick = false;
    for (const s of this.sim.shots) {
      if (s.id <= this.lastShot) continue;
      if (s.k === 'ember') ember = true;
      else pick = true;
    }
    for (const s of this.sim.shots) this.lastShot = Math.max(this.lastShot, s.id);
    if (ember) this.fx.push({ k: 'shot', w: 'ember' });
    if (pick) this.fx.push({ k: 'shot', w: 'pick' });
  }

  hash(): number {
    return dgHash(this.sim);
  }

  /**
   * Перезарядка оружий: симуляция хранит только «шагов до выстрела» (cd). Выстрел — cd подскочил: это и есть полная
   * перезарядка. Подскок до 10 шагов — «некого бить, проверю позже» (Маяк), это не выстрел: значок просто готов.
   */
  private trackWeapons(): void {
    for (const w of this.sim.weapons) {
      let r = this.wcd.get(w.id);
      if (!r) this.wcd.set(w.id, (r = { max: 0, prev: w.cd, fires: 0, idle: false }));
      if (w.cd > r.prev) {
        if (w.cd > 10) {
          r.max = w.cd;
          r.fires++;
          r.idle = false;
        } else r.idle = true;
      }
      r.prev = w.cd;
    }
  }

  private weaponHud(w: DgSim['weapons'][number]): HudItem {
    const it = weaponItem(w.id, w.lv, w.evo === 1);
    const r = this.wcd.get(w.id);
    const always = w.id === 'fireflies' || (w.id === 'beam' && w.evo === 1);
    it.cd01 = always ? -1 : !r || r.idle || r.max <= 0 || w.cd <= 0 ? 1 : Math.max(0, Math.min(1, 1 - w.cd / r.max));
    it.fires = r?.fires ?? 0;
    if (!w.evo && w.lv >= (WEAPONS[w.id]?.max ?? 7)) {
      if (this.sim.evoReady.includes(w.id)) it.evoReady = true;
      else {
        const e = evoOf(w.id);
        const p = e ? PASSIVES[e.with] : undefined;
        if (e && p && !this.sim.passives.some((x) => x.id === e.with)) it.need = { id: e.with, icon: p.icon, name: p.name };
      }
    }
    return it;
  }

  result(): DgResult {
    return dgResult(this.sim);
  }

  private mob(id: number): DgMob | undefined {
    for (const m of this.sim.mobs) if (m.id === id) return m;
    return undefined;
  }

  private bossName(): string {
    const b = this.sim.bosses[0];
    return BOSS_NAMES[b ? b.kind : Math.max(0, (Math.floor(this.sim.wave.n / 10) - 1) % 4)] ?? BOSS_NAME;
  }

  /** Боссы (каждый червь): смена состояния → крик, нырок, вынырок. Идём по червям в `mobs`, а не по `sim.bosses`: павший
   *  уже вычеркнут из `bosses`, но ещё лежит и доигрывает клип смерти. */
  private trackBoss(): void {
    const track = this.bossTrack;
    let n = 0;
    for (const m of this.sim.mobs) {
      if (m.k !== 'povidl') continue;
      n++;
      let s = track.get(m.id);
      if (!s) {
        s = { st: '', anim: 'under', at: this.sim.t, scale: 1 };
        track.set(m.id, s);
      }
      const anim = bossAnim(m);
      if (anim !== s.anim) {
        s.anim = anim;
        s.at = this.sim.t;
      }
      const b = this.bossOf(m.id);
      if (b) s.scale = b.scale;
      if (m.st === s.st) continue;
      const was = s.st;
      s.st = m.st;
      const at = { x: m.x, z: m.z };
      // крик «появился» и плашка с именем — один раз на бой, даже если боссов двое
      if (!this.bossSeen) {
        this.bossSeen = true;
        this.fx.push({ k: 'boss', what: 'spawn', ...at });
      }
      if (m.st === 'dive') this.fx.push({ k: 'boss', what: 'burrow', ...at });
      else if (m.st === 'stuck' || (was === 'rise' && !m.under)) this.fx.push({ k: 'boss', what: 'emerge', ...at });
      else if (m.st === 'roar') this.fx.push({ k: 'boss', what: 'roar', ...at });
      else if (m.st === 'tail') this.fx.push({ k: 'boss', what: 'slam', ...at });
    }
    if (n === 0) {
      track.clear();
      this.bossSeen = false;
    } else if (track.size > n) {
      for (const id of [...track.keys()]) if (!this.mob(id)) track.delete(id);
    }
  }

  private bossOf(id: number): DgBoss | undefined {
    for (const b of this.sim.bosses) if (b.id === id) return b;
    return undefined;
  }

  private onFx(f: DgFx): void {
    const out = this.fx;
    const sim = this.sim;
    switch (f.k) {
      case 'hit': {
        const m = this.mob(f.id);
        out.push({ k: 'hit', id: m?.k === 'povidl' ? -1 : f.id, boss: m?.k === 'povidl' ? f.id : undefined, x: f.x, z: f.z, dmg: f.n, big: f.big === 1 });
        break;
      }
      case 'die': {
        if (f.mob === 'povidl') {
          out.push({ k: 'boss', what: 'death', x: f.x, z: f.z });
          break;
        }
        const m = this.mob(f.id);
        out.push({ k: 'kill', id: f.id, kind: f.mob as MobKind, x: f.x, z: f.z, elite: m?.elite === 1 });
        break;
      }
      case 'hurt':
        out.push({ k: 'hurt', dmg: f.n });
        break;
      case 'lvl':
        out.push({ k: 'level', level: f.level });
        break;
      case 'pick': {
        const kind: PickupKind = f.what === 'gem' ? 'gem1' : f.what === 'bigchest' ? 'chest' : (f.what as PickupKind);
        out.push({ k: 'pick', kind, x: f.x, z: f.z });
        break;
      }
      case 'dash':
        out.push({ k: 'dash', x: f.x, z: f.z, tx: f.x + f.dx * DASH_DIST, tz: f.z + f.dz * DASH_DIST });
        break;
      case 'q':
        out.push({ k: 'q', x: f.x, z: f.z, r: f.r, full: f.full === 1 });
        break;
      case 'qfull':
        out.push({ k: 'qfull' });
        break;
      case 'cone':
        out.push({ k: 'cone', x: f.x, z: f.z, yaw: Math.atan2(f.dx, f.dz), angle: (f.a * Math.PI) / 180, range: f.r, evo: f.evo === 1 });
        break;
      case 'beam':
        out.push({ k: 'beam', x: f.x, z: f.z, yaw: Math.atan2(f.dx, f.dz), len: f.len, w: f.w });
        break;
      case 'chain':
        out.push({ k: 'chain', pts: f.pts });
        break;
      case 'boom': {
        const w = f.what;
        const kind = w === 'charge' ? 'charge' : w === 'keg' || w === 'barrel' ? 'keg' : w === 'stal' || w === 'boulder' ? 'rock' : 'rock';
        out.push({ k: 'boom', x: f.x, z: f.z, r: f.r, kind });
        break;
      }
      case 'atk': {
        const m = this.mob(f.id);
        if (m) out.push({ k: 'atk', what: m.k === 'povidl' ? `boss_${f.what}` : f.what, x: m.x, z: m.z });
        break;
      }
      case 'wave': {
        if (f.what === 'clear') {
          out.push({ k: 'waveWin', wave: f.n });
          break;
        }
        const boss = f.n % 10 === 0;
        out.push({ k: 'wave', wave: f.n, title: boss ? this.bossNameFor(f.n) : `Волна ${f.n}`, sub: boss ? 'Босс' : waveSub(f.n) });
        break;
      }
      case 'alert': {
        const a = f.a;
        const mob = a.mob in MOBS ? MOBS[a.mob as MobKind].name : '';
        if (a.k === 'elite') out.push({ k: 'elite', kind: a.mob as MobKind, name: mob, x: a.x, z: a.z });
        else if (a.k === 'swarm') out.push({ k: 'event', title: 'Налёт мышей' });
        else if (a.k === 'ring') out.push({ k: 'event', title: 'Окружают!' });
        else if (a.k === 'pack') out.push({ k: 'event', title: mob ? `Стая: ${mob.toLowerCase()}` : 'Стая' });
        else if (a.k === 'horde') out.push({ k: 'event', title: 'Орда!' });
        else if (a.k === 'curse') out.push({ k: 'elite', kind: (a.mob || 'barrel') as MobKind, name: 'Проклятие сундука', x: a.x, z: a.z });
        break;
      }
      case 'phase': {
        const m = this.mob(f.id);
        out.push({ k: 'boss', what: 'phase', x: m?.x ?? sim.hero.x, z: m?.z ?? sim.hero.z });
        break;
      }
      case 'prop': {
        if (f.what === 'land') {
          out.push({ k: 'spawnFx', x: sim.hero.x, z: sim.hero.z });
          break;
        }
        if (f.what === 'fail') break;
        const p = sim.props.find((q) => q.id === f.id);
        if (p) out.push({ k: 'use', kind: PROP_KIND[p.k], x: p.x, z: p.z });
        break;
      }
      case 'heal':
        out.push({ k: 'heal', n: f.n });
        break;
      case 'buff':
        out.push({ k: 'event', title: `${BUFFS[f.id]?.icon ?? ''} ${BUFFS[f.id]?.name ?? ''}`.trim() });
        break;
      case 'dead':
        out.push({ k: 'death' });
        break;
      case 'sweep':
        out.push({ k: 'sweep', wave: f.n, xp: f.xp });
        break;
      case 'rage':
        out.push({ k: 'rage', n: f.n, level: f.level });
        break;
    }
  }

  private bossNameFor(n: number): string {
    return BOSS_NAMES[Math.max(0, (Math.floor(n / 10) - 1) % 4)] ?? BOSS_NAME;
  }

  view(): DgView {
    if (this.cached) return this.cached;
    const sim = this.sim;
    const t = sim.t;
    const h = sim.hero;
    const w = sim.wave;
    const bossName = this.bossName();
    // враги и босс
    const enemies: VEnemy[] = [];
    const bosses: VBoss[] = [];
    for (const m of sim.mobs) {
      if (m.k === 'povidl') {
        const s = this.bossTrack.get(m.id);
        const anim = bossAnim(m);
        bosses.push({
          id: m.id, x: m.x, z: m.z, yaw: Math.atan2(m.dx, m.dz), hp: Math.max(0, m.hp), hpMax: m.hpMax,
          anim, animAt: s && s.anim === anim ? s.at : t, phase: this.bossOf(m.id)?.phase ?? 1, name: bossName, scale: s?.scale ?? 1,
          rage: this.bossOf(m.id)?.rage === 1,
        });
        continue;
      }
      if (m.die) continue;
      const act = mobAct(m, sim);
      enemies.push({
        id: m.id, kind: m.k as MobKind, x: m.x, z: m.z, yaw: Math.atan2(m.dx, m.dz), hp: m.hp, hpMax: m.hpMax,
        act, actAt: act === ACT_ATTACK ? t - (m.id % 9) : m.stT, elite: m.elite === 1,
        rage: m.rage > 0 && t - this.rageAt < 12 ? m.rage + 0.9 * (1 - (t - this.rageAt) / 12) : m.rage,
      });
    }
    // снаряды: угольки, кирки, шашки, падающие сталактиты, плевки по дуге, светляки
    const projectiles: VProj[] = [];
    for (const s of sim.shots) {
      if (s.k === 'ember') projectiles.push({ id: s.id, kind: 'ember', x: s.x, z: s.z, y: 1, yaw: Math.atan2(s.vx, s.vz) });
      else projectiles.push({ id: s.id, kind: 'pick', x: s.x, z: s.z, y: 0.9, yaw: (t - s.t0) * 0.9 });
    }
    for (const tr of sim.traps) projectiles.push({ id: tr.id, kind: 'charge', x: tr.x, z: tr.z, y: 0.12, yaw: tr.id * 1.3 });
    const teles: VTele[] = [];
    for (const mk of sim.marks) {
      const k01 = mk.t1 > mk.t0 ? Math.min(1, Math.max(0, (t - mk.t0) / (mk.t1 - mk.t0))) : 1;
      if (mk.own) {
        teles.push({ id: mk.id, shape: 'circle', x: mk.x, z: mk.z, r: mk.r, w: 0, yaw: 0, t01: k01, tone: 'amber' });
        projectiles.push({ id: mk.id, kind: 'rock', x: mk.x, z: mk.z, y: 0.5 + 11 * (1 - k01) * (1 - k01), yaw: mk.id });
        continue;
      }
      if (mk.dmg <= 0 && mk.what === 'hole') continue;
      const spit = mk.what === 'spit' || mk.what === 'bspit';
      const tone: VTele['tone'] = spit || mk.what === 'heal' ? 'jam' : 'red';
      if (mk.k === 'lane') teles.push({ id: mk.id, shape: 'strip', x: mk.x, z: mk.z, r: mk.len, w: mk.w, yaw: Math.atan2(mk.dx, mk.dz), t01: k01, tone });
      else if (mk.k === 'sector') teles.push({ id: mk.id, shape: 'sector', x: mk.x, z: mk.z, r: mk.r, w: (Math.min(360, mk.w) * Math.PI) / 180, yaw: Math.atan2(mk.dx, mk.dz), t01: k01, tone });
      else teles.push({ id: mk.id, shape: 'circle', x: mk.x, z: mk.z, r: mk.r, w: 0, yaw: 0, t01: k01, tone });
      if (spit && mk.src >= 0) {
        // плевок летит дугой от плевуна в центр метки
        const dx = wrap(mk.x - mk.fx);
        const dz = wrap(mk.z - mk.fz);
        projectiles.push({ id: mk.id, kind: 'spit', x: mk.fx + dx * k01, z: mk.fz + dz * k01, y: 0.9 + 4 * k01 * (1 - k01) * (mk.what === 'bspit' ? 4 : 2.5), yaw: 0 });
      }
    }
    const P = { x: 0, z: 0 };
    let rays: DgView['rays'] = [];
    for (const wp of sim.weapons) {
      if (wp.id === 'fireflies') {
        const n = orbCount(sim, wp);
        for (let i = 0; i < n; i++) {
          orbPos(sim, wp, i, 0, P);
          projectiles.push({ id: 900000 + i, kind: 'firefly', x: P.x, z: P.z, y: 1.1, yaw: 0 });
        }
      } else if (wp.id === 'beam' && wp.evo) {
        const s = wstats(wp);
        const nb = (s.beams as number | undefined) ?? 2;
        rays = [];
        for (let b = 0; b < nb; b++) {
          beamDir(sim, wp, b, 0, P);
          rays.push({ yaw: Math.atan2(P.x, P.z), len: (s.length as number | undefined) ?? 14, w: (s.width as number | undefined) ?? 1.2 });
        }
      }
    }
    const puddles: VPuddle[] = sim.puddles.map((p) => ({
      id: p.id, kind: p.k === 'spore' ? 'spore' : 'jam', x: p.x, z: p.z, r: p.r, life: p.t1 > p.t0 ? Math.max(0, (p.t1 - t) / (p.t1 - p.t0)) : 1,
    }));
    const pickups: VPickup[] = [];
    for (const g of sim.gems) pickups.push({ id: g.id, kind: g.v >= 25 ? 'gem25' : g.v >= 5 ? 'gem5' : 'gem1', x: g.x, z: g.z });
    for (const it of sim.items) pickups.push({ id: it.id, kind: it.k === 'bigchest' ? 'chest' : it.k, x: it.x, z: it.z, src: it.k === 'chest' ? it.src : undefined });
    // постройки
    const buildings: VBuilding[] = [];
    for (const p of sim.props) {
      const kind = PROP_KIND[p.k];
      let s = 1;
      let on = false;
      let skip = false;
      const cool = p.t1 > p.t0 ? Math.min(1, Math.max(0, (t - p.t0) / (p.t1 - p.t0))) : 0;
      switch (p.k) {
        case 'altar':
          s = p.st === 0 ? 1 : p.st === 2 ? cool * 0.9 : 0;
          break;
        case 'brazier':
          if (p.st === 3) skip = true;
          s = p.st === 0 ? 1 : 0;
          break;
        case 'chest':
          // 2 — открыт/рассыпался до t1: крышка откинута, без свечения (s 0)
          if (p.st === 3) skip = true;
          s = p.st === 2 ? 0 : 1;
          on = p.st !== 2;
          break;
        case 'spring':
          s = p.v;
          break;
        case 'lamp':
          on = p.st === 1;
          s = on ? 1 : p.vx;
          break;
        case 'cart':
          on = p.st === 1;
          break;
        case 'keg':
          if (p.st === 3) skip = true;
          on = p.st === 1;
          break;
        case 'tramp':
          s = p.st === 2 ? 0 : 1;
          break;
        case 'forge':
          s = p.st === 3 ? 0 : 1;
          break;
      }
      if (skip) continue;
      const use = h.useId === p.id && h.useT1 > h.useT0 ? Math.min(1, Math.max(0, (t - h.useT0) / (h.useT1 - h.useT0))) : -1;
      buildings.push({ id: p.id, kind, x: p.x, z: p.z, yaw: p.k === 'cart' ? Math.PI / 2 : ((p.id * 2.399) % 6.283), s, use, on });
    }
    // интерфейс
    const buffs: HudBuff[] = h.buffs.map((b) => {
      const left = Math.max(0, (b.t1 - t) * DT);
      const tot = Math.max(left, this.buffTotal.get(b.id) ?? 0);
      this.buffTotal.set(b.id, tot);
      return { id: b.id, icon: BUFFS[b.id]?.icon ?? '•', name: BUFFS[b.id]?.name ?? b.id, left, total: tot };
    });
    for (const id of [...this.buffTotal.keys()]) if (!h.buffs.some((b) => b.id === id)) this.buffTotal.delete(id);
    const ch = sim.choice;
    const forge = ch?.why === 'forge';
    const jumping = h.jumpT1 > t && h.jumpT1 > h.jumpT0;
    const jk = jumping ? (t - h.jumpT0) / (h.jumpT1 - h.jumpT0) : 0;
    const stage = w.stage;
    const pre = stage === 'breather' || stage === 'intro';
    const v: DgView = {
      tick: t,
      stage,
      wave: w.n,
      timeLeft: w.t1 > 0 ? Math.max(0, (w.t1 - t) * DT) : -1,
      squadLeft: w.left,
      squadTotal: w.total,
      hero: {
        x: h.x, z: h.z, y: jumping ? 4 * jk * (1 - jk) * JUMP_H : 0, yaw: Math.atan2(h.dx, h.dz), speed: Math.hypot(h.vx, h.vz), hp: Math.max(0, h.hp), hpMax: h.hpMax,
        dashing: h.dashT > 0, invuln: h.invT > t && h.dashT === 0, qCharge: h.qHold > 0 ? Math.min(1, h.qHold / Math.max(1, h.qFull)) : -1, dead: h.dead !== 0,
      },
      enemies,
      projectiles,
      teles,
      puddles,
      pickups,
      buildings,
      bosses,
      rays,
      fx: this.fx,
      level: h.level,
      xp01: h.xpNext > 0 ? Math.min(1, h.xp / h.xpNext) : 0,
      kills: sim.stats.kills,
      buffs,
      weapons: sim.weapons.map((x) => this.weaponHud(x)),
      passives: sim.passives.map((x) => ({ id: x.id, icon: PASSIVES[x.id]?.icon ?? '•', name: PASSIVES[x.id]?.name ?? x.id, lv: x.lv, max: PASSIVES[x.id]?.max ?? 5 })),
      dash01: h.dashCdMax > 0 ? 1 - h.dashCd / h.dashCdMax : 1,
      q01: h.qCdMax > 0 ? 1 - h.qCd / h.qCdMax : 1,
      dashLeft: Math.max(0, h.dashCd) * DT,
      qLeft: Math.max(0, h.qCd) * DT,
      cards: ch ? {
        cards: ch.cards.map((c) => cardView(sim, c)), index: Math.max(1, ch.n), total: Math.max(1, ch.n + ch.left), rerolls: forge ? 0 : sim.rerolls, banishes: forge ? 0 : sim.banishes,
        title: forge ? 'Кузня: +1 уровень оружию' : undefined,
        slots: { w: sim.weapons.length, wMax: DG_DATA.hero.slots.weapons, p: sim.passives.length, pMax: DG_DATA.hero.slots.passives },
      } : null,
      chest: chestView(sim),
      breather: pre ? breatherOf(w.n, w.t1 > 0 ? Math.max(0, (w.t1 - t) * DT) : 0, this.bossNameFor(w.n)) : null,
      alarm: w.horde === 1 && stage === 'wave',
      old: w.old ?? 0,
      swept: w.swept === 1,
      wavesDone: sim.stats.waves,
      killedBy: killerName(sim.stats.killedBy, bossName),
      chests: sim.stats.chests,
    };
    this.cached = v;
    return v;
  }
}

/** Подзаголовок баннера волны: главное событие волны */
function waveSub(n: number): string {
  const def = DG_DATA.waves.find((x) => x.w === n);
  const e = def?.events.find((x) => x.type === 'elite') ?? def?.events[0];
  return e?.text ?? '';
}

/** Карточка следующей волны в передышке */
function breatherOf(n: number, left: number, bossName: string): NonNullable<DgView['breather']> {
  const def = DG_DATA.waves.find((x) => x.w === n);
  const kinds = new Set<string>();
  if (def) {
    for (const k of Object.keys(def.mobs)) kinds.add(k);
    for (const k of Object.keys(def.elites ?? {})) kinds.add(k);
  }
  const mobs = [...kinds].filter((k) => k in MOBS).map((k) => ({ id: k, ...MOBS[k as MobKind] }));
  const boss = n % 10 === 0;
  const ev = def?.events.filter((e) => e.type !== 'pack').map((e) => e.text) ?? [];
  return { left, next: n, mobs, event: boss ? `Босс — ${bossName}` : ev.slice(0, 2).join(' · ') };
}

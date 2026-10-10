// «Подземелье»: настоящая симуляция (shared/dungeon/sim.ts) для сцены. Шаги, события журнала, хеш и итог — как у
// сервера; здесь только перевод DgSim в DgView (что рисовать) раз в шаг: состояния врагов → клипы, метки → тревоги на
// полу, постройки → вид и свечение, fx шага → эффекты и звук, выбор и сундук → экраны интерфейса.
import type { DgEvent, DgResult } from '../../shared/dungeon/api.ts';
import { DG_HZ } from '../../shared/dungeon/api.ts';
import {
  applyEvent, beamDir, createRun, dgHash, dgResult, DG_DATA, orbCount, orbPos, step, wstats,
  type DgCard, type DgFx, type DgMob, type DgProp, type DgSim,
} from '../../shared/dungeon/sim.ts';
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

function cardView(sim: DgSim, c: DgCard): HudCard {
  if (c.k === 'stew' || c.k === 'temper') {
    const m = MISC[c.k];
    return { icon: m.icon, name: m.name, from: 0, to: 0, text: m.text, kind: 'misc' };
  }
  if (c.k === 'w') {
    const info = WEAPONS[c.id];
    const def = DG_DATA.weapons.find((w) => w.id === c.id);
    const up = c.lv > 1 ? def?.levels[c.lv - 1]?.up : undefined;
    return { icon: info?.icon ?? '•', name: info?.name ?? c.id, from: c.lv - 1, to: c.lv, text: up ?? info?.text ?? '', kind: 'weapon' };
  }
  const info = PASSIVES[c.id];
  void sim;
  return { icon: info?.icon ?? '•', name: info?.name ?? c.id, from: c.lv - 1, to: c.lv, text: info?.text ?? '', kind: 'passive' };
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
      items.push({ icon: info?.icon ?? '★', name: info?.name ?? r.id, from: 0, to: 0, evo: true });
    } else {
      const info = r.k === 'w' ? WEAPONS[r.id] : PASSIVES[r.id];
      items.push({ icon: info?.icon ?? '•', name: info?.name ?? r.id, from: r.lv - 1, to: r.lv });
    }
  }
  return { items, big: ch.kind === 'big', fallback: items.length ? undefined : fallback ?? '+50 опыта и +30 HP' };
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
  private bossSt = '';
  private bossAt = 0;
  private bossAnimNow: VBoss['anim'] = 'under';
  private bossSeen = false;
  private readonly buffTotal = new Map<string, number>();

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
    this.trackBoss();
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

  /** Босс: смена состояния → крик, нырок, вынырок */
  private trackBoss(): void {
    const b = this.sim.bosses[0];
    const m = b ? this.mob(b.id) : undefined;
    if (!m) {
      this.bossSt = '';
      this.bossSeen = false;
      return;
    }
    const anim = bossAnim(m);
    if (anim !== this.bossAnimNow) {
      this.bossAnimNow = anim;
      this.bossAt = this.sim.t;
    }
    if (m.st !== this.bossSt) {
      const was = this.bossSt;
      this.bossSt = m.st;
      const at = { x: m.x, z: m.z };
      if (!this.bossSeen) {
        this.bossSeen = true;
        this.fx.push({ k: 'boss', what: 'spawn', ...at });
      }
      if (m.st === 'dive') this.fx.push({ k: 'boss', what: 'burrow', ...at });
      else if (m.st === 'stuck' || (was === 'rise' && !m.under)) this.fx.push({ k: 'boss', what: 'emerge', ...at });
      else if (m.st === 'roar') this.fx.push({ k: 'boss', what: 'roar', ...at });
      else if (m.st === 'tail') this.fx.push({ k: 'boss', what: 'slam', ...at });
    }
  }

  private onFx(f: DgFx): void {
    const out = this.fx;
    const sim = this.sim;
    switch (f.k) {
      case 'hit': {
        const m = this.mob(f.id);
        out.push({ k: 'hit', id: m?.k === 'povidl' ? -1 : f.id, x: f.x, z: f.z, dmg: f.n, big: f.big === 1 });
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
    let boss: VBoss | null = null;
    for (const m of sim.mobs) {
      if (m.k === 'povidl') {
        if (!boss) {
          boss = {
            x: m.x, z: m.z, yaw: Math.atan2(m.dx, m.dz), hp: Math.max(0, m.hp), hpMax: m.hpMax,
            anim: bossAnim(m), animAt: this.bossAnimNow === bossAnim(m) ? this.bossAt : t, phase: sim.bosses[0]?.phase ?? 1, name: bossName,
          };
        }
        continue;
      }
      if (m.die) continue;
      const act = mobAct(m, sim);
      enemies.push({
        id: m.id, kind: m.k as MobKind, x: m.x, z: m.z, yaw: Math.atan2(m.dx, m.dz), hp: m.hp, hpMax: m.hpMax,
        act, actAt: act === ACT_ATTACK ? t - (m.id % 9) : m.stT, elite: m.elite === 1,
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
    for (const it of sim.items) pickups.push({ id: it.id, kind: it.k === 'bigchest' ? 'chest' : it.k, x: it.x, z: it.z });
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
          if (p.st === 3) skip = true;
          on = true;
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
      boss,
      rays,
      fx: this.fx,
      level: h.level,
      xp01: h.xpNext > 0 ? Math.min(1, h.xp / h.xpNext) : 0,
      kills: sim.stats.kills,
      buffs,
      weapons: sim.weapons.map((x) => weaponItem(x.id, x.lv, x.evo === 1)),
      passives: sim.passives.map((x) => ({ id: x.id, icon: PASSIVES[x.id]?.icon ?? '•', name: PASSIVES[x.id]?.name ?? x.id, lv: x.lv, max: PASSIVES[x.id]?.max ?? 5 })),
      dash01: h.dashCdMax > 0 ? 1 - h.dashCd / h.dashCdMax : 1,
      q01: h.qCdMax > 0 ? 1 - h.qCd / h.qCdMax : 1,
      cards: ch ? { cards: ch.cards.map((c) => cardView(sim, c)), index: Math.max(1, ch.n), total: Math.max(1, ch.n + ch.left), rerolls: forge ? 0 : sim.rerolls, banishes: forge ? 0 : sim.banishes } : null,
      chest: chestView(sim),
      breather: pre ? breatherOf(w.n, w.t1 > 0 ? Math.max(0, (w.t1 - t) * DT) : 0, this.bossNameFor(w.n)) : null,
      alarm: w.horde === 1 && stage === 'wave',
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
  const mobs = [...kinds].filter((k) => k in MOBS).map((k) => MOBS[k as MobKind]);
  const boss = n % 10 === 0;
  const ev = def?.events.filter((e) => e.type !== 'pack').map((e) => e.text) ?? [];
  return { left, next: n, mobs, event: boss ? `Босс — ${bossName}` : ev.slice(0, 2).join(' · ') };
}

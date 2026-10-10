// «Подземелье»: заглушка симуляции для стенда, пока нет shared/dungeon/sim.ts (и для снимков сцены). Это НЕ игра и не
// баланс: враги бегут на героя, оружие бьёт само, опыт копится, уровни открывают карточки, волны идут по таймеру,
// на 10-й — босс. Выдаёт тот же DgView и принимает те же DgEvent, что настоящая симуляция через simview.ts.
import type { DgEvent, DgResult } from '../../shared/dungeon/api.ts';
import { DG_MAP } from '../../shared/dungeon/api.ts';
import type { HudCard, HudItem } from './hudtypes.ts';
import { MISC, MOBS, PASSIVES, WEAPONS } from './data.ts';
import type { RunSource } from './source.ts';
import { ACT_ATTACK, ACT_SPECIAL, ACT_WALK, type DgView, type MobKind, type VBoss, type VBuilding, type VEnemy, type VFx, type VPickup, type VProj, type VPuddle, type VTele } from './view.ts';
import level from '../assets/dungeon/level-data.json';

const L = DG_MAP;
const DT = 1 / 30;
const wrap = (d: number): number => d - L * Math.round(d / L);
const mod = (p: number): number => ((p % L) + L) % L;

interface MEnemy extends VEnemy {
  speed: number;
  dmg: number;
  hitCd: number;
  spitCd: number;
}

interface Card { kind: 'weapon' | 'passive' | 'misc'; id: string }

const SPEED: Record<MobKind, number> = { rat: 4.4, bat: 4.6, slime: 2, slimelet: 3, shroom: 2.2, beetle: 2.8, spitter: 2.6, larva: 5, barrel: 2.4, shaman: 2 };
const HP: Record<MobKind, number> = { rat: 10, bat: 8, slime: 38, slimelet: 10, shroom: 85, beetle: 60, spitter: 34, larva: 24, barrel: 600, shaman: 450 };
const WAVE_MOBS: MobKind[][] = [
  ['rat', 'rat', 'rat', 'slime'],
  ['rat', 'rat', 'bat', 'slime'],
  ['rat', 'rat', 'spitter', 'slime', 'bat'],
  ['rat', 'spitter', 'shroom', 'slime'],
  ['rat', 'rat', 'shroom', 'beetle', 'spitter', 'bat'],
  ['rat', 'rat', 'shroom', 'beetle', 'spitter', 'slime'],
  ['rat', 'rat', 'shroom', 'beetle', 'spitter', 'bat'],
  ['rat', 'rat', 'shroom', 'beetle', 'spitter', 'slime'],
  ['rat', 'rat', 'rat', 'shroom', 'beetle', 'spitter', 'bat'],
  ['rat', 'larva'],
];
const WAVE_DUR = [45, 50, 50, 55, 55, 60, 60, 65, 65, 999];

export class MockRun implements RunSource {
  tick = 0;
  private stage: DgView['stage'] = 'intro';
  private wave = 1;
  private stageT = 3;
  private hero = { x: 120, z: 124, yaw: Math.PI, vx: 0, vz: 0, hp: 100, hpMax: 100, dashT: 0, dashCd: 0, invT: 0, q: -1, qCd: 0, dead: false, mvx: 0, mvz: 0 };
  private enemies: MEnemy[] = [];
  private projs: (VProj & { vx: number; vz: number; life: number; dmg: number; vy?: number; target?: number })[] = [];
  private teles: (VTele & { dur: number; then: 'spit' | 'slam' | 'rock' })[] = [];
  private puddles: (VPuddle & { max: number; t: number })[] = [];
  private pickups: (VPickup & { pull: boolean })[] = [];
  private buildings: VBuilding[] = [];
  private boss: (VBoss & { t: number; tx: number; tz: number }) | null = null;
  private fx: VFx[] = [];
  private nextId = 1;
  private lv = 1;
  private xp = 0;
  private kills = 0;
  private wavesDone = 0;
  private weapons: { id: string; lv: number; cd: number }[] = [{ id: 'lantern', lv: 1, cd: 0.5 }];
  private passives: { id: string; lv: number }[] = [];
  private pendingCards = 0;
  private cardsTotal = 0;
  private cards: Card[] | null = null;
  private rerolls = 3;
  private banishes = 2;
  private banned = new Set<string>();
  private chest: DgView['chest'] = null;
  private spawnAcc = 0;
  private squadTotal = 0;
  private squadLeft = 0;
  private killedBy = '';
  private chests = 0;
  private fireAngle = 0;
  private useHold = 0;
  private dmgBy: Record<string, number> = {};
  private ms = 0;
  private alarm = false;
  private god = false;

  constructor(seed: number) {
    for (const a of level.buildings.altar.slice(0, 4)) this.buildings.push({ id: this.nextId++, kind: 'altar', x: a.x, z: a.z, yaw: 0, s: 1, use: -1, on: true });
    for (const a of level.buildings.spring) this.buildings.push({ id: this.nextId++, kind: 'spring', x: a.x, z: a.z, yaw: 0, s: 1, use: -1, on: true });
    for (const a of level.buildings.cursedChest.slice(0, 2)) this.buildings.push({ id: this.nextId++, kind: 'chest', x: a.x, z: a.z, yaw: 0, s: 1, use: -1, on: true });
    for (const a of level.buildings.brazier) this.buildings.push({ id: this.nextId++, kind: 'brazier', x: a.x, z: a.z, yaw: 0, s: 1, use: -1, on: true });
    for (const a of level.proposals.lantern) this.buildings.push({ id: this.nextId++, kind: 'lamppost', x: a.x, z: a.z, yaw: 0, s: 0, use: -1, on: false });
    for (const a of level.proposals.powderKegs) for (let i = 0; i < 4; i++) this.buildings.push({ id: this.nextId++, kind: 'keg', x: a.x + (i % 2) * 1.1, z: a.z + Math.floor(i / 2) * 1.1, yaw: i, s: 1, use: -1, on: false });
    for (const a of level.proposals.mushroomTrampoline) this.buildings.push({ id: this.nextId++, kind: 'trampoline', x: a.x, z: a.z, yaw: 0, s: 1, use: -1, on: true });
    for (const a of level.proposals.forge) this.buildings.push({ id: this.nextId++, kind: 'forge', x: a.x, z: a.z, yaw: 0, s: 1, use: -1, on: true });
    this.buildings.push({ id: this.nextId++, kind: 'minecart', x: 168, z: 204, yaw: Math.PI / 2, s: 1, use: -1, on: false });
    this.buildings.push({ id: this.nextId++, kind: 'minecart', x: 48, z: 204, yaw: Math.PI / 2, s: 1, use: -1, on: false });
    void seed;
  }

  get frozen(): boolean {
    return this.cards !== null || this.chest !== null;
  }

  apply(ev: DgEvent): void {
    const h = this.hero;
    switch (ev.k) {
      case 'mv': h.mvx = ev.x / 100; h.mvz = ev.y / 100; break;
      case 'dash':
        if (h.dashCd <= 0 && !h.dead && !this.frozen) {
          const len = Math.hypot(h.mvx, h.mvz) || 1;
          const dx = h.mvx ? h.mvx / len : Math.sin(h.yaw);
          const dz = h.mvz ? h.mvz / len : Math.cos(h.yaw);
          h.dashT = 0.2; h.dashCd = 3; h.invT = 0.3;
          h.vx = dx * 30; h.vz = dz * 30;
          this.fx.push({ k: 'dash', x: h.x, z: h.z, tx: mod(h.x + dx * 6), tz: mod(h.z + dz * 6) });
        }
        break;
      case 'q':
        if (ev.on && h.qCd <= 0 && h.q < 0) h.q = 0;
        if (!ev.on && h.q >= 0) {
          const full = h.q >= 1;
          const r = full ? 5 : 2.5;
          this.fx.push({ k: 'q', x: h.x, z: h.z, r, full });
          for (const e of this.enemies) {
            const dx = wrap(e.x - h.x); const dz = wrap(e.z - h.z);
            const d = Math.hypot(dx, dz);
            if (d < r + 0.4) {
              this.damage(e, full ? 80 : 20, true, 'q');
              if (full && d > 0.01) { e.x = mod(e.x + (dx / d) * 3); e.z = mod(e.z + (dz / d) * 3); }
            }
          }
          if (this.boss && this.boss.anim !== 'under') {
            const d = Math.hypot(wrap(this.boss.x - h.x), wrap(this.boss.z - h.z));
            if (d < r + 2) this.hitBoss(full ? 80 : 20, true);
          }
          h.q = -1; h.qCd = 9;
        }
        break;
      case 'use': this.useHold = 1; break;
      case 'pick': if (this.cards && this.cards[ev.i]) this.take(this.cards[ev.i]); break;
      case 'reroll': if (this.cards && this.rerolls > 0) { this.rerolls--; this.cards = this.rollCards(); } break;
      case 'ban':
        if (this.cards && this.banishes > 0 && this.cards[ev.i]) {
          this.banishes--;
          this.banned.add(this.cards[ev.i].id);
          this.cards = this.rollCards();
        }
        break;
      case 'go':
        if (this.chest) { this.chest = null; break; }
        if (this.stage === 'breather') this.stageT = 0;
        break;
    }
  }

  // ---------------------------------------------------------------- шаг

  step(): void {
    this.fx.length = 0;
    this.tick++;
    if (this.frozen || this.stage === 'over') return;
    const h = this.hero;
    this.ms += DT * 1000;
    // стадии
    this.stageT -= DT;
    if (this.stage === 'intro' && this.stageT <= 0) this.startWave();
    else if (this.stage === 'wave' && (this.stageT <= 0 || (this.squadLeft <= 0 && this.enemies.length === 0))) this.endWave();
    else if (this.stage === 'breather' && this.stageT <= 0) this.startWave();
    // герой
    if (!h.dead) {
      if (h.dashT > 0) {
        h.dashT -= DT;
        h.x = mod(h.x + h.vx * DT);
        h.z = mod(h.z + h.vz * DT);
      } else {
        const len = Math.hypot(h.mvx, h.mvz);
        const sp = 6 * (h.q >= 0 ? 0.5 : 1) * (this.inJam(h.x, h.z) ? 0.65 : 1);
        const k = len > 1 ? 1 / len : 1;
        h.vx = h.mvx * k * sp;
        h.vz = h.mvz * k * sp;
        h.x = mod(h.x + h.vx * DT);
        h.z = mod(h.z + h.vz * DT);
        if (len > 0.1) h.yaw = Math.atan2(h.mvx, h.mvz);
      }
      h.dashCd = Math.max(0, h.dashCd - DT);
      h.qCd = Math.max(0, h.qCd - DT);
      h.invT = Math.max(0, h.invT - DT);
      if (h.q >= 0) h.q = Math.min(1, h.q + DT);
    }
    this.spawn();
    this.moveEnemies();
    this.fireWeapons();
    this.moveProjectiles();
    this.updateTeles();
    this.updateBoss();
    this.updatePickups();
    this.updateBuildings();
    for (let i = this.puddles.length - 1; i >= 0; i--) {
      const p = this.puddles[i];
      p.t -= DT;
      p.life = Math.max(0, p.t / p.max);
      if (p.t <= 0) this.puddles.splice(i, 1);
    }
  }

  private startWave(): void {
    this.stage = this.wave === 10 ? 'boss' : 'wave';
    this.stageT = WAVE_DUR[Math.min(9, this.wave - 1)];
    this.squadTotal = this.wave === 10 ? 40 : 90 + this.wave * 25;
    this.squadLeft = this.squadTotal;
    this.fx.push({ k: 'wave', wave: this.wave, title: this.wave === 10 ? 'Старый Повидл' : `Волна ${this.wave}`, sub: this.wave === 10 ? 'Босс' : '' });
    if (this.wave === 4 || this.wave === 7 || this.wave === 9) this.spawnElite(this.wave === 7 ? 'shaman' : 'barrel');
    if (this.wave === 10) this.spawnBoss();
    this.alarm = this.wave === 9;
  }

  private endWave(): void {
    this.wavesDone = this.wave;
    this.fx.push({ k: 'waveWin', wave: this.wave });
    for (const e of this.enemies) this.fx.push({ k: 'spawnFx', x: e.x, z: e.z });
    this.enemies.length = 0;
    for (const p of this.pickups) p.pull = true;
    this.wave++;
    this.stage = 'breather';
    this.stageT = 5;
    this.alarm = false;
  }

  /** Отладка стенда: сразу на волну n */
  skipTo(n: number): void {
    this.enemies.length = 0;
    this.wave = n;
    this.wavesDone = n - 1;
    this.startWave();
  }

  private spawn(): void {
    if (this.stage !== 'wave' && this.stage !== 'boss') return;
    const want = this.god ? 300 : this.stage === 'boss' ? 30 : Math.min(300, 60 + this.wave * 26);
    this.spawnAcc += DT * (this.stage === 'boss' ? 2 : 6 + this.wave * 1.6);
    while (this.spawnAcc >= 1 && this.enemies.length < want && this.squadLeft > 0) {
      this.spawnAcc -= 1;
      const pool = WAVE_MOBS[Math.min(9, this.wave - 1)];
      const kind = pool[Math.floor(Math.random() * pool.length)];
      const a = Math.random() * Math.PI * 2;
      const r = 18 + Math.random() * 10;
      this.addEnemy(kind, mod(this.hero.x + Math.sin(a) * r), mod(this.hero.z + Math.cos(a) * r * 0.75), false);
      if (this.stage !== 'boss') this.squadLeft--;
    }
  }

  private addEnemy(kind: MobKind, x: number, z: number, elite: boolean): MEnemy {
    const hpMul = 1 + (this.wave - 1) * 0.15;
    const e: MEnemy = { id: this.nextId++, kind, x, z, yaw: 0, hp: HP[kind] * hpMul, hpMax: HP[kind] * hpMul, act: ACT_WALK, actAt: this.tick, elite, speed: SPEED[kind] * (0.9 + Math.random() * 0.2), dmg: elite ? 25 : 6, hitCd: 0, spitCd: 2 + Math.random() * 2 };
    this.enemies.push(e);
    return e;
  }

  private spawnElite(kind: MobKind): void {
    const a = Math.random() * Math.PI * 2;
    const e = this.addEnemy(kind, mod(this.hero.x + Math.sin(a) * 20), mod(this.hero.z + Math.cos(a) * 16), true);
    this.fx.push({ k: 'elite', kind, name: MOBS[kind].name, x: e.x, z: e.z });
  }

  private spawnBoss(): void {
    this.boss = { x: mod(this.hero.x + 2), z: mod(this.hero.z - 4), yaw: 0, hp: 30000, hpMax: 30000, anim: 'emerge', animAt: this.tick, phase: 1, name: 'Старый Повидл', id: 1, scale: 1, rage: false, t: 0, tx: 0, tz: 0 };
    this.fx.push({ k: 'boss', what: 'spawn', x: this.boss.x, z: this.boss.z });
    this.fx.push({ k: 'boss', what: 'emerge', x: this.boss.x, z: this.boss.z });
  }

  private moveEnemies(): void {
    const h = this.hero;
    const E = this.enemies;
    // грубая толкотня: сетка 2 м
    const grid = new Map<number, MEnemy[]>();
    for (const e of E) {
      const k = Math.floor(e.x / 2) + Math.floor(e.z / 2) * 120;
      let c = grid.get(k);
      if (!c) grid.set(k, (c = []));
      c.push(e);
    }
    for (const e of E) {
      const dx = wrap(h.x - e.x);
      const dz = wrap(h.z - e.z);
      const d = Math.hypot(dx, dz) || 1;
      let sx = 0;
      let sz = 0;
      const cx = Math.floor(e.x / 2);
      const cz = Math.floor(e.z / 2);
      for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
        const c = grid.get(((cx + ox + 120) % 120) + ((cz + oz + 120) % 120) * 120);
        if (!c) continue;
        for (const o of c) {
          if (o === e) continue;
          const ax = wrap(e.x - o.x);
          const az = wrap(e.z - o.z);
          const dd = ax * ax + az * az;
          const rr = e.elite || o.elite ? 2.2 : 0.75;
          if (dd < rr * rr && dd > 1e-6) {
            const k = (rr - Math.sqrt(dd)) / rr;
            sx += ax * k * 6;
            sz += az * k * 6;
          }
        }
      }
      let sp = e.speed;
      if (e.kind === 'spitter' && d < 9) sp = d < 7 ? -e.speed * 0.6 : 0;
      if (e.act === ACT_SPECIAL && this.tick - e.actAt < 18) sp = 0;
      else if (e.act !== ACT_WALK && this.tick - e.actAt > 14) e.act = ACT_WALK;
      const vx = (dx / d) * sp + sx;
      const vz = (dz / d) * sp + sz;
      e.x = mod(e.x + vx * DT);
      e.z = mod(e.z + vz * DT);
      if (sp !== 0 || e.kind === 'spitter') e.yaw = Math.atan2(dx, dz);
      e.hitCd = Math.max(0, e.hitCd - DT);
      if (d < (e.elite ? 1.6 : 0.8) && e.hitCd <= 0 && !h.dead) {
        e.hitCd = 1;
        e.act = ACT_ATTACK;
        e.actAt = this.tick;
        this.hurt(e.dmg, MOBS[e.kind].name);
      }
      if (e.kind === 'spitter') {
        e.spitCd -= DT;
        if (e.spitCd <= 0 && d < 13) {
          e.spitCd = 3.5;
          e.act = ACT_SPECIAL;
          e.actAt = this.tick;
          this.teles.push({ id: this.nextId++, shape: 'circle', x: mod(h.x + h.vx * 0.5), z: mod(h.z + h.vz * 0.5), r: 1.4, w: 0, yaw: 0, t01: 0, tone: 'jam', dur: 0.9, then: 'spit' });
          this.fx.push({ k: 'shot', w: 'ember' });
        }
      }
    }
  }

  private hurt(n: number, by: string): void {
    const h = this.hero;
    if (h.invT > 0 || h.dashT > 0 || h.dead || this.god) return;
    h.hp -= n;
    h.invT = 0.25;
    this.fx.push({ k: 'hurt', dmg: n });
    if (h.hp <= 0) {
      h.hp = 0;
      h.dead = true;
      this.killedBy = by;
      this.stage = 'over';
      this.fx.push({ k: 'death' });
    }
  }

  private nearest(maxD: number): MEnemy | null {
    let best: MEnemy | null = null;
    let bd = maxD * maxD;
    for (const e of this.enemies) {
      const dx = wrap(e.x - this.hero.x);
      const dz = wrap(e.z - this.hero.z);
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  private fireWeapons(): void {
    const h = this.hero;
    if (h.dead) return;
    for (const w of this.weapons) {
      w.cd -= DT;
      if (w.cd > 0) continue;
      const t = this.nearest(w.id === 'lantern' ? 7 : 14);
      if (w.id === 'fireflies') {
        w.cd = 0;
        this.fireAngle += DT * 3.2;
        if (this.tick % 8) continue;
        const n = 2 + Math.floor(w.lv / 2);
        for (let i = 0; i < n; i++) {
          const a = this.fireAngle + (i / n) * Math.PI * 2;
          const fx = mod(h.x + Math.sin(a) * 2.6);
          const fz = mod(h.z + Math.cos(a) * 2.6);
          for (const e of this.enemies) if (Math.hypot(wrap(e.x - fx), wrap(e.z - fz)) < 0.8) this.damage(e, 8 + w.lv * 1.5, false, 'fireflies');
        }
        continue;
      }
      if (!t && w.id !== 'pickaxe') continue;
      if (w.id === 'lantern') {
        w.cd = 1.1 - w.lv * 0.02;
        const yaw = Math.atan2(wrap(t!.x - h.x), wrap(t!.z - h.z));
        const range = 5 + (w.lv >= 3 ? 1 : 0) + (w.lv >= 7 ? 1 : 0);
        const angle = ((80 + (w.lv >= 3 ? 15 : 0) + (w.lv >= 6 ? 15 : 0)) * Math.PI) / 180;
        this.fx.push({ k: 'cone', x: h.x, z: h.z, yaw, angle, range, evo: false });
        for (const e of this.enemies) {
          const dx = wrap(e.x - h.x);
          const dz = wrap(e.z - h.z);
          const d = Math.hypot(dx, dz);
          let da = Math.atan2(dx, dz) - yaw;
          da = Math.atan2(Math.sin(da), Math.cos(da));
          if (d < range && Math.abs(da) < angle / 2) this.damage(e, 14 + w.lv * 3, false, 'lantern');
        }
      } else if (w.id === 'embers') {
        w.cd = 1;
        for (let i = 0; i < 2 + Math.floor(w.lv / 2); i++) {
          const a = Math.random() * Math.PI * 2;
          this.projs.push({ id: this.nextId++, kind: 'ember', x: h.x, z: h.z, y: 1, yaw: a, vx: Math.sin(a) * 9, vz: Math.cos(a) * 9, life: 2, dmg: 10 + w.lv * 1.5, target: t!.id });
        }
        this.fx.push({ k: 'shot', w: 'ember' });
      } else if (w.id === 'pickaxe') {
        w.cd = 2.2;
        const a = h.yaw;
        this.projs.push({ id: this.nextId++, kind: 'pick', x: h.x, z: h.z, y: 0.9, yaw: a, vx: Math.sin(a) * 14, vz: Math.cos(a) * 14, life: 1.1, dmg: 20 + w.lv * 3 });
        this.fx.push({ k: 'shot', w: 'pick' });
      } else if (w.id === 'spark') {
        w.cd = 1.5;
        const pts = [h.x, h.z];
        let cur: MEnemy | null = t;
        const used = new Set<number>();
        for (let j = 0; j < 3 + w.lv && cur; j++) {
          used.add(cur.id);
          pts.push(cur.x, cur.z);
          this.damage(cur, 15 + w.lv * 2, false, 'spark');
          let nb: MEnemy | null = null;
          let nd = 36;
          for (const e of this.enemies) {
            if (used.has(e.id)) continue;
            const d = wrap(e.x - cur.x) ** 2 + wrap(e.z - cur.z) ** 2;
            if (d < nd) { nd = d; nb = e; }
          }
          cur = nb;
        }
        this.fx.push({ k: 'chain', pts });
        this.fx.push({ k: 'shot', w: 'spark' });
      } else if (w.id === 'beam') {
        w.cd = 3;
        const yaw = Math.atan2(wrap(t!.x - h.x), wrap(t!.z - h.z));
        this.fx.push({ k: 'beam', x: h.x, z: h.z, yaw, len: 14, w: 1.2 });
        for (const e of this.enemies) {
          const dx = wrap(e.x - h.x);
          const dz = wrap(e.z - h.z);
          const along = dx * Math.sin(yaw) + dz * Math.cos(yaw);
          const side = Math.abs(dx * Math.cos(yaw) - dz * Math.sin(yaw));
          if (along > 0 && along < 14 && side < 0.8) this.damage(e, 26 + w.lv * 4, false, 'beam');
        }
      } else if (w.id === 'stalactites') {
        w.cd = 1.8;
        for (let i = 0; i < 1 + Math.floor(w.lv / 2); i++) {
          const e = this.enemies[Math.floor(Math.random() * this.enemies.length)];
          if (!e) break;
          this.teles.push({ id: this.nextId++, shape: 'circle', x: e.x, z: e.z, r: 1.8, w: 0, yaw: 0, t01: 0, tone: 'amber', dur: 0.35, then: 'rock' });
          this.projs.push({ id: this.nextId++, kind: 'rock', x: e.x, z: e.z, y: 9, yaw: Math.random() * 6, vx: 0, vz: 0, vy: -26, life: 0.35, dmg: 0 });
        }
      }
    }
  }

  private damage(e: MEnemy, n: number, big: boolean, by: string): void {
    if (e.hp <= 0) return;
    const blocked = e.kind === 'beetle' && !big && Math.random() < 0.3;
    const dmg = blocked ? n * 0.2 : n;
    e.hp -= dmg;
    this.dmgBy[by] = (this.dmgBy[by] ?? 0) + dmg;
    this.fx.push({ k: 'hit', id: e.id, x: e.x, z: e.z, dmg, big, blocked });
    if (e.hp <= 0) {
      this.kills++;
      this.fx.push({ k: 'kill', id: e.id, kind: e.kind, x: e.x, z: e.z, elite: e.elite });
      const i = this.enemies.indexOf(e);
      if (i >= 0) this.enemies.splice(i, 1);
      const gem = e.elite ? 'gem25' : e.kind === 'shroom' || e.kind === 'beetle' ? 'gem5' : 'gem1';
      this.pickups.push({ id: this.nextId++, kind: gem, x: e.x, z: e.z, pull: false });
      if (e.kind === 'slime') for (let k = 0; k < 2; k++) this.addEnemy('slimelet', mod(e.x + (k - 0.5)), e.z, false);
      if (e.kind === 'shroom') this.puddles.push({ id: this.nextId++, kind: 'spore', x: e.x, z: e.z, r: 2.5, life: 1, max: 3, t: 3 });
      if (e.elite) {
        this.chests++;
        this.chest = { items: [{ icon: '🏮', name: 'Фонарь', from: this.weapons[0].lv, to: Math.min(7, this.weapons[0].lv + 1) }], big: false };
        this.weapons[0].lv = Math.min(7, this.weapons[0].lv + 1);
      }
    }
  }

  private hitBoss(n: number, big: boolean): void {
    const b = this.boss;
    if (!b) return;
    b.hp -= n;
    this.dmgBy.q = (this.dmgBy.q ?? 0) + n;
    this.fx.push({ k: 'hit', id: -1, x: b.x, z: b.z, dmg: n, big });
    if (b.hp <= 0 && b.anim !== 'death') {
      b.anim = 'death';
      b.animAt = this.tick;
      this.fx.push({ k: 'boss', what: 'death', x: b.x, z: b.z });
    }
  }

  private moveProjectiles(): void {
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const p = this.projs[i];
      p.life -= DT;
      if (p.kind === 'ember' && p.target) {
        const t = this.enemies.find((e) => e.id === p.target);
        if (t) {
          const dx = wrap(t.x - p.x);
          const dz = wrap(t.z - p.z);
          const d = Math.hypot(dx, dz) || 1;
          p.vx += ((dx / d) * 14 - p.vx) * 0.12;
          p.vz += ((dz / d) * 14 - p.vz) * 0.12;
          if (d < 0.6) { this.damage(t, p.dmg, false, 'embers'); p.life = 0; }
        }
      }
      if (p.kind === 'pick') {
        // летит и возвращается
        const back = p.life < 0.55;
        if (back) {
          const dx = wrap(this.hero.x - p.x);
          const dz = wrap(this.hero.z - p.z);
          const d = Math.hypot(dx, dz) || 1;
          p.vx = (dx / d) * 14;
          p.vz = (dz / d) * 14;
        }
        for (const e of this.enemies) if (Math.hypot(wrap(e.x - p.x), wrap(e.z - p.z)) < 0.9 && e.hitCd < 0.5) { this.damage(e, p.dmg, false, 'pickaxe'); }
        p.yaw += DT * 18;
      } else if (p.kind !== 'rock') p.yaw = Math.atan2(p.vx, p.vz);
      if (p.kind === 'rock') {
        p.y += (p.vy ?? 0) * DT;
        if (p.y <= 0.2) p.life = 0;
      }
      p.x = mod(p.x + p.vx * DT);
      p.z = mod(p.z + p.vz * DT);
      if (p.life <= 0) this.projs.splice(i, 1);
    }
  }

  private updateTeles(): void {
    for (let i = this.teles.length - 1; i >= 0; i--) {
      const t = this.teles[i];
      t.t01 = Math.min(1, t.t01 + DT / t.dur);
      if (t.t01 < 1) continue;
      this.teles.splice(i, 1);
      if (t.then === 'spit') {
        this.puddles.push({ id: this.nextId++, kind: 'jam', x: t.x, z: t.z, r: 1.4, life: 1, max: 3, t: 3 });
        this.fx.push({ k: 'boom', x: t.x, z: t.z, r: 1.4, kind: 'spit' });
        if (Math.hypot(wrap(this.hero.x - t.x), wrap(this.hero.z - t.z)) < t.r) this.hurt(12, 'Плевун');
      } else if (t.then === 'rock') {
        this.fx.push({ k: 'boom', x: t.x, z: t.z, r: t.r, kind: 'rock' });
        for (const e of this.enemies) if (Math.hypot(wrap(e.x - t.x), wrap(e.z - t.z)) < t.r) this.damage(e, 22, false, 'stalactites');
      } else if (t.then === 'slam') {
        this.fx.push({ k: 'boom', x: t.x, z: t.z, r: t.r, kind: 'boss' });
        this.fx.push({ k: 'boss', what: 'slam', x: t.x, z: t.z });
        if (Math.hypot(wrap(this.hero.x - t.x), wrap(this.hero.z - t.z)) < t.r) this.hurt(30, 'Старый Повидл');
      }
    }
  }

  private updateBoss(): void {
    const b = this.boss;
    if (!b) return;
    b.t += DT;
    const h = this.hero;
    const since = (this.tick - b.animAt) * DT;
    if (b.anim === 'death') {
      if (since > 3.5) {
        this.boss = null;
        this.chest = { items: [{ icon: '🏮', name: 'Негасимый фонарь', from: 7, to: 7, evo: true }], big: true };
        this.chests++;
        this.endWave();
      }
      return;
    }
    const dx = wrap(h.x - b.x);
    const dz = wrap(h.z - b.z);
    b.yaw = Math.atan2(dx, dz);
    const go = (anim: VBoss['anim']): void => {
      b.anim = anim;
      b.animAt = this.tick;
    };
    if (b.anim === 'emerge' && since > 2) go('idle');
    else if (b.anim === 'idle' && since > 1.5) {
      const r = Math.random();
      if (r < 0.4) {
        go('slam');
        const d = Math.hypot(dx, dz) || 1;
        this.teles.push({ id: this.nextId++, shape: 'circle', x: mod(b.x + (dx / d) * 2), z: mod(b.z + (dz / d) * 2), r: 4.5, w: 0, yaw: 0, t01: 0, tone: 'red', dur: 0.92, then: 'slam' });
      } else if (r < 0.75) {
        go('spit');
        for (let k = 0; k < 3; k++) this.teles.push({ id: this.nextId++, shape: 'circle', x: mod(h.x + (Math.random() - 0.5) * 6), z: mod(h.z + (Math.random() - 0.5) * 6), r: 2, w: 0, yaw: 0, t01: 0, tone: 'jam', dur: 1, then: 'spit' });
        this.fx.push({ k: 'boss', what: 'spit', x: b.x, z: b.z });
      } else {
        go('burrow');
        this.fx.push({ k: 'boss', what: 'burrow', x: b.x, z: b.z });
      }
    } else if ((b.anim === 'slam' || b.anim === 'spit') && since > 2) go('idle');
    else if (b.anim === 'burrow' && since > 1.7) go('under');
    else if (b.anim === 'under') {
      const d = Math.hypot(dx, dz) || 1;
      b.x = mod(b.x + (dx / d) * 7 * DT);
      b.z = mod(b.z + (dz / d) * 7 * DT);
      if (since > 3 || d < 3) {
        go('emerge');
        this.fx.push({ k: 'boss', what: 'emerge', x: b.x, z: b.z });
        this.teles.push({ id: this.nextId++, shape: 'circle', x: b.x, z: b.z, r: 4.5, w: 0, yaw: 0, t01: 0.4, tone: 'red', dur: 0.7, then: 'slam' });
      }
    }
    // попадания по боссу от оружия — грубо, по времени
    if (b.anim !== 'under' && this.tick % 6 === 0 && Math.hypot(dx, dz) < 12) this.hitBoss(25 + this.lv * 4, false);
  }

  private updatePickups(): void {
    const h = this.hero;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      const dx = wrap(h.x - p.x);
      const dz = wrap(h.z - p.z);
      const d = Math.hypot(dx, dz);
      if (d < 2.5) p.pull = true;
      if (p.pull && d > 0.01) {
        const sp = Math.min(d / DT, 16);
        p.x = mod(p.x + (dx / d) * sp * DT);
        p.z = mod(p.z + (dz / d) * sp * DT);
      }
      if (d < 0.6) {
        this.pickups.splice(i, 1);
        this.fx.push({ k: 'pick', kind: p.kind, x: p.x, z: p.z });
        if (!this.god) this.xp += p.kind === 'gem25' ? 25 : p.kind === 'gem5' ? 5 : 1;
        while (this.xp >= this.need()) {
          this.xp -= this.need();
          this.lv++;
          h.hp = Math.min(h.hpMax, h.hp + 10);
          this.fx.push({ k: 'level', level: this.lv });
          this.pendingCards++;
          this.cardsTotal++;
        }
      }
    }
    if (!this.cards && this.pendingCards > 0) {
      this.pendingCards--;
      this.cards = this.rollCards();
    }
  }

  private updateBuildings(): void {
    const h = this.hero;
    for (const b of this.buildings) {
      const d = Math.hypot(wrap(h.x - b.x), wrap(h.z - b.z));
      if (b.kind === 'lamppost' && !b.on && d < 2) {
        b.use = Math.min(1, Math.max(0, b.use) + DT / 1.5);
        if (b.use >= 1) { b.on = true; b.s = 1; b.use = -1; this.fx.push({ k: 'use', kind: 'lamppost', x: b.x, z: b.z }); }
      } else if (b.kind === 'lamppost' && !b.on) b.use = -1;
      if (b.kind === 'altar') {
        if (b.s < 1) b.s = Math.min(1, b.s + DT / 90);
        if (d < 2 && b.s >= 1 && this.useHold > 0) {
          b.s = 0;
          this.fx.push({ k: 'use', kind: 'altar', x: b.x, z: b.z });
        }
      }
      if (b.kind === 'spring' && d < 1.8 && b.s > 0 && h.hp < h.hpMax) {
        b.s = Math.max(0, b.s - DT * 0.16);
        h.hp = Math.min(h.hpMax, h.hp + 8 * DT);
      } else if (b.kind === 'spring') b.s = Math.min(1, b.s + DT / 60);
      if (b.kind === 'brazier' && b.s > 0 && d < 1.5) {
        b.s = 0;
        this.fx.push({ k: 'use', kind: 'brazier', x: b.x, z: b.z });
      }
    }
    this.useHold = 0;
  }

  private need(): number {
    return 10 * (this.lv + 1);
  }

  private inJam(x: number, z: number): boolean {
    for (const p of this.puddles) if (p.kind === 'jam' && Math.hypot(wrap(x - p.x), wrap(z - p.z)) < p.r) return true;
    return false;
  }

  private rollCards(): Card[] {
    const pool: Card[] = [];
    for (const id of Object.keys(WEAPONS)) {
      if (id.endsWith('_evo') || this.banned.has(id)) continue;
      const own = this.weapons.find((w) => w.id === id);
      if (own ? own.lv < 7 : this.weapons.length < 5) pool.push({ kind: 'weapon', id });
    }
    for (const id of Object.keys(PASSIVES)) {
      if (this.banned.has(id)) continue;
      const own = this.passives.find((w) => w.id === id);
      if (own ? own.lv < PASSIVES[id].max : this.passives.length < 5) pool.push({ kind: 'passive', id });
    }
    const out: Card[] = [];
    while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    while (out.length < 3) out.push({ kind: 'misc', id: out.length ? 'temper' : 'stew' });
    return out;
  }

  private take(c: Card): void {
    if (c.kind === 'weapon') {
      const own = this.weapons.find((w) => w.id === c.id);
      if (own) own.lv++;
      else this.weapons.push({ id: c.id, lv: 1, cd: 0.3 });
    } else if (c.kind === 'passive') {
      const own = this.passives.find((w) => w.id === c.id);
      if (own) own.lv++;
      else this.passives.push({ id: c.id, lv: 1 });
      if (c.id === 'maxhp') { this.hero.hpMax += 20; this.hero.hp += 20; }
    } else if (c.id === 'stew') this.hero.hp = Math.min(this.hero.hpMax, this.hero.hp + 30);
    this.cards = null;
    if (this.pendingCards > 0) {
      this.pendingCards--;
      this.cards = this.rollCards();
    } else this.cardsTotal = 0;
    this.hero.invT = 0.5;
  }

  /** Отладка стенда: сразу несколько уровней (откроет карточки) */
  levelUp(n = 1): void {
    for (let i = 0; i < n; i++) {
      this.lv++;
      this.pendingCards++;
      this.cardsTotal++;
      this.fx.push({ k: 'level', level: this.lv });
    }
    if (!this.cards) { this.pendingCards--; this.cards = this.rollCards(); }
  }

  /** Отладка стенда: выдать оружие сразу */
  give(id: string, lv: number): void {
    const own = this.weapons.find((w) => w.id === id);
    if (own) own.lv = lv;
    else this.weapons.push({ id, lv, cd: 0.2 });
  }

  /** Отладка стенда: толпа из n врагов вокруг героя, герой бессмертен и без опыта (замер) */
  crowd(n: number): void {
    this.god = true;
    const kinds: MobKind[] = ['rat', 'rat', 'rat', 'slime', 'shroom', 'beetle', 'spitter', 'bat'];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 3 + Math.sqrt(Math.random()) * 15;
      this.addEnemy(kinds[i % kinds.length], mod(this.hero.x + Math.sin(a) * r), mod(this.hero.z + Math.cos(a) * r * 0.7), false);
    }
  }

  killHero(): void {
    this.god = false;
    this.hurt(9999, 'Бочар');
  }

  // ---------------------------------------------------------------- вид

  private cardView(c: Card): HudCard {
    if (c.kind === 'misc') return { icon: MISC[c.id].icon, name: MISC[c.id].name, from: 0, to: 0, text: MISC[c.id].text, kind: 'misc' };
    const info = c.kind === 'weapon' ? WEAPONS[c.id] : PASSIVES[c.id];
    const own = c.kind === 'weapon' ? this.weapons.find((w) => w.id === c.id) : this.passives.find((w) => w.id === c.id);
    const from = own?.lv ?? 0;
    return { icon: info.icon, name: info.name, from, to: from + 1, text: info.text, kind: c.kind };
  }

  view(): DgView {
    const h = this.hero;
    const items = (list: { id: string; lv: number }[], dict: Record<string, { name: string; icon: string; max: number }>): HudItem[] =>
      list.map((w) => ({ id: w.id, icon: dict[w.id].icon, name: dict[w.id].name, lv: w.lv, max: dict[w.id].max }));
    const next = WAVE_MOBS[Math.min(9, this.wave - 1)];
    return {
      tick: this.tick,
      stage: this.stage,
      wave: this.wave,
      timeLeft: this.stage === 'boss' ? -1 : Math.max(0, this.stageT),
      squadLeft: this.squadLeft + this.enemies.length,
      squadTotal: this.squadTotal,
      hero: { x: h.x, z: h.z, y: 0, yaw: h.yaw, speed: Math.hypot(h.vx, h.vz), hp: h.hp, hpMax: h.hpMax, dashing: h.dashT > 0, invuln: h.invT > 0 && h.dashT <= 0, qCharge: h.q, dead: h.dead },
      enemies: this.enemies,
      projectiles: this.withFireflies(),
      teles: this.teles,
      puddles: this.puddles,
      pickups: this.pickups,
      buildings: this.buildings,
      bosses: this.boss ? [this.boss] : [],
      rays: [],
      fx: this.fx,
      level: this.lv,
      xp01: this.xp / this.need(),
      kills: this.kills,
      buffs: [],
      weapons: items(this.weapons, WEAPONS),
      passives: items(this.passives, PASSIVES),
      dash01: 1 - h.dashCd / 3,
      q01: 1 - h.qCd / 9,
      dashLeft: Math.max(0, h.dashCd),
      qLeft: Math.max(0, h.qCd),
      cards: this.cards ? { cards: this.cards.map((c) => this.cardView(c)), index: this.cardsTotal - this.pendingCards, total: this.cardsTotal, rerolls: this.rerolls, banishes: this.banishes } : null,
      chest: this.chest,
      breather: this.stage === 'breather' ? { left: this.stageT, next: this.wave, mobs: [...new Set(next)].map((k) => MOBS[k]), event: this.wave === 10 ? 'Босс — Старый Повидл' : this.wave === 4 ? 'Элита — Бочар' : 'Налёт мышей' } : null,
      alarm: this.alarm,
      old: 0,
      swept: this.stage === 'breather',
      wavesDone: this.wavesDone,
      killedBy: this.killedBy,
      chests: this.chests,
    };
  }

  private readonly ff: VProj[] = [];

  /** светляки кружат вокруг героя (только картинка) */
  private withFireflies(): VProj[] {
    const w = this.weapons.find((x) => x.id === 'fireflies');
    this.ff.length = 0;
    if (!w) return this.projs;
    const n = 2 + Math.floor(w.lv / 2);
    for (let i = 0; i < n; i++) {
      const a = this.fireAngle + (i / n) * Math.PI * 2;
      this.ff.push({ id: 900000 + i, kind: 'firefly', x: mod(this.hero.x + Math.sin(a) * 2.6), z: mod(this.hero.z + Math.cos(a) * 2.6), y: 1.1, yaw: a });
    }
    return [...this.projs, ...this.ff];
  }

  hash(): number {
    return (Math.round(this.hero.x * 100) ^ Math.round(this.hero.z * 100) ^ this.tick) >>> 0;
  }

  result(): DgResult {
    return { waves: this.wavesDone, ms: Math.round(this.ms), kills: this.kills, level: this.lv, bosses: 0, killedBy: this.killedBy, dmg: { ...this.dmgBy }, end: this.hero.dead ? 'death' : 'running' };
  }
}

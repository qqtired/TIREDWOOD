// «Подземелье»: опыт, уровни, карточки (сразу при уровне, мир стоит), перебросы, изгнания, сундуки, эволюции.
import { fx, healHero, KB_V, passiveLv } from './core.ts';
import { D, evoOf, interNum, passiveDef, PASSIVE_IDS, WEAPON_IDS, weaponDef } from './data.ts';
import type { DgCard, DgChestRow, DgSim } from './types.ts';
import { rnd, ticks, wrapD } from './util.ts';

const MAX_WLV = 7;

export function xpNeed(level: number): number {
  return D.xp.base + D.xp.perLevel * level;
}

export function addXp(sim: DgSim, v: number): void {
  const h = sim.hero;
  if (h.dead) return;
  const mag = passiveLv(sim, 'magnet') * (passiveDef('magnet').xp ?? 0);
  h.xp += v * (1 + mag);
  while (h.xp >= h.xpNext) {
    h.xp -= h.xpNext;
    h.level++;
    h.xpNext = xpNeed(h.level);
    levelUp(sim);
  }
}

/** Новый уровень: вспышка фонаря (+HP, отталкивание), в очередь выбора */
function levelUp(sim: DgSim): void {
  const h = sim.hero;
  const F = D.hero.levelUpFlash;
  healHero(sim, F.heal);
  const r2 = F.pushRadius * F.pushRadius;
  for (const m of sim.mobs) {
    if (m.die || m.under || m.k === 'povidl') continue;
    const dx = wrapD(m.x - h.x);
    const dz = wrapD(m.z - h.z);
    const d2 = dx * dx + dz * dz;
    if (d2 >= r2) continue;
    const d = Math.sqrt(d2) || 1;
    const v = F.pushDist * KB_V * (m.elite ? 0.3 : 1);
    m.kx += (dx / d) * v;
    m.kz += (dz / d) * v;
  }
  sim.pendLv++;
  fx(sim, { k: 'lvl', level: h.level });
}

/** Открыть следующий выбор, если ждёт (вызывается в конце шага и после выбора/сундука) */
export function maybeOpenChoice(sim: DgSim): void {
  if (sim.choice || sim.chest || sim.pendLv <= 0 || sim.end !== 'running') return;
  sim.pendLv--;
  sim.chN++;
  sim.choice = { why: 'level', cards: genCards(sim, 'level'), n: sim.chN, left: sim.pendLv };
  sim.firstPick = 1;
}

function weaponLv(sim: DgSim, id: string): number {
  for (const w of sim.weapons) if (w.id === id) return w.lv;
  return 0;
}

interface Cand {
  c: DgCard;
  wt: number;
  isNewW: boolean;
}

/** Кандидаты в карточки */
function candidates(sim: DgSim): Cand[] {
  const out: Cand[] = [];
  const W = D.levelUp.weights;
  const banned = sim.banned;
  for (const id of WEAPON_IDS) {
    if (banned.includes(id)) continue;
    const lv = weaponLv(sim, id);
    if (lv > 0 && lv < MAX_WLV) out.push({ c: { k: 'w', id, lv: lv + 1 }, wt: W.ownedUpgrade, isNewW: false });
    else if (lv === 0 && sim.weapons.length < D.hero.slots.weapons) out.push({ c: { k: 'w', id, lv: 1 }, wt: W.newWeapon, isNewW: true });
  }
  for (const id of PASSIVE_IDS) {
    if (banned.includes(id)) continue;
    const lv = passiveLv(sim, id);
    const max = passiveDef(id).max;
    if (lv > 0 && lv < max) out.push({ c: { k: 'p', id, lv: lv + 1 }, wt: W.ownedUpgrade, isNewW: false });
    else if (lv === 0 && sim.passives.length < D.hero.slots.passives) out.push({ c: { k: 'p', id, lv: 1 }, wt: W.newPassive, isNewW: false });
  }
  return out;
}

function takeWeighted(sim: DgSim, list: Cand[]): Cand | null {
  let sum = 0;
  for (const c of list) sum += c.wt;
  if (list.length === 0 || sum <= 0) return null;
  let r = rnd(sim) * sum;
  for (let i = 0; i < list.length; i++) {
    r -= list[i].wt;
    if (r < 0 || i === list.length - 1) return list.splice(i, 1)[0];
  }
  return null;
}

function fillers(sim: DgSim, cards: DgCard[], n: number): void {
  if (cards.length < n && sim.temper < D.levelUp.temper.max) cards.push({ k: 'temper', id: '', lv: sim.temper + 1 });
  while (cards.length < n) cards.push({ k: 'stew', id: '', lv: 0 });
}

export function genCards(sim: DgSim, why: 'level' | 'forge', exclude: DgCard[] = []): DgCard[] {
  const n = D.levelUp.cards;
  const cards: DgCard[] = [];
  if (why === 'forge') {
    const list: Cand[] = [];
    for (const w of sim.weapons) if (w.lv < MAX_WLV && !w.evo) list.push({ c: { k: 'w', id: w.id, lv: w.lv + 1 }, wt: 1, isNewW: false });
    while (cards.length < n) {
      const c = takeWeighted(sim, list);
      if (!c) break;
      cards.push(c.c);
    }
    if (cards.length === 0) cards.push({ k: 'temper', id: '', lv: sim.temper + 1 });
    return cards;
  }
  const list = candidates(sim).filter((c) => !exclude.some((e) => e.k === c.c.k && e.id === c.c.id));
  if (!sim.firstPick) {
    // на первом уровне — минимум 2 новых оружия
    const neww = list.filter((c) => c.isNewW);
    for (let i = 0; i < 2; i++) {
      const c = takeWeighted(sim, neww);
      if (!c) break;
      list.splice(list.indexOf(c), 1);
      cards.push(c.c);
    }
  }
  while (cards.length < n) {
    const c = takeWeighted(sim, list);
    if (!c) break;
    cards.push(c.c);
  }
  fillers(sim, cards, n);
  return cards;
}

function addWeaponLevel(sim: DgSim, id: string): number {
  for (const w of sim.weapons) {
    if (w.id === id) {
      if (w.lv < MAX_WLV) w.lv++;
      checkEvo(sim);
      return w.lv;
    }
  }
  weaponDef(id);
  sim.weapons.push({ id: id as DgSim['weapons'][number]['id'], lv: 1, evo: 0, cd: 0, t2: 0 });
  checkEvo(sim);
  return 1;
}

function addPassiveLevel(sim: DgSim, id: string): number {
  const def = passiveDef(id);
  let p = sim.passives.find((x) => x.id === id);
  if (!p) {
    p = { id: def.id, lv: 0 };
    sim.passives.push(p);
  }
  if (p.lv < def.max) {
    p.lv++;
    if (id === 'maxhp') {
      sim.hero.hpMax += def.per;
      healHero(sim, def.per);
    }
  }
  checkEvo(sim);
  return p.lv;
}

/** Оружие на 7-м + нужная пассивка → в очередь эволюций (по порядку готовности) */
function checkEvo(sim: DgSim): void {
  for (const w of sim.weapons) {
    if (w.evo || w.lv < MAX_WLV) continue;
    const e = evoOf(w.id);
    if (!e || passiveLv(sim, e.with) <= 0) continue;
    if (!sim.evoReady.includes(w.id)) sim.evoReady.push(w.id);
  }
}

export function applyCard(sim: DgSim, c: DgCard): void {
  if (c.k === 'w') addWeaponLevel(sim, c.id);
  else if (c.k === 'p') addPassiveLevel(sim, c.id);
  else if (c.k === 'stew') healHero(sim, 30);
  else if (c.k === 'temper' && sim.temper < D.levelUp.temper.max) sim.temper++;
}

/** pick: закрыть сундук или взять карточку i */
export function pick(sim: DgSim, i: number): void {
  if (sim.chest) {
    sim.chest = null;
    maybeOpenChoice(sim);
    return;
  }
  const ch = sim.choice;
  if (!ch) return;
  const c = ch.cards[i | 0];
  if (!c) return;
  applyCard(sim, c);
  sim.choice = null;
  const inv = sim.t + ticks(D.levelUp.pickInvuln ?? 0.5);
  if (sim.hero.invT < inv) sim.hero.invT = inv;
  maybeOpenChoice(sim);
}

export function reroll(sim: DgSim): void {
  const ch = sim.choice;
  if (!ch || sim.rerolls <= 0 || ch.why !== 'level') return;
  sim.rerolls--;
  ch.cards = genCards(sim, 'level', ch.cards);
}

export function ban(sim: DgSim, i: number): void {
  const ch = sim.choice;
  if (!ch || sim.banishes <= 0 || ch.why !== 'level') return;
  const c = ch.cards[i | 0];
  if (!c || (c.k !== 'w' && c.k !== 'p')) return;
  sim.banishes--;
  sim.banned.push(c.id);
  const others = ch.cards.filter((_, j) => j !== (i | 0));
  const fresh = genCards(sim, 'level', ch.cards).find((x) => !others.some((o) => o.k === x.k && o.id === x.id));
  ch.cards[i | 0] = fresh ?? { k: 'stew', id: '', lv: 0 };
}

/** Своё, что можно поднять на уровень (оружия до 7, пассивки до максимума) */
function upgradable(sim: DgSim): { k: 'w' | 'p'; id: string }[] {
  const out: { k: 'w' | 'p'; id: string }[] = [];
  for (const w of sim.weapons) if (w.lv < MAX_WLV && !w.evo) out.push({ k: 'w', id: w.id });
  for (const p of sim.passives) if (p.lv < passiveDef(p.id).max) out.push({ k: 'p', id: p.id });
  return out;
}

/** Сундук: эволюция (если готова, одна), иначе барабан 1/2/3 уровня; всё собрано — 50 опыта и +30 HP */
/** Сундук островка: сколько улучшений */
const ISLE_ROWS = interNum('isleChest', 'rows', 2);

/**
 * Сундук: готова эволюция — она (одна). Иначе: plain (обычный сундук карты) — 1 улучшение из общего пула карточек
 * (новое оружие, пассивка или уровень своей вещи, как при новом уровне), isle — 2 таких; small (элита) — барабан
 * 1/2/3 уровня своим вещам; big/curse — 3. Нечего давать — 50 опыта и +30 HP.
 */
export function openChest(sim: DgSim, kind: 'small' | 'big' | 'curse' | 'plain' | 'isle'): void {
  const rows: DgChestRow[] = [];
  sim.stats.chests++;
  if (sim.evoReady.length > 0) {
    const wid = sim.evoReady.shift()!;
    const w = sim.weapons.find((x) => x.id === wid);
    const e = evoOf(wid);
    if (w && e) {
      w.evo = 1;
      w.cd = 0;
      rows.push({ k: 'evo', id: e.id, lv: w.lv });
    }
  } else if (kind === 'plain' || kind === 'isle') {
    const n = kind === 'isle' ? ISLE_ROWS : 1;
    for (let i = 0; i < n; i++) {
      const c = takeWeighted(sim, candidates(sim));
      if (!c || (c.c.k !== 'w' && c.c.k !== 'p')) {
        rows.push({ k: 'gold', id: '', lv: 0 });
        break;
      }
      applyCard(sim, c.c);
      rows.push({ k: c.c.k, id: c.c.id, lv: c.c.lv });
    }
  } else {
    let n = 3;
    if (kind === 'small') {
      const r = rnd(sim);
      n = r < 0.6 ? 1 : r < 0.9 ? 2 : 3;
    }
    for (let i = 0; i < n; i++) {
      const list = upgradable(sim);
      if (list.length === 0) {
        rows.push({ k: 'gold', id: '', lv: 0 });
        break;
      }
      const it = list[Math.floor(rnd(sim) * list.length)];
      const lv = it.k === 'w' ? addWeaponLevel(sim, it.id) : addPassiveLevel(sim, it.id);
      rows.push({ k: it.k, id: it.id, lv });
    }
  }
  sim.chest = { kind, rows, t0: sim.t };
  const gold = rows.some((r) => r.k === 'gold');
  if (gold || kind === 'curse') {
    addXp(sim, 50);
    healHero(sim, 30);
  }
}

/** Кузня: выбор из своих оружий (мир стоит) */
export function openForge(sim: DgSim): void {
  sim.choice = { why: 'forge', cards: genCards(sim, 'forge'), n: 1, left: 0 };
}


// «Подземелье»: постройки. Базовые — алтарь света, жаровни, проклятый сундук, целебный родник. Выбранные владельцем —
// фонари-маяки, вагонетка, пороховые бочки, гриб-батут, забытая кузня. Места — level-data, числа — design-data
// (interactables), запасные значения — здесь. Алтарь, проклятый сундук и кузня срабатывают, если постоять в круге
// (hero.useId/useT0/useT1 — отсчёт, вышел из круга — сброс); E (событие use) нужно только для вагонетки.
import { dmgMul, fx, healHero, hurtHero, hurtMob, KB_V, newId } from './core.ts';
import { D, interNum, LV } from './data.ts';
import { blocked } from './map.ts';
import { roomForExtra, spawnMob } from './mobs.ts';
import { dropGem, dropItem } from './pickups.ts';
import { openChest, openForge } from './progress.ts';
import type { DgBuff, DgMob, DgProp, DgSim } from './types.ts';
import { dirOf, DT, rnd, ticks, wrapD, wrapP } from './util.ts';

const V = { x: 0, z: 0 };

// числа
const ALTAR_CD = interNum('altar', 'cooldown', 90);
const ALTAR_DUR = interNum('altar', 'duration', 30);
const BRAZIER_RESPAWN = interNum('brazier', 'respawn', 60);
const SPRING_HEAL = interNum('spring', 'heal', 8);
const SPRING_POOL = interNum('spring', 'pool', 50);
const SPRING_REFILL = interNum('spring', 'refill', 60);
const LAMP_TIME = interNum('lamppost', 'lightTime', 1.5);
const LAMP_R = interNum('lamppost', 'lightRadius', 7);
const LAMP_REGEN = interNum('lamppost', 'heroRegen', 1);
const CART_SPEED = interNum('minecart', 'speed', 12);
const CART_RUN = interNum('minecart', 'run', 120);
const CART_BRAKE = interNum('minecart', 'brake', 2);
const CART_CD = interNum('minecart', 'cooldown', 5);
const CART_W = interNum('minecart', 'width', 1.6);
const CART_COMMON = interNum('minecart', 'commonDmg', 0.5);
const CART_ELITE = interNum('minecart', 'eliteDmg', 0.05);
const CART_KB = interNum('minecart', 'knockback', 4);
const KEG_FUSE = interNum('powderKegs', 'fuse', 1.5);
const KEG_R = interNum('powderKegs', 'radius', 5);
const KEG_CHAIN = interNum('powderKegs', 'chainDelay', 0.25);
const KEG_COMMON = interNum('powderKegs', 'commonDmg', 1);
const KEG_ELITE = interNum('powderKegs', 'eliteDmg', 0.08);
const KEG_BOSS = interNum('powderKegs', 'bossDmg', 0.02);
const KEG_HERO = interNum('powderKegs', 'heroDmg', 0.1);
const TRAMP_CD = interNum('trampoline', 'cooldown', 4);
const TRAMP_JUMP = interNum('trampoline', 'jump', 10);
const TRAMP_AIR = interNum('trampoline', 'air', 0.8);
const TRAMP_LAND_R = interNum('trampoline', 'landRadius', 3);
const TRAMP_LAND_KB = interNum('trampoline', 'landKnockback', 3);
const FORGE_EVERY = interNum('forge', 'everyWaves', 3);
const FORGE_XP = interNum('forge', 'minXpShare', 0.5);
const CURSE_TIME = 45;
const CURSE_RESPAWN = 120;
const BRAZIER_ACTIVE = 36;
const BUFFS: DgBuff['id'][] = ['fury', 'haste', 'wind', 'pull'];

/** Радиус круга и сколько стоять в нём (алтарь, сундук, кузня); вагонетка — по E */
const USE_R: Record<string, number> = { altar: 2.5, chest: 2.5, forge: 2.5, cart: 2.2 };
const USE_T: Record<string, number> = { altar: 1, chest: 1.5, forge: 3, cart: 0 };

function prop(sim: DgSim, k: DgProp['k'], x: number, z: number, st: number, v = 0): DgProp {
  const p: DgProp = { id: newId(sim), k, x: wrapP(x), z: wrapP(z), st, t0: 0, t1: 0, v, vx: 0, why: '' };
  sim.props.push(p);
  return p;
}

export function initProps(sim: DgSim): void {
  const B = LV.buildings;
  const P = LV.proposals;
  for (const a of B.altar) prop(sim, 'altar', a.x, a.z, 0, -1);
  rotateAltars(sim);
  // жаровни: активные — случайные места не ближе 9 м к старту
  const sp = LV.map.heroSpawn;
  const brz = B.brazier.map((b) => prop(sim, 'brazier', b.x, b.z, 3));
  let act = 0;
  for (let guard = 0; act < BRAZIER_ACTIVE && guard < 1000; guard++) {
    const p = brz[Math.floor(rnd(sim) * brz.length)];
    if (p.st === 0) continue;
    const dx = wrapD(p.x - sp.x);
    const dz = wrapD(p.z - sp.z);
    if (dx * dx + dz * dz < 81) continue;
    p.st = 0;
    act++;
  }
  // проклятые сундуки: 2 из 3
  const ch = B.cursedChest.map((c) => prop(sim, 'chest', c.x, c.z, 0));
  ch[Math.floor(rnd(sim) * ch.length)].st = 3;
  for (const s of B.spring) prop(sim, 'spring', s.x, s.z, 0, 1);
  for (const l of P.lantern) prop(sim, 'lamp', l.x, l.z, 0);
  // вагонетки на кольце рельсов: у станции и напротив
  const rz = P.minecart.rails[0][1];
  for (let i = 0; i < P.minecart.carts; i++) prop(sim, 'cart', P.minecart.station.x + (i * 240) / P.minecart.carts, rz, 0);
  // пачки бочек по 4
  P.powderKegs.forEach((k, pi) => {
    const n = k.count ?? 4;
    for (let i = 0; i < n; i++) {
      const ox = i % 2 === 0 ? -0.7 : 0.7;
      const oz = i < 2 ? -0.7 : 0.7;
      prop(sim, 'keg', k.x + ox, k.z + oz, 0, pi);
    }
  });
  for (const t of P.mushroomTrampoline) prop(sim, 'tramp', t.x, t.z, 0);
  for (const f of P.forge) prop(sim, 'forge', f.x, f.z, 0, 0);
}

/** 5 мест алтаря, активны 4: пустует то, что дальше всех от героя (меняется после каждого использования) */
function rotateAltars(sim: DgSim): void {
  const h = sim.hero;
  let far: DgProp | null = null;
  let fd = -1;
  for (const p of sim.props) {
    if (p.k !== 'altar') continue;
    if (p.st === 3) p.st = 0;
    if (p.st !== 0) continue;
    const dx = wrapD(p.x - h.x);
    const dz = wrapD(p.z - h.z);
    const d = dx * dx + dz * dz;
    if (d > fd) {
      fd = d;
      far = p;
    }
  }
  if (far) far.st = 3;
}

/** В начале волны: целые пачки бочек возвращаются; кузни загораются, если пришла их волна */
export function wavePropsReset(sim: DgSim): void {
  for (const p of sim.props) {
    if (p.k === 'keg') {
      p.st = 0;
      p.vx = 0;
    } else if (p.k === 'forge' && p.st === 3 && sim.wave.n >= p.v) p.st = 0;
  }
}

// ---------- попадания по постройкам (жаровни, бочки) ----------
const NEAR = new Int32Array(512);
let nearN = 0;
/** Постройки, которые можно задеть, рядом с героем (раз в шаг, до оружий) */
export function scanProps(sim: DgSim): void {
  const h = sim.hero;
  nearN = 0;
  const props = sim.props;
  for (let i = 0; i < props.length; i++) {
    const p = props[i];
    if ((p.k !== 'brazier' && p.k !== 'keg') || p.st !== 0) continue;
    const dx = wrapD(p.x - h.x);
    const dz = wrapD(p.z - h.z);
    if (dx * dx + dz * dz < 30 * 30 && nearN < NEAR.length) NEAR[nearN++] = i;
  }
}

function hitOne(sim: DgSim, p: DgProp): void {
  if (p.st !== 0) return;
  if (p.k === 'brazier') tipBrazier(sim, p);
  else if (p.k === 'keg') lightKeg(sim, p, ticks(KEG_FUSE));
}

/** Удар по кругу задевает жаровни и бочки */
export function hitProps(sim: DgSim, x: number, z: number, r: number): void {
  for (let k = 0; k < nearN; k++) {
    const p = sim.props[NEAR[k]];
    if (p.st !== 0) continue;
    const dx = wrapD(p.x - x);
    const dz = wrapD(p.z - z);
    const rr = r + 0.6;
    if (dx * dx + dz * dz < rr * rr) hitOne(sim, p);
  }
}

/** Удар по полосе (луч) */
export function hitPropsLine(sim: DgSim, x: number, z: number, dx: number, dz: number, len: number, w: number): void {
  for (let k = 0; k < nearN; k++) {
    const p = sim.props[NEAR[k]];
    if (p.st !== 0) continue;
    const ox = wrapD(p.x - x);
    const oz = wrapD(p.z - z);
    const along = ox * dx + oz * dz;
    if (along < 0 || along > len) continue;
    if (Math.abs(ox * dz - oz * dx) < w / 2 + 0.6) hitOne(sim, p);
  }
}

/** Враги (таран Бочара, плевок) поджигают бочки — по всем бочкам, без списка «рядом» */
export function enemyHitsKegs(sim: DgSim, x: number, z: number, r: number): void {
  for (const p of sim.props) {
    if (p.k !== 'keg' || p.st !== 0) continue;
    const dx = wrapD(p.x - x);
    const dz = wrapD(p.z - z);
    if (dx * dx + dz * dz < (r + 0.5) * (r + 0.5)) lightKeg(sim, p, ticks(KEG_FUSE));
  }
}

function tipBrazier(sim: DgSim, p: DgProp): void {
  p.st = 2;
  p.t0 = sim.t;
  p.t1 = sim.t + ticks(BRAZIER_RESPAWN);
  fx(sim, { k: 'prop', id: p.id, what: 'tip' });
  const drops = (D.interactables.find((x) => x.id === 'brazier')?.drops as { id: string; p: number }[]) ?? [];
  let r = rnd(sim);
  let what = 'nothing';
  for (const d of drops) {
    if (r < d.p) {
      what = d.id;
      break;
    }
    r -= d.p;
  }
  if (what === 'xpBundle') for (let i = 0; i < 3; i++) dropGem(sim, p.x + (i - 1) * 0.7, p.z + 0.6, 5);
  else if (what === 'stew' || what === 'magnet' || what === 'keg' || what === 'hourglass') dropItem(sim, what, p.x, p.z + 0.8);
}

function lightKeg(sim: DgSim, p: DgProp, fuse: number): void {
  if (p.st !== 0) return;
  p.st = 1;
  p.t0 = sim.t;
  p.t1 = sim.t + fuse;
  fx(sim, { k: 'prop', id: p.id, what: 'fuse' });
}

function kegBoom(sim: DgSim, p: DgProp): void {
  p.st = 3;
  const r2 = KEG_R * KEG_R;
  for (const m of sim.mobs) {
    if (m.die || m.under) continue;
    const dx = wrapD(m.x - p.x);
    const dz = wrapD(m.z - p.z);
    if (dx * dx + dz * dz >= (KEG_R + m.r) * (KEG_R + m.r)) continue;
    const f = m.k === 'povidl' ? KEG_BOSS : m.elite ? KEG_ELITE : KEG_COMMON;
    hurtMob(sim, m, m.hpMax * f, 'prop', p.x, p.z, 2, 0, 0);
  }
  // герою — один раз за пачку
  const h = sim.hero;
  const hx = wrapD(h.x - p.x);
  const hz = wrapD(h.z - p.z);
  if (hx * hx + hz * hz < r2) {
    let done = false;
    for (const o of sim.props) if (o.k === 'keg' && o.v === p.v && o.vx === 1) done = true;
    if (!done && hurtHero(sim, h.hpMax * KEG_HERO, 'keg')) for (const o of sim.props) if (o.k === 'keg' && o.v === p.v) o.vx = 1;
  }
  // цепочка: соседние бочки
  for (const o of sim.props) {
    if (o.k !== 'keg' || o.st !== 0) continue;
    const dx = wrapD(o.x - p.x);
    const dz = wrapD(o.z - p.z);
    if (dx * dx + dz * dz < r2) lightKeg(sim, o, ticks(KEG_CHAIN));
  }
  fx(sim, { k: 'boom', x: p.x, z: p.z, r: KEG_R, what: 'barrel' });
}

// ---------- шаг построек ----------
export function stepProps(sim: DgSim): void {
  const h = sim.hero;
  const inp = sim.in;
  // E: у вагонетки — сесть (у остальных — то же, что встать в круг)
  if (inp.use) {
    inp.use = 0;
    if (!h.dead && h.useId < 0) startUse(sim, true);
  }
  // алтарь, проклятый сундук, кузня: встал в круг — пошёл отсчёт (без E)
  if (!h.dead && h.useId < 0 && h.dashT === 0 && h.ride < 0 && h.jumpT1 <= sim.t) startUse(sim, false);
  // идёт удержание
  if (h.useId >= 0) {
    const p = sim.props.find((x) => x.id === h.useId);
    if (!p || !inRange(h, p, (USE_R[p.k] ?? 2.5) + 0.5)) h.useId = -1;
    else if (sim.t >= h.useT1) {
      h.useId = -1;
      finishUse(sim, p);
    }
  }
  let lampHeal = false;
  for (const p of sim.props) {
    switch (p.k) {
      case 'altar':
        if (p.st === 2 && sim.t >= p.t1) p.st = 0;
        break;
      case 'brazier':
        if (p.st === 2 && sim.t >= p.t1) respawnBrazier(sim, p);
        break;
      case 'chest':
        if (p.st === 1 && sim.t >= p.t1) curseFail(sim, p);
        else if (p.st === 2 && sim.t >= p.t1) respawnChest(sim, p);
        break;
      case 'spring': {
        const near = inRange(h, p, 2.2);
        p.st = 0;
        if (near && p.v > 0 && h.hp < h.hpMax && !h.dead) {
          p.st = 1; // лечит прямо сейчас
          const n = (SPRING_HEAL * DT) / SPRING_POOL;
          const take = Math.min(n, p.v);
          p.v -= take;
          h.hp = Math.min(h.hpMax, h.hp + take * SPRING_POOL);
        } else if (p.v < 1) p.v = Math.min(1, p.v + DT / SPRING_REFILL);
        break;
      }
      case 'lamp':
        if (p.st === 0) {
          if (inRange(h, p, 2)) {
            p.vx += DT / LAMP_TIME;
            if (p.vx >= 1) {
              p.st = 1;
              p.vx = 1;
              sim.stats.lamps++;
              fx(sim, { k: 'prop', id: p.id, what: 'lit' });
            }
          } else if (p.vx > 0) p.vx = 0;
        } else if (!lampHeal && inRange(h, p, LAMP_R)) lampHeal = true;
        break;
      case 'cart':
        stepCart(sim, p);
        break;
      case 'keg':
        if (p.st === 1 && sim.t >= p.t1) kegBoom(sim, p);
        break;
      case 'tramp':
        if (p.st === 2 && sim.t >= p.t1) p.st = 0;
        if (p.st === 0 && h.jumpT1 <= sim.t && h.dashT === 0 && h.ride < 0 && !h.dead && inRange(h, p, 1.25)) jump(sim, p);
        break;
      case 'forge':
        if (p.st === 3 && sim.wave.n >= p.v) p.st = 0;
        break;
    }
  }
  if (lampHeal && sim.t % 30 === 0) healHero(sim, LAMP_REGEN);
  lockCheck(sim);
  // приземление с батута
  if (h.jumpT1 === sim.t && h.jumpT1 > 0) land(sim);
}

function inRange(h: { x: number; z: number }, p: DgProp, r: number): boolean {
  const dx = wrapD(p.x - h.x);
  const dz = wrapD(p.z - h.z);
  return dx * dx + dz * dz < r * r;
}

/** Почему алтарь, проклятый сундук или кузня сейчас не сработают ('' — сработают) */
function whyOf(sim: DgSim, p: DgProp): DgProp['why'] {
  const st = sim.wave.stage;
  switch (p.k) {
    case 'altar':
      return p.st === 2 ? 'cool' : '';
    case 'chest':
      if (p.st === 1) return 'busy';
      if (p.st === 2) return 'cool';
      if (st === 'boss') return 'boss';
      return st === 'wave' ? '' : 'wave';
    case 'forge':
      if (p.st === 3) return 'out';
      return sim.hero.xp >= sim.hero.xpNext * FORGE_XP && sim.weapons.length > 0 ? '' : 'xp';
  }
  return '';
}

function usable(sim: DgSim, p: DgProp): boolean {
  if (p.k === 'cart') return true;
  if (p.k !== 'altar' && p.k !== 'chest' && p.k !== 'forge') return false;
  return p.st === 0 && whyOf(sim, p) === '';
}

/**
 * Причины для подписи (prop.why) и «встал в круг, а нельзя»: hero.lockId и fx prop 'locked' с why при входе в круг
 * (например, проклятый сундук вне волны — «откроется во время волны»)
 */
function lockCheck(sim: DgSim): void {
  const h = sim.hero;
  let lock = -1;
  let lockWhy: DgProp['why'] = '';
  let bd = 1e9;
  for (const p of sim.props) {
    if (p.k !== 'altar' && p.k !== 'chest' && p.k !== 'forge') continue;
    p.why = p.st === 3 && p.k !== 'forge' ? '' : whyOf(sim, p);
    if (!p.why || h.dead || h.useId >= 0) continue;
    const r = USE_R[p.k] ?? 2.5;
    const dx = wrapD(p.x - h.x);
    const dz = wrapD(p.z - h.z);
    const d = dx * dx + dz * dz;
    if (d < r * r && d < bd) {
      bd = d;
      lock = p.id;
      lockWhy = p.why;
    }
  }
  if (lock >= 0 && lock !== h.lockId) fx(sim, { k: 'prop', id: lock, what: 'locked', why: lockWhy });
  h.lockId = lock;
}

function startUse(sim: DgSim, byE: boolean): void {
  const h = sim.hero;
  let best: DgProp | null = null;
  let bd = 1e9;
  for (const p of sim.props) {
    const r = USE_R[p.k];
    if (r === undefined || (p.k === 'cart' && !byE) || !usable(sim, p)) continue;
    const dx = wrapD(p.x - h.x);
    const dz = wrapD(p.z - h.z);
    const d = dx * dx + dz * dz;
    if (d < r * r && d < bd) {
      bd = d;
      best = p;
    }
  }
  if (!best) return;
  if (best.k === 'cart') {
    boardCart(sim, best);
    return;
  }
  h.useId = best.id;
  h.useT0 = sim.t;
  h.useT1 = sim.t + ticks(USE_T[best.k] ?? 1);
}

function finishUse(sim: DgSim, p: DgProp): void {
  if (!usable(sim, p)) return;
  fx(sim, { k: 'prop', id: p.id, what: 'used' });
  if (p.k === 'altar') {
    // случайный бафф, не тот же, что прошлый
    const last = sim.props.reduce((a, o) => (o.k === 'altar' && o.v >= 0 && o.t0 > a.t ? { t: o.t0, v: o.v } : a), { t: -1, v: -1 }).v;
    let i = Math.floor(rnd(sim) * (BUFFS.length - (last >= 0 ? 1 : 0)));
    if (last >= 0 && i >= last) i++;
    p.v = i;
    p.st = 2;
    p.t0 = sim.t;
    p.t1 = sim.t + ticks(ALTAR_CD);
    const id = BUFFS[i];
    sim.hero.buffs = sim.hero.buffs.filter((b) => b.id !== id);
    sim.hero.buffs.push({ id, t1: sim.t + ticks(ALTAR_DUR) });
    fx(sim, { k: 'buff', id });
    rotateAltars(sim);
  } else if (p.k === 'chest') startCurse(sim, p);
  else if (p.k === 'forge') {
    sim.hero.xp = 0;
    for (const f of sim.props) if (f.k === 'forge') {
      f.st = 3;
      f.v = sim.wave.n + FORGE_EVERY;
    }
    openForge(sim);
  }
}

// ---------- жаровни ----------
function respawnBrazier(sim: DgSim, p: DgProp): void {
  const h = sim.hero;
  p.st = 3;
  // новая — в свободном месте за экраном
  for (let k = 0; k < 20; k++) {
    let i = Math.floor(rnd(sim) * sim.props.length);
    for (let j = 0; j < sim.props.length; j++, i = (i + 1) % sim.props.length) if (sim.props[i].k === 'brazier' && sim.props[i].st === 3) break;
    const q = sim.props[i];
    if (q.k !== 'brazier' || q.st !== 3) continue;
    const dx = wrapD(q.x - h.x);
    const dz = wrapD(q.z - h.z);
    if (dx * dx + dz * dz < 20 * 20) continue;
    q.st = 0;
    return;
  }
  p.st = 0;
}

// ---------- проклятый сундук ----------
function startCurse(sim: DgSim, p: DgProp): void {
  p.st = 1;
  p.t0 = sim.t;
  p.t1 = sim.t + ticks(CURSE_TIME);
  const k = rnd(sim) < 0.5 ? 'barrel' : 'shaman';
  dirOf(rnd(sim) * Math.PI * 2, V);
  const e = spawnMob(sim, k, p.x + V.x * 9, p.z + V.z * 9, 0, 1.5);
  e.curse = p.id;
  for (let i = 0; i < 12; i++) {
    dirOf((i / 12) * Math.PI * 2, V);
    const x = p.x + V.x * 11;
    const z = p.z + V.z * 11;
    if (blocked(wrapP(x), wrapP(z), 0.5) || !roomForExtra(sim)) continue;
    spawnMob(sim, sim.wave.n >= 5 && i % 3 === 0 ? 'shroom' : 'rat', x, z, 0);
  }
  sim.alerts.push({ k: 'curse', x: p.x, z: p.z, mob: k, t0: sim.t, t1: p.t1 });
  fx(sim, { k: 'prop', id: p.id, what: 'curse' });
}

/** Элита проклятия убита: сундук открывается */
export function cursedKill(sim: DgSim, m: DgMob): void {
  const p = sim.props.find((x) => x.id === m.curse);
  if (!p || p.st !== 1) {
    dropItem(sim, 'chest', m.x, m.z);
    return;
  }
  p.st = 2;
  p.t0 = sim.t;
  p.t1 = sim.t + ticks(CURSE_RESPAWN);
  sim.alerts = sim.alerts.filter((a) => a.k !== 'curse');
  openChest(sim, 'curse');
}

function curseFail(sim: DgSim, p: DgProp): void {
  p.st = 2;
  p.t0 = sim.t;
  p.t1 = sim.t + ticks(CURSE_RESPAWN);
  for (const m of sim.mobs) if (m.curse === p.id && !m.die) {
    m.st = 'flee';
    m.stT = sim.t;
  }
  sim.alerts = sim.alerts.filter((a) => a.k !== 'curse');
  fx(sim, { k: 'prop', id: p.id, what: 'fail' });
}

function respawnChest(sim: DgSim, p: DgProp): void {
  // новый — в другом месте (пустующем)
  const free = sim.props.filter((x) => x.k === 'chest' && x.st === 3);
  p.st = 3;
  if (free.length) free[Math.floor(rnd(sim) * free.length)].st = 0;
  else p.st = 0;
}

// ---------- вагонетка ----------
function boardCart(sim: DgSim, p: DgProp): void {
  const h = sim.hero;
  h.ride = p.id;
  h.useId = -1;
  if (p.st === 0 && sim.t >= p.t1) rollCart(sim, p, h.dx >= 0 ? 1 : -1);
}

function rollCart(sim: DgSim, p: DgProp, dir: number): void {
  p.st = 1;
  p.t0 = sim.t;
  p.vx = CART_SPEED * dir;
  p.v = 0; // проехано, м
  fx(sim, { k: 'prop', id: p.id, what: 'roll' });
}

function stepCart(sim: DgSim, p: DgProp): void {
  const h = sim.hero;
  if (p.st === 0) {
    // пробежал сквозь стоящую — покатилась по ходу
    if (sim.t >= p.t1 && h.ride < 0 && Math.abs(h.vx) > 3 && inRange(h, p, 1.2)) rollCart(sim, p, h.vx > 0 ? 1 : -1);
    return;
  }
  // едет: 120 м полным ходом, потом тормозит 2 с
  if (p.v >= CART_RUN) {
    const dec = (CART_SPEED / CART_BRAKE) * DT;
    if (Math.abs(p.vx) <= dec) {
      p.vx = 0;
      p.st = 0;
      p.t1 = sim.t + ticks(CART_CD);
      if (h.ride === p.id) h.ride = -1;
      return;
    }
    p.vx -= Math.sign(p.vx) * dec;
  }
  const dx = p.vx * DT;
  p.x = wrapP(p.x + dx);
  p.v += Math.abs(dx);
  if (h.ride === p.id) {
    h.x = p.x;
    h.z = p.z;
    h.vx = p.vx;
    h.vz = 0;
  }
  // сбивает врагов на пути
  const half = CART_W / 2;
  const sgn = p.vx >= 0 ? 1 : -1;
  for (const m of sim.mobs) {
    if (m.die || m.under || m.k === 'povidl' || m.bmT > sim.t) continue;
    const ox = wrapD(m.x - p.x);
    const oz = wrapD(m.z - p.z);
    if (Math.abs(oz) > half + m.r || ox * sgn < -0.8 || ox * sgn > 1.4 + m.r) continue;
    m.bmT = sim.t + 30;
    const side = oz >= 0 ? 1 : -1;
    const f = m.elite ? CART_ELITE : CART_COMMON;
    hurtMob(sim, m, m.hpMax * f, 'prop', p.x, p.z, 0, 0, 0);
    if (!m.die && !m.elite) m.kz += side * CART_KB * KB_V;
    if (m.elite && (m.st === 'dash' || m.st === 'wind' || m.st === 'cast')) {
      m.st = 'walk';
      m.stT = sim.t;
    }
  }
}

// ---------- гриб-батут ----------
function jump(sim: DgSim, p: DgProp): void {
  const h = sim.hero;
  const sp = Math.sqrt(h.vx * h.vx + h.vz * h.vz);
  let dx = h.dx;
  let dz = h.dz;
  if (sp > 0.5) {
    dx = h.vx / sp;
    dz = h.vz / sp;
  }
  let tx = wrapP(h.x + dx * TRAMP_JUMP);
  let tz = wrapP(h.z + dz * TRAMP_JUMP);
  // в твёрдом — к ближайшей проходимой
  if (blocked(tx, tz, 0.5)) {
    let found = false;
    for (let r = 0.5; r <= 6 && !found; r += 0.5) {
      for (let a = 0; a < 12 && !found; a++) {
        dirOf((a / 12) * Math.PI * 2, V);
        const x = wrapP(tx + V.x * r);
        const z = wrapP(tz + V.z * r);
        if (!blocked(x, z, 0.5)) {
          tx = x;
          tz = z;
          found = true;
        }
      }
    }
    if (!found) return;
  }
  p.st = 2;
  p.t0 = sim.t;
  p.t1 = sim.t + ticks(TRAMP_CD);
  h.jumpT0 = sim.t;
  h.jumpT1 = sim.t + ticks(TRAMP_AIR);
  h.jx0 = h.x;
  h.jz0 = h.z;
  h.jx1 = tx;
  h.jz1 = tz;
  h.useId = -1;
  fx(sim, { k: 'prop', id: p.id, what: 'jump' });
}

function land(sim: DgSim): void {
  const h = sim.hero;
  const S = D.actives.strike;
  const dmg = S.tap.damage * (1 + S.levelScale * (h.level - 1)) * dmgMul(sim);
  for (const m of sim.mobs) {
    if (m.die || m.under) continue;
    const dx = wrapD(m.x - h.x);
    const dz = wrapD(m.z - h.z);
    if (dx * dx + dz * dz < (TRAMP_LAND_R + m.r) * (TRAMP_LAND_R + m.r)) hurtMob(sim, m, dmg, 'prop', h.x, h.z, TRAMP_LAND_KB, 0, 0);
  }
  fx(sim, { k: 'prop', id: -1, what: 'land' });
}

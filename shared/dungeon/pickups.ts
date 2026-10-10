// «Подземелье»: подборы — осколки опыта (магнит, слияние свыше 250), похлёбка, магнит, бочонок, часы, сундуки.
import { fx, healHero, hasBuff, hurtMob, newId, passiveLv } from './core.ts';
import { D, interNum, LV, passiveDef } from './data.ts';
import { blocked, terrainAt } from './map.ts';
import { addXp, openChest } from './progress.ts';
import type { DgItem, DgSim } from './types.ts';
import { DT, L, rnd, ticks, wrapD, wrapP } from './util.ts';

/** Обычные сундуки карты: на старте 4–5, +1 за каждую засчитанную волну, на карте не больше 6 */
const MAP_START = interNum('mapChest', 'start', 4);
const MAP_START_MAX = interNum('mapChest', 'startMax', 5);
const MAP_PER_WAVE = interNum('mapChest', 'perWave', 1);
const MAP_MAX = interNum('mapChest', 'max', 6);
/** не ближе к другому сундуку, к герою, к постройке, м */
const MAP_GAP = interNum('mapChest', 'gap', 30);
const MAP_FROM_HERO = interNum('mapChest', 'fromHero', 20);
const MAP_FROM_PROP = 5;
/** запас от края тракта/рельсов/жилы, м */
const MAP_FROM_PATH = 2.5;

export function dropGem(sim: DgSim, x: number, z: number, v: number): void {
  const gems = sim.gems;
  if (gems.length >= D.xp.mergeOver) {
    // сливаем в ближайший лежащий
    let best = -1;
    let bd = 1e18;
    for (let i = 0; i < gems.length; i++) {
      const g = gems[i];
      if (g.fly) continue;
      const dx = wrapD(g.x - x);
      const dz = wrapD(g.z - z);
      const d = dx * dx + dz * dz;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    if (best >= 0) {
      gems[best].v += v;
      return;
    }
  }
  gems.push({ id: newId(sim), x: wrapP(x), z: wrapP(z), v, fly: 0 });
}

export function dropItem(sim: DgSim, k: DgItem['k'], x: number, z: number, src?: DgItem['src']): void {
  const it: DgItem = { id: newId(sim), k, x: wrapP(x), z: wrapP(z), t0: sim.t };
  if (src) it.src = src;
  sim.items.push(it);
}

// ---------- сундуки карты и островка ----------
/** Точки троп (тракт, рельсы, жила) через 2 м и их полуширина — чтобы сундук не лёг на тропу */
let PATH: Float64Array | null = null;
function pathPts(): Float64Array {
  if (PATH) return PATH;
  const out: number[] = [];
  for (const a of LV.avenues ?? []) {
    const line = a.line;
    for (let i = 0; i + 1 < line.length; i++) {
      const [x0, z0] = line[i];
      const [x1, z1] = line[i + 1];
      // переход через шов тора внутри ломаной (концы совпадают на торе) — не тропа
      if (line.length > 2 && Math.abs(wrapD(x1 - x0)) < 1e-6 && Math.abs(wrapD(z1 - z0)) < 1e-6) continue;
      const len = Math.sqrt((x1 - x0) * (x1 - x0) + (z1 - z0) * (z1 - z0));
      const n = Math.max(1, Math.ceil(len / 2));
      for (let k = 0; k <= n; k++) out.push(x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n, a.width / 2);
    }
  }
  PATH = new Float64Array(out);
  return PATH;
}
function onPath(x: number, z: number): boolean {
  const p = pathPts();
  for (let i = 0; i < p.length; i += 3) {
    const dx = wrapD(x - p[i]);
    const dz = wrapD(z - p[i + 1]);
    const r = p[i + 2] + MAP_FROM_PATH + 1;
    if (dx * dx + dz * dz < r * r) return true;
  }
  return false;
}
function far(x: number, z: number, ox: number, oz: number, r: number): boolean {
  const dx = wrapD(x - ox);
  const dz = wrapD(z - oz);
  return dx * dx + dz * dz >= r * r;
}
function mapChests(sim: DgSim): number {
  let n = 0;
  for (const it of sim.items) if (it.src === 'map') n++;
  return n;
}
/** Положить обычный сундук в случайное место: не в стене, не в воде/варенье/провале, не на тропе, не у построек */
function placeMapChest(sim: DgSim): boolean {
  const h = sim.hero;
  const lk = LV.lake;
  for (let tries = 0; tries < 300; tries++) {
    const x = rnd(sim) * L;
    const z = rnd(sim) * L;
    if (!far(x, z, h.x, h.z, MAP_FROM_HERO)) continue;
    if (lk && !far(x, z, lk.x, lk.z, lk.shallow + 3)) continue;
    if (blocked(x, z, 1.4)) continue;
    if (terrainAt(x, z) || terrainAt(x + 1.5, z) || terrainAt(x - 1.5, z) || terrainAt(x, z + 1.5) || terrainAt(x, z - 1.5)) continue;
    let ok = true;
    for (const it of sim.items) if (it.k === 'chest' && !far(x, z, it.x, it.z, MAP_GAP)) ok = false;
    if (!ok) continue;
    for (const p of sim.props) if (!far(x, z, p.x, p.z, MAP_FROM_PROP)) ok = false;
    if (!ok || onPath(x, z)) continue;
    dropItem(sim, 'chest', x, z, 'map');
    return true;
  }
  return false;
}
/** Старт забега: 4–5 обычных сундуков и сундук на островке озера */
export function initChests(sim: DgSim): void {
  const n = MAP_START + (rnd(sim) < 0.5 ? 0 : Math.max(0, MAP_START_MAX - MAP_START));
  for (let i = 0; i < n; i++) placeMapChest(sim);
  if (LV.lake) dropItem(sim, 'chest', LV.lake.chest.x, LV.lake.chest.z, 'isle');
  sim.isleT = -1;
}
/** Волна засчитана: +1 обычный сундук (на карте не больше 6) */
export function waveChest(sim: DgSim): void {
  for (let i = 0; i < MAP_PER_WAVE && mapChests(sim) < MAP_MAX; i++) placeMapChest(sim);
}

/** Радиус подбора: Подкова, Притяжение алтаря */
export function pickupRadius(sim: DgSim): number {
  const mag = passiveLv(sim, 'magnet') * passiveDef('magnet').per;
  return D.hero.pickupRadius * (1 + mag) * (hasBuff(sim, 'pull') ? 3 : 1);
}

/** Весь опыт карты летит к герою */
export function vacuum(sim: DgSim): void {
  for (const g of sim.gems) g.fly = 1;
}

export function stepPickups(sim: DgSim): void {
  const h = sim.hero;
  if (h.dead) return;
  // сундук островка вернулся
  if (sim.isleT >= 0 && sim.t >= sim.isleT && LV.lake) {
    dropItem(sim, 'chest', LV.lake.chest.x, LV.lake.chest.z, 'isle');
    sim.isleT = -1;
  }
  const pr = pickupRadius(sim);
  const pr2 = pr * pr;
  const pull = hasBuff(sim, 'pull');
  const sp = D.hero.magnetPullSpeed * DT;
  const gems = sim.gems;
  let w = 0;
  for (let i = 0; i < gems.length; i++) {
    const g = gems[i];
    const dx = wrapD(h.x - g.x);
    const dz = wrapD(h.z - g.z);
    const d2 = dx * dx + dz * dz;
    if (!g.fly && (d2 < pr2 || pull)) g.fly = 1;
    if (g.fly) {
      const d = Math.sqrt(d2);
      if (d < 0.6 + sp) {
        addXp(sim, g.v);
        fx(sim, { k: 'pick', what: 'gem', x: g.x, z: g.z });
        continue;
      }
      g.x = wrapP(g.x + (dx / d) * sp * 1.4);
      g.z = wrapP(g.z + (dz / d) * sp * 1.4);
    }
    gems[w++] = g;
  }
  gems.length = w;

  const items = sim.items;
  w = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const dx = wrapD(h.x - it.x);
    const dz = wrapD(h.z - it.z);
    const r = it.k === 'chest' || it.k === 'bigchest' ? 1.4 : Math.max(1.2, pr * 0.6);
    if (dx * dx + dz * dz < r * r && sim.t - it.t0 > 10) {
      takeItem(sim, it);
      continue;
    }
    items[w++] = it;
  }
  items.length = w;
}

function takeItem(sim: DgSim, it: DgItem): void {
  fx(sim, { k: 'pick', what: it.k, x: it.x, z: it.z });
  switch (it.k) {
    case 'stew':
      healHero(sim, 30);
      break;
    case 'magnet':
      vacuum(sim);
      break;
    case 'hourglass':
      sim.freezeT = sim.t + ticks(6);
      break;
    case 'keg':
      kegBlast(sim);
      break;
    case 'chest':
      if (it.src === 'isle') sim.isleT = sim.t + ticks(LV.lake?.chest.respawn ?? 120);
      openChest(sim, it.src === 'map' ? 'plain' : it.src === 'isle' ? 'isle' : 'small');
      break;
    case 'bigchest':
      openChest(sim, 'big');
      break;
  }
}

/** Пороховой бочонок: рядовым −60 % макс. HP, элитам −10 %, боссу −3 % */
function kegBlast(sim: DgSim): void {
  const h = sim.hero;
  for (const m of sim.mobs) {
    if (m.die || m.under) continue;
    const frac = m.k === 'povidl' ? 0.03 : m.elite ? 0.1 : 0.6;
    hurtMob(sim, m, m.hpMax * frac, 'keg', h.x, h.z, 1, 0, 0);
  }
  fx(sim, { k: 'boom', x: h.x, z: h.z, r: 20, what: 'keg' });
}

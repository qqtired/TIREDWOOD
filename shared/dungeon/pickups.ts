// «Подземелье»: подборы — осколки опыта (магнит, слияние свыше 250), похлёбка, магнит, бочонок, часы, сундуки.
import { fx, healHero, hasBuff, hurtMob, newId, passiveLv } from './core.ts';
import { D, passiveDef } from './data.ts';
import { addXp, openChest } from './progress.ts';
import type { DgItem, DgSim } from './types.ts';
import { DT, ticks, wrapD, wrapP } from './util.ts';

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

export function dropItem(sim: DgSim, k: DgItem['k'], x: number, z: number): void {
  sim.items.push({ id: newId(sim), k, x: wrapP(x), z: wrapP(z), t0: sim.t });
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
      openChest(sim, 'small');
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

// Виртуальная команда в настоящей игре (агент fort). n ботов стоят на стенах крепости и бьют орду с силой
// защитника из модели экономики arsenal: power.total по волнам, то есть свой ствол, башни и гранаты, урон в секунду.
// Боты уходят из красных кругов и прыгают от колец (не всегда — по навыку), в передышку чинят ворота и лечат
// кристалл на свои очки. Сервер — настоящий FortGame: орда, боссы, десант, события. Итог — на какой волне пал
// кристалл, длина волн, ворота, гибели.
//   node tools/fort-balance/team-sim.ts --players 3 --skill experienced [--to 300] [--quiet] [--power power.json]
// Сила — из model.ts arsenal рядом (simulate(director, n, SKILLS[skill]).rows[].power.total) или из power.json:
// { "<n>": { "<skill>": [урон/с на 1-й волне, на 2-й, …] } }.
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { EYE_HEIGHT, TICK_RATE } from '../../shared/constants.ts';
import {
  FORT_WAVES, FT_BREAK, FT_END, FT_GATHER, FT_WAVE, ZK, ZS_BOSS_OPEN, ZS_BOSS_PULSE, ZS_QUAKE, ZS_STOMP, type FortEvent,
} from '../../shared/fort.ts';
import { ACT_CRYSTAL, ACT_GATE, crystalRows, gateRows } from '../../shared/fortarsenal.ts';
import { KF_AIR, Z_BOAT, isBossKind } from '../../shared/fortkinds.ts';
import { CRYSTAL, WALL_H } from '../../shared/fortmap.ts';
import { EV_NONE, isBossWave, isSuperWave } from '../../shared/fortwaves.ts';
import { DEFAULT_OUTFIT } from '../../shared/outfit.ts';
import { makeRng } from '../../shared/math.ts';
import { BTN_JUMP, makeInput, type Input } from '../../shared/sim.ts';
import { makeRayHit } from '../../shared/world.ts';
import { FortGame, type FortPlayer } from '../../server/fort/game.ts';
import type { Zombie } from '../../server/fort/horde.ts';

const { values: opt } = parseArgs({
  options: {
    power: { type: 'string' },
    players: { type: 'string', default: '3' },
    skill: { type: 'string', default: 'experienced' },
    to: { type: 'string', default: String(FORT_WAVES) },
    seed: { type: 'string', default: '7' },
    quiet: { type: 'boolean', default: false },
  },
});
const n = Math.max(1, Math.min(6, Number(opt.players)));
const skill = opt.skill as 'newbie' | 'experienced' | 'master';
let power: number[] | undefined;
if (opt.power) {
  const table = JSON.parse(fs.readFileSync(opt.power, 'utf8')) as Record<string, Record<string, number[]>>;
  power = table[String(n)]?.[skill];
} else {
  // модель arsenal (после слияния лежит рядом)
  const model = await import('./model.ts' as string) as { SKILLS: Record<string, unknown>; simulate: (d: unknown, n: number, s: unknown, w: number) => { rows: Array<{ power: { total: number } }> } };
  const { director } = await import('./fort-director.ts');
  power = model.simulate(director, n, model.SKILLS[skill], FORT_WAVES).rows.map((r) => r.power.total);
}
if (!power) throw new Error(`нет силы для ${n} / ${skill}`);
const dpsByWave: number[] = power;
const toWave = Number(opt.to);
/** Навык: доля голов, увернётся ли от круга, прыгнет ли от кольца, за сколько тиков до удара реагирует */
const SKILL = {
  newbie: { heads: 0.08, dodge: 0.4, jump: 0.3, react: 30 },
  experienced: { heads: 0.22, dodge: 0.8, jump: 0.7, react: 40 },
  master: { heads: 0.4, dodge: 0.95, jump: 0.95, react: 50 },
}[skill];

const rng = makeRng(Number(opt.seed));
const game = new FortGame();
/** Места на стенах: ворота, по бокам от них, южная (морская) стена — для четвёртого и для десанта */
const SPOTS: ReadonlyArray<readonly [number, number, number]> = [
  [0, WALL_H, -15.2], [-8, WALL_H, -15.2], [8, WALL_H, -15.2], [0, WALL_H, 12.6], [-12, WALL_H, -15.2], [12, WALL_H, -15.2],
];
const SEA_SPOT = (x: number): readonly [number, number, number] => [x < 0 ? -11 : 11, WALL_H, 12.6];

interface Bot {
  p: FortPlayer;
  spot: readonly [number, number, number];
  target: Zombie | null;
  retarget: number;
  budget: number;
  /** Уходит из круга до этого тика; прыгнет на этом тике */
  dodgeUntil: number;
  jumpAt: number;
  backAt: number;
}

const events: FortEvent[] = [];
const sink = { sendJson: (m: { t: string; e?: FortEvent[] }) => { if (m.t === 'fev' && m.e) events.push(...m.e); }, sendBinary() {}, close() {} };
const bots: Bot[] = [];
for (let i = 0; i < n; i++) {
  const p = game.addHuman({ pid: 1000 + i, nick: `Бот${i + 1}`, outfit: DEFAULT_OUTFIT }, sink as never)!;
  bots.push({ p, spot: SPOTS[i], target: null, retarget: 0, budget: 0, dodgeUntil: 0, jumpAt: -1, backAt: 0 });
}
const hit = makeRayHit();
const sim = game as unknown as { simulate(p: FortPlayer, i: Input): void; purchase(p: FortPlayer, buy: number, arg: number, calm: boolean): void };
const jump: Input = { ...makeInput(), buttons: BTN_JUMP };

function place(b: Bot, x: number, y: number, z: number): void {
  const s = b.p.state;
  s.x = x;
  s.y = y;
  s.z = z;
  s.vx = s.vy = s.vz = 0;
}

/** Видно ли: человек подходит к самому брустверу и выглядывает (глаз на 0,5 м выше, на 0,6 м к цели) */
function visible(b: Bot, z: Zombie): boolean {
  const s = b.p.state;
  const k = ZK[z.kind];
  const hx = z.x - s.x;
  const hz = z.z - s.z;
  const hd = Math.hypot(hx, hz) || 1;
  const ox = s.x + (hx / hd) * 0.6;
  const oy = s.y + EYE_HEIGHT + 0.5;
  const oz = s.z + (hz / hd) * 0.6;
  const dx = z.x - ox;
  const dy = z.y + k.hcy - oy;
  const dz = z.z - oz;
  const d = Math.hypot(dx, dy, dz);
  if (d < 1e-3) return true;
  return !game.world.raycast(ox, oy, oz, dx / d, dy / d, dz / d, Math.max(0, d - k.hrx), hit, true);
}

/**
 * Кого бить: открытый босс, потом — кто ближе к кристаллу и воротам; закрытый босс — когда больше некого. Волна
 * идёт дольше 60 с — человек ищет, откуда видно, и бьёт и тех, кого со своего места не видно.
 */
function pick(b: Bot): Zombie | null {
  const s = b.p.state;
  const hunt = game.tick - waveStart > 60 * TICK_RATE;
  let best: Zombie | null = null;
  let bs = Infinity;
  for (const z of game.horde.zombies) {
    if (!z.alive) continue;
    const range = Math.hypot(z.x - s.x, z.z - s.z);
    if (range > 75) continue;
    const boss = isBossKind(z.kind);
    let score = Math.hypot(z.x - CRYSTAL.x, z.z - CRYSTAL.z);
    if (boss) score += z.state === ZS_BOSS_OPEN ? -200 : 40;
    if (z.kind === Z_BOAT) score += 25;
    if (score >= bs || (!hunt && !visible(b, z))) continue;
    best = z;
    bs = score;
  }
  return best;
}

function stepBots(): void {
  const w = Math.max(1, game.wave);
  const dps = dpsByWave[Math.min(dpsByWave.length, w) - 1];
  const boats = game.horde.zombies.some((z) => z.alive && z.kind === Z_BOAT);
  for (let i = 0; i < bots.length; i++) {
    const b = bots[i];
    const p = b.p;
    if (!p.alive) {
      b.backAt = game.tick + 3 * TICK_RATE;
      continue;
    }
    // встал на террасе — через 3 с снова на своём месте (дошёл)
    if (b.backAt && game.tick >= b.backAt) {
      b.backAt = 0;
      const spot = boats && i === bots.length - 1 && n >= 2 ? SEA_SPOT(game.horde.zombies.find((z) => z.alive && z.kind === Z_BOAT)!.x) : b.spot;
      place(b, spot[0], spot[1], spot[2]);
    }
    if (b.jumpAt === game.tick) sim.simulate(p, jump);
    if (b.dodgeUntil && game.tick >= b.dodgeUntil) {
      b.dodgeUntil = 0;
      place(b, b.spot[0], b.spot[1], b.spot[2]);
    }
    // стрельба: 10 выстрелов в секунду, урон — сила защитника
    b.budget += dps / TICK_RATE;
    if (game.tick % 6 !== i % 6) continue;
    if (!b.target?.alive || --b.retarget <= 0) {
      b.target = pick(b);
      b.retarget = 5;
    }
    const z = b.target;
    if (!z) {
      b.budget = 0;
      continue;
    }
    const k = ZK[z.kind];
    const head = rng() < SKILL.heads && !(k.flags & KF_AIR);
    const s = p.state;
    game.horde.damage(z, b.budget, p.id, head, z.x, z.y + k.hcy, z.z, s.x, s.z);
    b.budget = 0;
  }
}

/** Метки атак: в круге — уйти вдоль стены (по навыку), от колец топота, землетрясения и волны — прыгнуть */
function react(): void {
  for (const e of events) {
    if (e[0] !== 'warn') continue;
    const [, , attack, x, y, z, r, end] = e;
    for (const b of bots) {
      const s = b.p.state;
      if (!b.p.alive || Math.abs(s.y - y) > 2.6 || Math.hypot(s.x - x, s.z - z) > r + 0.4) continue;
      const ring = attack === ZS_STOMP || attack === ZS_QUAKE || attack === ZS_BOSS_PULSE;
      if (ring) {
        if (rng() < SKILL.jump) b.jumpAt = Math.max(game.tick + 1, end - 8);
        continue;
      }
      if (rng() >= SKILL.dodge) continue;
      const side = s.x >= x ? 1 : -1;
      const nx = Math.max(-14, Math.min(14, x + side * (r + 1.2)));
      const fx = Math.abs(nx - x) < r + 0.5 ? x - side * (r + 1.2) : nx;
      place(b, fx, s.y, s.z);
      b.dodgeUntil = Math.max(game.tick + 1, end + 6);
    }
  }
  events.length = 0;
}

/** Передышка: на свои очки — новые ворота, починка ворот и кристалла; потом все в колокол (3 с) */
/** Покупка у ворот и кристалла за золото арсенала, как из панели, но без похода к стойке */
const ars = game.arsenal as unknown as {
  apply(p: FortPlayer, id: number, price: number): void;
  teamView(): { wave: number; calm: boolean; gold: number; gate: number; gateTier: number; crystal: number; crystalTier: number };
  gateMax: number;
  crystalMax: number;
};
function buy(p: FortPlayer, id: number): boolean {
  const a = p.run.arsenal;
  const v = { ...ars.teamView(), gold: a.gold };
  const row = id >= ACT_CRYSTAL ? crystalRows(v)[id - ACT_CRYSTAL] : gateRows(v)[id - ACT_GATE];
  if (!row || row.locked || row.price > a.gold) return false;
  a.gold -= row.price;
  ars.apply(p, id, row.price);
  return true;
}

/** Передышка: новые ворота, ремонт до 80 %, кристалл до 90 % — сила (стволы, башни) уже в модели arsenal */
function shop(): void {
  for (const b of bots) {
    const p = b.p;
    if (game.gate <= 0) buy(p, ACT_GATE + 2);
    for (let i = 0; i < 4 && game.gate > 0 && game.gate < ars.gateMax * 0.8; i++) if (!buy(p, ACT_GATE)) break;
    for (let i = 0; i < 9 && game.crystal < ars.crystalMax * 0.9; i++) if (!buy(p, ACT_CRYSTAL)) break;
  }
  game.phaseEnd = Math.min(game.phaseEnd, game.tick + 3 * TICK_RATE);
  for (const b of bots) {
    b.backAt = 0;
    place(b, b.spot[0], b.spot[1], b.spot[2]);
  }
}

interface Row { w: number; s: number; gate: number; crys: number; deaths: number; ev: number; tag: string }
const rows: Row[] = [];
let waveStart = 0;
let deaths0 = 0;
let lastPhase = -1;
let lost = 0;
const t0 = Date.now();
game.phaseEnd = game.tick + 2;
for (const b of bots) place(b, b.spot[0], b.spot[1], b.spot[2]);
for (let guard = 0; guard < 60 * 60 * 60 * 30; guard++) {
  game.step();
  if (game.phase === FT_WAVE) {
    react();
    stepBots();
    // застряло: волна идёт 5 минут — показать, кто остался
    if (game.tick - waveStart === 300 * TICK_RATE) {
      const left = game.horde.zombies.filter((z) => z.alive).map((z) => `${ZK[z.kind].name} ${z.state} (${z.x.toFixed(1)}, ${z.y.toFixed(1)}, ${z.z.toFixed(1)}) ${z.hp.toFixed(0)}/${z.maxHp.toFixed(0)}`);
      console.log(`w${game.wave}: 5 минут, осталось ${game.horde.left}, живых: ${left.join(' · ')}`);
      break;
    }
  } else events.length = 0;
  if (game.phase !== lastPhase) {
    if (game.phase === FT_WAVE) {
      waveStart = game.tick;
      deaths0 = bots.reduce((a, b) => a + b.p.deaths, 0);
    } else if (lastPhase === FT_WAVE) {
      const w = game.phase === FT_END ? game.wave : game.cleared;
      const deaths = bots.reduce((a, b) => a + b.p.deaths, 0) - deaths0;
      rows.push({ w, s: (game.tick - waveStart) / TICK_RATE, gate: game.gate / ars.gateMax, crys: game.crystal / ars.crystalMax, deaths, ev: game.lastEvent.wave === w ? game.lastEvent.kind : EV_NONE,
        tag: isSuperWave(w) ? 'S' : isBossWave(w) ? 'B' : '' });
      if (!opt.quiet || w % 10 === 0) {
        const r = rows[rows.length - 1];
        console.log(`w${String(w).padStart(3)}${r.tag.padEnd(1)} ${r.s.toFixed(0).padStart(3)} с · ворота ${(r.gate * 100).toFixed(0).padStart(3)} % · кристалл ${(r.crys * 100).toFixed(0).padStart(3)} % · гибелей ${r.deaths}${r.ev ? ` · событие ${r.ev}` : ''}`);
      }
      if (game.phase === FT_END) {
        if (game.crystal <= 0) lost = w;
        break;
      }
      if (w >= toWave) break;
    }
    if (game.phase === FT_BREAK) shop();
    if (game.phase === FT_GATHER) game.phaseEnd = game.tick + 2;
    lastPhase = game.phase;
  }
}
const waves = rows.filter((r) => !lost || r.w < lost);
const avg = waves.reduce((a, r) => a + r.s, 0) / Math.max(1, waves.length);
console.log(`\n${n} × ${skill}: ${lost ? `кристалл пал на волне ${lost}` : `дошли до ${rows[rows.length - 1]?.w ?? 0}`} · средняя волна ${avg.toFixed(0)} с · гибелей ${rows.reduce((a, r) => a + r.deaths, 0)} · ${((Date.now() - t0) / 1000).toFixed(0)} с счёта`);

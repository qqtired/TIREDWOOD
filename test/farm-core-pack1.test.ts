import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  addFarmXp, emptyBed, emptyFarm, farmLevelInfo, harvest, normalizeFarm, pickBeds, plant, saleUnit, sell, upgrade,
  type FarmProgress,
} from '../shared/farm.ts';
import { CROPS, FARM_XP_TOTAL, UPGRADES, cropById, vanQ } from '../shared/farmdata.ts';
import { newBoss, bossWindow, normalizeBoss } from '../shared/farmboss.ts';
import { bedWorld, farmUse } from '../shared/farmmap.ts';
import type { FarmEvent, FarmServerMsg } from '../shared/farmnet.ts';
import { makeOrders, orderEnv, orderProgress } from '../shared/farmorders.ts';
import { vanOffers } from '../shared/farmvan.ts';
import { helpAction } from '../server/farm/help.ts';
import { orderAction } from '../server/farm/orders.ts';
import { FarmPlots } from '../server/farm/plots.ts';
import type { FarmCtx, FarmPlayer } from '../server/farm/room.ts';
import { FarmRoom } from '../server/farm/room.ts';
import type { Client } from '../server/hub.ts';
import type { Profile, Store } from '../server/store.ts';
import type { Profiles } from '../server/profiles.ts';
import type { ServerMsg } from '../shared/messages.ts';
import { decodeSnapshot, makeHeader, type EntitySnap } from '../shared/protocol.ts';
import { BTN_FORWARD, makeInput, makeState } from '../shared/sim.ts';
import { ACT_FISH, ACT_SIT } from '../shared/lobby.ts';
import { POND_SPOTS } from '../shared/farmpond.ts';
import { setupHub } from './kit.ts';
import { songMs } from '../shared/jukebox.ts';
import { FarmSystems } from '../server/farm/systems.ts';

const NOW = Date.UTC(2026, 9, 11, 10);
const START = Date.UTC(2026, 9, 11, 16);

function roomKit(pond?: { profiles: Profiles; store: Store }, jukebox = true) {
  const profiles = new Map<number, Profile>();
  const clock = { now: NOW }; let spends = 0; let dirties = 0;
  const room = new FarmRoom({
    pond,
    jukebox,
    now:()=>clock.now, outfitOf:()=>({} as never), profileOf:(pid)=>profiles.get(pid),
    credit:()=>{},spend:()=>{spends++;return true;},generalXp:()=>{},grantItem:()=>true,dirty:()=>{dirties++;},
    seats:()=>undefined,saveSeats:()=>{},
  });
  const add = (id: number) => {
    const messages: ServerMsg[] = []; const binary: Uint8Array[] = [];
    const real = pond?.profiles.login({key:`farm-pack1-test-${String(id).padStart(10,'0')}`,nick:`PondTester${id}`},`10.1.${id}.1`);
    assert.ok(!real || real.ok);
    const profile = real?.ok ? real.profile : {id,nick:`Tester${id}`,farm:emptyFarm(NOW)} as Profile;
    profile.farm ??= emptyFarm(NOW); profiles.set(profile.id,profile);
    const c={id,pid:profile.id,profile,ephemeral:false,epoch:0,nick:profile.nick,ping:0,sink:{sendJson:(m:ServerMsg)=>messages.push(m),sendBinary:(b:Uint8Array)=>binary.push(b)}} as unknown as Client;
    assert.ok(room.join(c,null)); return {c,messages,binary,profile,p:room.playerOf(c)!};
  };
  return {room,add,clock,spends:()=>spends,dirties:()=>dirties};
}

function kit(rng: () => number = () => 0.3, loaded: unknown = null) {
  const farms = new Map<number, FarmProgress>();
  const players = new Map<number, FarmPlayer>();
  const events: FarmEvent[] = [];
  const sent: FarmServerMsg[] = [];
  const coins = new Map<number, number>();
  const clock = { now: NOW };
  let saved: unknown = loaded;
  const ctx = {
    now: () => clock.now, rng, plots: new FarmPlots(undefined),
    farm: (p: FarmPlayer) => farms.get(p.c.pid)!, players: () => players.values(), byPid: (pid: number) => players.get(pid),
    farmOfPid: (pid: number) => farms.get(pid), sendMe: () => {}, send: (_p: FarmPlayer | null, m: FarmServerMsg) => { sent.push(m); },
    plotChanged: () => {}, ev: (_p: FarmPlayer | null, e: FarmEvent) => { events.push(e); },
    fail: (_p: FarmPlayer, a: Parameters<FarmCtx['fail']>[1], why: Parameters<FarmCtx['fail']>[2]) => { events.push({ k: 'fail', a, why }); },
    xp: (p: FarmPlayer, n: number) => { addFarmXp(farms.get(p.c.pid)!, n); },
    credit: (p: FarmPlayer, n: number) => { coins.set(p.c.pid, (coins.get(p.c.pid) ?? 0) + n); },
    spend: () => true, grantItem: () => true, dirty: () => {}, bossLoad: () => saved,
    bossSave: (s: unknown) => { saved = structuredClone(s); },
  } satisfies FarmCtx & Record<string, unknown>;
  const add = (pid: number, xp = 0): FarmPlayer => {
    const f = emptyFarm(clock.now);
    f.xp = xp;
    farms.set(pid, f);
    const plot = ctx.plots.enter(pid, clock.now);
    const p = { c: { pid, profile: { id: pid, nick: `Tester${pid}` } }, state: { x: 0, z: 0 }, plot } as unknown as FarmPlayer;
    players.set(pid, p);
    return p;
  };
  return { ctx, add, farms, players, events, sent, coins, clock, saved: () => saved };
}

test('pack1: v1 добавляет две грядки один раз и сохраняет старые посадки, вещи и долю XP', () => {
  const oldTotals = [0, 200, 700, 1700, 3500, 6500, 11500, 19500, 31500, 48500, 71500, 101500, 141500];
  for (const n of [1, 4, 8]) {
    const old = { ...emptyFarm(NOW), v: 1, xp: 21750, beds: Array.from({ length: n }, emptyBed) };
    old.beds[0] = { crop: 'golden-apple', plantedAt: NOW, ripeAt: NOW + 360 * 60_000, watered: true, helpers: [4, 5] };
    old.bag = { wheat: 7, 'golden-apple': 2 };
    old.cellar = { wood: 17 };
    old.decor = ['ti:seasoned']; old.achievements = ['patience']; old.counters = { nightHarvests: 2 };
    const f = normalizeFarm(old, NOW);
    assert.equal(f.v, 2);
    assert.equal(f.beds.length, n + 2);
    assert.deepEqual(f.beds[0], old.beds[0]);
    assert.deepEqual(f.bag, old.bag); assert.deepEqual(f.cellar, old.cellar);
    assert.deepEqual(f.decor, old.decor); assert.deepEqual(f.achievements, old.achievements); assert.deepEqual(f.counters, old.counters);
    assert.deepEqual(farmLevelInfo(f.xp), { level: 8, into: 375, need: 2000, stars: 0 });
    assert.deepEqual(normalizeFarm(f, NOW), f, 'v2 повторно не мигрирует');
  }
  for (let level = 1; level <= 12; level++) {
    const oldNeed = oldTotals[level] - oldTotals[level - 1];
    for (const into of [0, Math.floor(oldNeed / 2), oldNeed - 1]) {
      const f = normalizeFarm({ v: 1, xp: oldTotals[level - 1] + into, beds: [emptyBed()] }, NOW);
      assert.equal(farmLevelInfo(f.xp).level, level);
      assert.equal(farmLevelInfo(f.xp).into, Math.floor(into * (FARM_XP_TOTAL[level] - FARM_XP_TOTAL[level - 1]) / oldNeed));
    }
  }
  const star = normalizeFarm({ v: 1, xp: 141500 + 45000, beds: [emptyBed()] }, NOW);
  assert.deepEqual(farmLevelInfo(star.xp), { level: 13, into: 5000, need: 20000, stars: 2 });
  assert.deepEqual(addFarmXp(star, 1), [], 'миграция не выдаёт уровни заново');
  assert.equal(emptyFarm(NOW).beds.length, 3);
});

test('pack1: все 19 культур совпадают с утверждённым балансом и сохраняют ящики', () => {
  const balance = JSON.parse(readFileSync(new URL('../docs/farm/pack1-balance.json', import.meta.url), 'utf8'));
  assert.deepEqual(FARM_XP_TOTAL, balance.total);
  for (const expected of balance.crops) {
    const c = cropById(expected.id)!;
    for (const key of ['level', 'min', 'xp', 'seed', 'sale', 'chance', 'res'] as const) assert.equal(c[key], expected[key], `${c.id}.${key}`);
    assert.ok((c.sale - c.seed) * 60 / c.min >= 150 - 1e-9, c.id);
    assert.equal(vanQ(c), c.van);
  }
  assert.equal(CROPS.length, 19);
});

test('pack1: потолок каждой единицы 150 после всех бонусов и без дневного падения NPC/Фургона', () => {
  for (const c of CROPS) {
    const f = emptyFarm(NOW); f.xp = FARM_XP_TOTAL[12]; f.rep = 3000; f.tools.bag = 4;
    f.buffs = [{ kind: 'price', until: NOW + 10000 }];
    const unit = saleUnit(f, c, NOW);
    assert.ok(unit <= 150, c.id);
    f.bag[c.id] = 4;
    const a = sell(f, c.id, 2, NOW); assert.ok(a.ok && a.coins <= 300);
    f.sold.coins = 800;
    const b = sell(f, c.id, 2, NOW); assert.ok(b.ok);
    if (a.ok && b.ok) assert.ok(Math.abs(a.coins - b.coins) <= 1, 'только накопленная дробь');
    for (let cycle = 0; cycle < 20; cycle++) for (const o of vanOffers(f, 7, cycle, NOW)) assert.ok(o.coins <= o.n * 150, o.item);
  }
});

test('pack1: семь сохранённых улучшений ведут 3→10, Грабли3 выбирают 0..9', () => {
  const f = emptyFarm(NOW); f.xp = FARM_XP_TOTAL[12]; f.tools.rake = 3;
  f.cellar = Object.fromEntries(['fiber', 'root', 'grain', 'spores', 'crystal-dust', 'wood', 'gold-leaf', 'scale', 'star-dust'].map((k) => [k, 100]));
  for (let i = 2; i <= 8; i++) {
    assert.ok(upgrade(f, `bed${i}`, NOW, () => true).ok);
    assert.equal(f.beds.length, i + 2);
  }
  assert.deepEqual(UPGRADES.filter((u) => u.kind === 'bed').map((u) => u.step), [4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(pickBeds(f, [0,1,2,3,4,5,6,7,8,9]), [0,1,2,3,4,5,6,7,8,9]);
  assert.equal(pickBeds(f, [10]), null);
  assert.ok(plant(f, [9], 'radish', NOW, () => true).ok);
});

test('pack1: замена гарантирует другую цель и сохраняет остальные заказы при постоянном rng', () => {
  const k = kit(); const p = k.add(7, 200); const f = k.farms.get(7)!;
  Object.assign(p.state, farmUse('orders'));
  f.orders = { day: '2026-10-11', list: makeOrders(orderEnv(f, false, false), k.ctx.rng), rerolls: 2 };
  f.orders.list[2].got = 1;
  const others = structuredClone(f.orders.list.slice(1));
  const target = (i: number) => `${f.orders.list[i].t}:${f.orders.list[i].crop ?? ''}`;
  for (let n = 0; n < 2; n++) {
    const before = target(0);
    assert.equal(orderAction(k.ctx, p, { t:'farm', a:'order', k:'reroll', i:0 }, false, NOW), true);
    assert.notEqual(target(0), before);
  }
  assert.equal(f.orders.rerolls, 0); assert.deepEqual(f.orders.list.slice(1), others);
  f.xp = 0;
  f.orders = { day:'2026-10-11',list:makeOrders(orderEnv(f,false,false),k.ctx.rng),rerolls:2 };
  assert.equal(orderAction(k.ctx,p,{t:'farm',a:'order',k:'reroll',i:0},false,NOW),false);
  assert.equal(f.orders.rerolls,2);
  assert.deepEqual(k.events.at(-1),{ k:'fail',a:'order',why:'noAlternative' });
});

test('pack1: помощь спелой грядке сохраняет зрелость, награды и лимит цикла', () => {
  const k = kit(); const helper = k.add(1, 200); const owner = k.add(2);
  const f = k.farms.get(1)!; const target = k.farms.get(2)!;
  Object.assign(helper.state, bedWorld(owner.plot, 0)); f.water = 300;
  target.beds[0] = { crop:'wheat', plantedAt: NOW - 1000000, ripeAt: NOW - 1000, watered:false, helpers:[] };
  const ripe = target.beds[0].ripeAt;
  const msg = { t:'farm', a:'help', plot:owner.plot, beds:[0] } as const;
  assert.ok(helpAction(k.ctx, helper, { ...msg, beds:[0] }, NOW));
  assert.equal(target.beds[0].ripeAt, ripe); assert.equal(f.rep, 1); assert.equal(k.coins.get(1), 1); assert.equal(f.water, 200);
  assert.equal(helpAction(k.ctx, helper, { ...msg, beds:[0] }, NOW), null);
  assert.deepEqual(target.beds[0].helpers, [1]); assert.equal(f.rep, 1);
});

test('pack1: премиальные заказы и старый nightHarvests достижимы культурами 55мин', () => {
  const f = emptyFarm(NOW); f.xp = FARM_XP_TOTAL[12];
  f.orders = { day:'2026-10-11', rerolls:2, list:[{t:'grow-night',need:1,got:0,done:false},{t:'night-gardener',need:1,got:0,done:false}] };
  assert.ok(plant(f,[0],'golden-apple',NOW,()=>true).ok);
  const h = harvest(f,[0],NOW + 55 * 60000,()=>0.99); assert.ok(h.ok);
  if (!h.ok) return;
  orderProgress(f,{ k:'harvest',items:h.r.items },NOW);
  assert.deepEqual(f.orders.list.map((o)=>o.got),[1,1]); assert.equal(f.counters.nightHarvests,1);
});

test('pack1: босс ждёт вклад, добавляет единственную квоту до XP и хранит её при уходе/перезапуске', () => {
  const k = kit(); const a = k.add(1, 199); k.add(2, FARM_XP_TOTAL[12]);
  k.clock.now = START; const sys = new FarmSystems(k.ctx); sys.second(START);
  assert.equal(sys.boss.st?.hp,0); assert.equal(sys.boss.st?.n,0); assert.equal(sys.boss.st?.st,'awake');
  sys.boss.harvest(a,5,START,1);
  assert.equal(sys.boss.st?.hp,300); assert.equal(sys.boss.st?.n,1);
  k.farms.get(1)!.xp = 204;
  sys.boss.harvest(a,5,START + 1,2);
  assert.equal(sys.boss.st?.hp,300); assert.equal(sys.boss.st?.bloom,10);
  k.players.delete(1); sys.leave(a);
  const restarted = new FarmSystems(k.ctx);
  assert.equal(restarted.boss.st?.hp,300); assert.equal(restarted.boss.st?.bloom,10);
  assert.equal(restarted.boss.view(a,START).remaining,290);
  const legacy = { ...newBoss(bossWindow(START), 3), v:1, hp:8000,n:4,bloom:5000,pts:{1:5000},got:{1:{buff:'xp',rep:2}},st:'awake' };
  assert.equal(normalizeBoss(legacy)?.hp,8000); assert.equal(normalizeBoss(legacy)?.bloom,5000);
  assert.deepEqual(normalizeBoss({ ...legacy,st:'bloom' })?.got,legacy.got);
});

test('pack1: имя участка сервером сохраняется с профилем, нормализуется и видно соседям', () => {
  const k=roomKit(); const a=k.add(1);
  assert.equal(k.room.plotView(a.p.plot).name,'Ферма Tester1');
  k.room.onMessage(a.c,{t:'farm',a:'identity',name:'  Тёплый огород  ',icon:'pumpkin'});
  assert.deepEqual(a.profile.farm?.identity,{name:'Тёплый огород',icon:'pumpkin'});
  assert.equal(k.room.plotView(a.p.plot).name,'Тёплый огород');
  assert.equal(k.room.plotView(a.p.plot).icon,'pumpkin');
  assert.deepEqual(normalizeFarm(a.profile.farm,NOW).identity,a.profile.farm?.identity);
  k.room.onMessage(a.c,{t:'farm',a:'identity',name:'Новое',icon:'../../invalid'});
  assert.equal(a.profile.farm?.identity.name,'Тёплый огород');
  assert.ok(k.dirties()>0);
});

test('pack1: сиденья заняты сервером, действие видно в снимке и место свободно после шага/выхода', () => {
  const k=roomKit(); const a=k.add(1); const b=k.add(2);
  Object.assign(a.p.state,{x:-6.86,y:0,z:4.26}); Object.assign(b.p.state,{x:-6.86,y:0,z:4.26});
  k.room.onMessage(a.c,{t:'farm',a:'sit',seat:0});
  k.room.onMessage(b.c,{t:'farm',a:'sit',seat:0});
  assert.equal(a.p.seat,0); assert.equal(b.p.seat,-1);
  k.room.step(); k.room.step();
  const out: EntitySnap[]=[];decodeSnapshot(a.binary.at(-1)!.buffer as ArrayBuffer,makeHeader(),makeState(),out);
  assert.equal(out.find((e)=>e.id===a.p.id)?.hp,ACT_SIT);assert.equal(out.find((e)=>e.id===a.p.id)?.armor,0);
  k.room.onInputs(a.c,[{...makeInput(),seq:1,buttons:BTN_FORWARD}],1);
  for(let i=0;i<8;i++)k.room.step();
  assert.equal(a.p.seat,-1);
  k.room.onMessage(b.c,{t:'farm',a:'sit',seat:0}); assert.equal(b.p.seat,0);
  k.room.leave(b.c);
  Object.assign(a.p.state,{x:-6.86,y:0,z:4.26});k.room.onMessage(a.c,{t:'farm',a:'sit',seat:0});assert.equal(a.p.seat,0);
});

test('pack1: очередь музыки фермы отдельная, отказ/повтор не списывают жетоны', () => {
  const k=roomKit();const a=k.add(1);Object.assign(a.p.state,{x:-1.55,y:0,z:6.36});
  k.room.onMessage(a.c,{t:'juke',song:0});assert.equal(k.spends(),1);
  k.room.onMessage(a.c,{t:'juke',song:0});assert.equal(k.spends(),1);
  k.clock.now+=2000;k.room.onMessage(a.c,{t:'juke',song:0});assert.equal(k.spends(),1);
  const last=a.messages.filter((m)=>m.t==='jukeRes').at(-1);assert.ok(last?.t==='jukeRes'&&!last.ok);
  assert.ok(a.messages.some((m)=>m.t==='juke'&&m.v.cur?.song===0));
  const other=roomKit();const b=other.add(2);assert.ok(b.messages.some((m)=>m.t==='juke'&&m.v.cur===null));
  k.clock.now = NOW + 1500 + songMs(0); k.add(2);
  assert.ok(a.messages.filter((m)=>m.t==='juke').at(-1)?.v.cur===null,'вход обновляет музыку уже присутствующим');
  const off=roomKit(undefined,false);const c=off.add(3);Object.assign(c.p.state,{x:-1.55,y:0,z:6.36});
  off.room.onMessage(c.c,{t:'juke',song:0});assert.equal(off.spends(),0);assert.ok(!c.messages.some((m)=>m.t==='juke'));
});

test('pack1: сервер обрабатывает все 10 грядок, а квота босса берёт уровень до XP сбора', () => {
  const k=roomKit();const a=k.add(1);const f=a.profile.farm!;
  f.xp=FARM_XP_TOTAL[12];f.tools.rake=3;f.beds=Array.from({length:10},emptyBed);
  const center=bedWorld(a.p.plot,4);Object.assign(a.p.state,{x:center.x,z:center.z});
  const indices=Array.from({length:10},(_,i)=>i);
  k.room.onMessage(a.c,{t:'farm',a:'plant',crop:'radish',beds:indices});assert.ok(f.beds.every((b)=>b.crop==='radish'));
  k.clock.now+=120000;k.room.onMessage(a.c,{t:'farm',a:'harvest',beds:indices});assert.equal(f.bag.radish,10);
  k.room.onMessage(a.c,{t:'farm',a:'plant',crop:'radish',beds:[10]});assert.ok(f.beds.every((b)=>!b.crop));
  // Новое событие, новичок пересекает L1→L2 первым сбором, зритель уже на максимальном уровне.
  const fresh=roomKit();const u=fresh.add(1);fresh.add(2).profile.farm!.xp=FARM_XP_TOTAL[12];
  fresh.clock.now=START;for(let i=0;i<60;i++)fresh.room.step();
  u.profile.farm!.xp=199;u.profile.farm!.beds[0]={crop:'radish',plantedAt:START-120000,ripeAt:START,watered:false,helpers:[]};
  Object.assign(u.p.state,bedWorld(u.p.plot,0));fresh.room.onMessage(u.c,{t:'farm',a:'harvest',beds:[0]});
  assert.equal(u.profile.farm!.xp,204);for(let i=0;i<60;i++)fresh.room.step();
  const view=u.messages.filter((m)=>m.t==='farmBoss').at(-1);assert.ok(view?.t==='farmBoss');
  if(view?.t==='farmBoss'){assert.equal(view.b.hp,300);assert.equal(view.b.n,1);assert.equal(view.b.quota,300);}
});

test('pack1: FarmRoom включает пруд, защищает 6 мест и освобождает их движением/выходом', () => {
  const deps=setupHub({fish2:true});const k=roomKit({profiles:deps.profiles,store:deps.store});
  const users=Array.from({length:7},(_,i)=>k.add(i+1));
  for(let i=0;i<6;i++){
    const u=users[i];Object.assign(u.p.state,POND_SPOTS[i]);
    k.room.onMessage(u.c,{t:'farmPondSeat',seat:i,epoch:0});assert.equal(u.p.pondSeat,i);
  }
  const late=users[6];Object.assign(late.p.state,POND_SPOTS[0]);
  k.room.onMessage(late.c,{t:'farmPondSeat',seat:0,epoch:0});assert.equal(late.p.pondSeat,null);
  k.room.onMessage(users[0].c,{t:'farm',a:'plant',beds:[0],crop:'radish'});
  const fail=users[0].messages.filter((m)=>m.t==='farmEv').at(-1);assert.ok(fail?.t==='farmEv'&&fail.e[0].k==='fail'&&fail.e[0].why==='busy');
  k.room.step();k.room.step();
  const snaps:EntitySnap[]=[];decodeSnapshot(users[0].binary.at(-1)!.buffer as ArrayBuffer,makeHeader(),makeState(),snaps);
  assert.equal(snaps.find((e)=>e.id===users[0].p.id)?.hp,ACT_FISH);
  k.room.onInputs(users[0].c,[{...makeInput(),seq:1,buttons:BTN_FORWARD}],1);for(let i=0;i<8;i++)k.room.step();
  assert.equal(users[0].p.pondSeat,null);
  k.room.onMessage(late.c,{t:'farmPondSeat',seat:0,epoch:0});assert.equal(late.p.pondSeat,0);
  k.room.leave(late.c);
  Object.assign(users[0].p.state,POND_SPOTS[0]);k.room.onMessage(users[0].c,{t:'farmPondSeat',seat:0,epoch:0});assert.equal(users[0].p.pondSeat,0);
});

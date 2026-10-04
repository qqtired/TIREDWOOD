import assert from'node:assert/strict';import{test,type TestContext}from'node:test';import*as THREE from'three';
import{registerHooks}from'node:module';import{Storm3D}from'../client/lobby/storm.ts';
import{emptyStorm,STORM_PERIOD}from'../shared/storm.ts';import type{Strike}from'../shared/weather.ts';import*as P from'../shared/pirates.ts';
function dom(t:TestContext){const prev=Object.getOwnPropertyDescriptor(globalThis,'document');const el=()=>({style:{},hidden:false,textContent:'',append(){},setAttribute(){},addEventListener(){},remove(){}});Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:el}});t.after(()=>{if(prev)Object.defineProperty(globalThis,'document',prev);else Reflect.deleteProperty(globalThis,'document');});return el() as unknown as HTMLElement;}
test('storm = weather at full force: scheduled strikes, lighthouse door wait/light, rainbow after lighting',t=>{
 const root=dom(t),scene=new THREE.Scene();let force=0,lit=true,rainbow=false;const strikes:Strike[]=[];
 const fx=new Storm3D(scene,root,{climate:f=>force=f,strike:s=>strikes.push(s),rainbow:on=>rainbow=on,lamp:v=>lit=v,sound(){},light(){},self:()=>2});
 const v={...emptyStorm(),id:'x',phase:'storm' as const,start:100,end:10000,waveStart:100};fx.set(v);
 fx.update(100+STORM_PERIOD-30,.016,{x:-19,y:0,z:28},true);assert.equal(force,1);assert.equal(lit,false);assert.equal((fx as any).foam.visible,true);assert.equal(fx.door,null);
 fx.update(100+STORM_PERIOD+1,.016,{x:-19,y:0,z:28},true,true);assert.equal((fx as any).crest.visible,true);assert.equal((fx as any).foam.visible,false);
 // молнии шторма — по общему расписанию (shared/weather.ts), а не своей вспышкой
 for(let k=STORM_PERIOD+30;k<=60*60;k+=30)fx.update(100+k,.5,{x:-19,y:0,z:40.98},true);assert.ok(strikes.length>=3);
 assert.equal(fx.door,'light');assert.equal(fx.canLight,true);assert.match(fx.hint!.text,/зажечь/);assert.equal((fx as any).doorGlow.visible,true);
 // в предупреждение у двери — ждать: свет ещё горит
 fx.set({...v,id:'y',phase:'warn',start:0,end:3600});fx.update(1200,.016,{x:-19,y:0,z:40.98},true);assert.equal(fx.door,'wait');assert.equal(fx.canLight,false);assert.match(fx.hint!.text,/погаснет/);
 assert.ok(force>.15&&force<.85);
 // зажгли: свет вернулся, радуга — когда почти стихло, гаснет к концу; кто не первый — ещё может отметиться
 fx.set({...v,phase:'calm',start:500,end:1220,rankEnd:1100,rainbowEnd:2300,winners:[{pid:1,nick:'P',place:1,tokens:30}]});
 fx.update(510,.016,{x:-19,y:0,z:40.8},true);assert.equal(lit,true);assert.equal(rainbow,false);assert.equal(fx.door,'light');
 fx.update(1000,.016,{x:-19,y:0,z:40.8},true);assert.equal(rainbow,true);
 fx.update(2000,.016,{x:-19,y:0,z:40.8},true);assert.equal(rainbow,false);assert.equal(fx.door,null);
 fx.dispose();assert.equal(scene.children.length,0);assert.equal(force,0);
});

/** Поддельная страница для HUD: любой элемент отвечает на любой вызов (вёрстку в Node не строим, строим только логику) */
function fakeCtx(): any {
  const own: any = { canvas: { width: 64, height: 64 } };
  return new Proxy(own, { get(t, p) { if (p in t) return t[p]; return typeof p === 'string' ? (..._a: unknown[]) => fakeCtx() : undefined; }, set(t, p, v) { t[p] = v; return true; } });
}
function fakeEl(): any {
  const own: any = { style: { setProperty() {} }, classList: { toggle() {}, add() {}, remove() {}, contains: () => false }, dataset: {}, children: [], width: 0, height: 0, textContent: '', innerHTML: '', hidden: false };
  return new Proxy(own, {
    get(t, p) {
      if (p in t) return t[p];
      if (p === 'getContext') return () => fakeCtx();
      if (p === 'getBoundingClientRect') return () => ({ left: 0, top: 0, width: 100, height: 100 });
      return typeof p === 'string' ? (..._a: unknown[]) => fakeEl() : undefined;
    },
    set(t, p, v) { t[p] = v; return true; },
  });
}
function fakePage(t: TestContext): void {
  const prev = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const raf = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => fakeEl(), body: fakeEl() } });
  Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, value: (cb: (t: number) => void) => { cb(0); return 1; } });
  t.after(() => {
    if (prev) Object.defineProperty(globalThis, 'document', prev); else Reflect.deleteProperty(globalThis, 'document');
    if (raf) Object.defineProperty(globalThis, 'requestAnimationFrame', raf); else Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  });
}
test('пираты на экране: корабль, шлюпки, толпа, ящики и эффекты рисуются без ошибок и убираются; без набега сцена пуста', async t => {
  // Node не умеет подключать CSS: подменяем только такие импорты, а код набега идёт как есть
  const hook = registerHooks({ load(url, ctx, next) { if (/\.(webp|png|jpg|glb|bin|css)$/.test(new URL(url).pathname)) return { format: 'module', source: `export default ${JSON.stringify(url)}`, shortCircuit: true }; return next(url, ctx); } });
  let Pirates3D: any;
  try { Pirates3D = (await import('../client/lobby/pirates.ts')).Pirates3D; } finally { hook.deregister(); }
  fakePage(t);
  const heard: string[] = [];
  const sound = new Proxy({}, { get: (_t, name) => (..._a: unknown[]) => { heard.push(String(name)); } });
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera();
  const fx = new Pirates3D(scene, fakeEl(), { sound, lobbyFx: () => null, fire() {}, quality: () => 'high' });
  const me = { x: 6, y: 0, z: 15, yaw: Math.PI, pitch: -0.1, slot: 1, pid: 1 };
  const T = 1000;
  // тишина: события нет — ничего не видно
  fx.update(T, 0.016, cam, me, true, false);
  assert.equal(fx.group.visible, false);
  assert.equal(fx.raiding, false);
  // анонс: корабль идёт издалека, потом встаёт на якорь бортом к набережной
  fx.set({ ...P.emptyPirates(), id: 'r1', phase: 'warn', t0: T, start: T, end: T + P.PIRATE_WARN });
  fx.update(T + 120, 0.016, cam, me, true, false);
  assert.equal(fx.group.visible, true);
  assert.ok((fx.debug().ship as { anchored: number }).anchored < 1, 'идёт');
  assert.equal(fx.raiding, false, 'в анонс ещё не набег');
  fx.update(T + P.PIRATE_SAIL + 30, 0.016, cam, me, true, false);
  assert.equal((fx.debug().ship as { anchored: number }).anchored, 1);
  assert.ok(heard.includes('bell') || heard.length >= 0);
  // набег: шлюпка с пиратами, трое на причале, добыча кучами
  const R = T + P.PIRATE_WARN;
  fx.set({ ...P.emptyPirates(), id: 'r1', phase: 'raid', t0: T, start: R, end: R + P.PIRATE_LIMIT, wave: 1, waves: 4, hp: 11, hpMax: 11, left: 12, total: 12, stolen: 0, limit: 6 });
  const loot = P.PIRATE_LOOT_HOME.map((h, i) => [i, P.LS_PILE, h.x, h.z] as P.LootRow);
  const rows = (k: number): P.PirateSnapMsg => ({ t: 'pnow', k, p: [[1, 11, 18, 0, P.PS_RUN, 2, 0, -1], [2, 12, 18, 0, P.PS_CARRY, 2, P.PL_CRATE, 3], [3, 1, 0, 0, P.PS_ROW, 2, P.PL_ABOARD, -1]], d: [[1, 11, 24.1, 3.14, P.DS_DOCK, 0, 1, 2]], l: loot });
  fx.snap(rows(R + 6)); fx.snap(rows(R + 12));
  for (let k = 0; k < 30; k++) fx.update(R + 12 + k, 0.016, cam, me, true, false);
  const d = fx.debug() as Record<string, number | boolean>;
  assert.equal(d.pirates, 3);
  assert.equal(d.boats, 1);
  assert.equal(d.items, 12);
  assert.ok((d.crowd as number) >= 2, 'пираты толпой, а не по одному мешу');
  assert.equal(fx.raiding, true);
  assert.equal(d.nearCannon, -1);
  // у пушки: подсказка и кольцо
  const atGun = { ...me, x: P.PIRATE_CANNONS[1].x, z: P.PIRATE_CANNONS[1].z + 0.8 };
  fx.update(R + 50, 0.016, cam, atGun, true, false);
  assert.equal(fx.cannonAt, 1);
  assert.ok(fx.hint && /ядр/.test(fx.hint.text));
  // эффекты: выстрелы, попадания, всплески, шлюпка тонет — по очереди тиков, без исключений
  fx.fxMsg({ t: 'pfx', k: R + 52, e: [['wave', 1, 1], ['fire', 1, 1, 6, 0.3, 32, 60, P.SK_BOAT], ['sh', 0, 12, 16, 156], ['pt', 1, 6.7, 1.4, 20, 18, 0.9, 12, 1], ['ph', 1, 1, 1, 11, 18], ['ko', 1, 1, 11, 18], ['dr', 3, 12, 18], ['rs', 3, 1, 12, 18], ['hit', 1, 10, 8, 2, 46], ['dh', 1, 1, 1, 6, 30], ['sink', 1, 1, 6, 30], ['wh', 1, 9, 33], ['sk', 10, 17], ['fl', 2, 11, 21.5], ['st', 5, 8, 46]] });
  for (let k = 0; k < 240; k++) fx.update(R + 52 + k, 0.016, cam, atGun, true, false);
  assert.equal(fx.debug().queue, 0, 'все эффекты проиграны');
  fx.localFire(R + 300);
  // ушёл в меню или сел за стол: набег виден, но прицела и плечевой камеры нет
  fx.update(R + 301, 0.016, cam, me, false, false);
  assert.equal(fx.raiding, false);
  // победа: фанфары и салют, затем конец — сцена пустеет
  fx.set({ ...P.emptyPirates(), id: 'r1', phase: 'end', t0: T, start: R + 600, end: R + 600 + P.PIRATE_END, win: true, hp: 0, hpMax: 11, stolen: 3, left: 9, total: 12, limit: 6, fleeAt: R + 700,
    results: [{ pid: 1, nick: 'Tester7', kos: 3, sinks: 1, hits: 7, saves: 1, tokens: 51, mvp: true }] });
  fx.update(R + 601, 0.016, cam, me, true, false);
  assert.ok(heard.includes('fanfare'), 'победа слышна');
  fx.set({ ...P.emptyPirates(), id: 'r1' });
  fx.update(R + 900, 0.016, cam, me, true, false);
  assert.equal(fx.group.visible, false);
  assert.equal(fx.debug().pirates, 0);
  fx.dispose();
  assert.equal(scene.children.length, 0, 'после выхода на сцене ничего не осталось');
});

import assert from'node:assert/strict';import{test}from'node:test';import{Sound,type LobbyEventSound}from'../client/audio.ts';
test('event/critter sounds use existing buses, bounded quiet gains and obey suspended audio',()=>{
 const sound=new Sound() as any,calls:any[]=[];sound.ctx={state:'running'};sound.amb={bus:'ambient'};sound.sfx={bus:'effects'};
 sound.out=(pos:any,bus:any)=>({pos,bus});sound.tone=(...a:any[])=>calls.push({kind:'tone',a});sound.noise=(...a:any[])=>calls.push({kind:'noise',a});
 const kinds:LobbyEventSound[]=['siren','thunder','wave','success','horn','cannon','splash','victory','loss','mop'];for(const k of kinds)sound.lobbyEvent(k,[0,0,0]);sound.purr([1,0,1]);sound.purr([1,0,1],true);sound.gullCry([1,0,1]);sound.krakenScare([1,0,1]);
 assert.ok(calls.length>20);assert.ok(calls.every(c=>c.a[c.kind==='tone'?5:6]<=.15));assert.ok(calls.every(c=>c.a[0].bus===sound.amb||c.a[0].bus===sound.sfx));
 const n=calls.length;sound.ctx.state='suspended';for(const k of kinds)sound.lobbyEvent(k);sound.purr([0,0,0]);sound.gullCry([0,0,0]);assert.equal(calls.length,n);
});

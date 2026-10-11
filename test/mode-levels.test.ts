import assert from 'node:assert/strict';
import { test } from 'node:test';
import { xpForLevel } from '../shared/levels.ts';
import { lastOf, login, setupHub, steps } from './kit.ts';

test('paintball welcomes and refreshes authoritative level, name and outfit for humans; bots stay level1', () => {
 const {hub,profiles}=setupHub();const a=login(hub,'LevelPaint');const p=a.c.profile!;p.level=5;p.xp=xpForLevel(5);
 assert.ok(hub.move(a.c,hub.paintball,true));
 const id=hub.paintball.playerOf(a.c)!.id;
 assert.equal(lastOf(a.s,'welcome')!.roster.find(r=>r.id===id)!.level,5);
 assert.ok(hub.paintball.game.roster().filter(r=>r.bot).every(r=>r.level===1));
 p.nick='PaintRenamed';p.outfit={...p.outfit,c:3};profiles.credit(p,xpForLevel(15)-p.xp,'mode');steps(hub,20);
 const row=lastOf(a.s,'roster')!.players.find(r=>r.id===id)!;
 assert.equal(row.level,15);assert.equal(row.name,p.nick);assert.deepEqual(row.o,p.outfit);
});
test('race welcomes and refreshes authoritative level with kart metadata',()=>{
 const {hub,profiles}=setupHub();const a=login(hub,'LevelRace');const p=a.c.profile!;p.level=15;p.xp=xpForLevel(15);
 hub.race.open();assert.ok(hub.move(a.c,hub.race,true));hub.race.launch();const id=hub.race.kartOf(a.c)!.id;
 assert.equal(lastOf(a.s,'race')!.karts.find(r=>r.id===id)!.level,15);
 assert.ok(hub.race.race!.roster().filter(r=>r.bot).every(r=>r.level===1));
 p.nick='RaceRenamed';p.outfit={...p.outfit,c:4};profiles.credit(p,xpForLevel(30)-p.xp,'mode');steps(hub,2);
 const row=lastOf(a.s,'rroster')!.karts.find(r=>r.id===id)!;
 assert.equal(row.level,30);assert.equal(row.nick,p.nick);assert.deepEqual(row.o,p.outfit);
});
test('fort welcomes and refreshes authoritative defender level',()=>{
 const {hub,profiles}=setupHub({fort:true});const a=login(hub,'LevelFort');const p=a.c.profile!;p.level=30;p.xp=xpForLevel(30);
 assert.ok(hub.move(a.c,hub.fort!,true));const id=hub.fort!.playerOf(a.c)!.id;
 assert.equal(lastOf(a.s,'fort')!.players.find(r=>r.id===id)!.level,30);
 p.nick='FortRenamed';p.outfit={...p.outfit,c:5};profiles.credit(p,xpForLevel(50)-p.xp,'mode');steps(hub,20);
 const row=lastOf(a.s,'froster')!.players.find(r=>r.id===id)!;
 assert.equal(row.level,50);assert.equal(row.name,p.nick);assert.deepEqual(row.o,p.outfit);
});
test('rename message in an active paintball room refreshes roster without changing level',()=>{
 const {hub}=setupHub();const a=login(hub,'BeforeRename');const p=a.c.profile!;p.level=15;p.xp=xpForLevel(15);
 assert.ok(hub.move(a.c,hub.paintball,true));const id=hub.paintball.playerOf(a.c)!.id;
 hub.onJson(a.c,{t:'rename',nick:'AfterRename'});steps(hub,20);
 const row=lastOf(a.s,'roster')!.players.find(r=>r.id===id)!;
 assert.equal(row.name,'AfterRename');assert.equal(row.level,15);assert.equal(p.xp,xpForLevel(15));
});

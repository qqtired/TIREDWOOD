import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Store, normalizeProfile } from './frozen-source/server/store.ts';
import { Profiles } from './frozen-source/server/profiles.ts';
import { Hub } from './frozen-source/server/hub.ts';
import { PROTOCOL_VERSION } from './frozen-source/shared/constants.ts';
import { RAT_USE } from './frozen-source/shared/ratrace.ts';
const out = {};
const dirs = [];
function env(){const dir=mkdtempSync(path.join(tmpdir(),'tiredwood-audit-'));dirs.push(dir);const clock={now:Date.UTC(2026,9,7,12)};const s=new Store(dir,{log:()=>{},saveDelayMs:60000,now:()=>clock.now});s.load();return {dir,s,clock};}
{
 const e=env();e.s.state.profiles=[normalizeProfile({id:1,nick:'First',tokens:100}),normalizeProfile({id:2,nick:'Second',tokens:700})];e.s.markDirty();e.s.flush();
 const raw=JSON.parse(readFileSync(path.join(e.dir,'state.json'),'utf8'));raw.profiles[1].nick=null;writeFileSync(path.join(e.dir,'state.json'),JSON.stringify(raw));
 const loaded=new Store(e.dir,{log:()=>{},saveDelayMs:60000,now:()=>e.clock.now});loaded.load();loaded.markDirty();loaded.flush();
 out.partialProfileCorruption={profilesBefore:2,profilesAfter:loaded.state.profiles.length,backupProfiles:JSON.parse(readFileSync(path.join(e.dir,'backups','state-2026-10-07.json'),'utf8')).profiles.length,primaryProfiles:JSON.parse(readFileSync(path.join(e.dir,'state.json'),'utf8')).profiles.length};
}
{
 const e=env();const profiles=new Profiles(e.s,{now:()=>e.clock.now});const hub=new Hub({store:e.s,profiles,now:()=>e.clock.now,log:()=>{},build:'audit-offline',smokeToken:'synthetic-offline-only',ratrace:true,weather:'clear'});
 const sink={sendJson(){},sendBinary(){},close(){}};const c=hub.connect(sink,'offline');hub.onJson(c,{t:'hello',v:PROTOCOL_VERSION,key:'offline-synthetic-key-123456789',nick:'OfflineTester'});
 if(!c.profile)throw Error('offline login failed');const p=hub.lobby.playerOf(c);p.state.x=RAT_USE.x;p.state.y=0;p.state.z=RAT_USE.z;
 hub.onJson(c,{t:'rat',a:'bet',rat:0,amount:20,race:hub.lobby.ratrace.view().race});
 out.ratBusyBeforeDisconnect={trackBusy:hub.lobby.ratrace.busy,hubActive:hub.active,healthBusy:hub.health().busy,escrow:c.profile.ratEscrow?.amount};
 hub.disconnect(c);e.clock.now+=60000;
 if(hub.active)hub.step(); // same global loop guard as server/main.ts
 out.ratBusyAfterDisconnect={trackBusy:hub.lobby.ratrace.busy,hubActive:hub.active,healthBusy:hub.health().busy,phase:hub.lobby.ratrace.view().phase,escrow:c.profile.ratEscrow?.amount};e.s.close();
}
{
 const e=env();const p=normalizeProfile({id:1,nick:'DiskCase',tokens:100});e.s.state.profiles.push(p);e.s.markDirty();e.s.flush();const profiles=new Profiles(e.s,{now:()=>e.clock.now});
 mkdirSync(path.join(e.dir,'state.json.tmp'));let error='';try{profiles.reserveBlackjack(1,'offline-round',20);}catch(err){error=err.message;}
 out.primaryWriteFailure={error,tokensInMemory:p.tokens,escrowInMemory:p.blackjackEscrow,tokensOnDisk:JSON.parse(readFileSync(path.join(e.dir,'state.json'),'utf8')).profiles[0].tokens};
 // avoid scheduled timer; flush catches and clears timer itself
}
out.temporaryDataDirs=dirs;writeFileSync('./quality-repro-results.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out));

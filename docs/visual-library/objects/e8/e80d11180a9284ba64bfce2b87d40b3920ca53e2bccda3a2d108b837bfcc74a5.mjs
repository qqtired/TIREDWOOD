// Explicit temporary QA only. Never load in production or against a real DATA_DIR.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
import {DG_SIM} from '../../../../../../../unavailable.html';
import {DungeonHall} from '../../../../../../../unavailable.html';
import {DungeonRoom} from '../../../../../../../unavailable.html';
import {dgHash} from '../../../../../../../unavailable.html';
import {CASES,setup,summary,GAME} from './setup.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url)),scratch=path.dirname(dir);
if(process.env.DG_QA_ENABLE!=='1')throw Error('DG_QA_ENABLE=1 required');
if(!process.env.DATA_DIR||!process.env.DG_QA_DATA_DIR||path.resolve(process.env.DATA_DIR)!==path.resolve(process.env.DG_QA_DATA_DIR))throw Error('exact matching temp DATA_DIR/DG_QA_DATA_DIR required');
const dataDir=fs.realpathSync(process.env.DATA_DIR),base=fs.realpathSync(scratch);
if(path.dirname(dataDir)!==base||!/^dungeon-runtime-data\.[a-zA-Z0-9]+$/.test(path.basename(dataDir)))throw Error('DATA_DIR must be exact allocated dungeon-runtime-data.* under task scratch');
const frozen=JSON.parse(fs.readFileSync(path.join(scratch,'dungeon-source-freeze-r6.json')));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
for(const f of frozen.files)if(hash(fs.readFileSync(path.join(GAME,f.path)))!==f.sha256)throw Error('R6 freeze changed: '+f.path);
const records=new WeakMap(),rooms=new Set();let selected='normal';
const oldSeed=DungeonHall.prototype.seed,oldCreate=DG_SIM.createRun,oldStep=DG_SIM.step,oldReset=DungeonRoom.prototype.reset;
DungeonHall.prototype.seed=function(){return CASES.find(c=>c.id===selected)?.seed??oldSeed.call(this);};
DG_SIM.createRun=function(seed){const sim=oldCreate(seed),initial=setup(sim);records.set(sim,{initial,hashes:new Map([[sim.t,dgHash(sim)]]),trace:[],phase:0,lastMarks:''});return sim;};
DG_SIM.step=function(sim){const r=records.get(sim),before=sim.t;oldStep(sim);if(!r||sim.t===before)return;r.hashes.set(sim.t,dgHash(sim));if(r.hashes.size>512)r.hashes.delete(r.hashes.keys().next().value);const marks=sim.marks.map(m=>m.id+':'+m.t1).join(',');const phase=sim.bosses[0]?.phase??0;if(phase!==r.phase||marks!==r.lastMarks||sim.fx.some(f=>['hurt','die','q','phase'].includes(f.k))){r.trace.push(summary(sim));if(r.trace.length>80)r.trace.shift();r.phase=phase;r.lastMarks=marks;}};
DungeonRoom.prototype.reset=function(){oldReset.call(this);rooms.add(this);const r=records.get(this.sim);if(r?.initial.accelerated)this.paidWaves=this.sim.stats.waves;};
function state(tick){return {selected,sourceFreeze:frozen.sourceSHA,rooms:[...rooms].filter(r=>!r.closedRoom).map(r=>{const record=records.get(r.sim);return {room:r.state,mismatches:r.mismatches,bad:r.bad,initial:record?.initial,hashAtTick:record?.hashes.get(tick),state:summary(r.sim),trace:record?.trace,result:DG_SIM.dgResult(r.sim)};})};}
const emit=http.Server.prototype.emit;
http.Server.prototype.emit=function(event,...args){
 if(event!=='request')return emit.call(this,event,...args);
 const [req,res]=args,url=new URL(req.url??'/','http://127.0.0.1');
 if(!url.pathname.startsWith('/__dungeon_qa/'))return emit.call(this,event,...args);
 const remote=req.socket.remoteAddress;if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(remote)){res.writeHead(403).end();return true;}
 if(req.headers.origin){const o=new URL(req.headers.origin);if(!['127.0.0.1','localhost','[::1]'].includes(o.hostname)||o.host!==req.headers.host){res.writeHead(403).end();return true;}}
 const send=(code,data,type='application/json; charset=utf-8')=>{res.writeHead(code,{'content-type':type,'cache-control':'no-store'});res.end(typeof data==='string'||Buffer.isBuffer(data)?data:JSON.stringify(data));};
 if(url.pathname==='/__dungeon_qa/state'){send(200,state(Number(url.searchParams.get('tick'))));return true;}
 if(url.pathname==='/__dungeon_qa/case'){
  if(req.method==='GET'){send(200,{selected,cases:CASES});return true;}
  if(req.method!=='POST'||!req.headers['content-type']?.startsWith('application/json')){send(405,{});return true;}
  let body='';req.on('data',chunk=>{body+=chunk;if(body.length>2048)req.destroy();});req.on('end',()=>{try{const id=JSON.parse(body).case;if(id!=='normal'&&!CASES.some(c=>c.id===id))throw Error('unknowncase');selected=id;send(200,{selected,nextRunOnly:true});}catch{send(400,{error:'unknown case or malformed JSON'});}});return true;
 }
 const files={'./client.mjs':['./client.mjs','text/javascript'],'/setup.js':['setup.bundle.js','text/javascript'],'/chainwarden.glb':[path.join(GAME,'client/assets/dungeon/chainwarden.glb'),'model/gltf-binary'],'/chainwarden-atlas-soft.glb':['../../../revision2/models/chainwarden-atlas-soft.glb','model/gltf-binary']};
 const item=files[url.pathname.slice('/__dungeon_qa'.length)];
 if(item){try{send(200,fs.readFileSync(path.isAbsolute(item[0])?item[0]:path.join(dir,item[0])),item[1]);}catch{send(404,{error:'QA file not prepared'});}return true;}
 send(404,{});return true;
};
console.log('Dungeon QA preload ready: temporary data only; source R6 unchanged; selected normal until explicit next-run configuration.');

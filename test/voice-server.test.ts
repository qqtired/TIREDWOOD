import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VoiceRouter, type VoiceClient } from '../server/voice.ts';
import { VOICE_TALK_LEASE_MS, type VoiceServerMsg } from '../shared/voice.ts';
const SDP = ['v=0','o=- 1 2 IN IP4 127.0.0.1','s=-','t=0 0','a=group:BUNDLE 0','m=audio 9 UDP/TLS/RTP/SAVPF 111','c=IN IP4 0.0.0.0','a=mid:0','a=ice-ufrag:abcd','a=ice-pwd:abcdefghijklmnopqrstuvwxyz','a=fingerprint:sha-256 '+Array(32).fill('AA').join(':'),'a=setup:actpass','a=rtcp-mux','a=sendrecv','a=rtpmap:111 opus/48000/2',''].join('\r\n');
function setup(entityId: (c: VoiceClient) => number | null = c => c.id){let now=1000;let configs=0;const router=new VoiceRouter({entityId,now:()=>now,ice:()=>{configs++;return{iceServers:[],expiresAt:now+10000,relayOnly:false};}});let id=0;const clients:Array<VoiceClient & {messages:VoiceServerMsg[]}> = [];
 function client(room:object={kind:'lobby'}){const messages:VoiceServerMsg[]=[];const i=++id;const c={id:i,pid:i,nick:`P${i}`,profile:{id:i},closed:false,ephemeral:false,room:room as {kind:string},sink:{sendJson:(m:VoiceServerMsg)=>messages.push(m)},messages};clients.push(c);router.connected(c);return c;}
 return{router,client,clients,time:(v:number)=>now=v,configs:()=>configs};}
const state=(c:{messages:VoiceServerMsg[]})=>c.messages.filter((m):m is Extract<VoiceServerMsg,{t:'voiceState'}>=>m.t==='voiceState').at(-1)!;
const signals=(c:{messages:VoiceServerMsg[]})=>c.messages.filter(m=>m.t==='voiceSignal');
test('auth-only config, opt-in exact-room membership and self excluded',()=>{const s=setup(),room={kind:'lobby'},a=s.client(room),b=s.client(room);assert.equal(state(a).self,null);s.router.handle(a,{t:'voice',a:'join'});assert.ok(state(a).self);assert.equal(state(a).peers.length,0);s.router.handle(b,{t:'voice',a:'join'});assert.equal(state(a).peers.length,1);assert.equal(state(b).peers[0].id,state(a).self);const before=s.configs();const bad={...a,profile:null,messages:[],sink:{sendJson:()=>assert.fail('unauthenticated must receive no credentials')}};s.router.connected(bad);s.router.handle(bad,{t:'voice',a:'refresh'});assert.equal(s.configs(),before);});
for (const count of [7, 12, 32, 64]) test(count+' authenticated room participants join without a separate voice cap',()=>{
 const s=setup(),room={kind:'lobby'},p=Array.from({length:count},()=>s.client(room));for(const c of p)s.router.handle(c,{t:'voice',a:'join'});
 for(const c of p){assert.ok(state(c).self);assert.equal(state(c).peers.length,count-1);assert.equal(c.messages.find(m=>m.t==='voiceConfig')!.maxPeers,0);assert.ok(!c.messages.some(m=>m.t==='voiceError'&&m.code==='full'));}
 const id=state(p[0]).self;s.router.handle(p[0],{t:'voice',a:'join'});assert.equal(state(p[0]).self,id);
 s.router.handle(p[0],{t:'voice',a:'leave'});assert.equal(state(p[0]).self,null);assert.equal(state(p[1]).peers.length,count-2);
});
test('signals validate zone, actual self and target, stale ids and sanitized body',()=>{const s=setup(),room={kind:'lobby'},a=s.client(room),b=s.client(room),c=s.client({kind:'fort'});for(const p of[a,b,c])s.router.handle(p,{t:'voice',a:'join'});const ai=state(a).self!,bi=state(b).self!,ci=state(c).self!;s.router.handle(a,{t:'voiceSignal',self:ai,to:bi,signal:{kind:'offer',sdp:SDP}});assert.equal(signals(b).length,1);assert.deepEqual(signals(b)[0],{t:'voiceSignal',from:ai,to:bi,signal:{kind:'offer',sdp:SDP}});s.router.handle(a,{t:'voiceSignal',self:ai,to:ci,signal:{kind:'offer',sdp:SDP}});s.router.handle(a,{t:'voiceSignal',self:bi,to:bi,signal:{kind:'offer',sdp:SDP}});assert.equal(signals(c).length,0);assert.equal(signals(b).length,1);b.closed=true;s.router.handle(a,{t:'voiceSignal',self:ai,to:bi,signal:{kind:'offer',sdp:SDP}});assert.equal(signals(b).length,1);});
test('move autojoins only prior opt-in, creates monotonic id, and old SDP cannot cross rooms',()=>{const s=setup(),r1={kind:'lobby'},r2={kind:'fort'},a=s.client(r1),b=s.client(r1),c=s.client(r2);for(const p of[a,b,c])s.router.handle(p,{t:'voice',a:'join'});const old=state(a).self!;a.room=r2;s.router.moved(a);const fresh=state(a).self!;assert.ok(fresh>old);assert.equal(state(b).peers.length,0);assert.equal(state(a).room,'fort');s.router.handle(a,{t:'voiceSignal',self:old,to:state(c).self!,signal:{kind:'offer',sdp:SDP}});assert.equal(signals(c).length,0);s.router.handle(a,{t:'voice',a:'leave'});a.room=r1;s.router.moved(a);assert.equal(state(a).self,null);});
test('talk is self-only with renewable1800ms lease, rename and disconnect notify peers',()=>{const s=setup(),room={kind:'lobby'},a=s.client(room),b=s.client(room);s.router.handle(a,{t:'voice',a:'join'});s.router.handle(b,{t:'voice',a:'join'});const id=state(a).self!;s.router.handle(a,{t:'voice',a:'talk',self:state(b).self,on:true});assert.equal(state(b).peers[0].talking,false);s.router.handle(a,{t:'voice',a:'talk',self:id,on:true});assert.equal(state(b).peers[0].talking,true);s.time(1000+VOICE_TALK_LEASE_MS);s.router.step();assert.equal(state(b).peers[0].talking,false);a.nick='Renamed';s.router.renamed(a);assert.equal(state(b).peers[0].nick,'Renamed');s.router.disconnected(a);assert.equal(state(b).peers.length,0);});
test('refresh renews config without id change; invalid/flood traffic is bounded without feedback flood',()=>{const s=setup(),room={kind:'lobby'},a=s.client(room),b=s.client(room);s.router.handle(a,{t:'voice',a:'join'});s.router.handle(b,{t:'voice',a:'join'});const id=state(a).self!;s.time(2000);s.router.handle(a,{t:'voice',a:'refresh'});assert.equal(state(a).self,id);assert.ok(a.messages.some(m=>m.t==='voiceConfig'&&m.expiresAt===12000));for(let i=0;i<1000;i++)s.router.handle(a,{t:'voiceSignal',self:id,to:state(b).self,signal:{kind:'ice',candidate:null}});assert.ok(signals(b).length<=120);assert.ok(a.messages.filter(m=>m.t==='voiceError').length<=2);});
test('rejects video/data/junk/nonASCII/oversize SDP and invalid ICE, accepts bounded browser candidates',()=>{const s=setup(),r={kind:'lobby'},a=s.client(r),b=s.client(r);s.router.handle(a,{t:'voice',a:'join'});s.router.handle(b,{t:'voice',a:'join'});const send=(signal:unknown)=>s.router.handle(a,{t:'voiceSignal',self:state(a).self,to:state(b).self,signal});for(const sdp of['junk',SDP.replace('m=audio','m=video'),SDP+'m=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n',SDP+'\u0000',SDP+'я','x'.repeat(12001)])send({kind:'offer',sdp});for(const candidate of[{candidate:'bad',sdpMid:'0',sdpMLineIndex:0},{candidate:'candidate:1 1 udp 1 127.0.0.1 99999 typ host',sdpMid:'0',sdpMLineIndex:0},{candidate:'candidate:1 1 udp 1 127.0.0.1 5000 typ host',sdpMid:'0',sdpMLineIndex:8}])send({kind:'ice',candidate});assert.equal(signals(b).length,0);send({kind:'ice',candidate:{candidate:'candidate:1 1 udp 2122260223 550e8400-e29b-41d4-a716-446655440000.local 5000 typ host generation 0 ufrag abcd network-cost 999',sdpMid:'0',sdpMLineIndex:0,usernameFragment:'abcd'}});assert.equal(signals(b).length,1);});

test('leave and talk-off still clear membership/lease after signal or control budget exhaustion',()=>{const s=setup(),r={kind:'lobby'},a=s.client(r),b=s.client(r);for(const p of[a,b])s.router.handle(p,{t:'voice',a:'join'});const id=state(a).self!;s.router.handle(a,{t:'voice',a:'talk',self:id,on:true});for(let i=0;i<200;i++)s.router.handle(a,{t:'voiceSignal',self:id,to:state(b).self,signal:{kind:'ice',candidate:null}});s.router.handle(a,{t:'voice',a:'talk',self:id,on:false});assert.equal(state(b).peers[0].talking,false);s.router.handle(a,{t:'voice',a:'leave'});assert.equal(state(a).self,null);assert.equal(state(b).peers.length,0);});
test('moving into a populated room keeps voice joined, closed sessions are swept, reused connection ID gets fresh voice ID',()=>{const s=setup(),aRoom={kind:'lobby'},bRoom={kind:'fort'},a=s.client(aRoom),listener=s.client(aRoom);s.router.handle(a,{t:'voice',a:'join'});const old=state(a).self!;const full=Array.from({length:6},()=>s.client(bRoom));for(const p of full)s.router.handle(p,{t:'voice',a:'join'});a.room=bRoom;s.router.moved(a);assert.ok(state(a).self!>old);assert.equal(state(listener).peers.length,0);full[0].closed=true;s.router.step();assert.equal(state(full[1]).peers.length,5);s.router.handle(a,{t:'voice',a:'join'});assert.ok(state(a).self!>old);s.router.disconnected(a);a.closed=true;const fresh=s.client(bRoom);fresh.id=a.id;s.router.handle(fresh,{t:'voice',a:'join'});assert.ok(state(fresh).self!>old);});
test('large valid offers exhaust byte budget independently; null and empty ICE terminators are safe',()=>{const s=setup(),r={kind:'lobby'},a=s.client(r),b=s.client(r);for(const p of[a,b])s.router.handle(p,{t:'voice',a:'join'});const send=(signal:unknown)=>s.router.handle(a,{t:'voiceSignal',self:state(a).self,to:state(b).self,signal});send({kind:'ice',candidate:null});send({kind:'ice',candidate:{candidate:'',sdpMid:null,sdpMLineIndex:null,usernameFragment:null}});assert.equal(signals(b).length,2);const large=SDP+Array(6).fill('a=ssrc:1 cname:'+'x'.repeat(1750)+'\r\n').join('');for(let i=0;i<20;i++)send({kind:'offer',sdp:large});assert.ok(signals(b).length>2&&signals(b).length<12);});

test('malformed cleanup controls from a nonmember cannot throw or acquire membership',()=>{const s=setup(),a=s.client();for(const raw of[{t:'voice',a:'talk',on:false},{t:'voice',a:'talk',self:null,on:false},{t:'voice',a:'talk',self:1,on:false},{t:'voiceSignal'},{t:'voice',a:'leave',room:'fort'}])assert.doesNotThrow(()=>s.router.handle(a,raw));assert.equal(state(a).self,null);});

test('wire envelope accounts for escaped SDP bytes instead of string length alone',()=>{const s=setup(),r={kind:'lobby'},a=s.client(r),b=s.client(r);for(const p of[a,b])s.router.handle(p,{t:'voice',a:'join'});const escaped=SDP+Array(6).fill('a=ssrc:1 cname:'+'"'.repeat(1750)+'\r\n').join('');assert.ok(escaped.length<12000);const message={t:'voiceSignal',self:state(a).self,to:state(b).self,signal:{kind:'offer',sdp:escaped}};assert.ok(JSON.stringify(message).length>16384);s.router.handle(a,message);assert.equal(signals(b).length,0);});

test('Chromium audio offer with standard RTCP XR is accepted without permitting video, data or unknown attributes',()=>{
 const s=setup(),room={kind:'lobby'},a=s.client(room),b=s.client(room);for(const p of[a,b])s.router.handle(p,{t:'voice',a:'join'});
 const xr=SDP.replace('a=rtcp-mux\r\n','a=rtcp-mux\r\na=rtcp-rsize\r\na=rtcp-xr:rcvr-rtt=all\r\n');
 const send=(sdp:string)=>s.router.handle(a,{t:'voiceSignal',self:state(a).self,to:state(b).self,signal:{kind:'offer',sdp}});
 send(xr);assert.equal(signals(b).length,1);assert.deepEqual(signals(b)[0],{t:'voiceSignal',from:state(a).self,to:state(b).self,signal:{kind:'offer',sdp:xr}});
 send(xr.replace('m=audio','m=video'));send(xr+'m=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n');send(xr+'a=unknown-junk:payload\r\n');send(xr.replace('rcvr-rtt=all','rcvr-rtt=not-a-mode'));
 assert.equal(signals(b).length,1);
});

test('nonparticipants receive authoritative entity ids and speaking lease lifecycle', () => {
 const s=setup(c=>c.id===701?12:null),r={kind:'lobby'},a=s.client(r),observer=s.client(r);
 // Voice session IDs deliberately differ from world entity IDs.
 a.id=701; s.router.handle(a,{t:'voice',a:'join'});
 const voiceId=state(a).self!; assert.notEqual(voiceId,a.id);
 s.router.handle(a,{t:'voice',a:'talk',self:voiceId,on:true});
 assert.equal(state(observer).self,null); assert.deepEqual(state(observer).peers,[{id:voiceId,entityId:12,pid:a.pid,nick:a.nick,talking:true,mic:false}]);
 s.time(1000+VOICE_TALK_LEASE_MS);s.router.step();assert.equal(state(observer).peers[0].talking,false);
});

for(const count of [7,12,32,64]) test(count+' peers each receive a full signaling burst without cross-peer quota starvation',()=>{
 const s=setup(),room={kind:'lobby'},p=Array.from({length:count},()=>s.client(room));for(const c of p)s.router.handle(c,{t:'voice',a:'join'});
 const a=p[0],self=state(a).self!,large=SDP+Array(6).fill('a=ssrc:1 cname:'+'x'.repeat(1750)+'\r\n').join('');
 for(const b of p.slice(1)){
   const to=state(b).self!;s.router.handle(a,{t:'voiceSignal',self,to,signal:{kind:'offer',sdp:large}});
   for(let i=0;i<24;i++)s.router.handle(a,{t:'voiceSignal',self,to,signal:{kind:'ice',candidate:{candidate:'candidate:1 1 udp 1 127.0.0.1 5000 typ host',sdpMid:'0',sdpMLineIndex:0}}});
   assert.equal(signals(b).length,25);
 }
 assert.ok(!a.messages.some(m=>m.t==='voiceError'));
 const b=p[1];for(let i=0;i<1000;i++)s.router.handle(a,{t:'voiceSignal',self,to:state(b).self,signal:{kind:'ice',candidate:null}});
 assert.ok(signals(b).length<=120,'flood remains bounded per destination');
 const c=p.at(-1)!;s.router.handle(a,{t:'voiceSignal',self,to:state(c).self,signal:{kind:'ice',candidate:null}});assert.equal(signals(c).length,26,'one exhausted destination does not suppress another');
});

test('per-destination signal quota survives voice ID churn and keeps talk controls independent',()=>{
 const s=setup(),room={kind:'lobby'},a=s.client(room),b=s.client(room);for(const c of[a,b])s.router.handle(c,{t:'voice',a:'join'});
 const send=()=>s.router.handle(a,{t:'voiceSignal',self:state(a).self,to:state(b).self,signal:{kind:'ice',candidate:null}});
 for(let i=0;i<150;i++)send();assert.equal(signals(b).length,120);
 for(const c of[a,b]){s.router.handle(c,{t:'voice',a:'leave'});s.router.handle(c,{t:'voice',a:'join'});}
 send();assert.equal(signals(b).length,120,'new voice IDs cannot refill the same authenticated pair');
 s.router.handle(a,{t:'voice',a:'talk',self:state(a).self,on:true});assert.equal(state(b).peers[0].talking,true);
 s.router.handle(a,{t:'voice',a:'talk',self:state(a).self,on:false});assert.equal(state(b).peers[0].talking,false);
 s.time(2000);send();assert.equal(signals(b).length,121,'pair quota refills with elapsed time');
});

test('зоны: внешний мир общий для набережной и катеров, у каждого инстанса свой голос; микрофон и перезапуск', () => {
 const s=setup(),lobby={kind:'lobby'},boats={kind:'boatrace'},fort1={kind:'fort'},fort2={kind:'fort'};
 const a=s.client(lobby),b=s.client(boats),c=s.client(fort1),d=s.client(fort2),e=s.client(fort1);
 for(const p of[a,b,c,d,e])s.router.handle(p,{t:'voice',a:'join'});
 assert.deepEqual(state(a).peers.map(p=>p.pid),[b.pid]);assert.equal(state(a).zone,'world');
 assert.equal(state(a).peers[0].entityId,null,'фигурка — только для той же комнаты');
 assert.deepEqual(state(c).peers.map(p=>p.pid),[e.pid]);assert.equal(state(c).zone,'fort');assert.equal(state(d).peers.length,0);
 // набережная → катера: тот же номер, соединения живут
 const id=state(a).self!;a.room=boats;s.router.moved(a);assert.equal(state(a).self,id);assert.equal(state(a).peers[0].entityId,b.id);
 // в крепость: новая зона, новый номер; набережная его больше не слышит
 a.room=fort2;s.router.moved(a);assert.ok(state(a).self!>id);assert.deepEqual(state(a).peers.map(p=>p.pid),[d.pid]);assert.equal(state(b).peers.length,0);
 s.router.handle(a,{t:'voiceSignal',self:state(a).self,to:state(c).self,signal:{kind:'restart'}});assert.equal(signals(c).length,0,'в чужой инстанс сигнал не проходит');
 s.router.handle(a,{t:'voiceSignal',self:state(a).self,to:state(d).self,signal:{kind:'restart'}});assert.deepEqual(signals(d).at(-1),{t:'voiceSignal',from:state(a).self,to:state(d).self,signal:{kind:'restart'}});
 s.router.handle(a,{t:'voice',a:'mic',on:true});assert.equal(state(d).peers[0].mic,true);
 s.router.handle(a,{t:'voice',a:'mic',on:false});assert.equal(state(d).peers[0].mic,false);
 // назад на набережную — снова вместе с катерами
 a.room=lobby;s.router.moved(a);assert.deepEqual(state(b).peers.map(p=>p.pid),[a.pid]);
});

// Read-only diagnostic: import actual shared simulator, use a wide empty test course to isolate dynamics.
import fs from 'node:fs';
import { buildTrack } from '../../../../../unavailable.html';
import { regattaCourse } from '../../../../../unavailable.html';
import { makeRgBoat, makeRgEvents, stepRgBoat } from '../../../../../unavailable.html';
import { makeInput, BTN_FORWARD as W, BTN_BACK as S, BTN_LEFT as A, BTN_RIGHT as D, BTN_DASH as SHIFT } from '../../../../../unavailable.html';
const track=buildTrack({name:'wide diagnostic',nodes:[{x:-1000,z:0,r:100},{x:1000,z:0,r:100},{x:1000,z:2000,r:100},{x:-1000,z:2000,r:100}],width:500,step:5,start:{leg:0,at:900},checkpoints:[],ramps:[],open:[],crates:[]});
const c={track,gates:[{x:99999,z:99999,tx:1,tz:0,hw:500,seg:0,rx:99999,rz:99999}],flags:[],obstacles:[],ramp:{x0:99999,x1:100000,z0:99999,z1:100000,h:1},grid:[]};
const inp=makeInput(),ev=makeRgEvents();
function boat(speed=0){ const s=makeRgBoat(); s.go=1;s.vx=speed;return s; }
function tick(s,buttons){inp.buttons=buttons;inp.seq++; stepRgBoat(s,inp,c,ev,true); if(ev.hit||ev.respawn)throw Error('Diagnostic course hit; invalid measurement'); }
function speed(s){return Math.hypot(s.vx,s.vz);}
function accelerate(){let s=boat();const thresholds=[7,8,11.9,15.3,16.15,16.83],times={};for(let t=1;t<=600;t++){tick(s,W);for(const v of thresholds)if(times[v]===undefined&&speed(s)>=v)times[v]=t/60;}return times;}
function radius(points){const [a,b,c]=points;const ab=Math.hypot(b.x-a.x,b.z-a.z),bc=Math.hypot(c.x-b.x,c.z-b.z),ca=Math.hypot(a.x-c.x,a.z-c.z);const twiceArea=Math.abs((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x));return ab*bc*ca/(2*twiceArea);}
function turning(buttons,init=17,boost=0){let s=boat(init);s.boost=boost;s.boostTop=25;const p=[];for(let t=1;t<=300;t++){tick(s,buttons);if(t>=180&&t%60===0)p.push({x:s.x,z:s.z});}return{finalSpeed:speed(s),radiusM:radius(p),headingToVelocityDeg:Math.acos((s.hx*s.vx+s.hz*s.vz)/speed(s))*180/Math.PI};}
function braking(){let s=boat(17),t=0;while(speed(s)>0.01&&t<300){tick(s,S);t++;if(s.vx<=0)break;}return {seconds:t/60,distance:s.x};}
function reverseDrift(){let s=boat(17);for(let t=0;t<60;t++)tick(s,W|A|SHIFT);let y0=Math.atan2(-s.hz,s.hx);for(let t=0;t<60;t++)tick(s,W|D|SHIFT);const y1=Math.atan2(-s.hz,s.hx);return {afterCounterSteerOneSecond:{headingDeltaDeg:(y1-y0)*180/Math.PI,driftDir:s.driftDir,steer:s.steer,speed:speed(s)}};}
const actual=regattaCourse();
const out={scope:'actual stepRgBoat on a deliberately wide empty course; no browser, multiplayer, packet or subjective feel measurement',node:process.version,actualCourse:{id:'harbor-v1',lengthM:actual.track.length,samples:actual.track.n,gates:actual.gates.length,flagPairs:actual.flags.length,obstacles:actual.obstacles.length,halfWidthRangeM:[Math.min(...actual.track.hw),Math.max(...actual.track.hw)]},accelerationThresholdSeconds:accelerate(),turnNormal:turning(W|A),turnDrift:turning(W|A|SHIFT),turnBoost:turning(W|A,25,1000),braking:braking(),counterSteerHeldDrift:reverseDrift(),formulaOnly:{steer0ToFullSeconds:10/60,steerLeftToRightSeconds:20/60,cameraNormal95percentSeconds:-Math.log(.05)/4.5,cameraDrift95percentSeconds:-Math.log(.05)/2.6,predictionCorrection95percentSeconds:-Math.log(.05)/12}};
const dest='./regatta-baseline.json';fs.writeFileSync(dest,JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2));

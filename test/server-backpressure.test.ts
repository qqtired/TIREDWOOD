import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as wire from '../server/voice-wire.ts';
import { encodeEntities, encodeSnapshot, makeHeader, SNAP_SELF_RESET } from '../shared/protocol.ts';
import { makeState } from '../shared/sim.ts';
function socket(bufferedAmount = 0) {
  const sent: Uint8Array[] = [], closed: Array<[number,string]> = [];
  const ws = { OPEN:1,readyState:1,bufferedAmount,sent,closed,send(data:Uint8Array){sent.push(data);},close(code:number,reason:string){closed.push([code,reason]);ws.readyState=2;} };
  return ws;
}
function sender() {
  const send = (wire as unknown as {sendServerBinary:(ws:ReturnType<typeof socket>,data:Uint8Array,onBackpressure?:()=>void)=>void}).sendServerBinary;
  assert.equal(typeof send,'function','binary transport must preserve reset control explicitly'); return send;
}
const snapshot=(reset:boolean)=>encodeSnapshot({...makeHeader(),flags:reset?SNAP_SELF_RESET:0},makeState(),encodeEntities([]));
test('ordinary snapshots remain replaceable at512KiB, while selfReset is sent below1MiB',()=>{
  const send=sender(), normal=snapshot(false),reset=snapshot(true);
  const low=socket(512*1024-1);send(low,normal);assert.equal(low.sent.length,1);
  const busy=socket(512*1024);send(busy,normal);assert.equal(busy.sent.length,0);assert.equal(busy.closed.length,0);
  send(busy,reset);assert.equal(busy.sent.length,1);assert.deepEqual(busy.sent[0],reset);assert.equal(busy.closed.length,0);
});
test('selfReset at1MiB closes1013 instead of disappearing, ordinary snapshots remain droppable',()=>{
  const send=sender(),ws=socket(1024*1024);let pressure=0;
  send(ws,snapshot(false),()=>pressure++);assert.equal(ws.sent.length,0);assert.equal(ws.closed.length,0);
  send(ws,snapshot(true),()=>pressure++);assert.deepEqual(ws.closed,[[1013,'backpressure']]);assert.equal(pressure,1);
  send(ws,snapshot(true),()=>pressure++);assert.equal(pressure,1,'closing socket is not repeatedly closed');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VoiceUi, type VoiceUiActions } from '../client/ui/voice.ts';
import type { VoiceView } from '../shared/voice.ts';

// A deliberately small event/DOM boundary: exercises real widget handlers without media or a browser.
class El extends EventTarget {
  tagName: string; className = ''; textContent = ''; hidden = false; disabled = false; open = false;
  type = ''; value = ''; min = ''; max = ''; step = ''; title = ''; tabIndex = 0;
  children: El[] = []; parent: El | null = null; attrs = new Map<string, string>(); captured: number | null = null;
  classList = { toggle: (name: string, on: boolean) => { const s = new Set(this.className.split(' ')); on ? s.add(name) : s.delete(name); this.className = [...s].join(' '); } };
  constructor(tag: string) { super(); this.tagName = tag.toUpperCase(); }
  append(...els: El[]) { for (const e of els) { e.parent = this; this.children.push(e); } }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(e => e !== this); this.parent = null; }
  setAttribute(k: string, v: string) { this.attrs.set(k, v); }
  focus() { doc.activeElement = this; }
  scrollIntoView() {}
  setPointerCapture(id: number) { this.captured = id; }
  releasePointerCapture(id: number) { if (this.captured === id) this.captured = null; }
  hasPointerCapture(id: number) { return this.captured === id; }
}
const doc = Object.assign(new EventTarget(), { createElement: (tag: string) => new El(tag), activeElement: null as El | null, hidden: false });
const win = new EventTarget();
Object.defineProperty(globalThis, 'document', { value: doc, configurable: true });
Object.defineProperty(globalThis, 'window', { value: win, configurable: true });
function find(root: El, cls: string): El { const all = [root]; while (all.length) { const e = all.shift()!; if (e.className.split(' ').includes(cls)) return e; all.push(...e.children); } throw Error(cls); }
function fire(el: EventTarget, type: string, props = {}) { const e = Object.assign(new Event(type, { cancelable: true }), props); el.dispatchEvent(e); return e; }
const base: VoiceView = { available: true, enabled: false, joined: false, room: 'lobby', mic: 'off', playbackBlocked: false, transmitting: false, receiving: true, gameMuted: false, volume: .7, maxPeers: 0, error: '', presence: [], peers: [] };
function setup(view = base) {
  const settings = new El('div'), hud = new El('div'); const calls: Array<[string, ...unknown[]]> = [];
  const a: VoiceUiActions = { connectMic: () => { calls.push(['connectMic']); }, enable: () => calls.push(['enable']), disable: () => calls.push(['disable']), enableMic: () => calls.push(['enableMic']), disableMic: () => calls.push(['disableMic']), push: v => calls.push(['push', v]), setReceiving: v => calls.push(['receiving', v]), setVolume: v => calls.push(['volume', v]), setPeerMuted: (id, v) => calls.push(['peer', id, v]), openSettings: () => calls.push(['open']) };
  const ui = new VoiceUi({ settingsRoot: settings as unknown as HTMLElement, hudRoot: hud as unknown as HTMLElement }, a);
  ui.render(view); ui.setVisible(true); return { ui, settings, hud, calls };
}
const ready = { ...base, enabled: true, joined: true, mic: 'ready' as const };

test('voice and mic are separate opt-ins, flag hides both surfaces', () => {
  const s = setup(); assert.equal(find(s.settings, 'voice-settings').open, false);
  fire(find(s.settings, 'voice-enable'), 'click'); assert.deepEqual(s.calls, [['enable']]);
  assert.equal(find(s.settings, 'voice-mic').disabled, true);
  s.ui.render({ ...base, enabled: true, joined: true });
  fire(find(s.settings, 'voice-mic'), 'click'); assert.deepEqual(s.calls.at(-1), ['enableMic']);
  s.ui.render({ ...base, available: false });
  assert.equal(find(s.settings, 'voice-settings').hidden, true); assert.equal(find(s.hud, 'voice-hud').hidden, true); s.ui.dispose();
});

test('PTT releases once on pointer cancellation/lost capture, hide, blur and disposal', () => {
  for (const stop of ['pointerup', 'pointercancel', 'lostpointercapture', 'hide', 'blur', 'dispose']) {
    const s = setup(ready); const hold = find(s.hud, 'voice-hold');
    fire(hold, 'pointerdown', { pointerId: 4, button: 0 });
    fire(hold, 'pointerdown', { pointerId: 5, button: 0 });
    if (stop === 'hide') s.ui.setVisible(false); else if (stop === 'blur') fire(win, 'blur'); else if (stop === 'dispose') s.ui.dispose(); else fire(hold, stop, { pointerId: 4 });
    fire(hold, 'pointerup', { pointerId: 4 });
    assert.deepEqual(s.calls, [['push', true], ['push', false]], stop); s.ui.dispose();
  }
});

test('keyboard hold is repeat-safe and release follows loss of eligibility', () => {
  const s = setup(ready); const hold = find(s.hud, 'voice-hold');
  fire(hold, 'keydown', { key: ' ', repeat: false }); fire(hold, 'keydown', { key: ' ', repeat: true });
  s.ui.render({ ...ready, mic: 'off' }); fire(hold, 'keyup', { key: ' ' });
  assert.deepEqual(s.calls, [['push', true], ['push', false]]); assert.equal(hold.disabled, false); s.ui.dispose();
});

test('peer updates preserve controls/focus, escape nick via text, remove stale peers', () => {
  const p = { id: 2, entityId: 2, nick: '<img src=x>', talking: false, muted: false, link: 'connected' as const };
  const s = setup({ ...ready, peers: [p] }); const mute = find(s.settings, 'voice-peer-mute'); mute.focus();
  s.ui.render({ ...ready, peers: [{ ...p, talking: true }] }); assert.equal(find(s.settings, 'voice-peer-mute'), mute);
  assert.equal(doc.activeElement, mute); assert.equal(find(s.settings, 'voice-peer-name').textContent, p.nick);
  fire(mute, 'click'); assert.deepEqual(s.calls.at(-1), ['peer', 2, true]);
  s.ui.render(ready); assert.equal(find(s.settings, 'voice-peers').children.length, 0); s.ui.dispose();
});

test('receive mute, game mute and mic mute remain separate; settings opens existing pause', () => {
  const s = setup({ ...ready, gameMuted: true });
  fire(find(s.settings, 'voice-receive'), 'click'); fire(find(s.settings, 'voice-mic'), 'click');
  assert.deepEqual(s.calls, [['receiving', false], ['disableMic']]);
  const volume = find(s.settings, 'voice-volume'); volume.value = '35'; fire(volume, 'input'); assert.deepEqual(s.calls.at(-1), ['volume', .35]);
  fire(find(s.hud, 'voice-hold'), 'contextmenu'); assert.deepEqual(s.calls.at(-1), ['open']); assert.equal(find(s.settings, 'voice-settings').open, true);
  s.ui.dispose(); assert.equal(s.settings.children.length, 0); assert.equal(s.hud.children.length, 0);
});

test('page hiding ends capture; full/join and denied mic states offer explicit recovery only', () => {
  const s = setup(ready); const hold = find(s.hud, 'voice-hold');
  fire(hold, 'pointerdown', { pointerId: 7, button: 0 }); doc.hidden = true; fire(doc, 'visibilitychange'); doc.hidden = false;
  assert.deepEqual(s.calls, [['push', true], ['push', false]]);
  s.ui.render({ ...ready, joined: false, error: 'Голосовая группа заполнена' });
  assert.equal(hold.disabled, false); assert.equal(find(s.settings, 'voice-retry').hidden, false);
  assert.equal(s.calls.length, 2); // Rendering errors never retries or requests permissions.
  fire(find(s.settings, 'voice-retry'), 'click'); assert.deepEqual(s.calls.at(-1), ['enable']);
  s.ui.render({ ...ready, mic: 'denied' }); assert.equal(find(s.settings, 'voice-mic').disabled, false);
  fire(find(s.settings, 'voice-mic'), 'click'); assert.deepEqual(s.calls.at(-1), ['enableMic']);
  s.ui.render({ ...ready, mic: 'requesting' }); assert.equal(find(s.settings, 'voice-mic').disabled, true);
  s.ui.dispose();
});

test('joined peer connection failure offers explicit retry without a general error', () => {
  const peer = { id: 2, entityId: 2, nick: 'P2', talking: false, muted: false, link: 'connected' as const };
  const s = setup({ ...ready, peers: [peer] }); const retry = find(s.settings, 'voice-retry');
  assert.equal(retry.hidden, true);
  s.ui.render({ ...ready, error: '', peers: [{ ...peer, link: 'failed' }] });
  assert.equal(retry.hidden, false); assert.deepEqual(s.calls, []);
  fire(retry, 'click'); assert.deepEqual(s.calls, [['enable']]);
  s.ui.render({ ...ready, peers: [peer] }); assert.equal(retry.hidden, true);
  s.ui.dispose();
});

 test('one microphone icon starts explicit consent without transmitting and represents connection failure', () => {
 const s=setup(), hold=find(s.hud,'voice-hold');
 assert.equal(find(s.hud,'voice-speakers').hidden,true);
 assert.equal(hold.textContent,''); assert.match(hold.attrs.get('aria-label')!,/микрофон/i);
 fire(hold,'click'); assert.deepEqual(s.calls,[['connectMic']]);
 s.ui.render({...ready,peers:[{id:2,entityId:2,nick:'P2',talking:false,muted:false,link:'connecting'}]});
 assert.equal(hold.attrs.get('data-state'),'connecting'); fire(hold,'pointerdown',{pointerId:3,button:0});
 assert.equal(s.calls.length,1, 'do not claim transmission before a peer is connected');
 s.ui.render({...ready,error:'Сеть недоступна',peers:[{id:2,entityId:2,nick:'P2',talking:false,muted:false,link:'failed'}]});
 assert.equal(hold.attrs.get('data-state'),'error'); assert.match(hold.title,/Сеть недоступна/);
 fire(hold,'click'); assert.deepEqual(s.calls.at(-1),['connectMic']); s.ui.dispose();
 });

test('keyboard activation requests microphone once, without starting PTT on the permission gesture', () => {
  const s=setup(),hold=find(s.hud,'voice-hold');
  fire(hold,'keydown',{key:'Enter',repeat:false}); fire(hold,'keydown',{key:'Enter',repeat:true});fire(hold,'keyup',{key:'Enter'});
  assert.deepEqual(s.calls,[['connectMic']]); s.ui.dispose();
});

test('autoplay error on an otherwise connected mic remains retryable from the icon', () => {
 const s=setup({...ready,playbackBlocked:true,error:'Не удалось включить воспроизведение'}),hold=find(s.hud,'voice-hold');
 fire(hold,'click');assert.deepEqual(s.calls,[['connectMic']]);s.ui.dispose();
});

test('three-peer partial group holds through one failed and one connecting peer', () => {
 const peers=[{id:2,entityId:2,nick:'Connected',talking:false,muted:false,link:'connected' as const},{id:3,entityId:3,nick:'Failed',talking:false,muted:false,link:'failed' as const},{id:4,entityId:4,nick:'Connecting',talking:false,muted:false,link:'connecting' as const}];
 const s=setup({...ready,error:'Сеть не пропускает голос между участниками',peers}),hold=find(s.hud,'voice-hold');
 assert.equal(hold.attrs.get('data-state'),'ready');assert.match(hold.title,/часть/i);
 fire(hold,'pointerdown',{pointerId:8,button:0});assert.deepEqual(s.calls,[['push',true]]);
 s.ui.render({...ready,error:'Сеть не пропускает голос между участниками',peers:[{...peers[0],link:'failed'},peers[1],peers[2]]});
 assert.deepEqual(s.calls,[['push',true],['push',false]]);s.ui.dispose();
});

test('focused microphone lets V press and release reach the global controller but settings retain keyboard isolation', () => {
 const s=setup(ready),hold=find(s.hud,'voice-hold'),hud=find(s.hud,'voice-hud'),settings=find(s.settings,'voice-settings');
 hold.focus(); assert.equal(doc.activeElement,hold);
 const routes: string[]=[];
 // The tiny DOM fixture has no automatic bubbling: follow the actual hold → HUD → window path.
 const route=(root:El,code:string,type:string)=>{const event=Object.assign(new Event(type,{cancelable:true}),{code,key:code==='KeyV'?'v':' '});let stopped=false;
   event.stopPropagation=()=>{stopped=true;};
   if(root===hud)hold.dispatchEvent(event);root.dispatchEvent(event);if(!stopped)routes.push(`${code}:${type}`);return stopped;};
 assert.equal(route(hud,'KeyV','keydown'),false);assert.equal(route(hud,'KeyV','keyup'),false);
 assert.deepEqual(routes,['KeyV:keydown','KeyV:keyup']);assert.deepEqual(s.calls,[], 'widget must not duplicate global V handling');
 assert.equal(route(settings,'KeyV','keydown'),true);assert.equal(route(settings,'KeyV','keyup'),true);
 assert.equal(route(hud,'Space','keydown'),true);assert.equal(route(hud,'Space','keyup'),true);
 assert.deepEqual(s.calls,[['push',true],['push',false]], 'Space remains local to the button');s.ui.dispose();
});

test('speaking list uses public presence while voice is off, keeps duplicate names distinct and updates literal unsafe nicknames', () => {
 const p={id:21,entityId:3,nick:'Алексей',talking:true}, quiet={id:22,entityId:4,nick:'Тихий',talking:false};
 const s=setup({...base,presence:[p,{...p,id:23,entityId:5},quiet]}), list=find(s.hud,'voice-speakers');
 assert.equal(list.hidden,false);assert.equal(list.children.length,2);
 assert.equal(find(list.children[0],'voice-speaker-name').textContent,'Алексей');
 assert.equal(find(list.children[1],'voice-speaker-name').textContent,'Алексей');
 const first=list.children[0], unsafe='<img src=x onerror=alert(1)> длинный ник';
 s.ui.render({...base,presence:[{...p,nick:unsafe},quiet]});
 assert.equal(list.children.length,1);assert.equal(list.children[0],first,'same participant keeps its row');
 const name=find(first,'voice-speaker-name');assert.equal(name.textContent,unsafe);assert.equal(name.children.length,0);
 assert.equal(name.title,unsafe);assert.equal(first.attrs.get('aria-label'),`${unsafe} — говорит`);
 assert.equal(find(first,'voice-speaker-state').textContent,'говорит');
 assert.equal(find(first,'voice-speaker-icon').attrs.get('aria-hidden'),'true');
 s.ui.render({...base,presence:[{...p,talking:false}]});assert.equal(list.children.length,0);assert.equal(list.hidden,true);
 assert.deepEqual(s.calls,[], 'presence display never joins voice or requests a microphone');s.ui.dispose();
});

test('speaking list includes every simultaneous talker beyond six and own transmission, removes them on room/disconnect and respects HUD visibility', () => {
 const presence=Array.from({length:9},(_,i)=>({id:100+i,entityId:20+i,nick:`Игрок ${i}`,talking:true}));
 const s=setup({...ready,presence,transmitting:true}),list=find(s.hud,'voice-speakers');
 assert.equal(list.children.length,10);
 assert.deepEqual(list.children.map(row=>find(row,'voice-speaker-name').textContent),[...presence.map(p=>p.nick),'Вы']);
 assert.equal(find(list.children[9],'voice-speaker-state').textContent,'говорите');
 assert.equal(list.tabIndex,0,'long list is keyboard-scrollable');
 s.ui.render({...ready,presence,transmitting:false});assert.equal(list.children.length,9);
 s.ui.setVisible(false);assert.equal(find(s.hud,'voice-hud').hidden,true);assert.equal(list.hidden,true);
 s.ui.render({...base,room:'race',presence:[{id:120,entityId:7,nick:'Гонщик',talking:true}]});
 assert.equal(list.children.length,1);assert.equal(list.hidden,true);
 s.ui.setVisible(true);assert.equal(list.hidden,false);assert.equal(find(list,'voice-speaker-name').textContent,'Гонщик');
 // Unavailability wins even if a caller retains its previous presence snapshot.
 s.ui.render({...base,available:false,presence});assert.equal(list.children.length,0);assert.equal(list.hidden,true);
 s.ui.render({...base,presence});assert.equal(list.children.length,9);
 s.ui.render({...base,room:'',presence:[]});assert.equal(list.children.length,0);assert.equal(list.hidden,true);
 s.ui.dispose();assert.equal(s.hud.children.length,0);
});

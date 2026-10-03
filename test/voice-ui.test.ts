// Кнопка голоса в игре (client/ui/voice.ts): состояния, удержание, клавиши, «Сейчас говорят».
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VoiceUi, hudState, type VoiceUiActions } from '../client/ui/voice.ts';
import type { VoicePerson, VoiceView } from '../shared/voice.ts';

// Маленькая подделка DOM: настоящие обработчики виджета без браузера.
class El extends EventTarget {
  tagName: string; className = ''; textContent = ''; hidden = false; disabled = false; type = ''; title = ''; tabIndex = 0; innerHTML = '';
  children: El[] = []; parent: El | null = null; attrs = new Map<string, string>(); dataset: Record<string, string> = {}; captured: number | null = null;
  constructor(tag: string) { super(); this.tagName = tag.toUpperCase(); }
  append(...els: El[]) { for (const e of els) { e.parent = this; this.children.push(e); } }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(e => e !== this); this.parent = null; }
  setAttribute(k: string, v: string) { this.attrs.set(k, v); }
  focus() { doc.activeElement = this; }
  click() { this.dispatchEvent(new Event('click')); }
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
const person = (id: number, o: Partial<VoicePerson> = {}): VoicePerson => ({ id, entityId: id, pid: id, nick: `P${id}`, talking: false, mic: true, muted: false, volume: 1, link: 'connected', ...o });
const base: VoiceView = { available: true, enabled: true, joined: true, room: 'lobby', zone: 'world', mic: 'off', playbackBlocked: false, transmitting: false, receiving: true,
  gameMuted: false, volume: 1, mode: 'hold', noise: true, device: '', linkDown: false, maxPeers: 0, error: '', notice: '', presence: [], people: [], peers: [] };
const ready: VoiceView = { ...base, mic: 'ready' };
function setup(view = base) {
  const root = new El('div'); const calls: Array<[string, ...unknown[]]> = [];
  const a: VoiceUiActions = { connectMic: () => { calls.push(['connectMic']); }, push: v => calls.push(['push', v]), unblock: () => calls.push(['unblock']), openSettings: () => calls.push(['open']) };
  const ui = new VoiceUi(root as unknown as HTMLElement, a);
  ui.render(view); ui.setVisible(true);
  return { ui, root, calls, hold: find(root, 'voice-hold'), hud: find(root, 'voice-hud') };
}

test('состояния кнопки и что делает нажатие: слушаешь — включить микрофон, выключено — меню, звук держат — включить', () => {
  assert.equal(hudState({ ...base, available: false }), 'hidden');
  assert.equal(hudState({ ...base, enabled: false }), 'off');
  assert.equal(hudState(base), 'listen');
  assert.equal(hudState({ ...base, joined: false }), 'connecting');
  assert.equal(hudState({ ...ready, linkDown: true }), 'connecting');
  assert.equal(hudState({ ...base, mic: 'denied' }), 'error');
  assert.equal(hudState({ ...ready, playbackBlocked: true }), 'blocked');
  assert.equal(hudState({ ...ready, transmitting: true }), 'talking');
  assert.equal(hudState({ ...ready, peers: [person(2, { link: 'connecting' })] }), 'connecting');
  assert.equal(hudState({ ...ready, peers: [person(2, { link: 'failed' }), person(3)] }), 'ready', 'часть группы доступна — говорить можно');
  const s = setup();
  assert.equal(s.hold.dataset.state, 'listen'); assert.match(s.hold.title, /V/);
  fire(s.hold, 'click'); assert.deepEqual(s.calls, [['connectMic']]);
  s.ui.render({ ...base, enabled: false }); fire(s.hold, 'click'); assert.deepEqual(s.calls.at(-1), ['open']);
  s.ui.render({ ...base, playbackBlocked: true }); fire(s.hold, 'click'); assert.deepEqual(s.calls.at(-1), ['unblock']);
  assert.equal(find(s.root, 'voice-tip').hidden, false);
  s.ui.render({ ...base, notice: 'Соединяем голос — ещё секунду…' }); assert.equal(find(s.root, 'voice-tip').textContent, 'Соединяем голос — ещё секунду…');
  fire(s.hold, 'contextmenu'); assert.deepEqual(s.calls.at(-1), ['open']);
  s.ui.render({ ...base, available: false }); assert.equal(s.hud.hidden, true);
  s.ui.dispose(); assert.equal(s.root.children.length, 0);
});

test('удержание кнопки отпускается один раз: отпустил, отмена, потеря захвата, спрятали, ушёл фокус, убрали', () => {
  for (const stop of ['pointerup', 'pointercancel', 'lostpointercapture', 'hide', 'blur', 'dispose']) {
    const s = setup(ready);
    fire(s.hold, 'pointerdown', { pointerId: 4, button: 0 });
    fire(s.hold, 'pointerdown', { pointerId: 5, button: 0 });
    if (stop === 'hide') s.ui.setVisible(false); else if (stop === 'blur') fire(win, 'blur'); else if (stop === 'dispose') s.ui.dispose(); else fire(s.hold, stop, { pointerId: 4 });
    fire(s.hold, 'pointerup', { pointerId: 4 });
    assert.deepEqual(s.calls, [['push', true], ['push', false]], stop); s.ui.dispose();
  }
});

test('пока соединение не поднялось или нет игровой связи — кнопка не говорит', () => {
  const s = setup({ ...ready, peers: [person(2, { link: 'connecting' })] });
  fire(s.hold, 'pointerdown', { pointerId: 3, button: 0 }); assert.deepEqual(s.calls, []);
  s.ui.render({ ...ready, linkDown: true }); fire(s.hold, 'pointerdown', { pointerId: 3, button: 0 }); assert.deepEqual(s.calls, []);
  s.ui.render({ ...ready, peers: [person(2)] }); fire(s.hold, 'pointerdown', { pointerId: 3, button: 0 }); assert.deepEqual(s.calls, [['push', true]]);
  s.ui.render({ ...ready, peers: [person(2, { link: 'failed' })] }); assert.deepEqual(s.calls, [['push', true], ['push', false]], 'связь пропала — отпускаем');
  s.ui.dispose();
});

test('клавиши: пробел на кнопке — удержание без повторов; V проходит в игру, остальное — нет', () => {
  const s = setup(ready);
  fire(s.hold, 'keydown', { key: ' ', repeat: false }); fire(s.hold, 'keydown', { key: ' ', repeat: true }); fire(s.hold, 'keyup', { key: ' ' });
  assert.deepEqual(s.calls, [['push', true], ['push', false]]);
  const route = (code: string) => { let stopped = false; const e = Object.assign(new Event('keydown'), { code, key: code }); e.stopPropagation = () => { stopped = true; }; s.hud.dispatchEvent(e); return stopped; };
  assert.equal(route('KeyV'), false); assert.equal(route('Escape'), false); assert.equal(route('KeyW'), true);
  s.ui.render(base); fire(s.hold, 'keydown', { key: 'Enter', repeat: false }); assert.deepEqual(s.calls.at(-1), ['connectMic'], 'без микрофона Enter — включить его');
  s.ui.dispose();
});

test('«Сейчас говорят»: и без голоса, одинаковые ники раздельно, ник — текстом, заглушённых не показываем, свой — «Ты»', () => {
  const unsafe = '<img src=x onerror=alert(1)>';
  const s = setup({ ...base, enabled: false, people: [person(21, { nick: 'Алексей', talking: true }), person(23, { nick: 'Алексей', talking: true }), person(24, { talking: true, muted: true }), person(25)] });
  const list = find(s.root, 'voice-speakers');
  assert.equal(list.hidden, false); assert.equal(list.children.length, 2);
  const first = list.children[0];
  s.ui.render({ ...ready, transmitting: true, people: [person(21, { nick: unsafe, talking: true })] });
  assert.equal(list.children[0], first, 'тот же человек — та же строка');
  assert.equal(find(first, 'voice-speaker-name').textContent, unsafe); assert.equal(find(first, 'voice-speaker-name').children.length, 0);
  assert.deepEqual(list.children.map(r => find(r, 'voice-speaker-name').textContent), [unsafe, 'Ты']);
  s.ui.setVisible(false); assert.equal(list.hidden, true);
  s.ui.setVisible(true); s.ui.render({ ...base, available: false, people: [person(21, { talking: true })] }); assert.equal(list.children.length, 0);
  assert.deepEqual(s.calls, []); s.ui.dispose();
});

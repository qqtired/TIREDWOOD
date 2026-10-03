// Кнопка голоса в игре (client/ui/voice.ts): состояния, удержание, клавиши, «Сейчас говорят».
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VoiceUi, hudState, type VoiceUiActions } from '../client/ui/voice.ts';
import type { VoicePerson, VoiceView } from '../shared/voice.ts';

// Маленькая подделка DOM: настоящие обработчики виджета без браузера.
class El extends EventTarget {
  tagName: string; className = ''; textContent = ''; hidden = false; disabled = false; type = ''; title = ''; tabIndex = 0; innerHTML = '';
  children: El[] = []; parent: El | null = null; attrs = new Map<string, string>(); dataset: Record<string, string> = {}; captured: number | null = null;
  style = { props: new Map<string, string>(), setProperty(k: string, v: string) { this.props.set(k, v); } };
  constructor(tag: string) { super(); this.tagName = tag.toUpperCase(); }
  append(...els: El[]) { for (const e of els) { e.remove(); e.parent = this; this.children.push(e); } }
  after(e: El) { const p = this.parent!; e.remove(); e.parent = p; p.children.splice(p.children.indexOf(this) + 1, 0, e); }
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
function setup(view = base, extra: Partial<VoiceUiActions> = {}) {
  const root = new El('div'); const calls: Array<[string, ...unknown[]]> = [];
  const a: VoiceUiActions = { connectMic: () => { calls.push(['connectMic']); }, push: v => calls.push(['push', v]), unblock: () => calls.push(['unblock']), openSettings: () => calls.push(['open']), selfNick: () => 'Tester7', ...extra };
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

test('«кто говорит»: плашка — динамик и ник (свой — свой ник с рамкой), без слов «говорит»; новые сверху; больше пяти — «+N»; ушедшие гаснут', async () => {
  const unsafe = '<img src=x onerror=alert(1)>';
  const s = setup({ ...base, enabled: false, people: [person(21, { nick: 'Алексей', talking: true }), person(23, { nick: 'Алексей', talking: true }), person(24, { talking: true, muted: true }), person(25)] });
  const list = find(s.root, 'voice-speakers'), more = find(s.root, 'voice-more');
  const rows = () => list.children.filter(r => r !== more && !('out' in r.dataset));
  const shown = () => rows().filter(r => !r.hidden).map(r => find(r, 'voice-speaker-name').textContent);
  assert.equal(list.hidden, false); assert.equal(rows().length, 2, 'и без голоса; одинаковые ники — раздельно; заглушённых нет');
  for (const r of rows()) {
    assert.deepEqual(r.children.map(c => c.className), ['voice-speaker-icon', 'voice-speaker-name'], 'значок и ник — без «говорит»');
    assert.match(find(r, 'voice-speaker-icon').innerHTML, /class="vw1".*class="vw2"/, 'динамик с волнами');
  }
  const r21 = rows()[1];
  assert.deepEqual(rows().map(r => r.attrs.get('aria-label')), ['Алексей говорит', 'Алексей говорит']);
  s.ui.render({ ...ready, transmitting: true, people: [person(21, { nick: unsafe, talking: true })] });
  assert.equal(rows()[0], r21, 'тот же человек — та же строка, на месте');
  assert.equal(find(r21, 'voice-speaker-name').textContent, unsafe); assert.equal(find(r21, 'voice-speaker-name').children.length, 0, 'ник — текстом');
  assert.deepEqual(shown(), [unsafe, 'Tester7'], 'свой — внизу, у кнопки, своим ником');
  const self = rows()[1]; assert.equal('self' in self.dataset, true, 'свой — с рамкой'); assert.equal(self.attrs.get('aria-label'), 'Ты говоришь');
  assert.equal(list.children.filter(r => 'out' in r.dataset).length, 1, 'замолчавший Алексей гаснет');
  // семеро и я: видны я и трое, кто начал раньше, сверху «+4»; новенькие встают сверху и не двигают остальных
  const seven = [31, 32, 33, 34, 35, 36, 37].map(id => person(id, { talking: true }));
  s.ui.render({ ...ready, transmitting: true, people: seven });
  assert.deepEqual(shown(), ['P33', 'P32', 'P31', 'Tester7']); assert.equal(more.hidden, false); assert.equal(more.textContent, '+4');
  assert.equal(list.children[0], more, '«+N» — сверху');
  s.ui.render({ ...ready, transmitting: true, notice: 'Соединяем голос — ещё секунду…', people: seven });
  assert.deepEqual(shown(), ['P32', 'P31', 'Tester7'], 'под подсказкой — на строку меньше'); assert.equal(more.textContent, '+5');
  s.ui.render({ ...ready, transmitting: true, people: seven.slice(0, 3) });
  assert.deepEqual(shown(), ['P33', 'P32', 'P31', 'Tester7']); assert.equal(more.hidden, true);
  s.ui.setVisible(false); assert.equal(list.hidden, true);
  s.ui.setVisible(true); s.ui.render({ ...base, available: false, people: [person(21, { talking: true })] }); assert.equal(rows().length, 0);
  await new Promise(r => setTimeout(r, 300));
  assert.deepEqual(list.children, [more], 'погасшие строки убраны'); assert.equal(list.hidden, true);
  assert.deepEqual(s.calls, []); s.ui.dispose();
});

test('«кто говорит»: волны — по громкости голоса, без уровня — спокойная пульсация', async () => {
  const frames = globalThis as unknown as { requestAnimationFrame?: (cb: (t: number) => void) => number };
  frames.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), 5) as unknown as number;
  try {
    const s = setup(ready, { level: id => id === 'self' ? 0.8 : null });
    s.ui.render({ ...ready, transmitting: true, people: [person(41, { talking: true })] });
    await new Promise(r => setTimeout(r, 120));
    const list = find(s.root, 'voice-speakers'), rows = list.children.filter(r => !r.className.includes('voice-more'));
    const [other, self] = rows;
    assert.equal(self.dataset.lvl, 'live'); assert.equal(self.style.props.get('--lvl'), '0.80');
    assert.equal(other.dataset.lvl, 'calm', 'уровня нет — спокойно');
    s.ui.dispose();
  } finally { delete frames.requestAnimationFrame; }
});

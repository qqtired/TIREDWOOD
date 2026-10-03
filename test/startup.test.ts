import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runStartup, waitForFrames, waitForFonts, type StartupStage } from '../client/startup.ts';

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const gate = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };

test('startup paints before loading, advances only on real work, and keeps cover until frames finish', async () => {
  const events: string[] = [];
  const moduleGate = gate(), fonts = gate(), frames = gate();
  const result = runStartup({
    view: { stage: s => events.push(s), finish: () => events.push('finish'), fail: () => events.push('fail') },
    paint: async () => { events.push('paint'); },
    load: async () => { events.push('load'); await moduleGate.promise; return { prepareFonts: () => fonts.promise, start: () => { events.push('start'); } }; },
    frames: () => frames.promise, report: () => {},
  });
  await flush(); assert.deepEqual(events, ['modules', 'paint', 'load']);
  moduleGate.resolve(); await flush(); assert.equal(events.at(-1), 'fonts');
  fonts.resolve(); await flush(); assert.deepEqual(events.slice(-4), ['world', 'paint', 'start', 'frame']);
  assert.ok(!events.includes('finish')); frames.resolve(); await result; assert.equal(events.at(-1), 'finish');
});

for (const failure of ['modules', 'fonts', 'world', 'frame'] as const) {
  test(`startup ${failure} failure stays actionable and is reported once without retry`, async () => {
    const events: string[] = []; const error = new Error('<img src=x onerror=alert(1)>');
    let stage: StartupStage = 'modules';
    await runStartup({
      view: { stage: s => { stage = s; }, finish: () => events.push('finish'), fail: s => events.push(`failed:${s}`) },
      paint: async () => {},
      load: async () => { if (failure === 'modules') throw error; return {
        prepareFonts: async () => { if (failure === 'fonts') throw error; },
        start: () => { if (failure === 'world') throw error; },
      }; },
      frames: async () => { if (failure === 'frame') throw error; },
      report: err => { assert.equal(err, error); events.push('reported'); },
    });
    assert.equal(stage, failure); assert.deepEqual(events, [`failed:${failure}`, 'reported']);
  });
}

test('two frame barrier waits for an intervening browser paint and cleans error listeners', async () => {
  const target = new EventTarget(); const frames: FrameRequestCallback[] = [];
  let done = false;
  const result = waitForFrames(target, cb => { frames.push(cb); return frames.length; }, () => {}).then(() => { done = true; });
  frames.shift()!(0); await flush(); assert.equal(done, false);
  frames.shift()!(16); await result; assert.equal(done, true);
  target.dispatchEvent(new Event('error')); // a later game error must not change completed startup
});

test('a first-frame error rejects instead of revealing a broken game and cancels the probe', async () => {
  const target = new EventTarget(); const cancelled: number[] = [];
  const result = waitForFrames(target, () => 7, id => cancelled.push(id));
  const error = new Error('WebGL context lost'); const event = new Event('error');
  Object.defineProperty(event, 'error', { value: error });
  target.dispatchEvent(event);
  await assert.rejects(result, err => err === error); assert.deepEqual(cancelled, [7]);
});

test('font wait preserves canvas Cyrillic/Latin loads and clears its deadline on success', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls: string[] = [];
  await waitForFonts({ load: async (font: string, text: string) => { calls.push(`${font}:${text}`); return []; } });
  assert.deepEqual(calls, ['700 30px Rubik:Аб7', '900 40px Rubik:Аб7']);
});

test('font failure or timeout still permits the existing fallback font startup', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  await waitForFonts({ load: async () => { throw Error('offline'); } });
  let ready = false;
  const pending = waitForFonts({ load: () => new Promise<FontFace[]>(() => {}) }).then(() => { ready = true; });
  await flush(); assert.equal(ready, false);
  t.mock.timers.tick(1500); await pending; assert.equal(ready, true);
});

test('startup view exposes safe failure text and one deliberate reload, while leaving game inert', async () => {
  const { startupView } = await import('../client/startup.ts');
  const elements = new Map<string, FakeElement>(['startup-status', 'startup-title', 'startup-progress', 'startup-retry'].map(id => [id, new FakeElement()]));
  const root = new FakeElement();
  root.querySelector = (selector: string) => elements.get(selector.slice(1))!;
  const hud = new FakeElement(), menus = new FakeElement(); hud.inert = menus.inert = true;
  let reloads = 0;
  const view = startupView(root as unknown as HTMLElement, [hud, menus] as unknown as HTMLElement[], () => { reloads++; });
  view.stage('world');
  assert.equal(root.dataset.stage, 'world');
  assert.equal(elements.get('startup-progress')!.attributes.get('aria-valuetext'), 'Собираем набережную…');
  view.fail('modules');
  assert.match(elements.get('startup-status')!.textContent, /Проверьте соединение/);
  assert.equal(elements.get('startup-progress')!.hidden, true);
  const retry = elements.get('startup-retry')!;
  assert.equal(retry.hidden, false); assert.equal(retry.focused, true);
  assert.equal(reloads, 0); assert.equal(hud.inert, true); assert.equal(menus.inert, true); assert.equal(root.removed, false);
  retry.listeners.get('click')!(); assert.equal(reloads, 1); assert.equal(retry.disabled, true);
});

test('successful view removes the cover and restores HUD/menu interaction immediately', async () => {
  const { startupView } = await import('../client/startup.ts');
  const root = new FakeElement();
  root.querySelector = () => new FakeElement();
  const hud = new FakeElement(), menus = new FakeElement(); hud.inert = menus.inert = true;
  const view = startupView(root as unknown as HTMLElement, [hud, menus] as unknown as HTMLElement[], () => {});
  view.finish();
  assert.equal(root.removed, true); assert.equal(hud.inert, false); assert.equal(menus.inert, false);
});

// A narrow DOM double: deliberately no innerHTML setter, so error markup cannot be interpolated.
class FakeElement {
  dataset: Record<string, string> = {};
  textContent = '';
  hidden = true;
  inert = false;
  disabled = false;
  focused = false;
  removed = false;
  attributes = new Map<string, string>();
  listeners = new Map<string, () => void>();
  querySelector: (selector: string) => FakeElement = () => { throw Error('Unexpected selector'); };
  set innerHTML(_value: string) { throw Error('Startup must use safe DOM text'); }
  setAttribute(key: string, value: string) { this.attributes.set(key, value); }
  addEventListener(type: string, listener: () => void) { this.listeners.set(type, listener); }
  focus() { this.focused = true; }
  remove() { this.removed = true; }
}

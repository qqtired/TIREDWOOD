// External boundaries for release-command tests. Never opens a socket or executes SSH.
import fs from 'node:fs';
import vm from 'node:vm';

const fixture = JSON.parse(process.env.OPUS_RELEASE_FIXTURE);
if (fixture.kind === 'health') {
  globalThis.fetch = async (url) => {
    if (String(url) !== 'https://game.tired.solutions/health') throw new Error('unexpected request');
    fs.appendFileSync(process.env.OPUS_RELEASE_CALLS, 'health\n');
    if (fixture.unreachable) throw new Error('offline fixture');
    return new Response(fixture.body, { status: fixture.status ?? 200 });
  };
} else if (fixture.kind === 'csp') {
  const flags = fixture.flags ?? { fortress: true, fight: true, fish2: true };
  const state = { screen: 'game', scene: 'lobby', nick: 'Tester6', pos: [0, 1, 0], paused: false, ...fixture.state };
  const canvas = fixture.missingCanvas ? null : { width: 1280, height: 720, clientWidth: 1280, clientHeight: 720 };
  const listeners = new Map();
  const page = {
    setTimeout: (fn) => setTimeout(fn, 0),
    document: {
      scripts: fixture.missingBuild ? [] : [{ src: 'http://localhost:5192/assets/index-fixture.js' }],
      querySelector: (selector) => selector === 'input.name' ? { value: '' } : selector === '#game' || selector === 'canvas' ? canvas : null,
      querySelectorAll: (selector) => selector === 'img.coin' ? [{ complete: true, naturalWidth: fixture.brokenImage ? 0 : 32, naturalHeight: 32 }] : [],
      addEventListener: (type, fn) => listeners.set(type, fn),
    },
    __opus: fixture.missingApp ? undefined : {
      state: () => ({ ...state }),
      app: {
        active: { fortGate: flags.fortress ? {} : null, fcDoor: flags.fight ? {} : null, fish2: { on: flags.fish2 }, world: { look: null } },
        input: { locked: false },
        play: () => {},
        setPaused: (paused) => { state.paused = paused; },
      },
    },
  };
  page.window = page;
  const context = vm.createContext(page);
  let init = '';
  let socket;
  globalThis.fetch = async (url) => {
    const u = new URL(url);
    if (u.hostname !== '127.0.0.1') throw new Error('only mocked CDP allowed');
    if (u.pathname === '/json/new') return Response.json({ id: 'fixture', webSocketDebuggerUrl: 'ws://127.0.0.1/fixture' });
    if (u.pathname === '/json/close/fixture') return new Response('ok');
    throw new Error('unexpected CDP HTTP request');
  };
  globalThis.WebSocket = class {
    constructor(url) {
      if (url !== 'ws://127.0.0.1/fixture') throw new Error('unexpected WebSocket');
      socket = this;
      queueMicrotask(() => this.onopen?.({}));
    }
    emit(message) { this.onmessage?.({ data: JSON.stringify(message) }); }
    send(text) {
      const { id, method, params } = JSON.parse(text);
      queueMicrotask(async () => {
        let result = {};
        if (method === 'Page.addScriptToEvaluateOnNewDocument') init = params.source;
        if (method === 'Page.navigate' && params.url !== 'about:blank') {
          if (fixture.navigationError) result.errorText = 'fixture navigation failed';
          if (init) vm.runInContext(init, context);
          for (const violation of fixture.csp ?? []) listeners.get('securitypolicyviolation')?.({ violatedDirective: violation, blockedURI: 'https://fixture.invalid/asset' });
          for (const entry of fixture.logs ?? []) socket.emit({ method: 'Log.entryAdded', params: { entry } });
          if (fixture.exception) socket.emit({ method: 'Runtime.exceptionThrown', params: { exceptionDetails: { text: fixture.exception } } });
          for (const entry of fixture.console ?? []) socket.emit({ method: 'Runtime.consoleAPICalled', params: { type: entry.type, args: [{ value: entry.text }] } });
        }
        if (method === 'Page.navigate' && params.url === 'about:blank' && fixture.lateError) socket.emit({ method: 'Log.entryAdded', params: { entry: { level: 'error', text: 'late fixture resource error' } } });
        if (method === 'Runtime.evaluate') {
          try {
            result = { result: { value: await vm.runInContext(params.expression, context) } };
          } catch (error) {
            result = { exceptionDetails: { text: error.message, exception: { description: error.message } } };
          }
        }
        if (method === 'Page.captureScreenshot') result.data = Buffer.from('fixture screenshot').toString('base64');
        this.emit({ id, result });
      });
    }
    close() { this.onclose?.({}); }
  };
} else {
  throw new Error('unknown release fixture');
}

// Панель «Голос» для меню: слышать ли голос, громкость, как говорить, устройство и шумоподавление, проверка
// микрофона (уровень и «послушать себя»), кто в голосе — у каждого своя громкость и «заглушить».
// Меню вызывает mountVoicePanel(корень вкладки), когда вкладку открыли, и возвращённую функцию — когда ушли.
// Голос (контроллер) появляется после ответа сервера: если вкладку открыли раньше — панель дождётся его сама.
import type { VoiceMode, VoicePerson, VoiceView } from '../../shared/voice.ts';
import { MicTest } from '../voice-mictest.ts';
import './voicepanel.css';

/** Что панели нужно от голоса (client/voice.ts → VoiceController) */
export interface VoicePanelSource {
  readonly view: VoiceView;
  subscribe(fn: (view: VoiceView) => void): () => void;
  setListen(on: boolean): void;
  setVolume(volume: number): void;
  setMode(mode: VoiceMode): void;
  setDevice(id: string): void;
  setNoise(on: boolean): void;
  enableMic(): Promise<void>;
  disableMic(): void;
  setPeerMuted(pid: number, muted: boolean): void;
  setPeerVolume(pid: number, volume: number): void;
  micConstraints(): MediaStreamConstraints;
  rejoin(): void;
  unblock(): Promise<void>;
}

let source: VoicePanelSource | null = null;
const waiting = new Set<() => void>();
/** Игра регистрирует голос, когда сервер его включил (и null, если выключил совсем). */
export function setVoiceSource(next: VoicePanelSource | null): void {
  source = next;
  for (const fn of [...waiting]) fn();
}

/** Зоны голоса по-человечески: «world» — весь внешний мир, остальное — отдельная игра */
const ZONE: Record<string, string> = {
  world: 'Внешний мир', paintball: 'Склад (пейнтбол)', race: 'Картинг', fort: 'Крепость', fight: 'Подвал', skill: 'Выше облаков', hide: 'Прятки',
};
export function zoneLabel(zone: string): string { return ZONE[zone] ?? (zone ? 'Своя игра' : '—'); }
const ZONE_HINT = 'Во внешнем мире — набережная, море с катерами, баркас — слышно всех. В режимах (крепость, картинг, прятки…) — только тех, кто в той же игре.';

const MIC: Record<VoiceView['mic'], string> = {
  off: 'Выключен. Включится по V в игре или этой кнопкой — браузер спросит разрешение один раз.',
  requesting: 'Ждём разрешения браузера…',
  ready: '',
  denied: 'Запрещён в браузере. Разреши микрофон (значок слева от адреса) и нажми «Включить».',
  unavailable: 'Не найден или занят другой программой. Подключи микрофон и нажми «Включить».',
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}
function setText(e: HTMLElement, value: string): void { if (e.textContent !== value) e.textContent = value; }
function button(cls: string, text: string): HTMLButtonElement { const b = el('button', cls, text); b.type = 'button'; return b; }
const pct = (v: number): string => `${Math.round(v * 100)}%`;

/** Строка: название с пояснением слева, управление справа */
function row(parent: HTMLElement, title: string, hint: string): { ctl: HTMLElement; hint: HTMLElement } {
  const r = parent.appendChild(el('div', 'vp-row'));
  const t = r.appendChild(el('div', 'vp-text'));
  t.append(el('b', '', title));
  const h = t.appendChild(el('small', '', hint));
  return { ctl: r.appendChild(el('div', 'vp-ctl')), hint: h };
}
function toggle(ctl: HTMLElement, label: string): HTMLInputElement {
  const sw = ctl.appendChild(el('label', 'vp-sw'));
  const input = sw.appendChild(el('input'));
  input.type = 'checkbox';
  input.setAttribute('aria-label', label);
  sw.append(el('i'));
  return input;
}
function range(ctl: HTMLElement, label: string): { input: HTMLInputElement; value: HTMLElement } {
  const input = ctl.appendChild(el('input'));
  input.type = 'range'; input.min = '0'; input.max = '100'; input.step = '1';
  input.setAttribute('aria-label', label);
  return { input, value: ctl.appendChild(el('b', 'vp-num')) };
}

/** Панель в корень вкладки. Возвращает «убрать»: панель, подписки и проверка микрофона закрываются. */
export function mountVoicePanel(root: HTMLElement): () => void {
  const wrap = root.appendChild(el('div', 'vp'));
  const empty = wrap.appendChild(el('p', 'vp-empty', 'Голосовой чат сейчас недоступен: его включает сервер, настройки появятся здесь после подключения.'));
  const body = wrap.appendChild(el('div', 'vp-body'));
  body.hidden = true;
  // клавиши в полях панели не уходят в игру (как в остальном меню); Esc и M — работают
  const ownKeys = (e: KeyboardEvent): void => { if (e.code !== 'Escape' && e.code !== 'KeyM') e.stopPropagation(); };
  wrap.addEventListener('keydown', ownKeys);
  wrap.addEventListener('keyup', ownKeys);

  // --- состояние
  const status = body.appendChild(el('div', 'vp-status'));
  status.setAttribute('role', 'status');
  const zoneName = status.appendChild(el('b'));
  const zoneInfo = status.appendChild(el('span'));
  const alert = body.appendChild(button('vp-alert', ''));
  alert.hidden = true;
  body.appendChild(el('p', 'vp-hint', ZONE_HINT));

  // --- голос
  const main = body.appendChild(el('section', 'vp-group'));
  main.append(el('h3', '', 'Голос'));
  const listen = toggle(row(main, 'Слышать голос', 'После входа ты сразу слышишь всех рядом — без микрофона и без вопросов браузера.').ctl, 'Слышать голос');
  const vol = range(row(main, 'Громкость голоса', 'Всех сразу. Свою громкость каждому — ниже, в списке.').ctl, 'Громкость голоса');
  const micRow = row(main, 'Микрофон', '');
  const micBtn = micRow.ctl.appendChild(button('btn ghost vp-btn', 'Включить'));
  const modeRow = row(main, 'Как говорить', 'V — клавиша голоса. На телефоне — кнопка с микрофоном.');
  const seg = modeRow.ctl.appendChild(el('div', 'vp-seg'));
  seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Как говорить');
  const modes: Array<[VoiceMode, HTMLButtonElement]> = [['hold', button('', 'Пока держу V')], ['toggle', button('', 'V — вкл/выкл')]];
  for (const [, b] of modes) seg.append(b);
  const devRow = row(main, 'Устройство', '');
  const device = devRow.ctl.appendChild(el('select', 'vp-select'));
  device.setAttribute('aria-label', 'Микрофон');
  const noise = toggle(row(main, 'Шумоподавление', 'Браузер приглушает вентилятор, клавиатуру и улицу. Выключи, если голос звучит «из бочки».').ctl, 'Шумоподавление');

  // --- проверка микрофона
  const testBox = body.appendChild(el('section', 'vp-group'));
  testBox.append(el('h3', '', 'Проверка микрофона'));
  const meterRow = row(testBox, 'Уровень', 'Скажи что-нибудь: полоска должна прыгать. В игру проверка не передаётся.');
  const meter = meterRow.ctl.appendChild(el('div', 'vp-meter'));
  const bar = meter.appendChild(el('i'));
  meter.setAttribute('role', 'meter'); meter.setAttribute('aria-label', 'Уровень микрофона'); meter.setAttribute('aria-valuemin', '0'); meter.setAttribute('aria-valuemax', '100');
  const testBtn = meterRow.ctl.appendChild(button('btn ghost vp-btn', 'Проверить'));
  const echoRow = row(testBox, 'Послушать себя', 'Твой голос вернётся через 0,6 секунды. Лучше в наушниках — иначе колонки дадут эхо.');
  const echo = toggle(echoRow.ctl, 'Послушать себя');
  const testMsg = testBox.appendChild(el('p', 'vp-msg'));
  testMsg.hidden = true;

  // --- люди
  const peopleBox = body.appendChild(el('section', 'vp-group'));
  const peopleHead = peopleBox.appendChild(el('h3', '', 'Кто в голосе'));
  const list = peopleBox.appendChild(el('ul', 'vp-people'));
  const nobody = peopleBox.appendChild(el('p', 'vp-msg', 'Пока рядом никого нет.'));
  const rows = new Map<number, { root: HTMLElement; name: HTMLElement; state: HTMLElement; vol: HTMLInputElement; val: HTMLElement; mute: HTMLButtonElement; pid: number }>();

  const foot = body.appendChild(el('div', 'vp-foot'));
  foot.append(el('p', 'vp-note', 'Голос идёт напрямую между игроками: собеседники могут узнать твой IP-адрес. Игра разговоры не записывает.'));
  const rejoin = foot.appendChild(button('btn ghost vp-btn', 'Переподключить голос'));

  let src: VoicePanelSource | null = null;
  let off: (() => void) | null = null;
  let view: VoiceView | null = null;
  const test = new MicTest();
  let raf = 0;
  let devicesAsked = false;

  // --- действия
  listen.addEventListener('change', () => src?.setListen(listen.checked));
  vol.input.addEventListener('input', () => { src?.setVolume(Number(vol.input.value) / 100); setText(vol.value, `${vol.input.value}%`); });
  micBtn.addEventListener('click', () => {
    if (!src || !view) return;
    if (view.mic === 'ready') src.disableMic(); else void src.enableMic().then(() => { void listDevices(); });
  });
  for (const [mode, b] of modes) b.addEventListener('click', () => src?.setMode(mode));
  device.addEventListener('change', () => { src?.setDevice(device.value); if (test.running) void startTest(); });
  noise.addEventListener('change', () => { src?.setNoise(noise.checked); if (test.running) void startTest(); });
  testBtn.addEventListener('click', () => { if (test.running) stopTest(); else void startTest(); });
  echo.addEventListener('change', () => test.setEcho(echo.checked));
  alert.addEventListener('click', () => { void src?.unblock(); });
  rejoin.addEventListener('click', () => src?.rejoin());

  async function startTest(): Promise<void> {
    if (!src) return;
    testMsg.hidden = true;
    setText(testBtn, 'Открываем…');
    const error = await test.start(src.micConstraints());
    if (!wrap.isConnected) { test.stop(); return; }
    if (error) { stopTest(); setText(testMsg, error); testMsg.hidden = false; return; }
    test.setEcho(echo.checked);
    setText(testBtn, 'Остановить');
    if (test.label) { setText(testMsg, `Слушаем: ${test.label}`); testMsg.hidden = false; }
    void listDevices();
    if (!raf) raf = requestAnimationFrame(tick);
  }
  function stopTest(): void {
    test.stop();
    setText(testBtn, 'Проверить');
    bar.style.width = '0%'; meter.setAttribute('aria-valuenow', '0');
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }
  function tick(): void {
    raf = 0;
    // панель спрятали (закрыли меню) — микрофон проверки отпускаем сразу
    if (!test.running || !wrap.isConnected || wrap.offsetParent === null) { stopTest(); return; }
    const level = test.level();
    bar.style.width = `${Math.round(level * 100)}%`;
    meter.classList.toggle('loud', level > 0.85);
    meter.setAttribute('aria-valuenow', String(Math.round(level * 100)));
    raf = requestAnimationFrame(tick);
  }

  /** Список микрофонов. Названия браузер открывает только после разрешения — до него «Микрофон 1, 2…» */
  async function listDevices(): Promise<void> {
    devicesAsked = true;
    let all: MediaDeviceInfo[] = [];
    try { all = (await navigator.mediaDevices?.enumerateDevices() ?? []).filter(d => d.kind === 'audioinput'); }
    catch { all = []; }
    if (!wrap.isConnected) return;
    // «default» и «communications» — те же системные; до разрешения у устройств нет ни названий, ни номеров
    const inputs = all.filter(d => d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications');
    const chosen = view?.device ?? '';
    device.replaceChildren();
    const sys = el('option', '', 'Как в системе'); sys.value = ''; device.append(sys);
    inputs.forEach((d, i) => { const o = el('option', '', d.label || `Микрофон ${i + 1}`); o.value = d.deviceId; device.append(o); });
    if (chosen && !inputs.some(d => d.deviceId === chosen)) { const o = el('option', '', 'Выбранный раньше (не подключён)'); o.value = chosen; device.append(o); }
    device.value = chosen;
    setText(devRow.hint, !all.length ? 'Браузер не видит ни одного микрофона.'
      : all.some(d => d.label) ? 'Какой микрофон слушать. Меняется сразу, без переподключения.'
      : 'Список появится после разрешения микрофона (нажми «Включить» или «Проверить»).');
  }
  const onDeviceChange = (): void => { void listDevices(); };
  navigator.mediaDevices?.addEventListener?.('devicechange', onDeviceChange);

  function personState(p: VoicePerson): string {
    if (p.muted) return 'заглушён тобой';
    if (p.talking) return 'говорит';
    if (p.link === 'failed') return 'нет связи — переподключаем';
    if (p.link === 'connecting') return 'соединяем…';
    return p.mic ? 'с микрофоном' : 'слушает';
  }
  function renderPeople(v: VoiceView): void {
    const seen = new Set<number>();
    for (const p of v.people) {
      seen.add(p.id);
      let r = rows.get(p.id);
      if (!r) {
        const li = el('li', 'vp-person');
        const who = li.appendChild(el('div', 'vp-who'));
        const name = who.appendChild(el('b'));
        const state = who.appendChild(el('small'));
        const ctl = li.appendChild(el('div', 'vp-ctl'));
        const rg = range(ctl, '');
        const mute = ctl.appendChild(button('btn ghost vp-btn vp-mute', ''));
        const pid = p.pid;
        rg.input.addEventListener('input', () => { src?.setPeerVolume(pid, Number(rg.input.value) / 100); setText(rg.value, `${rg.input.value}%`); });
        mute.addEventListener('click', () => { const cur = view?.people.find(q => q.pid === pid); if (cur) src?.setPeerMuted(pid, !cur.muted); });
        r = { root: li, name, state, vol: rg.input, val: rg.value, mute, pid };
        rows.set(p.id, r);
        list.append(li);
      }
      setText(r.name, p.nick); r.name.title = p.nick;
      setText(r.state, personState(p));
      r.root.classList.toggle('talking', p.talking && !p.muted);
      r.root.classList.toggle('muted', p.muted);
      r.vol.setAttribute('aria-label', `Громкость: ${p.nick}`);
      if (document.activeElement !== r.vol) r.vol.value = String(Math.round(p.volume * 100));
      setText(r.val, pct(p.volume));
      r.vol.disabled = p.muted;
      setText(r.mute, p.muted ? 'Слушать' : 'Заглушить');
      r.mute.setAttribute('aria-pressed', String(p.muted));
      r.mute.setAttribute('aria-label', `${p.muted ? 'Слушать' : 'Заглушить'}: ${p.nick}`);
    }
    for (const [id, r] of rows) if (!seen.has(id)) { r.root.remove(); rows.delete(id); }
    nobody.hidden = v.people.length > 0;
    setText(peopleHead, v.people.length ? `Кто в голосе · ${v.people.length}` : 'Кто в голосе');
  }

  function render(v: VoiceView): void {
    view = v;
    empty.hidden = v.available;
    body.hidden = !v.available;
    if (!v.available) {
      setText(empty, v.error || 'Голосовой чат сейчас недоступен: его включает сервер, настройки появятся здесь после подключения.');
      return;
    }
    setText(zoneName, v.enabled ? zoneLabel(v.zone) : 'Голос выключен');
    const count = v.people.length + (v.joined ? 1 : 0);
    setText(zoneInfo, !v.enabled ? ' — ты никого не слышишь, и тебя не слышно'
      : v.linkDown ? ' · связь с сервером пропала, ждём' : !v.joined ? ' · подключаемся…'
      : count > 1 ? ` · в голосе ${count} (с тобой)` : ' · пока ты один');
    const alertText = v.playbackBlocked ? 'Браузер не включил звук голоса — нажми сюда, чтобы слышать' : v.notice;
    setText(alert, alertText); alert.hidden = !alertText; alert.disabled = !v.playbackBlocked;
    listen.checked = v.enabled;
    if (document.activeElement !== vol.input) vol.input.value = String(Math.round(v.volume * 100));
    setText(vol.value, pct(v.volume));
    vol.input.disabled = !v.enabled;
    const micText = v.mic === 'ready' ? (v.transmitting ? 'Тебя слышат.' : v.mode === 'hold' ? 'Включён: говори, удерживая V.' : 'Включён: V включает и выключает передачу.')
      : v.error && (v.mic === 'denied' || v.mic === 'unavailable') ? v.error : MIC[v.mic];
    setText(micRow.hint, v.enabled ? micText : 'Сначала включи «Слышать голос».');
    setText(micBtn, v.mic === 'ready' ? 'Выключить' : v.mic === 'requesting' ? 'Ждём…' : 'Включить');
    micBtn.disabled = !v.enabled || v.mic === 'requesting';
    micBtn.setAttribute('aria-pressed', String(v.mic === 'ready'));
    for (const [mode, b] of modes) b.setAttribute('aria-pressed', String(v.mode === mode));
    noise.checked = v.noise;
    if (device.value !== v.device && [...device.options].some(o => o.value === v.device)) device.value = v.device;
    if (v.mic === 'ready' && !devicesAsked) void listDevices();
    rejoin.disabled = !v.enabled;
    renderPeople(v);
  }

  function attach(): void {
    if (src === source) return;
    off?.(); off = null; src = source;
    if (!src) { view = null; empty.hidden = false; body.hidden = true; return; }
    off = src.subscribe(render);
    render(src.view);
    void listDevices();
  }
  waiting.add(attach);
  attach();

  return () => {
    waiting.delete(attach);
    off?.(); off = null; src = null;
    stopTest();
    navigator.mediaDevices?.removeEventListener?.('devicechange', onDeviceChange);
    wrap.remove();
  };
}

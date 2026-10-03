import { voiceCanTransmit, type VoiceView } from '../../shared/voice.ts';

export interface VoiceUiActions {
  connectMic(): void;
  enable(): void; disable(): void; enableMic(): void; disableMic(): void;
  push(on: boolean): void; setReceiving(on: boolean): void; setVolume(volume: number): void;
  setPeerMuted(id: number, muted: boolean): void;
  /** App opens its existing pause and releases pointer lock. */
  openSettings(): void;
}
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag); e.className = cls; e.textContent = text; return e;
}
function button(cls: string, text: string): HTMLButtonElement { const b = el('button', cls, text); b.type = 'button'; return b; }
function text(e: HTMLElement, value: string): void { if (e.textContent !== value) e.textContent = value; }
const micLabels: Record<VoiceView['mic'], string> = {
  off: 'Микрофон выключен', requesting: 'Ждём разрешение микрофона…', ready: 'Микрофон готов · удерживайте V',
  denied: 'Доступ к микрофону запрещён. Разрешите его в браузере и повторите.', unavailable: 'Микрофон недоступен. Проверьте устройство и разрешения браузера.',
};

/** Presentation only: permissions, audio playback and the global V shortcut belong to the controller. */
export class VoiceUi {
  private readonly actions: VoiceUiActions;
  private readonly settings = el('details', 'voice-settings');
  private readonly summary = el('summary', 'voice-summary', 'Голос · выключен');
  private readonly hud = el('div', 'voice-hud');
  private readonly status = el('p', 'voice-status');
  private readonly error = el('p', 'voice-error');
  private readonly gameMute = el('p', 'voice-game-mute', 'Звук выключен · M');
  private readonly enable = button('voice-btn voice-enable', 'Включить голос');
  private readonly retry = button('voice-btn voice-retry', 'Повторить подключение / звук');
  private readonly mic = button('voice-btn voice-mic', 'Разрешить микрофон');
  private readonly receive = button('voice-btn voice-receive', 'Выключить входящий голос');
  private readonly volume = el('input', 'voice-volume');
  private readonly volumeValue = el('span', 'voice-volume-value');
  private readonly peers = el('div', 'voice-peers');
  private readonly group = el('p', 'voice-group');
  private readonly hold = button('voice-hold', '');
  private readonly rows = new Map<number, { root: HTMLElement; name: HTMLElement; state: HTMLElement; mute: HTMLButtonElement }>();
  private readonly cleanup: Array<() => void> = [];
  private view: VoiceView | null = null;
  private visible = false;
  private disposed = false;
  private held = false;
  private pointer: number | null = null;

  constructor(roots: { settingsRoot: HTMLElement; hudRoot: HTMLElement }, actions: VoiceUiActions) {
    this.actions = actions;
    const body = el('div', 'voice-body');
    const intro = el('p', 'voice-note', 'Голос текущей комнаты · до 6 участников. Прямое P2P-соединение: участники могут узнать ваш IP-адрес. Игра не записывает разговоры.');
    const steps = el('p', 'voice-note', 'Нажмите на микрофон в игре и разрешите доступ. Затем удерживайте его или V: отпустили — вас не слышно. Здесь можно подключиться только для прослушивания.');
    const controls = el('div', 'voice-controls'); controls.append(this.enable, this.mic, this.retry);
    const volumeLabel = el('label', 'voice-volume-label');
    volumeLabel.append(el('span', '', 'Громкость голоса'), this.volumeValue, this.volume);
    this.volume.type = 'range'; this.volume.min = '0'; this.volume.max = '100'; this.volume.step = '1';
    this.volume.setAttribute('aria-label', 'Громкость входящего голоса');
    this.status.setAttribute('role', 'status'); this.error.setAttribute('role', 'status');
    this.hold.setAttribute('aria-label', 'Говорить: удерживайте эту кнопку или V');
    this.hold.setAttribute('aria-pressed', 'false');
    this.hold.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M6 11v1a6 6 0 0 0 12 0v-1M12 18v3M9 21h6"/><path class="voice-slash" d="m4 4 16 16"/></svg>';
    const shortcut = el('span', 'voice-key', 'V'); shortcut.setAttribute('aria-hidden', 'true'); this.hold.append(shortcut);
    this.hold.setAttribute('aria-keyshortcuts', 'V Space Enter');
    body.append(intro, steps, controls, this.status, this.error, this.receive, volumeLabel, this.gameMute, this.group, this.peers);
    this.settings.append(this.summary, body); this.hud.append(this.hold);
    this.settings.hidden = true; this.hud.hidden = true;
    roots.settingsRoot.append(this.settings); roots.hudRoot.append(this.hud);
    this.listen(this.enable, 'click', () => { if (this.view?.available) this.view.enabled ? actions.disable() : actions.enable(); });
    this.listen(this.retry, 'click', () => { if (this.view?.available && this.view.enabled) actions.enable(); });
    this.listen(this.mic, 'click', () => {
      if (!this.view?.enabled || !this.view.joined || this.view.mic === 'requesting') return;
      this.release(); this.view.mic === 'ready' ? actions.disableMic() : actions.enableMic();
    });
    this.listen(this.receive, 'click', () => { if (this.view?.enabled) actions.setReceiving(!this.view.receiving); });
    this.listen(this.volume, 'input', () => {
      if (!this.view?.enabled) return;
      const value = Number(this.volume.value); if (Number.isFinite(value)) actions.setVolume(Math.max(0, Math.min(100, value)) / 100);
    });
    this.listen(this.hold, 'click', () => {
      if (this.view?.available && !this.canHold() && this.view.mic !== 'requesting' && !this.connecting()) actions.connectMic();
    });
    this.listen(this.hold, 'contextmenu', event => { event.preventDefault(); this.release(); actions.openSettings(); this.openSettings(); });
    // HUD V reaches App's single PTT controller even while the microphone has focus.
    // Settings and local Space/Enter actions stay isolated from game input.
    for (const root of [this.settings, this.hud]) {
      for (const type of ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'click', 'dblclick', 'contextmenu']) this.listen(root, type, e => e.stopPropagation());
      for (const type of ['keydown', 'keyup']) this.listen(root, type, event => {
        const e = event as KeyboardEvent;
        if (e.key !== 'Escape' && !(root === this.hud && e.code === 'KeyV')) e.stopPropagation();
      });
    }
    this.listen(this.hold, 'pointerdown', event => {
      const e = event as PointerEvent; if (e.button !== 0 || !this.canHold() || this.held) return;
      e.preventDefault(); this.pointer = e.pointerId;
      try { this.hold.setPointerCapture(e.pointerId); } catch { this.pointer = null; return; }
      this.press();
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) this.listen(this.hold, type, e => {
      if ((e as PointerEvent).pointerId === this.pointer) this.release();
    });
    this.listen(this.hold, 'keydown', event => {
      const e = event as KeyboardEvent; if (e.key !== ' ' && e.key !== 'Enter') return;
      e.preventDefault();
      if (!e.repeat) {
        if (this.canHold()) this.press();
        else if (this.view?.available && this.view.mic !== 'requesting' && !this.connecting()) actions.connectMic();
      }
    });
    this.listen(this.hold, 'keyup', event => {
      const e = event as KeyboardEvent; if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); this.release(); }
    });
    this.listen(this.hold, 'blur', () => this.release());
    this.listen(window, 'blur', () => this.release());
    this.listen(document, 'visibilitychange', () => { if (document.hidden) this.release(); });
  }

  /** Call after opening the existing pause, never opens a second modal. */
  openSettings(): void {
    if (this.disposed || !this.view?.available) return;
    this.settings.open = true; this.summary.focus(); this.settings.scrollIntoView({ block: 'nearest' });
  }
  setVisible(game: boolean): void {
    this.visible = game; if (!game) this.release(); this.hud.hidden = !game || !this.view?.available || this.disposed;
  }
  render(view: VoiceView): void {
    if (this.disposed) return;
    this.view = view;
    this.settings.hidden = !view.available; this.hud.hidden = !view.available || !this.visible;
    if (!this.canHold()) this.release();
    if (!view.available) { this.settings.open = false; return; }
    const hasRoute = view.peers.some(p => p.link === 'connected');
    const partial = hasRoute && view.peers.some(p => p.link !== 'connected');
    const failed = view.playbackBlocked || view.mic === 'denied' || view.mic === 'unavailable' || (!hasRoute && (!!view.error || view.peers.some(p => p.link === 'failed')));
    const connecting = this.connecting();
    const state = !view.enabled ? 'Голос выключен' : failed ? 'Нет голосовой связи' : connecting ? 'Подключаем голос…' : !view.peers.length ? 'Вы одни в голосе. Ждём участников.' : view.transmitting ? 'Вы говорите' : micLabels[view.mic];
    text(this.summary, `Голос · ${!view.enabled ? 'выключен' : failed ? 'нет связи' : connecting ? 'подключение' : !view.peers.length ? 'ждём участников' : 'подключён'}`);
    text(this.status, partial && !failed ? 'Голос работает. Часть участников пока недоступна.' : state); text(this.error, view.error); this.error.hidden = !view.error;
    text(this.enable, view.enabled ? 'Выйти из голоса' : 'Включить голос');
    this.enable.setAttribute('aria-pressed', String(view.enabled));
    this.retry.hidden = !view.enabled || (!view.error && view.joined && !view.peers.some(peer => peer.link === 'failed'));
    text(this.mic, view.mic === 'ready' ? 'Выключить микрофон' : view.mic === 'requesting' ? 'Ожидаем разрешение…' : 'Разрешить микрофон');
    this.mic.disabled = !view.enabled || !view.joined || view.mic === 'requesting';
    this.mic.setAttribute('aria-pressed', String(view.mic === 'ready'));
    text(this.receive, view.receiving ? 'Выключить входящий голос' : 'Включить входящий голос');
    this.receive.disabled = !view.enabled; this.receive.setAttribute('aria-pressed', String(!view.receiving));
    this.volume.disabled = !view.enabled;
    const pct = Math.round(Math.max(0, Math.min(1, view.volume)) * 100); this.volume.value = String(pct); text(this.volumeValue, `${pct}%`);
    this.gameMute.hidden = !view.gameMuted;
    text(this.group, view.joined ? `В голосе: вы${view.peers.length ? ` + ${view.peers.length}` : ''} · максимум ${view.maxPeers}` : `Группа текущей комнаты · максимум ${view.maxPeers}`);
    const iconState = failed ? 'error' : !view.enabled ? 'off' : connecting || view.mic === 'requesting' ? 'connecting' : view.transmitting ? 'talking' : view.mic === 'ready' ? 'ready' : 'off';
    const label = failed ? (view.error || 'Нет связи с участником') + '. Нажмите, чтобы повторить подключение.' : iconState === 'connecting' ? 'Подключаем микрофон…' : iconState === 'off' ? 'Включить микрофон: нажмите кнопку или V и разрешите доступ' : view.transmitting ? 'Вас слышат. Отпустите микрофон, чтобы закончить' : view.peers.length ? 'Удерживайте микрофон или V. Настройки — в паузе' : 'Вы одни в голосе. Настройки — в паузе';
    this.hold.hidden = false; this.hold.disabled = view.mic === 'requesting';
    const hint = partial && !failed ? `${label}. Часть участников пока недоступна` : label;
    this.hold.setAttribute('aria-label', hint); this.hold.title = hint;
    this.hold.setAttribute('data-state', iconState);
    this.hold.setAttribute('aria-pressed', String(view.transmitting));
    for (const [id, row] of this.rows) if (!view.peers.some(p => p.id === id)) { row.root.remove(); this.rows.delete(id); }
    for (const peer of view.peers) {
      let row = this.rows.get(peer.id);
      if (!row) {
        const root = el('div', 'voice-peer'), name = el('span', 'voice-peer-name'), state = el('span', 'voice-peer-state'), mute = button('voice-btn voice-peer-mute', '');
        const label = el('div', 'voice-peer-label'); label.append(name, state); root.append(label, mute);
        // Row and handler are removed together; no global listeners or retained per-peer cleanup closures.
        mute.addEventListener('click', () => { const current = this.view?.peers.find(p => p.id === peer.id); if (!this.disposed && current) this.actions.setPeerMuted(peer.id, !current.muted); });
        row = { root, name, state, mute }; this.rows.set(peer.id, row); this.peers.append(root);
      }
      text(row.name, peer.nick);
      text(row.state, peer.muted ? 'Вы не слышите' : peer.link === 'failed' ? 'Нет связи' : peer.link === 'connecting' ? 'Соединяем…' : peer.talking ? 'Говорит' : 'Подключён');
      text(row.mute, peer.muted ? 'Слушать' : 'Заглушить'); row.mute.setAttribute('aria-label', `${peer.muted ? 'Слушать' : 'Заглушить'}: ${peer.nick}`);
      row.mute.setAttribute('aria-pressed', String(peer.muted)); row.root.classList.toggle('talking', peer.talking && !peer.muted);
    }
  }
  dispose(): void {
    if (this.disposed) return; this.release(); this.disposed = true;
    for (const off of this.cleanup) off(); this.cleanup.length = 0;
    this.rows.clear(); this.settings.remove(); this.hud.remove(); this.view = null;
  }
  private listen(target: EventTarget, type: string, fn: (event: Event) => void): void {
    target.addEventListener(type, fn); this.cleanup.push(() => target.removeEventListener(type, fn));
  }
  private connecting(): boolean { return !!this.view?.enabled && !this.view.error && (!this.view.joined || this.view.peers.length > 0 && this.view.peers.every(p => p.link === 'connecting')); }
  private canHold(): boolean { return !this.disposed && this.visible && !!this.view?.available && voiceCanTransmit(this.view); }
  private press(): void { if (!this.held) { this.held = true; this.actions.push(true); } }
  private release(): void {
    const pointer = this.pointer; this.pointer = null;
    if (this.held) { this.held = false; this.actions.push(false); }
    if (pointer !== null && this.hold.hasPointerCapture(pointer)) this.hold.releasePointerCapture(pointer);
  }
}

// Голос в игре: кнопка микрофона в углу и «Сейчас говорят». Настройки и проверка микрофона — в панели
// (client/ui/voicepanel.ts, меню → «Голос»). Права на микрофон, звук и клавиша V — у контроллера (client/voice.ts).
import { voiceCanTransmit, type VoiceView } from '../../shared/voice.ts';

export interface VoiceUiActions {
  /** Нажали на кнопку при выключенном микрофоне: включить (жест — браузер спросит разрешение) */
  connectMic(): void;
  push(on: boolean): void;
  /** Браузер держал звук голоса без клика: клик по кнопке включает */
  unblock(): void;
  /** Правая кнопка или нажатие при выключенном голосе: открыть меню на разделе «Голос» */
  openSettings(): void;
}
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag); e.className = cls; e.textContent = text; return e;
}
function text(e: HTMLElement, value: string): void { if (e.textContent !== value) e.textContent = value; }
function isModal(d: HTMLDialogElement): boolean { try { return d.matches(':modal'); } catch { return true; } }
export const MIC_SVG = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M6 11v1a6 6 0 0 0 12 0v-1M12 18v3M9 21h6"/></svg>';
const SPEAKER_SVG = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="m17 9 4 6M21 9l-4 6"/></svg>';
export type VoiceHudState = 'hidden' | 'off' | 'listen' | 'requesting' | 'connecting' | 'ready' | 'talking' | 'error' | 'blocked';

/** Что показывает кнопка: одно состояние на все случаи (тесты проверяют его, а не картинку). */
export function hudState(view: VoiceView): VoiceHudState {
  if (!view.available) return 'hidden';
  if (!view.enabled) return 'off';
  if (view.playbackBlocked) return 'blocked';
  if (view.mic === 'denied' || view.mic === 'unavailable') return 'error';
  if (view.mic === 'requesting') return 'requesting';
  if (!view.joined || view.linkDown) return 'connecting';
  if (view.mic !== 'ready') return 'listen';
  if (view.transmitting) return 'talking';
  if (view.peers.length && view.peers.every(p => p.link === 'failed')) return 'error';
  if (view.peers.length && !view.peers.some(p => p.link === 'connected')) return 'connecting';
  return 'ready';
}
const LABEL: Record<VoiceHudState, string> = {
  hidden: '', off: 'Голос выключен. Включить — меню (Esc) → «Голос»',
  listen: 'Ты слышишь всех рядом. Говорить — удерживай V (в первый раз браузер спросит микрофон)',
  requesting: 'Ждём разрешение микрофона…', connecting: 'Подключаем голос…',
  ready: 'Удерживай V или эту кнопку — тебя услышат', talking: 'Тебя слышат. Отпусти V, чтобы замолчать',
  error: 'Нет голоса. Нажми, чтобы попробовать снова', blocked: 'Браузер не включил звук голоса — нажми сюда',
};

/** Только показ: разрешения, звук и глобальная клавиша V — у контроллера. */
export class VoiceUi {
  private readonly actions: VoiceUiActions;
  private readonly hud = el('div', 'voice-hud');
  private readonly hold = el('button', 'voice-hold');
  private readonly tip = el('p', 'voice-tip');
  private readonly speakers = el('ul', 'voice-speakers');
  private readonly speakerRows = new Map<number | 'self', { root: HTMLElement; name: HTMLElement }>();
  private readonly cleanup: Array<() => void> = [];
  /** Где кнопка живёт обычно; пока открыто модальное окно — в нём (relocate) */
  private readonly home: HTMLElement;
  private watch: MutationObserver | null = null;
  private view: VoiceView | null = null;
  private state: VoiceHudState = 'hidden';
  private visible = false;
  private disposed = false;
  private held = false;
  private pointer: number | null = null;

  constructor(hudRoot: HTMLElement, actions: VoiceUiActions) {
    this.actions = actions;
    this.hold.type = 'button';
    this.hold.setAttribute('aria-pressed', 'false');
    this.hold.setAttribute('aria-keyshortcuts', 'V Space Enter');
    this.hold.innerHTML = MIC_SVG.replace('</svg>', '<path class="voice-slash" d="m4 4 16 16"/></svg>') + SPEAKER_SVG.replace('<svg', '<svg class="voice-speaker-off"');
    const shortcut = el('span', 'voice-key', 'V'); shortcut.setAttribute('aria-hidden', 'true'); this.hold.append(shortcut);
    this.tip.setAttribute('role', 'status'); this.tip.hidden = true;
    this.speakers.setAttribute('aria-label', 'Сейчас говорят'); this.speakers.tabIndex = 0; this.speakers.hidden = true;
    this.hud.append(this.speakers, this.hold, this.tip); this.hud.hidden = true;
    this.home = hudRoot; hudRoot.append(this.hud);
    // Модальное окно (showModal) — в верхнем слое, а всё вне его браузер делает инертным: кнопку не нажать.
    // Пока такое окно открыто, кнопка живёт в нём (position: fixed — на том же месте экрана).
    if (typeof MutationObserver !== 'undefined' && typeof document.querySelectorAll === 'function') {
      this.watch = new MutationObserver(() => this.relocate());
      this.watch.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['open'] });
      this.relocate();
    }
    this.listen(this.speakers, 'wheel', e => e.stopPropagation());
    this.listen(this.hold, 'click', () => {
      const s = this.state;
      if (s === 'blocked') actions.unblock();
      else if (s === 'off') { this.release(); actions.openSettings(); }
      else if (s === 'listen' || s === 'error') actions.connectMic();
    });
    this.listen(this.hold, 'contextmenu', event => { event.preventDefault(); this.release(); actions.openSettings(); });
    // V на кнопке доходит до общего обработчика игры; прочие клавиши и клики кнопки в игру не уходят
    for (const type of ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'click', 'dblclick', 'contextmenu']) this.listen(this.hud, type, e => e.stopPropagation());
    for (const type of ['keydown', 'keyup']) this.listen(this.hud, type, event => {
      const e = event as KeyboardEvent;
      if (e.key !== 'Escape' && e.code !== 'KeyV') e.stopPropagation();
    });
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
      if (e.repeat) return;
      if (this.canHold()) this.press(); else this.hold.click();
    });
    this.listen(this.hold, 'keyup', event => {
      const e = event as KeyboardEvent; if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); this.release(); }
    });
    this.listen(this.hold, 'blur', () => this.release());
    this.listen(window, 'blur', () => this.release());
    this.listen(document, 'visibilitychange', () => { if (document.hidden) this.release(); });
  }

  setVisible(game: boolean): void {
    this.visible = game; if (!game) this.release();
    if (this.watch && !this.hud.isConnected) this.relocate();
    this.hud.hidden = !game || this.state === 'hidden' || this.disposed;
    this.speakers.hidden = this.hud.hidden || this.speakerRows.size === 0;
  }
  render(view: VoiceView): void {
    if (this.disposed) return;
    this.view = view; this.state = hudState(view);
    if (this.watch && !this.hud.isConnected) this.relocate(); // окно с кнопкой убрали из страницы целиком
    this.hud.hidden = this.state === 'hidden' || !this.visible;
    this.renderSpeakers(view);
    if (!this.canHold()) this.release();
    if (this.state === 'hidden') return;
    const label = this.state === 'error' && view.error ? view.error : LABEL[this.state];
    this.hold.setAttribute('aria-label', label); this.hold.title = label;
    this.hold.dataset.state = this.state;
    this.hold.setAttribute('aria-pressed', String(view.transmitting));
    this.hold.disabled = this.state === 'requesting';
    // подсказка рядом: короткое уведомление, иначе — что сейчас важно
    const tip = view.notice || (this.state === 'blocked' ? 'Кликни, чтобы слышать голос' : this.state === 'error' ? view.error : '');
    text(this.tip, tip); this.tip.hidden = !tip;
  }
  dispose(): void {
    if (this.disposed) return; this.release(); this.disposed = true;
    this.watch?.disconnect(); this.watch = null;
    for (const off of this.cleanup) off(); this.cleanup.length = 0;
    this.speakerRows.clear(); this.hud.remove(); this.view = null;
  }
  private renderSpeakers(view: VoiceView): void {
    const current = new Map<number | 'self', string>();
    if (view.available) {
      // кто говорит — видно и тем, кто голос не слушает (сервер присылает список зоны всем)
      for (const peer of view.people) if (peer.talking && !peer.muted) current.set(peer.id, peer.nick);
      if (view.enabled && view.joined && view.transmitting) current.set('self', 'Ты');
    }
    for (const [id, row] of this.speakerRows) if (!current.has(id)) { row.root.remove(); this.speakerRows.delete(id); }
    for (const [id, nick] of current) {
      let row = this.speakerRows.get(id);
      if (!row) {
        const root = el('li', 'voice-speaker'), name = el('span', 'voice-speaker-name');
        const icon = el('span', 'voice-speaker-icon'); icon.setAttribute('aria-hidden', 'true'); icon.innerHTML = MIC_SVG;
        const state = el('span', 'voice-speaker-state', id === 'self' ? 'говоришь' : 'говорит');
        root.append(icon, name, state);
        row = { root, name }; this.speakerRows.set(id, row); this.speakers.append(root);
      }
      text(row.name, nick); row.name.title = nick; row.root.setAttribute('aria-label', id === 'self' ? 'Ты говоришь' : `${nick} — говорит`);
    }
    this.speakers.hidden = this.hud.hidden || this.speakerRows.size === 0;
  }
  /** Кнопка — в верхнем открытом модальном окне, если оно есть, иначе дома. */
  private relocate(): void {
    if (this.disposed || !this.watch) return;
    let modal: HTMLDialogElement | null = null;
    for (const d of document.querySelectorAll('dialog')) if (d.open && isModal(d)) modal = d;
    const parent = modal ?? this.home;
    if (this.hud.parentElement !== parent) parent.append(this.hud);
  }
  private listen(target: EventTarget, type: string, fn: (event: Event) => void): void {
    target.addEventListener(type, fn); this.cleanup.push(() => target.removeEventListener(type, fn));
  }
  private canHold(): boolean { return !this.disposed && this.visible && !!this.view?.available && !this.view.linkDown && voiceCanTransmit(this.view); }
  private press(): void { if (!this.held) { this.held = true; this.actions.push(true); } }
  private release(): void {
    const pointer = this.pointer; this.pointer = null;
    if (this.held) { this.held = false; this.actions.push(false); }
    if (pointer !== null && this.hold.hasPointerCapture(pointer)) this.hold.releasePointerCapture(pointer);
  }
}

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
  /** Громкость говорящего 0…1 для волн значка; null — неизвестна (волны пульсируют спокойно) */
  level?(id: number | 'self'): number | null;
  /** Свой ник — в строке «кто говорит» */
  selfNick?(): string;
}
/** Динамик с двумя волнами: волны дышат в такт голосу (--lvl) */
export const SPEAKER_WAVES_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 9.5h3.3L11.5 5.6v12.8l-4.7-3.9H3.5z" fill="currentColor" stroke-width="1.4"/><path class="vw1" d="M15 9.3a3.8 3.8 0 0 1 0 5.4"/><path class="vw2" d="M17.9 6.5a7.8 7.8 0 0 1 0 11"/></svg>';
/** Больше стольких строк «кто говорит» не показываем: остальные — «+N» */
export const SPEAKERS_VISIBLE = 5;
interface SpeakerRow { root: HTMLElement; name: HTMLElement; vis: number }
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
  /** Справа от кнопки: столбик «кто говорит» растёт вверх, под ним — подсказка */
  private readonly side = el('div', 'voice-side');
  private readonly speakers = el('ul', 'voice-speakers');
  private readonly more = el('li', 'voice-speaker voice-more');
  private readonly speakerRows = new Map<number | 'self', SpeakerRow>();
  /** Другие говорящие в порядке, как начали: первые остаются на виду, поздние уходят в «+N» */
  private order: number[] = [];
  private frame = 0;
  private lastPaint = 0;
  /** Строки, что ещё гаснут: список не прячем, пока они не исчезли */
  private fading = 0;
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
    this.speakers.setAttribute('aria-label', 'Сейчас говорят'); this.speakers.hidden = true;
    this.more.hidden = true; this.speakers.append(this.more);
    this.side.append(this.speakers, this.tip);
    this.hud.append(this.hold, this.side); this.hud.hidden = true;
    this.home = hudRoot; hudRoot.append(this.hud);
    // Модальное окно (showModal) — в верхнем слое, а всё вне его браузер делает инертным: кнопку не нажать.
    // Пока такое окно открыто, кнопка живёт в нём (position: fixed — на том же месте экрана).
    if (typeof MutationObserver !== 'undefined' && typeof document.querySelectorAll === 'function') {
      this.watch = new MutationObserver(() => this.relocate());
      this.watch.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['open'] });
      this.relocate();
    }

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
    this.syncSpeakers();
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
    const tipChanged = this.tip.hidden !== !tip;
    text(this.tip, tip); this.tip.hidden = !tip;
    if (tipChanged) this.limitSpeakers();
  }
  dispose(): void {
    if (this.disposed) return; this.release(); this.disposed = true;
    this.watch?.disconnect(); this.watch = null;
    if (this.frame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.frame); this.frame = 0;
    for (const off of this.cleanup) off(); this.cleanup.length = 0;
    this.speakerRows.clear(); this.order = []; this.hud.remove(); this.view = null;
  }
  /**
   * «Кто говорит»: плашка — значок динамика и ник, свой — тоже ник (с рамкой). Новые встают сверху: столбик растёт
   * вверх и не двигает тех, кто уже говорит; ушедшие гаснут и схлопываются. Больше пяти — первые четыре и «+N».
   */
  private renderSpeakers(view: VoiceView): void {
    const current = new Map<number | 'self', string>();
    if (view.available) {
      // кто говорит — видно и тем, кто голос не слушает (сервер присылает список зоны всем)
      for (const peer of view.people) if (peer.talking && !peer.muted) current.set(peer.id, peer.nick);
      if (view.enabled && view.joined && view.transmitting) current.set('self', this.actions.selfNick?.() || 'Ты');
    }
    let changed = false;
    for (const [id, row] of this.speakerRows) if (!current.has(id)) { this.speakerRows.delete(id); this.fadeOut(row.root); changed = true; }
    if (changed) this.order = this.order.filter(id => this.speakerRows.has(id));
    for (const [id, nick] of current) {
      let row = this.speakerRows.get(id);
      if (!row) {
        const root = el('li', 'voice-speaker'), name = el('span', 'voice-speaker-name');
        const icon = el('span', 'voice-speaker-icon'); icon.setAttribute('aria-hidden', 'true'); icon.innerHTML = SPEAKER_WAVES_SVG;
        root.append(icon, name); root.dataset.lvl = 'calm';
        row = { root, name, vis: 0 }; this.speakerRows.set(id, row); changed = true;
        if (id === 'self') { root.dataset.self = ''; this.speakers.append(root); }
        else { this.order.push(id); this.more.after(root); }
      }
      text(row.name, nick); row.name.title = nick; row.root.setAttribute('aria-label', id === 'self' ? 'Ты говоришь' : `${nick} говорит`);
    }
    if (changed) this.limitSpeakers();
    this.syncSpeakers();
    this.pump();
  }
  private syncSpeakers(): void { this.speakers.hidden = this.hud.hidden || (this.speakerRows.size === 0 && this.fading === 0); }
  /** Сколько строк на виду: свой — всегда, из остальных — кто раньше начал; подсказка снизу забирает одну строку */
  private limitSpeakers(): void {
    const limit = this.tip.hidden ? SPEAKERS_VISIBLE : SPEAKERS_VISIBLE - 1;
    let shown = this.speakerRows.has('self') ? 1 : 0, over = 0;
    const room = this.speakerRows.size > limit ? limit - 1 : limit; // одна строка — под «+N»
    for (const id of this.order) {
      const row = this.speakerRows.get(id)!; const show = shown < room; row.root.hidden = !show;
      if (show) shown++; else over++;
    }
    this.more.hidden = over === 0;
    if (over) { text(this.more, `+${over}`); this.more.setAttribute('aria-label', `и ещё ${over}`); }
  }
  private fadeOut(root: HTMLElement): void {
    root.dataset.out = ''; this.fading++;
    setTimeout(() => { root.remove(); this.fading--; this.syncSpeakers(); }, 260);
  }
  /** Волны значков — по громкости голоса, ~15 раз в секунду, пока кто-то говорит */
  private pump = (): void => {
    if (this.frame || this.disposed || !this.speakerRows.size || typeof requestAnimationFrame !== 'function') return;
    this.frame = requestAnimationFrame(now => {
      this.frame = 0;
      if (this.disposed || !this.speakerRows.size) return;
      if (now - this.lastPaint >= 66) { this.lastPaint = now; for (const [id, row] of this.speakerRows) this.paintLevel(id, row); }
      this.pump();
    });
  };
  private paintLevel(id: number | 'self', row: SpeakerRow): void {
    const raw = this.actions.level?.(id) ?? null;
    if (raw === null) { if (row.root.dataset.lvl !== 'calm') row.root.dataset.lvl = 'calm'; return; }
    // быстро вверх, плавно вниз: волны не мигают на паузах между слогами
    row.vis = Math.max(raw, row.vis * 0.8);
    if (row.root.dataset.lvl !== 'live') row.root.dataset.lvl = 'live';
    row.root.style.setProperty('--lvl', row.vis.toFixed(2));
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

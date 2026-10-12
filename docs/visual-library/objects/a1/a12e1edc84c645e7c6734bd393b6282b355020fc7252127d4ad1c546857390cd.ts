// «Кто где» (Tab): ники, уровни и комнаты всех, кто в игре. У каждого другого — громкость его голоса: −/+ и «заглушить»
// (те же настройки, что во вкладке меню «Голос», client/voice-prefs.ts; запоминаются и для тех, кого сейчас нет в голосе),
// и 👢 — голосование «выгнать» (флаг сервера VOTEKICK, shared/votekick.ts; итог решает сервер).
// Tab держишь — список; ПКМ, пока держишь, — мышь свободна и список остаётся. Закрыть — Tab, Esc или клик мимо списка.
// На телефоне (👥) список сразу с кнопками.
import { frameForLevel } from '../../shared/levels.ts';
import type { OnlineEntry, RoomKind } from '../../shared/messages.ts';
import { KICK_PERCENT, KICK_VOTE_MS } from '../../shared/votekick.ts';
import { TOUCH } from '../touch.ts';
import { onVoiceChange, peerVoices, setPeerVoice, voiceTalkers } from '../voice-prefs.ts';
import './online.css';

const ROOM: Record<RoomKind, string> = { lobby: '🏠 Набережная', paintball: '🎯 Склад', race: '🏁 Гонка', fort: '🏰 Крепость', fight: '🥊 Подвал', skill: '☁️ Выше облаков', hide: '🔎 Прятки' };
/** Шаг кнопок −/+ */
const STEP = 0.1;
/** Динамик и динамик с крестиком — чётче эмодзи на тёмной кнопке */
const SPEAKER = '<path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor"/>';
const ICON_ON = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SPEAKER}<path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>`;
const ICON_OFF = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SPEAKER}<path d="m16 9 6 6"/><path d="m22 9-6 6"/></svg>`;

export interface OnlineHost {
  /** 👢 подтверждён: начать голосование «выгнать» */
  kick(pid: number): void;
  /** Список стал (или перестал быть) с мышью: игре — отпустить мышь и не ходить */
  pinned(on: boolean): void;
  /** Закрыли кликом мимо списка: мышь — обратно игре */
  restorePointer(): void;
}

interface Row {
  root: HTMLElement;
  mic: HTMLElement;
  mute: HTMLButtonElement;
  minus: HTMLButtonElement;
  plus: HTMLButtonElement;
  vol: HTMLElement;
  kick: HTMLButtonElement | null;
  nick: string;
}

export class OnlineList {
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly rows: HTMLElement;
  private readonly ask: HTMLElement;
  private readonly askText: HTMLElement;
  private readonly host: OnlineHost | null;
  private list: OnlineEntry[] = [];
  private me = '';
  private mePid = 0;
  private open = false;
  private pin = false;
  /** Голосование «выгнать» включено на сервере; идёт ли сейчас */
  private kickOn = false;
  private voting = false;
  /** 👢 нажат — ждём «Да» (номер профиля) */
  private asking = 0;
  private readonly byPid = new Map<number, Row>();
  private offVoice: (() => void) | null = null;

  constructor(parent: HTMLElement, host: OnlineHost | null = null) {
    this.host = host;
    this.root = el('div', 'online-list ol');
    const head = this.root.appendChild(el('div', 'ol-head'));
    this.title = head.appendChild(el('div', 'ol-title'));
    this.hint = head.appendChild(el('div', 'ol-hint'));
    this.rows = this.root.appendChild(el('div', 'ol-rows'));
    this.ask = this.root.appendChild(el('div', 'ol-ask'));
    this.ask.hidden = true;
    this.askText = this.ask.appendChild(el('span', 'ol-ask-text'));
    const yes = this.ask.appendChild(button('ol-ask-yes', 'Да, голосовать'));
    const no = this.ask.appendChild(button('ol-ask-no', 'Отмена'));
    yes.addEventListener('click', () => this.confirmKick());
    no.addEventListener('click', () => this.askKick(0));
    this.rows.addEventListener('click', (e) => this.onClick(e));
    parent.appendChild(this.root);
    if (!TOUCH) {
      // ПКМ, пока список открыт, — мышь в список; клик мимо открытого с мышью — закрыть. Раньше игры (фаза захвата):
      // этот клик не стреляет и не забрасывает удочку.
      window.addEventListener('mousedown', (e) => this.onMouseDown(e), true);
      window.addEventListener('contextmenu', (e) => { if (this.open) e.preventDefault(); }, true);
    }
  }

  get count(): number {
    return this.list.length;
  }

  /** Список открыт с мышью (ПКМ): клавиши — не игре, мышь не захвачена */
  get pinned(): boolean {
    return this.pin;
  }

  get visible(): boolean {
    return this.open;
  }

  set(list: OnlineEntry[], me: string, mePid = 0): void {
    this.list = list;
    this.me = me;
    this.mePid = mePid;
    if (this.asking && !list.some((e) => e.pid === this.asking)) this.askKick(0);
    if (this.open) this.render();
  }

  /** Сервер: голосование включено (on) и идёт ли сейчас — 👢 гаснет, пока идёт */
  setKick(on: boolean, voting: boolean): void {
    if (on === this.kickOn && voting === this.voting) return;
    this.kickOn = on;
    this.voting = voting;
    if (voting) this.askKick(0);
    if (this.open) this.render();
  }

  /** Tab: показать (держишь) или спрятать; спрятать — и список с мышью тоже */
  show(v: boolean): void {
    if (v === this.open) return;
    this.open = v;
    if (v) {
      this.render();
      this.offVoice = onVoiceChange(() => this.paintVoice());
    } else {
      this.offVoice?.();
      this.offVoice = null;
      this.askKick(0);
      this.setPinned(false);
    }
    this.root.classList.toggle('show', v);
  }

  /** Оставить список открытым с мышью (ПКМ, пока держишь Tab) */
  setPinned(on: boolean): void {
    if (on === this.pin || (on && !this.open)) return;
    this.pin = on;
    this.root.classList.toggle('pinned', on);
    this.paintHint();
    this.host?.pinned(on);
  }

  private onMouseDown(e: MouseEvent): void {
    if (!this.open) return;
    if (!this.pin) {
      if (e.button !== 2) return;
      e.preventDefault();
      e.stopPropagation();
      this.setPinned(true);
      return;
    }
    const target = e.target instanceof Element ? e.target : null;
    if (target && (this.root.contains(target) || target.closest('button, input, select, label, a'))) return;
    e.preventDefault();
    e.stopPropagation();
    this.show(false);
    this.host?.restorePointer();
  }

  private render(): void {
    const n = this.list.length;
    this.title.textContent = `Кто где · ${n}`;
    this.paintHint();
    this.rows.textContent = '';
    this.byPid.clear();
    const prefs = peerVoices();
    for (const e of this.list) {
      const mine = e.pid ? e.pid === this.mePid : e.nick === this.me;
      const row = el('div', `ol-row${mine ? ' me' : ''}`);
      const who = row.appendChild(el('b', 'ol-who'));
      const level = Number.isFinite(e.level) ? Math.max(1, Math.floor(e.level!)) : 1;
      const tier = frameForLevel(level);
      const badge = who.appendChild(el('span', 'ol-lvl', String(level)));
      badge.title = `Уровень ${level} · ${tier.name}`;
      badge.setAttribute('aria-label', badge.title);
      Object.assign(badge.style, { borderColor: tier.color, color: tier.light });
      const nick = who.appendChild(el('span', 'ol-nick', e.nick));
      nick.title = e.nick;
      const mic = who.appendChild(el('i', 'ol-mic', '🎙'));
      mic.hidden = true;
      row.appendChild(el('span', 'ol-room', ROOM[e.room] ?? e.room));
      const pid = e.pid ?? 0;
      if (mine || pid <= 0) {
        row.appendChild(el('span', 'ol-self', mine ? 'это ты' : ''));
      } else {
        const voice = row.appendChild(el('span', 'ol-voice'));
        const mute = voice.appendChild(button('ol-mute', ''));
        const minus = voice.appendChild(button('ol-minus', '−'));
        const vol = voice.appendChild(el('span', 'ol-vol'));
        const plus = voice.appendChild(button('ol-plus', '+'));
        for (const b of [mute, minus, plus]) b.dataset.pid = String(pid);
        mute.dataset.act = 'mute';
        minus.dataset.act = 'minus';
        plus.dataset.act = 'plus';
        let kick: HTMLButtonElement | null = null;
        if (this.kickOn) {
          kick = row.appendChild(button('ol-kick', '👢'));
          kick.dataset.pid = String(pid);
          kick.dataset.act = 'kick';
          kick.disabled = this.voting;
          kick.title = this.voting ? 'Уже идёт голосование' : `Выгнать ${e.nick}: голосование`;
          kick.setAttribute('aria-label', kick.title);
        }
        const r: Row = { root: row, mic, mute, minus, plus, vol, kick, nick: e.nick };
        this.byPid.set(pid, r);
        this.paintPeer(r, prefs(pid));
      }
      this.rows.appendChild(row);
    }
    if (n === 0) this.rows.textContent = 'Пока никого';
    this.paintVoice();
    if (this.asking) this.askKick(this.byPid.has(this.asking) ? this.asking : 0);
  }

  private paintHint(): void {
    this.hint.textContent = TOUCH ? '' : this.pin ? 'Tab, Esc или клик мимо — закрыть' : this.kickOn ? 'ПКМ — мышь: громкость и 👢' : 'ПКМ — мышь: громкость голосов';
  }

  /** Громкость и «заглушить» одной строки */
  private paintPeer(r: Row, p: { muted: boolean; volume: number }): void {
    const pct = Math.round(p.volume * 100);
    r.root.classList.toggle('muted', p.muted);
    r.mute.innerHTML = p.muted ? ICON_OFF : ICON_ON;
    r.mute.title = `${p.muted ? 'Включить голос' : 'Заглушить'}: ${r.nick}`;
    r.mute.setAttribute('aria-label', r.mute.title);
    r.mute.setAttribute('aria-pressed', String(p.muted));
    r.vol.textContent = p.muted ? 'выкл' : `${pct}%`;
    r.vol.title = `Громкость голоса: ${r.nick}`;
    r.minus.disabled = p.muted || pct <= 0;
    r.plus.disabled = p.muted || pct >= 100;
    r.minus.title = `Тише: ${r.nick}`;
    r.plus.title = `Громче: ${r.nick}`;
  }

  /** Кто в голосе и кто сейчас говорит */
  private paintVoice(): void {
    if (!this.open) return;
    const on = new Map(voiceTalkers().map((t) => [t.pid, t]));
    for (const [pid, r] of this.byPid) {
      const t = on.get(pid);
      r.mic.hidden = !t?.mic;
      r.root.classList.toggle('talking', !!t?.talking);
      r.root.classList.toggle('in-voice', !!t);
    }
  }

  private onClick(e: MouseEvent): void {
    const b = e.target instanceof Element ? e.target.closest<HTMLButtonElement>('button[data-act]') : null;
    if (!b || b.disabled) return;
    const pid = Number(b.dataset.pid);
    const r = this.byPid.get(pid);
    if (!r) return;
    if (b.dataset.act === 'kick') {
      this.askKick(pid);
      return;
    }
    const cur = peerVoices()(pid);
    if (b.dataset.act === 'mute') setPeerVoice(pid, { muted: !cur.muted });
    else setPeerVoice(pid, { volume: Math.round((cur.volume + (b.dataset.act === 'plus' ? STEP : -STEP)) * 10) / 10 });
    this.paintPeer(r, peerVoices()(pid));
  }

  /** 👢: спросить «Выгнать <ник>?» (0 — убрать вопрос) */
  private askKick(pid: number): void {
    this.asking = pid;
    const r = pid ? this.byPid.get(pid) : undefined;
    this.ask.hidden = !r;
    for (const [id, row] of this.byPid) row.root.classList.toggle('asking', id === pid);
    if (r) this.askText.textContent = `Выгнать ${r.nick}? Все проголосуют за ${Math.round(KICK_VOTE_MS / 1000)} с — нужно больше ${KICK_PERCENT} % «за».`;
  }

  private confirmKick(): void {
    const pid = this.asking;
    this.askKick(0);
    if (!pid || this.voting) return;
    this.host?.kick(pid);
    // телефон: список закрывает кнопка 👥 (у неё своё «нажато») — оставляем открытым
    if (TOUCH) return;
    this.show(false);
    this.host?.restorePointer();
  }
}

function el(tag: string, cls: string, text = ''): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function button(cls: string, text: string): HTMLButtonElement {
  const b = el('button', cls, text) as HTMLButtonElement;
  b.type = 'button';
  // фокус на кнопке не держим: Пробел и Enter остаются игре
  b.addEventListener('mousedown', (e) => e.preventDefault());
  return b;
}

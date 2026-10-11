// «Кто где» (Tab): окно кита (.k-window в .k-scrim, строки .k-online-row — как на странице lab/ui «Кто где»): ники, уровни
// и комнаты всех, кто в игре. У каждого другого — громкость его голоса: −/+ и «заглушить» (те же настройки, что в меню
// «Голос», client/voice-prefs.ts; запоминаются и для тех, кого сейчас нет в голосе) и «выгнать» — голосование (флаг
// сервера VOTEKICK, shared/votekick.ts; итог решает сервер).
// Tab держишь — список; ПКМ, пока держишь, — мышь свободна и список остаётся. Закрыть — Tab, Esc или клик мимо окна.
// На телефоне (👥) список сразу с кнопками.
import { frameForLevel } from '../../shared/levels.ts';
import type { OnlineEntry, RoomKind } from '../../shared/messages.ts';
import { KICK_PERCENT, KICK_VOTE_MS } from '../../shared/votekick.ts';
import { TOUCH } from '../touch.ts';
import { onVoiceChange, peerVoices, setPeerVoice, voiceTalkers } from '../voice-prefs.ts';
import { iconImg } from './kit/dom.ts';
import { MODE_CARDS } from './transition-art.ts';
import './online.css';

/** Комната: название, значок (если у комнаты нет картины экрана загрузки) и где в картине её «марка» (кружок) */
const ROOM: Record<RoomKind, readonly [name: string, icon: string, pos: string]> = {
  lobby: ['Набережная', 'pin', '50% 60%'],
  paintball: ['Склад', 'paint', '50% 55%'],
  race: ['Гонка', 'kart', '50% 55%'],
  fort: ['Крепость', 'shield', '50% 45%'],
  fight: ['Подвал', 'cellar', '50% 55%'],
  skill: ['Выше облаков', 'bell-cloud', '50% 40%'],
  hide: ['Прятки', 'hide-box', '50% 55%'],
  farm: ['Ферма', 'farm-gate', '50% 50%'],
  dungeon: ['Подземелье', 'dungeon', '50% 50%'],
};

/** «Марка» комнаты — кружок с куском рисованной картины экрана загрузки (нет картины — значок комнаты) */
function roomMark(kind: RoomKind): string {
  const [, icon, pos] = ROOM[kind] ?? ['', 'pin', '50% 50%'];
  const art = MODE_CARDS[kind]?.art;
  if (art) return `<span class="ol-mark" style="background-image:url('${art}');background-position:${pos}"></span>`;
  return `<span class="ol-mark ol-mark--ic">${iconImg(icon, '')}</span>`;
}

/** Шаг кнопок −/+ */
const STEP = 0.1;
/** Динамик и динамик с крестиком (рисуются цветом текста кнопки) */
const SPEAKER = '<path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor"/>';
const ICON_ON = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SPEAKER}<path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>`;
const ICON_OFF = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SPEAKER}<path d="m16 9 6 6"/><path d="m22 9-6 6"/></svg>`;

export interface OnlineHost {
  /** «Выгнать» подтверждено: начать голосование */
  kick(pid: number): void;
  /** Список стал (или перестал быть) с мышью: игре — отпустить мышь и не ходить */
  pinned(on: boolean): void;
  /** Закрыли кликом мимо окна: мышь — обратно игре */
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
  /** Слой кита (.k-scrim): масштаб --hud-k, лёгкое затемнение; сам мышь не ловит — только окно */
  private readonly root: HTMLElement;
  private readonly win: HTMLElement;
  private readonly title: HTMLElement;
  private readonly eyebrow: HTMLElement;
  private readonly voiceN: HTMLElement;
  private readonly voiceCount: HTMLElement;
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
  /** «Выгнать» нажат — ждём «Да» (номер профиля) */
  private asking = 0;
  private readonly byPid = new Map<number, Row>();
  private offVoice: (() => void) | null = null;

  constructor(parent: HTMLElement, host: OnlineHost | null = null) {
    this.host = host;
    this.root = el('div', 'k-scrim ol-scrim');
    this.root.innerHTML = `
      <section class="k-window k-window--sm ol-window" role="dialog" aria-label="Кто где">
        <header class="k-win-head">
          <span class="k-win-portrait">${iconImg('online', '')}</span>
          <div class="k-win-titles"><p class="k-eyebrow ol-eyebrow"></p><h2 class="k-win-title ol-title"></h2></div>
          <div class="k-win-tools"><span class="k-pill k-pill--good k-pill--sm ol-voice-count" hidden><span class="k-eq"><i></i><i></i><i></i></span><span class="ol-voice-n"></span></span></div>
        </header>
        <div class="k-win-body ol-rows"></div>
        <div class="ol-ask" hidden>
          <span class="ol-ask-text"></span>
          <span class="ol-ask-btns"></span>
        </div>
        <footer class="k-win-foot ol-foot"><span class="k-note ol-hint"></span></footer>
      </section>`;
    const q = <T extends HTMLElement>(sel: string): T => this.root.querySelector<T>(sel)!;
    this.win = q('.ol-window');
    this.title = q('.ol-title');
    this.eyebrow = q('.ol-eyebrow');
    this.voiceCount = q('.ol-voice-count');
    this.voiceN = q('.ol-voice-n');
    this.hint = q('.ol-hint');
    this.rows = q('.ol-rows');
    this.ask = q('.ol-ask');
    this.askText = q('.ol-ask-text');
    const yes = q('.ol-ask-btns').appendChild(button('k-btn k-btn--stop k-btn--sm ol-ask-yes', 'Да, голосовать'));
    const no = q('.ol-ask-btns').appendChild(button('k-btn k-btn--ghost k-btn--sm ol-ask-no', 'Отмена'));
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

  /** Кто где (Tab крепости: «остальные — не в крепости») */
  get entries(): readonly OnlineEntry[] {
    return this.list;
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

  /** Сервер: голосование включено (on) и идёт ли сейчас — «выгнать» гаснет, пока идёт */
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
    if (target && (this.win.contains(target) || target.closest('button, input, select, label, a'))) return;
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
      const row = el('div', `k-online-row${mine ? ' is-me' : ''}`);
      const level = Number.isFinite(e.level) ? Math.max(1, Math.floor(e.level!)) : 1;
      const tier = frameForLevel(level);
      // кольцо уровня — цветом рамки ника (опыт других сервер не присылает)
      const ring = row.appendChild(el('span', 'k-ring k-ring--sm ol-ring', ''));
      ring.style.setProperty('--tc', tier.color);
      ring.setAttribute('aria-label', `Уровень ${level}${tier.id === 'none' ? '' : ` · ${tier.name}`}`);
      ring.appendChild(el('b', '', String(level)));
      const who = row.appendChild(el('span', 'k-online-nick'));
      who.appendChild(el('span', 'ol-nick', e.nick));
      if (mine) who.appendChild(el('span', 'k-pill k-pill--gold k-pill--sm', 'это ты'));
      const mic = who.appendChild(el('span', 'ol-mic'));
      mic.innerHTML = iconImg('voice', 'k-ic');
      mic.setAttribute('aria-label', 'в голосе с микрофоном');
      mic.hidden = true;
      const room = row.appendChild(el('span', 'k-online-room'));
      room.innerHTML = roomMark(e.room);
      room.append(ROOM[e.room]?.[0] ?? e.room);
      const act = row.appendChild(el('span', 'k-online-act'));
      const pid = e.pid ?? 0;
      if (!mine && pid > 0) {
        const mute = act.appendChild(button('k-btn k-btn--ghost k-btn--icon k-btn--sm ol-mute', ''));
        const minus = act.appendChild(button('k-btn k-btn--ghost k-btn--icon k-btn--sm ol-step', '−'));
        const vol = act.appendChild(el('span', 'ol-val'));
        const plus = act.appendChild(button('k-btn k-btn--ghost k-btn--icon k-btn--sm ol-step', '+'));
        for (const b of [mute, minus, plus]) b.dataset.pid = String(pid);
        mute.dataset.act = 'mute';
        minus.dataset.act = 'minus';
        plus.dataset.act = 'plus';
        let kick: HTMLButtonElement | null = null;
        if (this.kickOn) {
          kick = act.appendChild(button('k-btn k-btn--ghost k-btn--sm ol-kick', ''));
          kick.innerHTML = `<span class="k-row-line">${iconImg('kick', 'k-ic')}выгнать</span>`;
          kick.dataset.pid = String(pid);
          kick.dataset.act = 'kick';
          kick.disabled = this.voting;
          kick.setAttribute('aria-label', this.voting ? 'Уже идёт голосование' : `Выгнать ${e.nick}: голосование`);
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

  /** Подсказка про мышь — видимой строкой: сверху «как закрыть», снизу «как взять мышь» */
  private paintHint(): void {
    this.eyebrow.textContent = TOUCH ? '' : this.pin ? 'Tab, Esc или клик мимо — закрыть' : 'Отпусти Tab — закроется';
    const what = this.kickOn ? 'громкость и «выгнать»' : 'громкость голосов';
    if (TOUCH) this.hint.textContent = '';
    else if (this.pin) this.hint.textContent = `Мышь у тебя: ${what} — кнопками в строке`;
    else this.hint.innerHTML = `<span class="k-key k-key--sm"><i class="k-mouse k-mouse--r"></i></span> — взять мышь: ${what}`;
    this.hint.parentElement!.hidden = TOUCH;
  }

  /** Громкость и «заглушить» одной строки */
  private paintPeer(r: Row, p: { muted: boolean; volume: number }): void {
    const pct = Math.round(p.volume * 100);
    r.root.classList.toggle('muted', p.muted);
    r.mute.innerHTML = p.muted ? ICON_OFF : ICON_ON;
    r.mute.setAttribute('aria-label', `${p.muted ? 'Включить голос' : 'Заглушить'}: ${r.nick}`);
    r.mute.setAttribute('aria-pressed', String(p.muted));
    r.vol.textContent = p.muted ? 'выкл' : `${pct}%`;
    r.vol.classList.toggle('k-bad', p.muted);
    r.minus.disabled = p.muted || pct <= 0;
    r.plus.disabled = p.muted || pct >= 100;
    r.minus.setAttribute('aria-label', `Тише: ${r.nick}`);
    r.plus.setAttribute('aria-label', `Громче: ${r.nick}`);
  }

  /** Кто в голосе и кто сейчас говорит */
  private paintVoice(): void {
    if (!this.open) return;
    const on = new Map(voiceTalkers().map((t) => [t.pid, t]));
    for (const [pid, r] of this.byPid) {
      const t = on.get(pid);
      r.mic.hidden = !t?.mic;
      r.root.classList.toggle('is-talk', !!t?.talking);
      r.root.classList.toggle('in-voice', !!t);
    }
    const n = [...this.byPid.keys()].filter((pid) => on.has(pid)).length;
    this.voiceCount.hidden = n === 0;
    this.voiceN.textContent = `в голосе ${n}`;
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

  /** «Выгнать»: спросить «Выгнать <ник>?» (0 — убрать вопрос) */
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

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function button(cls: string, text: string): HTMLButtonElement {
  const b = el('button', cls, text);
  b.type = 'button';
  // фокус на кнопке не держим: Пробел и Enter остаются игре
  b.addEventListener('mousedown', (e) => e.preventDefault());
  return b;
}

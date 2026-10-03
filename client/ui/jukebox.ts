// Окно музыкального автомата: список песен, «Поставить · 10 🪙», что играет сейчас и очередь.
// Сервер решает всё сам (цена, очередь, расстояние) — окно только показывает состояние и просит заказ.
// Связку (открыть у автомата, мышь, тосты, звук) делает client/lobby/scene.ts; здесь — только разметка и клавиши.
// update() зовут ~4 раза в секунду: список собран один раз, дальше меняются тексты и классы (и только если изменились).
import { COIN_HTML } from './coin.ts';
import { JUKE_GAP_MS, JUKE_PRICE, JUKE_QUEUE_MAX, JUKE_SONGS, fmtSongTime, songMs, type JukeView } from '../../shared/jukebox.ts';
import './jukebox.css';

export interface JukeboxPanelState {
  /** Что прислал сервер: cur {song, pid, nick, start} | null, queue [{song, pid, nick}] до 5 */
  view: JukeView | null;
  /** Серверное время «сейчас», мс — для полосы и «через N с» */
  serverNow: number;
  /** Свой pid: свою строку в очереди выделить, «ты» вместо ника */
  myPid: number;
  /** Баланс жетонов сейчас */
  tokens: number;
  /** Номер песни, на которую ждём ответа сервера (кнопки на это время неактивны) */
  pending: number | null;
  /** Последний ответ сервера — строка внизу окна */
  note: string | null;
}

export interface JukeboxPanelActions {
  /** Заказ: клик по кнопке или Enter на выбранной */
  play(song: number): void;
  /** ✕ или Esc — закрывает связка (вернёт мышь), панель только просит */
  close(): void;
}

interface SongRow {
  li: HTMLElement;
  btn: HTMLButtonElement;
  label: string;
}

interface QueueRow {
  li: HTMLElement;
  emoji: HTMLElement;
  title: HTMLElement;
  who: HTMLElement;
  when: HTMLElement;
}

const PLAY_HTML = `Поставить · ${JUKE_PRICE} ${COIN_HTML}`;
const POOR_HTML = `Нужно ${JUKE_PRICE} ${COIN_HTML}`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  parent?.appendChild(e);
  return e;
}

/** Текст меняем, только если он другой: окно обновляется часто, а лишние записи в DOM дёргают раскладку */
function setText(e: HTMLElement, text: string): void {
  if (e.textContent !== text) e.textContent = text;
}

export class JukeboxPanel {
  private readonly root: HTMLElement;
  private readonly rows: SongRow[] = [];
  private readonly queueRows: QueueRow[] = [];
  private readonly nowBox: HTMLElement;
  private readonly nowEmoji: HTMLElement;
  private readonly nowTitle: HTMLElement;
  private readonly nowWho: HTMLElement;
  private readonly nowTime: HTMLElement;
  private readonly nowFill: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly queueBox: HTMLElement;
  private readonly noteEl: HTMLElement;
  private open_ = false;
  private sel = 0;
  private last: JukeboxPanelState | null = null;
  private readonly actions: JukeboxPanelActions;

  constructor(host: HTMLElement, actions: JukeboxPanelActions) {
    this.actions = actions;
    this.root = el('div', 'jb', host);
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Музыкальный автомат');

    const head = el('div', 'jb-head', this.root);
    el('div', 'jb-title', head).textContent = '🎵 Музыкальный автомат';
    const x = el('button', 'jb-x', head);
    x.type = 'button';
    x.textContent = '✕';
    x.title = 'Закрыть (Esc)';
    x.setAttribute('aria-label', 'Закрыть');
    x.addEventListener('click', () => this.actions.close());

    // сейчас играет
    this.nowBox = el('div', 'jb-now', this.root);
    el('div', 'jb-cap', this.nowBox).textContent = 'Сейчас играет';
    const nowLine = el('div', 'jb-now-line', this.nowBox);
    this.nowEmoji = el('span', 'jb-now-emoji', nowLine);
    const nowText = el('div', 'jb-now-text', nowLine);
    this.nowTitle = el('b', 'jb-now-title', nowText);
    this.nowWho = el('span', 'jb-now-who', nowText);
    const bar = el('div', 'jb-bar', this.nowBox);
    this.nowFill = el('i', '', bar);
    this.nowTime = el('div', 'jb-now-time', this.nowBox);

    // общая строка над списком: «Твоя песня уже в очереди» / «Очередь полная»
    this.banner = el('div', 'jb-banner', this.root);
    this.banner.hidden = true;

    // список песен — один раз
    const list = el('ol', 'jb-list', this.root);
    JUKE_SONGS.forEach((s, i) => {
      const li = el('li', 'jb-song', list);
      el('kbd', 'jb-key', li).textContent = String(i + 1);
      el('span', 'jb-emoji', li).textContent = s.emoji;
      const meta = el('span', 'jb-meta', li);
      el('b', 'jb-name', meta).textContent = s.title;
      el('small', 'jb-mood', meta).textContent = `${s.mood} · ${fmtSongTime(songMs(i) / 1000)}`;
      const btn = el('button', 'jb-play', li);
      btn.type = 'button';
      btn.innerHTML = PLAY_HTML;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.select(i);
        if (!btn.disabled) this.actions.play(i);
      });
      li.addEventListener('click', () => this.select(i));
      this.rows.push({ li, btn, label: 'play' });
    });

    // очередь — строки заранее, дальше только прячем и подписываем
    this.queueBox = el('div', 'jb-queue', this.root);
    el('div', 'jb-cap', this.queueBox).textContent = `Очередь (до ${JUKE_QUEUE_MAX})`;
    const q = el('ol', 'jb-qlist', this.queueBox);
    for (let i = 0; i < JUKE_QUEUE_MAX; i++) {
      const li = el('li', 'jb-q', q);
      const emoji = el('span', 'jb-q-emoji', li);
      const title = el('span', 'jb-q-title', li);
      const who = el('span', 'jb-q-who', li);
      const when = el('span', 'jb-q-when', li);
      li.hidden = true;
      this.queueRows.push({ li, emoji, title, who, when });
    }

    this.noteEl = el('div', 'jb-note', this.root);
    this.noteEl.hidden = true;
    el('div', 'jb-keys', this.root).textContent = '1–8 или ↑↓ — выбрать · Enter — поставить · Esc — закрыть';

    // клики внутри окна не должны уходить в игру (захват мыши, выстрелы, шаги)
    for (const type of ['mousedown', 'pointerdown', 'touchstart', 'wheel'] as const) {
      this.root.addEventListener(type, (e) => e.stopPropagation(), { passive: true });
    }
    this.select(0);
  }

  open(): void {
    if (this.open_) return;
    this.open_ = true;
    this.root.hidden = false;
    if (this.last) this.update(this.last);
  }

  close(): void {
    if (!this.open_) return;
    this.open_ = false;
    this.root.hidden = true;
  }

  get isOpen(): boolean {
    return this.open_;
  }

  update(s: JukeboxPanelState): void {
    this.last = s;
    if (!this.open_) return;
    const view = s.view;
    const cur = view?.cur ?? null;
    const queue = view?.queue ?? [];

    // сейчас играет
    if (!cur) {
      this.nowBox.classList.add('idle');
      setText(this.nowEmoji, '🎶');
      setText(this.nowTitle, 'Тишина — поставь первую песню');
      setText(this.nowWho, '');
      setText(this.nowTime, '');
      this.nowFill.style.width = '0%';
    } else {
      this.nowBox.classList.remove('idle');
      const song = JUKE_SONGS[cur.song];
      const total = songMs(cur.song);
      setText(this.nowEmoji, song?.emoji ?? '🎵');
      setText(this.nowTitle, song?.title ?? '…');
      setText(this.nowWho, `заказ: ${cur.pid === s.myPid ? 'ты' : cur.nick}`);
      const t = s.serverNow - cur.start;
      if (t < 0) {
        setText(this.nowTime, `начнётся через ${Math.ceil(-t / 1000)} с`);
        this.nowFill.style.width = '0%';
      } else {
        const k = total > 0 ? Math.min(1, t / total) : 0;
        setText(this.nowTime, `${fmtSongTime(Math.min(t, total) / 1000)} / ${fmtSongTime(total / 1000)}`);
        this.nowFill.style.width = `${(k * 100).toFixed(1)}%`;
      }
    }

    // кнопки песен
    const mineQueued = queue.some((e) => e.pid === s.myPid);
    const full = queue.length >= JUKE_QUEUE_MAX;
    const poor = s.tokens < JUKE_PRICE;
    const busy = s.pending !== null;
    let bannerText = '';
    if (mineQueued) bannerText = 'Твоя песня уже в очереди — дождись её';
    else if (full) bannerText = 'Очередь полная — подожди, пока доиграет';
    this.banner.hidden = !bannerText;
    setText(this.banner, bannerText);

    this.rows.forEach((row, i) => {
      let label: string;
      if (cur?.song === i) label = 'playing';
      else if (queue.some((e) => e.song === i)) label = 'queued';
      else if (busy && s.pending === i) label = 'wait';
      else if (mineQueued || full) label = 'blocked';
      else if (poor) label = 'poor';
      else label = 'play';
      const disabled = label !== 'play' || busy;
      if (row.btn.disabled !== disabled) row.btn.disabled = disabled;
      if (row.label !== label) {
        row.label = label;
        row.li.dataset.st = label;
        row.btn.innerHTML =
          label === 'playing' ? '♪ Играет'
          : label === 'queued' ? 'В очереди'
          : label === 'wait' ? 'Ставим…'
          : label === 'poor' ? POOR_HTML
          : PLAY_HTML;
      }
    });

    // очередь со временем старта: следующая — после текущей и паузы, дальше по порядку
    let at = cur ? Math.max(cur.start, s.serverNow) + Math.max(0, songMs(cur.song) - Math.max(0, s.serverNow - cur.start)) + JUKE_GAP_MS : NaN;
    this.queueBox.classList.toggle('empty', queue.length === 0);
    this.queueRows.forEach((row, i) => {
      const e = queue[i];
      row.li.hidden = !e;
      if (!e) return;
      const song = JUKE_SONGS[e.song];
      setText(row.emoji, song?.emoji ?? '🎵');
      setText(row.title, song?.title ?? '…');
      const mine = e.pid === s.myPid;
      row.li.classList.toggle('mine', mine);
      setText(row.who, mine ? 'ты' : e.nick);
      setText(row.when, Number.isFinite(at) ? `через ${fmtSongTime((at - s.serverNow) / 1000)}` : '');
      at += songMs(e.song) + JUKE_GAP_MS;
    });

    this.noteEl.hidden = !s.note;
    setText(this.noteEl, s.note ?? '');
  }

  /** Пока открыто: 1–8 и ↑/↓ — выбрать, Enter — поставить выбранную, Esc — закрыть. true — клавиша съедена. */
  onKey(code: string, e: KeyboardEvent): boolean {
    if (!this.open_) return false;
    const n = JUKE_SONGS.length;
    const digit = /^(?:Digit|Numpad)([1-9])$/.exec(code);
    if (digit) {
      const i = Number(digit[1]) - 1;
      if (i >= n) return false;
      this.select(i);
      e.preventDefault();
      return true;
    }
    if (code === 'ArrowUp' || code === 'ArrowDown') {
      this.select((this.sel + (code === 'ArrowUp' ? n - 1 : 1)) % n);
      e.preventDefault();
      return true;
    }
    if (code === 'Enter' || code === 'NumpadEnter') {
      const row = this.rows[this.sel];
      if (row && !row.btn.disabled) this.actions.play(this.sel);
      e.preventDefault();
      return true;
    }
    if (code === 'Escape') {
      this.actions.close();
      e.preventDefault();
      return true;
    }
    return false;
  }

  private select(i: number): void {
    this.rows[this.sel]?.li.classList.remove('sel');
    this.sel = i;
    const li = this.rows[i]?.li;
    if (!li) return;
    li.classList.add('sel');
    if (this.open_) li.scrollIntoView({ block: 'nearest' });
  }
}

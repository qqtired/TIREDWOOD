// Окно музыкального автомата на ките 2.0: что играет сейчас (полоса), список песен с кнопкой «Поставить · 10 🪙» и очередь.
// Сервер решает всё сам (цена, очередь, расстояние) — окно только показывает состояние и просит заказ.
// Окно — нативный <dialog class="k-scrim"> с .k-window (как окна рыбалки и фермы): затемнение, фон инертен, игрок не ходит.
// Закрыть — ✕, Esc, E, клик мимо окна; отошёл от автомата — закрывает связка (client/lobby/jukebox.ts). Клавиши окна:
// 1–9 и ↑/↓ — выбрать, Enter — поставить. Связку (открыть у автомата, мышь, тосты, звук) делает client/lobby/scene.ts.
// update() зовут ~4 раза в секунду: список собран один раз, дальше меняются тексты и классы (и только если изменились).
import { JUKE_GAP_MS, JUKE_QUEUE_MAX, JUKE_SONGS, fmtSongTime, songMs, songPrice, songSpecial, type JukeView } from '../../shared/jukebox.ts';
import { coinHtml, h, iconImg, keyHtml, meterHtml } from './kit/dom.ts';
import { setMeter } from './kit/modes.ts';
import { sfx } from './kit/sfx.ts';
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
  /** ✕, Esc, E или клик мимо — закрывает связка (вернёт мышь), панель только просит */
  close(): void;
}

type SongState = 'play' | 'playing' | 'queued' | 'wait' | 'blocked' | 'poor';

interface SongRow {
  li: HTMLElement;
  btn: HTMLButtonElement;
  pill: HTMLElement;
  st: SongState | '';
}

interface QueueRow {
  li: HTMLElement;
  title: HTMLElement;
  who: HTMLElement;
  when: HTMLElement;
}

/** Цена у каждой песни своя (особая — дороже) */
const playHtml = (price: number): string => `Поставить · ${price} ${coinHtml()}`;
const poorHtml = (price: number): string => `Нужно ${price} ${coinHtml()}`;

/** Текст меняем, только если он другой: окно обновляется часто, а лишние записи в DOM дёргают раскладку */
function setText(e: HTMLElement, text: string): void {
  if (e.textContent !== text) e.textContent = text;
}

export class JukeboxPanel {
  private readonly dlg: HTMLDialogElement;
  private readonly win: HTMLElement;
  private readonly rows: SongRow[] = [];
  private readonly queueRows: QueueRow[] = [];
  private readonly nowBox: HTMLElement;
  private readonly nowTitle: HTMLElement;
  private readonly nowWho: HTMLElement;
  private readonly nowTime: HTMLElement;
  private readonly nowMeter: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly queueBox: HTMLElement;
  private readonly noteEl: HTMLElement;
  private sel = 0;
  private last: JukeboxPanelState | null = null;
  private readonly actions: JukeboxPanelActions;

  constructor(host: HTMLElement, actions: JukeboxPanelActions) {
    this.actions = actions;
    const dlg = this.dlg = document.createElement('dialog');
    dlg.className = 'k-scrim jb-dlg';
    dlg.setAttribute('aria-label', 'Музыкальный автомат');
    const win = this.win = dlg.appendChild(h('section', 'k-window jb-win'));
    win.innerHTML = `
      <header class="k-win-head">
        <span class="k-win-portrait">${iconImg('music', '')}</span>
        <div class="k-win-titles"><p class="k-eyebrow">Набережная · общая музыка</p><h2 class="k-win-title">Музыкальный автомат</h2></div>
        <div class="k-win-tools"><button type="button" class="k-close" aria-label="Закрыть">${keyHtml('Esc', undefined, 'sm')}</button></div>
      </header>
      <div class="k-win-body jb-body">
        <div class="k-cell jb-now">
          ${iconImg('music', 'jb-now-ic')}
          <div class="jb-now-text"><p class="k-eyebrow">Сейчас играет</p><b class="jb-now-title"></b><span class="jb-now-who"></span></div>
          <span class="jb-now-time k-num"></span>
          ${meterHtml(0, 'good', 'k-meter--thin jb-now-bar')}
        </div>
        <div class="jb-queue">
          <p class="k-eyebrow jb-h">Дальше · очередь до ${JUKE_QUEUE_MAX} песен</p>
          <ol class="jb-qlist"></ol>
        </div>
        <p class="jb-banner" hidden></p>
        <ol class="jb-list"></ol>
      </div>
      <footer class="k-win-foot">
        <span class="k-note jb-note" role="status"></span>
        <span class="jb-keys key-hint">${keyHtml('1')}–${keyHtml(String(JUKE_SONGS.length))}<em>выбрать</em>${keyHtml('Enter')}<em>поставить</em></span>
      </footer>`;
    const q = <T extends HTMLElement>(s: string): T => win.querySelector<T>(s)!;
    this.nowBox = q('.jb-now');
    this.nowTitle = q('.jb-now-title');
    this.nowWho = q('.jb-now-who');
    this.nowTime = q('.jb-now-time');
    this.nowMeter = q('.jb-now-bar');
    // общая строка над списком: «Твоя песня уже в очереди» / «Очередь полная»
    this.banner = q('.jb-banner');
    this.queueBox = q('.jb-queue');
    this.noteEl = q('.jb-note');
    q('.k-close').addEventListener('click', () => this.actions.close());

    // список песен — один раз
    const list = q('.jb-list');
    JUKE_SONGS.forEach((s, i) => {
      const special = songSpecial(i);
      const li = list.appendChild(h('li', `jb-song${special ? ' is-special' : ''}`));
      li.innerHTML = `${keyHtml(String(i + 1))}<span class="jb-meta"><b class="jb-name"></b><small class="jb-mood"></small></span>`
        + '<span class="k-pill k-pill--sm jb-pill" hidden></span><button type="button" class="k-btn k-btn--sm jb-play"><span class="k-row-line"></span></button>';
      const name = li.querySelector<HTMLElement>('.jb-name')!;
      name.textContent = s.title;
      // особая (дороже обычных): золотая пилюля у названия — видно сразу, без подсказки при наведении
      if (special) name.insertAdjacentHTML('beforeend', ' <span class="k-pill k-pill--gold k-pill--sm">особая</span>');
      li.querySelector<HTMLElement>('.jb-mood')!.textContent = `${s.mood} · ${fmtSongTime(songMs(i) / 1000)}`;
      const btn = li.querySelector<HTMLButtonElement>('.jb-play')!;
      btn.querySelector('.k-row-line')!.innerHTML = playHtml(songPrice(i));
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.select(i);
        if (!btn.disabled) this.actions.play(i);
      });
      li.addEventListener('click', () => this.select(i));
      this.rows.push({ li, btn, pill: li.querySelector<HTMLElement>('.jb-pill')!, st: '' });
    });

    // очередь — строки заранее, дальше только прячем и подписываем
    const qlist = q('.jb-qlist');
    for (let i = 0; i < JUKE_QUEUE_MAX; i++) {
      const li = qlist.appendChild(h('li', 'jb-q', '<span class="jb-q-title"></span><span class="jb-q-who"></span><span class="jb-q-when k-num"></span>'));
      li.hidden = true;
      this.queueRows.push({ li, title: li.querySelector('.jb-q-title')!, who: li.querySelector('.jb-q-who')!, when: li.querySelector('.jb-q-when')! });
    }

    // кнопки не забирают фокус (Enter — заказ выбранной, а не «нажатие» последней кнопки)
    win.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).closest('button')) e.preventDefault();
    });
    // клавиши — окну, не игре (игрок не ходит); V (голос) ловится раньше, на захвате
    dlg.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.repeat && e.code !== 'ArrowUp' && e.code !== 'ArrowDown') return;
      if (e.code === 'KeyE') {
        e.preventDefault();
        this.actions.close();
        return;
      }
      this.onKey(e.code, e);
    });
    dlg.addEventListener('keyup', (e) => e.stopPropagation());
    // Esc браузера и клик по затемнению мимо окна
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      this.actions.close();
    });
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) this.actions.close();
    });
    for (const type of ['pointerdown', 'wheel'] as const) dlg.addEventListener(type, (e) => e.stopPropagation(), { passive: true });
    host.appendChild(dlg);
    this.select(0);
  }

  open(): void {
    if (this.dlg.open) return;
    this.dlg.showModal();
    this.dlg.focus({ preventScroll: true });
    this.win.classList.remove('is-in');
    void this.win.offsetWidth;
    this.win.classList.add('is-in');
    sfx.play('open');
    if (this.last) this.update(this.last);
    this.select(this.sel);
  }

  close(): void {
    if (!this.dlg.open) return;
    this.dlg.close();
    sfx.play('close');
  }

  get isOpen(): boolean {
    return this.dlg.open;
  }

  update(s: JukeboxPanelState): void {
    this.last = s;
    if (!this.dlg.open) return;
    const view = s.view;
    const cur = view?.cur ?? null;
    const queue = view?.queue ?? [];

    // сейчас играет
    this.nowBox.classList.toggle('is-idle', !cur);
    if (!cur) {
      setText(this.nowTitle, 'Тишина — поставь первую песню');
      setText(this.nowWho, '');
      setText(this.nowTime, '');
      setMeter(this.nowMeter, 0);
    } else {
      const song = JUKE_SONGS[cur.song];
      const total = songMs(cur.song);
      setText(this.nowTitle, song?.title ?? '…');
      const mine = cur.pid === s.myPid;
      setText(this.nowWho, `заказ: ${mine ? 'ты' : cur.nick}`);
      this.nowWho.classList.toggle('k-gold', mine);
      const t = s.serverNow - cur.start;
      if (t < 0) {
        setText(this.nowTime, `через ${Math.ceil(-t / 1000)} с`);
        setMeter(this.nowMeter, 0);
      } else {
        setText(this.nowTime, `${fmtSongTime(Math.min(t, total) / 1000)} / ${fmtSongTime(total / 1000)}`);
        setMeter(this.nowMeter, total > 0 ? Math.min(1, t / total) : 0);
      }
    }

    // кнопки песен
    const mineQueued = queue.some((e) => e.pid === s.myPid);
    const full = queue.length >= JUKE_QUEUE_MAX;
    const busy = s.pending !== null;
    let bannerText = '';
    if (mineQueued) bannerText = 'Твоя песня уже в очереди — дождись её';
    else if (full) bannerText = 'Очередь полная — подожди, пока доиграет';
    this.banner.hidden = !bannerText;
    setText(this.banner, bannerText);

    this.rows.forEach((row, i) => {
      let st: SongState;
      if (cur?.song === i) st = 'playing';
      else if (queue.some((e) => e.song === i)) st = 'queued';
      else if (busy && s.pending === i) st = 'wait';
      else if (mineQueued || full) st = 'blocked';
      else if (s.tokens < songPrice(i)) st = 'poor';
      else st = 'play';
      const disabled = st !== 'play' || busy;
      if (row.btn.disabled !== disabled) row.btn.disabled = disabled;
      if (row.st === st) return;
      row.st = st;
      row.li.dataset.st = st;
      // играет и в очереди — пилюлей вместо кнопки
      const pill = st === 'playing' || st === 'queued';
      row.pill.hidden = !pill;
      row.btn.hidden = pill;
      if (pill) {
        row.pill.className = `k-pill k-pill--sm jb-pill${st === 'playing' ? ' k-pill--good' : ''}`;
        row.pill.textContent = st === 'playing' ? 'Играет' : 'В очереди';
      } else {
        row.btn.querySelector('.k-row-line')!.innerHTML = st === 'wait' ? 'Ставим…' : st === 'poor' ? poorHtml(songPrice(i)) : playHtml(songPrice(i));
      }
    });

    // очередь со временем старта: следующая — после текущей и паузы, дальше по порядку
    let at = cur ? Math.max(cur.start, s.serverNow) + Math.max(0, songMs(cur.song) - Math.max(0, s.serverNow - cur.start)) + JUKE_GAP_MS : NaN;
    this.queueBox.hidden = queue.length === 0;
    this.queueRows.forEach((row, i) => {
      const e = queue[i];
      row.li.hidden = !e;
      if (!e) return;
      setText(row.title, JUKE_SONGS[e.song]?.title ?? '…');
      const mine = e.pid === s.myPid;
      row.li.classList.toggle('is-own', mine);
      setText(row.who, mine ? 'ты' : e.nick);
      setText(row.when, Number.isFinite(at) ? `через ${fmtSongTime((at - s.serverNow) / 1000)}` : '');
      at += songMs(e.song) + JUKE_GAP_MS;
    });

    setText(this.noteEl, s.note ?? '');
  }

  /** Пока открыто: 1–9 и ↑/↓ — выбрать, Enter — поставить выбранную, Esc — закрыть. true — клавиша съедена. */
  onKey(code: string, e: KeyboardEvent): boolean {
    if (!this.dlg.open) return false;
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
      if (row && !row.btn.disabled && !row.btn.hidden) this.actions.play(this.sel);
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
    this.rows[this.sel]?.li.classList.remove('is-sel');
    this.sel = i;
    const li = this.rows[i]?.li;
    if (!li) return;
    li.classList.add('is-sel');
    if (this.dlg.open) li.scrollIntoView({ block: 'nearest' });
  }
}

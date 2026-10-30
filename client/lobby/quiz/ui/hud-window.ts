// «Ракушка»: окно у трибуны (docs/quiz/tech.md §21) — вкладки «Играть» (или «Пак и темы» у ведущего «Своей игры» в шаге
// setup), «Паки», «Загрузить», «Рекорды». Нативный <dialog class="k-scrim"> > section.k-window (820), ✕, Esc и клик мимо
// закрывают (QDialog из hud-windows.ts). Игру отсюда не запускают. Сеть — через send; письма сервера (qzPacks, qzPackOutline,
// qzTicket, qzRecs, qzErr) приходят в onMsg. Загрузка: siq.ts разбирает файл, upload.ts отправляет и скачивает по ссылке.
// «Ракушка» 1.1: «Паки» — «Сыграть» (заказ на следующую игру) и строка заказа из снимка; «Загрузить» — три шага (откуда → проверка →
// сохранить) или плашка «загружать пока может только …», если сервер не пускает (QzMe.canUpload). Образец вида — lab/quiz/v2.
import type { QuizClientMsg } from '../../../../shared/quiz/net.ts';
import { PackError, validatePack } from '../../../../shared/quiz/pack.ts';
import { type QzMe, type QzMyRecs, type QzOrder, type QzPackInfo, type QzPackKind, type QzPackOutline, type QzTopRecs, type QzUpFile, type QzView, QZ_PACK } from '../../../../shared/quiz/types.ts';
import { sfx } from '../../../ui/kit/sfx.ts';
import { COIN_K, esc, pic } from './hud-model.ts';
import { QDialog } from './hud-windows.ts';
import { parseSiq, fmtSize } from './siq.ts';
import { TicketDesk, UploadError, fetchPack, uploadPack, type FetchProgress, type UploadMemo, type UploadProgress, type UploadTicket } from './upload.ts';
import {
  KIND_NAME, UPLOAD_WAYS, canOrder, checkDraft, defaultSetup, dayLine, draftFromText, fetchText, hasFinal, kindIcon, lockHtml, modeCards, myRecs, orderRows, ordersHtml, packOutlineHtml,
  packRow, packSummary, pickTab, playableRounds, savedHtml, saveGate, setupReason, sigameLink, sourceNote, startMsg, tabsFor, toggleTheme, topLists, uploadGate,
  type Draft, type PackSource, type PlayState, type Saved, type SaveGate, type SetupSel, type UploadWay, type WinTab,
} from './win-model.ts';

const SEARCH_MS = 300;
/** сервер молчит на запрос списка дольше — пишем «Не получилось загрузить» и даём «Ещё раз» */
const LAG_MS = 6000;
const NOTE_PLAY = 'Как начать: садись на стул — все, кто сидит, голосуют, во что играть';

interface Mine {
  me: QzMyRecs;
  top: QzTopRecs;
}

/** Пак, собранный в окне «Загрузить»: из .siq (есть файлы; свой или скачанный по ссылке) или из текста / CSV */
interface Loaded {
  draft: Draft;
  files: QzUpFile[];
  blobs: Map<string, Blob>;
  /** откуда пак — подпись «из файла …» / «из библиотеки SIGame» */
  from: PackSource;
  stats: string;
}

/** Сколько ждём подтверждение заказа: через столько мс — «Ждём подтверждение сервера…», ещё через столько — «не вышло» */
const ORDER_SLOW_MS = 5000;
const ORDER_GIVEUP_MS = 7000;
/** Красная строка про заказ сама исчезает */
const ORDER_NOTE_MS = 4000;

export interface WinOpts {
  send: (m: QuizClientMsg) => void;
  /** Уровень игрока: меньше 3 — загрузка закрыта (кнопка серая с причиной); null — не знаем, ответит сервер */
  level?: () => number | null;
}

const el = (html: string): HTMLElement => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
};

export class QuizWindow {
  private readonly o: WinOpts;
  private dlg: QDialog | null = null;
  private tab: WinTab = 'play';
  /** я ведущий «Своей игры» в шаге setup: первая вкладка — «Пак и темы» */
  private setup = false;
  private autoDone = false;
  private catalog: { list: QzPackInfo[]; total: number; admin: boolean } | null = null;
  private jpList: QzPackInfo[] | null = null;
  private readonly outlines = new Map<string, QzPackOutline>();
  private sel: SetupSel | null = null;
  private packQ = '';
  private kind: QzPackKind | '' = '';
  private armed = '';
  private armTimer = 0;
  private searchTimer = 0;
  private recs: Mine | null = null;
  private dayCoins = 0;
  private loaded: Loaded | null = null;
  private busy = false;
  private progress: UploadProgress | null = null;
  private note = '';
  private tone: '' | 'bad' | 'good' = '';
  private text = '';
  /** название и «18+», поправленные руками: переживают правку текста */
  private titleEdit: string | null = null;
  private adultEdit: boolean | null = null;
  private readonly desk = new TicketDesk();
  /** оборванная загрузка: билет один на пак, поэтому «Сохранить» ещё раз продолжает тот же пак (upload.ts) */
  private readonly upMemo: UploadMemo = { cur: null };
  /** ответа на запрос списка нет дольше LAG_MS (сервер занят или окно открыли вне «Ракушки») — вместо вечного «Загружаю…» */
  private lagTimer = 0;
  private lagged = false;
  private failText = '';
  /** «Сыграть»: заказы из снимка (по одному на вид), мой номер для «ты», пак, подтверждение которого жду, строка под списком */
  private orders: QzOrder[] = [];
  private ordersKey = '';
  private mySlot = -1;
  private ordering = '';
  private orderTimer = 0;
  private orderNote = '';
  private orderBad = false;
  /** «Загрузить»: можно ли мне (QzMe.canUpload; нет поля — решает уровень) и слова сервера, если нельзя */
  private canUpload: boolean | undefined;
  private uploadWhy = '';
  /** шаг 1: способ, ссылка из поля, ход скачивания и красная строка под полем ссылки */
  private way: UploadWay = 'link';
  private link = '';
  private linkErr = '';
  private fetching: FetchProgress | null = null;
  /** шаг 3: что только что сохранили и что с заказом */
  private saved: Saved | null = null;
  private body!: HTMLElement;
  private foot!: HTMLElement;
  private tabs!: HTMLElement;

  constructor(o: WinOpts) {
    this.o = o;
  }

  get isOpen(): boolean {
    return !!this.dlg?.isOpen;
  }

  /** Открыть на вкладке: 'play' | 'packs' | 'upload' | 'records' (у ведущего в setup — 'setup'); без имени — первая */
  open(want?: string): void {
    if (!this.dlg) this.build();
    this.go(pickTab(want, this.setup));
    this.dlg!.show();
  }

  close(): void {
    this.heard();
    this.dlg?.close(true);
  }

  /** Привести к снимку: ведущий в шаге setup — окно открывается само на «Пак и темы» (один раз за шаг) */
  sync(v: QzView | null, me: QzMe | null): void {
    if (me) this.dayCoins = me.dayCoins ?? this.dayCoins;
    this.syncOrders(v, me);
    this.syncGate(me);
    const jp = v?.phase === 'game' ? v.jp : null;
    const hosting = !!jp && !!me && jp.host?.slot === me.slot && jp.step === 'setup';
    if (hosting !== this.setup) {
      this.setup = hosting;
      if (this.isOpen) {
        // выбор пака кончился (время или Затейник): окно с устаревшим выбором убираем, остальные вкладки остаются
        if (!hosting && this.tab === 'setup') this.close();
        else this.go(pickTab(this.tab === 'setup' ? 'play' : this.tab, hosting));
      }
    }
    if (hosting && !this.autoDone) { this.autoDone = true; this.open('setup'); }
    if (!hosting) this.autoDone = false;
  }

  dispose(): void {
    clearTimeout(this.lagTimer);
    clearTimeout(this.armTimer);
    clearTimeout(this.searchTimer);
    clearTimeout(this.orderTimer);
    this.dlg?.destroy();
    this.dlg = null;
    this.armed = '';
  }

  /** Письма сервера для окна; true — разобрали */
  onMsg(m: { t: string }): boolean {
    const a = m as Record<string, unknown>;
    switch (m.t) {
      case 'qzPacks': {
        this.heard();
        const list = a.list as QzPackInfo[], total = Number(a.total) || list.length;
        if (this.tab === 'setup') { this.jpList = list; this.sel ??= null; if (this.isOpen) this.fillSetup(); } else { this.catalog = { list, total, admin: !!a.admin }; if (this.isOpen && this.tab === 'packs') this.fillPacks(); }
        return true;
      }
      case 'qzPackOutline': {
        this.heard();
        const outline = a.outline as QzPackOutline;
        this.outlines.set(outline.info.id, outline);
        if (this.tab === 'setup' && this.sel?.pack === outline.info.id) {
          const d = defaultSetup(outline);
          if (d) this.sel = d;
        }
        if (this.isOpen && this.tab === 'setup') this.fillSetup();
        return true;
      }
      case 'qzTicket':
        this.desk.ticket({ ticket: String(a.ticket), exp: Number(a.exp), left: Number(a.left) });
        return true;
      case 'qzRecs':
        this.heard();
        this.recs = { me: a.me as QzMyRecs, top: a.top as QzTopRecs };
        if (this.isOpen && this.tab === 'records') this.fillRecs();
        return true;
      case 'qzErr':
        // «Сыграть» не вышло (пак удалили, такой вид не заказать): слова сервера под списком, список остаётся
        if (this.ordering && a.code === 'pack') { this.orderFail(String(a.text ?? '') || 'Не получилось заказать — попробуй ещё раз'); return true; }
        // сбой каталога паков: вместо «Загружаю…» — слова сервера и «Ещё раз»
        if (a.code === 'pack' && this.isOpen && (this.tab === 'packs' || this.tab === 'setup' || this.tab === 'records')) {
          this.failText = String(a.text ?? '');
          this.lagged = true;
          clearTimeout(this.lagTimer);
          this.refill();
          return true;
        }
        return this.desk.error(String(a.code), String(a.text ?? ''));
      default:
        return false;
    }
  }

  // ---------------------------------------------------------------- каркас

  private build(): void {
    const dlg = new QDialog(document.body, {
      label: 'Ракушка', cls: 'qw-window', icon: 'scroll', eyebrow: 'Викторины на набережной', title: 'Ракушка',
      body: '', foot: '',
    }, () => { /* закрыли сами */ });
    this.dlg = dlg;
    this.body = dlg.win.querySelector<HTMLElement>('.k-win-body')!;
    this.foot = dlg.win.querySelector<HTMLElement>('.k-win-foot')!;
    this.tabs = el('<div class="k-tabs" role="tablist"></div>');
    dlg.win.insertBefore(this.tabs, this.body);
    dlg.dlg.addEventListener('click', (e) => {
      const t = (e.target as Element | null)?.closest<HTMLElement>('[data-w]');
      if (t) this.click(t);
    });
    dlg.dlg.addEventListener('input', (e) => this.input(e.target as HTMLElement));
    dlg.dlg.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.target as HTMLElement).dataset?.w === 'link') { e.preventDefault(); void this.fetchLink(); }
    });
    dlg.dlg.addEventListener('change', (e) => this.change(e.target as HTMLInputElement));
    dlg.dlg.addEventListener('dragover', (e) => { if ((e.target as Element).closest('.qw-drop')) { e.preventDefault(); (e.target as Element).closest('.qw-drop')?.classList.add('is-over'); } });
    dlg.dlg.addEventListener('dragleave', (e) => (e.target as Element).closest('.qw-drop')?.classList.remove('is-over'));
    dlg.dlg.addEventListener('drop', (e) => {
      const z = (e.target as Element).closest('.qw-drop');
      if (!z) return;
      e.preventDefault();
      z.classList.remove('is-over');
      const f = e.dataTransfer?.files?.[0];
      if (f) void this.takeFile(f);
    });
  }

  private go(tab: WinTab): void {
    this.heard();
    this.tab = tab;
    this.tabs.innerHTML = tabsFor(this.setup).map((t) => `<button type="button" class="k-tab${t.id === tab ? ' is-on' : ''}" role="tab" aria-selected="${t.id === tab}" data-w="tab" data-tab="${t.id}">${pic(t.icon, 'k-ic')}${esc(t.label)}</button>`).join('');
    this.armed = '';
    switch (tab) {
      case 'play': this.showPlay(); break;
      case 'setup': this.showSetup(); break;
      case 'packs': this.showPacks(); break;
      case 'upload': this.showUpload(); break;
      case 'records': this.showRecs(); break;
    }
  }

  private setFoot(note: string, buttons = '', tone = ''): void {
    this.foot.innerHTML = `<span class="k-note qw-note${tone ? ` is-${tone}` : ''}">${note}</span>${buttons}`;
  }

  // ---------------------------------------------------------------- «Играть»

  private showPlay(): void {
    this.body.innerHTML = '<div class="qw-modes">' + modeCards().map((c) => `<article class="qw-mode"><span class="qw-mode-ic">${pic(c.icon)}</span><div><b>${esc(c.name)}</b><span>${esc(c.who)}</span><span class="k-faint">${esc(c.len)}</span></div></article>`).join('') + '</div>';
    this.setFoot(NOTE_PLAY);
  }

  // ---------------------------------------------------------------- «Пак и темы»

  private showSetup(): void {
    this.body.innerHTML = '<div class="qj-setup"><p class="k-eyebrow">Пак</p><div class="qj-packs" data-w-list="setup"><p class="k-faint">Загружаю паки…</p></div><div data-w-rest="setup"></div></div>';
    if (!this.jpList) { this.o.send({ t: 'qz', a: 'packs', kind: 'jeopardy' }); this.watch(); }
    this.fillSetup();
  }

  private fillSetup(): void {
    const list = this.body.querySelector<HTMLElement>('[data-w-list=setup]');
    const rest = this.body.querySelector<HTMLElement>('[data-w-rest=setup]');
    if (!list || !rest) return;
    const packs = this.jpList;
    list.innerHTML = !packs ? this.loading('паки')
      : !packs.length ? '<p class="k-faint">Паков пока нет — загрузи свой во вкладке «Загрузить»</p>'
      : packs.map((p) => `<button type="button" class="qj-pack${this.sel?.pack === p.id ? ' is-on' : ''}" data-w="pack" data-id="${esc(p.id)}"><span class="qj-pack-ic">${pic(kindIcon(p.kind))}</span><b>${esc(p.title)}</b><span>${esc(p.builtin ? 'встроенный' : p.author)}${p.adult ? ' · 18+' : ''}</span><span>${p.themes} тем · ${p.questions} вопросов</span></button>`).join('');
    const o = this.sel ? this.outlines.get(this.sel.pack) : undefined;
    if (!this.sel || !o) {
      rest.innerHTML = this.sel ? this.loading('состав пака') : '';
      this.setupFoot();
      return;
    }
    const rounds = playableRounds(o);
    const cur = o.rounds[this.sel.round];
    rest.innerHTML = (rounds.length > 1 ? `<p class="k-eyebrow qj-eb">Раунд</p><div class="k-seg">${rounds.map((i) => `<button type="button" class="${i === this.sel!.round ? 'is-on' : ''}" data-w="round" data-i="${i}">${esc(o.rounds[i].name)}</button>`).join('')}</div>` : '')
      + `<p class="k-eyebrow qj-eb">Темы <span class="k-faint">отметь от 3 до 6</span></p><div class="qj-themes">${cur.themes.map((t, i) => `<label class="qj-theme"><input type="checkbox" data-w="theme" data-i="${i}"${this.sel!.themes.includes(i) ? ' checked' : ''}>${esc(t.name)}</label>`).join('')}</div>`
      + (hasFinal(o) ? `<label class="k-switch qj-final"><input type="checkbox" data-w="final"${this.sel.final ? ' checked' : ''}><span class="k-switch-track"></span><span>С финалом</span></label>` : '');
    this.setupFoot();
  }

  private setupFoot(): void {
    const why = setupReason(this.sel);
    const o = this.sel ? this.outlines.get(this.sel.pack) : undefined;
    this.setFoot(why || `Выбрано тем: ${this.sel!.themes.length}`,
      `<button type="button" class="k-btn k-btn--ghost" data-w="zat">Пусть ведёт Затейник</button><button type="button" class="k-btn k-btn--go" data-w="start"${why || !o ? ' disabled' : ''}>Начать</button>`);
  }

  // ---------------------------------------------------------------- ожидание ответа сервера

  /** Ждём ответ на запрос списка: не пришёл за LAG_MS — покажем «Не получилось загрузить» и «Ещё раз» */
  private watch(): void {
    clearTimeout(this.lagTimer);
    this.lagged = false;
    this.failText = '';
    this.lagTimer = window.setTimeout(() => { this.lagged = true; this.refill(); }, LAG_MS);
  }

  /** Ответ пришёл (или окно закрыли) */
  private heard(): void {
    clearTimeout(this.lagTimer);
    this.lagged = false;
    this.failText = '';
  }

  private loading(what: string): string {
    return this.lagged
      ? `<p class="k-faint">${this.failText ? esc(this.failText) : `Не получилось загрузить: ${what}`} <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-w="retry">Ещё раз</button></p>`
      : `<p class="k-faint">Загружаю: ${what}…</p>`;
  }

  private refill(): void {
    if (!this.isOpen) return;
    if (this.tab === 'setup') this.fillSetup();
    else if (this.tab === 'packs') this.fillPacks();
    else if (this.tab === 'records') this.fillRecs();
  }

  private retry(): void {
    if (this.tab === 'packs') { this.catalog = null; this.askPacks(); this.fillPacks(); }
    else if (this.tab === 'records') { this.recs = null; this.o.send({ t: 'qz', a: 'recs' }); this.watch(); this.fillRecs(); }
    else if (this.tab === 'setup') {
      const id = this.sel?.pack;
      if (id && !this.outlines.has(id)) this.o.send({ t: 'qz', a: 'packOutline', id });
      else { this.jpList = null; this.o.send({ t: 'qz', a: 'packs', kind: 'jeopardy' }); }
      this.watch();
      this.fillSetup();
    }
  }

  // ---------------------------------------------------------------- «Паки»

  private showPacks(): void {
    const kinds: Array<[QzPackKind | '', string]> = [['', 'Все'], ['jeopardy', 'Своя игра'], ['words', 'Слова'], ['whoofus', 'Кто из нас?']];
    this.body.innerHTML = `<div class="qw-orders" data-w-orders></div><div class="qw-bar"><input class="k-input" type="search" placeholder="Найти по названию или автору" maxlength="60" value="${esc(this.packQ)}" data-w="q" autocomplete="off"><div class="k-seg">${kinds.map(([k, n]) => `<button type="button" class="${this.kind === k ? 'is-on' : ''}" data-w="kind" data-k="${k}">${n}</button>`).join('')}</div></div><div class="qw-list" data-w-list="packs"></div>`;
    this.fillOrders();
    this.fillPacks();
    if (!this.catalog) this.askPacks();
  }

  private askPacks(): void {
    this.watch();
    this.o.send({ t: 'qz', a: 'packs', ...(this.packQ ? { q: this.packQ } : {}), ...(this.kind ? { kind: this.kind } : {}) });
  }

  /** Строка заказа вверху «Паков»: заказы из снимка (по одному на вид) или подсказка, как заказать */
  private fillOrders(): void {
    const box = this.body.querySelector<HTMLElement>('[data-w-orders]');
    if (box) box.innerHTML = ordersHtml(orderRows(this.orders, this.mySlot), pic);
  }

  /** У пака: можно заказать / отправил — жду подтверждения / уже заказан */
  private playState(p: QzPackInfo): PlayState {
    return this.orders.some((o) => o.id === p.id) ? 'done' : this.ordering === p.id ? 'wait' : '';
  }

  private fillPacks(): void {
    const list = this.body.querySelector<HTMLElement>('[data-w-list=packs]');
    if (!list) return;
    const c = this.catalog;
    list.innerHTML = !c ? this.loading('паки') : !c.list.length ? '<p class="k-faint">Ничего не нашлось</p>' : c.list.map((p) => packRow(p, this.armed === p.id, pic, this.playState(p))).join('');
    // под списком: ожидание или отказ заказа, иначе — сколько показано
    this.setFoot(this.orderNote ? esc(this.orderNote) : c ? `Показано ${c.list.length} из ${c.total}` : '', '', this.orderBad ? 'bad' : '');
  }

  // ---------------------------------------------------------------- «Сыграть»: заказ пака на следующую игру

  /** Снимок: заказы по одному на вид; мой заказ появился — подтверждён, снимаем «Заказываю…» */
  private syncOrders(v: QzView | null, me: QzMe | null): void {
    const orders = v?.orders ?? [];
    const slot = me?.slot ?? -1;
    const key = `${slot}|${orders.map((o) => `${o.kind}:${o.id}:${o.by.slot}`).join(',')}`;
    if (!v && this.ordering) { clearTimeout(this.orderTimer); this.ordering = ''; this.orderNote = ''; this.orderBad = false; }
    if (key === this.ordersKey) return;
    this.ordersKey = key;
    this.orders = orders;
    this.mySlot = slot;
    if (this.ordering && orders.some((o) => o.id === this.ordering)) this.ordered(this.ordering);
    else this.showOrders();
  }

  /** Перерисовать на открытой вкладке то, что зависит от заказов */
  private showOrders(): void {
    if (!this.isOpen) return;
    if (this.tab === 'packs') { this.fillOrders(); this.fillPacks(); } else if (this.tab === 'upload') this.fillDone();
  }

  /** «Сыграть»: письмо серверу и «Заказываю…» на кнопке; через 5 с — «Ждём подтверждение сервера…», ещё через 7 с — не вышло */
  private order(id: string): void {
    if (!id) return;
    this.ordering = id;
    this.orderNote = '';
    this.orderBad = false;
    this.o.send({ t: 'qz', a: 'packPlay', id });
    clearTimeout(this.orderTimer);
    this.orderTimer = window.setTimeout(() => {
      this.orderNote = 'Ждём подтверждение сервера…';
      this.showOrders();
      this.orderTimer = window.setTimeout(() => this.orderFail('Не получилось заказать — попробуй ещё раз'), ORDER_GIVEUP_MS);
    }, ORDER_SLOW_MS);
    this.showOrders();
  }

  /** Сервер подтвердил: заказ в снимке — строка вверху обновилась, у пака «Заказан» */
  private ordered(id: string): void {
    clearTimeout(this.orderTimer);
    this.ordering = '';
    this.orderNote = '';
    this.orderBad = false;
    if (this.saved?.id === id) this.saved.order = 'yes';
    if (this.isOpen) sfx.play('pop');
    this.showOrders();
  }

  /** Не вышло: слова сервера (или своя строка) под списком, через несколько секунд сами уходят */
  private orderFail(text: string): void {
    clearTimeout(this.orderTimer);
    const id = this.ordering;
    this.ordering = '';
    this.orderNote = text;
    this.orderBad = true;
    if (this.saved?.id === id && this.saved.order === 'wait') this.saved.order = 'fail';
    if (this.isOpen) sfx.play('error');
    this.showOrders();
    this.orderTimer = window.setTimeout(() => { this.orderNote = ''; this.orderBad = false; this.showOrders(); }, ORDER_NOTE_MS);
  }

  /** Снимок: можно ли мне загружать (QUIZ_UPLOADERS, уровень) и слова сервера, если нельзя */
  private syncGate(me: QzMe | null): void {
    if (!me || (me.canUpload === this.canUpload && (me.uploadWhy ?? '') === this.uploadWhy)) return;
    this.canUpload = me.canUpload;
    this.uploadWhy = me.uploadWhy ?? '';
    if (this.isOpen && this.tab === 'upload') this.showUpload();
  }

  // ---------------------------------------------------------------- «Загрузить»: 1 откуда → 2 проверка → 3 сохранить

  private showUpload(): void {
    const gate = uploadGate({ canUpload: this.canUpload, uploadWhy: this.uploadWhy });
    if (!gate.open) {
      // сервер не пускает: вместо шагов — его слова и дорога к «Сыграть»
      this.body.innerHTML = lockHtml(gate.why, pic);
      this.setFoot('');
      return;
    }
    const head = (n: number, title: string): string => `<header class="qw-step-h"><span class="k-pill k-pill--solid qw-step-n">${n}</span><b class="k-row-title">${title}</b></header>`;
    this.body.innerHTML = '<div class="qw-up">'
      + `<section class="qw-step">${head(1, 'Откуда взять пак')}<div class="k-seg qw-ways">${UPLOAD_WAYS.map((w) => `<button type="button" data-w="way" data-way="${w.id}">${esc(w.label)}</button>`).join('')}</div><div class="qw-way" data-w-way></div></section>`
      + `<hr class="k-hr"><section class="qw-step">${head(2, 'Проверка')}<div data-w-sum></div></section>`
      + `<hr class="k-hr"><section class="qw-step">${head(3, 'Сохранить')}<div data-w-done></div></section></div>`;
    this.fillWay();
    this.fillSum();
    this.fillDone();
    this.upFoot();
  }

  /** Шаг 1: поле ссылки, зона для файла или текст — по выбранному способу */
  private fillWay(): void {
    const box = this.body.querySelector<HTMLElement>('[data-w-way]');
    if (!box) return;
    this.body.querySelectorAll<HTMLElement>('[data-w=way]').forEach((b) => b.classList.toggle('is-on', b.dataset.way === this.way));
    const wait = this.fetching ? ' disabled' : '';
    if (this.way === 'link') {
      box.innerHTML = '<p class="k-dim qw-lead">Открой пак в библиотеке SIGame, скопируй адрес страницы и вставь сюда</p>'
        + `<div class="qw-linkrow"><input class="k-input" type="text" inputmode="url" spellcheck="false" autocomplete="off" maxlength="600" placeholder="Ссылка на пак из библиотеки SIGame" aria-label="Ссылка на пак из библиотеки SIGame" value="${esc(this.link)}" data-w="link"${wait}><button type="button" class="k-btn k-btn--go" data-w="fetch"${wait}>Скачать</button></div>`
        + `<p class="k-bad qw-err-line" data-w-linkerr${this.linkErr ? '' : ' hidden'}>${esc(this.linkErr)}</p>`;
    } else if (this.way === 'file') {
      box.innerHTML = `<div class="qw-drop" data-w="drop">${pic('ticket', 'qw-drop-ic')}<div><b>Перетащи сюда файл пака</b><span class="k-faint">.siq из SIGame, .txt или .csv</span></div><button type="button" class="k-btn k-btn--ghost k-btn--sm" data-w="pick">Выбрать файл</button><input type="file" accept=".siq,.txt,.csv,text/plain,text/csv" hidden data-w="file"></div>`;
    } else {
      box.innerHTML = '<p class="k-dim qw-lead">Свой пак текстом: образец формата — в поле</p>'
        + '<textarea class="k-input qw-text" rows="7" spellcheck="false" placeholder="Пак: Набережная&#10;Раунд: Первый&#10;Тема: Рыбы&#10;100 Кому Дед Семён платит больше всех? = осётр / осетра&#10;Финал&#10;Тема: Маяк&#10;? Сколько метров каланча «Выше облаков»? = 185" data-w="text"></textarea>';
      const ta = box.querySelector<HTMLTextAreaElement>('textarea');
      if (ta) ta.value = this.text;
    }
  }

  private setLinkErr(text: string): void {
    this.linkErr = text;
    const e = this.body.querySelector<HTMLElement>('[data-w-linkerr]');
    if (!e) return;
    e.textContent = text;
    e.hidden = !text;
  }

  /** Новый пак из любого способа: старые строки и итог прошлого сохранения убираем */
  private resetNotes(): void {
    this.note = '';
    this.tone = '';
    this.saved = null;
    this.titleEdit = this.adultEdit = null;
  }

  /** Файл из зоны «Файл»: .siq разбираем в браузере (siq.ts), .txt и .csv идут в «Текстом» — там их видно и можно поправить */
  private async takeFile(f: File): Promise<void> {
    if (this.busy || this.fetching) return;
    this.resetNotes();
    const name = f.name.toLowerCase();
    if (/\.(txt|csv|tsv)$/.test(name)) {
      this.text = await f.text();
      this.way = 'text';
      this.fillWay();
      this.fromText(f.name);
      return;
    }
    if (!name.endsWith('.siq')) { this.fail('Нужен файл .siq, .txt или .csv'); return; }
    await this.takeSiq(f, { kind: 'file', name: f.name });
  }

  /** Разобрать .siq — свой файл или скачанный по ссылке: путь один */
  private async takeSiq(blob: Blob, from: PackSource): Promise<void> {
    this.busy = true;
    this.loaded = null;
    this.progress = null;
    this.fillSum('Разбираю пак…');
    this.upFoot();
    try {
      const r = await parseSiq(blob, { onProgress: (p) => { this.fillSum(`Разбираю пак: файл ${Math.min(p.done + 1, p.total)} из ${p.total}`); } });
      const parts = [packSummary(r.pack)];
      if (r.stats.images) parts.push(`картинок ${r.stats.images}`);
      if (r.stats.audio) parts.push(`звуков ${r.stats.audio}`);
      if (r.stats.bytes) parts.push(fmtSize(r.stats.bytes));
      this.loaded = { draft: { pack: r.pack, warnings: r.warnings, errors: [], problem: '' }, files: r.files, blobs: r.blobs, from, stats: parts.join(' · ') };
      this.note = '';
    } catch (e) {
      this.fail(e instanceof PackError ? e.message : from.kind === 'sigame' ? 'Не получилось открыть пак из библиотеки. Попробуй другой.' : 'Не получилось открыть файл. Попробуй другой.');
    } finally {
      this.busy = false;
    }
    this.fillSum();
    this.fillDone();
    this.upFoot();
  }

  /** «Скачать»: ссылка из библиотеки SIGame → билет → сервер скачивает .siq → те же байты разбираем, как перетащенный файл */
  private async fetchLink(): Promise<void> {
    if (this.busy || this.fetching) return;
    const g = sigameLink(this.link);
    if (!g.ok) { this.setLinkErr(g.why); return; }
    this.resetNotes();
    this.linkErr = '';
    this.loaded = null;
    this.fetching = { phase: 'ticket', got: 0, total: 0, wait: 0 };
    this.fillWay();
    this.fillSum(fetchText(this.fetching));
    this.fillDone();
    this.upFoot();
    let blob: Blob | null = null;
    try {
      blob = await fetchPack(g.url, {
        ticket: () => this.desk.ask(() => this.o.send({ t: 'qz', a: 'upTicket' })) as Promise<UploadTicket>,
        fetch: (url, init) => fetch(url, init),
        sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      }, (p) => { this.fetching = p; this.fillSum(fetchText(p)); });
    } catch (e) {
      this.linkErr = e instanceof UploadError ? e.message : 'Не получилось скачать пак. Попробуй ещё раз.';
    }
    this.fetching = null;
    this.fillWay();
    if (!blob) { this.fillSum(); this.upFoot(); return; }
    await this.takeSiq(blob, { kind: 'sigame', name: g.name });
  }

  /** Живой вид текста: после каждого нажатия, не чаще раза в 150 мс */
  private fromText(from = ''): void {
    const d = draftFromText(this.text);
    this.note = '';
    this.tone = '';
    this.saved = null;
    if (!d) { this.loaded = null; } else {
      // название и «18+», поправленные руками, не затираем разбором текста
      if (this.titleEdit !== null) d.pack.title = this.titleEdit;
      if (this.adultEdit !== null) d.pack.adult = this.adultEdit;
      this.loaded = { draft: checkDraft(d), files: [], blobs: new Map(), from: from ? { kind: 'file', name: from } : { kind: 'text', name: '' }, stats: packSummary(d.pack) };
    }
    this.fillSum();
    this.fillDone();
    this.upFoot();
  }

  private fail(text: string): void {
    this.note = text;
    this.tone = 'bad';
    this.loaded = null;
    this.fillSum();
    this.fillDone();
    this.upFoot();
  }

  /** Шаг 2: проверка — название, откуда, раунды и темы, сколько вопросов, ошибки и предупреждения; пока пусто — что тут будет */
  private fillSum(busyText = ''): void {
    const box = this.body.querySelector<HTMLElement>('[data-w-sum]');
    if (!box) return;
    if (busyText) { box.innerHTML = `<p class="k-dim qw-busy">${esc(busyText)}</p>`; return; }
    const l = this.loaded;
    if (!l) {
      box.innerHTML = this.note && this.tone === 'bad' ? `<p class="k-bad qw-err-line">${esc(this.note)}</p>`
        : '<div class="k-well"><span class="k-faint">Тут появится проверка: название, раунды и темы, сколько вопросов</span></div>';
      return;
    }
    const p = l.draft.pack;
    const sub = [KIND_NAME[p.kind] ?? '', sourceNote(l.from)].filter(Boolean).join(' · ');
    box.innerHTML = `<div class="k-cell qw-card"><div class="qw-card-head"><span class="qw-ic">${pic(kindIcon(p.kind))}</span>`
      + `<div class="qw-card-t"><input class="k-input qw-title" maxlength="${QZ_PACK.TITLE}" value="${esc(p.title)}" placeholder="Название пака" data-w="title" aria-label="Название пака"><span class="k-faint">${esc(sub)}</span></div></div>`
      + `<p class="qw-stats">${esc(l.stats)}</p>`
      + packOutlineHtml(p)
      + `<label class="k-switch"><input type="checkbox" data-w="adult"${p.adult ? ' checked' : ''}><span class="k-switch-track"></span><span>Для взрослых (18+)</span></label>`
      + (l.draft.errors.length || l.draft.problem ? `<ul class="qw-errs k-bad">${l.draft.errors.slice(0, 4).map((e) => `<li>${esc(e)}</li>`).join('')}${l.draft.errors.length > 4 ? `<li>…и ещё ${l.draft.errors.length - 4}</li>` : ''}${!l.draft.errors.length && l.draft.problem ? `<li>${esc(l.draft.problem)}</li>` : ''}</ul>` : '')
      + (l.draft.warnings.length ? `<ul class="qw-warns k-gold">${l.draft.warnings.slice(0, 5).map((e) => `<li>${esc(e)}</li>`).join('')}${l.draft.warnings.length > 5 ? `<li>…и ещё ${l.draft.warnings.length - 5}</li>` : ''}</ul>` : '')
      + '</div>';
  }

  /** Список ошибок под карточкой пака обновляем на месте (поле названия при этом не трогаем) */
  private fillProblems(): void {
    const l = this.loaded;
    const box = this.body.querySelector<HTMLElement>('.qw-card');
    if (!l || !box) return;
    box.querySelector('.qw-errs')?.remove();
    if (l.draft.errors.length || l.draft.problem) {
      const ul = el(`<ul class="qw-errs k-bad">${l.draft.errors.slice(0, 4).map((e) => `<li>${esc(e)}</li>`).join('')}${!l.draft.errors.length && l.draft.problem ? `<li>${esc(l.draft.problem)}</li>` : ''}</ul>`);
      const w = box.querySelector('.qw-warns');
      if (w) box.insertBefore(ul, w); else box.appendChild(ul);
    }
  }

  /** Что решают кнопки шага 3 сейчас: серые с причиной или нажимаются, подписи и подсказка */
  private gate(): SaveGate {
    return saveGate({ canUpload: this.canUpload, level: this.o.level?.() ?? null, draft: this.loaded?.draft ?? null, busy: this.busy ? (this.progress ? 'save' : 'parse') : '', fetching: !!this.fetching });
  }

  /** Шаг 3: что сделают кнопки внизу — или итог только что сохранённого пака и что с заказом */
  private fillDone(): void {
    const box = this.body.querySelector<HTMLElement>('[data-w-done]');
    if (box) box.innerHTML = this.saved ? savedHtml(this.saved, pic) : `<p class="k-dim qw-hint">${esc(this.gate().hint)}</p>`;
  }

  /** Подвал «Загрузить»: причина серых кнопок, полоска загрузки или итог; справа кнопки шага 3 */
  private upFoot(): void {
    const g = this.gate();
    const pr = this.progress;
    // только что сохранили — предлагаем следующий пак, а не причину серых кнопок
    let note = esc(this.note || (this.saved && !this.loaded ? 'Хочешь ещё пак — начни с шага 1' : g.why) || 'Готово к отправке');
    let bar = '';
    if (pr && this.busy) {
      const v = pr.total > 0 ? Math.min(1, pr.sent / pr.total) : pr.phase === 'files' ? 0 : 0.05;
      bar = `<span class="k-meter k-meter--thin qw-prog" style="--v:${Math.round(v * 1000) / 1000}"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i></span>`;
      note = pr.wait ? `Сервер просит подождать — ${pr.wait} с` : pr.phase === 'ticket' ? 'Прошу билет на загрузку…' : pr.phase === 'pack' ? 'Отправляю пак…' : `Отправляю файлы: ${pr.file} из ${pr.files}`;
    }
    const off = g.why ? ' disabled' : '';
    const title = esc(g.why);
    const only = g.play ? `<button type="button" class="k-btn k-btn--ghost" data-w="save" data-play="0"${off} title="${title}">${esc(g.only)}</button>` : '';
    this.setFoot(note, `${bar}${only}<button type="button" class="k-btn k-btn--go" data-w="save" data-play="${g.play ? 1 : 0}"${off} title="${title}">${esc(g.main)}</button>`, this.tone && !this.busy ? this.tone : '');
  }

  /** «Сохранить и сыграть» (play) — сохранить и сразу заказать; «Только сохранить» — просто положить в каталог */
  private async save(play: boolean): Promise<void> {
    const l = this.loaded;
    if (!l || this.busy || this.gate().why) return;
    this.note = '';
    this.tone = '';
    this.saved = null;
    let pack = l.draft.pack, files = l.files;
    try {
      const v = validatePack(pack, files);
      pack = v.pack;
      files = v.files;
    } catch (e) {
      this.note = e instanceof PackError ? e.message : 'Пак не прошёл проверку.';
      this.tone = 'bad';
      this.fillDone();
      this.upFoot();
      return;
    }
    this.busy = true;
    this.progress = { phase: 'ticket', sent: 0, total: files.reduce((n, f) => n + f.size, 0), wait: 0, file: 0, files: files.length };
    this.fillDone();
    this.upFoot();
    try {
      const info = await uploadPack({ pack, files, blobs: l.blobs }, {
        ticket: () => this.desk.ask(() => this.o.send({ t: 'qz', a: 'upTicket' })) as Promise<UploadTicket>,
        fetch: (url, init) => fetch(url, init),
        sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
        memo: this.upMemo,
      }, (p) => { this.progress = p; this.upFoot(); });
      this.saved = { id: info.id, title: info.title, kind: info.kind, order: play && canOrder(info.kind) ? 'wait' : 'no' };
      this.loaded = null;
      this.text = '';
      this.link = '';
      this.titleEdit = this.adultEdit = null;
      this.catalog = null;
      this.jpList = null;
      if (this.saved.order === 'wait') this.order(info.id);
    } catch (e) {
      this.note = e instanceof UploadError || e instanceof PackError ? e.message : 'Не получилось отправить пак. Попробуй ещё раз.';
      this.tone = 'bad';
    } finally {
      this.busy = false;
      this.progress = null;
    }
    if (this.tab === 'upload') { this.fillWay(); this.fillSum(); this.fillDone(); this.upFoot(); }
  }

  // ---------------------------------------------------------------- «Рекорды»

  private showRecs(): void {
    this.body.innerHTML = '<div class="qw-recs" data-w-list="recs"></div>';
    this.o.send({ t: 'qz', a: 'recs' });
    this.watch();
    this.fillRecs();
  }

  private fillRecs(): void {
    const box = this.body.querySelector<HTMLElement>('[data-w-list=recs]');
    if (!box) return;
    const r = this.recs;
    if (r) this.dayCoins = r.me.dayCoins;
    box.innerHTML = !r ? this.loading('цифры')
      : `<div><p class="k-eyebrow">Мои цифры</p><table class="k-table"><tbody>${myRecs(r.me).map((x) => `<tr><td>${esc(x.label)}</td><td class="k-r">${esc(x.value)}</td></tr>`).join('')}</tbody></table></div>`
      + `<div><p class="k-eyebrow">Лучшие на набережной</p><div class="qw-tops">${topLists(r.top).map((t) => `<div class="qw-top"><b>${esc(t.title)}</b>${t.rows.length ? t.rows.map((x, i) => `<div class="qw-top-row"><span>${i + 1}</span><span>${esc(x.nick)}</span><b>${x.pts}</b></div>`).join('') : '<span class="k-faint">пока никого</span>'}<span class="k-faint">${esc(t.unit)}</span></div>`).join('')}</div></div>`;
    this.setFoot(`${dayLine(this.dayCoins)} ${COIN_K} за викторины`);
  }

  // ---------------------------------------------------------------- клики и поля

  private click(t: HTMLElement): void {
    const d = t.dataset;
    switch (d.w) {
      case 'tab': this.go(d.tab as WinTab); break;
      case 'pack': {
        const id = d.id ?? '';
        this.sel = { pack: id, round: 0, themes: [], final: false };
        const o = this.outlines.get(id);
        if (o) this.sel = defaultSetup(o) ?? this.sel; else { this.o.send({ t: 'qz', a: 'packOutline', id }); this.watch(); }
        this.fillSetup();
        break;
      }
      case 'round': {
        const o = this.sel && this.outlines.get(this.sel.pack);
        if (this.sel && o) { this.sel.round = Number(d.i); this.sel.themes = o.rounds[this.sel.round].themes.slice(0, 6).map((_, i) => i); this.fillSetup(); }
        break;
      }
      case 'zat': this.o.send({ t: 'qz', a: 'jpZat' }); this.close(); break;
      case 'start': if (this.sel && !setupReason(this.sel)) { this.o.send(startMsg(this.sel)); this.close(); } break;
      case 'kind': this.kind = (d.k ?? '') as QzPackKind | ''; this.catalog = null; this.showPacks(); break;
      case 'del': {
        const id = d.id ?? '';
        if (this.armed !== id) {
          this.armed = id;
          clearTimeout(this.armTimer);
          this.armTimer = window.setTimeout(() => { this.armed = ''; this.fillPacks(); }, 3000);
        } else {
          clearTimeout(this.armTimer);
          this.armed = '';
          this.o.send({ t: 'qz', a: 'packDel', id });
        }
        this.fillPacks();
        break;
      }
      case 'retry': this.retry(); break;
      case 'play': this.order(d.id ?? ''); break;
      case 'way': this.way = (d.way ?? 'link') as UploadWay; this.fillWay(); break;
      case 'fetch': void this.fetchLink(); break;
      case 'pick': this.body.querySelector<HTMLInputElement>('input[type=file]')?.click(); break;
      case 'save': void this.save(d.play === '1'); break;
      default: break;
    }
  }

  private input(t: HTMLElement): void {
    const w = (t as HTMLElement).dataset.w;
    if (w === 'q') {
      this.packQ = (t as HTMLInputElement).value.trim();
      clearTimeout(this.searchTimer);
      this.searchTimer = window.setTimeout(() => { this.catalog = null; this.fillPacks(); this.askPacks(); }, SEARCH_MS);
    } else if (w === 'link') {
      this.link = (t as HTMLInputElement).value;
      if (this.linkErr) this.setLinkErr('');
    } else if (w === 'text') {
      this.text = (t as HTMLTextAreaElement).value;
      clearTimeout(this.searchTimer);
      this.searchTimer = window.setTimeout(() => this.fromText(), 150);
    } else if (w === 'title' && this.loaded) {
      this.titleEdit = (t as HTMLInputElement).value;
      this.loaded.draft.pack.title = this.titleEdit;
      checkDraft(this.loaded.draft, this.loaded.files);
      this.upFoot();
      this.fillProblems();
    }
  }

  private change(t: HTMLInputElement): void {
    const w = t.dataset.w;
    if (w === 'theme' && this.sel) {
      if (!toggleTheme(this.sel, Number(t.dataset.i))) t.checked = false;
      this.setupFoot();
    } else if (w === 'final' && this.sel) this.sel.final = t.checked;
    else if (w === 'adult' && this.loaded) { this.adultEdit = t.checked; this.loaded.draft.pack.adult = t.checked; }
    else if (w === 'file' && t.files?.[0]) { void this.takeFile(t.files[0]); t.value = ''; }
  }
}


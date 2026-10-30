// «Ракушка»: окно у трибуны (docs/quiz/tech.md §21) — вкладки «Играть» (или «Пак и темы» у ведущего «Своей игры» в шаге
// setup), «Паки», «Загрузить», «Рекорды». Нативный <dialog class="k-scrim"> > section.k-window (820), ✕, Esc и клик мимо
// закрывают (QDialog из hud-windows.ts). Игру отсюда не запускают. Сеть — через send; письма сервера (qzPacks, qzPackOutline,
// qzTicket, qzRecs, qzErr) приходят в onMsg. Загрузка: siq.ts разбирает файл, upload.ts отправляет. Образец вида — lab/quiz/v2.
import type { QuizClientMsg } from '../../../../shared/quiz/net.ts';
import { PackError, validatePack } from '../../../../shared/quiz/pack.ts';
import { QZ_PACK, type QzMe, type QzMyRecs, type QzPackInfo, type QzPackKind, type QzPackOutline, type QzTopRecs, type QzUpFile, type QzView } from '../../../../shared/quiz/types.ts';
import { COIN_K, esc, pic } from './hud-model.ts';
import { QDialog } from './hud-windows.ts';
import { parseSiq, fmtSize } from './siq.ts';
import { TicketDesk, UploadError, uploadPack, type UploadMemo, type UploadProgress, type UploadTicket } from './upload.ts';
import {
  KIND_NAME, checkDraft, defaultSetup, dayLine, draftFromText, hasFinal, kindIcon, modeCards, myRecs, packRow, packSummary, pickTab, playableRounds, saveReason,
  setupReason, startMsg, tabsFor, toggleTheme, topLists, type Draft, type SetupSel, type WinTab,
} from './win-model.ts';

const SEARCH_MS = 300;
/** сервер молчит на запрос списка дольше — пишем «Не получилось загрузить» и даём «Ещё раз» */
const LAG_MS = 6000;
const NOTE_PLAY = 'Как начать: садись на стул — все, кто сидит, голосуют, во что играть';

interface Mine {
  me: QzMyRecs;
  top: QzTopRecs;
}

/** Пак, собранный в окне «Загрузить»: из .siq (есть файлы) или из текста / CSV */
interface Loaded {
  draft: Draft;
  files: QzUpFile[];
  blobs: Map<string, Blob>;
  /** что за файл — подпись «из файла …» */
  from: string;
  stats: string;
}

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
    this.body.innerHTML = `<div class="qw-bar"><input class="k-input" type="search" placeholder="Найти по названию или автору" maxlength="60" value="${esc(this.packQ)}" data-w="q" autocomplete="off"><div class="k-seg">${kinds.map(([k, n]) => `<button type="button" class="${this.kind === k ? 'is-on' : ''}" data-w="kind" data-k="${k}">${n}</button>`).join('')}</div></div><div class="qw-list" data-w-list="packs"></div>`;
    this.fillPacks();
    if (!this.catalog) this.askPacks();
  }

  private askPacks(): void {
    this.watch();
    this.o.send({ t: 'qz', a: 'packs', ...(this.packQ ? { q: this.packQ } : {}), ...(this.kind ? { kind: this.kind } : {}) });
  }

  private fillPacks(): void {
    const list = this.body.querySelector<HTMLElement>('[data-w-list=packs]');
    if (!list) return;
    const c = this.catalog;
    list.innerHTML = !c ? this.loading('паки') : !c.list.length ? '<p class="k-faint">Ничего не нашлось</p>' : c.list.map((p) => packRow(p, this.armed === p.id, pic)).join('');
    this.setFoot(c ? `Показано ${c.list.length} из ${c.total}` : '');
  }

  // ---------------------------------------------------------------- «Загрузить»

  private showUpload(): void {
    this.body.innerHTML = `<div class="qw-up"><div class="qw-drop" data-w="drop">${pic('ticket', 'qw-drop-ic')}<div><b>Перетащи сюда файл пака</b><span class="k-faint">.siq из SIGame, .txt или .csv</span></div><button type="button" class="k-btn k-btn--ghost k-btn--sm" data-w="pick">Выбрать файл</button><input type="file" accept=".siq,.txt,.csv,text/plain,text/csv" hidden data-w="file"></div>`
      + `<div class="qw-new"><p class="k-eyebrow">Или новый пак</p><textarea class="k-input qw-text" rows="7" spellcheck="false" placeholder="Пак: Набережная&#10;Раунд: Первый&#10;Тема: Рыбы&#10;100 Кому Дед Семён платит больше всех? = осётр / осетра&#10;Финал&#10;Тема: Маяк&#10;? Сколько метров каланча «Выше облаков»? = 185" data-w="text"></textarea></div>`
      + '<div data-w-sum></div></div>';
    const ta = this.body.querySelector<HTMLTextAreaElement>('textarea');
    if (ta) ta.value = this.text;
    this.fillSum();
    this.upFoot();
  }

  /** Разобрать файл: .siq — в браузере (siq.ts), .txt и .csv — в поле текста */
  private async takeFile(f: File): Promise<void> {
    if (this.busy) return;
    this.note = '';
    this.tone = '';
    const name = f.name.toLowerCase();
    this.titleEdit = this.adultEdit = null;
    if (/\.(txt|csv|tsv)$/.test(name)) {
      this.text = await f.text();
      const ta = this.body.querySelector<HTMLTextAreaElement>('textarea');
      if (ta) ta.value = this.text;
      this.fromText(f.name);
      return;
    }
    if (!name.endsWith('.siq')) { this.fail('Нужен файл .siq, .txt или .csv'); return; }
    this.busy = true;
    this.loaded = null;
    this.progress = null;
    this.fillSum('Разбираю пак…');
    this.upFoot();
    try {
      const r = await parseSiq(f, { onProgress: (p) => { this.fillSum(`Разбираю пак: файл ${Math.min(p.done + 1, p.total)} из ${p.total}`); } });
      const parts = [packSummary(r.pack)];
      if (r.stats.images) parts.push(`картинок ${r.stats.images}`);
      if (r.stats.audio) parts.push(`звуков ${r.stats.audio}`);
      if (r.stats.bytes) parts.push(fmtSize(r.stats.bytes));
      this.loaded = { draft: { pack: r.pack, warnings: r.warnings, errors: [], problem: '' }, files: r.files, blobs: r.blobs, from: f.name, stats: parts.join(' · ') };
      this.note = '';
    } catch (e) {
      this.fail(e instanceof PackError ? e.message : 'Не получилось открыть файл. Попробуй другой.');
    } finally {
      this.busy = false;
    }
    this.fillSum();
    this.upFoot();
  }

  /** Живой вид текста: после каждого нажатия, не чаще раза в 150 мс */
  private fromText(from = ''): void {
    const d = draftFromText(this.text);
    this.note = '';
    this.tone = '';
    if (!d) { this.loaded = null; } else {
      // название и «18+», поправленные руками, не затираем разбором текста
      if (this.titleEdit !== null) d.pack.title = this.titleEdit;
      if (this.adultEdit !== null) d.pack.adult = this.adultEdit;
      this.loaded = { draft: checkDraft(d), files: [], blobs: new Map(), from: from || 'text', stats: packSummary(d.pack) };
    }
    this.fillSum();
    this.upFoot();
  }

  private fail(text: string): void {
    this.note = text;
    this.tone = 'bad';
    this.loaded = null;
    this.fillSum();
    this.upFoot();
  }

  private fillSum(busyText = ''): void {
    const box = this.body.querySelector<HTMLElement>('[data-w-sum]');
    if (!box) return;
    if (busyText) { box.innerHTML = `<p class="qw-busy">${esc(busyText)}</p>`; return; }
    const l = this.loaded;
    if (!l) { box.innerHTML = this.note && this.tone === 'bad' ? `<p class="qw-err-line">${esc(this.note)}</p>` : ''; return; }
    const p = l.draft.pack;
    const kind = KIND_NAME[p.kind] ?? '';
    box.innerHTML = `<div class="qw-card"><div class="qw-card-head"><span class="qw-ic">${pic(kindIcon(p.kind))}</span>`
      + `<div class="qw-card-t"><input class="k-input qw-title" maxlength="${QZ_PACK.TITLE}" value="${esc(p.title)}" placeholder="Название пака" data-w="title" aria-label="Название пака"><span class="k-faint">${esc(kind)}${l.from && l.from !== 'text' ? ` · из файла ${esc(l.from)}` : ''}</span></div></div>`
      + `<p class="qw-stats">${esc(l.stats)}</p>`
      + `<label class="k-switch"><input type="checkbox" data-w="adult"${p.adult ? ' checked' : ''}><span class="k-switch-track"></span><span>Для взрослых (18+)</span></label>`
      + (l.draft.errors.length || l.draft.problem ? `<ul class="qw-errs">${l.draft.errors.slice(0, 4).map((e) => `<li>${esc(e)}</li>`).join('')}${l.draft.errors.length > 4 ? `<li>…и ещё ${l.draft.errors.length - 4}</li>` : ''}${!l.draft.errors.length && l.draft.problem ? `<li>${esc(l.draft.problem)}</li>` : ''}</ul>` : '')
      + (l.draft.warnings.length ? `<ul class="qw-warns">${l.draft.warnings.slice(0, 5).map((e) => `<li>${esc(e)}</li>`).join('')}${l.draft.warnings.length > 5 ? `<li>…и ещё ${l.draft.warnings.length - 5}</li>` : ''}</ul>` : '')
      + '</div>';
  }

  /** Список ошибок под карточкой пака обновляем на месте (поле названия при этом не трогаем) */
  private fillProblems(): void {
    const l = this.loaded;
    const box = this.body.querySelector<HTMLElement>('.qw-card');
    if (!l || !box) return;
    box.querySelector('.qw-errs')?.remove();
    if (l.draft.errors.length || l.draft.problem) {
      const ul = el(`<ul class="qw-errs">${l.draft.errors.slice(0, 4).map((e) => `<li>${esc(e)}</li>`).join('')}${!l.draft.errors.length && l.draft.problem ? `<li>${esc(l.draft.problem)}</li>` : ''}</ul>`);
      const w = box.querySelector('.qw-warns');
      if (w) box.insertBefore(ul, w); else box.appendChild(ul);
    }
  }

  /** Подвал «Загрузить»: причина серой кнопки, полоска загрузки или итог */
  private upFoot(): void {
    const level = this.o.level?.() ?? null;
    const why = saveReason(level, this.loaded?.draft ?? null, this.busy);
    const pr = this.progress;
    let note = esc(this.note || why || 'Готово к отправке');
    let bar = '';
    if (pr && this.busy) {
      const v = pr.total > 0 ? Math.min(1, pr.sent / pr.total) : pr.phase === 'files' ? 0 : 0.05;
      bar = `<span class="k-meter k-meter--thin qw-prog" style="--v:${Math.round(v * 1000) / 1000}"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i></span>`;
      note = pr.wait ? `Сервер просит подождать — ${pr.wait} с` : pr.phase === 'ticket' ? 'Прошу билет на загрузку…' : pr.phase === 'pack' ? 'Отправляю пак…' : `Отправляю файлы: ${pr.file} из ${pr.files}`;
    }
    this.setFoot(note, `${bar}<button type="button" class="k-btn k-btn--go" data-w="save"${why ? ' disabled' : ''} title="${esc(why)}">Сохранить на набережную</button>`, this.tone && !this.busy ? this.tone : '');
  }

  private async save(): Promise<void> {
    const l = this.loaded;
    const level = this.o.level?.() ?? null;
    if (!l || this.busy || saveReason(level, l.draft, false)) return;
    this.note = '';
    this.tone = '';
    let pack = l.draft.pack, files = l.files;
    try {
      const v = validatePack(pack, files);
      pack = v.pack;
      files = v.files;
    } catch (e) {
      this.note = e instanceof PackError ? e.message : 'Пак не прошёл проверку.';
      this.tone = 'bad';
      this.upFoot();
      return;
    }
    this.busy = true;
    this.progress = { phase: 'ticket', sent: 0, total: files.reduce((n, f) => n + f.size, 0), wait: 0, file: 0, files: files.length };
    this.upFoot();
    try {
      const info = await uploadPack({ pack, files, blobs: l.blobs }, {
        ticket: () => this.desk.ask(() => this.o.send({ t: 'qz', a: 'upTicket' })) as Promise<UploadTicket>,
        fetch: (url, init) => fetch(url, init),
        sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
        memo: this.upMemo,
      }, (p) => { this.progress = p; this.upFoot(); });
      this.note = `Готово: «${info.title}» теперь на набережной`;
      this.tone = 'good';
      this.loaded = null;
      this.text = '';
      this.titleEdit = this.adultEdit = null;
      this.catalog = null;
      this.jpList = null;
      const ta = this.body.querySelector<HTMLTextAreaElement>('textarea');
      if (ta) ta.value = '';
    } catch (e) {
      this.note = e instanceof UploadError || e instanceof PackError ? e.message : 'Не получилось отправить пак. Попробуй ещё раз.';
      this.tone = 'bad';
    } finally {
      this.busy = false;
      this.progress = null;
    }
    if (this.tab === 'upload') { this.fillSum(); this.upFoot(); }
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
      case 'pick': this.body.querySelector<HTMLInputElement>('input[type=file]')?.click(); break;
      case 'save': void this.save(); break;
      default: break;
    }
  }

  private input(t: HTMLElement): void {
    const w = (t as HTMLElement).dataset.w;
    if (w === 'q') {
      this.packQ = (t as HTMLInputElement).value.trim();
      clearTimeout(this.searchTimer);
      this.searchTimer = window.setTimeout(() => { this.catalog = null; this.fillPacks(); this.askPacks(); }, SEARCH_MS);
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


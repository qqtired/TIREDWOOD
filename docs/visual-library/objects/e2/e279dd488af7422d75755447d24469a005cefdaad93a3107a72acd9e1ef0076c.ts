// Страница лаборатории: шапка со счётчиками, фильтры, сетка карточек, сводка «Что берём», подвал.
// Карточки строятся один раз; решения и фильтры только переключают их части, чтобы не трогать живые превью.
import { LAB_NOTE_MAX, LAB_STATUSES, LAB_STATUS_LABEL, type LabDecision, type LabStatus } from '../../shared/lab.ts';
import { clearDecision, explain, forgetKey, getKey, loadState, saveDecision, takeKeyFromUrl } from './api.ts';
import { h } from './dom.ts';
import { CATALOG } from './experiments.ts';
import { stage, type LiveHost } from './stage.ts';
import { CATEGORIES, CATEGORY_LABEL, SIZE_HINT, type Category, type Experiment, type Idea } from './types.ts';

type CatFilter = 'all' | 'proto' | 'new' | 'island' | Category;

interface CardView {
  entry: Idea;
  el: HTMLElement;
  chipLabel: HTMLElement;
  noteView: HTMLElement;
  owner: HTMLElement;
  statusBtns: Map<LabStatus, HTMLButtonElement>;
  noteBox: HTMLDetailsElement;
  noteInput: HTMLTextAreaElement;
  noteCount: HTMLElement;
  resetBtn: HTMLButtonElement;
}

const POLL_MS = 20_000;
const SUMMARY_ORDER: LabStatus[] = ['take', 'rework', 'testing', 'skip'];

const defaultStatus = (e: Idea): LabStatus => (e.live ? 'prototype' : 'idea');

export class LabPage {
  private readonly root: HTMLElement;
  private decisions: Record<string, LabDecision> = {};
  private owner = false;
  private offline = false;
  private readonly cards = new Map<string, CardView>();
  private cat: CatFilter = 'all';
  private status: LabStatus | 'all' = 'all';
  private query = '';
  private readonly statChips = new Map<LabStatus | 'all', HTMLButtonElement>();
  private readonly catChips = new Map<CatFilter, HTMLButtonElement>();
  private ownerBar!: HTMLElement;
  private banner!: HTMLElement;
  private grid!: HTMLElement;
  private empty!: HTMLElement;
  private summaryBody!: HTMLElement;
  private toastEl!: HTMLElement;
  private toastTimer = 0;
  private flashTimer = 0;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  start(): void {
    takeKeyFromUrl();
    this.build();
    window.addEventListener('hashchange', () => this.openFromHash());
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) void this.refresh();
    });
    window.setInterval(() => {
      if (!document.hidden) void this.refresh();
    }, POLL_MS);
    this.paint();
    void this.refresh().then(() => this.openFromHash());
  }

  // ---------------------------------------------------------------- данные

  private statusOf(e: Idea): LabStatus {
    return this.decisions[e.id]?.status ?? defaultStatus(e);
  }

  private async refresh(): Promise<void> {
    try {
      const s = await loadState();
      this.decisions = s.decisions;
      this.owner = s.owner;
      this.offline = false;
      // ключ не подошёл (сменили или удалили файл на сервере) — забываем его, пусть откроют новую ссылку
      if (!s.owner && getKey()) {
        forgetKey();
        this.toast('Ключ владельца больше не действует. Открой свежую ссылку.', 'bad');
      }
    } catch {
      if (!Object.keys(this.decisions).length) this.offline = true;
    }
    this.paint();
  }

  private async setStatus(e: Idea, status: LabStatus): Promise<void> {
    const prev = this.decisions[e.id];
    if (this.statusOf(e) === status && prev) return;
    this.decisions = { ...this.decisions, [e.id]: { title: e.title, status, note: prev?.note ?? '', at: new Date().toISOString() } };
    this.paint();
    try {
      const saved = await saveDecision(e.id, { status, title: e.title });
      this.decisions = { ...this.decisions, [e.id]: saved };
      this.toast(`${e.title}: ${LAB_STATUS_LABEL[status]}`, 'ok');
    } catch (err) {
      const back = { ...this.decisions };
      if (prev) back[e.id] = prev;
      else delete back[e.id];
      this.decisions = back;
      this.toast(`Не сохранилось. ${explain(err)}`, 'bad');
    }
    this.paint();
  }

  private async saveNote(e: Idea, note: string): Promise<void> {
    const status = this.statusOf(e);
    try {
      const saved = await saveDecision(e.id, { status, note, title: e.title });
      this.decisions = { ...this.decisions, [e.id]: saved };
      this.toast('Заметка сохранена', 'ok');
    } catch (err) {
      this.toast(`Не сохранилось. ${explain(err)}`, 'bad');
    }
    this.paint();
  }

  private async reset(e: Idea): Promise<void> {
    try {
      await clearDecision(e.id);
      const next = { ...this.decisions };
      delete next[e.id];
      this.decisions = next;
      this.toast(`${e.title}: решение сброшено`, 'ok');
    } catch (err) {
      this.toast(`Не сбросилось. ${explain(err)}`, 'bad');
    }
    this.paint();
  }

  // ---------------------------------------------------------------- построение

  private build(): void {
    const root = this.root;
    root.replaceChildren();

    this.ownerBar = h('div', { class: 'lab-owner', hidden: true });
    this.banner = h('p', { class: 'lab-banner', hidden: true, role: 'status' });
    const head = h(
      'header',
      { class: 'lab-head' },
      h(
        'div',
        { class: 'lab-brand' },
        h('span', { class: 'lab-mark', 'aria-hidden': 'true' }),
        h('div', {}, h('p', { class: 'lab-eyebrow' }, 'TIREDWOOD'), h('h1', {}, 'Лаборатория')),
      ),
      h('p', { class: 'lab-lead' }, 'Новые идеи для игры и живые прототипы. Смотри, крути, пробуй. Что из этого возьмём в игру, решает владелец.'),
      h('a', { href: './fitting-room/', class: 'lab-btn' }, 'Примерочная: референсы, вещи и сеты'),
      this.ownerBar,
      this.banner,
    );
    const fresh = CATALOG.filter((e) => e.research);
    if (fresh.length) {
      head.append(h('p', { class: 'lab-research-intro' },
        h('span', { class: 'lab-new' }, 'New'),
        ` ${fresh.length} примеров из продуктового ревью: ${fresh.filter((e) => e.live).length} с живым превью. `,
        'Открой новинки, попробуй выбор и посмотри, что проверять с друзьями.',
      ));
    }

    const stats = h('nav', { class: 'lab-stats', 'aria-label': 'Статусы' });
    const all = h('button', { class: 'lab-chip', type: 'button', onclick: () => this.setStatusFilter('all') }, 'Все ', h('b', {}, '0'));
    this.statChips.set('all', all);
    stats.append(all);
    for (const s of LAB_STATUSES) {
      const b = h('button', { class: 'lab-chip', type: 'button', 'data-status': s, onclick: () => this.setStatusFilter(s) }, `${LAB_STATUS_LABEL[s]} `, h('b', {}, '0'));
      this.statChips.set(s, b);
      stats.append(b);
    }

    const filters = h('div', { class: 'lab-filters' });
    const cats = h('div', { class: 'lab-cats', role: 'group', 'aria-label': 'Категории' });
    const catList: Array<[CatFilter, string]> = [
      ['all', 'Всё'],
      ['new', `New · ${fresh.length}`],
      ['proto', 'С живым превью'],
      ...CATEGORIES.map((c): [CatFilter, string] => [c, CATEGORY_LABEL[c]]),
      ['island', 'Остров и паром'],
    ];
    for (const [id, label] of catList) {
      const b = h('button', { class: 'lab-chip lab-chip-cat', type: 'button', onclick: () => this.setCategory(id) }, label);
      this.catChips.set(id, b);
      cats.append(b);
    }
    const search = h('input', { class: 'lab-search', type: 'search', placeholder: 'Найти идею', 'aria-label': 'Поиск по идеям', autocomplete: 'off', maxlength: 60 });
    search.addEventListener('input', () => {
      this.query = search.value.trim().toLowerCase();
      this.applyFilters();
    });
    filters.append(cats, search);

    this.grid = h('main', { class: 'lab-grid' });
    for (const e of CATALOG) {
      const v = this.buildCard(e);
      this.cards.set(e.id, v);
      this.grid.append(v.el);
    }
    this.empty = h(
      'p',
      { class: 'lab-empty', hidden: true },
      'Ничего не нашлось. ',
      h('button', { class: 'lab-link', type: 'button', onclick: () => this.clearFilters() }, 'Показать всё'),
    );

    this.summaryBody = h('div', { class: 'lab-summary-body' });
    const summary = h(
      'details',
      { class: 'lab-summary' },
      h('summary', {}, 'Что берём'),
      this.summaryBody,
    );

    const how = h(
      'details',
      { class: 'lab-how' },
      h('summary', {}, 'Как добавить своё'),
      h(
        'ol',
        {},
        h('li', {}, 'Идея без живой сцены: запись в client/lab/ideas/<категория>.ts, больше ничего.'),
        h('li', {}, 'Прототип: файл client/lab/proto/<id>.ts (описание, иллюстрация, функция create) и одна строка в client/lab/experiments.ts.'),
        h('li', {}, 'Для сцены берутся желейка, небо и море из кода игры (ctx.kit), три.js приходит через ctx.THREE.'),
        h('li', {}, 'npm test проверит реестр: уникальные id, поля, безопасный SVG.'),
      ),
    );
    const foot = h(
      'footer',
      { class: 'lab-foot' },
      how,
      h(
        'p',
        { class: 'lab-links' },
        h('a', { href: '/ideas/' }, 'Доска идей игроков'),
        h('a', { href: '/lab/api/state', rel: 'nofollow' }, 'Решения (JSON)'),
        h('a', { href: '/' }, 'В игру'),
      ),
    );

    this.toastEl = h('div', { class: 'lab-toast', role: 'status', 'aria-live': 'polite', hidden: true });
    root.append(head, stats, filters, this.grid, this.empty, summary, foot, this.toastEl);
  }

  private buildCard(e: Idea): CardView {
    const art = h('div', { class: 'lab-art' });
    art.innerHTML = e.art();
    const media = h('div', { class: 'lab-media' }, art);
    const panel = h('div', { class: 'lab-live-panel', hidden: true });
    if (e.live) {
      const exp = e as Experiment;
      let host: LiveHost | null = null;
      const liveBtn = h('button', { class: 'lab-live-btn', type: 'button', onclick: () => host && stage.toggle(host) }, h('span', { class: 'lab-play', 'aria-hidden': 'true' }), exp.live.cta ?? 'Живое превью');
      host = { entry: exp, media, art, btn: liveBtn, panel };
      media.append(liveBtn, h('span', { class: 'lab-badge-3d' }, '3D'));
    }
    if (e.priority) media.append(h('span', { class: 'lab-badge-prio' }, 'Очень полезно'));

    const chipLabel = h('span', {});
    const chip = h('span', { class: 'lab-status' }, h('span', { class: 'lab-status-dot', 'aria-hidden': 'true' }), chipLabel);
    const meta = h(
      'div',
      { class: 'lab-meta' },
      h('span', { class: 'lab-num' }, `№${e.n}`),
      e.research ? h('span', { class: 'lab-new' }, 'New') : null,
      h('span', { class: 'lab-cat' }, CATEGORY_LABEL[e.category]),
      h('span', { class: 'lab-size', title: SIZE_HINT[e.size] }, e.size),
      e.island ? h('span', { class: 'lab-tag' }, 'остров и паром') : null,
      chip,
    );

    const noteView = h('blockquote', { class: 'lab-note', hidden: true });
    const statusBtns = new Map<LabStatus, HTMLButtonElement>();
    const statusRow = h('div', { class: 'lab-statuses', role: 'group', 'aria-label': `Статус: ${e.title}` });
    for (const s of LAB_STATUSES) {
      const b = h('button', { class: 'lab-st', type: 'button', 'data-status': s, onclick: () => void this.setStatus(e, s) }, LAB_STATUS_LABEL[s]);
      statusBtns.set(s, b);
      statusRow.append(b);
    }
    const noteInput = h('textarea', { class: 'lab-note-input', rows: 3, maxlength: LAB_NOTE_MAX, placeholder: 'Заметка видна всем, у кого есть ссылка', 'aria-label': `Заметка: ${e.title}` });
    const noteCount = h('span', { class: 'lab-count' }, `0/${LAB_NOTE_MAX}`);
    noteInput.addEventListener('input', () => {
      noteCount.textContent = `${Array.from(noteInput.value).length}/${LAB_NOTE_MAX}`;
    });
    const resetBtn = h('button', { class: 'lab-link', type: 'button', onclick: () => void this.reset(e) }, 'Сбросить решение');
    const noteBox = h(
      'details',
      { class: 'lab-note-edit' },
      h('summary', {}, 'Заметка'),
      noteInput,
      h(
        'div',
        { class: 'lab-note-row' },
        noteCount,
        h('button', { class: 'lab-save', type: 'button', onclick: () => void this.saveNote(e, noteInput.value) }, 'Сохранить'),
        resetBtn,
      ),
    );
    const owner = h('div', { class: 'lab-owner-tools', hidden: true }, statusRow, noteBox);

    const el = h(
      'article',
      { class: 'lab-card', id: `idea-${e.id}`, 'data-id': e.id },
      media,
      panel,
      h(
        'div',
        { class: 'lab-card-body' },
        meta,
        h('h2', { class: 'lab-title' }, e.title),
        e.research ? h('p', { class: 'lab-research-facts' }, `${e.research.focus} · ${e.research.players} · ${e.research.round}`) : null,
        h('p', { class: 'lab-pitch' }, e.pitch),
        h('p', { class: 'lab-fun' }, h('b', {}, 'Почему весело. '), e.fun),
        e.research ? h('details', { class: 'lab-research' },
          h('summary', {}, 'Что пробуем и как выбирать'),
          h('p', {}, h('b', {}, 'Выбор игрока. '), e.research.decision),
          h('p', {}, h('b', {}, e.live ? 'Границы превью. ' : 'Первый шаг. '), e.research.scope),
          h('p', {}, h('b', {}, 'Проверка с друзьями. '), e.research.test),
          h('p', { class: 'lab-research-refs' }, h('b', {}, 'Референсы. '),
            ...e.research.references.map((r) => h('a', { href: r.url, target: '_blank', rel: 'noopener noreferrer' }, r.title)),
          ),
        ) : null,
        e.touches ? h('p', { class: 'lab-touch' }, h('b', {}, 'Стыки. '), e.touches) : null,
        e.net ? h('p', { class: 'lab-net' }, 'Видно другим игрокам: понадобится новый протокол.') : null,
        noteView,
        owner,
      ),
    );
    return { entry: e, el, chipLabel, noteView, owner, statusBtns, noteBox, noteInput, noteCount, resetBtn };
  }

  // ---------------------------------------------------------------- отрисовка состояния

  private paint(): void {
    const counts = new Map<LabStatus, number>();
    for (const e of CATALOG) counts.set(this.statusOf(e), (counts.get(this.statusOf(e)) ?? 0) + 1);
    this.statChips.get('all')!.querySelector('b')!.textContent = String(CATALOG.length);
    for (const s of LAB_STATUSES) this.statChips.get(s)!.querySelector('b')!.textContent = String(counts.get(s) ?? 0);

    for (const v of this.cards.values()) {
      const e = v.entry;
      const d = this.decisions[e.id];
      const st = this.statusOf(e);
      v.el.dataset.status = st;
      v.chipLabel.textContent = LAB_STATUS_LABEL[st];
      v.noteView.hidden = !d?.note;
      v.noteView.replaceChildren(h('b', {}, 'Заметка владельца. '), d?.note ?? '');
      v.owner.hidden = !this.owner;
      for (const [s, b] of v.statusBtns) b.setAttribute('aria-pressed', String(s === st));
      v.resetBtn.hidden = !d;
      // поле заметки не трогаем, пока в нём пишут
      if (document.activeElement !== v.noteInput) {
        v.noteInput.value = d?.note ?? '';
        v.noteCount.textContent = `${Array.from(v.noteInput.value).length}/${LAB_NOTE_MAX}`;
      }
    }

    this.ownerBar.hidden = !this.owner;
    if (this.owner && !this.ownerBar.firstChild) {
      this.ownerBar.append(
        h('span', { class: 'lab-owner-badge' }, 'Режим владельца'),
        h('span', { class: 'lab-owner-hint' }, 'Нажми на статус под карточкой: решение сохранится сразу.'),
        h('button', { class: 'lab-link', type: 'button', onclick: () => this.leave() }, 'Выйти'),
      );
    } else if (!this.owner) {
      this.ownerBar.replaceChildren();
    }
    this.banner.hidden = !this.offline;
    this.banner.textContent = this.offline ? 'Решения владельца сейчас недоступны: показан каталог со статусами по умолчанию.' : '';

    this.applyFilters();
    this.paintSummary();
  }

  private matches(e: Idea): boolean {
    if (this.cat === 'proto' && !e.live) return false;
    if (this.cat === 'new' && !e.research) return false;
    if (this.cat === 'island' && !e.island) return false;
    if (this.cat !== 'all' && this.cat !== 'proto' && this.cat !== 'new' && this.cat !== 'island' && e.category !== this.cat) return false;
    if (this.status !== 'all' && this.statusOf(e) !== this.status) return false;
    if (this.query && !`${e.title} ${e.pitch} ${e.fun} ${e.research ? `${e.research.focus} ${e.research.decision} ${e.research.references.map((r) => r.title).join(' ')}` : ''}`.toLowerCase().includes(this.query)) return false;
    return true;
  }

  private applyFilters(): void {
    let shown = 0;
    for (const v of this.cards.values()) {
      const ok = this.matches(v.entry);
      v.el.hidden = !ok;
      if (ok) shown++;
    }
    this.empty.hidden = shown > 0;
    for (const [s, b] of this.statChips) b.setAttribute('aria-pressed', String(this.status === s));
    for (const [c, b] of this.catChips) b.setAttribute('aria-pressed', String(this.cat === c));
  }

  private setCategory(c: CatFilter): void {
    this.cat = c;
    this.applyFilters();
  }

  private setStatusFilter(s: LabStatus | 'all'): void {
    this.status = this.status === s ? 'all' : s;
    this.applyFilters();
  }

  private clearFilters(): void {
    this.cat = 'all';
    this.status = 'all';
    this.query = '';
    const input = this.root.querySelector<HTMLInputElement>('.lab-search');
    if (input) input.value = '';
    this.applyFilters();
  }

  private paintSummary(): void {
    const lines: Node[] = [];
    let total = 0;
    for (const s of SUMMARY_ORDER) {
      const list = CATALOG.filter((e) => this.statusOf(e) === s && (s !== 'testing' || this.decisions[e.id]));
      if (!list.length) continue;
      total += list.length;
      lines.push(
        h(
          'section',
          { class: 'lab-sum-group', 'data-status': s },
          h('h3', {}, `${LAB_STATUS_LABEL[s]} (${list.length})`),
          h(
            'ul',
            {},
            ...list.map((e) => {
              const note = this.decisions[e.id]?.note;
              return h('li', {}, h('a', { href: `#${e.id}` }, e.title), note ? ` — ${note.replace(/\s+/g, ' ')}` : '');
            }),
          ),
        ),
      );
    }
    if (!total) {
      this.summaryBody.replaceChildren(h('p', { class: 'lab-muted' }, 'Решений пока нет. Когда владелец что-то выберет, здесь соберётся список.'));
      return;
    }
    this.summaryBody.replaceChildren(
      ...lines,
      h('button', { class: 'lab-save', type: 'button', onclick: () => void this.copySummary() }, 'Скопировать текстом'),
    );
  }

  private summaryText(): string {
    const out = ['Лаборатория TIREDWOOD: решения'];
    for (const s of SUMMARY_ORDER) {
      const list = CATALOG.filter((e) => this.statusOf(e) === s && (s !== 'testing' || this.decisions[e.id]));
      if (!list.length) continue;
      out.push(`${LAB_STATUS_LABEL[s]}: ${list.map((e) => `${e.title}${this.decisions[e.id]?.note ? ` (${this.decisions[e.id]!.note.replace(/\s+/g, ' ')})` : ''}`).join('; ')}`);
    }
    return out.join('\n');
  }

  private async copySummary(): Promise<void> {
    const text = this.summaryText();
    try {
      await navigator.clipboard.writeText(text);
      this.toast('Список скопирован', 'ok');
      return;
    } catch {
      // без разрешения на буфер: пробуем по-старому
    }
    const ta = h('textarea', { class: 'lab-offscreen', 'aria-hidden': 'true' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let done = false;
    try {
      done = document.execCommand('copy');
    } catch {
      done = false;
    }
    ta.remove();
    this.toast(done ? 'Список скопирован' : 'Не получилось скопировать', done ? 'ok' : 'bad');
  }

  private leave(): void {
    forgetKey();
    this.owner = false;
    this.toast('Вышел из режима владельца', 'ok');
    this.paint();
  }

  private toast(text: string, kind: 'ok' | 'bad'): void {
    this.toastEl.hidden = false;
    this.toastEl.textContent = text;
    this.toastEl.dataset.kind = kind;
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.hidden = true;
    }, kind === 'bad' ? 5000 : 2200);
  }

  /** /lab/#hot-melon: показать карточку и подсветить. */
  private openFromHash(): void {
    const id = decodeURIComponent(location.hash.slice(1));
    const v = this.cards.get(id);
    if (!v) return;
    if (v.el.hidden) this.clearFilters();
    v.el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    v.el.classList.add('lab-flash');
    window.clearTimeout(this.flashTimer);
    this.flashTimer = window.setTimeout(() => v.el.classList.remove('lab-flash'), 2200);
  }
}

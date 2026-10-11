// Вход в игру (кит 2.0, страница lab/ui «Вход и загрузка»): карточка входа с тремя видами («Привет, ник!», «Как тебя
// звать?», «Вход по коду»), быстрые настройки и окна связи (потеряна · выгнали · другое окно · переподключаемся ·
// сервер обновляется). Логика входа — в App (client/app.ts): тут только вид и поля. Вид — entry.css.
import { MAX_NAME } from '../../shared/constants.ts';
import { sanitizeName } from '../../shared/text.ts';
import { pickPreset } from '../render/gfx.ts';
import { effectiveVolume, toggleMute, type Quality, type Settings } from '../settings.ts';
import { TOUCH } from '../touch.ts';
import { iconImg, keyHtml, meterHtml } from './kit/dom.ts';
import { uiIcon } from './kit/icons.ts';
import { escHtml } from './kit/topcenter.ts';
import { artUrl } from './transition-art.ts';
import './entry.css';

/** Три вида карточки: сохранённый ник, поле ника, код с другого устройства */
export type JoinMode = 'saved' | 'nick' | 'code';

const NICKS = ['Кругляш', 'Мармеладка', 'Боцман', 'Юнга', 'Шкипер', 'Клякса', 'Пончик', 'Бублик', 'Карамелька', 'Лоцман', 'Тюлька', 'Кок'];
const CODE_LEN = 8;
const BAD_NICK = 'Ник — от 2 до 16 символов: буквы, цифры, пробел, _ - .';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, html = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

/** Логотип TIREDWOOD: один вид на обложке, входе и загрузке (.en-logo) */
export const logoHtml = (cls = ''): string => `<div class="en-logo ${cls}"><p class="en-logo-word">TIRED<b>WOOD</b></p></div>`;

/** Проверка ника, пока печатают (как на сервере — shared/text.ts sanitizeName и profiles.ts validNick, но без запрета: решает сервер) */
function nickCheck(raw: string, placeholder: string): readonly ['' | 'is-ok' | 'is-bad', string] {
  const n = raw.replace(/\s+/g, ' ').trim();
  if (!n) return ['', `Оставишь пустым — будешь «${placeholder}»`];
  const s = sanitizeName(n);
  if (s.length < 2 || !/\p{L}/u.test(s)) return ['is-bad', BAD_NICK];
  return ['is-ok', 'Подходит'];
}

const people = (n: number): string => (n % 10 === 1 && n % 100 !== 11 ? 'человек' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'человека' : 'человек');

// ============================================================ быстрые настройки

/** Четыре строки из настроек игры (качество, громкость, «без звука», мышь): остальное — в игре, Esc → «Настройки». */
class QuickSettings {
  readonly root: HTMLElement;
  private readonly s: Settings;
  private readonly changed: () => void;
  private readonly syncs: Array<() => void> = [];

  constructor(s: Settings, changed: () => void, close: () => void) {
    this.s = s;
    this.changed = changed;
    this.root = el('div', 'k-panel en-pop');
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Быстрые настройки');
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="en-pop-head"><p class="k-eyebrow">Быстрые настройки</p><button class="k-close" type="button" data-act="settings-close" aria-label="Закрыть">${keyHtml('Esc', undefined, 'sm')}</button></div>
      <div class="en-pop-row"><div class="k-row-title">Качество картинки</div><div class="k-seg en-quality" role="group" aria-label="Качество картинки"></div>
        <div class="k-row-hint">«Авто» само снизит разрешение, если игра тормозит</div></div>
      <div class="k-row en-vol"><div><div class="k-row-title">Общая громкость</div></div><div class="k-row-ctl"></div></div>
      <div class="k-row en-mute"><div><div class="k-row-title">Без звука</div><div class="k-row-hint">${TOUCH ? 'Громкость останется прежней' : `${keyHtml('M', undefined, 'sm')} — в любой момент игры`}</div></div><div class="k-row-ctl"></div></div>
      <div class="k-row en-sens"><div><div class="k-row-title">${TOUCH ? 'Обзор пальцем' : 'Чувствительность мыши'}</div></div><div class="k-row-ctl"></div></div>
      <p class="en-pop-note">Графика, голос и управление целиком — в игре: ${keyHtml('Esc', undefined, 'sm')} → «Настройки».</p>`;
    this.quality();
    this.slider('.en-vol', 'Общая громкость', 0, 1, 0.05, () => effectiveVolume(s), (v) => { s.volume = v; if (v > 0) s.muted = false; }, () => (s.muted ? 'выкл' : `${Math.round(s.volume * 100)}%`));
    this.mute();
    this.slider('.en-sens', TOUCH ? 'Обзор пальцем' : 'Чувствительность мыши', 0.1, 4, 0.05, () => s.sens, (v) => { s.sens = v; }, () => s.sens.toFixed(2).replace('.', ','));
    this.root.querySelector('[data-act="settings-close"]')!.addEventListener('click', close);
    this.sync();
  }

  /** Подогнать ползунки и кнопки под настройки (звук меняют и клавишей M) */
  sync(): void {
    for (const f of this.syncs) f();
  }

  private quality(): void {
    const s = this.s;
    const group = this.root.querySelector('.en-quality')!;
    const list: ReadonlyArray<readonly [Quality, string]> = [['auto', 'Авто'], ['high', 'Высокое'], ['medium', 'Среднее'], ['low', 'Низкое']];
    const buttons = list.map(([q, label]) => {
      const b = el('button', '', label);
      b.type = 'button';
      b.addEventListener('click', () => {
        pickPreset(s, q);
        this.sync();
        this.changed();
      });
      group.append(b);
      return [q, b] as const;
    });
    this.syncs.push(() => { for (const [q, b] of buttons) b.setAttribute('aria-pressed', String(!s.custom && s.quality === q)); });
  }

  private slider(row: string, name: string, min: number, max: number, step: number, get: () => number, set: (v: number) => void, text: () => string): void {
    const ctl = this.root.querySelector(`${row} .k-row-ctl`)!;
    const input = el('input', 'k-slider');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.setAttribute('aria-label', name);
    const val = el('span', 'k-row-val');
    const draw = (): void => {
      const v = get();
      if (input.value !== String(v)) input.value = String(v);
      input.style.setProperty('--v', String((v - min) / (max - min)));
      val.textContent = text();
    };
    input.addEventListener('input', () => {
      set(Number(input.value));
      draw();
      this.sync();
      this.changed();
    });
    ctl.append(input, val);
    this.syncs.push(draw);
  }

  private mute(): void {
    const s = this.s;
    const ctl = this.root.querySelector('.en-mute .k-row-ctl')!;
    const sw = el('label', 'k-switch', '<input type="checkbox" aria-label="Без звука"><span class="k-switch-track"></span>');
    const input = sw.querySelector('input')!;
    input.addEventListener('change', () => {
      if (input.checked !== s.muted) toggleMute(s);
      this.sync();
      this.changed();
    });
    ctl.append(sw);
    this.syncs.push(() => { input.checked = s.muted; });
  }
}

// ============================================================ вход

export interface JoinHooks {
  /** «Играть» / «Войти» / Enter */
  play(): void;
  /** «Другой профиль» (с вопросом — решает App) */
  other(): void;
  /** Быстрые настройки поменяли: применить и запомнить */
  changed(): void;
  /** Ник, с которым заходили в прошлый раз ('' — не заходили) */
  saved(): string;
}

/** Экран входа: над картиной набережной слева карточка, справа сверху «Сейчас в игре». Один на всё время, виды меняются setMode. */
export class JoinScreen {
  readonly root: HTMLElement;
  mode: JoinMode = 'nick';
  /** Подсказка в пустом поле ника — с ней зайдём, если поле пустое */
  readonly placeholder = NICKS[Math.floor(Math.random() * NICKS.length)];
  private readonly h: JoinHooks;
  private readonly card: HTMLElement;
  private readonly news: HTMLElement;
  private readonly live: HTMLElement;
  private readonly quick: QuickSettings;
  private nickText = '';
  private err = '';
  private busy = false;

  constructor(s: Settings, hooks: JoinHooks) {
    this.h = hooks;
    this.root = el('div', 'screen join show');
    const scr = this.root.appendChild(el('div', 'en-scr en-login'));
    const art = scr.appendChild(el('img', 'en-art'));
    art.src = artUrl('hero-left');
    art.alt = '';
    art.decoding = 'async';
    art.draggable = false;
    scr.append(el('div', 'en-shade en-shade--left'));
    const col = scr.appendChild(el('div', 'en-col'));
    col.append(el('div', 'en-login-logo', `${logoHtml('en-logo--md')}<span class="k-pill k-pill--plate en-tagline">мини игры, фарм сабжей, казино и safeplace</span>`));
    this.card = col.appendChild(el('section', 'k-panel en-card'));
    this.news = col.appendChild(el('div', 'en-news', `<span class="k-pill k-pill--plate k-pill--sm">Новое на набережной</span><div class="en-news-row">${
      (['farm', 'dungeon', 'isle'] as const).map((k) => `<figure class="k-plate en-news-card"><img src="${artUrl(`${k}-sm`)}" alt="" draggable="false"><span>${{ farm: 'Ферма', dungeon: 'Подземелье', isle: 'Остров' }[k]}</span></figure>`).join('')}</div>`));
    col.append(el('div', 'k-plate en-keys', TOUCH
      ? '<span>пальцем слева — бегать</span><span>справа — осмотреться</span><span>меню — кнопка ☰</span>'
      : `<span><span class="k-keys">${['W', 'A', 'S', 'D'].map((k) => keyHtml(k)).join('')}</span>бегать</span><span>${keyHtml('E')}действие</span><span>${keyHtml('Esc')}меню и все клавиши</span>`));
    col.lastElementChild!.setAttribute('aria-label', 'Главные клавиши');
    this.live = scr.appendChild(el('div', 'en-top')).appendChild(el('span', 'k-pill k-pill--plate k-pill--lg en-live'));
    this.live.setAttribute('role', 'status');
    this.quick = new QuickSettings(s, () => hooks.changed(), () => this.closeSettings());
    scr.append(this.quick.root);

    this.card.addEventListener('click', (e) => this.onClick(e));
    this.card.addEventListener('input', (e) => this.onInput(e));
    this.card.addEventListener('keydown', (e) => this.onKey(e));
    this.card.addEventListener('paste', (e) => this.onPaste(e));
    // Enter, когда фокус не в поле и не на кнопке (экран «Привет, ник!»): «Играть»; Esc закрывает быстрые настройки
    document.addEventListener('keydown', (e) => {
      if (!this.visible) return;
      if (e.key === 'Escape' && !this.quick.root.hidden) { e.preventDefault(); this.closeSettings(); return; }
      const t = e.target as Element | null;
      if (e.key === 'Enter' && !e.repeat && (!t || t === document.body || t === document.documentElement)) { e.preventDefault(); this.h.play(); }
    });
    this.setOnline(undefined);
    this.render();
  }

  get visible(): boolean {
    return this.root.classList.contains('show');
  }

  // ------------------------------------------------------------ состояние

  setMode(mode: JoinMode): void {
    this.mode = mode;
    this.err = '';
    this.render();
    if (mode === 'code') this.focusCode();
    else if (mode === 'nick' && !this.nickText) this.focusNick();
  }

  /** Сообщение под полем: ошибка входа с сервера (ник занят, код не подошёл, слишком часто…) */
  setError(text: string): void {
    this.err = text;
    this.render();
  }

  /** «Подключаемся…»: кнопка не нажимается, пока идёт вход */
  setBusy(on: boolean): void {
    if (this.busy === on) return;
    this.busy = on;
    this.render();
  }

  /** Ник из поля (как отправим): чистые пробелы, не длиннее MAX_NAME */
  nick(): string {
    this.readNick();
    return this.nickText.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
  }

  setNick(v: string): void {
    this.nickText = v;
    const input = this.card.querySelector<HTMLInputElement>('.en-nick');
    if (input) input.value = v;
  }

  /** Код с другого устройства: буквы и цифры без дефиса, заглавные */
  code(): string {
    return [...this.card.querySelectorAll<HTMLInputElement>('.en-code .k-input')].map((c) => c.value).join('').toUpperCase();
  }

  focusNick(select = false): void {
    const input = this.card.querySelector<HTMLInputElement>('.en-nick');
    if (!input) return;
    input.focus();
    if (select) input.select();
  }

  /** n — сколько человек в игре; 0 — никого; null — сервер не ответил; undefined — ещё не спрашивали */
  setOnline(n: number | null | undefined): void {
    this.live.classList.toggle('is-down', n === null);
    this.live.hidden = n === undefined;
    if (n === undefined) return;
    this.live.innerHTML = `<i class="en-live-dot"></i>${n === null ? 'Сервер молчит — запущен ли он?' : n > 0 ? `Сейчас в игре: <b class="k-num">${n}</b> ${people(n)}` : 'Пока никого — будь первым'}`;
  }

  /** Быстрые настройки подогнать под настройки игры (звук меняют и клавишей M) */
  syncSettings(): void {
    this.quick.sync();
  }

  closeSettings(): void {
    if (this.quick.root.hidden) return;
    this.quick.root.hidden = true;
    this.card.querySelector('.en-gear')?.setAttribute('aria-expanded', 'false');
  }

  // ------------------------------------------------------------ разметка

  private readNick(): void {
    const input = this.card.querySelector<HTMLInputElement>('.en-nick');
    if (input) this.nickText = input.value;
  }

  private render(): void {
    this.readNick();
    const mode = this.mode;
    const open = !this.quick.root.hidden;
    this.card.classList.toggle('en-card--code', mode === 'code');
    this.news.hidden = mode === 'code';
    const gear = `<button class="k-btn k-btn--ghost k-btn--icon k-btn--sm en-gear" type="button" data-act="settings" aria-label="Настройки" aria-expanded="${open}">${iconImg('settings') || '⚙︎'}</button>`;
    const dis = this.busy ? ' disabled' : '';
    const play = (label: string): string => `<div class="en-play"><button class="k-btn k-btn--gold k-btn--lg k-btn--wide" type="button" data-act="play"${dis}>${this.busy ? `<span><i class="en-spin"></i>Подключаемся…</span>` : `${label}${keyHtml('Enter', 'tr')}`}</button></div>`;
    const saved = this.h.saved();
    if (mode === 'saved') {
      this.card.innerHTML = `${gear}
        <p class="k-eyebrow">С возвращением</p>
        <h2 class="en-h">Привет, <b>${escHtml(saved)}</b>!</h2>
        <p class="en-lead">Набережная уже ждёт — заходи.</p>
        ${this.err ? `<div class="en-msg is-bad" role="alert"><i class="en-tick">!</i><span>${escHtml(this.err)}</span></div>` : ''}
        ${play('Играть')}
        <div class="en-alt"><button class="k-btn k-btn--ghost k-btn--sm" type="button" data-act="other"${dis}>Другой профиль</button><button class="k-btn k-btn--ghost k-btn--sm" type="button" data-act="code"${dis}>У меня есть код</button></div>`;
      return;
    }
    if (mode === 'nick') {
      const [cls, msg] = this.err ? (['is-bad', this.err] as const) : nickCheck(this.nickText, this.placeholder);
      this.card.innerHTML = `${gear}
        <p class="k-eyebrow">Первый раз на набережной</p>
        <h2 class="en-h">Как тебя звать?</h2>
        <label class="en-field ${cls}"><span class="en-field-top"><span>Ник — его увидят все</span><span class="k-num en-count">${[...this.nickText].length} / ${MAX_NAME}</span></span>
          <input class="k-input en-nick" type="text" maxlength="${MAX_NAME}" spellcheck="false" autocomplete="off" placeholder="${escHtml(this.placeholder)}" value="${escHtml(this.nickText)}"${dis}></label>
        <div class="en-msg ${cls}" role="status">${cls ? `<i class="en-tick">${cls === 'is-ok' ? '✓' : '!'}</i>` : ''}<span class="en-msg-text">${escHtml(msg)}</span></div>
        ${play('Играть')}
        <div class="en-alt">${saved ? `<button class="k-btn k-btn--ghost k-btn--sm" type="button" data-act="back"${dis}>Назад</button>` : ''}<button class="k-btn k-btn--ghost k-btn--sm" type="button" data-act="code"${dis}>У меня есть код</button></div>`;
      if (this.err) this.card.querySelector('.en-field')!.classList.add('is-bad');
      return;
    }
    const cells = Array.from({ length: CODE_LEN }, (_, i) => `<input class="k-input" type="text" maxlength="1" autocomplete="off" spellcheck="false" aria-label="Знак ${i + 1}"${dis}>`);
    this.card.innerHTML = `${gear}
      <p class="k-eyebrow">С другого устройства</p>
      <h2 class="en-h">Вход по коду</h2>
      <ol class="en-steps">
        <li><b>1</b><span>Там открой меню: ${keyHtml('Esc', undefined, 'sm')} или ☰</span></li>
        <li><b>2</b><span>«Подарки и коды» → «Получить код для входа»</span></li>
        <li><b>3</b><span>Введи код здесь — он одноразовый, 10 минут</span></li>
      </ol>
      <div class="en-field"><span class="en-field-top"><span>Код</span><span>буквы и цифры</span></span>
        <div class="en-code">${cells.slice(0, 4).join('')}<i class="en-code-dash"></i>${cells.slice(4).join('')}</div></div>
      <div class="en-msg ${this.err ? 'is-bad' : ''}" role="status">${this.err ? `<i class="en-tick">!</i><span>${escHtml(this.err)}</span>` : '<span>Дефис и регистр не важны</span>'}</div>
      ${play('Войти')}
      <div class="en-alt en-alt--one"><button class="k-btn k-btn--ghost k-btn--sm" type="button" data-act="back"${dis}>Назад</button></div>`;
  }

  // ------------------------------------------------------------ события

  private onClick(e: Event): void {
    const b = (e.target as Element).closest<HTMLElement>('[data-act]');
    if (!b || b.hasAttribute('disabled')) return;
    switch (b.dataset.act) {
      case 'play': this.h.play(); break;
      case 'other': this.h.other(); break;
      case 'code': this.setMode('code'); break;
      case 'back': this.setMode(this.h.saved() ? 'saved' : 'nick'); break;
      case 'settings': {
        const pop = this.quick.root;
        pop.hidden = !pop.hidden;
        b.setAttribute('aria-expanded', String(!pop.hidden));
        if (!pop.hidden) this.quick.sync();
        break;
      }
    }
  }

  private onInput(e: Event): void {
    const t = e.target as HTMLInputElement;
    if (t.classList.contains('en-nick')) {
      this.nickText = t.value;
      this.err = '';
      const [cls, msg] = nickCheck(t.value, this.placeholder);
      const field = this.card.querySelector('.en-field')!;
      const m = this.card.querySelector('.en-msg')!;
      field.className = `en-field ${cls}`;
      m.className = `en-msg ${cls}`;
      m.innerHTML = `${cls ? `<i class="en-tick">${cls === 'is-ok' ? '✓' : '!'}</i>` : ''}<span class="en-msg-text">${escHtml(msg)}</span>`;
      this.card.querySelector('.en-count')!.textContent = `${[...t.value].length} / ${MAX_NAME}`;
      return;
    }
    if (t.closest('.en-code')) {
      const cells = this.cells();
      const v = t.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      t.value = v.slice(-1);
      if (v) cells[Math.min(cells.indexOf(t) + 1, cells.length - 1)].focus();
    }
  }

  private onKey(e: KeyboardEvent): void {
    const t = e.target as HTMLInputElement;
    if (t.classList.contains('en-nick') || t.closest('.en-code')) {
      if (e.key === 'Enter') { e.preventDefault(); this.h.play(); return; }
    }
    if (!t.closest('.en-code')) return;
    const cells = this.cells();
    const i = cells.indexOf(t);
    if (e.key === 'Backspace' && !t.value && i > 0) { e.preventDefault(); cells[i - 1].value = ''; cells[i - 1].focus(); }
    else if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); cells[i - 1].focus(); }
    else if (e.key === 'ArrowRight' && i < cells.length - 1) { e.preventDefault(); cells[i + 1].focus(); }
  }

  /** Код вставили целиком («ABCD-2345»): раскладываем по клеткам */
  private onPaste(e: ClipboardEvent): void {
    const t = e.target as HTMLInputElement;
    if (!t.closest('.en-code')) return;
    e.preventDefault();
    const chars = (e.clipboardData?.getData('text') ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!chars) return;
    const cells = this.cells();
    let i = chars.length >= CODE_LEN ? 0 : Math.max(0, cells.indexOf(t));
    for (const ch of chars.slice(0, CODE_LEN)) if (i < cells.length) cells[i++].value = ch;
    cells[Math.min(i, cells.length - 1)].focus();
  }

  private cells(): HTMLInputElement[] {
    return [...this.card.querySelectorAll<HTMLInputElement>('.en-code .k-input')];
  }

  focusCode(): void {
    const cells = this.cells();
    (cells.find((c) => !c.value) ?? cells[0])?.focus();
  }
}

// ============================================================ связь

export type LinkKind = 'lost' | 'kicked' | 'replaced' | 'reconnect' | 'restart';

interface LinkText {
  icon: string;
  eyebrow: string;
  title: string;
  text: string;
  /** Главная кнопка; без неё — только «В меню» (ждём, всё сделается само) */
  main?: string;
  /** Полоса ожидания */
  wait?: boolean;
  note?: string;
}

const LINK: Record<LinkKind, LinkText> = {
  lost: { icon: 'warn', eyebrow: 'Связь', title: 'Связь потеряна', text: 'Сервер не отвечает.', main: 'Переподключиться' },
  reconnect: { icon: 'lighthouse', eyebrow: 'Связь', title: 'Связь пропала', text: 'Переподключаемся…', wait: true },
  restart: { icon: 'settings', eyebrow: 'Сервер', title: 'Сервер обновляется', text: 'Переподключаемся…', wait: true, note: 'Прогресс сохранён.' },
  kicked: { icon: 'exit', eyebrow: 'Голосование', title: 'Тебя выгнали', text: 'Так решили игроки голосованием.', main: 'Войти снова' },
  replaced: { icon: 'lock', eyebrow: 'Другое окно', title: 'Ты зашёл в другом окне', text: 'Играть можно в одном окне за раз — здесь игра остановлена.', main: 'Вернуться сюда' },
};

/** Одно окно связи на все случаи: картинка, что случилось, одна главная кнопка и «В меню» (над затемнённым миром) */
export class LinkScreen {
  readonly root: HTMLElement;
  private kind: LinkKind = 'lost';

  constructor(hooks: { main(): void; menu(): void }) {
    this.root = el('div', 'screen link');
    this.root.addEventListener('click', (e) => {
      const b = (e.target as Element).closest<HTMLElement>('[data-act]');
      if (b?.dataset.act === 'main') hooks.main();
      else if (b?.dataset.act === 'menu') hooks.menu();
    });
  }

  /** text — причина (потеряна, выгнали); без неё — слова по умолчанию */
  show(kind: LinkKind, text?: string): void {
    this.kind = kind;
    const c = LINK[kind];
    const body = text ? text[0].toUpperCase() + text.slice(1) : c.text;
    const icon = uiIcon(c.icon);
    this.root.innerHTML = `<div class="en-dim-world"></div><div class="k-scrim">
      <section class="k-window k-window--sm is-in en-conn" role="alertdialog" aria-label="${c.title}">
        <header class="k-win-head"><span class="k-win-portrait">${icon ? `<img src="${icon}" alt="">` : ''}</span><div class="k-win-titles"><p class="k-eyebrow">${c.eyebrow}</p><h2 class="k-win-title">${c.title}</h2></div></header>
        <div class="k-win-body"><p class="en-conn-text">${escHtml(body)}</p>
          ${c.wait ? meterHtml(0, 'info') : ''}
          ${c.note ? `<p class="en-conn-note"><span class="k-pill k-pill--good k-pill--sm">✓</span>${c.note}</p>` : ''}</div>
        <footer class="k-win-foot">${c.main ? `<button class="k-btn k-btn--gold" type="button" data-act="main">${c.main}${keyHtml('Enter', 'tr')}</button>` : ''}<button class="k-btn k-btn--ghost" type="button" data-act="menu">В меню</button></footer>
      </section></div>`;
  }

  /** Строка «Переподключаемся через N с…» и полоса: v — сколько паузы прошло (0…1), null — подключаемся прямо сейчас */
  setWait(text: string, v: number | null): void {
    const t = this.root.querySelector('.en-conn-text');
    if (t && t.textContent !== text) t.textContent = text;
    const m = this.root.querySelector<HTMLElement>('.k-meter');
    if (!m) return;
    m.classList.toggle('is-wait', v === null);
    m.style.setProperty('--v', String(v === null ? 1 : Math.max(0.04, Math.min(1, v))));
  }

  /** Главная кнопка получает фокус — Enter, как на её колпачке, жмёт её */
  focusMain(): void {
    this.root.querySelector<HTMLElement>('[data-act="main"]')?.focus({ preventScroll: true });
  }

  get shown(): LinkKind {
    return this.kind;
  }
}

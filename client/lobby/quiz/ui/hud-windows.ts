// «Ракушка»: окна загадывающего — «Что загадал?» (слово, тема, первая подсказка, «Подкинь идею») и «Подсказка».
// Нативный <dialog class="k-scrim"> > section.k-window (docs/ui.md §4): ✕, Esc и клик мимо закрывают, кнопки молчат до ответа
// сервера. Образец разметки — lab/quiz/v2/js/riddle.js (шаг «ask») и FarmWin. Закрывает окно сам HUD, когда шаг ушёл.
import { checkAnswer } from '../../../../shared/quiz/answer.ts';
import type { QuizClientMsg } from '../../../../shared/quiz/net.ts';
import { QZ, QZ_CATEGORIES, type QzCategory, type QzMe, type QzView } from '../../../../shared/quiz/types.ts';
import { bindClickSounds, sfx } from '../../../ui/kit/sfx.ts';
import { COIN_K, esc, keyCap, pic } from './hud-model.ts';

/** Слова для «Подкинь идею» под тему (lab/quiz/v2/js/riddle.js) */
const IDEAS: Record<QzCategory, string[]> = {
  'Предмет': ['пароход', 'зонтик', 'маяк', 'чайник', 'гамак', 'бинокль', 'якорь', 'фонарик', 'удочка', 'самовар'],
  'Животное': ['чайка', 'краб', 'дельфин', 'ёж', 'кот', 'медуза', 'пеликан', 'черепаха'],
  'Человек': ['капитан', 'повар', 'рыбак', 'спасатель', 'почтальон', 'фокусник', 'дворник'],
  'Место': ['пляж', 'рынок', 'вокзал', 'библиотека', 'пирс', 'кафе', 'баня'],
  'Фильм или книга': ['Титаник', 'Золушка', 'Шерлок', 'Колобок', 'Остров сокровищ', 'Буратино'],
  'Еда': ['арбуз', 'мороженое', 'шашлык', 'пельмени', 'окрошка', 'блины', 'чебурек'],
  'Другое': ['радуга', 'отпуск', 'шторм', 'сон', 'эхо', 'сквозняк', 'понедельник'],
};

/** Сколько ждём ответ сервера, прежде чем снова дать нажать (ошибку покажет тост интегратора) */
const BUSY_MS = 2500;
/** Окно подсказки открывает клавиша H: столько миллисекунд после открытия ввод в поле не принимаем (иначе в нём «h») */
const KEY_LEAK_MS = 120;

export interface DlgSpec {
  /** подпись для скринридера и класс окна */
  label: string;
  cls: string;
  icon: string;
  eyebrow: string;
  title: string;
  body: string;
  foot: string;
}

/** Нативное окно кита: клавиши и мышь не уходят игре, Esc / ✕ / клик мимо закрывают */
export class QDialog {
  readonly dlg: HTMLDialogElement;
  readonly win: HTMLElement;
  private readonly onClose: () => void;

  constructor(parent: HTMLElement, s: DlgSpec, onClose: () => void) {
    this.onClose = onClose;
    const d = document.createElement('dialog');
    d.className = 'k-scrim qz-scrim';
    d.setAttribute('aria-label', s.label);
    d.tabIndex = -1;
    d.innerHTML = `<section class="k-window ${s.cls} qz-window">`
      + `<header class="k-win-head"><span class="k-win-portrait">${pic(s.icon)}</span>`
      + `<div class="k-win-titles"><p class="k-eyebrow">${esc(s.eyebrow)}</p><h2 class="k-win-title">${esc(s.title)}</h2></div>`
      + `<div class="k-win-tools"><button type="button" class="k-close" aria-label="Закрыть">${keyCap('Esc')}</button></div></header>`
      + `<div class="k-win-body">${s.body}</div><footer class="k-win-foot">${s.foot}</footer></section>`;
    this.dlg = d;
    this.win = d.querySelector('section')!;
    d.querySelector('.k-close')?.addEventListener('click', () => this.close());
    // клавиши — не игре; Esc закрывает
    d.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Escape') { e.preventDefault(); this.close(); }
    });
    d.addEventListener('keyup', (e) => e.stopPropagation());
    d.addEventListener('mousedown', (e) => { e.stopPropagation(); if ((e.target as Element).closest('button')) e.preventDefault(); });
    for (const type of ['pointerdown', 'wheel'] as const) d.addEventListener(type, (e) => e.stopPropagation(), { passive: true });
    d.addEventListener('cancel', (e) => { e.preventDefault(); this.close(); });
    d.addEventListener('click', (e) => { if (e.target === d) this.close(); });
    bindClickSounds(d);
    parent.appendChild(d);
  }

  get isOpen(): boolean {
    return this.dlg.open;
  }

  show(focus?: HTMLElement | null): void {
    if (this.dlg.open) return;
    this.dlg.showModal();
    (focus ?? this.dlg).focus({ preventScroll: true });
    sfx.play('open');
    this.win.classList.remove('is-in');
    void this.win.offsetWidth;
    this.win.classList.add('is-in');
  }

  /** silent — закрыли мы сами (шаг ушёл, ушли с набережной): без звука и без обратного вызова */
  close(silent = false): void {
    if (!this.dlg.open) return;
    this.dlg.close();
    if (!silent) { sfx.play('close'); this.onClose(); }
  }

  destroy(): void {
    this.close(true);
    this.dlg.remove();
  }
}

/** Окна загадывающего: появляются и исчезают по снимку (sync), кнопки шлют qz-сообщения */
export class QuizWindows {
  private readonly send: (m: QuizClientMsg) => void;
  private readonly parent: HTMLElement;
  private ask: QDialog | null = null;
  private hint: QDialog | null = null;
  /** номер загадки, окно которой игрок закрыл сам: само не открываем, открыть можно кнопкой на плашке */
  private dismissedNum = -1;
  private hintsAtOpen = 0;
  private busyTimer = 0;

  constructor(send: (m: QuizClientMsg) => void, parent: HTMLElement = document.body) {
    this.send = send;
    this.parent = parent;
  }

  get open(): boolean {
    return !!this.ask?.isOpen || !!this.hint?.isOpen;
  }

  /** Привести окна к снимку: «Что загадал?» — пока шаг ask у меня; «Подсказка» — пока идёт раунд */
  sync(v: QzView, me: QzMe): void {
    const R = v.riddle;
    const meRid = me.role === 'riddler' && v.phase === 'game' && !!R;
    if (this.ask?.isOpen && !(meRid && R!.step === 'ask')) this.ask.close(true);
    if (meRid && R!.step === 'ask' && R!.num !== this.dismissedNum && !this.ask?.isOpen) this.openAsk(v, me);
    if (this.hint?.isOpen && (!(meRid && R!.step === 'round') || (R?.hints.length ?? 0) > this.hintsAtOpen)) this.hint.close(true);
  }

  /** Убрать всё (ушли из ограды) */
  dispose(): void {
    clearTimeout(this.busyTimer);
    this.ask?.destroy();
    this.hint?.destroy();
    this.ask = this.hint = null;
  }

  // ---------------------------------------------------------------- «Что загадал?»

  openAsk(v: QzView, me: QzMe): void {
    const R = v.riddle;
    if (!R || this.ask?.isOpen) return;
    this.ask?.destroy();
    const note = v.noTokens ? 'Меньше трёх человек — без жетонов' : `Разгадают за минуту и дольше — тебе +10 ${COIN_K}`;
    const num = R.num;
    const dlg = new QDialog(this.parent, {
      label: 'Что загадал?', cls: '', icon: 'scroll', eyebrow: `«Ракушка» · Загадка ${R.num} из ${R.of}`, title: 'Что загадал?',
      body: `<div class="qz-ask">
        <label class="qz-field"><span class="qz-label">Слово или фраза</span>
          <span class="qz-wordrow"><input class="k-input qz-word" maxlength="${QZ.WORD_MAX}" placeholder="Например: пароход" autocomplete="off" spellcheck="false"><button type="button" class="k-btn k-btn--ghost k-btn--sm qz-idea">Подкинь идею</button></span></label>
        <div class="qz-ideas" hidden></div>
        <p class="k-faint qz-note">Видишь только ты — остальные угадывают в чате</p>
        <div class="qz-field"><span class="qz-label">Тема</span><div class="k-seg qz-cats">${QZ_CATEGORIES.map((c, i) => `<button type="button" class="${i === 0 ? 'is-on' : ''}">${esc(c)}</button>`).join('')}</div></div>
        <label class="qz-field"><span class="qz-label">Первая подсказка <em>по желанию</em></span>
          <input class="k-input qz-hint" maxlength="${QZ.HINT_MAX}" placeholder="Например: дымит" autocomplete="off" spellcheck="false"></label>
        <p class="qz-err k-bad" hidden></p></div>`,
      foot: `<span class="k-note">${note}</span><button type="button" class="k-btn k-btn--ghost" data-a="cancel">Отмена</button><button type="button" class="k-btn k-btn--go" data-a="go">Загадать${keyCap('Enter', 'tr', '')}</button>`,
    }, () => { this.dismissedNum = num; });
    this.ask = dlg;
    const w = dlg.win;
    const q = <T extends HTMLElement>(s: string): T => w.querySelector<T>(s)!;
    const word = q<HTMLInputElement>('.qz-word'), hint = q<HTMLInputElement>('.qz-hint'), err = q<HTMLElement>('.qz-err');
    const go = q<HTMLButtonElement>('[data-a="go"]');
    const cat = (): QzCategory => (w.querySelector('.qz-cats .is-on')?.textContent as QzCategory | null) ?? QZ_CATEGORIES[0];
    const ideas = q<HTMLElement>('.qz-ideas');
    const idea = (): void => {
      const pool = [...IDEAS[cat()]].sort(() => Math.random() - 0.5).slice(0, 3);
      ideas.innerHTML = pool.map((p) => `<button type="button" class="k-pill k-pill--plate k-pill--sm qz-idea-w">${esc(p)}</button>`).join('');
      ideas.hidden = false;
      for (const b of ideas.querySelectorAll('button')) b.addEventListener('click', () => { word.value = b.textContent ?? ''; sfx.play('pop'); word.focus(); });
    };
    q('.qz-idea').addEventListener('click', idea);
    for (const b of w.querySelectorAll<HTMLButtonElement>('.qz-cats button')) {
      b.addEventListener('click', () => {
        for (const o of w.querySelectorAll('.qz-cats button')) o.classList.remove('is-on');
        b.classList.add('is-on');
        if (!ideas.hidden) idea();
      });
    }
    const submit = (): void => {
      if (go.disabled) return;
      const text = word.value.trim();
      if (text.length < QZ.WORD_MIN) { err.textContent = `Напиши слово — от ${QZ.WORD_MIN} до ${QZ.WORD_MAX} знаков`; err.hidden = false; sfx.play('error'); word.focus(); return; }
      err.hidden = true;
      const h = hint.value.trim();
      this.send({ t: 'qz', a: 'ask', word: text, cat: cat(), ...(h ? { hint: h } : {}) });
      this.busy(go);
    };
    go.addEventListener('click', submit);
    q('[data-a="cancel"]').addEventListener('click', () => dlg.close());
    w.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !(e.target as Element).closest('.qz-cats, .qz-ideas, .k-close')) { e.preventDefault(); submit(); } });
    dlg.show(word);
    word.select();
  }

  // ---------------------------------------------------------------- «Подсказка»

  openHint(v: QzView, me: QzMe): void {
    const R = v.riddle;
    if (!R || this.hint?.isOpen || this.ask?.isOpen || me.role !== 'riddler' || R.step !== 'round' || (me.hintsLeft ?? 0) <= 0) return;
    this.hint?.destroy();
    this.hintsAtOpen = R.hints.length;
    const used = QZ.HINTS - (me.hintsLeft ?? 0);
    const answer = me.word ?? '';
    const dlg = new QDialog(this.parent, {
      label: 'Подсказка', cls: 'k-window--sm', icon: 'scroll', eyebrow: `${used + 1} из ${QZ.HINTS}`, title: 'Подсказка',
      body: `<div class="qz-ask"><input class="k-input qz-word" maxlength="${QZ.HINT_MAX}" placeholder="Например: дымит" autocomplete="off" spellcheck="false"><p class="k-faint qz-note">Встанет на табло и в карточку «Тепло»</p><p class="qz-err k-bad" hidden></p></div>`,
      foot: `<button type="button" class="k-btn k-btn--ghost" data-a="cancel">Отмена</button><button type="button" class="k-btn k-btn--go" data-a="go">На табло${keyCap('Enter', 'tr', '')}</button>`,
    }, () => {});
    this.hint = dlg;
    const w = dlg.win;
    const input = w.querySelector<HTMLInputElement>('input')!;
    const err = w.querySelector<HTMLElement>('.qz-err')!;
    const go = w.querySelector<HTMLButtonElement>('[data-a="go"]')!;
    const submit = (): void => {
      if (go.disabled) return;
      const text = input.value.trim();
      if (!text) { input.focus(); return; }
      // ответ в подсказку писать нельзя — скажем сразу, не дожидаясь сервера
      if (answer && checkAnswer(text, answer) !== 'no') {
        input.value = '';
        err.textContent = 'Ответ нельзя — опиши иначе';
        err.hidden = false;
        sfx.play('error');
        input.focus();
        return;
      }
      err.hidden = true;
      this.send({ t: 'qz', a: 'hint', text });
      this.busy(go);
    };
    go.addEventListener('click', submit);
    w.querySelector('[data-a="cancel"]')!.addEventListener('click', () => dlg.close());
    w.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !(e.target as Element).closest('.k-close')) { e.preventDefault(); submit(); } });
    // окно открыла клавиша H, поле уже в фокусе — буква этого же нажатия не должна в него попасть (человек за 120 мс не печатает)
    const t0 = performance.now();
    input.addEventListener('beforeinput', (e) => { if (performance.now() - t0 < KEY_LEAK_MS) e.preventDefault(); });
    dlg.show(input);
  }

  /** Кнопка ждёт ответ сервера: закроет окно следующий снимок, а если отказ (тост сверху) — через BUSY_MS можно снова */
  private busy(btn: HTMLButtonElement): void {
    btn.disabled = true;
    clearTimeout(this.busyTimer);
    this.busyTimer = window.setTimeout(() => { btn.disabled = false; }, BUSY_MS);
  }
}

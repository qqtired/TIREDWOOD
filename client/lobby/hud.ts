// Интерфейс набережной в слотах кита (client/ui/kit/slots.ts): подсказка действия «E — сесть» внизу по центру
// (.k-prompt; нельзя — приглушена, с причиной), приглашение на жест вдвоём над ней (.k-prompt с полосой времени),
// эмоции 1–6 справа внизу (пилюля, как на странице lab/ui «Площадь»; 5 и 6 — вдвоём), FPS слева вверху (.k-faint, по настройке), «Джекпот!»
// по центру (.k-hero) и секундомер аквапарка — плашкой события сверху (верх-центр). Панели набережной (примерочная,
// столы, автомат) кладут в root. На телефоне подсказку и приглашение можно нажать пальцем — как клавишу.
import { TOUCH } from '../touch.ts';
import { setCoinText } from '../ui/coin.ts';
import { iconImg, keyHtml, meterHtml } from '../ui/kit/dom.ts';
import type { HudSlots } from '../ui/kit/slots.ts';
import { PRIO, escHtml, type TopCenter } from '../ui/kit/topcenter.ts';

/** Эмоции на клавишах 1–6 (подсказка при наведении) */
const EMOTES = '1 — помахать · 2 — танец · 3 — устал · 4 — смех · 5 — дай пять · 6 — обняться (5 и 6 — с тем, кто перед тобой)';
/** Сколько висит «Джекпот!» (.k-hero.is-play — появиться и растаять за 3,2 с) */
const JACKPOT_MS = 3300;
/** Телефон: какую клавишу «нажимает» подсказка (по первой клавише в ней) */
const TAP_CODES: Record<string, string> = { E: 'KeyE', Пробел: 'Space', '🎣': 'Space', '🎰': 'Space' };
const MOUSE: Record<string, string> = { ЛКМ: 'l', ПКМ: 'r' };
const TIMER = 'timer';

export class LobbyHud {
  /** Телефон: нажали на подсказку или приглашение — как клавишу */
  onTap: (code: string) => void = () => {};
  readonly root: HTMLElement;
  private readonly top: TopCenter;
  private readonly hint: HTMLElement;
  private readonly emotes: HTMLElement;
  private readonly ask: HTMLElement;
  private readonly stats: HTMLElement;
  private readonly heroSlot: HTMLElement;
  private visible = false;
  private hintOn = false;
  private askOn = false;
  private emotesOn = false;
  private timerKey = '';
  private jackpotTimer = 0;
  private hintKey = '';
  private statsText = '';
  private tapCode = '';
  private askCode = '';

  constructor(parent: HTMLElement, slots: HudSlots, top: TopCenter) {
    this.top = top;
    this.root = el('div', 'hud lobby-hud hidden');
    this.ask = el('div', 'k-prompt pz-ask');
    this.hint = el('div', 'k-prompt pz-hint');
    this.emotes = el('div', 'k-pill k-pill--plate pz-emotes');
    this.emotes.title = EMOTES;
    this.emotes.innerHTML = `${iconImg('emote')}<span class="k-keys">${keyHtml('1')}<span class="pz-dash">–</span>${keyHtml('6')}</span>Эмоции`;
    this.stats = el('div', 'k-faint pz-stats');
    this.heroSlot = slots.c;
    slots.bc.append(this.ask, this.hint);
    slots.br.append(this.emotes);
    slots.tl.append(this.stats);
    parent.appendChild(this.root);
    this.paint();
    if (TOUCH) {
      this.hint.addEventListener('click', () => {
        if (this.tapCode) this.onTap(this.tapCode);
      });
      this.ask.addEventListener('click', () => {
        if (this.askCode) this.onTap(this.askCode);
      });
    }
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.root.classList.toggle('hidden', !v);
    if (!v) {
      this.heroSlot.querySelector('.pz-jackpot')?.remove();
      this.setTimer(null);
    }
    this.paint();
  }

  /** Части в слотах — вместе с набережной */
  private paint(): void {
    this.hint.hidden = !(this.visible && this.hintOn);
    this.ask.hidden = !(this.visible && this.askOn);
    this.emotes.hidden = !(this.visible && this.emotesOn);
    this.stats.hidden = !(this.visible && this.statsText !== '');
  }

  /**
   * Подсказка внизу: клавиши и что будет. Пустой список клавиш — просто надпись («Доска почёта») или причина, почему
   * нельзя, — приглушённо; '/' среди клавиш — разделитель. Текст после первого « · » — серым, за чертой. null — спрятать.
   */
  setHint(keys: readonly string[] | null, text = ''): void {
    const key = keys ? `${keys.join('|')}#${text}` : '';
    if (key === this.hintKey) return;
    this.hintKey = key;
    this.hintOn = keys !== null;
    this.tapCode = TOUCH && keys ? (TAP_CODES[keys[0]] ?? '') : '';
    this.hint.classList.toggle('is-tap', this.tapCode !== '');
    this.paint();
    if (!keys) return;
    this.hint.classList.toggle('k-prompt--off', keys.length === 0);
    // узлами, а не HTML: в подписи бывают ники, а 🪙 рисуется значком
    this.hint.textContent = '';
    let group: HTMLElement | null = null;
    for (const [i, k] of keys.entries()) {
      if (k === '/') {
        this.hint.appendChild(el('span', 'pz-or')).textContent = '/';
        group = null;
        continue;
      }
      const cap = el('kbd', 'k-key');
      if (MOUSE[k]) cap.appendChild(el('i', `k-mouse k-mouse--${MOUSE[k]}`)).setAttribute('aria-label', k);
      else cap.textContent = k;
      // подряд идущие клавиши (W A S D) — одной группой
      if (i > 0 && keys[i - 1] !== '/') {
        if (!group) {
          group = el('span', 'k-keys');
          group.appendChild(this.hint.lastElementChild!);
          this.hint.appendChild(group);
        }
        group.appendChild(cap);
      } else this.hint.appendChild(cap);
    }
    const cut = text.indexOf(' · ');
    coinText(this.hint.appendChild(el('span', '')), cut < 0 ? text : text.slice(0, cut));
    if (cut >= 0) {
      this.hint.appendChild(el('span', 'k-prompt-sep'));
      coinText(this.hint.appendChild(el('span', 'k-prompt-note')), text.slice(cut + 3));
    }
  }

  showEmotes(v: boolean): void {
    this.emotesOn = v;
    this.paint();
  }

  /** Приглашение на жест вдвоём: «Ник предлагает дать пять — жми 5», полоска тает за ms. icon — эмодзи жеста (вместо него — картинка). */
  showAsk(_icon: string, nick: string, what: string, key: string, ms: number): void {
    const a = this.ask;
    a.innerHTML = iconImg('emote');
    const text = a.appendChild(el('span', ''));
    // ник — только как текст
    text.appendChild(el('b', '')).textContent = nick;
    if (TOUCH) {
      text.append(` ${what} — нажми сюда`);
      this.askCode = `Digit${key}`;
    } else {
      text.append(` ${what} — жми`);
      a.appendChild(el('kbd', 'k-key')).textContent = key;
    }
    a.insertAdjacentHTML('beforeend', meterHtml(1, undefined, 'k-meter--thin pz-ask-bar'));
    a.style.setProperty('--ask-ms', `${ms}ms`);
    this.askOn = true;
    this.paint();
    // полоса тает за ms: сначала полная, со следующего кадра — к нулю
    const bar = a.querySelector<HTMLElement>('.pz-ask-bar')!;
    void bar.offsetWidth;
    bar.style.setProperty('--v', '0');
  }

  hideAsk(): void {
    this.askOn = false;
    this.askCode = '';
    this.paint();
  }

  /** Крупно по центру: кто сорвал джекпот и сколько. */
  showJackpot(nick: string, win: number): void {
    this.heroSlot.querySelector('.pz-jackpot')?.remove();
    const hero = el('div', 'k-hero k-hero--gold is-play pz-jackpot');
    hero.appendChild(el('p', 'k-hero-title')).textContent = 'Джекпот!';
    // ник — только как текст
    coinText(hero.appendChild(el('span', 'k-hero-sub')), `${nick} срывает ${win.toLocaleString('ru-RU')} 🪙`);
    this.heroSlot.append(hero);
    clearTimeout(this.jackpotTimer);
    this.jackpotTimer = window.setTimeout(() => hero.remove(), JACKPOT_MS);
  }

  /** Секундомер аквапарка — плашка сверху: время забега; done — финиш (время замерло, зелёным), sub — строка под ним; null — спрятать. */
  setTimer(text: string | null, done = false, sub = ''): void {
    const key = text === null ? '' : `${done ? 1 : 0}|${text}|${sub}`;
    if (key === this.timerKey) return;
    this.timerKey = key;
    if (text === null) {
      this.top.clear(TIMER);
      return;
    }
    const icon = `<span class="k-event-ic">${iconImg(done ? 'flag-finish' : 'stopwatch', '')}</span>`;
    this.top.event({
      key: TIMER, prio: PRIO.timer, tone: done ? 'good' : undefined,
      html: `${icon}<div class="k-event-title">${done ? 'Финиш!' : 'Аквапарк'}</div><div class="k-event-sub">${escHtml(sub || 'время забега')}</div><div class="k-event-timer">${escHtml(text)}</div>`,
    });
  }

  setStats(text: string | null): void {
    const t = text ?? '';
    if (t === this.statsText) return;
    this.statsText = t;
    this.stats.textContent = t;
    this.paint();
  }
}

function el(tag: string, cls: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}

/** Текст с 🪙 — монетками кита */
function coinText(e: HTMLElement, text: string): void {
  setCoinText(e, text);
  for (const img of e.querySelectorAll('img.coin')) img.className = 'k-coin';
}

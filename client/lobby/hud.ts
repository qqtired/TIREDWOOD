// Интерфейс набережной: подсказка внизу («E — сесть», «ЛКМ / Пробел — крутить»), эмоции 1–6 (5 и 6 — вдвоём),
// приглашение на жест вдвоём, служебная строка, крупная надпись о джекпоте и секундомер аквапарка сверху. Панель примерочной — ui/wardrobe.ts,
// её кладут в root. На телефоне подсказку и приглашение можно нажать пальцем — как клавишу.
import { TOUCH } from '../touch.ts';
import { setCoinText } from '../ui/coin.ts';

const EMOTES: ReadonlyArray<readonly [string, string, string]> = [
  ['1', '👋', 'помахать'],
  ['2', '💃', 'танец'],
  ['3', '😴', 'устал'],
  ['4', '😂', 'смех'],
  ['5', '🖐', 'дай пять (тому, кто перед тобой)'],
  ['6', '🤗', 'обняться (с тем, кто перед тобой)'],
];
/** Сколько висит надпись о джекпоте */
const JACKPOT_MS = 5500;
/** Телефон: какую клавишу «нажимает» подсказка (по первой клавише в ней) */
const TAP_CODES: Record<string, string> = { E: 'KeyE', Пробел: 'Space', '🎣': 'Space', '🎰': 'Space' };

export class LobbyHud {
  /** Телефон: нажали на подсказку или приглашение — как клавишу */
  onTap: (code: string) => void = () => {};
  readonly root: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly emotes: HTMLElement;
  private readonly ask: HTMLElement;
  private readonly stats: HTMLElement;
  private readonly jackpot: HTMLElement;
  private readonly jackpotSub: HTMLElement;
  private readonly timer: HTMLElement;
  private timerKey = '';
  private jackpotTimer = 0;
  private hintKey = '';
  private statsText = '';
  private tapCode = '';
  private askCode = '';

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud lobby-hud hidden');
    this.hint = el('div', 'lh-hint');
    this.emotes = el('div', 'lh-emotes');
    this.emotes.innerHTML = EMOTES.map(([k, icon, name]) => `<span title="${name}"><kbd>${k}</kbd>${icon}</span>`).join('');
    this.ask = el('div', 'lh-ask');
    this.stats = el('div', 'stats');
    this.jackpot = el('div', 'lh-jackpot');
    this.jackpot.appendChild(el('div', 'lj-title')).textContent = 'ДЖЕКПОТ!';
    this.jackpotSub = this.jackpot.appendChild(el('div', 'lj-sub'));
    this.timer = el('div', 'lh-timer');
    this.root.append(this.hint, this.ask, this.emotes, this.stats, this.jackpot, this.timer);
    parent.appendChild(this.root);
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
    this.root.classList.toggle('hidden', !v);
  }

  /**
   * Подсказка внизу: клавиши и что будет. Пустой список клавиш — просто надпись («Доска почёта»),
   * '/' среди клавиш — разделитель. null — спрятать.
   */
  setHint(keys: readonly string[] | null, text = ''): void {
    const key = keys ? `${keys.join('|')}#${text}` : '';
    if (key === this.hintKey) return;
    this.hintKey = key;
    this.hint.classList.toggle('show', keys !== null);
    this.tapCode = TOUCH && keys ? (TAP_CODES[keys[0]] ?? '') : '';
    this.hint.classList.toggle('tap', this.tapCode !== '');
    if (!keys) return;
    this.hint.classList.toggle('info', keys.length === 0);
    // узлами, а не HTML: в подписи бывают ники, а 🪙 рисуется значком
    this.hint.textContent = '';
    for (const k of keys) {
      if (k === '/') this.hint.appendChild(el('i', '')).textContent = '/';
      else this.hint.appendChild(el('kbd', k.length > 1 ? 'wide' : '')).textContent = k;
    }
    setCoinText(this.hint.appendChild(el('span', '')), text);
  }

  showEmotes(v: boolean): void {
    this.emotes.classList.toggle('show', v);
  }

  /** Приглашение на жест вдвоём: «🖐 Ник предлагает дать пять — жми 5», полоска внизу тает за ms. */
  showAsk(icon: string, nick: string, what: string, key: string, ms: number): void {
    const a = this.ask;
    a.textContent = '';
    a.appendChild(el('span', 'la-icon')).textContent = icon;
    const text = a.appendChild(el('span', 'la-text'));
    // ник — только как текст
    text.appendChild(el('b', '')).textContent = nick;
    if (TOUCH) {
      text.append(` ${what} — нажми сюда`);
      this.askCode = `Digit${key}`;
    } else {
      text.append(` ${what} — жми`);
      a.appendChild(el('kbd', '')).textContent = key;
    }
    const bar = a.appendChild(el('i', 'la-bar'));
    bar.style.animationDuration = `${ms}ms`;
    // новое приглашение поверх старого — анимация появления заново
    a.classList.remove('show');
    void a.offsetWidth;
    a.classList.add('show');
  }

  hideAsk(): void {
    this.ask.classList.remove('show');
    this.askCode = '';
  }

  /** Крупно сверху: кто сорвал джекпот и сколько. */
  showJackpot(nick: string, win: number): void {
    // ник — только как текст
    setCoinText(this.jackpotSub, `${nick} срывает ${win.toLocaleString('ru-RU')} 🪙`);
    // заново с начала анимации, даже если прошлая надпись ещё висит
    this.jackpot.classList.remove('show');
    void this.jackpot.offsetWidth;
    this.jackpot.classList.add('show');
    clearTimeout(this.jackpotTimer);
    this.jackpotTimer = window.setTimeout(() => this.jackpot.classList.remove('show'), JACKPOT_MS);
  }

  /** Секундомер аквапарка сверху: время забега; done — финиш (время замерло, золотом), sub — строка под ним; null — спрятать. */
  setTimer(text: string | null, done = false, sub = ''): void {
    const key = text === null ? '' : `${done ? 1 : 0}|${text}|${sub}`;
    if (key === this.timerKey) return;
    this.timerKey = key;
    this.timer.classList.toggle('show', text !== null);
    this.timer.classList.toggle('done', done);
    if (text === null) return;
    this.timer.textContent = '';
    this.timer.appendChild(el('b', '')).textContent = `${done ? '🏁' : '⏱'} ${text}`;
    if (sub) this.timer.appendChild(el('span', '')).textContent = sub;
  }

  setStats(text: string | null): void {
    const t = text ?? '';
    if (t === this.statsText) return;
    this.statsText = t;
    this.stats.textContent = t;
  }
}

function el(tag: string, cls: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}

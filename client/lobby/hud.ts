// Интерфейс набережной в слотах кита (client/ui/kit/slots.ts): подсказка действия «E — сесть» внизу по центру
// (.k-prompt; нельзя — приглушена, с причиной), приглашение на жест вдвоём над ней (.k-prompt с полосой времени),
// эмоции 1–6 справа внизу (цифра над своим рисунком в компактном ряду), FPS слева вверху
// (.k-faint, по настройке), «Джекпот!» — крупным баннером по центру и секундомер аквапарка — плашкой события сверху (оба —
// через верх-центр, client/ui/kit/topcenter.ts). Панели набережной (примерочная, столы, автомат) кладут в root. На телефоне
// подсказку и приглашение можно нажать пальцем — как клавишу.
import { TOUCH } from '../touch.ts';
import { setCoinText } from '../ui/coin.ts';
import { iconImg, keyHtml, meterHtml } from '../ui/kit/dom.ts';
import type { HudSlots } from '../ui/kit/slots.ts';
import { PRIO, escHtml, type TopCenter } from '../ui/kit/topcenter.ts';

/** Телефон: какую клавишу «нажимает» подсказка (по первой клавише в ней) */
const TAP_CODES: Record<string, string> = { E: 'KeyE', Пробел: 'Space', '🎣': 'Space', '🎰': 'Space' };
const MOUSE: Record<string, string> = { ЛКМ: 'l', ПКМ: 'r' };
const TIMER = 'timer';
const JACKPOT = 'jackpot';
/** Порядок совпадает с EMOTE_KEYS/PAIR_KEYS сцены и панелью телефона */
const EMOTES = [
  ['emote', 'Помахать'], ['music', 'Танец'], ['wd-e-sleepy', 'Устал'],
  ['wd-e-happy', 'Смех'], ['emote', 'Дай пять'], ['heart', 'Обняться'],
] as const;

/** Подсказка: золотая пульсирующая (успей) и награда пилюлей за чертой */
export interface HintMore {
  urgent?: boolean;
  pill?: string;
}

export class LobbyHud {
  /** Телефон: нажали на подсказку или приглашение — как клавишу */
  onTap: (code: string) => void = () => {};
  readonly root: HTMLElement;
  private readonly top: TopCenter;
  private readonly hint: HTMLElement;
  private readonly emotes: HTMLElement;
  private readonly ask: HTMLElement;
  private readonly stats: HTMLElement;
  private visible = false;
  private hintOn = false;
  private askOn = false;
  private emotesOn = false;
  private timerKey = '';
  private hintKey = '';
  private statsText = '';
  private tapCode = '';
  private askCode = '';

  constructor(parent: HTMLElement, slots: HudSlots, top: TopCenter) {
    this.top = top;
    this.root = el('div', 'hud lobby-hud hidden');
    this.ask = el('div', 'k-prompt pz-ask');
    this.hint = el('div', 'k-prompt pz-hint');
    this.emotes = el('div', 'pz-emotes');
    this.emotes.setAttribute('role', 'group');
    this.emotes.setAttribute('aria-label', 'Эмоции');
    for (const [i, [icon, name]] of EMOTES.entries()) {
      const item = el('button', 'pz-emote');
      item.setAttribute('type', 'button');
      item.dataset.key = `Digit${i + 1}`;
      item.title = `${i + 1} — ${name}`;
      item.setAttribute('aria-label', item.title);
      item.setAttribute('aria-keyshortcuts', String(i + 1));
      item.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
      item.addEventListener('click', () => this.onTap(`Digit${i + 1}`));
      const face = i === 4 ? `${iconImg(icon)}${iconImg(icon)}` : iconImg(icon);
      item.innerHTML = `${keyHtml(String(i + 1), undefined, 'sm')}<span class="pz-emote-face${i === 4 ? ' pz-emote-five' : ''}" aria-hidden="true">${face}</span>`;
      this.emotes.appendChild(item);
    }
    this.stats = el('div', 'k-faint pz-stats');
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
      this.top.clearHero(JACKPOT);
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
   * more.urgent — золотая пульсирующая (успей: «Зажечь маяк»); more.pill — награда золотой пилюлей за чертой («🪙до 30»).
   */
  setHint(keys: readonly string[] | null, text = '', more: HintMore = {}): void {
    const key = keys ? `${keys.join('|')}#${text}#${more.urgent ? 1 : 0}#${more.pill ?? ''}` : '';
    if (key === this.hintKey) return;
    this.hintKey = key;
    this.hintOn = keys !== null;
    this.tapCode = TOUCH && keys ? (TAP_CODES[keys[0]] ?? '') : '';
    this.hint.classList.toggle('is-tap', this.tapCode !== '');
    this.paint();
    if (!keys) return;
    this.hint.classList.toggle('k-prompt--off', keys.length === 0);
    this.hint.classList.toggle('k-prompt--urgent', !!more.urgent);
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
    if (more.pill) {
      this.hint.appendChild(el('span', 'k-prompt-sep'));
      coinText(this.hint.appendChild(el('span', 'k-pill k-pill--gold k-pill--sm')), more.pill);
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

  /** Крупно по центру: кто сорвал джекпот и сколько (баннер верх-центра; свой «Уровень N!» важнее) */
  showJackpot(nick: string, win: number): void {
    this.top.hero({ key: JACKPOT, prio: PRIO.info, tone: 'gold', title: 'Джекпот!', sub: `${nick} срывает ${win.toLocaleString('ru-RU')} 🪙` });
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

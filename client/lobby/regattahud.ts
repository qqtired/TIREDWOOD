// Интерфейс гонщика «Портовой регаты» на ките 2.0 (как на странице lab/ui «Режимы» → «Регата»): регата повторяет картинг
// деталь в деталь — карточка места (верх-лево), список гонщиков под бейджем, скорость (низ-право), отсчёт по центру,
// ряд клавиш внизу, подсказки и события — тостами, круг и финиш — крупным баннером, «Не туда!» — красным баннером,
// итоги — общим окном режимов (ModeResults) с «Ещё заезд» (E) и «На площадь» (Esc). Регата живёт на набережной:
// свои части прячет сама, когда ты не в катере. В кадре трогаем только то, что поменялось.
import { TOUCH } from '../touch.ts';
import { uiIcon } from '../ui/kit/icons.ts';
import { ModeCount, ModeList, ModeResults, ModeSpeed, ModeStand, esc, keysRow, placeHtml } from '../ui/kit/modes.ts';
import type { HudSlots } from '../ui/kit/slots.ts';
import { PRIO, type TopCenter } from '../ui/kit/topcenter.ts';
import './regatta.css';

/** Тики (60 в секунду) → «1:23.45» */
export function fmtRg(ticks: number): string {
  const cs = Math.max(0, Math.round((ticks * 100) / 60));
  return `${Math.floor(cs / 6000)}:${String(Math.floor((cs % 6000) / 100)).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}

export interface RgHudRow {
  place: number;
  nick: string;
  me: boolean;
  bot: boolean;
  /** «2/3», «финиш», «сошёл» */
  info: string;
}

export interface RgResultRow {
  place: string;
  nick: string;
  bot: boolean;
  time: string;
  best: string;
  me: boolean;
  dim: boolean;
  again: boolean;
}

/** Слоты и верх-центр кита, оболочка (#hud) — для окна итогов */
export interface RgKit {
  slots: HudSlots;
  top: TopCenter;
  shell: HTMLElement;
}

/** Ключи верх-центра (свои — с префиксом rg-) */
const K_HERO = 'rg-hero';
const K_WRONG = 'rg-wrong';
const K_EV = 'rg-ev';
const K_TIP = 'rg-tip';

export class RegattaHud {
  /** Нажали «Ещё заезд» (мышью или пальцем; на клавиатуре — E) */
  onAgain: () => void = () => {};
  /** Нажали «На площадь» мышью (Esc при открытых итогах — то же, regatta.ts onKey) */
  onQuit: () => void = () => {};
  /** Окно итогов открылось / закрылось: мышь свободна, пока оно на экране */
  onResults: (open: boolean) => void = () => {};
  private readonly top: TopCenter;
  private readonly stand: ModeStand;
  private readonly list: ModeList;
  private readonly speed: ModeSpeed;
  private readonly keys: HTMLElement;
  private readonly count: ModeCount;
  private readonly results: ModeResults;
  private readonly parts: HTMLElement[];
  private on = false;
  private helpOn = false;
  private tip = '';
  private wrong = false;
  private resKey = '';
  private resMax = 0;
  private laps = 3;

  constructor(kit: RgKit) {
    this.top = kit.top;
    const { slots } = kit;
    this.stand = new ModeStand(slots.tl, 'Портовая регата', uiIcon('flag-finish'));
    this.stand.root.dataset.mode = 'regatta';
    this.list = new ModeList(slots.tr, '', 'rg-list');
    this.speed = new ModeSpeed(slots.br);
    this.keys = keysRow([['W', 'газ'], ['S', 'тормоз'], [['A', 'D'], 'руль'], ['Shift', 'занос'], ['R', 'к воротам']]);
    this.keys.classList.add('rg-keys');
    slots.bc.append(this.keys);
    this.count = new ModeCount(slots.c);
    this.results = new ModeResults(kit.shell);
    this.results.scrim.classList.add('rg-scrim');
    this.results.onAction = (id) => {
      if (id === 'again') this.onAgain();
      else if (id === 'quit') this.onQuit();
    };
    this.parts = [this.stand.root, this.list.root, this.speed.root, this.keys];
    for (const e of this.parts) {
      e.classList.add('rg-only');
      e.hidden = true;
    }
  }

  get resultsOpen(): boolean {
    return this.results.shown;
  }

  show(on: boolean): void {
    if (this.on === on) return;
    this.on = on;
    // гонщик регаты — на <html>: крупный баннер «Не туда!» держится, мелкие баннеры — поменьше (regatta.css)
    document.documentElement.toggleAttribute('data-rg', on);
    for (const e of this.parts) e.hidden = !on;
    this.keys.hidden = !(on && this.helpOn);
    if (on) return;
    this.count.set(null);
    this.top.clearHero(K_HERO);
    this.top.clearHero(K_WRONG);
    this.top.clearToasts('rg-');
    this.wrong = false;
    this.tip = '';
    this.setResults(null);
  }

  /** Слева сверху: место, круг, время гонки, лучший круг; справа снизу — скорость (км/ч). */
  setStand(place: number, total: number, lap: number, laps: number, ticks: number, best: number, kmh: number, _done: boolean): void {
    this.laps = laps;
    this.stand.set(place, total, Math.min(lap, laps), laps);
    this.stand.setTime(fmtRg(ticks));
    this.stand.setBest(best > 0 ? fmtRg(best) : '');
    this.speed.set(kmh);
  }

  /** Под бейджем: кто на каком месте. */
  setRows(rows: RgHudRow[]): void {
    this.list.set(rows.map((r) => ({ place: r.place, nick: r.nick, side: r.info, own: r.me, bot: r.bot })));
  }

  /** Отсчёт: 3, 2, 1, «Марш!»; null — убрать. */
  setCount(v: string | null): void {
    if (!v) this.count.set(null);
    else this.count.set(v, v.length > 2);
  }

  /** Круг и финиш — крупным золотым баннером по центру; старт, флажки, прыжки — тостом сверху */
  flash(text: string, gold = false, small = ''): void {
    if (/^(Последний круг|Круг \d|Финиш)/.test(text)) {
      this.top.hero({ key: K_HERO, prio: PRIO.mode, tone: 'gold', title: text, sub: small || undefined, life: 2600 });
      return;
    }
    const icon = text.startsWith('Флажки') ? 'flag-finish' : gold ? 'regatta' : 'warn';
    this.top.toast({ key: K_EV, tone: gold ? 'good' : 'warn', icon: uiIcon(icon), title: text, sub: small || undefined, life: 2200 });
  }

  /** «Не туда!» — красным крупно по центру, пока плывёшь против хода */
  setWrong(on: boolean): void {
    if (on === this.wrong) return;
    this.wrong = on;
    if (on) this.top.hero({ key: K_WRONG, prio: PRIO.mode + 5, tone: 'lose', title: 'Не туда!', sub: 'Разворачивайся', life: 600000 });
    else this.top.clearHero(K_WRONG);
  }

  /** Ряд клавиш внизу (перед стартом и на первом круге; на телефоне — нет) */
  setHelp(text: string | null): void {
    this.helpOn = !!text && !TOUCH;
    const hide = !(this.on && this.helpOn) || this.results.shown;
    if (this.keys.hidden !== hide) this.keys.hidden = hide;
  }

  /** Подсказка («Жёлтые флажки — ускорение! Проходи между ними») — тостом, один раз за посадку в катер (тает сама) */
  setTip(text: string | null): void {
    const t = text ?? '';
    if (!t || this.tip) return;
    this.tip = t;
    const cut = t.indexOf('! ');
    this.top.toast({ key: K_TIP, tone: 'good', icon: uiIcon('flag-finish'), title: cut > 0 ? t.slice(0, cut + 1) : t, sub: cut > 0 ? t.slice(cut + 2) : undefined, life: 9000 });
  }

  /**
   * Итоги: null — спрятать. foot — «На площадь через 7 с» / «Ты в деле! Новый заезд через 4 с» (строкой под таблицей
   * с полосой времени); reward — жетоны за заезд.
   */
  setResults(r: { title: string; win: boolean; sub: string; rows: RgResultRow[]; foot: string; canAgain: boolean; reward?: number } | null): void {
    if (!r) {
      if (!this.results.shown) return;
      this.results.hide();
      this.resKey = '';
      this.onResults(false);
      return;
    }
    const rows = r.rows.map((x) => ({
      own: x.me,
      dim: x.dim,
      cells: [
        placeHtml(Number(x.place) || 0),
        `<span class="k-who"><span>${esc(x.nick)}</span>${x.bot ? '<span class="k-pill k-pill--sm">бот</span>' : ''}${x.again ? '<span class="k-pill k-pill--good k-pill--sm">ещё!</span>' : ''}</span>`,
        esc(x.time),
        esc(x.best),
      ],
    }));
    const key = JSON.stringify([r.title, r.sub, rows, r.canAgain, r.reward ?? 0]);
    const opened = !this.results.shown;
    if (key !== this.resKey) {
      this.resKey = key;
      this.results.show({
        mode: 'regatta',
        eyebrow: `Портовая регата · ${this.laps} ${this.laps === 1 ? 'круг' : this.laps < 5 ? 'круга' : 'кругов'}`,
        title: r.title,
        sub: r.sub ? esc(r.sub) : undefined,
        head: ['', 'Гонщик', 'Время', 'Лучший круг'],
        rightFrom: 2,
        rows,
        reward: r.reward ? `+${r.reward} ${plural(r.reward)}` : undefined,
        actions: [
          ...(r.canAgain ? [{ id: 'again', label: 'Ещё заезд', key: 'E', tone: 'go' as const }] : []),
          { id: 'quit', label: 'На площадь', key: 'Esc', tone: 'ghost' as const },
        ],
      });
      this.keys.hidden = true;
    }
    // «через N с»: полоса — от того, сколько было, когда окно открылось
    const secs = Number(/через (\d+) с/.exec(r.foot)?.[1] ?? NaN);
    if (opened) this.resMax = 0;
    if (Number.isFinite(secs)) this.resMax = Math.max(this.resMax, secs);
    this.results.note(r.foot, Number.isFinite(secs) && this.resMax > 0 ? secs / this.resMax : null);
    if (opened) this.onResults(true);
  }
}

function plural(n: number): string {
  const d = n % 10;
  const dd = n % 100;
  return d === 1 && dd !== 11 ? 'жетон' : d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? 'жетона' : 'жетонов';
}

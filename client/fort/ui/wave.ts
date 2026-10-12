// Волна в середине общей верхней панели: заголовок и состав, справа — враги в бою или отсчёт до следующей волны.
// Карточка и круг босса приходят с сервера; знакомства и события остаются штатными тостами TopCenter ниже панели.
import { FT_BREAK, FT_END, FT_GATHER, FT_WAVE, ZK, Z_WALKER, type FortWaveCard } from '../../../shared/fort.ts';
import { TOUCH } from '../../touch.ts';
import { escHtml, type TopCenter } from '../../ui/kit/topcenter.ts';
import { fmtTime } from '../../paintball/hud.ts';
import { cardChips, foldChips, romanTier } from '../wavecard.ts';
import { el, num } from './dom.ts';
import { fortImg } from './icons.ts';
import { lastWave } from './schedule.ts';
import { EVENT_TEXT, foeIcon } from './text.ts';

const KEY = 'fort-wave';
/** Одна строка состава и в бою, и до волны; новые виды сохраняем, остальные — «+N». */
const ROSTER_KINDS = 4;
/** Тосты о новом враге, боссе и событии висят дольше обычных — их читают в передышке */
const INTRO_MS = 7000;

/** Подсказка врага: «идёт к воротам · в голову — вдвое больнее» → «идёт к воротам — в голову — вдвое больнее» */
const hintOf = (kind: number): string => (ZK[kind]?.hint ?? '').replace(/ · /g, ' — ');

export class WavePlate {
  readonly root: HTMLElement;
  private readonly top: TopCenter;
  private shown = false;
  private card: FortWaveCard | null = null;
  private html = '';
  /** Кого уже представили за это посещение (новые враги, боссы) и какие волны уже объявлены */
  private readonly met = new Set<number>();
  private announced = -1;

  constructor(top: TopCenter, parent: HTMLElement) {
    this.top = top;
    this.root = el('div', 'ft-phase', parent);
    this.root.hidden = true;
  }

  /** Карточка волны от сервера: в бою — идущая, в передышке и сборе — следующая */
  setCard(card: FortWaveCard | null): void {
    this.card = card;
  }

  /** endPlate — в итогах окно уже закрыли («Ещё раз»): плашка «Новая игра через N с» */
  update(phase: number, wave: number, leftS: number, enemies: number, endPlate = false): void {
    const fight = phase === FT_WAVE;
    const calm = phase === FT_GATHER || phase === FT_BREAK;
    if (!fight && !calm) {
      if (phase === FT_END && endPlate) this.endPlate(leftS);
      else this.hide();
      return;
    }
    const card = this.card;
    const n = Math.max(1, Math.min(lastWave(), calm ? wave + 1 : wave));
    const boss = !!card && card.boss >= 0;
    let html: string;
    if (fight) {
      const title = `Волна ${num(n)} <span class="ft-of">из ${lastWave()}</span>${card?.title ? ` · ${escHtml(card.title)}` : ''}`;
      const chips = card ? this.chips(card) : '';
      const left = enemies > 0 ? num(enemies) : '0';
      html = `<div class="ft-phase-copy"><div class="ft-phase-title">${title}</div></div>`
        + `<div class="ft-phase-clock ft-phase-left" title="Осталось врагов: ${left}">${fortImg('zombie', 'ft-left-ic')}${left}</div>`
        + `${chips ? `<div class="ft-foes">${chips}</div>` : ''}`;
    } else {
      const s = Math.max(0, Math.ceil(leftS));
      const title = `Дальше: волна ${num(n)}${card?.title ? ` · ${escHtml(card.title)}` : ''}`;
      const chips = card ? this.chips(card) : '';
      html = `<div class="ft-phase-copy"><div class="ft-phase-title">${title}</div></div>`
        + `<div class="ft-phase-clock${leftS < 5.5 ? ' is-hurry' : ''}">${fmtTime(s)}</div>`
        + `${chips ? `<div class="ft-foes">${chips}</div>` : ''}`;
    }
    if (html === this.html && this.shown) return;
    this.html = html;
    this.shown = true;
    this.root.hidden = false;
    this.root.classList.toggle('is-boss', boss);
    this.root.innerHTML = html;
  }

  /** Босс первым, все новые и крупнейшие группы; свёрнутые виды перечислены в title «+N». */
  private chips(card: FortWaveCard): string {
    const list = cardChips(card);
    const shown = foldChips(list, Math.max(ROSTER_KINDS, list.filter(c => c.cls === 'fresh').length));
    let out = '';
    if (card.boss >= 0) {
      out += `<span class="ft-chip is-boss" title="${escHtml(ZK[card.boss]?.name ?? 'Босс')}">${fortImg(foeIcon(card.boss), 'ft-chip-ic')}${card.tier > 0 ? romanTier(card.tier + 1) : ''}</span>`;
    }
    for (const c of shown) {
      if (c.cls === 'more') out += `<span class="ft-chip is-more" title="${escHtml(c.name)}">${c.label}</span>`;
      else out += `<span class="ft-chip${c.cls === 'fresh' ? ' is-new' : ''}" title="${escHtml(c.name)}">${fortImg(c.icon, 'ft-chip-ic')}×${num(c.n)}</span>`;
    }
    return out;
  }

  /**
   * Знакомство с волной (раз за волну): новые враги, босс, событие — тостами. Зовут в начале паузы перед волной
   * (карточка — уже следующая) и в начале волны (вошёл посреди игры).
   */
  announce(push: (t: { key: string; icon: string; tone: 'info' | 'warn'; title: string; sub: string; ms: number }) => void, quietFresh = false): void {
    const card = this.card;
    if (!card || card.w === this.announced) return;
    this.announced = card.w;
    for (const k of card.fresh) {
      if (this.met.has(k) || !ZK[k]) continue;
      this.met.add(k);
      // шаркуна (первая волна) не представляем; пока на экране подсказка новичку — тоже молчим (новый — золотом в ряду врагов)
      if (k === Z_WALKER || quietFresh) continue;
      push({ key: `fresh-${k}`, icon: foeIcon(k), tone: 'info', title: `Новый враг: ${ZK[k].name}`, sub: hintOf(k), ms: INTRO_MS });
    }
    if (card.boss >= 0 && !this.met.has(card.boss) && ZK[card.boss]) {
      this.met.add(card.boss);
      push({ key: 'boss-next', icon: foeIcon(card.boss), tone: 'warn', title: `Босс: ${ZK[card.boss].name}`, sub: hintOf(card.boss), ms: INTRO_MS });
    }
    const ev = EVENT_TEXT[card.event];
    if (ev) push({ key: 'event-next', icon: ev.icon, tone: 'warn', title: `Событие: ${ev.name}`, sub: ev.hint, ms: INTRO_MS });
  }

  /** Тост колокола в начале паузы: все готовы — волна раньше (в передышке ещё и +10 % золота) */
  bellToast(phase: number, mode: 'start' | 'invite' | 'ready' = 'start'): { key: string; icon: string; tone: 'info'; title: string; sub: string; ms: number } {
    if (mode !== 'start') return {
      key: 'bell', icon: 'bell', tone: 'info', ms: 6000,
      title: mode === 'ready' ? 'Ты готов к волне' : TOUCH ? 'Нажми подсказку — готов к волне' : 'Нажми E — готов к волне',
      sub: mode === 'ready' ? 'Ждём остальных защитников' : 'Подходить к колоколу не нужно',
    };
    return {
      key: 'bell', icon: 'bell', tone: 'info', ms: 6000,
      title: TOUCH ? 'Все готовы? Колокол на террасе' : 'Все готовы? E у колокола',
      sub: phase === FT_BREAK ? 'волна через 3 с · +10 % золота' : 'волна начнётся сразу',
    };
  }

  /** Итоги закрыты, новая игра — сама через N с */
  private endPlate(leftS: number): void {
    const s = Math.max(0, Math.ceil(leftS));
    const html = '<div class="ft-phase-copy"><div class="ft-phase-title">Новая игра</div></div>'
      + `<div class="ft-phase-clock${s <= 5 ? ' is-hurry' : ''}">${fmtTime(s)}</div>`;
    if (html === this.html && this.shown) return;
    this.html = html;
    this.shown = true;
    this.root.hidden = false;
    this.root.classList.remove('is-boss');
    this.root.innerHTML = html;
  }

  hide(): void {
    if (this.shown) this.top.clear(KEY);
    this.shown = false;
    this.html = '';
    this.root.hidden = true;
  }

  /** Новая игра: знакомим заново */
  newGame(): void {
    this.met.clear();
    this.announced = -1;
  }

  /** Ушли из крепости */
  reset(): void {
    this.hide();
    this.newGame();
    this.card = null;
  }
}


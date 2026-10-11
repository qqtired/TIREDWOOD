// Плашка волны «Крепости» — плашкой события верх-центра (кит: .k-event, как на странице lab/ui «Крепость»). В бою —
// одна строка «Волна 5 из 100 · Крылатки», справа «ещё 23», ниже — маленький ряд врагов картинками с числом и тонкая
// полоса. В сборе и передышке — «Дальше: волна 7 · Барон Варенья», откуда идут, отсчёт, ряд врагов (новый — золотом,
// босс — красным) и полоса времени. Кто новый, какой босс и событие волны — тостами под плашкой, раз за посещение.
import { FT_BREAK, FT_END, FT_GATHER, FT_WAVE, ZK, type FortWaveCard } from '../../../shared/fort.ts';
import { TOUCH } from '../../touch.ts';
import { PRIO, escHtml, type TopCenter } from '../../ui/kit/topcenter.ts';
import { fmtTime } from '../../paintball/hud.ts';
import { foldChips, romanTier, type CardChip } from '../wavecard.ts';
import { num } from './dom.ts';
import { fortImg } from './icons.ts';
import { lastWave } from './schedule.ts';
import { EVENT_TEXT, foeIcon, roadsText } from './text.ts';

const KEY = 'fort-wave';
/** В бою — сколько видов врагов в ряду, остальные — «+N» */
const FIGHT_KINDS = 4;
/** Тосты о новом враге, боссе и событии висят дольше обычных — их читают в передышке */
const INTRO_MS = 7000;

/** Подсказка врага: «идёт к воротам · в голову — вдвое больнее» → «идёт к воротам — в голову — вдвое больнее» */
const hintOf = (kind: number): string => (ZK[kind]?.hint ?? '').replace(/ · /g, ' — ');

export class WavePlate {
  private readonly top: TopCenter;
  private shown = false;
  private phase = -1;
  private wave = -1;
  private total = 0;
  private phaseTotal = 0;
  private card: FortWaveCard | null = null;
  private html = '';
  /** Кого уже представили за это посещение (новые враги, боссы) и какие волны уже объявлены */
  private readonly met = new Set<number>();
  private announced = -1;

  constructor(top: TopCenter) {
    this.top = top;
  }

  /** Карточка волны от сервера: в бою — идущая, в передышке и сборе — следующая */
  setCard(card: FortWaveCard | null): void {
    this.card = card;
  }

  /** endPlate — в итогах окно уже закрыли («Ещё раз»): плашка «Новая игра через N с» */
  update(phase: number, wave: number, leftS: number, enemies: number, endPlate = false): void {
    if (phase !== this.phase || wave !== this.wave) {
      this.phase = phase;
      this.wave = wave;
      this.total = 0;
      this.phaseTotal = 0;
    }
    const fight = phase === FT_WAVE;
    const calm = phase === FT_GATHER || phase === FT_BREAK;
    if (!fight && !calm) {
      if (phase === FT_END && endPlate) this.endPlate(leftS);
      else this.hide();
      return;
    }
    this.total = Math.max(this.total, enemies);
    this.phaseTotal = Math.max(this.phaseTotal, leftS);
    const card = this.card;
    const n = Math.max(1, Math.min(lastWave(), calm ? wave + 1 : wave));
    const boss = !!card && card.boss >= 0;
    let html: string;
    if (fight) {
      const title = `Волна ${num(n)} <span class="ft-of">из ${lastWave()}</span>${card?.title ? ` · ${escHtml(card.title)}` : ''}`;
      const chips = card ? this.chips(card, true) : '';
      const left = enemies > 0 ? `<small>ещё</small>${num(enemies)}` : '<small>добиваем</small>';
      const v = this.total > 0 ? Math.round((enemies / this.total) * 100) / 100 : 0;
      html = `<span class="k-event-ic">${fortImg('horn')}</span><div class="k-event-title">${title}</div>`
        + `${chips ? `<div class="k-event-sub ft-foes">${chips}</div>` : ''}`
        + `<div class="k-event-timer ft-left">${left}</div>${meterHtml(v, 'k-meter--thin k-meter--mode')}`;
    } else {
      const s = Math.max(0, Math.ceil(leftS));
      const what = phase === FT_GATHER ? 'Сбор' : 'Передышка';
      const from = card ? roadsText(card.roads, card.boats) : '';
      const title = `Дальше: волна ${num(n)}${card?.title ? ` · ${escHtml(card.title)}` : ''}`;
      const chips = card ? this.chips(card, false) : '';
      const v = this.phaseTotal > 0 ? Math.round((Math.max(0, leftS) / this.phaseTotal) * 100) / 100 : 0;
      html = `<span class="k-event-ic">${fortImg(boss ? foeIcon(card!.boss) : 'zombie')}</span><div class="k-event-title">${title}</div>`
        + `<div class="k-event-sub">${what}${from ? ` · ${from}` : ''}</div>`
        + `<div class="k-event-timer${leftS < 5.5 ? ' is-hurry' : ''}">${fmtTime(s)}</div>`
        + `${chips ? `<div class="k-event-sub ft-foes ft-foes--row">${chips}</div>` : ''}`
        + meterHtml(v, `k-meter--thin ${boss ? 'k-meter--bad' : 'k-meter--mode'}`);
    }
    if (html === this.html && this.shown) return;
    this.html = html;
    this.shown = true;
    this.top.event({ key: KEY, prio: PRIO.mode, tone: boss ? 'danger' : undefined, html });
  }

  /** Ряд врагов картинками: в бою — новые и самые многочисленные (остальные — «+N»), в паузе — все; босс — первым */
  private chips(card: FortWaveCard, fight: boolean): string {
    const list: (CardChip & { kind: number })[] = [];
    for (let i = 0; i + 1 < card.chips.length; i += 2) {
      const kind = card.chips[i];
      if (!ZK[kind]) continue;
      list.push({ kind, icon: foeIcon(kind), n: card.chips[i + 1], name: ZK[kind].name, cls: card.fresh.includes(kind) ? 'fresh' : '' });
    }
    if (card.elite > 0) list.push({ kind: -1, icon: 'level', n: card.elite, name: 'элита', cls: 'elite' });
    if (card.champ > 0) list.push({ kind: -2, icon: 'champion', n: card.champ, name: 'чемпионы', cls: 'champ' });
    const shown = fight ? foldChips(list, FIGHT_KINDS) : list;
    let out = '';
    if (card.boss >= 0 && !fight) {
      out += `<span class="ft-chip is-boss">${fortImg(foeIcon(card.boss), 'ft-chip-ic')}${card.tier > 0 ? romanTier(card.tier + 1) : 'босс'}</span>`;
    }
    for (const c of shown) {
      if (c.cls === 'more') out += `<span class="ft-chip is-more">${c.label}</span>`;
      else out += `<span class="ft-chip${c.cls === 'fresh' ? ' is-new' : ''}">${fortImg(c.icon, 'ft-chip-ic')}×${num(c.n)}</span>`;
    }
    return out;
  }

  /**
   * Знакомство с волной (раз за волну): новые враги, босс, событие — тостами. Зовут в начале паузы перед волной
   * (карточка — уже следующая) и в начале волны (вошёл посреди игры).
   */
  announce(push: (t: { key: string; icon: string; tone: 'info' | 'warn'; title: string; sub: string; ms: number }) => void): void {
    const card = this.card;
    if (!card || card.w === this.announced) return;
    this.announced = card.w;
    for (const k of card.fresh) {
      if (this.met.has(k) || !ZK[k]) continue;
      this.met.add(k);
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
  bellToast(phase: number): { key: string; icon: string; tone: 'info'; title: string; sub: string; ms: number } {
    return {
      key: 'bell', icon: 'bell', tone: 'info', ms: 6000,
      title: TOUCH ? 'Все готовы? Колокол на террасе' : 'Все готовы? E у колокола',
      sub: phase === FT_BREAK ? 'волна через 3 с · +10 % золота' : 'волна начнётся сразу',
    };
  }

  /** Итоги закрыты, новая игра — сама через N с */
  private endPlate(leftS: number): void {
    const s = Math.max(0, Math.ceil(leftS));
    const html = `<span class="k-event-ic">${fortImg('bell')}</span><div class="k-event-title">Новая игра</div>`
      + `<div class="k-event-sub">Сбор у колокола — волна 1 сразу после</div><div class="k-event-timer${s <= 5 ? ' is-hurry' : ''}">${fmtTime(s)}</div>`;
    if (html === this.html && this.shown) return;
    this.html = html;
    this.shown = true;
    this.top.event({ key: KEY, prio: PRIO.mode, html });
  }

  hide(): void {
    if (this.shown) this.top.clear(KEY);
    this.shown = false;
    this.html = '';
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
    this.phase = -1;
    this.card = null;
  }
}

function meterHtml(v: number, cls: string): string {
  return `<span class="k-meter ${cls}" style="--v:${v}"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i></span>`;
}


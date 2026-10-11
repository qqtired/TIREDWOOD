// Карточка рыбалки в верх-лево (кит UI 2.0, lab/ui «Рыбалка» → «С удочкой: ждёшь поклёвку», v2 — 292 px): уровень рыбалки
// кольцом цвета режима, опыт до следующего, следующий бонус уровня одной строкой, «Шансы сейчас» (fishodds.ts) и на острове —
// сколько видов острова поймано. Опыт за улов всплывает у кольца («+16 опыта»). Уровень игрока и жетоны — только в бейдже.
import { LEVEL_PERKS } from '../../shared/fishability.ts';
import { FISH_MAX_LEVEL, fishLevelView, type FishCastMods, type FishProgress } from '../../shared/fishprogress.ts';
import { ISLE_TOTAL } from '../../shared/islestyle.ts';
import { iconImg, meterHtml } from '../ui/kit/dom.ts';
import { el } from './fish2.ts';
import { FishOdds } from './fishodds.ts';
import './fishkit.css';

const NUM = new Intl.NumberFormat('ru-RU');
/** Новый бонус уровня горит золотом, мс */
const FRESH_MS = 8000;
const POP_MS = 1600;

export class FishModeCard {
  readonly root: HTMLElement;
  private readonly ring: HTMLElement;
  private readonly lv: HTMLElement;
  private readonly title: HTMLElement;
  private readonly xp: HTMLElement;
  private readonly perk: HTMLElement;
  private readonly odds: FishOdds;
  private readonly isle: HTMLElement;
  private readonly isleN: HTMLElement;
  private readonly isleBar: HTMLElement;
  private key = '';
  private shownLevel = -1;
  private freshUntil = 0;
  private freshTimer = 0;
  private pop: HTMLElement | null = null;

  constructor(slot: HTMLElement) {
    this.root = slot.appendChild(el('div', 'k-plate fi-mode'));
    this.root.dataset.mode = 'fishing';
    this.root.hidden = true;
    const head = this.root.appendChild(el('div', 'fi-mode-head'));
    this.ring = head.appendChild(el('span', 'k-ring k-ring--sm k-ring--mode'));
    this.lv = this.ring.appendChild(el('b', '', '0'));
    const t = head.appendChild(el('div', 'fi-mode-t'));
    this.title = t.appendChild(el('b', ''));
    this.xp = t.appendChild(el('span', ''));
    this.perk = head.appendChild(el('div', 'fi-perk'));
    this.odds = new FishOdds(this.root);
    this.isle = this.root.appendChild(el('div', 'fi-isle-row'));
    this.isle.innerHTML = `${iconImg('lighthouse', '')}<span>Виды острова</span><span></span>${meterHtml(0, 'special', 'k-meter--thin')}`;
    this.isleN = this.isle.children[2] as HTMLElement;
    this.isleBar = this.isle.querySelector<HTMLElement>('.k-meter')!;
    this.isle.hidden = true;
  }

  set shown(v: boolean) {
    if (this.root.hidden === !v) return;
    this.root.hidden = !v;
  }

  /** Уровень, опыт и следующий бонус. Уровень вырос — кольцо подпрыгивает, строка бонуса горит золотом */
  setProgress(p: Readonly<FishProgress>): void {
    const v = fishLevelView(p.xp);
    if (this.shownLevel >= 0 && v.level > this.shownLevel) {
      this.freshUntil = performance.now() + FRESH_MS;
      bump(this.ring);
      clearTimeout(this.freshTimer);
      this.freshTimer = window.setTimeout(() => { this.key = ''; this.setProgress(p); }, FRESH_MS + 50);
    }
    this.shownLevel = v.level;
    const gained = Math.max(0, v.xp - v.from);
    const need = v.next === null ? 0 : Math.max(1, v.next - v.from);
    const fresh = performance.now() < this.freshUntil;
    const key = `${v.level}|${gained}|${need}|${fresh}`;
    if (key === this.key) return;
    this.key = key;
    this.lv.textContent = String(v.level);
    this.ring.style.setProperty('--p', String(need ? Math.min(1, gained / need) : 1));
    this.title.textContent = v.level === 0 ? 'Рыбалка · новичок' : `Рыбалка · ур. ${v.level}`;
    this.xp.textContent = need ? `${NUM.format(gained)} / ${NUM.format(need)}` : `${NUM.format(v.xp)} · макс.`;
    // следующий бонус уровня; на высшем — последний полученный
    const next = LEVEL_PERKS.find((x) => x.level === v.level + 1);
    const last = LEVEL_PERKS.filter((x) => x.level <= v.level).at(-1);
    this.perk.classList.toggle('is-new', fresh);
    this.perk.innerHTML = iconImg('level', 'fi-ic');
    // текст — одним куском: длинное имя бонуса переносится на вторую строку, а не обрезается
    const line = this.perk.appendChild(el('span', ''));
    let name = '';
    if (fresh && last) {
      line.append('Новый бонус — ');
      name = last.name;
    } else if (next) {
      line.append(`На ${next.level}-м — `);
      name = next.name;
    } else if (v.level >= FISH_MAX_LEVEL && last) {
      line.append('Все бонусы: ');
      name = last.name;
    }
    if (name) line.appendChild(el('b', '', name));
  }

  /** «Шансы сейчас»: null — спрятать (не с удочкой). rain — дождь или туман острова, season — сезон, isle — пул острова */
  setOdds(mods: Readonly<FishCastMods> | null, rain = false, season = false, isle = false): void {
    this.odds.root.hidden = mods === null;
    if (mods) this.odds.set(mods, rain, season, isle);
  }

  /** Виды острова: null — не на острове */
  setIsle(n: number | null): void {
    this.isle.hidden = n === null;
    if (n === null) return;
    const text = `${n} из ${ISLE_TOTAL}`;
    if (this.isleN.textContent !== text) {
      this.isleN.textContent = text;
      this.isleBar.style.setProperty('--v', String(Math.min(1, n / ISLE_TOTAL)));
    }
  }

  /** «+16 опыта» у кольца */
  popXp(xp: number): void {
    if (!(xp > 0)) return;
    this.pop?.remove();
    const p = this.root.appendChild(el('span', 'k-pop k-pop--xp', `+${NUM.format(xp)} опыта`));
    this.pop = p;
    setTimeout(() => { if (this.pop === p) this.pop = null; p.remove(); }, POP_MS);
  }
}

function bump(e: HTMLElement): void {
  e.classList.remove('is-bump');
  void e.offsetWidth;
  e.classList.add('is-bump');
}

// Интерфейс «Fight Club»: грубый трафаретный шрифт (узкий жирный, капсом, потёртый маской шума), полоски здоровья
// и выносливости — как изолента; сверху — раунд, время и победы, соперники; по центру — большие надписи («РАУНД 2»,
// «БОЙ!», «НОКАУТ»); справа — кто кого уложил; снизу — подсказка; метка смены бобины вверху справа; итоги с жетонами;
// зрителю на телефоне — кнопки эмоций.
import { FC_HP, FC_MODE_NAME, type FcMode, type FcResultRow, type FcReward } from '../../shared/fight.ts';
import { TOUCH } from '../touch.ts';
import { canvas } from './paint.ts';
import './fight.css';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', parent?: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

/** Маска «потёртости» для трафаретных надписей: шум с дырками — data: URL (под CSP blob: нельзя) */
let noiseUrl = '';
function noiseMask(): string {
  if (noiseUrl) return noiseUrl;
  const [c, ctx] = canvas(128, 128);
  const img = ctx.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random();
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
    img.data[i + 3] = v < 0.1 ? 40 : v < 0.18 ? 150 : 255;
  }
  ctx.putImageData(img, 0, 0);
  noiseUrl = c.toDataURL('image/png');
  return noiseUrl;
}

export interface FoeView {
  id: number;
  nick: string;
  hp: number;
  st: number;
  /** Свой (напарник в 2 на 2) */
  mate: boolean;
  out: boolean;
}

interface Bar {
  root: HTMLElement;
  fill: HTMLElement;
  ghost: HTMLElement;
  last: number;
}

function tape(parent: HTMLElement, cls: string): Bar {
  const root = el('div', `fc-tape ${cls}`, parent);
  const ghost = el('i', 'fc-ghost', root);
  const fill = el('b', '', root);
  return { root, fill, ghost, last: 1 };
}

function setBar(b: Bar, k: number): void {
  const v = Math.max(0, Math.min(1, k));
  if (Math.abs(v - b.last) < 0.002) return;
  b.fill.style.width = `${(v * 100).toFixed(1)}%`;
  // «след» урона тает следом за полоской
  if (v < b.last) b.ghost.style.width = `${(b.last * 100).toFixed(1)}%`;
  b.ghost.style.transitionDelay = v < b.last ? '0.25s' : '0s';
  requestAnimationFrame(() => {
    b.ghost.style.width = `${(v * 100).toFixed(1)}%`;
  });
  b.last = v;
}

export class FightHud {
  readonly root: HTMLElement;
  /** Зритель нажал эмоцию (телефон) */
  onEmote: (k: number) => void = () => {};
  private readonly top: HTMLElement;
  private readonly sideA: HTMLElement;
  private readonly sideB: HTMLElement;
  private readonly mid: HTMLElement;
  private readonly foes: HTMLElement;
  private readonly me: HTMLElement;
  private readonly meHp: Bar;
  private readonly meSt: Bar;
  private readonly meNum: HTMLElement;
  private readonly chips: HTMLElement;
  private readonly center: HTMLElement;
  private readonly centerBig: HTMLElement;
  private readonly centerSub: HTMLElement;
  private readonly feedEl: HTMLElement;
  private readonly hintEl: HTMLElement;
  private readonly reelEl: HTMLElement;
  private readonly zoneEl: HTMLElement;
  private readonly hurtEl: HTMLElement;
  private readonly results: HTMLElement;
  private readonly emo: HTMLElement;
  private readonly stats: HTMLElement;
  private centerUntil = 0;
  private foeKey = '';
  private readonly foeBars = new Map<number, { row: HTMLElement; hp: Bar; st: Bar | null }>();
  private topKey = '';
  private hintKey = '';
  private chipKey = '';

  constructor(parent: HTMLElement) {
    const root = (this.root = el('div', 'hud fc-hud hidden', parent));
    root.style.setProperty('--fc-noise', `url(${noiseMask()})`);
    this.top = el('div', 'fc-top', root);
    this.sideA = el('div', 'fc-side a fc-st', this.top);
    this.mid = el('div', 'fc-mid fc-st', this.top);
    this.sideB = el('div', 'fc-side b fc-st', this.top);
    this.zoneEl = el('div', 'fc-zone fc-st', root, 'СВЕТ ГАСНЕТ');
    this.foes = el('div', 'fc-foes', root);
    this.me = el('div', 'fc-me', root);
    const head = el('div', 'fc-me-head', this.me);
    el('span', 'fc-st', head, 'ТЫ');
    this.meNum = el('span', 'fc-me-num', head);
    this.meHp = tape(this.me, 'hp');
    this.meSt = tape(this.me, 'st');
    this.chips = el('div', 'fc-chips', this.me);
    this.center = el('div', 'fc-center', root);
    this.centerBig = el('div', 'fc-big fc-st', this.center);
    this.centerSub = el('div', 'fc-sub', this.center);
    this.feedEl = el('div', 'fc-feed', root);
    this.hintEl = el('div', 'fc-hint', root);
    this.reelEl = el('div', 'fc-reel', root);
    this.hurtEl = el('div', 'fc-hurt', root);
    this.results = el('div', 'fc-results', root);
    this.emo = el('div', 'fc-emo', root);
    ['👋', '💃', '😴', '😂', '👏', '😡'].forEach((icon, i) => {
      const b = el('button', '', this.emo, icon);
      b.addEventListener('click', () => this.onEmote(i + 1));
    });
    this.stats = el('div', 'fc-stats', root);
  }

  setVisible(v: boolean): void {
    this.root.classList.toggle('hidden', !v);
    if (!v) {
      this.hideResults();
      this.feedEl.textContent = '';
      this.center.classList.remove('show');
    }
  }

  /** Полоса сверху: раунд и время; по бокам — победы (дуэль, команды) или сколько стоят (свалка). */
  setTop(mode: FcMode, round: number, wins: readonly number[], left: number | null, names: readonly [string, string], alive: number, myTeam: number): void {
    const t = left === null ? '' : ` · ${fmt(left)}`;
    const mid = mode === 'ffa' ? `${FC_MODE_NAME.ffa.toUpperCase()}${t}` : `РАУНД ${Math.max(1, round)}${t}`;
    const pips = (n: number) => '●'.repeat(Math.min(2, n)) + '○'.repeat(Math.max(0, 2 - n));
    const a = mode === 'ffa' ? `СТОЯТ: ${alive}` : `${names[0]} ${pips(wins[0] ?? 0)}`;
    const b = mode === 'ffa' ? '' : `${pips(wins[1] ?? 0)} ${names[1]}`;
    const key = `${mid}|${a}|${b}|${myTeam}`;
    if (key === this.topKey) return;
    this.topKey = key;
    this.mid.textContent = mid;
    this.sideA.textContent = a;
    this.sideB.textContent = b;
    this.sideA.classList.toggle('mine', myTeam === 0);
    this.sideB.classList.toggle('mine', myTeam === 1);
  }

  /** Свои полоски: здоровье (из 100), выносливость (0…1); null — я не дерусь (зритель). */
  setMe(hp: number | null, st: number, winded: boolean, dark: boolean): void {
    this.me.classList.toggle('show', hp !== null);
    if (hp === null) return;
    setBar(this.meHp, hp / FC_HP);
    setBar(this.meSt, st);
    this.meNum.textContent = String(Math.ceil(hp));
    this.meHp.root.classList.toggle('low', hp <= 30);
    const key = `${winded}|${dark}`;
    if (key === this.chipKey) return;
    this.chipKey = key;
    this.chips.textContent = '';
    if (winded) el('span', 'fc-chip', this.chips, 'ЗАПЫХАЛСЯ');
    if (dark) el('span', 'fc-chip dark', this.chips, 'ТЕМНОТА ЖЖЁТ — К СВЕТУ');
  }

  /** Соперники и напарник: полоски сверху. */
  setFoes(list: readonly FoeView[]): void {
    const key = list.map((f) => `${f.id}:${f.nick}:${f.mate}`).join(',');
    if (key !== this.foeKey) {
      this.foeKey = key;
      this.foes.textContent = '';
      this.foeBars.clear();
      this.foes.classList.toggle('many', list.length > 3);
      for (const f of list) {
        const row = el('div', `fc-foe${f.mate ? ' mate' : ''}`, this.foes);
        el('span', 'fc-foe-name', row, f.nick);
        const hp = tape(row, 'hp');
        const st = list.length > 3 ? null : tape(row, 'st thin');
        this.foeBars.set(f.id, { row, hp, st });
      }
    }
    for (const f of list) {
      const b = this.foeBars.get(f.id);
      if (!b) continue;
      setBar(b.hp, f.hp / FC_HP);
      if (b.st) setBar(b.st, f.st);
      b.row.classList.toggle('out', f.out);
    }
  }

  /** Большая надпись по центру на ms миллисекунд. */
  centerText(big: string, sub = '', ms = 1600, kind = ''): void {
    this.centerBig.textContent = big;
    this.centerSub.textContent = sub;
    this.center.className = `fc-center show ${kind}`;
    // перезапуск анимации появления
    void this.center.offsetWidth;
    this.center.classList.add('pop');
    this.centerUntil = performance.now() + ms;
  }

  feed(text: string): void {
    const line = el('div', 'fc-line', this.feedEl, text);
    while (this.feedEl.children.length > 4) this.feedEl.firstElementChild?.remove();
    setTimeout(() => line.classList.add('gone'), 4500);
    setTimeout(() => line.remove(), 5200);
  }

  hint(text: string | null): void {
    const key = text ?? '';
    if (key === this.hintKey) return;
    this.hintKey = key;
    this.hintEl.textContent = key;
    this.hintEl.classList.toggle('show', key !== '');
  }

  /** Метка смены бобины: маленький круг вверху справа на долю секунды. */
  reel(): void {
    this.reelEl.classList.remove('on');
    void this.reelEl.offsetWidth;
    this.reelEl.classList.add('on');
  }

  zoneWarn(on: boolean): void {
    this.zoneEl.classList.toggle('show', on);
  }

  /** Получил удар: красноватые края экрана. */
  hurt(k: number): void {
    this.hurtEl.style.setProperty('--k', String(Math.min(1, k)));
    this.hurtEl.classList.remove('on');
    void this.hurtEl.offsetWidth;
    this.hurtEl.classList.add('on');
  }

  showSpectatorEmotes(on: boolean): void {
    this.emo.classList.toggle('show', on && TOUCH);
  }

  /** Итоги: таблица мест, свои жетоны (reward), «все наверх через …». */
  showResults(mode: FcMode, rows: readonly FcResultRow[], myId: number, reward: FcReward | null, title: string): void {
    const r = this.results;
    r.textContent = '';
    el('div', 'fc-res-title fc-st', r, title);
    el('div', 'fc-res-mode', r, FC_MODE_NAME[mode]);
    const table = el('table', 'fc-res-table', r);
    const head = el('tr', '', table);
    for (const h of ['', 'КТО', 'НОКАУТЫ', 'УРОН', '🪙']) el('th', '', head, h);
    for (const row of rows) {
      const tr = el('tr', row.id === myId ? 'me' : '', table);
      el('td', 'place', tr, row.place > 0 ? (row.won ? '🏆' : `${row.place}`) : '—');
      el('td', 'nick', tr, row.bot ? `${row.nick} 🤖` : row.nick);
      el('td', '', tr, String(row.kos));
      el('td', '', tr, String(row.dmg));
      el('td', '', tr, row.bot ? '' : row.tokens > 0 ? `+${row.tokens}` : '—');
    }
    if (reward) {
      const parts = [`бой +${reward.fight}`];
      if (reward.win) parts.push(`${mode === 'ffa' ? 'место' : 'победа'} +${reward.win}`);
      if (reward.kos) parts.push(`нокауты +${reward.kos}`);
      el('div', 'fc-res-reward', r, `+${reward.total} 🪙 · ${parts.join(' · ')}`);
    }
    el('div', 'fc-res-foot', r, 'О клубе — никому. Через несколько секунд — наверх.');
    r.classList.add('show');
  }

  hideResults(): void {
    this.results.classList.remove('show');
  }

  setStats(text: string | null): void {
    this.stats.textContent = text ?? '';
  }

  /** Раз в кадр: убрать надпись по центру, когда её время вышло. */
  tick(): void {
    if (this.centerUntil && performance.now() > this.centerUntil) {
      this.centerUntil = 0;
      this.center.classList.remove('show', 'pop');
    }
  }
}

function fmt(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

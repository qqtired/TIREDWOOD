// «Набег пиратов»: интерфейс защитника (DOM поверх игры) — плашка «Пираты на горизонте!» с отсчётом, панель набега
// (прочность корабля, добыча на причале, украдено из предела, волна, время), прицел (кружок цвета краски; у пушки —
// прицел с перезарядкой), отметка попадания, стрелки к угрозам за краем экрана, кнопка «Огонь» на телефоне и карточка
// итогов. В кадре меняем только то, что поменялось.
import { PIRATE_WAVES, paintOf, type PirateView } from '../../shared/pirates.ts';
import './pirates.css';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent.appendChild(e);
  return e;
}

const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;
const mmss = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export type ArrowKind = 'thief' | 'pirate' | 'boat' | 'loot';
export interface ArrowSpec { kind: ArrowKind; x: number; y: number; angle: number; label: string }
export type ReticleMode = 'off' | 'marker' | 'cannon';
export interface ReticleSpec { mode: ReticleMode; slot: number; text: string; state: 'good' | 'wait' | 'bad' | 'none' }

const ARROWS = 8;

export class PirateHud {
  readonly root: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly bannerT: HTMLElement;
  private readonly bannerS: HTMLElement;
  private readonly bannerH: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly wave: HTMLElement;
  private readonly time: HTMLElement;
  private readonly shipFill: HTMLElement;
  private readonly shipVal: HTMLElement;
  private readonly have: HTMLElement;
  private readonly slots: HTMLElement[] = [];
  private readonly stolenVal: HTMLElement;
  private readonly ret: HTMLElement;
  private readonly retTxt: HTMLElement;
  private readonly hit: HTMLElement;
  private readonly arrows: HTMLElement[] = [];
  private readonly arrowLab: HTMLElement[] = [];
  private readonly fire: HTMLButtonElement;
  private readonly result: HTMLElement;
  private readonly cache = new Map<HTMLElement, string>();
  private lastId = '';
  private lastWave = 0;
  private bannerUntil = 0;
  private kickT = 0;
  private resultFor = '';

  constructor(parent: HTMLElement, hooks: { fire(down: boolean): void }) {
    this.root = el('div', 'pr-hud', parent);
    this.root.hidden = true;
    this.banner = el('div', 'pr-banner', this.root);
    this.bannerT = el('div', 'pr-banner-t', this.banner);
    this.bannerS = el('div', 'pr-banner-s', this.banner);
    this.bannerH = el('div', 'pr-banner-h', this.banner);
    this.panel = el('div', 'pr-panel', this.root);
    const head = el('div', 'pr-head', this.panel);
    el('span', 'pr-title', head, '🏴‍☠️ Набег пиратов');
    this.wave = el('span', 'pr-wave', head);
    this.time = el('span', 'pr-time', head);
    const ship = el('div', 'pr-row', this.panel);
    el('span', 'pr-lab', ship, 'Корабль');
    const bar = el('div', 'pr-bar', ship);
    this.shipFill = el('i', 'pr-fill', bar);
    this.shipVal = el('b', 'pr-val', ship);
    const loot = el('div', 'pr-row', this.panel);
    el('span', 'pr-lab', loot, 'Ящики');
    this.have = el('span', 'pr-have', loot);
    el('span', 'pr-sub', loot, 'на причале · украдено');
    const slots = el('span', 'pr-slots', loot);
    for (let i = 0; i < 6; i++) this.slots.push(el('i', '', slots));
    this.stolenVal = el('b', 'pr-val', loot);
    this.ret = el('div', 'pr-ret', this.root);
    el('div', 'pr-ret-ring', this.ret);
    el('div', 'pr-ret-dot', this.ret);
    this.retTxt = el('div', 'pr-ret-txt', this.ret);
    this.hit = el('div', 'pr-hit', this.root);
    for (let i = 0; i < ARROWS; i++) {
      const a = el('div', 'pr-arrow', this.root);
      this.arrowLab.push(el('i', '', a));
      this.arrows.push(a);
    }
    this.fire = el('button', 'pr-fire', this.root, 'Огонь');
    this.fire.type = 'button';
    const press = (down: boolean) => (e: Event) => { e.preventDefault(); this.fire.classList.toggle('down', down); hooks.fire(down); };
    this.fire.addEventListener('pointerdown', press(true));
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) this.fire.addEventListener(ev, press(false));
    this.result = el('div', 'pr-result', this.root);
  }

  private text(e: HTMLElement, s: string): void {
    if (this.cache.get(e) === s) return;
    this.cache.set(e, s);
    e.textContent = s;
  }
  private cls(e: HTMLElement, name: string, on: boolean): void { e.classList.toggle(name, on); }

  /** Плашка, панель и итоги; show — защитник на набережной и видит события */
  update(v: PirateView, tick: number, show: boolean, inTransit: number, touch: boolean): void {
    const live = show && v.phase !== 'idle';
    this.root.hidden = !live && !this.resultFor;
    if (!live) { this.hideAll(); return; }
    if (v.id !== this.lastId) { this.lastId = v.id; this.lastWave = 0; this.bannerUntil = 0; this.resultFor = ''; this.result.classList.remove('show'); }
    const secs = Math.max(0, Math.ceil((v.end - tick) / 60));
    // в набеге панель занимает верх экрана: плашка волны — под ней
    this.cls(this.root, 'raid', v.phase === 'raid' || v.phase === 'end');
    // плашка
    if (v.phase === 'warn') {
      this.bannerUntil = tick + 60;
      this.text(this.bannerT, 'Пираты на горизонте!');
      this.text(this.bannerS, `Высадка через ${secs} с`);
      this.bannerH.replaceChildren();
      const parts: Array<[string, string]> = touch
        ? [['Огонь', ' — краска по ворам'], ['У пушки', ' — ядром по шлюпкам'], ['Коснись', ' брошенного ящика — спасёшь']]
        : [['ЛКМ', ' — краска по ворам'], ['У пушки ЛКМ', ' — ядром по шлюпкам'], ['Коснись', ' брошенного ящика — спасёшь']];
      for (const [i, [b, t]] of parts.entries()) {
        if (i) this.bannerH.append(' · ');
        this.bannerH.append(Object.assign(document.createElement('b'), { textContent: b }), t);
      }
    } else if (v.phase === 'raid') {
      if (v.wave !== this.lastWave) {
        this.lastWave = v.wave;
        this.bannerUntil = tick + (v.wave === 1 ? 4.2 : 3) * 60;
        this.text(this.bannerT, v.wave >= PIRATE_WAVES ? 'Последняя волна!' : v.wave === 1 ? 'Высадка!' : `Волна ${v.wave} из ${v.waves}`);
        this.text(this.bannerS, v.wave >= PIRATE_WAVES ? 'С ними капитан — красьте крепче' : 'Шлюпки идут к причалам — смотри на кольца');
        this.bannerH.replaceChildren();
      }
    }
    this.cls(this.banner, 'show', tick < this.bannerUntil && v.phase !== 'end');
    // панель
    this.cls(this.panel, 'show', v.phase === 'raid'); // в конце всё то же — в карточке итогов
    if (v.phase === 'raid' || v.phase === 'end') {
      this.text(this.wave, `волна ${Math.max(1, v.wave)}/${v.waves}`);
      this.text(this.time, v.phase === 'raid' ? mmss(secs) : '');
      const hp = Math.max(0, v.hp), pct = v.hpMax > 0 ? hp / v.hpMax : 0;
      this.shipFill.style.width = `${Math.round(pct * 100)}%`;
      this.cls(this.shipFill, 'low', pct <= 0.34);
      this.text(this.shipVal, `${hp}/${v.hpMax}`);
      this.text(this.have, String(v.left));
      for (let i = 0; i < this.slots.length; i++) {
        this.cls(this.slots[i], 'on', i < v.stolen);
        this.cls(this.slots[i], 'warn', i >= v.stolen && i < v.stolen + Math.min(inTransit, 6 - v.stolen));
      }
      this.text(this.stolenVal, `${Math.min(v.stolen, v.limit)}/${v.limit}`);
    }
    this.fire.classList.toggle('show', touch && v.phase === 'raid');
    // итоги
    if (v.phase === 'end') this.showResult(v);
    else if (this.resultFor) { this.result.classList.remove('show'); this.resultFor = ''; }
  }

  private hideAll(): void {
    for (const e of [this.banner, this.panel, this.ret, this.fire, this.result]) e.classList.remove('show');
    for (const a of this.arrows) a.classList.remove('show');
    this.resultFor = '';
  }

  private showResult(v: PirateView): void {
    if (this.resultFor === v.id) return;
    this.resultFor = v.id;
    const r = this.result;
    r.replaceChildren();
    r.classList.toggle('lose', !v.win);
    el('div', 'pr-result-t', r, v.win ? 'Набег отбит!' : 'Пираты ушли с добычей');
    el('div', 'pr-result-s', r, v.win ? `Украдено ${v.stolen} из ${v.total}. Корабль уходит ни с чем.` : `Украдено ${v.stolen} из ${v.total}. В следующий раз получится!`);
    if (v.results.length) {
      const t = el('table', 'pr-table', r);
      const h = el('tr', '', t);
      for (const s of ['Защитник', 'Пираты', 'Шлюпки', 'Корабль', 'Ящики', 'Жетоны']) el('th', '', h, s);
      for (const row of v.results) {
        const tr = el('tr', row.pid === this.mePid ? 'me' : '', t);
        el('td', '', tr, `${row.mvp ? '★ ' : ''}${row.nick}`);
        el('td', '', tr, String(row.kos));
        el('td', '', tr, String(row.sinks));
        el('td', '', tr, String(row.hits));
        el('td', '', tr, String(row.saves));
        el('b', '', el('td', '', tr), `+${row.tokens}`);
      }
      const mine = v.results.find(x => x.pid === this.mePid);
      if (mine) el('div', 'pr-result-me', r, `Тебе: +${mine.tokens} 🪙${mine.mvp ? ' · лучший защитник' : ''}`);
    } else el('div', 'pr-result-n', r, 'Никто не защищал — наград нет. Красьте воров ЛКМ и топите шлюпки из пушек!');
    requestAnimationFrame(() => r.classList.add('show'));
  }

  /** Свой pid — подсветить себя в таблице */
  mePid = 0;

  /** Прицел: маркер / пушка / нет */
  reticle(s: ReticleSpec, dt: number): void {
    const on = s.mode !== 'off';
    this.cls(this.ret, 'show', on);
    this.cls(this.ret, 'cannon', s.mode === 'cannon');
    for (const k of ['good', 'wait', 'bad'] as const) this.cls(this.ret, k, s.state === k && s.mode === 'cannon');
    if (on) this.ret.style.setProperty('--pr-c', s.mode === 'marker' ? hex(paintOf(s.slot)) : '#fff3de');
    this.text(this.retTxt, s.text);
    if (this.kickT > 0) { this.kickT -= dt; if (this.kickT <= 0) this.ret.classList.remove('kick'); }
  }

  /** Выстрел маркером: прицел вздрагивает */
  kick(): void { this.kickT = 0.1; this.ret.classList.add('kick'); }

  /** Отметка попадания: крестик; ko — большой золотой */
  hitmark(ko: boolean): void {
    const h = this.hit;
    h.classList.remove('on', 'ko');
    void h.offsetWidth;
    h.classList.toggle('ko', ko);
    h.classList.add('on');
  }

  /** Стрелки к угрозам: список (не больше ARROWS), остальные прячутся */
  setArrows(list: readonly ArrowSpec[]): void {
    for (let i = 0; i < this.arrows.length; i++) {
      const a = this.arrows[i], s = list[i];
      if (!s) { a.classList.remove('show'); continue; }
      a.className = `pr-arrow show ${s.kind}`;
      a.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) rotate(${s.angle.toFixed(3)}rad)`;
      this.text(this.arrowLab[i], s.label);
      // подпись не вращаем вместе со стрелкой
      this.arrowLab[i].style.transform = `rotate(${(-s.angle).toFixed(3)}rad)`;
    }
  }

  /** Размер области для стрелок, px */
  get width(): number { return this.root.clientWidth || window.innerWidth; }
  get height(): number { return this.root.clientHeight || window.innerHeight; }

  dispose(): void { this.root.remove(); }
}

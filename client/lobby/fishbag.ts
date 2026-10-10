// Окно рюкзака (fisheco, клавиша I или значок 🎒): улов по цене поимки, сколько мест, что за множители. Продать — у
// Семёна или Сани; здесь рыбу можно только отпустить (место освобождается, денег нет) — спасает, когда идти далеко.
import { FISH } from '../../shared/fishing.ts';
import { bagSlots, bagValue, emptyFishProgress, type FishProgress } from '../../shared/fishprogress.ts';
import { fmtCatch } from '../../shared/fishrules.ts';
import { livewellCap, livewellOf } from '../../shared/fishlivewell.ts';
import type { BagFish } from '../../shared/fishprogress.ts';
import type { ClientMsg } from '../../shared/messages.ts';
import { setCoinText } from '../ui/coin.ts';
import { el, fishPic, tierOf } from './fish2.ts';
import { bagMarks, num } from './fishfmt.ts';
import './fisheco.css';
// плашка «рыба в руках» и кнопка «Взять в руки» (client/lobby/fishhold.ts)
import './fishhold.css';

export class FishBag {
  onClose: () => void = () => {};
  private readonly root: HTMLDialogElement;
  private readonly head: HTMLElement;
  private readonly list: HTMLElement;
  /** Лайвел своей лодки (флаг ISLE, shared/fishlivewell.ts): рюкзак полон — рыба там; виден, если есть лодка или рыба в нём */
  private readonly wellHead: HTMLElement;
  private readonly well: HTMLElement;
  private readonly send: (msg: ClientMsg) => void;
  private progress = emptyFishProgress();
  /** Рыба, которую спросили «точно отпустить?» */
  private ask = -1;
  /** Рыба в руках (номер в рюкзаке, −1 — руки пустые): «Взять в руки» — желейка держит её, видят все (fishhold.ts) */
  private held = -1;

  constructor(parent: HTMLElement, send: (msg: ClientMsg) => void) {
    this.send = send;
    this.root = el('dialog', 'fe-bag');
    this.root.setAttribute('aria-labelledby', 'fish-bag-title');
    const top = this.root.appendChild(el('div', 'fe-bag-top'));
    this.head = top.appendChild(el('h2', ''));
    this.head.id = 'fish-bag-title';
    const x = top.appendChild(el('button', 'fn-close', '×'));
    x.type = 'button';
    x.title = 'Закрыть · Esc или I';
    x.setAttribute('aria-label', 'Закрыть рюкзак');
    x.addEventListener('click', () => this.close());
    this.list = this.root.appendChild(el('div', 'fe-sell'));
    this.wellHead = this.root.appendChild(el('h3', 'fe-well-h'));
    this.well = this.root.appendChild(el('div', 'fe-sell'));
    this.root.appendChild(el('p', 'fn-fine fe-bag-note', 'Продать улов — Деду Семёну на пристани или Сане на баркасе. Отпустить можно здесь: место освободится, денег не будет. Рюкзак побольше — в лавке.'));
    this.root.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Escape' || e.code === 'KeyI') { e.preventDefault(); this.close(); }
    });
    this.root.addEventListener('keyup', (e) => e.stopPropagation());
    this.root.addEventListener('cancel', (e) => { e.preventDefault(); this.close(); });
    this.root.addEventListener('click', (e) => { if (e.target === this.root) this.close(); });
    parent.appendChild(this.root);
  }

  get isOpen(): boolean { return this.root.open; }

  open(progress: FishProgress): void {
    this.progress = progress;
    this.ask = -1;
    this.render();
    if (!this.root.open) this.root.showModal();
  }

  set(progress: FishProgress): void {
    this.progress = progress;
    if (this.isOpen) this.render();
  }

  /** Сервер: какую рыбу держишь в руках (−1 — никакую) */
  setHeld(n: number): void {
    if (n === this.held) return;
    this.held = n;
    if (this.isOpen) this.render();
  }

  close(): void {
    if (!this.root.open) return;
    this.root.close();
    this.onClose();
  }

  private render(): void {
    const p = this.progress;
    setCoinText(this.head, `🎒 Рюкзак · ${p.bag.length} из ${bagSlots(p)} · ${num(bagValue(p.bag))} 🪙`);
    const well = livewellOf(p);
    const cap = livewellCap(p);
    const showWell = cap > 0 || well.length > 0;
    this.wellHead.hidden = this.well.hidden = !showWell;
    if (showWell) {
      setCoinText(this.wellHead, `🛶 Лайвел лодки · ${well.length} из ${cap} · ${num(bagValue(well))} 🪙`);
      this.well.replaceChildren(...(well.length ? well.map((f) => this.row(f, false))
        : [el('p', 'fe-empty', 'Лайвел пуст. Рюкзак полон — рыба ложится сюда, продать — у скупщика или из меню лодки.')]));
    }
    if (!p.bag.length) {
      this.list.replaceChildren(el('p', 'fe-empty', 'Рюкзак пуст. Пойманная рыба ложится сюда по цене поимки.'));
      return;
    }
    this.list.replaceChildren(...p.bag.map((f) => this.row(f, true)));
  }

  /** Строка рыбы: в рюкзаке её можно взять в руки, отпустить — и из рюкзака, и из лайвела */
  private row(f: BagFish, hold: boolean): HTMLElement {
    const sp = FISH.findIndex((x) => x.id === f.f);
    const t = tierOf(sp);
    const row = el('div', 'fe-row');
    row.style.setProperty('--tc', t.css);
    row.appendChild(fishPic(sp, 'fe-row-pic'));
    const info = row.appendChild(el('div', 'fe-row-info'));
    info.appendChild(el('b', '', FISH[sp]?.name ?? f.f));
    info.appendChild(el('span', '', `${t.name} · ${fmtCatch(f.g)}`));
    const marks = bagMarks(f.m, f.f);
    if (marks.length) info.appendChild(el('span', 'fe-marks', marks.join(' · ')));
    setCoinText(row.appendChild(el('div', 'fe-row-price')), `${num(f.p)} 🪙`);
    if (hold) {
      const inHands = this.held === f.n;
      const h = row.appendChild(el('button', inHands ? 'fn-action fe-hold on' : 'fn-action fe-hold', inHands ? 'Убрать' : 'Взять в руки'));
      h.type = 'button';
      h.title = inHands ? 'Убрать рыбу из рук' : 'Желейка возьмёт рыбу в руки — похвастаться или сфотографироваться у маяка';
      h.addEventListener('click', () => {
        this.send({ t: 'fishHold', n: inHands ? -1 : f.n });
        // взял — окно закрывается: сразу видно рыбу в руках
        if (!inHands) this.close();
      });
    }
    const asking = this.ask === f.n;
    const b = row.appendChild(el('button', asking ? 'fn-action fe-warn' : 'fn-action fn-dismiss', asking ? 'Точно отпустить?' : 'Отпустить'));
    b.type = 'button';
    b.addEventListener('click', () => {
      if (this.ask !== f.n) { this.ask = f.n; this.render(); return; }
      this.ask = -1;
      this.send({ t: 'fishBag', a: 'release', n: f.n });
    });
    return row;
  }
}

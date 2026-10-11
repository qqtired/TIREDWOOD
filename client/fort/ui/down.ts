// «Тебя повалили!» (как на странице lab/ui «Крепость»): по центру крупно — почему повалили (картинка того, кто
// достал) и под ним плашка «Снова в бой через 3,4 с» с полосой и «встанешь на террасе». Своё место в слое HUD кита,
// чуть ниже места крупных баннеров — баннер волны не закрывает его.
import { FORT_RESPAWN_TICKS } from '../../../shared/fort.ts';
import { TICK_RATE } from '../../../shared/constants.ts';
import { el, setText } from './dom.ts';
import { fortImg } from './icons.ts';
import { foeIcon, sec1 } from './text.ts';

const TOTAL_S = FORT_RESPAWN_TICKS / TICK_RATE;

export class DownBlock {
  readonly root: HTMLElement;
  private readonly sub: HTMLElement;
  private readonly time: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly note: HTMLElement;
  private shown = false;
  private last = '';

  /** layer — слой HUD кита (.k-hud): блок — своим слотом по центру */
  constructor(layer: HTMLElement) {
    this.root = el('div', 'k-slot k-slot--c ft-down', layer);
    this.root.dataset.mode = 'fort';
    this.root.hidden = true;
    const hero = el('div', 'k-hero k-hero--lose', this.root);
    el('p', 'k-hero-title is-sm', hero, 'Тебя повалили!');
    this.sub = el('span', 'k-hero-sub', hero);
    const plate = el('div', 'k-plate ft-respawn', this.root);
    el('span', '', plate, 'Снова в бой через');
    this.time = el('b', '', plate);
    this.bar = el('span', 'k-meter k-meter--good', plate);
    this.bar.innerHTML = '<i class="k-meter-ghost"></i><i class="k-meter-fill"></i>';
    this.note = el('span', 'ft-sub', plate, 'встанешь на террасе');
  }

  /** text — почему повалили; kind — вид врага (картинка), −1 — без картинки */
  show(text: string, kind = -1): void {
    this.sub.innerHTML = kind >= 0 ? fortImg(foeIcon(kind), 'k-ic') : fortImg('warn', 'k-ic');
    this.sub.appendChild(document.createTextNode(text));
    if (!this.shown) {
      this.last = '';
      setText(this.time, '');
      this.bar.style.setProperty('--v', '0');
    }
    this.root.hidden = false;
    this.shown = true;
    const hero = this.root.firstElementChild as HTMLElement;
    hero.classList.remove('is-pop');
    void hero.offsetWidth;
    hero.classList.add('is-pop');
  }

  /** Сколько ждать, с */
  setRespawn(sec: number): void {
    if (!this.shown) return;
    const t = sec > 0 ? `${sec1(sec)} с` : 'встаём…';
    if (t === this.last) return;
    this.last = t;
    setText(this.time, t);
    this.bar.style.setProperty('--v', (1 - Math.max(0, Math.min(1, sec / TOTAL_S))).toFixed(3));
    setText(this.note, 'встанешь на террасе');
  }

  hide(): void {
    this.shown = false;
    this.root.hidden = true;
    this.last = '';
  }
}

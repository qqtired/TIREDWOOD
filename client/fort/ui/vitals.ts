// Низ «Крепости» (кит: kit/combat.css, как на странице lab/ui «Крепость»): панель бойца отдельными блоками на своих
// подложках — здоровье, оружие по ячейкам (1 маркер, 2 второй ствол, G граната со счётчиком), патроны с R, рывок
// пилюлей с Shift; над ней — одна подсказка действия .k-prompt («E Лавка оружейника | прокачка…», «W Наверх, на стену»,
// «кликни — обратно в бой»). Прицел .k-cross — по центру экрана, без масштаба HUD (раствор — разброс ствола).
import { TOUCH } from '../../touch.ts';
import { el, num, setText } from './dom.ts';
import { fortImg } from './icons.ts';
import { capFirst } from './text.ts';

const meter = '<i class="k-meter-ghost"></i><i class="k-meter-fill"></i>';

function setMeter(m: HTMLElement, v: number, g = v): void {
  m.style.setProperty('--v', v.toFixed(3));
  m.style.setProperty('--g', g.toFixed(3));
}

interface Arm {
  root: HTMLElement;
  img: HTMLElement;
  label: HTMLElement;
}

export class FortVitals {
  readonly root: HTMLElement;
  private readonly hpBox: HTMLElement;
  private readonly hpNum: HTMLElement;
  private readonly hpBar: HTMLElement;
  private readonly marker: Arm;
  private readonly heavy: Arm;
  readonly gren: Arm;
  private readonly ammoBox: HTMLElement;
  private readonly ammoNum: HTMLElement;
  private readonly ammoBar: HTMLElement;
  private readonly dashBar: HTMLElement;
  private hpKey = '';
  private ammoKey = '';
  private dashKey = -1;
  private armsKey = '';
  private heavyIcon = '';

  constructor(slot: HTMLElement) {
    this.root = el('div', 'k-vitals ft-vitals');
    this.root.dataset.mode = 'fort';
    this.hpBox = el('div', 'k-vitals-hp', this.root);
    const hpRow = el('div', 'k-vitals-row', this.hpBox);
    hpRow.innerHTML = fortImg('heart', 'k-vitals-ic');
    this.hpNum = el('b', 'k-vitals-num', hpRow, '100');
    this.hpBar = el('span', 'k-meter k-meter--bad', this.hpBox);
    this.hpBar.innerHTML = meter;
    const arms = el('div', 'k-vitals-arms', this.root);
    const arm = (icon: string, label: string, key: string, cls = ''): Arm => {
      const root = el('div', `k-arm${cls}`, arms);
      root.innerHTML = `${fortImg(icon)}<span></span>${TOUCH ? '' : `<kbd class="k-key k-key--sm k-key--tr">${key}</kbd>`}`;
      const a = { root, img: root.querySelector('img')!, label: root.querySelector('span')! };
      setText(a.label, label);
      return a;
    };
    this.marker = arm('marker', 'Маркер', '1', ' is-on');
    this.heavy = arm('shotgun', 'Второй ствол', '2', ' is-off');
    this.gren = arm('gren', '0', 'G', ' k-arm--count');
    this.ammoBox = el('div', 'k-vitals-ammo', this.root);
    const ammoRow = el('div', 'k-vitals-row', this.ammoBox);
    if (!TOUCH) ammoRow.innerHTML = '<kbd class="k-key k-key--sm">R</kbd>';
    this.ammoNum = el('b', 'k-vitals-num', ammoRow);
    this.ammoBar = el('span', 'k-meter k-meter--thin', this.ammoBox);
    this.ammoBar.innerHTML = meter;
    const dash = el('div', 'k-vitals-dash', this.root);
    dash.innerHTML = `${TOUCH ? '' : '<kbd class="k-key k-key--sm">Shift</kbd>'}<span class="k-vitals-cap">рывок</span>`;
    this.dashBar = el('span', 'k-meter k-meter--info', dash);
    this.dashBar.innerHTML = meter;
    slot.append(this.root);
  }

  setHp(hp: number, max: number): void {
    const h = Math.max(0, Math.ceil(hp));
    const v = Math.max(0, Math.min(1, h / Math.max(1, max)));
    const key = `${h}|${max}`;
    if (key === this.hpKey) return;
    this.hpKey = key;
    setText(this.hpNum, String(h));
    setMeter(this.hpBar, v);
    this.hpBox.classList.toggle('is-low', h > 0 && v <= 0.3);
  }

  /** Патроны; reload — доля перезарядки 0…1 (null — не перезаряжается) */
  setAmmo(ammo: number, mag: number, reload: number | null): void {
    const r = reload === null ? -1 : Math.round(reload * 50) / 50;
    const key = `${ammo}|${mag}|${r}`;
    if (key === this.ammoKey) return;
    this.ammoKey = key;
    this.ammoNum.innerHTML = `${num(ammo)}<small>/ ${num(mag)}</small>`;
    this.ammoBox.classList.toggle('is-empty', ammo <= 0 && r < 0);
    this.ammoBox.classList.toggle('is-reload', r >= 0);
    this.ammoBar.className = `k-meter k-meter--thin${r >= 0 ? ' k-meter--info' : ammo <= Math.max(3, mag * 0.2) ? ' k-meter--bad' : ''}`;
    setMeter(this.ammoBar, r >= 0 ? r : mag > 0 ? Math.max(0, Math.min(1, ammo / mag)) : 0);
  }

  setDash(ready: number): void {
    const r = Math.round(Math.max(0, Math.min(1, ready)) * 40) / 40;
    if (r === this.dashKey) return;
    this.dashKey = r;
    setMeter(this.dashBar, r);
  }

  /** gun — в руках (0 — маркер), heavy — второй ствол (0 — нет), other — патронов в убранном, gr / grMax — гранаты */
  setArms(gun: number, heavy: number, heavyName: string, heavyIcon: string, other: number, gr: number, _grMax: number): void {
    const key = `${gun}|${heavy}|${heavyName}|${heavyIcon}|${other}|${gr}`;
    if (key === this.armsKey) return;
    this.armsKey = key;
    this.marker.root.classList.toggle('is-on', gun === 0);
    this.heavy.root.classList.toggle('is-on', gun !== 0 && heavy > 0);
    this.heavy.root.classList.toggle('is-off', heavy <= 0);
    if (heavy > 0 && heavyIcon !== this.heavyIcon) {
      this.heavyIcon = heavyIcon;
      this.heavy.img.outerHTML = fortImg(heavyIcon);
      this.heavy.img = this.heavy.root.querySelector('img')!;
    }
    setText(this.heavy.label, heavy > 0 ? (gun === 0 ? `${heavyName} · ${num(other)}` : heavyName) : 'Второй ствол');
    setText(this.gren.label, String(gr));
    this.gren.root.classList.toggle('is-empty', gr <= 0);
  }

  /** Повален: панель серая */
  setDown(down: boolean): void {
    this.root.classList.toggle('is-down', down);
  }

  /** Панель целиком: в итогах её нет (как на странице), повален — видна, но серая */
  setVisible(v: boolean): void {
    if (this.root.hidden === !v) return;
    this.root.hidden = !v;
  }
}

/** Подсказка действия над панелью: «кликни — обратно» важнее подсказки у стойки, та — подсказки у лестницы */
export class FortPrompt {
  readonly root: HTMLElement;
  /** Телефон: нажали на подсказку у стойки */
  onTap: () => void = () => {};
  private station: { text: string; price: number; can: boolean; afford: boolean } | null = null;
  private ladder: 'up' | 'down' | null = null;
  private resume = false;
  private key = '';

  constructor(slot: HTMLElement) {
    this.root = el('div', 'k-prompt ft-prompt');
    this.root.dataset.mode = 'fort';
    this.root.hidden = true;
    slot.append(this.root);
    if (TOUCH) {
      this.root.addEventListener('pointerdown', (e) => {
        if (!this.station?.can) return;
        e.preventDefault();
        this.onTap();
      });
    }
  }

  setStation(text: string | null, price: number, can: boolean, afford: boolean): void {
    this.station = text === null ? null : { text, price, can, afford };
    this.render();
  }

  setLadder(kind: 'up' | 'down' | null): void {
    this.ladder = kind;
    this.render();
  }

  setResume(on: boolean): void {
    this.resume = on;
    this.render();
  }

  private render(): void {
    const s = this.station;
    const key = this.resume ? 'resume' : s ? `s|${s.text}|${s.price}|${s.can}|${s.afford}` : this.ladder ? `l|${this.ladder}` : '';
    if (key === this.key) return;
    this.key = key;
    this.root.hidden = key === '';
    this.root.classList.remove('k-prompt--off', 'is-tap');
    if (this.resume) {
      this.root.innerHTML = '<kbd class="k-key"><i class="k-mouse k-mouse--l" aria-label="ЛКМ"></i></kbd><span>Обратно в бой</span><span class="k-prompt-sep"></span><span class="k-prompt-note">или любая клавиша</span>';
      return;
    }
    if (s) {
      const cut = s.text.indexOf(' · ');
      const main = capFirst(cut < 0 ? s.text : s.text.slice(0, cut));
      const note = cut < 0 ? '' : s.text.slice(cut + 3);
      this.root.classList.toggle('k-prompt--off', !s.can);
      this.root.classList.toggle('is-tap', TOUCH && s.can);
      this.root.innerHTML = '';
      if (s.can && !TOUCH) this.root.appendChild(el('kbd', 'k-key', undefined, 'E'));
      this.root.appendChild(el('span', '', undefined, main));
      if (note) {
        this.root.appendChild(el('span', 'k-prompt-sep'));
        this.root.appendChild(el('span', 'k-prompt-note', undefined, note));
      }
      if (s.price > 0) {
        this.root.appendChild(el('span', 'k-prompt-sep'));
        const pill = el('span', `k-pill k-pill--sm ${s.afford ? 'k-pill--gold' : 'k-pill--bad'}`, this.root);
        pill.innerHTML = `${fortImg('gold', 'ft-nug')}${num(s.price)}`;
      }
      return;
    }
    if (this.ladder === 'up') {
      this.root.innerHTML = `${TOUCH ? '' : '<kbd class="k-key">W</kbd>'}${fortImg('ladder', 'k-ic')}<span>Наверх, на стену</span><span class="k-prompt-sep"></span><span class="k-prompt-note">лицом к лестнице</span>`;
    } else {
      this.root.innerHTML = `${TOUCH ? '' : '<kbd class="k-key">S</kbd>'}${fortImg('ladder', 'k-ic')}<span>Вниз по лестнице</span><span class="k-prompt-sep"></span><span class="k-prompt-note">спиной к краю · или спрыгни</span>`;
    }
  }
}

/** Прицел кита: раствор — разброс ствола (px экрана); попадание — косой крестик (в голову — золотом) */
export class FortCross {
  readonly root: HTMLElement;
  private gap = -1;
  private vis = true;
  private hitTimer = 0;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'k-cross ft-cross', parent);
    this.root.innerHTML = '<i></i><i></i><i></i><i></i>';
  }

  set(gap: number, visible: boolean): void {
    const g = Math.round(gap * 2) / 2;
    if (g !== this.gap) {
      this.gap = g;
      this.root.style.setProperty('--gap', `${g}px`);
    }
    if (visible !== this.vis) {
      this.vis = visible;
      this.root.hidden = !visible;
    }
  }

  hit(head: boolean, kill: boolean): void {
    this.root.classList.remove('is-hit', 'is-head', 'is-kill');
    void this.root.offsetWidth;
    this.root.classList.add(head ? 'is-head' : 'is-hit');
    if (kill) this.root.classList.add('is-kill');
    clearTimeout(this.hitTimer);
    this.hitTimer = window.setTimeout(() => this.root.classList.remove('is-hit', 'is-head', 'is-kill'), kill ? 380 : 220);
  }
}

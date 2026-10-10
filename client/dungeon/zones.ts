// «Подземелье»: понятные постройки. У каждой постройки с зоной — круг на полу (спокойный снаружи, светится и пульсирует,
// когда герой внутри), заполнение во время активации (hero.useT0 → useT1, у фонаря-маяка — его заряд) и вспышка в конце;
// полная подпись (имя и что даёт) — раз за забег на каждый вид постройки, при первом подходе, ~6,5 с, потом тает;
// дальше над постройкой только короткая строка, когда она недоступна («через 45 с», «откроется во время волны»).
// У гриба-батута и пороховых бочек подписей нет вовсе. Встал в круг, а сейчас нельзя (hero.lockId, причина — prop.why) —
// короткая плашка над героем один раз при входе.
// Родник, пока лечит: пузыри, свечение и зелёные «+HP». Только декали пола, частицы и DOM-подписи — без настоящих ламп.
import * as THREE from 'three';
import { DG_DATA, type DgProp, type DgSim } from '../../shared/dungeon/sim.ts';
import { A_SOFT, A_STAR, D_RING, D_SOFT, D_TCIRCLE, type FloorDecals, type FxPool } from './fx.ts';

const L = 240;
const wrap = (d: number): number => d - L * Math.round(d / L);
const HZ = 30;
/** Полная подпись появляется при первом подходе ближе, м */
const LABEL_NEAR = 6.5;
/** и видна столько секунд времени забега (пауза и карточки не считаются), потом тает */
const FULL_S = 6.5;
const FADE_S = 1.2;
/** короткие строки состояния: не больше стольких сразу, ближе, м */
const NOTE_MAX = 3;
const NOTE_NEAR = 9;
/** без подписей вовсе */
const NO_LABEL = new Set<DgProp['k']>(['tramp', 'keg']);
/** проклятие: столько секунд на элиту (props.ts CURSE_TIME) */
const CURSE_S = 45;
/** плашка «почему нельзя» над героем, с */
const TOAST_S = 2.4;

const inter = (id: string): Record<string, unknown> => (DG_DATA.interactables.find((i) => i.id === id) ?? { id }) as Record<string, unknown>;
const num = (id: string, key: string, def: number): number => {
  const v = inter(id)[key];
  return typeof v === 'number' ? v : def;
};
const nameOf = (id: string, def: string): string => {
  const v = inter(id).name;
  return typeof v === 'string' ? v : def;
};

interface Kind {
  /** радиус зоны, м (0 — без круга) */
  r: number;
  /** цвет зоны */
  c: [number, number, number];
  title: string;
  /** что даёт — одной строкой */
  gives: string;
}

const KINDS: Record<DgProp['k'], Kind> = {
  altar: { r: 2.5, c: [1, 0.78, 0.32], title: nameOf('altar', 'Алтарь света'), gives: `Постой в круге — случайный дар на ${num('altar', 'duration', 30)} с: ярость, спешка, ветер или притяжение` },
  spring: { r: 2.2, c: [0.35, 0.95, 0.85], title: nameOf('spring', 'Целебный родник'), gives: 'Стой в воде — лечит, пока в чаше есть вода' },
  chest: { r: 2.5, c: [0.78, 0.45, 1], title: nameOf('cursedChest', 'Проклятый сундук'), gives: `Встань рядом во время волны — придёт элита, убей её за ${CURSE_S} с и забери награду` },
  forge: { r: 2.5, c: [1, 0.55, 0.22], title: nameOf('forge', 'Забытая кузня'), gives: 'Постой в круге — +1 уровень оружию, плата: опыт' },
  lamp: { r: 2, c: [1, 0.72, 0.35], title: nameOf('lamppost', 'Фонарь-маяк'), gives: 'Постой рядом — зажжётся: свет замедляет врагов и лечит тебя' },
  cart: { r: 2.2, c: [0.85, 0.8, 0.7], title: nameOf('minecart', 'Вагонетка'), gives: 'Пробеги сквозь — покатится и снесёт врагов; E — запрыгнуть' },
  tramp: { r: 1.25, c: [0.95, 0.55, 0.9], title: nameOf('trampoline', 'Гриб-батут'), gives: '' },
  keg: { r: 0, c: [1, 0.35, 0.2], title: 'Пороховая бочка', gives: '' },
  brazier: { r: 0, c: [1, 0.6, 0.25], title: nameOf('brazier', 'Жаровня'), gives: 'Ударь — выпадет добыча' },
};

/** Постройка на месте и с ней можно что-то сделать (для цвета круга и подписи) */
function present(p: DgProp): boolean {
  if (p.k === 'altar' || p.k === 'chest' || p.k === 'keg' || p.k === 'brazier') return p.st !== 3;
  return true;
}

/** Подписи в стиле HUD «Кованый фонарь»: железо, латунная рамка, заклёпки, заголовок — Alegreya SC (или запасной) */
const RIVET = 'radial-gradient(circle at 50% 50%, #ffe7ad 0 1.2px, #a47a35 2px, #3d2b13 2.7px, transparent 3.2px)';
const CSS = `
.dgz { position: fixed; inset: 0; pointer-events: none; overflow: hidden; z-index: 3; }
.dgz-l { position: absolute; left: 0; top: 0; transform: translate(-50%, -100%); max-width: 340px; padding: 8px 14px 9px; border-radius: 7px;
  background: linear-gradient(180deg, #2e2620, #17120f); border: 2px solid #8d6b36;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, .7), inset 0 2px 0 1px rgba(243, 211, 143, .12), 0 6px 16px rgba(0, 0, 0, .5);
  color: #f7e8c9; font: 600 15px/1.3 'Alegreya Sans', Rubik, system-ui, sans-serif; text-align: center; white-space: normal; transition: opacity .25s; }
.dgz-l::after { content: ''; position: absolute; inset: 0; pointer-events: none; border-radius: 5px;
  background: ${RIVET} left 1px top 1px / 8px 8px no-repeat, ${RIVET} right 1px top 1px / 8px 8px no-repeat,
  ${RIVET} left 1px bottom 1px / 8px 8px no-repeat, ${RIVET} right 1px bottom 1px / 8px 8px no-repeat; }
.dgz-t { font: 900 18px/1.15 'Alegreya SC', Georgia, 'Times New Roman', serif; color: #f3d38f; text-shadow: 0 2px 0 rgba(0, 0, 0, .6); }
.dgz-g { margin-top: 2px; }
.dgz-s { margin-top: 4px; font-size: 14px; color: #cfb488; }
.dgz-n { position: absolute; left: 0; top: 0; padding: 2px 9px 3px; border-radius: 5px; background: linear-gradient(180deg, #2e2620, #17120f);
  border: 1px solid rgba(201, 154, 75, .7); box-shadow: 0 3px 8px rgba(0, 0, 0, .45); color: #f3d38f;
  font: 700 13px/1.3 'Alegreya Sans', Rubik, system-ui, sans-serif; white-space: nowrap; transition: opacity .2s; }
.dgz-toast { position: absolute; left: 0; top: 0; padding: 4px 13px 5px; border-radius: 5px; background: linear-gradient(180deg, #3a2420, #1c1210);
  border: 1px solid #b8584e; color: #ffd4c8; font: 800 15px/1.3 'Alegreya Sans', Rubik, system-ui, sans-serif; white-space: nowrap;
  box-shadow: 0 4px 12px rgba(0, 0, 0, .4); }
.dgz-s.ok, .dgz-n.ok { color: #8ef0b0; }
.dgz-s.warn, .dgz-n.warn { color: #ffb38a; }
`;

interface Label {
  el: HTMLElement;
  t: HTMLElement;
  g: HTMLElement;
  s: HTMLElement;
  key: string;
}

interface Note {
  el: HTMLElement;
  key: string;
}

export class BuildingZones {
  private readonly layer: HTMLElement;
  private full: Label | null = null;
  private readonly notes: Note[] = [];
  private readonly lastSt = new Map<number, number>();
  /** полная подпись уже была в этом забеге: вид → постройка и шаг, когда показали */
  private readonly seen = new Map<DgProp['k'], { id: number; t0: number }>();
  private simRef: DgSim | null = null;
  private lastT = -1;
  /** плашка над героем: постройка, текст, шаг появления */
  private toastEl: HTMLElement | null = null;
  private lastLock = -1;
  private toastId = -1;
  private toastT0 = -1e9;
  private healAcc = 0;
  private healT = 0;
  private healIdle = 9;
  private lastHp = -1;
  private readonly v3 = new THREE.Vector3();

  /** слой подписей — под окнами интерфейса режима (первым ребёнком слоя HUD) */
  constructor() {
    if (!document.getElementById('dgz-css')) {
      const st = document.createElement('style');
      st.id = 'dgz-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this.layer = document.createElement('div');
    this.layer.className = 'dgz';
    const host = document.querySelector('.dg')?.parentElement ?? document.body;
    host.insertBefore(this.layer, host.firstChild);
  }

  hide(): void {
    this.layer.style.display = 'none';
  }

  /**
   * Каждый кадр после построек. run — забег (зоны есть только у настоящей симуляции: нужен DgSim), X/Z — тор → кадр,
   * still — мир стоит (пауза, карточки).
   */
  draw(run: unknown, camera: THREE.Camera, X: (x: number) => number, Z: (z: number) => number,
    decN: FloorDecals, decA: FloorDecals, pool: FxPool, time: number, still: boolean, dt: number): void {
    const sim = (run as { sim?: DgSim } | null)?.sim;
    if (!sim) {
      this.layer.style.display = 'none';
      return;
    }
    this.layer.style.display = '';
    // новый забег (или время пошло назад) — полные подписи снова по разу
    if (sim !== this.simRef || sim.t < this.lastT) {
      this.seen.clear();
      this.simRef = sim;
    }
    this.lastT = sim.t;
    const h = sim.hero;
    const t = sim.t;
    const w = window.innerWidth;
    const hh = window.innerHeight;
    const near: { p: DgProp; d: number }[] = [];
    let inSpring: DgProp | null = null;
    for (const p of sim.props) {
      const k = KINDS[p.k];
      const dx = wrap(p.x - h.x);
      const dz = wrap(p.z - h.z);
      const d = Math.hypot(dx, dz);
      // вспышка в конце активации: состояние сменилось из «готова»
      const was = this.lastSt.get(p.id);
      this.lastSt.set(p.id, p.st);
      if (was === 0 && p.st !== 0 && (p.k === 'altar' || p.k === 'lamp' || p.k === 'chest' || p.k === 'forge')) this.flash(p, pool, k.c);
      if (d > 40) continue;
      if (d < NOTE_NEAR && present(p) && !NO_LABEL.has(p.k)) near.push({ p, d });
      if (k.r <= 0 || !present(p)) continue;
      const x = X(p.x);
      const z = Z(p.z);
      const inside = d < k.r + 0.3;
      const ready = this.ready(sim, p);
      const [r, g, b] = ready ? k.c : [0.55, 0.5, 0.45];
      // круг зоны: снаружи — тихая кромка, внутри — светится и дышит
      const pulse = 0.5 + 0.5 * Math.sin(time * 5);
      decA.add(x, 0.05, z, k.r, k.r, 0, D_RING, 0.95, 0.04, r, g, b, inside ? 0.75 + 0.25 * pulse : ready ? 0.38 : 0.18);
      if (inside) decA.add(x, 0.05, z, k.r * 1.15, k.r * 1.15, 0, D_SOFT, 1.6, 0, r, g, b, 0.3 + 0.15 * pulse);
      // заполнение: удержание (алтарь, сундук, кузня) или заряд фонаря-маяка
      let prog = -1;
      if (h.useId === p.id && h.useT1 > h.useT0) prog = Math.min(1, Math.max(0, (t - h.useT0) / (h.useT1 - h.useT0)));
      else if (p.k === 'lamp' && p.st === 0 && p.vx > 0) prog = p.vx;
      if (prog >= 0) {
        decN.add(x, 0.045, z, k.r, k.r, 0, D_TCIRCLE, Math.max(0.02, prog), 0, r, g, b, 0.85);
        // кольцо сжимается к центру — сколько ещё ждать
        const rr = k.r * (1.6 - 0.6 * prog);
        decA.add(x, 0.055, z, rr, rr, 0, D_RING, 0.94, 0.05, r, g, b, 0.9);
      }
      if (p.k === 'spring' && inside) inSpring = p;
      // родник: уровень воды — голубое пятно в чаше
      if (p.k === 'spring' && p.v > 0.02) decA.add(x, 0.06, z, 1.1, 1.1, 0, D_SOFT, 1.4, 0, 0.3, 0.85, 0.9, 0.12 + 0.3 * p.v);
    }
    this.spring(sim, inSpring, X, Z, pool, decA, time, still, dt);
    this.toast(sim, camera, X, Z, w, hh);
    const toastOn = (t - this.toastT0) / HZ < TOAST_S ? this.toastId : -1;
    near.sort((a, b) => a.d - b.d);
    // полная подпись: первый подход к виду постройки в этом забеге, если другая сейчас не показана
    let cur: { p: DgProp; d: number; age: number } | null = null;
    let busy = false;
    for (const v of this.seen.values()) {
      const age = (t - v.t0) / HZ;
      if (age >= FULL_S + FADE_S) continue;
      busy = true;
      const it = near.find((o) => o.p.id === v.id);
      if (it) cur = { p: it.p, d: it.d, age };
    }
    if (!busy) {
      const first = near.find((o) => o.d < LABEL_NEAR && !this.seen.has(o.p.k));
      if (first) {
        this.seen.set(first.p.k, { id: first.p.id, t0: t });
        cur = { p: first.p, d: first.d, age: 0 };
      }
    }
    let fullId = -1;
    if (cur) {
      const { p, d, age } = cur;
      const k = KINDS[p.k];
      const at = this.screen(camera, X(p.x), Z(p.z), p.k === 'cart' ? 2.2 : 3.4, w, hh);
      if (at) {
        fullId = p.id;
        const lb = this.fullLabel();
        lb.el.style.transform = `translate(${at[0]}px, ${at[1]}px) translate(-50%, -100%)`;
        // тает в конце и при отходе
        const a = Math.min(1, age / 0.25, 1 - (age - FULL_S) / FADE_S, (NOTE_NEAR - d) / 2);
        lb.el.style.opacity = String(Math.max(0, a).toFixed(2));
        // причина уже над героем плашкой — не повторять
        const st = p.id === toastOn ? { text: '', cls: '' } : this.state(sim, p, d < k.r + 0.3);
        const key = `${p.id}|${st.text}|${st.cls}`;
        if (key !== lb.key) {
          lb.key = key;
          lb.t.textContent = k.title;
          lb.g.textContent = k.gives;
          lb.s.textContent = st.text;
          lb.s.className = `dgz-s${st.cls ? ` ${st.cls}` : ''}`;
          lb.s.style.display = st.text ? '' : 'none';
        }
        lb.el.style.display = '';
      }
    }
    if (fullId < 0 && this.full) this.full.el.style.display = 'none';
    // короткие строки: недоступна — почему (маленькой строкой над постройкой)
    let n = 0;
    for (const { p, d } of near) {
      if (n >= NOTE_MAX) break;
      if (p.id === fullId || p.id === toastOn) continue;
      const st = this.state(sim, p, d < KINDS[p.k].r + 0.3);
      if (!st.text) continue;
      const at = this.screen(camera, X(p.x), Z(p.z), p.k === 'cart' ? 2.2 : 3.4, w, hh);
      if (!at) continue;
      const nt = this.note(n++);
      nt.el.style.transform = `translate(${at[0]}px, ${at[1]}px) translate(-50%, -100%)`;
      nt.el.style.opacity = String(Math.min(1, (NOTE_NEAR - d) / 1.5).toFixed(2));
      const key = `${st.text}|${st.cls}`;
      if (key !== nt.key) {
        nt.key = key;
        nt.el.textContent = st.text;
        nt.el.className = `dgz-n${st.cls ? ` ${st.cls}` : ''}`;
      }
      nt.el.style.display = '';
    }
    for (let i = n; i < this.notes.length; i++) this.notes[i].el.style.display = 'none';
  }

  /** точка над постройкой на экране: не выше полосы волны и не ниже кнопок рывка/удара; null — за кадром */
  private screen(camera: THREE.Camera, x: number, z: number, y: number, w: number, hh: number): [number, number] | null {
    this.v3.set(x, y, z).project(camera);
    if (this.v3.z > 1 || Math.abs(this.v3.x) > 1.05 || Math.abs(this.v3.y) > 1.05) return null;
    return [Math.round((this.v3.x * 0.5 + 0.5) * w), Math.round(Math.max(205, Math.min(hh - 150, (-this.v3.y * 0.5 + 0.5) * hh)))];
  }

  private ready(sim: DgSim, p: DgProp): boolean {
    switch (p.k) {
      case 'altar':
      case 'chest':
      case 'forge':
        return p.why === '' && (p.k !== 'chest' || p.st === 0);
      case 'spring':
        return p.v > 0.02;
      case 'lamp':
        return p.st === 0;
      case 'cart':
        return p.st === 0 && sim.t >= p.t1;
      case 'tramp':
        return p.st === 0;
      default:
        return true;
    }
  }

  /**
   * Короткая строка состояния — только когда постройка сейчас не сработает (и почему), плюс вода родника, пока стоишь
   * в чаше. Пусто — постройка готова: хватает круга и кольца. Причину даёт симуляция (prop.why).
   */
  private state(sim: DgSim, p: DgProp, inside: boolean): { text: string; cls: string } {
    const t = sim.t;
    const h = sim.hero;
    const secs = (to: number): number => Math.max(1, Math.ceil((to - t) / HZ));
    const no = { text: '', cls: '' };
    const warn = (text: string): { text: string; cls: string } => ({ text, cls: 'warn' });
    const why = p.why;
    switch (p.k) {
      case 'altar':
        return why === 'cool' ? warn(`Остывает — снова через ${secs(p.t1)} с`) : why ? warn('Сейчас не сработает') : no;
      case 'chest':
        if (why === 'busy') return warn(`Убей элиту — ${secs(p.t1)} с`);
        if (why === 'wave') return warn('Откроется во время волны');
        if (why === 'boss') return warn('Не на волне босса');
        if (why === 'cool') return warn(`Рассыпался — новый через ${secs(p.t1)} с`);
        return why ? warn('Сейчас не откроется') : no;
      case 'forge':
        if (why === 'out') return warn(`Погасла — разгорится на ${p.v}-й волне`);
        if (why === 'xp') return warn('Нужно полполосы опыта');
        return why ? warn('Сейчас не сработает') : no;
      case 'spring':
        if (p.v <= 0.02) return warn('Пусто — наберётся за минуту');
        if (inside && h.hp >= h.hpMax) return { text: `Здоровье полное · вода ${Math.round(p.v * 100)} %`, cls: '' };
        if (inside) return { text: `Вода ${Math.round(p.v * 100)} %`, cls: 'ok' };
        return no;
      case 'cart':
        return p.st === 0 && t < p.t1 ? warn(`Готова через ${secs(p.t1)} с`) : no;
    }
    return no;
  }

  /** Встал в круг постройки, которая сейчас не сработает (hero.lockId сменился) — плашка с причиной над героем */
  private toast(sim: DgSim, camera: THREE.Camera, X: (x: number) => number, Z: (z: number) => number, w: number, hh: number): void {
    const h = sim.hero;
    const t = sim.t;
    if (h.lockId !== this.lastLock) {
      this.lastLock = h.lockId;
      const p = h.lockId >= 0 ? sim.props.find((o) => o.id === h.lockId) : undefined;
      const st = p ? this.state(sim, p, true) : null;
      if (p && st?.text) {
        this.toastId = p.id;
        this.toastT0 = t;
        if (!this.toastEl) {
          this.toastEl = document.createElement('div');
          this.toastEl.className = 'dgz-toast';
          this.layer.appendChild(this.toastEl);
        }
        this.toastEl.textContent = st.text;
      }
    }
    const el = this.toastEl;
    if (!el) return;
    const age = (t - this.toastT0) / HZ;
    const at = age < TOAST_S ? this.screen(camera, X(h.x), Z(h.z), 2.7, w, hh) : null;
    if (!at) {
      el.style.display = 'none';
      return;
    }
    // всплывает на 12 px и тает в последние 0,5 с
    const rise = Math.round(12 * Math.min(1, age / 0.2));
    el.style.transform = `translate(${at[0]}px, ${at[1] - rise}px) translate(-50%, -100%)`;
    el.style.opacity = Math.max(0, Math.min(1, age / 0.12, (TOAST_S - age) / 0.5)).toFixed(2);
    el.style.display = '';
  }

  /** Родник лечит: пузыри, свечение, «+HP» зелёным */
  private spring(sim: DgSim, p: DgProp | null, X: (x: number) => number, Z: (z: number) => number, pool: FxPool, decA: FloorDecals, time: number, still: boolean, dt: number): void {
    const h = sim.hero;
    const hp = h.hp;
    // шаг симуляции — 30 Гц, кадр — чаще: «лечит» держим 0,2 с после последней прибавки
    const gained = this.lastHp >= 0 && hp > this.lastHp + 0.001;
    if (p && gained) {
      this.healAcc += hp - this.lastHp;
      this.healIdle = 0;
    } else if (!still) this.healIdle += dt;
    if (p && this.healIdle < 0.2 && !still) {
      const x = X(p.x);
      const z = Z(p.z);
      decA.add(x, 0.06, z, 2.6, 2.6, 0, D_SOFT, 1.3, 0, 0.35, 1, 0.65, 0.35 + 0.1 * Math.sin(time * 6));
      if (pool.rnd() < 0.5) {
        const a = pool.rnd() * Math.PI * 2;
        const r = pool.rnd() * 1.6;
        pool.spark(p.x + Math.cos(a) * r, 0.25, p.z + Math.sin(a) * r, 0, 1.2 + pool.rnd(), 0, 0.7, 0.24, A_SOFT, 0.45, 1, 0.85);
      }
    }
    if (!still) this.healT += dt;
    if (this.healAcc >= 1 && (this.healT > 0.8 || this.healAcc >= 12)) {
      pool.number(h.x, h.z, Math.round(this.healAcc), true, 0.45, 1, 0.5);
      this.healAcc = 0;
      this.healT = 0;
    } else if (this.healIdle > 0.6) {
      this.healAcc = 0;
      this.healT = 0;
    }
    this.lastHp = hp;
  }

  private flash(p: DgProp, pool: FxPool, c: [number, number, number]): void {
    const k = KINDS[p.k];
    pool.decal({ x: p.x, z: p.z, yaw: 0, shape: D_RING, r0: k.r * 0.6, r1: k.r * 2.4, len: 0, p1: 0.86, p2: 0.12, r: c[0], g: c[1], b: c[2], a: 1, max: 0.6, add: true });
    pool.decal({ x: p.x, z: p.z, yaw: 0, shape: D_SOFT, r0: k.r * 1.5, r1: k.r * 2.2, len: 0, p1: 1.4, p2: 0, r: c[0], g: c[1], b: c[2], a: 0.9, max: 0.5, add: true });
    pool.burst(p.x, 1.2, p.z, 22, 5, A_STAR, c[0], c[1], c[2], 0.8, 0.35, true, 3, 3);
  }

  private fullLabel(): Label {
    if (this.full) return this.full;
    const el = document.createElement('div');
    el.className = 'dgz-l';
    const t = document.createElement('div');
    t.className = 'dgz-t';
    const g = document.createElement('div');
    g.className = 'dgz-g';
    const s = document.createElement('div');
    s.className = 'dgz-s';
    el.append(t, g, s);
    this.layer.appendChild(el);
    this.full = { el, t, g, s, key: '' };
    return this.full;
  }

  private note(i: number): Note {
    let nt = this.notes[i];
    if (nt) return nt;
    const el = document.createElement('div');
    el.className = 'dgz-n';
    this.layer.appendChild(el);
    nt = { el, key: '' };
    this.notes[i] = nt;
    return nt;
  }
}

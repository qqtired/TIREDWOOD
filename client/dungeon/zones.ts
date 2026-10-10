// «Подземелье»: понятные постройки. У каждой постройки с зоной — круг на полу (спокойный снаружи, светится и пульсирует,
// когда герой внутри), заполнение во время активации (hero.useT0 → useT1, у фонаря-маяка — его заряд) и вспышка в конце;
// подпись над постройкой в ~6 м: имя и что даёт одной строкой, ниже — состояние (остывает, вода, «здоровье полное»).
// Родник, пока лечит: пузыри, свечение и зелёные «+HP». Только декали пола, частицы и DOM-подписи — без настоящих ламп.
import * as THREE from 'three';
import { DG_DATA, type DgProp, type DgSim } from '../../shared/dungeon/sim.ts';
import { A_SOFT, A_STAR, D_RING, D_SOFT, D_TCIRCLE, type FloorDecals, type FxPool } from './fx.ts';

const L = 240;
const wrap = (d: number): number => d - L * Math.round(d / L);
const HZ = 30;
/** Подпись видна ближе, м */
const LABEL_NEAR = 6.5;
/** одна подпись — ближайшей постройки: спокойно и без наложений */
const LABEL_MAX = 1;

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
  altar: { r: 2.5, c: [1, 0.78, 0.32], title: nameOf('altar', 'Алтарь света'), gives: `случайный дар на ${num('altar', 'duration', 30)} с: ярость, спешка, ветер или притяжение` },
  spring: { r: 2.2, c: [0.35, 0.95, 0.85], title: nameOf('spring', 'Целебный родник'), gives: 'лечит, пока стоишь в воде' },
  chest: { r: 2.5, c: [0.78, 0.45, 1], title: nameOf('cursedChest', 'Проклятый сундук'), gives: 'выпустит элиту — убей её за 45 с и забери награду' },
  forge: { r: 2.5, c: [1, 0.55, 0.22], title: nameOf('forge', 'Забытая кузня'), gives: '+1 уровень своему оружию за опыт' },
  lamp: { r: 2, c: [1, 0.72, 0.35], title: nameOf('lamppost', 'Фонарь-маяк'), gives: 'зажги — свет замедляет врагов и лечит тебя' },
  cart: { r: 2.2, c: [0.85, 0.8, 0.7], title: nameOf('minecart', 'Вагонетка'), gives: 'пробеги сквозь — покатится и снесёт врагов; E — запрыгнуть' },
  tramp: { r: 1.25, c: [0.95, 0.55, 0.9], title: nameOf('trampoline', 'Гриб-батут'), gives: `наступи — прыжок на ${num('trampoline', 'jump', 10)} м над врагами` },
  keg: { r: 0, c: [1, 0.35, 0.2], title: 'Пороховая бочка', gives: 'попади — взорвётся и раскидает врагов' },
  brazier: { r: 0, c: [1, 0.6, 0.25], title: nameOf('brazier', 'Жаровня'), gives: 'ударь — выпадет добыча' },
};

/** Постройка на месте и с ней можно что-то сделать (для цвета круга и подписи) */
function present(p: DgProp): boolean {
  if (p.k === 'altar' || p.k === 'chest' || p.k === 'keg' || p.k === 'brazier') return p.st !== 3;
  return true;
}

const CSS = `
.dgz { position: fixed; inset: 0; pointer-events: none; overflow: hidden; z-index: 3; }
.dgz-l { position: absolute; left: 0; top: 0; transform: translate(-50%, -100%); max-width: 340px; padding: 7px 12px 8px; border-radius: 12px;
  background: rgba(24, 17, 14, .82); border: 1px solid rgba(255, 220, 160, .22); box-shadow: 0 6px 18px rgba(0, 0, 0, .35);
  color: #f6ead6; font: 600 14px/1.3 Rubik, system-ui, sans-serif; text-align: center; white-space: normal; transition: opacity .2s; }
.dgz-t { font-weight: 800; font-size: 15px; color: #ffe2a8; }
.dgz-g { margin-top: 2px; }
.dgz-s { margin-top: 4px; font-size: 13px; color: #c9b9a2; }
.dgz-s.ok { color: #8ef0b0; }
.dgz-s.warn { color: #ffb38a; }
.dgz-bar { margin: 5px auto 0; width: 150px; height: 7px; border-radius: 99px; background: rgba(255, 255, 255, .12); overflow: hidden; }
.dgz-bar > i { display: block; height: 100%; width: 0; border-radius: 99px; background: linear-gradient(90deg, #3ec9b4, #8af2e2); }
`;

interface Label {
  el: HTMLElement;
  t: HTMLElement;
  g: HTMLElement;
  s: HTMLElement;
  bar: HTMLElement;
  fill: HTMLElement;
  key: string;
}

export class BuildingZones {
  private readonly layer: HTMLElement;
  private readonly labels: Label[] = [];
  private readonly lastSt = new Map<number, number>();
  /** сколько герой стоит в круге без удержания (подсказка «нажми E») */
  private inSince = new Map<number, number>();
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
      if (d < LABEL_NEAR + 1 && present(p)) near.push({ p, d });
      if (k.r <= 0 || !present(p)) continue;
      const x = X(p.x);
      const z = Z(p.z);
      const inside = d < k.r + 0.3;
      const ready = this.ready(sim, p);
      const [r, g, b] = ready ? k.c : [0.55, 0.5, 0.45];
      // круг зоны: снаружи — тихая кромка, внутри — светится и дышит
      const pulse = 0.5 + 0.5 * Math.sin(time * 5);
      decA.add(x, 0.05, z, k.r, k.r, 0, D_RING, 0.95, 0.04, r, g, b, inside ? 0.75 + 0.25 * pulse : ready ? 0.38 : 0.18);
      if (inside) {
        decA.add(x, 0.05, z, k.r * 1.15, k.r * 1.15, 0, D_SOFT, 1.6, 0, r, g, b, 0.3 + 0.15 * pulse);
        if (!this.inSince.has(p.id)) this.inSince.set(p.id, time);
      } else this.inSince.delete(p.id);
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
    // подписи: ближайшие
    near.sort((a, b) => a.d - b.d);
    let n = 0;
    for (const { p, d } of near) {
      if (n >= LABEL_MAX || d > LABEL_NEAR) break;
      const k = KINDS[p.k];
      const x = X(p.x);
      const z = Z(p.z);
      this.v3.set(x, p.k === 'cart' || p.k === 'keg' || p.k === 'tramp' ? 2.2 : 3.4, z).project(camera);
      if (this.v3.z > 1 || Math.abs(this.v3.x) > 1.1 || Math.abs(this.v3.y) > 1.1) continue;
      const lb = this.label(n++);
      const sx = (this.v3.x * 0.5 + 0.5) * w;
      // не выше полосы волны и не ниже кнопок рывка/удара
      const sy = Math.max(205, Math.min(hh - 150, (-this.v3.y * 0.5 + 0.5) * hh));
      lb.el.style.transform = `translate(${Math.round(sx)}px, ${Math.round(sy)}px) translate(-50%, -100%)`;
      lb.el.style.opacity = String(Math.min(1, (LABEL_NEAR - d) / 1.2 + 0.25));
      const st = this.state(sim, p, d < k.r + 0.3, time);
      const key = `${p.id}|${st.text}|${st.cls}|${st.bar < 0 ? -1 : Math.round(st.bar * 50)}`;
      if (key !== lb.key) {
        lb.key = key;
        lb.t.textContent = k.title;
        lb.g.textContent = k.gives;
        lb.s.textContent = st.text;
        lb.s.className = `dgz-s${st.cls ? ` ${st.cls}` : ''}`;
        lb.s.style.display = st.text ? '' : 'none';
        lb.bar.style.display = st.bar >= 0 ? '' : 'none';
        if (st.bar >= 0) lb.fill.style.width = `${Math.round(st.bar * 100)}%`;
      }
      lb.el.style.display = '';
    }
    for (let i = n; i < this.labels.length; i++) this.labels[i].el.style.display = 'none';
  }

  private ready(sim: DgSim, p: DgProp): boolean {
    switch (p.k) {
      case 'altar':
        return p.st === 0;
      case 'chest':
        return p.st === 0 && sim.wave.stage === 'wave';
      case 'forge':
        return p.st === 0 && sim.hero.xp >= sim.hero.xpNext * num('forge', 'minXpShare', 0.5) && sim.weapons.length > 0;
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

  /** Строка состояния под подписью */
  private state(sim: DgSim, p: DgProp, inside: boolean, time: number): { text: string; cls: string; bar: number } {
    const t = sim.t;
    const h = sim.hero;
    const secs = (to: number): number => Math.max(1, Math.ceil((to - t) / HZ));
    const using = h.useId === p.id;
    const since = this.inSince.get(p.id);
    // в круге, а удержание не началось — подсказать E
    const askE = inside && !using && since !== undefined && time - since > 0.4;
    switch (p.k) {
      case 'altar':
        if (p.st === 2) return { text: `Остывает — снова через ${secs(p.t1)} с`, cls: 'warn', bar: -1 };
        if (using) return { text: 'Стой в круге…', cls: 'ok', bar: -1 };
        return { text: askE ? 'Нажми E' : 'Встань в круг', cls: askE ? 'ok' : '', bar: -1 };
      case 'chest':
        if (p.st === 1) return { text: `Проклятие! Убей элиту — ${secs(p.t1)} с`, cls: 'warn', bar: -1 };
        if (sim.wave.stage !== 'wave') return { text: 'Открывается только во время волны', cls: 'warn', bar: -1 };
        if (using) return { text: 'Стой в круге…', cls: 'ok', bar: -1 };
        return { text: askE ? 'Нажми E' : 'Встань в круг', cls: askE ? 'ok' : '', bar: -1 };
      case 'forge': {
        if (p.st === 3) return { text: `Погасла — разгорится на ${p.v}-й волне`, cls: 'warn', bar: -1 };
        if (sim.weapons.length === 0 || h.xp < h.xpNext * num('forge', 'minXpShare', 0.5)) return { text: 'Нужно хотя бы полполосы опыта', cls: 'warn', bar: -1 };
        if (using) return { text: 'Куём… не отходи', cls: 'ok', bar: -1 };
        return { text: askE ? 'Нажми E' : 'Встань в круг — плата: опыт уровня', cls: askE ? 'ok' : '', bar: -1 };
      }
      case 'spring': {
        const pct = Math.round(p.v * 100);
        if (p.v <= 0.02) return { text: 'Вода кончилась — наберётся за минуту', cls: 'warn', bar: p.v };
        if (inside && h.hp >= h.hpMax) return { text: `Здоровье полное · вода ${pct} %`, cls: '', bar: p.v };
        if (inside) return { text: `Лечит · вода ${pct} %`, cls: 'ok', bar: p.v };
        return { text: `Вода ${pct} % — встань в чашу`, cls: '', bar: p.v };
      }
      case 'lamp':
        if (p.st === 1) return { text: 'Горит до конца забега', cls: 'ok', bar: -1 };
        return { text: p.vx > 0 ? 'Зажигается… стой рядом' : 'Постой рядом — зажжётся', cls: p.vx > 0 ? 'ok' : '', bar: -1 };
      case 'cart':
        if (p.st === 1) return { text: 'Едет!', cls: 'ok', bar: -1 };
        if (t < p.t1) return { text: `Готова через ${secs(p.t1)} с`, cls: 'warn', bar: -1 };
        return { text: '', cls: '', bar: -1 };
      case 'tramp':
        if (p.st === 2) return { text: `Сжат — ещё ${secs(p.t1)} с`, cls: 'warn', bar: -1 };
        return { text: '', cls: '', bar: -1 };
      case 'keg':
        if (p.st === 1) return { text: 'Фитиль! Отойди', cls: 'warn', bar: -1 };
        return { text: '', cls: '', bar: -1 };
      case 'brazier':
        if (p.st === 2) return { text: `Опрокинута — новая через ${secs(p.t1)} с`, cls: '', bar: -1 };
        return { text: '', cls: '', bar: -1 };
    }
    return { text: '', cls: '', bar: -1 };
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

  private label(i: number): Label {
    let lb = this.labels[i];
    if (lb) return lb;
    const el = document.createElement('div');
    el.className = 'dgz-l';
    const t = document.createElement('div');
    t.className = 'dgz-t';
    const g = document.createElement('div');
    g.className = 'dgz-g';
    const s = document.createElement('div');
    s.className = 'dgz-s';
    const bar = document.createElement('div');
    bar.className = 'dgz-bar';
    const fill = document.createElement('i');
    bar.appendChild(fill);
    el.append(t, g, bar, s);
    this.layer.appendChild(el);
    lb = { el, t, g, s, bar, fill, key: '' };
    this.labels[i] = lb;
    return lb;
  }
}

// Интерфейс гонки (DOM поверх игры): место и круг, время, мини-карта, бонус с «рулеткой», скорость, заряд заноса,
// отсчёт «3 · 2 · 1 · Вперёд!», баннеры, «Не туда!», кляксы краски и таблица итогов.
// Как у пейнтбола: в кадре трогаем только то, что поменялось. На телефоне значок бонуса — сам кнопка (onTap).
import { ITEM_HINTS, ITEM_ICONS, ITEM_NAMES, ITEM_NONE, ITEM_POOL, MT1_TICKS, MT2_TICKS, MT3_TICKS } from '../../shared/kart.ts';
import type { RaceResultRow } from '../../shared/messages.ts';
import type { Track } from '../../shared/track.ts';
import { TOUCH } from '../touch.ts';
import { COIN_HTML, setCoinText } from '../ui/coin.ts';
import { paintScreen, preparePaint } from './paint.ts';
import { SpeedLines } from './speedlines.ts';

/** Мини-карта: ширина (css px; высота — по пропорциям трассы) и поля; на телефоне — меньше: умещается между жетонами и «заносом» */
const MAP_W = TOUCH ? 116 : 230;
const MAP_PAD = TOUCH ? 5 : 10;
/** Рулетка бонуса: значок меняется раз в столько мс */
const ROLL_MS = 75;
/** Кляксы краски держатся 2,5 с (как PAINT_TICKS на сервере) */
const SPLAT_MS = 2500;
/** Праздник на финише: крупное место и конфетти, мс */
const PARTY_MS = 3400;
const PARTY_BITS = 46;
const PARTY_COLORS = ['#ff5d73', '#ffd23f', '#3ddc97', '#4cc9f0', '#c77dff', '#ff9a2e', '#f4efe6'];

export interface MapDot {
  x: number;
  z: number;
  color: string;
  me: boolean;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', parent?: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

/** 83 456 мс → «1:23.4» */
export function fmtRaceTime(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 100));
  const m = Math.floor(t / 600);
  const s = Math.floor((t % 600) / 10);
  return `${m}:${String(s).padStart(2, '0')}.${t % 10}`;
}

export class RaceHud {
  /** Телефон: нажали на значок бонуса — как клавишу */
  onTap: (code: string) => void = () => {};
  readonly root: HTMLElement;
  private readonly placeNum: HTMLElement;
  private readonly placeOf: HTMLElement;
  private readonly lapNum: HTMLElement;
  private readonly lapOf: HTMLElement;
  private readonly timeEl: HTMLElement;
  private readonly bestEl: HTMLElement;
  private readonly map: HTMLCanvasElement;
  private readonly mapCtx: CanvasRenderingContext2D;
  private readonly mapBase: HTMLCanvasElement;
  private readonly mapScale: number;
  private readonly mapH: number;
  private readonly mapX0: number;
  private readonly mapZ0: number;
  private readonly mapDpr: number;
  private readonly itemEl: HTMLElement;
  private readonly itemBox: HTMLElement;
  private readonly itemIcon: HTMLElement;
  private readonly itemName: HTMLElement;
  private readonly speedNum: HTMLElement;
  private readonly charge: HTMLElement;
  private readonly chargeFill: HTMLElement;
  private readonly chargeText: HTMLElement;
  private readonly countEl: HTMLElement;
  private readonly bannerEl: HTMLElement;
  private readonly wrongEl: HTMLElement;
  private readonly helpEl: HTMLElement;
  private readonly paintLayer: HTMLElement;
  private readonly results: HTMLElement;
  private readonly stats: HTMLElement;
  private readonly lines: SpeedLines;
  private last: Record<string, string | number | boolean> = {};
  private bannerTimer = 0;
  private pressTimer = 0;

  constructor(root: HTMLElement, track: Track) {
    this.root = root;
    root.innerHTML = '';
    preparePaint();
    // линии скорости — первым слоем, под всем интерфейсом
    this.lines = new SpeedLines(root);

    // --- место, круг, время
    const stand = el('div', 'card rc-stand', root);
    const course = el('div', '', stand, track.name);
    course.style.cssText = 'font-size:11px;opacity:.8;margin-bottom:4px';
    const place = el('div', 'rc-place', stand);
    this.placeNum = el('b', '', place, '—');
    this.placeOf = el('span', '', place, '/6');
    const lap = el('div', 'rc-lap', stand, 'Круг ');
    this.lapNum = el('b', '', lap, '1');
    this.lapOf = el('span', '', lap, '/3');
    // время и лучший круг — столбиком (на телефоне лёжа табличка — строкой)
    const clock = el('div', 'rc-clock', stand);
    this.timeEl = el('div', 'rc-time', clock, '0:00.0');
    this.bestEl = el('div', 'rc-best', clock);

    // --- мини-карта: трасса рисуется один раз, точки картов — каждый кадр
    this.mapDpr = Math.min(2, window.devicePixelRatio || 1);
    const wrap = el('div', 'rc-map', root);
    this.map = el('canvas', '', wrap);
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (let i = 0; i < track.n; i++) {
      x0 = Math.min(x0, track.px[i]);
      x1 = Math.max(x1, track.px[i]);
      z0 = Math.min(z0, track.pz[i]);
      z1 = Math.max(z1, track.pz[i]);
    }
    // карта по пропорциям трассы: вписана в MAP_W по ширине, высота — как выйдет
    const spanX = x1 - x0 + track.half * 2;
    const spanZ = z1 - z0 + track.half * 2;
    this.mapScale = (MAP_W - MAP_PAD * 2) / spanX;
    this.mapH = Math.round(spanZ * this.mapScale + MAP_PAD * 2);
    this.mapX0 = x0 - track.half - MAP_PAD / this.mapScale;
    this.mapZ0 = z0 - track.half - MAP_PAD / this.mapScale;
    this.map.width = Math.round(MAP_W * this.mapDpr);
    this.map.height = Math.round(this.mapH * this.mapDpr);
    this.map.style.width = `${MAP_W}px`;
    this.map.style.height = `${this.mapH}px`;
    this.mapCtx = this.map.getContext('2d')!;
    this.mapBase = this.drawTrack(track);

    // --- бонус, скорость, подсказка по клавишам
    this.itemEl = el('div', 'rc-item empty', root);
    this.itemBox = el('div', 'rc-item-box', this.itemEl);
    this.itemIcon = el('span', 'rc-item-icon', this.itemBox);
    this.itemName = el('div', 'rc-item-hint', this.itemEl);
    this.itemName.style.cssText = 'max-width:240px;text-align:center;line-height:1.4';
    el('div', 'rc-item-hint', this.itemEl, TOUCH ? '👆 жми' : 'E / ЛКМ');
    if (TOUCH) {
      // телефон: значок бонуса — кнопка (нажимается, только пока бонус лежит: см. CSS). Сразу по касанию, как
      // короткое E: газ и руль держат другие пальцы и не мешают
      this.itemEl.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (!this.itemEl.classList.contains('ready')) return;
        this.onTap('KeyE');
        this.itemPressed();
      });
    }
    const speed = el('div', 'rc-speed', root);
    this.speedNum = el('b', '', speed, '0');
    el('span', '', speed, 'км/ч');
    // заряд заноса: белый — копится, синий, оранжевый, фиолетовый — три мини-турбо; риски — где синий и оранжевый
    this.charge = el('div', 'rc-charge', root);
    const bar = el('div', 'rc-charge-bar', this.charge);
    this.chargeFill = el('i', 'rc-charge-fill', bar);
    el('i', 'rc-charge-mark', bar).style.left = `${(MT1_TICKS / MT3_TICKS) * 100}%`;
    el('i', 'rc-charge-mark', bar).style.left = `${(MT2_TICKS / MT3_TICKS) * 100}%`;
    this.chargeText = el('div', 'rc-charge-text', this.charge);
    this.helpEl = el('div', 'rc-help', root);
    this.helpEl.innerHTML = TOUCH
      ? '<b>▲</b> на «1» — ракетный старт · <b>▲</b>/<b>▼</b> газ и тормоз · <b>◀</b>/<b>▶</b> руль — веди пальцем, не отрывая · держи <b>⤴</b> и руль — занос, отпусти — ускорение · <b>⤴</b> в прыжке — трюк · бонус — жми на его значок · <b>↺</b> на трассу'
      : '<b>W</b> на «1» — ракетный старт · <b>W</b>/<b>S</b> газ и тормоз · <b>A</b>/<b>D</b> руль · <b>Space</b> + руль — подскок и занос, отпусти — ускорение · <b>Space</b> в прыжке — трюк · <b>E</b> бонус · <b>R</b> на трассу · <b>M</b> звук';

    // --- отсчёт, баннеры, «Не туда!», краска, итоги
    this.countEl = el('div', 'rc-count', root);
    this.bannerEl = el('div', 'rc-banner', root);
    this.wrongEl = el('div', 'rc-wrong', root, '↩ Не туда!');
    this.paintLayer = el('div', 'rc-paint', root);
    this.results = el('div', 'rc-results', root);
    this.stats = el('div', 'stats', root);
  }

  private set(key: string, value: string | number | boolean): boolean {
    if (this.last[key] === value) return false;
    this.last[key] = value;
    return true;
  }

  /** Линии скорости: power 0 — нет, 1 — турбо из ящика */
  setSpeedLines(dt: number, power: number): void {
    this.lines.update(dt, power);
  }

  setVisible(v: boolean): void {
    if (this.set('vis', v)) this.root.classList.toggle('hidden', !v);
  }

  /** Новый заезд: убрать итоги, кляксы, отсчёт и баннеры прошлого. */
  reset(): void {
    this.hideResults();
    this.paintLayer.innerHTML = '';
    this.root.querySelector('.rc-party')?.remove();
    this.bannerEl.className = 'rc-banner';
    this.countEl.className = 'rc-count';
    this.wrongEl.classList.remove('show');
    clearTimeout(this.bannerTimer);
    this.last = {};
  }

  // ------------------------------------------------------------ место, круг, время

  /** place 0 — ещё не известно; lap — текущий круг (1…laps) */
  setStanding(place: number, total: number, lap: number, laps: number): void {
    if (this.set('place', place)) this.placeNum.textContent = place > 0 ? String(place) : '—';
    if (this.set('total', total)) this.placeOf.textContent = `/${total}`;
    if (this.set('lap', lap)) this.lapNum.textContent = String(lap);
    if (this.set('laps', laps)) this.lapOf.textContent = `/${laps}`;
  }

  /** Время гонки и лучший круг, мс (null — нет) */
  setTimes(raceMs: number | null, bestMs: number | null): void {
    const t = raceMs === null ? '0:00.0' : fmtRaceTime(raceMs);
    if (this.set('time', t)) this.timeEl.textContent = t;
    const b = bestMs === null ? '' : `лучший круг ${fmtRaceTime(bestMs)}`;
    if (this.set('best', b)) this.bestEl.textContent = b;
  }

  setSpeed(kmh: number): void {
    const v = Math.round(kmh);
    if (this.set('speed', v)) this.speedNum.textContent = String(v);
  }

  /** Бонус: rolling — крутится рулетка (значки меняются), иначе — что лежит (ITEM_NONE — пусто) и что он делает. */
  setItem(item: number, rolling: boolean, nowMs: number): void {
    const show = rolling ? ITEM_POOL[Math.floor(nowMs / ROLL_MS) % ITEM_POOL.length] : item;
    const state = rolling ? 'rolling' : item !== ITEM_NONE ? 'ready' : 'empty';
    if (this.set('itemState', state)) this.itemEl.className = `rc-item ${state}`;
    if (this.set('itemIcon', show)) this.itemIcon.textContent = ITEM_ICONS[show] ?? '';
    const name = rolling ? 'Выбирается бонус' : ITEM_NAMES[item] ?? '';
    const hint = rolling ? '' : ITEM_HINTS[item] ?? '';
    if (!this.set('itemName', `${name}|${hint}`)) return;
    this.itemEl.title = hint ? `${name} — ${hint}` : name;
    this.itemName.textContent = name;
    if (hint) el('small', 'rc-item-what', this.itemName, hint);
    this.itemName.hidden = !name;
    this.itemEl.setAttribute('aria-label', this.itemEl.title || 'Бонус: пусто');
  }

  /** Телефон: нажали на значок — окошко вдавилось, значок вылетает из него и тает (бонус уже ушёл, как E). */
  private itemPressed(): void {
    this.itemBox.classList.add('press');
    clearTimeout(this.pressTimer);
    this.pressTimer = window.setTimeout(() => this.itemBox.classList.remove('press'), 140);
    const r = this.itemBox.getBoundingClientRect();
    const pop = el('div', 'rc-item-pop', this.root, this.itemIcon.textContent ?? '');
    pop.style.left = `${(r.left + r.width / 2).toFixed(1)}px`;
    pop.style.top = `${(r.top + r.height / 2).toFixed(1)}px`;
    setTimeout(() => pop.remove(), 600);
  }

  /** Заряд заноса: driftT — сколько тиков длится занос, null — не в заносе (полоска гаснет). */
  setCharge(driftT: number | null): void {
    const on = driftT !== null;
    if (this.set('charge', on)) this.charge.classList.toggle('show', on);
    if (driftT === null) return;
    const lvl = driftT >= MT3_TICKS ? 3 : driftT >= MT2_TICKS ? 2 : driftT >= MT1_TICKS ? 1 : 0;
    if (this.set('chargeLvl', lvl)) {
      this.charge.dataset.lvl = String(lvl);
      this.chargeText.textContent = ['Держи занос', 'Синее — можно отпускать', 'Оранжевое — держи ещё', 'Фиолетовое — отпускай!'][lvl];
    }
    const pct = Math.min(100, Math.round((driftT / MT3_TICKS) * 100));
    if (this.set('chargePct', pct)) this.chargeFill.style.width = `${pct}%`;
  }

  setHelp(on: boolean): void {
    if (this.set('help', on)) this.helpEl.classList.toggle('show', on);
  }

  // ------------------------------------------------------------ мини-карта

  private drawTrack(tr: Track): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = this.map.width;
    c.height = this.map.height;
    const ctx = c.getContext('2d')!;
    const k = this.mapScale * this.mapDpr;
    const X = (x: number): number => (x - this.mapX0) * k;
    const Z = (z: number): number => (z - this.mapZ0) * k;
    // дорога шириной, как она есть: отрезок за отрезком
    const seg = (from: number, to: number) => {
      ctx.beginPath();
      for (let i = from; i <= to; i++) {
        const j = i % tr.n;
        if (i === from) ctx.moveTo(X(tr.px[j]), Z(tr.pz[j]));
        else ctx.lineTo(X(tr.px[j]), Z(tr.pz[j]));
      }
      ctx.stroke();
    };
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const [style, extra] of [['rgba(34, 24, 29, 0.85)', 3], ['rgba(255, 243, 222, 0.88)', 0]] as const) {
      ctx.strokeStyle = style;
      for (let i = 0; i < tr.n; i++) {
        ctx.lineWidth = (tr.hw[i] + tr.hw[(i + 1) % tr.n] + extra) * k;
        seg(i, i + 1);
      }
    }
    // настил срезки — коричневым, плиты-ускорители — жёлтыми
    ctx.fillStyle = '#b98a52';
    for (const d of tr.hz.decks) {
      ctx.save();
      ctx.translate(X(d.x), Z(d.z));
      ctx.rotate(Math.atan2(d.fz, d.fx));
      ctx.fillRect(-d.hl * k, -d.hw * k, d.hl * 2 * k, d.hw * 2 * k);
      ctx.restore();
    }
    ctx.fillStyle = '#f2a60c';
    for (const p of tr.hz.pads) {
      ctx.save();
      ctx.translate(X(p.x), Z(p.z));
      ctx.rotate(Math.atan2(p.fz, p.fx));
      ctx.fillRect(-p.hl * k, -p.hw * k, p.hl * 2 * k, p.hw * 2 * k);
      ctx.restore();
    }
    // прыжок через канал — синим
    ctx.strokeStyle = '#3fb6a8';
    ctx.lineCap = 'butt';
    for (let i = 0; i < tr.n; i++) {
      if (!tr.gap[i]) continue;
      ctx.lineWidth = (tr.hw[i] + tr.hw[(i + 1) % tr.n]) * k;
      seg(i, i + 1);
    }
    // линия старта — шашечки поперёк дороги
    const rx = -tr.tz[0];
    const rz = tr.tx[0];
    const cell = Math.max(2, 1.6 * k);
    for (let s = -tr.hw[0]; s < tr.hw[0]; s += 1.6) {
      const odd = Math.round((s + tr.hw[0]) / 1.6) % 2 === 1;
      ctx.fillStyle = odd ? '#22181d' : '#ffffff';
      const x = (tr.px[0] + rx * s - this.mapX0) * k;
      const y = (tr.pz[0] + rz * s - this.mapZ0) * k;
      ctx.fillRect(x - cell / 2, y - cell / 2, cell, cell);
    }
    return c;
  }

  /** Точки картов на мини-карте; свой — крупнее и сверху. */
  drawMap(dots: readonly MapDot[]): void {
    const ctx = this.mapCtx;
    const k = this.mapScale * this.mapDpr;
    ctx.clearRect(0, 0, this.map.width, this.map.height);
    ctx.drawImage(this.mapBase, 0, 0);
    for (let pass = 0; pass < 2; pass++) {
      for (const d of dots) {
        if (d.me !== (pass === 1)) continue;
        const r = (d.me ? 6 : 4.2) * this.mapDpr;
        ctx.beginPath();
        ctx.arc((d.x - this.mapX0) * k, (d.z - this.mapZ0) * k, r, 0, Math.PI * 2);
        ctx.fillStyle = d.color;
        ctx.fill();
        ctx.lineWidth = (d.me ? 2.4 : 1.4) * this.mapDpr;
        ctx.strokeStyle = d.me ? '#ffffff' : 'rgba(34, 24, 29, 0.9)';
        ctx.stroke();
      }
    }
  }

  // ------------------------------------------------------------ отсчёт и сообщения

  /** Отсчёт на решётке: 3, 2, 1, 0 — «Вперёд!», null — спрятать. */
  setCount(n: number | null): void {
    const key = n === null ? '' : String(n);
    if (!this.set('count', key)) return;
    if (n === null) {
      this.countEl.className = 'rc-count';
      return;
    }
    this.countEl.textContent = n > 0 ? String(n) : 'Вперёд!';
    this.countEl.className = 'rc-count';
    void this.countEl.offsetWidth;
    this.countEl.className = `rc-count show${n === 0 ? ' go' : ''}`;
  }

  /** Крупная плашка сверху: «Круг 2/3», «Последний круг!», «Финиш!» */
  banner(html: string, ms = 1800, cls = ''): void {
    this.bannerEl.innerHTML = html;
    this.bannerEl.className = 'rc-banner';
    void this.bannerEl.offsetWidth;
    this.bannerEl.className = `rc-banner show${cls ? ` ${cls}` : ''}`;
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => (this.bannerEl.className = 'rc-banner'), ms);
  }

  wrongWay(on: boolean): void {
    if (this.set('wrong', on)) this.wrongEl.classList.toggle('show', on);
  }

  /**
   * Финиш: крупное место посреди экрана («1» золотом) и залп конфетти из-за краёв; гаснет само за PARTY_MS.
   */
  celebrate(place: number, total: number): void {
    this.root.querySelector('.rc-party')?.remove();
    const party = el('div', `rc-party${place === 1 ? ' win' : place <= 3 ? ' podium' : ''}`, this.root);
    const big = el('div', 'rc-party-place', party);
    el('b', '', big, String(place));
    el('span', '', big, place === 1 ? 'место — победа!' : `место из ${total}`);
    for (let i = 0; i < PARTY_BITS; i++) {
      const bit = el('i', 'rc-party-bit', party);
      const fromLeft = i % 2 === 0;
      const st = bit.style;
      st.left = fromLeft ? '-2%' : '102%';
      st.top = `${(55 + Math.random() * 35).toFixed(1)}%`;
      st.background = PARTY_COLORS[i % PARTY_COLORS.length];
      st.setProperty('--dx', `${((fromLeft ? 1 : -1) * (18 + Math.random() * 42)).toFixed(1)}vw`);
      st.setProperty('--dy', `${(-38 - Math.random() * 40).toFixed(1)}vh`);
      st.setProperty('--rot', `${Math.round(360 + Math.random() * 900) * (Math.random() < 0.5 ? -1 : 1)}deg`);
      st.animationDelay = `${Math.round(Math.random() * 260)}ms`;
      st.width = `${(6 + Math.random() * 6).toFixed(1)}px`;
      st.height = `${(9 + Math.random() * 8).toFixed(1)}px`;
    }
    setTimeout(() => party.remove(), PARTY_MS);
  }

  /**
   * В тебя попали краской: кляксы ложатся по краям экрана (середина почти чистая — дорогу видно), с них бегут
   * подтёки; держится и тает за 2,5 с. Один холст на попадание; попали ещё раз — поверх, больше двух не держим.
   */
  paint(): void {
    const w = this.root.clientWidth || window.innerWidth;
    const h = this.root.clientHeight || window.innerHeight;
    const { canvas, drips } = paintScreen(w, h, Math.min(1.5, window.devicePixelRatio || 1));
    const s = el('div', 'rc-splat', this.paintLayer);
    s.appendChild(canvas);
    for (const d of drips) {
      const box = el('div', 'rc-drip', s);
      box.style.cssText = `left:${d.x.toFixed(1)}px;top:${d.y.toFixed(1)}px;width:${d.w.toFixed(1)}px;height:${d.h.toFixed(1)}px`;
      el('i', '', box).style.animationDelay = `${d.delay}ms`;
    }
    setTimeout(() => s.remove(), SPLAT_MS + 100);
    while (this.paintLayer.childElementCount > 2) this.paintLayer.firstElementChild?.remove();
  }

  // ------------------------------------------------------------ итоги

  /**
   * Таблица итогов: место, цвет, ник (🤖 у ботов), время, лучший круг, жетоны. Строки — по местам;
   * кто не доехал, стоит по пройденному пути с бледным номером.
   */
  showResults(rows: readonly RaceResultRow[], myId: number, colorOf: (id: number) => string): void {
    const me = rows.find((r) => r.id === myId);
    const title = me && me.place > 0 ? (me.place === 1 ? 'Победа!' : `${me.place}-е место`) : 'Гонка окончена';
    const card = el('div', 'overlay-card rc-res-card');
    el('div', `rc-res-title${me && me.place === 1 ? ' win' : ''}`, card, title);
    el('div', 'rc-res-reward', card);
    const table = el('table', 'rc-res-table', card);
    table.innerHTML = `<thead><tr><th>#</th><th class="n">Гонщик</th><th>Время</th><th>Лучший круг</th><th>${COIN_HTML}</th></tr></thead>`;
    const body = el('tbody', '', table);
    rows.forEach((r, i) => {
      const tr = el('tr', `${r.id === myId ? 'me' : ''}${r.place > 0 ? '' : ' dnf'}`, body);
      el('td', 'pl', tr, String(r.place > 0 ? r.place : i + 1));
      const name = el('td', 'n', tr);
      const dot = el('i', 'rc-dot', name);
      dot.style.background = colorOf(r.id);
      name.append(`${r.bot ? '🤖 ' : ''}${r.nick}`);
      el('td', '', tr, r.place > 0 && r.time > 0 ? fmtRaceTime(r.time) : 'не доехал');
      el('td', '', tr, r.best > 0 ? fmtRaceTime(r.best) : '—');
      el('td', 'tk', tr, r.tokens > 0 ? `+${r.tokens}` : '');
    });
    el('div', 'rc-res-left', card);
    this.results.innerHTML = '';
    this.results.appendChild(card);
    this.results.classList.add('show');
    // под итогами — ни бонуса, ни скорости, ни баннеров
    this.root.classList.add('rc-over');
    this.bannerEl.className = 'rc-banner';
    this.last.resLeft = '';
  }

  setResultsLeft(sec: number): void {
    const t = `На набережную через ${Math.max(0, Math.ceil(sec))} с`;
    if (!this.set('resLeft', t)) return;
    const line = this.results.querySelector('.rc-res-left');
    if (line) line.textContent = t;
  }

  /** Жетоны за гонку — строкой в окне итогов. */
  setReward(text: string): void {
    const line = this.results.querySelector('.rc-res-reward');
    if (line) setCoinText(line, `🪙 ${text}`);
  }

  hideResults(): void {
    this.results.classList.remove('show');
    this.results.innerHTML = '';
    this.root.classList.remove('rc-over');
  }

  get resultsShown(): boolean {
    return this.results.classList.contains('show');
  }

  setStats(text: string | null): void {
    const t = text ?? '';
    if (this.set('stats', t)) {
      this.stats.textContent = t;
      this.stats.style.display = text ? '' : 'none';
    }
  }
}

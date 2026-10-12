// Интерфейс гонки на ките 2.0 (как на странице lab/ui «Режимы» → «Картинг»): карточка места (верх-лево), мини-карта
// под бейджем, скорость (низ-право), бонус и заряд заноса (низ-центр), ряд клавиш перед стартом, отсчёт по центру,
// баннеры «Круг 2/3», «Последний круг!», «Финиш!» и «Не туда!» — крупно через верх-центр (ui.top.hero), мелкие события —
// тостами, итоги — общим окном режимов (ModeResults). Свой слой сцены (.hud) — только для линий скорости, клякс краски
// и конфетти на финише. Как у пейнтбола: в кадре трогаем только то, что поменялось. На телефоне бонус — сам кнопка (onTap).
import { TICK_RATE } from '../../shared/constants.ts';
import { ITEM_BUBBLE, ITEM_CLAP, ITEM_HINTS, ITEM_JAM, ITEM_NAMES, ITEM_NONE, ITEM_PAINT, ITEM_POOL, ITEM_TURBO, MT1_TICKS, MT2_TICKS, MT3_TICKS, RC_LAPS, RC_RESULTS_TICKS } from '../../shared/kart.ts';
import type { RaceResultRow } from '../../shared/messages.ts';
import type { Track } from '../../shared/track.ts';
import type { Ui } from '../scene.ts';
import { TOUCH } from '../touch.ts';
import { coinHtml, h, iconImg } from '../ui/kit/dom.ts';
import { uiIcon } from '../ui/kit/icons.ts';
import { ModeCount, ModeResults, ModeSpeed, ModeStand, capHtml, esc, keysRow, placeHtml } from '../ui/kit/modes.ts';
import { PRIO } from '../ui/kit/topcenter.ts';
import { paintScreen, preparePaint } from './paint.ts';
import { SpeedLines } from './speedlines.ts';
import './ui.css';

/** Мини-карта: ширина холста (css px; плашка 180 = холст + поля 5) и наибольшая высота; на телефоне — меньше */
const MAP_W = TOUCH ? 116 : 170;
const MAP_H_MAX = TOUCH ? 110 : 150;
const MAP_PAD = TOUCH ? 5 : 8;
/** Рулетка бонуса: значок меняется раз в столько мс */
const ROLL_MS = 75;
/** Кляксы краски держатся 2,5 с (как PAINT_TICKS на сервере) */
const SPLAT_MS = 2500;
/** Конфетти на финише, мс */
const PARTY_MS = 3400;
const PARTY_BITS = 46;
const PARTY_COLORS = ['#ff5d73', '#ffd23f', '#3ddc97', '#4cc9f0', '#c77dff', '#ff9a2e', '#f4efe6'];
/** Иконки бонусов (client/assets/ui/icons) по ITEM_* */
const ITEM_IC: Record<number, string> = { [ITEM_TURBO]: 'kart-turbo', [ITEM_JAM]: 'kart-jam', [ITEM_PAINT]: 'paint', [ITEM_BUBBLE]: 'kart-bubble', [ITEM_CLAP]: 'kart-clap' };
/** Значок события в тексте баннера (match.ts шлёт «🚀 Ракетный старт!») → иконка кита */
const EMOJI_IC: Record<string, string> = { '🏁': 'flag-finish', '🏆': 'medal-gold', '🔔': 'flag-finish', '🫧': 'kart-bubble', '💥': 'kart-clap', '🍯': 'kart-jam', '🎨': 'paint', '🚀': 'kart-turbo', '✨': 'kart-turbo' };
const LEAD_EMOJI = /^[\p{Extended_Pictographic}️‍\s]+/u;
/** Ключи верх-центра (свои — с префиксом rc-) */
const K_HERO = 'rc-hero';
const K_WRONG = 'rc-wrong';
const K_EV = 'rc-ev';
/** Заряд заноса: подпись и тон полосы по уровню (белый копится → синий → оранжевый → фиолетовый) */
const CHARGE_TEXT = ['Держи занос', 'Синее — можно отпускать', 'Оранжевое — держи ещё', 'Фиолетовое — отпускай!'];
const CHARGE_TONE = ['rc-meter-0', 'k-meter--info', '', 'k-meter--special'];

export interface MapDot {
  x: number;
  z: number;
  color: string;
  me: boolean;
}

/** 83 456 мс → «1:23.4» */
export function fmtRaceTime(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 100));
  const m = Math.floor(t / 600);
  const s = Math.floor((t % 600) / 10);
  return `${m}:${String(s).padStart(2, '0')}.${t % 10}`;
}

/** Цвет токена кита на элементе (холст карты рисует теми же цветами, что и плашки) */
function token(e: HTMLElement, name: string, fallback: string): string {
  return getComputedStyle(e).getPropertyValue(name).trim() || fallback;
}

/** Кит сцены: слоты и верх-центр (ui) и оболочка (#hud) — для окна итогов */
export interface RaceKit {
  ui: Ui;
  shell: HTMLElement;
}

export class RaceHud {
  /** Телефон: нажали на бонус — как клавишу */
  onTap: (code: string) => void = () => {};
  /** Итоги: «На набережную» мышью (Esc ловит сцена) */
  onLeave: () => void = () => {};
  /** Итоги появились (сцена отпускает мышь: кнопки окна нажимаются) */
  onResults: () => void = () => {};
  readonly root: HTMLElement;
  private readonly ui: Ui;
  private readonly trackName: string;
  /** Свои детали в слотах кита: прячутся вместе со сценой (сцен гонки несколько — по трассам) */
  private readonly parts: HTMLElement[] = [];
  private readonly stand: ModeStand;
  private readonly statsEl: HTMLElement;
  private readonly mapPlate: HTMLElement;
  private readonly map: HTMLCanvasElement;
  private readonly mapCtx: CanvasRenderingContext2D;
  private mapBase: HTMLCanvasElement | null = null;
  private readonly track: Track;
  private readonly mapScale: number;
  private readonly mapH: number;
  private readonly mapX0: number;
  private readonly mapZ0: number;
  private readonly mapDpr: number;
  private meColor = '#f5b100';
  private inkColor = '#16313a';
  private readonly keys: HTMLElement;
  private readonly charge: HTMLElement;
  private readonly chargeBar: HTMLElement;
  private readonly chargeText: HTMLElement;
  private readonly item: HTMLButtonElement;
  private readonly itemIc: HTMLElement;
  private readonly itemName: HTMLElement;
  private readonly itemHint: HTMLElement;
  private readonly itemKeys: HTMLElement;
  private readonly speed: ModeSpeed;
  private readonly count: ModeCount;
  private readonly paintLayer: HTMLElement;
  private readonly results: ModeResults;
  private readonly lines: SpeedLines;
  private last: Record<string, string | number | boolean> = {};
  private visible = false;
  private over = false;

  constructor(root: HTMLElement, track: Track, kit: RaceKit) {
    this.root = root;
    this.ui = kit.ui;
    this.track = track;
    this.trackName = track.name;
    root.innerHTML = '';
    preparePaint();
    // линии скорости — первым слоем, под всем интерфейсом
    this.lines = new SpeedLines(root);
    const { slots } = kit.ui;

    // --- верх-лево: карточка места «4/6 · Круг 1/3 · 0:21.0», под ней — FPS (по настройке)
    this.stand = new ModeStand(slots.tl, `Картинг · ${track.name}`, uiIcon('flag-finish'));
    this.stand.root.dataset.mode = 'race';
    this.statsEl = h('div', 'k-faint rc-stats');
    this.statsEl.hidden = true;
    slots.tl.append(this.statsEl);
    this.adopt(this.stand.root, this.statsEl);

    // --- под бейджем: мини-карта (трасса рисуется один раз, точки картов — каждый кадр)
    this.mapDpr = Math.min(2, window.devicePixelRatio || 1);
    this.mapPlate = h('div', 'k-plate mo-map rc-map');
    this.mapPlate.setAttribute('aria-label', `Карта: ${track.name}`);
    this.map = this.mapPlate.appendChild(document.createElement('canvas'));
    slots.tr.append(this.mapPlate);
    this.adopt(this.mapPlate);
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
    // карта по пропорциям трассы: вписана в MAP_W × MAP_H_MAX, по ширине — по центру
    const spanX = x1 - x0 + track.half * 2;
    const spanZ = z1 - z0 + track.half * 2;
    this.mapScale = Math.min((MAP_W - MAP_PAD * 2) / spanX, (MAP_H_MAX - MAP_PAD * 2) / spanZ);
    this.mapH = Math.round(spanZ * this.mapScale + MAP_PAD * 2);
    const padX = (MAP_W - spanX * this.mapScale) / 2;
    this.mapX0 = x0 - track.half - padX / this.mapScale;
    this.mapZ0 = z0 - track.half - MAP_PAD / this.mapScale;
    this.map.width = Math.round(MAP_W * this.mapDpr);
    this.map.height = Math.round(this.mapH * this.mapDpr);
    this.map.style.width = `${MAP_W}px`;
    this.map.style.height = `${this.mapH}px`;
    this.mapCtx = this.map.getContext('2d')!;

    // --- низ-центр: ряд клавиш (перед стартом), заряд заноса, бонус
    this.keys = keysRow([['W', 'газ'], ['S', 'тормоз'], [['A', 'D'], 'руль'], ['Space', 'занос'], ['R', 'на трассу']]);
    this.keys.classList.add('rc-keys', 'key-hint');
    this.charge = h('div', 'mo-charge rc-charge');
    this.charge.innerHTML = `<span class="k-meter k-meter--lg rc-meter-0" style="--v:0;--g:0"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i><span class="k-meter-label"></span></span>
      <i class="mo-tick" style="left:${((MT1_TICKS / MT3_TICKS) * 100).toFixed(1)}%"></i><i class="mo-tick" style="left:${((MT2_TICKS / MT3_TICKS) * 100).toFixed(1)}%"></i>`;
    this.chargeBar = this.charge.querySelector('.k-meter')!;
    this.chargeText = this.charge.querySelector('.k-meter-label')!;
    this.item = h('button', 'k-plate mo-item is-empty rc-item');
    this.item.type = 'button';
    this.item.tabIndex = -1;
    this.item.innerHTML = `<span class="mo-item-ic"></span><span class="mo-item-txt"><b></b><small></small></span>
      <span class="mo-item-keys"><span class="k-keys">${capHtml('E')}${capHtml('ЛКМ')}</span></span>`;
    this.itemIc = this.item.querySelector('.mo-item-ic')!;
    this.itemName = this.item.querySelector('.mo-item-txt > b')!;
    this.itemHint = this.item.querySelector('.mo-item-txt > small')!;
    this.itemKeys = this.item.querySelector('.mo-item-keys')!;
    if (TOUCH) {
      // телефон: бонус — кнопка (нажимается, только пока бонус лежит). Сразу по касанию, как короткое E:
      // газ и руль держат другие пальцы и не мешают
      this.itemKeys.remove();
      this.item.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (!this.item.classList.contains('is-ready')) return;
        this.onTap('KeyE');
        this.itemPressed();
      });
    }
    slots.bc.append(this.keys, this.charge, this.item);
    this.adopt(this.keys, this.charge, this.item);
    this.keys.hidden = true;
    this.charge.hidden = true;

    // --- низ-право: скорость; центр: отсчёт
    this.speed = new ModeSpeed(slots.br);
    this.adopt(this.speed.root);
    this.count = new ModeCount(slots.c);

    // --- свой слой: кляксы краски; окно итогов — в оболочке рядом со слоем кита
    this.paintLayer = h('div', 'rc-paint');
    root.append(this.paintLayer);
    this.results = new ModeResults(kit.shell);
    this.results.scrim.classList.add('rc-scrim');
    this.results.onAction = (id) => {
      if (id === 'leave') this.onLeave();
    };
    this.setItem(ITEM_NONE, false, 0);
    this.applyVisible();
  }

  /** Детали в слотах кита — свои: прячутся со сценой (класс rc-off) и только в гонке (rc-only, ui.css) */
  private adopt(...els: HTMLElement[]): void {
    for (const e of els) {
      e.classList.add('rc-only');
      this.parts.push(e);
    }
  }

  private applyVisible(): void {
    for (const e of this.parts) e.classList.toggle('rc-off', !this.visible);
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
    if (!this.set('vis', v)) return;
    this.visible = v;
    this.root.classList.toggle('hidden', !v);
    this.applyVisible();
    if (v) {
      // трасса — цветами кита (плашка уже на месте: токены светлого HUD читаются)
      if (!this.mapBase) this.mapBase = this.drawTrack(this.track);
      return;
    }
    this.count.set(null);
    this.ui.top.clearHero(K_HERO);
    this.ui.top.clearHero(K_WRONG);
    this.ui.top.clearToasts('rc-');
    this.hideResults();
  }

  /** Новый заезд: убрать итоги, кляксы, отсчёт и баннеры прошлого. */
  reset(): void {
    this.hideResults();
    this.paintLayer.innerHTML = '';
    this.root.querySelector('.rc-party')?.remove();
    this.count.set(null);
    this.ui.top.clearHero(K_HERO);
    this.ui.top.clearHero(K_WRONG);
    this.ui.top.clearToasts('rc-');
    const vis = this.last.vis;
    this.last = {};
    if (vis !== undefined) this.last.vis = vis;
    this.setItem(ITEM_NONE, false, 0);
  }

  // ------------------------------------------------------------ место, круг, время

  /** place 0 — ещё не известно; lap — текущий круг (1…laps) */
  setStanding(place: number, total: number, lap: number, laps: number): void {
    this.stand.set(place, total, lap, laps);
  }

  /** Время гонки и лучший круг, мс (null — нет) */
  setTimes(raceMs: number | null, bestMs: number | null): void {
    this.stand.setTime(raceMs === null ? '0:00.0' : fmtRaceTime(raceMs));
    this.stand.setBest(bestMs === null ? '' : fmtRaceTime(bestMs));
  }

  setSpeed(kmh: number): void {
    this.speed.set(kmh);
  }

  /** Бонус: rolling — крутится рулетка (значки меняются), иначе — что лежит (ITEM_NONE — пусто) и что он делает. */
  setItem(item: number, rolling: boolean, nowMs: number): void {
    const show = rolling ? ITEM_POOL[Math.floor(nowMs / ROLL_MS) % ITEM_POOL.length] : item;
    const state = rolling ? 'is-rolling' : item !== ITEM_NONE ? 'is-ready' : 'is-empty';
    if (this.set('itemState', state)) {
      this.item.classList.remove('is-rolling', 'is-ready', 'is-empty');
      this.item.classList.add(state);
      this.item.dataset.sfx = state === 'is-ready' ? 'pop' : '';
    }
    if (this.set('itemIcon', show)) {
      this.itemIc.innerHTML = show === ITEM_NONE ? iconImg('kart', 'mo-ghost') : iconImg(ITEM_IC[show] ?? 'kart', 'mo-ic');
    }
    const name = rolling ? 'Крутится…' : item !== ITEM_NONE ? (ITEM_NAMES[item] ?? '') : 'Пока пусто';
    const hint = rolling ? 'бонус выпадет через миг' : item !== ITEM_NONE ? (ITEM_HINTS[item] ?? '') : 'проедь через ящик — бонус';
    if (!this.set('itemName', `${name}|${hint}`)) return;
    this.itemName.textContent = name;
    this.itemHint.textContent = hint;
    this.item.setAttribute('aria-label', item !== ITEM_NONE && !rolling ? `Бонус: ${name} — ${hint}` : 'Бонус: пусто');
  }

  /** Телефон: нажали на бонус — окошко вдавилось, значок вылетает из него и тает (бонус уже ушёл, как E). */
  private itemPressed(): void {
    this.item.classList.add('is-press');
    setTimeout(() => this.item.classList.remove('is-press'), 140);
    const r = this.itemIc.getBoundingClientRect();
    const img = this.itemIc.querySelector('img');
    if (!img) return;
    const pop = h('div', 'rc-item-pop');
    pop.append(img.cloneNode());
    pop.style.left = `${(r.left + r.width / 2).toFixed(1)}px`;
    pop.style.top = `${(r.top + r.height / 2).toFixed(1)}px`;
    this.root.append(pop);
    setTimeout(() => pop.remove(), 600);
  }

  /** Заряд заноса: driftT — сколько тиков длится занос, null — не в заносе (полоса прячется). */
  setCharge(driftT: number | null): void {
    const on = driftT !== null && !this.over;
    if (this.set('charge', on)) this.charge.hidden = !on;
    if (driftT === null) return;
    const lvl = driftT >= MT3_TICKS ? 3 : driftT >= MT2_TICKS ? 2 : driftT >= MT1_TICKS ? 1 : 0;
    if (this.set('chargeLvl', lvl)) {
      this.chargeBar.className = `k-meter k-meter--lg ${CHARGE_TONE[lvl]}`;
      this.chargeText.textContent = CHARGE_TEXT[lvl];
      this.charge.classList.toggle('is-max', lvl === 3);
    }
    const v = (Math.min(1, driftT / MT3_TICKS)).toFixed(2);
    if (this.set('chargeV', v)) {
      this.chargeBar.style.setProperty('--v', v);
      this.chargeBar.style.setProperty('--g', v);
    }
  }

  /** Ряд клавиш (на решётке и первые секунды гонки; на телефоне — нет: там кнопки на экране) */
  setHelp(on: boolean): void {
    if (this.set('help', on)) this.keys.hidden = !on || TOUCH || this.over;
  }

  // ------------------------------------------------------------ мини-карта

  /** Трасса на светлой плашке: дорога светлая с тёмной кромкой, настил — коричневым, ускорители — жёлтым, канал — бирюзой */
  private drawTrack(tr: Track): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = this.map.width;
    c.height = this.map.height;
    const ctx = c.getContext('2d')!;
    const plate = this.mapPlate;
    const edge = token(plate, '--surf-faint', '#66808a');
    const road = token(plate, '--surf-solid', '#fffcf6');
    this.meColor = token(plate, '--gold', '#f5b100');
    this.inkColor = token(plate, '--surf-text', '#16313a');
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
    for (const [style, extra] of [[edge, 4], [road, 0]] as const) {
      ctx.strokeStyle = style;
      for (let i = 0; i < tr.n; i++) {
        ctx.lineWidth = (tr.hw[i] + tr.hw[(i + 1) % tr.n] + extra) * k;
        seg(i, i + 1);
      }
    }
    // настил срезки — коричневым, плиты-ускорители — жёлтыми (цвета трассы, как в мире)
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
    // прыжок через канал — бирюзой
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
      ctx.fillStyle = odd ? this.inkColor : '#ffffff';
      const x = (tr.px[0] + rx * s - this.mapX0) * k;
      const y = (tr.pz[0] + rz * s - this.mapZ0) * k;
      ctx.fillRect(x - cell / 2, y - cell / 2, cell, cell);
    }
    return c;
  }

  /** Точки картов на мини-карте: чужие — цветом карта, свой — крупнее, золотом с тёмной обводкой и сверху. */
  drawMap(dots: readonly MapDot[]): void {
    if (!this.mapBase) return;
    const ctx = this.mapCtx;
    const k = this.mapScale * this.mapDpr;
    ctx.clearRect(0, 0, this.map.width, this.map.height);
    ctx.drawImage(this.mapBase, 0, 0);
    for (let pass = 0; pass < 2; pass++) {
      for (const d of dots) {
        if (d.me !== (pass === 1)) continue;
        const r = (d.me ? 6.2 : 4.2) * this.mapDpr;
        ctx.beginPath();
        ctx.arc((d.x - this.mapX0) * k, (d.z - this.mapZ0) * k, r, 0, Math.PI * 2);
        ctx.fillStyle = d.me ? this.meColor : d.color;
        ctx.fill();
        ctx.lineWidth = (d.me ? 2.6 : 1.4) * this.mapDpr;
        ctx.strokeStyle = this.inkColor;
        ctx.stroke();
      }
    }
  }

  // ------------------------------------------------------------ отсчёт и сообщения

  /** Отсчёт на решётке: 3, 2, 1, 0 — «Вперёд!», null — спрятать. */
  setCount(n: number | null): void {
    if (n === null) this.count.set(null);
    else this.count.set(n > 0 ? n : 'Вперёд!', n === 0);
  }

  /**
   * Сообщение гонки (match.ts: «🔔 Последний круг!», «Круг 2/3», «🏁 Финиш!», «🚀 Ракетный старт!», бонусы).
   * Круг и финиш — крупным золотым баннером по центру, остальное — тостом сверху с иконкой; <small> — подстрокой.
   */
  banner(html: string, ms = 1800, cls = ''): void {
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    const small = tpl.content.querySelector('small');
    const sub = small?.textContent?.trim() ?? '';
    small?.remove();
    const raw = (tpl.content.textContent ?? '').trim();
    const emoji = LEAD_EMOJI.exec(raw)?.[0].trim() ?? '';
    const title = raw.slice(LEAD_EMOJI.exec(raw)?.[0].length ?? 0).trim();
    if (!title || this.over) return;
    // бонус выпал: он и так на плашке бонуса внизу — второй раз сверху не пишем (звук даёт match.ts)
    if (ITEM_NAMES.includes(title) && ITEM_HINTS.includes(sub)) return;
    if (/^(Последний круг|Финиш|Круг \d)/.test(title)) {
      this.ui.top.hero({ key: K_HERO, prio: PRIO.mode, tone: 'gold', title, sub: sub || undefined, life: Math.max(1800, ms + 600) });
      return;
    }
    const ic = EMOJI_IC[[...emoji][0] ?? ''] ?? (title.startsWith(this.trackName) ? 'flag-finish' : 'kart');
    const warn = /^(Рано|Мимо|Варенье|Хлопок!)/.test(title) || title.includes('лопнул');
    this.ui.top.toast({ key: title.startsWith(this.trackName) ? 'rc-intro' : K_EV, tone: cls === 'gold' ? 'good' : warn ? 'warn' : 'info', icon: uiIcon(ic), title, sub: sub || undefined, life: Math.max(2200, ms + 800) });
  }

  /** «Не туда!» — красным крупно по центру, пока едешь против хода */
  wrongWay(on: boolean): void {
    if (!this.set('wrong', on)) return;
    if (on) this.ui.top.hero({ key: K_WRONG, prio: PRIO.mode + 5, tone: 'lose', title: 'Не туда!', sub: 'Разворачивайся', life: 600000 });
    else this.ui.top.clearHero(K_WRONG);
  }

  /** Финиш: крупное место золотым баннером по центру и залп конфетти из-за краёв; гаснет само. */
  celebrate(place: number, total: number): void {
    this.ui.top.clearHero(K_WRONG);
    this.ui.top.hero({ key: K_HERO, prio: PRIO.mode, tone: 'gold', title: place === 1 ? 'Победа!' : `${place}-е место`, sub: place === 1 ? `Финиш первым из ${total}` : `Финиш · из ${total}`, life: PARTY_MS });
    this.root.querySelector('.rc-party')?.remove();
    const party = h('div', 'rc-party');
    this.root.append(party);
    for (let i = 0; i < PARTY_BITS; i++) {
      const bit = party.appendChild(h('i', 'rc-party-bit'));
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
    const hh = this.root.clientHeight || window.innerHeight;
    const { canvas, drips } = paintScreen(w, hh, Math.min(1.5, window.devicePixelRatio || 1));
    const s = h('div', 'rc-splat');
    this.paintLayer.append(s);
    s.appendChild(canvas);
    for (const d of drips) {
      const box = s.appendChild(h('div', 'rc-drip'));
      box.style.cssText = `left:${d.x.toFixed(1)}px;top:${d.y.toFixed(1)}px;width:${d.w.toFixed(1)}px;height:${d.h.toFixed(1)}px`;
      box.appendChild(h('i')).style.animationDelay = `${d.delay}ms`;
    }
    setTimeout(() => s.remove(), SPLAT_MS + 100);
    while (this.paintLayer.childElementCount > 2) this.paintLayer.firstElementChild?.remove();
  }

  // ------------------------------------------------------------ итоги

  /**
   * Итоги — общим окном режимов: место медалью, цвет карта и ник («бот» — пилюлей), время, лучший круг, жетоны;
   * своя строка — золотом. Строки — по местам; кто не доехал, стоит по пройденному пути бледнее.
   */
  showResults(rows: readonly RaceResultRow[], myId: number, colorOf: (id: number) => string): void {
    const me = rows.find((r) => r.id === myId);
    const title = me && me.place > 0 ? (me.place === 1 ? 'Победа!' : `${me.place}-е место`) : 'Гонка окончена';
    this.over = true;
    this.ui.top.clearHero(K_WRONG);
    this.ui.top.clearToasts(K_EV);
    this.keys.hidden = true;
    this.charge.hidden = true;
    this.item.hidden = true;
    this.speed.root.hidden = true;
    this.results.show({
      mode: 'race',
      eyebrow: `Картинг · ${this.trackName} · ${RC_LAPS} круга`,
      title,
      sub: me && me.best > 0 ? `Лучший круг ${fmtRaceTime(me.best)}` : undefined,
      head: ['', 'Гонщик', 'Время', 'Лучший круг', coinHtml()],
      rightFrom: 2,
      rows: rows.map((r, i) => ({
        own: r.id === myId,
        dim: r.place <= 0,
        cells: [
          placeHtml(r.place > 0 ? r.place : i + 1),
          `<span class="k-who"><i class="mo-dot" style="background:${esc(colorOf(r.id))}"></i><span>${esc(r.nick)}</span>${r.bot ? '<span class="k-pill k-pill--sm">бот</span>' : ''}</span>`,
          r.place > 0 && r.time > 0 ? fmtRaceTime(r.time) : 'не доехал',
          r.best > 0 ? fmtRaceTime(r.best) : '—',
          r.tokens > 0 ? `+${r.tokens}` : '—',
        ],
      })),
      actions: [{ id: 'leave', label: 'На набережную', key: 'Esc', tone: 'go' }],
    });
    this.last.resLeft = '';
    this.onResults();
  }

  setResultsLeft(sec: number): void {
    const s = Math.max(0, Math.ceil(sec));
    if (!this.set('resLeft', s)) return;
    this.results.note(`На набережную через ${s} с`, Math.min(1, Math.max(0, sec / (RC_RESULTS_TICKS / TICK_RATE))));
  }

  /** Жетоны за гонку — строкой награды в окне итогов («+40 жетонов: финиш +20 · 2-е место +20»). */
  setReward(text: string): void {
    this.results.reward(text);
  }

  hideResults(): void {
    this.results.hide();
    this.over = false;
    this.item.hidden = false;
    this.speed.root.hidden = false;
  }

  get resultsShown(): boolean {
    return this.results.shown;
  }

  setStats(text: string | null): void {
    const t = text ?? '';
    if (!this.set('stats', t)) return;
    this.statsEl.textContent = t;
    this.statsEl.hidden = !text;
  }
}

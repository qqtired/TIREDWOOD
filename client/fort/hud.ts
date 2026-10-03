// Интерфейс «Крепости»: всё «стрелковое» (здоровье, патроны, прицел, метки попаданий, цифры урона, смерть) — общий
// интерфейс пейнтбола (paintball/hud.ts), поверх — своё: полоса сверху (волна, ворота, кристалл, сколько зомби
// осталось или сколько до волны, очки лавки), тревоги («ворота ломают!»), подсказка у стойки (на телефоне — кнопка),
// мини-карта с ордой, таблица защитников (Tab) и итоги игры с жетонами.
import { FORT_WAVES, FT_BREAK, FT_END, FT_GATHER, FT_WAVE, ZK, Z_BOSS, ZS_BOSS_OPEN, ZS_BOSS_APPROACH, ZS_BOSS_GATE, ZS_BOSS_BOMB, ZS_BOSS_PULSE,
  isBossKind, type FortPlayerRow, type FortResultRow, type FortRunRec, type FortWaveCard } from '../../shared/fort.ts';
import { WaveCardView, romanTier } from './wavecard.ts';
import { fortShopItems, type FortShopState } from '../../shared/fortshop.ts';
import { CHUTES, FORT, GATE, ROADS } from '../../shared/fortmap.ts';
import { Hud, fmtTime } from '../paintball/hud.ts';
import { TOUCH } from '../touch.ts';
import { setCoinText } from '../ui/coin.ts';
import './fort.css';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', parent?: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Точка на мини-карте: зомби (тип) или человек */
export interface MapDot {
  x: number;
  z: number;
  kind: number;
}

/** Мини-карта: поле от леса до моря, север — вверх */
const MAP = { x0: -70, x1: 70, z0: -90, z1: 26 };

export class FortHud {
  readonly root: HTMLElement;
  /** Общее «стрелковое» из пейнтбола */
  readonly pb: Hud;
  /** Телефон: нажали на подсказку у стойки */
  onTapUse: () => void = () => {};
  onShopBuy: (id: number) => void = () => {};
  onShopClose: () => void = () => {};
  private readonly waveEl: HTMLElement;
  private readonly phaseEl: HTMLElement;
  private readonly defenseEl: HTMLElement;
  private readonly infoEl: HTMLElement;
  private readonly gateBox: HTMLElement;
  private readonly gateFill: HTMLElement;
  private readonly gateNum: HTMLElement;
  private readonly crysBox: HTMLElement;
  private readonly crysFill: HTMLElement;
  private readonly crysNum: HTMLElement;
  private readonly ptsEl: HTMLElement;
  private readonly alertEl: HTMLElement;
  private readonly hintEl: HTMLElement;
  private readonly hintKey: HTMLElement;
  private readonly hintText: HTMLElement;
  private readonly hintPrice: HTMLElement;
  private readonly map: HTMLCanvasElement;
  private readonly mapCtx: CanvasRenderingContext2D;
  private readonly mapBase: HTMLCanvasElement;
  private readonly board: HTMLElement;
  private readonly end: HTMLElement;
  private readonly deathTitle: HTMLElement | null;
  private readonly deathBy: HTMLElement | null;
  /** Карточка волны: что идёт, откуда, босс, событие */
  readonly card: WaveCardView;
  private readonly bossEl: HTMLElement;
  private readonly bossName: HTMLElement;
  private readonly bossFill: HTMLElement;
  private readonly bossInfo: HTMLElement;
  private readonly shop: HTMLDialogElement;
  private readonly shopBalance: HTMLElement;
  private readonly shopTime: HTMLElement;
  private readonly shopNotice: HTMLElement;
  private readonly shopClose: HTMLButtonElement;
  private readonly shopRows = new Map<number, { buy: HTMLButtonElement; reason: HTMLElement }>();
  private last: Record<string, string | number | boolean> = {};
  private alertTimer = 0;

  constructor(root: HTMLElement) {
    this.root = root;
    this.pb = new Hud(root);
    root.classList.add('fort-hud');
    this.deathTitle = root.querySelector('.death-title');
    this.deathBy = root.querySelector('.death-by');
    if (this.deathTitle) this.deathTitle.textContent = 'Тебя повалили!';

    // --- полоса сверху
    const top = el('div', 'ft-top', root);
    const wave = el('div', 'ft-wave', top);
    this.phaseEl = el('span', 'ft-phase', wave, 'СБОР');
    this.waveEl = el('b', 'ft-wave-n', wave, '1');
    this.infoEl = el('span', 'ft-info', wave, '');
    const meter = (cls: string, icon: string): [HTMLElement, HTMLElement, HTMLElement] => {
      const box = el('div', `ft-meter ${cls}`, top);
      el('span', 'ft-icon', box, icon);
      const bar = el('div', 'ft-bar', box);
      const fill = el('i', '', bar);
      const num = el('b', 'ft-num', box, '');
      return [box, fill, num];
    };
    [this.gateBox, this.gateFill, this.gateNum] = meter('ft-gate', '🚪');
    [this.crysBox, this.crysFill, this.crysNum] = meter('ft-crys', '💎');
    this.ptsEl = el('div', 'ft-pts', top, '⭐ 0');
    this.ptsEl.title = 'Очки лавки: за сбитых и отбитые волны';
    this.alertEl = el('div', 'ft-alert', root);
    this.alertEl.setAttribute('role', 'status');
    const briefing = el('div', 'ft-briefing', root);
    this.card = new WaveCardView(briefing, root);
    this.defenseEl = el('div', 'ft-defense', briefing);
    this.defenseEl.title = 'Колокол на террасе: 8 секунд защиты строений, общий откат 30 секунд. Игроки по-прежнему получают полный урон.';
    this.bossEl = el('div', 'ft-boss', briefing);
    this.bossName = el('b', 'ft-boss-name', this.bossEl, ZK[Z_BOSS].name);
    const bossBar = el('div', 'ft-boss-bar', this.bossEl);
    bossBar.setAttribute('role', 'progressbar');
    bossBar.setAttribute('aria-label', 'Здоровье босса');
    bossBar.setAttribute('aria-valuemin', '0');
    bossBar.setAttribute('aria-valuemax', '100');
    this.bossFill = el('i', '', bossBar);
    el('b', 'ft-boss-rage', bossBar).title = 'Ярость на половине здоровья';
    this.bossInfo = el('span', 'ft-boss-info', this.bossEl);

    // --- подсказка у стойки
    this.hintEl = el('div', 'ft-hint', root);
    this.hintKey = el('b', 'ft-key', this.hintEl, TOUCH ? '👆' : 'E');
    this.hintText = el('span', 'ft-hint-text', this.hintEl);
    this.hintPrice = el('span', 'ft-price', this.hintEl);
    if (TOUCH) {
      this.hintEl.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (this.hintEl.classList.contains('can')) this.onTapUse();
      });
    }
    if (!TOUCH) {
      el('div', 'ft-help', root).innerHTML =
        '<b>ЛКМ</b> огонь · <b>ПКМ</b> прицел · <b>E</b> у стоек — лавка · <b>Q</b> плечо · <b>Tab</b> защитники · <b>M</b> звук';
    }

    // --- мини-карта: подложка (луг, дороги, стены) рисуется один раз
    const size = TOUCH ? 104 : 168;
    this.map = el('canvas', 'ft-map', root);
    this.map.width = size * 2;
    this.map.height = Math.round(size * 2 * ((MAP.z1 - MAP.z0) / (MAP.x1 - MAP.x0)));
    this.map.style.width = `${size}px`;
    this.mapCtx = this.map.getContext('2d')!;
    this.mapBase = this.drawMapBase(this.map.width, this.map.height);

    this.board = el('div', 'board overlay-card ft-board', root);
    this.end = el('div', 'endscreen ft-end', root);

    this.shop = el('dialog', 'ft-shop', root);
    this.shop.setAttribute('aria-labelledby', 'ft-shop-title');
    const shopHeader = el('div', 'ft-shop-head', this.shop);
    const title = el('h2', '', shopHeader, 'Лавка защитника');
    title.id = 'ft-shop-title';
    this.shopClose = el('button', 'ft-shop-close', shopHeader, 'Закрыть');
    this.shopClose.type = 'button';
    this.shopClose.addEventListener('click', () => this.onShopClose());
    this.shop.addEventListener('cancel', (e) => { e.preventDefault(); this.onShopClose(); });
    this.shopBalance = el('b', 'ft-shop-balance', this.shop);
    this.shopTime = el('span', 'ft-shop-time', this.shop);
    el('p', 'ft-shop-intro', this.shop, 'Покупки действуют до конца этой игры. Ворота, кристалл и краскомёты — общие для всех защитников.');
    const grid = el('div', 'ft-shop-grid', this.shop);
    for (const item of fortShopItems({ phase: FT_GATHER, pts: 0, gate: 0, crystal: 0, turrets: 0, jams: 0, mag: false })) {
      const row = el('article', 'ft-shop-item', grid);
      el('h3', '', row, item.label);
      const detail = el('p', '', row, item.detail);
      detail.id = `ft-shop-detail-${item.id}`;
      const reason = el('span', 'ft-shop-reason', row);
      reason.id = `ft-shop-reason-${item.id}`;
      const buy = el('button', 'ft-shop-buy', row, `Купить · ${item.price} ⭐`);
      buy.type = 'button';
      buy.setAttribute('aria-label', `Купить: ${item.label}, ${item.price} очков`);
      buy.setAttribute('aria-describedby', `${detail.id} ${reason.id}`);
      buy.addEventListener('click', () => this.onShopBuy(item.id));
      this.shopRows.set(item.id, { buy, reason });
    }
    this.shopNotice = el('p', 'ft-shop-notice', this.shop);
    this.shopNotice.setAttribute('role', 'status');
  }

  private set(key: string, value: string | number | boolean): boolean {
    if (this.last[key] === value) return false;
    this.last[key] = value;
    return true;
  }

  // ------------------------------------------------------------ полоса сверху

  /** Волна, фаза и строка справа (сколько зомби или сколько до волны) */
  setWave(phase: number, wave: number, info: string, urgent: boolean): void {
    const ph = phase === FT_GATHER ? 'Сбор' : phase === FT_BREAK ? 'Передышка' : phase === FT_END ? 'Итоги' : 'Волна';
    if (this.set('ph', ph)) this.phaseEl.textContent = ph;
    const shown = phase === FT_BREAK || phase === FT_GATHER ? wave + 1 : wave;
    const w = String(Math.max(1, Math.min(FORT_WAVES, shown)));
    if (this.set('wave', w)) this.waveEl.textContent = w;
    if (this.set('info', info)) this.infoEl.textContent = info;
    if (this.set('urgent', urgent)) this.infoEl.classList.toggle('urgent', urgent);
  }

  /** Карточка волны: в бою — идущая, в передышке и сборе — следующая */
  setCard(card: FortWaveCard | null, phase: number): void {
    this.card.set(phase === FT_END ? null : card, phase !== FT_WAVE);
  }

  setDefense(phase: number, defenders: number, rally: number, cooldown: number): void {
    this.defenseEl.hidden = phase === FT_END;
    const status = rally > 0 ? `Щит строений −50% · ${Math.ceil(rally / 60)} с`
      : cooldown > 0 ? `Колокол восстановится через ${Math.ceil(cooldown / 60)} с`
      : phase === FT_WAVE ? 'Щит готов · E у колокола на террасе' : 'В бою колокол защищает строения на 8 с';
    const text = `Орда на ${Math.max(1, defenders)} · ${status}`;
    if (this.set('defense', text)) this.defenseEl.textContent = text;
    this.defenseEl.classList.toggle('active', rally > 0);
  }

  /**
   * Полоса босса: доля HP, фаза, состояние, отсчёт (окно уязвимости), тип и круг (II, III …), ярость.
   * hp 0 — спрятать.
   */
  setBoss(hp: number, stage: number, state: number, wind: number, kind = Z_BOSS, tier = 0, rage = false): void {
    this.bossEl.classList.toggle('show', hp > 0);
    if (hp <= 0) return;
    const pct = Math.max(0, Math.min(100, Math.ceil(hp * 100)));
    this.bossFill.style.width = `${pct}%`;
    this.bossFill.parentElement!.setAttribute('aria-valuenow', String(pct));
    const k = isBossKind(kind) ? ZK[kind] : ZK[Z_BOSS];
    const title = `${k.icon} ${k.name}${tier > 0 ? ` ${romanTier(tier + 1)}` : ''}`;
    if (this.set('bossName', title)) this.bossName.textContent = title;
    const phase = rage || stage >= 2 ? 'ярость' : '';
    const attack = state === ZS_BOSS_OPEN ? `Ядро открыто · ${Math.max(0, wind / 60).toFixed(1)} с — огонь!`
      : state === ZS_BOSS_APPROACH ? 'Идёт к воротам · приготовьтесь'
      : state === ZS_BOSS_GATE ? 'Замах по воротам · уйдите с метки'
      : state === ZS_BOSS_BOMB ? 'Прицельный залп · уйдите с метки'
      : state === ZS_BOSS_PULSE ? 'Удар по стене · выйдите из круга или прыгните'
      : 'Броня · ждите открытия ядра';
    const text = `${pct}%${phase ? ` · ${phase}` : ''} · ${attack}`;
    if (this.set('bossInfo', text)) this.bossInfo.textContent = text;
    this.bossEl.classList.toggle('open', state === ZS_BOSS_OPEN);
    this.bossEl.classList.toggle('rage', rage || stage >= 2);
  }

  showShop(): void {
    if (!this.shop.open) {
      this.shopNotice.textContent = '';
      this.shop.showModal();
      this.shopClose.focus();
    }
  }

  updateShop(s: FortShopState, wave: number, sec: number, pending: number | null): void {
    if (!this.shop.open) return;
    this.shopBalance.textContent = `Твой баланс: ${s.pts} ⭐`;
    this.shopTime.textContent = `Волна ${Math.min(FORT_WAVES, wave + 1)} через ${Math.max(0, Math.ceil(sec))} с · все в колокол — раньше и +10 % золота`;
    for (const item of fortShopItems(s)) {
      const row = this.shopRows.get(item.id)!;
      row.reason.textContent = pending === item.id ? 'Покупка…' : item.reason;
      row.buy.disabled = Boolean(item.reason) || pending !== null;
    }
  }

  shopMessage(text: string): void { this.shopNotice.textContent = text; }
  hideShop(): void { if (this.shop.open) this.shop.close(); }
  get shopShown(): boolean { return this.shop.open; }

  setGate(hp: number, max: number): void {
    const pct = Math.round((hp / max) * 100);
    if (!this.set('gate', pct)) return;
    this.gateFill.style.width = `${pct}%`;
    this.gateNum.textContent = hp > 0 ? `${pct}%` : 'пали';
    this.gateBox.classList.toggle('low', pct <= 30);
    this.gateBox.classList.toggle('down', hp <= 0);
  }

  setCrystal(hp: number, max: number): void {
    const pct = Math.round((hp / max) * 100);
    if (!this.set('crys', pct)) return;
    this.crysFill.style.width = `${pct}%`;
    this.crysNum.textContent = `${pct}%`;
    this.crysBox.classList.toggle('low', pct <= 30);
  }

  /** Ворота или кристалл только что получили урон — полоска вздрагивает */
  hurt(which: 'gate' | 'crys'): void {
    const box = which === 'gate' ? this.gateBox : this.crysBox;
    box.classList.remove('hit');
    void box.offsetWidth;
    box.classList.add('hit');
  }

  setPoints(n: number): void {
    if (!this.set('pts', n)) return;
    this.ptsEl.textContent = `⭐ ${n}`;
    this.ptsEl.classList.remove('pulse');
    void this.ptsEl.offsetWidth;
    this.ptsEl.classList.add('pulse');
  }

  /** Тревога под полосой: «ворота ломают», «липучка на стене» */
  alert(text: string, ms = 2600): void {
    this.alertEl.textContent = text;
    this.alertEl.className = 'ft-alert';
    void this.alertEl.offsetWidth;
    this.alertEl.className = 'ft-alert show';
    clearTimeout(this.alertTimer);
    this.alertTimer = window.setTimeout(() => (this.alertEl.className = 'ft-alert'), ms);
  }

  // ------------------------------------------------------------ стойки

  /** Подсказка у стойки: null — спрятать; price 0 — без цены; can — нажатие что-то сделает */
  setHint(text: string | null, price: number, can: boolean, afford: boolean): void {
    const key = text === null ? '' : `${text}|${price}|${can}|${afford}`;
    if (!this.set('hint', key)) return;
    this.hintEl.classList.toggle('show', text !== null);
    if (text === null) return;
    this.hintText.textContent = text;
    this.hintPrice.textContent = price > 0 ? `${price} ⭐` : '';
    this.hintPrice.classList.toggle('poor', !afford);
    this.hintEl.classList.toggle('can', can);
    this.hintKey.style.display = can ? '' : 'none';
  }

  // ------------------------------------------------------------ мини-карта

  private drawMapBase(w: number, h: number): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    const k = w / (MAP.x1 - MAP.x0);
    const X = (x: number) => (x - MAP.x0) * k;
    const Z = (z: number) => (z - MAP.z0) * k;
    ctx.fillStyle = 'rgba(70,110,52,0.92)';
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 18);
    ctx.fill();
    // море на юге
    ctx.fillStyle = 'rgba(40,120,160,0.95)';
    ctx.fillRect(0, Z(24), w, h - Z(24));
    // дороги
    ctx.strokeStyle = 'rgba(214,184,132,0.95)';
    ctx.lineWidth = 4.5 * k;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const r of ROADS) {
      ctx.beginPath();
      r.pts.forEach(([x, z], i) => (i ? ctx.lineTo(X(x), Z(z)) : ctx.moveTo(X(x), Z(z))));
      ctx.stroke();
    }
    // стены и двор
    ctx.fillStyle = 'rgba(214,204,182,1)';
    ctx.fillRect(X(FORT.x0), Z(FORT.z0), (FORT.x1 - FORT.x0) * k, (FORT.z1 - FORT.z0) * k);
    ctx.fillStyle = 'rgba(150,140,120,1)';
    ctx.fillRect(X(FORT.x0 + 3), Z(FORT.z0 + 3), (FORT.x1 - FORT.x0 - 6) * k, (FORT.z1 - FORT.z0 - 6) * k);
    // воротные башни и бастионы
    ctx.fillStyle = 'rgba(214,204,182,1)';
    ctx.fillRect(X(-6), Z(-18.5), 12 * k, 3 * k);
    ctx.fillRect(X(-21), Z(-19), 6 * k, 6 * k);
    ctx.fillRect(X(15), Z(-19), 6 * k, 6 * k);
    // жёлоба
    ctx.fillStyle = 'rgba(200,30,50,1)';
    for (const ch of CHUTES) ctx.fillRect(X(ch.x) - 3, Z(ch.z) - 3, 6, 6);
    ctx.strokeStyle = 'rgba(255,240,215,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(1, 1, w - 2, h - 2, 18);
    ctx.stroke();
    return c;
  }

  /** Мини-карта: ворота (целы или нет), кристалл, зомби по типам, свои; me — я со взглядом. */
  drawMap(gateUp: boolean, zombies: readonly MapDot[], nz: number, mates: readonly MapDot[], nm: number, meX: number, meZ: number, meYaw: number, alive: boolean): void {
    const ctx = this.mapCtx;
    const w = this.map.width;
    const k = w / (MAP.x1 - MAP.x0);
    const X = (x: number) => (x - MAP.x0) * k;
    const Z = (z: number) => (z - MAP.z0) * k;
    ctx.clearRect(0, 0, w, this.map.height);
    ctx.drawImage(this.mapBase, 0, 0);
    // ворота: целы — коричневые, пали — красный пролом
    ctx.fillStyle = gateUp ? 'rgba(120,76,40,1)' : 'rgba(255,70,60,1)';
    ctx.fillRect(X(GATE.x0), Z(GATE.face) - 2, (GATE.x1 - GATE.x0) * k, 4 + (gateUp ? 0 : 2));
    // кристалл
    ctx.fillStyle = '#6fe6ff';
    ctx.beginPath();
    ctx.arc(X(0), Z(2.6), 5, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < nz; i++) {
      const z = zombies[i];
      const kk = ZK[z.kind] ?? ZK[0];
      ctx.fillStyle = `#${kk.color.toString(16).padStart(6, '0')}`;
      ctx.beginPath();
      ctx.arc(X(z.x), Z(z.z), isBossKind(z.kind) ? 8 : kk.r >= 0.7 ? 5.5 : 3.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(20,10,10,0.7)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < nm; i++) {
      ctx.beginPath();
      ctx.arc(X(mates[i].x), Z(mates[i].z), 4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (alive) {
      // я — стрелка по взгляду (yaw 0 — на север, вверх)
      ctx.save();
      ctx.translate(X(meX), Z(meZ));
      ctx.rotate(-meYaw);
      ctx.fillStyle = '#ffd35a';
      ctx.strokeStyle = 'rgba(30,20,10,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -9);
      ctx.lineTo(6, 6);
      ctx.lineTo(0, 3);
      ctx.lineTo(-6, 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  // ------------------------------------------------------------ таблицы

  private rosterTable(rows: FortPlayerRow[], myId: number, phase: number): string {
    const calm = phase === FT_GATHER || phase === FT_BREAK;
    const body = [...rows]
      .sort((a, b) => b.k - a.k || a.d - b.d)
      .map((r) => `<tr class="${r.id === myId ? 'me' : ''}"><td class="n">${escapeHtml(r.name)}${calm && r.ready ? ' <i>🔔 готов</i>' : ''}</td><td>${r.k}</td><td>${r.d}</td><td>${r.pts}</td><td class="ping">${r.ping}</td></tr>`)
      .join('');
    return `<div class="board-team ft-team"><h3>Защитники крепости</h3><table><thead><tr><th class="n">Игрок</th><th>Сбил</th><th>Повален</th><th>⭐</th><th>мс</th></tr></thead><tbody>${body}</tbody></table></div>`;
  }

  showBoard(show: boolean, rows: FortPlayerRow[], myId: number, phase: number): void {
    if (show) {
      const html = `${this.rosterTable(rows, myId, phase)}<div class="board-hint">⭐ — очки лавки: зомби, отбитые волны · у стоек их тратят на ворота, кристалл, краскомёты и варенье</div>`;
      if (this.set('boardHtml', html)) this.board.innerHTML = html;
    }
    if (this.set('board', show)) this.board.classList.toggle('show', show);
  }

  /**
   * Итоги: «Крепость пала на волне 37 · рекорд крепости 41 · твой лучший — новый!», лучший защитник, таблица
   * защитников (волн, жетоны) и рекорды крепости (top). record — команда побила рекорд, prev — прежний рекорд.
   */
  showEnd(win: boolean, wave: number, mvp: FortResultRow | null, rows: FortResultRow[], myId: number,
    top: readonly FortRunRec[] = [], record = false, prev = 0): void {
    const title = win ? 'Крепость устояла!' : wave > 0 ? `Крепость пала на волне ${wave + 1}` : 'Кристалл разбит';
    const parts: string[] = [];
    parts.push(win ? `Все ${FORT_WAVES} волн отбиты` : wave > 0 ? `Отбито волн: <b>${wave}</b>` : 'Ни одной волны не отбили');
    if (record && wave > 0) parts.push(`🏆 <b>новый рекорд крепости!</b>${prev ? ` (был ${prev})` : ''}`);
    else if (prev > 0) parts.push(`рекорд крепости — <b>${prev}</b>`);
    const me = rows.find((r) => r.id === myId);
    if (me && wave > 0) {
      const best = me.best ?? 0;
      parts.push(me.waves > best && best > 0 ? `твой лучший — <b>${me.waves}</b>, новый!` : best > 0 ? `твой лучший — ${Math.max(best, me.waves)}` : '');
    }
    const sub = parts.filter(Boolean).join(' · ');
    const mvpHtml = mvp ? `<div class="mvp">⭐ Лучший защитник: <b>${escapeHtml(mvp.name)}</b> — сбил ${mvp.k}</div>` : '';
    const body = rows
      .map((r) => `<tr class="${r.id === myId ? 'me' : ''}"><td class="n">${escapeHtml(r.name)}</td><td>${r.k}</td><td>${r.d}</td><td>${r.waves}</td><td>${r.tokens > 0 ? `+${r.tokens} 🪙` : '—'}</td></tr>`)
      .join('');
    const topHtml = top.length
      ? `<div class="ft-top5"><h3>Рекорды крепости</h3><ol>${top.map((t) => `<li><b>${t.wave}</b> <span>${escapeHtml(t.names.join(', '))}</span></li>`).join('')}</ol></div>`
      : '';
    this.end.innerHTML = `<div class="overlay-card end-card"><div class="end-title ${win || record ? 'win' : 'lose'}">${title}</div><div class="end-sub">${sub}</div>${mvpHtml}<div class="board-team ft-team"><table><thead><tr><th class="n">Защитник</th><th>Сбил</th><th>Повален</th><th>Волн</th><th>Жетоны</th></tr></thead><tbody>${body}</tbody></table></div>${topHtml}<div class="board-hint ft-end-timer">Новая игра начнётся сама через несколько секунд</div></div>`;
    this.end.classList.add('show');
  }

  /** Жетоны за игру — строкой в итогах (приходят сразу после них) */
  showReward(text: string): void {
    const card = this.end.querySelector('.end-card');
    if (!card) return;
    let line = card.querySelector<HTMLElement>('.end-reward');
    if (!line) {
      line = el('div', 'end-reward');
      const table = card.querySelector('.ft-team');
      if (table) table.before(line);
      else card.appendChild(line);
    }
    setCoinText(line, `🪙 ${text}`);
  }

  setEndTimer(sec: number): void {
    const t = `Новая игра — через ${Math.max(0, Math.ceil(sec))} с · сбор у колокола`;
    if (!this.set('endT', t)) return;
    const e = this.end.querySelector('.ft-end-timer');
    if (e) e.textContent = t;
  }

  hideEnd(): void {
    this.end.classList.remove('show');
  }

  get endShown(): boolean {
    return this.end.classList.contains('show');
  }

  // ------------------------------------------------------------ смерть

  showDeath(text: string): void {
    this.pb.showDeath(null, 0, 'fort');
    if (this.deathBy) this.deathBy.textContent = text;
  }

  setVisible(v: boolean): void {
    this.pb.setVisible(v);
    if (!v) {
      this.hideShop();
      this.setBoss(0, 0, 0, 0);
      this.card.hideAll();
      this.hideEnd();
      this.showBoard(false, [], 0, 0);
      this.setHint(null, 0, false, true);
    }
  }
}

export { fmtTime };

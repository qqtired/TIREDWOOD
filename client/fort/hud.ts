// Интерфейс «Крепости»: всё «стрелковое» (здоровье, патроны, прицел, метки попаданий, смерть) — общий интерфейс
// пейнтбола (paintball/hud.ts), поверх — своё: полоса сверху (волна, ворота, кристалл, сколько зомби осталось или
// сколько до волны, золото 💰), тревоги («ворота ломают!»), подсказка у стойки (на телефоне — кнопка), мини-карта
// с ордой, таблица защитников (Tab), итоги игры с жетонами; арсенал — прилавок справа, полоска стволов и гранат,
// цифры урона и золота (stall.ts, floaters.ts).
import { FORT_WAVES, FT_BREAK, FT_END, FT_GATHER, FT_WAVE, ZK, Z_BOSS, ZS_BOSS_OPEN, ZS_BOSS_APPROACH, ZS_BOSS_GATE, ZS_BOSS_BOMB, ZS_BOSS_PULSE,
  waveRole, type FortPlayerRow, type FortResultRow } from '../../shared/fort.ts';
import { FORT, GATE, ROADS, TOWER_SPOTS } from '../../shared/fortmap.ts';
import { Hud, fmtTime } from '../paintball/hud.ts';
import { TOUCH } from '../touch.ts';
import { setCoinText } from '../ui/coin.ts';
import { FortFloaters } from './floaters.ts';
import { ArmsStrip, StallPanel } from './stall.ts';
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
  /** Прилавок (лавка, ворота, кристалл, башни), полоска стволов и гранат, цифры урона и золота */
  readonly stall: StallPanel;
  readonly arms: ArmsStrip;
  readonly floaters: FortFloaters;
  private readonly resumeEl: HTMLElement;
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
  private readonly roleEl: HTMLElement;
  private readonly bossEl: HTMLElement;
  private readonly bossFill: HTMLElement;
  private readonly bossInfo: HTMLElement;
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
    this.waveEl = el('b', 'ft-wave-n', wave, `0 / ${FORT_WAVES}`);
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
    this.ptsEl = el('div', 'ft-pts', top, '💰 0');
    this.ptsEl.title = 'Золото этой игры: за сбитых, общак и бонус волны; тратится у прилавка, ворот, кристалла и мест башен';
    this.alertEl = el('div', 'ft-alert', root);
    this.alertEl.setAttribute('role', 'status');
    const briefing = el('div', 'ft-briefing', root);
    this.roleEl = el('div', 'ft-role', briefing);
    this.defenseEl = el('div', 'ft-defense', briefing);
    this.defenseEl.title = 'Колокол на террасе: 8 секунд защиты строений, общий откат 30 секунд. Игроки по-прежнему получают полный урон.';
    this.bossEl = el('div', 'ft-boss', briefing);
    el('b', 'ft-boss-name', this.bossEl, ZK[Z_BOSS].name);
    const bossBar = el('div', 'ft-boss-bar', this.bossEl);
    bossBar.setAttribute('role', 'progressbar');
    bossBar.setAttribute('aria-label', 'Здоровье Барона Варенья');
    bossBar.setAttribute('aria-valuemin', '0');
    bossBar.setAttribute('aria-valuemax', '100');
    this.bossFill = el('i', '', bossBar);
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
        '<b>ЛКМ</b> огонь · <b>ПКМ</b> прицел · <b>1</b>/<b>2</b> ствол · <b>G</b> граната · <b>E</b> лавка и стойки · <b>Q</b> плечо · <b>Tab</b> защитники';
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

    this.floaters = new FortFloaters(root);
    this.arms = new ArmsStrip(root);
    this.stall = new StallPanel(root);
    this.resumeEl = el('div', 'ars-resume', root, 'Кликни или нажми любую клавишу — обратно в бой');
  }

  /** Курсор свободен (закрыли прилавок Esc): подсказка «кликни — обратно» */
  setResume(show: boolean): void {
    if (this.set('resume', show)) this.resumeEl.classList.toggle('show', show);
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
    const w = `${Math.max(1, Math.min(FORT_WAVES, shown))} / ${FORT_WAVES}`;
    if (this.set('wave', w)) this.waveEl.textContent = w;
    if (this.set('info', info)) this.infoEl.textContent = info;
    if (this.set('urgent', urgent)) this.infoEl.classList.toggle('urgent', urgent);
    const role = waveRole(shown);
    if (this.set('role', role.name)) this.roleEl.textContent = `${role.name} · ${role.hint}`;
    this.roleEl.hidden = phase === FT_END;
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

  setBoss(hp: number, stage: number, state: number, wind: number): void {
    this.bossEl.classList.toggle('show', hp > 0);
    if (hp <= 0) return;
    const pct = Math.max(0, Math.min(100, Math.ceil(hp * 100)));
    this.bossFill.style.width = `${pct}%`;
    this.bossFill.parentElement!.setAttribute('aria-valuenow', String(pct));
    const name = ['Осадник', 'Повелитель налёта', 'Ярость'][Math.max(0, stage - 1)] ?? 'Осадник';
    const attack = state === ZS_BOSS_OPEN ? `Ядро открыто · ${Math.max(0, wind / 60).toFixed(1)} с — огонь!`
      : state === ZS_BOSS_APPROACH ? 'Идёт к воротам · приготовьтесь'
      : state === ZS_BOSS_GATE ? 'Замах по воротам · уйдите с метки'
      : state === ZS_BOSS_BOMB ? 'Прицельный залп · уйдите с метки'
      : state === ZS_BOSS_PULSE ? 'Удар по стене · выйдите из круга или прыгните'
      : 'Броня активна · ждите открытия ядра';
    const text = `${pct}% · ${name} · ${attack}`;
    if (this.set('bossInfo', text)) this.bossInfo.textContent = text;
    this.bossEl.classList.toggle('open', state === ZS_BOSS_OPEN);
  }

  /** Прилавок открыт (немодальный: бегать и стрелять можно) */
  get shopShown(): boolean { return this.stall.shown; }

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
    this.ptsEl.textContent = `💰 ${n.toLocaleString('ru-RU')}`;
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
    this.hintPrice.textContent = price > 0 ? `${price} 💰` : '';
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
    // места башен
    ctx.strokeStyle = 'rgba(255,236,190,0.9)';
    ctx.lineWidth = 1.5;
    for (const s of TOWER_SPOTS) {
      ctx.beginPath();
      ctx.arc(X(s.x), Z(s.z), 3.4, 0, Math.PI * 2);
      ctx.stroke();
    }
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
      ctx.arc(X(z.x), Z(z.z), z.kind === Z_BOSS ? 8 : z.kind === 2 ? 5.5 : 3.6, 0, Math.PI * 2);
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
    return `<div class="board-team ft-team"><h3>Защитники крепости</h3><table><thead><tr><th class="n">Игрок</th><th>Сбил</th><th>Повален</th><th>💰</th><th>мс</th></tr></thead><tbody>${body}</tbody></table></div>`;
  }

  showBoard(show: boolean, rows: FortPlayerRow[], myId: number, phase: number): void {
    if (show) {
      const html = `${this.rosterTable(rows, myId, phase)}<div class="board-hint">💰 — золото этой игры: 60 % награды — тому, кто бил, 40 % — в общак волны поровну; тратят у прилавка, ворот, кристалла и на башни</div>`;
      if (this.set('boardHtml', html)) this.board.innerHTML = html;
    }
    if (this.set('board', show)) this.board.classList.toggle('show', show);
  }

  showEnd(win: boolean, wave: number, mvp: FortResultRow | null, rows: FortResultRow[], myId: number): void {
    const title = win ? 'Крепость устояла!' : 'Кристалл разбит';
    const sub = win ? `Все ${FORT_WAVES} волн отбиты` : wave > 0 ? `Отбито волн: ${wave} из ${FORT_WAVES}` : 'Ни одной волны не отбили';
    const mvpHtml = mvp ? `<div class="mvp">⭐ Лучший защитник: <b>${escapeHtml(mvp.name)}</b> — сбил ${mvp.k}, добыл ${mvp.pts} 💰</div>` : '';
    const body = rows
      .map((r) => `<tr class="${r.id === myId ? 'me' : ''}"><td class="n">${escapeHtml(r.name)}</td><td>${r.k}</td><td>${r.d}</td><td>${r.waves}</td><td>${r.tokens > 0 ? `+${r.tokens} 🪙` : '—'}</td></tr>`)
      .join('');
    this.end.innerHTML = `<div class="overlay-card end-card"><div class="end-title ${win ? 'win' : 'lose'}">${title}</div><div class="end-sub">${sub}</div>${mvpHtml}<div class="board-team ft-team"><table><thead><tr><th class="n">Защитник</th><th>Сбил</th><th>Повален</th><th>Волн</th><th>Жетоны</th></tr></thead><tbody>${body}</tbody></table></div><div class="board-hint ft-end-timer">Новая игра начнётся сама через несколько секунд</div></div>`;
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
      this.stall.close();
      this.floaters.clear();
      this.setResume(false);
      this.setBoss(0, 0, 0, 0);
      this.hideEnd();
      this.showBoard(false, [], 0, 0);
      this.setHint(null, 0, false, true);
    }
  }
}

export { fmtTime };

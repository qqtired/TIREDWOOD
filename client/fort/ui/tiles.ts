// Правая часть верхней панели «Крепости»: золото этой игры (прибавка
// всплывает зелёным «+14»), рекорд крепости (рекорд и твой; рекордная волна — золотом «бьём рекорд»; побили — «Ваш!»),
// команда — точки цветов ников (повален — красная, готов у колокола — зелёная кайма) и «3 из 4 в бою».
// Числа рекорда — от сервера: приветствие `fort` (rec) и события `frec`; сколько волн отбито сейчас — из снимка.
import { FT_END, FT_WAVE } from '../../../shared/fort.ts';
import type { FortRecIntro } from '../../../shared/fortrecord.ts';
import { el, num } from './dom.ts';
import { fortImg } from './icons.ts';
import { nickTone } from './text.ts';

export interface TeamRow {
  id: number;
  name: string;
  gold: number;
  alive: boolean;
  me: boolean;
  ready?: boolean;
}

/** Прибавка золота висит и копится, пока сыплется, мс */
const PLUS_MS = 1100;

class Tile {
  readonly root: HTMLElement;
  readonly face: HTMLElement;
  private readonly cap: HTMLElement;
  private html = '';

  constructor(parent: HTMLElement, icon: string) {
    this.root = el('div', 'k-tile', parent);
    this.face = el('span', 'k-tile-face', this.root);
    this.face.innerHTML = fortImg(icon);
    this.cap = el('span', 'k-tile-cap', this.root);
  }

  /** Подпись: первая строка (своя разметка) и вторая помельче */
  setCap(main: string, small: string): void {
    const html = `<span>${main}</span>${small ? `<small>${small}</small>` : ''}`;
    if (html === this.html) return;
    this.html = html;
    this.cap.innerHTML = html;
  }
}

export class FortTiles {
  readonly root: HTMLElement;
  readonly gold: Tile;
  private readonly rec: Tile;
  private readonly team: Tile;
  private readonly dots: HTMLElement;
  private goldWas = -1;
  private plus = 0;
  private plusUntil = 0;
  private teamKey = '';
  // рекорд
  private intro: FortRecIntro | null = null;
  private my = 0;
  private recKey = '';
  private oursWas = false;

  constructor(slot: HTMLElement) {
    this.root = el('div', 'k-tiles ft-tiles');
    this.root.dataset.mode = 'fort';
    this.gold = new Tile(this.root, 'token');
    this.gold.root.classList.add('ft-gold');
    this.gold.root.title = 'Золото текущей игры в Крепости — для оружия и укреплений';
    this.rec = new Tile(this.root, 'records');
    this.rec.root.classList.add('ft-record');
    this.team = new Tile(this.root, 'online');
    this.team.root.classList.add('ft-party');
    this.dots = el('span', 'ft-dots', this.team.face);
    this.rec.root.hidden = true;
    slot.append(this.root);
  }

  // ------------------------------------------------------------ золото

  setGold(g: number): void {
    const now = performance.now();
    if (this.goldWas >= 0 && g > this.goldWas) {
      this.plus = now < this.plusUntil ? this.plus + (g - this.goldWas) : g - this.goldWas;
      this.plusUntil = now + PLUS_MS;
    }
    this.goldWas = g;
    const plus = now < this.plusUntil ? ` <b class="ft-plus">+${num(this.plus)}</b>` : '';
    this.gold.setCap(`${num(g)}${plus}`, 'золото крепости');
  }

  // ------------------------------------------------------------ команда

  setTeam(rows: readonly TeamRow[], calm: boolean): void {
    const key = `${calm}|` + rows.map((r) => `${r.id}|${r.name}|${r.alive}|${calm && r.ready}`).join(';');
    if (key === this.teamKey) return;
    this.teamKey = key;
    // один — плитка не нужна: и так ясно, кто в бою
    this.team.root.hidden = rows.length < 2;
    this.dots.replaceChildren(...rows.map((r) => {
      const d = el('i', `k-nick-${nickTone(r.name)}${r.alive ? '' : ' is-down'}${calm && r.ready ? ' is-ready' : ''}`);
      return d;
    }));
    const meDown = rows.some((r) => r.me && !r.alive);
    this.team.root.classList.toggle('k-tile--warn', meDown);
    if (calm) {
      const ready = rows.filter((r) => r.ready).length;
      this.team.setCap(`${ready}/${rows.length}`, 'готовы');
      this.team.root.title = `${ready} из ${rows.length} защитников готовы у колокола`;
    } else {
      const alive = rows.filter((r) => r.alive).length;
      this.team.setCap(`${alive}/${rows.length}`, meDown ? 'ты встаёшь' : 'в бою');
      this.team.root.title = `${alive} из ${rows.length} защитников в бою`;
    }
  }

  // ------------------------------------------------------------ рекорд

  /** Рекорды от сервера (вход или новая игра): рекорд сейчас, до этой игры, свой — до игры и в ней */
  setRecord(r: FortRecIntro): void {
    this.intro = r;
    this.my = r.my;
    this.recKey = '';
    this.oursWas = false;
    this.rec.root.hidden = false;
  }

  /** Свой рекорд вырос (событие me) */
  growMine(wave: number): void {
    this.my = Math.max(this.my, wave);
  }

  /** Рекорд крепости до этой игры (его бьют); 0 — не было */
  get base(): number {
    return this.intro?.base ?? 0;
  }

  get mine(): number {
    return Math.max(this.intro?.best ?? 0, this.my);
  }

  /** Эта волна — рекордная: отобьют — рекорд крепости их */
  recordWave(wave: number): boolean {
    return this.base > 0 && wave === this.base + 1;
  }

  /** Кадр: сколько волн отбито, какая идёт, фаза. true — команда только что стала рекордсменом */
  updateRecord(cleared: number, wave: number, phase: number): boolean {
    const r = this.intro;
    if (!r) return false;
    const ours = cleared > 0 && cleared > r.base;
    const rec = ours ? cleared : r.base;
    const hot = !ours && phase === FT_WAVE && this.recordWave(wave);
    const tie = !ours && r.base > 0 && cleared === r.base && phase !== FT_END;
    const mine = this.mine;
    const became = ours && !this.oursWas;
    this.oursWas = ours;
    const key = `${rec}|${ours}|${hot}|${tie}|${mine}`;
    if (key === this.recKey) return became;
    this.recKey = key;
    this.rec.root.classList.toggle('k-tile--own', ours || hot || tie);
    if (ours) this.rec.setCap(num(rec), 'ваш рекорд');
    else if (hot) this.rec.setCap(num(rec + 1), 'за рекорд');
    else if (tie) this.rec.setCap(num(rec), 'повторили');
    else this.rec.setCap(rec > 0 ? num(rec) : '—', 'рекорд');
    this.rec.root.title = `Рекорд крепости: ${rec || 'ещё нет'} · твой: ${mine || 'ещё нет'}${hot ? ' · следующая победа побьёт рекорд' : ''}`;
    return became;
  }

  reset(): void {
    this.goldWas = -1;
    this.plusUntil = 0;
    this.teamKey = '';
    this.intro = null;
    this.my = 0;
    this.recKey = '';
    this.oursWas = false;
    this.rec.root.hidden = true;
  }
}

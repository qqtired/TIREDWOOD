// Окно аркады поверх площади: слева автомат крупно (экран 4:3 и кнопки со значками клавиш), справа — название, три
// правила, управление, медали «от N → +M 🪙», свой рекорд, жетоны аркады сегодня, рекорды недели и всех времён,
// итог последней партии. Всё нажимается мышью; Esc и ✕ закрывают (партия засчитывается как есть). Разметка — по
// образцу лаборатории (lab/plaza3/arcade). Сеть и мышь игры — client/lobby/plaza3/arcade/index.ts.
import { ARC_DAY_CAP } from '../../../../shared/arcade/rewards.ts';
import type { ArcGameId, ArcMeta, ArcSimBase } from '../../../../shared/arcade/kit.ts';
import type { ArcBoard, ArcMe } from '../../../../shared/arcade/net.ts';
import { COIN_HTML } from '../../../ui/coin.ts';
import { Cabinet, MEDALS, type CabMode, type CabOpts, type GameDef } from './kit.ts';
import './arcade.css';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', parent?: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.appendChild(e);
  return e;
}

function setText(e: HTMLElement, text: string): void {
  if (e.textContent !== text) e.textContent = text;
}

export interface ArcWindowActions {
  /** Окно просит закрыться (✕, «Выйти», Esc) — связка закончит партию и вернёт мышь */
  close(): void;
  /** Звук аркады вкл/выкл */
  toggleSound(): void;
}

export class ArcadeWindow {
  private readonly root: HTMLElement;
  private readonly cab: HTMLElement;
  private readonly title: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  private readonly btn: Record<'start' | 'pause' | 'restart' | 'sound' | 'exit', HTMLButtonElement>;
  private readonly h2: HTMLElement;
  private readonly like: HTMLElement;
  private readonly rules: HTMLElement;
  private readonly ctrl: HTMLElement;
  private readonly medals: HTMLElement;
  private readonly scoring: HTMLElement;
  private readonly best: HTMLElement;
  private readonly bestNote: HTMLElement;
  private readonly day: HTMLElement;
  private readonly last: HTMLElement;
  private readonly note: HTMLElement;
  private readonly topWeek: HTMLElement;
  private readonly topAll: HTMLElement;
  private game: Cabinet | null = null;
  private raf = 0;
  private lastT = 0;
  private readonly actions: ArcWindowActions;

  constructor(host: HTMLElement, actions: ArcWindowActions) {
    this.actions = actions;
    const root = el('div', 'arc-play', host);
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    this.root = root;
    const grid = el('div', 'arc-grid', root);
    this.cab = el('div', 'arc-cab', grid);
    const marquee = el('div', 'arc-marquee', this.cab);
    this.title = el('span', 'arc-title', marquee);
    const body = el('div', 'arc-body', this.cab);
    const bezel = el('div', 'arc-bezel', body);
    const screen = el('div', 'arc-screen', bezel);
    this.canvas = el('canvas', '', screen);
    this.canvas.width = 960;
    this.canvas.height = 720;
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('aria-label', 'Экран автомата');
    const deck = el('div', 'arc-deck', body);
    const mk = (cls: string, label: string, key: string, fn: () => void): HTMLButtonElement => {
      const b = el('button', `arc-act ${cls}`, deck);
      b.type = 'button';
      el('span', '', b, label);
      el('kbd', '', b, key);
      b.addEventListener('click', (e) => {
        e.preventDefault();
        fn();
        b.blur();
      });
      return b;
    };
    this.btn = {
      start: mk('go', 'Играть', 'Пробел', () => this.game?.want()),
      pause: mk('', 'Пауза', 'P', () => this.game?.togglePause()),
      restart: mk('', 'Заново', 'R', () => this.restart()),
      sound: mk('', 'Звук', '♪', () => this.actions.toggleSound()),
      exit: mk('out', 'Выйти', 'Esc', () => this.actions.close()),
    };

    const side = el('aside', 'arc-side', grid);
    side.setAttribute('aria-live', 'polite');
    const head = el('div', 'arc-head', side);
    const ht = el('div', '', head);
    this.h2 = el('h2', '', ht);
    this.like = el('p', 'arc-like', ht);
    const x = el('button', 'arc-x', head, '✕');
    x.type = 'button';
    x.setAttribute('aria-label', 'Закрыть');
    x.addEventListener('click', () => this.actions.close());
    this.rules = el('ol', 'arc-rules', side);
    const b1 = el('div', 'arc-block', side);
    el('h3', '', b1, 'Управление');
    this.ctrl = el('ul', 'arc-ctrl', b1);
    const b2 = el('div', 'arc-block', side);
    el('h3', '', b2, 'Медали за партию');
    this.medals = el('ul', 'arc-medals', b2);
    this.scoring = el('p', 'arc-small', b2);
    const b3 = el('div', 'arc-block mine', side);
    el('h3', '', b3, 'Твой рекорд');
    const bp = el('p', 'arc-best', b3);
    this.best = el('b', '', bp, '—');
    this.bestNote = el('span', '', bp);
    this.day = el('p', 'arc-day', b3);
    this.last = el('p', 'arc-last', b3);
    this.last.hidden = true;
    this.note = el('p', 'arc-note', b3);
    this.note.hidden = true;
    const b4 = el('div', 'arc-block', side);
    const tops = el('div', 'arc-tops', b4);
    const tw = el('div', '', tops);
    el('h3', '', tw, 'Неделя');
    this.topWeek = el('ol', 'arc-top', tw);
    const ta = el('div', '', tops);
    el('h3', '', ta, 'Всё время');
    this.topAll = el('ol', 'arc-top', ta);
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  get cabinet(): Cabinet | null {
    return this.game;
  }

  /** Открыть окно с игрой: автомат в демо, «Пробел — играть» */
  open(id: ArcGameId, def: GameDef<ArcSimBase, unknown>, opts: Omit<CabOpts, 'interactive' | 'startHint' | 'onMode'>): Cabinet {
    this.stopLoop();
    this.game?.destroy();
    const m = def.meta;
    this.cab.className = `arc-cab arc-theme-${id}`;
    setText(this.title, m.title);
    this.fill(m);
    const game = new Cabinet(this.canvas, def, { ...opts, interactive: true, startHint: 'ПРОБЕЛ — ИГРАТЬ', onMode: (mode) => this.onMode(mode) });
    this.game = game;
    this.root.hidden = false;
    this.onMode(game.mode);
    this.lastT = 0;
    const loop = (t: number): void => {
      this.raf = requestAnimationFrame(loop);
      const dt = this.lastT ? (t - this.lastT) / 1000 : 0;
      this.lastT = t;
      game.frame(dt);
    };
    this.raf = requestAnimationFrame(loop);
    this.canvas.focus({ preventScroll: true });
    return game;
  }

  close(): void {
    this.stopLoop();
    this.game?.destroy();
    this.game = null;
    this.root.hidden = true;
  }

  private stopLoop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** «Заново»: идущая партия засчитывается как есть, следом — новая */
  restart(): void {
    const g = this.game;
    if (!g) return;
    if (g.mode === 'play' || g.mode === 'paused' || g.mode === 'count') g.finish();
    g.want(true);
  }

  setSound(muted: boolean): void {
    this.btn.sound.classList.toggle('off', muted);
    this.btn.sound.title = muted ? 'Звук аркады выключен' : 'Звук аркады включён';
  }

  private onMode(mode: CabMode): void {
    const live = mode === 'play' || mode === 'count';
    this.btn.pause.disabled = !(live || mode === 'paused');
    setText(this.btn.pause.querySelector('span')!, mode === 'paused' ? 'Дальше' : 'Пауза');
    setText(this.btn.start.querySelector('span')!, mode === 'over' ? 'Ещё раз' : 'Играть');
    this.btn.start.disabled = live || mode === 'paused';
    this.canvas.style.cursor = live && this.game ? this.game.meta.cursor : 'pointer';
  }

  private fill(m: ArcMeta): void {
    setText(this.h2, m.title);
    setText(this.like, m.like);
    this.rules.replaceChildren(...m.rules.map((r) => el('li', '', undefined, r)));
    this.ctrl.replaceChildren(
      ...[...m.controls, ['P', 'пауза'] as const, ['Esc', 'выйти (партия засчитается)'] as const]
        .filter((c, i, a) => a.findIndex((d) => d[0] === c[0]) === i)
        .map(([k, t]) => {
          const li = el('li');
          el('kbd', '', li, k);
          el('span', '', li, t);
          return li;
        }),
    );
    this.medals.replaceChildren(
      ...[1, 2, 3].map((md) => {
        const li = el('li');
        el('i', `arc-dot m${md}`, li);
        el('b', '', li, MEDALS[md].name);
        el('span', '', li, `от ${m.medals[md - 1]}`);
        const em = el('em', '', li);
        em.innerHTML = `+${m.coins[md - 1]} ${COIN_HTML}`;
        return li;
      }),
    );
    setText(this.scoring, `${m.scoring} Свой рекорд — ещё +10, первое место недели — +25. До ${ARC_DAY_CAP} в день.`);
    this.last.hidden = true;
    this.note.hidden = true;
  }

  /** Своё и таблицы (после открытия и после каждой партии) */
  setInfo(me: ArcMe, board: ArcBoard, cap: number, myPid: number): void {
    setText(this.best, me.best ? String(me.best) : '—');
    setText(this.bestNote, me.week && me.week !== me.best ? `за неделю ${me.week}` : me.runs ? `партий: ${me.runs}` : 'ещё не играл');
    const left = Math.max(0, cap - me.dayCoins);
    this.day.classList.toggle('full', left === 0);
    this.day.innerHTML = left === 0
      ? `Сегодня жетоны за аркаду уже собраны (${cap} ${COIN_HTML}) — играй за рекорд`
      : `Жетоны аркады сегодня: ${me.dayCoins} из ${cap} ${COIN_HTML}`;
    const rows = (list: HTMLElement, items: ArcBoard['week']): void => {
      if (!items.length) {
        list.replaceChildren(el('li', 'empty', undefined, 'пока пусто'));
        return;
      }
      list.replaceChildren(...items.map((r, i) => {
        const li = el('li', r.pid === myPid ? 'me' : '');
        el('span', '', li, `${i + 1}. ${r.nick}`);
        el('b', '', li, String(r.score));
        return li;
      }));
    };
    rows(this.topWeek, board.week);
    rows(this.topAll, board.all);
    this.game?.setBest(me.best);
  }

  /** Итог партии от сервера (его счёт — тот, что записан) */
  setResult(text: string): void {
    this.last.hidden = false;
    this.last.innerHTML = text;
  }

  /** Строка-предупреждение (сервер отказал, связь сбилась); пусто — убрать */
  setNote(text: string): void {
    this.note.hidden = !text;
    setText(this.note, text);
  }
}

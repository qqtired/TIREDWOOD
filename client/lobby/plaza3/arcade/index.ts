// Аркада новой набережной (флаг PLAZA3, пакет WP12) — связка сцены: корпуса в курзале (cabinets3d.ts), окно игры
// (window.ts), сеть и звук. Подошёл к корпусу, E → сервер занимает корпус и шлёт arcOpen → окно. Пробел → arc start →
// зерно сервера → партия у себя; раз в полсекунды — новые строки журнала ввода и свой счёт (он же — «я на месте»).
// Конец партии → остаток журнала и arc end → сервер переигрывает и шлёт свой счёт, медаль и жетоны (arcRes).
// Всем — arcCabs: кто за каким корпусом и его живой счёт (на экране корпуса «ИГРАЕТ <ник>»), лидеры недели.
import type * as THREE from 'three';
import type { Sound } from '../../../audio.ts';
import type { ClientMsg, ServerMsg } from '../../../../shared/messages.ts';
import type { Interactable } from '../../../../shared/maps/lobby.ts';
import { ARC_GAME_IDS, arcGameOfCab } from '../../../../shared/arcade/games.ts';
import type { ArcGameId, ArcSimBase } from '../../../../shared/arcade/kit.ts';
import type { ArcBoard, ArcCabView, ArcMe, ArcResult } from '../../../../shared/arcade/net.ts';
import type { ArcRow } from '../../../../shared/arcade/rewards.ts';
import { COIN_HTML } from '../../../ui/coin.ts';
import type { Wet } from '../../plaza/gfx.ts';
import { ArcadeCabinets3D } from './cabinets3d.ts';
import { castleDef } from './castle.ts';
import { createSfx, type CabResult, type GameDef } from './kit.ts';
import { tirDef } from './tir.ts';
import { trainDef } from './train.ts';
import { ArcadeWindow } from './window.ts';

const DEFS = { train: trainDef, tir: tirDef, castle: castleDef } as unknown as Record<ArcGameId, GameDef<ArcSimBase, unknown>>;
/** Журнал — не больше строк за сообщение (ARC_CHUNK сервера) */
const CHUNK = 400;
const FLUSH_MS = 500;
/** Сервер не прислал зерно за столько — «Готовим автомат…» снять */
const START_WAIT_MS = 5000;
const MUTE_KEY = 'tw-arcade-mute';
/** Клавиши, которые в окне аркады остаются игре вокруг: чат, список игроков, голос */
const PASS_KEYS = new Set(['Enter', 'NumpadEnter', 'Tab', 'KeyV']);
const MEDAL_FOR = ['', 'бронзу', 'серебро', 'золото'];

export interface ArcadeDeps {
  scene: THREE.Scene;
  wet: Wet;
  /** Точки 'arcade' карты по номеру корпуса (arg) */
  points: readonly Interactable[];
  hudRoot: HTMLElement;
  sound: Sound;
  send: (msg: ClientMsg) => void;
  toast: (text: string) => void;
  myPid: () => number;
  /** Окно открылось / закрылось: отпустить мышь / забрать обратно */
  onOpen: () => void;
  onClose: () => void;
}

function readMute(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeMute(on: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, on ? '1' : '0');
  } catch {
    // нет хранилища — только на эту вкладку
  }
}

function resultHtml(r: ArcResult): string {
  let s = `Партия: <b>${r.score}</b>`;
  if (r.claimed !== r.score) s += ` (на экране было ${r.claimed}, сервер насчитал ${r.score})`;
  const why: string[] = [];
  if (r.parts.medal) why.push(`${r.parts.medal} за ${MEDAL_FOR[r.medal]}`);
  if (r.parts.record) why.push(`${r.parts.record} за рекорд`);
  if (r.parts.first) why.push(`${r.parts.first} за первое место`);
  if (r.coins > 0) s += ` · <b>+${r.coins}</b> ${COIN_HTML} (${why.join(', ')}${r.capped ? '; дальше — лимит дня' : ''})`;
  else if (r.capped) s += ' · жетоны за аркаду на сегодня уже собраны';
  else if (!r.medal) s += ' · без медали жетонов нет';
  if (r.newBest) s += ' · <b>новый личный рекорд!</b>';
  if (r.week === 1) s += ' · <b>первое место недели!</b>';
  else if (r.week > 0 && r.week <= 5) s += ` · ${r.week}-е место недели`;
  return s;
}

export class ArcadeClient {
  private readonly d: ArcadeDeps;
  private readonly cabs3d: ArcadeCabinets3D;
  private readonly win: ArcadeWindow;
  private readonly sfx = createSfx(() => this.d.sound.kit, 0.2);
  private cabs: Array<ArcCabView | null> = [];
  private lead: Array<ArcRow | null> = [];
  /** Свой корпус (окно открыто) и игра в нём */
  private myCab = -1;
  private cap = 150;
  /** Идущая партия: номер у сервера и сколько строк журнала уже отправлено */
  private run: { id: number; sent: number } | null = null;
  private startAt = 0;
  private timer = 0;
  private muted = readMute();

  constructor(d: ArcadeDeps) {
    this.d = d;
    this.sfx.muted = this.muted;
    this.cabs3d = new ArcadeCabinets3D({ scene: d.scene, points: d.points, defs: DEFS as never, wet: d.wet });
    this.win = new ArcadeWindow(d.hudRoot, { close: () => this.close(), toggleSound: () => this.toggleSound() });
    // свернул вкладку посреди партии — пауза (иначе партия идёт без игрока)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.win.cabinet?.pause();
    });
  }

  get isOpen(): boolean {
    return this.win.isOpen;
  }

  /** Сообщение сервера про аркаду: true — разобрано */
  onMsg(msg: ServerMsg): boolean {
    switch (msg.t) {
      case 'arcCabs':
        this.cabs = msg.cabs;
        this.lead = msg.lead;
        for (let i = 0; i < this.d.points.length; i++) this.cabs3d.setCab(i, msg.cabs[i]?.nick ?? '', msg.cabs[i]?.s ?? 0);
        return true;
      case 'arcOpen':
        this.open(msg.cab, msg.game, msg.me, msg.board, msg.cap);
        return true;
      case 'arcRun': {
        const g = this.win.cabinet;
        if (!g || !g.waiting) return true;
        this.run = { id: msg.run, sent: 0 };
        g.start(msg.seed);
        return true;
      }
      case 'arcRes':
        if (this.win.isOpen) {
          this.win.setInfo(msg.me, msg.board, this.cap, this.d.myPid());
          this.win.setResult(resultHtml(msg));
          this.win.setNote('');
        } else if (msg.coins > 0) this.d.toast(`🕹️ Аркада: ${msg.score} · +${msg.coins} 🪙`);
        return true;
      case 'arcErr': {
        this.run = null;
        const g = this.win.cabinet;
        if (g) {
          g.waiting = false;
          if (g.mode === 'play' || g.mode === 'count' || g.mode === 'paused') g.finish();
        }
        if (this.win.isOpen) this.win.setNote(msg.text);
        else this.d.toast(msg.text);
        return true;
      }
      case 'arcClose':
        if (msg.cab === this.myCab) this.hide(true, false);
        return true;
    }
    return false;
  }

  /** Подсказка у корпуса: что за игра и кто лидер недели; занят — кто играет и его счёт; своё окно открыто — без подсказки */
  hint(cab: number): [string[] | null, string] {
    if (this.win.isOpen) return [null, ''];
    const game = arcGameOfCab(cab);
    const m = DEFS[game].meta;
    const v = this.cabs[cab];
    if (v) return [[], `«${m.title}» · играет ${v.nick} · счёт ${v.s}`];
    const lead = this.lead[ARC_GAME_IDS.indexOf(game)];
    return [['E'], `«${m.title}» — ${m.like} · играть${lead ? ` · рекорд недели: ${lead.nick}, ${lead.score}` : ''}`];
  }

  /** Клавиши, пока окно открыто: Esc — выйти, P — пауза, R — заново, остальное — игре; шагать нельзя */
  onKey(code: string, down: boolean, e: KeyboardEvent): boolean {
    if (!this.win.isOpen) return false;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || PASS_KEYS.has(code)) return false;
    e.preventDefault();
    const g = this.win.cabinet;
    if (down && !e.repeat) {
      if (code === 'Escape') {
        this.close();
        return true;
      }
      if (code === 'KeyP') {
        g?.togglePause();
        return true;
      }
      if (code === 'KeyR') {
        this.win.restart();
        return true;
      }
    }
    if (g && !(code === 'Space' && e.repeat)) g.key(code, down);
    return true;
  }

  /** Кадр сцены: экраны корпусов (рядом — живые, далеко — замирают) */
  update(dt: number, cam: THREE.Vector3): void {
    this.cabs3d.update(dt, cam);
  }

  /** Вход в комнату или выход: окно закрыть без сообщений (корпус освобождает сам сервер) */
  reset(): void {
    this.hide(false, false);
    this.cabs = [];
    this.lead = [];
    for (let i = 0; i < this.d.points.length; i++) this.cabs3d.setCab(i, '', 0);
  }

  debug(): Record<string, unknown> {
    const g = this.win.cabinet;
    return { open: this.win.isOpen, cab: this.myCab, mode: g?.mode ?? null, score: g?.score ?? 0, run: this.run?.id ?? 0, cabs: this.cabs, screens: this.cabs3d.debug() };
  }

  // ------------------------------------------------------------ внутреннее

  private open(cab: number, game: ArcGameId, me: ArcMe, board: ArcBoard, cap: number): void {
    this.hide(false, false);
    this.myCab = cab;
    this.cap = cap;
    this.win.open(game, DEFS[game], {
      best: me.best,
      sfx: (name) => this.sfx.play(name),
      onEnd: (r) => this.onEnd(r),
      onWantStart: () => this.askStart(),
    });
    this.win.setInfo(me, board, cap, this.d.myPid());
    this.win.setSound(this.muted);
    this.timer = window.setInterval(() => this.tick(), FLUSH_MS);
    this.d.onOpen();
  }

  private askStart(): void {
    if (this.myCab < 0) return;
    this.startAt = performance.now();
    this.win.setNote('');
    this.d.send({ t: 'arc', a: 'start' });
  }

  /** Раз в полсекунды: новые строки журнала (или пустое — «я здесь») и счёт для экрана соседей */
  private tick(): void {
    const g = this.win.cabinet;
    if (!g) return;
    if (g.waiting && performance.now() - this.startAt > START_WAIT_MS) {
      g.waiting = false;
      this.win.setNote('Автомат не ответил — нажми «Играть» ещё раз');
    }
    if (this.run) this.flush(true);
  }

  private flush(beat: boolean): void {
    const g = this.win.cabinet;
    const run = this.run;
    if (!g || !run) return;
    const rows = g.logRows;
    let sentAny = false;
    while (run.sent < rows.length) {
      const ev = rows.slice(run.sent, run.sent + CHUNK);
      this.d.send({ t: 'arc', a: 'log', run: run.id, from: run.sent, ev, s: g.score });
      run.sent += ev.length;
      sentAny = true;
    }
    if (beat && !sentAny) this.d.send({ t: 'arc', a: 'log', run: run.id, from: run.sent, ev: [], s: g.score });
  }

  /** Партия кончилась (сама, Esc, «Заново»): остаток журнала и конец — счёт посчитает сервер */
  private onEnd(r: CabResult): void {
    const run = this.run;
    if (!run) return;
    this.flush(false);
    this.d.send({ t: 'arc', a: 'end', run: run.id, ticks: r.ticks, s: r.score });
    this.run = null;
  }

  /** Окно закрывает игрок: идущая партия засчитывается как есть, корпус свободен */
  private close(): void {
    this.hide(true, true);
  }

  /** Закрыть окно; notify — сказать серверу (иначе он закрыл сам или мы ушли из комнаты), back — вернуть мышь */
  private hide(back: boolean, notify: boolean): void {
    if (!this.win.isOpen) return;
    const g = this.win.cabinet;
    if (!notify) this.run = null;
    if (g && (g.mode === 'play' || g.mode === 'count' || g.mode === 'paused')) g.finish();
    if (notify) this.d.send({ t: 'arc', a: 'close' });
    window.clearInterval(this.timer);
    this.timer = 0;
    this.run = null;
    this.myCab = -1;
    this.win.close();
    if (back) this.d.onClose();
  }

  private toggleSound(): void {
    this.muted = !this.muted;
    this.sfx.muted = this.muted;
    writeMute(this.muted);
    this.win.setSound(this.muted);
  }
}

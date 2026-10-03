// Рыбалка 2.0 на набережной — всё, что видит рыбак, кроме удочки в 3D (fishing.ts): шкала вываживания, карточка улова
// и сундук, журнал рыбака, значок дождя и кнопка журнала у удочки, доска рекордов на сваях у маяка, уведомления о
// дожде. Сцена набережной (scene.ts) передаёт сюда сообщения сервера и кадр; без поля fish2 в приветствии всё молчит,
// и работает старая рыбалка.
import type * as THREE from 'three';
import { COLLECTION_SIZE, collectionCount } from '../../shared/fishrules.ts';
import type { FishProgress } from '../../shared/fishprogress.ts';
import type { ClientMsg, FishBoardView, ServerMsg } from '../../shared/messages.ts';
import { slotKey, type Outfit } from '../../shared/outfit.ts';
import type { Sound } from '../audio.ts';
import type { Ui } from '../scene.ts';
import { TOUCH } from '../touch.ts';
import { FishBook } from '../ui/fishbook.ts';
import { FISH2, el } from './fish2.ts';
import { FISH_BOARD_AT, FishBoard3D } from './fishboard.ts';
import { CatchCard2 } from './fishcard2.ts';
import { ReelGame } from './fishgame.ts';
import type { FishingSpots } from './fishing.ts';
import { FishNpcDialog } from './fishnpcdialog.ts';
import { FishProgressHud } from './fishprogresshud.ts';
import { Fisherman3D } from './fisherman.ts';
import { FishPodium3D } from './fishpodium.ts';
import { FishClock, fishTimeLeft } from './fishclock.ts';

/** Подсказка у доски рекордов — ближе этого, м */
const BOARD_HINT_M = 4.5;

export class Fish2Hud {
  /** Открыли журнал — отпустить мышь; закрыли — снова захватить */
  onBookOpen: () => void = () => {};
  onBookClose: () => void = () => {};
  onNpcOpen: () => void = () => {};
  onNpcClose: () => void = () => {};
  onBeer: () => void = () => {};
  private readonly reel: ReelGame;
  private readonly card: CatchCard2;
  private readonly book: FishBook;
  private readonly board: FishBoard3D;
  private readonly tools: HTMLElement;
  private readonly rainBadge: HTMLElement;
  private readonly bookBtn: HTMLElement;
  private readonly progress: FishProgressHud;
  private readonly npc: FishNpcDialog;
  private readonly fisherman: Fisherman3D;
  private readonly podium: FishPodium3D;
  private readonly clock = new FishClock();
  private readonly ui: Ui;
  private top: FishBoardView | null = null;
  private rain = false;
  private quiet = false;
  private eventUntil = 0;

  constructor(parent: HTMLElement, scene: THREE.Scene, sound: Sound, ui: Ui, send: (msg: ClientMsg) => void, overlay: HTMLElement) {
    this.ui = ui;
    this.reel = new ReelGame(parent, sound);
    this.reel.onSend = send;
    this.card = new CatchCard2(parent, sound);
    this.board = new FishBoard3D(scene);
    this.podium = new FishPodium3D(scene);
    this.fisherman = new Fisherman3D(scene);
    this.tools = parent.appendChild(el('div', 'f2-tools'));
    this.rainBadge = this.tools.appendChild(el('div', 'f2-rainbadge', '🎣 Рыболовное событие · уникальные виды · доход от них ×1,5'));
    this.rainBadge.title = 'Рыболовное событие: доступны уникальные виды, доход от них ×1,5';
    this.bookBtn = this.tools.appendChild(el('button', 'f2-bookbtn'));
    this.bookBtn.addEventListener('click', () => this.toggleBook());
    // журнал — поверх всего на набережной (кнопки и шкала под ним)
    this.book = new FishBook(parent);
    this.progress = new FishProgressHud(this.tools, overlay);
    this.npc = new FishNpcDialog(overlay, ui.me, send);
    this.npc.onOpen = () => this.onNpcOpen();
    this.npc.onClose = () => { if (!this.quiet) this.onNpcClose(); };
    this.npc.onBeer = () => this.onBeer();
    this.book.onClose = () => {
      if (!this.quiet) this.onBookClose();
    };
    // снасти из журнала: сервер меняет их где угодно на набережной
    this.book.rewards.onEquip = (slot, key) => send({ t: 'outfit', o: { ...this.ui.me().outfit, [slot]: key } as Outfit });
    this.setBookBtn();
  }

  /** Рыбалка 2.0 включена на сервере */
  get on(): boolean {
    return FISH2.on;
  }

  get bookOpen(): boolean {
    return this.book.isOpen;
  }

  get npcOpen(): boolean { return this.npc.isOpen; }
  get modalOpen(): boolean { return this.book.isOpen || this.npc.isOpen; }

  /** Приветствие набережной: включена ли, доска рекордов, дождь. true — доска только что появилась (пересчитать тени). */
  lobby(on: boolean, top: FishBoardView | null, rain: boolean): boolean {
    const was = this.board.group.visible;
    FISH2.on = on;
    this.board.group.visible = on;
    this.podium.group.visible = on;
    this.fisherman.group.visible = on;
    this.rain = rain;
    this.reel.setRain(rain);
    this.npc.setEvent(rain, this.eventUntil);
    this.onMe();
    this.setTop(top);
    this.setBookBtn();
    return on && !was;
  }

  setTop(top: FishBoardView | null): void {
    this.top = top;
    this.board.set(top, this.ui.me().pid);
    this.podium.set(top?.podium ?? []);
  }

  /** Погода сменилась: пошёл дождь — уведомление всем на набережной, кончился — тем, кто с удочкой. */
  weather(rain: boolean): void {
    if (rain === this.rain) return;
    this.rain = rain;
    this.reel.setRain(rain);
    this.npc.setEvent(rain, this.eventUntil);
  }

  /** Global notice belongs to app.ts. Here only the local badge and shop state change. */
  onEvent(on: boolean, until: number): void {
    this.rain = on;
    this.eventUntil = until;
    this.reel.setRain(on);
    this.npc.setEvent(on, until);
  }

  onProgress(progress: FishProgress, now: number): void {
    this.clock.sync(now);
    this.progress.set(progress, now);
    this.npc.setProgress(progress, now);
    const me = this.ui.me();
    this.book.update(me.album, me.owned, progress);
  }

  onNpc(msg: Extract<ServerMsg, { t: 'fishNpc' }>): void {
    if (!msg.open && !this.npc.isOpen && msg.message) this.ui.toasts.show(msg.message);
    if (msg.open && this.book.isOpen) {
      this.quiet = true;
      this.book.close();
      this.quiet = false;
    }
    this.clock.sync(msg.now);
    this.progress.set(msg.progress, msg.now);
    this.npc.onState(msg);
  }

  closeNpc(): void { this.npc.close(); }

  requestNpcOpen(): void { this.npc.requestOpen(); }

  refreshBalance(): void { this.npc.refresh(); }

  updateVisuals(dt: number, time: number, camera: THREE.Vector3): void {
    this.fisherman.update(dt, time, camera);
  }

  /** Подсёк — шкала вываживания (сид и вид прислал сервер); mySpot — своё место рыбалки. */
  onReel(msg: Extract<ServerMsg, { t: 'fishReel' }>, mySpot: number): void {
    if (msg.spot !== mySpot) return;
    this.card.hide();
    this.reel.theme(slotKey(this.ui.me().outfit, 'w'));
    this.reel.start(msg.sp, msg.seed, this.rain, msg.mods);
  }

  onLand(msg: Extract<ServerMsg, { t: 'fishLand' }>): void {
    this.card.show(msg);
  }

  /** Сервер: рыба сорвалась (или кривое сообщение) — показать на шкале и убрать. */
  lost(): void {
    this.reel.stop();
  }

  /** Ушёл с места рыбалки: шкалу — сразу; карточка улова уйдёт сама. */
  off(): void {
    this.reel.reset();
  }

  /** Снова забросил — карточка прошлого улова уходит */
  cast(): void {
    this.card.hide();
  }

  /** Профиль с сервера (новый улов, комплект) — журнал и счёт на кнопке. */
  onMe(): void {
    const me = this.ui.me();
    this.book.rewards.outfit = me.outfit;
    this.book.update(me.album, me.owned, me.fishing);
    this.progress.set(me.fishing);
    this.npc.setProgress(me.fishing);
    this.board.set(this.top, me.pid);
    this.setBookBtn();
  }

  /**
   * Кадр: fishing — сидит ли с удочкой, held — держит ли кнопку (ЛКМ, пробел, 🎣); px, pz — где стоит (null — нет
   * желейки). Шкала идёт по своим часам; её прогресс подводит рыбу к мосткам в 3D.
   */
  frame(fishing: boolean, held: boolean, spots: FishingSpots, spot: number, px: number | null, pz: number | null): void {
    if (!FISH2.on) return;
    if (this.reel.active) {
      this.reel.update(held);
      if (fishing) spots.setProgress(spot, this.reel.progress);
    }
    const near = px !== null && pz !== null && this.nearBoard(px, pz);
    this.tools.classList.toggle('show', (fishing || near) && !this.modalOpen);
    this.rainBadge.classList.toggle('show', fishing && this.rain && !this.reel.active);
    if (this.rain) this.rainBadge.textContent = TOUCH
      ? `🎣 Событие ×1,5${this.eventUntil ? ` · ${fishTimeLeft(this.eventUntil, this.clock.now())}` : ''}`
      : `🎣 Рыболовное событие${this.eventUntil ? ` · ${fishTimeLeft(this.eventUntil, this.clock.now())}` : ''} · уникальные виды · доход от них ×1,5`;
  }

  /** У доски рекордов (подсказка: что на ней и как открыть журнал) */
  nearBoard(x: number, z: number): boolean {
    return FISH2.on && Math.hypot(x - FISH_BOARD_AT.x, z - FISH_BOARD_AT.z) < BOARD_HINT_M;
  }

  /** J или кнопка 📖: открыть журнал (мышь отпускается) или закрыть. */
  toggleBook(): void {
    if (this.npc.isOpen) return;
    if (this.book.isOpen) {
      this.book.close();
      return;
    }
    const me = this.ui.me();
    this.book.rewards.outfit = me.outfit;
    this.book.open(me.album, me.owned, me.fishing);
    this.onBookOpen();
  }

  closeBook(): void {
    this.book.close();
  }

  /** Вошли на набережную или ушли с неё: всё убрать (мышь не трогаем — этим занимается оболочка). */
  reset(): void {
    this.reel.reset();
    this.card.hide();
    this.quiet = true;
    this.book.close();
    this.npc.close(true);
    this.quiet = false;
    this.tools.classList.remove('show');
  }

  debug(): Record<string, unknown> {
    return { on: FISH2.on, reel: this.reel.active, running: this.reel.running, p: this.reel.progress, card: this.card.shown, book: this.book.isOpen, npc: this.npc.isOpen, rain: this.rain, eventUntil: this.eventUntil, board: FISH_BOARD_AT, podium: this.top?.podium ?? [], progress: this.ui.me().fishing };
  }

  private setBookBtn(): void {
    const n = collectionCount(this.ui.me().album);
    this.bookBtn.innerHTML = '';
    if (!TOUCH) this.bookBtn.appendChild(el('kbd', '', 'J'));
    this.bookBtn.appendChild(document.createTextNode(TOUCH ? `📖 Журнал · ${n}/${COLLECTION_SIZE}` : `📖 Журнал · ${n} из ${COLLECTION_SIZE}`));
  }
}

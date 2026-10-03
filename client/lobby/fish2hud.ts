// Рыбалка 2.0 на набережной — всё, что видит рыбак, кроме удочки в 3D (fishing.ts): шкала вываживания, карточка улова
// и сундук, журнал рыбака, значок дождя и кнопка журнала у удочки, доска рекордов на сваях у маяка, уведомления о
// дожде. Сцена набережной (scene.ts) передаёт сюда сообщения сервера и кадр; без поля fish2 в приветствии всё молчит,
// и работает старая рыбалка.
import type * as THREE from 'three';
import { COLLECTION_SIZE, collectionCount } from '../../shared/fishrules.ts';
import { bagSlots, fishCastMods, fishLevel, type FishProgress } from '../../shared/fishprogress.ts';
import { FISH_NPCS, FISH_NPC_USE, spotZone, type FishNpcId } from '../../shared/fishplaces.ts';
import type { ClientMsg, FishBoardView, ServerMsg } from '../../shared/messages.ts';
import type { RouletteView } from '../../shared/roulette.ts';
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
import { FishBag } from './fishbag.ts';
import { FishOdds } from './fishodds.ts';
import { RouletteHud } from './roulettehud.ts';
import { fishLevelUpText } from './fishfmt.ts';

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
  /** Разговор с Семёном и Саней; npc.extra — шапка для чужих кнопок (перевоз Сани) */
  readonly npc: FishNpcDialog;
  private readonly bag: FishBag;
  private readonly odds: FishOdds;
  readonly roulette: RouletteHud;
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
    this.odds = new FishOdds(this.tools);
    this.npc = new FishNpcDialog(overlay, ui.me, send);
    this.npc.onOpen = () => this.onNpcOpen();
    this.npc.onClose = () => { if (!this.quiet) this.onNpcClose(); };
    this.npc.onBeer = () => this.onBeer();
    this.bag = new FishBag(overlay, send);
    this.bag.onClose = () => { if (!this.quiet) this.onNpcClose(); };
    this.progress.onBag = () => this.toggleBag();
    this.roulette = new RouletteHud(overlay, send);
    this.roulette.onOpen = () => this.onNpcOpen();
    this.roulette.onClose = () => { if (!this.quiet) this.onNpcClose(); };
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

  get npcOpen(): boolean { return this.npc.isOpen || this.bag.isOpen || this.roulette.isOpen; }
  get modalOpen(): boolean { return this.book.isOpen || this.npc.isOpen || this.bag.isOpen || this.roulette.isOpen; }

  /** Рюкзак полон — заброс не уйдёт (сервер скажет то же самое) */
  get bagFull(): boolean {
    const f = this.ui.me().fishing;
    return f.bag.length >= bagSlots(f);
  }

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

  /**
   * Уровень рыбалки, который игрок уже видел: вырос — плашка «что дал уровень и что открылось». Первое значение с
   * сервера (вход, возврат на набережную, другой профиль) запоминается молча; назад не идёт — устаревший профиль не
   * повторит плашку.
   */
  private seenLevel = -1;
  private seenPid = -1;

  private levelCheck(progress: FishProgress): void {
    const pid = this.ui.me().pid;
    if (pid !== this.seenPid) {
      this.seenPid = pid;
      this.seenLevel = -1;
    }
    const level = fishLevel(progress.xp);
    if (this.seenLevel >= 0 && level > this.seenLevel) this.ui.toasts.show(fishLevelUpText(level), 7000, 'fish-level');
    this.seenLevel = Math.max(this.seenLevel, level);
  }

  onProgress(progress: FishProgress, now: number): void {
    this.levelCheck(progress);
    this.clock.sync(now);
    this.progress.set(progress, now);
    this.npc.setProgress(progress, now);
    this.bag.set(progress);
    this.roulette.setProgress(progress);
    const me = this.ui.me();
    this.book.setWeather(this.rain, now);
    this.book.update(me.album, me.owned, progress);
  }

  /** Сорвалась эпическая и выше после 3 с борьбы — карточка с утешительным опытом */
  onLost(tier: number, xp: number): void {
    this.card.lost(tier, xp);
  }

  /** Стол рулетки поменялся */
  onRoulette(v: RouletteView): void {
    this.roulette.setView(v);
  }

  /** E у стола рулетки */
  openRoulette(): void {
    if (this.modalOpen) return;
    const me = this.ui.me();
    this.roulette.open(me.fishing, me.pid);
  }

  /** I или значок 🎒: окно рюкзака */
  toggleBag(): void {
    if (this.npc.isOpen || this.book.isOpen || this.roulette.isOpen) return;
    if (this.bag.isOpen) {
      this.bag.close();
      return;
    }
    this.bag.open(this.ui.me().fishing);
    this.onNpcOpen();
  }

  onNpc(msg: Extract<ServerMsg, { t: 'fishNpc' }>): void {
    if (!msg.open && !this.npc.isOpen && msg.message) this.ui.toasts.show(msg.message);
    if (msg.open && this.book.isOpen) {
      this.quiet = true;
      this.book.close();
      this.quiet = false;
    }
    this.levelCheck(msg.progress);
    this.clock.sync(msg.now);
    this.progress.set(msg.progress, msg.now);
    this.npc.onState(msg);
  }

  closeNpc(): void {
    this.npc.close();
    this.bag.close();
    this.roulette.close();
  }

  requestNpcOpen(npc: FishNpcId = 'semyon'): void { this.npc.requestOpen(npc); }

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
    this.levelCheck(me.fishing);
    this.book.rewards.outfit = me.outfit;
    this.book.update(me.album, me.owned, me.fishing);
    this.progress.set(me.fishing);
    this.npc.setProgress(me.fishing);
    this.bag.set(me.fishing);
    this.roulette.setProgress(me.fishing);
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
    // уровень, задание и рюкзак видны с удочкой, у доски рекордов и у Семёна или Сани (там решают, что продать и купить)
    const near = px !== null && pz !== null && (this.nearBoard(px, pz) || this.nearNpc(px, pz));
    this.tools.classList.toggle('show', (fishing || near) && !this.modalOpen);
    // «Шансы сейчас» — пока сидишь с удочкой, не тянешь рыбу и не смотришь карточку улова (она встаёт на то же место
    // справа и перекрывала бы шансы); место (пристань/баркас) — по своему месту
    const zone = fishing ? spotZone(spot) : 'pier';
    this.progress.setZone(zone);
    const odds = fishing && !this.reel.active && !this.card.shown;
    this.odds.root.hidden = !odds;
    if (odds) this.odds.set(fishCastMods(this.ui.me().fishing, this.clock.now(), zone), this.rain);
    this.rainBadge.classList.toggle('show', fishing && this.rain && !this.reel.active);
    if (this.rain) this.rainBadge.textContent = TOUCH
      ? `🎣 Событие ×1,5${this.eventUntil ? ` · ${fishTimeLeft(this.eventUntil, this.clock.now())}` : ''}`
      : `🎣 Рыболовное событие${this.eventUntil ? ` · ${fishTimeLeft(this.eventUntil, this.clock.now())}` : ''} · уникальные виды · доход от них ×1,5`;
  }

  /** Рядом с Семёном или Саней */
  nearNpc(x: number, z: number): boolean {
    return FISH2.on && FISH_NPCS.some((id) => {
      const u = FISH_NPC_USE[id];
      return !!u && Math.hypot(x - u.x, z - u.z) < u.r + 1.5;
    });
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
    this.bag.close();
    this.roulette.close();
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

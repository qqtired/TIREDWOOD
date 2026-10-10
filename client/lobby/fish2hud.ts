// Рыбалка 2.0 на набережной — всё, что видит рыбак, кроме удочки в 3D (fishing.ts): шкала вываживания, карточка улова
// и сундук, журнал рыбака, плашки событий (сезон рыбалки, рыболовное событие — дождь) и кнопка журнала у удочки, доска
// рекордов на сваях у маяка. Сцена набережной (scene.ts) передаёт сюда сообщения сервера и кадр; без поля fish2 в
// приветствии всё молчит, и работает старая рыбалка.
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
import { SanyaHome } from './barkas/sanyahome.ts';
import { FishProgressHud, fishPlate, setText, type FishPlate } from './fishprogresshud.ts';
import { FISH_SEASON, SEASON_PERKS, SEASON_PERKS_LONG } from './fishseason.ts';
import { Fisherman3D } from './fisherman.ts';
import { FishPodium3D } from './fishpodium.ts';
import { FishClock, fishTimeLeft } from './fishclock.ts';
import { FishBag } from './fishbag.ts';
import { FishOdds } from './fishodds.ts';
import { RouletteHud } from './roulettehud.ts';
import { fishLevelUpText } from './fishfmt.ts';
import { SeasonSigns } from './seasonsign.ts';
import { CHOICE_LOCK_MS, DONE_RELEASE } from '../../shared/fishrelease.ts';

/** Подсказка у доски рекордов — ближе этого, м */
const BOARD_HINT_M = 4.5;
/** Рыболовное событие (дождь): уникальные виды — только в дождь (их цена ×1,5, RAIN_NUM / RAIN_DEN), редкие и выше ×1,5 (RAIN_MUL) */
const RAIN_PERKS = 'уникальные виды · редкие и выше ×1,5';

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
  /** Плашки событий над кнопкой журнала: сезон рыбалки (он же особый дождь) и рыболовное событие (дождь) */
  private readonly seasonPlate: FishPlate;
  private readonly rainPlate: FishPlate;
  private readonly bookBtn: HTMLElement;
  private readonly progress: FishProgressHud;
  /** Разговор с Семёном и Саней; npc.extra — шапка для чужих кнопок (перевоз Сани) */
  readonly npc: FishNpcDialog;
  /** Баркас: «Домой, к Семёну» у Сани — кнопка в npc.extra */
  private readonly sanyaHome: SanyaHome;
  private readonly bag: FishBag;
  private readonly odds: FishOdds;
  readonly roulette: RouletteHud;
  private readonly fisherman: Fisherman3D;
  /** Вывески «Сезон рыбалки»: на доме Семёна и на рубке баркаса */
  private readonly seasonSigns: SeasonSigns;
  private readonly podium: FishPodium3D;
  private readonly clock = new FishClock();
  private readonly ui: Ui;
  private readonly send: (msg: ClientMsg) => void;
  private top: FishBoardView | null = null;
  private rain = false;
  private quiet = false;
  private eventUntil = 0;
  /** Сезон рыбалки (сообщение fishSeason): конец идущего, мс серверных часов; 0 — не идёт */
  private seasonEnds = 0;

  constructor(parent: HTMLElement, scene: THREE.Scene, sound: Sound, ui: Ui, send: (msg: ClientMsg) => void, overlay: HTMLElement) {
    this.ui = ui;
    this.send = send;
    this.reel = new ReelGame(parent, sound);
    this.reel.onSend = send;
    this.reel.onWarn = (text) => ui.chat.note(text);
    this.reel.onToast = (text) => ui.toasts.show(text, 3500, 'fish-ability');
    this.card = new CatchCard2(parent, sound);
    // рыба в руках (shared/fishrelease.ts): кнопки карточки — мышью (пока она свободна) или пальцем
    this.card.onKeep = () => this.choose(true);
    this.card.onRelease = () => this.choose(false);
    // конец вываживания (поймал, сорвалась, сдался): 0,75 с никакие нажатия не принимаются, потом — выбор
    this.reel.onEnd = () => this.lockInput();
    this.board = new FishBoard3D(scene);
    this.podium = new FishPodium3D(scene);
    this.fisherman = new Fisherman3D(scene);
    this.seasonSigns = new SeasonSigns(scene);
    this.tools = parent.appendChild(el('div', 'f2-tools'));
    this.seasonPlate = fishPlate(this.tools, 'f2-season', '🎉');
    this.seasonPlate.root.title = `Сезон рыбалки: ${SEASON_PERKS_LONG}.`;
    this.rainPlate = fishPlate(this.tools, 'f2-rainbadge', '🌧');
    this.rainPlate.root.title = 'Рыболовное событие — дождь: уникальные виды рыб ловятся только сейчас, их цена ×1,5; все от редких до царя морей клюют в 1,5 раза чаще';
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
    this.sanyaHome = new SanyaHome(this.npc, () => ui.me().tokens, send, (text) => ui.toasts.show(text));
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
    this.seasonSigns.group.visible = on;
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

  /** Сезон рыбалки (server/lobby/fishseason.ts): «Шансы сейчас» считают его сами — редкие и выше ×2 к дождю (×3 к ясной) */
  onSeason(on: boolean, endsAt: number): void {
    this.seasonEnds = on ? endsAt : 0;
    this.bookWeather();
  }

  /** Журналу — погода и сезон для «сейчас N% поклёвок» (как «Шансы сейчас») */
  private bookWeather(now = this.clock.now()): void {
    this.book.setWeather(this.rain || this.season, now, this.season);
  }

  /** Идёт ли сезон рыбалки по часам сервера */
  private get season(): boolean {
    return this.seasonEnds > this.clock.now();
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
    FISH_SEASON.sync(now);
    this.progress.set(progress, now);
    this.npc.setProgress(progress, now);
    this.bag.set(progress);
    this.roulette.setProgress(progress);
    const me = this.ui.me();
    this.bookWeather(now);
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

  /** Рыба в руках (сервер, fishhold.ts): в рюкзаке у неё «Убрать» вместо «Взять в руки» */
  setHeld(n: number): void {
    this.bag.setHeld(n);
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
    FISH_SEASON.sync(msg.now);
    this.progress.set(msg.progress, msg.now);
    this.npc.onState(msg);
    this.sanyaHome.refresh();
  }

  closeNpc(): void {
    this.npc.close();
    this.bag.close();
    this.roulette.close();
  }

  /** Саня ответил на «Домой, к Семёну» (кнопка модуля баркаса в шапке разговора — client/lobby/barkas/sanyahome.ts) */
  onBarkasHome(ok: boolean, message: string): void { this.sanyaHome.onResult(ok, message); }

  requestNpcOpen(npc: FishNpcId = 'semyon'): void { this.npc.requestOpen(npc); }

  refreshBalance(): void {
    this.npc.refresh();
    this.sanyaHome.refresh();
  }

  /** Кадр 3D рыбалки: Семён смотрит на своего игрока (me) и оборачивается к нему, пока открыт разговор с ним */
  updateVisuals(dt: number, time: number, camera: THREE.Vector3, me: { x: number; y: number; z: number } | null = null): void {
    this.fisherman.update(dt, time, camera, me, this.npc.isOpen && this.npc.who === 'semyon');
    this.seasonSigns.update(dt, camera);
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
    // кнопки выбора притушены, пока не кончилась пауза после вываживания (она идёт с конца шкалы, а карточка пришла от сервера позже)
    this.card.lockFor(this.lockUntil - performance.now());
  }

  /** Сервер: рыба сорвалась (или кривое сообщение) — показать на шкале и убрать. */
  lost(): void {
    this.reel.stop();
    this.lockInput();
  }

  /** До этого момента (performance.now) нажатия после вываживания игнорируются */
  private lockUntil = 0;

  private lockInput(): void {
    this.lockUntil = Math.max(this.lockUntil, performance.now() + CHOICE_LOCK_MS);
  }

  /** Первые CHOICE_LOCK_MS после конца вываживания не принимаются ни ЛКМ с пробелом, ни кнопки и клавиши выбора (ложные срабатывания) */
  get inputLocked(): boolean {
    return performance.now() < this.lockUntil;
  }

  /** Идёт вываживание (шкала играет): персонаж стоит на месте, ходить нельзя */
  get reelRunning(): boolean {
    return this.reel.running;
  }

  /** X или кнопка «Прекратить»: сдаться — рыба срывается, управление возвращается. false — шкала не идёт. */
  giveUp(): boolean {
    return this.reel.giveUp();
  }

  /** Ушёл с места рыбалки: шкалу — сразу; карточка улова уйдёт сама. */
  off(): void {
    this.reel.reset();
  }

  /** Снова забросил — карточка прошлого улова уходит */
  cast(): void {
    this.card.hide();
  }

  /** Рыба в руках ждёт выбора («В рюкзак» / «Отпустить») */
  get choosing(): boolean {
    return this.card.canRelease;
  }

  /**
   * Выбор с рыбой в руках — кнопка карточки или клавиша (1 — «В рюкзак», F или 2 — «Отпустить»); решает сервер.
   * true — выбор был открыт и нажатие съедено (пока идёт пауза после вываживания, оно ничего не делает); false — выбирать нечего.
   */
  choose(keep: boolean): boolean {
    if (!this.card.canRelease) return false;
    if (!this.inputLocked) this.send({ t: 'fish', a: keep ? 'keep' : 'release' });
    return true;
  }

  /** Сервер убрал рыбу из рук (FE_DONE на своём месте): a — DONE_RELEASE, если отпустили */
  done(a: number): void {
    this.card.done(a === DONE_RELEASE);
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
    if (odds) this.odds.set(fishCastMods(this.ui.me().fishing, this.clock.now(), zone), this.rain || this.season, this.season);
    this.plates();
  }

  /**
   * Плашки событий (видны вместе с колонкой: с удочкой, у доски и у Семёна; пока тянешь рыбу — убраны): крупно — что
   * за событие и сколько осталось, мелко — что даёт. Сезон рыбалки сам по себе дождь — тогда одна его плашка.
   */
  private plates(): void {
    const now = this.clock.now();
    const st = FISH_SEASON.state();
    const season = !!st?.on && !this.reel.active;
    const s = this.seasonPlate;
    s.root.classList.toggle('show', season);
    if (season && st) {
      setText(s.title, 'Сезон рыбалки');
      setText(s.sub, SEASON_PERKS);
      setText(s.time, fishTimeLeft(st.left, 0));
    }
    const r = this.rainPlate;
    const rain = this.rain && !st?.on && !this.reel.active;
    r.root.classList.toggle('show', rain);
    if (rain) {
      setText(r.title, TOUCH ? 'Событие ×1,5' : 'Рыболовное событие');
      setText(r.sub, RAIN_PERKS);
      setText(r.time, this.eventUntil ? fishTimeLeft(this.eventUntil, now) : '');
    }
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
    this.bookWeather();
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
    return { on: FISH2.on, reel: this.reel.active, running: this.reel.running, p: this.reel.progress, card: this.card.shown, book: this.book.isOpen, npc: this.npc.isOpen, rain: this.rain, season: this.season, seasonEnds: this.seasonEnds, eventUntil: this.eventUntil, board: FISH_BOARD_AT, podium: this.top?.podium ?? [], progress: this.ui.me().fishing };
  }

  private setBookBtn(): void {
    const n = collectionCount(this.ui.me().album);
    this.bookBtn.innerHTML = '';
    if (!TOUCH) this.bookBtn.appendChild(el('kbd', '', 'J'));
    this.bookBtn.appendChild(document.createTextNode(TOUCH ? `📖 Журнал · ${n}/${COLLECTION_SIZE}` : `📖 Журнал · ${n} из ${COLLECTION_SIZE}`));
  }
}

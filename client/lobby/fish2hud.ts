// Рыбалка 2.0 на набережной — всё, что видит рыбак, кроме удочки в 3D (fishing.ts), на ките UI 2.0 (lab/ui «Рыбалка»):
// карточка рыбалки в верх-лево (уровень, следующий бонус, «Шансы сейчас» — fishmode.ts), плитки рюкзака, напитка и задания
// под бейджем (fishprogresshud.ts), одна подсказка внизу (J — журнал), «Подсекай!» по центру, рамка вокруг шкалы
// вываживания (fishgame.ts), карточка улова внизу справа (fishcard2.ts), плашка события сверху (сезон, дождь, туман острова),
// журнал рыбака и доска рекордов на сваях у маяка. Сцена набережной (scene.ts) передаёт сюда сообщения сервера и кадр; без
// поля fish2 в приветствии всё молчит, и работает старая рыбалка.
import type * as THREE from 'three';
import { RAIN_MUL, SEASON_MUL } from '../../shared/fishrules.ts';
import { fishCastMods, fishLevel, type FishProgress } from '../../shared/fishprogress.ts';
import { catchFullHint, catchRoom } from '../../shared/fishlivewell.ts';
import { ISLE, castZone, inIsleWaters, setIsle } from '../../shared/fishisle.ts';
import { FISH_NPCS, FISH_NPC_USE, FISH_SPOTS, spotZone, type FishNpcId } from '../../shared/fishplaces.ts';
import { isleCaught } from '../../shared/islestyle.ts';
import type { ClientMsg, FishBoardView, ServerMsg } from '../../shared/messages.ts';
import type { RouletteView } from '../../shared/roulette.ts';
import { slotKey, type Outfit } from '../../shared/outfit.ts';
import type { Sound } from '../audio.ts';
import type { Ui } from '../scene.ts';
import { TOUCH } from '../touch.ts';
import { FishBook } from '../ui/fishbook.ts';
import { iconImg, keyHtml, meterHtml } from '../ui/kit/dom.ts';
import { escHtml } from '../ui/kit/topcenter.ts';
import { FISH2, el } from './fish2.ts';
import { FISH_BOARD_AT, FishBoard3D } from './fishboard.ts';
import { CatchCard2 } from './fishcard2.ts';
import { ReelGame } from './fishgame.ts';
import type { FishingSpots } from './fishing.ts';
import { FishNpcDialog } from './fishnpcdialog.ts';
import { SanyaHome } from './barkas/sanyahome.ts';
import { FishProgressHud } from './fishprogresshud.ts';
import { FISH_SEASON, seasonLeft } from './fishseason.ts';
import { Fisherman3D } from './fisherman.ts';
import { FishPodium3D } from './fishpodium.ts';
import { FishClock } from './fishclock.ts';
import { FishBag } from './fishbag.ts';
import { FishModeCard } from './fishmode.ts';
import { RouletteHud } from './roulettehud.ts';
import { fishLevelUpText, mul } from './fishfmt.ts';
import { SeasonSigns } from './seasonsign.ts';
import { BAG_FULL_HINT, CHOICE_LOCK_MS, DONE_RELEASE } from '../../shared/fishrelease.ts';
import './fishkit.css';

/** Подсказка у доски рекордов — ближе этого, м */
const BOARD_HINT_M = 4.5;
/** Плашка события сверху видна и у места рыбалки — ближе этого, м */
const SPOT_NEAR_M = 4;
/** «Сезон рыбалки скоро» — за столько до начала, мс */
const SOON_MS = 30 * 60_000;
/** Сезон рыбалки и сезон острова идут по 10 минут (server/lobby/fishseason.ts SEASON_MS, shared/isle.ts) — для полосы плашки */
const SEASON_SPAN_MS = 10 * 60_000;
/** «Подсекай!» по центру, мс */
const BITE_MS = 1600;
/** Плашка события рыбалки сверху: ниже лодки (35), рулетки (36) и таймеров режимов (40) */
const EV_KEY = 'fish-ev';
const EV_PRIO = 30;

/** Что подсказать внизу с удочкой (scene.ts hintFish): перед забросом, заброс, ждём поклёвку, рыбу некуда класть */
export type FishPrompt = 'idle' | 'cast' | 'wait' | 'full';

const MOUSE_L = '<span class="k-key"><i class="k-mouse k-mouse--l" aria-label="ЛКМ"></i></span>';
/** «клавиша + что будет»; с data-k — нажимается мышью (журнал, рюкзак) */
const promptKey = (cap: string, text: string, k = ''): string =>
  k ? `<button type="button" class="fi-k" data-k="${k}">${cap}${text}</button>` : `<span class="fi-k">${cap}${text}</span>`;
const SEP = '<span class="k-prompt-sep"></span>';

/** «7:40» — минуты без ведущего нуля */
function clockText(ms: number): string {
  return seasonLeft(Math.max(0, ms));
}

/** Плашка события сверху (lab/ui «Рыбалка» EV): картинка, крупно — что, мелко — что даёт, таймер и полоса */
function eventHtml(icon: string, title: string, sub: string, left: number, span: number, tone = 'mode'): string {
  const timer = left > 0 ? `<div class="k-event-timer">${clockText(left)}</div>` : '';
  const bar = left > 0 && span > 0 ? meterHtml(left / span, tone, 'k-meter--thin') : '';
  return `<span class="k-event-ic">${iconImg(icon, '')}</span><div class="k-event-title">${escHtml(title)}</div><div class="k-event-sub">${escHtml(sub)}</div>${timer}${bar}`;
}

export class Fish2Hud {
  /** Открыли журнал — отпустить мышь; закрыли — снова захватить */
  onBookOpen: () => void = () => {};
  onBookClose: () => void = () => {};
  onNpcOpen: () => void = () => {};
  onNpcClose: () => void = () => {};
  /** За штурвалом своей лодки (OwnBoatsClient.driving): плитка лайвела видна и без удочки */
  helm: () => boolean = () => false;
  /** Игрок у воды (с удочкой, у мест рыбалки, доски, торговцев, у острова): плашка события сверху видна — тост о дожде не нужен */
  plateNear = false;
  onBeer: () => void = () => {};
  private readonly reel: ReelGame;
  private readonly card: CatchCard2;
  private readonly book: FishBook;
  private readonly board: FishBoard3D;
  /** Верх-лево: уровень рыбалки, следующий бонус, «Шансы сейчас», виды острова */
  private readonly mode: FishModeCard;
  /** Под бейджем: рюкзак, лайвел, напиток, задание Семёна */
  private readonly progress: FishProgressHud;
  /** Подсказка внизу с удочкой и «Подсекай!» по центру */
  private readonly promptEl: HTMLElement;
  private readonly biteEl: HTMLElement;
  private promptKey = '';
  private biteTimer = 0;
  private biting = false;
  private focus = false;
  /** Разговор с Семёном и Саней; npc.extra — шапка для чужих кнопок (перевоз Сани) */
  readonly npc: FishNpcDialog;
  /** Баркас: «Домой, к Семёну» у Сани — кнопка в npc.extra */
  private readonly sanyaHome: SanyaHome;
  private readonly bag: FishBag;
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
  /** Остров (флаг ISLE): туман и сезон острова — свои события (isleWeather); «Шансы сейчас» у острова считают по ним */
  private isleFog = false;
  private isleSeason = false;
  /** Конец тумана и сезона острова, мс серверных часов (0 — без конца или не идёт) */
  private isleFogUntil = 0;
  private isleSeasonEnds = 0;
  /** Длина идущего дождя и тумана для полосы плашки: сколько оставалось, когда узнали о нём */
  private rainSpan = 0;
  private fogSpan = 0;
  private quiet = false;
  private eventUntil = 0;
  /** Сезон рыбалки (сообщение fishSeason): конец идущего, мс серверных часов; 0 — не идёт */
  private seasonEnds = 0;

  constructor(_parent: HTMLElement, scene: THREE.Scene, sound: Sound, ui: Ui, send: (msg: ClientMsg) => void, overlay: HTMLElement) {
    this.ui = ui;
    this.send = send;
    // шкала — в слое HUD рядом с персонажем (рамка кита, fishkit.css .fi-reel)
    this.reel = new ReelGame(ui.slots.root, sound);
    this.reel.onSend = send;
    this.reel.onWarn = (text) => ui.chat.note(text);
    this.reel.onToast = (text) => ui.toasts.show(text, 3500, 'fish-ability');
    this.mode = new FishModeCard(ui.slots.tl);
    this.progress = new FishProgressHud(ui.slots.tr);
    this.card = new CatchCard2(ui.slots.br, sound, ui.top);
    // опыт за улов всплывает у кольца уровня рыбалки, жетоны — у бейджа (сам)
    this.card.onXp = (xp) => this.mode.popXp(xp);
    // рыба в руках (shared/fishrelease.ts): кнопки карточки — мышью (пока она свободна) или пальцем
    this.card.onKeep = () => this.choose(true);
    this.card.onRelease = () => this.choose(false);
    // конец вываживания (поймал, сорвалась, сдался): 0,75 с никакие нажатия не принимаются, потом — выбор
    this.reel.onEnd = () => this.lockInput();
    this.promptEl = ui.slots.bc.appendChild(el('div', 'k-prompt fi-prompt'));
    this.promptEl.dataset.mode = 'fishing';
    this.promptEl.hidden = true;
    this.promptEl.addEventListener('click', (e) => {
      const k = (e.target as Element).closest<HTMLElement>('[data-k]')?.dataset.k;
      if (k === 'J') this.toggleBook();
      else if (k === 'I') this.toggleBag();
    });
    this.biteEl = ui.slots.c.appendChild(el('div', 'k-hero k-hero--gold fi-bite'));
    this.biteEl.dataset.mode = 'fishing';
    this.biteEl.hidden = true;
    this.biteEl.innerHTML = `<p class="k-hero-title">Подсекай!</p><span class="k-hero-sub">${TOUCH ? '' : MOUSE_L.replace('k-key"', 'k-key k-key--lg"')}жми сейчас</span>`;
    this.board = new FishBoard3D(scene);
    this.podium = new FishPodium3D(scene);
    this.fisherman = new Fisherman3D(scene);
    this.seasonSigns = new SeasonSigns(scene);
    // журнал — окно кита (native dialog поверх всего)
    this.book = new FishBook(overlay);
    this.npc = new FishNpcDialog(overlay, ui.me, send);
    this.npc.onOpen = () => this.onNpcOpen();
    this.npc.onClose = () => { if (!this.quiet) this.onNpcClose(); };
    this.npc.onBeer = () => this.onBeer();
    this.sanyaHome = new SanyaHome(this.npc, () => ui.me().tokens, send, (text) => ui.toasts.show(text));
    this.bag = new FishBag(overlay, send);
    this.bag.onClose = () => { if (!this.quiet) this.onNpcClose(); };
    this.progress.onBag = () => this.toggleBag();
    this.roulette = new RouletteHud(overlay, send, { slots: ui.slots, top: ui.top });
    this.roulette.onOpen = () => this.onNpcOpen();
    this.roulette.onClose = () => { if (!this.quiet) this.onNpcClose(); };
    this.book.onClose = () => {
      if (!this.quiet) this.onBookClose();
    };
    // снасти из журнала: сервер меняет их где угодно на набережной
    this.book.rewards.onEquip = (slot, key) => send({ t: 'outfit', o: { ...this.ui.me().outfit, [slot]: key } as Outfit });
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

  /** Рыбу некуда положить (рюкзак полон, а лайвела своей лодки нет или он полон) — заброс не уйдёт (сервер скажет то же самое) */
  get bagFull(): boolean {
    return catchRoom(this.ui.me().fishing) === null;
  }

  /** Почему заброс не уходит, когда bagFull: без лодки — как раньше, с лодкой — рюкзак и лайвел полны */
  get fullHint(): string {
    return catchFullHint(this.ui.me().fishing, ISLE.on) ?? BAG_FULL_HINT;
  }

  /** Приветствие набережной: включена ли, доска рекордов, дождь. true — доска только что появилась (пересчитать тени). */
  lobby(on: boolean, top: FishBoardView | null, rain: boolean, isle = false): boolean {
    const was = this.board.group.visible;
    FISH2.on = on;
    setIsle(on && isle);
    this.board.group.visible = on;
    this.podium.group.visible = on;
    this.fisherman.group.visible = on;
    this.seasonSigns.group.visible = on;
    this.rain = rain;
    this.npc.setEvent(rain, this.eventUntil);
    this.onMe();
    this.setTop(top);
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
    this.npc.setEvent(rain, this.eventUntil);
  }

  /** Сезон рыбалки (server/lobby/fishseason.ts): «Шансы сейчас» считают его сами — редкие и выше ×2 к дождю (×3 к ясной) */
  onSeason(on: boolean, endsAt: number): void {
    this.seasonEnds = on ? endsAt : 0;
  }

  /** Погода острова (письмо isle): «Туман наступает» и сезон острова — для «Шансов сейчас» и журнала у видов острова */
  isleWeather(fog: boolean, season: boolean, fogUntil = 0, seasonEnds = 0): void {
    if (fog && fogUntil !== this.isleFogUntil) this.fogSpan = Math.max(0, fogUntil - this.clock.now());
    this.isleFog = fog;
    this.isleSeason = season;
    this.isleFogUntil = fog ? fogUntil : 0;
    this.isleSeasonEnds = season ? seasonEnds : 0;
  }

  /** Идёт ли сезон рыбалки по часам сервера */
  private get season(): boolean {
    return this.seasonEnds > this.clock.now();
  }

  /** Global notice belongs to app.ts. Here only the local badge and shop state change. */
  onEvent(on: boolean, until: number): void {
    if (on && until !== this.eventUntil) this.rainSpan = Math.max(0, until - this.clock.now());
    this.rain = on;
    this.eventUntil = until;
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
    if (this.seenLevel >= 0 && level > this.seenLevel) {
      const t = fishLevelUpText(level);
      this.ui.toasts.show(`Уровень рыбалки ${level}`, 7000, 'fish-level', t.slice(t.indexOf(': ') + 2).replace('★ ', ''));
    }
    this.seenLevel = Math.max(this.seenLevel, level);
  }

  onProgress(progress: FishProgress, now: number): void {
    this.levelCheck(progress);
    this.clock.sync(now);
    FISH_SEASON.sync(now);
    this.progress.set(progress, now);
    this.mode.setProgress(progress);
    this.npc.setProgress(progress, now);
    this.bag.set(progress);
    this.roulette.setProgress(progress);
    const me = this.ui.me();
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

  /** I или плитка рюкзака под бейджем: окно рюкзака */
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
    this.mode.setProgress(msg.progress);
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
    this.bite(false);
    this.reel.theme(slotKey(this.ui.me().outfit, 'w'));
    this.reel.start(msg.sp, msg.seed, msg.mods);
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
    this.bite(false);
  }

  /** Снова забросил — карточка прошлого улова уходит */
  cast(): void {
    this.card.hide();
  }

  /** Рыба в руках ждёт выбора («В рюкзак» / «Отпустить») */
  get choosing(): boolean {
    return this.card.canRelease;
  }

  /** Куда ляжет рыба в руках: «в рюкзак» или «в лайвел» (рюкзак полон — лайвел своей лодки) */
  get keepWhere(): string {
    return this.card.inWell ? 'в лайвел' : 'в рюкзак';
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
    this.mode.setProgress(me.fishing);
    this.npc.setProgress(me.fishing);
    this.bag.set(me.fishing);
    this.roulette.setProgress(me.fishing);
    this.board.set(this.top, me.pid);
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
    const has = px !== null && pz !== null;
    // рюкзак, задание — с удочкой, у доски рекордов и у Семёна или Сани (там решают, что продать и купить); напиток — всегда
    const near = has && (this.nearBoard(px, pz) || this.nearNpc(px, pz));
    this.progress.setShown(true, fishing || near, this.helm());
    // в море (баркас, лодка на якоре) пул — по точке: в водах острова клюёт остров (shared/fishisle.ts)
    const zone = !fishing ? 'pier' : has ? castZone(spotZone(spot), px, pz) : spotZone(spot);
    const isle = zone === 'isle';
    this.mode.shown = fishing;
    if (fishing) {
      const me = this.ui.me();
      this.mode.setOdds(fishCastMods(me.fishing, this.clock.now(), zone), isle ? this.isleFog || this.isleSeason : this.rain || this.season, isle ? this.isleSeason : this.season, isle);
      this.mode.setIsle(isle ? isleCaught(me) : null);
      this.mode.setZone(zone);
    } else {
      this.prompt(null);
    }
    const atIsle = isle || (has && ISLE.on && inIsleWaters(px, pz));
    this.events(fishing || near || atIsle || (has && this.nearSpot(px, pz)), atIsle);
    // поклёвка и вываживание: остальной HUD притихает
    const focus = fishing && (this.biting || this.reel.active);
    if (focus !== this.focus) {
      this.focus = focus;
      document.documentElement.toggleAttribute('data-fish-focus', focus);
    }
  }

  /** Подсказка внизу с удочкой (только десктоп; на телефоне — подсказка набережной с кнопкой 🎣). null — спрятать */
  prompt(kind: FishPrompt | null): void {
    const full = kind === 'full' ? this.fullHint.replace(/\s*\(I\)/, '') : '';
    const key = kind ? `${kind}|${full}` : '';
    if (key === this.promptKey) return;
    this.promptKey = key;
    this.promptEl.hidden = !kind;
    if (!kind) return;
    const journal = promptKey(keyHtml('J'), 'Журнал', 'J');
    const stand = promptKey(keyHtml('E'), 'Встать');
    this.promptEl.classList.toggle('k-prompt--off', kind === 'cast');
    if (kind === 'idle') this.promptEl.innerHTML = promptKey(MOUSE_L, 'Забросить') + SEP + journal + SEP + stand;
    else if (kind === 'cast') this.promptEl.innerHTML = '<span>Заброс…</span>';
    else if (kind === 'wait') this.promptEl.innerHTML = `<span class="fi-wait">${iconImg('float', '')}Ждём поклёвку…</span>` + SEP + journal;
    else this.promptEl.innerHTML = promptKey(keyHtml('I'), escHtml(full), 'I') + SEP + stand;
  }

  /** Поклёвка (FE_BITE): крупное «Подсекай!» по центру на 1,6 с; false — убрать (подсёк, рано, не успел) */
  bite(on: boolean): void {
    clearTimeout(this.biteTimer);
    this.biting = on;
    const e = this.biteEl;
    e.classList.remove('is-pop');
    e.hidden = !on;
    if (!on) return;
    void e.offsetWidth;
    e.classList.add('is-pop');
    this.biteTimer = window.setTimeout(() => this.bite(false), BITE_MS);
  }

  /**
   * Плашка события сверху (кит: одна на экран, важнее — лодка, рулетка, шторм): у острова — «Туман наступает» или
   * «Великий туман», у пристани — сезон рыбалки, дождь или «сезон скоро». Видна с удочкой, у мест рыбалки, доски и
   * торговцев; пока тянешь рыбу — убрана.
   */
  private events(show: boolean, atIsle: boolean): void {
    this.plateNear = show;
    const now = this.clock.now();
    let html = '';
    let tone: 'special' | undefined;
    let lamp = false;
    if (show && !this.reel.active) {
      if (atIsle) {
        if (this.isleSeason) {
          html = eventHtml('fog', 'Великий туман!', `Сезон острова: шансы ещё ${mul(SEASON_MUL)}`, this.isleSeasonEnds - now, SEASON_SPAN_MS, 'special');
          tone = 'special';
          lamp = true;
        } else if (this.isleFog) {
          html = eventHtml('fog', 'Туман наступает', `Туманные виды · редкие и выше ${mul(RAIN_MUL)}`, this.isleFogUntil ? this.isleFogUntil - now : 0, this.fogSpan);
        }
      } else {
        const st = FISH_SEASON.state(now);
        if (st?.on) {
          html = eventHtml('season', 'Сезон рыбалки!', `Все шансы ${mul(SEASON_MUL)} · клюют виды дождя`, st.left, SEASON_SPAN_MS);
          lamp = true;
        } else if (this.rain) {
          html = eventHtml('rain', 'Дождь — клёв лучше', `Клюют виды дождя · редкие и выше ${mul(RAIN_MUL)}`, this.eventUntil ? this.eventUntil - now : 0, this.rainSpan);
        } else if (st && st.left <= SOON_MS) {
          html = eventHtml('season', 'Сезон рыбалки скоро', `10 минут: шансы ${mul(SEASON_MUL)}, клюют виды дождя`, st.left, 0);
        }
      }
    }
    if (html) this.ui.top.event({ key: EV_KEY, prio: EV_PRIO, html, tone, lamp });
    else this.ui.top.clear(EV_KEY);
  }

  /** У места рыбалки на пристани, у маяка или на баркасе */
  private nearSpot(x: number, z: number): boolean {
    for (const s of FISH_SPOTS) if (Math.hypot(x - s.x, z - s.z) < SPOT_NEAR_M) return true;
    return false;
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

  /** J или «Журнал» в подсказке: открыть журнал (мышь отпускается) или закрыть. */
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
    this.roulette.reset();
    this.quiet = false;
    this.bite(false);
    this.prompt(null);
    this.mode.shown = false;
    this.progress.setShown(false, false);
    this.ui.top.clear(EV_KEY);
    this.ui.top.clearHero('fish-poseidon');
    this.plateNear = false;
    this.focus = false;
    document.documentElement.removeAttribute('data-fish-focus');
  }

  debug(): Record<string, unknown> {
    return { on: FISH2.on, reel: this.reel.active, running: this.reel.running, p: this.reel.progress, card: this.card.shown, book: this.book.isOpen, npc: this.npc.isOpen, rain: this.rain, season: this.season, seasonEnds: this.seasonEnds, eventUntil: this.eventUntil, board: FISH_BOARD_AT, podium: this.top?.podium ?? [], progress: this.ui.me().fishing };
  }
}

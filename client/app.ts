// Оболочка: экран входа, одно соединение на всё время, переходы между сценами (набережная ⇄ пейнтбол),
// меню на Esc (профиль, настройки по категориям — client/ui/menu/), переподключение после обрыва и общий цикл кадров.
// Сцены и общий интерфейс (чат, жетоны, уведомления, «кто где») создаются один раз.
// На телефоне — ещё кнопки на экране (touch.ts): пауза там по кнопке ☰ и когда свернули браузер.
import { MAX_NAME, PROTOCOL_VERSION } from '../shared/constants.ts';
import { emptyStats } from '../shared/economy.ts';
import { frameForLevel, safeXp } from '../shared/levels.ts';
import { emptyFishProgress } from '../shared/fishprogress.ts';
import { CLOSE_SILENCE, type ClientMsg, type ErrorCode, type RoomKind, type ServerMsg } from '../shared/messages.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';
import { DEFAULT_TRACK, RACE_TRACKS, type RaceTrackId } from '../shared/racecourse.ts';
import { Sound } from './audio.ts';
import { Chat } from './chat.ts';
import { HideScene } from './hide/scene.ts';
import { errorReport } from './errors.ts';
import { FightScene } from './fight/scene.ts';
import { FortScene } from './fort/scene.ts';
import { fortLoadingLine } from './fort/record.ts';
import { deviceKey, forgetNick, oldName, resetDeviceKey, saveNick, savedNick } from './identity.ts';
import { Input, isMuteKey } from './input.ts';
import { LobbyScene } from './lobby/scene.ts';
import { FISH_SEASON, SEASON_PERKS, isFishSeasonMsg, seasonWait, type FishSeasonMsg } from './lobby/fishseason.ts';
import { Net } from './net.ts';
import { Relink } from './relink.ts';
import { LinkBanner } from './ui/linkbanner.ts';
import { PaintballScene } from './paintball/scene.ts';
import { RaceScene } from './race/scene.ts';
import { SkillScene } from './skilltest/scene.ts';
import { Renderer } from './render/renderer.ts';
import { EFFECTS_K, FrameLimiter, VIEW_K, gfx, resolveGfx, type GfxState } from './render/gfx.ts';
import { assessFrames, nextAutoQuality } from './render/quality.ts';
import type { MeState, Scene, SceneDeps } from './scene.ts';
import { effectiveVolume, loadSettings, saveSettings, toggleMute, type Quality, type Settings } from './settings.ts';
import { TOUCH, TouchControls } from './touch.ts';
import { COIN_HTML } from './ui/coin.ts';
import { GameMenu, applyInterface } from './ui/menu/menu.ts';
import { OnlineList } from './ui/online.ts';
import { KickVoteUi } from './ui/kickvote.ts';
import { ProfilePanel } from './ui/profile.ts';
import { Toasts } from './ui/toasts.ts';
import { TokensHud } from './ui/tokens.ts';
import { Transition } from './ui/transition.ts';
import { VoiceController, voiceInputAllowed } from './voice.ts';
import { VoiceUi } from './ui/voice.ts';
import './ui/voice.css';
import { loadVoicePrefs, saveVoicePrefs } from './voice-prefs.ts';
import { setVoiceSource } from './ui/voicepanel.ts';
import './ui/mobile-fishing.css';
import { setVoicePresence } from './render/voice-presence.ts';

type Screen = 'join' | 'connecting' | 'game' | 'reconnecting' | 'lost' | 'replaced';
/** Экран входа: «Привет, ник!», поле ника или поле кода с другого устройства */
type JoinMode = 'saved' | 'nick' | 'code';

const NICKS = ['Кругляш', 'Мармеладка', 'Боцман', 'Юнга', 'Шкипер', 'Клякса', 'Пончик', 'Бублик', 'Карамелька', 'Лоцман', 'Тюлька', 'Кок'];
const CONNECT_TIMEOUT_MS = 9000;
/**
 * В игре сервер шлёт снимки 30 раз в секунду: 20 с тишины — связь умерла, возвращаемся в сессию заново (relink.ts).
 * Было 8 с: при пинге 220–260 мс TCP после короткого провала сети догоняет за 8–12 с, и живые соединения рвались.
 */
const SILENCE_MS = 20_000;
/** Сервер молчит дольше этого — плашка «Связь нестабильна» (игра идёт дальше) */
const SHAKY_MS = 3000;
/** Паузы между попытками переподключения, с (дальше — последняя) */
const RETRY_S = [1, 2, 4, 8, 15];
const PING_MS = 2000;
/** Мышь не захвачена, а сцене нужна: столько ждём (захват мог ещё не успеть), потом просим снова или пауза */
const POINTER_GRACE_MS = 300;
/** Флаг «уже перезагружались из-за новой версии» — чтобы не зациклиться */
const VRELOAD = 'opus.vreload';

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

export class App {
  private readonly settings: Settings = loadSettings();
  private readonly renderer: Renderer;
  private readonly sound = new Sound();
  private readonly input: Input;
  private readonly net = new Net();
  /** Возврат в ту же сессию после обрыва связи: сцена остаётся, сервер досылает пропущенное */
  private readonly relink: Relink;
  private readonly linkBanner: LinkBanner;
  private readonly shell: HTMLElement;
  private readonly chat: Chat;
  private readonly tokens: TokensHud;
  private readonly toasts: Toasts;
  private readonly online: OnlineList;
  /** Плашка голосования «выгнать игрока» (меню Tab → 👢, shared/votekick.ts) */
  private readonly kickVote: KickVoteUi;
  private readonly profile = new ProfilePanel();
  /** Меню на Esc (на телефоне ☰): профиль, настройки по категориям, клавиши */
  private readonly menu: GameMenu;
  /** Кнопки на экране — только на телефоне и планшете */
  private readonly touch: TouchControls | null;
  private readonly deps: SceneDeps;
  private readonly lobby: LobbyScene;
  private paintball: PaintballScene | null = null;
  /** Трасса строится при первом заезде и остаётся в памяти */
  private race: RaceScene | null = null;
  private readonly raceScenes = new Map<RaceTrackId, RaceScene>();
  private raceTrack: RaceTrackId = DEFAULT_TRACK;
  private skill: SkillScene | null = null;
  private hide: HideScene | null = null;
  private voice: VoiceController | null = null;
  private voiceUi: VoiceUi | null = null;
  private voiceHudVisible = false;
  private voiceTransmitting = false;
  private fishingUi = false;
  private celebratedLevel = 1;
  /** Крепость (режим за флагом сервера) — тоже при первом входе */
  private fort: FortScene | null = null;
  /** Подвал «Fight Club» (режим за флагом сервера) — при первом спуске */
  private fight: FightScene | null = null;
  private active: Scene | null = null;
  private me: MeState = { pid: 0, xp: 0, level: 1, nick: '', tokens: 0, owned: [], outfit: { ...DEFAULT_OUTFIT }, stats: emptyStats(), album: {}, fishing: emptyFishProgress() };
  private fishEventOn = false;
  private fishEventKnown = false;
  /** Сезон рыбалки по последнему письму сервера (null — писем ещё не было) */
  private fishSeasonOn: boolean | null = null;
  /** Этот дождь — дождь сезона рыбалки: о нём сказал тост сезона, про дождь молчим */
  private fishSeasonRain = false;
  /** Сборка сервера с последнего входа: сменилась — значит, вышла новая версия */
  private build = '';

  private screen: Screen = 'join';
  private joinMode: JoinMode = 'nick';
  private paused = false;
  private hello: ClientMsg | null = null;
  /** Текст последней ошибки сервера — покажем, если следом закроется соединение */
  private lastError = '';
  private restarting = false;
  private reloading = false;
  private renamePending = false;
  private connectAt = 0;
  private attemptAt = 0;
  private retryN = 0;
  private retryAt = 0;
  private retryTimer = 0;
  /** С каким кодом закрылось соединение перед переподключением — сервер запишет причину */
  private lastClose = 0;

  // экраны
  private readonly joinEl: HTMLElement;
  private readonly pauseEl: HTMLElement;
  private readonly lostEl: HTMLElement;
  private readonly reconnectEl: HTMLElement;
  private readonly replacedEl: HTMLElement;
  private readonly fadeEl: HTMLElement;
  /** Плавный переход между комнатами: экран загрузки, прогрев, «готов» серверу (ui/transition.ts) */
  private readonly transition: Transition;
  private readonly helloNick: HTMLElement;
  private readonly nameInput: HTMLInputElement;
  private readonly codeInput: HTMLInputElement;
  private readonly joinError: HTMLElement;
  private readonly playBtn: HTMLButtonElement;
  private readonly onlineEl: HTMLElement;
  private readonly settingsEl: HTMLElement;
  private readonly lostReason: HTMLElement;
  private readonly rcTitle: HTMLElement;
  private readonly rcSub: HTMLElement;
  private readonly pauseSub: HTMLElement;
  private readonly toLobbyBtn: HTMLElement;
  /** Ползунок громкости и флажок «Без звука» — под текущие настройки (M жмут и в игре) */
  private syncSound: () => void = () => {};

  // кадр и качество
  private last = 0;
  private pixelRatio = 1;
  private autoRatio = 1;
  /** С чего «авто» начинало: если разрешение пришлось снизить, компьютер слабый */
  private autoStart = 1;
  /** Ограничение кадров из меню (0 — без ограничения) и ограничитель, который решает, рисовать ли очередной кадр браузера */
  private fpsCap = 0;
  private readonly limiter = new FrameLimiter();
  /** Какой уровень детализации и сколько частиц уже розданы сценам (applyQuality) */
  private sceneQualityKey = '';
  private readonly frameMs = new Float32Array(72);
  private frameN = 0;
  private frameStats = { median: 0, p95: 0, slow: false };
  /** С какого кадра мышь не захвачена, хотя сцене нужна (0 — всё в порядке) */
  private unlockedAt = 0;
  private slowWindows = 0;
  private perfWait = 3;
  private healthTimer = 5;

  constructor(canvas: HTMLCanvasElement, shell: HTMLElement, menus: HTMLElement) {
    this.renderer = new Renderer(canvas);
    this.input = new Input(canvas);
    this.input.blocked = true;
    this.shell = shell;
    document.documentElement.classList.toggle('touch', TOUCH);
    // кнопки на экране — под интерфейсом сцен (их подсказки и панели нажимаются пальцем) и под чатом
    this.touch = TOUCH ? new TouchControls(shell, this.input) : null;
    this.chat = new Chat(shell);
    this.tokens = new TokensHud(shell);
    // «кто где» (Tab): громкость голоса каждого и 👢; ПКМ, пока держишь Tab, — мышь в список, игра ждёт
    this.online = new OnlineList(shell, {
      kick: (pid) => this.net.send({ t: 'kick', a: 'start', pid }),
      pinned: (on) => {
        if (on) { this.input.unlock(); this.input.releaseAll(); }
        this.updateBlocked();
      },
      restorePointer: () => { if (this.active?.wantsPointer !== false) this.wantPointer(); },
    });
    this.kickVote = new KickVoteUi(document.body, { myPid: () => this.me.pid, send: (m) => this.net.send(m), opened: () => this.sound.pairAsk() });
    // уведомления — над меню: ошибка смены ника видна и в профиле
    this.toasts = new Toasts(menus);
    this.linkBanner = new LinkBanner(menus);
    this.relink = new Relink({
      connect: (rs) => {
        this.hello = { t: 'hello', v: PROTOCOL_VERSION, key: deviceKey(), re: this.lastClose, rs };
        this.net.connect();
      },
      abort: () => this.net.close(),
      rx: () => this.net.rx,
      setRx: (n) => { this.net.rx = n; },
      down: () => { this.voice?.linkDown(); this.input.releaseAll(); this.updateBlocked(); },
      up: (resumed) => {
        this.updateBlocked();
        if (resumed) {
          this.voice?.linkUp();
          this.toasts.show('Связь восстановлена', 1800, 'link');
          return;
        }
        // сервер начал сессию заново: голос и жетоны — с нуля, сцену он пришлёт сам
        setVoicePresence([]);
        this.tokens.reset();
        this.voice?.disconnected(true);
      },
      giveUp: () => {
        this.net.close();
        setVoicePresence([]);
        this.tokens.reset();
        this.voice?.disconnected(true);
        this.startReconnect();
      },
      banner: (text) => this.linkBanner.show(text, 'down'),
      now: () => performance.now(),
      setTimer: (fn, ms) => window.setTimeout(fn, ms),
      clearTimer: (id) => clearTimeout(id),
    });
    window.addEventListener('online', () => this.relink.online());
    // вкладку закрывают или обновляют — сервер отпустит сразу; заморозка в фоне (persisted) — подождёт возврата
    window.addEventListener('pagehide', (e) => { if (!e.persisted && this.net.isOpen) this.net.send({ t: 'bye' }); });
    this.deps = {
      renderer: this.renderer,
      input: this.input,
      sound: this.sound,
      settings: this.settings,
      net: this.net,
      ui: { chat: this.chat, tokens: this.tokens, toasts: this.toasts, online: this.online, me: () => this.me },
      hudRoot: shell,
      overlay: menus,
      wantPointer: () => this.wantPointer(),
    };
    this.lobby = new LobbyScene(this.deps);

    const dpr = window.devicePixelRatio || 1;
    // телефон: экран маленький и плотный — хватит и меньшего разрешения, а батарея и нагрев скажут спасибо
    this.autoRatio = this.autoStart = TOUCH ? Math.min(dpr, 1.25) : dpr >= 2 ? 1.5 : Math.min(dpr, 1.25);

    // --- экраны
    this.joinEl = h('div', 'screen join show');
    this.joinEl.innerHTML = `
      <div class="join-card">
        <div class="logo">
          <div class="logo-top">TIRED<b>WOOD</b></div>
          <div class="logo-sub">мини игры, фарм сабжей, казино и safeplace</div>
        </div>
        <div class="join-hello">Привет, <b class="hello-nick"></b>!</div>
        <label class="field join-nick">
          <span>Как тебя звать?</span>
          <input class="name" type="text" maxlength="${MAX_NAME}" autocomplete="off" spellcheck="false" />
        </label>
        <label class="field join-code">
          <span>Код с другого устройства (там: меню, Esc или ☰ → «Подарки и коды»)</span>
          <input class="code" type="text" maxlength="12" autocomplete="off" spellcheck="false" placeholder="ABCD-2345" />
        </label>
        <div class="join-error"></div>
        <button class="btn primary play">Играть</button>
        <div class="join-links">
          <button class="link other">Другой профиль</button>
          <button class="link have-code">У меня есть код</button>
          <button class="link back">Назад</button>
        </div>
        <div class="online"></div>
        <div class="keys touch-keys">
          <div><b>🕹</b><span>слева пальцем — бег</span></div>
          <div><b>👆</b><span>справа пальцем — осмотреться</span></div>
          <div><b>⤒</b><span>прыжок</span></div>
          <div><b>E</b><span>действие: сесть, сыграть, войти</span></div>
          <div><b>😊</b><span>эмоции</span></div>
          <div><b>💬</b><span>чат</span></div>
          <div><b>👥</b><span>кто где · счёт</span></div>
          <div><b>☰</b><span>меню: профиль, настройки</span></div>
        </div>
        <div class="keys desk-keys">
          <div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>бег</span></div>
          <div><kbd class="wide">Пробел</kbd><span>прыжок</span></div>
          <div><kbd class="wide">Shift</kbd><span>рывок</span></div>
          <div><kbd>E</kbd><span>действие</span></div>
          <div><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><kbd>4</kbd><span>эмоции</span></div>
          <div><kbd>ЛКМ</kbd><kbd>ПКМ</kbd><span>огонь, прицел</span></div>
          <div><kbd>R</kbd><span>перезарядка</span></div>
          <div><kbd class="wide">Enter</kbd><span>чат</span></div>
          <div><kbd>Tab</kbd><span>кто где · счёт</span></div>
          <div><kbd>M</kbd><span>звук вкл / выкл</span></div>
          <div><kbd>Esc</kbd><span>меню: профиль, настройки</span></div>
        </div>
        <details class="join-settings"><summary>Настройки</summary></details>
        <div class="tips">Жетоны ${COIN_HTML} — за бои на складе, партии в дурака, гонки и ежедневный бонус · тратятся на автоматы и наряды · в воду не падай 🌊</div>
      </div>`;
    this.menu = new GameMenu(this.profile, this.settings, {
      resume: () => this.resume(),
      toLobby: () => {
        // в катере регаты (она на набережной) — сойти на берег, иначе — из режима на набережную
        if (this.active === this.lobby && this.lobby.racing) this.lobby.quitRace();
        else this.net.send({ t: 'leave' });
        this.resume();
      },
      leave: () => this.toMenu(),
      profile: (open) => this.showProfile(open),
      redeem: (code) => this.net.send({ t: 'redeem', code }),
      changed: () => this.applySettings(),
      gfx: () => this.gfxNow(),
      preview: (kind) => {
        this.sound.unlock();
        this.sound.preview(kind);
      },
      room: () => this.active?.kind ?? 'lobby',
      gifts: () => this.me.gifts === true,
    });
    this.pauseEl = this.menu.root;
    this.lostEl = h('div', 'screen lost');
    this.lostEl.innerHTML = `
      <div class="pause-card">
        <div class="pause-title">Связь потеряна</div>
        <div class="pause-sub lost-reason"></div>
        <button class="btn primary retry">Переподключиться</button>
        <button class="btn ghost menu">В меню</button>
      </div>`;
    this.reconnectEl = h('div', 'screen reconnect');
    this.reconnectEl.innerHTML = `
      <div class="pause-card">
        <div class="pause-title rc-title"></div>
        <div class="pause-sub rc-sub"></div>
        <button class="btn ghost menu">В меню</button>
      </div>`;
    this.replacedEl = h('div', 'screen lost replaced');
    this.replacedEl.innerHTML = `
      <div class="pause-card">
        <div class="pause-title">Ты зашёл в другом окне</div>
        <div class="pause-sub">Играть можно в одном окне за раз — здесь игра остановлена.</div>
        <button class="btn primary back-here">Вернуться сюда</button>
        <button class="btn ghost menu">В меню</button>
      </div>`;
    this.fadeEl = h('div', 'fade');
    menus.append(this.fadeEl, this.joinEl, this.pauseEl, this.lostEl, this.reconnectEl, this.replacedEl);
    this.transition = new Transition({
      renderer: this.renderer, active: () => this.active, send: (m) => this.net.send(m), nick: () => this.me.nick, sound: this.sound,
      build: (kind, epoch) => { this.net.epoch = epoch; this.switchScene(kind, true); return this.active!; },
      detail: (kind) => (kind === 'race' ? RACE_TRACKS.find((t) => t.id === this.raceTrack)?.name ?? null : kind === 'fort' ? fortLoadingLine(this.me.stats?.ftBest ?? 0) : null),
      blockedChanged: () => this.updateBlocked(), freePointer: () => this.input.unlock(),
    }, this.fadeEl);

    this.helloNick = this.joinEl.querySelector('.hello-nick')!;
    this.nameInput = this.joinEl.querySelector('.name')!;
    this.codeInput = this.joinEl.querySelector('.code')!;
    this.joinError = this.joinEl.querySelector('.join-error')!;
    this.playBtn = this.joinEl.querySelector('.play')!;
    this.onlineEl = this.joinEl.querySelector('.online')!;
    this.lostReason = this.lostEl.querySelector('.lost-reason')!;
    this.rcTitle = this.reconnectEl.querySelector('.rc-title')!;
    this.rcSub = this.reconnectEl.querySelector('.rc-sub')!;
    this.pauseSub = this.menu.sub;
    this.toLobbyBtn = this.menu.toLobbyBtn;
    this.settingsEl = this.menu.settings.root;
    this.syncSound = () => this.menu.settings.sync();
    this.joinEl.querySelector('.join-settings')!.appendChild(this.settingsEl);

    this.nameInput.value = oldName();
    this.nameInput.placeholder = NICKS[Math.floor(Math.random() * NICKS.length)];
    const enterPlays = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.play();
      }
    };
    this.nameInput.addEventListener('keydown', enterPlays);
    this.codeInput.addEventListener('keydown', enterPlays);
    this.playBtn.addEventListener('click', () => this.play());
    this.joinEl.querySelector('.other')!.addEventListener('click', () => this.otherProfile());
    this.joinEl.querySelector('.have-code')!.addEventListener('click', () => this.setJoinMode('code'));
    this.joinEl.querySelector('.back')!.addEventListener('click', () => this.setJoinMode(savedNick() ? 'saved' : 'nick'));
    this.lostEl.querySelector('.retry')!.addEventListener('click', () => this.play());
    this.replacedEl.querySelector('.back-here')!.addEventListener('click', () => this.play());
    for (const el of [this.lostEl, this.reconnectEl, this.replacedEl]) el.querySelector('.menu')!.addEventListener('click', () => this.toMenu());
    this.profile.onRename = (nick) => {
      this.renamePending = true;
      this.net.send({ t: 'rename', nick });
    };
    this.profile.onCode = () => this.net.send({ t: 'code' });

    // --- соединение
    this.net.onOpen = () => {
      if (this.hello) this.net.send(this.hello);
    };
    this.net.onJson = (m) => this.onJson(m);
    this.net.onBinary = (buf, at) => this.transition.snapshot(buf, at);
    this.net.onClose = (code, reason) => this.onClose(code, reason);
    // ошибки браузера — серверу, но только из игры (до входа ждут в очереди)
    errorReport.scene = () => this.active?.kind ?? this.screen;
    errorReport.send = (m) => {
      if (this.screen !== 'game' || !this.net.isOpen) return false;
      this.net.send(m);
      return true;
    };
    window.setInterval(() => {
      // r — подтверждение: сколько сообщений сессии дошло (сервер их забывает, недошедшее дошлёт после обрыва)
      if (this.screen === 'game') this.net.send({ t: 'ping', c: performance.now(), r: this.net.rx });
    }, PING_MS);

    // --- ввод
    this.input.onKey = (code, down, e) => this.onKey(code, down, e);
    this.input.onUse = (mouse) => {
      if (this.screen === 'game' && !this.paused) this.active?.onUse(mouse);
    };
    if (this.touch) {
      this.touch.onPause = () => this.touchPause();
      this.touch.onChat = () => {
        if (this.screen === 'game' && !this.paused) this.chat.open('', true);
      };
      // свернули браузер или ушли в другое приложение — вернёмся на паузу
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.touchPause();
      });
    }
    this.input.onLockChange = (locked) => {
      if (this.screen !== 'game') return;
      if (locked) this.setPaused(false);
      else if (this.active?.wantsPointer !== false && !this.online.pinned) {
        this.chat.close();
        this.setPaused(true);
      }
    };
    this.chat.onOpenChange = (open) => {
      this.updateBlocked();
      if (open) this.input.releaseAll();
    };
    this.chat.onSend = (text) => this.net.send({ t: 'chat', text });
    this.applySettings();

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.pollHealth();

    if (import.meta.env.DEV || location.search.includes('debug')) {
      (window as unknown as Record<string, unknown>).__opus = {
        app: this,
        net: this.net,
        input: this.input,
        send: (m: ClientMsg) => this.net.send(m),
        voice: () => this.voice?.debug() ?? null,
        // русалка у мостков сразу: __opus.mermaid() — как повезёт, __opus.mermaid(0) / (1) — с первого или второго борта (номера — в state().mermaid.sides)
        // (второй номер — застыть на этой секунде появления, для снимков; __opus.mermaidOff() — убрать)
        mermaid: (side?: number, hold?: number) => this.lobby.mermaid.call(side, hold),
        mermaidOff: () => this.lobby.mermaid.clear(),
        state: () => ({ screen: this.screen, scene: this.active?.kind ?? null, paused: this.paused, nick: this.me.nick, tokens: this.me.tokens, epoch: this.net.epoch, transition: this.transition.debugState(), ...this.active?.debugState() }),
        look: (yaw: number, pitch: number) => {
          this.input.yaw = yaw;
          this.input.pitch = pitch;
        },
        info: () => ({ ...this.renderer.gl.info.render, ratio: this.pixelRatio, screen: this.screen, paused: this.paused,
          cpuMs: this.renderer.cpuMs, gpuMs: this.renderer.gpuMs, frameMedianMs: this.frameStats.median, frameP95Ms: this.frameStats.p95,
          quality: this.renderQuality(), gfx: { ...this.gfxNow(), ...this.renderer.gfxState(), fx: gfx.fx }, memory: { ...this.renderer.gl.info.memory } }),
      };
    }
  }

  start(): void {
    requestAnimationFrame(this.frame);
    this.setJoinMode(savedNick() ? 'saved' : 'nick');
  }

  // ------------------------------------------------------------ вход

  private setJoinMode(mode: JoinMode): void {
    this.joinMode = mode;
    this.joinEl.classList.remove('mode-saved', 'mode-nick', 'mode-code');
    this.joinEl.classList.add(`mode-${mode}`);
    this.helloNick.textContent = savedNick();
    this.joinError.textContent = '';
    if (mode === 'code') {
      this.codeInput.value = '';
      this.codeInput.focus();
    } else if (mode === 'nick' && !this.nameInput.value) {
      this.nameInput.focus();
    }
  }

  private makeHello(): ClientMsg | null {
    const base = { t: 'hello' as const, v: PROTOCOL_VERSION, key: deviceKey() };
    if (this.joinMode === 'code') {
      const code = this.codeInput.value.replace(/[\s-]/g, '').toUpperCase();
      if (!code) {
        this.joinError.textContent = 'Введи код с другого устройства';
        this.codeInput.focus();
        return null;
      }
      return { ...base, code };
    }
    if (this.joinMode === 'nick') {
      let nick = this.nameInput.value.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
      if (!nick) nick = this.nameInput.placeholder;
      this.nameInput.value = nick;
      return { ...base, nick };
    }
    return base;
  }

  private play(): void {
    if (this.screen === 'connecting') return;
    const hello = this.makeHello();
    if (!hello) return;
    this.hello = hello;
    this.lastError = '';
    this.restarting = false;
    this.stopRetry();
    // звук и захват мыши — строго внутри клика пользователя
    this.sound.unlock();
    this.sound.setVolume(effectiveVolume(this.settings));
    void this.input.lock();
    // телефон: на весь экран, без строки адреса (iPhone так не умеет — тогда просто как есть)
    if (TOUCH && !document.fullscreenElement) document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {});
    this.screen = 'connecting';
    this.connectAt = performance.now();
    this.showScreen(this.joinEl);
    this.joinError.textContent = '';
    this.playBtn.disabled = true;
    this.playBtn.textContent = 'Подключаемся…';
    // после ошибки ника соединение остаётся открытым — просто пробуем ещё раз
    if (this.net.isOpen) this.net.send(hello);
    else this.net.connect();
  }

  /** «Другой профиль»: новый ключ устройства — старый профиль здесь больше не узнается. */
  private otherProfile(): void {
    const ok = window.confirm(
      `Начать новый профиль?\n\nПрофиль «${savedNick()}» на этом устройстве больше не откроется — вернуть его можно только кодом с другого устройства, где ты в нём играешь.`,
    );
    if (!ok) return;
    resetDeviceKey();
    forgetNick();
    this.net.close();
    this.nameInput.value = '';
    this.setJoinMode('nick');
  }

  /** Ошибка входа: назад на экран входа, соединение не закрываем. */
  private backToJoin(mode: JoinMode, text: string): void {
    this.stopRetry();
    this.screen = 'join';
    this.leaveGame();
    this.input.unlock();
    this.resetPlayButton();
    this.showScreen(this.joinEl);
    if (mode === 'nick' && !this.nameInput.value) this.nameInput.value = savedNick() || oldName();
    this.setJoinMode(mode);
    this.joinError.textContent = text;
    if (mode === 'nick') {
      this.nameInput.focus();
      this.nameInput.select();
    }
  }

  private resetPlayButton(): void {
    this.playBtn.disabled = false;
    this.playBtn.textContent = 'Играть';
  }

  // ------------------------------------------------------------ сообщения сервера

  /**
   * Сезон рыбалки (раз в 2 часа особый дождь на 10 минут — решает сервер): часы сезона для окна Семёна и плашки у удочки;
   * начался при нас или уже идёт, когда вошли, — короткий тост (сервер шлёт сезон раньше рыболовного события, и тост
   * дождя в сезон не показывается). Конец объявляет чат сервера.
   */
  private onFishSeason(m: FishSeasonMsg): void {
    const was = this.fishSeasonOn;
    FISH_SEASON.onMsg(m);
    this.fishSeasonOn = m.on;
    if (!m.on) return;
    this.fishSeasonRain = true;
    // минуты — до ближайшей: только что начавшийся сезон — «10 мин» (вверх из-за миллисекунд задержки было «11 мин»)
    const left = Math.max(60_000, Math.round((m.endsAt - FISH_SEASON.now()) / 60_000) * 60_000);
    if (was !== true) this.toasts.show(`🎉 Сезон рыбалки · ${seasonWait(left)}`, 7500, 'fish-event', SEASON_PERKS);
  }

  private onJson(m: ServerMsg): void {
    if (this.relink.active && this.relink.message(m.t)) return;
    // сезон рыбалки: типа письма ещё нет в ServerMsg (его добавляет сервер) — проверяем поля сами
    const season = m as unknown;
    if (isFishSeasonMsg(season)) {
      this.onFishSeason(season);
      // и набережной: рыбы прыгают у мест рыбалки, «Шансы сейчас» считают сезон
      this.lobby.onJson(m);
      return;
    }
    switch (m.t) {
      case 'voiceConfig':
        this.ensureVoice();
        this.voice!.onMessage(m);
        this.syncVoiceVisibility();
        return;
      case 'voiceState':
      case 'voiceSignal':
      case 'voiceError':
        this.voice?.onMessage(m);
        return;
      case 'me':
        this.onMe(m);
        return;
      case 'levelUp':
        this.onLevelUp(m);
        return;
      case 'tokens':
        this.me.tokens = m.n;
        this.tokens.set(m.n, m.delay ?? 0);
        this.lobby.onJson(m);
        if (this.pauseEl.classList.contains('profile-open')) this.profile.update(this.me);
        return;
      case 'fishProgress':
      case 'fishNpc':
        this.me.fishing = m.progress;
        this.lobby.onJson(m);
        if (this.pauseEl.classList.contains('profile-open')) this.profile.update(this.me);
        return;
      case 'fishEvent': {
        const changed = m.on !== this.fishEventOn;
        this.lobby.onJson(m);
        // тост: строка-заголовок (что и надолго ли) и коротко, что даёт; во время сезона рыбалки — его тост
        if (m.on && (changed || !this.fishEventKnown)) {
          const left = m.until ? m.until - FISH_SEASON.now() : 0;
          const long = left > 0 && left < 3_600_000 ? ` · ${seasonWait(left)}` : '';
          if (this.fishSeasonOn !== true) this.toasts.show(`🌧 Рыболовное событие${long}`, 7500, 'fish-event', 'уникальные виды рыб · редкие и выше ×1,5');
        } else if (!m.on && changed && this.fishEventKnown) {
          if (!this.fishSeasonRain) this.toasts.show('🌧 Рыболовное событие закончилось', 4200, 'fish-event');
          this.fishSeasonRain = false;
        }
        this.fishEventOn = m.on;
        this.fishEventKnown = true;
        return;
      }
      case 'toast':
        this.toasts.show(m.text, m.ms, m.key, m.sub, m.big);
        if (this.renamePending && this.pauseEl.classList.contains('profile-open')) {
          this.renamePending = false;
          this.profile.setNote(m.text);
        }
        return;
      case 'scene':
        if (this.screen === 'game' && this.active) {
          // в игре — плавно, через экран загрузки; голос сбрасываем сразу: его новое состояние придёт следом
          setVoicePresence([]);
          this.voice?.roomChanged();
          this.transition.begin(m.scene, m.epoch);
        } else {
          // вход и переподключение — сразу (их закрывает свой экран)
          this.net.epoch = m.epoch;
          this.switchScene(m.scene);
          this.transition.instant(m.epoch);
        }
        return;
      case 'load':
      case 'go':
        this.transition.onJson(m);
        return;
      case 'lobby':
        this.raceTrack = m.kart.track ?? DEFAULT_TRACK;
        // Приветствие набережной — через переход, как у остальных комнат: при возврате из режима сцена набережной
        // входит (enter) позже письма, и enter() стёр бы свой id — игрок оставался без желейки до перезагрузки.
        this.transition.toScene(m);
        return;
      case 'kart':
        this.raceTrack = m.track ?? DEFAULT_TRACK;
        this.lobby.onJson(m);
        return;
      case 'race': {
        const track = m.track ?? DEFAULT_TRACK;
        this.raceTrack = track;
        // Приветствие сервера — источник выбранной трассы, в том числе после переподключения.
        if (this.active?.kind === 'race' && this.race?.trackId !== track) this.switchScene('race');
        this.transition.toScene(m);
        return;
      }
      case 'code':
        this.profile.showCode(m.code, m.until);
        return;
      case 'redeemResult':
        // подарочный код вводят и в примерочной, и в меню (Профиль → Подарки и коды)
        this.menu.giftResult(m.result);
        this.active?.onJson(m);
        return;
      case 'restart':
        this.restarting = true;
        this.relink.restarting = true;
        return;
      case 'error':
        this.onError(m.code, m.text);
        return;
      case 'pong': {
        const ms = performance.now() - m.c;
        this.net.pingMs = this.net.pingMs > 0 ? this.net.pingMs * 0.7 + ms * 0.3 : ms;
        return;
      }
      case 'chat':
        this.chat.add(m, this.me.pid, this.active?.kind ?? 'lobby');
        if (!m.sys && m.pid !== this.me.pid) this.sound.chat();
        // облачка над головой — дело сцены
        this.transition.toScene(m);
        return;
      case 'chatlog':
        this.chat.clear();
        for (const line of m.list) this.chat.add(line, this.me.pid, this.active?.kind ?? 'lobby');
        return;
      case 'online':
        this.online.set(m.list, this.me.nick, this.me.pid);
        return;
      case 'kickVote':
        this.kickVote.onState(m);
        this.online.setKick(this.kickVote.enabled, this.kickVote.active);
        return;
      default:
        this.transition.toScene(m);
    }
  }

  private onMe(m: Extract<ServerMsg, { t: 'me' }>): void {
    if (this.build && m.build !== this.build) {
      // сервер обновился, пока нас не было: берём свежий клиент
      this.reloading = true;
      location.reload();
      return;
    }
    this.build = m.build;
    const renamed = this.renamePending && m.nick !== this.me.nick;
    if (this.me.pid !== m.pid) this.celebratedLevel = Math.max(1, m.level ?? 1);
    this.me = { pid: m.pid, xp: safeXp(m.xp ?? 0), level: Math.max(1, Math.floor(m.level ?? 1)), nick: m.nick, tokens: m.tokens, owned: m.owned, outfit: m.outfit, stats: m.stats, album: m.album ?? {}, fishing: m.fishing ?? emptyFishProgress(), gifts: m.gifts === true };
    saveNick(m.nick);
    this.tokens.sync(m.tokens);
    this.profile.update(this.me);
    if (renamed) {
      this.renamePending = false;
      this.profile.setNote(`Готово — теперь ты ${m.nick}`);
    }
    // наряд и купленное — сцене (примерочная)
    this.lobby.onJson(m);
    if (this.active && this.active !== this.lobby) this.active.onJson(m);
  }

  /** A private server event: other people's levels never alter my profile or trigger a celebration. */
  private onLevelUp(m: Extract<ServerMsg, { t: 'levelUp' }>): void {
    if (m.pid !== this.me.pid || !Number.isFinite(m.level) || m.level <= this.celebratedLevel) return;
    this.celebratedLevel = m.level;
    this.me.xp = Math.max(this.me.xp, safeXp(m.xp));
    this.me.level = Math.max(this.me.level, Math.floor(m.level));
    this.profile.update(this.me);
    const tier = frameForLevel(m.level);
    const unlocked = m.milestones.length ? ` · новая рамка: ${tier.name}` : '';
    this.toasts.show(`Уровень ${m.level}${unlocked}`, 4200, 'level-up');
    this.sound.coin(null);
    const me: Extract<ServerMsg, { t: 'me' }> = { t: 'me', ...this.me, build: this.build };
    this.lobby.onJson(me);
    if (this.active && this.active !== this.lobby) this.active.onJson(me);
    // Small, non-interactive sparkle near the HUD; reduced-motion keeps it still.
    const spark = document.createElement('span'); spark.textContent = '✦'; spark.setAttribute('aria-hidden', 'true'); spark.dataset.levelSpark = '1';
    Object.assign(spark.style, { position: 'absolute', top: '58px', right: '32px', color: tier.light, fontSize: '32px', textShadow: `0 0 12px ${tier.color}`, pointerEvents: 'none' });
    this.deps.overlay.querySelectorAll('[data-level-spark]').forEach(e => e.remove()); this.deps.overlay.appendChild(spark);
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) spark.animate([{ opacity: 0, transform: 'scale(.7)' }, { opacity: 1, transform: 'scale(1.1)', offset: 0.15 }, { opacity: 0, transform: 'scale(1)' }], { duration: 2300, easing: 'ease-out' });
    setTimeout(() => spark.remove(), 2400);
  }

  private onError(code: ErrorCode | undefined, text: string): void {
    switch (code) {
      case 'version':
        this.reloadForUpdate();
        return;
      case 'replaced':
        // следом придёт закрытие 4001
        return;
      case 'kicked':
        // выгнали голосованием (или ещё не прошло 10 минут): экран с причиной, сами не переподключаемся
        this.lastError = text;
        this.showLost(text, true);
        return;
      case 'need_nick':
        this.backToJoin('nick', savedNick() ? 'Сервер тебя не узнал — впиши ник ещё раз' : text);
        return;
      case 'nick_taken':
      case 'bad_nick':
        this.backToJoin('nick', text);
        return;
      case 'bad_code':
        this.backToJoin('code', text);
        return;
      case 'bad_key':
        resetDeviceKey();
        this.backToJoin('nick', text);
        return;
      case 'rate':
        this.backToJoin(this.joinMode, text);
        return;
      default:
        this.lastError = text;
    }
  }

  private onClose(code: number, reason: string): void {
    // обрыв посреди игры — возвращаемся в ту же сессию, сцена остаётся (relink.ts); флуд, другое окно, версия — как раньше
    if (!this.reloading && (this.screen === 'game' || this.relink.active) && code !== 1008 && code !== 4001 && code !== 4002 && code !== 4004) {
      if (!this.relink.active) this.lastClose = code;
      this.relink.lost();
      return;
    }
    this.relink.cancel();
    setVoicePresence([]);
    this.tokens.reset();
    this.voice?.disconnected();
    if (this.reloading) return;
    if (code === 4002) {
      this.reloadForUpdate();
      return;
    }
    if (code === 4001) {
      this.showReplaced();
      return;
    }
    if (code === 4004) {
      this.showLost(this.lastError || 'Так решили игроки голосованием.', true);
      return;
    }
    switch (this.screen) {
      case 'game':
        this.lastClose = code;
        if (code === 1008) this.showLost(closeText(code, reason));
        else this.startReconnect();
        return;
      case 'reconnecting':
        if (code === 1008) this.showLost(closeText(code, reason));
        else this.scheduleRetry();
        return;
      case 'connecting':
        this.showLost(this.lastError || closeText(code, reason));
        return;
      default:
      // на экране входа и прочих соединение уже не нужно — новое откроет «Играть»
    }
  }

  /** Вышла новая версия: перезагрузка — один раз, потом просим обновить руками. */
  private reloadForUpdate(): void {
    if (this.reloading) return;
    let again = true;
    try {
      again = sessionStorage.getItem(VRELOAD) === '1';
      sessionStorage.setItem(VRELOAD, '1');
    } catch {
      // без sessionStorage не рискуем зациклиться
    }
    if (!again) {
      this.reloading = true;
      location.reload();
      return;
    }
    this.showLost('Вышла новая версия игры — обнови страницу (Ctrl+Shift+R)');
  }

  // ------------------------------------------------------------ сцены

  /** quiet — из плавного перехода: голос уже сброшен при письме `scene`, затемнение — у перехода */
  private switchScene(kind: RoomKind, quiet = false): void {
    if (!quiet) {
      setVoicePresence([]);
      this.voice?.roomChanged();
    }
    const next = kind === 'hide' ? (this.hide ??= this.makeHide()) : kind === 'skill' ? (this.skill ??= this.makeSkill()) : kind === 'fight' ? (this.fight ??= this.makeFight()) : kind === 'fort' ? (this.fort ??= this.makeFort()) : kind === 'paintball' ? (this.paintball ??= this.makePaintball()) : kind === 'race' ? this.raceFor(this.raceTrack) : this.lobby;
    this.active?.exit();
    this.active = next;
    // комната — для стилей (телефон стоя: в пейнтболе чат ниже полосы счёта)
    document.documentElement.dataset.room = kind;
    next.enter();
    this.lobby.setMenuOpen(kind === 'lobby' && this.paused);
    this.renderer.refreshShadows();
    this.online.show(false);
    if (!quiet) this.flashFade();
    if (this.screen !== 'game') this.enterGame();
    else if (this.paused) this.refreshPause();
  }

  private makePaintball(): PaintballScene {
    const s = new PaintballScene(this.deps);
    s.setQuality(this.renderQuality());
    s.resize(window.innerWidth, window.innerHeight);
    return s;
  }

  private raceFor(track: RaceTrackId): RaceScene {
    let scene = this.raceScenes.get(track);
    if (!scene) {
      scene = new RaceScene(this.deps, track);
      scene.setQuality(this.renderQuality());
      scene.resize(window.innerWidth, window.innerHeight);
      this.raceScenes.set(track, scene);
    }
    this.race = scene;
    return scene;
  }

  private makeHide(): HideScene {
    const scene = new HideScene(this.deps);
    scene.setQuality(this.renderQuality()); scene.resize(window.innerWidth, window.innerHeight);
    return scene;
  }

  private makeSkill(): SkillScene {
    const scene = new SkillScene(this.deps);
    scene.setQuality(this.renderQuality());
    scene.resize(window.innerWidth, window.innerHeight);
    return scene;
  }

  private makeFort(): FortScene {
    const s = new FortScene(this.deps);
    s.setQuality(this.renderQuality());
    s.resize(window.innerWidth, window.innerHeight);
    return s;
  }

  private makeFight(): FightScene {
    const s = new FightScene(this.deps);
    s.setQuality(this.renderQuality());
    s.resize(window.innerWidth, window.innerHeight);
    return s;
  }

  /** Первая сцена после входа или переподключения. */
  private enterGame(): void {
    this.screen = 'game';
    this.stopRetry();
    this.restarting = false;
    this.showScreen(null);
    this.shell.classList.remove('hidden');
    this.resetPlayButton();
    this.menu.adoptSettings();
    this.setJoinMode('saved');
    this.perfWait = 3;
    try {
      sessionStorage.removeItem(VRELOAD);
    } catch {
      // ничего
    }
    this.setPaused(!this.input.locked && this.active?.wantsPointer !== false);
    errorReport.flush();
  }

  /** Уходим из игры (меню, обрыв, ошибка): сцену — прочь, интерфейс — спрятать. */
  private leaveGame(): void {
    this.transition.cancel();
    this.relink.cancel();
    setVoicePresence([]);
    this.syncFishingUi(false);
    this.voice?.disconnected(this.screen === 'reconnecting');
    this.active?.exit();
    this.active = null;
    delete document.documentElement.dataset.room;
    this.paused = false;
    this.menu.setOpen(false);
    this.showProfile(false);
    this.chat.close();
    this.online.show(false);
    this.kickVote.reset();
    this.shell.classList.add('hidden');
    this.input.releaseAll();
    this.updateBlocked();
  }

  private flashFade(): void {
    const f = this.fadeEl;
    f.classList.add('on');
    void f.offsetWidth;
    // гасим, когда новая сцена уже нарисовала кадр
    requestAnimationFrame(() => requestAnimationFrame(() => f.classList.remove('on')));
  }

  // ------------------------------------------------------------ экраны

  private showScreen(el: HTMLElement | null): void {
    for (const s of [this.joinEl, this.lostEl, this.reconnectEl, this.replacedEl]) s.classList.toggle('show', s === el);
    if (el === this.joinEl) this.joinEl.querySelector('.join-settings')!.appendChild(this.settingsEl);
  }

  private onKey(code: string, down: boolean, e: KeyboardEvent): void {
    // V уже разобрал голос — на window в фазе захвата (ensureVoice), до окон и полей, что глотают клавиши
    if (code === 'KeyV' && e.defaultPrevented) return;
    if (this.screen !== 'game' || !this.active || this.chat.isOpen) return;
    // M — звук: в любой комнате и на паузе, поэтому раньше сцены (ей эта клавиша не нужна)
    if (down && isMuteKey(e)) {
      this.toggleSound();
      return;
    }
    // экран загрузки: клавиши сцене не отдаём (во время затемнения они ушли бы уже в новую комнату)
    if (this.transition.busy) return;
    // Esc в открытом меню: спрятать меню сразу (мышь браузер отдаст по клику), ещё раз — меню назад
    if (down && code === 'Escape' && this.paused) {
      if (!e.repeat) this.menu.setVeil(!this.menu.veiled);
      return;
    }
    // голосование «выгнать»: Y / N (F1 / F2), пока можешь голосовать; в крепости сначала — белый флаг
    const fort = this.active.kind === 'fort';
    if (!fort && this.kickVote.onKey(code, down, e)) return;
    // список Tab с мышью: Tab — закрыть и снова в игру, Esc — закрыть и в меню; остальные клавиши — не игре
    if (this.online.pinned) {
      if (down && !e.repeat && (code === 'Tab' || code === 'Escape')) {
        e.preventDefault();
        this.online.show(false);
        if (this.active.wantsPointer === false) return;
        if (code === 'Tab') this.wantPointer();
        else this.setPaused(true);
      }
      return;
    }
    if (this.active.onKey(code, down, e)) return;
    if (fort && this.kickVote.onKey(code, down, e)) return;
    if (code === 'Tab') {
      e.preventDefault();
      this.online.show(down && !this.paused);
      return;
    }
    if (down && code === 'Enter' && !this.paused) {
      e.preventDefault();
      this.chat.open();
    }
  }

  private resume(): void {
    this.sound.unlock();
    // телефон за столом дурака или в примерочной: управление пальцами там не нужно — просто убрать паузу
    if (TOUCH && this.active?.wantsPointer === false) {
      this.setPaused(false);
      return;
    }
    void this.input.lock().then(() => {
      if (!this.input.locked) this.menu.setHint('Браузер не отдал мышь — кликни ещё раз через секунду');
    });
  }

  /** Телефон: ☰ или свернули браузер — пауза (Esc здесь нет). */
  private touchPause(): void {
    if (this.screen !== 'game' || this.paused) return;
    this.chat.close();
    this.input.unlock();
    this.setPaused(true);
  }

  /**
   * Сцене снова нужна мышь: просим захват (пока прошлый запрос ждёт ответа — не дублируем). Удаётся он только в жесте
   * пользователя (клик, клавиша; Esc — не жест); не удался — пауза с кнопкой, её ставит watchPointer. Сразу по ответу
   * на запрос паузу не ставим: Chrome отвечает раньше, чем мышь становится захваченной, и пауза съела бы нажатый шаг.
   */
  private wantPointer(): void {
    if (this.screen !== 'game' || this.input.locked || this.input.lockPending) return;
    void this.input.lock();
  }

  /**
   * Мышь не захвачена, сцене она нужна, а паузы нет (встали из-за стола или вышли из примерочной, а захват вне жеста
   * не удался) — через 0,3 с пауза с «Продолжить»: там захват — в клике. Иначе курсор так и висит, а мышь не крутит
   * камеру — помогал только перезаход. Телефону «захват» — просто включить управление пальцами.
   */
  private watchPointer(now: number): void {
    const stuck = !this.paused && !this.chat.isOpen && !this.online.pinned && !this.input.locked && !this.input.lockPending && this.active?.wantsPointer !== false;
    if (!stuck) this.unlockedAt = 0;
    else if (this.unlockedAt === 0) this.unlockedAt = now;
    else if (now - this.unlockedAt > POINTER_GRACE_MS) {
      this.unlockedAt = 0;
      if (TOUCH) void this.input.lock();
      else this.setPaused(true);
    }
  }

  private setPaused(p: boolean): void {
    this.paused = p;
    this.lobby.setMenuOpen(this.active?.kind === 'lobby' && p);
    // меню открывается на том разделе, где остановились, с начала; игра за ним идёт дальше
    this.menu.setOpen(p);
    if (p) {
      this.input.releaseAll();
      this.menu.setHint('');
      this.online.show(false);
      this.refreshPause();
    } else {
      this.showProfile(false);
    }
    this.updateBlocked();
  }

  private refreshPause(): void {
    const kind = this.active?.kind ?? 'lobby';
    const sub: Record<RoomKind, string> = {
      lobby: 'Набережная подождёт', paintball: 'Бой на складе идёт дальше — не зевай', race: 'Гонка продолжается без тебя', fort: 'Зомби не ждут — крепость держится без тебя',
      fight: 'В подвале дерутся дальше — о клубе никому',
      skill: 'Чекпоинт сохранён; время прохождения продолжается',
      hide: 'Поиск продолжается — укрытие и время остаются в игре',
    };
    // в катере регаты (она на набережной) — сойти на берег
    const racing = kind === 'lobby' && this.lobby.racing;
    this.pauseSub.textContent = racing ? 'Регата идёт — катер сбавляет ход без тебя' : sub[kind];
    this.toLobbyBtn.style.display = kind === 'lobby' && !racing ? 'none' : '';
    this.toLobbyBtn.textContent = racing ? 'Сойти на берег' : 'На набережную';
  }

  private showProfile(open: boolean): void {
    this.pauseEl.classList.toggle('profile-open', open);
    this.lobby.setMenuOpen(this.active?.kind === 'lobby' && (this.paused || open));
    if (open) {
      this.profile.update(this.me);
    } else {
      this.profile.reset();
      this.renamePending = false;
    }
  }

  private updateBlocked(): void {
    this.input.blocked = this.screen !== 'game' || this.paused || this.chat.isOpen || this.online.pinned || this.transition.busy || this.relink.active;
    this.syncVoiceVisibility();
  }

  private syncFishingUi(on: boolean): void {
    if (on === this.fishingUi) return;
    this.fishingUi = on;
    document.documentElement.toggleAttribute('data-fishing', on);
  }

  /** VOICE=0 never constructs media, listeners or visible controls. */
  private ensureVoice(): void {
    if (this.voice) return;
    // панель «Голос» монтирует само меню (вкладка «Голос», client/ui/voicepanel.ts).
    // Кнопка микрофона — в body, над меню и окнами: на телефоне ею говорят и там.
    this.voiceUi = new VoiceUi(document.body, {
      connectMic: () => { void this.voice?.connectMic(); },
      push: on => this.voice?.push(on),
      unblock: () => { void this.voice?.unblock(); },
      openSettings: () => { this.input.unlock(); this.setPaused(true); this.menu.show('voice'); },
      level: id => this.voice?.speakingLevel(id) ?? null,
      selfNick: () => this.me.nick,
    });
    this.voice = new VoiceController({
      send: message => this.net.send(message),
      canTalk: () => this.canTalk(),
      onChange: view => { this.voiceTransmitting = view.transmitting; setVoicePresence(view.presence); this.voiceUi?.render(view); },
      prefs: loadVoicePrefs(),
      savePrefs: prefs => saveVoicePrefs(prefs),
    });
    setVoiceSource(this.voice);
    this.voice.setGameMuted(this.settings.muted);
    // V — на window в фазе захвата: меню, окна и поля, которые глотают клавиши (stopPropagation), не мешают
    // ни нажатию, ни отпусканию — микрофон не залипнет, даже если окно открылось или закрылось посреди удержания
    for (const [type, down] of [['keydown', true], ['keyup', false]] as const) {
      window.addEventListener(type, e => { if (e.code === 'KeyV' && this.voice?.handleKey(e.code, down, e)) e.preventDefault(); }, true);
    }
  }

  /** Голос по V — везде в игре: меню Esc, настройки, окна, пауза. Нельзя при наборе текста, на загрузке и при обрыве. */
  private canTalk(): boolean {
    return voiceInputAllowed({ inGame: this.screen === 'game', loading: this.transition.busy || this.relink.active, chatOpen: this.chat.isOpen, focused: document.activeElement });
  }

  private syncVoiceVisibility(): void {
    if (!this.voice) return;
    // кнопка микрофона — в игре всегда, поверх меню и окон; прячем только на экране загрузки
    const visible = this.screen === 'game' && !this.transition.busy;
    if (visible !== this.voiceHudVisible) { this.voiceHudVisible = visible; this.voiceUi?.setVisible(visible); }
    if (this.voiceTransmitting && !this.canTalk()) this.voice.stopTalking();
  }

  private toMenu(): void {
    this.stopRetry();
    this.net.close();
    this.screen = 'join';
    this.leaveGame();
    this.input.unlock();
    this.tokens.reset();
    this.chat.clear();
    this.resetPlayButton();
    this.showScreen(this.joinEl);
    this.setJoinMode(savedNick() ? 'saved' : 'nick');
    this.pollHealth();
  }

  /** kicked — выгнали голосованием (shared/votekick.ts): свой заголовок и кнопка */
  private showLost(text: string, kicked = false): void {
    this.stopRetry();
    this.net.close();
    this.screen = 'lost';
    this.leaveGame();
    this.input.unlock();
    this.resetPlayButton();
    this.lostReason.textContent = text;
    this.lostEl.querySelector('.pause-title')!.textContent = kicked ? 'Тебя выгнали' : 'Связь потеряна';
    this.lostEl.querySelector('.retry')!.textContent = kicked ? 'Войти снова' : 'Переподключиться';
    this.showScreen(this.lostEl);
  }

  private showReplaced(): void {
    this.stopRetry();
    this.screen = 'replaced';
    this.leaveGame();
    this.input.unlock();
    this.resetPlayButton();
    this.showScreen(this.replacedEl);
  }

  // ------------------------------------------------------------ переподключение

  private startReconnect(): void {
    this.screen = 'reconnecting';
    this.leaveGame();
    this.retryN = 0;
    this.rcTitle.textContent = this.restarting ? 'Сервер обновляется' : 'Связь пропала';
    this.showScreen(this.reconnectEl);
    this.scheduleRetry();
  }

  private scheduleRetry(): void {
    clearTimeout(this.retryTimer);
    const s = RETRY_S[Math.min(this.retryN, RETRY_S.length - 1)];
    this.retryN++;
    this.retryAt = performance.now() + s * 1000;
    this.retryTimer = window.setTimeout(() => this.retryNow(), s * 1000);
  }

  private retryNow(): void {
    if (this.screen !== 'reconnecting') return;
    this.retryAt = 0;
    this.attemptAt = performance.now();
    // код одноразовый, ник уже не нужен: профиль узнаётся по ключу устройства
    this.hello = { t: 'hello', v: PROTOCOL_VERSION, key: deviceKey(), re: this.lastClose };
    this.net.connect();
  }

  private stopRetry(): void {
    clearTimeout(this.retryTimer);
    this.retryAt = 0;
  }

  private tickReconnect(now: number): void {
    let text: string;
    if (this.retryAt > 0) {
      text = `Переподключаемся через ${Math.max(1, Math.ceil((this.retryAt - now) / 1000))} с…`;
    } else {
      text = 'Переподключаемся…';
      if (now - this.attemptAt > CONNECT_TIMEOUT_MS) {
        this.net.close();
        this.scheduleRetry();
      }
    }
    if (this.rcSub.textContent !== text) this.rcSub.textContent = text;
  }

  private pollHealth(): void {
    fetch('/health', { cache: 'no-store' })
      .then((r) => r.json() as Promise<{ online: number }>)
      .then((j) => {
        const n = j.online;
        this.onlineEl.textContent = n > 0 ? `Сейчас в игре: ${n} ${plural(n, 'человек', 'человека', 'человек')}` : 'Пока никого — будь первым 🌙';
      })
      .catch(() => {
        this.onlineEl.textContent = 'Сервер молчит — запущен ли он?';
      });
  }

  // ------------------------------------------------------------ настройки

  private applySettings(): void {
    const s = this.settings;
    this.input.sens = s.sens;
    this.input.adsSens = s.adsSens;
    this.input.invertY = s.invertY;
    this.sound.setVolume(effectiveVolume(s));
    this.sound.setMix(s.sfxVolume, s.ambVolume, s.uiVolume, s.musicVolume);
    this.voice?.setGameMuted(s.muted);
    this.syncSound();
    applyInterface(s);
    saveSettings(s);
    this.applyQuality();
  }

  /** M: без звука ⇄ звук. Запоминается в настройках, как громкость; ползунок и флажок в меню подстроятся сами. */
  private toggleSound(): void {
    const muted = toggleMute(this.settings);
    this.applySettings();
    this.toasts.show(muted ? 'Звук выключен (M)' : 'Звук включён (M)', 2200, 'mute');
  }

  /** Что действует сейчас по настройкам графики: пресет, «Своё» или «Авто» (client/render/gfx.ts) */
  private gfxNow(): GfxState {
    return resolveGfx(this.settings, { dpr: window.devicePixelRatio || 1, autoRatio: this.autoRatio, autoStart: this.autoStart, touch: TOUCH });
  }

  private renderQuality(): Exclude<Quality, 'auto'> {
    return this.gfxNow().tier;
  }

  /**
   * Применить графику на лету: разрешение (здесь), ограничение кадров (frame), тени и дальность (Renderer), частицы
   * (gfx.fx — их читают при каждом залпе), уровень детализации — сценам, как раньше.
   */
  private applyQuality(): void {
    const g = this.gfxNow();
    const r = g.ratio;
    gfx.fx = EFFECTS_K[g.effects];
    this.fpsCap = g.fpsCap;
    this.renderer.setShadows(g.shadows);
    this.renderer.setViewDistance(VIEW_K[g.viewDistance]);
    const detail = g.tier;
    // сценам — только когда поменялись уровень детализации или число частиц: этот метод зовут при любой настройке (даже
    // ползунок громкости), а сцена на «низких» тенях при каждом таком вызове заново выделяла бы карту теней
    const key = `${detail}|${gfx.fx}`;
    if (key !== this.sceneQualityKey) {
      this.sceneQualityKey = key;
      this.lobby.setQuality(detail);
      for (const race of this.raceScenes.values()) race.setQuality(detail);
      this.skill?.setQuality(detail);
      this.hide?.setQuality(detail);
      this.paintball?.setQuality(detail);
      this.fort?.setQuality(detail);
      this.fight?.setQuality(detail);
    }
    if (r !== this.pixelRatio) {
      this.pixelRatio = r;
      this.resize();
    }
  }

  private resize(): void {
    const w = window.innerWidth;
    const hh = window.innerHeight;
    this.renderer.resize(w, hh, this.pixelRatio);
    this.lobby.resize(w, hh);
    this.paintball?.resize(w, hh);
    for (const race of this.raceScenes.values()) race.resize(w, hh);
    this.skill?.resize(w, hh);
    this.hide?.resize(w, hh);
    this.fort?.resize(w, hh);
    this.fight?.resize(w, hh);
  }

  /** Статистика всех пресетов; «авто» реагирует и на устойчивые просадки p95, а не только средний FPS. */
  private trackPerf(dt: number): void {
    if (document.hidden) { this.frameN = 0; return; }
    if (this.perfWait > 0) {
      this.perfWait -= dt;
      this.frameN = 0;
      return;
    }
    this.frameMs[this.frameN++] = dt * 1000;
    if (this.frameN < this.frameMs.length) return;
    this.frameN = 0;
    this.frameStats = assessFrames(this.frameMs);
    if (this.settings.quality !== 'auto' || this.settings.custom) { this.slowWindows = 0; return; }
    const next = nextAutoQuality(this.frameMs, this.autoRatio, this.slowWindows);
    this.slowWindows = next.slowWindows;
    if (next.ratio === this.autoRatio) return;
    this.autoRatio = next.ratio;
    this.applyQuality();
    // «Авто» снизило разрешение, а меню открыто — пусть покажет новое
    if (this.paused) this.syncSound();
    this.perfWait = 1.5;
  }

  // ------------------------------------------------------------ кадр

  private readonly frame = (): void => {
    requestAnimationFrame(this.frame);
    const now = performance.now();
    // ограничение кадров (меню → Графика): лишний кадр браузера пропускаем целиком, и отрисовку, и расчёты
    if (!this.limiter.allow(now, this.fpsCap)) return;
    const gap = this.last ? now - this.last : 0;
    const dt = this.last ? Math.min(0.25, gap / 1000) : 1 / 60;
    this.last = now;
    this.trackPerf(dt);
    this.syncVoiceVisibility();

    // вкладка спала (кадров не было больше секунды) — сначала дадим письмам дойти, потом считаем тишину
    if (gap > 1000) this.net.lastRx = Math.max(this.net.lastRx, now);
    if (this.screen === 'game' && this.net.isOpen && !this.relink.active) {
      const quiet = now - this.net.lastRx;
      if (quiet > SILENCE_MS) this.net.drop(CLOSE_SILENCE, 'silence');
      else this.linkBanner.show(quiet > SHAKY_MS ? 'Связь нестабильна — ждём сервер…' : null);
    } else if (!this.relink.active) this.linkBanner.show(null);
    this.relink.frame();

    if (this.screen === 'connecting' && now - this.connectAt > CONNECT_TIMEOUT_MS) this.showLost('сервер не отвечает');
    if (this.screen === 'reconnecting') this.tickReconnect(now);
    if (this.screen === 'game' && this.active) {
      this.renderer.beginFrame(this.settings.showStats);
      try { if (!this.transition.frame(now, dt)) this.active.frame(now, dt); }
      finally { this.renderer.endFrame(); }
      this.watchPointer(now);
      const mode = this.active.touchMode;
      this.syncFishingUi(this.active.kind === 'lobby' && mode === 'fish');
      this.touch?.sync(mode, this.paused || this.chat.isOpen ? 'off' : mode === 'none' ? 'bar' : 'all', this.active.touchUseIcon ?? 'E');
      return;
    }
    this.touch?.sync('none', 'off');
    this.syncFishingUi(false);
    // меню, обрыв: фоном — облёт набережной
    this.renderer.beginFrame(this.settings.showStats);
    try { this.lobby.idle(dt); }
    finally { this.renderer.endFrame(); }
    if (this.screen === 'join') {
      this.healthTimer -= dt;
      if (this.healthTimer <= 0) {
        this.healthTimer = 5;
        this.pollHealth();
      }
    }
  };
}

function closeText(code: number, reason: string): string {
  if (code === 1006) return 'нет связи с сервером';
  if (code === 1008) return 'слишком много попыток входа — обнови страницу';
  if (code === 1012) return 'сервер перезапускается — попробуй через минуту';
  if (code === 1013) return 'сейчас мест нет, попробуй чуть позже';
  return reason ? `причина: ${reason}` : `код ${code}`;
}

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

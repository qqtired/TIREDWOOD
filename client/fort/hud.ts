// Интерфейс «Крепости» на ките 2.0 (как на странице lab/ui «Крепость»): всё «стрелковое» считает общий интерфейс
// пейнтбола (paintball/hud.ts) — его окна в крепости спрятаны (ui/ui.css), а числа и события идут в свои части кита:
// панель бойца отдельными блоками, прицел, «Тебя повалили!», мелкие сообщения — тостами. Своё — FortUi (ui/index.ts):
// карточка крепости с мини-картой (верх-лево), плитки под бейджем, плашка волны / босса / голосования и тосты
// (верх-центр), подсказка действия, стрелки угроз, Tab и итоги. Здесь же прилавок справа (stall.ts) и цифры урона
// и золота (floaters.ts). match.ts и arsenalc.ts говорят только с этим классом.
import { FORT_WAVES, FT_END, FT_WAVE, ZK, Z_BOSS, Z_KRAKEN,
  isBossKind, type FortPlayerRow, type FortResultRow, type FortRunRec, type FortWaveCard } from '../../shared/fort.ts';
import { krakenInfo } from './krakenfx.ts';
import { KRAKEN_OPEN_RAGE, KRAKEN_OPEN_TICKS } from '../../shared/fortkraken.ts';
import type { BossPart } from './ui/boss.ts';
import { FORT, GATE, ROADS, TOWER_SPOTS } from '../../shared/fortmap.ts';
import { newBossDanger, newBossHudLine } from './bosses-f.ts';
import { Hud, fmtTime } from '../paintball/hud.ts';
import { FortFloaters } from './floaters.ts';
import { StallPanel } from './stall.ts';
import { FortUi, type AlarmOpts, type FortKit } from './ui/index.ts';
import { el } from './ui/dom.ts';

/** Точка на мини-карте: зомби (тип) или человек */
export interface MapDot {
  x: number;
  z: number;
  kind: number;
}

/** Мини-карта (квадрат 96): поле перед воротами, крепость и берег, север — вверх */
const MAP = { x0: -48, x1: 48, z0: -68, z1: 28 };
/** Пикселей холста на сторону (96 на экране × масштаб × плотность — с запасом) */
const MAP_PX = 240;

export class FortHud {
  readonly root: HTMLElement;
  /** Общее «стрелковое» из пейнтбола */
  readonly pb: Hud;
  /** Телефон: нажали на подсказку у стойки */
  onTapUse: () => void = () => {};
  /** Прилавок (лавка, ворота, кристалл, башни) и цифры урона и золота */
  readonly stall: StallPanel;
  readonly floaters: FortFloaters;
  /** Интерфейс крепости на ките */
  readonly ui: FortUi;
  /** Полоска стволов — в панели бойца (арсенал зовёт set каждый кадр); setVisible — панель бойца целиком (в итогах — нет) */
  readonly arms: { set(gun: number, heavy: number, heavyName: string, heavyIcon: string, other: number, gr: number, grMax: number): void; setVisible(v: boolean): void };
  private readonly world: HTMLElement;
  private readonly mapCtx: CanvasRenderingContext2D;
  private readonly mapBase: HTMLCanvasElement;
  private readonly map: HTMLCanvasElement;

  /** root — слой сцены (.hud в оболочке); kit — слоты и верх-центр кита */
  constructor(root: HTMLElement, kit: FortKit) {
    this.root = root;
    this.pb = new Hud(root);
    root.classList.add('fort-hud');
    this.world = el('div', 'k-world ft-world', root);
    // окна (Tab, итоги) — рядом со слоем кита, над ним; в превью — в самом слое сцены
    const scrims = root.parentElement ?? root;
    this.ui = new FortUi(kit, this.pb, this.world, scrims);
    this.floaters = new FortFloaters(this.world);
    this.stall = new StallPanel(kit.slots.root);
    this.stall.wrap.classList.add('ft-only');
    this.ui.stallOpen = () => this.stall.shown;
    this.ui.prompt.onTap = () => this.onTapUse();
    const vitals = this.ui.vitals;
    this.arms = {
      set: (gun, heavy, heavyName, heavyIcon, other, gr, grMax) => vitals.setArms(gun, heavy, heavyName, heavyIcon, other, gr, grMax),
      setVisible: (v) => vitals.setVisible(v),
    };
    this.adopt();
    // мини-карта: подложка (луг, дороги, стены) рисуется один раз
    this.map = this.ui.card.map;
    this.map.width = MAP_PX;
    this.map.height = MAP_PX;
    this.mapCtx = this.map.getContext('2d')!;
    this.mapBase = this.drawMapBase(MAP_PX, MAP_PX);
    this.mapCtx.drawImage(this.mapBase, 0, 0);
  }

  /** Числа и события стрелкового интерфейса — в части кита (окна пейнтбола в крепости спрятаны) */
  private adopt(): void {
    const pb = this.pb;
    const ui = this.ui;
    const wrap = <K extends keyof Hud>(name: K, after: Hud[K]): void => {
      const orig = (pb[name] as (...a: unknown[]) => unknown).bind(pb);
      const mine = after as (...a: unknown[]) => unknown;
      (pb as unknown as Record<string, unknown>)[name] = (...a: unknown[]) => {
        orig(...a);
        mine(...a);
      };
    };
    wrap('setVitals', (hp: number, max: number) => ui.vitals.setHp(hp, max));
    wrap('setAmmo', (ammo: number, max: number, reload: number | null) => ui.vitals.setAmmo(ammo, max, reload));
    wrap('setDash', (ready: number) => ui.vitals.setDash(ready));
    wrap('setCrosshair', (gap: number, visible: boolean) => ui.cross.set(gap, visible));
    wrap('hitmarker', (head: boolean, kill: boolean) => ui.cross.hit(head, kill));
    wrap('setRespawn', (sec: number) => ui.down.setRespawn(sec));
    wrap('hideDeath', () => ui.down.hide());
    pb.setStats = (text: string | null) => ui.card.setStats(text);
  }

  /** Курсор свободен (закрыли прилавок Esc): подсказка «кликни — обратно» */
  setResume(show: boolean): void {
    this.ui.prompt.setResume(show);
  }

  /** Карточка волны: в бою — идущая, в передышке и сборе — следующая */
  setCard(card: FortWaveCard | null, phase: number): void {
    this.ui.wave.setCard(phase === FT_END ? null : card);
  }

  /** Колокол на террасе: щит строений (rally — сколько ещё, cooldown — откат), в карточке крепости */
  setDefense(phase: number, _defenders: number, rally: number, cooldown: number): void {
    this.ui.card.setBell(phase === FT_WAVE, rally, cooldown);
  }

  /**
   * Полоса босса (плашка верх-центра): доля HP, фаза, состояние, отсчёт; kind/tier/rage — от агента fort. У Кракена — своя
   * подсказка (krakenInfo) и части: щупальца и голова. max — полное HP (ui/schedule.ts bossMaxHp), 0 — только проценты.
   */
  setBoss(hp: number, stage: number, state: number, wind: number, kind = Z_BOSS, tier = 0, rage?: boolean, parts?: readonly BossPart[], max = 0): void {
    const kraken = kind === Z_KRAKEN;
    this.ui.boss.set(hp > 0 ? { frac: hp, stage, state, wind, kind, tier, rage, parts, max,
      status: kraken ? krakenInfo(state, wind) : newBossHudLine(state) ?? undefined, danger: newBossDanger(state), openTicks: kraken ? (rage ? KRAKEN_OPEN_RAGE : KRAKEN_OPEN_TICKS) : undefined } : null);
  }

  /** Прилавок открыт (немодальный: бегать и стрелять можно) */
  get shopShown(): boolean { return this.stall.shown; }

  setGate(hp: number, max: number): void {
    this.ui.card.gate.set(hp, max);
  }

  setCrystal(hp: number, max: number): void {
    this.ui.card.crystal.set(hp, max);
  }

  /** Ворота или кристалл только что получили урон — строка в карточке вздрагивает */
  hurt(which: 'gate' | 'crys'): void {
    this.ui.hurt(which);
  }

  /** Тревога тостом под плашкой волны: «ворота трещат» со стрелкой к воротам, атаки с меткой */
  alert(text: string, ms = 2600, opts: AlarmOpts = {}): void {
    this.ui.alarm(text, ms, opts);
  }

  // ------------------------------------------------------------ стойки

  /** Подсказка у стойки: null — спрятать; price 0 — без цены; can — нажатие что-то сделает */
  setHint(text: string | null, price: number, can: boolean, afford: boolean): void {
    this.ui.prompt.setStation(text, price, can, afford);
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
    ctx.fillStyle = '#5f8f45';
    ctx.fillRect(0, 0, w, h);
    // море на юге
    ctx.fillStyle = '#2f86ad';
    ctx.fillRect(0, Z(22), w, h - Z(22));
    // дороги
    ctx.strokeStyle = '#d8bb86';
    ctx.lineWidth = 4 * k;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const r of ROADS) {
      ctx.beginPath();
      r.pts.forEach(([x, z], i) => (i ? ctx.lineTo(X(x), Z(z)) : ctx.moveTo(X(x), Z(z))));
      ctx.stroke();
    }
    // стены и двор
    ctx.fillStyle = '#d9ccb2';
    ctx.fillRect(X(FORT.x0), Z(FORT.z0), (FORT.x1 - FORT.x0) * k, (FORT.z1 - FORT.z0) * k);
    ctx.fillStyle = '#9a8c74';
    ctx.fillRect(X(FORT.x0 + 3), Z(FORT.z0 + 3), (FORT.x1 - FORT.x0 - 6) * k, (FORT.z1 - FORT.z0 - 6) * k);
    // воротные башни и бастионы
    ctx.fillStyle = '#d9ccb2';
    ctx.fillRect(X(-6), Z(-18.5), 12 * k, 3 * k);
    ctx.fillRect(X(-21), Z(-19), 6 * k, 6 * k);
    ctx.fillRect(X(15), Z(-19), 6 * k, 6 * k);
    // места башен
    ctx.strokeStyle = 'rgba(255,236,190,0.9)';
    ctx.lineWidth = 2;
    for (const s of TOWER_SPOTS) {
      ctx.beginPath();
      ctx.arc(X(s.x), Z(s.z), 4, 0, Math.PI * 2);
      ctx.stroke();
    }
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
    ctx.fillStyle = gateUp ? '#784c28' : '#ff463c';
    ctx.fillRect(X(GATE.x0) - 1, Z(GATE.face) - 3, (GATE.x1 - GATE.x0) * k + 2, gateUp ? 5 : 7);
    // кристалл
    ctx.fillStyle = '#6fe6ff';
    ctx.strokeStyle = 'rgba(10,40,60,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(X(0), Z(2.6), 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    for (let i = 0; i < nz; i++) {
      const z = zombies[i];
      const kk = ZK[z.kind] ?? ZK[0];
      ctx.fillStyle = `#${kk.color.toString(16).padStart(6, '0')}`;
      ctx.beginPath();
      ctx.arc(X(z.x), Z(z.z), isBossKind(z.kind) ? 9 : kk.r >= 0.7 ? 6 : 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(20,10,10,0.75)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(20,10,10,0.75)';
    for (let i = 0; i < nm; i++) {
      ctx.beginPath();
      ctx.arc(X(mates[i].x), Z(mates[i].z), 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    if (alive) {
      // я — стрелка по взгляду (yaw 0 — на север, вверх)
      ctx.save();
      ctx.translate(X(meX), Z(meZ));
      ctx.rotate(-meYaw);
      ctx.fillStyle = '#ffd35a';
      ctx.strokeStyle = 'rgba(30,20,10,0.9)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, -11);
      ctx.lineTo(7.5, 7.5);
      ctx.lineTo(0, 3.5);
      ctx.lineTo(-7.5, 7.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  // ------------------------------------------------------------ окна

  /** Tab: защитники (и кто где ещё) — пока держишь */
  showBoard(show: boolean, rows: FortPlayerRow[], myId: number, phase: number): void {
    this.ui.showBoard(show, rows, myId, phase);
  }

  /**
   * Итоги: устояла или пала, лучший, таблица с золотом и жетонами, «вся команда»; рекорды крепости — top
   * (лучшие забеги), record — команда побила рекорд, prev — прежний рекорд (0 — не было).
   */
  showEnd(win: boolean, wave: number, mvp: FortResultRow | null, rows: FortResultRow[], myId: number,
    top: readonly FortRunRec[] = [], record = false, prev = 0, surr = false, run = 0): void {
    this.stall.close();
    this.ui.results.show({ win, wave, lastWave: FORT_WAVES, mvp, rows, myId,
      record: record || prev > 0 ? { best: prev, isNew: record } : null, top, run, surr });
  }

  /** Жетоны за игру — строкой в итогах (приходят сразу после них) */
  showReward(text: string): void {
    this.ui.results.reward(text);
  }

  setEndTimer(sec: number): void {
    this.ui.results.timer(sec);
  }

  hideEnd(): void {
    this.ui.results.hide();
  }

  /** Окно итогов на экране (закрыли «Ещё раз» — уже нет) */
  get endShown(): boolean {
    return this.ui.results.shown;
  }

  // ------------------------------------------------------------ повален

  /** «Тебя повалили!»: почему (текст) и кто (вид врага, −1 — не знаем) */
  showDeath(text: string, kind = -1): void {
    this.pb.showDeath(null, 0, 'fort');
    this.ui.down.show(text, kind);
  }

  setVisible(v: boolean): void {
    this.pb.setVisible(v);
    if (!v) {
      this.stall.close();
      this.floaters.clear();
      this.setBoss(0, 0, 0, 0);
      this.hideEnd();
      this.ui.reset();
      this.showBoard(false, [], 0, 0);
    }
  }
}

export { fmtTime };

// Интерфейс «Крепости» на ките 2.0 (как на странице lab/ui «Крепость»). Части — в слотах HUD кита:
// верх-лево — карточка крепости (мини-карта, ворота, кристалл, колокол), верх-право — плитки под бейджем (золото,
// рекорд, команда), верх-центр — одна плашка (волна / босс / голосование «сдаться») и тосты (тревоги, новости),
// низ-центр — подсказка действия над панелью бойца (здоровье, стволы, граната, патроны, рывок), центр — «Тебя
// повалили!» и крупные баннеры. Стрелки угроз у края экрана, прицел и цифры урона — в слое без zoom (.k-world).
// Tab и итоги — окна кита (.k-scrim). FortHud создаёт FortUi и отдаёт сюда крючки; match.ts раз в кадр передаёт снимок
// того, что видно (frame). Без своего места верх-центра: всё сверху идёт через TopCenter кита.
import type * as THREE from 'three';
import { FT_BREAK, FT_END, FT_GATHER, FT_WAVE, ZS_BOAT_LAND, ZS_CLIMB, ZS_FLY_WARN, ZS_TOP, Z_BOAT, type FortWaveCard } from '../../../shared/fort.ts';
import { kindFlags, waveBonus } from '../../../shared/fortarsenal.ts';
import { GATE } from '../../../shared/fortmap.ts';
import type { ZombieSnap } from '../../../shared/fortnet.ts';
import type { FortRecIntro } from '../../../shared/fortrecord.ts';
import type { Hud } from '../../paintball/hud.ts';
import type { HudSlots } from '../../ui/kit/slots.ts';
import type { TopCenter } from '../../ui/kit/topcenter.ts';
import type { OnlineList } from '../../ui/online.ts';
import { Alarms, type AlarmTarget } from './alarms.ts';
import { FortBanners, type BannerSpec } from './banners.ts';
import { Board, type PotInfo } from './board.ts';
import { BossBar } from './boss.ts';
import { FortCard } from './card.ts';
import { Coach, EdgeArrows, ladderHint, type CoachSpot, type Threat } from './coach.ts';
import { DownBlock } from './down.ts';
import { hudK } from './dom.ts';
import { fortIcon } from './icons.ts';
import { hotBanner } from './record.ts';
import { Results } from './results.ts';
import { bossInfo, isBossKind, lastWave } from './schedule.ts';
import { FortTiles, type TeamRow } from './tiles.ts';
import { FortCross, FortPrompt, FortVitals } from './vitals.ts';
import { WavePlate } from './wave.ts';
import { foeIcon } from './text.ts';
import './ui.css';

export type { AlarmTarget } from './alarms.ts';
export type { BossView } from './boss.ts';
export type { ResultsData } from './results.ts';
export type { TeamRow } from './tiles.ts';

/** Что видно сверху: волна, отсчёт, враги, золото, ворота и кристалл */
export interface TopView {
  phase: number;
  wave: number;
  /** До конца фазы, с */
  leftS: number;
  /** Врагов осталось (с ещё не вышедшими) */
  enemies: number;
  gold: number;
  gate: number;
  gateMax: number;
  gateTier: number;
  crystal: number;
  crystalMax: number;
  crystalTier: number;
}

export interface UiFrame extends TopView {
  /** Сколько волн отбито в этой игре (рекорд крепости — плитка рекорда) */
  cleared?: number;
  me: { x: number; y: number; z: number; yaw: number; alive: boolean };
  team: readonly TeamRow[];
  zombies: readonly ZombieSnap[];
  /** Угрозы не из списка зомби (ящик припасов и т. п.) */
  extra?: readonly Threat[];
  camera: THREE.Camera;
  width: number;
  height: number;
}

export interface AlarmOpts {
  target?: AlarmTarget;
  /** С полоской отсчёта (атака с меткой) — в тосте кита полоски нет, тост живёт столько же */
  timed?: boolean;
}

/** Кит игры: слоты HUD, верх-центр, список «кто где» (для Tab) */
export interface FortKit {
  slots: HudSlots;
  top: TopCenter;
  online?: OnlineList | null;
}

/** Куда бежать по тревоге «ворота» / «кристалл» */
const GATE_AT = { x: (GATE.x0 + GATE.x1) / 2, y: 1.6, z: GATE.face };
const CRYSTAL_AT = { x: 0, y: 1.6, z: 2.6 };

export class FortUi {
  readonly top: TopCenter;
  readonly card: FortCard;
  readonly tiles: FortTiles;
  readonly wave: WavePlate;
  readonly boss: BossBar;
  readonly alarms: Alarms;
  readonly banners: FortBanners;
  readonly coach: Coach;
  readonly edges: EdgeArrows;
  readonly down: DownBlock;
  readonly board: Board;
  readonly results: Results;
  readonly vitals: FortVitals;
  readonly prompt: FortPrompt;
  readonly cross: FortCross;
  /** Картинка белого флага (голосование «сдаться») */
  readonly flagIcon = fortIcon('white-flag');
  /** Рекорд крепости — плитка под бейджем (ui/tiles.ts) */
  readonly record: { set(r: FortRecIntro): void; grow(wave: number): void };
  /** Открыт ли прилавок (плитки под бейджем на это время прячутся — окно встаёт туда же) */
  stallOpen: () => boolean = () => false;
  private readonly online: OnlineList | null;
  private readonly threats: Threat[] = [];
  private gateWas = -1;
  /** Лодки, что уже у берега (тревога — один раз на лодку) */
  private readonly landed = new Set<number>();
  private waveNow = 0;
  private isDown = false;
  private tilesOff = false;
  /** Общак последней отбитой волны (Tab) */
  private pot: PotInfo | null = null;

  /** world — слой без zoom (стрелки, прицел, цифры), scrims — куда класть окна (над HUD кита) */
  constructor(kit: FortKit, pb: Hud, world: HTMLElement, scrims: HTMLElement) {
    const { slots, top } = kit;
    this.top = top;
    this.online = kit.online ?? null;
    this.card = new FortCard(slots.tl);
    this.tiles = new FortTiles(slots.tr);
    this.wave = new WavePlate(top);
    this.boss = new BossBar(top);
    this.alarms = new Alarms(top);
    this.banners = new FortBanners(top);
    this.banners.adopt(pb);
    this.coach = new Coach(top);
    this.edges = new EdgeArrows(world);
    this.cross = new FortCross(world);
    this.down = new DownBlock(slots.root);
    this.prompt = new FortPrompt(slots.bc);
    this.vitals = new FortVitals(slots.bc);
    this.board = new Board(scrims);
    this.results = new Results(scrims);
    this.record = { set: (r) => this.tiles.setRecord(r), grow: (w) => this.tiles.growMine(w) };
    // всё своё в общих слотах — только в крепости (html[data-room='fort'], ui.css)
    for (const e of [this.card.root, this.card.stats, this.tiles.root, this.down.root, this.prompt.root, this.vitals.root]) e.classList.add('ft-only');
    const spots: Record<CoachSpot, HTMLElement> = { fort: this.card.root, gren: this.vitals.gren.root, gold: this.tiles.gold.root };
    this.coach.onSpot = (spot) => {
      for (const [k, e] of Object.entries(spots)) e.classList.toggle('ft-spot', k === spot);
    };
  }

  // ------------------------------------------------------------ раз в кадр

  frame(v: UiFrame): void {
    this.waveNow = v.wave;
    const calm = v.phase === FT_GATHER || v.phase === FT_BREAK;
    const alive = v.me.alive;
    if (this.isDown !== !alive) {
      this.isDown = !alive;
      // повален: мелкие подтверждения молчат, панель бойца тускнеет
      this.banners.quiet = this.isDown;
      this.vitals.setDown(this.isDown);
      if (alive) this.down.hide();
    }
    this.card.gate.set(v.gate, v.gateMax);
    this.card.crystal.set(v.crystal, v.crystalMax);
    this.card.gate.setTier(v.gateTier);
    this.card.crystal.setTier(v.crystalTier);
    this.tiles.setGold(v.gold);
    this.tiles.setTeam(v.team, calm);
    this.tiles.updateRecord(v.cleared ?? 0, v.wave, v.phase);
    const off = this.stallOpen() || this.results.shown;
    if (off !== this.tilesOff) {
      this.tilesOff = off;
      this.tiles.root.classList.toggle('is-off', off);
    }
    this.wave.update(v.phase, v.wave, v.leftS, v.enemies, !this.results.shown);
    this.boss.setWave(v.wave, v.enemies);
    // ворота пали в бою — тревога со стрелкой к кристаллу
    if (this.gateWas > 0 && v.gate <= 0 && v.phase === FT_WAVE) this.alarm('🚪 Ворота пали — все к кристаллу!', 5000, { target: 'crystal' });
    this.gateWas = v.gate;
    this.coach.update(v.phase, alive);
    this.prompt.setLadder(alive && v.phase !== FT_END ? ladderHint(v.me.x, v.me.y, v.me.z) : null);
    // десант — сюрприз: ни слова заранее, короткая тревога — когда лодка уже у берега
    if (v.phase !== FT_WAVE) this.landed.clear();
    else {
      for (const z of v.zombies) {
        if (z.kind !== Z_BOAT || z.state !== ZS_BOAT_LAND || !(z.hp > 0) || this.landed.has(z.id)) continue;
        if (this.landed.size === 0) this.alarm('⛵ Десант у берега!', 2200);
        this.landed.add(z.id);
      }
    }
    this.threats.length = 0;
    if (v.phase === FT_WAVE && alive) {
      for (const z of v.zombies) {
        if (!(z.hp > 0)) continue;
        const sea = kindFlags(z.kind).sea;
        const boss = isBossKind(z.kind);
        if (sea && !boss && z.state !== ZS_BOAT_LAND) continue;
        const kind = boss ? 'boss' : sea ? 'boat'
          : z.state === ZS_CLIMB || z.state === ZS_TOP ? 'climb' : z.state === ZS_FLY_WARN ? 'fly' : null;
        if (!kind) continue;
        this.threats.push(boss ? { x: z.x, y: z.y + 1, z: z.z, kind, icon: foeIcon(z.kind), name: bossInfo(z.kind).name } : { x: z.x, y: z.y + 1, z: z.z, kind });
      }
      if (v.extra) this.threats.push(...v.extra);
      const t = this.alarms.currentTarget();
      if (t === 'gate') this.threats.push({ ...GATE_AT, kind: 'gate' });
      else if (t === 'crystal') this.threats.push({ ...CRYSTAL_AT, kind: 'crystal' });
    }
    this.edges.update(this.threats, v.camera, v.width, v.height, hudK());
  }

  // ------------------------------------------------------------ фазы и события

  /**
   * Новая фаза: card — карточка волны от сервера (в бою — идущая, в паузе — следующая); join — только что вошёл
   * (без «волна отбита» и без крупного баннера — сразу видно, что идёт).
   */
  onPhase(phase: number, wave: number, card: FortWaveCard | null = null, join = false): void {
    this.wave.setCard(phase === FT_END ? null : card);
    if (phase === FT_WAVE) this.waveStart(wave, card?.w === wave ? card : null);
    else if (phase === FT_BREAK || phase === FT_GATHER) {
      const list: BannerSpec[] = [];
      if (phase === FT_GATHER && !join) {
        this.results.hide();
        this.pot = null;
        this.wave.newGame();
        this.card.reset();
      }
      if (phase === FT_BREAK && !join) list.push(this.clearedSpec(wave, 0, waveBonus(wave), false));
      this.wave.announce((t) => list.push(t), this.coach.busy(phase));
      if (list.length < 3) list.push(this.wave.bellToast(phase));
      for (const s of list) this.push(s);
    } else if (phase === FT_END) {
      this.wave.hide();
      this.boss.set(null);
      this.alarms.clear();
      this.edges.clear();
    }
  }

  /** Старт волны: знакомство с новыми врагами, боссом и событием — тостами (кто босс — и на его плашке); рекордная — тостом */
  waveStart(wave: number, card: FortWaveCard | null = null): void {
    this.wave.setCard(card);
    this.wave.announce((t) => this.push(t), this.coach.busy(FT_WAVE));
    // волна, отбив которую команда побьёт рекорд крепости, — тостом
    if (this.tiles.recordWave(wave)) this.push(hotBanner(wave));
  }

  private clearedSpec(wave: number, share: number, bonus: number, clean: boolean): BannerSpec {
    return {
      key: 'cleared', icon: 'gold', tone: 'reward', ms: 4200,
      title: clean ? 'Чистая волна! Общак ×1,5' : `Волна ${wave} отбита!`,
      sub: share > 0 ? `общак +${share} · бонус волны +${bonus}` : `бонус волны +${bonus} и доля общака`,
    };
  }

  /** Волна отбита; с общаком (событие pot) — тот же тост обновляется */
  cleared(wave: number, share: number, bonus: number, clean: boolean): void {
    if (share > 0) this.pot = { wave, share };
    this.push(this.clearedSpec(wave, share, bonus, clean));
  }

  push(spec: BannerSpec): void {
    this.banners.push(spec);
  }

  alarm(text: string, ms = 2600, opts: AlarmOpts = {}): void {
    this.alarms.show(text, ms, opts.target ?? null);
  }

  /** Ворота или кристалл получили урон — строка в карточке вздрагивает */
  hurt(which: 'gate' | 'crys'): void {
    (which === 'gate' ? this.card.gate : this.card.crystal).hurt();
  }

  /** Tab: защитники и кто где ещё */
  showBoard(on: boolean, rows: Parameters<Board['show']>[1], myId: number, phase: number): void {
    this.board.show(on, rows, myId, phase, this.waveNow, on ? this.online?.entries ?? [] : [], this.pot);
  }

  get currentWave(): number {
    return this.waveNow;
  }

  get lastWave(): number {
    return lastWave();
  }

  /** Ушли из крепости или новая сцена: всё прочь */
  reset(): void {
    this.wave.reset();
    this.boss.set(null);
    this.banners.dropAll();
    this.alarms.clear();
    this.edges.clear();
    this.results.hide();
    this.board.hide();
    this.down.hide();
    this.tiles.reset();
    this.card.reset();
    this.coach.hide();
    this.prompt.setStation(null, 0, false, true);
    this.prompt.setLadder(null);
    this.prompt.setResume(false);
    this.prompt.setRepair(0,0);
    this.gateWas = -1;
    this.pot = null;
    this.isDown = false;
    this.banners.quiet = false;
    this.vitals.setDown(false);
  }
}

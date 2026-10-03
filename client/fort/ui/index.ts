// Интерфейс «Крепости» (агент arsenal): верхняя полоса, состав команды, тревоги со стрелкой, полоса босса, очередь
// баннеров, подсказки новичку и у лестниц, стрелки на угрозы у края экрана, итоги. FortHud создаёт его и отдаёт
// сюда свои тревоги, босса и итоги; match.ts раз в кадр передаёт снимок того, что видно (frame). Старые элементы
// полосы прячет ui.css (класс .fui на корне), «карточка волны» и строка щита (.ft-briefing) встают под полосу.
import type * as THREE from 'three';
import { FT_BREAK, FT_END, FT_GATHER, FT_WAVE, ZS_CLIMB, ZS_FLY_WARN, ZS_TOP, type FortEvent, type FortWaveCard } from '../../../shared/fort.ts';
import { kindFlags, waveBonus } from '../../../shared/fortarsenal.ts';
import type { ZombieSnap } from '../../../shared/fortnet.ts';
import type { Hud } from '../../paintball/hud.ts';
import { EVENT_INFO } from '../wavecard.ts';
import { Alarms, type AlarmTarget } from './alarms.ts';
import { Banners, type BannerSpec } from './banners.ts';
import { BossBar } from './boss.ts';
import { Coach, EdgeArrows, LadderTip, ladderHint, type Threat } from './coach.ts';
import { el } from './dom.ts';
import { Results } from './results.ts';
import { bossInfo, bossOfWave, isBossKind, lastWave } from './schedule.ts';
import { TeamList, TopBar, type TeamRow, type TopView } from './top.ts';
import './ui.css';

export type { AlarmTarget } from './alarms.ts';
export type { BossView } from './boss.ts';
export type { ResultsData } from './results.ts';
export type { TeamRow } from './top.ts';

export interface UiFrame extends TopView {
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
  /** С полоской отсчёта (атака с меткой) */
  timed?: boolean;
}

export class FortUi {
  readonly layer: HTMLElement;
  readonly top: TopBar;
  readonly team: TeamList;
  readonly boss: BossBar;
  readonly alarms: Alarms;
  readonly banners: Banners;
  readonly coach: Coach;
  readonly ladder: LadderTip;
  readonly edges: EdgeArrows;
  readonly results: Results;
  private readonly threats: Threat[] = [];
  private gateWas = -1;
  private wave = 0;

  constructor(root: HTMLElement, pb: Hud) {
    root.classList.add('fui');
    this.layer = el('div', 'fu', root);
    this.edges = new EdgeArrows(this.layer);
    const stack = el('div', 'fu-stack', this.layer);
    this.top = new TopBar(stack);
    this.boss = new BossBar(stack);
    this.alarms = new Alarms(stack);
    // карточка волны и строка щита (FortHud) — в общий столбец под полосой: ничего не налезает
    const briefing = root.querySelector<HTMLElement>('.ft-briefing');
    if (briefing) stack.appendChild(briefing);
    this.team = new TeamList(this.layer);
    this.coach = new Coach(this.layer);
    this.ladder = new LadderTip(this.layer);
    this.banners = new Banners(this.layer);
    this.results = new Results(this.layer);
    this.banners.adopt(pb);
  }

  // ------------------------------------------------------------ раз в кадр

  frame(v: UiFrame): void {
    this.wave = v.wave;
    this.top.update(v);
    this.team.update(v.team, v.phase === FT_GATHER || v.phase === FT_BREAK);
    // ворота пали в бою — тревога со стрелкой к кристаллу
    if (this.gateWas > 0 && v.gate <= 0 && v.phase === FT_WAVE) this.alarm('🚪 Ворота пали — все к кристаллу!', 5000, { target: 'crystal' });
    this.gateWas = v.gate;
    const me = v.me.alive ? v.me : null;
    this.alarms.update(me);
    this.coach.update(v.phase, v.me.alive);
    this.ladder.update(v.me.alive && v.phase !== FT_END ? ladderHint(v.me.x, v.me.y, v.me.z) : null);
    this.threats.length = 0;
    if (v.phase === FT_WAVE && v.me.alive) {
      for (const z of v.zombies) {
        if (!(z.hp > 0)) continue;
        const kind = isBossKind(z.kind) ? 'boss' : kindFlags(z.kind).sea ? 'boat'
          : z.state === ZS_CLIMB || z.state === ZS_TOP ? 'climb' : z.state === ZS_FLY_WARN ? 'fly' : null;
        if (kind) this.threats.push({ x: z.x, y: z.y + 1, z: z.z, kind });
      }
      if (v.extra) this.threats.push(...v.extra);
    }
    this.edges.update(this.threats, v.camera, v.width, v.height);
    this.banners.tick();
  }

  // ------------------------------------------------------------ фазы и события

  onPhase(phase: number, wave: number, card: FortWaveCard | null = null): void {
    if (phase === FT_WAVE) this.waveStart(wave, card?.w === wave ? card : null);
    else if (phase === FT_BREAK) this.cleared(wave, 0, waveBonus(wave), false);
    else if (phase === FT_GATHER) {
      this.top.reset();
      this.results.hide();
    }
  }

  /** Старт волны: номер, название из карточки волны (сервер), событие; волна с боссом — фиолетовая */
  waveStart(wave: number, card: FortWaveCard | null = null): void {
    const boss = card && card.boss >= 0 ? bossInfo(card.boss) : bossOfWave(wave);
    const ev = card ? EVENT_INFO[card.event] : undefined;
    const title = boss ? `${boss.icon} ${boss.name}` : card?.title || `Волна ${wave}`;
    const sub = ev ? `${ev.icon} ${ev.name}: ${ev.hint}` : card && card.boats > 0 ? `⚓ Десант с моря: лодок ${card.boats}` : '';
    this.push({ key: 'wave', badge: String(wave), tone: boss ? (boss.super ? 'super' : 'boss') : 'wave', prio: 1, ms: 3400, title, sub });
  }

  /** Волна отбита; с общаком (событие pot) — та же плашка обновляется */
  cleared(wave: number, share: number, bonus: number, clean: boolean): void {
    this.push({
      key: 'cleared', badge: '✓', tone: 'gold', prio: 1, ms: 3200,
      title: clean ? 'Чистая волна! Общак ×1,5' : `Волна ${wave} отбита!`,
      sub: share > 0 ? `Общак +${share} 💰 · бонус волны +${bonus}` : `Бонус волны +${bonus} 💰 и доля общака · передышка`,
    });
  }

  onEvent(e: FortEvent): void {
    if (e[0] === 'zdie') {
      const kind = e[6];
      if (isBossKind(kind)) {
        const b = bossInfo(kind);
        this.push({ key: `boss-down-${e[1]}`, badge: b.icon, tone: b.super ? 'super' : 'boss', prio: 1, ms: 3200, title: `${b.name} повержен!`, sub: 'Добейте оставшуюся орду' });
      }
    }
  }

  push(spec: BannerSpec): void {
    this.banners.push(spec);
  }

  toast(html: string, ms?: number): void {
    this.banners.toast(html, ms);
  }

  alarm(text: string, ms = 2600, opts: AlarmOpts = {}): void {
    this.alarms.show(text, ms, opts.target ?? null, opts.timed ?? false);
  }

  /** Ворота или кристалл получили урон — плашка вздрагивает */
  hurt(which: 'gate' | 'crys'): void {
    (which === 'gate' ? this.top.gate : this.top.crystal).hurt();
  }

  get currentWave(): number {
    return this.wave;
  }

  get lastWave(): number {
    return lastWave();
  }

  reset(): void {
    this.banners.clear();
    this.alarms.clear();
    this.edges.clear();
    this.boss.set(null);
    this.results.hide();
    this.top.reset();
    this.ladder.update(null);
    this.gateWas = -1;
  }
}

// Интерфейс «Крепости» (агент arsenal): верхняя полоса, состав команды, тревоги со стрелкой, полоса босса, очередь
// баннеров, подсказки новичку и у лестниц, стрелки на угрозы у края экрана, итоги. FortHud создаёт его и отдаёт
// сюда свои тревоги, босса и итоги; match.ts раз в кадр передаёт снимок того, что видно (frame). Старые элементы
// полосы прячет ui.css (класс .fui на корне), «карточка волны» и строка щита (.ft-briefing) встают под полосу.
// Столбец сверху растёт (босс, тревога, карточка волны) — его нижний край идёт в --fu-below, высота баннера —
// в --fu-banner-real, и баннер с «Тебя повалили!» встают ниже, а не под них.
import type * as THREE from 'three';
import {
  FT_BREAK, FT_END, FT_GATHER, FT_WAVE, ZS_BOAT_LAND, ZS_CLIMB, ZS_FLY_WARN, ZS_TOP, Z_BOAT, type FortEvent, type FortWaveCard,
} from '../../../shared/fort.ts';
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
  /** Лодки, что уже у берега (тревога — один раз на лодку) */
  private readonly landed = new Set<number>();
  private wave = 0;
  private down = false;

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
    // «Тебя повалили!» (общий .death из Hud) — в слой: под местом баннера, ниже столбца; баннеры и итоги поверх
    const death = root.querySelector<HTMLElement>('.death');
    if (death) this.layer.appendChild(death);
    this.team = new TeamList(this.layer);
    this.coach = new Coach(this.layer);
    this.ladder = new LadderTip(this.layer);
    this.banners = new Banners(this.layer);
    this.results = new Results(this.layer);
    this.banners.adopt(pb);
    this.watchLayout(stack, this.layer.querySelector<HTMLElement>('.fu-banner'));
  }

  /** Нижний край столбца сверху → --fu-below, высота баннера → --fu-banner-real (ui.css берёт не меньше запаса):
   *  сколько бы плашек ни было в столбце и строк в баннере, баннер и «повален» встают ниже, а не под них */
  private watchLayout(stack: HTMLElement, banner: HTMLElement | null): void {
    const last: Record<string, number> = {};
    const set = (name: string, px: number): void => {
      if (last[name] === px) return;
      last[name] = px;
      this.layer.style.setProperty(name, `${px}px`);
    };
    const sync = (): void => {
      set('--fu-below', Math.max(0, Math.ceil(stack.getBoundingClientRect().bottom - this.layer.getBoundingClientRect().top)));
      if (banner) set('--fu-banner-real', banner.offsetHeight + 10);
    };
    if (typeof ResizeObserver === 'function') {
      const ro = new ResizeObserver(sync);
      ro.observe(stack);
      if (banner) ro.observe(banner);
    }
    window.addEventListener('resize', sync);
  }

  // ------------------------------------------------------------ раз в кадр

  frame(v: UiFrame): void {
    this.wave = v.wave;
    // повален: мелкие подтверждения молчат, на низком телефоне прячется и подсказка — не лезут на «повален»
    if (this.down !== !v.me.alive) {
      this.down = !v.me.alive;
      this.layer.classList.toggle('down', this.down);
    }
    this.top.update(v);
    this.team.update(v.team, v.phase === FT_GATHER || v.phase === FT_BREAK);
    // ворота пали в бою — тревога со стрелкой к кристаллу
    if (this.gateWas > 0 && v.gate <= 0 && v.phase === FT_WAVE) this.alarm('🚪 Ворота пали — все к кристаллу!', 5000, { target: 'crystal' });
    this.gateWas = v.gate;
    const me = v.me.alive ? v.me : null;
    this.alarms.update(me);
    this.coach.update(v.phase, v.me.alive);
    this.ladder.update(v.me.alive && v.phase !== FT_END ? ladderHint(v.me.x, v.me.y, v.me.z) : null);
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
    if (v.phase === FT_WAVE && v.me.alive) {
      for (const z of v.zombies) {
        if (!(z.hp > 0)) continue;
        const sea = kindFlags(z.kind).sea;
        if (sea && !isBossKind(z.kind) && z.state !== ZS_BOAT_LAND) continue;
        const kind = isBossKind(z.kind) ? 'boss' : sea ? 'boat'
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
    const sub = ev ? `${ev.icon} ${ev.name}: ${ev.hint}` : '';
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
    this.down = false;
    this.layer.classList.remove('down');
  }
}

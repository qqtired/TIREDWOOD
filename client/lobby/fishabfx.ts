// Способности мификов и божественной на шкале вываживания (10.10; дизайн — docs/superpowers/plans/2026-10-10-fishing-abilities.md,
// образец отрисовки и звуков — страница lab/fishing-abilities/). Модель общая (shared/fishreel.ts): клиент только рисует и
// звучит — по смене фазы и полям abilityView. Рисуется по блоку способности (breach, ink, wind, herring, teeth, surge, whip,
// fog), а не по виду: рыбы острова (белуга, лисья, гигантская, плащеносная) получат свою отрисовку, как только их виды
// появятся в игре. Плюс бонусы уровня, видные только на экране (shared/fishability.ts levelBonus): «Чутьё» — рыба
// вздрагивает перед рывком (с 12-го уровня — и стрелка, куда), «Метка мифика» — точка способности на полосе улова,
// «Мастер» — золотая рамка шкалы. Стили — fishabfx.css.
import { REEL_BAR, REEL_P_MAX, abilityView, reelStep, type AbilityId, type AbilityView, type Reel } from '../../shared/fishreel.ts';
import type { LevelBonus } from '../../shared/fishability.ts';
import type { FishAbSound, Sound } from '../audio.ts';
import { el } from './fish2.ts';
import './fishabfx.css';

/** Плашки фаз: предупреждение, действие, конец ('' — без плашки: у действия до конца боя конца нет) */
const BANNERS: Readonly<Record<AbilityId, readonly [string, string, string]>> = {
  breach: ['Рыба-молот идёт на таран!', 'Пролом! Шкала +50 %', 'Шкала срослась'],
  ink: ['Кальмар набирает чернила…', 'Чернила!', 'Чернила стекли'],
  wind: ['Поднимается ветер…', 'Ветер!', 'Ветер стих'],
  herring: ['Король зовёт селёдок!', 'Поймай селёдок!', 'Король рванул!'],
  teeth: ['Акула скалит зубы!', 'Не задень острые зубы!', ''],
  surge: ['Белуга всплывает за воздухом…', 'Второе дыхание!', ''],
  whip: ['Хвост замахивается…', 'Хлыст!', ''],
  fog: ['Наползает туман…', 'Пелена!', ''],
};

/** Строки в тост (зубы плащеносной): первое касание и обрыв */
export const TEETH_TOAST_1 = '🦈 Леска держится на честном слове!';
export const TEETH_TOAST_2 = '🦈 Хрум! Триста зубов против одной лески';

const SVG_CRACKS = '<svg viewBox="0 0 48 100" preserveAspectRatio="none" width="100%" height="100%"><path d="M24 0 L20 18 L27 30 L22 52 L26 70"/>'
  + '<path d="M20 18 L8 28 L4 44"/><path d="M27 30 L40 38 L44 58"/><path d="M22 52 L12 62"/></svg>';
const SVG_SEAM = '<svg viewBox="0 0 48 10" preserveAspectRatio="none"><path d="M0 5 L4 1 L8 8 L12 2 L16 7 L20 1 L24 9 L28 3 L32 8 L36 1 L40 7 L44 2 L48 6"'
  + ' fill="none" stroke="#3a2210" stroke-width="2.4"/><path d="M0 5 L4 1 L8 8 L12 2 L16 7 L20 1 L24 9 L28 3 L32 8 L36 1 L40 7 L44 2 L48 6" fill="none"'
  + ' stroke="#d9a76f" stroke-width="0.9" transform="translate(0 -1)"/></svg>';
const SVG_INK_EDGE = '<svg class="frx-ink-edge" viewBox="0 0 48 12" preserveAspectRatio="none"><path d="M0 12 L0 6 Q4 0 8 6 T16 6 T24 5 T32 7 T40 5 T48 6 L48 12 Z" fill="#2a1d33"/></svg>';
const SVG_ARROW = '<svg viewBox="0 0 40 40"><path d="M20 34 V8 M10 17 L20 6 L30 17" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>';
const SVG_WIND = `${SVG_ARROW}<path d="M6 26 h6 M28 30 h7 M30 22 h6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" opacity="0.7"/></svg>`;
const SVG_WHIP = `${SVG_ARROW}<path d="M8 30 q6 -8 14 -4 q8 4 12 -6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" opacity="0.75"/></svg>`;
const SVG_TOOTH = '<svg viewBox="0 0 48 20" preserveAspectRatio="none"><rect x="0" y="0" width="48" height="20" fill="rgba(160,20,30,.35)"/>'
  + '<path d="M0 0 L10 10 L0 20 Z M48 0 L38 10 L48 20 Z M12 0 L18 8 L24 0 Z M24 20 L30 12 L36 20 Z" fill="#fff8ec" stroke="#5a1a1a" stroke-width="1.2"/></svg>';
const SVG_HERRING = '<svg viewBox="0 0 40 24"><path d="M3 12c5-6 14-8 22-5l7-5-1 8 1 7-7-5c-8 3-17 1-22-5z" fill="currentColor" stroke="rgba(20,30,40,.8)"'
  + ' stroke-width="1.8" stroke-linejoin="round"/><path d="M8 13h16" stroke="#8fb0c4" stroke-width="1.4"/><circle cx="8" cy="10.5" r="1.8" fill="#1b1216"/></svg>';

/** Шторм гренландской акулы: звук ветра и дождя зовём раз в столько мс, пока дует (Sound.fishStorm) */
const STORM_EVERY_MS = 900;
/** Чутьё: заглядываем вперёд раз в столько тиков */
const SENSE_EVERY = 3;
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Что было на прошлом тике — события выводим из смены (как step() на странице-прототипе) */
interface Prev {
  phase: number;
  wind: number;
  n: number;
  bites: number;
  strikes: number;
  swing: number;
  tooth: number;
  wall: number;
}

export class ReelAbilityFx {
  /** Тост игроку (зубы плащеносной) */
  onToast: (text: string) => void = () => {};
  private readonly sound: Sound;
  private readonly root: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly zone: HTMLElement;
  private readonly fish: HTMLElement;
  private readonly label: HTMLElement;
  private readonly warnEl: HTMLElement;
  private readonly deep: HTMLElement;
  private readonly seam: HTMLElement;
  private readonly cracks: HTMLElement;
  private readonly teeth: HTMLElement;
  private readonly fog: HTMLElement;
  private readonly ink: HTMLElement;
  private readonly splat: HTMLElement;
  private readonly shards: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly minis: HTMLElement;
  private readonly wait: HTMLElement;
  private readonly windb: HTMLElement;
  private readonly windt: HTMLElement;
  private readonly whipb: HTMLElement;
  private readonly whipt: HTMLElement;
  private readonly mark: HTMLElement;
  private readonly prog: HTMLElement;
  private readonly arrow: HTMLElement;
  /** Слои поверх всего экрана: косой дождь (ветер) и серая дымка (пелена) */
  private readonly storm: HTMLElement;
  private readonly haze: HTMLElement;
  private lb: LevelBonus | null = null;
  private prev: Prev = { phase: 0, wind: 0, n: 0, bites: 0, strikes: 0, swing: 0, tooth: 0, wall: 0 };
  private warnTimer = 0;
  private stormLevel = 0;
  private stormAt = 0;
  private senseUntil = 0;
  private senseDir = 1;

  constructor(parts: { parent: HTMLElement; root: HTMLElement; bar: HTMLElement; zone: HTMLElement; fish: HTMLElement; label: HTMLElement; prog: HTMLElement; slot: HTMLElement }, sound: Sound) {
    this.sound = sound;
    const { parent, root, bar, zone } = parts;
    this.root = root;
    this.bar = bar;
    this.zone = zone;
    this.fish = parts.fish;
    this.label = parts.label;
    this.prog = parts.prog;
    // внутри шкалы: под зоной — новая часть после пролома, шов, трещины и зубы; над рыбой — пелена и чернила
    this.deep = bar.insertBefore(el('div', 'frx-deep'), zone);
    this.seam = bar.insertBefore(el('div', 'frx-seam'), zone);
    this.seam.innerHTML = SVG_SEAM;
    this.cracks = bar.insertBefore(el('div', 'frx-cracks'), zone);
    this.cracks.innerHTML = SVG_CRACKS;
    this.teeth = bar.insertBefore(el('div', 'frx-teeth'), zone);
    this.fog = bar.appendChild(el('div', 'frx-fog'));
    this.ink = bar.appendChild(el('div', 'frx-ink'));
    this.ink.innerHTML = `<div class="frx-ink-drips">${[6, 14, 22, 31, 40].map((x, i) => `<i style="left:${x}px;height:${18 + (i * 13) % 34}px;animation-delay:${i * 0.17}s"></i>`).join('')}</div>${SVG_INK_EDGE}<div class="frx-ink-body"></div>`;
    zone.appendChild(el('div', 'frx-streaks'));
    this.arrow = this.fish.appendChild(el('span', 'frx-arrow', '↑'));
    // рядом со шкалой: плашка фазы, клякса, осколки, мини-шкалы селёдок, значки ветра и хлыста
    this.banner = root.appendChild(el('div', 'frx-banner'));
    this.splat = root.appendChild(el('div', 'frx-splat'));
    this.shards = root.appendChild(el('div', 'frx-shards'));
    this.minis = root.appendChild(el('div', 'frx-minis'));
    this.wait = root.appendChild(el('div', 'frx-wait', 'Король ждёт'));
    this.windb = root.appendChild(el('div', 'frx-badge'));
    this.windb.innerHTML = SVG_WIND;
    this.windt = this.windb.appendChild(el('b', '', 'ветер'));
    this.whipb = root.appendChild(el('div', 'frx-badge'));
    this.whipb.innerHTML = SVG_WHIP;
    this.whipt = this.whipb.appendChild(el('b', '', 'хлыст'));
    this.mark = this.prog.appendChild(el('span', 'frx-mark'));
    this.warnEl = parts.slot.insertBefore(el('div', 'fe-stand frx-warn'), parts.slot.firstChild);
    // поверх экрана, но под шкалой (root уже в parent)
    this.storm = parent.insertBefore(el('div', 'frx-storm'), root);
    this.haze = parent.insertBefore(el('div', 'frx-haze'), root);
  }

  /** Новый бой: lb — бонусы уровня рыбака (метка, рамка, чутьё) */
  start(r: Reel, lb: LevelBonus): void {
    this.clear();
    this.lb = lb;
    this.prev = { phase: 0, wind: 0, n: 0, bites: 0, strikes: 0, swing: 0, tooth: 0, wall: 0 };
    this.root.classList.toggle('frx-master', lb.master);
    // «Метка мифика» (ур. 7): где на полосе улова рыба пустит в ход способность
    const ab = r.ab;
    this.mark.classList.toggle('on', lb.abilityMark && !!ab);
    if (ab) this.mark.style.left = `${(ab.at / REEL_P_MAX) * 100}%`;
    this.arrow.classList.toggle('on', lb.senseArrow);
    this.minis.replaceChildren();
    if (ab?.id === 'herring') {
      for (let i = 0; i < (ab.spec.count ?? 3); i++) {
        const d = this.minis.appendChild(el('div', 'frx-mini'));
        d.innerHTML = `<div class="fr-water"></div><div class="fr-zone"></div><div class="frx-hf">${SVG_HERRING}</div><div class="frx-ok">✓</div><div class="frx-hold"><i></i></div>`;
      }
    }
  }

  /** Бой кончился (поймал, сорвалась, сдался): петли звука и дождь стихают, трещины и плашки — прочь; шкала остаётся как есть до скрытия */
  end(): void {
    this.stormLevel = 0;
    this.storm.classList.remove('on');
    this.haze.classList.remove('on');
    this.windb.classList.remove('on');
    this.whipb.classList.remove('on');
    this.wait.classList.remove('on');
    this.cracks.classList.remove('on');
    this.fish.classList.remove('frx-sense', 'frx-puff');
    this.bar.classList.remove('frx-quake', 'frx-dim');
  }

  /** Шкала скрыта: всё в исходное */
  clear(): void {
    this.end();
    this.lb = null;
    this.bar.style.height = '';
    this.bar.style.marginTop = '';
    this.bar.style.marginBottom = '';
    this.label.style.translate = '';
    this.root.style.removeProperty('--frx-down');
    this.root.classList.remove('frx-down', 'frx-master');
    this.root.style.scale = '';
    this.root.style.transformOrigin = '';
    this.deep.className = 'frx-deep';
    this.seam.className = 'frx-seam';
    this.teeth.replaceChildren();
    this.fog.replaceChildren();
    this.ink.className = 'frx-ink';
    this.zone.classList.remove('frx-inked', 'frx-windy', 'frx-down');
    this.fish.classList.remove('frx-pale', 'frx-hidden');
    this.mark.classList.remove('on');
    this.minis.replaceChildren();
    this.banner.className = 'frx-banner';
    this.warnEl.classList.remove('show');
    this.shards.replaceChildren();
    window.clearTimeout(this.warnTimer);
  }

  /** Тик модели (после reelStep): события способности — плашки, звуки, тосты. held — держит ли кнопку (для чутья) */
  tick(r: Reel, held: boolean): void {
    if (this.lb && this.lb.senseMs > 0 && r.t % SENSE_EVERY === 0) this.lookAhead(r, held);
    const ab = r.ab;
    if (!ab) return;
    const v = abilityView(r)!;
    const p = this.prev;
    if (v.phase !== p.phase) this.onPhase(r, v);
    if (ab.id === 'wind' && v.phase === 2 && v.wind !== p.wind && p.wind !== 0) {
      this.say('Ветер сменился!', 0.85);
      this.sfx('gust');
    }
    if (ab.id === 'herring' && v.phase === 2 && ab.n !== p.n) {
      this.sfx('herring');
      this.markMini(p.n, 'done');
      this.markMini(ab.n, 'on');
    }
    if (ab.id === 'teeth' && v.bites !== p.bites) {
      this.pulse(this.bar, 'frx-bite');
      if (v.bites === 1) {
        this.sfx('bite');
        this.warn('Леска еле держится!');
        this.onToast(TEETH_TOAST_1);
      } else {
        this.sfx('snap');
        this.onToast(TEETH_TOAST_2);
      }
    }
    if (ab.id === 'whip') {
      if (v.swing > 0 && p.swing === 0 && v.phase === 2) this.sfx('whistle');
      if (v.strikes !== p.strikes && v.strikes > 1) {
        this.sfx('whip');
        this.pulse(this.bar, 'frx-whip');
        this.say('Хлыст!', 0.6);
      }
    }
    if (ab.id === 'teeth' && v.phase === 2 && v.toothState !== p.tooth && v.toothState === 1) this.sfx('clack');
    if (ab.id === 'fog' && v.phase === 2 && v.wall.length > 0 && p.wall === 0) this.sfx('gust');
    this.prev = { phase: v.phase, wind: v.wind, n: ab.n, bites: v.bites, strikes: v.strikes, swing: v.swing, tooth: v.toothState, wall: v.wall.length };
  }

  /** Кадр: слои способности по модели (доли шкалы — от её низа до верха сейчас) */
  render(r: Reel, now: number): void {
    const v = abilityView(r);
    const live = r.done === 0;
    // чутьё: рыба вздрагивает перед рывком (под полными чернилами не видно)
    const inkTop = v && v.id === 'ink' ? v.ink : 0;
    this.fish.classList.toggle('frx-sense', live && now < this.senseUntil && inkTop < 0.999);
    if (this.lb?.senseArrow) this.arrow.textContent = this.senseDir > 0 ? '↑' : '↓';
    // пролом: новый кусок шкалы глубже (или светлее у верха), на месте старого края — шов
    const ext = r.lo < 0 || r.hi > REEL_BAR;
    if (ext) {
      const span = r.hi - r.lo;
      const up = r.hi > REEL_BAR;
      const edge = ((up ? REEL_BAR : 0) - r.lo) / span;
      this.seam.style.bottom = `${(edge * 100).toFixed(2)}%`;
      this.deep.style.bottom = up ? `${(edge * 100).toFixed(2)}%` : '0';
      this.deep.style.height = up ? `${((1 - edge) * 100).toFixed(2)}%` : `${(edge * 100).toFixed(2)}%`;
    }
    if (!v) return;
    // чернила: закрывают шкалу снизу до v.ink; зона под ними — контуром
    if (v.id === 'ink') {
      const on = v.phase === 2 && v.ink > 0;
      this.ink.className = `frx-ink${on ? ' on' : ''}${v.ink >= 0.999 ? ' full' : ''}`;
      if (on) this.ink.style.height = `${(v.ink * 100).toFixed(2)}%`;
      const zLow = (r.z - r.lo) / (r.hi - r.lo);
      this.zone.classList.toggle('frx-inked', on && (v.ink >= 0.999 || zLow < v.ink));
    }
    // ветер: значок куда дует (мигает перед сменой), полосы на зоне, косой дождь
    if (v.id === 'wind') {
      const on = live && (v.phase === 1 || v.phase === 2);
      this.windb.classList.toggle('on', on);
      this.windb.classList.toggle('warn', v.phase === 1);
      this.windb.classList.toggle('down', v.wind < 0);
      this.windb.classList.toggle('turn', v.phase === 2 && v.windNext >= 0 && v.windNext <= 24);
      setText(this.windt, v.phase === 1 ? 'ветер…' : v.wind > 0 ? 'дует вверх' : 'дует вниз');
      this.zone.classList.toggle('frx-windy', live && r.wind !== 0);
      this.zone.classList.toggle('frx-down', r.wind < 0);
      this.stormLevel = on ? 1 : 0;
    }
    // хлыст: значок — куда ударит, мигает в замахе
    if (v.id === 'whip') {
      const on = live && (v.phase === 1 || v.phase === 2);
      this.whipb.classList.toggle('on', on);
      this.whipb.classList.toggle('warn', v.phase === 1);
      this.whipb.classList.toggle('down', v.whipSide < 0);
      this.whipb.classList.toggle('turn', v.swing > 0);
      setText(this.whipt, v.swing > 0 ? (v.whipSide < 0 ? 'удар вниз!' : 'удар вверх!') : 'хлыст');
    }
    // пелена: полосы и стена; рыба в полосе — бледная тень, в стене — не видна
    if (v.id === 'fog' && v.phase === 2) {
      const want = v.fog.length / 2 + (v.wall.length ? 1 : 0);
      while (this.fog.childElementCount < want) this.fog.appendChild(el('div', 'frx-band'));
      while (this.fog.childElementCount > want) this.fog.lastElementChild!.remove();
      const kids = this.fog.children as HTMLCollectionOf<HTMLElement>;
      for (let i = 0; i < v.fog.length / 2; i++) place(kids[i], v.fog[2 * i], v.fog[2 * i + 1], 'frx-band');
      if (v.wall.length) place(kids[v.fog.length / 2], v.wall[0], v.wall[1], 'frx-band frx-wall');
      const fy = (r.f - r.lo) / (r.hi - r.lo);
      const inWall = v.wall.length > 0 && fy >= v.wall[0] && fy <= v.wall[1];
      let pale = false;
      for (let i = 0; i < v.fog.length; i += 2) if (fy >= v.fog[i] && fy <= v.fog[i + 1]) pale = true;
      this.fish.classList.toggle('frx-hidden', live && inWall);
      this.fish.classList.toggle('frx-pale', live && pale && !inWall);
    }
    // зубы: острые / тупые (можно проехать) / мерцают
    if (v.id === 'teeth' && (v.phase === 1 || v.phase === 2)) {
      if (this.teeth.childElementCount !== v.teeth.length / 2) this.drawTeeth(v, v.phase === 1);
      if (v.phase === 2) {
        const cls = ['dull', 'flick', 'sharp'][v.toothState];
        for (const t of this.teeth.children) t.className = `frx-tooth ${cls}`;
      }
    }
    // селёдки: мини-шкала идущей рыбы и «Король ждёт · N с»
    if (v.minion && r.ab) {
      const d = this.minis.children[v.minion.n] as HTMLElement | undefined;
      if (d) {
        if (!d.classList.contains('on')) this.markMini(v.minion.n, 'on');
        const m = v.minion;
        const z = d.querySelector<HTMLElement>('.fr-zone')!;
        z.style.bottom = `${(m.z0 * 100).toFixed(2)}%`;
        z.style.height = `${((m.z1 - m.z0) * 100).toFixed(2)}%`;
        z.classList.toggle('in', m.fish >= m.z0 - 0.01 && m.fish <= m.z1 + 0.01);
        d.querySelector<HTMLElement>('.frx-hf')!.style.bottom = `${(m.fish * 100).toFixed(2)}%`;
        d.querySelector<HTMLElement>('.frx-hold i')!.style.width = `${Math.min(100, (m.hold / m.need) * 100).toFixed(0)}%`;
      }
      setText(this.wait, `Король ждёт · ${Math.ceil(Math.max(0, r.ab.dur - r.ab.t) / 60)} с`);
    }
    // шторм: звук ветра и дождя, пока дует (порывы перекрываются), и плавно стихает сам
    this.storm.classList.toggle('on', this.stormLevel > 0);
    if (this.stormLevel > 0 && now - this.stormAt >= STORM_EVERY_MS) {
      this.stormAt = now;
      this.sound.fishStorm(this.stormLevel);
    }
  }

  /** Способность входит в фазу: плашка, звук, вспышка (как onPhase() на странице-прототипе) */
  private onPhase(r: Reel, v: AbilityView): void {
    const ab = r.ab!;
    const B = BANNERS[ab.id];
    this.root.style.setProperty('--frx-warn', `${ab.spec.warn / 60}s`);
    if (v.phase === 1) {
      this.say(B[0], 1);
      switch (ab.id) {
        case 'breach':
          this.cracks.classList.add('on');
          this.cracks.classList.toggle('top', ab.side > 0);
          this.bar.classList.add('frx-quake');
          this.sfx('crack');
          break;
        case 'ink':
        case 'surge':
          this.fish.classList.add('frx-puff');
          this.sfx('inhale');
          break;
        case 'wind':
          this.sfx('whistle');
          break;
        case 'herring':
          this.sfx('call');
          break;
        case 'teeth':
          this.sfx('clack');
          break;
        case 'whip':
          this.sfx('whistle');
          break;
        case 'fog':
          this.haze.classList.add('on');
          this.sfx('horn');
          break;
      }
    } else if (v.phase === 2) {
      this.say(ab.id === 'herring' ? `Поймай ${ab.spec.count ?? 3} ${(ab.spec.count ?? 3) < 5 ? 'селёдки' : 'селёдок'}!` : B[1], 1.2);
      switch (ab.id) {
        case 'breach':
          this.cracks.classList.remove('on');
          this.bar.classList.remove('frx-quake');
          this.grow(r, ab.side);
          this.sfx('shatter');
          break;
        case 'ink':
          this.fish.classList.remove('frx-puff');
          this.sfx('ink');
          this.splash(r);
          break;
        case 'wind':
          this.sfx('gust');
          break;
        case 'herring':
          this.markMini(0, 'on');
          this.wait.classList.add('on');
          this.bar.classList.add('frx-dim');
          this.placeSide();
          break;
        case 'surge':
          this.fish.classList.remove('frx-puff');
          this.sfx('ink');
          this.pulse(this.prog, 'frx-drop');
          this.warn('Улов откатился — белуга быстрее!');
          break;
        case 'whip':
          this.sfx('whip');
          this.pulse(this.bar, 'frx-whip');
          break;
      }
    } else if (v.phase === 3) {
      if (B[2]) this.say(B[2], 0.9);
      switch (ab.id) {
        case 'ink':
          this.ink.className = 'frx-ink';
          this.zone.classList.remove('frx-inked');
          break;
        case 'wind':
          this.stormLevel = 0;
          this.windb.classList.remove('on');
          this.zone.classList.remove('frx-windy', 'frx-down');
          break;
        case 'herring':
          for (let i = 0; i < this.minis.childElementCount; i++) if (!this.minis.children[i].classList.contains('done')) this.markMini(i, 'gone');
          if (ab.n < (ab.spec.count ?? 3)) this.sfx('gone');
          this.wait.classList.remove('on');
          this.bar.classList.remove('frx-dim');
          this.sfx('rush');
          break;
        case 'teeth':
          this.teeth.replaceChildren();
          break;
        case 'fog':
          this.fog.replaceChildren();
          this.haze.classList.remove('on');
          break;
      }
    }
    if (v.phase === 1 || v.phase === 2) this.placeSide();
  }

  /**
   * Пролом: шкала +grow % в сторону side до конца боя. Новый кусок дорисован той же рамкой (шкала длиннее), зона — того же
   * размера в пикселях. Колонку не двигаем: шкала вылезает за свой прежний край (отрицательный отступ), подпись сверху или
   * всё, что под шкалой, отъезжает на столько же. Не влезает в окно — вся колонка плавно уменьшается (как камера отъехала).
   */
  private grow(r: Reel, side: number): void {
    const inner = this.bar.clientHeight;
    const g = Math.round(inner * ((r.hi - r.lo) / REEL_BAR - 1));
    if (g <= 0) return;
    const before = this.root.getBoundingClientRect();
    const barBox = this.bar.getBoundingClientRect();
    this.bar.style.height = `${this.bar.offsetHeight + g}px`;
    if (side > 0) {
      this.bar.style.marginTop = `${-g}px`;
      this.label.style.translate = `0 ${-g}px`;
    } else {
      this.bar.style.marginBottom = `${-g}px`;
      this.root.style.setProperty('--frx-down', `${g}px`);
      this.root.classList.add('frx-down');
    }
    this.deep.className = `frx-deep on${side > 0 ? ' top' : ''}`;
    this.seam.className = 'frx-seam on';
    this.burst(side, barBox, before);
    // влезает ли колонка в окно: верх и низ с запасом 8 px; нет — уменьшаем вокруг прежней шкалы
    const vh = window.innerHeight;
    const top = before.top - (side > 0 ? g : 0);
    const bottom = before.bottom + (side > 0 ? 0 : g);
    const o = (barBox.top + barBox.bottom) / 2;
    let s = 1;
    if (top < 8) s = Math.min(s, (o - 8) / Math.max(1, o - top));
    if (bottom > vh - 8) s = Math.min(s, (vh - 8 - o) / Math.max(1, bottom - o));
    if (s < 0.999) {
      this.root.style.transformOrigin = `50% ${(o - before.top).toFixed(0)}px`;
      this.root.style.scale = `${Math.max(0.55, s).toFixed(3)}`;
    }
  }

  /** Осколки шкалы и брызги из пробитого края (DOM, без холста): разлетаются и падают за ~1,2 с */
  private burst(side: number, barBox: DOMRect, rootBox: DOMRect): void {
    if (REDUCED) return;
    const x = (barBox.left + barBox.right) / 2 - rootBox.left;
    const y = (side > 0 ? barBox.top : barBox.bottom) - rootBox.top;
    const cols = ['#7a4e2c', '#a8754a', '#5a3a1f', '#b8323f', '#d9a76f'];
    const out: HTMLElement[] = [];
    for (let i = 0; i < 34; i++) {
      const water = i >= 20;
      const a = (Math.random() - 0.5) * Math.PI * (water ? 1.2 : 0.9) + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
      const sp = (water ? 70 : 90) + Math.random() * (water ? 110 : 150);
      const s = el('i', water ? 'frx-shard frx-drop' : 'frx-shard');
      s.style.left = `${(x + (Math.random() - 0.5) * 40).toFixed(0)}px`;
      s.style.top = `${y.toFixed(0)}px`;
      s.style.setProperty('--dx', `${(Math.cos(a) * sp).toFixed(0)}px`);
      s.style.setProperty('--dy1', `${(Math.sin(a) * sp * 0.6).toFixed(0)}px`);
      s.style.setProperty('--dy2', `${(Math.sin(a) * sp * 0.6 + 140 + Math.random() * 80).toFixed(0)}px`);
      s.style.setProperty('--rot', `${((Math.random() - 0.5) * 900).toFixed(0)}deg`);
      s.style.width = `${(water ? 3 + Math.random() * 3 : 4 + Math.random() * 9).toFixed(1)}px`;
      s.style.height = `${(water ? 3 + Math.random() * 3 : 2 + Math.random() * 4).toFixed(1)}px`;
      if (!water) s.style.background = cols[i % cols.length];
      s.style.animationDuration = `${(0.9 + Math.random() * 0.5).toFixed(2)}s`;
      out.push(s);
    }
    this.shards.replaceChildren(...out);
    window.setTimeout(() => this.shards.replaceChildren(), 1600);
  }

  /** Клякса чернил из точки, где кальмар */
  private splash(r: Reel): void {
    const fy = (r.f - r.lo) / (r.hi - r.lo);
    this.splat.style.left = `${this.bar.offsetLeft + this.bar.offsetWidth / 2}px`;
    this.splat.style.top = `${this.bar.offsetTop + this.bar.offsetHeight * (1 - fy)}px`;
    this.pulse(this.splat, 'on');
  }

  /**
   * Значки ветра и хлыста — справа от шкалы; слева — плашка фазы (у верха шкалы, рыбу и зону не закрывает), мини-шкалы
   * селёдок и под ними «Король ждёт» (по месту шкалы сейчас)
   */
  private placeSide(): void {
    const b = this.bar;
    const mid = b.offsetTop + b.offsetHeight / 2;
    const right = b.offsetLeft + b.offsetWidth + 12;
    for (const e of [this.windb, this.whipb]) {
      e.style.left = `${right}px`;
      e.style.top = `${mid}px`;
    }
    const h = Math.round(b.clientHeight * 0.6);
    this.minis.style.right = `${this.root.clientWidth - b.offsetLeft + 12}px`;
    this.minis.style.top = `${mid - h / 2}px`;
    for (const m of this.minis.children) (m as HTMLElement).style.height = `${h}px`;
    this.wait.style.right = `${this.root.clientWidth - b.offsetLeft + 12}px`;
    this.wait.style.top = `${mid + h / 2 + 8}px`;
    this.banner.style.right = `${this.root.clientWidth - b.offsetLeft + 16}px`;
    this.banner.style.top = `${b.offsetTop + 6}px`;
  }

  private markMini(i: number, cls: 'on' | 'done' | 'gone'): void {
    const d = this.minis.children[i] as HTMLElement | undefined;
    if (d) d.className = `frx-mini ${cls}`;
  }

  private drawTeeth(v: AbilityView, grow: boolean): void {
    const out: HTMLElement[] = [];
    for (let i = 0; i < v.teeth.length; i += 2) {
      const t = el('div', `frx-tooth${grow ? ' grow' : ''}`);
      t.style.bottom = `${(v.teeth[i] * 100).toFixed(2)}%`;
      t.style.height = `${((v.teeth[i + 1] - v.teeth[i]) * 100).toFixed(2)}%`;
      t.innerHTML = SVG_TOOTH;
      out.push(t);
    }
    this.teeth.replaceChildren(...out);
  }

  /** Плашка фазы над шкалой (dur — её длительность, доли 1,6 с) */
  private say(text: string, dur: number): void {
    const b = this.banner;
    b.textContent = text;
    b.style.animationDuration = `${(1.6 * dur).toFixed(2)}s`;
    this.pulse(b, 'on');
  }

  /** Срочная строка под шкалой («Леска еле держится!»), 2,2 с */
  private warn(text: string): void {
    const w = this.warnEl;
    w.textContent = text;
    this.pulse(w, 'show');
    window.clearTimeout(this.warnTimer);
    this.warnTimer = window.setTimeout(() => w.classList.remove('show'), 2200);
  }

  private pulse(e: HTMLElement, cls: string): void {
    e.classList.remove(cls);
    void e.offsetWidth;
    e.classList.add(cls);
  }

  private sfx(kind: FishAbSound): void {
    this.sound.fishAbility(kind);
  }

  /**
   * Чутьё (ур. 4, 12): заглянуть вперёд по той же модели на 0,25 / 0,4 с — будет рывок, рыба вздрагивает (12+ — стрелка
   * куда). Рыба почти не зависит от зоны (кроме «чует ловушку»), кнопку считаем прежней.
   */
  private lookAhead(r: Reel, held: boolean): void {
    if (r.done !== 0 || r.mode === 2 || !this.lb) return;
    const q = structuredClone(r);
    const n = Math.round(this.lb.senseMs / (1000 / 60));
    for (let i = 0; i < n && q.done === 0; i++) {
      reelStep(q, held);
      if (q.mode === 2) {
        this.senseUntil = performance.now() + this.lb.senseMs;
        this.senseDir = q.fv >= 0 ? 1 : -1;
        return;
      }
    }
  }
}

function place(e: HTMLElement, a: number, b: number, cls: string): void {
  if (e.className !== cls) e.className = cls;
  e.style.bottom = `${(a * 100).toFixed(2)}%`;
  e.style.height = `${((b - a) * 100).toFixed(2)}%`;
}

function setText(e: HTMLElement, text: string): void {
  if (e.textContent !== text) e.textContent = text;
}

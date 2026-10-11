// Настройки по категориям: Графика, Звук, Управление, Интерфейс — строками кита (.k-row, .k-slider, .k-switch, .k-seg,
// menu/controls.ts). Один экземпляр на всё время: в меню видна одна категория (её выбирают слева), на экране входа
// (⚙ Настройки) — все подряд с заголовками. Значения живут в Settings
// (client/settings.ts, localStorage); применяет их App.applySettings — через onChange.
import type { MixPreview } from '../../audio.ts';
import { editGfx, minScale, pickCustom, pickPreset, type DistanceLevel, type EffectsLevel, type FpsCap, type GfxItems, type GfxState, type ShadowLevel } from '../../render/gfx.ts';
import { UI_SCALES, effectiveVolume, toggleMute, type ChatFeed, type Quality, type Settings } from '../../settings.ts';
import { TOUCH } from '../../touch.ts';
import { applyHudScale } from '../kit/scale.ts';
import { el, kButton, kRow, kSeg, kSlider, kSwitch, ownKeys, setSlider } from './controls.ts';

export type SettingsCategory = 'graphics' | 'sound' | 'controls' | 'interface';

const CATS: ReadonlyArray<readonly [SettingsCategory, string]> = [
  ['graphics', 'Графика'], ['sound', 'Звук'], ['controls', 'Управление'], ['interface', 'Интерфейс'],
];

export interface SettingsPanelHooks {
  /** Настройку поменяли: применить и запомнить */
  onChange(): void;
  /** Что в графике действует сейчас: у пресета его значения, у «Авто» — до чего дошла игра, у «Своё» — свои */
  gfx(): GfxState;
  /** Ссылка на соседний раздел меню */
  go(section: 'voice' | 'keys'): void;
  /** Ползунок громкости отпустили: короткий пример звука его шины */
  preview?(kind: MixPreview): void;
}

export class SettingsPanel {
  readonly root: HTMLElement;
  private readonly s: Settings;
  private readonly hooks: SettingsPanelHooks;
  private readonly cats = new Map<SettingsCategory, HTMLElement>();
  private readonly syncs: Array<() => void> = [];

  constructor(s: Settings, hooks: SettingsPanelHooks) {
    this.s = s;
    this.hooks = hooks;
    this.root = el('div', 'settings mn-set');
    for (const [id, name] of CATS) {
      const sec = this.root.appendChild(el('section', 'set-cat'));
      sec.dataset.cat = id;
      sec.appendChild(el('h4', 'set-cat-h', name));
      this.cats.set(id, sec);
    }
    this.graphics();
    this.sound();
    this.controls();
    this.interface();
    this.sync();
  }

  /** Показать одну категорию (в меню); на экране входа CSS показывает все */
  show(cat: SettingsCategory): void {
    for (const [id, sec] of this.cats) sec.hidden = id !== cat;
    // громкость голосов меняют и во вкладке «Голос» — показываем свежую
    this.sync();
  }

  /** Подогнать ползунки и переключатели под настройки (звук меняют и клавишей M) */
  sync(): void {
    for (const f of this.syncs) f();
  }

  // ------------------------------------------------------------ категории

  /**
   * Графика по пунктам. «Качество картинки» — пресет: нажал — все пункты встали по нему; тронул пункт руками — стало «Своё»
   * (пункты остались как были, правка поверх). Что действует, считает client/render/gfx.ts; применяет App.applyQuality на лету.
   */
  private graphics(): void {
    const s = this.s;
    const now = (): GfxState => this.hooks.gfx();
    const edit = (patch: Partial<GfxItems>): void => editGfx(s, now(), patch);
    let c = this.item('graphics', 'Качество картинки', '');
    const hint = c.parentElement!.querySelector('.k-row-hint')!;
    this.choice<Quality | 'custom'>(
      c,
      'Качество картинки',
      [['auto', 'Авто'], ['high', 'Высокое'], ['medium', 'Среднее'], ['low', 'Низкое'], ['custom', 'Своё']],
      () => (s.custom ? 'custom' : s.quality),
      (v) => (v === 'custom' ? pickCustom(s, now()) : pickPreset(s, v)),
    );
    this.syncs.push(() => {
      hint.textContent = s.custom
        ? '«Своё»: пункты ниже выставлены вручную. Нажми пресет — все пункты встанут по нему.'
        : 'Пресет выставляет все пункты ниже сразу. «Авто» само снизит разрешение, если игра тормозит. Тронешь пункт — станет «Своё».';
    });
    c = this.item('graphics', 'Разрешение', 'Ниже — меньше пикселей, зато плавнее. 100% — родное разрешение экрана');
    this.slider(c, 'Разрешение', minScale(window.devicePixelRatio || 1), 1, 0.05, () => now().renderScale, (v) => edit({ renderScale: v }), () => {
      const g = now();
      return g.auto ? `авто · ${pct(g.renderScale)}` : pct(g.renderScale);
    });
    c = this.item('graphics', 'Тени', 'Выкл — самое быстрое. Низкие — резче и грубее');
    this.choice<ShadowLevel>(c, 'Тени', [['off', 'Выкл'], ['low', 'Низкие'], ['high', 'Высокие']], () => now().shadows, (v) => edit({ shadows: v }));
    c = this.item('graphics', 'Эффекты и частицы', 'Дождь, салют, фонтаны, брызги. «Меньше» ещё и гасит точечные лампы на набережной');
    this.choice<EffectsLevel>(c, 'Эффекты и частицы', [['less', 'Меньше'], ['normal', 'Обычно'], ['more', 'Больше']], () => now().effects, (v) => edit({ effects: v }));
    c = this.item('graphics', 'Дальность видимости', 'Что дальше — тонет в дымке и не рисуется');
    this.choice<DistanceLevel>(c, 'Дальность видимости', [['near', 'Близко'], ['mid', 'Средне'], ['far', 'Далеко']], () => now().viewDistance, (v) => edit({ viewDistance: v }));
    c = this.item('graphics', 'Ограничение FPS', 'Для слабых ноутбуков: меньше кадров — холоднее и тише');
    this.choice<FpsCap>(c, 'Ограничение FPS', [[0, 'Без ограничения'], [60, '60'], [30, '30']], () => now().fpsCap, (v) => edit({ fpsCap: v }));
    c = this.item('graphics', 'Угол обзора', 'Шире — больше видно по сторонам');
    this.slider(c, 'Угол обзора', 70, 120, 1, () => s.fov, (v) => { s.fov = v; }, () => `${Math.round(s.fov)}°`);
    c = this.item('graphics', 'Показывать FPS и пинг', 'Счётчик кадров и задержки в углу экрана', true);
    this.toggle(c, () => s.showStats, (v) => { s.showStats = v; });
  }

  private sound(): void {
    const s = this.s;
    // отпустили ползунок — пример его звука: музыка — фраза, окружение — волна, эффекты — щелчок, интерфейс — «дзынь»
    const hear = (k: MixPreview) => () => this.hooks.preview?.(k);
    let c = this.item('sound', 'Общая громкость', 'Музыка, окружение, эффекты и интерфейс. Голоса игроков — в разделе «Голос»');
    // без звука ползунок стоит на нуле и подписан «выкл» (сама громкость цела); двигают его — значит, хотят слышать
    this.slider(c, 'Общая громкость', 0, 1, 0.05, () => effectiveVolume(s), (v) => {
      s.volume = v;
      if (v > 0) s.muted = false;
    }, () => (s.muted ? 'выкл' : pct(s.volume)), hear('ui'));
    c = this.item('sound', 'Без звука', TOUCH ? 'Громкость останется прежней' : 'Клавиша M — в любой момент игры', true);
    this.toggle(c, () => s.muted, (v) => {
      if (v !== s.muted) toggleMute(s);
    });
    c = this.item('sound', 'Музыка', 'Музыкальный автомат на площади (песня — на всю набережную, у автомата громче) и радио на лодках');
    this.slider(c, 'Музыка', 0, 1, 0.05, () => s.musicVolume, (v) => { s.musicVolume = v; }, () => pct(s.musicVolume), hear('music'));
    c = this.item('sound', 'Окружение', 'Море, чайки, ветер, дождь и гром');
    this.slider(c, 'Окружение', 0, 1, 0.05, () => s.ambVolume, (v) => { s.ambVolume = v; }, () => pct(s.ambVolume), hear('amb'));
    c = this.item('sound', 'Эффекты', 'Выстрелы, шаги, моторы, удары');
    this.slider(c, 'Эффекты', 0, 1, 0.05, () => s.sfxVolume, (v) => { s.sfxVolume = v; }, () => pct(s.sfxVolume), hear('sfx'));
    c = this.item('sound', 'Интерфейс', 'Кнопки, уведомления, монетки');
    this.slider(c, 'Интерфейс', 0, 1, 0.05, () => s.uiVolume, (v) => { s.uiVolume = v; }, () => pct(s.uiVolume), hear('ui'));
    c = this.item('sound', 'Звуки интерфейса', 'Тихие щелчки кнопок, вкладок и наград', true);
    this.toggle(c, () => s.uiSounds, (v) => { s.uiSounds = v; });
    // громкость голосов — в одном месте: «Голос» → «Кто в голосе» (общая и каждого игрока)
    c = this.item('sound', 'Голоса игроков', 'Громкость всех и каждого, микрофон и его проверка — в разделе «Голос»');
    this.link(c, 'Открыть «Голос»', () => this.hooks.go('voice'));
  }

  private controls(): void {
    const s = this.s;
    let c = this.item('controls', TOUCH ? 'Обзор пальцем' : 'Чувствительность мыши', 'Как быстро поворачивается камера');
    this.slider(c, TOUCH ? 'Обзор пальцем' : 'Чувствительность мыши', 0.1, 4, 0.05, () => s.sens, (v) => { s.sens = v; }, () => s.sens.toFixed(2));
    c = this.item('controls', TOUCH ? 'Пальцем в прицеле' : 'Мышь в прицеле', 'Медленнее, когда целишься: доля от обычной чувствительности');
    this.slider(c, TOUCH ? 'Пальцем в прицеле' : 'Мышь в прицеле', 0.2, 1.5, 0.05, () => s.adsSens, (v) => { s.adsSens = v; }, () => s.adsSens.toFixed(2));
    c = this.item('controls', 'Инверсия по вертикали', TOUCH ? 'Палец вверх — взгляд вниз' : 'Мышь от себя — взгляд вниз, как в лётных играх', true);
    this.toggle(c, () => s.invertY, (v) => { s.invertY = v; });
    c = this.item('controls', 'Подсказки клавиш на экране', 'Полоска эмоций и строки вроде «W — газ» в режимах. Подсказки «E — …» у предметов остаются', true);
    this.toggle(c, () => s.keyHints, (v) => { s.keyHints = v; });
    c = this.item('controls', 'Клавиши', 'Что на какой клавише — в справке');
    this.link(c, 'Открыть список', () => this.hooks.go('keys'));
  }

  private interface(): void {
    const s = this.s;
    let c = this.item('interface', 'Размер интерфейса', 'Размер меню, плашек и подсказок поверх игры');
    this.choice<number>(c, 'Размер интерфейса', UI_SCALES.map((k) => [k, `${Math.round(k * 100)}%`] as const), () => s.uiScale, (v) => { s.uiScale = v; });
    c = this.item('interface', 'Сообщения чата', TOUCH ? 'Скрытые видно, пока чат открыт (💬)' : 'Скрытые видно, пока чат открыт (Enter)');
    this.choice<ChatFeed>(c, 'Сообщения чата', [['fade', 'Гаснут'], ['keep', 'Видны всегда'], ['hide', 'Скрыты']], () => s.chatFeed, (v) => { s.chatFeed = v; });
  }

  // ------------------------------------------------------------ кирпичики

  /** Строка: название и пояснение слева, управление справа (возвращает место для него). whole — вся строка нажимается */
  private item(cat: SettingsCategory, title: string, hint: string, whole = false): HTMLElement {
    return kRow(this.cats.get(cat)!, title, hint, whole, 'set-item').ctl;
  }

  /** release — ползунок отпустили (мышь, палец, стрелки): например, пример звука */
  private slider(ctl: HTMLElement, name: string, min: number, max: number, step: number, get: () => number, set: (v: number) => void, text: () => string, release?: () => void): void {
    const input = kSlider(name, min, max, step);
    const val = el('b', 'k-row-val');
    input.addEventListener('input', () => {
      set(Number(input.value));
      val.textContent = text();
      this.hooks.onChange();
    });
    if (release) input.addEventListener('change', release);
    input.addEventListener('keydown', ownKeys);
    ctl.append(input, val);
    this.syncs.push(() => {
      setSlider(input, String(get()));
      val.textContent = text();
    });
  }

  private toggle(ctl: HTMLElement, get: () => boolean, set: (v: boolean) => void): void {
    const { root, input } = kSwitch(ctl.parentElement?.querySelector('.k-row-title')?.textContent ?? '');
    ctl.appendChild(root);
    input.addEventListener('change', () => {
      set(input.checked);
      this.hooks.onChange();
    });
    input.addEventListener('keydown', ownKeys);
    this.syncs.push(() => {
      input.checked = get();
    });
  }

  /** Выбор из нескольких: ряд кнопок, нажатая — золотая */
  private choice<T>(ctl: HTMLElement, name: string, options: ReadonlyArray<readonly [T, string]>, get: () => T, set: (v: T) => void): void {
    const group = ctl.appendChild(kSeg(name));
    const buttons = options.map(([value, label]) => {
      const b = group.appendChild(kButton('', label));
      b.addEventListener('click', () => {
        set(value);
        draw();
        this.hooks.onChange();
      });
      return [value, b] as const;
    });
    const draw = () => {
      const cur = get();
      for (const [value, b] of buttons) b.setAttribute('aria-pressed', String(value === cur));
    };
    this.syncs.push(draw);
  }

  private link(ctl: HTMLElement, label: string, go: () => void): void {
    const b = ctl.appendChild(kButton('k-btn k-btn--ghost k-btn--sm set-link', label));
    b.addEventListener('click', go);
  }
}

/** Размер интерфейса, сообщения чата и подсказки клавиш — переменной CSS и атрибутами на <html> (стили — menu.css).
 *  --ui-scale — старые экраны (до переезда на кит), --hud-k — слои кита (пишет client/ui/kit/scale.ts) */
export function applyInterface(s: Pick<Settings, 'uiScale' | 'chatFeed' | 'keyHints'>): void {
  const root = document.documentElement;
  root.style.setProperty('--ui-scale', String(s.uiScale));
  applyHudScale(root, s.uiScale);
  root.dataset.chat = s.chatFeed;
  root.dataset.hints = s.keyHints ? 'on' : 'off';
}

const pct = (v: number): string => `${Math.round(v * 100)}%`;

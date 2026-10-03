// Настройки по категориям: Графика, Звук, Управление, Интерфейс. Один экземпляр на всё время: в меню видна одна
// категория (её выбирают слева), на экране входа (⚙ Настройки) — все подряд с заголовками. Значения живут в Settings
// (client/settings.ts, localStorage); применяет их App.applySettings — через onChange.
import type { MixPreview } from '../../audio.ts';
import { UI_SCALES, effectiveVolume, toggleMute, type ChatFeed, type Quality, type Settings } from '../../settings.ts';
import { TOUCH } from '../../touch.ts';
import { setVoiceVolume, voiceVolume } from '../../voice-prefs.ts';

export type SettingsCategory = 'graphics' | 'sound' | 'controls' | 'interface';

const CATS: ReadonlyArray<readonly [SettingsCategory, string]> = [
  ['graphics', 'Графика'], ['sound', 'Звук'], ['controls', 'Управление'], ['interface', 'Интерфейс'],
];

export interface SettingsPanelHooks {
  /** Настройку поменяли: применить и запомнить */
  onChange(): void;
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

  private graphics(): void {
    const s = this.s;
    let c = this.item('graphics', 'Качество картинки', 'Ниже — меньше чёткость и детали, зато плавнее. «Авто» само снизит качество, если игра тормозит.');
    this.choice<Quality>(c, 'Качество картинки', [['auto', 'Авто'], ['high', 'Высокое'], ['medium', 'Среднее'], ['low', 'Низкое']], () => s.quality, (v) => { s.quality = v; });
    c = this.item('graphics', 'Угол обзора', 'Шире — больше видно по сторонам');
    this.slider(c, 'Угол обзора', 70, 120, 1, () => s.fov, (v) => { s.fov = v; }, () => `${Math.round(s.fov)}°`);
    c = this.item('graphics', 'Показывать FPS и пинг', 'Счётчик кадров и задержки в углу экрана', true);
    this.toggle(c, () => s.showStats, (v) => { s.showStats = v; });
  }

  private sound(): void {
    const s = this.s;
    // отпустили ползунок — пример его звука: музыка — фраза, окружение — волна, эффекты — щелчок, интерфейс — «дзынь»
    const hear = (k: MixPreview) => () => this.hooks.preview?.(k);
    let c = this.item('sound', 'Общая громкость', 'Музыка, окружение, эффекты и интерфейс. Голоса — своим ползунком ниже');
    // без звука ползунок стоит на нуле и подписан «выкл» (сама громкость цела); двигают его — значит, хотят слышать
    this.slider(c, 'Общая громкость', 0, 1, 0.05, () => effectiveVolume(s), (v) => {
      s.volume = v;
      if (v > 0) s.muted = false;
    }, () => (s.muted ? 'выкл' : pct(s.volume)), hear('ui'));
    c = this.item('sound', 'Без звука', TOUCH ? 'Громкость останется прежней' : 'Клавиша M — в любой момент игры', true);
    this.toggle(c, () => s.muted, (v) => {
      if (v !== s.muted) toggleMute(s);
    });
    c = this.item('sound', 'Музыка', 'Музыкальный автомат на площади: песня играет на всю набережную, у автомата — громче');
    this.slider(c, 'Музыка', 0, 1, 0.05, () => s.musicVolume, (v) => { s.musicVolume = v; }, () => pct(s.musicVolume), hear('music'));
    c = this.item('sound', 'Окружение', 'Море, чайки, ветер, дождь и гром');
    this.slider(c, 'Окружение', 0, 1, 0.05, () => s.ambVolume, (v) => { s.ambVolume = v; }, () => pct(s.ambVolume), hear('amb'));
    c = this.item('sound', 'Эффекты', 'Выстрелы, шаги, моторы, удары');
    this.slider(c, 'Эффекты', 0, 1, 0.05, () => s.sfxVolume, (v) => { s.sfxVolume = v; }, () => pct(s.sfxVolume), hear('sfx'));
    c = this.item('sound', 'Интерфейс', 'Кнопки, уведомления, монетки');
    this.slider(c, 'Интерфейс', 0, 1, 0.05, () => s.uiVolume, (v) => { s.uiVolume = v; }, () => pct(s.uiVolume), hear('ui'));
    c = this.item('sound', 'Голоса игроков', 'Голосовой чат, всех сразу — та же громкость, что во вкладке «Голос»');
    this.slider(c, 'Голоса игроков', 0, 1, 0.01, () => voiceVolume(), (v) => setVoiceVolume(v), () => pct(voiceVolume()));
    c = this.item('sound', 'Голосовой чат', 'Громкость каждого, микрофон и его проверка');
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
    let c = this.item('interface', 'Размер интерфейса', 'Меню, чат, жетоны, «кто где» и уведомления');
    this.choice<number>(c, 'Размер интерфейса', UI_SCALES.map((k) => [k, `${Math.round(k * 100)}%`] as const), () => s.uiScale, (v) => { s.uiScale = v; });
    c = this.item('interface', 'Сообщения чата', TOUCH ? 'Скрытые видно, пока чат открыт (💬)' : 'Скрытые видно, пока чат открыт (Enter)');
    this.choice<ChatFeed>(c, 'Сообщения чата', [['fade', 'Гаснут'], ['keep', 'Видны всегда'], ['hide', 'Скрыты']], () => s.chatFeed, (v) => { s.chatFeed = v; });
  }

  // ------------------------------------------------------------ кирпичики

  /** Строка: название и пояснение слева, управление справа (возвращает место для него). whole — вся строка нажимается */
  private item(cat: SettingsCategory, title: string, hint: string, whole = false): HTMLElement {
    const row = this.cats.get(cat)!.appendChild(el(whole ? 'label' : 'div', 'set-item'));
    const text = row.appendChild(el('div', 'set-text'));
    text.appendChild(el('b', '', title));
    if (hint) text.appendChild(el('small', '', hint));
    return row.appendChild(el('div', 'set-ctl'));
  }

  /** release — ползунок отпустили (мышь, палец, стрелки): например, пример звука */
  private slider(ctl: HTMLElement, name: string, min: number, max: number, step: number, get: () => number, set: (v: number) => void, text: () => string, release?: () => void): void {
    const input = el('input', '') as HTMLInputElement;
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.setAttribute('aria-label', name);
    const val = el('b', 'set-num');
    input.addEventListener('input', () => {
      set(Number(input.value));
      val.textContent = text();
      this.hooks.onChange();
    });
    if (release) input.addEventListener('change', release);
    input.addEventListener('keydown', ownKeys);
    ctl.append(input, val);
    this.syncs.push(() => {
      const v = String(get());
      if (input.value !== v) input.value = v;
      val.textContent = text();
    });
  }

  private toggle(ctl: HTMLElement, get: () => boolean, set: (v: boolean) => void): void {
    const sw = ctl.appendChild(el('span', 'sw'));
    const input = sw.appendChild(el('input', '')) as HTMLInputElement;
    input.type = 'checkbox';
    sw.appendChild(el('i', ''));
    input.addEventListener('change', () => {
      set(input.checked);
      this.hooks.onChange();
    });
    input.addEventListener('keydown', ownKeys);
    this.syncs.push(() => {
      input.checked = get();
    });
  }

  /** Выбор из нескольких: ряд кнопок, нажатая — светлая */
  private choice<T>(ctl: HTMLElement, name: string, options: ReadonlyArray<readonly [T, string]>, get: () => T, set: (v: T) => void): void {
    const group = ctl.appendChild(el('div', 'seg'));
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', name);
    const buttons = options.map(([value, label]) => {
      const b = group.appendChild(el('button', '', label)) as HTMLButtonElement;
      b.type = 'button';
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
    const b = ctl.appendChild(el('button', 'btn ghost set-link', label)) as HTMLButtonElement;
    b.type = 'button';
    b.addEventListener('click', go);
  }
}

/** Размер интерфейса, сообщения чата и подсказки клавиш — переменной CSS и атрибутами на <html> (стили — menu.css) */
export function applyInterface(s: Pick<Settings, 'uiScale' | 'chatFeed' | 'keyHints'>): void {
  const root = document.documentElement;
  root.style.setProperty('--ui-scale', String(s.uiScale));
  root.dataset.chat = s.chatFeed;
  root.dataset.hints = s.keyHints ? 'on' : 'off';
}

/** Стрелки двигают ползунок — игре не отдаём. M (звук) и Esc (меню) пропускаем: фокус после клика остаётся тут */
function ownKeys(e: KeyboardEvent): void {
  if (e.code !== 'KeyM' && e.code !== 'Escape') e.stopPropagation();
}

const pct = (v: number): string => `${Math.round(v * 100)}%`;

function el(tag: string, cls: string, text = ''): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

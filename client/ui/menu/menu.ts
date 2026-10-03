// Меню игры (Esc, на телефоне ☰): слева «Продолжить» и разделы — профиль, настройки по категориям, справка
// «Клавиши»; справа — выбранный раздел. Игра за меню идёт дальше: это онлайн, пауз нет. Захват мыши, сеть и сцены —
// у App (client/app.ts); здесь вид, разделы и вуаль «Кликни, чтобы играть»: Esc прячет меню сразу, а мышь браузер
// отдаёт только по клику (Esc — не жест пользователя).
import type { GiftResultCode } from '../../../shared/gifts.ts';
import type { RoomKind } from '../../../shared/messages.ts';
import type { MixPreview } from '../../audio.ts';
import type { Settings } from '../../settings.ts';
import { TOUCH } from '../../touch.ts';
import type { ProfilePanel } from '../profile.ts';
import { mountVoicePanel } from '../voicepanel.ts';
import { GiftForm } from './gift.ts';
import { keysHelp } from './keys.ts';
import { SettingsPanel, type SettingsCategory } from './settings-panel.ts';
import './menu.css';

export { applyInterface } from './settings-panel.ts';

export type MenuSection = 'overview' | 'records' | 'collection' | 'codes' | SettingsCategory | 'voice' | 'keys';

const NAV: ReadonlyArray<readonly [group: string, items: ReadonlyArray<readonly [MenuSection, string]>]> = [
  ['Профиль', [['overview', 'Обзор'], ['records', 'Рекорды'], ['collection', 'Коллекция'], ['codes', 'Подарки и коды']]],
  ['Настройки', [['graphics', 'Графика'], ['sound', 'Звук'], ['voice', 'Голос'], ['controls', 'Управление'], ['interface', 'Интерфейс']]],
  ['Справка', [['keys', 'Клавиши']]],
];

const HEAD: Record<MenuSection, readonly [title: string, lead: string]> = {
  overview: ['Профиль', 'Ник, жетоны и уровень. С уровнем растёт рамка ника'],
  records: ['Рекорды', 'Лучшие результаты и счёт по режимам — считает сервер'],
  collection: ['Коллекция', TOUCH ? 'Рыбы и находки. На набережной журнал рыбака — кнопка 📖' : 'Рыбы и находки. На набережной журнал рыбака — клавиша J'],
  codes: ['Подарки и коды', 'Подарочный код, вход с другого устройства, примерочная'],
  graphics: ['Графика', 'Качество картинки, угол обзора, счётчик кадров'],
  sound: ['Звук', 'Общая громкость, музыка, окружение, эффекты, интерфейс и голоса'],
  voice: ['Голос', 'Голосовой чат: включить, проверить микрофон, кого слышно'],
  controls: ['Управление', TOUCH ? 'Обзор пальцем, прицел, инверсия' : 'Мышь, прицел, инверсия'],
  interface: ['Интерфейс', 'Размер меню и чата, сообщения чата'],
  keys: ['Клавиши', TOUCH ? 'Кнопки на экране' : 'Коротко: что на какой клавише'],
};

const PROFILE: ReadonlySet<MenuSection> = new Set<MenuSection>(['overview', 'records', 'collection', 'codes']);
const SETTINGS: ReadonlySet<MenuSection> = new Set<MenuSection>(['graphics', 'sound', 'controls', 'interface']);

export interface MenuActions {
  /** «Продолжить», ✕, клик мимо карточки и по вуали — в игру (захват мыши — в этом же клике) */
  resume(): void;
  /** «На набережную» из режима */
  toLobby(): void;
  /** «Выйти из игры» — на экран входа */
  leave(): void;
  /** Виден раздел профиля (true) или другой (false): App обновляет профиль или сбрасывает код и поле ника */
  profile(open: boolean): void;
  redeem(code: string): void;
  /** Настройку поменяли: применить и запомнить */
  changed(): void;
  /** Ползунок громкости отпустили: короткий пример звука его шины */
  preview?(kind: MixPreview): void;
  /** Где игрок сейчас: подарочный код принимают только на набережной */
  room(): RoomKind;
  /** Подарочные коды включены на сервере */
  gifts(): boolean;
}

export class GameMenu {
  readonly root: HTMLElement;
  /** Подпись под заголовком: что с комнатой, пока ты в меню (App.refreshPause) */
  readonly sub: HTMLElement;
  /** Только в режимах (App.refreshPause прячет на набережной) */
  readonly toLobbyBtn: HTMLButtonElement;
  readonly settings: SettingsPanel;
  /** Где живут нынешние настройки голоса (client/ui/voice.ts), пока вкладка «Голос» закрыта */

  private readonly actions: MenuActions;
  private readonly hint: HTMLElement;
  private readonly veilHint: HTMLElement;
  private readonly title: HTMLElement;
  private readonly lead: HTMLElement;
  private readonly body: HTMLElement;
  private readonly tabs = new Map<MenuSection, HTMLButtonElement>();
  private readonly panes = new Map<string, HTMLElement>();
  private readonly voiceRoot: HTMLElement;
  private readonly gift: GiftForm;
  private section: MenuSection = 'overview';
  private shown = false;
  private veil = false;
  private voiceOff: (() => void) | null = null;

  constructor(profile: ProfilePanel, settings: Settings, actions: MenuActions) {
    this.actions = actions;
    this.root = el('div', 'screen pause');
    this.root.innerHTML = `
      <div class="mn-card" role="dialog" aria-modal="true" aria-labelledby="mn-title">
        <aside class="mn-side">
          <div class="mn-head">
            <div class="mn-name">Меню</div>
            <div class="mn-sub"></div>
          </div>
          <button class="btn primary mn-resume" type="button">Продолжить</button>
          <div class="mn-hint" role="status"></div>
          <nav class="mn-nav" aria-label="Разделы меню"></nav>
          <div class="mn-exit">
            <button class="btn ghost mn-lobby" type="button">На набережную</button>
            <button class="btn ghost mn-leave" type="button">Выйти из игры</button>
          </div>
        </aside>
        <section class="mn-main">
          <header class="mn-top">
            <div class="mn-top-text">
              <h2 class="mn-title" id="mn-title"></h2>
              <p class="mn-lead"></p>
            </div>
            <button class="mn-x" type="button" aria-label="Закрыть меню" title="${TOUCH ? 'Закрыть' : 'Закрыть (Esc)'}">✕</button>
          </header>
          <div class="mn-body"></div>
        </section>
      </div>
      <div class="mn-veil">
        <b>Кликни, чтобы играть</b>
        <span>Esc — меню</span>
        <i class="mn-veil-hint"></i>
      </div>`;
    const q = <T extends HTMLElement>(sel: string): T => this.root.querySelector<T>(sel)!;
    this.sub = q('.mn-sub');
    this.hint = q('.mn-hint');
    this.veilHint = q('.mn-veil-hint');
    this.title = q('.mn-title');
    this.lead = q('.mn-lead');
    this.body = q('.mn-body');
    this.toLobbyBtn = q<HTMLButtonElement>('.mn-lobby');


    const nav = q('.mn-nav');
    for (const [group, items] of NAV) {
      const g = nav.appendChild(el('div', 'mn-group'));
      g.appendChild(el('div', 'mn-group-h', group));
      for (const [id, name] of items) {
        const b = g.appendChild(el('button', 'mn-tab', name)) as HTMLButtonElement;
        b.type = 'button';
        b.addEventListener('click', () => this.show(id));
        this.tabs.set(id, b);
      }
    }

    this.gift = new GiftForm((code) => actions.redeem(code), () => [actions.gifts(), actions.room() === 'lobby']);
    this.settings = new SettingsPanel(settings, { onChange: () => actions.changed(), go: (s) => this.show(s), preview: (k) => actions.preview?.(k) });
    this.voiceRoot = el('div', 'mn-voice');
    this.pane('overview', profile.overview);
    this.pane('records', profile.records);
    this.pane('collection', profile.collection);
    this.pane('codes', codes(this.gift.root, profile.device));
    this.pane('settings', this.settings.root);
    this.pane('voice', this.voiceRoot);
    this.pane('keys', keysHelp());

    q('.mn-resume').addEventListener('click', () => actions.resume());
    q('.mn-x').addEventListener('click', () => actions.resume());
    this.toLobbyBtn.addEventListener('click', () => actions.toLobby());
    q('.mn-leave').addEventListener('click', () => actions.leave());
    // клик мимо карточки и по вуали — тоже «Продолжить»
    this.root.addEventListener('mousedown', (e) => {
      if (e.button === 0 && (e.target === this.root || this.veil)) actions.resume();
    });
    this.show(this.section);
  }

  get isOpen(): boolean {
    return this.shown;
  }

  /** Меню спрятано вуалью «Кликни, чтобы играть» (после Esc) */
  get veiled(): boolean {
    return this.veil;
  }

  /** Открыть или закрыть (App.setPaused). Открываем на том разделе, где остановились. */
  setOpen(open: boolean): void {
    if (open === this.shown) return;
    this.shown = open;
    this.root.classList.toggle('show', open);
    this.setVeil(false);
    if (open) {
      this.body.scrollTop = 0;
      this.revealTab();
      this.enter(this.section);
    } else {
      this.leave(this.section);
      this.gift.reset();
      this.setHint('');
      this.dropFocus();
    }
  }

  /** Перейти к разделу (и открыть меню, если надо — это делает App) */
  show(section: MenuSection): void {
    const was = this.section;
    this.section = section;
    for (const [id, b] of this.tabs) {
      if (id === section) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    }
    const [title, lead] = HEAD[section];
    this.title.textContent = title;
    this.lead.textContent = lead;
    const key = SETTINGS.has(section) ? 'settings' : section;
    for (const [k, p] of this.panes) p.hidden = k !== key;
    if (SETTINGS.has(section)) this.settings.show(section as SettingsCategory);
    this.body.scrollTop = 0;
    if (!this.shown) return;
    this.revealTab();
    if (was !== section) this.leave(was);
    this.enter(section);
  }

  /** Esc: спрятать меню вуалью или вернуть его */
  setVeil(on: boolean): void {
    if (on === this.veil) return;
    this.veil = on;
    this.root.classList.toggle('veil', on);
    if (on) this.dropFocus();
  }

  /** Подсказка про мышь (браузер не отдал захват) — и в меню, и на вуали */
  setHint(text: string): void {
    this.hint.textContent = text;
    this.veilHint.textContent = text;
  }

  /** Настройки вернулись с экрана входа — на своё место в меню */
  adoptSettings(): void {
    const pane = this.panes.get('settings')!;
    if (this.settings.root.parentElement !== pane) pane.append(this.settings.root);
    if (SETTINGS.has(this.section)) this.settings.show(this.section as SettingsCategory);
  }

  /** Ответ сервера на подарочный код */
  giftResult(r: GiftResultCode): void {
    this.gift.result(r);
  }

  // ------------------------------------------------------------ разделы

  private pane(key: string, ...content: Node[]): void {
    const p = this.body.appendChild(el('div', `mn-pane mn-pane-${key}`));
    p.hidden = true;
    p.append(...content);
    this.panes.set(key, p);
  }

  /** Раздел стал виден в открытом меню */
  private enter(section: MenuSection): void {
    if (section === 'voice' && !this.voiceOff) this.voiceOff = mountVoicePanel(this.voiceRoot);
    if (section === 'codes') this.gift.configure(this.actions.gifts(), this.actions.room() === 'lobby');
    this.actions.profile(PROFILE.has(section));
  }

  /** Раздел скрыли (ушли с него или закрыли меню) */
  private leave(section: MenuSection): void {
    if (section === 'voice' && this.voiceOff) {
      this.voiceOff();
      this.voiceOff = null;
    }
  }

  /** На телефоне разделы — полосой с прокруткой: выбранный должен быть виден (например, «Голос» из «Звука») */
  private revealTab(): void {
    this.tabs.get(this.section)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  /** Фокус не должен остаться в поле меню: иначе после закрытия буквы уйдут в скрытое поле, а не игре */
  private dropFocus(): void {
    const a = document.activeElement as HTMLElement | null;
    if (a && a !== document.body && this.root.contains(a)) a.blur();
  }
}

/** «Подарки и коды»: подарочный код, вход с другого устройства, где примерочная */
function codes(gift: HTMLElement, device: HTMLElement): HTMLElement {
  const wrap = el('div', 'mn-codes');
  const box = (title: string, text: string, ...content: Node[]) => {
    const b = wrap.appendChild(el('div', 'mn-box'));
    b.appendChild(el('h3', '', title));
    b.appendChild(el('p', '', text));
    b.append(...content);
  };
  box('Подарочный код', 'Есть код от друзей или с события? Введи его — подарок сразу появится в гардеробе.', gift);
  box('Вход с другого устройства', 'Играешь и с компьютера, и с телефона? Возьми код здесь и введи его на другом устройстве: «У меня есть код». Код одноразовый и действует несколько минут.', device);
  box('Примерочная', 'Купленные и подаренные вещи надеваются в ларьке «Примерочная» у воды на набережной: подойди к зеркалу и нажми E.');
  return wrap;
}

function el(tag: string, cls: string, text = ''): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

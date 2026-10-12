// Меню игры (Esc, на телефоне ☰): окно кита (.k-window--split в .k-scrim, как на странице lab/ui «Меню Esc»). Слева —
// «Продолжить», «На набережную» (в режимах) и разделы: профиль, настройки по категориям, справка «Клавиши»; справа —
// выбранный раздел. «Продолжить» и «На набережную» закреплены вверху, «Выйти из игры» — внизу: прокручивается только
// список разделов. Игра за меню идёт дальше: это онлайн, пауз нет. Захват мыши, сеть и сцены — у App (client/app.ts);
// здесь вид, разделы и вуаль «Кликни, чтобы играть»: Esc прячет меню сразу, а мышь браузер отдаёт только по клику
// (Esc — не жест пользователя).
import type { GiftResultCode } from '../../../shared/gifts.ts';
import type { RoomKind } from '../../../shared/messages.ts';
import type { MixPreview } from '../../audio.ts';
import type { GfxState } from '../../render/gfx.ts';
import type { Settings } from '../../settings.ts';
import { TOUCH } from '../../touch.ts';
import { iconImg, keyHtml } from '../kit/dom.ts';
import { sfx } from '../kit/sfx.ts';
import type { ProfilePanel } from '../profile.ts';
import { mountVoicePanel } from '../voicepanel.ts';
import { GiftForm } from './gift.ts';
import { el } from './controls.ts';
import { keysHelp } from './keys.ts';
import { SettingsPanel, type SettingsCategory } from './settings-panel.ts';
import './menu.css';

export { applyInterface } from './settings-panel.ts';

export type MenuSection = 'overview' | 'records' | 'collection' | 'codes' | SettingsCategory | 'voice' | 'keys';

/** Разделы слева: значок (client/assets/ui/icons), название */
const NAV: ReadonlyArray<readonly [group: string, items: ReadonlyArray<readonly [MenuSection, icon: string, name: string]>]> = [
  ['Профиль', [['overview', 'level', 'Обзор'], ['records', 'records', 'Рекорды'], ['collection', 'collection', 'Коллекция'], ['codes', 'gift', 'Подарки и коды']]],
  ['Настройки', [['graphics', 'camera', 'Графика'], ['sound', 'sound', 'Звук'], ['voice', 'voice', 'Голос'], ['controls', 'settings', 'Управление'], ['interface', 'chat', 'Интерфейс']]],
  ['Справка', [['keys', 'keys', 'Клавиши']]],
];

/** Шапка раздела: группа над названием (как в lab/ui) */
const HEAD: Record<MenuSection, readonly [group: string, title: string]> = {
  overview: ['Профиль', 'Обзор'],
  records: ['Профиль', 'Рекорды'],
  collection: ['Профиль', 'Коллекция'],
  codes: ['Профиль', 'Подарки и коды'],
  graphics: ['Настройки', 'Графика'],
  sound: ['Настройки', 'Звук'],
  voice: ['Настройки', 'Голос'],
  controls: ['Настройки', 'Управление'],
  interface: ['Настройки', 'Интерфейс'],
  keys: ['Справка', 'Клавиши'],
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
  /** Что в графике действует сейчас (пресет, «Своё» или «Авто» с текущим разрешением) — пункты меню показывают это */
  gfx(): GfxState;
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
  private readonly eyebrow: HTMLElement;
  private readonly title: HTMLElement;
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
    // корень остаётся «экраном» #menus, само окно — в слое кита .k-scrim (масштаб --hud-k, затемнение)
    this.root.innerHTML = `
      <div class="k-scrim mn-scrim">
        <div class="k-window k-window--lg k-window--split mn-window" role="dialog" aria-modal="true" aria-labelledby="mn-title">
          <aside class="k-win-side">
            <div class="mn-head">
              <h2 class="k-win-title">Меню</h2>
              <p class="mn-sub"></p>
            </div>
            <button class="k-btn k-btn--go k-btn--wide mn-resume" type="button">Продолжить${TOUCH ? '' : keyHtml('Esc', 'tr')}</button>
            <button class="k-btn k-btn--info k-btn--sm k-btn--wide mn-lobby" type="button">На набережную</button>
            <div class="mn-hint" role="status"></div>
            <nav class="k-nav mn-nav" aria-label="Разделы меню"></nav>
            <button class="k-btn k-btn--ghost k-btn--sm k-btn--wide mn-leave" type="button"><span class="k-row-line">${iconImg('exit')}Выйти из игры</span></button>
          </aside>
          <section class="k-win-main">
            <header class="k-win-head">
              <div class="k-win-titles">
                <p class="k-eyebrow mn-eyebrow"></p>
                <h2 class="k-win-title" id="mn-title"></h2>
              </div>
              <div class="k-win-tools"><button class="k-close mn-x" type="button" aria-label="Закрыть меню">${TOUCH ? '' : keyHtml('Esc', undefined, 'sm')}</button></div>
            </header>
            <div class="k-win-body mn-body"></div>
          </section>
        </div>
        <div class="k-panel mn-veil">
          <b>Кликни, чтобы играть</b>
          <span>${TOUCH ? 'Меню — ☰' : `${keyHtml('Esc', undefined, 'sm')} — меню`}</span>
          <i class="mn-veil-hint"></i>
        </div>
      </div>`;
    const q = <T extends HTMLElement>(sel: string): T => this.root.querySelector<T>(sel)!;
    this.sub = q('.mn-sub');
    this.hint = q('.mn-hint');
    this.veilHint = q('.mn-veil-hint');
    this.eyebrow = q('.mn-eyebrow');
    this.title = q('#mn-title');
    this.body = q('.mn-body');
    this.toLobbyBtn = q<HTMLButtonElement>('.mn-lobby');

    const nav = q('.mn-nav');
    for (const [group, items] of NAV) {
      nav.appendChild(el('p', 'k-nav-h', group));
      for (const [id, icon, name] of items) {
        const b = nav.appendChild(el('button', 'k-nav-item')) as HTMLButtonElement;
        b.type = 'button';
        b.dataset.sfx = 'tick';
        b.insertAdjacentHTML('beforeend', iconImg(icon));
        b.append(name);
        b.addEventListener('click', () => this.show(id));
        this.tabs.set(id, b);
      }
    }

    this.gift = new GiftForm((code) => actions.redeem(code), () => [actions.gifts(), actions.room() === 'lobby']);
    this.settings = new SettingsPanel(settings, { onChange: () => actions.changed(), gfx: () => actions.gfx(), go: (s) => this.show(s), preview: (k) => actions.preview?.(k) });
    this.voiceRoot = el('div', 'mn-voice');
    this.pane('overview', profile.overview);
    this.pane('records', profile.records);
    this.pane('collection', profile.collection);
    this.pane('codes', codes(this.gift.root));
    this.pane('settings', this.settings.root);
    this.pane('voice', this.voiceRoot);
    this.pane('keys', keysHelp());

    q('.mn-resume').addEventListener('click', () => actions.resume());
    q('.mn-x').addEventListener('click', () => actions.resume());
    this.toLobbyBtn.addEventListener('click', () => actions.toLobby());
    q('.mn-leave').addEventListener('click', () => actions.leave());
    // клик мимо окна и по вуали — тоже «Продолжить»
    this.root.addEventListener('mousedown', (e) => {
      if (e.button === 0 && (e.target === this.root || (e.target as Element).classList.contains('k-scrim') || this.veil)) actions.resume();
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
    sfx.play(open ? 'open' : 'close');
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
      b.classList.toggle('is-on', id === section);
      if (id === section) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    }
    const [group, title] = HEAD[section];
    this.eyebrow.textContent = group;
    this.title.textContent = title;
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

/** «Подарки и коды»: подарочный код и где примерочная (код для входа с другого устройства — в «Обзоре», как на странице lab/ui) */
function codes(gift: HTMLElement): HTMLElement {
  const wrap = el('div', 'mn-codes');
  const box = (icon: string, title: string, text: string, ...content: Node[]) => {
    const b = wrap.appendChild(el('div', 'k-cell mn-box'));
    const head = b.appendChild(el('div', 'mn-box-head'));
    head.insertAdjacentHTML('beforeend', iconImg(icon));
    const t = head.appendChild(el('div', 'mn-box-text'));
    t.appendChild(el('div', 'k-row-title', title));
    t.appendChild(el('div', 'k-row-hint', text));
    b.append(...content);
  };
  box('gift', 'Подарочный код', 'Есть код от друзей или с события? Введи его — подарок сразу появится в гардеробе.', gift);
  box('wardrobe', 'Примерочная', 'Купленные и подаренные вещи надеваются в ларьке «Примерочная» у воды на набережной: подойди к зеркалу и нажми E.');
  return wrap;
}

// Рыбалка на ките UI 2.0 — общее для экранов рыбалки (эталон — lab/ui/screens/fishing.js): окно-диалог .k-scrim/.k-window,
// шапка окна, вкладки, ярлык категории, картинки снастей и портреты торговцев. Стили — fishkit.css.
// Окно — нативный <dialog> (showModal: фокус внутри, игра под ним инертна, Esc — событие cancel), сам <dialog> — затемнение
// .k-scrim (свой слой, zoom --hud-k), внутри — .k-window. Закрыть мышью — .k-close в шапке или клик по затемнению.
import { TIER_CSS, TIER_NAMES } from '../../shared/fishrules.ts';
import { keyHtml } from '../ui/kit/dom.ts';
import type { HudSlots } from '../ui/kit/slots.ts';
import { escHtml as esc, type TopCenter } from '../ui/kit/topcenter.ts';
import './fishkit.css';

/** Слоты HUD кита и верх-центр — для частей рыбалки, лодки, радио и рулетки */
export interface FishKitUi {
  slots: HudSlots;
  top: TopCenter;
}


/** Картинки снастей и лодок: client/assets/{fishshop,rods,ownboats,poseidon}/ — по имени файла без расширения */
const GEAR = import.meta.glob('../assets/{fishshop,rods,ownboats,poseidon}/*.{webp,png,jpg}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const GEAR_BY: Record<string, string> = {};
for (const [p, url] of Object.entries(GEAR)) {
  const dir = p.split('/').at(-2) ?? '';
  const name = p.slice(p.lastIndexOf('/') + 1).replace(/\.(webp|png|jpg)$/, '');
  GEAR_BY[`${dir}/${name}`] = url;
}
/** gearUrl('fishshop/beer'), gearUrl('rods/advanced'), gearUrl('ownboats/volzhanka'), gearUrl('poseidon/poseidon'); нет — '' */
export function gearUrl(id: string): string {
  return GEAR_BY[id] ?? '';
}

export interface FishDialog {
  /** <dialog class="k-scrim fi-dlg"> — showModal()/close() как раньше */
  dlg: HTMLDialogElement;
  /** <section class="k-window …"> внутри */
  win: HTMLElement;
}

/**
 * Окно рыбалки: <dialog class="k-scrim fi-dlg" data-mode="fishing"><section class="k-window fi-win {cls}">. Клик по
 * затемнению мимо окна — как Esc (событие cancel → закрыть, если его не отменили). cls — 'k-window--lg' и своё.
 */
export function fishDialog(parent: HTMLElement, cls = ''): FishDialog {
  const dlg = document.createElement('dialog');
  dlg.className = 'k-scrim fi-dlg';
  dlg.dataset.mode = 'fishing';
  const win = dlg.appendChild(document.createElement('section'));
  win.className = `k-window fi-win${cls ? ` ${cls}` : ''}`;
  dlg.addEventListener('pointerdown', (e) => {
    if (e.target !== dlg) return;
    const ev = new Event('cancel', { cancelable: true });
    if (dlg.dispatchEvent(ev)) dlg.close();
  });
  parent.appendChild(dlg);
  return { dlg, win };
}

/** Окно появилось: анимация .is-in заново */
export function winIn(win: HTMLElement): void {
  win.classList.remove('is-in');
  void win.offsetWidth;
  win.classList.add('is-in');
}

/**
 * Шапка окна (как на странице lab/ui): портрет (готовая разметка <img>), надзаголовок, заголовок, реплика торговца,
 * справа — свои инструменты (готовая разметка) и крестик с колпачком Esc (.k-close — повесь на него закрытие).
 * Текст экранируется; portrait и tools — своя разметка.
 */
export function winHeadHtml(o: { portrait?: string; eyebrow: string; title: string; say?: string; tools?: string }): string {
  return `<header class="k-win-head">${o.portrait ? `<span class="k-win-portrait">${o.portrait}</span>` : ''}`
    + `<div class="k-win-titles"><p class="k-eyebrow">${esc(o.eyebrow)}</p><h2 class="k-win-title">${esc(o.title)}</h2>${o.say ? `<p class="fi-say">${esc(o.say)}</p>` : ''}</div>`
    + `<div class="k-win-tools">${o.tools ?? ''}<button type="button" class="k-close" aria-label="Закрыть">${keyHtml('Esc', undefined, 'sm')}</button></div></header>`;
}

/** Строка вкладок: [id, адрес иконки, подпись, счётчик?]; on — выбранная. Клик — data-tab на кнопке. */
export function tabsHtml(list: ReadonlyArray<readonly [string, string, string, (string | number | null)?]>, on: string): string {
  return `<nav class="k-tabs" role="tablist">${list.map(([id, img, label, count]) => `<button type="button" role="tab" class="k-tab${id === on ? ' is-on' : ''}" data-tab="${esc(id)}" aria-selected="${id === on}">`
    + `${img ? `<img class="k-ic" src="${img}" alt="">` : ''}${esc(label)}${count != null && count !== '' ? ` <span class="k-tab-count">${esc(String(count))}</span>` : ''}</button>`).join('')}</nav>`;
}

/** Ярлык категории рыбы: сплошной цвет категории (TIER_CSS), подпись — TIER_NAMES или своя */
export function tierHtml(tier: number, text?: string, lg = false): string {
  return `<span class="fi-tier${lg ? ' fi-tier--lg' : ''}" style="--tc:${TIER_CSS[tier] ?? TIER_CSS[0]}">${esc(text ?? TIER_NAMES[tier] ?? '')}</span>`;
}

/** Портрет торговца в шапке окна: Семён — кадр из игры, Саня и Игнат — пока значки (lab/ui: портреты — TODO) */
const PORTRAITS = import.meta.glob('../assets/fishshop/portraits/*.jpg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export function portraitUrl(id: string): string {
  for (const [p, url] of Object.entries(PORTRAITS)) if (p.endsWith(`/${id}.jpg`)) return url;
  return '';
}

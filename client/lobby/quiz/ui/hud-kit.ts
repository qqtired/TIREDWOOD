// «Ракушка»: откуда HUD берёт слоты и верх-центр кита. Интегратор может передать их вторым аргументом QuizHud
// ({ slots, top, audio }, как режимам фермы и самолёта: d.ui.slots, d.ui.top). Не передал — находим в странице по классам
// кита (.k-hud, .k-slot--*, .k-hud--top): слоты те же, а плашка кладётся в слот tc сама (DomPlate), без стопки тостов.
import type { HudSlots } from '../../../ui/kit/slots.ts';
import type { TcEvent, TopCenter } from '../../../ui/kit/topcenter.ts';
import type { AudioKit } from './hud-sound.ts';

export interface QuizHudKit {
  slots: HudSlots;
  top: TopCenter;
  /** Шина «Интерфейс» игры: () => sound.kit. Без неё звуки идут через общий sfx кита (ближайшие по смыслу) */
  audio?: () => AudioKit | null;
}

/** Что HUD берёт у слотов кита */
export interface SlotsLike {
  root: HTMLElement;
  tl: HTMLElement;
  tc: HTMLElement;
  bl: HTMLElement;
  bc: HTMLElement;
  br: HTMLElement;
}

/** Плашка верх-центра: TopCenter или запасной вариант */
export interface PlateHost {
  root: HTMLElement;
  event(e: TcEvent): void;
  clear(key: string): void;
}

export interface ResolvedKit {
  slots: SlotsLike;
  top: PlateHost;
  /** оболочка HUD (#hud): в неё кладётся слой полёта строк */
  shell: HTMLElement;
  audio?: () => AudioKit | null;
}

/** Обновить плашку на месте: меняются только верхние узлы, что изменились (как в topcenter.ts) */
function morph(box: HTMLElement, html: string): void {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const next = Array.from(tpl.content.childNodes);
  const prev = Array.from(box.childNodes);
  if (next.length !== prev.length) {
    box.replaceChildren(...next);
    return;
  }
  next.forEach((n, i) => { if (!prev[i].isEqualNode(n)) prev[i].replaceWith(n); });
}

/** Запасная плашка: один .k-event в слоте tc, пока TopCenter не передали */
class DomPlate implements PlateHost {
  readonly root: HTMLElement;
  private ev: HTMLElement | null = null;
  private key = '';

  constructor(root: HTMLElement) {
    this.root = root;
  }

  event(e: TcEvent): void {
    if (!this.ev || this.key !== e.key) {
      this.ev?.remove();
      this.ev = document.createElement('div');
      this.ev.setAttribute('role', 'status');
      this.root.prepend(this.ev);
      this.key = e.key;
    }
    const cls = `k-event${e.tone ? ` k-event--${e.tone}` : ''}${e.lamp ? ' k-lamp' : ''}${e.prio < 80 ? ' is-minor' : ''}`;
    if (this.ev.className !== cls) this.ev.className = cls;
    morph(this.ev, e.html);
  }

  clear(key: string): void {
    if (this.key !== key) return;
    this.ev?.remove();
    this.ev = null;
    this.key = '';
  }
}

/** Слоты и верх-центр: переданные или найденные в странице; null — HUD кита ещё не построен */
export function resolveKit(kit?: QuizHudKit): ResolvedKit | null {
  if (kit) return { slots: kit.slots, top: kit.top, shell: kit.slots.root.parentElement ?? document.body, audio: kit.audio };
  const root = document.querySelector<HTMLElement>('.k-hud:not(.k-hud--top)');
  const topLayer = document.querySelector<HTMLElement>('.k-hud--top');
  if (!root) return null;
  const slot = (name: string, layer: HTMLElement | null = root): HTMLElement | null => layer?.querySelector<HTMLElement>(`:scope > .k-slot--${name}`) ?? null;
  const tl = slot('tl'), bl = slot('bl'), bc = slot('bc'), br = slot('br'), tc = slot('tc', topLayer);
  if (!tl || !bl || !bc || !br || !tc) return null;
  return { slots: { root, tl, tc, bl, bc, br }, top: new DomPlate(tc), shell: root.parentElement ?? document.body };
}

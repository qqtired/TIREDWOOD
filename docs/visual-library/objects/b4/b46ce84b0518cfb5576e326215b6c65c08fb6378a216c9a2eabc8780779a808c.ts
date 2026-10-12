// Слоты HUD (кит 2.0, lab/ui/kit/KIT.md §2): слой .k-hud в #hud (масштаб — zoom: var(--hud-k)) и места:
// tl — статус режима / FPS · tr — бейдж игрока (Badge) и плитки · bl — чат с голосом · bc — подсказка действия ·
// br — эмоции, карточка улова · c — крупный баннер, отсчёт · tcUnder — панели режимов под стопкой верх-центра (набег пиратов).
// tc — плашка события и тосты (TopCenter) — в своём слое .k-hud--top над меню (#menus): голосование, «связь пропала»
// и тосты видны и на паузе, кнопки голосования нажимаются мышью при открытом меню.
// Части режимов кладутся в слоты, а не position: absolute по экрану. Окна (.k-scrim) — не сюда: двойной zoom.
export class HudSlots {
  readonly root: HTMLElement;
  /** Слой верх-центра над меню */
  readonly top: HTMLElement;
  readonly tl: HTMLElement;
  readonly tc: HTMLElement;
  /** Под стопкой верх-центра (в #hud, под меню): встаёт ниже плашки и тостов (--tc-stack от TopCenter) */
  readonly tcUnder: HTMLElement;
  readonly tr: HTMLElement;
  readonly bl: HTMLElement;
  readonly bc: HTMLElement;
  readonly br: HTMLElement;
  readonly c: HTMLElement;

  /** host — #hud; topHost — куда класть слой верх-центра (document.body: после #menus и выше него) */
  constructor(host: HTMLElement, topHost: HTMLElement = host) {
    this.root = document.createElement('div');
    this.root.className = 'k-hud';
    this.top = document.createElement('div');
    this.top.className = 'k-hud k-hud--top';
    const slot = (name: string, layer = this.root): HTMLElement => {
      const e = document.createElement('div');
      e.className = `k-slot k-slot--${name}`;
      layer.append(e);
      return e;
    };
    this.tl = slot('tl');
    this.tc = slot('tc', this.top);
    this.tcUnder = slot('tc-under');
    this.tr = slot('tr');
    this.bl = slot('bl');
    this.bc = slot('bc');
    this.br = slot('br');
    this.c = slot('c');
    host.append(this.root);
    topHost.append(this.top);
  }
}

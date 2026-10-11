// Слоты HUD (кит 2.0, lab/ui/kit/KIT.md §2): один слой .k-hud в #hud (масштаб — zoom: var(--hud-k)) и семь мест:
// tl — статус режима / FPS · tc — плашка события и тосты (TopCenter) · tr — бейдж игрока (Badge) и плитки ·
// bl — чат с голосом · bc — подсказка действия · br — эмоции, карточка улова · c — крупный баннер, отсчёт.
// Части режимов кладутся в слоты, а не position: absolute по экрану. Окна (.k-scrim) — не сюда: двойной zoom.
export class HudSlots {
  readonly root: HTMLElement;
  readonly tl: HTMLElement;
  readonly tc: HTMLElement;
  readonly tr: HTMLElement;
  readonly bl: HTMLElement;
  readonly bc: HTMLElement;
  readonly br: HTMLElement;
  readonly c: HTMLElement;

  constructor(host: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'k-hud';
    const slot = (name: string): HTMLElement => {
      const e = document.createElement('div');
      e.className = `k-slot k-slot--${name}`;
      this.root.append(e);
      return e;
    };
    this.tl = slot('tl');
    this.tc = slot('tc');
    this.tr = slot('tr');
    this.bl = slot('bl');
    this.bc = slot('bc');
    this.br = slot('br');
    this.c = slot('c');
    host.append(this.root);
  }
}

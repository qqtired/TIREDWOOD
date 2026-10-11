// Бейдж игрока в верх-право (кит: .k-badge): кольцо уровня (--p — доля опыта до следующего уровня), ник, жетоны.
// Уровень и жетоны в HUD — только здесь. «+N / −N» — .k-pop у бейджа (вместо прежнего .tok-pop), новый уровень —
// кольцо подпрыгивает и золотое «Уровень N» (.k-pop--xp) вместо искры ✦; тост «Уровень N» показывает app.ts.
import { coinHtml } from './dom.ts';

const fmt = new Intl.NumberFormat('ru-RU');
/** Сколько живёт .k-pop (анимация k-pop в kit.css) */
const POP_MS = 1600;

export class Badge {
  readonly root: HTMLElement;
  /** Что показано сейчас */
  nick = '';
  level = 0;
  share = -1;
  tokens = -1;
  private readonly ring: HTMLElement;
  private readonly levelEl: HTMLElement;
  private readonly nickEl: HTMLElement;
  private readonly tokensEl: HTMLElement;
  private readonly numEl: HTMLElement;
  private readonly pops = new Map<string, HTMLElement>();

  constructor(slot: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'k-badge pz-badge';
    this.root.innerHTML = `<span class="k-ring" style="--p:0"><b>1</b></span><span class="k-badge-body"><span class="k-badge-nick"></span><span class="k-badge-tokens">${coinHtml()}<span>0</span></span></span>`;
    this.ring = this.root.querySelector('.k-ring')!;
    this.levelEl = this.ring.querySelector('b')!;
    this.nickEl = this.root.querySelector('.k-badge-nick')!;
    this.tokensEl = this.root.querySelector('.k-badge-tokens')!;
    this.numEl = this.tokensEl.querySelector('span')!;
    slot.append(this.root);
  }

  /** Ник, уровень, доля опыта до следующего (0…1) и жетоны — меняется только то, что поменялось */
  set(nick: string, level: number, xpShare: number, tokens: number): void {
    if (nick !== this.nick) {
      this.nick = nick;
      this.nickEl.textContent = nick;
    }
    const share = Math.round(Math.min(1, Math.max(0, xpShare || 0)) * 1000) / 1000;
    if (level !== this.level || share !== this.share) {
      this.level = level;
      this.share = share;
      this.levelEl.textContent = String(level);
      this.ring.style.setProperty('--p', String(share));
      this.ring.title = `Уровень ${level} · до следующего ${Math.round(share * 100)} % опыта`;
    }
    this.setTokens(tokens);
  }

  setTokens(n: number): void {
    if (n === this.tokens) return;
    this.tokens = n;
    this.numEl.textContent = fmt.format(n);
  }

  /** Всплывающее у бейджа: «+25» (жетоны — подпрыгивают), «−10» — 'bad', опыт — 'xp' (золотом, под бейджем) */
  pop(text: string, tone?: 'bad' | 'xp'): void {
    const kind = tone === 'xp' ? 'xp' : 'tokens';
    this.pops.get(kind)?.remove();
    const p = document.createElement('span');
    p.className = `k-pop${tone ? ` k-pop--${tone}` : ''}`;
    p.textContent = text;
    this.root.append(p);
    this.pops.set(kind, p);
    setTimeout(() => {
      p.remove();
      if (this.pops.get(kind) === p) this.pops.delete(kind);
    }, POP_MS);
    if (kind === 'tokens') bump(this.tokensEl);
  }

  /** Новый уровень: число в кольце, кольцо подпрыгивает, золотом — «+N опыта» (как на странице lab/ui; без xp — «Уровень N») */
  levelUp(level: number, xp = 0): void {
    this.set(this.nick, level, this.share, this.tokens);
    bump(this.ring);
    this.pop(xp > 0 ? `+${xp.toLocaleString('ru-RU')} опыта` : `Уровень ${level}`, 'xp');
  }
}

/** Перезапустить .is-bump (k-bump в kit.css) */
function bump(e: HTMLElement): void {
  e.classList.remove('is-bump');
  void e.offsetWidth;
  e.classList.add('is-bump');
}

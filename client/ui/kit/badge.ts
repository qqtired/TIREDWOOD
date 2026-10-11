// Бейдж игрока в верх-право (кит: .k-badge): свой портрет, кольцо уровня (--p — доля опыта), жетоны.
// Уровень и жетоны в HUD — только здесь. «+N / −N» — .k-pop у бейджа (вместо прежнего .tok-pop), новый уровень —
// кольцо подпрыгивает и золотое «Уровень N» (.k-pop--xp) вместо искры ✦; тост «Уровень N» показывает app.ts.
import { coinHtml } from './dom.ts';
import { DEFAULT_OUTFIT, type Outfit } from '../../../shared/outfit.ts';
import { jellyPortrait, portraitModel } from './avatar.ts';

const fmt = new Intl.NumberFormat('ru-RU');
/** Сколько живёт .k-pop (анимация k-pop в kit.css) */
const POP_MS = 1600;
let portraitId = 0;

export class Badge {
  readonly root: HTMLElement;
  /** Что показано сейчас */
  nick = '';
  level = 0;
  share = -1;
  tokens = -1;
  private readonly ring: HTMLElement;
  private readonly levelEl: HTMLElement;
  private readonly avatarEl: HTMLElement;
  private readonly avatarId = `k-avatar-${++portraitId}`;
  private portraitKey = '';
  private readonly tokensEl: HTMLElement;
  private readonly numEl: HTMLElement;
  private readonly pops = new Map<string, HTMLElement>();

  constructor(slot: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'k-badge pz-badge';
    this.root.setAttribute('role', 'group');
    this.root.setAttribute('aria-label', 'Твой игрок');
    this.root.innerHTML = `<span class="k-badge-avatar" role="img" aria-label="Твой образ"></span><span class="k-ring" style="--p:0" role="meter" aria-label="Опыт до следующего уровня" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><b aria-hidden="true">1</b></span><span class="k-badge-tokens">${coinHtml()}<span>0</span></span>`;
    this.ring = this.root.querySelector('.k-ring')!;
    this.levelEl = this.ring.querySelector('b')!;
    this.avatarEl = this.root.querySelector('.k-badge-avatar')!;
    this.tokensEl = this.root.querySelector('.k-badge-tokens')!;
    this.numEl = this.tokensEl.querySelector('span')!;
    this.setOutfit(DEFAULT_OUTFIT);
    slot.append(this.root);
  }

  /** Старый API сохранён; ник хранится для совместимости, на экране — только свой образ, уровень и баланс. */
  set(nick: string, level: number, xpShare: number, tokens: number, outfit?: Outfit): void {
    if (nick !== this.nick) {
      this.nick = nick;
      this.root.setAttribute('aria-label', nick ? `Игрок ${nick}` : 'Твой игрок');
    }
    const share = Math.round(Math.min(1, Math.max(0, xpShare || 0)) * 1000) / 1000;
    if (level !== this.level || share !== this.share) {
      this.level = level;
      this.share = share;
      this.levelEl.textContent = String(level);
      this.ring.style.setProperty('--p', String(share));
      this.ring.setAttribute('aria-valuenow', String(Math.round(share * 100)));
      this.ring.setAttribute('aria-valuetext', `Уровень ${level}, ${Math.round(share * 100)}% до следующего`);
    }
    this.setTokens(tokens);
    if (outfit) this.setOutfit(outfit);
  }

  /** Портрет меняется лишь вместе с видимыми деталями своего подтверждённого наряда. */
  setOutfit(outfit: Outfit): void {
    const key = JSON.stringify(portraitModel(outfit));
    if (key === this.portraitKey) return;
    this.portraitKey = key;
    this.avatarEl.innerHTML = jellyPortrait(outfit, this.avatarId);
  }

  setTokens(n: number): void {
    if (n === this.tokens) return;
    this.tokens = n;
    this.numEl.textContent = fmt.format(n);
    this.tokensEl.setAttribute('aria-label', `${fmt.format(n)} жетонов`);
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

// «Ракушка»: облачка догадок над желейками и значок голоса (docs/quiz/tech.md §6, §14; образец — lab/quiz/v2/js/stage.js).
// Приёмы игры: облачко — то же, что у чата (Avatar.say, спрайт над ником), с тоном отметки и ником автора; значок
// голоса — как реакция за столом (Avatar.badge, ~2 с). Новая строка — облачко 6 с; 👍 — мятное, 👎 — серое зачёркнутое,
// проверка «угадал» — золотая рамка, пока идёт дробь; угадал — золотое.
import * as THREE from 'three';
import { BUBBLE_CHARS, BUBBLE_MS } from '../../../shared/lobby.ts';
import { QZ, QZ_MODES, type QzLine, type QzMark } from '../../../shared/quiz/types.ts';
import type { Avatar, SpeechTone } from '../../render/avatar.ts';
import { uiIcon } from '../../ui/kit/icons.ts';
import type { QuizEvent } from './state.ts';

const toneOf = (m: QzMark): SpeechTone => (m === 'warm' ? 'warm' : m === 'miss' ? 'miss' : m === 'check' ? 'check' : m === 'win' ? 'win' : 'new');
/** Сколько ещё держать облачко после отметки, мс */
const MARK_MS: Record<SpeechTone, number> = { new: BUBBLE_MS, warm: 4000, miss: 3000, check: QZ.CHECK_MS + 600, win: 5000 };

export class QuizHeads {
  private readonly avatarOf: (slot: number) => Avatar | null;
  private readonly mySlot: () => number;
  /** Чья строка сейчас в облачке: slot → id строки (облачко перекрашивается, только если это она) */
  private readonly shown = new Map<number, number>();
  private readonly icons = new Map<number, THREE.Texture>();

  constructor(avatarOf: (slot: number) => Avatar | null, mySlot: () => number) {
    this.avatarOf = avatarOf;
    this.mySlot = mySlot;
  }

  /** Строка над автором: свой ник над собой не пишем (бриф: «над собой — никогда») */
  private say(l: QzLine, tone: SpeechTone, ms: number): void {
    const av = this.avatarOf(l.slot);
    if (!av) return;
    av.say(l.text.slice(0, BUBBLE_CHARS), tone, l.slot === this.mySlot() ? '' : l.nick, ms);
    this.shown.set(l.slot, l.id);
  }

  onEvent(e: QuizEvent): void {
    switch (e.k) {
      case 'line':
        if (e.line.kind !== 'zat' && e.line.slot > 0) this.say(e.line, toneOf(e.line.mark), BUBBLE_MS);
        return;
      case 'mark': {
        const tone = toneOf(e.line.mark);
        const av = this.avatarOf(e.line.slot);
        if (!av) return;
        // облачко этой строки ещё висит — перекрасить; погасло или там уже другая — показать заново (отметку видно всем)
        if (this.shown.get(e.line.slot) === e.line.id) av.sayTone(tone, MARK_MS[tone]);
        else this.say(e.line, tone, MARK_MS[tone]);
        return;
      }
      case 'gone':
        if (this.shown.get(e.slot) === e.id) this.shown.delete(e.slot);
        return;
      case 'checkEnd': {
        const av = this.avatarOf(e.who.slot);
        if (av) av.sayTone(e.solved ? 'win' : 'new', e.solved ? MARK_MS.win : 2000);
        return;
      }
      case 'vote': {
        const av = this.avatarOf(e.slot);
        const tex = this.icon(e.card);
        if (av && tex) av.showIcon(tex);
        return;
      }
      default:
    }
  }

  /** Значок режима (иконка кита) — текстура для спрайта над головой */
  private icon(card: number): THREE.Texture | null {
    let t = this.icons.get(card);
    if (t) return t;
    const url = uiIcon(QZ_MODES[card]?.icon ?? '');
    if (!url) return null;
    t = new THREE.TextureLoader().load(url);
    t.colorSpace = THREE.SRGBColorSpace;
    this.icons.set(card, t);
    return t;
  }

  reset(): void {
    this.shown.clear();
  }
}

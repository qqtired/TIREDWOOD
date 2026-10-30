// «Ракушка»: облачка догадок над желейками и значок голоса (docs/quiz/tech.md §6, §14; образец — lab/quiz/v2/js/stage.js).
// Приёмы игры: облачко — то же, что у чата (Avatar.say, спрайт над ником), с тоном отметки и ником автора; значок
// голоса — как реакция за столом (Avatar.badge, ~2 с). Новая строка — облачко 6 с; 👍 — мятное, 👎 — серое зачёркнутое,
// проверка «угадал» — золотая рамка, пока идёт дробь; угадал — золотое.
import * as THREE from 'three';
import { BUBBLE_CHARS, BUBBLE_MS } from '../../../shared/lobby.ts';
import { QZ, QZ_MODES, type QzLine, type QzMark, type QzPerson, type QzTitle } from '../../../shared/quiz/types.ts';
import type { Avatar, SpeechTone } from '../../render/avatar.ts';
import { uiIcon } from '../../ui/kit/icons.ts';
import type { QuizEvent } from './state.ts';

const toneOf = (m: QzMark): SpeechTone => (m === 'warm' || m === 'hot' ? 'warm' : m === 'miss' ? 'miss' : m === 'check' ? 'check' : m === 'win' ? 'win' : 'new');
/** Сколько ещё держать облачко после отметки, мс */
const MARK_MS: Record<SpeechTone, number> = { new: BUBBLE_MS, warm: 4000, miss: 3000, check: QZ.CHECK_MS + 600, win: 5000 };

export class QuizHeads {
  private readonly avatarOf: (slot: number) => Avatar | null;
  private readonly mySlot: () => number;
  /** Чья строка сейчас в облачке: slot → id строки (облачко перекрашивается, только если это она) */
  private readonly shown = new Map<number, number>();
  private readonly icons = new Map<string, THREE.Texture>();
  /** Титулы «Кто из нас?» над никами: slot → спрайт и текст */
  private readonly titles = new Map<number, { sprite: THREE.Sprite; text: string; av: Avatar }>();
  /** Какие титулы нужны (slot → текст): желейка может появиться позже снимка — раз в секунду добираем недостающие */
  private want = new Map<number, string>();
  private retryAt = 0;

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
    return this.iconTex(QZ_MODES[card]?.icon ?? '');
  }

  /** Значок кита по id — текстура для спрайта над головой (голос, выбор в «Кто из нас?») */
  iconTex(id: string): THREE.Texture | null {
    let t = this.icons.get(id);
    if (t) return t;
    const url = uiIcon(id);
    if (!url) return null;
    t = new THREE.TextureLoader().load(url);
    t.colorSpace = THREE.SRGBColorSpace;
    this.icons.set(id, t);
    return t;
  }

  /**
   * Титулы над никами: золотой пилюлей над табличкой. C9: источник — board.titles (по последнему на человека, их видят все
   * на набережной), для тех, кого там нет, — people[].titles (до конца игры «Кто из нас?»).
   */
  setTitles(list: readonly QzTitle[] | null, people: readonly QzPerson[] | null = null): void {
    const want = new Map<number, string>();
    for (const p of people ?? []) if (p.titles?.length) want.set(p.slot, p.titles[p.titles.length - 1]);
    for (const t of list ?? []) if (t.slot > 0 && t.title) want.set(t.slot, t.title);
    this.want = want;
    this.attach();
  }

  private attach(): void {
    const want = this.want;
    for (const [slot, t] of this.titles) {
      const av = this.avatarOf(slot);
      if (want.get(slot) === t.text && av === t.av) continue;
      t.sprite.removeFromParent();
      (t.sprite.material.map as THREE.Texture | null)?.dispose();
      t.sprite.material.dispose();
      this.titles.delete(slot);
    }
    for (const [slot, text] of want) {
      if (this.titles.has(slot)) continue;
      const av = this.avatarOf(slot);
      if (!av) continue;
      const sprite = titleSprite(text);
      av.root.add(sprite);
      this.titles.set(slot, { sprite, text, av });
    }
  }

  /** Кадр: титул держится над табличкой с ником и прячется вместе с ней */
  update(): void {
    // желейка могла появиться (подошла ближе) уже после снимка с титулом
    if (this.want.size > this.titles.size && performance.now() > this.retryAt) {
      this.retryAt = performance.now() + 1000;
      this.attach();
    }
    for (const { sprite, av } of this.titles.values()) {
      const tag = av.nameTag;
      sprite.visible = tag.visible;
      if (!tag.visible) continue;
      sprite.position.y = tag.position.y;
      sprite.material.opacity = tag.material.opacity;
      sprite.center.y = (tag.center.y * tag.scale.y - tag.scale.y - 0.003) / sprite.scale.y;
    }
  }

  reset(): void {
    this.shown.clear();
    this.setTitles(null);
  }
}

const TITLE_H = 0.034;
/** Титул: золотая пилюля с тёмным текстом (как пилюли кита), тот же вид спрайта, что у таблички с ником — без новой программы */
function titleSprite(text: string): THREE.Sprite {
  const cv = document.createElement('canvas');
  const g = cv.getContext('2d')!;
  const font = '800 34px Rubik, system-ui, sans-serif';
  g.font = font;
  const w = Math.min(560, Math.ceil(g.measureText(text).width) + 44);
  cv.width = w;
  cv.height = 56;
  g.font = font;
  g.fillStyle = '#ffcd4a';
  g.beginPath();
  g.roundRect(2, 4, w - 4, 48, 24);
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = 'rgba(22, 49, 58, .35)';
  g.stroke();
  g.fillStyle = '#16313a';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, 29, w - 28);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false, depthWrite: false, transparent: true, fog: false }));
  sprite.scale.set((TITLE_H * w) / 56, TITLE_H, 1);
  sprite.center.set(0.5, 0);
  sprite.renderOrder = 5;
  sprite.name = 'quiz-title';
  return sprite;
}

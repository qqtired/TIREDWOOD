// Пакет «Т-идеи» крепости на клиенте — одна точка входа для матча (match.ts): ремесло (Т-4), карточки после босса (Т-8),
// золотой краб (Т-16), батуты (Т-18), слабые места тяжёлых (Т-23), замедленный миг (Т-27). Создаётся по первому {t:'fideas'};
// без этого сообщения (без FORT50) ничего не создаётся и крепость как раньше. Решает сервер: здесь вид,
// подсказки и отправка {t:'use'}. Бриф — docs/fort50/brief-ideas.md, контракт — shared/fortideas.ts.
import type { FortIdeasMsg } from '../../../shared/fortideas.ts';
import { el } from '../ui/dom.ts';
import { CardsPart } from './cards.ts';
import { CraftPart } from './craft.ts';
import { CrabPart } from './crab.ts';
import type { IdeasDeps } from './deps.ts';
import { readIdeas, type IdeasState } from './logic.ts';
import { SlowPart } from './slow.ts';
import { TarPart } from './tarpools.ts';
import { TrampsPart } from './tramps.ts';
import { WeakPart } from './weak.ts';
import './ideas.css';

export type { IdeasDeps } from './deps.ts';

/** Позы остальных защитников — для чужих прыжков на батуте */
export type IdeasPoses = Iterable<[number, { x: number; y: number; z: number; valid: boolean }]>;

export class FortIdeasClient {
  readonly craft: CraftPart;
  readonly cards: CardsPart;
  readonly crab: CrabPart;
  readonly tramps: TrampsPart;
  readonly weak: WeakPart;
  readonly slow: SlowPart;
  readonly tar: TarPart;
  /** Последнее состояние от сервера */
  state: IdeasState = readIdeas(null);
  private readonly d: IdeasDeps;
  private readonly row: HTMLElement;
  private readonly parts: ReadonlyArray<{ onEvent?(e: readonly unknown[]): boolean; dispose(): void }>;

  constructor(deps: Omit<IdeasDeps, 'row'>) {
    // один ряд значков под плашкой команды: плитки плашки золота рассчитаны на свои три места
    this.row = el('div', 'ft-ideas-row');
    deps.hud.ui.command.after(this.row);
    const d: IdeasDeps = { ...deps, row: this.row };
    this.d = d;
    this.craft = new CraftPart(d);
    this.crab = new CrabPart(d);
    this.cards = new CardsPart(d);
    this.tramps = new TrampsPart(d);
    this.weak = new WeakPart(d);
    this.slow = new SlowPart(d);
    this.tar = new TarPart(d);
    this.parts = [this.craft, this.cards, this.crab, this.tramps, this.weak, this.slow, this.tar];
  }

  /** {t:'fideas'} — состояние пакета: при входе и при каждом изменении */
  onMsg(m: FortIdeasMsg): void {
    const st = readIdeas(m);
    this.state = st;
    this.weak.setElite(st.elite);
    this.craft.setState(st);
    this.cards.setState(st);
    this.tramps.set(st.tramps);
    this.d.hud.ui.board.setIdeas(st.crafts, st.taken);
  }

  /** Событие потока fev; true — оно из пакета (матчу дальше нести не нужно) */
  onEvent(e: readonly unknown[]): boolean {
    for (const p of this.parts) if (p.onEvent?.(e)) return true;
    return false;
  }

  /** Открыто окно ремёсел: мышь свободна, меню игры не звать */
  get windowOpen(): boolean {
    return this.craft.shown;
  }

  /** Насколько уже стало поле зрения камеры (замедленный миг), градусы, ≤ 0 */
  get fovNarrow(): number {
    return this.slow.fovNarrow;
  }

  /** Подсказка у вешалки или пустого места батута: [текст, цена, сработает ли E] */
  hint(): [string, number, boolean] | null {
    if (!this.d.alive()) return null;
    return this.craft.hint() ?? this.tramps.hint();
  }

  /** E: вешалка (открыть или закрыть окно), батут (купить). true — клавишу забрали */
  use(): boolean {
    return this.craft.use() || this.tramps.use();
  }

  /** Клавиши раньше арсенала: окно ремёсел (1–5, E, Esc), голосование за карточку (1/2/3), Alt — подробности */
  onKey(code: string, down: boolean, e: KeyboardEvent): boolean {
    if (code === 'AltLeft' || code === 'AltRight') {
      this.cards.setAlt(down);
      return false;
    }
    if (this.craft.onKey(code, down, e)) return true;
    if (down && !this.craft.shown && this.cards.onKey(code, e)) return true;
    return false;
  }

  /** Свой прыжок на батут */
  bounced(x: number, z: number): void {
    this.tramps.bounced(x, z);
  }

  frame(dt: number, poses: IdeasPoses): void {
    this.craft.frame(dt);
    this.cards.frame();
    this.crab.frame(dt);
    this.tramps.frame(dt, poses);
    this.weak.frame(dt);
    this.slow.frame();
    this.tar.frame(dt);
  }

  dispose(): void {
    for (const p of this.parts) p.dispose();
    this.row.remove();
    this.d.hud.ui.board.setIdeas(new Map(), []);
  }
}

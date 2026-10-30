// «Ракушка»: низ-центр HUD (слот bc). Одна полоса сверху — «Сыграем?» или вызов роли («Загадываю!», «Пропустить», отсчёт);
// под ней у загадывающего — ряд клавиш «1 тепло · 2 мимо · 3 угадал» → «Z отменить» и кнопка «Подсказка». Образец —
// lab/quiz/v2/js/vote.js (roles) и riddle.js (riddlerUi). Разметка меняется только когда поменялось содержимое (sig), время — отдельным узлом.
import { hintLabel, keysRow, type BarSpec } from './hud-model.ts';

const el = (cls: string, html?: string): HTMLElement => {
  const e = document.createElement('div');
  e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

/** Что нужно загадывающему внизу */
export interface RiddlerState {
  /** уже отмечал в этом раунде: ряд «1 тепло…» сменяется на «Z отменить» */
  used: boolean;
  canUndo: boolean;
  /** идёт «Проверяем…»: ряд клавиш прячется (отмена уже на плашке) */
  checking: boolean;
  hintsLeft: number;
}

export class BottomBars {
  readonly host: HTMLElement;
  private bar: HTMLElement | null = null;
  private sig = '';
  private timeEl: HTMLElement | null = null;
  private rid: { root: HTMLElement; keys: HTMLElement; hint: HTMLButtonElement; keysSig: string; hintSig: string } | null = null;

  constructor() {
    this.host = el('qz-bc-host');
  }

  /** Есть ли что-то внизу (пустой узел в слоте добавил бы зазор) */
  get empty(): boolean {
    return !this.bar && !this.rid;
  }

  /** «Сыграем?» / вызов роли; null — убрать */
  setBar(spec: BarSpec | null): void {
    if (!spec) {
      this.bar?.remove();
      this.bar = this.timeEl = null;
      this.sig = '';
      return;
    }
    if (!this.bar || this.sig !== spec.sig) {
      this.bar?.remove();
      const tpl = document.createElement('template');
      tpl.innerHTML = spec.html;
      this.bar = tpl.content.firstElementChild as HTMLElement;
      this.timeEl = this.bar.querySelector<HTMLElement>('.qz-roles-time');
      this.sig = spec.sig;
      this.host.prepend(this.bar);
    }
    if (this.timeEl) {
      if (this.timeEl.textContent !== spec.time) this.timeEl.textContent = spec.time;
      this.timeEl.classList.toggle('is-hurry', spec.hurry);
    }
  }

  /** Ряд клавиш и «Подсказка» загадывающего; null — убрать */
  setRiddler(s: RiddlerState | null): void {
    if (!s) {
      this.rid?.root.remove();
      this.rid = null;
      return;
    }
    if (!this.rid) {
      const root = el('qz-bc');
      const keys = el('k-plate mo-keys key-hint qz-keys');
      const hint = document.createElement('button');
      hint.type = 'button';
      hint.className = 'k-btn k-btn--ghost k-btn--sm qz-hintbtn';
      hint.dataset.qz = 'hint';
      root.append(keys, hint);
      this.host.append(root);
      this.rid = { root, keys, hint, keysSig: '', hintSig: '' };
    }
    const r = this.rid;
    const keysSig = `${s.used}|${s.canUndo}`;
    if (r.keysSig !== keysSig) { r.keys.innerHTML = keysRow(s.used, s.canUndo); r.keysSig = keysSig; }
    // пока идёт проверка, «Отменить Z» уже есть на плашке — повтор снизу не нужен
    r.keys.style.display = s.checking ? 'none' : '';
    const hintSig = String(s.hintsLeft);
    if (r.hintSig !== hintSig) { r.hint.innerHTML = hintLabel(s.hintsLeft); r.hintSig = hintSig; }
    // подсказку дают только в раунде: на «Проверяем…» кнопка серая, а не молчит
    r.hint.disabled = s.hintsLeft <= 0 || s.checking;
  }

  clear(): void {
    this.setBar(null);
    this.setRiddler(null);
  }
}

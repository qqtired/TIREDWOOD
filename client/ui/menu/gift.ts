// Подарочный код в меню (Профиль → Подарки и коды). Тот же обмен, что в примерочной (client/ui/gift-code.ts): код
// уходит серверу, ответ приходит redeemResult. Сервер принимает коды только на набережной. Код никуда не сохраняем.
import { GIFT_CODE_MAX_LENGTH, type GiftResultCode } from '../../../shared/gifts.ts';
import { GIFT_RESULT_TEXT } from '../gift-code.ts';

/** Ответа нет столько — считаем, что не вышло (как в примерочной) */
const WAIT_MS = 6500;

export class GiftForm {
  readonly root: HTMLFormElement;
  private readonly input: HTMLInputElement;
  private readonly button: HTMLButtonElement;
  private readonly status: HTMLElement;
  private pending = false;
  private timer = 0;
  /** Сейчас в строке состояния — пояснение, почему поле выключено (а не ответ сервера) */
  private explaining = false;

  /** state — включены ли коды и на набережной ли игрок: проверяем ещё раз в момент отправки */
  constructor(send: (code: string) => void, state: () => readonly [enabled: boolean, lobby: boolean]) {
    this.root = document.createElement('form');
    this.root.className = 'mn-gift';
    this.root.innerHTML = `
      <div class="mn-gift-row">
        <input type="text" maxlength="${GIFT_CODE_MAX_LENGTH}" autocomplete="off" spellcheck="false" autocapitalize="characters" placeholder="Введи код" aria-label="Подарочный код" />
        <button class="btn ghost" type="submit">Получить</button>
      </div>
      <p class="mn-gift-status" role="status" aria-live="polite"></p>`;
    this.input = this.root.querySelector('input')!;
    this.button = this.root.querySelector('button')!;
    this.status = this.root.querySelector('.mn-gift-status')!;
    // буквы — в поле, а не игре; Esc — меню
    for (const type of ['keydown', 'keyup'] as const) {
      this.input.addEventListener(type, (e) => {
        if (e.key !== 'Escape') e.stopPropagation();
      });
    }
    this.root.addEventListener('submit', (e) => {
      e.preventDefault();
      if (this.pending) return;
      // пока меню было открыто, игрока могли увести в режим
      this.configure(...state());
      if (this.input.disabled) return;
      const code = this.input.value.trim();
      if (!code) {
        this.say('Сначала введи код.');
        this.input.focus();
        return;
      }
      this.pending = true;
      this.button.disabled = true;
      this.button.textContent = 'Проверяем…';
      this.say('');
      this.timer = window.setTimeout(() => this.result('unavailable'), WAIT_MS);
      send(code);
    });
  }

  /** enabled — коды включены на сервере; lobby — игрок на набережной (в режимах сервер код не примет) */
  configure(enabled: boolean, lobby: boolean): void {
    const why = !enabled ? 'Подарочные коды сейчас выключены.' : !lobby ? 'Код вводится на набережной — вернись туда, и он сработает.' : '';
    this.input.disabled = !!why;
    if (!this.pending) this.button.disabled = !!why;
    if (why) {
      this.say(why);
      this.explaining = true;
    } else if (this.explaining) {
      this.say('');
    }
  }

  /** Ответ сервера — только на свой запрос (примерочная получает такой же) */
  result(r: GiftResultCode): void {
    if (!this.pending) return;
    clearTimeout(this.timer);
    this.pending = false;
    this.button.disabled = this.input.disabled;
    this.button.textContent = 'Получить';
    const ok = r === 'granted' || r === 'already';
    this.say(GIFT_RESULT_TEXT[r]);
    this.status.dataset.success = String(ok);
    if (ok) this.input.value = '';
  }

  /** Меню закрыли: поле очищаем, код нигде не остаётся */
  reset(): void {
    if (!this.pending) this.say('');
    this.input.value = '';
  }

  private say(text: string): void {
    this.explaining = false;
    this.status.textContent = text;
    delete this.status.dataset.success;
  }
}

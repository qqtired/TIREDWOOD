// Саня на баркасе: «Домой, к Семёну» за SANYA_PRICE — кнопка модуля баркаса в шапке разговора fisheco (контейнер extra
// в client/lobby/fishnpcdialog.ts; сам разговор — лавка, продажа, задания — там). Видна только у Сани, без денег неактивна.
// Сервер: действие 'ferry' разговора (server/lobby/room.ts — onSanyaFerry), ответ — barkasHome: отправил — окно
// закрывается и тост; нет — причину Саня скажет в окне.
import { SANYA_PRICE } from '../../../shared/barkas.ts';
import type { FishNpcId } from '../../../shared/fishplaces.ts';
import type { ClientMsg } from '../../../shared/messages.ts';
import { setCoinText } from '../../ui/coin.ts';

/** Что нужно от окна разговора (FishNpcDialog) */
export interface NpcDialogHost {
  readonly extra: HTMLElement;
  readonly who: FishNpcId;
  readonly isOpen: boolean;
  close(): void;
}

const FREE = 'бесплатно — на «Удалой»: колокол у калитки на корме';

export class SanyaHome {
  private readonly dialog: NpcDialogHost;
  private readonly tokens: () => number;
  private readonly send: (msg: ClientMsg) => void;
  private readonly toast: (text: string) => void;
  private readonly btn: HTMLButtonElement;
  /** Ждём ответа сервера (таймер на случай, если ответ не пришёл) */
  private pending = 0;

  constructor(dialog: NpcDialogHost, tokens: () => number, send: (msg: ClientMsg) => void, toast: (text: string) => void) {
    this.dialog = dialog;
    this.tokens = tokens;
    this.send = send;
    this.toast = toast;
    const b = this.btn = dialog.extra.appendChild(document.createElement('button'));
    b.type = 'button';
    b.className = 'fn-action bk-home';
    b.hidden = true;
    setCoinText(b, `⛵ Домой, к Семёну · ${SANYA_PRICE} 🪙`);
    b.addEventListener('click', () => this.go());
    window.setInterval(() => { if (this.dialog.isOpen) this.refresh(); }, 500);
  }

  /** Показать (только у Сани) и включить по деньгам */
  refresh(): void {
    const sanya = this.dialog.who === 'sanya';
    this.btn.hidden = !sanya;
    if (!sanya) return;
    const short = SANYA_PRICE - this.tokens();
    this.btn.disabled = this.pending !== 0 || short > 0;
    this.btn.title = short > 0 ? `Не хватает ${short} 🪙 · ${FREE}` : `Саня свистнет знакомому катеру — и ты сразу на мостках у Семёна. Или ${FREE}`;
  }

  /** Ответ сервера (barkasHome) */
  onResult(ok: boolean, message: string): void {
    window.clearTimeout(this.pending);
    this.pending = 0;
    if (ok) {
      this.dialog.close();
      this.toast(message);
    } else if (!this.dialog.isOpen) this.toast(message);
    this.refresh();
  }

  private go(): void {
    if (this.pending || this.dialog.who !== 'sanya') return;
    this.pending = window.setTimeout(() => {
      this.pending = 0;
      this.refresh();
    }, 5000);
    this.refresh();
    this.send({ t: 'fishNpc', npc: 'sanya', a: 'ferry' });
  }
}

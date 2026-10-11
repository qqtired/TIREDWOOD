// Саня на баркасе: «Домой, к Семёну» за SANYA_PRICE — кнопка кита (.k-btn) модуля баркаса в шапке окна торговца (контейнер
// extra в client/lobby/fishnpcdialog.ts, перед жетонами; сам разговор — лавка, продажа, задания — там). Под кнопкой —
// строка: бесплатный путь или, если не хватает жетонов, причина красным. Видна только у Сани, без денег неактивна.
// Сервер: действие 'ferry' разговора (server/lobby/room.ts — onSanyaFerry), ответ — barkasHome: отправил — окно
// закрывается и тост; нет — причину Саня скажет в окне.
import { SANYA_PRICE } from '../../../shared/barkas.ts';
import type { FishNpcId } from '../../../shared/fishplaces.ts';
import type { ClientMsg } from '../../../shared/messages.ts';
import { setCoinText } from '../../ui/coin.ts';
import { coinHtml, iconImg } from '../../ui/kit/dom.ts';
import '../fishwin.css';

/** Что нужно от окна разговора (FishNpcDialog) */
export interface NpcDialogHost {
  readonly extra: HTMLElement;
  readonly who: FishNpcId;
  readonly isOpen: boolean;
  close(): void;
}

const FREE = 'бесплатно — на «Удалой»: колокол у калитки на корме';
const NOTE = 'или бесплатно — колокол у калитки на корме';

export class SanyaHome {
  private readonly dialog: NpcDialogHost;
  private readonly tokens: () => number;
  private readonly send: (msg: ClientMsg) => void;
  private readonly toast: (text: string) => void;
  private readonly box: HTMLElement;
  private readonly btn: HTMLButtonElement;
  private readonly note: HTMLElement;
  /** Ждём ответа сервера (таймер на случай, если ответ не пришёл) */
  private pending = 0;

  constructor(dialog: NpcDialogHost, tokens: () => number, send: (msg: ClientMsg) => void, toast: (text: string) => void) {
    this.dialog = dialog;
    this.tokens = tokens;
    this.send = send;
    this.toast = toast;
    this.box = dialog.extra.appendChild(document.createElement('div'));
    this.box.className = 'fi-home';
    this.box.hidden = true;
    const b = this.btn = this.box.appendChild(document.createElement('button'));
    b.type = 'button';
    b.className = 'k-btn k-btn--ghost k-btn--sm';
    b.innerHTML = `<span class="k-row-line">${iconImg('boat')}Домой, к Семёну · ${SANYA_PRICE} ${coinHtml()}</span>`;
    b.addEventListener('click', () => this.go());
    this.note = this.box.appendChild(document.createElement('small'));
    this.note.className = 'fi-home-note';
    window.setInterval(() => { if (this.dialog.isOpen) this.refresh(); }, 500);
  }

  /** Показать (только у Сани) и включить по деньгам */
  refresh(): void {
    const sanya = this.dialog.who === 'sanya';
    this.box.hidden = !sanya;
    if (!sanya) return;
    const short = SANYA_PRICE - this.tokens();
    this.btn.disabled = this.pending !== 0 || short > 0;
    this.btn.title = short > 0 ? `Не хватает ${short} 🪙 · ${FREE}` : `Саня свистнет знакомому катеру — и ты сразу у хижины Семёна. Или ${FREE}`;
    const note = short > 0 ? `Не хватает ${short} 🪙 · бесплатно — колокол у калитки` : NOTE;
    if (this.note.dataset.t !== note) {
      this.note.dataset.t = note;
      this.note.classList.toggle('is-bad', short > 0);
      setCoinText(this.note, note);
    }
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

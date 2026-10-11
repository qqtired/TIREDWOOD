// Игнат на острове: «На большую землю · 250 🪙» — кнопка кита (.k-btn) в шапке окна торговца (контейнер extra, как
// «Домой, к Семёну» у Сани — client/lobby/barkas/sanyahome.ts); под ней — куда везёт или, если не хватает жетонов, причина красным. Видна только у Игната. Сервер: действие 'ferry' разговора
// (server/lobby/room.ts — onIgnatHome), ответ — barkasHome (окно закроет SanyaHome.onResult, тост — там же).
import type { FishNpcId } from '../../../shared/fishplaces.ts';
import { ISLE_HOME_PRICE } from '../../../shared/isle.ts';
import type { ClientMsg } from '../../../shared/messages.ts';
import { setCoinText } from '../../ui/coin.ts';
import { coinHtml, iconImg } from '../../ui/kit/dom.ts';
import '../fishwin.css';

export interface IgnatDialog {
  readonly extra: HTMLElement;
  readonly who: FishNpcId;
  readonly isOpen: boolean;
}

const NOTE = 'к хижине Семёна на пристани; своя лодка у причала — плыви на ней';

export class IgnatHome {
  private readonly dialog: IgnatDialog;
  private readonly tokens: () => number;
  private readonly send: (msg: ClientMsg) => void;
  private readonly box: HTMLElement;
  private readonly btn: HTMLButtonElement;
  private readonly note: HTMLElement;
  private pending = 0;

  constructor(dialog: IgnatDialog, tokens: () => number, send: (msg: ClientMsg) => void) {
    this.dialog = dialog;
    this.tokens = tokens;
    this.send = send;
    this.box = dialog.extra.appendChild(document.createElement('div'));
    this.box.className = 'fi-home';
    this.box.hidden = true;
    const b = (this.btn = this.box.appendChild(document.createElement('button')));
    b.type = 'button';
    b.className = 'k-btn k-btn--ghost k-btn--sm';
    b.innerHTML = `<span class="k-row-line">${iconImg('boat')}На большую землю · ${ISLE_HOME_PRICE} ${coinHtml()}</span>`;
    b.addEventListener('click', () => this.go());
    this.note = this.box.appendChild(document.createElement('small'));
    this.note.className = 'fi-home-note';
    window.setInterval(() => { if (this.dialog.isOpen) this.refresh(); }, 500);
  }

  refresh(): void {
    const on = this.dialog.who === 'ignat';
    this.box.hidden = !on;
    if (!on) return;
    const short = ISLE_HOME_PRICE - this.tokens();
    this.btn.disabled = this.pending !== 0 || short > 0;
    this.btn.title = `Игнат заведёт свой старый катерок — и ты у хижины Семёна. ${NOTE}`;
    const note = short > 0 ? `Не хватает ${short} 🪙` : NOTE;
    if (this.note.dataset.t !== note) {
      this.note.dataset.t = note;
      this.note.classList.toggle('is-bad', short > 0);
      setCoinText(this.note, note);
    }
  }

  /** Ответ сервера пришёл (barkasHome) */
  done(): void {
    window.clearTimeout(this.pending);
    this.pending = 0;
    this.refresh();
  }

  private go(): void {
    if (this.pending || this.dialog.who !== 'ignat') return;
    this.pending = window.setTimeout(() => {
      this.pending = 0;
      this.refresh();
    }, 5000);
    this.refresh();
    this.send({ t: 'fishNpc', npc: 'ignat', a: 'ferry' });
  }
}

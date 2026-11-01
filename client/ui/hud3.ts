// HUD «Веранда v3» (интерфейс 3.0, docs/ui3/brief.md): три перестройки разметки, которых не сделать одним CSS, — в лаборатории
// то же делает lab/ui3/v/veranda3-msg.js. Только при флаге UI3 (подключает client/startup-game.ts):
//  1. личные награды (.k-toast--reward) уходят из стопки верх-центра в «кошелёк» .v3m-wallet слева от бейджа, сумма — числом .v3m-num;
//  2. новость про игрока («Tester7 вытащил…»): ник — <b class="v3m-who k-nick-N">, цвет — как в чате;
//  3. системные строки чата и дока «Ракушки»: значок впереди — первый эмодзи строки или золотой ромбик, эмодзи подряд — плотным блоком.
// TopCenter убирает тост по ссылке на элемент, чат — старые строки с начала списка: перенос и вставки им не мешают.
import { nickTone } from '../chat.ts';
import { emojiRuns, leadAmount, leadEmoji, newsNick } from './hud3-text.ts';

export function bindHud3(doc: Document = document): void {
  const stack = doc.querySelector<HTMLElement>('.k-hud--top > .k-slot--tc > .k-toasts');
  const tr = doc.querySelector<HTMLElement>('.k-hud:not(.k-hud--top) > .k-slot--tr');
  const bl = doc.querySelector<HTMLElement>('.k-hud:not(.k-hud--top) > .k-slot--bl');
  if (stack && tr) {
    let wallet: HTMLElement | null = null;
    new MutationObserver((recs) => {
      for (const r of recs) {
        for (const n of r.addedNodes) {
          if (!(n instanceof HTMLElement) || n.parentElement !== stack || !n.classList.contains('k-toast')) continue;
          if (!n.classList.contains('k-toast--reward')) { news(n); continue; }
          if (wallet?.parentElement !== tr) wallet = openWallet(tr);
          amount(n);
          wallet.prepend(n);
        }
      }
    }).observe(stack, { childList: true });
  }
  if (bl) {
    // док «Ракушки» встаёт в слот уже со строками — смотрим и внутрь вставленного
    const lines = (n: HTMLElement): void => {
      if (n.matches('.k-chat-line.is-sys')) sysLine(n);
      else for (const l of n.querySelectorAll<HTMLElement>('.k-chat-line.is-sys')) sysLine(l);
    };
    new MutationObserver((recs) => {
      for (const r of recs) for (const n of r.addedNodes) if (n instanceof HTMLElement) lines(n);
    }).observe(bl, { childList: true, subtree: true });
    lines(bl);
  }
}

/** Кошелёк — первый в слоте tr, по середине бейджа слева от него (CSS берёт его размеры из --v3m-badge-w/h) */
function openWallet(tr: HTMLElement): HTMLElement {
  const box = document.createElement('div');
  box.className = 'v3m-wallet';
  box.setAttribute('aria-live', 'polite');
  tr.prepend(box);
  const badge = tr.querySelector<HTMLElement>(':scope > .k-badge');
  const fit = (): void => {
    // бейдж скрыт (крепость: своя верхняя плашка) — размеры 0: кошелёк в угол, как без бейджа, а не на 20 px за край экрана
    const shown = !!badge && badge.offsetHeight > 0;
    box.style.setProperty('--v3m-badge-w', `${shown ? badge.offsetWidth : -10}px`);
    box.style.setProperty('--v3m-badge-h', `${shown ? badge.offsetHeight : 40}px`);
  };
  fit();
  if (badge && typeof ResizeObserver === 'function') new ResizeObserver(fit).observe(badge);
  return box;
}

/** «+20 <монета> за улов» → <b class="v3m-num">+20</b><монета> за улов */
function amount(toast: HTMLElement): void {
  const title = toast.querySelector('.k-toast-title');
  const first = title?.firstChild;
  if (!title || first?.nodeType !== Node.TEXT_NODE) return;
  const lead = leadAmount(first.textContent ?? '');
  if (!lead) return;
  const b = document.createElement('b');
  b.className = 'v3m-num';
  b.textContent = lead.num;
  first.textContent = (first.textContent ?? '').slice(lead.len);
  title.insertBefore(b, first);
}

function news(toast: HTMLElement): void {
  const title = toast.querySelector('.k-toast-title');
  const first = title?.firstChild;
  if (!title || first?.nodeType !== Node.TEXT_NODE) return;
  const nick = newsNick(first.textContent ?? '');
  if (!nick) return;
  const who = document.createElement('b');
  who.className = `v3m-who k-nick-${nickTone(nick)}`;
  who.textContent = nick;
  first.textContent = (first.textContent ?? '').slice(nick.length);
  title.insertBefore(who, first);
}

function sysLine(line: HTMLElement): void {
  if (line.querySelector(':scope > .v3m-sys-ic')) return;
  const ic = document.createElement('i');
  ic.className = 'v3m-sys-ic';
  const first = line.firstChild;
  const lead = first?.nodeType === Node.TEXT_NODE ? leadEmoji(first.textContent ?? '') : null;
  if (first && lead) {
    ic.textContent = lead.icon;
    first.textContent = (first.textContent ?? '').slice(lead.len);
  } else ic.classList.add('is-dot');
  line.prepend(ic);
  for (const node of [...line.childNodes]) {
    if (node.nodeType !== Node.TEXT_NODE) continue;
    const parts = emojiRuns(node.textContent ?? '');
    if (!parts.some((p) => p.run)) continue;
    node.replaceWith(...parts.map((p) => {
      if (!p.run) return p.text;
      const e = document.createElement('span');
      e.className = 'v3m-e';
      e.textContent = p.text;
      return e;
    }));
  }
}

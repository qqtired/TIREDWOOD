// Значок жетона. Эмодзи монеты 🪙 есть только с Unicode 13 (2020): в старых системных шрифтах (Windows 10 и т. п.)
// его нет, и вместо монетки — пустой квадратик. Поэтому монетку рисуем сами — картинкой SVG в строку текста,
// одинаково на всех системах. Текст с 🪙 (свой и присланный сервером) показываем через помощники ниже: символ —
// картинкой, остальное — текстовыми узлами (в строках бывают ники и чат — никакого innerHTML с чужим текстом).

/** Монетка, как на автоматах (slots3d.ts): золото с бликом слева сверху, тёмный ободок и кольцо внутри. */
const SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'>" +
  "<defs><radialGradient id='g' cx='12' cy='11' r='21' gradientUnits='userSpaceOnUse'>" +
  "<stop offset='0' stop-color='#fff3b0'/><stop offset='.5' stop-color='#ffc93a'/><stop offset='1' stop-color='#b87a00'/>" +
  '</radialGradient></defs>' +
  "<circle cx='16' cy='16' r='14.8' fill='url(#g)' stroke='#8a5a00' stroke-width='2.4'/>" +
  "<circle cx='16' cy='16' r='9.4' fill='none' stroke='#9a6300' stroke-width='1.9'/>" +
  "<path d='M5.2 12.6A11.6 11.6 0 0 1 12.6 5.2' fill='none' stroke='#fffbe8' stroke-width='2.2' stroke-linecap='round'/>" +
  '</svg>';

const SRC = `data:image/svg+xml,${encodeURIComponent(SVG)}`;

/** Значок разметкой — для своих строк, собранных в HTML (внутри только наша картинка). */
export const COIN_HTML = `<img class="coin" src="${SRC}" alt="" draggable="false">`;

/** 🪙 в тексте (и с необязательным селектором эмодзи-вида после него) */
const COIN_RE = /\u{1FA99}\uFE0F?/u;

function coinIcon(): HTMLImageElement {
  const img = document.createElement('img');
  img.className = 'coin';
  img.src = SRC;
  img.alt = '';
  img.draggable = false;
  return img;
}

/** Текст узлами: каждая 🪙 — значком, остальное — текстом. */
function coinNodes(text: string): Node[] {
  const out: Node[] = [];
  text.split(COIN_RE).forEach((part, i) => {
    if (i > 0) out.push(coinIcon());
    if (part) out.push(document.createTextNode(part));
  });
  return out;
}

/** Как el.textContent = text, только монетки — значками. */
export function setCoinText(el: Element, text: string): void {
  el.textContent = '';
  el.append(...coinNodes(text));
}

/** Дописать текст в конец элемента (монетки — значками). */
export function appendCoinText(el: Element, text: string): void {
  el.append(...coinNodes(text));
}

// «Веранда v3» — сообщения: перестройка снятой разметки, если концепцию не сделать одним CSS (в игре — правка компонентов).
// Хуки обоих файлов v3 вызываются по цепочке: сначала v/veranda3.js, потом v/veranda3-msg.js.
//  1. личные награды (.k-toast--reward) уходят из очереди сверху в «кошелёк» .v3m-wallet — слева от бейджа, у счётчика жетонов;
//     сумма в заголовке становится отдельным числом .v3m-num (главное число билета);
//  2. новость про игрока («Тестер7 вытащил…»): имя — отдельным <b class="v3m-who k-nick-N">, цвет — как в чате (client/chat.ts nickTone);
//  3. системные строки чата: значок впереди — первый эмодзи строки или золотой ромбик; список прокручен вниз, как в игре.
(() => {
  const prev = window.__HUDV?.veranda3;
  const nickTone = (nick) => { let h = 0; for (const ch of nick) h = (h * 31 + ch.codePointAt(0)) >>> 0; return (h % 6) + 1; };
  const NEWS = /^(\S+)(?=\s+(?:вытащил|поймал|выиграл|победил|взял|нашёл|нашла|собрал|открыл|добыл|забрал|прош[её]л))/u;
  const EMOJI = /^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}️?)*)\s*/u;
  const RUN = /\p{Extended_Pictographic}️?(?:[  ]*\p{Extended_Pictographic}️?)+/gu;

  function wallet() {
    const queue = document.querySelector('.k-slot--tc > .k-toasts');
    const tr = document.querySelector('.k-hud .k-slot--tr');
    const rewards = queue ? [...queue.querySelectorAll(':scope > .k-toast--reward')] : [];
    if (!tr || !rewards.length) return;
    const box = document.createElement('div');
    box.className = 'v3m-wallet';
    box.setAttribute('aria-live', 'polite');
    for (const t of rewards) { amount(t); box.append(t); }
    tr.prepend(box);
    const badge = tr.querySelector(':scope > .k-badge');
    const fit = () => {
      box.style.setProperty('--v3m-badge-w', `${badge ? badge.offsetWidth : -10}px`);
      box.style.setProperty('--v3m-badge-h', `${badge ? badge.offsetHeight : 40}px`);
    };
    fit();
    if (badge) new ResizeObserver(fit).observe(badge);
  }

  // «+20 <монета> за улов» → <b class="v3m-num">+20</b><монета> за улов
  function amount(toast) {
    const title = toast.querySelector('.k-toast-title');
    const first = title?.firstChild;
    if (first?.nodeType !== 3) return;
    const m = first.textContent.match(/^\s*([+\-−]?\d[\d\s ]*)/u);
    if (!m) return;
    const b = document.createElement('b');
    b.className = 'v3m-num';
    b.textContent = m[1].trim();
    first.textContent = first.textContent.slice(m[0].length);
    title.insertBefore(b, first);
  }

  function news() {
    for (const t of document.querySelectorAll('.k-slot--tc > .k-toasts > .k-toast:not(.k-toast--reward)')) {
      const title = t.querySelector('.k-toast-title');
      const first = title?.firstChild;
      const m = first?.nodeType === 3 && first.textContent.match(NEWS);
      if (!m) continue;
      const who = document.createElement('b');
      who.className = `v3m-who k-nick-${nickTone(m[1])}`;
      who.textContent = m[1];
      first.textContent = first.textContent.slice(m[1].length);
      title.insertBefore(who, first);
    }
  }

  function chat() {
    for (const list of document.querySelectorAll('.k-chat-list')) {
      for (const line of list.querySelectorAll(':scope > .k-chat-line.is-sys')) {
        if (line.querySelector(':scope > .v3m-sys-ic')) continue;
        const ic = document.createElement('i');
        ic.className = 'v3m-sys-ic';
        const first = line.firstChild;
        const m = first?.nodeType === 3 && first.textContent.match(EMOJI);
        if (m) { ic.textContent = m[1]; first.textContent = first.textContent.slice(m[0].length); }
        else ic.classList.add('is-dot');
        line.prepend(ic);
        // рецепт крепости «Пудинг: 💥 🛡️ 🍒 — …»: тройка значков — одним плотным блоком, чтобы строка встала в одну
        for (const node of [...line.childNodes]) {
          if (node.nodeType !== 3 || !RUN.test(node.textContent)) continue;
          RUN.lastIndex = 0;
          const frag = document.createDocumentFragment();
          let at = 0;
          for (const r of node.textContent.matchAll(RUN)) {
            frag.append(node.textContent.slice(at, r.index));
            const e = document.createElement('span');
            e.className = 'v3m-e';
            e.textContent = r[0].replace(/[  ]+/g, '');
            frag.append(e);
            at = r.index + r[0].length;
          }
          frag.append(node.textContent.slice(at));
          node.replaceWith(frag);
        }
      }
      // как в игре (client/chat.ts): видны последние строки
      const down = () => { list.scrollTop = list.scrollHeight; };
      down();
      document.fonts?.ready.then(down);
    }
  }

  (window.__HUDV ||= {}).veranda3 = (scene) => {
    prev?.(scene);
    wallet();
    news();
    chat();
  };
})();

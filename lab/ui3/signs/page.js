// Страница «Вывески v3»: пары «сейчас / v3» из data.js — кадры площади (world) и картинки вывесок из игры (boards, plaques);
// more — другие состояния той же вывески в v3 (идёт гонка, забег и т. п.).
// Нажатие на кадр открывает его крупно в <dialog>; закрыть — щелчком или Esc.
(() => {
  const D = window.SIGNS || {};
  const big = document.querySelector('.sg-big');
  const bigImg = big.querySelector('img');
  const bigCap = big.querySelector('figcaption');
  big.addEventListener('click', () => big.close());

  const open = (src, cap) => {
    bigImg.src = src;
    bigImg.alt = cap;
    bigCap.textContent = cap;
    big.showModal();
  };

  const shot = (src, label, name, cls) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `sg-shot ${cls}`;
    const img = new Image();
    img.src = src;
    img.alt = `${name} — ${label}`;
    img.loading = 'lazy';
    img.decoding = 'async';
    const l = document.createElement('span');
    l.className = 'sg-shot-l';
    l.textContent = label;
    b.append(img, l);
    b.addEventListener('click', () => open(src, `${name} — ${label}`));
    return b;
  };

  const pair = (it, rowCls) => {
    const el = document.createElement('article');
    el.className = 'sg-pair';
    const h = document.createElement('h3');
    h.append(it.name);
    if (it.file) {
      const f = document.createElement('code');
      f.textContent = it.file;
      h.append(f);
    }
    el.append(h);
    if (it.note) {
      const p = document.createElement('p');
      p.textContent = it.note;
      el.append(p);
    }
    const row = document.createElement('div');
    row.className = `sg-row ${rowCls}`;
    if (it.now) row.append(shot(it.now, 'Сейчас', it.name, 'is-now'));
    if (it.v3) row.append(shot(it.v3, 'v3', it.name, 'is-v3'));
    for (const m of it.more ?? []) row.append(shot(m.src, m.label, it.name, 'is-v3'));
    el.append(row);
    return el;
  };

  const fill = (sel, list, rowCls) => {
    const box = document.querySelector(sel);
    if (!list || !list.length) {
      const p = document.createElement('p');
      p.className = 'sg-empty';
      p.textContent = 'Снимки скоро будут.';
      box.append(p);
      return;
    }
    for (const it of list) box.append(pair(it, rowCls));
  };

  fill('.sg-world', D.world, 'sg-row--world');
  fill('.sg-boards', D.boards, 'sg-row--tex');
  fill('.sg-plaques', D.plaques, 'sg-row--tex');
})();

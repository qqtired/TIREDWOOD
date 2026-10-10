// Общие помощники страницы-обзора: DOM, форматирование, markdown, графики, состояние.

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/** h('div.card#id', {class, style, onclick, dataset, html}, ...дети) */
export function h(tag, attrs, ...kids) {
  const m = String(tag).match(/^([a-zA-Z][\w-]*)?((?:[.#][\w-]+)*)$/);
  const el = document.createElement((m && m[1]) || 'div');
  for (const part of (m && m[2] && m[2].match(/[.#][\w-]+/g)) || []) {
    if (part[0] === '.') el.classList.add(part.slice(1));
    else el.id = part.slice(1);
  }
  if (attrs != null && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    kids.unshift(attrs);
    attrs = null;
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.classList.add(...String(v).split(/\s+/).filter(Boolean));
    else if (k === 'style') {
      if (typeof v === 'string') el.style.cssText = v;
      else for (const [sk, sv] of Object.entries(v)) sk.startsWith('--') ? el.style.setProperty(sk, sv) : (el.style[sk] = sv);
    } else if (k === 'html') el.innerHTML = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k in el && typeof v !== 'string' && typeof v !== 'number') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  const add = (c) => {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  };
  kids.forEach(add);
  return el;
}

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ───────────── числа и время ─────────────
export const nf = (n, d = 0) => (n == null || Number.isNaN(n) ? '—' : Number(n).toLocaleString('ru-RU', { maximumFractionDigits: d, minimumFractionDigits: 0 }));
/** минуты → «45 мин», «1,5 ч», «2 сут» */
export function dur(min) {
  if (min == null) return '—';
  if (min < 60) return `${nf(min)} мин`;
  const hh = min / 60;
  if (hh < 24) return `${nf(+hh.toFixed(1))} ч`;
  return `${nf(+(hh / 24).toFixed(1))} сут`;
}
/** часы (реальные) → «41 ч», «2,6 сут» */
export function hrs(hh) {
  if (hh == null) return '—';
  if (hh < 48) return `${nf(+hh.toFixed(hh < 10 ? 1 : 0))} ч`;
  return `${nf(+(hh / 24).toFixed(1))} сут`;
}
export const days = (hh) => (hh == null ? null : hh / 24);
export const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Округление цен под K — как scaleCoin в tools/farm-sim/sim.mjs */
export function scaleCoin(v, K, kind = 'item') {
  if (!v) return 0;
  const x = v * K;
  if (kind === 'item') return Math.max(1, Math.round(x));
  if (x >= 1000) return Math.round(x / 50) * 50;
  if (x >= 100) return Math.round(x / 10) * 10;
  return Math.max(1, Math.round(x));
}

// ───────────── группы культур, архетипы, цвета ─────────────
export const GROUPS = {
  fast: { emoji: '🟢', label: 'Быстрые', sub: 'до 5 мин', cls: 'green' },
  normal: { emoji: '🟡', label: 'Обычные', sub: 'до 30 мин', cls: 'gold' },
  long: { emoji: '🟠', label: 'Долгие', sub: 'от 45 мин', cls: 'terra' },
};
export const ARCH_COLORS = { casual: '#5f8f45', active: '#c66f4c', fast: '#e2b13c', fastNoVan: '#b9a46b', nonstop: '#6f9e8e' };
export const ARCH_ORDER = ['casual', 'active', 'fast', 'fastNoVan', 'nonstop'];
export const PRESET_INFO = {
  base: { label: 'v10 как есть (K = 1)', text: 'Числа исходного документа v10, без правок ведущего.' },
  tweaked: { label: 'Правки ведущего (K = 0,1)', text: 'Пресет tweaked: Пшеница с ур. 1, Грядка 2 = 5 + 4, Микро-зелень 12 XP, цены на свин и компост ниже.' },
  v11a: { label: 'v11: только сжатие цен', text: 'tweaked + сжатие цен культур дольше 20 мин.' },
  v11b: { label: 'v11: только потолок', text: 'tweaked + мягкий дневной потолок продаж.' },
  v11: { label: 'v11 итог (сжатие + потолок)', text: 'Итоговый вариант документа: сжатие поздних цен и дневной потолок продаж.' },
};

// ───────────── состояние ─────────────
export const state = { data: null, K: 0.1, lever: true, tab: null, listeners: new Set() };
export const emit = (what) => state.listeners.forEach((f) => f(what));

// ───────────── пути ─────────────
export const url = (p) => (p ? state.data.base + p : '');
export const iconUrl = (name) => (state.data.icons[name] ? url(state.data.icons[name]) : null);
export function iconImg(name, cls = '', alt = '') {
  const u = iconUrl(name);
  return u ? h('img', { src: u, alt, class: cls, loading: 'lazy', decoding: 'async' }) : null;
}
export const resByKey = (k) => state.data.resKeys.find((r) => r.key === k);
export const cropById = (id) => state.data.crops.find((c) => c.id === id);
export const cropBySim = (id) => state.data.crops.find((c) => c.sim === id);

// ───────────── markdown (минимальный, под документы проекта) ─────────────
function docHref(u) {
  if (/^https?:/.test(u)) return u;
  const clean = u.replace(/#.*$/, '');
  if (!clean) return null;
  try { return new URL('docs/farm/' + clean, new URL(state.data.base, location.href)).pathname; } catch { return null; }
}
function inline(s) {
  s = esc(s);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+?)\*\*/g, (m, t) => (/^изм\.?[:,]?\s*$/i.test(t.trim()) ? `<span class="tag-chg">изм.</span>` : `<strong>${t}</strong>`));
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, t, u) => {
    const href = docHref(u.replace(/&amp;/g, '&'));
    return href ? `<a href="${href}" target="_blank" rel="noopener">${t}</a>` : t;
  });
  s = s.replace(/&lt;br\s*\/?&gt;/g, '<br>');
  return s;
}
function mdTable(lines) {
  const split = (l) => {
    let s = l.trim();
    if (s.startsWith('|')) s = s.slice(1);
    if (s.endsWith('|')) s = s.slice(0, -1);
    const cells = [];
    let cur = '';
    let tick = false;
    for (const ch of s) {
      if (ch === '`') tick = !tick;
      if (ch === '|' && !tick) { cells.push(cur.trim()); cur = ''; } else cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  };
  const head = split(lines[0]);
  const align = split(lines[1]).map((c) => (/^:-+:$/.test(c) ? 'c' : /-:$/.test(c) ? 'r' : ''));
  const rows = lines.slice(2).map(split);
  const th = head.map((c, i) => `<th class="${align[i] === 'r' ? 'r' : ''}">${inline(c)}</th>`).join('');
  const body = rows.map((r) => `<tr>${r.map((c, i) => `<td class="${align[i] === 'r' ? 'r' : ''}">${inline(c)}</td>`).join('')}</tr>`).join('');
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table></div>`;
}
export function md(src) {
  const lines = String(src || '').replace(/[  ]/g, ' ').split('\n');
  const out = [];
  let i = 0;
  const listRe = /^(\s*)([-*]|\d+\.)\s+(.*)$/;
  while (i < lines.length) {
    const ln = lines[i];
    if (!ln.trim()) { i++; continue; }
    if (/^```/.test(ln)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }
    const hm = ln.match(/^(#{1,6})\s+(.*)$/);
    if (hm) {
      const lv = Math.min(5, Math.max(3, hm[1].length + 1));
      out.push(`<h${lv}>${inline(hm[2])}</h${lv}>`);
      i++;
      continue;
    }
    if (/^---+\s*$/.test(ln)) { out.push('<hr>'); i++; continue; }
    if (/^\s*\|/.test(ln) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) {
      const buf = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) buf.push(lines[i++]);
      out.push(mdTable(buf));
      continue;
    }
    if (listRe.test(ln)) {
      // список с вложенностью по отступу
      const items = [];
      while (i < lines.length && (listRe.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
        const m = lines[i].match(listRe);
        if (m) items.push({ indent: m[1].length, ordered: /\d/.test(m[2]), text: m[3] });
        else items[items.length - 1].text += ' ' + lines[i].trim();
        i++;
      }
      const render = (from, to, base) => {
        let html = '';
        let k = from;
        const tag = items[from].ordered ? 'ol' : 'ul';
        html += `<${tag}>`;
        while (k < to) {
          if (items[k].indent > base) { k++; continue; }
          let e = k + 1;
          while (e < to && items[e].indent > items[k].indent) e++;
          html += `<li>${inline(items[k].text)}${e > k + 1 ? render(k + 1, e, items[k].indent) : ''}</li>`;
          k = e;
        }
        return html + `</${tag}>`;
      };
      out.push(render(0, items.length, items[0].indent));
      continue;
    }
    // абзац
    const buf = [ln.trim()];
    i++;
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|---|\s*\||```)/.test(lines[i]) && !listRe.test(lines[i])) buf.push(lines[i++].trim());
    out.push(`<p>${inline(buf.join(' '))}</p>`);
  }
  return out.join('\n');
}
export function mdBlock(src, cls = '') {
  return h('div.md' + (cls ? '.' + cls : ''), { html: md(src) });
}
/** инлайн-markdown для коротких строк */
export const mdInline = (s) => h('span', { html: inline(s) });
export function spanMd(s) { return inline(s); }

// ───────────── таблица из массивов ─────────────
export function table(header, rows, opts = {}) {
  const th = header.map((c, i) => h('th', { class: opts.right?.includes(i) ? 'r' : '' }, c));
  const trs = rows.map((r, ri) =>
    h('tr', { class: opts.rowClass ? opts.rowClass(r, ri) : '' }, r.map((c, i) => h('td', { class: opts.right?.includes(i) ? 'r' : '' }, c instanceof Node || c == null ? c : opts.md ? h('span', { html: inline(String(c)) }) : String(c)))),
  );
  return h('div.tbl-wrap', h('table.tbl', h('thead', h('tr', th)), h('tbody', trs)));
}

// ───────────── сворачиваемые блоки ─────────────
export function acc(title, body, { open = false, chip } = {}) {
  const d = h('details.acc', h('summary', title, chip ? h('span.chip', chip) : null), h('div.acc-body', body));
  if (open) d.open = true;
  return d;
}
/** раздел исходного документа в виде аккордеона */
export function docAcc(num, { title, open = false } = {}) {
  const d = state.data.docs[num];
  if (!d) return null;
  return acc(title || `§${num} · ${d.title}`, mdBlock(d.body), { open, chip: 'из документа' });
}

// ───────────── сегменты и вкладки ─────────────
export function seg(options, value, onChange, cls = '') {
  const el = h('div.seg' + (cls ? '.' + cls : ''));
  const render = () => {
    el.innerHTML = '';
    for (const o of options) {
      el.appendChild(h('button', { type: 'button', 'aria-pressed': String(o.value === value), onclick: () => { value = o.value; render(); onChange(value); }, title: o.title || '' }, o.label));
    }
  };
  render();
  el.set = (v) => { value = v; render(); };
  return el;
}

// ───────────── графики ─────────────
let chartPromise = null;
export function loadChart() {
  if (!chartPromise) {
    chartPromise = new Promise((resolve, reject) => {
      if (window.Chart) return resolve(window.Chart);
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js';
      s.onload = () => {
        const C = window.Chart;
        C.defaults.font.family = "'Rubik', system-ui, sans-serif";
        C.defaults.font.size = 13;
        C.defaults.color = '#6d5d49';
        C.defaults.borderColor = '#e8dcbc';
        C.defaults.plugins.legend.labels.usePointStyle = true;
        C.defaults.plugins.legend.labels.boxWidth = 8;
        C.defaults.plugins.tooltip.backgroundColor = 'rgba(58,46,34,0.94)';
        C.defaults.plugins.tooltip.padding = 10;
        C.defaults.plugins.tooltip.cornerRadius = 10;
        C.defaults.plugins.tooltip.titleFont = { weight: '600' };
        C.defaults.maintainAspectRatio = false;
        C.defaults.animation.duration = 450;
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) C.defaults.animation = false;
        resolve(C);
      };
      s.onerror = () => reject(new Error('Не удалось загрузить Chart.js с CDN'));
      document.head.appendChild(s);
    });
  }
  return chartPromise;
}

export function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  return Promise.resolve(fallbackCopy(text));
}
function fallbackCopy(text) {
  const ta = h('textarea', { style: 'position:fixed;opacity:0' });
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch { /* ignore */ }
  ta.remove();
}

export const debounce = (fn, ms = 120) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

/** безопасный localStorage */
export const store = {
  get(k, def) { try { const v = localStorage.getItem('farm-review:' + k); return v == null ? def : JSON.parse(v); } catch { return def; } },
  set(k, v) { try { localStorage.setItem('farm-review:' + k, JSON.stringify(v)); } catch { /* ignore */ } },
};

/** «- **Заголовок.** текст» → [{title, text}] (строки продолжения склеиваются) */
export function mdBullets(src) {
  const out = [];
  for (const raw of String(src || '').split('\n')) {
    const m = raw.match(/^[-*]\s+\*\*(.+?)\.?\*\*\s*(.*)$/);
    if (m) out.push({ title: m[1].replace(/[.:]$/, ''), text: m[2] });
    else if (/^\s{2,}\S/.test(raw) && out.length) out[out.length - 1].text += ' ' + raw.trim();
  }
  return out;
}
/** нумерованные пункты «1. **Заголовок.** текст» */
export function mdNumbered(src) {
  const out = [];
  for (const raw of String(src || '').split('\n')) {
    const m = raw.match(/^\d+\.\s+\*\*(.+?)\.?\*\*\s*(.*)$/);
    if (m) out.push({ title: m[1].replace(/[.:]$/, ''), text: m[2] });
    else if (/^\s{2,}\S/.test(raw) && out.length) out[out.length - 1].text += ' ' + raw.trim();
  }
  return out;
}

// ───────────── «🪙» → золотая монетка ─────────────
const COIN = '🪙';
const SKIP = /^(SCRIPT|STYLE|CANVAS|TEXTAREA|OPTION|TITLE|SELECT|INPUT)$/i;
function coinEl() {
  const s = document.createElement('span');
  s.className = 'coin';
  s.setAttribute('role', 'img');
  s.setAttribute('aria-label', 'жетон');
  return s;
}
function decorate(node) {
  if (node.nodeType === 3) {
    if (!node.nodeValue.includes(COIN)) return;
    const frag = document.createDocumentFragment();
    node.nodeValue.split(COIN).forEach((p, i) => {
      if (i) frag.appendChild(coinEl());
      if (p) frag.appendChild(document.createTextNode(p));
    });
    node.replaceWith(frag);
  } else if (node.nodeType === 1 && !SKIP.test(node.tagName) && node.namespaceURI !== 'http://www.w3.org/2000/svg') {
    [...node.childNodes].forEach(decorate);
  }
}
export function startCoinDecorator() {
  const obs = new MutationObserver((muts) => muts.forEach((m) => m.addedNodes.forEach(decorate)));
  obs.observe(document.body, { childList: true, subtree: true });
  decorate(document.body);
}
/** убирает хвост «---» (разделитель разделов документа) */
export const noRule = (s) => String(s || '').replace(/\s*\n?-{3,}\s*$/, '').trim();
export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// ───────────── цены культур: документ / симуляция / по K ─────────────
export function leverParams() {
  const s = state.data.sim;
  return s?.presets?.v11?.other?.lateCurve || s?.override?.lateCurve || null;
}
export function simPresetName() {
  const s = state.data.sim;
  if (!s) return null;
  return s.presets.v11 ? 'v11' : s.primary;
}
export function simFinalCrop(c) {
  const s = state.data.sim;
  const p = s?.presets?.[simPresetName()];
  return p?.crops?.find((x) => x.sim === c.sim) || null;
}
/** цена при заданном K (и, по желанию, со сжатием поздних культур — как в симуляции) */
export function priceAtK(c, K, lever) {
  let seed = c.seedV10;
  let sell = c.sellV10;
  const lc = lever ? leverParams() : null;
  if (lc && c.minutes > lc.fromMin) {
    const docProfit = sell - seed;
    const f = Math.min(docProfit, lc.anchorProfit * Math.pow(c.minutes / lc.fromMin, lc.beta)) / docProfit;
    seed *= f;
    sell *= f;
  }
  return { seed: scaleCoin(seed, K, 'item'), sell: scaleCoin(sell, K, 'item') };
}
/** mode: 'doc' | 'sim' | 'k' */
export function priceFor(c, mode = 'doc', K = state.K, lever = state.lever) {
  let seed = c.seed;
  let sell = c.sell;
  if (mode === 'sim') {
    const f = simFinalCrop(c);
    if (f) { seed = f.seed; sell = f.sell; }
  } else if (mode === 'k') {
    ({ seed, sell } = priceAtK(c, K, lever));
  }
  const profit = sell - seed;
  return { seed, sell, profit, coinsH: +((profit * 60) / c.minutes).toFixed(1), xpH: c.minutes ? +((c.xp * 60) / c.minutes).toFixed(0) : null };
}

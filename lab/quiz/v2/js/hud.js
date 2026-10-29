// HUD «Ракушки» на ките UI 2.0 (client/ui/kit): только классы .k-* и токены; свои классы .qz-* — раскладка и мелочи.
// Повторяет игровые детали один в один: бейдж (badge.ts), док чата (chat.ts), плашка события и тосты (topcenter.ts),
// реакции (lobby/hud.ts .pz-emotes), подсказка .k-prompt, ряд клавиш keysRow (modes.ts), окно <section.k-window>.
export const ICON = (id) => `../../../client/assets/ui/icons/${id}.webp`;
export const QIMG = (id) => `img/${id}.png`;
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export const keyHtml = (k, corner, size) => `<kbd class="k-key${size ? ` k-key--${size}` : ''}${corner ? ` k-key--${corner}` : ''}">${esc(k)}</kbd>`;
export const iconImg = (id, cls = 'k-ic') => `<img class="${cls}" src="${ICON(id)}" alt="" draggable="false">`;
export const qImg = (id, cls = 'k-ic') => `<img class="${cls}" src="${QIMG(id)}" alt="" draggable="false">`;
const COIN = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><defs><radialGradient id='g' cx='12' cy='11' r='21' gradientUnits='userSpaceOnUse'><stop offset='0' stop-color='#fff3b0'/><stop offset='.5' stop-color='#ffc93a'/><stop offset='1' stop-color='#b87a00'/></radialGradient></defs><circle cx='16' cy='16' r='14.8' fill='url(#g)' stroke='#8a5a00' stroke-width='2.4'/><circle cx='16' cy='16' r='9.4' fill='none' stroke='#9a6300' stroke-width='1.9'/><path d='M5.2 12.6A11.6 11.6 0 0 1 12.6 5.2' fill='none' stroke='#fffbe8' stroke-width='2.2' stroke-linecap='round'/></svg>";
export const coinHtml = () => `<img class="k-coin" src="data:image/svg+xml,${encodeURIComponent(COIN)}" alt="" draggable="false">`;
const NICK_N = (nick) => { let h = 0; for (const ch of nick) h = (h * 31 + ch.codePointAt(0)) >>> 0; return (h % 6) + 1; };
const MIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
const JELLY = (color) => `<svg viewBox="0 0 64 64"><defs><radialGradient id="jsh" cx=".3" cy=".2" r=".9"><stop stop-color="#fff" stop-opacity=".6"/><stop offset=".4" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#16313a" stop-opacity=".28"/></radialGradient></defs><path d="M32 13C19 13 12 27 10 42C8 55 13 61 32 61S56 55 54 42C52 27 45 13 32 13Z" fill="${color}"/><path d="M32 13C19 13 12 27 10 42C8 55 13 61 32 61S56 55 54 42C52 27 45 13 32 13Z" fill="url(#jsh)"/><ellipse cx="24" cy="32" rx="5" ry="6" fill="#fffcf6"/><ellipse cx="40" cy="32" rx="5" ry="6" fill="#fffcf6"/><ellipse cx="25" cy="32" rx="2.3" ry="3.5" fill="#16313a"/><ellipse cx="39" cy="32" rx="2.3" ry="3.5" fill="#16313a"/><path d="M29 40Q32 43 35 40" stroke="#16313a" stroke-width="1.5" fill="none"/></svg>`;

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

/** HUD целиком: слоты кита + бейдж + док чата с голосом (как в игре). Сцене — ссылки на части. */
export class Hud {
  constructor(root, me) {
    this.root = root;
    root.replaceChildren();
    this.me = me;
    this.slots = {};
    for (const s of ['tl', 'tc', 'tr', 'bl', 'bc', 'br', 'c']) this.slots[s] = root.appendChild(el('div', `k-slot k-slot--${s}`));
    // бейдж — как в игре: портрет, кольцо уровня, жетоны
    this.badge = el('div', 'k-badge', `<span class="k-badge-avatar">${JELLY(me.color)}</span><span class="k-ring" style="--p:.62"><b>${me.level}</b></span><span class="k-badge-tokens">${coinHtml()}<span class="qz-tok">${me.tokens.toLocaleString('ru-RU')}</span></span>`);
    this.slots.tr.appendChild(this.badge);
    this.tc = { event: null, toasts: el('div', 'k-toasts') };
    this.slots.tc.appendChild(this.tc.toasts);
    this.chat = new Dock(this.slots.bl, me);
  }

  /** Плашка события (верх-центр): { icon | img, title(html), sub?, ring?: доля, ringText?, lamp?, tone?, actions? } */
  event(o) {
    this.tc.event?.remove();
    if (!o) { this.tc.event = null; return null; }
    const e = el('div', `k-event qz-event${o.lamp ? ' k-lamp' : ''}${o.tone ? ` k-event--${o.tone}` : ''}`);
    const ic = o.avatar ? `<span class="qz-ev-av">${JELLY(o.avatar)}</span>` : o.img ? qImg(o.img, '') : o.icon ? iconImg(o.icon, '') : '';
    e.innerHTML = `<span class="k-event-ic">${ic}</span><span class="k-event-title">${o.title}</span>${o.sub ? `<span class="k-event-sub">${o.sub}</span>` : ''}` +
      (o.ring != null ? `<span class="k-event-timer qz-ring-wrap"><span class="k-ring k-ring--sm qz-ring" style="--p:${o.ring}"><b>${esc(o.ringText ?? '')}</b></span></span>` : '') +
      (o.timer ? `<span class="k-event-timer">${esc(o.timer)}</span>` : '') +
      (o.actions ? `<span class="k-event-actions">${o.actions}</span>` : '');
    if (this.swapEl && !o.noSwap) { e.classList.add('has-swap'); e.appendChild(this.swapEl); }
    this.slots.tc.prepend(e);
    this.tc.event = e;
    return e;
  }

  /** Обновить кольцо времени на месте (без перерисовки плашки) */
  ring(p, text, hurry = false) {
    const r = this.tc.event?.querySelector('.qz-ring');
    if (!r) return;
    r.style.setProperty('--p', p);
    r.querySelector('b').textContent = text;
    r.classList.toggle('is-hurry', hurry);
  }

  /** Тост под плашкой: { tone: reward|good|warn, icon|img, title(html), sub?, life } */
  toast(o) {
    const t = el('div', `k-toast is-new${o.tone ? ` k-toast--${o.tone}` : ''}`);
    const ic = o.img ? qImg(o.img, '') : o.icon ? iconImg(o.icon, '') : '';
    t.innerHTML = `<span class="k-toast-ic">${ic}</span><span class="k-toast-title">${o.title}</span>${o.sub ? `<span class="k-toast-sub">${o.sub}</span>` : ''}`;
    this.tc.toasts.appendChild(t);
    while (this.tc.toasts.childElementCount > 3) this.tc.toasts.firstElementChild.remove();
    setTimeout(() => { t.classList.add('is-out'); setTimeout(() => t.remove(), 320); }, o.life ?? 3600);
    return t;
  }

  /** Герой-баннер по центру (как «Подсекай!»): на ~3 с */
  hero(title, sub, tone = 'gold') {
    this.slots.c.replaceChildren();
    const h = el('div', `k-hero k-hero--${tone} is-play`, `<p class="k-hero-title">${esc(title)}</p>${sub ? `<span class="k-hero-sub">${sub}</span>` : ''}`);
    this.slots.c.appendChild(h);
    setTimeout(() => h.remove(), 3300);
  }

  /** Подсказка действия «E — …» (низ-центр) */
  prompt(key, text, note) {
    this.slots.bc.querySelector('.qz-prompt')?.remove();
    if (!key) return null;
    const p = el('div', 'k-prompt qz-prompt', `${keyHtml(key)}<span>${esc(text)}</span>${note ? `<span class="k-prompt-sep"></span><span class="k-prompt-note">${esc(note)}</span>` : ''}`);
    this.slots.bc.appendChild(p);
    return p;
  }

  /** Эмоции — игровой ряд 1–7 как есть (client/lobby/hud.ts) и «Встать» над ним */
  seat(onReact, onStand) {
    const list = [['emote', 'Помахать'], ['music', 'Танец'], ['wd-e-sleepy', 'Устал'], ['wd-e-happy', 'Смех'], ['emote', 'Дай пять'], ['heart', 'Обняться'], ['kite', 'Воздушный змей']];
    const box = el('div', 'qz-seat');
    const em = el('div', 'pz-emotes qz-emotes');
    em.style.setProperty('--emote-count', String(list.length));
    list.forEach(([ic, name], i) => {
      const face = i === 4 ? `${iconImg(ic)}${iconImg(ic)}` : iconImg(ic);
      const b = el('button', 'pz-emote', `${keyHtml(String(i + 1), undefined, 'sm')}<span class="pz-emote-face${i === 4 ? ' pz-emote-five' : ''}">${face}</span>`);
      b.type = 'button';
      b.title = `${i + 1} — ${name}`;
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => onReact(i));
      em.appendChild(b);
    });
    this.emotesEl = em;
    const stand = el('button', 'k-btn k-btn--ghost k-btn--sm qz-stand', `Встать${keyHtml('E', 'tr', 'sm')}`);
    stand.type = 'button';
    stand.addEventListener('click', onStand);
    box.append(em, stand);
    this.slots.br.appendChild(box);
    this.seatEl = box;
    return box;
  }

  /** Эмоции выключены, пока цифры заняты (голос 1–4, отметки 1/2/3) */
  emotes(on) { if (this.emotesEl) this.emotesEl.hidden = !on; }

  /** «Сменить игру?» — маленькая кнопка на плашке сверху во время игры; большинство сидящих — новое голосование */
  enableSwap(x, { seated = 5 } = {}) {
    const b = el('button', 'k-btn k-btn--ghost k-btn--sm qz-swap', 'Сменить игру?');
    b.type = 'button';
    b.title = 'Большинство сидящих за — новое голосование';
    let n = 0, mine = false;
    const need = Math.floor(seated / 2) + 1;
    const paint = () => { b.innerHTML = n ? `Сменить игру? <b>${n}/${need}</b>` : 'Сменить игру?'; b.classList.toggle('is-on', mine); };
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => {
      mine = !mine; n += mine ? 1 : -1; paint(); x.sfx.play('click');
      if (!mine || x.swapping) return;
      x.swapping = true;
      // в обзоре остальные сидящие подтягиваются; набралось большинство — голосование
      const add = () => { if (!mine) { x.swapping = false; return; } n++; paint(); if (n >= need) { this.toast({ icon: 'roulette', title: 'Большинство за смену — голосуем' }); x.later(() => x.goMode('vote', 'vote'), 1400); } else x.later(add, 900); };
      x.later(add, 900);
    });
    this.swapEl = b;
    paint();
    if (this.tc.event && !this.tc.event.contains(b)) { this.tc.event.classList.add('has-swap'); this.tc.event.appendChild(b); }
    return b;
  }

  clearSlots(...names) { for (const n of names) this.slots[n].replaceChildren(); if (names.includes('tc')) { this.tc.event = null; this.slots.tc.appendChild(this.tc.toasts); } }

  tokens(n) {
    const t = this.badge.querySelector('.qz-tok');
    t.textContent = n.toLocaleString('ru-RU');
    const b = this.badge.querySelector('.k-badge-tokens');
    b.classList.remove('is-bump'); void b.offsetWidth; b.classList.add('is-bump');
  }

  pop(text) {
    const p = el('span', 'k-pop', text);
    this.badge.appendChild(p);
    setTimeout(() => p.remove(), 1600);
  }
}

/** Док чата (client/chat.ts + .k-chat): строки, поле «В игру:» / «Всем:» (Tab), кнопка голоса.
 *  marks — у загадывающего: у неотмеченных строк кнопки 👍/👎, у самой старой — колпачки 1/2. */
export class Dock {
  constructor(slot, me) {
    this.me = me;
    this.root = el('div', 'k-chat qz-chat');
    this.list = el('div', 'k-chat-list');
    this.bar = el('div', 'k-chat-bar');
    this.voice = el('button', 'k-voice', `${MIC}${keyHtml('V', undefined, 'sm')}`);
    this.voice.type = 'button';
    this.closed = el('button', 'k-chat-closed');
    this.closed.type = 'button';
    this.form = el('label', 'k-chat-input is-typing');
    this.label = el('span', '', 'В игру:');
    this.input = el('input');
    this.input.type = 'text';
    this.input.maxLength = 120;
    this.input.placeholder = 'Догадка или вопрос';
    this.input.autocomplete = 'off';
    this.input.spellcheck = false;
    this.form.append(this.label, this.input);
    this.form.insertAdjacentHTML('beforeend', keyHtml('Enter'));
    this.form.hidden = true;
    this.hint = el('span', 'k-pill k-pill--plate k-pill--sm qz-chat-hint', `${keyHtml('Tab', undefined, 'sm')} всем · ${keyHtml('Esc', undefined, 'sm')} не отправлять`);
    this.hint.hidden = true;
    this.bar.append(this.voice, this.closed, this.form);
    this.root.append(this.list, this.bar, this.hint);
    slot.appendChild(this.root);
    this.scope = 'game';
    this.canGame = true;
    this.onSend = () => {};
    this.onOpen = () => {};
    this.onMark = () => {};
    this.marks = false;
    this.setClosed();
    this.closed.addEventListener('mousedown', (e) => e.preventDefault());
    this.closed.addEventListener('click', () => this.open());
    this.voice.addEventListener('click', () => { this.voice.classList.toggle('is-live'); });
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); const t = this.input.value.trim(); this.input.value = ''; if (t) this.onSend(t, this.scope); this.close(); }
      else if (e.key === 'Escape') { e.preventDefault(); this.close(); }
      else if (e.key === 'Tab') { e.preventDefault(); if (this.canGame) this.setScope(this.scope === 'game' ? 'all' : 'game'); }
    });
    this.label.addEventListener('mousedown', (e) => { e.preventDefault(); if (this.canGame) this.setScope(this.scope === 'game' ? 'all' : 'game'); });
    this.input.addEventListener('blur', () => { if (this.isOpen) setTimeout(() => { if (document.activeElement !== this.input) this.close(); }, 120); });
  }

  setClosed() {
    this.closed.innerHTML = `${keyHtml('Enter')}${this.canGame ? (this.performer ? 'Написать в игру' : 'Угадать — написать в игру') : 'Написать в чат'}`;
  }

  /** Загадывающий или рисующий: пишет «В игру», но не угадывает */
  setPerformer(on) { this.performer = on; this.setClosed(); }

  setCanGame(on) { this.canGame = on; this.setScope(on ? 'game' : 'all'); this.setClosed(); this.hint.innerHTML = on ? `${keyHtml('Tab', undefined, 'sm')} всем · ${keyHtml('Esc', undefined, 'sm')} не отправлять` : `${keyHtml('Esc', undefined, 'sm')} не отправлять`; }

  setScope(s) {
    this.scope = s;
    this.label.textContent = s === 'game' ? 'В игру:' : 'Всем:';
    this.form.classList.toggle('qz-all', s === 'all');
    this.input.placeholder = s === 'game' ? 'Догадка или вопрос' : 'Сообщение';
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.closed.hidden = true;
    this.form.hidden = this.hint.hidden = false;
    this.input.focus();
    this.onOpen(true);
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.closed.hidden = false;
    this.form.hidden = this.hint.hidden = true;
    this.input.blur();
    this.onOpen(false);
  }

  /** Строка: { id, nick, text, own, sys, game, mark: '' | 'warm' | 'miss' | 'win', near } */
  add(line) {
    // одна живая догадка у игрока: новая заменяет его неотмеченную
    if (line.game && !line.sys && !line.mark) {
      for (const o of this.list.querySelectorAll('.qz-line.is-game:not(.is-warm):not(.is-miss):not(.is-win)')) if (o.dataset.nick === line.nick) o.remove();
      this.pending = (this.pending ?? []).filter((p) => p.nick !== line.nick);
    }
    // у загадывающего — не больше 5 неотмеченных, остальные ждут своей очереди
    if (this.marks && line.game && !line.own && !line.mark && this.unmarked() >= 5) { (this.pending ??= []).push(line); this.paintWait(); return null; }
    const row = el('div', `k-chat-line qz-line${line.sys ? ' is-sys' : ''}${line.own ? ' is-own' : ''}`);
    row.dataset.id = line.id ?? '';
    row.dataset.nick = line.nick ?? '';
    if (!line.sys) {
      row.classList.add(`k-nick-${NICK_N(line.nick)}`);
      row.appendChild(el('span', 'qz-mark'));
      const n = el('b'); n.textContent = line.nick; row.appendChild(n);
    }
    const t = el('span', 'qz-text'); t.textContent = line.text; row.appendChild(t);
    if (line.game && !line.sys) row.classList.add('is-game');
    this.list.appendChild(row);
    // не выше 1/4 экрана: лишнее уходит сверху, но неотмеченные (с колпачками) остаются
    while (this.list.childElementCount > 6) {
      const old = [...this.list.children].find((c) => !c.matches('.qz-line.is-game:not(.is-warm):not(.is-miss):not(.is-win)')) ?? this.list.firstElementChild;
      old.remove();
    }
    line.row = row;
    if (this.marks && line.game && !line.own) this.addMarkButtons(line);
    if (line.mark) this.setMark(line, line.mark);
    this.refreshKeys();
    return row;
  }

  unmarked() { return this.list.querySelectorAll('.qz-line.is-game:not(.is-warm):not(.is-miss):not(.is-win) .qz-markbtns').length; }
  paintWait() {
    const n = this.pending?.length ?? 0;
    this.waitEl ??= el('div', 'qz-wait k-faint');
    this.waitEl.textContent = n ? `ещё ${n} ждут отметки` : '';
    if (n && !this.waitEl.isConnected) this.list.before(this.waitEl);
    if (!n) this.waitEl.remove();
  }
  flushWait() { while (this.pending?.length && this.unmarked() < 5) this.add(this.pending.shift()); this.paintWait(); }

  addMarkButtons(line) {
    const box = el('span', 'qz-markbtns');
    const up = el('button', 'qz-mb qz-mb--warm', `<img src="${QIMG('q-warm')}" alt="Тепло">`);
    const down = el('button', 'qz-mb qz-mb--miss', `<img src="${QIMG('q-miss')}" alt="Мимо">`);
    const win = el('button', `qz-mb qz-mb--win${line.near ? ' is-big' : ''}`, `<img src="${QIMG('q-win')}" alt="Угадал">${line.near ? '<span>Угадал</span>' : ''}`);
    up.type = down.type = win.type = 'button';
    up.title = '1 — тепло'; down.title = '2 — мимо'; win.title = '3 — угадал';
    for (const b of [up, down, win]) b.addEventListener('mousedown', (e) => e.preventDefault());
    up.addEventListener('click', () => this.onMark(line, 'warm'));
    down.addEventListener('click', () => this.onMark(line, 'miss'));
    win.addEventListener('click', () => this.onMark(line, 'win'));
    // «похоже на ответ» — «Угадал» первой и крупной
    if (line.near) box.append(win, up, down); else box.append(up, down, win);
    line.row.appendChild(box);
    if (line.near) { line.row.classList.add('is-near'); line.row.querySelector('.qz-text').insertAdjacentHTML('afterend', '<span class="k-pill k-pill--gold k-pill--xs qz-near">похоже на ответ</span>'); }
  }

  setMark(line, mark) {
    line.mark = mark;
    const r = line.row;
    if (!r) return;
    r.classList.remove('is-warm', 'is-miss', 'is-win');
    r.classList.add(`is-${mark}`);
    r.querySelector('.qz-markbtns')?.remove();
    r.querySelector('.qz-near')?.remove();
    const m = r.querySelector('.qz-mark');
    if (m) m.innerHTML = `<img src="${QIMG(mark === 'warm' ? 'q-warm' : mark === 'miss' ? 'q-miss' : 'q-win')}" alt="">`;
    this.refreshKeys();
    if (this.marks) setTimeout(() => this.flushWait(), 0);
  }

  /** Колпачки 1/2/3 — только у самой старой неотмеченной строки (1 тепло, 2 мимо, 3 угадал) */
  refreshKeys() {
    for (const k of this.list.querySelectorAll('.qz-mb .k-key')) k.remove();
    if (!this.marks || this.keysOff) return;
    const first = this.list.querySelector('.qz-line.is-game:not(.is-warm):not(.is-miss):not(.is-win) .qz-markbtns');
    if (!first) return;
    first.querySelector('.qz-mb--warm').insertAdjacentHTML('beforeend', keyHtml('1', 'tr', 'sm'));
    first.querySelector('.qz-mb--miss').insertAdjacentHTML('beforeend', keyHtml('2', 'tr', 'sm'));
    first.querySelector('.qz-mb--win').insertAdjacentHTML('beforeend', keyHtml('3', 'tr', 'sm'));
  }

  clear() { this.list.replaceChildren(); this.pending = []; this.paintWait(); }
}

/** Окно на ките: { eyebrow, title, icon|img, body(html), foot(html), size: 'sm'|'' , mode } → { scrim, win, close() } */
export function openWindow(parent, o, onClose) {
  const scrim = el('div', 'k-scrim qz-scrim');
  const win = el('section', `k-window${o.size ? ` k-window--${o.size}` : ''} is-in qz-window`);
  if (o.mode) win.dataset.mode = o.mode;
  const portrait = o.img ? `<span class="k-win-portrait"><img src="${QIMG(o.img)}" alt=""></span>` : o.icon ? `<span class="k-win-portrait"><img src="${ICON(o.icon)}" alt=""></span>` : '';
  win.innerHTML = `<header class="k-win-head">${portrait}<div class="k-win-titles">${o.eyebrow ? `<p class="k-eyebrow">${esc(o.eyebrow)}</p>` : ''}<h2 class="k-win-title">${esc(o.title)}</h2></div><div class="k-win-tools"><button class="k-close" type="button" aria-label="Закрыть">${keyHtml('Esc')}</button></div></header>` +
    `<div class="k-win-body">${o.body}</div>${o.foot ? `<footer class="k-win-foot">${o.foot}</footer>` : ''}`;
  scrim.appendChild(win);
  parent.appendChild(scrim);
  const close = () => { scrim.remove(); document.removeEventListener('keydown', onKey, true); onClose?.(); };
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
  document.addEventListener('keydown', onKey, true);
  scrim.addEventListener('mousedown', (e) => { if (e.target === scrim) close(); });
  win.querySelector('.k-close').addEventListener('click', close);
  return { scrim, win, close };
}

export { el };

/** «Тепло» — закреплённый список в левом верхнем углу (слот tl), у всех на «Ракушке» на весь раунд (слово владельца).
 *  Последние 5 строк, старые сворачиваются в «ещё N»; новая подсвечена 1,8 с; ниже — подсказки загадывающего. */
export class WarmCard {
  constructor(slot) {
    this.root = el('div', 'k-plate qz-warm');
    this.root.innerHTML = `<div class="qz-warm-head"><img src="${QIMG('q-warm')}" alt=""><b>Тепло</b><span class="k-pill k-pill--good k-pill--xs qz-warm-n">0</span></div><div class="qz-warm-more" hidden></div><div class="qz-warm-list"></div><div class="qz-warm-hints" hidden><p class="qz-warm-hl">подсказки</p></div>`;
    this.list = this.root.querySelector('.qz-warm-list');
    this.more = this.root.querySelector('.qz-warm-more');
    this.count = this.root.querySelector('.qz-warm-n');
    this.hints = this.root.querySelector('.qz-warm-hints');
    this.items = [];
    this.empty = el('div', 'qz-warm-empty k-faint', 'Пока ничего — ждём «тепло»');
    this.list.appendChild(this.empty);
    slot.appendChild(this.root);
  }

  /** Добавить строку; hidden — пока летит отклик (потом show()) */
  add(nick, text, { hidden = false, fresh = true } = {}) {
    this.empty.remove();
    const row = el('div', `qz-warm-row k-nick-${NICK_N(nick)}${fresh ? ' is-new' : ''}${hidden ? ' is-wait' : ''}`);
    row.innerHTML = `<span class="qz-warm-txt"><small></small> <b></b></span>`;
    row.querySelector('small').textContent = nick;
    row.querySelector('b').textContent = text;
    this.list.appendChild(row);
    this.items.push(row);
    const hiddenN = Math.max(0, this.items.length - 5);
    this.items.forEach((r, i) => { r.hidden = i < hiddenN; });
    this.more.hidden = !hiddenN;
    this.more.textContent = `ещё ${hiddenN}`;
    this.count.textContent = String(this.items.length);
    if (fresh) setTimeout(() => row.classList.remove('is-new'), 1800);
    return row;
  }

  show(row) { row.classList.remove('is-wait'); }

  hint(text) {
    this.hints.hidden = false;
    const r = el('div', 'qz-warm-hint is-new', '<span></span>');
    r.querySelector('span').textContent = text;
    this.hints.appendChild(r);
    setTimeout(() => r.classList.remove('is-new'), 1800);
  }
}

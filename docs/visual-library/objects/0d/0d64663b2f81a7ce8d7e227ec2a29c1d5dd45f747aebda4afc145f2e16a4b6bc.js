// Доска идей: стикеры с идеями для игры. Сервер и API — ../server.mjs (/ideas/api/…).
'use strict';

const COLORS = ['yellow', 'pink', 'blue', 'green', 'orange', 'purple'];
const COLOR_NAMES = { yellow: 'жёлтый', pink: 'розовый', blue: 'голубой', green: 'зелёный', orange: 'оранжевый', purple: 'сиреневый' };
const STAMPS = { doing: 'В РАБОТЕ', done: 'СДЕЛАНО ✓' };
const MAX_TEXT = 300;
const POLL_MS = 15000;

const $ = (id) => document.getElementById(id);

// localStorage может быть недоступен (приватный режим) — тогда всё живёт до перезагрузки.
const memory = new Map();
const saved = {
    get(k) {
        try { return localStorage.getItem(k) ?? memory.get(k) ?? null; } catch { return memory.get(k) ?? null; }
    },
    set(k, v) {
        memory.set(k, v);
        try { localStorage.setItem(k, v); } catch { /* ничего */ }
    },
    del(k) {
        memory.delete(k);
        try { localStorage.removeItem(k); } catch { /* ничего */ }
    },
};

/** Случайный ключ этого браузера: по нему сервер считает лайки и узнаёт свои заметки. */
function browserKey() {
    let key = saved.get('ideas.key');
    if (!key || !/^[A-Za-z0-9_-]{16,64}$/.test(key)) {
        const bytes = crypto.getRandomValues(new Uint8Array(16));
        key = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        saved.set('ideas.key', key);
    }
    return key;
}

// Ссылка админа: …/ideas/#admin=<секрет>. Секрет запоминаем и убираем из адреса.
// Проверяем и при загрузке, и при смене адреса (ссылку могут открыть во вкладке, где доска уже открыта).
function takeAdminHash() {
    const m = /^#admin=([A-Za-z0-9_-]{20,})$/.exec(location.hash);
    if (!m) return false;
    saved.set('ideas.admin', m[1]);
    history.replaceState(null, '', location.pathname + location.search);
    return true;
}
takeAdminHash();

const state = {
    key: browserKey(),
    adminToken: saved.get('ideas.admin') || '',
    admin: false,
    notes: [],
    clockSkew: 0,
    tab: 'open',
    sort: 'new',
    color: COLORS.includes(saved.get('ideas.color')) ? saved.get('ideas.color') : COLORS[Math.floor(Math.random() * COLORS.length)],
    fresh: 0,
    drawn: '',
};

async function api(method, path, body) {
    const headers = { 'x-ideas-key': state.key };
    if (state.adminToken) headers['x-ideas-admin'] = state.adminToken;
    if (body) headers['content-type'] = 'application/json';
    let res;
    try {
        res = await fetch(`api/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    } catch {
        throw new Error('Нет связи с сервером — проверь интернет');
    }
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Сервер не ответил, попробуй ещё раз');
    return data;
}

// --- плашка с сообщением ---

let toastTimer = 0;
function toast(message) {
    const el = $('toast');
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3800);
}

// --- время и вид ---

function ago(t) {
    const s = Math.max(0, (Date.now() + state.clockSkew - t) / 1000);
    if (s < 60) return 'только что';
    if (s < 3600) return `${Math.floor(s / 60)} мин назад`;
    if (s < 86400) return `${Math.floor(s / 3600)} ч назад`;
    if (s < 7 * 86400) return `${Math.floor(s / 86400)} дн. назад`;
    return new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

/** Наклон стикера: от −2,4° до 2,4°, у каждой заметки свой и не меняется. */
const tilt = (id) => (((id * 47) % 9) - 4) * 0.6;

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function button(className, text, label, onClick) {
    const b = el('button', className, text);
    b.type = 'button';
    if (label) b.setAttribute('aria-label', label);
    b.addEventListener('click', onClick);
    return b;
}

function card(n) {
    const note = el('article', `note c-${COLORS.includes(n.color) ? n.color : 'yellow'}${n.status !== 'new' ? ` s-${n.status}` : ''}`);
    note.style.setProperty('--tilt', `${tilt(n.id)}deg`);
    if (n.id === state.fresh) note.classList.add('fresh');

    if (STAMPS[n.status]) note.append(el('span', 'stamp', STAMPS[n.status]));
    note.append(el('p', 'text', n.text));

    const meta = el('div', 'meta');
    meta.append(el('span', 'who', n.nick));
    const when = el('time', 'when', ago(n.created));
    when.dateTime = new Date(n.created).toISOString();
    when.title = new Date(n.created).toLocaleString('ru-RU');
    meta.append(when);
    const like = button('like', n.likes ? `👍 ${n.likes}` : '👍', n.liked ? 'Убрать лайк' : 'Нравится', () => toggleLike(n.id));
    like.setAttribute('aria-pressed', String(n.liked));
    meta.append(like);
    note.append(meta);

    if (n.mine || state.admin) note.append(button('del', '×', 'Удалить идею', () => removeNote(n)));

    if (state.admin) {
        const row = el('div', 'admin');
        const choices = { new: [['в работу', 'doing'], ['сделано', 'done']], doing: [['сделано', 'done'], ['назад в идеи', 'new']], done: [['вернуть в идеи', 'new']] };
        for (const [label, status] of choices[n.status] ?? choices.new) row.append(button('', label, '', () => setStatus(n.id, status)));
        note.append(row);
    }
    return note;
}

function visibleNotes() {
    const list = state.notes.filter((n) => (state.tab === 'done' ? n.status === 'done' : n.status !== 'done'));
    const byNew = (a, b) => b.created - a.created || b.id - a.id;
    return list.sort(state.sort === 'top' ? (a, b) => b.likes - a.likes || byNew(a, b) : byNew);
}

function render(force = false) {
    const open = state.notes.filter((n) => n.status !== 'done').length;
    $('n-open').textContent = open ? String(open) : '';
    $('n-done').textContent = state.notes.length - open ? String(state.notes.length - open) : '';
    $('admin-bar').hidden = !state.admin;
    for (const b of document.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === state.tab));
    for (const b of document.querySelectorAll('[data-sort]')) b.setAttribute('aria-pressed', String(b.dataset.sort === state.sort));

    const list = visibleNotes();
    // Перерисовываем, только если что-то поменялось (или прошла минута — обновить «N мин назад»).
    const stamp = JSON.stringify([list, state.tab, state.sort, state.admin, Math.floor(Date.now() / 60000)]);
    if (!force && stamp === state.drawn) return;
    state.drawn = stamp;

    const board = $('board');
    board.replaceChildren(...list.map(card));
    const empty = $('empty');
    empty.hidden = list.length > 0;
    empty.textContent = state.tab === 'done' ? 'Сделанных идей пока нет — но всё впереди.' : 'Пока ни одной идеи. Приклей первую!';
    state.fresh = 0;
}

// --- данные ---

async function refresh() {
    try {
        const data = await api('GET', 'notes');
        state.notes = data.notes;
        state.clockSkew = data.now - Date.now();
        if (state.adminToken && !data.admin) {
            saved.del('ideas.admin');
            state.adminToken = '';
            toast('Ссылка админа устарела — режим админа выключен');
        }
        state.admin = data.admin;
        render();
    } catch (e) {
        toast(e.message);
    }
}

function replace(note) {
    const i = state.notes.findIndex((n) => n.id === note.id);
    if (i >= 0) state.notes[i] = note;
    render();
}

async function toggleLike(id) {
    try {
        replace((await api('POST', `notes/${id}/like`)).note);
    } catch (e) {
        toast(e.message);
    }
}

async function removeNote(n) {
    const short = n.text.length > 60 ? `${n.text.slice(0, 60)}…` : n.text;
    if (!confirm(`Удалить идею «${short}»?`)) return;
    try {
        await api('DELETE', `notes/${n.id}`);
        state.notes = state.notes.filter((x) => x.id !== n.id);
        render();
    } catch (e) {
        toast(e.message);
    }
}

async function setStatus(id, status) {
    try {
        replace((await api('POST', `notes/${id}/status`, { status })).note);
        toast(status === 'done' ? 'Отмечено: сделано ✓' : status === 'doing' ? 'Отмечено: в работе' : 'Вернул в идеи');
    } catch (e) {
        toast(e.message);
    }
}

// --- форма ---

function drawColors() {
    const box = $('colors');
    box.replaceChildren(...COLORS.map((c) => {
        const b = button(`swatch c-${c}`, '', `Цвет: ${COLOR_NAMES[c]}`, () => {
            state.color = c;
            saved.set('ideas.color', c);
            drawColors();
        });
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', String(c === state.color));
        return b;
    }));
}

function updateCount() {
    const n = [...$('text').value].length;
    const count = $('count');
    count.textContent = `${n}/${MAX_TEXT}`;
    count.classList.toggle('near', n > MAX_TEXT - 30);
}

async function submit(event) {
    event.preventDefault();
    const text = $('text').value.trim();
    const nick = $('nick').value.trim();
    if (!text) { toast('Напиши идею'); $('text').focus(); return; }
    if (!nick) { toast('Напиши свой ник — чтобы было понятно, чья идея'); $('nick').focus(); return; }
    const send = $('send');
    send.disabled = true;
    try {
        const { note } = await api('POST', 'notes', { text, nick, color: state.color });
        saved.set('ideas.nick', nick);
        $('text').value = '';
        updateCount();
        state.notes.push(note);
        state.fresh = note.id;
        state.tab = 'open';
        render(true);
        document.querySelector('.note.fresh')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } catch (e) {
        toast(e.message);
    } finally {
        send.disabled = false;
    }
}

// --- запуск ---

$('nick').value = saved.get('ideas.nick') || saved.get('opus.nick') || '';
drawColors();
updateCount();
$('compose').addEventListener('submit', submit);
$('text').addEventListener('input', updateCount);
$('text').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) $('compose').requestSubmit();
});
for (const b of document.querySelectorAll('[data-tab]')) b.addEventListener('click', () => { state.tab = b.dataset.tab; render(); });
for (const b of document.querySelectorAll('[data-sort]')) b.addEventListener('click', () => { state.sort = b.dataset.sort; render(); });
$('admin-exit').addEventListener('click', () => {
    saved.del('ideas.admin');
    state.adminToken = '';
    state.admin = false;
    render(true);
});

window.addEventListener('hashchange', () => {
    if (!takeAdminHash()) return;
    state.adminToken = saved.get('ideas.admin');
    refresh();
});

refresh();
setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, POLL_MS);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });

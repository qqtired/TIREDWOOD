// «Своя игра», «Крокодил», «Кто из нас?» — кадры по шагам на том же устройстве, что «Загадка».
// Длина: «Своя игра» — один раунд пака, «Крокодил» — круг (каждый желающий рисует раз, до 6), «Кто из нас?» — 10 вопросов;
// затем «Итоги» (results.js) и снова голосование «Во что играем?».
import { BOARD_H, BOARD_W, drawStrokes, jpCellRect, packRect, paintCroc, paintCrocQueue, paintJeopardy, paintPacks, paintPlate, paintWho } from './world/boards-more.js';
import { mmss } from './world/paint.js';
import { ICON, el, esc, iconImg, keyHtml, openWindow } from './hud.js';

const heads = (x, role) => (x.frame.heads ?? []).filter((h) => h.role === role && (h.vis ?? 1) >= 0.5);
const zat = (x) => (x.frame.heads ?? []).find((h) => (h.role === 'zatejnik' || h.role === 'host') && (h.vis ?? 1) >= 0.5);
function boardOf(x) { return x.frame.board ? x.stage.quad(x.frame.board, BOARD_W, BOARD_H, 'st-board') : null; }
function painter(x, board, fn, s) {
  let t0 = performance.now();
  const draw = () => { if (board) { fn(board.ctx, s, performance.now() - t0); board.flush(); } };
  draw();
  x.every(draw, 250);
  return { board, draw, reset: () => { t0 = performance.now(); draw(); } };
}
const img = (id) => { const i = new Image(); i.src = ICON(id); return i; };
/** Точка мыши → точка кадра 1440×900 (кадр масштабирован целиком) */
function framePt(x, e) {
  const b = x.stage.root.getBoundingClientRect(), k = b.width / 1440;
  return [(e.clientX - b.left) / k, (e.clientY - b.top) / k];
}

/** Невидимые кнопки поверх прямоугольников табло (px холста 2048×1024): клик и наведение прямо по 3D-табло */
function boardHits(x, board, rects, onClick, onHover) {
  if (!board) return [];
  return rects.map((r, i) => {
    if (!r) return null;
    const pts = [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]].map(([u, v]) => board.toStage(u, v));
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const x0 = Math.min(...xs), y0 = Math.min(...ys);
    const b = el('button', 'qo-hit');
    b.type = 'button';
    Object.assign(b.style, {
      left: `${x0}px`, top: `${y0}px`, width: `${Math.max(...xs) - x0}px`, height: `${Math.max(...ys) - y0}px`,
      clipPath: `polygon(${pts.map(([px, py]) => `${(px - x0).toFixed(1)}px ${(py - y0).toFixed(1)}px`).join(', ')})`,
    });
    b.addEventListener('mouseenter', () => onHover?.(i));
    b.addEventListener('mouseleave', () => onHover?.(null));
    b.addEventListener('click', () => onClick(i));
    x.layer.appendChild(b);
    return b;
  });
}

/** Ник над головой (в мире, мелкой плашкой) — у игрока за пультом */
function headTag(x, head, nick, own = false) {
  const t = el('span', `qo-tag${own ? ' is-own' : ''}`, esc(nick));
  Object.assign(t.style, { left: `${head.x}px`, top: `${head.y - 6}px` });
  x.stage.world.appendChild(t);
  const hd = x.stage.heads.get(head.id);
  if (hd) hd.tag = { el: t, h: 26 };
  return t;
}

/** Итоги режима — общий results.js ведущего; пока его нет — простая плашка */
function finale(x, o) {
  import('./results.js').then((m) => m.results(x, o)).catch(() => {
    x.hud.event({ icon: o.icon, title: `${esc(o.name)} · <b>итоги</b>`, sub: 'голосование через 0:10' });
  });
}
const swap = (x) => x.hud.enableSwap?.(x);
const nicks = (x, map) => { for (const [id, n] of Object.entries(map)) x.stage.nick?.(id, n); };

// ---------------------------------------------------------------- «Своя игра»
const THEMES = [
  { name: 'Набережная', cells: [100, 200, 300, 400, 500] },
  { name: 'Рыбалка', cells: [100, 0, 300, 400, 500] },
  { name: 'Кино 90-х', cells: [100, 200, 300, 400, 500] },
  { name: 'Песни у костра', cells: [0, 200, 300, 0, 500] },
  { name: 'Кухня', cells: [100, 200, 0, 400, 500] },
  { name: 'Города', cells: [100, 200, 300, 400, 0] },
];
const PACKS = [
  { name: 'Набережная', sub: '6 тем · 2 раунда' },
  { name: 'Кино и песни', sub: '6 тем · 2 раунда' },
  { name: 'Всё обо всём', sub: '12 тем · 3 раунда' },
];
const Q = { theme: 'Рыбалка', price: 300, text: 'Кому Дед Семён платит за рыбу больше всех?', answer: 'Осётр' };
const QS = { 'Набережная': 'Что стоит в самом конце пирса и светит кораблям?', 'Кино 90-х': 'Как звали кота из «Ну, погоди!»? Шутка: там его нет. А кто там есть?', 'Кухня': 'Из чего варят уху?', 'Города': 'В каком городе стоит Эрмитаж?', 'Песни у костра': 'Какую песню поют, когда гитара одна, а аккордов три?' };
const themes = () => THEMES.map((t) => ({ ...t, cells: [...t.cells] }));
const CAST = [{ nick: 'Оля', score: 600 }, { nick: 'Петя', score: 300 }, { nick: 'Соня', score: 900 }];
const CAST2 = [{ nick: 'Оля', score: 600 }, { nick: 'Соня', score: 900 }];

/** Пульты: игроки стоят у пультов с желейками (головы podium по id пульта). «Я» — за пультом с горящей кнопкой в кадре
 *  телекамеры (p3), не за пустым. Табличка — только счёт; ник — над головой, над собой — нет */
function jpSeats(x, cast, withMe = false) {
  const plates = x.frame.plates ?? [];
  const pod = new Map(heads(x, 'podium').map((h) => [h.id, h]));
  const taken = plates.filter((p) => pod.has(p.id));
  const mine = withMe ? (taken.find((p) => p.id === 'p3') ?? taken[Math.floor(taken.length / 2)]) : null;
  const rest = taken.filter((p) => p !== mine);
  const players = cast.map((c, i) => ({ ...c, plate: rest[i]?.id, head: pod.get(rest[i]?.id) }));
  if (withMe) players.push({ nick: x.me.nick, score: 300, own: true, plate: mine?.id, head: pod.get(mine?.id) });
  const quads = plates.map((p) => ({ id: p.id, q: x.stage.quad(p.q, 512, 256, 'st-plate') }));
  const draw = () => { for (const { id, q } of quads) { paintPlate(q.ctx, players.find((p) => p.plate === id) ?? null); q.flush(); } };
  draw();
  for (const p of players) if (p.head && !p.own) { headTag(x, p.head, p.nick); x.stage.nick?.(p.head.id, p.nick); }
  const by = (nick) => players.find((p) => p.nick === nick);
  return {
    players, draw, by,
    /** Ход: золотая рамка пульта и «Ход: …» на табло */
    turn(nick) { for (const p of players) p.turn = p.nick === nick; draw(); },
    /** Лампа: горит у отвечающего (только у него) */
    lit(nick) { for (const p of players) p.lit = p.nick === nick; draw(); for (const r of x.stage.world.querySelectorAll('.st-ring')) r.remove(); const h = by(nick)?.head; if (h) x.stage.ring(h.id); },
  };
}

export const JEOPARDY = {
  id: 'jeopardy',
  title: 'Своя игра',
  steps: [
    {
      id: 'pack', frame: 'jeopardy-host', fallback: 'riddle-stage', title: 'Пак и темы',
      caption: 'У трибуны: пак и темы, свой пак — файл .siq, или «Пусть ведёт Затейник»',
      run(x) {
        const { hud } = x;
        hud.chat.setCanGame(false);
        hud.event({ icon: 'bell', title: 'Своя игра · <b>ты у трибуны</b>', sub: 'за пультами 3 из 6' });
        painter(x, boardOf(x), paintJeopardy, { phase: 'grid', round: 'раунд 1', themes: themes(), pick: null, hover: null, q: Q, open: 0 });
        if ((x.frame.plates ?? []).length) jpSeats(x, CAST.map((c) => ({ ...c, score: 0 })));
        const packs = [...PACKS];
        let who = 'me', pi = 0;
        const body = () => `<div class="qj-setup">
          <div class="k-seg qj-who"><button type="button" data-who="me" class="${who === 'me' ? 'is-on' : ''}">Веду я</button><button type="button" data-who="bot" class="${who === 'bot' ? 'is-on' : ''}">Пусть ведёт Затейник</button></div>
          ${who === 'me' ? `<div class="qj-packs">${packs.map((p, i) => `<button type="button" class="qj-pack${i === pi ? ' is-on' : ''}" data-i="${i}">${iconImg(p.siq ? 'scroll' : 'bell', 'qj-pack-ic')}<b>${esc(p.name)}</b><span>${esc(p.sub)}</span></button>`).join('')}</div>
          <p class="k-eyebrow qj-eb">Темы раунда 1 — сними лишние</p>
          <div class="qj-themes">${THEMES.map((t) => `<label class="qj-theme"><input type="checkbox" checked><span>${esc(t.name)}</span></label>`).join('')}</div>
          <div class="qj-siq">${iconImg('scroll')}<span>Свой пак из SIGame — файл <b>.siq</b></span><button type="button" class="k-btn k-btn--ghost k-btn--sm" data-a="siq">Загрузить .siq</button></div>`
          : '<p class="qj-bot">Затейник ведёт сам, а пак выберет зал: три пака на табло, голос — 1–3 или клик по табло.</p>'}
        </div>`;
        const w = openWindow(x.layer, {
          icon: 'bell', eyebrow: '«Ракушка» · Своя игра', title: 'Пак и темы', mode: 'jeopardy', body: body(),
          foot: '<span class="k-faint">Начать можно, когда за пультами двое и больше</span><button type="button" class="k-btn k-btn--go" data-a="start">Начать</button>',
        }, () => x.sfx.play('close'));
        const bodyEl = w.win.querySelector('.k-win-body');
        const wire = () => {
          for (const b of bodyEl.querySelectorAll('[data-who]')) b.addEventListener('click', () => { who = b.dataset.who; x.sfx.play('click'); bodyEl.innerHTML = body(); wire(); });
          for (const b of bodyEl.querySelectorAll('[data-i]')) b.addEventListener('click', () => { pi = Number(b.dataset.i); x.sfx.play('click'); bodyEl.innerHTML = body(); wire(); });
          for (const c of bodyEl.querySelectorAll('.qj-theme input')) c.addEventListener('change', () => { x.sfx.play('click'); if (bodyEl.querySelectorAll('.qj-theme input:checked').length < 3) { c.checked = true; hud.toast({ icon: 'bell', title: 'Нужно хотя бы 3 темы' }); } });
          bodyEl.querySelector('[data-a="siq"]')?.addEventListener('click', () => {
            if (!packs.some((p) => p.siq)) packs.push({ name: 'Мой пак', sub: 'из файла .siq · 5 тем', siq: true });
            pi = packs.length - 1; x.sfx.play('pop'); bodyEl.innerHTML = body(); wire();
          });
        };
        wire();
        w.win.querySelector('[data-a="start"]').addEventListener('click', () => { x.sfx.play('open'); x.go(who === 'bot' ? 'packvote' : 'host'); });
      },
    },
    {
      id: 'packvote', frame: 'jeopardy-seat', title: 'Пак выбирает зал',
      caption: 'Ведёт Затейник — пак выбирает зал: 1–3 или клик по карточке на табло',
      run(x) {
        const { hud, stage } = x;
        hud.chat.setCanGame(false);
        const s = { packs: PACKS.map((p) => ({ ...p, n: 0 })), left: 10, total: 10, icon: img('bell'), hover: null, win: null };
        const b = painter(x, boardOf(x), paintPacks, s);
        const votes = new Map(), voters = 5;
        const plate = el('div', 'k-plate qo-vote');
        plate.innerHTML = `<img class="qo-vote-ic" src="${ICON('bell')}" alt=""><b>Какой пак?</b><span class="qo-vote-t">0:10</span>` +
          PACKS.map((p, i) => `<button type="button" class="qo-vopt" data-i="${i}">${keyHtml(String(i + 1), 'tl', 'sm')}<span>${esc(p.name)}</span></button>`).join('');
        hud.slots.tc.prepend(plate);
        const timeEl = plate.querySelector('.qo-vote-t');
        const z = zat(x);
        if (z) stage.say(z.id, 'Выбираем пак — жмите 1–3!', 'new', 5000, 'Затейник');
        const update = () => {
          s.packs.forEach((p, i) => { p.n = [...votes.values()].filter((v) => v === i).length; });
          for (const o of plate.querySelectorAll('.qo-vopt')) o.classList.toggle('is-mine', votes.get('me') === Number(o.dataset.i));
          b.draw();
          if (votes.size === voters && s.left > 3) s.left = 3;
        };
        const vote = (i, who = 'me') => { if (s.win != null) return; votes.set(who, i); if (who === 'me') x.sfx.play('pop'); update(); };
        for (const o of plate.querySelectorAll('.qo-vopt')) o.addEventListener('click', () => vote(Number(o.dataset.i)));
        boardHits(x, b.board, PACKS.map((_, i) => packRect(i)), (i) => vote(i), (i) => { s.hover = i; b.draw(); });
        [[700, 0], [1500, 1], [2300, 0], [3100, 2]].forEach(([t, i], k) => x.later(() => vote(i, `bot${k}`), t));
        x.key = (e) => { const n = Number(e.key); if (n >= 1 && n <= 3) { vote(n - 1); return true; } return false; };
        x.every(() => {
          if (s.win != null) return;
          s.left = Math.max(0, s.left - 1);
          timeEl.textContent = mmss(s.left);
          b.draw();
          if (s.left > 0) return;
          const max = Math.max(...s.packs.map((p) => p.n));
          s.win = s.packs.findIndex((p) => p.n === max);
          for (const h of x.layer.querySelectorAll('.qo-hit')) h.remove();
          plate.remove();
          b.reset();
          x.sfx.play('win');
          hud.event({ icon: 'bell', title: `Пак: <b>${esc(PACKS[s.win].name)}</b>`, tone: 'good' });
          if (z) stage.say(z.id, 'Поехали! Первый ход — Оля', 'new', 4000, 'Затейник');
        }, 1000);
      },
    },
    {
      id: 'watch', frame: 'jeopardy-seat', title: 'Табло тем и вопрос',
      caption: 'Со стула: «Ход: Оля» на табло и её пульт в золоте; лампа — у того, кто отвечает',
      run(x) {
        const { hud, stage } = x;
        const seats = jpSeats(x, CAST);
        const s = { phase: 'grid', round: 'раунд 1', turn: 'Оля', themes: themes(), pick: null, hover: null, q: Q, open: 0 };
        const b = painter(x, boardOf(x), paintJeopardy, s);
        hud.chat.setCanGame(false);
        swap(x);
        hud.event({ icon: 'bell', title: 'Своя игра · <b>«Набережная»</b>' });
        hud.seat(() => x.sfx.play('pop'), () => x.sfx.play('click'));
        const z = zat(x);
        seats.turn('Оля');
        // Оля водит по табло и выбирает «Рыбалка · 300»
        [[0, 1], [1, 3], [1, 2]].forEach((h, i) => x.later(() => { s.hover = h; b.draw(); }, 700 + i * 450));
        x.later(() => { s.hover = null; s.pick = [1, 2]; x.sfx.play('click'); b.draw(); if (z) stage.say(z.id, 'Рыбалка за 300!', 'new', 2600, 'Затейник'); }, 2200);
        x.later(() => {
          s.phase = 'question'; s.open = 0; s.buzz = null; b.reset();
          let k = 0;
          x.every(() => { if (s.phase === 'question' && !s.buzz && k < 10) { k++; s.open = k / 10; } }, 300);
        }, 3400);
        x.later(() => { s.buzz = { nick: 'Петя', left: 10 }; seats.lit('Петя'); b.draw(); x.sfx.play('warm'); }, 6800);
        x.later(() => { const h = seats.by('Петя')?.head; if (h) stage.say(h.id, 'осётр!', 'new', 2500, 'Петя'); }, 7800);
        x.later(() => {
          s.phase = 'answer'; s.verdict = 'yes'; s.by = 'Петя'; b.reset();
          const p = seats.by('Петя'); p.score += 300; seats.lit(null); seats.turn('Петя');
          for (const r of stage.world.querySelectorAll('.st-ring')) r.remove();
          x.sfx.play('win');
        }, 9800);
        x.later(() => { s.themes[1].cells[2] = 0; s.turn = 'Петя'; s.pick = null; s.phase = 'grid'; b.draw(); }, 12800);
      },
    },
    {
      id: 'cell', frame: 'jeopardy-player', fallback: 'jeopardy-seat', title: 'Твой ход: клетка',
      caption: 'Твой ход: наведи на табло — клетка подсвечивается, клик — вопрос',
      run(x) {
        const { hud, stage } = x;
        const seats = jpSeats(x, CAST2, true);
        seats.turn(x.me.nick);
        const s = { phase: 'grid', round: 'раунд 1', turn: x.me.nick, themes: themes(), pick: null, hover: null, q: Q, open: 0 };
        const b = painter(x, boardOf(x), paintJeopardy, s);
        hud.chat.setCanGame(false);
        swap(x);
        hud.event({ icon: 'bell', title: '<b>Твой ход</b> — выбери вопрос', sub: 'клик по клетке на табло' });
        const rects = [];
        s.themes.forEach((th, r) => th.cells.forEach((v, c) => rects.push(v ? { ...jpCellRect(r, c), r, c } : null)));
        let done = false;
        boardHits(x, b.board, rects, (i) => {
          if (done) return;
          done = true;
          const { r, c } = rects[i];
          s.pick = [r, c]; s.hover = null; b.draw(); x.sfx.play('click');
          for (const h of x.layer.querySelectorAll('.qo-hit')) h.remove();
          const th = s.themes[r], price = th.cells[c];
          x.data.jpQ = th.name === 'Рыбалка' && price === 300 ? Q : { theme: th.name, price, text: QS[th.name] ?? Q.text, answer: th.name === 'Набережная' ? 'Маяк' : Q.answer };
          const z = zat(x);
          if (z) stage.say(z.id, `${th.name} за ${price}!`, 'new', 2000, 'Затейник');
          hud.event({ icon: 'bell', title: `${esc(th.name)} · <b>${price}</b>`, sub: 'вопрос открывается' });
          x.later(() => x.go('player'), 1500);
        }, (i) => { s.hover = i == null ? null : [rects[i].r, rects[i].c]; b.draw(); });
      },
    },
    {
      id: 'player', frame: 'jeopardy-player', fallback: 'jeopardy-seat', title: 'Жму!',
      caption: 'За пультом: Пробел — «жму!», рано — кнопка ждёт 1 с; ответ голосом (V) или Enter',
      run(x) {
        const { hud } = x;
        const q = x.data.jpQ ?? Q;
        const seats = jpSeats(x, CAST2, true);
        const s = { phase: 'question', q, open: 0, themes: THEMES };
        const b = painter(x, boardOf(x), paintJeopardy, s);
        const me = seats.by(x.me.nick);
        hud.chat.setCanGame(false);
        swap(x);
        hud.event({ icon: 'bell', title: 'Ты за пультом' });
        const buzz = el('div', 'qz-buzz qo-buzz');
        hud.slots.bc.appendChild(buzz);
        buzz.innerHTML = `<button class="k-btn k-btn--lg qz-buzz-btn" type="button">Жму!${keyHtml('Пробел', 'tr', 'sm')}</button><span class="k-meter k-meter--thin qz-buzz-meter" style="--v:0"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i></span><span class="k-faint qz-buzz-note">кнопки откроются…</span>`;
        const btn = buzz.querySelector('button'), meter = buzz.querySelector('.k-meter'), note = buzz.querySelector('.qz-buzz-note');
        let k = 0, open = false, done = false, blocked = 0;
        const N = 14;
        const look = () => {
          const wait = blocked > performance.now();
          btn.classList.toggle('k-btn--go', open && !wait);
          btn.classList.toggle('is-blocked', wait);
          if (!wait && open) note.textContent = 'жми, пока не опередили';
        };
        x.every(() => {
          if (done || k >= N) return;
          k++; s.open = k / N; meter.style.setProperty('--v', s.open);
          if (k === N) { open = true; x.sfx.play('tick'); look(); }
        }, 250);
        // ответ пишут строкой чата (Enter — всегда чат); кнопка по центру — для мыши, без своей подсказки клавиши
        const answer = () => { if (!answered) hud.chat.open(); };
        const writeBtn = () => {
          const w = el('button', 'k-btn k-btn--ghost qo-write', 'Написать ответ');
          w.type = 'button';
          w.addEventListener('mousedown', (e) => e.preventDefault());
          w.addEventListener('click', answer);
          hud.slots.bc.appendChild(w);
          hud.chat.closed.innerHTML = `${keyHtml('Enter')}Написать ответ`;
          hud.chat.input.placeholder = 'Твой ответ';
          hud.chat.onSend = (t) => { hud.chat.add({ nick: x.me.nick, text: t, own: true, game: true }); hud.slots.bc.querySelector('.qo-write')?.remove(); verdict(t); };
        };
        let left = 10, answered = false;
        const verdict = (v) => {
          if (answered) return;
          answered = true;
          hud.chat.setCanGame(false);
          hud.event({ icon: 'bell', title: `Ты ответил: <b>${esc(v)}</b>`, sub: 'ведущий проверяет' });
          const norm = (t) => t.toLowerCase().replace(/ё/g, 'е');
          const ok = norm(v).includes(norm(q.answer).slice(0, 4));
          x.later(() => {
            s.phase = 'answer'; s.verdict = ok ? 'yes' : 'no'; s.by = x.me.nick; b.reset();
            me.score += ok ? q.price : -q.price; seats.lit(null); if (ok) seats.turn(x.me.nick);
            x.sfx.play(ok ? 'win' : 'miss');
            hud.event({ icon: 'bell', title: ok ? `Верно! <b>+${q.price}</b> — твой ход` : `Неверно: <b>−${q.price}</b>`, tone: ok ? 'good' : 'danger' });
          }, 1300);
        };
        const press = () => {
          if (done) return;
          const now = performance.now();
          if (blocked > now) return;
          if (!open) {
            blocked = now + 1000;
            note.textContent = 'Рано! Кнопка ждёт 1 с';
            x.sfx.play('miss');
            look();
            x.later(look, 1010);
            return;
          }
          done = true;
          s.buzz = { nick: x.me.nick, left: 10 };
          seats.lit(x.me.nick); b.draw(); x.sfx.play('warm');
          buzz.remove();
          hud.event({ icon: 'bell', title: '<b>Ты</b> отвечаешь', sub: 'Говори (V) или напиши', lamp: true });
          hud.chat.setCanGame(true);
          writeBtn();
          x.every(() => {
            if (answered || left <= 0) return;
            left--; s.buzz.left = left; b.draw();
            if (left === 0) { answered = true; hud.slots.bc.replaceChildren(); hud.chat.close(); hud.chat.setCanGame(false); seats.lit(null); hud.event({ icon: 'bell', title: 'Не успел — жмут остальные', tone: 'danger' }); x.sfx.play('miss'); }
          }, 1000);
        };
        btn.addEventListener('click', press);
        x.key = (e) => {
          if (e.code === 'Space') { press(); return true; }
          if (e.key === 'Enter' && done && !answered) { answer(); return true; }
          if (e.key === 'Enter') { hud.chat.open(); return true; }
          return false;
        };
      },
    },
    {
      id: 'host', frame: 'jeopardy-host', fallback: 'riddle-stage', title: 'Ведёт игрок',
      caption: 'Ведущий у трибуны: вопрос и ответ — в панели справа; лампа — у того, кто отвечает',
      run(x) {
        const { hud, stage } = x;
        hud.chat.setCanGame(false);
        swap(x);
        hud.event({ icon: 'bell', title: '<b>Петя</b> отвечает', sub: 'ответ — голосом', lamp: true });
        const seats = (x.frame.plates ?? []).length ? jpSeats(x, CAST) : null;
        seats?.lit('Петя');
        const s = { phase: 'question', q: Q, open: 1, themes: THEMES, buzz: { nick: 'Петя', left: 8 } };
        const bd = painter(x, boardOf(x), paintJeopardy, s);
        x.every(() => { if (s.buzz && s.buzz.left > 0) { s.buzz.left--; bd.draw(); } }, 1000);
        const p = el('div', 'k-plate qz-host');
        p.innerHTML = `<p class="k-eyebrow">Рыбалка · 300</p><p class="qz-host-q">${esc(Q.text)}</p>
          <div class="qz-host-a"><span class="k-faint">Ответ</span><b>${esc(Q.answer)}</b><span class="k-faint">принимается: осетра</span></div>
          <div class="qz-host-row"><button class="k-btn k-btn--go k-btn--sm" data-a="yes" type="button">Верно${keyHtml('1', 'tr', 'sm')}</button><button class="k-btn k-btn--stop k-btn--sm" data-a="no" type="button">Неверно${keyHtml('2', 'tr', 'sm')}</button></div>
          <div class="qz-host-row"><button class="k-btn k-btn--ghost k-btn--sm" data-a="more" type="button">+5 с</button><button class="k-btn k-btn--ghost k-btn--sm" data-a="show" type="button">Показать ответ${keyHtml('R', 'tr', 'sm')}</button></div>`;
        hud.slots.tr.appendChild(p);
        p.classList.add('qo-host');
        const who = seats?.by('Петя')?.head ?? heads(x, 'audience').sort((a, c) => c.r - a.r)[0];
        if (who) stage.say(who.id, 'осётр!', 'new', 0, 'Петя');
        let over = false;
        const verdict = (ok) => {
          if (over) return;
          over = true;
          x.sfx.play(ok ? 'win' : 'miss');
          hud.event({ icon: 'bell', title: ok ? '<b>Петя</b> +300 · его ход' : '<b>Петя</b> −300 · жмут остальные', tone: ok ? 'good' : 'danger' });
          if (who) stage.mark(who.id, ok ? 'win' : 'miss', 2500);
          if (seats) { const pl = seats.by('Петя'); pl.score += ok ? 300 : -300; seats.lit(null); if (ok) seats.turn('Петя'); }
          s.phase = 'answer'; s.verdict = ok ? 'yes' : 'no'; s.by = 'Петя'; s.buzz = null; bd.reset();
          p.querySelector('.qz-host-row').innerHTML = `<span class="k-faint">${ok ? 'Засчитано' : 'Не засчитано'} — ждём выбор вопроса</span>`;
        };
        p.querySelector('[data-a="yes"]').addEventListener('click', () => verdict(true));
        p.querySelector('[data-a="no"]').addEventListener('click', () => verdict(false));
        p.querySelector('[data-a="more"]').addEventListener('click', () => { x.sfx.play('click'); if (s.buzz) { s.buzz.left += 5; bd.draw(); } });
        p.querySelector('[data-a="show"]').addEventListener('click', () => { x.sfx.play('click'); hud.event({ icon: 'bell', title: 'Никто не знает: это <b>осётр</b>' }); });
        x.key = (e) => { if (e.code === 'Digit1') { verdict(true); return true; } if (e.code === 'Digit2') { verdict(false); return true; } return false; };
      },
    },
    {
      id: 'results', frame: 'jeopardy-seat', title: 'Итоги',
      caption: 'Раунд пака сыгран: итоги и счёт вечера; через 10 с — снова «Во что играем?»',
      run(x) {
        const seats = jpSeats(x, [{ nick: 'Оля', score: 900 }, { nick: 'Петя', score: 600 }, { nick: 'Соня', score: 1500 }]);
        seats.turn(null);
        x.hud.chat.setCanGame(false);
        finale(x, {
          mode: 'jeopardy', name: 'Своя игра', icon: 'bell',
          top: [{ nick: 'Соня', pts: 1500 }, { nick: 'Оля', pts: 900 }, { nick: 'Петя', pts: 600 }],
          evening: [{ nick: 'Соня', pts: 42 }, { nick: 'Оля', pts: 35 }, { nick: 'Петя', pts: 30 }, { nick: x.me.nick, pts: 28, own: true }],
          reward: '',
        });
      },
    },
  ],
};

// ---------------------------------------------------------------- «Крокодил»
/** Маяк в 1024×768: башня, полосы, фонарь, лучи, волны */
function lighthouse() {
  const L = (c, w, pts) => ({ c, w, pts });
  const line = (a, b, n = 8) => Array.from({ length: n + 1 }, (_, i) => [a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]);
  const wave = (y) => Array.from({ length: 40 }, (_, i) => [80 + i * 22, y + Math.sin(i / 1.6) * 12]);
  return [
    L('#16313a', 10, [...line([440, 640], [470, 260]), ...line([470, 260], [554, 260]), ...line([554, 260], [584, 640]), ...line([584, 640], [440, 640])]),
    L('#e5484d', 26, line([462, 360], [562, 360])), L('#e5484d', 26, line([452, 470], [572, 470])), L('#e5484d', 26, line([444, 580], [580, 580])),
    L('#16313a', 10, [...line([476, 260], [476, 200]), ...line([476, 200], [548, 200]), ...line([548, 200], [548, 260])]),
    L('#ffcd4a', 18, line([480, 228], [544, 228])),
    L('#ffcd4a', 8, line([560, 222], [720, 170])), L('#ffcd4a', 8, line([560, 236], [730, 250])), L('#ffcd4a', 8, line([464, 222], [300, 170])), L('#ffcd4a', 8, line([464, 236], [290, 250])),
    L('#12958f', 8, wave(680)), L('#12958f', 8, wave(720)),
  ];
}
const COLORS = ['#16313a', '#e5484d', '#ff7a5c', '#ffcd4a', '#56c07d', '#12958f', '#4b48c9', '#8a5a2b'];
const WORDS = [['маяк', 'предмет'], ['чайка', 'животное'], ['мороженое', 'еда']];
const SVG = {
  erase: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16.5 13.5 7l5 5L11 19.5H6.5z" fill="#ffd9cf" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 11.5l5 5M11 19.5h9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7 4.5 11.5 9 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 11.5h9a5 5 0 0 1 0 10h-3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
};

/** 3×3: обратная матрица гомографии (точка кадра → точка холста) */
function invert(H) {
  const [a, b, c, d, e, f, g, h] = H, i = 1;
  const A = e * i - f * h, B = -(d * i - f * g), Cc = d * h - e * g;
  const det = a * A + b * B + c * Cc;
  const m = [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), Cc, -(a * h - b * g), a * e - b * d].map((v) => v / det);
  return (px, py) => { const w = m[6] * px + m[7] * py + m[8]; return [(m[0] * px + m[1] * py + m[2]) / w, (m[3] * px + m[4] * py + m[5]) / w]; };
}

export const CROC = {
  id: 'croc',
  title: 'Крокодил',
  steps: [
    {
      id: 'want', frame: 'croc-seat', title: 'Хочу рисовать',
      caption: 'Круг: каждый желающий рисует раз, до 6; «Хочу рисовать» — мышью или F',
      run(x) {
        const { hud } = x;
        const s = { queue: [{ nick: 'Оля', state: 'done' }, { nick: 'Петя', state: 'done' }, { nick: 'Соня', state: 'now' }, { nick: 'Кузя', state: 'wait' }], max: 6 };
        const b = painter(x, boardOf(x), paintCrocQueue, s);
        hud.chat.setCanGame(false);
        swap(x);
        hud.event({ icon: 'paint', title: 'Крокодил · <b>круг</b>', sub: 'Соня выбирает слово' });
        hud.seat(() => x.sfx.play('pop'), () => x.sfx.play('click'));
        const line = el('div', 'k-plate qo-line');
        const paint = () => {
          const mine = s.queue.find((q) => q.nick === x.me.nick);
          line.innerHTML = mine
            ? `<span>Ты в очереди: <b>${s.queue.indexOf(mine) + 1}-й</b></span><button type="button" class="k-btn k-btn--ghost" data-a="no">Передумал</button>`
            : `<span>Рисуют по кругу, до 6</span><button type="button" class="k-btn k-btn--go" data-a="yes">Хочу рисовать${keyHtml('F', 'tr', 'sm')}</button>`;
          line.querySelector('button').addEventListener('click', toggle);
        };
        const toggle = () => {
          const i = s.queue.findIndex((q) => q.nick === x.me.nick);
          if (i >= 0) { s.queue.splice(i, 1); x.sfx.play('close'); s.foot = undefined; }
          else if (s.queue.length < s.max) { s.queue.push({ nick: x.me.nick, state: 'wait', fresh: true }); x.sfx.play('pop'); s.foot = 'Ты в очереди — рисуешь после Кузи'; x.later(() => { const m = s.queue.find((q) => q.nick === x.me.nick); if (m) m.fresh = false; }, 1600); }
          b.draw(); paint();
        };
        paint();
        hud.slots.bc.appendChild(line);
        x.later(() => { if (s.queue.length < s.max && !s.queue.some((q) => q.nick === 'Мила')) { s.queue.push({ nick: 'Мила', state: 'wait', fresh: true }); b.draw(); x.sfx.play('pop'); x.later(() => { s.queue.at(-1).fresh = false; }, 1600); } }, 2600);
        x.key = (e) => { if (e.code === 'KeyF') { toggle(); return true; } return false; };
      },
    },
    {
      id: 'words', frame: 'croc-draw', fallback: 'riddle-stage', title: 'Выбери слово',
      caption: 'Твоя очередь: одно из трёх слов — клик или 1–3; за 10 с не выбрал — случайное',
      run(x) {
        const { hud } = x;
        hud.chat.setCanGame(false);
        hud.event({ icon: 'paint', title: '<b>Твоя очередь</b> рисовать', ring: 1, ringText: '0:10' });
        const box = el('div', 'k-plate qo-words');
        box.innerHTML = `<span class="qo-words-t">Что рисуешь?</span>` + WORDS.map(([w, cat], i) => `<button type="button" class="qo-word" data-i="${i}">${keyHtml(String(i + 1), 'tl', 'sm')}<b>${esc(w)}</b><span>${esc(cat)}</span></button>`).join('');
        hud.slots.bc.appendChild(box);
        let left = 10, done = false;
        const pick = (i) => { if (done) return; done = true; x.data.crocWord = WORDS[i][0]; x.sfx.play('pop'); box.querySelector(`[data-i="${i}"]`).classList.add('is-on'); x.later(() => x.go('draw'), 500); };
        for (const b of box.querySelectorAll('.qo-word')) b.addEventListener('click', () => pick(Number(b.dataset.i)));
        x.key = (e) => { const n = Number(e.key); if (n >= 1 && n <= 3) { pick(n - 1); return true; } return false; };
        x.every(() => { if (done) return; left--; hud.ring(left / 10, mmss(left), left <= 3); if (left <= 0) pick(Math.floor(Math.random() * 3)); }, 1000);
      },
    },
    {
      id: 'draw', frame: 'croc-draw', fallback: 'riddle-stage', title: 'Рисуешь на мольберте',
      caption: 'Рисуешь прямо на мольберте; инструменты — полосой справа, догадки — в доке слева',
      run(x) {
        const { hud, stage, frame } = x;
        hud.chat.setPerformer(true);
        const word = x.data.crocWord ?? 'маяк';
        let strokes = word === 'маяк' ? lighthouse().slice(0, 5) : [], color = COLORS[0], width = 14, erase = false, cur = null;
        let guessed = 0, left = 64;
        const total = 7;
        const plate = () => hud.event({ icon: 'paint', title: `Ты рисуешь: <b>${esc(word)}</b>`, sub: `угадали ${guessed} из ${total}`, ring: left / 80, ringText: mmss(left) });
        swap(x);
        plate();
        hud.chat.setCanGame(true);
        // холст: на мольберте кадра (рисуем по его четырёхугольнику) или крупно по центру
        let ctx, flush, surface, toCanvas;
        if (frame.easel) {
          const q = stage.quad(frame.easel, 1024, 768, 'st-easel');
          ctx = q.ctx; flush = () => q.flush();
          const xs = frame.easel.map((p) => p[0]), ys = frame.easel.map((p) => p[1]);
          surface = el('div', 'qo-easel-hit');
          Object.assign(surface.style, { left: `${Math.min(...xs)}px`, top: `${Math.min(...ys)}px`, width: `${Math.max(...xs) - Math.min(...xs)}px`, height: `${Math.max(...ys) - Math.min(...ys)}px` });
          const inv = invert(q.Hsrc);
          toCanvas = (e) => { const [px, py] = framePt(x, e); return inv(px, py); };
        } else {
          const cv = el('canvas', 'qo-easel');
          cv.width = 1024; cv.height = 768;
          ctx = cv.getContext('2d'); flush = () => {};
          surface = cv;
          toCanvas = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * 1024, (e.clientY - r.top) / r.height * 768]; };
        }
        x.layer.appendChild(surface);
        const redraw = () => { ctx.fillStyle = '#fffdf7'; ctx.fillRect(0, 0, 1024, 768); drawStrokes(ctx, strokes, 0, 0, 1); flush(); };
        redraw();
        surface.addEventListener('pointerdown', (e) => { cur = { c: erase ? '#fffdf7' : color, w: erase ? 44 : width, pts: [toCanvas(e)] }; strokes.push(cur); surface.setPointerCapture(e.pointerId); });
        surface.addEventListener('pointermove', (e) => { if (!cur) return; cur.pts.push(toCanvas(e)); redraw(); });
        surface.addEventListener('pointerup', () => { cur = null; });
        // инструменты — узкая полоса справа от холста
        const tools = el('div', 'k-plate qo-tools');
        tools.innerHTML = COLORS.map((c, i) => `<button type="button" class="qo-color${i === 0 ? ' is-on' : ''}" style="--c:${c}" data-c="${c}" title="Цвет ${i + 1}"></button>`).join('') +
          '<i class="qo-sep"></i>' + [6, 14, 30].map((v, i) => `<button type="button" class="qo-width${i === 1 ? ' is-on' : ''}" data-w="${v}" title="Толщина"><i style="--d:${v / 2 + 4}px"></i></button>`).join('') +
          `<i class="qo-sep"></i><button type="button" class="qo-tool" data-a="erase" title="Ластик">${SVG.erase}</button><button type="button" class="qo-tool" data-a="undo" title="Отмена — Z">${SVG.undo}${keyHtml('Z', 'tr', 'sm')}</button>`;
        x.layer.appendChild(tools);
        const place = () => {
          const xs = frame.easel ? frame.easel.map((p) => p[0]) : [420, 1020], ys = frame.easel ? frame.easel.map((p) => p[1]) : [330, 780];
          Object.assign(tools.style, { left: `${Math.max(...xs) + 14}px`, top: `${(Math.min(...ys) + Math.max(...ys)) / 2}px` });
        };
        place();
        const pick = (sel, b) => { for (const o of tools.querySelectorAll(sel)) o.classList.remove('is-on'); b.classList.add('is-on'); };
        for (const b of tools.querySelectorAll('.qo-color')) b.addEventListener('click', () => { pick('.qo-color, [data-a="erase"]', b); color = b.dataset.c; erase = false; x.sfx.play('click'); });
        for (const b of tools.querySelectorAll('.qo-width')) b.addEventListener('click', () => { pick('.qo-width', b); width = Number(b.dataset.w); x.sfx.play('click'); });
        const er = tools.querySelector('[data-a="erase"]');
        er.addEventListener('click', () => { pick('.qo-color, [data-a="erase"]', er); erase = true; x.sfx.play('click'); });
        const undo = () => { strokes.pop(); redraw(); x.sfx.play('click'); };
        tools.querySelector('[data-a="undo"]').addEventListener('click', undo);
        x.key = (e) => { if (e.code === 'KeyZ') { undo(); return true; } return false; };
        // догадки зала — в доке и облачками; ответ рисующему писать нельзя
        const aud = heads(x, 'audience').sort((a, c) => c.r - a.r);
        const lines = [['башня?', 'Петя'], ['ракета', 'Соня'], ['угадал!', 'ОченьДлинныйНик', 'win'], ['свеча', 'Кузя'], ['угадал!', 'Мила', 'win'], ['фонарь?', 'Гоша']];
        lines.forEach(([t, n, m], i) => x.later(() => {
          const h = aud[i % Math.max(1, aud.length)];
          if (h) stage.say(h.id, t, m ?? 'new', 5000, n);
          hud.chat.add({ nick: n, text: t, game: true, mark: m });
          if (m) { guessed++; plate(); }
          x.sfx.play(m ? 'win' : 'pop');
        }, 1400 + i * 1700));
        hud.chat.onSend = (text) => {
          if (text.toLowerCase().includes(word)) { hud.chat.add({ text: 'Нельзя писать ответ', sys: true }); x.sfx.play('miss'); return; }
          hud.chat.add({ nick: x.me.nick, text, own: true, game: true });
        };
        x.every(() => { left = Math.max(0, left - 1); hud.ring(left / 80, mmss(left), left <= 10); }, 1000);
      },
    },
    {
      id: 'guess', frame: 'croc-seat', title: 'Угадываешь рисунок',
      caption: 'Со стула: рисунок и буквы — на табло; угадал — облачко «угадал!» над головой',
      run(x) {
        const { hud, stage, frame } = x;
        const strokes = lighthouse();
        const s = { drawer: 'Оля', left: 62, total: 80, mask: '_ _ _ _', strokes, guessed: [], progress: 0, turnOf: 'рисует 3 из 6' };
        const b = painter(x, boardOf(x), paintCroc, s);
        let easel = null;
        if (frame.easel) easel = stage.quad(frame.easel, 1024, 768, 'st-easel');
        const drawEasel = () => { if (!easel) return; const c = easel.ctx; c.fillStyle = '#fffdf7'; c.fillRect(0, 0, 1024, 768); drawStrokes(c, strokes, 0, 0, 1, s.progress); easel.flush(); };
        x.every(() => { s.progress = Math.min(1, s.progress + 0.035); drawEasel(); }, 250);
        x.every(() => { s.left = Math.max(0, s.left - 1); hud.ring(s.left / s.total, mmss(s.left), s.left <= 10); if (s.left === 40) { s.mask = 'М _ _ _'; x.sfx.play('pop'); } }, 1000);
        swap(x);
        hud.event({ icon: 'paint', title: 'Рисует <b>Оля</b>' });
        hud.chat.setCanGame(true);
        const seat = hud.seat(() => x.sfx.play('pop'), () => x.sfx.play('click'));
        hud.chat.onOpen = (o) => { const em = seat.querySelector('.qz-emotes, .pz-emotes'); if (em) em.hidden = o; };
        const aud = heads(x, 'audience').filter((h) => !(h.x < 470 && h.y > 640));
        const dr = heads(x, 'drawer')[0];
        if (dr) x.stage.nick?.(dr.id, 'Оля');
        const say = (i, text, nick) => { const h = aud.length ? aud[i % aud.length] : null; if (h) stage.say(h.id, text, 'new', 6000, nick); hud.chat.add({ nick, text, game: true }); x.sfx.play('pop'); };
        const got = (i, nick) => {
          const h = aud.length ? aud[i % aud.length] : null;
          if (h) { stage.say(h.id, 'угадал!', 'win', 4000, nick); const c = stage.bubbleCenter(h.id); if (c) stage.confetti(c[0], c[1], 30, 220); }
          hud.chat.add({ nick, text: 'угадал!', game: true, mark: 'win' });
          s.guessed.push(nick); b.draw(); x.sfx.play('win');
        };
        x.later(() => say(0, 'башня?', 'Петя'), 1500);
        x.later(() => say(1, 'ракета', 'Соня'), 3200);
        x.later(() => got(2, 'ОченьДлинныйНик'), 5200);
        x.later(() => say(3, 'свеча?', 'Кузя'), 6800);
        x.later(() => got(0, 'Петя'), 8800);
        hud.chat.onSend = (text) => {
          if (/маяк/i.test(text)) { hud.chat.add({ nick: x.me.nick, text: 'угадал!', own: true, game: true, mark: 'win' }); s.guessed.push(x.me.nick); b.draw(); x.sfx.play('win'); hud.event({ icon: 'paint', title: `Ты угадал! <b>+${5 - Math.min(3, s.guessed.length - 1)}</b>`, tone: 'good' }); return; }
          hud.chat.add({ nick: x.me.nick, text, own: true, game: true });
          if (/маяч|мачт|маяг/i.test(text)) x.later(() => hud.chat.add({ text: 'Почти! Проверь буквы', sys: true }), 400);
        };
      },
    },
    {
      id: 'results', frame: 'croc-seat', title: 'Итоги',
      caption: 'Круг закончился: итоги и счёт вечера; через 10 с — снова «Во что играем?»',
      run(x) {
        x.hud.chat.setCanGame(false);
        finale(x, {
          mode: 'croc', name: 'Крокодил', icon: 'paint',
          top: [{ nick: 'Петя', pts: 9 }, { nick: 'ОченьДлинныйНик', pts: 7 }, { nick: x.me.nick, pts: 6, own: true }],
          evening: [{ nick: 'Соня', pts: 42 }, { nick: 'Петя', pts: 39 }, { nick: 'Оля', pts: 35 }, { nick: x.me.nick, pts: 34, own: true }],
          reward: '+15',
        });
      },
    },
  ],
};

// ---------------------------------------------------------------- «Кто из нас?»
const WHO_Q = 'Кто из нас первым уснёт на рыбалке?';
const BOT_Q = ['Кто из нас громче всех поёт в караоке?', 'Кто из нас съест всё мороженое на пирсе?', 'Кто из нас опоздает на свою же свадьбу?', 'Кто из нас заблудится на набережной?'];
const WHO_NAMES = ['Соня', 'Петя', 'Оля', 'Кузя', 'ОченьДлинныйНик', 'Мила', 'Гоша', 'Ника'];

export const WHOOFUS = {
  id: 'whoofus',
  title: 'Кто из нас?',
  steps: [
    {
      id: 'ask', frame: 'whoofus-seat', title: 'Свои вопросы',
      caption: 'Свои вопросы: пишешь «Кто из нас…» — вопрос встаёт в очередь вперемешку с паком',
      run(x) {
        const { hud } = x;
        hud.chat.setCanGame(false);
        const s = { phase: 'ask', asked: BOT_Q.slice(0, 2), fresh: false };
        const b = painter(x, boardOf(x), paintWho, s);
        swap(x);
        hud.event({ icon: 'online', title: 'Кто из нас? · <b>свои вопросы</b>' });
        hud.seat(() => x.sfx.play('pop'), () => x.sfx.play('click'));
        const box = el('div', 'k-plate qo-ask');
        box.innerHTML = `<div class="qo-ask-row"><span class="qo-ask-pre">Кто из нас</span><input type="text" maxlength="70" placeholder="…первым уснёт на рыбалке?"><button type="button" class="k-btn k-btn--go k-btn--sm">Добавить${keyHtml('Enter', 'tr', 'sm')}</button></div><span class="k-faint qo-ask-n"></span>`;
        hud.slots.bc.appendChild(box);
        const inp = box.querySelector('input'), nEl = box.querySelector('.qo-ask-n');
        let mine = 0;
        const count = () => { nEl.innerHTML = `в очереди <b>${s.asked.length}</b>${mine ? ` · твоих ${mine}` : ''} · вперемешку с вопросами пака`; };
        count();
        const add = (q, own) => { s.asked.push(q); s.fresh = true; b.draw(); count(); x.later(() => { s.fresh = false; }, 1600); x.sfx.play(own ? 'pop' : 'click'); };
        const send = () => {
          let v = inp.value.trim();
          if (!v) { inp.focus(); return; }
          v = `Кто из нас ${v.replace(/^кто из нас\s*/i, '')}`.replace(/\s*\??$/, '?');
          inp.value = '';
          mine++;
          add(v, true);
          hud.toast({ icon: 'online', title: 'Вопрос в очереди', life: 2000 });
        };
        box.querySelector('button').addEventListener('click', send);
        inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); send(); } if (e.key === 'Escape') inp.blur(); });
        x.later(() => add(BOT_Q[2]), 2400);
        x.later(() => add(BOT_Q[3]), 5200);
        let left = 30;
        x.every(() => { left = Math.max(0, left - 1); hud.ring(left / 30, mmss(left), left <= 5); }, 1000);
      },
    },
    {
      id: 'vote', frame: 'whoofus-room', fallback: 'riddle-stage', title: 'Голос — клик по желейке',
      caption: 'Камера на сцене смотрит на зал: навёл — желейка светится и виден ник, клик — голос',
      run(x) {
        const { hud, stage } = x;
        hud.chat.setCanGame(false);
        const aud = heads(x, 'audience').sort((a, c) => c.r - a.r).slice(0, WHO_NAMES.length);
        const voters = aud.length + 1;
        let votes = 0, mine = null, left = 15, closing = false;
        const plate = () => hud.event({ icon: 'online', title: esc(WHO_Q), sub: mine ? `твой голос: <b>${esc(mine)}</b> · можно передумать` : `вопрос 3 из 10 · проголосовали ${votes} из ${voters}`, ring: left / 15, ringText: mmss(left) });
        plate();
        nicks(x, Object.fromEntries(aud.map((h, i) => [h.id, WHO_NAMES[i]])));
        aud.forEach((h, i) => {
          const name = WHO_NAMES[i], r = Math.max(h.r ?? 30, 24);
          const hit = el('button', 'qo-jelly', `<span class="qo-jelly-name">${esc(name)}</span>`);
          hit.type = 'button';
          hit.title = name;
          Object.assign(hit.style, { left: `${h.x - r * 1.2}px`, top: `${h.y - r * 0.25}px`, width: `${r * 2.4}px`, height: `${r * 2.9}px` });
          hit.addEventListener('mouseenter', () => hit.classList.add('is-hover'));
          hit.addEventListener('mouseleave', () => hit.classList.remove('is-hover'));
          hit.addEventListener('click', () => {
            if (closing && left <= 0) return;
            for (const o of x.layer.querySelectorAll('.qo-jelly')) o.classList.remove('is-on');
            hit.classList.add('is-on');
            if (!mine) votes++;
            mine = name;
            x.data.whoVote = name;
            x.sfx.play('pop');
            check(); plate();
          });
          x.layer.appendChild(hit);
        });
        const check = () => { if (!closing && votes >= voters) { closing = true; left = Math.min(left, 3); hud.toast({ icon: 'online', title: 'Все проголосовали', life: 2400 }); } };
        x.every(() => { if (votes < voters - (mine ? 0 : 1)) { votes++; check(); plate(); } }, 900);
        x.every(() => {
          left = Math.max(0, left - 1);
          hud.ring(left / 15, mmss(left), left <= 3);
          if (left === 0) { x.sfx.play('whoosh'); x.later(() => x.go('reveal'), 300); }
        }, 1000);
        hud.slots.bc.appendChild(Object.assign(el('div', 'k-prompt qz-prompt'), { innerHTML: '<i class="k-mouse k-mouse--l"></i><span>Клик по желейке — голос</span><span class="k-prompt-sep"></span><span class="k-prompt-note">за себя нельзя</span>' }));
      },
    },
    {
      id: 'reveal', frame: 'whoofus-seat', title: 'Раскрытие',
      caption: 'Камера вернулась: голоса полосами на табло, над лидером — титул в мире',
      run(x) {
        const { hud, stage } = x;
        hud.chat.setCanGame(false);
        const base = { 'Кузя': 4, 'Соня': 2, 'Петя': 1, 'Оля': 1 };
        const my = x.data.whoVote;
        if (my) base[my] = (base[my] ?? 0) + 1;
        const results = Object.entries(base).map(([nick, n]) => ({ nick, n })).sort((a, c) => c.n - a.n);
        const votes = results.reduce((a, r) => a + r.n, 0), voters = 9;
        const s = { phase: 'reveal', round: 3, rounds: 10, q: WHO_Q, votes, voters, results, title: 'Соня набережной' };
        painter(x, boardOf(x), paintWho, s);
        hud.seat(() => x.sfx.play('pop'), () => x.sfx.play('click'));
        const aud = heads(x, 'audience').sort((a, c) => Math.abs(a.x - 720) - Math.abs(c.x - 720));
        const names = { [aud[0]?.id]: 'Кузя', [aud[1]?.id]: 'Петя' };
        nicks(x, names);
        const lh = aud[0];
        if (lh) {
          stage.ring(lh.id);
          const t = el('div', 'qo-title', '<small>титул</small><b>Соня набережной</b>');
          Object.assign(t.style, { left: `${lh.x}px`, top: `${lh.y - 10}px` });
          stage.world.appendChild(t);
          stage.confetti(lh.x, lh.y - 40, 50, 300);
        }
        x.sfx.play('win');
        const hit = my === 'Кузя';
        hud.event({ icon: 'online', title: hit ? 'Ты в теме · <b>+40</b>' : my ? `Твой голос: <b>${esc(my)}</b> — не в теме` : 'Ты не голосовал', tone: hit ? 'good' : undefined });
        if (hit) { hud.tokens(x.me.tokens += 40); hud.pop('+40'); }
      },
    },
    {
      id: 'results', frame: 'whoofus-seat', title: 'Итоги',
      caption: '10 вопросов позади: итоги и счёт вечера; через 10 с — снова «Во что играем?»',
      run(x) {
        x.hud.chat.setCanGame(false);
        finale(x, {
          mode: 'whoofus', name: 'Кто из нас?', icon: 'online',
          top: [{ nick: x.me.nick, pts: 6, own: true }, { nick: 'Петя', pts: 5 }, { nick: 'Оля', pts: 4 }],
          evening: [{ nick: 'Соня', pts: 42 }, { nick: x.me.nick, pts: 40, own: true }, { nick: 'Петя', pts: 39 }, { nick: 'Оля', pts: 35 }],
          reward: '+40',
        });
      },
    },
  ],
};

// «Своя игра», «Крокодил», «Кто из нас?» — кадры по шагам на том же устройстве, что «Загадка».
import { BOARD_H, BOARD_W, drawStrokes, paintCroc, paintJeopardy, paintPlate, paintWho } from './world/boards-more.js';
import { mmss } from './world/paint.js';
import { coinHtml, esc, keyHtml, openWindow } from './hud.js';

const pick = (x, name) => (x.frame.heads ?? []).filter((h) => h.role === name);
function boardOf(x) { return x.frame.board ? x.stage.quad(x.frame.board, BOARD_W, BOARD_H, 'st-board') : null; }
function painter(x, board, fn, s) {
  let t0 = performance.now();
  const draw = () => { if (board) { fn(board.ctx, s, performance.now() - t0); board.flush(); } };
  draw();
  x.every(draw, 250);
  return { draw, reset: () => { t0 = performance.now(); draw(); } };
}

// ---------------------------------------------------------------- «Своя игра»
const THEMES = [
  { name: 'Набережная', cells: [100, 200, 300, 400, 500] },
  { name: 'Рыбалка', cells: [100, 0, 300, 400, 500] },
  { name: 'Кино 90-х', cells: [100, 200, 300, 400, 500] },
  { name: 'Песни у костра', cells: [0, 200, 300, 0, 500] },
  { name: 'Кухня', cells: [100, 200, 0, 400, 500] },
  { name: 'Города', cells: [100, 200, 300, 400, 0] },
];
const Q = { theme: 'Рыбалка', price: 300, text: 'Кому Дед Семён платит за рыбу больше всех?', answer: 'Осётр' };

function jpPlates(x, players) {
  const out = [];
  for (const [i, p] of (x.frame.plates ?? []).entries()) {
    const q = x.stage.quad(p.q, 512, 256, 'st-plate');
    const pl = players[i];
    const draw = () => { paintPlate(q.ctx, pl ?? { nick: 'свободно', score: 0, away: false }); q.flush(); };
    draw();
    out.push({ q, pl, draw });
  }
  return { all: out, draw: () => out.forEach((o) => o.draw()) };
}

export const JEOPARDY = {
  id: 'jeopardy',
  title: 'Своя игра',
  steps: [
    {
      id: 'watch', frame: 'jeopardy-seat', title: 'Табло тем и вопрос',
      caption: 'Со стула: сетка тем на табло, вопрос — на всё табло, кто жмёт первым — золотом; счёт — на табличках пультов',
      run(x) {
        const { hud } = x;
        const players = [{ nick: 'Оля', score: 600 }, { nick: 'Петя', score: 300 }, { nick: 'ОченьДлинныйНик', score: -100 }, { nick: 'Соня', score: 900 }, { nick: 'Кузя', score: 0 }, { nick: 'Мила', score: 1200 }];
        players[0].turn = true;
        const plates = jpPlates(x, players);
        const s = { phase: 'grid', round: 'Раунд 1', pack: 'Набережная', turn: 'Оля', themes: THEMES.map((t) => ({ ...t, cells: [...t.cells] })), pick: null, q: Q, open: 0 };
        const b = painter(x, boardOf(x), paintJeopardy, s);
        hud.chat.setCanGame(false);
        hud.event({ img: 'q-win', title: 'Своя игра · ведёт <b>Затейник</b>', sub: 'пак «Набережная» · раунд 1' });
        const podium = pick(x, 'podium');
        const loop = () => {
          s.phase = 'grid'; s.pick = null; b.draw();
          x.later(() => { s.pick = [1, 2]; x.sfx.play('click'); b.draw(); }, 1600);
          x.later(() => {
            s.phase = 'question'; s.open = 0; s.buzz = null; b.reset();
            let k = 0;
            x.every(() => { if (s.phase === 'question' && !s.buzz && k < 10) { k++; s.open = k / 10; } }, 300);
          }, 2800);
          x.later(() => {
            s.buzz = { nick: 'Петя', left: 10 };
            players.forEach((p) => { p.lit = p.nick === 'Петя'; p.turn = false; });
            plates.draw(); b.draw(); x.sfx.play('warm');
            if (podium[0]) x.stage.ring(podium[0].id);
          }, 6600);
          x.later(() => { if (podium[0]) x.stage.say(podium[0].id, 'осётр!', 'new', 2500, 'Петя'); }, 7600);
          x.later(() => {
            s.phase = 'answer'; s.verdict = 'yes'; s.by = 'Петя'; b.reset();
            players[1].score += 300; players[1].lit = false; players[1].turn = true; plates.draw();
            x.sfx.play('win');
            for (const r of x.stage.world.querySelectorAll('.st-ring')) r.remove();
          }, 9600);
          x.later(() => { s.themes[1].cells[2] = 0; s.turn = 'Петя'; s.phase = 'grid'; b.draw(); }, 12600);
        };
        loop();
      },
    },
    {
      id: 'player', frame: 'jeopardy-seat', title: 'Ты за пультом',
      caption: 'Игрок за пультом: Пробел или большая кнопка — «жму!», полоска «кнопки откроются», ответ — голосом или строкой',
      run(x) {
        const { hud } = x;
        const s = { phase: 'question', q: Q, open: 0, themes: THEMES };
        const b = painter(x, boardOf(x), paintJeopardy, s);
        const players = [{ nick: 'Оля', score: 600 }, { nick: x.me.nick, score: 300 }, { nick: 'ОченьДлинныйНик', score: -100 }, { nick: 'Соня', score: 900 }, { nick: 'Кузя', score: 0 }, { nick: 'Мила', score: 1200 }];
        const plates = jpPlates(x, players);
        hud.chat.setCanGame(false);
        hud.event({ avatar: x.me.color, title: 'Ты за пультом · <b class="k-gold">300</b>', sub: 'ведёт Затейник' });
        const buzz = document.createElement('div');
        buzz.className = 'qz-buzz';
        buzz.innerHTML = `<button class="k-btn k-btn--lg qz-buzz-btn" type="button" disabled>Жму!${keyHtml('Пробел', 'tr', 'sm')}</button><span class="k-meter k-meter--thin qz-buzz-meter" style="--v:0"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i></span><span class="k-faint qz-buzz-note">кнопки откроются…</span>`;
        hud.slots.bc.appendChild(buzz);
        const btn = buzz.querySelector('button'), meter = buzz.querySelector('.k-meter'), note = buzz.querySelector('.qz-buzz-note');
        let k = 0, done = false;
        x.every(() => {
          if (done || k >= 12) return;
          k++; s.open = k / 12; meter.style.setProperty('--v', s.open);
          if (k === 12) { btn.disabled = false; btn.classList.add('k-btn--go'); note.textContent = 'жми, пока не опередили'; x.sfx.play('tick'); }
        }, 250);
        const press = () => {
          if (done) return;
          if (btn.disabled) { note.textContent = 'Рано! Кнопка ждёт 1 с'; x.sfx.play('miss'); return; }
          done = true;
          s.buzz = { nick: x.me.nick, left: 10 };
          players[1].lit = true; plates.draw(); b.draw(); x.sfx.play('warm');
          buzz.remove();
          hud.event({ avatar: x.me.color, title: '<b>Ты</b> отвечаешь!', ring: 1, ringText: '0:10', lamp: true });
          const ans = document.createElement('label');
          ans.className = 'k-chat-input is-typing qz-answer';
          ans.innerHTML = `<span>Ответ:</span><input type="text" maxlength="60" placeholder="или скажи голосом — V">${keyHtml('Enter')}`;
          hud.slots.bc.appendChild(ans);
          const inp = ans.querySelector('input');
          inp.focus();
          inp.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key !== 'Enter' || !inp.value.trim()) return;
            const v = inp.value.trim();
            ans.remove();
            hud.event({ avatar: x.me.color, title: `Ты ответил: <b>${esc(v)}</b>`, sub: 'ведущий проверяет' });
            const ok = /осет|осёт/i.test(v);
            x.later(() => {
              s.phase = 'answer'; s.verdict = ok ? 'yes' : 'no'; s.by = x.me.nick; b.reset();
              players[1].score += ok ? 300 : -300; players[1].lit = false; plates.draw();
              x.sfx.play(ok ? 'win' : 'miss');
              hud.tokens(x.me.tokens); hud.event({ avatar: x.me.color, title: ok ? 'Верно! <b>+300</b> — твой ход' : 'Неверно: <b>−300</b>', tone: ok ? 'good' : 'danger' });
            }, 1400);
          });
        };
        btn.addEventListener('click', press);
        x.key = (e) => { if (e.code === 'Space') { press(); return true; } return false; };
      },
    },
    {
      id: 'host', frame: 'riddle-stage', title: 'Ведёт игрок',
      caption: 'Живой ведущий у трибуны: табло у него за спиной, поэтому вопрос и верный ответ — в компактной панели справа внизу',
      run(x) {
        const { hud } = x;
        hud.chat.setCanGame(false);
        hud.event({ avatar: '#7bc96f', title: '<b>Петя</b> отвечает', ring: 0.8, ringText: '0:08' });
        const p = document.createElement('div');
        p.className = 'k-plate qz-host';
        p.innerHTML = `<p class="k-eyebrow">Рыбалка · 300</p><p class="qz-host-q">${esc(Q.text)}</p>
          <div class="qz-host-a"><span class="k-faint">Ответ</span><b>${esc(Q.answer)}</b><span class="k-faint">принимается: осетра</span></div>
          <div class="qz-host-row"><button class="k-btn k-btn--go k-btn--sm" data-a="yes" type="button">Верно${keyHtml('1', 'tr', 'sm')}</button><button class="k-btn k-btn--stop k-btn--sm" data-a="no" type="button">Неверно${keyHtml('2', 'tr', 'sm')}</button></div>
          <div class="qz-host-row"><button class="k-btn k-btn--ghost k-btn--sm" data-a="more" type="button">+5 с</button><button class="k-btn k-btn--ghost k-btn--sm" data-a="show" type="button">Показать ответ${keyHtml('R', 'tr', 'sm')}</button></div>`;
        hud.slots.br.appendChild(p);
        const podium = (x.frame.heads ?? []).find((h) => h.role === 'audience');
        if (podium) x.stage.say(podium.id, 'осётр!', 'new', 0, 'Петя');
        const verdict = (ok) => {
          x.sfx.play(ok ? 'win' : 'miss');
          hud.event({ avatar: '#7bc96f', title: ok ? '<b>Петя</b> +300 · его ход' : '<b>Петя</b> −300 · жмут остальные', tone: ok ? 'good' : 'danger' });
          if (podium) x.stage.mark(podium.id, ok ? 'win' : 'miss', 2500);
          p.querySelector('.qz-host-row').innerHTML = `<span class="k-faint">${ok ? 'Засчитано' : 'Не засчитано'} — ждём выбор вопроса</span>`;
        };
        p.querySelector('[data-a="yes"]').addEventListener('click', () => verdict(true));
        p.querySelector('[data-a="no"]').addEventListener('click', () => verdict(false));
        p.querySelector('[data-a="more"]').addEventListener('click', () => { x.sfx.play('click'); hud.ring(1, '0:13'); });
        p.querySelector('[data-a="show"]').addEventListener('click', () => { x.sfx.play('click'); hud.event({ title: 'Никто не знает: это <b>осётр</b>' }); });
        x.key = (e) => { if (e.code === 'Digit1') { verdict(true); return true; } if (e.code === 'Digit2') { verdict(false); return true; } return false; };
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

export const CROC = {
  id: 'croc',
  title: 'Крокодил',
  steps: [
    {
      id: 'guess', frame: 'croc-seat', title: 'Угадываешь рисунок',
      caption: 'Со стула: рисунок — на мольберте и крупно на табло, буквы открываются; угадал — облачко «угадал!», слово не видно',
      run(x) {
        const { hud, stage, frame } = x;
        const strokes = lighthouse();
        const s = { drawer: 'Оля', left: 62, total: 80, mask: '_ _ _ _', strokes, guessed: [], progress: 0 };
        const b = painter(x, boardOf(x), paintCroc, s);
        // холст мольберта (4:3) — тот же рисунок
        let easel = null;
        if (frame.easel) easel = stage.quad(frame.easel, 1024, 768, 'st-easel');
        const drawEasel = () => { if (!easel) return; const c = easel.ctx; c.fillStyle = '#fffdf7'; c.fillRect(0, 0, 1024, 768); drawStrokes(c, strokes, 0, 0, 1, s.progress); easel.flush(); };
        x.every(() => { s.progress = Math.min(1, s.progress + 0.035); drawEasel(); }, 250);
        x.every(() => { s.left = Math.max(0, s.left - 1); hud.ring(s.left / s.total, mmss(s.left), s.left <= 10); if (s.left === 40) { s.mask = 'М _ _ _'; x.sfx.play('pop'); } }, 1000);
        hud.event({ avatar: '#b38cf0', title: 'Рисует <b>Оля</b>', sub: '4 буквы', ring: s.left / s.total, ringText: mmss(s.left) });
        hud.chat.setCanGame(true);
        const seat = hud.seat(() => x.sfx.play('pop'), () => x.sfx.play('click'));
        hud.chat.onOpen = (o) => { seat.querySelector('.qz-emotes').hidden = o; };
        const aud = (frame.heads ?? []).filter((h) => h.role === 'audience');
        const names = ['Петя', 'Соня', 'ОченьДлинныйНик', 'Кузя', 'Мила', 'Гоша'];
        const say = (i, text, nick) => { const h = aud[i % aud.length]; if (h) stage.say(h.id, text, 'new', 6000, nick); hud.chat.add({ nick, text, game: true }); x.sfx.play('pop'); };
        const got = (i, nick) => {
          const h = aud[i % aud.length];
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
          if (/маяк/i.test(text)) { hud.chat.add({ nick: x.me.nick, text: 'угадал!', own: true, game: true, mark: 'win' }); s.guessed.push(x.me.nick); b.draw(); x.sfx.play('win'); hud.event({ avatar: '#b38cf0', title: `Ты угадал! <b>+${5 - Math.min(3, s.guessed.length - 1)}</b>`, tone: 'good' }); return; }
          hud.chat.add({ nick: x.me.nick, text, own: true, game: true });
          const me = (frame.heads ?? []).find((h) => h.role === 'me');
          if (me) stage.say(me.id, text, 'new', 6000);
          if (/маяч|мачт|маяг/i.test(text)) x.later(() => hud.chat.add({ text: 'Почти! Проверь буквы', sys: true }), 400);
        };
        x.key = (e) => { if (e.code === 'Enter') { hud.chat.open(); return true; } return false; };
      },
    },
    {
      id: 'draw', frame: 'riddle-stage', title: 'Ты рисуешь',
      caption: 'Рисующий: единственное большое окно — холст 4:3 и инструменты; окно без затемнения — видно облачка догадок в зале',
      run(x) {
        const { hud, stage } = x;
        hud.chat.setCanGame(false);
        hud.event({ img: 'q-win', title: 'Ты рисуешь', sub: 'угадали 2 из 7', ring: 0.8, ringText: '1:04' });
        const w = openWindow(x.layer, {
          img: 'q-win', eyebrow: '«Ракушка» · Крокодил', title: 'Нарисуй: маяк', size: 'lg', mode: 'croc',
          body: `<div class="qz-croc">
            <canvas class="qz-canvas" width="1024" height="768"></canvas>
            <div class="qz-tools">
              <div class="qz-colors">${COLORS.map((c, i) => `<button type="button" class="qz-color${i === 0 ? ' is-on' : ''}" style="--c:${c}" data-c="${c}" aria-label="Цвет ${i + 1}"></button>`).join('')}</div>
              <div class="k-seg qz-widths">${[6, 14, 30].map((v, i) => `<button type="button" data-w="${v}" class="${i === 1 ? 'is-on' : ''}"><i style="--d:${v / 2 + 4}px"></i></button>`).join('')}</div>
              <div class="qz-tool-row"><button class="k-btn k-btn--ghost k-btn--sm" data-a="erase" type="button">Ластик</button><button class="k-btn k-btn--ghost k-btn--sm" data-a="undo" type="button">Отмена${keyHtml('Z', 'tr', 'sm')}</button></div>
              <button class="k-btn k-btn--ghost k-btn--sm" data-a="clear" type="button">Очистить всё</button>
            </div></div>`,
        }, () => x.sfx.play('close'));
        w.scrim.classList.add('qz-scrim--clear');
        const cv = w.win.querySelector('canvas'), c = cv.getContext('2d');
        let strokes = lighthouse().slice(0, 5), color = COLORS[0], width = 14, erase = false, cur = null;
        const redraw = () => { c.fillStyle = '#fffdf7'; c.fillRect(0, 0, 1024, 768); drawStrokes(c, strokes, 0, 0, 1); };
        redraw();
        const pos = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * 1024, (e.clientY - r.top) / r.height * 768]; };
        cv.addEventListener('pointerdown', (e) => { cur = { c: erase ? '#fffdf7' : color, w: erase ? 40 : width, pts: [pos(e)] }; strokes.push(cur); cv.setPointerCapture(e.pointerId); });
        cv.addEventListener('pointermove', (e) => { if (!cur) return; cur.pts.push(pos(e)); redraw(); });
        cv.addEventListener('pointerup', () => { cur = null; });
        for (const b of w.win.querySelectorAll('.qz-color')) b.addEventListener('click', () => { for (const o of w.win.querySelectorAll('.qz-color')) o.classList.remove('is-on'); b.classList.add('is-on'); color = b.dataset.c; erase = false; x.sfx.play('click'); });
        for (const b of w.win.querySelectorAll('.qz-widths button')) b.addEventListener('click', () => { for (const o of w.win.querySelectorAll('.qz-widths button')) o.classList.remove('is-on'); b.classList.add('is-on'); width = Number(b.dataset.w); x.sfx.play('click'); });
        w.win.querySelector('[data-a="erase"]').addEventListener('click', () => { erase = true; x.sfx.play('click'); });
        w.win.querySelector('[data-a="undo"]').addEventListener('click', () => { strokes.pop(); redraw(); x.sfx.play('click'); });
        w.win.querySelector('[data-a="clear"]').addEventListener('click', () => { strokes = []; redraw(); x.sfx.play('close'); });
        x.key = (e) => { if (e.code === 'KeyZ') { strokes.pop(); redraw(); return true; } return false; };
        const aud = (x.frame.heads ?? []).filter((h) => h.role === 'audience');
        const lines = [['башня?', 'Петя'], ['ракета', 'Соня'], ['свеча', 'Кузя'], ['угадал!', 'ОченьДлинныйНик', 'win'], ['фонарь?', 'Мила']];
        lines.forEach(([t, n, m], i) => x.later(() => { const h = aud[(i * 3 + 1) % aud.length]; if (h) stage.say(h.id, t, m ?? 'new', 5000, n); x.sfx.play(m ? 'win' : 'pop'); }, 1200 + i * 1700));
      },
    },
  ],
};

// ---------------------------------------------------------------- «Кто из нас?»
export const WHOOFUS = {
  id: 'whoofus',
  title: 'Кто из нас?',
  steps: [
    {
      id: 'vote', frame: 'whoofus-seat', title: 'Голос — клик по желейке',
      caption: 'Вопрос на табло, голос — клик по желейке в зале (подсветка); раскрытие — полосы голосов на табло и титул лидеру',
      run(x) {
        const { hud, stage, frame } = x;
        const aud = (frame.heads ?? []).filter((h) => h.role === 'audience');
        const names = ['Петя', 'Оля', 'Соня', 'ОченьДлинныйНик', 'Кузя', 'Мила', 'Гоша', 'Ника', 'Лёва', 'Тоша'];
        const s = { phase: 'vote', round: 3, rounds: 10, q: 'Кто из нас первым уснёт на рыбалке?', left: 15, total: 15, votes: 3, voters: aud.length + 1, results: [] };
        const b = painter(x, boardOf(x), paintWho, s);
        hud.chat.setCanGame(false);
        hud.event({ img: 'q-win', title: 'Голосуй — кликни по желейке', ring: 1, ringText: '0:15' });
        // зоны клика над головами
        let mine = null;
        const hits = aud.map((h, i) => {
          const el = document.createElement('button');
          el.type = 'button';
          el.className = 'qz-hit';
          const r = h.r ?? 40;
          Object.assign(el.style, { left: `${h.x - r * 1.1}px`, top: `${h.y - r * 0.2}px`, width: `${r * 2.2}px`, height: `${r * 2.6}px` });
          el.title = names[i % names.length];
          el.innerHTML = `<span class="qz-hit-name">${esc(names[i % names.length])}</span>`;
          el.addEventListener('click', () => {
            if (s.phase !== 'vote') return;
            for (const o of x.layer.querySelectorAll('.qz-hit')) o.classList.remove('is-on');
            el.classList.add('is-on');
            if (!mine) s.votes++;
            mine = names[i % names.length];
            b.draw(); x.sfx.play('click');
            hud.event({ img: 'q-win', title: `Твой голос: <b>${esc(mine)}</b>`, sub: 'тайно · можно передумать', ring: s.left / s.total, ringText: mmss(s.left) });
          });
          x.layer.appendChild(el);
          return el;
        });
        x.every(() => { if (s.phase === 'vote' && s.votes < s.voters - 1) { s.votes++; b.draw(); } }, 1300);
        x.every(() => {
          if (s.phase !== 'vote') return;
          s.left = Math.max(0, s.left - 1);
          hud.ring(s.left / s.total, mmss(s.left), s.left <= 5);
          if (s.left === 0) reveal();
        }, 1000);
        const reveal = () => {
          s.phase = 'reveal';
          s.results = [{ nick: 'Соня', n: 5 }, { nick: 'Кузя', n: 3 }, { nick: 'Петя', n: 2 }, { nick: 'ОченьДлинныйНик', n: 1 }];
          s.title = 'Соня набережной';
          b.reset();
          for (const h of hits) h.remove();
          const leadIdx = names.indexOf('Соня');
          const lh = aud[leadIdx];
          if (lh) { stage.ring(lh.id); stage.say(lh.id, 'Соня набережной', 'win', 0, 'титул'); const c = stage.bubbleCenter(lh.id); if (c) stage.confetti(c[0], c[1], 50, 300); }
          x.sfx.play('win');
          const hit = mine === 'Соня';
          hud.event({ img: 'q-win', title: hit ? 'Ты угадал мнение зала · <b>+1</b>' : 'Зал выбрал <b>Соню</b>', tone: hit ? 'good' : undefined });
          if (hit) { hud.tokens(x.me.tokens += 1); hud.pop('+1'); }
        };
        hud.slots.bc.appendChild(Object.assign(document.createElement('div'), { className: 'k-prompt qz-prompt', innerHTML: `<i class="k-mouse k-mouse--l"></i><span>Клик по желейке — голос</span><span class="k-prompt-sep"></span><span class="k-prompt-note">за себя нельзя</span>` }));
      },
    },
  ],
};

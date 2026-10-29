// «Загадка» — кадры игры по шагам. Каждый шаг: кадр сцены + табло + облачка + HUD и маленький сценарий с ботами.
import { BOARD_H, BOARD_W, paintRiddle, riddleChainRect } from './world/board.js';
import { mmss } from './world/paint.js';
import { WarmCard, coinHtml, esc, keyHtml, openWindow, qImg } from './hud.js';

const CATS = ['Предмет', 'Животное', 'Человек', 'Место', 'Фильм или книга', 'Еда', 'Другое'];
const GUESTS = ['Петя', 'Оля', 'ОченьДлинныйНик', 'Соня', 'Кузя', 'Мила', 'Гоша', 'Дед Мороз', 'Ника', 'Лёва', 'Тоша', 'Вика'];
const norm = (s) => s.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9 ]/g, '').trim();
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const check = (guess, answer) => { const g = norm(guess), a = norm(answer); if (g === a) return 'yes'; return lev(g, a) <= 2 && a.length >= 4 ? 'near' : 'no'; };

/** Общая часть шага: роли голов, табло, лента «В игру», отметки (облачко ↔ строка дока ↔ табло) */
function setup(x, { me, riddler, word, category, total = 300, left = 252, phase = 'round' }) {
  const { stage, hud, frame, icons, sfx } = x;
  const heads = frame.heads ?? [];
  const rHead = heads.find((h) => h.role === 'riddler');
  const meHead = heads.find((h) => h.role === 'me');
  const guestHeads = heads.filter((h) => h.role !== 'riddler' && h.role !== 'me');
  const who = {};
  const nickOf = new Map();
  if (rHead) { if (riddler === me.nick || !frame.board) who[rHead.id] = { nick: riddler, level: 12, own: riddler === me.nick }; nickOf.set(riddler, rHead.id); }
  if (meHead && riddler !== me.nick) { who[meHead.id] = { nick: me.nick, level: me.level, own: true }; nickOf.set(me.nick, meHead.id); }
  guestHeads.forEach((h, i) => { const n = GUESTS[i % GUESTS.length]; who[h.id] = { nick: n, level: 3 + ((i * 7) % 20) }; nickOf.set(n, h.id); });
  // ников над головами в «Ракушке» нет: ник — строкой в облачке того, кто пишет
  const board = frame.board ? stage.quad(frame.board, BOARD_W, BOARD_H, 'st-board') : null;
  const s = { phase, category, left, total, chain: [], hints: [], misses: [], icons, answer: word };
  let t0 = performance.now();
  const draw = () => { if (!board) return; paintRiddle(board.ctx, s, performance.now() - t0); board.flush(); };
  draw();
  x.every(draw, 250); // как в игре: табло ≤ 4 раз в секунду
  const lines = [];
  let seq = 0;

  /** Строка «В игру» + облачко над автором */
  const guess = (nick, text, { own = false } = {}) => {
    const line = { id: `g${++seq}`, nick, text, own, game: true, mark: '', at: performance.now() };
    const res = check(text, word);
    line.near = res === 'near';
    lines.push(line);
    hud.chat.add(line);
    const hid = nickOf.get(nick);
    if (hid) { stage.say(hid, text, 'new', 7000, own ? '' : nick); sfx.play('pop'); }
    if (res === 'yes') x.later(() => mark(line, 'win'), 450);
    return line;
  };

  /** Отметка загадывающего: облачко меняет цвет, строка в доке — значок; 👍 улетает на табло */
  // «Тепло» — закреплённая карточка в левом верхнем углу у всех (слово владельца); табло — для тех, кто смотрит со стороны
  const warm = new WarmCard(hud.slots.tl);
  const boardAdd = (text, nick) => {
    for (const c of s.chain) c.fresh = false;
    const c = { text, nick, fresh: true };
    s.chain.push(c);
    draw();
    x.later(() => { c.fresh = false; }, 2600);
  };

  const mark = (line, tone) => {
    if (line.mark || s.phase !== 'round') return;
    const hid = nickOf.get(line.nick);
    const hasBubble = hid && stage.heads.get(hid)?.bubble;
    if (tone === 'warm') {
      sfx.play('warm');
      const row = warm.add(line.nick, line.text, { hidden: true });
      const target = stage.rectOf(row);
      const arrive = () => { warm.show(row); boardAdd(line.text, line.nick); sfx.play('pop'); };
      if (hud.chat.marks && line.row) {
        // загадывающий: строка дока улетает в угол «Тепло» и уходит из дока; облачко в зале — мятное
        if (hasBubble) stage.mark(hid, 'warm', 2500);
        hud.chat.setMark(line, 'warm');
        sfx.play('whoosh');
        stage.flyEl(line.row, target).then(arrive);
        line.row.remove();
        hud.chat.refreshKeys();
      } else if (hasBubble) {
        // угадывающие: облачко над головой мятнеет и улетает в угол
        hud.chat.setMark(line, 'warm');
        stage.mark(hid, 'warm');
        const q = [[target.x, target.y], [target.x + target.w, target.y], [target.x + target.w, target.y + target.h], [target.x, target.y + target.h]];
        x.later(() => { sfx.play('whoosh'); stage.fly(hid, q, 900).then(arrive); }, 480);
        x.later(() => { line.row?.remove(); }, 900);
      } else { hud.chat.setMark(line, 'warm'); line.row?.remove(); arrive(); }
    } else if (tone === 'miss') {
      sfx.play('miss');
      hud.chat.setMark(line, 'miss');
      if (hasBubble) stage.mark(hid, 'miss', 1500);
      // «мимо» в доке — зачёркнута и тает
      const rowEl = line.row;
      x.later(() => rowEl?.classList.add('is-gone'), 1800);
      x.later(() => { rowEl?.remove(); hud.chat.refreshKeys(); }, 2400);
      s.misses.push(line.text);
      draw();
    } else if (tone === 'win') {
      hud.chat.setMark(line, 'win');
      solved(line);
    }
  };

  const oldest = () => lines.find((l) => !l.mark && !l.own && l.nick !== riddler);

  let onSolved = () => {};
  const solved = (line) => {
    s.phase = 'solved';
    s.solver = line.nick;
    s.solvedIn = s.total - s.left;
    s.warmBy = [...new Set(s.chain.map((c) => c.nick))];
    hud.chat.setMark(line, 'win');
    for (const l of lines) if (!l.mark) l.row?.querySelector('.qz-markbtns')?.remove();
    const hid = nickOf.get(line.nick);
    if (hid && stage.heads.get(hid)) {
      if (!stage.heads.get(hid).bubble) stage.say(hid, line.text, 'new', 0, line.own ? '' : line.nick);
      stage.mark(hid, 'win', 6000);
      const c = stage.bubbleCenter(hid) ?? [stage.heads.get(hid).x, stage.heads.get(hid).y];
      stage.confetti(c[0], c[1], 70, 420);
    }
    // конфетти «из ракушки» — от верха табло
    const top = frame.board ? [(frame.board[0][0] + frame.board[1][0]) / 2, Math.min(frame.board[0][1], frame.board[1][1])] : [720, 40];
    stage.confetti(top[0], top[1], 80, 700);
    sfx.play('win');
    t0 = performance.now();
    draw();
    onSolved(line);
  };

  // время раунда
  x.every(() => {
    if (s.phase !== 'round') return;
    s.left = Math.max(0, s.left - 1);
    if (s.left <= 5 && s.left > 0) sfx.play('tick');
    hud.ring(s.left / s.total, mmss(s.left), s.left <= 60);
    if (s.left === 0) { s.phase = 'timeout'; s.next = 'Оля'; s.nextLeft = 10; draw(); }
  }, 1000);

  /** Готовая цепочка (кадр с середины раунда): в угол и на табло без анимации */
  const preset = (list) => { for (const [n, t] of list) { warm.add(n, t, { fresh: false }); s.chain.push({ text: t, nick: n }); } draw(); };
  const hint = (t) => { s.hints.push(t); warm.hint(t); draw(); };
  return { s, draw, guess, mark, oldest, lines, nickOf, board, rHead, meHead, warm, preset, hint, set onSolved(f) { onSolved = f; } };
}

function ringPlate(hud, title, s, img = null, avatar = null) {
  hud.event({ img, avatar, title, ring: s.left / s.total, ringText: mmss(s.left) });
  hud.ring(s.left / s.total, mmss(s.left), s.left <= 60);
}

// ---------------------------------------------------------------- шаги
export const RIDDLE = {
  id: 'riddle',
  title: 'Загадка',
  steps: [
    {
      id: 'idle', frame: 'venue-entrance', fallback: 'riddle-seat', title: 'Сцена свободна',
      caption: 'Вошёл в ограду: табло само объясняет игру, внутри — свой голос',
      run(x) {
        const { stage, hud, frame, icons } = x;
        if (frame.board) { const board = stage.quad(frame.board, BOARD_W, BOARD_H, 'st-board'); paintRiddle(board.ctx, { phase: 'idle', icons }, 0); board.flush(); }
        hud.chat.setCanGame(false);
        hud.chat.add({ nick: 'Оля', text: 'кто на ракушку? сыграем', game: false });
        x.later(() => { hud.toast({ icon: 'voice', title: 'Ты на «Ракушке»', sub: 'здесь свой голос — набережная не слышит' }); x.sfx.play('pop'); }, 500);
        hud.prompt('E', 'Сесть смотреть');
      },
    },
    {
      id: 'ask', frame: 'riddle-stage', title: 'Что загадал?',
      caption: 'У трибуны: одно окно — слово, тема одной кнопкой, по желанию подсказка',
      run(x) {
        const { stage, hud, frame, icons } = x;
        if (frame.board) { const board = stage.quad(frame.board, BOARD_W, BOARD_H, 'st-board'); paintRiddle(board.ctx, { phase: 'idle', icons }, 0); board.flush(); }
        hud.chat.setCanGame(false);
        const open = () => {
          hud.prompt(null);
          x.sfx.play('open');
          const w = openWindow(x.layer, {
            img: 'q-win', eyebrow: '«Ракушка» · Загадка', title: 'Что загадал?', mode: 'riddle',
            body: `<div class="qz-ask">
              <label class="qz-field"><span class="qz-label">Слово или фраза</span>
                <input class="k-input qz-word" maxlength="40" placeholder="Например: пароход" value="${esc(x.data.word ?? '')}"></label>
              <p class="k-faint qz-note">Видишь только ты — остальные угадывают в чате</p>
              <div class="qz-field"><span class="qz-label">Тема</span><div class="k-seg qz-cats">${CATS.map((c) => `<button type="button" class="${c === (x.data.category ?? 'Предмет') ? 'is-on' : ''}">${c}</button>`).join('')}</div></div>
              <label class="qz-field"><span class="qz-label">Первая подсказка <em>по желанию</em></span>
                <input class="k-input qz-hint" maxlength="40" placeholder="Например: дымит"></label>
              <p class="qz-err k-bad" hidden></p></div>`,
            foot: `<span class="k-note">Разгадают — тебе +10 ${coinHtml()}</span><button class="k-btn k-btn--ghost" data-a="cancel" type="button">Отмена</button><button class="k-btn k-btn--go" data-a="go" type="button">Загадать${keyHtml('Enter', 'tr')}</button>`,
          }, () => { x.sfx.play('close'); hud.prompt('E', 'Загадать', 'трибуна'); });
          const word = w.win.querySelector('.qz-word');
          word.focus();
          word.select();
          for (const b of w.win.querySelectorAll('.qz-cats button')) b.addEventListener('click', () => { for (const o of w.win.querySelectorAll('.qz-cats button')) o.classList.remove('is-on'); b.classList.add('is-on'); x.sfx.play('click'); });
          const go = () => {
            const v = word.value.trim();
            const err = w.win.querySelector('.qz-err');
            if (v.length < 2) { err.textContent = 'Напиши слово — от 2 до 40 знаков'; err.hidden = false; x.sfx.play('close'); word.focus(); return; }
            x.data.word = v;
            x.data.category = w.win.querySelector('.qz-cats .is-on')?.textContent ?? 'Другое';
            x.data.hint = w.win.querySelector('.qz-hint').value.trim();
            w.close();
            x.sfx.play('puff');
            const sp = frame.spot ?? [720, 420];
            stage.puff(sp[0], sp[1], 70);
            x.later(() => x.go('mark'), 650);
          };
          w.win.querySelector('[data-a="go"]').addEventListener('click', go);
          w.win.querySelector('[data-a="cancel"]').addEventListener('click', w.close);
          w.win.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } e.stopPropagation(); });
        };
        x.key = (e) => { if (e.code === 'KeyE' && !x.layer.querySelector('.qz-scrim')) { open(); return true; } return false; };
        hud.slots.bc.addEventListener('click', (e) => { if (e.target.closest('.qz-prompt')) open(); });
        x.later(open, 350);
      },
    },
    {
      id: 'mark', frame: 'riddle-stage', title: 'Загадывающий отмечает',
      caption: 'Ты на сцене: [warm] «тепло» улетает на табло цепочкой, [miss] «мимо» сереет и тает. Клавиши 1 / 2 или мышью у строки',
      run(x) {
        const { hud } = x;
        const word = x.data.word || 'пароход';
        const r = setup(x, { me: x.me, riddler: x.me.nick, word, category: x.data.category ?? 'Предмет', left: 262 });
        if (x.data.hint) r.hint(x.data.hint);
        hud.chat.marks = true;
        hud.chat.setCanGame(false);
        ringPlate(hud, `Ты загадал: <b class="k-gold">${esc(word)}</b>`, r.s, 'q-win');
        // подсказка клавиш внизу — только до первой отметки: дальше колпачки 1/2 есть у строки дока
        hud.chat.onMark = (line, tone) => { r.mark(line, tone); keys.remove(); };
        // ряд клавиш + «Подсказка»
        const keys = document.createElement('div');
        keys.className = 'k-plate mo-keys key-hint qz-keys';
        keys.innerHTML = `<span class="mo-key">${keyHtml('1')}<em>тепло</em></span><span class="mo-key">${keyHtml('2')}<em>мимо</em></span><span class="mo-key">${keyHtml('Enter')}<em>написать всем</em></span>`;
        const hb = document.createElement('button');
        hb.type = 'button';
        hb.className = 'k-btn k-btn--ghost k-btn--sm qz-hintbtn';
        const hintLabel = () => { hb.innerHTML = `<span class="k-row-line">Подсказка <span class="k-faint">${r.s.hints.length}/3</span></span>${keyHtml('H', 'tr', 'sm')}`; hb.disabled = r.s.hints.length >= 3; };
        hintLabel();
        const wrapBc = document.createElement('div');
        wrapBc.className = 'qz-bc';
        wrapBc.append(keys, hb);
        hud.slots.bc.appendChild(wrapBc);
        const askHint = () => {
          if (r.s.hints.length >= 3 || x.layer.querySelector('.qz-scrim')) return;
          x.sfx.play('open');
          const w = openWindow(x.layer, {
            img: 'q-win', eyebrow: `Подсказка ${r.s.hints.length + 1} из 3`, title: 'Подсказка', size: 'sm', mode: 'riddle',
            body: '<input class="k-input qz-word" maxlength="40" placeholder="Например: дымит"><p class="k-faint qz-note">Встанет на табло — все увидят</p>',
            foot: `<button class="k-btn k-btn--ghost" data-a="cancel" type="button">Отмена</button><button class="k-btn k-btn--go" data-a="go" type="button">На табло${keyHtml('Enter', 'tr')}</button>`,
          }, () => x.sfx.play('close'));
          const inp = w.win.querySelector('input');
          inp.focus();
          const go = () => { const v = inp.value.trim(); if (!v) return inp.focus(); r.hint(v); hintLabel(); w.close(); x.sfx.play('warm'); };
          w.win.querySelector('[data-a="go"]').addEventListener('click', go);
          w.win.querySelector('[data-a="cancel"]').addEventListener('click', w.close);
          w.win.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } e.stopPropagation(); });
        };
        hb.addEventListener('click', askHint);
        x.key = (e) => {
          if (x.layer.querySelector('.qz-scrim')) return false;
          if (e.code === 'Digit1' || e.code === 'Digit2') { const l = r.oldest(); if (l) { r.mark(l, e.code === 'Digit1' ? 'warm' : 'miss'); keys.remove(); } return true; }
          if (e.code === 'KeyH') { askHint(); return true; }
          return false;
        };
        // боты угадывают; к концу — опечатка («похоже на ответ») и верный ответ
        const script = ['машина', 'это едят?', 'оно плавает?', 'лодка', 'рыба', 'оно большое?', 'корабль', 'на нём катаются по морю?', 'яхта', `${word.slice(0, 3)}${word[3] === "а" ? "о" : "а"}${word.slice(4)}`, word];
        let i = 0;
        const bots = [...r.nickOf.keys()].filter((n) => n !== x.me.nick);
        x.every(() => {
          if (r.s.phase !== 'round' || i >= script.length) return;
          r.guess(bots[(i * 5 + 1) % bots.length], script[i]);
          i++;
        }, 2600);
        r.onSolved = (line) => {
          wrapBc.remove();
          hud.event({ img: 'q-win', title: `Разгадали! <b class="k-gold">${esc(line.nick)}</b> угадал`, lamp: true, tone: 'good' });
          x.later(() => { hud.toast({ tone: 'reward', title: `+10 ${coinHtml()} за загадку`, sub: 'загадка разгадана вовремя', life: 4200 }); hud.tokens(x.me.tokens += 10); hud.pop('+10'); x.sfx.play('reward'); }, 1400);
        };
      },
    },
    {
      id: 'guess', frame: 'riddle-seat', title: 'Угадываешь со стула',
      caption: 'Ты на стуле: пиши в чат (Enter) — догадка облачком над тобой; цепочка «тепло» и подсказки — на табло',
      run(x) {
        const { hud } = x;
        const r = setup(x, { me: x.me, riddler: 'Барон', word: 'пароход', category: 'Предмет', left: 72 });
        r.s.misses.push('самолёт', 'это едят?');
        ringPlate(hud, '<b>Барон</b> загадал', r.s, null, '#e8456b');
        hud.chat.setCanGame(true);
        const seat = hud.seat(() => x.sfx.play('pop'), () => x.sfx.play('click'));
        hud.chat.onOpen = (o) => { seat.querySelector('.qz-emotes').hidden = o; };
        hud.chat.onSend = (text, scope) => {
          if (scope === 'all') { hud.chat.add({ nick: x.me.nick, text, own: true }); return; }
          const line = r.guess(x.me.nick, text, { own: true });
          if (check(text, 'пароход') === 'yes') return;
          const warm = /корабл|судно|лодк|плав|пар|дым|катер|теплоход|море|вод/i.test(text);
          x.later(() => r.mark(line, warm ? 'warm' : 'miss'), 1300);
        };
        x.key = (e) => { if (e.code === 'Enter') { hud.chat.open(); return true; } return false; };
        // гости угадывают, Барон отмечает
        const script = [['Петя', 'машина', 'miss'], ['Оля', 'оно плавает?', 'warm'], ['ОченьДлинныйНик', 'рыба', 'miss'], ['Соня', 'лодка', 'warm'], ['Кузя', 'оно большое?', 'warm'], ['Петя', 'яхта', 'miss'], ['Мила', 'на нём катаются?', 'warm'], ['Оля', 'корабль', 'warm'], ['Соня', 'подводная лодка', 'miss']];
        let i = 0;
        x.every(() => {
          if (r.s.phase !== 'round' || i >= script.length) return;
          const [n, t, m] = script[i++];
          const line = r.guess(n, t);
          x.later(() => r.mark(line, m), 1500 + (i % 3) * 400);
          if (i === 4) x.later(() => { r.hint('дымит'); x.sfx.play('warm'); }, 900);
        }, 2400);
        r.onSolved = (line) => {
          seat.remove();
          if (line.own) myTurn(x, r);
        };
      },
    },
    {
      id: 'solved', frame: 'riddle-seat', title: 'Разгадали!',
      caption: '[win] Петя угадал: золотое облачко, конфетти из ракушки, слово во всё табло. За своё «тепло» — +1',
      run(x) {
        const { hud } = x;
        const r = setup(x, { me: x.me, riddler: 'Барон', word: 'пароход', category: 'Предмет', left: 118 });
        r.hint('дымит');
        r.s.misses.push('машина', 'рыба', 'яхта', 'самолёт');
        r.preset([['Оля', 'оно плавает?'], [x.me.nick, 'оно большое?'], ['Соня', 'лодка'], ['Оля', 'корабль']]);
        ringPlate(hud, '<b>Барон</b> загадал', r.s, null, '#e8456b');
        hud.chat.setCanGame(true);
        for (const [n, t, m] of [['ОченьДлинныйНик', 'катер?', 'miss'], ['Мила', 'оно железное?', '']]) hud.chat.add({ id: `p${n}`, nick: n, text: t, game: true, mark: m });
        const seat = hud.seat(() => x.sfx.play('pop'), () => x.sfx.play('click'));
        x.later(() => r.guess('Кузя', 'теплоход'), 700);
        x.later(() => r.mark(r.lines[0], 'warm'), 1700);
        x.later(() => r.guess('Петя', 'пароход'), 3300);
        r.onSolved = (line) => {
          seat.querySelector('.qz-emotes').hidden = false;
          hud.event({ avatar: '#7bc96f', title: `Дальше загадывает <b>${esc(line.nick)}</b>`, ring: 1, ringText: '0:10' });
          // награда за своё «тепло» — цифрой у бейджа: на табло уже написано, кто подсказал
          x.later(() => { hud.tokens(x.me.tokens += 1); hud.pop('+1'); x.sfx.play('reward'); }, 1800);
          let n = 10;
          r.s.next = line.nick; r.s.nextLeft = n;
          x.every(() => { if (n > 0) n--; r.s.nextLeft = n; hud.ring(n / 10, mmss(n)); }, 1000);
        };
      },
    },
    {
      id: 'myturn', frame: 'riddle-seat', title: 'Ты разгадал — твой ход',
      caption: 'Угадал сам: +15, и ты загадываешь следующим — «Загадываю!» или «Пропустить» прямо в плашке',
      run(x) {
        const { hud } = x;
        const r = setup(x, { me: x.me, riddler: 'Барон', word: 'пароход', category: 'Предмет', left: 96 });
        r.hint('дымит'); r.hint('гудит у причала');
        r.s.misses.push('машина', 'рыба', 'яхта');
        r.preset([['Оля', 'оно плавает?'], ['ОченьДлинныйНик', 'большое и шумное?'], ['Соня', 'лодка'], ['Оля', 'корабль'], ['Мила', 'на нём катаются?'], ['Петя', 'по морю ходит'], ['Кузя', 'теплоход']]);
        ringPlate(hud, '<b>Барон</b> загадал', r.s, null, '#e8456b');
        hud.chat.setCanGame(true);
        hud.seat(() => x.sfx.play('pop'), () => x.sfx.play('click'));
        hud.chat.open();
        const typed = 'пароход';
        let k = 0;
        x.every(() => { if (k < typed.length) hud.chat.input.value = typed.slice(0, ++k); }, 110);
        x.later(() => { hud.chat.input.value = ''; hud.chat.close(); r.guess(x.me.nick, typed, { own: true }); }, 1500);
        r.onSolved = () => myTurn(x, r);
      },
    },
  ],
};

/** Ты разгадал: награда, плашка «Твоя очередь» с кнопками (10 с) */
function myTurn(x, r) {
  const { hud } = x;
  hud.slots.br.replaceChildren();
  // табло уже кричит «Разгадали!» и твой ник — здесь только жетоны у бейджа и твой ход
  x.later(() => { hud.tokens(x.me.tokens += 15); hud.pop('+15'); x.sfx.play('reward'); }, 1300);
  let n = 10;
  r.s.next = x.me.nick; r.s.nextLeft = n;
  // сверху — одна строка (табло под ней не закрываем), кнопки — внизу по центру, где обычно подсказка «E — …»
  const plate = () => {
    hud.event({ img: 'q-win', title: 'Твоя очередь загадывать', lamp: true, ring: n / 10, ringText: mmss(n) });
    const bar = document.createElement('div');
    bar.className = 'k-plate qz-turn';
    bar.innerHTML = `<button class="k-btn k-btn--go" data-a="go" type="button">Загадываю!${keyHtml('Enter', 'tr', 'sm')}</button><button class="k-btn k-btn--ghost" data-a="skip" type="button">Пропустить</button>`;
    hud.slots.bc.appendChild(bar);
    bar.querySelector('[data-a="go"]').addEventListener('click', () => { x.sfx.play('click'); x.go('ask'); });
    bar.querySelector('[data-a="skip"]').addEventListener('click', () => { x.sfx.play('click'); bar.remove(); r.s.next = 'Оля'; r.draw(); hud.event({ avatar: '#b38cf0', title: 'Дальше загадывает <b>Оля</b>', ring: n / 10, ringText: mmss(n) }); });
  };
  x.later(plate, 900);
  x.key = (e) => { if (e.code === 'Enter' && hud.slots.bc.querySelector('.qz-turn')) { x.go('ask'); return true; } return false; };
  x.every(() => { if (n > 0) n--; r.s.nextLeft = n; hud.ring(n / 10, mmss(n)); }, 1000);
}

export { qImg };

// «Загадка» — кадры игры по шагам. Каждый шаг: кадр сцены + табло + облачка + HUD и маленький сценарий с ботами.
// Игра — 5 загадок или 15 минут, потом «Итоги» и снова голосование «Во что играем?».
import { BOARD_H, BOARD_W, paintRiddle, paintSign } from './world/board.js';
import { mmss } from './world/paint.js';
import { WarmCard, coinHtml, esc, keyHtml, openWindow, qImg } from './hud.js';

const CATS = ['Предмет', 'Животное', 'Человек', 'Место', 'Фильм или книга', 'Еда', 'Другое'];
const IDEAS = {
  'Предмет': ['пароход', 'зонтик', 'маяк', 'чайник', 'гамак', 'бинокль', 'якорь', 'фонарик', 'удочка', 'самовар'],
  'Животное': ['чайка', 'краб', 'дельфин', 'ёж', 'кот', 'медуза', 'пеликан', 'черепаха'],
  'Человек': ['капитан', 'повар', 'рыбак', 'спасатель', 'почтальон', 'фокусник', 'дворник'],
  'Место': ['пляж', 'рынок', 'вокзал', 'библиотека', 'пирс', 'кафе', 'баня'],
  'Фильм или книга': ['Титаник', 'Золушка', 'Шерлок', 'Колобок', 'Остров сокровищ', 'Буратино'],
  'Еда': ['арбуз', 'мороженое', 'шашлык', 'пельмени', 'окрошка', 'блины', 'чебурек'],
  'Другое': ['радуга', 'отпуск', 'шторм', 'сон', 'эхо', 'сквозняк', 'понедельник'],
};
const GUESTS = ['Петя', 'Оля', 'ОченьДлинныйНик', 'Соня', 'Кузя', 'Мила', 'Гоша', 'Дед Мороз', 'Ника', 'Лёва', 'Тоша', 'Вика',
  'Рома', 'Даша', 'Стёпа', 'Лиза', 'Федя', 'Аня', 'Миша', 'Катя', 'Боря', 'Юля', 'Сеня', 'Ира'];
const OF = 5; // загадок в игре (или 15 минут)
const CHECK_MS = 3000; // «Угадал» → дробь «Проверяем…» (бриф: 3 с, загадывающий может отменить)
const MISS_HOLD = 5000; // «мимо» в доке загадывающего: зачёркнута с «↩ Вернуть», потом тает
const SHOT = new URLSearchParams(location.search).has('shot'); // кадр для снимка: «мимо» и проверка замирают, догадки не тают
const norm = (s) => s.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9 ]/g, '').trim();
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const check = (guess, answer) => { const g = norm(guess), a = norm(answer); if (g === a || g.split(' ').includes(a)) return 'yes'; return lev(g, a) <= 2 && a.length >= 4 ? 'near' : 'no'; };
/** Счёт вечера (очки раундов всех игр — не жетоны) */
const evening = (me, plus = {}) => [['Петя', 6], ['Оля', 5], [me, 4], ['Соня', 3], ['Кузя', 2]]
  .map(([n, p]) => [n, p + (plus[n] ?? 0)]).sort((a, b) => b[1] - a[1]);

/** Общая часть шага: роли голов, табло, лента «В игру», отметки (облачко ↔ строка дока ↔ карточка «Тепло»).
 *  edit — вид загадывающего: у строк дока кнопки отметок, в «Тепло» «✕», Z отменяет.
 *  Правка отметок (бриф «Перенос в игру…»): unmark(line) — ✕ в «Тепло» и «↩ Вернуть»; undo() — клавиша Z; «Угадал» — 3 с проверки, их можно отменить. */
function setup(x, { me, riddler, word, category, total = 300, left = 252, phase = 'round', num = 2, edit = false, freeze = false }) {
  const { stage, hud, frame, icons, sfx } = x;
  const heads = frame.heads ?? [];
  const rHead = heads.find((h) => h.role === 'riddler');
  const guestHeads = heads.filter((h) => h.role === 'audience');
  const nickOf = new Map();
  if (rHead && riddler !== me.nick) { nickOf.set(riddler, rHead.id); stage.nick(rHead.id, riddler); }
  guestHeads.forEach((h, i) => { const n = GUESTS[i % GUESTS.length]; if (!nickOf.has(n)) nickOf.set(n, h.id); stage.nick(h.id, n); });
  // своей желейки в кадре нет: над собой — ни облачка, ни ника
  const board = frame.board ? stage.quad(frame.board, BOARD_W, BOARD_H, 'st-board') : null;
  const s = { phase, category, left, total, warmN: 0, warmAt: null, hints: [], misses: [], icons, answer: word, num, of: OF, riddler, evening: evening(me.nick), check: null };
  let t0 = performance.now();
  const draw = () => { if (!board) return; paintRiddle(board.ctx, s, performance.now() - t0); board.flush(); };
  draw();
  x.every(draw, 250); // как в игре: табло ≤ 4 раз в секунду
  const lines = [];
  const guessers = new Set();
  const history = []; // свои отметки по порядку — для Z: { line, tone }
  let seq = 0;
  let plate = () => {}; // обычная плашка шага: возвращается, когда проверку отменили
  let stopRoll = () => {};
  const api = { onChange: () => {}, set onSolved(f) { onSolved = f; } }; // onSolved объявлен ниже: сеттер вызывается позже
  x.r = api; // для проверок: __v2.run.x.r.s, .history …

  /** Строка «В игру» + облачко над автором (с ником внутри; одна живая догадка у игрока) */
  const guess = (nick, text, { own = false } = {}) => {
    const line = { id: `g${++seq}`, nick, text, own, game: true, mark: '', at: performance.now() };
    const res = check(text, word);
    line.near = res === 'near';
    for (const l of lines) if (l.nick === nick && !l.mark) l.mark = 'gone'; // заменена новой
    lines.push(line);
    guessers.add(nick);
    hud.chat.add(line);
    const hid = nickOf.get(nick);
    if (hid && !own) { stage.say(hid, text, 'new', freeze ? 0 : 7000, nick); sfx.play('pop'); }
    if (res === 'yes') x.later(() => mark(line, 'win'), 450);
    return line;
  };

  // «Тепло» — закреплённая карточка в левом верхнем углу у всех (слово владельца); на табло — только число «тепло»
  const warm = new WarmCard(hud.slots.tl);
  if (edit) { hud.chat.marks = true; hud.chat.root.classList.add('is-marks'); warm.editable = true; }
  const boardAdd = () => { s.warmN++; s.warmAt = performance.now() - t0; draw(); };

  /** Облачко автора снова белое (отметку исправили): перекрасить живое или показать заново, если уже растаяло */
  const whiten = (line) => {
    const hid = nickOf.get(line.nick);
    const hd = hid ? stage.heads.get(hid) : null;
    if (!hd) return;
    if (hd.bubble && hd.bubble.text === line.text) {
      hd.bubble.el.classList.remove('is-miss', 'is-marked', 'is-check'); // иначе «мимо» держит облачко серым и полупрозрачным
      stage.mark(hid, 'new', freeze ? 0 : 4500);
    }
    else if (!hd.bubble) stage.say(hid, line.text, 'new', freeze ? 0 : 4500, line.nick);
  };

  const mark = (line, tone) => {
    if (line.mark || s.phase !== 'round' || s.check) return false;
    const hid = nickOf.get(line.nick);
    const hasBubble = hid && stage.heads.get(hid)?.bubble;
    if (tone === 'warm') {
      sfx.play('warm');
      history.push({ line, tone });
      const row = warm.add(line.nick, line.text, { hidden: true, line });
      line.warmRow = row;
      const target = stage.rectOf(row);
      const arrive = () => { if (line.warmRow !== row) return; line.warmShown = true; warm.show(row); boardAdd(); sfx.play('pop'); };
      if (hud.chat.marks && line.row?.isConnected) {
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
      history.push({ line, tone });
      hud.chat.setMark(line, 'miss');
      if (hasBubble) stage.mark(hid, 'miss', freeze ? 0 : 1500);
      // «мимо» в доке: у загадывающего 5 с зачёркнута с «↩ Вернуть», потом тает; у остальных — сразу тает
      const rowEl = line.row;
      const hold = hud.chat.marks ? MISS_HOLD : 1800;
      if (!freeze) {
        x.later(() => { if (line.mark === 'miss' && line.row === rowEl) rowEl?.classList.add('is-gone'); }, hold);
        x.later(() => { if (line.mark === 'miss' && line.row === rowEl) { rowEl?.remove(); hud.chat.refreshKeys(); } }, hold + 600);
      }
      s.misses.push(line.text);
      draw();
    } else if (tone === 'win') {
      startCheck(line);
    }
    api.onChange();
    return true;
  };

  /** Загадывающий исправил отметку (✕ в «Тепло», «↩ Вернуть», Z): строка снова неотмеченная на своём месте по времени,
   *  «тепло» на табло −1 (или «мимо» уходит из списка), облачко автора снова белое. У остальных — то же, но тихо */
  const unmark = (line) => {
    if (s.check?.line === line) return cancelCheck();
    if (s.phase !== 'round' || s.check || (line.mark !== 'warm' && line.mark !== 'miss')) return false;
    const was = line.mark;
    const i = history.findIndex((h) => h.line === line);
    if (i >= 0) history.splice(i, 1);
    if (edit) sfx.play('undo');
    if (was === 'warm') {
      const row = line.warmRow;
      line.warmRow = null;
      if (line.warmShown) { s.warmN = Math.max(0, s.warmN - 1); s.warmAt = null; line.warmShown = false; }
      if (row) {
        // у загадывающего строка летит из карточки обратно в док; у остальных — тихо уходит из карточки
        if (hud.chat.marks) {
          const back = hud.chat.restore(line, { wait: !row.hidden });
          if (!row.hidden) {
            let shown = false;
            const show = () => { if (!shown) { shown = true; hud.chat.reveal(back); } };
            stage.flyEl(row, stage.rectOf(back), 520).then(show, show);
            x.later(show, 1100);
          }
        }
        warm.drop(row);
      }
    } else {
      const k = s.misses.lastIndexOf(line.text);
      if (k >= 0) s.misses.splice(k, 1);
      if (hud.chat.marks || line.row?.isConnected) hud.chat.restore(line);
    }
    line.mark = '';
    whiten(line);
    draw();
    api.onChange();
    return true;
  };

  /** Z: отменить последнюю свою отметку — «тепло», «мимо» или идущую проверку «Угадал»; можно несколько раз подряд */
  const undo = () => {
    if (s.check) return cancelCheck();
    const last = history[history.length - 1];
    return last ? unmark(last.line) : false;
  };

  // ---- «Угадал»: 3 с барабанной дроби «Проверяем…», потом праздник; загадывающий может отменить
  /** Золотая рамка у облачка угадавшего (на время проверки); облачко, которого уже нет, показываем заново */
  const checkBubble = (line, on) => {
    const hid = nickOf.get(line.nick);
    const hd = hid ? stage.heads.get(hid) : null;
    if (!hd) return;
    if (on) {
      if (!hd.bubble) stage.say(hid, line.text, 'new', 0, line.nick);
      const b = hd.bubble;
      clearTimeout(b.timer);
      b.el.classList.remove('is-in', 'is-marked', 'is-miss', 'is-out');
      b.el.classList.add('is-check');
    } else if (hd.bubble) {
      const b = hd.bubble;
      b.el.classList.remove('is-check');
      clearTimeout(b.timer);
      if (!freeze) b.timer = setTimeout(() => { if (hd.bubble === b) stage.dropBubble(hd); }, 3500);
    }
  };
  const paintCheck = () => {
    const c = s.check;
    if (!c) return;
    // кольцо и «Отменить» — только у загадывающего (он стоит спиной к табло); у остальных — плашка с лампой и дробь
    const ev = hud.event({
      img: 'q-win', title: 'Проверяем…', sub: `<b>${esc(c.line.nick)}</b> · «${esc(c.line.text)}»`, lamp: true, noSwap: true,
      ...(edit ? { ring: 1, ringText: String(CHECK_MS / 1000), actions: `<button class="k-btn k-btn--ghost k-btn--sm qz-cancel" type="button">Отменить${keyHtml('Z', 'tr', 'sm')}</button>` } : {}),
    });
    ev?.classList.add('is-check');
    const b = ev?.querySelector('.qz-cancel');
    b?.addEventListener('mousedown', (e) => e.preventDefault());
    b?.addEventListener('click', () => cancelCheck());
  };
  const startCheck = (line) => {
    const c = { line, timer: null, iv: null };
    s.check = c;
    line.mark = 'check';
    hud.chat.setCheck(line, true);
    checkBubble(line, true);
    stopRoll = sfx.roll(CHECK_MS);
    paintCheck();
    // каждую секунду — кольцо и цифра; в кадре для снимка проверка замирает на 2 с
    let ticks = 0;
    c.iv = x.every(() => {
      if (s.check !== c || (freeze && ticks >= 1)) return;
      ticks++;
      hud.ring((CHECK_MS / 1000 - ticks) / (CHECK_MS / 1000), String(CHECK_MS / 1000 - ticks));
    }, 1000);
    if (freeze) x.later(() => stopRoll(), 1600);
    else c.timer = x.later(finishCheck, CHECK_MS);
  };
  const finishCheck = () => {
    const c = s.check;
    if (!c) return;
    clearInterval(c.iv);
    s.check = null;
    stopRoll();
    hud.chat.setCheck(c.line, false);
    checkBubble(c.line, false);
    solved(c.line);
  };
  const cancelCheck = () => {
    const c = s.check;
    if (!c) return false;
    clearInterval(c.iv);
    clearTimeout(c.timer);
    s.check = null;
    stopRoll();
    if (edit) sfx.play('undo');
    hud.chat.setCheck(c.line, false);
    checkBubble(c.line, false);
    hud.chat.restore(c.line); // строка снова неотмеченная; время раунда шло дальше
    plate();
    if (s.left === 0) { s.phase = 'timeout'; draw(); }
    api.onChange();
    return true;
  };

  const oldest = () => lines.find((l) => !l.mark && !l.own && l.nick !== riddler && l.row?.isConnected);

  let onSolved = () => {};
  const solved = (line) => {
    s.phase = 'solved';
    s.solver = line.nick;
    s.solvedIn = s.total - s.left;
    s.evening = evening(me.nick, { [line.nick]: 1 });
    hud.chat.setMark(line, 'win');
    for (const l of lines) if (!l.mark) l.row?.querySelector('.qz-markbtns')?.remove();
    const hid = nickOf.get(line.nick);
    if (hid && stage.heads.get(hid)) {
      if (!stage.heads.get(hid).bubble) stage.say(hid, line.text, 'new', 0, line.nick);
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

  /** Бонус по брифу: раунд шёл ≥ 60 с, гадали ≥ 2 разных, в игре от 3 человек */
  const bonusOk = () => s.total - s.left >= 60 && guessers.size >= 2 && nickOf.size + 1 >= 3;

  // время раунда (идёт и во время проверки; кольцо плашки в эти 3 с — кольцо проверки)
  x.every(() => {
    if (s.phase !== 'round') return;
    s.left = Math.max(0, s.left - 1);
    if (s.left <= 5 && s.left > 0) sfx.play('tick');
    if (!s.check) hud.ring(s.left / s.total, mmss(s.left), s.left <= 60);
    if (s.left === 0 && !s.check) { s.phase = 'timeout'; draw(); }
  }, 1000);

  /** Готовые «тепло» (кадр с середины раунда): в угол без анимации, на табло — число. У каждой своя строка «В игру»
   *  (старше всех в доке), поэтому «✕» и Z работают и на них */
  const preset = (list) => {
    list.forEach(([n, t], k) => {
      const line = { id: `p${++seq}`, nick: n, text: t, game: true, mark: 'warm', at: performance.now() - 120000 + k * 1000 };
      line.warmRow = warm.add(n, t, { fresh: false, line });
      line.warmShown = true;
      history.push({ line, tone: 'warm' });
      s.warmN++;
      guessers.add(n);
    });
    draw();
  };
  const hint = (t) => { s.hints.push(t); warm.hint(t); draw(); };
  return Object.assign(api, {
    s, draw, guess, mark, unmark, undo, oldest, lines, history, nickOf, board, rHead, warm, preset, hint, bonusOk,
    setPlate(f) { plate = f; f(); }, // плашка шага: рисуется сразу и возвращается после отмены проверки
  });
}

/** Плашка сверху: значок режима (свиток), заголовок, кольцо времени */
function ringPlate(hud, title, s, back = false) {
  // время — на табло; кольцо на плашке только тому, кто стоит спиной к табло (загадывающий на сцене)
  hud.event({ icon: 'scroll', title, ...(back ? { ring: s.left / s.total, ringText: mmss(s.left) } : {}) });
  if (back) hud.ring(s.left / s.total, mmss(s.left), s.left <= 60);
}

/** «Дальше загадывает X» — только на плашке (на табло этого нет), 10 с */
function nextPlate(x, nick) {
  let n = 10;
  const paint = () => x.hud.event({ icon: 'scroll', title: `Дальше загадывает <b>${esc(nick)}</b>`, noSwap: true });
  paint();
  x.every(() => { if (n > 0) n--; x.hud.ring(n / 10, mmss(n)); }, 1000);
}

/** Сидишь и угадываешь: игровой ряд эмоций 1–7, на время поля ввода — прячется */
function seated(x) {
  const seat = x.hud.seat(() => x.sfx.play('pop'), () => x.sfx.play('click'));
  x.hud.chat.onOpen = (o) => x.hud.emotes(!o);
  return seat;
}

/** Чат загадывающего: пишет «В игру», как все; строку с ответом сервер отклоняет */
function riddlerChat(x, word) {
  const { hud } = x;
  hud.chat.setCanGame(true);
  hud.chat.setPerformer(true);
  hud.chat.onSend = (text, scope) => {
    if (scope === 'game' && check(text, word) !== 'no') { hud.toast({ tone: 'warn', icon: 'lock', title: 'Нельзя писать ответ', sub: 'дай подсказку словами — или H', life: 3200 }); x.sfx.play('close'); return; }
    hud.chat.add({ nick: x.me.nick, text, own: true, game: scope === 'game' });
  };
}

/** Низ-центр загадывающего: ряд клавиш + «Подсказка»; клавиши 1/2/3, Z, H, Enter; кнопки строк дока, «✕» в «Тепло», «↩ Вернуть».
 *  Ряд клавиш: до первой отметки «1 тепло · 2 мимо · 3 угадал», дальше (колпачки 1/2/3 уже на строке дока) — «Z отменить». */
function riddlerUi(x, r, word) {
  const { hud } = x;
  const keys = document.createElement('div');
  keys.className = 'k-plate mo-keys key-hint qz-keys';
  let used = false;
  const paintKeys = () => {
    if (r.history.length) used = true;
    const can = r.history.length > 0 || !!r.s.check;
    keys.innerHTML = used
      ? `<span class="mo-key${can ? '' : ' is-off'}">${keyHtml('Z')}<em>отменить</em></span>`
      : `<span class="mo-key">${keyHtml('1')}<em>тепло</em></span><span class="mo-key">${keyHtml('2')}<em>мимо</em></span><span class="mo-key">${keyHtml('3')}<em>угадал</em></span>`;
  };
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
      icon: 'scroll', eyebrow: `Подсказка ${r.s.hints.length + 1} из 3`, title: 'Подсказка', size: 'sm', mode: 'riddle',
      body: '<input class="k-input qz-word" maxlength="40" placeholder="Например: дымит"><p class="k-faint qz-note">Встанет на табло и в карточку «Тепло»</p>',
      foot: `<button class="k-btn k-btn--ghost" data-a="cancel" type="button">Отмена</button><button class="k-btn k-btn--go" data-a="go" type="button">На табло${keyHtml('Enter', 'tr')}</button>`,
    }, () => x.sfx.play('close'));
    const inp = w.win.querySelector('input');
    inp.focus();
    const go = () => { const v = inp.value.trim(); if (!v) return inp.focus(); if (check(v, word) !== 'no') { inp.value = ''; inp.placeholder = 'Ответ нельзя — опиши иначе'; return inp.focus(); } r.hint(v); hintLabel(); w.close(); x.sfx.play('warm'); };
    w.win.querySelector('[data-a="go"]').addEventListener('click', go);
    w.win.querySelector('[data-a="cancel"]').addEventListener('click', w.close);
    w.win.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } e.stopPropagation(); });
  };
  hb.addEventListener('click', askHint);
  // отметки и их исправление: мышь — кнопки у строк, «✕» в «Тепло», «↩ Вернуть»; клавиши — 1/2/3 и Z
  hud.chat.onMark = (line, tone) => { r.mark(line, tone); };
  hud.chat.onUndo = (line) => { r.unmark(line); };
  r.warm.onRemove = (line) => { if (line) r.unmark(line); };
  r.onChange = paintKeys;
  paintKeys();
  const KEYMARK = { Digit1: 'warm', Digit2: 'miss', Digit3: 'win' };
  x.key = (e) => {
    if (x.layer.querySelector('.qz-scrim')) return false;
    if (e.code === 'KeyZ') { r.undo(); return true; }
    if (KEYMARK[e.code]) { const l = r.oldest(); if (l) r.mark(l, KEYMARK[e.code]); return true; }
    if (e.code === 'KeyH') { askHint(); return true; }
    if (e.code === 'Enter') { hud.chat.open(); return true; }
    return false;
  };
  return { wrapBc, keys, paintKeys, hintLabel };
}

/** Раунд загадывающего закончен (проверка прошла): плашка «Разгадали!», бонус, «Дальше загадывает…» */
function riddlerEnd(x, r, ui) {
  const { hud } = x;
  return (line) => {
    ui.wrapBc.remove();
    hud.event({ img: 'q-win', title: `Разгадали! <b class="k-gold">${esc(line.nick)}</b> угадал`, lamp: true, tone: 'good', noSwap: true });
    x.later(() => {
      if (r.bonusOk()) { hud.toast({ tone: 'reward', title: `+10 ${coinHtml()} за загадку`, sub: 'гадали дольше минуты', life: 4200 }); hud.tokens(x.me.tokens += 10); hud.pop('+10'); x.sfx.play('reward'); }
      else hud.toast({ icon: 'stopwatch', title: 'Без бонуса', sub: 'разгадали быстрее минуты', life: 3600 });
    }, 1400);
    x.later(() => nextPlate(x, line.nick), 3600);
  };
}

/** Рука-курсор в кадре для снимка (?shot): «строка под мышью» — снимок не рисует настоящий курсор */
function cursorOn(x, el) {
  const b = x.stage.rectOf(el);
  const c = document.createElement('i');
  c.className = 'qz-cursor';
  c.innerHTML = '<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path d="M5 3l14 9.2-6.2 1.5 3.6 6.5-3 1.7-3.6-6.5L5 18.5z" fill="#fff" stroke="#16313a" stroke-width="1.7" stroke-linejoin="round"/></svg>';
  Object.assign(c.style, { left: `${b.x + b.w * 0.74}px`, top: `${b.y + b.h * 0.8}px` }); // острие — у нижнего правого края кнопки: «✕» остаётся видна
  x.layer.appendChild(c);
}

// ---------------------------------------------------------------- шаги
export const RIDDLE = {
  id: 'riddle',
  title: 'Загадка',
  steps: [
    {
      id: 'idle', frame: 'venue-entrance', fallback: 'riddle-seat', title: 'Вход',
      caption: 'Над аркой «РАКУШКА» и что идёт, табло зовёт голосовать; у свободного стула — «E Сесть»',
      run(x) {
        const { stage, hud, frame, icons } = x;
        if (frame.board) { const board = stage.quad(frame.board, BOARD_W, BOARD_H, 'st-board'); paintRiddle(board.ctx, { phase: 'idle', icons }, 0); board.flush(); }
        if (frame.sign) { const sign = stage.quad(frame.sign, 1024, 256, 'st-sign'); paintSign(sign.ctx, { status: 'Во что играем?' }); sign.flush(); }
        for (const h of frame.heads ?? []) if (h.role === 'audience') stage.nick(h.id, GUESTS[Number(h.id.slice(1)) % GUESTS.length]);
        hud.chat.setCanGame(false);
        hud.chat.add({ nick: 'Оля', text: 'кто на ракушку? сыграем', game: false });
        x.later(() => { hud.toast({ icon: 'voice', title: 'Ты на «Ракушке»', sub: 'здесь свой голос — набережная не слышит' }); x.sfx.play('pop'); }, 500);
        // у арки подсказки нет; подошёл к свободному стулу — «E Сесть»
        x.later(() => hud.prompt('E', 'Сесть'), 2600);
        x.key = (e) => { if (e.code === 'KeyE' && hud.slots.bc.querySelector('.qz-prompt')) { x.sfx.play('click'); x.goMode('vote', 'idle'); return true; } return false; };
        hud.slots.bc.addEventListener('click', (e) => { if (e.target.closest('.qz-prompt')) x.goMode('vote', 'idle'); });
      },
    },
    {
      id: 'ask', frame: 'riddle-stage', title: 'Что загадал?',
      caption: 'У трибуны одно окно: слово, тема, подсказка по желанию; «Подкинь идею» — 3 слова под тему',
      run(x) {
        const { stage, hud, frame, icons } = x;
        if (frame.board) { const board = stage.quad(frame.board, BOARD_W, BOARD_H, 'st-board'); paintRiddle(board.ctx, { phase: 'idle', icons }, 0); board.flush(); }
        hud.chat.setCanGame(false);
        const open = () => {
          hud.prompt(null);
          x.sfx.play('open');
          const w = openWindow(x.layer, {
            icon: 'scroll', eyebrow: `«Ракушка» · Загадка ${x.data.num ?? 2} из ${OF}`, title: 'Что загадал?', mode: 'riddle',
            body: `<div class="qz-ask">
              <label class="qz-field"><span class="qz-label">Слово или фраза</span>
                <span class="qz-wordrow"><input class="k-input qz-word" maxlength="40" placeholder="Например: пароход" value="${esc(x.data.word ?? '')}"><button class="k-btn k-btn--ghost k-btn--sm qz-idea" type="button">Подкинь идею</button></span></label>
              <div class="qz-ideas" hidden></div>
              <p class="k-faint qz-note">Видишь только ты — остальные угадывают в чате</p>
              <div class="qz-field"><span class="qz-label">Тема</span><div class="k-seg qz-cats">${CATS.map((c) => `<button type="button" class="${c === (x.data.category ?? 'Предмет') ? 'is-on' : ''}">${c}</button>`).join('')}</div></div>
              <label class="qz-field"><span class="qz-label">Первая подсказка <em>по желанию</em></span>
                <input class="k-input qz-hint" maxlength="40" placeholder="Например: дымит"></label>
              <p class="qz-err k-bad" hidden></p></div>`,
            foot: `<span class="k-note">Разгадают за минуту и дольше — тебе +10 ${coinHtml()}</span><button class="k-btn k-btn--ghost" data-a="cancel" type="button">Отмена</button><button class="k-btn k-btn--go" data-a="go" type="button">Загадать${keyHtml('Enter', 'tr')}</button>`,
          }, () => { x.sfx.play('close'); hud.prompt('E', 'Загадать', 'трибуна'); });
          const word = w.win.querySelector('.qz-word');
          word.focus();
          word.select();
          const cat = () => w.win.querySelector('.qz-cats .is-on')?.textContent ?? 'Предмет';
          const ideas = w.win.querySelector('.qz-ideas');
          // «Подкинь идею»: 3 случайных слова под выбранную тему, клик — подставить
          const idea = () => {
            const pool = [...(IDEAS[cat()] ?? IDEAS['Другое'])].sort(() => Math.random() - 0.5).slice(0, 3);
            ideas.innerHTML = pool.map((p) => `<button class="k-pill k-pill--plate k-pill--sm qz-idea-w" type="button">${esc(p)}</button>`).join('');
            ideas.hidden = false;
            for (const b of ideas.querySelectorAll('button')) b.addEventListener('click', () => { word.value = b.textContent; x.sfx.play('pop'); word.focus(); });
            x.sfx.play('click');
          };
          w.win.querySelector('.qz-idea').addEventListener('click', idea);
          for (const b of w.win.querySelectorAll('.qz-cats button')) b.addEventListener('click', () => { for (const o of w.win.querySelectorAll('.qz-cats button')) o.classList.remove('is-on'); b.classList.add('is-on'); x.sfx.play('click'); if (!ideas.hidden) idea(); });
          const go = () => {
            const v = word.value.trim();
            const err = w.win.querySelector('.qz-err');
            if (v.length < 2) { err.textContent = 'Напиши слово — от 2 до 40 знаков'; err.hidden = false; x.sfx.play('close'); word.focus(); return; }
            x.data.word = v;
            x.data.category = cat();
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
      caption: 'Ты на сцене: [warm] 1 тепло, [miss] 2 мимо, [win] 3 угадал — клавишей или мышью; ошибся — Z, крестик у строки «Тепло» или «Вернуть»',
      run(x) {
        const { hud } = x;
        const word = x.data.word || 'пароход';
        const r = setup(x, { me: x.me, riddler: x.me.nick, word, category: x.data.category ?? 'Предмет', left: 262, edit: true });
        if (x.data.hint) r.hint(x.data.hint);
        riddlerChat(x, word);
        r.setPlate(() => ringPlate(hud, `Ты загадал: <b class="k-gold">${esc(word)}</b>`, r.s, true));
        hud.enableSwap(x);
        hud.emotes(false);
        const ui = riddlerUi(x, r, word);
        // поток: у каждого гостя не чаще раза в 4–6 с, новая догадка заменяет его неотмеченную (Петя: «машина» → «катер»)
        const near = `${word.slice(0, 3)}${word[3] === 'а' ? 'о' : 'а'}${word.slice(4)}`;
        const script = [['Петя', 'машина'], ['Оля', 'это едят?'], ['Петя', 'катер'], ['Соня', 'оно плавает?'], ['Кузя', 'лодка'], ['Мила', 'рыба'],
          ['Гоша', 'оно большое?'], ['Оля', 'корабль'], ['Ника', 'на нём катаются по морю?'], ['Лёва', 'яхта'], ['Соня', near], ['Петя', word]];
        let i = 0;
        const last = new Map();
        x.every(() => {
          if (r.s.phase !== 'round' || i >= script.length) return;
          const [n, t] = script[i];
          if (performance.now() - (last.get(n) ?? -1e9) < 4500) return; // не чаще раза в 4,5 с на игрока
          last.set(n, performance.now());
          r.guess(n, t);
          i++;
        }, 2600);
        r.onSolved = riddlerEnd(x, r, ui);
      },
    },
    {
      id: 'edit', frame: 'riddle-stage', title: 'Правка отметок',
      caption: 'Нажал не то — исправь: крестик у строки в «Тепло» (она вернётся в чат), «Вернуть» у «мимо» или Z; остальные видят, как строка возвращается',
      run(x) {
        const { hud } = x;
        const word = x.data.word || 'пароход';
        const r = setup(x, { me: x.me, riddler: x.me.nick, word, category: x.data.category ?? 'Предмет', left: 214, edit: true, freeze: SHOT });
        // карточка «Тепло» как на снимке владельца: он нажал 1 на всё подряд, и «это едят?» попало в «тепло»
        r.preset([['Оля', 'это едят?'], ['Соня', 'оно плавает?'], ['Кузя', 'лодка'], ['Мила', 'рыба']]);
        riddlerChat(x, word);
        r.setPlate(() => ringPlate(hud, `Ты загадал: <b class="k-gold">${esc(word)}</b>`, r.s, true));
        hud.enableSwap(x);
        hud.emotes(false);
        const ui = riddlerUi(x, r, word);
        r.onSolved = riddlerEnd(x, r, ui);
        // в доке: только что отмеченное «мимо» (на нём «↩ Вернуть») и две новые догадки с кнопками
        const miss = r.guess('Гоша', 'оно большое?');
        x.later(() => r.mark(miss, 'miss'), 200);
        x.later(() => r.guess('Петя', 'катер'), 400);
        x.later(() => r.guess('Ника', 'на нём катаются по морю?'), 700);
        // «под мышью» — первая строка карточки: вживую подсветка пропадает, когда двинешь мышь; на снимке — остаётся с рукой
        const hot = r.warm.items[0];
        x.later(() => {
          hot.classList.add('is-hot');
          if (SHOT) cursorOn(x, hot.querySelector('.qz-warm-x'));
          else document.addEventListener('pointermove', () => hot.classList.remove('is-hot'), { once: true });
        }, 150);
      },
    },
    {
      id: 'check', frame: 'riddle-stage', title: 'Проверяем…',
      caption: '[win] «Угадал» — три секунды дроби «Проверяем…»: загадывающий может отменить (кнопка или Z), у всех золотая рамка у облачка угадавшего',
      run(x) {
        const { hud } = x;
        const word = x.data.word || 'пароход';
        const r = setup(x, { me: x.me, riddler: x.me.nick, word, category: x.data.category ?? 'Предмет', left: 188, edit: true, freeze: SHOT });
        r.hint('дымит');
        r.preset([['Оля', 'оно плавает?'], ['Соня', 'лодка'], ['Мила', 'на нём катаются?']]);
        riddlerChat(x, word);
        r.setPlate(() => ringPlate(hud, `Ты загадал: <b class="k-gold">${esc(word)}</b>`, r.s, true));
        hud.enableSwap(x);
        hud.emotes(false);
        const ui = riddlerUi(x, r, word);
        r.onSolved = riddlerEnd(x, r, ui);
        x.later(() => r.guess('Кузя', 'теплоход'), 150);
        x.later(() => r.guess('Петя', word), 450); // совпало с загаданным: «Угадал» ставится само, через 0,45 с — проверка
      },
    },
    {
      id: 'guess', frame: 'riddle-seat', title: 'Угадываешь со стула',
      caption: 'Пиши в чат (Enter): у каждого одна живая догадка — новая заменяет прежнюю; «тепло» — в углу',
      run(x) {
        const { hud } = x;
        const r = setup(x, { me: x.me, riddler: 'Барон', word: 'пароход', category: 'Предмет', left: 72 });
        r.s.misses.push('самолёт', 'это едят?');
        r.setPlate(() => ringPlate(hud, '<b>Барон</b> загадал', r.s));
        hud.enableSwap(x);
        hud.chat.setCanGame(true);
        const seat = seated(x);
        hud.chat.onSend = (text, scope) => {
          if (scope === 'all') { hud.chat.add({ nick: x.me.nick, text, own: true }); return; }
          const line = r.guess(x.me.nick, text, { own: true });
          if (check(text, 'пароход') === 'yes') return;
          const warm = /корабл|судно|лодк|плав|пар|дым|катер|теплоход|море|вод/i.test(text);
          x.later(() => r.mark(line, warm ? 'warm' : 'miss'), 1300);
        };
        x.key = (e) => { if (e.code === 'Enter') { hud.chat.open(); return true; } return false; };
        // гости угадывают (не чаще раза в 4–6 с каждый), Барон отмечает
        const script = [['Петя', 'машина', 'miss'], ['Оля', 'оно плавает?', 'warm'], ['ОченьДлинныйНик', 'рыба', 'miss'], ['Соня', 'лодка', 'warm'], ['Петя', 'оно большое?', 'warm'], ['Кузя', 'яхта', 'miss'], ['Мила', 'на нём катаются?', 'warm'], ['Петя', 'корабль', 'warm'], ['Соня', 'подводная лодка', 'miss']];
        let i = 0;
        let retract = null;
        x.every(() => {
          if (r.s.phase !== 'round' || i >= script.length) return;
          const [n, t, m] = script[i++];
          const line = r.guess(n, t);
          x.later(() => r.mark(line, m), 1500 + (i % 3) * 400);
          if (i === 4) x.later(() => { r.hint('дымит'); x.sfx.play('warm'); }, 900);
          if (t === 'оно большое?') retract = line;
        }, 2400);
        // у угадывающих кнопок правки нет: когда Барон передумал, строка просто тихо уходит из «Тепло», на табло «тепло» −1
        x.later(() => { if (retract) r.unmark(retract); }, 25000);
        r.onSolved = (line) => {
          seat.remove();
          if (line.own) myTurn(x, r);
        };
      },
    },
    {
      id: 'solved', frame: 'riddle-seat', title: 'Разгадали!',
      caption: '[win] Петя угадал: золото и конфетти, слово во всё табло и «счёт вечера»; кто дальше — на плашке',
      run(x) {
        const { hud } = x;
        const r = setup(x, { me: x.me, riddler: 'Барон', word: 'пароход', category: 'Предмет', left: 118 });
        r.hint('дымит');
        r.s.misses.push('машина', 'рыба', 'яхта', 'самолёт');
        r.preset([['Оля', 'оно плавает?'], [x.me.nick, 'оно большое?'], ['Соня', 'лодка'], ['Оля', 'корабль']]);
        r.setPlate(() => ringPlate(hud, '<b>Барон</b> загадал', r.s));
        hud.enableSwap(x);
        hud.chat.setCanGame(true);
        for (const [n, t, m] of [['ОченьДлинныйНик', 'катер?', 'miss'], ['Мила', 'оно железное?', '']]) hud.chat.add({ id: `p${n}`, nick: n, text: t, game: true, mark: m });
        seated(x);
        x.later(() => r.guess('Кузя', 'теплоход'), 700);
        x.later(() => r.mark(r.lines[0], 'warm'), 1700);
        x.later(() => r.guess('Петя', 'пароход'), 3300);
        r.onSolved = (line) => {
          // жетоны — только по брифу: угадавшему +15, загадавшему +10; за «тепло» жетонов нет
          nextPlate(x, line.nick);
        };
      },
    },
    {
      id: 'myturn', frame: 'riddle-seat', title: 'Ты разгадал — твой ход',
      caption: 'Угадал сам: +15, и ты загадываешь следующим — «Загадываю! F» или «Пропустить»',
      run(x) {
        const { hud } = x;
        const r = setup(x, { me: x.me, riddler: 'Барон', word: 'пароход', category: 'Предмет', left: 96, num: 3 });
        r.hint('дымит'); r.hint('гудит у причала');
        r.s.misses.push('машина', 'рыба', 'яхта');
        r.preset([['Оля', 'оно плавает?'], ['ОченьДлинныйНик', 'большое, шумное и с трубой?'], ['Соня', 'лодка'], ['Оля', 'корабль'], ['Мила', 'на нём катаются?'], ['Петя', 'по морю ходит'], ['Кузя', 'теплоход']]);
        r.setPlate(() => ringPlate(hud, '<b>Барон</b> загадал', r.s));
        hud.enableSwap(x);
        hud.chat.setCanGame(true);
        seated(x);
        hud.chat.open();
        const typed = 'пароход';
        let k = 0;
        x.every(() => { if (k < typed.length) hud.chat.input.value = typed.slice(0, ++k); }, 110);
        x.later(() => { hud.chat.input.value = ''; hud.chat.close(); r.guess(x.me.nick, typed, { own: true }); }, 1500);
        r.onSolved = () => myTurn(x, r);
      },
    },
    {
      id: 'assign', frame: 'riddle-seat', title: 'Никто не вызвался',
      caption: 'За 10 с никто не вызвался — Затейник назначает случайного сидящего; можно «Пропустить»',
      run(x) {
        const { hud } = x;
        const r = setup(x, { me: x.me, riddler: 'Оля', word: 'маяк', category: 'Место', left: 140, num: 3 });
        r.s.phase = 'solved'; r.s.solver = 'Соня'; r.s.evening = evening(x.me.nick, { 'Соня': 1 });
        r.warm.root.remove(); // между загадками карточка «Тепло» не нужна — она на весь раунд
        r.draw();
        seated(x);
        hud.chat.setCanGame(false);
        let n = 4;
        const bar = document.createElement('div');
        bar.className = 'k-plate qz-turn';
        const ask = () => hud.event({ icon: 'scroll', title: 'Кто загадывает?', noSwap: true });
        ask();
        bar.innerHTML = `<button class="k-btn k-btn--go" data-a="go" type="button">Загадываю!${keyHtml('F', 'tr', 'sm')}</button>`;
        hud.slots.bc.appendChild(bar);
        const go = () => { x.sfx.play('click'); x.data.num = 4; x.go('ask'); };
        bar.querySelector('[data-a="go"]').addEventListener('click', go);
        x.key = (e) => { if (e.code === 'KeyF' && bar.isConnected) { go(); return true; } if (e.code === 'Enter') { hud.chat.open(); return true; } return false; };
        let picked = false;
        x.every(() => {
          if (picked) return;
          if (n > 0) n--;
          hud.ring(n / 10, mmss(n), n <= 3);
          if (n > 0) return;
          picked = true;
          // Затейник выбирает случайного сидящего — тебя
          x.sfx.play('whoosh');
          hud.toast({ icon: 'roulette', title: 'Затейник выбрал тебя', sub: 'никто не вызвался за 10 с', life: 3600 });
          let m = 10;
          hud.event({ icon: 'scroll', title: 'Загадываешь ты', lamp: true, noSwap: true });
          bar.innerHTML = `<button class="k-btn k-btn--go" data-a="go" type="button">Загадываю!${keyHtml('F', 'tr', 'sm')}</button><button class="k-btn k-btn--ghost" data-a="skip" type="button">Пропустить</button>`;
          bar.querySelector('[data-a="go"]').addEventListener('click', go);
          bar.querySelector('[data-a="skip"]').addEventListener('click', () => { x.sfx.play('click'); bar.remove(); hud.toast({ icon: 'roulette', title: 'Затейник выбрал Петю', life: 3200 }); nextPlate(x, 'Петя'); });
          x.every(() => { if (m > 0 && bar.isConnected) { m--; hud.ring(m / 10, mmss(m), m <= 3); } }, 1000);
        }, 1000);
      },
    },
    {
      id: 'left', frame: 'riddle-seat', title: 'Загадывающий ушёл',
      caption: 'Барон ушёл посреди загадки: слово открывается, жетонов нет, ход — следующему',
      run(x) {
        const { hud, stage } = x;
        const r = setup(x, { me: x.me, riddler: 'Барон', word: 'пароход', category: 'Предмет', left: 164, num: 4 });
        r.hint('дымит');
        r.s.misses.push('машина', 'рыба');
        r.preset([['Оля', 'оно плавает?'], ['Соня', 'лодка']]);
        r.setPlate(() => ringPlate(hud, '<b>Барон</b> загадал', r.s));
        hud.enableSwap(x);
        hud.chat.setCanGame(true);
        seated(x);
        x.later(() => r.guess('Петя', 'корабль?'), 600);
        x.later(() => {
          // загадывающий вышел из ограды: облачко — хлопком, слово — всем, без жетонов
          if (r.rHead) { stage.puff(r.rHead.x, r.rHead.y + (r.rHead.r ?? 50) * 0.8, 60); x.sfx.play('puff'); }
          r.s.phase = 'left';
          for (const l of r.lines) l.row?.querySelector('.qz-markbtns')?.remove();
          r.draw();
          hud.event({ icon: 'scroll', title: 'Барон ушёл: это был <b class="k-gold">пароход</b>', noSwap: true });
          hud.chat.add({ nick: 'Затейник', text: 'Барон ушёл — загадка не в счёт', sys: true });
        }, 2200);
        x.later(() => nextPlate(x, 'Оля'), 5200);
      },
    },
    {
      id: 'results', frame: 'riddle-seat', title: 'Итоги',
      caption: '5 загадок сыграно: итоги на табло и в окне, через 10 с Затейник снова открывает голосование',
      run(x) {
        const top = [{ nick: 'Петя', pts: 2 }, { nick: 'Оля', pts: 1 }, { nick: x.me.nick, pts: 1, own: true }];
        const ev = evening(x.me.nick, { 'Петя': 2, 'Оля': 1, [x.me.nick]: 1 }).map(([nick, pts]) => ({ nick, pts, own: nick === x.me.nick }));
        seated(x);
        import('./results.js')
          .then((m) => m.results(x, { mode: 'riddle', name: 'Загадка', icon: 'scroll', top, evening: ev, reward: '+25' }))
          .catch(() => {
            x.hud.event({ icon: 'scroll', title: 'Итоги: <b>Петя</b> разгадал больше всех', sub: 'скоро — голосование «Во что играем?»', noSwap: true });
          });
      },
    },
  ],
};

/** Ты разгадал: награда, плашка «Твоя очередь» с кнопками (10 с); роль — мышью или F, Enter — чат */
function myTurn(x, r) {
  const { hud } = x;
  // табло уже кричит «Разгадали!» и твой ник — здесь только жетоны у бейджа и твой ход
  x.later(() => { if (r.bonusOk()) { hud.tokens(x.me.tokens += 15); hud.pop('+15'); x.sfx.play('reward'); } }, 1300);
  let n = 10;
  const plate = () => {
    hud.event({ icon: 'scroll', title: 'Твоя очередь загадывать', lamp: true, noSwap: true });
    const bar = document.createElement('div');
    bar.className = 'k-plate qz-turn';
    bar.innerHTML = `<button class="k-btn k-btn--go" data-a="go" type="button">Загадываю!${keyHtml('F', 'tr', 'sm')}</button><button class="k-btn k-btn--ghost" data-a="skip" type="button">Пропустить</button>`;
    hud.slots.bc.appendChild(bar);
    bar.querySelector('[data-a="go"]').addEventListener('click', () => { x.sfx.play('click'); x.go('ask'); });
    bar.querySelector('[data-a="skip"]').addEventListener('click', () => { x.sfx.play('click'); bar.remove(); nextPlate(x, 'Оля'); });
  };
  x.later(plate, 900);
  x.key = (e) => {
    if (e.code === 'KeyF' && hud.slots.bc.querySelector('.qz-turn')) { x.go('ask'); return true; }
    if (e.code === 'Enter') { hud.chat.open(); return true; }
    return false;
  };
  x.every(() => { if (n > 0) n--; hud.ring(n / 10, mmss(n)); }, 1000);
}

export { qImg };

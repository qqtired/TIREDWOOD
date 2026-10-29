// «Во что играем?» — общий шаг перед любым режимом «Ракушки» (бриф, «Роли и места»).
// Голосуют все внутри ограды: 1–4, мышью по плашке или по табло; передумал — жми другое; 20 с или пока все
// не проголосуют, тогда ещё 3 с. Больше голосов — играем; ничья — побеждает режим, в который дольше не играли
// (колесо — только анимация); 0 голосов — «Никто не выбрал» и снова «Игры нет».
// Потом роли — одной строкой-плашкой: мышью или F (Enter — всегда чат); никто за 10 с — Затейник назначает сам.
import { cardRect, paintVote, BOARD_H, BOARD_W } from './world/board-vote.js';
import { NICK, nickTone } from './world/paint.js';
import { ICON, el, esc, iconImg, keyHtml } from './hud.js';

export const GAMES = [
  { id: 'riddle', name: 'Загадка', icon: 'scroll', min: 2, ago: 5 },
  { id: 'jeopardy', name: 'Своя игра', icon: 'bell', min: 2, ago: 40 },
  { id: 'croc', name: 'Крокодил', icon: 'paint', min: 2, ago: 12 },
  { id: 'whoofus', name: 'Кто из нас?', icon: 'online', min: 4, ago: Infinity },
];
const IMG = {};
for (const g of GAMES) { const i = new Image(); i.src = ICON(g.icon); IMG[g.id] = i; }
const colorOf = (nick, me) => (nick === me.nick ? me.color : NICK[nickTone(nick)]);
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function boardOf(x) { return x.frame.board ? x.stage.quad(x.frame.board, BOARD_W, BOARD_H, 'st-board') : null; }
function painter(x, board, s) {
  let t0 = performance.now();
  const draw = () => { if (board) { paintVote(board.ctx, s, performance.now() - t0); board.flush(); } };
  draw();
  x.every(draw, 250);
  return { draw, reset: () => { t0 = performance.now(); draw(); } };
}
const hostOf = (x) => (x.frame.heads ?? []).find((h) => h.role === 'zatejnik' || h.role === 'host');
const boardTop = (x) => { const q = x.frame.board; return q ? [(q[0][0] + q[1][0]) / 2, (q[0][1] + q[1][1]) / 2 + 30] : [720, 140]; };
const isF = (e) => e.code === 'KeyF';

/** Невидимые кнопки поверх карточек 3D-табло: наведение подсвечивает карточку, клик — голос */
function boardHits(x, board, onHover, onPick) {
  if (!board) return [];
  return GAMES.map((g, i) => {
    const r = cardRect(i);
    const pts = [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]].map(([u, v]) => board.toStage(u, v));
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const L = Math.min(...xs), T = Math.min(...ys), Wd = Math.max(...xs) - L, Ht = Math.max(...ys) - T;
    const b = el('button', 'qz-vhit');
    b.type = 'button';
    b.title = `${i + 1} — ${g.name}`;
    Object.assign(b.style, { left: `${L}px`, top: `${T}px`, width: `${Wd}px`, height: `${Ht}px`, clipPath: `polygon(${pts.map(([px, py]) => `${px - L}px ${py - T}px`).join(',')})` });
    b.addEventListener('mouseenter', () => onHover(i));
    b.addEventListener('mouseleave', () => onHover(null));
    b.addEventListener('click', () => onPick(i));
    x.layer.appendChild(b);
    return b;
  });
}

/**
 * Голосование. cfg: { start: [ники в ограде], joins: [{ nick, at, seat }], bots: [{ nick, at, pick, seat }],
 *   my: { at, pick } (сценарий кадра) | null, left: с какой секунды начать (для кадра «никто не выбрал»),
 *   assign: 'me' | 'other' — кого назначит Затейник, если за 10 с никто не вызвался }
 */
function runVote(x, cfg) {
  const { hud, stage, sfx, me } = x;
  const aud = (x.frame.heads ?? []).filter((h) => h.role === 'audience');
  const meHead = (x.frame.heads ?? []).find((h) => h.role === 'me');
  cfg.bots.forEach((b) => { if (b.seat != null) b.head = aud[b.seat]?.id; });
  for (const j of cfg.joins ?? []) if (j.seat != null) j.head = aud[j.seat]?.id;
  // ники для Alt (над собой — никогда)
  for (const b of [...cfg.bots, ...(cfg.joins ?? [])]) if (b.head) stage.nick(b.head, b.nick);
  const players = new Set([me.nick, ...cfg.start]);
  const votes = new Map();
  const total = 20;
  const s = { phase: 'vote', left: cfg.left ?? total, total, voted: 0, players: players.size, hover: null, noTokens: '', games: GAMES.map((g) => ({ name: g.name, img: IMG[g.id], n: 0, dots: [], off: null })) };
  const board = boardOf(x);
  const b = painter(x, board, s);
  let closing = false;
  hud.emotes(false); // 1–4 — голос, эмоции молчат
  // плашка сверху — одна строка: «Во что играем? · 0:14» и 4 маленькие кнопки (значок и колпачок), мой выбор подсвечен
  const plate = el('div', 'k-plate qz-vline');
  plate.innerHTML = `<b class="qz-vline-t">Во что играем?</b><span class="qz-vline-time">· ${mmss(s.left)}</span><span class="qz-vline-opts"></span>`;
  const opts = plate.querySelector('.qz-vline-opts');
  const chips = GAMES.map((g, i) => {
    const c = el('button', 'qz-vbtn', `${iconImg(g.icon, 'qz-vbtn-ic')}${keyHtml(String(i + 1), 'tl', 'sm')}`);
    c.type = 'button';
    c.addEventListener('mousedown', (e) => e.preventDefault());
    c.addEventListener('click', () => vote(i));
    opts.appendChild(c);
    return c;
  });
  hud.slots.tc.prepend(plate);
  const timeEl = plate.querySelector('.qz-vline-time');
  const hits = boardHits(x, board, (i) => { s.hover = i; b.draw(); }, (i) => vote(i));
  const tip = el('div', 'k-prompt qz-prompt', `<i class="k-mouse k-mouse--l"></i><span>Клик по табло или 1–4</span>`);
  hud.slots.bc.appendChild(tip);

  function update() {
    s.players = players.size;
    s.voted = votes.size;
    s.noTokens = players.size < 3 ? 'Меньше 3 человек — без жетонов' : '';
    s.games.forEach((g, i) => {
      const was = g.off;
      g.off = players.size < GAMES[i].min ? `от ${GAMES[i].min}` : null;
      if (was && !g.off) { chips[i].classList.add('is-unlock'); x.later(() => chips[i].classList.remove('is-unlock'), 1200); sfx.play('pop'); }
      const who = [...votes].filter(([, v]) => v === i).map(([n]) => n);
      g.n = who.length;
      g.dots = who.map((n) => colorOf(n, me));
      const c = chips[i];
      c.classList.toggle('is-mine', votes.get(me.nick) === i);
      c.disabled = !!g.off;
      c.title = g.off ? `${GAMES[i].name}: нужно ${g.off} человек` : `${i + 1} — ${GAMES[i].name}`;
      if (hits[i]) hits[i].disabled = !!g.off;
    });
    b.draw();
    if (!closing && votes.size === players.size && s.phase === 'vote') { closing = true; s.closing = true; s.left = Math.min(s.left, 3); tick(); }
  }
  function tick() {
    // время — только на табло (шапка и полоска); на плашке — «Во что играем?» и 4 кнопки
    if (timeEl) timeEl.textContent = '';
    b.draw();
  }
  function vote(i, nick = me.nick) {
    if (s.phase !== 'vote' || s.games[i].off) {
      if (nick === me.nick && s.phase === 'vote') { chips[i].classList.remove('is-shake'); void chips[i].offsetWidth; chips[i].classList.add('is-shake'); }
      return;
    }
    const again = votes.get(nick) === i;
    votes.set(nick, i);
    if (nick === me.nick) {
      sfx.play(again ? 'click' : 'pop');
      chips[i].classList.remove('is-pick'); void chips[i].offsetWidth; chips[i].classList.add('is-pick');
      if (meHead && (meHead.vis ?? 1) >= 0.5) stage.pin(meHead.id, ICON(GAMES[i].icon), 2000);
    }
    const bot = cfg.bots.find((v) => v.nick === nick);
    if (bot?.head) stage.pin(bot.head, ICON(GAMES[i].icon), 2000);
    update();
  }
  // сценарий: кто садится и кто как голосует
  for (const j of cfg.joins ?? []) x.later(() => { players.add(j.nick); if (j.head) stage.puff(...headTop(x, j.head), 40); update(); }, j.at);
  for (const v of cfg.bots) x.later(() => { players.add(v.nick); vote(v.pick, v.nick); }, v.at);
  if (cfg.my) x.later(() => vote(cfg.my.pick), cfg.my.at);
  x.key = (e) => {
    const n = Number(e.key);
    if (n >= 1 && n <= 4 && s.phase === 'vote') { vote(n - 1); return true; }
    if (isF(e) && x.roleBtn?.isConnected) { x.roleBtn.click(); return true; }
    return false;
  };
  // Затейник открывает голосование
  const host = hostOf(x);
  if (host) stage.say(host.id, 'Голосуем — жмите 1–4!', 'new', 5000, 'Затейник');
  x.every(() => {
    if (s.phase !== 'vote') return;
    s.left = Math.max(0, s.left - 1);
    tick();
    b.draw();
    if (s.left === 0) finish();
  }, 1000);
  update();
  tick();

  const endVote = () => { plate.remove(); tip.remove(); for (const h of hits) h.remove(); s.hover = null; hud.emotes(true); };

  function finish() {
    const live = s.games.map((g) => (g.off ? -1 : g.n));
    const max = Math.max(...live);
    endVote();
    // 0 голосов — «Никто не выбрал», потом снова «Игры нет»
    if (max <= 0) {
      s.phase = 'nobody';
      b.reset();
      sfx.play('miss');
      hud.event({ icon: 'chat', title: 'Никто не выбрал' });
      if (host) stage.say(host.id, 'Ну, как надумаете!', 'new', 3500, 'Затейник');
      x.later(() => x.go('idle'), 4200);
      return;
    }
    const tied = live.map((n, i) => (n === max ? i : -1)).filter((i) => i >= 0);
    if (tied.length === 1) return win(tied[0]);
    // ничья: побеждает режим, в который дольше не играли; колесо — только анимация
    const end = tied.reduce((a, i) => (GAMES[i].ago > GAMES[a].ago ? i : a), tied[0]);
    s.phase = 'spin';
    s.tied = tied;
    hud.event({ icon: 'roulette', title: 'Ничья — колесо' });
    if (host) stage.say(host.id, 'Кручу колесо!', 'new', 3500, 'Затейник');
    const delays = [80, 80, 90, 100, 120, 140, 170, 210, 260, 330, 420];
    let k = tied.indexOf(end) - delays.length;
    while (k < 0) k += tied.length * 10;
    let acc = 0;
    delays.forEach((d, j) => { acc += d; x.later(() => { s.spin = tied[(k + j + 1) % tied.length]; sfx.play('tick'); b.draw(); }, acc); });
    x.later(() => { s.spin = end; b.draw(); }, acc + 10);
    x.later(() => win(end, 'дольше не играли'), acc + 650);
  }

  function win(i, why) {
    if (s.phase === 'vote') endVote();
    s.phase = 'win';
    s.win = i;
    s.winAt = 0;
    const n = s.games[i].n;
    s.sub = why ? `${n} ${plural(n)} · ${why}` : undefined;
    b.reset();
    sfx.play('win');
    const [cx, cy] = boardTop(x);
    stage.confetti(cx, cy, 50, 420);
    const g = GAMES[i];
    hud.event({ icon: g.icon, title: `Играем: <b>${esc(g.name)}</b>`, tone: 'good' });
    if (host) stage.say(host.id, 'Поехали!', 'new', 4000, 'Затейник');
    x.later(() => roles(x, g, cfg.assign ?? 'other', host), 1100);
  }
  return { s, vote };
}
const plural = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'голос' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'голоса' : 'голосов');
const headTop = (x, id) => { const h = (x.frame.heads ?? []).find((k) => k.id === id); return h ? [h.x, h.y] : [720, 600]; };

// Роли по режимам: [вопрос, кнопки [подпись, режим, шаг], глагол для «Затейник выбрал»]; F — первая кнопка
const ROLES = {
  riddle: ['Кто загадывает первым?', [['Загадываю!', 'riddle', 'ask']], 'загадывает'],
  croc: ['Кто рисует первым?', [['Рисую!', 'croc', 'words']], 'рисует'],
  jeopardy: ['Своя игра:', [['Веду я', 'jeopardy', 'pack'], ['Играю', 'jeopardy', 'player']], 'ведёт'],
  whoofus: ['Играют все в ограде', [['Играю', 'whoofus', 'ask']], ''],
};

/** Роли после выбора — одной строкой-плашкой снизу: мышью или F; никто за 10 с — Затейник назначает случайного */
function roles(x, g, assign, host) {
  const R = ROLES[g.id];
  const box = el('div', 'k-plate qz-turn qz-roles', `<span class="qz-roles-t">${esc(R[0])}</span>`);
  const btns = R[1].map(([label, m, st], j) => {
    const btn = el('button', `k-btn ${j === 0 ? 'k-btn--go' : 'k-btn--ghost'}`, `${esc(label)}${j === 0 ? keyHtml('F', 'tr', 'sm') : ''}`);
    btn.type = 'button';
    btn.addEventListener('click', () => { x.sfx.play('click'); x.goMode(m, st); });
    box.appendChild(btn);
    return btn;
  });
  x.roleBtn = btns[0];
  // у «Кто из нас?» ролей нет — без отсчёта
  if (!R[2]) { x.hud.slots.bc.appendChild(box); x.sfx.play('open'); return; }
  let left = 10;
  const tm = el('span', 'qz-roles-time', mmss(left));
  box.appendChild(tm);
  x.hud.slots.bc.appendChild(box);
  x.sfx.play('open');
  const timer = x.every(() => {
    if (!box.isConnected) return;
    left = Math.max(0, left - 1);
    tm.textContent = mmss(left);
    tm.classList.toggle('is-hurry', left <= 3);
    if (left > 0) return;
    clearInterval(timer);
    // никто не вызвался — Затейник назначает случайного сидящего
    box.remove();
    x.roleBtn = null;
    if (assign === 'me') {
      if (host) x.stage.say(host.id, 'Тимофей, давай ты!', 'new', 4000, 'Затейник');
      x.sfx.play('pop');
      const pick = el('div', 'k-plate qz-turn qz-roles qz-assigned', `<span class="qz-roles-t">Затейник выбрал тебя</span>`);
      const go = el('button', 'k-btn k-btn--go', `${esc(R[1][0][0])}${keyHtml('F', 'tr', 'sm')}`);
      const skip = el('button', 'k-btn k-btn--ghost', 'Пропустить');
      go.type = skip.type = 'button';
      go.addEventListener('click', () => { x.sfx.play('click'); x.goMode(R[1][0][1], R[1][0][2]); });
      skip.addEventListener('click', () => {
        x.sfx.play('click');
        pick.remove();
        x.roleBtn = null;
        x.hud.event({ icon: g.icon, title: `Пропустил — ${R[2]} <b>Петя</b>` });
        if (host) x.stage.say(host.id, 'Петя, твой ход!', 'new', 3500, 'Затейник');
      });
      pick.append(go, skip);
      x.roleBtn = go;
      x.hud.slots.bc.appendChild(pick);
    } else {
      if (host) x.stage.say(host.id, 'Петя, твой ход!', 'new', 4000, 'Затейник');
      x.hud.event({ icon: g.icon, title: `Затейник выбрал: ${R[2]} <b>Петя</b>` });
    }
  }, 1000);
}

const SEAT = (x) => x.hud.seat(() => x.sfx.play('pop'), () => x.sfx.play('click'));
const BOTS = [
  { nick: 'Петя', seat: 0 },
  { nick: 'Соня', seat: 1 },
  { nick: 'Оля' },
  { nick: 'Кузя' },
];
const FRAME = { frame: 'vote-seat', fallback: 'whoofus-seat' };

export const VOTE = {
  id: 'vote',
  title: 'Во что играем?',
  steps: [
    {
      id: 'idle', ...FRAME, title: 'Игры нет',
      caption: 'Игры нет: сели двое — Затейник сам открывает голосование; можно и кнопкой «Сыграем?»',
      run(x) {
        const s = { phase: 'idle', games: GAMES.map((g) => ({ name: g.name, img: IMG[g.id] })), seated: 1, hint: 'Сядут двое — Затейник откроет голосование' };
        const b = painter(x, boardOf(x), s);
        SEAT(x);
        x.hud.chat.setCanGame(false);
        const host = hostOf(x);
        const aud = (x.frame.heads ?? []).filter((h) => h.role === 'audience');
        if (aud[0]) x.stage.nick(aud[0].id, 'Петя');
        if (host) x.stage.say(host.id, 'Садитесь — сыграем!', 'new', 0, 'Затейник');
        const box = el('div', 'k-plate qz-turn qz-roles', `<span class="qz-roles-t">Игры нет</span>`);
        const btn = el('button', 'k-btn k-btn--go', 'Сыграем?');
        btn.type = 'button';
        btn.addEventListener('click', () => { x.sfx.play('click'); x.go('vote'); });
        box.appendChild(btn);
        x.hud.slots.bc.appendChild(box);
        // сел второй — Затейник сам открывает голосование
        x.later(() => { s.seated = 2; s.hint = 'Сели двое — голосуем!'; b.draw(); if (host) x.stage.say(host.id, 'Голосуем!', 'new', 0, 'Затейник'); x.sfx.play('pop'); }, 2400);
        x.later(() => x.go('vote'), 4600);
      },
    },
    {
      id: 'vote', ...FRAME, title: 'Голосуем 1–4',
      caption: 'Голосуют все в ограде: 1–4, по плашке или по табло; передумал — жми другое; все проголосовали — ещё 3 с',
      run(x) {
        SEAT(x);
        x.hud.chat.setCanGame(false);
        runVote(x, {
          start: ['Петя'],
          joins: [{ nick: 'Соня', at: 2200, seat: 1 }],
          bots: [
            { ...BOTS[0], at: 1200, pick: 0 },
            { ...BOTS[1], at: 3600, pick: 2 },
            { ...BOTS[2], at: 5200, pick: 0 },
            { ...BOTS[3], at: 6600, pick: 2 },
          ],
          my: null,
          assign: 'me',
        });
      },
    },
    {
      id: 'win', ...FRAME, title: 'Победил режим',
      caption: 'Больше голосов — играем; дальше «Загадываю!» мышью или F; никто за 10 с — Затейник назначает сам',
      run(x) {
        SEAT(x);
        x.hud.chat.setCanGame(false);
        runVote(x, {
          start: ['Петя', 'Соня', 'Оля', 'Кузя'],
          bots: [
            { ...BOTS[0], at: 300, pick: 0 },
            { ...BOTS[1], at: 700, pick: 2 },
            { ...BOTS[2], at: 1100, pick: 0 },
            { ...BOTS[3], at: 1500, pick: 3 },
          ],
          my: { at: 1900, pick: 0 },
          assign: 'other',
        });
      },
    },
    {
      id: 'tie', ...FRAME, title: 'Ничья',
      caption: 'Ничья — побеждает режим, в который дольше не играли (колесо — только анимация)',
      run(x) {
        SEAT(x);
        x.hud.chat.setCanGame(false);
        runVote(x, {
          start: ['Петя', 'Соня', 'Оля', 'Кузя'],
          bots: [
            { ...BOTS[0], at: 300, pick: 1 },
            { ...BOTS[1], at: 700, pick: 2 },
            { ...BOTS[2], at: 1100, pick: 1 },
            { ...BOTS[3], at: 1500, pick: 2 },
          ],
          my: { at: 1900, pick: 0 },
          assign: 'other',
        });
      },
    },
    {
      id: 'assign', ...FRAME, title: 'Никто не вызвался',
      caption: 'За 10 с никто не вызвался — Затейник выбирает случайного сидящего; можно «Пропустить»',
      run(x) {
        SEAT(x);
        x.hud.chat.setCanGame(false);
        runVote(x, {
          start: ['Петя', 'Соня'],
          bots: [
            { ...BOTS[0], at: 300, pick: 2 },
            { ...BOTS[1], at: 600, pick: 2 },
          ],
          my: { at: 900, pick: 2 },
          assign: 'me',
        });
      },
    },
    {
      id: 'nobody', ...FRAME, title: 'Никто не выбрал',
      caption: '20 с прошли, голосов нет — «Никто не выбрал», и снова «Игры нет»',
      run(x) {
        SEAT(x);
        x.hud.chat.setCanGame(false);
        runVote(x, { start: ['Петя', 'Соня'], bots: [], my: null, left: 4 });
      },
    },
  ],
};

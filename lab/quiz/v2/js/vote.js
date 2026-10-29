// «Во что играем?» — общий шаг перед любым режимом «Ракушки» (бриф, «Роли и места»).
// Голосуют все внутри ограды: 1–4 или мышью, передумал — жми другое; 20 с или пока все не проголосуют, тогда ещё 3 с.
// Больше голосов — играем; ничья — Затейник крутит колесо между равными. Затем роли — одной строкой-плашкой.
import { paintVote, BOARD_H, BOARD_W } from './world/board-vote.js';
import { NICK, nickTone } from './world/paint.js';
import { ICON, el, esc, iconImg, keyHtml } from './hud.js';

const GAMES = [
  { id: 'riddle', name: 'Загадка', icon: 'scroll', min: 2 },
  { id: 'jeopardy', name: 'Своя игра', icon: 'bell', min: 2 },
  { id: 'croc', name: 'Крокодил', icon: 'paint', min: 2 },
  { id: 'whoofus', name: 'Кто из нас?', icon: 'online', min: 3 },
];
const IMG = {};
for (const g of GAMES) { const i = new Image(); i.src = ICON(g.icon); IMG[g.id] = i; }
const colorOf = (nick, me) => (nick === me.nick ? me.color : NICK[nickTone(nick)]);

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

/**
 * Голосование. cfg: { start: [ники в ограде], joins: [{ nick, at }], bots: [{ nick, at, pick, head? }],
 *   my: { at, pick } (сценарий кадра) | null, tieWinner: индекс | null }
 */
function runVote(x, cfg) {
  const { hud, stage, sfx, me } = x;
  const aud = (x.frame.heads ?? []).filter((h) => h.role === 'audience');
  cfg.bots.forEach((b, j) => { if (b.seat != null) b.head = aud[b.seat]?.id; });
  for (const j of cfg.joins ?? []) if (j.seat != null) j.head = aud[j.seat]?.id;
  const players = new Set([me.nick, ...cfg.start]);
  const votes = new Map();
  const s = { phase: 'vote', left: 20, total: 20, voted: 0, players: players.size, games: GAMES.map((g) => ({ name: g.name, img: IMG[g.id], n: 0, dots: [], off: null })) };
  const b = painter(x, boardOf(x), s);
  let closing = false;
  // плашка сверху: 4 варианта (колпачки 1–4, счёт, моя галочка) и кольцо времени
  const plate = el('div', 'k-plate qz-vote');
  plate.innerHTML = `<div class="qz-vote-head"><b>Во что играем?</b><span class="qz-vote-sub"></span><span class="k-ring k-ring--sm qz-ring" style="--p:1"><b>0:20</b></span></div><div class="qz-vote-opts"></div>`;
  const opts = plate.querySelector('.qz-vote-opts');
  const chips = GAMES.map((g, i) => {
    const c = el('button', 'qz-vopt', `${keyHtml(String(i + 1), 'tl', 'sm')}${iconImg(g.icon, 'qz-vopt-ic')}<span class="qz-vopt-name">${esc(g.name)}</span><b class="qz-vopt-n">0</b><i class="qz-vopt-check" aria-hidden="true"></i>`);
    c.type = 'button';
    c.addEventListener('click', () => vote(i));
    opts.appendChild(c);
    return c;
  });
  hud.slots.tc.prepend(plate);
  const sub = plate.querySelector('.qz-vote-sub');
  const ring = plate.querySelector('.qz-ring');

  function update() {
    s.players = players.size;
    s.voted = votes.size;
    s.games.forEach((g, i) => {
      const was = g.off;
      g.off = players.size < GAMES[i].min ? `от ${GAMES[i].min} игроков` : null;
      if (was && !g.off) { chips[i].classList.add('is-unlock'); x.later(() => chips[i].classList.remove('is-unlock'), 1200); sfx.play('pop'); }
      const who = [...votes].filter(([, v]) => v === i).map(([n]) => n);
      g.n = who.length;
      g.dots = who.map((n) => colorOf(n, me));
      const c = chips[i];
      c.classList.toggle('is-off', !!g.off);
      c.classList.toggle('is-mine', votes.get(me.nick) === i);
      c.disabled = !!g.off;
      c.title = g.off ? `${GAMES[i].name}: ${g.off}` : `${i + 1} — ${GAMES[i].name}`;
      c.querySelector('.qz-vopt-n').textContent = g.off ? g.off.replace(' игроков', '') : String(g.n);
    });
    sub.textContent = closing ? 'все проголосовали' : `голосов ${votes.size} из ${players.size}`;
    b.draw();
    if (!closing && votes.size === players.size && s.phase === 'vote') {
      closing = true;
      s.left = Math.min(s.left, 3);
      sub.textContent = 'все проголосовали';
      tickRing();
    }
  }
  function tickRing() {
    ring.style.setProperty('--p', s.left / s.total);
    ring.querySelector('b').textContent = `0:${String(s.left).padStart(2, '0')}`;
    ring.classList.toggle('is-hurry', s.left <= 5);
  }
  function vote(i, nick = me.nick) {
    if (s.phase !== 'vote' || s.games[i].off) { if (nick === me.nick) { chips[i].classList.remove('is-shake'); void chips[i].offsetWidth; chips[i].classList.add('is-shake'); } return; }
    const again = votes.get(nick) === i;
    votes.set(nick, i);
    if (nick === me.nick) { sfx.play(again ? 'click' : 'pop'); chips[i].classList.remove('is-pick'); void chips[i].offsetWidth; chips[i].classList.add('is-pick'); }
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
    if (e.key === 'Enter' && x.roleBtn) { x.roleBtn.click(); return true; }
    return false;
  };
  // Затейник открывает голосование
  const host = hostOf(x);
  if (host) stage.say(host.id, 'Голосуем — жмите 1–4!', 'new', 5000, 'Затейник');
  x.every(() => {
    if (s.phase !== 'vote') return;
    s.left = Math.max(0, s.left - 1);
    tickRing();
    b.draw();
    if (s.left === 0) finish();
  }, 1000);
  update();

  function finish() {
    const live = s.games.map((g, i) => (g.off ? -1 : g.n));
    const max = Math.max(...live);
    let tied = live.map((n, i) => (n === max && n >= 0 ? i : -1)).filter((i) => i >= 0);
    if (tied.length === 1) return win(tied[0]);
    // ничья: колесо между равными
    s.phase = 'spin';
    s.tied = tied;
    plate.remove();
    hud.event({ icon: 'roulette', title: 'Ничья — колесо' });
    if (host) stage.say(host.id, 'Кручу колесо!', 'new', 3500, 'Затейник');
    const end = cfg.tieWinner != null && tied.includes(cfg.tieWinner) ? cfg.tieWinner : tied[Math.floor(Math.random() * tied.length)];
    const delays = [80, 80, 90, 100, 120, 140, 170, 210, 260, 330, 420];
    let k = tied.indexOf(end) - delays.length;
    while (k < 0) k += tied.length * 10;
    let acc = 0;
    delays.forEach((d, j) => { acc += d; x.later(() => { s.spin = tied[(k + j + 1) % tied.length]; sfx.play('tick'); b.draw(); }, acc); });
    x.later(() => { s.spin = end; b.draw(); }, acc + 10);
    x.later(() => win(end), acc + 650);
  }

  function win(i) {
    s.phase = 'win';
    s.win = i;
    s.winAt = 0;
    s.sub = s.games[i].n ? undefined : 'выбрал Затейник';
    b.reset();
    plate.remove();
    sfx.play('win');
    const [cx, cy] = boardTop(x);
    stage.confetti(cx, cy, 50, 420);
    const g = GAMES[i];
    hud.event({ icon: g.icon, title: `Играем: <b>${esc(g.name)}</b>`, tone: 'good' });
    if (host) stage.say(host.id, 'Поехали!', 'new', 4000, 'Затейник');
    x.later(() => roles(x, g), 1100);
  }
  return { s, vote };
}

const headTop = (x, id) => { const h = (x.frame.heads ?? []).find((k) => k.id === id); return h ? [h.x, h.y] : [720, 600]; };

/** Роли после выбора — одной строкой-плашкой снизу; клик ведёт в кадры режима */
function roles(x, g) {
  const R = {
    riddle: ['Кто загадывает первым?', [['Загадываю!', 'Enter', 'riddle', 'ask']]],
    croc: ['Кто рисует первым?', [['Рисую!', 'Enter', 'croc', 'draw']]],
    jeopardy: ['Своя игра:', [['Веду я', 'Enter', 'jeopardy', 'host'], ['Играю', null, 'jeopardy', 'player']]],
    whoofus: ['Играют все в ограде', [['Играю', 'Enter', 'whoofus', 'vote']]],
  }[g.id];
  const box = el('div', 'k-plate qz-turn qz-roles', `<span class="qz-roles-t">${esc(R[0])}</span>`);
  R[1].forEach(([label, key, m, st], j) => {
    const btn = el('button', `k-btn ${j === 0 ? 'k-btn--go' : 'k-btn--ghost'}`, `${esc(label)}${key ? keyHtml(key, 'tr', 'sm') : ''}`);
    btn.type = 'button';
    btn.addEventListener('click', () => { x.sfx.play('click'); x.goMode(m, st); });
    if (j === 0) x.roleBtn = btn;
    box.appendChild(btn);
  });
  x.hud.slots.bc.appendChild(box);
  x.sfx.play('open');
}

const SEAT = (x, emotes = true) => { const box = x.hud.seat(() => x.sfx.play('pop'), () => x.sfx.play('click')); if (!emotes) box.querySelector('.qz-emotes')?.remove(); return box; };
const BOTS = [
  { nick: 'Петя', seat: 0 },
  { nick: 'Соня', seat: 1 },
  { nick: 'Оля' },
  { nick: 'Кузя' },
];

export const VOTE = {
  id: 'vote',
  title: 'Во что играем?',
  steps: [
    {
      id: 'idle', frame: 'vote-seat', fallback: 'whoofus-seat', title: 'Игры нет',
      caption: 'Игры нет: сядут двое — Затейник сам откроет голосование; сидящий может открыть его кнопкой «Сыграем?»',
      run(x) {
        const s = { phase: 'idle', games: GAMES.map((g) => ({ name: g.name, img: IMG[g.id] })), seated: 1, hint: 'Сядут двое — Затейник откроет голосование' };
        const b = painter(x, boardOf(x), s);
        SEAT(x);
        x.hud.chat.setCanGame(false);
        const host = hostOf(x);
        if (host) x.stage.say(host.id, 'Садитесь — сыграем!', 'new', 0, 'Затейник');
        const box = el('div', 'k-plate qz-turn qz-roles', `<span class="qz-roles-t">Игры нет</span>`);
        const btn = el('button', 'k-btn k-btn--go', 'Сыграем?');
        btn.type = 'button';
        btn.addEventListener('click', () => { x.sfx.play('click'); x.go('vote'); });
        box.appendChild(btn);
        x.hud.slots.bc.appendChild(box);
        x.later(() => { s.seated = 2; b.draw(); const a = (x.frame.heads ?? []).find((h) => h.role === 'audience'); if (a) x.stage.pin(a.id, ICON('emote'), 1600); }, 2600);
      },
    },
    {
      id: 'vote', frame: 'vote-seat', fallback: 'whoofus-seat', title: 'Голосуем 1–4',
      caption: 'Голосуют все в ограде: 1–4 или мышью, передумал — жми другое; все проголосовали — ещё 3 с',
      run(x) {
        SEAT(x, false);
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
        });
      },
    },
    {
      id: 'win', frame: 'vote-seat', fallback: 'whoofus-seat', title: 'Победил режим',
      caption: 'Больше голосов — играем: победитель крупно на табло, остальные гаснут; дальше — кто загадывает',
      run(x) {
        SEAT(x, false);
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
        });
      },
    },
    {
      id: 'tie', frame: 'vote-seat', fallback: 'whoofus-seat', title: 'Ничья — колесо',
      caption: 'Ничья — Затейник крутит колесо между равными; для «Своей игры» — «Веду я» или «Играю»',
      run(x) {
        SEAT(x, false);
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
          tieWinner: 1,
        });
      },
    },
  ],
};

// «Кто из нас?» — живой макет на ките UI 2.0 (раздел #whoofus страницы-обзора «Ракушка»).
// Ход: окно «Свои вопросы» → раунды (вопрос сверху, шесть карточек, тайный голос 15 с) → раскрытие (фишки слетаются к
// карточкам, лидер получает титул и свет прожектора, угадавшим мнение большинства — очко) → итоги в виде ModeResults.
// Разметка — классы кита (.k-plate, .mo-stand, .k-toast, .k-window, .mo-results…), свои классы — с префиксом wo-.
// Боты и таймеры стоят, пока раздел не виден; звук — после первого действия смотрящего. Кто за кого — не показываем.
import {
  makeStage, segButtons, h, esc, keyHtml, iconImg, coinHtml, coinText, meterHtml, setMeter, placeHtml,
  PLAYERS, jellySvg, sfx, rnd, pick,
} from './common.js';

const ME = PLAYERS[0];
const NICKS = ['Барон', 'Санёк', 'Мурка', 'Дед Мороз', 'ОченьДлинныйНик'];
const CAST = [ME, ...NICKS.map((n) => PLAYERS.find((p) => p.nick === n))]; // шесть участников; свой — первый
const VOTE_MS = 15000; // тайный голос — 15 с
const HOLD_MS = 4200; // сколько держим раскрытие до следующего раунда
const MAX_OWN = 2; // своих вопросов — не больше двух
const DEFAULT_TITLE = 'Выбор друзей';

// вопросы пака: больше половины — про жизнь на набережной (рыбалка, автоматы, крепость, «Подземелье», ферма, жетоны)
const PACK = [
  { q: 'Кто из нас первым уснёт на рыбалке?', t: 'Соня набережной' },
  { q: 'Кто скорее всего спустит все жетоны на автоматах?', t: 'Король автоматов' },
  { q: 'Кто первым побежит защищать крепость?', t: 'Хранитель крепости' },
  { q: 'Кто вытащит самую большую рыбу?', t: 'Рыбак года' },
  { q: 'Кто заблудится в «Подземелье» даже с картой?', t: 'Вечный турист' },
  { q: 'Кто первым забудет полить грядки на ферме?', t: 'Забывчивый фермер' },
  { q: 'Кто громче всех смеётся в голосовом?', t: 'Душа компании' },
  { q: 'Кто всегда опаздывает на встречу у маяка?', t: 'Король опозданий' },
  { q: 'Кто унесёт со стола последний бутерброд?', t: 'Король бутербродов' },
  { q: 'Кто первым поднимет паруса на регате?', t: 'Морской волк' },
];
// «боты тоже добавили по вопросу»
const BOT_QS = [
  { q: 'Кто из нас лучше всех поёт в голосовом?', t: 'Соловей набережной', by: 1 },
  { q: 'Кто первым прибежит на шторм к маяку?', t: 'Скороход маяка', by: 2 },
];

const fmt = new Intl.NumberFormat('ru-RU');
const put = (e, t) => { if (e && e.textContent !== t) e.textContent = t; };
const shuffle = (a) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
const jelly = (color, size, o = {}) => jellySvg(color, size, o).replaceAll(`g${color.slice(1)}`, `wog${color.slice(1)}`);
const names = (a) => (a.length > 1 ? `${a.slice(0, -1).join(', ')} и ${a[a.length - 1]}` : a[0] ?? '');
const clock = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const plural = (n, a, b, c) => (n % 10 === 1 && n % 100 !== 11 ? a : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? b : c));
/** «вопрос = титул» → { q, t } (вопрос получает «?», пустой титул — «Выбор друзей») */
function parseOwn(raw) {
  const [a, ...rest] = String(raw).split('=');
  let q = a.trim();
  if (!q) return null;
  if (!/[?!.]$/.test(q)) q += '?';
  const t = rest.join('=').trim();
  return { q, t: t || DEFAULT_TITLE, custom: !!t };
}

export function mount(el) {
  const stage = makeStage(el, { title: 'Живой макет', note: '…', bg: 'img/venue-shell.jpg' });
  stage.bg.style.setProperty('--qz-shade', 'linear-gradient(180deg, color-mix(in srgb, var(--w-surf-solid) 14%, transparent), color-mix(in srgb, var(--w-surf-solid) 38%, transparent))');
  const { scale, hud } = stage;
  const capT = stage.root.querySelector('.qz-cap-t');
  const capN = stage.root.querySelector('.qz-cap-n');

  let GEN = 0;
  let S = null;
  let rounds = 4;
  let visible = false;
  let armed = false;
  const play = (n) => { if (armed) sfx.play(n); };
  const later = (ms, fn) => { const g = S.gen; return setTimeout(() => { if (g === S.gen) fn(); }, ms); };
  const slot = (pos) => h('div', `k-slot k-slot--${pos}`);

  let tl, tc, tr, bl, bc, row, flyLayer, conf, toasts, scrim, ask, stand, askQ, askEye, askFoot, askMeter, askTime, badgeEl, badgeTok, chatList;

  function fresh() {
    return {
      gen: ++GEN, phase: 'ask', rounds, round: 0, q: null, qs: [], own: [],
      pts: CAST.map(() => 0), titles: CAST.map(() => []), myVote: -1, bots: [], t: 0, early: false, tickSec: -1,
      counts: null, tokens: 1250, leaders: [],
    };
  }

  // ---------------------------------------------------------------- общий экран: бейдж, чат
  function build() {
    hud.replaceChildren();
    row = h('div', 'wo-row');
    flyLayer = h('div', 'wo-fly-layer');
    conf = h('div', 'wo-conf');
    tl = slot('tl'); tc = slot('tc'); tr = slot('tr'); bl = slot('bl'); bc = slot('bc');
    hud.append(row, tl, tc, tr, bl, bc, flyLayer, conf);
    toasts = h('div', 'k-toasts');
    tc.append(toasts);
    badgeEl = h('div', 'k-badge');
    badgeEl.innerHTML = `<span class="k-badge-avatar" role="img" aria-label="Твой образ">${jelly(ME.color, 36, { hat: ME.hat })}</span>
      <span class="k-ring" style="--p:.64"><b>12</b></span>
      <span class="k-badge-tokens">${coinHtml()}<span>${fmt.format(S.tokens)}</span></span>`;
    badgeTok = badgeEl.querySelector('.k-badge-tokens');
    tr.append(badgeEl);
    // чат: голос и строка «Всем:» (в игре общий чат работает как всегда)
    const dock = h('div', 'k-chat wo-chat');
    chatList = h('div', 'k-chat-list');
    const bar = h('div', 'k-chat-bar');
    bar.innerHTML = `<button class="k-voice" type="button" aria-label="Голос">${iconImg('voice', '')}${keyHtml('V', '', 'sm')}</button>
      <label class="k-chat-input is-typing"><span>Всем:</span><input type="text" maxlength="60" autocomplete="off" spellcheck="false" placeholder="Сообщение" aria-label="Сообщение"> ${keyHtml('Enter')}</label>`;
    dock.append(chatList, bar);
    const inp = bar.querySelector('input');
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && inp.value.trim()) {
        e.preventDefault();
        armed = true;
        chatList.append(h('div', 'k-chat-line is-own', `<b class="k-nick-1">${esc(ME.nick)}</b>${esc(inp.value.trim())}`));
        while (chatList.children.length > 3) chatList.firstElementChild.remove();
        inp.value = '';
        play('pop');
      } else if (e.key === 'Escape') inp.blur();
    });
    bl.append(dock);
  }

  function toast(o) {
    const t = h('div', `k-toast k-toast--${o.tone ?? 'info'} is-new`);
    t.innerHTML = `<span class="k-toast-ic"><img src="img/icons/${o.icon}.webp" alt=""></span><div class="k-toast-title">${coinText(o.title)}</div>${o.sub ? `<div class="k-toast-sub">${esc(o.sub)}</div>` : ''}`;
    toasts.prepend(t);
    while (toasts.children.length > 3) toasts.lastElementChild.remove();
    setTimeout(() => { t.classList.remove('is-new'); t.classList.add('is-out'); setTimeout(() => t.remove(), 320); }, o.life ?? 3800);
  }
  function confetti() {
    conf.replaceChildren();
    const cols = ['var(--gold)', 'var(--bad-hi)', 'var(--good)', 'var(--info)', 'var(--special)', 'var(--w-surf-text)'];
    for (let i = 0; i < 56; i++) {
      const p = h('i');
      p.style.cssText = `--x:${rnd(2, 98).toFixed(1)}%;--dx:${rnd(-90, 90).toFixed(0)}px;--d:${rnd(0, 0.9).toFixed(2)}s;--t:${rnd(1.8, 3.1).toFixed(2)}s;--r:${rnd(0, 180).toFixed(0)}deg;--c:${pick(cols)};--w:${rnd(7, 13).toFixed(0)}px`;
      conf.append(p);
    }
    setTimeout(() => conf.replaceChildren(), 4200);
  }

  // ---------------------------------------------------------------- перед стартом: окно «Свои вопросы»
  function openAsk() {
    scrim?.remove();
    S.phase = 'ask';
    build();
    scrim = h('div', 'k-scrim wo-scrim');
    scrim.innerHTML = `<section class="k-window k-window--sm is-in" role="dialog" aria-label="Свои вопросы">
      <header class="k-win-head">
        <span class="k-win-portrait"><img src="img/icons/online.webp" alt=""></span>
        <div class="k-win-titles"><p class="k-eyebrow">Кто из нас?</p><h2 class="k-win-title">Свои вопросы</h2></div>
        <div class="k-win-tools"><button class="k-close" type="button" aria-label="Закрыть"><kbd class="k-key k-key--sm">Esc</kbd></button></div>
      </header>
      <div class="k-win-body">
        <div class="wo-field">
          <label class="wo-lab" for="wo-q"><span>Свой вопрос</span><span class="k-faint" data-cnt></span></label>
          <div class="wo-add"><input class="k-input" id="wo-q" type="text" maxlength="90" autocomplete="off" spellcheck="false" placeholder="Кто чаще всех теряет удочку? = Потеряшка"><button class="k-btn k-btn--sm wo-add-btn" type="button">Добавить</button></div>
          <p class="wo-parse" data-parse></p>
        </div>
        <div class="wo-list" data-list></div>
      </div>
      <footer class="k-win-foot"><span class="k-note">В игре на это 30 секунд</span><button class="k-btn k-btn--go wo-go" type="button">Начать</button></footer>
    </section>`;
    scale.append(scrim);
    const q = (s) => scrim.querySelector(s);
    const inp = q('#wo-q');
    const add = q('.wo-add-btn');
    const parse = q('[data-parse]');
    const check = () => {
      const full = S.own.length >= MAX_OWN;
      const p = parseOwn(inp.value);
      const hasEq = inp.value.includes('=');
      inp.disabled = full;
      inp.placeholder = full ? 'Уже два вопроса — больше нельзя' : 'Кто чаще всех теряет удочку? = Потеряшка';
      add.disabled = full || !p || p.q.length < 8;
      q('[data-cnt]').textContent = `${S.own.length} из ${MAX_OWN}`;
      parse.classList.toggle('is-ok', !!p && hasEq);
      parse.innerHTML = full ? 'Свои вопросы добавлены — они смешаются с остальными'
        : (p && hasEq ? `Титул: <b>${esc(p.t)}</b>` : 'Титул — после «=»: его лидер получит табличкой над ником');
    };
    const list = () => {
      const rows = [...BOT_QS.map((b) => ({ ...b, who: CAST[b.by] })), ...S.own.map((o, i) => ({ ...o, who: ME, mine: i }))];
      q('[data-list]').innerHTML = rows.map((r) => `<div class="k-cell wo-qrow${r.who === ME ? ' is-own' : ''}">
        <span class="wo-qav">${jelly(r.who.color, 32, { hat: r.who.hat })}</span>
        <div class="wo-qbody"><div class="wo-qhead"><b>${esc(r.who === ME ? `${r.who.nick} · ты` : r.who.nick)}</b><span class="k-pill k-pill--solid k-pill--sm wo-t">${esc(r.t)}</span></div><p>${esc(r.q)}</p></div>
        ${r.who === ME ? `<button class="k-btn k-btn--ghost k-btn--icon k-btn--sm wo-del" type="button" data-del="${r.mine}" aria-label="Убрать вопрос">✕</button>` : ''}</div>`).join('');
    };
    const doAdd = () => {
      const p = parseOwn(inp.value);
      if (!p || p.q.length < 8 || S.own.length >= MAX_OWN) return;
      S.own.push(p);
      inp.value = '';
      play('reward');
      list();
      check();
    };
    inp.addEventListener('input', check);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); armed = true; doAdd(); } });
    add.addEventListener('click', () => { armed = true; doAdd(); });
    scrim.addEventListener('click', (e) => {
      if (e.target === scrim) { armed = true; closeAsk(); return; }
      const d = e.target.closest('[data-del]');
      if (d) { armed = true; S.own.splice(Number(d.dataset.del), 1); play('close'); list(); check(); }
    });
    q('.k-close').addEventListener('click', () => { armed = true; closeAsk(); });
    q('.wo-go').addEventListener('click', () => { armed = true; startGame(); });
    list();
    check();
    play('open');
  }

  function closeAsk() {
    play('close');
    scrim?.remove();
    scrim = null;
    S.phase = 'idle';
    bc.replaceChildren();
    const p = h('div', 'k-prompt', `${keyHtml('E')}Играть<span class="k-prompt-sep"></span><span class="k-prompt-note">Кто из нас? · Ракушка</span>`);
    p.style.pointerEvents = 'auto';
    p.style.cursor = 'pointer';
    p.addEventListener('click', () => { armed = true; openAsk(); });
    bc.append(p);
  }

  // ---------------------------------------------------------------- игра
  function startGame() {
    scrim?.remove();
    scrim = null;
    // свои вопросы — вперёд, дальше вопросы друзей и пака вперемешку
    const own = [...shuffle(S.own).map((o) => ({ ...o, by: 0 })), ...shuffle(BOT_QS)];
    const pack = shuffle(PACK);
    const qs = [];
    while (qs.length < S.rounds) {
      if (own.length && (qs.length % 2 === 0 || !pack.length)) qs.push(own.shift());
      else if (pack.length) qs.push(pack.shift());
      else break;
    }
    S.qs = qs;
    S.round = 0;
    S.pts = CAST.map(() => 0);
    S.titles = CAST.map(() => []);
    nextRound();
  }

  function nextRound() {
    if (S.round >= S.qs.length) { showResults(); return; }
    S.round += 1;
    S.q = S.qs[S.round - 1];
    S.phase = 'vote';
    S.myVote = -1;
    S.t = 0;
    S.early = false;
    S.tickSec = -1;
    S.counts = null;
    S.leaders = [];
    // у каждого бота — любимчик раунда (кроме себя): голоса не равномерные, как у людей
    const fav = Math.floor(Math.random() * CAST.length);
    S.bots = CAST.map((_, i) => i).slice(1).map((i) => {
      const pool = [];
      CAST.forEach((_, j) => { if (j !== i) for (let k = 0; k < (j === fav ? 4 : 1); k++) pool.push(j); });
      return { i, target: pick(pool), at: rnd(1300, 11000), cast: false };
    });
    buildRound();
    play('open');
  }

  function buildRound() {
    // слева сверху: раунд и «в теме»
    tl.replaceChildren();
    stand = h('div', 'k-plate mo-stand wo-stand', `<div class="mo-stand-main"><span class="mo-place"><span data-r>${S.round}</span><small>/${S.rounds}</small></span>
      <div class="mo-stand-side"><span class="mo-lap">Раунд</span><span class="mo-time">в теме <b data-p>${S.pts[0]}</b></span></div></div>`);
    tl.append(stand);
    // сверху по центру: вопрос крупно, сколько проголосовало, полоса времени
    tc.replaceChildren(toasts);
    const by = S.q.by !== undefined ? CAST[S.q.by] : null;
    ask = h('div', 'k-plate wo-ask');
    ask.innerHTML = `<p class="k-eyebrow" data-eye>${by ? (S.q.by === 0 ? 'Твой вопрос' : `Вопрос · ${esc(by.nick)}`) : 'Кто из нас?'}</p>
      <p class="wo-q">${esc(S.q.q)}</p>
      <div class="wo-ask-foot"><span data-foot>Проголосовали 0 из 6</span><span class="wo-time" data-time>0:15</span></div>
      ${meterHtml(1, 'mode', 'k-meter--thin')}`;
    tc.insertBefore(ask, toasts);
    askEye = ask.querySelector('[data-eye]');
    askFoot = ask.querySelector('[data-foot]');
    askTime = ask.querySelector('[data-time]');
    askMeter = ask.querySelector('.k-meter');
    // шесть карточек
    row.replaceChildren();
    CAST.forEach((p, i) => {
      const col = h('div', 'wo-col');
      col.dataset.i = String(i);
      col.style.setProperty('--i', String(i));
      col.innerHTML = `<i class="wo-beam"></i><div class="wo-tally"></div>
        <button type="button" class="k-plate wo-card${i === 0 ? ' is-me' : ''}" data-i="${i}" aria-label="Голос за: ${esc(p.nick)}">
          <b class="k-pill k-pill--solid wo-n" hidden>0</b>
          <span class="wo-jelly">${jelly(p.color, 104, { hat: p.hat })}</span>
          <span class="wo-plaques">${plaques(i)}</span>
          <span class="wo-nick">${esc(p.nick)}</span>
          <span class="wo-note">${i === 0 ? '<span class="k-pill k-pill--gold k-pill--xs">это ты</span>' : ''}</span>
        </button>`;
      row.append(col);
    });
    row.onclick = (e) => {
      const c = e.target.closest('.wo-card');
      if (c) vote(Number(c.dataset.i));
    };
    refreshVoted();
  }

  /** Титулы участника: последняя табличка и «+N», если их больше */
  function plaques(i) {
    const ts = S.titles[i];
    if (!ts.length) return '';
    return `<span class="k-pill k-pill--solid wo-title">${esc(ts[ts.length - 1])}</span>${ts.length > 1 ? `<span class="k-pill k-pill--xs wo-more">ещё ${ts.length - 1}</span>` : ''}`;
  }

  const colOf = (i) => row.querySelector(`.wo-col[data-i="${i}"]`);

  function vote(i) {
    if (S.phase !== 'vote') return;
    armed = true;
    if (i === 0) {
      const n = colOf(0).querySelector('.wo-note');
      n.innerHTML = '<span class="wo-no">за себя нельзя</span>';
      colOf(0).classList.remove('is-shake');
      void colOf(0).offsetWidth;
      colOf(0).classList.add('is-shake');
      play('cold');
      later(1400, () => { if (S.phase === 'vote') n.innerHTML = '<span class="k-pill k-pill--gold k-pill--xs">это ты</span>'; });
      return;
    }
    if (S.myVote === i) return;
    S.myVote = i;
    row.querySelectorAll('.wo-card').forEach((c) => {
      const on = Number(c.dataset.i) === i;
      c.classList.toggle('is-mine', on);
      if (Number(c.dataset.i) !== 0) c.querySelector('.wo-note').innerHTML = on ? '<span class="wo-mine">твой голос</span>' : '';
    });
    play('click');
    refreshVoted();
  }

  function refreshVoted() {
    if (!askFoot || S.phase !== 'vote') return;
    const n = S.bots.filter((b) => b.cast).length + (S.myVote >= 0 ? 1 : 0);
    put(askFoot, `Проголосовали ${n} из ${CAST.length}`);
  }

  // ---------------------------------------------------------------- раскрытие
  function reveal() {
    S.phase = 'reveal';
    askMeter.hidden = true;
    put(askTime, '');
    put(askEye, 'Считаем голоса');
    put(askFoot, 'Кто за кого — не показываем');
    row.querySelectorAll('.wo-card').forEach((c) => { c.classList.remove('is-mine'); c.classList.add('is-locked'); });
    const targets = S.bots.map((b) => b.target);
    if (S.myVote >= 0) targets.push(S.myVote);
    const order = shuffle(targets); // порядок фишек не выдаёт, кто за кого
    S.counts = CAST.map(() => 0);
    targets.forEach((t) => { S.counts[t] += 1; });
    order.forEach((t, k) => later(350 + k * 300, () => dropChip(t)));
    later(350 + order.length * 300 + 900, finishReveal);
    if (S.myVote < 0) toast({ icon: 'stopwatch', title: 'Ты не успел проголосовать', life: 3000 });
  }

  /** Фишка падает с плашки вопроса на карточку; карточка встаёт выше с каждым голосом */
  function dropChip(t) {
    const col = colOf(t);
    if (!col) return;
    const k = stage.frame.getBoundingClientRect().width / 1440 || 1;
    const fr = stage.frame.getBoundingClientRect();
    const ar = ask.getBoundingClientRect();
    const tr0 = col.querySelector('.wo-card').getBoundingClientRect();
    const x0 = (ar.left + ar.width / 2 - fr.left) / k - 11;
    const y0 = (ar.bottom - fr.top) / k - 14;
    const chip = h('i', 'wo-chip');
    chip.style.left = `${x0}px`;
    chip.style.top = `${y0}px`;
    flyLayer.append(chip);
    const dx = (tr0.left + tr0.width / 2 - fr.left) / k - 11 - x0;
    const dy = (tr0.top - fr.top) / k - 6 - y0;
    const an = chip.animate([
      { transform: 'translate(0, 0) scale(.6)', opacity: 0 },
      { transform: `translate(${dx * 0.35}px, ${dy * 0.2 - 30}px) scale(1.1)`, opacity: 1, offset: 0.3 },
      { transform: `translate(${dx}px, ${dy}px) scale(1)`, opacity: 1 },
    ], { duration: 520, easing: 'cubic-bezier(.4,.1,.3,1)' });
    const fin = () => { chip.remove(); land(t); };
    an.finished.then(fin, fin);
  }
  function land(t) {
    if (S.phase !== 'reveal' || !colOf(t)) return;
    const col = colOf(t);
    const n = Number(col.dataset.n || 0) + 1;
    col.dataset.n = String(n);
    col.style.setProperty('--up', `${-n * 18}px`);
    col.querySelector('.wo-tally').append(h('i', 'wo-pip'));
    const badge = col.querySelector('.wo-n');
    badge.hidden = false;
    badge.textContent = String(n);
    badge.classList.remove('is-bump');
    void badge.offsetWidth;
    badge.classList.add('is-bump');
    play('pop');
  }

  function finishReveal() {
    const max = Math.max(...S.counts);
    const leaders = max > 0 ? S.counts.map((c, i) => (c === max ? i : -1)).filter((i) => i >= 0) : [];
    S.leaders = leaders;
    leaders.forEach((i) => {
      S.titles[i].push(S.q.t);
      const col = colOf(i);
      col.classList.add('is-lead');
      col.querySelector('.wo-jelly').innerHTML = jelly(CAST[i].color, 104, { hat: CAST[i].hat, mood: 'wow' });
      col.querySelector('.wo-plaques').innerHTML = plaques(i);
      col.querySelector('.wo-title')?.classList.add('is-new');
    });
    // очки: каждому, кто проголосовал за лидера (за кого голосовали боты — знает только макет)
    S.bots.forEach((b) => { if (leaders.includes(b.target)) S.pts[b.i] += 1; });
    const mineHit = S.myVote >= 0 && leaders.includes(S.myVote);
    if (mineHit) S.pts[0] += 1;
    const who = leaders.map((i) => CAST[i].nick);
    put(askEye, leaders.length > 1 ? 'Ничья' : 'Титул получает');
    put(askFoot, leaders.length > 1
      ? `${names(who)} — по ${max} ${plural(max, 'голосу', 'голоса', 'голосов')}`
      : `${who[0]} — ${max} ${plural(max, 'голос', 'голоса', 'голосов')} из ${CAST.length}`);
    play('reward');
    if (mineHit) {
      toast({ tone: 'reward', icon: 'level', title: '+1 · угадал мнение большинства' });
      put(stand.querySelector('[data-p]'), String(S.pts[0]));
      const pop = h('span', 'k-pop', '+1');
      pop.style.right = '16px';
      stand.append(pop);
      setTimeout(() => pop.remove(), 1700);
    }
    later(HOLD_MS, nextRound);
  }

  // ---------------------------------------------------------------- итоги (вид ModeResults)
  function showResults() {
    S.phase = 'results';
    row.replaceChildren();
    tl.replaceChildren();
    tc.replaceChildren(toasts);
    scrim?.remove();
    const order = CAST.map((p, i) => ({ p, i, pts: S.pts[i], ts: S.titles[i].length })).sort((a, b) => b.pts - a.pts || b.ts - a.ts || a.i - b.i);
    const top = order[0].pts;
    const tops = order.filter((r) => r.pts === top && r.ts === order[0].ts && top > 0);
    const iAmTop = tops.some((r) => r.i === 0);
    const bonus = iAmTop ? 40 : 0;
    const base = S.rounds * 3;
    // места: одинаковые очки и титулы — одно место
    let place = 0;
    let prev = null;
    const rows = order.map((r, k) => { const key = r.pts * 100 + r.ts; if (key !== prev) { place = k + 1; prev = key; } return { ...r, place }; });
    const titlesAll = [];
    S.titles.forEach((ts, i) => ts.forEach((t) => titlesAll.push({ t, i })));
    scrim = h('div', 'k-scrim mo-scrim wo-scrim');
    scrim.innerHTML = `<section class="k-window mo-results is-in" role="dialog" aria-label="Итоги">
      <div class="k-results-head"><p class="k-eyebrow">Кто из нас? · ${S.rounds} ${plural(S.rounds, 'раунд', 'раунда', 'раундов')}</p><h2 class="k-results-title">Итоги</h2>
        <p class="k-results-sub">${tops.length ? `Самый «в теме» — <b>${esc(names(tops.map((r) => r.p.nick)))}</b>${tops.length === 1 ? ` · ${top} ${plural(top, 'раз', 'раза', 'раз')} с большинством` : ''}` : 'Мнения разошлись — «в теме» не оказался никто'}</p></div>
      <div class="k-win-body">
        <div class="mo-res-main">
          <div class="wo-res-titles">${titlesAll.length ? titlesAll.map((x) => `<div class="wo-res-t"><span class="k-pill k-pill--solid wo-title">${esc(x.t)}</span><span class="wo-res-who${x.i === 0 ? ' is-own' : ''}">${esc(CAST[x.i].nick)}</span></div>`).join('') : '<p class="k-dim">Титулов никто не получил</p>'}</div>
          <table class="k-table"><thead><tr><th>Место</th><th>Игрок</th><th class="k-r">Титулов</th><th class="k-r">В теме</th></tr></thead><tbody>
            ${rows.map((r) => `<tr${r.i === 0 ? ' class="is-own"' : ''}><td>${placeHtml(r.place)}</td><td><span class="k-who wo-who">${jelly(r.p.color, 28, { hat: r.p.hat })}<span class="wo-who-n">${esc(r.p.nick)}</span></span></td><td class="k-r">${r.ts}</td><td class="k-r">${r.pts}</td></tr>`).join('')}
          </tbody></table>
        </div>
        <div class="k-reward">${coinHtml()}<b>+${base + bonus}</b><span>${iAmTop ? `жетонов: ${bonus} за «в теме» и ${base} за игру` : `жетонов за игру · самому «в теме» — ещё +40`}</span></div>
      </div>
      <div class="k-results-actions"><button class="k-btn k-btn--go" type="button" data-act="again">Ещё раз${keyHtml('E', 'tr')}</button><button class="k-btn k-btn--ghost" type="button" data-act="leave">На набережную${keyHtml('Esc', 'tr')}</button></div>
    </section>`;
    scale.append(scrim);
    scrim.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      armed = true;
      if (b.dataset.act === 'again') reset(); else leave();
    });
    confetti();
    play('fanfare');
  }
  /** «На набережную» — в макете макет закрывается заглушкой «Играть» */
  function leave() {
    play('close');
    scrim?.remove();
    scrim = null;
    S.phase = 'idle';
    build();
    const p = h('div', 'k-prompt', `${keyHtml('E')}Играть<span class="k-prompt-sep"></span><span class="k-prompt-note">Кто из нас? · Ракушка</span>`);
    p.style.pointerEvents = 'auto';
    p.style.cursor = 'pointer';
    p.addEventListener('click', () => { armed = true; reset(); });
    bc.append(p);
  }

  // ---------------------------------------------------------------- ход времени
  function step(dt) {
    if (!S || S.phase !== 'vote') return;
    S.t += dt;
    const left = VOTE_MS - S.t;
    put(askTime, clock(left));
    askTime.classList.toggle('is-hurry', left <= 5000);
    askMeter.classList.toggle('is-hurry', left <= 5000);
    setMeter(askMeter, left / VOTE_MS);
    for (const b of S.bots) if (!b.cast && S.t >= b.at) { b.cast = true; refreshVoted(); }
    // все проголосовали — не ждём, раскрываем раньше
    if (!S.early && S.myVote >= 0 && S.bots.every((b) => b.cast)) { S.early = true; S.t = Math.max(S.t, VOTE_MS - 900); }
    const sec = Math.ceil(left / 1000);
    if (left <= 3000 && left > 0 && sec !== S.tickSec) { S.tickSec = sec; play('tick'); }
    if (left <= 0) reveal();
  }

  // ---------------------------------------------------------------- вид, заголовки, перезапуск
  function texts() {
    capT.textContent = 'Живой макет · «Кто из нас?»';
    capN.innerHTML = `Добавь свой вопрос (титул — после «=») и жми «Начать». Кликни по карточке, чтобы проголосовать тайно: за себя нельзя, кто за кого — никто не видит. В игре ${rounds === 4 ? '10 раундов, в макете — 4, чтобы не ждать' : '10 раундов'}.`;
  }
  function reset() {
    scrim?.remove();
    scrim = null;
    S = fresh();
    texts();
    openAsk();
  }

  const segRounds = segButtons(stage.ctl, ['4 раунда', '10 раундов'], 0, (i) => { armed = true; rounds = i === 0 ? 4 : 10; reset(); });
  const again = h('button', 'pg-btn', 'Начать заново');
  again.type = 'button';
  again.addEventListener('click', () => { armed = true; reset(); });
  stage.ctl.append(again);

  document.addEventListener('keydown', (e) => {
    if (!visible || !S || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    const typing = t instanceof HTMLElement && t.matches('input, textarea, select, [contenteditable="true"]');
    if (S.phase === 'ask') { if (e.key === 'Escape') { e.preventDefault(); armed = true; closeAsk(); } return; }
    if (typing) return;
    if (S.phase === 'idle' && e.key.toLowerCase() === 'e') { armed = true; if (scrim) return; openAsk(); return; }
    if (S.phase === 'results') {
      if (e.key.toLowerCase() === 'e') { armed = true; reset(); } else if (e.key === 'Escape') { armed = true; leave(); }
    }
  });
  scale.addEventListener('pointerdown', () => { armed = true; }, true);

  new IntersectionObserver((es) => { visible = es[0].isIntersecting && es[0].intersectionRatio >= 0.35; }, { threshold: [0, 0.35, 0.6, 1] }).observe(stage.frame);
  let last = performance.now();
  setInterval(() => {
    const now = performance.now();
    const gap = now - last;
    const dt = gap > 1500 ? 100 : gap;
    last = now;
    if (visible && !document.hidden) step(dt);
  }, 100);

  el.__wo = { get S() { return S; }, get visible() { return visible; }, step, segRounds };
  reset();
}

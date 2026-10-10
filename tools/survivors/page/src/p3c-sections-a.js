
/* ---- 5. НАВИГАЦИЯ, ШАПКА, УПРАВЛЕНИЕ -------------------------------- */
function initNav() {
  const ol = $('#navlist');
  ol.innerHTML = SECTIONS.map(([id, t], i) => `<li><a class="item" href="#${id}" data-id="${id}"><i>${String(i + 1).padStart(2, '0')}</i><span>${t}</span></a></li>`).join('');
  const links = $$('a.item', ol), secs = SECTIONS.map(([id]) => document.getElementById(id));
  let cur = '', pending = false;
  const upd = () => {
    pending = false;
    let id = SECTIONS[0][0]; const y = innerHeight * 0.3;
    for (const s of secs) if (s && s.getBoundingClientRect().top <= y) id = s.id;
    if (id === cur) return; cur = id;
    links.forEach((a) => { if (a.dataset.id === id) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
    if (innerWidth <= 960) { const a = links.find((x) => x.dataset.id === id); if (a) ol.scrollTo({ left: a.offsetLeft - ol.clientWidth / 2 + a.clientWidth / 2, behavior: REDUCED ? 'auto' : 'smooth' }); }
  };
  addEventListener('scroll', () => { if (!pending) { pending = true; requestAnimationFrame(upd); } }, { passive: true });
  addEventListener('resize', upd); upd();
}

function initHeader() {
  const D = S.D, r10 = S.B && S.B.find((r) => r.w === 10);
  const mins = r10 ? Math.round(r10.minutes) : 12;
  $('#stats').innerHTML = [
    [`${D.waves.length} волн`, `за ~${mins} минут, потом бесконечно`],
    [`Босс на ${D.boss.wave}-й`, `${D.boss.name}, 3 фазы`],
    [`${D.weapons.length} оружий`, `${D.weapons.length} разных механик, по 7 уровней`],
    [`${S.L.map.L} × ${S.L.map.L} м`, 'карта без шва, края склеены'],
  ].map(([b, s]) => `<div class="stat"><b>${b}</b><span>${s}</span></div>`).join('');
}

const CONTROLS = [
  { keys: [['W', 'KeyW'], ['A', 'KeyA'], ['S', 'KeyS'], ['D', 'KeyD']], t: 'Бег', d: 'Куда ведёшь героя. Стрелки тоже работают.' },
  { keys: [['Пробел', 'Space']], t: 'Рывок', d: '6 м за 0,2 с сквозь врагов, неуязвим 0,3 с.' },
  { keys: [['Q', 'KeyQ']], t: 'Удар фонарём', d: 'Тап — малый удар, держи 1 с — полный.' },
  { keys: [['E', 'KeyE']], t: 'Постройки', d: 'Встань в круг и держи E, пока не сработает.' },
  { keys: [['Esc', 'Escape']], t: 'Пауза', d: 'Меню: «Продолжить» и «Выйти (засчитать N волн)».' },
  { keys: [['1', 'Digit1'], ['2', 'Digit2'], ['3', 'Digit3']], t: 'Карточки', d: 'Выбор из трёх — клавишей или мышью.' },
  { keys: [['Enter', 'Enter']], t: 'В бой', d: 'Начать волну, не дожидаясь 5 секунд.' },
  { keys: [['R', 'KeyR']], t: 'Ещё раз', d: 'На экране итогов. «На набережную» — Esc.' },
];
function initControls() {
  $('#controls').innerHTML = CONTROLS.map((c) => `<div class="c"><div class="keys">${c.keys.map(([l, code]) => `<span class="key" data-code="${code}">${l}</span>`).join('')}</div><div class="t"><b>${c.t}</b>${c.d}</div></div>`).join('');
  const ALT = { ArrowUp: 'KeyW', ArrowLeft: 'KeyA', ArrowDown: 'KeyS', ArrowRight: 'KeyD', NumpadEnter: 'Enter' };
  const set = (code, on) => { code = ALT[code] || code; $$(`.key[data-code="${code}"]`).forEach((k) => k.classList.toggle('on', on)); };
  addEventListener('keydown', (e) => set(e.code, true));
  addEventListener('keyup', (e) => set(e.code, false));
  addEventListener('blur', () => $$('.key.on').forEach((k) => k.classList.remove('on')));
}

/* ---- 6. ГЕРОЙ -------------------------------------------------------- */
function initHero() {
  const H = S.D.hero, A = S.D.actives;
  $('#herostats').innerHTML = [
    ['Здоровье', nf(H.hp), 'Фартук +20 за уровень, до 200'],
    ['Скорость', nf(H.speed, 1) + ' м/с', 'Крыса 4,4 · мышь в рывке 8: от крыс уйдёшь, от мышей нет'],
    ['Радиус подбора', nf(H.pickupRadius, 1) + ' м', 'Подкова: +25 % за уровень'],
    ['Броня', nf(H.armor), 'Каска: −1 к каждому удару (до −5), меньше 1 урон не бывает'],
    ['Регенерация', nf(H.regen), 'Лечат родник, похлёбка, новый уровень (+10) и Рой светляков'],
    ['После удара', nf(H.hitInvuln, 2) + ' с', 'Неуязвим. И каждый враг бьёт не чаще раза в 1 с'],
    ['Слоты', `${H.slots.weapons} + ${H.slots.passives}`, 'Пять оружий и пять пассивок из 8 + 8'],
    ['Свет фонаря', nf(H.lightRadius) + ' м', 'Только картинка: тёплый круг вокруг героя'],
    ['Стартовое оружие', 'Фонарь', 'Конус в сторону ближайшего врага'],
  ].map(([k, v, c]) => `<div class="r"><span class="k">${k}</span><span class="v">${v}</span><small>${c}</small></div>`).join('');
  const dash = A.dash, st = A.strike;
  $('#actives').innerHTML = `
    <div class="card act"><div class="head"><span class="key">Пробел</span><h3>Рывок</h3></div>
      <div class="row"><span class="pill amber">${nf(dash.distance)} м за ${nf(dash.time, 1)} с</span><span class="pill">неуязвим ${nf(dash.invuln, 1)} с</span><span class="pill">перезарядка ${nf(dash.cooldown)} с</span></div>
      <ul><li>Летит сквозь врагов, но не сквозь стены.</li><li>Сапоги: −0,25 с перезарядки за уровень (до 1,75 с).</li><li>Через провал до 5 м — вопрос 6 внизу страницы.</li><li>Видно: светлый шлейф, свист; значок Пробела внизу заполняется по кругу, готов — щелчок и блик.</li></ul></div>
    <div class="card act"><div class="head"><span class="key">Q</span><h3>Удар фонарём</h3></div>
      <div class="row"><span class="pill">тап: ${st.tap.damage} урона · ${nf(st.tap.radius, 1)} м</span><span class="pill amber">полный: ${st.full.damage} урона · ${st.full.radius} м</span><span class="pill">перезарядка ${st.cooldown} с</span></div>
      <ul><li>Держи ${st.chargeTime} с: янтарное кольцо растёт, три риски — треть, две трети, полный заряд.</li><li>Полный: отброс ${st.full.knockback} м, оглушение ${nf(st.full.stun, 1)} с, гасит плевки, хит-стоп 50 мс.</li><li>Пока держишь — скорость ×${st.chargeMoveMul}.</li><li>Растёт: +6 % урона за уровень героя, плюс Фитиль и Линза.</li></ul></div>`;
}

function initArena() {
  const cv = $('#arena'), ctx = cv.getContext('2d'), W = cv.width, H = cv.height, PPM = 30, MW = W / PPM, MH = H / PPM;
  const A = S.D.actives, DASH = A.dash, Q = A.strike, SPEED = S.D.hero.speed;
  const st = { hx: MW / 2, hy: MH / 2, dx: 1, dy: 0, dash: null, dashCd: 0, inv: 0, qHold: false, qT: 0, qCd: 0, keys: {}, en: [], fx: [], tAcc: 0 };
  const rnd = (a, b) => a + Math.random() * (b - a);
  function place(e) { let k = 0; do { e.x = rnd(1, MW - 1); e.y = rnd(1, MH - 1); k++; } while (k < 20 && Math.hypot(e.x - st.hx, e.y - st.hy) < 4); e.hp = 60; e.kx = 0; e.ky = 0; e.stun = 0; e.flash = 0; e.dead = 0; e.ph = rnd(0, 6.28); }
  function reset() { st.en = Array.from({ length: 14 }, () => { const e = {}; place(e); return e; }); st.fx = []; }
  reset();
  function startQ() { if (st.qCd > 0 || st.qHold) return; st.qHold = true; st.qT = 0; }
  function releaseQ() {
    if (!st.qHold) return; st.qHold = false;
    const t = st.qT, full = t >= Q.chargeTime, f = clamp((t - Q.tap.holdBelow) / (Q.chargeTime - Q.tap.holdBelow), 0, 1);
    const r = t < Q.tap.holdBelow ? Q.tap.radius : Q.tap.radius + (Q.full.radius - Q.tap.radius) * f;
    const dmg = Math.round(t < Q.tap.holdBelow ? Q.tap.damage : Q.tap.damage + (Q.full.damage - Q.tap.damage) * f);
    const kb = t < Q.tap.holdBelow ? Q.tap.knockback : Q.tap.knockback + (Q.full.knockback - Q.tap.knockback) * f;
    st.qCd = Q.cooldown; st.fx.push({ k: 'ring', x: st.hx, y: st.hy, r, t: 0, d: 0.35, white: full });
    for (const e of st.en) {
      if (e.dead) continue; const d = Math.hypot(e.x - st.hx, e.y - st.hy);
      if (d <= r) { e.hp -= dmg; e.flash = 0.12; const nx = (e.x - st.hx) / (d || 1), ny = (e.y - st.hy) / (d || 1); e.kx = nx * kb / 0.25; e.ky = ny * kb / 0.25; e.kt = 0.25; if (full) e.stun = Q.full.stun; st.fx.push({ k: 'num', x: e.x, y: e.y, t: 0, d: 0.8, v: dmg, big: full }); if (e.hp <= 0) { e.dead = 1.2; st.fx.push({ k: 'pop', x: e.x, y: e.y, t: 0, d: 0.5 }); } }
    }
  }
  function dash(tx, ty) {
    if (st.dashCd > 0 || st.dash) return;
    let dx = tx - st.hx, dy = ty - st.hy; const l = Math.hypot(dx, dy); if (l < 0.01) { dx = st.dx; dy = st.dy; } else { dx /= l; dy /= l; }
    st.dx = dx; st.dy = dy;
    st.dash = { x0: st.hx, y0: st.hy, x1: clamp(st.hx + dx * DASH.distance, 0.5, MW - 0.5), y1: clamp(st.hy + dy * DASH.distance, 0.5, MH - 0.5), t: 0 };
    st.dashCd = DASH.cooldown; st.inv = DASH.invuln;
  }
  const heldDir = () => { const k = st.keys; return [((k.KeyD || k.ArrowRight) ? 1 : 0) - ((k.KeyA || k.ArrowLeft) ? 1 : 0), ((k.KeyS || k.ArrowDown) ? 1 : 0) - ((k.KeyW || k.ArrowUp) ? 1 : 0)]; };
  cv.addEventListener('keydown', (e) => {
    if (['Space', 'KeyQ', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (e.repeat) return; st.keys[e.code] = true;
    if (e.code === 'Space') { const [x, y] = heldDir(); dash(st.hx + (x || st.dx), st.hy + (y || (x ? 0 : st.dy))); }
    if (e.code === 'KeyQ') startQ();
  });
  cv.addEventListener('keyup', (e) => { st.keys[e.code] = false; if (e.code === 'KeyQ') releaseQ(); });
  cv.addEventListener('blur', () => { st.keys = {}; releaseQ(); });
  cv.addEventListener('pointerdown', (e) => { cv.focus({ preventScroll: true }); const r = cv.getBoundingClientRect(); dash((e.clientX - r.left) / r.width * MW, (e.clientY - r.top) / r.height * MH); });
  $('#a-dash').addEventListener('click', () => dash(st.hx + st.dx, st.hy + st.dy));
  const bq = $('#a-q');
  bq.addEventListener('pointerdown', (e) => { e.preventDefault(); startQ(); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((n) => bq.addEventListener(n, releaseQ));
  bq.addEventListener('keydown', (e) => { if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) { e.preventDefault(); startQ(); } });
  bq.addEventListener('keyup', (e) => { if (e.code === 'Space' || e.code === 'Enter') releaseQ(); });
  $('#a-reset').addEventListener('click', reset);

  function step(dt) {
    st.dashCd = Math.max(0, st.dashCd - dt); st.qCd = Math.max(0, st.qCd - dt); st.inv = Math.max(0, st.inv - dt);
    if (st.qHold) st.qT = Math.min(st.qT + dt, 2);
    if (st.dash) { const d = st.dash; d.t += dt; const k = Math.min(1, d.t / DASH.time); st.hx = d.x0 + (d.x1 - d.x0) * k; st.hy = d.y0 + (d.y1 - d.y0) * k; st.fx.push({ k: 'trail', x: st.hx, y: st.hy, t: 0, d: 0.3 }); if (k >= 1) st.dash = null; }
    else { const [x, y] = heldDir(), l = Math.hypot(x, y) || 1, sp = SPEED * (st.qHold ? Q.chargeMoveMul : 1); if (x || y) { st.dx = x / l; st.dy = y / l; } st.hx = clamp(st.hx + x / l * sp * dt, 0.5, MW - 0.5); st.hy = clamp(st.hy + y / l * sp * dt, 0.5, MH - 0.5); }
    for (const e of st.en) {
      if (e.dead) { e.dead -= dt; if (e.dead <= 0) place(e); continue; }
      e.flash = Math.max(0, e.flash - dt); e.stun = Math.max(0, e.stun - dt);
      if (e.kt > 0) { e.kt -= dt; e.x = clamp(e.x + e.kx * dt, 0.3, MW - 0.3); e.y = clamp(e.y + e.ky * dt, 0.3, MH - 0.3); continue; }
      if (e.stun > 0) continue;
      const dx = st.hx - e.x, dy = st.hy - e.y, d = Math.hypot(dx, dy) || 1;
      if (d > 1.1) { e.ph += dt * 4; e.x += (dx / d + Math.sin(e.ph) * 0.4) * 1.3 * dt; e.y += (dy / d + Math.cos(e.ph) * 0.4) * 1.3 * dt; }
    }
    st.fx = st.fx.filter((f) => (f.t += dt) < f.d);
  }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#7d6246'; ctx.fillRect(0, 0, W, H);
    const g = ctx.createRadialGradient(st.hx * PPM, st.hy * PPM, 10, st.hx * PPM, st.hy * PPM, 9 * PPM);
    g.addColorStop(0, 'rgba(255,200,110,.55)'); g.addColorStop(1, 'rgba(40,24,14,.45)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.lineWidth = 1;
    for (let m = 0; m <= MW; m++) { ctx.strokeStyle = m % 5 === 0 ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.06)'; ctx.beginPath(); ctx.moveTo(m * PPM, 0); ctx.lineTo(m * PPM, H); ctx.stroke(); }
    for (let m = 0; m <= MH; m++) { ctx.strokeStyle = m % 5 === 0 ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.06)'; ctx.beginPath(); ctx.moveTo(0, m * PPM); ctx.lineTo(W, m * PPM); ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.font = '11px ' + getComputedStyle(document.body).getPropertyValue('--f-mono'); ctx.fillText('5 м', 5 * PPM + 3, H - 5); ctx.fillText('10 м', 10 * PPM + 3, H - 5);
    for (const f of st.fx) if (f.k === 'trail') { ctx.fillStyle = `rgba(255,236,190,${0.5 * (1 - f.t / f.d)})`; ctx.beginPath(); ctx.arc(f.x * PPM, f.y * PPM, 0.42 * PPM, 0, 7); ctx.fill(); }
    for (const e of st.en) {
      if (e.dead) continue; const x = e.x * PPM, y = e.y * PPM;
      ctx.fillStyle = e.flash > 0 ? '#fff' : '#6e2a7f'; ctx.strokeStyle = '#b25fd6'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 0.36 * PPM, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#d6a8ff'; ctx.beginPath(); ctx.arc(x - 3, y - 2, 1.8, 0, 7); ctx.arc(x + 3, y - 2, 1.8, 0, 7); ctx.fill();
      if (e.stun > 0) { ctx.strokeStyle = '#ffd35a'; ctx.beginPath(); ctx.arc(x, y - 14, 5, 0, 6.3); ctx.stroke(); }
      if (e.hp < 60) { ctx.fillStyle = '#000a'; ctx.fillRect(x - 10, y - 18, 20, 3); ctx.fillStyle = '#ee7f62'; ctx.fillRect(x - 10, y - 18, 20 * clamp(e.hp / 60, 0, 1), 3); }
    }
    for (const f of st.fx) {
      const k = f.t / f.d, px = f.x * PPM, py = f.y * PPM;
      if (f.k === 'ring') { ctx.strokeStyle = f.white ? `rgba(255,255,255,${1 - k})` : `rgba(255,190,90,${1 - k})`; ctx.lineWidth = 5 * (1 - k) + 1; ctx.beginPath(); ctx.arc(px, py, f.r * PPM * (0.6 + 0.4 * k), 0, 7); ctx.stroke(); }
      if (f.k === 'num') { ctx.fillStyle = f.big ? `rgba(255,214,60,${1 - k})` : `rgba(255,255,255,${1 - k})`; ctx.font = `700 ${f.big ? 18 : 13}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText(f.v, px, py - 10 - k * 24); ctx.textAlign = 'left'; }
      if (f.k === 'pop') { ctx.fillStyle = `rgba(178,95,214,${1 - k})`; ctx.beginPath(); ctx.arc(px, py, 6 + k * 18, 0, 7); ctx.fill(); }
    }
    const hx = st.hx * PPM, hy = st.hy * PPM;
    if (st.qHold || st.qT > 0 && st.qHold) { /* кольцо заряда */ }
    if (st.qHold) {
      const t = st.qT, f = clamp((t - Q.tap.holdBelow) / (Q.chargeTime - Q.tap.holdBelow), 0, 1), r = (t < Q.tap.holdBelow ? Q.tap.radius : Q.tap.radius + (Q.full.radius - Q.tap.radius) * f) * PPM, full = t >= Q.chargeTime;
      ctx.strokeStyle = full ? '#fff' : '#ffb347'; ctx.lineWidth = full ? 4 : 3; ctx.setLineDash(full ? [] : [8, 5]); ctx.beginPath(); ctx.arc(hx, hy, r, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2;
      for (const q of [1 / 3, 2 / 3]) { const a = -Math.PI / 2 + q * Math.PI * 2; ctx.beginPath(); ctx.moveTo(hx + Math.cos(a) * (r - 7), hy + Math.sin(a) * (r - 7)); ctx.lineTo(hx + Math.cos(a) * (r + 7), hy + Math.sin(a) * (r + 7)); ctx.stroke(); }
    }
    ctx.globalAlpha = st.inv > 0 ? 0.5 : 1;
    ctx.fillStyle = '#8b5a2b'; ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(hx, hy, 0.45 * PPM, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffd27a'; ctx.beginPath(); ctx.arc(hx + st.dx * 6, hy + st.dy * 6, 3.4, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
    // значки перезарядки внизу
    const icon = (x, label, cd, max, col) => { ctx.fillStyle = 'rgba(14,9,7,.85)'; ctx.beginPath(); ctx.arc(x, H - 34, 24, 0, 7); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, H - 34, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - cd / max)); ctx.stroke(); ctx.fillStyle = cd > 0 ? '#9c8870' : '#fff'; ctx.font = '600 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(label, x, H - 31); ctx.textAlign = 'left'; };
    icon(W / 2 - 34, 'Пробел', st.dashCd, DASH.cooldown, '#ffb347'); icon(W / 2 + 34, 'Q', st.qCd, Q.cooldown, '#5fc4b8');
  }
  let raf = 0, vis = false, last = 0, ro = 0;
  const loop = (t) => {
    raf = 0; if (!vis) return;
    const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t; step(dt); draw();
    ro += dt; if (ro > 0.12) { ro = 0; $('#a-ro').textContent = `Рывок: ${st.dashCd > 0 ? nf(st.dashCd, 1) + ' с' : 'готов'} · Q: ${st.qCd > 0 ? nf(st.qCd, 1) + ' с' : st.qHold ? 'заряд ' + nf(st.qT, 1) + ' с' : 'готов'}`; }
    raf = requestAnimationFrame(loop);
  };
  onVisible(cv, (v) => { vis = v; if (v && !raf) { last = performance.now(); raf = requestAnimationFrame(loop); } }, '0px');
  draw();
}

/* ---- 7. ОРУЖИЕ ------------------------------------------------------- */
const KIND = { cone: 'Конус', homing: 'Самонаведение', boomerang: 'Бумеранг', orbit: 'Вокруг героя', chain: 'Цепью', area: 'По области сверху', trap: 'Ловушки', pierce: 'Пробивающий луч' };
const PLAB = { dmg: ['Урон', ''], cd: ['Раз в', ' с'], angle: ['Угол', '°'], range: ['Дальность', ' м'], n: ['Штук', ''], pierce: ['Пробивает', ''], speed: ['Скорость', ' м/с'], size: ['Размер', ' ×'], radius: ['Радиус', ' м'], spin: ['Оборот', ' с'], on: ['Горят', ' с'], off: ['Пауза', ' с'], jumps: ['Прыжков', ''], chains: ['Разрядов', ''], jumpRange: ['Прыжок', ' м'], warn: ['Тень', ' с'], maxOnFloor: ['На полу до', ''], arm: ['Взвод', ' с'], fuse: ['Фитиль', ' с'], stun: ['Оглушение', ' с'], length: ['Длина', ' м'], width: ['Ширина', ' м'] };
function wDps(w, i) {
  const s = w.levels[i], md = w.model || {};
  if (md.orbit) { const v = s.dmg * s.n * md.hps[i] * s.on / (s.on + s.off); return { one: v * md.boss, crowd: v }; }
  const n = md.count ? s[md.count] : 1, per = s.dmg * n / s.cd;
  return { one: per * md.boss, crowd: per * md.t[i] };
}
function wDiagram(w, i) {
  const W = 300, H = 210, L = w.levels, s = L[i], mx = (k) => Math.max(...L.map((l) => l[k] || 0));
  let hx = 150, hy = 105, ext = 8, shapes = '', cap = '';
  switch (w.kind) {
    case 'cone': ext = Math.max(mx('range'), 7) * 1.1; break;
    case 'homing': ext = 9; break;
    case 'boomerang': ext = mx('range') * 1.12; break;
    case 'orbit': ext = mx('radius') * 1.5; break;
    case 'chain': ext = mx('jumpRange') * (mx('jumps') * 0.8 + 1.2); hx = 24; break;
    case 'area': ext = 14.5; break;
    case 'trap': ext = 8.5; break;
    case 'pierce': ext = mx('length') * 1.08; break;
  }
  const sc = (w.kind === 'chain' ? 250 : 92) / ext, rad = (a) => a * Math.PI / 180;
  const rings = [5, 10, 15, 20, 30].filter((m) => m * sc < 240 && m < ext * 1.05).map((m) => `<circle cx="${hx}" cy="${hy}" r="${m * sc}" fill="none" stroke="rgba(255,255,255,.07)"/>`).join('');
  const AMB = 'fill="rgba(255,179,71,.32)" stroke="#ffb347" stroke-width="1.5"', TQ = 'fill="rgba(95,196,184,.25)" stroke="#5fc4b8" stroke-width="1.5"';
  if (w.kind === 'cone') {
    const a = rad(s.angle / 2), r = s.range * sc;
    shapes = `<path d="M${hx} ${hy} L${hx + r * Math.cos(-a)} ${hy + r * Math.sin(-a)} A${r} ${r} 0 0 1 ${hx + r * Math.cos(a)} ${hy + r * Math.sin(a)} Z" ${AMB}/>`;
    cap = `${s.angle}° · ${nf(s.range, 1)} м`;
  } else if (w.kind === 'homing') {
    for (let k = 0; k < s.n; k++) { const an = rad((k - (s.n - 1) / 2) * 17), x = hx + 5.5 * sc * Math.cos(an), y = hy + 5.5 * sc * Math.sin(an); shapes += `<line x1="${hx}" y1="${hy}" x2="${x}" y2="${y}" stroke="#ffb347" stroke-dasharray="3 4" opacity=".7"/><circle cx="${x}" cy="${y}" r="4.5" fill="#ffd27a" stroke="#ff8a2a"/>`; }
    cap = `${s.n} шт., летят в ближайших, пробивают ${s.pierce}`;
  } else if (w.kind === 'boomerang') {
    for (let k = 0; k < s.n; k++) { const an = (k - (s.n - 1) / 2) * 30, r = s.range * sc / 2; shapes += `<ellipse cx="${hx + r}" cy="${hy}" rx="${r}" ry="${Math.max(5, s.size * 1.1 * sc)}" transform="rotate(${an} ${hx} ${hy})" ${TQ} stroke-dasharray="${k ? '4 3' : '0'}"/>`; }
    cap = `${s.n} кирк., туда-обратно ${nf(s.range, 1)} м`;
  } else if (w.kind === 'orbit') {
    const r = s.radius * sc, dots = Array.from({ length: s.n }, (_, k) => { const an = rad(k * 360 / s.n - 90); return `<circle cx="${hx + r * Math.cos(an)}" cy="${hy + r * Math.sin(an)}" r="5.5" fill="#ffe9a8" stroke="#ffb347" stroke-width="1.5"/>`; }).join('');
    const spin = REDUCED ? '' : `<animateTransform attributeName="transform" type="rotate" from="0 ${hx} ${hy}" to="360 ${hx} ${hy}" dur="${s.spin}s" repeatCount="indefinite"/>`;
    shapes = `<circle cx="${hx}" cy="${hy}" r="${r}" fill="none" stroke="#ffb347" stroke-dasharray="3 4" opacity=".7"/><g>${spin}${dots}</g>`;
    cap = `${s.n} светл., круг ${nf(s.radius, 1)} м, горят ${s.on} из ${s.on + s.off} с`;
  } else if (w.kind === 'chain') {
    for (let c = 0; c < s.chains; c++) {
      const sg = c ? -1 : 1; let px = hx, py = hy, pts = `${px},${py}`;
      for (let k = 0; k < s.jumps; k++) { const st = s.jumpRange * 0.78 * sc; px += st * 0.96; py = hy + sg * ((k % 2 ? -1 : 1) * st * 0.38 + (c ? 8 : 0)); pts += ` ${px},${py}`; shapes += `<circle cx="${px}" cy="${py}" r="3.6" fill="#8ae6da"/>`; }
      shapes += `<polyline points="${pts}" fill="none" stroke="#5fc4b8" stroke-width="2" stroke-linejoin="round"/>`;
    }
    shapes += `<circle cx="${hx + s.jumpRange * 0.78 * sc * 0.96}" cy="${hy + s.jumpRange * 0.78 * sc * 0.38}" r="${s.jumpRange * sc}" fill="none" stroke="#5fc4b8" stroke-dasharray="2 4" opacity=".6"/>`;
    cap = `${s.jumps} прыжков по ${s.jumpRange} м${s.chains > 1 ? ', ' + s.chains + ' разряда' : ''}`;
  } else if (w.kind === 'area') {
    const spots = [[0.55, -0.4], [-0.6, -0.25], [0.25, 0.62], [-0.3, 0.55]];
    shapes = `<circle cx="${hx}" cy="${hy}" r="${14 * sc}" fill="none" stroke="#ffb347" stroke-dasharray="3 5" opacity=".55"/>` + spots.slice(0, s.n).map(([ox, oy]) => `<circle cx="${hx + ox * 14 * sc}" cy="${hy + oy * 14 * sc}" r="${s.radius * sc}" ${AMB}/>`).join('');
    cap = `${s.n} × круг ${nf(s.radius, 1)} м, цель в 14 м`;
  } else if (w.kind === 'trap') {
    const sp = Array.from({ length: s.maxOnFloor }, (_, k) => { const an = rad(k * 137.5), d = (1.8 + (k % 4) * 1.5) * sc; return [hx + d * Math.cos(an), hy + d * Math.sin(an)]; });
    shapes = sp.map(([x, y], k) => `<circle cx="${x}" cy="${y}" r="${s.radius * sc}" fill="rgba(255,179,71,${k < s.n ? .3 : .12})" stroke="#ffb347" stroke-dasharray="3 3" opacity=".9"/><circle cx="${x}" cy="${y}" r="3" fill="#ff8a2a"/>`).join('');
    cap = `круг ${nf(s.radius, 1)} м, на полу до ${s.maxOnFloor}`;
  } else if (w.kind === 'pierce') {
    for (let k = 0; k < s.n; k++) shapes += `<rect x="${k ? hx - s.length * sc : hx}" y="${hy - s.width * sc / 2}" width="${s.length * sc}" height="${s.width * sc}" ${AMB}/>`;
    cap = `${s.n} × ${s.length} × ${nf(s.width, 1)} м`;
  }
  const bar = `<line x1="14" y1="${H - 16}" x2="${14 + 5 * sc}" y2="${H - 16}" stroke="#cdb89d" stroke-width="2"/><text x="${14 + 5 * sc + 6}" y="${H - 12}" font-size="11" fill="#cdb89d" font-family="monospace">5 м</text>`;
  return `<svg class="wdiag" viewBox="0 0 ${W} ${H}" role="img" aria-label="Схема действия оружия, вид сверху">${rings}${shapes}<circle cx="${hx}" cy="${hy}" r="${Math.max(4.5, 0.45 * sc)}" fill="#8b5a2b" stroke="#ffd27a" stroke-width="2"/>${bar}<text x="${W - 8}" y="16" text-anchor="end" font-size="11.5" fill="#ffd27a" font-family="monospace">${esc(cap)}</text></svg>`;
}
function initWeapons() {
  const D = S.D, P = pById(), evoByW = Object.fromEntries(D.evolutions.map((e) => [e.from, e]));
  const grid = $('#wgrid'), det = $('#wdetail');
  let cur = D.weapons[0].id, lv = 1;
  grid.innerHTML = D.weapons.map((w) => `<button class="wcard" type="button" data-id="${w.id}" aria-pressed="${w.id === cur}"><span class="ico" aria-hidden="true">${w.icon}</span><b>${w.name}</b><span class="kind">${KIND[w.kind]}</span><p>${w.desc}</p>${evoByW[w.id] ? '<span class="evo pill gold">эволюция</span>' : ''}</button>`).join('');
  grid.addEventListener('click', (e) => { const b = e.target.closest('.wcard'); if (!b) return; cur = b.dataset.id; $$('.wcard', grid).forEach((x) => x.setAttribute('aria-pressed', x === b)); render(); });
  function render() {
    const w = D.weapons.find((x) => x.id === cur);
    det.innerHTML = `<div><h3>${w.icon} ${w.name}</h3><div class="row" style="margin-bottom:6px"><span class="pill turq">${KIND[w.kind]}</span><span class="pill">${w.desc}</span></div>
      <div class="lvl"><span class="big num" id="wbig">1</span><span class="lab">уровень<br>из 7</span><input type="range" min="1" max="7" value="${lv}" id="wlv" aria-label="Уровень оружия"></div>
      <div class="pips" id="wpips" role="group" aria-label="Выбор уровня">${w.levels.map((l) => `<button type="button" data-lv="${l.lv}">${l.lv}</button>`).join('')}</div>
      <div class="tiles" id="wtiles"></div><p class="upnote" id="wup"></p><p class="note" style="margin:0">Урон в секунду — грубая оценка без пассивок. Кремень: ${w.amount.replace(/^Кремень:\s*/, '')}</p></div>
      <div><div id="wdg"></div><p class="note" style="margin:6px 0 0">Вид сверху: герой по центру, оружие смотрит вправо. Масштаб схемы не меняется между уровнями, поэтому рост виден.</p><div id="wevo"></div></div>`;
    $('#wlv', det).addEventListener('input', (e) => { lv = +e.target.value; update(); });
    $$('.pips button', det).forEach((b) => b.addEventListener('click', () => { lv = +b.dataset.lv; $('#wlv', det).value = lv; update(); }));
    update();
  }
  function update() {
    const w = D.weapons.find((x) => x.id === cur), i = lv - 1, s = w.levels[i], p = i ? w.levels[i - 1] : null;
    const keys = []; w.levels.forEach((l) => Object.keys(l).forEach((k) => { if (k !== 'lv' && k !== 'up' && !keys.includes(k)) keys.push(k); }));
    const tiles = keys.map((k) => { const [lab, u] = PLAB[k] || [k, '']; const v = s[k]; const ch = p && p[k] !== v; return `<div class="tile${ch ? ' up' : ''}"><span>${lab}</span><b>${v === undefined ? '—' : nf(v, 2) + u}</b></div>`; }).join('');
    const dp = wDps(w, i), dpp = i ? wDps(w, i - 1) : null, ev = evoByW[w.id];
    $('#wbig', det).textContent = lv;
    $$('.pips button', det).forEach((b) => { const n = +b.dataset.lv; b.classList.toggle('on', n <= lv); b.classList.toggle('cur', n === lv); });
    $('#wtiles', det).innerHTML = tiles + `<div class="tile dps${dpp && dp.one !== dpp.one ? ' up' : ''}"><span>Урон/с по одной цели ≈</span><b>${nf(dp.one)}</b></div><div class="tile dps${dpp && dp.crowd !== dpp.crowd ? ' up' : ''}"><span>Урон/с по толпе ≈</span><b>${nf(dp.crowd)}</b></div>`;
    $('#wup', det).innerHTML = `<b>Что даёт уровень ${lv}:</b> ${s.up}.`;
    $('#wdg', det).innerHTML = wDiagram(w, i);
    $('#wevo', det).innerHTML = ev ? `<div class="evobox${lv === 7 ? '' : ' dim'}"><b>${lv === 7 ? 'Эволюция доступна' : 'Эволюция на 7-м уровне'}:</b> ${w.icon} ${w.name} 7 + ${P[ev.with].icon} ${P[ev.with].name} → <b>${ev.name}</b>.<br><span class="note">${ev.desc}</span></div>` : '<div class="evobox dim"><b>Эволюция</b> придёт следующим обновлением, задел в данных есть.</div>';
  }
  render();

  $('#evogrid').innerHTML = D.evolutions.map((e) => { const w = D.weapons.find((x) => x.id === e.from), p = P[e.with], st = e.stats;
    const nums = Object.entries(st).filter(([k, v]) => typeof v !== 'object').map(([k, v]) => { const [lab, u] = PLAB[k] || [({ cones: 'Вспышек', burn: 'Поджог', beams: 'Лучей', period: 'Оборот', rings: 'Колец', healEveryHits: 'Лечит за попаданий', boulder: 'Глыба' })[k] || k, '']; return `<span class="pill">${lab} ${nf(v, 2)}${u}</span>`; }).join(' ');
    return `<div class="evo-card"><div class="eq"><span class="ic">${w.icon}</span>${w.name} 7<span class="plus">+</span><span class="ic">${p.icon}</span>${p.name}<span class="arr">→</span></div><h4>${e.icon} ${e.name}</h4><p>${e.desc}</p><div class="row" style="margin-top:8px;gap:6px">${nums}</div></div>`; }).join('');
  $('#pgrid').innerHTML = D.passives.map((p) => { const cat = D.evolutions.find((e) => e.with === p.id), w = cat && D.weapons.find((x) => x.id === cat.from);
    return `<div class="pcard"><div class="h"><span class="ic">${p.icon}</span><b>${p.name}</b></div><p>${p.text}</p><div class="steps" aria-label="Уровней: ${p.max}">${Array.from({ length: p.max }, () => '<i style="background:var(--amber)"></i>').join('')}</div><div class="meta">до ${p.max} ур.${w ? ' · эволюция: ' + w.name : ''}</div></div>`; }).join('');
}

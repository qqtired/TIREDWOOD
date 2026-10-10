
/* ---- 12. КАРТА ------------------------------------------------------- */
function initMap() {
  const L = S.L, sc = $('#mapscroll'), img = $('#mapimg'); let zoom = 1;
  const apply = (z, cx = 0.5, cy = 0.5) => {
    const ow = img.clientWidth || 1, oh = img.clientHeight || 1, ax = (sc.scrollLeft + sc.clientWidth * cx) / ow, ay = (sc.scrollTop + sc.clientHeight * cy) / oh;
    zoom = clamp(z, 1, 4); img.style.width = (sc.clientWidth * zoom) + 'px';
    sc.scrollLeft = ax * img.clientWidth - sc.clientWidth * cx; sc.scrollTop = ay * img.clientHeight - sc.clientHeight * cy;
  };
  apply(1.7); sc.scrollTo(0.035 * img.clientWidth, 0.09 * img.clientHeight);
  $('#mz-in').addEventListener('click', () => apply(zoom * 1.4));
  $('#mz-out').addEventListener('click', () => apply(zoom / 1.4));
  $('#mz-fit').addEventListener('click', () => { apply(1); sc.scrollTo(0, 0); });
  addEventListener('resize', () => apply(zoom));
  let drag = null;
  sc.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') return; drag = { x: e.clientX, y: e.clientY, l: sc.scrollLeft, t: sc.scrollTop }; sc.classList.add('drag'); sc.setPointerCapture(e.pointerId); });
  sc.addEventListener('pointermove', (e) => { if (!drag) return; sc.scrollLeft = drag.l - (e.clientX - drag.x); sc.scrollTop = drag.t - (e.clientY - drag.y); });
  const end = () => { drag = null; sc.classList.remove('drag'); };
  sc.addEventListener('pointerup', end); sc.addEventListener('pointercancel', end);
  const total = L.map.L * L.map.L, zn = Object.fromEntries(L.zones.map((z) => [z.id, z]));
  $('#zones').innerHTML = L.zones.map((z) => `<div class="zone" style="--zc:${z.color}"><b>${z.name}</b><p>${z.mood}</p><div class="m">${nf(z.areaM2 / total * 100)} % · ${nf(z.areaM2)} м²</div></div>`).join('');
  $('#landmarks').innerHTML = L.landmarks.map((l) => `<div><b>${l.name}</b> <span class="pill dim">${zn[l.zone] ? zn[l.zone].name : l.zone}</span> <span class="note num">(${nf(l.x)}; ${nf(l.z)})</span><br>${l.desc ? esc(l.desc) : ''}</div>`).join('');
}

function initWrapDemo() {
  const L = S.L, LL = L.map.L, cm = $('#wrapmap'), cc = $('#wrapcam'), mc = cm.getContext('2d'), cx = cc.getContext('2d');
  const FLOOR = { cellars: '#6e5644', mushrooms: '#4f5a3a', crystals: '#30535a', mine: '#5f4f3c', jam: '#4f3a52' };
  const KC = { crystal_cluster: '#5fc4b8', druse: '#8ae6da', stalagmite: '#8a7a68', mushroom_big: '#e0c08e', puffball: '#d8c8a8', ring_mushroom: '#f0b060', jam_rock: '#8a4a9a', vat: '#9a5faa', cauldron: '#c88040', brick_pillar: '#9a7a62', barrel_stack: '#8a6238', crate_stack: '#7a5a3a', wine_rack: '#7a5a4a', timber_support: '#a07a40', rock_mass: '#2a1f19', rock_ridge: '#3d2f27', root_ridge: '#7a8a46', rubble: '#6a5a4a', ore_pile: '#7a6a58', cart_wreck: '#8a6238', chest_column: '#9a7a62', stairs: '#e0d0b0', giant_barrel: '#8a6238', patriarch_stem: '#e0c08e', ore_heap: '#7a6a58' };
  const CS = 20, CW = cc.width, CH = cc.height;     // камера: 36 × 23,5 м
  const MS = cm.width / LL;                       // миникарта
  const geo = (o, relx, relz, s, ox, oz) => ({ x: ox + relx * s, z: oz + relz * s });
  function drawShape(ctx, o, camX, camZ, s, ox, oz, fill, stroke) {
    if (o.t === 's') { const mx = (o.x0 + o.x1) / 2, mz = (o.z0 + o.z1) / 2, rx = wrap(mx - camX, LL), rz = wrap(mz - camZ, LL), hx = (o.x1 - o.x0) / 2, hz = (o.z1 - o.z0) / 2; ctx.lineCap = 'round'; ctx.strokeStyle = fill; ctx.lineWidth = o.r * 2 * s; ctx.beginPath(); ctx.moveTo(ox + (rx - hx) * s, oz + (rz - hz) * s); ctx.lineTo(ox + (rx + hx) * s, oz + (rz + hz) * s); ctx.stroke(); }
    else { const rx = wrap(o.x - camX, LL), rz = wrap(o.z - camZ, LL); ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(ox + rx * s, oz + rz * s, Math.max(1, o.r * s), 0, 6.3); ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); } }
  }
  function drawWorld(ctx, camX, camZ, s, w, h, full) {
    ctx.fillStyle = '#120d0b'; ctx.fillRect(0, 0, w, h);
    for (const z of L.zones) { ctx.fillStyle = FLOOR[z.id] || '#555'; for (const dx of [-LL, 0, LL]) for (const dz of [-LL, 0, LL]) { ctx.beginPath(); z.polygon.forEach(([px, pz], i) => { const X = w / 2 + (px + dx - camX) * s, Z = h / 2 + (pz + dz - camZ) * s; if (i) ctx.lineTo(X, Z); else ctx.moveTo(X, Z); }); ctx.closePath(); ctx.fill(); } }
    const ox = w / 2, oz = h / 2;
    if (!full) { const gx0 = Math.floor(camX - w / 2 / s) - 1, gz0 = Math.floor(camZ - h / 2 / s) - 1; for (let gx = gx0 - (gx0 % 2); gx < gx0 + w / s + 4; gx += 2) for (let gz = gz0 - (gz0 % 2); gz < gz0 + h / s + 4; gz += 2) { const a = mod(gx, LL) / 2, b = mod(gz, LL) / 2, hh = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453, f = hh - Math.floor(hh); ctx.fillStyle = f > 0.5 ? `rgba(255,240,210,${(f - 0.5) * 0.07})` : `rgba(0,0,0,${(0.5 - f) * 0.12})`; ctx.fillRect(ox + (gx - camX) * s, oz + (gz - camZ) * s, 2 * s, 2 * s); if (f > 0.88) { ctx.fillStyle = 'rgba(255,235,200,.35)'; ctx.beginPath(); ctx.arc(ox + (gx + f * 2 - 1 - camX) * s, oz + (gz + (f * 7 % 1) * 2 - camZ) * s, 2.5, 0, 6.3); ctx.fill(); } } }
    for (const hz of L.hazards) {
      const col = hz.kind === 'pit' ? '#0b0706' : hz.kind === 'water' ? 'rgba(80,170,170,.35)' : 'rgba(150,70,190,.5)';
      drawShape(ctx, hz, camX, camZ, s, ox, oz, col, hz.kind === 'pit' ? '#4a3a30' : null);
    }
    for (const o of L.obstacles) {
      const rx = wrap((o.t === 's' ? (o.x0 + o.x1) / 2 : o.x) - camX, LL), rz = wrap((o.t === 's' ? (o.z0 + o.z1) / 2 : o.z) - camZ, LL);
      if (Math.abs(rx) * s > w / 2 + 120 || Math.abs(rz) * s > h / 2 + 120) continue;
      drawShape(ctx, o, camX, camZ, s, ox, oz, KC[o.kind] || '#5a4a3a', 'rgba(255,230,190,.25)');
    }
  }
  const mbase = document.createElement('canvas'); mbase.width = cm.width; mbase.height = cm.height;
  { const c = mbase.getContext('2d'); drawWorld(c, LL / 2, LL / 2, MS, mbase.width, mbase.height, true); }
  const st = { x: 205, z: 120, dir: [1, 0], play: !REDUCED, mult: 3, seams: 0, seam: false };
  const bPlay = $('#w-play'), dirs = $('#w-dir'), ro = $('#w-ro');
  const DIRS = [['→', [1, 0], 'вправо'], ['↓', [0, 1], 'вниз'], ['←', [-1, 0], 'влево'], ['↑', [0, -1], 'вверх']];
  dirs.innerHTML = DIRS.map(([a, d, t], i) => `<button type="button" aria-pressed="${i === 0}" data-i="${i}" aria-label="Идти ${t}">${a} ${t}</button>`).join('');
  dirs.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; st.dir = DIRS[+b.dataset.i][1]; $$('button', dirs).forEach((x) => x.setAttribute('aria-pressed', x === b)); edge(); });
  const syncPlay = () => { bPlay.setAttribute('aria-pressed', st.play); bPlay.textContent = st.play ? 'Пауза' : 'Пуск'; };
  bPlay.addEventListener('click', () => { st.play = !st.play; syncPlay(); if (st.play) kick(); });
  syncPlay();
  function edge() { const [dx, dz] = st.dir; if (dx) st.x = dx > 0 ? LL - 24 : 24; if (dz) st.z = dz > 0 ? LL - 18 : 18; st.seams = 0; draw(); if (st.play) kick(); }
  $('#w-edge').addEventListener('click', edge);
  const extra = document.createElement('button'); extra.className = 'btn small'; extra.type = 'button'; extra.textContent = 'Скорость ×3'; $('#w-edge').after(extra);
  extra.addEventListener('click', () => { st.mult = st.mult === 1 ? 3 : st.mult === 3 ? 8 : 1; extra.textContent = 'Скорость ×' + st.mult; });
  const seamBtn = document.createElement('button'); seamBtn.className = 'btn small'; seamBtn.type = 'button'; seamBtn.textContent = 'Показать шов'; seamBtn.setAttribute('aria-pressed', 'false'); extra.after(seamBtn);
  seamBtn.addEventListener('click', () => { st.seam = !st.seam; seamBtn.setAttribute('aria-pressed', st.seam); seamBtn.textContent = st.seam ? 'Скрыть шов' : 'Показать шов'; draw(); });
  const FW = 36, FH = 23.5;
  function draw() {
    drawWorld(cx, st.x, st.z, CS, CW, CH, false);
    if (st.seam) { cx.strokeStyle = 'rgba(255,255,255,.7)'; cx.setLineDash([6, 6]); cx.lineWidth = 2; const sx = CW / 2 + wrap(0 - st.x, LL) * CS, sz = CH / 2 + wrap(0 - st.z, LL) * CS; cx.beginPath(); cx.moveTo(sx, 0); cx.lineTo(sx, CH); cx.moveTo(0, sz); cx.lineTo(CW, sz); cx.stroke(); cx.setLineDash([]); cx.fillStyle = '#fff'; cx.font = '12px sans-serif'; cx.fillText('здесь края склеены (в игре шва нет)', Math.min(Math.max(sx + 6, 6), CW - 220), 16); }
    const g = cx.createRadialGradient(CW / 2, CH / 2, 6, CW / 2, CH / 2, 9 * CS); g.addColorStop(0, 'rgba(255,200,110,.38)'); g.addColorStop(1, 'rgba(20,10,5,.35)'); cx.fillStyle = g; cx.fillRect(0, 0, CW, CH);
    cx.fillStyle = '#8b5a2b'; cx.strokeStyle = '#ffd27a'; cx.lineWidth = 3; cx.beginPath(); cx.arc(CW / 2, CH / 2, 0.45 * CS + 3, 0, 7); cx.fill(); cx.stroke();
    mc.drawImage(mbase, 0, 0);
    if (st.seam) { mc.strokeStyle = 'rgba(255,255,255,.55)'; mc.setLineDash([4, 4]); mc.strokeRect(0.5, 0.5, cm.width - 1, cm.height - 1); mc.setLineDash([]); }
    mc.strokeStyle = '#ffd35a'; mc.lineWidth = 2;
    for (const dx of [-LL, 0, LL]) for (const dz of [-LL, 0, LL]) mc.strokeRect((st.x - FW / 2 + dx) * MS, (st.z - FH / 2 + dz) * MS, FW * MS, FH * MS);
    mc.fillStyle = '#fff'; mc.beginPath(); mc.arc(st.x * MS, st.z * MS, 4, 0, 7); mc.fill(); mc.strokeStyle = '#000'; mc.lineWidth = 1.5; mc.stroke();
    ro.textContent = `x ${nf(st.x, 1)} · z ${nf(st.z, 1)} м · швов пройдено: ${st.seams}`;
  }
  let raf = 0, vis = false, last = 0;
  const loop = (t) => {
    raf = 0; if (!vis || !st.play) return;
    const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t; const sp = S.D.hero.speed * st.mult * dt;
    const nx = st.x + st.dir[0] * sp, nz = st.z + st.dir[1] * sp;
    if (nx < 0 || nx >= LL || nz < 0 || nz >= LL) st.seams++;
    st.x = mod(nx, LL); st.z = mod(nz, LL); draw(); raf = requestAnimationFrame(loop);
  };
  const kick = () => { if (vis && st.play && !raf) { last = performance.now(); raf = requestAnimationFrame(loop); } };
  onVisible($('.wrapdemo'), (v) => { vis = v; kick(); }, '0px');
  draw();
}

/* ---- 13. ПОСТРОЙКИ --------------------------------------------------- */
const EXTRAS = [
  { id: 'lantern', name: 'Фонари-маяки', short: 'фонари-маяки', rec: true, hard: 'низкая', does: '16 столбов решёткой 60 м. Постоял рядом 1,5 с — фонарь горит до конца забега. Враги в его свете на 20 % медленнее.', fun: 'Фирменное для Фонарщика. Карта «обживается», зажжённые фонари — хлебные крошки и безопасные островки.' },
  { id: 'cart', name: 'Вагонетка на кольце', short: 'вагонетка', rec: true, hard: 'средняя', does: 'Пробежал сквозь стоящую вагонетку — она катится по кольцу рельсов 12 м/с, давит и отбрасывает врагов. Можно запрыгнуть (E) и проехать круг, Пробел — спрыгнуть.', fun: 'Рельсы на торе — бесконечное кольцо 240 м. Красивые «страйки» по толпе.' },
  { id: 'bell', name: 'Колокол-магнит', short: 'колокол-магнит', rec: false, hard: 'низкая', does: 'Держи E 2 с: весь опыт в 60 м летит к герою, враги в 8 м оглушены на 1 с. Раз в 120 с, 3 колокола на карте.', fun: 'Чистый «выдох» посреди волны, звук на весь экран. Частично повторяет магнит из жаровен.' },
  { id: 'kegs', name: 'Пороховые бочки', short: 'пороховые бочки', rec: true, hard: 'низкая', does: '12 пачек по 4. Любое попадание — фитиль 1,5 с — взрыв 5 м, цепная реакция по пачке. Герою −10 % HP, если рядом. Новые каждую волну.', fun: 'Заманить орду и подорвать. Дополняет бочонок из жаровни.' },
  { id: 'trampoline', name: 'Гриб-батут', short: 'гриб-батут', rec: true, hard: 'средняя', does: '8 штук в Грибной пещере. Наступил — прыжок на 10 м по ходу бега, 0,8 с в воздухе без урона, приземление отбрасывает врагов на 3 м.', fun: 'Владелец любит батуты. Уйти из окружения — выбор места, а не кнопка.' },
  { id: 'traps', name: 'Капканы', short: 'капканы', rec: false, hard: 'низкая', does: '10 групп по 3. Враг в капкане стоит 3 с и получает урон, герой — 0,6 с. Взводится заново через 20 с.', fun: 'Провести «паровоз» через капканы.' },
  { id: 'lift', name: 'Шахтный лифт', short: 'шахтный лифт', rec: false, hard: 'средняя', does: '3 станции, не ближе 110 м друг от друга. Встал в клеть, E — 1,5 с спуска — выходишь у другого лифта. Раз в 60 с. Враги остаются.', fun: 'Спасение из окружения. Но ломает давление волн, лучше позже.' },
  { id: 'forge', name: 'Забытая кузня', short: 'забытая кузня', rec: false, hard: 'низкая', does: '2 штуки. Держи E 3 с: одно оружие +1 уровень. Раз в 3 волны.', fun: 'Цель для вылазки посреди волны. Частично повторяет улучшения из сундуков.' },
];
const EXSTATE = { set: new Set(EXTRAS.filter((e) => e.rec).map((e) => e.id)), subs: [] };
function setExtra(id, on) { if (on) EXSTATE.set.add(id); else EXSTATE.set.delete(id); EXSTATE.subs.forEach((f) => f()); }

function initBuildings() {
  const D = S.D, L = S.L, I = Object.fromEntries(D.interactables.map((x) => [x.id, x]));
  const cnt = (k) => L.buildings[k].length;
  const cells = [
    { id: 'altar', mid: 'altar', name: 'Алтарь света', html: `<p>${I.altar.use}. Случайный бафф на ${I.altar.duration} с, не один и тот же дважды подряд.</p><div class="nums">${I.altar.buffs.map((b) => `<span class="pill soft" title="${esc(b.text)}">${b.name}: ${esc(b.text)}</span>`).join('')}</div><p class="note">Остывает ${I.altar.cooldown} с: руны гаснут и загораются по кругу, видно, сколько ждать. Мест ${cnt('altar')}, активны 4 по очереди.</p>` },
    { id: 'brazier', mid: 'brazier', name: 'Жаровня', html: `<p>Любое попадание опрокидывает её, из углей — добыча. Новая вырастает на месте через ${I.brazier.respawn} с.</p><div class="nums">${I.brazier.drops.map((d) => `<span class="pill ${d.id === 'nothing' ? 'dim' : 'soft'}">${Math.round(d.p * 100)} % · ${esc(d.text)}</span>`).join('')}</div><p class="note">Активных 30–40 из ${cnt('brazier')} мест. С врагов еда и бонусы не падают: поэтому жаровни есть смысл обходить.</p>` },
    { id: 'cursedChest', mid: 'cursed_chest', name: 'Проклятый сундук', html: `<p>${I.cursedChest.use}. ${esc(I.cursedChest.curse)}.</p><div class="nums"><span class="pill turq">награда: 3 уровня, 50 опыта, +30 HP</span><span class="pill">таймер 45 с</span><span class="pill">2 из ${cnt('cursedChest')} мест одновременно</span></div><p class="note">${esc(I.cursedChest.fail)}. На волнах босса сундуков нет. Новый появляется через 120 с в другом месте.</p>` },
    { id: 'spring', mid: 'healing_spring', name: 'Целебный родник', html: `<p>${I.spring.use}. Лечит ${I.spring.heal} HP/с, пока в чаше есть вода.</p><div class="nums"><span class="pill turq">${I.spring.pool} HP в чаше</span><span class="pill">полная за ${I.spring.refill} с</span><span class="pill">${cnt('spring')} родника на карте</span></div><p class="note">Не у старта: до воды надо дойти, это решение. Уровень воды виден сверху.</p>` },
  ];
  $('#bld').innerHTML = cells.map((c) => `<div class="bcell"><div class="viewer" id="vb-${c.id}"></div><div class="vtools" id="tb-${c.id}"></div><h3 style="margin-top:12px">${c.name}</h3>${c.html}</div>`).join('');
  cells.forEach((c) => { const v = createView($('#vb-' + c.id)); viewTools(v, $('#tb-' + c.id), false); v.set(modelById(c.mid)); });
  const mk = (e, where) => `<label class="optcard${EXSTATE.set.has(e.id) ? ' chk' : ''}" data-ex="${e.id}"><input type="checkbox" data-ex="${e.id}" ${EXSTATE.set.has(e.id) ? 'checked' : ''}><span><b>${e.name}</b>${e.rec ? ' <span class="pill turq">рекомендуем</span>' : ''}<p>${e.does}</p><p style="color:var(--text-3)">Почему весело: ${e.fun}</p><span class="m"><span class="pill">сложность: ${e.hard}</span></span></span></label>`;
  $('#opt').innerHTML = EXTRAS.map((e) => mk(e)).join('');
  const sync = () => { $$('#opt .optcard').forEach((l) => { const on = EXSTATE.set.has(l.dataset.ex); l.classList.toggle('chk', on); $('input', l).checked = on; }); };
  EXSTATE.subs.push(sync);
  $('#opt').addEventListener('change', (e) => { if (e.target.dataset.ex) setExtra(e.target.dataset.ex, e.target.checked); });
}

/* ---- 14. НАГРАДЫ ----------------------------------------------------- */
function initRewards() {
  const E = S.D.economy, rows = S.B || [], row = (w) => rows.find((r) => r.w === w);
  const waveTok = (w) => Math.min(E.waveCap, E.waveBase + w), bossTok = (w) => (w % 10 === 0 ? E.bossBase + E.bossStep * (w / 10 - 1) : 0);
  const tokens = (n, rec) => { let t = 0; for (let w = 1; w <= n; w++) t += waveTok(w) + bossTok(w); return { raw: t, total: Math.min(E.runCap, t + (rec ? E.recordBonus : 0)) }; };
  $('#formula').innerHTML = `🪙 = min(${E.runCap}, Σ min(${E.waveCap}, ${E.waveBase} + w) по отбитым волнам + Σ боссов + ${E.recordBonus} за личный рекорд)<small>За волну w: min(${E.waveCap}, ${E.waveBase} + w) — 1-я даёт ${waveTok(1)}, 10-я ${waveTok(10)}, с 13-й по ${E.waveCap}. Босс: ${E.bossBase} + ${E.bossStep} × (n − 1): 10-я — ${bossTok(10)}, 20-я — ${bossTok(20)}, 30-я — ${bossTok(30)}. Потолок за забег — ${E.runCap}. ${esc(E.onQuit)}.</small>`;
  const w = $('#cw'), rec = $('#crec');
  const upd = () => { const n = +w.value, t = tokens(n, rec.checked), r = row(n); $('#cwv').textContent = n; $('#cres').textContent = nf(t.total) + ' 🪙';
    $('#cnote').textContent = r ? `${nf(r.minutes, 1)} мин игры · ${nf(tokens(n, false).raw / r.minutes, 1)} 🪙 в минуту (без бонуса)${t.raw + (rec.checked ? E.recordBonus : 0) > E.runCap ? ' · упёрся в потолок ' + E.runCap : ''}` : 'Нет модели времени для этой волны.'; };
  w.addEventListener('input', upd); rec.addEventListener('change', upd); upd();
  $('#ctable').innerHTML = `<thead><tr><th>Дошёл до</th><th class="n">Время</th><th class="n">🪙</th><th class="n">В минуту</th></tr></thead><tbody>${[10, 15, 20, 30].map((n) => { const r = row(n), t = tokens(n, false).total; return `<tr><td>${n} волн</td><td class="n">${r ? '~' + nf(r.minutes, 1) + ' мин' : '—'}</td><td class="n">${nf(t)}</td><td class="n">${r ? nf(t / r.minutes, 1) : '—'}</td></tr>`; }).join('')}</tbody>`;
  $('#ctable').insertAdjacentHTML('afterend', `<p class="note" style="margin:8px 0 0">Без бонуса за рекорд. Внутри ориентира 8–15 🪙 в минуту. Фарм первых волн даёт ~7–8 в минуту: играть дальше выгоднее.</p>`);

  // табличка
  const BOARD = { all: { t: 'За всё время', rows: [['Мира', 23, '31:20'], ['Fedya', 21, '28:45'], ['Тоня', 19, '26:10'], ['Zed', 17, '23:02'], ['Лёша', 16, '22:40']], me: [8, 'Ты', 14, '18:32'] }, week: { t: 'За неделю', rows: [['Тоня', 18, '24:51'], ['Мира', 16, '22:30'], ['Zed', 15, '20:12'], ['Fedya', 14, '19:03'], ['Ника', 14, '19:40']], me: [9, 'Ты', 12, '17:40'] } };
  const bd = $('#board'); let tab = 'all';
  const renderBoard = () => { const b = BOARD[tab]; bd.innerHTML = `<h4>ПОДЗЕМЕЛЬЕ · рекорды</h4><div class="bt"><button type="button" data-t="all" aria-pressed="${tab === 'all'}">Всё время</button><button type="button" data-t="week" aria-pressed="${tab === 'week'}">Неделя</button></div><table><tbody>${b.rows.map((r, i) => `<tr><td class="n">${i + 1}</td><td>${r[0]}</td><td class="n">${r[1]} волн</td><td class="n">${r[2]}</td></tr>`).join('')}<tr class="me"><td class="n">${b.me[0]}</td><td>${b.me[1]}</td><td class="n">${b.me[2]} волн</td><td class="n">${b.me[3]}</td></tr></tbody></table>`; $$('button', bd).forEach((x) => x.addEventListener('click', () => { tab = x.dataset.t; renderBoard(); })); };
  renderBoard();
  // экран итогов
  const n = 12, tw = (() => { let t = 0; for (let k = 1; k <= n; k++) t += waveTok(k); return t; })(), tb = bossTok(10), tr = E.recordBonus;
  const WP = wById(), PS = pById(), items = [['lantern', 5, 1], ['embers', 4], ['stalactites', 4], ['fireflies', 3], ['pickaxe', 2], ['might', 3, 0, 1], ['armor', 2, 0, 1], ['speed', 2, 0, 1]];
  const dmg = [['Фонарь', 100], ['Сталактиты', 74], ['Угольки', 55], ['Светляки', 38], ['Кирка', 21]];
  $('#res').innerHTML = `<div class="big">Ты отбил ${n} волн</div><div class="time">17:42</div><div class="rec"><span class="pill gold">Твой новый рекорд!</span> <span class="pill">3-е место за неделю</span></div>
    <div class="cols"><div class="coins"><h4>Жетоны</h4><div><span>Волны (${n})</span><b>${tw}</b></div><div><span>Босс (10-я)</span><b>${tb}</b></div><div><span>Новый рекорд</span><b>+${tr}</b></div><div class="tot"><span>Итого</span><b>${nf(Math.min(E.runCap, tw + tb + tr))} 🪙</b></div><p class="note" style="margin:10px 0 0">Тебя одолел Бочар на ${n}-й волне.</p></div>
    <div><h4>Сборка</h4><div class="build">${items.map(([id, lv, evo]) => { const x = WP[id] || PS[id]; return `<span class="b${evo ? ' evo' : ''}" title="${x.name}">${x.icon}<i>${lv}</i></span>`; }).join('')}</div><h4>Урон по оружиям</h4><div class="dmg">${dmg.map(([nm, p]) => `<div class="r"><span>${nm}</span><i style="width:${p}%"></i><span class="num">${p}%</span></div>`).join('')}</div><p class="note" style="margin:8px 0 0">Убито 1 204 · уровень 38 · сундуков 7</p></div></div>
    <div class="btns"><span class="btn primary">Ещё раз <span class="key" style="min-width:auto;height:auto;padding:0 7px;font-size:12px">R</span></span><span class="btn">На набережную <span class="key" style="min-width:auto;height:auto;padding:0 7px;font-size:12px">Esc</span></span></div>`;
}

/* ---- 15. HUD --------------------------------------------------------- */
function initHud() {
  const items = [
    ['Опыт и уровень', 'Тонкая полоса сверху во всю ширину и номер уровня.'],
    ['Волна', 'Номер волны, полоса отряда и таймер. У босса вместо них — полоса HP с рисками фаз.'],
    ['Здоровье, баффы, звёзды', 'Полоса здоровья с числом, под ней значки баффов алтаря с таймером и звёзды ★ — сколько карточек ждёт.'],
    ['Оружие и пассивки', 'Слева снизу: 5 значков оружия и 5 пассивок с уровнями.'],
    ['Рывок и удар', 'Две большие кнопки: [Пробел] и [Q]. Заполняются по кругу, готовность — щелчок и блик.'],
    ['Счётчик и пауза', 'Справа сверху: сколько убито и кнопка паузы ⏸ (мышью, с подписью Esc).'],
    ['Стрелки у края', 'К элите, сундуку и роднику, если они за кадром. На торе стрелка указывает кратчайший путь.'],
  ];
  const lg = $('#hudlegend');
  lg.innerHTML = items.map(([t, d], i) => `<li data-n="${i + 1}"><i>${i + 1}</i><span><b>${t}.</b> ${d}</span></li>`).join('');
  const pins = $$('#hudmock .pin'), lis = $$('li', lg);
  const on = (n) => { pins.forEach((p) => p.classList.toggle('on', p.dataset.pin == n)); lis.forEach((l) => l.classList.toggle('on', l.dataset.n == n)); };
  pins.forEach((p) => { ['mouseenter', 'focus', 'click'].forEach((ev) => p.addEventListener(ev, () => on(p.dataset.pin))); p.setAttribute('aria-label', 'Пояснение ' + p.dataset.pin + ': ' + items[p.dataset.pin - 1][0]); });
  lis.forEach((l) => { l.addEventListener('mouseenter', () => on(l.dataset.n)); l.addEventListener('click', () => on(l.dataset.n)); });
  on(1);
}

/* ---- 16. МОДЕЛИ ------------------------------------------------------ */
function initHeroBossViews() {
  const v = createView($('#v-hero'), { art: ['2-hero', 0, 0, 1, 1, 'contain'] }); viewTools(v, $('#t-hero'), true); v.set(modelById('lamplighter'));
}
function initModels() {
  const list = $('#mlist'), minfo = $('#minfo');
  const view = createView($('#v-main'), {}); viewTools(view, $('#t-main'), true);
  const ready = MODELS.filter((m) => m.state === 'ready').length, prev = MODELS.filter((m) => m.state === 'preview').length;
  $('#mcount').textContent = `Готово ${ready} из ${MODELS.length}${prev ? ', ещё ' + prev + ' с превью' : ''}.`;
  let cur = (MODELS.find((m) => m.state === 'ready') || MODELS[0]).id;
  const itemHtml = (m) => `<button type="button" class="mitem" data-id="${m.id}" aria-pressed="${m.id === cur}"><span class="dot ${m.state === 'ready' ? 'ok' : m.state === 'preview' ? 'pv' : ''}"></span><span>${m.name}</span><span class="tr">${m.state === 'ready' ? (m.isKit ? (m.nodes.length > 1 ? m.nodes.length + ' шт.' : '') : nf(m.bytes / 1024) + ' КБ') : m.state === 'preview' ? 'превью' : ''}</span></button>`;
  list.innerHTML = GROUPS.map(([g, title]) => {
    const ms = MODELS.filter((m) => m.group === g), done = ms.filter((m) => m.state === 'ready').length;
    let inner = '', lastSub = null;
    ms.forEach((m) => { if (m.sub && m.sub !== lastSub) { inner += `<div class="sub">${m.sub}</div>`; lastSub = m.sub; } inner += itemHtml(m); });
    return `<details ${g !== 'env' || ms.some((m) => m.id === cur) ? 'open' : ''}><summary>${title}<small>${done}/${ms.length}</small></summary><div class="items">${inner}</div></details>`;
  }).join('');
  function show() {
    const m = modelById(cur); view.set(m);
    $$('.mitem', list).forEach((b) => b.setAttribute('aria-pressed', b.dataset.id === cur));
    drawInfo();
  }
  function drawInfo() {
    const m = modelById(cur), grp = GROUPS.find((g) => g[0] === m.group)[1], inf = view.info, t = inf ? inf.maxTris : null;
    const pct = t ? Math.min(100, t / m.budget * 100) : 0;
    const parts = inf && inf.parts && inf.parts.length > 1 ? `<p class="note" style="margin:8px 0 0">Варианты в кадре: ${inf.parts.map((p) => `<span class="num">${esc(p.name)}</span> ${nf(p.tris)}`).join(' · ')}. Бюджет считается на один проп.</p>` : '';
    const kit = m.isKit ? `<p class="note" style="margin:8px 0 0">Файл набора: <span class="num">${esc(m.kit)}.glb</span>, ${nf(m.bytes / 1024)} КБ. Проп стоит на полу, пол — код игры.</p>` : (m.glbFile ? `<p class="note" style="margin:8px 0 0">Файл: <span class="num">${esc(m.glbFile.replace('models/', ''))}</span>, ${nf(m.bytes / 1024)} КБ.</p>` : '');
    const pv = m.prevAll && m.prevAll.length > 1 ? `<div class="pvstrip">${m.prevAll.map((f) => `<img src="${esc(f)}" alt="Превью из Blender: ${esc(f.split('/').pop())}" loading="lazy" decoding="async">`).join('')}</div>` : '';
    minfo.innerHTML = `<h3>${esc(m.name)}</h3><span class="pill">${grp}${m.tier ? ' · ' + m.tier : m.sub ? ' · ' + m.sub : ''}</span><span class="pill ${m.state === 'ready' ? 'turq' : 'dim'}">${m.state === 'ready' ? 'готова' : 'в работе'}</span><span class="budget">${t ? nf(t) + ' треуг.' : 'треугольников: —'} из ~${nf(m.budget)}<i><b class="${t && t > m.budget ? 'over' : ''}" style="width:${pct}%"></b></i></span>${parts}${kit}${pv}`;
  }
  view.hooks.push(drawInfo);
  list.addEventListener('click', (e) => { const b = e.target.closest('.mitem'); if (!b) return; cur = b.dataset.id; show(); });
  show();
  window.__selectModel = (id) => { cur = id; show(); const d = $('.mitem[aria-pressed="true"]', list); if (d && d.closest('details')) d.closest('details').open = true; };
}

/* ---- 17. АРТ --------------------------------------------------------- */
function initGallery() {
  const g = $('#gallery'), lb = $('#lightbox'), img = $('#lbimg'), cap = $('#lbcap'); let idx = 0, opener = null;
  g.innerHTML = ART.map(([f, t, d], i) => `<button type="button" class="gal" data-i="${i}" aria-label="Открыть крупно: ${esc(t)}"><img src="art/${f}.jpg" alt="${esc(t)}. ${esc(d)}" loading="lazy" decoding="async"><span class="cap"><b>${esc(t)}</b>${esc(d)}</span></button>`).join('');
  const show = (i) => { idx = (i + ART.length) % ART.length; const [f, t, d] = ART[idx]; img.src = `art/${f}.jpg`; img.alt = t + '. ' + d; cap.innerHTML = `<b>${esc(t)}</b>${esc(d)} <span class="note">(${idx + 1} из ${ART.length})</span>`; };
  const open = (i, from) => { opener = from; show(i); lb.classList.add('open'); document.body.style.overflow = 'hidden'; $('#lbclose').focus(); };
  const close = () => { lb.classList.remove('open'); document.body.style.overflow = ''; if (opener) opener.focus(); };
  g.addEventListener('click', (e) => { const b = e.target.closest('.gal'); if (b) open(+b.dataset.i, b); });
  $('#lbclose').addEventListener('click', close); $('#lbprev').addEventListener('click', () => show(idx - 1)); $('#lbnext').addEventListener('click', () => show(idx + 1));
  lb.addEventListener('click', (e) => { if (e.target === lb) close(); });
  addEventListener('keydown', (e) => { if (!lb.classList.contains('open')) return; if (e.key === 'Escape') close(); if (e.key === 'ArrowLeft') show(idx - 1); if (e.key === 'ArrowRight') show(idx + 1); });
}

/* ---- 18. РЕШЕНИЯ ----------------------------------------------------- */
const QS = [
  { n: 1, q: 'Когда выбирать улучшения?', why: 'Влияет на ритм боя и на будущий кооператив.', opts: [['а', 'Карточки в передышке, а новый уровень в волне копится звездой ★', 'Рекомендуем. Бой не рвётся паузами, и схема уже готова к кооперативу.'], ['б', 'Сразу при новом уровне, с паузой, как в Vampire Survivors', 'Привычно, но пауза каждые 15–25 с и для кооператива не годится.']] },
  { n: 2, q: 'Как приходит эволюция оружия?', why: 'Оружие 7-го уровня + нужная пассивка.', opts: [['а', 'Золотая карточка в ближайшей передышке', 'Рекомендуем. Игрок видит подсказку заранее и может готовиться.'], ['б', 'Выпадает из сундука', 'Случайнее и интереснее, но можно не дождаться.']] },
  { n: 3, q: 'Что делать, если пропала связь?', why: 'Решение владельца из брифа.', opts: [['а', 'Сразу засчитать отбитые волны', 'Рекомендуем, так решил владелец. Текущая волна не в счёт.'], ['б', 'Держать забег на паузе 60 с, чтобы переподключиться', 'Добрее к игроку, но забег висит на сервере.']] },
  { n: 4, q: 'Какие дополнительные постройки добавить?', why: 'Отметь любые. То же самое можно отметить в разделе 10.', ex: true },
  { n: 5, q: 'Варенье на полу замедляет...', why: 'Лужи и реки в варенных жилах.', opts: [['а', 'Только героя', 'Рекомендуем. Жилы становятся опасными, а войска Барона там как дома.'], ['б', 'Всех', 'Проще объяснить, но жилы перестают быть опасными.']] },
  { n: 6, q: 'Рывок перелетает провалы до 5 м?', why: 'Герой уходит через яму, орда идёт в обход.', opts: [['а', 'Да', 'Рекомендуем. Появляется ещё один способ выйти из окружения.'], ['б', 'Нет', 'Проще, провалы — настоящие стены.']] },
  { n: 7, q: 'Где вход в Подземелье на главной площади?', why: 'Скала с пещерой и доска рекордов рядом.', opts: [['а', 'Западная лужайка', 'Рекомендуем. Зев смотрит на точку появления, пути к аквапарку и маяку свободны.'], ['б', 'Другое место', 'Скажи в чате, куда. Площадь скоро перестраивают, нужно пятно 7 × 7 м.']] },
];
const OWN = [
  ['Камера по левел-дизайну', 'В кадре ~36 × 23,5 м (с учётом наклона 62°). Враги рождаются в полосе 4–9 м за краем экрана, а не в круге.'],
  ['Алтари', '5 мест на карте, активны 4 по очереди. Руны на пустом месте погашены.'],
  ['Враги впереди', '40 % врагов рождается по ходу движения героя: бег по прямой не спасает. Среднее между 30 % в геймдизайне и 55 % в левел-дизайне.'],
  ['Щитожук', 'Жук-щитоносец называется «Щитожук»: в «Крепости» уже есть «Щитоносец», чтобы не путать.'],
];
function initDecide() {
  const KEY = 'dg-answers-v1';
  const st = { a: {}, ex: null };
  QS.forEach((q) => { if (q.opts) st.a[q.n] = q.opts[0][0]; });
  try { const saved = JSON.parse(localStorage.getItem(KEY) || 'null'); if (saved) { Object.assign(st.a, saved.a || {}); if (Array.isArray(saved.ex)) { EXSTATE.set.clear(); saved.ex.forEach((id) => EXSTATE.set.add(id)); } } } catch (e) { /* без хранилища тоже работает */ }
  const qs = $('#qs');
  qs.innerHTML = QS.map((q) => `<div class="q" id="q${q.n}"><h4><i>${q.n}</i>${q.q}</h4><p class="why">${q.why}</p>` + (q.opts ? `<div class="opts" role="radiogroup" aria-label="${esc(q.q)}">${q.opts.map(([k, t, s], i) => `<label class="opt1"><input type="radio" name="q${q.n}" value="${k}" ${st.a[q.n] === k ? 'checked' : ''}><span class="tx"><b>${k})</b> ${t}${i === 0 ? ' <span class="pill turq rec">рекомендуем</span>' : ''}<small>${s}</small></span></label>`).join('')}</div>` : `<div class="xs">${EXTRAS.map((e) => `<label class="opt1"><input type="checkbox" data-ex="${e.id}"><span class="tx">${e.name}${e.rec ? ' <span class="pill turq rec">рекомендуем</span>' : ''}<small>${e.fun}</small></span></label>`).join('')}</div>`) + '</div>').join('');
  const out = $('#answer');
  const text = () => { const nums = QS.filter((q) => q.opts).map((q) => q.n + st.a[q.n]).join(' '); const ex = EXTRAS.filter((e) => EXSTATE.set.has(e.id)).map((e) => e.short); return `${nums}, постройки (4): ${ex.length ? ex.join(', ') : 'без дополнительных'}`; };
  const syncEx = () => { $$('input[data-ex]', qs).forEach((i) => { i.checked = EXSTATE.set.has(i.dataset.ex); i.closest('.opt1').classList.toggle('chk', i.checked); }); upd(); };
  function upd() {
    $$('.opt1', qs).forEach((l) => { const i = $('input', l); l.classList.toggle('chk', i.checked); });
    out.textContent = text();
    try { localStorage.setItem(KEY, JSON.stringify({ a: st.a, ex: [...EXSTATE.set] })); } catch (e) { /* ок */ }
  }
  EXSTATE.subs.push(syncEx);
  qs.addEventListener('change', (e) => { const t = e.target; if (t.type === 'radio') { st.a[+t.name.slice(1)] = t.value; upd(); } else if (t.dataset.ex) setExtra(t.dataset.ex, t.checked); });
  EXSTATE.subs.forEach((f) => f());
  const msg = $('#copied');
  $('#copy').addEventListener('click', async () => {
    const s = out.textContent;
    try { await navigator.clipboard.writeText(s); msg.textContent = 'Скопировано. Вставь в чат.'; }
    catch (e) {
      const r = document.createRange(); r.selectNodeContents(out); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      let ok = false; try { ok = document.execCommand('copy'); } catch (e2) { /* нет */ }
      msg.textContent = ok ? 'Скопировано. Вставь в чат.' : 'Текст выделен: нажми Ctrl+C (на Mac Cmd+C).';
    }
    setTimeout(() => { msg.textContent = ''; }, 5000);
  });
  $('#reset').addEventListener('click', () => { QS.forEach((q) => { if (q.opts) { st.a[q.n] = q.opts[0][0]; $$(`input[name="q${q.n}"]`, qs).forEach((i) => { i.checked = i.value === st.a[q.n]; }); } }); EXSTATE.set.clear(); EXTRAS.filter((e) => e.rec).forEach((e) => EXSTATE.set.add(e.id)); EXSTATE.subs.forEach((f) => f()); upd(); });
  $('#own').innerHTML = OWN.map(([t, d]) => `<div class="card"><b>${t}</b>${d}</div>`).join('');
}

/* ---- ЗАПУСК ---------------------------------------------------------- */
async function main() {
  try {
    const [D, L, B, MF] = await Promise.all([
      loadJSON('data/design-data.json'), loadJSON('data/level-data.json'),
      loadJSON('data/balance-40.json').then((j) => j.rows).catch(() => null),
      loadJSON('models/manifest.json').catch(() => null),
    ]);
    S.D = D; S.L = L; S.B = B; S.MF = MF;
  } catch (e) {
    console.error('[Подземелье] данные не загрузились', e);
    $('#top').insertAdjacentHTML('beforeend', `<div class="err" role="alert" style="margin-top:14px"><b>Данные не загрузились.</b> Страница читает <code>data/design-data.json</code> и <code>data/level-data.json</code>. Если открыл файл напрямую с диска, запусти <code>node tools/survivors/page/serve.mjs</code> и открой http://localhost:3103/. Если это публикация — файлы данных не приложены.</div>`);
    safe('nav', initNav); safe('controls', initControls); safe('gallery', initGallery);
    return;
  }
  if (!S.B) S.B = S.D.balanceSnapshot.rows;
  resolveModels();
  [['nav', initNav], ['header', initHeader], ['controls', initControls], ['hero', initHero], ['heroView', initHeroBossViews], ['arena', initArena], ['weapons', initWeapons], ['pick', initPick], ['bestiary', initBestiary], ['waves', initWaves], ['boss', initBoss], ['map', initMap], ['wrapdemo', initWrapDemo], ['buildings', initBuildings], ['rewards', initRewards], ['hud', initHud], ['models', initModels], ['gallery', initGallery], ['decide', initDecide]]
    .forEach(([n, f]) => safe(n, f));
  if (location.hash) { const el = document.getElementById(location.hash.slice(1)); if (el) setTimeout(() => el.scrollIntoView(), 50); }
}
main();

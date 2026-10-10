
/* ---- 8. ОПЫТ И КАРТОЧКИ ---------------------------------------------- */
function initPick() {
  const D = S.D, WP = wById(), PS = pById(), host = $('#pick'), U = D.levelUp;
  let st, banishMode = false, visible = false;
  const fresh = () => ({ owned: { lantern: 3, embers: 2, might: 1 }, evo: false, evoDone: false, total: 3, i: 0, rerolls: U.rerolls, banish: U.banishes, banned: new Set(), level: 4, xp: 0.35, cards: [], done: false, picked: -1 });
  const cnt = (type) => Object.keys(st.owned).filter((id) => (type === 'w' ? WP[id] : PS[id])).length;
  function gen() {
    const pool = [];
    for (const w of D.weapons) { if (st.banned.has(w.id)) continue; const lv = st.owned[w.id]; if (lv) { if (lv < 7) pool.push({ kind: 'w', id: w.id, from: lv, to: lv + 1, wt: 1 }); } else if (cnt('w') < D.hero.slots.weapons) pool.push({ kind: 'w', id: w.id, to: 1, isNew: true, wt: 0.8 }); }
    for (const p of D.passives) { if (st.banned.has(p.id)) continue; const lv = st.owned[p.id]; if (lv) { if (lv < p.max) pool.push({ kind: 'p', id: p.id, from: lv, to: lv + 1, wt: 1 }); } else if (cnt('p') < D.hero.slots.passives) pool.push({ kind: 'p', id: p.id, to: 1, isNew: true, wt: 0.8 }); }
    const out = [];
    if (st.evo && !st.evoDone) out.push({ kind: 'evo', id: 'lantern_evo' });
    while (out.length < 3 && pool.length) { const tot = pool.reduce((a, c) => a + c.wt, 0); let r = Math.random() * tot, k = 0; while (k < pool.length - 1 && (r -= pool[k].wt) > 0) k++; out.push(pool.splice(k, 1)[0]); }
    // первая передышка: минимум 2 новых оружия, если они есть
    st.cards = out;
  }
  function cardHtml(c, idx) {
    let ico, name, lvl, txt, cls = 'ucard';
    if (c.kind === 'evo') { const e = D.evolutions.find((x) => x.id === c.id); ico = e.icon; name = e.name; lvl = '<span class="pill gold">Эволюция</span>'; txt = e.desc; cls += ' evo'; }
    else if (c.kind === 'w') { const w = WP[c.id]; ico = w.icon; name = w.name; lvl = c.isNew ? '<span class="lv">Ур. 1</span>' : `<span class="lv">Ур. ${c.from} → ${c.to}</span>`; txt = c.isNew ? w.desc : w.levels[c.to - 1].up + '.'; }
    else { const p = PS[c.id]; ico = p.icon; name = p.name; lvl = c.isNew ? '<span class="lv">Ур. 1</span>' : `<span class="lv">Ур. ${c.from} → ${c.to}</span>`; txt = p.text; }
    return `<button type="button" class="${cls}${st.picked === idx ? ' picked' : ''}" data-i="${idx}"><span class="k key">${idx + 1}</span>${c.isNew ? '<span class="new pill turq">Новое</span>' : ''}<span class="ico" aria-hidden="true">${ico}</span><b>${name}</b>${lvl}<p>${txt}</p></button>`;
  }
  function render() {
    const need = 10 * (st.level + 1);
    if (st.done) {
      host.innerHTML = `<div class="done"><b>Карточки выбраны</b><p class="sub" style="margin:0 0 14px">Передышка · через 5 с — в бой · <span class="key" style="min-width:auto;height:auto;padding:1px 8px">Enter</span></p><div class="row" style="justify-content:center"><button class="btn primary" id="pk-again">Ещё раз</button></div></div>`;
      $('#pk-again').addEventListener('click', () => { const keepEvo = st.evo; st = fresh(); st.evo = keepEvo; if (keepEvo) { st.owned.lantern = 7; st.owned.might = 1; } gen(); render(); });
      return;
    }
    host.innerHTML = `<div class="xpbar"><i style="width:${st.xp * 100}%"></i></div><div class="xprow"><span>Ур. ${st.level}</span><span>опыт ${nf(Math.round(st.xp * need))} / ${nf(need)}</span></div>
      <h3>Выбери улучшение</h3><p class="sub">Звезда <b class="num" style="color:var(--gold)">★ ${st.i + 1} из ${st.total}</b>. Время стоит.</p>
      <div class="ucards">${st.cards.map(cardHtml).join('') || '<p class="sub">Карточки кончились.</p>'}</div>
      <div class="foot"><span class="stars" aria-label="Звёзд осталось ${st.total - st.i}">${'★'.repeat(st.total - st.i)}${'☆'.repeat(st.i)}</span>
        <div class="row"><button class="btn small" id="pk-re" ${st.rerolls ? '' : 'disabled'}>Перебросить (${st.rerolls})</button><button class="btn small" id="pk-ban" aria-pressed="${banishMode}" ${st.banish ? '' : 'disabled'}>Убрать (${st.banish})</button></div></div>
      <p class="note" style="margin:10px 0 0;min-height:1.5em">${banishMode ? 'Нажми на карточку, которую убрать насовсем.' : 'Клавиши 1, 2, 3 или мышь. «Убрать» выкидывает карточку из колоды до конца забега.'}</p>
      <label class="chip" style="margin-top:6px;cursor:pointer"><input type="checkbox" id="pk-evo" ${st.evo ? 'checked' : ''} style="accent-color:var(--gold)"> Показать золотую эволюцию (Фонарь 7 + Фитиль)</label>`;
    $$('.ucard', host).forEach((b) => b.addEventListener('click', () => choose(+b.dataset.i)));
    $('#pk-re').addEventListener('click', () => { if (!st.rerolls) return; st.rerolls--; gen(); render(); });
    $('#pk-ban').addEventListener('click', () => { banishMode = !banishMode; render(); });
    $('#pk-evo').addEventListener('change', (e) => { st.evo = e.target.checked; if (st.evo) { st.owned.lantern = 7; st.owned.might = Math.max(1, st.owned.might || 0); } gen(); render(); });
  }
  function choose(i) {
    const c = st.cards[i]; if (!c) return;
    if (banishMode) { if (!st.banish) return; st.banish--; banishMode = false; if (c.kind !== 'evo') st.banned.add(c.id); gen(); render(); return; }
    st.picked = i; if (c.kind === 'evo') { st.evoDone = true; st.evo = false; } else st.owned[c.id] = c.to;
    const nodes = $$('.ucard', host); nodes.forEach((n, k) => n.classList.toggle('picked', k === i));
    setTimeout(() => { st.i++; st.picked = -1; st.level++; st.xp = 0.1 + Math.random() * 0.6; if (st.i >= st.total) st.done = true; else gen(); render(); }, REDUCED ? 0 : 380);
  }
  addEventListener('keydown', (e) => { if (!visible || isEditable(e.target) || st.done) return; if (['Digit1', 'Digit2', 'Digit3'].includes(e.code)) choose(+e.code.slice(-1) - 1); if (e.code === 'Enter' && e.target === document.body) { /* Enter в макете не нужен */ } });
  st = fresh(); gen(); render();
  onVisible(host, (v) => { visible = v; }, '-20% 0px -20% 0px');

  // калькулятор опыта
  const sl = $('#xpL'), out = $('#xpres'), X = D.xp;
  const need = (L) => X.base + (L < 30 ? X.perLevel : X.after30perLevel) * L;
  const upd = () => { const L = +sl.value, n = need(L); let tot = 0; for (let k = 1; k < L; k++) tot += need(k);
    out.innerHTML = `<div class="note">С уровня ${L} на ${L + 1} нужно</div><div class="bigres" style="color:var(--turq-2)">${nf(n)}</div><div class="note">опыта = ${nf(n)} осколков или ${nf(Math.ceil(n / 5))} кристаллов или ${nf(Math.ceil(n / 25))} друз. Всего до уровня ${L}: ${nf(tot)}.</div>`; };
  sl.addEventListener('input', upd); upd();
  const gc = { small: '#5fc4b8', mid: '#8ae6da', big: '#ffb347' };
  $('#gems').innerHTML = X.gems.map((g) => `<div class="gem"><i style="background:${gc[g.id]}"></i><span><b class="num">${g.xp}</b> ${g.name.toLowerCase()} · ${g.color}</span></div>`).join('') + `<div class="note" style="width:100%;margin-top:4px">Формула: ${esc(X.formula)}. Больше ${X.mergeOver} осколков на полу — новые сливаются. В конце волны все осколки сами летят к герою.</div>`;
  $('#cardrules').innerHTML = [...U.rules, `Перебросить — ${U.rerolls} за забег, «Убрать навсегда» — ${U.banishes}; за каждого босса +${U.perBoss.rerolls} и +${U.perBoss.banishes}.`].map((r) => `<li>${esc(r)}</li>`).join('');
}

/* ---- 9. БЕСТИАРИЙ ---------------------------------------------------- */
function mobThumb(id) {
  const m = modelById(id);
  if (m && m.prevFile) return `<img src="${esc(m.prevFile)}" alt="" loading="lazy" decoding="async">`;
  if (m && m.art) return `<div class="crop" style="width:100%;height:100%;border-radius:0;${cropCss(m.art)}"></div>`;
  return `<span class="glyph">${GLYPH_WORM}</span>`;
}
function initBestiary() {
  const D = S.D, M = mobById(), ids = ['rat', 'bat', 'slime', 'shroom', 'beetle', 'spitter', 'barrel', 'shaman', 'larva'];
  let cur = 'rat', wave = 1;
  $('#bgrid').innerHTML = ids.map((id) => { const m = M[id]; return `<button type="button" class="bcard" data-id="${id}" aria-pressed="${id === cur}"><span class="th">${mobThumb(id)}</span><span><b>${m.short === m.name ? m.name : m.name.replace('Жук-щитоносец', 'Щитожук')}</b><span class="m">${nf(m.hp)} HP · ${nf(m.speed, 1)} м/с · ${nf(m.dmg)} ур.</span>${m.tier === 'elite' ? '<br><span class="pill jam" style="margin-top:4px">элита</span>' : m.tier === 'summon' ? '<br><span class="pill" style="margin-top:4px">свита босса</span>' : ''}</span></button>`; }).join('');
  const det = $('#bdetail');
  det.innerHTML = `<div><div class="viewer" id="v-bes"></div><div class="vtools" id="t-bes"></div></div><div id="bright"></div>`;
  const view = createView($('#v-bes')); viewTools(view, $('#t-bes'), false);
  function shell() {
    const m = M[cur];
    $('#bright').innerHTML = `<h3 id="bname"></h3><div id="bpills" class="row" style="margin-bottom:8px"></div><p style="margin:0 0 6px;color:var(--text)" id="bbeh"></p><p class="note" id="btrait" style="margin:0 0 12px"></p>
      <div class="card flat" style="padding:12px 14px"><label class="note" for="bw">Числа на волне: <b class="num" id="bwv" style="color:var(--amber-2)">1</b></label><input type="range" id="bw" min="1" max="10" value="${wave}"><div class="note" id="bmul"></div></div>
      <div class="tiles" id="btiles" style="margin-top:10px"></div>`;
    $('#bw').addEventListener('input', (e) => { wave = +e.target.value; upd(); });
    view.set(modelById(cur));
    upd();
  }
  function upd() {
    const m = M[cur], Wv = D.waves[wave - 1], hpm = Wv.hpMul, dmm = Wv.dmgMul;
    $('#bname').textContent = m.name.replace('Жук-щитоносец', 'Жук-щитоносец («Щитожук»)');
    $('#bpills').innerHTML = `<span class="pill ${m.tier === 'elite' ? 'jam' : ''}">${m.tier === 'elite' ? 'Элита' : m.tier === 'summon' ? 'Свита босса' : 'Рядовой'}</span><span class="pill">с волны ${m.from}</span>${m.flying ? '<span class="pill turq">летает</span>' : ''}${m.chest ? '<span class="pill gold">после смерти сундук</span>' : ''}`;
    $('#bbeh').textContent = m.behavior; $('#btrait').textContent = m.trait;
    $('#bwv').textContent = wave; $('#bmul').textContent = `HP ×${nf(hpm, 2)} · урон ×${nf(dmm, 2)} (+15 % HP и +6 % урона за волну)${m.from > wave ? ' · на этой волне ещё не встречается' : ''}`;
    $('#btiles').innerHTML = [['HP', nf(Math.round(m.hp * hpm))], ['Урон', nf(Math.round(m.dmg * dmm * 10) / 10, 1)], ['Скорость', nf(m.speed, 1) + ' м/с' + (m.dashSpeed ? ' (рывок ' + m.dashSpeed + ')' : '')], ['Опыт', nf(m.xp)], ['Радиус', nf(m.radius, 2) + ' м'], ['HP на 1-й волне', nf(m.hp)]].map(([k, v], i) => `<div class="tile${i < 2 && wave > 1 ? ' up' : ''}"><span>${k}</span><b>${v}</b></div>`).join('');
  }
  $('#bgrid').addEventListener('click', (e) => { const b = e.target.closest('.bcard'); if (!b) return; cur = b.dataset.id; $$('.bcard').forEach((x) => x.setAttribute('aria-pressed', x === b)); shell(); });
  shell();
}

/* ---- 10. ВОЛНЫ ------------------------------------------------------- */
const EVT = { pack: 'стая', swarm: 'налёт', ring: 'кольцо', elite: 'элита', horde: 'орда', boss: 'босс' };
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
function pressInfo(p, boss) { if (boss) return ['boss', 'бой с боссом']; if (p < 0.8) return ['easy', 'легко']; if (p <= 1.05) return ['ok', 'напряжённо']; if (p <= 1.2) return ['hard', 'на пределе']; return ['dead', 'толпа копится']; }
function niceAxis(max) { for (const k of [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000]) if (Math.ceil(max / k) <= 6) return [Math.ceil(max / k) * k, k]; return [max, max / 5]; }
const fmtK = (v) => (v >= 1000 ? nf(v / 1000, 1) + 'к' : String(v));
function waveChart(host, rows, o) {
  const W = 720, H = 330, ml = 56, mr = 50, mt = 20, mb = o.dur ? 54 : 38, pw = W - ml - mr, ph = H - mt - mb, n = rows.length, cw = pw / n, bw = Math.min(46, cw * 0.62);
  const tot = (r) => r.hp + (r.bossHp || 0), [yMax, yStep] = niceAxis(Math.max(...rows.map(tot)));
  const X = (i) => ml + cw * (i + 0.5), Y = (v) => mt + ph * (1 - v / yMax), PY = (v) => mt + ph * (1 - v / o.pMax);
  let g = `<defs><pattern id="hj${o.id}" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="#4a1d5e"/><line x1="0" y1="0" x2="0" y2="7" stroke="#b25fd6" stroke-width="3"/></pattern></defs>`;
  for (let v = 0; v <= yMax + 1e-6; v += yStep) g += `<line class="gl" x1="${ml}" x2="${W - mr}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${ml - 8}" y="${Y(v) + 4}" text-anchor="end">${fmtK(v)}</text>`;
  g += `<text x="${ml - 8}" y="${mt - 6}" text-anchor="end" style="fill:#c98b45">HP</text><text x="${W - mr + 8}" y="${mt - 6}" style="fill:#8ae6da">давл.</text>`;
  g += `<rect x="${ml}" y="${mt}" width="${pw}" height="${Math.max(0, PY(1.2) - mt)}" fill="rgba(238,127,98,.07)"/>`;
  const ticks = [0.8, 1.05, 1.2, ...(o.pMax > 1.5 ? [1.6, 2, 2.4] : [])].filter((t) => t <= o.pMax);
  for (const t of ticks) g += `<line x1="${ml}" x2="${W - mr}" y1="${PY(t)}" y2="${PY(t)}" stroke="#5fc4b8" stroke-opacity="${t === 0.8 || t === 1.05 || t === 1.2 ? 0.45 : 0.18}" stroke-dasharray="4 4"/><text x="${W - mr + 8}" y="${PY(t) + 4}" style="fill:#8ae6da">${nf(t, 2)}</text>`;
  g += `<line class="ax" x1="${ml}" x2="${W - mr}" y1="${mt + ph}" y2="${mt + ph}"/>`;
  let cols = '', pts = [];
  rows.forEach((r, i) => {
    const x = X(i), boss = !!r.bossHp; let b = '';
    if (boss) { b += `<rect class="bar boss" x="${x - bw / 2}" y="${Y(r.bossHp)}" width="${bw}" height="${mt + ph - Y(r.bossHp)}" fill="url(#hj${o.id})"/>`; b += `<rect class="bar" x="${x - bw / 2}" y="${Y(tot(r))}" width="${bw}" height="${Math.max(1, Y(r.bossHp) - Y(tot(r)))}"/>`; }
    else b += `<rect class="bar" x="${x - bw / 2}" y="${Y(r.hp)}" width="${bw}" height="${mt + ph - Y(r.hp)}"/>`;
    const py = PY(Math.min(r.pressure, o.pMax));
    cols += `<g class="col" data-w="${r.w}" tabindex="0" role="button" aria-label="Волна ${r.w}: HP ${nf(r.hp + (r.bossHp || 0))}, давление ${nf(r.pressure, 2)}${boss ? ', босс' : ''}"><rect class="hit" x="${ml + cw * i}" y="${mt}" width="${cw}" height="${ph + (o.dur ? 40 : 24)}" rx="6"/>${b}<circle class="dot" cx="${x}" cy="${py}" r="${boss ? 4 : 4.6}" ${boss ? 'style="stroke-dasharray:2 2"' : ''}/><text x="${x}" y="${mt + ph + 17}" text-anchor="middle" style="fill:var(--text-2);font-size:12px">${r.w}</text>${o.dur ? `<text x="${x}" y="${mt + ph + 31}" text-anchor="middle" style="font-size:10px">${r.dur ? (boss ? '~' : '') + Math.round(r.dur) + ' с' : ''}</text>` : ''}</g>`;
    pts.push(boss ? null : [x, py]);
  });
  let line = '', seg = [];
  pts.concat([null]).forEach((p) => { if (p) seg.push(p); else { if (seg.length > 1) line += `<polyline class="line" points="${seg.map((q) => q.join(',')).join(' ')}"/>`; seg = []; } });
  g += line + cols;
  g += `<text x="${ml + pw / 2}" y="${H - 4}" text-anchor="middle">волна${o.dur ? ' · секунд на волну' : ''}</text>`;
  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="group" aria-label="${esc(o.label)}">${g}</svg><div class="tip"></div>`;
  const tip = $('.tip', host), svg = $('svg', host);
  const cs = $$('.col', host);
  const select = (w) => { cs.forEach((c) => c.classList.toggle('sel', +c.dataset.w === w)); o.onSelect(w); };
  cs.forEach((c, i) => {
    const r = rows[i];
    c.addEventListener('click', () => select(r.w));
    c.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(r.w); } if (e.key === 'ArrowRight' && cs[i + 1]) cs[i + 1].focus(); if (e.key === 'ArrowLeft' && cs[i - 1]) cs[i - 1].focus(); });
    const show = (e) => { const hb = host.getBoundingClientRect(), cb = c.getBoundingClientRect(); const [, lab] = pressInfo(r.pressure, !!r.bossHp); tip.innerHTML = `<b>Волна ${r.w}</b><span>HP <span>${nf(r.hp + (r.bossHp || 0))}</span></span><span>давление <span>${nf(r.pressure, 2)}</span></span><span>${esc(lab)}</span>`; tip.style.display = 'block'; const left = cb.left - hb.left + host.scrollLeft + cb.width / 2 - tip.offsetWidth / 2; tip.style.left = clamp(left, 4, host.scrollWidth - tip.offsetWidth - 4) + 'px'; tip.style.top = Math.max(4, cb.top - hb.top + 30) + 'px'; };
    c.addEventListener('pointerenter', show); c.addEventListener('focus', show);
    c.addEventListener('pointerleave', () => { tip.style.display = 'none'; }); c.addEventListener('blur', () => { tip.style.display = 'none'; });
  });
  return { select };
}
function initWaves() {
  const D = S.D, M = mobById(), rows = S.B && S.B.length ? S.B : D.balanceSnapshot.rows, R = (w) => rows.find((r) => r.w === w);
  const first = rows.filter((r) => r.w <= 10), endless = rows.filter((r) => r.w >= 11 && r.w <= 25);
  const dot = (id) => { const m = modelById(id); const sp = m && (m.prevFile ? `<img src="${esc(m.prevFile)}" alt="" style="width:100%;height:100%;object-fit:cover">` : m.art ? `<div class="crop" style="width:100%;height:100%;border-radius:0;${cropCss(m.art)}"></div>` : ''); return `<span class="mobdot">${sp || `<span class="glyph">${GLYPH_WORM}</span>`}</span>`; };
  const tel = D.waveRules.eventsTelegraph;
  function showFirst(w) {
    const W = D.waves[w - 1], r = R(w), [pc, pl] = pressInfo(r.pressure, !!W.boss), host = $('#wdet');
    const comp = Object.entries(W.mobs).map(([id, n]) => `<div class="r">${dot(id)}<span>${M[id].short}</span><span class="cnt">${nf(n)}</span></div>`).join('') + Object.entries(W.elites || {}).map(([id, n]) => `<div class="r">${dot(id)}<span>${M[id].name} <span class="pill jam">элита</span></span><span class="cnt">${n}</span></div>`).join('');
    const evs = W.events.filter((e) => e.type !== 'boss');
    const tl = W.dur ? `<div class="tline" aria-hidden="true">${evs.map((e, i) => `<span class="ev ${e.type}" style="left:${clamp(e.at / W.dur * 100, 4, 96)}%;top:${i % 2 ? 72 : 28}%">${EVT[e.type]}${e.n > 1 ? ' ' + e.n : ''}</span>`).join('')}${[0, 0.25, 0.5, 0.75, 1].map((q) => `<span class="tk" style="left:${q * 100}%">${mmss(q * W.dur)}</span>`).join('')}</div>` : '';
    host.innerHTML = W.boss ? `<div><h3>Волна ${w} · ${D.boss.name}</h3><p>Таймера нет: пока жив босс. С 3:00 он в ярости. Фоном — ${W.mobs.rat} крыс и личинки из его свиты.</p><div class="tiles"><div class="tile"><span>HP босса</span><b>${nf(D.boss.hp)}</b></div><div class="tile"><span>Бой ≈</span><b>${nf(r.dur - 8)} с</b></div><div class="tile"><span>Урон героя/с по цели</span><b>${nf(r.bossDps)}</b></div><div class="tile"><span>Уровень героя</span><b>${r.level}</b></div></div><p style="margin-top:10px"><span class="press boss">${pl}</span> <a href="#boss">Подробно про босса</a></p></div><div><h4>Фоном</h4><div class="comp">${comp}</div></div>`
      : `<div><h3>Волна ${w} · ${W.dur} с</h3><div class="comp">${comp}</div>
        <div class="tiles" style="margin-top:12px"><div class="tile"><span>Тел (без слизнят)</span><b>${nf(r.bodies)}</b></div><div class="tile"><span>HP волны</span><b>${nf(r.hp)}</b></div><div class="tile"><span>Мин. живых</span><b>${W.minAlive}</b></div><div class="tile"><span>Урон героя/с</span><b>${nf(r.heroDps)}</b></div><div class="tile"><span>Уровень героя</span><b>${r.level}</b></div><div class="tile"><span>Конец волны, мин</span><b>${nf(r.minutes, 1)}</b></div></div>
        <p style="margin:10px 0 0">Давление <b class="num">${nf(r.pressure, 2)}</b> <span class="press ${pc}">${pl}</span></p></div>
        <div><h4>События</h4>${tl}<ul class="evlist">${evs.map((e) => `<li><span class="at">${mmss(e.at)}</span><span>${esc(e.text)}${e.n > 1 && e.type !== 'elite' ? ` (${e.n})` : ''}<br><span class="note">${esc(tel[e.type] || '')}</span></span></li>`).join('')}</ul></div>`;
  }
  function showEnd(w) {
    const r = R(w), E = D.endless, boss = !!r.bossHp, [pc, pl] = pressInfo(r.pressure, boss), host = $('#wdet2');
    const mix = w <= 20 ? E.mixes[(w - 11) % E.mixes.length] : null, bossInfo = E.bosses.find((b) => b.w === w);
    const ne = boss ? 0 : 1 + Math.floor((w - 10) / 4);
    const share = mix ? Object.entries(mix.share).map(([id, s]) => `<div class="r">${dot(id)}<span>${M[id].short}</span><span class="cnt">${Math.round(s * 100)} %</span></div>`).join('') : '<p class="note">После 20-й смесь случайная из шести, не две одинаковых подряд.</p>';
    host.innerHTML = `<div><h3>Волна ${w}${mix ? ' · ' + mix.name : boss ? '' : ' · случайная смесь'}${boss && bossInfo ? ' · ' + bossInfo.name : ''}</h3>${boss && bossInfo ? `<p>${esc(bossInfo.how)}</p>` : ''}<div class="comp">${boss ? '' : share}</div><div class="tiles" style="margin-top:12px"><div class="tile"><span>${boss ? 'HP босса' : 'Тел'}</span><b>${nf(boss ? r.bossHp : r.bodies)}</b></div><div class="tile"><span>${boss ? 'HP фона' : 'HP волны'}</span><b>${nf(r.hp)}</b></div><div class="tile"><span>${boss ? 'Бой ≈' : 'Секунд'}</span><b>${boss ? nf(r.dur - 8) : r.dur} с</b></div><div class="tile"><span>Урон героя/с</span><b>${nf(boss ? r.bossDps : r.heroDps)}</b></div><div class="tile"><span>Уровень героя</span><b>${r.level}</b></div><div class="tile"><span>Конец волны, мин</span><b>${nf(r.minutes, 1)}</b></div></div><p style="margin:10px 0 0">Давление <b class="num">${nf(r.pressure, 2)}</b> <span class="press ${pc}">${pl}</span></p></div>
      <div><h4>Что ещё</h4><ul class="evlist"><li><span>${boss ? 'На боссовой волне нет элит и событий: бой с червём.' : `Элит: ${ne}${w % 5 === 0 ? ' (Бочар и Шаман вместе)' : ''}.`}</span></li><li><span>${esc(E.events)}.</span></li><li><span>Жетонов за волну: ${r.tokens}.</span></li><li><span>${esc(E.overCap)}.</span></li></ul></div>`;
  }
  const c1 = waveChart($('#chart1'), first, { id: 'a', label: 'HP волны и давление, волны 1–10', pMax: 1.3, dur: true, onSelect: showFirst });
  const c2 = waveChart($('#chart2'), endless, { id: 'b', label: 'HP волны и давление, волны 11–25', pMax: 2.4, dur: true, onSelect: showEnd });
  const det2 = document.createElement('div'); det2.className = 'wdet card'; det2.id = 'wdet2'; det2.setAttribute('aria-live', 'polite'); det2.style.marginTop = '14px'; $('#chart2').after(det2);
  c1.select(1); c2.select(15);
  // докуда доходят
  const ER = D.endless.expectedReach, seg = [['новичок', ER.new, '#8fa35a'], ['средний', ER.average, '#ffb347'], ['хороший', ER.good, '#e8863a'], ['лучшие', ER.best, '#ffd35a']];
  const parse = (s) => s.split('–').map(Number);
  const maxW = 30; const reach = $('#reach'); reach.style.cssText = 'position:relative;height:36px;margin-top:12px';
  reach.innerHTML = seg.map(([n, s, c], i) => { const [a, b] = parse(s); return `<span style="position:absolute;top:${i % 2 ? 18 : 0}px;height:18px;left:${(a - 1) / maxW * 100}%;width:${(b - a + 1) / maxW * 100}%;background:${c};border-radius:6px;font:600 10.5px/18px var(--f-mono);color:#1a0f08;text-align:center;white-space:nowrap;overflow:hidden">${n} ${s}</span>`; }).join('');
  $('#endnote').innerHTML = `Докуда доходят: новичок ${ER.new}, средний ${ER.average}, хороший ${ER.good}, лучшие ${ER.best} волны (полоски сверху на шкале 1–30). ${esc(ER.note)}.`;
}

/* ---- 11. БОСС -------------------------------------------------------- */
function telIcon(id) {
  const c = '#b25fd6', f = 'rgba(178,95,214,.28)';
  const pulse = (inner) => `<svg class="tel" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="#1b1310" stroke="#3a2c23"/><g class="pulse">${inner}</g></svg>`;
  if (/burrow/.test(id)) return pulse(`<circle cx="32" cy="32" r="26" fill="${f}" stroke="${c}" stroke-width="2.5"/><path d="M32 32 L20 14 M32 32 L48 20 M32 32 L50 44 M32 32 L16 46" stroke="${c}" stroke-width="2" fill="none"/>`);
  if (id === 'tail') return pulse(`<path d="M32 32 L6 32 A26 26 0 0 0 58 32 Z" fill="rgba(238,127,98,.3)" stroke="#ee7f62" stroke-width="2.5"/>`);
  if (id === 'cavein') return pulse([[18, 20], [44, 16], [32, 32], [14, 44], [48, 42], [30, 52]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6" fill="${f}" stroke="${c}" stroke-width="2"/>`).join(''));
  const n = id === 'spit5' ? 5 : 3; return pulse(Array.from({ length: n }, (_, k) => { const a = (k - (n - 1) / 2) * 0.55 - Math.PI / 2; return `<circle cx="${32 + 20 * Math.cos(a)}" cy="${36 + 20 * Math.sin(a)}" r="${n === 5 ? 6 : 8}" fill="${f}" stroke="${c}" stroke-width="2"/>`; }).join(''));
}
function initBoss() {
  const D = S.D, B = D.boss, rows = S.B || [], r = (w) => rows.find((x) => x.w === w);
  const v = createView($('#v-boss'), { art: ['4-elites-boss', .30, 0, .46, .69] }); viewTools(v, $('#t-boss'), false); v.set(modelById('povidl'));
  const fight = r(10) ? r(10).dur - 8 : 100;
  $('#bossstats').innerHTML = [[nf(B.hp) + ' HP', 'здоровье, касание ' + B.contactDmg + ' урона'], ['~' + nf(B.targetFight[0]) + '–' + nf(B.targetFight[1]) + ' с', 'бой по модели, над землёй ~60 % времени'], ['с ' + mmss(B.enrageAt), 'ярость: паузы между атаками вдвое короче'], ['+25 🪙', 'и большой сундук (3 уровня), магнит, похлёбка, +' + B.xp + ' опыта']].map(([b, s]) => `<div class="stat"><b style="font-size:21px">${b}</b><span>${s}</span></div>`).join('');
  let cur = 0;
  const tabs = $('#phtabs'), body = $('#phbody'), band = $('#hpband');
  tabs.innerHTML = B.phases.map((p, i) => `<button role="tab" type="button" aria-selected="${i === 0}" data-i="${i}">Фаза ${p.n}</button>`).join('');
  band.innerHTML = B.phases.map((p, i) => `<span class="f${p.n}" data-i="${i}">${Math.round(p.hpFrom * 100)}–${Math.round(p.hpTo * 100)} %</span>`).join('');
  function show(i) {
    cur = i; const p = B.phases[i];
    $$('button', tabs).forEach((b, k) => b.setAttribute('aria-selected', k === i)); $$('span', band).forEach((s, k) => s.classList.toggle('cur', k === i));
    const sm = p.summons;
    body.innerHTML = (p.transition ? `<p class="note" style="margin:0 0 10px"><b style="color:var(--text)">Переход:</b> ${esc(p.transition)}</p>` : '') +
      p.attacks.map((a) => `<div class="atk">${telIcon(a.id)}<div><h4>${esc(a.name)}</h4><p>${esc(a.telegraph)}</p><div class="nums"><span class="pill amber">урон ${a.dmg}</span>${a.radius ? `<span class="pill">радиус ${nf(a.radius, 1)} м</span>` : ''}${a.n ? `<span class="pill">кругов ${a.n}</span>` : ''}${a.knockback ? `<span class="pill">отброс ${a.knockback} м</span>` : ''}${a.puddle ? `<span class="pill">лужа ${a.puddle.time} с, −${Math.round(a.puddle.slow * 100)} % скорости</span>` : ''}</div>${a.window ? `<div class="window"><b>Окно для урона:</b> ${esc(a.window)}</div>` : ''}</div></div>`).join('') +
      `<div class="summon"><b>Призыв:</b> раз в ${sm.every} с — ${sm.n} личинок${sm.telegraph ? '. ' + esc(sm.telegraph) : ''}. Между атаками пауза ${nf(p.pause, 1)} с${p.speedMul ? `, босс быстрее ×${p.speedMul}` : ''}.</div>`;
  }
  tabs.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) show(+b.dataset.i); });
  band.addEventListener('click', (e) => { const s = e.target.closest('span'); if (s) show(+s.dataset.i); });
  tabs.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') show(Math.min(2, cur + 1)); if (e.key === 'ArrowLeft') show(Math.max(0, cur - 1)); });
  show(0);
  const hp = (w) => (r(w) && r(w).bossHp) || null;
  $('#bosstable').innerHTML = `<thead><tr><th>Волна</th><th>Босс</th><th class="n">HP</th><th class="n">Бой</th><th>Чем отличается</th></tr></thead><tbody>${D.endless.bosses.map((b) => `<tr><td class="n">${b.w}</td><td><b>${esc(b.name)}</b></td><td class="n">${hp(b.w) ? nf(hp(b.w)) + (b.w === 30 ? ' (на двоих)' : '') : 'по формуле'}</td><td class="n">${r(b.w) ? '~' + nf(r(b.w).dur - 8) + ' с' : '—'}</td><td>${esc(b.how)}</td></tr>`).join('')}</tbody>`;
  $('#bosstable').insertAdjacentHTML('afterend', `<p class="note" style="margin-top:8px">${esc(D.endless.bossHpScale)}.</p>`);
}

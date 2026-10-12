import { h, mdBlock, mdNumbered, mdBullets, spanMd, acc, state, nf } from '../lib.js';

const ICONS = ['👀', '💡', '🖱️', '✨', '🔁'];

const secs = (t) => {
  const m = String(t).match(/(\d+):(\d+)/);
  if (m) return +m[1] * 60 + +m[2];
  const r = String(t).match(/(\d+)/);
  return r ? +r[1] * 60 : 0;
};

export function mount(root, { data, go }) {
  const P = data.path;
  root.appendChild(h('div.sec-head', h('div.eyebrow', 'Путь игрока'), h('h2', 'Узнал → понял → сделал → результат → ещё'), h('p', 'Как новичок находит ферму, понимает её за минуту, получает первый урожай и хочет вернуться. Ниже — те же шаги и первые десять минут по секундам.')));

  // ───── пять ступеней ─────
  if (P.steps.length) {
    const panel = h('div.card.step-panel');
    const steps = P.steps.map((s, i) => h('button.step', { type: 'button', role: 'tab', 'aria-selected': 'false', onclick: () => select(i) }, h('div.dot', ICONS[i] || '•'), h('b', s.step), h('small', `шаг ${i + 1}`)));
    const select = (i) => {
      steps.forEach((b, k) => b.setAttribute('aria-selected', String(k === i)));
      panel.replaceChildren(h('div.eyebrow', `Шаг ${i + 1} · ${P.steps[i].step}`), h('div.md', { html: spanMd(P.steps[i].text) }));
      panel.style.animation = 'none'; panel.offsetHeight; panel.style.animation = '';
    };
    root.appendChild(h('div.block', h('div.stepper', { role: 'tablist' }, steps), panel));
    select(0);
  }

  // ───── столпы ─────
  const pillars = mdNumbered(data.cover.pillars);
  if (pillars.length) {
    root.appendChild(h('div.block', h('h3', 'Пять столпов режима'), h('div.about', pillars.map((p, i) => h('div.card', h('div.eyebrow', `Столп ${i + 1}`), h('h4', { style: 'color:var(--ink);font-size:1.02rem' }, p.title), h('p.small', { style: 'margin:0', html: spanMd(p.text) }))))));
  }

  // ───── первые 10 минут ─────
  const F = P.first10;
  if (F) {
    const items = F.rows.map((r, i) => {
      const li = h('li.tl-item', { onclick: () => setOn(i) },
        h('div.tl-time', r.time.replace('–', '–')),
        h('div.tl-dot'),
        h('div.tl-card',
          r.phrase && r.phrase !== '—' ? h('div.bubble', { html: spanMd(r.phrase) }) : null,
          h('div.tl-grid',
            h('div', h('div.k', 'Что делает игрок'), h('div', { html: spanMd(r.does) })),
            h('div', h('div.k', 'Отклик и награда'), h('div', { html: spanMd(r.result) })),
          ),
          r.changed ? h('span.tag-chg', 'изм.') : null,
        ),
      );
      return li;
    });
    const head = h('div.row.between', { style: 'margin-bottom:10px' },
      h('div.row', h('button.btn.primary.small', { type: 'button', onclick: play }, '▶ Проиграть'), h('span.small.muted', 'или нажмите на любой шаг')),
      F.tutorialXp ? h('div.row', h('span.chip.green', `обучение: ${nf(F.tutorialXp)} XP`), h('span.chip.gold', `${nf(F.tutorialCoins)} 🪙`)) : null,
    );
    const play$ = h('div.playhead', h('i'));
    let timer = null;
    let cur = -1;
    function setOn(i) {
      cur = i;
      items.forEach((it, k) => it.classList.toggle('on', k === i));
      const total = 600;
      const t = Math.min(total, secs(F.rows[i].time));
      play$.firstChild.style.width = (t / total) * 100 + '%';
    }
    function play() {
      clearInterval(timer);
      let i = 0;
      setOn(0);
      timer = setInterval(() => {
        i++;
        if (i >= items.length) { clearInterval(timer); play$.firstChild.style.width = '100%'; return; }
        setOn(i);
      }, 1500);
    }
    // если абзац «после» уже входит в «до» (разбор документа склеил их), отрезаем повтор по строкам
    const afterFirst = (F.after || '').split('\n')[0].replace(/\s+/g, ' ').slice(0, 30);
    let beforeText = F.before || '';
    if (afterFirst) { const lines = beforeText.split('\n'); const idx = lines.findIndex((l) => l.replace(/\s+/g, ' ').includes(afterFirst)); if (idx > 0) beforeText = lines.slice(0, idx).join('\n').trim(); }
    root.appendChild(h('div.block',
      h('h3', 'Первые 10 минут новичка'),
      F.before ? h('div.callout.gold', mdBlock(beforeText)) : null,
      head, play$,
      h('ol.timeline', { style: 'margin-top:14px' }, items),
      F.after ? h('div.callout.green', mdBlock(F.after)) : null,
    ));
    setOn(0);
  }

  // ───── сессия и ветеран ─────
  const shortSteps = (P.short || '').split('\n').filter((l) => /^\d+\./.test(l)).map((l) => l.replace(/^\d+\.\s*/, ''));
  const vet = mdBullets(P.veteran);
  root.appendChild(h('div.block',
    h('h3', 'Короткий заход и ветеран'),
    h('div.grid.g-2',
      h('div.card.tint-sea', h('h4', { style: 'margin-bottom:.5rem' }, '🕒 Заход на 2–10 минут'), h('ol', { style: 'padding-left:1.2rem;margin:0' }, (P.short || '').split('\n').reduce((acc2, l) => { if (/^\d+\./.test(l)) acc2.push(l.replace(/^\d+\.\s*/, '')); else if (/^\s{2,}\S/.test(l) && acc2.length) acc2[acc2.length - 1] += ' ' + l.trim(); return acc2; }, []).map((t) => h('li', { style: 'margin:.3rem 0', html: spanMd(t) })))),
      h('div.card.tint-terra', h('h4', { style: 'margin-bottom:.5rem' }, '🏅 Ветеран'), h('ul', { style: 'padding-left:1.2rem;margin:0' }, vet.map((v) => h('li', { style: 'margin:.3rem 0', html: `<b>${v.title}.</b> ` + spanMd(v.text) })))),
    ),
  ));

  root.appendChild(h('div.block', h('h3', 'Как игрок находит ферму'), acc('Вход с площади: калитка, телега, подсказки', mdBlock(P.entry), { open: false, chip: '§1.3' })));
  return {};
}

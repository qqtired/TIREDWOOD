// Раздел «Паки вопросов» страницы-обзора «Ракушка»: окно «Ракушка» на ките UI 2.0 с вкладками «Играть» (её показывает раздел
// «Своя игра»), «Паки», «Загрузить», «Новый пак». Каталог, выбор тем, свой формат и НАСТОЯЩИЙ разбор .siq в браузере —
// разбор лежит в siq.js (потом уедет в игру), текстовый формат и CSV — в packtext.js. Классы только pk-*, стили — css/packs.css.
import { h, esc, keyHtml, iconImg, makeStage, sfx, PLAYERS } from './common.js';
import { parseSiq, shrinkImages, fileUrl, releaseFiles, zipWrite, fmtSize, typeLabel, LIMITS, SiqError } from './siq.js';
import { parseAny, SAMPLE_TEXT, countPack, plural } from './packtext.js';

const ME = PLAYERS[0].nick; // Кракозябра — «ты» в этом макете
const NEED_LEVEL = 3;
const DAILY = 5;
const FORMS = {
  theme: ['тема', 'темы', 'тем'], q: ['вопрос', 'вопроса', 'вопросов'], round: ['раунд', 'раунда', 'раундов'],
  time: ['раз', 'раза', 'раз'], file: ['файл', 'файла', 'файлов'], row: ['строка', 'строки', 'строк'],
};
const n = (v, f) => `${v} ${plural(v, f)}`;
const ic = (id, cls = 'k-ic') => iconImg(id, cls);
const THUMB = '<svg class="pk-thumb" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10h3.5v10H3z"/><path d="M8.5 10l3.2-6.3c.3-.6 1-.8 1.6-.5.7.3 1 1 .9 1.7L13.5 9H19c1.2 0 2 1.1 1.7 2.2l-1.6 6.6c-.3 1.2-1.3 2.2-2.6 2.2H8.5z"/></svg>';

// ------------------------------------------------------------------ каталог (демо-данные)

const R = (name, mult, themes) => ({ name, final: false, lo: 100 * mult, hi: 500 * mult, themes: themes.map((t) => ({ name: t, n: 5 })) });
const FIN = (themes) => ({ name: 'Финал', final: true, themes: themes.map((t) => ({ name: t, n: 1 })) });
const seedPacks = () => [
  { id: 'quay', title: 'Набережная', author: 'Затейник', ico: 'lighthouse', builtin: true, plays: 41, likes: 17,
    rounds: [R('Первый раунд', 1, ['Рыбы по силуэту', 'Мобы крепости', 'Подземелье', 'Жители', 'Места', 'Лодки']), R('Второй раунд', 2, ['Крупные рыбы', 'Боссы', 'Режимы', 'Жетоны и уровни', 'Кафе и столы', 'Шторм и пираты']), FIN(['Маяк', 'Желейки', 'Рекорды', 'Пирс', 'Каланча'])] },
  { id: 'kino90', title: 'Кино 90-х', author: 'Оля', ico: 'camera', plays: 3, likes: 9,
    rounds: [R('Раунд 1', 1, ['Боевики', 'Комедии', 'Мультфильмы', 'Саундтреки', 'Актёры', 'Цитаты']), R('Раунд 2', 2, ['Сериалы', 'Видеопрокат', 'Режиссёры', 'Хиты кассы', 'Звёзды', 'Экранизации'])] },
  { id: 'science', title: 'Наука для всех', author: ME, ico: 'journal', plays: 7, likes: 5,
    rounds: [R('Первый раунд', 1, ['Космос', 'Тело человека', 'Химия на кухне', 'Изобретатели', 'Животные']), R('Второй раунд', 2, ['Физика вокруг', 'Математика', 'Земля', 'Динозавры', 'Погода']), FIN(['Нобелевка', 'Числа', 'Открытия'])] },
  { id: 'night', title: 'Ночной клуб — 18+', author: 'Барон', ico: 'music', adult: true, plays: 2, likes: 4,
    rounds: [R('Первый раунд', 1, ['Коктейли', 'Хиты 2000-х', 'Танцпол', 'Диджеи', 'Караоке']), R('Второй раунд', 2, ['Бары мира', 'Тосты', 'Ночная кухня', 'Винная карта', 'Рок-н-ролл'])] },
];
const totals = (p) => ({
  rounds: p.rounds.length,
  themes: p.rounds.reduce((a, r) => a + r.themes.length, 0),
  questions: p.rounds.reduce((a, r) => a + r.themes.reduce((b, t) => b + t.n, 0), 0),
});
const ladder = (r) => (r.final ? 'один вопрос на тему' : `${r.lo}–${r.hi}`);

/** Разобранный пак → строка каталога (число вопросов в темах, вилка цен) */
function toCatalog(pack, ico, id) {
  return {
    id, title: pack.title || 'Мой пак', author: ME, ico, adult: pack.adult, plays: 0, likes: 0, fresh: true,
    rounds: pack.rounds.map((r) => {
      const prices = r.themes.flatMap((t) => t.questions.map((q) => q.price)).filter((x) => x > 0);
      return { name: r.name, final: r.final, lo: Math.min(...prices, Infinity), hi: Math.max(...prices, 0), themes: r.themes.map((t) => ({ name: t.name, n: t.questions.length })) };
    }),
  };
}

// ------------------------------------------------------------------ пример .siq, собранный в браузере

const hex = (s) => [...new TextEncoder().encode(s)].map((b) => `%${b.toString(16).toUpperCase().padStart(2, '0')}`).join('');
/** Короткий звуковой сигнал «ля» (WAV, 440 Гц) — чтобы в примере был настоящий звук */
function beepWav(freq = 440, ms = 600, rate = 8000) {
  const len = Math.round((rate * ms) / 1000);
  const v = new DataView(new ArrayBuffer(44 + len * 2));
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + len * 2, true); str(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, len * 2, true);
  for (let i = 0; i < len; i++) v.setInt16(44 + i * 2, Math.sin((2 * Math.PI * freq * i) / rate) * 9000 * Math.min(1, i / 200, (len - i) / 400), true);
  return new Uint8Array(v.buffer);
}

const samplePack = (demoVideo) => ({
  name: 'Пример для «Ракушки»', author: 'Затейник', date: '29.10.2026',
  rounds: [
    { name: 'Первый раунд', themes: [
      { name: 'Море', qs: [
        { price: 100, text: 'Какая рыба — самая большая в мире?', answers: ['китовая акула'], wrong: ['синий кит', 'белая акула'], comment: 'Она питается планктоном и людям не опасна.' },
        { price: 200, text: 'Сколько рук у осьминога?', answers: ['8', 'восемь'] },
        { price: 300, type: 'cat', catTheme: 'Рыбы', text: 'Из какой рыбы делают чёрную икру?', answers: ['осётр', 'белуга'] },
      ] },
      { name: 'Кино', qs: [
        { price: 100, text: 'Какой фильм 1997 года про корабль и айсберг получил 11 «Оскаров»?', answers: ['Титаник'] },
        { price: 200, text: 'Как зовут льва из мультфильма «Король Лев»?', answers: ['Симба'] },
        { price: 300, text: 'Какой фильм начинается словами «…и философский камень»?', answers: ['Гарри Поттер'] },
      ] },
      { name: 'Набережная', qs: [
        { price: 100, img: 'venue', text: 'Как называется эта летняя эстрада?', answers: ['Ракушка'] },
        { price: 200, img: 'zatejnik', say: 'Подсказка: он в соломенной шляпе.', text: 'Кто на картинке? Он ведёт игру, когда людей-ведущих нет.', answers: ['Затейник'], reveal: 'Мятная желейка в канотье и с бабочкой.' },
        { price: 300, audio: 'beep', text: 'Какая нота звучит? Так настраивают оркестр.', answers: ['ля'] },
      ] },
    ] },
    { name: 'Второй раунд', themes: [
      { name: 'Рыбалка', qs: [
        { price: 200, text: 'Как называется прибор, которым измеряют глубину под лодкой?', answers: ['эхолот'] },
        { price: 400, text: 'Как называется металлическая приманка, похожая на мелкую рыбку?', answers: ['блесна'] },
        { price: 600, type: 'noRisk', text: 'Какая рыба живёт в море, а мечет икру в реках?', answers: ['лосось', 'сёмга', 'кета'] },
      ] },
      { name: 'Города', qs: [
        { price: 200, text: 'Какой город называют «северной столицей» России?', answers: ['Санкт-Петербург', 'Петербург', 'Питер'] },
        { price: 400, text: 'Какая река течёт через Москву?', answers: ['Москва', 'Москва-река'] },
        demoVideo
          ? { price: 600, video: true, text: 'Посмотри ролик и скажи, что за город.', answers: ['Венеция'] }
          : { price: 600, text: 'Какой город — столица Австралии?', answers: ['Канберра'] },
      ] },
    ] },
    { name: 'Финал', final: true, themes: [
      { name: 'Море', qs: [{ price: 0, text: 'Как называется самая глубокая впадина Мирового океана?', answers: ['Марианская впадина', 'Марианский жёлоб'] }] },
      { name: 'Кино', qs: [{ price: 0, text: 'Какой режиссёр снял «Титаник» и «Аватар»?', answers: ['Джеймс Кэмерон', 'Кэмерон'] }] },
      { name: 'Рыбы', qs: [{ price: 0, text: 'Как называют рыбу-«живое ископаемое» с лопастными плавниками?', answers: ['целакант'] }] },
    ] },
  ],
});
const FILES = {
  venue: { zip: 'Images/venue-shell.jpg', ref: 'venue-shell.jpg', src: 'img/venue-shell.jpg' },
  zatejnik: { zip: `Images/${hex('затейник')}.png`, ref: 'затейник.png', src: 'img/zatejnik.png' }, // имя в архиве закодировано, как у SIGame
  beep: { zip: 'Audio/beep.wav', ref: 'beep.wav' },
  clip: { zip: 'Video/clip.mp4', ref: 'clip.mp4' },
};

/** Собрать content.xml нужной версии: 5 — params/param/item, 4 — scenario/atom */
function sampleXml(ver, withVideo) {
  const p = samplePack(withVideo);
  const A = (s) => esc(s);
  const q4 = (q) => {
    const atoms = [];
    if (q.say) atoms.push(`<atom type="say">${A(q.say)}</atom>`);
    atoms.push(`<atom>${A(q.text)}</atom>`);
    if (q.img) atoms.push(`<atom type="image">@${A(FILES[q.img].ref)}</atom>`);
    if (q.audio) atoms.push(`<atom type="voice">@${A(FILES[q.audio].ref)}</atom>`);
    if (q.video) atoms.push(`<atom type="video">@${A(FILES.clip.ref)}</atom>`);
    if (q.reveal) atoms.push('<atom type="marker"/>', `<atom>${A(q.reveal)}</atom>`);
    const type = q.type === 'cat' ? `<type name="cat"><param name="theme">${A(q.catTheme)}</param><param name="cost">${q.price}</param></type>` : q.type === 'noRisk' ? '<type name="sponsored"/>' : '';
    return `${type}<scenario>${atoms.join('')}</scenario>`;
  };
  const q5 = (q) => {
    const items = [];
    if (q.say) items.push(`<item type="text" placement="replic">${A(q.say)}</item>`);
    items.push(`<item>${A(q.text)}</item>`);
    if (q.img) items.push(`<item type="image" isRef="True">${A(FILES[q.img].ref)}</item>`);
    if (q.audio) items.push(`<item type="audio" isRef="True">${A(FILES[q.audio].ref)}</item>`);
    if (q.video) items.push(`<item type="video" isRef="True">${A(FILES.clip.ref)}</item>`);
    const extra = q.type === 'cat' ? `<param name="theme">${A(q.catTheme)}</param>` : '';
    const ans = q.reveal ? `<param name="answer" type="content"><item>${A(q.reveal)}</item></param>` : '';
    return `<params><param name="question" type="content">${items.join('')}</param>${ans}${extra}</params>`;
  };
  const question = (q, fin) => {
    const t = ver === 5 && (q.type === 'cat' || q.type === 'noRisk') ? ` type="${q.type}"` : '';
    const wrong = q.wrong?.length ? `<wrong>${q.wrong.map((a) => `<answer>${A(a)}</answer>`).join('')}</wrong>` : '';
    const info = q.comment ? `<info><comments>${A(q.comment)}</comments></info>` : '';
    return `<question price="${fin ? 0 : q.price}"${t}>${info}${ver === 5 ? q5(q) : q4(q)}<right>${q.answers.map((a) => `<answer>${A(a)}</answer>`).join('')}</right>${wrong}</question>`;
  };
  const rounds = p.rounds.map((r) => `<round name="${A(r.name)}"${r.final ? ' type="final"' : ver === 4 ? ' type="standart"' : ''}><themes>${r.themes.map((t) => `<theme name="${A(t.name)}"><questions>${t.qs.map((q) => question(q, r.final)).join('')}</questions></theme>`).join('')}</themes></round>`).join('');
  const ns = ver === 5 ? 'https://github.com/VladimirKhil/SI/blob/master/assets/siq_5.xsd' : 'http://vladimirkhil.com/ygpackage3.0.xsd';
  return `<?xml version="1.0" encoding="utf-8"?>\n<package name="${A(p.name)}" version="${ver}" id="${crypto.randomUUID()}" date="${p.date}" difficulty="3" language="ru-RU" xmlns="${ns}"><info><authors><author>${A(p.author)}</author></authors><comments>Пример для страницы-обзора «Ракушка»</comments></info><tags><tag>пример</tag></tags><rounds>${rounds}</rounds></package>`;
}

/** Собрать пример .siq: версия 5 или 4; withVideo — вопрос со ссылкой на видео (файла нет), чтобы показать предупреждение */
async function buildSample(ver, withVideo) {
  const bytes = async (url) => new Uint8Array(await (await fetch(url)).arrayBuffer());
  const xml = sampleXml(ver, withVideo);
  return zipWrite([
    { name: 'content.xml', data: new TextEncoder().encode(xml), deflate: true },
    { name: FILES.venue.zip, data: await bytes(FILES.venue.src) },
    { name: FILES.zatejnik.zip, data: await bytes(FILES.zatejnik.src) },
    { name: FILES.beep.zip, data: beepWav() },
  ]);
}

// ------------------------------------------------------------------ раздел

export function mount(el) {
  const S = {
    open: true, tab: 'packs', level: 4, owner: false,
    packs: seedPacks(), q: '', filter: 'all', confirmDel: null, notice: null, picking: null, sel: new Set(),
    up: { phase: 'idle' }, savedToday: 0, nw: { text: SAMPLE_TEXT, res: null, round: 0 }, uid: 0, sample: 5,
  };
  S.nw.res = parseAny(S.nw.text);
  const byId = (id) => S.packs.find((p) => p.id === id);

  const st = makeStage(el, {
    title: 'Окно «Ракушка» — паки',
    note: 'Вкладки «Паки», «Загрузить» и «Новый пак» — рабочие. Открой «Загрузить» и брось на окно настоящий .siq из SIGame — он разберётся здесь же, в браузере, как будет в игре. Нет своего пака — жми «Попробовать на примере». Кнопки над окном показывают, как оно выглядит у новичка и у владельца. Окно здесь крупнее, чем будет в игре, — чтобы читалось на странице.',
    bg: 'img/venue-shell.jpg',
    controls: [
      { label: 'Новичок (ур. 2)', pressed: false, onClick: (b) => { S.level = S.level >= NEED_LEVEL ? 2 : 4; b.setAttribute('aria-pressed', String(S.level < NEED_LEVEL)); paint(); } },
      { label: 'Я — владелец набережной', pressed: false, onClick: (b) => { S.owner = !S.owner; b.setAttribute('aria-pressed', String(S.owner)); paint(); } },
    ],
  });
  st.root.classList.add('pk-stage');
  st.scale.style.setProperty('--qz-shade', 'linear-gradient(180deg, rgba(8, 32, 30, .30), rgba(8, 32, 30, .52))');

  // ---- окно: нативный <dialog> в игре, здесь div (страница не должна блокироваться модальным окном)
  const scrim = h('div', 'k-scrim pk-scrim');
  scrim.tabIndex = -1;
  scrim.innerHTML = `<section class="k-window pk-win is-in" role="dialog" aria-label="Ракушка: паки вопросов">
    <header class="k-win-head">
      <span class="k-win-portrait"><img src="img/zatejnik.png" alt=""></span>
      <div class="k-win-titles"><p class="k-eyebrow">Приморский сад · эстрада</p><h2 class="k-win-title">Ракушка</h2><p class="pk-say">«Выбирай пак — табло разложу я!»</p></div>
      <div class="k-win-tools"><button type="button" class="k-close" aria-label="Закрыть" data-act="close">${keyHtml('Esc', undefined, 'sm')}</button></div>
    </header>
    <nav class="k-tabs" role="tablist" data-tabs></nav>
    <div class="k-win-body pk-body" data-body></div>
    <footer class="k-win-foot pk-foot" data-foot hidden></footer>
  </section>`;
  const win = scrim.firstElementChild;
  const tabsEl = win.querySelector('[data-tabs]');
  const body = win.querySelector('[data-body]');
  const foot = win.querySelector('[data-foot]');
  const reopen = h('button', 'k-btn k-btn--lg pk-reopen', 'Открыть окно снова');
  reopen.type = 'button';
  reopen.hidden = true;
  const hint = h('div', 'pk-hint', 'Файл бросай на вкладке «Загрузить»');
  hint.hidden = true;
  st.scale.append(scrim, reopen);
  st.frame.append(hint);
  const input = h('input');
  input.type = 'file';
  input.hidden = true;
  input.accept = '.siq,.zip,.txt,.csv,.tsv,text/plain,text/csv';
  el.append(input);

  // ---------------------------------------------------------------- разметка вкладок

  const TABS = [['play', 'bell', 'Играть'], ['packs', 'collection', 'Паки'], ['upload', 'gift', 'Загрузить'], ['new', 'scroll', 'Новый пак']];
  function tabsHtml() {
    return TABS.map(([id, icon, label]) => {
      const off = id === 'play';
      const cnt = id === 'packs' ? ` <span class="k-tab-count">${S.packs.length}</span>` : '';
      return `<button type="button" role="tab" class="k-tab${id === S.tab ? ' is-on' : ''}${off ? ' pk-tab-off' : ''}" data-act="tab" data-tab="${id}" aria-selected="${id === S.tab}"${off ? ' aria-disabled="true"' : ''}>${ic(icon)}${label}${cnt}</button>`;
    }).join('');
  }
  const noticeHtml = () => (S.notice
    ? `<div class="pk-msg pk-msg--${S.notice.tone}">${S.notice.tone === 'bad' ? ic('warn') : ''}<span>${esc(S.notice.text)}${S.notice.link ? ` <a href="${S.notice.link}">${esc(S.notice.linkText)}</a>` : ''}</span><button type="button" class="pk-msg-x" data-act="notice-x" aria-label="Убрать">×</button></div>`
    : '');
  let noticeT = 0;
  function say(tone, text, link, linkText) {
    S.notice = { tone, text, link, linkText };
    clearTimeout(noticeT);
    noticeT = setTimeout(() => { S.notice = null; paint(); }, 9000);
  }

  // ---------------------------------------------------------------- вкладка «Паки»: каталог

  function cardHtml(p) {
    const c = totals(p);
    const mine = p.author === ME;
    const canDel = !p.builtin && (mine || S.owner);
    const why = p.builtin ? 'встроенный — не удаляется' : 'удалить может автор';
    const acts = S.confirmDel === p.id
      ? `<div class="pk-ask"><span>Удалить пак «${esc(p.title)}»? Его не станет у всех.</span><button type="button" class="k-btn k-btn--stop k-btn--sm" data-act="del" data-id="${p.id}">Да, удалить</button><button type="button" class="k-btn k-btn--ghost k-btn--sm" data-act="del-no">Отмена</button></div>`
      : `<div class="pk-act"><button type="button" class="k-btn k-btn--sm" data-act="pick" data-id="${p.id}">Выбрать</button>${canDel ? `<button type="button" class="k-btn k-btn--ghost k-btn--sm" data-act="del-ask" data-id="${p.id}">Удалить</button>` : `<span class="k-faint">${why}</span>`}</div>`;
    return `<article class="k-cell pk-card${mine ? ' is-own' : ''}${p.fresh ? ' is-new' : ''}" data-id="${p.id}">
      <span class="pk-cover">${ic(p.ico, 'pk-cover-ic')}</span>
      <div class="pk-card-main"><b class="pk-title" title="${esc(p.title)}">${esc(p.title)}</b><span class="pk-by">${esc(p.author)}</span>
        <span class="pk-tags">${p.builtin ? '<span class="k-pill k-pill--info k-pill--xs">встроенный</span>' : ''}${mine ? '<span class="k-pill k-pill--gold k-pill--xs">твой</span>' : ''}${p.adult ? '<span class="k-pill k-pill--bad k-pill--xs">18+</span>' : ''}</span></div>
      <p class="pk-meta"><b>${n(c.themes, FORMS.theme)}</b> · <b>${n(c.questions, FORMS.q)}</b></p>
      <p class="pk-meta k-dim">Сыграли ${n(p.plays, FORMS.time)} <span class="pk-like">${THUMB}${p.likes}</span></p>
      ${acts}
    </article>`;
  }
  function gridHtml() {
    const q = S.q.trim().toLowerCase();
    const list = S.packs.filter((p) => (S.filter !== 'mine' || p.author === ME) && (!q || `${p.title} ${p.author}`.toLowerCase().includes(q)));
    if (!list.length) {
      return `<div class="k-cell pk-empty">${ic('collection', 'pk-empty-ic')}<div><b>${q ? 'Ничего не нашлось' : 'У тебя пока нет своих паков'}</b><p class="k-dim">${q ? 'Попробуй другое слово — или загрузи свой пак.' : 'Загрузи пак SIGame или собери свой — он появится здесь.'}</p></div><button type="button" class="k-btn k-btn--sm" data-act="tab" data-tab="upload">Загрузить пак</button></div>`;
    }
    return `<div class="pk-grid">${list.map(cardHtml).join('')}</div>`;
  }
  function bodyCatalog() {
    return `${noticeHtml()}
      <div class="pk-bar">
        <input class="k-input pk-search" type="search" placeholder="Найти пак или автора" aria-label="Поиск по пакам" value="${esc(S.q)}" data-search>
        <div class="k-seg" role="group" aria-label="Какие паки показать"><button type="button" class="${S.filter === 'all' ? 'is-on' : ''}" data-act="filter" data-v="all">Все</button><button type="button" class="${S.filter === 'mine' ? 'is-on' : ''}" data-act="filter" data-v="mine">Мои</button></div>
      </div>
      <div data-grid>${gridHtml()}</div>`;
  }

  // ---------------------------------------------------------------- выбор тем

  const selStats = (p) => {
    let themes = 0;
    let questions = 0;
    p.rounds.forEach((r, ri) => r.themes.forEach((t, ti) => { if (S.sel.has(`${ri}:${ti}`)) { themes++; questions += t.n; } }));
    return { themes, questions };
  };
  function bodyPick() {
    const p = byId(S.picking);
    const rounds = p.rounds.map((r, ri) => {
      const keys = r.themes.map((_, ti) => `${ri}:${ti}`);
      const all = keys.every((k) => S.sel.has(k));
      const sub = r.final ? 'ведущий убирает темы по одной — остаётся одна' : `цены ${ladder(r)}`;
      return `<section class="pk-rd">
        <header class="pk-rd-h"><b>${esc(r.name)}</b><span class="k-dim">${n(r.themes.length, FORMS.theme)} · ${sub}</span>
          <button type="button" class="k-btn k-btn--ghost k-btn--sm" data-act="round" data-ri="${ri}">${all ? 'Убрать все' : 'Выбрать все'}</button></header>
        <div class="pk-themes">${r.themes.map((t, ti) => {
    const on = S.sel.has(`${ri}:${ti}`);
    return `<button type="button" class="k-cell pk-theme${on ? ' is-on' : ''}" role="checkbox" aria-checked="${on}" data-act="theme-pick" data-k="${ri}:${ti}"><span class="pk-box" aria-hidden="true"></span><span class="pk-theme-t"><b>${esc(t.name)}</b><span class="k-faint">${r.final ? 'вопрос на финал' : n(t.n, FORMS.q)}</span></span></button>`;
  }).join('')}</div>
      </section>`;
    }).join('');
    return `${noticeHtml()}
      <div class="pk-pick-top"><button type="button" class="k-btn k-btn--ghost k-btn--sm" data-act="back">← К пакам</button>
        <div class="pk-pick-t"><b>${esc(p.title)}</b><span class="k-dim">${esc(p.author)}</span></div>${p.adult ? '<span class="k-pill k-pill--bad">18+ для взрослых компаний</span>' : ''}</div>
      ${rounds}`;
  }
  function footPick() {
    const p = byId(S.picking);
    const s = selStats(p);
    return `<span class="k-note">${s.themes ? `Выбрано <span class="k-pill k-pill--gold k-pill--lg">${n(s.themes, FORMS.theme)} · ${n(s.questions, FORMS.q)}</span>` : '<span class="k-bad">Отметь хотя бы одну тему</span>'}</span>
      <button type="button" class="k-btn k-btn--go" data-act="play-pick"${s.themes ? '' : ' disabled'}>Играть с этими темами</button>`;
  }

  // ---------------------------------------------------------------- вкладка «Загрузить»

  const lockLine = () => `<p class="pk-lock">${ic('lock')}<span>Загружать паки можно с ${NEED_LEVEL}-го уровня. Тебе ещё ${NEED_LEVEL - S.level}.</span></p>`;
  function bodyUpload() {
    const u = S.up;
    if (u.phase === 'preview') return bodyPreview(u);
    const locked = S.level < NEED_LEVEL;
    if (u.phase === 'busy') {
      return `<div class="k-cell pk-busy"><b>Разбираю пак…</b><span class="k-dim">${esc(u.name)}</span><span class="pk-busy-step">${esc(u.step)}</span>${meterHtmlLocal(u.v)}</div>`;
    }
    return `${noticeHtml()}${u.phase === 'error' ? `<div class="pk-msg pk-msg--bad">${ic('warn')}<span>${esc(u.msg)}</span></div>` : ''}
      <div class="pk-drop${locked ? ' is-off' : ''}" data-drop>
        ${ic('gift', 'pk-drop-ic')}
        <b>Перетащи сюда пак .siq, .txt или .csv</b>
        <span class="k-dim">Брось файл на окно или выбери его на компьютере</span>
        <button type="button" class="k-btn" data-act="choose"${locked ? ' disabled' : ''}>Выбрать файл</button>
        ${locked ? lockLine() : ''}
      </div>
      <div class="k-cell pk-try">
        <div class="pk-try-t"><b>Нет пака под рукой?</b><span class="k-dim">Соберём маленький пак SIGame прямо здесь и разберём его так же, как твой.</span></div>
        <div class="k-seg" role="group" aria-label="Какой пример"><button type="button" class="${S.sample === 5 ? 'is-on' : ''}" data-act="sample-ver" data-v="5">Новый вид</button><button type="button" class="${S.sample === 4 ? 'is-on' : ''}" data-act="sample-ver" data-v="4">Старый вид</button></div>
        <div class="pk-try-b"><button type="button" class="k-btn k-btn--info" data-act="sample">Попробовать на примере</button><button type="button" class="k-btn k-btn--ghost" data-act="sample-dl">Скачать пример .siq</button></div>
      </div>`;
  }
  const meterHtmlLocal = (v) => `<span class="k-meter k-meter--good" style="--v:${Math.round(Math.min(1, Math.max(0, v || 0)) * 1000) / 1000}"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i></span>`;

  const bytesNow = (u) => u.files.reduce((a, f) => a + (f.shrunk?.size ?? f.size), 0);
  function limitProblems(u) {
    const out = [];
    const q = countPack(u.pack).questions;
    if (q > LIMITS.questions) out.push(`В паке ${n(q, FORMS.q)}, а можно не больше ${LIMITS.questions}.`);
    const b = bytesNow(u);
    if (b > LIMITS.bytes) out.push(`Картинки и звук весят ${fmtSize(b)}, а можно не больше ${fmtSize(LIMITS.bytes)}${u.shrink?.phase === 'done' ? '.' : ' — нажми «Ужать картинки».'}`);
    return out;
  }
  function filesHtml(u) {
    const s = u.stats;
    const pills = [];
    if (s.images.count) pills.push(`<span class="k-pill">${ic('camera')}Картинки: <b>${s.images.count}</b> · ${fmtSize(s.images.bytes)}</span>`);
    if (s.audio.count) pills.push(`<span class="k-pill">${ic('sound')}Звук: <b>${s.audio.count}</b> · ${fmtSize(s.audio.bytes)}</span>`);
    if (s.video.count) pills.push(`<span class="k-pill k-pill--gold">${ic('warn')}Видео пропущено: <b>${s.video.count}</b>${s.video.bytes ? ` · ${fmtSize(s.video.bytes)}` : ''}</span>`);
    if (s.html.count) pills.push(`<span class="k-pill k-pill--gold">${ic('warn')}Веб-страниц пропущено: <b>${s.html.count}</b></span>`);
    if (!pills.length) pills.push('<span class="k-dim">Только текст — файлов в паке нет.</span>');
    let shrink = '';
    const sh = u.shrink;
    if (s.images.count) {
      if (!sh) shrink = `<button type="button" class="k-btn k-btn--info k-btn--sm" data-act="shrink">Ужать картинки</button><span class="k-faint">уменьшим до ${LIMITS.imageSide} px и сожмём — так они попадут в игру</span>`;
      else if (sh.phase === 'busy') shrink = `<span class="pk-shrink-t">Ужимаю… ${sh.done} из ${sh.total}</span>${meterHtmlLocal(sh.done / sh.total)}`;
      else shrink = `<span class="k-pill k-pill--good k-pill--lg">Было ${fmtSize(sh.before)} → станет ${fmtSize(sh.after)}</span>${sh.kept ? `<span class="k-faint">без изменений: ${sh.kept}</span>` : ''}`;
    }
    return `<div class="pk-pills">${pills.join('')}</div>${shrink ? `<div class="pk-shrink">${shrink}</div>` : ''}`;
  }
  function warnsHtml(u) {
    const all = [...u.warnings, ...limitProblems(u).map((text) => ({ tone: 'bad', text }))];
    if (!all.length) return `<div class="pk-msg pk-msg--good"><span>Замечаний нет — пак готов к загрузке.</span></div>`;
    return `<div class="pk-warns">${all.map((w) => `<div class="pk-msg pk-msg--${w.tone === 'bad' ? 'bad' : 'warn'}">${w.tone === 'bad' ? ic('warn') : ''}<span>${esc(w.text)}</span></div>`).join('')}</div>`;
  }
  function bodyPreview(u) {
    const c = countPack(u.pack);
    const fmt = u.format === 'siq' ? `SIGame${u.pack.source.version ? ` ${u.pack.source.version}` : ''}` : u.format === 'csv' ? 'таблица' : 'свой формат';
    const nav = u.pack.rounds.map((r, ri) => `<p class="k-nav-h">${esc(r.name)}${r.final && !/финал/i.test(r.name) ? ' · финал' : ''}</p>${r.themes.map((t, ti) => `<button type="button" class="k-nav-item${u.ri === ri && u.ti === ti ? ' is-on' : ''}" data-act="pv-theme" data-ri="${ri}" data-ti="${ti}"><span class="pk-nm">${esc(t.name)}</span><span class="k-tab-count">${t.questions.length}</span></button>`).join('')}`).join('');
    return `<header class="pk-pv-head">
        <span class="pk-cover">${ic(u.format === 'siq' ? 'collection' : 'scroll', 'pk-cover-ic')}</span>
        <div class="pk-pv-t"><b title="${esc(u.pack.title)}">${esc(u.pack.title)}</b><span class="k-dim">${u.pack.author ? `Автор: ${esc(u.pack.author)}` : 'Автор не указан'}${u.pack.source.date ? ` · ${esc(u.pack.source.date)}` : ''}</span></div>
        <div class="pk-pills"><span class="k-pill k-pill--info k-pill--sm">${esc(fmt)}</span>${u.pack.adult ? '<span class="k-pill k-pill--bad k-pill--sm">18+</span>' : ''}</div>
      </header>
      <div class="pk-pills pk-sum"><span class="k-pill k-pill--lg">${n(c.rounds, FORMS.round)}</span><span class="k-pill k-pill--lg">${n(c.themes, FORMS.theme)}</span><span class="k-pill k-pill--lg">${n(c.questions, FORMS.q)}</span></div>
      <div data-warns>${warnsHtml(u)}</div>
      <div class="k-cell pk-files" data-files>${filesHtml(u)}</div>
      <div class="pk-tree"><nav class="k-nav pk-nav" aria-label="Раунды и темы">${nav}</nav><div class="pk-qs" data-qs>${qsHtml(u)}</div></div>`;
  }
  function itemHtml(i, root) {
    if (i.kind === 'text') return `<p class="pk-ct${i.say ? ' is-say' : ''}">${i.say ? '<span class="k-faint">ведущий говорит: </span>' : ''}${esc(i.value)}</p>`;
    if (i.skipped) return `<span class="k-pill k-pill--gold k-pill--sm">${ic('warn')}${i.kind === 'video' ? 'видео пропущено' : i.kind === 'html' ? 'веб-страница пропущена' : 'ссылка пропущена'}</span>`;
    if (i.missing) return `<span class="k-pill k-pill--bad k-pill--sm">${ic('warn')}нет файла: ${esc(i.missing)}</span>`;
    if (i.kind === 'image') return `<img class="pk-img" data-file="${esc(i.file)}" alt="">`;
    if (i.kind === 'audio') return `<button type="button" class="k-btn k-btn--ghost k-btn--sm pk-play" data-act="play" data-file="${esc(i.file)}">${ic('sound')}Послушать</button>`;
    return '';
  }
  function qHtml(q) {
    const label = typeLabel(q.type) || (q.type === 'other' ? q.typeName : '');
    return `<article class="k-cell pk-q">
      <div class="pk-q-h"><span class="k-pill k-pill--gold k-pill--sm">${q.price || 'финал'}</span>${label ? `<span class="k-pill k-pill--special k-pill--sm">${esc(label)}${q.catTheme ? ` · ${esc(q.catTheme)}` : ''}</span>` : ''}</div>
      ${q.content.map((i) => itemHtml(i)).join('') || '<span class="k-faint">пусто</span>'}
      <p class="pk-ans"><span class="k-faint">Ответ</span> ${q.answers.length ? `<b class="k-good">${esc(q.answers.join(' / '))}</b>` : '<b class="k-bad">нет ответа</b>'}</p>
      ${q.reveal?.length ? `<div class="pk-rv"><span class="k-faint">Показать с ответом</span>${q.reveal.map((i) => itemHtml(i)).join('')}</div>` : ''}
      ${q.wrong?.length ? `<p class="k-faint">Неверные: ${esc(q.wrong.join(' · '))}</p>` : ''}
      ${q.comment ? `<p class="k-faint pk-cm">${esc(q.comment)}</p>` : ''}
    </article>`;
  }
  function qsHtml(u) {
    const t = u.pack.rounds[u.ri]?.themes[u.ti];
    if (!t) return '';
    return `<h3 class="pk-qs-h">${esc(t.name)} <span class="k-dim">· ${n(t.questions.length, FORMS.q)}</span></h3>${t.questions.map(qHtml).join('')}`;
  }
  /** Картинки в предпросмотре подгружаются по требованию — из архива, без лишней памяти */
  function hydrate(root) {
    const files = new Map((S.up.files ?? []).map((f) => [f.id, f]));
    root.querySelectorAll('img[data-file]').forEach((img) => {
      const f = files.get(img.dataset.file);
      if (f) fileUrl(f).then((url) => { img.src = url; }).catch(() => { img.replaceWith(h('span', 'k-pill k-pill--bad k-pill--sm', 'картинка не открылась')); });
    });
  }
  function footUpload() {
    const u = S.up;
    if (u.phase !== 'preview') return '';
    const problems = limitProblems(u);
    const locked = S.level < NEED_LEVEL;
    const why = locked ? `Нужен ${NEED_LEVEL}-й уровень` : problems.length ? 'Сначала убери замечания' : S.savedToday >= DAILY ? `Хватит на сегодня: ${DAILY} паков в день` : '';
    return `<span class="k-note">${why ? `<span class="k-bad">${esc(why)}</span>` : ''}</span>
      <button type="button" class="k-btn k-btn--ghost" data-act="again">Другой файл</button>
      <button type="button" class="k-btn k-btn--go" data-act="save-up"${why ? ' disabled' : ''}>Сохранить на набережную</button>`;
  }

  // ---- разбор файла
  const zero = () => ({ images: { count: 0, bytes: 0 }, audio: { count: 0, bytes: 0 }, video: { count: 0, bytes: 0 }, html: { count: 0, bytes: 0 } });
  async function handleFile(file, demo = false) {
    if (S.level < NEED_LEVEL && !demo) { say('bad', `Загружать паки можно с ${NEED_LEVEL}-го уровня.`); paint(); return; }
    releaseFiles(S.up.files);
    const step = (text, v) => {
      if (S.up.phase === 'busy') { S.up.step = text; S.up.v = v; if (S.tab === 'upload') paintBody(); }
      return new Promise((r) => setTimeout(r, 170)); // шаги видно, страница успевает перерисоваться
    };
    S.up = { phase: 'busy', name: file.name, step: 'Открываю пак…', v: 0.05 };
    paint();
    await new Promise((r) => setTimeout(r, 40));
    try {
      const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
      let res;
      if (head[0] === 0x50 && head[1] === 0x4b) {
        let k = 0;
        res = await parseSiq(file, { onStep: (t) => step(t, [0.15, 0.45, 0.8][k++] ?? 0.9) });
        res.format = 'siq';
      } else {
        if (/\.(siq|zip)$/i.test(file.name)) throw new SiqError('notZip', 'Это не пак SIGame: файл не открывается как архив .siq.');
        await step('Читаю таблицу и строки…', 0.5);
        const r = parseAny(await file.text());
        r.pack.title ||= file.name.replace(/\.[^.]+$/, '') || 'Мой пак';
        if (!countPack(r.pack).questions) throw Object.assign(new Error('В файле не нашли ни одного вопроса. Как писать — на вкладке «Новый пак».'), { human: true });
        const warnings = [];
        if (r.errors) warnings.push({ tone: 'warn', text: `Строки с ошибками пропущены: ${r.errors}. Поправь их на вкладке «Новый пак».` });
        let linked = 0;
        let named = 0;
        for (const rd of r.pack.rounds) for (const t of rd.themes) for (const q of t.questions) for (const i of q.content) { if (i.url) linked++; else if (i.missing) named++; }
        if (linked) warnings.push({ tone: 'warn', text: `Картинки по ссылкам пропущены: ${linked}. Нужны файлы внутри пака .siq.` });
        if (named) warnings.push({ tone: 'warn', text: `Картинки без файлов пропущены: ${named}. Нужны файлы внутри пака .siq.` });
        res = { pack: r.pack, files: [], stats: zero(), warnings, format: r.format };
      }
      S.up = { ...res, phase: 'preview', name: file.name, size: file.size, ri: 0, ti: 0, shrink: null };
      sfx.play('right');
    } catch (e) {
      S.up = { phase: 'error', msg: e.human || e.code ? e.message : 'Не получилось открыть этот файл. Проверь, что это пак .siq, .txt или .csv.' };
      if (!(e instanceof SiqError) && !e.human) console.warn('разбор пака:', e); // свои ошибки — по-человечески в окне, без шума в консоли
      sfx.play('wrong');
    }
    S.tab = 'upload';
    paint();
    if (!isVisible()) st.frame.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  const isVisible = () => { const r = st.frame.getBoundingClientRect(); return r.top < innerHeight * 0.7 && r.bottom > innerHeight * 0.3; };

  async function runShrink() {
    const u = S.up;
    u.shrink = { phase: 'busy', done: 0, total: u.files.filter((f) => f.kind === 'image').length };
    paintParts();
    const r = await shrinkImages(u.files, { onProgress: (done) => { u.shrink.done = done; if (S.up === u) paintParts(); } });
    if (S.up !== u) return;
    u.shrink = { phase: 'done', ...r };
    sfx.play('reward');
    paintParts();
    renderQs();
  }
  function renderQs() {
    const host = body.querySelector('[data-qs]');
    if (!host || S.up.phase !== 'preview') return;
    host.innerHTML = qsHtml(S.up);
    hydrate(host);
  }

  // ---------------------------------------------------------------- вкладка «Новый пак»

  const mirrorHtml = (text, lines) => text.replace(/\r\n?/g, '\n').split('\n').map((raw, i) => {
    const cls = lines[i]?.cls ?? 'blank';
    let inner = esc(raw);
    if (cls === 'kw') inner = inner.replace(/^(\s*[^\s:=]+(?:\s*:)?)/, '<b class="pk-k">$1</b>');
    else if (cls === 'q' || cls === 'fin') {
      let k = raw.indexOf(' = ');
      if (k < 0) k = raw.indexOf('=');
      const [a, b] = k >= 0 ? [raw.slice(0, k), raw.slice(k)] : [raw, ''];
      inner = `${esc(a).replace(/^(\s*(?:\d+|\?))/, '<b class="pk-p">$1</b>')}<i class="pk-a">${esc(b)}</i>`;
    }
    return `<div class="pk-ln pk-ln--${cls}"${lines[i]?.msg ? ` title="${esc(lines[i].msg)}"` : ''}>${inner || ' '}</div>`;
  }).join('');
  function boardHtml(pack, ri) {
    const r = pack.rounds[ri];
    if (!r) return '<p class="k-dim pk-bd-empty">Пока ни одного вопроса. Напиши строку вроде «100 Вопрос = ответ».</p>';
    if (r.final) return `<div class="pk-final">${r.themes.map((t) => `<div class="pk-bd-th pk-bd-th--fin">${esc(t.name)}</div>`).join('')}<p class="k-faint">Ведущий убирает темы по одной, пока не останется одна.</p></div>`;
    const prices = [...new Set(r.themes.flatMap((t) => t.questions.map((q) => q.price)))].sort((a, b) => a - b);
    return `<div class="pk-board" style="--cols:${prices.length}">${r.themes.map((t) => `<div class="pk-bd-row"><span class="pk-bd-th" title="${esc(t.name)}">${esc(t.name)}</span>${prices.map((p) => (t.questions.some((q) => q.price === p) ? `<span class="pk-bd-c">${p}</span>` : '<span class="pk-bd-c is-empty"></span>')).join('')}</div>`).join('')}</div>`;
  }
  function sideHtml() {
    const { res } = S.nw;
    const c = countPack(res.pack);
    if (S.nw.round >= res.pack.rounds.length) S.nw.round = 0;
    const status = res.errors
      ? `<span class="k-pill k-pill--bad">${ic('warn')}Исправь ${n(res.errors, FORMS.row)}</span>`
      : c.questions ? `<span class="k-pill k-pill--good">Понял: ${n(c.rounds, FORMS.round)} · ${n(c.themes, FORMS.theme)} · ${n(c.questions, FORMS.q)}</span>` : '<span class="k-pill">Пока пусто</span>';
    const seg = res.pack.rounds.length > 1 ? `<div class="k-seg pk-bd-seg" role="group" aria-label="Раунд">${res.pack.rounds.map((r, i) => `<button type="button" class="${i === S.nw.round ? 'is-on' : ''}" data-act="nw-round" data-i="${i}">${esc(r.name)}</button>`).join('')}</div>` : '';
    const issues = res.lines.map((l, i) => (l.msg ? { i, ...l } : null)).filter(Boolean).slice(0, 3);
    const more = res.errors + res.warnings - issues.length;
    const list = issues.length ? `<div class="pk-issues">${issues.map((x) => `<div class="pk-msg pk-msg--${x.cls === 'err' ? 'bad' : 'warn'}"><span><b>Строка ${x.i + 1}.</b> ${esc(x.msg)}</span></div>`).join('')}${more > 0 ? `<p class="k-faint">…и ещё ${more}</p>` : ''}</div>` : '';
    return `<div class="pk-nw-status">${status}${res.format === 'csv' ? '<span class="k-pill k-pill--info k-pill--sm">таблица</span>' : ''}</div>${list}${seg}<div class="pk-bd-wrap">${boardHtml(res.pack, S.nw.round)}</div>
      <p class="k-faint">Так будет выглядеть табло${res.pack.title ? ` пака «${esc(res.pack.title)}»` : ''}: темы строками, цены столбцами.</p>`;
  }
  function bodyNew() {
    return `${noticeHtml()}<div class="pk-new">
      <div class="pk-ed-col">
        <div class="pk-ed" data-ed><div class="pk-ed-hl" data-hl></div><textarea class="pk-ed-ta" data-ta spellcheck="false" wrap="off" aria-label="Текст пака"></textarea></div>
        <div class="pk-syntax"><span class="k-pill k-pill--sm"><code>Тема: Рыбы</code></span><span class="k-pill k-pill--sm"><code>100 Вопрос = ответ / вариант</code></span><span class="k-pill k-pill--sm"><code>Финал</code></span><span class="k-pill k-pill--sm"><code>? Вопрос = ответ</code></span></div>
        <p class="k-faint">Сотри « = ответ» в любой строке — она подсветится. Таблицу из Google (CSV, TSV) можно вставить сюда.</p>
      </div>
      <div class="pk-nw-side" data-side>${sideHtml()}</div>
    </div>`;
  }
  function footNew() {
    const { res } = S.nw;
    const c = countPack(res.pack);
    const locked = S.level < NEED_LEVEL;
    const why = locked ? `Нужен ${NEED_LEVEL}-й уровень` : !c.questions ? 'Напиши хотя бы один вопрос' : res.errors ? 'Сначала исправь подсвеченные строки' : c.questions > LIMITS.questions ? `Не больше ${LIMITS.questions} вопросов` : S.savedToday >= DAILY ? `Хватит на сегодня: ${DAILY} паков в день` : '';
    return `<span class="k-note">${why ? `<span class="k-bad">${esc(why)}</span>` : ''}</span><button type="button" class="k-btn k-btn--go" data-act="save-nw"${why ? ' disabled' : ''}>Сохранить на набережную</button>`;
  }
  function wireEditor() {
    const ta = body.querySelector('[data-ta]');
    const hl = body.querySelector('[data-hl]');
    if (!ta) return;
    ta.value = S.nw.text;
    const draw = () => { hl.innerHTML = mirrorHtml(S.nw.text, S.nw.res.lines) + '<div class="pk-ln"> </div>'; };
    draw();
    const sync = () => { hl.scrollTop = ta.scrollTop; hl.scrollLeft = ta.scrollLeft; };
    ta.addEventListener('scroll', sync);
    ta.addEventListener('input', () => {
      S.nw.text = ta.value;
      S.nw.res = parseAny(ta.value);
      draw();
      sync();
      body.querySelector('[data-side]').innerHTML = sideHtml();
      paintFoot();
    });
  }

  // ---------------------------------------------------------------- сохранение

  function save(pack, ico, fromUpload) {
    if (S.level < NEED_LEVEL || S.savedToday >= DAILY) return;
    const entry = toCatalog(pack, ico, `up${++S.uid}`);
    const at = Math.max(0, S.packs.findIndex((p) => !p.builtin));
    S.packs.splice(at < 0 ? S.packs.length : at, 0, entry);
    S.savedToday++;
    S.filter = 'all';
    S.q = '';
    S.tab = 'packs';
    if (fromUpload) {
      releaseFiles(S.up.files);
      S.up = { phase: 'idle' };
    }
    say('good', `Пак «${pack.title || 'Мой пак'}» сохранён. Теперь он есть у всех на набережной.`);
    sfx.play('fanfare');
    paint();
    body.querySelector(`.pk-card[data-id="${entry.id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    setTimeout(() => { entry.fresh = false; body.querySelector(`.pk-card[data-id="${entry.id}"]`)?.classList.remove('is-new'); }, 2800);
  }

  // ---------------------------------------------------------------- отрисовка

  function paintTabs() { tabsEl.innerHTML = tabsHtml(); }
  function paintFoot() {
    const html = S.tab === 'packs' && S.picking ? footPick() : S.tab === 'upload' ? footUpload() : S.tab === 'new' ? footNew() : '';
    foot.hidden = !html;
    foot.innerHTML = html;
  }
  function paintBody() {
    const scroll = body.scrollTop;
    if (S.tab === 'packs') body.innerHTML = S.picking ? bodyPick() : bodyCatalog();
    else if (S.tab === 'upload') body.innerHTML = bodyUpload();
    else if (S.tab === 'new') { body.innerHTML = bodyNew(); wireEditor(); }
    else body.innerHTML = `<div class="k-cell pk-empty"><span class="pk-empty-ic">${ic('bell', 'pk-cover-ic')}</span><div><b>Эту вкладку показывает раздел «Своя игра»</b><p class="k-dim">Там — табло и вид ведущего. Здесь только паки.</p></div><a class="k-btn k-btn--sm" href="#jeopardy">К «Своей игре»</a></div>`;
    if (S.tab === 'upload' && S.up.phase === 'preview') hydrate(body);
    body.scrollTop = scroll;
  }
  /** Часть предпросмотра (предупреждения, файлы, подвал) — без перерисовки вопросов, чтобы картинки не мигали */
  function paintParts() {
    const u = S.up;
    if (S.tab !== 'upload' || u.phase !== 'preview') return;
    body.querySelector('[data-warns]')?.replaceChildren(...h('div', '', warnsHtml(u)).childNodes);
    body.querySelector('[data-files]')?.replaceChildren(...h('div', '', filesHtml(u)).childNodes);
    paintFoot();
  }
  function paint() {
    if (!(S.open && S.tab === 'upload' && S.up.phase === 'preview')) { S.audio?.pause(); S.audio = null; } // звук из предпросмотра не тянется за окном
    paintTabs();
    paintBody();
    paintFoot();
    scrim.hidden = !S.open;
    reopen.hidden = S.open;
  }
  paint();

  // ---------------------------------------------------------------- открыть и закрыть

  function close() {
    if (!S.open) return;
    S.open = false;
    sfx.play('close');
    paint();
  }
  function open() {
    S.open = true;
    win.classList.remove('is-in');
    void win.offsetWidth;
    win.classList.add('is-in');
    sfx.play('open');
    paint();
    scrim.focus({ preventScroll: true });
  }
  reopen.addEventListener('click', open);
  scrim.addEventListener('pointerdown', (e) => { if (e.target === scrim) close(); });
  let hover = false;
  st.frame.addEventListener('pointerenter', () => { hover = true; });
  st.frame.addEventListener('pointerleave', () => { hover = false; });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && S.open && (hover || el.contains(document.activeElement))) { e.preventDefault(); close(); }
  });

  // ---------------------------------------------------------------- клики

  win.addEventListener('mousedown', (e) => { if (e.target.closest('.k-btn, .k-tab, .k-close')) e.preventDefault(); });
  win.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act;
    if (act !== 'notice-x') sfx.play(act === 'theme-pick' || act === 'pv-theme' ? 'tick' : 'click');
    switch (act) {
      case 'close': close(); break;
      case 'tab':
        if (t.dataset.tab === 'play') { S.tab = 'play'; paint(); break; }
        S.tab = t.dataset.tab;
        S.picking = null;
        paint();
        break;
      case 'notice-x': S.notice = null; paint(); break;
      case 'filter': S.filter = t.dataset.v; paintBody(); break;
      case 'pick': {
        const p = byId(t.dataset.id);
        S.picking = p.id;
        S.sel = new Set(p.rounds.flatMap((r, ri) => r.themes.map((_, ti) => `${ri}:${ti}`)));
        S.notice = null;
        paint();
        break;
      }
      case 'back': S.picking = null; paint(); break;
      case 'theme-pick': {
        const k = t.dataset.k;
        S.sel.has(k) ? S.sel.delete(k) : S.sel.add(k);
        paintBody();
        paintFoot();
        break;
      }
      case 'round': {
        const ri = Number(t.dataset.ri);
        const keys = byId(S.picking).rounds[ri].themes.map((_, ti) => `${ri}:${ti}`);
        const all = keys.every((k) => S.sel.has(k));
        keys.forEach((k) => (all ? S.sel.delete(k) : S.sel.add(k)));
        paintBody();
        paintFoot();
        break;
      }
      case 'play-pick': {
        const p = byId(S.picking);
        const s = selStats(p);
        S.picking = null;
        say('good', `Пак «${p.title}» выбран: ${n(s.themes, FORMS.theme)}, ${n(s.questions, FORMS.q)}. Дальше — табло «Своей игры».`, '#jeopardy', 'Посмотреть табло');
        sfx.play('reward');
        paint();
        break;
      }
      case 'del-ask': S.confirmDel = t.dataset.id; paintBody(); break;
      case 'del-no': S.confirmDel = null; paintBody(); break;
      case 'del': {
        const p = byId(t.dataset.id);
        S.packs = S.packs.filter((x) => x.id !== p.id);
        S.confirmDel = null;
        say('info', `Пак «${p.title}» удалён.`);
        paint();
        break;
      }
      case 'choose': if (S.level >= NEED_LEVEL) input.click(); break;
      case 'sample-ver': S.sample = Number(t.dataset.v); paintBody(); break;
      case 'sample': {
        t.disabled = true;
        try {
          const blob = await buildSample(S.sample, true);
          await handleFile(new File([blob], `primer-rakushka-v${S.sample}.siq`, { type: 'application/zip' }), true); // пример смотрят все; сохранить — с 3-го уровня
        } catch (err) {
          console.warn('пример:', err);
          S.up = { phase: 'error', msg: 'Не получилось собрать пример. Обнови страницу и попробуй ещё раз.' };
          paint();
        }
        break;
      }
      case 'sample-dl': {
        t.disabled = true;
        try {
          const blob = await buildSample(S.sample, false);
          const a = h('a');
          a.href = URL.createObjectURL(blob);
          a.download = `primer-rakushka-v${S.sample}.siq`;
          document.body.append(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        } catch (err) {
          console.warn('пример:', err);
        }
        t.disabled = false;
        break;
      }
      case 'again': releaseFiles(S.up.files); S.up = { phase: 'idle' }; paint(); break;
      case 'shrink': runShrink(); break;
      case 'pv-theme':
        S.audio?.pause();
        S.up.ri = Number(t.dataset.ri);
        S.up.ti = Number(t.dataset.ti);
        body.querySelectorAll('.pk-nav .k-nav-item').forEach((b) => b.classList.toggle('is-on', b === t));
        renderQs();
        break;
      case 'play': {
        const f = S.up.files.find((x) => x.id === t.dataset.file);
        if (!f) break;
        S.audio?.pause();
        S.audio = new Audio(await fileUrl(f));
        S.audio.play().catch(() => {});
        break;
      }
      case 'save-up': save(S.up.pack, S.up.format === 'siq' ? 'collection' : 'scroll', true); break;
      case 'nw-round': S.nw.round = Number(t.dataset.i); body.querySelector('[data-side]').innerHTML = sideHtml(); break;
      case 'save-nw': save(S.nw.res.pack, 'scroll'); break;
      default: break;
    }
  });
  win.addEventListener('input', (e) => {
    if (e.target.matches('[data-search]')) {
      S.q = e.target.value;
      body.querySelector('[data-grid]').innerHTML = gridHtml();
    }
  });
  input.addEventListener('change', () => {
    const f = input.files?.[0];
    input.value = '';
    if (f) handleFile(f);
  });

  // ---------------------------------------------------------------- перетаскивание файла: только пока открыта вкладка «Загрузить»
  // Вне неё страницу не трогаем. Над самой рамкой окна, пока вкладка другая, только не даём браузеру открыть файл и подсказываем.

  const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
  const live = () => S.open && S.tab === 'upload' && S.up.phase !== 'busy' && S.up.phase !== 'preview' && S.level >= NEED_LEVEL;
  const dropEl = () => body.querySelector('[data-drop]');
  let overT = 0;
  const clearOver = () => { dropEl()?.classList.remove('is-over'); hint.hidden = true; };
  window.addEventListener('dragover', (e) => {
    if (!hasFiles(e)) return;
    const onFrame = st.frame.contains(e.target);
    if (live()) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      dropEl()?.classList.add('is-over');
    } else if (onFrame) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'none';
      hint.textContent = S.level < NEED_LEVEL ? `Загружать паки можно с ${NEED_LEVEL}-го уровня` : S.up.phase === 'preview' ? 'Сначала сохрани пак или выбери другой файл' : 'Файл бросай на вкладке «Загрузить»';
      hint.hidden = false;
    } else return;
    clearTimeout(overT);
    overT = setTimeout(clearOver, 140);
  });
  window.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    const onFrame = st.frame.contains(e.target);
    if (live()) {
      e.preventDefault();
      clearOver();
      const f = e.dataTransfer.files?.[0];
      if (f) handleFile(f);
    } else if (onFrame) {
      e.preventDefault();
      clearOver();
    }
  });

  // ---------------------------------------------------------------- пояснения под сценой
  const notes = h('div', 'pg-grid3 pk-notes');
  notes.innerHTML = `
    <div class="pg-card"><h3>Как пак попадает в игру</h3>
      <ol class="pk-steps"><li><b>Браузер разбирает</b> пак и ужимает картинки до 1280 px (WebP) — ты видишь результат до загрузки.</li><li><b>Сервер проверяет</b> и хранит: схему, размеры, заголовки файлов. Загрузка — по билету на 5 минут.</li><li><b>Все видят пак</b> во вкладке «Паки» и выбирают темы перед игрой.</li></ol></div>
    <div class="pg-card"><h3>Пределы</h3>
      <ul><li>До <b>600 вопросов</b> и <b>30 МБ</b> файлов на пак; на сервере всего 2 ГБ.</li><li><b>5 паков в день</b> на игрока; загрузка — <b>с 3-го уровня</b> (защита от мусора, решение можно снять).</li><li>Звук — до 60 с и 1,5 МБ на файл. Видео и веб-страницы пока пропускаем — с пометкой «видео пропущено».</li></ul></div>
    <div class="pg-card"><h3>Кто удаляет</h3>
      <p><b>Автор пака</b> и <b>владелец набережной</b> (список <code>QUIZ_ADMINS</code>). У чужого пака кнопки «Удалить» нет — рядом написано почему.</p>
      <p>Встроенный пак «Набережная» не удаляется. Паки 18+ помечены на карточке и в выборе тем.</p></div>`;
  el.append(notes);
}

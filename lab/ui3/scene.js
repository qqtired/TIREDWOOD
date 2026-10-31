// Хозяин сцены: ставит атрибуты <html> как в игре, подложку и снятый HUD; добавляет макеты подписей над головами.
const params = new URLSearchParams(location.hash.slice(1).replace(/^([^&=]+)(&|$)/, 's=$1$2'));
const id = params.get('s') || 'plaza';
const BG = { plaza: 'bg-plaza', 'fishing-wait': 'bg-fishing', 'fishing-catch': 'bg-fishing', farm: 'bg-farm', race: 'bg-race', paintball: 'bg-paintball', fort: 'bg-fort', billiards: 'bg-billiards' };
const root = document.documentElement;

// 31.10: сцены, которых нет в scene.html, подгружаются по имени (scenes/<сцена>.js, снимает addscene.mjs); подложка — поле bg
// сцены (img/<bg>.jpg), экран телефона — поля vw и vh (иначе 1440×900).
if (window.__SCENES?.[id]) build(window.__SCENES[id]);
else {
  const s = document.createElement('script');
  s.src = `scenes/${id}.js`;
  s.onload = () => build(window.__SCENES[id]);
  document.head.append(s);
}

function build(scene) {
  for (const [k, v] of Object.entries(scene.attrs)) if (k !== 'data-hud' && k !== 'lang') root.setAttribute(k, v);
  root.dataset.hud = params.get('v') || 'light';
  root.dataset.scene = id;
  if (scene.vw) { root.style.setProperty('--lab-w', `${scene.vw}px`); root.style.setProperty('--lab-h', `${scene.vh}px`); }
  const bg = scene.bg ?? BG[id];
  if (bg) document.querySelector('.lab-bg').src = `img/${bg}.jpg`;
  document.body.insertAdjacentHTML('beforeend', scene.html);
  // строки чата в игре тают через 8 с (.is-old) — на странице показываем их свежими (у бильярда — как в игре: иначе лезут на панель стола)
  if (id !== 'billiards') for (const el of document.querySelectorAll('.k-chat-line.is-old')) el.classList.remove('is-old');

  // Ники и реплики над головами рисуются в игре в 3D (render/leveltag.ts) — здесь их макет над желейкой игрока,
  // «Сейчас» повторяет игру, варианты перекрашивают .lab-tag и .lab-bubble.
  if (id === 'plaza') {
    document.body.insertAdjacentHTML('beforeend', `<div class="lab-world" aria-hidden="true">
      <div class="lab-bubble" style="left: 720px; top: 372px">Кто на рыбалку? Я к Семёну</div>
      <div class="lab-tag" style="left: 720px; top: 448px"><i class="lab-tag-lv">12</i><b>Клякса</b></div>
      <div class="lab-tag lab-tag--npc" style="left: 1188px; top: 300px"><b>Дед Семён</b><span>скупает рыбу</span></div>
    </div>`);
  }

  // v2: вариант может перестроить снятую разметку (v/<id>.js регистрирует window.__HUDV[<id>](scene)) — один раз после вставки
  window.__HUDV?.[root.dataset.hud]?.(id);
  root.dataset.ready = '1';
}

addEventListener('message', (e) => {
  const v = e.data?.hud;
  if (typeof v !== 'string' || v === root.dataset.hud) return;
  // перестроенный HUD обратно не собрать — переход с ним или на него пересобирает сцену
  if (window.__HUDV?.[root.dataset.hud] || window.__HUDV?.[v]) location.hash = `${id}&v=${v}`;
  else root.dataset.hud = v;
});
// другая сцена — страница index.html меняет адрес iframe: сцена собирается заново
addEventListener('hashchange', () => location.reload());

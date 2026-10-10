/* ===================================================================
   «Подземелье» — страница дизайна. Один файл, данные грузятся fetch-ем.
   =================================================================== */

/* ---- 1. СПИСОК МОДЕЛЕЙ (одно место для правки) ----------------------
   id — основное имя файла; alt — запасные имена (если помощник назвал иначе);
   glb / preview — пути по умолчанию; реально есть ли файл, страница узнаёт из models/manifest.json
   (его делает tools/survivors/page/sync.mjs). budget — бюджет треугольников из brief.md / level.md.
   art — запасная картинка из концепт-арта: [файл, x0, y0, ширина, высота] в долях листа. */
const MODELS = [
  { id: 'lamplighter', alt: ['hero', 'fonarshik'], name: 'Фонарщик', group: 'hero', budget: 8000, glb: 'models/lamplighter.glb', preview: 'models/previews/lamplighter-3q.jpg', art: ['2-hero', 0, 0, 1, 1, 'contain'] },

  { id: 'rat', name: 'Погребная крыса', group: 'enemy', tier: 'Рядовой', budget: 2000, glb: 'models/rat.glb', preview: 'models/previews/rat-3q.jpg', art: ['3-mobs', .02, .085, .30, .45] },
  { id: 'bat', name: 'Летучая мышь', group: 'enemy', tier: 'Рядовой', budget: 2000, glb: 'models/bat.glb', preview: 'models/previews/bat-3q.jpg', art: ['3-mobs', .325, 0, .32, .48] },
  { id: 'slime', alt: ['slug'], name: 'Слизень-повидло', group: 'enemy', tier: 'Рядовой', budget: 2000, glb: 'models/slime.glb', preview: 'models/previews/slime-3q.jpg', art: ['3-mobs', .64, .06, .36, .54] },
  { id: 'shroom', name: 'Грибник', group: 'enemy', tier: 'Рядовой', budget: 2000, glb: 'models/shroom.glb', preview: 'models/previews/shroom-3q.jpg', art: ['3-mobs', 0, .40, .37, .555] },
  { id: 'beetle', name: 'Щитожук', group: 'enemy', tier: 'Рядовой', budget: 2000, glb: 'models/beetle.glb', preview: 'models/previews/beetle-3q.jpg', art: ['3-mobs', .31, .38, .38, .57] },
  { id: 'spitter', name: 'Плевун', group: 'enemy', tier: 'Рядовой', budget: 2000, glb: 'models/spitter.glb', preview: 'models/previews/spitter-3q.jpg', art: ['3-mobs', .67, .45, .32, .48] },
  { id: 'larva', name: 'Личинка', group: 'enemy', tier: 'Свита босса', budget: 2000, glb: 'models/larva.glb', preview: 'models/previews/larva-3q.jpg' },
  { id: 'barrel', alt: ['cooper', 'bochar', 'barrel_troll'], name: 'Бочар', group: 'enemy', tier: 'Элита', budget: 5000, glb: 'models/barrel.glb', preview: 'models/previews/barrel-3q.jpg', art: ['4-elites-boss', .04, .31, .46, .69] },
  { id: 'shaman', name: 'Грибной шаман', group: 'enemy', tier: 'Элита', budget: 5000, glb: 'models/shaman.glb', preview: 'models/previews/shaman-3q.jpg', art: ['4-elites-boss', .60, .38, .40, .60] },

  { id: 'povidl', alt: ['boss', 'worm'], name: 'Старый Повидл', group: 'boss', budget: 20000, glb: 'models/povidl.glb', preview: 'models/previews/povidl-3q.jpg', art: ['4-elites-boss', .30, 0, .46, .69] },

  // постройки: набор kit_buildings / kit_extras / kit_mine. nodes — какие корневые узлы набора показывать
  { id: 'altar', name: 'Алтарь света', group: 'building', sub: 'Базовые', budget: 3000, kit: 'kit_buildings', nodes: ['altar'], art: ['6-interactables', 0, 0, .5, .5] },
  { id: 'brazier', name: 'Жаровня', group: 'building', sub: 'Базовые', budget: 1400, kit: 'kit_buildings', nodes: ['brazier', 'brazier_tipped'], art: ['6-interactables', .5, 0, .5, .5] },
  { id: 'cursed_chest', alt: ['chest'], name: 'Проклятый сундук', group: 'building', sub: 'Базовые', budget: 2500, kit: 'kit_buildings', nodes: ['cursed_chest'], art: ['6-interactables', 0, .5, .5, .5] },
  { id: 'healing_spring', alt: ['spring'], name: 'Целебный родник', group: 'building', sub: 'Базовые', budget: 3000, kit: 'kit_buildings', nodes: ['healing_spring'], art: ['6-interactables', .5, .5, .5, .5] },
  { id: 'chest_column', name: 'Колонна колоннады', group: 'building', sub: 'Базовые', budget: 700, kit: 'kit_buildings', nodes: ['chest_column'] },
  { id: 'lantern_post', name: 'Фонарь-маяк', group: 'building', sub: 'Дополнительные (на выбор)', budget: 600, kit: 'kit_extras', nodes: ['lantern_post'] },
  { id: 'minecart', name: 'Вагонетка', group: 'building', sub: 'Дополнительные (на выбор)', budget: 1800, kit: 'kit_mine', nodes: ['minecart', 'minecart_broken'] },
  { id: 'bell_frame', name: 'Колокол-магнит', group: 'building', sub: 'Дополнительные (на выбор)', budget: 2500, kit: 'kit_extras', nodes: ['bell_frame'] },
  { id: 'powder_keg', name: 'Пороховая бочка', group: 'building', sub: 'Дополнительные (на выбор)', budget: 500, kit: 'kit_extras', nodes: ['powder_keg'] },
  { id: 'mushroom_trampoline', name: 'Гриб-батут', group: 'building', sub: 'Дополнительные (на выбор)', budget: 1500, kit: 'kit_extras', nodes: ['mushroom_trampoline'] },
  { id: 'bear_trap', name: 'Капкан', group: 'building', sub: 'Дополнительные (на выбор)', budget: 300, kit: 'kit_extras', nodes: ['bear_trap'] },
  { id: 'mine_lift', name: 'Шахтный лифт', group: 'building', sub: 'Дополнительные (на выбор)', budget: 4000, kit: 'kit_extras', nodes: ['mine_lift'] },
  { id: 'forgotten_forge', name: 'Забытая кузня', group: 'building', sub: 'Дополнительные (на выбор)', budget: 4000, kit: 'kit_extras', nodes: ['forgotten_forge'] },

  // окружение: наборы kit_common, kit_cellars, kit_mushrooms, kit_grotto, kit_mine, kit_jam
  { id: 'rock_mass', name: 'Опорная скала', group: 'env', sub: 'Общее', budget: 4000, kit: 'kit_common', nodes: ['rock_mass_a', 'rock_mass_b', 'rock_mass_c'] },
  { id: 'rock_ridge', name: 'Каменная гряда', group: 'env', sub: 'Общее', budget: 4000, kit: 'kit_common', nodes: ['rock_ridge_6', 'rock_ridge_10', 'rock_ridge_14'] },
  { id: 'stalagmite', name: 'Сталагмит', group: 'env', sub: 'Общее', budget: 600, kit: 'kit_common', nodes: ['stalagmite_a', 'stalagmite_b', 'stalagmite_c', 'stalagmite_d'] },
  { id: 'rubble', name: 'Завал', group: 'env', sub: 'Общее', budget: 1000, kit: 'kit_common', nodes: ['rubble_a', 'rubble_b'] },
  { id: 'pit_rim', name: 'Кромка провала', group: 'env', sub: 'Общее', budget: 900, kit: 'kit_common', nodes: ['pit_rim'] },
  { id: 'torch_stand', name: 'Факел на стойке', group: 'env', sub: 'Общее', budget: 250, kit: 'kit_common', nodes: ['torch_stand_floor', 'torch_stand_wall'] },
  { id: 'floor_decal_kit', name: 'Мелкий декор пола', group: 'env', sub: 'Общее', budget: 300, kit: 'kit_common', nodes: ['floor_decal_kit_pebbles', 'floor_decal_kit_gravel', 'floor_decal_kit_slabs', 'floor_decal_kit_crack', 'floor_decal_kit_bottle', 'floor_decal_kit_shards', 'floor_decal_kit_shroomlets', 'floor_decal_kit_crystal_shards', 'floor_decal_kit_sleeper', 'floor_decal_kit_jam_drops', 'floor_decal_kit_moss', 'floor_decal_kit_chain'] },
  { id: 'brick_pillar', name: 'Кирпичная колонна', group: 'env', sub: 'Погреба', budget: 900, kit: 'kit_cellars', nodes: ['brick_pillar_a', 'brick_pillar_b'] },
  { id: 'cellar_barrel', name: 'Бочка', group: 'env', sub: 'Погреба', budget: 400, kit: 'kit_cellars', nodes: ['barrel'] },
  { id: 'barrel_stack', name: 'Стопка бочек', group: 'env', sub: 'Погреба', budget: 1600, kit: 'kit_cellars', nodes: ['barrel_stack_a', 'barrel_stack_b'] },
  { id: 'wine_rack', name: 'Винный стеллаж', group: 'env', sub: 'Погреба', budget: 2500, kit: 'kit_cellars', nodes: ['wine_rack_a', 'wine_rack_b'] },
  { id: 'crate_stack', name: 'Ящики', group: 'env', sub: 'Погреба', budget: 500, kit: 'kit_cellars', nodes: ['crate_stack_a', 'crate_stack_b'] },
  { id: 'giant_barrel', name: 'Бочка-великан', group: 'env', sub: 'Погреба', budget: 4000, kit: 'kit_cellars', nodes: ['giant_barrel'] },
  { id: 'well_stairs', name: 'Лестница и световой колодец', group: 'env', sub: 'Погреба', budget: 6000, kit: 'kit_cellars', nodes: ['well_stairs'] },
  { id: 'gate_arch', name: 'Кирпичная арка', group: 'env', sub: 'Погреба', budget: 2000, kit: 'kit_cellars', nodes: ['gate_arch'] },
  { id: 'mushroom_big', name: 'Гриб-великан', group: 'env', sub: 'Грибная пещера', budget: 2000, kit: 'kit_mushrooms', nodes: ['mushroom_big_a', 'mushroom_big_b', 'mushroom_big_c'] },
  { id: 'mushroom_cluster', name: 'Кучка грибов', group: 'env', sub: 'Грибная пещера', budget: 600, kit: 'kit_mushrooms', nodes: ['mushroom_cluster_a', 'mushroom_cluster_b', 'mushroom_cluster_c'] },
  { id: 'puffball', name: 'Дождевик', group: 'env', sub: 'Грибная пещера', budget: 800, kit: 'kit_mushrooms', nodes: ['puffball_a', 'puffball_b'] },
  { id: 'root_ridge', name: 'Корень', group: 'env', sub: 'Грибная пещера', budget: 1500, kit: 'kit_mushrooms', nodes: ['root_ridge_5', 'root_ridge_9'] },
  { id: 'ring_mushroom', name: 'Гриб Ведьмина круга', group: 'env', sub: 'Грибная пещера', budget: 800, kit: 'kit_mushrooms', nodes: ['ring_mushroom'] },
  { id: 'mushroom_patriarch', name: 'Гриб-Патриарх', group: 'env', sub: 'Грибная пещера', budget: 8000, kit: 'kit_mushrooms', nodes: ['mushroom_patriarch'] },
  { id: 'crystal_cluster', name: 'Друза кристаллов', group: 'env', sub: 'Кристальный грот', budget: 1400, kit: 'kit_grotto', nodes: ['crystal_cluster_s', 'crystal_cluster_m', 'crystal_cluster_l'] },
  { id: 'crystal_druse', name: 'Поющая друза', group: 'env', sub: 'Кристальный грот', budget: 5000, kit: 'kit_grotto', nodes: ['crystal_druse'] },
  { id: 'lake_island', name: 'Остров на озере', group: 'env', sub: 'Кристальный грот', budget: 3000, kit: 'kit_grotto', nodes: ['lake_island'] },
  { id: 'crystal_fangs', name: 'Кристальные клыки', group: 'env', sub: 'Кристальный грот', budget: 1200, kit: 'kit_grotto', nodes: ['crystal_fangs'] },
  { id: 'timber_support', name: 'Крепь', group: 'env', sub: 'Старая шахта', budget: 600, kit: 'kit_mine', nodes: ['timber_support_a', 'timber_support_b'] },
  { id: 'ore_pile', name: 'Рудная куча', group: 'env', sub: 'Старая шахта', budget: 1000, kit: 'kit_mine', nodes: ['ore_pile_a', 'ore_pile_b'] },
  { id: 'rail_straight_4m', name: 'Рельсы прямые', group: 'env', sub: 'Старая шахта', budget: 400, kit: 'kit_mine', nodes: ['rail_straight_4m'] },
  { id: 'rail_curve', name: 'Рельсы, поворот', group: 'env', sub: 'Старая шахта', budget: 700, kit: 'kit_mine', nodes: ['rail_curve'] },
  { id: 'rail_buffer', name: 'Рельсы, тупик', group: 'env', sub: 'Старая шахта', budget: 500, kit: 'kit_mine', nodes: ['rail_buffer'] },
  { id: 'kopyor', name: 'Копёр', group: 'env', sub: 'Старая шахта', budget: 7000, kit: 'kit_mine', nodes: ['kopyor'] },
  { id: 'ore_heap', name: 'Рудный отвал', group: 'env', sub: 'Старая шахта', budget: 3500, kit: 'kit_mine', nodes: ['ore_heap'] },
  { id: 'hanging_lamp', name: 'Шахтная лампа', group: 'env', sub: 'Старая шахта', budget: 150, kit: 'kit_mine', nodes: ['hanging_lamp'] },
  { id: 'jam_vat', name: 'Бродильный чан', group: 'env', sub: 'Варенные жилы', budget: 1500, kit: 'kit_jam', nodes: ['jam_vat_a', 'jam_vat_b'] },
  { id: 'jam_cauldron', name: 'Котёл Барона', group: 'env', sub: 'Варенные жилы', budget: 9000, kit: 'kit_jam', nodes: ['jam_cauldron'] },
  { id: 'jam_rock', name: 'Камень с вареньем', group: 'env', sub: 'Варенные жилы', budget: 800, kit: 'kit_jam', nodes: ['jam_rock_a', 'jam_rock_b'] },
  { id: 'jam_puddle_rim', name: 'Кромка лужи варенья', group: 'env', sub: 'Варенные жилы', budget: 500, kit: 'kit_jam', nodes: ['jam_puddle_rim'] },
  { id: 'jam_beams', name: 'Балки с потёками', group: 'env', sub: 'Варенные жилы', budget: 1500, kit: 'kit_jam', nodes: ['jam_beams'] },

  { id: 'plaza_cave_entrance', name: 'Вход в пещеру на площади', group: 'plaza', budget: 12000, kit: 'plaza_entrance', nodes: ['plaza_cave_entrance'], art: ['7-entrance', 0, 0, 1, 1, 'cover'] },
  { id: 'plaza_records_board', name: 'Доска рекордов', group: 'plaza', budget: 1200, kit: 'plaza_entrance', nodes: ['plaza_records_board'], art: ['7-entrance', .66, .18, .34, .66] },
];
// подписи кнопок анимаций: полное имя клипа -> по-русски, иначе по последнему слову
const CLIP_FULL = { lamp_swing: 'качание', kopyor_spin: 'вращение', cave_eyes_blink: 'моргание', altar_charge: 'зарядка', brazier_tip: 'опрокидывание', chest_open: 'открытие', spring_refill: 'наполнение', trap_snap: 'захлоп', bell_ring: 'звон', lift_ride: 'подъём', trampoline_bounce: 'подскок', keg_fuse: 'фитиль', beetle_shield_bash: 'удар щитом', spitter_spit: 'плевок', shaman_cast: 'заклинание', cooper_charge: 'таран' };
const CLIP_WORD = { idle: 'покой', run: 'бег', walk: 'ходьба', move: 'ползёт', fly: 'полёт', attack: 'атака', hit: 'получает урон', death: 'смерть', dash: 'рывок', strike: 'удар Q', swing: 'взмах', burrow: 'зарывается', emerge: 'выныривает', roar: 'рёв', slam: 'удар о землю', spit: 'плевок', charge: 'таран', cast: 'заклинание' };
const CLIP_ORDER = ['idle', 'walk', 'fly', 'run', 'move', 'attack', 'strike', 'swing', 'dash', 'charge', 'cast', 'spit', 'slam', 'roar', 'burrow', 'emerge', 'hit', 'death'];
const clipRank = (n) => { const i = CLIP_ORDER.indexOf(n.split('_').pop()); return i < 0 ? 50 : i; };
const clipLabel = (n) => CLIP_FULL[n] || CLIP_WORD[n.split('_').pop()] || n;
const GROUPS = [
  ['hero', 'Герой'], ['enemy', 'Враги'], ['boss', 'Босс'], ['building', 'Постройки'], ['env', 'Окружение'], ['plaza', 'Вход на площади'],
];
const ART = [
  ['1-key-art', 'Фонарщик в орде', 'Ключевой кадр: герой раскручивает фонарь, вокруг орда Барона Варенья. Камера сверху, как в игре.'],
  ['2-hero', 'Фонарщик', 'Лист героя: спереди, сбоку, сзади и сверху — как он читается с камеры.'],
  ['3-mobs', 'Рядовые враги', 'Крыса, мышь, слизень, грибник, щитожук, плевун в одном масштабе.'],
  ['4-elites-boss', 'Элиты и босс', 'Бочар, Грибной шаман и Старый Повидл — сравнение размеров.'],
  ['5-biomes', 'Зоны', 'Погреба, грибная пещера, кристальный грот, варенные жилы. Пол светлее стен.'],
  ['6-interactables', 'Постройки', 'Алтарь света, жаровня, проклятый сундук, целебный родник.'],
  ['7-entrance', 'Вход на площади', 'Светлая набережная и тёмная арка пещеры «Подземелье», рядом доска рекордов.'],
];
const SECTIONS = [['top', 'О режиме'], ['play', 'Как играется'], ['hero', 'Герой'], ['weapons', 'Оружие'], ['levelup', 'Карточки'], ['bestiary', 'Бестиарий'], ['waves', 'Волны'], ['boss', 'Босс'], ['map', 'Карта'], ['buildings', 'Постройки'], ['rewards', 'Награды'], ['hud', 'HUD'], ['models', 'Модели'], ['art', 'Концепт-арт'], ['decide', 'Решения']];
const THREE_URLS = [
  'https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/loaders/GLTFLoader.js',
  'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/OrbitControls.js',
];

/* ---- 2. ПОМОЩНИКИ --------------------------------------------------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = (n, d = 0) => Number(n).toLocaleString('ru-RU', { maximumFractionDigits: d, minimumFractionDigits: 0 });
const nf2 = (n) => nf(n, 2);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (d, L = 240) => d - L * Math.round(d / L);
const mod = (v, L = 240) => ((v % L) + L) % L;
function safe(name, fn) { try { return fn(); } catch (e) { console.error('[Подземелье] ' + name + ':', e); } }
function isEditable(t) { return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable); }
function onVisible(el, cb, margin = '120px') {
  if (!('IntersectionObserver' in window)) { cb(true); return; }
  new IntersectionObserver((es) => cb(es[es.length - 1].isIntersecting), { rootMargin: margin }).observe(el);
}
function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.async = false; s.onload = res; s.onerror = () => rej(new Error('не загрузился ' + src)); document.head.appendChild(s); });
}
async function loadJSON(u) { const r = await fetch(u); if (!r.ok) throw new Error(u + ': ' + r.status); return r.json(); }
// кусок концепт-арта как фон: [файл, x0, y0, ширина, высота] в долях листа
function cropCss(spec) {
  const [img, x0, y0, wf, hf, fit] = spec;
  if (wf >= 1 && hf >= 1) return `background-image:url(art/${img}.jpg);background-size:${fit || 'cover'};background-position:center;`;
  const px = wf >= 1 ? 0 : x0 / (1 - wf) * 100, py = hf >= 1 ? 0 : y0 / (1 - hf) * 100;
  return `background-image:url(art/${img}.jpg);background-size:${100 / wf}% ${100 / hf}%;background-position:${px}% ${py}%;`;
}
const GLYPH_WORM = '<svg viewBox="0 0 40 40" width="70%" height="70%" aria-hidden="true"><g fill="#6e2a7f" stroke="#d6a8ff" stroke-width="1.4"><circle cx="9" cy="28" r="4"/><circle cx="16" cy="24" r="4.6"/><circle cx="24" cy="20" r="5"/><circle cx="31" cy="14" r="5.4"/></g><circle cx="33" cy="13" r="1.3" fill="#fff"/></svg>';

/* ---- 3. ДАННЫЕ ----------------------------------------------------- */
const S = { D: null, L: null, B: null, MF: null };       // design, level, balance rows, manifest
const mobById = () => Object.fromEntries(S.D.mobs.map((m) => [m.id, m]));
const wById = () => Object.fromEntries(S.D.weapons.map((w) => [w.id, w]));
const pById = () => Object.fromEntries(S.D.passives.map((p) => [p.id, p]));

// что реально есть из моделей (manifest.json от sync.mjs)
function resolveModels() {
  const MF = S.MF, PV = (MF && MF.previews) || [];
  for (const m of MODELS) {
    const names = [m.id, ...(m.alt || [])];
    m.glbFile = null; m.prevFile = null; m.prevTop = null; m.prevAll = []; m.bytes = 0; m.isKit = false;
    if (MF && MF.glb) {
      // сначала набор (kit): в нём лежат десятки пропов как корневые узлы; потом отдельный файл по имени
      if (m.kit && MF.glb[m.kit + '.glb'] != null) { m.glbFile = 'models/' + m.kit + '.glb'; m.bytes = MF.glb[m.kit + '.glb']; m.isKit = true; }
      else for (const n of names) if (MF.glb[n + '.glb'] != null) { m.glbFile = 'models/' + n + '.glb'; m.bytes = MF.glb[n + '.glb']; break; }
    }
    for (const n of names) {
      const list = PV.filter((f) => f.startsWith(n + '-'));
      if (list.length) { const q = list.find((f) => f.endsWith('-3q.jpg')) || list[0]; m.prevFile = 'models/previews/' + q; const t = list.find((f) => f.endsWith('-top.jpg')); m.prevTop = t ? 'models/previews/' + t : null; m.prevAll = list.map((f) => 'models/previews/' + f); break; }
    }
    if (!m.prevFile && m.kit) {
      const kp = PV.find((f) => f === m.kit + '.jpg');
      if (kp) { m.prevFile = 'models/previews/' + kp; m.prevAll = [m.prevFile, ...PV.filter((f) => f.startsWith(m.kit + '-')).map((f) => 'models/previews/' + f)]; }
    }
    m.state = m.glbFile ? 'ready' : m.prevFile ? 'preview' : 'none';
  }
}
const modelById = (id) => MODELS.find((m) => m.id === id);

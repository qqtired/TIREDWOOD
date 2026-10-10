// Рисует docs/survivors/map.svg по level-data.json
import fs from 'fs';
const OUT = '/Users/tired/Desktop/game-opus-survivors/docs/survivors';
const D = JSON.parse(fs.readFileSync(`${OUT}/level-data.json`, 'utf8'));
const L = D.map.L, K = 4, MX = 70, MY = 150; // масштаб 4 px/м
const W = 1720, H = 1440;
const f = (v) => Math.round(v * 10) / 10;
const px = (x) => f(MX + x * K), py = (z) => f(MY + z * K);
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const FONT = "font-family=\"Rubik, 'Segoe UI', Arial, sans-serif\"";
let o = '';
const add = (s) => { o += s + '\n'; };

const FLOOR = { cellars: '#6e5442', mushrooms: '#4e5a37', crystals: '#30535a', mine: '#5f4f3c', jam: '#53394f' };
const LABEL = { cellars: '#f2c48d', mushrooms: '#d7e39a', crystals: '#8ff0e3', mine: '#f0c983', jam: '#e2a6ff' };

// копии объекта, пересекающие карту (тор)
function offsets(b, m = 2) {
  const res = [];
  for (const ox of [-L, 0, L]) for (const oz of [-L, 0, L]) {
    if (b[2] + ox < -m || b[0] + ox > L + m || b[3] + oz < -m || b[1] + oz > L + m) continue;
    res.push([ox, oz]);
  }
  return res;
}
const bb = (s) => s.t === 'c' ? [s.x - s.r, s.z - s.r, s.x + s.r, s.z + s.r] : [Math.min(s.x0, s.x1) - s.r, Math.min(s.z0, s.z1) - s.r, Math.max(s.x0, s.x1) + s.r, Math.max(s.z0, s.z1) + s.r];
function shape(s, attrs) {
  let r = '';
  for (const [ox, oz] of offsets(bb(s))) {
    if (s.t === 'c') r += `<circle cx="${px(s.x + ox)}" cy="${py(s.z + oz)}" r="${f(s.r * K)}" ${attrs}/>`;
    else r += `<line x1="${px(s.x0 + ox)}" y1="${py(s.z0 + oz)}" x2="${px(s.x1 + ox)}" y2="${py(s.z1 + oz)}" stroke-width="${f(s.r * 2 * K)}" stroke-linecap="round" ${attrs}/>`;
  }
  return r;
}
function pts(x, z, fn) { let r = ''; for (const [ox, oz] of offsets([x - 3, z - 3, x + 3, z + 3], 4)) r += fn(px(x + ox), py(z + oz)); return r; }

// ---------- defs
add(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" ${FONT}>`);
add(`<defs>
<clipPath id="mapclip"><rect x="${MX}" y="${MY}" width="${L * K}" height="${L * K}"/></clipPath>
<clipPath id="miniclip"><rect x="0" y="0" width="240" height="240"/></clipPath>
<filter id="blend" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="9"/></filter>
<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="softglow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="6"/></filter>
<radialGradient id="warm"><stop offset="0" stop-color="#ffb347" stop-opacity=".55"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>
<radialGradient id="cold"><stop offset="0" stop-color="#7fe7dc" stop-opacity=".5"/><stop offset="1" stop-color="#7fe7dc" stop-opacity="0"/></radialGradient>
<radialGradient id="lilac"><stop offset="0" stop-color="#c77dff" stop-opacity=".55"/><stop offset="1" stop-color="#c77dff" stop-opacity="0"/></radialGradient>
<radialGradient id="day"><stop offset="0" stop-color="#fff4d6" stop-opacity=".8"/><stop offset="1" stop-color="#fff4d6" stop-opacity="0"/></radialGradient>
<radialGradient id="vign" cx="50%" cy="50%" r="72%"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></radialGradient>
<marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#f2d39a"/></marker>
<marker id="ahl" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#d9a6ff"/></marker>
<pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="#d9a6ff" stroke-width="2" stroke-opacity=".5"/></pattern>
</defs>`);
add(`<rect width="${W}" height="${H}" fill="#120d0b"/>`);

// ---------- заголовок
add(`<text x="${MX}" y="50" font-size="34" font-weight="700" fill="#f6e3c4">Подземелье — карта-тор 240 × 240 м</text>`);
add(`<text x="${MX}" y="82" font-size="17" fill="#c9b39a">Вид сверху. Края склеены: ушёл за правый край — вышел слева, за нижний — сверху. Шва нет: мир рисуется кусками 24 × 24 м вокруг камеры.</text>`);
add(`<text x="${MX}" y="106" font-size="15" fill="#8f7d6b">Сетка — куски 24 м (10 × 10). Числа и координаты — docs/survivors/level-data.json, пояснения — level.md.</text>`);

// ---------- символ зон (для карты и мини-копий)
let zonesSym = '';
for (const z of D.zones) for (const ox of [-L, 0, L]) for (const oz of [-L, 0, L]) {
  zonesSym += `<polygon points="${z.polygon.map(([x, y]) => `${f(x + ox)},${f(y + oz)}`).join(' ')}" fill="${FLOOR[z.id]}"/>`;
}
add(`<symbol id="zones" viewBox="0 0 240 240"><g clip-path="url(#miniclip)">${zonesSym}</g></symbol>`);

// ---------- карта
add(`<g clip-path="url(#mapclip)">`);
add(`<g filter="url(#blend)" transform="translate(${MX},${MY}) scale(${K})">${zonesSym}</g>`);
// пятна света: жаровни и ориентиры (под всем остальным)
for (const b of D.buildings.brazier) add(pts(b.x, b.z, (X, Y) => `<circle cx="${X}" cy="${Y}" r="22" fill="url(#warm)" opacity=".55"/>`));
const LMGLOW = { well: 'day', ring: 'warm', lake: 'cold', kopyor: 'warm', cauldron: 'lilac', gallery: 'warm', bigbarrel: 'warm', patriarch: 'warm', druse: 'cold', heap: 'warm', brewery: 'lilac' };
for (const l of D.landmarks) add(pts(l.x, l.z, (X, Y) => `<circle cx="${X}" cy="${Y}" r="${f(Math.max(l.r * K * 2.2, 60))}" fill="url(#${LMGLOW[l.id]})"/>`));
// сетка кусков
for (let i = 1; i < 10; i++) {
  add(`<line x1="${px(i * 24)}" y1="${MY}" x2="${px(i * 24)}" y2="${MY + L * K}" stroke="#fff" stroke-opacity=".07"/>`);
  add(`<line x1="${MX}" y1="${py(i * 24)}" x2="${MX + L * K}" y2="${py(i * 24)}" stroke="#fff" stroke-opacity=".07"/>`);
}
// арены
for (const a of D.arenas) add(pts(a.x, a.z, (X, Y) => `<circle cx="${X}" cy="${Y}" r="${a.r * K}" fill="none" stroke="#f6e3c4" stroke-opacity=".28" stroke-width="1.5" stroke-dasharray="6 6"/>`));
// тракты
add(`<rect x="${px(120 - 3.5)}" y="${MY}" width="${7 * K}" height="${L * K}" fill="#d9b98a" opacity=".13"/>`);
add(`<line x1="${px(120)}" y1="${MY}" x2="${px(120)}" y2="${MY + L * K}" stroke="#d9b98a" stroke-opacity=".45" stroke-width="2" stroke-dasharray="14 10"/>`);
for (const dz of [-0.75, 0.75]) add(`<line x1="${MX}" y1="${py(204 + dz)}" x2="${MX + L * K}" y2="${py(204 + dz)}" stroke="#b8bcc2" stroke-width="1.6" stroke-opacity=".8"/>`);
add(`<line x1="${MX}" y1="${py(204)}" x2="${MX + L * K}" y2="${py(204)}" stroke="#8a5a32" stroke-width="10" stroke-dasharray="2 6" stroke-opacity=".8"/>`);
add(`<line x1="${px(168)}" y1="${py(204)}" x2="${px(168)}" y2="${py(199)}" stroke="#b8bcc2" stroke-width="5" stroke-opacity=".7"/>`);
// жила-компас
const vein = [[60, 0, 240, 180], [0, 180, 60, 240]];
for (const [a, b, c, d] of vein) {
  add(`<line x1="${px(a)}" y1="${py(b)}" x2="${px(c)}" y2="${py(d)}" stroke="#c77dff" stroke-width="9" stroke-opacity=".35" filter="url(#softglow)"/>`);
  add(`<line x1="${px(a)}" y1="${py(b)}" x2="${px(c)}" y2="${py(d)}" stroke="#e2b8ff" stroke-width="2.4"/>`);
}
// опасности
const HZ = { pit: 'fill="#060403" stroke="#3b2a1f" stroke-width="3"', water: 'fill="#4fb3b0" fill-opacity=".33" stroke="#8ae6da" stroke-opacity=".5" stroke-width="1.2"', jam: 'fill="#b25fd6" fill-opacity=".42" stroke="#d9a6ff" stroke-opacity=".6" stroke-width="1.2"' };
for (const h of D.hazards.filter((h) => h.kind === 'water')) add(shape(h, HZ.water));
for (const h of D.hazards.filter((h) => h.kind === 'pit')) add(shape(h, HZ.pit));
for (const h of D.hazards.filter((h) => h.kind === 'jam')) add(h.t === 'c' ? shape(h, HZ.jam) : shape(h, 'stroke="#b25fd6" stroke-opacity=".75"'));
// озеро: островок с друзой
add(`<circle cx="${px(180)}" cy="${py(54)}" r="${3.2 * K}" fill="#2c3b3f"/><circle cx="${px(180)}" cy="${py(54)}" r="${1.8 * K}" fill="#8ae6da" filter="url(#glow)"/>`);
// препятствия
const OC = {
  rock_mass: '#1a130f', brick_pillar: '#9a6248', barrel_stack: '#8a5a34', rubble: '#5b4a3e', wine_rack: '#6b4a30', crate_stack: '#a07850',
  mushroom_big: '#c98a5a', puffball: '#d8c9a8', root_ridge: '#5a4a30', stalagmite: '#2e2520', crystal_cluster: '#6fd6ca', rock_ridge: '#241b16',
  timber_support: '#a0703e', ore_pile: '#6a5a48', cart_wreck: '#7a7f86', vat: '#a0603c', jam_rock: '#3a2a38', ring_mushroom: '#ffd08a',
  chest_column: '#4a4252', giant_barrel: '#9a6236', patriarch_stem: '#e0b27a', druse: '#8ae6da', ore_heap: '#6e5d49', cauldron: '#c77dff', stairs: '#cdb89a',
};
const GLOWK = new Set(['crystal_cluster', 'ring_mushroom', 'druse', 'cauldron']);
for (const s of D.obstacles) {
  const c = OC[s.kind] || '#333';
  const stroke = s.kind === 'rock_mass' || s.kind === 'rock_ridge' ? 'stroke="#4a3a30" stroke-width="1.5"' : 'stroke="#000" stroke-opacity=".45" stroke-width="1"';
  if (s.t === 'c') add(shape(s, `fill="${c}" ${stroke} ${GLOWK.has(s.kind) ? 'filter="url(#glow)"' : ''}`));
  else add(shape(s, `stroke="${c}"`));
}
// постройки
for (const b of D.buildings.brazier) add(pts(b.x, b.z, (X, Y) => `<circle cx="${X}" cy="${Y}" r="3.2" fill="#ffb347" stroke="#3a1d08" stroke-width="1"/>`));
for (const a of D.buildings.altar) add(pts(a.x, a.z, (X, Y) => `<g filter="url(#glow)"><rect x="${X - 8}" y="${Y - 8}" width="16" height="16" transform="rotate(45 ${X} ${Y})" fill="#ffd35a" stroke="#5a3d10" stroke-width="2"/></g>`));
for (const s of D.buildings.spring) add(pts(s.x, s.z, (X, Y) => `<g filter="url(#glow)"><circle cx="${X}" cy="${Y}" r="10" fill="#7fe0d0" stroke="#e8fffb" stroke-width="2.5"/><path d="M${X} ${Y - 6} q5 7 0 11 q-5 -4 0 -11z" fill="#fff"/></g>`));
for (const c of D.buildings.cursedChest) add(pts(c.x, c.z, (X, Y) => `<g filter="url(#glow)"><rect x="${X - 10}" y="${Y - 7}" width="20" height="14" rx="2" fill="#7a3f98" stroke="#e2a6ff" stroke-width="2.5"/><circle cx="${X}" cy="${Y}" r="2.6" fill="#ffd35a"/></g>`));
// предложения (номера)
const P = D.proposals;
const badge = (n, x, z, col = '#e9e2d6') => pts(x, z, (X, Y) => `<g><circle cx="${X}" cy="${Y}" r="7.5" fill="#120d0b" fill-opacity=".85" stroke="${col}" stroke-width="1.6"/><text x="${X}" y="${Y + 4}" font-size="10.5" font-weight="700" text-anchor="middle" fill="${col}">${n}</text></g>`);
for (const p of P.lantern) add(badge(1, p.x, p.z, '#ffd27a'));
add(badge(2, P.minecart.station.x + 8, P.minecart.station.z, '#c8ccd2'));
for (const p of P.bell) add(badge(3, p.x, p.z, '#f0c983'));
for (const p of P.powderKegs) add(badge(4, p.x, p.z, '#ff8a6a'));
for (const p of P.mushroomTrampoline) add(badge(5, p.x, p.z, '#d7e39a'));
for (const p of P.traps) add(badge(6, p.x, p.z, '#c9b39a'));
for (const p of P.lift) add(badge(7, p.x, p.z, '#9fd8ff'));
for (const p of P.forge) add(badge(8, p.x, p.z, '#ffb070'));

// камера и кольцо появления у старта (120; 120) и у края (232; 40)
const cam = D.camera.groundCornersFromHero;
const quad = (hx, hz, grow) => {
  const c = [cam.topLeft, cam.topRight, cam.bottomRight, cam.bottomLeft].map(([x, z]) => [x, z]);
  const cx = 0, cz = (cam.topLeft[1] + cam.bottomLeft[1]) / 2;
  return c.map(([x, z]) => { const dx = x - cx, dz = z - cz, l = Math.hypot(dx, dz); return [hx + x + dx / l * grow * 1.35, hz + z + dz / l * grow]; });
};
const poly = (q, attrs) => `<polygon points="${q.map(([x, z]) => `${px(x)},${py(z)}`).join(' ')}" ${attrs}/>`;
for (const [hx, hz] of [[120, 120], [232, 128]]) {
  add(poly(quad(hx, hz, 9), 'fill="none" stroke="#d9a6ff" stroke-width="1.6" stroke-dasharray="5 5"'));
  add(poly(quad(hx, hz, 4), 'fill="none" stroke="#d9a6ff" stroke-width="1.6" stroke-dasharray="5 5"'));
  add(poly(quad(hx, hz, 0), 'fill="#fff4d6" fill-opacity=".07" stroke="#fff4d6" stroke-width="2.2"'));
  add(poly(quad(hx - L, hz, 0), 'fill="url(#hatch)" stroke="#fff4d6" stroke-width="2.2" stroke-dasharray="8 5"'));
}
add(`</g>`); // конец клипа карты
// герой
for (const [hx, hz] of [[120, 120], [232, 128]]) add(`<g filter="url(#glow)"><circle cx="${px(hx)}" cy="${py(hz)}" r="7" fill="#ffd35a" stroke="#3a2508" stroke-width="2"/></g>`);
add(`<rect x="${MX}" y="${MY}" width="${L * K}" height="${L * K}" fill="url(#vign)" pointer-events="none"/>`);
add(`<rect x="${MX}" y="${MY}" width="${L * K}" height="${L * K}" fill="none" stroke="#f2d39a" stroke-width="2.5"/>`);

// ---------- подписи на карте
const label = (x, z, t, col, size = 15, anchor = 'middle', dy = 0) => `<text x="${px(x)}" y="${py(z) + dy}" font-size="${size}" font-weight="700" text-anchor="${anchor}" fill="${col}" stroke="#120d0b" stroke-width="4" paint-order="stroke" stroke-linejoin="round">${esc(t)}</text>`;
const ZL = { cellars: [138, 70], mushrooms: [36, 108], crystals: [196, 84], mine: [150, 168], jam: [30, 226] };
for (const z of D.zones) { const [x, y] = ZL[z.id]; add(label(x, y, z.name.toUpperCase(), LABEL[z.id], 22)); }
add(label(236, 10, 'ВАРЕННЫЕ ЖИЛЫ', LABEL.jam, 13, 'end'));
add(label(232, 236, 'ВАРЕННЫЕ ЖИЛЫ', LABEL.jam, 13, 'end'));
add(label(4, 10, 'ВАРЕННЫЕ ЖИЛЫ', LABEL.jam, 13, 'start'));
add(label(150, 9, 'СТАРАЯ ШАХТА (продолжение снизу)', LABEL.mine, 12));
const LMOFF = { well: [0, 9, 'Световой колодец · старт'], ring: [0, 17, 'Ведьмин круг'], lake: [0, 22, 'Подземное озеро'], kopyor: [0, -8, 'Копёр'], cauldron: [4, -14, 'Котёл Барона'], gallery: [0, 13, 'Винная галерея'], bigbarrel: [0, 8, 'Бочка-великан'], patriarch: [0, 8, 'Гриб-Патриарх'], druse: [0, 8, 'Поющая друза'], heap: [0, 9, 'Рудный отвал'], brewery: [0, 18, 'Бродильня'] };
for (const l of D.landmarks) { const [dx, dz, t] = LMOFF[l.id]; add(label(l.x + dx, l.z + dz, t, '#fff4d6', 14)); }
add(label(236, 166, 'Котёл Барона', '#fff4d6', 13, 'end'));
for (const c of D.buildings.cursedChest) add(label(c.x, c.z + 17, c.name, '#e2a6ff', 12));
add(label(121, 236, 'Винный тракт ↕', '#d9b98a', 12, 'start'));
add(label(4, 201, 'Рельсовое кольцо ↔', '#c8ccd2', 12, 'start'));
add(label(96, 30, 'Жила-компас ↘', '#e2b8ff', 13, 'start'));
add(label(120, 145, 'экран 16:9 (36 × 23 м)', '#fff4d6', 11.5));
add(label(120, 154, 'кольцо появления врагов: +4…9 м за краем', '#e2b8ff', 11.5));
add(label(207, 124, 'герой у края: экран', '#fff4d6', 11.5, 'end'));
add(label(207, 131, 'заходит за шов →', '#fff4d6', 11.5, 'end'));
add(label(19, 136, '← та же часть экрана', '#fff4d6', 11.5, 'start'));
add(label(19, 143, '   берётся отсюда', '#fff4d6', 11.5, 'start'));

// ---------- стрелки склейки
const R = MX + L * K, B = MY + L * K;
for (const y of [MY + 300, MY + 660]) {
  add(`<path d="M${MX - 26} ${y - 22} l0 44" stroke="#f2d39a" stroke-width="3" marker-end="url(#ah)"/>`);
  add(`<path d="M${R + 26} ${y - 22} l0 44" stroke="#f2d39a" stroke-width="3" marker-end="url(#ah)"/>`);
}
for (const x of [MX + 300, MX + 660]) for (const k of [0, 9]) {
  add(`<path d="M${x - 22 + k} ${MY - 14} l26 0" stroke="#d9a6ff" stroke-width="3" marker-end="url(#ahl)"/>`);
  add(`<path d="M${x - 22 + k} ${B + 14} l26 0" stroke="#d9a6ff" stroke-width="3" marker-end="url(#ahl)"/>`);
}
add(`<text x="${MX - 40}" y="${MY + 480}" font-size="13" fill="#f2d39a" text-anchor="middle" transform="rotate(-90 ${MX - 40} ${MY + 480})">левый край = правый край</text>`);
add(`<text x="${R + 44}" y="${MY + 480}" font-size="13" fill="#f2d39a" text-anchor="middle" transform="rotate(90 ${R + 44} ${MY + 480})">правый край = левый край</text>`);
add(`<text x="${MX + 480}" y="${MY - 24}" font-size="13" fill="#d9a6ff" text-anchor="middle">верхний край = нижний край</text>`);
add(`<text x="${MX + 480}" y="${B + 38}" font-size="13" fill="#d9a6ff" text-anchor="middle">нижний край = верхний край</text>`);
// масштаб и подписи кусков
const cols = 'ABCDEFGHIJ';
for (let i = 0; i < 10; i++) {
  add(`<text x="${px(i * 24 + 12)}" y="${B + 58}" font-size="11" fill="#6f6152" text-anchor="middle">${cols[i]}</text>`);
  add(`<text x="${MX - 56}" y="${py(i * 24 + 12) + 4}" font-size="11" fill="#6f6152" text-anchor="middle">${i + 1}</text>`);
}
add(`<g transform="translate(${MX},${B + 74})"><rect width="${24 * K}" height="6" fill="#f2d39a"/><rect x="${24 * K}" width="${24 * K}" height="6" fill="#6f6152"/><text x="0" y="22" font-size="12" fill="#c9b39a">0</text><text x="${24 * K}" y="22" font-size="12" fill="#c9b39a" text-anchor="middle">24 м (кусок)</text><text x="${48 * K}" y="22" font-size="12" fill="#c9b39a" text-anchor="middle">48 м</text><text x="${60 * K}" y="22" font-size="12" fill="#8f7d6b">Бег героя 6 м/с (design.md): карта насквозь ≈ 40 с — примерно одна волна.</text></g>`);

// мини-тор 3×3
{ let yb = B + 128; add(`<text x="${MX}" y="${yb}" font-size="19" font-weight="700" fill="#f6e3c4">Почему шва не видно</text>`); yb += 12;
const T = 58, tx0 = MX + 4, ty0 = yb + 4;
for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
  add(`<use href="#zones" xlink:href="#zones" x="${tx0 + i * T}" y="${ty0 + j * T}" width="${T}" height="${T}" opacity="${i === 1 && j === 1 ? 1 : 0.55}"/>`);
  add(`<rect x="${tx0 + i * T}" y="${ty0 + j * T}" width="${T}" height="${T}" fill="none" stroke="#f2d39a" stroke-opacity="${i === 1 && j === 1 ? .9 : .25}" stroke-width="${i === 1 && j === 1 ? 2 : 1}"/>`);
}
add(`<rect x="${tx0 + 2 * T - 22}" y="${ty0 + T - 10}" width="40" height="27" fill="#fff4d6" fill-opacity=".15" stroke="#fff4d6" stroke-width="2"/><circle cx="${tx0 + 2 * T - 2}" cy="${ty0 + T + 3}" r="3" fill="#ffd35a"/>`);
const txt = ['Карта одна (в центре), вокруг — её копии.', 'Камера видит 36 × 23 м и стоит у края:', 'недостающие куски 24 × 24 м берутся', 'из ближайшей копии. Кусок «переезжает»', 'в другую копию, только когда он в 120 м', 'от камеры — далеко за краем экрана.', 'Враги, снаряды и опыт рисуются', 'в точке «позиция − камера», свёрнутой', 'в ±120 м: всегда с нужной стороны.'];
txt.forEach((t, i) => add(`<text x="${tx0 + 3 * T + 14}" y="${ty0 + 14 + i * 19.5}" font-size="13.2" fill="#d9c8b3">${esc(t)}</text>`));
}
{ let yb = B + 128; const CX = MX + 600;
add(`<text x="${CX}" y="${yb}" font-size="19" font-weight="700" fill="#f6e3c4">Камера и свет</text>`); yb += 26;
const C = D.camera;
for (const t of [`Наклон ${C.pitchDeg}°, угол обзора ${C.vFovDeg}°, ${C.distance} м до героя (высота ${C.height} м).`, 'Видно 36 × 23 м (16:9): ~54 px на метр в 1080p.', 'Крыса 0,6 м ≈ 32 px, элита 2,4 м ≈ 130 px — орда читается.', 'Враги рождаются в полосе 4–9 м за краем экрана', '(16–34 м от героя), чаще — по ходу движения.', 'Отставшие дальше 48 м переносятся вперёд.', 'Настоящая лампа одна — фонарь героя.', 'Остальное: светящиеся материалы, пятна света на полу,', 'запечённый свет в цветах вершин, виньетка.']) { add(`<text x="${CX}" y="${yb}" font-size="13.2" fill="#d9c8b3">${esc(t)}</text>`); yb += 19.5; } }
// ---------- правая колонка
const RX = 1090; let y = 140;
const h2 = (t) => { y += 14; add(`<text x="${RX}" y="${y}" font-size="19" font-weight="700" fill="#f6e3c4">${esc(t)}</text>`); y += 12; };
const row = (sw, t, t2 = '') => { add(sw(RX + 12, y + 10)); add(`<text x="${RX + 34}" y="${y + 15}" font-size="14" fill="#e9dccb">${esc(t)}<tspan fill="#8f7d6b">${esc(t2 ? '  ' + t2 : '')}</tspan></text>`); y += 23; };
h2('Зоны (по ~20 % площади)');
const pct = (id) => Math.round(100 * D.zones.find((z) => z.id === id).areaM2 / (L * L));
for (const z of D.zones) row((X, Y) => `<rect x="${X - 10}" y="${Y - 9}" width="20" height="18" rx="3" fill="${FLOOR[z.id]}" stroke="${LABEL[z.id]}" stroke-width="1.5"/>`, z.name, `${pct(z.id)} %`);
y += 8; h2('Проходимость');
row((X, Y) => `<circle cx="${X}" cy="${Y}" r="7" fill="#9a6248" stroke="#000" stroke-opacity=".45"/>`, 'Твёрдое: колонны, грибы, кристаллы', 'круги');
row((X, Y) => `<line x1="${X - 9}" y1="${Y + 4}" x2="${X + 9}" y2="${Y - 4}" stroke="#6b4a30" stroke-width="6" stroke-linecap="round"/>`, 'Стеллажи, гряды, корни', 'отрезки с радиусом');
row((X, Y) => `<circle cx="${X}" cy="${Y}" r="9" fill="#1a130f" stroke="#4a3a30" stroke-width="1.5"/>`, 'Опорная скала', 'срезана на 3 м');
row((X, Y) => `<circle cx="${X}" cy="${Y}" r="8" fill="#060403" stroke="#3b2a1f" stroke-width="3"/>`, 'Провал / озеро', 'не пройти; летучие и снаряды — над');
row((X, Y) => `<circle cx="${X}" cy="${Y}" r="8" fill="#4fb3b0" fill-opacity=".45" stroke="#8ae6da"/>`, 'Мелководье', 'замедляет всех');
row((X, Y) => `<circle cx="${X}" cy="${Y}" r="8" fill="#b25fd6" fill-opacity=".5" stroke="#d9a6ff"/>`, 'Варенье', 'замедляет героя');
row((X, Y) => `<circle cx="${X}" cy="${Y}" r="8" fill="none" stroke="#f6e3c4" stroke-opacity=".5" stroke-dasharray="4 3"/>`, 'Открытая арена', 'без препятствий');
row((X, Y) => `<rect x="${X - 11}" y="${Y - 1.5}" width="22" height="3" rx="1.5" fill="#e2b8ff"/>`, 'Жила-компас', 'всегда «↘», ведёт к Котлу');
row((X, Y) => `<g><line x1="${X - 10}" y1="${Y - 2}" x2="${X + 10}" y2="${Y - 2}" stroke="#b8bcc2" stroke-width="1.5"/><line x1="${X - 10}" y1="${Y + 2}" x2="${X + 10}" y2="${Y + 2}" stroke="#b8bcc2" stroke-width="1.5"/></g>`, 'Рельсовое кольцо 240 м', '');
y += 8; h2('Постройки (базовые)');
row((X, Y) => `<rect x="${X - 7}" y="${Y - 7}" width="14" height="14" transform="rotate(45 ${X} ${Y})" fill="#ffd35a" stroke="#5a3d10" stroke-width="2"/>`, 'Алтарь — бафф', `${D.buildings.altar.length} шт., по одному на зону`);
row((X, Y) => `<circle cx="${X}" cy="${Y}" r="4" fill="#ffb347" stroke="#3a1d08"/>`, 'Жаровня с добычей', `${D.buildings.brazier.length} мест, шаг ≥ 18 м`);
row((X, Y) => `<rect x="${X - 9}" y="${Y - 6}" width="18" height="12" rx="2" fill="#7a3f98" stroke="#e2a6ff" stroke-width="2"/>`, 'Проклятый сундук', '3, в колоннаде R 13 м');
row((X, Y) => `<circle cx="${X}" cy="${Y}" r="8" fill="#7fe0d0" stroke="#e8fffb" stroke-width="2"/>`, 'Целебный родник', '3, ≥ 98 м друг от друга');
y += 8; h2('Предложения — выбрать на странице');
const props = [['1', 'Фонари-маяки', '#ffd27a'], ['2', 'Вагонетка на кольце', '#c8ccd2'], ['3', 'Колокол-магнит', '#f0c983'], ['4', 'Пороховые бочки', '#ff8a6a'], ['5', 'Гриб-батут', '#d7e39a'], ['6', 'Капканы', '#c9b39a'], ['7', 'Шахтный лифт', '#9fd8ff'], ['8', 'Забытая кузня', '#ffb070']];
for (let i = 0; i < props.length; i += 2) {
  for (let k = 0; k < 2; k++) { const [n, t, c] = props[i + k]; const X = RX + 12 + k * 285, Y = y + 10;
    add(`<circle cx="${X}" cy="${Y}" r="8" fill="#120d0b" stroke="${c}" stroke-width="1.6"/><text x="${X}" y="${Y + 4}" font-size="11" font-weight="700" text-anchor="middle" fill="${c}">${n}</text><text x="${X + 18}" y="${Y + 5}" font-size="14" fill="#e9dccb">${t}</text>`); }
  y += 23;
}
// площадь
h2('Вход на площади — пещера «Подземелье»');
const pk = 5.6, pX0 = RX + 6 + 30 * pk, pY0 = y + 6 + 26 * pk; // мировой (0;0)
const pp = (x, z) => [f(pX0 + x * pk), f(pY0 + z * pk)];
const prect = (x0, z0, x1, z1, fill, extra = '') => { const [a, b] = pp(x0, z0); return `<rect x="${a}" y="${b}" width="${f((x1 - x0) * pk)}" height="${f((z1 - z0) * pk)}" fill="${fill}" ${extra}/>`; };
add(prect(-30, -26, 30, 22, '#d2c3aa'));
add(prect(-30, 22, 30, 30, '#3b7f9a', 'opacity=".55"'));
add(prect(-21, 22, -17, 30, '#8a6a4a'));
add(prect(-34.5, 7.5, -30, 10.5, '#8a6a4a'));
for (const [x0, z0, x1, z1, c, t] of [[-28, -26, -12, -16, '#9a5a48', 'автоматы'], [-9, -26, 9, -16, '#7d4a3c', 'пейнтбол'], [13, -26, 28, -16, '#9a5a48', 'картинг'], [-28, -16, -12.6, -7.8, '#b9a48a', 'бильярд'], [-29.5, -6, -25.5, 0, '#3f6f8f', ''], [24, -10, 30, 4, '#e8dcc4', 'кафе'], [24.3, 7.2, 29.5, 18.8, '#9b7a55', 'колесо'], [14, -9, 23, 15, '#e4d6bd', 'терраса'], [-10.8, 22, -4, 26.8, '#8a6a4a', '']]) {
  add(prect(x0, z0, x1, z1, c, 'stroke="#5a4636" stroke-width=".8"'));
  if (t) { const [a, b] = pp((x0 + x1) / 2, (z0 + z1) / 2); add(`<text x="${a}" y="${b + 4}" font-size="10.5" text-anchor="middle" fill="#2a1d14">${t}</text>`); }
}
for (const [x, z] of [[2.32, -4.47], [5.84, 9.64], [-8.15, 5.63]]) { const [a, b] = pp(x, z); add(`<circle cx="${a}" cy="${b}" r="${1.5 * pk}" fill="#e05a4a" stroke="#fff" stroke-width="1"/>`); }
for (const [x, z] of [[-24, 7], [-24, 15]]) { const [a, b] = pp(x, z); add(`<circle cx="${a}" cy="${b}" r="${0.7 * pk}" fill="#4f8a3a"/>`); }
{ const [a, b] = pp(-14, 16); add(`<circle cx="${a}" cy="${b}" r="2.5" fill="#333"/>`); }
{ const [a, b] = pp(-4, 12.5); add(`<circle cx="${a}" cy="${b}" r="${2.1 * pk}" fill="none" stroke="#7a5a3a" stroke-dasharray="3 2"/><text x="${a}" y="${b + 3}" font-size="9" text-anchor="middle" fill="#5a4030">прятки</text>`); }
{ const [a, b] = pp(0, 6); add(`<path d="M${a} ${b - 7} l2 5 5 0 -4 3 2 5 -5 -3 -5 3 2 -5 -4 -3 5 0z" fill="#ffd35a" stroke="#5a3d10"/><text x="${a + 9}" y="${b + 4}" font-size="10" fill="#2a1d14">появление</text>`); }
// пути
{ const [a, b] = pp(-1, 6.5), [c, d] = pp(-30, 8.6); add(`<path d="M${a} ${b} L${c} ${d}" stroke="#2f7fb8" stroke-width="2" stroke-dasharray="5 4" marker-end="url(#ah)" opacity=".8"/>`); const [e, g] = pp(-31, 5.2); add(`<text x="${e}" y="${g}" font-size="10" fill="#1f5f8a">аквапарк</text>`); }
{ const [a, b] = pp(-6, 9), [c, d] = pp(-19, 22); add(`<path d="M${a} ${b} Q${pp(-14, 18)[0]} ${pp(-14, 18)[1]} ${c} ${d}" stroke="#2f7fb8" stroke-width="2" stroke-dasharray="5 4" fill="none" marker-end="url(#ah)" opacity=".8"/>`); const [e, g] = pp(-26, 27); add(`<text x="${e}" y="${g}" font-size="10" fill="#e9f4ff">к маяку</text>`); }
// пещера
const cave = D.plaza.cave; { const [a, b] = pp(cave.center.x, cave.center.z);
  add(`<ellipse cx="${a}" cy="${b}" rx="${2.8 * pk}" ry="${2.7 * pk}" fill="#3a2c24" stroke="#ffb347" stroke-width="2.5" filter="url(#glow)"/>`);
  const [m1, m2] = pp(cave.mouth.x, cave.mouth.z); add(`<circle cx="${m1}" cy="${m2}" r="${1.3 * pk}" fill="#1a0f14" stroke="#c77dff" stroke-width="2"/>`);
  const [e1, e2] = pp(cave.interact.x, cave.interact.z); add(`<circle cx="${e1}" cy="${e2}" r="${cave.interact.r * pk}" fill="none" stroke="#ffd35a" stroke-width="1.5" stroke-dasharray="3 2"/><text x="${e1 + 3}" y="${e2 - 12}" font-size="10" font-weight="700" fill="#5a3d10">E</text>`);
  const rb = D.plaza.recordsBoard; const [r1x, r1y] = pp(rb.posts[0].x, rb.posts[0].z), [r2x, r2y] = pp(rb.posts[1].x, rb.posts[1].z); add(`<line x1="${r1x}" y1="${r1y}" x2="${r2x}" y2="${r2y}" stroke="#5a3e2b" stroke-width="5" stroke-linecap="round"/>`);
  add(`<text x="${a - 6}" y="${b + 36}" font-size="11" font-weight="700" text-anchor="middle" fill="#2a1d14" stroke="#d2c3aa" stroke-width="3" paint-order="stroke">ПОДЗЕМЕЛЬЕ</text>`);
  add(`<text x="${r2x + 4}" y="${r2y + 16}" font-size="9.5" fill="#2a1d14" stroke="#d2c3aa" stroke-width="3" paint-order="stroke">рекорды</text>`);
}
const ph = 56 * pk; y += 12 + ph + 16;
const notes = [`Скала ${cave.footprint.sizeX} × ${cave.footprint.sizeZ} м, высота ${cave.footprint.height} м, центр (${cave.center.x}; ${cave.center.z}).`, `Зев 2,6 м смотрит на точку появления (0; 6); E — (${cave.interact.x}; ${cave.interact.z}).`, 'Рядом каменная доска рекордов: всё время / неделя.', 'Пути к аквапарку и маяку свободны, памятник не занят.'];
notes.forEach((t) => { add(`<text x="${RX}" y="${y}" font-size="13" fill="#d9c8b3">${esc(t)}</text>`); y += 18; });
add(`</svg>`);
fs.writeFileSync(`${OUT}/map.svg`, o);
console.log('svg', o.length, 'bytes; right column ends at y =', y);

// Раздел «Где это»: схема Приморского сада сверху (SVG, метры набережной plaza3) и 3D-планировка из простых объёмов.
// Координаты — как в docs/plaza3/level/layout.json: x на восток, z к морю (на схеме море внизу, как на плане lab/plaza3).
// 3D (venue3d.js + vendor/three) грузится, только когда раздел подходит к экрану.
import { h, esc, segButtons, sfx } from './common.js';

// ------------------------------------------------------------------ данные набережной (выписка из layout.json)

const RUN = 8.4; // м/с — shared/constants.ts RUN_SPEED
const JELLY = { h: 1.6, r: 0.42, eye: 1.42 }; // PLAYER_HEIGHT, PLAYER_HALF, EYE_HEIGHT

const LAND = [[-23, 22], [92, 22], [92, -12], [70, -12], [68, -18], [67, -28], [56, -28.5], [50, -28.5], [47, -29], [47, -47], [-6, -47], [-6, -56], [-30, -56], [-30, 15], [-29.89, 16.22], [-29.58, 17.39], [-29.06, 18.5], [-28.36, 19.5], [-27.5, 20.36], [-26.5, 21.06], [-25.39, 21.58], [-24.22, 21.89]];
// огороды и поле за южным краем набережной (land.backlot) — тоже суша, не море
const BACKLOT = [[-30, -70], [92, -70], [92, -12], [70, -12], [68, -18], [67, -28], [56, -28.5], [50, -28.5], [47, -29], [47, -47], [-6, -47], [-6, -56], [-30, -56]];
const SPAWN = { x: 8, z: -5.6 };
const HUB = { x: 8, z: -8, r: 15, rose: 4.5 };
const NB = {
  cards: { x0: 31.5, z0: -5, x1: 45, z1: 0.6, h: 3.7, name: 'Карточная веранда' },
  cafe: { x0: 45, z0: 4.2, x1: 53, z1: 12.2, h: 7, name: 'Кафе «Чайка»' },
  kurzal: { x0: 53.1, z0: -16, x1: 62.9, z1: 3, h: 5.4, name: 'Курзал' },
  view: { x0: 49, z0: 13.2, x1: 64, z1: 22, h: 1.4, name: 'Смотровая регаты' },
  billiards: { x0: 33, z0: 13.6, x1: 48.4, z1: 21.8, h: 4, name: 'Бильярдная' },
  wheel: { x0: 24.3, z0: 7.2, x1: 29.5, z1: 18.8, name: 'Колесо' },
  honor: { x0: 0.98, z0: -17.17, x1: 7.02, z1: -15.6, name: 'Доска почёта' },
  online: { x0: 14.46, z0: -17.64, x1: 19.54, z1: -15.96 },
};
const ROTUNDA = { x: 15, z: 8.5, r: 3.75 };
const FOUNTAIN = { x: 38, z: 7.3, r: 2.6 };
const GARDEN = { x0: 62, z0: -12, x1: 92, z1: 22 };
const CORRIDOR = { x0: 53, z0: 3, x1: 64, z1: 13.2 };

// ------------------------------------------------------------------ предложенная компоновка «Ракушки»

const AXIS_Z = 8; // ось площадки = середина прохода между Курзалом (z ≤ 3) и Смотровой (z ≥ 13,2)
const FENCE = [[70, -0.5], [91.5, -0.5], [91.5, 16.5], [70, 16.5], [68.5, 15], [68.5, 1]];
const ARCH = { x: 68.5, z0: 6.4, z1: 9.6, h: 4.1 };
const STAGE = { h: 0.8, poly: [[82.7, 1], [86.5, 1], [89.6, 4.1], [89.6, 11.9], [86.5, 15], [82.7, 15], [81.5, 13.8], [81.5, 2.2]] };
const SHELL = { x: 84, z: AXIS_Z, a: 6, b: 9, c: 5.6 }; // раскрытие на x = 84, полуширина 6, высота 9, глубина 5,6
const BOARD = { x: 87.2, z: AXIS_Z, w: 6, h: 3.4, y0: 2.6 };
const RAMPS = [{ x0: 78.3, x1: 81.5, z0: 1.3, z1: 3.1 }, { x0: 78.3, x1: 81.5, z0: 12.9, z1: 14.7 }];
const PULT_C = { x: 72, z: AXIS_Z, r: 12 };
const PULTS = [3.5, 5.3, 7.1, 8.9, 10.7, 12.5].map((z) => ({ x: PULT_C.x + Math.sqrt(PULT_C.r ** 2 - (z - AXIS_Z) ** 2), z }));
const LIT = 2;
const PODIUM = { x: 83.9, z: 14.0, host: { x: 84.7, z: 14.45 } };
const EASEL = { park: { x: 86.2, z: 2.0 }, show: { x: 82.4, z: AXIS_Z } }; // за кулисами — боком, за южной стенкой ракушки
const BENCH = { rows: [77.6, 75.8, 74.0, 72.2], sides: [5.7, 10.3], len: 2.6, depth: 0.6, seats: 3 };
const CYPRESS = [[64, 17, 7], [74, 18, 8], [66, 14, 6.5], [68.5, -6, 6], [80, -7, 6.5], [86, -8, 7.5], [66.5, -9.5, 6], [90, -9.5, 6.5], [90.3, 2.0, 8], [90.3, 14.0, 8]];
const OLEANDER = [[80.6, 0.4], [80.6, 15.6], [70.5, 5.0], [70.5, 11.0], [72.5, -1.4], [80, -1.4], [87.5, -1.4], [71.5, 17.4], [80, 17.4], [87.5, 17.4]];
const LAMPS = [[67.6, 5.6], [67.6, 10.4], [76.2, -1.4], [83.8, -1.4], [76.2, 17.4], [83.8, 17.4], [74, -5.2], [86, -5.2]];
const ROUTE = [[SPAWN.x, SPAWN.z], [22.5, -3.4], [27.5, 3.6], [54.5, 3.6], [64, AXIS_Z], [ARCH.x, AXIS_Z]];
const EYE_POINT = { x: 64, z: AXIS_Z };
const CAFE_CAM = { x: 58, z: AXIS_Z };
// дорожки сада вокруг ограды (старая P10 теперь упирается в арку)
const WALKS = [
  { w: 3.2, pts: [[62.9, AXIS_Z], [ARCH.x, AXIS_Z]] },
  { w: 2.4, pts: [[64.4, 4.2], [66.6, -3.4], [91, -3.4]] },
  { w: 2.2, pts: [[64.4, 12], [66.6, 20.5], [91, 20.5]] },
];

const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const routeLen = ROUTE.reduce((s, p, i) => (i ? s + dist(ROUTE[i - 1], p) : 0), 0);
const sight = BOARD.x - EYE_POINT.x;
const sightCafe = BOARD.x - 53;
const fenceW = 91.5 - 68.5, fenceD = 16.5 - -0.5;
const seats = BENCH.rows.length * BENCH.sides.length * BENCH.seats;
const nf = (v, d = 0) => v.toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d });

/** Многоугольник, раздвинутый наружу на d (для выпуклого) */
function offsetPoly(poly, d) {
  let area = 0;
  poly.forEach((p, i) => { const q = poly[(i + 1) % poly.length]; area += p[0] * q[1] - q[0] * p[1]; });
  const s = area > 0 ? 1 : -1;
  const lines = poly.map((p, i) => {
    const q = poly[(i + 1) % poly.length];
    const dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz);
    const nx = (s * dz) / l, nz = (-s * dx) / l;
    return { p: [p[0] + nx * d, p[1] + nz * d], v: [dx, dz] };
  });
  return lines.map((a, i) => {
    const b = lines[(i + lines.length - 1) % lines.length];
    const den = b.v[0] * a.v[1] - b.v[1] * a.v[0];
    if (Math.abs(den) < 1e-9) return a.p;
    const t = ((a.p[0] - b.p[0]) * a.v[1] - (a.p[1] - b.p[1]) * a.v[0]) / den;
    return [b.p[0] + b.v[0] * t, b.p[1] + b.v[1] * t];
  });
}
const VOICE = offsetPoly(FENCE, 0.5);

/** Всё, что нужно 3D-сцене */
export const LAYOUT = { LAND, BACKLOT, NB, ROTUNDA, FOUNTAIN, GARDEN, AXIS_Z, FENCE, ARCH, STAGE, SHELL, BOARD, RAMPS, PULTS, PULT_C, LIT, PODIUM, EASEL, BENCH, CYPRESS, OLEANDER, LAMPS, WALKS, VOICE, JELLY, EYE_POINT, CAFE_CAM };

// ------------------------------------------------------------------ SVG

const f = (v) => +v.toFixed(2);
const P = (arr) => arr.map((p) => `${f(p[0])},${f(p[1])}`).join(' ');
const rect = (b, cls, extra = '') => `<rect class="${cls}" x="${f(b.x0)}" y="${f(b.z0)}" width="${f(b.x1 - b.x0)}" height="${f(b.z1 - b.z0)}"${extra}/>`;
const text = (x, z, s, cls = '', anchor = 'middle', extra = '') => `<text class="vn-t ${cls}" x="${f(x)}" y="${f(z)}" text-anchor="${anchor}"${extra}>${esc(s)}</text>`;
const line = (pts, cls) => `<polyline class="${cls}" points="${P(pts)}"/>`;

/** Дорожка шириной w — толстая линия со скруглением */
const walk = (wk, cls = 'vn-walk') => `<polyline class="${cls}" points="${P(wk.pts)}" stroke-width="${wk.w}"/>`;

/** Дуга-проекция ребра ракушки на землю: от края раскрытия к задней точке */
function ribPlan(al, n = 10) {
  const pts = [];
  for (let j = 0; j <= n; j++) {
    const t = (Math.PI / 2) * (j / n);
    pts.push([SHELL.x + SHELL.c * Math.sin(t), SHELL.z + SHELL.a * Math.cos(t) * Math.cos(al)]);
  }
  return pts;
}
const shellPath = () => `M${SHELL.x} ${SHELL.z - SHELL.a} A${SHELL.c} ${SHELL.a} 0 0 1 ${SHELL.x} ${SHELL.z + SHELL.a} Z`;

/** Пульт: прямоугольник, повёрнутый лицом к центру дуги */
function pultSvg(p, i) {
  const ang = (Math.atan2(PULT_C.z - p.z, PULT_C.x - p.x) * 180) / Math.PI - 180;
  return `<g transform="translate(${f(p.x)} ${f(p.z)}) rotate(${f(ang)})"><rect class="vn-pult" x="-0.32" y="-0.45" width="0.64" height="0.9" rx="0.08"/>
    <circle class="vn-lamp${i === LIT ? ' vn-lamp--on' : ''}" cx="0.05" cy="0" r="0.2"/></g>`;
}

/** «Ракушка» на схеме. detail: 'far' — для общего плана, 'near' — для сада крупно */
function venueSvg(detail) {
  const near = detail === 'near';
  const out = [];
  out.push(`<polygon class="vn-voice" points="${P(VOICE)}"/>`);
  out.push(`<polygon class="vn-yard" points="${P(FENCE)}"/>`);
  out.push(`<rect class="vn-lawn2" x="81.4" y="-0.5" width="10.1" height="17"/>`);
  out.push(`<polygon class="vn-stage" points="${P(STAGE.poly)}"/>`);
  out.push(`<path class="vn-shell" d="${shellPath()}"/>`);
  if (near) for (let k = 1; k < 10; k++) out.push(line(ribPlan((Math.PI * k) / 10), 'vn-rib'));
  out.push(`<line class="vn-board" x1="${BOARD.x}" y1="${BOARD.z - BOARD.w / 2}" x2="${BOARD.x}" y2="${BOARD.z + BOARD.w / 2}"/>`);
  for (const r of RAMPS) {
    out.push(rect(r, 'vn-ramp'));
    if (near) {
      const zc = (r.z0 + r.z1) / 2;
      for (const x of [79.0, 80.0]) out.push(`<polyline class="vn-chev" points="${f(x)},${f(zc - 0.55)} ${f(x + 0.55)},${f(zc)} ${f(x)},${f(zc + 0.55)}"/>`);
    }
  }
  for (const x of BENCH.rows) for (const z of BENCH.sides) out.push(rect({ x0: x - BENCH.depth / 2, z0: z - BENCH.len / 2, x1: x + BENCH.depth / 2, z1: z + BENCH.len / 2 }, 'vn-bench', ' rx="0.12"'));
  if (near) {
    PULTS.forEach((p, i) => out.push(pultSvg(p, i)));
    out.push(`<g transform="translate(${PODIUM.x} ${PODIUM.z}) rotate(-35)"><rect class="vn-podium" x="-0.45" y="-0.35" width="0.9" height="0.7" rx="0.08"/></g>`);
    out.push(`<circle class="vn-host" cx="${PODIUM.host.x}" cy="${PODIUM.host.z}" r="0.42"/>`);
    // мольберт: за кулисами → на середину сцены
    out.push(`<rect class="vn-easel" x="${EASEL.park.x - 0.95}" y="${EASEL.park.z - 0.4}" width="1.9" height="0.8" rx="0.1"/>`);
    out.push(`<rect class="vn-easel vn-easel--show" x="${EASEL.show.x - 0.4}" y="${EASEL.show.z - 0.95}" width="0.8" height="1.9" rx="0.1"/>`);
    out.push(`<path class="vn-move" d="M${EASEL.park.x - 1.05} ${EASEL.park.z + 0.1} Q 83.4 2.6 ${EASEL.show.x + 0.1} ${EASEL.show.z - 1.15}" marker-end="url(#vn-arr)"/>`);
  }
  // ограда, арка
  const fz = FENCE.concat([FENCE[0]]);
  out.push(`<polyline class="vn-fence" points="${P(fz.slice(0, 6))}"/>`);
  out.push(`<polyline class="vn-fence" points="${P([[68.5, 1], [68.5, ARCH.z0]])}"/>`);
  out.push(`<polyline class="vn-fence" points="${P([[68.5, ARCH.z1], [68.5, 15], [70, 16.5]])}"/>`);
  out.push(`<polyline class="vn-fence" points="${P([[68.5, 1], [70, -0.5]])}"/>`);
  out.push(`<rect class="vn-arch" x="${ARCH.x - 0.3}" y="${ARCH.z0 - 0.45}" width="0.6" height="0.6"/><rect class="vn-arch" x="${ARCH.x - 0.3}" y="${ARCH.z1 - 0.15}" width="0.6" height="0.6"/>`);
  if (near) out.push(`<path class="vn-archtop" d="M${ARCH.x} ${ARCH.z0 - 0.15} L${ARCH.x} ${ARCH.z1 + 0.15}"/>`);
  return out.join('');
}

function greenery(scale = 1) {
  const out = [];
  for (const [x, z] of CYPRESS) out.push(`<circle class="vn-cyp" cx="${x}" cy="${z}" r="${0.85 * scale}"/>`);
  for (const [x, z] of OLEANDER) out.push(`<circle class="vn-ole" cx="${x}" cy="${z}" r="${0.7 * scale}"/>`);
  for (const [x, z] of LAMPS) out.push(`<circle class="vn-lampost" cx="${x}" cy="${z}" r="${0.32 * scale}"/>`);
  return out.join('');
}

const defs = `<defs>
  <marker id="vn-arr" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" class="vn-arrhead"/></marker>
  <marker id="vn-arr-r" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" class="vn-arrhead-r"/></marker>
  <pattern id="vn-waves" width="3" height="1.6" patternUnits="userSpaceOnUse"><path d="M0 0.9 q0.75 -0.6 1.5 0 t1.5 0" class="vn-wave"/></pattern>
</defs>`;

/** Подпись-плашка (белая со стрелкой-выноской или без) */
function tag(x, z, s, cls = '', lead) {
  const l = lead ? `<line class="vn-lead" x1="${f(lead[0])}" y1="${f(lead[1])}" x2="${f(x)}" y2="${f(z)}"/>` : '';
  return `${l}${text(x, z, s, `vn-t--tag ${cls}`)}`;
}

/** Общий план: от точки появления до сада */
function svgOverview() {
  const vb = [-9, -24.5, 104.5, 49.5];
  const o = [];
  o.push(`<svg class="vn-svg" viewBox="${vb.join(' ')}" role="img" aria-label="План набережной от точки появления до Приморского сада">${defs}`);
  o.push(`<rect class="vn-sea" x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}"/><rect fill="url(#vn-waves)" x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}"/>`);
  o.push(`<polygon class="vn-field" points="${P(BACKLOT)}"/><polygon class="vn-land" points="${P(LAND)}"/>`);
  o.push(rect(GARDEN, 'vn-garden'));
  o.push(`<circle class="vn-hub" cx="${HUB.x}" cy="${HUB.z}" r="${HUB.r}"/><circle class="vn-rose" cx="${HUB.x}" cy="${HUB.z}" r="${HUB.rose}"/>`);
  o.push(`<circle class="vn-bld" cx="${ROTUNDA.x}" cy="${ROTUNDA.z}" r="${ROTUNDA.r}"/><circle class="vn-water" cx="${FOUNTAIN.x}" cy="${FOUNTAIN.z}" r="${FOUNTAIN.r}"/>`);
  for (const k of ['cards', 'cafe', 'kurzal', 'view', 'billiards', 'wheel', 'honor', 'online']) o.push(rect(NB[k], 'vn-bld'));
  o.push(`<rect class="vn-poster" x="52.75" y="6" width="0.6" height="4.4"/>`);
  o.push(venueSvg('far'));
  o.push(greenery(0.9));
  // путь
  o.push(line(ROUTE, 'vn-route'));
  o.push(`<circle class="vn-spawn" cx="${SPAWN.x}" cy="${SPAWN.z}" r="1.3"/>`);
  o.push(`<line class="vn-sight" x1="${EYE_POINT.x}" y1="${EYE_POINT.z}" x2="${BOARD.x}" y2="${BOARD.z}"/>`);
  // подписи
  o.push(text(8, -11.6, 'Роза ветров', 'vn-t--big vn-t--q'));
  o.push(tag(SPAWN.x, SPAWN.z - 2.2, 'Точка появления', 'vn-t--spawn'));
  o.push(text(38.2, -2.2, NB.cards.name, 'vn-t--b'));
  o.push(text(81, -20.5, 'огороды', 'vn-t--note vn-t--q'));
  o.push(text(49, 8.7, 'Кафе', 'vn-t--b'));
  o.push(text(49, 10.4, '«Чайка»', 'vn-t--b'));
  o.push(text(58, -6.5, 'Курзал', 'vn-t--b'));
  o.push(text(56.5, 18.2, 'Смотровая', 'vn-t--b'));
  o.push(text(40.7, 18.2, 'Бильярдная', 'vn-t--b'));
  o.push(text(26.9, 13.5, 'Колесо', 'vn-t--b vn-t--sm'));
  o.push(text(77, -9.3, 'Приморский сад', 'vn-t--big vn-t--q'));
  o.push(tag(79.5, -2.4, '«Ракушка»', 'vn-t--venue'));
  o.push(text(78, 23.6, 'Море', 'vn-t--sea'));
  o.push(text(5, 23.6, 'Море', 'vn-t--sea'));
  // плашка пути
  const mid = [40.5, 3.6];
  o.push(`<g class="vn-pill" transform="translate(${mid[0]} ${mid[1] - 2.05})"><rect x="-10.2" y="-1.55" width="20.4" height="2.7" rx="1.35"/>${text(0, 0.42, `${nf(routeLen)} м · ≈ ${nf(routeLen / RUN)} с бегом`, 'vn-t--pill')}</g>`);
  o.push('</svg>');
  return o.join('');
}

/** Сад крупно */
function svgGarden() {
  const vb = [56.4, -10.6, 38.2, 34.4];
  const o = [];
  o.push(`<svg class="vn-svg" viewBox="${vb.join(' ')}" role="img" aria-label="Приморский сад крупно: «Ракушка», ограда, скамейки, граница голоса">${defs}`);
  o.push(`<rect class="vn-sea" x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}"/><rect fill="url(#vn-waves)" x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}"/>`);
  o.push(`<polygon class="vn-field" points="${P(BACKLOT)}"/><polygon class="vn-land" points="${P(LAND)}"/>`);
  o.push(`<rect class="vn-lawn" x="62.9" y="-12" width="28.9" height="33.8"/>`);
  for (const wk of WALKS) o.push(walk(wk));
  o.push(rect(NB.kurzal, 'vn-bld'));
  o.push(rect(NB.view, 'vn-bld'));
  o.push(`<line class="vn-rail" x1="60" y1="21.9" x2="92" y2="21.9"/><line class="vn-rail" x1="91.9" y1="-12" x2="91.9" y2="21.9"/>`);
  o.push(venueSvg('near'));
  o.push(greenery());
  // взгляд из прохода
  o.push(`<line class="vn-sight" x1="${CAFE_CAM.x}" y1="${CAFE_CAM.z}" x2="${BOARD.x - 0.25}" y2="${BOARD.z}"/>`);
  o.push(`<circle class="vn-eye" cx="${EYE_POINT.x}" cy="${EYE_POINT.z}" r="0.55"/>`);
  o.push(`<circle class="vn-eye vn-eye--cam" cx="${CAFE_CAM.x}" cy="${CAFE_CAM.z}" r="0.45"/>`);
  // подписи соседей и прохода
  o.push(text(59.6, -6, 'Курзал', 'vn-t--b'));
  o.push(text(60, 17.8, 'Смотровая', 'vn-t--b'));
  o.push(text(60, 19.1, 'регаты', 'vn-t--b vn-t--sm'));
  o.push(text(56.8, 4.7, '← кафе «Чайка», афиша', 'vn-t--note', 'start'));
  o.push(text(59.6, 10.9, 'проход', 'vn-t--note'));
  // подписи «Ракушки»
  o.push(tag(BOARD.x + 1.9, BOARD.z + 0.35, 'табло', 'vn-t--sm vn-t--onstage'));
  o.push(tag(89.2, -2.9, 'мольберт', 'vn-t--sm', [86.6, 1.6]));
  o.push(tag(87.6, 20.8, 'трибуна и Затейник', 'vn-t--sm', [85.0, 14.9]));
  o.push(tag(81.2, -2.9, `6 пультов дугой`, 'vn-t--sm', [83.25, 3.0]));
  o.push(tag(74.1, 13.3, `скамейки · ${seats} места`, 'vn-t--sm'));
  o.push(tag(76.9, 1.25, 'пандус', 'vn-t--sm', [78.6, 2.2]));
  o.push(tag(76.9, 15.4, 'пандус', 'vn-t--sm', [78.6, 13.8]));
  o.push(tag(71.6, -2.9, 'ограда 0,9 м', 'vn-t--sm', [72.6, -0.6]));
  o.push(tag(66.0, 2.9, 'арка-вход', 'vn-t--sm', [68.2, 6.0]));
  // граница голоса
  o.push(`<line class="vn-lead vn-lead--voice" x1="75.4" y1="19.0" x2="75.4" y2="17.0"/>`);
  o.push(`<g class="vn-pill vn-pill--voice" transform="translate(75.4 19.85)"><rect x="-6.7" y="-0.95" width="13.4" height="1.75" rx="0.87"/>${text(0, 0.28, 'Внутри — свой голос', 'vn-t--pill vn-t--pillsm')}</g>`);
  // линия взгляда — подпись
  o.push(`<g class="vn-pill vn-pill--sight" transform="translate(61.7 ${AXIS_Z - 1.45})"><rect x="-5.1" y="-0.85" width="10.2" height="1.6" rx="0.8"/>${text(0, 0.27, `${nf(sight)} м до табло`, 'vn-t--pill vn-t--pillsm')}</g>`);
  o.push(text(91.3, 23.4, 'Море', 'vn-t--sea', 'end'));
  o.push(text(93.5, -6, 'Море', 'vn-t--sea', 'middle', ' transform="rotate(90 93.5 -6)"'));
  o.push(text(79, -9.3, 'Приморский сад', 'vn-t--q vn-t--mid'));
  // масштаб
  o.push(`<g class="vn-scale" transform="translate(57.4 21.6)"><rect x="0" y="0" width="5" height="0.35"/><rect x="5" y="0" width="5" height="0.35" class="vn-scale-b"/>${text(0, -0.5, '0', 'vn-t--xs', 'start')}${text(10, -0.5, '10 м', 'vn-t--xs', 'end')}</g>`);
  o.push('</svg>');
  return o.join('');
}

// ------------------------------------------------------------------ разметка раздела

const LEGEND = [
  ['stage', 'Сцена — помост 0,8 м и два пандуса'],
  ['shell', 'Ракушка 12 × 9 м спиной к морю'],
  ['board', 'Табло 6 × 3,4 м на задней стене'],
  ['pult', '6 пультов, одна лампа горит'],
  ['bench', `8 скамеек, ${seats} места, проход 2 м`],
  ['fence', 'Низкая ограда и арка-вход'],
  ['voice', 'Граница голоса: ограда + 0,5 м'],
  ['route', 'Путь от точки появления'],
  ['sight', 'Линия взгляда на табло'],
  ['green', 'Кипарис · олеандр · фонарь'],
];

export function mount(el) {
  const root = h('div', 'vn');
  el.append(root);

  // 1. общий план
  const s1 = h('div', 'vn-block');
  s1.append(h('div', 'qz-cap', `<div class="qz-cap-titles"><h3 class="qz-cap-t">Путь от точки появления</h3>
    <p class="qz-cap-n">Сад — пустая новая земля за Курзалом. От площади «Роза ветров» мимо карточной веранды и кафе «Чайка» —
    <b>${nf(routeLen)} м, около ${nf(routeLen / RUN)} секунд бегом</b>. Арка стоит прямо на выходе из прохода.</p></div>`));
  const m1 = h('div', 'vn-map vn-map--wide', svgOverview());
  s1.append(m1);
  root.append(s1);

  // 2. сад крупно + легенда
  const s2 = h('div', 'vn-block');
  s2.append(h('div', 'qz-cap', `<div class="qz-cap-titles"><h3 class="qz-cap-t">Приморский сад сверху</h3>
    <p class="qz-cap-n">Ракушка раскрыта к проходу и кафе: из прохода табло видно прямо сквозь арку, по оси скамеек. Вдоль моря и вдоль
    южного края сада остаются дорожки для прогулки.</p></div>`));
  const g = h('div', 'vn-garden-grid');
  g.append(h('div', 'vn-map vn-map--garden', svgGarden()));
  const side = h('aside', 'vn-side');
  side.append(h('ul', 'vn-legend', LEGEND.map(([k, t]) => `<li><i class="vn-sw vn-sw--${k}"></i>${esc(t)}</li>`).join('')));
  side.append(h('div', 'vn-facts', `
    <div><b>${nf(fenceW)} × ${nf(fenceD)} м</b><span>за оградой, сад — 30 × 34 м</span></div>
    <div><b>${nf(sight)} м</b><span>от выхода из прохода до табло</span></div>
    <div><b>${nf(routeLen / RUN)} с</b><span>бегом от точки появления</span></div>`));
  side.append(h('p', 'vn-side-note', 'Старая дорожка через сад теперь ведёт в арку, 6 из 8 кипарисов сада переставлены за ограду. Соседей ничто не задевает: до Курзала и Смотровой — 4,5 м.'));
  g.append(side);
  s2.append(g);
  root.append(s2);

  // 3. 3D
  const s3 = h('div', 'vn-block');
  s3.append(h('div', 'qz-cap', `<div class="qz-cap-titles"><h3 class="qz-cap-t">Планировка в объёме</h3>
    <p class="qz-cap-n">Простые объёмы в настоящем масштабе: желейка — ${nf(JELLY.h, 1)} м, как в игре. Мышью — повернуть, колесом — ближе.
    Кнопки табло показывают, как оно выглядит из сада.</p></div>`));
  const bar = h('div', 'vn-bar');
  const gCam = h('div', 'vn-group', '<span class="vn-group-cap">Камера</span>');
  const gBoard = h('div', 'vn-group', '<span class="vn-group-cap">Табло</span>');
  const gVar = h('div', 'vn-group', '<span class="vn-group-cap">Эстрада</span>');
  bar.append(gCam, gBoard, gVar);
  s3.append(bar);
  const frame = h('div', 'qz-frame vn-3d');
  const tagEl = h('div', 'qz-tag', 'С прохода у кафе');
  const hint = h('div', 'vn-3d-hint', 'Мышь — повернуть · колесо — ближе');
  const wait = h('div', 'vn-3d-wait', '3D-планировка загружается…');
  frame.append(wait, tagEl, hint);
  s3.append(frame);
  root.append(s3);

  const CAMS = [['corridor', 'С прохода у кафе'], ['top', 'Сверху'], ['bench', 'Со скамейки'], ['pult', 'С пульта']];
  const BOARDS = [['jeopardy', '«Своя игра»'], ['riddle', '«Загадка»'], ['croc', '«Крокодил»'], ['whoofus', '«Кто из нас?»']];
  const state = { cam: 'corridor', board: 'jeopardy', variant: readVariant() };
  let api = null;
  segButtons(gCam, CAMS.map((c) => c[1]), 0, (i) => { state.cam = CAMS[i][0]; tagEl.textContent = CAMS[i][1]; sfx.play('click'); api?.setCam(state.cam); });
  segButtons(gBoard, BOARDS.map((c) => c[1]), 0, (i) => { state.board = BOARDS[i][0]; sfx.play('click'); api?.setBoard(state.board); });
  const varBtns = segButtons(gVar, ['«Ракушка»', '«Шатёр»'], state.variant === 'awning' ? 1 : 0, (i) => {
    const v = i ? 'awning' : 'shell';
    // общий выбор вида — кнопки в шапке страницы (они же запоминают выбор)
    const head = document.querySelector(`.pg-variant [data-variant="${v}"]`);
    if (head) head.click(); else setVariant(v);
  });
  function setVariant(v) {
    state.variant = v;
    varBtns.forEach((b, j) => b.setAttribute('aria-pressed', String((j === 1) === (v === 'awning'))));
    api?.setVariant(v);
  }
  document.querySelectorAll('.pg-variant [data-variant]').forEach((b) => b.addEventListener('click', () => setVariant(b.dataset.variant)));

  // 4. карточки
  const cards = h('div', 'vn-cards');
  cards.innerHTML = `
    <div class="pg-card"><h3>Размеры</h3><ul class="vn-list">
      <li>За оградой <b>${nf(fenceW)} × ${nf(fenceD)} м</b>, ограда 0,9 м, арка 3,2 м шириной.</li>
      <li>Сцена <b>14 × 8 м</b>, помост 0,8 м, пандусы 1 : 4 по бокам.</li>
      <li>Ракушка <b>12 м</b> в ширину и <b>9 м</b> в высоту, глубина 5,6 м.</li>
      <li>Табло <b>6 × 3,4 м</b>, низ на высоте 2,6 м — выше голов на сцене.</li>
      <li>От арки до сцены <b>13 м</b>, четыре ряда скамеек с проходом 2 м.</li></ul></div>
    <div class="pg-card"><h3>Что видно из прохода</h3><ul class="vn-list">
      <li>Ось площадки — середина прохода: табло в <b>${nf(sight)} м</b> прямо по курсу, в рамке арки.</li>
      <li>С порога кафе «Чайка» — <b>${nf(sightCafe)} м</b>: видно, что идёт игра, темы и цены.</li>
      <li>Ничто не загораживает: скамейки и ограда ниже 1 м, пульты и игроки — ниже края табло.</li>
      <li>Мольберт выезжает на середину только в «Крокодиле», и рисунок дублируется на табло.</li></ul></div>
    <div class="pg-card"><h3>Бюджет площади</h3><ul class="vn-list">
      <li>Сцена и ракушка — 2–3, пульты — 1, скамейки — 1, ограда с аркой — 1.</li>
      <li>Деревья и фонари — 2–3, табло — 1, мольберт — 1.</li>
      <li><b>Итог: до +10 отрисовок из 300</b> (сейчас ~282) и <b>без новых программ</b> (сейчас 79 из 80) — материалы общие с павильонами.</li>
      <li>Табло, пульты и мольберт видны всегда, остальное гаснет по дальности.</li></ul></div>
    <div class="pg-card"><h3>Голосовая зона</h3><ul class="vn-list">
      <li>Внутри ограды — <b>свой голос</b>: на сцене слышат друг друга, набережная их не слышит, и наоборот.</li>
      <li>Граница — ограда плюс 0,5 м, поэтому голос не дёргается, когда стоишь в арке.</li>
      <li>При первом входе — подсказка «Ты на «Ракушке»: здесь свой голос», у строки чата — «В игру / Всем».</li></ul></div>`;
  root.append(cards);

  // 3D — только когда раздел рядом с экраном
  let loading = false;
  const io = new IntersectionObserver((ents) => {
    const vis = ents.some((e) => e.isIntersecting);
    if (vis && !api && !loading) {
      loading = true;
      import('./venue3d.js')
        .then((m) => m.mount3d(frame, LAYOUT, state))
        .then((a) => { api = a; wait.remove(); })
        .catch((e) => { console.warn('venue 3d:', e); wait.textContent = '3D не запустился в этом браузере — схема выше показывает то же самое.'; });
    }
    api?.setVisible(vis);
  }, { rootMargin: '200px 0px' });
  io.observe(frame);
}

function readVariant() {
  try { return localStorage.getItem('qz-variant') === 'awning' ? 'awning' : 'shell'; } catch { return 'shell'; }
}

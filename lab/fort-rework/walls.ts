// Ломаемые стены для страницы lab/fort-rework: схема участков по shared/fortmap.ts (вид сверху, север сверху),
// стадии участка (рисунок фасада), кто ломает и сколько, правила пролома, ремонт и варианты оформления.
import { takeButton } from './page.ts';

interface Section {
  id: string;
  name: string;
  /** x0, x1, z0, z1 в метрах (как shared/fortmap.ts: +x — восток, +z — юг/море) */
  r: [number, number, number, number];
  hp: number;
  slot?: string;
  note: string;
}

/** 12 участков: прямые куски стены между углами, лестницами и башнями. Надвратная башня не ломается — её слабое место ворота. */
const SECTIONS: Section[] = [
  { id: 'nw', name: 'Север, запад', r: [-15, -6, -16, -13], hp: 3000, note: 'дорога с запада, точка лазанья (−12,5; −16), сюда кладёт мост осадная башня' },
  { id: 'ne', name: 'Север, восток', r: [6, 15, -16, -13], hp: 3000, note: 'дорога с востока, точка лазанья (12,5; −16), мост осадной башни' },
  { id: 'bw', name: 'Бастион СЗ', r: [-21, -15, -19, -13], hp: 4500, slot: 'место башни 3', note: 'угол под две дороги, ломают камни Валуна и ядра батареи' },
  { id: 'be', name: 'Бастион СВ', r: [15, 21, -19, -13], hp: 4500, slot: 'место башни 4', note: 'угол под две дороги, ломают камни Валуна и ядра батареи' },
  { id: 'w1', name: 'Запад, север', r: [-18, -15, -13, -1], hp: 3000, slot: 'место башни 5', note: 'лазанье (−18; −7), наружная лестница (−18; −1)' },
  { id: 'w2', name: 'Запад, юг', r: [-18, -15, -1, 11], hp: 3000, note: 'лазанье (−18; 4), рядом терраса — пролом здесь ведёт прямо к кристаллу' },
  { id: 'e1', name: 'Восток, север', r: [15, 18, -13, -1], hp: 3000, slot: 'место башни 6', note: 'лазанье (18; −7), наружная лестница (18; −1)' },
  { id: 'e2', name: 'Восток, юг', r: [15, 18, -1, 11], hp: 3000, note: 'лазанье (18; 4), пролом ведёт к кристаллу' },
  { id: 'sw', name: 'Море, запад', r: [-18, -6, 11, 14], hp: 2500, slot: 'место башни 7', note: 'причал лодок (−12,5), канат якорной лодки, щупальца Кракена' },
  { id: 'sc', name: 'Море, центр', r: [-6, 6, 11, 14], hp: 2500, note: 'за террасой: щупальца Кракена бьют сюда' },
  { id: 'se', name: 'Море, восток', r: [6, 18, 11, 14], hp: 2500, slot: 'место башни 8', note: 'причал лодок (12,5), канат, щупальца' },
];

/** Кто ломает участки (база до множителя волны). Мелочь бьёт только ворота — так решил владелец. */
const BREAKERS: Array<[string, string, number, string]> = [
  ['Бугай', 'дошёл до стены у своей дороги — бьёт ближайший участок', 30, 'в секунду (ворота — 60)'],
  ['Чугунок', 'то же, медленнее', 12, 'в секунду (ворота — 25)'],
  ['Таран', 'рывок по красной дорожке в слабейший северный участок вместо ворот', 600, 'за рывок, в ярости два подряд'],
  ['Валун', 'камень в участок под меткой; землетрясение — по участку перед ним', 450, 'за камень; землетрясение 200'],
  ['Барон Варенья', 'волна по стене задевает участок', 250, 'за волну'],
  ['Король-Тыква', 'перекат вдоль стены — по каждому задетому участку', 300, 'за перекат'],
  ['Леший', 'корни под стеной', 350, 'за удар корнями'],
  ['Краб-Кран', 'груз падает на участок', 500, 'за мах'],
  ['Полевая батарея', 'ядро в участок; не больше трёх залпов', 700, 'за ядро — главный ломатель среди машин'],
  ['Осадный метеор', 'каждый третий — в сооружение, участок в круге', 650, 'за камень, если не сбили'],
  ['Щупальце Кракена', 'удар по морской стене', 300, 'за удар'],
  ['Пеликан-Бомбардир', 'бочонки из зоба по ходу стены', 300, 'за бомбу'],
  ['Избушка (финал)', 'пинок по участку — главный ломатель забега', 900, 'за удар'],
];

const STAGES: Array<[string, string, string]> = [
  ['ok', 'Целая', '<b>100–70 %.</b> Мелкие сколы. Всё работает как сейчас.'],
  ['crack', 'Трещины', '<b>70–40 %.</b> Трещины и пыль от ударов, участок жёлтый в HUD и на карте. Стоять и стрелять можно.'],
  ['ruin', 'Обвал', '<b>40–1 %.</b> Зубцы обрушены, сыплются камни. Тревога «Стена падает!», участок мигает оранжевым. Ещё можно стоять.'],
  ['breach', 'Пролом', '<b>0 %.</b> Дыра 4 м до земли: ход по стене разорван, стоять, строить и стрелять с участка нельзя, башня на нём молчит. Мобы идут через дыру к кристаллу.'],
  ['fix', 'Ремонт', '<b>Держи E у пролома.</b> Одному 5 с, вдвоём 3 с, втроём 2,5 с; золото забега списывается в конце. Удар по чинящему или шаг в сторону — сброс без оплаты.'],
  ['patch', 'Заплатка', '<b>40 %.</b> Свежая светлая кладка: дыра закрыта, ход и башня снова работают. Дальше чинится как ворота: +35 % за раз.'],
];

export const BREACH_LOOKS = [
  { id: 'С-2а', star: true, img: 'img/breach-a-rubble.jpg', title: 'Обвал камней', text: '<b>Камни падают наружу горкой</b> — мобы заходят по ней в пролом, видно издалека. После ремонта заплатка светлее старой кладки до конца забега: стена «помнит» бой.' },
  { id: 'С-2б', img: 'img/breach-b-beams.jpg', title: 'Деревянный каркас', text: '<b>Внутри стены — брёвна</b>, они торчат из краёв пролома. Чище силуэт дыры, понятнее граница «нельзя стоять». Меньше обломков — дешевле для кадра.' },
  { id: 'С-2в', img: 'img/breach-c-jam.jpg', title: 'Варенье Барона', text: '<b>Края пролома в варенье</b> армии Барона. Тематично, но фиолетовые лужи можно спутать со смолой Смоливщика — поэтому не первый выбор.' },
];

// ---------------------------------------------------------------- схема сверху

function mapSvg(): string {
  const k = 12;
  const X = (x: number) => (x + 25) * k;
  const Y = (z: number) => (z + 24) * k;
  const rect = (r: [number, number, number, number], attrs: string) => `<rect x="${X(r[0])}" y="${Y(r[2])}" width="${(r[1] - r[0]) * k}" height="${(r[3] - r[2]) * k}" ${attrs}/>`;
  let s = `<svg viewBox="0 0 ${50 * k} ${46 * k}" role="img" aria-label="Участки стены сверху">`;
  // море и берег
  s += `<rect x="0" y="${Y(17)}" width="${50 * k}" height="${(46 - 41) * k}" fill="#3f8fb3"/><rect x="0" y="${Y(15.5)}" width="${50 * k}" height="${1.5 * k}" fill="#d9c08a"/>`;
  // дороги
  s += `<polyline points="${X(-25)},${Y(-31)} ${X(-12)},${Y(-22.5)} ${X(0)},${Y(-19.6)}" fill="none" stroke="#c9a46a" stroke-width="${4 * k}" stroke-linecap="round" opacity=".55"/>`;
  s += `<polyline points="${X(25)},${Y(-33)} ${X(12)},${Y(-22.5)} ${X(0)},${Y(-19.6)}" fill="none" stroke="#c9a46a" stroke-width="${4 * k}" stroke-linecap="round" opacity=".55"/>`;
  s += `<line x1="${X(0)}" y1="${Y(-30)}" x2="${X(0)}" y2="${Y(-19.6)}" stroke="#c9a46a" stroke-width="${4 * k}" opacity=".55"/>`;
  // двор и терраса
  s += rect([-15, 15, -13, 11], 'fill="#9b9078"');
  s += rect([-10, 10, 5, 11], 'fill="#b8ab89"');
  s += `<circle cx="${X(0)}" cy="${Y(2.6)}" r="${1.1 * k}" fill="#7ee7ff" stroke="#fff" stroke-width="2"/><text x="${X(0)}" y="${Y(0.2)}" fill="#fff" font-size="13" font-weight="800" text-anchor="middle">кристалл</text>`;
  // надвратная башня и ворота
  s += rect([-6, 6, -18.5, -13], 'fill="#8d8270"');
  s += rect([-2.5, 2.5, -16.2, -15.3], 'fill="#8a5a34"');
  s += `<text x="${X(0)}" y="${Y(-19.5)}" fill="#fff3de" font-size="13" font-weight="800" text-anchor="middle">ворота</text>`;
  // участки
  for (const sec of SECTIONS) s += rect(sec.r, `class="fr-seg-wall" data-sec="${sec.id}" fill="${sec.id === 'w2' ? '#e2674f' : sec.id === 'ne' ? '#e2b04f' : '#ece3cf'}" stroke="#4a3a2e" stroke-width="2"`);
  // пролом на «Запад, юг»
  s += `<rect pointer-events="none" x="${X(-18.4)}" y="${Y(3)}" width="${3.8 * k}" height="${4 * k}" fill="#9b9078" stroke="#ff6043" stroke-width="3" stroke-dasharray="6 4"/>`;
  s += `<path pointer-events="none" d="M${X(-23)},${Y(5)} L${X(-14)},${Y(5)} L${X(-3)},${Y(2.8)}" fill="none" stroke="#ff6043" stroke-width="3" marker-end="url(#ar)"/>`;
  s += `<defs><marker id="ar" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0L10,5L0,10z" fill="#ff6043"/></marker></defs>`;
  s += `<text x="${X(-24.5)}" y="${Y(8.6)}" fill="#ffd2c8" font-size="13" font-weight="800" paint-order="stroke" stroke="#3a2a20" stroke-width="3" pointer-events="none">пролом: мобы</text><text x="${X(-24.5)}" y="${Y(10.1)}" fill="#ffd2c8" font-size="13" font-weight="800" paint-order="stroke" stroke="#3a2a20" stroke-width="3" pointer-events="none">идут к кристаллу</text>`;
  // места башен
  const slots: Array<[number, number]> = [[-4.9, -17.2], [4.9, -17.2], [-19.2, -17.2], [19.2, -17.2], [-16.5, -9.5], [16.5, -9.5], [-16.5, 12.5], [16.5, 12.5]];
  for (const [x, z] of slots) s += `<circle cx="${X(x)}" cy="${Y(z)}" r="7" fill="#5a3a28" stroke="#ffd35a" stroke-width="2"/>`;
  // лазанье
  const climbs: Array<[number, number]> = [[-12.5, -16], [12.5, -16], [-18, -7], [-18, 4], [18, -7], [18, 4], [-12.5, 14], [12.5, 14]];
  for (const [x, z] of climbs) s += `<path d="M${X(x) - 5},${Y(z) - 5}l10,10M${X(x) + 5},${Y(z) - 5}l-10,10" stroke="#3db7ae" stroke-width="3"/>`;
  // подписи сторон
  s += `<text x="${X(0)}" y="${Y(-22.6)}" fill="#fff3de" font-size="14" font-weight="800" text-anchor="middle">СЕВЕР · три дороги</text>`;
  s += `<text x="${X(0)}" y="${Y(19.5)}" fill="#e6f6ff" font-size="14" font-weight="800" text-anchor="middle">МОРЕ · лодки и Кракен</text>`;
  s += '</svg>';
  return s;
}

// ---------------------------------------------------------------- фасад участка по стадиям

function wallSvg(stage: string): string {
  const W = 560;
  const G = 230;
  const top = 92;
  const gapL = 220;
  const gapR = 340;
  const stone = stage === 'patch' ? '#ece3cf' : '#e4d9bf';
  let s = `<svg viewBox="0 0 ${W} 270" role="img" aria-label="Участок стены">`;
  s += `<rect width="${W}" height="${G}" fill="#a9d8f0"/><rect y="${G}" width="${W}" height="40" fill="#8cc06a"/>`;
  const open = stage === 'breach' || stage === 'fix';
  const ruined = stage === 'ruin' || open;
  // тело стены
  if (open) {
    s += `<path d="M20,${G} L20,${top} L${gapL - 10},${top} L${gapL},${top + 30} L${gapL + 8},${top + 70} L${gapL - 4},${G} Z" fill="${stone}" stroke="#7d6a52" stroke-width="2"/>`;
    s += `<path d="M${gapR + 4},${G} L${gapR - 6},${top + 60} L${gapR + 6},${top + 26} L${gapR + 14},${top} L540,${top} L540,${G} Z" fill="${stone}" stroke="#7d6a52" stroke-width="2"/>`;
    s += `<rect x="${gapL + 2}" y="${top + 40}" width="${gapR - gapL - 4}" height="${G - top - 40}" fill="#9b9078" opacity=".55"/>`;
  } else {
    s += `<rect x="20" y="${top}" width="520" height="${G - top}" fill="${stone}" stroke="#7d6a52" stroke-width="2"/>`;
  }
  // швы кладки
  for (let y = top + 22, row = 0; y < G; y += 22, row++) {
    s += `<line x1="20" x2="540" y1="${y}" y2="${y}" stroke="#bfae8c" stroke-width="2"/>`;
    for (let x = 20 + (row % 2 ? 26 : 0); x < 540; x += 52) s += `<line x1="${x}" x2="${x}" y1="${y - 22}" y2="${y}" stroke="#bfae8c" stroke-width="2"/>`;
  }
  if (open) s += `<rect x="${gapL + 6}" y="${top - 4}" width="${gapR - gapL - 12}" height="${G - top + 4}" fill="url(#see)"/>`;
  s += `<defs><linearGradient id="see" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a9d8f0"/><stop offset=".55" stop-color="#a9d8f0"/><stop offset=".56" stop-color="#9b9078"/><stop offset="1" stop-color="#8a8068"/></linearGradient></defs>`;
  // зубцы
  for (let x = 24; x < 540; x += 44) {
    const mid = x > gapL - 40 && x < gapR + 10;
    if (ruined && mid) continue;
    if (stage === 'crack' && x > 280 && x < 330) continue;
    s += `<rect x="${x}" y="${top - 24}" width="28" height="24" fill="${stone}" stroke="#7d6a52" stroke-width="2"/>`;
  }
  // заплатка: светлая кладка
  if (stage === 'patch') s += `<rect x="${gapL}" y="${top}" width="${gapR - gapL}" height="${G - top}" fill="#f6efdc" stroke="#cbb78f" stroke-width="2"/><text x="${(gapL + gapR) / 2}" y="${top + 74}" fill="#8a7462" font-size="14" font-weight="800" text-anchor="middle">новая кладка</text>`;
  // трещины
  if (stage === 'crack' || stage === 'ruin') {
    s += `<path d="M260,${top} l14,26 l-10,18 l20,30 l-6,24 M300,${top + 20} l-12,22 l16,26 M330,${G} l-8,-30 l14,-20 l-6,-28" fill="none" stroke="#4a3a2e" stroke-width="3" stroke-linecap="round"/>`;
  }
  if (stage === 'ruin') {
    s += `<path d="M${gapL - 30},${top} L${gapL - 10},${top + 18} L${gapL + 30},${top + 6} L${gapL + 70},${top + 26} L${gapR - 10},${top + 8} L${gapR + 20},${top}" fill="#a9d8f0" stroke="#7d6a52" stroke-width="2"/>`;
  }
  // обломки
  if (ruined) {
    for (const [x, w, h] of [[150, 30, 18], [190, 26, 16], [345, 34, 20], [390, 24, 14], [240, 30, 14], [300, 36, 16]] as Array<[number, number, number]>) {
      s += `<rect x="${x}" y="${G - h + (open ? 10 : 6)}" width="${w}" height="${h}" rx="3" fill="#d9cdb0" stroke="#7d6a52" stroke-width="1.5" transform="rotate(${(x % 7) - 3} ${x} ${G})"/>`;
    }
  }
  if (stage === 'crack' || stage === 'ruin') s += `<g class="fr-dust"><circle cx="290" cy="${top + 10}" r="10" fill="#efe6d2" opacity=".7"><animate attributeName="cy" values="${top + 10};${G - 10}" dur="1.4s" repeatCount="indefinite"/><animate attributeName="opacity" values=".8;0" dur="1.4s" repeatCount="indefinite"/></circle></g>`;
  // пролом: мобы идут, красная рамка
  if (stage === 'breach') {
    s += `<rect x="${gapL - 4}" y="${top - 30}" width="${gapR - gapL + 8}" height="${G - top + 34}" fill="none" stroke="#ff6043" stroke-width="3" stroke-dasharray="8 6"/>`;
    s += `<text x="${(gapL + gapR) / 2}" y="${top - 38}" fill="#c0301a" font-size="15" font-weight="900" text-anchor="middle">пролом 4 м · стоять нельзя</text>`;
    for (let i = 0; i < 4; i++) {
      s += `<g><circle r="13" cy="${G - 4}" fill="#8e5fd0" stroke="#52206f" stroke-width="2"><animate attributeName="cx" values="${gapL - 120};${(gapL + gapR) / 2}" dur="2.6s" begin="${i * 0.65}s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;1;0" keyTimes="0;.85;1" dur="2.6s" begin="${i * 0.65}s" repeatCount="indefinite"/></circle></g>`;
    }
  }
  // ремонт: леса, полоса, двое
  if (stage === 'fix') {
    s += `<rect x="${gapL + 4}" y="${G - 62}" width="${gapR - gapL - 8}" height="62" fill="#f6efdc" stroke="#cbb78f" stroke-width="2"/>`;
    for (const x of [gapL + 10, gapR - 10]) s += `<line x1="${x}" x2="${x}" y1="${top - 30}" y2="${G}" stroke="#8a5a34" stroke-width="6"/>`;
    for (const y of [top + 10, top + 60, G - 62]) s += `<line x1="${gapL}" x2="${gapR}" y1="${y}" y2="${y}" stroke="#8a5a34" stroke-width="5"/>`;
    s += `<circle cx="${gapL + 40}" cy="${top + 44}" r="13" fill="#ff8a1c" stroke="#7a3e00" stroke-width="2"/><circle cx="${gapR - 40}" cy="${G - 78}" r="13" fill="#6fe0b0" stroke="#1f6b4a" stroke-width="2"/>`;
    s += `<rect x="${gapL - 20}" y="${top - 56}" width="${gapR - gapL + 40}" height="16" rx="8" fill="#2b2026" opacity=".85"/><rect x="${gapL - 18}" y="${top - 54}" height="12" rx="6" fill="#ffd35a"><animate attributeName="width" values="0;${gapR - gapL + 36}" dur="3s" repeatCount="indefinite"/></rect>`;
    s += `<text x="${(gapL + gapR) / 2}" y="${top - 64}" fill="#2b2026" font-size="14" font-weight="900" text-anchor="middle">вдвоём · 3 с · 210 золота</text>`;
  }
  // полоса прочности участка
  const hp: Record<string, number> = { ok: 1, crack: 0.55, ruin: 0.2, breach: 0, fix: 0, patch: 0.4 };
  const v = hp[stage];
  const col = v >= 0.7 ? '#4fbf6a' : v >= 0.4 ? '#e2b04f' : v > 0 ? '#e28a3f' : '#e2674f';
  s += `<rect x="20" y="248" width="520" height="12" rx="6" fill="#2b2026" opacity=".5"/><rect x="20" y="248" width="${Math.max(6, 520 * v)}" height="12" rx="6" fill="${col}"/>`;
  s += `<text x="540" y="243" fill="#2b2026" font-size="13" font-weight="800" text-anchor="end">прочность участка ${Math.round(v * 100)} %</text>`;
  s += '</svg>';
  return s;
}

// ---------------------------------------------------------------- отрисовка

export function renderWalls(o: { lead: HTMLElement; map: HTMLElement; mapInfo: HTMLElement; stages: HTMLElement; stageSeg: HTMLElement; stageCap: HTMLElement; rules: HTMLElement; breakers: HTMLElement; looks: HTMLElement; hud: HTMLElement }): void {
  o.lead.innerHTML = 'По твоим ответам: <b>ломают только тяжёлые и осада</b>, у каждого участка своя прочность; пролом — дыра, через неё идут мобы; <b>стоять, ставить башни и стрелять с участка нельзя, пока не починят</b>; починка — <b>E + золото забега</b>, вдвоём быстрее, с полосой. Сейчас у стен прочности нет совсем — только у ворот (1600–4800) и кристалла (2500–5000).';
  o.map.innerHTML = mapSvg();
  const info = (id: string | null) => {
    const sec = SECTIONS.find((x) => x.id === id);
    o.mapInfo.innerHTML = sec
      ? `<b>${sec.name}</b> · прочность ${sec.hp.toLocaleString('ru-RU')} на 1-й волне${sec.slot ? ` · ${sec.slot}` : ''} · ${sec.note}`
      : '<b>11 участков</b> + ворота. Прочность растёт с волной: ×(1 + 0,03·(w−1)) — 3000 на 1-й, 5200 на 25-й, 7400 на 50-й. Бастионы ×1,5 (на них башни), морская ×0,85. Надвратная башня не ломается — её слабое место ворота. Жёлтый — трещины, красный — пролом. Кружки — места башен, зелёные крестики — где лезут липучки.';
  };
  info(null);
  o.map.addEventListener('mouseover', (e) => { const id = (e.target as Element).getAttribute?.('data-sec'); if (id) info(id); });
  o.map.addEventListener('mouseleave', () => info(null));

  // стадии
  let stageIdx = 0;
  let auto = true;
  const btns: HTMLButtonElement[] = [];
  const show = (i: number) => {
    stageIdx = i;
    o.stages.innerHTML = wallSvg(STAGES[i][0]);
    o.stageCap.innerHTML = STAGES[i][2];
    btns.forEach((b, j) => { b.classList.toggle('is-active', j === i); b.setAttribute('aria-pressed', String(j === i)); });
  };
  STAGES.forEach(([, label], i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', () => { auto = false; show(i); });
    btns.push(b);
    o.stageSeg.append(b);
  });
  show(0);
  setInterval(() => { if (auto) show((stageIdx + 1) % STAGES.length); }, 3200);

  const card = (title: string, items: string[]) => `<div class="fr-card"><h3>${title}</h3><ul>${items.map((x) => `<li>${x}</li>`).join('')}</ul></div>`;
  o.rules.innerHTML = card('Что нельзя на проломе', [
    '<b>стоять</b> — на 4 м хода нет пола, перепрыгнуть нельзя: края осыпаются',
    '<b>башня участка молчит</b>, но не пропадает: вложенное золото не теряется',
    '<b>строить и улучшать</b> на этом месте нельзя до починки',
    '<b>стрелять с участка</b> — некуда встать; бей с соседних кусков и из двора',
  ]) + card('Как мобы идут через дыру', [
    'пролом — второй вход: в поле путей к кристаллу появляется проход',
    'ближние мобы своей дороги сворачивают к дыре, если так короче, чем через ворота',
    'тяжёлые, наоборот, ищут целые участки — ломать дальше',
    'крылатки и липучки не меняют поведение; недобитые копятся, как сейчас',
  ]) + card('Ремонт — E + золото забега', [
    'держишь <b>E</b> у пролома: одному <b>5 с</b>, вдвоём <b>3 с</b>, втроём <b>2,5 с</b>',
    'цена <b>60 + 5·w</b> золота забега (110 на 10-й, 210 на 30-й) — списывается в конце',
    'удар по чинящему, шаг больше 0,5 м или выстрел — сброс без оплаты (как ремонт ворот)',
    'итог — заплатка 40 %; дальше +35 % за раз; в передышке — мгновенно',
  ]) + card('Сколько держит участок', [
    'бугай у стены на 25-й (урон ×2,2, участок 5200): ≈ <b>80 с</b> один, трое ≈ 26 с',
    'батарея на 30-й: 3 ядра ≈ 5000 из 5600 — не сорвал замок, участок на грани',
    'Таран: 2–3 рывка в ярости — пролом на северной стене',
    'колокол-щит (−50 % строениям) действует и на стены',
  ]);

  let t = '<table class="fr-breakers"><thead><tr><th>Кто</th><th>Как</th><th>Урон</th><th></th></tr></thead><tbody>';
  const max = Math.max(...BREAKERS.map((b) => b[2]));
  for (const [who, how, dmg, unit] of BREAKERS) t += `<tr><td><b>${who}</b></td><td>${how}</td><td class="num">${dmg}</td><td style="width:34%"><div class="fr-bar" style="width:${Math.max(4, (dmg / max) * 100)}%"></div><span class="fr-note">${unit}</span></td></tr>`;
  t += '<tr><td><b>Мелочь</b></td><td>шаркуны, шустрики, липучки, щиты, плевальщики, подрывники — только ворота, как сейчас</td><td class="num">0</td><td></td></tr></tbody></table>';
  o.breakers.innerHTML = t;

  for (const v of BREACH_LOOKS) {
    const el = document.createElement('div');
    el.className = 'fr-var';
    el.dataset.pick = v.id;
    el.innerHTML = `<div class="fr-var-top"><span class="id">${v.id}</span>${v.star ? '<span class="star">★ советую</span>' : ''}</div><img src="${v.img}" alt="${v.title}" loading="lazy" onerror="this.style.visibility='hidden'"><span class="fr-note">концепт генератора по снимку крепости, не кадр из игры</span><h4>${v.title}</h4><p>${v.text}</p>`;
    el.append(takeButton(v.id, 'Это оформление'));
    el.addEventListener('click', () => el.querySelector<HTMLButtonElement>('.fr-take')!.click());
    o.looks.append(el);
  }

  const core = document.createElement('div');
  core.className = 'fr-var fr-core';
  core.dataset.pick = 'С-1';
  core.innerHTML = '<div class="fr-var-top"><span class="id">С-1</span><span class="star">★ советую</span><span class="cost">цена <b>L</b></span></div><h4>Ломаемые стены целиком</h4><p><b>11 участков с прочностью, пролом, ремонт E + золото, HUD и карта.</b> Сервер: прочность и стадии участков, проход в поле путей, запрет стоять и башня «без опоры». Клиент: три стадии кладки, пролом, леса, полоса ремонта. За флагом, без флага всё как сейчас.</p><img src="img/repair-scaffold.jpg" alt="Ремонт пролома" loading="lazy" onerror="this.style.display=\'none\'">';
  core.append(takeButton('С-1', 'Делаем стены'));
  core.addEventListener('click', () => core.querySelector<HTMLButtonElement>('.fr-take')!.click());
  (o.looks.previousElementSibling ?? o.looks).before(core);

  o.hud.innerHTML = card('Как это видно в HUD', [
    'в верхней табличке рядом с воротами и кристаллом — <b>кольцо из 11 долек</b>: зелёная, жёлтая, оранжевая, красная с крестом',
    'удар по участку — долька вспыхивает (как ворота сейчас, 650 мс)',
    'пролом — тревога одной строкой «Пролом: Запад, юг!» и рог, без новых плашек',
    'у пролома подсказка «E — заделать · 210 золота · 5 с»; полоса ремонта — та же, что у ворот',
  ]) + card('Как это видно на мини-карте', [
    'стены рисуются по участкам в тех же цветах',
    'пролом — красный разрыв в стене и мигающая точка',
    'идёт ремонт — золотая дуга над участком',
    'стрелка к пролому за краем экрана, как к припасам',
  ]) + card('Как это видно в мире', [
    'три ступени кладки: трещины → обвал зубцов → дыра (две заготовки на участок, без новых ламп)',
    'пыль и камешки при ударе, глухой «бум» — тихий, с общей громкостью',
    'заплатка остаётся светлее до конца забега',
    'кто чинит — молоток в руках и стук, видно всем',
  ]);
}

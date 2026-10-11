#!/usr/bin/env node
// Сборщик ассетов страницы обзора новой набережной (lab/plaza3/index.html).
//
//   node lab/plaza3/tools/collect.mjs            — докопировать новое и переписать data/assets.json
//   node lab/plaza3/tools/collect.mjs --force    — пересобрать все картинки заново
//
// Берёт из concepts_blender/plaza3 (или PLAZA3_SRC): концепты площади, раскладку (layout.json, plan/port SVG),
// концепты и GLB павильонов (pav_*.glb + manifest*.json), концепты и GLB жителей (npc/models/*.glb без служебных),
// набор kit (demo.glb + детали для предметов). Из UI-треда (PLAZA3_UI, только чтение) — tokens.css, шрифты и иконки.
// Картинки — JPG через sips: крупная 1600 px (q82) и превью 720 px. Повторный запуск копирует только то, что
// изменилось. Страница сама читает data/assets.json: нет модели — показывает концепт и «модель в работе».
// Без зависимостей, только node и sips (macOS).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '..');
const SRC = process.env.PLAZA3_SRC || path.join(os.homedir(), 'Desktop/tired.solutions/concepts_blender/plaza3');
const UI = process.env.PLAZA3_UI || path.join(os.homedir(), 'Desktop/game-opus-ui/lab/ui');
const FORCE = process.argv.includes('--force');

const log = [];
const note = (s) => { log.push(s); console.log(s); };
const exists = (p) => fs.existsSync(p);
const rel = (p) => path.relative(OUT, p).split(path.sep).join('/');
const mkdir = (p) => fs.mkdirSync(p, { recursive: true });
const mtime = (p) => fs.statSync(p).mtimeMs;
const fresh = (src, dst) => !FORCE && exists(dst) && mtime(dst) >= mtime(src);
const list = (dir, re) => (exists(dir) ? fs.readdirSync(dir).filter((f) => re.test(f)).sort() : []);
let copied = 0, converted = 0;

function copy(src, dst) {
  mkdir(path.dirname(dst));
  if (fresh(src, dst)) return dst;
  fs.copyFileSync(src, dst);
  copied++;
  return dst;
}
function dims(file) {
  try {
    const o = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file], { encoding: 'utf8' });
    return { w: +(/pixelWidth: (\d+)/.exec(o)?.[1] || 0), h: +(/pixelHeight: (\d+)/.exec(o)?.[1] || 0) };
  } catch { return { w: 0, h: 0 }; }
}
function sips(src, dst, size, q) {
  mkdir(path.dirname(dst));
  if (fresh(src, dst)) return;
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', String(q), '-Z', String(size), src, '--out', dst], { stdio: 'ignore' });
  converted++;
}
// Картинка → {full, thumb, w, h}: крупная 1600 px и превью 720 px (только превью — thumbOnly)
function img(src, dstBase, { thumbOnly = false } = {}) {
  const thumb = dstBase + '-s.jpg';
  sips(src, thumb, 720, 78);
  if (thumbOnly) { const d = dims(thumb); return { thumb: rel(thumb), full: rel(thumb), w: d.w, h: d.h }; }
  const full = dstBase + '.jpg';
  sips(src, full, 1600, 82);
  const d = dims(full);
  return { full: rel(full), thumb: rel(thumb), w: d.w, h: d.h };
}
// png-оригинал предпочтительнее jpg-копии (меньше потерь при пережатии)
// SVG из генератора бывает с повторённым атрибутом (stroke="none" … stroke="#fff"): это ошибка XML, и <img> такую картинку
// не показывает. Копируем с починкой: из повторов остаётся последний.
function copySvg(src, dst) {
  mkdir(path.dirname(dst));
  if (fresh(src, dst)) return dst;
  let fixed = 0;
  const t = fs.readFileSync(src, 'utf8').replace(/<([a-zA-Z][\w:-]*)((?:\s+[\w:-]+="[^"]*")+)(\s*\/?)>/g, (m, tag, attrs, end) => {
    const list = [...attrs.matchAll(/\s+([\w:-]+)="([^"]*)"/g)];
    const last = new Map(list.map((x) => [x[1], x[2]]));
    if (last.size === list.length) return m;
    fixed++;
    return `<${tag}${[...last].map(([k, v]) => ` ${k}="${v}"`).join('')}${end}>`;
  });
  fs.writeFileSync(dst, t);
  if (fixed) note(`  ${path.basename(src)}: починено повторов атрибутов — ${fixed}`);
  copied++;
  return dst;
}
function pickSrc(dir, base) {
  for (const ext of ['.png', '.jpg', '.jpeg', '.webp']) if (exists(path.join(dir, base + ext))) return path.join(dir, base + ext);
  return null;
}
function readGlbJson(file) {
  try {
    const b = fs.readFileSync(file);
    if (b.readUInt32LE(0) !== 0x46546c67) return null;
    const len = b.readUInt32LE(12);
    return JSON.parse(b.subarray(20, 20 + len).toString('utf8'));
  } catch { return null; }
}

if (!exists(SRC)) { console.error('Нет папки с исходниками: ' + SRC); process.exit(1); }
const A = { generatedAt: new Date().toISOString(), source: 'concepts_blender/plaza3' };

// ------------------------------------------------------------------ раскладка
const layoutDir = path.join(SRC, 'layout');
let layout = null;
if (exists(path.join(layoutDir, 'layout.json'))) {
  copy(path.join(layoutDir, 'layout.json'), path.join(OUT, 'data/layout.json'));
  layout = JSON.parse(fs.readFileSync(path.join(layoutDir, 'layout.json'), 'utf8'));
} else note('! нет layout/layout.json');
A.layout = {};
for (const [key, name] of [['plan', 'plan'], ['planVsNow', 'plan-vs-now'], ['portA', 'port-A'], ['portB', 'port-B'], ['spawnView', 'spawn-view']]) {
  const svg = path.join(layoutDir, name + '.svg');
  if (exists(svg)) {
    copySvg(svg, path.join(OUT, 'assets/layout', name + '.svg'));
    const head = fs.readFileSync(svg, 'utf8').slice(0, 400);
    const vb = /viewBox="([\d.\s-]+)"/.exec(head)?.[1]?.split(/\s+/).map(Number) || null;
    A.layout[key] = { svg: `assets/layout/${name}.svg`, viewBox: vb };
  } else note(`! нет layout/${name}.svg`);
}

// ------------------------------------------------------------------ концепты площади
A.concepts = {};
for (const v of ['v1', 'v2', 'v3']) {
  const s = pickSrc(path.join(SRC, 'concepts', v), 'plaza') || pickSrc(path.join(SRC, 'concepts'), 'plaza-' + v);
  if (s) A.concepts[v] = img(s, path.join(OUT, 'assets/concepts', 'plaza-' + v));
  else note('! нет концепта площади ' + v);
}

// ------------------------------------------------------------------ павильоны: концепты
A.pavilionConcepts = {};
const pcDir = path.join(SRC, 'pavilions/concepts');
const pcNames = [...new Set(list(pcDir, /^\d\d-.+\.(png|jpe?g)$/i).map((f) => f.replace(/\.(png|jpe?g)$/i, '')))];
for (const base of pcNames) {
  const num = base.slice(0, 2);
  A.pavilionConcepts[num] = { slug: base.slice(3), ...img(pickSrc(pcDir, base), path.join(OUT, 'assets/pavilions', base)) };
}

// ------------------------------------------------------------------ павильоны: модели
// Какой павильон раскладки — layout_id из manifest, иначе по имени файла (HINTS), иначе по ближайшему центру к world_origin
// роли моделей, которых нет среди павильонов раскладки: они встают по своим координатам и заменяют заглушку сцены
const ROLES = [[/^lighthouse$|^tokarev/, 'lighthouse'], [/windmill|melnic/, 'windmill']];
const HINTS = [
  [/^lighthouse$|^tokarev/, null], [/online|who_?is/, 'online'], [/fish_?show|showcase|vitrin/, 'showcase'],
  [/paint|sklad/, 'paintball'], [/fort|krep/, 'fortress'], [/sky|kalan|climb/, 'kalancha'], [/kart|garage/, 'karting'],
  [/dungeon|cave|podzem|cliff/, 'dungeon'], [/farm.?gate|kalitk/, 'farmgate'], [/farm|ogorod/, 'farmarch'],
  [/kurs|kurz|arcade|slots/, 'kurzal'], [/card|veranda|pergol/, 'cards'], [/cafe|chaika/, 'cafe'], [/billiard/, 'billiards'],
  [/rotund|music|juke/, 'rotunda'], [/lookout|viewdeck|tribune/, 'viewdeck'], [/lifeguard|aqua|beach_tower|vyshka/, 'aquapark'],
  [/cabin|wardrobe|primer/, 'wardrobe'], [/aero|plane|strizh/, 'plane'], [/jetty|fish_arch|mayak/, 'jettyarch'],
  [/fishyard|hide|dvor/, 'hide'], [/rat/, 'ratrace'], [/lastoch|swallow/, 'lastochka'], [/regat/, 'regatta'],
  [/east_?mole/, 'eastmole'], [/mole|mol\b/, 'westmole'], [/semyon|shop|lavka/, 'semyon'], [/belved/, 'belvedere'], [/honor|pochet/, 'honor'], [/wheel|koleso/, 'wheel'],
];
const centers = (layout?.pavilions || []).filter((p) => p.center).map((p) => ({ id: p.id, x: p.center.x, z: p.center.z }));
// сначала по имени файла: точки world_origin ставились по прошлой раскладке, а центры павильонов переезжают (v5)
function layoutIdFor(key, origin) {
  for (const [re, id] of HINTS) if (re.test(key)) return id;
  if (origin) {
    const oz = origin.length > 2 ? origin[2] : origin[1];
    let best = null, bd = 6;
    for (const c of centers) { const d = Math.hypot(c.x - origin[0], c.z - oz); if (d < bd) { bd = d; best = c.id; } }
    if (best) return best;
  }
  return null;
}
function roleFor(key) {
  for (const [re, role] of ROLES) if (re.test(key)) return role;
  return null;
}
const pmDir = path.join(SRC, 'pavilions/models');
const manifests = {};
// предметы павильонов: наборы *_props.glb (pav_props, pb_props, …) и детали kit; propFiles — «имя предмета → файл»
A.props = null;
A.propFiles = {};
const propOut = (v) => (!/\.glb$/.test(v) ? null : /^kit\//.test(v) ? 'assets/models/' + v : 'assets/models/pav/' + v); // «kit» без файла — ищем по manifest набора
for (const f of list(pmDir, /_props\.glb$/)) {
  const src = path.join(pmDir, f);
  const dst = rel(copy(src, path.join(OUT, 'assets/models/pav', f)));
  const g = readGlbJson(src);
  const names = (g?.scenes?.[g.scene || 0]?.nodes || []).map((i) => g.nodes[i]?.name).filter(Boolean);
  for (const n of names) A.propFiles[n] ??= dst;
  if (f === 'pav_props.glb') A.props = { file: dst, pieces: names };
}
for (const f of list(pmDir, /^manifest.*\.json$/)) {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(pmDir, f), 'utf8'));
    Object.assign(manifests, m.pavilions || {});
    if (m.props?.file) for (const n of Object.keys(m.props.pieces || {})) A.propFiles[n] ??= propOut(m.props.file);
    for (const p of Object.values(m.pavilions || {})) for (const [n, v] of Object.entries(p.props_files || {})) if (propOut(v)) A.propFiles[n] ??= propOut(v);
  } catch (e) { note(`! ${f}: ${e.message}`); }
}
A.pavilionModels = [];
for (const f of list(pmDir, /^pav_.+\.glb$/)) {
  if (/_props\.glb$/.test(f)) continue;
  const src = path.join(pmDir, f);
  const dst = copy(src, path.join(OUT, 'assets/models/pav', f));
  const key = f.replace(/^pav_/, '').replace(/\.glb$/, '');
  const man = Object.entries(manifests).find(([k, v]) => v.file === f || k === key)?.[1] || null;
  const origin = man?.world_origin || man?.center_world || null;
  const glb = readGlbJson(src);
  const rend = pickSrc(path.join(pmDir, 'renders'), `pav_${key}-34`) || list(path.join(pmDir, 'renders'), new RegExp(`^[a-z]+_${key}(-34)?\\.(png|jpe?g|webp)$`)).map((x) => path.join(pmDir, 'renders', x))[0] || null;
  A.pavilionModels.push({
    key, file: rel(dst), bytes: fs.statSync(src).size,
    role: roleFor(key),
    layoutId: roleFor(key) ? null : man?.layout_id || layoutIdFor(key, origin),
    origin: origin ? [origin[0], origin.length > 2 ? origin[2] : origin[1]] : null,
    yaw: typeof man?.yaw === 'number' ? man.yaw : null,
    name: man?.name || null,
    tris: man ? (man.tris_static || man.static_tris || 0) + (man.tris_live || 0) || null : null,
    bulbs: man?.bulbs ?? null,
    props: man?.props_count ?? [man?.props_instanced, man?.props].map((o) => (o && typeof o === 'object' ? Object.values(o).filter((v) => typeof v === 'number').reduce((a, b) => a + b, 0) : null)).find((v) => v != null) ?? null,
    nodes: glb ? glb.nodes?.length : null,
    poster: rend ? img(rend, path.join(OUT, 'assets/pavilions/renders', key + '-34'), { thumbOnly: true }).thumb : null,
  });
}

// ------------------------------------------------------------------ модели, которые уже есть в игре (вход в пещеру, калитка фермы)
// В манифесте павильона: { "model": "client/assets/…glb", "node": "…", "world": [x, y, z], "yaw_world": … }. Если GLB павильона уже
// содержит этот узел (вход встроен в скалу), отдельную модель не ставим.
const GAME = process.env.PLAZA3_GAME || path.resolve(OUT, '../..');
const GAME_NAMES = { entrance: 'Вход в пещеру — как в игре', records_board: 'Доска рекордов «Подземелья»', farm_gate: 'Калитка фермы — как в игре' };
const GAME_LAYOUT = { entrance: 'dungeon', farm_gate: 'farmgate' }; // какую заглушку раскладки заменяет
A.gameModels = [];
for (const [pk, p] of Object.entries(manifests)) {
  const own = p.file && exists(path.join(pmDir, p.file)) ? readGlbJson(path.join(pmDir, p.file)) : null;
  const ownNodes = new Set((own?.nodes || []).map((n) => n.name));
  const entries = Object.entries(p).filter(([, v]) => v && typeof v === 'object' && !Array.isArray(v) && Array.isArray(v.world));
  const base = entries.find(([, v]) => typeof v.model === 'string' && /^client\/assets\/.+\.glb$/.test(v.model))?.[1]?.model;
  if (!base) continue;
  const src = path.join(GAME, base);
  if (!exists(src)) { note(`! нет ${base} в игре`); continue; }
  const gj = readGlbJson(src);
  const gameNodes = new Set((gj?.nodes || []).map((n) => n.name));
  for (const [k, v] of entries) {
    const model = v.model || base;
    if (model !== base) continue;
    if (!v.model && !(v.node && gameNodes.has(v.node))) continue; // узел своей модели павильона (донжон, мельница) — не из игры
    if (v.node && ownNodes.has(v.node)) { note(`  ${p.file}: ${v.node} уже внутри модели — отдельно не ставлю`); continue; }
    const dst = copy(src, path.join(OUT, 'assets/models/game', path.basename(model)));
    A.gameModels.push({ id: `${pk}.${k}`, of: pk, file: rel(dst), node: v.node || null, bytes: fs.statSync(src).size, world: [v.world[0], v.world.length > 2 ? v.world[2] : v.world[1]], y: v.world.length > 2 ? v.world[1] : 0, yaw: v.yaw_world ?? 0, name: GAME_NAMES[k] || k, layoutId: GAME_LAYOUT[k] || null, source: model });
  }
}

// ------------------------------------------------------------------ набор kit (демо + детали для предметов павильонов)
const kitDir = path.join(SRC, 'kit');
A.kit = {};
if (exists(path.join(kitDir, 'demo.glb'))) A.kit.demo = rel(copy(path.join(kitDir, 'demo.glb'), path.join(OUT, 'assets/models/kit/demo.glb')));
for (const f of list(path.join(kitDir, 'glb'), /\.(glb|json)$/)) copy(path.join(kitDir, 'glb', f), path.join(OUT, 'assets/models/kit/glb', f));
if (exists(path.join(kitDir, 'glb/manifest.json'))) A.kit.manifest = 'assets/models/kit/glb/manifest.json';
for (const [k, name] of [['sheet', 'kit-sheet'], ['demo34', 'demo-34'], ['demoAbove', 'demo-above']]) {
  const s = pickSrc(path.join(kitDir, 'renders'), name);
  if (s) A.kit[k] = img(s, path.join(OUT, 'assets/kit', name));
}

// ------------------------------------------------------------------ жители
A.npcConcepts = {};
const ncDir = path.join(SRC, 'npc/concepts');
for (const f of list(ncDir, /^[a-z]+\.(png|jpe?g)$/)) {
  const id = f.replace(/\.(png|jpe?g)$/, '');
  A.npcConcepts[id] = img(path.join(ncDir, f), path.join(OUT, 'assets/npc', id));
}
const lineup = pickSrc(path.join(SRC, 'npc'), 'lineup');
if (lineup) A.npcLineup = img(lineup, path.join(OUT, 'assets/npc/lineup'));
A.npcModels = {};
const nmDir = path.join(SRC, 'npc/models');
for (const f of list(nmDir, /\.glb$/)) {
  if (/^(jelly_base|base|_|test)/.test(f)) continue; // служебные: голая желейка и пробы
  const id = f.replace(/^npc_/, '').replace(/\.glb$/, '');
  const src = path.join(nmDir, f);
  const glb = readGlbJson(src);
  const rend = pickSrc(path.join(nmDir, 'renders'), `${id}-34`) || pickSrc(path.join(nmDir, 'renders'), `npc_${id}-34`);
  A.npcModels[id] = {
    file: rel(copy(src, path.join(OUT, 'assets/models/npc', id + '.glb'))),
    bytes: fs.statSync(src).size,
    clips: (glb?.animations || []).map((a) => a.name),
    parts: (glb?.nodes || []).map((n) => n.extras?.animation_part).filter(Boolean),
    poster: rend ? img(rend, path.join(OUT, 'assets/npc/renders', id + '-34'), { thumbOnly: true }).thumb : null,
  };
}

// ------------------------------------------------------------------ UI-тред: токены, шрифты, иконки (только чтение)
const ICONS = ['online', 'bell-cloud', 'float', 'horn', 'gold', 'medal-silver', 'medal-bronze', 'kart', 'regatta', 'dungeon', 'farm-gate', 'lighthouse', 'rat', 'cards', 'paint', 'climber', 'hide-box', 'slide', 'music',
  'wardrobe', 'roulette', 'boat', 'token', 'shield', 'zombie', 'records', 'season', 'quest-fish', 'ticket', 'compass', 'scroll',
  'medal-gold', 'runner', 'anchor', 'bell', 'stopwatch', 'sound'];
A.ui = { icons: {} };
if (exists(UI)) {
  if (exists(path.join(UI, 'kit/tokens.css'))) A.ui.tokens = rel(copy(path.join(UI, 'kit/tokens.css'), path.join(OUT, 'assets/ui/kit/tokens.css')));
  for (const f of list(path.join(UI, 'fonts'), /\.woff2$/)) copy(path.join(UI, 'fonts', f), path.join(OUT, 'assets/ui/fonts', f));
  for (const id of ICONS) {
    const s = path.join(UI, 'img/icons/ui', id + '.webp');
    if (exists(s)) A.ui.icons[id] = rel(copy(s, path.join(OUT, 'assets/ui/icons', id + '.webp')));
    else note('! нет иконки ' + id);
  }
} else note('! нет папки UI-треда: ' + UI + ' — таблички без иконок');

fs.writeFileSync(path.join(OUT, 'data/assets.json'), JSON.stringify(A, null, 1));

// ------------------------------------------------------------------ итог
const pc = Object.keys(A.pavilionConcepts).length, nc = Object.keys(A.npcConcepts).length;
console.log(`\nГотово: скопировано ${copied}, пережато ${converted}.`);
console.log(`Концепты павильонов: ${pc}; модели павильонов: ${A.pavilionModels.length} (${A.pavilionModels.map((m) => `${m.key}→${m.layoutId || '?'}`).join(', ') || 'нет'})`);
console.log(`Модели из игры: ${A.gameModels.map((g) => g.id).join(', ') || 'нет'}`);
console.log(`Жители: концептов ${nc}, моделей ${Object.keys(A.npcModels).length} (${Object.keys(A.npcModels).join(', ') || 'нет'})`);
const unmatched = A.pavilionModels.filter((m) => !m.layoutId && !m.role);
if (unmatched.length) console.log('! Не понял, к какому павильону раскладки относится: ' + unmatched.map((m) => m.file).join(', ') + ' — допиши layout_id в manifest или подсказку в HINTS');
console.log('data/assets.json записан.');

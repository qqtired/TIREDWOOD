// Слоты, аркада и табло казино из игровых GLB-якорей и PAVILIONS.
// node tools/plaza3/casino.mjs [--write], затем node tools/plaza3/layout.mjs.
// Проверка по умолчанию завершается ошибкой при расхождении; направления игровых якорей — -Z,
// табло — +Z. Сдвиг или поворот здания применяется ко всем корпусам, экранам и точкам E вместе.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PAVILIONS, glbJson, pavAnchors, worldNodes, rootMatrix } from '../../client/lobby/plaza3/pavdata.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const file = path.join(root, 'docs/plaza3/level/layout.json');
const src = readFileSync(file, 'utf8'), data = JSON.parse(src);
const pav = PAVILIONS.find((p) => p.id === 'kursaal');
const glb = glbJson(readFileSync(path.join(root, 'client/assets/plaza3', pav.file)));
const anchors = pavAnchors(glb, pav);
const nodes = worldNodes(glb, rootMatrix(pav));
const r = (n) => Math.round(n * 1000000) / 1000000;
const yaw = (n) => r((n % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2));
const slotPoses = Array.from({ length: 5 }, (_, i) => {
  const a = anchors.get(`anchor_slot_${i + 1}`);
  if (!a) throw new Error(`нет slot_${i + 1}`);
  return {
    body: { x: r(a.x), z: r(a.z), yaw: yaw(a.yaw) },
    use: { x: r(a.x - Math.sin(a.yaw) * 1.85), z: r(a.z - Math.cos(a.yaw) * 1.85), yaw: yaw(a.yaw + Math.PI) },
  };
});
const arcade = Array.from({ length: 6 }, (_, i) => {
  const a = anchors.get(`anchor_arcade_${i + 1}`);
  if (!a) throw new Error(`нет arcade_${i + 1}`);
  return { x: r(a.x - Math.sin(a.yaw) * 1.25), z: r(a.z - Math.cos(a.yaw) * 1.25), yaw: yaw(a.yaw + Math.PI), r: .8 };
});
const casinoBoards = Object.fromEntries(['jackpot', 'losers'].map((key) => {
  const n = nodes.find((n) => n.name === `anchor_${key}_face`);
  if (!n) throw new Error(`нет ${key}_face`);
  const m = n.m;
  return [key, { x: r(m[12]), y: r(m[13]), z: r(m[14]), yaw: yaw(Math.atan2(m[8], m[10])), w: r(2 * Math.hypot(m[0], m[1], m[2])), h: r(2 * Math.hypot(m[4], m[5], m[6])) }];
}));
const bodies = Array.from({ length: 6 }, (_, i) => anchors.get(`anchor_arcade_${i + 1}`));
const boxes = bodies.map((a) => {
  // Корпус cabinets3d: ширина .9, глубина .925. Панель выступает вперёд на .48, спина +.425.
  const front = [-Math.sin(a.yaw), -Math.cos(a.yaw)], right = [Math.cos(a.yaw), -Math.sin(a.yaw)];
  return [-.45, .45].flatMap((x) => [-.425, .5].map((z) => [a.x + x * right[0] + z * front[0], a.z + x * right[1] + z * front[1]]));
}).flat();
const collider = data.colliders.find((c) => c.id === 'pav.kurzal.arcade');
const min = [r(Math.min(...boxes.map((p) => p[0]))), 0, r(Math.min(...boxes.map((p) => p[1])))];
const max = [r(Math.max(...boxes.map((p) => p[0]))), 1.98, r(Math.max(...boxes.map((p) => p[1])))];

// Меняем только названные поля, сохраняя компактные массивы и чужие строки раскладки.
function field(text, indent, name, value) {
  const prefix = `\n${' '.repeat(indent)}${JSON.stringify(name)}: `;
  const start = text.indexOf(prefix);
  if (start < 0) throw new Error(`нет ${name}`);
  const from = start + prefix.length;
  let depth = 0, quoted = false, escaped = false, to = from;
  for (; to < text.length; to++) {
    const c = text[to];
    if (quoted) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; continue; }
    if (c === '"') quoted = true;
    else if (c === '[' || c === '{') depth++;
    else if ((c === ']' || c === '}') && --depth === 0) { to++; break; }
  }
  return text.slice(0, from) + JSON.stringify(value, null, 2).replace(/\n/g, `\n${' '.repeat(indent)}`) + text.slice(to);
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const stale = !same(slotPoses, data.modes.slotPoses) || !same(arcade, data.arcade) || !same(casinoBoards, data.modes.casinoBoards) || !same(min, collider.min) || !same(max, collider.max);
if (process.argv.includes('--write')) {
  let out = field(src, 4, 'slotPoses', slotPoses);
  out = field(out, 2, 'arcade', arcade);
  if (data.modes.casinoBoards) out = field(out, 4, 'casinoBoards', casinoBoards);
  else out = out.replace('\n    "sunsetBench": {', `\n    "casinoBoards": ${JSON.stringify(casinoBoards, null, 2).replace(/\n/g, '\n    ')},\n    "sunsetBench": {`);
  const from = out.indexOf('"id": "pav.kurzal.arcade"'), to = out.indexOf('\n    }', from);
  const block = out.slice(from, to).replace(/"min": \[[^\]]+\]/, `"min": [${min.join(', ')}]`).replace(/"max": \[[^\]]+\]/, `"max": [${max.join(', ')}]`);
  out = out.slice(0, from) + block + out.slice(to);
  writeFileSync(file, out);
  console.log('Казино: пять слотов, шесть аркад, две доски и коллизия записаны по GLB-якорям');
} else {
  console.log(stale ? 'Казино: раскладка не совпадает с GLB-якорями; запусти --write' : 'Казино: все привязки совпадают с GLB-якорями');
  process.exitCode = stale ? 1 : 0;
}

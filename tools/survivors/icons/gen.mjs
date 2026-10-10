// «Подземелье»: один лист иконок через Codex CLI image_gen (промпт на stdin, как в docs/survivors/art/PROVENANCE.md).
// Запуск: node tools/survivors/icons/gen.mjs <лист> [--ref <png>] [--tag <суффикс>]
//   <лист> — name из sheets.mjs (weapons, passives, evo-active, pickups, poi, mobs, ui).
//   --ref — приложить уже принятый лист как образец стиля (codex exec -i).
// Промпт пишется в tools/survivors/icons/prompts/<лист>[-tag].txt, картинка копируется из ~/.codex/generated_images/…
// в docs/survivors/art/icons-src/<лист>[-tag].png (в git не идёт), источник — в tools/survivors/icons/sources/<лист>[-tag].json.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SHEETS, promptFor } from './sheets.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const HERE = fileURLToPath(new URL('./', import.meta.url));
const args = process.argv.slice(2);
const name = args[0];
const opt = (k) => { const i = args.indexOf(k); return i > 0 ? args[i + 1] : undefined; };
const ref = opt('--ref');
const tag = opt('--tag');
const sheet = SHEETS.find((s) => s.name === name);
if (!sheet) { console.error('нет листа', name, '— есть:', SHEETS.map((s) => s.name).join(', ')); process.exit(1); }

const base = tag ? `${name}-${tag}` : name;
const prompt = promptFor(sheet, !!ref);
fs.mkdirSync(HERE + 'prompts', { recursive: true });
fs.writeFileSync(HERE + `prompts/${base}.txt`, prompt);

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-icons-'));
const log = path.join(work, 'last.txt');
const cmd = ['exec', '-s', 'workspace-write', '-C', work, '--skip-git-repo-check'];
if (ref) cmd.push('-i', path.resolve(ref));
cmd.push('-o', log, '-');
const t0 = Date.now();
console.log(`[${base}] codex ${cmd.join(' ')}`);
const child = spawn('codex', cmd, { stdio: ['pipe', 'ignore', 'inherit'] });
child.stdin.end(prompt);
const code = await new Promise((res) => child.on('close', res));
const last = fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '';
const found = [...last.matchAll(/(\/[^\s`'"()<>]+\.png)/g)].map((m) => m[1]).filter((p) => fs.existsSync(p));
if (code !== 0 || !found.length) { console.error(`[${base}] не вышло (код ${code}):\n${last}`); process.exit(1); }
const src = found[found.length - 1];
const outDir = ROOT + 'docs/survivors/art/icons-src/';
fs.mkdirSync(outDir, { recursive: true });
fs.copyFileSync(src, outDir + `${base}.png`);
fs.mkdirSync(HERE + 'sources', { recursive: true });
const rec = { sheet: name, source: src.replace(os.homedir(), '~'), ref: ref ? path.basename(ref) : null, date: new Date().toISOString().slice(0, 10), seconds: Math.round((Date.now() - t0) / 1000) };
fs.writeFileSync(HERE + `sources/${base}.json`, JSON.stringify(rec, null, 2) + '\n');
console.log(`[${base}] готово за ${Math.round((Date.now() - t0) / 1000)} с: ${src} → docs/survivors/art/icons-src/${base}.png`);

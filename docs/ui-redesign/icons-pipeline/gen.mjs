// Usage: node gen.mjs <concurrency> <id> [id...]   (id may be "id:v2" to use alternate subject file override via subjects-override.json)
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync, existsSync, readdirSync, copyFileSync, appendFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const LIST = join(HERE, '..', 'icons-list.md');
const GEN = join(homedir(), '.codex', 'generated_images');

const subjects = {};
for (const line of readFileSync(LIST, 'utf8').split('\n')) {
  const m = line.match(/^- ([a-z0-9-]+) — .*? — (.+)$/);
  if (m) subjects[m[1]] = m[2].trim();
}
const overridePath = join(HERE, 'subjects-override.json');
const override = existsSync(overridePath) ? JSON.parse(readFileSync(overridePath, 'utf8')) : {};

const CHARS = new Set(['token', 'online', 'zombie', 'climber', 'brute', 'champion', 'boss', 'landing', 'bloater', 'spitter', 'armored', 'thief', 'wd-e-normal', 'wd-e-sleepy', 'wd-e-angry', 'wd-e-happy']);
const JELLY = ' Jelly-bean characters: soft rounded gummy-candy bodies, two small dark oval eyes, mitten hands, no legs, no nose.';
const STYLE = 'Style: a single bold game interface icon for a cozy seaside resort party game (a sunny Black Sea town with jelly-bean characters), polished hand-painted cartoon look in the same family as other chunky game item icons: clean readable shapes, soft painterly cel shading, a thin dark-brown outline, a gentle bright highlight, rich natural saturated colors, warm midday summer sunlight from the upper left with soft warm shadows. The object is shown large and centered in a pleasant three-quarter view, filling about 80 percent of the square 1024x1024 canvas with small even margins. Genuinely transparent background (real alpha channel): no ground, no cast shadow, no scenery, no checkerboard, no white box, no frame, no border. Cozy and grounded storybook mood: not sci-fi, no neon, no electric glow, no darkness. Strictly: no text, no letters, no numbers, no symbols, no logos, no watermark. Avoid any blue-and-yellow color combination.';

export function buildPrompt(id, subject) {
  const style = STYLE + (CHARS.has(id) ? JELLY : '');
  return `Use your built-in image generation tool (image_gen) to generate ONE image on a genuinely transparent background (transparent_background true), square 1024x1024. Do not write code to draw it and do not edit any other files. Subject: ${subject}.\n\n${style}\n\nThen copy the generated image file, completely unchanged (do not resize, convert, crop or otherwise edit it), into the current working directory as ${id}.png.`;
}

function runOne(spec) {
  const [id, ver] = spec.split(':');
  const key = ver ? `${id}:${ver}` : id;
  const subject = override[key] ?? subjects[id];
  if (!subject) throw new Error('no subject for ' + id);
  const dir = join(HERE, ver ? `${id}-${ver}` : id);
  mkdirSync(dir, { recursive: true });
  const prompt = buildPrompt(id, subject);
  writeFileSync(join(dir, 'prompt.txt'), prompt);
  return new Promise((resolve) => {
    const t0 = Date.now();
    const p = spawn('codex', ['exec', '--skip-git-repo-check', '-s', 'workspace-write', '-C', dir, '--json', prompt], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { appendFileSync(join(dir, 'stderr.log'), d); });
    const timer = setTimeout(() => p.kill('SIGTERM'), 8 * 60 * 1000);
    p.on('close', (code) => {
      clearTimeout(timer);
      writeFileSync(join(dir, 'codex.jsonl'), out);
      let thread = null;
      for (const l of out.split('\n')) {
        try { const j = JSON.parse(l); if (j.type === 'thread.started') thread = j.thread_id; } catch {}
      }
      let orig = null;
      if (thread && existsSync(join(GEN, thread))) {
        const fs = readdirSync(join(GEN, thread)).filter((f) => f.endsWith('.png'));
        if (fs.length) {
          fs.sort((a, b) => statSync(join(GEN, thread, b)).mtimeMs - statSync(join(GEN, thread, a)).mtimeMs);
          orig = join(GEN, thread, fs[0]);
          copyFileSync(orig, join(dir, 'orig.png'));
          writeFileSync(join(dir, 'orig-source.txt'), `${thread}/${fs[0]}\n`);
        }
      }
      console.log(`${key} code=${code} thread=${thread} orig=${orig ? orig.split('/').slice(-2).join('/') : 'NONE'} ${(Date.now() - t0) / 1000 | 0}s`);
      resolve();
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const conc = Number(process.argv[2]);
  const queue = process.argv.slice(3);
  const workers = Array.from({ length: conc }, async () => {
    while (queue.length) await runOne(queue.shift());
  });
  await Promise.all(workers);
  console.log('BATCH DONE');
}

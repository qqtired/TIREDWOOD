import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = '/Users/tired/Desktop/game-opus-ui/client/assets/ui/icons';
const lines = readFileSync(join(HERE, '..', 'icons-list.md'), 'utf8').split('\n');
const override = JSON.parse(readFileSync(join(HERE, 'subjects-override.json'), 'utf8'));
const CHARS = new Set(['token', 'online', 'zombie', 'climber', 'brute', 'champion', 'boss', 'landing', 'bloater', 'spitter', 'armored', 'thief']);
const WEAK = {}; // filled below
const sections = []; let cur = null; let total = 0; let count = 0;
for (const l of lines) {
  const h = l.match(/^## (.+)/); if (h) { cur = { title: h[1], items: [] }; sections.push(cur); continue; }
  const m = l.match(/^- ([a-z0-9-]+) — (.*?) — (.+)$/); if (!m) continue;
  const [, id, ru, subj] = m;
  const regen = id === 'keys' || id === 'pumpkin-boss';
  const dir = regen ? id + '-v2' : id;
  const src = readFileSync(join(HERE, dir, 'orig-source.txt'), 'utf8').trim();
  const [thread, file] = src.split('/');
  const sha = createHash('sha256').update(readFileSync(join(HERE, dir, 'orig.png'))).digest('hex').slice(0, 12);
  const kb = Math.round(statSync(join(OUT, id + '.webp')).size / 1024);
  total += statSync(join(OUT, id + '.webp')).size; count++;
  const subject = regen ? override[id + ':v2'] : subj;
  let body = `- **\`${id}.webp\`** — ${ru}. Subject: ${subject}.\n`;
  if (CHARS.has(id)) body += `  - к общему стилю добавлена строка про желейных персонажей (см. выше)\n`;
  if (id === 'pumpkin-boss') body += `  - v1 (рыжая тыква-фонарь со светящимся вырезанным лицом и красными потёками, как у модели) вышла слишком мрачной для нашего стиля — перерисован добрый ворчун-король с ножками и лозами-руками (v2), он в игре. Описание v1: ${subj}.\n`;
  if (id === 'keys') body += `  - v1 (колпачок без основания) читался как кремовый кубик/зефирина — перерисован с видимой ножкой и пластиной (v2), он в игре. Описание v1: ${subj}.\n`;
  body += `  - исходник \`${file}\` (папка Codex \`${thread}\`, 1254x1254, sha256 ${sha}…), в игре ${kb} КБ\n`;
  cur.items.push(body);
}
const secNames = { 'Shell': 'Оболочка (интерфейс, меню, HUD)', 'Fishing': 'Рыбалка', 'Fort': 'Крепость', 'Other modes and events': 'Другие режимы и события' };
let md = `# Иконки интерфейса TIREDWOOD (client/assets/ui/icons)

Нарисованы 11 октября 2026 через Codex CLI (первые 88 — v0.153.4, «Дополнение 2» — v0.162.1; \`codex exec\`, встроенный \`image_gen\`, прозрачный фон), **одна иконка на вызов**, по три вызова одновременно, без рисования кодом и без правок руками. Ключей не запрашивали — у Codex своя авторизация.
Всего ${count} иконок: ${sections.map((s) => `${secNames[s.title] ?? s.title} — ${s.items.length}`).join(', ')}. Сводка — \`_sheet.png\` (каждая иконка 128 px и 48 px, id под ней; подписи и номера наложены скриптом, не генератором).

Тот же способ, что у иконок фермы (\`client/assets/farm/icons/PROVENANCE.md\`). Стиль сверен с иконками фермы, крепости и лавки рыбака: рисованная «сказочная» манера, тёплое солнце слева сверху, тонкий тёмно-коричневый контур. Без надписей и цифр, без сине-жёлтого, без sci-fi и неона. Список взят из задания «UI icons» (id — смысл — Subject); в задании было «~70», в списке 73 id — нарисованы все.

## Формат

- **256×256 WebP с альфой** (качество 0,82), прозрачный фон; как у иконок крепости (\`client/assets/fort/*.webp\`). Всего ${(total / 1024).toFixed(0)} КБ (по 6–20 КБ на иконку).
- Предмет обрезан по содержимому (альфа > 24) и вписан в 240×240 по центру (поле 8 px), поэтому мелкие и крупные предметы занимают рамку одинаково.
- Оригиналы 1254×1254 в репозиторий не кладём; они лежат в библиотеке Codex (\`~/.codex/generated_images/<папка Codex>/<файл>.png\`, имена — в таблице ниже).

## Как вызывали

\`\`\`
codex exec --skip-git-repo-check -s workspace-write -C <рабочая папка> --json "<обёртка>"
\`\`\`

Рабочая папка своя для каждой иконки; исходник берётся не из копии, а из библиотеки Codex по \`thread_id\` из \`--json\` (папка \`~/.codex/generated_images/<thread_id>/\`).

Обёртка (та же, что у иконок фермы):

\`\`\`
Use your built-in image generation tool (image_gen) to generate ONE image on a genuinely transparent background (transparent_background true), square 1024x1024. Do not write code to draw it and do not edit any other files. Subject: <описание предмета>.

<общий стиль>

Then copy the generated image file, completely unchanged (do not resize, convert, crop or otherwise edit it), into the current working directory as <id>.png.
\`\`\`

## Общий стиль (добавлялся к каждому вызову)

Как у фермы, но в первом предложении другое место действия («a single bold game interface icon for a cozy seaside resort party game (a sunny Black Sea town with jelly-bean characters)»):

\`\`\`
Style: a single bold game interface icon for a cozy seaside resort party game (a sunny Black Sea town with jelly-bean characters), polished hand-painted cartoon look in the same family as other chunky game item icons: clean readable shapes, soft painterly cel shading, a thin dark-brown outline, a gentle bright highlight, rich natural saturated colors, warm midday summer sunlight from the upper left with soft warm shadows. The object is shown large and centered in a pleasant three-quarter view, filling about 80 percent of the square 1024x1024 canvas with small even margins. Genuinely transparent background (real alpha channel): no ground, no cast shadow, no scenery, no checkerboard, no white box, no frame, no border. Cozy and grounded storybook mood: not sci-fi, no neon, no electric glow, no darkness. Strictly: no text, no letters, no numbers, no symbols, no logos, no watermark. Avoid any blue-and-yellow color combination.
\`\`\`

Для иконок с желейными персонажами (${[...CHARS].map((c) => '`' + c + '`').join(', ')}) в конец общего стиля добавлялась строка:

\`\`\`
Jelly-bean characters: soft rounded gummy-candy bodies, two small dark oval eyes, mitten hands, no legs, no nose.
\`\`\`

У остальных иконок (предметы, летучая мышь, крыса) этой строки нет, чтобы на предметах не появлялись глаза.

## Постобработка

Скрипт на node + headless Chrome (canvas, без установки пакетов; свой профиль, свой порт отладки 9491, сырой CDP): альфа ≤6 → 0 и ≥248 → 255, обрезка по альфе >24, уменьшение по большей стороне до 240 px (ступенчато вдвое, затем \`imageSmoothingQuality = high\`), холст 256×256, WebP с альфой, качество 0,82. Проверка по краям исходника: ни у одной иконки нет непрозрачных пикселей по периметру (нет фона, плашки или рамки).

## Иконки: id, смысл, что нарисовано (отличие промпта — строка «Subject»)

`;
for (const s of sections) md += `### ${secNames[s.title] ?? s.title}\n\n${s.items.join('')}\n`;
md += `## Перегенерации

- \`keys\`: v1 — просто кремовый скруглённый кубик, на 48 px не читался как клавиша → v2 с тёмной ножкой и квадратной пластиной под колпачком (он в игре).
- \`pumpkin-boss\`: v1 — рыжая тыква-фонарь со светящимся вырезанным лицом и красными потёками (выглядит мрачно, потёки как кровь) → v2 добрый ворчун-король с ножками, короной и лозами-руками (он в игре).
- Остальные ${count - 2} — с первого раза, без правок.

## Слабые места (оставлены как есть)

- \`pin\` — нарисована кнопка-кнопка (канцелярская булавка с красной шляпкой), а не картографическая метка; на 48 px читается как «точка/место», для «где ты» подходит.
- \`fog\` — лампа в клубах тумана; на 48 px туман сливается с лампой, но силуэт «лампа в дымке» узнаётся.
- \`landing\` — лодка с пятью зомби-желейками; на 48 px зомби мелкие, читается как «лодка с зелёными».
- \`bloater\` — раздутый шар со швами и брызгами варенья: на 48 px читается как красно-оранжевый воздушный шар-зомби; швы и брызги слегка «кровавые», но мультяшные.
- \`armored\` — «чугунок»: кроме кастрюли-шлема и колец-лат в руках деревянная ложка и крышка-щит (лишнее, не мешает).
- \`leshy\` — мелкая детальная коряга с рогами и ягодами; на 48 px — «ходячее дерево», от \`rift-tree\` отличается рогами и руками.
- \`elite\` — золотой пояс чемпиона (как пояс элиты на модели зомби), без лица: на 48 px читается как «золотая награда».
- \`chat\` — пустой кремовый пузырь без контрастной заливки: на светлом фоне интерфейса сливается, на тёмной плашке виден хорошо.

## Сводка

\`_sheet.png\` — все ${count} иконок сеткой 8 × ${Math.ceil(count / 8)}: слева 128 px, справа вверху 48 px, id внизу; номер справа — порядковый номер в списке. Фон листа кремовый, чтобы был виден край иконок.
`;
writeFileSync(join(OUT, 'PROVENANCE.md'), md);
console.log('written', md.length, 'chars,', count, 'icons,', (total/1024).toFixed(0), 'KB');

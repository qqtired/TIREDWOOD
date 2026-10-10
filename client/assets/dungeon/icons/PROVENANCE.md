# Иконки интерфейса «Подземелья» — происхождение

**Дата:** 10 октября 2026. **Чем:** Codex CLI 0.153.4, встроенный инструмент `image_gen` — так же, как концепт-арт
(`docs/survivors/art/PROVENANCE.md`): `codex exec -s workspace-write -C <временная папка> --skip-git-repo-check -o <лог> -`,
промпт на stdin, одна картинка на вызов, ключи не трогали. Кодом ничего не рисовали: скрипт только режет, уменьшает,
делает круглую маску и кодирует WebP. Надписей на иконках нет (проверено глазами по контактному листу).

- 63 иконки `<вид>-<id>.webp`, 192×192, WebP с прозрачностью (качество 0,82), вместе **≈ 587 КБ** (7–13 КБ на иконку).
  192, а не 128: в карточках улучшений и на экранах с плотностью 2× иконка идёт крупнее 64 px, а бюджет 1,5 МБ позволяет.
- Контактный лист: `docs/survivors/art/icons-sheet.png` — каждая иконка 128 px и она же 48 px, под ней id (подпись ставит скрипт).
- Исходные листы Codex (PNG 1536×1024) — локально в `docs/survivors/art/icons-src/` (в git не идут, тяжёлые), оригиналы — в `~/.codex/generated_images/…`.

## Как устроен набор

Каждая иконка — круглый медальон: обод, диск с мягким свечением в центре, один крупный предмет в 3/4 с тёмно-коричневым
контуром, свет тёплый слева сверху. Категория читается по цвету диска и обода:

| Вид | Диск | Обод |
|---|---|---|
| `weapon-*` оружие | ржаво-кирпичный | латунь |
| `evo-*` эволюция | золото с лучами | золото с заклёпками |
| `passive-*` пассивки | патина, бирюзово-зелёный | тёмная бронза |
| `pickup-*` подборы | моховой оливковый | орех |
| `poi-*` точки на карте (указатели у края экрана) | серый сланец | железо с заклёпками |
| `active-*` рывок и удар Q | янтарно-оранжевый | латунь |
| `mob-*` враги | песочный камень пола (враги на нём контрастны, как в игре) | железо с подтёками варенья |
| `ui-*` интерфейс и баффы | тёмная умбра | тонкая латунь |

id — как в `docs/survivors/design-data.json` и `client/dungeon/data.ts`: моб `slime` = модель `slug`, `slimelet` — его
малыш, `barrel` = модель `cooper` (Бочар), `boss` = Старый Повидл. Сверх списка: `poi-chest` (указатель «chest» у края
экрана), `ui-*` вместо эмодзи интерфейса — `reroll`, `banish`, `gold` (🪙), `levelup` (★), `kills` (💀 → раздавленная
капля варенья, без черепов), `temper` (⚒ «Закалка»), `hp` (❤️), баффы алтаря `fury`, `haste`, `wind`, `pull`, и `wave` (волна).

## Листы и источники

| Лист | Раскладка | Файл Codex (`~/.codex/generated_images/…`) | Что взято |
|---|---|---|---|
| `weapons` | 4×2 | `01a126f9-9395-7732-86e3-b627fe42245c/exec-0e5bdf0c-…png` | 8 оружий, кроме fireflies и stalactites |
| `passives` | 4×2 | `01a126f9-9395-7fd0-a1a0-599fae45356b/exec-e827deb5-…png` | 8 пассивок |
| `evo-active` | 3×2 | `01a126fb-4652-76b2-9285-e44fda5f0503/exec-00cee3ae-…png` | 3 эволюции (без fireflies_evo), dash, strike |
| `pickups` | 3×2 | `01a126fb-4652-7c00-8c83-08e784b2f4a9/exec-464316f8-…png` | 6 подборов |
| `poi` | 4×3 | `01a126fb-4652-7f11-a536-78e0bd609421/exec-79998f70-…png` | 12 точек |
| `mobs` | 4×3 (последняя клетка пустая) | `01a126fb-4652-74c0-b732-022b090fb57f/exec-66e186fa-…png` | 11 врагов |
| `ui` | 4×3 | `01a126fb-4652-75a2-8e5c-2b38f31068eb/exec-65f6dcdc-…png` | 11 значков, кроме wave |
| `fix` | 2×2 | `01a126fe-bcc7-7e22-a68d-a0a787ca33f8/exec-972a27b1-…png` | доработка слабых при 48 px: `weapon-fireflies` (тонкие светляки), `weapon-stalactites` (серый на ржавом), `ui-wave` (тёмное пятно), `evo-fireflies_evo` (каша из искр) |
| `mobs-ref` | 4×3 | `01a126fb-4652-7720-a5f3-d7c6ca060d6e/exec-66ce6d32-…png` | **не взят**: пробовали приложить лист `weapons` образцом (`codex exec -i`) — медальоны слиплись по вертикали, сетка развалилась |

Полные пути — в `tools/survivors/icons/sources/<лист>.json`.

## Как резали

`node tools/survivors/icons/cut.mjs` (только node и headless Chrome из playwright, без python и без новых пакетов):

1. Фон листа: Codex отдал либо прозрачный PNG (`weapons`, `passives`, `ui`, маска по альфе), либо ровный белый (остальные,
   маска «цвет дальше 60 от медианы краёв листа»).
2. Связные области маски; крупная область = медальон, его клетка сетки — по центру рамки.
3. Круг: центр рамки и меньшая из её сторон (подтёк или крыло, торчащие за обод, удлиняют только одну сторону — центр
   по длинной стороне берётся там, где область шире).
4. Квадрат вокруг круга уменьшается до 192 px в два шага (без зубцов), снаружи круга — прозрачность со сглаженным краем
   (срезано 1,2 % диаметра, чтобы не тянуть кромку фона).
5. WebP — `canvas.toDataURL('image/webp', 0.82)`; контактный лист — тот же canvas с подписями id.

Какая иконка из какого листа — `PICK` в `cut.mjs`. Перегенерировать лист — `node tools/survivors/icons/gen.mjs <лист> [--tag b]`
(промпт строит `tools/survivors/icons/sheets.mjs`, отправленный текст сохраняется в `tools/survivors/icons/prompts/<лист>.txt`).

## Промпты целиком

Ровно тот текст, что ушёл на stdin Codex (из `tools/survivors/icons/prompts/`).

### weapons

```
Use your built-in image generation tool (image_gen) to generate exactly ONE image from the brief below. Do not draw it with code, scripts or SVG, do not edit other files. After generating, tell me the exact file path of the generated image. Brief:

Game UI icon sheet, landscape 3:2 (1536x1024), on a perfectly flat, uniform, pure white background filling the whole canvas edge to edge (no texture, no gradient, no shadows on the background, no vignette, nothing else on the background). Exactly 8 round icon medallions arranged in a strict grid of 4 columns and 2 rows, evenly spaced, all medallions exactly the same size (each about 80% of its grid cell), each centered in its cell, with clear white gaps between them; nothing touches the canvas edge or another medallion.

Every medallion has the same construction: a perfect flat-on circle (not tilted, no drop shadow); a rim about 6% of the diameter; an inner disc with a soft radial gradient, lighter in the center behind the object; ONE single bold object in the center, large (about 70% of the inner disc), drawn in a 3/4 view with a consistent dark warm-brown outline, simple chunky shapes and few small details so it stays readable at 48 pixels; strong light-dark contrast between the object and the disc. The lighting is the same on every medallion: warm key light from the upper left, soft shade on the lower right, a small specular highlight. Nothing sticks out beyond the rim.

Every medallion on this sheet has a deep warm rust-brick red-brown inner disc (dark #5A2819 at the edge to #9A4A2E in the center) with a polished brass rim.

Contents of the medallions:
First row, left to right: 1) a big brass-and-glass miner's lantern hanging from a short chain, a bright warm amber flame inside, a soft cone of warm light flaring out of it; 2) three glowing hot orange-red embers (round coals with bright yellow cores) flying in curved homing trails with tiny sparks; 3) an iron miner's pickaxe with a wooden handle, spinning, with a curved pale-amber motion arc around it like a returning boomerang; 4) three small glowing golden fireflies (tiny round glowing bodies with little wings) circling along one faint glowing ring orbit.
Second row, left to right: 5) a faceted turquoise crystal shard releasing a jagged turquoise lightning spark that zig-zags out to the side; 6) a sharp grey-brown stone stalactite falling point-down, a few small rock chips around it and a dark round shadow under its tip; 7) a bundle of three short red-brown blasting powder sticks tied with twine, a lit fuse sparking on top; 8) a brass beacon lamp with a big round glass lens shooting one long straight piercing beam of warm white-gold light diagonally.

Style: polished hand-painted game item icons in the same look as warm storybook cartoon concept art for a browser top-down action game set in underground cellars and an old mine under a cozy seaside town: clean readable shapes, soft rounded forms, gentle painterly texture, moderately saturated warm colors (not neon, not oversaturated). World palette: dark warm stone, brass and old wood, warm amber lantern light, cool turquoise crystals as an accent, glossy violet blackcurrant jam of the Jam Baron's army. Light dark fantasy without excess: no blood, no gore, no skulls, no horror, not childish, not sci-fi, no neon.

Strictly: no text, no letters, no numbers, no runes that look like letters, no logos, no labels or captions under the icons, no frame around the sheet, no watermark, no signature.
no text, no letters, no logos.
```

### passives

```
Use your built-in image generation tool (image_gen) to generate exactly ONE image from the brief below. Do not draw it with code, scripts or SVG, do not edit other files. After generating, tell me the exact file path of the generated image. Brief:

Game UI icon sheet, landscape 3:2 (1536x1024), on a perfectly flat, uniform, pure white background filling the whole canvas edge to edge (no texture, no gradient, no shadows on the background, no vignette, nothing else on the background). Exactly 8 round icon medallions arranged in a strict grid of 4 columns and 2 rows, evenly spaced, all medallions exactly the same size (each about 80% of its grid cell), each centered in its cell, with clear white gaps between them; nothing touches the canvas edge or another medallion.

Every medallion has the same construction: a perfect flat-on circle (not tilted, no drop shadow); a rim about 6% of the diameter; an inner disc with a soft radial gradient, lighter in the center behind the object; ONE single bold object in the center, large (about 70% of the inner disc), drawn in a 3/4 view with a consistent dark warm-brown outline, simple chunky shapes and few small details so it stays readable at 48 pixels; strong light-dark contrast between the object and the disc. The lighting is the same on every medallion: warm key light from the upper left, soft shade on the lower right, a small specular highlight. Nothing sticks out beyond the rim.

Every medallion on this sheet has a deep muted verdigris teal-green inner disc (#1B423E at the edge to #3E7C72 in the center) with a dark bronze rim.

Contents of the medallions:
First row, left to right: 1) a thick cream wax candle with a big bright tall flame on a glowing wick; 2) a small round glass flask of golden lamp oil with a cork stopper, one golden drop falling from it; 3) a round brass-rimmed magnifying lens with a short wooden handle, glinting glass; 4) a dark grey flint stone and a steel striker hitting it, a bright burst of orange sparks.
Second row, left to right: 5) a brown leather work apron with stitched edges, a front pocket and neck strap; 6) a dented brown miner's helmet with a small brass headlamp glowing on the front; 7) a sturdy brown leather work boot with iron hobnails on the sole and a small white motion swoosh behind the heel; 8) an old worn iron horseshoe with nail holes, a few small turquoise crystal shards being pulled toward it.

Style: polished hand-painted game item icons in the same look as warm storybook cartoon concept art for a browser top-down action game set in underground cellars and an old mine under a cozy seaside town: clean readable shapes, soft rounded forms, gentle painterly texture, moderately saturated warm colors (not neon, not oversaturated). World palette: dark warm stone, brass and old wood, warm amber lantern light, cool turquoise crystals as an accent, glossy violet blackcurrant jam of the Jam Baron's army. Light dark fantasy without excess: no blood, no gore, no skulls, no horror, not childish, not sci-fi, no neon.

Strictly: no text, no letters, no numbers, no runes that look like letters, no logos, no labels or captions under the icons, no frame around the sheet, no watermark, no signature.
no text, no letters, no logos.
```

### evo-active

```
Use your built-in image generation tool (image_gen) to generate exactly ONE image from the brief below. Do not draw it with code, scripts or SVG, do not edit other files. After generating, tell me the exact file path of the generated image. Brief:

Game UI icon sheet, landscape 3:2 (1536x1024), on a perfectly flat, uniform, pure white background filling the whole canvas edge to edge (no texture, no gradient, no shadows on the background, no vignette, nothing else on the background). Exactly 6 round icon medallions arranged in a strict grid of 3 columns and 2 rows, evenly spaced, all medallions exactly the same size (each about 80% of its grid cell), each centered in its cell, with clear white gaps between them; nothing touches the canvas edge or another medallion.

Every medallion has the same construction: a perfect flat-on circle (not tilted, no drop shadow); a rim about 6% of the diameter; an inner disc with a soft radial gradient, lighter in the center behind the object; ONE single bold object in the center, large (about 70% of the inner disc), drawn in a 3/4 view with a consistent dark warm-brown outline, simple chunky shapes and few small details so it stays readable at 48 pixels; strong light-dark contrast between the object and the disc. The lighting is the same on every medallion: warm key light from the upper left, soft shade on the lower right, a small specular highlight. Nothing sticks out beyond the rim.

Medallion colors: the 4 medallions with upgraded weapons have a rich golden-amber inner disc glowing from the center with soft golden rays (#7A4E12 at the edge to #F0BE58 in the center) with an ornate polished GOLD rim decorated with small round studs (the upgraded legendary version); the 2 medallions with hero abilities have a bright warm amber-orange inner disc (#8A3E12 at the edge to #F09A40 in the center) with a brass rim.

Contents of the medallions:
First row, left to right: 1) [gold upgraded medallion] the miner's lantern, upgraded: gilded gold frame, ornate, blazing white-gold flame, two fierce jets of fire bursting out of it to the front and to the back; 2) [gold upgraded medallion] a huge round falling boulder with glowing golden cracks, several small stalactites falling around it and a puff of dust; 3) [gold upgraded medallion] a small golden lighthouse lamp head (brass lantern room with a big lens) shooting two opposite long beams of golden light, as if rotating.
Second row, left to right: 4) [gold upgraded medallion] a swarm of many glowing golden fireflies arranged in two concentric glowing rings, a small warm heart-shaped glow in the very center; 5) [amber-orange medallion] a bright white-amber comet-like dash streak shooting forward with three parallel motion lines and a small dust puff at its tail; 6) [amber-orange medallion] a heavy brass lantern on its chain slammed down onto the stone floor, a big circular amber shockwave ring and flying stone chips around the impact.

Style: polished hand-painted game item icons in the same look as warm storybook cartoon concept art for a browser top-down action game set in underground cellars and an old mine under a cozy seaside town: clean readable shapes, soft rounded forms, gentle painterly texture, moderately saturated warm colors (not neon, not oversaturated). World palette: dark warm stone, brass and old wood, warm amber lantern light, cool turquoise crystals as an accent, glossy violet blackcurrant jam of the Jam Baron's army. Light dark fantasy without excess: no blood, no gore, no skulls, no horror, not childish, not sci-fi, no neon.

Strictly: no text, no letters, no numbers, no runes that look like letters, no logos, no labels or captions under the icons, no frame around the sheet, no watermark, no signature.
no text, no letters, no logos.
```

### pickups

```
Use your built-in image generation tool (image_gen) to generate exactly ONE image from the brief below. Do not draw it with code, scripts or SVG, do not edit other files. After generating, tell me the exact file path of the generated image. Brief:

Game UI icon sheet, landscape 3:2 (1536x1024), on a perfectly flat, uniform, pure white background filling the whole canvas edge to edge (no texture, no gradient, no shadows on the background, no vignette, nothing else on the background). Exactly 6 round icon medallions arranged in a strict grid of 3 columns and 2 rows, evenly spaced, all medallions exactly the same size (each about 80% of its grid cell), each centered in its cell, with clear white gaps between them; nothing touches the canvas edge or another medallion.

Every medallion has the same construction: a perfect flat-on circle (not tilted, no drop shadow); a rim about 6% of the diameter; an inner disc with a soft radial gradient, lighter in the center behind the object; ONE single bold object in the center, large (about 70% of the inner disc), drawn in a 3/4 view with a consistent dark warm-brown outline, simple chunky shapes and few small details so it stays readable at 48 pixels; strong light-dark contrast between the object and the disc. The lighting is the same on every medallion: warm key light from the upper left, soft shade on the lower right, a small specular highlight. Nothing sticks out beyond the rim.

Every medallion on this sheet has a deep mossy olive-green inner disc (#26341C at the edge to #5E7A3A in the center) with a dark walnut-wood rim.

Contents of the medallions:
First row, left to right: 1) a cluster of three glowing turquoise experience crystals (faceted gem shards); 2) a steaming round clay bowl of hearty stew with chunks of vegetables and a wooden spoon; 3) a classic U-shaped magnet, crimson-red body with silver tips, small curved pull lines between the tips.
Second row, left to right: 4) a small round wooden powder keg with iron hoops and a lit sparking fuse on top; 5) a brass-framed hourglass with glowing turquoise sand trickling down; 6) a small wooden treasure chest with brass corners, the lid slightly open, warm golden light spilling out.

Style: polished hand-painted game item icons in the same look as warm storybook cartoon concept art for a browser top-down action game set in underground cellars and an old mine under a cozy seaside town: clean readable shapes, soft rounded forms, gentle painterly texture, moderately saturated warm colors (not neon, not oversaturated). World palette: dark warm stone, brass and old wood, warm amber lantern light, cool turquoise crystals as an accent, glossy violet blackcurrant jam of the Jam Baron's army. Light dark fantasy without excess: no blood, no gore, no skulls, no horror, not childish, not sci-fi, no neon.

Strictly: no text, no letters, no numbers, no runes that look like letters, no logos, no labels or captions under the icons, no frame around the sheet, no watermark, no signature.
no text, no letters, no logos.
```

### poi

```
Use your built-in image generation tool (image_gen) to generate exactly ONE image from the brief below. Do not draw it with code, scripts or SVG, do not edit other files. After generating, tell me the exact file path of the generated image. Brief:

Game UI icon sheet, landscape 3:2 (1536x1024), on a perfectly flat, uniform, pure white background filling the whole canvas edge to edge (no texture, no gradient, no shadows on the background, no vignette, nothing else on the background). Exactly 12 round icon medallions arranged in a strict grid of 4 columns and 3 rows, evenly spaced, all medallions exactly the same size (each about 80% of its grid cell), each centered in its cell, with clear white gaps between them; nothing touches the canvas edge or another medallion.

Every medallion has the same construction: a perfect flat-on circle (not tilted, no drop shadow); a rim about 6% of the diameter; an inner disc with a soft radial gradient, lighter in the center behind the object; ONE single bold object in the center, large (about 70% of the inner disc), drawn in a 3/4 view with a consistent dark warm-brown outline, simple chunky shapes and few small details so it stays readable at 48 pixels; strong light-dark contrast between the object and the disc. The lighting is the same on every medallion: warm key light from the upper left, soft shade on the lower right, a small specular highlight. Nothing sticks out beyond the rim.

Every medallion on this sheet has a cool slate-grey stone inner disc (#343C45 at the edge to #6B7682 in the center) with a dark iron rim with four small rivets.

Contents of the medallions:
First row, left to right: 1) a low carved stone altar with two lit candles and a softly glowing amber-gold abstract ornament on its front (no letters); 2) an iron brazier bowl on three legs with a burning orange fire and a few gold coins glinting in it; 3) an old dark wooden chest wrapped in heavy iron chains with a padlock, violet jam glow leaking out of the lid seam and dripping; 4) a mossy round stone basin full of glowing turquoise healing water with a tiny fountain.
Second row, left to right: 5) a tall old iron lamppost with a glowing amber lantern on top casting a round pool of warm light; 6) an old wooden mine cart with iron wheels on a short piece of rail, filled with rocks; 7) a stack of four wooden gunpowder barrels (three below, one on top) with fuses, one fuse sparking; 8) a big bouncy cream-colored mushroom with a wide springy cap, two curved bounce lines above it.
Third row, left to right: 9) a stone forge hearth with glowing orange coals and a leather bellows, an iron anvil in front of it; 10) a closed wooden treasure chest with brass fittings and a vertical beam of warm golden light rising from it (a dropped reward); 11) the menacing head of a big mossy green troll brute wearing a wooden barrel like a helmet with iron hoops, small tusks, glowing lilac eyes, violet jam splotches; 12) the head of a huge cave worm bursting out of a hole in the ground: armored brown stone-plated head, a round open maw ringed with blunt cream teeth, glowing violet jam bands between its segments.

Style: polished hand-painted game item icons in the same look as warm storybook cartoon concept art for a browser top-down action game set in underground cellars and an old mine under a cozy seaside town: clean readable shapes, soft rounded forms, gentle painterly texture, moderately saturated warm colors (not neon, not oversaturated). World palette: dark warm stone, brass and old wood, warm amber lantern light, cool turquoise crystals as an accent, glossy violet blackcurrant jam of the Jam Baron's army. Light dark fantasy without excess: no blood, no gore, no skulls, no horror, not childish, not sci-fi, no neon.

Strictly: no text, no letters, no numbers, no runes that look like letters, no logos, no labels or captions under the icons, no frame around the sheet, no watermark, no signature.
no text, no letters, no logos.
```

### mobs

```
Use your built-in image generation tool (image_gen) to generate exactly ONE image from the brief below. Do not draw it with code, scripts or SVG, do not edit other files. After generating, tell me the exact file path of the generated image. Brief:

Game UI icon sheet, landscape 3:2 (1536x1024), on a perfectly flat, uniform, pure white background filling the whole canvas edge to edge (no texture, no gradient, no shadows on the background, no vignette, nothing else on the background). Exactly 11 round icon medallions arranged in a strict grid of 4 columns and 3 rows, evenly spaced, all medallions exactly the same size (each about 80% of its grid cell), each centered in its cell, with clear white gaps between them; nothing touches the canvas edge or another medallion. The last cell (bottom right) stays completely empty white.

Every medallion has the same construction: a perfect flat-on circle (not tilted, no drop shadow); a rim about 6% of the diameter; an inner disc with a soft radial gradient, lighter in the center behind the object; ONE single bold object in the center, large (about 70% of the inner disc), drawn in a 3/4 view with a consistent dark warm-brown outline, simple chunky shapes and few small details so it stays readable at 48 pixels; strong light-dark contrast between the object and the disc. The lighting is the same on every medallion: warm key light from the upper left, soft shade on the lower right, a small specular highlight. Nothing sticks out beyond the rim.

Every medallion on this sheet has a warm sandy cave-floor stone inner disc (#6A4B33 at the edge to #B48C64 in the center) with a dark iron rim that has two small glossy violet jam drips running over it.

Contents of the medallions:
First row, left to right: 1) a cellar rat running: grey-brown fur, long pink tail, violet jam splotches on its back, glowing lilac eyes; 2) a cave bat with spread leathery brown-violet wings, small furry body, big ears, glowing lilac eyes, jam drips on the wings; 3) a jam slug: a plump glossy slug made of violet blackcurrant jam, two eye stalks with glowing lilac eye tips, cream-pink underside; 4) a tiny baby jam slug: a small round glossy violet jam droplet blob with two short eye stalks, cute.
Second row, left to right: 5) a mushroom man: a stout walking mushroom with a wide tan-brown cap covered with violet jam drips, cream stem body with stubby arms, glowing lilac eyes, grumpy; 6) a shield beetle seen from the front: chunky dark-shelled beetle holding a big riveted iron-grey shield plate, violet jam splotches, glowing lilac eyes; 7) a spitter toad: a plump olive-green toad with huge swollen glossy violet jam cheek sacs, glowing lilac eyes; 8) a jam larva: a small segmented pale grub with violet glowing segments, tiny mandibles, lilac eyes.
Third row, left to right: 9) the Cooper: head and shoulders of a big mossy green troll brute with a wooden barrel strapped on his back, small tusks, glowing lilac eyes, violet jam splotches; 10) the Mushroom Shaman: an old mushroom elder with a wide tan cap dripping violet jam, a long beard of pale mushroom gills, a dark purple robe and a gnarled staff with a glowing lilac crystal; 11) Old Jam, the giant cave worm boss: armored brown stone-plated head with a round maw ringed with cream teeth, glowing violet jam bands between body segments, rising out of the ground.

Style: polished hand-painted game item icons in the same look as warm storybook cartoon concept art for a browser top-down action game set in underground cellars and an old mine under a cozy seaside town: clean readable shapes, soft rounded forms, gentle painterly texture, moderately saturated warm colors (not neon, not oversaturated). World palette: dark warm stone, brass and old wood, warm amber lantern light, cool turquoise crystals as an accent, glossy violet blackcurrant jam of the Jam Baron's army. Light dark fantasy without excess: no blood, no gore, no skulls, no horror, not childish, not sci-fi, no neon.

Strictly: no text, no letters, no numbers, no runes that look like letters, no logos, no labels or captions under the icons, no frame around the sheet, no watermark, no signature.
no text, no letters, no logos.
```

### ui

```
Use your built-in image generation tool (image_gen) to generate exactly ONE image from the brief below. Do not draw it with code, scripts or SVG, do not edit other files. After generating, tell me the exact file path of the generated image. Brief:

Game UI icon sheet, landscape 3:2 (1536x1024), on a perfectly flat, uniform, pure white background filling the whole canvas edge to edge (no texture, no gradient, no shadows on the background, no vignette, nothing else on the background). Exactly 12 round icon medallions arranged in a strict grid of 4 columns and 3 rows, evenly spaced, all medallions exactly the same size (each about 80% of its grid cell), each centered in its cell, with clear white gaps between them; nothing touches the canvas edge or another medallion.

Every medallion has the same construction: a perfect flat-on circle (not tilted, no drop shadow); a rim about 6% of the diameter; an inner disc with a soft radial gradient, lighter in the center behind the object; ONE single bold object in the center, large (about 70% of the inner disc), drawn in a 3/4 view with a consistent dark warm-brown outline, simple chunky shapes and few small details so it stays readable at 48 pixels; strong light-dark contrast between the object and the disc. The lighting is the same on every medallion: warm key light from the upper left, soft shade on the lower right, a small specular highlight. Nothing sticks out beyond the rim.

Every medallion on this sheet has a dark warm umber-brown inner disc (#2A201B at the edge to #5A463A in the center) with a thin brass rim.

Contents of the medallions:
First row, left to right: 1) two curved brass arrows chasing each other in a circle around a tumbling wooden die (dots only); 2) a blank parchment card torn in half with a bold dark-red cross mark slashed over it; 3) a small stack of shiny gold coins with blank embossed rims and a bright glint; 4) a radiant golden star with a bold upward chevron arrow above it and small sparkles.
Second row, left to right: 5) a squashed defeated violet jam blob with two little cross-shaped closed eyes and a jam splatter around it (cute, not gory); 6) a blacksmith hammer striking a glowing orange-hot metal bar, a burst of sparks; 7) a glossy deep red heart like a polished gemstone, warm highlight; 8) a clenched leather-gloved fist wreathed in orange-red flames.
Third row, left to right: 9) a brass pocket watch with a blank dial (only tick marks, no numbers) and quick swirling amber motion streaks; 10) a swirling gust of pale mint-white wind spirals with a small feather; 11) a swirling vortex of small turquoise experience crystals spiraling inward to the center; 12) a dark cave mouth with many small glowing lilac eyes peering out of the darkness (an incoming horde).

Style: polished hand-painted game item icons in the same look as warm storybook cartoon concept art for a browser top-down action game set in underground cellars and an old mine under a cozy seaside town: clean readable shapes, soft rounded forms, gentle painterly texture, moderately saturated warm colors (not neon, not oversaturated). World palette: dark warm stone, brass and old wood, warm amber lantern light, cool turquoise crystals as an accent, glossy violet blackcurrant jam of the Jam Baron's army. Light dark fantasy without excess: no blood, no gore, no skulls, no horror, not childish, not sci-fi, no neon.

Strictly: no text, no letters, no numbers, no runes that look like letters, no logos, no labels or captions under the icons, no frame around the sheet, no watermark, no signature.
no text, no letters, no logos.
```

### fix

```
Use your built-in image generation tool (image_gen) to generate exactly ONE image from the brief below. Do not draw it with code, scripts or SVG, do not edit other files. After generating, tell me the exact file path of the generated image. Brief:

Game UI icon sheet, landscape 3:2 (1536x1024), on a perfectly flat, uniform, pure white background filling the whole canvas edge to edge (no texture, no gradient, no shadows on the background, no vignette, nothing else on the background). Exactly 4 round icon medallions arranged in a strict grid of 2 columns and 2 rows, evenly spaced, all medallions exactly the same size (each about 80% of its grid cell), each centered in its cell, with clear white gaps between them; nothing touches the canvas edge or another medallion.

Every medallion has the same construction: a perfect flat-on circle (not tilted, no drop shadow); a rim about 6% of the diameter; an inner disc with a soft radial gradient, lighter in the center behind the object; ONE single bold object in the center, large (about 70% of the inner disc), drawn in a 3/4 view with a consistent dark warm-brown outline, simple chunky shapes and few small details so it stays readable at 48 pixels; strong light-dark contrast between the object and the disc. The lighting is the same on every medallion: warm key light from the upper left, soft shade on the lower right, a small specular highlight. Nothing sticks out beyond the rim.

Medallion colors: the rust-red medallions (2) have a deep warm rust-brick red-brown inner disc (dark #5A2819 at the edge to #9A4A2E in the center) with a polished brass rim; the dark umber medallions (1) have a dark warm umber-brown inner disc (#2A201B at the edge to #5A463A in the center) with a thin brass rim; the gold upgraded medallions (1) have a rich golden-amber inner disc glowing from the center with soft golden rays (#7A4E12 at the edge to #F0BE58 in the center) with an ornate polished GOLD rim decorated with small round studs (the upgraded legendary version).

Contents of the medallions:
First row, left to right: 1) [rust-red medallion] three BIG bright glowing golden fireflies (round glowing bodies with little wings, each large) circling along one thick glowing golden ring orbit, bright against the dark disc; 2) [rust-red medallion] one big sharp pale sandy-cream stone stalactite falling point-down with bold speed lines above it, a few rock chips and a dark round shadow under its tip, high contrast.
Second row, left to right: 3) [dark umber medallion] a horde coming: three pairs of big glowing lilac eyes peering out of a dark arched cave mouth framed by warm amber-lit stones; 4) [gold upgraded medallion] six big glowing golden fireflies on two concentric glowing rings (three on each ring), a small warm heart-shaped glow in the very center, simple and bold.

Style: polished hand-painted game item icons in the same look as warm storybook cartoon concept art for a browser top-down action game set in underground cellars and an old mine under a cozy seaside town: clean readable shapes, soft rounded forms, gentle painterly texture, moderately saturated warm colors (not neon, not oversaturated). World palette: dark warm stone, brass and old wood, warm amber lantern light, cool turquoise crystals as an accent, glossy violet blackcurrant jam of the Jam Baron's army. Light dark fantasy without excess: no blood, no gore, no skulls, no horror, not childish, not sci-fi, no neon.

Strictly: no text, no letters, no numbers, no runes that look like letters, no logos, no labels or captions under the icons, no frame around the sheet, no watermark, no signature.
no text, no letters, no logos.
```

### mobs-ref (не взят; к вызову приложен weapons.png через -i)

```
Use your built-in image generation tool (image_gen) to generate exactly ONE image from the brief below. Do not draw it with code, scripts or SVG, do not edit other files. After generating, tell me the exact file path of the generated image. The attached image is an already approved sheet from the same icon set: use it ONLY as a style reference (the same medallion construction, rim thickness, outline weight, lighting direction, painting style and level of detail) and generate a NEW image with the new contents below; do not copy its objects or its colors. Brief:

Game UI icon sheet, landscape 3:2 (1536x1024), on a perfectly flat, uniform, pure white background filling the whole canvas edge to edge (no texture, no gradient, no shadows on the background, no vignette, nothing else on the background). Exactly 11 round icon medallions arranged in a strict grid of 4 columns and 3 rows, evenly spaced, all medallions exactly the same size (each about 80% of its grid cell), each centered in its cell, with clear white gaps between them; nothing touches the canvas edge or another medallion. The last cell (bottom right) stays completely empty white.

Every medallion has the same construction: a perfect flat-on circle (not tilted, no drop shadow); a rim about 6% of the diameter; an inner disc with a soft radial gradient, lighter in the center behind the object; ONE single bold object in the center, large (about 70% of the inner disc), drawn in a 3/4 view with a consistent dark warm-brown outline, simple chunky shapes and few small details so it stays readable at 48 pixels; strong light-dark contrast between the object and the disc. The lighting is the same on every medallion: warm key light from the upper left, soft shade on the lower right, a small specular highlight. Nothing sticks out beyond the rim.

Every medallion on this sheet has a warm sandy cave-floor stone inner disc (#6A4B33 at the edge to #B48C64 in the center) with a dark iron rim that has two small glossy violet jam drips running over it.

Contents of the medallions:
First row, left to right: 1) a cellar rat running: grey-brown fur, long pink tail, violet jam splotches on its back, glowing lilac eyes; 2) a cave bat with spread leathery brown-violet wings, small furry body, big ears, glowing lilac eyes, jam drips on the wings; 3) a jam slug: a plump glossy slug made of violet blackcurrant jam, two eye stalks with glowing lilac eye tips, cream-pink underside; 4) a tiny baby jam slug: a small round glossy violet jam droplet blob with two short eye stalks, cute.
Second row, left to right: 5) a mushroom man: a stout walking mushroom with a wide tan-brown cap covered with violet jam drips, cream stem body with stubby arms, glowing lilac eyes, grumpy; 6) a shield beetle seen from the front: chunky dark-shelled beetle holding a big riveted iron-grey shield plate, violet jam splotches, glowing lilac eyes; 7) a spitter toad: a plump olive-green toad with huge swollen glossy violet jam cheek sacs, glowing lilac eyes; 8) a jam larva: a small segmented pale grub with violet glowing segments, tiny mandibles, lilac eyes.
Third row, left to right: 9) the Cooper: head and shoulders of a big mossy green troll brute with a wooden barrel strapped on his back, small tusks, glowing lilac eyes, violet jam splotches; 10) the Mushroom Shaman: an old mushroom elder with a wide tan cap dripping violet jam, a long beard of pale mushroom gills, a dark purple robe and a gnarled staff with a glowing lilac crystal; 11) Old Jam, the giant cave worm boss: armored brown stone-plated head with a round maw ringed with cream teeth, glowing violet jam bands between body segments, rising out of the ground.

Style: polished hand-painted game item icons in the same look as warm storybook cartoon concept art for a browser top-down action game set in underground cellars and an old mine under a cozy seaside town: clean readable shapes, soft rounded forms, gentle painterly texture, moderately saturated warm colors (not neon, not oversaturated). World palette: dark warm stone, brass and old wood, warm amber lantern light, cool turquoise crystals as an accent, glossy violet blackcurrant jam of the Jam Baron's army. Light dark fantasy without excess: no blood, no gore, no skulls, no horror, not childish, not sci-fi, no neon.

Strictly: no text, no letters, no numbers, no runes that look like letters, no logos, no labels or captions under the icons, no frame around the sheet, no watermark, no signature.
no text, no letters, no logos.
```

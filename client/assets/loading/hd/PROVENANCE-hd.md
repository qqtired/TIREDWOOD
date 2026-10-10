# Картинки загрузки и входа в HD (client/assets/loading/hd/)

Сделано 11 октября 2026 (группа «Вход в игру» страницы-обзора lab/ui). Старые файлы в `client/assets/loading/` не тронуты.

**Почему старые выглядели «шакально»:** картина 1280×720 сохранялась в WebP с качеством 0,15–0,35 (≈60 КБ). На мониторе 2560×1440
её растягивают в 2 раза — квадраты сжатия и замыленные края видны сразу. Желейки — 380 px высотой, на 2K их тянут ещё сильнее.

**Что сделано:** для всех 7 старых картин и 7 желеек найдены оригиналы Codex (`~/.codex/generated_images`, 4 октября 2026,
1536×1024 и 1254×1254 PNG) — перерисовывать ничего не пришлось. Плюс оригинал картины острова «Последний свет» (найден по SHA-256
из `lab/fishing-review/img/ISLAND-PROVENANCE.json`). Новые картины нарисованы Codex CLI (`codex exec`, встроенный `image_gen`),
по одной на вызов, до трёх одновременно.

**Обработка** (только node + headless Chrome, canvas; `createImageBitmap` с `resizeQuality: high`):
- картина: вырез 16:9 на всю ширину оригинала — **1536×864** (без уменьшения), WebP **0,82** (ферма 0,78 — укладываемся в 350 КБ);
  смещение выреза у старых картин подобрано автоматически по старому файлу (совпадение по яркости 160×90), чтобы кадр был тот же;
- желейка: альфа ≤6 → 0, ≥248 → 255, обрезка по непрозрачному с полем 2 %, высота **640 px**, WebP **0,85**;
- обложка первого входа: тот же вырез, WebP 0,88 c ограничением ≤200 КБ, плюс крошечная заглушка 48×27 (`cover-lqip.txt`, data URL
  1,4 КБ) — её можно вставить прямо в инлайн-CSS `index.html`, чтобы картинка «проявлялась» сразу, ещё до загрузки файла.
- Оригинал Codex — не больше 1536 px в ширину; на 2560×1440 браузер растянет его в 1,67 раза (а не в 2 раза из 1280), и главное —
  без артефактов сжатия. Сравнение крупным планом: `lab/ui/img/entry/zoom-*-old.webp` / `-new.webp`.

## Файлы

| Файл | Размер | КБ | Источник (`~/.codex/generated_images/…`) | Вырез y |
|---|---|---|---|---|
| lobby.webp | 1536×864 | 286.0 | 01a1068f-98ce-7080-a903-8d6f10d46558/exec-13d0bf3a-e8ca-44e3-8874-3d99930499b0.png | 80 |
| paintball.webp | 1536×864 | 271.7 | 01a1068f-98ce-72d0-bfd3-241cbd1c5f4d/exec-01e9eded-a963-47e9-8198-9e36cab635a2.png | 80 |
| race.webp | 1536×864 | 215.9 | 01a1068a-8320-7a21-aa5f-e85ee53e6043/exec-513d4c86-a741-4a6b-9b2b-aed67b6d8faa.png | 80 |
| fort.webp | 1536×864 | 192.3 | 01a1076b-39ae-7d72-993d-b3d6a1bcf32b/exec-53650ac2-183c-471f-adb2-0a5bd5068415.png (перекраска флагов в красно-белые) | 72 |
| fight.webp | 1536×864 | 192.5 | 01a10694-e381-7363-a492-879bd97ba368/exec-4375eec6-e043-4464-bd59-56039aff3ebf.png | 80 |
| skill.webp | 1536×864 | 235.7 | 01a10694-7e27-7b33-ab5f-b44ebeb9dc7b/exec-afaeebbc-1ede-45c0-be27-b41619748fa5.png | 32 |
| hide.webp | 1536×864 | 286.6 | 01a10695-6c5d-7191-a0f6-937d4f376616/exec-72c52cd4-d948-4bce-a832-9ded66840fc4.png | 80 |
| isle.webp | 1536×864 | 105.4 | 01a1269b-13c7-7802-a949-06ba78592d42/exec-3cf9dd5f-9834-4680-853e-9587e63ab22f.png (остров, = client/assets/isle/loading.webp) | 24 |
| race-jelly.webp | 623×640 | 55.2 | 01a1068a-830b-7bc2-9bee-c8fed75e631f/exec-b7ae0bc7-e8bd-4479-ad73-6ffb4e23a9c4.png | — |
| lobby-jelly.webp | 612×640 | 44.9 | 01a10699-53ae-7722-85e7-432d8fa3fe59/exec-96852364-c092-4668-ad29-5561881d2dc4.png | — |
| fort-jelly.webp | 658×640 | 62.7 | 01a10699-a338-7ef2-84f4-1c8d50a7896a/exec-022dc3cd-6674-4886-950b-7b6fca3e7333.png | — |
| paintball-jelly.webp | 577×640 | 50.1 | 01a1069a-0096-7e11-9e62-f7b16c233967/exec-4c0e8570-58d3-4a0d-a6d1-a2666b7e878e.png | — |
| skill-jelly.webp | 500×640 | 42.1 | 01a1069e-14d2-72c0-ab20-44993eb9053d/exec-c10c5452-91a1-42aa-8698-01768b2345b4.png | — |
| fight-jelly.webp | 654×640 | 43.9 | 01a1069e-298b-7521-9fe6-a891de0f7f1b/exec-949d0ad9-f845-4a38-81e0-082f0ddb036c.png | — |
| hide-jelly.webp | 483×640 | 59.9 | 01a1069e-2b89-75a2-b5e8-5739bd865f7a/exec-a4ad3cba-e2a2-440e-940f-60448013a5e9.png | — |
| hero-left.webp **новая** | 1536×864 | 290.3 | 01a127e9-894b-7942-b3fe-1b8a3b9fc535/exec-a74c263c-6dfc-4806-8007-0befae01a3fb.png | 80 |
| hero-center.webp **новая** | 1536×864 | 233.7 | 01a127e9-8994-7572-858d-5612d2ae22d7/exec-3dc571ab-3c44-4dc6-8b21-0b12cc0f05c3.png | 80 |
| cover.webp **новая** | 1536×864 | 191.7 | 01a127e9-88c4-7162-a3ad-bef29cabab6c/exec-944dc110-8c43-40da-afb1-f37167dc0a55.png | 80 |
| farm.webp **новая** | 1536×864 | 308.9 | 01a127eb-08bb-7e91-ab10-3aed968814c0/exec-7611b5d9-f292-429c-b38d-c23b72981955.png | 56 |
| dungeon.webp **новая** | 1536×864 | 229.1 | 01a127eb-2b15-7bd2-8625-29395fa1bc47/exec-bb585d34-aa96-4ba6-b478-b3ccd3790069.png | 64 |
| farm-jelly.webp **новая** | 671×640 | 85.5 | 01a127eb-4c17-70c2-887a-4cf2970bca25/exec-23b27369-6b16-468b-94e2-c63bedb0f9c2.png | — |
| dungeon-jelly.webp **новая** | 631×640 | 62.7 | 01a127ec-7d3c-74a3-9caf-81e7aab26ca7/exec-856feb3e-200f-4a57-af0d-0dfaa4e4b524.png | — |
| cover-lqip.txt | 48×27 | 1.4 | из cover | 80 |

Назначение новых: `hero-left` — экран входа, карточка слева (левая треть — спокойное море); `hero-center` — экран входа, карточка
по центру (дома слева, парк аттракционов справа, середина — бухта и маяк); `cover` — самая первая загрузка мира (вид на городок с моря,
середина свободна под марку и полосу); `farm`/`farm-jelly` и `dungeon`/`dungeon-jelly` — экраны загрузки «Ферма» и «Подземелье»
(сейчас у них нет картины, только цветное небо). Новые картины — в направлении новой набережной: светлая штукатурка, терракота,
зелёные ставни, полосатые маркизы, кипарисы, павильоны и карусель с лампочками.

Fight Club удаляется из игры — `fight*.webp` можно не переносить. Замечание: в старых картинах «Картинг» и «Крепость» над воротами /
стартом есть разноцветные гирлянды-вымпелы, среди них синие и жёлтые вперемешку с красными и зелёными (флаги крепости уже
перекрашены 4.10); если нужно — перекрасить правкой той же картинки через Codex.

## Промпты новых картин (как отправлены в `codex exec`)

Обёртка: «Use your built-in image generation tool (image_gen) to generate ONE image, landscape 1536x1024 (желейки: on a genuinely
transparent background (transparent_background true), square 1024x1024). Do not write code to draw it and do not edit any other files.
… Then copy the generated image file, completely unchanged …, into the current working directory as <id>.png.»
Общий стиль — из `../PROVENANCE.md`; у картин входа свет заменён на «тёплое золотое послеполуденное солнце», добавлен облик
южного городка + ретро-парка и запрет сине-жёлтого.

### hero-left

```
Scene: the hero key art of the game, used behind the login screen: the sunny seaside embankment promenade of the town at golden afternoon, seen from a slightly raised viewpoint on the promenade looking along the coast.

Right two-thirds of the picture: the lively promenade — light plaster houses with terracotta roofs, green shutters and striped awnings, cafe tables under umbrellas, tall cypresses, a retro amusement park pavilion and a carousel whose scalloped roofs are edged with rows of round warm light bulbs that are just starting to glow, a small Ferris wheel behind the houses, a red-and-white striped lighthouse at the end of a long wooden pier, a turquoise bay with a few small colorful boats and an old wooden fishing boat. Jelly characters on the promenade: one in front waving hello at the viewer, one licking an ice cream cone, two riding carousel horses, one in a straw sun hat carrying a fishing rod, a few more strolling further away; seagulls in the sky.

Left third of the picture: deliberately calm and simple — open turquoise sea fading into a soft warm sky, gentle low-detail water with soft sparkles, at most one or two tiny distant sailboats; no characters and no busy detail there, because a login card will be placed over the left third.

Style: polished hand-painted cartoon key art for a cozy multiplayer browser party game (warm storybook painting with clean readable shapes, soft brushwork, gentle painterly texture, rich but natural saturated colors).

Warm golden late-afternoon summer sunlight (about two hours before sunset) with long soft warm shadows, a clear sky going from soft blue at the top to warm peach and honey near the horizon, a few clean fluffy clouds lit gold. Still bright, friendly and sunny, not dusk, not night.

Grounded everyday setting: a small sunny southern seaside resort town on the Black Sea coast: light plaster houses in cream, peach and pale pink with terracotta tile roofs, green wooden shutters and small balconies with flowers, striped canvas awnings (red-and-white, green-and-white, terracotta-and-cream), tall dark-green cypress trees, green hills. On the promenade a retro amusement park: small round pavilions and a carousel with scalloped roofs edged with rows of round warm light bulbs, a small Ferris wheel. Not sci-fi, no neon, no fantasy magic glow, no darkness, no gore.

Characters: cute glossy "jelly" people — soft rounded jelly-bean / gummy-candy bodies (like a plump capsule, slightly wider at the bottom), a subtle translucent jelly sheen with a bright specular highlight, two small dark oval eyes with white catchlights, a tiny happy mouth, rosy cheeks, two small mitten-like hands, no legs, no nose. Candy colors: raspberry red, blueberry blue, tangerine orange, mint green, lemon yellow, grape purple, bubblegum pink. Friendly, funny, expressive.

Composition: very wide cinematic 16:9 landscape (the top and bottom ~8% may be cropped). Clear depth: promenade in the foreground right, town in the middle, sea and hills behind. Strong readable silhouettes, inviting, the feeling of arriving at your favorite summer town with friends.

Strictly: no text, no letters, no numbers, no words, no signs with writing, no logos, no user interface, no frame, no border, no watermark, no signature. No blue-and-yellow color combinations on any flag, pennant, bunting, awning or boat.
```

### hero-center

```
Scene: the hero key art of the game, used behind the login screen: a seaside resort town embankment at golden afternoon, framed like a theatre stage around a calm center.

Left side of the picture: light plaster houses with terracotta roofs, green shutters, flower balconies and striped awnings, tall cypresses, a cafe with umbrellas; jelly characters there — one waving, one with an ice cream cone. Right side of the picture: a retro amusement park on the promenade — a carousel and round pavilions with scalloped roofs edged with rows of round warm light bulbs just starting to glow, a small Ferris wheel, strings of little lights; jelly characters riding the carousel and one holding a bunch of balloons. Along the bottom edge: the warm stone promenade with a railing and a few jellies sitting on the railing looking at the sea, kept small and to the sides.

Center of the picture: deliberately calm and open — the turquoise bay with a red-and-white striped lighthouse far away on a long wooden pier, a few tiny sailboats, soft golden sky with a couple of fluffy clouds; low detail and soft values there, because a centered login card and the game logo will be placed over the middle.

Style: polished hand-painted cartoon key art for a cozy multiplayer browser party game (warm storybook painting with clean readable shapes, soft brushwork, gentle painterly texture, rich but natural saturated colors).

Warm golden late-afternoon summer sunlight (about two hours before sunset) with long soft warm shadows, a clear sky going from soft blue at the top to warm peach and honey near the horizon, a few clean fluffy clouds lit gold. Still bright, friendly and sunny, not dusk, not night.

Grounded everyday setting: a small sunny southern seaside resort town on the Black Sea coast: light plaster houses in cream, peach and pale pink with terracotta tile roofs, green wooden shutters and small balconies with flowers, striped canvas awnings (red-and-white, green-and-white, terracotta-and-cream), tall dark-green cypress trees, green hills. On the promenade a retro amusement park: small round pavilions and a carousel with scalloped roofs edged with rows of round warm light bulbs, a small Ferris wheel. Not sci-fi, no neon, no fantasy magic glow, no darkness, no gore.

Characters: cute glossy "jelly" people — soft rounded jelly-bean / gummy-candy bodies (like a plump capsule, slightly wider at the bottom), a subtle translucent jelly sheen with a bright specular highlight, two small dark oval eyes with white catchlights, a tiny happy mouth, rosy cheeks, two small mitten-like hands, no legs, no nose. Candy colors: raspberry red, blueberry blue, tangerine orange, mint green, lemon yellow, grape purple, bubblegum pink. Friendly, funny, expressive.

Composition: very wide cinematic 16:9 landscape (the top and bottom ~8% may be cropped), symmetrical-ish framing: busy left and right edges, calm open middle. Inviting, warm, the feeling of a summer evening about to start.

Strictly: no text, no letters, no numbers, no words, no signs with writing, no logos, no user interface, no frame, no border, no watermark, no signature. No blue-and-yellow color combinations on any flag, pennant, bunting, awning or boat.
```

### cover

```
Scene: a calm establishing view of the seaside resort town seen from the water at golden afternoon: across a wide calm turquoise bay, the whole town sits on the shore — the embankment promenade with light plaster houses, terracotta roofs, green shutters and striped awnings, tall cypresses, a small Ferris wheel and carousel pavilions edged with tiny warm light bulbs, a red-and-white striped lighthouse at the end of a long wooden pier, green hills behind. In the lower-left foreground a small wooden rowboat with two tiny jelly characters (one tangerine orange, one raspberry red) waving toward the town; a couple of seagulls.

Very simple and soft: large smooth areas of sky and water, low detail, soft gradients, gentle painterly texture, no clutter. The center of the picture (sky and water above the town) is calm and open because the game logo and a loading bar will be placed in the middle.

Style: polished hand-painted cartoon key art for a cozy multiplayer browser party game (warm storybook painting with clean readable shapes, soft brushwork, gentle painterly texture, rich but natural saturated colors).

Warm golden late-afternoon summer sunlight (about two hours before sunset) with long soft warm shadows, a clear sky going from soft blue at the top to warm peach and honey near the horizon, a few clean fluffy clouds lit gold. Still bright, friendly and sunny, not dusk, not night.

Grounded everyday setting: a small sunny southern seaside resort town on the Black Sea coast: light plaster houses in cream, peach and pale pink with terracotta tile roofs, green wooden shutters and small balconies with flowers, striped canvas awnings (red-and-white, green-and-white, terracotta-and-cream), tall dark-green cypress trees, green hills. On the promenade a retro amusement park: small round pavilions and a carousel with scalloped roofs edged with rows of round warm light bulbs, a small Ferris wheel. Not sci-fi, no neon, no fantasy magic glow, no darkness, no gore.

Characters: cute glossy "jelly" people — soft rounded jelly-bean / gummy-candy bodies (like a plump capsule, slightly wider at the bottom), a subtle translucent jelly sheen with a bright specular highlight, two small dark oval eyes with white catchlights, a tiny happy mouth, rosy cheeks, two small mitten-like hands, no legs, no nose. Candy colors: raspberry red, blueberry blue, tangerine orange, mint green, lemon yellow, grape purple, bubblegum pink. Friendly, funny, expressive.

Composition: wide cinematic 16:9 landscape (the top and bottom ~8% may be cropped); the town is a band across the lower-middle of the frame, big calm sky above, calm water below.

Strictly: no text, no letters, no numbers, no words, no signs with writing, no logos, no user interface, no frame, no border, no watermark, no signature. No blue-and-yellow color combinations on any flag, pennant, bunting, awning or boat.
```

### farm

```
Scene: a sunny little farm on a green hill just outside the seaside town, by the sea. Neat rows of vegetable beds with dark soil (carrots, cabbages, radishes, tomatoes on stakes, pumpkins), a row of tall bright sunflowers, a stone well with a small wooden roof and a bucket on a rope, wooden water troughs, a low wooden fence with a gate, a small cozy barn with a terracotta roof, a cheerful little delivery van parked by the road, a huge old gnarled tree on the hill. The turquoise sea, a lighthouse and the terracotta roofs of the town are in the distance. Jelly characters farming: one waters the beds with a big watering can, one pulls a giant carrot out of the ground with both mittens, one carries a basket full of tomatoes, one in a straw hat rides on a wheelbarrow pushed by another; butterflies, a seagull. Joyful, generous, abundant summer harvest mood.

Style: polished hand-painted cartoon key art for a cozy multiplayer browser party game (warm storybook painting with clean readable shapes, soft brushwork, gentle painterly texture, rich but natural saturated colors).

Bright cheerful midday summer sunlight with soft warm shadows, clear blue sky with a few clean fluffy white cumulus clouds.

Grounded everyday setting: countryside just outside a small sunny seaside resort town on the Black Sea coast with terracotta roofs, green hills and cypress trees. Not sci-fi, no neon, no fantasy magic glow, no darkness, no gore.

Characters: cute glossy "jelly" people — soft rounded jelly-bean / gummy-candy bodies (like a plump capsule, slightly wider at the bottom), a subtle translucent jelly sheen with a bright specular highlight, two small dark oval eyes with white catchlights, a tiny happy mouth, rosy cheeks, two small mitten-like hands, no legs, no nose. Candy colors: raspberry red, blueberry blue, tangerine orange, mint green, lemon yellow, grape purple, bubblegum pink. Friendly, funny, expressive.

Composition: wide cinematic 16:9 landscape illustration (the top and bottom ~8% may be cropped). The main subject is in the center and upper-middle of the frame; keep the bottom-left corner and the bottom-right corner relatively calm and simple (ground, water or grass, low detail) because game interface text will be placed over them. Leave some sky at the top.

Strictly: no text, no letters, no numbers, no words, no signs with writing, no logos, no user interface, no frame, no border, no watermark, no signature. No blue-and-yellow color combinations on any flag, pennant, bunting, awning or boat.
```

### dungeon

```
Scene (underground, so there is no sky; warm daylight falls in only through a round grate high in the ceiling): a cozy funny cellar cave under the seaside town, half old mine, half jam storeroom. Stone arches and wooden mine supports, little mine-cart rails with a wooden cart full of jam jars, wooden shelves and barrels packed with glass jars of glowing-colored jam (apricot, cherry, plum) catching the lantern light, big funny spotted mushrooms growing between the stones, a cozy brick forge with a warm fire in the background, hanging oil lanterns casting round pools of warm golden light, a few warm fireflies. In the center a brave little jelly hero in a miner's helmet holds up a big forged iron-and-brass lantern; around it silly harmless cave critters peek out — a fat round rat with a jam-smeared nose, a goofy slug, a tiny mushroom-man with a big cap — all clumsy and cute, not scary. Warm, adventurous and funny, like a storybook treasure cellar.

Style: polished hand-painted cartoon key art for a cozy multiplayer browser party game (warm storybook painting with clean readable shapes, soft brushwork, gentle painterly texture, rich but natural saturated colors).

Warm golden lantern light with soft warm shadows and a shaft of daylight from the grate; rich warm browns, honey, terracotta and jam colors with a few cool stone greys; never dark or gloomy. No fantasy magic glow, no gore, nothing creepy.

Characters: cute glossy "jelly" people — soft rounded jelly-bean / gummy-candy bodies (like a plump capsule, slightly wider at the bottom), a subtle translucent jelly sheen with a bright specular highlight, two small dark oval eyes with white catchlights, a tiny happy mouth, rosy cheeks, two small mitten-like hands, no legs, no nose. Candy colors: raspberry red, blueberry blue, tangerine orange, mint green, lemon yellow, grape purple, bubblegum pink. Friendly, funny, expressive.

Composition: wide cinematic 16:9 landscape illustration (the top and bottom ~8% may be cropped). The main subject is in the center and upper-middle of the frame; keep the bottom-left corner and the bottom-right corner relatively calm and simple (stone floor, low detail) because game interface text will be placed over them.

Strictly: no text, no letters, no numbers, no words, no signs with writing, no logos, no user interface, no frame, no border, no watermark, no signature. No blue-and-yellow color combinations on any flag, pennant, bunting, awning or boat.
```

### farm-jelly

```
Asset: a single game mascot character sprite, isolated on a genuinely transparent background.
Character: one cute glossy jelly character: plump soft rounded jelly-bean / gummy-candy body slightly wider at the bottom, translucent jelly sheen with a bright specular highlight, two small dark oval eyes with white catchlights, a happy smile, rosy cheeks, two small mitten-like hands, no legs, no nose.
Color and outfit: mint green; it wears a wide straw farmer hat with a sunflower tucked into the band and small denim overalls straps, holds a big green watering can in one mitten (a few water drops falling from the spout) and a bunch of fresh carrots with leafy tops in the other, cheerful proud smile. Slight three-quarter view facing left.
Rendering: polished hand-painted cartoon style matching cozy storybook game art, soft warm sunlight from the upper left, clean silhouette with a soft painted edge.
Framing: full body visible, centered, the character fills about 85 percent of the canvas height, small transparent margins. Nothing else: no ground, no cast shadow, no background, no text, no frame.
```

### dungeon-jelly

```
Asset: a single game mascot character sprite, isolated on a genuinely transparent background.
Character: one cute glossy jelly character: plump soft rounded jelly-bean / gummy-candy body slightly wider at the bottom, translucent jelly sheen with a bright specular highlight, two small dark oval eyes with white catchlights, a happy smile, rosy cheeks, two small mitten-like hands, no legs, no nose.
Color and outfit: bubblegum pink; it wears a slightly too big old brass miner's helmet with a small candle holder on the front, and holds up a big forged lantern of dark iron and polished brass with rivets (warm flame inside) in one mitten, a small jar of cherry jam tucked under the other arm, brave excited grin. Slight three-quarter view facing left.
Rendering: polished hand-painted cartoon style matching cozy storybook game art, soft warm sunlight from the upper left, clean silhouette with a soft painted edge.
Framing: full body visible, centered, the character fills about 85 percent of the canvas height, small transparent margins. Nothing else: no ground, no cast shadow, no background, no text, no frame.
```

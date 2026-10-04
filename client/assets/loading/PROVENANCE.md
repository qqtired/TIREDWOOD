# Картинки экрана загрузки (client/ui/transition*.ts)

Нарисованы 4 октября 2026 через Codex CLI (встроенный image_gen), по одной картинке на вызов, без правок чужих файлов и без рисования кодом.
Картина режима — 1536×1024, желейка-ведущая — 1024×1024 с прозрачным фоном.

Обработка (headless Chrome, canvas, `createImageBitmap` с `resizeQuality: high`):
- картина: вырез 16:9 по высоте (у «Выше облаков» — ближе к верху, чтобы не срезать колокол), 1280×720, WebP с качеством 0,15–0,35 — до ~62 КБ;
- желейка: обрезка по непрозрачному с полем 2 %, высота 380 px, альфа ≤6 → 0 и ≥248 → 255, WebP 0,75.

Новую картинку — тем же общим стилем (ниже) и своим описанием сцены; без надписей: генератор пишет кириллицу с ошибками.

## Общий стиль (добавлялся к каждой картине; к желейкам — как описание внешности)

```
Style: polished hand-painted cartoon key art for a cozy multiplayer browser party game (warm storybook painting with clean readable shapes, soft brushwork, gentle painterly texture, rich but natural saturated colors). Bright cheerful midday summer sunlight with soft warm shadows, clear blue sky with a few clean fluffy white cumulus clouds. Grounded everyday setting: a small sunny seaside resort town on the Black Sea coast with pastel houses, terracotta roofs, green hills, cypress trees. Not sci-fi, no neon, no fantasy magic glow, no darkness, no gore.
Characters: cute glossy "jelly" people — soft rounded jelly-bean / gummy-candy bodies (like a plump capsule, slightly wider at the bottom), a subtle translucent jelly sheen with a bright specular highlight, two small dark oval eyes with white catchlights, a tiny happy mouth, rosy cheeks, two small mitten-like hands, no legs, no nose. Candy colors: raspberry red, blueberry blue, tangerine orange, mint green, lemon yellow, grape purple, bubblegum pink. Friendly, funny, expressive.
Composition: wide cinematic 16:9 landscape illustration. The main subject is in the center and upper-middle of the frame; keep the bottom-left corner and the bottom-right corner relatively calm and simple (ground, water or grass, low detail) because game interface text will be placed over them. Leave some sky at the top.
Strictly: no text, no letters, no numbers, no words, no signs with writing, no logos, no user interface, no frame, no border, no watermark, no signature.
```

## Картины и желейки

| Режим | Картина | Желейка |
|---|---|---|
| Набережная (возврат; в бухте — регата) | `lobby.webp`, 61.0 КБ | `lobby-jelly.webp`, 14.7 КБ |
| Пейнтбол | `paintball.webp`, 56.5 КБ | `paintball-jelly.webp`, 17.1 КБ |
| Картинг | `race.webp`, 58.6 КБ | `race-jelly.webp`, 18.9 КБ |
| Крепость | `fort.webp`, 62.9 КБ | `fort-jelly.webp`, 19.8 КБ |
| Fight Club | `fight.webp`, 59.2 КБ | `fight-jelly.webp`, 14.8 КБ |
| «Выше облаков» | `skill.webp`, 56.8 КБ | `skill-jelly.webp`, 14.7 КБ |
| Прятки «Рыбный двор» | `hide.webp`, 60.9 КБ | `hide-jelly.webp`, 17.9 КБ |

### Описания сцен

**lobby.webp** — Scene: the sunny seaside embankment promenade of the town, the heart of the game world. A wide tiled plaza with a big compass-rose mosaic in the pavement, Mediterranean trees in planters, cafe umbrellas, strings of little lights, a red-and-white striped lighthouse at the end of a long wooden pier, a small Ferris wheel, and in the turquoise bay colorful little motorboats racing between bright orange buoys (a harbor regatta) next to an old wooden fishing boat moored at the pier; seagulls in the sky. Jelly characters on the plaza: one waving hello, one eating an ice cream cone, two dancing together, one in a sun hat. Inviting and warm, the feeling of coming home on a summer afternoon.

**paintball.webp** — Scene: a friendly paintball match in a sunny port warehouse yard. Red brick warehouses, stacked wooden crates and colorful shipping containers used as cover, a red harbor crane, walls and crates splattered with big juicy blue and orange paint splats. Two teams of jelly characters, a blueberry-blue team and a tangerine-orange team, wearing paintball goggles and holding chunky toy paint markers, ducking behind crates and popping out; paint balls fly in arcs and burst into splashes; one jelly laughs with an orange paint splat on its belly. Playful and harmless: no blood, no realistic weapons.

**race.webp** — Scene: a go-kart race on a sunny seaside go-kart track inside an old harbor. A winding asphalt track with red-and-white striped curbs, colorful stacks of old tires as barriers, a checkered start gantry with colorful bunting flags, a couple of red harbor cranes and stacked shipping containers in the background, the turquoise sea and a small lighthouse on the horizon. A small grandstand full of cheering jelly spectators waving. In the center, three jelly characters in round racing helmets drive small colorful go-karts drifting around a curve toward the viewer, little dust puffs and tire smoke behind them, motion and fun.

**fort.webp** — Scene: a cozy cartoon stone castle (a small fortress) on a grassy seaside hill on a bright summer day, with colorful banners, bunting and a big wooden gate. Jelly defenders stand on the battlements with toy crossbows and paint markers, cheering; a large glowing green crystal stands on a pedestal in the castle courtyard; a goofy crowd of cute cartoon zombies (green-gray, silly, round, clumsy, slow, not scary at all) shambles up the dirt road toward the gate. The blue sea and the little town are in the distance.
Затем флаги и знамёна перекрашены из сине-жёлтых в красно-белые правкой этой же картинки через Codex image_gen («repaint all blue-and-yellow flags and banners into red and white, keep everything else the same»), WebP 0,30.

**fight.webp** — Scene (indoors, so the sky is visible only through a small high window): an underground fight club in a cozy brick basement under a seaside house. A small boxing ring with red ropes and a worn canvas floor in the center, warm hanging lamps casting round pools of golden light, sun rays slanting in through the small high window, old posters without any writing, a crowd of jelly spectators around the ring cheering and waving. Two jelly boxers in big red boxing gloves face each other in the ring in a fighting stance, one wears a white headband. Warm, playful and sporty, not grim, not dark, no blood.

**skill.webp** — Scene: an "above the clouds" sky obstacle course. A tall old red-brick fire watchtower (a Russian "kalancha" with a lookout gallery and a bell at the top) rises high above a sea of fluffy white clouds; wooden platforms, rope bridges, spinning wooden beams and small floating grassy islands climb up into a bright blue sky, with a few colorful hot-air balloons around. Jelly characters jump between the platforms, one floats with a bunch of balloons, small birds fly by. Sunny, airy, a strong sense of height and fun.

**hide.webp** — Scene: hide and seek in a fish market yard by the sea. A sunny cobblestone courtyard with wooden barrels, fish crates with ice and silver fish, tin buckets, benches and striped beach umbrellas, colorful old houses with laundry lines, a seagull sitting on a barrel, the sea behind. Jelly characters disguised as objects of the yard: one peeks out of a wooden barrel, one wears a bucket on its head pretending to be a bucket, one hides under a fish crate with only its eyes visible, while a seeker jelly in a detective cap tiptoes past holding a toy paint marker and looks the wrong way. Playful and funny.

### Желейки

Общее начало и конец описания:

```
Asset: a single game mascot character sprite, isolated on a genuinely transparent background.
Character: one cute glossy jelly character: plump soft rounded jelly-bean / gummy-candy body slightly wider at the bottom, translucent jelly sheen with a bright specular highlight, two small dark oval eyes with white catchlights, a happy smile, rosy cheeks, two small mitten-like hands, no legs, no nose.
Rendering: polished hand-painted cartoon style matching cozy storybook game art, soft warm sunlight from the upper left, clean silhouette with a soft painted edge.
Framing: full body visible, centered, the character fills about 85 percent of the canvas height, small transparent margins. Nothing else: no ground, no cast shadow, no background, no text, no frame.
```

Своё у каждой (строка «Color and outfit» или описание целиком у картинга):

- **lobby-jelly.webp** — lemon yellow; it wears a straw sun hat with a red ribbon, holds an ice cream cone in one mitten and waves hello with the other. Friendly welcoming pose, slight three-quarter view facing left.
- **paintball-jelly.webp** — blueberry blue; paintball goggles pushed up on its forehead, it holds a chunky toy paint marker (bright orange and black, obviously a toy) in both mittens, a splash of orange paint on its belly, confident grin. Slight three-quarter view facing left.
- **race-jelly.webp** — one cute glossy jelly character (see style) in tangerine orange: plump soft rounded jelly-bean / gummy-candy body slightly wider at the bottom, translucent jelly sheen with a bright specular highlight, two small dark oval eyes with white catchlights, a big happy open smile, rosy cheeks, two small mitten-like hands, no legs, no nose. It wears a shiny round racing helmet (white with a red stripe) pushed up on its head and racing goggles on the forehead, and proudly holds up a small black-and-white checkered flag in one mitten. Cheerful, energetic pose, slight three-quarter view facing left.
- **fort-jelly.webp** — mint green; it wears a slightly too big knight helmet with the visor up and a red plume, holds a small round wooden shield and a wooden toy sword, brave determined smile. Slight three-quarter view facing left.
- **fight-jelly.webp** — raspberry red; it wears big shiny red boxing gloves on its mitten hands and a white headband, playful boxing stance with one glove raised, confident wink. Slight three-quarter view facing left.
- **skill-jelly.webp** — sky blue; it wears a small brown leather aviator cap and floats upward holding a bunch of five colorful balloons (red, yellow, green, orange, purple) on strings in one mitten, joyful face, the balloons are fully visible above it. Slight three-quarter view facing left.
- **hide-jelly.webp** — grape purple; it sits inside an old wooden barrel with iron hoops and peeks out over the rim, only its upper half visible above the barrel, one mitten resting on the rim, mischievous smile. The whole barrel is visible. Slight three-quarter view facing left.

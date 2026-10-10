# Иконки режима «Ферма» (client/assets/farm/icons)

Нарисованы 10 октября 2026 через Codex CLI v0.153.4 (`codex exec`, встроенный `image_gen`, прозрачный фон), **одна иконка на вызов**, по три вызова одновременно, без рисования кодом и без правок руками. Ключей не запрашивали — у Codex своя авторизация.
Всего 36 иконок: 19 культур + 9 вторичных ресурсов + трюфель + 4 инструмента + 3 постройки. Сводка — `_sheet.png` (подписи наложены кодом, не генератором).

Список взят из `docs/farm/design-v10.md`. В задании было «19 продуктов», но перечислено 18: девятнадцатая культура — «Микро-зелень» (продукт «Ростки»), её тоже нарисовали (`microgreens`). «Зёрна» из задания — это «Семена» из таблицы вторичных ресурсов (`seeds`).

## Формат

- **256×256 PNG RGBA**, прозрачный фон (углы альфа 0). Как у иконок крепости (`client/assets/fort/*.webp`, 256×256); при подключении в игру их так же можно перекодировать в WebP с альфой (PNG тут ~60–125 КБ, всего ~3,4 МБ).
- Предмет обрезан по содержимому и вписан в 240×240 по центру (поле 8 px), поэтому мелкие предметы (семечки) и крупные (улей) занимают рамку одинаково.
- Оригиналы 1254×1254 в репозиторий не кладём; они лежат в библиотеке Codex (`~/.codex/generated_images/…`, имена — в таблице).

## Как вызывали

```
codex exec --skip-git-repo-check -s workspace-write -C <рабочая папка> --json "<обёртка>"
```

Обёртка (как у иконок крепости и рыб):

```
Use your built-in image generation tool (image_gen) to generate ONE image on a genuinely transparent background (transparent_background true), square 1024x1024. Do not write code to draw it and do not edit any other files. Subject: <описание предмета>.

<общий стиль>

Then copy the generated image file, completely unchanged (do not resize, convert, crop or otherwise edit it), into the current working directory as <id>.png.
```

(У трёх пробных — radish, crystal, watering-can — обёртка кончалась «save the generated image as <id>.png», и Codex сам сжал файл до 1024 px; поэтому для всех иконок мы берём исходник 1254×1254 из библиотеки Codex, а не копию.)

## Общий стиль (добавлялся к каждому вызову)

```
Style: a single bold game inventory icon for a cozy fairytale farming game set on a sunny seaside farm, polished hand-painted cartoon look in the same family as other chunky game item icons: clean readable shapes, soft painterly cel shading, a thin dark-brown outline, a gentle bright highlight, rich natural saturated colors, warm midday summer sunlight from the upper left with soft warm shadows. The object is shown large and centered in a pleasant three-quarter view, filling about 80 percent of the square 1024x1024 canvas with small even margins. Genuinely transparent background (real alpha channel): no ground, no cast shadow, no scenery, no checkerboard, no white box, no frame, no border. Cozy and grounded storybook mood: not sci-fi, no neon, no electric glow, no darkness. Strictly: no text, no letters, no numbers, no symbols, no logos, no watermark. Avoid any blue-and-yellow color combination.
```

Стиль сверен с готовыми иконками игры (крепость, лавка рыбака): та же рисованная «сказочная» манера, тёплое солнце слева сверху, тонкий тёмно-коричневый контур. Без надписей и цифр, без сине-жёлтого, без sci-fi и неона. Общий стиль после пробных не менялся; поправили только описание кристалла (см. ниже).

## Постобработка

Скрипт на node + sharp 0.34.5 (в `game-opus-farm` нет `node_modules`, sharp подгружен только на чтение из соседнего проекта `Prod/CarGPTvrs`): альфа ≤6 → 0 и ≥248 → 255 (как у экрана загрузки), обрезка по альфе >24, уменьшение Lanczos до 240 px по большей стороне, холст 256×256, PNG (compressionLevel 9).

## Иконки: id, что нарисовано (отличие промпта — строка «Subject»)

### Продукты (19 культур)

- **`radish.png`** — Редис. Subject: a single plump round radish with a bright pink-red glossy root, a pale white tapered tip with a few tiny rootlets, and a fresh tuft of green leaves on top.
  - пробная; взят без правок
  - исходник `exec-1153fbf1-1c1a-415c-9073-b60216dca96e.png` (1254x1254, sha256 9684af77bb0e…), в игре 96 КБ
- **`lettuce.png`** — Лист салата. Subject: a single large fresh crisp lettuce leaf, ruffled frilly edges, light lime-green at the edges deepening to rich green, a thick creamy-white midrib with fine pale veins, one tiny dewdrop on it.
  - исходник `exec-b4d3a011-07b2-44ef-b9be-a136e2579e98.png` (1254x1254, sha256 63fef1008b0b…), в игре 113 КБ
- **`wheat.png`** — Колос пшеницы. Subject: a single golden wheat ear (spike) with plump grains and long thin whiskers (awns), on a short stalk with two slim green leaves, tilted diagonally.
  - исходник `exec-3157faf4-4b37-4314-b643-81527a6df45d.png` (1254x1254, sha256 1a6daf405969…), в игре 65 КБ
- **`onion.png`** — Луковица. Subject: a single plump round onion bulb with shiny copper-gold papery skin and subtle lengthwise ridges, a small twisted dry tip on top with a short fresh green shoot, a few short white roots at the base.
  - исходник `exec-af8af24f-e0ad-4f9e-9604-592444039fde.png` (1254x1254, sha256 27af2801fb94…), в игре 82 КБ
- **`pumpkin.png`** — Тыква. Subject: a single plump orange pumpkin with deep rounded ribs, a thick curved woody green-brown stem, a small curly green tendril and one broad green leaf.
  - исходник `exec-13ccc3ee-a218-436d-a0a5-f4eacb9d6f45.png` (1254x1254, sha256 50b51d57b0ec…), в игре 115 КБ
- **`carrot.png`** — Морковь. Subject: a single big bright orange carrot with fine ring lines, tapering to a thin tip, with a lush bunch of feathery green leaves on top, slightly tilted.
  - исходник `exec-b064f313-f769-4af7-a346-74ca5c0acb39.png` (1254x1254, sha256 3d4269989164…), в игре 70 КБ
- **`sunflower-seeds.png`** — Семечки подсолнуха. Subject: a small heap of plump glossy black-and-white striped sunflower seeds (teardrop shaped), with two or three cracked open showing pale kernels, and one small golden-orange sunflower petal resting on top.
  - исходник `exec-97456159-c437-43b8-854c-64a5b3f167a6.png` (1254x1254, sha256 f4729bb55b6b…), в игре 103 КБ
- **`strawberry.png`** — Ягода клубники. Subject: a single big glossy ripe red strawberry with tiny golden seeds on its skin and a fresh green leafy calyx with a short stem on top.
  - исходник `exec-0e36d509-5ef6-4a1b-bebf-461daa803e68.png` (1254x1254, sha256 09d0f45ebadd…), в игре 103 КБ
- **`giant-mushroom.png`** — Шляпка гриба-гиганта. Subject: a single big domed mushroom cap in glossy chestnut-brown (porcini style), seen slightly from the side, with a creamy-beige spongy underside visible at the rim, resting on a short thick pale stem stub, a few tiny moss tufts at the bottom; it looks hefty and oversized.
  - исходник `exec-22d28b93-4e31-495d-be56-a52da373c29c.png` (1254x1254, sha256 138268564516…), в игре 113 КБ
- **`dill.png`** — Пучок укропа. Subject: a fresh bunch of dill: several stems with feathery bright green thread-like fronds and a couple of flat round flower umbels, tied with a piece of natural twine, tilted diagonally.
  - исходник `exec-2ec041a1-5ddd-4b17-b800-f957fe2df489.png` (1254x1254, sha256 5b10695d01d1…), в игре 124 КБ
- **`chili.png`** — Стручок перца чили. Subject: a single glossy red chili pepper pod, slightly curved with a tapering pointed tip, a fresh green cap and short curved green stem, bright highlight along its side.
  - исходник `exec-92de155f-9c8b-43ba-ad2f-150ffabdb744.png` (1254x1254, sha256 175b26c0c3b2…), в игре 57 КБ
- **`crystal.png`** — Кристалл (кристальный цветок). Subject: a single cluster of natural crystals growing like a flower: several translucent faceted crystal points of different heights in rich saturated rose-pink and fresh emerald-mint green, with a ring of petal-shaped crystal leaves around the base, bright sunlit glints on the facets like a precious gemstone, calm and natural, no glow rays, no neon.
  - пробная v1 вышла бледной (пастельные розовый и мятный) — перерисован с более насыщенными цветами (v2), он в игре. Описание v1: a single cluster of soft natural crystals growing like a flower: several translucent pastel rose-quartz and pale mint-green faceted crystal points of different heights with delicate leaf-like petals of crystal around the base, gentle soft light reflections, calm and natural like a precious gemstone, no glow rays
  - исходник `exec-99dd28ae-f67c-493a-b4a9-d95b177af41a.png` (1254x1254, sha256 ac7d06a4a56d…), в игре 123 КБ
- **`microgreens.png`** — Ростки (микро-зелень). Subject: a small tuft of microgreens sprouts: a dozen slender pale-green and white stems topped with tiny round paired seed leaves in fresh bright greens, growing from a small tidy patch of moist dark-brown soil.
  - исходник `exec-bab45d78-aca7-4e8f-8800-b93f7b7e8b1d.png` (1254x1254, sha256 27c171e06cbf…), в игре 112 КБ
- **`lotus.png`** — Лепесток лунного лотоса. Subject: a single large lotus flower petal, long and gracefully curved, pearly white fading to soft lilac-pink at the tip, delicate fine veins, a gentle pearly shimmer like moonlight, one dewdrop on it, soft and natural, not glowing.
  - исходник `exec-3f93989e-0a3d-438e-b577-615bb2934b40.png` (1254x1254, sha256 d43cc750a93d…), в игре 77 КБ
- **`life-fruit.png`** — Плод жизни (Древо жизни). Subject: a single plump round fruit, like a glossy fig crossed with an apple, skin gradient from jade green to warm coral-pink with a delicate pattern of fine golden veins, attached to a short woody twig with two fresh green leaves, a soft warm golden shimmer, natural and soft, not neon.
  - исходник `exec-cb1a76b8-c9f0-447d-a456-d59a275c243e.png` (1254x1254, sha256 1f70f7614e9a…), в игре 120 КБ
- **`golden-apple.png`** — Золотое яблоко. Subject: a single apple of shiny polished gold with warm reflections and bright sparkle highlights, a short brown stem and one fresh green leaf.
  - исходник `exec-7206df93-7100-46ed-9d19-e0fa94127079.png` (1254x1254, sha256 0d1aa0c59bcd…), в игре 104 КБ
- **`dragon-fruit.png`** — Драконий плод. Subject: a single dragon fruit (pitaya): a bright magenta-pink oval fruit with green-tipped scale-like fleshy bracts curling outward, with one small wedge cut out to show white flesh with tiny black seeds.
  - исходник `exec-76c05f22-bf11-443b-93c6-d9d646e1b844.png` (1254x1254, sha256 fa104897a539…), в игре 111 КБ
- **`star.png`** — Звезда (звёздный цветок). Subject: a single star-fruit shaped like a perfect, clearly readable five-pointed star seen from the front: a plump puffy star with five evenly spaced rounded points, smooth pearly cream-white skin blushing to soft pink at the tips, glowing gently from within with a soft warm peach-white light, a few tiny soft sparkles near it, a very small green stem leaf at the top notch between two points; the star silhouette must be instantly recognizable, soft and natural, not neon.
  - v1 — чистая звезда, но без свечения; v2 — свечение есть, форма «пухлая почка»; в игре v3 (чёткая звезда + мягкое свечение и искры)
  - прежний промпт v1: a single plump five-pointed star-shaped fruit with rounded soft points, smooth pearly cream-white skin blushing to soft pink at the tips, gently radiating a soft warm glow, with a small green leafy calyx at the top, soft and natural, not neon
  - исходник `exec-d926d984-3273-401e-9e2d-34cbae284b79.png` (1254x1254, sha256 16ded0e82947…), в игре 93 КБ
- **`myth-mushroom.png`** — Мифическая шляпка гриба. Subject: a single large rounded mushroom cap in a rich lilac-violet gradient fading to rose-pink at the rim, with creamy pearly spots, a faint pearly sheen and a few dewdrops, a creamy underside with fine gills visible at the rim, on a short pale thick stem stub, magical but soft and natural, not neon.
  - исходник `exec-2f2a10fc-9c14-42ed-98ed-ca1892d292f0.png` (1254x1254, sha256 4e8bec4bc427…), в игре 107 КБ

### Вторичные ресурсы (9)

- **`rootlet.png`** — Корешок. Subject: a small tidy bundle of thin pale tan and cream rootlets with fine hairy side roots, tied together with a short piece of natural twine, with a few crumbs of dark soil clinging to it.
  - исходник `exec-3eec8682-8ee2-4a7d-addc-0f53a797c76b.png` (1254x1254, sha256 50767a8968db…), в игре 88 КБ
- **`fiber.png`** — Волокно. Subject: a twisted hank (skein) of soft natural plant fibre like flax, pale straw-gold and cream with subtle green tint, loosely tied in the middle with a piece of twine, fine individual strands visible.
  - исходник `exec-c67e91e4-cfb8-4a9d-868f-dce13a33c339.png` (1254x1254, sha256 ce9e249d7881…), в игре 108 КБ
- **`seeds.png`** — Семена («зёрна»). Subject: a small open natural linen sack tied loosely with twine, spilling out a little pile of assorted plant seeds (flat tan pumpkin seeds, round brown seeds, tiny black seeds).
  - исходник `exec-e8aa2616-af79-45ef-bcb0-1ae4565c16ee.png` (1254x1254, sha256 3562260ded87…), в игре 105 КБ
- **`spores.png`** — Споры. Subject: a small round puffball mushroom in cream and tan, its top burst open and releasing a gentle puff of tiny round cream and soft-lilac spore dots into the air.
  - исходник `exec-032db4c9-c31f-4afc-ab73-c5152d94b8fe.png` (1254x1254, sha256 8af6b63ed461…), в игре 99 КБ
- **`crystal-dust.png`** — Кристаллическая пыль. Subject: a small heap of fine glittering crystal powder in pastel rose-pink and mint-green, with a few tiny crystal shards poking out and tiny sunlit sparkles.
  - исходник `exec-28ec4303-f713-4734-a3d2-f998ab6c249d.png` (1254x1254, sha256 10a8a8966dfa…), в игре 94 КБ
- **`wood.png`** — Древесина. Subject: a small neat stack of three short cut logs of warm honey-brown wood with visible growth rings on the cut ends, bark with a little moss, and one tiny green leaf sprouting from the top log.
  - исходник `exec-3ebe27c9-d4e0-4392-8725-1df0c6a7ae68.png` (1254x1254, sha256 a4c7f8c8f497…), в игре 111 КБ
- **`golden-leaf.png`** — Золотой лист. Subject: a single leaf of shiny polished gold, apple-tree leaf shape with a pointed tip and a short stem, fine engraved veins, warm sunlit reflections and a few small sparkle highlights.
  - исходник `exec-fdb1b719-fdca-46ff-8f28-f9c689e093e8.png` (1254x1254, sha256 d88454a15659…), в игре 104 КБ
- **`scale.png`** — Чешуйка. Subject: a single large flat dragon scale in the shape of a rounded shield / teardrop, like one big fish scale or an armour plate seen straight from the front, with fine concentric curved ridges radiating from its base, glossy polished enamel finish, deep magenta-red in the middle fading to rose-pink with a fresh green rim at the edge, pearly highlights; clearly one flat plate, not a flower bud or a pinecone.
  - v1 («шляпка-артишок» вместо чешуи) заменён: v2 — плоская пластина с концентрическими рёбрами
  - прежний промпт v1: a single large glossy dragon scale: rounded shield shape, rich magenta-pink to deep red gradient with a fresh green tip and pearly ridges, polished sheen
  - исходник `exec-c42ebbab-8798-44e1-926c-2b07cfafe974.png` (1254x1254, sha256 0ad22aafe9df…), в игре 99 КБ
- **`star-dust.png`** — Звёздная пыль. Subject: a small heap of fine shimmering dust in soft lilac, pearly cream and silver, with several tiny five-pointed star sparkles scattered on and around it, gentle and soft, not neon.
  - исходник `exec-0cc6cca7-9246-4c97-92ea-5551daa9de40.png` (1254x1254, sha256 2e6df0237730…), в игре 86 КБ

### Трюфель

- **`truffle.png`** — Трюфель. Subject: a single round knobbly dark-brown truffle with a rough bumpy textured surface and a few crumbs of soil, with one thin slice cut off beside it showing marbled cream veins inside.
  - исходник `exec-04b98bdb-1efb-4bce-88a8-e5fe9417a89a.png` (1254x1254, sha256 331c7895e0e6…), в игре 104 КБ

### Инструменты

- **`rake.png`** — Грабли. Subject: a garden leaf rake seen at about a 45-degree angle, the steel head with eight curved tines is large and prominent and fills about half of the picture, attached to a shorter warm-wood handle (about as long as the head is wide), a little fresh soil on the tines.
  - v1 (голова грабель крошечная на длинной ручке) заменён: v2 — крупная голова, короткая ручка
  - прежний промпт v1: a garden rake with a long smooth wooden handle and a steel head with eight curved tines, diagonal composition from lower-left to upper-right so the whole tool fits the square, small soil crumbs on the tines
  - исходник `exec-a37b2383-0efe-41d7-94e7-2badbd4a0160.png` (1254x1254, sha256 75ab72dab931…), в игре 69 КБ
- **`watering-can.png`** — Лейка. Subject: a classic garden watering can with a long spout and a round sprinkler rose head, mint-green enamel body with a cream rim and a wooden handle, a few tiny clear water droplets falling from the rose.
  - пробная; взят без правок
  - исходник `exec-4f06eac7-d4b2-4493-96d9-e8987dd06499.png` (1254x1254, sha256 e90d85e3f268…), в игре 94 КБ
- **`trowel.png`** — Лопатка. Subject: a small garden hand trowel with a pointed scoop-shaped steel blade and a rounded warm-brown wooden handle, a little fresh soil on the blade, tilted diagonally so the whole tool fits the square.
  - исходник `exec-157e1c7c-e0be-46e3-9716-77c22b5c9b5d.png` (1254x1254, sha256 01f709a8726e…), в игре 59 КБ
- **`bag.png`** — Сумка. Subject: a sturdy farmer's shoulder bag made of green canvas with brown leather straps and a brass buckle on the front flap, a carrot top and a few green leaves peeking out of the open flap.
  - исходник `exec-e9bafaa5-c6cd-4b76-ae5f-701a533b3fef.png` (1254x1254, sha256 b475881003ee…), в игре 116 КБ

### Постройки фермы

- **`compost.png`** — Компостная куча. Subject: a small cheerful heap of rich dark-brown crumbly compost with green leaves, an apple core, eggshell halves and vegetable peelings mixed in, and a tiny green seedling sprouting on top.
  - исходник `exec-79a18ded-10bc-4b63-a63f-f1c5f6aa7746.png` (1254x1254, sha256 3e00b7bf1062…), в игре 107 КБ
- **`truffle-pig.png`** — Трюфельный свин. Subject: a cute plump friendly pink pig with a big round snout, floppy ears, a curly tail, big shiny dark eyes with white catchlights, sniffing the ground with its nose down, three-quarter side view, a small brown truffle lying right in front of its snout.
  - исходник `exec-e8b4996f-d745-4961-b935-120c6e0b242b.png` (1254x1254, sha256 31767599d998…), в игре 86 КБ
- **`beehive.png`** — Улей с пчёлами. Subject: a classic beehive of stacked cream-white painted wooden boxes with a small red-brown gabled roof and a little entrance slot, a bit of golden honey dripping from the lower edge, and four or five cute small bees with tiny wings flying around it.
  - исходник `exec-3a40fbd1-08c1-4baa-9f6a-ac328e2f74a2.png` (1254x1254, sha256 d0bde71afdf4…), в игре 108 КБ

## Перегенерации

- `crystal`: v1 — бледные пастельные тона → v2 с насыщенными розовым и изумрудно-мятным (стиль игры — «сочные цвета»).
- `scale`: v1 читалась как бутон/артишок → v2 — плоская пластина-чешуя.
- `rake`: v1 — голова грабель слишком мелкая → v2 — крупная голова, короткая ручка.
- `star`: три варианта (v1 без свечения, v2 нечёткая форма, v3 выбран).
- Остальные 31 — с первого раза.

## Сводка

`_sheet.png` — все 36 иконок сеткой 4 × 9, id и тип подписаны сбоку (SVG-текст поверх, через sharp). Фон листа кремовый, чтобы был виден край иконок.

## Дополнение 10 октября 2026: иконки для интерфейса фермы (часть B2)

Владелец: «сгенерируй нормальные иконки и сделай блоки побольше, чтобы было понятно, что это лейка, сколько в ней воды».
Ещё 7 иконок для HUD и окон: **тем же способом** — Codex CLI 0.153.4, `codex exec` со встроенным `image_gen`, прозрачный фон, одна иконка на вызов, по три вызова одновременно, та же обёртка и тот же общий стиль (см. выше), без правок руками. Постобработка та же: альфа ≤6 → 0 и ≥248 → 255, обрезка по альфе >24, Lanczos до 240 px, холст 256×256, PNG (sharp 0.34.5 из соседнего проекта, только на чтение). Исходники 1254×1254 в репозиторий не кладём.

Всего теперь 43 иконки (36 + 7). Строка «Subject» каждого вызова:

- **`well.png`** — Колодец (карточка «Колодец» в HUD). Subject: a cozy round fieldstone farm well with a small peaked wooden roof with terracotta tiles on two wooden posts, a rope winch with a wooden bucket hanging on it, clear fresh water visible in the shaft, three-quarter view. С первого раза, в игре.
- **`bucket.png`** — Ведро с водой (наборы воды колодца: четыре ведёрка). Subject: a sturdy wooden water bucket with dark iron hoops and a rope handle, filled to the brim with clear fresh water, a few water droplets splashing from the surface. С первого раза.
- **`xp-star.png`** — Звёздочка опыта фермы. Subject: a plump shiny five-pointed star in fresh leaf green with a lighter mint highlight on its edges and a clearly readable star silhouette, with two small fresh green sprout leaves growing from the top notch. С первого раза.
- **`level-badge.png`** — Значок уровня: венок с пустой серединой, номер уровня накладывает интерфейс (HUD и экран уровня). Subject: a round medal badge in warm honey-wood brown with a wreath of fresh green leaves around a plain empty smooth cream center disc (completely blank, nothing written on it), a small terracotta-red ribbon bow at the bottom. С первого раза.
- **`van.png`** — Фургон (чип в HUD, окно Фургона). Subject: a cute little vintage farm delivery van with a rounded body in terracotta red and cream, a striped cream and green awning over the windshield, a few wooden crates of vegetables on its roof, front three-quarter view. С первого раза.
- **`help-hands.png`** — Помощь соседям. Subject: a friendly handshake between two hands wearing cream gardening gloves, one with a green cuff and the other with a terracotta cuff, a tiny green sprout with two leaves above them. С первого раза.
- **`basket.png`** — Корзина «Хозяйство» (кнопка в HUD, окно «Хозяйство»). Subject: a woven wicker harvest basket with two handles and a folded cream linen cloth, filled with fresh vegetables: an orange carrot, a red radish, green lettuce leaves and a small pumpkin peeking out. С первого раза.

Монету не рисовали: жетон в игре уже есть (`client/ui/coin.ts`), HUD фермы берёт его.

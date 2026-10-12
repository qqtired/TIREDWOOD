# Иконки интерфейса TIREDWOOD (client/assets/ui/icons)

## Дополнение 5 — воздушный змей, 12.10.2026

`kite.webp` — эмоция/занятие 7 на набережной. Codex CLI, встроенный `image_gen`, один вызов, прозрачный фон. Кораллово-мятный змей с деревянными спицами, катушкой и кремово-коралловыми бантами; общий стиль ниже сохранён. Штатный `post.mjs`: 256×256 WebP с альфой, 13,2 КБ, непрозрачных пикселей на границе исходника нет. Исходник, полный промпт и точный receipt сохранены версионно в [`../../kite/v1/`](../../kite/v1/PROVENANCE.md).

Нарисованы 11 октября 2026 через Codex CLI (первые 88 — v0.153.4, «Дополнение 2», «Дополнение 3» и «Дополнение 4» — v0.162.1; `codex exec`, встроенный `image_gen`, прозрачный фон), **одна иконка на вызов**, по три вызова одновременно, без рисования кодом и без правок руками. Ключей не запрашивали — у Codex своя авторизация.
Всего 148 иконок: Оболочка (интерфейс, меню, HUD) — 23, Рыбалка — 14, Крепость — 14, Другие режимы и события — 22, Дополнение: ферма, картинг, крепость — 15, Дополнение 2: крепость, меню, другие режимы — 16, Дополнение 3: примерочная — 25, Дополнение 4: примерочная, ферма — 19. Сводка — `_sheet.png` (каждая иконка 128 px и 48 px, id под ней; подписи и номера наложены скриптом, не генератором).

Тот же способ, что у иконок фермы (`client/assets/farm/icons/PROVENANCE.md`). Стиль сверен с иконками фермы, крепости и лавки рыбака: рисованная «сказочная» манера, тёплое солнце слева сверху, тонкий тёмно-коричневый контур. Без надписей и цифр, без сине-жёлтого, без sci-fi и неона. Список взят из задания «UI icons» (id — смысл — Subject); в задании было «~70», в списке 73 id — нарисованы все.

## Формат

- **256×256 WebP с альфой** (качество 0,82), прозрачный фон; как у иконок крепости (`client/assets/fort/*.webp`). Всего 1791 КБ (по 6–20 КБ на иконку).
- Предмет обрезан по содержимому (альфа > 24) и вписан в 240×240 по центру (поле 8 px), поэтому мелкие и крупные предметы занимают рамку одинаково.
- Оригиналы 1254×1254 в репозиторий не кладём; они лежат в библиотеке Codex (`~/.codex/generated_images/<папка Codex>/<файл>.png`, имена — в таблице ниже).

## Как вызывали

```
codex exec --skip-git-repo-check -s workspace-write -C <рабочая папка> --json "<обёртка>"
```

Рабочая папка своя для каждой иконки; исходник берётся не из копии, а из библиотеки Codex по `thread_id` из `--json` (папка `~/.codex/generated_images/<thread_id>/`).

Обёртка (та же, что у иконок фермы):

```
Use your built-in image generation tool (image_gen) to generate ONE image on a genuinely transparent background (transparent_background true), square 1024x1024. Do not write code to draw it and do not edit any other files. Subject: <описание предмета>.

<общий стиль>

Then copy the generated image file, completely unchanged (do not resize, convert, crop or otherwise edit it), into the current working directory as <id>.png.
```

## Общий стиль (добавлялся к каждому вызову)

Как у фермы, но в первом предложении другое место действия («a single bold game interface icon for a cozy seaside resort party game (a sunny Black Sea town with jelly-bean characters)»):

```
Style: a single bold game interface icon for a cozy seaside resort party game (a sunny Black Sea town with jelly-bean characters), polished hand-painted cartoon look in the same family as other chunky game item icons: clean readable shapes, soft painterly cel shading, a thin dark-brown outline, a gentle bright highlight, rich natural saturated colors, warm midday summer sunlight from the upper left with soft warm shadows. The object is shown large and centered in a pleasant three-quarter view, filling about 80 percent of the square 1024x1024 canvas with small even margins. Genuinely transparent background (real alpha channel): no ground, no cast shadow, no scenery, no checkerboard, no white box, no frame, no border. Cozy and grounded storybook mood: not sci-fi, no neon, no electric glow, no darkness. Strictly: no text, no letters, no numbers, no symbols, no logos, no watermark. Avoid any blue-and-yellow color combination.
```

Для иконок с желейными персонажами (`token`, `online`, `zombie`, `climber`, `brute`, `champion`, `boss`, `landing`, `bloater`, `spitter`, `armored`, `thief`, `wd-e-normal`, `wd-e-sleepy`, `wd-e-angry`, `wd-e-happy`) в конец общего стиля добавлялась строка:

```
Jelly-bean characters: soft rounded gummy-candy bodies, two small dark oval eyes, mitten hands, no legs, no nose.
```

У остальных иконок (предметы, летучая мышь, крыса) этой строки нет, чтобы на предметах не появлялись глаза.

## Постобработка

Скрипт на node + headless Chrome (canvas, без установки пакетов; свой профиль, свой порт отладки 9491, сырой CDP): альфа ≤6 → 0 и ≥248 → 255, обрезка по альфе >24, уменьшение по большей стороне до 240 px (ступенчато вдвое, затем `imageSmoothingQuality = high`), холст 256×256, WebP с альфой, качество 0,82. Проверка по краям исходника: ни у одной иконки нет непрозрачных пикселей по периметру (нет фона, плашки или рамки).

## Иконки: id, смысл, что нарисовано (отличие промпта — строка «Subject»)

### Оболочка (интерфейс, меню, HUD)

- **`token.webp`** — жетон. Subject: a thick shiny golden arcade token coin with a raised milled rim and an embossed little round jelly-bean face in the middle.
  - к общему стилю добавлена строка про желейных персонажей (см. выше)
  - исходник `exec-c35b487d-98c9-4727-a82f-c8c9574f6ec9.png` (папка Codex `01a127e4-3d67-7bc2-b586-2acae324ef1a`, 1254x1254, sha256 d8fa2cafefde…), в игре 12 КБ
- **`level.webp`** — уровень. Subject: a plump golden five-point star medal with a short red ribbon.
  - исходник `exec-2c3a031b-5d67-46b9-834d-eedc1d3b220a.png` (папка Codex `01a127eb-0220-7421-8978-e89ba2da8405`, 1254x1254, sha256 2d35ae8d2861…), в игре 9 КБ
- **`chat.webp`** — чат. Subject: a puffy cream-white speech bubble with a soft rounded tail.
  - исходник `exec-294b0f5c-6c59-4cdb-ae53-b117d1d5d533.png` (папка Codex `01a127eb-0220-75c3-b68f-a83591643090`, 1254x1254, sha256 e0d324f16d70…), в игре 6 КБ
- **`voice.webp`** — голос. Subject: a small vintage chrome-and-cream radio microphone on a short stand.
  - исходник `exec-fd81b5fe-7ef5-4bf6-b6a0-dde954c108b1.png` (папка Codex `01a127eb-0220-7b13-990e-3abef37cd20e`, 1254x1254, sha256 76e91f0b62cc…), в игре 11 КБ
- **`sound.webp`** — звук. Subject: a small vintage brass gramophone horn speaker.
  - исходник `exec-61fc6b36-7f20-42b8-9e2d-0853af964ded.png` (папка Codex `01a127ec-7cd1-7bf0-803e-494230009b3f`, 1254x1254, sha256 03d0174350b6…), в игре 12 КБ
- **`online.webp`** — кто где. Subject: three small round candy-colored jelly-bean characters (raspberry, mint, tangerine) huddled together, smiling.
  - к общему стилю добавлена строка про желейных персонажей (см. выше)
  - исходник `exec-6b69c0ea-147d-4584-ae8a-2b569dfb2dd2.png` (папка Codex `01a127ec-7dd8-7413-a2b5-c71c10fe0147`, 1254x1254, sha256 6812348eaa2b…), в игре 12 КБ
- **`settings.webp`** — настройки. Subject: a chunky brass cog gear with a polished highlight.
  - исходник `exec-aaa8b0c7-58e9-418c-8aec-f7bfe5b18fac.png` (папка Codex `01a127ec-af9d-7581-99aa-7d2087fba628`, 1254x1254, sha256 2cc06a713348…), в игре 12 КБ
- **`records.webp`** — рекорды. Subject: a golden trophy cup with two handles on a small wooden base.
  - исходник `exec-91144e99-4764-495a-ab32-e01315f3ef41.png` (папка Codex `01a127ed-f6f6-7b61-a36b-16380136f1f8`, 1254x1254, sha256 19073375a84c…), в игре 13 КБ
- **`collection.webp`** — коллекция. Subject: a thick leather photo album with a red ribbon bookmark and a few photo corners peeking out.
  - исходник `exec-cc057420-6b25-476f-a223-7250f37e3aa7.png` (папка Codex `01a127ed-ff20-7412-a71b-1fd950ce82ef`, 1254x1254, sha256 76d43a10102c…), в игре 11 КБ
- **`gift.webp`** — подарок. Subject: a gift box wrapped in raspberry paper with a big mint ribbon bow.
  - исходник `exec-5211a519-e8b1-49b9-a629-98b845f683a2.png` (папка Codex `01a127ee-0d0a-78a1-bdae-24495042a853`, 1254x1254, sha256 5458d67931a1…), в игре 13 КБ
- **`keys.webp`** — клавиши. Subject: a single chunky cream-colored retro mechanical keyboard keycap, a rounded-square cap with a gently dished completely blank top, thick sloped sides, and a visible darker taupe plastic stem and square base plate under it so it clearly reads as a keyboard key, seen in three-quarter view from slightly above.
  - v1 (колпачок без основания) читался как кремовый кубик/зефирина — перерисован с видимой ножкой и пластиной (v2), он в игре. Описание v1: a single chunky cream retro keyboard keycap, blank top, seen in three-quarter view.
  - исходник `exec-b629d7ec-34c2-4bec-9e6c-7dc19f127ede.png` (папка Codex `01a12815-c768-7852-af7b-b3e17f61371b`, 1254x1254, sha256 a9630897a0e3…), в игре 7 КБ
- **`exit.webp`** — выход. Subject: a small wooden door with a round window, slightly ajar, warm light inside.
  - исходник `exec-bb7858b0-788f-474b-a62b-54c8671851af.png` (папка Codex `01a127ef-46ef-7fb3-b06c-648f9ca6841c`, 1254x1254, sha256 5550fef4174c…), в игре 10 КБ
- **`wardrobe.webp`** — примерочная. Subject: a wooden clothes hanger with a striped red-and-white scarf draped over it.
  - исходник `exec-d9b89afa-1feb-42be-87c7-6a893c5b977a.png` (папка Codex `01a127ef-7eff-71a0-aa95-db26a449f380`, 1254x1254, sha256 be3689284f9f…), в игре 13 КБ
- **`emote.webp`** — эмоции. Subject: a cheerful waving cartoon mitten hand, raspberry color.
  - исходник `exec-8c00edf9-5715-459a-aebc-985d6368a354.png` (папка Codex `01a127f0-f184-7031-80ba-9885b44ea8ad`, 1254x1254, sha256 06ffdf3662c2…), в игре 8 КБ
- **`pin.webp`** — где ты. Subject: a red map pin with a glossy round head.
  - исходник `exec-03cd38ca-5abc-4d24-84ce-9a325dde527b.png` (папка Codex `01a127f0-f0a7-7ef1-8dbf-3b4dc6cce5df`, 1254x1254, sha256 29b0b2bc4c84…), в игре 6 КБ
- **`stopwatch.webp`** — время. Subject: a brass stopwatch with a cream face, no numbers on the face.
  - исходник `exec-ed9a7920-a452-40b8-85a7-8f98d303932c.png` (папка Codex `01a127f1-1655-7ec2-9d24-36b630d59b09`, 1254x1254, sha256 2c4f35b77fe4…), в игре 11 КБ
- **`bell.webp`** — колокол. Subject: a polished brass hand bell with a wooden handle.
  - исходник `exec-8f92ee34-626d-47d1-a337-cb6ce1e67211.png` (папка Codex `01a127f2-3ae7-7620-8b28-6c8107f4fad9`, 1254x1254, sha256 0f36f8e765c1…), в игре 9 КБ
- **`warn.webp`** — внимание. Subject: a small red alarm siren lamp with a glowing red dome (warm, not neon).
  - исходник `exec-f26fedcf-8fc8-4a5a-abb0-d4f1542ee7ca.png` (папка Codex `01a127f2-3db6-7863-8333-3a435e1ec585`, 1254x1254, sha256 56edeab2ff05…), в игре 11 КБ
- **`scroll.webp`** — задание/инфо. Subject: a rolled parchment scroll tied with a red string.
  - исходник `exec-5519f1ba-6477-42b1-a18a-7eb289ace7a7.png` (папка Codex `01a127f2-7aae-74d1-b505-c29c67551902`, 1254x1254, sha256 7cea64bbfe6d…), в игре 11 КБ
- **`lock.webp`** — закрыто. Subject: a chunky iron padlock, closed.
  - исходник `exec-a98d7631-00b0-4b21-8248-69de4a8b189c.png` (папка Codex `01a127f3-86cb-7102-950f-456096c0b9db`, 1254x1254, sha256 c8471e8c2f0b…), в игре 10 КБ
- **`music.webp`** — музыка. Subject: a black vinyl record with a plain red center label (no text).
  - исходник `exec-29d33989-64ad-4a5c-89e6-5124ae2f373b.png` (папка Codex `01a127f3-c9ef-76c3-b0c4-396237b7ec45`, 1254x1254, sha256 08509ffe762a…), в игре 9 КБ
- **`camera.webp`** — фото. Subject: a vintage cream-and-brown film camera.
  - исходник `exec-a5b010d4-2c1f-4bae-ba26-3e6eca125554.png` (папка Codex `01a127f3-dd6c-7f52-923c-bc23c360128e`, 1254x1254, sha256 2f52015d6c59…), в игре 12 КБ
- **`ticket.webp`** — билет. Subject: a striped red-and-cream retro paper admission ticket with scalloped edges (no text).
  - исходник `exec-ef84f645-1d88-4a77-969b-a34ee369905d.png` (папка Codex `01a127f5-3df1-7571-a4c6-bc3a9566ba6b`, 1254x1254, sha256 c54d7f71b93f…), в игре 8 КБ

### Рыбалка

- **`journal.webp`** — журнал рыбака. Subject: a worn green leather notebook with a brass clasp shaped like a fish.
  - исходник `exec-e5172c08-6105-4cdb-822d-999d8a5ca7c3.png` (папка Codex `01a127e4-3d94-7683-a51c-abe74dd2f388`, 1254x1254, sha256 6ba2eafa50dc…), в игре 14 КБ
- **`livewell.webp`** — лайвел. Subject: a wooden bucket with water and a silver fish tail sticking out.
  - исходник `exec-1859011a-b467-4155-bb98-d50b18fcdf32.png` (папка Codex `01a127f5-46bd-77d0-a21e-c427afd583a8`, 1254x1254, sha256 1729d9685e16…), в игре 14 КБ
- **`quest-fish.webp`** — задание рыбака. Subject: a parchment checklist pinned to a board with a fishing hook (lines are blank strokes, no letters).
  - исходник `exec-bbed1c8d-8300-4510-a819-97c100ee2e08.png` (папка Codex `01a127f5-465b-7102-a9da-3cb5c7ac2835`, 1254x1254, sha256 5fdbc1757088…), в игре 11 КБ
- **`float.webp`** — поклёвка. Subject: a red-and-white fishing float bobber floating with a small ripple.
  - исходник `exec-d9fb2ad8-aec7-4109-bf84-5e1496f42c06.png` (папка Codex `01a127f7-439e-73d0-922c-b95505d4cf21`, 1254x1254, sha256 3b7eaa16a3bf…), в игре 10 КБ
- **`season.webp`** — сезон рыбалки. Subject: a golden fish-shaped trophy on a small wooden stand with a tiny festive pennant.
  - исходник `exec-cc4f5917-f8fb-46b2-87e8-0e10e1dd6088.png` (папка Codex `01a127f7-4b85-7fa2-afe6-1babdc8c21a2`, 1254x1254, sha256 ecf779986406…), в игре 15 КБ
- **`rain.webp`** — дождь. Subject: a fluffy grey-blue rain cloud with a few teardrop raindrops.
  - исходник `exec-f184aba3-53cf-4073-a93b-5e4ee94a9f57.png` (папка Codex `01a127f7-686d-7ac3-a658-546158ba815d`, 1254x1254, sha256 368d009a7fb0…), в игре 10 КБ
- **`fog.webp`** — туман. Subject: a soft pale curl of sea mist wrapped around a small glowing brass lantern.
  - исходник `exec-e3b90324-263b-40f1-b769-34fed9a42354.png` (папка Codex `01a127f8-bf94-70d0-bf74-db2f0da31673`, 1254x1254, sha256 ab5a1fb372f8…), в игре 14 КБ
- **`anchor.webp`** — якорь. Subject: a dark iron anchor with a coil of rope.
  - исходник `exec-d58251e4-10de-4301-9192-c3d66fb49e46.png` (папка Codex `01a127f9-1b38-78c1-a9cf-11afdaa2d63a`, 1254x1254, sha256 79364a6ee2b2…), в игре 13 КБ
- **`boat.webp`** — лодка. Subject: a small wooden fishing rowboat painted teal and cream, three-quarter view.
  - исходник `exec-89757743-6b70-4eba-8771-7217e1c17a15.png` (папка Codex `01a127f9-774e-7062-b04c-a954aa40fc5a`, 1254x1254, sha256 e199744d050d…), в игре 12 КБ
- **`radio.webp`** — радио. Subject: a cream vintage transistor radio with a round speaker grille and a short antenna.
  - исходник `exec-57d6d12c-334e-4009-a51a-c4994c054c42.png` (папка Codex `01a127fa-ae9a-75a3-a9cb-a89bfae7fcd8`, 1254x1254, sha256 eec0025d68dc…), в игре 15 КБ
- **`compass.webp`** — компас. Subject: a brass ship compass with a cream face and a red needle (no letters).
  - исходник `exec-20a4777c-b489-4529-8354-b9f910e47cf0.png` (папка Codex `01a127fa-da60-7b90-ad83-bf880732cf07`, 1254x1254, sha256 b040fddc44e4…), в игре 11 КБ
- **`release.webp`** — отпустить. Subject: a silver fish leaping back into a splash of clear water.
  - исходник `exec-5488697d-1ffb-4bb6-9559-7e13f1ca0fd0.png` (папка Codex `01a127fb-3ba8-7c00-92a7-4f9f6a41e17f`, 1254x1254, sha256 397ccdda5bdd…), в игре 20 КБ
- **`sell.webp`** — продать. Subject: a small cloth money pouch tied with string, a few golden coins spilling out.
  - исходник `exec-e43da4dd-845b-4c4a-8aff-e10ee33542e4.png` (папка Codex `01a127fc-5c2e-7ef3-9d5a-db3bf46c0ef9`, 1254x1254, sha256 2c89128542a0…), в игре 12 КБ
- **`odds.webp`** — шансы. Subject: a small fan of three colourful fish silhouettes in grey, blue and purple tones overlapping (like a palette).
  - исходник `exec-c9eeabc6-b900-4696-ac53-d459a29ff176.png` (папка Codex `01a127fc-717f-7bc2-b7ea-cfe19b3cf1fe`, 1254x1254, sha256 115c745bccce…), в игре 13 КБ

### Крепость

- **`gold.webp`** — золото крепости. Subject: a small heap of shiny gold nuggets and a couple of coins in a wooden scoop.
  - исходник `exec-4a42a0eb-38f2-4ead-b712-b19249f7a5c6.png` (папка Codex `01a127fc-ecbe-7021-85ea-d7f428967420`, 1254x1254, sha256 1e994c0f6ac5…), в игре 12 КБ
- **`horn.webp`** — волна. Subject: a curved brass war horn with a leather strap.
  - исходник `exec-30d58e66-a7a6-47eb-997a-3229a05df7e0.png` (папка Codex `01a127fd-cc1c-7a11-94d8-3ff1d785d362`, 1254x1254, sha256 515ccbd14791…), в игре 13 КБ
- **`zombie.webp`** — зомби. Subject: a cute green zombie jelly-bean character with stitches and a patch, arms stretched forward, goofy not scary.
  - к общему стилю добавлена строка про желейных персонажей (см. выше)
  - исходник `exec-d104b049-2b92-46a4-9862-272132eb3e3e.png` (папка Codex `01a127e4-3dfd-7140-bf40-7705b9d99b7e`, 1254x1254, sha256 a91495afa90a…), в игре 10 КБ
- **`climber.webp`** — верхолаз. Subject: a green zombie jelly-bean clinging to a short wooden ladder.
  - к общему стилю добавлена строка про желейных персонажей (см. выше)
  - исходник `exec-38bc508a-5de2-4f0b-8fcc-e442f30c3344.png` (папка Codex `01a127fd-d283-7292-a180-90e3f3bbe0d8`, 1254x1254, sha256 059918e0d45f…), в игре 12 КБ
- **`bat.webp`** — нетопырь. Subject: a cartoon purple bat with big ears and a goofy grin, wings spread.
  - исходник `exec-f6b0cb6a-5fdb-41e6-bcb0-981f6649620f.png` (папка Codex `01a127fe-7316-7112-8530-1f65bba04c16`, 1254x1254, sha256 b4bf6881de51…), в игре 13 КБ
- **`brute.webp`** — бугай. Subject: a big chunky muscular dark-green zombie jelly-bean with a wooden club, goofy.
  - к общему стилю добавлена строка про желейных персонажей (см. выше)
  - исходник `exec-e4074cad-d421-4bfd-9e13-9f9e44b5f754.png` (папка Codex `01a127ff-9f27-7a02-a322-91ee4656f969`, 1254x1254, sha256 f20fa987d2b3…), в игре 12 КБ
- **`champion.webp`** — чемпион. Subject: a green zombie jelly-bean wearing a dented iron helmet and a little red cape.
  - к общему стилю добавлена строка про желейных персонажей (см. выше)
  - исходник `exec-cb3c00c2-21ad-40cc-8847-e705599fde5c.png` (папка Codex `01a127ff-d874-7f01-926a-f5f3a8ed5b2d`, 1254x1254, sha256 fe24b1d50b43…), в игре 12 КБ
- **`boss.webp`** — босс. Subject: a large green zombie jelly-bean wearing a golden crown, smug expression.
  - к общему стилю добавлена строка про желейных персонажей (см. выше)
  - исходник `exec-22d5ab03-0d8d-4acd-97a0-61c226fa698b.png` (папка Codex `01a12800-2fd3-7a11-b1a6-d6b61d06b2b3`, 1254x1254, sha256 6eac264a3093…), в игре 11 КБ
- **`landing.webp`** — десант. Subject: a small wooden rowboat full of tiny green zombie jelly-beans.
  - к общему стилю добавлена строка про желейных персонажей (см. выше)
  - исходник `exec-94873b60-61d4-4776-a7db-357a79adfc92.png` (папка Codex `01a12801-4910-7380-8cf6-749755362289`, 1254x1254, sha256 eb7c0d4de46c…), в игре 14 КБ
- **`supply.webp`** — припасы. Subject: a wooden supply crate hanging from a small cream parachute.
  - исходник `exec-90ddb93a-f08d-4a03-ad1f-7ec5a9e212e8.png` (папка Codex `01a12801-c9b7-7ed0-9e67-41103a97950d`, 1254x1254, sha256 9e4d64d51269…), в игре 13 КБ
- **`bomb.webp`** — граната. Subject: a round black cartoon bomb with a short lit fuse spark.
  - исходник `exec-f10ab8ce-d1f8-45e6-b197-e7cb9411e778.png` (папка Codex `01a12801-f065-7433-8b06-a83b2c8f30f5`, 1254x1254, sha256 28c64b53e4ee…), в игре 8 КБ
- **`shield.webp`** — щит. Subject: a round wooden shield with an iron rim and a red stripe.
  - исходник `exec-f52dab1e-4793-4d6e-afdb-cb37145fc1ac.png` (папка Codex `01a12803-232b-7f62-a165-348a3b1aba13`, 1254x1254, sha256 d671ff9625dd…), в игре 13 КБ
- **`ladder.webp`** — лестница. Subject: a short wooden ladder.
  - исходник `exec-5c1fde2c-235c-4533-b401-b2f861a7faa4.png` (папка Codex `01a12803-b829-71e2-9f25-200e460f593d`, 1254x1254, sha256 9cc6680adaaf…), в игре 11 КБ
- **`hammer.webp`** — ремонт. Subject: a wooden-handled carpenter hammer with a few nails.
  - исходник `exec-ced77d15-975d-47b1-aa46-d8d0493bb9b8.png` (папка Codex `01a12803-f1bf-7451-9062-215a0db786e9`, 1254x1254, sha256 af38c556ecea…), в игре 12 КБ

### Другие режимы и события

- **`heart.webp`** — здоровье. Subject: a glossy red candy heart.
  - исходник `exec-44d86c6d-5ad5-4192-ba08-5ad97edfb8af.png` (папка Codex `01a12804-d7e1-7d30-8973-76e40c0bde09`, 1254x1254, sha256 b83cb7d682a0…), в игре 9 КБ
- **`paint.webp`** — пейнтбол. Subject: a big juicy orange paint splat with a few droplets.
  - исходник `exec-e3d95043-e658-45d1-b751-bb915e54817d.png` (папка Codex `01a12805-418e-7a53-b861-c13938e995e2`, 1254x1254, sha256 83f5c815b893…), в игре 15 КБ
- **`paintballs.webp`** — патроны. Subject: a clear hopper full of colorful paintballs.
  - исходник `exec-a01bb13d-e7c1-4a29-a9ea-de2bf3a98844.png` (папка Codex `01a12805-aa58-7df3-8b1f-270fa61d8550`, 1254x1254, sha256 b63c650cd7b7…), в игре 12 КБ
- **`flag-finish.webp`** — финиш. Subject: a black-and-white checkered racing flag on a short pole, waving.
  - исходник `exec-0cda464c-adaf-4c48-8188-c3045689df7d.png` (папка Codex `01a12806-9914-7471-a08b-c515e9086fd0`, 1254x1254, sha256 287cf9fbe483…), в игре 10 КБ
- **`kart.webp`** — картинг. Subject: a small red go-kart, three-quarter view, no driver.
  - исходник `exec-8af538f4-9e32-4a8c-8d67-13b6f43deadd.png` (папка Codex `01a12806-fcd2-73b1-8bf7-5039f2077aca`, 1254x1254, sha256 ca300bebb421…), в игре 11 КБ
- **`medal-gold.webp`** — золото. Subject: a gold medal on a red ribbon (no numbers).
  - исходник `exec-04877a8d-ba2b-4313-ac16-f7e4d77d63b3.png` (папка Codex `01a12807-5081-7a33-8b3f-5634710e9480`, 1254x1254, sha256 73559b5a507f…), в игре 10 КБ
- **`medal-silver.webp`** — серебро. Subject: a silver medal on a teal ribbon (no numbers).
  - исходник `exec-9aa9401b-9287-4422-957a-25e12eda21cd.png` (папка Codex `01a12808-c3c8-7d63-8fd1-6605a8cd520a`, 1254x1254, sha256 5894cbb12d98…), в игре 9 КБ
- **`medal-bronze.webp`** — бронза. Subject: a bronze medal on a green ribbon (no numbers).
  - исходник `exec-17caf653-dc70-4305-90b3-fea011256938.png` (папка Codex `01a12808-c3c8-77c1-ad60-208421d442e1`, 1254x1254, sha256 6fdae67fa2f8…), в игре 9 КБ
- **`pirate-flag.webp`** — пираты. Subject: a tattered black pirate flag on a short wooden pole with a cartoon fish skeleton emblem in white.
  - исходник `exec-a7bc697d-12a7-4ec3-8536-5dcc9320b3ae.png` (папка Codex `01a12809-73be-70d2-91b9-40e464e1598a`, 1254x1254, sha256 2d965ecc5b0e…), в игре 12 КБ
- **`loot.webp`** — добыча. Subject: an open wooden pirate chest overflowing with gold coins and pearls.
  - исходник `exec-b5fcb238-4192-40ce-8c40-d624d6bbe4b3.png` (папка Codex `01a1280b-0025-7bc2-b833-80096ed1c809`, 1254x1254, sha256 25f2bdf30212…), в игре 17 КБ
- **`lighthouse.webp`** — маяк. Subject: a small red-and-white striped lighthouse with a warm glowing lamp.
  - исходник `exec-416d9e46-12b7-471e-b165-e5ce3fb6484b.png` (папка Codex `01a1280a-ffbf-7360-8959-bd31cccc9870`, 1254x1254, sha256 6e2d7408edd6…), в игре 9 КБ
- **`storm.webp`** — шторм. Subject: a dark thundercloud with a golden zigzag lightning bolt.
  - исходник `exec-892d2eb4-8b04-4d65-8063-61ea7e6d22ec.png` (папка Codex `01a1280b-cc94-7cf2-a6e3-1b44216a8aea`, 1254x1254, sha256 a7db6dab72a7…), в игре 8 КБ
- **`slide.webp`** — аквапарк. Subject: a twisty red-and-white water slide with a splash at the end.
  - исходник `exec-f67f1f39-b5c1-4202-8e3c-f8a901c62179.png` (папка Codex `01a1280c-ea8e-7d32-a6fc-402676cb64d2`, 1254x1254, sha256 1f7c85863cc7…), в игре 16 КБ
- **`roulette.webp`** — рулетка. Subject: a small roulette wheel in red, black and green with a wooden rim (no numbers).
  - исходник `exec-704e02f9-e8bc-4bd9-9b51-6c5d8745a2aa.png` (папка Codex `01a1280d-45aa-7db3-a54b-bbe4afc38ff5`, 1254x1254, sha256 5eed703e13de…), в игре 15 КБ
- **`rat.webp`** — крысиные бега. Subject: a cute grey racing rat wearing a tiny red saddle cloth, running.
  - исходник `exec-e66f53e4-9800-458a-92ed-436c969424f2.png` (папка Codex `01a1280d-9aa0-7892-8dce-bb56436c0c3a`, 1254x1254, sha256 79995519b2c8…), в игре 13 КБ
- **`cards.webp`** — карты. Subject: two playing cards fanned, showing only ornate red card backs.
  - исходник `exec-eb123701-55b2-49c0-9507-5b94585698f9.png` (папка Codex `01a1280e-cc7a-79d3-9efc-9d9f6229168e`, 1254x1254, sha256 4c7f23ee7d02…), в игре 19 КБ
- **`bell-cloud.webp`** — выше облаков. Subject: a golden bell sitting on a fluffy white cloud.
  - исходник `exec-14361940-8cf4-4237-af76-639057159a75.png` (папка Codex `01a1280f-5ae4-7843-a187-226533c222a3`, 1254x1254, sha256 af6be291435d…), в игре 10 КБ
- **`hide-box.webp`** — прятки. Subject: a cardboard box with two cartoon eyes peeking out of a hole.
  - исходник `exec-d0322481-eef7-48cf-9d94-3c94319b6afb.png` (папка Codex `01a1280f-5bfa-7a81-83bc-6850fc4ec5d9`, 1254x1254, sha256 e9c912c6ef39…), в игре 10 КБ
- **`regatta.webp`** — регата. Subject: a small racing motorboat in raspberry and cream with a white wake.
  - исходник `exec-18dbd37a-50ad-41ea-a5de-4838e4138054.png` (папка Codex `01a12810-7aa7-7d22-9a91-2d365e112b3d`, 1254x1254, sha256 e94618d923a7…), в игре 13 КБ
- **`buoy.webp`** — бакен. Subject: an orange-and-white striped harbor buoy floating.
  - исходник `exec-866224b3-0283-4fd1-9284-4f3aa34e9587.png` (папка Codex `01a12811-05b1-7313-a0f9-b665973bf136`, 1254x1254, sha256 22c4a374e9a1…), в игре 10 КБ
- **`farm-gate.webp`** — ферма. Subject: a small wooden farm gate with sunflowers behind it.
  - исходник `exec-075851f0-e60e-4590-9e45-9510553675e7.png` (папка Codex `01a12811-3ef5-7892-be0e-56d0bb3177fc`, 1254x1254, sha256 5852e7974651…), в игре 19 КБ
- **`dungeon.webp`** — подземелье. Subject: an old iron lantern with a warm flame hanging at a stone cave arch.
  - исходник `exec-af6ae315-52f1-403a-9ffc-4b2a4b5f52cd.png` (папка Codex `01a12812-5d36-7c11-ab66-3a3faad505a8`, 1254x1254, sha256 91760a662e9f…), в игре 18 КБ

### Дополнение: ферма, картинг, крепость

- **`rift-tree.webp`** — Древо разлома. Subject: a gnarled old magical tree with a friendly grumpy face formed by knots in its bark (bushy bark brows, a pouting mouth), a round lush green leafy crown dotted with big pink blossom buds, thick mossy roots spreading at its base.
  - исходник `exec-ea176106-0c60-4175-8c36-af6581f64d61.png` (папка Codex `01a12822-3053-7462-b827-30a0549cda84`, 1254x1254, sha256 e95fd93598eb…), в игре 20 КБ
- **`grumpy-cone.webp`** — шишка-ворчунья. Subject: a single plump brown pine cone with a small cute grumpy face (frowning brows, pouting mouth) formed naturally in its scales, a tiny green needle sprig on top.
  - исходник `exec-1ee9cd55-da9d-4227-af4c-3077586ac21f.png` (папка Codex `01a12822-30e3-7843-b712-13da18e765fc`, 1254x1254, sha256 1c1a2bed3869…), в игре 13 КБ
- **`straw-hat.webp`** — шляпа. Subject: a classic farmer woven straw hat with a wide brim and a red cloth band tied in a small bow.
  - исходник `exec-1b8a26b4-a40a-47e4-b087-b1eb319febf4.png` (папка Codex `01a12823-bc66-7c43-8fb8-a5e448491c38`, 1254x1254, sha256 5fe72a150f93…), в игре 11 КБ
- **`garden-bed.webp`** — грядка. Subject: a small raised wooden garden bed made of warm planks, filled with dark rich soil and three neat rows of young bright green sprouts.
  - исходник `exec-db57eb1f-bd46-4820-af77-186673da477a.png` (папка Codex `01a12823-c40b-7773-b1ac-db17554dafbd`, 1254x1254, sha256 a8d15e46a320…), в игре 12 КБ
- **`card-frame.webp`** — рамка карточки. Subject: an ornate empty golden portrait frame shaped as a rounded rectangle, carved gold corners with little green leaves and a small red berry ornament, the inside of the frame completely empty and transparent.
  - исходник `exec-41100e4f-9706-4b8b-805e-cf6e9ef78ad9.png` (папка Codex `01a12825-7f8f-7652-9b61-64df40b07fc0`, 1254x1254, sha256 426f3948c226…), в игре 13 КБ
- **`kart-turbo.webp`** — турбо (картинг). Subject: a chunky cartoon go-kart booster: a short stubby red-and-white striped rocket canister with little fins and a burst of warm orange flame puffing out of its nozzle.
  - исходник `exec-6a3944e1-44ed-4d96-958d-f6390d34a51b.png` (папка Codex `01a12822-c5e6-7080-af7e-dd14d06ca17d`, 1254x1254, sha256 b577e3ee72c0…), в игре 10 КБ
- **`kart-jam.webp`** — варенье (картинг). Subject: a round glass jar of thick dark red cherry jam with a red-and-white checkered cloth lid tied with string, a glossy drip of jam running down its side.
  - исходник `exec-297e3316-fc5b-4536-a755-f1cd45079d35.png` (папка Codex `01a12824-3efb-79b3-8dbf-9b197523425d`, 1254x1254, sha256 15a610d8afba…), в игре 16 КБ
- **`kart-bubble.webp`** — пузырь (картинг). Subject: a big shiny round soap bubble with soft pastel pink and mint iridescent swirls on its surface and a bright highlight, slightly wobbly.
  - исходник `exec-a41a5fa5-d582-4086-8588-ca0e36310c02.png` (папка Codex `01a12826-1104-7b71-b930-b8b6434a0dc0`, 1254x1254, sha256 9c2fb80d3a57…), в игре 9 КБ
- **`kart-clap.webp`** — хлопок (картинг). Subject: two cartoon white-gloved mitten hands clapping together, with a ring of short bold orange impact lines and a few small puffs bursting outward from the clap.
  - исходник `exec-ebbb3822-a089-4f31-981e-27153ea0bd3a.png` (папка Codex `01a12827-85ae-7723-a674-ae0b56e29a60`, 1254x1254, sha256 504c9a64ee90…), в игре 15 КБ
- **`runner.webp`** — шустрик. Subject: a small skinny lime-green zombie jelly-bean character sprinting fast with a goofy grin, little motion puffs of dust behind it, goofy not scary.
  - исходник `exec-82ad8f1d-f7e2-4159-aa2d-aa1f5956f5e7.png` (папка Codex `01a12829-590f-7323-8458-670ff54065b0`, 1254x1254, sha256 4c94987dc923…), в игре 14 КБ
- **`medic.webp`** — лекарь. Subject: a cream-white zombie jelly-bean character wearing a small nurse cap with a red cross, holding a little green healing potion bottle, goofy not scary.
  - исходник `exec-5ffcd50e-bdda-44b9-916e-7712b2b306e0.png` (папка Codex `01a12829-594c-7333-9b82-b8e5d313e6fe`, 1254x1254, sha256 6b0edc577226…), в игре 11 КБ
- **`kraken.webp`** — кракен. Subject: a big friendly cartoon purple-pink octopus sea monster head rising out of a small splash of sea water, several curling tentacles with suckers, a mischievous grumpy face.
  - исходник `exec-8f97bee0-89ae-4e66-a618-2cb8199ccc62.png` (папка Codex `01a12829-593e-7721-90c6-7061c4c5873f`, 1254x1254, sha256 ca48d9aad8e5…), в игре 18 КБ
- **`white-flag.webp`** — сдаться. Subject: a plain white cloth surrender flag on a short wooden stick, waving gently, with soft folds.
  - исходник `exec-8b64a8d1-1fbd-4107-95bd-0334815f71da.png` (папка Codex `01a1282b-154f-7b21-8e6d-7e28ad7561e6`, 1254x1254, sha256 37d5306efc64…), в игре 10 КБ
- **`meteor.webp`** — метеоры. Subject: a round fiery cartoon rock falling diagonally from the upper right, glowing warm orange and red cracks, a short soft trail of orange flame and smoke behind it.
  - исходник `exec-ab643051-3ffb-4552-b9d5-7f5ee05fb4b0.png` (папка Codex `01a1282b-186e-74b1-ae99-8aa6c980baf5`, 1254x1254, sha256 18814d6bf83e…), в игре 13 КБ
- **`marker.webp`** — маркер. Subject: a chunky cartoon paintball marker gun with a red body, a round clear hopper on top filled with colorful paintballs, seen from the side in three-quarter view.
  - исходник `exec-19fb3387-8374-493a-9931-8112f7b9e1b2.png` (папка Codex `01a1282b-2724-7670-884f-5a6f90559f05`, 1254x1254, sha256 c5db25520dad…), в игре 13 КБ

### Дополнение 2: крепость, меню, другие режимы

- **`bloater.webp`** — пузырь. Subject: a swollen round coral-orange zombie jelly-bean character puffed up like a tight balloon, cheeks and belly stretched taut with little stitched seams, tiny steam puffs and a few red jam droplets spraying out, wide startled eyes, about to pop, goofy not scary.
  - к общему стилю добавлена строка про желейных персонажей (см. выше)
  - исходник `exec-78cfbf1a-6882-47ef-9c74-eda041665df9.png` (папка Codex `01a12afd-b6bd-7d82-b8f1-9622a1a1743f`, 1254x1254, sha256 cb0b68f4f5c6…), в игре 14 КБ
- **`spitter.webp`** — плевальщик. Subject: a green zombie jelly-bean character leaning back with its mouth wide open, spitting a big glossy blob of red cherry jam in an arc with a trail of drips, goofy not scary.
  - к общему стилю добавлена строка про желейных персонажей (см. выше)
  - исходник `exec-8fb7dff7-1c3c-4545-af2d-8e9f65846da1.png` (папка Codex `01a12afd-b6be-7632-a7b7-0df3e459e61d`, 1254x1254, sha256 f96ceea6415c…), в игре 13 КБ
- **`armored.webp`** — чугунок. Subject: a heavy grey-green zombie jelly-bean wearing a stack of round cast-iron pots as chest armour and an upturned iron cooking pot as a helmet with a red feather, goofy not scary.
  - к общему стилю добавлена строка про желейных персонажей (см. выше)
  - исходник `exec-5cb0b8b7-54c4-4bff-8669-a100b2ae5214.png` (папка Codex `01a12afd-b6bd-77c0-bad7-8629bc5e30da`, 1254x1254, sha256 578593c9ec96…), в игре 14 КБ
- **`ram.webp`** — таран (босс). Subject: a huge brown bull charging forward with its head lowered, a thick wooden log with iron bands strapped across its forehead, big curved ivory horns, a golden nose ring, puffs of steam from its nostrils and a red-and-cream striped saddle blanket.
  - исходник `exec-fa6803ae-3ef6-4eab-a505-795dfee5dead.png` (папка Codex `01a12aff-6443-77b3-b0e3-755a439cc1f2`, 1254x1254, sha256 6e504ff53e92…), в игре 16 КБ
- **`golem.webp`** — валун (босс). Subject: a hunched stone golem built from round grey boulders with very long arms and big boulder fists, green moss on its head and shoulders, hoisting a huge rock above its head ready to throw it, a grumpy face.
  - исходник `exec-d14dd330-b901-4bdc-ba4d-7311501c09c4.png` (папка Codex `01a12aff-8fdf-7310-85ed-6b0811efc866`, 1254x1254, sha256 a984c7edcb4e…), в игре 14 КБ
- **`pumpkin-boss.webp`** — король-тыква (босс). Subject: a huge plump orange pumpkin king character with a ribbed round body and a big goofy grumpy-but-friendly face: round warm glowing eyes, bushy brows and a wide gap-toothed grin, a lid-like cap with a curly stem and green leaves wearing a small crooked golden crown, two curly green vine arms with leaves and tendrils, cozy storybook cartoon, not scary, no splatters.
  - v1 (рыжая тыква-фонарь со светящимся вырезанным лицом и красными потёками, как у модели) вышла слишком мрачной для нашего стиля — перерисован добрый ворчун-король с ножками и лозами-руками (v2), он в игре. Описание v1: a huge grumpy orange pumpkin monster with a ribbed round body, a carved grinning face glowing warmly from inside, a lid-like cap with a curly stem and green leaves wearing a small crooked golden crown, two curly green vine arms with leaves and tendrils, a few splats of red jam.
  - исходник `exec-a52df958-3be5-4b8d-89cb-a2c87cc54282.png` (папка Codex `01a12b04-18a6-7c83-8299-1bd21fbe9ee5`, 1254x1254, sha256 1f5bab161068…), в игре 15 КБ
- **`weaver.webp`** — ткачиха (босс). Subject: a plump purple grandmother spider with a round abdomen spotted with red jam, a red polka-dot headscarf, small round glasses, tiny fangs, eight legs in striped stockings and slippers, a spool of thread on her back.
  - исходник `exec-dd8780a2-4414-457c-9724-a463391bea76.png` (папка Codex `01a12b01-237c-72c1-a219-83ba9e2ac71d`, 1254x1254, sha256 172a348b6964…), в игре 17 КБ
- **`leshy.webp`** — леший (босс). Subject: a walking old forest-spirit tree: a stocky bark-covered trunk body with twisting grooves, hollow knothole eyes glowing soft purple, a knobby twig nose, a mossy beard and bushy moss brows, branching antler-like horns with leaves and red jam berries on top, two branch arms with twig fingers, a skirt of roots, a small red toadstool on one shoulder.
  - исходник `exec-548a848e-e9f9-4da9-af5c-f27d75a49c14.png` (папка Codex `01a12b01-4fbd-7570-a007-e1711c48fd3b`, 1254x1254, sha256 e6902cc1978a…), в игре 21 КБ
- **`elite.webp`** — элита. Subject: a wide golden champion belt with a big ornate round gold buckle set with a red gemstone on a dark brown leather strap, shown as a gentle arch.
  - исходник `exec-5a5ba142-e997-48c3-aec2-0f1e8bd5646a.png` (папка Codex `01a12b01-d7e2-7df0-ba99-c038cb1f3986`, 1254x1254, sha256 f2d1a186d7ed…), в игре 13 КБ
- **`kick.webp`** — выгнать. Subject: a big brown leather boot caught mid-kick with small orange impact lines and a few puffs of dust.
  - исходник `exec-97913c11-8e57-4232-9e9b-64d3c7a16132.png` (папка Codex `01a12b02-c2db-7831-9140-31a3f49ebc6f`, 1254x1254, sha256 1f12c50dd726…), в игре 13 КБ
- **`cellar.webp`** — подвал (Fight Club). Subject: a single big shiny red leather boxing glove with a white cuff and white laces, raised ready to punch.
  - исходник `exec-ca13a59b-8b1a-49c1-9fa8-8cff41531d49.png` (папка Codex `01a12b03-77dd-7c21-a6df-d236d8701cdf`, 1254x1254, sha256 cc6f5a5c0429…), в игре 10 КБ
- **`awp.webp`** — AWP. Subject: a long cartoon paintball sniper marker: slim long steel barrel, chunky wooden stock, a round scope on top with a green-tinted lens glint, a small round hopper full of raspberry-red paintballs, three-quarter view lying diagonally.
  - исходник `exec-ae26c044-4e97-4215-8207-ec5b273d2de5.png` (папка Codex `01a12b03-9deb-7862-b4d5-bf98f788672e`, 1254x1254, sha256 7e38c3a943f0…), в игре 10 КБ
- **`headshot.webp`** — в голову. Subject: a round red-and-cream bullseye target with concentric rings and a bold orange paint splat hitting dead center with a few droplets.
  - исходник `exec-076118c9-7af6-417c-aefb-3320ae64a9be.png` (папка Codex `01a12b04-72a3-7a71-948c-b569d1ecf593`, 1254x1254, sha256 2552e70e0139…), в игре 11 КБ
- **`slots.webp`** — игровой автомат. Subject: a chunky cartoon slot machine cabinet in raspberry red with golden trim, three round reel windows each showing a red cherry, a side lever with a red ball knob and golden coins spilling out of the tray.
  - исходник `exec-50aae4e0-2244-4df1-83ad-221a5f66a308.png` (папка Codex `01a12b05-18d5-7d50-93ea-397acc10bae9`, 1254x1254, sha256 42086c8ad0c3…), в игре 17 КБ
- **`seaplane.webp`** — гидроплан. Subject: a small cheerful cartoon seaplane in red and cream floating on two pontoon floats with a round propeller on its nose and a little splash of sea foam under the floats.
  - исходник `exec-b7968fd7-82d5-4f4d-a50f-2a0a77dbeea8.png` (папка Codex `01a12b05-7fd8-7132-b487-3e69aa30b21e`, 1254x1254, sha256 a980ef623c66…), в игре 15 КБ
- **`thief.webp`** — вор. Subject: a jelly-bean character wearing a black eye mask and a red-and-cream striped knitted beanie, sneaking along while carrying a wooden crate on its shoulder with a gold coin peeking out, goofy.
  - к общему стилю добавлена строка про желейных персонажей (см. выше)
  - исходник `exec-3ccac97b-370e-454c-9918-d7ade753df93.png` (папка Codex `01a12b06-56c9-75e2-b6a6-f1d491693e00`, 1254x1254, sha256 5145bba15648…), в игре 12 КБ

### Дополнение 3: примерочная

Нарисованы 11 октября 2026, Codex CLI `codex-cli 0.162.1` (`codex --version`), тем же способом, что «Дополнение 2»: `codex exec`, встроенный `image_gen`, прозрачный фон, одна иконка на вызов, по три вызова одновременно, тот же общий стиль и та же обёртка (описаны выше). Это картинки вещей для карточек «Примерочной»: файл `wd-<слот>-<ключ>.webp` подхватывается сам (`itemArt()` в `client/ui/wardrobe.ts`) и заменяет эмодзи. Глаза «обычные / сонные / сердитые / довольные» — портрет желейки крупным планом (оранжево-персиковая желейка; глаза как в игре: белок с тёмным зрачком, веко срезает глаз); очки, шапки и аксессуары — сама вещь. Вид вещей взят из кода (`shared/outfit.ts`, `client/render/outfit3d.ts`, `client/render/outfitfish.ts`, `docs/farm/design-v11.md`). Очки рыболова — из сета «Бывалый рыбак».

- **`wd-e-normal.webp`** — обычные глаза. Subject: a close-up portrait of a plump round peach-orange jelly-bean face filling the frame, two big friendly round white eyes with dark round pupils looking straight ahead, a tiny gentle smile and soft rosy cheeks, the eyes are the star of the picture.
  - к общему стилю добавлена строка про желейных персонажей (см. выше)
  - исходник `exec-7baabb54-29eb-40bd-a787-fbc2925151b5.png` (папка Codex `01a12b43-2d19-7913-97c8-fe57a66f08f5`, 1254x1254, sha256 a9b57059675e…), в игре 10 КБ
- **`wd-e-sleepy.webp`** — сонные глаза. Subject: a close-up portrait of a plump round peach-orange jelly-bean face filling the frame with sleepy half-closed eyes: heavy flat peach-colored eyelids cover the top half of each big white eye, small dark pupils drooping low, a small calm relaxed mouth, drowsy and peaceful.
  - к общему стилю добавлена строка про желейных персонажей (см. выше)
  - исходник `exec-6435b941-ee71-46b5-aa78-0c97e902586a.png` (папка Codex `01a12b43-2d19-7f52-ac37-fec5d301a87e`, 1254x1254, sha256 26695571c796…), в игре 9 КБ
- **`wd-e-angry.webp`** — сердитые глаза. Subject: a close-up portrait of a plump round peach-orange jelly-bean face filling the frame with grumpy angry eyes: thick peach-colored eyelids slanting steeply down toward the middle of the face over big white eyes in a stern V-shape, small dark pupils glaring forward, a small flat frowning mouth, cute and grumpy not scary.
  - к общему стилю добавлена строка про желейных персонажей (см. выше)
  - исходник `exec-68c09656-91a9-46c0-b00f-90a1616fdc25.png` (папка Codex `01a12b43-2d19-7282-95e3-524dbec79fb8`, 1254x1254, sha256 c5bedb86beee…), в игре 10 КБ
- **`wd-e-happy.webp`** — довольные глаза. Subject: a close-up portrait of a plump round peach-orange jelly-bean face filling the frame with blissfully happy eyes squeezed into two upward-curved crescent arcs like ^ ^ with tiny dark pupils peeking out beneath the arcs, a wide soft smile and rosy cheeks.
  - к общему стилю добавлена строка про желейных персонажей (см. выше)
  - исходник `exec-44183237-46bc-4e12-8d83-3ce8cb0df28c.png` (папка Codex `01a12b44-f756-79a2-8ffb-fe1a2c8ac1ff`, 1254x1254, sha256 2636abee18f5…), в игре 9 КБ
- **`wd-e-glasses.webp`** — очки. Subject: a pair of round thin dark-brown wire-frame eyeglasses with clear glass lenses showing a soft white glint, a small nose bridge and two slim temple arms, shown alone in three-quarter view.
  - исходник `exec-12c8b57a-8996-4584-b551-4be121318114.png` (папка Codex `01a12b45-07e8-7dc1-991d-cd02290831eb`, 1254x1254, sha256 fda69fdda65e…), в игре 12 КБ
- **`wd-e-shades.webp`** — тёмные очки. Subject: a pair of glossy black sunglasses with large rounded dark lenses each with a bright white glint streak, a thin black bridge bar and slim black temple arms, shown alone in three-quarter view.
  - исходник `exec-4062a212-92da-4475-bc13-806d08e604d9.png` (папка Codex `01a12b45-0c0a-7470-b35c-f7780063672d`, 1254x1254, sha256 8275a9f98ef9…), в игре 8 КБ
- **`wd-e-patch.webp`** — пиратская повязка. Subject: a black pirate eye patch: a rounded black cloth oval patch on a thin black elastic strap forming a loop, plain with no skull and no symbols, shown alone in three-quarter view.
  - исходник `exec-b687e80e-57fc-445d-b003-a133f97433d7.png` (папка Codex `01a12b46-8dc8-72b1-bc41-d3ebc8cbf752`, 1254x1254, sha256 9b9e8b9fd3bb…), в игре 8 КБ
- **`wd-e-monocle.webp`** — монокль. Subject: a gentleman's gold monocle: a round thin polished gold ring frame holding a clear glass lens with a soft glint, a fine gold chain trailing down from it in a gentle curve.
  - исходник `exec-af02648d-272a-4e6a-bb84-5ebf5e372767.png` (папка Codex `01a12b46-b307-7122-9e53-2c7a6fc6db51`, 1254x1254, sha256 fe1e5d15b35d…), в игре 18 КБ
- **`wd-e-angler.webp`** — очки рыболова. Subject: a pair of angler polarized sunglasses with glossy amber-orange lenses showing a pale glint, a dark forest-green frame, slim green temple arms and a green retainer cord looped behind, from a seasoned fisherman's outfit, shown alone in three-quarter view.
  - исходник `exec-cda24d80-4711-47e9-8176-aa361ed97d95.png` (папка Codex `01a12b46-eccc-7a41-9d60-4ec4215e2d46`, 1254x1254, sha256 44d71ed5f623…), в игре 10 КБ
- **`wd-h-cap.webp`** — кепка. Subject: a classic red baseball cap with a rounded dome crown, a slightly darker red curved peak (visor) and a small button on top, plain with no logo.
  - исходник `exec-cc3eb4d8-5093-448f-925d-220f848128f1.png` (папка Codex `01a12b48-39f7-7580-95a2-6c731e41cc51`, 1254x1254, sha256 e230b7b27f0e…), в игре 7 КБ
- **`wd-h-panama.webp`** — панама. Subject: a pale cream woven straw Panama hat with a soft rounded dome crown, a wide gently sloping brim and a sage-green hatband.
  - исходник `exec-b55e19bc-f769-42bc-a88c-ba5bf7c282bb.png` (папка Codex `01a12b48-64f2-77a3-a5bf-e7aa2d322db5`, 1254x1254, sha256 ade5db583d3b…), в игре 10 КБ
- **`wd-h-ushanka.webp`** — ушанка. Subject: a brown fur ushanka winter hat with long fluffy fur ear flaps hanging down at both sides, a thick fur band across the front and a small red star-shaped badge on the front.
  - исходник `exec-0571c7e8-ce81-425d-959f-b72933dd8d37.png` (папка Codex `01a12b48-8779-7810-8253-04fa60562d3e`, 1254x1254, sha256 c48416357f19…), в игре 12 КБ
- **`wd-h-fisher.webp`** — рыбацкая шляпа. Subject: an olive-khaki canvas fisherman's bucket hat with a soft cylindrical crown, a drooping brim all around, a dark olive band, and a tiny red-and-white fishing bobber pinned on the side.
  - исходник `exec-fad1a661-5170-4d31-81b0-9ab8c808de00.png` (папка Codex `01a12b49-e2fb-7122-b50d-df1fc5f6dd9d`, 1254x1254, sha256 aa854f6df16d…), в игре 8 КБ
- **`wd-h-bandana.webp`** — бандана. Subject: a plain red cotton bandana tied as a head scarf, a snug dome shape with soft fabric folds, the knot at the back and two short loose tails hanging, no pattern and no skull.
  - исходник `exec-c83f4f66-7d06-4c7b-be69-dbfd0695e4e6.png` (папка Codex `01a12b49-e44c-7c82-bfcc-ddac64143df7`, 1254x1254, sha256 6905af1c0b8e…), в игре 8 КБ
- **`wd-h-helmet.webp`** — каска. Subject: a shiny yellow construction hard hat with a raised center ridge running front to back and a rounded rim, glossy highlights.
  - исходник `exec-c22aa168-5c24-4898-9076-e960131e940c.png` (папка Codex `01a12b4a-7273-7eb1-955b-b3b39be0b216`, 1254x1254, sha256 dd4678fe90a5…), в игре 9 КБ
- **`wd-h-sailor.webp`** — бескозырка. Subject: a sailor's flat round cap: a flat black round top with a thin white piping ring, a black band around it, a small round brass cockade plate on the front, two long black ribbons trailing at the back, no letters on the band.
  - исходник `exec-f6d5ea0a-6064-4633-ac6a-9f6443ca343d.png` (папка Codex `01a12b4b-9a62-7073-baf8-b9a82e782989`, 1254x1254, sha256 d9e5a85e1e43…), в игре 9 КБ
- **`wd-h-tophat.webp`** — цилиндр. Subject: a tall black silk top hat with a flat brim and a deep burgundy-red hatband, glossy highlights.
  - исходник `exec-7b9b1647-66cd-47a9-8b07-93cd74e49d80.png` (папка Codex `01a12b4b-b33f-7153-80df-ad9bdb159a94`, 1254x1254, sha256 a17320490c50…), в игре 8 КБ
- **`wd-h-crown.webp`** — корона. Subject: a shiny gold royal crown with a band and six points each tipped with a small gold ball, a round red ruby in front and two round green emeralds at the sides.
  - исходник `exec-74731f50-e343-4d7c-9605-92f34ec04a19.png` (папка Codex `01a12b4b-f3ec-7073-b6f0-ada38359614f`, 1254x1254, sha256 dd49108647a6…), в игре 13 КБ
- **`wd-h-fool.webp`** — колпак дурака. Subject: a jester's fool cap: a rounded cap split into a red half and a green half with a golden-yellow band, and three floppy curving horns in red, green and golden yellow, each ending in a small gold jingle bell.
  - исходник `exec-2953a878-d317-467e-a547-b4b141dea7e2.png` (папка Codex `01a12b4c-e960-7932-8025-b2d8c1a11ebc`, 1254x1254, sha256 e1d950026abf…), в игре 13 КБ
- **`wd-a-scarf.webp`** — шарф. Subject: a cozy chunky knitted scarf with red and cream stripes, looped into a ring with two short hanging ends.
  - исходник `exec-f7e2aff2-499c-41e6-8204-ed9f66d91244.png` (папка Codex `01a12b4d-28e8-78e2-96eb-e0249954ef14`, 1254x1254, sha256 294966ee534c…), в игре 14 КБ
- **`wd-a-bowtie.webp`** — бабочка. Subject: a classic raspberry-red satin bow tie with a darker red center knot, plain with no pattern.
  - исходник `exec-30c1c5fd-f6a3-4a12-a3f2-fcffdfc2a45f.png` (папка Codex `01a12b4d-a87f-78e2-ad3a-958e7b253cc9`, 1254x1254, sha256 0f4626b1168f…), в игре 7 КБ
- **`wd-a-headphones.webp`** — наушники. Subject: chunky over-ear headphones with a slim dark-grey headband, bright cobalt-blue ear cups and soft black ear pads, three-quarter view.
  - исходник `exec-bd36bbd0-64c0-45be-8ace-ddcffc6beeda.png` (папка Codex `01a12b4e-6bcf-74f1-aa0c-16fd7e555485`, 1254x1254, sha256 b89a0799b826…), в игре 11 КБ
- **`wd-a-chain.webp`** — золотая цепь. Subject: a thick shiny gold chain necklace of chunky links hanging in a U shape with a round plain gold medallion pendant with no engraving.
  - исходник `exec-775a7874-53b1-4652-9a53-1b77ee17464a.png` (папка Codex `01a12b4e-c89e-7263-8103-d9a20c5d6a6f`, 1254x1254, sha256 f2e407d8f754…), в игре 13 КБ
- **`wd-a-epaulets.webp`** — погоны. Subject: a pair of military-style shoulder epaulets side by side: rounded dark charcoal-black pads with a thin gold braid edge, a row of shiny gold bullion fringe hanging from the outer end and a small gold button.
  - исходник `exec-da249b7d-8ebb-403b-8e54-faed6d64a751.png` (папка Codex `01a12b4f-eeb6-7063-8e2d-aa4803499968`, 1254x1254, sha256 a02093fc8c5c…), в игре 14 КБ
- **`wd-a-greengloves.webp`** — зелёные перчатки. Subject: a pair of green gardening gloves with soft green fabric and ribbed knit cuffs, fingers slightly curled, little brown soil smudges on the fingertips and palms.
  - исходник `exec-63b3bd3f-caf4-4aad-9911-e77838fb6e65.png` (папка Codex `01a12b50-55c1-7671-b2f6-af9ae4dcc714`, 1254x1254, sha256 c82112ce1add…), в игре 14 КБ

### Дополнение 4: примерочная, ферма

Нарисованы 11 октября 2026, Codex CLI `codex-cli 0.162.1` (`codex --version`), тем же способом, что «Дополнение 3»: `codex exec`, встроенный `image_gen`, прозрачный фон, одна иконка на вызов, по четыре вызова одновременно, тот же общий стиль и та же обёртка (описаны выше; строка про желейных персонажей не добавлялась — это вещи и питомцы, не желейки). Это картинки 19 вещей фермы для карточек «Примерочной», которые до этого показывали пустую «·»: файл `wd-<слот>-<ключ>.webp` подхватывается сам (`itemArt()` в `client/ui/wardrobe.ts`). Шапки и аксессуары — сама вещь, питомцы — сам зверёк (милый мультяшный, как в игре). Вид взят из `shared/farmdata.ts` (`FARM_WEAR`), `client/render/farmwear.ts`, `client/render/outfitfarm.ts`, `art/farm/MODELS.md` («Косметика», «Питомцы»), `docs/farm/design-v11.md` §12 и превью `art/farm/renders/`.

- **`wd-h-farmcap.webp`** — кепка фермера. Subject: a green trucker-style farmer cap: a rounded green front dome with a bright embroidered cream sprout (two tiny leaves on a thin stem, no letters) on the front, a curved darker-green peak (visor), a checkered dark-and-light green mesh back panel, a small button on top and a little plastic snap strap at the back.
  - исходник `exec-a0010f8b-53e4-4d38-a0b4-cf32ca6bee9e.png` (папка Codex `01a12b7d-4504-7f73-855b-84d193756463`, 1254x1254, sha256 9c029d90e42d…), в игре 10 КБ
- **`wd-h-straw.webp`** — соломенная шляпа. Subject: a classic farmer woven straw hat with a very wide round brim and a soft round crown, coiled braided straw weave, a red cloth ribbon with a small bow on the right side and two loose straws sticking out.
  - исходник `exec-1d4e08c7-316d-4c37-8ee3-c0d04cf7dc64.png` (папка Codex `01a12b7d-450b-7c62-b6fa-23dea56c22b9`, 1254x1254, sha256 09a44e570f0c…), в игре 13 КБ
- **`wd-h-sunhat.webp`** — шляпа-подсолнух. Subject: a soft ochre-tan cotton sun hat with a rounded crown and a floppy brim, with one big cheerful sunflower (bright golden petals, brown seed center, tiny green leaves) attached on its right side.
  - исходник `exec-8cdc4236-fc66-4bc5-b045-54f2fddf71b9.png` (папка Codex `01a12b7d-4508-75c3-9917-cfe3a59d2c22`, 1254x1254, sha256 f59922d05cd0…), в игре 10 КБ
- **`wd-h-goldstraw.webp`** — золотая солома. Subject: a farmer straw hat woven from shiny honey-golden straw braid, wide round brim, rounded crown, with a hat band made of little golden wheat ears and a soft warm gleam on the weave.
  - исходник `exec-5ee17f8a-6901-4809-b659-f09a5576a482.png` (папка Codex `01a12b7d-4504-7a83-9bdd-375995b188a9`, 1254x1254, sha256 c4bba6ae35ff…), в игре 13 КБ
- **`wd-h-leafcrown.webp`** — венец из листьев. Subject: a ring-shaped wreath crown (open in the middle, to be worn on a head) made of overlapping oak and maple leaves in autumn green, orange, red and brown, woven on a thin brown twig band with four small clusters of shiny red berries.
  - исходник `exec-80db9588-545f-471f-a160-fbad530e0ebf.png` (папка Codex `01a12b7f-35ae-7873-a300-7dfb2109b27a`, 1254x1254, sha256 2d18bc57db77…), в игре 18 КБ
- **`wd-h-explorer.webp`** — панама «Исследователь». Subject: a beige canvas explorer bucket hat with a rounded crown and a wide brim, a dark olive band with a checked pattern, a rolled-up pale mosquito net on the brim edge, and a small round brass magnifying glass badge (clear lens, no symbols) pinned on the band.
  - исходник `exec-f9a83057-f68e-4664-8560-818a492d899a.png` (папка Codex `01a12b7f-48c1-7571-b7f4-1ae8e0218b8f`, 1254x1254, sha256 b68bbc9939ca…), в игре 10 КБ
- **`wd-h-nightcap.webp`** — колпак «Ночной дозор». Subject: a cozy knitted striped nightcap with wide deep-violet and cream stripes, a thick cream ribbed rim, a long soft tip drooping down to one side and ending in a pale cream crescent-moon-shaped pompom.
  - исходник `exec-79964c09-7285-44ab-8562-e900ea9e0b85.png` (папка Codex `01a12b7f-a3cd-7b12-a4ea-248e60e67bd9`, 1254x1254, sha256 1fcb7dac2ca2…), в игре 14 КБ
- **`wd-h-oldgardener.webp`** — шляпа «Старый садовник». Subject: a worn soft brown felt gardener hat with a dented crown crease and pinched sides, a dark brown band, a short gray-and-cream feather tucked in on the left and a yellow pencil tucked behind the band on the right, slightly scuffed and friendly.
  - исходник `exec-8d998fc6-8d16-41c5-81b6-ff33135e5c18.png` (папка Codex `01a12b7f-b9bf-77d1-b559-c99e7d601652`, 1254x1254, sha256 56d9c239a626…), в игре 10 КБ
- **`wd-h-pigears.webp`** — шапка со свиными ушами. Subject: a cute pink knitted beanie cap with two floppy droopy pig ears (darker pink inside) on top and a small round pink piggy snout with two nostril dots on the front, knit texture, cheerful and funny.
  - исходник `exec-28d00850-ae4e-44fd-8902-374fa8653d3b.png` (папка Codex `01a12b81-158b-7c71-9243-714db41023d5`, 1254x1254, sha256 9044a693ba35…), в игре 13 КБ
- **`wd-a-apron.webp`** — фартук «Торгаш». Subject: a cream-tan canvas gardener's apron laid out, with a chest bib, a neck strap, waist ties with a bow, two big front pockets with brown stitching, and a bright orange carrot with green leafy top sticking out of the right pocket.
  - исходник `exec-88362815-a8c5-49a1-8ecd-e894f173a719.png` (папка Codex `01a12b81-341f-7fe0-8374-53f9ec4cd748`, 1254x1254, sha256 b89b570bafd0…), в игре 14 КБ
- **`wd-a-alarm.webp`** — будильник «Тик-так». Subject: a round copper alarm clock with two small bell domes on top, a hammer between them, a cream clock face with simple black hands (no numbers, just small dot marks), two tiny legs, and a brown leather strap loop attached on both sides.
  - исходник `exec-a22ee99f-5743-4271-b106-cf7c06db5649.png` (папка Codex `01a12b81-a09f-7822-9a55-f71c10b88afe`, 1254x1254, sha256 8c13f4b56b4d…), в игре 15 КБ
- **`wd-a-basket.webp`** — корзинка гостинцев. Subject: a round woven wicker basket with an arched handle, filled with a few red apples and a golden pie covered by a red-and-cream checkered napkin hanging over the edge.
  - исходник `exec-648fce39-8a3b-49e6-84d3-f9d39e7edfe7.png` (папка Codex `01a12b81-c47a-7600-ac75-a23c90e2c94d`, 1254x1254, sha256 d4a736130bfa…), в игре 18 КБ
- **`wd-a-bee.webp`** — пчёлка на плече. Subject: a cute fuzzy round bumblebee with black-and-golden stripes, tiny clear pale wings, little antennae, a friendly face with two small dark eyes and tiny legs, hovering, shown alone.
  - исходник `exec-8bcb9f54-7e53-4ef3-8148-57f4d0c5bf73.png` (папка Codex `01a12b82-a95a-77a3-a503-b868fb2252d4`, 1254x1254, sha256 914ac6a45346…), в игре 13 КБ
- **`wd-a-canpack.webp`** — рюкзак-лейка. Subject: a backpack shaped like a big copper watering can: a round copper body with a riveted band, an arched copper top handle, a long thin spout rising up, and two brown leather shoulder straps with a chest strap, seen from the back three-quarter view.
  - исходник `exec-675ceabc-a11d-4629-839c-aecdd04643f7.png` (папка Codex `01a12b82-e96e-7b82-9e43-58135e19c91f`, 1254x1254, sha256 3973de2f7b58…), в игре 14 КБ
- **`wd-s-chick.webp`** — цыплёнок «Пик». Subject: a cute fluffy round yellow baby chick, big shining dark eyes, a small orange beak, stubby orange legs and feet, tiny wings, a little tuft of feathers on its head, standing, extremely cute.
  - исходник `exec-09153422-122b-4a95-9568-82f67deee1ea.png` (папка Codex `01a12b83-9f42-79a3-bee9-e9a2ff789919`, 1254x1254, sha256 4d390838f1c7…), в игре 10 КБ
- **`wd-s-piglet.webp`** — поросёнок «Желудь». Subject: a cute chubby pink piglet, big floppy ears, a round pink snout, curly tail, tiny hooves, happy dark eyes, standing, with a green ribbon around its neck holding a little brown acorn.
  - исходник `exec-fe8f3957-f519-48f7-a4fd-93bb54da3634.png` (папка Codex `01a12b83-cb97-7d92-91a2-da259983b1d8`, 1254x1254, sha256 313f0594330b…), в игре 12 КБ
- **`wd-s-beetle.webp`** — жук «Клёпа». Subject: a cute round shiny bronze-green rose-chafer beetle with glossy metallic green wing cases, a few small golden rivet dots on its back, two curved antennae with golden tips, large friendly dark eyes with tiny pink cheeks, six thin dark legs.
  - исходник `exec-018e436a-7dfa-42ed-9a49-5edc1ff7f946.png` (папка Codex `01a12b84-4e39-72e3-bdcd-38bdbce3590e`, 1254x1254, sha256 2180f73975f5…), в игре 13 КБ
- **`wd-s-firefly.webp`** — светлячок в банке «Огонёк». Subject: a clear glass jar with a round cork stopper tied with a twine bow, inside a cute little glowing warm amber-orange firefly with a soft glow and a tiny friendly face hovering above a tuft of green grass.
  - исходник `exec-749b2f09-63a5-4ceb-aa85-0d5ce23eb332.png` (папка Codex `01a12b84-baaf-78f2-a63a-db5ef1ea1bbf`, 1254x1254, sha256 84f176c9d797…), в игре 14 КБ
- **`wd-s-mushroom.webp`** — мини-гриб «Опёнок». Subject: a cute mini mushroom creature with a rounded light caramel-brown cap dotted with tiny brown speckles, a short white stem body with two big dark glossy eyes and pink cheeks under the cap, two little brown stump feet.
  - исходник `exec-996566b6-172b-4055-8bce-eb360718fdbf.png` (папка Codex `01a12b85-736f-7483-a96f-4b97e05e279d`, 1254x1254, sha256 3775cecd66f6…), в игре 10 КБ

Отступление от вида в игре (чтобы не получить сине-жёлтое сочетание): у `wd-h-nightcap` полоски фиолетовые, а не синие, и помпон-месяц кремовый, а не золотой. Остальное — как в игре: у `wd-h-farmcap` зелёная кепка с сетчатым затылком и кремовым ростком, у `wd-h-explorer` свёрнутая сетка на полях и лупа на ленте, у `wd-h-oldgardener` перо и карандаш за лентой, у `wd-h-pigears` розовая вязаная шапка с ушками и пятачком, у `wd-a-apron` морковка в кармане, у `wd-a-basket` яблоки и пирожок под клетчатой салфеткой, у `wd-a-bee` бледные прозрачные крылышки (без голубого оттенка), питомцы нарисованы стоя. У `wd-a-apron`, `wd-a-alarm`, `wd-a-basket`, `wd-a-canpack` — сама вещь без желейки. Перегенераций нет: все 19 — с первого раза.

## Перегенерации

- `keys`: v1 — просто кремовый скруглённый кубик, на 48 px не читался как клавиша → v2 с тёмной ножкой и квадратной пластиной под колпачком (он в игре).
- `pumpkin-boss`: v1 — рыжая тыква-фонарь со светящимся вырезанным лицом и красными потёками (выглядит мрачно, потёки как кровь) → v2 добрый ворчун-король с ножками, короной и лозами-руками (он в игре).
- Остальные 146 — с первого раза, без правок.

## Слабые места (оставлены как есть)

- `pin` — нарисована кнопка-кнопка (канцелярская булавка с красной шляпкой), а не картографическая метка; на 48 px читается как «точка/место», для «где ты» подходит.
- `fog` — лампа в клубах тумана; на 48 px туман сливается с лампой, но силуэт «лампа в дымке» узнаётся.
- `landing` — лодка с пятью зомби-желейками; на 48 px зомби мелкие, читается как «лодка с зелёными».
- `bloater` — раздутый шар со швами и брызгами варенья: на 48 px читается как красно-оранжевый воздушный шар-зомби; швы и брызги слегка «кровавые», но мультяшные.
- `armored` — «чугунок»: кроме кастрюли-шлема и колец-лат в руках деревянная ложка и крышка-щит (лишнее, не мешает).
- `leshy` — мелкая детальная коряга с рогами и ягодами; на 48 px — «ходячее дерево», от `rift-tree` отличается рогами и руками.
- `elite` — золотой пояс чемпиона (как пояс элиты на модели зомби), без лица: на 48 px читается как «золотая награда».
- `chat` — пустой кремовый пузырь без контрастной заливки: на светлом фоне интерфейса сливается, на тёмной плашке виден хорошо.
- `wd-e-glasses`, `wd-e-monocle` — тонкая коричневая оправа очков и тонкое золотое кольцо монокля с цепочкой; на 48 px линии тонкие, но силуэт «очки» и «монокль на цепочке» узнаётся.
- `wd-e-angry`, `wd-e-happy` — у лиц-желеек рядом с мордочкой видны мягкие руки-варежки (строка про желейных персонажей); на 48 px это просто выступы по бокам, лицо читается.
- `wd-h-sailor`, `wd-h-crown`, `wd-a-epaulets` — у вещей в игре тёмно-синие детали рядом с золотом (кокарда, боковые камни, подушки): чтобы не получить сине-жёлтое, нарисованы чёрными и зелёными (см. «Дополнение 3»).
- `wd-h-straw`, `wd-h-goldstraw`, `wd-h-sunhat` — три соломенно-охристые шляпы с широкими полями, силуэты близки; на 48 px различаются деталями: красная лента с бантом, лента из колосьев и крупный подсолнух сбоку.
- `wd-h-leafcrown` — замкнутый венок из осенних листьев и красных ягод (как кольцо на макушке в игре): на 48 px читается как «осенний венок».
- `wd-a-canpack` — на 48 px в первую очередь «медная лейка»; лямки рюкзака и грудная перемычка — тонкие коричневые линии сбоку и сзади.
- `wd-s-beetle` — тонкие тёмные лапки и усики на 48 px сливаются; блестящий зелёный панцирь с золотыми заклёпками и мордочка с розовыми щёчками узнаются.
- `wd-s-firefly` — стеклянная банка почти бесцветная, на светлом фоне стекло едва заметно; пробка со шпагатом, трава и тёплый янтарный светлячок читаются.

## Сводка

`_sheet.png` — все 148 иконок сеткой 8 × 19: слева 128 px, справа вверху 48 px, id внизу; номер справа — порядковый номер в списке. Фон листа кремовый, чтобы был виден край иконок.

# Иконки интерфейса TIREDWOOD (client/assets/ui/icons)

Нарисованы 11 октября 2026 через Codex CLI v0.153.4 (`codex exec`, встроенный `image_gen`, прозрачный фон), **одна иконка на вызов**, по три вызова одновременно, без рисования кодом и без правок руками. Ключей не запрашивали — у Codex своя авторизация.
Всего 88 иконок: Оболочка (интерфейс, меню, HUD) — 23, Рыбалка — 14, Крепость — 14, Другие режимы и события — 22, Дополнение: ферма, картинг, крепость — 15. Сводка — `_sheet.png` (каждая иконка 128 px и 48 px, id под ней; подписи и номера наложены скриптом, не генератором).

Тот же способ, что у иконок фермы (`client/assets/farm/icons/PROVENANCE.md`). Стиль сверен с иконками фермы, крепости и лавки рыбака: рисованная «сказочная» манера, тёплое солнце слева сверху, тонкий тёмно-коричневый контур. Без надписей и цифр, без сине-жёлтого, без sci-fi и неона. Список взят из задания «UI icons» (id — смысл — Subject); в задании было «~70», в списке 73 id — нарисованы все.

## Формат

- **256×256 WebP с альфой** (качество 0,82), прозрачный фон; как у иконок крепости (`client/assets/fort/*.webp`). Всего 1058 КБ (по 6–20 КБ на иконку).
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

Для иконок с желейными персонажами (`token`, `online`, `zombie`, `climber`, `brute`, `champion`, `boss`, `landing`) в конец общего стиля добавлялась строка:

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

## Перегенерации

- `keys`: v1 — просто кремовый скруглённый кубик, на 48 px не читался как клавиша → v2 с тёмной ножкой и квадратной пластиной под колпачком (он в игре).
- Остальные 87 — с первого раза, без правок.

## Слабые места (оставлены как есть)

- `pin` — нарисована кнопка-кнопка (канцелярская булавка с красной шляпкой), а не картографическая метка; на 48 px читается как «точка/место», для «где ты» подходит.
- `fog` — лампа в клубах тумана; на 48 px туман сливается с лампой, но силуэт «лампа в дымке» узнаётся.
- `landing` — лодка с пятью зомби-желейками; на 48 px зомби мелкие, читается как «лодка с зелёными».
- `chat` — пустой кремовый пузырь без контрастной заливки: на светлом фоне интерфейса сливается, на тёмной плашке виден хорошо.

## Сводка

`_sheet.png` — все 88 иконок сеткой 8 × 10: слева 128 px, справа вверху 48 px, id внизу; номер справа — порядковый номер в списке. Фон листа кремовый, чтобы был виден край иконок.

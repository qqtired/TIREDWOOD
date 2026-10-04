# «Сокровища Посейдона» (04.10, патч «прогресс рыбака»)

Картинка клада для карточки улова (`client/lobby/fishtreasure.ts`): сундук с трезубцем и золотым сиянием.

- Нарисовано: Codex CLI v0.153.4 (`codex exec --skip-git-repo-check -s workspace-write -C <папка> "<промпт>"`), встроенный
  инструмент `image_gen` с прозрачным фоном, один вызов, без правок руками и без референсов. Стиль — как у рыб и вещей лавки
  (`../fish/FISHECO-PROVENANCE.md`): натуралистичная рисованная иллюстрация справочника; без надписей (кириллицу генератор
  пишет с ошибками).
- Исходник: `poseidon.png`, 1199×1312, прозрачный фон, sha256 `b06118bf…f6e80` (в репозиторий не положен — 1,7 МБ).
- Промпт (после обёртки «Use your built-in image generation tool to generate the following image on a genuinely
  transparent background (transparent_background true). Do not write code to draw it and do not edit any other files.»):

  > A single sunken-treasure chest, "Poseidon's treasure": a heavy old oak chest with a rounded lid, wide verdigris-bronze
  > and gold bands and corner plates, a little coral, barnacles and a small seashell stuck to its sides; the lid stands
  > slightly open and a warm golden glow with a few soft golden light rays pours out of the opening over a heap of gold
  > coins; a tall golden three-pronged trident stands upright behind the chest, its shaft leaning against the back of the
  > chest, gold with a sea-green wrapped grip. Three-quarter front view, the whole object centered with some margin,
  > nothing cut off. Naturalist hand-painted illustration in the style of a field-guide, cheerful soft daylight colors,
  > rich warm gold, no text, no letters, no symbols, no frame, no background scene, no water.
  > Then save the generated image as poseidon.png in the current working directory.

- Обработка (headless Chrome, canvas): обрезка по непрозрачному с полем 1,2 %, уменьшение до 384 px по высоте (312×384),
  альфа ≥245 → 255 и ≤4 → 0, `toBlob('image/webp', 0.9)` → `poseidon.webp`, 40 168 байт, sha256
  `df627c301a5e3d7d588b955dffa29d4f86dd80763b03044b3b2b6269c1ba1918`. Углы прозрачные, доля прозрачного — 61 %.
- Проверено глазами на тёмной карточке игры: один предмет целиком, без текста и лишних предметов; лучи и золотое сияние
  сверху (в игре к ним добавлены лучи CSS, `client/lobby/fishtreasure.css`).

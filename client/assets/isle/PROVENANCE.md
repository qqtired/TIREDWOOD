# Остров «Последний свет» — модели и картинки в игре (10.10.2026)

## Проходимая версия v2 (11.10.2026)

- `island-terrain.glb`, `pier-breakwater.glb`, `lighthouse.glb` исправлены собственным воспроизводимым Node-скриптом
  `tools/isle-rework/rework.mjs` из сохранённых v1 GLB. Исходные Blender-скрипты и `.blend` не перезаписаны.
  Абсолютный архив: `/Users/tired/Desktop/tired.solutions/concepts_blender/fishing-island/v2-2026-10-11/`:
  `v1-source/`, три `*-v1.blend`, `v1-glb/`, `v2-glb/`, `rework-code/`, `rework-summary.json`.
- Изменены только настил и восемь ступеней входа мола, подложки старых деревянных мостков/понтона, лестница к маяку
  (ширина 2,4 м, ступени до 0,2 м, начало по измеренной земле), узкая земля под лестницей и площадка перед Игнатом.
  Башня, фонарь/линза, дальний силуэт, Игнат, здания, рыба/сезон, 16 пустышек высадки/бертов/ловли/огня сохранены.
- Физика поверхности — настоящие треугольники этих GLB (`shared/maps/isleterrain-data.ts` и `isleterrain.ts`),
  индекс 2 м. `tools/isle/collision.mjs` создаёт только боксы физического настила высадки, домов, грузов, огня и перил;
  искусственных ступеней и невидимых стен по периметру холмов больше нет.
- Повторяемые карты земли/камня переиспользованы из `client/assets/plaza3/ground/` (`lawn`, `sand`, `gravel`,
  `quay-ashlar-v2`), источник и image_gen-промпты — их `PROVENANCE.md`. Новые растровые картинки не генерировались.
  `client/lobby/isle/surfaces.ts` сохраняет приглушённые цвета острова, раскладывает UV в метрах и добавляет ровно
  восемь бронзовых накладок по существующим `fish_0…7`; дальний силуэт исключён. Новых ламп нет.
- Воспроизведение: Node 24, `node tools/isle-rework/rework.mjs /absolute/path/to/preserved-v2`, затем
  `node tools/isle/collision.mjs`. До первого запуска в `v1-glb/` должны лежать исходные v1 GLB; при отсутствии
  каталог заполняется текущими ассетами один раз и больше не перезаписывается.

Перенесены без изменений со страницы ревью (`lab/fishing-review/`), где описано всё подробно:

- **Модели острова** — `island-terrain.glb`, `lighthouse.glb`, `pier-breakwater.glb`, `houses.glb`, `keeper-house.glb`,
  `cannery.glb`, `schooner-wreck.glb`, `props.glb`: свои, построены кодом в фоновом Blender 5.2.2 (bpy/bmesh), чужих и
  сгенерированных мешей и текстур нет. Скрипты и `.blend` — `~/Desktop/tired.solutions/concepts_blender/fishing-island/`,
  подробности (узлы, пустышки, материалы, таблички, бюджет) — `lab/fishing-review/models/island/PROVENANCE.md`.
- **Смотритель Игнат** — `ignat.glb`: своя модель (Blender, bpy/bmesh), анимации `idle` и `wave`; подробности —
  `lab/fishing-review/cosmetics/PROVENANCE.md` (раздел «Смотритель Игнат»).
- **Экран загрузки** — `loading.webp` (= `lab/fishing-review/img/isle-loading.webp`, 1280×720) и **фон доски сезона** —
  `season-board.webp` (= `isle-season-board.webp`, 1024×568): нарисованы Codex CLI (`codex exec`, встроенный
  `image_gen`), без надписей (текст доски пишет игра канвасом). Промпты, обрезка и SHA-256 —
  `lab/fishing-review/img/ISLAND-PROVENANCE.md` и `ISLAND-PROVENANCE.json`.

## Как это в игре

- Координаты GLB — от центра острова, вода на h 0. В мире: `(ISLE_CENTER.x + u; WATER_Y + h; ISLE_CENTER.z + v)`
  (`shared/maps/isle.ts`; актуальный центр берётся оттуда, абсолютные координаты не зашиты в v2 поверхности).
- Коллизия v2: точная поверхность GLB — `shared/maps/isleterrain*.ts`, боксы физических сооружений —
  `tools/isle/collision.mjs` → `shared/maps/isleboxes.ts`. После изменения моделей обновлять обе части.
- Рисует `client/lobby/isle/island3d.ts`: неподвижное склеено по материалу, таблички — один атлас, свет маяка и огни
  буёв — кодом (спрайты и шейдер), новых ламп нет.

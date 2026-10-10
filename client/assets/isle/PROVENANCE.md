# Остров «Последний свет» — модели и картинки в игре (10.10.2026)

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

- Координаты GLB — от центра острова, вода на h 0. В мире: `(−2364,9 + u; −1,25 + h; 557,6 + v)`
  (`shared/maps/isle.ts`).
- Коллизия (невидимые коробки) построена из этих GLB скриптом `tools/isle/collision.mjs` →
  `shared/maps/isleboxes.ts`. Поменяли модели — перезапустить: `node tools/isle/collision.mjs`.
- Рисует `client/lobby/isle/island3d.ts`: неподвижное склеено по материалу, таблички — один атлас, свет маяка и огни
  буёв — кодом (спрайты и шейдер), новых ламп нет.

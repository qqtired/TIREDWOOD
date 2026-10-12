# Высокая башня: runtime v1, 12.10.2026

`tower-course-v3.glb` — неизменённый принятый Blender-источник из
`reports/tiredwood-product-lab-v2-2026-10-12/models/glb/tower-course-v3.glb`.
SHA-256: `21b87e786e2f16804f57371785a00a1df215fe5e9c4726682373204e0769ed98`.
Исходный `.blend` и воспроизводимые `build_kits.py`, `v2_modes.py`, `labcore.py`, `contracts.json`
сохранены в том же обзоре под `models/blender/` и `models/source-v1/tower-course-v3/`.
Принятый render — `models/renders/tower-course-v3.png`; это концепт, не снимок игры.

Игровая адаптация — `client/skilltest/model-source.ts`: из объединённой статики извлекает целые
связные детали корпуса в радиусе 9,32 м. Планировочные наружные настилы/подкосы исключаются.
Коллизии и видимый игровой путь — `shared/skilltower.ts` / `client/skilltest/cloudworld.ts`.
Люльки, воздушные шары и мешки используют настоящие части того же GLB.
`test/skill-cloudtower-model.test.ts` проверяет хеш, отделение корпуса и наличие экспортированной геометрии.

`material-atlas-v1.png` — новый материал через Codex CLI, встроенный `image_gen`, без API-ключа.
Оригинал и receipt: `/tmp/cloudtower-texture-20261012/` (постоянный финальный PNG здесь).
Четыре четверти: дерево / штукатурка / терракотовый кирпич / ткань.
В игре атлас выбирается по четвертям в материале, не используется как картинка фона.

Промпт:

> Square 2048x2048 diffuse albedo texture atlas, 2 by 2 equal seamless tile quadrants, no gaps,
> borders, words, watermark or perspective. Top-left: warm pale honey timber grain on broad
> clean wooden boards, subtle seams, tactile grain, stylized hand-painted seaside park.
> Top-right: warm ivory limestone plaster, fine uneven mineral grain, faint weathering.
> Bottom-left: weathered terracotta red brick with light warm narrow mortar, consistent small
> blocks, restrained contrast. Bottom-right: natural oatmeal woven canvas, fine fabric weave,
> no folds or shadows. Flat neutral lighting, no directional shadows, highlight or AO.
> Restrained contrast, sharp but not photorealistically noisy; sunny Black Sea resort game.

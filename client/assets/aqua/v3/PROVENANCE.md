# Аквапарк «Волна»: набор v3

`aqua-kit-v3.glb` — неизменённая копия принятого набора из
`reports/tiredwood-product-lab-v2-2026-10-12/models/glb/aqua-kit-v3.glb`.
SHA-256: `2ce4602576be54cafaeb365ff1b785f9092697a8b58d20e7ce9520e36bbe8048`.

Исходник Blender: `models/blender/aqua-kit-v3.blend` в том же неизменяемом обзоре.
Генератор: `source/model-build/v2_modes.py`, `aqua()`, `make_slide()`,
`inflatable()` и `aqua_full_overview()`; библиотека — `labcore.py`.
Подтверждение headless Blender MCP: `models/evidence/mcp-aqua-kit-v3.json`,
проверки — `models/evidence/aqua-kit-v3-checks.json`.

Формы, светлая палуба, мятные борта, коралловые механизмы и деревянные рамы
взяты из этого набора. Игровая адаптация — `client/lobby/aquamodels.ts`:
локальные узлы, масштаб по общим коллизиям, плавучая нижняя часть, скат по
`shared/aqua.ts`, длины труб/мешков по `shared/aquadyn.ts`. Демонстрационные
клипы не управляют игрой: все движения зависят от метки входа игрока.

Фактура ПВХ переиспользует процедурную `drawPvc` с ослабленным контрастом
и рельефом 0.014 м; дерево — существующую `plankTexture`. Новые изображения
и сторонние наборы не использованы. Предыдущие исходники не перезаписывались.

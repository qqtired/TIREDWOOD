# Модели павильонов новой набережной (WP9)

`pav_*.glb`, `pb_props.glb`, `kit_*.glb` — копии из `concepts_blender/plaza3/pavilions/models/` (Blender, без текстур:
цвет в вершинах, материалы `p3_matte` / `p3_gloss` / `p3_glow` / `p3_foliage`). Исходники, рендеры и привязки — там же:
`README.md` + `manifest.json` (арены, курзал, кафе, порт, пляж), `README-gq.md` + `manifest-gq.json` (игровой квартал),
`README-pb.md` + `manifest-pb.json` (старый маяк, «Рыбная витрина», предметы порта).

Обновить: скопировать свежие `.glb` из той папки сюда, затем `node --test test/plaza3-pavilions.test.ts`
(поля, якоря и твёрдое `layout.json` против `col_*`). Места в игре — `client/lobby/plaza3/pavdata.ts`.

## Версии моделей
Исходные Blender-модели (v1) не перезаписываются: снимок — `concepts_blender/plaza3/v1-2026-10-11/` (только чтение).
Здесь лежат v1 как есть, кроме перечисленных ниже v2:

- `pav_rats.glb` — v2 (11.10.2026): уголок букмекера и трибунки перенесены на понтон, чтобы не стоять в «Рыбной витрине».
- `pav_swallow_gate.glb` — v2 (11.10.2026): без пустой подвесной доски статуса под вывеской «Ласточка» (`concepts_blender/plaza3/v2/README.md`).

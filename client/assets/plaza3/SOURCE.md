# Модели павильонов новой набережной (WP9)

`pav_*.glb`, `pb_props.glb`, `kit_*.glb` — копии из `concepts_blender/plaza3/pavilions/models/` (Blender, без текстур:
цвет в вершинах, материалы `p3_matte` / `p3_gloss` / `p3_glow` / `p3_foliage`). Исходники, рендеры и привязки — там же:
`README.md` + `manifest.json` (арены, курзал, кафе, порт, пляж), `README-gq.md` + `manifest-gq.json` (игровой квартал),
`README-pb.md` + `manifest-pb.json` (старый маяк, «Рыбная витрина», предметы порта).

Обновить: скопировать свежие `.glb` из той папки сюда, затем `node --test test/plaza3-pavilions.test.ts`
(поля, якоря и твёрдое `layout.json` против `col_*`). Места в игре — `client/lobby/plaza3/pavdata.ts`.

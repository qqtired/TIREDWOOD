# Иконки вывесок новой набережной (client/assets/plaza3/icons)

22 иконки — копии из набора интерфейса TIREDWOOD (ветка `mode/ui`, `client/assets/ui/icons/`, в лаборатории UI-треда —
`lab/ui/img/icons/ui/`). Набор нарисован 11 октября 2026 через Codex CLI (встроенный `image_gen`, прозрачный фон),
по одной иконке на вызов, без надписей и без правок руками; полный промпт, общий стиль и список — в
`client/assets/ui/icons/PROVENANCE.md` той ветки. Здесь файлы без изменений: 256×256 WebP с альфой, 6–20 КБ.

Какая иконка на какой вывеске — `SIGN_META` в `client/lobby/plaza3/signstyle.ts`:
`paint` пейнтбол · `horn` крепость · `kart` картинг · `bell-cloud` «Выше облаков» · `dungeon` подземелье ·
`hide-box` «Рыбный двор» · `boat` «Ласточка» · `regatta` регата · `lighthouse` маяк и рыбалка · `quest-fish` лавка Семёна ·
`rat` крысиные бега · `slide` аквапарк · `wardrobe` примерочная · `compass` аэроклуб · `token` автоматы и аркада ·
`scroll` кафе · `cards` карты · `music` ротонда · `ticket` колесо обозрения · `records` доска почёта · `online` «Кто на
набережной» · `farm-gate` «Огороды» и калитка фермы.

Бильярдного шара в наборе нет: значок `ball` для вывески «Бильярд» рисуется кодом (`drawBall` в `signs.ts`).

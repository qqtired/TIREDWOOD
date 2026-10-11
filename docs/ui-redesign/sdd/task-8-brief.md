### Task 8: Остальные режимы и общий верх у любимых экранов

Эталон: `lab/ui/screens/modes.js` — картинг, регата, пейнтбол, прятки, «Выше облаков», пираты, шторм, аквапарк, крысиные бега,
рулетка, «как есть + общий верх» (дурак, блэкджек, бильярд, Подземелье). Инвентарь: `D-modes-refs.md` часть 2.

**Files:**
- Modify: `client/race/hud.ts` + `styles.css:3729-4510`, `client/lobby/regattahud.ts|regatta.css`, `client/paintball/hud.ts`
  + `styles.css:119-1223,6083-6247` (кроме `.fort-hud`), `client/hide/hud.ts|hide.css`, `client/skilltest/hud.ts|skilltest.css`,
  `client/lobby/piratehud.ts|pirates.css`, `client/lobby/ratracehud.ts|ratrace.css`, `client/lobby/plane*.ts|plane.css`;
  у дурака/блэкджека/бильярда/Подземелья — только кнопки выхода/ставок на `.k-btn`, клавиши `.k-key`, их верх не конфликтует
  с бейджем ВП (сдвинуть свои правые панели под бейдж 44 px).

- [ ] **Step 1:** Общие для режимов детали на ките: карточка места (`mo-stand`), список (`mo-list`), счёт команд (`mo-score`),
  ленты, итоги (одна функция по образцу `results()` из `modes.js`) — в `client/ui/kit/modes.ts|css` (переносит ведущий из
  `lab/ui/screens/modes.css` по запросу группы).
- [ ] **Step 2:** Каждый режим — по своей сцене; иконки предметов картинга `kart-turbo/jam/bubble/clap`, пейнтбол `marker`.
- [ ] **Step 3:** Любимые экраны — проверить, что бейдж/чат-док/тосты ВЦ не налезают; их вид не менять.
- [ ] **Step 4: Проверка** — `/go race|regatta|paintball|hide|skill`; снимки каждого режима и итогов; дурак/блэкджек/бильярд/
  Подземелье — по одному снимку «как есть + общий верх».
- [ ] **Step 5: Commit** — `git commit -m "ui: режимы на ките, общий верх у карт, бильярда и Подземелья"`


# Task 1 — кит 2.0 в клиенте: отчёт

**Статус:** DONE_WITH_CONCERNS · коммит `c48c0e9` «ui: кит 2.0 в клиенте — токены, компоненты, иконки, масштаб, звуки» в `mode/ui`
(worktree `/Users/tired/Desktop/game-opus-ui`, не пушил).

## Что сделано

- `client/ui/kit/scale.ts` — `hudScale(vw, vh, uiScale)` и `bindHudScale(root, getUiScale)` ровно по брифу.
- `client/ui/kit/tokens.css` — из **закоммиченного** `lab/ui/kit/tokens.css` (HEAD, 362 строки): общий `:root`, пары
  `:root, [data-skin]` (h ← w), блок `:root, [data-skin='retro2']`, раздача контекстов (`.k-scrim/.k-window` и HUD-детали)
  и акценты `[data-mode=…]`. Без `@font-face`, без beach/dusk. По сообщению ведущего — retro2 дословно:
  `--font-display: 'Rubik Mono One', …; --display-weight: 400; … --display-word: -.3em`. Разделение `--h-*` / `--w-*` / `--plate-*`
  не трогал — блок `[data-hud]` можно положить следом (так и написано в шапке файла).
- `client/ui/kit/kit.css` — дословно из HEAD, после шапки добавлено `#hud, #menus { zoom: var(--hud-k, 1); }`.
  `client/ui/kit/combat.css` — дословно. Картинок `url(...)` в CSS кита нет — переменные не понадобились.
- `client/ui/kit/icons.ts` — `uiIcon(id)` по брифу (glob 88 webp).
- `client/ui/kit/dom.ts` — `h()`, `keyHtml(k, corner, size)` → `k-key k-key--sm k-key--tr`, `coinHtml(cls)` — `COIN_HTML` из
  `ui/coin.ts` с классом `k-coin` вместо `coin`, `iconImg(id, cls = 'k-ic')` (нет файла — `''`; `cls=''` — голая `<img>` для
  `.k-tile-face`/`.k-toast-ic`), `meterHtml(v, tone, cls)` — `<span class="k-meter k-meter--tone …" style="--v:…">` с ghost/fill, как в page.js.
- `client/ui/kit/sfx.ts` — `lab/ui/kit/sfx.js` на TS без своего `AudioContext`: `sfx.attach(sound.kit)` создаёт свой gain 0,16 →
  шина `ui` игры (значит, слушается общей громкости, «Без звука», ползунка «Интерфейс», лимитера мастера); `sfx.enabled` —
  простое поле, его ставит `App.applySettings` из `settings.uiSounds`; глушение повторов 40 мс сохранено.
  `bindClickSounds(root)` — один делегированный обработчик на слой: `[data-sfx], .k-btn, .k-tab, .k-close, .k-seg > button`
  (`data-sfx` задаёт свой звук, `.k-close` → close, `.k-tab` → tick, остальное → click). Старые кнопки игры молчат.
- `client/settings.ts` — `uiSounds: boolean`, по умолчанию `true`, нормализация `s.uiSounds !== false` (как `keyHints`).
- `client/ui/menu/settings-panel.ts` — строка «Звуки интерфейса» / «Тихие щелчки кнопок, вкладок и наград» в «Звук»
  (после ползунка «Интерфейс»); `applyInterface` вместо `--ui-scale` ставит `--hud-k = hudScale(innerWidth, innerHeight, s.uiScale)`
  — выбор «Размер интерфейса» применяется сразу, без ресайза.
- `client/ui/menu/menu.css` — убраны три `zoom: var(--ui-scale)` (`.mn-card`, `.mn-veil`, `.chat/.tokens/.toasts/.online-list`).
- `client/app.ts` — в конструкторе `bindHudScale(document.documentElement, () => this.settings.uiScale)`, `bindClickSounds(shell)`,
  `bindClickSounds(menus)`; `sfx.attach(this.sound.kit)` сразу после `this.sound.unlock()` в `play()` (клик «Играть») и в `resume()`
  (на случай, если в `play()` контекст ещё не `running` — тогда `kit` = null); `sfx.enabled = s.uiSounds` в `applySettings()`.
- `client/startup-game.ts` — `@fontsource/rubik/600.css`, `800.css` (по порядку 400…900), `@fontsource/rubik-mono-one/cyrillic-400.css`
  и `latin-400.css`, затем `./ui/kit/tokens.css`, `kit.css`, `combat.css` — до `./styles.css`.
- `index.html` — `<html lang="ru" data-skin="retro2">`.
- Вне списка брифа (строго нужно): `test/menu-settings.test.ts` — в ожидаемый объект настроек добавлено `uiSounds: true`
  (тест сверяет полный набор полей; без этого падал).

## TDD

RED — `node --test test/ui-kit.test.ts` до `scale.ts`:
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/Users/tired/Desktop/game-opus-ui/client/ui/kit/scale.ts' imported from .../test/ui-kit.test.ts
ℹ pass 0  ℹ fail 1
```
GREEN — после `scale.ts`:
```
✔ масштаб HUD: 1440×900 — 1, 2K — 1,6, маленький экран — не меньше 0,8 (0.73ms)
ℹ pass 1  ℹ fail 0
```
Итог один раз перед коммитом: `npm run check && npm test && npm run build` → exit 0; tests 1720, pass 1720, fail 0; сборка
`✓ built in 1.04s` (шрифты Rubik Mono One в `dist/assets`). Первый прогон `npm test` упал на `test/menu-settings.test.ts`
(новое поле) — поправлено, см. выше.

## Проверка в headless Chrome

Свой Chrome (порт 9496, свой профиль, lock `ui/chrome.lock`), сервер — уже запущенный для этого worktree на 3106 (PID 66400, не мой,
не трогал). Ники Tester73 / Tester74 (Tester7 оказался занят другой сессией). Снимки — `scratchpad/ui/shots/t1/`:
- `before-1440x900-plaza.png` / `after-1440x900-plaza.png` — площадь 1440×900 одинаковая (`--hud-k` = 1): жетоны, чат, полоска эмоций,
  плашка события — те же размеры и места.
- `after-1440x900-menu-sound.png`, `after-2560x1440-menu-sound.jpg` — меню Esc → Звук, новая строка «Звуки интерфейса» (вкл).
- `after-2560x1440-plaza.jpg`, `after-2560x1440-join.jpg` — 2560×1440: `--hud-k` = 1,6, `zoom` #hud и #menus = 1,6 — чат, жетоны,
  эмоции, меню и экран входа крупнее, раскладка та же. (`before-2560x1440-*` — только экран входа: войти не дало «ник занят»;
  видно, какой мелкий был экран входа на 2K.)
- `after-*-kit-probe.*` — проба кита прямо в игре: окно `.k-window--sm` из помощников `dom.ts` (иконки journal/records/token
  из `uiIcon`, монетка, `keyHtml`, `meterHtml`, кнопки) — стили, Rubik Mono One в заголовке (`document.fonts.check` = true) работают.
  `sfx.attach(sound.kit)` → `ctx.state = running`, щелчок по `.k-btn` без ошибок.
- Консоль: ошибок и исключений нет ни на 1440×900, ни на 2560×1440.
- Проверка смещения: элемент в `#menus` с `transform: translate(1000px, 500px)` на 2560×1440 встаёт в (1600, 800) — см. замечание 1.

## Самопроверка

- Всё из брифа сделано; классов `.k-*` в игре нет, кроме `.fu-edge.k-boss/.k-boat/.k-crate` в `client/fort/ui/ui.css` — это
  модификаторы крепости, в ките таких селекторов нет → **конфликта нет**. `data-mode` в игре — только у `.tc` (walk/fish/slot/kart/ride),
  с режимами кита не пересекается.
- Переменные: игра сама задаёт на `:root` `--gold` (#ffd35a) и `--line`; styles.css подключён после кита, поэтому у игры остаются
  свои значения, а `--gold` кита на `:root` = игровой #ffd35a (у кита #ffcd4a — почти тот же). `--line` кит раздаёт сам внутри
  `.k-hud/.k-window`. `--focus` кита на `:root` попадает в `object-position: var(--focus, 50% 50%)` экрана загрузки до первого
  заполнения — значение невалидно → то же 50% 50%, разницы нет.
- `icons.ts`/`dom.ts` пока никто не импортирует — в сборку иконки не попадают (вытрясены); появятся с первым экраном на ките.
- `docs/README.md` не трогал: строка карты по плану — в поздней задаче (план, строка 418).
- В `lab/ui/` у ведущего незакоммиченные правки (`kit.css`, `tokens.css`, `page.*`, `index.html`) — переносил закоммиченную
  версию (HEAD), их не трогал и не добавлял в коммит.

## Замечания (важно для следующих задач)

1. **Слои, привязанные к точкам сцены, съедут при `--hud-k` ≠ 1** (а это любой экран, кроме ~1440×900: на 1920×1080 k = 1,2).
   Они ставят элементы в пикселях экрана (`translate(x px)` / `left`) внутри `#hud`, а `zoom` умножает эти пиксели на k
   (проверено: 1000 → 1600 при k = 1,6). Затронуто: цифры урона/золота крепости `client/fort/floaters.ts` (`.ars-floaters`),
   стрелки угроз `client/fort/ui/coach.ts` (`.fu-edges`), пейнтбол `client/paintball/hud.ts` (`.floaters`, `.cross-block`),
   подписи зон `client/dungeon/zones.ts` (`.dgz`), прицел самолёта `client/lobby/plane.ts` (`.pl-aim`). Ещё код, который меряет
   `getBoundingClientRect()` (видимые пиксели) и ставит `left/top` внутри зум-слоя: `client/lobby/durakhud.ts` (дурак!),
   `client/lobby/fishnpcdialog.ts`, `client/dungeon/hud.ts`, `client/race/hud.ts`, `client/boat/boatui.ts`, `client/farm/ui/common.ts`,
   `client/lobby/fishabfx.ts`, `client/fort/ui/index.ts`. Я это **не чинил** (чужие файлы). Дешёвое лечение для первых пяти —
   одна строка в `kit.css`: `.ars-floaters, .fu-edges, .dgz, .pl-aim, .shell .floaters, .shell .cross-block { zoom: calc(1 / var(--hud-k, 1)); }`
   (вернёт их ровно как было); для «меряющих» — делить на k или переносить на кит по плану. Решать ведущему.
2. **Телефон стал мельче:** на телефоне `min(vw/1440, vh/900)` ≈ 0,27 → упирается в MIN 0,8, т. е. весь интерфейс, включая
   экранные кнопки `TouchControls` (они в `#hud`), теперь 80 % от прежнего. Телефон не проверял (бриф не просил).
3. **Rubik 600 и 800 теперь настоящие** — во всей игре ~230 правил с весом 600/800 раньше рисовались 700/900, теперь тоньше.
   На снимках 1440×900 разницы почти не видно, но она есть.
4. `color-scheme: dark` из блока retro2 теперь на `<html>` — нестилизованные системные поля/полосы прокрутки станут тёмными
   (игра и так тёмная; на снимках разницы не заметил).
5. Не масштабируется то, что живёт вне `#hud/#menus`: кнопка голоса внизу слева, счётчик FPS, окно голосования за кик
   (`document.body`) — на 2K они остались прежнего размера (так было и раньше).
6. Подсказка у «Размер интерфейса» («Меню, чат, жетоны, «кто где» и уведомления») теперь неполная — масштабируется весь HUD.
   Не менял; поправить в задаче про меню.

---

## Исправления, раунд 1 — коммит `7f19d60` «ui: кит — zoom только у слоёв кита, масштаб для пальца, звук после разблокировки»

Бриф перечитан после правок плана (`0ba18ed`, `4240751`). Что изменено:

1. **zoom только у слоёв кита** — `client/ui/kit/kit.css`: вместо `#hud, #menus { zoom }` правила брифа с его комментариями:
   `.k-hud, .k-scrim { zoom: var(--hud-k, 1); }`, `.k-world { position: absolute; inset: 0; pointer-events: none; }`,
   `.k-world .k-world-in { transform-origin: center; scale: var(--hud-k, 1); }`. Старые экраны зум больше не трогает.
2. **Палец** — `client/ui/kit/scale.ts`: `hudScale(vw, vh, uiScale, coarse = false)`, `MIN_TOUCH = 0.6`.
4. **Один писатель `--hud-k`** — новая `applyHudScale(root, uiScale)` в `scale.ts` (читает `matchMedia('(pointer: coarse)')`);
   её зовут и `bindHudScale` (старт + resize), и `applyInterface` в `settings-panel.ts`. Больше `--hud-k` никто не пишет.
5. **Старый `--ui-scale` вернул** — `applyInterface` снова ставит `--ui-scale`; `client/ui/menu/menu.css` побайтно как до задачи
   (`git diff c48c0e9^ HEAD -- client/ui/menu/menu.css` — пусто).
6. **Звук лениво** — `sfx.source(get)` в `client/ui/kit/sfx.ts`; `play()` при каждом звуке спрашивает `get()` и подключается
   (`attach`), когда `sound.kit` уже не null (контекст `running`). В `app.ts` в конструкторе `sfx.source(() => this.sound.kit)`,
   ранние `sfx.attach(this.sound.kit)` из `play()` и `resume()` убраны. `attach` остался (интерфейс брифа).
7. **`client/ui/kit/combat.css:75`** — `content: ;` → `content: '';` (нос стрелки угрозы `.k-edge::before` теперь рисуется).
   Копию в lab не трогал.
8. `Object.hasOwn(SOUNDS, own)` вместо `own in SOUNDS`.
3. **Тест** — `test/ui-kit.test.ts`: добавлено `assert.equal(hudScale(844, 390, 1, true), 0.6)`, заголовок
   «… маленький экран — не меньше 0,8, под пальцем — не меньше 0,6».

### Команды и вывод
- `node --test test/ui-kit.test.ts test/menu-settings.test.ts` → `ℹ tests 3 · pass 3 · fail 0`.
- `npm run check && npm test && npm run build` (один раз) → exit 0; `ℹ tests 1720 · pass 1720 · fail 0`; `✓ built in 1.30s`.

### Headless, 1920×1080 (порт 9496, свой PID, `chrome.lock`; сервер 3106 не мой; ник Tester76)
Скрипт `scratchpad/ui/t1-work/check1920.mjs`, снимки `shots/t1/fix-1920x1080-plaza.png`, `fix-1920x1080-kit-probe.png`:
- `--hud-k` = 1.2, `--ui-scale` = 1; `zoom` у `#hud`, `#menus`, `.tokens`, `.mn-card` = 1.
- Старые детали в прежних пикселях: жетоны `.tokens` [x 1805, y 14, 97×39] — справа отступ 18, ширина 97, как на 1440×900 до
  задачи (снимок `before-1440x900-plaza.png`: та же плашка ~97 px и отступ ~18); чат [20, 658, 484×242], эмоции [1516, 1019, 386×43] —
  без увеличения.
- Окно кита `.k-window--sm` в `.k-scrim`: после анимации появления 552×295 = 460 × 1,2; затемнение `.k-scrim` — ровно весь экран [0, 0, 1920×1080].
- `.k-world`: внешний элемент `translate(1000px, 500px)`, внутри `.k-world-in` 20×20 → рамка [998, 498, 24×24] — центр на (1010, 510),
  размер ×1,2, сдвиг не растянут.
- Звук: `sound.kit.ctx.state` = running, ранних `attach` нет; `sfx.play('click')` создал осциллятор (лениво подключился); повторный
  щелчок по `.k-btn` в те же 40 мс заглушён — как задумано.
- Консоль: ошибок нет.

Мои Chrome закрыты, lock отпущен. В коммит вошли только файлы задачи (lab/ui и docs не трогал — там чужие незакоммиченные правки).

### Что осталось из прежних замечаний
- Замечания 1 и 2 (съезд деталей в экранных пикселях, телефон 0,8) сняты: старые экраны не зумятся, у пальца MIN 0,6 только для кита.
- Остаются 3 (настоящие Rubik 600/800 во всей игре), 4 (`color-scheme: dark` на `<html>`) и 6 (подсказка «Размер интерфейса»).
  Замечание 5 больше не про кит: старые экраны вне `#hud/#menus` и так не масштабировались.

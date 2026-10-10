# Карта проекта TIREDWOOD

Указатель для всех помощников (Claude, Codex, Астра) и людей: где лежит любая система и какой документ про что.
Документы карта не заменяет, а отправляет к нужному. Пути сверены с кодом 4 октября 2026. Разошлась с кодом — прав код: поправь карту (раздел 6).

## 1. С чего начать

1. [AGENTS.md](../AGENTS.md) — правила работы, проверки, запреты, чек-лист выкладки. Единственный файл правил: `CLAUDE.md` и `ASTRA.md` — ссылки на него.
2. [product.md](product.md) — как из просьбы в одну строку сделать продуманный результат и держать стиль игры.
3. [STATUS.md](STATUS.md) — что сейчас на сайте и что делать дальше.
4. Эта карта — где что лежит.
5. [design.md](design.md) — как всё устроено, по системам (оглавление в начале). Как играть, команды и флаги — в [README.md](../README.md).

Перед работой с площадью, графикой и сетью прочитай ещё [optimization.md](optimization.md). Лучшие образцы режима — Fight Club, прятки и картинг (в таблице помечены «образец»).

Локальный исследовательский стенд сравнения WebGL/WebGPU — [`tools/render-bench/`](../tools/render-bench/README.md), команды `bench:check`, `bench:build`, `bench:preview`; тесты `test/render-bench-*.test.ts`. В игровую сборку не входит и не означает переход игры с `WebGLRenderer` на WebGPU. План эксперимента — [2026-10-06-render-benchmark.md](superpowers/plans/2026-10-06-render-benchmark.md).

## 2. Карта кода по системам

Как читать:
- Пути в колонках `shared/`, `server/`, `client/` — от этой папки: `lobby/durak.ts` в колонке `server/` — это `server/lobby/durak.ts`. Папка — со слэшем, `*` — все файлы с таким началом. Тест — файл в `test/`.
- **Флаг** — переменная окружения сервера (`server/main.ts`). Без неё режим включён только в `npm run dev`; `FISH2` — только явная `1`. Что включено на сайте — строки `Environment=…=1` в `deploy/game-opus.service`.
- **Документ:** «design» — [design.md](design.md), раздел в кавычках; «README» — корневой `README.md`; «план `тема`» — `docs/superpowers/plans/<дата>-<тема>.md`.
- Своё пиши в новых файлах. В общих (`client/app.ts`, `client/lobby/scene.ts`, `server/hub.ts`, `server/lobby/room.ts`, `shared/messages.ts`, `shared/maps/lobby.ts`) — только короткие подключения (AGENTS §8).
- Корень репозитория: `index.html` — страница игры (экран загрузки уже в HTML); `lab/index.html` — страница лаборатории; `lab/fitting-room/index.html` — примерочная; `vite.config.ts` — сборка трёх страниц; `package.json` — команды `dev`, `build`, `check`, `test`; `public/` — статика как есть.

### 2.1 Основа

| Система | `shared/` | `server/` | `client/` | Флаг | Тест | Документ |
|---|---|---|---|---|---|---|
| Оболочка клиента (сцены, уведомления) | — | — | `main.ts`, `app.ts`, `scene.ts`, `ui/toasts.ts` | — | `startup.test.ts` | design «Карта файлов» |
| Вход и профили | `messages.ts`, `text.ts` | `profiles.ts`, `store.ts`, `hub.ts` | `app.ts`, `identity.ts`, `ui/profile.ts` | — | `profiles.test.ts`, `store.test.ts` | design «Профили и жетоны», «Хранилище» |
| Отказ записи сохранения | — | `store.ts`, `storage-failure.ts`, `main.ts` | штатное переподключение | — | `storage-failure.test.ts`, `server-storage-failure.test.ts` | design «Хранилище» |
| Расчёт ставок без игроков | — | `hub.ts`, `lobby/roulette.ts`, `lobby/ratrace.ts` | — | `ROULETTE`, `RATRACE` | `hub-pending-bets.test.ts` | STATUS «Подготовка 10 октября» |
| Площадь и набережная (plaza) | `maps/lobby.ts`, `plaza2.ts`, `lobby.ts` | `lobby/room.ts` | `lobby/scene.ts`, `lobby/world.ts`, `lobby/plaza/`, `lobby/hud.ts` | клиентский `DEFAULT_PLAZA` в `client/lobby/plaza/flag.ts`; откат — `?plaza=1` | `plaza2.test.ts`, `lobby.test.ts` | [plaza-redesign-2026-10-04.md](plaza-redesign-2026-10-04.md), [optimization.md](optimization.md) |
| Декор, фон, маяк и «вид» набережной | — | — | `lobby/decor.ts`, `lobby/backdrop.ts`, `lobby/look*.ts`, `lobby/tokarev-lighthouse.ts` | клиентский `DEFAULT_LOOK` в `client/render/look.ts`; откат — `?look=1` | `look.test.ts` | план `look-v2` |
| Движение игрока и столкновения | `sim.ts`, `world.ts`, `aim.ts`, `maps/builder.ts` | — | `predict.ts`, `input.ts` | — | `sim.test.ts`, `aim.test.ts` | design «Симуляция», «Прицел от третьего лица» |
| Сеть и протокол | `protocol.ts`, `messages.ts`, `constants.ts` (`PROTOCOL_VERSION`), `link.ts` | `main.ts`, `hub.ts`, `inputs.ts`, `link.ts` | `net.ts`, `predict.ts`, `remote.ts`, `relink.ts` | — | `hub.test.ts`, `resume.test.ts` | design «Сеть»; AGENTS §8 «Протокол» |
| Отрисовка и качество графики | — | — | `render/renderer.ts`, `render/gfx.ts`, `render/quality.ts`, `settings.ts` | — | `quality.test.ts`, `graphics-settings.test.ts` | [optimization.md](optimization.md), design «Отрисовка» |
| Аватары (желейки) и одежда, осмотр и три места в примерочной | `outfit.ts`, `fishstyle.ts`, `wardrobe.ts` | `profiles.ts`, `fishstyle.ts`, `lobby/room.ts` | `render/avatar.ts`, `render/outfit*.ts`, `ui/wardrobe.ts`, `ui/wardrobe-inspect.css`, `assets/wardrobe/` (стрелки и PROVENANCE), `lobby/camera.ts`, `lobby/dress.ts` | — | `outfit.test.ts`, `lobby-view.test.ts`, `wardrobe-places.test.ts` | design «Наряды и подарки» |
| Голос | `voice.ts` | `voice.ts`, `voice-config.ts`, `voice-wire.ts` | `voice.ts`, `voice-prefs.ts`, `ui/voice.ts`, `ui/voicepanel.ts` | `VOICE` | `voice-server.test.ts`, `voice-client.test.ts` | [voice-mvp.md](voice-mvp.md), `deploy/voice-relay/README.md` |
| Чат | `text.ts`, `messages.ts` | `hub.ts`, `lobby/circlechat.ts` | `chat.ts` | — | `circlechat.test.ts`, `hub.test.ts` | план `circle-chat` |
| Экономика и жетоны | `economy.ts` | `profiles.ts` | `ui/tokens.ts`, `ui/coin.ts` | — | `economy.test.ts`, `tokens-reconnect.test.ts` | план `progression-economy`; AGENTS §8 (8–15 жетонов в минуту) |
| Уровни игрока | `levels.ts` | `profiles.ts` | `render/leveltag.ts`, `ui/levelprogress.ts` | — | `levels.test.ts`, `mode-levels.test.ts` | план `mode-levels`, [tasks/levels.md](tasks/levels.md) |
| Меню Esc, список Tab | — | — | `ui/menu/`, `ui/online.ts`, `settings.ts` | — | `menu-settings.test.ts`, `tabmenu.test.ts` | планы `menu`, `tabmenu` |

Лаборатория примерки — `client/fitting-room/`, контракт `shared/fitting-room.ts`,
страница `lab/fitting-room/index.html`; отдельная сборка `tools/fitting-room/vite.config.ts`,
тесты `test/fitting-room-*.test.ts`, руководство [fitting-room.md](fitting-room.md).
Это локальная реализация, ещё не выпущенная в игру. Для `/lab/fitting-room/` нужен отдельный блок nginx/CSP
из `deploy/game.nginx.conf`; `deploy.sh` его не устанавливает. Самостоятельная `/fitting-room/` публикуется отдельно.

### 2.2 Рыбалка, баркас, рулетка (рыбалка 2.0, флаг `FISH2`; без него идёт старая)

| Часть | `shared/` | `server/` | `client/` | Флаг | Тест | Документ |
|---|---|---|---|---|---|---|
| Заброс, поклёвка, улов | `fishing.ts` (таблица видов `FISH`) | `lobby/fishing.ts` (старая), `lobby/fishing2.ts` | `lobby/fishing.ts`, `lobby/fish2.ts`, `lobby/fishhud.ts`, `lobby/fishcard2.ts`, `lobby/fishspot.ts` (своё место из снимка — «Подсекай!» не теряется) | `FISH2` | `fishing.test.ts`, `fishing2.test.ts`, `fishhook.test.ts` | design «Рыбалка», README «Рыбалка 2.0» |
| «В рюкзак» или «Отпустить» после поимки | `fishrelease.ts` (опыт ×1,5, время выбора) | `lobby/fishing2.ts` (`release`) | `lobby/fishcard2.ts`, `lobby/fishrelease.css` | `FISH2` | `fishrelease.test.ts` | README «Рыбалка 2.0» |
| Шансы и категории | `fishrules.ts` (`tierOdds`), `fishprogress.ts` (`fishCastMods`) | `lobby/fishing2.ts` | `lobby/fishodds.ts` | `FISH2` | `fishodds.test.ts`, `fishbalance.test.ts`, `fishing-odds-balance.test.ts` (никакой бонус не снижает шансы и доход) | страница `/fishing` (`public/fishing/`), план `fishing-patterns` |
| Шкала вываживания, оценки улова, натяжение, водка на шкале | `fishreel.ts` (`REEL_GRADES`) | `lobby/fishing2.ts` | `lobby/fishgame.ts`, `lobby/fish2hud.ts`, `lobby/fishgrade.ts`, `lobby/fishreel.css` | `FISH2` | `fishpatterns.test.ts`, `fishing2.test.ts`, `fishreel-grades.test.ts`, `fishreel-edges.test.ts`, `fishreel-vodka.test.ts` (общие помощники — `fishreelkit.ts`) | план `fishing-patterns`, [REPORT-fishing-patterns.md](expansion-2026-10-03/REPORT-fishing-patterns.md) |
| Уровни рыбалки (до 15) | `fishprogress.ts` (`FISH_XP_LEVELS`, `FISH_MAX_LEVEL`, `levelOdds`) | `lobby/fishing2.ts` | `lobby/fishprogresshud.ts`, `lobby/fishnpcdialog.ts` | `FISH2` | `fishprogress.test.ts`, `fishprogress15.test.ts` | README «Рыбалка 2.0» |
| Сундук и «Сокровища Посейдона» | `fishrules.ts` (`CHEST_BANDS`, `poseidonShare`, `POSEIDON_COINS`) | `lobby/fishing2.ts`, `hub.ts` (`toastAll` — тост всем на сервере) | `lobby/fishcard2.ts`, `lobby/fishtreasure.ts`, `ui/toastbig.css`, картинка `assets/poseidon/` | `FISH2` | `fishprogress15.test.ts`, `fishing2.test.ts` | README «Рыбалка 2.0» |
| Магазин и напитки | `fishshop.ts` | `lobby/fishnpc.ts` | `lobby/fishnpcdialog.ts`, `lobby/fishdrink.ts`, `lobby/fishclock.ts`, `lobby/fishprogresshud.ts` | `FISH2` | `fisheco.test.ts` | план `fisheco` |
| Рюкзак | `fishprogress.ts` (`bagSlots`), `fishshop.ts` | `lobby/fishnpc.ts`, `lobby/fishhold.ts` | `lobby/fishbag.ts`, `lobby/fishhold.ts` | `FISH2` | `fisheco.test.ts`, `fishhold.test.ts` | план `fisheco` |
| Пирс, доска рекордов (с «Коллекцией»), подиум | `fishplaces.ts` | `lobby/fishtop.ts` | `lobby/fishboard.ts`, `lobby/fishpodium.ts`, `lobby/fishplaces3d.ts` | `FISH2` | `fishpodium.test.ts`, `fishplaces.test.ts`, `fishprogress15.test.ts` | design «Рыбалка 2.0» |
| Сезон рыбалки и его вывески (у Семёна и на баркасе) | `fishrules.ts` (`SEASON_MUL`) | `lobby/fishseason.ts` (`/season` в чате при `DEV_GO=1`) | `lobby/fishseason.ts`, `lobby/fishjumps.ts`, `lobby/seasonsign.ts`, картинка `assets/fishsign/` | `FISH2` | `fishseason.test.ts`, `seasonsign.test.ts` | [STATUS.md](STATUS.md) |
| Дед Семён и Саня | `fishplaces.ts` (`FISHER_NPC`), `barkas.ts` | `lobby/fishnpc.ts` | `lobby/fisherman.ts`, `lobby/fishhouse.ts`, `lobby/fishnpcdialog.ts`, `lobby/barkas/sanyahome.ts` | `FISH2` | `fisheco.test.ts`, `fishplaces.test.ts` | план `fishC` |
| Журнал, награды, модели рыб | `fishstyle.ts`, `fishrules.ts` (`COLLECTION`) | `fishstyle.ts` | `ui/fishbook.ts`, `ui/fishrewards.ts`, `lobby/fishart.ts`, `lobby/fishgear.ts` | `FISH2` | `fishstyle.test.ts`, `fishstyle3d.test.ts` | план `fishstyle` |
| Баркас «Альбатрос» (10 мест, матрос-рыбак Колян) и лодка Семёна «Удалая» (от хижины) | `barkas.ts`, `ferry.ts` | `lobby/ferry.ts` | `lobby/barkas/` (Колян — `barkas/angler.ts`) | `FISH2` | `barkas.test.ts` | план `barkas` |
| Способности мификов и божественной (и острова), +20 % времени в зоне, награды уровней 1–15, осётр «чует ловушку» (10.10, протокол 16) | `fishability.ts` (`SPECIES_ABILITY`, `ISLE_ABILITY`, `LEVEL_PERKS`, `reelStyle2`, `WARY_HOLD`, `DRAIN2`), блоки способностей — `fishreel.ts` (`AbilitySpec`, `abilityView`) | `lobby/fishing2.ts` (`reelStyle2`, `hookBonusMs`, `gradeErrors`) | `lobby/fishabfx.ts` + `fishabfx.css` (отрисовка по типу способности), `lobby/fishgame.ts`, звуки — `audio.ts` (`fishAbility`, `fishStorm`); награда уровня — `lobby/fishfmt.ts` (`levelPerkText`), `fishprogresshud.ts`, `fishnpcdialog.ts`; прототип — `lab/fishing-abilities/` | `FISH2` | `fishability.test.ts` (клиент = сервер бит в бит, кемпер, осётр, награды); симуляции `tools/fish/abilities-sim.ts`; остров — `tools/fish/islestyle.ts`, `isle-reel.ts` (числа — `plans/2026-10-10-fishing-island-reel.json`) | план `fishing-abilities` |
| Рулетка рыбака и табло последних 10 ставок | `roulette.ts` | `lobby/roulette.ts` | `lobby/roulette*.ts`, `lobby/rouletteboard.ts`, `lobby/roulettelog.css` | `ROULETTE` (нужна `FISH2`) | `roulette.test.ts` | план `fisheco` |

### 2.3 Набережная: столы, события, мелочи

| Система | `shared/` | `server/` | `client/` | Флаг | Тест | Документ |
|---|---|---|---|---|---|---|
| Блэкджек | `blackjack.ts` | `lobby/blackjack.ts` | `lobby/blackjack*.ts`, `lobby/bj*.ts` | — | `blackjack.test.ts`, `blackjack-bets.test.ts` | [card-games-2026-10-03/](card-games-2026-10-03/), план `cards` |
| Дурак | `durak.ts` | `lobby/durak.ts` | `lobby/durak*.ts`, `lobby/tomatopick.ts` | — | `durak.test.ts`, `durak-stakes.test.ts` | design «Дурак за столиками кафе» |
| Бильярд | `billiards.ts` | `lobby/billiards.ts` | `lobby/billiards*.ts`, `lobby/blball.ts` | `BILLIARDS` | `billiards.test.ts` | [billiards-2026-10-04.md](billiards-2026-10-04.md) |
| Крысиные бега | `ratrace.ts` | `lobby/ratrace.ts` | `lobby/ratrace*.ts` | `RATRACE` | `ratrace.test.ts` | [ratrace-2026-10-04.md](ratrace-2026-10-04.md) |
| Автоматы и «Топ проигравших» | `slots.ts` | `lobby/slots.ts`, `lobby/losers.ts` | `lobby/slots3d.ts`, `lobby/camera.ts`, `lobby/losers.ts` | — | `slots.test.ts`, `lobby-view.test.ts`, `losers.test.ts` | design «Автоматы набережной» |
| Столы: таблички и защита от залезания | `tableguard.ts` | — | `lobby/tablesign.ts` | — | `table-guard.test.ts` | план `tables-noclimb` |
| Катера и «Портовая регата» | `regatta*.ts`, `boat.ts` | `lobby/regatta.ts`, `lobby/regattabot.ts`, `lobby/boat.ts` | `lobby/regatta*.ts`, `lobby/boat*.ts`, `lobby/kraken.ts` | `BOATRACE` | `regatta.test.ts`, `boat.test.ts` | план `boats` (design «Гонки на катерах» — старая версия) |
| Гидроплан «Стриж» | `plane.ts` | `lobby/plane.ts` | `lobby/plane*.ts` | `PLANE` | `plane.test.ts` | план `plane` |
| Шторм и пираты | `storm.ts`, `stormdyn.ts`, `pirates.ts` | `lobby/events.ts`, `lobby/storm.ts`, `lobby/pirate*.ts` | `lobby/storm.ts`, `lobby/pirate*.ts` | `STORM`, `PIRATES` | `storm.test.ts`, `pirates.test.ts` | [pirates-2026-10-04.md](pirates-2026-10-04.md), [tasks/storm.md](tasks/storm.md) |
| Аквапарк «Волна» | `aqua.ts`, `aquadyn.ts` | `lobby/aqua.ts` | `lobby/aquapark.ts`, `lobby/plaza/aqua.ts` | — | `aqua.test.ts` | design «Аквапарк «Волна»» |
| Музыкальный автомат | `jukebox.ts` | `lobby/jukebox.ts` | `lobby/jukebox*.ts`, `ui/jukebox.ts`, `music/` | `JUKEBOX` | `jukebox.test.ts`, `music-songs.test.ts` | план `sound` |
| Погода | `weather.ts` | `lobby/weather.ts` | `lobby/weatherfx.ts`, `lobby/rain.ts`, `lobby/skyfx.ts`, `weathersound.ts` | `DEV_WEATHER` (только dev) | `weather.test.ts` | план `weather`, design «Погода» |
| Живность, жители и русалка | `maps/critters.ts`, `mermaid.ts` | — | `lobby/critter*.ts`, `lobby/folk*.ts`, `lobby/mermaid.ts` | — | `critters.test.ts`, `mermaid.test.ts` | план `critters`, design «Кракен и животные» |
| Круги старта и очереди | `startzones.ts` | `lobby/modequeue.ts` | `lobby/startcircles.ts`, `lobby/kartstart.ts` | — | `startzones.test.ts`, `modequeue.test.ts` | design «Круги старта и очереди» |
| Колесо, мяч, фото, жесты вдвоём | `wheel.ts`, `ball.ts`, `lobby.ts` | `lobby/wheel.ts` | `lobby/wheel.ts`, `lobby/ball*.ts`, `lobby/photo.ts` | — | `wheel.test.ts`, `ball.test.ts` | design «Колесо обозрения», «Мяч на площади», «Вдвоём и фото у маяка» |
| Экран с чатом Telegram | — | `tgfeed.ts`, `tgnet.ts` | `lobby/tgscreen.ts` | токен — файл в `DATA_DIR` | `tgfeed.test.ts`, `tgnet.test.ts` | README «Экран с чатом Telegram» |
| Памятник и «Press F» (памятник не трогать) | `respect.ts` | — | `lobby/statue*.ts`, `lobby/respect.ts`, `assets/statue/` | — | `statue.test.ts` | AGENTS §11 |

### 2.4 Отдельные режимы (свои комнаты)

| Режим | `shared/` | `server/` | `client/` | Флаг | Тест | Документ |
|---|---|---|---|---|---|---|
| Пейнтбол | `maps/pier.ts` | `paintball/` | `paintball/`, `render/world.ts` | — | `paintball.test.ts`, `bots.test.ts` | design «Раунд пейнтбола», «Боты» |
| Картинг (образец) | `kart*.ts`, `track.ts`, `racecourse.ts`, `maps/ring*.ts` | `race/` | `race/` | — | `kart.test.ts`, `race.test.ts` | design «Картинг», план `kart` |
| «Выше облаков» | `skill*.ts` | `skilltest/` | `skilltest/` | `SKILL` | `skilltest.test.ts` | design «Полоса «Выше облаков»», план `skill` |
| Прятки «Рыбный двор» (образец) | `hide*.ts` | `hide/` | `hide/` | `HIDE` | `hide-rules.test.ts` | [hide-repair-20261003.md](hide-repair-20261003.md), план `hide` |
| Крепость | `fort*.ts` | `fort/` | `fort/` | `FORTRESS` | `fort.test.ts`, `fort-run.test.ts` | design «Крепость», планы `fort-*` |
| Fight Club (образец) | `fight*.ts` | `fight/` | `fight/` | `FIGHT` | `fight.test.ts`, `fight-game.test.ts` | design «Fight Club» |

### 2.5 Страницы, подарки, загрузка, звук и прочее

| Система | `shared/` | `server/` | `client/` | Флаг | Тест | Документ |
|---|---|---|---|---|---|---|
| Подарки по коду | `gifts.ts` | `gifts.ts`, `gift-config.ts` | `ui/gift-code.ts`, `ui/menu/gift.ts` | `GIFTS` | `gifts-server.test.ts`, `gifts-hub.test.ts` | [devil-mobile-20261003/REPORT.md](devil-mobile-20261003/REPORT.md) |
| Голосование «выгнать» | `votekick.ts` | `votekick.ts` | `ui/kickvote.ts`, `ui/online.ts` | `VOTEKICK` | `votekick.test.ts` | план `tabmenu` |
| Лаборатория идей `/lab` | `lab.ts`, `lab-*.ts` (правила локальных примеров) | `lab/http.ts`, `lab/store.ts` | `lab/` (страница — `lab/index.html` в корне репозитория) | `LAB` | `lab.test.ts`, `lab-registry.test.ts`, `lab-*.test.ts` | план `lab`, [примеры ревью](lab-research-examples.md) |
| Страница `/fishing` | — | — | — (страница — `public/fishing/` в корне) | — | `tools/fishing-guide/verify.mjs`, `test/fishing-guide.test.ts` (подсказки калькулятора) | [STATUS.md](STATUS.md); пересборка — `node tools/fishing-guide/gen.mjs` |
| Экраны загрузки | `loading.ts` | `readygate.ts` | `ui/transition.ts`, `ui/transition-art.ts`, `startup.ts`, `assets/loading/` | — | `loading.test.ts`, `startup.test.ts` | план `loading` |
| Звук (sfx.ts лежит в папке каждого режима) | — | — | `audio.ts`, `ambience.ts`, `voices.ts`, `music/` | — | `ambience.test.ts`, `settings-mix.test.ts` | план `sound`, design «Звук» |
| Боты (только соло) | `solobots.ts` | `paintball/bot.ts`, `race/bot.ts`, `fight/bots.ts`, `lobby/regattabot.ts` | — | — | `solobots.test.ts`, `bots.test.ts` | AGENTS §6 |
| Телефон | — | — | `touch.ts` | — | `touch.test.ts` | design «Телефоны» |
| Картинки и модели | — | — | `assets/` (рыбы, лавка, удочки, бильярд, катер, крепость, загрузка) | — | — | PROVENANCE рядом с картинками (AGENTS §7) |

Куда идти за типовой правкой:
- **Табличка, вывеска, афиша у входа в режим** — `client/lobby/plaza/` (`agenda.ts`, `live.ts`, `touts.ts`).
- **Награды и статистика** — `shared/economy.ts` или рядом с режимом (считает сервер); **рекорды в профиле** — `client/ui/records.ts`.
- **Новое сообщение по сети** — тип в `shared/messages.ts`, обработка в `server/hub.ts` или в комнате; сменил формат — подними `PROTOCOL_VERSION` в `shared/constants.ts` (новые поля в JSON можно слать без смены номера).
- **Новое поле профиля** — `server/store.ts` (нормализация: старые сохранения грузятся без потерь, AGENTS §10).
- **Новый режим** — по образцу помеченных выше: `shared/<режим>*.ts`, `server/<режим>/`, `client/<режим>/`, флаг в `server/main.ts`, строка `Environment` в `deploy/game-opus.service` (только после «да» владельца), тест в `test/`.
- **Тестовые помощники** без `.test` в имени: `test/kit.ts` (хаб и набережная), `test/fishbot.ts`, `test/skillbot.ts`, `test/hide-helpers.ts`, `test/fixtures/`.

## 3. Карта документов

Статус: **актуально** — навигация по текущему коду; **история** — как делалось, цифры и выводы могут отставать.
Что выпущено, что осталось локальным и что отложено — [STATUS.md](STATUS.md). Документ или старый план сам по себе
не подтверждает текущую работу функции, ошибку или разрешение на реализацию.

| Файл или папка | Про что | Статус |
|---|---|---|
| [../AGENTS.md](../AGENTS.md) | правила для всех помощников: скорость, проверки, отчёты, git, стиль, выкладка, запреты | актуально |
| [../README.md](../README.md) | как играть: режимы, управление, команды, переменные, раздел «Состояние», выкладка | актуально; раздел «Крепость» — про первую версию |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | как помогать со стороны: доступ, ветки, Pull Request, проверки | актуально |
| [README.md](README.md) | эта карта | актуально |
| [STATUS.md](STATUS.md) | последняя записанная выкладка, локальный пакет, текущая подготовка, отложенное и история | сводка на 10.10; история релизов не заменяет проверку production |
| [product.md](product.md) | как продумывать задачу, стиль игры, формат отчёта | актуально |
| [design.md](design.md) | как всё устроено: сеть, режимы, отрисовка, выкладка, отладка | справочник с исторической базой 03.10 и поздними дополнениями; «Гонки на катерах» — старая бухта, «Крепость» — первая версия; проверять по коду |
| [optimization.md](optimization.md) | план оптимизации: замеры, бюджет кадра, правила постройки площади, сеть | актуально; скрипта замера из этапа 1 (`tools/perf/plaza.mjs`) в `main` пока нет |
| [fitting-room.md](fitting-room.md) | отдельная лаборатория примерки, импорт/экспорт, GLB, границы переноса в игру | локальная реализация; выпуск и nginx — отдельно |
| [lab-research-examples.md](lab-research-examples.md) | восемь исследовательских примеров, из них четыре интерактивных | локальные предложения; не решение «Берём» и не перенос механик в игру |
| [plaza-redesign-2026-10-04.md](plaza-redesign-2026-10-04.md) | концепция новой площади: входы в режимы, афиша в кафе, Улица Аттракционов, аквапарк; откат `?plaza=1` | актуально |
| [billiards-2026-10-04.md](billiards-2026-10-04.md) | бильярд: где стоит, правила «американки», ставка, соло, управление, интерфейс стола, физика | актуально |
| [ratrace-2026-10-04.md](ratrace-2026-10-04.md) | крысиные бега: где, крысы, шансы и выплаты, табло и камера, итоги | актуально |
| [pirates-2026-10-04.md](pirates-2026-10-04.md) | набег пиратов как совместная защита: роли, ход события, награды, сообщения | актуально (заменяет `tasks/pirates.md`) |
| [voice-mvp.md](voice-mvp.md) | голос по V: как пользоваться, WebRTC, STUN/TURN, переменные | актуально; зоны и «слышу всех» — в плане `voice` |
| [hide-repair-20261003.md](hide-repair-20261003.md) | ремонт пряток: движение, выстрел, размер значка микрофона | история |
| [voice-cap-removal-20261003.md](voice-cap-removal-20261003.md) | голос без лимита в шесть человек, список говорящих, квота TURN | история |
| [voice-verification.md](voice-verification.md) | проверка голосового MVP 3 октября | история |
| [voice-evidence/](voice-evidence/) | снимки и данные к проверке голоса | история |
| [art/](art/) | концепты набережной `plaza-2026-10-02/` (выбран `2-painted.jpg`) | история, образец стиля |
| [card-games-2026-10-03/](card-games-2026-10-03/) | отчёты по блэкджеку (ядро, интерфейс) и реваншу дурака | история |
| [devil-mobile-20261003/](devil-mobile-20261003/) | отчёт локального патча 3 октября: подарочный набор по коду, мобильная рыбалка, стартовый экран, голос | история |
| [expansion-2026-10-03/](expansion-2026-10-03/) | отчёты Codex по режимам и системам 2–3 октября; начни со `STATUS.md` внутри | история |
| [release-prep/](release-prep/) | подготовка релизов 2–3 октября: чек-листы, контракты, миграция, баланс | история; про миграцию — `2026-10-02/REPORT-migration.md` |
| [superpowers/plans/](superpowers/plans/) | планы по темам (дата в имени), итог и «как посмотреть» — в конце файла | история и «как делалось» |
| [superpowers/specs/](superpowers/specs/) | четыре спецификации: набережная, памятник, Fight Club, крепость | история |
| [tasks/](tasks/) | исходные задания Codex: шторм, пираты, уровни, живность | сделано, история |
| [visual-rebuild/](visual-rebuild/) | переделка катеров, верфи, высотной полосы и животных после оценки владельца | история |

Вне публичного репозитория, рядом с папкой `game-opus`, находятся:

- `blender/art-v2/ready/` — 13 GLB v2, манифесты и SHA-256; ещё не подключены в игру. Ограничения и карта
  проходов — в README и `audit/frontage-map.md` набора. `blender/character-lab/` и `blender/npc-redesign/` — предыдущие версии и источники;
- `blender/preview.html` — единый автономный каталог Blender-работ; оба внешних каталога отчётов render-benchmark удалены 10 октября по просьбе владельца, игровой `tools/render-bench/` сохранён;
- `reports/tiredwood-code-review-2026-10-07/` — ревью снимка `8146e57`, воспроизведения и замеры; актуальность находок сверяется с кодом;
- `TIREDWOOD-*.md`, `OPUS-GAME-*.md` — прежние аудиты и предложения.

Эти пути доступны в рабочей папке владельца, но не входят в клон публичного репозитория. Секреты и серверные заметки сюда не копировать.

## 4. Инструменты `tools/`

Большинство стендов открываются на сервере разработки (`npm run dev`) по адресу `/tools/<папка>/…`, в сборку
и выкладку не входят. У `render-bench/` и самостоятельной примерочной — отдельные команды ниже. Как запускать
скрипт — в первых строках файла; для игрового сервера используй временный `DATA_DIR` (AGENTS §11).

| Папка | Что это |
|---|---|
| `blackjack-bots/` | боты блэкджека по WebSocket: проверка чужих ставок и ходов |
| `boat-assets/` | подготовка моделей катеров (GLB набора Kenney) |
| `critters/` | стенд поз животных набережной |
| `fish/` | калибровка манеры рыб (`calibrate.ts`), стенд кальмара; способности мификов — симуляции (`abilities-sim.ts`, бот `abilitybot.ts`) и сборка страницы-прототипа (`build-abilities-lab.ts`) |
| `fishing-guide/` | генератор страницы `/fishing` (`gen.mjs`, в т. ч. приёмы мификов и награды уровней) и сверка калькулятора с кодом (`verify.mjs`) |
| `fitting-room/` | конфигурация самостоятельной лаборатории; `fitting:dev`, `fitting:build`, `fitting:preview`, выход `dist-fitting-room/` |
| `fort-balance/` | модель экономики крепости против директора волн |
| `fort-castle/` | стенд замка крепости |
| `fort-fx/` | стенд эффектов событий и берега крепости |
| `fort-mobs/` | стенд мобов крепости: любая модель с позами и хитбоксом |
| `fort-preview/` | контролируемое превью босса крепости |
| `fort-turrets/` | стенд башен крепости: бой понарошку |
| `jukebox-lab/` | стенд песен музыкального автомата |
| `jukebox-model/` | проверка 3D-модели автомата: свет, ракурсы |
| `jukebox-panel/` | стенд окна автомата: состояния и жетоны |
| `lab/` | `decisions.mjs` — сводка решений лаборатории; `link.mjs` — ссылка владельца для локального сервера |
| `pirate-lab/` | стенд моделей набега пиратов |
| `race-preview/` | предпросмотр трассы «Портовое кольцо» |
| `race-sandbox/` | песочница клиента гонки |
| `release/` | `csp-proxy.mjs` и `csp-check.mjs` — проверка боевой сборки под защитой сайта; `migration-rehearsal.ts` — репетиция миграции профилей на синтетических данных |
| `render-bench/` | самостоятельный эксперимент WebGL/WebGPU; `bench:dev`, `bench:check`, `bench:build`, `bench:preview`, выход `tools/render-bench/dist/` |
| `statue/` | сборка модели памятника (скрипты, фото-референс), не трогать (AGENTS §11) |
| `visual-lab/` | общий визуальный стенд сцен и моделей |

## 5. Выкладка и данные

- **`deploy.sh`** (корень) — выкладка одной командой: проверки, тесты, сборка, архив, установка. Только после «да» владельца и с чистого `main`. Выкладывает помощник на Маке владельца, у которого есть приватные скрипты доступа к серверу (в репозитории их нет). Пошаговый чек-лист — AGENTS §10.
- **`deploy/game-opus.service`** — служба и флаги режимов (`Environment=…=1`). Смена флага — правка файла и новый релиз.
- **`deploy/install.sh`** — ставит релиз на сервере, перезапускает службу, проверяет вход и при ошибке возвращает прошлый релиз. **`deploy/smoke.ts`** — проверочный клиент. **`deploy/compress.ts`** — сжатые копии сборки.
- **`deploy/game.nginx.conf`** — блок nginx; ставится вручную, `deploy.sh` nginx не трогает. Для новой лаборатории
  примерки нужен отдельный `/lab/fitting-room/` с разрешением `blob:`; наличие блока в Git не подтверждает его установку.
- **`deploy/ENVIRONMENT.md`** — таблица переменных (частично устарела, см. [STATUS.md](STATUS.md)). Полный список переменных и `DEV_*` — README «Команды и переменные».
- **`deploy/lab-link.sh`** печатает ссылку владельца лаборатории, **`deploy/set-tg-token.sh`** кладёт токен бота экрана Telegram на сервер. Ссылка и токен — секреты: в чат и репозиторий не класть. **`deploy/retention-check.mjs`** — сверка профилей при релизе.
- **`deploy/voice-relay/`** — отдельная служба TURN для голоса: настройка (`README.md`), проверки, шаблон конфига.
- **`DATA_DIR`** — папка, где сервер хранит всё, что переживает выкладки: профили, жетоны, банк джекпота и рекорды (`state.json`), ежедневные копии (`backups/`, семь последних), файлы лаборатории, экрана Telegram и токен проверки. По умолчанию — `data/` в папке проекта (в git не попадает). На сайте — отдельный каталог вне релиза, он задан в службе. Локально всегда запускай с временной: `DATA_DIR=$(mktemp -d)`. Файлы с токенами не открывай и не печатай. Прогресс игроков не обнуляем (AGENTS §10).
- **Бэкапы — вне репозитория:** снимок данных перед выкладкой лежит на сервере, локальная копия релиза — в `../backups/tiredwood-<релиз>/` рядом с репозиторием. В публичный репозиторий не попадают `data/`, бэкапы, секреты и адреса серверов.

## 6. Как поддерживать карту

- Добавил систему (режим, флаг, экран) — допиши строку в раздел 2 тем же коммитом: файлы, флаг, тест, документ.
- Добавил папку в `client/`, `server/`, `shared/`, `tools/` или `deploy/` — допиши её в разделе 2, 4 или 5.
- Добавил, переименовал или списал документ в `docs/` — поправь строку в разделе 3: про что и актуален он или история.
- Переименовал или удалил файл — найди его здесь: `grep -n 'имя' docs/README.md`.
- Пиши только «где лежит» и «про что». Номер релиза и что включено на сайте — только в [STATUS.md](STATUS.md): здесь они устареют.
- Перед коммитом проверь `ls`: в таблицах должны стоять только существующие пути.

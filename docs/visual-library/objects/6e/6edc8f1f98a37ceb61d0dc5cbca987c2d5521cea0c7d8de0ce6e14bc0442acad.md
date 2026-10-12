# Ферма — повторный независимый аудит полноты

**Вердикт: обязательная доработка и повторная игровая приёмка.** В текущем source найдены два дефекта нового пакета и один унаследованный дефект прогрессии, который сохраняется в ускоренной XP-кривой. Прошлый вывод об отсутствии дополнительных P1/P2 был слишком узким: он не проверял UI Фургона и полный входящий путь клавиши E при посадке. Этот отчёт заменяет прежний вывод о готовности фермы.

Срез: `[LOCAL_PATH]`, HEAD `bd182c2`, исходная база `62f814f`. Незакоммиченная правка `client/lobby/isle/island3d.ts` и новые silhouette/browser-файлы не трогались. Проверены актуальный бриф 0–16, игровые callers, серверные входящие команды, нормализация/Store, тестовые сценарии и указанные ниже готовые снимки. Исходники и Git не изменялись. Full test/build, сервер, Chrome и Blender не запускались. Лёгкие Node24 repro используют настоящий FarmRoom в памяти без запуска сервера и без данных пользователя.

## Подтверждённые дефекты

### P2 / FARM-9 — первая E посадки одновременно поднимает игрока

`server/farm/room.ts:697` снимает занятие при новом BTN_USE. При посадке `:622–623` сохраняется **предыдущее** `state.prevButtons`. При этом клиент `client/input.ts:175–179` сначала ставит BTN_USE и синхронно вызывает onUse, который отправляет `farm/sit`; binary input с тем же BTN_USE отправляется следующим кадром. Поэтому JSON посадки занимает место, а binary **этого же первого E** сразу освобождает его.

Воспроизведение на текущем настоящем FarmRoom в лёгком Node24:

1. Новый игрок, `state.prevButtons=0`, позиция FARM_SEATS16[0].
2. `room.onMessage(c,{t:'farm',a:'sit',seat:0})` → seat=0.
3. `room.onInputs(c,[{...makeInput(),seq:1,buttons:BTN_USE}],1)` и несколько room.step() → seat=−1.

Свежий вывод: `{ afterMessage: 0, afterSameEInput: -1, prevButtons: 512 }`.

Это основной клавиатурный путь требования9, а не синтетическое новое действие. Прямой JSON/мышь работают иначе. `test/farm-core-pack1.test.ts:232–247` проверяет JSON посадки, конфликт, snapshot и движение только для seat0; он не проверяет последовательность E→JSON→binary. Необходимо отличить нажатие, вызвавшее посадку, от следующего E и сохранить свободное вставание по E/Space/движению. Проверить все16 мест и двух участников.

### P2 / FARM-11 — игровые окна сообщают отменённое снижение дохода и ложный бонус Фургона

Все связанные callers:

- `client/farm/ui/orders.ts:105–106`: «платит в1,3–1,5раза больше Гриба», «касса … из700», после700 — «касса полна — ×0,25».
- `client/farm/ui/orders.ts:89`: «×offer.mult к цене Гриба» без учёта общего150 cap.
- `client/farm/ui/grib.ts:91`: «Фургон даст ×offer.mult» с тем же несоответствием.
- `client/farm/ui/seeds.ts:59` и `client/farm/ui/belt.ts:188`: показывают `c.sale` как продажу без обозначения, что это базовая цена, хотя принятый бриф говорит о конечной цене в UI.
- `client/farm/hud.ts:117`: реплика Гриба безусловно советует Фургон, потому что «он щедрее», даже при одинаковой конечной цене.

Серверные правила в `shared/farm.ts:543–550` и `shared/farmvan.ts:117` уже используют cap150 и полную выплату после700. Свежий расчёт текущего source для golden-apple, rep3000, price-buff, van×1.5: base145, NPC150, Van150, **actual multiplier1**, а UI обещает1.5. Ошибка непосредственно влияет на решение игрока о месте и времени продажи. Таблица offer.coins верная; поясняющие суммы/множители ей противоречат.

Воспроизведение: открыть Фургон после дневной выручки700+; затем на максимальном price-бонусе сравнить одну дорогую культуру у Гриба и её готовое предложение Фургона. UI должен показывать выручку без дневного порога и реальную конечную цену/выигрыш, включая случай cap и отсутствие денежной прибавки. Цена семян и серверные выплаты этим исправлением не меняются.

### P2 / FARM-12 — повторное открытие обучения повторно выдаёт XP того же шага

Унаследовано от `62f814f`, не представляется новым regression. Тем не менее остаётся дефектом текущей прогрессии и исключает утверждение, что её фактический темп принят целиком.

- `server/farm/room.ts:562–565`: close переводит tutorial в−1, open переводит обратно в0.
- `shared/farm.ts:653–657`: каждая следующая plant на step0 выдаёт25XP; нет high-water/once-only проверки награды.
- `client/farm/ui/seeds.ts:117–121`: игроку доступны команды «Закрыть подсказки» и «Начать обучение заново».

Лёгкий настоящий FarmRoom repro без правки XP: посадить radish на bed0 →25XP; close/open; посадить на bed1 →50XP; close/open; посадить на bed2 →75XP. Все три раза пройден один и тот же первый шаг, а не разные шаги обучения. Получение XP через эти входящие команды проверено заново. В обычном UI команды доступны через вкладку обучения у Семечкина; сервер дополнительно не требует близости для tutorial-команды.

Необходимо разрешить повторный просмотр/возобновление обучения без повторной выдачи уже полученных наград. Для старых сохранений нельзя выдавать всё заново либо обнулять существующий XP/прогресс. Данные о уже выданных шагах у старого `tutorial=-1` неоднозначны: до изменения reader следует явно определить совместимое правило миграции, сохранить награды завершённых профилей и не выдавать прошлые награды повторно. Root принял эту находку к обязательной доработке.

## Матрица 0–16: требование → путь и данные → разрыв → действие

«Source подтверждён» означает прослеженный код, а не игровую приёмку. Указаны изученные тесты и их покрытие; свежего прогона тестов в этом review не было. Старые PASS-логи не являются финальным PASS текущего среза.

| № | Реальный путь, данные, существующая проверка | Разрыв доказательства / дефект | Что ещё требуется |
|---|---|---|---|
| **0. +2, новый3, максимум10** | Store `server/store.ts:182` вызывает normalizeFarm; `farm.ts:173–178` добавляет два пустых в конец только legacy. bed2…bed8 ведут4…10, RAKE_BEDS3=10. Тесты core-pack1:87,145,263 проверяют migration/XP/покупки/10 beds через FarmRoom. Свежий Node:1→3→3,4→6→6,8→10→10; старый golden-apple360min/helpers, bag/cellar сохранены. | Normalizer и снимок десяти грядок не доказывают миграцию старого сохранения с рестартом и покупки игроком. | Store fixture с1/4/8 грядками, XP границами, звёздами, crops/helpers: load→save→restart→сравнение. Игроком купить все семь улучшений, посадить/собрать beds0…9. |
| **1. Reroll меняет цель** | Объект orders→OrdersWin→кнопка `orders.ts:139,149`→orderAction:63–66. Semantic key исключает эквивалентную grow цель; noAlternative не списывает. Видимая причина в farmsys.ts:133, обновление через farmMe. core-pack1:158 покрывает constant rng, noAlternative, остальные заказы. | DOM кнопки, цель/счётчик после каждого ответа, noAlternative toast и timer0→новые сутки ещё не доказаны. | Реальный маршрут R1 ниже, включая полночь и сохранность прогресса после reconnect. |
| **2. Wheat L2 +fiber40%** | farmdata.ts:99; seed card/belt показывают resource/chance. Новая посадка требуетL2; normalizeBed/harvest не уничтожают старую wheat наL1. core-pack1:118 фиксирует таблицу. | Снимок открытых культур не доказывает сбор старой wheat наL1 и запрет её новой посадки. | На старомL1 собрать wheat, проверить закрытие новой посадки; наL2 проверить иконку, «Волокно40%» и actual plant. |
| **3. Lettuce fiber10% +bees10pp** | farmdata.ts:100, harvest.ts/farm.ts:502 добавляет BEES_BONUS. seed/belt используют ту же формулу; core-pack1:118 сверяет данные. | Нет просмотренного visual evidence10/20% и квитанции с fiber. | Два controlled профиля без/сbees, UI10/20%, один серверный harvest с выпавшим fiber. Тысячи случайных сборов для этого не нужны. |
| **4. Только открытые культуры** | beltCrops и drawCrops фильтруют level. lastCrop блок удалён, выбор сохраняется. belt.ts:206–207 показывает cost и «не хватает жетонов»; server plant повторно проверяет. client-pack1:7, farm-ui selection/price. | Снимок L2 подтверждает opened-only в одном состоянии; poor/click и прокрутка19 культур ещё не приняты. | L1/L2, переход уровня с открытым поясом, бесплатное семя только одной грядки, нулевой баланс, >9 культур и колесо/мышь. |
| **5. Помощь ripe с бонусами** | FindHelp не отбрасывает ripe, helpPrompt доступен для осмотра. Server helpAction проверяет чужого/уровень/дальность,1 помощь отpid, max3, water/points. cutRemaining не двигает ripeAt у ripe. helpReward хранит30rep/day и5coin/neighbor/hour в профиле; reset только через10min. core-pack1:178 и farm-help:86. Снимок01:16 показывает reward и состояние после actual ripe help. | Основная помощь есть. Не доказаны3 разных помощника, тот жеpid после reset/rejoin и пределы именно на ripe. Source не показывает обход reset. | Тот жеpid до/после10min/rejoin — отказ без затрат; ещё2 помощника, четвёртый — отказ. Проверить5coin/hour и30rep/day, серверный farmGot против экрана. |
| **6. Name/icon/owner и сохранение** | Estate «Убранство»→input/icon/save:210–249. Server validation и normalize28 Unicode code points/controls/whitelist. done(p,true) обновляет farmMe/plot; Signs печатает name+nick+icon; Board тоже name. claimPlot переносит участок, профиль остаётся. core-pack1:219. Снимки01:10/01:16 показывают разные имена, icons и владельцев. | Root сообщил actual save. Тест не делает Store reload или переезд; снимки не доказывают after restart. | Переехать на свободный участок, сосед видит новую/освободившуюся табличку. Restart fixture, пустое/default имя, rename nick,28 Unicode, invalid icon. |
| **7. Камера/нет точки/чужие растения** | Farm pitch clamp снят; общий Input limit и camera collision сохранены. Dot убрана, есть nearest-bed outline. FindHelp выбирает crop независимо от возможности помощи; prompt содержит культуру/time/«Созрело». client-pack1:49. Снимок01:16 показывает ripe caption без точки. | Один кадр не проверяет360°/вертикальный угол/коллизии и чужую growing/ripe наL1. | L1: growing и ripe, нет воды, уже3helpers. Оборот360°, вверх/вниз возле изгороди/дерева/построек: камера не проходит сквозь них, caption читается. |
| **8. Повторный колодец** | Well.start создаёт новый WellPainter на прежнем canvas; draw.ts:62–74 готовит свой bg. client-pack1:13 использует2 painters со stub canvas. Root сообщил actual повтор; снимок01:28 содержит полный фон, ведро и лейку. | Снимок не доказывает3 завершения подряд, abort и resize. Unit покрывает2 старта, не все требования. |3 заполнения без resize; cancel без/после наклона→повтор; resize во время/между попытками; сверить filled/add/sets и отсутствие лишнего расхода. |
| **9.16 seats, пары, E/click** | Shared16=fire8+2bench×2+2logs×2; world.ts:255–258 размещает benches. Server occupied/release/snapshot ACT_SIT; client busySeats и remote pose/yaw. core-pack1:232 проверяет только0/конфликт/движение. | **Подтверждён FARM-9 E bug.** Не проверены все pairs, совпадение с моделями и два сидящих без пересечений. | Исправить первыйE, затем S1 ниже для всех16 с двумя игроками. |
| **10. Музыкальный автомат** | Общие LobbyJukebox/JukeboxPanel/песни; отдельная серверная очередь фермы, check→spend→add и broadcast внутри комнаты. Farm theme идёт в Sound.musicIn; jukebox duckMusic приглушает её, reset возвращает, exit stop(.4). core-pack1:249 проверяет отказ/repeat/отдельную очередь/off/join после конца. | Схема GainNode не доказывает звук. Не приняты два слушателя, несколько песен, duck/recovery и тишина после выхода. | Два игрока у костра, покупка мышью, очередь обоим и balance. Duplicate/далеко/конец/leave-return/volume0-restore; прослушать настоящий микс. |
| **11. Деньги/caps/UI** |19 ставок150…180net/h, min<=55. Единый final cap150 NPC/Van, n<=2, free seed только1, payCapped raw. core-pack1:118,130 и свежая арифметика. Hub credit sourceother не добавляет скрытый множитель. | Серверное правило подтверждено; **FARM-11 ложные UI callers**. Нет actual ledger продаж capped профиля после700. | Исправить весь price UI; controlled buff/double/rep/700+ и готовыйVan: cost, урожай, offer.coins, final balance. |
| **12. XP/20–30h/миграция** | Total21750. Migration old level/fraction, L13 excess; награды только за addFarmXp transitions. Тесты L1…12 edges/half/max и stars. Модель12min median24–26h,25min median28.98/p90 **30.59h**, ideal fullwater+XPbuff median14.25h. | **FARM-12 tutorial reward повторяется.**20–30h не строгая граница всех обычных прогонов;14h не принятая скорость живого игрока. | Once-only tutorial с совместимым reader, честные ограничения модели. Проверить actual representative loop/переходы, не объявлять искусственноеXP доказательством24h. |
| **13. Loot/main/res/XP/partial bag** | Server harvest event содержит item.n/res/xp/gx/bagFull; scene показывает только свой plot. FarmLoot aggregate собирает main+secondary, XP, partial text,7s и очищается приexit. client-pack1:41 aggregate. Снимок01:10 показывает Редис×1, Корешок×1,+5/+1XP. | Actual single harvest подтверждён. Не доказаны mixed multi-bed/double/partial и чужой harvest. | Mixed10-bed квитанция, double+2ресурса,1 свободное место сумки/leftover crops, соседский harvest не даёт свою receipt, выход её убирает. |
| **14. Телега/выход** | Signs:23–36 создаёт деревянную «НА НАБЕРЕЖНУЮ» и опоры; cart use→leave; Hub освобождает old room, epoch++, возвращает в Lobby. | Наличие mesh/text не доказывает читаемость final вывески и возврат E/кликом. Initial shot сделан до уменьшения signage. | Отspawn/грядок подход издалека/сбоку; readable sign, E и mouse leave, правильная точка возврата, очистка HUD/windows/audio/pond seat. |
| **15. Пруд/NPC/6+1/shared fishing** | Local6 spots0…5; FarmPond адаптирует FishingHall2/FishNpc/Profiles, epoch+turn/proximity/owner/phase, raw lobbyacts игнорируются, leave доdelete. Append4fish, sea52/isle20/pond4. Общие shop/book/bag/card. pond tests29,123,138,156,170,195,230; room test281. Pond3D и local waterY есть. | **Unit6+1 не визуальная приёмка.** Не приняты actual catch, все6 подходов, reconnect/shop/cross-room. NPC use overlaps seat0, shop имеет приоритет — требует проверки маршрута. | P1–P3 ниже: настоящий пруд/catch/animation/input/6+1/shared data. |
| **16. Boss HP/вклад/solo/mixed** | Hp0 до первого contributor; quota300+150×(L−1) once до harvestXP; spectators не входят; уход сохраняет quota; v1 hp/bloom/got сохранены. Remaining/quota/rules/top идут в near panel<=7m; near убирает top-дубль.19–01, те же animations/rewards, conesmax30. core-pack1:201,263 и farm-boss legacy/rewards. | Near-panel hp0→300→…/mixed quota, actual phases/finish/reconnect/once rewards ещё не доказаны. Математика solo40min верна, это не живой finish. | B1–B3 ниже со state/rep/phase и видимой панелью. Старый v1 бой довести до итога без повторных наград. |

## Деньги и XP: точные границы доказательства

Свежие ставки текущего CROPS после вычета семян: radish150, wheat152, lettuce160, onion180, pumpkin156, carrot150, sunflower151.2, strawberry154, giant-mushroom150.67, dill156, chili162, crystal150, microgreens168, lotus150.55, life-tree152.73, golden-apple153.82, dragon-fruit154.91, star-flower156, mythic-mushroom157.09. Все не ниже150net/h. Проверены все REP_LEVELS и VAN_MULTS с price buff: два продукта дают максимум300gross; net≤300 и при бесплатном семени. Двойной продукт не удваивает XP.

XP темп не принят runtime. Изучена модель `economy-calc.mjs`: материалы следующей грядки, смешанные культуры, интервалы и случайная доля полива. Она не использует настоящий bag/sales/walk/click/well supplies, все покупки инструментов и XP конвертации/заказов/Фургона/достижений/reset tutorial. Ideal14.25h предполагает точный сбор и full watering+XP buff; доступность воды/баффа и фактические действия не доказаны. Ordinary12min median24–26h согласуется с целью; при25min p90>30h уже сама модель не обещает каждому игроку верхнюю границу30h. Обзор честно называет эти ограничения; новый статус «реальные24h приняты» добавлять нельзя.

## Обязательные runtime маршруты для root и общего runner

### R1 — настоящая кнопка заказа и полночь

1. L1 у доски **(9.38,−9.38)**: открыть E/кликом, записать видимые target/got/need/rerolls и farmMe. При единственной grow цели «Заменить» даёт toast «замена сохранена», счётчик остаётся2. Повтор не приводит2→1→0.
2. L2+ с альтернативами: нажать дважды с ожиданием каждого ответа. Каждая цель изменилась,2→1→0; остальные cards/got/done сохранились. При0 кнопка отключена. Claim платит один раз.
3. Controlled переход суток: timer достигает0, затем в<=1sec новые триcards и2rerolls; экран не зависает0. Rejoin/reconnect в тех же сутках ничего не сбрасывает.
4. У Фургона **(7.6,9.9)** при sold700+ и price cap сверить исправленный UI с реальными coins.

### S1 — все места отдыха с двумя игроками

Fire pairs0/1,2/3,4/5,6/7; benches8/9 около **(22.6,−28)** и10/11 около **(−30.5,30.5)**; logs12/13 и14/15 у Древа. Точные poses брать из FARM_SEATS16.

Для каждого места настоящая E→sit JSON→binary того же E сохраняет посадку. Release key и следующая E поднимают. Двое сидят на каждой паре одновременно, третий запрос того же занятого seat получает отказ. Повторить мышью, Space, движением, leave/reconnect. Собеседник видит правильную позу; тела, брёвна и лавки не пересекаются, проход остаётся.

### P1 — пруд, подход, NPC и настоящий catch

- Пешком пройти к deck x23.7…33.7,z−25.4…−23.4. Увидеть воду, низкий берег, камыш и Фому; нет исчезающей/вертикальной воды, расхождения берега/collision, зависшей желейки или лески.
- Фома **(22.4,−23.3)**; разговор **(24,−24),y.1,r1.6**. E/клик открывают снасти/улов/«Журнал пруда», Esc и мышь закрывают, pointer возвращается. Морских рейсов, лодок и бубна нет; цены и выплаты правильные.
- Spots x24.7/26.3/27.9/29.5/31.1/32.7,z−24.9,y.1,yaw0. Проверить каждый реальный маркер E/кликом. **Slot0 находится внутри NPC radius, onUse сначала открывает NPC.** Проверить прямой подход и понятность выбора0; если обход неочевиден, нужен точечный route/geometry fix.
- Actual cast→bobber→bite→hook→reel→**серверный land настоящей рыбы**. Сверить вид/card/pondN/album/bag/XP и высоту поплавка, выпущенной рыбы, брызг и лески .04. Fake card/искусственный FE_DONE не являются catch QA.

### P2 — 6+1, общий bag и жизнь комнаты

- Шесть реальных игроков занимают разные spots и видят друг друга; седьмой не вытесняет никого и получает понятную причину. Первый встаёт E/движением, выходит/теряет связь — седьмой занимает освободившееся; остальные сохраняют места.
- Прудовый улов виден в общем bag/Pond journal; после перехода набережная/лодка/остров видит тот же bag/gear/quests. Полные52/20 коллекции и owned не откатываются. Продажа у Фомы платит once; full bag плюс собственный livewell даёт правильное место улова/причину, без «В руки» на ферме.
- Настоящий reconnect во время WAIT/REEL/HOLD/NPC/book; старые epoch/turn не заканчивают новую шкалу, сообщения идут активной сцене, скрытый lobby shop не открывается. Restart/Store load сохраняет album, цену BagFish, gear и progression.

### P3 / F1 — Space keep→server ack→recast в четырёх местах

Lobby hooks теперь подключены `scene.ts:626–627,1968–1970`; у пруда `pond.ts:50,163`. Старый static finding закрыт, **настоящий catch runtime ещё не доказан**.

После real catch и choice unlock свежий Space отправляет один keep; серверный FE_DONE1 затем один cast, без дублей денег/XP. Пройти набережную, лодку, остров, пруд. Repeat/удержание от reel, повтор FE_DONE, чат/focus/modal/pause, заполнение последнего слота, movement/leave/disconnect/новая card/timeout не создают лишних keep/cast. У пруда отдельно проверить pause: FarmPond.onKey не имеет входного input.blocked guard, в отличие от LobbyScene; callback защищает cast, gate keep требует runtime проверки. Это риск для проверки, не четвёртый объявленный дефект.

### B1–B3 — панель Древа, реальные участники и итог

1. Center **(−11.88,11.88)**, E point **(−9.38,11.88)**. Подойти нормальным маршрутом в<=7m: near panel видна; отойти>7m — top вернулся без дубля. Awake до вклада: «Ждёт первого вклада», hp0,n0; spectatorsL13 не увеличивают ни HP, ни n.
2. L1xp199 собирает ripe radish: actual xp204, quota **300**, remaining295,mine5, phase1, верный nick/top. Второй participantL13 добавляет **2100** до своего harvestXP: hp2400,n2; перваяquota не меняется. Повтор/rejoin/restart не увеличивают quota и не лечат бесплатно. UI использует farm level.
3. Controlled clock с законными crops: L1 solo3radish/2min,300damage≈40min без воды/cones; последний harvest даёт bloom/result/buff/rep/lastdrop ровно один раз. Записать промежуточные remaining/phases, cone pickup/range/max30, animation+sfx. Mixed finish и сохранённый v1 бой отдельно; after reload/rejoin got не платится повторно. Искусственные часы проверяют правило, не имитируют доказательство живых40min.

## Адресные задания после решения root

**farm_core_impl — два server/progress fix.** Владение: room.ts, минимально необходимые helper/fields в farm.ts, точечные core-pack1 тесты; common protocol/Hub не переписывать.

- Исправить E→sit JSON→same E binary. Проверка через настоящие входящие сообщения/InputQueue; первая E сохраняет seat, следующая E/Space/move поднимает. Mouse, occupied pair, all16, reconnect сохранены.
- Tutorial once-only: повторный просмотр/close/open не выдаёт уже оплаченные XP/coins. Старые v1/v2 сохраняют XP, звёзды, crops, owned. До изменения reader определить правило legacy tutorial−1, где история выданных шагов неоднозначна; завершённые профили не получают прошлые награды заново. Проверять actual FarmRoom plant/close/open и Store reload, а не ручной вызов reward helper. XP curve и crop numbers самовольно не менять.

Сдать diff, narrow log, точный before/after ledger, миграционные условия. Сервер/браузер/full gate — root.

**farm_client_design — единый честный price UI.** Владение: orders.ts, grib.ts, seeds.ts, belt.ts; одна строка hud.ts при необходимости.

Убрать700 cash cap/×0.25 из Фургона. Все callers согласовать с final unit cap150 и actual offer.coins: capped ratio1/доплата0 показываются честно. Seeds/belt использовать final saleUnit или явно подписать базовую цену; бриф предпочитает конечную. Buff expiry, rep, Van closed, пустая сумка, нехватка продукта, длинные названия и большие суммы сохраняют понятный экран. Root проверяет NPC/Van без бонусов, с бонусами, приcap и после700.

**farm_pond_design — доказать полный путь, не заменять визуал unit тестом.** Отдельного подтверждённого экономического дефекта пруда этот source audit не нашёл. Адресный gap: P1–P3 на общем runner, особенно NPC/slot0 и Space после actual catch. Показать воду/NPC/шесть spots с несколькими желейками, bobber/fish/splash/line на локальной waterY, shop/journal/bag after transition. При подтверждении конфликта slot0 согласовать с root точечный route/geometry fix перед изменением общих scene/layout.

## Что уже видно на снимках и чего они не доказывают

Просмотрены PNG12октября: `farm-harvest-loot.png`01:10:14 —1radish+1root+XP; `farm-help-ready-neighbor.png`01:16:33 — ripe caption, reward, water/points; `farm-well-repeat.png`01:28:17 — полный фон колодца. Они подтверждают эти конкретные состояния. Нет привязанного к каждому PNG immutable SHA/build/input ledger, поэтому это не доказательство финального HEAD, полной последовательности и всех0–16. Сообщение root об actual identity/loot/well/ripe help учтено как наблюдение, не общая приёмка.

**Граница завершения:** три подтверждённых дефекта закрыты и независимо просмотрены; каждый игровой путь получил actual evidence или явно указанную skipped границу; migration на копии данных с restart; один обязательный full gate общей финальной сборки, multiplayer/CSP/короткий phone. Отчёт не авторизует публикацию/deploy и не называет весь пакет готовым.

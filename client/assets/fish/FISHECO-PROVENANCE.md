# Рыбы баркаса и вещи лавки (fisheco, 2026-10-03)

19 новых настоящих морских рыб (15 только с баркаса и 4 баркасных в дождь) и 9 вещей лавки Семёна и Сани
(`client/assets/fishshop/`): три рюкзака, три блесны, эль, пиво и дождевой бубен.

- Нарисовано: Codex CLI v0.153.4 (`codex exec`), встроенный инструмент `image_gen` с прозрачным фоном; по одному вызову на картинку, без правок и без референсов.
- Стиль рыб — как у `EVENT-PROVENANCE.json`: натуралистичная «полевая» живопись, строгий профиль головой влево. Палтус — глазной стороной, головой влево; рыба-молот — в три четверти сверху, чтобы читался «молот».
- Каждая картинка проверена глазами на шахматке и на тёмном фоне: тот вид/предмет, голова слева, углы прозрачные, нет текста и лишних предметов. Перерисовывать ничего не пришлось.
- Обработка (headless Chrome, canvas): обрезка по непрозрачному с полем 1,2 %, уменьшение до 320 px по ширине (рыбы) или до 192 px по длинной стороне (вещи), альфа ≥245 → 255 и ≤4 → 0, WebP 0.9.
- Исходные PNG (1–2,6 МБ) в репозиторий не положены; их SHA-256, размеры, обрезка и полный текст каждого промпта — в `FISHECO-PROVENANCE.json`.

| id | вид | латынь |
| --- | --- | --- |
| sprat | Шпрот | Sprattus sprattus |
| flyingfish | Летучая рыба | Cheilopogon heterurus |
| haddock | Пикша | Melanogrammus aeglefinus |
| hake | Хек | Merluccius merluccius |
| redfish | Морской окунь | Sebastes norvegicus |
| bonito | Пеламида | Sarda sarda |
| cod | Треска | Gadus morhua |
| barracuda | Барракуда | Sphyraena sphyraena |
| wolffish | Зубатка | Anarhichas lupus |
| mahi | Корифена | Coryphaena hippurus |
| amberjack | Сериола | Seriola dumerili |
| sunfish | Рыба-луна | Mola mola |
| halibut | Палтус | Hippoglossus hippoglossus |
| mako | Акула-мако | Isurus oxyrinchus |
| oarfish | Сельдяной король | Regalecus glesne |
| hairtail | Рыба-сабля | Trichiurus lepturus |
| wahoo | Ваху | Acanthocybium solandri |
| blueshark | Голубая акула | Prionace glauca |
| hammerhead | Рыба-молот | Sphyrna zygaena |

**Обмен акул, 10.10.2026 (по слову владельца).** Большая белая акула и рыба-молот поменялись местами — только картинка, имя,
вес и цвета; ключи альбома (id) не тронуты. Поэтому файлы тоже поменялись: картинка рыбы-молот (строка `hammerhead` в таблице
выше и в `FISHECO-PROVENANCE.json`) теперь лежит в `whiteshark.webp`, а `hammerhead.webp` — большая белая акула (её картинка
описана в `EVENT-PROVENANCE.md`: файл `whiteshark.webp` там назван «существующим» образцом стиля — тогда в нём была белая акула).
Сами пиксели не менялись, только имена файлов.

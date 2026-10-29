# Картинки страницы-обзора «Ракушка»

Нарисованы 29.10.2026 через Codex CLI 0.162.1 (`codex exec -m gpt-6-astra`, встроенный `image_gen`), по одной картинке
на вызов, без рисования кодом и без правок руками. Ключей не запрашивали — у Codex своя авторизация.
Обработка: `sips` — сцены уменьшены до 1440 px по длинной стороне, JPEG 68; Затейник — PNG 420 px с прозрачным фоном.
Оригиналы и полные промпты лежали в scratchpad сессии (`quiz-art/<id>/orig.png`, `prompt.txt`).

Общий стиль сцен — как у экранов загрузки (`client/assets/loading/PROVENANCE.md`), с поправками: «late-afternoon»
вместо «midday», цвета желеек без сине-жёлтого, запрет сине-жёлтых флажков и вымпелов. Всё без надписей.

| Файл | Что | Описание сцены (кратко) |
|---|---|---|
| `venue-shell.jpg` | Вариант А «Ракушка» | Белая ребристая ракушка-эстрада с коралловыми и бирюзовыми полосами и гирляндами; на задней стене табло из пустых кремовых клеток с бегущими лампочками; шесть пультов дугой, одна желейка жмёт кнопку; ведущий у трибуны с микрофоном; скамейки со зрителями, белая ограда с аркой; кипарисы, олеандры, море и маяк вдали. |
| `venue-awning.jpg` | Вариант Б «Шатёр» | Деревянная сцена под фестончатым полосатым навесом (коралл и крем, мятные столбы), вымпелы коралл/крем/мята; то же табло, пульты в полоску, ведущий в канотье; скамейки и белый штакетник с калиткой; море справа. |
| `croc-easel.jpg` | «Крокодил» на сцене | Фиолетовая желейка в берете рисует на мольберте крокодила в тёмных очках; зрители на скамейках с облачками-догадками (рисунки: аллигатор, ящерица, сапог, огурец); угадавший прыгает, конфетти. |
| `zatejnik.png` | Затейник | Мятная желейка-конферансье: канотье с красной лентой, красная бабочка, жилет в кремово-бирюзовую полоску, микрофон в руке, приглашающий жест. Прозрачный фон. |

Полные промпты (стиль + сцена) — в scratchpad `quiz-art/prompts.json`; ниже — текст сцен дословно.

- **venue-shell** — an open-air summer concert stage in a sunny seaside garden park — a classic resort "band shell": a large white ribbed quarter-dome shaped like half of a seashell, its ribs trimmed with soft coral-red and cream stripes and teal-green edging, strings of warm round light bulbs running along the ribs… a big wooden-framed game board made of a grid of completely blank cream-colored square tiles with plain teal header tiles, surrounded by a frame of little warm marquee bulbs… six small cream-and-teal player podiums, each with a round buzzer lamp… a jelly host behind a small wooden lectern holds a vintage microphone… rows of painted wooden park benches with jelly spectators… a low white decorative garden fence with an arched entrance gate.
- **venue-awning** — a small open-air summer theater stage… under a big scalloped striped canvas awning in coral red and cream with teal-green wooden poles, little triangular pennant bunting in coral, cream and mint green… the same blank board, podiums painted cream and coral, a jelly host in a straw boater hat… a low white picket fence with an arched gate.
- **croc-easel** — a drawing-and-guessing party game on an open-air summer stage… a big wooden painter's easel… a grape-purple jelly character in a little painter's beret… a funny simple crayon doodle of a crocodile wearing sunglasses… spectators with round thought bubbles containing tiny simple doodles of an alligator, a lizard, a boot and a cucumber (pictures only, no text).
- **zatejnik** — mint green jelly; a cheerful seaside resort entertainer and quiz show host: straw boater hat with a coral-red ribbon, a coral-red bow tie and a small cream-and-teal striped vest; holds a vintage silver stage microphone… gestures invitingly with the other mitten raised.

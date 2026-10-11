# Иконки снастей и наград рыбалки TIREDWOOD

Сгенерированы 11 октября 2026 встроенным инструментом Codex `image_gen` с `transparent_background: true`, без API-ключей, рисования кодом и ручной дорисовки. 29 новых WebP и 3 существующие иконки, переиспользованные по точному предмету. Стиль сверен с `../ui/icons/float.webp`, `wd-h-fisher.webp`, `wd-e-angler.webp` и прогрессионными рисунками `../rods/advanced.png`; форма и материалы — `shared/outfit.ts`, `shared/fishstyle.ts` и существующие SVG-превью `client/ui/fishicons.ts`.

Обычная `r:basic` используется одной картинкой в журнале и лавке. Косметические удочки отличаются от прогрессионных `advanced`, `professional`, `master`, `legendary`: последние сохранены, эти иконки их не заменяют. Иконки рамок — превью наград; настоящая шкала и её живые CSS-темы не менялись генерацией ассетов. Лодки уже имеют подходящие изображения в `../ownboats/`, новые дубли не создавались.

## Формат и проверка

- Все новые файлы: **256×256 WebP с альфой**, качество 82, alpha quality 100. Суммарно **381794 байт (372.8 КиБ)**; три переиспользованные иконки — 29036 байт без новых копий.
- Нарезка отдельных предметов из ImageGen-листов по свободным промежуткам; альфа ≤6 →0 и ≥248 →255; обрезка по альфе >24; вписано в240×240 с центровкой на прозрачном холсте256×256; уменьшение Lanczos3 через bundled Node sharp. Фон и содержимое не дорисовывались.
- Каждый итоговый файл декодирован; размер и альфа проверены, внешняя рамка полностью прозрачна. В нарезанных исходниках нет содержательных пикселей на краях (альфа>24).
- Все32 предмета осмотрены на контактном листе: итоговые WebP в128px и48px на бирюзовом фоне окна и тёплом кремовом фоне. Полные силуэты и читаемые различия. Общую браузерную приёмку выполняет ведущий после подключения.
- Промежуточные PNG не добавлены в публичный репозиторий. Все 6 PNG-оригиналов, включая первый вариант одежды, проверенной копией сохранены в долговечном приватном архиве `tired.solutions/backups/fishing-ui-icons-2026-10-11/originals/`; пути ниже указаны относительно основного репозитория `game-opus`. Рядом сохранены `final-contact.png` и `final-manifest.json`. Копии в библиотеке Codex также сохранены, но не являются единственным архивом. Прозрачные cutout-PNG отдельно не сохранялись: нарезка сразу в финальный WebP.

## Файлы и реальные предметы

| Файл | ID | Название | Статус | Байт | SHA256 |
|---|---|---|---|---:|---|
| `../fishgear/rod-basic.webp` | `r:basic` | Обычная | новый | 9130 | `dd970acd34ba197ae65c7f69cd151cd10b31e177aefc6b96fb5fccf180922d9f` |
| `../fishgear/rod-hazel.webp` | `r:hazel` | Орешник | новый | 9470 | `3189e10fe2a6fe273477b927593b45a6583764640b5dbd0df0111e6ea1f5882c` |
| `../fishgear/rod-carved.webp` | `r:carved` | Резная | новый | 9406 | `5dcaa5610e75ff26e065572f4a2261dbe581b91e0be2d68e4669d24db485948b` |
| `../fishgear/rod-gold.webp` | `r:gold` | Золотая | новый | 10032 | `3c712ac09cf0a76e05039f97c8292e30e1cbbb9a47e6c9eb7eea5ef98332d390` |
| `../fishgear/rod-lighthouse.webp` | `r:lighthouse` | Маячная | новый | 10642 | `a0652ac7b05a85d3671267651b2ff2e99d26b1ed7f0fb0274c320ec6de6f007d` |
| `../fishgear/bobber-quill.webp` | `b:quill` | Гусиное перо | новый | 6538 | `bdc0f2117fbbdb085364db361af4cb1a11f94a7618e3c16ae54e1a8d33ebe0fa` |
| `../fishgear/bobber-duck.webp` | `b:duck` | Уточка | новый | 14898 | `f086979941bcbdf70980d3abf4c3a7965257dea7030954ddc8a0e579071444dd` |
| `../fishgear/bobber-firefly.webp` | `b:firefly` | Светлячок | новый | 8624 | `5a507f40ae46a5c0d7e8673de6648ab76ff8344e2566a7e27189a6f4dd6ee5c3` |
| `../fishgear/bobber-goldfish.webp` | `b:goldfish` | Золотая рыбка | новый | 11438 | `8f8b517c9e12493e6333872c7c3d9b76ed989ff14d16f04ce8b8590e0c77e9ac` |
| `../fishgear/bobber-bellbuoy.webp` | `b:bellbuoy` | Колокольный буй | новый | 12082 | `d1fa149cdb42111f66546fe6cee7e8bd8eebc6f5d715a5735467c5d62384d6eb` |
| `../fishgear/frame-wood.webp` | `w:wood` | Деревянное | новый | 9722 | `d187d08b9f113114eb1383cec67b3b8bdfa00487decc750c76f3dd9293a5b134` |
| `../fishgear/frame-chart.webp` | `w:chart` | Морская карта | новый | 11610 | `4613733cfd6857464a41e4845a19bfce369d8ae0182284b7c8e15cb4d566c88a` |
| `../fishgear/frame-night.webp` | `w:night` | Ночной клёв | новый | 9798 | `a7c9726ee1e8a0454a5919f5dc62178fd29c93bb08fa6216aad45b1a2c420f49` |
| `../fishgear/frame-gold.webp` | `w:gold` | Золото | новый | 11096 | `1e0c14f4938a2d8ce27688f84ef6cbe62236ee742a9c50677524edb4f236027c` |
| `../fishgear/frame-fog.webp` | `w:fog` | Туман | новый | 12378 | `5c0d845ca807e6beaf9db0d23c382fc8307d3154030ee3766f731136a06376ef` |
| `../fishgear/badge-anchor.webp` | `n:anchor` | Золотой якорь | новый | 17104 | `937fc02eee63fef73255a3d57aad7a951b2db2427179f5afd7e7e8a9e4eef1be` |
| `../fishgear/badge-lighthouse.webp` | `n:lighthouse` | Маяк | новый | 17442 | `ab515940b9d2fce33b74e50426b0adcf4805ddb79c8eb1b107337626d2335356` |
| `../fishgear/reward-angler-vest.webp` | `a:angler` | Жилет рыболова | новый | 17636 | `274f80b46f924fb91231acba23d0fc7108a257ae00794b35b770057716199b8c` |
| `../fishgear/reward-kukan.webp` | `a:kukan` | Кукан с уловом | новый | 14710 | `02cd9de19f649f2ca5a78b82ddd2f0fe88d550b84fe104b22775f5b8a5233185` |
| `../fishgear/reward-sou-hat.webp` | `h:sou` | Зюйдвестка | новый | 15142 | `d03cf1ccdd4fb195e697594d1970b7eb5fa88f142ca0f724be24aed223192106` |
| `../fishgear/reward-oilskin.webp` | `a:oilskin` | Штормовка | новый | 17280 | `923b58516cc82e37c90faa73f20ce9faae1bdfdcded033b45502ce3a238e20e0` |
| `../fishgear/reward-gull.webp` | `s:gull` | Чайка | новый | 13334 | `dc629803ddbeae27edce06c60e5fed1e4bde01be4c73b7f5fd2f5c7ee69719df` |
| `../fishgear/reward-net.webp` | `a:net` | Сачок | новый | 27080 | `4839d78aa052ab098dd7a7a8c9d6c6379013b5eaf53ca2a7714e3353fdf23958` |
| `../fishgear/reward-captain-hat.webp` | `h:captain` | Фуражка капитана | новый | 11452 | `0c74bb4b09e1664e1d99cb61752621088600bf96cf9934e79a086515ef69e782` |
| `../fishgear/reward-captain-tunic.webp` | `a:tunic` | Китель капитана | новый | 16156 | `aa7662343deabcf284d5030eca26d338816533db1922073a995fde8b2594db2d` |
| `../fishgear/reward-parrot.webp` | `s:parrot` | Попугай-ара | новый | 10434 | `2700058c59c41c70b765f8297376423e755d9499c8567fa29f953485521435ff` |
| `../fishgear/reward-puffin.webp` | `s:puffin` | Тупик | новый | 12908 | `07a77bfa0558dcad6a57b987e2275f223b6ac675dddb4089ca3af5395867a7ca` |
| `../fishgear/reward-keeper-hat.webp` | `h:keeper` | Шапка смотрителя | новый | 15376 | `7323a785759cb942ae33fbfe5a1223915c3d7d5e0aa0cf5fc1cf7c6556387422` |
| `../fishgear/reward-keeper-sweater.webp` | `a:keeper` | Свитер смотрителя | новый | 18876 | `bfb67def5519df69159c15c1791225af58e4de849cfd5b1ff8794e8293884c34` |
| `../ui/icons/float.webp` | `b:classic` | Классический | переиспользован | 10148 | `5a00e4110a7eaeb6f12520bf7c7a8196134842f58700711e9114d4adb655c46f` |
| `../ui/icons/wd-h-fisher.webp` | `h:angler` | Панама рыболова | переиспользован | 8600 | `a00c81119b1899ed8bfe887f98491d1a4d40f34cbd322687d97d27e066863fb4` |
| `../ui/icons/wd-e-angler.webp` | `e:angler` | Очки рыболова | переиспользован | 10288 | `3b64016e7b2376a5d7bd1a7643c9ca984c0d1f7178d5118d112802c0d315b4b4` |

## Источники и точные промпты

### rods

- Финальный PNG: `../backups/fishing-ui-icons-2026-10-11/originals/exec-8e2b40dc-ab57-4580-8743-a9a9bdedd9e8.png`
- Размер: 1254×1254; SHA256: `643edb788c28f577a6557df77df9fd9788e07debd3d2c0746019cc4a64609f46`.
- Иконки в порядке чтения: `rod-basic`, `rod-hazel`, `rod-carved`, `rod-gold`, `rod-lighthouse`.

Промпт генерации:

```text
Use case: stylized-concept
Asset type: TIREDWOOD fishing inventory icon sheet, five distinct fishing rods.
Primary request: Create a clean transparent sprite sheet of FIVE complete hand-painted fishing rod illustrations matching the existing warm chunky seaside game item icons. Use an exact 3 columns by 2 rows equal-cell grid, each rod contained entirely in its own square cell; last cell bottom-right completely empty. No grid lines or labels. Each full rod diagonally from lower-left handle to upper-right tip with an attached reel, entire rod visible, centered with 12 percent empty margin per cell. Same proportions and scale for all five, substantial handle and reel readable at small inventory size.
Subjects in reading order:
1 top-left BASIC ordinary rod: inexpensive dark slate graphite blank, red-painted short tip, honey cork handle, simple round silver reel, plain utilitarian.
2 top-middle HAZEL homemade rod: irregular natural hazel branch with dark brown bark and small knots, twine bindings, pale wooden handle and a traditional rectangular wooden line winder (NOT a metal reel), no red-white striping.
3 top-right CARVED rod: pale honey wood blank with a clearly carved dark brown spiral groove down its length, darker walnut handle, round brass reel, ivory tip.
4 bottom-left GOLD rod: polished rich golden blank with spaced black thread wraps, cream cork handle, elaborate gold reel with a prominent red ruby in the hub, deep-red tip.
5 bottom-middle LIGHTHOUSE rod: ivory blank with coral-red spiral bands, forest-green handle, round brass reel, small warm amber glowing light at tip.
Style: polished hand-painted cartoon look for a cozy sunny Black Sea resort game; clean dimensional readable shapes, soft painterly cel shading, thin dark-brown contour, bright gentle highlights, rich natural colors, warm summer light upper-left, carefully rendered cork, wood grain and metal. Not a photograph, not flat SVG or simple diagram.
Scene/backdrop: genuinely transparent alpha around all items and in the empty cell. No white background, no ground, no cast shadows, no scenery, no text, letters, numbers, watermark, logos, borders, frame. Avoid blue-and-yellow combination. All 5 rods isolated with no overlap. Square high-resolution sheet.
```
### bobbers

- Финальный PNG: `../backups/fishing-ui-icons-2026-10-11/originals/exec-e8ddf7d4-c92d-439e-ad4a-260624e3b2de.png`
- Размер: 1254×1254; SHA256: `eca2268de311bb9a67a9fdf1c2e22b09efe95d998831e366f8aca7a388e57ea0`.
- Иконки в порядке чтения: `bobber-quill`, `bobber-duck`, `bobber-firefly`, `bobber-goldfish`, `bobber-bellbuoy`.

Промпт генерации:

```text
Use case: stylized-concept
Asset type: TIREDWOOD fishing inventory icon sheet, five distinct fishing bobbers.
Create a transparent sprite sheet of FIVE completely separate hand-painted fishing bobber item icons in an exact equal-cell 3 columns x 2 rows grid, last bottom-right cell empty. Every object fully contained in its own square cell with at least 12% even transparent margins, no cell lines, no overlap, no text or labels. Each object upright, chunky clear silhouette readable at 48 pixels, enlarged to fill its cell. View slightly three-quarter. All are real physical fishing floats, not icons of unrelated animals.
Subjects reading order:
1 top-left GOOSE QUILL: one long slender white goose feather fishing float, natural tiny feather vanes, red-painted upper third, narrow black band at the transition, pointed ivory bottom. It is a goose quill float with feather texture rather than a bulbous classic bobber.
2 top-middle DUCK: a cheerful plump yellow rubber-duck fishing bobber, orange bill, black dot eye, tiny molded wing, bottom flat enough to float, glossy but hand-painted. A small mint-green ripple at its base.
3 top-right FIREFLY: a dark forest-green oval fishing float with a short slender dark antenna, a softly glowing warm amber rounded glass bulb integrated into its upper body and a tiny warm yellow tip. Cozy warm glow, not sci-fi, no insect.
4 bottom-left GOLD FISH: a small golden-orange fish-shaped bobber standing upright, fish head at top and splayed tail at bottom, fins on the sides, expressive small dark eye, miniature gold crown above its head, metallic golden shimmer. Upright fish rather than swimming sideways.
5 bottom-middle BELL BUOY: a nautical red-and-white bell buoy fishing float, broad cream rounded floating base with a red top rim, two red upright supports and white diagonal brace, a small brass bell hanging inside the framework and a warm amber light on top. Distinct from a lighthouse. Small mint-green ripple at its base.
Style: single bold game inventory items in the same family as TIREDWOOD's red-white float and fisher hat icons: polished hand-painted cartoon, warm natural saturated colors, thin dark-brown outline, dimensional soft painterly cel shading, bright gentle highlights from upper-left summer sun. Materials visibly rubber, feather, glass and brass. Transparent true alpha background; isolated cutouts with no floor, no scenery, no drop shadow, no borders, no lettering or watermark. No blue-yellow combination. Square high-resolution sheet.
```
### frames-and-badges

- Финальный PNG: `../backups/fishing-ui-icons-2026-10-11/originals/exec-1624be17-abdb-4906-9966-212cf959c18b.png`
- Размер: 1254×1254; SHA256: `dae0d1c6a469ae31976f5b64087c7381008a141de74f9569b8e786d008993eed`.
- Иконки в порядке чтения: `frame-wood`, `frame-chart`, `frame-night`, `frame-gold`, `frame-fog`, `badge-anchor`, `badge-lighthouse`.

Промпт генерации:

```text
Use case: stylized-concept
Asset type: TIREDWOOD fishing reward inventory icon sheet.
Create SEVEN separate game reward icons on one square genuinely transparent alpha sheet arranged in an exact equal-cell 3 columns by 3 rows grid. Last two cells in bottom row empty. No grid borders or text labels. Each icon fully contained in its cell with 12% empty margin. Warm dimensional hand-painted seaside game art, thin dark-brown contour, soft painterly cel shading, upper-left sunlight, natural saturated colors matching the rubber-duck and red-white float item icons.
Subjects in reading order:
1 top-left WOODEN fishing gauge window: tall narrow rounded wooden picture frame with warm brown wood grain, inset calm sea-blue water, and a small translucent mint-green catch zone in its middle. A tiny silver fish inside the water. No numerals, no letters, no markings.
2 top-middle SEA CHART fishing gauge window: tall narrow weathered tan parchment frame with subtle rolled parchment edges, inset pale mint ocean chart with thin nautical chart grid lines and a small unlabeled compass rose near the bottom; a soft coral-red translucent catch zone in the middle. Tiny silver fish.
3 top-right NIGHT BITE fishing gauge window: tall narrow navy-painted frame with inset deep marine-blue moonlit water, little warm cream stars and small crescent moon above, a warm amber translucent catch zone in the middle, a tiny silver fish. Cozy evening illustration, readable and not dark horror.
4 middle-left GOLD fishing gauge window: tall narrow rich gold carved frame, inset teal-green water, warm golden translucent catch zone in the middle, tiny silver fish and soft glints. Same overall window proportions as the other four, tactile metal frame.
5 center FOG fishing gauge window: tall narrow bleached driftwood frame lashed with cream rope, inset pearl-gray seawater with sparse soft white mist wisps and a miniature red-white lighthouse near the top, its warm amber ray forms the catch zone in the middle; tiny silver fish still visible.
6 middle-right GOLD ANCHOR nickname badge: a small thick circular midnight-navy enamel pin with a raised polished golden nautical anchor, gold rim. No rope, no letters.
7 bottom-left LIGHTHOUSE nickname badge: a small thick circular forest-green enamel pin with a raised ivory-and-coral-red striped lighthouse and warm glowing amber lamp, gold rim. No letters.
These are inventory previews of physical frame themes and enamel badges, not a UI screen. Frames in the first five cells have water inside; entire exterior backgrounds transparent. No floor, no drop shadows, no scenery outside objects, no text, letters, numbers, labels, logos, watermark. No blue-yellow flags or boats. Clean separated complete objects, no overlap.
```
### fishing-rewards

- Финальный PNG: `../backups/fishing-ui-icons-2026-10-11/originals/exec-ccd55b78-ddc3-4c6b-bbdf-56babb05d160.png`
- Размер: 1254×1254; SHA256: `ee69199fd069b8525a276d02e824e14622365246ed41a0ed8d222213e3572063`.
- Иконки в порядке чтения: `reward-angler-vest`, `reward-kukan`, `reward-sou-hat`, `reward-oilskin`, `reward-gull`, `reward-net`.
- Первый PNG до исправления полей (сохранён): `../backups/fishing-ui-icons-2026-10-11/originals/exec-8a41c223-101f-4b8e-9361-1575e330beac.png`; SHA256: `e91eedbb1eef06e29f9409994a1bda410ea6f9ddaa7f26d62171309828aa9873`. Он не используется как финальный источник.

Промпт генерации:

```text
Use case: stylized-concept
Asset type: TIREDWOOD fishing reward inventory icon sheet, clothing and objects.
Create SIX completely separated hand-painted item icons on one truly transparent alpha sheet in an exact equal-cell 3 columns by 2 rows grid. Each complete object centered in its own square cell with 12% clear margins, no overlap. The clothes shown alone on invisible body, no mannequin or people. No labels or grid lines.
Subjects reading order:
1 top-left ANGLER VEST: short sleeveless olive-khaki canvas fishing vest, several large flap pockets, a small silver lure with a red accent pinned at the chest, visible stitching and weathered cloth. Front three-quarter view.
2 top-middle FISH STRINGER: a braided pale rope loop at the top suspending a stringer of three different silvery caught fish, hung vertically heads-up, tails down; one small bluish mackerel, one broader gray-silver fish, one small brown-silver fish. Real stringer accessory at fisherman's waist, no wood rack or environment.
3 top-right SOUWESTER HAT: golden-yellow waxed waterproof fisherman's rain hat with rounded crown and a broad uneven brim extending farther down at the back, a thin tan chin cord. View three-quarter so the distinctive long rear brim is visible.
4 bottom-left OILSKIN COAT: golden-yellow fisherman's waterproof waxed coat with a dark navy-blue turned collar and three toggle fasteners, two pockets, sleeves. Heavy weatherproof cloth, visible seams. No stripes, no nautical flags.
5 bottom-middle GULL: a friendly seated white-and-pale-gray seagull shoulder pet, compact natural bird body, folded gray wings with black tips, yellow beak with a tiny red spot, yellow feet, small dark eye, looking slightly left. Not humanoid.
6 bottom-right LANDING NET: a short wooden-handled oval fishing landing net with thick warm honey-brown hoop and dark forest-green knotted mesh bag hanging underneath. Complete handle and mesh visible, diagonal arrangement.
Style: polished hand-painted cartoon item illustrations for a sunny cozy seaside town game, clean chunky readable shapes, fine dark-brown contour, warm upper-left sunlight, rich natural colors, soft painterly cel shading and material details, same style as the existing TIREDWOOD fisher bucket-hat and amber glasses icons. Transparent background surrounding the isolated objects, no floor or cast shadows, no scene, no labels, no text/letters/numbers/logo/watermark. Full objects visible with clear transparent separation. Square sheet.
```

Промпт правки кадрирования через ImageGen (материалы и стиль сохранены):

```text
Use case: precise-object-edit
Edit target: the supplied six fishing clothing/reward icons.
Keep the six item designs, hand-painted style, colors and materials exactly. Correct ONLY framing and spacing: recompose them in the top two rows of an exact 3 columns by 3 rows square grid, leaving the entire bottom row transparent and empty. This makes each cell square. Each complete item must fit INSIDE its square cell with at least 15% transparent empty margin on every side. Reduce the icons enough that sleeves, hat, rope loop, bird feet, and net handle are fully visible and no pixels of any object touch the sheet boundary or a cell boundary. Specifically the yellow oilskin coat must show both complete sleeves, with clear transparent margin around its whole silhouette; the olive fishing vest must not spill into its neighbor cell. Do not crop the objects. The exact six subjects in reading order remain: olive fishing vest with lure, rope loop and three caught fish stringer, yellow souwester rainhat, yellow oilskin coat with navy collar and toggles, white-gray seagull, wooden landing net with dark-green mesh. Preserve true transparent alpha, no grid lines, no text, labels, numerals, logos or added backgrounds. Warm sunny painterly illustrations.
```
### captain-and-keeper

- Финальный PNG: `../backups/fishing-ui-icons-2026-10-11/originals/exec-d8be07f6-7fc9-4413-ae06-6da5165ac1d2.png`
- Размер: 1254×1254; SHA256: `cc043f9c70dd0ad5bf84c452cfe398aa0637747d15fb398812fa399853469edc`.
- Иконки в порядке чтения: `reward-captain-hat`, `reward-captain-tunic`, `reward-parrot`, `reward-puffin`, `reward-keeper-hat`, `reward-keeper-sweater`.

Промпт генерации:

```text
Use case: stylized-concept
Asset type: TIREDWOOD six fishing costume and shoulder-pet inventory icons.
Make SIX complete isolated item illustrations on one transparent square sheet. Arrange THREE columns by TWO rows with WIDE EMPTY GUTTERS, each item completely inside its own equal rectangular cell. Scale every item down to occupy AT MOST 60 percent of its cell width and AT MOST 65 percent of its cell height. Important: generous transparent margins on every side; absolutely no cropped item or touching sheet/cell border. No text or grid lines. The exact subjects in reading order:
1 top-left CAPTAIN'S HAT: white peaked naval captain cap, black band and visor, gold braid, a small gold anchor insignia on the front. Complete standalone cap in three-quarter view.
2 top-middle CAPTAIN'S TUNIC: short midnight-navy double-breasted naval captain jacket, six brass buttons, white shirt at collar, gold shoulder epaulets with fine fringe, full sleeves. Standalone clothing on invisible body, no mannequin.
3 top-right SCARLET MACAW: friendly seated scarlet red macaw shoulder pet, long red tail, white face patch, dark hooked beak, green and dark teal secondary wing feathers, small natural gray feet. Avoid yellow-blue color pairing; no flags. Complete bird including tail and feet.
4 bottom-left ATLANTIC PUFFIN: friendly seated compact puffin shoulder pet, black upperbody and white belly, pale white face with little dark eye, large triangular orange-and-gray bill, orange feet, folded black wings. Complete natural bird silhouette.
5 bottom-middle LIGHTHOUSE KEEPER'S HAT: soft knitted ivory-and-red horizontal striped beanie with a round ivory pompom, thick rolled coral-red knit brim. Complete standalone hat, visible wool stitches.
6 bottom-right LIGHTHOUSE KEEPER'S SWEATER: forest-green Norwegian knitted fisherman's sweater with ivory and coral-red lighthouse motifs across the chest, long sleeves, ribbed cuffs and hem; a small brass hurricane lantern attached at the left waist glowing warm amber. Complete standalone sweater on invisible body, no hanger or mannequin.
Style: polished warm hand-painted game item art for TIREDWOOD cozy seaside resort, clean chunky readable silhouette with fine dark-brown contour, soft painterly cel shading, visible cloth/wool/brass/feather materials, warm bright upper-left summer light, same family as fishing-vest, rubber-duck and classic float icons. True transparent alpha around each object, no cast shadow, no ground or scenery, no letters/numbers/labels/logos/watermark, no human or jelly characters. Strictly maintain all six different designs and large clear empty separation.
```

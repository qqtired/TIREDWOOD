# TIREDWOOD UI kit — справочник для групп экранов

## Версия 2 (11.10) — читай сначала

Владелец: раскладка и окна понравились, дизайн — нет; **HUD поверх игры сильно уменьшить**, панель бойца — отдельными
блоками на подложках. Окна, лавка, Хозяйство/Кладовая, журнал, меню Esc, Tab, итоги, ставка — **раскладку и размер не меняем**,
их переодевают шкурки сами. Меняешь только то, что висит поверх сцены. Ниже — всё, что поменялось в ките.

### Шкурки и шрифты
- `data-skin`: **`retro2`** «Ретро-парк 2.0» (по умолчанию) · **`beach`** «Пляжный день» · **`dusk`** «Закат». Старых
  `veranda/postcard/retro` больше нет — правила `[data-skin='postcard'] …` в экранах больше не срабатывают, убери их.
- Светлое и тёмное — **не по имени шкурки, а по токенам** (в «Закате» HUD тёмный, а окна светлые; в «Пляже» всё светлое):
  - силуэт неоткрытого предмета: `filter: var(--sil)` (вместо своих `--farm-sil` / правил для открытки);
  - цветной текст режима или команды: `.k-eyebrow`, `.k-mode-text` или `color: color-mix(in srgb, <цвет> var(--accent-k), var(--accent-to))`
    — на светлом сам темнеет, на тёмном стекле «Заката» светлеет. `color: var(--mode)` для текста больше не годится;
  - золото текстом — только `--gold-text` (и `--good-text --bad-text --info-text --special-text`), не `--gold`.
- Токены раздаются по месту: внутри `.k-hud` и HUD-деталей (`.k-plate .k-badge .k-tile .k-toast .k-event .k-prompt .k-ctx .k-chat .k-vitals .k-edge .k-hero`)
  — HUD-значения, внутри `.k-scrim` / `.k-window` — оконные. Поэтому: карточка поверх сцены — `.k-plate` (или `.k-panel` — в HUD она
  в «Закате» сама станет дымчатым стеклом); окно — только `.k-window` (лучше внутри `.k-scrim`).
- Заголовок **поверх сцены** (логотип, «Комната…», баннер) — цвет `--hero-text`, обводка/тень `--hero-outline` / `--hero-step-ink`.
  `--title-color` — это заголовок **на поверхности окна/страницы**: в «Пляже» и «Закате» он тёмный. Заголовок в шапке окна
  (`.k-win-head .k-win-title`) красится сам: в «Закате» шапка — эмалевая полоса цвета режима (`data-mode` окна) со светлым заголовком.
- Шрифт заголовков: retro2 — Rubik Mono One, beach — Unbounded, dusk — Dela Gothic One. На странице есть переключатель
  «Шрифт заголовков» (`data-font` на `<html>`: rubik · unbounded · dela · mono · russo) — он подменяет `--font-display`,
  `--display-weight/-case/-track/-scale/-word` на всей странице. Поэтому **любой размер заголовка — `calc(Npx * var(--display-scale))`**,
  шрифт — `var(--font-display)`, вес — `var(--display-weight)`, регистр — `var(--display-case)`; длинные — `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`.
- Текст — Rubik; вес 600–800 для обычного, 900 — только большие заголовки (600 и 800 теперь есть настоящие).
- Новые токены: `--plate-blur` (матовое стекло HUD, уже в ките) · `--sil` · `--accent-k --accent-to` · `--hero-text` · `--head-title` ·
  `--fs-15` · `--m-<режим>` (цвет режима внутри шкурки; сам `--mode` по `data-mode` — как раньше). Убраны: `--rivet`, `--lamp-dots`.
  Поля `--edge` **16** (было 20), `--slot-gap` 10.

### Размеры компактного HUD (сцена 1440×900)
| Деталь | v2 |
|---|---|
| `.k-badge` | высота 44, кольцо 36 (число 15), ник 14/600, жетоны 16/800. Разметка та же, что в v1 |
| `.k-tile` (новое) | подложка 54×54, иконка 40, клавиша `k-key--sm` в углу, подпись ПОД плиткой 14/700 + вторая строка 13, полоса 4 по желанию |
| `.k-ctx` | компактная: иконка 32, заголовок 13, значение 15, ширина по содержимому. Только если без текста никак (задание, ставка) |
| `.k-event` | ширина по содержимому ≤ 440, иконка 32, заголовок 16, таймер 18, подстрока 13 в одну строку (обрезается «…»), полоса 4 |
| `.k-toast` | ≤ 360, иконка 28, заголовок 15, подстрока 13 в одну строку, высота ~44–48 |
| `.k-prompt` | высота 42, текст 16, клавиша 26 (обычная `k-key`) |
| `.k-chat` | ширина 360, строки 14, закрытый чат 38, голос 38 |
| `.k-hero` | заголовок 56 (`is-sm` 40), подпись 18; `.k-count` 120 |
| `.k-meter` | 12 · `--thin` 6 · `--lg` 22 |
| Слоты | `--tl/--tr/--tc` от верха 16; `--bl` 380 шириной; `--bc` от низа 24 |
Всё, что не окно и больше 1/8 экрана, — уменьшай. Карточка режима в `--tl` (рыбалка: уровень+шансы; ферма) — **~80 % от v1**:
ширина 280–300, кольцо `.k-ring--sm` (40), легенда 13–14. Карта/статус крепости в `--tl` — ≤ 240×110, мини-карта 96–100.

### Плитки под бейджем `.k-tiles` / `.k-tile` (вместо широких `.k-ctx` для рюкзака, пива, лодки)
```html
<div class="k-slot k-slot--tr">
  <div class="k-badge"><span class="k-ring" style="--p:.64"><b>12</b></span><span class="k-badge-body"><span class="k-badge-nick">Кракозябра</span><span class="k-badge-tokens"><img class="k-coin" src="img/icons/coin.svg" alt="">1 250</span></span></div>
  <div class="k-tiles">
    <div class="k-tile"><span class="k-tile-face"><img src="img/icons/bag1.webp" alt=""><kbd class="k-key k-key--sm k-key--tr">I</kbd>
        <span class="k-meter k-meter--good" style="--v:.6"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i></span></span>
      <span class="k-tile-cap">6 / 10<small>22 <img class="k-coin" src="img/icons/coin.svg" alt=""></small></span></div>
    <div class="k-tile"><span class="k-tile-face"><img src="img/icons/beer.webp" alt="">
        <span class="k-meter" style="--v:.5"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i></span></span>
      <span class="k-tile-cap">7:40<small>+10 %</small></span></div>
  </div>
</div>
```
- Ряд идёт **справа налево: первая плитка в разметке — у края экрана** (рюкзак первым). `.k-tiles--left` — слева направо (для `--tl`).
- `.k-tile-face` — подложка; внутри картинка, клавиша (`k-key--sm k-key--tr`) и, по желанию, полоса `.k-meter` (сама встаёт вниз, 4 px).
- `.k-tile-cap` — подпись под плиткой: первая строка — текст, вторая — `<small>`. Коротко: «6 / 10», «7:40», «22 🪙». Без подписи — можно.
  Если в первой строке разметка — оберни её в `<b>` или `<span>` (`<b><span>7</span> / 10</b>`), иначе строка порвётся.
- Всплывающее у плитки: `.k-pop` выходит слева; если слева соседняя плитка — `.k-pop.k-pop--down` (под плиткой).
- Пилюля мельче `--sm`: `.k-pill--xs` (22 px, 13 px) — для компактных карточек.
- Тона: `.k-tile--own` (золотая обводка — твоя ставка), `.k-tile--warn` (красная — рюкзак полон), `.k-tile--off` (серая — нет/закрыто).
- `+N` у плитки — `<span class="k-pop is-still">+1</span>` внутри `.k-tile` (выйдет слева).

### Событие, тост, подсказка — разметка прежняя, только короче тексты
- `.k-event`: **одна строка заголовка** (≤ ~32 знаков) + подстрока одной строкой (≤ ~40 знаков) — длиннее обрежется «…».
  Счётчики врагов, голосование — `.k-event-actions` или отдельной маленькой строкой `.k-pill--sm`, но не второй плашкой.
- `.k-toast`: заголовок ≤ ~28 знаков, подстрока ≤ ~40 знаков (одна строка, дальше «…»).
- `.k-prompt`: одна клавиша + 2–4 слова. Несколько действий — через `.k-prompt-sep`, не больше трёх.
- Панель бойца и стрелки угроз — см. `kit/KIT-combat.md`, раздел «Версия 2».

### Что поменять в своих экранах (чек-лист)
1. Убрать `[data-skin='postcard'|'veranda'|'retro']`; светлое/тёмное — через `--sil`, `--accent-k/--accent-to`, `--*-text`.
2. Карточки `.k-ctx` под бейджем (рюкзак, пиво, лодка, бонус) → `.k-tiles`. Длинное задание — одна компактная `.k-ctx`.
3. Свои HUD-карточки (`--tl`, счёт, лента убийств, карта) — уменьшить: ширина ≤ 300, шрифт 14–16, числа 18–22, рамки — токены плашки.
4. Тексты событий и тостов — в одну строку.
5. Заголовки поверх сцены — `--hero-text`, не `--title-color`.
6. Проверить все три шкурки и хотя бы два шрифта заголовков (Unbounded самый широкий).

---

## Справочник версии 1 (разметка та же; размеры HUD — по таблице выше)

Файлы: `kit/tokens.css` (три шкурки v2: retro2 · beach · dusk), `kit/kit.css` (компоненты `.k-*`), `kit/sfx.js` (звуки), `page/page.js` (сцена и помощники).
Боевые детали (`.k-edge` стрелки угроз за краем экрана, `.k-vitals` панель бойца) — `kit/combat.css`, справочник — `kit/KIT-combat.md`.
Свой экран — только `screens/<группа>.js` + `screens/<группа>.css`. Чужие файлы не трогать. Классы `.k-*` не переопределять
у себя — нужен вариант, которого нет, напиши ведущему. Своё CSS группы — только раскладка (позиции, ширины) с префиксом группы.

## 1. Как подключиться
```js
// screens/fishing.js
import { stage, section, K, sfx, pushToast } from '../page/page.js';
const host = section('fishing');            // тело раздела #screens-fishing (null, если раздела нет)
stage(host, {
  id: 'fish-wait', title: 'Ждёшь поклёвку', note: 'Одна строка: что стало лучше.',
  bg: 'img/fishing/bg-pier.jpg',            // фон 1440×900 без интерфейса (пути — от index.html)
  before: 'img/fishing/asis-wait.jpg',      // снимок «как сейчас» → переключатель «Стало / Было»
  mode: 'fishing',                          // акцент: fishing farm fort race dungeon paintball hide skill pirates regatta
  states: [{ id: 'wait', label: 'ждёшь поклёвку' }, { id: 'reel', label: 'вываживание' }],
  render(scene, state) { scene.innerHTML = `<div class="k-slot k-slot--tc">…</div>`; },
});
```
- `scene` — `<div class="k-hud">` 1440×900 в пикселях сцены (масштаб делает страница). Рисуй в нём слоты и окна.
- `render` вызывается при старте и при смене состояния. Смена шкурки — только CSS (событие `skin-change` на window есть).
- `K.icon('beer.webp')` → `img/icons/beer.webp`; `K.coin()` — монетка; `K.key('E','k-key--tr')`; `K.mouse('l'|'r'|'wheel')`; `K.mic` — SVG.
- `pushToast(stackEl, { tone:'info'|'reward'|'warn'|'good', icon, title, sub }, { max:3, life:4200 })` — живой тост + звук.
- `sfx.play('click'|'open'|'close'|'reward'|'error'|'toast'|'tick'|'pop'|'level')`. Клики по `.k-btn/.k-tab/.k-close/.k-seg>button`
  звучат сами; свой звук — атрибут `data-sfx="reward"`.
- Картинки группы клади в `img/<группа>/` (webp/jpg, фон ≤250 КБ). Общие иконки — `img/icons/`; новые нарисованные иконки интерфейса
  (копии `client/assets/ui/icons/`) — `img/icons/ui/<id>.webp`: anchor bell boat camera chat collection compass emote exit float fog gift
  journal keys level livewell lock music online pin quest-fish radio rain records scroll season settings sound stopwatch ticket token
  voice wardrobe warn zombie. Комнаты (круглая «марка» из картинки загрузки) — `img/rooms/<lobby|race|fort|hide|skill|paintball|isle>.webp`.

## 2. Слоты сцены 1440×900 (v2: поля 16 px, координаты ниже — из v1, сдвиг на 4 px)
| Класс | Место | Рамка (x, y, ширина) | Что живёт |
|---|---|---|---|
| `.k-slot--tl` | верх-лево | 20, 20, 360 | статус режима: уровень фермы, карта, место в гонке |
| `.k-slot--tc` | верх-центр | 440, 20, 560 | ОДНА `.k-event`, под ней `.k-toasts` (≤3) |
| `.k-slot--tr` | верх-право | 1120, 20, 300 | `.k-badge` (уровень+жетоны), под ним ≤3 `.k-ctx` |
| `.k-slot--bl` | низ-лево | 20, низ 20, 420 | `.k-chat` (чат+голос) |
| `.k-slot--bc` | низ-центр | 440, низ 32, 560 | одна `.k-prompt` или панель действий режима |
| `.k-slot--br` | низ-право | 1100, низ 20, 320 | карточка улова, патроны, эмоции |
| `.k-slot--c` | центр, 32% высоты | по центру | `.k-hero` / `.k-count` / прицел |
Слот — колонка flex с `gap:12px`. Окно — внутри `.k-scrim` (затемнение + центрирование).
**z-order:** сцена 0 · слоты 10 · центр 15 · верх-центр (событие+тосты) 20 · `.k-scrim` с окном 30 · меню Esc 40 · загрузка 50.

## 3. Компоненты (разметка)
**Панель / ячейка / плашка** — `.k-panel` (как окно, без шапки) · `.k-cell` (карточка внутри окна) · `.k-well` (впадина) ·
`.k-plate` (плашка поверх сцены) · `.k-lamp` (+ к важной плашке: событие, баннер, рекорд; в «Ретро» — лампочки) · `.k-hr`.

**Окно**
```html
<div class="k-scrim"><section class="k-window is-in">
  <header class="k-win-head">
    <span class="k-win-portrait"><img src="img/icons/ui/journal.webp" alt=""></span>
    <div class="k-win-titles"><p class="k-eyebrow">Пирс · Дед Семён</p><h2 class="k-win-title">Журнал рыбака</h2></div>
    <div class="k-win-tools"><span class="k-pill k-pill--gold k-pill--lg"><img class="k-coin" src="img/icons/coin.svg" alt="">1 250</span>
      <button class="k-close" aria-label="Закрыть"><kbd class="k-key k-key--sm">Esc</kbd></button></div>
  </header>
  <nav class="k-tabs"><button class="k-tab is-on"><img class="k-ic" src="…">Рыбы <span class="k-tab-count">38</span></button>…</nav>
  <div class="k-win-body">…</div>
  <footer class="k-win-foot"><span class="k-note">…</span><button class="k-btn k-btn--sm">…</button></footer>
</section></div>
```
Размеры: `.k-window` 820 · `--sm` 460 · `--lg` 1100. С боковым меню: `.k-window.k-window--split` > `aside.k-win-side` + `section.k-win-main`
(внутри main — та же шапка/тело/подвал). Меню: `.k-nav` > `.k-nav-h` (заголовок группы) + `button.k-nav-item.is-on` (`img.k-ic` + текст).
Без портрета — просто не ставь `.k-win-portrait`, шапка перестроится сама.

**Кнопки** — `button.k-btn` + тон: `--gold` (по умолчанию, подтвердить) · `--go` (да/вперёд) · `--stop` (стоп/опасно) ·
`--special` (особое) · `--info` · `--ghost` (вторичное) ; размер `--sm` · `--lg` · `--wide` · `--icon` (квадрат с `img.k-ic`).
Вторая строка: `<button class="k-btn">Продать<small>+45 жетонов</small></button>`. Выкл.: `disabled` или `.is-off`.
Закрыть: `button.k-close` + `<kbd class="k-key k-key--sm">Esc</kbd>` внутри (сам встаёт в угол).

**Клавиша** — `<kbd class="k-key">E</kbd>`; размер `--sm` (13px) · `--lg`. **Прикрепить к углу**: добавь `k-key--tr|tl|br|bl|b`
внутрь элемента с `position:relative` (у `.k-btn .k-close .k-voice .k-chip .k-ctx .k-stat .k-cell .k-panel .k-prompt` уже есть).
`<button class="k-btn k-btn--go">Ещё<kbd class="k-key k-key--tr">Space</kbd></button>`. Несколько подряд — `.k-keys`.
**Мышь**: `<i class="k-mouse k-mouse--l"></i>` (`--r`, `--wheel`, `--move`); размер = font-size; в колпачке: `<span class="k-key k-key--lg"><i class="k-mouse k-mouse--l"></i></span>`.

**Пилюля** — `.k-pill` + `--gold|good|bad|info|special|mode|solid|plate`, размер `--sm|--lg`; внутри `img.k-coin` / `img.k-ic`.

**Полоса со следом** — значение `--v` 0…1, след `--g` (опускается с задержкой — ставь `--v` сразу, `--g` следующим кадром):
```html
<div class="k-meter k-meter--bad k-meter--lg" style="--v:.62;--g:.8"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i><span class="k-meter-label">62 / 100</span></div>
```
Цвет: по умолчанию золото; `--good|bad|info|special|mode`; `.is-hurry` → красный. Высота: `--thin` 8 · обычная 14 · `--lg` 24.

**Карточка-счётчик** (иконка + число + полоса + ОДНА короткая подпись):
```html
<div class="k-stat"><img class="k-stat-ic" src="…"><div class="k-stat-num">38<small>/ 74</small></div><div class="k-stat-cap">Видов поймано</div>
  <div class="k-meter k-meter--thin" style="--v:.51"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i></div></div>
```
`.k-stat--own` — своё/рекорд золотом; `.k-stat--empty` — ещё не открыто.

**Бейдж игрока** (только в `--tr`; уровень и жетоны больше нигде не показываем):
```html
<div class="k-badge"><span class="k-ring" style="--p:.64"><b>12</b></span>
  <span class="k-badge-body"><span class="k-badge-nick">Кракозябра</span><span class="k-badge-tokens"><img class="k-coin" src="img/icons/coin.svg" alt="">1 250</span></span>
  <span class="k-pop">+25</span></div>
```
`--p` — доля опыта до следующего уровня. `.k-pop` — пилюля под бейджем (+N, `--bad` для −N, `--xp` для опыта), живёт 1,6 с, в статичном мокапе — `.is-still`; `.k-badge-tokens.is-bump` — подпрыгнуть.
Кольцо отдельно: `.k-ring` (`--sm` 42 · обычное 60 · `--lg` 112), подпись под кольцом — `<small>ур.</small>`. `.k-ring--mode` — кольцо цветом режима (`--mode`) для уровня фермы/рыбалки, чтобы не путать с золотым уровнем игрока.

**Карточка контекста** (v2: компактная; рюкзак/пиво/лодка — плитками `.k-tiles`, см. «Версия 2»):
```html
<div class="k-ctx"><img class="k-ctx-ic" src="img/icons/beer.webp"><span class="k-ctx-title">Рыбацкое пиво</span><span class="k-ctx-val">+10% к выручке · 7:40</span>
  <span class="k-ctx-side"><kbd class="k-key">I</kbd></span><div class="k-meter k-meter--thin" style="--v:.5">…</div></div>
```
`.k-ctx--own` — золотая обводка (твоя ставка).

**Тост** (в `.k-toasts` под событием):
```html
<div class="k-toast k-toast--reward"><span class="k-toast-ic"><img src="img/icons/ui/token.webp" alt=""></span><div class="k-toast-title">+45 жетонов</div><div class="k-toast-sub">Скумбрия ушла Деду Семёну</div></div>
```
Тоны: (инфо по умолчанию) · `--reward` · `--warn` · `--good`. Появление `.is-new`, уход `.is-out`. Иконка обязательна (картинка, не эмодзи).

**Плашка события** (одна, в `--tc`):
```html
<div class="k-event k-lamp"><span class="k-event-ic"><img src="…"></span><div class="k-event-title">Шторм через 1:20</div>
  <div class="k-event-sub">Беги к маяку по мосткам — кто зажжёт свет первым, получит жетоны</div><div class="k-event-timer">1:20</div>
  <div class="k-meter k-meter--thin k-meter--mode" style="--v:.6">…</div>
  <div class="k-event-actions">…кнопки голосования…</div></div>
```
Тон: акцент режима по умолчанию; `--danger` · `--good` · `--special`. Таймер `.is-hurry` — последние секунды.

**Подсказка действия** (одна, в `--bc`): `<div class="k-prompt"><kbd class="k-key">E</kbd>Сесть за стол<span class="k-prompt-sep"></span><span class="k-pill k-pill--gold k-pill--sm">…10</span></div>`
`.k-prompt--urgent` — «ПОДСЕКАЙ!» (золотое кольцо, пульс) · `.k-prompt--off` — нельзя сейчас + `<span class="k-prompt-note">почему</span>`.

**Герой-баннер** (в `--c`): `<div class="k-hero k-hero--gold is-pop"><p class="k-hero-title">Отличный улов!</p><span class="k-hero-sub">Скумбрия · 1,2 кг</span></div>`
Тоны `--gold|win|lose|info`; `.k-hero-title.is-sm` — поменьше; `.is-pop` — появиться и остаться, `.is-play` — появиться и растаять (3,2 с).
**Отсчёт**: `<div class="k-count is-tick">3</div>`, «Старт!» — `.k-count--go`.

**Итоги** — окно `.k-window.k-window--sm` без шапки:
```html
<div class="k-results-head"><p class="k-eyebrow">Картинг · 3 круга</p><h2 class="k-results-title">Ты второй!</h2><p class="k-results-sub">…</p></div>
<div class="k-win-body"><table class="k-table">…<tr class="is-own">…</tr></table><div class="k-reward"><img class="k-coin" …><b>+40</b> жетонов</div></div>
<div class="k-results-actions"><button class="k-btn k-btn--go">Ещё раз<kbd class="k-key k-key--tr">R</kbd></button><button class="k-btn k-btn--ghost">На набережную<kbd class="k-key k-key--tr">Esc</kbd></button></div>
```
**Таблица**: `table.k-table`, числа — `td.k-r`, своя строка — `tr.is-own`, место — `<span class="k-place k-place--1">1</span>` (1–3 медали), игрок — `<span class="k-who">`.

**Настройки**: строка `.k-row` > `div` (`.k-row-title` + `.k-row-hint`) + `.k-row-ctl`. Переключатель:
`<label class="k-switch"><input type="checkbox"><span class="k-switch-track"></span>Текст</label>`. Сегменты: `.k-seg` > `button.is-on`.
Ползунок: `<input class="k-slider" type="range" style="--v:.7">` (+ `.k-row-val`). Поле: `input.k-input`.

**Фишки и окно ставки** (крысиные бега, рулетка рыбака, ставки как в блэкджеке): `button.k-chip.k-chip--5|10|20|50|100|500`
(`--sm` 44 px, выбранная `.is-on`, нет денег — `disabled`; клавиша — `k-key k-key--sm k-key--br` внутри). Окно ставки:
```html
<div class="k-bet"><div class="k-bet-chips"><button class="k-chip k-chip--10">10<kbd class="k-key k-key--sm k-key--br">1</kbd></button>…</div>
  <div class="k-bet-row"><label class="k-bet-amount">Ставка <input class="k-input k-bet-input" inputmode="numeric" value="30"></label>
    <button class="k-btn k-btn--gold">Поставить<kbd class="k-key k-key--tr">E</kbd></button>
    <span class="k-pill k-pill--gold k-pill--lg"><img class="k-coin" src="img/icons/coin.svg" alt="">1 250</span></div>
  <p class="k-bet-note">от 5 до 500 жетонов</p></div>
```

**Чат + голос** (в `--bl`):
```html
<div class="k-chat"><div class="k-chat-list">
  <div class="k-chat-line k-nick-1"><b>Паша</b>кто на рыбалку?</div>
  <div class="k-chat-line is-sys">Бочка зашла на набережную</div>
  <div class="k-chat-line is-own k-nick-6"><b>Ты</b>иду!</div></div>
  <div class="k-chat-bar"><button class="k-voice" aria-label="Голос">${K.mic}<kbd class="k-key k-key--sm">V</kbd></button>
    <label class="k-chat-input is-typing"><span>Всем:</span><input value="…"><kbd class="k-key">Enter</kbd></label></div>
  <div class="k-speaking"><span class="k-pill k-pill--sm"><span class="k-eq"><i></i><i></i><i></i></span>Паша</span></div></div>
```
Закрытый чат: `.k-chat-closed` (`<kbd class="k-key">Enter</kbd> Написать в чат`). Голос: `.k-voice.is-live` (говоришь) · `.is-muted`.
Ник — `.k-nick-1…6` на строке. Старые строки `.is-old`. Курсор — `<i class="k-caret"></i>`.

**Кто где (Tab)**: `.k-online-row` > `.k-ring.k-ring--sm` + `.k-online-nick` + `.k-online-room` (`img.k-ic` + комната) + `.k-online-act` (кнопки).
`.is-me` — ты (золото), `.is-talk` — говорит сейчас.

**Мелочи**: `.k-eyebrow` (надзаголовок, цвет режима) · `.k-display` (заголовочный шрифт шкурки) · `.k-ic` (картинка 1.5em) ·
`.k-coin` · `.k-dim` · `.k-faint` (13px, только третичное) · `.k-gold` · `.k-good` · `.k-bad` · `.k-num`.

## 4. Токены (если очень нужно в своём CSS)
Текст `--surf-text --surf-dim --surf-faint` · поверхности `--panel-bg --surf-2 --surf-3 --plate-bg --line --line-strong` ·
смысл `--gold --good --bad --info --special` (+ `-hi -lo -ink -soft -text`) · акцент режима `--mode --mode-soft` ·
шрифты `--font-text --font-display --display-scale` · шкала `--fs-13 14 16 18 22 28 36 48 72` · отступы `--sp-1…10` ·
радиусы `--r-xs sm md lg xl pill` · `--edge` 20 · `--focus`. На светлых поверхностях («Пляж», окна «Заката») текст золотом — только `--gold-text`, не `--gold`; силуэт — `var(--sil)`.

## 5. DO / DON'T
- DO: одна информация — в одном месте (уровень/жетоны — только бейдж; клавиша — колпачком на кнопке, не в отдельной легенде).
- DO: шрифт ≥14 px; 13 px — только третичные подписи (`.k-faint`, `k-key--sm`). Числа — `tabular-nums` (уже в ките).
- DO: картинки-иконки (`img/icons/ui/` — новые, `img/icons/` — старые предметы), не эмодзи; эмодзи — только заглушка с `<!-- TODO icon -->`.
- DO: своё — золотом (`.is-own`, `--own`, `k-pill--gold`), опасность — красным, награда — золото/мята, инфо — нейтрально.
- DO: тексты на «ты», коротко, от лица игрока; числа и названия — из кода игры.
- DO: проверь все три шкурки — особенно светлый «Пляж» поверх неба и «Закат» (тёмный HUD + светлые окна).
- DON'T: свои цвета/тени/радиусы в обход токенов; свои кнопки, клавиши, окна; `title`-подсказки как единственное пояснение.
- DON'T: две системы в одном слоте; плашки в центре экрана (кроме героя и прицела); больше 3 тостов; вторую плашку события.
- DON'T: менять вид шкалы вываживания и цвета категорий рыбы (`--tier-*`) — только окружение.
- DON'T: синие+жёлтые флаги/вымпелы/лодки на картинках.

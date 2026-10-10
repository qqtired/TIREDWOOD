# Боевые компоненты кита — `kit/combat.css`

Для режимов со стрельбой: крепость, пейнтбол, пираты. Только токены — работают во всех трёх шкурках.
Подключение: `<link rel="stylesheet" href="kit/combat.css">` после `kit.css`. Анимации `k-hurry` берутся из kit.css.

## Панель бойца `.k-vitals` (слот `.k-slot--bc`, 560 px)
Здоровье · оружие · патроны и рывок — одна плашка по центру снизу (по образцу «Подземелья»). Подсказка «E — …»
встаёт над ней в тот же слот.
```html
<div class="k-vitals">
  <div class="k-vitals-hp">                                   <!-- .is-low — мало здоровья (красное число, пульс) -->
    <div class="k-vitals-row"><img class="k-vitals-ic" src="…heart…" alt=""><b class="k-vitals-num">100</b></div>
    <div class="k-meter k-meter--bad" style="--v:1;--g:1"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i></div>
  </div>
  <div class="k-vitals-arms">
    <div class="k-arm is-on"><img src="…" alt=""><span>Маркер</span><kbd class="k-key k-key--sm k-key--tr">1</kbd></div>
    <div class="k-arm"><img src="…" alt=""><span>Дробовик</span><kbd class="k-key k-key--sm k-key--tr">2</kbd></div>
    <div class="k-arm"><img src="…" alt=""><span>2 / 3</span><kbd class="k-key k-key--sm k-key--tr">G</kbd></div>
  </div>
  <div class="k-vitals-ammo">                                 <!-- .is-empty — магазин пуст (красное число) -->
    <div class="k-vitals-row"><kbd class="k-key k-key--sm">R</kbd><b class="k-vitals-num">24<small>/ 30</small></b></div>
    <div class="k-meter k-meter--thin" style="--v:.8"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i></div>
    <div class="k-vitals-dash"><span class="k-vitals-cap">Рывок</span><kbd class="k-key k-key--sm">Shift</kbd>
      <div class="k-meter k-meter--thin k-meter--info" style="--v:1"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i></div></div>
  </div>
</div>
```
Слот оружия `.k-arm`: `.is-on` — в руках (приподнят, золотая обводка), `.is-off` — не куплен (серый), `.is-empty` — нет гранат.
Вся панель `.is-down` — игрока повалили (серая). Перезарядка — та же тонкая полоса патронов `k-meter--info` с `--v` прогресса.

## Стрелка угрозы у края `.k-edge`
Диск с картинкой врага, нос показывает направление, под диском — что это и сколько метров (≥14 px).
Ставится внутрь сцены `position:absolute`; координаты — центр диска, `--a` — направление на цель
(0° вправо, 90° вниз, 180° влево, 270° вверх).
```html
<div class="k-edge k-edge--bad k-edge--left is-hot" style="left:58px;top:470px;--a:180deg">
  <span class="k-edge-disc"><img src="…climber…" alt=""></span>
  <span class="k-edge-label">на стене ×2 · <b>23 м</b></span>
</div>
```
Тон: по умолчанию — акцент режима; `--bad` — опасность для тебя/строений, `--gold` — добыча (ящик припасов),
`--info`, `--special`. Размер `--lg` (84 px) — босс. `.is-hot` — пульс (атакует прямо сейчас).
Подпись: `--left` / `--right` — прижать внутрь у бокового края, `--up` — над диском (у нижнего края).
Эмодзи-заглушка до картинки: `<span class="k-edge-emoji">🦇</span>` вместо `img` (TODO icon).

## Прицел `.k-cross` и цифры `.k-float`
```html
<div class="k-cross is-head"><i></i><i></i><i></i><i></i></div>     <!-- .is-hit — попал, .is-head — в голову (золото) -->
<span class="k-float" style="left:520px;top:320px">20</span>               <!-- урон -->
<span class="k-float k-float--head" style="…">34</span>                     <!-- в голову -->
<span class="k-float k-float--crit" style="…">85<small>×2,5</small></span>  <!-- крит -->
<span class="k-float k-float--gold" style="…"><img src="…золото…" alt="">+14</span>
```
`.k-float.is-rise` — всплыть и растаять (1,1 с). Прицел встаёт в центр сцены сам.

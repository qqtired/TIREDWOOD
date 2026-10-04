// Калькулятор шансов рыбалки TIREDWOOD (страница /fishing). Формула — та же, что у сервера игры
// (shared/fishrules.ts: tierOdds → rankShares, weatherMul, bonusMul; shared/fishprogress.ts: fishCastMods).
// Цифры ниже выгружены из кода игры; проверка — сверка со всеми сочетаниями настроек.
'use strict';
var FishCalc = (function () {
  var D = __DATA__;
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  // Снимок бонусов заброса: как fishCastMods
  function mods(o) {
    var level = clamp(Math.trunc(o.level) || 0, 0, 10);
    var drink = D.drinks[o.drink] || null;
    var lure = D.lures[o.lure] || null;
    return {
      level: level,
      rare: (1 + D.LEVEL_ODDS * level) * (1 + 0.05 * o.rod) * (drink ? drink.rare : 1),
      epic: lure ? lure.epic : 1,
      top: drink && drink.top ? drink.top : 1
    };
  }
  function weatherMul(rank, w) {
    if (w === 0 || rank < 1) return 1;
    if (w === 2 && rank >= 2) return D.SEASON_MUL;
    return rank <= 4 ? D.RAIN_MUL : 1;
  }
  function bonusMul(rank, m) {
    if (rank < 1) return 1;
    var k = clamp(m.rare, 1, 4);
    if (rank >= 2) k *= clamp(m.epic, 1, D.EPIC_MAX);
    if (rank >= 2 && rank <= 4) k *= clamp(m.top, 1, 2);
    return k;
  }
  // Доли всех поклёвок: обычные, редкие, эпические, легендарные, мифические, хлам, сундук, божественная
  function odds(o) {
    var m = mods(o);
    var base = D.BASE[o.zone === 'barkas' ? 'barkas' : 'pier'];
    var w = o.weather;
    var out = base.map(function (b, k) { return k === 0 ? 0 : b * weatherMul(k, w) * bonusMul(k, m); });
    var top = out.reduce(function (a, b) { return a + b; }, 0);
    var capped = top > 1;
    if (capped) out = out.map(function (x) { return x / top; });
    else out[0] = 1 - top;
    var junk = Math.round(D.JUNK * (10 - m.level) / 10);
    var fish = 1 - (D.CHEST + junk) / 10000;
    var res = out.slice(0, 5).map(function (x) { return fish * x; });
    res.push(junk / 10000, D.CHEST / 10000, fish * out[5]);
    return { p: res, capped: capped };
  }
  return { odds: odds, D: D };
})();

if (typeof document !== 'undefined') (function () {
  var form = document.getElementById('calc');
  if (!form) return;
  var bar = document.getElementById('calc-bar');
  var rows = document.getElementById('calc-rows');
  var hint = document.getElementById('calc-hint');
  var lvl = document.getElementById('calc-level');
  var lvlOut = document.getElementById('calc-level-v');
  // порядок показа: обычные … мифические, божественная, хлам, сундук
  var ORDER = [0, 1, 2, 3, 4, 7, 5, 6];
  var NAMES = ['Обычные', 'Редкие', 'Эпические', 'Легендарные', 'Мифические', 'Хлам', 'Сундук', 'Божественная'];
  function fmt(x) {
    var v = x * 100;
    if (v === 0) return '0 %';
    var s = v >= 10 ? v.toFixed(1) : v >= 1 ? v.toFixed(2) : v.toFixed(2);
    if (v < 0.1) s = v.toFixed(3);
    return s.replace('.', ',') + ' %';
  }
  function oneIn(x) {
    if (x <= 0) return '—';
    var n = 1 / x;
    if (n < 1.5) return 'почти всегда';
    return '≈ 1 из ' + (n < 20 ? (Math.round(n * 10) / 10).toString().replace('.', ',') : Math.round(n).toLocaleString('ru-RU'));
  }
  function read() {
    var f = new FormData(form);
    return {
      zone: f.get('zone'), weather: Number(f.get('weather')), level: Number(f.get('level')),
      rod: Number(f.get('rod')), lure: Number(f.get('lure')), drink: Number(f.get('drink'))
    };
  }
  function render() {
    var o = read();
    if (o.zone === 'barkas' && o.level < 3) { lvl.value = '3'; o.level = 3; }
    lvlOut.textContent = String(o.level);
    var r = FishCalc.odds(o);
    bar.innerHTML = '';
    rows.innerHTML = '';
    ORDER.forEach(function (k) {
      var x = r.p[k];
      if (x > 0) {
        var s = document.createElement('span');
        s.style.setProperty('--c', 'var(--t' + k + ')');
        s.style.width = (x * 100) + '%';
        s.title = NAMES[k] + ': ' + fmt(x);
        if (x >= 0.06) { var b = document.createElement('b'); b.textContent = fmt(x); s.appendChild(b); }
        bar.appendChild(s);
      }
      var row = document.createElement('div');
      row.className = 'row' + (x > 0 ? '' : ' zero');
      row.innerHTML = '<i class="dot"></i><span></span><span class="p"></span><span class="n"></span>';
      row.firstChild.style.setProperty('--c', 'var(--t' + k + ')');
      row.children[1].textContent = NAMES[k];
      row.children[2].textContent = fmt(x);
      row.children[3].textContent = oneIn(x);
      rows.appendChild(row);
    });
    var notes = [];
    if (r.capped) notes.push('<b>Обычные рыбы закончились.</b> Сумма редких и выше перевалила за 100 %, поэтому обычных нет, а остальные поделили всё в прежних пропорциях. Дальше уровень, удочка и пиво уже ничего не добавляют — сдвинуть улов к крупной рыбе могут только блесна, водка и сезон рыбалки.');
    if (o.drink === 4) notes.push('<b>Водка:</b> зона на шкале на 20 % меньше, рывки рыбы на 20 % быстрее, а ты пьян (зона по инерции, икота, моргание) — вытащить труднее. На божественную водка не действует.');
    if (o.zone === 'barkas') notes.push('<b>Баркас</b> пускает с 3-го уровня. Рыба там своя и злее, зато платит и даёт опыта ×1,25.');
    hint.innerHTML = notes.map(function (n) { return '<p class="note">' + n + '</p>'; }).join('');
  }
  form.addEventListener('input', render);
  form.addEventListener('change', render);
  render();
})();

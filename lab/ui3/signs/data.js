// Пары «сейчас / v3» для страницы вывесок (собирает scratchpad signs-page.mjs из снимков игры). world — кадры площади 1440×900
// с одной точки; boards и plaques — картинки вывесок (холсты из игры). Поля: name, file (где в коде), note (что поменялось),
// now, v3 (пути в img/), more — [{ label, src }] — другие состояния в v3.
window.SIGNS = {
 "world": [
  {
   "name": "«Рыбный двор» над аркой",
   "now": "img/w-hide-now.webp",
   "v3": "img/w-hide-v3.webp"
  },
  {
   "name": "«Примерочная»; вдали «Аквапарк» и «Аэроклуб»",
   "now": "img/w-wardrobe-now.webp",
   "v3": "img/w-wardrobe-v3.webp"
  },
  {
   "name": "«Регата» через бухту",
   "now": "img/w-regatta-now.webp",
   "v3": "img/w-regatta-v3.webp"
  },
  {
   "name": "«Подземелье»",
   "now": "img/w-dungeon-now.webp",
   "v3": "img/w-dungeon-v3.webp"
  },
  {
   "name": "Крысиные бега и рыбный двор",
   "now": "img/w-rat-now.webp",
   "v3": "img/w-rat-v3.webp"
  },
  {
   "name": "Рыбацкая доска и витрина улова",
   "note": "Кадр снят до последней правки: в игре доска чуть светлее, чтобы не уходила в чёрное под светом сцены.",
   "now": "img/w-fishboard-now.webp",
   "v3": "img/w-fishboard-v3.webp"
  },
  {
   "name": "Курзал: «Топ проигравших»",
   "now": "img/w-losers-now.webp",
   "v3": "img/w-losers-v3.webp"
  },
  {
   "name": "Доска рекордов у входа в «Подземелье»",
   "now": "img/w-dboard-now.webp",
   "v3": "img/w-dboard-v3.webp"
  },
  {
   "name": "Ворота «ФЕРМА»",
   "now": "img/w-farmgate-now.webp",
   "v3": "img/w-farmgate-v3.webp"
  },
  {
   "name": "Гидроплан",
   "now": "img/w-plane-now.webp",
   "v3": "img/w-plane-v3.webp"
  },
  {
   "name": "Сцена «Ракушки»: вывеска над аркой",
   "note": "Табло на сцене («Во что играем?») — экран самой викторины, его пока не трогали.",
   "now": "img/w-rakushka-now.webp",
   "v3": "img/w-rakushka-v3.webp"
  }
 ],
 "boards": [
  {
   "name": "Крысиные бега",
   "file": "lobby/ratraceboard.ts",
   "note": "Экран в золотой раме: название золотом, состояние — плашкой с огоньком, коэффициенты золотом, клавиша E — колпачком, как в HUD. Рама щита — слива и золото; столбы и флажки — как были.",
   "now": "img/rat-now.webp",
   "v3": "img/rat-v3.webp",
   "more": [
    {
     "label": "v3 · забег",
     "src": "img/rat-v3-2.webp"
    }
   ]
  },
  {
   "name": "Рулетка рыбака",
   "file": "lobby/rouletteboard.ts",
   "note": "Название золотом или статус плашкой, ×2 и ×36 — золотом, масти — плашками со скосом. Рама щита — слива, столбики — дерево.",
   "now": "img/roulette-now.webp",
   "v3": "img/roulette-v3.webp",
   "more": [
    {
     "label": "v3 · раунд",
     "src": "img/roulette-v3-2.webp"
    }
   ]
  },
  {
   "name": "Регата: щит на арке",
   "file": "lobby/regattacourse3d.ts",
   "note": "Заголовок золотом, места — медальонами (золото, серебро, бронза), время — золотом. Рама щита — слива, пилоны — как были.",
   "now": "img/regatta-now.webp",
   "v3": "img/regatta-v3.webp"
  },
  {
   "name": "Регата: обратная сторона арки",
   "file": "lobby/regattacourse3d.ts",
   "now": "img/regatta-back-now.webp",
   "v3": "img/regatta-back-v3.webp"
  },
  {
   "name": "Регата: номера на буях",
   "file": "lobby/regattacourse3d.ts",
   "note": "Медальон: слива, золотая кайма, номер кремом.",
   "now": "img/buoy-now.webp",
   "v3": "img/buoy-v3.webp"
  },
  {
   "name": "«Топ проигравших» у автоматов",
   "file": "lobby/losers.ts",
   "note": "Экран в золотой раме: заголовок золотом, полосы со скосом, своя строка — золотом, медали и монетки — как были, проигрыш — красным. Рама в 3D — слива и золото.",
   "now": "img/losers-now.webp",
   "v3": "img/losers-v3.webp",
   "more": [
    {
     "label": "v3 · с игроками",
     "src": "img/losers-v3-2.webp"
    }
   ]
  },
  {
   "name": "Доска у входа в «Подземелье»",
   "file": "lobby/plaza/dungeon.ts",
   "note": "Экран вместо пергамента: «Подземелье» кремом между ромбами варенья, места — медальонами, волны — золотом. Деревянная рама модели осталась.",
   "now": "img/dungeon-now.webp",
   "v3": "img/dungeon-v3.webp"
  },
  {
   "name": "«Ракушка»: табло «Загадки» на сцене",
   "file": "lobby/quiz/ui/board-riddle2.ts",
   "note": "Новая раскладка по твоей просьбе, вид «Панели» (решение №19): шапка в одну строку — игра, тема, время; под ней кто загадывает и какая загадка по счёту; слева «Тепло» и «Горячо», справа подсказки и «мимо», внизу очередь. Цвета табло — свои, как было.",
   "now": "img/riddle-now.webp",
   "v3": "img/riddle-v3.webp",
   "more": [
    {
     "label": "новое · «горячо» и длинные подсказки",
     "src": "img/riddle-v3-2.webp"
    },
    {
     "label": "новое · ждём слово",
     "src": "img/riddle-v3-3.webp"
    }
   ]
  }
 ],
 "plaques": [
  {
   "name": "Таблички мест — все разом",
   "file": "lobby/plaza3/signs.ts",
   "note": "Слива, одна золотая кайма, звёздочки в скосах; иконка — в медальоне с кольцом цвета режима; название — крупно кремом. Полосатой маркизы больше нет. Так в игре склеены все таблички площади — одна картинка на всех.",
   "now": "img/atlas-now.webp",
   "v3": "img/atlas-v3.webp"
  },
  {
   "name": "Строки статуса под табличками",
   "file": "lobby/plaza3/signs.ts",
   "note": "Фон в тон таблички, слова кремом, числа золотом, точка смысла (свободно, идёт, занято) осталась.",
   "now": "img/status-now.webp",
   "v3": "img/status-v3.webp"
  },
  {
   "name": "«ФЕРМА» у ворот",
   "file": "farm/lobbygate.ts",
   "note": "По краю — деревянная кромка, на ней сливовая табличка с золотой каймой; «ФЕРМА» — кремом.",
   "now": "img/farmgate-now.webp",
   "v3": "img/farmgate-v3.webp"
  },
  {
   "name": "Гидроплан",
   "file": "lobby/plane3d.ts",
   "note": "Слива с каймой, цена — золотом, статус — цветом HUD: свободен — зелёный, посадка — золото, в полёте — бирюза.",
   "now": "img/plane-now.webp",
   "v3": "img/plane-v3.webp"
  },
  {
   "name": "Табличка «Ласточки»",
   "file": "lobby/boatsign.ts",
   "note": "Слива и кайма, спасательный круг — прежний, цвета статуса — из HUD.",
   "now": "img/lastochka-now.webp",
   "v3": "img/lastochka-v3.webp"
  },
  {
   "name": "Места у пирса лодок",
   "file": "boat/models.ts",
   "note": "Номер — золотом, «свободно» — зелёным, своё место — яркой каймой.",
   "now": "img/boatpier-now.webp",
   "v3": "img/boatpier-v3.webp"
  },
  {
   "name": "Рыбацкая доска",
   "file": "lobby/fishboard.ts",
   "note": "Слива с каймой и звёздочками вместо эмодзи-удочки; медали, места и числа — как были, числа — золотом.",
   "now": "img/fishboard-now.webp",
   "v3": "img/fishboard-v3.webp"
  },
  {
   "name": "«Сезон рыбалки» у Лавки",
   "file": "lobby/seasonsign.ts",
   "note": "Время — крупно золотом; в сезон заголовок — на коралловой плашке.",
   "now": "img/season-field-now.webp",
   "v3": "img/season-field-v3.webp"
  },
  {
   "name": "«Сезон рыбалки» на баркасе — деревянная доска",
   "file": "lobby/seasonsign.ts",
   "note": "Доска осталась доской: канат, рыбки и дерево по краям, надпись — на привинченной сливовой табличке.",
   "now": "img/season-barkas-now.webp",
   "v3": "img/season-barkas-v3.webp"
  },
  {
   "name": "«Снасти у Семёна»",
   "file": "lobby/fisherman.ts",
   "note": "Дерево с табличкой v3.",
   "now": "img/fisherman-now.webp",
   "v3": "img/fisherman-v3.webp"
  },
  {
   "name": "Бирки витрины улова",
   "file": "lobby/plaza3/showcase.ts",
   "note": "Слива и кайма, вес — золотом, ник — кремом.",
   "now": "img/tags-now.webp",
   "v3": "img/tags-v3.webp"
  },
  {
   "name": "Пьедестал: подпись места",
   "file": "lobby/fishpodium.ts",
   "note": "«N МЕСТО» — цветом медали на сливе.",
   "now": "img/podium-now.webp",
   "v3": "img/podium-v3.webp"
  },
  {
   "name": "Вывеска «Ракушки» над аркой",
   "file": "lobby/quiz/ui/sign.ts",
   "note": "Слива, одна золотая кайма со скосами и звёздочками, «РАКУШКА» — кремом, под ним золотая черта; статус — золотом, когда игра идёт, кремом — когда можно зайти.",
   "now": "img/rakushka-now.webp",
   "v3": "img/rakushka-v3.webp"
  },
  {
   "name": "Пьедестал: планка «Крупнейшие рыбы»",
   "file": "lobby/fishpodium.ts",
   "note": "Слива и кайма вместо прежней планки.",
   "now": "img/podium-rail-now.webp",
   "v3": "img/podium-rail-v3.webp"
  }
 ]
};

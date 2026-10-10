// Иконки: весь новый набор (client/assets/ui/icons, Codex imagegen) по группам + «было → стало» для эмодзи.
import { section, K, sfx } from '../page/page.js';

const host = section('icons');

const GROUPS = [
  ['Общие', [
    ['token', 'Жетон'], ['level', 'Уровень'], ['chat', 'Чат'], ['voice', 'Голос'], ['sound', 'Звук'], ['online', 'Кто где'],
    ['settings', 'Настройки'], ['records', 'Рекорды'], ['collection', 'Коллекция'], ['gift', 'Подарок'], ['keys', 'Клавиши'],
    ['exit', 'Выход'], ['wardrobe', 'Примерочная'], ['emote', 'Эмоции'], ['pin', 'Где ты'], ['stopwatch', 'Время'],
    ['bell', 'Колокол'], ['warn', 'Внимание'], ['scroll', 'Задание'], ['lock', 'Закрыто'], ['music', 'Музыка'],
    ['camera', 'Фото'], ['ticket', 'Билет'],
  ]],
  ['Рыбалка и море', [
    ['journal', 'Журнал рыбака'], ['livewell', 'Лайвел'], ['quest-fish', 'Задание Семёна'], ['float', 'Поклёвка'],
    ['season', 'Сезон рыбалки'], ['rain', 'Дождь'], ['fog', 'Туман'], ['anchor', 'Якорь'], ['boat', 'Лодка'],
    ['radio', 'Радио'], ['compass', 'Компас'], ['release', 'Отпустить'], ['sell', 'Продать'], ['odds', 'Шансы'],
    ['buoy', 'Бакен'], ['lighthouse', 'Маяк'], ['storm', 'Шторм'],
  ]],
  ['Крепость', [
    ['gold', 'Золото крепости'], ['horn', 'Волна'], ['zombie', 'Зомби'], ['climber', 'Верхолаз'], ['bat', 'Нетопырь'],
    ['brute', 'Бугай'], ['champion', 'Чемпион'], ['boss', 'Босс'], ['landing', 'Десант'], ['supply', 'Припасы'],
    ['bomb', 'Граната'], ['shield', 'Щит'], ['ladder', 'Лестница'], ['hammer', 'Ремонт'],
    ['runner', 'Шустрик'], ['medic', 'Лекарь'], ['kraken', 'Кракен'], ['meteor', 'Метеоры'], ['white-flag', 'Сдаться'], ['marker', 'Маркер'],
  ]],
  ['Ферма', [
    ['rift-tree', 'Древо разлома'], ['grumpy-cone', 'Шишка-ворчунья'], ['straw-hat', 'Шляпа'], ['garden-bed', 'Грядка'], ['card-frame', 'Рамка карточки'],
  ]],
  ['Режимы и события', [
    ['heart', 'Здоровье'], ['paint', 'Пейнтбол'], ['paintballs', 'Патроны'], ['flag-finish', 'Финиш'], ['kart', 'Картинг'],
    ['kart-turbo', 'Турбо'], ['kart-jam', 'Варенье'], ['kart-bubble', 'Пузырь'], ['kart-clap', 'Хлопок'],
    ['medal-gold', 'Золото'], ['medal-silver', 'Серебро'], ['medal-bronze', 'Бронза'], ['pirate-flag', 'Пираты'],
    ['loot', 'Добыча'], ['slide', 'Аквапарк'], ['roulette', 'Рулетка'], ['rat', 'Крысиные бега'], ['cards', 'Карты'],
    ['bell-cloud', 'Выше облаков'], ['hide-box', 'Прятки'], ['regatta', 'Регата'], ['farm-gate', 'Ферма'], ['dungeon', 'Подземелье'],
  ]],
];

const SWAPS = [
  ['🪙', 'token', 'жетоны'], ['🎣', 'float', 'рыбалка'], ['📖', 'journal', 'журнал'], ['🎒', 'livewell', 'лайвел'],
  ['🧟', 'zombie', 'враги крепости'], ['🌧', 'rain', 'дождь'], ['🏆', 'records', 'рекорды'], ['⚙︎', 'settings', 'настройки'],
];

const ic = (id) => K.icon(`ui/${id}.webp`);

if (host) {
  const wrap = document.createElement('div');
  wrap.className = 'ic-wrap';
  wrap.innerHTML = `
    <p class="ic-lead">${GROUPS.reduce((a, g) => a + g[1].length, 0)} иконок нарисованы через imagegen тем же стилем, что и иконки фермы, крепости и лавки рыбака: предмет в три четверти,
      тонкий тёмный контур, тёплый свет. Надписей и цифр на них нет. В игре они заменят эмодзи: эмодзи на разных компьютерах выглядят по-разному, а иконки одинаково и крупнее.</p>
    <div class="k-panel ic-swaps">
      <h3 class="ic-h">Было → стало</h3>
      <div class="ic-swap-row">${SWAPS.map(([e, id, t]) => `
        <div class="ic-swap"><span class="ic-emoji">${e}</span><span class="ic-arrow">→</span><img src="${ic(id)}" alt=""><small>${t}</small></div>`).join('')}
      </div>
    </div>
    ${GROUPS.map(([title, list]) => `
      <div class="k-panel ic-group">
        <h3 class="ic-h">${title} <span>${list.length}</span></h3>
        <div class="ic-grid">${list.map(([id, name]) => `
          <button class="ic-tile" type="button" data-id="${id}" title="">
            <img class="ic-big" src="${ic(id)}" alt="" loading="lazy">
            <img class="ic-small" src="${ic(id)}" alt="" loading="lazy">
            <span>${name}</span>
          </button>`).join('')}
        </div>
      </div>`).join('')}
    <p class="ic-note">Справа внизу у каждой иконки — она же в размере 32 px, как в плашках HUD.</p>`;
  host.append(wrap);
  wrap.addEventListener('click', (e) => {
    const t = e.target.closest('.ic-tile');
    if (!t) return;
    t.classList.remove('is-pop');
    void t.offsetWidth;
    t.classList.add('is-pop');
    sfx.play('pop');
  });
}

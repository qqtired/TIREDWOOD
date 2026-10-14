// Подписи паузы из текущей сборки и тех же рецептов, которыми пользуется симуляция.
import { D, interNum } from '../../shared/dungeon/data.ts';
import { PASSIVES, WEAPONS } from './data.ts';
import type { HudFrame, HudItem } from './hudtypes.ts';

export interface PauseSkill {
  item: HudItem;
  level: string;
  description: string;
  synergy: string;
  detail: string;
  state: 'waiting' | 'ready' | 'evolved';
  recipe: { id: string; name: string; icon: string; kind: 'weapon' | 'passive' | 'evo'; level: number; met: boolean }[];
}

const num = (value: number): string => String(Math.round(value * 100) / 100).replace('.', ',');

export function pauseBuild(frame: Pick<HudFrame, 'weapons' | 'passives' | 'weaponSlots' | 'passiveSlots' | 'temper'>) {
  const recipe = (evo: (typeof D.evolutions)[number] | undefined): PauseSkill['recipe'] => {
    if (!evo) return [];
    const weapon = D.weapons.find((entry) => entry.id === evo.from)!;
    const passive = D.passives.find((entry) => entry.id === evo.with)!;
    const owned = frame.weapons.find((entry) => entry.id === evo.from || entry.id === evo.id);
    const max = weapon.levels.at(-1)!.lv;
    return [
      { id: weapon.id, name: weapon.name, icon: weapon.icon, kind: 'weapon', level: max, met: !!owned?.evo || (owned?.lv ?? 0) >= max },
      { id: passive.id, name: passive.name, icon: passive.icon, kind: 'passive', level: 1, met: frame.passives.some((entry) => entry.id === passive.id && entry.lv >= 1) },
      { id: evo.id, name: evo.name, icon: evo.icon, kind: 'evo', level: 0, met: !!owned?.evo },
    ];
  };
  const weapons: PauseSkill[] = frame.weapons.map((item) => {
    const evo = D.evolutions.find((recipe) => recipe.from === item.id || recipe.id === item.id);
    const weapon = D.weapons.find((weapon) => weapon.id === (evo?.from ?? item.id));
    const catalyst = evo ? D.passives.find((passive) => passive.id === evo.with) : undefined;
    const hasCatalyst = !!catalyst && frame.passives.some((passive) => passive.id === catalyst.id && passive.lv > 0);
    const max = weapon?.levels.at(-1)?.lv ?? item.max;
    const ready = item.lv >= max && hasCatalyst;
    return {
      item, level: item.evo ? 'Эволюция' : `Ур. ${item.lv} / ${max}`,
      description: WEAPONS[item.id]?.text ?? '',
      synergy: evo && weapon && catalyst ? `${weapon.name} ${max} + ${catalyst.name} 1 → ${evo.name}` : '',
      detail: item.evo ? 'Получено' : ready ? 'Готово — найди сундук' : [item.lv < max ? `Подними оружие до ${max}` : '', !hasCatalyst && catalyst ? `Нужен бонус «${catalyst.name}»` : ''].filter(Boolean).join(' · '),
      state: item.evo ? 'evolved' : ready ? 'ready' : 'waiting',
      recipe: recipe(evo),
    };
  });
  const passives: PauseSkill[] = frame.passives.map((item) => {
    const def = D.passives.find((passive) => passive.id === item.id);
    const evo = D.evolutions.find((recipe) => recipe.with === item.id);
    const description = item.val ?? PASSIVES[item.id]?.text ?? '';
    return {
      item, level: `Ур. ${item.lv} / ${def?.max ?? item.max}`,
      description: description + (def?.xp ? ` · опыт +${num(def.xp * item.lv * 100)} %` : ''),
      synergy: evo ? `Для эволюции: ${D.weapons.find((weapon) => weapon.id === evo.from)?.name ?? evo.from} → ${evo.name}` : '',
      detail: '', state: 'waiting', recipe: recipe(evo),
    };
  });
  return {
    weapons, passives,
    weaponFree: Math.max(0, frame.weaponSlots - frame.weapons.length),
    passiveFree: Math.max(0, frame.passiveSlots - frame.passives.length),
    temper: frame.temper ? `Закалка ${frame.temper} / ${D.levelUp.temper.max} · урон +${num(frame.temper * D.levelUp.temper.dmg * 100)} %` : '',
  };
}

const building = (id: string, icon: string, short: string, action: string, cost: string, result: string) => ({
  id, icon, short, name: D.interactables.find((entry) => entry.id === id)?.name as string ?? id,
  action, cost, result, text: `${action} ${cost} ${result}`,
});

export const PAUSE_BUILDINGS = [
  building('altar', 'altar', 'Алтарь', 'Постой в круге.', 'Бесплатно. Дар выбирается случайно.', `Временный бонус на ${interNum('altar', 'duration', 30)} с.`),
  building('spring', 'spring', 'Родник', 'Стой в воде.', `В чаше ${interNum('spring', 'pool', 50)} HP; пополняется за ${interNum('spring', 'refill', 60)} с.`, `Восстанавливает ${interNum('spring', 'heal', 8)} HP/с.`),
  building('forge', 'forge', 'Кузня', 'Постой у горна 3 с. Удары не сбивают отсчёт.', 'Весь опыт полосы; нужно хотя бы полполосы.', '+1 уровень выбранному оружию. Всё на максимуме — Закалка.'),
  building('cursedChest', 'cursedChest', 'Проклятый сундук', 'Постой рядом 1,5 с во время волны.', 'Победи вызванную элиту за 45 с.', 'Сундук с готовой эволюцией или двумя уровнями своих вещей.'),
  building('mapChest', 'chest', 'Сундук', 'Подойди и забери.', '2 на старте; ещё один за каждые 5 волн.', 'Один уровень своей вещи или готовая эволюция. Всё на максимуме — опыт и здоровье.'),
  building('isleChest', 'chest', 'Сундук островка', 'Доберись до островка по броду.', 'На броде движение замедлено.', 'Один уровень своей вещи или готовая эволюция. Новый через 400 с.'),
  building('lamppost', 'lamppost', 'Фонарь-маяк', `Постой рядом ${num(interNum('lamppost', 'lightTime', 1.5))} с.`, 'Бесплатно. Горит до конца забега.', `Каждый фонарь: +${num(interNum('lamppost', 'globalRegen', 0.3))} HP/с по всей карте до конца забега. В свете ещё +${num(interNum('lamppost', 'heroRegen', 1))} HP/с; рядовые и элита замедлены, босс — нет.`),
  building('minecart', 'minecart', 'Вагонетка', 'Толкни с разбега. E — запрыгнуть.', 'Плевки попадают и в вагонетку. Пробел — спрыгнуть.', 'Катится по рельсам, давит и отбрасывает врагов.'),
  building('brazier', 'brazier', 'Жаровня', 'Разбей любым попаданием.', 'Бесплатно. Иногда внутри пусто.', 'Может выпасть опыт, лечение, магнит или другой полезный предмет.'),
  building('powderKegs', 'powderKegs', 'Бочки', 'Попади в бочку — загорится фитиль.', 'Взрыв задевает и тебя: отойди из круга.', `Цепной взрыв радиусом ${interNum('powderKegs', 'radius', 5)} м.`),
  building('trampoline', 'trampoline', 'Гриб-батут', 'Наступи на шляпку.', `Перезарядка ${interNum('trampoline', 'cooldown', 4)} с.`, `Прыжок на ${interNum('trampoline', 'jump', 10)} м через препятствия; приземление бьёт врагов.`),
];

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
}

const num = (value: number): string => String(Math.round(value * 100) / 100).replace('.', ',');

export function pauseBuild(frame: Pick<HudFrame, 'weapons' | 'passives' | 'weaponSlots' | 'passiveSlots' | 'temper'>) {
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
      detail: item.evo ? 'Эволюция получена' : ready ? 'Готово — найди сундук' : [item.lv < max ? `Подними оружие до ${max}` : '', !hasCatalyst && catalyst ? `Нужен бонус «${catalyst.name}»` : ''].filter(Boolean).join(' · '),
      state: item.evo ? 'evolved' : ready ? 'ready' : 'waiting',
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
      detail: '', state: 'waiting',
    };
  });
  return {
    weapons, passives,
    weaponFree: Math.max(0, frame.weaponSlots - frame.weapons.length),
    passiveFree: Math.max(0, frame.passiveSlots - frame.passives.length),
    temper: frame.temper ? `Закалка ${frame.temper} / ${D.levelUp.temper.max} · урон +${num(frame.temper * D.levelUp.temper.dmg * 100)} %` : '',
  };
}

const building = (id: string, icon: string, text: string) => ({
  id, icon, name: D.interactables.find((entry) => entry.id === id)?.name as string ?? id, text,
});

export const PAUSE_BUILDINGS = [
  building('altar', 'altar', `Постой в круге — случайный дар на ${interNum('altar', 'duration', 30)} с.`),
  building('spring', 'spring', `Стой в воде — ${interNum('spring', 'heal', 8)} HP/с, пока в чаше есть вода.`),
  building('forge', 'forge', 'Постой 3 с — +1 уровень оружию. Плата: весь опыт полосы; нужно хотя бы полполосы.'),
  building('cursedChest', 'cursedChest', 'Постой рядом во время волны. Победи вызванную элиту за 45 с — забери сундук.'),
  building('mapChest', 'chest', 'Подойди — одно бесплатное улучшение. Если всё собрано, получишь опыт и здоровье.'),
  building('isleChest', 'chest', 'Два бесплатных улучшения; стоит на островке озера, к нему ведёт брод.'),
  building('lamppost', 'lamppost', 'Постой рядом — зажжётся. Свет замедляет врагов и лечит тебя.'),
  building('minecart', 'minecart', 'Толкни — покатится и снесёт врагов. E — запрыгнуть; плевки попадают и в вагонетку.'),
  building('brazier', 'brazier', 'Разбей — выпадет опыт, лечение, магнит или другой полезный предмет.'),
  building('powderKegs', 'powderKegs', 'Попадание поджигает фитиль. Взрыв задевает врагов, соседние бочки и тебя.'),
  building('trampoline', 'trampoline', 'Наступи — прыжок по ходу движения через препятствия и провалы; приземление бьёт врагов.'),
];

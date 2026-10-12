// Оценка вываживания на экране (04.10, владелец): сколько раз рыба вышла из зоны — столько ошибок, по ним оценка и
// множитель опыта за улов («Идеально» ×2,5 … «Ну ты и червь» ×0,5 — shared/fishreel.ts REEL_GRADES, считает сервер).
// Живой счёт и итог — на шкале (fishgame.ts), строка — в карточке улова (fishcard2.ts). Цвет оценки — класс frg0…frg4
// (fishreel.css): золото, зелёный, голубой, кремовый, розовый — цвета, что уже есть у рыбалки.
import { REEL_GRADES, gradeXp } from '../../shared/fishreel.ts';
import { mul } from './fishfmt.ts';
import './fishreel.css';

/** «без ошибок», «1 ошибка», «3 ошибки», «12 ошибок» */
export function errorsText(n: number): string {
  if (n <= 0) return 'без ошибок';
  const a = n % 100;
  const b = n % 10;
  const word = a > 10 && a < 20 ? 'ошибок' : b === 1 ? 'ошибка' : b > 1 && b < 5 ? 'ошибки' : 'ошибок';
  return `${n} ${word}`;
}

/** Название оценки: «Идеально», «Сойдёт» … */
export function gradeName(grade: number): string {
  return REEL_GRADES[grade]?.name ?? REEL_GRADES[3].name;
}

/** Множитель опыта оценки: «×2,5» */
export function gradeMul(grade: number): string {
  return mul(gradeXp(grade));
}

/** Класс цвета оценки */
export function gradeClass(grade: number): string {
  return `frg${REEL_GRADES[grade] ? grade : 3}`;
}

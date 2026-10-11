// Ряд кнопок лодки Z G R в слоте низ-право HUD кита (lab/ui «Рыбалка» → «8. своя лодка»): якорь и «Продать» ставит
// BoatHud (client/boat/boatui.ts), радио — RadioPanel (client/boat/radiopanel.ts). Модули создаются в любом порядке,
// ряд один на двоих: кто первый — создаёт, второй находит. Порядок кнопок — CSS order (ownboats.css), пустой ряд скрыт.
// Тут нельзя подключать ничего тяжёлого: файл нужен и панели радио без лодки (тестовое /radio).
import type { HudSlots } from '../ui/kit/slots.ts';
import './ownboats.css';

/** Ряд .fi-boatbar в слоте низ-право (создаёт, если ещё нет) */
export function boatBar(slots: HudSlots): HTMLElement {
  const had = slots.br.querySelector<HTMLElement>(':scope > .fi-boatbar');
  if (had) return had;
  const bar = document.createElement('div');
  bar.className = 'fi-boatbar';
  slots.br.append(bar);
  return bar;
}

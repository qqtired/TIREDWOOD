// Своё место рыбалки на клиенте (client/lobby/scene.ts, myFishSpot): по нему «Подсекай!», карточка улова и шкала
// вываживания берут события своего места. Баг «изредка нет „Подсекай!“ и шкалы»: встал шагом и тут же снова сел на то
// же место (W и E почти разом) между двумя снимками сервера — снимок «как было» не менял действие, место не
// переписывалось, а FE_OFF старой посадки приходил после снимка и сбрасывал его в −1: все свои события и fishReel
// отбрасывались до следующей посадки. Теперь место берём из каждого снимка, а FE_OFF не трогает место, где мы снова сидим.
import { ACT_FISH } from '../../shared/lobby.ts';

/** Снимок: сидим с удочкой — место наше (каждый снимок, не только при смене действия). */
export function fishSpotOnSnapshot(cur: number, action: number, arg: number): number {
  return action === ACT_FISH ? arg : cur;
}

/** FE_OFF места spot (action и arg — по последнему снимку): снова сидим там же — место наше, иначе — мест нет. */
export function fishSpotOnOff(cur: number, spot: number, action: number, arg: number): number {
  if (spot !== cur) return cur;
  return action === ACT_FISH && arg === spot ? cur : -1;
}

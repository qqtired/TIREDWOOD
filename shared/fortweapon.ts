import { FORT_MAGAZINE } from './fort.ts';
import { BTN_RELOAD, MAG_SIZE, RELOAD_TICKS, type Input, type PlayerState, type StepEvents } from './sim.ts';

/** Fortress-only hook around the existing marker step, also used during prediction replay. */
export function beforeFortWeapon(s: PlayerState, inp: Input, upgraded: boolean): boolean {
  if (!upgraded) return false;
  const pressed = inp.buttons & ~s.prevButtons;
  const extraReload = s.reloadT === 0 && s.ammo >= MAG_SIZE && s.ammo < FORT_MAGAZINE && (pressed & BTN_RELOAD) !== 0;
  // Marker decrements the timer in this same step. The +1 keeps exactly the normal duration.
  if (extraReload) s.reloadT = RELOAD_TICKS + 1;
  return extraReload;
}

export function afterFortWeapon(s: PlayerState, ev: StepEvents, upgraded: boolean, extraReload: boolean): void {
  if (!upgraded) return;
  if (extraReload) ev.reloadStart = true;
  if (ev.reloaded) s.ammo += FORT_MAGAZINE - MAG_SIZE;
}

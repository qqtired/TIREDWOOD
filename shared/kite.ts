// Общая игрушка набережной. Номер действия и фаза помещаются в существующие hp/armor снимка.
import { clamp } from './math.ts';

export const ACT_KITE = 22;
export const KITE_LAUNCH_TICKS = 150;
export const KITE_REEL_FIRST = 151;
export const KITE_REEL_TICKS = 72;
export const KITE_REEL_END = KITE_REEL_FIRST + KITE_REEL_TICKS;

/** Длина выпущенной нити до плавного easing; 0 в снимке — установившийся полёт. */
export function kiteAmount(arg: number): number {
  if (arg === 0) return 1;
  if (arg < KITE_REEL_FIRST) return clamp((arg - 1) / (KITE_LAUNCH_TICKS - 1), 0, 1);
  return clamp(1 - (arg - KITE_REEL_FIRST) / KITE_REEL_TICKS, 0, 1);
}

/** Смотать с текущей длины, даже если запуск ещё не закончился. */
export function kiteReel(arg: number): number {
  return KITE_REEL_FIRST + Math.round((1 - kiteAmount(arg)) * KITE_REEL_TICKS);
}

/** Один серверный тик; -1 — игрушка уже в руках и действие закончено. */
export function kiteTick(arg: number): number {
  if (arg === 0) return 0;
  if (arg < KITE_REEL_FIRST) return arg >= KITE_LAUNCH_TICKS ? 0 : arg + 1;
  return arg >= KITE_REEL_END ? -1 : arg + 1;
}

/** Ветер общий по времени комнаты, разнообразие — по слоту. Никакой физики ткани или сетевых кадров полёта. */
export function kiteOffset(yaw: number, pitch: number, time: number, slot: number, out: { x: number; y: number; z: number }): void {
  const phase = slot * 1.71;
  const gust = Math.sin(time * 0.63 + phase) * 0.16 + Math.sin(time * 1.83 + phase) * 0.045;
  const heading = yaw + gust;
  const elevation = 0.44 + clamp(pitch, -0.65, 0.55) * 0.34 + Math.sin(time * 1.15 + phase) * 0.035;
  const reach = 7.2 * Math.cos(elevation);
  out.x = -Math.sin(heading) * reach;
  out.y = 7.2 * Math.sin(elevation);
  out.z = -Math.cos(heading) * reach;
}

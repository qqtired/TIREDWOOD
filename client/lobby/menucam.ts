// Камера меню входа (вход 3.0, client/ui/entry3.ts): медленный пролёт высоко над западным краем набережной — туда
// и обратно, с плавным разгоном и торможением. Сверху колесо обозрения не закрывает надпись TIREDWOOD на холме, а тёмное
// табло регаты уходит за правый край; в кадре — «Ракушка», колесо, ротонда, площадь, город на склоне, море и надпись.
// Точки подобраны снимками из игры (docs/ui3/entry.md).
type V3 = readonly [number, number, number];

/** Кривая пролёта (квадратичная: через середину не проходит, поэтому без излома) — с запада к морю */
const FROM: V3 = [-36, 25, 18];
const MID: V3 = [-31, 27, 24];
const TO: V3 = [-26, 27, 29];
/** Середина надписи TIREDWOOD на холме (снято из игры: белые буквы — один меш, его середина) */
const SIGN: V3 = [585, 75, -190];
/** Секунд на проход в одну сторону */
const LEG_S = 45;
/** Камера смотрит вниз на площадь: надпись — в верхней трети, внизу — «Ракушка» и площадь */
const PITCH = (-12 * Math.PI) / 180;

/** Обзор по вертикали: на широком экране — 50°, на узком (телефон стоя) шире, чтобы надпись не обрезало */
export function menuFov(aspect: number): number {
  return aspect >= 1.2 ? 50 : aspect >= 0.9 ? 60 : 72;
}

interface Settable { set(x: number, y: number, z: number): unknown }

/**
 * Камера меню в момент t (секунды с начала облёта): позиция — в pos, точка взгляда — в look.
 * На широком экране надпись сдвинута вправо на 14°: слева её закрыла бы карточка входа.
 */
export function menuPose(t: number, aspect: number, pos: Settable, look: Settable): void {
  const u = ((t / LEG_S) % 2 + 2) % 2;
  const k = u <= 1 ? u : 2 - u;
  const s = k * k * (3 - 2 * k);
  const a = (1 - s) * (1 - s), b = 2 * (1 - s) * s, c = s * s;
  const x = a * FROM[0] + b * MID[0] + c * TO[0];
  const y = a * FROM[1] + b * MID[1] + c * TO[1];
  const z = a * FROM[2] + b * MID[2] + c * TO[2];
  pos.set(x, y, z);
  const bearing = Math.atan2(SIGN[2] - z, SIGN[0] - x) - (aspect >= 1.2 ? (14 * Math.PI) / 180 : 0);
  look.set(x + Math.cos(bearing) * 200, y + Math.tan(PITCH) * 200, z + Math.sin(bearing) * 200);
}

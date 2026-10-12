// Камера на трассу крысиных бегов (флаг RATRACE): во время забега — сверху, над головами, чтобы желейки у арены (и своя)
// не закрывали дорожку. Включается сама, когда у этого игрока начался забег, а он стоит рядом с ареной (не идёт; можно
// сидеть на скамейке или махать). C (на телефоне — кнопка 🎥 в плашке) — включить или выключить; шаг или прыжок —
// обычный вид до следующего забега. После финиша держится ещё HOLD_MS — посмотреть победителя — и возвращает вид сам.
import { RAT_PEN, RAT_TRACK } from '../../shared/ratrace.ts';
import { BTN_BACK, BTN_FORWARD, BTN_JUMP, BTN_LEFT, BTN_RIGHT } from '../../shared/sim.ts';
import { narrowFov } from '../render/renderer.ts';

/** После финиша камера ещё на трассе, мс */
const HOLD_MS = 3500;
/** Включается и работает не дальше этого от середины арены, м (как плашка) */
const NEAR_M = 14;
/** Вертикальное поле зрения на широком экране, градусов (узкое — «телевик» издалека; на узком экране camera.ts расширит) */
const FOV = 30;
/**
 * Взгляд сверху вниз: наклон, рад; от точки взгляда до камеры, м (на узком экране — дальше, чтобы влезла вся арена).
 * Круто сверху — чтобы желейки у бортика (ставят и болеют с площади, с севера) не закрывали переднюю прямую с финишем:
 * от ближнего края дорожки камера видна под ~77°, а голова у точки ставки — под ~68°.
 */
const PITCH = (68 * Math.PI) / 180;
const DIST = 9.2;
/** Куда смотрим: середина арены */
const LOOK = { x: RAT_TRACK.x, y: 0.15, z: RAT_TRACK.z + 0.05 };
/** Половина ширины кадра, которая должна влезть: бортик и чуть запаса, м */
const HALF_W = (RAT_PEN.x1 - RAT_PEN.x0) / 2 + 0.35;
/** Кнопки движения: нажал — камера возвращается за спину */
export const RAT_CAM_MOVE = BTN_FORWARD | BTN_BACK | BTN_LEFT | BTN_RIGHT | BTN_JUMP;

export interface RatCamInput {
  /** Идёт ли забег у этого игрока (по своим часам) и его номер */
  running: boolean;
  race: number;
  /** Приём ставок (отсчёт до старта) — камеру можно включить заранее */
  open: boolean;
  /** До середины арены, м */
  dist: number;
  /** Свободен: стоит, сидит на скамейке, машет — не за столом, не в лодке, не на колесе */
  free: boolean;
  /** Жмёт движение (шаг, прыжок) */
  moving: boolean;
}

export interface RatCamPose { px: number; py: number; pz: number; tx: number; ty: number; tz: number; fov: number }

export class RatRaceCam {
  /** Камера сейчас на трассе */
  active = false;
  /** Можно ли сейчас поставить камеру на трассу (C / кнопка) */
  avail = false;
  /** Забег, в котором камера уже включалась сама (второй раз за забег сама не включится) */
  private autoRace = 0;
  /** Когда у этого игрока закончился забег (performance.now), −1 — не кончался */
  private endedAt = -1;
  private wasRunning = false;
  private readonly out: RatCamPose = { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0, fov: FOV };

  update(o: RatCamInput, now: number): void {
    const ok = o.dist <= NEAR_M && o.free;
    if (o.running && !this.wasRunning) this.endedAt = -1;
    if (!o.running && this.wasRunning) this.endedAt = now;
    this.wasRunning = o.running;
    const hold = this.endedAt >= 0 && now - this.endedAt < HOLD_MS;
    this.avail = ok && (o.open || o.running || hold);
    // забег начался у меня, а я стою рядом — сама
    if (o.running && this.autoRace !== o.race && ok && !o.moving) {
      this.autoRace = o.race;
      this.active = true;
    }
    if (!this.active) return;
    // выход: пошёл, отошёл или занялся другим; после финиша — когда посмотрели на победителя
    if (o.moving || !ok || (!o.running && this.endedAt >= 0 && !hold)) this.active = false;
  }

  /**
   * C или кнопка: включить (если можно) или выключить. race — забег, который бежит или на который идёт приём ставок:
   * выключил — сама в нём больше не включится (0 — после финиша: просто выключить).
   */
  toggle(race: number): void {
    if (this.active) {
      this.active = false;
      if (race > 0) this.autoRace = race;
    } else if (this.avail) {
      this.active = true;
      if (!this.wasRunning) this.endedAt = -1;
    }
  }

  /** Выход из сцены: всё сначала */
  reset(): void {
    this.active = false;
    this.avail = false;
    this.wasRunning = false;
    this.endedAt = -1;
  }

  /** Откуда и куда смотреть: с площади сверху на арену; aspect — ширина / высота кадра */
  pose(aspect: number): RatCamPose {
    const vfov = narrowFov(FOV, aspect);
    // по ширине должна влезть вся арена: на узком экране отъезжаем дальше
    const halfH = Math.atan(Math.tan(((vfov / 2) * Math.PI) / 180) * aspect);
    const d = Math.max(DIST, HALF_W / Math.tan(halfH) + 0.6);
    const o = this.out;
    o.tx = LOOK.x; o.ty = LOOK.y; o.tz = LOOK.z;
    o.px = LOOK.x;
    o.py = LOOK.y + Math.sin(PITCH) * d;
    o.pz = LOOK.z - Math.cos(PITCH) * d;
    o.fov = FOV;
    return o;
  }
}
